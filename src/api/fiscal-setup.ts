/**
 * Qual provedor fiscal este servidor usa, e com que dados da emissora.
 *
 * A escolha é explícita (FISCAL_PROVIDER) e vale para todas as empresas; não
 * existe troca automática entre provedores. Produção só acontece com as três
 * travas ao mesmo tempo (plano, §39): FOCUS_ENV=production,
 * ALLOW_PRODUCTION_EMISSION=true e Company.productionEnabled.
 */

import { join } from 'node:path';
import { ConfigError, carregarConfigFiscal, validarConfigFiscal, type ConfigFiscal } from '../config.ts';
import type { EmissionDeps } from '../app/invoices/emission-service.ts';
import { InvoiceRuleError } from '../app/invoices/invoice-rules.ts';
import type { FiscalEmitter, InvoiceFiscalProvider } from '../fiscal/invoice-provider.ts';
import { FakeFiscalProvider } from '../fiscal/providers/fake/fake.provider.ts';
import { FocusClient } from '../fiscal/providers/focus/focus.client.ts';
import { FocusProvider, focusBaseUrl } from '../fiscal/providers/focus/focus.provider.ts';

type Empresa = { id: string; slug: string; cnpj: string; legalName: string; productionEnabled: boolean; fiscalConfigJson?: unknown };

const chaveEnv = (slug: string) => slug.toUpperCase().replaceAll('-', '_');

/** 'production' só com as três travas; senão 'homologation'. Pedir produção sem as travas é erro, nunca um desvio silencioso. */
export function ambienteFocus(env: NodeJS.ProcessEnv, empresa: Pick<Empresa, 'legalName' | 'productionEnabled'>): 'homologation' | 'production' {
  const pedido = env.FOCUS_ENV ?? 'homologation';
  if (pedido === 'homologation') return 'homologation';
  if (pedido !== 'production') throw new ConfigError(`FOCUS_ENV inválido: "${pedido}". Use "homologation" ou "production".`);
  if (env.ALLOW_PRODUCTION_EMISSION !== 'true') {
    throw new InvoiceRuleError('Produção pedida (FOCUS_ENV=production), mas ALLOW_PRODUCTION_EMISSION não é "true". Nada foi emitido.');
  }
  if (!empresa.productionEnabled) {
    throw new InvoiceRuleError(`Produção não está habilitada para ${empresa.legalName}. Um administrador precisa ligá-la na empresa. Nada foi emitido.`);
  }
  return 'production';
}

export function criarEmissionDeps(env: NodeJS.ProcessEnv = process.env): EmissionDeps & { providerName: 'fake' | 'focus' } {
  const nome = env.FISCAL_PROVIDER ?? 'fake';
  if (nome !== 'fake' && nome !== 'focus') {
    throw new ConfigError(`FISCAL_PROVIDER inválido: "${nome}". Use "fake" ou "focus".`);
  }
  const pastaEmpresas = env.NFSE_EMPRESAS_DIR ?? './empresas';
  const config = (e: Empresa): ConfigFiscal => {
    if (e.fiscalConfigJson) {
      try {
        return validarConfigFiscal(e.fiscalConfigJson, `cadastro de ${e.legalName}`);
      } catch (erro) {
        throw new InvoiceRuleError(`${(erro as Error).message.replace(/\n\s*-\s*/g, '; ')}. Corrija em Empresas → Editar dados.`);
      }
    }
    // ponytail: sem cadastro no banco vale o config.json da pasta (instalações anteriores ao assistente de empresas).
    try {
      return carregarConfigFiscal(join(pastaEmpresas, e.slug, 'config.json'));
    } catch (erro) {
      throw new InvoiceRuleError(`${e.legalName} não está configurada: preencha os dados da emissora em Empresas → Configurar (ou em ${pastaEmpresas}/${e.slug}/config.json). ${(erro as Error).message.split('\n')[0]}`);
    }
  };

  if (nome === 'fake') {
    const fakes = new Map<string, InvoiceFiscalProvider>();
    return {
      providerName: 'fake',
      providerFor: (e) => fakes.get(e.id) ?? (fakes.set(e.id, new FakeFiscalProvider()), fakes.get(e.id)!),
      // O provedor falso não usa os dados da emissora; nenhum código real é necessário para desenvolver a interface.
      emitterFor: (e): FiscalEmitter => ({
        cnpj: e.cnpj,
        legalName: e.legalName,
        municipalityCode: '0000000',
        serviceMunicipalityCode: '0000000',
        simplesNacionalOption: '1',
        simplesNacionalRegime: null,
        specialTaxRegime: '0',
        municipalRegistration: null,
      }),
    };
  }

  const provedores = new Map<string, InvoiceFiscalProvider>();
  return {
    providerName: 'focus',
    providerFor: (e) => {
      const ambiente = ambienteFocus(env, e);
      const chave = `${e.id}:${ambiente}`;
      const existente = provedores.get(chave);
      if (existente) return existente;
      const variavel = `FOCUS_TOKEN_${ambiente === 'production' ? 'PRODUCAO' : 'HOMOLOGACAO'}_${chaveEnv(e.slug)}`;
      const token = env[variavel];
      if (!token) throw new InvoiceRuleError(`Token da Focus ausente para ${e.legalName}: defina ${variavel} no servidor.`);
      const p = new FocusProvider({ client: new FocusClient({ baseUrl: focusBaseUrl(ambiente), token }) });
      provedores.set(chave, p);
      return p;
    },
    emitterFor: (e) => {
      const c = config(e);
      if (c.cnpj !== e.cnpj) throw new InvoiceRuleError(`O CNPJ de ${pastaEmpresas}/${e.slug}/config.json não é o de ${e.legalName}.`);
      return {
        cnpj: c.cnpj,
        legalName: c.razaoSocial,
        municipalityCode: c.codigoMunicipioEmissor,
        serviceMunicipalityCode: c.codigoMunicipioPrestacao ?? c.codigoMunicipioEmissor,
        simplesNacionalOption: c.opSimpNac,
        simplesNacionalRegime: c.regApTribSN ?? null,
        specialTaxRegime: c.regEspTrib,
        municipalRegistration: c.inscricaoMunicipal ?? null,
      };
    },
    fiscalDefaultsFor: (e) => {
      const c = config(e);
      const total = {
        ...(c.percentualTributosSimples !== undefined ? { percentualTributosSimples: c.percentualTributosSimples } : {}),
        ...(c.percentualTributosFederais !== undefined ? { percentualTributosFederais: c.percentualTributosFederais } : {}),
        percentualTributosEstaduais: c.percentualTributosEstaduais,
        percentualTributosMunicipais: c.percentualTributosMunicipais,
      };
      return { pisCofins: c.pisCofins ?? null, ibsCbs: c.ibsCbs ?? null, additional: total };
    },
  };
}
