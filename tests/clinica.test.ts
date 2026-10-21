/**
 * Carga inicial: lê todas as pastas de empresas/ e o cadastro.json opcional,
 * é idempotente e não apaga o que um ADMIN mudou.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarPrisma, type PrismaClient } from '../src/db/client.ts';
import { carregarClinica, lerCadastro, listarEmpresas } from '../src/db/clinica.ts';
import { ConfigError } from '../src/config.ts';
import { Prisma } from '../src/generated/prisma/client.ts';

try {
  process.loadEnvFile('.env');
} catch {
  /* sem .env */
}
const URL_TESTE = process.env.DATABASE_URL_TEST;
if (URL_TESTE && (URL_TESTE === process.env.DATABASE_URL || !/_test(\?|$)/.test(URL_TESTE))) {
  throw new Error('DATABASE_URL_TEST precisa ser diferente de DATABASE_URL e terminar em _test.');
}

/** Duas empresas a partir do exemplo versionado (uma no Simples, outra sociedade de profissionais) e o cadastro de exemplo. */
function pastaDeExemplo(): string {
  const pasta = mkdtempSync(join(tmpdir(), 'fiscal-empresas-'));
  const exemplo = JSON.parse(readFileSync('config.example.json', 'utf8')) as Record<string, unknown>;
  // A segunda empresa não é optante e não tem nome fantasia: o padrão é a razão social.
  const { percentualTributosSimples: _s, nomeFantasia: _n, ...semSimples } = exemplo;
  const empresas = {
    'clinica-a': { ...exemplo, cnpj: '12345678000195', razaoSocial: 'CLINICA A LTDA', nomeFantasia: 'Clínica A' },
    'clinica-b': { ...semSimples, cnpj: '11222333000181', razaoSocial: 'CLINICA B LTDA', opSimpNac: '1', regEspTrib: '6', percentualTributosFederais: 11.33 },
  };
  for (const [slug, config] of Object.entries(empresas)) {
    mkdirSync(join(pasta, slug));
    writeFileSync(join(pasta, slug, 'config.json'), JSON.stringify(config));
  }
  copyFileSync('cadastro.example.json', join(pasta, 'cadastro.json'));
  return pasta;
}

describe('arquivos', () => {
  it('cadastro.example.json é válido e converte reais em centavos', () => {
    const c = lerCadastro('cadastro.example.json');
    expect(c.profissionais.map((p) => p.conselho)).toEqual(['CRM', 'CRO']);
    expect(c.servicos[0]).toMatchObject({ nome: 'Consulta', valor: 40000, favorito: true });
    expect(c.modelos[1]!.itens.map((i) => i.valor)).toEqual([undefined, undefined]);
  });

  it('lista só pastas com config.json e recusa slug fora do formato', () => {
    const pasta = pastaDeExemplo();
    mkdirSync(join(pasta, 'sem-config'));
    expect(listarEmpresas(pasta)).toEqual(['clinica-a', 'clinica-b']);
    mkdirSync(join(pasta, 'Com Espaço'));
    writeFileSync(join(pasta, 'Com Espaço', 'config.json'), '{}');
    expect(() => listarEmpresas(pasta)).toThrow(ConfigError);
    expect(() => listarEmpresas(mkdtempSync(join(tmpdir(), 'vazia-')))).toThrow(/Nenhuma empresa/);
  });
});

describe.skipIf(!URL_TESTE)('carga no banco', () => {
  let prisma: PrismaClient;
  const pasta = pastaDeExemplo();

  beforeAll(async () => {
    prisma = criarPrisma(URL_TESTE);
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "ApiToken", "InvoicePayment", "InvoiceTemplateItem", "InvoiceTemplate", "WebhookEvent", "AuditLog", "FiscalAttempt", "InvoiceStatusHistory", "InvoiceItem", "Invoice", ' +
        '"CompanyServiceFiscalConfig", "CompanyFiscalDefault", "ProfessionalRQE", "Professional", "ServiceTemplate", "Company", "Patient", "User" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(() => prisma.$disconnect());

  it('cria empresas, padrão fiscal e cadastro, sem usuário e sem ligar produção', async () => {
    expect(await carregarClinica(prisma, pasta)).toEqual({ empresas: 2, padroesFiscais: 2, profissionais: 2, servicos: 2, modelos: 2 });
    expect(await prisma.user.count()).toBe(0);

    const empresas = await prisma.company.findMany({ orderBy: { slug: 'asc' }, include: { fiscalDefault: true } });
    expect(empresas.map((e) => [e.slug, e.cnpj, e.tradeName, e.productionEnabled])).toEqual([
      ['clinica-a', '12345678000195', 'Clínica A', false],
      ['clinica-b', '11222333000181', null, false],
    ]);
    for (const e of empresas) {
      expect(e.fiscalDefault).toMatchObject({ nationalTaxCode: '040101', municipalTaxCode: '001', nbsCode: '123012100', taxationType: '1', issWithholdingType: '1', active: true });
      expect(e.fiscalDefault?.issRate?.toString()).toBe('5');
      // A emissão lê a emissora do banco, no mesmo formato do arquivo.
      expect(e.fiscalConfigJson).toMatchObject({ cnpj: e.cnpj, codigoMunicipioEmissor: '3304557', codigoTributacaoNacional: '040101' });
    }

    const dentista = await prisma.professional.findFirstOrThrow({ where: { council: 'CRO' }, include: { rqes: true } });
    expect(dentista).toMatchObject({ crmNumber: '98765', crmState: 'SP', specialty: 'Odontologia' });
    expect(dentista.rqes).toEqual([]);

    const modelo = await prisma.invoiceTemplate.findUniqueOrThrow({ where: { name: 'Consulta Dra. Exemplo' }, include: { items: true } });
    expect(modelo.items.map((i) => [i.quantity, i.unitAmountCents])).toEqual([[1, 45000]]);
  });

  it('repetir não duplica nem desfaz o que um ADMIN mudou; empresa antiga sem emissora recebe a do arquivo', async () => {
    await prisma.serviceTemplate.updateMany({ where: { name: 'Consulta' }, data: { defaultAmountCents: 60000 } });
    await prisma.company.update({ where: { slug: 'clinica-b' }, data: { fiscalConfigJson: Prisma.DbNull } });
    expect(await carregarClinica(prisma, pasta)).toEqual({ empresas: 0, padroesFiscais: 0, profissionais: 0, servicos: 0, modelos: 0 });
    expect((await prisma.company.findUniqueOrThrow({ where: { slug: 'clinica-b' } })).fiscalConfigJson).toMatchObject({ cnpj: '11222333000181', opSimpNac: '1' });
    expect((await prisma.serviceTemplate.findFirstOrThrow({ where: { name: 'Consulta' } })).defaultAmountCents).toBe(60000);
    expect(await prisma.invoiceTemplate.count()).toBe(2);
  });

  it('mesmo CNPJ noutra pasta é erro, não uma segunda empresa', async () => {
    mkdirSync(join(pasta, 'clinica-c'));
    writeFileSync(join(pasta, 'clinica-c', 'config.json'), readFileSync(join(pasta, 'clinica-a', 'config.json')));
    await expect(carregarClinica(prisma, pasta)).rejects.toThrow(/já está cadastrado com o slug "clinica-a"/);
  });
});
