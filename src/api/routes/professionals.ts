import { z } from 'zod';
import { cpfValido } from '../../dps/validate.ts';
import type { Rotas } from '../app.ts';
import { PODE, exigirPapel } from '../auth.ts';
import { auditar } from '../auditoria.ts';
import { exigir, semUndefined } from '../erros.ts';

const Rqe = z.object({ number: z.string().trim().min(1).max(20), specialty: z.string().trim().min(2).max(120) });
const Professional = z.object({
  name: z.string().trim().min(2).max(200),
  cpf: z.string().transform((s) => s.replace(/\D/g, '')).refine(cpfValido, 'CPF inválido').optional().nullable(),
  /** Sigla do conselho profissional; vai na nota como "<council>-<UF> <número>". */
  council: z.string().trim().toUpperCase().regex(/^[A-Z]{2,10}$/, 'sigla do conselho com 2 a 10 letras (CRM, CRO, CRP…)').default('CRM'),
  crmNumber: z.string().trim().min(1).max(20),
  crmState: z.string().trim().toUpperCase().length(2),
  specialty: z.string().trim().max(120).optional().nullable(),
  active: z.boolean().optional(),
  /** Lista completa: substitui os RQE atuais. */
  rqes: z.array(Rqe).max(10).optional(),
});
const ProfessionalPatch = Professional.partial();
const Params = z.object({ id: z.string().uuid() });
const COM_RQES = { rqes: { orderBy: { number: 'asc' as const } } };

export const rotasProfessionals: Rotas = async (app, ctx) => {
  app.get('/api/professionals', { preHandler: exigirPapel(PODE.ler) }, async (req) => {
    const { todos } = z.object({ todos: z.enum(['1']).optional() }).parse(req.query);
    return ctx.prisma.professional.findMany({ where: todos ? {} : { active: true }, orderBy: { name: 'asc' }, include: COM_RQES });
  });

  app.post('/api/professionals', { preHandler: exigirPapel(PODE.cadastrarProfissionaisEServicos) }, async (req, reply) => {
    const { rqes, ...dados } = semUndefined(Professional.parse(req.body));
    const p = await ctx.prisma.professional.create({
      data: { ...dados, ...(rqes ? { rqes: { create: rqes } } : {}) },
      include: COM_RQES,
    });
    await auditar(ctx.prisma, req, { action: 'PROFESSIONAL_CREATED', entityType: 'Professional', entityId: p.id });
    return reply.code(201).send(p);
  });

  app.patch('/api/professionals/:id', { preHandler: exigirPapel(PODE.cadastrarProfissionaisEServicos) }, async (req) => {
    const { id } = Params.parse(req.params);
    const { rqes, ...dados } = semUndefined(ProfessionalPatch.parse(req.body));
    await exigir(ctx.prisma.professional, id, 'Profissional');
    const p = await ctx.prisma.$transaction(async (tx) => {
      if (rqes) {
        await tx.professionalRQE.deleteMany({ where: { professionalId: id } });
        await tx.professionalRQE.createMany({ data: rqes.map((r) => ({ ...r, professionalId: id })) });
      }
      return tx.professional.update({ where: { id }, data: dados, include: COM_RQES });
    });
    await auditar(ctx.prisma, req, { action: 'PROFESSIONAL_UPDATED', entityType: 'Professional', entityId: id, metadata: { campos: Object.keys(dados), rqes: !!rqes } });
    return p;
  });
};
