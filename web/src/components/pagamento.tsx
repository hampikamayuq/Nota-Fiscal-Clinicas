import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Aviso } from '@/components/aviso';
import { mensagemDeErro } from '@/lib/api';
import { FORMAS, FORMA_PAGAMENTO, centavosDe, reais, rotuloPagamentos } from '@/lib/format';
import { useMutacoes } from '@/lib/queries';
import type { FormaPagamento, Nota } from '@/lib/tipos';

type Linha = { method: FormaPagamento; valor: string };

const MAX_FORMAS = 6;
const CLASSE_SELECT =
  'h-11 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-10 md:text-sm dark:bg-input/30';

const soma = (p: { amountCents: number }[]) => p.reduce((s, x) => s + x.amountCents, 0);
/** A primeira forma ainda não usada; a recepção raramente repete a mesma. */
const proximaForma = (ls: Linha[]): FormaPagamento => FORMAS.find((f) => !ls.some((l) => l.method === f)) ?? 'PIX';

/** Pagamentos a enviar, ou null se algum valor for inválido. Com uma linha só, vale o total da nota. */
export function pagamentosDe(linhas: Linha[], total: number): { method: FormaPagamento; amountCents: number }[] | null {
  const out = linhas.map((l) => ({ method: l.method, amountCents: linhas.length === 1 ? total : centavosDe(l.valor) }));
  return out.every((p): p is { method: FormaPagamento; amountCents: number } => p.amountCents !== null && p.amountCents >= 0) ? out : null;
}

export function Pagamento({ nota, podeEditar }: { nota: Nota; podeEditar: boolean }) {
  const { salvarPagamentos } = useMutacoes();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const total = nota.totalAmountCents;
  const atuais = nota.payments;
  const desencontro = atuais.length > 1 && soma(atuais) !== total;

  const fechar = () => setLinhas(null);
  const gravar = (payments: { method: FormaPagamento; amountCents: number }[]) =>
    salvarPagamentos.mutate(
      { id: nota.id, payments },
      { onSuccess: () => { toast.success('Pagamento salvo.'); fechar(); }, onError: (e) => toast.error(mensagemDeErro(e)) },
    );
  const abrir = () =>
    setLinhas(atuais.length ? atuais.map((p) => ({ method: p.method, valor: reais(p.amountCents) })) : [{ method: 'PIX', valor: reais(total) }]);
  const mudar = (i: number, parte: Partial<Linha>) => setLinhas((ls) => ls!.map((l, j) => (j === i ? { ...l, ...parte } : l)));

  const pagamentos = linhas ? pagamentosDe(linhas, total) : null;
  const diferenca = linhas && linhas.length > 1 ? total - linhas.reduce((s, l) => s + (centavosDe(l.valor) ?? 0), 0) : 0;
  const invalido = linhas !== null && linhas.length > 1 && linhas.some((l) => centavosDe(l.valor) === null);
  // Linha nova leva o que falta; com uma só forma (que tem o total todo), divide ao meio para o usuário ajustar.
  const adicionar = () =>
    setLinhas((ls) => {
      if (!ls) return ls;
      if (ls.length > 1) return [...ls, { method: proximaForma(ls), valor: reais(Math.max(total - ls.reduce((s, l) => s + (centavosDe(l.valor) ?? 0), 0), 0)) }];
      const metade = Math.floor(total / 2);
      return [{ ...ls[0]!, valor: reais(total - metade) }, { method: proximaForma(ls), valor: reais(metade) }];
    });
  const pode = pagamentos !== null && diferenca === 0 && !salvarPagamentos.isPending;

  return (
    <div className="grid gap-3">
      <h2 id="pagamento" className="rotulo">Pagamento</h2>
      {desencontro && <Aviso tom="erro">{`Pagamentos somam ${reais(soma(atuais))}; a nota é ${reais(total)}. Ajuste antes de fechar o mês.`}</Aviso>}
      {linhas === null ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">{rotuloPagamentos(atuais)}</p>
          {podeEditar && (
            <Button variant="outline" size="lg" onClick={abrir}>
              {atuais.length ? 'Alterar' : 'Informar pagamento'}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {linhas.map((l, i) => (
            <div key={i} className={linhas.length > 1 ? 'grid grid-cols-[minmax(0,1fr)_7.5rem_auto] items-center gap-2' : 'grid'}>
              <select className={CLASSE_SELECT} aria-label={`Forma de pagamento ${i + 1}`} value={l.method} onChange={(e) => mudar(i, { method: e.target.value as FormaPagamento })}>
                {FORMAS.map((f) => <option key={f} value={f}>{FORMA_PAGAMENTO[f]}</option>)}
              </select>
              {linhas.length > 1 && (
                <Input inputMode="decimal" aria-label={`Valor ${i + 1}`} className="h-11 text-right tabular-nums md:h-10" value={l.valor} onChange={(e) => mudar(i, { valor: e.target.value })} />
              )}
              {linhas.length > 1 && (
                <Button variant="ghost" size="icon-lg" aria-label={`Remover forma ${i + 1}`} onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          {linhas.length < MAX_FORMAS && (
            <Button
              variant="ghost" size="lg" className="justify-self-start"
              onClick={adicionar}
            >
              <Plus /> Adicionar outra forma
            </Button>
          )}
          {linhas.length > 1 && (
            <p className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm tabular-nums" role="status">
              <span className="text-muted-foreground">Total da nota {reais(total)}</span>
              {invalido ? (
                <span className="text-muted-foreground">Informe o valor de cada forma.</span>
              ) : diferenca === 0 ? (
                <span className="font-medium">Soma confere</span>
              ) : (
                <span className="font-medium">{diferenca > 0 ? `Faltam ${reais(diferenca)}` : `Passa ${reais(-diferenca)}`}</span>
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="lg" disabled={!pode} onClick={() => pagamentos && gravar(pagamentos)}>
              {salvarPagamentos.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button variant="outline" size="lg" onClick={fechar}>Cancelar</Button>
            {atuais.length > 0 && (
              <Button variant="ghost" size="lg" disabled={salvarPagamentos.isPending} onClick={() => gravar([])}>Limpar</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
