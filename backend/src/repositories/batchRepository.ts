import { db, Db } from '../db/knex';

export interface BatchRow {
  id: number;
  productId: number;
  batchNumber: string;
  expiresAt: string; // YYYY-MM-DD
  quantity: number;
  initialQty: number;
  receivedAt: Date;
}

export const batchRepository = {
  /** Lotes vendibles (no vencidos, con stock) de un producto, bloqueados y en orden FEFO. */
  async lockSellable(productId: number, today: string, conn: Db): Promise<BatchRow[]> {
    const r = await conn.raw(
      `SELECT id, product_id, batch_number, expires_at, quantity
         FROM batches
        WHERE product_id = ? AND quantity > 0 AND expires_at >= ?
        ORDER BY expires_at ASC, id ASC
          FOR UPDATE`,
      [productId, today],
    );
    return r.rows;
  },

  async lockById(id: number, conn: Db): Promise<BatchRow | undefined> {
    const r = await conn.raw('SELECT * FROM batches WHERE id = ? FOR UPDATE', [id]);
    return r.rows[0];
  },

  /** Bloquea varios lotes en orden de id (evita interbloqueos entre transacciones). */
  async lockMany(ids: number[], conn: Db): Promise<BatchRow[]> {
    if (!ids.length) return [];
    return (await conn('batches').whereIn('id', ids).orderBy('id').forUpdate()) as BatchRow[];
  },

  async lockAllForProduct(productId: number, conn: Db): Promise<BatchRow[]> {
    const r = await conn.raw('SELECT * FROM batches WHERE product_id = ? ORDER BY expires_at DESC, id DESC FOR UPDATE', [productId]);
    return r.rows;
  },

  async findByProductAndNumber(productId: number, batchNumber: string, conn: Db): Promise<BatchRow | undefined> {
    const r = await conn.raw('SELECT * FROM batches WHERE product_id = ? AND batch_number = ? FOR UPDATE', [productId, batchNumber]);
    return r.rows[0];
  },

  async insert(data: { productId: number; batchNumber: string; expiresAt: string; quantity: number }, conn: Db): Promise<BatchRow> {
    const [row] = await conn('batches')
      .insert({ ...data, initialQty: data.quantity })
      .returning('*');
    return row;
  },

  /** Suma (o resta) cantidad. La condición protege contra stock negativo (además del CHECK de la BD). */
  async changeQuantity(id: number, delta: number, conn: Db): Promise<boolean> {
    const qb = conn('batches').where({ id });
    if (delta < 0) qb.andWhere('quantity', '>=', -delta);
    const n = await qb.update({ quantity: conn.raw('quantity + ?', [delta]), updatedAt: new Date() });
    return n === 1;
  },

  addInitialQty: (id: number, qty: number, conn: Db) =>
    conn('batches').where({ id }).update({ initialQty: conn.raw('initial_qty + ?', [qty]) }),

  listByProduct: (productId: number, conn: Db = db): Promise<BatchRow[]> =>
    conn('batches').where({ productId }).orderBy('expiresAt', 'asc').orderBy('id', 'asc'),

  async list(
    f: { productId?: number; status: 'all' | 'with_stock' | 'expired' | 'expiring'; days: number; today: string; horizon: string; limit: number; offset: number },
    conn: Db = db,
  ) {
    const qb = conn('batches as b').join('products as p', 'p.id', 'b.productId');
    if (f.productId) qb.where('b.productId', f.productId);
    if (f.status === 'with_stock') qb.where('b.quantity', '>', 0);
    if (f.status === 'expired') qb.where('b.quantity', '>', 0).where('b.expiresAt', '<', f.today);
    if (f.status === 'expiring') qb.where('b.quantity', '>', 0).where('b.expiresAt', '>=', f.today).where('b.expiresAt', '<=', f.horizon);
    const [{ count }] = await qb.clone().count({ count: '*' });
    const rows = await qb
      .clone()
      .select(
        'b.id',
        'b.productId',
        'b.batchNumber',
        'b.expiresAt',
        'b.quantity',
        'b.initialQty',
        'b.receivedAt',
        'p.name as productName',
        'p.sku as productSku',
        'p.presentation',
        'p.purchasePrice',
      )
      .orderBy('b.expiresAt', 'asc')
      .orderBy('b.id', 'asc')
      .limit(f.limit)
      .offset(f.offset);
    return { rows, total: Number(count) };
  },
};
