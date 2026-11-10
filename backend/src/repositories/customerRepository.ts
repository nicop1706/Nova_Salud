import { db, Db } from '../db/knex';
import { escapeLike } from '../utils/http';

export const customerRepository = {
  async list(q: string | undefined, limit: number, offset: number, conn: Db = db) {
    const qb = conn('customers as c').where('c.active', true);
    if (q) {
      const like = `%${escapeLike(q)}%`;
      qb.where((w) => w.whereRaw('c.name ILIKE ?', [like]).orWhereRaw('c.doc_number ILIKE ?', [like]).orWhereRaw('c.phone ILIKE ?', [like]));
    }
    const [{ count }] = await qb.clone().count({ count: '*' });
    const rows = await qb
      .clone()
      .select(
        'c.*',
        conn.raw("(SELECT COUNT(*)::int FROM sales s WHERE s.customer_id = c.id AND s.status = 'COMPLETED') AS purchases"),
        conn.raw("(SELECT COALESCE(SUM(s.total),0) FROM sales s WHERE s.customer_id = c.id AND s.status = 'COMPLETED') AS total_spent"),
        conn.raw("(SELECT MAX(s.completed_at) FROM sales s WHERE s.customer_id = c.id AND s.status = 'COMPLETED') AS last_purchase_at"),
      )
      .orderByRaw('lower(c.name)')
      .limit(limit)
      .offset(offset);
    return { rows, total: Number(count) };
  },

  search: (q: string, limit: number, conn: Db = db) => {
    const qb = conn('customers').where({ active: true });
    if (q) {
      const like = `%${escapeLike(q)}%`;
      qb.where((w) => w.whereRaw('name ILIKE ?', [like]).orWhereRaw('doc_number ILIKE ?', [like]));
    }
    return qb.select('id', 'docType', 'docNumber', 'name', 'phone').orderByRaw('lower(name)').limit(limit);
  },

  findById: (id: number, conn: Db = db) => conn('customers').where({ id }).first(),
  findByDoc: (docNumber: string, conn: Db = db) => conn('customers').where({ docNumber }).first(),

  async create(data: Record<string, unknown>, conn: Db = db) {
    const [row] = await conn('customers').insert(data).returning('*');
    return row;
  },
  async update(id: number, data: Record<string, unknown>, conn: Db = db) {
    const [row] = await conn('customers')
      .where({ id })
      .update({ ...data, updatedAt: new Date() })
      .returning('*');
    return row;
  },

  history: (customerId: number, limit: number, offset: number, conn: Db = db) =>
    conn('sales as s')
      .join('users as u', 'u.id', 's.sellerId')
      .where('s.customerId', customerId)
      .select(
        's.id',
        's.number',
        's.status',
        's.total',
        's.paymentMethod',
        's.completedAt',
        'u.name as sellerName',
        conn.raw('(SELECT string_agg(p.name || \' x\' || si.quantity, \', \' ORDER BY si.id) FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id) AS summary'),
      )
      .orderBy('s.completedAt', 'desc')
      .limit(limit)
      .offset(offset),

  /** Productos que el cliente compra con más frecuencia (ventas no anuladas). */
  async frequentProducts(customerId: number, today: string, limit: number, conn: Db = db) {
    const r = await conn.raw(
      `SELECT p.id, p.name, p.sku, p.presentation, p.sale_price, p.requires_prescription,
              SUM(si.quantity)::int AS total_qty, COUNT(DISTINCT s.id)::int AS times,
              COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.product_id = p.id AND b.expires_at >= ?), 0)::int AS available_stock
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         JOIN products p ON p.id = si.product_id
        WHERE s.customer_id = ? AND s.status = 'COMPLETED' AND p.active
        GROUP BY p.id
        ORDER BY times DESC, total_qty DESC
        LIMIT ?`,
      [today, customerId, limit],
    );
    return r.rows;
  },
};
