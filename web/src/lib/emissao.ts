/** Regras puras da emissão: o link do WhatsApp, o prefill de /notas/nova e o rótulo da fila da home. */
import { reais } from './format';

export const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? nome;

export function mensagemWhatsApp(d: { paciente: string; numero: string | null; empresa: string; totalCents: number; pdfUrl: string }): string {
  return `Olá, ${primeiroNome(d.paciente)}. Segue a sua nota fiscal nº ${d.numero ?? '—'} da ${d.empresa}, no valor de ${reais(d.totalCents)}: ${d.pdfUrl}`;
}

/** `Patient.phone` guarda só dígitos (DDD + número); com 10 ou 11 o link já abre a conversa certa. Senão a recepção escolhe o contato. */
export function linkWhatsApp(telefone: string | null | undefined, mensagem: string): string {
  const digitos = (telefone ?? '').replace(/\D/g, '');
  const texto = `?text=${encodeURIComponent(mensagem)}`;
  return digitos.length === 10 || digitos.length === 11 ? `https://wa.me/55${digitos}${texto}` : `https://wa.me/${texto}`;
}

export type Memoria = { empresa?: string; profissional?: string };
export type Prefill = { empresa: string | null; profissional: string | null; paciente: string | null };

/** URL > memória do navegador > (só empresa) a única da lista. Não valida contra as listas: a página descarta o id que não achar. */
export function prefillDeUrl(params: URLSearchParams, memoria: Memoria | null, empresas: readonly { id: string }[]): Prefill {
  return {
    empresa: params.get('empresa') ?? memoria?.empresa ?? (empresas.length === 1 ? empresas[0]!.id : null),
    profissional: params.get('profissional') ?? memoria?.profissional ?? null,
    paciente: params.get('paciente'),
  };
}

/** Conveniência por navegador, nunca dado de negócio: por isso a leitura engole qualquer lixo. */
export const CHAVE_MEMORIA = 'clinica-fiscal:ultima-emissao';

export function lerMemoria(storage: Pick<Storage, 'getItem'>): Memoria | null {
  try {
    const bruto = storage.getItem(CHAVE_MEMORIA);
    if (!bruto) return null;
    const lido: unknown = JSON.parse(bruto);
    if (typeof lido !== 'object' || lido === null || Array.isArray(lido)) return null;
    const { empresa, profissional } = lido as Record<string, unknown>;
    return { ...(typeof empresa === 'string' ? { empresa } : {}), ...(typeof profissional === 'string' ? { profissional } : {}) };
  } catch {
    return null;
  }
}

export function guardarMemoria(storage: Pick<Storage, 'setItem'>, m: { empresa: string; profissional: string }): void {
  try {
    storage.setItem(CHAVE_MEMORIA, JSON.stringify(m));
  } catch {
    /* sem espaço ou modo privado: a conveniência some, nada mais */
  }
}

/** O que a linha da fila oferece: a ação leva à nota; não emite dali. */
export function acaoDaFila(status: 'DRAFT' | 'READY', itens: number): 'Continuar' | 'Revisar e emitir' | 'Emitir' {
  if (status === 'READY') return 'Emitir';
  return itens === 0 ? 'Continuar' : 'Revisar e emitir';
}
