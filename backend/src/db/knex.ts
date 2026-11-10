import path from 'node:path';
import knexLib, { Knex } from 'knex';
import { types } from 'pg';
import { env } from '../config/env';

// Tipos de PostgreSQL → JS
types.setTypeParser(types.builtins.NUMERIC, (v) => parseFloat(v)); // dinero y promedios como number
types.setTypeParser(types.builtins.INT8, (v) => parseInt(v, 10)); // COUNT/SUM como number
types.setTypeParser(types.builtins.DATE, (v) => v); // columnas DATE como 'YYYY-MM-DD'

// Mapeo camelCase (código) ↔ snake_case (base de datos).
// Solo se transforman los nombres de columnas de primer nivel (no el contenido de JSONB).
const toSnake = (s: string): string => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const toCamel = (s: string): string => s.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

function camelRow<T>(row: T): T {
  if (row === null || typeof row !== 'object' || Array.isArray(row) || row instanceof Date) return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) out[toCamel(k)] = v;
  return out as T;
}

function postProcessResponse(result: any): any {
  if (Array.isArray(result)) return result.map(camelRow);
  // Resultado "raw" de pg: { command, rowCount, rows, ... }
  if (result && typeof result === 'object' && Array.isArray(result.rows) && 'command' in result) {
    result.rows = result.rows.map(camelRow);
    return result;
  }
  return camelRow(result);
}

export const knexConfig: Knex.Config = {
  client: 'pg',
  connection: env.DATABASE_URL,
  pool: { min: 1, max: 10 },
  wrapIdentifier: (value, origImpl) => (value === '*' ? origImpl(value) : origImpl(toSnake(value))),
  postProcessResponse,
  migrations: {
    // Funciona igual en desarrollo (src/db → ../../migrations) y compilado (dist/src/db → dist/migrations)
    directory: path.resolve(__dirname, '../../migrations'),
    loadExtensions: ['.js', '.ts'],
    tableName: 'knex_migrations',
  },
};

export const db: Knex = knexLib(knexConfig);

export type Db = Knex | Knex.Transaction;
export type Trx = Knex.Transaction;
