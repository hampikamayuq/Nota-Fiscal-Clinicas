/**
 * A API HTTP do Clínica Fiscal (Fastify).
 *
 * `criarApp` recebe as dependências e devolve a instância sem escutar porta:
 * os testes usam `app.inject`, o `main.ts` chama `listen`. Todas as rotas
 * ficam em /api e devolvem JSON; erros de regra, validação e banco viram
 * códigos HTTP num só lugar (o handler abaixo).
 */

import Fastify, { type FastifyInstance, type FastifyPluginAsync, type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { Prisma, type PrismaClient } from '../generated/prisma/client.ts';
import { InvoiceService } from '../app/invoices/invoice-service.ts';
import { EmissionService, type EmissionDeps } from '../app/invoices/emission-service.ts';
import { TemplateService } from '../app/invoices/template-service.ts';
import { InvoiceRuleError } from '../app/invoices/invoice-rules.ts';
import { lerBearer, lerSessao } from './auth.ts';
import { ErroHttp } from './erros.ts';
import { rotasAuth } from './routes/auth.ts';
import { rotasCompanies } from './routes/companies.ts';
import { rotasPatients } from './routes/patients.ts';
import { rotasProfessionals } from './routes/professionals.ts';
import { rotasServices } from './routes/services.ts';
import { rotasInvoices } from './routes/invoices.ts';
import { rotasEmission } from './routes/emission.ts';
import { rotasTemplates } from './routes/templates.ts';
import { rotasAudit } from './routes/audit.ts';
import { rotasReports } from './routes/reports.ts';

export type Contexto = {
  prisma: PrismaClient;
  invoices: InvoiceService;
  templates: TemplateService;
  /** null quando o servidor sobe sem provedor fiscal configurado. */
  emission: EmissionService | null;
  focusWebhookSecret: string | null;
  cookieSecure: boolean | 'auto';
};
export type Rotas = FastifyPluginAsync<Contexto>;

export type OpcoesApp = {
  prisma: PrismaClient;
  /** Assina o cookie de sessão. Mínimo 32 caracteres. */
  authSecret: string;
  /** 'auto' = Secure só quando o pedido chega por HTTPS (padrão). Atrás de proxy TLS, use true. */
  cookieSecure?: boolean | 'auto';
  /** IPs/faixas do proxy reverso em que se confia para X-Forwarded-*; sem isso, req.ip e req.protocol são os do proxy. */
  trustProxy?: string | boolean;
  logger?: boolean;
  /** Provedor fiscal e dados da emissora. Sem isto, emitir/cancelar respondem 503. */
  emission?: EmissionDeps;
  /** Valor que a Focus envia no cabeçalho Authorization do webhook. */
  focusWebhookSecret?: string;
  /** Pasta do build da interface (web/dist). Se existir, a API serve a interface no mesmo host. */
  webDist?: string;
  /** Nome da clínica na interface ("<nome> Fiscal") e na aba do navegador. CLINIC_NAME no ambiente. */
  clinicName?: string;
};

export async function criarApp(op: OpcoesApp): Promise<FastifyInstance> {
  if (op.authSecret.length < 32) throw new Error('authSecret precisa de pelo menos 32 caracteres.');
  const opcoes: FastifyServerOptions = {
    // A URL entra no log sem a query string: a busca de pacientes leva nome e CPF nela.
    logger: op.logger
      ? { serializers: { req: (r) => ({ method: r.method, url: r.url.split('?')[0] ?? r.url }) } }
      : false,
  };
  if (op.trustProxy) opcoes.trustProxy = op.trustProxy;
  const app = Fastify(opcoes);
  await app.register(cookie, { secret: op.authSecret });

  app.decorateRequest('sessao', null);
  app.addHook('onRequest', async (req, reply) => {
    const s = lerSessao(req) ?? (await lerBearer(req, op.prisma));
    if (!s) {
      req.sessao = null;
      return;
    }
    if (s.token) {
      req.sessao = s; // lerBearer já conferiu token e usuário no banco
      // Método apenas: o Fastify decodifica o caminho (/%61pi) antes de rotear, então condição na URL seria contornável.
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return reply.code(403).send({ erro: 'token_somente_leitura', mensagem: 'Tokens de acesso só consultam. Para alterar, use a interface.' });
      }
      return;
    }
    const u = await op.prisma.user.findUnique({ where: { id: s.userId }, select: { active: true, role: true } });
    req.sessao = u?.active ? { ...s, role: u.role } : null;
  });

  app.setErrorHandler((erro: unknown, req, reply) => {
    if (erro instanceof ErroHttp) return reply.code(erro.statusCode).send(erro.corpo);
    if (erro instanceof ZodError) {
      return reply.code(400).send({
        erro: 'validacao',
        mensagem: 'Dados inválidos.',
        problemas: erro.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`),
      });
    }
    if (erro instanceof InvoiceRuleError) return reply.code(422).send({ erro: 'regra', mensagem: erro.message });
    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      if (erro.code === 'P2002') {
        return reply.code(409).send({ erro: 'duplicado', mensagem: 'Já existe um registro com esse valor.', campos: erro.meta?.target ?? null });
      }
      if (erro.code === 'P2025') return reply.code(404).send({ erro: 'nao_encontrado', mensagem: 'Registro não encontrado.' });
      if (erro.code === 'P2003') return reply.code(422).send({ erro: 'referencia_invalida', mensagem: 'Referência a registro inexistente.' });
    }
    const status = typeof (erro as { statusCode?: unknown }).statusCode === 'number' ? (erro as { statusCode: number }).statusCode : 500;
    if (status >= 500) {
      req.log.error(erro);
      return reply.code(500).send({ erro: 'interno', mensagem: 'Falha inesperada. O detalhe está no log do servidor.' });
    }
    return reply.code(status).send({ erro: 'requisicao', mensagem: (erro as Error).message });
  });
  const webDist = op.webDist ? resolve(op.webDist) : null;
  const serveWeb = !!webDist && existsSync(resolve(webDist, 'index.html'));
  if (serveWeb) await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    // Rotas da interface (SPA) caem no index.html; /api nunca.
    if (serveWeb && req.method === 'GET' && !req.url.startsWith('/api')) return reply.sendFile('index.html');
    return reply.code(404).send({ erro: 'nao_encontrado', mensagem: `Rota ${req.method} ${req.url.split('?')[0]} não existe.` });
  });

  /** Para o balanceador: responde 200 só se o banco responde. Sem sessão e sem dados. */
  app.get('/api/health', async (_req, reply) => {
    try {
      await op.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  /** Marca da instalação, antes do login: a tela de entrada precisa dela. Sem dado sensível. */
  app.get('/api/branding', async () => ({ clinicName: op.clinicName ?? 'Clínica' }));

  const invoices = new InvoiceService(op.prisma);
  const ctx: Contexto = {
    prisma: op.prisma,
    invoices,
    templates: new TemplateService(op.prisma, invoices),
    emission: op.emission ? new EmissionService(op.prisma, invoices, op.emission) : null,
    focusWebhookSecret: op.focusWebhookSecret ?? null,
    cookieSecure: op.cookieSecure ?? 'auto',
  };
  for (const rotas of [rotasAuth, rotasCompanies, rotasPatients, rotasProfessionals, rotasServices, rotasInvoices, rotasEmission, rotasTemplates, rotasAudit, rotasReports]) {
    await app.register(rotas, ctx);
  }
  return app;
}
