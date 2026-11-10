import type { Request } from 'express';
import { db, Db } from '../db/knex';
import { logger } from '../config/logger';

export interface AuditEntry {
  userId?: number | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  detail?: unknown;
  ip?: string | null;
}

/** Registro de auditoría. Nunca debe romper la operación principal. */
export async function audit(entry: AuditEntry, conn: Db = db): Promise<void> {
  try {
    await conn('audit_logs').insert({
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId != null ? String(entry.entityId) : null,
      detail: entry.detail != null ? JSON.stringify(entry.detail) : null,
      ip: entry.ip ?? null,
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, 'No se pudo registrar la auditoría');
  }
}

export const auditReq = (
  req: Request,
  action: string,
  entity: string,
  entityId?: string | number | null,
  detail?: unknown,
  conn?: Db,
): Promise<void> =>
  audit({ userId: req.user?.id ?? null, action, entity, entityId, detail, ip: req.ip ?? null }, conn);

export async function listAudit(q: {
  page: number;
  limit: number;
  offset: number;
  userId?: number;
  entity?: string;
  action?: string;
  from?: Date;
  to?: Date;
}) {
  const base = db('audit_logs as a').leftJoin('users as u', 'u.id', 'a.user_id');
  if (q.userId) base.where('a.user_id', q.userId);
  if (q.entity) base.where('a.entity', q.entity);
  if (q.action) base.where('a.action', 'ilike', `%${q.action}%`);
  if (q.from) base.where('a.created_at', '>=', q.from);
  if (q.to) base.where('a.created_at', '<=', q.to);
  const [{ count }] = await base.clone().count({ count: '*' });
  const rows = await base
    .clone()
    .select('a.id', 'a.action', 'a.entity', 'a.entityId', 'a.detail', 'a.ip', 'a.createdAt', 'u.name as userName', 'u.email as userEmail')
    .orderBy('a.id', 'desc')
    .limit(q.limit)
    .offset(q.offset);
  return { rows, total: Number(count) };
}
