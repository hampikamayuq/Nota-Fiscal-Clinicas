/** Ferramentas do MCP: cada uma é uma chamada GET à API, com o token de acesso. */
import { reaisBR } from '../app/invoices/invoice-rules.ts';
import type { Summary, Tally } from '../app/reports/summary.ts';

export type Deps = { baseUrl: string; token: string };
export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };
export type Ferramentas = {
  faturamentoMes(a: { mes?: string | undefined }): Promise<ToolResult>;
  relatorioNotas(a: { mes?: string | undefined; empresa?: string | undefined; pagamento?: string | undefined; situacao?: string | undefined }): Promise<ToolResult>;
  buscarNota(a: { numero?: string | undefined; paciente?: string | undefined; cpf?: string | undefined }): Promise<ToolResult>;
  notasComProblema(): Promise<ToolResult>;
  exportarRelatorio(a: { mes?: string | undefined; empresa?: string | undefined }): Promise<ToolResult>;
};

const texto = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });
const erro = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }], isError: true });
const json = (v: unknown): ToolResult => texto(JSON.stringify(v));

const query = (o: Record<string, string | undefined>): string => {
  const p = new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1]));
  return p.size ? `?${p}` : '';
};

export function resumoEmTexto(s: Summary): string {
  const [ano, mes] = s.month.split('-').map(Number) as [number, number];
  const nome = new Date(Date.UTC(ano, mes - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const titulo = nome.charAt(0).toUpperCase() + nome.slice(1);
  const [pa, pm] = s.previousMonth.split('-').map(Number) as [number, number];
  const anterior = new Date(Date.UTC(pa, pm - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
  const parte = (t: Tally) => `${reaisBR(t.cents)} em ${t.count === 1 ? '1 nota' : `${t.count} notas`}`;
  const empresas = s.companies.map((c) => `${c.name} ${parte(c.issued)}`).join('; ');
  return `${titulo}: ${empresas}; total ${reaisBR(s.total.issued.cents)} (${anterior}: ${reaisBR(s.total.previous.cents)}).`;
}

export function criarFerramentas(d: Deps): Ferramentas {
  type Chamada = { ok: true; res: Response } | { ok: false; res: ToolResult };
  const chamar = async (path: string, accept = 'application/json'): Promise<Chamada> => {
    let res: Response;
    try {
      res = await fetch(d.baseUrl + path, { headers: { authorization: `Bearer ${d.token}`, accept } });
    } catch (e) {
      return { ok: false, res: erro(`Não consegui falar com a API: ${e instanceof Error ? e.message : String(e)}`) };
    }
    if (res.ok) return { ok: true, res };
    const bruto = await res.text();
    let msg = bruto;
    try { msg = (JSON.parse(bruto) as { mensagem?: string }).mensagem ?? bruto; } catch { /* corpo não é JSON */ }
    if (res.status === 401) return { ok: false, res: erro('Token inválido ou revogado.') };
    if (res.status === 403) return { ok: false, res: erro(msg || 'Seu token não pode fazer isso.') };
    return { ok: false, res: erro(`Erro ${res.status}: ${msg}`) };
  };
  const obter = async <T>(path: string): Promise<{ ok: true; data: T } | { ok: false; res: ToolResult }> => {
    const c = await chamar(path);
    return c.ok ? { ok: true, data: (await c.res.json()) as T } : c;
  };

  type Empresa = { id: string; slug: string; legalName: string; tradeName: string | null };
  // Devolve o id da empresa (a API de relatórios filtra por `company` = uuid) ou o erro pronto.
  const resolverEmpresa = async (nome: string): Promise<{ id: string } | ToolResult> => {
    const r = await obter<Empresa[]>('/api/companies');
    if (!r.ok) return r.res;
    const n = nome.toLowerCase();
    const exata = r.data.find((c) => c.slug.toLowerCase() === n);
    if (exata) return { id: exata.id };
    const achadas = r.data.filter((c) => c.legalName.toLowerCase().includes(n) || (c.tradeName ?? '').toLowerCase().includes(n));
    if (achadas.length > 1) return erro(`"${nome}" combina com mais de uma empresa: ${achadas.map((c) => c.tradeName ?? c.legalName).join(', ')}. Use o slug.`);
    const achada = achadas[0];
    return achada ? { id: achada.id } : erro(`Empresa "${nome}" não encontrada. Empresas: ${r.data.map((c) => c.slug).join(', ')}.`);
  };
  const filtroEmpresa = async (empresa: string | undefined): Promise<{ company?: string } | ToolResult> => {
    if (!empresa) return {};
    const e = await resolverEmpresa(empresa);
    return 'id' in e ? { company: e.id } : e;
  };

  type Nota = { id: string; status: string; externalNumber?: string | null; companyId: string; patient?: { name?: string } | null; totalAmountCents: number; submittedAt?: string | null; payments?: unknown; lastErrorMessage?: string | null; lastAttemptError?: unknown };

  return {
    async faturamentoMes({ mes }) {
      const r = await obter<Summary>(`/api/invoices/summary${query({ month: mes })}`);
      return r.ok ? texto(`${resumoEmTexto(r.data)}\n\n${JSON.stringify(r.data)}`) : r.res;
    },
    async relatorioNotas({ mes, empresa, pagamento, situacao }) {
      const e = await filtroEmpresa(empresa);
      if ('content' in e) return e;
      const r = await obter<unknown>(`/api/reports/invoices${query({ month: mes, company: e.company, payment: pagamento, situation: situacao })}`);
      if (!r.ok) return r.res;
      // Enxuga: sem ids, links nem código de verificação, para caber no limite de saída do cliente.
      const rows = (r.data as { rows?: Record<string, unknown>[] }).rows?.map(({ id: _i, pdfUrl: _p, xmlUrl: _x, verificationCode: _v, company, ...resto }) => ({ ...resto, company: { name: (company as { name?: string } | undefined)?.name } }));
      return json({ ...(r.data as object), rows });
    },
    async buscarNota({ numero, paciente, cpf }) {
      const dados = [numero, paciente, cpf].filter(Boolean);
      if (dados.length !== 1) return erro('Informe exatamente um entre numero, paciente ou cpf.');
      const r = await obter<Nota[]>(`/api/invoices${query({ q: dados[0], limit: '20' })}`);
      if (!r.ok) return r.res;
      return json(r.data.map((n) => ({ id: n.id, status: n.status, externalNumber: n.externalNumber, companyId: n.companyId, patient: n.patient, totalAmountCents: n.totalAmountCents, submittedAt: n.submittedAt, payments: n.payments })));
    },
    async notasComProblema() {
      const r = await obter<Nota[]>(`/api/invoices${query({ status: 'REJECTED,CANCELLATION_ERROR', limit: '50' })}`);
      if (!r.ok) return r.res;
      const detalhes = await Promise.all(r.data.map(async (n) => {
        const d1 = await obter<Nota>(`/api/invoices/${n.id}`);
        return { id: n.id, status: n.status, patient: n.patient?.name, totalAmountCents: n.totalAmountCents, lastErrorMessage: n.lastErrorMessage, lastAttemptError: d1.ok ? d1.data.lastAttemptError : undefined };
      }));
      return json(detalhes);
    },
    async exportarRelatorio({ mes, empresa }) {
      const e = await filtroEmpresa(empresa);
      if ('content' in e) return e;
      const c = await chamar(`/api/reports/invoices.csv${query({ month: mes, company: e.company })}`, 'text/csv');
      if (!c.ok) return c.res;
      const nome = /filename="([^"]+)"/.exec(c.res.headers.get('content-disposition') ?? '')?.[1] ?? 'relatorio.csv';
      return texto(`Arquivo: ${nome}\n\n${await c.res.text()}`);
    },
  };
}
