import type { Request, Response } from 'express';
import { importService } from '../services/importService';
import { productService } from '../services/productService';
import { pageParams } from '../utils/http';

export const productController = {
  async list(req: Request, res: Response) {
    const q = req.query as Record<string, any>;
    const { page, limit, offset } = pageParams(q);
    const { data, total } = await productService.list({ ...(q as any), limit, offset }, req.user!.role);
    res.json({ data, meta: { page, limit, total } });
  },

  async search(req: Request, res: Response) {
    const q = req.query as Record<string, any>;
    res.json({ data: await productService.search(q.q, q.limit, req.user!.role, !!q.includeInactive && req.user!.role !== 'SELLER') });
  },

  async byCode(req: Request, res: Response) {
    res.json({ data: await productService.byCode(String(req.params.code), req.user!.role) });
  },

  async detail(req: Request, res: Response) {
    res.json({ data: await productService.detail(Number(req.params.id), req.user!.role) });
  },

  async create(req: Request, res: Response) {
    res.status(201).json({ data: await productService.create(req, req.body) });
  },

  async update(req: Request, res: Response) {
    res.json({ data: await productService.update(req, Number(req.params.id), req.body) });
  },

  async deactivate(req: Request, res: Response) {
    await productService.deactivate(req, Number(req.params.id));
    res.status(204).end();
  },

  async importCsv(req: Request, res: Response) {
    res.json({ data: await importService.importProducts(req, req.body.csv, req.body.dryRun) });
  },
};
