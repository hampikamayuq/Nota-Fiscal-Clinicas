import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.ts';
import type { Rotas } from '../app.ts';
import { PODE, exigirPapel } from '../auth.ts';
import { auditar } from '../auditoria.ts';
import { ErroHttp, exigir, semUndefined } from '../erros.ts';
import { pickFiscal, type FiscalRow } from '../../app/invoices/fiscal-config-resolver.ts';

const Service = z.object({
  name: z.string().trim().min(2).max(120),
  defaultDescription: z.string().trim().min(3).max(2000),
  tussCode: z.string().trim().regex(/^\d{8}$/, 'TUSS tem 8 dígitos').optional().nullable(),
  tussVersion: z.string().trim().max(20).optional().nullable(),
  defaultAmountCents: z.number().int().min(0).max(100_000_000),
  allowDescriptionEdit: z.boolean().optional(),
  allowAmountEdit: z.boolean().optional(),
  favorite: z.boolean().optional(),
  category: z.string().trim().max(60).optional().nullable(),
  active: z.boolean().optional(),
});
const ServicePatch = Service.partial();
/** Campos que só ADMIN/FINANCE alteram: travam a própria recepção ou tiram o serviço do catálogo. */
const CAMPOS_GESTAO = ['allowDescriptionEdit', 'allowAmountEdit', 'active'] as const;
const exigirGestao = (role: string | undefined, dados: object) => {
  const tocados = CAMPOS_GESTAO.filter((c) => c in dados);
  if (tocados.length && !(PODE.cadastrarProfissionaisEServicos as readonly string[]).includes(role ?? '')) {
    throw new ErroHttp(403, { erro: 'sem_permissao', mensagem: 'Seu perfil edita nome, descrição, TUSS e valor; travas e ativação ficam com o financeiro.' });
  }
};

/**
 * Códigos do padrão nacional da NFS-e. O código não escolhe nenhum: só confere
 * o formato do que o contador cadastrou (cTribNac 6 dígitos, NBS 9 dígitos,
 * tribISSQN 1-4, tpRetISSQN 1-3).
 */
const FiscalConfig = z.object({
  nationalTaxCode: z.string().trim().regex(/^\d{6}$/, 'código de tributação nacional tem 6 dígitos'),
  municipalTaxCode: z.string().trim().max(20).optional().nullable(),
  nbsCode: z.string().trim().regex(/^\d{9}$/, 'NBS tem 9 dígitos').optional().nullable(),
  issRate: z
    .union([z.number(), z.string().trim().regex(/^\d{1,3}([.,]\d{1,2})?$/, 'alíquota em percentual, ex.: 5.00')])
    .transform((v) => String(v).replace(',', '.'))
    .refine((v) => Number(v) >= 0 && Number(v) <= 100, 'alíquota entre 0 e 100')
    .optional()
    .nullable(),
  taxationType: z.enum(['1', '2', '3', '4']),
  issWithholdingType: z.enum(['1', '2', '3']),
  pisCofinsConfigJson: z.record(z.unknown()).optional().nullable(),
  ibsCbsConfigJson: z.record(z.unknown()).optional().nullable(),
  additionalFiscalConfigJson: z.record(z.unknown()).optional().nullable(),
  active: z.boolean().optional(),
});
const Params = z.object({ id: z.string().uuid() });
const ParamsConfig = z.object({ companyId: z.string().uuid(), serviceId: z.string().uuid() });
const Busca = z.object({ company: z.string().uuid().optional(), todos: z.enum(['1']).optional() });

