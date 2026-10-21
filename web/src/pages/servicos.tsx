import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Settings2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Campo } from '@/components/campo';
import { PageHeader } from '@/components/page-header';
import { Segmentado } from '@/components/segmentado';
import { FiscalDialog, type DadosFiscais } from '@/components/fiscal-dialog';
import { mensagemDeErro } from '@/lib/api';
import { pode, useMe } from '@/lib/auth';
import { centavosDe, reais } from '@/lib/format';
import { useEmpresas, useMutacoes, useServicos } from '@/lib/queries';
import type { Empresa, Servico } from '@/lib/tipos';

export function Servicos() {
  const me = useMe();
  const empresas = useEmpresas();
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const empresaAtual = empresas.data?.find((e) => e.id === empresaId) ?? empresas.data?.[0];
  const servicos = useServicos(empresaAtual?.id, true);
  const [dialogo, setDialogo] = useState<{ tipo: 'servico' | 'fiscal'; servico: Servico | null } | null>(null);
  const podeEditar = pode(me.data, 'cadastrarServicos');
  const podeGerir = pode(me.data, 'cadastrarProfissionaisEServicos');
  const podeFiscal = pode(me.data, 'configFiscal');

  return (
    <>
      <PageHeader
        titulo="Serviços"
        descricao="Um catálogo só para todas as empresas da clínica. Um serviço só entra em nota da empresa em que está disponível."
        acoes={
          podeEditar && (
            <Button onClick={() => setDialogo({ tipo: 'servico', servico: null })}>
              <Plus /> Novo serviço
            </Button>
          )
        }
      />
      {(empresas.data?.length ?? 0) > 1 && (
        <Segmentado
          rotulo="Empresa"
          nome="empresa"
          valor={empresaAtual?.id ?? ''}
          opcoes={(empresas.data ?? []).map((e) => ({ valor: e.id, rotulo: `${podeFiscal ? 'Configuração fiscal: ' : ''}${e.tradeName ?? e.legalName}` }))}
          onChange={setEmpresaId}
          className="mb-4"
        />
      )}
      {servicos.isPending ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Serviço</TableHead>
                <TableHead className="hidden md:table-cell">TUSS</TableHead>
                <TableHead className="text-right">Valor padrão</TableHead>
                <TableHead>{podeFiscal ? 'Configuração fiscal' : 'Nesta empresa'}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {servicos.data?.map((s) => (
                <TableRow key={s.id} className={s.active ? '' : 'text-muted-foreground'}>
                  <TableCell>{s.favorite && <Star className="size-4 fill-taupe text-taupe" aria-label="Favorito" />}</TableCell>
                  <TableCell>
                    <p className="font-medium">{s.name}</p>
                    {s.defaultDescription !== s.name && <p className="text-xs text-muted-foreground">{s.defaultDescription}</p>}
                  </TableCell>
                  <TableCell className="tabular hidden md:table-cell">{s.tussCode ?? '—'}</TableCell>
                  <TableCell className="tabular text-right">{reais(s.defaultAmountCents)}</TableCell>
                  <TableCell>
                    {!podeFiscal ? (
                      <span className={cn('text-sm', !s.fiscalConfig?.active && 'text-muted-foreground')}>{s.fiscalConfig?.active ? 'Disponível' : 'Indisponível'}</span>
                    ) : s.fiscalSource === 'company' ? (
                      <span className="text-sm text-muted-foreground">Padrão da empresa</span>
                    ) : s.fiscalSource === 'service' && s.fiscalConfig ? (
                      <span className="text-sm">
                        Próprio <span className="tabular text-xs text-muted-foreground">· {s.fiscalConfig.nationalTaxCode}{s.fiscalConfig.issRate ? ` · ISS ${s.fiscalConfig.issRate}%` : ''}</span>
                      </span>
                    ) : (
                      <span className={cn('text-sm', s.active && 'text-destructive')}>{s.serviceFiscalConfig ? 'Excluído nesta empresa' : 'Indisponível: falta o padrão da empresa'}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex gap-0.5">
                      {podeFiscal && empresaAtual && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Configuração fiscal de ${s.name}`} onClick={() => setDialogo({ tipo: 'fiscal', servico: s })}>
                          <Settings2 />
                        </Button>
                      )}
                      {podeEditar && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Editar ${s.name}`} onClick={() => setDialogo({ tipo: 'servico', servico: s })}>
                          <Pencil />
                        </Button>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {dialogo?.tipo === 'servico' && <ServicoDialog servico={dialogo.servico} completo={podeGerir} onFechar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'fiscal' && dialogo.servico && empresaAtual && <FiscalServico servico={dialogo.servico} empresa={empresaAtual} onFechar={() => setDialogo(null)} />}
    </>
  );
}

const ServicoSchema = z.object({
  name: z.string().trim().min(2, 'Nome com pelo menos 2 letras'),
  defaultDescription: z.string().trim().min(3, 'Descrição com pelo menos 3 letras'),
  tussCode: z.string().trim().regex(/^(\d{8})?$/, 'TUSS tem 8 dígitos'),
  valor: z.string().refine((v) => centavosDe(v) !== null, 'Valor em reais, ex.: 400,00'),
  allowDescriptionEdit: z.boolean(),
  allowAmountEdit: z.boolean(),
  favorite: z.boolean(),
  active: z.boolean(),
});
type ServicoValores = z.infer<typeof ServicoSchema>;

function Flag({ marcado, onChange, rotulo }: { marcado: boolean; onChange: (v: boolean) => void; rotulo: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={marcado} onCheckedChange={(c) => onChange(c === true)} />
      {rotulo}
    </label>
  );
}

/** `completo`: ADMIN/FINANCE também mexem nas travas da recepção e na ativação. */
function ServicoDialog({ servico, completo, onFechar }: { servico: Servico | null; completo: boolean; onFechar: () => void }) {
  const m = useMutacoes();
  const form = useForm<ServicoValores>({
    resolver: zodResolver(ServicoSchema),
    defaultValues: {
      name: servico?.name ?? '',
      defaultDescription: servico?.defaultDescription ?? '',
      tussCode: servico?.tussCode ?? '',
      valor: servico ? (servico.defaultAmountCents / 100).toFixed(2).replace('.', ',') : '',
      allowDescriptionEdit: servico?.allowDescriptionEdit ?? true,
      allowAmountEdit: servico?.allowAmountEdit ?? true,
      favorite: servico?.favorite ?? false,
      active: servico?.active ?? true,
    },
  });
  const pendente = m.criarServico.isPending || m.editarServico.isPending;
  const salvar = (v: ServicoValores) => {
    const { valor, allowDescriptionEdit, allowAmountEdit, active, ...resto } = v;
    const dados = { ...resto, ...(completo ? { allowDescriptionEdit, allowAmountEdit, active } : {}), tussCode: v.tussCode || null, defaultAmountCents: centavosDe(valor) ?? 0 };
    const op = servico ? m.editarServico.mutateAsync({ id: servico.id, ...dados }) : m.criarServico.mutateAsync(dados);
    op.then(() => {
      toast.success(servico ? 'Serviço atualizado' : 'Serviço criado');
      onFechar();
    }).catch((e: unknown) => toast.error(mensagemDeErro(e)));
  };
  const e = form.formState.errors;

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{servico ? 'Editar serviço' : 'Novo serviço'}</DialogTitle>
          <DialogDescription>
            Vale para todas as empresas. Mudar aqui não altera notas já criadas.
            {!completo && !servico && ' Um serviço novo só entra em nota depois que o financeiro o libera em cada empresa.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(salvar)} className="grid gap-4" noValidate>
          <Campo id="s-nome" label="Nome" erro={e.name?.message}>
            <Input id="s-nome" autoFocus placeholder="Consulta" {...form.register('name')} />
          </Campo>
          <Campo id="s-desc" label="Descrição padrão na nota" erro={e.defaultDescription?.message} dica="Procedimento, nunca diagnóstico.">
            <Textarea id="s-desc" rows={2} {...form.register('defaultDescription')} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="s-tuss" label="Código TUSS" erro={e.tussCode?.message}>
              <Input id="s-tuss" inputMode="numeric" maxLength={8} {...form.register('tussCode')} />
            </Campo>
            <Campo id="s-valor" label="Valor padrão (R$)" erro={e.valor?.message}>
              <Input id="s-valor" inputMode="decimal" className="tabular" placeholder="400,00" {...form.register('valor')} />
            </Campo>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Flag marcado={form.watch('favorite')} onChange={(v) => form.setValue('favorite', v)} rotulo="Favorito (aparece em serviços rápidos)" />
            {completo && (
              <>
                <Flag marcado={form.watch('allowAmountEdit')} onChange={(v) => form.setValue('allowAmountEdit', v)} rotulo="Recepção pode mudar o valor na nota" />
                <Flag marcado={form.watch('allowDescriptionEdit')} onChange={(v) => form.setValue('allowDescriptionEdit', v)} rotulo="Recepção pode mudar a descrição na nota" />
                {servico && <Flag marcado={form.watch('active')} onChange={(v) => form.setValue('active', v)} rotulo="Ativo no catálogo" />}
              </>
            )}
          </div>
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

/** Exceção de um serviço numa empresa. Sem exceção, o serviço segue o padrão fiscal da empresa. */
function FiscalServico({ servico, empresa, onFechar }: { servico: Servico; empresa: Empresa; onFechar: () => void }) {
  const m = useMutacoes();
  const propria = servico.serviceFiscalConfig;
  const herdada = servico.fiscalSource === 'company' ? servico.fiscalConfig : null;
  const salvar = (d: DadosFiscais) =>
    m.salvarConfigFiscal
      .mutateAsync({ companyId: empresa.id, serviceId: servico.id, ...d })
      .then(() => {
        toast.success(propria ? 'Configuração do serviço salva' : 'Exceção criada para este serviço');
        onFechar();
      })
      .catch((e: unknown) => toast.error(mensagemDeErro(e)));
  const voltar = () =>
    m.voltarAoPadrao
      .mutateAsync({ companyId: empresa.id, serviceId: servico.id })
      .then(() => {
        toast.success('O serviço voltou ao padrão da empresa');
        onFechar();
      })
      .catch((e: unknown) => toast.error(mensagemDeErro(e)));
  return (
    <FiscalDialog
      titulo={`${servico.name} · ${empresa.tradeName ?? empresa.legalName}`}
      descricao={
        propria
          ? 'Este serviço tem códigos próprios nesta empresa. Para usar os mesmos da empresa, volte ao padrão.'
          : herdada
            ? 'Este serviço usa o padrão da empresa. Salvar aqui cria uma exceção só para ele; faça isso apenas se o contador indicar códigos diferentes.'
            : 'A empresa ainda não tem configuração fiscal padrão. Defina-a em Empresas, ou registre aqui códigos só para este serviço.'
      }
      inicial={propria ?? herdada}
      pendente={m.salvarConfigFiscal.isPending}
      rotuloAtiva="Disponível nesta empresa (desmarcado, o serviço não entra em notas dela)"
      onSalvar={salvar}
      onFechar={onFechar}
      extra={
        propria ? (
          <Button type="button" variant="ghost" onClick={voltar} disabled={m.voltarAoPadrao.isPending}>
            Voltar ao padrão da empresa
          </Button>
        ) : null
      }
    />
  );
}
