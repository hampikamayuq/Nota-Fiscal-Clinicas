import { z } from 'zod';
import { InvoiceStatus, type Prisma } from '../../generated/prisma/client.ts';
import type { Rotas } from '../app.ts';
import { PODE, exigirPapel } from '../auth.ts';
import { MAX_PAYMENTS, PAYMENT_METHODS } from '../../app/invoices/invoice-rules.ts';
import { MONTH_RE, currentMonth } from '../../app/invoices/period.ts';
import { monthlySummary } from '../../app/reports/summary.ts';
import { contentDisposition, fakePdf, fetchPdf, isFakePdfUrl, pdfFilename } from '../../app/invoices/pdf-download.ts';
import { ErroHttp, exigir, naoEncontrado, semUndefined, usuario } from '../erros.ts';

const Uuid = z.string().uuid();
const paraData = (s: string) => new Date(`${s}T00:00:00.000Z`);
// `new Date('2026-02-31')` vira 3 de março sem erro: só vale a data que volta igual.
const Data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD')
  .refine((s) => !Number.isNaN(paraData(s).getTime()) && paraData(s).toISOString().startsWith(s), 'data inexistente');

const Params = z.object({ id: Uuid });
const ItemParams = z.object({ id: Uuid, itemId: Uuid });
const InvoiceCreate = z.object({
  companyId: Uuid,
  patientId: Uuid,
  professionalId: Uuid,
  internalReference: z.string().trim().min(1).max(80).optional(),
  competenceDate: Data.optional(),
});
const InvoicePatch = z.object({
  patientId: Uuid.optional(),
  professionalId: Uuid.optional(),
  internalReference: z.string().trim().min(1).max(80).optional().nullable(),
  competenceDate: Data.optional().nullable(),
  finalFiscalDescription: z.string().trim().max(5000).optional().nullable(),
});
const ItemCreate = z.object({
  serviceTemplateId: Uuid,
  quantity: z.number().int().min(1).max(999).optional(),
  unitAmountCents: z.number().int().min(0).max(100_000_000).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  tussCode: z.string().trim().regex(/^\d{8}$/, 'TUSS tem 8 dígitos').optional().nullable(),
});
const ItemPatch = ItemCreate.omit({ serviceTemplateId: true });
/** Só o que a recepção decide sozinha. Emissão e cancelamento entram com o provedor fiscal. */
const StatusBody = z.object({ status: z.enum(['DRAFT', 'READY']) });
const PaymentsBody = z.object({
  payments: z.array(z.object({ method: z.enum(PAYMENT_METHODS), amountCents: z.number().int().min(0).max(100_000_000) })).max(MAX_PAYMENTS),
});
const Status = z.nativeEnum(InvoiceStatus);
const Lista = z.object({
  company: Uuid.optional(),
  patient: Uuid.optional(),
  status: z.string().transform((s) => s.split(',')).pipe(z.array(Status).min(1)).optional(),
  q: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** 11 dígitos (CPF, com ou sem máscara) → paciente; só dígitos → número da nota; senão nome. */
const busca = (q: string): Prisma.InvoiceWhereInput => {
  const digitos = q.replace(/\D/g, '');
  if (digitos.length === 11 && /^[\d.\-\s]+$/.test(q)) return { patient: { cpf: digitos } };
  if (/^\d+$/.test(q)) return { externalNumber: q };
  return { patient: { name: { contains: q, mode: 'insensitive' } } };
};

const Mes = z.object({ month: z.string().regex(MONTH_RE, 'mês no formato AAAA-MM').optional() });

export const rotasInvoices: Rotas = async (app, ctx) => {
  app.get('/api/invoices', { preHandler: exigirPapel(PODE.ler) }, async (req) => {
    const f = Lista.parse(req.query);
    return ctx.prisma.invoice.findMany({
      where: {
        ...(f.company ? { companyId: f.company } : {}),
        ...(f.patient ? { patientId: f.patient } : {}),
        ...(f.status ? { status: { in: f.status } } : {}),
        ...(f.q ? busca(f.q) : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: f.limit ?? 100,
      include: { items: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { sortOrder: 'asc' } }, patient: { select: { id: true, name: true, cpf: true, cnpj: true, foreignDocument: true } } },
    });
  });

  app.post('/api/invoices', { preHandler: exigirPapel(PODE.operarNotas) }, async (req, reply) => {
    const b = InvoiceCreate.parse(req.body);
    const nota = await ctx.invoices.createDraft({
      companyId: b.companyId,
      patientId: b.patientId,
      professionalId: b.professionalId,
      createdByUserId: usuario(req),
      ...(b.internalReference ? { internalReference: b.internalReference } : {}),
      ...(b.competenceDate ? { competenceDate: paraData(b.competenceDate) } : {}),
    });
    return reply.code(201).send(nota);
  });

  app.get('/api/invoices/summary', { preHandler: exigirPapel(PODE.ler) }, async (req) =>
    monthlySummary(ctx.prisma, Mes.parse(req.query).month ?? currentMonth()));

  app.get('/api/invoices/:id', { preHandler: exigirPapel(PODE.ler) }, async (req) => {
    const { id } = Params.parse(req.params);
    const nota = await ctx.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { sortOrder: 'asc' } },
        patient: { select: { id: true, name: true, cpf: true, cnpj: true, foreignDocument: true, phone: true } },
        company: { select: { id: true, legalName: true, tradeName: true, cnpj: true } },
        history: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!nota) throw naoEncontrado('Nota');
    // A recepção vê a mensagem simples; quem resolve (ADMIN/FINANCE) vê o motivo
    // técnico da Focus/SEFIN, que só fica gravado na tentativa (plano, §38).
    if (!(PODE.configFiscal as readonly string[]).includes(req.sessao!.role)) return nota;
    const tentativa = await ctx.prisma.fiscalAttempt.findFirst({
      where: { invoiceId: id, errorMessage: { not: null } },
      orderBy: { startedAt: 'desc' },
      select: { errorCode: true, errorMessage: true },
    });
    return { ...nota, lastAttemptError: tentativa ? { code: tentativa.errorCode, message: tentativa.errorMessage } : null };
  });

  /** O PDF da Focus é público; aqui só se força o download com um nome útil. Nada é gravado em disco. */
  app.get('/api/invoices/:id/pdf', { preHandler: exigirPapel(PODE.ler) }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    const nota = await ctx.prisma.invoice.findUnique({ where: { id }, select: { pdfUrl: true, externalNumber: true, patient: { select: { name: true } } } });
    if (!nota) throw naoEncontrado('Nota');
    if (!nota.pdfUrl) throw new ErroHttp(404, { erro: 'sem_pdf', mensagem: 'A nota ainda não tem PDF.' });
    const corpo = isFakePdfUrl(nota.pdfUrl) ? fakePdf(nota.externalNumber) : await fetchPdf(nota.pdfUrl);
    if (!corpo) throw new ErroHttp(502, { erro: 'pdf_indisponivel', mensagem: 'Não foi possível baixar o PDF agora. Tente de novo.' });
    return reply
      .header('content-type', 'application/pdf')
      .header('cache-control', 'no-store')
      .header('content-disposition', contentDisposition(pdfFilename(nota.externalNumber, nota.patient.name)))
      .send(Buffer.from(corpo));
  });

  app.patch('/api/invoices/:id', { preHandler: exigirPapel(PODE.operarNotas) }, async (req) => {
    const { id } = Params.parse(req.params);
    const { competenceDate, ...resto } = semUndefined(InvoicePatch.parse(req.body));
    await exigir(ctx.prisma.invoice, id, 'Nota');
    return ctx.invoices.updateDraft(
      id,
      { ...resto, ...(competenceDate !== undefined ? { competenceDate: competenceDate === null ? null : paraData(competenceDate) } : {}) },
      usuario(req),
    );
  });

  /** Só rascunho. Nota pronta volta a rascunho antes; nota que já foi ao fisco nunca é apagada. */
  app.delete('/api/invoices/:id', { preHandler: exigirPapel(PODE.operarNotas) }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await exigir(ctx.prisma.invoice, id, 'Nota');
    await ctx.invoices.deleteDraft(id, usuario(req));
    return reply.code(204).send();
  });

  app.post('/api/invoices/:id/status', { preHandler: exigirPapel(PODE.operarNotas) }, async (req) => {
    const { id } = Params.parse(req.params);
    const { status } = StatusBody.parse(req.body);
    await exigir(ctx.prisma.invoice, id, 'Nota');
    return ctx.invoices.changeStatus(id, status, { userId: usuario(req) });
  });

  app.post('/api/invoices/:id/items', { preHandler: exigirPapel(PODE.operarNotas) }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    const item = semUndefined(ItemCreate.parse(req.body));
    await exigir(ctx.prisma.invoice, id, 'Nota');
    return reply.code(201).send(await ctx.invoices.addItem(id, item, usuario(req)));
  });

  app.patch('/api/invoices/:id/items/:itemId', { preHandler: exigirPapel(PODE.operarNotas) }, async (req) => {
    const { id, itemId } = ItemParams.parse(req.params);
    await exigir(ctx.prisma.invoice, id, 'Nota');
    return ctx.invoices.updateItem(id, itemId, semUndefined(ItemPatch.parse(req.body)), usuario(req));
  });

  app.put('/api/invoices/:id/payments', { preHandler: exigirPapel(PODE.operarNotas) }, async (req) => {
    const { id } = Params.parse(req.params);
    const { payments } = PaymentsBody.parse(req.body);
    await exigir(ctx.prisma.invoice, id, 'Nota');
    return ctx.invoices.setPayments(id, payments, usuario(req));
  });

  app.delete('/api/invoices/:id/items/:itemId', { preHandler: exigirPapel(PODE.operarNotas) }, async (req) => {
    const { id, itemId } = ItemParams.parse(req.params);
    await exigir(ctx.prisma.invoice, id, 'Nota');
    return ctx.invoices.removeItem(id, itemId, usuario(req));
  });
};
