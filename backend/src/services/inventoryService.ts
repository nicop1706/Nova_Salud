import type { Request } from 'express';
import { db } from '../db/knex';
import { batchRepository } from '../repositories/batchRepository';
import { movementRepository } from '../repositories/movementRepository';
import { productRepository } from '../repositories/productRepository';
import { addDaysYmd, diffDays, limaEndOfDay, limaStartOfDay, todayLima } from '../utils/dates';
import { AppError, badRequest, conflict, notFound } from '../utils/errors';
import { auditReq } from './auditService';
import { settingsService } from './settingsService';
import { stockChanged } from './stockEvents';

const WASTE_LABEL: Record<string, string> = {
  VENCIMIENTO: 'Vencimiento',
  DETERIORO: 'Deterioro',
  ROTURA: 'Rotura',
  OTRO: 'Otro',
};

export const inventoryService = {
  /** Ingreso por compra: crea el lote (o suma a uno existente con la misma fecha de vencimiento). */
  async receive(
    req: Request,
    input: { productId: number; batchNumber: string; expiresAt: string; quantity: number; unitCost?: number; note: string | null },
  ) {
    const today = todayLima();
    if (input.expiresAt < today) throw badRequest('No se puede ingresar un lote ya vencido', undefined, 'LOTE_VENCIDO');
    if (input.expiresAt > addDaysYmd(today, 365 * 15)) throw badRequest('La fecha de vencimiento es demasiado lejana', undefined, 'FECHA_INVALIDA');

    const userId = req.user!.id;
    const result = await db.transaction(async (trx) => {
      const product = await productRepository.findById(input.productId, trx);
      if (!product) throw notFound('Producto no encontrado');

      let batch = await batchRepository.findByProductAndNumber(input.productId, input.batchNumber, trx);
      if (batch) {
        if (batch.expiresAt !== input.expiresAt) {
          throw conflict(`El lote ${input.batchNumber} ya existe con vencimiento ${batch.expiresAt}`, undefined, 'LOTE_FECHA_DIFERENTE');
        }
        await batchRepository.changeQuantity(batch.id, input.quantity, trx);
        await batchRepository.addInitialQty(batch.id, input.quantity, trx);
      } else {
        batch = await batchRepository.insert(
          { productId: input.productId, batchNumber: input.batchNumber, expiresAt: input.expiresAt, quantity: input.quantity },
          trx,
        );
      }

      await movementRepository.insert(
        {
          productId: input.productId,
          batchId: batch.id,
          type: 'PURCHASE',
          quantity: input.quantity,
          unitCost: input.unitCost ?? product.purchasePrice,
          reason: 'Ingreso por compra',
          reference: input.note,
          userId,
        },
        trx,
      );

      if (input.unitCost != null && input.unitCost !== product.purchasePrice) {
        await productRepository.update(input.productId, { purchasePrice: input.unitCost }, trx);
      }
      return { batchId: batch.id, productId: input.productId };
    });

    await auditReq(req, 'INGRESO_COMPRA', 'batches', result.batchId, input);
    stockChanged([input.productId]);
    return result;
  },

  /** Ajuste manual (+/-). El motivo es obligatorio y queda en kardex y auditoría. */
  async adjust(req: Request, input: { batchId: number; delta: number; reason: string }) {
    const productId = await db.transaction(async (trx) => {
      const batch = await batchRepository.lockById(input.batchId, trx);
      if (!batch) throw notFound('Lote no encontrado');
      if (batch.quantity + input.delta < 0) {
        throw conflict(`El ajuste dejaría el lote en negativo (stock actual: ${batch.quantity})`, { available: batch.quantity }, 'STOCK_NEGATIVO');
      }
      if (!(await batchRepository.changeQuantity(batch.id, input.delta, trx))) throw conflict('No se pudo aplicar el ajuste', undefined, 'STOCK_NEGATIVO');
      await movementRepository.insert(
        { productId: batch.productId, batchId: batch.id, type: 'ADJUSTMENT', quantity: input.delta, reason: input.reason, userId: req.user!.id },
        trx,
      );
      return batch.productId;
    });
    await auditReq(req, 'AJUSTE_INVENTARIO', 'batches', input.batchId, input);
    stockChanged([productId]);
    return { ok: true };
  },

  /** Merma: baja de unidades por vencimiento, deterioro o rotura. */
  async waste(req: Request, input: { batchId: number; quantity: number; reason: string; note: string | null }) {
    const productId = await db.transaction(async (trx) => {
      const batch = await batchRepository.lockById(input.batchId, trx);
      if (!batch) throw notFound('Lote no encontrado');
      if (batch.quantity < input.quantity) throw conflict(`Solo hay ${batch.quantity} unidades en el lote`, { available: batch.quantity }, 'STOCK_INSUFICIENTE');
      await batchRepository.changeQuantity(batch.id, -input.quantity, trx);
      const product = await productRepository.findById(batch.productId, trx);
      await movementRepository.insert(
        {
          productId: batch.productId,
          batchId: batch.id,
          type: 'WASTE',
          quantity: -input.quantity,
          unitCost: product?.purchasePrice ?? null,
          reason: `${WASTE_LABEL[input.reason] ?? input.reason}${input.note ? `: ${input.note}` : ''}`,
          userId: req.user!.id,
        },
        trx,
      );
      return batch.productId;
    });
    await auditReq(req, 'MERMA', 'batches', input.batchId, input);
    stockChanged([productId]);
    return { ok: true };
  },

  /** Da de baja todos los lotes vencidos con stock (merma por vencimiento). */
  async wasteExpired(req: Request) {
    const today = todayLima();
    const touched: number[] = [];
    let units = 0;
    let batches = 0;
    await db.transaction(async (trx) => {
      const expired = await trx('batches').where('expiresAt', '<', today).andWhere('quantity', '>', 0).orderBy('id').forUpdate();
      for (const b of expired) {
        const product = await productRepository.findById(b.productId, trx);
        await trx('batches').where({ id: b.id }).update({ quantity: 0, updatedAt: new Date() });
        await movementRepository.insert(
          {
            productId: b.productId,
            batchId: b.id,
            type: 'WASTE',
            quantity: -b.quantity,
            unitCost: product?.purchasePrice ?? null,
            reason: `Vencimiento: lote ${b.batchNumber} venció el ${b.expiresAt}`,
            userId: req.user!.id,
          },
          trx,
        );
        touched.push(b.productId);
        units += b.quantity;
        batches += 1;
      }
    });
    await auditReq(req, 'MERMA_VENCIDOS', 'batches', null, { batches, units });
    if (touched.length) stockChanged(touched);
    return { batches, units };
  },

  /** Devolución: IN = de un cliente (reingresa), OUT = a un proveedor (sale). */
  async registerReturn(req: Request, input: { batchId: number; quantity: number; direction: 'IN' | 'OUT'; reason: string }) {
    const productId = await db.transaction(async (trx) => {
      const batch = await batchRepository.lockById(input.batchId, trx);
      if (!batch) throw notFound('Lote no encontrado');
      const delta = input.direction === 'IN' ? input.quantity : -input.quantity;
      if (delta < 0 && batch.quantity < input.quantity) throw conflict(`Solo hay ${batch.quantity} unidades en el lote`, { available: batch.quantity }, 'STOCK_INSUFICIENTE');
      await batchRepository.changeQuantity(batch.id, delta, trx);
      await movementRepository.insert(
        {
          productId: batch.productId,
          batchId: batch.id,
          type: 'RETURN',
          quantity: delta,
          reason: `${input.direction === 'IN' ? 'Devolución de cliente' : 'Devolución a proveedor'}: ${input.reason}`,
          userId: req.user!.id,
        },
        trx,
      );
      return batch.productId;
    });
    await auditReq(req, 'DEVOLUCION', 'batches', input.batchId, input);
    stockChanged([productId]);
    return { ok: true };
  },

  async listBatches(q: { productId?: number; status: 'all' | 'with_stock' | 'expired' | 'expiring'; days?: number; limit: number; offset: number }) {
    const today = todayLima();
    const thresholds = await settingsService.getExpiryDays();
    const days = q.days ?? thresholds[thresholds.length - 1];
    const { rows, total } = await batchRepository.list({ ...q, days, today, horizon: addDaysYmd(today, days) });
    return {
      rows: (rows as any[]).map((b) => ({ ...b, daysToExpiry: diffDays(today, b.expiresAt), expired: b.expiresAt < today })),
      total,
    };
  },

  kardex(q: { productId?: number; type?: string; from?: string; to?: string; limit: number; offset: number }) {
    return movementRepository.kardex({
      productId: q.productId,
      type: q.type,
      from: q.from ? limaStartOfDay(q.from) : undefined,
      to: q.to ? limaEndOfDay(q.to) : undefined,
      limit: q.limit,
      offset: q.offset,
    });
  },
};

export { AppError };
