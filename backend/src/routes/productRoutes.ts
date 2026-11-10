import { Router } from 'express';
import { z } from 'zod';
import { productController } from '../controllers/productController';
import { ADMIN_WAREHOUSE, ALL_ROLES, authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { importSchema, productListQuery, productSchema, productSearchQuery } from '../schemas/catalog';
import { idParam } from '../schemas/common';
import { ah } from '../utils/http';

export const productRoutes = Router();
productRoutes.use(authenticate);

// Consulta de stock: todos los roles (el vendedor no recibe el precio de compra)
productRoutes.get('/', authorize(...ALL_ROLES), validate({ query: productListQuery }), ah(productController.list));
productRoutes.get('/search', authorize(...ALL_ROLES), validate({ query: productSearchQuery }), ah(productController.search));
productRoutes.get('/by-code/:code', authorize(...ALL_ROLES), validate({ params: z.object({ code: z.string().trim().min(1).max(60) }) }), ah(productController.byCode));
productRoutes.get('/:id', authorize(...ALL_ROLES), validate({ params: idParam }), ah(productController.detail));

// Mantenimiento: administrador y almacenero
productRoutes.post('/import', authorize(...ADMIN_WAREHOUSE), validate({ body: importSchema }), ah(productController.importCsv));
productRoutes.post('/', authorize(...ADMIN_WAREHOUSE), validate({ body: productSchema }), ah(productController.create));
productRoutes.put('/:id', authorize(...ADMIN_WAREHOUSE), validate({ params: idParam, body: productSchema }), ah(productController.update));
productRoutes.delete('/:id', authorize(...ADMIN_WAREHOUSE), validate({ params: idParam }), ah(productController.deactivate));
