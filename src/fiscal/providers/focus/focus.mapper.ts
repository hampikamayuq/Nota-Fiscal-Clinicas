/**
 * Tradução pura entre o contrato neutro e o JSON plano da Focus (NFS-e Nacional).
 *
 * Só entram campos confirmados em campos.focusnfe.com.br/nfse_nacional/EmissaoDPSXml.html
 * (cada um corresponde a uma tag da DPS nacional). Nenhum código tributário
 * nasce aqui: tudo vem de `input.emitter` e `input.fiscal`, isto é, do contador.
 */

import { FiscalProviderError, type FiscalIssueInput, type FiscalStatus, type FiscalStatusResult, type FiscalTaker } from '../../invoice-provider.ts';
import { enderecoExteriorCompleto } from '../../../app/invoices/invoice-rules.ts';
import { SP_OFFSET_MIN } from '../../../app/invoices/period.ts';
import { taxAuthorityFiscalError, unreadableFiscalError } from './focus.errors.ts';
import { FocusStatusBodySchema } from './focus.schemas.ts';

/**
 * `dhEmi` com o offset de São Paulo explícito em vez do relógio do servidor:
 * um container em UTC produziria uma data de emissão três horas no futuro, e
 * data de emissão é campo fiscal.
 */
function formatarDhEmi(instante: Date): string {
  const local = new Date(instante.getTime() + SP_OFFSET_MIN * 60_000);
  const p = (n: number, casas = 2) => String(n).padStart(casas, '0');
  const sinal = SP_OFFSET_MIN <= 0 ? '-' : '+';
  const abs = Math.abs(SP_OFFSET_MIN);
  return (
    `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}` +
    `T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}` +
    `${sinal}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}

type Payload = Record<string, unknown>;

/** Centavos inteiros → reais. Divisão única de inteiro por 100: o JSON sai com no máximo 2 casas. */
export function centsToReais(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError(`Valor em centavos inválido: ${cents}`);
  return cents / 100;
}

/** Remove null, undefined e string vazia: campo opcional ausente não vai no JSON. */
const semVazios = (o: Payload): Payload => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''));

/** Copia de `origem` as chaves de `mapa` (nome nosso → nome Focus) que tiverem valor escalar. */
function renomear(origem: unknown, mapa: Record<string, string>): Payload {
  if (typeof origem !== 'object' || origem === null) return {};
  const o = origem as Record<string, unknown>;
  const saida: Payload = {};
  for (const [nosso, focus] of Object.entries(mapa)) {
    const v = o[nosso];
    if (typeof v === 'string' || typeof v === 'number') saida[focus] = v;
  }
  return saida;
}

// ponytail: pisCofins / ibsCbs / additional são JSON livre no banco. Assumo as
// mesmas chaves de `ConfigFiscal` (src/config.ts), que é o vocabulário que a
// integração direta já usa. Chave desconhecida é ignorada, não repassada.
// Confirmar em homologação emitindo um serviço com cada bloco preenchido.
const PIS_COFINS = { cst: 'situacao_tributaria_pis_cofins', tipoRetencao: 'tipo_retencao_pis_cofins' };
const IBS_CBS = {
  codigoIndicadorOperacao: 'codigo_indicador_operacao',
  cst: 'ibs_cbs_situacao_tributaria',
  classificacaoTributaria: 'ibs_cbs_classificacao_tributaria',
  indicadorDestinatario: 'indicador_destinatario',
  usoConsumoPessoal: 'consumidor_final',
};
const TOTAL_TRIBUTOS = {
  percentualTributosSimples: 'percentual_total_tributos_simples_nacional',
  percentualTributosFederais: 'percentual_total_tributos_federais',
  percentualTributosEstaduais: 'percentual_total_tributos_estaduais',
  percentualTributosMunicipais: 'percentual_total_tributos_municipais',
};

const TELEFONE_MIN = 6;
const TELEFONE_MAX = 20;

/** Endereço é opcional na DPS, mas o grupo endNac vai inteiro ou não vai: pela metade a nota é rejeitada. */
function enderecoNacional(a: FiscalTaker['address']): Payload {
  if (!a?.postalCode || !a.municipalityCode || !a.street || !a.number) return {};
  return {
    cep_tomador: a.postalCode,
    codigo_municipio_tomador: a.municipalityCode,
    logradouro_tomador: a.street,
    numero_tomador: a.number,
    complemento_tomador: a.complement,
    bairro_tomador: a.district,
  };
}

function tomador(t: FiscalTaker): Payload {
  // Nota sem tomador é legítima no padrão nacional: nenhum campo *_tomador.
  if (t.kind === 'UNIDENTIFIED') return {};

  const fone = t.phone?.replace(/\D/g, '') ?? '';
  const contato: Payload = {
    razao_social_tomador: t.name,
    email_tomador: t.email,
    telefone_tomador: fone.length >= TELEFONE_MIN && fone.length <= TELEFONE_MAX ? fone : null,
  };
  if (t.kind === 'INDIVIDUAL') return { cpf_tomador: t.cpf, ...contato, ...enderecoNacional(t.address) };
  if (t.kind === 'COMPANY') return { cnpj_tomador: t.cnpj, ...contato, ...enderecoNacional(t.address) };
  // ponytail: estrangeiro sem NIF vai com motivo '2' (não exigência do NIF), o
  // mesmo que o portal nacional usa; o contrato não traz o motivo.
  const id = t.foreignDocument ? { nif_tomador: t.foreignDocument } : { motivo_ausencia_nif_tomador: '2' };
  return { ...id, ...contato, ...enderecoExterior(t.countryCode, t.address) };
}

/** Grupo endExt: vai inteiro ou não vai. Com NIF a SEFIN exige (E0242); a emissão barra antes. */
function enderecoExterior(pais: string, a: FiscalTaker['address']): Payload {
  if (!a || !enderecoExteriorCompleto(pais, a)) return {};
  return {
    codigo_pais_ext_tomador: pais,
    cep_ext_tomador: a.postalCode,
    nome_cidade_ext_tomador: a.city,
    regiao_ext_tomador: a.state,
    logradouro_tomador: a.street,
    numero_tomador: a.number,
    complemento_tomador: a.complement,
    bairro_tomador: a.district,
  };
}


/**
 * Código da moeda do grupo comExt. ponytail: 790 = Real na tabela de moedas do
 * Banco Central, que o leiaute nacional usa; conferido em homologação.
 */
export const MOEDA_REAL = '790';

/**
 * Tomador no exterior é exportação para a SEFIN, que exige o grupo comExt (E0330).
 * Paciente estrangeiro atendido na clínica e pagando em reais: consumo no Brasil,
 * sem vínculo, sem mecanismo de fomento, sem movimentação de bens, fora do MDIC.
 */
function comercioExterior(input: FiscalIssueInput): Payload {
  const t = input.taker;
  if (t.kind !== 'FOREIGN' || !enderecoExteriorCompleto(t.countryCode, t.address)) return {};
  return {
    modo_prestacao: '2',
    vinculo_negocio: '0',
    codigo_moeda: MOEDA_REAL,
    valor_servico_ext: centsToReais(input.amountCents),
    mecanismo_comercio_ext_prestador: '01',
    mecanismo_comercio_ext_tomador: '01',
    movimentacao_temporaria_bens: '1',
    mdic: '0',
  };
}

/** totTrib é uma escolha no XSD: pTotTribSN (Simples) OU o trio pTotTrib. Com o do Simples, o trio sai. */
function totalTributos(additional: unknown): Payload {
  const t = renomear(additional, TOTAL_TRIBUTOS);
  return t.percentual_total_tributos_simples_nacional === undefined
    ? t
    : { percentual_total_tributos_simples_nacional: t.percentual_total_tributos_simples_nacional };
}

export function toFocusPayload(input: FiscalIssueInput, now: Date): Payload {
  const { emitter, fiscal } = input;
  const ibsCbs = renomear(fiscal.ibsCbs, IBS_CBS);
  return semVazios({
    // ponytail: serie_dps e numero_dps omitidos de propósito. A Focus numera pelo
    // cadastro da empresa (serie_nfsen_* / proximo_numero_nfsen_*, "calculado
    // automaticamente") e o exemplo "Padrão" do guia oficial não os envia, mas a
    // lista de campos os marca como obrigatórios. Confirmar na 1ª emissão em
    // homologação; se rejeitar, o contrato precisa passar série/número.
    data_emissao: formatarDhEmi(now),
    data_competencia: input.competenceDate,
    emitente_dps: '1', // tpEmit: quem emite é sempre o prestador
    codigo_municipio_emissora: emitter.municipalityCode,
    cnpj_prestador: emitter.cnpj,
    // razao_social_prestador não vai: a Focus usa o cadastro da empresa, e o
    // padrão nacional rejeita xNome do prestador quando ele é o emitente.
    inscricao_municipal_prestador: emitter.municipalRegistration,
    codigo_opcao_simples_nacional: emitter.simplesNacionalOption,
    regime_tributario_simples_nacional: emitter.simplesNacionalRegime,
    regime_especial_tributacao: emitter.specialTaxRegime,
    ...tomador(input.taker),
    ...comercioExterior(input),
    codigo_municipio_prestacao: emitter.serviceMunicipalityCode,
    codigo_tributacao_nacional_iss: fiscal.nationalTaxCode,
    codigo_tributacao_municipal_iss: fiscal.municipalTaxCode,
    codigo_nbs: fiscal.nbsCode,
    descricao_servico: input.description,
    valor_servico: centsToReais(input.amountCents),
    tributacao_iss: fiscal.taxationType,
    tipo_retencao_iss: fiscal.issWithholdingType,
    percentual_aliquota_relativa_municipio: fiscal.issRate === null ? null : Number(fiscal.issRate),
    ...renomear(fiscal.pisCofins, PIS_COFINS),
    ...totalTributos(fiscal.additional),
    // finNFSe só tem o valor 0 (NFS-e regular) e só vai junto com o grupo IBS/CBS.
    ...(Object.keys(ibsCbs).length ? { finalidade_emissao: '0', ...ibsCbs } : {}),
  });
}

const STATUS: Record<string, FiscalStatus> = {
  processando_autorizacao: 'PROCESSING',
  autorizado: 'AUTHORIZED',
  cancelado: 'CANCELLED',
  erro_autorizacao: 'REJECTED',
  negado: 'REJECTED',
};

/**
 * Corpo do GET /v2/nfsen/{ref} (ou do 202 da emissão) → resultado do contrato.
 * `baseUrl` (host da API) transforma `caminho_xml_nota_fiscal` em URL absoluta.
 */
export function fromFocusStatus(body: unknown, baseUrl = ''): FiscalStatusResult {
  const lido = FocusStatusBodySchema.safeParse(body);
  if (!lido.success) throw new FiscalProviderError(unreadableFiscalError(`Resposta da Focus fora do formato esperado: ${lido.error.message}`));
  const b = lido.data;
  const status = STATUS[b.status];
  // Status desconhecido não é adivinhado: a nota fica como está até alguém olhar.
  if (!status) throw new FiscalProviderError(unreadableFiscalError(`Status desconhecido da Focus: "${b.status}"`));

  const emitida = status === 'AUTHORIZED' || status === 'CANCELLED';
  return {
    status,
    providerStatus: b.status,
    number: emitida ? (b.numero ?? null) : null,
    verificationCode: emitida ? (b.codigo_verificacao ?? null) : null,
    pdfUrl: emitida ? (b.url_danfse ?? null) : null,
    // ponytail: `caminho_xml_nota_fiscal` é um caminho relativo ao host da API;
    // assumo que basta prefixar o host. Confirmar em homologação se o download
    // exige o mesmo Basic auth.
    xmlUrl: emitida && b.caminho_xml_nota_fiscal ? (/^https?:\/\//.test(b.caminho_xml_nota_fiscal) ? b.caminho_xml_nota_fiscal : baseUrl + b.caminho_xml_nota_fiscal) : null,
    error: status === 'REJECTED' ? taxAuthorityFiscalError(b.status, b.erros ?? []) : null,
  };
}
