import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Campo } from '@/components/campo';
import { Radios } from '@/components/radios';
import { get, mensagemDeErro } from '@/lib/api';
import { cnpj as fmtCnpj, slug as slugDe } from '@/lib/format';
import { useMutacoes } from '@/lib/queries';
import { CODIGOS, IBS_DEST, PIS_RET, REG_ESP, REG_SN, RETENCAO, SIMPLES, TRIBUTACAO, rotulo, variavelToken } from '@/lib/emissora';
import type { Emissora, Empresa } from '@/lib/tipos';

/**
 * Assistente de empresa: pergunta, em seis passos, tudo que a DPS precisa da
 * emissora. Os códigos vêm do contador; aqui só se confere o formato e se
 * explica o que cada campo é. Salva num pedido só (POST /api/companies ou
 * PUT /api/companies/:id/emitter); o servidor valida de novo e devolve o campo.
 */

const PASSOS = ['Identificação', 'Município', 'Regime', 'Serviço', 'Tributos', 'Revisão'] as const;

/** Tudo em texto enquanto a pessoa digita; vira número e opcional só ao salvar. */
type Form = {
  slug: string; cnpj: string; razaoSocial: string; nomeFantasia: string; inscricaoMunicipal: string;
  cep: string; municipio: string; codigoMunicipioEmissor: string; prestacaoDiferente: boolean; codigoMunicipioPrestacao: string;
  opSimpNac: '1' | '2' | '3'; regApTribSN: '1' | '2' | '3'; regEspTrib: string;
  codigoTributacaoNacional: string; codigoTributacaoMunicipal: string; codigoNbs: string; tributacaoIssqn: string; retencaoIssqn: string; aliquotaIss: string;
  percentualTributosSimples: string; percentualTributosFederais: string; percentualTributosEstaduais: string; percentualTributosMunicipais: string;
  pisCofins: boolean; pisCst: string; pisRetencao: string;
  ibsCbs: boolean; ibsIndOp: string; ibsCst: string; ibsClass: string; ibsDest: string; ibsUso: string | undefined;
};

const texto = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','));
const digitos = (s: string) => s.replace(/\D/g, '');
const numero = (s: string) => Number(s.trim().replace(',', '.'));
const opcional = (s: string) => (s.trim() ? s.trim() : undefined);
const PCT = /^\d{1,3}([.,]\d{1,2})?$/;

function inicial(e: Emissora | null, empresa: Empresa | null): Form {
  return {
    slug: empresa?.slug ?? '',
    cnpj: e?.cnpj ?? empresa?.cnpj ?? '',
    razaoSocial: e?.razaoSocial ?? empresa?.legalName ?? '',
    nomeFantasia: e?.nomeFantasia ?? empresa?.tradeName ?? '',
    inscricaoMunicipal: e?.inscricaoMunicipal ?? '',
    cep: '',
    municipio: '',
    codigoMunicipioEmissor: e?.codigoMunicipioEmissor ?? '',
    prestacaoDiferente: !!e?.codigoMunicipioPrestacao && e.codigoMunicipioPrestacao !== e.codigoMunicipioEmissor,
    codigoMunicipioPrestacao: e?.codigoMunicipioPrestacao ?? '',
    opSimpNac: e?.opSimpNac ?? '3',
    regApTribSN: e?.regApTribSN ?? '1',
    regEspTrib: e?.regEspTrib ?? '0',
    codigoTributacaoNacional: e?.codigoTributacaoNacional ?? '',
    codigoTributacaoMunicipal: e?.codigoTributacaoMunicipal ?? '',
    codigoNbs: e?.codigoNbs ?? '',
    tributacaoIssqn: e?.tributacaoIssqn ?? '1',
    retencaoIssqn: e?.retencaoIssqn ?? '1',
    aliquotaIss: texto(e?.aliquotaIss),
    percentualTributosSimples: texto(e?.percentualTributosSimples),
    percentualTributosFederais: texto(e?.percentualTributosFederais),
    percentualTributosEstaduais: texto(e?.percentualTributosEstaduais ?? 0),
    percentualTributosMunicipais: texto(e?.percentualTributosMunicipais ?? 0),
    pisCofins: !!e?.pisCofins,
    pisCst: e?.pisCofins?.cst ?? '',
    pisRetencao: e?.pisCofins?.tipoRetencao ?? '0',
    // Empresa nova: o grupo IBS/CBS já sai com os códigos da consulta presencial (o fisco calcula as alíquotas).
    ibsCbs: e ? !!e.ibsCbs : true,
    ibsIndOp: e?.ibsCbs?.codigoIndicadorOperacao ?? '030101',
    ibsCst: e?.ibsCbs?.cst ?? '000',
    ibsClass: e?.ibsCbs?.classificacaoTributaria ?? '000001',
    ibsDest: e?.ibsCbs?.indicadorDestinatario ?? '0',
    ibsUso: e?.ibsCbs?.usoConsumoPessoal,
  };
}

