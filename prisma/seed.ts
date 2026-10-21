/**
 * Seed de desenvolvimento — só dados fictícios.
 *
 * Idempotente: roda quantas vezes quiser (upsert pelas chaves únicas). Os
 * códigos tributários copiam o config.example.json; TUSS e CNPJs são de
 * exemplo e não correspondem a nada real.
 */

import { criarPrisma } from '../src/db/client.ts';
import { hashSenha } from '../src/api/auth.ts';

try {
  process.loadEnvFile('.env');
} catch {
  /* sem .env */
}

// Dados fictícios com senha conhecida: só num banco local, nunca em produção.
const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    return '';
  }
})();
if (process.env.NODE_ENV === 'production' || (!['127.0.0.1', 'localhost', '::1'].includes(host) && process.env.SEED_PERMITIR_REMOTO !== 'sim')) {
  console.error(`Seed recusado: DATABASE_URL aponta para "${host || '?'}". Ele cria usuários com senha conhecida; use só em banco local (ou SEED_PERMITIR_REMOTO=sim num banco de teste).`);
  process.exit(1);
}

const prisma = criarPrisma();

async function main(): Promise<void> {
  const [empresaA, empresaB] = await Promise.all([
    prisma.company.upsert({
      where: { slug: 'exemplo-a' },
      update: {},
      create: { slug: 'exemplo-a', legalName: 'CLINICA EXEMPLO A LTDA', tradeName: 'Exemplo A', cnpj: '12345678000195' },
    }),
    prisma.company.upsert({
      where: { slug: 'exemplo-b' },
      update: {},
      create: { slug: 'exemplo-b', legalName: 'EXEMPLO B SERVICOS MEDICOS LTDA', tradeName: 'Exemplo B', cnpj: '11222333000181' },
    }),
  ]);

  // Senha de todos os usuários fictícios: exemplo123 (só para desenvolvimento).
  const passwordHash = await hashSenha('exemplo123');
  for (const [email, name, role] of [
    ['admin@exemplo.local', 'Admin Exemplo', 'ADMIN'],
    ['recepcao@exemplo.local', 'Recepção Exemplo', 'RECEPTION'],
    ['financeiro@exemplo.local', 'Financeiro Exemplo', 'FINANCE'],
    ['auditor@exemplo.local', 'Auditor Exemplo', 'AUDITOR'],
  ] as const) {
    await prisma.user.upsert({ where: { email }, update: { passwordHash }, create: { email, name, role, passwordHash } });
  }

  await prisma.patient.upsert({
    where: { cpf: '11144477735' },
    update: {},
    create: { type: 'INDIVIDUAL', name: 'Maria de Souza', cpf: '11144477735', email: 'maria@exemplo.local', city: 'Rio de Janeiro', state: 'RJ' },
  });
  await prisma.patient.upsert({
    where: { cnpj: '11444777000161' },
    update: {},
    create: { type: 'COMPANY', name: 'CONVENIO EXEMPLO LTDA', cnpj: '11444777000161' },
  });
  if (!(await prisma.patient.findFirst({ where: { foreignDocument: 'PASS-EXEMPLO-1' } }))) {
    await prisma.patient.create({
      data: { type: 'FOREIGN', name: 'Jane Doe', foreignDocument: 'PASS-EXEMPLO-1', countryCode: 'US' },
    });
  }

  const profissional = await prisma.professional.upsert({
    where: { council_crmNumber_crmState: { council: 'CRM', crmNumber: '123456', crmState: 'RJ' } },
    update: {},
    create: { name: 'Dra. Exemplo Dermatologista', crmNumber: '123456', crmState: 'RJ', specialty: 'Dermatologia' },
  });
  for (const [number, specialty] of [
    ['11111', 'Dermatologia'],
    ['22222', 'Cirurgia Dermatológica'],
  ] as const) {
    await prisma.professionalRQE.upsert({
      where: { professionalId_number: { professionalId: profissional.id, number } },
      update: {},
      create: { professionalId: profissional.id, number, specialty },
    });
  }

  const servicos = [
    { name: 'Consulta dermatológica', tussCode: '00000001', defaultAmountCents: 40000, favorite: true },
    { name: 'Biópsia de pele', tussCode: '00000002', defaultAmountCents: 55000, favorite: true },
    { name: 'Crioterapia', tussCode: null, defaultAmountCents: 30000, favorite: false },
    { name: 'Pequena cirurgia dermatológica', tussCode: '00000004', defaultAmountCents: 120000, favorite: false },
  ];
  for (const s of servicos) {
    const existente = await prisma.serviceTemplate.findFirst({ where: { name: s.name } });
    const template =
      existente ??
      (await prisma.serviceTemplate.create({
        data: { ...s, defaultDescription: s.name, tussVersion: s.tussCode ? '2024' : null, category: 'Dermatologia' },
      }));
    void template;
  }

  // Catálogo compartilhado; os códigos tributários são da empresa (padrão), e
  // todo serviço os herda até que o financeiro registre uma exceção.
  for (const [empresa, issRate] of [
    [empresaA, '5.00'],
    [empresaB, '2.00'],
  ] as const) {
    await prisma.companyFiscalDefault.upsert({
      where: { companyId: empresa.id },
      update: {},
      create: { companyId: empresa.id, nationalTaxCode: '040101', municipalTaxCode: '001', taxationType: '1', issWithholdingType: '1', issRate },
    });
  }

  console.log('seed ok:', {
    empresas: await prisma.company.count(),
    usuarios: await prisma.user.count(),
    pacientes: await prisma.patient.count(),
    profissionais: await prisma.professional.count(),
    servicos: await prisma.serviceTemplate.count(),
    padroesFiscais: await prisma.companyFiscalDefault.count(),
    excecoesFiscais: await prisma.companyServiceFiscalConfig.count(),
  });
}

main()
  .catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
