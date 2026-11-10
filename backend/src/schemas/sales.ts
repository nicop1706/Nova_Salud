import { z } from 'zod';
import { cleanText, pagination, ymd } from './common';

export const PAYMENT_METHODS = ['CASH', 'CARD', 'YAPE', 'PLIN'] as const;

export const createSaleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int('Cantidad entera').min(1).max(1000),
        discountPct: z.coerce.number().min(0).max(100).default(0),
      }),
    )
    .min(1, 'Agrega al menos un producto')
    .max(100, 'Demasiados ítems en una venta'),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  paymentMethod: z.enum(PAYMENT_METHODS),
  cashReceived: z.coerce.number().min(0).max(1_000_000).optional(),
  customerId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  startedAt: z.string().datetime().optional(),
  prescriptionChecked: z.boolean().default(false),
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const saleListQuery = z.object({
  ...pagination,
  from: ymd.optional(),
  to: ymd.optional(),
  status: z.enum(['COMPLETED', 'VOIDED']).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  sellerId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(60).optional(),
});

export const voidSaleSchema = z.object({
  reason: cleanText(200).pipe(z.string().min(5, 'Indica el motivo de la anulación (mínimo 5 caracteres)')),
});

export const stockoutSchema = z.object({
  productId: z.coerce.number().int().positive(),
  requestedQty: z.coerce.number().int().min(1).max(1000),
});
