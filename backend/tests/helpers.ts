import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { db } from '../src/db/knex';
import { recalculateAlerts } from '../src/services/alertService';
import { addDaysYmd, todayLima } from '../src/utils/dates';

export const TABLES = `audit_logs, stock_count_items, stock_counts, settings, alerts, stockout_events, sale_item_batches, sale_items,
  sales, customers, stock_movements, batches, products, suppliers, categories, refresh_tokens, users`;

export async function resetDb(): Promise<void> {
  await recalculateAlerts().catch(() => undefined); // deja terminar recálculos en curso
  await db.raw(`TRUNCATE ${TABLES} RESTART IDENTITY CASCADE`);
  await db.raw('ALTER SEQUENCE sales_number_seq RESTART WITH 1');
}

export interface Fixture {
  admin: { id: number };
  seller: { id: number };
  warehouse: { id: number };
  categoryId: number;
  supplierId: number;
}

export async function seedBasics(): Promise<Fixture> {
  const hash = await bcrypt.hash('Clave1234', 4);
  const [admin, seller, warehouse] = await db('users')
    .insert([
      { email: 'admin@test.pe', name: 'Admin', role: 'ADMIN', passwordHash: hash },
      { email: 'vendedor@test.pe', name: 'Vendedor', role: 'SELLER', passwordHash: hash },
      { email: 'almacen@test.pe', name: 'Almacén', role: 'WAREHOUSE', passwordHash: hash },
    ])
    .returning('id');
  const [cat] = await db('categories').insert({ name: 'Analgésicos' }).returning('id');
  const [sup] = await db('suppliers').insert({ name: 'Proveedor Demo' }).returning('id');
  return { admin, seller, warehouse, categoryId: cat.id, supplierId: sup.id };
}

export async function makeProduct(
  f: Fixture,
  o: { sku?: string; name?: string; price?: number; cost?: number; min?: number; rx?: boolean; active?: boolean } = {},
): Promise<number> {
  const [p] = await db('products')
    .insert({
      sku: o.sku ?? `SKU-${Math.random().toString(36).slice(2, 8)}`,
      name: o.name ?? 'Paracetamol 500 mg',
      categoryId: f.categoryId,
      supplierId: f.supplierId,
      purchasePrice: o.cost ?? 1,
      salePrice: o.price ?? 11.8,
      minStock: o.min ?? 5,
      requiresPrescription: o.rx ?? false,
      active: o.active ?? true,
    })
    .returning('id');
  return p.id;
}

/** days = días hasta el vencimiento (negativo = ya vencido) */
export async function makeBatch(productId: number, number: string, days: number, quantity: number): Promise<number> {
  const [b] = await db('batches')
    .insert({ productId, batchNumber: number, expiresAt: addDaysYmd(todayLima(), days), quantity, initialQty: quantity })
    .returning('id');
  return b.id;
}

export const stockOf = async (productId: number): Promise<number> =>
  Number((await db('batches').where({ productId }).sum({ s: 'quantity' }))[0].s ?? 0);

export const batchQty = async (id: number): Promise<number> => (await db('batches').where({ id }).first('quantity')).quantity;

export const fakeReq = (user: { id: number; role: 'ADMIN' | 'SELLER' | 'WAREHOUSE' }): Request =>
  ({ user: { id: user.id, role: user.role, email: 'x@test.pe', name: 'Test' }, ip: '127.0.0.1' }) as unknown as Request;
