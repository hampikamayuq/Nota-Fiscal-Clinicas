import { z } from 'zod';
import type { Rotas } from '../app.ts';
import { PODE, exigirPapel } from '../auth.ts';

const Filtro = z.object({
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(60).optional(),
  action: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const rotasAudit: Rotas = async (app, ctx) => {
  app.get('/api/audit', { preHandler: exigirPapel(PODE.verAuditoria) }, async (req) => {
    const f = Filtro.parse(req.query);
    const linhas = await ctx.prisma.auditLog.findMany({
      where: { ...(f.entityType ? { entityType: f.entityType } : {}), ...(f.entityId ? { entityId: f.entityId } : {}), ...(f.action ? { action: f.action } : {}) },
      orderBy: { createdAt: 'desc' },
      take: f.limit ?? 200,
    });
    const ids = [...new Set(linhas.map((l) => l.userId).filter((v): v is string => !!v))];
    const usuarios = new Map((await ctx.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return linhas.map((l) => ({ ...l, userName: l.userId ? (usuarios.get(l.userId) ?? null) : null }));
  });
};
