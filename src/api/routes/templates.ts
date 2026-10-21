import { z } from 'zod';
import type { Rotas } from '../app.ts';
import { PODE, exigirPapel } from '../auth.ts';
import { auditar } from '../auditoria.ts';
import { exigir, semUndefined, usuario } from '../erros.ts';

const Item = z.object({
  serviceTemplateId: z.string().uuid(),
  quantity: z.number().int().min(1).max(999).optional(),
  unitAmountCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
});
const Template = z.object({
  name: z.string().trim().min(2).max(120),
  favorite: z.boolean().optional(),
  active: z.boolean().optional(),
  items: z.array(Item).min(1).max(20),
});
const Params = z.object({ id: z.string().uuid() });
const itens = (l: z.infer<typeof Item>[]) => l.map((i) => semUndefined(i));

export const rotasTemplates: Rotas = async (app, ctx) => {
  app.get('/api/templates', { preHandler: exigirPapel(PODE.ler) }, async (req) => {
    const { todos } = z.object({ todos: z.enum(['1']).optional() }).parse(req.query);
    return ctx.templates.list(!!todos);
  });

  app.post('/api/templates', { preHandler: exigirPapel(PODE.cadastrarProfissionaisEServicos) }, async (req, reply) => {
    const { items, ...resto } = Template.parse(req.body);
    const t = await ctx.templates.create({ ...semUndefined(resto), items: itens(items) });
    await auditar(ctx.prisma, req, { action: 'TEMPLATE_CREATED', entityType: 'InvoiceTemplate', entityId: t.id });
    return reply.code(201).send(t);
  });

  app.patch('/api/templates/:id', { preHandler: exigirPapel(PODE.cadastrarProfissionaisEServicos) }, async (req) => {
    const { id } = Params.parse(req.params);
    const { items, ...resto } = Template.partial().parse(req.body);
    await exigir(ctx.prisma.invoiceTemplate, id, 'Modelo');
    const t = await ctx.templates.update(id, { ...semUndefined(resto), ...(items ? { items: itens(items) } : {}) });
    await auditar(ctx.prisma, req, { action: 'TEMPLATE_UPDATED', entityType: 'InvoiceTemplate', entityId: id });
    return t;
  });

  app.post('/api/templates/:id/duplicate', { preHandler: exigirPapel(PODE.cadastrarProfissionaisEServicos) }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await exigir(ctx.prisma.invoiceTemplate, id, 'Modelo');
    const t = await ctx.templates.duplicate(id);
    await auditar(ctx.prisma, req, { action: 'TEMPLATE_CREATED', entityType: 'InvoiceTemplate', entityId: t.id, metadata: { duplicadoDe: id } });
    return reply.code(201).send(t);
  });

  app.post('/api/invoices/:id/apply-template', { preHandler: exigirPapel(PODE.operarNotas) }, async (req) => {
    const { id } = Params.parse(req.params);
    const { templateId } = z.object({ templateId: z.string().uuid() }).parse(req.body);
    await exigir(ctx.prisma.invoice, id, 'Nota');
    return ctx.templates.apply(id, templateId, usuario(req));
  });
};
