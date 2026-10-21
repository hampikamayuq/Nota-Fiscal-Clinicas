/**
 * Provedor fiscal falso: em memória e determinístico, para testes e para rodar
 * o sistema sem tocar em nenhum fisco. Nunca faz rede; toda emissão autoriza na hora.
 */

import type { FiscalCancelInput, FiscalCancelResult, FiscalIssueInput, FiscalStatusResult, InvoiceFiscalProvider } from '../../invoice-provider.ts';

export class FakeFiscalProvider implements InvoiceFiscalProvider {
  readonly name = 'fake' as const;
  readonly #notes = new Map<string, FiscalStatusResult>();
  #sequence = 0;

  /** Idempotente: a mesma referência devolve a mesma nota, sem criar outra. */
  async issue(input: FiscalIssueInput): Promise<FiscalStatusResult> {
    const existente = this.#notes.get(input.reference);
    if (existente) return existente;
    const numero = String(++this.#sequence);
    const chave = numero.padStart(50, '0');
    const nota: FiscalStatusResult = {
      status: 'AUTHORIZED',
      providerStatus: 'fake_authorized',
      number: numero,
      verificationCode: `FAKE${numero.padStart(6, '0')}`,
      pdfUrl: `https://fake.invalid/nfse/${chave}.pdf`,
      xmlUrl: `https://fake.invalid/nfse/${chave}.xml`,
      error: null,
    };
    this.#notes.set(input.reference, nota);
    return nota;
  }

  async getStatus(reference: string): Promise<FiscalStatusResult | null> {
    return this.#notes.get(reference) ?? null;
  }

  async cancel(input: FiscalCancelInput): Promise<FiscalCancelResult> {
    const nota = this.#notes.get(input.reference);
    if (nota?.status !== 'AUTHORIZED') {
      return {
        status: 'CANCELLATION_ERROR',
        providerStatus: 'fake_cancellation_error',
        error: {
          code: 'FAKE_NOT_AUTHORIZED',
          category: 'VALIDATION',
          userMessage: 'Só é possível cancelar uma nota que já foi emitida.',
          technicalMessage: `Referência ${input.reference} está em ${nota?.status ?? 'desconhecida'}.`,
          retryable: false,
        },
      };
    }
    this.#notes.set(input.reference, { ...nota, status: 'CANCELLED', providerStatus: 'fake_cancelled' });
    return { status: 'CANCELLED', providerStatus: 'fake_cancelled' };
  }
}
