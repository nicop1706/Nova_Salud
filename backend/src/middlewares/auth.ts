import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../utils/errors';
import { verifyAccessToken } from '../utils/jwt';
import type { Role } from '../types/express';

export const ACCESS_COOKIE = 'ns_access';
export const REFRESH_COOKIE = 'ns_refresh';

/** Autentica con la cookie httpOnly del access token (o cabecera Bearer para clientes de API). */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  let token: string | undefined = req.cookies?.[ACCESS_COOKIE];
  const header = req.headers.authorization;
  if (!token && header?.startsWith('Bearer ')) token = header.slice(7);
  if (!token) return next(unauthorized());
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (e) {
    const expired = (e as Error).name === 'TokenExpiredError';
    next(unauthorized(expired ? 'La sesión expiró' : 'Sesión inválida', expired ? 'TOKEN_EXPIRADO' : 'TOKEN_INVALIDO'));
  }
}

/** RBAC: permite el acceso solo a los roles indicados. */
export const authorize =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

export const ADMIN: Role[] = ['ADMIN'];
export const ADMIN_WAREHOUSE: Role[] = ['ADMIN', 'WAREHOUSE'];
export const ADMIN_SELLER: Role[] = ['ADMIN', 'SELLER'];
export const ALL_ROLES: Role[] = ['ADMIN', 'SELLER', 'WAREHOUSE'];
