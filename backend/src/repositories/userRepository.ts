import { db, Db } from '../db/knex';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  passwordHash: string;
  role: 'ADMIN' | 'SELLER' | 'WAREHOUSE';
  active: boolean;
  failedLogins: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const PUBLIC_COLS = ['id', 'email', 'name', 'role', 'active', 'lastLoginAt', 'createdAt'] as const;

export const userRepository = {
  findByEmail: (email: string, conn: Db = db): Promise<UserRow | undefined> =>
    conn('users').where({ email }).first(),

  findById: (id: number, conn: Db = db): Promise<UserRow | undefined> => conn('users').where({ id }).first(),

  list: (conn: Db = db) => conn('users').select(...PUBLIC_COLS).orderBy('name'),

  create: async (data: { email: string; name: string; role: string; passwordHash: string }, conn: Db = db) => {
    const [row] = await conn('users').insert(data).returning([...PUBLIC_COLS]);
    return row;
  },

  update: async (id: number, data: Record<string, unknown>, conn: Db = db) => {
    const [row] = await conn('users')
      .where({ id })
      .update({ ...data, updatedAt: new Date() })
      .returning([...PUBLIC_COLS]);
    return row;
  },

  setPassword: (id: number, passwordHash: string, conn: Db = db) =>
    conn('users').where({ id }).update({ passwordHash, failedLogins: 0, lockedUntil: null, updatedAt: new Date() }),

  registerFailure: (id: number, failedLogins: number, lockedUntil: Date | null, conn: Db = db) =>
    conn('users').where({ id }).update({ failedLogins, lockedUntil }),

  registerSuccess: (id: number, conn: Db = db) =>
    conn('users').where({ id }).update({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }),

  count: async (conn: Db = db): Promise<number> => {
    const [{ count }] = await conn('users').count({ count: '*' });
    return Number(count);
  },

  // ---- refresh tokens ----
  insertRefresh: (userId: number, tokenHash: string, expiresAt: Date, conn: Db = db) =>
    conn('refresh_tokens').insert({ userId, tokenHash, expiresAt }),

  findRefresh: (tokenHash: string, conn: Db = db) => conn('refresh_tokens').where({ tokenHash }).first(),

  revokeRefresh: (tokenHash: string, conn: Db = db) =>
    conn('refresh_tokens').where({ tokenHash }).whereNull('revokedAt').update({ revokedAt: new Date() }),

  revokeAllRefresh: (userId: number, conn: Db = db) =>
    conn('refresh_tokens').where({ userId }).whereNull('revokedAt').update({ revokedAt: new Date() }),

  purgeExpiredRefresh: (conn: Db = db) =>
    conn('refresh_tokens').where('expiresAt', '<', new Date(Date.now() - 7 * 86_400_000)).del(),
};
