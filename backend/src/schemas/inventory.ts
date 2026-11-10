import { z } from 'zod';
import { cleanText, optionalText, pagination, ymd } from './common';

const qty = z.coerce.number().int('Debe ser un número entero').positive('Debe ser mayor que cero').max(1_000_000);

export const receiveSchema = z.object({
  productId: z.coerce.number().int().positive(),
  batchNumber: cleanText(40).transform((s) => s.toUpperCase()),
  expiresAt: ymd,
  quantity: qty,
  unitCost: z.coerce.number().min(0).max(99999.99).optional(),
  note: optionalText(200),
});

export const adjustSchema = z.object({
  batchId: z.coerce.number().int().positive(),
  delta: z.coerce
    .number()
    .int('Debe ser un número entero')
    .refine((n) => n !== 0, 'El ajuste no puede ser cero')
    .refine((n) => Math.abs(n) <= 1_000_000, 'Valor demasiado alto'),
  reason: cleanText(200).pipe(z.string().min(5, 'El motivo es obligatorio (mínimo 5 caracteres)')),
});

export const WASTE_REASONS = ['VENCIMIENTO', 'DETERIORO', 'ROTURA', 'OTRO'] as const;
export const wasteSchema = z.object({
  batchId: z.coerce.number().int().positive(),
  quantity: qty,
  reason: z.enum(WASTE_REASONS),
  note: optionalText(200),
});

export const returnSchema = z.object({
  batchId: z.coerce.number().int().positive(),
  quantity: qty,
  direction: z.enum(['IN', 'OUT']), // IN: devolución de cliente · OUT: devolución a proveedor
  reason: cleanText(200).pipe(z.string().min(3, 'Indica el motivo')),
});

export const kardexQuery = z.object({
  ...pagination,
  productId: z.coerce.number().int().positive().optional(),
  type: z.enum(['PURCHASE', 'SALE', 'ADJUSTMENT', 'WASTE', 'RETURN', 'VOID']).optional(),
  from: ymd.optional(),
  to: ymd.optional(),
});

export const batchesQuery = z.object({
  ...pagination,
  productId: z.coerce.number().int().positive().optional(),
  status: z.enum(['all', 'with_stock', 'expired', 'expiring']).default('with_stock'),
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export const stockCountCreate = z.object({ notes: optionalText(200) });

export const stockCountItems = z.object({
  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive(),
        countedQty: z.coerce.number().int().min(0).max(1_000_000).nullable(),
      }),
    )
    .min(1)
    .max(2000),
});

export const alertsQuery = z.object({
  ...pagination,
  status: z.enum(['OPEN', 'RESOLVED', 'all']).default('OPEN'),
  type: z.enum(['OUT_OF_STOCK', 'LOW_STOCK', 'EXPIRED', 'EXPIRING']).optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM']).optional(),
});

export const alertSettingsSchema = z.object({
  expiryDays: z
    .array(z.coerce.number().int().min(1).max(365))
    .min(1, 'Indica al menos un umbral')
    .max(5, 'Máximo 5 umbrales'),
});

export const replenishmentQuery = z.object({
  coverageDays: z.coerce.number().int().min(1).max(180).default(30),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
});
