import { Router } from 'express';
import { customerController } from '../controllers/customerController';
import { ADMIN_SELLER, authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { idParam } from '../schemas/common';
import { customerListQuery, customerSchema, customerSearchQuery } from '../schemas/customers';
import { ah } from '../utils/http';

export const customerRoutes = Router();
customerRoutes.use(authenticate, authorize(...ADMIN_SELLER));

customerRoutes.get('/', validate({ query: customerListQuery }), ah(customerController.list));
customerRoutes.get('/search', validate({ query: customerSearchQuery }), ah(customerController.search));
customerRoutes.post('/', validate({ body: customerSchema }), ah(customerController.create));
customerRoutes.get('/:id', validate({ params: idParam }), ah(customerController.detail));
customerRoutes.get('/:id/frequent', validate({ params: idParam }), ah(customerController.frequent));
customerRoutes.put('/:id', validate({ params: idParam, body: customerSchema }), ah(customerController.update));
customerRoutes.delete('/:id', validate({ params: idParam }), ah(customerController.deactivate));
