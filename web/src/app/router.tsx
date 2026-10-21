import { Navigate, createBrowserRouter } from 'react-router';
import { Shell } from './layout';
import { Dashboard } from '@/pages/dashboard';
import { Empresas } from '@/pages/empresas';
import { Auditoria } from '@/pages/auditoria';
import { Login } from '@/pages/login';
import { Modelos } from '@/pages/modelos';
import { NotaPage } from '@/pages/nota';
import { Notas } from '@/pages/notas';
import { NovaNota } from '@/pages/nova-nota';
import { Pacientes } from '@/pages/pacientes';
import { Relatorios } from '@/pages/relatorios';
import { Profissionais } from '@/pages/profissionais';
import { Servicos } from '@/pages/servicos';

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <Shell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'notas', element: <Notas /> },
      { path: 'notas/nova', element: <NovaNota /> },
      { path: 'notas/:id', element: <NotaPage /> },
      { path: 'relatorios', element: <Relatorios /> },
      { path: 'pacientes', element: <Pacientes /> },
      { path: 'profissionais', element: <Profissionais /> },
      { path: 'servicos', element: <Servicos /> },
      { path: 'modelos', element: <Modelos /> },
      { path: 'empresas', element: <Empresas /> },
      { path: 'auditoria', element: <Auditoria /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
