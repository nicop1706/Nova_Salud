import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env, isTest } from '../config/env';
import { AppError } from '../utils/errors';

const limitHandler = (message: string) => (_req: Request, _res: Response, next: NextFunction) =>
  next(new AppError(429, 'DEMASIADAS_SOLICITUDES', message));

/** Límite general de la API. */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isTest || req.path === '/health' || req.path === '/events',
  handler: limitHandler('Demasiadas solicitudes. Intenta nuevamente en unos instantes.'),
});

/** Límite estricto para login (fuerza bruta). Solo cuentan los intentos fallidos. */
export const loginLimiter = rateLimit({
  windowMs: 1 * 60_000,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => isTest,
  handler: limitHandler('Demasiados intentos de inicio de sesión. Espera 1 minuto.'),
});

/**
 * Defensa CSRF adicional a SameSite=Strict: las peticiones que modifican datos deben llevar
 * una cabecera personalizada. Un sitio externo no puede enviarla sin pasar por CORS (restringido).
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return next();
  if (req.headers.authorization?.startsWith('Bearer ')) return next(); // clientes de API sin cookies
  next(new AppError(403, 'CSRF', 'Solicitud no permitida (falta cabecera de seguridad)'));
}
