/**
 * Regras puras da nota: o que o serviço aplica sem precisar de banco.
 */
import { describe, expect, it } from 'vitest';
import { buildInvoiceDescription } from '../src/app/invoices/description-builder.ts';
import {
  InvoiceRuleError,
  assertPaymentsMatchTotal,
  paymentsMismatch,
  reaisBR,
  assertEditable,
  assertTransition,
  canTransition,
  invoiceTotalCents,
  isEditable,
  itemSnapshot,
  itemTotalCents,
  professionalSnapshot,
} from '../src/app/invoices/invoice-rules.ts';

const TEMPLATE = {
  id: 't1',
  name: 'Biópsia de pele',
  defaultDescription: 'Biópsia de pele',
  tussCode: '00000002',
  tussVersion: '2024',
  defaultAmountCents: 55000,
  allowDescriptionEdit: true,
  allowAmountEdit: true,
};

describe('totais', () => {
  it('item = quantidade × unitário; nota = soma dos itens', () => {
    expect(itemTotalCents(2, 40000)).toBe(80000);
    expect(invoiceTotalCents([{ totalAmountCents: 40000 }, { totalAmountCents: 55000 }])).toBe(95000);
    expect(invoiceTotalCents([])).toBe(0);
  });

  it('recusa item ou nota acima do teto do Int de centavos', () => {
    expect(() => itemTotalCents(999, 100_000_000)).toThrow(/limite/);
    expect(() => invoiceTotalCents([{ totalAmountCents: 2_000_000_000 }, { totalAmountCents: 200_000_000 }])).toThrow(/limite/);
  });

  it('recusa quantidade zero, fracionária ou centavos negativos/fracionários', () => {
    expect(() => itemTotalCents(0, 100)).toThrow(InvoiceRuleError);
    expect(() => itemTotalCents(1.5, 100)).toThrow(InvoiceRuleError);
    expect(() => itemTotalCents(1, -1)).toThrow(InvoiceRuleError);
    expect(() => itemTotalCents(1, 10.5)).toThrow(InvoiceRuleError);
  });
});

describe('imutabilidade e transições', () => {
  it('só DRAFT e READY são editáveis', () => {
    expect(isEditable('DRAFT')).toBe(true);
    expect(isEditable('READY')).toBe(true);
    for (const s of ['SUBMITTING', 'PROCESSING', 'AUTHORIZED', 'REJECTED', 'CANCELLED'] as const) {
      expect(isEditable(s)).toBe(false);
      expect(() => assertEditable(s)).toThrow(InvoiceRuleError);
    }
  });

  it('segue a máquina de estados do plano', () => {
    expect(canTransition('DRAFT', 'READY')).toBe(true);
    expect(canTransition('READY', 'SUBMITTING')).toBe(true);
    expect(canTransition('SUBMITTING', 'PROCESSING')).toBe(true);
    expect(canTransition('PROCESSING', 'AUTHORIZED')).toBe(true);
    expect(canTransition('AUTHORIZED', 'CANCELLATION_REQUESTED')).toBe(true);
    expect(canTransition('CANCELLATION_REQUESTED', 'CANCELLED')).toBe(true);
    expect(canTransition('REJECTED', 'DRAFT')).toBe(true);
    expect(canTransition('AUTHORIZED', 'DRAFT')).toBe(false);
    expect(canTransition('DRAFT', 'AUTHORIZED')).toBe(false);
    expect(canTransition('CANCELLED', 'DRAFT')).toBe(false);
    expect(() => assertTransition('CANCELLED', 'AUTHORIZED')).toThrow(InvoiceRuleError);
  });
});

