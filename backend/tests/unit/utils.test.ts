import { describe, expect, it } from 'vitest';
import { planFefo } from '../../src/utils/fefo';
import { computeSaleTotals, toCents } from '../../src/utils/money';
import { addDaysYmd, diffDays, isValidYmd, startOfWeekYmd } from '../../src/utils/dates';
import { suggestQuantity } from '../../src/services/replenishmentService';
import { computeServiceSeconds } from '../../src/services/saleService';
import { customerSchema } from '../../src/schemas/customers';
import { createSaleSchema } from '../../src/schemas/sales';
import { adjustSchema } from '../../src/schemas/inventory';

describe('FEFO (primero en vencer, primero en salir)', () => {
  const batches = [
    { id: 1, quantity: 5, expiresAt: '2027-06-01' },
    { id: 2, quantity: 10, expiresAt: '2026-12-01' },
    { id: 3, quantity: 8, expiresAt: '2027-01-15' },
  ];

  it('descuenta primero del lote que vence antes', () => {
    expect(planFefo(batches, 4)).toEqual({ allocations: [{ batchId: 2, quantity: 4 }], shortage: 0 });
  });

  it('reparte entre lotes cuando el primero no alcanza', () => {
    const plan = planFefo(batches, 13);
    expect(plan.allocations).toEqual([
      { batchId: 2, quantity: 10 },
      { batchId: 3, quantity: 3 },
    ]);
    expect(plan.shortage).toBe(0);
  });

  it('informa el faltante cuando no hay stock suficiente', () => {
    const plan = planFefo(batches, 30);
    expect(plan.allocations.reduce((s, a) => s + a.quantity, 0)).toBe(23);
    expect(plan.shortage).toBe(7);
  });

  it('excluye lotes vencidos y sin stock', () => {
    const plan = planFefo(
      [
        { id: 1, quantity: 9, expiresAt: '2026-01-01' }, // vencido
        { id: 2, quantity: 0, expiresAt: '2026-12-01' }, // sin stock
        { id: 3, quantity: 4, expiresAt: '2027-01-01' },
      ],
      3,
      '2026-11-05',
    );
    expect(plan.allocations).toEqual([{ batchId: 3, quantity: 3 }]);
  });

  it('desempata por id cuando vencen el mismo día y no muta la entrada', () => {
    const input = [
      { id: 9, quantity: 3, expiresAt: '2027-01-01' },
      { id: 4, quantity: 3, expiresAt: '2027-01-01' },
    ];
    expect(planFefo(input, 2).allocations).toEqual([{ batchId: 4, quantity: 2 }]);
    expect(input[0].id).toBe(9);
  });
});

describe('Importes: IGV 18 % incluido en el precio', () => {
  it('desglosa base imponible e IGV a partir del total', () => {
    const t = computeSaleTotals([{ unitPrice: 11.8, quantity: 1 }], 0, 0.18);
    expect(t.total).toBe(11.8);
    expect(t.subtotal).toBe(10);
    expect(t.igv).toBe(1.8);
  });

  it('base + IGV siempre suma exactamente el total (sin errores de redondeo)', () => {
    for (const price of [0.99, 3.45, 12.5, 7.77, 19.99, 101.01]) {
      for (const qty of [1, 2, 3, 7]) {
        const t = computeSaleTotals([{ unitPrice: price, quantity: qty }], 0, 0.18);
        expect(toCents(t.subtotal) + toCents(t.igv)).toBe(toCents(t.total));
      }
    }
  });

  it('aplica descuento por ítem y descuento global', () => {
    const t = computeSaleTotals(
      [
        { unitPrice: 10, quantity: 2, discountPct: 10 }, // 20 - 2 = 18
        { unitPrice: 5, quantity: 1 }, // 5
      ],
      10, // 10 % sobre 23 = 2.30
      0.18,
    );
    expect(t.items[0].lineTotal).toBe(18);
    expect(t.itemsDiscount).toBe(2);
    expect(t.globalDiscount).toBe(2.3);
    expect(t.total).toBe(20.7);
    expect(t.discount).toBe(4.3);
  });

  it('limita los porcentajes al rango 0-100', () => {
    expect(computeSaleTotals([{ unitPrice: 10, quantity: 1, discountPct: 150 }], 0, 0.18).total).toBe(0);
    expect(computeSaleTotals([{ unitPrice: 10, quantity: 1, discountPct: -5 }], 0, 0.18).total).toBe(10);
  });
});

