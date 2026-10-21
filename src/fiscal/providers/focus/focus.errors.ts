/**
 * Traduz desfechos da Focus NFe para o `FiscalError` do contrato.
 *
 * `userMessage` é para a recepção (sem vocabulário fiscal); `technicalMessage`
 * leva códigos e o texto do provedor para o ADMIN. O token nunca entra aqui:
 * nada neste arquivo recebe cabeçalhos nem a URL com credenciais.
 */

import type { FiscalError, FiscalErrorCategory } from '../../invoice-provider.ts';
import { FocusErrorBodySchema, type FocusErro } from './focus.schemas.ts';

const AVISE = 'Avise o administrador do sistema.';

const USER_MESSAGES: Record<FiscalErrorCategory, string> = {
  VALIDATION: `A nota não pôde ser enviada porque algum dado está faltando ou incorreto. Confira os dados do paciente e do serviço. Se estiver tudo certo, ${AVISE.toLowerCase()}`,
  AUTHENTICATION: `O sistema não conseguiu entrar no emissor de notas. ${AVISE}`,
  PROVIDER: 'O emissor de notas está fora do ar no momento. Aguarde alguns minutos e tente de novo.',
  TAX_AUTHORITY: `A prefeitura não aceitou a nota. ${AVISE}`,
  NETWORK: 'Não foi possível falar com o emissor de notas. Verifique a internet e tente de novo em alguns minutos.',
  UNKNOWN: `Aconteceu um erro inesperado ao enviar a nota. ${AVISE}`,
};

const HTTP_TOO_MANY_REQUESTS = 429;

function categoryForStatus(status: number): FiscalErrorCategory {
  if (status === 400 || status === 422) return 'VALIDATION';
  if (status === 401 || status === 403) return 'AUTHENTICATION';
  if (status >= 500) return 'PROVIDER';
  return 'UNKNOWN';
}

const resumo = (body: unknown): string =>
  (typeof body === 'string' ? body : (JSON.stringify(body) ?? '')).replace(/\s+/g, ' ').trim().slice(0, 300);

/** Resposta HTTP que não é um desfecho de sucesso. `body` pode ser o JSON de erro ou texto cru. */
export function httpFiscalError(status: number, body: unknown): FiscalError {
  const erro = FocusErrorBodySchema.safeParse(body);
  const category = categoryForStatus(status);
  return {
    code: erro.success ? erro.data.codigo : `focus_http_${status}`,
    category,
    userMessage: USER_MESSAGES[category],
    technicalMessage: erro.success
      ? `Focus HTTP ${status} ${erro.data.codigo}: ${erro.data.mensagem}`
      : `Focus HTTP ${status}: ${resumo(body) || '(corpo vazio)'}`,
    retryable: category === 'PROVIDER' || status === HTTP_TOO_MANY_REQUESTS,
  };
}

/** `fetch` falhou ou estourou o tempo: não se sabe se a Focus recebeu. */
export function networkFiscalError(detail: string, timedOut: boolean): FiscalError {
  return {
    code: timedOut ? 'focus_timeout' : 'focus_network',
    category: 'NETWORK',
    userMessage: USER_MESSAGES.NETWORK,
    technicalMessage: detail,
    retryable: true,
  };
}

/** Corpo que não é JSON ou não tem a forma documentada. */
export function unreadableFiscalError(detail: string): FiscalError {
  return { code: 'focus_unreadable', category: 'UNKNOWN', userMessage: USER_MESSAGES.UNKNOWN, technicalMessage: detail, retryable: false };
}

/** erro_autorizacao / erro_cancelamento: a recusa veio do ambiente nacional, com a lista de motivos. */
export function taxAuthorityFiscalError(providerStatus: string, erros: readonly FocusErro[]): FiscalError {
  const motivos = erros.map((e) => `${e.codigo ?? 's/código'}: ${e.mensagem}${e.correcao ? ` (correção: ${e.correcao})` : ''}`);
  return {
    code: erros[0]?.codigo ?? providerStatus,
    category: 'TAX_AUTHORITY',
    userMessage:
      providerStatus === 'erro_cancelamento'
        ? `A prefeitura não aceitou o cancelamento da nota. ${AVISE}`
        : USER_MESSAGES.TAX_AUTHORITY,
    technicalMessage: `Focus ${providerStatus}: ${motivos.join('; ') || 'sem detalhes'}`,
    retryable: false,
  };
}
