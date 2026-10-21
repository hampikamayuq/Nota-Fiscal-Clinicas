/**
 * Carga inicial da clínica a partir da pasta `empresas/`:
 *
 *   empresas/<slug>/config.json  → a empresa (slug = nome da pasta), os dados
 *                                   da emissora e o padrão fiscal dos serviços,
 *                                   com os códigos do contador (o assistente
 *                                   "Nova empresa" da interface faz o mesmo)
 *   empresas/cadastro.json       → profissionais, serviços e modelos de nota
 *                                   (opcional; tudo isso também tem tela)
 *
 * Roda também no banco de produção: não cria usuário, não liga produção e só
 * acrescenta o que falta — o que um ADMIN mudou pela interface (preço,
 * descrição, código fiscal) fica como está. Pode repetir.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ConfigError, carregarConfigFiscal } from '../config.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import type { PrismaClient } from './client.ts';

/** Valores em reais no arquivo (450.00); centavos no banco. */
const reais = z.number().min(0).transform((v) => Math.round(v * 100));

const CadastroSchema = z.object({
  profissionais: z
    .array(
      z.object({
        nome: z.string().min(2).max(200),
        /** Sigla do conselho: CRM, CRO, CRP, CREFITO… Vai na nota como "<conselho>-<UF> <número>". */
        conselho: z.string().regex(/^[A-Z]{2,10}$/, 'sigla do conselho em maiúsculas (CRM, CRO, CRP…)').default('CRM'),
        numero: z.string().min(1).max(20),
        uf: z.string().length(2).transform((s) => s.toUpperCase()),
        especialidade: z.string().max(120).optional(),
        rqes: z.array(z.object({ numero: z.string().min(1).max(20), especialidade: z.string().min(2).max(120) })).max(10).default([]),
      }),
    )
    .default([]),
  servicos: z
    .array(
      z.object({
        nome: z.string().min(1),
        descricao: z.string().optional(),
        tuss: z.string().optional(),
        valor: reais,
        favorito: z.boolean().default(false),
        categoria: z.string().optional(),
      }),
    )
    .default([]),
  modelos: z
    .array(
      z.object({
        nome: z.string().min(1),
        favorito: z.boolean().default(false),
        /** `servico` é o nome do serviço (deste arquivo ou já cadastrado). Sem `valor`, vale o do serviço na hora de aplicar. */
        itens: z.array(z.object({ servico: z.string().min(1), quantidade: z.number().int().min(1).default(1), valor: reais.optional() })).min(1),
      }),
    )
    .default([]),
});
export type Cadastro = z.infer<typeof CadastroSchema>;

