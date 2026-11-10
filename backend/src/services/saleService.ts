import type { Request } from 'express';
import { db } from '../db/knex';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { eventHub } from '../realtime/eventHub';
import { batchRepository } from '../repositories/batchRepository';
import { movementRepository } from '../repositories/movementRepository';
import { saleRepository, SaleListFilters } from '../repositories/saleRepository';
import { CreateSaleInput } from '../schemas/sales';
import { todayLima } from '../utils/dates';
import { AppError, badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { planFefo } from '../utils/fefo';
import { computeSaleTotals } from '../utils/money';
import type { AuthUser } from '../types/express';
import { auditReq } from './auditService';
import { stockChanged } from './stockEvents';

interface Shortage {
  productId: number;
  name: string;
  requested: number;
  available: number;
}

/** Tiempo de atención: desde el primer ítem agregado hasta la confirmación. Se acota a [0, 6 h]. */
export function computeServiceSeconds(startedAt: string | undefined, completedAt: Date): { startedAt: Date | null; seconds: number | null } {
  if (!startedAt) return { startedAt: null, seconds: null };
  const start = new Date(startedAt);
  const ms = completedAt.getTime() - start.getTime();
  if (Number.isNaN(ms) || ms < 0 || ms > 6 * 3_600_000) return { startedAt: null, seconds: null };
  return { startedAt: start, seconds: Math.round(ms / 1000) };
}

async function recordStockouts(shortages: Shortage[], userId: number, source: string): Promise<void> {
  try {
    await db('stockout_events').insert(
      shortages.map((s) => ({ productId: s.productId, requestedQty: s.requested, availableQty: s.available, source, userId })),
    );
  } catch (err) {
    logger.error({ err }, 'No se pudo registrar el quiebre de stock');
  }
}

export const saleService = {
  /**
   * Registra una venta de forma ATÓMICA:
   *  - bloquea los lotes de cada producto (FOR UPDATE) en orden de producto → sin interbloqueos,
   *  - reparte la cantidad por FEFO entre lotes no vencidos,
   *  - guarda venta, ítems, lotes usados y kardex; si algo falla, no se guarda nada.
   * El precio y el costo se leen de la BD: nunca se confía en los importes del cliente.
   */
  async create(req: Request, input: CreateSaleInput) {
    const user: AuthUser = req.user!;

    // 1) Consolidar líneas repetidas del mismo producto
    const merged = new Map<number, { productId: number; quantity: number; discountPct: number }>();
    for (const it of input.items) {
      const prev = merged.get(it.productId);
      if (prev) {
        if (prev.discountPct !== it.discountPct) throw badRequest('El mismo producto aparece con descuentos distintos', undefined, 'LINEAS_DUPLICADAS');
        prev.quantity += it.quantity;
      } else merged.set(it.productId, { ...it });
    }
    const lines = [...merged.values()];
    if (lines.some((l) => l.quantity > 1000)) throw badRequest('Cantidad demasiado alta para un producto', undefined, 'CANTIDAD_INVALIDA');

    // 2) Permiso de descuento: administrador sin tope; vendedor hasta MAX_SELLER_DISCOUNT_PCT
    const maxPct = user.role === 'ADMIN' ? 100 : env.MAX_SELLER_DISCOUNT_PCT;
    const maxRequested = Math.max(input.discountPct, ...lines.map((l) => l.discountPct));
    if (maxRequested > maxPct) {
      throw forbidden(`Tu rol permite descuentos de hasta ${maxPct}%. Solicita autorización a un administrador.`, 'DESCUENTO_NO_PERMITIDO');
    }

    const today = todayLima();
    const completedAt = new Date();
    const { startedAt, seconds } = computeServiceSeconds(input.startedAt, completedAt);

    let saleId: number;
    try {
      saleId = await db.transaction(async (trx) => {
        const productIds = lines.map((l) => l.productId).sort((a, b) => a - b);
        const products = await trx('products').whereIn('id', productIds);
        const byId = new Map(products.map((p: any) => [p.id as number, p]));

        for (const l of lines) {
          const p = byId.get(l.productId);
          if (!p) throw notFound(`El producto #${l.productId} no existe`, 'PRODUCTO_NO_ENCONTRADO');
          if (!p.active) throw conflict(`"${p.name}" está inactivo y no se puede vender`, undefined, 'PRODUCTO_INACTIVO');
        }

        const needsRx = products.filter((p: any) => p.requiresPrescription);
        if (needsRx.length && !input.prescriptionChecked) {
          throw conflict(
            'Hay productos que requieren receta médica. Confirma que verificaste la receta.',
            { products: needsRx.map((p: any) => ({ id: p.id, name: p.name })) },
            'RECETA_REQUERIDA',
          );
        }

        if (input.customerId) {
          const c = await trx('customers').where({ id: input.customerId, active: true }).first('id');
          if (!c) throw badRequest('El cliente no existe o está inactivo', undefined, 'CLIENTE_INVALIDO');
        }

        // 3) Bloquear lotes y planificar FEFO (orden ascendente de producto → sin deadlocks)
        const plans = new Map<number, ReturnType<typeof planFefo>>();
        const shortages: Shortage[] = [];
        for (const pid of productIds) {
          const line = merged.get(pid)!;
          const batches = await batchRepository.lockSellable(pid, today, trx);
          const plan = planFefo(batches.map((b) => ({ id: b.id, quantity: b.quantity, expiresAt: b.expiresAt })), line.quantity, today);
          plans.set(pid, plan);
          if (plan.shortage > 0) {
            shortages.push({ productId: pid, name: byId.get(pid).name, requested: line.quantity, available: line.quantity - plan.shortage });
          }
        }
        if (shortages.length) {
          throw new AppError(
            409,
            'STOCK_INSUFICIENTE',
            `Stock insuficiente: ${shortages.map((s) => `${s.name} (disponible ${s.available}, pedido ${s.requested})`).join('; ')}`,
            { items: shortages },
          );
        }

        // 4) Totales (precio de BD, IGV incluido en el precio)
        const totals = computeSaleTotals(
          lines.map((l) => ({ unitPrice: byId.get(l.productId).salePrice, quantity: l.quantity, discountPct: l.discountPct })),
          input.discountPct,
          env.IGV_RATE,
        );

        let cashReceived: number | null = null;
        let change: number | null = null;
        if (input.paymentMethod === 'CASH') {
          cashReceived = input.cashReceived ?? totals.total;
          if (cashReceived + 1e-9 < totals.total) {
            throw badRequest(`El efectivo recibido (S/ ${cashReceived.toFixed(2)}) es menor al total (S/ ${totals.total.toFixed(2)})`, undefined, 'EFECTIVO_INSUFICIENTE');
          }
          change = Math.round((cashReceived - totals.total) * 100) / 100;
        }

        const [sale] = await trx('sales')
          .insert({
            customerId: input.customerId,
            sellerId: user.id,
            paymentMethod: input.paymentMethod,
            subtotal: totals.subtotal,
            igv: totals.igv,
            discount: totals.discount,
            total: totals.total,
            cashReceived,
            changeGiven: change,
            prescriptionChecked: input.prescriptionChecked,
            startedAt,
            completedAt,
            serviceSeconds: seconds,
          })
          .returning(['id', 'number']);

        // 5) Ítems, descuento por lote y kardex
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          const p = byId.get(l.productId);
          const [item] = await trx('sale_items')
            .insert({
              saleId: sale.id,
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: p.salePrice,
              unitCost: p.purchasePrice,
              discount: totals.items[i].discount,
              lineTotal: totals.items[i].lineTotal,
            })
            .returning('id');
          for (const a of plans.get(l.productId)!.allocations) {
            if (!(await batchRepository.changeQuantity(a.batchId, -a.quantity, trx))) {
              throw conflict('El stock cambió durante la venta, intenta nuevamente', undefined, 'STOCK_CAMBIO');
            }
            await trx('sale_item_batches').insert({ saleItemId: item.id, batchId: a.batchId, quantity: a.quantity });
            await movementRepository.insert(
              {
                productId: l.productId,
                batchId: a.batchId,
                type: 'SALE',
                quantity: -a.quantity,
                unitCost: p.purchasePrice,
                reason: 'Venta',
                reference: `NV-${String(sale.number).padStart(6, '0')}`,
                userId: user.id,
              },
              trx,
            );
          }
        }
        return sale.id as number;
      });
    } catch (e) {
      if (e instanceof AppError && e.code === 'STOCK_INSUFICIENTE') {
        await recordStockouts((e.details as { items: Shortage[] }).items, user.id, 'SALE_REJECTED');
      }
      throw e;
    }

    const detail = await saleRepository.findDetail(saleId);
    await auditReq(req, 'VENTA_REGISTRADA', 'sales', saleId, {
      numero: detail!.number,
      total: detail!.total,
      pago: input.paymentMethod,
      descuento: detail!.discount,
    });
    stockChanged(lines.map((l) => l.productId));
    eventHub.broadcast('sale', { id: saleId, total: detail!.total }, ['ADMIN']);
    return detail!;
  },

  /** Anula una venta (solo administrador): devuelve el stock a los mismos lotes y deja rastro en kardex y auditoría. */
  async void(req: Request, id: number, reason: string) {
    const productIds = await db.transaction(async (trx) => {
      const sale = (await trx.raw('SELECT id, number, status FROM sales WHERE id = ? FOR UPDATE', [id])).rows[0];
      if (!sale) throw notFound('Venta no encontrada');
      if (sale.status === 'VOIDED') throw conflict('La venta ya fue anulada', undefined, 'VENTA_ANULADA');

      const used = await trx('sale_item_batches as sib')
        .join('sale_items as si', 'si.id', 'sib.saleItemId')
        .where('si.saleId', id)
        .select('sib.batchId', 'sib.quantity', 'si.productId');
      await batchRepository.lockMany([...new Set(used.map((u: any) => u.batchId as number))], trx);

      for (const u of used as Array<{ batchId: number; quantity: number; productId: number }>) {
        await batchRepository.changeQuantity(u.batchId, u.quantity, trx);
        await movementRepository.insert(
          {
            productId: u.productId,
            batchId: u.batchId,
            type: 'VOID',
            quantity: u.quantity,
            reason: `Anulación de venta: ${reason}`,
            reference: `NV-${String(sale.number).padStart(6, '0')}`,
            userId: req.user!.id,
          },
          trx,
        );
      }
      await trx('sales').where({ id }).update({ status: 'VOIDED', voidedAt: new Date(), voidedById: req.user!.id, voidReason: reason });
      return [...new Set(used.map((u: any) => u.productId as number))];
    });

    await auditReq(req, 'VENTA_ANULADA', 'sales', id, { motivo: reason });
    stockChanged(productIds);
    eventHub.broadcast('sale', { id, voided: true }, ['ADMIN']);
    return saleRepository.findDetail(id);
  },

  async list(filters: SaleListFilters, user: AuthUser) {
    // El vendedor solo ve sus propias ventas
    const f = user.role === 'SELLER' ? { ...filters, sellerId: user.id } : filters;
    return saleRepository.list(f);
  },

  async detail(id: number, user: AuthUser) {
    const sale = await saleRepository.findDetail(id);
    if (!sale) throw notFound('Venta no encontrada');
    if (user.role === 'SELLER' && sale.sellerId !== user.id) throw forbidden('Solo puedes ver tus propias ventas');
    return sale;
  },

  /** El POS informa un intento de venta bloqueado por falta de stock (alimenta el indicador de quiebres). */
  async stockoutAttempt(req: Request, productId: number, requestedQty: number) {
    const p = await db('products').where({ id: productId }).first('id', 'name');
    if (!p) throw notFound('Producto no encontrado');
    const [{ available }] = (
      await db.raw(
        `SELECT COALESCE(SUM(quantity), 0)::int AS available FROM batches WHERE product_id = ? AND expires_at >= ?`,
        [productId, todayLima()],
      )
    ).rows;
    await recordStockouts([{ productId, name: p.name, requested: requestedQty, available }], req.user!.id, 'POS_ATTEMPT');
  },
};
