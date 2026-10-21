import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Dinheiro } from '@/components/dinheiro';
import { STATUS, cnpj, dataCurta, dataHoje, documento, reais } from '@/lib/format';
import type { StatusNota } from '@/lib/tipos';

export type LinhaNota = { id: string; nome: string; descricao: string; tuss: string | null; quantidade: number; unitario: number; total: number };

type Props = {
  empresa?: { legalName: string; cnpj: string } | null;
  paciente?: { name: string; cpf?: string | null; cnpj?: string | null; foreignDocument?: string | null } | null;
  profissional?: { name: string; council: string; crmNumber: string; crmState: string; rqe: string | null; specialty: string | null } | null;
  itens: LinhaNota[];
  total: number;
  status?: StatusNota;
  numero?: string | null;
  competencia?: string | null;
  referencia?: string | null;
  /** Ações por item (editar, remover). Só na nota editável. */
  acoesItem?: (item: LinhaNota) => ReactNode;
  /** O carimbo pousa (animação) quando a nota foi emitida nesta sessão; ao abrir uma nota já emitida ele aparece parado. */
  animarCarimbo?: boolean;
  className?: string;
};

const COR_CARIMBO: Partial<Record<StatusNota, string>> = {
  SUBMITTING: 'text-status-processing',
  PROCESSING: 'text-status-processing',
  AUTHORIZED: 'text-status-authorized',
  REJECTED: 'text-status-rejected',
  CANCELLATION_REQUESTED: 'text-status-processing',
  CANCELLED: 'text-status-cancelled',
  CANCELLATION_ERROR: 'text-status-rejected',
};

const Vazio = ({ texto }: { texto: string }) => <span className="text-muted-foreground">{texto}</span>;

/**
 * A nota viva: o documento que vai se preenchendo enquanto a recepção escolhe.
 * É a única superfície quente da interface (papel blush, linha taupe, plana): é a única coisa que sai daqui.
 */
export function NotaViva({ empresa, paciente, profissional, itens, total, status, numero, competencia, referencia, acoesItem, animarCarimbo, className }: Props) {
  const carimbo = status && status !== 'DRAFT' && status !== 'READY' ? STATUS[status] : null;
  return (
    <article className={cn('folha @container relative rounded-xl p-5 text-sm sm:p-8', className)} aria-label="Prévia da nota">
      {carimbo && (
        <div
          className={cn('carimbo mb-4 inline-block w-fit rounded-md px-3 py-1 text-xs font-semibold uppercase @md:absolute @md:top-6 @md:right-6 @md:mb-0', COR_CARIMBO[status!], animarCarimbo && 'carimbo-pousa')}
          aria-hidden
        >
          {carimbo.rotulo}
        </div>
      )}
      <header className="linha mb-6 border-b pb-4">
        <p className="rotulo">Nota fiscal de serviço · NFS-e</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 className="text-2xl">{numero ? `Nº ${numero}` : status ? STATUS[status].rotulo : 'Em preparação'}</h2>
          <p className="tabular text-xs text-muted-foreground">
            {`competência ${competencia ? dataCurta(competencia) : dataHoje()}`}
            {referencia ? ` · ref. ${referencia}` : ''}
          </p>
        </div>
      </header>

      <dl className="grid gap-5 @xl:grid-cols-3">
        <Bloco rotulo="Emitente">
          {empresa ? (
            <>
              <strong className="font-medium">{empresa.legalName}</strong>
              <span className="tabular block text-xs text-muted-foreground">CNPJ {cnpj(empresa.cnpj)}</span>
            </>
          ) : (
            <Vazio texto="escolha a empresa" />
          )}
        </Bloco>
        <Bloco rotulo="Tomador">
          {paciente ? (
            <>
              <strong className="font-medium">{paciente.name}</strong>
              <span className="tabular block text-xs text-muted-foreground">{documento(paciente)}</span>
            </>
          ) : (
            <Vazio texto="escolha o paciente" />
          )}
        </Bloco>
        <Bloco rotulo="Profissional">
          {profissional ? (
            <>
              <strong className="font-medium">{profissional.name}</strong>
              <span className="tabular block text-xs text-muted-foreground">
                {profissional.council}-{profissional.crmState} {profissional.crmNumber}
                {profissional.rqe ? ` · RQE ${profissional.rqe}` : ''}
              </span>
            </>
          ) : (
            <Vazio texto="escolha o profissional" />
          )}
        </Bloco>
      </dl>

      <section className="mt-6">
        <h3 className="rotulo">Serviços</h3>
        {itens.length === 0 ? (
          <p className="linha mt-2 rounded-lg border border-dashed px-3 py-4 text-center text-muted-foreground">nenhum serviço ainda</p>
        ) : (
          <ul className="linha mt-2 divide-y divide-taupe/40">
            {itens.map((i) => (
              <li key={i.id} className="animate-in fade-in slide-in-from-bottom-1 flex flex-wrap items-start gap-x-3 gap-y-1 py-3 duration-200">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.nome}</p>
                  {i.descricao !== i.nome && <p className="text-xs text-muted-foreground">{i.descricao}</p>}
                  <p className="tabular text-xs text-muted-foreground">
                    {i.tuss ? `TUSS ${i.tuss} · ` : ''}
                    {i.quantidade} × {reais(i.unitario)}
                  </p>
                </div>
                <span className="tabular shrink-0 pt-0.5 font-medium">{reais(i.total)}</span>
                {acoesItem && <span className="flex basis-full justify-end @md:basis-auto">{acoesItem(i)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-4 flex items-baseline justify-between border-t border-foreground pt-4">
        <span className="rotulo whitespace-nowrap">Total</span>
        <Dinheiro centavos={total} className="text-3xl text-foreground" />
      </footer>
    </article>
  );
}

function Bloco({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="rotulo">{rotulo}</dt>
      <dd className="mt-1 leading-snug">{children}</dd>
    </div>
  );
}
