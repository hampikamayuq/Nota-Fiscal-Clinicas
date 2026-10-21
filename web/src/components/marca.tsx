import { useEffect } from 'react';
import { useMarca } from '@/lib/queries';

/** "<Clínica> Fiscal": o nome vem de CLINIC_NAME no servidor e também vira o título da aba. */
export function Marca() {
  const m = useMarca();
  const nome = m.data?.clinicName ?? '';
  useEffect(() => {
    document.title = nome ? `${nome} Fiscal` : 'Fiscal';
  }, [nome]);
  return (
    <>
      {nome ? `${nome} ` : ''}
      <span className="text-brand">Fiscal</span>
    </>
  );
}
