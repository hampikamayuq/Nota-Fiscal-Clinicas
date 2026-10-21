/** Cliente mínimo da API: mesmo site, cookie de sessão, erros com corpo. */
import { queryClient } from './query-client';

export type CorpoErro = { erro?: string; mensagem?: string; problemas?: string[] };

export class ApiError extends Error {
  readonly status: number;
  readonly corpo: CorpoErro;
  constructor(status: number, corpo: CorpoErro) {
    super(corpo.mensagem ?? `Erro ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.corpo = corpo;
  }
}

export async function api<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const texto = await r.text();
  const dados: unknown = texto ? JSON.parse(texto) : null;
  // Sessão caiu no meio do turno: relê /me, e o layout manda para o login com o caminho de volta.
  if (r.status === 401 && !url.startsWith('/api/auth/login')) void queryClient.invalidateQueries({ queryKey: ['me'] });
  if (!r.ok) throw new ApiError(r.status, (dados as CorpoErro) ?? {});
  return dados as T;
}

export const get = <T>(url: string) => api<T>('GET', url);
export const post = <T>(url: string, body?: unknown) => api<T>('POST', url, body);
export const patch = <T>(url: string, body: unknown) => api<T>('PATCH', url, body);
export const put = <T>(url: string, body: unknown) => api<T>('PUT', url, body);
export const del = <T>(url: string) => api<T>('DELETE', url);

/** O que mostrar para a pessoa: a lista de problemas quando há, senão a mensagem. */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof ApiError) return e.corpo.problemas?.length ? e.corpo.problemas.join(' · ') : e.message;
  return e instanceof Error ? e.message : 'Falha inesperada.';
}
