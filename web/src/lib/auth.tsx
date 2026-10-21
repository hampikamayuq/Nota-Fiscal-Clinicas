import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post } from './api';
import type { Papel, Usuario } from './tipos';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => get<Usuario>('/api/auth/me'),
    retry: (n, e) => !(e instanceof ApiError && e.status === 401) && n < 2,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { email: string; senha: string }) => post<Usuario>('/api/auth/login', dados),
    onSuccess: (u) => qc.setQueryData(['me'], u),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post('/api/auth/logout'),
    onSuccess: () => qc.clear(),
  });
}

/** A mesma matriz do servidor (plano, §32); aqui só decide o que mostrar. */
export const PODE = {
  operarNotas: ['ADMIN', 'RECEPTION', 'FINANCE'],
  cadastrarPacientes: ['ADMIN', 'RECEPTION', 'FINANCE'],
  cadastrarProfissionaisEServicos: ['ADMIN', 'FINANCE'],
  cadastrarServicos: ['ADMIN', 'RECEPTION', 'FINANCE'],
  configFiscal: ['ADMIN', 'FINANCE'],
  cancelar: ['ADMIN', 'RECEPTION', 'FINANCE'],
  verAuditoria: ['ADMIN', 'FINANCE', 'AUDITOR'],
  exportar: ['ADMIN', 'RECEPTION', 'FINANCE'],
  producao: ['ADMIN'],
} as const satisfies Record<string, readonly Papel[]>;

export const pode = (u: Usuario | undefined, acao: keyof typeof PODE) => !!u && (PODE[acao] as readonly Papel[]).includes(u.role);

export const PAPEL: Record<Papel, string> = { ADMIN: 'Administração', RECEPTION: 'Recepção', FINANCE: 'Financeiro', AUDITOR: 'Auditoria' };
