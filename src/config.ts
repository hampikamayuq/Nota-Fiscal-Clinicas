/**
 * Configuração fiscal de cada empresa (empresas/<slug>/config.json).
 *
 * Uma pasta por empresa (CNPJ) da clínica; o slug é o nome da pasta.
 *
 * Regra de ouro deste arquivo: **o código não escolhe nada fiscal**. Código de
 * serviço, regime, tratamento do ISS — tudo vem do `config.json`, preenchido
 * com o contador. Se faltar, o processo recusa subir em vez de emitir uma nota
 * errada com um padrão inventado.
 */

import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { cnpjValido } from './dps/validate.ts';

const digitos = (n: number, rotulo: string) =>
  z
    .string()
    .regex(new RegExp(`^\\d{${n}}$`), `${rotulo} deve ter exatamente ${n} dígitos, sem pontuação`);

const digitos10 = z
  .string()
  .regex(/^\d{1,10}$/, 'codigoTributacaoMunicipal deve ter de 1 a 10 dígitos');

export const ConfigFiscalSchema = z.object({
  /**
   * CNPJ da clínica. Desde 08/2026 o padrão nacional aceita CNPJ alfanumérico
   * (`[0-9A-Z]{14}`); para o numérico, o dígito verificador é conferido.
   */
  cnpj: z
    .string()
    .regex(/^[0-9A-Z]{14}$/, 'cnpj deve ter 14 caracteres (dígitos ou letras maiúsculas), sem pontuação')
    .refine((v) => !/^\d{14}$/.test(v) || cnpjValido(v), 'cnpj com dígito verificador inválido'),
  razaoSocial: z.string().min(1).max(300),
  /** Como a empresa aparece na interface (ex.: "Clínica Sorriso"). Sem ele, vale a razão social. */
  nomeFantasia: z.string().min(1).max(100).optional(),
  /** Inscrição municipal, quando a prefeitura pedir (o Rio aceita sem). */
  inscricaoMunicipal: z.string().min(1).max(15).optional(),

  /** Código IBGE do município emissor (onde a clínica está estabelecida). */
  codigoMunicipioEmissor: digitos(7, 'codigoMunicipioEmissor'),
  /** Município onde o serviço é prestado. Igual ao emissor, salvo atendimento externo. */
  codigoMunicipioPrestacao: digitos(7, 'codigoMunicipioPrestacao').optional(),


  /**
   * Regime tributário. Valores do leiaute nacional:
   *   opSimpNac  1=Não optante, 2=MEI, 3=ME/EPP
   *   regApTribSN 1=Federais e municipal pelo SN, 2=ISSQN fora do SN, 3=Ambos fora (sublimite)
   *   regEspTrib  0=Nenhum, 1=Ato cooperado, 2=Estimativa, 3=Microempresa municipal,
   *               4=Notário ou registrador, 5=Profissional autônomo,
   *               6=Sociedade de profissionais, 9=Outros
   *
   * Sociedade de profissionais (regEspTrib=6) é comum em clínica médica e muda a
   * base do ISS — confirme com o contador antes de deixar em 0.
   */
  opSimpNac: z.enum(['1', '2', '3']),
  regApTribSN: z.enum(['1', '2', '3']).optional(),
  regEspTrib: z.enum(['0', '1', '2', '3', '4', '5', '6', '9']).default('0'),

  /** Código do serviço na tabela nacional (6 dígitos, derivado da LC 116). */
  codigoTributacaoNacional: digitos(6, 'codigoTributacaoNacional'),
  /**
   * Código de tributação municipal, quando a prefeitura exigir. O Rio de
   * Janeiro exige: é o complemento de 3 dígitos da tabela municipal (ex.:
   * `040303` + `001` = "Serviços prestados por clínica"). No XSD é um inteiro
   * de até 10 dígitos; zeros à esquerda são preservados como a tabela traz.
   */
  codigoTributacaoMunicipal: digitos10.optional(),
  /** Código NBS (9 dígitos), quando aplicável. */
  codigoNbs: digitos(9, 'codigoNbs').optional(),


  /**
   * ISSQN.
   *   tributacaoIssqn 1=Operação tributável, 2=Exportação, 3=Imunidade, 4=Não incidência
   *   retencaoIssqn   1=Não retido, 2=Retido pelo tomador, 3=Retido pelo intermediário
   */
  tributacaoIssqn: z.enum(['1', '2', '3', '4']).default('1'),
  retencaoIssqn: z.enum(['1', '2', '3']).default('1'),
  /**
   * Alíquota do ISS a destacar (`pAliq`, opcional; no Rio, clínica = 5).
   * Optante do Simples recolhe no DAS — se destaca ou não é decisão do contador.
   */
  aliquotaIss: z.number().min(0).max(9.99).optional(),

  /**
   * Carga tributária aproximada (Lei 12.741 — "de olho no imposto").
   *
   * O leiaute oferece dois jeitos, e o schema só aceita um por nota:
   *   - `pTotTribSN`: um percentual único, próprio do Simples Nacional;
   *   - `pTotTrib`: o trio federal / estadual / municipal, para os demais.
   * Optante do Simples (opSimpNac = 3) informa `percentualTributosSimples`;
   * os outros informam `percentualTributosFederais` (+ estaduais/municipais).
   */
  percentualTributosSimples: z.number().min(0).max(99.99).optional(),
  percentualTributosFederais: z.number().min(0).max(999.99).optional(),
  percentualTributosEstaduais: z.number().min(0).max(999.99).default(0),
  percentualTributosMunicipais: z.number().min(0).max(999.99).default(0),

  /**
   * PIS/COFINS (grupo `tribFed/piscofins`, opcional no leiaute).
   *   cst: 01 = alíquota básica (lucro presumido/real), 07 = isenta (Simples), ...
   *   tipoRetencao: 0 = PIS/COFINS/CSLL não retidos, 1 = PIS/COFINS retidos, ...
   * Omita o bloco para não emitir o grupo.
   */
  pisCofins: z
    .object({
      cst: z.string().regex(/^\d{2}$/, 'cst do PIS/COFINS tem 2 dígitos'),
      tipoRetencao: z.enum(['0', '1', '2', '3', '4']).default('0'),
    })
    .optional(),

  /**
   * IBS/CBS — reforma tributária (grupo `IBSCBS`, opcional no leiaute em 2026).
   *
   * Os valores vêm da tabela do fisco; para consulta médica presencial a
   * clínica usa: cIndOp 030101 (serviço prestado fisicamente sobre a pessoa no
   * estabelecimento do fornecedor), CST 000 (tributação integral), cClassTrib
   * 000001 (tributado integralmente). As alíquotas a SEFIN calcula. Omita o
   * bloco para não emitir o grupo.
   */
  ibsCbs: z
    .object({
      codigoIndicadorOperacao: digitos(6, 'ibsCbs.codigoIndicadorOperacao'),
      cst: digitos(3, 'ibsCbs.cst'),
      classificacaoTributaria: digitos(6, 'ibsCbs.classificacaoTributaria'),
      /** 0 = o destinatário é o próprio tomador (caso da consulta). */
      indicadorDestinatario: z.enum(['0', '1']).default('0'),
      /** Uso ou consumo pessoal (art. 57). Omita para não informar. */
      usoConsumoPessoal: z.enum(['0', '1']).optional(),
    })
    .optional(),

}).superRefine((c, ctx) => {
  if (c.opSimpNac === '3' && c.percentualTributosSimples === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['percentualTributosSimples'],
      message: 'optante do Simples Nacional (opSimpNac = 3) precisa de percentualTributosSimples',
    });
  }
  if (c.opSimpNac !== '3' && c.percentualTributosFederais === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['percentualTributosFederais'],
      message: 'não optante do Simples precisa de percentualTributosFederais',
    });
  }
});

export type ConfigFiscal = z.infer<typeof ConfigFiscalSchema>;

/** Erro de configuração: sempre acionável, sempre dizendo qual campo falta. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Valida um objeto no formato do config.json (arquivo ou Company.fiscalConfigJson), dizendo qual campo falha. */
export function validarConfigFiscal(bruto: unknown, origem: string): ConfigFiscal {
  const r = ConfigFiscalSchema.safeParse(bruto);
  if (!r.success) {
    const problemas = r.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    throw new ConfigError(`Configuração fiscal inválida em ${origem}:\n${problemas}`);
  }
  return r.data;
}

export function carregarConfigFiscal(caminho: string): ConfigFiscal {
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(caminho, 'utf8'));
  } catch (erro) {
    throw new ConfigError(
      `Não consegui ler a configuração fiscal em ${caminho}: ${(erro as Error).message}\n` +
        `Preencha com o contador, a partir de config.example.json.`,
    );
  }
  return validarConfigFiscal(bruto, caminho);
}
