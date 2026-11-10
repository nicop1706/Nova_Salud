import { db, Db } from '../db/knex';

export type MovementType = 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'WASTE' | 'RETURN' | 'VOID';

export interface NewMovement {
  productId: number;
  batchId: number | null;
  type: MovementType;
  quantity: number; 
  unitCost?: number | null;
  reason?: string | null;
  reference?: string | null;
  userId?: number | null;
  createdAt?: Date;
}

export const movementRepository = {
  insert: (m: NewMovement, conn: Db = db) => conn('stock_movements').insert(m),
  insertMany: (ms: NewMovement[], conn: Db = db) => (ms.length ? conn('stock_movements').insert(ms) : Promise.resolve()),

  
  async kardex(
    f: { productId?: number; type?: string; from?: Date; to?: Date; limit: number; offset: number },
    conn: Db = db,
  ) {
    const params: any[] = [];
    let inner = 'SELECT sm.*';
    if (f.productId) {
      inner += ', SUM(sm.quantity) OVER (PARTITION BY sm.product_id ORDER BY sm.created_at, sm.id) AS balance';
    } else {
      inner += ', NULL::bigint AS balance';
    }
    inner += ' FROM stock_movements sm';
    if (f.productId) {
      inner += ' WHERE sm.product_id = ?';
      params.push(f.productId);
    }

    const outerWhere: string[] = [];
    if (f.type) {
      outerWhere.push('m.type = ?::movement_type');
      params.push(f.type);
    }
    if (f.from) {
      outerWhere.push('m.created_at >= ?');
      params.push(f.from);
    }
    if (f.to) {
      outerWhere.push('m.created_at <= ?');
      params.push(f.to);
    }
    const where = outerWhere.length ? `WHERE ${outerWhere.join(' AND ')}` : '';

    const base = `
      FROM (${inner}) m
      JOIN products p ON p.id = m.product_id
      LEFT JOIN batches b ON b.id = m.batch_id
      LEFT JOIN users u ON u.id = m.user_id
      ${where}`;

    const total = (await conn.raw(`SELECT COUNT(*)::int AS n ${base}`, params)).rows[0].n as number;
    const rows = (
      await conn.raw(
        `SELECT m.id, m.product_id, p.name AS product_name, p.sku AS product_sku, m.batch_id, b.batch_number,
                b.expires_at AS batch_expires_at, m.type, m.quantity, m.unit_cost, m.reason, m.reference,
                m.balance::int AS balance, u.name AS user_name, m.created_at
         ${base}
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ? OFFSET ?`,
        [...params, f.limit, f.offset],
      )
    ).rows;
    return { rows, total };
  },
};
