/**
 * A API HTTP sobre o domínio: autenticação por cookie, papéis e o fluxo da
 * recepção (paciente → nota → itens → pronta). Roda só com DATABASE_URL_TEST.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { criarPrisma, type PrismaClient } from '../src/db/client.ts';
import { criarApp } from '../src/api/app.ts';
import { gerarToken, hashSenha, hashToken } from '../src/api/auth.ts';
import type { InvoiceStatus, Prisma } from '../src/generated/prisma/client.ts';

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
  '"CompanyServiceFiscalConfig", "CompanyFiscalDefault", "ProfessionalRQE", "Professional", "ServiceTemplate", "Company", "Patient", "User" ' +
  'RESTART IDENTITY CASCADE';
const SENHA = 'senha-de-teste';

describe.skipIf(!URL_TESTE)('API', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let ids: { company: string; consulta: string; biopsia: string; professional: string };
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    prisma = criarPrisma(URL_TESTE);
    await prisma.$executeRawUnsafe(TRUNCATE);
    const hash = await hashSenha(SENHA);
    await prisma.user.createMany({
      data: [
        { email: 'admin@teste.local', name: 'Admin', role: 'ADMIN', passwordHash: hash },
        { email: 'recepcao@teste.local', name: 'Recepção', role: 'RECEPTION', passwordHash: hash },
        { email: 'financeiro@teste.local', name: 'Financeiro', role: 'FINANCE', passwordHash: hash },
        { email: 'auditor@teste.local', name: 'Auditor', role: 'AUDITOR', passwordHash: hash },
        { email: 'inativo@teste.local', name: 'Inativo', role: 'ADMIN', passwordHash: hash, active: false },
      ],
    });
    const company = await prisma.company.create({ data: { slug: 'a', legalName: 'A', cnpj: '12345678000195' } });
    const consulta = await prisma.serviceTemplate.create({ data: { name: 'Consulta', defaultDescription: 'Consulta', tussCode: '00000001', defaultAmountCents: 40000 } });
    const biopsia = await prisma.serviceTemplate.create({ data: { name: 'Biópsia', defaultDescription: 'Biópsia', defaultAmountCents: 55000 } });
    await prisma.companyServiceFiscalConfig.create({
      data: { companyId: company.id, serviceTemplateId: consulta.id, nationalTaxCode: '040101', taxationType: '1', issWithholdingType: '1' },
    });
    const professional = await prisma.professional.create({ data: { name: 'Dra. Exemplo', crmNumber: '123456', crmState: 'RJ', rqes: { create: [{ number: '11111', specialty: 'Dermatologia' }] } } });
    ids = { company: company.id, consulta: consulta.id, biopsia: biopsia.id, professional: professional.id };

    app = await criarApp({ prisma, authSecret: 'segredo-de-teste-com-32-caracteres!!' });
    for (const papel of ['admin', 'recepcao', 'financeiro', 'auditor']) {
      const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `${papel}@teste.local`, senha: SENHA } });
      expect(r.statusCode, `login ${papel}`).toBe(200);
      cookies[papel] = String(r.headers['set-cookie']).split(';')[0]!;
    }
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const chamar = (metodo: InjectOptions['method'], url: string, como?: string, payload?: unknown) =>
    app.inject({ method: metodo, url, ...(como ? { headers: { cookie: cookies[como]! } } : {}), ...(payload !== undefined ? { payload } : {}) });

  describe('autenticação', () => {
    it('senha errada, usuário inativo e cookie ausente dão 401; o cookie é HttpOnly', async () => {
      expect((await chamar('POST', '/api/auth/login', undefined, { email: 'admin@teste.local', senha: 'errada' })).statusCode).toBe(401);
      expect((await chamar('POST', '/api/auth/login', undefined, { email: 'inativo@teste.local', senha: SENHA })).statusCode).toBe(401);
      expect((await chamar('GET', '/api/patients')).statusCode).toBe(401);
      const r = await chamar('POST', '/api/auth/login', undefined, { email: 'admin@teste.local', senha: SENHA });
      expect(String(r.headers['set-cookie'])).toMatch(/HttpOnly/i);
      expect(String(r.headers['set-cookie'])).toMatch(/SameSite=Lax/i);
      expect(r.json()).toMatchObject({ email: 'admin@teste.local', role: 'ADMIN' });
      expect(r.json()).not.toHaveProperty('passwordHash');
      expect(await prisma.auditLog.count({ where: { action: 'LOGIN_FAILURE' } })).toBeGreaterThanOrEqual(1);
    });

    it('rajada paralela de tentativas não passa pelo limite', async () => {
      const r = await Promise.all(Array.from({ length: 8 }, () => app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.9.9.9', payload: { email: 'ninguem@teste.local', senha: 'x' } })));
      expect(r.filter((x) => x.statusCode === 429).length).toBeGreaterThanOrEqual(3);
    });

    it('me devolve a sessão e logout a derruba', async () => {
      const r = await chamar('GET', '/api/auth/me', 'recepcao');
      expect(r.json()).toMatchObject({ email: 'recepcao@teste.local', role: 'RECEPTION' });
      const saida = await chamar('POST', '/api/auth/logout', 'auditor');
      const cookieLimpo = String(saida.headers['set-cookie']).split(';')[0]!;
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieLimpo } })).statusCode).toBe(401);
    });
  });

  describe('pacientes', () => {
    it('recepção cadastra, busca por nome ou CPF e edita; auditor só lê', async () => {
      const criado = await chamar('POST', '/api/patients', 'recepcao', { type: 'INDIVIDUAL', name: 'Maria de Souza', cpf: '111.444.777-35', email: 'maria@teste.local' });
      expect(criado.statusCode).toBe(201);
      expect(criado.json()).toMatchObject({ name: 'Maria de Souza', cpf: '11144477735' });
      expect((await chamar('GET', '/api/patients?q=souza', 'auditor')).json()).toHaveLength(1);
      expect((await chamar('GET', '/api/patients?q=11144477735', 'auditor')).json()).toHaveLength(1);
      expect((await chamar('GET', '/api/patients?q=ninguem', 'auditor')).json()).toHaveLength(0);
      const editado = await chamar('PATCH', `/api/patients/${criado.json().id}`, 'recepcao', { phone: '21999990000' });
      expect(editado.json()).toMatchObject({ phone: '21999990000', email: 'maria@teste.local' });
      expect((await chamar('GET', `/api/patients/${criado.json().id}`, 'auditor')).json()).toMatchObject({ name: 'Maria de Souza', phone: '21999990000' });
      expect((await chamar('GET', `/api/patients/${randomUUID()}`, 'auditor')).statusCode).toBe(404);
      expect((await chamar('POST', '/api/patients', 'auditor', { type: 'UNIDENTIFIED', name: 'X' })).statusCode).toBe(403);
      expect(await prisma.auditLog.count({ where: { entityType: 'Patient', action: { in: ['PATIENT_CREATED', 'PATIENT_UPDATED'] } } })).toBe(2);
    });

    it('valida CPF, exige CPF para pessoa física e recusa duplicado', async () => {
      const invalido = await chamar('POST', '/api/patients', 'recepcao', { type: 'INDIVIDUAL', name: 'X', cpf: '11111111111' });
      expect(invalido.statusCode).toBe(400);
      expect(invalido.json().problemas.join(' ')).toMatch(/cpf/i);
      expect((await chamar('POST', '/api/patients', 'recepcao', { type: 'INDIVIDUAL', name: 'Sem CPF' })).statusCode).toBe(400);
      expect((await chamar('POST', '/api/patients', 'recepcao', { type: 'INDIVIDUAL', name: 'Outra', cpf: '11144477735' })).statusCode).toBe(409);
      expect((await chamar('POST', '/api/patients', 'recepcao', { type: 'FOREIGN', name: 'Jane', foreignDocument: 'P1' })).statusCode).toBe(201);
    });

    it('guarda o IBGE do município do endereço e recusa código malformado', async () => {
      const ok = await chamar('POST', '/api/patients', 'recepcao', { type: 'UNIDENTIFIED', name: 'Com endereço', postalCode: '22041-012', number: '10', municipalityCode: '3304557' });
      expect(ok.statusCode).toBe(201);
      expect(ok.json()).toMatchObject({ postalCode: '22041012', municipalityCode: '3304557' });
      expect((await chamar('POST', '/api/patients', 'recepcao', { type: 'UNIDENTIFIED', name: 'IBGE ruim', municipalityCode: 'Rio' })).statusCode).toBe(400);
    });

    it('estrangeiro guarda código postal e região do exterior como digitados; brasileiro continua com CEP e UF', async () => {
      const fora = await chamar('POST', '/api/patients', 'recepcao', { type: 'FOREIGN', name: 'John Smith', foreignDocument: 'P1234567', countryCode: 'gb', postalCode: 'SW1A 1AA', city: 'London', state: 'England' });
      expect(fora.statusCode).toBe(201);
      expect(fora.json()).toMatchObject({ countryCode: 'GB', postalCode: 'SW1A 1AA', state: 'England' });
      expect((await chamar('POST', '/api/patients', 'recepcao', { type: 'UNIDENTIFIED', name: 'UF por extenso', state: 'Rio' })).statusCode).toBe(400);
      expect((await chamar('POST', '/api/patients', 'recepcao', { type: 'UNIDENTIFIED', name: 'CEP curto', postalCode: '2204' })).statusCode).toBe(400);
    });

    it('consulta de CEP exige login e recusa CEP malformado sem ir à rede', async () => {
      expect((await chamar('GET', '/api/cep/22041012')).statusCode).toBe(401);
      expect((await chamar('GET', '/api/cep/2204', 'recepcao')).statusCode).toBe(400);
    });
  });

  describe('profissionais e serviços', () => {
    it('admin cria profissional com RQE e substitui a lista; recepção não escreve', async () => {
      const r = await chamar('POST', '/api/professionals', 'admin', { name: 'Dr. Novo', crmNumber: '654321', crmState: 'sp', specialty: 'Dermatologia', rqes: [{ number: '22222', specialty: 'Dermatologia' }, { number: '33333', specialty: 'Cirurgia' }] });
      expect(r.statusCode).toBe(201);
      expect(r.json()).toMatchObject({ crmState: 'SP' });
      expect(r.json().rqes).toHaveLength(2);
      const p = await chamar('PATCH', `/api/professionals/${r.json().id}`, 'financeiro', { rqes: [{ number: '22222', specialty: 'Dermatologia' }] });
      expect(p.json().rqes.map((q: { number: string }) => q.number)).toEqual(['22222']);
      expect((await chamar('POST', '/api/professionals', 'recepcao', { name: 'X', crmNumber: '1', crmState: 'RJ' })).statusCode).toBe(403);
      expect((await chamar('GET', '/api/professionals', 'recepcao')).json()).toHaveLength(2);
    });

    it('recepção cadastra e edita serviço (nome, descrição, TUSS, valor), mas não travas, ativação nem código fiscal', async () => {
      const s = await chamar('POST', '/api/services', 'recepcao', { name: 'Peeling', defaultDescription: 'Peeling químico', tussCode: '30101099', defaultAmountCents: 45000 });
      expect(s.statusCode).toBe(201);
      const e = await chamar('PATCH', `/api/services/${s.json().id}`, 'recepcao', { defaultAmountCents: 48000, defaultDescription: 'Peeling químico superficial', favorite: true });
      expect(e.json()).toMatchObject({ defaultAmountCents: 48000, favorite: true });
      expect((await chamar('PATCH', `/api/services/${s.json().id}`, 'recepcao', { allowAmountEdit: false })).statusCode).toBe(403);
      expect((await chamar('PATCH', `/api/services/${s.json().id}`, 'recepcao', { active: false })).statusCode).toBe(403);
      expect((await chamar('POST', '/api/services', 'recepcao', { name: 'X1', defaultDescription: 'Xyz', defaultAmountCents: 1, allowAmountEdit: false })).statusCode).toBe(403);
      expect((await chamar('PUT', `/api/companies/${ids.company}/services/${s.json().id}/fiscal-config`, 'recepcao', { nationalTaxCode: '040101', taxationType: '1', issWithholdingType: '1' })).statusCode).toBe(403);
      expect((await chamar('POST', '/api/services', 'auditor', { name: 'X2', defaultDescription: 'Xyz', defaultAmountCents: 1 })).statusCode).toBe(403);
    });

    it('financeiro cria serviço e define a configuração fiscal por empresa', async () => {
      const s = await chamar('POST', '/api/services', 'financeiro', { name: 'Crioterapia', defaultDescription: 'Crioterapia', defaultAmountCents: 30000, favorite: true });
      expect(s.statusCode).toBe(201);
      const cfg = await chamar('PUT', `/api/companies/${ids.company}/services/${s.json().id}/fiscal-config`, 'financeiro', { nationalTaxCode: '040101', municipalTaxCode: '001', taxationType: '1', issWithholdingType: '1', issRate: '5.00' });
      expect(cfg.statusCode).toBe(200);
      expect((await chamar('PUT', `/api/companies/${ids.company}/services/${s.json().id}/fiscal-config`, 'recepcao', { nationalTaxCode: '040101', taxationType: '1', issWithholdingType: '1' })).statusCode).toBe(403);
      const lista = (await chamar('GET', `/api/services?company=${ids.company}`, 'recepcao')).json();
      const crio = lista.find((x: { name: string }) => x.name === 'Crioterapia');
      expect(crio.fiscalConfig).toMatchObject({ nationalTaxCode: '040101', issRate: '5' });
      expect(lista.find((x: { name: string }) => x.name === 'Biópsia').fiscalConfig).toBeNull();
      expect((await chamar('GET', '/api/companies', 'auditor')).json()).toMatchObject([{ cnpj: '12345678000195' }]);

      // Padrão da empresa: só financeiro/admin; todo serviço sem exceção passa a valer, com a origem indicada.
      expect((await chamar('PUT', `/api/companies/${ids.company}/fiscal-default`, 'recepcao', { nationalTaxCode: '040101', taxationType: '1', issWithholdingType: '1' })).statusCode).toBe(403);
      expect((await chamar('GET', `/api/companies/${ids.company}/fiscal-default`, 'financeiro')).json()).toBeNull();
      const padrao = await chamar('PUT', `/api/companies/${ids.company}/fiscal-default`, 'financeiro', { nationalTaxCode: '040101', municipalTaxCode: '001', taxationType: '1', issWithholdingType: '1', issRate: '5,00' });
      expect(padrao.json()).toMatchObject({ issRate: '5' });
      const comPadrao = (await chamar('GET', `/api/services?company=${ids.company}`, 'recepcao')).json();
      expect(comPadrao.find((x: { name: string }) => x.name === 'Biópsia')).toMatchObject({ fiscalSource: 'company', fiscalConfig: { nationalTaxCode: '040101' } });
      expect(comPadrao.find((x: { name: string }) => x.name === 'Crioterapia')).toMatchObject({ fiscalSource: 'service' });
      // Remover a exceção devolve o serviço ao padrão.
      expect((await chamar('DELETE', `/api/companies/${ids.company}/services/${s.json().id}/fiscal-config`, 'recepcao')).statusCode).toBe(403);
      expect((await chamar('DELETE', `/api/companies/${ids.company}/services/${s.json().id}/fiscal-config`, 'financeiro')).json()).toEqual({ removida: true });
      expect((await chamar('GET', `/api/services?company=${ids.company}`, 'recepcao')).json().find((x: { name: string }) => x.name === 'Crioterapia').fiscalSource).toBe('company');
      await chamar('PUT', `/api/companies/${ids.company}/fiscal-default`, 'financeiro', { nationalTaxCode: '040101', taxationType: '1', issWithholdingType: '1', active: false });
    });
  });

  describe('produção da empresa', () => {
    it('só ADMIN liga, e só digitando o CNPJ da empresa; fica na auditoria', async () => {
      const url = `/api/companies/${ids.company}/production`;
      expect((await chamar('POST', url, 'financeiro', { enabled: true, cnpj: '12345678000195' })).statusCode).toBe(403);
      expect((await chamar('POST', url, 'admin', { enabled: true, cnpj: '00000000000000' })).statusCode).toBe(400);
      expect(await prisma.company.findUniqueOrThrow({ where: { id: ids.company } })).toMatchObject({ productionEnabled: false });
      const ligou = await chamar('POST', url, 'admin', { enabled: true, cnpj: '12.345.678/0001-95' });
      expect(ligou.json()).toMatchObject({ productionEnabled: true });
      expect(await prisma.auditLog.count({ where: { action: 'PRODUCTION_ENABLED', entityId: ids.company } })).toBe(1);
      expect((await chamar('POST', url, 'admin', { enabled: false, cnpj: '12345678000195' })).json()).toMatchObject({ productionEnabled: false });
    });
  });

  describe('notas', () => {
    it('rascunho pode ser apagado com itens e pagamento; nota pronta e auditor não podem', async () => {
      const paciente = (await chamar('GET', '/api/patients?q=souza', 'recepcao')).json()[0];
      const nota = (await chamar('POST', '/api/invoices', 'recepcao', { companyId: ids.company, patientId: paciente.id, professionalId: ids.professional })).json();
      await chamar('POST', `/api/invoices/${nota.id}/items`, 'recepcao', { serviceTemplateId: ids.consulta });
      await chamar('PUT', `/api/invoices/${nota.id}/payments`, 'recepcao', { payments: [{ method: 'PIX', amountCents: 40000 }] });
      await chamar('POST', `/api/invoices/${nota.id}/status`, 'recepcao', { status: 'READY' });
      expect((await chamar('DELETE', `/api/invoices/${nota.id}`, 'recepcao')).statusCode).toBe(422);
      await chamar('POST', `/api/invoices/${nota.id}/status`, 'recepcao', { status: 'DRAFT' });
      expect((await chamar('DELETE', `/api/invoices/${nota.id}`, 'auditor')).statusCode).toBe(403);
      expect((await chamar('DELETE', `/api/invoices/${nota.id}`, 'recepcao')).statusCode).toBe(204);
      expect((await chamar('GET', `/api/invoices/${nota.id}`, 'recepcao')).statusCode).toBe(404);
      expect(await prisma.auditLog.count({ where: { action: 'INVOICE_DELETED', entityId: nota.id } })).toBe(1);
    });

    it('recepção monta a nota pela API: rascunho, itens, edição, remoção, pronta', async () => {
      const paciente = (await chamar('GET', '/api/patients?q=souza', 'recepcao')).json()[0];
      expect((await chamar('POST', '/api/invoices', 'recepcao', { companyId: ids.company, patientId: paciente.id, professionalId: ids.professional, competenceDate: '2026-02-31' })).statusCode).toBe(400);
      const nota = await chamar('POST', '/api/invoices', 'recepcao', { companyId: ids.company, patientId: paciente.id, professionalId: ids.professional, internalReference: 'agenda-9', competenceDate: '2026-10-02' });
      expect(nota.statusCode).toBe(201);
      expect(nota.json()).toMatchObject({ status: 'DRAFT', professionalRqeSnapshot: '11111', totalAmountCents: 0 });
      const id = nota.json().id;

      const i1 = await chamar('POST', `/api/invoices/${id}/items`, 'recepcao', { serviceTemplateId: ids.consulta });
      expect(i1.statusCode).toBe(201);
      // A resposta de cada mutação já traz paciente e empresa: a tela troca de rota sem piscar "escolha o paciente".
      expect(i1.json()).toMatchObject({ patient: { name: 'Maria de Souza' }, company: { legalName: 'A' } });
      const i2 = await chamar('POST', `/api/invoices/${id}/items`, 'recepcao', { serviceTemplateId: ids.consulta, quantity: 2, unitAmountCents: 35000, description: 'Retorno' });
      expect(i2.json().totalAmountCents).toBe(40000 + 70000);
      // Biópsia não tem configuração fiscal nesta empresa: regra de negócio → 422.
      const semConfig = await chamar('POST', `/api/invoices/${id}/items`, 'recepcao', { serviceTemplateId: ids.biopsia });
      expect(semConfig.statusCode).toBe(422);
      expect(semConfig.json().mensagem).toMatch(/configuração fiscal/);

      const itemId = i2.json().items[1].id;
      expect((await chamar('PATCH', `/api/invoices/${id}/items/${itemId}`, 'recepcao', { quantity: 1 })).json().totalAmountCents).toBe(75000);
      expect((await chamar('DELETE', `/api/invoices/${id}/items/${itemId}`, 'recepcao')).json().totalAmountCents).toBe(40000);

      expect((await chamar('POST', `/api/invoices/${id}/status`, 'recepcao', { status: 'READY' })).json().status).toBe('READY');
      expect((await chamar('POST', `/api/invoices/${id}/status`, 'recepcao', { status: 'AUTHORIZED' })).statusCode).toBe(400);
      expect((await chamar('GET', `/api/invoices?company=${ids.company}&status=READY`, 'auditor')).json()).toHaveLength(1);
      expect((await chamar('GET', `/api/invoices/${id}`, 'auditor')).json()).toMatchObject({ status: 'READY', items: [{ serviceNameSnapshot: 'Consulta' }], patient: { phone: '21999990000' } });
      expect((await chamar('POST', `/api/invoices/${id}/items`, 'auditor', { serviceTemplateId: ids.consulta })).statusCode).toBe(403);
    });

    it('health responde sem sessão e não expõe nada', async () => {
      const r = await chamar('GET', '/api/health');
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ ok: true });
    });

    it('erros viram códigos HTTP: 404 inexistente, 409 referência repetida, 400 corpo inválido', async () => {
      expect((await chamar('GET', `/api/invoices/${randomUUID()}`, 'recepcao')).statusCode).toBe(404);
      expect((await chamar('POST', `/api/invoices/${randomUUID()}/items`, 'recepcao', { serviceTemplateId: ids.consulta })).statusCode).toBe(404);
      const paciente = (await chamar('GET', '/api/patients?q=souza', 'recepcao')).json()[0];
      expect((await chamar('POST', '/api/invoices', 'recepcao', { companyId: ids.company, patientId: paciente.id, professionalId: ids.professional, internalReference: 'agenda-9' })).statusCode).toBe(409);
      const invalido = await chamar('POST', '/api/invoices', 'recepcao', { companyId: 'nao-e-uuid' });
      expect(invalido.statusCode).toBe(400);
      expect(invalido.json().erro).toBe('validacao');
      expect((await chamar('GET', '/api/nada', 'recepcao')).statusCode).toBe(404);
    });
  });

  describe('pagamentos', () => {
    it('recepção informa, divide, limpa; a soma precisa bater; um pagamento acompanha o total do rascunho', async () => {
      const paciente = (await chamar('GET', '/api/patients?q=souza', 'recepcao')).json()[0];
      const nota = (await chamar('POST', '/api/invoices', 'recepcao', { companyId: ids.company, patientId: paciente.id, professionalId: ids.professional })).json();
      await chamar('POST', `/api/invoices/${nota.id}/items`, 'recepcao', { serviceTemplateId: ids.consulta }); // 40000
      const um = await chamar('PUT', `/api/invoices/${nota.id}/payments`, 'recepcao', { payments: [{ method: 'PIX', amountCents: 40000 }] });
      expect(um.statusCode).toBe(200);
      expect(um.json().payments).toMatchObject([{ method: 'PIX', amountCents: 40000, sortOrder: 0 }]);
      // o total muda: o pagamento único acompanha
      const comRetorno = await chamar('POST', `/api/invoices/${nota.id}/items`, 'recepcao', { serviceTemplateId: ids.consulta, unitAmountCents: 10000 });
      expect(comRetorno.json().payments[0].amountCents).toBe(50000);
      expect((await chamar('PUT', `/api/invoices/${nota.id}/payments`, 'recepcao', { payments: [{ method: 'PIX', amountCents: 30000 }, { method: 'CREDIT_CARD', amountCents: 10000 }] })).statusCode).toBe(422);
      const dividido = await chamar('PUT', `/api/invoices/${nota.id}/payments`, 'recepcao', { payments: [{ method: 'PIX', amountCents: 30000 }, { method: 'CREDIT_CARD', amountCents: 20000 }] });
      expect(dividido.json().payments.map((p: { method: string }) => p.method)).toEqual(['PIX', 'CREDIT_CARD']);
      expect((await chamar('PUT', `/api/invoices/${nota.id}/payments`, 'recepcao', { payments: [{ method: 'PIX', amountCents: -5 }] })).statusCode).toBe(400);
      expect((await chamar('PUT', `/api/invoices/${nota.id}/payments`, 'auditor', { payments: [] })).statusCode).toBe(403);
      expect((await chamar('PUT', `/api/invoices/${nota.id}/payments`, 'recepcao', { payments: [] })).json().payments).toEqual([]);
      expect((await chamar('GET', `/api/invoices/${nota.id}`, 'auditor')).json()).toHaveProperty('payments');
      expect(await prisma.auditLog.count({ where: { entityId: nota.id, action: 'INVOICE_PAYMENTS_UPDATED' } })).toBe(3);
    });
  });

  it('lista aceita vários status e busca por nome, CPF formatado ou número da nota', async () => {
    const todas = (await chamar('GET', '/api/invoices?status=DRAFT,READY', 'auditor')).json() as { status: string }[];
    expect(todas.length).toBeGreaterThan(0);
    expect(todas.every((n) => n.status === 'DRAFT' || n.status === 'READY')).toBe(true);
    expect((await chamar('GET', '/api/invoices?status=DRAFT,NADA', 'auditor')).statusCode).toBe(400);
    expect((await chamar('GET', '/api/invoices?q=souza', 'auditor')).json().length).toBeGreaterThan(0);
    expect((await chamar('GET', '/api/invoices?q=111.444.777-35', 'auditor')).json().length).toBeGreaterThan(0);
    expect((await chamar('GET', '/api/invoices?q=999999', 'auditor')).json()).toHaveLength(0);
  });

  describe('resumo e relatórios', () => {
    let paciente: { id: string };
    const semente = {} as { a1: string; b1: string; cancelada: string };

    beforeAll(async () => {
      paciente = (await chamar('GET', '/api/patients?q=souza', 'recepcao')).json()[0];
      const b = await prisma.company.create({ data: { slug: 'b', legalName: 'B', cnpj: '11222333000181' } });
      await prisma.companyServiceFiscalConfig.create({
        data: { companyId: b.id, serviceTemplateId: ids.consulta, nationalTaxCode: '040101', taxationType: '1', issWithholdingType: '1' },
      });
      let numero = 0;
      /** Cria rascunho com um serviço e o leva direto à situação pedida, com as datas dadas. O trigger do banco só trava UPDATE a partir de nota não editável, então a semente passa. */
      const emitida = async (companyId: string, submittedAt: string, status: InvoiceStatus = 'AUTHORIZED', extra: Partial<Prisma.InvoiceUncheckedUpdateInput> = {}) => {
        const n = (await chamar('POST', '/api/invoices', 'recepcao', { companyId, patientId: paciente.id, professionalId: ids.professional })).json();
        await chamar('POST', `/api/invoices/${n.id}/items`, 'recepcao', { serviceTemplateId: ids.consulta });
        return prisma.invoice.update({ where: { id: n.id }, data: { status, submittedAt: new Date(submittedAt), authorizedAt: new Date(submittedAt), externalNumber: String(++numero), externalVerificationCode: 'V' + numero, ...extra } });
      };
      semente.a1 = (await emitida(ids.company, '2026-10-03T14:00:00Z')).id;
      await emitida(ids.company, '2026-10-10T12:00:00Z', 'CANCELLATION_ERROR');
      await emitida(ids.company, '2026-10-01T01:00:00Z');
      semente.cancelada = (await emitida(ids.company, '2026-10-15T12:00:00Z', 'CANCELLED', { cancelledAt: new Date('2026-10-16T12:00:00Z') })).id;
      semente.b1 = (await emitida(b.id, '2026-10-05T12:00:00Z')).id;
      const pagar = (id: string, payments: { method: string; amountCents: number }[]) => chamar('PUT', `/api/invoices/${id}/payments`, 'recepcao', { payments });
      await pagar(semente.a1, [{ method: 'PIX', amountCents: 40000 }]);
      await pagar(semente.b1, [{ method: 'PIX', amountCents: 25000 }, { method: 'CREDIT_CARD', amountCents: 15000 }]);
      await pagar(semente.cancelada, [{ method: 'CASH', amountCents: 40000 }]);
    });

    it('resumo do mês por empresa: válidas no fisco por data de envio, canceladas à parte, mês anterior', async () => {
      const r = await chamar('GET', '/api/invoices/summary?month=2026-10', 'auditor');
      expect(r.statusCode).toBe(200);
      const s = r.json();
      const a = s.companies.find((c: { companyId: string }) => c.companyId === ids.company);
      expect(a.issued).toEqual({ count: 2, cents: 80000 }); // AUTHORIZED + CANCELLATION_ERROR; a de 01/10 01:00Z é setembro
      expect(a.cancelled).toEqual({ count: 1, cents: 40000 });
      expect(a.previous).toEqual({ count: 1, cents: 40000 });
      expect(s.total.issued).toEqual({ count: 3, cents: 120000 });
      expect(s.previousMonth).toBe('2026-09');
      expect(s.errors).toBeGreaterThanOrEqual(1);
      expect(s.open).toBeGreaterThanOrEqual(1);
      expect((await chamar('GET', '/api/invoices/summary?month=2026-13', 'auditor')).statusCode).toBe(400);
      expect((await chamar('GET', '/api/invoices/summary?month=abc', 'auditor')).statusCode).toBe(400);
      expect((await chamar('GET', '/api/invoices/summary')).statusCode).toBe(401);
    });

    it('CSV: recepção e admin exportam com auditoria, auditor não', async () => {
      const r = await chamar('GET', `/api/reports/invoices.csv?month=2026-10&company=${ids.company}`, 'recepcao');
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toMatch(/text\/csv/);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['content-disposition']).toBe('attachment; filename="notas-2026-10-a.csv"');
      expect(r.body.split('\r\n')).toHaveLength(3 + 2 + 1); // cabeçalho + 3 linhas + total + vazio
      expect((await chamar('GET', '/api/reports/invoices.csv?month=2026-10', 'auditor')).statusCode).toBe(403);
      const log = await prisma.auditLog.findFirst({ where: { action: 'REPORT_EXPORTED' }, orderBy: { createdAt: 'desc' } });
      expect(log?.metadataJson).toMatchObject({ month: '2026-10', rows: 3, via: 'web' });
    });

    it('relatório: uma linha por nota no fisco, totais por forma só das válidas, filtros', async () => {
      const r = (await chamar('GET', '/api/reports/invoices?month=2026-10', 'recepcao')).json();
      expect(r.rows).toHaveLength(4); // 2 válidas A + 1 cancelada A + 1 válida B
      expect(r.rows.map((x: { status: string }) => x.status)).toContain('CANCELLED');
      expect(r.totals.issued).toEqual({ count: 3, cents: 120000 });
      expect(r.totals.cancelled).toEqual({ count: 1, cents: 40000 });
      expect(r.totals.byMethod).toMatchObject({ PIX: 65000, CREDIT_CARD: 15000, CASH: 0 }); // CASH da cancelada não conta
      expect(r.totals.unassigned).toEqual({ count: 1, cents: 40000 }); // a CANCELLATION_ERROR sem pagamento
      const linha = r.rows.find((x: { number: string }) => x.number === '1');
      expect(linha.patient.document).toBe('111.444.777-35');
      expect(linha.services).toBe('Consulta');
      expect(linha.issuedAt).toBe('2026-10-03T14:00:00.000Z');
      const linhas = async (q: string) => (await chamar('GET', `/api/reports/invoices?month=2026-10${q}`, 'recepcao')).json().rows;
      expect(await linhas('&situation=cancelled')).toHaveLength(1);
      expect(await linhas('&situation=issued')).toHaveLength(3);
      expect(await linhas('&payment=none')).toHaveLength(1);
      expect(await linhas('&payment=CREDIT_CARD')).toHaveLength(1);
      expect(await linhas(`&company=${ids.company}`)).toHaveLength(3);
      expect((await chamar('GET', '/api/reports/invoices?month=2026-09', 'recepcao')).json().rows).toHaveLength(1);
      expect((await chamar('GET', '/api/reports/invoices?month=2026-1', 'recepcao')).statusCode).toBe(400);
    });

    it('PDF: 404 sem pdfUrl; host fake devolve o PDF embutido nomeado; URL real passa pelo fetch injetado; falha vira 502', async () => {
      expect((await chamar('GET', `/api/invoices/${semente.a1}/pdf`, 'auditor')).json()).toMatchObject({ erro: 'sem_pdf' });
      // pdfUrl não está entre as colunas travadas pelo trigger invoice_guard, então a nota AUTHORIZED aceita o update.
      await prisma.invoice.update({ where: { id: semente.a1 }, data: { pdfUrl: 'https://fake.invalid/nfse/1.pdf' } });
      const fake = await chamar('GET', `/api/invoices/${semente.a1}/pdf`, 'auditor');
      expect(fake.statusCode).toBe(200);
      expect(fake.headers['content-type']).toBe('application/pdf');
      expect(fake.headers['cache-control']).toBe('no-store');
      expect(fake.headers['content-disposition']).toContain('attachment; filename="NFS-e 1 - Maria de Souza.pdf"');
      expect(fake.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
      await prisma.invoice.update({ where: { id: semente.a1 }, data: { pdfUrl: 'https://focus.example/nfse/1.pdf' } });
      vi.stubGlobal('fetch', async () => new Response(Buffer.from('%PDF-1.4 real'), { status: 200 }));
      expect((await chamar('GET', `/api/invoices/${semente.a1}/pdf`, 'recepcao')).body).toBe('%PDF-1.4 real');
      vi.stubGlobal('fetch', async () => new Response('x', { status: 500 }));
      expect((await chamar('GET', `/api/invoices/${semente.a1}/pdf`, 'recepcao')).json()).toMatchObject({ erro: 'pdf_indisponivel' });
      vi.stubGlobal('fetch', async () => {
        throw new Error('rede');
      });
      expect((await chamar('GET', `/api/invoices/${semente.a1}/pdf`, 'recepcao')).statusCode).toBe(502);
      await prisma.invoice.update({ where: { id: semente.a1 }, data: { pdfUrl: 'nem-url' } });
      expect((await chamar('GET', `/api/invoices/${semente.a1}/pdf`, 'recepcao')).statusCode).toBe(502);
      expect((await chamar('GET', `/api/invoices/${randomUUID()}/pdf`, 'recepcao')).statusCode).toBe(404);
      expect((await chamar('GET', `/api/invoices/${semente.a1}/pdf`)).statusCode).toBe(401);
    });

    it('tendência: meses terminando em until, por empresa, com zeros e limites de São Paulo', async () => {
      const r = await chamar('GET', '/api/reports/trend?until=2026-10&months=3', 'auditor');
      expect(r.statusCode).toBe(200);
      const t = r.json();
      expect(t.until).toBe('2026-10');
      expect(t.months).toEqual(['2026-08', '2026-09', '2026-10']);
      const a = t.companies.find((c: { companyId: string }) => c.companyId === ids.company);
      expect(a.months.map((m: { issued: unknown }) => m.issued)).toEqual([{ count: 0, cents: 0 }, { count: 1, cents: 40000 }, { count: 2, cents: 80000 }]); // 01/10 01:00Z é setembro
      expect(t.companies.find((c: { name: string }) => c.name === 'B').months[2].issued).toEqual({ count: 1, cents: 40000 });
      expect((await chamar('GET', '/api/reports/trend?until=2026-10', 'auditor')).json().months).toHaveLength(12);
      expect((await chamar('GET', '/api/reports/trend?months=25', 'auditor')).statusCode).toBe(400);
      expect((await chamar('GET', '/api/reports/trend?months=0', 'auditor')).statusCode).toBe(400);
      expect((await chamar('GET', '/api/reports/trend?until=2026-13', 'auditor')).statusCode).toBe(400);
      expect((await chamar('GET', '/api/reports/trend')).statusCode).toBe(401);
    });
  });

  describe('token de acesso', () => {
    it('Bearer lê, não escreve, e cai com revogação, usuário inativo ou prefixo errado', async () => {
      const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@teste.local' } });
      const token = gerarToken();
      const registro = await prisma.apiToken.create({ data: { userId: admin.id, name: 'teste', tokenHash: hashToken(token) } });
      const bearer = { authorization: `Bearer ${token}` };
      const ok = await app.inject({ method: 'GET', url: '/api/invoices/summary?month=2026-10', headers: bearer });
      expect(ok.statusCode).toBe(200);
      expect(ok.headers['set-cookie']).toBeUndefined();
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer })).json()).toMatchObject({ role: 'ADMIN' });
      const escrita = await app.inject({ method: 'POST', url: '/api/patients', headers: bearer, payload: { type: 'UNIDENTIFIED', name: 'X' } });
      expect(escrita.statusCode).toBe(403);
      expect(escrita.json().erro).toBe('token_somente_leitura');
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer xx_${token.slice(3)}` } })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: 'Bearer qf_naoexiste' } })).statusCode).toBe(401);
      await prisma.apiToken.update({ where: { id: registro.id }, data: { revokedAt: new Date() } });
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer })).statusCode).toBe(401);
      const outro = gerarToken();
      const inativo = await prisma.user.findUniqueOrThrow({ where: { email: 'inativo@teste.local' } });
      await prisma.apiToken.create({ data: { userId: inativo.id, name: 't', tokenHash: hashToken(outro) } });
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${outro}` } })).statusCode).toBe(401);
    });
    it('o gate somente leitura não depende da URL: caminho codificado é barrado e HEAD passa', async () => {
      const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@teste.local' } });
      const token = gerarToken();
      await prisma.apiToken.create({ data: { userId: admin.id, name: 'gate', tokenHash: hashToken(token) } });
      const bearer = { authorization: `Bearer ${token}` };
      const r = await app.inject({ method: 'POST', url: '/%61pi/patients', headers: bearer, payload: { type: 'UNIDENTIFIED', name: 'X' } });
      expect(r.statusCode).toBe(403);
      expect(r.json().erro).toBe('token_somente_leitura');
      expect((await app.inject({ method: 'HEAD', url: '/api/auth/me', headers: bearer })).statusCode).not.toBe(403);
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `bearer ${token}` } })).statusCode).toBe(200);
    });
    it('CSV por token registra via token e o nome', async () => {
      const fin = await prisma.user.findUniqueOrThrow({ where: { email: 'financeiro@teste.local' } });
      const token = gerarToken();
      await prisma.apiToken.create({ data: { userId: fin.id, name: 'contador', tokenHash: hashToken(token) } });
      expect((await app.inject({ method: 'GET', url: '/api/reports/invoices.csv?month=2026-10', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
      const log = await prisma.auditLog.findFirst({ where: { action: 'REPORT_EXPORTED' }, orderBy: { createdAt: 'desc' } });
      expect(log?.metadataJson).toMatchObject({ via: 'token', tokenName: 'contador' });
    });
    it('relatório JSON por token é auditado (format json); pela web não', async () => {
      const fin = await prisma.user.findUniqueOrThrow({ where: { email: 'financeiro@teste.local' } });
      const token = gerarToken();
      await prisma.apiToken.create({ data: { userId: fin.id, name: 'json', tokenHash: hashToken(token) } });
      const antes = await prisma.auditLog.count({ where: { action: 'REPORT_EXPORTED' } });
      expect((await app.inject({ method: 'GET', url: '/api/reports/invoices?month=2026-10', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
      expect(await prisma.auditLog.count({ where: { action: 'REPORT_EXPORTED' } })).toBe(antes + 1);
      const log = await prisma.auditLog.findFirst({ where: { action: 'REPORT_EXPORTED' }, orderBy: { createdAt: 'desc' } });
      expect(log?.metadataJson).toMatchObject({ via: 'token', tokenName: 'json', format: 'json' });
      expect((await chamar('GET', '/api/reports/invoices?month=2026-10', 'recepcao')).statusCode).toBe(200);
      expect(await prisma.auditLog.count({ where: { action: 'REPORT_EXPORTED' } })).toBe(antes + 1);
    });
  });

  describe('cadastro de empresa (assistente)', () => {
    const emissora = {
      cnpj: '33444555000181', razaoSocial: 'CLINICA NOVA LTDA', nomeFantasia: 'Clínica Nova', codigoMunicipioEmissor: '3550308',
      opSimpNac: '3', regApTribSN: '1', regEspTrib: '0', codigoTributacaoNacional: '041201', codigoNbs: '123012100',
      tributacaoIssqn: '1', retencaoIssqn: '1', aliquotaIss: 2, percentualTributosSimples: 6, pisCofins: { cst: '07', tipoRetencao: '0' },
      ibsCbs: { codigoIndicadorOperacao: '030101', cst: '000', classificacaoTributaria: '000001', indicadorDestinatario: '0' },
    };

    it('recepção não cadastra; dados inválidos voltam com o campo; válidos criam empresa, emissora e padrão fiscal', async () => {
      expect((await chamar('POST', '/api/companies', 'recepcao', { slug: 'nova-clinica', ...emissora })).statusCode).toBe(403);
      const ruim = await chamar('POST', '/api/companies', 'admin', { slug: 'Nova Clínica', ...emissora, cnpj: '33444555000100', codigoMunicipioEmissor: '35' });
      expect(ruim.statusCode).toBe(400);
      const problemas = ruim.json().problemas.join(' ');
      expect(problemas).toMatch(/slug/);
      expect(problemas).toMatch(/cnpj/);
      expect(problemas).toMatch(/codigoMunicipioEmissor/);

      const r = await chamar('POST', '/api/companies', 'financeiro', { slug: 'nova-clinica', ...emissora });
      expect(r.statusCode).toBe(201);
      expect(r.json()).toMatchObject({ slug: 'nova-clinica', legalName: 'CLINICA NOVA LTDA', tradeName: 'Clínica Nova', cnpj: '33444555000181', productionEnabled: false, configured: true });
      expect(r.json()).not.toHaveProperty('fiscalConfigJson');
      const id = r.json().id;
      expect((await chamar('GET', `/api/companies/${id}/emitter`, 'financeiro')).json()).toMatchObject({ cnpj: '33444555000181', codigoTributacaoNacional: '041201', pisCofins: { cst: '07' } });
      expect((await chamar('GET', `/api/companies/${id}/emitter`, 'recepcao')).statusCode).toBe(403);
      expect((await chamar('GET', `/api/companies/${id}/fiscal-default`, 'financeiro')).json()).toMatchObject({ nationalTaxCode: '041201', nbsCode: '123012100', issRate: '2', taxationType: '1', issWithholdingType: '1' });
      expect((await chamar('GET', '/api/companies', 'recepcao')).json().find((c: { id: string }) => c.id === id)).toMatchObject({ configured: true });
      // Mesmo CNPJ de novo: conflito, não segunda empresa.
      expect((await chamar('POST', '/api/companies', 'admin', { slug: 'nova-clinica-2', ...emissora })).statusCode).toBe(409);
      expect(await prisma.auditLog.count({ where: { action: 'COMPANY_CREATED' } })).toBe(1);
    });

    it('editar atualiza identidade, emissora e os códigos do padrão sem mexer na flag active', async () => {
      const { id } = await prisma.company.findUniqueOrThrow({ where: { slug: 'nova-clinica' } });
      await prisma.companyFiscalDefault.update({ where: { companyId: id }, data: { active: false } });
      const { aliquotaIss: _, ...semIss } = emissora;
      const r = await chamar('PUT', `/api/companies/${id}/emitter`, 'admin', { ...semIss, nomeFantasia: 'Nova', codigoTributacaoNacional: '040101' });
      expect(r.json()).toMatchObject({ tradeName: 'Nova', configured: true });
      expect(await prisma.companyFiscalDefault.findUniqueOrThrow({ where: { companyId: id } })).toMatchObject({ nationalTaxCode: '040101', issRate: null, active: false });
      expect((await chamar('GET', `/api/companies/${id}/emitter`, 'admin')).json()).toMatchObject({ nomeFantasia: 'Nova', codigoTributacaoNacional: '040101' });
      expect((await chamar('PUT', `/api/companies/${randomUUID()}/emitter`, 'admin', emissora)).statusCode).toBe(404);
      expect((await chamar('PUT', `/api/companies/${id}/emitter`, 'admin', { ...emissora, opSimpNac: '1' })).json().problemas).toEqual(['percentualTributosFederais: não optante do Simples precisa de percentualTributosFederais']);
    });
  });
});
