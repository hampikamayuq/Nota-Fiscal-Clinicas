/**
 * Sessão por cookie assinado e papéis.
 *
 * Senha com Argon2id (plano, §40). A sessão é um cookie HttpOnly assinado pelo
 * segredo do servidor com {userId, role, exp}. Não há tabela de sessão: a cada
 * pedido o usuário é relido do banco, então desativar o usuário derruba a
 * sessão na hora.
 */

import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole, type PrismaClient } from '../generated/prisma/client.ts';

export const COOKIE_SESSAO = 'fiscal_sessao';
export const SESSAO_MS = 12 * 60 * 60 * 1000;

export type Sessao = { userId: string; role: UserRole; exp: number; token?: { id: string; name: string } };

declare module 'fastify' {
  interface FastifyRequest {
    sessao: Sessao | null;
  }
}

/** Quem pode o quê (plano, §32). */
export const PODE = {
  ler: ['ADMIN', 'RECEPTION', 'FINANCE', 'AUDITOR'],
  operarNotas: ['ADMIN', 'RECEPTION', 'FINANCE'],
  cadastrarPacientes: ['ADMIN', 'RECEPTION', 'FINANCE'],
  cadastrarProfissionaisEServicos: ['ADMIN', 'FINANCE'],
  /** Recepção mantém o catálogo (nome, descrição, TUSS, valor); travas, ativação e códigos fiscais ficam com ADMIN/FINANCE. */
  cadastrarServicos: ['ADMIN', 'RECEPTION', 'FINANCE'],
  configFiscal: ['ADMIN', 'FINANCE'],
  cancelar: ['ADMIN', 'RECEPTION', 'FINANCE'],
  exportar: ['ADMIN', 'RECEPTION', 'FINANCE'],
  verAuditoria: ['ADMIN', 'FINANCE', 'AUDITOR'],
  producao: ['ADMIN'],
} as const satisfies Record<string, readonly UserRole[]>;

const PAPEIS: readonly string[] = Object.values(UserRole);

export function hashSenha(senha: string): Promise<string> {
  return argon2.hash(senha); // argon2id é o padrão da biblioteca
}

export function conferirSenha(hash: string, senha: string): Promise<boolean> {
  return argon2.verify(hash, senha).catch(() => false);
}

export function codificarSessao(s: Sessao): string {
  return Buffer.from(JSON.stringify(s)).toString('base64url');
}

export function decodificarSessao(valor: string): Sessao | null {
  try {
    const s: unknown = JSON.parse(Buffer.from(valor, 'base64url').toString('utf8'));
    if (typeof s !== 'object' || s === null) return null;
    const { userId, role, exp } = s as Record<string, unknown>;
    if (typeof userId === 'string' && typeof role === 'string' && PAPEIS.includes(role) && typeof exp === 'number' && exp > Date.now()) {
      return { userId, role: role as UserRole, exp };
    }
  } catch {
    /* cookie corrompido = sem sessão */
  }
  return null;
}

export function lerSessao(req: FastifyRequest): Sessao | null {
  const bruto = req.cookies[COOKIE_SESSAO];
  if (!bruto) return null;
  const { valid, value } = req.unsignCookie(bruto);
  return valid && value ? decodificarSessao(value) : null;
}

export const TOKEN_PREFIX = 'qf_';

export function gerarToken(): string {
  return TOKEN_PREFIX + randomBytes(30).toString('base64url');
}

/** Só o hash SHA-256 vai ao banco; o token em si nunca é gravado nem logado. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Sessão de curta duração a partir de `Authorization: Bearer qf_…` (token não revogado, usuário ativo). */
export async function lerBearer(req: FastifyRequest, prisma: PrismaClient): Promise<Sessao | null> {
  const h = req.headers.authorization;
  if (!h || h.slice(0, 7).toLowerCase() !== 'bearer ' || !h.startsWith(TOKEN_PREFIX, 7)) return null;
  const registro = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(h.slice(7)) },
    include: { user: { select: { id: true, role: true, active: true } } },
  });
  if (!registro || registro.revokedAt || !registro.user.active) return null;
  return { userId: registro.user.id, role: registro.user.role, exp: Date.now() + 60_000, token: { id: registro.id, name: registro.name } };
}

export function gravarSessao(reply: FastifyReply, sessao: Sessao, secure: boolean | 'auto'): void {
  reply.setCookie(COOKIE_SESSAO, codificarSessao(sessao), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSAO_MS / 1000,
  });
}

export function apagarSessao(reply: FastifyReply, secure: boolean | 'auto'): void {
  reply.clearCookie(COOKIE_SESSAO, { path: '/', httpOnly: true, sameSite: 'lax', secure });
}

/** Pré-handler: 401 sem sessão, 403 com papel errado. */
export function exigirPapel(papeis: readonly UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.sessao) return reply.code(401).send({ erro: 'nao_autenticado', mensagem: 'Faça login.' });
    if (!papeis.includes(req.sessao.role)) {
      return reply.code(403).send({ erro: 'sem_permissao', mensagem: 'Seu perfil não pode fazer isso.' });
    }
    return undefined;
  };
}
