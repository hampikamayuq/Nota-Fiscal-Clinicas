/**
 * Integração com o PostgreSQL: o que o schema promete e o banco garante.
 *
 * Roda só com DATABASE_URL_TEST (banco separado, migrado com
 * `DATABASE_URL=$DATABASE_URL_TEST npm run db:deploy`). Sem ele, pula.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { criarPrisma, type PrismaClient } from '../src/db/client.ts';
import { InvoiceService } from '../src/app/invoices/invoice-service.ts';
import { InvoiceRuleError } from '../src/app/invoices/invoice-rules.ts';

try {
  process.loadEnvFile('.env');
} catch {
  /* sem .env */
}
const URL_TESTE = process.env.DATABASE_URL_TEST;
// A suíte TRUNCA as tabelas: só roda num banco que é claramente de teste.
if (URL_TESTE && (URL_TESTE === process.env.DATABASE_URL || !/_test(\?|$)/.test(URL_TESTE))) {
  throw new Error('DATABASE_URL_TEST precisa ser diferente de DATABASE_URL e terminar em _test.');
}

const TRUNCATE =
  'TRUNCATE TABLE "ApiToken", "InvoicePayment", "InvoiceTemplateItem", "InvoiceTemplate", "WebhookEvent", "AuditLog", "FiscalAttempt", "InvoiceStatusHistory", "InvoiceItem", "Invoice", ' +
  '"CompanyServiceFiscalConfig", "CompanyFiscalDefault", "ProfessionalRQE", "Professional", "ServiceTemplate", "Company", "Patient", "User" ' +
  'RESTART IDENTITY CASCADE';

