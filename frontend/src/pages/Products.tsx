import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { del, get, post, put } from '../api/client';
import type { Category, ImportResult, Paged, Product, ProductDetail, Supplier } from '../api/types';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, Checkbox, ConfirmDialog, DataTable, EmptyState, ErrorState, ExpiryBadge, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, SkeletonRows, StockBadge, Textarea } from '../components/ui';
import { errMsg, useDebounce } from '../hooks/common';
import { fmtDate, money } from '../lib/format';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';

export default function Products() {
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE';
  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 250);
  const [categoryId, setCategoryId] = useState('');
  const [stock, setStock] = useState('all');
  const [status, setStatus] = useState('active');
  const [edit, setEdit] = useState<Product | null | undefined>(undefined);
  const [detail, setDetail] = useState<number | null>(null);
  const [remove, setRemove] = useState<Product | null>(null);
  const [importing, setImporting] = useState(false);

  const cats = useQuery({ queryKey: ['catalog', 'categories'], queryFn: () => get<{ data: Category[] }>('/categories') });
  const list = useQuery({
    queryKey: ['products', 'list', page, dq, categoryId, stock, status],
    queryFn: () => get<Paged<Product>>('/products', { page, limit: 20, q: dq || undefined, categoryId: categoryId || undefined, stock, status }),
    placeholderData: (p) => p,
  });
  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle={canEdit ? 'Catálogo, precios y existencias por lote' : 'Consulta de productos y existencias (solo lectura)'}
        actions={
          canEdit && (
            <>
              <Button variant="secondary" onClick={() => setImporting(true)}>
                <Icon name="upload" className="h-4 w-4" /> Importar CSV
              </Button>
              <Button onClick={() => setEdit(null)}>
                <Icon name="plus" className="h-4 w-4" /> Nuevo producto
              </Button>
            </>
          )
        }
      />
      <Card padded={false}>
        <div className="grid gap-3 border-b border-ink-200 p-4 dark:border-ink-700 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={q} onChange={set(setQ)} placeholder="Nombre, SKU, código o principio activo" className="sm:col-span-2 lg:col-span-1" />
          <Select aria-label="Categoría" value={categoryId} onChange={(e) => set(setCategoryId)(e.target.value)}>
            <option value="">Todas las categorías</option>
            {cats.data?.data.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select aria-label="Stock" value={stock} onChange={(e) => set(setStock)(e.target.value)}>
            <option value="all">Todo el stock</option>
            <option value="ok">Disponible</option>
            <option value="low">Stock bajo</option>
            <option value="out">Agotados</option>
            <option value="expired">Con lotes vencidos</option>
          </Select>
          {canEdit && (
            <Select aria-label="Estado" value={status} onChange={(e) => set(setStatus)(e.target.value)}>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
              <option value="all">Todos</option>
            </Select>
          )}
        </div>
        {list.isLoading ? (
          <SkeletonRows />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data!.data.length === 0 ? (
          <EmptyState title="Sin productos" hint="Ajusta la búsqueda o los filtros." />
        ) : (
          <>
            <DataTable
              rows={list.data!.data}
              rowKey={(p) => p.id}
              onRowClick={(p) => setDetail(p.id)}
              columns={[
                { header: 'SKU', hideOnMobile: true, cell: (p) => <span className="num text-xs">{p.sku}</span> },
                {
                  header: 'Producto',
                  cell: (p) => (
                    <div>
                      <p className="font-medium">
                        {p.name} {p.requiresPrescription && <Badge tone="amber" className="ml-1">Rx</Badge>} {!p.active && <Badge>Inactivo</Badge>}
                      </p>
                      <p className="text-xs text-ink-600 dark:text-ink-300">{[p.presentation, p.activeIngredient].filter(Boolean).join(' · ')}</p>
                    </div>
                  ),
                },
                { header: 'Categoría', hideOnMobile: true, cell: (p) => p.categoryName },
                ...(canEdit ? [{ header: 'P. compra', align: 'right' as const, hideOnMobile: true, cell: (p: Product) => <span className="num">{money(p.purchasePrice)}</span> }] : []),
                { header: 'P. venta', align: 'right' as const, cell: (p: Product) => <span className="num font-semibold">{money(p.salePrice)}</span> },
                { header: 'Stock', cell: (p: Product) => <StockBadge status={p.stockStatus} qty={p.availableStock} /> },
                { header: 'Vence', hideOnMobile: true, cell: (p: Product) => <ExpiryBadge days={p.daysToExpiry} /> },
                ...(canEdit
                  ? [
                      {
                        header: '',
                        align: 'right' as const,
                        cell: (p: Product) => (
                          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setEdit(p)}>
                              <Icon name="edit" className="h-4 w-4" />
                            </Button>
                            {p.active && (
                              <Button size="sm" variant="ghost" aria-label={`Desactivar ${p.name}`} onClick={() => setRemove(p)}>
                                <Icon name="trash" className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            <Pagination page={page} limit={20} total={list.data!.meta.total} onPage={setPage} />
          </>
        )}
      </Card>

      {edit !== undefined && <ProductForm product={edit} categories={cats.data?.data ?? []} onClose={() => setEdit(undefined)} />}
      {detail != null && <ProductDetailModal id={detail} canEdit={canEdit} onClose={() => setDetail(null)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
      <ConfirmDialog
        open={!!remove}
        danger
        title="Desactivar producto"
        confirmLabel="Desactivar"
        message={`¿Desactivar «${remove?.name}»? Dejará de aparecer en el POS; el historial y los lotes se conservan.`}
        onClose={() => setRemove(null)}
        onConfirm={async () => {
          try {
            await del(`/products/${remove!.id}`);
            toast.success('Producto desactivado');
            qc.invalidateQueries({ queryKey: ['products'] });
            qc.invalidateQueries({ queryKey: ['alerts'] });
          } catch (e) {
            toast.error(errMsg(e));
            throw e;
          }
        }}
      />
    </>
  );
}

function ProductDetailModal({ id, canEdit, onClose }: { id: number; canEdit: boolean; onClose: () => void }) {
  const q = useQuery({ queryKey: ['products', 'detail', id], queryFn: () => get<{ data: ProductDetail }>(`/products/${id}`) });
  const p = q.data?.data;
  return (
    <Modal open onClose={onClose} size="lg" title={p?.name ?? 'Producto'}>
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        p && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ['SKU', p.sku],
                ['Código de barras', p.barcode ?? '—'],
                ['Categoría', p.categoryName ?? '—'],
                ['Laboratorio', p.laboratory ?? '—'],
                ['Principio activo', p.activeIngredient ?? '—'],
                ['Presentación', p.presentation ?? '—'],
                ['Proveedor', p.supplierName ?? '—'],
                ['Precio de venta', money(p.salePrice)],
                ...(canEdit ? [['Precio de compra', money(p.purchasePrice)]] : []),
                ['Stock mínimo', String(p.minStock)],
                ['Requiere receta', p.requiresPrescription ? 'Sí' : 'No'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-ink-600 dark:text-ink-300">{k}</dt>
                  <dd className="font-medium text-ink-900 dark:text-ink-50">{v}</dd>
                </div>
              ))}
            </dl>
            <h3 className="font-semibold">Lotes (FEFO: primero vence, primero sale)</h3>
            {p.batches.length === 0 ? (
              <p className="text-ink-600 dark:text-ink-300">Sin lotes con existencias.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700">
                <DataTable
                  dense
                  rows={p.batches}
                  rowKey={(b) => b.id}
                  columns={[
                    { header: 'Lote', cell: (b) => <span className="num">{b.batchNumber}</span> },
                    { header: 'Vence', cell: (b) => fmtDate(b.expiresAt) },
                    { header: 'Días', cell: (b) => <ExpiryBadge days={b.daysToExpiry} /> },
                    { header: 'Cantidad', align: 'right', cell: (b) => <span className="num font-semibold">{b.quantity}</span> },
                  ]}
                />
              </div>
            )}
          </div>
        )
      )}
    </Modal>
  );
}

function ProductForm({ product, categories, onClose }: { product: Product | null; categories: Category[]; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const suppliers = useQuery({ queryKey: ['catalog', 'suppliers'], queryFn: () => get<{ data: Supplier[] }>('/suppliers') });
  const [f, setF] = useState({
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    name: product?.name ?? '',
    activeIngredient: product?.activeIngredient ?? '',
    laboratory: product?.laboratory ?? '',
    presentation: product?.presentation ?? '',
    categoryId: product ? String(product.categoryId) : '',
    supplierId: product?.supplierId ? String(product.supplierId) : '',
    purchasePrice: product?.purchasePrice != null ? String(product.purchasePrice) : '',
    salePrice: product ? String(product.salePrice) : '',
    minStock: product ? String(product.minStock) : '0',
    requiresPrescription: product?.requiresPrescription ?? false,
    active: product?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...f,
        barcode: f.barcode.trim() || null,
        activeIngredient: f.activeIngredient.trim() || null,
        laboratory: f.laboratory.trim() || null,
        presentation: f.presentation.trim() || null,
        categoryId: Number(f.categoryId),
        supplierId: f.supplierId ? Number(f.supplierId) : null,
        purchasePrice: Number(f.purchasePrice),
        salePrice: Number(f.salePrice),
        minStock: Number(f.minStock || 0),
      };
      return product ? put(`/products/${product.id}`, body) : post('/products', body);
    },
    onSuccess: () => {
      toast.success(product ? 'Producto actualizado' : 'Producto creado');
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.sku.trim()) er.sku = 'Ingresa el SKU';
    if (f.name.trim().length < 2) er.name = 'Ingresa el nombre';
    if (!f.categoryId) er.categoryId = 'Selecciona una categoría';
    const pp = Number(f.purchasePrice);
    const sp = Number(f.salePrice);
    if (f.purchasePrice === '' || !(pp >= 0)) er.purchasePrice = 'Precio de compra inválido';
    if (f.salePrice === '' || !(sp > 0)) er.salePrice = 'Precio de venta inválido';
    else if (!er.purchasePrice && sp < pp) er.salePrice = 'El precio de venta es menor al de compra';
    if (!(Number(f.minStock) >= 0) || !Number.isInteger(Number(f.minStock))) er.minStock = 'Número entero ≥ 0';
    setErrors(er);
    if (!Object.keys(er).length) save.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={product ? 'Editar producto' : 'Nuevo producto'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="product-form" loading={save.isPending}>Guardar</Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="SKU" required error={errors.sku}>{(id) => <Input id={id} value={f.sku} onChange={up('sku')} maxLength={40} invalid={!!errors.sku} />}</Field>
        <Field label="Código de barras">{(id) => <Input id={id} value={f.barcode} onChange={up('barcode')} maxLength={40} inputMode="numeric" />}</Field>
        <Field label="Categoría" required error={errors.categoryId}>
          {(id) => (
            <Select id={id} value={f.categoryId} onChange={up('categoryId')}>
              <option value="">Selecciona…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Nombre" required error={errors.name} className="sm:col-span-2 lg:col-span-3">{(id) => <Input id={id} value={f.name} onChange={up('name')} maxLength={150} invalid={!!errors.name} />}</Field>
        <Field label="Principio activo">{(id) => <Input id={id} value={f.activeIngredient} onChange={up('activeIngredient')} maxLength={150} />}</Field>
        <Field label="Laboratorio">{(id) => <Input id={id} value={f.laboratory} onChange={up('laboratory')} maxLength={100} />}</Field>
        <Field label="Presentación">{(id) => <Input id={id} value={f.presentation} onChange={up('presentation')} maxLength={100} placeholder="Caja x 100 tabletas" />}</Field>
        <Field label="Proveedor habitual">
          {(id) => (
            <Select id={id} value={f.supplierId} onChange={up('supplierId')}>
              <option value="">Sin proveedor</option>
              {suppliers.data?.data.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Precio de compra (S/)" required error={errors.purchasePrice}>{(id) => <Input id={id} inputMode="decimal" value={f.purchasePrice} onChange={up('purchasePrice')} invalid={!!errors.purchasePrice} />}</Field>
        <Field label="Precio de venta (S/, incluye IGV)" required error={errors.salePrice}>{(id) => <Input id={id} inputMode="decimal" value={f.salePrice} onChange={up('salePrice')} invalid={!!errors.salePrice} />}</Field>
        <Field label="Stock mínimo" error={errors.minStock}>{(id) => <Input id={id} inputMode="numeric" value={f.minStock} onChange={up('minStock')} invalid={!!errors.minStock} />}</Field>
        <div className="flex flex-col justify-end gap-2 sm:col-span-2">
          <Checkbox label="Requiere receta médica" checked={f.requiresPrescription} onChange={(v) => setF((s) => ({ ...s, requiresPrescription: v }))} />
          <Checkbox label="Producto activo (visible en el POS)" checked={f.active} onChange={(v) => setF((s) => ({ ...s, active: v }))} />
        </div>
      </form>
    </Modal>
  );
}

const CSV_TEMPLATE =
  'sku,barcode,name,activeIngredient,laboratory,presentation,category,supplier,purchasePrice,salePrice,minStock,requiresPrescription\n' +
  'DEMO-001,7750000000011,Paracetamol 500 mg,Paracetamol,Genfar,Caja x 100 tabletas,Analgésicos,Droguería Andina,8.50,15.00,20,no\n';

function ImportModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => setResult(null), [csv]);

  const run = useMutation({
    mutationFn: (dryRun: boolean) => post<{ data: ImportResult }>('/products/import', { csv, dryRun }),
    onSuccess: (r) => {
      setResult(r.data);
      if (!r.data.dryRun) {
        toast.success(`Importación terminada: ${r.data.created} creados, ${r.data.updated} actualizados`);
        qc.invalidateQueries({ queryKey: ['products'] });
        qc.invalidateQueries({ queryKey: ['alerts'] });
        qc.invalidateQueries({ queryKey: ['catalog'] });
      }
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const onFile = async (file?: File | null) => {
    if (!file) return;
    if (file.size > 2_000_000) return toast.error('El archivo supera los 2 MB.');
    setFileName(file.name);
    setCsv(await file.text());
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-productos.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const done = result && !result.dryRun;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Importar productos desde CSV"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{done ? 'Cerrar' : 'Cancelar'}</Button>
          {!done && (
            <>
              <Button variant="secondary" disabled={!csv} loading={run.isPending && run.variables === true} onClick={() => run.mutate(true)}>
                Validar (sin guardar)
              </Button>
              <Button disabled={!csv || (result?.dryRun === true && result.errors.length > 0 && result.created + result.updated === 0)} loading={run.isPending && run.variables === false} onClick={() => run.mutate(false)}>
                Importar
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-ink-700 dark:text-ink-200">
          Sube un CSV con encabezados. Si el SKU ya existe se actualiza el producto; si no, se crea. Las categorías y proveedores se buscan por nombre.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Archivo CSV" />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" className="h-4 w-4" /> Elegir archivo
          </Button>
          <Button variant="ghost" onClick={downloadTemplate}>
            <Icon name="download" className="h-4 w-4" /> Descargar plantilla
          </Button>
          {fileName && <span className="text-ink-600 dark:text-ink-300">{fileName}</span>}
        </div>
        <Field label="O pega el contenido del CSV">{(id) => <Textarea id={id} value={csv} onChange={(e) => setCsv(e.target.value)} rows={5} className="font-mono text-xs" />}</Field>
        {result && (
          <div className={`rounded-lg border p-3 ${result.errors.length ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20' : 'border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20'}`} role="status">
            <p className="font-semibold">
              {result.dryRun ? 'Validación' : 'Resultado'}: {result.totalRows} filas · {result.created} por crear/creadas · {result.updated} por actualizar/actualizadas · {result.errors.length} con error
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>Fila {e.row}: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
