import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { Segmentado } from '@/components/segmentado';
import { ApiError, get, mensagemDeErro } from '@/lib/api';
import { dataHora } from '@/lib/format';

type Registro = {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  companyId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadataJson: unknown;
  createdAt: string;
};

const ACOES: Record<string, string> = {
  LOGIN_SUCCESS: 'Entrou',
  LOGIN_FAILURE: 'Falha de login',
  PATIENT_CREATED: 'Paciente cadastrado',
  PATIENT_UPDATED: 'Paciente alterado',
  PROFESSIONAL_CREATED: 'Profissional cadastrado',
  PROFESSIONAL_UPDATED: 'Profissional alterado',
  SERVICE_CREATED: 'Serviço cadastrado',
  SERVICE_UPDATED: 'Serviço alterado',
  FISCAL_CONFIG_UPDATED: 'Configuração fiscal alterada',
  TEMPLATE_CREATED: 'Modelo criado',
  TEMPLATE_UPDATED: 'Modelo alterado',
  INVOICE_CREATED: 'Nota criada',
  INVOICE_DELETED: 'Rascunho apagado',
  INVOICE_UPDATED: 'Nota alterada',
  INVOICE_ITEM_ADDED: 'Serviço adicionado à nota',
  INVOICE_ITEM_UPDATED: 'Serviço da nota alterado',
  INVOICE_ITEM_REMOVED: 'Serviço removido da nota',
  INVOICE_SUBMITTED: 'Nota enviada',
  INVOICE_PROCESSING: 'Nota em processamento',
  INVOICE_AUTHORIZED: 'Nota emitida',
  INVOICE_REJECTED: 'Nota recusada',
  INVOICE_CANCEL_REQUESTED: 'Cancelamento pedido',
  INVOICE_CANCELLED: 'Nota cancelada',
  INVOICE_CANCEL_FAILED: 'Cancelamento recusado',
  INVOICE_PAYMENTS_UPDATED: 'Pagamento da nota alterado',
  REPORT_EXPORTED: 'Relatório exportado',
  PRODUCTION_ENABLED: 'Produção ligada',
  PRODUCTION_DISABLED: 'Produção desligada',
};

const ENTIDADES: Record<string, string> = {
  Invoice: 'Nota',
  Patient: 'Paciente',
  Professional: 'Profissional',
  ServiceTemplate: 'Serviço',
  InvoiceTemplate: 'Modelo',
  Company: 'Empresa',
  User: 'Usuário',
  FiscalConfig: 'Configuração fiscal',
  CompanyServiceFiscalConfig: 'Configuração fiscal',
  Report: 'Relatório',
};

const FILTROS = {
  tudo: { rotulo: 'Tudo', prefixos: [] as string[] },
  notas: { rotulo: 'Notas', prefixos: ['INVOICE_'] },
  cadastros: { rotulo: 'Cadastros', prefixos: ['PATIENT_', 'PROFESSIONAL_', 'SERVICE_', 'TEMPLATE_', 'FISCAL_CONFIG_'] },
  acesso: { rotulo: 'Acesso', prefixos: ['LOGIN_', 'PRODUCTION_', 'REPORT_'] },
} as const;
type Filtro = keyof typeof FILTROS;

const rotuloDaAcao = (a: string) => ACOES[a] ?? a;

async function buscar(): Promise<Registro[] | 'negado'> {
  try {
    return await get<Registro[]>('/api/audit?limit=200');
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return 'negado';
    throw e;
  }
}

function Onde({ r }: { r: Registro }) {
  if (r.entityType === 'Invoice' && r.entityId)
    return (
      <Link to={`/notas/${r.entityId}`} className="text-brand underline-offset-4 hover:underline">
        ver nota
      </Link>
    );
  return <>{ENTIDADES[r.entityType] ?? r.entityType}</>;
}

export function Auditoria() {
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const q = useQuery({ queryKey: ['auditoria'], queryFn: buscar, retry: false });
  const [avisado, setAvisado] = useState<unknown>(null);
  if (q.isError && avisado !== q.error) {
    setAvisado(q.error);
    toast.error(mensagemDeErro(q.error));
  }

  const lista = q.data && q.data !== 'negado' ? q.data.filter((r) => FILTROS[filtro].prefixos.length === 0 || FILTROS[filtro].prefixos.some((p) => r.action.startsWith(p))) : [];

  return (
    <>
      <PageHeader titulo="Auditoria" descricao="O rastro do que foi feito no sistema: quem, quando e o quê. Só leitura; os 200 registros mais recentes." />
      {q.data === 'negado' ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Seu perfil não vê a auditoria.</p>
      ) : (
        <>
          <Segmentado
            rotulo="Tipo de registro"
            nome="auditoria"
            valor={filtro}
            opcoes={(Object.keys(FILTROS) as Filtro[]).map((k) => ({ valor: k, rotulo: FILTROS[k].rotulo }))}
            onChange={(v) => setFiltro(v as Filtro)}
            className="mb-4"
          />
          {q.isPending ? (
            <Skeleton className="h-48" />
          ) : q.isError ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-destructive">Não foi possível carregar a auditoria. Tente de novo em instantes.</p>
          ) : lista.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nada registrado neste filtro. Escolha "Tudo" para ver todos os registros.</p>
          ) : (
            <>
              <ul className="divide-y rounded-xl border bg-card sm:hidden">
                {lista.map((r) => (
                  <li key={r.id} className="px-4 py-3">
                    <p className="flex items-center justify-between gap-3 text-sm font-medium">
                      <span>{rotuloDaAcao(r.action)}</span>
                      <span className="shrink-0 text-xs font-normal">
                        <Onde r={r} />
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className="tabular">{dataHora(r.createdAt)}</span> · {r.userName ?? 'sistema'}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-xl border bg-card sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Quem</TableHead>
                      <TableHead>O quê</TableHead>
                      <TableHead>Onde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lista.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="tabular text-muted-foreground">{dataHora(r.createdAt)}</TableCell>
                        <TableCell>{r.userName ?? 'sistema'}</TableCell>
                        <TableCell className="font-medium">{rotuloDaAcao(r.action)}</TableCell>
                        <TableCell>
                          <Onde r={r} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
