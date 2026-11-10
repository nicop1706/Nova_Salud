import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Encapsula handlers async para que los errores lleguen al errorHandler. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function pageParams(query: { page?: number; limit?: number }, defaultLimit = 25): { page: number; limit: number; offset: number } {
  const limit = Math.min(Math.max(query.limit ?? defaultLimit, 1), 200);
  const page = Math.max(query.page ?? 1, 1);
  return { page, limit, offset: (page - 1) * limit };
}

export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);
