import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, patch, post, put } from './api';
import type { Descricao, Emissora, Empresa, FormaPagamento, Modelo, Nota, Paciente, Profissional, Relatorio, Resumo, Servico, Situacao, Tendencia } from './tipos';

/** Nome da clínica (CLINIC_NAME no servidor). Público: a tela de login usa. */
export const useMarca = () => useQuery({ queryKey: ['marca'], queryFn: () => get<{ clinicName: string }>('/api/branding'), staleTime: Infinity });

export const useEmpresas = () => useQuery({ queryKey: ['empresas'], queryFn: () => get<Empresa[]>('/api/companies'), staleTime: 10 * 60 * 1000 });

export const usePacientes = (q: string, todos = false) =>
  useQuery({
    queryKey: ['pacientes', q, todos],
    queryFn: () => get<Paciente[]>(`/api/patients?${new URLSearchParams({ ...(q ? { q } : {}), ...(todos ? { todos: '1' } : {}) })}`),
    placeholderData: (anterior) => anterior,
  });

/** Um paciente pelo id (o `?paciente=` de "Nova nota para este paciente"). */
export const usePaciente = (id: string | null) =>
  useQuery({ queryKey: ['paciente', id], queryFn: () => get<Paciente>(`/api/patients/${id}`), enabled: !!id, retry: false });

export const useProfissionais = (todos = false) =>
  useQuery({ queryKey: ['profissionais', todos], queryFn: () => get<Profissional[]>(`/api/professionals${todos ? '?todos=1' : ''}`) });

/** `undefined` = todos os serviços; `null` = "ainda não há empresa", nada é buscado. */
export const useServicos = (companyId: string | null | undefined, todos = false) =>
  useQuery({
    queryKey: ['servicos', companyId ?? null, todos],
    queryFn: () => get<Servico[]>(`/api/services?${new URLSearchParams({ ...(companyId ? { company: companyId } : {}), ...(todos ? { todos: '1' } : {}) })}`),
    enabled: companyId !== null,
  });

/** `q`: nome, CPF (com ou sem máscara) ou número da nota; vazio não vai à URL. */
export type FiltroNotas = { company?: string; status?: string; patient?: string; q?: string; limit?: number };
export const useNotas = (f: FiltroNotas = {}) =>
  useQuery({
    queryKey: ['notas', f],
    queryFn: () => get<Nota[]>(`/api/invoices?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])))}`),
  });

export const useResumo = (mes?: string) =>
  useQuery({ queryKey: ['resumo', mes ?? null], queryFn: () => get<Resumo>(`/api/invoices/summary${mes ? `?month=${mes}` : ''}`), placeholderData: (anterior) => anterior });

export type FiltroRelatorio = { month: string; company?: string; payment?: FormaPagamento | 'none'; situation?: Situacao };
const paramsRelatorio = (f: FiltroRelatorio) => new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined && v !== '') as [string, string][]);
export const useRelatorio = (f: FiltroRelatorio) =>
  useQuery({ queryKey: ['relatorio', f], queryFn: () => get<Relatorio>(`/api/reports/invoices?${paramsRelatorio(f)}`), placeholderData: (anterior) => anterior });
export const urlCsv = (f: FiltroRelatorio): string => `/api/reports/invoices.csv?${paramsRelatorio(f)}`;
/** A janela de 12 meses termina no mês do filtro. */
export const useTendencia = (until: string) =>
  useQuery({ queryKey: ['tendencia', until], queryFn: () => get<Tendencia>(`/api/reports/trend?until=${until}`), placeholderData: (anterior) => anterior });

export const useNota = (id: string | undefined) =>
  useQuery({ queryKey: ['nota', id], queryFn: () => get<Nota>(`/api/invoices/${id}`), enabled: !!id });

/** A descrição que iria ao fisco agora. A chave leva `versao` (updatedAt da nota) para acompanhar cada mudança de item. */
export const useDescricao = (id: string | undefined, versao: string | undefined, ativa: boolean) =>
  useQuery({ queryKey: ['descricao', id, versao], queryFn: () => get<Descricao>(`/api/invoices/${id}/description`), enabled: !!id && ativa, retry: false });

/** Dados da emissora de uma empresa (só ADMIN/FINANCE); null = ainda não configurada. */
export const useEmissora = (companyId: string, ativo: boolean) =>
  useQuery({ queryKey: ['emissora', companyId], queryFn: () => get<Emissora | null>(`/api/companies/${companyId}/emitter`), enabled: ativo });

export const useModelos = () => useQuery({ queryKey: ['modelos'], queryFn: () => get<Modelo[]>('/api/templates') });

