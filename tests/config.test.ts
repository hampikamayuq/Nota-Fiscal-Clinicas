import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carregarConfigFiscal, ConfigError } from '../src/config.ts';
import { criarEmissionDeps } from '../src/api/fiscal-setup.ts';

const escrever = (conteudo: unknown): string => {
  const caminho = join(mkdtempSync(join(tmpdir(), 'fiscal-config-')), 'config.json');
  writeFileSync(caminho, JSON.stringify(conteudo));
  return caminho;
};

/** O exemplo versionado precisa ser válido — é o ponto de partida da clínica. */
describe('config.example.json', () => {
  it('o exemplo versionado só falha pelo CNPJ zerado', () => {
    expect(() => carregarConfigFiscal('config.example.json')).toThrow(/cnpj/);
  });

  it('carrega e descreve o caso do Rio de Janeiro', () => {
    // O exemplo traz CNPJ zerado de propósito: ele só vira válido quando a
    // clínica põe o próprio. Aqui trocamos por um CNPJ de teste e validamos o resto.
    const exemplo = JSON.parse(readFileSync('config.example.json', 'utf8')) as Record<string, unknown>;
    const fiscal = carregarConfigFiscal(escrever({ ...exemplo, cnpj: '12345678000195' }));
    expect(fiscal.codigoMunicipioEmissor).toBe('3304557');
    expect(fiscal.codigoTributacaoNacional).toBe('040101');
    expect(fiscal.codigoTributacaoMunicipal).toBe('001');
    expect(fiscal.opSimpNac).toBe('3');
    expect(fiscal.percentualTributosSimples).toBeDefined();
    expect(fiscal.nomeFantasia).toBe('Clínica Exemplo');
  });
});

const BASE = {
  cnpj: '12345678000195',
  razaoSocial: 'CLINICA EXEMPLO LTDA',
  codigoMunicipioEmissor: '3304557',
  opSimpNac: '3',
  regApTribSN: '1',
  codigoTributacaoNacional: '040303',
  codigoTributacaoMunicipal: '001',
  percentualTributosSimples: 6,
};

describe('validação fiscal', () => {
  it('aceita a configuração base', () => {
    expect(() => carregarConfigFiscal(escrever(BASE))).not.toThrow();
  });

  it('optante do Simples sem percentualTributosSimples é recusado', () => {
    const { percentualTributosSimples: _, ...sem } = BASE;
    expect(() => carregarConfigFiscal(escrever(sem))).toThrow(/percentualTributosSimples/);
  });

  it('não optante precisa do percentual federal', () => {
    expect(() => carregarConfigFiscal(escrever({ ...BASE, opSimpNac: '1' }))).toThrow(
      /percentualTributosFederais/,
    );
  });

  it('recusa CNPJ com dígito verificador errado, mas aceita alfanumérico', () => {
    expect(() => carregarConfigFiscal(escrever({ ...BASE, cnpj: '12345678000196' }))).toThrow(
      /dígito verificador/,
    );
    expect(() => carregarConfigFiscal(escrever({ ...BASE, cnpj: '12ABC678000195' }))).not.toThrow();
  });

  it('recusa código municipal fora do formato', () => {
    expect(() => carregarConfigFiscal(escrever({ ...BASE, codigoTributacaoMunicipal: 'A1' }))).toThrow(
      /codigoTributacaoMunicipal/,
    );
  });

  it('lista todos os problemas de uma vez, com o nome do campo', () => {
    try {
      carregarConfigFiscal(escrever({ ...BASE, cnpj: '1', codigoMunicipioEmissor: '33' }));
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(ConfigError);
      expect((erro as Error).message).toMatch(/cnpj/);
      expect((erro as Error).message).toMatch(/codigoMunicipioEmissor/);
    }
  });
});

describe('emissora para a Focus', () => {
  const base = { id: '1', slug: 'x', cnpj: '12345678000195', legalName: 'X LTDA', productionEnabled: false };
  const pasta = mkdtempSync(join(tmpdir(), 'fiscal-empresas-'));
  const deps = criarEmissionDeps({ FISCAL_PROVIDER: 'focus', NFSE_EMPRESAS_DIR: pasta });

  it('vem do cadastro no banco (assistente), no formato do config.json', () => {
    const e = deps.emitterFor({ ...base, fiscalConfigJson: { ...BASE, nomeFantasia: 'X', pisCofins: { cst: '07' } } } as never);
    expect(e).toMatchObject({ cnpj: '12345678000195', legalName: 'CLINICA EXEMPLO LTDA', municipalityCode: '3304557', serviceMunicipalityCode: '3304557', simplesNacionalOption: '3', simplesNacionalRegime: '1', specialTaxRegime: '0' });
    expect(deps.fiscalDefaultsFor!({ ...base, fiscalConfigJson: { ...BASE, pisCofins: { cst: '07' } } } as never)).toMatchObject({ pisCofins: { cst: '07', tipoRetencao: '0' }, ibsCbs: null, additional: { percentualTributosSimples: 6 } });
  });

  it('sem cadastro vale o config.json da pasta; sem os dois, o erro diz onde preencher', () => {
    expect(() => deps.emitterFor({ ...base, fiscalConfigJson: null } as never)).toThrow(/Empresas → Configurar/);
    mkdirSync(join(pasta, 'x'));
    writeFileSync(join(pasta, 'x', 'config.json'), JSON.stringify(BASE));
    expect(deps.emitterFor({ ...base, fiscalConfigJson: null } as never)).toMatchObject({ municipalityCode: '3304557' });
  });

  it('cadastro com CNPJ diferente do da empresa é recusado', () => {
    expect(() => deps.emitterFor({ ...base, fiscalConfigJson: { ...BASE, cnpj: '11222333000181' } } as never)).toThrow(/CNPJ/);
  });
});
