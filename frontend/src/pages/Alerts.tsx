import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { download, get, post, put } from '../api/client';
import type { AlertRow, AlertSummary, Paged, Replenishment } from '../api/types';
import { Icon } from '../components/Icon';
import { AlertTypeBadge, Button, Card, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, PriorityBadge, Select, SkeletonRows, StatCard } from '../components/ui';
import { errMsg } from '../hooks/common';
import { fmtDateTime, money, num } from '../lib/format';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';

export default function Alerts() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [repl, setRepl] = useState(false);
  const [cfg, setCfg] = useState(false);

  const summary = useQuery({ queryKey: ['alerts', 'summary'], queryFn: () => get<{ data: AlertSummary }>('/alerts/summary') });
  const list = useQuery({
    queryKey: ['alerts', 'list', type, priority, page],
    queryFn: () => get<Paged<AlertRow>>('/alerts', { status: 'OPEN', type: type || undefined, priority: priority || undefined, page, limit: 30 }),
    placeholderData: (p) => p,
  });
  const recalc = useMutation({
    mutationFn: () => post('/alerts/recalculate'),
    onSuccess: () => {
      toast.success('Alertas recalculadas');
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const s = summary.data?.data;
  const canRepl = can('ADMIN', 'WAREHOUSE');

  return (
    <>
      <PageHeader
        title="Alertas de inventario"
        subtitle="Se recalculan cada hora y en tiempo real con cada venta o movimiento"
        actions={
          <>
            {can('ADMIN') && <Button variant="secondary" onClick={() => setCfg(true)}>Umbrales de vencimiento</Button>}
            {canRepl && <Button variant="secondary" loading={recalc.isPending} onClick={() => recalc.mutate()}><Icon name="refresh" className="h-4 w-4" /> Recalcular</Button>}
            {canRepl && <Button onClick={() => setRepl(true)}><Icon name="truck" className="h-4 w-4" /> Generar orden de reposición</Button>}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Críticas" value={s?.critical ?? '—'} tone="red" hint="Agotados y vencidos" />
        <StatCard label="Altas" value={s?.high ?? '—'} tone="amber" hint="Stock bajo / vence pronto" />
        <StatCard label="Medias" value={s?.medium ?? '—'} tone="blue" />
        <StatCard label="Stock (agot. + bajo)" value={s ? s.byType.OUT_OF_STOCK + s.byType.LOW_STOCK : '—'} tone="gray" />
        <StatCard label="Vencimientos" value={s ? s.byType.EXPIRING + s.byType.EXPIRED : '—'} tone="gray" />
      </div>
      <Card padded={false}>
        <div className="grid gap-3 border-b border-ink-200 p-4 dark:border-ink-700 sm:grid-cols-2 lg:grid-cols-4">
          <Select aria-label="Tipo" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">Todos los tipos</option>
            <option value="OUT_OF_STOCK">Agotados</option>
            <option value="LOW_STOCK">Stock bajo</option>
            <option value="EXPIRING">Por vencer</option>
            <option value="EXPIRED">Vencidos</option>
          </Select>
          <Select aria-label="Prioridad" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
            <option value="">Todas las prioridades</option>
            <option value="CRITICAL">Crítica</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Media</option>
          </Select>
        </div>
        {list.isLoading ? (
          <SkeletonRows />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data!.data.length === 0 ? (
          <EmptyState title="Sin alertas abiertas" hint="Todo el inventario está dentro de los niveles esperados." icon="check" />
        ) : (
          <>
            <DataTable
              rows={list.data!.data}
              rowKey={(a) => a.id}
              columns={[
                { header: 'Prioridad', cell: (a) => <PriorityBadge priority={a.priority} /> },
                { header: 'Tipo', cell: (a) => <AlertTypeBadge type={a.type} /> },
                { header: 'Producto', cell: (a) => <div><p className="font-medium">{a.productName}</p><p className="text-xs text-ink-600 dark:text-ink-300">{a.productSku}{a.batchNumber ? ` · lote ${a.batchNumber}` : ''}</p></div> },
                { header: 'Detalle', hideOnMobile: true, cell: (a) => a.message },
                { header: 'Desde', hideOnMobile: true, cell: (a) => fmtDateTime(a.openedAt) },
                ...(canRepl ? [{ header: '', align: 'right' as const, cell: () => <Link className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" to="/inventario">Ir a inventario</Link> }] : []),
              ]}
            />
            <Pagination page={page} limit={30} total={list.data!.meta.total} onPage={setPage} />
          </>
        )}
      </Card>
      {repl && <ReplenishmentModal onClose={() => setRepl(false)} />}
      {cfg && <ThresholdModal onClose={() => setCfg(false)} />}
    </>
  );
}

function ReplenishmentModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [days, setDays] = useState('30');
  const cov = Math.min(Math.max(parseInt(days, 10) || 30, 1), 180);
  const q = useQuery({ queryKey: ['alerts', 'replenishment', cov], queryFn: () => get<{ data: Replenishment }>('/alerts/replenishment', { coverageDays: cov }) });
  const r = q.data?.data;
  const dl = async (format: 'csv' | 'pdf') => {
    try {
      await download('/alerts/replenishment', { coverageDays: cov, format }, `reposicion.${format}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Orden de reposición sugerida"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <Button variant="secondary" disabled={!r?.totalLines} onClick={() => dl('csv')}><Icon name="download" className="h-4 w-4" /> CSV</Button>
          <Button disabled={!r?.totalLines} onClick={() => dl('pdf')}><Icon name="download" className="h-4 w-4" /> PDF</Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Field label="Días de cobertura" hint="Se calcula con la rotación de los últimos 30 días">{(id) => <Input id={id} inputMode="numeric" className="w-28" value={days} onChange={(e) => setDays(e.target.value)} />}</Field>
        {r && <p className="text-sm text-ink-700 dark:text-ink-200">{r.totalLines} producto(s) · costo estimado <span className="num font-bold">{money(r.totalCost)}</span></p>}
      </div>
      {q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !r || r.groups.length === 0 ? (
        <EmptyState title="Nada que reponer" hint="Ningún producto está bajo su stock mínimo." icon="check" />
      ) : (
        <div className="space-y-5">
          {r.groups.map((g) => (
            <section key={g.supplierId ?? 'none'}>
              <header className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{g.supplierName}{g.phone ? <span className="ml-2 text-xs font-normal text-ink-600 dark:text-ink-300">Tel. {g.phone}</span> : null}</h3>
                <span className="num text-sm font-semibold">{money(g.totalCost)}</span>
              </header>
              <div className="overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700">
                <DataTable
                  dense
                  rows={g.lines}
                  rowKey={(l) => l.productId}
                  columns={[
                    { header: 'Producto', cell: (l) => <span className="font-medium">{l.name}</span> },
                    { header: 'Stock', align: 'right', cell: (l) => <span className="num">{l.available}</span> },
                    { header: 'Mín.', align: 'right', hideOnMobile: true, cell: (l) => <span className="num">{l.minStock}</span> },
                    { header: 'Vend. 30 d', align: 'right', hideOnMobile: true, cell: (l) => <span className="num">{num(l.sold30)}</span> },
                    { header: 'Sugerido', align: 'right', cell: (l) => <span className="num font-bold">{l.suggestedQty}</span> },
                    { header: 'Costo', align: 'right', cell: (l) => <span className="num">{money(l.lineCost)}</span> },
                  ]}
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ThresholdModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['alerts', 'settings'], queryFn: () => get<{ data: { expiryDays: number[] } }>('/alerts/settings') });
  const [txt, setTxt] = useState<string | null>(null);
  const value = txt ?? q.data?.data.expiryDays.join(', ') ?? '';
  const parsed = value.split(/[,\s]+/).filter(Boolean).map(Number);
  const valid = parsed.length >= 1 && parsed.length <= 5 && parsed.every((n) => Number.isInteger(n) && n >= 1 && n <= 365);
  const save = useMutation({
    mutationFn: () => put('/alerts/settings', { expiryDays: [...new Set(parsed)].sort((a, b) => a - b) }),
    onSuccess: () => {
      toast.success('Umbrales actualizados');
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Modal open onClose={onClose} size="sm" title="Umbrales de vencimiento" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>Guardar</Button></>}>
      <Field label="Días antes del vencimiento" hint="Hasta 5 valores separados por coma. Por defecto 30, 60, 90. A menor plazo, mayor prioridad." error={!valid && txt !== null ? 'Usa números enteros entre 1 y 365' : null}>
        {(id) => <Input id={id} value={value} onChange={(e) => setTxt(e.target.value)} invalid={!valid && txt !== null} />}
      </Field>
    </Modal>
  );
}
