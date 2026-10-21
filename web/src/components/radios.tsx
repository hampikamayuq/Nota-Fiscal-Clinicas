import { cn } from 'cn';

/** Opções como pílulas, com o código do leiaute à frente do rótulo: a pessoa escolhe pelo nome, o contador confere pelo código. */
export function Radios({ nome, opcoes, valor, onChange }: { nome: string; opcoes: readonly (readonly [string, string])[]; valor: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={nome} className="flex flex-wrap gap-1.5">
      {opcoes.map(([v, rotulo]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={valor === v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            valor === v && 'border-primary bg-primary text-primary-foreground hover:bg-primary',
          )}
        >
          <span className="tabular mr-1 opacity-70">{v}</span>
          {rotulo}
        </button>
      ))}
    </div>
  );
}
