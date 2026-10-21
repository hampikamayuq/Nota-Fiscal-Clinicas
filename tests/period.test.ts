import { describe, expect, it } from 'vitest';
import { currentMonth, dateSP, dayBounds, monthBounds, previousMonth } from '../src/app/invoices/period.ts';

describe('período em São Paulo', () => {
  it('limites do mês são instantes UTC deslocados de 3h', () => {
    expect(monthBounds('2026-10')).toEqual({ start: new Date('2026-10-01T03:00:00.000Z'), end: new Date('2026-11-01T03:00:00.000Z') });
    expect(monthBounds('2026-12').end).toEqual(new Date('2027-01-01T03:00:00.000Z'));
  });
  it('01/10 01:00 UTC ainda é setembro no Rio', () => {
    expect(currentMonth(new Date('2026-10-01T01:00:00Z'))).toBe('2026-09');
    expect(currentMonth(new Date('2026-10-01T03:00:00Z'))).toBe('2026-10');
    expect(dateSP(new Date('2026-10-01T01:00:00Z'))).toBe('30/09/2026');
  });
  it('mês anterior vira o ano', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-10')).toBe('2026-09');
  });
  it('rejeita mês fora do formato AAAA-MM', () => {
    expect(() => monthBounds('2026-13')).toThrow(RangeError);
    expect(() => previousMonth('2026/10')).toThrow('Mês no formato AAAA-MM');
  });
  it('dia corrente', () => {
    expect(dayBounds(new Date('2026-10-20T19:00:00Z'))).toEqual({ start: new Date('2026-10-20T03:00:00.000Z'), end: new Date('2026-10-21T03:00:00.000Z') });
  });
});
