import type { ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Download } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/campo';
import { Dinheiro } from '@/components/dinheiro';
import { FolhaVazia } from '@/components/folha-vazia';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { pode, useMe } from '@/lib/auth';
import { FORMAS, FORMA_PAGAMENTO, compacto, dataEmissao, fraseVariacao, mesAtual, nomeMes, notas, reais } from '@/lib/format';
import { urlCsv, useEmpresas, useRelatorio, useTendencia } from '@/lib/queries';
import type { FiltroRelatorio } from '@/lib/queries';
import type { FormaPagamento, LinhaRelatorio, Relatorio, Situacao, Tendencia as TendenciaDados } from '@/lib/tipos';

const CONTROLE =
  'h-11 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-10 md:text-sm';

const SITUACOES: readonly Situacao[] = ['all', 'issued', 'cancelled'];
const PAGAMENTOS: readonly string[] = ['none', ...FORMAS];

export function Relatorios() {
  const me = useMe();
  const empresas = useEmpresas();
  const [params, setParams] = useSearchParams();
  // Valores da URL passam por uma lista conhecida; lixo na URL volta ao padrão em vez de quebrar a consulta.
  const mesUrl = params.get('mes') ?? '';
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(mesUrl) ? mesUrl : mesAtual();
  const empresa = params.get('empresa') ?? '';
  const pagamentoUrl = params.get('pagamento') ?? '';
  const pagamento = PAGAMENTOS.includes(pagamentoUrl) ? pagamentoUrl : '';
  const situacaoUrl = params.get('situacao') as Situacao | null;
  const situacao: Situacao = situacaoUrl && SITUACOES.includes(situacaoUrl) ? situacaoUrl : 'all';
  const filtrado = !!(empresa || pagamento || situacao !== 'all');

  const mudar = (chave: string, valor: string) =>
    setParams((p) => {
      const novo = new URLSearchParams(p);
      if (valor) novo.set(chave, valor);
      else novo.delete(chave);
      return novo;
    });

  const filtros: FiltroRelatorio = { month: mes, company: empresa || undefined, payment: (pagamento || undefined) as FormaPagamento | 'none' | undefined, situation: situacao };
  const r = useRelatorio(filtros);
  const tendencia = useTendencia(mes);
  const mesNome = nomeMes(mes).toLowerCase();

  return (
    <>
      <PageHeader
        titulo="Relatórios"
        descricao="Notas emitidas no mês, por empresa e forma de pagamento."
        acoes={
          pode(me.data, 'exportar') && (
            <Button render={<a href={urlCsv(filtros)} download />} nativeButton={false} variant="outline">
              <Download /> Exportar CSV
            </Button>
          )
        }
      />

      <section aria-label="Filtros" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Campo id="f-mes" label="Mês">
          <input id="f-mes" type="month" className={CONTROLE} value={mes} max={mesAtual()} onChange={(e) => e.target.value && mudar('mes', e.target.value)} />
        </Campo>
        <Campo id="f-situacao" label="Situação">
          <select id="f-situacao" className={CONTROLE} value={situacao} onChange={(e) => mudar('situacao', e.target.value === 'all' ? '' : e.target.value)}>
            <option value="all">Todas</option>
            <option value="issued">Emitidas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </Campo>
        <Campo id="f-empresa" label="Empresa">
          <select id="f-empresa" className={CONTROLE} value={empresa} onChange={(e) => mudar('empresa', e.target.value)}>
            <option value="">Todas</option>
            {(empresas.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.tradeName ?? e.legalName}</option>)}
          </select>
        </Campo>
        <Campo id="f-pagamento" label="Pagamento">
          <select id="f-pagamento" className={CONTROLE} value={pagamento} onChange={(e) => mudar('pagamento', e.target.value)}>
            <option value="">Qualquer</option>
            <option value="none">Não informado</option>
            {FORMAS.map((f) => <option key={f} value={f}>{FORMA_PAGAMENTO[f]}</option>)}
          </select>
        </Campo>
      </section>

      {r.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <p>Não foi possível carregar o relatório.</p>
          <Button variant="outline" size="sm" onClick={() => void r.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : r.isPending ? (
        <div className="grid gap-6">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className={cn('grid gap-8 transition-opacity', r.isPlaceholderData && 'opacity-60')} aria-busy={r.isPlaceholderData}>
          <Resumo dados={r.data} mesNome={mesNome} verSemPagamento={pagamento === 'none' ? null : () => mudar('pagamento', 'none')} />
          {tendencia.data && <Tendencia dados={tendencia.data} mes={mes} onMes={(m) => mudar('mes', m)} />}
          {r.data.truncated && <p className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">Mostrando as primeiras 2000 notas. Filtre por empresa para ver o resto e exportar.</p>}
          {r.data.rows.length === 0 ? (
            <FolhaVazia frase={filtrado ? `Nenhuma nota com esses filtros em ${mesNome}.` : `Nenhuma nota emitida em ${mesNome}.`} />
          ) : (
            <Linhas linhas={r.data.rows} />
          )}
        </div>
      )}
    </>
  );
}

// ─── Resumo: o emitido em destaque e de onde veio o dinheiro ────────────────

function Resumo({ dados, mesNome, verSemPagamento }: { dados: Relatorio; mesNome: string; verSemPagamento: (() => void) | null }) {
  const t = dados.totals;
  const base = t.issued.cents || 1;
  const formas = FORMAS.filter((m) => t.byMethod[m] > 0);
  return (
    <section aria-label={`Resumo de ${mesNome}`} className="grid overflow-hidden rounded-xl border bg-card lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="px-5 py-5">
        <p className="text-sm text-muted-foreground">Emitido em {mesNome}</p>
        <p className="mt-1">
          <Dinheiro centavos={t.issued.cents} className="text-4xl" />
        </p>
        <p className="tabular mt-2 text-sm">{notas(t.issued.count)}</p>
        {t.cancelled.count > 0 && (
          <p className="tabular mt-4 border-t pt-3 text-sm text-muted-foreground">
            Emitidas no mês e já canceladas: <span className="whitespace-nowrap text-foreground">{reais(t.cancelled.cents)}</span> <span className="whitespace-nowrap">· {notas(t.cancelled.count)}</span>
          </p>
        )}
      </div>

      <div className="border-t px-5 py-5 lg:border-t-0 lg:border-l">
        <h2 className="text-sm text-muted-foreground">Por forma de pagamento</h2>
        {formas.length === 0 && t.unassigned.count === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum pagamento informado no período.</p>
        ) : (
          <dl className="mt-3 grid gap-3">
            {formas.map((m) => (
              <Barra key={m} rotulo={FORMA_PAGAMENTO[m]} cents={t.byMethod[m]} parte={t.byMethod[m] / base} />
            ))}
            {t.unassigned.count > 0 && (
              <Barra
                rotulo="Não informado"
                cents={t.unassigned.cents}
                parte={t.unassigned.cents / base}
                pendente
                extra={
                  <>
                    {notas(t.unassigned.count)}
                    {verSemPagamento && (
                      <>
                        {' · '}
                        <button type="button" onClick={verSemPagamento} className="rounded-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                          ver quais
                        </button>
                      </>
                    )}
                  </>
                }
              />
            )}
          </dl>
        )}
        {t.mismatched.count > 0 && (
          <p className="mt-4 text-sm text-destructive">
            {t.mismatched.count === 1 ? '1 nota tem' : `${t.mismatched.count} notas têm`} pagamentos que não somam o valor da nota.
          </p>
        )}
      </div>
    </section>
  );
}

