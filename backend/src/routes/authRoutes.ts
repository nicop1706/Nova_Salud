import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate } from '../middlewares/auth';
import { loginLimiter } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import { changePasswordSchema, loginSchema } from '../schemas/auth';
import { ah } from '../utils/http';

export const authRoutes = Router();

authRoutes.post('/login', loginLimiter, validate({ body: loginSchema }), ah(authController.login));
authRoutes.post('/refresh', loginLimiter, ah(authController.refresh));
authRoutes.post('/logout', ah(async (req, res, next) => {
  // El logout debe funcionar aunque el access token ya haya expirado.
  return authController.logout(req, res);
}));
authRoutes.get('/me', authenticate, ah(authController.me));
authRoutes.post('/change-password', authenticate, validate({ body: changePasswordSchema }), ah(authController.changePassword));
