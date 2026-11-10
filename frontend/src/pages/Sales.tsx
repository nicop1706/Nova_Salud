import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { get, post } from '../api/client';
import type { Paged, SaleDetail, SaleRow } from '../api/types';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, SkeletonRows, Textarea } from '../components/ui';
import { errMsg, useDebounce } from '../hooks/common';
import { addDays, duration, fmtDate, fmtDateTime, money, PAYMENT_LABEL, SALE_STATUS_LABEL, todayLima } from '../lib/format';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';

export default function Sales() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(addDays(todayLima(), -7));
  const [to, setTo] = useState(todayLima());
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const [openId, setOpenId] = useState<number | null>(null);

  const list = useQuery({
    queryKey: ['sales', 'list', page, from, to, status, method, dq],
    queryFn: () => get<Paged<SaleRow>>('/sales', { page, limit: 20, from, to, status: status || undefined, paymentMethod: method || undefined, q: dq || undefined }),
    placeholderData: (p) => p,
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Historial de ventas" subtitle="Consulta, reimprime tickets y (solo administrador) anula ventas" />
      <Card padded={false}>
        <div className="grid gap-3 border-b border-ink-200 p-4 dark:border-ink-700 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Desde">{(id) => <Input id={id} type="date" value={from} max={to} onChange={(e) => reset(setFrom)(e.target.value)} />}</Field>
          <Field label="Hasta">{(id) => <Input id={id} type="date" value={to} min={from} onChange={(e) => reset(setTo)(e.target.value)} />}</Field>
          <Field label="Estado">
            {(id) => (
              <Select id={id} value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
                <option value="">Todos</option>
                <option value="COMPLETED">Completadas</option>
                <option value="VOIDED">Anuladas</option>
              </Select>
            )}
          </Field>
          <Field label="Medio de pago">
            {(id) => (
              <Select id={id} value={method} onChange={(e) => reset(setMethod)(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(PAYMENT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex items-end">
            <SearchInput value={q} onChange={reset(setQ)} placeholder="N.º, cliente o DNI/RUC" className="w-full" />
          </div>
        </div>
        {list.isLoading ? (
          <SkeletonRows />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data!.data.length === 0 ? (
          <EmptyState title="Sin ventas en el rango" hint="Prueba ampliando las fechas o quitando filtros." icon="cart" />
        ) : (
          <>
            <DataTable
              rows={list.data!.data}
              rowKey={(r) => r.id}
              onRowClick={(r) => setOpenId(r.id)}
              columns={[
                { header: 'N.º', cell: (r) => <span className="num font-semibold">{String(r.number).padStart(6, '0')}</span> },
                { header: 'Fecha', cell: (r) => fmtDateTime(r.completedAt) },
                { header: 'Cliente', hideOnMobile: true, cell: (r) => r.customerName ?? <span className="text-ink-500">Consumidor final</span> },
                { header: 'Vendedor', hideOnMobile: true, cell: (r) => r.sellerName },
                { header: 'Pago', hideOnMobile: true, cell: (r) => PAYMENT_LABEL[r.paymentMethod] },
                { header: 'Ítems', align: 'right', hideOnMobile: true, cell: (r) => <span className="num">{r.itemsCount}</span> },
                { header: 'Total', align: 'right', cell: (r) => <span className="num font-semibold">{money(r.total)}</span> },
                { header: 'Estado', cell: (r) => <Badge tone={r.status === 'VOIDED' ? 'red' : 'brand'}>{SALE_STATUS_LABEL[r.status]}</Badge> },
              ]}
            />
            <Pagination page={page} limit={20} total={list.data!.meta.total} onPage={setPage} />
          </>
        )}
      </Card>
      {openId != null && <SaleModal id={openId} canVoid={can('ADMIN')} onClose={() => setOpenId(null)} />}
    </>
  );
}

function SaleModal({ id, canVoid, onClose }: { id: number; canVoid: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['sales', 'detail', id], queryFn: () => get<{ data: SaleDetail }>(`/sales/${id}`) });
  const s = q.data?.data;
  const voidSale = useMutation({
    mutationFn: () => post(`/sales/${id}/void`, { reason: reason.trim() }),
    onSuccess: () => {
      toast.success('Venta anulada. El stock fue devuelto a sus lotes.');
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={s ? `Venta N.º ${String(s.number).padStart(6, '0')}` : 'Detalle de venta'}
        footer={
          s && (
            <>
              <Button variant="secondary" onClick={() => window.open(`/api/sales/${id}/ticket`, '_blank', 'noopener,width=420,height=700')}>
                <Icon name="printer" className="h-4 w-4" /> Reimprimir ticket
              </Button>
              {canVoid && s.status === 'COMPLETED' && (
                <Button variant="danger" onClick={() => setVoiding(true)}>
                  Anular venta
                </Button>
              )}
            </>
          )
        }
      >
        {q.isLoading ? (
          <SkeletonRows rows={5} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          s && (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                <Info label="Fecha" value={fmtDateTime(s.completedAt)} />
                <Info label="Vendedor" value={s.sellerName} />
                <Info label="Cliente" value={s.customerName ? `${s.customerName} (${s.customerDoc})` : 'Consumidor final'} />
                <Info label="Medio de pago" value={PAYMENT_LABEL[s.paymentMethod]} />
                <Info label="Tiempo de atención" value={duration(s.serviceSeconds)} />
                <Info label="Estado" value={<Badge tone={s.status === 'VOIDED' ? 'red' : 'brand'}>{SALE_STATUS_LABEL[s.status]}</Badge>} />
              </dl>
              {s.status === 'VOIDED' && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900 dark:border-red-800 dark:bg-red-900/30 dark:text-red-100">
                  Anulada el {fmtDateTime(s.voidedAt)} por {s.voidedByName}. Motivo: {s.voidReason}
                </p>
              )}
              <div className="overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700">
                <DataTable
                  dense
                  rows={s.items}
                  rowKey={(i) => i.id}
                  columns={[
                    {
                      header: 'Producto',
                      cell: (i) => (
                        <div>
                          <p className="font-medium">{i.name}</p>
                          <p className="text-xs text-ink-600 dark:text-ink-300">
                            {i.batches.map((b) => `Lote ${b.batchNumber} (vence ${fmtDate(b.expiresAt)}) ×${b.quantity}`).join(' · ')}
                          </p>
                        </div>
                      ),
                    },
                    { header: 'Cant.', align: 'right', cell: (i) => <span className="num">{i.quantity}</span> },
                    { header: 'P. unit.', align: 'right', cell: (i) => <span className="num">{money(i.unitPrice)}</span> },
                    { header: 'Total', align: 'right', cell: (i) => <span className="num font-semibold">{money(i.lineTotal)}</span> },
                  ]}
                />
              </div>
              <dl className="ml-auto max-w-xs space-y-1">
                <Row k="Subtotal" v={money(s.subtotal)} />
                <Row k="IGV (18 %)" v={money(s.igv)} />
                {s.discount > 0 && <Row k="Descuentos" v={`− ${money(s.discount)}`} />}
                <Row k="TOTAL" v={money(s.total)} bold />
                {s.paymentMethod === 'CASH' && s.cashReceived != null && (
                  <>
                    <Row k="Efectivo recibido" v={money(s.cashReceived)} />
                    <Row k="Vuelto" v={money(s.changeGiven)} />
                  </>
                )}
              </dl>
            </div>
          )
        )}
      </Modal>
      <ConfirmDialog
        open={voiding}
        danger
        title="Anular venta"
        confirmLabel="Anular venta"
        disabled={reason.trim().length < 5}
        message="Se devolverá el stock a los mismos lotes de los que salió y la operación quedará auditada. Esta acción no se puede deshacer."
        onClose={() => setVoiding(false)}
        onConfirm={async () => {
          await voidSale.mutateAsync();
          setReason('');
        }}
      >
        <div className="mt-3">
          <Field label="Motivo de la anulación" required hint="Mínimo 5 caracteres">
            {(fid) => <Textarea id={fid} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <dt className="text-xs text-ink-600 dark:text-ink-300">{label}</dt>
    <dd className="font-medium text-ink-900 dark:text-ink-50">{value}</dd>
  </div>
);
const Row = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (
  <div className={`flex justify-between ${bold ? 'border-t border-ink-200 pt-1 text-base font-bold dark:border-ink-700' : ''}`}>
    <dt>{k}</dt>
    <dd className="num">{v}</dd>
  </div>
);
