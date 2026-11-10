import { db, Db } from '../db/knex';
import { logger } from '../config/logger';
import { eventHub } from '../realtime/eventHub';
import { addDaysYmd, diffDays, todayLima } from '../utils/dates';
import { settingsService } from './settingsService';

export type AlertType = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'EXPIRED' | 'EXPIRING';
export type AlertPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM';

interface Candidate {
  key: string;
  type: AlertType;
  priority: AlertPriority;
  productId: number;
  batchId: number | null;
  message: string;
  data: Record<string, unknown>;
}

export interface AlertSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  byType: Record<AlertType, number>;
}

export interface RecalcResult {
  opened: number;
  resolved: number;
  newAlerts: Array<{ id: number; type: AlertType; priority: AlertPriority; message: string }>;
  summary: AlertSummary;
}

const ADVISORY_LOCK = 727001;

/** Calcula el conjunto de alertas que deberían estar abiertas ahora mismo. */
export async function computeCandidates(conn: Db, today: string, expiryDays: number[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const firstThreshold = expiryDays[0];
  const horizon = addDaysYmd(today, expiryDays[expiryDays.length - 1]);

  // --- Stock bajo / agotado (solo productos activos, solo lotes no vencidos) ---
  const stock = await conn.raw(
    `SELECT p.id, p.name, p.sku, p.min_stock,
            COALESCE(SUM(b.quantity) FILTER (WHERE b.expires_at >= ?), 0)::int AS available
       FROM products p
       LEFT JOIN batches b ON b.product_id = p.id
      WHERE p.active
      GROUP BY p.id
     HAVING COALESCE(SUM(b.quantity) FILTER (WHERE b.expires_at >= ?), 0) <= p.min_stock`,
    [today, today],
  );
  for (const r of stock.rows as Array<{ id: number; name: string; sku: string; minStock: number; available: number }>) {
    if (r.available === 0) {
      out.push({
        key: `OUT_OF_STOCK:p${r.id}`,
        type: 'OUT_OF_STOCK',
        priority: 'CRITICAL',
        productId: r.id,
        batchId: null,
        message: `"${r.name}" está agotado (sin stock disponible)`,
        data: { sku: r.sku, available: 0, minStock: r.minStock },
      });
    } else {
      out.push({
        key: `LOW_STOCK:p${r.id}`,
        type: 'LOW_STOCK',
        priority: r.available <= Math.ceil(r.minStock / 2) ? 'HIGH' : 'MEDIUM',
        productId: r.id,
        batchId: null,
        message: `Stock bajo: "${r.name}" tiene ${r.available} unidad(es) (mínimo ${r.minStock})`,
        data: { sku: r.sku, available: r.available, minStock: r.minStock },
      });
    }
  }

  // --- Lotes vencidos y por vencer ---
  const batches = await conn.raw(
    `SELECT b.id, b.product_id, b.batch_number, b.expires_at, b.quantity, p.name, p.sku
       FROM batches b JOIN products p ON p.id = b.product_id
      WHERE b.quantity > 0 AND b.expires_at <= ?`,
    [horizon],
  );
  for (const b of batches.rows as Array<{ id: number; productId: number; batchNumber: string; expiresAt: string; quantity: number; name: string; sku: string }>) {
    if (b.expiresAt < today) {
      out.push({
        key: `EXPIRED:b${b.id}`,
        type: 'EXPIRED',
        priority: 'CRITICAL',
        productId: b.productId,
        batchId: b.id,
        message: `Lote ${b.batchNumber} de "${b.name}" está vencido desde el ${b.expiresAt} (${b.quantity} uds.)`,
        data: { sku: b.sku, batchNumber: b.batchNumber, expiresAt: b.expiresAt, quantity: b.quantity, daysToExpiry: diffDays(today, b.expiresAt) },
      });
    } else {
      const days = diffDays(today, b.expiresAt);
      out.push({
        key: `EXPIRING:b${b.id}`,
        type: 'EXPIRING',
        priority: days <= firstThreshold ? 'HIGH' : 'MEDIUM',
        productId: b.productId,
        batchId: b.id,
        message: `Lote ${b.batchNumber} de "${b.name}" vence en ${days} día(s) (${b.quantity} uds.)`,
        data: { sku: b.sku, batchNumber: b.batchNumber, expiresAt: b.expiresAt, quantity: b.quantity, daysToExpiry: days },
      });
    }
  }
  return out;
}

export async function alertSummary(conn: Db = db): Promise<AlertSummary> {
  const rows = (await conn('alerts').where({ status: 'OPEN' }).select('type', 'priority').count({ n: '*' }).groupBy('type', 'priority')) as Array<{
    type: AlertType;
    priority: AlertPriority;
    n: number;
  }>;
  const s: AlertSummary = {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    byType: { OUT_OF_STOCK: 0, LOW_STOCK: 0, EXPIRED: 0, EXPIRING: 0 },
  };
  for (const r of rows) {
    const n = Number(r.n);
    s.total += n;
    s.byType[r.type] += n;
    if (r.priority === 'CRITICAL') s.critical += n;
    else if (r.priority === 'HIGH') s.high += n;
    else s.medium += n;
  }
  return s;
}

async function doRecalculate(): Promise<RecalcResult> {
  const today = todayLima();
  const expiryDays = await settingsService.getExpiryDays();

  const { opened, resolved, newAlerts } = await db.transaction(async (trx) => {
    // Evita que dos instancias recalculen a la vez
    await trx.raw('SELECT pg_advisory_xact_lock(?)', [ADVISORY_LOCK]);

    const candidates = await computeCandidates(trx, today, expiryDays);
    const candidateKeys = new Set(candidates.map((c) => c.key));

    const open = (await trx('alerts').where({ status: 'OPEN' }).select('id', 'key')) as Array<{ id: number; key: string }>;
    const openKeys = new Set(open.map((o) => o.key));

    // Resolver las que ya no aplican
    const toResolve = open.filter((o) => !candidateKeys.has(o.key)).map((o) => o.id);
    if (toResolve.length) {
      await trx('alerts').whereIn('id', toResolve).update({ status: 'RESOLVED', resolvedAt: new Date(), updatedAt: new Date() });
    }

    // Crear / actualizar / reabrir
    const created: RecalcResult['newAlerts'] = [];
    for (const c of candidates) {
      const rows = await trx('alerts')
        .insert({
          key: c.key,
          type: c.type,
          priority: c.priority,
          status: 'OPEN',
          productId: c.productId,
          batchId: c.batchId,
          message: c.message,
          data: JSON.stringify(c.data),
        })
        .onConflict('key')
        .merge({
          type: c.type,
          priority: c.priority,
          status: 'OPEN',
          productId: c.productId,
          batchId: c.batchId,
          message: c.message,
          data: JSON.stringify(c.data),
          resolvedAt: null,
          updatedAt: new Date(),
          openedAt: trx.raw("CASE WHEN alerts.status = 'RESOLVED' THEN now() ELSE alerts.opened_at END"),
        })
        .returning(['id']);
      if (!openKeys.has(c.key)) created.push({ id: rows[0].id, type: c.type, priority: c.priority, message: c.message });
    }
    return { opened: created.length, resolved: toResolve.length, newAlerts: created };
  });

  const summary = await alertSummary();
  eventHub.broadcast('alerts', summary);
  for (const a of newAlerts.slice(0, 20)) eventHub.broadcast('alert', a);
  if (opened || resolved) logger.info({ opened, resolved, total: summary.total }, 'Alertas recalculadas');
  return { opened, resolved, newAlerts, summary };
}

// Serializa y agrupa recálculos: si hay uno en curso, solo se encola uno más.
let running: Promise<RecalcResult> | null = null;
let queued: Promise<RecalcResult> | null = null;

export function recalculateAlerts(): Promise<RecalcResult> {
  if (!running) {
    running = doRecalculate().finally(() => {
      running = null;
    });
    return running;
  }
  if (!queued) {
    queued = running
      .catch(() => undefined)
      .then(() => {
        queued = null;
        return recalculateAlerts();
      });
  }
  return queued;
}

export async function listAlerts(f: { status: 'OPEN' | 'RESOLVED' | 'all'; type?: string; priority?: string; limit: number; offset: number }, conn: Db = db) {
  const qb = conn('alerts as a')
    .join('products as p', 'p.id', 'a.productId')
    .leftJoin('batches as b', 'b.id', 'a.batchId');
  if (f.status !== 'all') qb.where('a.status', f.status);
  if (f.type) qb.where('a.type', f.type);
  if (f.priority) qb.where('a.priority', f.priority);
  const [{ count }] = await qb.clone().count({ count: '*' });
  const rows = await qb
    .clone()
    .select(
      'a.id',
      'a.type',
      'a.priority',
      'a.status',
      'a.message',
      'a.data',
      'a.openedAt',
      'a.resolvedAt',
      'a.productId',
      'a.batchId',
      'p.name as productName',
      'p.sku as productSku',
      'b.batchNumber',
    )
    .orderByRaw("CASE a.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END")
    .orderBy('a.openedAt', 'desc')
    .limit(f.limit)
    .offset(f.offset);
  return { rows, total: Number(count) };
}
