/**
 * Descrição fiscal final da nota de serviço de saúde (apta a reembolso de plano
 * de saúde) e conferência de uma descrição editada à mão. Módulo puro.
 */
import { descricaoSensivel } from '../../dps/validate.ts';
import { InvoiceRuleError } from './invoice-rules.ts';

export type DescriptionItem = { name: string; description: string; tussCode: string | null; quantity: number; unitAmountCents: number; totalAmountCents: number };
export type DescriptionProfessional = { name: string; council: string; crmNumber: string; crmState: string; rqe: string | null; specialty: string | null };
export type DescriptionInput = {
  items: readonly DescriptionItem[];
  professional: DescriptionProfessional;
  totalAmountCents: number;
  /** Nome e descrição padrão dos serviços no catálogo: só esse texto é isento do filtro de dado sensível. */
  catalog?: readonly string[];
};

export const MAX_DESCRIPTION_LENGTH = 2000; // limite do xDescServ na DPS nacional

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
// O Intl emite espaço não separável após "R$"; a descrição usa espaço comum.
const money = (cents: number): string => brl.format(cents / 100).replace(/ /g, ' ');

function itemBlock(item: DescriptionItem): string {
  const lines = [item.description || item.name];
  if (item.tussCode) lines.push(`Código TUSS: ${item.tussCode}`);
  lines.push(
    item.quantity > 1
      ? `Valor: ${item.quantity} x ${money(item.unitAmountCents)} = ${money(item.totalAmountCents)}`
      : `Valor: ${money(item.totalAmountCents)}`,
  );
  return lines.join('\n');
}

export function buildInvoiceDescription(input: DescriptionInput): string {
  if (input.items.length === 0) throw new InvoiceRuleError('A nota precisa de ao menos um item para gerar a descrição.');
  const p = input.professional;
  const professional = [
    'Profissional responsável:',
    p.name,
    `${p.council}-${p.crmState} ${p.crmNumber}`,
    ...(p.rqe ? [`RQE ${p.rqe}`] : []),
  ].join('\n');
  const text = [
    ...input.items.map(itemBlock),
    professional,
    `Valor total dos serviços: ${money(input.totalAmountCents)}`,
  ].join('\n\n');
  if (text.length > MAX_DESCRIPTION_LENGTH) {
    throw new InvoiceRuleError(
      `A descrição gerada tem ${text.length - MAX_DESCRIPTION_LENGTH} caracteres a mais que o limite de ${MAX_DESCRIPTION_LENGTH}.`,
    );
  }
  return text;
}

export type DescriptionCheck = { blocking: string[]; warnings: string[] };

export function checkInvoiceDescription(text: string, input: DescriptionInput): DescriptionCheck {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (text.trim() === '') blocking.push('A descrição não pode ficar vazia.');
  if (text.length > MAX_DESCRIPTION_LENGTH) {
    blocking.push(`A descrição tem ${text.length - MAX_DESCRIPTION_LENGTH} caracteres a mais que o limite de ${MAX_DESCRIPTION_LENGTH}.`);
  }
  // O texto do catálogo é o que o reembolso exige (ex.: "Biópsia de pele") e fica
  // isento; o que foi digitado no item ou na descrição final passa pelo filtro.
  const semCatalogo = [...(input.catalog ?? [])]
    .sort((a, b) => b.length - a.length)
    .reduce((t, trecho) => (trecho ? t.split(trecho).join(' ') : t), text);
  const sensivel = descricaoSensivel(semCatalogo);
  if (sensivel) blocking.push(`A descrição contém dado sensível de saúde ("${sensivel}"); ela é pública e vai para o paciente.`);

  for (const item of input.items) {
    if (item.tussCode && !text.includes(item.tussCode)) warnings.push(`O código TUSS ${item.tussCode} (${item.name}) não aparece mais na descrição.`);
  }
  if (!text.includes(input.professional.crmNumber)) warnings.push(`O ${input.professional.council} ${input.professional.crmNumber} do profissional não aparece mais na descrição.`);
  for (const rqe of (input.professional.rqe ?? '').split(',').map((r) => r.trim()).filter(Boolean)) {
    if (!text.includes(rqe)) warnings.push(`O RQE ${rqe} não aparece mais na descrição.`);
  }
  const total = money(input.totalAmountCents);
  if (!text.includes(total)) warnings.push(`O valor total ${total} não aparece mais na descrição.`);
  return { blocking, warnings };
}
