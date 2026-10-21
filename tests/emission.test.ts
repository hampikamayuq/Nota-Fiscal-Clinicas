/**
 * Emissão, sincronização, cancelamento, webhook, modelos e travas de produção.
 * Integração com o PostgreSQL de teste e um provedor fiscal controlado pelo teste.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarPrisma, type PrismaClient } from '../src/db/client.ts';
import { InvoiceService } from '../src/app/invoices/invoice-service.ts';
import { EmissionService, providerReference } from '../src/app/invoices/emission-service.ts';
import { TemplateService } from '../src/app/invoices/template-service.ts';
import { InvoiceRuleError } from '../src/app/invoices/invoice-rules.ts';
import { FiscalProviderError, type FiscalCancelResult, type FiscalIssueInput, type FiscalStatusResult, type InvoiceFiscalProvider } from '../src/fiscal/invoice-provider.ts';
import { ambienteFocus, criarEmissionDeps } from '../src/api/fiscal-setup.ts';
import { criarApp } from '../src/api/app.ts';
import { hashSenha } from '../src/api/auth.ts';

try {
  process.loadEnvFile('.env');
} catch {
  /* sem .env */
}
const URL_TESTE = process.env.DATABASE_URL_TEST;
if (URL_TESTE && (URL_TESTE === process.env.DATABASE_URL || !/_test(\?|$)/.test(URL_TESTE))) {
  throw new Error('DATABASE_URL_TEST precisa ser diferente de DATABASE_URL e terminar em _test.');
}
const TRUNCATE =
  'TRUNCATE TABLE "ApiToken", "InvoicePayment", "InvoiceTemplateItem", "InvoiceTemplate", "WebhookEvent", "AuditLog", "FiscalAttempt", "InvoiceStatusHistory", "InvoiceItem", "Invoice", ' +
  '"CompanyServiceFiscalConfig", "CompanyFiscalDefault", "ProfessionalRQE", "Professional", "ServiceTemplate", "Company", "Patient", "User" RESTART IDENTITY CASCADE';

const base = (status: FiscalStatusResult['status'], providerStatus: string): FiscalStatusResult => ({ status, providerStatus, number: null, verificationCode: null, pdfUrl: null, xmlUrl: null, error: null });
const AUTORIZADA: FiscalStatusResult = { ...base('AUTHORIZED', 'autorizado'), number: '42', verificationCode: 'ABC', pdfUrl: 'https://x/pdf', xmlUrl: 'https://x/xml' };
const REJEITADA: FiscalStatusResult = { ...base('REJECTED', 'erro_autorizacao'), error: { code: 'E1', category: 'TAX_AUTHORITY', userMessage: 'O fisco recusou a nota.', retryable: false } };
const REDE = new FiscalProviderError({ code: 'REDE', category: 'NETWORK', userMessage: 'Sem resposta do emissor.', retryable: true });

/** Provedor de teste: responde o que o teste mandar e guarda o que recebeu. */
class Controlado implements InvoiceFiscalProvider {
  readonly name = 'fake' as const;
  enviados: FiscalIssueInput[] = [];
  aoEmitir: () => Promise<FiscalStatusResult> = async () => base('PROCESSING', 'processando_autorizacao');
  aoConsultar: () => Promise<FiscalStatusResult | null> = async () => AUTORIZADA;
  aoCancelar: () => Promise<FiscalCancelResult> = async () => ({ status: 'CANCELLED', providerStatus: 'cancelado' });
  async issue(input: FiscalIssueInput) {
    this.enviados.push(input);
    return this.aoEmitir();
  }
  getStatus() {
    return this.aoConsultar();
  }
  cancel() {
    return this.aoCancelar();
  }
}