export const rotasServices: Rotas = async (app, ctx) => {
  app.get('/api/services', { preHandler: exigirPapel(PODE.ler) }, async (req) => {
    const { company, todos } = Busca.parse(req.query);
    const padrao = company ? await ctx.prisma.companyFiscalDefault.findUnique({ where: { companyId: company } }) : null;
    const lista = await ctx.prisma.serviceTemplate.findMany({
      where: todos ? {} : { active: true },
      orderBy: [{ favorite: 'desc' }, { name: 'asc' }],
      include: { fiscalConfigs: company ? { where: { companyId: company } } : false },
    });
    return lista.map(({ fiscalConfigs, ...t }) => {
      const efetiva = company ? pickFiscal(fiscalConfigs?.[0], padrao) : null;
      const propria = fiscalConfigs?.[0];
      return {
        ...t,
        // A que vale de fato nesta empresa (exceção ou padrão), e de onde ela vem.
        fiscalConfig: efetiva ? publica(efetiva.config) : null,
        fiscalSource: efetiva?.source ?? null,
        // A exceção do serviço, mesmo inativa (para o financeiro editar ou remover).
        serviceFiscalConfig: propria ? publica(propria) : null,
      };
    });
  });

  app.post('/api/services', { preHandler: exigirPapel(PODE.cadastrarServicos) }, async (req, reply) => {
    const dados = semUndefined(Service.parse(req.body));
    exigirGestao(req.sessao?.role, dados);
    const s = await ctx.prisma.serviceTemplate.create({ data: dados });
    await auditar(ctx.prisma, req, { action: 'SERVICE_CREATED', entityType: 'ServiceTemplate', entityId: s.id });
    return reply.code(201).send(s);
  });

  app.patch('/api/services/:id', { preHandler: exigirPapel(PODE.cadastrarServicos) }, async (req) => {
    const { id } = Params.parse(req.params);
    const patch = semUndefined(ServicePatch.parse(req.body));
    exigirGestao(req.sessao?.role, patch);
    await exigir(ctx.prisma.serviceTemplate, id, 'Serviço');
    const s = await ctx.prisma.serviceTemplate.update({ where: { id }, data: patch });
    await auditar(ctx.prisma, req, { action: 'SERVICE_UPDATED', entityType: 'ServiceTemplate', entityId: id, metadata: { campos: Object.keys(patch) } });
    return s;
  });

  app.put('/api/companies/:companyId/services/:serviceId/fiscal-config', { preHandler: exigirPapel(PODE.configFiscal) }, async (req) => {
    const { companyId, serviceId } = ParamsConfig.parse(req.params);
    const data = dadosFiscais(req.body);
    const c = await ctx.prisma.companyServiceFiscalConfig.upsert({
      where: { companyId_serviceTemplateId: { companyId, serviceTemplateId: serviceId } },
      create: { companyId, serviceTemplateId: serviceId, ...data },
      update: data,
    });
    await auditar(ctx.prisma, req, { action: 'FISCAL_CONFIG_UPDATED', entityType: 'CompanyServiceFiscalConfig', entityId: c.id, companyId, metadata: { serviceTemplateId: serviceId } });
    return publica(c);
  });

  /** Remove a exceção: o serviço volta a usar o padrão da empresa. */
  app.delete('/api/companies/:companyId/services/:serviceId/fiscal-config', { preHandler: exigirPapel(PODE.configFiscal) }, async (req) => {
    const { companyId, serviceId } = ParamsConfig.parse(req.params);
    const r = await ctx.prisma.companyServiceFiscalConfig.deleteMany({ where: { companyId, serviceTemplateId: serviceId } });
    if (r.count) await auditar(ctx.prisma, req, { action: 'FISCAL_CONFIG_UPDATED', entityType: 'CompanyServiceFiscalConfig', companyId, metadata: { serviceTemplateId: serviceId, voltouAoPadrao: true } });
    return { removida: r.count > 0 };
  });

  /** Configuração fiscal padrão da empresa (vale para todo serviço sem exceção). */
  app.get('/api/companies/:companyId/fiscal-default', { preHandler: exigirPapel(PODE.configFiscal) }, async (req) => {
    const { companyId } = z.object({ companyId: z.string().uuid() }).parse(req.params);
    const d = await ctx.prisma.companyFiscalDefault.findUnique({ where: { companyId } });
    return d ? publica(d) : null;
  });

  app.put('/api/companies/:companyId/fiscal-default', { preHandler: exigirPapel(PODE.configFiscal) }, async (req) => {
    const { companyId } = z.object({ companyId: z.string().uuid() }).parse(req.params);
    await exigir(ctx.prisma.company, companyId, 'Empresa');
    const data = dadosFiscais(req.body);
    const d = await ctx.prisma.companyFiscalDefault.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
    await auditar(ctx.prisma, req, { action: 'FISCAL_DEFAULT_UPDATED', entityType: 'CompanyFiscalDefault', entityId: d.id, companyId });
    return publica(d);
  });
};

const publica = (c: FiscalRow) => ({ ...c, issRate: c.issRate?.toString() ?? null });

function dadosFiscais(body: unknown) {
  const { pisCofinsConfigJson, ibsCbsConfigJson, additionalFiscalConfigJson, ...dados } = semUndefined(FiscalConfig.parse(body));
  const json = (v: Record<string, unknown> | null) => (v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue));
  return {
    ...dados,
    ...(pisCofinsConfigJson !== undefined ? { pisCofinsConfigJson: json(pisCofinsConfigJson) } : {}),
    ...(ibsCbsConfigJson !== undefined ? { ibsCbsConfigJson: json(ibsCbsConfigJson) } : {}),
    ...(additionalFiscalConfigJson !== undefined ? { additionalFiscalConfigJson: json(additionalFiscalConfigJson) } : {}),
  };
}
