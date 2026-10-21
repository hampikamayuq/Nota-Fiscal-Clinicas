import { useEffect, useState } from 'react';
import { Building2, ChartColumn, FileText, History, Layers, LayoutDashboard, ListChecks, LogOut, Menu, Plus, Stethoscope, Users, X } from 'lucide-react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Marca } from '@/components/marca';
import { ApiError } from '@/lib/api';
import { PAPEL, pode, useLogout, useMe } from '@/lib/auth';
import type { Usuario } from '@/lib/tipos';

type Item = { to: string; rotulo: string; Icone: typeof LayoutDashboard; fim?: boolean; so?: 'verAuditoria' };

/** Dois grupos, os mesmos itens para todos os papéis: o dia a dia do balcão e os cadastros por trás dele. */
const GRUPOS: { rotulo: string; itens: Item[] }[] = [
  {
    rotulo: 'Operação',
    itens: [
      { to: '/', rotulo: 'Início', Icone: LayoutDashboard, fim: true },
      { to: '/notas', rotulo: 'Notas', Icone: FileText },
      { to: '/relatorios', rotulo: 'Relatórios', Icone: ChartColumn },
      { to: '/pacientes', rotulo: 'Pacientes', Icone: Users },
    ],
  },
  {
    rotulo: 'Cadastros',
    itens: [
      { to: '/profissionais', rotulo: 'Profissionais', Icone: Stethoscope },
      { to: '/servicos', rotulo: 'Serviços', Icone: ListChecks },
      { to: '/modelos', rotulo: 'Modelos', Icone: Layers },
      { to: '/empresas', rotulo: 'Empresas', Icone: Building2 },
      { to: '/auditoria', rotulo: 'Auditoria', Icone: History, so: 'verAuditoria' },
    ],
  },
];

const Logo = () => (
  <NavLink to="/" className="font-heading text-lg font-medium tracking-tight whitespace-nowrap">
    <Marca />
  </NavLink>
);

function Itens({ altura, usuario }: { altura: string; usuario: Usuario }) {
  return (
    <>
      {GRUPOS.map((g) => (
        <div key={g.rotulo} className="grid gap-1">
          <p className="rotulo px-3 pt-3 pb-1">{g.rotulo}</p>
          {g.itens
            .filter((i) => !i.so || pode(usuario, i.so))
            .map(({ to, rotulo, Icone, fim }) => (
              <NavLink
                key={to}
                to={to}
                end={fim}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    altura,
                    isActive ? 'bg-card font-semibold text-foreground' : 'text-muted-foreground',
                  )
                }
              >
                <Icone className="size-4 shrink-0" aria-hidden />
                {rotulo}
              </NavLink>
            ))}
        </div>
      ))}
    </>
  );
}

export function Shell() {
  const me = useMe();
  const sair = useLogout();
  const local = useLocation();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [local.pathname]);

  if (me.isPending) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace state={{ de: local.pathname + local.search }} />;
    return <p className="p-8 text-destructive">Não foi possível falar com o servidor: {me.error.message}</p>;
  }
  const u = me.data;
  const Sair = ({ className }: { className?: string }) => (
    <Button variant="ghost" size="sm" className={className} onClick={() => sair.mutate()} disabled={sair.isPending}>
      <LogOut /> Sair
    </Button>
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* Celular: barra fixa com a ação principal e um menu de largura total, itens de 52 px. */}
      <header className="sticky top-0 z-40 border-b bg-card md:hidden">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Button render={<NavLink to="/notas/nova" />} nativeButton={false} size="sm">
              <Plus /> Nova nota
            </Button>
            <Button variant="outline" size="icon" aria-label={menu ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menu} aria-controls="menu-movel" onClick={() => setMenu((m) => !m)}>
              {menu ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {menu && (
          <nav id="menu-movel" aria-label="Principal" className="grid gap-1 border-t bg-secondary p-3">
            <Itens altura="h-13" usuario={u} />
            <div className="mt-2 flex items-center justify-between border-t pt-3 pl-3">
              <p className="text-sm">
                <span className="font-semibold">{u.name}</span> <span className="text-muted-foreground">· {PAPEL[u.role]}</span>
              </p>
              <Sair />
            </div>
          </nav>
        )}
      </header>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-sidebar px-4 py-6 md:flex">
        <div className="px-3">
          <Logo />
        </div>
        <Button render={<NavLink to="/notas/nova" />} nativeButton={false} className="mt-6 justify-start">
          <Plus /> Nova nota
        </Button>
        <nav aria-label="Principal" className="mt-4 grid gap-1">
          <Itens altura="h-10" usuario={u} />
        </nav>
        <div className="mt-auto border-t pt-4">
          <p className="truncate px-3 text-sm font-semibold">{u.name}</p>
          <p className="px-3 text-xs text-muted-foreground">{PAPEL[u.role]}</p>
          <Sair className="mt-2 w-full justify-start" />
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}
