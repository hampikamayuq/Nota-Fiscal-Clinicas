/**
 * Períodos no fuso da clínica (America/Sao_Paulo) — funções puras, sem banco.
 *
 * Mês, dia e formatação de data. Os limites são instantes UTC: o mês de
 * outubro começa às 03:00Z do dia 1.
 */

import type { InvoiceStatus } from '../../generated/prisma/client.ts';

// ponytail: deslocamento fixo. São Paulo não tem horário de verão desde 2019;
// se a clínica mudar de fuso ou o horário voltar, troque por Intl/Temporal.
export const SP_OFFSET_MIN = -180;

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const MS_PER_MIN = 60_000;

/** Desloca o instante para que os campos UTC leiam o relógio de São Paulo. */
function spFields(instant: Date): { year: number; month: number; day: number } {
  const shifted = new Date(instant.getTime() + SP_OFFSET_MIN * MS_PER_MIN);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** Instante UTC da meia-noite de São Paulo para a data civil informada. */
function spMidnight(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day) - SP_OFFSET_MIN * MS_PER_MIN);
}

function parseMonth(month: string): { year: number; monthIndex: number } {
  if (!MONTH_RE.test(month)) throw new RangeError('Mês no formato AAAA-MM');
  return { year: Number(month.slice(0, 4)), monthIndex: Number(month.slice(5, 7)) - 1 };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `'AAAA-MM'` do instante em São Paulo. */
export function currentMonth(now: Date = new Date()): string {
  const { year, month } = spFields(now);
  return `${year}-${pad2(month + 1)}`;
}

export function previousMonth(month: string): string {
  const { year, monthIndex } = parseMonth(month);
  const prev = new Date(Date.UTC(year, monthIndex - 1, 1));
  return `${prev.getUTCFullYear()}-${pad2(prev.getUTCMonth() + 1)}`;
}

/** `[start, end)` do mês em São Paulo, como instantes UTC. */
export function monthBounds(month: string): { start: Date; end: Date } {
  const { year, monthIndex } = parseMonth(month);
  return { start: spMidnight(year, monthIndex, 1), end: spMidnight(year, monthIndex + 1, 1) };
}

/** `[start, end)` do dia corrente em São Paulo. */
export function dayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const { year, month, day } = spFields(now);
  return { start: spMidnight(year, month, day), end: spMidnight(year, month, day + 1) };
}

/** `'dd/mm/aaaa'` do instante em São Paulo. */
export function dateSP(d: Date): string {
  const { year, month, day } = spFields(d);
  return `${pad2(day)}/${pad2(month + 1)}/${year}`;
}

/** Notas que já foram enviadas ao fisco e seguem válidas. */
export const VALID_AT_FISCO = ['AUTHORIZED', 'CANCELLATION_REQUESTED', 'CANCELLATION_ERROR'] as const satisfies readonly InvoiceStatus[];

/** Notas que o fisco conhece: as válidas e as canceladas. */
export const AT_FISCO = [...VALID_AT_FISCO, 'CANCELLED'] as const;
