// Cálculo de totales en céntimos (enteros) para evitar errores de coma flotante.
// Los precios de venta de la botica INCLUYEN IGV (práctica habitual en retail).

export const toCents = (n: number): number => Math.round((n + Number.EPSILON) * 100);
export const fromCents = (c: number): number => Math.round(c) / 100;
export const round2 = (n: number): number => fromCents(toCents(n));

export interface TotalsItemInput {
  unitPrice: number; // con IGV
  quantity: number;
  discountPct?: number; // 0-100, descuento por ítem
}

export interface TotalsItemResult {
  gross: number; // unitPrice * quantity
  discount: number;
  lineTotal: number;
}

export interface SaleTotals {
  items: TotalsItemResult[];
  itemsDiscount: number;
  globalDiscount: number;
  discount: number; // suma de todos los descuentos
  total: number; // con IGV, lo que paga el cliente
  subtotal: number; // base imponible (sin IGV)
  igv: number;
}

export function computeSaleTotals(
  items: TotalsItemInput[],
  globalDiscountPct: number,
  igvRate: number,
): SaleTotals {
  const lines = items.map((it) => {
    const gross = toCents(it.unitPrice) * it.quantity;
    const pct = Math.min(Math.max(it.discountPct ?? 0, 0), 100);
    const discount = Math.round((gross * pct) / 100);
    return { gross, discount, lineTotal: gross - discount };
  });
  const itemsSubtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const gpct = Math.min(Math.max(globalDiscountPct, 0), 100);
  const globalDiscount = Math.round((itemsSubtotal * gpct) / 100);
  const total = itemsSubtotal - globalDiscount;
  const base = Math.round(total / (1 + igvRate));
  const igv = total - base;
  const itemsDiscount = lines.reduce((s, l) => s + l.discount, 0);
  return {
    items: lines.map((l) => ({
      gross: fromCents(l.gross),
      discount: fromCents(l.discount),
      lineTotal: fromCents(l.lineTotal),
    })),
    itemsDiscount: fromCents(itemsDiscount),
    globalDiscount: fromCents(globalDiscount),
    discount: fromCents(itemsDiscount + globalDiscount),
    total: fromCents(total),
    subtotal: fromCents(base),
    igv: fromCents(igv),
  };
}
