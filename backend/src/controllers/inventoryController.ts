import type { Request, Response } from 'express';
import { inventoryService } from '../services/inventoryService';
import { stockCountService } from '../services/stockCountService';
import { pageParams } from '../utils/http';

export const inventoryController = {
  async batches(req: Request, res: Response) {
    const q = req.query as Record<string, any>;
    const { page, limit, offset } = pageParams(q, 50);
    const { rows, total } = await inventoryService.listBatches({ productId: q.productId, status: q.status, days: q.days, limit, offset });
    res.json({ data: rows, meta: { page, limit, total } });
  },

  async receive(req: Request, res: Response) {
    res.status(201).json({ data: await inventoryService.receive(req, req.body) });
  },
  async adjust(req: Request, res: Response) {
    res.json({ data: await inventoryService.adjust(req, req.body) });
  },
  async waste(req: Request, res: Response) {
    res.json({ data: await inventoryService.waste(req, req.body) });
  },
  async wasteExpired(req: Request, res: Response) {
    res.json({ data: await inventoryService.wasteExpired(req) });
  },
  async registerReturn(req: Request, res: Response) {
    res.json({ data: await inventoryService.registerReturn(req, req.body) });
  },

  async kardex(req: Request, res: Response) {
    const q = req.query as Record<string, any>;
    const { page, limit, offset } = pageParams(q, 50);
    const { rows, total } = await inventoryService.kardex({ productId: q.productId, type: q.type, from: q.from, to: q.to, limit, offset });
    res.json({ data: rows, meta: { page, limit, total } });
  },

  // ---- toma de inventario (conteo físico) ----
  async countsList(_req: Request, res: Response) {
    res.json({ data: await stockCountService.list() });
  },
  async countsCreate(req: Request, res: Response) {
    res.status(201).json({ data: await stockCountService.create(req, req.body.notes, req.body.categoryId) });
  },
  async countsDetail(req: Request, res: Response) {
    res.json({ data: await stockCountService.detail(Number(req.params.id)) });
  },
  async countsSave(req: Request, res: Response) {
    res.json({ data: await stockCountService.saveCounts(req, Number(req.params.id), req.body.items) });
  },
  async countsApply(req: Request, res: Response) {
    res.json({ data: await stockCountService.apply(req, Number(req.params.id)) });
  },
  async countsCancel(req: Request, res: Response) {
    await stockCountService.cancel(req, Number(req.params.id));
    res.status(204).end();
  },
};
