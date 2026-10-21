/**
 * Regras puras da nota — sem banco, sem provedor.
 *
 * Totais, imutabilidade, máquina de estados e snapshots. O `InvoiceService`
 * aplica; aqui só se decide. Tudo que a recepção pode ou não fazer com uma
 * nota está nestas funções, e todas são testáveis em memória.
 */

import type { InvoiceStatus, PaymentMethod } from '../../generated/prisma/client.ts';

/** Regra de negócio violada. É erro de operação: a UI mostra a mensagem. */
export class InvoiceRuleError extends Error {
  override name = 'InvoiceRuleError';
}

// ─── Totais ──────────────────────────────────────────────────────────────────

/** Teto do Int de 32 bits do Postgres: R$ 21.474.836,47. BigInt no schema se um dia precisar. */
export const MAX_CENTS = 2_147_483_647;

export function itemTotalCents(quantity: number, unitAmountCents: number): number {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new InvoiceRuleError(`Quantidade inválida: ${quantity}. Use um inteiro a partir de 1.`);
  }
  if (!Number.isInteger(unitAmountCents) || unitAmountCents < 0) {
    throw new InvoiceRuleError(`Valor unitário inválido: ${unitAmountCents}. Use centavos inteiros, zero ou mais.`);
  }
  const total = quantity * unitAmountCents;
  if (total > MAX_CENTS) throw new InvoiceRuleError('Valor do item acima do limite de R$ 21.474.836,47.');
  return total;
}

export function invoiceTotalCents(items: ReadonlyArray<{ totalAmountCents: number }>): number {
  const total = items.reduce((soma, item) => soma + item.totalAmountCents, 0);
  if (total > MAX_CENTS) throw new InvoiceRuleError('Valor da nota acima do limite de R$ 21.474.836,47.');
  return total;
}

// ─── Pagamentos ──────────────────────────────────────────────────────────────