describe('snapshots', () => {
  it('profissional: copia nome, conselho, número, UF, especialidade e o RQE', () => {
    const s = professionalSnapshot(
      { name: 'Dra. Exemplo', council: 'CRM', crmNumber: '123456', crmState: 'RJ', specialty: 'Dermatologia' },
      [
        { number: '11111', specialty: 'Dermatologia' },
      ],
    );
    expect(s).toEqual({
      professionalNameSnapshot: 'Dra. Exemplo',
      professionalCouncilSnapshot: 'CRM',
      professionalCrmSnapshot: '123456',
      professionalCrmStateSnapshot: 'RJ',
      professionalRqeSnapshot: '11111',
      professionalSpecialtySnapshot: 'Dermatologia',
    });
    expect(professionalSnapshot({ name: 'X', council: 'CRM', crmNumber: '1', crmState: 'SP', specialty: null }, []).professionalRqeSnapshot).toBeNull();
  });

  it('mais de um RQE: cada número com a especialidade, a principal primeiro', () => {
    const rqe = professionalSnapshot({ name: 'Dr. Exemplo', council: 'CRM', crmNumber: '654321', crmState: 'RJ', specialty: 'Dermatologia' }, [
      { number: '22222', specialty: 'Pediatria' },
      { number: '33333', specialty: 'Dermatologia' },
    ]).professionalRqeSnapshot;
    expect(rqe).toBe('33333 (Dermatologia), 22222 (Pediatria)');
    // O conferidor da descrição separa por vírgula e procura cada pedaço no texto: tem de achar todos.
    const texto = buildInvoiceDescription({
      items: [{ name: 'Consulta', description: 'Consulta dermatológica', tussCode: null, quantity: 1, unitAmountCents: 55000, totalAmountCents: 55000 }],
      professional: { name: 'Dr. Exemplo', council: 'CRM', crmNumber: '654321', crmState: 'RJ', rqe, specialty: 'Dermatologia' },
      totalAmountCents: 55000,
    });
    expect(texto).toContain('RQE 33333 (Dermatologia), 22222 (Pediatria)');
  });

  it('item: copia o modelo e a configuração fiscal, calcula o total', () => {
    const fiscal = { nationalTaxCode: '040101', municipalTaxCode: '001', nbsCode: null, issRate: '5', taxationType: '1', issWithholdingType: '1', pisCofins: null, ibsCbs: null, additional: null };
    expect(itemSnapshot(TEMPLATE, fiscal)).toEqual({
      serviceTemplateId: 't1',
      serviceNameSnapshot: 'Biópsia de pele',
      descriptionSnapshot: 'Biópsia de pele',
      tussCodeSnapshot: '00000002',
      tussVersionSnapshot: '2024',
      quantity: 1,
      unitAmountCents: 55000,
      totalAmountCents: 55000,
      fiscalConfigSnapshotJson: fiscal,
    });
  });

  it('item: aplica edições permitidas (valor, descrição, TUSS, quantidade) sem tocar o modelo', () => {
    const s = itemSnapshot(TEMPLATE, null, { unitAmountCents: 60000, quantity: 2, description: 'Biópsia de pele — 2 fragmentos', tussCode: null });
    expect(s.unitAmountCents).toBe(60000);
    expect(s.totalAmountCents).toBe(120000);
    expect(s.descriptionSnapshot).toBe('Biópsia de pele — 2 fragmentos');
    expect(s.tussCodeSnapshot).toBeNull();
    expect(TEMPLATE.defaultAmountCents).toBe(55000);
  });

  it('item: respeita allowAmountEdit e allowDescriptionEdit do modelo', () => {
    const travado = { ...TEMPLATE, allowAmountEdit: false, allowDescriptionEdit: false };
    expect(() => itemSnapshot(travado, null, { unitAmountCents: 1 })).toThrow(/valor/);
    expect(() => itemSnapshot(travado, null, { description: 'x' })).toThrow(/descrição/);
    expect(itemSnapshot(travado, null, { quantity: 3 }).totalAmountCents).toBe(165000);
    // O diálogo manda todos os campos: valor igual ao padrão não é alteração.
    expect(() => itemSnapshot(travado, null, { unitAmountCents: travado.defaultAmountCents, description: travado.defaultDescription, quantity: 2 })).not.toThrow();
  });
});

describe('pagamentos', () => {
  it('lista vazia é "não informado" e passa', () => {
    expect(() => assertPaymentsMatchTotal([], 95000)).not.toThrow();
    expect(paymentsMismatch([], 95000)).toBe(false);
  });
  it('a soma precisa bater com o total, com a diferença na mensagem', () => {
    expect(() =>
      assertPaymentsMatchTotal([{ method: 'PIX', amountCents: 30000 }, { method: 'CREDIT_CARD', amountCents: 20000 }], 95000),
    ).toThrow(`A soma dos pagamentos (${reaisBR(50000)}) precisa ser igual ao total da nota (${reaisBR(95000)}).`);
    expect(() => assertPaymentsMatchTotal([{ method: 'PIX', amountCents: 95000 }], 95000)).not.toThrow();
    expect(paymentsMismatch([{ amountCents: 1 }], 2)).toBe(true);
  });
  it('recusa mais de 6 formas e valor não inteiro ou negativo', () => {
    const sete = Array.from({ length: 7 }, () => ({ method: 'CASH' as const, amountCents: 100 }));
    expect(() => assertPaymentsMatchTotal(sete, 700)).toThrow(InvoiceRuleError);
    expect(() => assertPaymentsMatchTotal([{ method: 'PIX', amountCents: -1 }], -1)).toThrow(InvoiceRuleError);
    expect(() => assertPaymentsMatchTotal([{ method: 'PIX', amountCents: 1.5 }], 1.5)).toThrow(InvoiceRuleError);
  });
});
