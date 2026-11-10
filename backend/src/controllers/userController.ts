import type { Request, Response } from 'express';
import { userService } from '../services/userService';
import { listAudit } from '../services/auditService';
import { pageParams } from '../utils/http';
import { limaEndOfDay, limaStartOfDay } from '../utils/dates';

export const userController = {
  async list(_req: Request, res: Response) {
    res.json({ data: await userService.list() });
  },
  async create(req: Request, res: Response) {
    res.status(201).json({ data: await userService.create(req, req.body) });
  },
  async update(req: Request, res: Response) {
    res.json({ data: await userService.update(req, Number(req.params.id), req.body) });
  },
  async resetPassword(req: Request, res: Response) {
    await userService.resetPassword(req, Number(req.params.id), req.body.newPassword);
    res.status(204).end();
  },
  async audit(req: Request, res: Response) {
    const q = req.query as Record<string, any>;
    const { page, limit, offset } = pageParams(q);
    const { rows, total } = await listAudit({
      page,
      limit,
      offset,
      userId: q.userId,
      entity: q.entity,
      action: q.action,
      from: q.from ? limaStartOfDay(q.from) : undefined,
      to: q.to ? limaEndOfDay(q.to) : undefined,
    });
    res.json({ data: rows, meta: { page, limit, total } });
  },
};
