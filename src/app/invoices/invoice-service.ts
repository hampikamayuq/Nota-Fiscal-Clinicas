/**
 * A nota no banco: rascunho, itens, total, estado e trilha.
 *
 * Cada operação é uma transação: muda a nota, recalcula o total a partir dos
 * itens e registra histórico/auditoria no mesmo commit. A imutabilidade de
 * nota emitida é garantida aqui, antes de qualquer escrita.
 */

import { Prisma, type Invoice, type InvoiceItem, type InvoicePayment, type InvoiceStatus, type PrismaClient } from '../../generated/prisma/client.ts';
import {
  InvoiceRuleError,
  assertEditable,
  assertPaymentsMatchTotal,
  assertOverridesAllowed,
  assertTransition,
  invoiceTotalCents,
  itemSnapshot,
  itemTotalCents,
  professionalSnapshot,
  semIguais,
  type FiscalConfigSnapshot,
  type ItemOverrides,
  type PaymentInput,
} from './invoice-rules.ts';
import { resolveFiscalConfig } from './fiscal-config-resolver.ts';

type Tx = Prisma.TransactionClient;

export type InvoiceWithItems = Invoice & { items: InvoiceItem[]; payments: InvoicePayment[] };

export type CreateDraftInput = {
  companyId: string;
  patientId: string;
  professionalId: string;
  createdByUserId?: string;
  internalReference?: string;
  competenceDate?: Date;
};

export type DraftPatch = {
  patientId?: string;
  professionalId?: string;
  internalReference?: string | null;
  competenceDate?: Date | null;
  finalFiscalDescription?: string | null;
};

export type StatusData = Partial<
  Pick<
    Invoice,
    | 'finalFiscalDescription'
    | 'competenceDate'
    | 'provider'
    | 'providerReference'
    | 'providerStatus'
    | 'externalNumber'
    | 'externalVerificationCode'
    | 'pdfUrl'
    | 'xmlUrl'
    | 'lastErrorCode'
    | 'lastErrorMessage'
  >
>;

const AUDIT_BY_STATUS: Partial<Record<InvoiceStatus, string>> = {
  SUBMITTING: 'INVOICE_SUBMITTED',
  PROCESSING: 'INVOICE_PROCESSING',
  AUTHORIZED: 'INVOICE_AUTHORIZED',
  REJECTED: 'INVOICE_REJECTED',
  CANCELLATION_REQUESTED: 'INVOICE_CANCEL_REQUESTED',
  CANCELLED: 'INVOICE_CANCELLED',
  CANCELLATION_ERROR: 'INVOICE_CANCEL_FAILED',
};

/** O que toda resposta de mutação carrega. Paciente e empresa vêm junto para a tela trocar de rota sem piscar (mesmas formas do GET /api/invoices/:id). */
const COM_ITENS = {
  items: { orderBy: { sortOrder: 'asc' } },
  payments: { orderBy: { sortOrder: 'asc' } },
  patient: { select: { id: true, name: true, cpf: true, cnpj: true, foreignDocument: true, phone: true } },
  company: { select: { id: true, legalName: true, tradeName: true, cnpj: true } },
} as const satisfies Prisma.InvoiceInclude;

export class InvoiceService {
  readonly #prisma: PrismaClient | Tx;

  constructor(prisma: PrismaClient | Tx) {
    this.#prisma = prisma;
  }

  get(invoiceId: string): Promise<InvoiceWithItems | null> {
    return this.#prisma.invoice.findUnique({ where: { id: invoiceId }, include: COM_ITENS });
  }

