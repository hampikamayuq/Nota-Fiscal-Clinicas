import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarFerramentas, resumoEmTexto } from '../src/mcp/tools.ts';

const resumo = { month: '2026-10', previousMonth: '2026-09', companies: [{ companyId: 'a', name: 'EXEMPLO', issued: { count: 41, cents: 1234500 }, cancelled: { count: 0, cents: 0 }, previous: { count: 38, cents: 1100000 } }], total: { issued: { count: 41, cents: 1234500 }, cancelled: { count: 0, cents: 0 }, previous: { count: 38, cents: 1100000 } }, today: { count: 0, cents: 0 }, processing: 0, errors: 0, open: 0 };
const fakeFetch = (respostas: Record<string, { status: number; body: string; headers?: Record<string, string> }>, chamadas: { url: string; auth?: string }[]): typeof fetch =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    chamadas.push({ url: u, auth: (init?.headers as Record<string, string> | undefined)?.authorization });
    const r = respostas[new URL(u).pathname + new URL(u).search] ?? { status: 404, body: '{"mensagem":"nada"}' };
    return new Response(r.body, { status: r.status, headers: r.headers ?? { 'content-type': 'application/json' } });
  }) as typeof fetch;
const ferramentas = (respostas: Parameters<typeof fakeFetch>[0], chamadas: Parameters<typeof fakeFetch>[1] = []) => {
  vi.stubGlobal('fetch', fakeFetch(respostas, chamadas));
  return criarFerramentas({ baseUrl: 'https://api.local', token: 'qf_x' });
};
afterEach(() => vi.unstubAllGlobals());

describe('ferramentas MCP', () => {
  it('faturamento_mes chama o resumo com o token e resume em português', async () => {
    const chamadas: { url: string; auth?: string }[] = [];
    const f = ferramentas({ '/api/invoices/summary?month=2026-10': { status: 200, body: JSON.stringify(resumo) } }, chamadas);
    const r = await f.faturamentoMes({ mes: '2026-10' });
    expect(chamadas[0]).toEqual({ url: 'https://api.local/api/invoices/summary?month=2026-10', auth: 'Bearer qf_x' });
    expect(r.isError).toBeUndefined();
    expect(r.content[0]!.text.startsWith('Outubro de 2026: EXEMPLO R$')).toBe(true);
    expect(resumoEmTexto(resumo)).toContain('em 41 notas');
    const um = { ...resumo, companies: [{ ...resumo.companies[0]!, issued: { count: 1, cents: 100 } }] };
    expect(resumoEmTexto(um)).toContain('em 1 nota;');
  });
  it('exportar_relatorio devolve o CSV com o nome do arquivo, e o 403 vira mensagem', async () => {
    const ok = ferramentas({ '/api/reports/invoices.csv?month=2026-10': { status: 200, body: '﻿Emissão;Número\r\n', headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="notas-2026-10.csv"' } } }, []);
    const r = await ok.exportarRelatorio({ mes: '2026-10' });
    expect(r.content[0]!.text.startsWith('Arquivo: notas-2026-10.csv')).toBe(true);
    const negado = ferramentas({ '/api/reports/invoices.csv?month=2026-10': { status: 403, body: '{"erro":"sem_permissao","mensagem":"Seu perfil não pode fazer isso."}' } }, []);
    const e = await negado.exportarRelatorio({ mes: '2026-10' });
    expect(e.isError).toBe(true);
    expect(e.content[0]!.text).toContain('não pode');
  });
  it('relatorio_notas resolve a empresa pelo nome e filtra pelo id; empresa desconhecida vira erro', async () => {
    const chamadas: { url: string; auth?: string }[] = [];
    const respostas = {
      '/api/companies': { status: 200, body: JSON.stringify([{ id: 'u-1', slug: 'exemplo', legalName: 'EXEMPLO Clínica LTDA', tradeName: 'EXEMPLO' }]) },
      '/api/reports/invoices?month=2026-10&company=u-1': { status: 200, body: '{"rows":[]}' },
    };
    const f = ferramentas(respostas, chamadas);
    const r = await f.relatorioNotas({ mes: '2026-10', empresa: 'exemplo' });
    expect(r.isError).toBeUndefined();
    expect(chamadas[1]!.url).toBe('https://api.local/api/reports/invoices?month=2026-10&company=u-1');
    const e = await f.relatorioNotas({ empresa: 'zzz' });
    expect(e.isError).toBe(true);
    expect(e.content[0]!.text).toContain('Empresas: exemplo.');
  });
  it('relatorio_notas enxuga as linhas; nome ambíguo de empresa vira erro listando os nomes', async () => {
    const respostas = {
      '/api/companies': { status: 200, body: JSON.stringify([{ id: 'u-1', slug: 'a', legalName: 'EXEMPLO Norte LTDA', tradeName: null }, { id: 'u-2', slug: 'b', legalName: 'EXEMPLO Sul LTDA', tradeName: null }]) },
      '/api/reports/invoices?month=2026-10': { status: 200, body: JSON.stringify({ rows: [{ id: 'x', pdfUrl: 'p', xmlUrl: 'x', verificationCode: 'v', number: '1', company: { id: 'u-1', slug: 'a', name: 'A' } }], totals: {} }) },
    };
    const f = ferramentas(respostas, []);
    const e = await f.relatorioNotas({ empresa: 'exemplo' });
    expect(e.isError).toBe(true);
    expect(e.content[0]!.text).toContain('EXEMPLO Norte LTDA, EXEMPLO Sul LTDA');
    const r = await f.relatorioNotas({ mes: '2026-10' });
    expect(r.content[0]!.text).toBe('{"rows":[{"number":"1","company":{"name":"A"}}],"totals":{}}');
  });
});
