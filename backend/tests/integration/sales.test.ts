import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/knex';
import { saleService } from '../../src/services/saleService';
import { recalculateAlerts } from '../../src/services/alertService';
import { batchQty, fakeReq, Fixture, makeBatch, makeProduct, resetDb, seedBasics, stockOf } from '../helpers';

let f: Fixture;
const seller = () => fakeReq({ id: f.seller.id, role: 'SELLER' });
const admin = () => fakeReq({ id: f.admin.id, role: 'ADMIN' });
const sale = (items: Array<{ productId: number; quantity: number; discountPct?: number }>, extra: Record<string, unknown> = {}) =>
  saleService.create(seller(), { items: items.map((i) => ({ discountPct: 0, ...i })), discountPct: 0, paymentMethod: 'CARD', customerId: null, prescriptionChecked: false, ...extra } as any);

beforeEach(async () => {
  await resetDb();
  f = await seedBasics();
});
afterAll(async () => {
  await recalculateAlerts().catch(() => undefined);
  await db.destroy();
});

describe('Venta: registro, FEFO y stock por lote', () => {
  it('descuenta del lote que vence primero y calcula el IGV desglosado', async () => {
    const p = await makeProduct(f, { price: 11.8, cost: 5 });
    const late = await makeBatch(p, 'L-TARDE', 400, 20);
    const early = await makeBatch(p, 'L-PRONTO', 60, 20);

    const s = await sale([{ productId: p, quantity: 3 }]);

    expect(await batchQty(early)).toBe(17);
    expect(await batchQty(late)).toBe(20);
    expect(s.total).toBe(35.4);
    expect(s.subtotal).toBe(30);
    expect(s.igv).toBe(5.4);
    expect(s.number).toBe(1);
    expect(s.status).toBe('COMPLETED');
  });

  it('reparte la cantidad entre varios lotes cuando el primero no alcanza', async () => {
    const p = await makeProduct(f);
    const a = await makeBatch(p, 'A', 30, 4);
    const b = await makeBatch(p, 'B', 90, 10);

    const s = await sale([{ productId: p, quantity: 7 }]);

    expect(await batchQty(a)).toBe(0);
    expect(await batchQty(b)).toBe(7);
    const used = s.items[0].batches.map((x: any) => [x.batchNumber, x.quantity]);
    expect(used).toEqual(expect.arrayContaining([['A', 4], ['B', 3]]));
  });

  it('nunca vende de un lote vencido', async () => {
    const p = await makeProduct(f);
    const expired = await makeBatch(p, 'VENCIDO', -5, 50);
    await makeBatch(p, 'VIGENTE', 100, 2);

    await expect(sale([{ productId: p, quantity: 3 }])).rejects.toMatchObject({ code: 'STOCK_INSUFICIENTE' });
    await sale([{ productId: p, quantity: 2 }]);
    expect(await batchQty(expired)).toBe(50);
  });

  it('registra el kardex (SALE) por cada lote y deja la venta auditada', async () => {
    const p = await makeProduct(f);
    await makeBatch(p, 'A', 30, 2);
    await makeBatch(p, 'B', 90, 5);
    await sale([{ productId: p, quantity: 4 }]);

    const movs = await db('stock_movements').where({ productId: p, type: 'SALE' });
    expect(movs.map((m: any) => m.quantity).sort()).toEqual([-2, -2]);
    expect(movs[0].reference).toBe('NV-000001');
    expect(await db('audit_logs').where({ action: 'VENTA_REGISTRADA' })).toHaveLength(1);
  });

  it('usa el precio de la base de datos y consolida líneas repetidas del mismo producto', async () => {
    const p = await makeProduct(f, { price: 10 });
    await makeBatch(p, 'A', 90, 20);
    const s = await sale([{ productId: p, quantity: 1 }, { productId: p, quantity: 2 }]);
    expect(s.items).toHaveLength(1);
    expect(s.items[0].quantity).toBe(3);
    expect(s.total).toBe(30);
  });
});

