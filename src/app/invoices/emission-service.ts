/**
 * Emissão, sincronização e cancelamento de uma nota pelo provedor fiscal.
 *
 * A ordem existe para que nenhuma falha vire nota em dobro:
 *
 *   conferir (compatibilidade, descrição) → gravar SUBMITTING + referência
 *        → só então chamar o provedor → aplicar o desfecho
 *
 * A referência enviada ao provedor é determinística; reenviar depois de uma
 * queda nunca cria segunda nota. Só uma rejeição definitiva gera referência
 * nova (senão o provedor devolveria a mesma rejeição para sempre).
 */

import { createHash } from 'node:crypto';
import type { Company, Patient, Prisma, PrismaClient } from '../../generated/prisma/client.ts';
import {
  FiscalProviderError,
  type FiscalEmitter,
  type FiscalError,
  type FiscalStatusResult,
  type FiscalTaker,
  type InvoiceFiscalProvider,
} from '../../fiscal/invoice-provider.ts';
import { buildInvoiceDescription, checkInvoiceDescription, type DescriptionCheck, type DescriptionInput } from './description-builder.ts';
import { checkFiscalCompatibility } from './fiscal-compatibility.ts';
import { InvoiceRuleError, enderecoExteriorCompleto, type FiscalConfigSnapshot } from './invoice-rules.ts';
import type { InvoiceService, InvoiceWithItems } from './invoice-service.ts';
import { SP_OFFSET_MIN } from './period.ts';

export type EmissionDeps = {
  /** Um provedor por empresa. A escolha é por configuração; nunca há troca automática. */
  providerFor: (company: Company) => InvoiceFiscalProvider;
  /** Dados fiscais da emissora (do contador), fora do banco. */
  emitterFor: (company: Company) => FiscalEmitter;
  /** Blocos tributários que são da empresa (PIS/COFINS, IBS/CBS, total de tributos); usados quando o serviço não define os seus. */
  fiscalDefaultsFor?: (company: Company) => Partial<Pick<FiscalConfigSnapshot, 'pisCofins' | 'ibsCbs' | 'additional'>>;
};

export type CancelInput = { reasonCode: '1' | '2' | '9'; justification: string };

/** Tempo em que uma tentativa sem desfecho ainda é considerada "em andamento" (duplo clique). */
const ATTEMPT_IN_FLIGHT_MS = 60_000;

type Loaded = InvoiceWithItems & { company: Company; patient: Patient };

export class EmissionService {
  readonly #prisma: PrismaClient;
  readonly #invoices: InvoiceService;
  readonly #deps: EmissionDeps;

  constructor(prisma: PrismaClient, invoices: InvoiceService, deps: EmissionDeps) {
    this.#prisma = prisma;
    this.#invoices = invoices;
    this.#deps = deps;
  }

