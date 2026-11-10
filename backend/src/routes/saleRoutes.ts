import { Router } from 'express';
import { z } from 'zod';
import { saleController } from '../controllers/saleController';
import { ADMIN, ADMIN_SELLER, authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { idParam } from '../schemas/common';
import { createSaleSchema, saleListQuery, stockoutSchema, voidSaleSchema } from '../schemas/sales';
import { ah } from '../utils/http';

export const saleRoutes = Router();
saleRoutes.use(authenticate);

saleRoutes.post('/', authorize(...ADMIN_SELLER), validate({ body: createSaleSchema }), ah(saleController.create));
saleRoutes.post('/stockout', authorize(...ADMIN_SELLER), validate({ body: stockoutSchema }), ah(saleController.stockout));
saleRoutes.get('/', authorize(...ADMIN_SELLER), validate({ query: saleListQuery }), ah(saleController.list));
saleRoutes.get('/:id', authorize(...ADMIN_SELLER), validate({ params: idParam }), ah(saleController.detail));
saleRoutes.get(
  '/:id/ticket',
  authorize(...ADMIN_SELLER),
  validate({ params: idParam, query: z.object({ format: z.enum(['html', 'pdf']).default('html') }) }),
  ah(saleController.ticket),
);
saleRoutes.post('/:id/void', authorize(...ADMIN), validate({ params: idParam, body: voidSaleSchema }), ah(saleController.void));
