import { afterEach, describe, expect, it, vi } from 'vitest';
import { consultarCep, CepError } from '../src/cep.ts';

const responde = (corpo: unknown, status = 200) => vi.stubGlobal('fetch', async () => new Response(JSON.stringify(corpo), { status }));
const cai = (mensagem: string) =>
  vi.stubGlobal('fetch', async () => {
    throw new Error(mensagem);
  });
afterEach(() => vi.unstubAllGlobals());

const CENTRO = {
  cep: '20040-002',
  logradouro: 'Avenida Rio Branco',
  bairro: 'Centro',
  localidade: 'Rio de Janeiro',
  uf: 'RJ',
  ibge: '3304557',
};

describe('consulta de CEP', () => {
  it('devolve logradouro, bairro e o IBGE que o leiaute exige', async () => {
    responde(CENTRO);
    expect(await consultarCep('20040-002')).toEqual({
      cep: '20040002',
      codigoMunicipio: '3304557',
      logradouro: 'Avenida Rio Branco',
      bairro: 'Centro',
      municipio: 'Rio de Janeiro',
      uf: 'RJ',
    });
  });

  it('recusa CEP malformado antes de ir à rede', async () => {
    cai('não era para chamar a rede');
    await expect(consultarCep('2204')).rejects.toThrow(CepError);
  });

  it('CEP inexistente e rede fora viram CepError, não exceção genérica', async () => {
    responde({ erro: true });
    await expect(consultarCep('99999999')).rejects.toThrow(/não encontrado/);
    cai('ECONNRESET');
    await expect(consultarCep('20040002')).rejects.toThrow(/indisponível/);
  });
});