describe('Sugerencia de reposición', () => {
  it('cubre la demanda de los días de cobertura según la rotación de 30 días', () => {
    // vendió 60 en 30 días = 2/día → 30 días de cobertura = 60; mínimo 5 (×2 = 10) → objetivo 60
    expect(suggestQuantity(3, 5, 60, 30)).toEqual({ dailyRate: 2, qty: 57 });
  });

  it('sin rotación repone al menos hasta el doble del mínimo', () => {
    expect(suggestQuantity(1, 8, 0, 30).qty).toBe(15);
  });

  it('un producto agotado siempre sugiere cantidad positiva', () => {
    expect(suggestQuantity(0, 4, 0, 30).qty).toBeGreaterThan(0);
  });
});

describe('Tiempo de atención', () => {
  const done = new Date('2026-11-05T15:00:00Z');
  it('mide segundos desde el primer ítem hasta la confirmación', () => {
    expect(computeServiceSeconds('2026-11-05T14:58:30Z', done).seconds).toBe(90);
  });
  it('descarta valores imposibles (futuro o más de 6 h)', () => {
    expect(computeServiceSeconds('2026-11-05T15:05:00Z', done).seconds).toBeNull();
    expect(computeServiceSeconds('2026-11-05T05:00:00Z', done).seconds).toBeNull();
    expect(computeServiceSeconds(undefined, done).seconds).toBeNull();
  });
});

describe('Fechas (America/Lima)', () => {
  it('suma días y calcula diferencias', () => {
    expect(addDaysYmd('2026-02-27', 3)).toBe('2026-03-02');
    expect(diffDays('2026-11-05', '2026-12-05')).toBe(30);
  });
  it('valida fechas reales', () => {
    expect(isValidYmd('2026-02-30')).toBe(false);
    expect(isValidYmd('2026-02-28')).toBe(true);
  });
  it('la semana comienza el lunes', () => {
    expect(startOfWeekYmd('2026-11-05')).toBe('2026-11-02'); // jueves → lunes
  });
});

describe('Validación Zod de entradas', () => {
  it('rechaza DNI con formato inválido y acepta RUC válido', () => {
    expect(customerSchema.safeParse({ docType: 'DNI', docNumber: '123', name: 'Ana' }).success).toBe(false);
    expect(customerSchema.safeParse({ docType: 'RUC', docNumber: '20512345678', name: 'Empresa SAC' }).success).toBe(true);
  });
  it('limpia etiquetas HTML y caracteres de control del nombre', () => {
    const r = customerSchema.parse({ docType: 'DNI', docNumber: '12345678', name: '  <b>Ana</b>\u0000 Pérez ' });
    expect(r.name).not.toMatch(/[<>]/);
    expect(r.name).toContain('Ana');
  });
  it('exige cantidades enteras positivas y al menos un ítem en la venta', () => {
    expect(createSaleSchema.safeParse({ items: [], paymentMethod: 'CASH' }).success).toBe(false);
    expect(createSaleSchema.safeParse({ items: [{ productId: 1, quantity: 0 }], paymentMethod: 'CASH' }).success).toBe(false);
    expect(createSaleSchema.safeParse({ items: [{ productId: 1, quantity: 1.5 }], paymentMethod: 'CASH' }).success).toBe(false);
    expect(createSaleSchema.safeParse({ items: [{ productId: 1, quantity: 2 }], paymentMethod: 'YAPE' }).success).toBe(true);
  });
  it('el ajuste de inventario exige motivo y cantidad distinta de cero', () => {
    expect(adjustSchema.safeParse({ batchId: 1, delta: 3, reason: '' }).success).toBe(false);
    expect(adjustSchema.safeParse({ batchId: 1, delta: 0, reason: 'Conteo físico' }).success).toBe(false);
    expect(adjustSchema.safeParse({ batchId: 1, delta: -3, reason: 'Rotura en estante' }).success).toBe(true);
  });
});
