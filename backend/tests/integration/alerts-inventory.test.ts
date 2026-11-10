import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/knex';
import { alertSummary, recalculateAlerts } from '../../src/services/alertService';
import { inventoryService } from '../../src/services/inventoryService';
import { replenishmentService } from '../../src/services/replenishmentService';
import { saleService } from '../../src/services/saleService';
import { stockCountService } from '../../src/services/stockCountService';
import { addDaysYmd, todayLima } from '../../src/utils/dates';
import { batchQty, fakeReq, Fixture, makeBatch, makeProduct, resetDb, seedBasics, stockOf } from '../helpers';

let f: Fixture;
const wh = () => fakeReq({ id: f.warehouse.id, role: 'WAREHOUSE' });
const seller = () => fakeReq({ id: f.seller.id, role: 'SELLER' });
const openAlerts = async () => (await db('alerts').where({ status: 'OPEN' })) as Array<{ type: string; priority: string; productId: number; message: string }>;

beforeEach(async () => {
  await resetDb();
  f = await seedBasics();
});
afterAll(async () => {
  await recalculateAlerts().catch(() => undefined);
  await db.destroy();
});

describe('Alertas automáticas', () => {
  it('genera alertas de agotado, stock bajo, por vencer y vencido con su prioridad', async () => {
    const out = await makeProduct(f, { sku: 'OUT', min: 5 });
    const low = await makeProduct(f, { sku: 'LOW', min: 10 });
    const ok = await makeProduct(f, { sku: 'OK', min: 5 });
    const exp = await makeProduct(f, { sku: 'EXP', min: 2 });
    const dead = await makeProduct(f, { sku: 'DEAD', min: 2 });
    await makeBatch(low, 'L1', 200, 3); // ≤ mínimo
    await makeBatch(ok, 'O1', 200, 50);
    await makeBatch(exp, 'E1', 20, 30); // vence en 20 días
    await makeBatch(exp, 'E2', 300, 30);
    await makeBatch(dead, 'D1', -3, 8); // vencido
    await makeBatch(dead, 'D2', 300, 30);

    const r = await recalculateAlerts();
    const alerts = await openAlerts();
    const by = (t: string) => alerts.filter((a) => a.type === t);

    expect(by('OUT_OF_STOCK').map((a) => a.productId)).toEqual([out]);
    expect(by('OUT_OF_STOCK')[0].priority).toBe('CRITICAL');
    expect(by('LOW_STOCK').map((a) => a.productId)).toEqual([low]);
    expect(by('EXPIRING')).toHaveLength(1);
    expect(by('EXPIRING')[0].priority).toBe('HIGH'); // ≤ 30 días
    expect(by('EXPIRED')).toHaveLength(1);
    expect(by('EXPIRED')[0].priority).toBe('CRITICAL');
    expect(alerts.some((a) => a.productId === ok)).toBe(false);
    expect(r.summary.total).toBe(4);
    expect(r.summary.critical).toBe(2);
  });

  it('los lotes vencidos no cuentan como stock disponible', async () => {
    const p = await makeProduct(f, { min: 5 });
    await makeBatch(p, 'VENCIDO', -1, 100);
    await recalculateAlerts();
    expect((await openAlerts()).map((a) => a.type).sort()).toEqual(['EXPIRED', 'OUT_OF_STOCK']);
  });

  it('una alerta de stock bajo se resuelve sola al ingresar mercadería', async () => {
    const p = await makeProduct(f, { min: 10 });
    await makeBatch(p, 'A', 200, 2);
    await recalculateAlerts();
    expect(await openAlerts()).toHaveLength(1);

    await inventoryService.receive(wh(), { productId: p, batchNumber: 'NUEVO', expiresAt: addDaysYmd(todayLima(), 365), quantity: 100, note: null });
    await recalculateAlerts();
    expect(await openAlerts()).toHaveLength(0);
    expect((await alertSummary()).total).toBe(0);
  });

  it('una venta que agota el producto abre la alerta crítica', async () => {
    const p = await makeProduct(f, { min: 2 });
    await makeBatch(p, 'A', 200, 6);
    await recalculateAlerts();
    expect(await openAlerts()).toHaveLength(0);

    await saleService.create(seller(), { items: [{ productId: p, quantity: 6, discountPct: 0 }], discountPct: 0, paymentMethod: 'CARD', customerId: null, prescriptionChecked: false } as any);
    await recalculateAlerts();
    const a = await openAlerts();
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ type: 'OUT_OF_STOCK', priority: 'CRITICAL' });
  });

  it('el recálculo es idempotente: no duplica alertas', async () => {
    const p = await makeProduct(f, { min: 5 });
    await makeBatch(p, 'A', 200, 1);
    await recalculateAlerts();
    await recalculateAlerts();
    await Promise.all([recalculateAlerts(), recalculateAlerts(), recalculateAlerts()]);
    expect(await db('alerts')).toHaveLength(1);
  });

  it('respeta los umbrales de vencimiento configurables', async () => {
    const p = await makeProduct(f, { min: 1 });
    await makeBatch(p, 'A', 75, 10); // 75 días: dentro de 90, fuera de 60
    await recalculateAlerts();
    expect((await openAlerts()).filter((a) => a.type === 'EXPIRING')).toHaveLength(1);
    await db('settings').insert({ key: 'expiry_alert_days', value: JSON.stringify([15, 30, 60]) });
    await recalculateAlerts();
    expect((await openAlerts()).filter((a) => a.type === 'EXPIRING')).toHaveLength(0);
  });
});

