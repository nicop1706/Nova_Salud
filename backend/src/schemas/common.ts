import { z } from 'zod';
import { isValidYmd } from '../utils/dates';

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const pagination = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
};

/** Texto saneado: recorta espacios y elimina caracteres de control / etiquetas HTML evidentes. */
export const cleanText = (max = 200) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/[<>]/g, '').trim())
    .pipe(z.string().min(1, 'Campo obligatorio').max(max, `Máximo ${max} caracteres`));

export const optionalText = (max = 200) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/[<>]/g, '').trim())
    .pipe(z.string().max(max, `Máximo ${max} caracteres`))
    .transform((s) => (s === '' ? null : s))
    .nullish()
    .transform((v) => v ?? null);

export const ymd = z.string().refine(isValidYmd, 'Fecha inválida (use AAAA-MM-DD)');

export const dateRange = {
  from: ymd.optional(),
  to: ymd.optional(),
};

export const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const password = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(72, 'Máximo 72 caracteres')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Debe incluir letras y números');
