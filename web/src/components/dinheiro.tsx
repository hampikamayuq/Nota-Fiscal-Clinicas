import { cn } from 'cn';
import { semCifrao } from '@/lib/format';

/**
 * Valor grande com cara de documento: "R$" pequeno na cor da marca, alinhado ao topo,
 * e o número em Bricolage tabular. O tamanho vem do `className` de quem usa. Nunca em tabela.
 */
export function Dinheiro({ centavos, className }: { centavos: number; className?: string }) {
  return (
    <span className={cn('font-heading tabular inline-flex items-start gap-1 leading-none', className)} style={{ fontVariationSettings: "'opsz' 120, 'wdth' 90" }}>
      <span className="text-[0.6em] text-brand">R$</span>
      <span>{semCifrao(centavos)}</span>
    </span>
  );
}
