import { useEffect, useState } from 'react';

/** O valor só muda depois de `ms` sem alterações: busca no servidor sem uma ida por tecla. */
export function useDebounce<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return v;
}