  async #load(invoiceId: string, db: Prisma.TransactionClient | PrismaClient = this.#prisma): Promise<Loaded> {
    const nota = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { sortOrder: 'asc' } }, company: true, patient: true },
    });
    if (!nota) throw new InvoiceRuleError('Nota não encontrada.');
    return nota;
  }

  /** Itens + profissional + o texto do catálogo dos serviços (isento do filtro de dado sensível). */
  async #entrada(nota: InvoiceWithItems, db: Prisma.TransactionClient | PrismaClient = this.#prisma): Promise<DescriptionInput> {
    const ids = nota.items.map((i) => i.serviceTemplateId).filter((id): id is string => id !== null);
    const catalogo = await db.serviceTemplate.findMany({ where: { id: { in: ids } }, select: { name: true, defaultDescription: true } });
    return { ...descriptionInput(nota), catalog: catalogo.flatMap((t) => [t.defaultDescription, t.name]) };
  }

  /** A descrição que iria ao fisco agora (a editada, se houver; senão a gerada) e a conferência dela. */
  async description(invoiceId: string): Promise<{ text: string; generated: string; custom: boolean; check: DescriptionCheck }> {
    const nota = await this.#load(invoiceId);
    const entrada = await this.#entrada(nota);
    const generated = buildInvoiceDescription(entrada);
    const text = nota.finalFiscalDescription ?? generated;
    return { text, generated, custom: nota.finalFiscalDescription !== null, check: checkInvoiceDescription(text, entrada) };
  }

  async issue(invoiceId: string, userId?: string): Promise<InvoiceWithItems> {
    const { provider, input, tentativa } = await this.#invoices.withTransaction(async (invoices, tx) => {
      // Lê só depois da trava: uma edição que chegou antes precisa terminar
      // antes de validarmos e congelarmos os dados que irão ao provedor.
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId}::uuid FOR UPDATE`;
      const nota = await this.#load(invoiceId, tx);
      if (nota.status !== 'READY' && nota.status !== 'SUBMITTING') {
        throw new InvoiceRuleError(`Só nota pronta pode ser emitida; esta está em ${nota.status}.`);
      }
      if (nota.status === 'SUBMITTING' && (await this.#tentativaEmVoo(invoiceId, tx))) {
        throw new InvoiceRuleError('Esta nota já está sendo enviada. Aguarde alguns segundos e sincronize.');
      }

      const compat = checkFiscalCompatibility(nota.items.map((i) => ({ name: i.serviceNameSnapshot, fiscalConfigSnapshotJson: i.fiscalConfigSnapshotJson })));
      if (!compat.compatible) {
        throw new InvoiceRuleError(`Estes serviços não podem ser emitidos juntos nesta NFS-e. ${compat.problems.join(' ')}`);
      }
      const entrada = await this.#entrada(nota, tx);
      const text = nota.finalFiscalDescription ?? buildInvoiceDescription(entrada);
      const check = checkInvoiceDescription(text, entrada);
      if (check.blocking.length) throw new InvoiceRuleError(check.blocking.join(' '));
      const p = nota.patient;
      if (p.type === 'FOREIGN' && p.foreignDocument && !enderecoExteriorCompleto(p.countryCode, p)) {
        throw new InvoiceRuleError(
          'Estrangeiro com documento precisa do endereço no exterior completo (país, código postal, cidade, estado/região, logradouro, número e bairro). Complete o cadastro do paciente.',
        );
      }

      const provider = this.#deps.providerFor(nota.company);
      const emitter = this.#deps.emitterFor(nota.company);
      const rejeicoes = await tx.fiscalAttempt.count({ where: { invoiceId, outcome: 'REJECTED' } });
      const reference = nota.status === 'SUBMITTING' && nota.providerReference ? nota.providerReference : providerReference(nota.companyId, nota.internalReference ?? nota.id, rejeicoes);
      const competenceDate = nota.competenceDate ?? new Date(`${hojeNoFuso(new Date())}T00:00:00.000Z`);

      const input = {
        reference,
        emitter,
        taker: takerOf(nota.patient),
        description: text,
        amountCents: nota.totalAmountCents,
        competenceDate: competenceDate.toISOString().slice(0, 10),
        fiscal: comPadroesDaEmpresa(compat.fiscal, this.#deps.fiscalDefaultsFor?.(nota.company) ?? {}),
      };
      if (nota.status === 'READY') {
        await invoices.changeStatus(invoiceId, 'SUBMITTING', {
          ...(userId ? { userId } : {}),
          data: { finalFiscalDescription: text, competenceDate, provider: provider.name, providerReference: reference, lastErrorCode: null, lastErrorMessage: null },
        });
      }
      const tentativa = await tx.fiscalAttempt.create({
        data: { invoiceId, provider: provider.name, providerReference: reference, requestJson: semDadosDoTomador(input) },
      });
      return { provider, input, tentativa };
    });

    // A transação já foi confirmada; nenhuma trava fica aberta durante a rede.
    let resultado: FiscalStatusResult;
    try {
      resultado = await provider.issue(input);
    } catch (erro) {
      const fiscal = erroFiscal(erro);
      // Desfecho desconhecido: a nota PODE ter chegado ao provedor. Fica em
      // SUBMITTING, com o erro, e "sincronizar" decide o que ela é de fato.
      await this.#prisma.fiscalAttempt.updateMany({
        where: { id: tentativa.id, outcome: 'STARTED' },
        data: { outcome: 'UNKNOWN', errorCode: fiscal.code, errorMessage: fiscal.technicalMessage ?? fiscal.userMessage, finishedAt: new Date() },
      });
      await this.#prisma.invoice.updateMany({ where: { id: invoiceId, status: 'SUBMITTING' }, data: { lastErrorCode: fiscal.code, lastErrorMessage: fiscal.userMessage } });
      throw new InvoiceRuleError(`${fiscal.userMessage} A nota pode ter chegado ao provedor: use "Sincronizar" antes de tentar de novo.`);
    }
    return this.#apply(invoiceId, resultado, input.reference, userId, tentativa.id);
  }

  /** Tentativa STARTED recente: o provedor pode estar recebendo o envio neste instante. */
  #tentativaEmVoo(invoiceId: string, db: Prisma.TransactionClient | PrismaClient = this.#prisma) {
    return db.fiscalAttempt.findFirst({ where: { invoiceId, outcome: 'STARTED', startedAt: { gt: new Date(Date.now() - ATTEMPT_IN_FLIGHT_MS) } } });
  }

  /** Pergunta ao provedor o que a nota é. Serve de reserva quando o webhook não chega. */
  async sync(invoiceId: string, userId?: string): Promise<InvoiceWithItems> {
    const nota = await this.#load(invoiceId);
    if (!nota.providerReference) throw new InvoiceRuleError('Esta nota ainda não foi enviada ao provedor.');
    let resultado: FiscalStatusResult | null;
    try {
      resultado = await this.#deps.providerFor(nota.company).getStatus(nota.providerReference);
    } catch (erro) {
      throw new InvoiceRuleError(erroFiscal(erro).userMessage);
    }
    if (resultado === null) {
      // O provedor não conhece a referência: nada foi emitido; é seguro emitir de novo —
      // salvo se o envio ainda está em voo e o provedor só não registrou a referência ainda.
      if (nota.status === 'SUBMITTING') {
        if (await this.#tentativaEmVoo(invoiceId)) {
          throw new InvoiceRuleError('Esta nota foi enviada há menos de um minuto e o provedor ainda não a registrou. Aguarde e sincronize de novo.');
        }
        return this.#invoices.changeStatus(invoiceId, 'READY', { ...(userId ? { userId } : {}), reason: 'O provedor não recebeu o envio anterior.' });
      }
      throw new InvoiceRuleError('O provedor não tem registro desta nota.');
    }
    return this.#apply(invoiceId, resultado, nota.providerReference, userId);
  }

  async cancel(invoiceId: string, dados: CancelInput, userId?: string): Promise<InvoiceWithItems> {
    const nota = await this.#load(invoiceId);
    if (nota.status !== 'AUTHORIZED' && nota.status !== 'CANCELLATION_ERROR') {
      throw new InvoiceRuleError(`Só nota emitida pode ser cancelada; esta está em ${nota.status}.`);
    }
    const justification = dados.justification.trim();
    if (justification.length < 15 || justification.length > 255) throw new InvoiceRuleError('A justificativa do cancelamento precisa ter de 15 a 255 caracteres.');
    if (!nota.providerReference) throw new InvoiceRuleError('Nota sem referência no provedor; não há o que cancelar.');

    await this.#invoices.changeStatus(invoiceId, 'CANCELLATION_REQUESTED', { ...(userId ? { userId } : {}), reason: `${dados.reasonCode} — ${justification}` });
    try {
      const r = await this.#deps.providerFor(nota.company).cancel({ reference: nota.providerReference, reasonCode: dados.reasonCode, justification });
      if (r.status === 'CANCELLED') {
        return await this.#invoices.changeStatus(invoiceId, 'CANCELLED', { ...(userId ? { userId } : {}), reason: justification, data: { providerStatus: r.providerStatus } });
      }
      return await this.#invoices.changeStatus(invoiceId, 'CANCELLATION_ERROR', {
        ...(userId ? { userId } : {}),
        reason: r.error.userMessage,
        data: { providerStatus: r.providerStatus, lastErrorCode: r.error.code },
      });
    } catch (erro) {
      if (erro instanceof InvoiceRuleError) {
        // Webhook ou sincronização concluíram o cancelamento enquanto a resposta chegava: é sucesso.
        const agora = await this.#invoices.get(invoiceId);
        if (agora?.status === 'CANCELLED') return agora;
        throw erro;
      }
      const fiscal = erroFiscal(erro);
      // Sem resposta: a nota segue emitida até o cancelamento ser confirmado; repetir é seguro.
      return this.#invoices.changeStatus(invoiceId, 'CANCELLATION_ERROR', {
        ...(userId ? { userId } : {}),
        reason: `${fiscal.userMessage} Tente cancelar de novo.`,
        data: { lastErrorCode: fiscal.code },
      });
    }
  }

  /**
   * Webhook do provedor. O corpo só diz "olhe esta referência": o estado vem
   * de uma consulta ao provedor, nunca do que chegou pela rede. Entrega
   * repetida (mesmo corpo) não reprocessa.
   */
  async handleWebhook(provider: string, payload: unknown, payloadHash: string): Promise<{ duplicate: boolean; invoiceId: string | null; processingError: string | null }> {
    const corpo = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
    const reference = typeof corpo.ref === 'string' ? corpo.ref : null;
    const nota = reference ? await this.#prisma.invoice.findFirst({ where: { providerReference: reference, provider } }) : null;
    try {
      await this.#prisma.webhookEvent.create({
        data: {
          provider,
          eventType: typeof corpo.status === 'string' ? corpo.status : 'desconhecido',
          providerReference: reference,
          invoiceId: nota?.id ?? null,
          companyId: nota?.companyId ?? null,
          payloadJson: { ref: reference, status: typeof corpo.status === 'string' ? corpo.status : null },
          payloadHash,
        },
      });
    } catch (erro) {
      if ((erro as { code?: string }).code !== 'P2002') throw erro;
      // Entrega repetida só é descartada se a anterior terminou sem erro; senão
      // (queda entre gravar e sincronizar, provedor fora do ar) processa de novo.
      const anterior = await this.#prisma.webhookEvent.findUniqueOrThrow({ where: { provider_payloadHash: { provider, payloadHash } } });
      if (anterior.processedAt && !anterior.processingError) return { duplicate: true, invoiceId: nota?.id ?? null, processingError: null };
    }
    if (!nota) return { duplicate: false, invoiceId: null, processingError: null };
    let processingError: string | null = null;
    try {
      if (['SUBMITTING', 'PROCESSING', 'CANCELLATION_REQUESTED', 'CANCELLATION_ERROR', 'AUTHORIZED'].includes(nota.status)) await this.sync(nota.id);
    } catch (erro) {
      processingError = (erro as Error).message;
    }
    await this.#prisma.webhookEvent.update({ where: { provider_payloadHash: { provider, payloadHash } }, data: { processedAt: new Date(), processingError } });
    return { duplicate: false, invoiceId: nota.id, processingError };
  }

  async #apply(invoiceId: string, r: FiscalStatusResult, reference: string, userId?: string, attemptId?: string): Promise<InvoiceWithItems> {
    return this.#invoices.withTransaction(async (invoices, tx) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId}::uuid FOR UPDATE`;
      const atual = await invoices.get(invoiceId);
      if (!atual) throw new InvoiceRuleError('Nota não encontrada.');
      // Uma resposta atrasada de uma referência rejeitada não afeta o reenvio corrigido.
      if (atual.providerReference !== reference) return atual;
      const u = userId ? { userId } : {};
      const dados = {
        providerStatus: r.providerStatus,
        externalNumber: r.number,
        externalVerificationCode: r.verificationCode,
        pdfUrl: r.pdfUrl,
        xmlUrl: r.xmlUrl,
      };
      const alvo = r.status;
      if (alvo !== 'CANCELLED' && (atual.status === 'SUBMITTING' || atual.status === 'PROCESSING' || atual.status === alvo)) {
        const tentativa = await tx.fiscalAttempt.findFirst({
          where: { invoiceId, providerReference: reference, ...(attemptId ? { id: attemptId } : {}) },
          orderBy: { startedAt: 'desc' },
        });
        // A consulta atualiza a tentativa original; não cria uma nova rejeição
        // a cada sincronização nem sobrescreve um desfecho definitivo com 202 atrasado.
        if (tentativa && (tentativa.outcome !== 'AUTHORIZED' && tentativa.outcome !== 'REJECTED' || tentativa.outcome === alvo)) {
          await tx.fiscalAttempt.update({
            where: { id: tentativa.id },
            data: {
              outcome: alvo,
              responseJson: r,
              errorCode: r.error?.code ?? null,
              errorMessage: r.error?.technicalMessage ?? r.error?.userMessage ?? null,
              finishedAt: new Date(),
            },
          });
        }
      }
      if (atual.status === alvo) {
        return tx.invoice.update({ where: { id: invoiceId }, data: { providerStatus: r.providerStatus }, include: { items: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { sortOrder: 'asc' } } } });
      }
      if (alvo === 'PROCESSING' && atual.status === 'SUBMITTING') return invoices.changeStatus(invoiceId, 'PROCESSING', { ...u, data: { providerStatus: r.providerStatus } });
      if (alvo === 'AUTHORIZED' && (atual.status === 'SUBMITTING' || atual.status === 'PROCESSING')) return invoices.changeStatus(invoiceId, 'AUTHORIZED', { ...u, data: dados });
      if (alvo === 'REJECTED' && (atual.status === 'SUBMITTING' || atual.status === 'PROCESSING')) {
        return invoices.changeStatus(invoiceId, 'REJECTED', {
          ...u,
          reason: r.error?.userMessage ?? 'A nota foi recusada.',
          data: { providerStatus: r.providerStatus, lastErrorCode: r.error?.code ?? null },
        });
      }
      if (alvo === 'AUTHORIZED' && atual.status === 'CANCELLATION_REQUESTED') {
        // O pedido de cancelamento não chegou ao provedor (queda no meio do caminho): a nota segue emitida; cancelar de novo é seguro.
        return invoices.changeStatus(invoiceId, 'CANCELLATION_ERROR', { ...u, reason: 'O provedor não registrou o cancelamento. Tente cancelar de novo.', data: { providerStatus: r.providerStatus } });
      }
      if (alvo === 'CANCELLED' && atual.status === 'AUTHORIZED') {
        // Cancelada por fora (painel do provedor): registra os dois passos do fluxo.
        await invoices.changeStatus(invoiceId, 'CANCELLATION_REQUESTED', { ...u, reason: 'Cancelamento registrado no provedor.' });
        return invoices.changeStatus(invoiceId, 'CANCELLED', { ...u, data: { providerStatus: r.providerStatus } });
      }
      if (alvo === 'CANCELLED' && (atual.status === 'CANCELLATION_REQUESTED' || atual.status === 'CANCELLATION_ERROR')) return invoices.changeStatus(invoiceId, 'CANCELLED', { ...u, data: { providerStatus: r.providerStatus } });
      // Estado do provedor que não muda o nosso (ex.: "processando" numa nota já emitida).
      return atual;
    });
  }
}

