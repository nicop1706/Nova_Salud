import { Router } from 'express';
import { z } from 'zod';
import { userController } from '../controllers/userController';
import { ADMIN, authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createUserSchema, resetPasswordSchema, updateUserSchema } from '../schemas/auth';
import { dateRange, idParam, pagination } from '../schemas/common';
import { ah } from '../utils/http';

export const userRoutes = Router();
userRoutes.use(authenticate, authorize(...ADMIN));

userRoutes.get('/', ah(userController.list));
userRoutes.post('/', validate({ body: createUserSchema }), ah(userController.create));
userRoutes.put('/:id', validate({ params: idParam, body: updateUserSchema }), ah(userController.update));
userRoutes.post('/:id/reset-password', validate({ params: idParam, body: resetPasswordSchema }), ah(userController.resetPassword));

export const auditRoutes = Router();
auditRoutes.use(authenticate, authorize(...ADMIN));
auditRoutes.get(
  '/',
  validate({
    query: z.object({
      ...pagination,
      ...dateRange,
      userId: z.coerce.number().int().positive().optional(),
      entity: z.string().max(50).optional(),
      action: z.string().max(60).optional(),
    }),
  }),
  ah(userController.audit),
);
