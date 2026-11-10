import { db } from '../db/knex';
import { todayLima } from '../utils/dates';

export interface ReplenishmentLine {
  productId: number;
  sku: string;
  name: string;
  presentation: string | null;
  available: number;
  minStock: number;
  sold30: number;
  dailyRate: number;
  suggestedQty: number;
  unitCost: number;
  lineCost: number;
}

export interface ReplenishmentGroup {
  supplierId: number | null;
  supplierName: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  lines: ReplenishmentLine[];
  totalCost: number;
}

/**
 * Cantidad sugerida = lo necesario para cubrir `coverageDays` de demanda (rotación de los últimos 30 días)
 * y dejar el stock en al menos el doble del mínimo; se redondea hacia arriba.
 *   objetivo  = max(2 × stock_mínimo, ceil(venta_diaria × días_cobertura))
 *   sugerido  = max(objetivo − disponible, 0)   (si el objetivo no se alcanza, al menos stock_mínimo)
 */
export function suggestQuantity(available: number, minStock: number, sold30: number, coverageDays: number): { dailyRate: number; qty: number } {
  const dailyRate = sold30 / 30;
  const target = Math.max(minStock * 2, Math.ceil(dailyRate * coverageDays));
  const qty = Math.max(target - available, 0);
  return { dailyRate: Math.round(dailyRate * 100) / 100, qty: qty > 0 ? qty : Math.max(minStock - available + 1, 0) };
}

export const replenishmentService = {
  async build(coverageDays = 30): Promise<{ generatedAt: string; coverageDays: number; groups: ReplenishmentGroup[]; totalCost: number; totalLines: number }> {
    const today = todayLima();
    const r = await db.raw(
      `SELECT p.id AS product_id, p.sku, p.name, p.presentation, p.min_stock, p.purchase_price,
              p.supplier_id, s.name AS supplier_name, s.contact, s.phone, s.email,
              COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.product_id = p.id AND b.expires_at >= ?), 0)::int AS available,
              COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales sa ON sa.id = si.sale_id
                         WHERE si.product_id = p.id AND sa.status = 'COMPLETED'
                           AND sa.completed_at >= now() - interval '30 days'), 0)::int AS sold30
         FROM products p
         LEFT JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.active`,
      [today],
    );

    const groups = new Map<string, ReplenishmentGroup>();
    for (const row of r.rows as any[]) {
      if (row.available > row.minStock) continue;
      const { dailyRate, qty } = suggestQuantity(row.available, row.minStock, row.sold30, coverageDays);
      if (qty <= 0) continue;
      const key = String(row.supplierId ?? 'none');
      let g = groups.get(key);
      if (!g) {
        g = {
          supplierId: row.supplierId ?? null,
          supplierName: row.supplierName ?? 'Sin proveedor asignado',
          contact: row.contact ?? null,
          phone: row.phone ?? null,
          email: row.email ?? null,
          lines: [],
          totalCost: 0,
        };
        groups.set(key, g);
      }
      const lineCost = Math.round(qty * row.purchasePrice * 100) / 100;
      g.lines.push({
        productId: row.productId,
        sku: row.sku,
        name: row.name,
        presentation: row.presentation,
        available: row.available,
        minStock: row.minStock,
        sold30: row.sold30,
        dailyRate,
        suggestedQty: qty,
        unitCost: row.purchasePrice,
        lineCost,
      });
      g.totalCost = Math.round((g.totalCost + lineCost) * 100) / 100;
    }
    const list = [...groups.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName));
    for (const g of list) g.lines.sort((a, b) => a.available - b.available || a.name.localeCompare(b.name));
    return {
      generatedAt: new Date().toISOString(),
      coverageDays,
      groups: list,
      totalCost: Math.round(list.reduce((s, g) => s + g.totalCost, 0) * 100) / 100,
      totalLines: list.reduce((s, g) => s + g.lines.length, 0),
    };
  },
};
