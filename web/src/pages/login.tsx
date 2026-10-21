import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Campo } from '@/components/campo';
import { Marca } from '@/components/marca';
import { NotaViva } from '@/components/nota-viva';
import { mensagemDeErro } from '@/lib/api';
import { useLogin, useMe } from '@/lib/auth';

/** A folha de exemplo ao lado do formulário: decorativa, com dados genéricos; some no celular. */
const EXEMPLO = {
  empresa: { legalName: 'Clínica Exemplo', cnpj: '00000000000000' },
  paciente: { name: 'Nome do paciente' },
  profissional: { name: 'Profissional responsável', council: 'CRM', crmNumber: '000000', crmState: 'UF', rqe: null, specialty: null },
  itens: [{ id: 'exemplo', nome: 'Consulta', descricao: 'Consulta', tuss: null, quantidade: 1, unitario: 0, total: 0 }],
};

export function Login() {
  const me = useMe();
  const login = useLogin();
  const navegar = useNavigate();
  const local = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  if (me.data) return <Navigate to="/" replace />;

  const entrar = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, senha }, { onSuccess: () => navegar((local.state as { de?: string } | null)?.de ?? '/', { replace: true }) });
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-secondary p-4">
      <div className="grid w-full max-w-4xl items-center gap-8 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <form onSubmit={entrar} className="w-full max-w-sm justify-self-center rounded-xl border bg-card p-8 lg:justify-self-start" aria-labelledby="titulo-login">
          <h1 id="titulo-login" className="text-3xl">
            <Marca />
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Entre para emitir e acompanhar as notas fiscais da clínica.</p>
          <div className="mt-6 grid gap-4">
            <Campo id="email" label="E-mail">
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Campo>
            <Campo id="senha" label="Senha">
              <Input id="senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} className="h-10" />
            </Campo>
            {login.isError && (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {mensagemDeErro(login.error)}
              </p>
            )}
            <Button type="submit" size="lg" disabled={login.isPending} className="mt-2">
              {login.isPending ? 'Entrando…' : 'Entrar'}
            </Button>
          </div>
        </form>
        <div aria-hidden className="hidden lg:block">
          <NotaViva empresa={EXEMPLO.empresa} paciente={EXEMPLO.paciente} profissional={EXEMPLO.profissional} itens={EXEMPLO.itens} total={0} status="AUTHORIZED" numero="0001" />
        </div>
      </div>
    </main>
  );
}
