import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';

export function useDebounce<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'VALIDACION' && Array.isArray(e.details)) {
      return (e.details as Array<{ campo: string; mensaje: string }>).map((d) => `${d.campo ? `${d.campo}: ` : ''}${d.mensaje}`).join(' · ');
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Ocurrió un error inesperado';
}
