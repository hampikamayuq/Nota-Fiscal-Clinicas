import { useState } from 'react';
import { Pencil, Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Campo } from '@/components/campo';
import { Skeleton } from '@/components/ui/skeleton';
import { EmpresaWizard } from '@/components/empresa-wizard';
import { FolhaVazia } from '@/components/folha-vazia';
import { PageHeader } from '@/components/page-header';
import { mensagemDeErro } from '@/lib/api';
import { pode, useMe } from '@/lib/auth';
import { REG_ESP, RETENCAO, SIMPLES, rotulo, variavelToken } from '@/lib/emissora';
import { cnpj } from '@/lib/format';
import { useEmissora, useEmpresas, useMutacoes } from '@/lib/queries';
import type { Empresa } from '@/lib/tipos';

export function Empresas() {
  const me = useMe();
  const empresas = useEmpresas();
  const podeFiscal = pode(me.data, 'configFiscal');
  const podeProducao = pode(me.data, 'producao');
  const [nova, setNova] = useState(false);
  return (
    <>
      <PageHeader
        titulo="Empresas"
        descricao={
          podeFiscal
            ? 'As empresas (CNPJs) da clínica. O assistente pergunta tudo que a nota precisa da emissora; os códigos vêm do contador e valem para todo serviço do catálogo sem exceção.'
            : 'As empresas (CNPJs) da clínica. Produção só liga com três travas, e nenhuma delas fica nesta tela.'
        }
        acoes={
          podeFiscal && (
            <Button onClick={() => setNova(true)}>
              <Plus /> Nova empresa
            </Button>
          )
        }
      />
      {empresas.isPending ? (
        <Skeleton className="h-32" />
      ) : empresas.data?.length === 0 ? (
        <FolhaVazia frase={podeFiscal ? 'Nenhuma empresa ainda. Cadastre a primeira com os dados do contador em mãos: CNPJ, município, regime e código do serviço.' : 'Nenhuma empresa cadastrada ainda.'}>
          {podeFiscal && (
            <Button size="sm" onClick={() => setNova(true)}>
              <Plus /> Cadastrar empresa
            </Button>
          )}
        </FolhaVazia>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {empresas.data?.map((e) => (
            <li key={e.id} className="grid content-start gap-4 rounded-xl border bg-card p-5">
              <div>
                <p className="font-heading text-xl">{e.tradeName ?? e.legalName}</p>
                <p className="text-sm text-muted-foreground">{e.legalName}</p>
                <p className="tabular mt-2 text-sm">CNPJ {cnpj(e.cnpj)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-md border px-2 py-0.5 text-xs font-medium', e.productionEnabled ? 'border-destructive/40 text-destructive' : 'text-muted-foreground')}>
                    {e.productionEnabled ? 'Produção ligada' : 'Ambiente de teste'}
                  </span>
                  {!e.configured && <span className="rounded-md border border-destructive/40 px-2 py-0.5 text-xs font-medium text-destructive">Dados fiscais pendentes</span>}
                  {podeProducao && <Producao empresa={e} />}
                </div>
              </div>
              {podeFiscal && <Emissora empresa={e} />}
            </li>
          ))}
        </ul>
      )}
      {nova && <EmpresaWizard empresa={null} emissora={null} onFechar={() => setNova(false)} />}
    </>
  );
}

/** Resumo do que a nota leva da emissora, e a porta para o assistente. */
function Emissora({ empresa }: { empresa: Empresa }) {
  const emissora = useEmissora(empresa.id, true);
  const [editando, setEditando] = useState(false);
  const e = emissora.data;
  return (
    <section aria-label="Dados da emissora" className="grid gap-2 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="rotulo">Dados fiscais da emissora</h2>
        <Button size="sm" variant="outline" onClick={() => setEditando(true)} disabled={emissora.isPending}>
          {e ? <Pencil /> : <Settings2 />} {e ? 'Editar dados' : 'Configurar'}
        </Button>
      </div>
      {emissora.isPending ? (
        <Skeleton className="h-10" />
      ) : e ? (
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Município</dt>
          <dd className="tabular">IBGE {e.codigoMunicipioEmissor}</dd>
          <dt className="text-muted-foreground">Regime</dt>
          <dd>
            {rotulo(SIMPLES, e.opSimpNac)}
            {e.regEspTrib !== '0' ? ` · ${rotulo(REG_ESP, e.regEspTrib)}` : ''}
          </dd>
          <dt className="text-muted-foreground">Serviço</dt>
          <dd className="tabular">
            {e.codigoTributacaoNacional}
            {e.codigoTributacaoMunicipal ? ` / ${e.codigoTributacaoMunicipal}` : ''} · {rotulo(RETENCAO, e.retencaoIssqn)}
            {e.aliquotaIss !== undefined ? ` · ISS ${String(e.aliquotaIss).replace('.', ',')}%` : ''}
          </dd>
          <dt className="text-muted-foreground">Token da Focus</dt>
          <dd className="tabular text-xs break-all">{variavelToken(empresa.slug)}</dd>
        </dl>
      ) : (
        <p className="text-sm text-destructive">Não configurada: a emissão desta empresa é recusada até preencher os dados da emissora.</p>
      )}
      {editando && <EmpresaWizard empresa={empresa} emissora={e ?? null} onFechar={() => setEditando(false)} />}
    </section>
  );
}

/** Liga ou desliga a produção da empresa. Só ADMIN, e só digitando o CNPJ dela (o servidor confere e audita). */
function Producao({ empresa }: { empresa: Empresa }) {
  const m = useMutacoes();
  const [aberto, setAberto] = useState(false);
  const [digitado, setDigitado] = useState('');
  const ligar = !empresa.productionEnabled;
  const confere = digitado.replace(/\D/g, '') === empresa.cnpj;
  const fechar = () => {
    setAberto(false);
    setDigitado('');
  };
  const confirmar = () =>
    m.mudarProducao
      .mutateAsync({ companyId: empresa.id, enabled: ligar, cnpj: digitado })
      .then(() => {
        toast.success(ligar ? 'Produção ligada: as próximas notas desta empresa são reais' : 'Produção desligada');
        fechar();
      })
      .catch((e: unknown) => toast.error(mensagemDeErro(e)));

  return (
    <>
      <Button size="sm" variant={ligar ? 'outline' : 'ghost'} onClick={() => setAberto(true)}>
        {ligar ? 'Ligar produção' : 'Desligar produção'}
      </Button>
      <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ligar ? 'Ligar produção' : 'Desligar produção'} · {empresa.tradeName ?? empresa.legalName}</DialogTitle>
            <DialogDescription>
              {ligar
                ? 'Depois disso, toda nota emitida por esta empresa é real, com valor fiscal, e só sai do ar por cancelamento. O servidor também precisa estar em produção.'
                : 'As notas desta empresa deixam de ser emitidas até a produção ser ligada de novo. Notas já emitidas não mudam.'}
            </DialogDescription>
          </DialogHeader>
          <Campo id={`cnpj-${empresa.id}`} label={`Digite o CNPJ ${cnpj(empresa.cnpj)} para confirmar`}>
            <Input id={`cnpj-${empresa.id}`} inputMode="numeric" autoComplete="off" value={digitado} onChange={(ev) => setDigitado(ev.target.value)} />
          </Campo>
          <DialogFooter>
            <Button variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button variant={ligar ? 'destructive' : 'default'} disabled={!confere || m.mudarProducao.isPending} onClick={confirmar}>
              {ligar ? 'Ligar produção' : 'Desligar produção'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
