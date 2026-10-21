/** Relatório mensal de notas no fisco: uma linha por nota, com totais por forma de pagamento. */
import type { PrismaClient } from '../../db/client.ts';
import type { InvoiceStatus, PaymentMethod } from '../../generated/prisma/client.ts';
import { PAYMENT_METHODS, paymentsMismatch } from '../invoices/invoice-rules.ts';
import { AT_FISCO, VALID_AT_FISCO, monthBounds } from '../invoices/period.ts';
import type { Tally } from './summary.ts';

export type Situation = 'issued' | 'cancelled' | 'all';
export type ReportFilters = { month: string; companyId?: string | undefined; payment?: PaymentMethod | 'none' | undefined; situation: Situation };
export type ReportRow = {
  id: string;
  issuedAt: string;
  number: string | null;
  verificationCode: string | null;
  company: { id: string; name: string; slug: string };
  patient: { name: string; document: string };
  professional: string;
  services: string;
  totalCents: number;
  payments: { method: PaymentMethod; amountCents: number }[];
  status: InvoiceStatus;
  competenceDate: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
};
export type ReportTotals = { issued: Tally; cancelled: Tally; byMethod: Record<PaymentMethod, number>; unassigned: Tally; mismatched: Tally };
export type Report = { month: string; truncated: boolean; rows: ReportRow[]; totals: ReportTotals };

export const REPORT_ROW_CAP = 2000;

const digits = (s: string): string => s.replace(/\D/g, '');

/** CPF `123.456.789-00`, CNPJ `12.345.678/0001-95`, documento estrangeiro como veio, ou ''. */
export function formatDocument(p: { cpf: string | null; cnpj: string | null; foreignDocument: string | null }): string {
  if (p.cpf) return digits(p.cpf).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  if (p.cnpj) return digits(p.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return p.foreignDocument ?? '';
}

const ZERO = (): Tally => ({ count: 0, cents: 0 });
const add = (t: Tally, cents: number): void => { t.count += 1; t.cents += cents; };

export async function invoiceReport(prisma: PrismaClient, f: ReportFilters): Promise<Report> {
  const { start, end } = monthBounds(f.month);
  const status = f.situation === 'issued' ? [...VALID_AT_FISCO] : f.situation === 'cancelled' ? ['CANCELLED' as const] : [...AT_FISCO];
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: status },
      submittedAt: { gte: start, lt: end },
      ...(f.companyId ? { companyId: f.companyId } : {}),
      ...(f.payment === 'none' ? { payments: { none: {} } } : f.payment ? { payments: { some: { method: f.payment } } } : {}),
    },
    orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    // ponytail: carrega todas as notas do mês para os totais saírem completos; ok no volume da clínica, agregue no SQL se o mês chegar a dezenas de milhares.
    include: {
      items: { select: { serviceNameSnapshot: true }, orderBy: { sortOrder: 'asc' } },
      payments: { orderBy: { sortOrder: 'asc' } },
      patient: { select: { name: true, cpf: true, cnpj: true, foreignDocument: true } },
      company: { select: { id: true, slug: true, legalName: true, tradeName: true } },
    },
  });
  const truncated = invoices.length > REPORT_ROW_CAP;

  const totals: ReportTotals = {
    issued: ZERO(),
    cancelled: ZERO(),
    byMethod: Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number>,
    unassigned: ZERO(),
    mismatched: ZERO(),
  };
  for (const n of invoices) {
    if (n.status === 'CANCELLED') { add(totals.cancelled, n.totalAmountCents); continue; }
    add(totals.issued, n.totalAmountCents);
    for (const p of n.payments) totals.byMethod[p.method] += p.amountCents;
    if (n.payments.length === 0) add(totals.unassigned, n.totalAmountCents);
    if (paymentsMismatch(n.payments, n.totalAmountCents)) add(totals.mismatched, n.totalAmountCents);
  }

  const rows: ReportRow[] = (truncated ? invoices.slice(0, REPORT_ROW_CAP) : invoices).map((n) => ({
    id: n.id,
    issuedAt: n.submittedAt!.toISOString(),
    number: n.externalNumber,
    verificationCode: n.externalVerificationCode,
    company: { id: n.company.id, name: n.company.tradeName ?? n.company.legalName, slug: n.company.slug },
    patient: { name: n.patient.name, document: formatDocument(n.patient) },
    professional: n.professionalNameSnapshot,
    services: n.items.map((i) => i.serviceNameSnapshot).join(', '),
    totalCents: n.totalAmountCents,
    payments: n.payments.map((p) => ({ method: p.method, amountCents: p.amountCents })),
    status: n.status,
    competenceDate: n.competenceDate ? n.competenceDate.toISOString().slice(0, 10) : null,
    pdfUrl: n.pdfUrl,
    xmlUrl: n.xmlUrl,
  }));
  return { month: f.month, truncated, rows, totals };
}
