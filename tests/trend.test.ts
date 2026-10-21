import { describe, expect, it } from 'vitest';
import { fillTrend, monthsEndingAt } from '../src/app/reports/trend.ts';

describe('tendência mensal', () => {
  it('N meses terminando no mês pedido, virando o ano', () => {
    expect(monthsEndingAt('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsEndingAt('2026-10', 1)).toEqual(['2026-10']);
    expect(() => monthsEndingAt('2026-13', 3)).toThrow(RangeError);
  });
  it('preenche zeros e ignora meses fora da janela', () => {
    const meses = ['2026-09', '2026-10'];
    const empresas = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    const linhas = [{ companyId: 'a', month: '2026-10', count: 2, cents: 80000 }, { companyId: 'a', month: '2026-07', count: 9, cents: 9 }];
    expect(fillTrend(meses, empresas, linhas)).toEqual([
      { companyId: 'a', name: 'A', months: [{ month: '2026-09', issued: { count: 0, cents: 0 } }, { month: '2026-10', issued: { count: 2, cents: 80000 } }] },
      { companyId: 'b', name: 'B', months: [{ month: '2026-09', issued: { count: 0, cents: 0 } }, { month: '2026-10', issued: { count: 0, cents: 0 } }] },
    ]);
  });
});
