import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { cn } from 'cn';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Campo } from '@/components/campo';
import { NotaViva } from '@/components/nota-viva';
import { PageHeader } from '@/components/page-header';
import { PatientDialog } from '@/components/patient-dialog';
import { PatientPicker } from '@/components/patient-picker';
import { SeletorServicos } from '@/components/seletor-servicos';
import { mensagemDeErro } from '@/lib/api';
import { guardarMemoria, lerMemoria, prefillDeUrl } from '@/lib/emissao';
import { cnpj } from '@/lib/format';
import { useEmpresas, useMutacoes, usePaciente, useProfissionais } from '@/lib/queries';
import type { Paciente, Profissional } from '@/lib/tipos';

const rqeAtivos = (p: Profissional) => p.rqes.map((r) => r.number).join(', ') || null;

/** Chave ausente = a recepção ainda não mexeu nesse passo; vale o pré-marcado. */
type Escolha = { empresa?: string | null; profissional?: string | null; paciente?: Paciente | null };

/**
 * Quatro escolhas numa tela: empresa, paciente, profissional e o primeiro serviço.
 * O rascunho nasce nesse clique e a URL vira /notas/:id, onde a página da nota assume com o mesmo layout.
 */
export function NovaNota() {
  const empresas = useEmpresas();
  const profissionais = useProfissionais();
  const m = useMutacoes();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const [escolha, setEscolha] = useState<Escolha>({});
  const [referencia, setReferencia] = useState<string | null>(null);
  const [novoPaciente, setNovoPaciente] = useState(false);

  // Pré-marcação: URL > última emissão neste navegador > empresa única. Derivada a cada render, sem efeito de sincronização.
  const prefill = prefillDeUrl(params, lerMemoria(localStorage), empresas.data ?? []);
  const empresaId = escolha.empresa !== undefined ? escolha.empresa : prefill.empresa;
  const profissionalId = escolha.profissional !== undefined ? escolha.profissional : prefill.profissional;
  const pacientePrefill = usePaciente(escolha.paciente === undefined ? prefill.paciente : null);
  const empresa = empresas.data?.find((e) => e.id === empresaId) ?? null;
  const profissional = profissionais.data?.find((p) => p.id === profissionalId) ?? null;
  const paciente = escolha.paciente !== undefined ? escolha.paciente : (pacientePrefill.data ?? null);
  const pronto = !!(empresa && paciente && profissional);
  const ocupado = m.criarNota.isPending || m.adicionarItem.isPending || m.aplicarModelo.isPending;

  /** Cria o rascunho, aplica o primeiro serviço (ou modelo) e troca para a página da nota. Nada de toast "Rascunho criado". */
  const comecar = async (primeiro: (id: string) => Promise<unknown>) => {
    if (!empresa || !paciente || !profissional) return;
    let id: string;
    try {
      const ref = referencia?.trim();
      id = (await m.criarNota.mutateAsync({ companyId: empresa.id, patientId: paciente.id, professionalId: profissional.id, ...(ref ? { internalReference: ref } : {}) })).id;
    } catch (e) {
      toast.error(mensagemDeErro(e));
      return;
    }
    guardarMemoria(localStorage, { empresa: empresa.id, profissional: profissional.id });
    try {
      await primeiro(id);
    } catch (e) {
      // O rascunho já existe: a nota abre vazia com o motivo, e a recepção escolhe outro serviço de lá.
      toast.error(mensagemDeErro(e));
    }
    navegar(`/notas/${id}`, { replace: true });
  };

  return (
    <>
      <PageHeader titulo="Para quem é a nota?" descricao="Escolha a empresa primeiro; os médicos atendem pelas duas." />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="grid gap-8">
          <Passo n={1} titulo="Empresa emissora">
            {empresas.isPending ? (
              <Skeleton className="h-20" />
            ) : (
              <div role="radiogroup" aria-label="Empresa emissora" className="grid gap-2">
                {empresas.data?.map((e) => (
                  <Opcao key={e.id} marcada={empresa?.id === e.id} onClick={() => setEscolha((x) => ({ ...x, empresa: e.id }))}>
                    <span className="block font-medium">{e.tradeName ?? e.legalName}</span>
                    <span className="tabular block text-xs text-muted-foreground">
                      {e.legalName} · {cnpj(e.cnpj)}
                    </span>
                    <span className={cn('mt-1.5 inline-block rounded-md border px-1.5 text-xs font-medium', e.productionEnabled ? 'border-destructive/40 text-destructive' : 'text-muted-foreground')}>
                      {e.productionEnabled ? 'Produção' : 'Ambiente de teste'}
                    </span>
                  </Opcao>
                ))}
              </div>
            )}
          </Passo>

          <Passo n={2} titulo="Paciente">
            <PatientPicker valor={paciente} onChange={(p) => setEscolha((x) => ({ ...x, paciente: p }))} onNovo={() => setNovoPaciente(true)} />
            {novoPaciente && <PatientDialog aberto onFechar={() => setNovoPaciente(false)} onSalvo={(p) => setEscolha((x) => ({ ...x, paciente: p }))} />}
          </Passo>

          <Passo n={3} titulo="Profissional responsável">
            {profissionais.isPending ? (
              <Skeleton className="h-20" />
            ) : (
              <div role="radiogroup" aria-label="Profissional" className="grid gap-2">
                {profissionais.data?.map((p) => (
                  <Opcao key={p.id} marcada={profissional?.id === p.id} onClick={() => setEscolha((x) => ({ ...x, profissional: p.id }))}>
                    <span className="block font-medium">{p.name}</span>
                    <span className="tabular block text-xs text-muted-foreground">
                      {p.council}-{p.crmState} {p.crmNumber}
                      {rqeAtivos(p) ? ` · RQE ${rqeAtivos(p)}` : ''}
                    </span>
                    {p.specialty && <span className="block text-xs text-muted-foreground">{p.specialty}</span>}
                  </Opcao>
                ))}
                {profissionais.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum profissional cadastrado. Cadastre em "Profissionais".</p>}
              </div>
            )}
          </Passo>

          {referencia === null ? (
            <button
              type="button"
              className="justify-self-start rounded-sm text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => setReferencia('')}
            >
              Adicionar referência do atendimento
            </button>
          ) : (
            <Campo id="ref" label="Referência do atendimento (opcional)" dica="Ex.: número do agendamento. Impede nota em dobro para a mesma consulta.">
              <Input id="ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="agendamento-4821" className="max-w-sm" />
            </Campo>
          )}

          <Passo n={4} titulo="Serviços">
            <SeletorServicos
              companyId={empresa?.id ?? null}
              ocupado={ocupado}
              desabilitado={pronto ? undefined : 'Escolha a empresa, o paciente e o profissional primeiro.'}
              onServico={(s) => void comecar((id) => m.adicionarItem.mutateAsync({ id, serviceTemplateId: s.id }))}
              onModelo={(templateId) => void comecar((id) => m.aplicarModelo.mutateAsync({ id, templateId }))}
            />
          </Passo>
        </div>

        <aside className="xl:sticky xl:top-8 xl:self-start">
          <NotaViva
            empresa={empresa}
            paciente={paciente}
            profissional={profissional ? { name: profissional.name, council: profissional.council, crmNumber: profissional.crmNumber, crmState: profissional.crmState, rqe: rqeAtivos(profissional), specialty: profissional.specialty } : null}
            itens={[]}
            total={0}
            referencia={referencia?.trim() || null}
          />
        </aside>
      </div>
    </>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`passo-${n}`}>
      <h2 id={`passo-${n}`} className="mb-3 flex items-baseline gap-2 text-lg font-semibold">
        <span className="tabular text-sm font-medium text-muted-foreground">{n}.</span> {titulo}
      </h2>
      {children}
    </section>
  );
}

export function Opcao({ marcada, onClick, children }: { marcada: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcada}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start justify-start rounded-xl border bg-card p-3 text-left transition-colors hover:border-taupe focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        marcada && 'border-primary bg-accent',
      )}
    >
      {children}
    </button>
  );
}
