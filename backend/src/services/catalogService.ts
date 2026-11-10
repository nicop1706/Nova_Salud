import type { Request } from 'express';
import { categoryRepository, supplierRepository } from '../repositories/catalogRepository';
import { conflict, notFound } from '../utils/errors';
import { auditReq } from './auditService';

function crud(
  entity: 'categories' | 'suppliers',
  label: string,
  repo: typeof categoryRepository,
  auditPrefix: string,
) {
  return {
    list: () => repo.list(),

    async create(req: Request, data: Record<string, unknown>) {
      if (await repo.findByName(String(data.name))) throw conflict(`Ya existe ${label} con ese nombre`, undefined, 'NOMBRE_DUPLICADO');
      const row = await repo.create(data);
      await auditReq(req, `${auditPrefix}_CREADO`, entity, row.id, { name: row.name });
      return row;
    },

    async update(req: Request, id: number, data: Record<string, unknown>) {
      if (!(await repo.findById(id))) throw notFound(`${label} no encontrado`);
      const dup = await repo.findByName(String(data.name));
      if (dup && dup.id !== id) throw conflict(`Ya existe ${label} con ese nombre`, undefined, 'NOMBRE_DUPLICADO');
      const row = await repo.update(id, data);
      await auditReq(req, `${auditPrefix}_ACTUALIZADO`, entity, id, data);
      return row;
    },

    async remove(req: Request, id: number) {
      const current = await repo.findById(id);
      if (!current) throw notFound(`${label} no encontrado`);
      const n = await repo.productCount(id);
      if (n > 0) throw conflict(`No se puede eliminar: tiene ${n} producto(s) asociado(s)`, { products: n }, 'CON_PRODUCTOS');
      await repo.remove(id);
      await auditReq(req, `${auditPrefix}_ELIMINADO`, entity, id, { name: current.name });
    },
  };
}

export const categoryService = crud('categories', 'la categoría', categoryRepository, 'CATEGORIA');
export const supplierService = crud('suppliers', 'el proveedor', supplierRepository as typeof categoryRepository, 'PROVEEDOR');
