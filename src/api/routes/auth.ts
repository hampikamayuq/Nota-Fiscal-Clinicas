import { z } from 'zod';
import type { User } from '../../generated/prisma/client.ts';
import type { Rotas } from '../app.ts';
import { PODE, SESSAO_MS, apagarSessao, conferirSenha, exigirPapel, gravarSessao, hashSenha } from '../auth.ts';
import { auditar } from '../auditoria.ts';

const Login = z.object({ email: z.string().trim().toLowerCase().max(254).email(), senha: z.string().min(1).max(200) });

// Usuário inexistente ou inativo passa pelo mesmo argon2 que um usuário real:
// sem isso o tempo de resposta entrega quais e-mails existem.
let hashFalso: Promise<string> | null = null;
const conferirSempre = (hash: string | null | undefined, senha: string) =>
  conferirSenha(hash ?? '', senha).then(async (ok) => {
    if (hash) return ok;
    await conferirSenha(await (hashFalso ??= hashSenha('nao-e-a-senha-de-ninguem')), senha);
    return false;
  });

const usuarioPublico = (u: User) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

const MAX_FALHAS = 5;
const JANELA_MS = 15 * 60 * 1000;

export const rotasAuth: Rotas = async (app, ctx) => {
  // ponytail: contador em memória, por processo. Um Redis (ou a tabela AuditLog) se a API ganhar mais de uma instância.
  const falhas = new Map<string, { n: number; ate: number }>();
  const bloqueado = (chave: string) => {
    const f = falhas.get(chave);
    if (f && f.ate < Date.now()) falhas.delete(chave);
    return (falhas.get(chave)?.n ?? 0) >= MAX_FALHAS;
  };
  const falhou = (chave: string) => {
    const f = falhas.get(chave);
    falhas.set(chave, { n: (f?.n ?? 0) + 1, ate: f?.ate ?? Date.now() + JANELA_MS });
  };

  app.post('/api/auth/login', async (req, reply) => {
    const { email, senha } = Login.parse(req.body);
    for (const [k, f] of falhas) if (f.ate < Date.now()) falhas.delete(k); // ponytail: varredura por login; o mapa só cresce dentro da janela de 15 min
    const chaves = [`ip:${req.ip}`, `email:${email}`];
    if (chaves.some(bloqueado)) {
      return reply.code(429).send({ erro: 'muitas_tentativas', mensagem: 'Muitas tentativas de login. Aguarde 15 minutos.' });
    }
    // Conta antes do argon2: uma rajada paralela não passa inteira pela checagem acima.
    chaves.forEach(falhou);
    const u = await ctx.prisma.user.findUnique({ where: { email } });
    const ok = (await conferirSempre(u?.active ? u.passwordHash : null, senha)) && !!u;
    if (!ok) {
      await auditar(ctx.prisma, req, { action: 'LOGIN_FAILURE', entityType: 'User', entityId: u?.id ?? null, metadata: { email } });
      return reply.code(401).send({ erro: 'credenciais', mensagem: 'E-mail ou senha incorretos.' });
    }
    chaves.forEach((c) => falhas.delete(c)); // acertou: zera o IP também, que a recepção inteira divide
    gravarSessao(reply, { userId: u.id, role: u.role, exp: Date.now() + SESSAO_MS }, ctx.cookieSecure);
    req.sessao = { userId: u.id, role: u.role, exp: 0 };
    await auditar(ctx.prisma, req, { action: 'LOGIN_SUCCESS', entityType: 'User', entityId: u.id });
    return usuarioPublico(u);
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    apagarSessao(reply, ctx.cookieSecure);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: exigirPapel(PODE.ler) }, async (req) => {
    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { id: req.sessao!.userId } });
    return usuarioPublico(u);
  });
};