  /** Toda escrita passa aqui: uma transação, e erro do Prisma vira erro de regra quando é de regra. */
  #transacao<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const resultado = '$transaction' in this.#prisma ? this.#prisma.$transaction(fn) : fn(this.#prisma);
    return resultado.catch((erro: unknown) => {
      throw traduzirErroPrisma(erro);
    });
  }

  /** Compõe operações com as mesmas regras e auditoria, num único commit. */
  withTransaction<T>(fn: (invoices: InvoiceService, tx: Tx) => Promise<T>): Promise<T> {
    return this.#transacao((tx) => fn(new InvoiceService(tx), tx));
  }

  createDraft(input: CreateDraftInput): Promise<InvoiceWithItems> {
    return this.#transacao(async (tx) => {
      const [, patient] = await Promise.all([
        tx.company.findUniqueOrThrow({ where: { id: input.companyId }, select: { id: true } }),
        tx.patient.findUniqueOrThrow({ where: { id: input.patientId }, select: { active: true, name: true } }),
      ]);
      if (!patient.active) throw new InvoiceRuleError(`Paciente "${patient.name}" está inativo.`);
      const snapshot = await carregarSnapshotProfissional(tx, input.professionalId);
      const invoice = await tx.invoice.create({
        data: {
          companyId: input.companyId,
          patientId: input.patientId,
          professionalId: input.professionalId,
          createdByUserId: input.createdByUserId ?? null,
          internalReference: input.internalReference ?? null,
          competenceDate: input.competenceDate ?? null,
          ...snapshot,
        },
        include: COM_ITENS,
      });
      await tx.invoiceStatusHistory.create({
        data: { invoiceId: invoice.id, fromStatus: null, toStatus: 'DRAFT', userId: input.createdByUserId ?? null },
      });
      await auditar(tx, invoice, 'INVOICE_CREATED', input.createdByUserId);
      return invoice;
    });
  }

  updateDraft(invoiceId: string, patch: DraftPatch, userId?: string): Promise<InvoiceWithItems> {
    return this.#transacao(async (tx) => {
      const atual = await carregarEditavel(tx, invoiceId);
      const snapshot = patch.professionalId ? await carregarSnapshotProfissional(tx, patch.professionalId) : {};
      const invoice = await tx.invoice.update({
        where: { id: atual.id },
        data: {
          ...(patch.patientId !== undefined ? { patientId: patch.patientId } : {}),
          ...(patch.professionalId !== undefined ? { professionalId: patch.professionalId } : {}),
          ...(patch.internalReference !== undefined ? { internalReference: patch.internalReference } : {}),
          ...(patch.competenceDate !== undefined ? { competenceDate: patch.competenceDate } : {}),
          ...(patch.finalFiscalDescription !== undefined ? { finalFiscalDescription: patch.finalFiscalDescription } : {}),
          ...snapshot,
        },
        include: COM_ITENS,
      });
      await auditar(tx, invoice, 'INVOICE_UPDATED', userId, { campos: Object.keys(patch) });
      return invoice;
    });
  }

  addItem(invoiceId: string, input: { serviceTemplateId: string } & ItemOverrides, userId?: string): Promise<InvoiceWithItems> {
    return this.#transacao(async (tx) => {
      const invoice = await carregarEditavel(tx, invoiceId);
      const template = await tx.serviceTemplate.findUniqueOrThrow({ where: { id: input.serviceTemplateId } });
      if (!template.active) throw new InvoiceRuleError(`"${template.name}" está inativo no catálogo.`);
      // Exceção do serviço ou, sem ela, o padrão da empresa. Sem nenhum dos dois
      // não há o que emitir — e o código não inventa nenhum código tributário.
      const efetiva = await resolveFiscalConfig(tx, invoice.companyId, template.id);
      if (!efetiva) {
        throw new InvoiceRuleError(
          `"${template.name}" não tem configuração fiscal ativa nesta empresa. ` +
            'Peça ao financeiro para definir a configuração fiscal padrão da empresa (ou a deste serviço).',
        );
      }
      const { serviceTemplateId: _ignorado, ...overrides } = input;
      const { fiscalConfigSnapshotJson, ...snapshot } = itemSnapshot(template, snapshotFiscal(efetiva.config), overrides);
      const item = await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          sortOrder: invoice.items.length,
          ...snapshot,
          fiscalConfigSnapshotJson: fiscalConfigSnapshotJson as Prisma.InputJsonValue,
        },
      });
      const atualizada = await recalcularTotal(tx, invoice.id);
      assertProntaConsistente(atualizada);
      await auditar(tx, atualizada, 'INVOICE_ITEM_ADDED', userId, { itemId: item.id, serviceTemplateId: template.id });
      return atualizada;
    });
  }

  updateItem(invoiceId: string, itemId: string, patch: ItemOverrides, userId?: string): Promise<InvoiceWithItems> {
    return this.#transacao(async (tx) => {
      const invoice = await carregarEditavel(tx, invoiceId);
      const item = invoice.items.find((i) => i.id === itemId);
      if (!item) throw new InvoiceRuleError(`Item ${itemId} não pertence à nota ${invoiceId}.`);
      // Modelo apagado do catálogo: ninguém mais autoriza mexer em valor/descrição.
      const template = item.serviceTemplateId ? await tx.serviceTemplate.findUnique({ where: { id: item.serviceTemplateId } }) : null;
      const mudancas = semIguais(patch, { name: item.serviceNameSnapshot, description: item.descriptionSnapshot, tussCode: item.tussCodeSnapshot, quantity: item.quantity, unitAmountCents: item.unitAmountCents });
      assertOverridesAllowed(template ?? { name: item.serviceNameSnapshot, allowDescriptionEdit: false, allowAmountEdit: false }, mudancas);
      const quantity = mudancas.quantity ?? item.quantity;
      const unitAmountCents = mudancas.unitAmountCents ?? item.unitAmountCents;
      await tx.invoiceItem.update({
        where: { id: item.id },
        data: {
          ...(mudancas.name !== undefined ? { serviceNameSnapshot: mudancas.name } : {}),
          ...(mudancas.description !== undefined ? { descriptionSnapshot: mudancas.description } : {}),
          ...(mudancas.tussCode !== undefined ? { tussCodeSnapshot: mudancas.tussCode } : {}),
          quantity,
          unitAmountCents,
          totalAmountCents: itemTotalCents(quantity, unitAmountCents),
        },
      });
      const atualizada = await recalcularTotal(tx, invoice.id);
      assertProntaConsistente(atualizada);
      await auditar(tx, atualizada, 'INVOICE_ITEM_UPDATED', userId, { itemId, campos: Object.keys(mudancas) });
      return atualizada;
    });
  }

  removeItem(invoiceId: string, itemId: string, userId?: string): Promise<InvoiceWithItems> {
    return this.#transacao(async (tx) => {
      const invoice = await carregarEditavel(tx, invoiceId);
      if (!invoice.items.some((i) => i.id === itemId)) {
        throw new InvoiceRuleError(`Item ${itemId} não pertence à nota ${invoiceId}.`);
      }
      await tx.invoiceItem.delete({ where: { id: itemId } });
      // Reordena para não deixar buraco em sortOrder.
      const restantes = invoice.items.filter((i) => i.id !== itemId);
      for (const [ordem, i] of restantes.entries()) {
        if (i.sortOrder !== ordem) await tx.invoiceItem.update({ where: { id: i.id }, data: { sortOrder: ordem } });
      }
      const atualizada = await recalcularTotal(tx, invoice.id);
      assertProntaConsistente(atualizada);
      await auditar(tx, atualizada, 'INVOICE_ITEM_REMOVED', userId, { itemId });
      return atualizada;
    });
  }

  /** Apaga um rascunho e o que é só dele (itens, pagamentos, histórico, tentativas). Só DRAFT: nota pronta volta a rascunho antes. */
  deleteDraft(invoiceId: string, userId?: string): Promise<void> {
    return this.#transacao(async (tx) => {
      await travar(tx, invoiceId);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      if (invoice.status !== 'DRAFT') throw new InvoiceRuleError(`Só rascunho pode ser apagado; esta nota está em ${invoice.status}.`);
      const where = { invoiceId };
      await tx.invoiceItem.deleteMany({ where });
      await tx.invoicePayment.deleteMany({ where });
      await tx.invoiceStatusHistory.deleteMany({ where });
      await tx.fiscalAttempt.deleteMany({ where });
      await tx.invoice.delete({ where: { id: invoiceId } });
      // O AuditLog não tem chave estrangeira: a linha sobrevive à nota apagada.
      await auditar(tx, invoice, 'INVOICE_DELETED', userId, { patientId: invoice.patientId, totalAmountCents: invoice.totalAmountCents, providerReference: invoice.providerReference });
    });
  }

  /** Forma(s) de pagamento: vale em qualquer situação da nota; a soma tem de fechar com o total. */
  setPayments(invoiceId: string, payments: PaymentInput[], userId?: string): Promise<InvoiceWithItems> {
    return this.#transacao(async (tx) => {
      await travar(tx, invoiceId);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: COM_ITENS });
      assertPaymentsMatchTotal(payments, invoice.totalAmountCents);
      await tx.invoicePayment.deleteMany({ where: { invoiceId } });
      await tx.invoicePayment.createMany({
        data: payments.map((p, sortOrder) => ({ invoiceId, method: p.method, amountCents: p.amountCents, sortOrder })),
      });
      await auditar(tx, invoice, 'INVOICE_PAYMENTS_UPDATED', userId, {
        before: invoice.payments.map(({ method, amountCents }) => ({ method, amountCents })),
        after: payments,
      });
      return tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: COM_ITENS });
    });
  }

  /**
   * `data` leva junto, na mesma escrita, o que só pode mudar nesta transição
   * (descrição final e competência ao enviar; dados do provedor ao autorizar).
   */
  changeStatus(invoiceId: string, to: InvoiceStatus, opts: { reason?: string; userId?: string; data?: StatusData } = {}): Promise<InvoiceWithItems> {
    return this.#transacao(async (tx) => {
      await travar(tx, invoiceId);
      const atual = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: COM_ITENS });
      assertTransition(atual.status, to);
      if (to === 'READY') assertProntaConsistente({ ...atual, status: 'READY' });
      const agora = new Date();
      const invoice = await tx.invoice.update({
        where: { id: atual.id },
        data: {
          status: to,
          ...(to === 'SUBMITTING' ? { submittedAt: agora } : {}),
          ...(to === 'AUTHORIZED' ? { authorizedAt: agora } : {}),
          ...(to === 'CANCELLED' ? { cancelledAt: agora } : {}),
          ...(to === 'REJECTED' || to === 'CANCELLATION_ERROR' ? { lastErrorMessage: opts.reason ?? null } : {}),
          ...(to === 'AUTHORIZED' || to === 'CANCELLED' || to === 'DRAFT' ? { lastErrorCode: null, lastErrorMessage: null } : {}),
          ...opts.data,
        },
        include: COM_ITENS,
      });
      await tx.invoiceStatusHistory.create({
        data: { invoiceId: invoice.id, fromStatus: atual.status, toStatus: to, reason: opts.reason ?? null, userId: opts.userId ?? null },
      });
      await auditar(tx, invoice, AUDIT_BY_STATUS[to] ?? 'INVOICE_UPDATED', opts.userId, { de: atual.status, para: to });
      return invoice;
    });
  }
}

