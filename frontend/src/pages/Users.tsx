import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { get, post, put } from '../api/client';
import type { Role, User } from '../api/types';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, Checkbox, DataTable, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows } from '../components/ui';
import { errMsg } from '../hooks/common';
import { fmtDateTime, ROLE_LABEL } from '../lib/format';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';

const PASS_HINT = 'Mínimo 8 caracteres, con letras y números';
const strong = (p: string) => p.length >= 8 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);

export default function Users() {
  const { user: me } = useAuth();
  const q = useQuery({ queryKey: ['users'], queryFn: () => get<{ data: User[] }>('/users') });
  const [edit, setEdit] = useState<User | null | undefined>(undefined);
  const [reset, setReset] = useState<User | null>(null);
  return (
    <>
      <PageHeader title="Usuarios" subtitle="Cuentas del personal y sus roles" actions={<Button onClick={() => setEdit(null)}><Icon name="plus" className="h-4 w-4" /> Nuevo usuario</Button>} />
      <Card padded={false}>
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <DataTable
            rows={q.data!.data}
            rowKey={(u) => u.id}
            columns={[
              { header: 'Nombre', cell: (u) => <span className="font-medium">{u.name}{u.id === me?.id && <Badge tone="blue" className="ml-2">Tú</Badge>}</span> },
              { header: 'Correo', cell: (u) => u.email },
              { header: 'Rol', cell: (u) => <Badge tone={u.role === 'ADMIN' ? 'brand' : 'gray'}>{ROLE_LABEL[u.role]}</Badge> },
              { header: 'Estado', cell: (u) => <Badge tone={u.active ? 'brand' : 'red'}>{u.active ? 'Activo' : 'Inactivo'}</Badge> },
              { header: 'Último acceso', hideOnMobile: true, cell: (u) => fmtDateTime(u.lastLoginAt) },
              {
                header: '',
                align: 'right',
                cell: (u) => (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(u)} aria-label={`Editar ${u.name}`}><Icon name="edit" className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setReset(u)}>Clave</Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
      {edit !== undefined && <UserForm user={edit} isSelf={edit?.id === me?.id} onClose={() => setEdit(undefined)} />}
      {reset && <ResetModal user={reset} onClose={() => setReset(null)} />}
    </>
  );
}

function UserForm({ user, isSelf, onClose }: { user: User | null; isSelf: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'SELLER');
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => (user ? put(`/users/${user.id}`, { name: name.trim(), role, active }) : post('/users', { name: name.trim(), email: email.trim(), role, password })),
    onSuccess: () => {
      toast.success('Usuario guardado');
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (name.trim().length < 2) er.name = 'Ingresa el nombre';
    if (!user && !/^\S+@\S+\.\S+$/.test(email.trim())) er.email = 'Correo inválido';
    if (!user && !strong(password)) er.password = PASS_HINT;
    setErrors(er);
    if (!Object.keys(er).length) save.mutate();
  };
  return (
    <Modal open onClose={onClose} title={user ? 'Editar usuario' : 'Nuevo usuario'} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="user-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="user-form" onSubmit={submit} noValidate className="grid gap-4">
        <Field label="Nombre completo" required error={errors.name}>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} invalid={!!errors.name} />}</Field>
        <Field label="Correo" required error={errors.email}>{(id) => <Input id={id} type="email" value={email} disabled={!!user} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} />}</Field>
        <Field label="Rol" hint={isSelf ? 'No puedes cambiar tu propio rol' : undefined}>
          {(id) => (
            <Select id={id} value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="ADMIN">Administrador</option>
              <option value="SELLER">Vendedor</option>
              <option value="WAREHOUSE">Almacenero</option>
            </Select>
          )}
        </Field>
        {!user && <Field label="Contraseña inicial" required error={errors.password} hint={PASS_HINT}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} />}</Field>}
        {user && <Checkbox label="Cuenta activa" checked={active} disabled={isSelf} onChange={setActive} />}
      </form>
    </Modal>
  );
}

function ResetModal({ user, onClose }: { user: User; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const save = useMutation({
    mutationFn: () => post(`/users/${user.id}/reset-password`, { newPassword: pw }),
    onSuccess: () => {
      toast.success('Contraseña restablecida. Las sesiones activas del usuario se cerraron.');
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Modal open onClose={onClose} size="sm" title={`Restablecer contraseña de ${user.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!strong(pw)} loading={save.isPending} onClick={() => save.mutate()}>Restablecer</Button></>}>
      <Field label="Nueva contraseña" hint={PASS_HINT} error={pw && !strong(pw) ? PASS_HINT : null}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
    </Modal>
  );
}
