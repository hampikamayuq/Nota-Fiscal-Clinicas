import type { FastifyRequest } from 'fastify';
import type { Prisma, PrismaClient } from '../generated/prisma/client.ts';

type Dados = { action: string; entityType: string; entityId?: string | null; companyId?: string | null; metadata?: Record<string, unknown> };

/** Uma linha de AuditLog com quem, de onde e o quê. Nunca recebe senha ou token. */
export function auditar(prisma: PrismaClient | Prisma.TransactionClient, req: FastifyRequest, d: Dados) {
  return prisma.auditLog.create({
    data: {
      userId: req.sessao?.userId ?? null,
      action: d.action,
      entityType: d.entityType,
      entityId: d.entityId ?? null,
      companyId: d.companyId ?? null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
      ...(d.metadata ? { metadataJson: d.metadata as Prisma.InputJsonValue } : {}),
    },
  });
}
