/** Servidor MCP (stdio, somente leitura). Nada no stdout além do protocolo. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MONTH_RE } from '../app/invoices/period.ts';
import { PAYMENT_METHODS } from '../app/invoices/invoice-rules.ts';
import { criarFerramentas } from './tools.ts';

const baseUrl = process.env.FISCAL_API_URL;
const token = process.env.FISCAL_API_TOKEN;
if (!baseUrl || !token) {
  console.error('Defina FISCAL_API_URL e FISCAL_API_TOKEN.');
  process.exit(2);
}
const f = criarFerramentas({ baseUrl: baseUrl.replace(/\/+$/, ''), token });

const mes = z.string().regex(MONTH_RE).optional().describe('Mês AAAA-MM; padrão: o corrente');
const empresa = z.string().optional().describe('Slug ou nome da empresa; padrão: todas');

const server = new McpServer({ name: 'clinica-fiscal', version: '0.1.0' });
server.registerTool('faturamento_mes', {
  title: 'Faturamento do mês',
  description: 'Devolve o faturamento do mês por empresa (notas válidas no fisco, canceladas e comparação com o mês anterior). O campo `cancelled` conta notas canceladas no mês (por data de cancelamento). Somente leitura.',
  inputSchema: { mes },
}, (a) => f.faturamentoMes(a));
server.registerTool('relatorio_notas', {
  title: 'Relatório de notas',
  description: 'Lista as notas do mês com forma de pagamento e totais, com filtros opcionais. O campo `cancelled` dos totais conta notas emitidas no mês que depois foram canceladas. Somente leitura.',
  inputSchema: {
    mes,
    empresa,
    pagamento: z.enum([...PAYMENT_METHODS, 'none']).optional().describe('Forma de pagamento; "none" = sem pagamento informado'),
    situacao: z.enum(['issued', 'cancelled', 'all']).optional().describe('Situação das notas; padrão: all'),
  },
}, (a) => f.relatorioNotas(a));
server.registerTool('buscar_nota', {
  title: 'Buscar nota',
  description: 'Busca notas por número, nome do paciente ou CPF (informe exatamente um). Devolve até 20 notas. Somente leitura.',
  inputSchema: {
    numero: z.string().optional().describe('Número da nota'),
    paciente: z.string().optional().describe('Nome do paciente'),
    cpf: z.string().optional().describe('CPF do paciente'),
  },
}, (a) => f.buscarNota(a));
server.registerTool('notas_com_problema', {
  title: 'Notas com problema',
  description: 'Lista notas rejeitadas ou com erro de cancelamento, com a mensagem do último erro. Somente leitura.',
  inputSchema: {},
}, () => f.notasComProblema());
server.registerTool('exportar_relatorio', {
  title: 'Exportar relatório (CSV)',
  description: 'Devolve o relatório de notas do mês em CSV, com o nome do arquivo. Somente leitura.',
  inputSchema: { mes, empresa },
}, (a) => f.exportarRelatorio(a));

await server.connect(new StdioServerTransport());
