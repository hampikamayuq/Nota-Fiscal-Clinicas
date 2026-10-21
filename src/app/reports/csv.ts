/** CSV do relatório mensal para o contador: Excel brasileiro (BOM, `;`, vírgula decimal, CRLF). */
import { PAYMENT_METHODS } from '../invoices/invoice-rules.ts';
import { dateSP } from '../invoices/period.ts';
import type { PaymentMethod } from '../../generated/prisma/client.ts';
import type { Report } from './invoice-report.ts';

export const CSV_HEADER = ['Emissão', 'Número', 'Código de verificação', 'Empresa', 'Paciente', 'Documento', 'Profissional', 'Serviços', 'Valor', 'Pix', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Dinheiro', 'Convênio', 'Situação', 'Competência', 'PDF', 'XML'];

const SITUACAO: Record<string, string> = { AUTHORIZED: 'Emitida', CANCELLATION_REQUESTED: 'Cancelando', CANCELLATION_ERROR: 'Erro no cancelamento', CANCELLED: 'Cancelada' };

/** Texto que o Excel executaria como fórmula (=, +, -, @, tab, CR) ganha `'` na frente; valores em reais nunca começam assim. */
const celula = (bruto: string): string => {
  const s = /^[=+\-@\t\r]/.test(bruto) ? `'${bruto}` : bruto;
  return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const reais = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');
const linha = (cells: string[]): string => cells.map(celula).join(';');

export function paraCsv(report: Report): string {
  const rows = report.rows.map((n) => {
    const porForma = (m: PaymentMethod): string => {
      const ps = n.payments.filter((p) => p.method === m);
      return ps.length ? reais(ps.reduce((s, p) => s + p.amountCents, 0)) : '';
    };
    return linha([
      dateSP(new Date(n.issuedAt)), n.number ?? '', n.verificationCode ?? '', n.company.name, n.patient.name, n.patient.document, n.professional, n.services,
      reais(n.totalCents), ...PAYMENT_METHODS.map(porForma), SITUACAO[n.status] ?? n.status,
      n.competenceDate ? n.competenceDate.split('-').reverse().join('/') : '', n.pdfUrl ?? '', n.xmlUrl ?? '',
    ]);
  });
  const t = report.totals;
  const total = linha(['Total emitido', '', '', '', '', '', '', '', reais(t.issued.cents), ...PAYMENT_METHODS.map((m) => reais(t.byMethod[m])), '', '', '', '']);
  return '\uFEFF' + [CSV_HEADER.join(';'), ...rows, total].join('\r\n') + '\r\n';
}

export const nomeArquivo = (month: string, slug?: string): string => `notas-${month}${slug ? `-${slug}` : ''}.csv`;
