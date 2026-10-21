import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Rotas } from '../app.ts';
import { PODE, exigirPapel } from '../auth.ts';
import { ErroHttp, exigir, usuario } from '../erros.ts';

const Params = z.object({ id: z.string().uuid() });
const Cancel = z.object({
  reasonCode: z.enum(['1', '2', '9']),
  justification: z.string().trim().min(15, 'justificativa com pelo menos 15 caracteres').max(255),
  /** A pessoa digita CANCELAR para confirmar (plano, §31). */
  confirmation: z.literal('CANCELAR', { errorMap: () => ({ message: 'digite CANCELAR para confirmar' }) }),
});

export const rotasEmission: Rotas = async (app, ctx) => {
  const emissao = () => {
    if (!ctx.emission) throw new ErroHttp(503, { erro: 'provedor_ausente', mensagem: 'Provedor fiscal não configurado neste servidor.' });
    return ctx.emission;
  };

  app.get('/api/invoices/:id/description', { preHandler: exigirPapel(PODE.ler) }, async (req) => {
    const { id } = Params.parse(req.params);
    await exigir(ctx.prisma.invoice, id, 'Nota');
    return emissao().description(id);
  });

  app.post('/api/invoices/:id/issue', { preHandler: exigirPapel(PODE.operarNotas) }, async (req) => {
    const { id } = Params.parse(req.params);
    await exigir(ctx.prisma.invoice, id, 'Nota');
    return emissao().issue(id, usuario(req));
  });

  app.post('/api/invoices/:id/sync', { preHandler: exigirPapel(PODE.operarNotas) }, async (req) => {
    const { id } = Params.parse(req.params);
    await exigir(ctx.prisma.invoice, id, 'Nota');
    return emissao().sync(id, usuario(req));
  });

  app.post('/api/invoices/:id/cancel', { preHandler: exigirPapel(PODE.cancelar) }, async (req) => {
    const { id } = Params.parse(req.params);
    const { reasonCode, justification } = Cancel.parse(req.body);
    await exigir(ctx.prisma.invoice, id, 'Nota');
    return emissao().cancel(id, { reasonCode, justification }, usuario(req));
  });

  /**
   * Webhook da Focus. Sem sessão: quem chama prova que é a Focus pelo valor
   * do cabeçalho Authorization combinado no cadastro do gatilho.
   */
  app.post('/api/webhooks/focus', async (req, reply) => {
    const segredo = ctx.focusWebhookSecret;
    if (!segredo) return reply.code(503).send({ erro: 'webhook_desligado', mensagem: 'Webhook não configurado.' });
    const recebido = Buffer.from(req.headers.authorization ?? '');
    const esperado = Buffer.from(segredo);
    if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
      return reply.code(401).send({ erro: 'nao_autorizado', mensagem: 'Credencial do webhook inválida.' });
    }
    const hash = createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex');
    const r = await emissao().handleWebhook('focus', req.body, hash);
    // Sem 2xx a Focus reenvia; a entrega repetida de um evento com erro é reprocessada.
    if (r.processingError) return reply.code(500).send({ ok: false, duplicado: r.duplicate, mensagem: r.processingError });
    return { ok: true, duplicado: r.duplicate };
  });
};
