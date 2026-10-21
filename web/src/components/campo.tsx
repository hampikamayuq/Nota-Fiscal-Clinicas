import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Label } from '@/components/ui/label';

type Props = { id: string; label: string; erro?: string | undefined; dica?: string; className?: string; children: ReactNode };

/** Rótulo + controle + erro, sempre na mesma ordem e com a mesma voz. */
export function Campo({ id, label, erro, dica, className, children }: Props) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {erro ? <p className="text-xs text-destructive">{erro}</p> : dica ? <p className="text-xs text-muted-foreground">{dica}</p> : null}
    </div>
  );
}
