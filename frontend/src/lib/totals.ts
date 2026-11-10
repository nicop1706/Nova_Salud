// Cálculo de totales del POS (idéntico al del servidor: en céntimos, IGV incluido en el precio).
// El servidor recalcula con los precios de la BD; esto solo sirve para mostrar los importes.

export const IGV_RATE = 0.18;
const toCents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const fromCents = (c: number) => Math.round(c) / 100;

export interface TotalsInput {
  unitPrice: number;
  quantity: number;
  discountPct: number;
}
export interface Totals {
  lines: Array<{ gross: number; discount: number; total: number }>;
  total: number;
  subtotal: number;
  igv: number;
  discount: number;
}

export function computeTotals(items: TotalsInput[], globalPct: number, rate = IGV_RATE): Totals {
  const clamp = (n: number) => Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), 100);
  const lines = items.map((i) => {
    const gross = toCents(i.unitPrice) * i.quantity;
    const discount = Math.round((gross * clamp(i.discountPct)) / 100);
    return { gross, discount, total: gross - discount };
  });
  const itemsTotal = lines.reduce((s, l) => s + l.total, 0);
  const globalDiscount = Math.round((itemsTotal * clamp(globalPct)) / 100);
  const total = itemsTotal - globalDiscount;
  const base = Math.round(total / (1 + rate));
  return {
    lines: lines.map((l) => ({ gross: fromCents(l.gross), discount: fromCents(l.discount), total: fromCents(l.total) })),
    total: fromCents(total),
    subtotal: fromCents(base),
    igv: fromCents(total - base),
    discount: fromCents(lines.reduce((s, l) => s + l.discount, 0) + globalDiscount),
  };
}
