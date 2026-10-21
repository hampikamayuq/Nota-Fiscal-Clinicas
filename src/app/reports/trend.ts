/** Emitido por mês e por empresa nos últimos N meses (valores em centavos), com a mesma régua de `summary.ts`. */
import { Prisma } from '../../generated/prisma/client.ts';
import type { PrismaClient } from '../../db/client.ts';
import { MONTH_RE, SP_OFFSET_MIN, VALID_AT_FISCO, monthBounds, previousMonth } from '../invoices/period.ts';
import type { Tally } from './summary.ts';

export type TrendMonth = { month: string; issued: Tally };
export type CompanyTrend = { companyId: string; name: string; months: TrendMonth[] };
export type Trend = { until: string; months: string[]; companies: CompanyTrend[] };

type Row = { companyId: string; month: string; count: number; cents: number };

/** `count` meses `'AAAA-MM'` em ordem crescente, o último sendo `until`. */
export function monthsEndingAt(until: string, count: number): string[] {
  if (!MONTH_RE.test(until)) throw new RangeError('Mês no formato AAAA-MM');
  const out = [until];
  while (out.length < count) out.unshift(previousMonth(out[0]!));
  return out;
}

/** Uma série por empresa, com zero onde não há linha; linhas fora de `months` são ignoradas. */
export function fillTrend(months: string[], companies: { id: string; name: string }[], rows: Row[]): CompanyTrend[] {
  // ponytail: busca linear; são 12 meses × 2 empresas.
  const de = (companyId: string, month: string): Tally => {
    const r = rows.find((x) => x.companyId === companyId && x.month === month);
    return r ? { count: r.count, cents: r.cents } : { count: 0, cents: 0 };
  };
  return companies.map((c) => ({ companyId: c.id, name: c.name, months: months.map((month) => ({ month, issued: de(c.id, month) })) }));
}

export async function monthlyTrend(prisma: PrismaClient, until: string, count: number): Promise<Trend> {
  const months = monthsEndingAt(until, count);
  const start = monthBounds(months[0]!).start;
  const end = monthBounds(until).end;
  // ponytail: a soma sai como int4 (até R$ 21 milhões por mês e empresa); passe a bigint/Number se a clínica chegar lá.
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT "companyId",
           to_char(date_trunc('month', "submittedAt" + ${SP_OFFSET_MIN} * interval '1 minute'), 'YYYY-MM') AS month,
           COUNT(*)::int AS count,
           COALESCE(SUM("totalAmountCents"), 0)::int AS cents
    FROM "Invoice"
    WHERE "status"::text IN (${Prisma.join([...VALID_AT_FISCO])})
      AND "submittedAt" >= ${start} AND "submittedAt" < ${end}
    GROUP BY 1, 2`;
  const empresas = await prisma.company.findMany({ orderBy: { legalName: 'asc' } });
  const companies = empresas.map((e) => ({ id: e.id, name: e.tradeName ?? e.legalName }));
  return { until, months, companies: fillTrend(months, companies, rows) };
}