function Barra({ rotulo, cents, parte, pendente = false, extra }: { rotulo: string; cents: number; parte: number; pendente?: boolean; extra?: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1">
      <dt className={cn('text-sm', pendente ? 'text-muted-foreground' : 'font-medium')}>
        {rotulo}
        {extra && <span className="ml-2 text-xs font-normal text-muted-foreground">{extra}</span>}
      </dt>
      <dd className={cn('tabular text-right text-sm', pendente ? 'text-muted-foreground' : 'font-semibold')}>{reais(cents)}</dd>
      <dd className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className={cn('block h-full rounded-full', pendente ? 'bg-muted-foreground/35' : 'bg-primary/75')}
          style={{ width: `${Math.max(Math.min(parte, 1) * 100, 1.5)}%` }}
        />
      </dd>
    </div>
  );
}

// ─── Tendência: 12 meses por empresa, o mês do filtro em grafite ─────────────

/** Small multiples: uma linha por empresa; clicar numa barra muda o mês do filtro. Rótulo só no mês escolhido e no maior. */
function Tendencia({ dados, mes, onMes }: { dados: TendenciaDados; mes: string; onMes: (m: string) => void }) {
  const i = dados.months.indexOf(mes);
  const anterior = i > 0 ? dados.months[i - 1] : undefined;
  return (
    <section aria-labelledby="tendencia" className="grid gap-5 rounded-xl border bg-card px-5 py-5">
      <h2 id="tendencia" className="rotulo">
        Últimos 12 meses
      </h2>
      {dados.companies.map((c) => {
        const valores = c.months.map((m) => m.issued.cents);
        const maior = Math.max(0, ...valores);
        const iMaior = valores.indexOf(maior);
        return (
          <div key={c.companyId} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">{c.name}</p>
              {anterior && <p className="text-xs text-muted-foreground">{fraseVariacao(valores[i] ?? 0, valores[i - 1] ?? 0, nomeMes(anterior).toLowerCase())}</p>}
            </div>
            <div className="grid grid-cols-12 gap-1">
              {c.months.map((m, j) => {
                const selecionado = m.month === mes;
                const comRotulo = m.issued.cents > 0 && (selecionado || j === iMaior);
                return (
                  <button
                    key={m.month}
                    type="button"
                    aria-label={`${nomeMes(m.month, true).toLowerCase()}, ${reais(m.issued.cents)}`}
                    aria-pressed={selecionado}
                    onClick={() => onMes(m.month)}
                    className="grid gap-0.5 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className={cn('tabular h-3 text-[0.65rem] leading-3 whitespace-nowrap', selecionado ? 'text-foreground' : 'text-muted-foreground', j >= 9 ? 'text-right' : 'text-left')} aria-hidden>
                      {comRotulo ? compacto(m.issued.cents) : ''}
                    </span>
                    <span className="flex h-10 w-full items-end" aria-hidden>
                      <span
                        className={cn('block w-full rounded-sm transition-colors', selecionado ? 'bg-primary' : 'bg-taupe/45 hover:bg-taupe/70')}
                        style={{ height: `${maior ? Math.max((m.issued.cents / maior) * 100, 4) : 4}%` }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ─── Linhas: tabela no desktop, lista no celular ────────────────────────────

/** Cada forma numa linha própria, para a coluna não empurrar as outras. */
function Pagamentos({ p, compacto = false }: { p: LinhaRelatorio['payments']; compacto?: boolean }) {
  if (p.length === 0) return <span className="text-muted-foreground">Não informado</span>;
  if (p.length === 1) return <span>{FORMA_PAGAMENTO[p[0]!.method]}</span>;
  if (compacto) return <span>{p.map((x) => FORMA_PAGAMENTO[x.method]).join(' + ')}</span>;
  return (
    <span className="grid gap-0.5">
      {p.map((x, i) => (
        <span key={i} className="flex justify-between gap-3">
          <span>{FORMA_PAGAMENTO[x.method]}</span>
          <span className="tabular text-muted-foreground">{reais(x.amountCents)}</span>
        </span>
      ))}
    </span>
  );
}

function Linhas({ linhas }: { linhas: LinhaRelatorio[] }) {
  const navegar = useNavigate();
  return (
    <>
      <ul className="divide-y rounded-xl border bg-card sm:hidden">
        {linhas.map((n) => {
          const cancelada = n.status === 'CANCELLED';
          return (
            <li key={n.id}>
              <Link to={`/notas/${n.id}`} className="grid gap-1 px-4 py-3 active:bg-accent">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-semibold">{n.patient.name}</span>
                  <span className={cn('tabular shrink-0 font-semibold', cancelada && 'text-muted-foreground line-through decoration-1')}>{reais(n.totalCents)}</span>
                </span>
                <span className="tabular truncate text-xs text-muted-foreground">
                  {dataEmissao(n.issuedAt)}
                  {n.number ? ` · Nº ${n.number}` : ''} · {n.company.name}
                </span>
                <span className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate">
                    <Pagamentos p={n.payments} compacto />
                  </span>
                  <StatusBadge status={n.status} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Emissão</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead className="hidden 2xl:table-cell">Profissional</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="pr-4">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((n) => {
              const cancelada = n.status === 'CANCELLED';
              return (
                <TableRow key={n.id} className="cursor-pointer" onClick={() => navegar(`/notas/${n.id}`)}>
                  <TableCell className="py-3 pl-4 align-top">
                    <span className="tabular block">{dataEmissao(n.issuedAt)}</span>
                    <span className="tabular block text-xs text-muted-foreground">{n.number ? `Nº ${n.number}` : '—'}</span>
                  </TableCell>
                  <TableCell className="py-3 align-top whitespace-normal">
                    <Link to={`/notas/${n.id}`} className="block font-medium underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {n.patient.name}
                    </Link>
                    <span className="tabular block text-xs text-muted-foreground">{n.patient.document || 'sem documento'}</span>
                  </TableCell>
                  <TableCell className="py-3 align-top">{n.company.name}</TableCell>
                  <TableCell className="hidden py-3 align-top whitespace-normal 2xl:table-cell">{n.professional}</TableCell>
                  <TableCell className={cn('tabular py-3 text-right align-top font-medium', cancelada && 'text-muted-foreground line-through decoration-1')}>{reais(n.totalCents)}</TableCell>
                  <TableCell className="min-w-44 py-3 align-top whitespace-normal">
                    <Pagamentos p={n.payments} />
                  </TableCell>
                  <TableCell className="py-3 pr-4 align-top">
                    <StatusBadge status={n.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
