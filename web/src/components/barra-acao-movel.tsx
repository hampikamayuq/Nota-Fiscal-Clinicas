import type { ReactNode } from 'react';
import { Dinheiro } from '@/components/dinheiro';

/** Barra fixa no rodapé do celular: o total e a ação principal ao alcance do polegar. Some a partir de `xl`, onde a coluna de controles já aparece. */
export function BarraAcaoMovel({ total, children }: { total: number; children: ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t bg-card px-4 pt-3 xl:hidden"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <Dinheiro centavos={total} className="text-lg" />
      {children}
    </div>
  );
}
