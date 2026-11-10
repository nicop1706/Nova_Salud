import { Router } from 'express';
import { alertController } from '../controllers/alertController';
import { ADMIN, ADMIN_WAREHOUSE, ALL_ROLES, authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { alertSettingsSchema, alertsQuery, replenishmentQuery } from '../schemas/inventory';
import { ah } from '../utils/http';

export const alertRoutes = Router();
alertRoutes.use(authenticate);

// Contador de la barra superior: todos los roles
alertRoutes.get('/summary', authorize(...ALL_ROLES), ah(alertController.summary));
alertRoutes.get('/', authorize(...ALL_ROLES), validate({ query: alertsQuery }), ah(alertController.list));
alertRoutes.post('/recalculate', authorize(...ADMIN_WAREHOUSE), ah(alertController.recalculate));
alertRoutes.get('/replenishment', authorize(...ADMIN_WAREHOUSE), validate({ query: replenishmentQuery }), ah(alertController.replenishment));
alertRoutes.get('/settings', authorize(...ALL_ROLES), ah(alertController.getSettings));
alertRoutes.put('/settings', authorize(...ADMIN), validate({ body: alertSettingsSchema }), ah(alertController.putSettings));
