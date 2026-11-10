import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { get } from '../api/client';
import type { AuditRow, Paged } from '../api/types';
import { Badge, Card, DataTable, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, SkeletonRows } from '../components/ui';
import { addDays, fmtDateTime, todayLima } from '../lib/format';

export default function Audit() {
  const [from, setFrom] = useState(addDays(todayLima(), -7));
  const [to, setTo] = useState(todayLima());
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['audit', from, to, action, page],
    queryFn: () => get<Paged<AuditRow>>('/audit', { from, to, action: action.trim().toUpperCase() || undefined, page, limit: 30 }),
    placeholderData: (p) => p,
  });
  return (
    <>
      <PageHeader title="Auditoría" subtitle="Registro de operaciones sensibles: anulaciones, ajustes, precios, accesos y cambios de usuarios" />
      <Card padded={false}>
        <div className="grid gap-3 border-b border-ink-200 p-4 dark:border-ink-700 sm:grid-cols-3">
          <Field label="Desde">{(id) => <Input id={id} type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />}</Field>
          <Field label="Hasta">{(id) => <Input id={id} type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(1); }} />}</Field>
          <Field label="Acción (ej. VENTA_ANULADA)">{(id) => <Input id={id} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />}</Field>
        </div>
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data!.data.length === 0 ? <EmptyState title="Sin registros" icon="shield" /> : (
          <>
            <DataTable
              dense
              rows={q.data!.data}
              rowKey={(a) => a.id}
              columns={[
                { header: 'Fecha', cell: (a) => fmtDateTime(a.createdAt) },
                { header: 'Usuario', cell: (a) => a.userName ?? <span className="text-ink-500">Sistema</span> },
                { header: 'Acción', cell: (a) => <Badge tone="blue">{a.action}</Badge> },
                { header: 'Entidad', hideOnMobile: true, cell: (a) => `${a.entity}${a.entityId ? ` #${a.entityId}` : ''}` },
                { header: 'Detalle', hideOnMobile: true, cell: (a) => <code className="line-clamp-2 max-w-md break-all text-xs">{a.detail ? JSON.stringify(a.detail) : '—'}</code> },
                { header: 'IP', hideOnMobile: true, cell: (a) => <span className="num text-xs">{a.ip ?? '—'}</span> },
              ]}
            />
            <Pagination page={page} limit={30} total={q.data!.meta.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