// ─── Internos ────────────────────────────────────────────────────────────────

/**
 * Tranca a linha da nota até o fim da transação. Dois cliques simultâneos
 * (ou uma edição correndo contra a emissão) passam a ser sequenciais: o
 * segundo só lê depois que o primeiro gravou, e aí a regra decide.
 */
async function travar(tx: Tx, invoiceId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId}::uuid FOR UPDATE`;
}

async function carregarEditavel(tx: Tx, invoiceId: string): Promise<InvoiceWithItems> {
  await travar(tx, invoiceId);
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: COM_ITENS });
  // O banco repete esta regra em trigger (migration harden_invoice_domain).
  assertEditable(invoice.status);
  return invoice;
}

/** Nota pronta (READY) tem ao menos um serviço e valor positivo; senão, volta a rascunho antes. */
function assertProntaConsistente(invoice: InvoiceWithItems): void {
  if (invoice.status !== 'READY') return;
  if (!invoice.items.length || invoice.totalAmountCents <= 0) {
    throw new InvoiceRuleError(
      'Nota pronta precisa de pelo menos um serviço e valor maior que zero. Volte para rascunho (DRAFT) antes de esvaziá-la.',
    );
  }
}

function traduzirErroPrisma(erro: unknown): unknown {
  if (erro instanceof Prisma.PrismaClientKnownRequestError) {
    if (erro.code === 'P2025') return new InvoiceRuleError('Registro não encontrado: nota, profissional ou serviço inexistente.');
    if (erro.code === 'P2003') return new InvoiceRuleError('Referência inválida: empresa, paciente, profissional ou serviço não existe.');
  }
  return erro;
}

async function carregarSnapshotProfissional(tx: Tx, professionalId: string) {
  const p = await tx.professional.findUniqueOrThrow({ where: { id: professionalId }, include: { rqes: true } });
  if (!p.active) throw new InvoiceRuleError(`Profissional "${p.name}" está inativo.`);
  return professionalSnapshot(p, p.rqes);
}

async function recalcularTotal(tx: Tx, invoiceId: string): Promise<InvoiceWithItems> {
  const items = await tx.invoiceItem.findMany({ where: { invoiceId }, select: { totalAmountCents: true } });
  const total = invoiceTotalCents(items);
  await tx.invoice.update({ where: { id: invoiceId }, data: { totalAmountCents: total } });
  // ponytail: um pagamento acompanha o total; vários ficam e a nota avisa a diferença.
  const pagamentos = await tx.invoicePayment.findMany({ where: { invoiceId } });
  const unico = pagamentos.length === 1 ? pagamentos[0] : undefined;
  if (unico && unico.amountCents !== total) await tx.invoicePayment.update({ where: { id: unico.id }, data: { amountCents: total } });
  return tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: COM_ITENS });
}

function snapshotFiscal(c: {
  nationalTaxCode: string;
  municipalTaxCode: string | null;
  nbsCode: string | null;
  issRate: { toString(): string } | null;
  taxationType: string;
  issWithholdingType: string;
  pisCofinsConfigJson: unknown;
  ibsCbsConfigJson: unknown;
  additionalFiscalConfigJson: unknown;
}): FiscalConfigSnapshot {
  return {
    nationalTaxCode: c.nationalTaxCode,
    municipalTaxCode: c.municipalTaxCode,
    nbsCode: c.nbsCode,
    issRate: c.issRate?.toString() ?? null,
    taxationType: c.taxationType,
    issWithholdingType: c.issWithholdingType,
    pisCofins: c.pisCofinsConfigJson ?? null,
    ibsCbs: c.ibsCbsConfigJson ?? null,
    additional: c.additionalFiscalConfigJson ?? null,
  };
}

function auditar(tx: Tx, invoice: Invoice, action: string, userId: string | undefined, metadata?: Record<string, unknown>) {
  return tx.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      entityType: 'Invoice',
      entityId: invoice.id,
      companyId: invoice.companyId,
      ...(metadata ? { metadataJson: metadata as Prisma.InputJsonValue } : {}),
    },
  });
}
