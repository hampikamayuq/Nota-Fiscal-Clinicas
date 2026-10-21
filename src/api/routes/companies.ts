import { z } from 'zod';
import { ConfigFiscalSchema, type ConfigFiscal } from '../../config.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { Rotas } from '../app.ts';
import { PODE, exigirPapel } from '../auth.ts';
import { auditar } from '../auditoria.ts';
import { exigir, invalido, naoEncontrado } from '../erros.ts';

const Id = z.object({ id: z.string().uuid() });
/** O slug nomeia a pasta em empresas/ e a variável do token da Focus; por isso o formato é restrito e ele não muda depois. */
const Slug = z.object({ slug: z.string().min(2).max(40).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug só com minúsculas, dígitos e hífen (ex.: clinica-centro)') });

const PUBLICO = { id: true, slug: true, legalName: true, tradeName: true, cnpj: true, productionEnabled: true, fiscalConfigJson: true } as const;
type Linha = { id: string; slug: string; legalName: string; tradeName: string | null; cnpj: string; productionEnabled: boolean; fiscalConfigJson: unknown };
/** Para a lista: a emissora em si só sai em /emitter. `configured` diz se a empresa já pode emitir. */
const publica = ({ fiscalConfigJson, ...e }: Linha) => ({ ...e, configured: fiscalConfigJson !== null });

/** Só o que o JSON guarda: `undefined` não existe em JSON e o Prisma não o aceita. */
const json = (c: ConfigFiscal) => JSON.parse(JSON.stringify(c)) as Prisma.InputJsonValue;
const identidade = (c: ConfigFiscal) => ({ cnpj: c.cnpj, legalName: c.razaoSocial, tradeName: c.nomeFantasia ?? null, fiscalConfigJson: json(c) });
/** Os códigos do serviço da emissora viram o padrão fiscal dos serviços nesta empresa (exceções por serviço ficam na tela de Serviços). */
const padraoFiscal = (c: ConfigFiscal) => ({
  nationalTaxCode: c.codigoTributacaoNacional,
  municipalTaxCode: c.codigoTributacaoMunicipal ?? null,
  nbsCode: c.codigoNbs ?? null,
  issRate: c.aliquotaIss !== undefined ? c.aliquotaIss.toFixed(2) : null,
  taxationType: c.tributacaoIssqn,
  issWithholdingType: c.retencaoIssqn,
});

export const rotasCompanies: Rotas = async (app, ctx) => {
  app.get('/api/companies', { preHandler: exigirPapel(PODE.ler) }, async () =>
    (await ctx.prisma.company.findMany({ orderBy: { legalName: 'asc' }, select: PUBLICO })).map(publica),
  );

  /** Dados da emissora (formato do config.json). Só quem configura o fiscal. */
  app.get('/api/companies/:id/emitter', { preHandler: exigirPapel(PODE.configFiscal) }, async (req) => {
    const { id } = Id.parse(req.params);
    const e = await ctx.prisma.company.findUnique({ where: { id }, select: { fiscalConfigJson: true } });
    if (!e) throw naoEncontrado('Empresa');
    return e.fiscalConfigJson;
  });

  /** Assistente "Nova empresa": identidade + dados da emissora numa chamada; o padrão fiscal dos serviços nasce dos mesmos códigos. */
  app.post('/api/companies', { preHandler: exigirPapel(PODE.configFiscal) }, async (req, reply) => {
    const { slug, ...c } = Slug.and(ConfigFiscalSchema).parse(req.body);
    const e = await ctx.prisma.$transaction(async (tx) => {
      const criada = await tx.company.create({ data: { slug, ...identidade(c) }, select: PUBLICO });
      await tx.companyFiscalDefault.create({ data: { companyId: criada.id, ...padraoFiscal(c) } });
      await auditar(tx, req, { action: 'COMPANY_CREATED', entityType: 'Company', entityId: criada.id, companyId: criada.id });
      return criada;
    });
    return reply.code(201).send(publica(e));
  });

  /** Edita identidade e emissora; o padrão fiscal segue os códigos informados (a flag `active` dele não é tocada). */
  app.put('/api/companies/:id/emitter', { preHandler: exigirPapel(PODE.configFiscal) }, async (req) => {
    const { id } = Id.parse(req.params);
    const c = ConfigFiscalSchema.parse(req.body);
    await exigir(ctx.prisma.company, id, 'Empresa');
    const e = await ctx.prisma.$transaction(async (tx) => {
      const atual = await tx.company.update({ where: { id }, data: identidade(c), select: PUBLICO });
      const codigos = padraoFiscal(c);
      await tx.companyFiscalDefault.upsert({ where: { companyId: id }, create: { companyId: id, ...codigos }, update: codigos });
      await auditar(tx, req, { action: 'COMPANY_UPDATED', entityType: 'Company', entityId: id, companyId: id });
      return atual;
    });
    return publica(e);
  });

  /** Liga/desliga produção numa empresa. Só ADMIN, e só digitando o CNPJ dela. Sozinha não emite em produção: faltam as travas de ambiente. */
  app.post('/api/companies/:id/production', { preHandler: exigirPapel(PODE.producao) }, async (req) => {
    const { id } = Id.parse(req.params);
    const { enabled, cnpj } = z.object({ enabled: z.boolean(), cnpj: z.string() }).parse(req.body);
    const empresa = await ctx.prisma.company.findUnique({ where: { id } });
    if (!empresa) throw naoEncontrado('Empresa');
    if (cnpj.replace(/\D/g, '') !== empresa.cnpj) throw invalido(['cnpj: digite o CNPJ da empresa para confirmar']);
    const atual = await ctx.prisma.company.update({ where: { id }, data: { productionEnabled: enabled }, select: { id: true, productionEnabled: true } });
    await auditar(ctx.prisma, req, { action: enabled ? 'PRODUCTION_ENABLED' : 'PRODUCTION_DISABLED', entityType: 'Company', entityId: id, companyId: id });
    return atual;
  });
};
