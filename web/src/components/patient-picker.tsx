import { useState } from 'react';
import { ChevronsUpDown, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { documento } from '@/lib/format';
import { usePacientes } from '@/lib/queries';
import { useDebounce } from '@/lib/use-debounce';
import type { Paciente } from '@/lib/tipos';

type Props = { valor: Paciente | null; onChange: (p: Paciente) => void; onNovo: () => void };

/** Busca no servidor por nome, CPF, e-mail ou telefone; a recepção não redigita paciente recorrente. */
export function PatientPicker({ valor, onChange, onNovo }: Props) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState('');
  const busca = useDebounce(q.trim(), 200);
  const { data, isFetching } = usePacientes(busca);
  const lista = data ?? [];

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger
        render={
          <Button variant="outline" role="combobox" aria-expanded={aberto} className="h-10 w-full justify-between rounded-lg border-input bg-card px-3 font-normal" />
        }
      >
        {valor ? (
          <span className="truncate">
            {valor.name} <span className="tabular text-xs text-muted-foreground">· {documento(valor)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Buscar por nome, CPF, e-mail ou telefone</span>
        )}
        <ChevronsUpDown className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Nome, CPF, e-mail ou telefone" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{isFetching ? 'Buscando…' : busca ? 'Ninguém com esses dados.' : 'Digite para buscar.'}</CommandEmpty>
            <CommandGroup>
              {lista.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    onChange(p);
                    setAberto(false);
                  }}
                >
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="tabular text-xs text-muted-foreground">{documento(p)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup>
              <CommandItem
                value="__novo"
                onSelect={() => {
                  setAberto(false);
                  onNovo();
                }}
              >
                <UserPlus /> Cadastrar paciente novo
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