/** Mutations invalidam o que muda; a nota aberta recebe o retorno direto, sem segunda ida. */
export function useMutacoes() {
  const qc = useQueryClient();
  const invalidar = (...chaves: string[]) => Promise.all(chaves.map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const guardarNota = (n: Nota) => {
    qc.setQueryData(['nota', n.id], (atual: Nota | undefined) => ({ ...atual, ...n }));
    // O retorno das mutations não traz histórico nem paciente: relê a nota completa em segundo plano.
    void qc.invalidateQueries({ queryKey: ['nota', n.id] });
    void invalidar('notas', 'resumo', 'relatorio');
  };
  return {
    criarPaciente: useMutation({ mutationFn: (d: Partial<Paciente>) => post<Paciente>('/api/patients', d), onSuccess: () => invalidar('pacientes') }),
    editarPaciente: useMutation({ mutationFn: ({ id, ...d }: Partial<Paciente> & { id: string }) => patch<Paciente>(`/api/patients/${id}`, d), onSuccess: () => invalidar('pacientes') }),
    criarProfissional: useMutation({ mutationFn: (d: Partial<Profissional>) => post<Profissional>('/api/professionals', d), onSuccess: () => invalidar('profissionais') }),
    editarProfissional: useMutation({ mutationFn: ({ id, ...d }: Partial<Profissional> & { id: string }) => patch<Profissional>(`/api/professionals/${id}`, d), onSuccess: () => invalidar('profissionais') }),
    criarServico: useMutation({ mutationFn: (d: Partial<Servico>) => post<Servico>('/api/services', d), onSuccess: () => invalidar('servicos') }),
    editarServico: useMutation({ mutationFn: ({ id, ...d }: Partial<Servico> & { id: string }) => patch<Servico>(`/api/services/${id}`, d), onSuccess: () => invalidar('servicos') }),
    salvarConfigFiscal: useMutation({
      mutationFn: ({ companyId, serviceId, ...d }: { companyId: string; serviceId: string } & Record<string, unknown>) =>
        put(`/api/companies/${companyId}/services/${serviceId}/fiscal-config`, d),
      onSuccess: () => invalidar('servicos'),
    }),
    voltarAoPadrao: useMutation({
      mutationFn: ({ companyId, serviceId }: { companyId: string; serviceId: string }) => del(`/api/companies/${companyId}/services/${serviceId}/fiscal-config`),
      onSuccess: () => invalidar('servicos'),
    }),
    mudarProducao: useMutation({
      mutationFn: ({ companyId, ...d }: { companyId: string; enabled: boolean; cnpj: string }) => post(`/api/companies/${companyId}/production`, d),
      onSuccess: () => invalidar('empresas'),
    }),
    criarEmpresa: useMutation({ mutationFn: (d: Emissora & { slug: string }) => post<Empresa>('/api/companies', d), onSuccess: () => invalidar('empresas', 'servicos') }),
    salvarEmissora: useMutation({
      mutationFn: ({ companyId, ...d }: { companyId: string } & Emissora) => put<Empresa>(`/api/companies/${companyId}/emitter`, d),
      onSuccess: () => invalidar('empresas', 'emissora', 'servicos'),
    }),
    criarNota: useMutation({
      mutationFn: (d: { companyId: string; patientId: string; professionalId: string; internalReference?: string; competenceDate?: string }) => post<Nota>('/api/invoices', d),
      onSuccess: guardarNota,
    }),
    editarNota: useMutation({ mutationFn: ({ id, ...d }: { id: string } & Record<string, unknown>) => patch<Nota>(`/api/invoices/${id}`, d), onSuccess: guardarNota }),
    mudarStatus: useMutation({ mutationFn: ({ id, status }: { id: string; status: 'DRAFT' | 'READY' }) => post<Nota>(`/api/invoices/${id}/status`, { status }), onSuccess: guardarNota }),
    adicionarItem: useMutation({ mutationFn: ({ id, ...d }: { id: string; serviceTemplateId: string } & Record<string, unknown>) => post<Nota>(`/api/invoices/${id}/items`, d), onSuccess: guardarNota }),
    editarItem: useMutation({ mutationFn: ({ id, itemId, ...d }: { id: string; itemId: string } & Record<string, unknown>) => patch<Nota>(`/api/invoices/${id}/items/${itemId}`, d), onSuccess: guardarNota }),
    aplicarModelo: useMutation({ mutationFn: ({ id, templateId }: { id: string; templateId: string }) => post<Nota>(`/api/invoices/${id}/apply-template`, { templateId }), onSuccess: guardarNota }),
    emitir: useMutation({ mutationFn: (id: string) => post<Nota>(`/api/invoices/${id}/issue`), onSettled: (_d, _e, id) => void qc.invalidateQueries({ queryKey: ['nota', id] }), onSuccess: guardarNota }),
    sincronizar: useMutation({ mutationFn: (id: string) => post<Nota>(`/api/invoices/${id}/sync`), onSuccess: guardarNota }),
    cancelar: useMutation({
      mutationFn: ({ id, ...d }: { id: string; reasonCode: '1' | '2' | '9'; justification: string; confirmation: string }) => post<Nota>(`/api/invoices/${id}/cancel`, d),
      onSuccess: guardarNota,
    }),
    salvarPagamentos: useMutation({
      mutationFn: ({ id, payments }: { id: string; payments: { method: FormaPagamento; amountCents: number }[] }) => put<Nota>(`/api/invoices/${id}/payments`, { payments }),
      onSuccess: guardarNota,
    }),
    removerItem: useMutation({ mutationFn: ({ id, itemId }: { id: string; itemId: string }) => del<Nota>(`/api/invoices/${id}/items/${itemId}`), onSuccess: guardarNota }),
    apagarNota: useMutation({
      mutationFn: (id: string) => del(`/api/invoices/${id}`),
      onSuccess: (_r, id) => {
        qc.removeQueries({ queryKey: ['nota', id] });
        void invalidar('notas', 'resumo');
      },
    }),
  };
}
