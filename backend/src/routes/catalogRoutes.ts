import { Router } from 'express';
import { categoryController, supplierController } from '../controllers/catalogController';
import { ADMIN_WAREHOUSE, ALL_ROLES, authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { categorySchema, supplierSchema } from '../schemas/catalog';
import { idParam } from '../schemas/common';
import { ah } from '../utils/http';

export const categoryRoutes = Router();
categoryRoutes.use(authenticate);
categoryRoutes.get('/', authorize(...ALL_ROLES), ah(categoryController.list));
categoryRoutes.post('/', authorize(...ADMIN_WAREHOUSE), validate({ body: categorySchema }), ah(categoryController.create));
categoryRoutes.put('/:id', authorize(...ADMIN_WAREHOUSE), validate({ params: idParam, body: categorySchema }), ah(categoryController.update));
categoryRoutes.delete('/:id', authorize(...ADMIN_WAREHOUSE), validate({ params: idParam }), ah(categoryController.remove));

export const supplierRoutes = Router();
supplierRoutes.use(authenticate, authorize(...ADMIN_WAREHOUSE));
supplierRoutes.get('/', ah(supplierController.list));
supplierRoutes.post('/', validate({ body: supplierSchema }), ah(supplierController.create));
supplierRoutes.put('/:id', validate({ params: idParam, body: supplierSchema }), ah(supplierController.update));
supplierRoutes.delete('/:id', validate({ params: idParam }), ah(supplierController.remove));
