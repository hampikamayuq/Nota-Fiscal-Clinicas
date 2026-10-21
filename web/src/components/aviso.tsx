import type { ReactNode } from 'react';
import { cn } from 'cn';

/** Aviso em linha, na voz da nota: o erro é anunciado (alert); o neutro só informa (status). */
export function Aviso({ tom = 'neutro', children, className }: { tom?: 'neutro' | 'erro'; children: ReactNode; className?: string }) {
  return (
    <p
      role={tom === 'erro' ? 'alert' : 'status'}
      className={cn('rounded-lg border bg-card px-3 py-2 text-sm', tom === 'erro' ? 'border-destructive/40 text-destructive' : 'text-muted-foreground', className)}
    >
      {children}
    </p>
  );
}
