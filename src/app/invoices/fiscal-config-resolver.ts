/**
 * Qual configuração fiscal vale para um serviço numa empresa.
 *
 *   exceção do serviço ativa  → ela ('service')
 *   exceção do serviço inativa → nenhuma: o serviço foi excluído nesta empresa
 *   sem exceção               → o padrão da empresa, se ativo ('company')
 *   nada disso                → nenhuma: indisponível
 */

import type { CompanyFiscalDefault, CompanyServiceFiscalConfig, Prisma, PrismaClient } from '../../generated/prisma/client.ts';

export type FiscalSource = 'service' | 'company';
export type FiscalRow = CompanyServiceFiscalConfig | CompanyFiscalDefault;
export type EffectiveFiscal = { config: FiscalRow; source: FiscalSource };

type Db = PrismaClient | Prisma.TransactionClient;

export function pickFiscal(specific: CompanyServiceFiscalConfig | null | undefined, fallback: CompanyFiscalDefault | null | undefined): EffectiveFiscal | null {
  if (specific) return specific.active ? { config: specific, source: 'service' } : null;
  return fallback?.active ? { config: fallback, source: 'company' } : null;
}

export async function resolveFiscalConfig(db: Db, companyId: string, serviceTemplateId: string): Promise<EffectiveFiscal | null> {
  const [specific, fallback] = await Promise.all([
    db.companyServiceFiscalConfig.findUnique({ where: { companyId_serviceTemplateId: { companyId, serviceTemplateId } } }),
    db.companyFiscalDefault.findUnique({ where: { companyId } }),
  ]);
  return pickFiscal(specific, fallback);
}
