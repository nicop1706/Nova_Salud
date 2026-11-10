import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { get } from '../api/client';
import type { Product } from '../api/types';
import { useDebounce } from '../hooks/common';
import { Input } from './ui';

/** Selector de producto con búsqueda instantánea (accesible: combobox + listbox). */
export function ProductPicker({ id, value, onChange, placeholder = 'Buscar producto por nombre, SKU o código…' }: { id?: string; value: Product | null; onChange: (p: Product | null) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 200);
  const res = useQuery({
    queryKey: ['pos-search', 'picker', dq],
    queryFn: () => get<{ data: Product[] }>('/products/search', { q: dq, limit: 8 }),
    enabled: dq.trim().length >= 1 && !value,
  });
  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-ink-300 bg-ink-50 px-3 py-2 text-sm dark:border-ink-600 dark:bg-ink-800">
        <span className="min-w-0 truncate">
          <span className="font-medium">{value.name}</span> <span className="text-ink-600 dark:text-ink-300">· {value.sku}</span>
        </span>
        <button type="button" className="shrink-0 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300" onClick={() => onChange(null)}>
          Cambiar
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={!!res.data?.data.length} aria-autocomplete="list" />
      {dq.trim() && res.data && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-ink-200 bg-white shadow-lg dark:border-ink-700 dark:bg-ink-900">
          {res.data.data.length === 0 && <li className="px-3 py-2 text-sm text-ink-600 dark:text-ink-300">Sin resultados.</li>}
          {res.data.data.map((p) => (
            <li key={p.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-ink-50 dark:hover:bg-ink-800"
                onClick={() => {
                  onChange(p);
                  setQ('');
                }}
              >
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-xs text-ink-600 dark:text-ink-300">{[p.presentation, p.sku].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