describe('Orden de reposición sugerida', () => {
  it('agrupa por proveedor y calcula cantidades según stock mínimo y rotación de 30 días', async () => {
    const [sup2] = await db('suppliers').insert({ name: 'Otro proveedor' }).returning('id');
    const a = await makeProduct(f, { sku: 'A', name: 'Producto A', min: 5, cost: 2 });
    const b = await makeProduct(f, { sku: 'B', name: 'Producto B', min: 4, cost: 3 });
    await db('products').where({ id: b }).update({ supplierId: sup2.id });
    const ok = await makeProduct(f, { sku: 'C', min: 2 });
    await makeBatch(a, 'A1', 200, 100);
    await makeBatch(b, 'B1', 200, 2);
    await makeBatch(ok, 'C1', 200, 50);

    // A: vende 97 → queda con 3 (bajo el mínimo de 5) con rotación de 97/30 por día
    await saleService.create(seller(), { items: [{ productId: a, quantity: 97, discountPct: 0 }], discountPct: 0, paymentMethod: 'CARD', customerId: null, prescriptionChecked: false } as any);

    const r = await replenishmentService.build(30);
    expect(r.groups).toHaveLength(2);
    const lineA = r.groups.flatMap((g) => g.lines).find((l) => l.productId === a)!;
    const lineB = r.groups.flatMap((g) => g.lines).find((l) => l.productId === b)!;
    expect(r.groups.flatMap((g) => g.lines).some((l) => l.productId === ok)).toBe(false);
    expect(lineA.sold30).toBe(97);
    expect(lineA.suggestedQty).toBe(Math.ceil((97 / 30) * 30) - 3); // 94
    expect(lineB.suggestedQty).toBe(6); // sin rotación: 2 × mínimo (8) − 2
    expect(r.totalCost).toBeCloseTo(lineA.suggestedQty * 2 + lineB.suggestedQty * 3, 2);
  });
});

