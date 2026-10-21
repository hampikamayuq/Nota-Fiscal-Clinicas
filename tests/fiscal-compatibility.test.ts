import { describe, expect, it } from 'vitest';
import {
  checkFiscalCompatibility,
  parseFiscalSnapshot,
  type CompatibilityItem,
} from '../src/app/invoices/fiscal-compatibility.ts';

const base = {
  nationalTaxCode: '040101',
  municipalTaxCode: '0401',
  nbsCode: '123456789',
  issRate: '5.00',
  taxationType: '1',
  issWithholdingType: '1',
  pisCofins: { cst: '00', a: 1, b: 2 },
  ibsCbs: null,
  additional: { x: 1 },
};

const item = (name: string, over: Record<string, unknown> = {}): CompatibilityItem => ({
  name,
  fiscalConfigSnapshotJson: { ...base, ...over },
});

function problems(items: CompatibilityItem[]): string[] {
  const r = checkFiscalCompatibility(items);
  if (r.compatible) throw new Error('esperava incompatível');
  return r.problems;
}

describe('parseFiscalSnapshot', () => {
  it('aceita snapshot válido e trata ausentes como null', () => {
    const s = parseFiscalSnapshot({ nationalTaxCode: 'a', taxationType: '1', issWithholdingType: '2' });
    expect(s).toEqual({
      nationalTaxCode: 'a',
      municipalTaxCode: null,
      nbsCode: null,
      issRate: null,
      taxationType: '1',
      issWithholdingType: '2',
      pisCofins: null,
      ibsCbs: null,
      additional: null,
    });
  });

  it('retorna null para entradas inválidas', () => {
    expect(parseFiscalSnapshot(null)).toBeNull();
    expect(parseFiscalSnapshot('x')).toBeNull();
    expect(parseFiscalSnapshot({ ...base, nationalTaxCode: '' })).toBeNull();
    expect(parseFiscalSnapshot({ ...base, issRate: 5 })).toBeNull();
  });
});

describe('checkFiscalCompatibility', () => {
  it('um item é compatível e devolve o snapshot', () => {
    const r = checkFiscalCompatibility([item('A')]);
    expect(r).toEqual({ compatible: true, fiscal: base });
  });

  it('dois itens idênticos são compatíveis', () => {
    expect(checkFiscalCompatibility([item('A'), item('B')]).compatible).toBe(true);
  });

  it('"5" e "5.00" são a mesma alíquota', () => {
    expect(checkFiscalCompatibility([item('A', { issRate: '5' }), item('B')]).compatible).toBe(true);
  });

  it('JSON igual com chaves em outra ordem é compatível', () => {
    const r = checkFiscalCompatibility([
      item('A'),
      item('B', { pisCofins: { b: 2, a: 1, cst: '00' }, additional: { x: 1 } }),
    ]);
    expect(r.compatible).toBe(true);
  });

  it.each([
    ['nationalTaxCode', '990101', 'código de tributação nacional'],
    ['municipalTaxCode', '9999', 'código de tributação municipal'],
    ['nbsCode', '987654321', 'NBS'],
    ['issRate', '2.00', 'alíquota do ISS'],
    ['taxationType', '2', 'tributação do ISSQN'],
    ['issWithholdingType', '2', 'retenção do ISSQN'],
  ])('%s diferente gera exatamente um problema', (field, value, label) => {
    const p = problems([item('Consulta', {}), item('Botox', { [field]: value })]);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('Consulta');
    expect(p[0]).toContain('Botox');
    expect(p[0]).toContain(label);
    expect(p[0]).toContain(value);
  });

  it('null contra valor aparece como "não informado"', () => {
    const p = problems([item('A', { nbsCode: null }), item('B')]);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('não informado');
    expect(p[0]).toContain('123456789');
  });

  it('null só é igual a null', () => {
    expect(checkFiscalCompatibility([item('A', { issRate: null }), item('B', { issRate: null })]).compatible).toBe(
      true,
    );
    expect(problems([item('A', { issRate: null }), item('B', { issRate: '0' })])).toHaveLength(1);
  });

  it.each([
    ['pisCofins', { cst: '01' }, 'PIS/COFINS'],
    ['ibsCbs', { cst: '01' }, 'IBS/CBS'],
    ['additional', { x: 2 }, 'configuração adicional'],
  ])('%s diferente gera um problema sem despejar JSON', (field, value, label) => {
    const p = problems([item('A'), item('B', { [field]: value })]);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain(label);
    expect(p[0]).not.toContain('{');
  });

  it('item sem snapshot válido gera um problema por item', () => {
    const p = problems([
      item('A'),
      { name: 'Legado', fiscalConfigSnapshotJson: null },
      { name: 'Quebrado', fiscalConfigSnapshotJson: { nationalTaxCode: '' } },
    ]);
    expect(p).toHaveLength(2);
    expect(p[0]).toContain('Legado');
    expect(p[0]).toContain('não tem configuração fiscal registrada');
    expect(p[1]).toContain('Quebrado');
  });

  it('lista vazia é incompatível', () => {
    const p = problems([]);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('não tem serviços');
  });

  it('três itens em que o terceiro difere apontam só o terceiro', () => {
    const p = problems([item('A'), item('B'), item('C', { taxationType: '3' })]);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('C');
    expect(p[0]).toContain('A');
    expect(p[0]).not.toContain('"B"');
  });
});
