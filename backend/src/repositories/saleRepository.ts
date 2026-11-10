import { db, Db } from '../db/knex';
import { limaEndOfDay, limaStartOfDay } from '../utils/dates';
import { escapeLike } from '../utils/http';

export interface SaleListFilters {
  from?: string;
  to?: string;
  status?: 'COMPLETED' | 'VOIDED';
  paymentMethod?: string;
  sellerId?: number;
  customerId?: number;
  q?: string;
  limit: number;
  offset: number;
}

export const saleRepository = {
  async list(f: SaleListFilters, conn: Db = db) {
    const qb = conn('sales as s')
      .join('users as u', 'u.id', 's.sellerId')
      .leftJoin('customers as c', 'c.id', 's.customerId');
    if (f.from) qb.where('s.completedAt', '>=', limaStartOfDay(f.from));
    if (f.to) qb.where('s.completedAt', '<=', limaEndOfDay(f.to));
    if (f.status) qb.where('s.status', f.status);
    if (f.paymentMethod) qb.where('s.paymentMethod', f.paymentMethod);
    if (f.sellerId) qb.where('s.sellerId', f.sellerId);
    if (f.customerId) qb.where('s.customerId', f.customerId);
    if (f.q) {
      const like = `%${escapeLike(f.q)}%`;
      const num = /^\d+$/.test(f.q) ? Number(f.q) : null;
      qb.where((w) => {
        w.whereRaw('c.name ILIKE ?', [like]).orWhereRaw('c.doc_number ILIKE ?', [like]);
        if (num !== null) w.orWhere('s.number', num);
      });
    }
    const [{ count }] = await qb.clone().count({ count: '*' });
    const [{ sum }] = await qb.clone().where('s.status', 'COMPLETED').sum({ sum: 's.total' });
    const rows = await qb
      .clone()
      .select(
        's.id',
        's.number',
        's.status',
        's.paymentMethod',
        's.subtotal',
        's.igv',
        's.discount',
        's.total',
        's.completedAt',
        's.serviceSeconds',
        'u.name as sellerName',
        'c.name as customerName',
        'c.docNumber as customerDoc',
        conn.raw('(SELECT COALESCE(SUM(quantity),0)::int FROM sale_items si WHERE si.sale_id = s.id) AS items_count'),
      )
      .orderBy('s.completedAt', 'desc')
      .orderBy('s.id', 'desc')
      .limit(f.limit)
      .offset(f.offset);
    return { rows, total: Number(count), completedTotal: Number(sum ?? 0) };
  },

  /** Venta completa con ítems, lotes descontados, cliente y cajero (para ticket y detalle). */
  async findDetail(id: number, conn: Db = db) {
    const sale = await conn('sales as s')
      .join('users as u', 'u.id', 's.sellerId')
      .leftJoin('customers as c', 'c.id', 's.customerId')
      .leftJoin('users as vu', 'vu.id', 's.voidedById')
      .where('s.id', id)
      .first(
        's.*',
        'u.name as sellerName',
        'c.name as customerName',
        'c.docType as customerDocType',
        'c.docNumber as customerDoc',
        'vu.name as voidedByName',
      );
    if (!sale) return undefined;

    const items = await conn('sale_items as si')
      .join('products as p', 'p.id', 'si.productId')
      .where('si.saleId', id)
      .select('si.id', 'si.productId', 'si.quantity', 'si.unitPrice', 'si.discount', 'si.lineTotal', 'p.name', 'p.sku', 'p.presentation', 'p.requiresPrescription')
      .orderBy('si.id');
    const itemIds = items.map((i: any) => i.id);
    const batches = itemIds.length
      ? await conn('sale_item_batches as sib')
          .join('batches as b', 'b.id', 'sib.batchId')
          .whereIn('sib.saleItemId', itemIds)
          .select('sib.saleItemId', 'sib.batchId', 'sib.quantity', 'b.batchNumber', 'b.expiresAt')
      : [];
    return {
      ...sale,
      items: items.map((i: any) => ({ ...i, batches: batches.filter((b: any) => b.saleItemId === i.id) })),
    };
  },
};
