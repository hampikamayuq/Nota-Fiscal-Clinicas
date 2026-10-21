import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ChevronDown, Download, MessageCircle, Pencil, Plus, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Aviso } from '@/components/aviso';
import { BarraAcaoMovel } from '@/components/barra-acao-movel';
import { Campo } from '@/components/campo';
import { ItemDialog, type DadosItem } from '@/components/item-dialog';
import { NotaViva, type LinhaNota } from '@/components/nota-viva';
import { Pagamento } from '@/components/pagamento';
import { PageHeader } from '@/components/page-header';
import { SeletorServicos } from '@/components/seletor-servicos';
import { StatusBadge } from '@/components/status-badge';
import { mensagemDeErro } from '@/lib/api';
import { pode, useMe } from '@/lib/auth';
import { linkWhatsApp, mensagemWhatsApp } from '@/lib/emissao';
import { EDITAVEL, STATUS, dataEmissao, dataHora, reais, rotuloPagamentos } from '@/lib/format';
import { useDescricao, useMutacoes, useNota, useServicos } from '@/lib/queries';
import type { ItemNota, Nota, StatusNota } from '@/lib/tipos';

const linha = (i: ItemNota): LinhaNota => ({
  id: i.id,
  nome: i.serviceNameSnapshot,
  descricao: i.descriptionSnapshot,
  tuss: i.tussCodeSnapshot,
  quantidade: i.quantity,
  unitario: i.unitAmountCents,
  total: i.totalAmountCents,
});

const erro = (e: unknown) => toast.error(mensagemDeErro(e));

/** O ponto de cada evento do histórico na cor do status (classes literais: o Tailwind não monta nome dinâmico). */
const PONTO: Record<StatusNota, string> = {
  DRAFT: 'before:bg-status-draft',
  READY: 'before:bg-status-ready',
  SUBMITTING: 'before:bg-status-processing',
  PROCESSING: 'before:bg-status-processing',
  AUTHORIZED: 'before:bg-status-authorized',
  REJECTED: 'before:bg-status-rejected',
  CANCELLATION_REQUESTED: 'before:bg-status-processing',
  CANCELLED: 'before:bg-status-cancelled',
  CANCELLATION_ERROR: 'before:bg-status-rejected',
};

export function NotaPage() {
  const { id } = useParams();
  const nota = useNota(id);
  if (nota.isPending) return <Skeleton className="h-96" />;
  if (nota.isError || !nota.data) return <p className="text-destructive">Nota não encontrada. {nota.error ? mensagemDeErro(nota.error) : ''}</p>;
  return <NotaAberta nota={nota.data} />;
}

/** Enquanto o fisco processa, consulta o provedor sozinha: a cada 5 s nos primeiros 2 minutos, depois a cada 30 s. */
function useSincronizacaoAutomatica(id: string, ativa: boolean, sincronizar: (id: string) => void) {
  useEffect(() => {
    if (!ativa) return;
    const inicio = Date.now();
    let t: number;
    const tick = () => {
      sincronizar(id);
      t = window.setTimeout(tick, Date.now() - inicio < 120_000 ? 5_000 : 30_000);
    };
    t = window.setTimeout(tick, 5_000);
    return () => clearTimeout(t);
  }, [id, ativa, sincronizar]);
}

