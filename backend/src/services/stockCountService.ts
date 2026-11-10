import type { Request } from 'express';
import { db } from '../db/knex';
import { batchRepository } from '../repositories/batchRepository';
import { movementRepository } from '../repositories/movementRepository';
import { todayLima } from '../utils/dates';
import { conflict, notFound } from '../utils/errors';
import { auditReq } from './auditService';
import { stockChanged } from './stockEvents';

/**
 * Toma de inventario (conteo físico): se congela la cantidad del sistema por producto,
 * se registran los conteos y, al aplicar, las diferencias generan ajustes en kardex.
 * - Si falta stock físico, se descuenta por FEFO (primero los lotes que vencen antes).
 * - Si sobra, se suma al lote con vencimiento más lejano.
 */
export const stockCountService = {
  async create(req: Request, notes: string | null, categoryId?: number) {
    const today = todayLima();
    const id = await db.transaction(async (trx) => {
      const [count] = await trx('stock_counts').insert({ notes, createdById: req.user!.id }).returning('id');
      const q = trx('products as p')
        .leftJoin('batches as b', 'b.productId', 'p.id')
        .where('p.active', true)
        .groupBy('p.id')
        .select('p.id as productId', trx.raw('COALESCE(SUM(b.quantity) FILTER (WHERE b.expires_at >= ?), 0)::int AS system_qty', [today]));
      if (categoryId) q.where('p.categoryId', categoryId);
      const rows = await q;
      for (let i = 0; i < rows.length; i += 500) {
        await trx('stock_count_items').insert(rows.slice(i, i + 500).map((r: any) => ({ countId: count.id, productId: r.productId, systemQty: r.systemQty })));
      }
      return count.id as number;
    });
    await auditReq(req, 'CONTEO_INICIADO', 'stock_counts', id, { notes });
    return this.detail(id);
  },

  async list() {
    return db('stock_counts as c')
      .join('users as u', 'u.id', 'c.createdById')
      .select(
        'c.id',
        'c.status',
        'c.notes',
        'c.createdAt',
        'c.appliedAt',
        'u.name as createdByName',
        db.raw('(SELECT COUNT(*)::int FROM stock_count_items i WHERE i.count_id = c.id) AS items'),
        db.raw('(SELECT COUNT(*)::int FROM stock_count_items i WHERE i.count_id = c.id AND i.counted_qty IS NOT NULL) AS counted'),
        db.raw('(SELECT COUNT(*)::int FROM stock_count_items i WHERE i.count_id = c.id AND i.counted_qty IS NOT NULL AND i.counted_qty <> i.system_qty) AS differences'),
      )
      .orderBy('c.id', 'desc')
      .limit(50);
  },

  async detail(id: number) {
    const count = await db('stock_counts as c').join('users as u', 'u.id', 'c.createdById').where('c.id', id).first('c.*', 'u.name as createdByName');
    if (!count) throw notFound('Conteo no encontrado');
    const items = await db('stock_count_items as i')
      .join('products as p', 'p.id', 'i.productId')
      .where('i.countId', id)
      .select('i.productId', 'i.systemQty', 'i.countedQty', 'p.name', 'p.sku', 'p.presentation', 'p.purchasePrice')
      .orderByRaw('lower(p.name)');
    return { ...count, items: items.map((i: any) => ({ ...i, difference: i.countedQty == null ? null : i.countedQty - i.systemQty })) };
  },

  async saveCounts(req: Request, id: number, items: Array<{ productId: number; countedQty: number | null }>) {
    const count = await db('stock_counts').where({ id }).first();
    if (!count) throw notFound('Conteo no encontrado');
    if (count.status !== 'OPEN') throw conflict('El conteo ya no está abierto', undefined, 'CONTEO_CERRADO');
    await db.transaction(async (trx) => {
      for (const it of items) {
        await trx('stock_count_items').where({ countId: id, productId: it.productId }).update({ countedQty: it.countedQty });
      }
    });
    return this.detail(id);
  },

  async cancel(req: Request, id: number) {
    const n = await db('stock_counts').where({ id, status: 'OPEN' }).update({ status: 'CANCELLED' });
    if (!n) throw conflict('El conteo no existe o ya fue cerrado', undefined, 'CONTEO_CERRADO');
    await auditReq(req, 'CONTEO_CANCELADO', 'stock_counts', id);
  },

  /** Aplica las diferencias como ajustes. Compara contra el stock ACTUAL del sistema, no contra el congelado. */
  async apply(req: Request, id: number) {
    const today = todayLima();
    const touched: number[] = [];
    let adjusted = 0;
    let units = 0;
    await db.transaction(async (trx) => {
      const count = (await trx.raw('SELECT * FROM stock_counts WHERE id = ? FOR UPDATE', [id])).rows[0];
      if (!count) throw notFound('Conteo no encontrado');
      if (count.status !== 'OPEN') throw conflict('El conteo ya fue cerrado', undefined, 'CONTEO_CERRADO');
      const items = await trx('stock_count_items').where({ countId: id }).whereNotNull('countedQty').orderBy('productId');

      for (const it of items) {
        const batches = (await batchRepository.lockAllForProduct(it.productId, trx)).filter((b) => b.expiresAt >= today);
        const current = batches.reduce((s, b) => s + b.quantity, 0);
        const diff = it.countedQty - current;
        if (diff === 0) continue;
        const reason = `Conteo físico #${id}: sistema ${current}, físico ${it.countedQty}`;
        if (diff > 0) {
          // sobrante → lote vigente con vencimiento más lejano (si no hay, no se puede ubicar)
          const target = batches.sort((a, b) => (a.expiresAt < b.expiresAt ? 1 : -1))[0];
          if (!target) throw conflict(`El producto #${it.productId} no tiene lotes vigentes para ubicar el sobrante; ingresa un lote primero`, undefined, 'SIN_LOTES');
          await batchRepository.changeQuantity(target.id, diff, trx);
          await movementRepository.insert({ productId: it.productId, batchId: target.id, type: 'ADJUSTMENT', quantity: diff, reason, reference: `CONTEO-${id}`, userId: req.user!.id }, trx);
        } else {
          let remaining = -diff;
          for (const b of [...batches].sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1))) {
            if (remaining <= 0) break;
            const take = Math.min(b.quantity, remaining);
            if (take <= 0) continue;
            await batchRepository.changeQuantity(b.id, -take, trx);
            await movementRepository.insert({ productId: it.productId, batchId: b.id, type: 'ADJUSTMENT', quantity: -take, reason, reference: `CONTEO-${id}`, userId: req.user!.id }, trx);
            remaining -= take;
          }
        }
        touched.push(it.productId);
        adjusted += 1;
        units += Math.abs(diff);
      }
      await trx('stock_counts').where({ id }).update({ status: 'APPLIED', appliedAt: new Date() });
    });
    await auditReq(req, 'CONTEO_APLICADO', 'stock_counts', id, { productos: adjusted, unidades: units });
    if (touched.length) stockChanged(touched);
    return { adjusted, units };
  },
};
