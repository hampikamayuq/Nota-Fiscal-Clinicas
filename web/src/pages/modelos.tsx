import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Pencil, Plus, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Campo } from '@/components/campo';
import { PageHeader } from '@/components/page-header';
import { ApiError, get, mensagemDeErro, patch, post } from '@/lib/api';
import { pode, useMe } from '@/lib/auth';
import { centavosDe, reais } from '@/lib/format';
import { useServicos } from '@/lib/queries';

type ItemModelo = {
  id: string;
  serviceTemplateId: string;
  quantity: number;
  unitAmountCents: number | null;
  sortOrder: number;
  serviceTemplate: { name: string; defaultAmountCents: number; active: boolean };
};
type Modelo = { id: string; name: string; favorite: boolean; active: boolean; items: ItemModelo[] };
type CorpoModelo = { name?: string; favorite?: boolean; active?: boolean; items?: { serviceTemplateId: string; quantity: number; unitAmountCents: number | null }[] };

const totalDe = (itens: ItemModelo[]) => itens.reduce((s, i) => s + i.quantity * (i.unitAmountCents ?? i.serviceTemplate.defaultAmountCents), 0);

function useModelos() {
  return useQuery({ queryKey: ['modelos', 'todos'], queryFn: () => get<Modelo[]>('/api/templates?todos=1') });
}

function useMutacoesModelo() {
  const qc = useQueryClient();
  const aoSalvar = () => qc.invalidateQueries({ queryKey: ['modelos'] });
  return {
    criar: useMutation({ mutationFn: (d: CorpoModelo) => post<Modelo>('/api/templates', d), onSuccess: aoSalvar }),
    editar: useMutation({ mutationFn: ({ id, ...d }: CorpoModelo & { id: string }) => patch<Modelo>(`/api/templates/${id}`, d), onSuccess: aoSalvar }),
    duplicar: useMutation({ mutationFn: (id: string) => post<Modelo>(`/api/templates/${id}/duplicate`), onSuccess: aoSalvar }),
  };
}

const erroDeModelo = (e: unknown) => (e instanceof ApiError && e.status === 409 ? 'Já existe um modelo com esse nome.' : mensagemDeErro(e));

