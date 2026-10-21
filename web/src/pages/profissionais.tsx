import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Campo } from '@/components/campo';
import { PageHeader } from '@/components/page-header';
import { mensagemDeErro } from '@/lib/api';
import { pode, useMe } from '@/lib/auth';
import { useMutacoes, useProfissionais } from '@/lib/queries';
import type { Profissional } from '@/lib/tipos';

const Schema = z.object({
  name: z.string().trim().min(2, 'Nome com pelo menos 2 letras'),
  council: z.string().trim().toUpperCase().regex(/^[A-Z]{2,10}$/, 'Sigla do conselho (CRM, CRO, CRP…)'),
  crmNumber: z.string().trim().min(1, 'Informe o número'),
  crmState: z.string().trim().toUpperCase().length(2, 'UF com 2 letras'),
  specialty: z.string(),
  cpf: z.string(),
  active: z.boolean(),
  rqes: z.array(z.object({ number: z.string().trim().min(1, 'Número'), specialty: z.string().trim().min(2, 'Especialidade') })),
});
type Valores = z.infer<typeof Schema>;
/** Sugestões; qualquer sigla de 2 a 10 letras vale. */
const CONSELHOS = ['CRM', 'CRO', 'CRP', 'CREFITO', 'CRN', 'CRF', 'COREN', 'CRFA', 'CRBM', 'CRMV'];
const vazio = (p?: Profissional | null): Valores => ({
  name: p?.name ?? '',
  council: p?.council ?? 'CRM',
  crmNumber: p?.crmNumber ?? '',
  crmState: p?.crmState ?? '',
  specialty: p?.specialty ?? '',
  cpf: p?.cpf ?? '',
  active: p?.active ?? true,
  rqes: p?.rqes.map((r) => ({ number: r.number, specialty: r.specialty })) ?? [],
});

export function Profissionais() {
  const me = useMe();
  const lista = useProfissionais(true);
  const [dialogo, setDialogo] = useState<{ aberto: boolean; prof: Profissional | null }>({ aberto: false, prof: null });
  const podeEditar = pode(me.data, 'cadastrarProfissionaisEServicos');

  return (
    <>
      <PageHeader
        titulo="Profissionais"
        descricao="Nome, registro no conselho e RQE vão carimbados em cada nota. Mudar aqui não muda nota antiga."
        acoes={
          podeEditar && (
            <Button onClick={() => setDialogo({ aberto: true, prof: null })}>
              <Plus /> Novo profissional
            </Button>
          )
        }
      />
      {lista.isPending ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead>RQE</TableHead>
                <TableHead className="hidden md:table-cell">Especialidade</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.data?.map((p) => (
                <TableRow key={p.id} className={p.active ? '' : 'text-muted-foreground'}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="tabular">
                    {p.council}-{p.crmState} {p.crmNumber}
                  </TableCell>
                  <TableCell className="tabular">{p.rqes.map((r) => r.number).join(', ') || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell">{p.specialty ?? '—'}</TableCell>
                  <TableCell>{p.active ? 'Ativo' : 'Inativo'}</TableCell>
                  <TableCell>
                    {podeEditar && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Editar ${p.name}`} onClick={() => setDialogo({ aberto: true, prof: p })}>
                        <Pencil />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {dialogo.aberto && <ProfissionalDialog prof={dialogo.prof} onFechar={() => setDialogo({ aberto: false, prof: null })} />}
    </>
  );
}

function ProfissionalDialog({ prof, onFechar }: { prof: Profissional | null; onFechar: () => void }) {
  const m = useMutacoes();
  const form = useForm<Valores>({ resolver: zodResolver(Schema), defaultValues: vazio(prof) });
  const rqes = useFieldArray({ control: form.control, name: 'rqes' });
  const pendente = m.criarProfissional.isPending || m.editarProfissional.isPending;
  const salvar = (v: Valores) => {
    const dados = { ...v, specialty: v.specialty.trim() || null, cpf: v.cpf.replace(/\D/g, '') || null };
    const op = prof ? m.editarProfissional.mutateAsync({ id: prof.id, ...dados }) : m.criarProfissional.mutateAsync(dados);
    op.then(() => {
      toast.success(prof ? 'Profissional atualizado' : 'Profissional cadastrado');
      onFechar();
    }).catch((e: unknown) => toast.error(mensagemDeErro(e)));
  };
  const e = form.formState.errors;

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{prof ? 'Editar profissional' : 'Novo profissional'}</DialogTitle>
          <DialogDescription>Cada nota copia estes dados no momento da emissão.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(salvar)} className="grid gap-4" noValidate>
          <Campo id="pr-nome" label="Nome como vai na nota" erro={e.name?.message}>
            <Input id="pr-nome" autoFocus placeholder="Dra. Nome Sobrenome" {...form.register('name')} />
          </Campo>
          <div className="grid grid-cols-[6.5rem_1fr_5rem] gap-3">
            <Campo id="pr-conselho" label="Conselho" erro={e.council?.message}>
              <Input id="pr-conselho" list="conselhos" maxLength={10} className="uppercase" {...form.register('council')} />
              <datalist id="conselhos">
                {CONSELHOS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Campo>
            <Campo id="pr-crm" label="Número" erro={e.crmNumber?.message}>
              <Input id="pr-crm" inputMode="numeric" {...form.register('crmNumber')} />
            </Campo>
            <Campo id="pr-uf" label="UF" erro={e.crmState?.message}>
              <Input id="pr-uf" maxLength={2} className="uppercase" {...form.register('crmState')} />
            </Campo>
          </div>
          <Campo id="pr-esp" label="Especialidade">
            <Input id="pr-esp" {...form.register('specialty')} />
          </Campo>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">RQE (médicos: um por especialidade registrada no CRM)</legend>
            {rqes.fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[7rem_1fr_auto] gap-2">
                <Input aria-label="Número do RQE" placeholder="Número" inputMode="numeric" {...form.register(`rqes.${i}.number`)} />
                <Input aria-label="Especialidade do RQE" placeholder="Especialidade" {...form.register(`rqes.${i}.specialty`)} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remover RQE" onClick={() => rqes.remove(i)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            {e.rqes && <p className="text-xs text-destructive">Preencha número e especialidade de cada RQE.</p>}
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => rqes.append({ number: '', specialty: '' })}>
              <Plus /> Adicionar RQE
            </Button>
          </fieldset>
          <Campo id="pr-cpf" label="CPF (opcional)">
            <Input id="pr-cpf" inputMode="numeric" {...form.register('cpf')} />
          </Campo>
          {prof && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.watch('active')} onCheckedChange={(c) => form.setValue('active', c === true)} />
              Ativo (aparece na nova nota)
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
