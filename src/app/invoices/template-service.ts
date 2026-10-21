/**
 * Modelos de nota: combinações prontas de serviços. Aplicar um modelo COPIA os
 * itens para a nota pelo mesmo caminho de um item avulso (snapshot, config
 * fiscal da empresa, total); o modelo nunca fica ligado à nota.
 */

import type { InvoiceTemplate, InvoiceTemplateItem, PrismaClient } from '../../generated/prisma/client.ts';
import { InvoiceRuleError } from './invoice-rules.ts';
import type { InvoiceService, InvoiceWithItems } from './invoice-service.ts';

export type TemplateItemInput = { serviceTemplateId: string; quantity?: number; unitAmountCents?: number | null };
export type TemplateInput = { name: string; favorite?: boolean; active?: boolean; items: TemplateItemInput[] };
export type TemplateWithItems = InvoiceTemplate & { items: (InvoiceTemplateItem & { serviceTemplate: { name: string; defaultAmountCents: number; active: boolean } })[] };

const COM_ITENS = { items: { orderBy: { sortOrder: 'asc' as const }, include: { serviceTemplate: { select: { name: true, defaultAmountCents: true, active: true } } } } };

export class TemplateService {
  readonly #prisma: PrismaClient;
  readonly #invoices: InvoiceService;

  constructor(prisma: PrismaClient, invoices: InvoiceService) {
    this.#prisma = prisma;
    this.#invoices = invoices;
  }

  list(includeInactive = false): Promise<TemplateWithItems[]> {
    return this.#prisma.invoiceTemplate.findMany({ where: includeInactive ? {} : { active: true }, orderBy: [{ favorite: 'desc' }, { name: 'asc' }], include: COM_ITENS });
  }

  create(input: TemplateInput): Promise<TemplateWithItems> {
    if (!input.items.length) throw new InvoiceRuleError('Um modelo precisa de pelo menos um serviço.');
    return this.#prisma.invoiceTemplate.create({
      data: { name: input.name, favorite: input.favorite ?? false, items: { create: itens(input.items) } },
      include: COM_ITENS,
    });
  }

  update(id: string, patch: Partial<TemplateInput>): Promise<TemplateWithItems> {
    if (patch.items && !patch.items.length) throw new InvoiceRuleError('Um modelo precisa de pelo menos um serviço.');
    return this.#prisma.$transaction(async (tx) => {
      if (patch.items) {
        await tx.invoiceTemplateItem.deleteMany({ where: { templateId: id } });
        await tx.invoiceTemplateItem.createMany({ data: itens(patch.items).map((i) => ({ ...i, templateId: id })) });
      }
      return tx.invoiceTemplate.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        },
        include: COM_ITENS,
      });
    });
  }

  async duplicate(id: string): Promise<TemplateWithItems> {
    const origem = await this.#prisma.invoiceTemplate.findUnique({ where: { id }, include: COM_ITENS });
    if (!origem) throw new InvoiceRuleError('Modelo não encontrado.');
    const nomes = new Set((await this.#prisma.invoiceTemplate.findMany({ select: { name: true } })).map((t) => t.name));
    let nome = `${origem.name} (cópia)`;
    for (let n = 2; nomes.has(nome); n++) nome = `${origem.name} (cópia ${n})`;
    return this.create({ name: nome, items: origem.items.map((i) => ({ serviceTemplateId: i.serviceTemplateId, quantity: i.quantity, unitAmountCents: i.unitAmountCents })) });
  }

  /** Copia os itens do modelo para a nota, na ordem. Falha inteira se algum serviço não puder entrar. */
  async apply(invoiceId: string, templateId: string, userId?: string): Promise<InvoiceWithItems> {
    const modelo = await this.#prisma.invoiceTemplate.findUnique({ where: { id: templateId }, include: COM_ITENS });
    if (!modelo || !modelo.active) throw new InvoiceRuleError('Modelo não encontrado ou inativo.');
    return this.#invoices.withTransaction(async (invoices) => {
      let nota: InvoiceWithItems | null = null;
      for (const i of modelo.items) {
        nota = await invoices.addItem(
          invoiceId,
          { serviceTemplateId: i.serviceTemplateId, quantity: i.quantity, ...(i.unitAmountCents !== null ? { unitAmountCents: i.unitAmountCents } : {}) },
          userId,
        );
      }
      if (!nota) throw new InvoiceRuleError('O modelo não tem serviços.');
      return nota;
    });
  }
}

function itens(lista: TemplateItemInput[]) {
  return lista.map((i, ordem) => ({ serviceTemplateId: i.serviceTemplateId, quantity: i.quantity ?? 1, unitAmountCents: i.unitAmountCents ?? null, sortOrder: ordem }));
}