// ─── Puros ───────────────────────────────────────────────────────────────────

/** Referência do provedor: 'Q' + 28 hex. Estável por (empresa, chave da nota, nº de rejeições definitivas). */
export function providerReference(companyId: string, key: string, rejections: number): string {
  return 'Q' + createHash('sha256').update(`${companyId}:${key}:${rejections}`).digest('hex').slice(0, 28).toUpperCase();
}

function hojeNoFuso(agora: Date): string {
  return new Date(agora.getTime() + SP_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

function descriptionInput(nota: InvoiceWithItems): DescriptionInput {
  return {
    items: nota.items.map((i) => ({
      name: i.serviceNameSnapshot,
      description: i.descriptionSnapshot,
      tussCode: i.tussCodeSnapshot,
      quantity: i.quantity,
      unitAmountCents: i.unitAmountCents,
      totalAmountCents: i.totalAmountCents,
    })),
    professional: {
      name: nota.professionalNameSnapshot,
      council: nota.professionalCouncilSnapshot,
      crmNumber: nota.professionalCrmSnapshot,
      crmState: nota.professionalCrmStateSnapshot,
      rqe: nota.professionalRqeSnapshot,
      specialty: nota.professionalSpecialtySnapshot,
    },
    totalAmountCents: nota.totalAmountCents,
  };
}

function comPadroesDaEmpresa(f: FiscalConfigSnapshot, d: Partial<Pick<FiscalConfigSnapshot, 'pisCofins' | 'ibsCbs' | 'additional'>>): FiscalConfigSnapshot {
  return { ...f, pisCofins: f.pisCofins ?? d.pisCofins ?? null, ibsCbs: f.ibsCbs ?? d.ibsCbs ?? null, additional: f.additional ?? d.additional ?? null };
}

export function takerOf(p: Patient): FiscalTaker {
  const temEndereco = !!(p.postalCode || p.street);
  const base = {
    name: p.name,
    email: p.email,
    phone: p.phone,
    address: temEndereco
      ? { postalCode: p.postalCode, street: p.street, number: p.number, complement: p.complement, district: p.district, city: p.city, state: p.state, municipalityCode: p.municipalityCode }
      : null,
  };
  if (p.type === 'INDIVIDUAL' && p.cpf) return { ...base, kind: 'INDIVIDUAL', cpf: p.cpf };
  if (p.type === 'COMPANY' && p.cnpj) return { ...base, kind: 'COMPANY', cnpj: p.cnpj };
  if (p.type === 'FOREIGN') return { ...base, kind: 'FOREIGN', foreignDocument: p.foreignDocument, countryCode: p.countryCode };
  return { ...base, kind: 'UNIDENTIFIED' };
}

/** O que fica gravado da tentativa: tudo menos os dados pessoais do paciente (LGPD). */
function semDadosDoTomador(input: { reference: string; description: string; amountCents: number; competenceDate: string; taker: FiscalTaker; fiscal: unknown; emitter: FiscalEmitter }) {
  return { reference: input.reference, amountCents: input.amountCents, competenceDate: input.competenceDate, takerKind: input.taker.kind, fiscal: input.fiscal, emitterCnpj: input.emitter.cnpj } as object;
}

function erroFiscal(erro: unknown): FiscalError {
  if (erro instanceof FiscalProviderError) return erro.fiscal;
  return { code: 'desconhecido', category: 'UNKNOWN', userMessage: 'Não foi possível falar com o provedor fiscal.', technicalMessage: (erro as Error).message, retryable: true };
}
