import type { Request } from 'express';
import { db } from '../db/knex';
import { batchRepository } from '../repositories/batchRepository';
import { categoryRepository, supplierRepository } from '../repositories/catalogRepository';
import { ProductListFilters, productRepository, ProductRow } from '../repositories/productRepository';
import { conflict, notFound, badRequest } from '../utils/errors';
import { diffDays, todayLima } from '../utils/dates';
import type { AuthUser } from '../types/express';
import { auditReq } from './auditService';
import { stockChanged } from './stockEvents';

export type StockStatus = 'OUT' | 'LOW' | 'OK';

export interface ProductDto extends Omit<ProductRow, 'purchasePrice'> {
  purchasePrice?: number;
  stockStatus: StockStatus;
  daysToExpiry: number | null;
}

/** Añade estado de stock y días a vencer; el vendedor no ve el precio de compra. */
export function toDto(p: ProductRow, role: AuthUser['role'], today = todayLima()): ProductDto {
  const available = p.availableStock ?? 0;
  const dto: ProductDto = {
    ...p,
    stockStatus: available === 0 ? 'OUT' : available <= p.minStock ? 'LOW' : 'OK',
    daysToExpiry: p.nextExpiry ? diffDays(today, p.nextExpiry) : null,
  };
  if (role === 'SELLER') delete dto.purchasePrice;
  return dto;
}

async function assertRefs(categoryId: number, supplierId: number | null) {
  if (!(await categoryRepository.findById(categoryId))) throw badRequest('La categoría no existe', undefined, 'CATEGORIA_INVALIDA');
  if (supplierId && !(await supplierRepository.findById(supplierId))) throw badRequest('El proveedor no existe', undefined, 'PROVEEDOR_INVALIDO');
}

export const productService = {
  async list(filters: ProductListFilters, role: AuthUser['role']) {
    const today = todayLima();
    const { rows, total } = await productRepository.list(filters, today);
    return { data: rows.map((r) => toDto(r, role, today)), total };
  },

  async search(q: string, limit: number, role: AuthUser['role'], includeInactive = false) {
    const today = todayLima();
    const rows = await productRepository.search(q, limit, today, includeInactive);
    return rows.map((r) => toDto(r, role, today));
  },

  async byCode(code: string, role: AuthUser['role']) {
    const today = todayLima();
    const row = await productRepository.findByBarcodeOrSku(code, today);
    if (!row || !row.active) throw notFound('No se encontró un producto con ese código');
    return toDto(row, role, today);
  },

  async detail(id: number, role: AuthUser['role']) {
    const today = todayLima();
    const row = await productRepository.findDetail(id, today);
    if (!row) throw notFound('Producto no encontrado');
    const batches = await batchRepository.listByProduct(id);
    return {
      ...toDto(row, role, today),
      batches: batches.map((b) => ({ ...b, daysToExpiry: diffDays(today, b.expiresAt), expired: b.expiresAt < today })),
    };
  },

  async create(req: Request, data: Record<string, any>) {
    await assertRefs(data.categoryId, data.supplierId);
    if (await productRepository.findBySku(data.sku)) throw conflict('Ya existe un producto con ese SKU', undefined, 'SKU_DUPLICADO');
    if (data.barcode && (await productRepository.findByBarcode(data.barcode))) {
      throw conflict('Ya existe un producto con ese código de barras', undefined, 'BARRAS_DUPLICADO');
    }
    const row = await productRepository.create(data);
    await auditReq(req, 'PRODUCTO_CREADO', 'products', row.id, { sku: row.sku, name: row.name });
    return this.detail(row.id, req.user!.role);
  },

  async update(req: Request, id: number, data: Record<string, any>) {
    const current = await productRepository.findById(id);
    if (!current) throw notFound('Producto no encontrado');
    await assertRefs(data.categoryId, data.supplierId);
    const dupSku = await productRepository.findBySku(data.sku);
    if (dupSku && dupSku.id !== id) throw conflict('Ya existe un producto con ese SKU', undefined, 'SKU_DUPLICADO');
    if (data.barcode) {
      const dupBar = await productRepository.findByBarcode(data.barcode);
      if (dupBar && dupBar.id !== id) throw conflict('Ya existe un producto con ese código de barras', undefined, 'BARRAS_DUPLICADO');
    }
    await productRepository.update(id, data);
    const changes: Record<string, unknown> = {};
    for (const k of ['salePrice', 'purchasePrice', 'minStock', 'active', 'requiresPrescription'] as const) {
      if ((current as any)[k] !== data[k]) changes[k] = { antes: (current as any)[k], despues: data[k] };
    }
    await auditReq(req, 'PRODUCTO_ACTUALIZADO', 'products', id, changes);
    stockChanged([id]); // cambió el mínimo o estado: recalcular alertas
    return this.detail(id, req.user!.role);
  },

  /** Desactiva el producto (no se borra: conserva el historial de ventas y kardex). */
  async deactivate(req: Request, id: number) {
    const current = await productRepository.findById(id);
    if (!current) throw notFound('Producto no encontrado');
    await productRepository.update(id, { active: false });
    await auditReq(req, 'PRODUCTO_DESACTIVADO', 'products', id, { sku: current.sku });
    stockChanged([id]);
  },

  /** Elimina definitivamente solo si nunca tuvo movimientos. */
  async removeIfUnused(req: Request, id: number) {
    const current = await productRepository.findById(id);
    if (!current) throw notFound('Producto no encontrado');
    if (await productRepository.hasMovements(id)) throw conflict('El producto tiene movimientos; desactívalo en su lugar', undefined, 'CON_MOVIMIENTOS');
    await db('products').where({ id }).del();
    await auditReq(req, 'PRODUCTO_ELIMINADO', 'products', id, { sku: current.sku });
  },
};
