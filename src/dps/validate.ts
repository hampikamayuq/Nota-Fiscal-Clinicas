/**
 * Validações locais que valem para qualquer provedor: documentos (CPF/CNPJ) e a
 * regra de LGPD na descrição — a API fiscal **aceitaria** dado de saúde, e é
 * justamente por isso que ela precisa morar aqui.
 */

// ─── Documentos ──────────────────────────────────────────────────────────────

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (ate: number): number => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

export function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (ate: number): number => {
    let peso = ate - 7;
    let soma = 0;
    for (let i = 0; i < ate; i++) {
      soma += Number(cnpj[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(cnpj[12]) && digito(13) === Number(cnpj[13]);
}

// ─── LGPD ────────────────────────────────────────────────────────────────────

/**
 * Termos que não podem aparecer na descrição do serviço.
 *
 * O `xDescServ` viaja para o fisco, entra no XML que fica guardado por anos e
 * chega ao paciente por e-mail. Dado de saúde é dado pessoal sensível: uma nota
 * fiscal que diz o que a pessoa tem é um vazamento com carimbo oficial.
 *
 * A lista é curta de propósito. Ela não tenta adivinhar toda a medicina — pega
 * as formas mais prováveis de alguém, com boa intenção, "detalhar o serviço".
 */
const TERMOS_SENSIVEIS = [
  'diagnostico',
  'cid-10',
  'cid10',
  'biopsia',
  'patologia',
  'sorologia',
  'hiv',
  'oncolog',
  'psiquiatr',
  'psicoterap',
  'gravidez',
  'gestante',
  'aborto',
  'toxicolog',
  'tumor',
  'cancer',
  'lesao',
];

/**
 * Compara sem acento e sem caixa: "psiquiátrico" e "psiquiatrico" são a mesma
 * palavra para o paciente cujo dado vazaria, então precisam ser a mesma para
 * este filtro. Por isso a lista acima é escrita sem acentos.
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Código CID-10: letra + 2 dígitos, opcionalmente .dígito (ex.: J45, E11.9). */
const PADRAO_CID = /\b[A-TV-Z]\d{2}(\.\d)?\b/;

export function descricaoSensivel(descricao: string): string | null {
  const normalizada = normalizar(descricao);
  for (const termo of TERMOS_SENSIVEIS) {
    if (normalizada.includes(termo)) return termo;
  }
  const cid = PADRAO_CID.exec(normalizar(descricao).toUpperCase());
  return cid ? `código CID (${cid[0]})` : null;
}
