import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { download, get } from '../api/client';
import type { Product, ReportDataset } from '../api/types';
import { Icon } from '../components/Icon';
import { ProductPicker } from '../components/ProductPicker';
import { Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, SkeletonRows, Tabs } from '../components/ui';
import { errMsg } from '../hooks/common';
import { addDays, fmtDate, fmtDateTime, money, num, todayLima } from '../lib/format';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';

type Key = 'sales' | 'kardex' | 'valued-inventory' | 'low-rotation' | 'expirations';
const REPORTS: Array<{ id: Key; label: string; dates: boolean; product?: boolean; days?: boolean; adminOnly?: boolean }> = [
  { id: 'sales', label: 'Ventas', dates: true, adminOnly: true },
  { id: 'kardex', label: 'Kardex', dates: true, product: true },
  { id: 'valued-inventory', label: 'Inventario valorizado', dates: false },
  { id: 'low-rotation', label: 'Baja rotación', dates: false, days: true },
  { id: 'expirations', label: 'Vencimientos', dates: false, days: true },
];

function cell(type: string, v: string | number | null) {
  if (v == null || v === '') return '—';
  switch (type) {
    case 'money': return money(Number(v));
    case 'int': return num(Number(v));
    case 'number': return num(Number(v));
    case 'date': return fmtDate(String(v));
    case 'datetime': return fmtDateTime(String(v));
    default: return String(v);
  }
}

export default function Reports() {
  const { can } = useAuth();
  const toast = useToast();
  const available = REPORTS.filter((r) => !r.adminOnly || can('ADMIN'));
  const [key, setKey] = useState<Key>(available[0].id);
  const meta = REPORTS.find((r) => r.id === key)!;
  const [from, setFrom] = useState(addDays(todayLima(), -30));
  const [to, setTo] = useState(todayLima());
  const [days, setDays] = useState('90');
  const [product, setProduct] = useState<Product | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const query = {
    from: meta.dates ? from : undefined,
    to: meta.dates ? to : undefined,
    productId: meta.product ? product?.id : undefined,
    days: meta.days ? Number(days) || undefined : undefined,
  };
  const q = useQuery({ queryKey: ['reports', key, query], queryFn: () => get<{ data: ReportDataset }>(`/reports/${key}`, query) });
  const d = q.data?.data;

  const dl = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setBusy(format);
    try {
      await download(`/reports/${key}`, { ...query, format }, `${key}.${format}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Reportes" subtitle="Filtra, revisa en pantalla y exporta a CSV, Excel o PDF" />
      <Tabs value={key} onChange={setKey} tabs={available.map((r) => ({ id: r.id, label: r.label }))} />
      <Card padded={false}>
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4 dark:border-ink-700">
          {meta.dates && (
            <>
              <Field label="Desde">{(id) => <Input id={id} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />}</Field>
              <Field label="Hasta">{(id) => <Input id={id} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />}</Field>
            </>
          )}
          {meta.days && <Field label={key === 'expirations' ? 'Vencen en los próximos (días)' : 'Sin ventas en (días)'}>{(id) => <Input id={id} inputMode="numeric" className="w-28" value={days} onChange={(e) => setDays(e.target.value)} />}</Field>}
          {meta.product && <Field label="Producto (opcional)" className="min-w-[16rem]">{(id) => <ProductPicker id={id} value={product} onChange={setProduct} placeholder="Todos" />}</Field>}
          <div className="ml-auto flex flex-wrap gap-2">
            {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
              <Button key={f} variant="secondary" loading={busy === f} disabled={!d || d.totalRows === 0} onClick={() => dl(f)}>
                <Icon name="download" className="h-4 w-4" /> {f === 'xlsx' ? 'Excel' : f.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
        {q.isLoading ? (
          <SkeletonRows rows={8} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !d || d.rows.length === 0 ? (
          <EmptyState title="Sin datos para los filtros elegidos" icon="file" />
        ) : (
          <>
            <div className="px-4 pt-3 text-sm text-ink-700 dark:text-ink-200">
              <p className="font-semibold">{d.title}</p>
              <p className="text-xs">{d.subtitle} · {num(d.totalRows)} fila(s){d.truncated ? ' (vista previa de las primeras 500; la exportación incluye todo)' : ''}</p>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-ink-50 dark:bg-ink-800">
                  <tr>
                    {d.columns.map((c) => (
                      <th key={c.key} scope="col" className={`whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-300 ${c.type === 'text' || c.type === 'date' || c.type === 'datetime' ? 'text-left' : 'text-right'}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {d.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-ink-50 dark:hover:bg-ink-800/50">
                      {d.columns.map((c) => (
                        <td key={c.key} className={`px-3 py-2 text-ink-800 dark:text-ink-100 ${c.type === 'text' || c.type === 'date' || c.type === 'datetime' ? '' : 'num text-right'}`}>{cell(c.type, r[c.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {d.totals && (
                  <tfoot>
                    <tr className="border-t-2 border-ink-300 bg-ink-50 font-bold dark:border-ink-600 dark:bg-ink-800">
                      {d.columns.map((c) => (
                        <td key={c.key} className={`px-3 py-2 ${c.type === 'text' || c.type === 'date' || c.type === 'datetime' ? '' : 'num text-right'}`}>{d.totals![c.key] == null ? '' : cell(c.type, d.totals![c.key])}</td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
