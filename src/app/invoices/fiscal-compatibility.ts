import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { FiscalConfigSnapshot } from './invoice-rules.ts';

/** Um item da nota: nome (para as mensagens) e o snapshot fiscal gravado (JSON, null em linhas legadas). */
export type CompatibilityItem = { name: string; fiscalConfigSnapshotJson: unknown };

export type CompatibilityResult =
  | { compatible: true; fiscal: FiscalConfigSnapshot }
  | { compatible: false; problems: string[] };

const nullableString = z.string().nullable().default(null);
const anything = z.unknown().transform((v) => (v === undefined ? null : v));

const snapshotSchema = z.object({
  nationalTaxCode: z.string().min(1),
  municipalTaxCode: nullableString,
  nbsCode: nullableString,
  issRate: nullableString,
  taxationType: z.string().min(1),
  issWithholdingType: z.string().min(1),
  pisCofins: anything,
  ibsCbs: anything,
  additional: anything,
});

/** null quando não é um snapshot válido. */
export function parseFiscalSnapshot(json: unknown): FiscalConfigSnapshot | null {
  const r = snapshotSchema.safeParse(json);
  return r.success ? (r.data as FiscalConfigSnapshot) : null;
}

type Field = { key: keyof FiscalConfigSnapshot; label: string; kind: 'text' | 'rate' | 'json' };

const FIELDS: readonly Field[] = [
  { key: 'nationalTaxCode', label: 'código de tributação nacional', kind: 'text' },
  { key: 'municipalTaxCode', label: 'código de tributação municipal', kind: 'text' },
  { key: 'nbsCode', label: 'NBS', kind: 'text' },
  { key: 'issRate', label: 'alíquota do ISS', kind: 'rate' },
  { key: 'taxationType', label: 'tributação do ISSQN', kind: 'text' },
  { key: 'issWithholdingType', label: 'retenção do ISSQN', kind: 'text' },
  { key: 'pisCofins', label: 'PIS/COFINS', kind: 'json' },
  { key: 'ibsCbs', label: 'IBS/CBS', kind: 'json' },
  { key: 'additional', label: 'configuração adicional', kind: 'json' },
];

function sameRate(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  const na = Number(a);
  const nb = Number(b);
  return Number.isNaN(na) || Number.isNaN(nb) ? a === b : na === nb;
}

// isDeepStrictEqual ignora a ordem das chaves de objetos.
function same(f: Field, a: unknown, b: unknown): boolean {
  return f.kind === 'rate' ? sameRate(a, b) : isDeepStrictEqual(a, b);
}

const show = (v: unknown): string => (v === null ? 'não informado' : `"${String(v)}"`);

export function checkFiscalCompatibility(items: readonly CompatibilityItem[]): CompatibilityResult {
  if (items.length === 0) return { compatible: false, problems: ['A nota não tem serviços.'] };

  const parsed = items.map((i) => ({ name: i.name, fiscal: parseFiscalSnapshot(i.fiscalConfigSnapshotJson) }));
  const missing = parsed.filter((p) => p.fiscal === null);
  if (missing.length > 0) {
    return {
      compatible: false,
      problems: missing.map((p) => `"${p.name}" não tem configuração fiscal registrada.`),
    };
  }

  const [first, ...rest] = parsed as { name: string; fiscal: FiscalConfigSnapshot }[];
  if (!first) return { compatible: false, problems: ['A nota não tem serviços.'] };

  const problems: string[] = [];
  for (const other of rest) {
    for (const f of FIELDS) {
      const a = first.fiscal[f.key];
      const b = other.fiscal[f.key];
      if (same(f, a, b)) continue;
      const detail = f.kind === 'json' ? 'diferem' : `${show(a)} contra ${show(b)}`;
      problems.push(
        `"${first.name}" e "${other.name}" têm ${f.label} diferente${f.kind === 'json' ? '' : `: ${detail}`}.`,
      );
    }
  }
  return problems.length > 0 ? { compatible: false, problems } : { compatible: true, fiscal: first.fiscal };
}