function paraEmissora(f: Form): Emissora {
  const simples = f.opSimpNac === '3';
  return {
    cnpj: digitos(f.cnpj),
    razaoSocial: f.razaoSocial.trim(),
    nomeFantasia: opcional(f.nomeFantasia),
    inscricaoMunicipal: opcional(f.inscricaoMunicipal),
    codigoMunicipioEmissor: f.codigoMunicipioEmissor,
    codigoMunicipioPrestacao: f.prestacaoDiferente ? f.codigoMunicipioPrestacao : undefined,
    opSimpNac: f.opSimpNac,
    regApTribSN: simples ? f.regApTribSN : undefined,
    regEspTrib: f.regEspTrib,
    codigoTributacaoNacional: f.codigoTributacaoNacional,
    codigoTributacaoMunicipal: opcional(f.codigoTributacaoMunicipal),
    codigoNbs: opcional(f.codigoNbs),
    tributacaoIssqn: f.tributacaoIssqn,
    retencaoIssqn: f.retencaoIssqn,
    aliquotaIss: f.aliquotaIss.trim() ? numero(f.aliquotaIss) : undefined,
    percentualTributosSimples: simples ? numero(f.percentualTributosSimples) : undefined,
    percentualTributosFederais: simples ? undefined : numero(f.percentualTributosFederais),
    percentualTributosEstaduais: simples ? undefined : numero(f.percentualTributosEstaduais || '0'),
    percentualTributosMunicipais: simples ? undefined : numero(f.percentualTributosMunicipais || '0'),
    pisCofins: f.pisCofins ? { cst: f.pisCst, tipoRetencao: f.pisRetencao } : undefined,
    ibsCbs: f.ibsCbs
      ? { codigoIndicadorOperacao: f.ibsIndOp, cst: f.ibsCst, classificacaoTributaria: f.ibsClass, indicadorDestinatario: f.ibsDest, ...(f.ibsUso ? { usoConsumoPessoal: f.ibsUso } : {}) }
      : undefined,
  };
}

/** O que impede de avançar neste passo. O servidor confere tudo de novo ao salvar. */
function problemas(passo: number, f: Form, criando: boolean): string[] {
  const p: string[] = [];
  if (passo === 0) {
    if (digitos(f.cnpj).length !== 14) p.push('CNPJ com 14 dígitos');
    if (!f.razaoSocial.trim()) p.push('razão social');
    if (criando && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)) p.push('identificador só com minúsculas, dígitos e hífen');
  }
  if (passo === 1) {
    if (!/^\d{7}$/.test(f.codigoMunicipioEmissor)) p.push('código IBGE do município com 7 dígitos (busque pelo CEP)');
    if (f.prestacaoDiferente && !/^\d{7}$/.test(f.codigoMunicipioPrestacao)) p.push('código IBGE do município da prestação');
  }
  if (passo === 3) {
    if (!/^\d{6}$/.test(f.codigoTributacaoNacional)) p.push('código de tributação nacional com 6 dígitos');
    if (f.codigoTributacaoMunicipal && !/^\d{1,10}$/.test(f.codigoTributacaoMunicipal)) p.push('código municipal só com dígitos');
    if (f.codigoNbs && !/^\d{9}$/.test(f.codigoNbs)) p.push('NBS com 9 dígitos');
    if (f.aliquotaIss && !PCT.test(f.aliquotaIss.trim())) p.push('alíquota de ISS em percentual (ex.: 5,00)');
  }
  if (passo === 4) {
    if (!PCT.test((f.opSimpNac === '3' ? f.percentualTributosSimples : f.percentualTributosFederais).trim())) p.push('carga tributária aproximada em percentual (Lei 12.741)');
    if (f.pisCofins && !/^\d{2}$/.test(f.pisCst)) p.push('CST do PIS/COFINS com 2 dígitos');
    if (f.ibsCbs && !(/^\d{6}$/.test(f.ibsIndOp) && /^\d{3}$/.test(f.ibsCst) && /^\d{6}$/.test(f.ibsClass))) p.push('códigos do IBS/CBS com 6, 3 e 6 dígitos');
  }
  return p;
}