function NotaAberta({ nota: n }: { nota: Nota }) {
  const me = useMe();
  const m = useMutacoes();
  const [editando, setEditando] = useState<ItemNota | null>(null);
  const [cancelando, setCancelando] = useState(false);
  // O carimbo só pousa quando a nota foi emitida com a página aberta; uma nota já emitida abre com ele parado.
  const [statusInicial] = useState(n.status);
  const animarCarimbo = statusInicial !== 'AUTHORIZED' && n.status === 'AUTHORIZED';
  const opera = pode(me.data, 'operarNotas');
  const editavel = n.status === 'DRAFT' && opera;
  const { mutate: sincronizar } = m.sincronizar;
  // `mutate` do TanStack é estável entre renders; o efeito não reinicia a cada render.
  useSincronizacaoAutomatica(n.id, opera && (n.status === 'SUBMITTING' || n.status === 'PROCESSING' || n.status === 'CANCELLATION_REQUESTED'), sincronizar);

  return (
    <>
      <PageHeader
        trilha={
          <>
            <Link to="/notas" className="underline-offset-4 hover:underline">
              Notas
            </Link>{' '}
            / {n.company?.tradeName ?? n.company?.legalName ?? ''}
          </>
        }
        titulo={n.patient?.name ?? 'Nota'}
        descricao={`${n.items.length} ${n.items.length === 1 ? 'serviço' : 'serviços'} · ${reais(n.totalAmountCents)}${n.internalReference ? ` · ref. ${n.internalReference}` : ''}`}
        acoes={<StatusBadge status={n.status} className="h-7 px-2.5 text-sm" />}
      />

      <div className="grid gap-8 pb-24 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-rows-[auto_auto_1fr] xl:pb-0">
        {editavel && <Servicos nota={n} />}

        <NotaViva
          className="xl:col-start-2 xl:row-span-3 xl:row-start-1 xl:self-start"
          empresa={n.company ?? null}
          paciente={n.patient ?? null}
          profissional={{ name: n.professionalNameSnapshot, council: n.professionalCouncilSnapshot, crmNumber: n.professionalCrmSnapshot, crmState: n.professionalCrmStateSnapshot, rqe: n.professionalRqeSnapshot, specialty: n.professionalSpecialtySnapshot }}
          itens={n.items.map(linha)}
          total={n.totalAmountCents}
          status={n.status}
          numero={n.externalNumber}
          competencia={n.competenceDate}
          referencia={n.internalReference}
          animarCarimbo={animarCarimbo}
          acoesItem={
            editavel
              ? (i) => (
                  <span className="flex gap-0.5">
                    <Button variant="ghost" size="icon-sm" aria-label={`Editar ${i.nome}`} onClick={() => setEditando(n.items.find((x) => x.id === i.id) ?? null)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remover ${i.nome}`} onClick={() => m.removerItem.mutate({ id: n.id, itemId: i.id }, { onError: erro })} disabled={m.removerItem.isPending}>
                      <Trash2 />
                    </Button>
                  </span>
                )
              : undefined
          }
        />

        <section aria-labelledby="andar" className="grid content-start gap-3 xl:col-start-1">
          <h2 id="andar" className="rotulo">
            {opera && EDITAVEL.has(n.status) ? 'Próximo passo' : 'Situação'}
          </h2>
          <Passo nota={n} opera={opera} podeCancelar={pode(me.data, 'cancelar')} onCancelar={() => setCancelando(true)} />
        </section>

        <section aria-labelledby="pagamento" className="xl:col-start-1">
          <Pagamento nota={n} podeEditar={opera} />
        </section>

        {n.history && n.history.length > 0 && (
          <section aria-labelledby="historico" className="xl:col-start-1">
            <h2 id="historico" className="rotulo mb-3">
              Histórico
            </h2>
            <ol className="border-l pl-4 text-sm">
              {n.history.map((h) => (
                <li key={h.id} className={cn('relative pb-3 before:absolute before:top-1.5 before:-left-[1.3rem] before:size-2 before:rounded-full', PONTO[h.toStatus])}>
                  <span className="font-medium">{STATUS[h.toStatus].rotulo}</span>
                  <span className="tabular block text-xs text-muted-foreground">{dataHora(h.createdAt)}</span>
                  {h.reason && <span className="block text-xs text-muted-foreground">{h.reason}</span>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {editando && <EditarItem nota={n} item={editando} onFechar={() => setEditando(null)} />}
      {cancelando && <CancelarDialog nota={n} onFechar={() => setCancelando(false)} />}
    </>
  );
}

// ─── Serviços: favoritos, modelos e busca ────────────────────────────────────

function Servicos({ nota }: { nota: Nota }) {
  const m = useMutacoes();
  return (
    <section aria-labelledby="rapidos" className="xl:col-start-1">
      <h2 id="rapidos" className="rotulo mb-3">
        Serviços rápidos
      </h2>
      <SeletorServicos
        companyId={nota.companyId}
        ocupado={m.adicionarItem.isPending || m.aplicarModelo.isPending}
        onServico={(s) => m.adicionarItem.mutate({ id: nota.id, serviceTemplateId: s.id }, { onError: erro })}
        onModelo={(templateId) => m.aplicarModelo.mutate({ id: nota.id, templateId }, { onError: erro })}
      />
    </section>
  );
}

// ─── Próximo passo, conforme a situação ──────────────────────────────────────

/** O motivo exato da Focus/SEFIN; a API só o envia para quem pode resolvê-lo (ADMIN/FINANCE). */
function MotivoTecnico({ nota: n }: { nota: Nota }) {
  if (!n.lastAttemptError?.message) return null;
  return (
    <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Motivo técnico{n.lastAttemptError.code ? ` (${n.lastAttemptError.code})` : ''}:</span>{' '}
      <span className="break-words">{n.lastAttemptError.message}</span>
    </p>
  );
}

function Passo({ nota: n, opera, podeCancelar, onCancelar }: { nota: Nota; opera: boolean; podeCancelar: boolean; onCancelar: () => void }) {
  const m = useMutacoes();
  const navegar = useNavigate();
  const marcar = (status: 'DRAFT' | 'READY') => m.mudarStatus.mutate({ id: n.id, status }, { onError: erro });
  const sincronizar = () => m.sincronizar.mutate(n.id, { onSuccess: (r) => toast.success(`Situação no provedor: ${STATUS[r.status].rotulo.toLowerCase()}.`), onError: erro });
  const botaoSincronizar = (
    <Button variant="outline" onClick={sincronizar} disabled={m.sincronizar.isPending}>
      <RefreshCw className={cn(m.sincronizar.isPending && 'animate-spin')} /> Sincronizar
    </Button>
  );

  if (!opera && EDITAVEL.has(n.status)) return <Aviso>Seu perfil acompanha as notas, mas não as altera.</Aviso>;

  switch (n.status) {
    case 'DRAFT': {
      // Rascunho não foi ao fisco: apagar é só limpeza, e a confirmação nativa basta.
      const apagar = () => {
        if (!confirm('Apagar este rascunho? Não dá para desfazer.')) return;
        m.apagarNota.mutate(n.id, {
          onSuccess: () => {
            toast.success('Rascunho apagado.');
            navegar('/notas', { replace: true });
          },
          onError: erro,
        });
      };
      const botaoApagar = (
        <Button variant="ghost" className="justify-self-start text-destructive" disabled={m.apagarNota.isPending} onClick={apagar}>
          <Trash2 /> Apagar rascunho
        </Button>
      );
      if (n.items.length === 0) {
        return (
          <>
            <p className="text-sm text-muted-foreground">Adicione pelo menos um serviço.</p>
            {botaoApagar}
          </>
        );
      }
      return (
        <>
          <Button size="lg" disabled={m.mudarStatus.isPending} onClick={() => marcar('READY')}>
            Revisar e emitir
          </Button>
          {botaoApagar}
          <BarraAcaoMovel total={n.totalAmountCents}>
            <Button disabled={m.mudarStatus.isPending} onClick={() => marcar('READY')}>
              Revisar e emitir
            </Button>
          </BarraAcaoMovel>
        </>
      );
    }
    case 'READY':
      return <Revisao nota={n} onEditar={() => marcar('DRAFT')} />;
    case 'SUBMITTING':
    case 'PROCESSING':
    case 'CANCELLATION_REQUESTED':
      return (
        <>
          {n.lastErrorMessage ? (
            <>
              <Aviso tom="erro">{n.lastErrorMessage}</Aviso>
              <MotivoTecnico nota={n} />
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-status-processing" aria-hidden />
              {n.status === 'CANCELLATION_REQUESTED' ? 'O provedor fiscal está processando o cancelamento. Costuma levar menos de um minuto.' : 'Enviada ao fisco. Aguardando a autorização…'}
            </p>
          )}
          {opera && (
            <>
              {botaoSincronizar}
              <BarraAcaoMovel total={n.totalAmountCents}>
                <Button onClick={sincronizar} disabled={m.sincronizar.isPending}>
                  <RefreshCw className={cn(m.sincronizar.isPending && 'animate-spin')} /> Sincronizar
                </Button>
              </BarraAcaoMovel>
            </>
          )}
        </>
      );
    case 'AUTHORIZED':
      return <Fechamento nota={n} podeCancelar={podeCancelar} onCancelar={onCancelar} sincronizar={opera ? sincronizar : null} sincronizando={m.sincronizar.isPending} />;
    case 'REJECTED':
      return (
        <>
          <Aviso tom="erro">{n.lastErrorMessage ?? 'A nota foi recusada.'}</Aviso>
          <MotivoTecnico nota={n} />
          {opera && (
            <Button onClick={() => marcar('DRAFT')} disabled={m.mudarStatus.isPending}>
              Corrigir a nota
            </Button>
          )}
        </>
      );
    case 'CANCELLATION_ERROR':
      return (
        <>
          <Aviso tom="erro">{n.lastErrorMessage ?? 'O cancelamento não foi concluído.'} A nota continua emitida.</Aviso>
          <MotivoTecnico nota={n} />
          {podeCancelar && (
            <Button variant="destructive" onClick={onCancelar}>
              Tentar cancelar de novo
            </Button>
          )}
        </>
      );
    case 'CANCELLED':
      return <Aviso>Nota cancelada. Para faturar este atendimento, crie uma nota nova.</Aviso>;
  }
}

/** Revisão embutida: a descrição que vai ao fisco, a confirmação e o botão de emitir. O documento fica à vista. */
function Revisao({ nota: n, onEditar }: { nota: Nota; onEditar: () => void }) {
  const m = useMutacoes();
  const d = useDescricao(n.id, n.updatedAt, true);
  const [confirmado, setConfirmado] = useState(false);
  const [texto, setTexto] = useState<string | null>(null);
  const bloqueios = d.data?.check.blocking ?? [];
  const salvar = (valor: string | null) =>
    m.editarNota.mutate(
      { id: n.id, finalFiscalDescription: valor },
      {
        onSuccess: () => {
          setTexto(null);
          setConfirmado(false);
        },
        onError: erro,
      },
    );
  // A tela muda sozinha quando emite ou entra em processamento; só a recusa merece aviso.
  const emitir = () => m.emitir.mutate(n.id, { onSuccess: (r) => r.status === 'REJECTED' && toast.error('A nota foi recusada. Veja o motivo.'), onError: erro });
  // O botão desabilitado diz o que falta, em texto normal.
  const motivo = !d.data ? null : (bloqueios[0] ?? (texto !== null ? 'Salve ou descarte a descrição.' : !confirmado ? "Marque 'Revisei os dados'." : null));
  const travado = !d.data || motivo !== null || m.emitir.isPending;
  const rotulo = m.emitir.isPending ? 'Emitindo…' : 'Emitir NFS-e';

  return (
    <>
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-sans text-sm font-semibold tracking-normal">Descrição que vai na nota</h3>
          {texto === null && d.data && (
            <button
              type="button"
              className="rounded-sm text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => setTexto(d.data.text)}
            >
              Editar
            </button>
          )}
        </div>
        {d.isPending ? (
          <Skeleton className="h-32" />
        ) : d.isError ? (
          <Aviso tom="erro">{mensagemDeErro(d.error)}</Aviso>
        ) : texto !== null ? (
          <>
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={10} aria-label="Descrição da nota" className="text-sm" />
            <p className="text-xs text-muted-foreground">Procedimento, TUSS, registro no conselho e RQE servem ao reembolso. Diagnóstico e CID não entram: a nota é pública.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => salvar(texto)} disabled={m.editarNota.isPending || !texto.trim()}>
                Salvar descrição
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTexto(null)}>
                Descartar
              </Button>
              {d.data.custom && (
                <Button size="sm" variant="ghost" onClick={() => salvar(null)} disabled={m.editarNota.isPending}>
                  Voltar à automática
                </Button>
              )}
            </div>
          </>
        ) : (
          <pre className="rounded-lg border bg-secondary px-3 py-2 font-sans text-xs leading-relaxed whitespace-pre-wrap">{d.data.text}</pre>
        )}
        {bloqueios.map((b) => (
          <Aviso key={b} tom="erro">
            {b}
          </Aviso>
        ))}
        {d.data?.check.warnings.map((w) => <Aviso key={w}>{w}</Aviso>)}
      </div>
      <p className="text-sm text-muted-foreground">
        Pagamento: <span className="text-foreground">{rotuloPagamentos(n.payments)}</span>
      </p>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={confirmado} onCheckedChange={(c) => setConfirmado(c === true)} className="mt-0.5" />
        <span>Revisei os dados e confirmo a emissão.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={travado} onClick={emitir}>
          {rotulo}
        </Button>
        {motivo && !m.emitir.isPending && <p className="text-sm text-foreground">{motivo}</p>}
      </div>
      <Button variant="link" className="justify-self-start px-0" onClick={onEditar} disabled={m.mudarStatus.isPending || m.emitir.isPending}>
        Editar serviços
      </Button>
      <BarraAcaoMovel total={n.totalAmountCents}>
        <Button disabled={travado} onClick={emitir}>
          {rotulo}
        </Button>
      </BarraAcaoMovel>
    </>
  );
}

/** O fechamento: o que a recepção faz com a nota emitida, na ordem em que faz. Cancelar fica atrás de "Mais". */
function Fechamento({
  nota: n,
  podeCancelar,
  onCancelar,
  sincronizar,
  sincronizando,
}: {
  nota: Nota;
  podeCancelar: boolean;
  onCancelar: () => void;
  sincronizar: (() => void) | null;
  sincronizando: boolean;
}) {
  const [mais, setMais] = useState(false);
  const paciente = n.patient?.name ?? '';
  const empresa = n.company?.tradeName ?? n.company?.legalName ?? '';
  const quando = n.authorizedAt ?? n.submittedAt;
  const pdf = n.pdfUrl;
  const whatsapp = pdf ? linkWhatsApp(n.patient?.phone, mensagemWhatsApp({ paciente, numero: n.externalNumber, empresa, totalCents: n.totalAmountCents, pdfUrl: pdf })) : null;
  const baixar = (
    <Button size="lg" render={<a href={`/api/invoices/${n.id}/pdf`} download />} nativeButton={false}>
      <Download /> Baixar PDF
    </Button>
  );

  return (
    <>
      <div className="rounded-xl border bg-card px-4 py-3">
        <p className="font-heading text-lg">Nota{n.externalNumber ? ` nº ${n.externalNumber}` : ''} emitida</p>
        <p className="tabular text-sm text-muted-foreground">{[paciente, reais(n.totalAmountCents), quando ? dataEmissao(quando) : null].filter(Boolean).join(' · ')}</p>
      </div>
      {pdf && whatsapp ? (
        <>
          {baixar}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" render={<a href={whatsapp} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
              <MessageCircle /> WhatsApp
            </Button>
            <Button variant="outline" render={<a href={pdf} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
              <Printer /> Imprimir
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">O PDF chega em instantes; use Sincronizar se demorar.</p>
          {sincronizar && (
            <Button variant="outline" onClick={sincronizar} disabled={sincronizando}>
              <RefreshCw className={cn(sincronizando && 'animate-spin')} /> Sincronizar
            </Button>
          )}
        </>
      )}
      <Button variant="outline" render={<Link to={`/notas/nova?empresa=${n.companyId}&profissional=${n.professionalId}`} />} nativeButton={false}>
        <Plus /> Nova nota
      </Button>
      {(n.xmlUrl || podeCancelar) && (
        <Popover open={mais} onOpenChange={setMais}>
          <PopoverTrigger render={<Button variant="ghost" className="justify-self-start" />}>
            Mais <ChevronDown className="size-4" aria-hidden />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 gap-0 p-1">
            {n.xmlUrl && (
              <Button variant="ghost" className="w-full justify-start rounded-md" render={<a href={n.xmlUrl} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
                <Download /> Baixar XML
              </Button>
            )}
            {podeCancelar && (
              <Button
                variant="ghost"
                className="w-full justify-start rounded-md text-destructive hover:text-destructive"
                onClick={() => {
                  setMais(false);
                  onCancelar();
                }}
              >
                Cancelar nota
              </Button>
            )}
          </PopoverContent>
        </Popover>
      )}
      <BarraAcaoMovel total={n.totalAmountCents}>
        {pdf ? (
          <Button render={<a href={`/api/invoices/${n.id}/pdf`} download />} nativeButton={false}>
            <Download /> Baixar PDF
          </Button>
        ) : sincronizar ? (
          <Button onClick={sincronizar} disabled={sincronizando}>
            <RefreshCw className={cn(sincronizando && 'animate-spin')} /> Sincronizar
          </Button>
        ) : null}
      </BarraAcaoMovel>
    </>
  );
}

function EditarItem({ nota, item, onFechar }: { nota: Nota; item: ItemNota; onFechar: () => void }) {
  const servicos = useServicos(nota.companyId);
  const m = useMutacoes();
  const servico = servicos.data?.find((s) => s.id === item.serviceTemplateId);
  const salvar = (d: DadosItem) => m.editarItem.mutate({ id: nota.id, itemId: item.id, ...d }, { onSuccess: onFechar, onError: erro });
  return (
    <ItemDialog
      aberto
      titulo={`Editar ${item.serviceNameSnapshot}`}
      inicial={{ name: item.serviceNameSnapshot, description: item.descriptionSnapshot, tussCode: item.tussCodeSnapshot, quantity: item.quantity, unitAmountCents: item.unitAmountCents }}
      travas={{ descricao: servico?.allowDescriptionEdit === false, valor: servico?.allowAmountEdit === false }}
      pendente={m.editarItem.isPending}
      onSalvar={salvar}
      onFechar={onFechar}
    />
  );
}

const MOTIVOS = [
  ['1', 'Erro na emissão'],
  ['2', 'Serviço não prestado'],
  ['9', 'Outros'],
] as const;

/** Cancelar é definitivo: aqui o diálogo se justifica (foco protegido, confirmação digitada). */
function CancelarDialog({ nota, onFechar }: { nota: Nota; onFechar: () => void }) {
  const m = useMutacoes();
  const [motivo, setMotivo] = useState<'1' | '2' | '9'>('1');
  const [justificativa, setJustificativa] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const tamanho = justificativa.trim().length;
  const pronto = tamanho >= 15 && tamanho <= 255 && confirmacao === 'CANCELAR';
  const cancelar = () =>
    m.cancelar.mutate(
      { id: nota.id, reasonCode: motivo, justification: justificativa.trim(), confirmation: confirmacao },
      {
        onSuccess: (r) => {
          if (r.status === 'CANCELLED') toast.success('Nota cancelada.');
          else toast.error(r.lastErrorMessage ?? 'O cancelamento não foi concluído.');
          onFechar();
        },
        onError: erro,
      },
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar NFS-e{nota.externalNumber ? ` nº ${nota.externalNumber}` : ''}</DialogTitle>
          <DialogDescription>O cancelamento vai para o fisco e não pode ser desfeito. Para faturar de novo, será preciso outra nota.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div role="radiogroup" aria-label="Motivo" className="flex flex-wrap gap-1.5">
            {MOTIVOS.map(([v, rotulo]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={motivo === v}
                onClick={() => setMotivo(v)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  motivo === v && 'border-primary bg-primary text-primary-foreground hover:bg-primary',
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <Campo id="c-just" label="Justificativa" dica={`${tamanho} de 15 a 255 caracteres. Fica registrada no fisco.`}>
            <Textarea id="c-just" rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={255} />
          </Campo>
          <Campo id="c-conf" label="Digite CANCELAR para confirmar">
            <Input id="c-conf" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="off" />
          </Campo>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Voltar
          </Button>
          <Button className="bg-destructive text-white hover:bg-destructive/90" disabled={!pronto || m.cancelar.isPending} onClick={cancelar}>
            {m.cancelar.isPending ? 'Cancelando…' : 'Confirmar cancelamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
