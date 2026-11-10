import type { Request, Response } from 'express';
import { saleService } from '../services/saleService';
import { ticketHtml, ticketNumber, ticketPdf } from '../services/ticketService';
import { pageParams } from '../utils/http';

export const saleController = {
  async create(req: Request, res: Response) {
    res.status(201).json({ data: await saleService.create(req, req.body) });
  },

  async list(req: Request, res: Response) {
    const q = req.query as Record<string, any>;
    const { page, limit, offset } = pageParams(q);
    const r = await saleService.list({ ...q, limit, offset } as any, req.user!);
    res.json({ data: r.rows, meta: { page, limit, total: r.total, completedTotal: r.completedTotal } });
  },

  async detail(req: Request, res: Response) {
    res.json({ data: await saleService.detail(Number(req.params.id), req.user!) });
  },

  async void(req: Request, res: Response) {
    res.json({ data: await saleService.void(req, Number(req.params.id), req.body.reason) });
  },

  async ticket(req: Request, res: Response) {
    const sale = await saleService.detail(Number(req.params.id), req.user!);
    if (req.query.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${ticketNumber(sale.number)}.pdf"`);
      return void res.send(await ticketPdf(sale));
    }
    // El ticket es un documento aislado con estilos propios: CSP específica (todo el contenido está escapado).
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    res.type('html').send(ticketHtml(sale));
  },

  async stockout(req: Request, res: Response) {
    await saleService.stockoutAttempt(req, req.body.productId, req.body.requestedQty);
    res.status(204).end();
  },
};
