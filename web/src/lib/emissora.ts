/** Rótulos dos códigos do leiaute nacional que o assistente de empresa pergunta e a tela Empresas resume. */
export const SIMPLES = [
  ['3', 'Simples Nacional (ME ou EPP)'],
  ['2', 'MEI'],
  ['1', 'Não optante (lucro presumido ou real)'],
] as const;
export const REG_SN = [
  ['1', 'Tudo pelo Simples (DAS)'],
  ['2', 'ISS fora do Simples'],
  ['3', 'ISS e federais fora (sublimite)'],
] as const;
export const REG_ESP = [
  ['0', 'Nenhum'],
  ['6', 'Sociedade de profissionais'],
  ['5', 'Profissional autônomo'],
  ['2', 'Estimativa'],
  ['3', 'Microempresa municipal'],
  ['1', 'Ato cooperado'],
  ['4', 'Notário ou registrador'],
  ['9', 'Outros'],
] as const;
export const TRIBUTACAO = [
  ['1', 'Operação tributável'],
  ['2', 'Imunidade'],
  ['3', 'Exportação de serviço'],
  ['4', 'Não incidência'],
] as const;
export const RETENCAO = [
  ['1', 'Não retido'],
  ['2', 'Retido pelo tomador'],
  ['3', 'Retido pelo intermediário'],
] as const;
export const PIS_RET = [
  ['0', 'Não retidos'],
  ['1', 'Retidos'],
] as const;
export const IBS_DEST = [
  ['0', 'O próprio paciente (consulta, procedimento)'],
  ['1', 'Outra pessoa'],
] as const;
/** Sugestões da LC 116 (item + subitem + 01). O contador confirma o código e, onde a prefeitura exige, o complemento municipal. */
export const CODIGOS = [
  ['040101', 'Medicina e biomedicina'],
  ['041201', 'Odontologia'],
  ['041601', 'Psicologia'],
  ['040801', 'Fisioterapia, fonoaudiologia e terapia ocupacional'],
  ['041001', 'Nutrição'],
  ['040501', 'Acupuntura'],
  ['040601', 'Enfermagem'],
  ['040201', 'Análises clínicas e diagnóstico por imagem'],
  ['040301', 'Hospitais, clínicas e laboratórios'],
  ['060201', 'Estética e tratamento de pele'],
] as const;

export const rotulo = (opcoes: readonly (readonly [string, string])[], v: string | undefined) => opcoes.find(([c]) => c === v)?.[1] ?? v ?? '—';
export const variavelToken = (slug: string, ambiente: 'PRODUCAO' | 'HOMOLOGACAO' = 'PRODUCAO') => `FOCUS_TOKEN_${ambiente}_${slug.toUpperCase().replace(/-/g, '_')}`;
