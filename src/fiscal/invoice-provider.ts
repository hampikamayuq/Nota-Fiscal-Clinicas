/**
 * Contrato do provedor fiscal para o domínio de notas (Invoice).
 *
 * Neutro: nada aqui é da Focus nem da SEFIN. O serviço de emissão monta um
 * `FiscalIssueInput` a partir da nota (snapshots) e da configuração fiscal da
 * empresa; cada provedor traduz para o próprio formato. Um provedor é por
 * empresa (carrega o token/certificado dela) e NUNCA é trocado por outro
 * automaticamente em caso de falha.
 */

import type { FiscalConfigSnapshot } from '../app/invoices/invoice-rules.ts';

export type ProviderName = 'fake' | 'focus';

/** Dados fiscais da empresa emissora (vêm de empresas/<slug>/config.json, definidos pelo contador). */
export type FiscalEmitter = {
  cnpj: string;
  legalName: string;
  /** Código IBGE (7 dígitos) do município emissor. */
  municipalityCode: string;
  /** Código IBGE do município onde o serviço é prestado. */
  serviceMunicipalityCode: string;
  /** opSimpNac do padrão nacional: '1' não optante, '2' MEI, '3' ME/EPP. */
  simplesNacionalOption: '1' | '2' | '3';
  /** regApTribSN (só optantes ME/EPP). */
  simplesNacionalRegime: string | null;
  /** regEspTrib do padrão nacional ('0' nenhum … '6' sociedade de profissionais). */
  specialTaxRegime: string;
  municipalRegistration: string | null;
};

export type FiscalAddress = {
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  /** Código IBGE (7 dígitos) do município; sem ele o endereço não vai ao fisco. */
  municipalityCode: string | null;
};

export type FiscalTaker = { name: string; email: string | null; phone: string | null; address: FiscalAddress | null } & (
  | { kind: 'INDIVIDUAL'; cpf: string }
  | { kind: 'COMPANY'; cnpj: string }
  | { kind: 'FOREIGN'; foreignDocument: string | null; countryCode: string }
  | { kind: 'UNIDENTIFIED' }
);

export type FiscalIssueInput = {
  /** Referência enviada ao provedor: determinística, estável e única por empresa. */
  reference: string;
  emitter: FiscalEmitter;
  taker: FiscalTaker;
  /** Descrição final da nota, exatamente como vai ao fisco. */
  description: string;
  amountCents: number;
  /** AAAA-MM-DD. */
  competenceDate: string;
  /** Códigos tributários consolidados (todos os itens já validados como compatíveis). */
  fiscal: FiscalConfigSnapshot;
};

export type FiscalErrorCategory = 'VALIDATION' | 'AUTHENTICATION' | 'PROVIDER' | 'TAX_AUTHORITY' | 'NETWORK' | 'UNKNOWN';

/** Erro normalizado (plano, §38): mensagem para a recepção, detalhe técnico para ADMIN. */
export type FiscalError = {
  code: string;
  category: FiscalErrorCategory;
  userMessage: string;
  technicalMessage?: string;
  retryable: boolean;
};

export type FiscalStatus = 'PROCESSING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELLED';

export type FiscalStatusResult = {
  status: FiscalStatus;
  /** Status cru do provedor (ex.: "processando_autorizacao"). */
  providerStatus: string;
  number: string | null;
  verificationCode: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  /** Presente quando status === 'REJECTED'. */
  error: FiscalError | null;
};

export type FiscalCancelInput = {
  reference: string;
  /** Motivo do padrão nacional: '1' erro na emissão, '2' serviço não prestado, '9' outros. */
  reasonCode: '1' | '2' | '9';
  /** 15 a 255 caracteres. */
  justification: string;
};

export type FiscalCancelResult = { status: 'CANCELLED'; providerStatus: string } | { status: 'CANCELLATION_ERROR'; providerStatus: string; error: FiscalError };

/**
 * Falha em que o provedor NÃO deu um desfecho (rede, autenticação, 5xx, corpo
 * ilegível). Desfechos de negócio (rejeição) voltam em `FiscalStatusResult`,
 * não como exceção.
 */
export class FiscalProviderError extends Error {
  override name = 'FiscalProviderError';
  readonly fiscal: FiscalError;
  constructor(fiscal: FiscalError) {
    super(fiscal.technicalMessage ?? fiscal.userMessage);
    this.fiscal = fiscal;
  }
}

export interface InvoiceFiscalProvider {
  readonly name: ProviderName;
  /** Idempotente por `reference`: reenviar a mesma referência nunca cria segunda nota. */
  issue(input: FiscalIssueInput): Promise<FiscalStatusResult>;
  /** null = o provedor não conhece esta referência. */
  getStatus(reference: string): Promise<FiscalStatusResult | null>;
  cancel(input: FiscalCancelInput): Promise<FiscalCancelResult>;
}
