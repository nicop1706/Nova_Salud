import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { del, get } from '../api/client';
import type { Customer, CustomerDetail, Paged } from '../api/types';
import { CustomerForm } from '../components/CustomerForm';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Modal, PageHeader, Pagination, SearchInput, SkeletonRows } from '../components/ui';
import { errMsg, useDebounce } from '../hooks/common';
import { fmtDate, fmtDateTime, money, num, PAYMENT_LABEL } from '../lib/format';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';

export default function Customers() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const [edit, setEdit] = useState<Customer | null | undefined>(undefined); // undefined = cerrado, null = nuevo
  const [detailId, setDetailId] = useState<number | null>(null);
  const [remove, setRemove] = useState<Customer | null>(null);

  const list = useQuery({
    queryKey: ['customers', 'list', page, dq],
    queryFn: () => get<Paged<Customer>>('/customers', { page, limit: 20, q: dq || undefined }),
    placeholderData: (p) => p,
  });

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Registro de clientes con DNI/RUC, historial de compras y productos frecuentes"
        actions={
          <Button onClick={() => setEdit(null)}>
            <Icon name="plus" className="h-4 w-4" /> Nuevo cliente
          </Button>
        }
      />
      <Card padded={false}>
        <div className="border-b border-ink-200 p-4 dark:border-ink-700">
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Buscar por nombre, DNI o RUC"
            className="max-w-md"
          />
        </div>
        {list.isLoading ? (
          <SkeletonRows />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data!.data.length === 0 ? (
          <EmptyState title="No hay clientes" hint="Registra el primero con «Nuevo cliente»." icon="users" />
        ) : (
          <>
            <DataTable
              rows={list.data!.data}
              rowKey={(c) => c.id}
              onRowClick={(c) => setDetailId(c.id)}
              columns={[
                { header: 'Documento', cell: (c) => <span className="num">{c.docType} {c.docNumber}</span> },
                { header: 'Nombre', cell: (c) => <span className="font-medium">{c.name}</span> },
                { header: 'Teléfono', hideOnMobile: true, cell: (c) => c.phone ?? '—' },
                { header: 'Compras', align: 'right', hideOnMobile: true, cell: (c) => <span className="num">{num(c.purchases ?? 0)}</span> },
                { header: 'Total gastado', align: 'right', hideOnMobile: true, cell: (c) => <span className="num">{money(c.totalSpent ?? 0)}</span> },
                { header: 'Última compra', hideOnMobile: true, cell: (c) => fmtDate(c.lastPurchaseAt) },
                {
                  header: 'Acciones',
                  align: 'right',
                  cell: (c) => (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => setEdit(c)} aria-label={`Editar ${c.name}`}>
                        <Icon name="edit" className="h-4 w-4" />
                      </Button>
                      {can('ADMIN') && (
                        <Button size="sm" variant="ghost" onClick={() => setRemove(c)} aria-label={`Desactivar ${c.name}`}>
                          <Icon name="trash" className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
            <Pagination page={page} limit={20} total={list.data!.meta.total} onPage={setPage} />
          </>
        )}
      </Card>

      <CustomerForm open={edit !== undefined} customer={edit} onClose={() => setEdit(undefined)} />
      {detailId != null && <CustomerModal id={detailId} onClose={() => setDetailId(null)} />}
      <ConfirmDialog
        open={!!remove}
        danger
        title="Desactivar cliente"
        confirmLabel="Desactivar"
        message={`¿Desactivar a ${remove?.name}? Su historial de compras se conserva.`}
        onClose={() => setRemove(null)}
        onConfirm={async () => {
          try {
            await del(`/customers/${remove!.id}`);
            toast.success('Cliente desactivado');
            qc.invalidateQueries({ queryKey: ['customers'] });
          } catch (e) {
            toast.error(errMsg(e));
            throw e;
          }
        }}
      />
    </>
  );
}

function CustomerModal({ id, onClose }: { id: number; onClose: () => void }) {
  const q = useQuery({ queryKey: ['customers', 'detail', id], queryFn: () => get<{ data: CustomerDetail }>(`/customers/${id}`) });
  const d = q.data?.data;
  return (
    <Modal open onClose={onClose} size="lg" title={d ? d.customer.name : 'Cliente'}>
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        d && (
          <div className="space-y-5 text-sm">
            <p className="text-ink-700 dark:text-ink-200">
              {d.customer.docType} {d.customer.docNumber} · {d.customer.phone ?? 'sin teléfono'} · {d.customer.email ?? 'sin correo'}
            </p>
            <section>
              <h3 className="mb-2 font-semibold">Productos frecuentes</h3>
              {d.frequent.length === 0 ? (
                <p className="text-ink-600 dark:text-ink-300">Aún no hay compras.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {d.frequent.map((f) => (
                    <li key={f.id}>
                      <Badge tone="brand">{f.name} · {f.totalQty} uds. / {f.times} veces</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-2 font-semibold">Historial de compras</h3>
              {d.history.length === 0 ? (
                <p className="text-ink-600 dark:text-ink-300">Sin compras registradas.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700">
                  <DataTable
                    dense
                    rows={d.history}
                    rowKey={(h) => h.id}
                    columns={[
                      { header: 'N.º', cell: (h) => <span className="num">{String(h.number).padStart(6, '0')}</span> },
                      { header: 'Fecha', cell: (h) => fmtDateTime(h.completedAt) },
                      { header: 'Detalle', hideOnMobile: true, cell: (h) => <span className="line-clamp-1">{h.summary}</span> },
                      { header: 'Pago', hideOnMobile: true, cell: (h) => PAYMENT_LABEL[h.paymentMethod] },
                      { header: 'Total', align: 'right', cell: (h) => <span className={`num ${h.status === 'VOIDED' ? 'line-through' : ''}`}>{money(h.total)}</span> },
                    ]}
                  />
                </div>
              )}
            </section>
          </div>
        )
      )}
    </Modal>
  );
}
