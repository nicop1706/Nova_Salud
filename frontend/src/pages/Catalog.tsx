import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { del, get, post, put } from '../api/client';
import type { Category, Supplier } from '../api/types';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, Checkbox, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, SkeletonRows, Tabs } from '../components/ui';
import { errMsg } from '../hooks/common';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';

export default function Catalog() {
  const [tab, setTab] = useState<'suppliers' | 'categories'>('suppliers');
  return (
    <>
      <PageHeader title="Proveedores y categorías" subtitle="Datos maestros del catálogo" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'suppliers', label: 'Proveedores' }, { id: 'categories', label: 'Categorías' }]} />
      {tab === 'suppliers' ? <Suppliers /> : <Categories />}
    </>
  );
}

function Suppliers() {
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['catalog', 'suppliers'], queryFn: () => get<{ data: Supplier[] }>('/suppliers') });
  const [edit, setEdit] = useState<Supplier | null | undefined>(undefined);
  const [remove, setRemove] = useState<Supplier | null>(null);
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setEdit(null)}><Icon name="plus" className="h-4 w-4" /> Nuevo proveedor</Button>
      </div>
      <Card padded={false}>
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data!.data.length === 0 ? <EmptyState title="Sin proveedores" icon="truck" /> : (
          <DataTable
            rows={q.data!.data}
            rowKey={(s) => s.id}
            columns={[
              { header: 'Proveedor', cell: (s) => <span className="font-medium">{s.name} {!s.active && <Badge>Inactivo</Badge>}</span> },
              { header: 'RUC', hideOnMobile: true, cell: (s) => <span className="num">{s.ruc ?? '—'}</span> },
              { header: 'Contacto', hideOnMobile: true, cell: (s) => [s.contact, s.phone].filter(Boolean).join(' · ') || '—' },
              { header: 'Correo', hideOnMobile: true, cell: (s) => s.email ?? '—' },
              { header: 'Productos', align: 'right', cell: (s) => <span className="num">{s.productCount}</span> },
              {
                header: '',
                align: 'right',
                cell: (s) => (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Editar ${s.name}`} onClick={() => setEdit(s)}><Icon name="edit" className="h-4 w-4" /></Button>
                    {can('ADMIN') && <Button size="sm" variant="ghost" aria-label={`Eliminar ${s.name}`} onClick={() => setRemove(s)}><Icon name="trash" className="h-4 w-4" /></Button>}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
      {edit !== undefined && <SupplierForm supplier={edit} onClose={() => setEdit(undefined)} />}
      <ConfirmDialog
        open={!!remove}
        danger
        title="Eliminar proveedor"
        confirmLabel="Eliminar"
        message={`¿Eliminar a «${remove?.name}»? Si tiene productos asociados, se desactivará en lugar de eliminarse.`}
        onClose={() => setRemove(null)}
        onConfirm={async () => {
          try {
            await del(`/suppliers/${remove!.id}`);
            toast.success('Proveedor eliminado');
            qc.invalidateQueries({ queryKey: ['catalog'] });
          } catch (e) {
            toast.error(errMsg(e));
            throw e;
          }
        }}
      />
    </>
  );
}

function SupplierForm({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: supplier?.name ?? '', ruc: supplier?.ruc ?? '', contact: supplier?.contact ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '', address: supplier?.address ?? '', active: supplier?.active ?? true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name.trim(), ruc: f.ruc.trim() || null, contact: f.contact.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null, address: f.address.trim() || null, active: f.active };
      return supplier ? put(`/suppliers/${supplier.id}`, body) : post('/suppliers', body);
    },
    onSuccess: () => {
      toast.success('Proveedor guardado');
      qc.invalidateQueries({ queryKey: ['catalog'] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (f.name.trim().length < 2) er.name = 'Ingresa el nombre';
    if (f.ruc.trim() && !/^\d{11}$/.test(f.ruc.trim())) er.ruc = 'El RUC debe tener 11 dígitos';
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) er.email = 'Correo inválido';
    setErrors(er);
    if (!Object.keys(er).length) save.mutate();
  };
  return (
    <Modal open onClose={onClose} title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="supplier-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="supplier-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Razón social" required error={errors.name} className="sm:col-span-2">{(id) => <Input id={id} value={f.name} onChange={up('name')} maxLength={120} invalid={!!errors.name} />}</Field>
        <Field label="RUC" error={errors.ruc}>{(id) => <Input id={id} inputMode="numeric" maxLength={11} value={f.ruc} onChange={up('ruc')} invalid={!!errors.ruc} />}</Field>
        <Field label="Contacto">{(id) => <Input id={id} value={f.contact} onChange={up('contact')} maxLength={100} />}</Field>
        <Field label="Teléfono">{(id) => <Input id={id} type="tel" value={f.phone} onChange={up('phone')} maxLength={30} />}</Field>
        <Field label="Correo" error={errors.email}>{(id) => <Input id={id} type="email" value={f.email} onChange={up('email')} maxLength={120} invalid={!!errors.email} />}</Field>
        <Field label="Dirección" className="sm:col-span-2">{(id) => <Input id={id} value={f.address} onChange={up('address')} maxLength={200} />}</Field>
        <Checkbox label="Proveedor activo" checked={f.active} onChange={(v) => setF((s) => ({ ...s, active: v }))} />
      </form>
    </Modal>
  );
}

function Categories() {
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['catalog', 'categories'], queryFn: () => get<{ data: Category[] }>('/categories') });
  const [edit, setEdit] = useState<Category | null | undefined>(undefined);
  const [remove, setRemove] = useState<Category | null>(null);
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setEdit(null)}><Icon name="plus" className="h-4 w-4" /> Nueva categoría</Button>
      </div>
      <Card padded={false}>
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data!.data.length === 0 ? <EmptyState title="Sin categorías" icon="tag" /> : (
          <DataTable
            rows={q.data!.data}
            rowKey={(c) => c.id}
            columns={[
              { header: 'Categoría', cell: (c) => <span className="font-medium">{c.name}</span> },
              { header: 'Descripción', hideOnMobile: true, cell: (c) => c.description ?? '—' },
              { header: 'Productos', align: 'right', cell: (c) => <span className="num">{c.productCount}</span> },
              {
                header: '',
                align: 'right',
                cell: (c) => (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Editar ${c.name}`} onClick={() => setEdit(c)}><Icon name="edit" className="h-4 w-4" /></Button>
                    {can('ADMIN') && <Button size="sm" variant="ghost" aria-label={`Eliminar ${c.name}`} onClick={() => setRemove(c)}><Icon name="trash" className="h-4 w-4" /></Button>}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
      {edit !== undefined && <CategoryForm category={edit} onClose={() => setEdit(undefined)} />}
      <ConfirmDialog
        open={!!remove}
        danger
        title="Eliminar categoría"
        confirmLabel="Eliminar"
        message={`¿Eliminar la categoría «${remove?.name}»? Solo es posible si no tiene productos.`}
        onClose={() => setRemove(null)}
        onConfirm={async () => {
          try {
            await del(`/categories/${remove!.id}`);
            toast.success('Categoría eliminada');
            qc.invalidateQueries({ queryKey: ['catalog'] });
          } catch (e) {
            toast.error(errMsg(e));
            throw e;
          }
        }}
      />
    </>
  );
}

function CategoryForm({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null };
      return category ? put(`/categories/${category.id}`, body) : post('/categories', body);
    },
    onSuccess: () => {
      toast.success('Categoría guardada');
      qc.invalidateQueries({ queryKey: ['catalog'] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Ingresa el nombre');
    setError(null);
    save.mutate();
  };
  return (
    <Modal open onClose={onClose} size="sm" title={category ? 'Editar categoría' : 'Nueva categoría'} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="cat-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="cat-form" onSubmit={submit} noValidate className="grid gap-4">
        <Field label="Nombre" required error={error}>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} invalid={!!error} />}</Field>
        <Field label="Descripción">{(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />}</Field>
      </form>
    </Modal>
  );
}
