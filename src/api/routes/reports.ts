import { z } from 'zod';
import type { Rotas } from '../app.ts';
import { PODE, exigirPapel } from '../auth.ts';
import { PAYMENT_METHODS } from '../../app/invoices/invoice-rules.ts';
import { MONTH_RE, currentMonth } from '../../app/invoices/period.ts';
import { nomeArquivo, paraCsv } from '../../app/reports/csv.ts';
import { ErroHttp } from '../erros.ts';
import { auditar } from '../auditoria.ts';
import { invoiceReport } from '../../app/reports/invoice-report.ts';
import { monthlyTrend } from '../../app/reports/trend.ts';

const TrendQuery = z.object({
  until: z.string().regex(MONTH_RE, 'mês no formato AAAA-MM').optional(),
  months: z.coerce.number().int().min(1).max(24).optional(),
});

const Filtros = z.object({
  month: z.string().regex(MONTH_RE, 'mês no formato AAAA-MM').optional(),
  company: z.string().uuid().optional(),
  payment: z.enum([...PAYMENT_METHODS, 'none']).optional(),
  situation: z.enum(['issued', 'cancelled', 'all']).optional(),
});

export const rotasReports: Rotas = async (app, ctx) => {
  /** Leitura agregada, como o summary: sem auditoria. */
  app.get('/api/reports/trend', { preHandler: exigirPapel(PODE.ler) }, async (req) => {
    const q = TrendQuery.parse(req.query);
    return monthlyTrend(ctx.prisma, q.until ?? currentMonth(), q.months ?? 12);
  });

  app.get('/api/reports/invoices', { preHandler: exigirPapel(PODE.ler) }, async (req) => {
    const f = Filtros.parse(req.query);
    const month = f.month ?? currentMonth();
    const situation = f.situation ?? 'all';
    const report = await invoiceReport(ctx.prisma, { month, companyId: f.company, payment: f.payment, situation });
    const token = req.sessao!.token;
    if (token) {
      await auditar(ctx.prisma, req, {
        action: 'REPORT_EXPORTED',
        entityType: 'Report',
        companyId: f.company ?? null,
        metadata: { month, company: f.company ?? null, payment: f.payment ?? null, situation, rows: report.rows.length, via: 'token', tokenName: token.name, format: 'json' },
      });
    }
    return report;
  });

  app.get('/api/reports/invoices.csv', { preHandler: exigirPapel(PODE.exportar) }, async (req, reply) => {
    const f = Filtros.parse(req.query);
    const month = f.month ?? currentMonth();
    const situation = f.situation ?? 'all';
    const report = await invoiceReport(ctx.prisma, { month, companyId: f.company, payment: f.payment, situation });
    if (report.truncated) throw new ErroHttp(422, { erro: 'relatorio_grande', mensagem: 'O relatório passa de 2000 notas. Filtre por empresa para exportar.' });
    const slug = f.company ? (await ctx.prisma.company.findUnique({ where: { id: f.company }, select: { slug: true } }))?.slug : undefined;
    const token = req.sessao!.token;
    await auditar(ctx.prisma, req, {
      action: 'REPORT_EXPORTED',
      entityType: 'Report',
      companyId: f.company ?? null,
      metadata: { month, company: f.company ?? null, payment: f.payment ?? null, situation, rows: report.rows.length, via: token ? 'token' : 'web', ...(token ? { tokenName: token.name } : {}) },
    });
    return reply.header('content-type', 'text/csv; charset=utf-8').header('cache-control', 'no-store').header('content-disposition', `attachment; filename="${nomeArquivo(month, slug)}"`).send(paraCsv(report));
  });
};