export function lerCadastro(caminho: string): Cadastro {
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(caminho, 'utf8'));
  } catch (erro) {
    throw new ConfigError(`Não consegui ler ${caminho}: ${(erro as Error).message}`);
  }
  const r = CadastroSchema.safeParse(bruto);
  if (!r.success) {
    throw new ConfigError(`${caminho} inválido:\n${r.error.issues.map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`).join('\n')}`);
  }
  return r.data;
}

/** Pastas de `empresas/` que têm config.json, em ordem. O slug vira variável de ambiente (FOCUS_TOKEN_..._<SLUG>), por isso o formato é restrito. */
export function listarEmpresas(pastaEmpresas: string): string[] {
  if (!existsSync(pastaEmpresas)) throw new ConfigError(`A pasta ${pastaEmpresas} não existe. Crie empresas/<slug>/config.json a partir de config.example.json.`);
  const slugs = readdirSync(pastaEmpresas, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(pastaEmpresas, d.name, 'config.json')))
    .map((d) => d.name)
    .sort();
  if (slugs.length === 0) throw new ConfigError(`Nenhuma empresa em ${pastaEmpresas}: crie <slug>/config.json a partir de config.example.json.`);
  for (const slug of slugs) {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new ConfigError(`Pasta "${slug}" em ${pastaEmpresas}: o slug só pode ter minúsculas, dígitos e hífen.`);
  }
  return slugs;
}

export type ResumoClinica = { empresas: number; padroesFiscais: number; profissionais: number; servicos: number; modelos: number };

export async function carregarClinica(prisma: PrismaClient, pastaEmpresas = './empresas'): Promise<ResumoClinica> {
  const resumo: ResumoClinica = { empresas: 0, padroesFiscais: 0, profissionais: 0, servicos: 0, modelos: 0 };

  for (const slug of listarEmpresas(pastaEmpresas)) {
    const c = carregarConfigFiscal(join(pastaEmpresas, slug, 'config.json'));
    const existente = await prisma.company.findUnique({ where: { cnpj: c.cnpj } });
    if (existente && existente.slug !== slug) {
      throw new ConfigError(`O CNPJ ${c.cnpj} já está cadastrado com o slug "${existente.slug}", não "${slug}". Renomeie a pasta antes de continuar.`);
    }
    // Os dados da emissora vão para o banco, de onde a emissão os lê; o arquivo é a fonte, o assistente da interface é a outra.
    const fiscalConfigJson = JSON.parse(JSON.stringify(c)) as Prisma.InputJsonValue;
    // productionEnabled nunca é tocado aqui: ligar produção é ato de um ADMIN, com auditoria.
    const empresa = existente ?? (resumo.empresas++, await prisma.company.create({ data: { slug, legalName: c.razaoSocial, tradeName: c.nomeFantasia ?? null, cnpj: c.cnpj, fiscalConfigJson } }));
    if (existente && existente.fiscalConfigJson === null) await prisma.company.update({ where: { id: existente.id }, data: { fiscalConfigJson } });
    if (await prisma.companyFiscalDefault.findUnique({ where: { companyId: empresa.id } })) continue;
    // O padrão fiscal da empresa vale para todo serviço do catálogo; exceções por serviço ficam para a tela de Serviços.
    await prisma.companyFiscalDefault.create({
      data: {
        companyId: empresa.id,
        nationalTaxCode: c.codigoTributacaoNacional,
        municipalTaxCode: c.codigoTributacaoMunicipal ?? null,
        nbsCode: c.codigoNbs ?? null,
        issRate: c.aliquotaIss !== undefined ? c.aliquotaIss.toFixed(2) : null,
        taxationType: c.tributacaoIssqn,
        issWithholdingType: c.retencaoIssqn,
      },
    });
    resumo.padroesFiscais++;
  }

  const caminhoCadastro = join(pastaEmpresas, 'cadastro.json');
  if (!existsSync(caminhoCadastro)) return resumo;
  const cadastro = lerCadastro(caminhoCadastro);

  for (const p of cadastro.profissionais) {
    const chave = { council: p.conselho, crmNumber: p.numero, crmState: p.uf };
    if (await prisma.professional.findUnique({ where: { council_crmNumber_crmState: chave } })) continue;
    await prisma.professional.create({
      data: { name: p.nome, ...chave, specialty: p.especialidade ?? null, rqes: { create: p.rqes.map((r) => ({ number: r.numero, specialty: r.especialidade })) } },
    });
    resumo.profissionais++;
  }

  for (const s of cadastro.servicos) {
    if (await prisma.serviceTemplate.findFirst({ where: { name: s.nome } })) continue;
    await prisma.serviceTemplate.create({
      data: { name: s.nome, defaultDescription: s.descricao ?? s.nome, tussCode: s.tuss ?? null, defaultAmountCents: s.valor, favorite: s.favorito, category: s.categoria ?? null },
    });
    resumo.servicos++;
  }

  for (const m of cadastro.modelos) {
    if (await prisma.invoiceTemplate.findUnique({ where: { name: m.nome } })) continue;
    const items = [];
    for (const [sortOrder, i] of m.itens.entries()) {
      const servico = await prisma.serviceTemplate.findFirst({ where: { name: i.servico } });
      if (!servico) throw new ConfigError(`Modelo "${m.nome}" em ${caminhoCadastro}: o serviço "${i.servico}" não existe (nem em servicos, nem no banco).`);
      items.push({ serviceTemplateId: servico.id, quantity: i.quantidade, unitAmountCents: i.valor ?? null, sortOrder });
    }
    await prisma.invoiceTemplate.create({ data: { name: m.nome, favorite: m.favorito, items: { create: items } } });
    resumo.modelos++;
  }
  return resumo;
}
