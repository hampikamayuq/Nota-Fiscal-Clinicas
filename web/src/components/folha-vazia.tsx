import type { ReactNode } from 'react';
import { cn } from 'cn';

/** Folha-fantasma: o contorno de uma nota que ainda não existe, com a frase do que fazer e, se houver, a ação. */
export function FolhaVazia({ frase, children, className }: { frase: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-dashed border-taupe/55 bg-paper/40 p-6', className)}>
      <div className="grid gap-2" aria-hidden>
        <span className="block h-2 w-2/3 rounded bg-taupe/20" />
        <span className="block h-2 w-1/2 rounded bg-taupe/20" />
        <span className="block h-2 w-1/3 rounded bg-taupe/20" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{frase}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
