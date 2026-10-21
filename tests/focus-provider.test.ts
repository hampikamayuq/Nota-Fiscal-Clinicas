/**
 * Provedor Focus NFe (NFS-e Nacional): mapeamento, cliente HTTP e desfechos.
 * `fetch` é substituído por vi.stubGlobal e a data é fixa — nenhum teste toca a rede.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FiscalProviderError, type FiscalError, type FiscalIssueInput, type FiscalTaker } from '../src/fiscal/invoice-provider.ts';
import { FocusClient } from '../src/fiscal/providers/focus/focus.client.ts';
import { MOEDA_REAL, centsToReais, fromFocusStatus, toFocusPayload } from '../src/fiscal/providers/focus/focus.mapper.ts';
import { FocusProvider, focusBaseUrl } from '../src/fiscal/providers/focus/focus.provider.ts';

const TOKEN = 'tok3n-S3CRETO-da-empresa';
const BASE = focusBaseUrl('homologation');
const AGORA = new Date('2026-10-02T17:30:05Z'); // 14:30:05 em São Paulo

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA);
});
afterAll(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

const paciente: FiscalTaker = { kind: 'INDIVIDUAL', cpf: '52998224725', name: 'Maria da Silva', email: 'maria@exemplo.com', phone: '(21) 99999-0000', address: null };

const entrada = (taker: FiscalTaker = paciente, extra: Partial<FiscalIssueInput> = {}): FiscalIssueInput => ({
  reference: 'exemplo-nota-0001',
  emitter: {
    cnpj: '12345678000195',
    legalName: 'CLINICA EXEMPLO LTDA',
    municipalityCode: '3304557',
    serviceMunicipalityCode: '3304557',
    simplesNacionalOption: '3',
    simplesNacionalRegime: '1',
    specialTaxRegime: '0',
    municipalRegistration: '1234567',
  },
  taker,
  description: 'Consulta médica realizada em 02/10/2026',
  amountCents: 35050,
  competenceDate: '2026-10-02',
  fiscal: {
    nationalTaxCode: '040101',
    municipalTaxCode: '001',
    nbsCode: '123012100',
    issRate: '5.00',
    taxationType: '1',
    issWithholdingType: '1',
    pisCofins: null,
    ibsCbs: null,
    additional: null,
  },
  ...extra,
});

// ─── fetch falso ─────────────────────────────────────────────────────────────

type Chamada = { url: string; method: string; headers: Record<string, string>; body: unknown };
type Resposta = { status: number; json?: unknown; text?: string } | Error;

function fetchFalso(...respostas: Resposta[]) {
  const chamadas: Chamada[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: init?.headers as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const r = respostas.shift();
    if (!r) throw new Error('fetchFalso: chamada inesperada');
    if (r instanceof Error) throw r;
    return new Response(r.text ?? JSON.stringify(r.json), { status: r.status });
  }) as typeof fetch;
  return { impl, chamadas };
}

function provedor(...respostas: Resposta[]) {
  const f = fetchFalso(...respostas);
  vi.stubGlobal('fetch', f.impl);
  const client = new FocusClient({ baseUrl: BASE, token: TOKEN });
  return { provider: new FocusProvider({ client }), chamadas: f.chamadas };
}

async function erroDe(promessa: Promise<unknown>): Promise<FiscalError> {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(FiscalProviderError);
  const e = erro as FiscalProviderError;
  expect(`${e.message} ${JSON.stringify(e.fiscal)}`).not.toContain(TOKEN);
  expect(`${e.message} ${JSON.stringify(e.fiscal)}`).not.toContain(Buffer.from(`${TOKEN}:`).toString('base64'));
  return e.fiscal;
}

const AUTORIZADA = {
  cnpj_prestador: '12345678000195',
  ref: 'exemplo-nota-0001',
  numero_rps: '73895',
  serie_rps: '1',
  status: 'autorizado',
  numero: '74798',
  codigo_verificacao: 'ABC123',
  data_emissao: '2026-10-02T14:30:05-03:00',
  url: 'https://www.nfse.gov.br/consultapublica/?tpc=1&chave=42054072212345678000123000000007479826039913594189',
  caminho_xml_nota_fiscal: '/arquivos/12345678000195_1/202610/XMLsNFSe/NFS4205-nfse.xml',
  url_danfse: 'https://focusnfe.s3.sa-east-1.amazonaws.com/arquivos/DANFSEs/NFS4205.pdf',
};

// ─── Mapper ──────────────────────────────────────────────────────────────────

describe('toFocusPayload', () => {
  it('monta o payload completo para paciente com CPF', () => {
    expect(toFocusPayload(entrada(), AGORA)).toEqual({
      data_emissao: '2026-10-02T14:30:05-03:00',
      data_competencia: '2026-10-02',
      emitente_dps: '1',
      codigo_municipio_emissora: '3304557',
      cnpj_prestador: '12345678000195',
      inscricao_municipal_prestador: '1234567',
      codigo_opcao_simples_nacional: '3',
      regime_tributario_simples_nacional: '1',
      regime_especial_tributacao: '0',
      cpf_tomador: '52998224725',
      razao_social_tomador: 'Maria da Silva',
      email_tomador: 'maria@exemplo.com',
      telefone_tomador: '21999990000',
      codigo_municipio_prestacao: '3304557',
      codigo_tributacao_nacional_iss: '040101',
      codigo_tributacao_municipal_iss: '001',
      codigo_nbs: '123012100',
      descricao_servico: 'Consulta médica realizada em 02/10/2026',
      valor_servico: 350.5,
      tributacao_iss: '1',
      tipo_retencao_iss: '1',
      percentual_aliquota_relativa_municipio: 5,
    });
  });

  it('empresa tomadora vai com CNPJ e sem os opcionais nulos', () => {
    const base = entrada({ kind: 'COMPANY', cnpj: '11222333000181', name: 'Empresa Pagadora SA', email: null, phone: null, address: null });
    const p = toFocusPayload(
      {
        ...base,
        emitter: { ...base.emitter, simplesNacionalOption: '1', simplesNacionalRegime: null, municipalRegistration: null },
        fiscal: { ...base.fiscal, municipalTaxCode: null, nbsCode: null, issRate: null },
      },
      AGORA,
    );
    expect(p).toMatchObject({ cnpj_tomador: '11222333000181', razao_social_tomador: 'Empresa Pagadora SA', codigo_opcao_simples_nacional: '1' });
    for (const ausente of [
      'cpf_tomador',
      'email_tomador',
      'telefone_tomador',
      'regime_tributario_simples_nacional',
      'inscricao_municipal_prestador',
      'codigo_tributacao_municipal_iss',
      'codigo_nbs',
      'percentual_aliquota_relativa_municipio',
    ]) {
      expect(p).not.toHaveProperty(ausente);
    }
  });

  it('estrangeiro sem documento vai com motivo de ausência de NIF; com documento, vai o NIF', () => {
    const semDoc = toFocusPayload(entrada({ kind: 'FOREIGN', foreignDocument: null, countryCode: 'US', name: 'John Smith', email: null, phone: null, address: null }), AGORA);
    expect(semDoc).toMatchObject({ motivo_ausencia_nif_tomador: '2', razao_social_tomador: 'John Smith' });
    expect(semDoc).not.toHaveProperty('nif_tomador');
    expect(semDoc).not.toHaveProperty('cpf_tomador');

    const comDoc = toFocusPayload(entrada({ kind: 'FOREIGN', foreignDocument: 'P1234567', countryCode: 'US', name: 'John Smith', email: null, phone: null, address: null }), AGORA);
    expect(comDoc).toMatchObject({ nif_tomador: 'P1234567' });
    expect(comDoc).not.toHaveProperty('motivo_ausencia_nif_tomador');
  });

  it('estrangeiro com endereço completo leva o grupo endExt (E0242 exige quando há NIF)', () => {
    const fora = { postalCode: 'SW1A 1AA', street: 'Downing Street', number: '10', complement: null, district: 'Westminster', city: 'London', state: 'England', municipalityCode: null };
    const estrangeiro = (address: FiscalTaker['address']): FiscalTaker => ({ kind: 'FOREIGN', foreignDocument: 'P1234567', countryCode: 'GB', name: 'John Smith', email: null, phone: null, address });
    expect(toFocusPayload(entrada(estrangeiro(fora)), AGORA)).toMatchObject({
      nif_tomador: 'P1234567',
      codigo_pais_ext_tomador: 'GB',
      cep_ext_tomador: 'SW1A 1AA',
      nome_cidade_ext_tomador: 'London',
      regiao_ext_tomador: 'England',
      logradouro_tomador: 'Downing Street',
      numero_tomador: '10',
      bairro_tomador: 'Westminster',
    });
    // Tomador no exterior = exportação para a SEFIN (E0330): vai o grupo comExt de consumo no Brasil, em reais.
    expect(toFocusPayload(entrada(estrangeiro(fora)), AGORA)).toMatchObject({
      modo_prestacao: '2',
      vinculo_negocio: '0',
      codigo_moeda: MOEDA_REAL,
      valor_servico_ext: 350.5,
      mecanismo_comercio_ext_prestador: '01',
      mecanismo_comercio_ext_tomador: '01',
      movimentacao_temporaria_bens: '1',
      mdic: '0',
    });
    expect(toFocusPayload(entrada(estrangeiro(null)), AGORA)).not.toHaveProperty('modo_prestacao');
    // Pela metade o grupo seria rejeitado: sem um dos campos, não vai nada de endereço.
    const enderecoDe = (address: FiscalTaker['address']) => Object.keys(toFocusPayload(entrada(estrangeiro(address)), AGORA)).filter((k) => /_ext_tomador$|^(logradouro|numero|bairro|complemento)_tomador$/.test(k));
    expect(enderecoDe({ ...fora, state: null })).toEqual([]);
    expect(enderecoDe({ ...fora, district: null })).toEqual([]);
    expect(enderecoDe(null)).toEqual([]);
  });

  it('tomador não identificado não gera nenhum campo de tomador', () => {
    const p = toFocusPayload(entrada({ kind: 'UNIDENTIFIED', name: 'Não identificado', email: 'x@y.z', phone: '21999990000', address: null }), AGORA);
    expect(Object.keys(p).filter((k) => k.endsWith('_tomador'))).toEqual([]);
  });

  it('não envia série nem número da DPS (numeração da Focus)', () => {
    const p = toFocusPayload(entrada(), AGORA);
    for (const ausente of ['serie_dps', 'numero_dps']) expect(p).not.toHaveProperty(ausente);
  });

  it('endereço do tomador é opcional: vai inteiro (com IBGE) ou não vai', () => {
    const endereco = { postalCode: '20040002', street: 'Avenida Rio Branco', number: '10', complement: 'sala 2', district: 'Centro', city: 'Rio de Janeiro', state: 'RJ', municipalityCode: '3304557' };
    expect(toFocusPayload(entrada({ ...paciente, address: endereco }), AGORA)).toMatchObject({
      cep_tomador: '20040002',
      codigo_municipio_tomador: '3304557',
      logradouro_tomador: 'Avenida Rio Branco',
      numero_tomador: '10',
      complemento_tomador: 'sala 2',
      bairro_tomador: 'Centro',
    });
    const enderecoDe = (address: FiscalTaker['address']) =>
      Object.keys(toFocusPayload(entrada({ ...paciente, address }), AGORA)).filter((k) => /^(cep|codigo_municipio|logradouro|numero|complemento|bairro)_tomador$/.test(k));
    // Sem IBGE, sem número ou sem logradouro o grupo endNac sairia pela metade e a nota seria rejeitada.
    expect(enderecoDe({ ...endereco, municipalityCode: null })).toEqual([]);
    expect(enderecoDe({ ...endereco, number: null })).toEqual([]);
    expect(enderecoDe({ ...endereco, street: null })).toEqual([]);
    expect(enderecoDe(null)).toEqual([]);
  });

  it('PIS/COFINS, IBS/CBS e carga tributária saem dos blocos JSON, com as chaves de ConfigFiscal', () => {
    const base = entrada();
    const p = toFocusPayload(
      {
        ...base,
        fiscal: {
          ...base.fiscal,
          pisCofins: { cst: '07', tipoRetencao: '0' },
          ibsCbs: { codigoIndicadorOperacao: '030101', cst: '000', classificacaoTributaria: '000001', indicadorDestinatario: '0' },
          additional: { percentualTributosSimples: 6, chaveDesconhecida: 'ignorada' },
        },
      },
      AGORA,
    );
    expect(p).toMatchObject({
      situacao_tributaria_pis_cofins: '07',
      tipo_retencao_pis_cofins: '0',
      finalidade_emissao: '0',
      codigo_indicador_operacao: '030101',
      ibs_cbs_situacao_tributaria: '000',
      ibs_cbs_classificacao_tributaria: '000001',
      indicador_destinatario: '0',
      percentual_total_tributos_simples_nacional: 6,
    });
    expect(JSON.stringify(p)).not.toContain('ignorada');
    expect(toFocusPayload(base, AGORA)).not.toHaveProperty('finalidade_emissao');
  });

  it('carga tributária vai só pelo Simples quando ele existe (pTotTribSN e pTotTrib são exclusivos)', () => {
    const base = entrada();
    const tot = (additional: unknown) => {
      const p = toFocusPayload({ ...base, fiscal: { ...base.fiscal, additional } }, AGORA);
      return Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith('percentual_total')));
    };
    expect(tot({ percentualTributosSimples: 6, percentualTributosEstaduais: 0, percentualTributosMunicipais: 0 })).toEqual({
      percentual_total_tributos_simples_nacional: 6,
    });
    expect(tot({ percentualTributosFederais: 11.33, percentualTributosEstaduais: 0, percentualTributosMunicipais: 0 })).toEqual({
      percentual_total_tributos_federais: 11.33,
      percentual_total_tributos_estaduais: 0,
      percentual_total_tributos_municipais: 0,
    });
  });

  it('converte centavos em reais sem resíduo de ponto flutuante', () => {
    const casos: Array<[number, string]> = [
      [0, '0'],
      [1, '0.01'],
      [10, '0.1'],
      [1999, '19.99'],
      [35050, '350.5'],
      [123456789, '1234567.89'],
      [2147483647, '21474836.47'],
    ];
    for (const [centavos, json] of casos) expect(JSON.stringify(centsToReais(centavos))).toBe(json);
    for (let c = 0; c < 20_000; c += 7) expect(centsToReais(c).toFixed(2)).toBe(`${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`);
    expect(() => centsToReais(10.5)).toThrow(RangeError);
    expect(() => centsToReais(-1)).toThrow(RangeError);
  });
});

describe('fromFocusStatus', () => {
  it('autorizado traz número, código de verificação, chave, PDF e XML', () => {
    expect(fromFocusStatus(AUTORIZADA, BASE)).toEqual({
      status: 'AUTHORIZED',
      providerStatus: 'autorizado',
      number: '74798',
      verificationCode: 'ABC123',
      pdfUrl: AUTORIZADA.url_danfse,
      xmlUrl: `${BASE}${AUTORIZADA.caminho_xml_nota_fiscal}`,
      error: null,
    });
  });

  it('erro_autorizacao vira REJECTED TAX_AUTHORITY com todas as mensagens', () => {
    const r = fromFocusStatus({
      status: 'erro_autorizacao',
      ref: 'x',
      numero_rps: 1,
      erros: [
        { codigo: 'E0014', mensagem: 'DPS já existe em uma NFS-e.' },
        { codigo: 'E0312', mensagem: 'Código de tributação municipal inválido.', correcao: 'Informe o código da tabela do município.' },
      ],
    });
    expect(r).toMatchObject({ status: 'REJECTED', providerStatus: 'erro_autorizacao', number: null, error: { code: 'E0014', category: 'TAX_AUTHORITY', retryable: false } });
    expect(r.error?.technicalMessage).toContain('E0014: DPS já existe em uma NFS-e.');
    expect(r.error?.technicalMessage).toContain('E0312: Código de tributação municipal inválido. (correção: Informe o código da tabela do município.)');
    expect(r.error?.userMessage).not.toMatch(/E0014|DPS|ISS/);
  });

  it('processando e cancelado', () => {
    expect(fromFocusStatus({ status: 'processando_autorizacao', ref: 'x' })).toMatchObject({ status: 'PROCESSING', number: null, error: null });
    expect(fromFocusStatus({ ...AUTORIZADA, status: 'cancelado' })).toMatchObject({ status: 'CANCELLED', providerStatus: 'cancelado', number: '74798' });
  });

  it('status desconhecido ou corpo sem status lança em vez de adivinhar', () => {
    expect(() => fromFocusStatus({ status: 'em_analise' })).toThrow(FiscalProviderError);
    expect(() => fromFocusStatus({ numero: '1' })).toThrow(FiscalProviderError);
    expect(() => fromFocusStatus(null)).toThrow(FiscalProviderError);
  });
});

// ─── Cliente ─────────────────────────────────────────────────────────────────

describe('FocusClient', () => {
  it('autentica com Basic base64(token + ":") e manda JSON', async () => {
    const f = fetchFalso({ status: 202, json: { status: 'processando_autorizacao' } });
    vi.stubGlobal('fetch', f.impl);
    const client = new FocusClient({ baseUrl: `${BASE}/`, token: TOKEN });
    const r = await client.post('/v2/nfsen', { ref: 'a b/c' }, { valor_servico: 1 });
    expect(r).toEqual({ status: 202, body: { status: 'processando_autorizacao' } });
    expect(f.chamadas[0]).toMatchObject({
      url: 'https://homologacao.focusnfe.com.br/v2/nfsen?ref=a+b%2Fc',
      method: 'POST',
      body: { valor_servico: 1 },
    });
    expect(f.chamadas[0]?.headers.Authorization).toBe(`Basic ${Buffer.from(`${TOKEN}:`).toString('base64')}`);
    expect(f.chamadas[0]?.headers['Content-Type']).toBe('application/json');
  });

  it('não expõe o token ao ser serializado', () => {
    const client = new FocusClient({ baseUrl: BASE, token: TOKEN });
    expect(JSON.stringify(client)).not.toContain(TOKEN);
    expect(() => new FocusClient({ baseUrl: BASE, token: '' })).toThrow(/token/);
  });

  it('401 lança AUTHENTICATION sem vazar o token', async () => {
    const f = fetchFalso({ status: 401, text: `HTTP Basic: Access denied for ${TOKEN}` });
    vi.stubGlobal('fetch', f.impl);
    const erro = await erroDe(new FocusClient({ baseUrl: BASE, token: TOKEN }).get('/v2/nfsen/x'));
    expect(erro).toMatchObject({ category: 'AUTHENTICATION', retryable: false, code: 'focus_http_401' });
  });

  it('500 lança PROVIDER retryable', async () => {
    const f = fetchFalso({ status: 500, text: '<html>Internal Server Error</html>' });
    vi.stubGlobal('fetch', f.impl);
    const erro = await erroDe(new FocusClient({ baseUrl: BASE, token: TOKEN }).get('/v2/nfsen/x'));
    expect(erro).toMatchObject({ category: 'PROVIDER', retryable: true });
  });

  it('falha de rede lança NETWORK retryable, sem o token mesmo que o erro o cite', async () => {
    const f = fetchFalso(new TypeError(`fetch failed for user ${TOKEN}`));
    vi.stubGlobal('fetch', f.impl);
    const erro = await erroDe(new FocusClient({ baseUrl: BASE, token: TOKEN }).get('/v2/nfsen/x'));
    expect(erro).toMatchObject({ category: 'NETWORK', retryable: true, code: 'focus_network' });
  });

  it('tempo esgotado aborta a chamada e lança NETWORK retryable', async () => {
    const pendurado = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as typeof fetch;
    vi.stubGlobal('fetch', pendurado);
    const erro = await erroDe(new FocusClient({ baseUrl: BASE, token: TOKEN, timeoutMs: 15 }).get('/v2/nfsen/x'));
    expect(erro).toMatchObject({ category: 'NETWORK', retryable: true, code: 'focus_timeout' });
    expect(erro.technicalMessage).toContain('15 ms');
  });

  it('corpo que não é JSON lança', async () => {
    const f = fetchFalso({ status: 200, text: '<html>ok</html>' });
    vi.stubGlobal('fetch', f.impl);
    const erro = await erroDe(new FocusClient({ baseUrl: BASE, token: TOKEN }).get('/v2/nfsen/x'));
    expect(erro).toMatchObject({ category: 'UNKNOWN', retryable: false, code: 'focus_unreadable' });
  });
});

// ─── Provedor ────────────────────────────────────────────────────────────────

describe('FocusProvider', () => {
  it('202 na emissão vira PROCESSING e o POST leva ref e payload', async () => {
    const { provider, chamadas } = provedor({ status: 202, json: { status: 'processando_autorizacao', ref: 'exemplo-nota-0001', protocolo: 'abc' } });
    expect(provider.name).toBe('focus');
    expect(await provider.issue(entrada())).toEqual({
      status: 'PROCESSING',
      providerStatus: 'processando_autorizacao',
      number: null,
      verificationCode: null,
      pdfUrl: null,
      xmlUrl: null,
      error: null,
    });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({ url: `${BASE}/v2/nfsen?ref=exemplo-nota-0001`, method: 'POST' });
    expect(chamadas[0]?.body).toEqual(toFocusPayload(entrada(), AGORA));
  });

  it('422 de referência duplicada não falha: consulta e devolve o estado da nota', async () => {
    const { provider, chamadas } = provedor(
      { status: 422, json: { codigo: 'erro_validacao', mensagem: 'Já existe um DPS com esta referência.' } },
      { status: 200, json: AUTORIZADA },
    );
    expect(await provider.issue(entrada())).toMatchObject({ status: 'AUTHORIZED', number: '74798', error: null });
    expect(chamadas.map((c) => `${c.method} ${c.url}`)).toEqual([`POST ${BASE}/v2/nfsen?ref=exemplo-nota-0001`, `GET ${BASE}/v2/nfsen/exemplo-nota-0001`]);
  });

  it('400 e outros 422 viram REJECTED com erro VALIDATION, sem lançar', async () => {
    const { provider } = provedor(
      { status: 400, json: { codigo: 'requisicao_invalida', mensagem: 'O campo dfe.prestador.cpf_cnpj é obrigatório.' } },
      { status: 422, json: { codigo: 'erro_validacao', mensagem: 'Empresa não habilitada para NFSe Nacional.' } },
    );
    const r400 = await provider.issue(entrada());
    expect(r400).toMatchObject({ status: 'REJECTED', providerStatus: 'requisicao_invalida', error: { category: 'VALIDATION', code: 'requisicao_invalida', retryable: false } });
    expect(r400.error?.technicalMessage).toContain('O campo dfe.prestador.cpf_cnpj é obrigatório.');
    expect(r400.error?.userMessage).not.toContain('dfe.prestador');
    expect(await provider.issue(entrada())).toMatchObject({ status: 'REJECTED', error: { category: 'VALIDATION', code: 'erro_validacao' } });
  });

  it('401, 500 e rede na emissão lançam (sem desfecho)', async () => {
    expect(await erroDe(provedor({ status: 401, text: 'HTTP Basic: Access denied' }).provider.issue(entrada()))).toMatchObject({ category: 'AUTHENTICATION' });
    expect(await erroDe(provedor({ status: 503, text: 'Service Unavailable' }).provider.issue(entrada()))).toMatchObject({ category: 'PROVIDER', retryable: true });
    expect(await erroDe(provedor(new TypeError('fetch failed')).provider.issue(entrada()))).toMatchObject({ category: 'NETWORK', retryable: true });
    expect(await erroDe(provedor({ status: 429, json: { codigo: 'limite_excedido', mensagem: 'Muitas requisições' } }).provider.issue(entrada()))).toMatchObject({
      category: 'UNKNOWN',
      retryable: true,
    });
  });

  it('getStatus: autorizado mapeia a nota; 404 devolve null', async () => {
    const { provider, chamadas } = provedor({ status: 200, json: AUTORIZADA }, { status: 404, json: { codigo: 'nao_encontrado', mensagem: 'Nota fiscal não encontrada' } });
    expect(await provider.getStatus('ref com espaço')).toMatchObject({
      status: 'AUTHORIZED',
      number: '74798',
      verificationCode: 'ABC123',
      pdfUrl: AUTORIZADA.url_danfse,
      xmlUrl: `${BASE}${AUTORIZADA.caminho_xml_nota_fiscal}`,
    });
    expect(chamadas[0]?.url).toBe(`${BASE}/v2/nfsen/ref%20com%20espa%C3%A7o`);
    expect(await provider.getStatus('nao-existe')).toBeNull();
  });

  it('getStatus: erro_autorizacao vira REJECTED TAX_AUTHORITY', async () => {
    const { provider } = provedor({ status: 200, json: { status: 'erro_autorizacao', erros: [{ codigo: 'E0014', mensagem: 'Já existe.' }, { codigo: 'E1', mensagem: 'Outro.' }] } });
    const r = await provider.getStatus('x');
    expect(r).toMatchObject({ status: 'REJECTED', error: { category: 'TAX_AUTHORITY' } });
    expect(r?.error?.technicalMessage).toMatch(/E0014: Já existe\..*E1: Outro\./);
  });

  it('cancel: cancelado → CANCELLED, enviando só a justificativa', async () => {
    const { provider, chamadas } = provedor({ status: 200, json: { status: 'cancelado' } });
    expect(await provider.cancel({ reference: 'exemplo-nota-0001', reasonCode: '1', justification: 'Erro na emissão da nota fiscal' })).toEqual({ status: 'CANCELLED', providerStatus: 'cancelado' });
    expect(chamadas[0]).toMatchObject({ url: `${BASE}/v2/nfsen/exemplo-nota-0001`, method: 'DELETE', body: { justificativa: 'Erro na emissão da nota fiscal' } });
  });

  it('cancel: erro_cancelamento e recusa da Focus viram CANCELLATION_ERROR', async () => {
    const pedido = { reference: 'x', reasonCode: '9', justification: 'Serviço não foi prestado ao paciente' } as const;
    const { provider } = provedor(
      { status: 200, json: { status: 'erro_cancelamento', erros: [{ codigo: 'V999', mensagem: 'NFSe fora do prazo de cancelamento permitido', correcao: null }] } },
      { status: 422, json: { codigo: 'nfe_nao_autorizada', mensagem: 'Nota fiscal não autorizada não pode ser cancelada' } },
      { status: 200, json: { status: 'qualquer_coisa' } },
    );
    expect(await provider.cancel(pedido)).toMatchObject({
      status: 'CANCELLATION_ERROR',
      providerStatus: 'erro_cancelamento',
      error: { code: 'V999', category: 'TAX_AUTHORITY', technicalMessage: expect.stringContaining('fora do prazo') },
    });
    expect(await provider.cancel(pedido)).toMatchObject({ status: 'CANCELLATION_ERROR', providerStatus: 'nfe_nao_autorizada', error: { category: 'VALIDATION' } });
    expect(await erroDe(provider.cancel(pedido))).toMatchObject({ category: 'UNKNOWN' });
  });

  it('focusBaseUrl aponta para os dois ambientes', () => {
    expect(focusBaseUrl('homologation')).toBe('https://homologacao.focusnfe.com.br');
    expect(focusBaseUrl('production')).toBe('https://api.focusnfe.com.br');
  });
});
