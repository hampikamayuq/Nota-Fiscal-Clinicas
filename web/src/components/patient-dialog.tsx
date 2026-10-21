import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Campo } from '@/components/campo';
import { get, mensagemDeErro } from '@/lib/api';
import { useMutacoes } from '@/lib/queries';
import type { Paciente, TipoPaciente } from '@/lib/tipos';

const TIPOS: { valor: TipoPaciente; rotulo: string }[] = [
  { valor: 'INDIVIDUAL', rotulo: 'Pessoa física' },
  { valor: 'COMPANY', rotulo: 'Empresa / convênio' },
  { valor: 'FOREIGN', rotulo: 'Estrangeiro' },
  { valor: 'UNIDENTIFIED', rotulo: 'Não informado' },
];

const digitos = (s: string) => s.replace(/\D/g, '');
const Schema = z
  .object({
    type: z.enum(['INDIVIDUAL', 'COMPANY', 'FOREIGN', 'UNIDENTIFIED']),
    name: z.string().trim().min(2, 'Nome com pelo menos 2 letras'),
    cpf: z.string(),
    cnpj: z.string(),
    foreignDocument: z.string(),
    email: z.string().trim().email('E-mail inválido').or(z.literal('')),
    phone: z.string(),
    postalCode: z.string(),
    street: z.string(),
    number: z.string(),
    complement: z.string(),
    district: z.string(),
    city: z.string(),
    state: z.string().trim().max(60),
    municipalityCode: z.string(),
    countryCode: z.string().trim().toUpperCase(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'INDIVIDUAL' && digitos(v.cpf).length !== 11) ctx.addIssue({ code: 'custom', path: ['cpf'], message: 'CPF com 11 dígitos' });
    if (v.type === 'COMPANY' && digitos(v.cnpj).length !== 14) ctx.addIssue({ code: 'custom', path: ['cnpj'], message: 'CNPJ com 14 dígitos' });
    if (v.type === 'FOREIGN' && !/^[A-Z]{2}$/.test(v.countryCode)) ctx.addIssue({ code: 'custom', path: ['countryCode'], message: 'Código ISO de 2 letras (ex.: US, GB, AR)' });
    if (v.type !== 'FOREIGN' && v.state && v.state.length !== 2) ctx.addIssue({ code: 'custom', path: ['state'], message: 'UF com 2 letras' });
  });
type Valores = z.infer<typeof Schema>;

const vazio = (p?: Paciente | null): Valores => ({
  type: p?.type ?? 'INDIVIDUAL',
  name: p?.name ?? '',
  cpf: p?.cpf ?? '',
  cnpj: p?.cnpj ?? '',
  foreignDocument: p?.foreignDocument ?? '',
  email: p?.email ?? '',
  phone: p?.phone ?? '',
  postalCode: p?.postalCode ?? '',
  street: p?.street ?? '',
  number: p?.number ?? '',
  complement: p?.complement ?? '',
  district: p?.district ?? '',
  city: p?.city ?? '',
  state: p?.state ?? '',
  municipalityCode: p?.municipalityCode ?? '',
  countryCode: p?.type === 'FOREIGN' ? (p.countryCode ?? '') : '',
});

type CepConsultado = { codigoMunicipio: string; logradouro: string; bairro: string; municipio: string; uf: string };

type Props = { aberto: boolean; paciente?: Paciente | null; onFechar: () => void; onSalvo?: (p: Paciente) => void };