describe.skipIf(!URL_TESTE)('emissão pelo provedor fiscal', () => {
  let prisma: PrismaClient;
  let invoices: InvoiceService;
  let emission: EmissionService;
  let templates: TemplateService;
  let provedor: Controlado;
  let ids: { company: string; patient: string; professional: string; consulta: string; biopsia: string; outroIss: string };

  beforeAll(async () => {
    prisma = criarPrisma(URL_TESTE);
    await prisma.$executeRawUnsafe(TRUNCATE);
    invoices = new InvoiceService(prisma);
    templates = new TemplateService(prisma, invoices);
    const company = await prisma.company.create({ data: { slug: 'a', legalName: 'A LTDA', cnpj: '12345678000195' } });
    const patient = await prisma.patient.create({ data: { type: 'INDIVIDUAL', name: 'Maria', cpf: '11144477735', email: 'm@teste.local' } });
    const professional = await prisma.professional.create({ data: { name: 'Dra. Exemplo', crmNumber: '123456', crmState: 'RJ', rqes: { create: [{ number: '11111', specialty: 'Dermatologia' }] } } });
    const novo = (name: string, cents: number, tuss: string) => prisma.serviceTemplate.create({ data: { name, defaultDescription: name, tussCode: tuss, defaultAmountCents: cents } });
    const [consulta, biopsia, outroIss] = [await novo('Consulta dermatológica', 40000, '10101012'), await novo('Biópsia de pele', 55000, '20104049'), await novo('Laser', 90000, '30101010')];
    const cfg = { companyId: company.id, nationalTaxCode: '040101', municipalTaxCode: '001', taxationType: '1', issWithholdingType: '1' };
    await prisma.companyServiceFiscalConfig.createMany({
      data: [
        { ...cfg, serviceTemplateId: consulta.id, issRate: '5.00' },
        { ...cfg, serviceTemplateId: biopsia.id, issRate: '5.00' },
        { ...cfg, serviceTemplateId: outroIss.id, issRate: '2.00' },
      ],
    });
    ids = { company: company.id, patient: patient.id, professional: professional.id, consulta: consulta.id, biopsia: biopsia.id, outroIss: outroIss.id };
  });

  beforeEach(() => {
    provedor = new Controlado();
    emission = new EmissionService(prisma, invoices, {
      providerFor: () => provedor,
      emitterFor: (c) => ({ cnpj: c.cnpj, legalName: c.legalName, municipalityCode: '3304557', serviceMunicipalityCode: '3304557', simplesNacionalOption: '3', simplesNacionalRegime: '1', specialTaxRegime: '0', municipalRegistration: null }),
      fiscalDefaultsFor: () => ({ additional: { percentualTributosSimples: 6 } }),
    });
  });

  afterAll(() => prisma.$disconnect());

  const pronta = async (servicos = [ids.consulta, ids.biopsia]) => {
    const n = await invoices.createDraft({ companyId: ids.company, patientId: ids.patient, professionalId: ids.professional });
    for (const s of servicos) await invoices.addItem(n.id, { serviceTemplateId: s });
    return invoices.changeStatus(n.id, 'READY');
  };

  it('emite: grava referência e descrição antes de chamar, fica PROCESSING, e a sincronização autoriza', async () => {
    const n = await pronta();
    const r = await emission.issue(n.id);
    expect(r.status).toBe('PROCESSING');
    expect(r.providerReference).toBe(providerReference(ids.company, n.id, 0));
    expect(r.finalFiscalDescription).toContain('Biópsia de pele');
    expect(r.finalFiscalDescription).toContain('CRM-RJ 123456');
    expect(r.finalFiscalDescription).toContain('Valor total dos serviços: R$ 950,00');

    const enviado = provedor.enviados[0]!;
    expect(enviado).toMatchObject({ reference: r.providerReference, amountCents: 95000, description: r.finalFiscalDescription, taker: { kind: 'INDIVIDUAL', cpf: '11144477735' } });
    expect(enviado.fiscal).toMatchObject({ nationalTaxCode: '040101', issRate: '5', additional: { percentualTributosSimples: 6 } });

    const emitida = await emission.sync(n.id);
    expect(emitida).toMatchObject({ status: 'AUTHORIZED', externalNumber: '42', externalVerificationCode: 'ABC', pdfUrl: 'https://x/pdf' });
    expect(emitida.authorizedAt).toBeInstanceOf(Date);
    const tentativas = await prisma.fiscalAttempt.findMany({ where: { invoiceId: n.id } });
    expect(tentativas.map((t) => t.outcome)).toEqual(['AUTHORIZED']);
    // LGPD: a tentativa gravada não carrega CPF nem nome do paciente.
    expect(JSON.stringify(tentativas[0]!.requestJson)).not.toMatch(/11144477735|Maria/);
  });

  it('estrangeiro com documento e endereço no exterior incompleto não vai ao fisco (E0242)', async () => {
    const turista = await prisma.patient.create({ data: { type: 'FOREIGN', name: 'John Smith', foreignDocument: 'P1234567', countryCode: 'BR', city: 'London' } });
    const n = await invoices.createDraft({ companyId: ids.company, patientId: turista.id, professionalId: ids.professional });
    await invoices.addItem(n.id, { serviceTemplateId: ids.consulta });
    await invoices.changeStatus(n.id, 'READY');
    await expect(emission.issue(n.id)).rejects.toThrow(/endereço no exterior/);
    expect(provedor.enviados).toHaveLength(0);
    expect((await invoices.get(n.id))?.status).toBe('READY');
  });

  it('serviços com tributação diferente não saem na mesma nota', async () => {
    const n = await pronta([ids.consulta, ids.outroIss]);
    await expect(emission.issue(n.id)).rejects.toThrow(/não podem ser emitidos juntos.*alíquota do ISS/s);
    expect(provedor.enviados).toHaveLength(0);
    expect((await invoices.get(n.id))?.status).toBe('READY');
  });

  it('descrição editada com diagnóstico é barrada; sem TUSS só avisa', async () => {
    const n = await pronta();
    const gerada = (await emission.description(n.id)).generated;
    await invoices.updateDraft(n.id, { finalFiscalDescription: gerada + '\nDiagnóstico: psoríase' });
    await expect(emission.issue(n.id)).rejects.toThrow(/sensível/);
    await invoices.updateDraft(n.id, { finalFiscalDescription: gerada.replace('Código TUSS: 10101012\n', '') });
    const d = await emission.description(n.id);
    expect(d.custom).toBe(true);
    expect(d.check.blocking).toEqual([]);
    expect(d.check.warnings.join(' ')).toMatch(/10101012/);
    expect((await emission.issue(n.id)).status).toBe('PROCESSING');
  });

  it('rejeição definitiva: volta a rascunho, e a nova emissão usa outra referência', async () => {
    provedor.aoEmitir = async () => REJEITADA;
    const n = await pronta();
    const r = await emission.issue(n.id);
    expect(r).toMatchObject({ status: 'REJECTED', lastErrorCode: 'E1', lastErrorMessage: 'O fisco recusou a nota.' });
    await invoices.changeStatus(n.id, 'DRAFT');
    await invoices.changeStatus(n.id, 'READY');
    provedor.aoEmitir = async () => AUTORIZADA;
    const de_novo = await emission.issue(n.id);
    expect(de_novo.status).toBe('AUTHORIZED');
    expect(de_novo.providerReference).toBe(providerReference(ids.company, n.id, 1));
    expect(de_novo.providerReference).not.toBe(r.providerReference);
    expect(de_novo.lastErrorMessage).toBeNull();
  });

  it('queda de rede: fica SUBMITTING; se o provedor não recebeu, volta a pronta; o reenvio usa a MESMA referência', async () => {
    provedor.aoEmitir = async () => {
      throw REDE;
    };
    const n = await pronta();
    await expect(emission.issue(n.id)).rejects.toThrow(/Sincronizar/);
    const pendente = await invoices.get(n.id);
    expect(pendente).toMatchObject({ status: 'SUBMITTING', lastErrorCode: 'REDE' });

    // Reenvio direto (o provedor é idempotente pela referência).
    provedor.aoEmitir = async () => base('PROCESSING', 'processando_autorizacao');
    const reenviada = await emission.issue(n.id);
    expect(reenviada.status).toBe('PROCESSING');
    expect(provedor.enviados.map((e) => e.reference)).toEqual([pendente!.providerReference, pendente!.providerReference]);

    // Outra nota: o provedor diz que nunca recebeu.
    provedor.aoEmitir = async () => {
      throw REDE;
    };
    const m = await pronta();
    await expect(emission.issue(m.id)).rejects.toThrow(InvoiceRuleError);
    provedor.aoConsultar = async () => null;
    expect((await emission.sync(m.id)).status).toBe('READY');
  });

  it('duplo clique: a segunda emissão simultânea é recusada e o provedor recebe uma só', async () => {
    let liberar!: () => void;
    const portao = new Promise<void>((ok) => (liberar = ok));
    provedor.aoEmitir = async () => {
      await portao;
      return AUTORIZADA;
    };
    const n = await pronta();
    const primeira = emission.issue(n.id);
    await new Promise((r) => setTimeout(r, 150));
    await expect(emission.issue(n.id)).rejects.toThrow(InvoiceRuleError);
    liberar();
    expect((await primeira).status).toBe('AUTHORIZED');
    expect(provedor.enviados).toHaveLength(1);
  });

  it('cancelamento: só nota emitida; sucesso, erro do fisco e falta de resposta', async () => {
    provedor.aoEmitir = async () => AUTORIZADA;
    const n = await pronta();
    const dados = { reasonCode: '1' as const, justification: 'Nota emitida com o paciente errado.' };
    await expect(emission.cancel(n.id, dados)).rejects.toThrow(/Só nota emitida/);
    await emission.issue(n.id);
    await expect(emission.cancel(n.id, { ...dados, justification: 'curta' })).rejects.toThrow(/15 a 255/);

    provedor.aoCancelar = async () => ({ status: 'CANCELLATION_ERROR', providerStatus: 'erro_cancelamento', error: { code: 'C1', category: 'TAX_AUTHORITY', userMessage: 'Prazo de cancelamento encerrado.', retryable: false } });
    expect(await emission.cancel(n.id, dados)).toMatchObject({ status: 'CANCELLATION_ERROR', lastErrorMessage: 'Prazo de cancelamento encerrado.' });
    provedor.aoCancelar = async () => {
      throw REDE;
    };
    expect((await emission.cancel(n.id, dados)).status).toBe('CANCELLATION_ERROR');
    provedor.aoCancelar = async () => ({ status: 'CANCELLED', providerStatus: 'cancelado' });
    const cancelada = await emission.cancel(n.id, dados);
    expect(cancelada.status).toBe('CANCELLED');
    expect(cancelada.cancelledAt).toBeInstanceOf(Date);
    const acoes = (await prisma.auditLog.findMany({ where: { entityId: n.id } })).map((a) => a.action);
    expect(acoes).toEqual(expect.arrayContaining(['INVOICE_CANCEL_REQUESTED', 'INVOICE_CANCEL_FAILED', 'INVOICE_CANCELLED']));
  });

  it('webhook: consulta o provedor em vez de confiar no corpo, e entrega repetida não reprocessa', async () => {
    const n = await pronta();
    const enviada = await emission.issue(n.id);
    let consultas = 0;
    provedor.aoConsultar = async () => {
      consultas++;
      return AUTORIZADA;
    };
    const corpo = { ref: enviada.providerReference, status: 'erro_autorizacao' }; // corpo mente: quem decide é a consulta
    expect(await emission.handleWebhook('fake', corpo, 'hash-1')).toMatchObject({ duplicate: false, invoiceId: n.id });
    expect((await invoices.get(n.id))?.status).toBe('AUTHORIZED');
    expect(await emission.handleWebhook('fake', corpo, 'hash-1')).toMatchObject({ duplicate: true, invoiceId: n.id });
    expect(consultas).toBe(1);
    expect(await emission.handleWebhook('fake', { ref: 'DESCONHECIDA' }, 'hash-2')).toMatchObject({ duplicate: false, invoiceId: null });
    expect(await prisma.webhookEvent.count()).toBe(2);
  });

  it('webhook: entrega repetida de um evento que falhou reprocessa', async () => {
    const n = await pronta();
    const enviada = await emission.issue(n.id);
    provedor.aoConsultar = async () => {
      throw REDE;
    };
    const corpo = { ref: enviada.providerReference, status: 'autorizado' };
    expect((await emission.handleWebhook('fake', corpo, `falha-${n.id}`)).processingError).toMatch(/Sem resposta/);
    expect((await invoices.get(n.id))?.status).toBe('PROCESSING');
    provedor.aoConsultar = async () => AUTORIZADA;
    expect(await emission.handleWebhook('fake', corpo, `falha-${n.id}`)).toMatchObject({ duplicate: false, processingError: null });
    expect((await invoices.get(n.id))?.status).toBe('AUTHORIZED');
  });

  it('cancelamento interrompido: provedor ainda diz emitida → CANCELLATION_ERROR, e cancelar de novo funciona', async () => {
    const n = await pronta();
    await emission.issue(n.id);
    await emission.sync(n.id);
    await invoices.changeStatus(n.id, 'CANCELLATION_REQUESTED');
    expect((await emission.sync(n.id)).status).toBe('CANCELLATION_ERROR');
    expect((await emission.cancel(n.id, { reasonCode: '1', justification: 'Erro na emissão da nota fiscal' })).status).toBe('CANCELLED');
  });

  it('sincronizar não devolve a READY enquanto o envio está em voo', async () => {
    const n = await pronta();
    let liberar!: () => void;
    provedor.aoEmitir = () => new Promise((r) => { liberar = () => r(base('PROCESSING', 'processando_autorizacao')); });
    provedor.aoConsultar = async () => null;
    const envio = emission.issue(n.id);
    while ((await invoices.get(n.id))?.status !== 'SUBMITTING') await new Promise((r) => setTimeout(r, 10));
    await expect(emission.sync(n.id)).rejects.toThrow(/menos de um minuto/);
    liberar();
    expect((await envio).status).toBe('PROCESSING');
  });

  it('modelos: criar, duplicar, aplicar à nota (itens copiados e editáveis)', async () => {
    const t = await templates.create({ name: 'Consulta + biópsia', favorite: true, items: [{ serviceTemplateId: ids.consulta }, { serviceTemplateId: ids.biopsia, unitAmountCents: 60000 }] });
    const copia = await templates.duplicate(t.id);
    expect(copia.name).toBe('Consulta + biópsia (cópia)');
    expect((await templates.duplicate(t.id)).name).toBe('Consulta + biópsia (cópia 2)');
    await templates.update(copia.id, { active: false });
    expect((await templates.list()).map((x) => x.name)).toEqual(['Consulta + biópsia', 'Consulta + biópsia (cópia 2)']);

    const n = await invoices.createDraft({ companyId: ids.company, patientId: ids.patient, professionalId: ids.professional });
    const aplicada = await templates.apply(n.id, t.id);
    expect(aplicada.items.map((i) => [i.serviceNameSnapshot, i.unitAmountCents])).toEqual([['Consulta dermatológica', 40000], ['Biópsia de pele', 60000]]);
    expect(aplicada.totalAmountCents).toBe(100000);
    await templates.update(t.id, { items: [{ serviceTemplateId: ids.consulta }] });
    expect((await invoices.get(n.id))?.items).toHaveLength(2);
    await expect(templates.apply(n.id, copia.id)).rejects.toThrow(/inativo/);
  });

  it('emissão espera a edição concorrente terminar e envia o valor que ficou salvo', async () => {
    const n = await pronta([ids.consulta]);
    let avisarEdicao!: () => void;
    let liberarEdicao!: () => void;
    const editando = new Promise<void>((resolve) => (avisarEdicao = resolve));
    const portao = new Promise<void>((resolve) => (liberarEdicao = resolve));
    const edicao = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${n.id}::uuid FOR UPDATE`;
      await tx.invoiceItem.update({ where: { id: n.items[0]!.id }, data: { unitAmountCents: 60000, totalAmountCents: 60000 } });
      await tx.invoice.update({ where: { id: n.id }, data: { totalAmountCents: 60000 } });
      avisarEdicao();
      await portao;
    });
    await editando;
    const envio = emission.issue(n.id);
    try {
      // Confirma no Postgres que o envio chegou à trava, sem depender de um sleep.
      await expect.poll(async () => {
        const [r] = await prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND query LIKE '%FOR UPDATE%'
          ) AS waiting`;
        return r?.waiting;
      }, { timeout: 2000, interval: 10 }).toBe(true);
    } finally {
      liberarEdicao();
    }
    await edicao;
    const enviada = await envio;
    expect(enviada.totalAmountCents).toBe(60000);
    expect(provedor.enviados[0]?.amountCents).toBe(enviada.totalAmountCents);
    expect(provedor.enviados[0]?.description).toContain('Valor total dos serviços: R$ 600,00');
    expect(enviada.finalFiscalDescription).toBe(provedor.enviados[0]?.description);
  });

  it.each(['sincronização', 'webhook'] as const)('rejeição por %s atualiza a tentativa e gera nova referência na correção', async (via) => {
    const n = await pronta();
    const enviada = await emission.issue(n.id);
    provedor.aoConsultar = async () => REJEITADA;
    if (via === 'webhook') {
      await emission.handleWebhook('fake', { ref: enviada.providerReference, status: 'erro_autorizacao' }, `rejeicao-${n.id}`);
    } else {
      await emission.sync(n.id);
    }
    expect((await invoices.get(n.id))?.status).toBe('REJECTED');
    const [tentativa] = await prisma.fiscalAttempt.findMany({ where: { invoiceId: n.id } });
    expect(tentativa).toMatchObject({ outcome: 'REJECTED', errorCode: 'E1', responseJson: REJEITADA });
    // Consultar a mesma rejeição de novo não conta como outra tentativa.
    await emission.sync(n.id);
    await invoices.changeStatus(n.id, 'DRAFT');
    await invoices.changeStatus(n.id, 'READY');
    provedor.aoEmitir = async () => AUTORIZADA;
    const corrigida = await emission.issue(n.id);
    expect(corrigida.providerReference).toBe(providerReference(ids.company, n.id, 1));
    expect(corrigida.providerReference).not.toBe(enviada.providerReference);
  });

  it.each(['202', 'rede'] as const)('resposta tardia de %s não desfaz a autorização confirmada durante o envio', async (resposta) => {
    const n = await pronta();
    provedor.aoEmitir = async () => {
      // O webhook/consulta pode autorizar antes de o POST original responder.
      await emission.sync(n.id);
      if (resposta === 'rede') throw REDE;
      return base('PROCESSING', 'processando_autorizacao');
    };
    if (resposta === 'rede') await expect(emission.issue(n.id)).rejects.toThrow(/Sincronizar/);
    else expect((await emission.issue(n.id)).status).toBe('AUTHORIZED');
    expect(await invoices.get(n.id)).toMatchObject({ status: 'AUTHORIZED', lastErrorCode: null, lastErrorMessage: null });
    const [tentativa] = await prisma.fiscalAttempt.findMany({ where: { invoiceId: n.id } });
    expect(tentativa).toMatchObject({ outcome: 'AUTHORIZED', responseJson: AUTORIZADA });
  });

  it('consulta atrasada da referência rejeitada não rejeita o reenvio corrigido', async () => {
    const n = await pronta();
    const primeira = await emission.issue(n.id);
    let avisarConsulta!: () => void;
    let responderConsulta!: (r: FiscalStatusResult) => void;
    const consultando = new Promise<void>((resolve) => (avisarConsulta = resolve));
    const resposta = new Promise<FiscalStatusResult>((resolve) => (responderConsulta = resolve));
    provedor.aoConsultar = () => { avisarConsulta(); return resposta; };
    const consultaAntiga = emission.sync(n.id);
    await consultando;
    try {
      provedor.aoConsultar = async () => REJEITADA;
      await emission.sync(n.id);
      await invoices.changeStatus(n.id, 'DRAFT');
      await invoices.changeStatus(n.id, 'READY');
      const corrigida = await emission.issue(n.id);
      expect(corrigida.providerReference).not.toBe(primeira.providerReference);
    } finally {
      responderConsulta(REJEITADA);
    }
    const atual = await consultaAntiga;
    expect(atual).toMatchObject({ status: 'PROCESSING', providerReference: providerReference(ids.company, n.id, 1) });
    const tentativas = await prisma.fiscalAttempt.findMany({ where: { invoiceId: n.id }, orderBy: { startedAt: 'asc' } });
    expect(tentativas.map((t) => t.outcome)).toEqual(['REJECTED', 'PROCESSING']);
  });

  it.each(['sincronização', 'webhook'] as const)('cancelamento sem resposta é confirmado por %s', async (via) => {
    const n = await pronta();
    provedor.aoEmitir = async () => AUTORIZADA;
    const enviada = await emission.issue(n.id);
    provedor.aoCancelar = async () => { throw REDE; };
    expect((await emission.cancel(n.id, { reasonCode: '1', justification: 'Nota emitida com o valor errado.' })).status).toBe('CANCELLATION_ERROR');
    provedor.aoConsultar = async () => base('CANCELLED', 'cancelado');
    if (via === 'webhook') {
      await emission.handleWebhook('fake', { ref: enviada.providerReference, status: 'cancelado' }, `cancelamento-${n.id}`);
    } else {
      await emission.sync(n.id);
    }
    const cancelada = await invoices.get(n.id);
    expect(cancelada).toMatchObject({ status: 'CANCELLED', providerStatus: 'cancelado', lastErrorCode: null, lastErrorMessage: null });
    expect(cancelada?.cancelledAt).toBeInstanceOf(Date);
    expect(await prisma.invoiceStatusHistory.findFirst({ where: { invoiceId: n.id, fromStatus: 'CANCELLATION_ERROR', toStatus: 'CANCELLED' } })).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: n.id, action: 'INVOICE_CANCELLED' } })).toBe(1);
    await emission.sync(n.id);
    expect(await prisma.auditLog.count({ where: { entityId: n.id, action: 'INVOICE_CANCELLED' } })).toBe(1);
  });

  it('modelo com serviço sem configuração falha inteiro e repetir não acumula itens', async () => {
    const semConfig = await prisma.serviceTemplate.create({ data: { name: 'Serviço sem configuração', defaultDescription: 'Serviço', defaultAmountCents: 10000 } });
    const modelo = await templates.create({ name: 'Modelo incompleto', items: [{ serviceTemplateId: ids.consulta }, { serviceTemplateId: semConfig.id }] });
    const n = await invoices.createDraft({ companyId: ids.company, patientId: ids.patient, professionalId: ids.professional });
    await invoices.addItem(n.id, { serviceTemplateId: ids.biopsia });
    const antes = await invoices.get(n.id);
    const auditoriaAntes = await prisma.auditLog.count({ where: { entityId: n.id } });
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      await expect(templates.apply(n.id, modelo.id)).rejects.toThrow(/configuração fiscal/);
      const depois = await invoices.get(n.id);
      expect(depois?.items).toEqual(antes?.items);
      expect(depois?.totalAmountCents).toBe(antes?.totalAmountCents);
      expect(await prisma.auditLog.count({ where: { entityId: n.id } })).toBe(auditoriaAntes);
    }
    await prisma.companyServiceFiscalConfig.create({ data: { companyId: ids.company, serviceTemplateId: semConfig.id, nationalTaxCode: '040101', taxationType: '1', issWithholdingType: '1' } });
    const aplicada = await templates.apply(n.id, modelo.id);
    expect(aplicada.items.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
    expect(aplicada.totalAmountCents).toBe(105000);
  });

  describe('API', () => {
    let app: FastifyInstance;
    const cookie: Record<string, string> = {};
    const fixo = new Controlado();
    beforeAll(async () => {
      const passwordHash = await hashSenha('senha-de-teste');
      await prisma.user.createMany({
        data: [
          { email: 'admin@teste.local', name: 'Admin', role: 'ADMIN', passwordHash },
          { email: 'recepcao@teste.local', name: 'Recepção', role: 'RECEPTION', passwordHash },
          { email: 'auditor@teste.local', name: 'Auditor', role: 'AUDITOR', passwordHash },
        ],
      });
      fixo.aoEmitir = async () => AUTORIZADA;
      app = await criarApp({
        prisma,
        authSecret: 'segredo-de-teste-com-32-caracteres!!',
        focusWebhookSecret: 'segredo-do-webhook',
        emission: { providerFor: () => fixo, emitterFor: (c) => ({ cnpj: c.cnpj, legalName: c.legalName, municipalityCode: '3304557', serviceMunicipalityCode: '3304557', simplesNacionalOption: '3', simplesNacionalRegime: '1', specialTaxRegime: '0', municipalRegistration: null }) },
      });
      for (const p of ['admin', 'recepcao', 'auditor']) {
        const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `${p}@teste.local`, senha: 'senha-de-teste' } });
        cookie[p] = String(r.headers['set-cookie']).split(';')[0]!;
      }
    });
    afterAll(() => app.close());
    const chamar = (method: 'GET' | 'POST', url: string, como?: string, payload?: unknown) =>
      app.inject({ method, url, ...(como ? { headers: { cookie: cookie[como]! } } : {}), ...(payload !== undefined ? { payload } : {}) });

    it('recepção emite e cancela (auditor não), e só digitando CANCELAR', async () => {
      const n = await pronta();
      expect((await chamar('GET', `/api/invoices/${n.id}/description`, 'recepcao')).json().check).toEqual({ blocking: [], warnings: [] });
      expect((await chamar('POST', `/api/invoices/${n.id}/issue`, 'auditor')).statusCode).toBe(403);
      const emitida = await chamar('POST', `/api/invoices/${n.id}/issue`, 'recepcao');
      expect(emitida.json()).toMatchObject({ status: 'AUTHORIZED', externalNumber: '42' });
      expect((await chamar('POST', `/api/invoices/${n.id}/issue`, 'recepcao')).statusCode).toBe(422);
      const corpo = { reasonCode: '2', justification: 'Serviço não foi prestado ao paciente.', confirmation: 'CANCELAR' };
      expect((await chamar('POST', `/api/invoices/${n.id}/cancel`, 'auditor', corpo)).statusCode).toBe(403);
      expect((await chamar('POST', `/api/invoices/${n.id}/cancel`, 'recepcao', { ...corpo, confirmation: 'cancelar' })).statusCode).toBe(400);
      expect((await chamar('POST', `/api/invoices/${n.id}/cancel`, 'recepcao', corpo)).json().status).toBe('CANCELLED');
    });

    it('recusa: admin vê o motivo técnico da última tentativa; recepção vê só a mensagem simples', async () => {
      const tecnico = "Focus HTTP 400 empresa_nao_habilitada: ative a opção 'habilita_nfsen_producao' da empresa.";
      fixo.aoEmitir = async () => ({ ...base('REJECTED', 'empresa_nao_habilitada'), error: { code: 'empresa_nao_habilitada', category: 'VALIDATION', userMessage: 'Algum dado está faltando.', technicalMessage: tecnico, retryable: false } });
      try {
        const n = await pronta();
        await chamar('POST', `/api/invoices/${n.id}/issue`, 'recepcao');
        expect((await chamar('GET', `/api/invoices/${n.id}`, 'admin')).json().lastAttemptError).toEqual({ code: 'empresa_nao_habilitada', message: tecnico });
        expect((await chamar('GET', `/api/invoices/${n.id}`, 'recepcao')).json()).not.toHaveProperty('lastAttemptError');
      } finally {
        fixo.aoEmitir = async () => AUTORIZADA;
      }
    });

    it('a nota traz o documento do tomador estrangeiro e da empresa, não só o CPF', async () => {
      const turista = await prisma.patient.create({ data: { type: 'FOREIGN', name: 'Owen', foreignDocument: 'A323478', countryCode: 'US' } });
      const n = await invoices.createDraft({ companyId: ids.company, patientId: turista.id, professionalId: ids.professional });
      expect((await chamar('GET', `/api/invoices/${n.id}`, 'recepcao')).json().patient).toMatchObject({ foreignDocument: 'A323478', cnpj: null });
      const lista = (await chamar('GET', '/api/invoices', 'recepcao')).json() as Array<{ id: string; patient: unknown }>;
      expect(lista.find((x) => x.id === n.id)?.patient).toMatchObject({ foreignDocument: 'A323478' });
    });

    it('webhook exige o segredo; auditoria só para quem pode; produção exige o CNPJ digitado', async () => {
      expect((await app.inject({ method: 'POST', url: '/api/webhooks/focus', payload: { ref: 'X' } })).statusCode).toBe(401);
      const ok = await app.inject({ method: 'POST', url: '/api/webhooks/focus', headers: { authorization: 'segredo-do-webhook' }, payload: { ref: 'X', status: 'autorizado' } });
      expect(ok.json()).toEqual({ ok: true, duplicado: false });
      expect((await chamar('GET', '/api/audit', 'recepcao')).statusCode).toBe(403);
      const trilha = (await chamar('GET', '/api/audit?limit=5', 'auditor')).json();
      expect(trilha).toHaveLength(5);
      expect(trilha[0]).toHaveProperty('userName');
      expect((await chamar('POST', `/api/companies/${ids.company}/production`, 'recepcao', { enabled: true, cnpj: '12345678000195' })).statusCode).toBe(403);
      expect((await chamar('POST', `/api/companies/${ids.company}/production`, 'admin', { enabled: true, cnpj: '00000000000000' })).statusCode).toBe(400);
      expect((await chamar('POST', `/api/companies/${ids.company}/production`, 'admin', { enabled: true, cnpj: '12.345.678/0001-95' })).json().productionEnabled).toBe(true);
      expect(await prisma.auditLog.count({ where: { action: 'PRODUCTION_ENABLED' } })).toBe(1);
    });

    it('login bloqueia depois de 5 senhas erradas', async () => {
      const tentar = () => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alvo@teste.local', senha: 'errada' } });
      for (let i = 0; i < 5; i++) expect((await tentar()).statusCode).toBe(401);
      expect((await tentar()).statusCode).toBe(429);
    });
  });
});

