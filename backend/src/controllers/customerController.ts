import type { Request, Response } from 'express';
import { customerService } from '../services/customerService';
import { pageParams } from '../utils/http';

export const customerController = {
  async list(req: Request, res: Response) {
    const q = req.query as Record<string, any>;
    const { page, limit, offset } = pageParams(q);
    const r = await customerService.list(q.q, limit, offset);
    res.json({ data: r.rows, meta: { page, limit, total: r.total } });
  },
  async search(req: Request, res: Response) {
    const q = req.query as Record<string, any>;
    res.json({ data: await customerService.search(q.q, q.limit) });
  },
  async detail(req: Request, res: Response) {
    res.json({ data: await customerService.detail(Number(req.params.id)) });
  },
  async frequent(req: Request, res: Response) {
    res.json({ data: await customerService.frequent(Number(req.params.id)) });
  },
  async create(req: Request, res: Response) {
    res.status(201).json({ data: await customerService.create(req, req.body) });
  },
  async update(req: Request, res: Response) {
    res.json({ data: await customerService.update(req, Number(req.params.id), req.body) });
  },
  async deactivate(req: Request, res: Response) {
    await customerService.deactivate(req, Number(req.params.id));
    res.status(204).end();
  },
};
