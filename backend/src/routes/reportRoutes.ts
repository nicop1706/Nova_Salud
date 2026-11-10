import { Router } from 'express';
import { z } from 'zod';
import { reportController } from '../controllers/reportController';
import { ADMIN, ADMIN_WAREHOUSE, authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { ymd } from '../schemas/common';
import { REPORT_KEYS } from '../services/reportService';
import { ah } from '../utils/http';
import { AppError } from '../utils/errors';

export const reportRoutes = Router();
reportRoutes.use(authenticate);

reportRoutes.get('/dashboard', authorize(...ADMIN), ah(reportController.dashboard));
reportRoutes.get(
  '/indicators',
  authorize(...ADMIN),
  validate({ query: z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }) }),
  ah(reportController.indicators),
);

// Las ventas contienen datos comerciales sensibles: solo administrador. El resto, también almacén.
reportRoutes.get(
  '/:key',
  validate({
    params: z.object({ key: z.enum(REPORT_KEYS) }),
    query: z.object({
      from: ymd.optional(),
      to: ymd.optional(),
      productId: z.coerce.number().int().positive().optional(),
      days: z.coerce.number().int().min(1).max(730).optional(),
      format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
    }),
  }),
  (req, _res, next) => {
    const allowed = req.params.key === 'sales' ? ADMIN : ADMIN_WAREHOUSE;
    if (!req.user || !(allowed as string[]).includes(req.user.role)) return next(new AppError(403, 'PROHIBIDO', 'No tienes permisos para este reporte'));
    next();
  },
  ah(reportController.report),
);
