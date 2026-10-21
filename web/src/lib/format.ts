import type { FormaPagamento, StatusNota } from './tipos';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Centavos inteiros → "R$ 1.234,56". */
export const reais = (centavos: number): string => brl.format(centavos / 100);

/** "1.234,56" | "1.234" (milhar) | "1234.56" | "400" → centavos inteiros; null se não for um valor. */
export function centavosDe(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$\s*/, '');
  if (!/^\d+([.,]\d+)*$/.test(limpo)) return null; // só dígitos e separadores: nada de hex, expoente ou sinal
  if (limpo.includes(',') && !/,\d{1,2}$/.test(limpo)) return null; // vírgula só como decimal, com 1 ou 2 casas
  const normal = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(limpo)
      ? limpo.replace(/\./g, '') // "1.234" sem vírgula é milhar, não R$ 1,23
      : limpo;
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** "12,3 mil" para o rótulo curto das barras; o valor inteiro vai no aria-label. */
export const compacto = (centavos: number): string => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(centavos / 100);

/** `reais()` sem o "R$ " (o componente Dinheiro desenha o cifrão à parte). */
export const semCifrao = (centavos: number): string => reais(centavos).replace(/^R\$\s*/, '');

/** "+12% sobre setembro", "−8% sobre setembro", "igual a setembro" ou "setembro sem notas". */
export function fraseVariacao(atual: number, anterior: number, mesAnterior: string): string {
  if (anterior === 0) return atual === 0 ? `igual a ${mesAnterior}` : `${mesAnterior} sem notas`;
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  if (pct === 0) return `igual a ${mesAnterior}`;
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% sobre ${mesAnterior}`;
}

/** "1 nota" / "N notas". */
export const notas = (n: number): string => (n === 1 ? '1 nota' : `${n} notas`);

/** "Clínica São João LTDA" → "clinica-sao-joao-ltda": identificador da empresa (pasta em empresas/ e nome da variável do token). */
export const slug = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');

export const cpf = (d: string) => d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
export const cnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

export function documento(p: { cpf?: string | null; cnpj?: string | null; foreignDocument?: string | null }): string {
  if (p.cpf) return `CPF ${cpf(p.cpf)}`;
  if (p.cnpj) return `CNPJ ${cnpj(p.cnpj)}`;
  if (p.foreignDocument) return `Doc. ${p.foreignDocument}`;
  return 'sem documento';
}

export const dataCurta = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';

export const dataHora = (iso: string): string => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const STATUS: Record<StatusNota, { rotulo: string; cor: string }> = {
  DRAFT: { rotulo: 'Rascunho', cor: 'status-draft' },
  READY: { rotulo: 'Pronta', cor: 'status-ready' },
  SUBMITTING: { rotulo: 'Enviando', cor: 'status-processing' },
  PROCESSING: { rotulo: 'Processando', cor: 'status-processing' },
  AUTHORIZED: { rotulo: 'Emitida', cor: 'status-authorized' },
  REJECTED: { rotulo: 'Erro', cor: 'status-rejected' },
  CANCELLATION_REQUESTED: { rotulo: 'Cancelando', cor: 'status-processing' },
  CANCELLED: { rotulo: 'Cancelada', cor: 'status-cancelled' },
  CANCELLATION_ERROR: { rotulo: 'Erro no cancelamento', cor: 'status-rejected' },
};

export const EDITAVEL: ReadonlySet<StatusNota> = new Set(['DRAFT', 'READY']);

export const FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  PIX: 'Pix', CREDIT_CARD: 'Cartão de crédito', DEBIT_CARD: 'Cartão de débito', TRANSFER: 'Transferência', CASH: 'Dinheiro', HEALTH_PLAN: 'Convênio',
};
export const FORMAS = Object.keys(FORMA_PAGAMENTO) as FormaPagamento[];

/** "Pix" quando é um só; "Pix R$ 300,00 + Cartão de crédito R$ 200,00" quando há mais de um. */
export function rotuloPagamentos(p: { method: FormaPagamento; amountCents: number }[]): string {
  if (p.length === 0) return 'Não informado';
  if (p.length === 1) return FORMA_PAGAMENTO[p[0]!.method];
  return p.map((x) => `${FORMA_PAGAMENTO[x.method]} ${reais(x.amountCents)}`).join(' + ');
}

const SP = 'America/Sao_Paulo';
export const dataEmissao = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR', { timeZone: SP });

/** "dd/mm/aaaa" de hoje na clínica. */
export const dataHoje = (): string => new Date().toLocaleDateString('pt-BR', { timeZone: SP });

/** "terça-feira, 21 de outubro" de hoje na clínica. */
export const hojePorExtenso = (): string => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: SP });

/** Hora cheia (0–23) de agora na clínica. */
export const horaAgora = (): number => Number(new Intl.DateTimeFormat('en-US', { timeZone: SP, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));

/** "AAAA-MM" do mês corrente na clínica. */
export const mesAtual = (): string => new Intl.DateTimeFormat('sv-SE', { timeZone: SP, year: 'numeric', month: '2-digit' }).format(new Date());

export function nomeMes(mes: string, comAno = false): string {
  const s = new Date(`${mes}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', ...(comAno ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
