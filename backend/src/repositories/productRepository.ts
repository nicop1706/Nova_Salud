import { Knex } from 'knex';
import { db, Db } from '../db/knex';
import { escapeLike } from '../utils/http';

export interface ProductRow {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  activeIngredient: string | null;
  laboratory: string | null;
  presentation: string | null;
  categoryId: number;
  categoryName?: string;
  supplierId: number | null;
  supplierName?: string | null;
  purchasePrice: number;
  salePrice: number;
  minStock: number;
  requiresPrescription: boolean;
  active: boolean;
  availableStock?: number;
  totalStock?: number;
  expiredStock?: number;
  nextExpiry?: string | null;
}

/** Agregados de stock por producto. Disponible = lotes NO vencidos con cantidad > 0. */
export function stockColumns(today: string, conn: Db = db): Knex.Raw[] {
  return [
    conn.raw('COALESCE(SUM(b.quantity) FILTER (WHERE b.expires_at >= ?), 0)::int AS available_stock', [today]),
    conn.raw('COALESCE(SUM(b.quantity), 0)::int AS total_stock'),
    conn.raw('COALESCE(SUM(b.quantity) FILTER (WHERE b.expires_at < ?), 0)::int AS expired_stock', [today]),
    conn.raw('MIN(b.expires_at) FILTER (WHERE b.quantity > 0 AND b.expires_at >= ?) AS next_expiry', [today]),
  ];
}

const AVAILABLE_EXPR = 'COALESCE(SUM(b.quantity) FILTER (WHERE b.expires_at >= ?), 0)';

function baseQuery(today: string, conn: Db) {
  return conn('products as p')
    .join('categories as c', 'c.id', 'p.categoryId')
    .leftJoin('suppliers as s', 's.id', 'p.supplierId')
    .leftJoin('batches as b', 'b.productId', 'p.id')
    .groupBy('p.id', 'c.name', 's.name')
    .select('p.*', 'c.name as categoryName', 's.name as supplierName', ...stockColumns(today, conn));
}

/** Condiciones de búsqueda: cada palabra debe coincidir con nombre, principio activo, laboratorio, SKU o código de barras. */
function applyTextSearch(qb: Knex.QueryBuilder, q: string): void {
  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6);
  for (const t of tokens) {
    const like = `%${escapeLike(t)}%`;
    qb.where((w) =>
      w
        .whereRaw('p.name ILIKE ?', [like])
        .orWhereRaw('p.active_ingredient ILIKE ?', [like])
        .orWhereRaw('p.laboratory ILIKE ?', [like])
        .orWhereRaw('p.sku ILIKE ?', [like])
        .orWhereRaw('p.barcode = ?', [t]),
    );
  }
}

export interface ProductListFilters {
  q?: string;
  categoryId?: number;
  supplierId?: number;
  status: 'active' | 'inactive' | 'all';
  stock: 'all' | 'ok' | 'low' | 'out' | 'expired';
  sort: 'name' | 'sku' | 'stock' | 'price';
  dir: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export const productRepository = {
  async list(f: ProductListFilters, today: string, conn: Db = db): Promise<{ rows: ProductRow[]; total: number }> {
    const qb = baseQuery(today, conn);
    if (f.q) applyTextSearch(qb, f.q);
    if (f.categoryId) qb.where('p.categoryId', f.categoryId);
    if (f.supplierId) qb.where('p.supplierId', f.supplierId);
    if (f.status !== 'all') qb.where('p.active', f.status === 'active');

    if (f.stock === 'out') qb.havingRaw(`${AVAILABLE_EXPR} = 0`, [today]);
    else if (f.stock === 'low') qb.havingRaw(`${AVAILABLE_EXPR} > 0 AND ${AVAILABLE_EXPR} <= p.min_stock`, [today, today]);
    else if (f.stock === 'ok') qb.havingRaw(`${AVAILABLE_EXPR} > p.min_stock`, [today]);
    else if (f.stock === 'expired') qb.havingRaw('COALESCE(SUM(b.quantity) FILTER (WHERE b.expires_at < ?), 0) > 0', [today]);

    const [{ count }] = await conn.from(qb.clone().clearSelect().select('p.id').as('t')).count({ count: '*' });

    const dir = f.dir === 'desc' ? 'desc' : 'asc';
    if (f.sort === 'stock') qb.orderByRaw(`${AVAILABLE_EXPR} ${dir}, p.name asc`, [today]);
    else if (f.sort === 'price') qb.orderBy('p.salePrice', dir).orderBy('p.name');
    else if (f.sort === 'sku') qb.orderBy('p.sku', dir);
    else qb.orderByRaw(`lower(p.name) ${dir}`);

    const rows = await qb.limit(f.limit).offset(f.offset);
    return { rows: rows as ProductRow[], total: Number(count) };
  },

  /** Búsqueda rápida para el POS: coincidencias exactas (código/SKU) primero, luego prefijos, luego el resto. */
  async search(q: string, limit: number, today: string, includeInactive: boolean, conn: Db = db): Promise<ProductRow[]> {
    const qb = baseQuery(today, conn);
    if (!includeInactive) qb.where('p.active', true);
    const term = q.trim();
    if (term) {
      applyTextSearch(qb, term);
      qb.orderByRaw(
        `(CASE WHEN p.barcode = ? OR lower(p.sku) = lower(?) THEN 0 WHEN lower(p.name) LIKE lower(?) THEN 1 ELSE 2 END), lower(p.name)`,
        [term, term, `${escapeLike(term)}%`],
      );
    } else {
      qb.orderByRaw('lower(p.name)');
    }
    return (await qb.limit(limit)) as ProductRow[];
  },

  async findByBarcodeOrSku(code: string, today: string, conn: Db = db): Promise<ProductRow | undefined> {
    return (await baseQuery(today, conn)
      .where((w) => w.where('p.barcode', code).orWhereRaw('lower(p.sku) = lower(?)', [code]))
      .first()) as ProductRow | undefined;
  },

  async findDetail(id: number, today: string, conn: Db = db): Promise<ProductRow | undefined> {
    return (await baseQuery(today, conn).where('p.id', id).first()) as ProductRow | undefined;
  },

  findById: (id: number, conn: Db = db): Promise<ProductRow | undefined> => conn('products').where({ id }).first(),
  findBySku: (sku: string, conn: Db = db): Promise<ProductRow | undefined> => conn('products').whereRaw('lower(sku) = lower(?)', [sku]).first(),
  findByBarcode: (barcode: string, conn: Db = db): Promise<ProductRow | undefined> => conn('products').where({ barcode }).first(),
  findManyByIds: (ids: number[], conn: Db = db): Promise<ProductRow[]> => conn('products').whereIn('id', ids),

  async create(data: Record<string, unknown>, conn: Db = db): Promise<ProductRow> {
    const [row] = await conn('products').insert(data).returning('*');
    return row;
  },

  async update(id: number, data: Record<string, unknown>, conn: Db = db): Promise<ProductRow> {
    const [row] = await conn('products')
      .where({ id })
      .update({ ...data, updatedAt: new Date() })
      .returning('*');
    return row;
  },

  async hasMovements(id: number, conn: Db = db): Promise<boolean> {
    const r = await conn('stock_movements').where({ productId: id }).first('id');
    return !!r;
  },
};