/** Ordem de exibição: Pix, Cartão de crédito, Cartão de débito, Transferência, Dinheiro, Convênio. */
export const PAYMENT_METHODS = ['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'TRANSFER', 'CASH', 'HEALTH_PLAN'] as const satisfies readonly PaymentMethod[];

export const MAX_PAYMENTS = 6;

export type PaymentInput = { method: PaymentMethod; amountCents: number };

export const reaisBR = (cents: number): string => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const sumCents = (payments: readonly { amountCents: number }[]): number => payments.reduce((soma, p) => soma + p.amountCents, 0);

/** Lista vazia = "não informado" e passa; com pagamentos, a soma tem de fechar com o total da nota. */
export function assertPaymentsMatchTotal(payments: readonly PaymentInput[], totalCents: number): void {
  if (payments.length > MAX_PAYMENTS) {
    throw new InvoiceRuleError(`No máximo ${MAX_PAYMENTS} formas de pagamento por nota.`);
  }
  for (const { amountCents: v } of payments) {
    if (!Number.isInteger(v) || v < 0) {
      throw new InvoiceRuleError(`Valor de pagamento inválido: ${v}. Use centavos inteiros, zero ou mais.`);
    }
  }
  if (paymentsMismatch(payments, totalCents)) {
    throw new InvoiceRuleError(
      `A soma dos pagamentos (${reaisBR(sumCents(payments))}) precisa ser igual ao total da nota (${reaisBR(totalCents)}).`,
    );
  }
}

/** `true` só quando há pagamentos e a soma difere do total (nota editada depois de informar pagamento). */
export function paymentsMismatch(payments: readonly { amountCents: number }[], totalCents: number): boolean {
  return payments.length > 0 && sumCents(payments) !== totalCents;
}

// ─── Imutabilidade e transições ──────────────────────────────────────────────

export const EDITABLE_STATUSES: readonly InvoiceStatus[] = ['DRAFT', 'READY'];

export function isEditable(status: InvoiceStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function assertEditable(status: InvoiceStatus): void {
  if (!isEditable(status)) {
    throw new InvoiceRuleError(
      `Nota em ${status} não pode ser alterada. Só rascunho (DRAFT) e pronta (READY) aceitam edição; ` +
        'depois disso o caminho é cancelar e emitir outra.',
    );
  }
}

/** Para onde cada estado pode ir (plano, §22 e §28–31). REJECTED volta a DRAFT para corrigir e reenviar. */
export const TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  DRAFT: ['READY'],
  READY: ['DRAFT', 'SUBMITTING'],
  SUBMITTING: ['PROCESSING', 'AUTHORIZED', 'REJECTED', 'READY'],
  PROCESSING: ['AUTHORIZED', 'REJECTED'],
  AUTHORIZED: ['CANCELLATION_REQUESTED'],
  REJECTED: ['DRAFT'],
  CANCELLATION_REQUESTED: ['CANCELLED', 'CANCELLATION_ERROR'],
  CANCELLED: [],
  CANCELLATION_ERROR: ['CANCELLATION_REQUESTED', 'CANCELLED'],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!canTransition(from, to)) {
    throw new InvoiceRuleError(`Nota em ${from} não pode ir para ${to}.`);
  }
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

export type ProfessionalSnapshot = {
  professionalNameSnapshot: string;
  professionalCouncilSnapshot: string;
  professionalCrmSnapshot: string;
  professionalCrmStateSnapshot: string;
  professionalRqeSnapshot: string | null;
  professionalSpecialtySnapshot: string | null;
};

export function professionalSnapshot(
  p: { name: string; council: string; crmNumber: string; crmState: string; specialty: string | null },
  rqes: ReadonlyArray<{ number: string; specialty: string }>,
): ProfessionalSnapshot {
  // Com um RQE só, o número basta. Com mais de um, cada número diz de qual
  // especialidade é, a principal do profissional primeiro: "33333 (Dermatologia), 22222 (Pediatria)".
  const ativos = [...rqes].sort((a, b) => Number(b.specialty === p.specialty) - Number(a.specialty === p.specialty) || a.number.localeCompare(b.number));
  const rqe = ativos.length === 1 ? ativos[0]!.number : ativos.map((r) => `${r.number} (${r.specialty})`).join(', ');
  return {
    professionalNameSnapshot: p.name,
    professionalCouncilSnapshot: p.council,
    professionalCrmSnapshot: p.crmNumber,
    professionalCrmStateSnapshot: p.crmState,
    professionalRqeSnapshot: rqe || null,
    professionalSpecialtySnapshot: p.specialty,
  };
}

export type TemplateForSnapshot = {
  id: string;
  name: string;
  defaultDescription: string;
  tussCode: string | null;
  tussVersion: string | null;
  defaultAmountCents: number;
  allowDescriptionEdit: boolean;
  allowAmountEdit: boolean;
};

/** O que da CompanyServiceFiscalConfig vai congelado no item. */
export type FiscalConfigSnapshot = {
  nationalTaxCode: string;
  municipalTaxCode: string | null;
  nbsCode: string | null;
  issRate: string | null;
  taxationType: string;
  issWithholdingType: string;
  pisCofins: unknown;
  ibsCbs: unknown;
  additional: unknown;
};

/** O que a recepção pode mudar num item (plano, §13). `tussCode: null` apaga o TUSS. */
export type ItemOverrides = {
  name?: string;
  description?: string;
  tussCode?: string | null;
  quantity?: number;
  unitAmountCents?: number;
};

export type ItemSnapshot = {
  serviceTemplateId: string;
  serviceNameSnapshot: string;
  descriptionSnapshot: string;
  tussCodeSnapshot: string | null;
  tussVersionSnapshot: string | null;
  quantity: number;
  unitAmountCents: number;
  totalAmountCents: number;
  fiscalConfigSnapshotJson: FiscalConfigSnapshot | null;
};

export function assertOverridesAllowed(
  template: Pick<TemplateForSnapshot, 'name' | 'allowDescriptionEdit' | 'allowAmountEdit'>,
  o: ItemOverrides,
): void {
  if (!template.allowDescriptionEdit && o.description !== undefined) {
    throw new InvoiceRuleError(`"${template.name}" não permite alterar a descrição.`);
  }
  if (!template.allowAmountEdit && o.unitAmountCents !== undefined) {
    throw new InvoiceRuleError(`"${template.name}" não permite alterar o valor.`);
  }
}

/** Tira de `o` as chaves cujo valor é igual ao de `base`: mandar o valor atual não é alterar (o diálogo manda todos os campos). */
export function semIguais<T extends object>(o: T, base: { [K in keyof T]?: unknown }): T {
  return Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== (base as Record<string, unknown>)[k])) as T;
}

export function itemSnapshot(
  template: TemplateForSnapshot,
  fiscal: FiscalConfigSnapshot | null,
  overrides: ItemOverrides = {},
): ItemSnapshot {
  const o = semIguais(overrides, { name: template.name, description: template.defaultDescription, tussCode: template.tussCode, quantity: 1, unitAmountCents: template.defaultAmountCents });
  assertOverridesAllowed(template, o);
  const quantity = o.quantity ?? 1;
  const unitAmountCents = o.unitAmountCents ?? template.defaultAmountCents;
  return {
    serviceTemplateId: template.id,
    serviceNameSnapshot: o.name ?? template.name,
    descriptionSnapshot: o.description ?? template.defaultDescription,
    tussCodeSnapshot: o.tussCode === undefined ? template.tussCode : o.tussCode,
    tussVersionSnapshot: template.tussVersion,
    quantity,
    unitAmountCents,
    totalAmountCents: itemTotalCents(quantity, unitAmountCents),
    fiscalConfigSnapshotJson: fiscal,
  };
}

/**
 * Endereço no exterior do tomador (grupo endExt da DPS): país ISO ≠ BR, código
 * postal, cidade, região, logradouro, número e bairro. Com NIF a SEFIN o exige
 * (E0242); pela metade, rejeita.
 */
export function enderecoExteriorCompleto(
  pais: string,
  a: { postalCode: string | null; city: string | null; state: string | null; street: string | null; number: string | null; district: string | null } | null,
): boolean {
  return !!(a && /^[A-Z]{2}$/.test(pais) && pais !== 'BR' && a.postalCode && a.city && a.state && a.street && a.number && a.district);
}
