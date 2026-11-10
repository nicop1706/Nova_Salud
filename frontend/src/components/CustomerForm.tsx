import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { post, put } from '../api/client';
import type { Customer } from '../api/types';
import { errMsg } from '../hooks/common';
import { useToast } from '../store/toast';
import { Button, Field, Input, Modal, Select } from './ui';

const DOC_RULES: Record<string, { re: RegExp; msg: string; max: number }> = {
  DNI: { re: /^\d{8}$/, msg: 'El DNI debe tener 8 dígitos', max: 8 },
  RUC: { re: /^(10|15|17|20)\d{9}$/, msg: 'El RUC debe tener 11 dígitos (inicia con 10, 15, 17 o 20)', max: 11 },
  CE: { re: /^[A-Za-z0-9]{9,12}$/, msg: 'El carné de extranjería debe tener entre 9 y 12 caracteres', max: 12 },
};

/** Alta/edición de cliente. Se usa en Clientes y como "alta rápida" desde el POS. */
export function CustomerForm({ open, onClose, customer, initialDoc, onSaved }: { open: boolean; onClose: () => void; customer?: Customer | null; initialDoc?: string; onSaved?: (c: Customer) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [docType, setDocType] = useState<'DNI' | 'RUC' | 'CE'>('DNI');
  const [docNumber, setDocNumber] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDocType(customer?.docType ?? (initialDoc && /^\d{11}$/.test(initialDoc) ? 'RUC' : 'DNI'));
    setDocNumber(customer?.docNumber ?? initialDoc ?? '');
    setName(customer?.name ?? '');
    setPhone(customer?.phone ?? '');
    setEmail(customer?.email ?? '');
    setErrors({});
  }, [open, customer, initialDoc]);

  const save = useMutation({
    mutationFn: () => {
      const body = { docType, docNumber: docNumber.trim(), name: name.trim(), phone: phone.trim() || null, email: email.trim() || null };
      return customer ? put<{ data: Customer }>(`/customers/${customer.id}`, body) : post<{ data: Customer }>('/customers', body);
    },
    onSuccess: (r) => {
      toast.success(customer ? 'Cliente actualizado' : 'Cliente registrado');
      qc.invalidateQueries({ queryKey: ['customers'] });
      onSaved?.(r.data);
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    const rule = DOC_RULES[docType];
    if (!rule.re.test(docNumber.trim())) er.doc = rule.msg;
    if (name.trim().length < 2) er.name = 'Ingresa el nombre o razón social';
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) er.email = 'Correo inválido';
    setErrors(er);
    if (!Object.keys(er).length) save.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? 'Editar cliente' : 'Nuevo cliente'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="customer-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-3" noValidate>
        <Field label="Tipo de documento" required>
          {(id) => (
            <Select id={id} value={docType} onChange={(e) => setDocType(e.target.value as 'DNI' | 'RUC' | 'CE')}>
              <option value="DNI">DNI</option>
              <option value="RUC">RUC</option>
              <option value="CE">Carné de extranjería</option>
            </Select>
          )}
        </Field>
        <Field label="N.º de documento" required error={errors.doc} className="sm:col-span-2">
          {(id) => <Input id={id} inputMode={docType === 'CE' ? 'text' : 'numeric'} maxLength={DOC_RULES[docType].max} value={docNumber} onChange={(e) => setDocNumber(e.target.value)} invalid={!!errors.doc} />}
        </Field>
        <Field label="Nombre completo o razón social" required error={errors.name} className="sm:col-span-3">
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} invalid={!!errors.name} />}
        </Field>
        <Field label="Teléfono" className="sm:col-span-1">
          {(id) => <Input id={id} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />}
        </Field>
        <Field label="Correo electrónico" error={errors.email} className="sm:col-span-2">
          {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} invalid={!!errors.email} />}
        </Field>
      </form>
    </Modal>
  );
}