describe('Inventario: ingresos, ajustes, mermas y conteo físico', () => {
  it('el ingreso crea el lote, suma si el lote existe y deja kardex de compra', async () => {
    const p = await makeProduct(f);
    const exp = addDaysYmd(todayLima(), 300);
    await inventoryService.receive(wh(), { productId: p, batchNumber: 'LT1', expiresAt: exp, quantity: 30, unitCost: 2.5, note: 'Factura F001-23' });
    await inventoryService.receive(wh(), { productId: p, batchNumber: 'LT1', expiresAt: exp, quantity: 20, note: null });
    expect(await stockOf(p)).toBe(50);
    expect(await db('batches').where({ productId: p })).toHaveLength(1);
    expect(await db('stock_movements').where({ type: 'PURCHASE' })).toHaveLength(2);
    expect(Number((await db('products').where({ id: p }).first()).purchasePrice)).toBe(2.5);
  });

  it('rechaza ingresar lotes vencidos o con otra fecha para el mismo número de lote', async () => {
    const p = await makeProduct(f);
    await expect(inventoryService.receive(wh(), { productId: p, batchNumber: 'X', expiresAt: addDaysYmd(todayLima(), -1), quantity: 5, note: null })).rejects.toMatchObject({ code: 'LOTE_VENCIDO' });
    await inventoryService.receive(wh(), { productId: p, batchNumber: 'Y', expiresAt: addDaysYmd(todayLima(), 100), quantity: 5, note: null });
    await expect(inventoryService.receive(wh(), { productId: p, batchNumber: 'Y', expiresAt: addDaysYmd(todayLima(), 200), quantity: 5, note: null })).rejects.toMatchObject({ code: 'LOTE_FECHA_DIFERENTE' });
  });

  it('el ajuste guarda el motivo en el kardex y no permite dejar el lote en negativo', async () => {
    const p = await makeProduct(f);
    const b = await makeBatch(p, 'A', 200, 10);
    await inventoryService.adjust(wh(), { batchId: b, delta: -4, reason: 'Rotura en estante' });
    expect(await batchQty(b)).toBe(6);
    const mov = await db('stock_movements').where({ type: 'ADJUSTMENT' }).first();
    expect(mov).toMatchObject({ quantity: -4, reason: 'Rotura en estante' });
    await expect(inventoryService.adjust(wh(), { batchId: b, delta: -7, reason: 'Más de lo que hay' })).rejects.toMatchObject({ code: 'STOCK_NEGATIVO' });
    expect(await batchQty(b)).toBe(6);
  });

  it('la merma por vencimiento da de baja todos los lotes vencidos', async () => {
    const p = await makeProduct(f);
    const old = await makeBatch(p, 'VIEJO', -10, 7);
    const ok = await makeBatch(p, 'OK', 100, 9);
    const r = await inventoryService.wasteExpired(wh());
    expect(r).toEqual({ batches: 1, units: 7 });
    expect(await batchQty(old)).toBe(0);
    expect(await batchQty(ok)).toBe(9);
    expect((await db('stock_movements').where({ type: 'WASTE' }).first()).reason).toMatch(/^Vencimiento/);
  });

  it('el kardex calcula el saldo acumulado por producto', async () => {
    const p = await makeProduct(f);
    await inventoryService.receive(wh(), { productId: p, batchNumber: 'A', expiresAt: addDaysYmd(todayLima(), 200), quantity: 50, note: null });
    await saleService.create(seller(), { items: [{ productId: p, quantity: 8, discountPct: 0 }], discountPct: 0, paymentMethod: 'YAPE', customerId: null, prescriptionChecked: false } as any);
    const k = await inventoryService.kardex({ productId: p, limit: 50, offset: 0 });
    expect(k.rows.map((r: any) => r.balance)).toEqual([42, 50]); // más reciente primero
  });

  it('la toma de inventario compara contra el sistema y aplica las diferencias como ajustes', async () => {
    const p = await makeProduct(f, { sku: 'CNT' });
    const q = await makeProduct(f, { sku: 'CNT2' });
    const a = await makeBatch(p, 'A', 50, 5);
    const b = await makeBatch(p, 'B', 200, 10);
    await makeBatch(q, 'Q', 200, 8);

    const count = await stockCountService.create(wh(), 'Conteo de prueba');
    expect(count.items.find((i: any) => i.productId === p)!.systemQty).toBe(15);

    await stockCountService.saveCounts(wh(), count.id, [
      { productId: p, countedQty: 12 }, // faltan 3
      { productId: q, countedQty: 8 }, // coincide
    ]);
    const mid = await stockCountService.detail(count.id);
    expect(mid.items.find((i: any) => i.productId === p)!.difference).toBe(-3);

    const r = await stockCountService.apply(wh(), count.id);
    expect(r).toEqual({ adjusted: 1, units: 3 });
    expect(await batchQty(a)).toBe(2); // faltante descontado por FEFO (lote que vence antes)
    expect(await batchQty(b)).toBe(10);
    const adj = await db('stock_movements').where({ type: 'ADJUSTMENT' });
    expect(adj).toHaveLength(1);
    expect(adj[0].reason).toContain('Conteo físico');
    await expect(stockCountService.apply(wh(), count.id)).rejects.toMatchObject({ code: 'CONTEO_CERRADO' });
  });
});
