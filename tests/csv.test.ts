import { describe, expect, it } from 'vitest';
import { CSV_HEADER, nomeArquivo, paraCsv } from '../src/app/reports/csv.ts';
import type { Report } from '../src/app/reports/invoice-report.ts';

const linha = (over: Partial<Report['rows'][number]> = {}): Report['rows'][number] => ({
  id: 'x', issuedAt: '2026-10-01T01:00:00.000Z', number: '12', verificationCode: 'ABC', company: { id: 'c', name: 'EXEMPLO', slug: 'exemplo' },
  patient: { name: 'Maria; Silva', document: '111.444.777-35' }, professional: 'Dra. Exemplo', services: 'Consulta "retorno"',
  totalCents: 50000, payments: [{ method: 'PIX', amountCents: 30000 }, { method: 'CREDIT_CARD', amountCents: 20000 }],
  status: 'AUTHORIZED', competenceDate: '2026-09-30', pdfUrl: 'https://p', xmlUrl: null, ...over,
});
const relatorio: Report = {
  month: '2026-10', truncated: false, rows: [linha(), linha({ number: '13', status: 'CANCELLED', payments: [], services: 'Linha\ncom quebra' })],
  totals: { issued: { count: 1, cents: 50000 }, cancelled: { count: 1, cents: 50000 }, byMethod: { PIX: 30000, CREDIT_CARD: 20000, DEBIT_CARD: 0, TRANSFER: 0, CASH: 0, HEALTH_PLAN: 0 }, unassigned: { count: 0, cents: 0 }, mismatched: { count: 0, cents: 0 } },
};

describe('csv', () => {
  it('BOM, ponto e vírgula, vírgula decimal, data em São Paulo, aspas dobradas e uma coluna por forma', () => {
    const csv = paraCsv(relatorio);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const linhas = csv.slice(1).split('\r\n');
    expect(linhas[0]).toBe(CSV_HEADER.join(';'));
    expect(linhas[1]).toBe('30/09/2026;12;ABC;EXEMPLO;"Maria; Silva";111.444.777-35;Dra. Exemplo;"Consulta ""retorno""";500,00;300,00;200,00;;;;;Emitida;30/09/2026;https://p;');
    expect(linhas[2]).toContain('"Linha\ncom quebra"');
    expect(linhas[2]).toContain(';Cancelada;');
    expect(linhas.at(-2)).toBe('Total emitido;;;;;;;;500,00;300,00;200,00;0,00;0,00;0,00;0,00;;;;');
    expect(linhas.at(-1)).toBe('');
  });
  it('neutraliza fórmulas do Excel em texto', () => {
    const csv = paraCsv({ ...relatorio, rows: [linha({ patient: { name: '=HYPERLINK("x")', document: '' }, services: '-teste' })] });
    const l = csv.split('\r\n')[1]!;
    expect(l).toContain(';"\'=HYPERLINK(""x"")";');
    expect(l).toContain(";'-teste;");
  });
  it('nome do arquivo', () => {
    expect(nomeArquivo('2026-10')).toBe('notas-2026-10.csv');
    expect(nomeArquivo('2026-10', 'exemplo')).toBe('notas-2026-10-exemplo.csv');
  });
});