describe('Venta: atomicidad (todo o nada)', () => {
  it('si un ítem no tiene stock, no se guarda nada ni se descuenta ningún lote', async () => {
    const ok = await makeProduct(f, { sku: 'OK' });
    const poor = await makeProduct(f, { sku: 'POOR' });
    const bOk = await makeBatch(ok, 'A', 90, 10);
    const bPoor = await makeBatch(poor, 'B', 90, 1);

    await expect(sale([{ productId: ok, quantity: 3 }, { productId: poor, quantity: 5 }])).rejects.toMatchObject({ code: 'STOCK_INSUFICIENTE' });

    expect(await batchQty(bOk)).toBe(10);
    expect(await batchQty(bPoor)).toBe(1);
    expect(await db('sales')).toHaveLength(0);
    expect(await db('sale_items')).toHaveLength(0);
    expect(await db('stock_movements').where({ type: 'SALE' })).toHaveLength(0);
  });

  it('el intento rechazado por falta de stock queda registrado para el indicador de quiebres', async () => {
    const p = await makeProduct(f);
    await makeBatch(p, 'A', 90, 1);
    await expect(sale([{ productId: p, quantity: 4 }])).rejects.toBeDefined();
    const ev = await db('stockout_events');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ productId: p, requestedQty: 4, availableQty: 1 });
  });

  it('un cliente inexistente revierte toda la transacción', async () => {
    const p = await makeProduct(f);
    const b = await makeBatch(p, 'A', 90, 5);
    await expect(sale([{ productId: p, quantity: 1 }], { customerId: 9999 })).rejects.toMatchObject({ code: 'CLIENTE_INVALIDO' });
    expect(await batchQty(b)).toBe(5);
  });
});

describe('Venta: concurrencia', () => {
  it('20 ventas simultáneas sobre 5 unidades: se aceptan exactamente 5 y el stock nunca es negativo', async () => {
    const p = await makeProduct(f);
    const b1 = await makeBatch(p, 'A', 30, 2);
    const b2 = await makeBatch(p, 'B', 90, 3);

    const results = await Promise.allSettled(Array.from({ length: 20 }, () => sale([{ productId: p, quantity: 1 }])));

    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(5);
    expect(rejected).toHaveLength(15);
    expect(rejected.every((r) => r.reason.code === 'STOCK_INSUFICIENTE')).toBe(true);
    expect(await batchQty(b1)).toBe(0);
    expect(await batchQty(b2)).toBe(0);
    expect(await stockOf(p)).toBe(0);
    expect(await db('sales')).toHaveLength(5);
  });

  it('ventas cruzadas de dos productos en orden inverso no se bloquean entre sí (sin interbloqueo)', async () => {
    const a = await makeProduct(f, { sku: 'A1' });
    const b = await makeProduct(f, { sku: 'B1' });
    await makeBatch(a, 'LA', 90, 30);
    await makeBatch(b, 'LB', 90, 30);

    const jobs = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0 ? sale([{ productId: a, quantity: 1 }, { productId: b, quantity: 1 }]) : sale([{ productId: b, quantity: 1 }, { productId: a, quantity: 1 }]),
    );
    const results = await Promise.allSettled(jobs);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await stockOf(a)).toBe(20);
    expect(await stockOf(b)).toBe(20);
  });

  it('la restricción CHECK de la BD impide stock negativo aunque falle la lógica de la aplicación', async () => {
    const p = await makeProduct(f);
    const b = await makeBatch(p, 'A', 90, 1);
    await expect(db('batches').where({ id: b }).update({ quantity: -1 })).rejects.toMatchObject({ code: '23514' });
  });
});

