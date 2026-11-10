import { Router } from 'express';
import { inventoryController } from '../controllers/inventoryController';
import { ADMIN_WAREHOUSE, authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { idParam } from '../schemas/common';
import {
  adjustSchema,
  batchesQuery,
  kardexQuery,
  receiveSchema,
  returnSchema,
  stockCountCreate,
  stockCountItems,
  wasteSchema,
} from '../schemas/inventory';
import { z } from 'zod';
import { ah } from '../utils/http';

export const inventoryRoutes = Router();
inventoryRoutes.use(authenticate, authorize(...ADMIN_WAREHOUSE));

inventoryRoutes.get('/batches', validate({ query: batchesQuery }), ah(inventoryController.batches));
inventoryRoutes.get('/kardex', validate({ query: kardexQuery }), ah(inventoryController.kardex));
inventoryRoutes.post('/receive', validate({ body: receiveSchema }), ah(inventoryController.receive));
inventoryRoutes.post('/adjust', validate({ body: adjustSchema }), ah(inventoryController.adjust));
inventoryRoutes.post('/waste', validate({ body: wasteSchema }), ah(inventoryController.waste));
inventoryRoutes.post('/waste-expired', ah(inventoryController.wasteExpired));
inventoryRoutes.post('/returns', validate({ body: returnSchema }), ah(inventoryController.registerReturn));

// Toma de inventario (conteo físico)
const countCreate = stockCountCreate.extend({ categoryId: z.coerce.number().int().positive().optional() });
inventoryRoutes.get('/counts', ah(inventoryController.countsList));
inventoryRoutes.post('/counts', validate({ body: countCreate }), ah(inventoryController.countsCreate));
inventoryRoutes.get('/counts/:id', validate({ params: idParam }), ah(inventoryController.countsDetail));
inventoryRoutes.put('/counts/:id', validate({ params: idParam, body: stockCountItems }), ah(inventoryController.countsSave));
inventoryRoutes.post('/counts/:id/apply', validate({ params: idParam }), ah(inventoryController.countsApply));
inventoryRoutes.delete('/counts/:id', validate({ params: idParam }), ah(inventoryController.countsCancel));
