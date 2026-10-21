/**
 * Provedor Focus NFe para a NFS-e Nacional (`/v2/nfsen`).
 *
 * Emissão é assíncrona (202 → consulta ou webhook); cancelamento é síncrono.
 * Rejeição é desfecho de negócio e volta no resultado; exceção
 * (`FiscalProviderError`) é só quando não se sabe o que aconteceu.
 */

import {
  FiscalProviderError,
  type FiscalCancelInput,
  type FiscalCancelResult,
  type FiscalIssueInput,
  type FiscalStatusResult,
  type InvoiceFiscalProvider,
} from '../../invoice-provider.ts';
import type { FocusClient } from './focus.client.ts';
import { httpFiscalError, taxAuthorityFiscalError, unreadableFiscalError } from './focus.errors.ts';
import { fromFocusStatus, toFocusPayload } from './focus.mapper.ts';
import { FocusCancelBodySchema, FocusErrorBodySchema } from './focus.schemas.ts';

const NFSEN = '/v2/nfsen';

export function focusBaseUrl(env: 'homologation' | 'production'): string {
  return env === 'production' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';
}

const ok = (status: number): boolean => status >= 200 && status < 300;
const isValidation = (status: number): boolean => status === 400 || status === 422;
const providerCode = (body: unknown, status: number): string => {
  const erro = FocusErrorBodySchema.safeParse(body);
  return erro.success ? erro.data.codigo : `http_${status}`;
};

/** 422 "Já existe um DPS com esta referência." — o texto é o único sinal que a Focus dá. */
function isDuplicateReference(status: number, body: unknown): boolean {
  const erro = FocusErrorBodySchema.safeParse(body);
  return status === 422 && erro.success && /j[áa] existe/i.test(erro.data.mensagem) && /refer[êe]ncia/i.test(erro.data.mensagem);
}

export type FocusProviderOptions = { client: FocusClient };

export class FocusProvider implements InvoiceFiscalProvider {
  readonly name = 'focus' as const;
  readonly #client: FocusClient;

  constructor(options: FocusProviderOptions) {
    this.#client = options.client;
  }

  #path(reference: string): string {
    return `${NFSEN}/${encodeURIComponent(reference)}`;
  }

  async issue(input: FiscalIssueInput): Promise<FiscalStatusResult> {
    const { status, body } = await this.#client.post(NFSEN, { ref: input.reference }, toFocusPayload(input, new Date()));
    if (ok(status)) return fromFocusStatus(body, this.#client.baseUrl);

    // A resposta de um envio anterior se perdeu: a nota já existe lá. Devolve o estado dela.
    // ponytail: assume que a Focus libera a referência após erro_autorizacao (como
    // na NF-e), ou seja, que este 422 só aparece para nota em processamento ou
    // autorizada. Confirmar em homologação reenviando uma referência rejeitada.
    if (isDuplicateReference(status, body)) {
      const existente = await this.getStatus(input.reference);
      if (existente) return existente;
      throw new FiscalProviderError(unreadableFiscalError(`Focus disse que a referência ${input.reference} já existe, mas a consulta devolveu 404.`));
    }

    if (isValidation(status)) {
      return {
        status: 'REJECTED',
        providerStatus: providerCode(body, status),
        number: null,
        verificationCode: null,
        pdfUrl: null,
        xmlUrl: null,
        error: httpFiscalError(status, body),
      };
    }
    throw new FiscalProviderError(httpFiscalError(status, body));
  }

  async getStatus(reference: string): Promise<FiscalStatusResult | null> {
    const { status, body } = await this.#client.get(this.#path(reference));
    if (status === 404) return null;
    if (ok(status)) return fromFocusStatus(body, this.#client.baseUrl);
    throw new FiscalProviderError(httpFiscalError(status, body));
  }

  async cancel(input: FiscalCancelInput): Promise<FiscalCancelResult> {
    // ponytail: `reasonCode` NÃO é enviado. A doc do DELETE /v2/nfsen só documenta
    // `justificativa` (cita um "código de cancelamento", mas não dá o nome do
    // campo). Confirmar com o suporte da Focus / em homologação qual cMotivo vai
    // no evento e se há campo para escolhê-lo.
    const { status, body } = await this.#client.delete(this.#path(input.reference), { justificativa: input.justification });

    if (ok(status)) {
      const lido = FocusCancelBodySchema.safeParse(body);
      if (lido.success && lido.data.status === 'cancelado') return { status: 'CANCELLED', providerStatus: 'cancelado' };
      if (lido.success && lido.data.status === 'erro_cancelamento') {
        return { status: 'CANCELLATION_ERROR', providerStatus: 'erro_cancelamento', error: taxAuthorityFiscalError('erro_cancelamento', lido.data.erros ?? []) };
      }
      throw new FiscalProviderError(unreadableFiscalError(`Resposta inesperada da Focus ao cancelar ${input.reference}: ${JSON.stringify(body).slice(0, 300)}`));
    }
    // Recusa definitiva da própria Focus (nota não autorizada, não encontrada, justificativa inválida).
    if (isValidation(status) || status === 404) {
      return { status: 'CANCELLATION_ERROR', providerStatus: providerCode(body, status), error: httpFiscalError(status, body) };
    }
    throw new FiscalProviderError(httpFiscalError(status, body));
  }
}
