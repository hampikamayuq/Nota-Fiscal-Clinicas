import { useState } from 'react';
import { Link } from 'react-router';
import { FilePlus, Pencil, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { PatientDialog } from '@/components/patient-dialog';
import { pode, useMe } from '@/lib/auth';
import { documento } from '@/lib/format';
import { usePacientes } from '@/lib/queries';
import type { Paciente } from '@/lib/tipos';

export function Pacientes() {
  const me = useMe();
  const [q, setQ] = useState('');
  const pacientes = usePacientes(q.trim());
  const [dialogo, setDialogo] = useState<{ aberto: boolean; paciente: Paciente | null }>({ aberto: false, paciente: null });
  const podeEditar = pode(me.data, 'cadastrarPacientes');
  const podeEmitir = pode(me.data, 'operarNotas');

  return (
    <>
      <PageHeader
        titulo="Pacientes"
        descricao="Quem recebe a nota. Só os dados do reembolso; prontuário não mora aqui."
        acoes={
          podeEditar && (
            <Button onClick={() => setDialogo({ aberto: true, paciente: null })}>
              <Plus /> Novo paciente
            </Button>
          )
        }
      />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, CPF, e-mail ou telefone" aria-label="Buscar paciente" className="h-9 pl-8" />
      </div>
      {pacientes.isPending ? (
        <Skeleton className="h-48" />
      ) : pacientes.data?.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{q ? 'Ninguém com esses dados.' : 'Nenhum paciente ainda.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead className="hidden md:table-cell">Contato</TableHead>
                <TableHead className="hidden lg:table-cell">Cidade</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pacientes.data?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="tabular text-muted-foreground">{documento(p)}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{[p.email, p.phone].filter(Boolean).join(' · ') || '—'}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{[p.city, p.state].filter(Boolean).join('/') || '—'}</TableCell>
                  <TableCell>
                    <span className="flex justify-end gap-0.5">
                      {podeEmitir && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Nova nota para ${p.name}`} render={<Link to={`/notas/nova?paciente=${p.id}`} />} nativeButton={false}>
                          <FilePlus />
                        </Button>
                      )}
                      {podeEditar && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Editar ${p.name}`} onClick={() => setDialogo({ aberto: true, paciente: p })}>
                          <Pencil />
                        </Button>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {dialogo.aberto && <PatientDialog aberto paciente={dialogo.paciente} onFechar={() => setDialogo({ aberto: false, paciente: null })} />}
    </>
  );
}
