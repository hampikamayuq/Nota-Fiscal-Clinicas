/**
 * Endereço a partir do CEP, pelo ViaCEP.
 *
 * A DPS aceita nota sem endereço do tomador, mas a clínica sempre informa CEP +
 * número — é o que o portal fazia por ela. O ViaCEP é público, sem chave, e
 * devolve inclusive o código IBGE do município, que o leiaute exige em `cMun`.
 *
 * Falhou o ViaCEP? A emissão segue sem endereço, ou com endereço digitado — a
 * consulta é conveniência, não dependência.
 */

export type EnderecoConsultado = {
  /** Código IBGE do município (7 dígitos). */
  codigoMunicipio: string;
  /** CEP, só dígitos. */
  cep: string;
  logradouro: string;
  bairro: string;
  municipio: string;
  uf: string;
};

export class CepError extends Error {
  override name = 'CepError';
}

type RespostaViaCep = {
  erro?: boolean | string;
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
};

export async function consultarCep(cepBruto: string): Promise<EnderecoConsultado> {
  const cep = cepBruto.replace(/\D/g, '');
  if (cep.length !== 8) throw new CepError(`CEP deve ter 8 dígitos (recebido: "${cepBruto}")`);

  let dados: RespostaViaCep;
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8_000) });
    if (!resposta.ok) throw new CepError(`ViaCEP respondeu HTTP ${resposta.status}`);
    dados = (await resposta.json()) as RespostaViaCep; // dentro do try: HTML no lugar de JSON também é "indisponível"
  } catch (erro) {
    if (erro instanceof CepError) throw erro;
    throw new CepError(`ViaCEP indisponível: ${(erro as Error).message}`);
  }
  if (dados.erro) throw new CepError(`CEP ${cep} não encontrado`);
  if (!dados.ibge || !/^\d{7}$/.test(dados.ibge)) {
    throw new CepError(`ViaCEP não devolveu o código IBGE para o CEP ${cep}`);
  }

  return {
    cep,
    codigoMunicipio: dados.ibge,
    logradouro: dados.logradouro?.trim() || '',
    bairro: dados.bairro?.trim() || '',
    municipio: dados.localidade?.trim() || '',
    uf: dados.uf?.trim() || '',
  };
}
