import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '../api/client';
import type { StockCountDetail, StockCountSummary } from '../api/types';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Input, PageHeader, SearchInput, SkeletonRows } from '../components/ui';
import { errMsg } from '../hooks/common';
import { fmtDateTime, money } from '../lib/format';
import { useToast } from '../store/toast';

const STATUS: Record<string, { tone: 'blue' | 'brand' | 'gray'; label: string }> = { OPEN: { tone: 'blue', label: 'En curso' }, APPLIED: { tone: 'brand', label: 'Aplicado' }, CANCELLED: { tone: 'gray', label: 'Cancelado' } };

export default function StockCounts() {
  const toast = useToast();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<number | null>(null);
  const list = useQuery({ queryKey: ['inventory', 'counts'], queryFn: () => get<{ data: StockCountSummary[] }>('/inventory/counts') });
  const create = useMutation({
    mutationFn: () => post<{ data: { id: number } }>('/inventory/counts', { notes: `Toma de inventario ${new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}` }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['inventory', 'counts'] });
      setOpenId(r.data.id);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (openId != null) return <CountSheet id={openId} onBack={() => setOpenId(null)} />;
  return (
    <>
      <PageHeader
        title="Toma de inventario"
        subtitle="Compara el stock físico con el del sistema. Al aplicar, las diferencias se registran como ajustes en el kardex."
        actions={
          <Button onClick={() => create.mutate()} loading={create.isPending}>
            <Icon name="plus" className="h-4 w-4" /> Nuevo conteo
          </Button>
        }
      />
      <Card padded={false}>
        {list.isLoading ? (
          <SkeletonRows />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data!.data.length === 0 ? (
          <EmptyState title="Aún no hay conteos" hint="Crea un conteo, registra lo que hay físicamente y aplícalo." icon="clipboard" />
        ) : (
          <DataTable
            rows={list.data!.data}
            rowKey={(c) => c.id}
            onRowClick={(c) => setOpenId(c.id)}
            columns={[
              { header: 'N.º', cell: (c) => <span className="num">{c.id}</span> },
              { header: 'Creado', cell: (c) => fmtDateTime(c.createdAt) },
              { header: 'Responsable', hideOnMobile: true, cell: (c) => c.createdByName },
              { header: 'Contados', align: 'right', cell: (c) => <span className="num">{c.counted}/{c.items}</span> },
              { header: 'Diferencias', align: 'right', cell: (c) => <span className="num">{c.differences}</span> },
              { header: 'Estado', cell: (c) => <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge> },
            ]}
          />
        )}
      </Card>
    </>
  );
}

function CountSheet({ id, onBack }: { id: number; onBack: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['inventory', 'counts', id], queryFn: () => get<{ data: StockCountDetail }>(`/inventory/counts/${id}`) });
  const d = q.data?.data;
  const [vals, setVals] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const open = d?.status === 'OPEN';

  useEffect(() => {
    if (d) setVals(Object.fromEntries(d.items.map((i) => [i.productId, i.countedQty == null ? '' : String(i.countedQty)])));
  }, [d]);

  const dirty = useMemo(() => (d ? d.items.filter((i) => (vals[i.productId] ?? '') !== (i.countedQty == null ? '' : String(i.countedQty))) : []), [d, vals]);
  const invalid = dirty.some((i) => vals[i.productId] !== '' && (!Number.isInteger(Number(vals[i.productId])) || Number(vals[i.productId]) < 0));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['alerts'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['kardex'] });
  };
  const save = useMutation({
    mutationFn: () => put(`/inventory/counts/${id}`, { items: dirty.map((i) => ({ productId: i.productId, countedQty: vals[i.productId] === '' ? null : Number(vals[i.productId]) })) }),
    onSuccess: () => {
      toast.success('Conteo guardado');
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const rows = (d?.items ?? []).filter((i) => {
    const t = search.trim().toLowerCase();
    if (t && !`${i.name} ${i.sku}`.toLowerCase().includes(t)) return false;
    if (onlyDiff) {
      const v = vals[i.productId];
      return v !== '' && v !== undefined && Number(v) !== i.systemQty;
    }
    return true;
  });
  const diffValue = (d?.items ?? []).reduce((s, i) => {
    const v = vals[i.productId];
    return v === '' || v === undefined ? s : s + (Number(v) - i.systemQty) * i.purchasePrice;
  }, 0);

  return (
    <>
      <PageHeader
        title={`Conteo N.º ${id}`}
        subtitle={d ? `${STATUS[d.status].label} · creado ${fmtDateTime(d.createdAt)} por ${d.createdByName}` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={onBack}>Volver</Button>
            {open && (
              <>
                <Button variant="secondary" onClick={() => setConfirmCancel(true)}>Cancelar conteo</Button>
                <Button variant="secondary" disabled={!dirty.length || invalid} loading={save.isPending} onClick={() => save.mutate()}>Guardar ({dirty.length})</Button>
                <Button disabled={dirty.length > 0} onClick={() => setConfirmApply(true)} title={dirty.length ? 'Guarda los cambios primero' : undefined}>Aplicar diferencias</Button>
              </>
            )}
          </>
        }
      />
      {q.isLoading ? (
        <SkeletonRows rows={8} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        d && (
          <Card padded={false}>
            <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 p-4 dark:border-ink-700">
              <SearchInput value={search} onChange={setSearch} placeholder="Filtrar por nombre o SKU" className="w-full max-w-sm" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-700" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Solo con diferencia</label>
              <span className="ml-auto text-sm text-ink-700 dark:text-ink-200">Diferencia valorizada: <span className="num font-semibold">{money(diffValue)}</span></span>
            </div>
            {rows.length === 0 ? (
              <EmptyState title="Sin filas" hint="Cambia el filtro." />
            ) : (
              <DataTable
                dense
                rows={rows}
                rowKey={(i) => i.productId}
                columns={[
                  { header: 'Producto', cell: (i) => <div><p className="font-medium">{i.name}</p><p className="text-xs text-ink-600 dark:text-ink-300">{i.sku}{i.presentation ? ` · ${i.presentation}` : ''}</p></div> },
                  { header: 'Sistema', align: 'right', cell: (i) => <span className="num">{i.systemQty}</span> },
                  {
                    header: 'Físico',
                    align: 'right',
                    cell: (i) =>
                      open ? (
                        <Input aria-label={`Conteo físico de ${i.name}`} inputMode="numeric" className="ml-auto h-9 w-24 text-right" value={vals[i.productId] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [i.productId]: e.target.value }))} />
                      ) : (
                        <span className="num">{i.countedQty ?? '—'}</span>
                      ),
                  },
                  {
                    header: 'Diferencia',
                    align: 'right',
                    cell: (i) => {
                      const v = vals[i.productId];
                      const diff = open ? (v === '' || v === undefined ? null : Number(v) - i.systemQty) : i.difference;
                      if (diff == null || Number.isNaN(diff)) return <span className="text-ink-500">—</span>;
                      return <Badge tone={diff === 0 ? 'brand' : 'red'}>{diff > 0 ? `+${diff}` : diff}</Badge>;
                    },
                  },
                ]}
              />
            )}
          </Card>
        )
      )}
      <ConfirmDialog
        open={confirmApply}
        title="Aplicar diferencias"
        confirmLabel="Aplicar"
        message="Se registrará un ajuste por cada diferencia (se descuenta de los lotes con FEFO y se suma al lote más reciente). Esta acción no se puede deshacer."
        onClose={() => setConfirmApply(false)}
        onConfirm={async () => {
          try {
            await post(`/inventory/counts/${id}/apply`);
            toast.success('Conteo aplicado: el inventario fue ajustado');
            refresh();
          } catch (e) {
            toast.error(errMsg(e));
            throw e;
          }
        }}
      />
      <ConfirmDialog
        open={confirmCancel}
        danger
        title="Cancelar conteo"
        confirmLabel="Cancelar conteo"
        message="Se descartará este conteo sin modificar el stock."
        onClose={() => setConfirmCancel(false)}
        onConfirm={async () => {
          try {
            await del(`/inventory/counts/${id}`);
            toast.info('Conteo cancelado');
            refresh();
            onBack();
          } catch (e) {
            toast.error(errMsg(e));
            throw e;
          }
        }}
      />
    </>
  );
}
