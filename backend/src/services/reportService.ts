import { db } from '../db/knex';
import { addDaysYmd, limaEndOfDay, limaStartOfDay, todayLima } from '../utils/dates';
import { badRequest } from '../utils/errors';

export type ColType = 'text' | 'int' | 'money' | 'date' | 'datetime';

export interface Dataset {
  key: string;
  title: string;
  subtitle: string;
  columns: Array<{ key: string; label: string; type: ColType; width?: number }>;
  rows: Array<Record<string, any>>;
  totals?: Record<string, number | string>;
}

export const REPORT_KEYS = ['sales', 'kardex', 'valued-inventory', 'low-rotation', 'expirations'] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

const PAY: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', YAPE: 'Yape', PLIN: 'Plin' };
const MOV: Record<string, string> = { PURCHASE: 'Ingreso por compra', SALE: 'Venta', ADJUSTMENT: 'Ajuste', WASTE: 'Merma', RETURN: 'Devolución', VOID: 'Anulación de venta' };
const sum = (rows: any[], k: string) => Math.round(rows.reduce((s, r) => s + Number(r[k] ?? 0), 0) * 100) / 100;

function range(from?: string, to?: string, defaultDays = 30) {
  const today = todayLima();
  const f = from ?? addDaysYmd(today, -(defaultDays - 1));
  const t = to ?? today;
  if (f > t) throw badRequest('La fecha inicial no puede ser mayor que la final', undefined, 'RANGO_INVALIDO');
  return { f, t, from: limaStartOfDay(f), to: limaEndOfDay(t) };
}

