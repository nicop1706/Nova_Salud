import { z } from 'zod';
import { boolish, cleanText, optionalText, pagination } from './common';

export const categorySchema = z.object({
  name: cleanText(80),
  description: optionalText(200),
});

export const supplierSchema = z.object({
  name: cleanText(120),
  ruc: z
    .string()
    .trim()
    .regex(/^\d{11}$/, 'El RUC debe tener 11 dígitos')
    .nullish()
    .or(z.literal('').transform(() => null))
    .transform((v) => v ?? null),
  contact: optionalText(100),
  phone: optionalText(30),
  email: z
    .string()
    .trim()
    .email('Correo inválido')
    .max(120)
    .nullish()
    .or(z.literal('').transform(() => null))
    .transform((v) => v ?? null),
  address: optionalText(200),
  active: z.boolean().optional(),
});

const money = z.coerce.number().min(0, 'No puede ser negativo').max(99999.99, 'Valor demasiado alto');

export const productSchema = z.object({
  sku: cleanText(40).transform((s) => s.toUpperCase()),
  barcode: optionalText(40),
  name: cleanText(150),
  activeIngredient: optionalText(150),
  laboratory: optionalText(100),
  presentation: optionalText(100),
  categoryId: z.coerce.number().int().positive('Selecciona una categoría'),
  supplierId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  purchasePrice: money,
  salePrice: money,
  minStock: z.coerce.number().int().min(0).max(100000).default(0),
  requiresPrescription: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const productListQuery = z.object({
  ...pagination,
  q: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  stock: z.enum(['all', 'ok', 'low', 'out', 'expired']).default('all'),
  sort: z.enum(['name', 'sku', 'stock', 'price']).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
});

export const productSearchQuery = z.object({
  q: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(30).default(12),
  includeInactive: boolish.optional(),
});

export const importSchema = z.object({
  csv: z.string().min(1, 'El archivo CSV está vacío').max(2_500_000, 'El archivo es demasiado grande'),
  dryRun: z.boolean().default(false),
});