describe('travas de produção e escolha do provedor', () => {
  const empresa = { legalName: 'A LTDA', productionEnabled: false };
  it('homologação é o padrão; produção exige as três travas', () => {
    expect(ambienteFocus({}, empresa)).toBe('homologation');
    expect(() => ambienteFocus({ FOCUS_ENV: 'production' }, empresa)).toThrow(/ALLOW_PRODUCTION_EMISSION/);
    expect(() => ambienteFocus({ FOCUS_ENV: 'production', ALLOW_PRODUCTION_EMISSION: 'true' }, empresa)).toThrow(/não está habilitada/);
    expect(ambienteFocus({ FOCUS_ENV: 'production', ALLOW_PRODUCTION_EMISSION: 'true' }, { ...empresa, productionEnabled: true })).toBe('production');
    expect(() => ambienteFocus({ FOCUS_ENV: 'prod' }, empresa)).toThrow(/inválido/);
  });
  it('provedor desconhecido não sobe; focus sem token diz qual variável falta', () => {
    expect(() => criarEmissionDeps({ FISCAL_PROVIDER: 'sefin' })).toThrow(/FISCAL_PROVIDER/);
    expect(criarEmissionDeps({}).providerName).toBe('fake');
    const deps = criarEmissionDeps({ FISCAL_PROVIDER: 'focus' });
    const c = { id: '1', slug: 'clinica-norte', cnpj: '11222333000181', legalName: 'Clínica Norte', productionEnabled: false } as never;
    expect(() => deps.providerFor(c)).toThrow(/FOCUS_TOKEN_HOMOLOGACAO_CLINICA_NORTE/);
  });
});
