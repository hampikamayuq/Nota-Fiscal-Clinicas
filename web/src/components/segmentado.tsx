import type { ReactNode } from 'react';
import { cn } from 'cn';

type Props = { rotulo: string; nome: string; valor: string; opcoes: readonly { valor: string; rotulo: ReactNode }[]; onChange: (valor: string) => void; className?: string };

/** Filtro segmentado: um grupo de rádios nativo (as setas trocam a opção) com cara de abas. */
export function Segmentado({ rotulo, nome, valor, opcoes, onChange, className }: Props) {
  return (
    <fieldset className={cn('inline-flex h-10 w-fit items-center rounded-full bg-muted p-1 text-muted-foreground', className)}>
      <legend className="sr-only">{rotulo}</legend>
      {opcoes.map((o) => (
        <label
          key={o.valor}
          className="inline-flex h-full cursor-pointer items-center rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors hover:text-foreground has-checked:bg-card has-checked:text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
        >
          <input type="radio" name={nome} value={o.valor} checked={valor === o.valor} onChange={() => onChange(o.valor)} className="sr-only" />
          {o.rotulo}
        </label>
      ))}
    </fieldset>
  );
}
