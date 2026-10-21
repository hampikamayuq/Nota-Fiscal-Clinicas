import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Campo } from '@/components/campo';
import { Radios } from '@/components/radios';
import type { ConfigFiscal } from '@/lib/tipos';

const TRIBUTACAO = [
  ['1', 'Operação tributável'],
  ['2', 'Imunidade'],
  ['3', 'Exportação de serviço'],
  ['4', 'Não incidência'],
] as const;
const RETENCAO = [
  ['1', 'Não retido'],
  ['2', 'Retido pelo tomador'],
  ['3', 'Retido pelo intermediário'],
] as const;

export type DadosFiscais = {
  nationalTaxCode: string;
  municipalTaxCode: string | null;
  nbsCode: string | null;
  issRate: string | null;
  taxationType: string;
  issWithholdingType: string;
  active: boolean;
};

type Props = {
  titulo: string;
  descricao: string;
  inicial: Partial<ConfigFiscal> | null;
  pendente: boolean;
  /** Rótulo da caixa "ativa" (o que acontece quando ela é desmarcada). */
  rotuloAtiva: string;
  onSalvar: (d: DadosFiscais) => void;
  onFechar: () => void;
  /** Ação extra no rodapé, à esquerda (ex.: voltar ao padrão da empresa). */
  extra?: ReactNode;
};

/** Só ADMIN/FINANCE. Os códigos vêm do contador; a tela só confere o formato. */
export function FiscalDialog({ titulo, descricao, inicial: c, pendente, rotuloAtiva, onSalvar, onFechar, extra }: Props) {
  const [nacional, setNacional] = useState(c?.nationalTaxCode ?? '');
  const [municipal, setMunicipal] = useState(c?.municipalTaxCode ?? '');
  const [nbs, setNbs] = useState(c?.nbsCode ?? '');
  const [iss, setIss] = useState(c?.issRate ?? '');
  const [tributacao, setTributacao] = useState(c?.taxationType ?? '1');
  const [retencao, setRetencao] = useState(c?.issWithholdingType ?? '1');
  const [ativo, setAtivo] = useState(c?.active ?? true);
  const problemas = [
    !/^\d{6}$/.test(nacional) && 'código nacional com 6 dígitos',
    nbs && !/^\d{9}$/.test(nbs) && 'NBS com 9 dígitos',
    iss && !/^\d{1,3}([.,]\d{1,2})?$/.test(iss) && 'ISS em percentual',
  ].filter(Boolean) as string[];

  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    if (problemas.length) return;
    onSalvar({
      nationalTaxCode: nacional,
      municipalTaxCode: municipal.trim() || null,
      nbsCode: nbs || null,
      issRate: iss ? iss.replace(',', '.') : null,
      taxationType: tributacao,
      issWithholdingType: retencao,
      active: ativo,
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="f-nac" label="Cód. tributação nacional" dica="6 dígitos, ex.: 040101">
              <Input id="f-nac" inputMode="numeric" maxLength={6} className="tabular" value={nacional} onChange={(e) => setNacional(e.target.value.replace(/\D/g, ''))} />
            </Campo>
            <Campo id="f-mun" label="Cód. tributação municipal">
              <Input id="f-mun" className="tabular" value={municipal} onChange={(e) => setMunicipal(e.target.value)} />
            </Campo>
            <Campo id="f-nbs" label="NBS" dica="9 dígitos, opcional">
              <Input id="f-nbs" inputMode="numeric" maxLength={9} className="tabular" value={nbs} onChange={(e) => setNbs(e.target.value.replace(/\D/g, ''))} />
            </Campo>
            <Campo id="f-iss" label="Alíquota ISS (%)">
              <Input id="f-iss" inputMode="decimal" className="tabular" placeholder="5,00" value={iss} onChange={(e) => setIss(e.target.value)} />
            </Campo>
          </div>
          <Campo id="f-trib" label="Tributação do ISSQN">
            <Radios nome="Tributação do ISSQN" opcoes={TRIBUTACAO} valor={tributacao} onChange={setTributacao} />
          </Campo>
          <Campo id="f-ret" label="Retenção do ISSQN">
            <Radios nome="Retenção do ISSQN" opcoes={RETENCAO} valor={retencao} onChange={setRetencao} />
          </Campo>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={ativo} onCheckedChange={(v) => setAtivo(v === true)} /> {rotuloAtiva}
          </label>
          {problemas.length > 0 && <p role="alert" className="text-xs text-destructive">Confira: {problemas.join(', ')}.</p>}
          <DialogFooter className="sm:justify-between">
            <div>{extra}</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onFechar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={problemas.length > 0 || pendente}>
                {pendente ? 'Salvando…' : 'Salvar configuração'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