export function PatientDialog({ aberto, paciente, onFechar, onSalvo }: Props) {
  const m = useMutacoes();
  const form = useForm<Valores>({ resolver: zodResolver(Schema), values: vazio(paciente) });
  const tipo = form.watch('type');
  const pendente = m.criarPaciente.isPending || m.editarPaciente.isPending;
  const [cep, numero, ibge] = form.watch(['postalCode', 'number', 'municipalityCode']);

  /** O IBGE só vale para o CEP consultado: mudou o CEP, ele sai até a próxima consulta. */
  const buscarCep = () => {
    if (tipo === 'FOREIGN') return;
    const d = digitos(cep);
    if (d.length !== 8) return;
    get<CepConsultado>(`/api/cep/${d}`)
      .then((e) => {
        const preencher = { shouldDirty: true } as const;
        if (e.logradouro) form.setValue('street', e.logradouro, preencher);
        if (e.bairro) form.setValue('district', e.bairro, preencher);
        form.setValue('city', e.municipio, preencher);
        form.setValue('state', e.uf, preencher);
        form.setValue('municipalityCode', e.codigoMunicipio, preencher);
      })
      .catch((e: unknown) => toast.error(mensagemDeErro(e)));
  };

  const salvar = (v: Valores) => {
    const ouNulo = (s: string) => (s.trim() ? s.trim() : null);
    const dados = {
      type: v.type,
      name: v.name,
      cpf: v.type === 'INDIVIDUAL' ? digitos(v.cpf) : null,
      cnpj: v.type === 'COMPANY' ? digitos(v.cnpj) : null,
      foreignDocument: v.type === 'FOREIGN' ? ouNulo(v.foreignDocument) : null,
      email: ouNulo(v.email),
      phone: ouNulo(v.phone),
      postalCode: ouNulo(v.postalCode),
      street: ouNulo(v.street),
      number: ouNulo(v.number),
      complement: ouNulo(v.complement),
      district: ouNulo(v.district),
      city: ouNulo(v.city),
      state: v.type === 'FOREIGN' ? ouNulo(v.state) : ouNulo(v.state.toUpperCase()),
      municipalityCode: v.type === 'FOREIGN' ? null : ouNulo(v.municipalityCode),
      countryCode: v.type === 'FOREIGN' ? v.countryCode : 'BR',
    };
    const op = paciente ? m.editarPaciente.mutateAsync({ id: paciente.id, ...dados }) : m.criarPaciente.mutateAsync(dados);
    op.then((p) => {
      toast.success(paciente ? 'Paciente atualizado' : 'Paciente cadastrado');
      onSalvo?.(p);
      onFechar();
    }).catch((e: unknown) => toast.error(mensagemDeErro(e)));
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{paciente ? 'Editar paciente' : 'Novo paciente'}</DialogTitle>
          <DialogDescription>Só o necessário para a nota e o reembolso. Nada clínico entra aqui.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(salvar)} className="grid gap-4" noValidate>
          <div role="radiogroup" aria-label="Tipo de tomador" className="flex flex-wrap gap-1.5">
            {TIPOS.map((t) => (
              <button
                key={t.valor}
                type="button"
                role="radio"
                aria-checked={tipo === t.valor}
                onClick={() => form.setValue('type', t.valor)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  tipo === t.valor && 'border-primary bg-primary text-primary-foreground hover:bg-primary',
                )}
              >
                {t.rotulo}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="p-nome" label="Nome" erro={form.formState.errors.name?.message} className="sm:col-span-2">
              <Input id="p-nome" autoFocus {...form.register('name')} />
            </Campo>
            {tipo === 'INDIVIDUAL' && (
              <Campo id="p-cpf" label="CPF" erro={form.formState.errors.cpf?.message}>
                <Input id="p-cpf" inputMode="numeric" placeholder="000.000.000-00" {...form.register('cpf')} />
              </Campo>
            )}
            {tipo === 'COMPANY' && (
              <Campo id="p-cnpj" label="CNPJ" erro={form.formState.errors.cnpj?.message}>
                <Input id="p-cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" {...form.register('cnpj')} />
              </Campo>
            )}
            {tipo === 'FOREIGN' && (
              <Campo id="p-doc" label="Documento (passaporte, NIF)">
                <Input id="p-doc" {...form.register('foreignDocument')} />
              </Campo>
            )}
            <Campo id="p-email" label="E-mail" erro={form.formState.errors.email?.message}>
              <Input id="p-email" type="email" {...form.register('email')} />
            </Campo>
            <Campo id="p-tel" label="Telefone" dica="DDD + número">
              <Input id="p-tel" inputMode="tel" {...form.register('phone')} />
            </Campo>
            {tipo === 'FOREIGN' && (
              <Campo id="p-pais" label="País (código ISO)" erro={form.formState.errors.countryCode?.message} dica="Ex.: US, GB, AR, PT">
                <Input id="p-pais" maxLength={2} className="uppercase" autoComplete="off" {...form.register('countryCode')} />
              </Campo>
            )}
            <Campo
              id="p-cep"
              label={tipo === 'FOREIGN' ? 'Código postal' : 'CEP'}
              dica={
                tipo === 'FOREIGN'
                  ? 'Com documento (NIF), o endereço no exterior é obrigatório: país, código postal, cidade, estado/região, logradouro, número e bairro.'
                  : ibge && numero.trim()
                    ? 'O endereço vai na nota.'
                    : 'Opcional. Com CEP consultado e número, o endereço vai na nota.'
              }
            >
              <Input
                id="p-cep"
                inputMode={tipo === 'FOREIGN' ? 'text' : 'numeric'}
                {...form.register('postalCode', { onChange: () => form.setValue('municipalityCode', ''), onBlur: buscarCep })}
              />
            </Campo>
            <Campo id="p-rua" label="Logradouro" className="sm:col-span-2">
              <Input id="p-rua" {...form.register('street')} />
            </Campo>
            <Campo id="p-num" label="Número">
              <Input id="p-num" {...form.register('number')} />
            </Campo>
            <Campo id="p-comp" label="Complemento">
              <Input id="p-comp" {...form.register('complement')} />
            </Campo>
            <Campo id="p-bairro" label="Bairro">
              <Input id="p-bairro" {...form.register('district')} />
            </Campo>
            <Campo id="p-cidade" label="Cidade">
              <Input id="p-cidade" {...form.register('city')} />
            </Campo>
            <Campo id="p-uf" label={tipo === 'FOREIGN' ? 'Estado/região' : 'UF'} erro={form.formState.errors.state?.message}>
              <Input id="p-uf" maxLength={tipo === 'FOREIGN' ? 60 : 2} className={tipo === 'FOREIGN' ? undefined : 'uppercase'} {...form.register('state')} />
            </Campo>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? 'Salvando…' : paciente ? 'Salvar alterações' : 'Cadastrar paciente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
