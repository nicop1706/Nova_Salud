import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'RUTA_NO_ENCONTRADA', `Ruta no encontrada: ${req.method} ${req.path}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDACION',
        message: 'Datos inválidos',
        details: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
      },
    });
    return;
  }

  // Errores de PostgreSQL conocidos
  const pg = err as { code?: string; constraint?: string };
  if (pg?.code === '23505') {
    res.status(409).json({ error: { code: 'DUPLICADO', message: 'Ya existe un registro con esos datos', details: pg.constraint } });
    return;
  }
  if (pg?.code === '23503') {
    res.status(409).json({ error: { code: 'REFERENCIA', message: 'El registro está relacionado con otros datos' } });
    return;
  }
  if (pg?.code === '23514') {
    res.status(409).json({ error: { code: 'RESTRICCION', message: 'La operación viola una regla de integridad (p. ej. stock negativo)' } });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'JSON_INVALIDO', message: 'El cuerpo de la solicitud no es JSON válido' } });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'CUERPO_GRANDE', message: 'El cuerpo de la solicitud es demasiado grande' } });
    return;
  }

  logger.error({ err, method: req.method, url: req.originalUrl }, 'Error no controlado');
  res.status(500).json({ error: { code: 'ERROR_INTERNO', message: 'Ocurrió un error inesperado' } });
}
