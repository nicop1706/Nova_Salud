import bcrypt from 'bcryptjs';
import { env } from '../src/config/env';
import { logger } from '../src/config/logger';
import { db, Trx } from '../src/db/knex';
import { addDaysYmd, limaStartOfDay, todayLima } from '../src/utils/dates';
import { computeSaleTotals } from '../src/utils/money';
import { CATEGORIES, CUSTOMERS, PRODUCTS, SUPPLIERS } from './data';

// ---------------------------------------------------------------------------------------------
// Seed de demostración. Genera un historial de 30 días CONSISTENTE:
//   stock inicial de cada lote = stock actual + todo lo que salió (ventas, ajuste, merma)
// por lo que kardex, lotes y ventas cuadran exactamente. El generador es determinista (misma
// estructura en cada ejecución; las fechas son relativas a "hoy" en America/Lima).
// ---------------------------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PAY_WEIGHTS: Array<['CASH' | 'CARD' | 'YAPE' | 'PLIN', number]> = [['CASH', 0.45], ['CARD', 0.25], ['YAPE', 0.2], ['PLIN', 0.1]];
const at = (ymd: string, hh: number, mm = 0) => new Date(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-05:00`);
const pad = (n: number) => String(n).padStart(2, '0');
const round2 = (n: number) => Math.round(n * 100) / 100;

interface MemBatch {
  pIdx: number;
  label: number; // 0 = lote ya vencido y dado de baja, 1 y 2 = lotes vigentes
  number: string;
  expiresAt: string;
  final: number; // cantidad actual deseada
  consumed: number; // salidas acumuladas (ventas + ajuste + merma)
  id?: number;
}

interface Line {
  pIdx: number;
  qty: number;
  discountPct: number;
  batch: MemBatch;
}

interface MemSale {
  completedAt: Date;
  ymd: string;
  customerIdx: number | null;
  sellerIsAdmin: boolean;
  paymentMethod: 'CASH' | 'CARD' | 'YAPE' | 'PLIN';
  globalPct: number;
  lines: Line[];
  serviceSeconds: number;
  voided: boolean;
}

export async function runSeed(): Promise<void> {
  const rnd = mulberry32(20260101);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const today = todayLima();
  const ymdBatchNo = (d: string) => `LT-${d.slice(2, 4)}${d.slice(5, 7)}`;

  // ------------------------------ 1) Lotes en memoria ------------------------------
  const batches: MemBatch[] = [];
  const byProduct = new Map<number, MemBatch[]>();
  const addBatch = (pIdx: number, label: number, expDays: number, final: number) => {
    const exp = addDaysYmd(today, expDays);
    const b: MemBatch = { pIdx, label, number: `${ymdBatchNo(exp)}-${label}`, expiresAt: exp, final, consumed: 0 };
    batches.push(b);
    (byProduct.get(pIdx) ?? byProduct.set(pIdx, []).get(pIdx)!).push(b);
  };

  const wasteProducts = new Set<number>();
  PRODUCTS.forEach((p, i) => {
    if (p.profile === 'N' && p.pop >= 3 && wasteProducts.size < 3 && i % 4 === 1) wasteProducts.add(i);
  });

  PRODUCTS.forEach((p, i) => {
    switch (p.profile) {
      case 'N':
        if (wasteProducts.has(i)) addBatch(i, 0, -14, 0);
        addBatch(i, 1, between(120, 400), p.min * 2 + between(8, 40));
        if (rnd() < 0.7) addBatch(i, 2, between(401, 700), between(20, 80));
        break;
      case 'L': {
        const final = Math.max(1, Math.min(p.min, Math.floor(p.min * (0.2 + rnd() * 0.6))));
        addBatch(i, 1, between(150, 400), final);
        break;
      }
      case 'O':
        addBatch(i, 1, between(200, 400), 0);
        break;
      case 'E':
        addBatch(i, 1, pick([12, 20, 26, 45, 58]), between(10, 35));
        addBatch(i, 2, between(300, 500), p.min * 2 + 10);
        break;
      case 'D':
        addBatch(i, 1, between(62, 88), between(15, 30));
        addBatch(i, 2, between(300, 500), p.min * 2 + 10);
        break;
      case 'X':
        addBatch(i, 1, -between(4, 18), between(6, 18));
        addBatch(i, 2, between(200, 400), p.min * 2 + 8);
        break;
    }
  });

  // ------------------------------ 2) Simulación de ventas (30 días) ------------------------------
  const popWeights = PRODUCTS.map((p) => p.pop * p.pop); // sesgo hacia los populares
  const totalW = popWeights.reduce((s, w) => s + w, 0);
  const pickProduct = () => {
    let r = rnd() * totalW;
    for (let i = 0; i < popWeights.length; i++) {
      r -= popWeights[i];
      if (r <= 0) return i;
    }
    return 0;
  };
  const eligible = (pIdx: number, ymd: string): MemBatch | undefined =>
    (byProduct.get(pIdx) ?? []).filter((b) => b.expiresAt >= ymd).sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1))[0];

  // favoritos por cliente (productos que compra con frecuencia)
  const favorites = CUSTOMERS.map(() => {
    const favs = new Set<number>();
    while (favs.size < 4) {
      const c = pickProduct();
      if (PRODUCTS[c].profile !== 'O') favs.add(c);
    }
    return [...favs];
  });

  const sales: MemSale[] = [];
  const nowMs = Date.now();
  for (let d = -29; d <= 0; d++) {
    const ymd = addDaysYmd(today, d);
    const dow = (new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
    const count = dow === 6 ? between(9, 13) : dow === 5 ? between(22, 28) : between(17, 26);
    const dayStart = limaStartOfDay(ymd).getTime();
    const stamps: number[] = [];
    for (let k = 0; k < count; k++) {
      const u = rnd();
      const hour = u < 0.35 ? 8 + rnd() * 4 : u < 0.6 ? 12 + rnd() * 3 : 16 + rnd() * 5.5;
      const t = dayStart + Math.floor(hour * 3600) * 1000;
      if (t < nowMs - 60_000) stamps.push(t);
    }
    stamps.sort((a, b) => a - b);

    for (const t of stamps) {
      const customerIdx = rnd() < 0.3 ? Math.floor(rnd() * CUSTOMERS.length) : null;
      const n = 1 + (rnd() < 0.45 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0) + (rnd() < 0.08 ? 1 : 0);
      const chosen = new Set<number>();
      while (chosen.size < n) {
        chosen.add(customerIdx !== null && rnd() < 0.6 ? pick(favorites[customerIdx]) : pickProduct());
      }
      const lines: Line[] = [];
      for (const pIdx of chosen) {
        const batch = eligible(pIdx, ymd);
        if (!batch) continue;
        const r = rnd();
        const qty = r < 0.65 ? 1 : r < 0.9 ? 2 : r < 0.98 ? 3 : between(4, 6);
        lines.push({ pIdx, qty, discountPct: rnd() < 0.03 ? 5 : 0, batch });
      }
      if (!lines.length) continue;

      const u = rnd();
      let acc = 0;
      let method: MemSale['paymentMethod'] = 'CASH';
      for (const [m, w] of PAY_WEIGHTS) {
        acc += w;
        if (u <= acc) {
          method = m;
          break;
        }
      }
      // Tiempo de atención: la mayoría 1-3 min, algunas más largas
      const service = Math.round(40 + rnd() * rnd() * 380);
      sales.push({
        completedAt: new Date(t),
        ymd,
        customerIdx,
        sellerIsAdmin: rnd() < 0.1,
        paymentMethod: method,
        globalPct: rnd() < 0.05 ? 5 : 0,
        lines,
        serviceSeconds: service,
        voided: false,
      });
    }
  }

  // 2 ventas anuladas (no descuentan stock neto)
  const voidCandidates = sales.map((s, i) => ({ s, i })).filter(({ s }) => s.ymd < addDaysYmd(today, -3) && s.ymd > addDaysYmd(today, -20));
  for (let k = 0; k < 2 && voidCandidates.length; k++) {
    const c = voidCandidates.splice(Math.floor(rnd() * voidCandidates.length), 1)[0];
    c.s.voided = true;
  }
  const consumptionEvents: Array<{ pIdx: number; qty: number; at: number }> = [];
  for (const s of sales) {
    if (s.voided) continue;
    for (const l of s.lines) {
      l.batch.consumed += l.qty;
      consumptionEvents.push({ pIdx: l.pIdx, qty: l.qty, at: s.completedAt.getTime() });
    }
  }

  // ------------------------------ 3) Merma por vencimiento y conteo físico ------------------------------
  const wasteDay = addDaysYmd(today, -10);
  const wasteRows: Array<{ batch: MemBatch; qty: number }> = [];
  for (const b of batches.filter((x) => x.label === 0)) {
    b.consumed += 12;
    wasteRows.push({ batch: b, qty: 12 });
  }

  const countDay = addDaysYmd(today, -8);
  const countAt = at(countDay, 8, 30);
  const countCandidates = PRODUCTS.map((p, i) => ({ p, i }))
    .filter(({ p, i }) => p.profile === 'N' && p.pop >= 2 && !wasteProducts.has(i))
    .slice(0, 24);
  const countItems = countCandidates.map(({ i }, k) => {
    const b1 = (byProduct.get(i) ?? []).find((b) => b.label === 1)!;
    const diff = k === 3 ? 2 : k === 11 ? 1 : 0; // faltantes detectados
    const after = consumptionEvents.filter((e) => e.pIdx === i && e.at > countAt.getTime()).reduce((s, e) => s + e.qty, 0);
    const counted = (byProduct.get(i) ?? []).reduce((s, b) => s + b.final, 0) + after;
    if (diff) b1.consumed += diff;
    return { pIdx: i, batch: b1, diff, counted, system: counted + diff };
  });

  // ------------------------------ 4) Escritura en BD ------------------------------
  await db.transaction(async (trx: Trx) => {
    if (env.SEED_FORCE) {
      await trx.raw(
        `TRUNCATE audit_logs, stock_count_items, stock_counts, settings, alerts, stockout_events, sale_item_batches, sale_items,
                  sales, customers, stock_movements, batches, products, suppliers, categories, refresh_tokens, users RESTART IDENTITY CASCADE`,
      );
      await trx.raw('ALTER SEQUENCE sales_number_seq RESTART WITH 1');
    }

    // Usuarios
    const hash = (p: string) => bcrypt.hash(p, env.BCRYPT_ROUNDS);
    const [admin, seller, warehouse] = await trx('users')
      .insert([
        { email: 'admin@novasalud.pe', name: 'Administrador Nova Salud', role: 'ADMIN', passwordHash: await hash(env.SEED_ADMIN_PASSWORD) },
        { email: 'vendedor@novasalud.pe', name: 'Valeria Núñez (Vendedora)', role: 'SELLER', passwordHash: await hash(env.SEED_SELLER_PASSWORD) },
        { email: 'almacen@novasalud.pe', name: 'Luis Alcántara (Almacén)', role: 'WAREHOUSE', passwordHash: await hash(env.SEED_WAREHOUSE_PASSWORD) },
      ])
      .returning('id');

    const cats = await trx('categories').insert(CATEGORIES).returning('id');
    const sups = await trx('suppliers').insert(SUPPLIERS).returning('id');
    const prods = await trx('products')
      .insert(
        PRODUCTS.map((p) => ({
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          activeIngredient: p.activeIngredient,
          laboratory: p.laboratory,
          presentation: p.presentation,
          categoryId: cats[p.cat].id,
          supplierId: sups[p.sup].id,
          purchasePrice: p.buy,
          salePrice: p.sell,
          minStock: p.min,
          requiresPrescription: p.rx,
        })),
      )
      .returning('id');
    const custs = await trx('customers').insert(CUSTOMERS).returning('id');

    // Lotes (stock inicial = actual + salidas) y compra inicial en kardex
    const receivedAt = at(addDaysYmd(today, -45), 10);
    const live = batches.filter((b) => b.final + b.consumed > 0);
    const insertedBatches = await trx('batches')
      .insert(
        live.map((b) => ({
          productId: prods[b.pIdx].id,
          batchNumber: b.number,
          expiresAt: b.expiresAt,
          quantity: b.final,
          initialQty: b.final + b.consumed,
          receivedAt,
        })),
      )
      .returning('id');
    live.forEach((b, i) => (b.id = insertedBatches[i].id));

    await trx('stock_movements').insert(
      live.map((b) => ({
        productId: prods[b.pIdx].id,
        batchId: b.id,
        type: 'PURCHASE',
        quantity: b.final + b.consumed,
        unitCost: PRODUCTS[b.pIdx].buy,
        reason: 'Ingreso por compra (carga inicial de demostración)',
        reference: 'COMPRA-INICIAL',
        userId: warehouse.id,
        createdAt: receivedAt,
      })),
    );

    // Ventas
    sales.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    type Insertable = Record<string, unknown>;
    const saleRows: Insertable[] = [];
    const totalsBySale = sales.map((s) =>
      computeSaleTotals(s.lines.map((l) => ({ unitPrice: PRODUCTS[l.pIdx].sell, quantity: l.qty, discountPct: l.discountPct })), s.globalPct, env.IGV_RATE),
    );
    sales.forEach((s, i) => {
      const t = totalsBySale[i];
      let cash: number | null = null;
      let change: number | null = null;
      if (s.paymentMethod === 'CASH') {
        const step = t.total >= 50 ? 100 : t.total >= 20 ? 50 : 10;
        cash = rnd() < 0.35 ? t.total : Math.ceil(t.total / step) * step;
        change = round2(cash - t.total);
      }
      const voidedAt = s.voided ? new Date(s.completedAt.getTime() + 12 * 60_000) : null;
      saleRows.push({
        customerId: s.customerIdx !== null ? custs[s.customerIdx].id : null,
        sellerId: s.sellerIsAdmin ? admin.id : seller.id,
        status: s.voided ? 'VOIDED' : 'COMPLETED',
        paymentMethod: s.paymentMethod,
        subtotal: t.subtotal,
        igv: t.igv,
        discount: t.discount,
        total: t.total,
        cashReceived: cash,
        changeGiven: change,
        prescriptionChecked: s.lines.some((l) => PRODUCTS[l.pIdx].rx),
        startedAt: new Date(s.completedAt.getTime() - s.serviceSeconds * 1000),
        completedAt: s.completedAt,
        serviceSeconds: s.serviceSeconds,
        voidedAt,
        voidedById: s.voided ? admin.id : null,
        voidReason: s.voided ? 'Error en el producto registrado (anulación de demostración)' : null,
        createdAt: s.completedAt,
      });
    });

    const saleIds: Array<{ id: number; number: number }> = [];
    for (let i = 0; i < saleRows.length; i += 200) {
      saleIds.push(...(await trx('sales').insert(saleRows.slice(i, i + 200)).returning(['id', 'number'])));
    }

    const itemRows: Insertable[] = [];
    const itemMeta: Array<{ s: number; line: Line; qty: number }> = [];
    sales.forEach((s, si) =>
      s.lines.forEach((l, li) => {
        const t = totalsBySale[si].items[li];
        itemRows.push({
          saleId: saleIds[si].id,
          productId: prods[l.pIdx].id,
          quantity: l.qty,
          unitPrice: PRODUCTS[l.pIdx].sell,
          unitCost: PRODUCTS[l.pIdx].buy,
          discount: t.discount,
          lineTotal: t.lineTotal,
        });
        itemMeta.push({ s: si, line: l, qty: l.qty });
      }),
    );
    const itemIds: Array<{ id: number }> = [];
    for (let i = 0; i < itemRows.length; i += 400) {
      itemIds.push(...(await trx('sale_items').insert(itemRows.slice(i, i + 400)).returning('id')));
    }

    const sibRows: Insertable[] = [];
    const movRows: Insertable[] = [];
    itemMeta.forEach((m, i) => {
      const s = sales[m.s];
      const ref = `NV-${String(saleIds[m.s].number).padStart(6, '0')}`;
      sibRows.push({ saleItemId: itemIds[i].id, batchId: m.line.batch.id, quantity: m.qty });
      const base = { productId: prods[m.line.pIdx].id, batchId: m.line.batch.id, unitCost: PRODUCTS[m.line.pIdx].buy, reference: ref, userId: s.sellerIsAdmin ? admin.id : seller.id };
      movRows.push({ ...base, type: 'SALE', quantity: -m.qty, reason: 'Venta', createdAt: s.completedAt });
      if (s.voided) {
        movRows.push({ ...base, userId: admin.id, type: 'VOID', quantity: m.qty, reason: 'Anulación de venta: Error en el producto registrado (anulación de demostración)', createdAt: new Date(s.completedAt.getTime() + 12 * 60_000) });
      }
    });
    for (let i = 0; i < sibRows.length; i += 500) await trx('sale_item_batches').insert(sibRows.slice(i, i + 500));

    // Merma por vencimiento (lotes ya vencidos dados de baja)
    for (const w of wasteRows) {
      movRows.push({
        productId: prods[w.batch.pIdx].id,
        batchId: w.batch.id,
        type: 'WASTE',
        quantity: -w.qty,
        unitCost: PRODUCTS[w.batch.pIdx].buy,
        reason: `Vencimiento: lote ${w.batch.number} venció el ${w.batch.expiresAt}`,
        userId: warehouse.id,
        createdAt: at(wasteDay, 9),
      });
    }

    // Conteo físico aplicado (hace 8 días) con 2 diferencias
    const [count] = await trx('stock_counts')
      .insert({ status: 'APPLIED', notes: 'Conteo mensual de estantes (demostración)', createdById: warehouse.id, createdAt: countAt, appliedAt: at(countDay, 9, 40) })
      .returning('id');
    await trx('stock_count_items').insert(countItems.map((c) => ({ countId: count.id, productId: prods[c.pIdx].id, systemQty: c.system, countedQty: c.counted })));
    for (const c of countItems.filter((x) => x.diff)) {
      movRows.push({
        productId: prods[c.pIdx].id,
        batchId: c.batch.id,
        type: 'ADJUSTMENT',
        quantity: -c.diff,
        reason: `Conteo físico #${count.id}: sistema ${c.system}, físico ${c.counted}`,
        reference: `CONTEO-${count.id}`,
        userId: warehouse.id,
        createdAt: at(countDay, 9, 40),
      });
    }
    movRows.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
    for (let i = 0; i < movRows.length; i += 500) await trx('stock_movements').insert(movRows.slice(i, i + 500));

    // Intentos de venta sin stock (alimentan el indicador de quiebres)
    const shortIdx = PRODUCTS.map((p, i) => ({ p, i })).filter(({ p }) => p.profile === 'O' || p.profile === 'L');
    const stockouts = Array.from({ length: 14 }, () => {
      const { i } = pick(shortIdx);
      const day = addDaysYmd(today, -between(0, 25));
      return { productId: prods[i].id, requestedQty: between(1, 3), availableQty: 0, source: 'POS_ATTEMPT', userId: seller.id, createdAt: at(day, between(9, 20), between(0, 59)) };
    });
    await trx('stockout_events').insert(stockouts);

    await trx('audit_logs').insert([
      { userId: admin.id, action: 'DATOS_DEMO_CARGADOS', entity: 'seed', detail: JSON.stringify({ productos: PRODUCTS.length, ventas: sales.length }), createdAt: new Date() },
      { userId: warehouse.id, action: 'CONTEO_APLICADO', entity: 'stock_counts', entityId: String(count.id), detail: JSON.stringify({ productos: 2, unidades: 3 }), createdAt: at(countDay, 9, 40) },
      { userId: warehouse.id, action: 'MERMA_VENCIDOS', entity: 'batches', detail: JSON.stringify({ batches: wasteRows.length, units: wasteRows.length * 12 }), createdAt: at(wasteDay, 9) },
      ...sales.flatMap((s, i) => (s.voided ? [{ userId: admin.id, action: 'VENTA_ANULADA', entity: 'sales', entityId: String(saleIds[i].id), detail: JSON.stringify({ motivo: 'Error en el producto registrado (anulación de demostración)' }), createdAt: new Date(s.completedAt.getTime() + 12 * 60_000) }] : [])),
    ]);
  });

  logger.info(
    { productos: PRODUCTS.length, categorias: CATEGORIES.length, proveedores: SUPPLIERS.length, clientes: CUSTOMERS.length, ventas: sales.length, lotes: batches.length },
    'Seed de demostración cargado',
  );
}

if (require.main === module) {
  runSeed()
    .then(() => db.destroy())
    .catch(async (err) => {
      logger.error({ err }, 'Falló el seed');
      await db.destroy();
      process.exit(1);
    });
}
