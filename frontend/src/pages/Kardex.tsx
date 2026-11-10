import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { get } from '../api/client';
import type { KardexRow, Paged, Product } from '../api/types';
import { ProductPicker } from '../components/ProductPicker';
import { Badge, Card, DataTable, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, Select, SkeletonRows } from '../components/ui';
import { addDays, fmtDateTime, money, MOVEMENT_LABEL, todayLima } from '../lib/format';

const TONE: Record<string, 'brand' | 'red' | 'amber' | 'blue' | 'gray'> = { PURCHASE: 'brand', SALE: 'blue', ADJUSTMENT: 'amber', WASTE: 'red', RETURN: 'gray', VOID: 'amber' };

export default function Kardex() {
  const [product, setProduct] = useState<Product | null>(null);
  const [type, setType] = useState('');
  const [from, setFrom] = useState(addDays(todayLima(), -30));
  const [to, setTo] = useState(todayLima());
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['kardex', product?.id, type, from, to, page],
    queryFn: () => get<Paged<KardexRow>>('/inventory/kardex', { productId: product?.id, type: type || undefined, from, to, page, limit: 50 }),
    placeholderData: (p) => p,
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  return (
    <>
      <PageHeader title="Kardex" subtitle="Historial de movimientos de inventario: ingresos, ventas, ajustes, mermas y devoluciones" />
      <Card padded={false}>
        <div className="grid gap-3 border-b border-ink-200 p-4 dark:border-ink-700 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Producto (opcional)" className="sm:col-span-2 lg:col-span-1">{(id) => <ProductPicker id={id} value={product} onChange={reset(setProduct)} placeholder="Todos los productos" />}</Field>
          <Field label="Tipo">
            {(id) => (
              <Select id={id} value={type} onChange={(e) => reset(setType)(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(MOVEMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Desde">{(id) => <Input id={id} type="date" value={from} max={to} onChange={(e) => reset(setFrom)(e.target.value)} />}</Field>
          <Field label="Hasta">{(id) => <Input id={id} type="date" value={to} min={from} onChange={(e) => reset(setTo)(e.target.value)} />}</Field>
        </div>
        {q.isLoading ? (
          <SkeletonRows />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data!.data.length === 0 ? (
          <EmptyState title="Sin movimientos" hint="No hay movimientos con estos filtros." icon="list" />
        ) : (
          <>
            <DataTable
              dense
              rows={q.data!.data}
              rowKey={(r) => r.id}
              columns={[
                { header: 'Fecha', cell: (r) => fmtDateTime(r.createdAt) },
                { header: 'Producto', cell: (r) => <span className="font-medium">{r.productName}</span> },
                { header: 'Lote', hideOnMobile: true, cell: (r) => <span className="num">{r.batchNumber ?? '—'}</span> },
                { header: 'Tipo', cell: (r) => <Badge tone={TONE[r.type] ?? 'gray'}>{MOVEMENT_LABEL[r.type] ?? r.type}</Badge> },
                { header: 'Cantidad', align: 'right', cell: (r) => <span className={`num font-semibold ${r.quantity < 0 ? 'text-red-700 dark:text-red-300' : 'text-brand-700 dark:text-brand-300'}`}>{r.quantity > 0 ? `+${r.quantity}` : r.quantity}</span> },
                { header: 'Saldo', align: 'right', hideOnMobile: true, cell: (r) => <span className="num">{r.balance ?? '—'}</span> },
                { header: 'Costo unit.', align: 'right', hideOnMobile: true, cell: (r) => <span className="num">{r.unitCost != null ? money(r.unitCost) : '—'}</span> },
                { header: 'Motivo / ref.', hideOnMobile: true, cell: (r) => <span className="text-xs">{[r.reason, r.reference].filter(Boolean).join(' · ') || '—'}</span> },
                { header: 'Usuario', hideOnMobile: true, cell: (r) => r.userName ?? '—' },
              ]}
            />
            <Pagination page={page} limit={50} total={q.data!.meta.total} onPage={setPage} />
          </>
        )}
      </Card>
      {!product && <p className="mt-2 text-xs text-ink-600 dark:text-ink-300">El saldo acumulado se muestra al filtrar por un producto.</p>}
    </>
  );
}
