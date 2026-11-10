import type { Request } from 'express';
import { customerRepository } from '../repositories/customerRepository';
import { conflict, notFound } from '../utils/errors';
import { todayLima } from '../utils/dates';
import { auditReq } from './auditService';

export const customerService = {
  list: (q: string | undefined, limit: number, offset: number) => customerRepository.list(q, limit, offset),
  search: (q: string, limit: number) => customerRepository.search(q, limit),

  async create(req: Request, data: Record<string, any>) {
    if (await customerRepository.findByDoc(data.docNumber)) throw conflict('Ya existe un cliente con ese documento', undefined, 'DOCUMENTO_DUPLICADO');
    const row = await customerRepository.create(data);
    await auditReq(req, 'CLIENTE_CREADO', 'customers', row.id, { doc: row.docNumber });
    return row;
  },

  async update(req: Request, id: number, data: Record<string, any>) {
    if (!(await customerRepository.findById(id))) throw notFound('Cliente no encontrado');
    const dup = await customerRepository.findByDoc(data.docNumber);
    if (dup && dup.id !== id) throw conflict('Ya existe un cliente con ese documento', undefined, 'DOCUMENTO_DUPLICADO');
    const row = await customerRepository.update(id, data);
    await auditReq(req, 'CLIENTE_ACTUALIZADO', 'customers', id);
    return row;
  },

  async detail(id: number) {
    const customer = await customerRepository.findById(id);
    if (!customer) throw notFound('Cliente no encontrado');
    const [history, frequent] = await Promise.all([
      customerRepository.history(id, 50, 0),
      customerRepository.frequentProducts(id, todayLima(), 8),
    ]);
    return { customer, history, frequent };
  },

  async frequent(id: number) {
    if (!(await customerRepository.findById(id))) throw notFound('Cliente no encontrado');
    return customerRepository.frequentProducts(id, todayLima(), 8);
  },

  async deactivate(req: Request, id: number) {
    if (!(await customerRepository.findById(id))) throw notFound('Cliente no encontrado');
    await customerRepository.update(id, { active: false });
    await auditReq(req, 'CLIENTE_DESACTIVADO', 'customers', id);
  },
};