type Props = { empresa: Empresa | null; emissora: Emissora | null; onFechar: () => void };

export function EmpresaWizard({ empresa, emissora, onFechar }: Props) {
  const m = useMutacoes();
  const criando = empresa === null;
  const [passo, setPasso] = useState(0);
  const [f, setF] = useState<Form>(() => inicial(emissora, empresa));
  const [slugEditado, setSlugEditado] = useState(!criando);
  const [tentou, setTentou] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const set = (parte: Partial<Form>) => setF((atual) => ({ ...atual, ...parte }));
  const pendente = m.criarEmpresa.isPending || m.salvarEmissora.isPending;
  const erros = problemas(passo, f, criando);
  const ultimo = passo === PASSOS.length - 1;

  const identidade = (parte: Partial<Pick<Form, 'razaoSocial' | 'nomeFantasia'>>) => {
    const proximo = { ...f, ...parte };
    set({ ...parte, ...(slugEditado ? {} : { slug: slugDe(proximo.nomeFantasia || proximo.razaoSocial) }) });
  };

  const buscarCep = async () => {
    setBuscandoCep(true);
    try {
      const r = await get<{ codigoMunicipio: string; municipio: string; uf: string }>(`/api/cep/${digitos(f.cep)}`);
      set({ codigoMunicipioEmissor: r.codigoMunicipio, municipio: `${r.municipio}/${r.uf}` });
    } catch (e: unknown) {
      toast.error(mensagemDeErro(e));
    } finally {
      setBuscandoCep(false);
    }
  };

  const avancar = (ev: FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (erros.length) return;
    if (!ultimo) {
      setPasso(passo + 1);
      setTentou(false);
      return;
    }
    const dados = paraEmissora(f);
    const op = criando ? m.criarEmpresa.mutateAsync({ slug: f.slug, ...dados }) : m.salvarEmissora.mutateAsync({ companyId: empresa.id, ...dados });
    op.then(() => {
      toast.success(criando ? 'Empresa cadastrada. Falta o token da Focus no servidor e, quando for a hora, ligar a produção.' : 'Dados da empresa salvos');
      onFechar();
    }).catch((e: unknown) => toast.error(mensagemDeErro(e)));
  };

  const simples = f.opSimpNac === '3';
  const nome = f.nomeFantasia || f.razaoSocial || 'empresa';

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{criando ? 'Nova empresa' : `Dados da empresa · ${nome}`}</DialogTitle>
          <DialogDescription>
            Passo {passo + 1} de {PASSOS.length} · {PASSOS[passo]}. Os códigos vêm do contador; o assistente explica cada um e confere o formato.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Passos">
          {PASSOS.map((p, i) => (
            <li key={p} aria-current={i === passo ? 'step' : undefined} className={i === passo ? 'font-semibold text-foreground' : i < passo ? 'text-foreground' : 'text-muted-foreground'}>
              {i + 1}. {p}
            </li>
          ))}
        </ol>
        <form onSubmit={avancar} className="grid gap-4" noValidate>
          {passo === 0 && (
            <>
              <Campo id="e-cnpj" label="CNPJ">
                <Input id="e-cnpj" inputMode="numeric" autoFocus className="tabular" value={f.cnpj} onChange={(ev) => set({ cnpj: ev.target.value })} onBlur={() => set({ cnpj: digitos(f.cnpj).length === 14 ? fmtCnpj(digitos(f.cnpj)) : f.cnpj })} />
              </Campo>
              <Campo id="e-razao" label="Razão social" dica="Como está no cartão CNPJ; vai impressa na nota.">
                <Input id="e-razao" value={f.razaoSocial} onChange={(ev) => identidade({ razaoSocial: ev.target.value })} />
              </Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo id="e-fantasia" label="Nome fantasia (opcional)" dica="Como a equipe chama a empresa na interface.">
                  <Input id="e-fantasia" value={f.nomeFantasia} onChange={(ev) => identidade({ nomeFantasia: ev.target.value })} />
                </Campo>
                <Campo id="e-im" label="Inscrição municipal (opcional)" dica="Só onde a prefeitura pede.">
                  <Input id="e-im" className="tabular" value={f.inscricaoMunicipal} onChange={(ev) => set({ inscricaoMunicipal: ev.target.value })} />
                </Campo>
              </div>
              <Campo
                id="e-slug"
                label="Identificador"
                dica={criando ? `Nomeia o token da Focus no servidor: ${variavelToken(f.slug || 'empresa')}. Não muda depois.` : `Token da Focus no servidor: ${variavelToken(f.slug)}`}
              >
                <Input
                  id="e-slug"
                  className="tabular"
                  value={f.slug}
                  disabled={!criando}
                  onChange={(ev) => {
                    setSlugEditado(true);
                    set({ slug: ev.target.value.toLowerCase() });
                  }}
                />
              </Campo>
            </>
          )}

          {passo === 1 && (
            <>
              <p className="text-sm text-muted-foreground">A nota leva o código IBGE do município da clínica. Busque pelo CEP do endereço da empresa.</p>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <Campo id="e-cep" label="CEP da empresa">
                  <Input id="e-cep" inputMode="numeric" autoFocus className="tabular" value={f.cep} onChange={(ev) => set({ cep: ev.target.value })} />
                </Campo>
                <Button type="button" variant="outline" onClick={() => void buscarCep()} disabled={digitos(f.cep).length !== 8 || buscandoCep}>
                  {buscandoCep ? 'Buscando…' : 'Buscar'}
                </Button>
              </div>
              <Campo id="e-mun" label="Código IBGE do município" dica={f.municipio ? f.municipio : 'Preenchido pela busca; pode digitar o código de 7 dígitos.'}>
                <Input id="e-mun" inputMode="numeric" maxLength={7} className="tabular" value={f.codigoMunicipioEmissor} onChange={(ev) => set({ codigoMunicipioEmissor: digitos(ev.target.value), municipio: '' })} />
              </Campo>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.prestacaoDiferente} onCheckedChange={(v) => set({ prestacaoDiferente: v === true })} /> O serviço é prestado noutro município (atendimento externo)
              </label>
              {f.prestacaoDiferente && (
                <Campo id="e-mun2" label="Código IBGE do município da prestação">
                  <Input id="e-mun2" inputMode="numeric" maxLength={7} className="tabular" value={f.codigoMunicipioPrestacao} onChange={(ev) => set({ codigoMunicipioPrestacao: digitos(ev.target.value) })} />
                </Campo>
              )}
            </>
          )}

          {passo === 2 && (
            <>
              <Campo id="e-sn" label="Enquadramento" dica="Está no cartão CNPJ e na contabilidade. Muda o que a nota informa de imposto.">
                <Radios nome="Enquadramento" opcoes={SIMPLES} valor={f.opSimpNac} onChange={(v) => set({ opSimpNac: v as Form['opSimpNac'] })} />
              </Campo>
              {simples && (
                <Campo id="e-regsn" label="Como o ISS é apurado no Simples" dica="Quase sempre tudo pelo DAS; as outras opções valem para quem estourou o sublimite.">
                  <Radios nome="Apuração no Simples" opcoes={REG_SN} valor={f.regApTribSN} onChange={(v) => set({ regApTribSN: v as Form['regApTribSN'] })} />
                </Campo>
              )}
              <Campo id="e-esp" label="Regime especial de tributação" dica="Sociedade de profissionais é comum em clínica: o ISS é fixo por profissional. O contador confirma.">
                <Radios nome="Regime especial" opcoes={REG_ESP} valor={f.regEspTrib} onChange={(v) => set({ regEspTrib: v })} />
              </Campo>
            </>
          )}

          {passo === 3 && (
            <>
              <Campo id="e-nac" label="Código de tributação nacional" dica="6 dígitos da tabela nacional (LC 116). Sugestões abaixo; o contador confirma.">
                <Input id="e-nac" list="codigos-nacionais" inputMode="numeric" maxLength={6} autoFocus className="tabular" value={f.codigoTributacaoNacional} onChange={(ev) => set({ codigoTributacaoNacional: digitos(ev.target.value) })} />
                <datalist id="codigos-nacionais">
                  {CODIGOS.map(([c, r]) => (
                    <option key={c} value={c}>
                      {r}
                    </option>
                  ))}
                </datalist>
              </Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo id="e-mun-cod" label="Código municipal (se a prefeitura exigir)" dica="Ex.: o Rio exige o complemento de 3 dígitos.">
                  <Input id="e-mun-cod" inputMode="numeric" className="tabular" value={f.codigoTributacaoMunicipal} onChange={(ev) => set({ codigoTributacaoMunicipal: digitos(ev.target.value) })} />
                </Campo>
                <Campo id="e-nbs" label="NBS (opcional)" dica="9 dígitos; ex.: 123012100 para serviços de saúde.">
                  <Input id="e-nbs" inputMode="numeric" maxLength={9} className="tabular" value={f.codigoNbs} onChange={(ev) => set({ codigoNbs: digitos(ev.target.value) })} />
                </Campo>
              </div>
              <Campo id="e-trib" label="ISSQN na operação">
                <Radios nome="Tributação do ISSQN" opcoes={TRIBUTACAO} valor={f.tributacaoIssqn} onChange={(v) => set({ tributacaoIssqn: v })} />
              </Campo>
              <Campo id="e-ret" label="Retenção do ISSQN" dica="Paciente pessoa física não retém. Retenção pelo tomador exige alíquota.">
                <Radios nome="Retenção do ISSQN" opcoes={RETENCAO} valor={f.retencaoIssqn} onChange={(v) => set({ retencaoIssqn: v })} />
              </Campo>
              <Campo id="e-iss" label="Alíquota de ISS destacada (%) — opcional" dica={simples ? 'Optante do Simples sem retenção costuma deixar em branco: o fisco recusa alíquota (E0625).' : 'Ex.: 5,00. Sociedade de profissionais com ISS fixo deixa em branco.'}>
                <Input id="e-iss" inputMode="decimal" className="tabular max-w-32" placeholder="5,00" value={f.aliquotaIss} onChange={(ev) => set({ aliquotaIss: ev.target.value })} />
              </Campo>
            </>
          )}

          {passo === 4 && (
            <>
              {simples ? (
                <Campo id="e-pct" label="Carga tributária aproximada (%)" dica="Lei 12.741 ('de olho no imposto'): o percentual único do Simples, ex.: 6,00.">
                  <Input id="e-pct" inputMode="decimal" autoFocus className="tabular max-w-32" value={f.percentualTributosSimples} onChange={(ev) => set({ percentualTributosSimples: ev.target.value })} />
                </Campo>
              ) : (
                <fieldset className="grid gap-2">
                  <legend className="text-sm font-medium">Carga tributária aproximada (%) — Lei 12.741</legend>
                  <div className="grid grid-cols-3 gap-2">
                    <Campo id="e-fed" label="Federal">
                      <Input id="e-fed" inputMode="decimal" autoFocus className="tabular" value={f.percentualTributosFederais} onChange={(ev) => set({ percentualTributosFederais: ev.target.value })} />
                    </Campo>
                    <Campo id="e-est" label="Estadual">
                      <Input id="e-est" inputMode="decimal" className="tabular" value={f.percentualTributosEstaduais} onChange={(ev) => set({ percentualTributosEstaduais: ev.target.value })} />
                    </Campo>
                    <Campo id="e-mun-pct" label="Municipal">
                      <Input id="e-mun-pct" inputMode="decimal" className="tabular" value={f.percentualTributosMunicipais} onChange={(ev) => set({ percentualTributosMunicipais: ev.target.value })} />
                    </Campo>
                  </div>
                </fieldset>
              )}
              <fieldset className="grid gap-2 border-t pt-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={f.pisCofins} onCheckedChange={(v) => set({ pisCofins: v === true, ...(v === true && !f.pisCst ? { pisCst: simples ? '07' : '01' } : {}) })} /> Informar PIS/COFINS na nota
                </label>
                {f.pisCofins && (
                  <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
                    <Campo id="e-pis-cst" label="CST" dica="07 isenta (Simples); 01 alíquota básica.">
                      <Input id="e-pis-cst" inputMode="numeric" maxLength={2} className="tabular" value={f.pisCst} onChange={(ev) => set({ pisCst: digitos(ev.target.value) })} />
                    </Campo>
                    <Campo id="e-pis-ret" label="Retenção">
                      <Radios nome="Retenção de PIS/COFINS" opcoes={PIS_RET} valor={f.pisRetencao} onChange={(v) => set({ pisRetencao: v })} />
                    </Campo>
                  </div>
                )}
              </fieldset>
              <fieldset className="grid gap-2 border-t pt-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={f.ibsCbs} onCheckedChange={(v) => set({ ibsCbs: v === true })} /> Informar IBS/CBS (reforma tributária)
                </label>
                <p className="text-xs text-muted-foreground">Os valores abaixo são os de serviço de saúde prestado presencialmente na clínica; o fisco calcula as alíquotas. Obrigatório para optantes do Simples a partir de 2027.</p>
                {f.ibsCbs && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <Campo id="e-ibs-op" label="Indicador de operação">
                        <Input id="e-ibs-op" inputMode="numeric" maxLength={6} className="tabular" value={f.ibsIndOp} onChange={(ev) => set({ ibsIndOp: digitos(ev.target.value) })} />
                      </Campo>
                      <Campo id="e-ibs-cst" label="CST">
                        <Input id="e-ibs-cst" inputMode="numeric" maxLength={3} className="tabular" value={f.ibsCst} onChange={(ev) => set({ ibsCst: digitos(ev.target.value) })} />
                      </Campo>
                      <Campo id="e-ibs-class" label="Classificação">
                        <Input id="e-ibs-class" inputMode="numeric" maxLength={6} className="tabular" value={f.ibsClass} onChange={(ev) => set({ ibsClass: digitos(ev.target.value) })} />
                      </Campo>
                    </div>
                    <Campo id="e-ibs-dest" label="Quem recebe o serviço">
                      <Radios nome="Destinatário" opcoes={IBS_DEST} valor={f.ibsDest} onChange={(v) => set({ ibsDest: v })} />
                    </Campo>
                  </>
                )}
              </fieldset>
            </>
          )}

          {passo === 5 && <Revisao f={f} criando={criando} />}

          {tentou && erros.length > 0 && (
            <p role="alert" className="text-xs text-destructive">
              Confira: {erros.join(', ')}.
            </p>
          )}
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setPasso(passo - 1)} disabled={passo === 0 || pendente}>
              Voltar
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onFechar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente}>
                {ultimo ? (pendente ? 'Salvando…' : criando ? 'Cadastrar empresa' : 'Salvar dados') : 'Continuar'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Revisao({ f, criando }: { f: Form; criando: boolean }) {
  const simples = f.opSimpNac === '3';
  const linhas: [string, string][] = [
    ['Empresa', `${f.razaoSocial}${f.nomeFantasia ? ` (${f.nomeFantasia})` : ''} · CNPJ ${fmtCnpj(digitos(f.cnpj))}${f.inscricaoMunicipal ? ` · IM ${f.inscricaoMunicipal}` : ''}`],
    ['Token da Focus', `${variavelToken(f.slug, 'HOMOLOGACAO')} e ${variavelToken(f.slug)} no servidor`],
    ['Município', `${f.municipio ? `${f.municipio} · ` : ''}IBGE ${f.codigoMunicipioEmissor}${f.prestacaoDiferente ? ` · prestação em ${f.codigoMunicipioPrestacao}` : ''}`],
    ['Regime', `${rotulo(SIMPLES, f.opSimpNac)}${simples ? ` · ${rotulo(REG_SN, f.regApTribSN)}` : ''}${f.regEspTrib !== '0' ? ` · ${rotulo(REG_ESP, f.regEspTrib)}` : ''}`],
    ['Serviço', `${f.codigoTributacaoNacional}${f.codigoTributacaoMunicipal ? ` / ${f.codigoTributacaoMunicipal}` : ''}${f.codigoNbs ? ` · NBS ${f.codigoNbs}` : ''} · ${rotulo(TRIBUTACAO, f.tributacaoIssqn)}, ${rotulo(RETENCAO, f.retencaoIssqn).toLowerCase()}${f.aliquotaIss ? ` · ISS ${f.aliquotaIss}%` : ''}`],
    ['Carga tributária', simples ? `${f.percentualTributosSimples}% (Simples)` : `federal ${f.percentualTributosFederais}% · estadual ${f.percentualTributosEstaduais || '0'}% · municipal ${f.percentualTributosMunicipais || '0'}%`],
    ['PIS/COFINS', f.pisCofins ? `CST ${f.pisCst}, ${rotulo(PIS_RET, f.pisRetencao).toLowerCase()}` : 'não informado na nota'],
    ['IBS/CBS', f.ibsCbs ? `${f.ibsIndOp} · CST ${f.ibsCst} · ${f.ibsClass}` : 'não informado na nota'],
  ];
  return (
    <>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
        {linhas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        Confira estes dados com o contador antes de ligar a produção: uma nota com código errado sai em nome da clínica.
        {criando ? ' A empresa nasce em ambiente de teste; a produção se liga depois, nesta mesma tela.' : ' Notas já emitidas não mudam.'}
      </p>
    </>
  );
}
