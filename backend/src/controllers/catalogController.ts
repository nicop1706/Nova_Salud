import type { Request, Response } from 'express';
import { categoryService, supplierService } from '../services/catalogService';

function make(svc: typeof categoryService) {
  return {
    async list(_req: Request, res: Response) {
      res.json({ data: await svc.list() });
    },
    async create(req: Request, res: Response) {
      res.status(201).json({ data: await svc.create(req, req.body) });
    },
    async update(req: Request, res: Response) {
      res.json({ data: await svc.update(req, Number(req.params.id), req.body) });
    },
    async remove(req: Request, res: Response) {
      await svc.remove(req, Number(req.params.id));
      res.status(204).end();
    },
  };
}

export const categoryController = make(categoryService);
export const supplierController = make(supplierService);
