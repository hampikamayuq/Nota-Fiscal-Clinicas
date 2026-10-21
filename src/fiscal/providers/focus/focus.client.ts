/**
 * Cliente HTTP mínimo da Focus NFe: Basic auth, JSON e tempo limite.
 *
 * Devolve `{ status, body }` para 2xx e 4xx de negócio; lança
 * `FiscalProviderError` quando não há desfecho (rede, tempo esgotado, 401/403,
 * 5xx, corpo que não é JSON). Sem retentativa aqui: quem decide é o serviço.
 */

import { FiscalProviderError } from '../../invoice-provider.ts';
import { httpFiscalError, networkFiscalError, unreadableFiscalError } from './focus.errors.ts';

const DEFAULT_TIMEOUT_MS = 20_000;

export type FocusClientOptions = { baseUrl: string; token: string; timeoutMs?: number };
export type FocusResponse = { status: number; body: unknown };

export class FocusClient {
  /** Host da API, sem barra final (ex.: https://homologacao.focusnfe.com.br). */
  readonly baseUrl: string;
  // Campos #privados: o token não aparece em console.log / JSON.stringify do cliente.
  readonly #token: string;
  readonly #authorization: string;
  readonly #timeoutMs: number;

  constructor(options: FocusClientOptions) {
    if (!options.token) throw new Error('FocusClient: token da empresa ausente.');
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#token = options.token;
    // Usuário = token da empresa, senha vazia (doc: reference/autenticacao).
    this.#authorization = `Basic ${Buffer.from(`${options.token}:`).toString('base64')}`;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  post(path: string, query: Record<string, string>, body: unknown): Promise<FocusResponse> {
    return this.#request('POST', `${path}?${new URLSearchParams(query)}`, body);
  }

  get(path: string): Promise<FocusResponse> {
    return this.#request('GET', path);
  }

  delete(path: string, body: unknown): Promise<FocusResponse> {
    return this.#request('DELETE', path, body);
  }

  /** Cinto e suspensório: nada que vá para uma mensagem carrega o token. */
  #semToken(texto: string): string {
    return texto.replaceAll(this.#token, '***').replaceAll(this.#authorization, 'Basic ***');
  }

  async #request(method: string, pathWithQuery: string, body?: unknown): Promise<FocusResponse> {
    const chamada = `${method} ${pathWithQuery}`;
    const signal = AbortSignal.timeout(this.#timeoutMs);
    let status: number;
    let text: string;
    try {
      const response = await fetch(this.baseUrl + pathWithQuery, {
        method,
        signal,
        headers: { Authorization: this.#authorization, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      status = response.status;
      text = await response.text(); // dentro do try: o tempo limite também cobre a leitura do corpo
    } catch (erro) {
      const detalhe = signal.aborted ? `tempo esgotado após ${this.#timeoutMs} ms` : this.#semToken(erro instanceof Error ? erro.message : String(erro));
      throw new FiscalProviderError(networkFiscalError(`Focus ${chamada}: ${detalhe}`, signal.aborted));
    }

    // 401 vem como text/html ("HTTP Basic: Access denied"); 5xx pode vir como página de erro.
    if (status === 401 || status === 403 || status >= 500) {
      throw new FiscalProviderError(httpFiscalError(status, this.#semToken(`${chamada} → ${text}`)));
    }
    try {
      return { status, body: JSON.parse(text) as unknown };
    } catch {
      throw new FiscalProviderError(unreadableFiscalError(this.#semToken(`Focus ${chamada} → HTTP ${status} com corpo que não é JSON: ${text.slice(0, 300)}`)));
    }
  }
}