describe('Venta: reglas de negocio', () => {
  it('exige confirmar la receta para productos que la requieren', async () => {
    const p = await makeProduct(f, { rx: true });
    await makeBatch(p, 'A', 90, 5);
    await expect(sale([{ productId: p, quantity: 1 }])).rejects.toMatchObject({ code: 'RECETA_REQUERIDA' });
    const s = await sale([{ productId: p, quantity: 1 }], { prescriptionChecked: true });
    expect(s.prescriptionChecked).toBe(true);
  });

  it('no permite vender un producto inactivo', async () => {
    const p = await makeProduct(f, { active: false });
    await makeBatch(p, 'A', 90, 5);
    await expect(sale([{ productId: p, quantity: 1 }])).rejects.toMatchObject({ code: 'PRODUCTO_INACTIVO' });
  });

  it('calcula el vuelto en efectivo y rechaza efectivo insuficiente', async () => {
    const p = await makeProduct(f, { price: 11.8 });
    await makeBatch(p, 'A', 90, 20);
    const s = await sale([{ productId: p, quantity: 2 }], { paymentMethod: 'CASH', cashReceived: 50 });
    expect(s.total).toBe(23.6);
    expect(s.changeGiven).toBe(26.4);
    await expect(sale([{ productId: p, quantity: 2 }], { paymentMethod: 'CASH', cashReceived: 10 })).rejects.toMatchObject({ code: 'EFECTIVO_INSUFICIENTE' });
  });

  it('el vendedor solo puede dar descuentos hasta el tope; el administrador no tiene tope', async () => {
    const p = await makeProduct(f, { price: 10 });
    await makeBatch(p, 'A', 90, 50);
    await expect(sale([{ productId: p, quantity: 1, discountPct: 20 }])).rejects.toMatchObject({ code: 'DESCUENTO_NO_PERMITIDO' });
    await expect(sale([{ productId: p, quantity: 1 }], { discountPct: 6 })).rejects.toMatchObject({ code: 'DESCUENTO_NO_PERMITIDO' });
    const ok = await sale([{ productId: p, quantity: 1, discountPct: 5 }]);
    expect(ok.total).toBe(9.5);
    const big = await saleService.create(admin(), { items: [{ productId: p, quantity: 1, discountPct: 20 }], discountPct: 0, paymentMethod: 'CARD', customerId: null, prescriptionChecked: false } as any);
    expect(big.total).toBe(8);
  });

  it('mide el tiempo de atención desde el primer ítem hasta la confirmación', async () => {
    const p = await makeProduct(f);
    await makeBatch(p, 'A', 90, 5);
    const s = await sale([{ productId: p, quantity: 1 }], { startedAt: new Date(Date.now() - 75_000).toISOString() });
    expect(s.serviceSeconds).toBeGreaterThanOrEqual(75);
    expect(s.serviceSeconds).toBeLessThan(85);
  });
});

describe('Anulación de venta', () => {
  it('revierte el stock en los mismos lotes, deja kardex VOID y queda auditada', async () => {
    const p = await makeProduct(f);
    const a = await makeBatch(p, 'A', 30, 3);
    const b = await makeBatch(p, 'B', 90, 10);
    const s = await sale([{ productId: p, quantity: 5 }]);
    expect(await batchQty(a)).toBe(0);
    expect(await batchQty(b)).toBe(8);

    const voided = await saleService.void(admin(), s.id, 'Error de digitación');

    expect(voided!.status).toBe('VOIDED');
    expect(await batchQty(a)).toBe(3);
    expect(await batchQty(b)).toBe(10);
    expect(await db('stock_movements').where({ type: 'VOID' })).toHaveLength(2);
    expect(await db('audit_logs').where({ action: 'VENTA_ANULADA' })).toHaveLength(1);
  });

  it('no se puede anular dos veces (ni en paralelo): el stock se repone una sola vez', async () => {
    const p = await makeProduct(f);
    const b = await makeBatch(p, 'A', 90, 10);
    const s = await sale([{ productId: p, quantity: 4 }]);

    const r = await Promise.allSettled([saleService.void(admin(), s.id, 'Duplicada A'), saleService.void(admin(), s.id, 'Duplicada B')]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await batchQty(b)).toBe(10);
  });

  it('un vendedor solo puede ver sus propias ventas', async () => {
    const p = await makeProduct(f);
    await makeBatch(p, 'A', 90, 10);
    const s = await saleService.create(admin(), { items: [{ productId: p, quantity: 1, discountPct: 0 }], discountPct: 0, paymentMethod: 'YAPE', customerId: null, prescriptionChecked: false } as any);
    await expect(saleService.detail(s.id, { id: f.seller.id, role: 'SELLER', email: 'v', name: 'v' })).rejects.toMatchObject({ status: 403 });
    const list = await saleService.list({ limit: 20, offset: 0 } as any, { id: f.seller.id, role: 'SELLER', email: 'v', name: 'v' });
    expect(list.rows).toHaveLength(0);
  });
});
