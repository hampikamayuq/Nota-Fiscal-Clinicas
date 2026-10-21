import { Link, useNavigate } from 'react-router';
import { ArrowRight, Plus } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Aviso } from '@/components/aviso';
import { Dinheiro } from '@/components/dinheiro';
import { FolhaVazia } from '@/components/folha-vazia';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { mensagemDeErro } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { acaoDaFila } from '@/lib/emissao';
import { dataEmissao, dataHoje, hojePorExtenso, horaAgora, nomeMes, notas, reais } from '@/lib/format';
import { useEmpresas, useNotas, useResumo } from '@/lib/queries';
import type { Nota } from '@/lib/tipos';

/** Antes disso, "Emitidas hoje" vazia não aparece: o dia ainda não começou. */
const HORA_DE_MOSTRAR_HOJE = 9;

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

/** A home, igual para todos os papéis: o mês em números, os avisos, a fila de trabalho, o que saiu hoje e as últimas. */
export function Dashboard() {
  const me = useMe();
  const resumo = useResumo();
  const empresas = useEmpresas();
  const fila = useNotas({ status: 'DRAFT,READY', limit: 10 });
  const emitidas = useNotas({ status: 'AUTHORIZED', limit: 20 });
  const ultimas = useNotas({ limit: 10 });
  const r = resumo.data;
  const nomeEmpresa = (id: string) => empresas.data?.find((e) => e.id === id)?.tradeName ?? empresas.data?.find((e) => e.id === id)?.legalName ?? '…';
  const primeiroNome = me.data?.name.split(' ')[0] ?? '';
  const hoje = dataHoje();
  const deHoje = (emitidas.data ?? []).filter((n) => n.submittedAt && dataEmissao(n.submittedAt) === hoje);
  const mostrarHoje = (r?.today.count ?? 0) > 0 || horaAgora() >= HORA_DE_MOSTRAR_HOJE;
  const celulas = r
    ? [
        ...r.companies.map((c) => ({ id: c.companyId, nome: c.name, issued: c.issued, previous: c.previous, total: false })),
        { id: 'total', nome: 'Total', issued: r.total.issued, previous: r.total.previous, total: true },
      ]
    : [];

  return (
    <>
      <PageHeader titulo={`Olá, ${primeiroNome}`} descricao={hojePorExtenso()} />

      <section aria-labelledby="mes">
        <h2 id="mes" className="rotulo mb-3">
          Este mês{r ? ` · ${nomeMes(r.month)}` : ''}
        </h2>
        {resumo.isError ? (
          <p className="text-sm text-muted-foreground">Não foi possível carregar o resumo do mês.</p>
        ) : !r ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : (
          <>
            {/* No celular, uma linha por empresa; de sm em diante, três células. A célula Total ecoa o rodapé da nota: branca, linha superior grafite. */}
            <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
              {celulas.map((c) => (
                <div key={c.id} className={cn('flex items-baseline justify-between gap-3 bg-card px-4 py-3 sm:block sm:py-4', c.total && 'border-t-2 border-foreground')}>
                  <p className={cn('text-xs', c.total ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{c.nome}</p>
                  <Dinheiro centavos={c.issued.cents} className="text-2xl sm:mt-1" />
                  <p className="tabular hidden text-xs sm:block">{notas(c.issued.count)}</p>
                  <p className="tabular hidden text-xs text-muted-foreground sm:block">
                    {nomeMes(r.previousMonth).toLowerCase()}: {reais(c.previous.cents)}
                  </p>
                </div>
              ))}
            </div>
            {r.total.cancelled.count > 0 && (
              <p className="tabular mt-2 text-xs text-muted-foreground">
                {plural(r.total.cancelled.count, 'cancelada', 'canceladas')} · {reais(r.total.cancelled.cents)}
              </p>
            )}
          </>
        )}
      </section>

      {r && (r.errors > 0 || r.processing > 0) && (
        <section aria-label="Avisos" className="mt-4">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
            {r.errors > 0 && (
              <li>
                <Link to="/notas?filtro=erro" className="text-destructive underline-offset-4 hover:underline">
                  {plural(r.errors, 'nota com erro', 'notas com erro')}
                </Link>
              </li>
            )}
            {r.processing > 0 && (
              <li>
                <Link to="/notas?filtro=andamento" className="text-brand underline-offset-4 hover:underline">
                  {plural(r.processing, 'nota processando', 'notas processando')}
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      <section aria-labelledby="fila" className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="fila" className="text-lg font-semibold">
            Para emitir agora
          </h2>
          <Link to="/notas?filtro=rascunho" className="text-sm font-medium text-brand underline-offset-4 hover:underline">
            Ver todas <ArrowRight className="inline size-3.5" />
          </Link>
        </div>
        {fila.isPending ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : fila.isError ? (
          <Aviso tom="erro">Não foi possível carregar a fila: {mensagemDeErro(fila.error)}</Aviso>
        ) : (fila.data ?? []).length === 0 ? (
          <FolhaVazia frase="A primeira nota do dia começa aqui.">
            <Button render={<Link to="/notas/nova" />} nativeButton={false}>
              <Plus /> Nova nota
            </Button>
          </FolhaVazia>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {(fila.data ?? []).map((n) => (
              <li key={n.id} className="flex min-h-16 items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-heading truncate text-lg">{n.patient?.name ?? 'Sem paciente'}</p>
                  <p className="text-xs text-muted-foreground">
                    {plural(n.items.length, 'serviço', 'serviços')} · <span className="tabular">{reais(n.totalAmountCents)}</span>
                  </p>
                </div>
                <StatusBadge status={n.status} className="hidden sm:inline-flex" />
                <Button size="sm" render={<Link to={`/notas/${n.id}`} />} nativeButton={false}>
                  {acaoDaFila(n.status === 'READY' ? 'READY' : 'DRAFT', n.items.length)}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mostrarHoje && (
        <section aria-labelledby="hoje" className="mt-8">
          <h2 id="hoje" className="mb-3 flex items-baseline gap-2 text-lg font-semibold">
            Emitidas hoje
            {r && r.today.count > 0 && (
              <span className="tabular text-sm font-normal text-muted-foreground">
                {notas(r.today.count)} · {reais(r.today.cents)}
              </span>
            )}
          </h2>
          {deHoje.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma nota emitida hoje ainda.</p>
          ) : (
            <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {deHoje.map((n) => (
                <li key={n.id} className="shrink-0">
                  <Link to={`/notas/${n.id}`} className="folha flex h-18 w-30 flex-col justify-between rounded-lg p-2.5 transition-colors hover:border-taupe">
                    <span className="truncate text-xs font-medium">{n.patient?.name ?? '—'}</span>
                    <span className="tabular text-sm">{reais(n.totalAmountCents)}</span>
                    <span className="tabular text-[0.65rem] text-muted-foreground">{n.externalNumber ? `nº ${n.externalNumber}` : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="ultimas" className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="ultimas" className="text-lg font-semibold">
            Últimas notas
          </h2>
          <Link to="/notas" className="text-sm font-medium text-brand underline-offset-4 hover:underline">
            Ver todas <ArrowRight className="inline size-3.5" />
          </Link>
        </div>
        <TabelaNotas notas={(ultimas.data ?? []).slice(0, 10)} carregando={ultimas.isPending} erro={ultimas.isError ? mensagemDeErro(ultimas.error) : undefined} nomeEmpresa={nomeEmpresa} compacta />
      </section>
    </>
  );
}

export function TabelaNotas({ notas, carregando, erro, nomeEmpresa, compacta = false, vazio }: { notas: Nota[]; carregando: boolean; erro?: string | undefined; nomeEmpresa: (id: string) => string; compacta?: boolean; vazio?: string }) {
  const extra = compacta ? 'hidden' : 'hidden lg:table-cell';
  const navegar = useNavigate();
  if (carregando) return <Skeleton className="h-48 w-full" />;
  if (erro) return <Aviso tom="erro">Não foi possível carregar as notas: {erro}</Aviso>;
  if (notas.length === 0) return <FolhaVazia frase={vazio ?? "Nenhuma nota ainda. A primeira começa em 'Nova nota'."} />;
  return (
    <>
      <ul className="divide-y rounded-xl border bg-card sm:hidden">
        {notas.map((n) => (
          <li key={n.id}>
            <Link to={`/notas/${n.id}`} className="block px-4 py-3 active:bg-accent">
              <span className="flex items-center justify-between gap-3">
                <span className="truncate font-semibold">{n.patient?.name ?? '—'}</span>
                <span className="tabular shrink-0 font-semibold">{reais(n.totalAmountCents)}</span>
              </span>
              <span className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate">
                  <span className="tabular">{dataEmissao(n.createdAt)}</span> · {nomeEmpresa(n.companyId)}
                </span>
                <StatusBadge status={n.status} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead className={extra}>Profissional</TableHead>
              <TableHead className="hidden sm:table-cell">Empresa</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className={extra}>NFS-e</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notas.map((n) => (
              <TableRow key={n.id} className="cursor-pointer" onClick={() => navegar(`/notas/${n.id}`)}>
                <TableCell className="tabular text-muted-foreground">{dataEmissao(n.createdAt)}</TableCell>
                <TableCell className="font-medium">
                  <Link to={`/notas/${n.id}`} className="underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
                    {n.patient?.name ?? '—'}
                  </Link>
                </TableCell>
                <TableCell className={extra}>{n.professionalNameSnapshot}</TableCell>
                <TableCell className="hidden sm:table-cell">{nomeEmpresa(n.companyId)}</TableCell>
                <TableCell className="tabular text-right">{reais(n.totalAmountCents)}</TableCell>
                <TableCell>
                  <StatusBadge status={n.status} />
                </TableCell>
                <TableCell className={`tabular ${extra}`}>{n.externalNumber ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
