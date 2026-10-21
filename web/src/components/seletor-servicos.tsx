import { useState } from 'react';
import { ChevronsUpDown, Plus, Star } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { reais } from '@/lib/format';
import { useModelos, useServicos } from '@/lib/queries';
import type { Servico } from '@/lib/tipos';

type Props = {
  /** Empresa que emite; `null` enquanto a recepção ainda não escolheu (nada é buscado). */
  companyId: string | null;
  onServico: (s: Servico) => void;
  onModelo: (templateId: string) => void;
  ocupado: boolean;
  /** Motivo, em texto, de o seletor estar travado: tudo fica desabilitado e a frase aparece no lugar da lista. */
  desabilitado?: string;
  className?: string;
};

/** Favoritos, modelos favoritos e busca: o mesmo seletor em /notas/nova e na nota em rascunho. Quem usa põe o título. */
export function SeletorServicos({ companyId, onServico, onModelo, ocupado, desabilitado, className }: Props) {
  const servicos = useServicos(companyId);
  const modelos = useModelos();
  const [busca, setBusca] = useState(false);
  const disponiveis = (servicos.data ?? []).filter((s) => s.fiscalConfig?.active);
  const favoritos = disponiveis.filter((s) => s.favorite);
  const modelosFavoritos = (modelos.data ?? []).filter((t) => t.favorite);
  const travado = !!desabilitado || ocupado;

  return (
    <div className={cn('grid gap-3', className)}>
      {desabilitado ? (
        <p className="text-sm text-muted-foreground">{desabilitado}</p>
      ) : servicos.isPending ? (
        <Skeleton className="h-16" />
      ) : favoritos.length === 0 && modelosFavoritos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum favorito ainda. Marque serviços ou modelos como favoritos para eles aparecerem aqui.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {modelosFavoritos.map((t) => (
            <Button key={t.id} size="sm" disabled={travado} onClick={() => onModelo(t.id)}>
              <Plus /> {t.name}
            </Button>
          ))}
          {favoritos.map((s) => (
            <Button key={s.id} variant="outline" size="sm" disabled={travado} onClick={() => onServico(s)}>
              <Plus /> {s.name} <span className="tabular font-normal text-muted-foreground">{reais(s.defaultAmountCents)}</span>
            </Button>
          ))}
        </div>
      )}
      <Popover open={busca} onOpenChange={setBusca}>
        <PopoverTrigger render={<Button variant="outline" disabled={travado} className="h-10 w-full justify-between rounded-lg border-input bg-card px-3 font-normal text-muted-foreground" />}>
          Adicionar outro serviço <ChevronsUpDown className="size-4 opacity-60" aria-hidden />
        </PopoverTrigger>
        <PopoverContent className="w-(--anchor-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Nome do serviço" />
            <CommandList>
              <CommandEmpty>Nenhum serviço disponível nesta empresa com esse nome.</CommandEmpty>
              <CommandGroup>
                {disponiveis.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.name}
                    onSelect={() => {
                      onServico(s);
                      setBusca(false);
                    }}
                  >
                    {s.favorite && <Star className="fill-taupe text-taupe" aria-hidden />}
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className="tabular text-xs text-muted-foreground">{reais(s.defaultAmountCents)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
