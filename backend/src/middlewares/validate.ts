import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { badRequest } from '../utils/errors';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/** Valida y sanea body/query/params con Zod. Los valores parseados reemplazan a los originales. */
export const validate =
  (schemas: Schemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        const fields = result.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }));
        return next(badRequest('Datos inválidos', fields, 'VALIDACION'));
      }
      (req as unknown as Record<string, unknown>)[part] = result.data;
    }
    next();
  };
