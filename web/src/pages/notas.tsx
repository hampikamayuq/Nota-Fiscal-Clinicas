import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { Segmentado } from '@/components/segmentado';
import { TabelaNotas } from '@/pages/dashboard';
import { mensagemDeErro } from '@/lib/api';
import { useEmpresas, useNotas } from '@/lib/queries';
import { useDebounce } from '@/lib/use-debounce';
import type { StatusNota } from '@/lib/tipos';

const FILTROS: { valor: string; rotulo: string; status?: StatusNota[] }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'rascunho', rotulo: 'Rascunhos', status: ['DRAFT', 'READY'] },
  { valor: 'andamento', rotulo: 'Em andamento', status: ['SUBMITTING', 'PROCESSING', 'CANCELLATION_REQUESTED'] },
  { valor: 'emitidas', rotulo: 'Emitidas', status: ['AUTHORIZED'] },
  { valor: 'erro', rotulo: 'Com erro', status: ['REJECTED', 'CANCELLATION_ERROR'] },
  { valor: 'canceladas', rotulo: 'Canceladas', status: ['CANCELLED'] },
];

/** Filtro e empresa vivem na URL (a home aponta para `?filtro=erro`); a busca é local e vai ao servidor com atraso. */
export function Notas() {
  const [params, setParams] = useSearchParams();
  const empresas = useEmpresas();
  const filtroUrl = params.get('filtro') ?? 'todas';
  const filtro = FILTROS.some((f) => f.valor === filtroUrl) ? filtroUrl : 'todas';
  const empresaUrl = params.get('empresa') ?? 'todas';
  const empresa = empresas.data?.some((e) => e.id === empresaUrl) ? empresaUrl : 'todas';
  const [q, setQ] = useState('');
  const busca = useDebounce(q.trim(), 250);
  const mudar = (chave: string, valor: string) =>
    setParams(
      (p) => {
        const novo = new URLSearchParams(p);
        if (valor && valor !== 'todas') novo.set(chave, valor);
        else novo.delete(chave);
        return novo;
      },
      { replace: true },
    );

  const status = FILTROS.find((f) => f.valor === filtro)?.status;
  // A situação filtra no servidor: no navegador ela só valeria sobre as 200 mais novas.
  const notas = useNotas({ limit: 200, ...(status ? { status: status.join(',') } : {}), ...(empresa !== 'todas' ? { company: empresa } : {}), ...(busca ? { q: busca } : {}) });
  const lista = notas.data ?? [];
  const nomeEmpresa = (id: string) => empresas.data?.find((e) => e.id === id)?.tradeName ?? empresas.data?.find((e) => e.id === id)?.legalName ?? '…';

  return (
    <>
      <PageHeader titulo="Notas" />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Paciente, CPF ou número" aria-label="Buscar nota" className="h-9 pl-8" />
      </div>
      <div className="-mx-4 mb-4 flex items-center gap-3 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Segmentado rotulo="Situação" nome="filtro" valor={filtro} opcoes={FILTROS} onChange={(v) => mudar('filtro', v)} />
        {(empresas.data?.length ?? 0) > 1 && (
          <Segmentado
            rotulo="Empresa"
            nome="empresa"
            valor={empresa}
            opcoes={[{ valor: 'todas', rotulo: 'Ambas as empresas' }, ...(empresas.data ?? []).map((e) => ({ valor: e.id, rotulo: e.tradeName ?? e.legalName }))]}
            onChange={(v) => mudar('empresa', v)}
          />
        )}
      </div>
      <TabelaNotas notas={lista} carregando={notas.isPending} erro={notas.isError ? mensagemDeErro(notas.error) : undefined} nomeEmpresa={nomeEmpresa} vazio={busca ? `Nenhuma nota com "${busca}".` : undefined} />
    </>
  );
}
