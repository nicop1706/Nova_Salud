import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { get, post } from '../api/client';
import type { BatchRow, Paged, Product } from '../api/types';
import { Icon } from '../components/Icon';
import { ProductPicker } from '../components/ProductPicker';
import { Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, ExpiryBadge, Field, Input, Modal, PageHeader, Pagination, Select, SkeletonRows, Tabs } from '../components/ui';
import { errMsg } from '../hooks/common';
import { fmtDate, money, num, todayLima } from '../lib/format';
import { useToast } from '../store/toast';

type Filter = 'with_stock' | 'expiring' | 'expired' | 'all';
type Action = { kind: 'adjust' | 'waste' | 'return'; batch: BatchRow };

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['inventory', 'products', 'alerts', 'dashboard', 'kardex']) qc.invalidateQueries({ queryKey: [k] });
  };
}

export default function Inventory() {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [tab, setTab] = useState<Filter>('with_stock');
  const [page, setPage] = useState(1);
  const [receive, setReceive] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [wasteAll, setWasteAll] = useState(false);

  const list = useQuery({
    queryKey: ['inventory', 'batches', tab, page],
    queryFn: () => get<Paged<BatchRow>>('/inventory/batches', { status: tab, page, limit: 25, days: tab === 'expiring' ? 90 : undefined }),
    placeholderData: (p) => p,
  });

  return (
    <>
      <PageHeader
        title="Inventario por lotes"
        subtitle="Ingresos, ajustes, mermas y devoluciones. Cada movimiento queda en el kardex con su motivo."
        actions={
          <>
            <Button variant="secondary" onClick={() => setWasteAll(true)}>
              <Icon name="trash" className="h-4 w-4" /> Dar de baja vencidos
            </Button>
            <Button onClick={() => setReceive(true)}>
              <Icon name="plus" className="h-4 w-4" /> Registrar ingreso
            </Button>
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          setPage(1);
        }}
        tabs={[
          { id: 'with_stock', label: 'Con stock' },
          { id: 'expiring', label: 'Por vencer (90 d)' },
          { id: 'expired', label: 'Vencidos con stock' },
          { id: 'all', label: 'Todos' },
        ]}
      />
      <Card padded={false}>
        {list.isLoading ? (
          <SkeletonRows />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data!.data.length === 0 ? (
          <EmptyState title="No hay lotes en esta vista" icon="box" />
        ) : (
          <>
            <DataTable
              rows={list.data!.data}
              rowKey={(b) => b.id}
              columns={[
                {
                  header: 'Producto',
                  cell: (b) => (
                    <div>
                      <p className="font-medium">{b.productName}</p>
                      <p className="text-xs text-ink-600 dark:text-ink-300">{[b.productSku, b.presentation].filter(Boolean).join(' · ')}</p>
                    </div>
                  ),
                },
                { header: 'Lote', cell: (b) => <span className="num">{b.batchNumber}</span> },
                { header: 'Vence', cell: (b) => fmtDate(b.expiresAt) },
                { header: 'Estado', cell: (b) => (b.expired ? <Badge tone="red">Vencido</Badge> : <ExpiryBadge days={b.daysToExpiry} />) },
                { header: 'Cantidad', align: 'right', cell: (b) => <span className="num font-semibold">{num(b.quantity)}</span> },
                { header: 'Valor (costo)', align: 'right', hideOnMobile: true, cell: (b) => <span className="num">{money(b.quantity * b.purchasePrice)}</span> },
                {
                  header: 'Acciones',
                  align: 'right',
                  cell: (b) => (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'adjust', batch: b })}>Ajustar</Button>
                      <Button size="sm" variant="secondary" disabled={b.quantity <= 0} onClick={() => setAction({ kind: 'waste', batch: b })}>Merma</Button>
                      <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'return', batch: b })}>Devolución</Button>
                    </div>
                  ),
                },
              ]}
            />
            <Pagination page={page} limit={25} total={list.data!.meta.total} onPage={setPage} />
          </>
        )}
      </Card>

      {receive && <ReceiveModal onClose={() => setReceive(false)} onDone={invalidate} />}
      {action && <ActionModal action={action} onClose={() => setAction(null)} onDone={invalidate} />}
      <ConfirmDialog
        open={wasteAll}
        danger
        title="Dar de baja lotes vencidos"
        confirmLabel="Dar de baja"
        message="Todos los lotes vencidos con stock se pondrán en cero como merma por vencimiento. Cada baja queda en el kardex y en la auditoría."
        onClose={() => setWasteAll(false)}
        onConfirm={async () => {
          try {
            const r = await post<{ data: { batches: number; units: number } }>('/inventory/waste-expired');
            toast.success(`${r.data.batches} lote(s) dados de baja (${r.data.units} unidades)`);
            invalidate();
          } catch (e) {
            toast.error(errMsg(e));
            throw e;
          }
        }}
      />
    </>
  );
}

function ReceiveModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [batchNumber, setBatchNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const m = useMutation({
    mutationFn: () =>
      post('/inventory/receive', {
        productId: product!.id,
        batchNumber: batchNumber.trim(),
        expiresAt,
        quantity: Number(quantity),
        unitCost: unitCost ? Number(unitCost) : undefined,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Ingreso registrado');
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!product) er.product = 'Selecciona el producto';
    if (!batchNumber.trim()) er.batch = 'Ingresa el N.º de lote';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) er.expires = 'Fecha de vencimiento obligatoria';
    else if (expiresAt <= todayLima()) er.expires = 'El lote ya está vencido o vence hoy';
    if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) er.qty = 'Cantidad entera mayor que cero';
    setErrors(er);
    if (!Object.keys(er).length) m.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar ingreso de mercadería"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="receive-form" loading={m.isPending}>Registrar ingreso</Button>
        </>
      }
    >
      <form id="receive-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Producto" required error={errors.product} className="sm:col-span-2">{(id) => <ProductPicker id={id} value={product} onChange={(p) => { setProduct(p); if (p?.purchasePrice != null && !unitCost) setUnitCost(String(p.purchasePrice)); }} />}</Field>
        <Field label="N.º de lote" required error={errors.batch}>{(id) => <Input id={id} value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} maxLength={40} invalid={!!errors.batch} />}</Field>
        <Field label="Fecha de vencimiento" required error={errors.expires}>{(id) => <Input id={id} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} invalid={!!errors.expires} />}</Field>
        <Field label="Cantidad" required error={errors.qty}>{(id) => <Input id={id} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} invalid={!!errors.qty} />}</Field>
        <Field label="Costo unitario (S/)" hint="Opcional; por defecto el precio de compra">{(id) => <Input id={id} inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />}</Field>
        <Field label="Nota / documento de compra" className="sm:col-span-2">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ej.: Factura F001-2345" />}</Field>
      </form>
    </Modal>
  );
}

const WASTE_LABEL: Record<string, string> = { VENCIMIENTO: 'Vencimiento', DETERIORO: 'Deterioro', ROTURA: 'Rotura', OTRO: 'Otro' };

function ActionModal({ action, onClose, onDone }: { action: Action; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { kind, batch } = action;
  const [delta, setDelta] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(kind === 'waste' ? 'DETERIORO' : '');
  const [note, setNote] = useState('');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => {
      if (kind === 'adjust') return post('/inventory/adjust', { batchId: batch.id, delta: Number(delta), reason: reason.trim() });
      if (kind === 'waste') return post('/inventory/waste', { batchId: batch.id, quantity: Number(qty), reason, note: note.trim() || null });
      return post('/inventory/returns', { batchId: batch.id, quantity: Number(qty), direction, reason: reason.trim() });
    },
    onSuccess: () => {
      toast.success('Movimiento registrado');
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (kind === 'adjust') {
      const d = Number(delta);
      if (!Number.isInteger(d) || d === 0) return setError('Indica un ajuste entero distinto de cero (negativo para restar).');
      if (batch.quantity + d < 0) return setError(`No puedes dejar el lote en negativo (stock actual: ${batch.quantity}).`);
      if (reason.trim().length < 5) return setError('El motivo es obligatorio (mínimo 5 caracteres).');
    } else {
      const q = Number(qty);
      if (!Number.isInteger(q) || q <= 0) return setError('Cantidad entera mayor que cero.');
      if ((kind === 'waste' || (kind === 'return' && direction === 'OUT')) && q > batch.quantity) return setError(`Solo hay ${batch.quantity} unidad(es) en el lote.`);
      if (kind === 'return' && reason.trim().length < 3) return setError('Indica el motivo de la devolución.');
    }
    m.mutate();
  };

  const title = { adjust: 'Ajuste de inventario', waste: 'Registrar merma', return: 'Registrar devolución' }[kind];
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="action-form" variant={kind === 'waste' ? 'danger' : 'primary'} loading={m.isPending}>Registrar</Button>
        </>
      }
    >
      <p className="mb-4 rounded-lg bg-ink-50 p-3 text-sm dark:bg-ink-800">
        <span className="font-semibold">{batch.productName}</span> · lote <span className="num">{batch.batchNumber}</span> · vence {fmtDate(batch.expiresAt)} · stock actual <span className="num font-semibold">{batch.quantity}</span>
      </p>
      {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-900/30 dark:text-red-100" role="alert">{error}</p>}
      <form id="action-form" onSubmit={submit} noValidate className="grid gap-4">
        {kind === 'adjust' && (
          <>
            <Field label="Ajuste de unidades (+ suma, − resta)" required>{(id) => <Input id={id} inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="-3" />}</Field>
            <Field label="Motivo del ajuste" required hint="Obligatorio: queda en el kardex y en la auditoría">{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}</Field>
          </>
        )}
        {kind === 'waste' && (
          <>
            <Field label="Cantidad" required>{(id) => <Input id={id} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />}</Field>
            <Field label="Motivo" required>
              {(id) => (
                <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
                  {Object.entries(WASTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Nota">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />}</Field>
          </>
        )}
        {kind === 'return' && (
          <>
            <Field label="Tipo de devolución">
              {(id) => (
                <Select id={id} value={direction} onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}>
                  <option value="IN">De cliente (ingresa al stock)</option>
                  <option value="OUT">A proveedor (sale del stock)</option>
                </Select>
              )}
            </Field>
            <Field label="Cantidad" required>{(id) => <Input id={id} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />}</Field>
            <Field label="Motivo" required>{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}</Field>
          </>
        )}
      </form>
    </Modal>
  );
}