export const reportService = {
  async build(key: ReportKey, q: { from?: string; to?: string; productId?: number; days?: number }): Promise<Dataset> {
    switch (key) {
      case 'sales': {
        const r = range(q.from, q.to);
        const rows = (
          await db.raw(
            `SELECT s.number, s.completed_at, s.status, u.name AS seller, COALESCE(c.name, 'Consumidor final') AS customer,
                    s.payment_method, s.subtotal, s.igv, s.discount, s.total, s.service_seconds
               FROM sales s JOIN users u ON u.id = s.seller_id LEFT JOIN customers c ON c.id = s.customer_id
              WHERE s.completed_at BETWEEN ? AND ? ORDER BY s.completed_at DESC, s.id DESC`,
            [r.from, r.to],
          )
        ).rows.map((x: any) => ({
          ...x,
          number: `NV-${String(x.number).padStart(6, '0')}`,
          status: x.status === 'VOIDED' ? 'Anulada' : 'Completada',
          paymentMethod: PAY[x.paymentMethod] ?? x.paymentMethod,
        }));
        const ok = rows.filter((x: any) => x.status === 'Completada');
        return {
          key,
          title: 'Reporte de ventas',
          subtitle: `Del ${r.f} al ${r.t} (zona horaria America/Lima). Importes en soles (S/), IGV 18 % incluido.`,
          columns: [
            { key: 'number', label: 'N.º', type: 'text', width: 70 },
            { key: 'completedAt', label: 'Fecha', type: 'datetime', width: 105 },
            { key: 'status', label: 'Estado', type: 'text', width: 65 },
            { key: 'seller', label: 'Vendedor', type: 'text', width: 90 },
            { key: 'customer', label: 'Cliente', type: 'text', width: 110 },
            { key: 'paymentMethod', label: 'Pago', type: 'text', width: 55 },
            { key: 'subtotal', label: 'Base', type: 'money', width: 55 },
            { key: 'igv', label: 'IGV', type: 'money', width: 50 },
            { key: 'discount', label: 'Dscto.', type: 'money', width: 50 },
            { key: 'total', label: 'Total', type: 'money', width: 55 },
            { key: 'serviceSeconds', label: 'Atención (s)', type: 'int', width: 55 },
          ],
          rows,
          totals: { number: `${ok.length} ventas`, subtotal: sum(ok, 'subtotal'), igv: sum(ok, 'igv'), discount: sum(ok, 'discount'), total: sum(ok, 'total') },
        };
      }

      case 'kardex': {
        const r = range(q.from, q.to);
        const params: any[] = [r.from, r.to];
        let extra = '';
        if (q.productId) {
          extra = 'AND m.product_id = ?';
          params.push(q.productId);
        }
        const rows = (
          await db.raw(
            `SELECT m.created_at, p.sku, p.name AS product, b.batch_number, m.type, m.quantity, m.unit_cost, m.reason, m.reference, u.name AS user_name
               FROM stock_movements m JOIN products p ON p.id = m.product_id
               LEFT JOIN batches b ON b.id = m.batch_id LEFT JOIN users u ON u.id = m.user_id
              WHERE m.created_at BETWEEN ? AND ? ${extra} ORDER BY m.created_at DESC, m.id DESC LIMIT 20000`,
            params,
          )
        ).rows.map((x: any) => ({ ...x, type: MOV[x.type] ?? x.type }));
        return {
          key,
          title: 'Kardex de inventario',
          subtitle: `Movimientos del ${r.f} al ${r.t}. Cantidad con signo: positiva = entrada, negativa = salida.`,
          columns: [
            { key: 'createdAt', label: 'Fecha', type: 'datetime', width: 105 },
            { key: 'sku', label: 'SKU', type: 'text', width: 60 },
            { key: 'product', label: 'Producto', type: 'text', width: 150 },
            { key: 'batchNumber', label: 'Lote', type: 'text', width: 60 },
            { key: 'type', label: 'Tipo', type: 'text', width: 85 },
            { key: 'quantity', label: 'Cant.', type: 'int', width: 40 },
            { key: 'unitCost', label: 'Costo', type: 'money', width: 45 },
            { key: 'reason', label: 'Motivo', type: 'text', width: 140 },
            { key: 'userName', label: 'Usuario', type: 'text', width: 70 },
          ],
          rows,
        };
      }

      case 'valued-inventory': {
        const today = todayLima();
        const rows = (
          await db.raw(
            `SELECT p.sku, p.name AS product, c.name AS category,
                    COALESCE(SUM(b.quantity), 0)::int AS units, p.purchase_price, p.sale_price,
                    COALESCE(SUM(b.quantity), 0) * p.purchase_price AS cost_value,
                    COALESCE(SUM(b.quantity), 0) * p.sale_price AS sale_value,
                    COALESCE(SUM(b.quantity) FILTER (WHERE b.expires_at < ?), 0)::int AS expired_units
               FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN batches b ON b.product_id = p.id
              WHERE p.active GROUP BY p.id, c.name ORDER BY cost_value DESC, p.name`,
            [today],
          )
        ).rows;
        return {
          key,
          title: 'Inventario valorizado',
          subtitle: `Existencias al ${today}. Valor a costo (precio de compra) y a precio de venta (IGV incluido).`,
          columns: [
            { key: 'sku', label: 'SKU', type: 'text', width: 60 },
            { key: 'product', label: 'Producto', type: 'text', width: 170 },
            { key: 'category', label: 'Categoría', type: 'text', width: 85 },
            { key: 'units', label: 'Unid.', type: 'int', width: 40 },
            { key: 'expiredUnits', label: 'Vencidas', type: 'int', width: 50 },
            { key: 'purchasePrice', label: 'P. compra', type: 'money', width: 55 },
            { key: 'salePrice', label: 'P. venta', type: 'money', width: 55 },
            { key: 'costValue', label: 'Valor costo', type: 'money', width: 65 },
            { key: 'saleValue', label: 'Valor venta', type: 'money', width: 65 },
          ],
          rows: rows.map((r: any) => ({ ...r, costValue: Number(r.costValue), saleValue: Number(r.saleValue) })),
          totals: { product: 'TOTAL', units: rows.reduce((s: number, r: any) => s + r.units, 0), costValue: sum(rows, 'costValue'), saleValue: sum(rows, 'saleValue') },
        };
      }

      case 'low-rotation': {
        const days = q.days ?? 60;
        const today = todayLima();
        const rows = (
          await db.raw(
            `SELECT p.sku, p.name AS product, c.name AS category,
                    COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.product_id = p.id), 0)::int AS units,
                    COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON s.id = si.sale_id
                               WHERE si.product_id = p.id AND s.status = 'COMPLETED' AND s.completed_at >= now() - (? || ' days')::interval), 0)::int AS sold,
                    (SELECT MAX(s.completed_at) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.product_id = p.id AND s.status = 'COMPLETED') AS last_sale,
                    p.purchase_price
               FROM products p JOIN categories c ON c.id = p.category_id
              WHERE p.active
              ORDER BY sold ASC, units DESC`,
            [String(days)],
          )
        ).rows
          .filter((r: any) => r.units > 0)
          .map((r: any) => ({ ...r, stockValue: Math.round(r.units * r.purchasePrice * 100) / 100 }));
        const low = rows.filter((r: any) => r.sold <= 2).slice(0, 300);
        return {
          key,
          title: 'Productos de baja rotación',
          subtitle: `Productos con existencias y 2 o menos unidades vendidas en los últimos ${days} días (al ${today}).`,
          columns: [
            { key: 'sku', label: 'SKU', type: 'text', width: 60 },
            { key: 'product', label: 'Producto', type: 'text', width: 170 },
            { key: 'category', label: 'Categoría', type: 'text', width: 90 },
            { key: 'units', label: 'Stock', type: 'int', width: 40 },
            { key: 'sold', label: `Vendidas ${days} d`, type: 'int', width: 60 },
            { key: 'lastSale', label: 'Última venta', type: 'datetime', width: 105 },
            { key: 'stockValue', label: 'Valor stock', type: 'money', width: 60 },
          ],
          rows: low,
          totals: { product: 'TOTAL inmovilizado', units: low.reduce((s: number, r: any) => s + r.units, 0), stockValue: sum(low, 'stockValue') },
        };
      }

      case 'expirations': {
        const days = q.days ?? 90;
        const today = todayLima();
        const horizon = addDaysYmd(today, days);
        const rows = (
          await db.raw(
            `SELECT p.sku, p.name AS product, b.batch_number, b.expires_at, (b.expires_at - ?::date)::int AS days_left,
                    b.quantity, b.quantity * p.purchase_price AS cost_value
               FROM batches b JOIN products p ON p.id = b.product_id
              WHERE b.quantity > 0 AND b.expires_at <= ? ORDER BY b.expires_at, p.name`,
            [today, horizon],
          )
        ).rows.map((r: any) => ({ ...r, costValue: Number(r.costValue), status: r.daysLeft < 0 ? 'VENCIDO' : r.daysLeft <= 30 ? 'Vence ≤ 30 d' : r.daysLeft <= 60 ? 'Vence ≤ 60 d' : 'Vence ≤ 90 d' }));
        return {
          key,
          title: 'Vencimientos',
          subtitle: `Lotes vencidos y por vencer en los próximos ${days} días (al ${today}).`,
          columns: [
            { key: 'sku', label: 'SKU', type: 'text', width: 60 },
            { key: 'product', label: 'Producto', type: 'text', width: 160 },
            { key: 'batchNumber', label: 'Lote', type: 'text', width: 65 },
            { key: 'expiresAt', label: 'Vence', type: 'date', width: 65 },
            { key: 'daysLeft', label: 'Días', type: 'int', width: 40 },
            { key: 'status', label: 'Estado', type: 'text', width: 75 },
            { key: 'quantity', label: 'Cant.', type: 'int', width: 40 },
            { key: 'costValue', label: 'Valor costo', type: 'money', width: 60 },
          ],
          rows,
          totals: { product: 'TOTAL', quantity: rows.reduce((s: number, r: any) => s + r.quantity, 0), costValue: sum(rows, 'costValue') },
        };
      }
    }
  },
};
