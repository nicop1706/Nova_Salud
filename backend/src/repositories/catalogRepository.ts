import { db, Db } from '../db/knex';

type Table = 'categories' | 'suppliers';

function repo(table: Table, extraCount: string) {
  return {
    list: (conn: Db = db) =>
      conn(`${table} as t`)
        .select('t.*', conn.raw(`(SELECT COUNT(*)::int FROM products p WHERE p.${extraCount} = t.id) AS product_count`))
        .orderBy('t.name'),
    findById: (id: number, conn: Db = db) => conn(table).where({ id }).first(),
    findByName: (name: string, conn: Db = db) => conn(table).whereRaw('lower(name) = lower(?)', [name]).first(),
    create: async (data: Record<string, unknown>, conn: Db = db) => {
      const [row] = await conn(table).insert(data).returning('*');
      return row;
    },
    update: async (id: number, data: Record<string, unknown>, conn: Db = db) => {
      const [row] = await conn(table).where({ id }).update(data).returning('*');
      return row;
    },
    productCount: async (id: number, conn: Db = db): Promise<number> => {
      const [{ count }] = await conn('products').where(extraCount === 'category_id' ? { categoryId: id } : { supplierId: id }).count({ count: '*' });
      return Number(count);
    },
    remove: (id: number, conn: Db = db) => conn(table).where({ id }).del(),
  };
}

export const categoryRepository = repo('categories', 'category_id');
export const supplierRepository = repo('suppliers', 'supplier_id');