export function Modelos() {
  const me = useMe();
  const modelos = useModelos();
  const m = useMutacoesModelo();
  const [dialogo, setDialogo] = useState<{ modelo: Modelo | null } | null>(null);
  const podeEditar = pode(me.data, 'cadastrarProfissionaisEServicos');

  const duplicar = (x: Modelo) =>
    m.duplicar
      .mutateAsync(x.id)
      .then(() => toast.success('Modelo duplicado'))
      .catch((e: unknown) => toast.error(erroDeModelo(e)));

  return (
    <>
      <PageHeader
        titulo="Modelos"
        descricao="Um modelo é uma combinação pronta de serviços; ao aplicá-lo em uma nota, os serviços são copiados para ela e podem ser ajustados."
        acoes={
          podeEditar && (
            <Button onClick={() => setDialogo({ modelo: null })}>
              <Plus /> Novo modelo
            </Button>
          )
        }
      />
      {modelos.isPending ? (
        <Skeleton className="h-48" />
      ) : modelos.isError ? (
        <p role="alert" className="rounded-xl border border-dashed p-6 text-center text-sm text-destructive">{mensagemDeErro(modelos.error)}</p>
      ) : modelos.data.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum modelo ainda. {podeEditar ? 'Crie o primeiro em "Novo modelo", por exemplo "Consulta + biópsia".' : 'Peça à administração para criar o primeiro.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Modelo</TableHead>
                <TableHead className="hidden md:table-cell">Serviços</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden sm:table-cell">Situação</TableHead>
                {podeEditar && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelos.data.map((x) => {
                const resumo = x.items.map((i) => `${i.quantity} × ${i.serviceTemplate.name}`).join(', ');
                return (
                  <TableRow key={x.id} className={x.active ? '' : 'text-muted-foreground'}>
                    <TableCell>{x.favorite && <Star className="size-4 fill-taupe text-taupe" aria-label="Favorito" />}</TableCell>
                    <TableCell>
                      <p className="font-medium">{x.name}</p>
                      <p className="text-xs text-muted-foreground md:hidden">{resumo}</p>
                    </TableCell>
                    <TableCell className="hidden whitespace-normal md:table-cell">{resumo}</TableCell>
                    <TableCell className="tabular text-right">{reais(totalDe(x.items))}</TableCell>
                    <TableCell className="hidden sm:table-cell">{x.active ? 'Ativo' : 'Inativo'}</TableCell>
                    {podeEditar && (
                      <TableCell>
                        <span className="flex gap-0.5">
                          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${x.name}`} onClick={() => setDialogo({ modelo: x })}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={`Duplicar ${x.name}`} disabled={m.duplicar.isPending} onClick={() => duplicar(x)}>
                            <Copy />
                          </Button>
                        </span>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {dialogo && <ModeloDialog modelo={dialogo.modelo} onFechar={() => setDialogo(null)} />}
    </>
  );
}

type Linha = { chave: number; serviceTemplateId: string; quantidade: string; valor: string };
let proximaChave = 0;
const linhaVazia = (): Linha => ({ chave: proximaChave++, serviceTemplateId: '', quantidade: '1', valor: '' });
const centavosParaCampo = (c: number) => (c / 100).toFixed(2).replace('.', ',');

function ModeloDialog({ modelo, onFechar }: { modelo: Modelo | null; onFechar: () => void }) {
  const m = useMutacoesModelo();
  const servicos = useServicos(undefined);
  const [nome, setNome] = useState(modelo?.name ?? '');
  const [favorito, setFavorito] = useState(modelo?.favorite ?? false);
  const [ativo, setAtivo] = useState(modelo?.active ?? true);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    modelo?.items.length
      ? modelo.items.map((i) => ({ chave: proximaChave++, serviceTemplateId: i.serviceTemplateId, quantidade: String(i.quantity), valor: i.unitAmountCents === null ? '' : centavosParaCampo(i.unitAmountCents) }))
      : [linhaVazia()],
  );
  const ativos = servicos.data?.filter((s) => s.active) ?? [];
  // Serviço já no modelo mas hoje inativo continua selecionável, senão a linha ficaria em branco.
  const opcoes = [...ativos, ...(modelo?.items.filter((i) => !ativos.some((s) => s.id === i.serviceTemplateId)).map((i) => ({ id: i.serviceTemplateId, name: `${i.serviceTemplate.name} (inativo)`, defaultAmountCents: i.serviceTemplate.defaultAmountCents })) ?? [])];
  const mudar = (chave: number, campo: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...campo } : l)));

  const validas = linhas.filter((l) => l.serviceTemplateId);
  const quantidadeDe = (l: Linha) => Math.max(1, Math.floor(Number(l.quantidade)) || 1);
  const total = validas.reduce((s, l) => s + quantidadeDe(l) * ((l.valor.trim() ? centavosDe(l.valor) : null) ?? opcoes.find((o) => o.id === l.serviceTemplateId)?.defaultAmountCents ?? 0), 0);
  const valorInvalido = validas.some((l) => l.valor.trim() && centavosDe(l.valor) === null);
  const pendente = m.criar.isPending || m.editar.isPending;
  const nomeCurto = nome.trim().length < 2;
  const podeSalvar = !nomeCurto && validas.length > 0 && !valorInvalido && !pendente;

  const salvar = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!podeSalvar) return;
    const dados = {
      name: nome.trim(),
      favorite: favorito,
      items: validas.map((l) => ({ serviceTemplateId: l.serviceTemplateId, quantity: quantidadeDe(l), unitAmountCents: l.valor.trim() ? centavosDe(l.valor) : null })),
    };
    const op = modelo ? m.editar.mutateAsync({ id: modelo.id, ...dados, active: ativo }) : m.criar.mutateAsync(dados);
    op.then(() => {
      toast.success(modelo ? 'Modelo atualizado' : 'Modelo criado');
      onFechar();
    }).catch((e: unknown) => toast.error(erroDeModelo(e)));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{modelo ? 'Editar modelo' : 'Novo modelo'}</DialogTitle>
          <DialogDescription>Mudar o modelo não altera notas que já usaram a combinação.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="grid gap-4" noValidate>
          <Campo id="m-nome" label="Nome" erro={nome && nomeCurto ? 'Nome com pelo menos 2 letras' : undefined}>
            <Input id="m-nome" autoFocus placeholder="Consulta + biópsia" value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
          <div className="grid gap-2">
            <p className="rotulo">Serviços</p>
            {servicos.isPending && <Skeleton className="h-10" />}
            <ul className="grid gap-3">
              {linhas.map((l, n) => (
                <li key={l.chave} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_5rem_8rem_auto]">
                  <div className="col-span-2 grid gap-1.5 sm:col-span-1">
                    <Label htmlFor={`m-s-${l.chave}`}>Serviço {n + 1}</Label>
                    <select
                      id={`m-s-${l.chave}`}
                      value={l.serviceTemplateId}
                      onChange={(e) => mudar(l.chave, { serviceTemplateId: e.target.value })}
                      className="h-10 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                    >
                      <option value="">Escolha um serviço</option>
                      {opcoes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {reais(s.defaultAmountCents)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`m-q-${l.chave}`}>Qtd.</Label>
                    <Input id={`m-q-${l.chave}`} inputMode="numeric" className="tabular" value={l.quantidade} onChange={(e) => mudar(l.chave, { quantidade: e.target.value.replace(/\D/g, '') })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`m-v-${l.chave}`}>Valor (R$)</Label>
                    <Input id={`m-v-${l.chave}`} inputMode="decimal" className="tabular" placeholder="padrão" value={l.valor} onChange={(e) => mudar(l.chave, { valor: e.target.value })} aria-invalid={!!l.valor.trim() && centavosDe(l.valor) === null} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remover serviço ${n + 1}`} disabled={linhas.length === 1} onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}>
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}>
                <Plus /> Adicionar serviço
              </Button>
              <p className="text-sm">
                Total <span className="tabular font-semibold">{reais(total)}</span>
              </p>
            </div>
            {valorInvalido && <p role="alert" className="text-xs text-destructive">Valor em reais, ex.: 400,00. Deixe vazio para usar o valor padrão.</p>}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={favorito} onCheckedChange={(c) => setFavorito(c === true)} /> Favorito
            </label>
            {modelo && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={ativo} onCheckedChange={(c) => setAtivo(c === true)} /> Ativo
              </label>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!podeSalvar}>
              {pendente ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
