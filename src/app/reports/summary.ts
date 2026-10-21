/** Resumo mensal por empresa, calculado no servidor (valores em centavos). */
import type { PrismaClient } from '../../db/client.ts';
import { VALID_AT_FISCO, currentMonth, dayBounds, monthBounds, previousMonth } from '../invoices/period.ts';

export type Tally = { count: number; cents: number };
export type CompanySummary = { companyId: string; name: string; issued: Tally; cancelled: Tally; previous: Tally };
export type Summary = {
  month: string;
  previousMonth: string;
  companies: CompanySummary[];
  total: { issued: Tally; cancelled: Tally; previous: Tally };
  today: Tally;
  processing: number;
  errors: number;
  open: number;
};

const ZERO: Tally = { count: 0, cents: 0 };
const somar = (a: Tally, b: Tally): Tally => ({ count: a.count + b.count, cents: a.cents + b.cents });

type Grupo = { companyId: string; _count: { _all: number }; _sum: { totalAmountCents: number | null } };
const porEmpresa = (grupos: Grupo[]): Map<string, Tally> =>
  new Map(grupos.map((g) => [g.companyId, { count: g._count._all, cents: g._sum.totalAmountCents ?? 0 }]));

export async function monthlySummary(prisma: PrismaClient, month: string, now: Date = new Date()): Promise<Summary> {
  const prev = previousMonth(month);
  const { start, end } = monthBounds(month);
  const antes = monthBounds(prev);
  const agrupar = (where: object) =>
    prisma.invoice.groupBy({ by: ['companyId'], where, _count: { _all: true }, _sum: { totalAmountCents: true } });
  const validas = [...VALID_AT_FISCO];
  const hoje = dayBounds(now);

  const [issued, previous, cancelled, porStatus, today, empresas] = await Promise.all([
    agrupar({ status: { in: validas }, submittedAt: { gte: start, lt: end } }),
    agrupar({ status: { in: validas }, submittedAt: { gte: antes.start, lt: antes.end } }),
    agrupar({ status: 'CANCELLED', cancelledAt: { gte: start, lt: end } }),
    prisma.invoice.groupBy({ by: ['status'], _count: { _all: true } }),
    month === currentMonth(now)
      ? prisma.invoice.aggregate({ where: { status: { in: validas }, submittedAt: { gte: hoje.start, lt: hoje.end } }, _count: { _all: true }, _sum: { totalAmountCents: true } })
      : null,
    prisma.company.findMany({ orderBy: { legalName: 'asc' } }),
  ]);

  const [i, p, c] = [porEmpresa(issued), porEmpresa(previous), porEmpresa(cancelled)];
  const companies = empresas.map((e) => ({ companyId: e.id, name: e.tradeName ?? e.legalName, issued: i.get(e.id) ?? ZERO, cancelled: c.get(e.id) ?? ZERO, previous: p.get(e.id) ?? ZERO }));

  const contar = (...status: string[]) => porStatus.filter((g) => status.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  return {
    month,
    previousMonth: prev,
    companies,
    total: {
      issued: companies.reduce((t, e) => somar(t, e.issued), ZERO),
      cancelled: companies.reduce((t, e) => somar(t, e.cancelled), ZERO),
      previous: companies.reduce((t, e) => somar(t, e.previous), ZERO),
    },
    today: today ? { count: today._count._all, cents: today._sum.totalAmountCents ?? 0 } : ZERO,
    processing: contar('SUBMITTING', 'PROCESSING', 'CANCELLATION_REQUESTED'),
    errors: contar('REJECTED', 'CANCELLATION_ERROR'),
    open: contar('DRAFT', 'READY'),
  };
}
