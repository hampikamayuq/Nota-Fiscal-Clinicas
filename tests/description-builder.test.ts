import { describe, expect, it } from 'vitest';
import {
  MAX_DESCRIPTION_LENGTH,
  buildInvoiceDescription,
  checkInvoiceDescription,
  type DescriptionInput,
} from '../src/app/invoices/description-builder.ts';
import { InvoiceRuleError } from '../src/app/invoices/invoice-rules.ts';

// "Biópsia" é termo sensível em descricaoSensivel, então os nomes de teste a evitam.
const input: DescriptionInput = {
  items: [
    { name: 'Consulta', description: 'Consulta dermatológica', tussCode: '10101012', quantity: 1, unitAmountCents: 40000, totalAmountCents: 40000 },
    { name: 'Procedimento', description: 'Procedimento de pele — 2 fragmentos', tussCode: '20104049', quantity: 2, unitAmountCents: 30000, totalAmountCents: 60000 },
  ],
  professional: { name: 'Dra. Exemplo Dermatologista', council: 'CRM', crmNumber: '123456', crmState: 'RJ', rqe: '11111, 22222', specialty: 'Dermatologia' },
  totalAmountCents: 100000,
};

const GOLDEN = [
  'Consulta dermatológica',
  'Código TUSS: 10101012',
  'Valor: R$ 400,00',
  '',
  'Procedimento de pele — 2 fragmentos',
  'Código TUSS: 20104049',
  'Valor: 2 x R$ 300,00 = R$ 600,00',
  '',
  'Profissional responsável:',
  'Dra. Exemplo Dermatologista',
  'CRM-RJ 123456',
  'RQE 11111, 22222',
  '',
  'Valor total dos serviços: R$ 1.000,00',
].join('\n');

describe('buildInvoiceDescription', () => {
  it('gera o formato exato', () => {
    expect(buildInvoiceDescription(input)).toBe(GOLDEN);
  });

  it('carimba a sigla do conselho do profissional, não CRM fixo', () => {
    const texto = buildInvoiceDescription({ ...input, professional: { ...input.professional, council: 'CRO', rqe: null } });
    expect(texto).toContain('CRO-RJ 123456');
    expect(texto).not.toContain('CRM');
  });

  it('usa name quando description é igual, sem TUSS e sem RQE', () => {
    const out = buildInvoiceDescription({
      items: [{ name: 'Consulta', description: 'Consulta', tussCode: null, quantity: 1, unitAmountCents: 15000, totalAmountCents: 15000 }],
      professional: { name: 'Dr. X', council: 'CRM', crmNumber: '9', crmState: 'SP', rqe: null, specialty: null },
      totalAmountCents: 15000,
    });
    expect(out).toBe(
      'Consulta\nValor: R$ 150,00\n\nProfissional responsável:\nDr. X\nCRM-SP 9\n\nValor total dos serviços: R$ 150,00',
    );
  });

  it('usa espaço comum depois de R$', () => {
    const out = buildInvoiceDescription(input);
    expect(out).not.toContain(' ');
    expect(out).toContain('R$ 1.000,00');
  });

  it('rejeita lista de itens vazia', () => {
    expect(() => buildInvoiceDescription({ ...input, items: [] })).toThrow(InvoiceRuleError);
  });

  it('rejeita descrição acima do limite informando o excesso', () => {
    const longo = { ...input.items[0]!, description: 'a'.repeat(MAX_DESCRIPTION_LENGTH) };
    expect(() => buildInvoiceDescription({ ...input, items: [longo] })).toThrow(/caracteres a mais/);
    expect(() => buildInvoiceDescription({ ...input, items: [longo] })).toThrow(InvoiceRuleError);
  });
});

describe('checkInvoiceDescription', () => {
  it('descrição gerada não tem bloqueios nem avisos', () => {
    expect(checkInvoiceDescription(buildInvoiceDescription(input), input)).toEqual({ blocking: [], warnings: [] });
  });

  it('bloqueia texto vazio', () => {
    expect(checkInvoiceDescription('  \n ', input).blocking).toHaveLength(1);
  });

  it('bloqueia texto acima do limite', () => {
    const r = checkInvoiceDescription(GOLDEN + 'a'.repeat(MAX_DESCRIPTION_LENGTH), input);
    expect(r.blocking.some((m) => m.includes(String(MAX_DESCRIPTION_LENGTH)))).toBe(true);
  });

  it('bloqueia CID e palavra de diagnóstico, citando o motivo', () => {
    expect(checkInvoiceDescription(`${GOLDEN}\nCID L40`, input).blocking.join(' ')).toContain('CID');
    expect(checkInvoiceDescription(`${GOLDEN}\nDiagnóstico: x`, input).blocking.join(' ')).toContain('diagnostico');
  });

  it('avisa quando falta código TUSS', () => {
    const w = checkInvoiceDescription(GOLDEN.replace('20104049', ''), input).warnings;
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('20104049');
  });

  it('avisa quando falta o CRM', () => {
    const w = checkInvoiceDescription(GOLDEN.replace('123456', ''), input).warnings;
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('CRM');
  });

  it('avisa por RQE ausente, individualmente', () => {
    const w = checkInvoiceDescription(GOLDEN.replace('22222', ''), input).warnings;
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('22222');
  });

  it('avisa quando falta o total', () => {
    const w = checkInvoiceDescription(GOLDEN.replace('R$ 1.000,00', ''), input).warnings;
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('R$ 1.000,00');
  });
});

describe('procedimento do catálogo não é dado sensível', () => {
  const entrada: DescriptionInput = {
    items: [{ name: 'Biópsia de pele', description: 'Biópsia de pele', tussCode: '20104049', quantity: 1, unitAmountCents: 55000, totalAmountCents: 55000 }],
    professional: { name: 'Dra. Exemplo', council: 'CRM', crmNumber: '123456', crmState: 'RJ', rqe: null, specialty: null },
    totalAmountCents: 55000,
    catalog: ['Biópsia de pele'],
  };
  it('a descrição gerada com "Biópsia de pele" passa sem bloqueio', () => {
    expect(checkInvoiceDescription(buildInvoiceDescription(entrada), entrada).blocking).toEqual([]);
  });
  it('mas diagnóstico digitado à mão continua bloqueado', () => {
    const texto = buildInvoiceDescription(entrada) + '\nResultado: tumor benigno';
    expect(checkInvoiceDescription(texto, entrada).blocking.join(' ')).toMatch(/sensível/);
  });
  it('descrição do item digitada pela recepção não é catálogo: termo sensível nela bloqueia', () => {
    const digitada = { ...entrada, items: [{ ...entrada.items[0]!, description: 'Biópsia de tumor' }] };
    expect(checkInvoiceDescription(buildInvoiceDescription(digitada), digitada).blocking.join(' ')).toMatch(/sensível/);
  });
});

