/**
 * Conexão com o PostgreSQL via Prisma 7 + driver pg.
 *
 * Quem precisa do banco recebe um `PrismaClient` pronto; ninguém importa o
 * cliente gerado diretamente. A URL vem do ambiente — nunca do código.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { ConfigError } from '../config.ts';

export type { PrismaClient };

export function criarPrisma(connectionString: string | undefined = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new ConfigError('DATABASE_URL não definida. Ex.: postgresql://usuario:senha@127.0.0.1:5432/fiscal');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