describe.skipIf(!URL_TESTE)('domínio administrativo (Prisma)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = criarPrisma(URL_TESTE);
    await prisma.$executeRawUnsafe(TRUNCATE);
  });

  afterAll(() => prisma.$disconnect());

  it('os dois CNPJs compartilham o mesmo serviço, cada um com a própria configuração fiscal', async () => {
    const [a, b] = await Promise.all([
      prisma.company.create({ data: { slug: 'a', legalName: 'A', cnpj: '12345678000195' } }),
      prisma.company.create({ data: { slug: 'b', legalName: 'B', cnpj: '11222333000181' } }),
    ]);
    const consulta = await prisma.serviceTemplate.create({
      data: { name: 'Consulta', defaultDescription: 'Consulta', tussCode: '00000001', defaultAmountCents: 40000 },
    });
    await prisma.companyServiceFiscalConfig.createMany({
      data: [
        { companyId: a.id, serviceTemplateId: consulta.id, nationalTaxCode: '040101', taxationType: '1', issWithholdingType: '1', issRate: '5.00' },
        { companyId: b.id, serviceTemplateId: consulta.id, nationalTaxCode: '040101', taxationType: '1', issWithholdingType: '1', issRate: '2.00' },
      ],
    });

    const configs = await prisma.companyServiceFiscalConfig.findMany({
      where: { serviceTemplateId: consulta.id },
      orderBy: { issRate: 'asc' },
    });
    expect(configs.map((c) => c.issRate?.toString())).toEqual(['2', '5']);

    // Uma configuração por (empresa, serviço): a segunda para a mesma dupla é recusada pelo banco.
    await expect(
      prisma.companyServiceFiscalConfig.create({
        data: { companyId: a.id, serviceTemplateId: consulta.id, nationalTaxCode: '040101', taxationType: '1', issWithholdingType: '1' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('profissional aceita mais de um RQE, sem repetir o número', async () => {
    const dra = await prisma.professional.create({
      data: {
        name: 'Dra. Exemplo',
        crmNumber: '123456',
        crmState: 'RJ',
        rqes: { create: [{ number: '11111', specialty: 'Dermatologia' }, { number: '22222', specialty: 'Cirurgia Dermatológica' }] },
      },
      include: { rqes: true },
    });
    expect(dra.rqes).toHaveLength(2);
    await expect(
      prisma.professionalRQE.create({ data: { professionalId: dra.id, number: '11111', specialty: 'Outra' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('CPF e CNPJ de paciente são únicos, mas podem faltar (estrangeiro, não informado)', async () => {
    await prisma.patient.create({ data: { type: 'INDIVIDUAL', name: 'Maria', cpf: '11144477735' } });
    await prisma.patient.create({ data: { type: 'FOREIGN', name: 'Jane', foreignDocument: 'P1' } });
    await prisma.patient.create({ data: { type: 'UNIDENTIFIED', name: 'Não informado' } });
    await expect(
      prisma.patient.create({ data: { type: 'INDIVIDUAL', name: 'Outra Maria', cpf: '11144477735' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.patient.count()).toBe(3);
  });
});

describe.skipIf(!URL_TESTE)('notas com vários serviços (InvoiceService)', () => {
  let prisma: PrismaClient;
  let service: InvoiceService;
  let ids: { company: string; otherCompany: string; patient: string; professional: string; user: string; consulta: string; biopsia: string };

  beforeAll(async () => {
    prisma = criarPrisma(URL_TESTE);
    service = new InvoiceService(prisma);
    await prisma.$executeRawUnsafe(TRUNCATE);
    const company = await prisma.company.create({ data: { slug: 'a', legalName: 'A', cnpj: '12345678000195' } });
    const otherCompany = await prisma.company.create({ data: { slug: 'b', legalName: 'B', cnpj: '11222333000181' } });
    const patient = await prisma.patient.create({ data: { type: 'INDIVIDUAL', name: 'Maria', cpf: '11144477735' } });
    const user = await prisma.user.create({ data: { email: 'r@x', name: 'Recepção', role: 'RECEPTION' } });
    const professional = await prisma.professional.create({
      data: { name: 'Dra. Exemplo', crmNumber: '123456', crmState: 'RJ', specialty: 'Dermatologia', rqes: { create: [{ number: '11111', specialty: 'Dermatologia' }] } },
    });
    const consulta = await prisma.serviceTemplate.create({
      data: { name: 'Consulta dermatológica', defaultDescription: 'Consulta dermatológica', tussCode: '00000001', defaultAmountCents: 40000 },
    });
    const biopsia = await prisma.serviceTemplate.create({
      data: { name: 'Biópsia de pele', defaultDescription: 'Biópsia de pele', tussCode: '00000002', defaultAmountCents: 55000 },
    });
    await prisma.companyServiceFiscalConfig.createMany({
      data: [consulta, biopsia].map((t) => ({ companyId: company.id, serviceTemplateId: t.id, nationalTaxCode: '040101', municipalTaxCode: '001', taxationType: '1', issWithholdingType: '1', issRate: '5.00' })),
    });
    ids = { company: company.id, otherCompany: otherCompany.id, patient: patient.id, professional: professional.id, user: user.id, consulta: consulta.id, biopsia: biopsia.id };
  });

  afterAll(() => prisma.$disconnect());

  const novoRascunho = (internalReference?: string) =>
    service.createDraft({
      companyId: ids.company,
      patientId: ids.patient,
      professionalId: ids.professional,
      createdByUserId: ids.user,
      ...(internalReference ? { internalReference } : {}),
    });

  it('rascunho nasce DRAFT com o snapshot do profissional e histórico', async () => {
    const inv = await novoRascunho('agenda-1');
    expect(inv.status).toBe('DRAFT');
    expect(inv.totalAmountCents).toBe(0);
    expect(inv.professionalNameSnapshot).toBe('Dra. Exemplo');
    expect(inv.professionalCrmSnapshot).toBe('123456');
    expect(inv.professionalCrmStateSnapshot).toBe('RJ');
    expect(inv.professionalRqeSnapshot).toBe('11111');
    const historico = await prisma.invoiceStatusHistory.findMany({ where: { invoiceId: inv.id } });
    expect(historico.map((h) => [h.fromStatus, h.toStatus])).toEqual([[null, 'DRAFT']]);
    expect(await prisma.auditLog.count({ where: { entityId: inv.id, action: 'INVOICE_CREATED' } })).toBe(1);
  });

  it('referência interna é única por empresa, mas livre entre empresas', async () => {
    await expect(novoRascunho('agenda-1')).rejects.toMatchObject({ code: 'P2002' });
    const outra = await service.createDraft({ companyId: ids.otherCompany, patientId: ids.patient, professionalId: ids.professional, internalReference: 'agenda-1' });
    expect(outra.companyId).toBe(ids.otherCompany);
  });

  it('dois serviços: snapshot de cada item com a config fiscal da empresa, total automático', async () => {
    const inv = await novoRascunho();
    await service.addItem(inv.id, { serviceTemplateId: ids.consulta }, ids.user);
    const comDois = await service.addItem(inv.id, { serviceTemplateId: ids.biopsia, unitAmountCents: 60000, description: 'Biópsia de pele — 2 fragmentos' }, ids.user);

    expect(comDois.totalAmountCents).toBe(100000);
    expect(comDois.items.map((i) => [i.sortOrder, i.serviceNameSnapshot, i.tussCodeSnapshot, i.totalAmountCents])).toEqual([
      [0, 'Consulta dermatológica', '00000001', 40000],
      [1, 'Biópsia de pele', '00000002', 60000],
    ]);
    expect(comDois.items[1]?.descriptionSnapshot).toBe('Biópsia de pele — 2 fragmentos');
    expect(comDois.items[0]?.fiscalConfigSnapshotJson).toMatchObject({ nationalTaxCode: '040101', municipalTaxCode: '001', issRate: '5' });

    // Mudar o catálogo depois não mexe na nota.
    await prisma.serviceTemplate.update({ where: { id: ids.consulta }, data: { defaultAmountCents: 99900, defaultDescription: 'outra' } });
    const depois = await service.get(inv.id);
    expect(depois?.items[0]?.unitAmountCents).toBe(40000);
    expect(depois?.items[0]?.descriptionSnapshot).toBe('Consulta dermatológica');
    await prisma.serviceTemplate.update({ where: { id: ids.consulta }, data: { defaultAmountCents: 40000, defaultDescription: 'Consulta dermatológica' } });
  });

  it('editar e remover item recalculam o total', async () => {
    const inv = await novoRascunho();
    const a = await service.addItem(inv.id, { serviceTemplateId: ids.consulta });
    const b = await service.addItem(inv.id, { serviceTemplateId: ids.biopsia });
    const itemConsulta = a.items[0]!;
    const editada = await service.updateItem(inv.id, itemConsulta.id, { quantity: 2, unitAmountCents: 35000 });
    expect(editada.totalAmountCents).toBe(70000 + 55000);
    expect(editada.items.find((i) => i.id === itemConsulta.id)?.totalAmountCents).toBe(70000);
    const semBiopsia = await service.removeItem(inv.id, b.items[1]!.id);
    expect(semBiopsia.items).toHaveLength(1);
    expect(semBiopsia.totalAmountCents).toBe(70000);
    expect(await prisma.auditLog.count({ where: { entityId: inv.id, action: { in: ['INVOICE_ITEM_ADDED', 'INVOICE_ITEM_UPDATED', 'INVOICE_ITEM_REMOVED'] } } })).toBe(4);
  });

  it('não vira READY sem serviço; depois de AUTHORIZED nada muda', async () => {
    const inv = await novoRascunho();
    await expect(service.changeStatus(inv.id, 'READY')).rejects.toThrow(InvoiceRuleError);
    await service.addItem(inv.id, { serviceTemplateId: ids.consulta });
    await service.changeStatus(inv.id, 'READY', { userId: ids.user });
    await service.changeStatus(inv.id, 'SUBMITTING');
    const autorizada = await service.changeStatus(inv.id, 'AUTHORIZED');
    expect(autorizada.status).toBe('AUTHORIZED');
    expect(autorizada.submittedAt).toBeInstanceOf(Date);
    expect(autorizada.authorizedAt).toBeInstanceOf(Date);

    await expect(service.addItem(inv.id, { serviceTemplateId: ids.biopsia })).rejects.toThrow(InvoiceRuleError);
    await expect(service.updateItem(inv.id, autorizada.items[0]!.id, { quantity: 2 })).rejects.toThrow(InvoiceRuleError);
    await expect(service.removeItem(inv.id, autorizada.items[0]!.id)).rejects.toThrow(InvoiceRuleError);
    await expect(service.updateDraft(inv.id, { patientId: ids.patient })).rejects.toThrow(InvoiceRuleError);
    await expect(service.changeStatus(inv.id, 'DRAFT')).rejects.toThrow(InvoiceRuleError);

    // O banco repete a regra: nem SQL direto mexe em nota autorizada.
    const item = autorizada.items[0]!;
    await expect(prisma.invoiceItem.update({ where: { id: item.id }, data: { unitAmountCents: 1 } })).rejects.toThrow(/imutáveis/);
    await expect(prisma.invoiceItem.delete({ where: { id: item.id } })).rejects.toThrow(/imutáveis/);
    await expect(prisma.invoice.update({ where: { id: inv.id }, data: { totalAmountCents: 1 } })).rejects.toThrow(/imutáveis/);
    await expect(prisma.invoice.delete({ where: { id: inv.id } })).rejects.toThrow(/excluída/);
    // …mas o que faz a nota andar continua livre.
    await service.changeStatus(inv.id, 'CANCELLATION_REQUESTED');
    expect((await service.changeStatus(inv.id, 'CANCELLED')).cancelledAt).toBeInstanceOf(Date);

    const historico = await prisma.invoiceStatusHistory.findMany({ where: { invoiceId: inv.id }, orderBy: { createdAt: 'asc' } });
    expect(historico.map((h) => h.toStatus)).toEqual(['DRAFT', 'READY', 'SUBMITTING', 'AUTHORIZED', 'CANCELLATION_REQUESTED', 'CANCELLED']);
    expect(await prisma.auditLog.findMany({ where: { entityId: inv.id, action: { in: ['INVOICE_SUBMITTED', 'INVOICE_AUTHORIZED'] } } })).toHaveLength(2);
  });

  it('trocar o profissional do rascunho refaz o snapshot; o profissional antigo não muda', async () => {
    const outra = await prisma.professional.create({ data: { name: 'Dr. Outro', crmNumber: '654321', crmState: 'SP' } });
    const inv = await novoRascunho();
    const trocada = await service.updateDraft(inv.id, { professionalId: outra.id });
    expect(trocada.professionalNameSnapshot).toBe('Dr. Outro');
    expect(trocada.professionalCrmStateSnapshot).toBe('SP');
    expect(trocada.professionalRqeSnapshot).toBeNull();
  });

  it('serviço sem configuração fiscal ativa na empresa não entra na nota', async () => {
    const inv = await service.createDraft({ companyId: ids.otherCompany, patientId: ids.patient, professionalId: ids.professional });
    await expect(service.addItem(inv.id, { serviceTemplateId: ids.consulta })).rejects.toThrow(/configuração fiscal/);
    expect((await service.get(inv.id))?.items).toEqual([]);
  });

  it('nota pronta não fica vazia nem zerada', async () => {
    const inv = await novoRascunho();
    const { items } = await service.addItem(inv.id, { serviceTemplateId: ids.consulta });
    await service.changeStatus(inv.id, 'READY');
    await expect(service.removeItem(inv.id, items[0]!.id)).rejects.toThrow(/pronta/);
    await expect(service.updateItem(inv.id, items[0]!.id, { unitAmountCents: 0 })).rejects.toThrow(/pronta/);
    const depois = await service.get(inv.id);
    expect(depois?.items).toHaveLength(1);
    expect(depois?.totalAmountCents).toBe(40000);
  });

  it('empresa, paciente ou profissional inativos não entram em nota nova', async () => {
    const inativo = await prisma.patient.create({ data: { type: 'UNIDENTIFIED', name: 'Sumiu', active: false } });
    await expect(service.createDraft({ companyId: ids.company, patientId: inativo.id, professionalId: ids.professional })).rejects.toThrow(/inativo/);
    await prisma.professional.update({ where: { id: ids.professional }, data: { active: false } });
    await expect(novoRascunho()).rejects.toThrow(/inativo/);
    await prisma.professional.update({ where: { id: ids.professional }, data: { active: true } });
  });

  it('serviço sem exceção herda o padrão fiscal da empresa; exceção inativa o exclui', async () => {
    const laser = await prisma.serviceTemplate.create({ data: { name: 'Laser', defaultDescription: 'Laser', defaultAmountCents: 70000 } });
    const inv = await service.createDraft({ companyId: ids.otherCompany, patientId: ids.patient, professionalId: ids.professional });
    await expect(service.addItem(inv.id, { serviceTemplateId: laser.id })).rejects.toThrow(/configuração fiscal/);

    await prisma.companyFiscalDefault.create({ data: { companyId: ids.otherCompany, nationalTaxCode: '040101', municipalTaxCode: '002', taxationType: '1', issWithholdingType: '1', issRate: '2.00' } });
    const comPadrao = await service.addItem(inv.id, { serviceTemplateId: laser.id });
    expect(comPadrao.items[0]?.fiscalConfigSnapshotJson).toMatchObject({ municipalTaxCode: '002', issRate: '2' });

    await prisma.companyServiceFiscalConfig.create({ data: { companyId: ids.otherCompany, serviceTemplateId: laser.id, nationalTaxCode: '040101', taxationType: '1', issWithholdingType: '1', active: false } });
    await expect(service.addItem(inv.id, { serviceTemplateId: laser.id })).rejects.toThrow(/configuração fiscal/);
    await prisma.companyFiscalDefault.delete({ where: { companyId: ids.otherCompany } });
    await prisma.companyServiceFiscalConfig.deleteMany({ where: { serviceTemplateId: laser.id } });
  });

  it('id desconhecido ou referência inválida viram erro de regra, não erro do banco', async () => {
    await expect(service.addItem(randomUUID(), { serviceTemplateId: ids.consulta })).rejects.toThrow(InvoiceRuleError);
    await expect(service.changeStatus(randomUUID(), 'READY')).rejects.toThrow(InvoiceRuleError);
    await expect(
      service.createDraft({ companyId: ids.company, patientId: randomUUID(), professionalId: ids.professional }),
    ).rejects.toThrow(InvoiceRuleError);
  });

  it('dois cliques ao mesmo tempo não repetem sortOrder nem perdem o total', async () => {
    const inv = await novoRascunho();
    await Promise.all([
      service.addItem(inv.id, { serviceTemplateId: ids.consulta }),
      service.addItem(inv.id, { serviceTemplateId: ids.biopsia }),
    ]);
    const depois = await service.get(inv.id);
    expect(depois?.items.map((i) => i.sortOrder)).toEqual([0, 1]);
    expect(depois?.totalAmountCents).toBe(95000);
  });
});
