import { db } from '../db/knex';
import { addDaysYmd, limaStartOfDay, startOfMonthYmd, startOfWeekYmd, todayLima } from '../utils/dates';
import { alertSummary } from './alertService';
import { settingsService } from './settingsService';

const LIMA_DAY = "(completed_at AT TIME ZONE 'America/Lima')::date";

async function salesBetween(from: Date, to?: Date) {
  const q = db('sales').where({ status: 'COMPLETED' }).where('completedAt', '>=', from);
  if (to) q.where('completedAt', '<', to);
  const [r] = await q.select(db.raw('COUNT(*)::int AS n'), db.raw('COALESCE(SUM(total),0) AS total'));
  return { count: r.n as number, total: Number(r.total) };
}

export const dashboardService = {
  async summary() {
    const today = todayLima();
    const [day, week, month] = await Promise.all([
      salesBetween(limaStartOfDay(today)),
      salesBetween(limaStartOfDay(startOfWeekYmd(today))),
      salesBetween(limaStartOfDay(startOfMonthYmd(today))),
    ]);
    const from30 = limaStartOfDay(addDaysYmd(today, -29));

    const [series, top, avgService, critical, expiring, alerts, expiryDays, payments] = await Promise.all([
      db.raw(
        `SELECT ${LIMA_DAY}::text AS day, COUNT(*)::int AS sales, COALESCE(SUM(total),0) AS total
           FROM sales WHERE status = 'COMPLETED' AND completed_at >= ? GROUP BY 1 ORDER BY 1`,
        [from30],
      ),
      db.raw(
        `SELECT p.id, p.name, SUM(si.quantity)::int AS units, COALESCE(SUM(si.line_total),0) AS revenue
           FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
          WHERE s.status = 'COMPLETED' AND s.completed_at >= ?
          GROUP BY p.id ORDER BY units DESC LIMIT 8`,
        [from30],
      ),
      db('sales').where({ status: 'COMPLETED' }).where('completedAt', '>=', from30).whereNotNull('serviceSeconds').avg({ avg: 'serviceSeconds' }),
      db('alerts as a')
        .join('products as p', 'p.id', 'a.productId')
        .where('a.status', 'OPEN')
        .whereIn('a.type', ['OUT_OF_STOCK', 'LOW_STOCK'])
        .select('a.id', 'a.type', 'a.priority', 'p.id as productId', 'p.name', 'p.minStock', db.raw("(a.data->>'available')::int AS available"))
        .orderByRaw("CASE a.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END")
        .orderBy('p.name')
        .limit(8),
      db('alerts as a')
        .join('products as p', 'p.id', 'a.productId')
        .join('batches as b', 'b.id', 'a.batchId')
        .where('a.status', 'OPEN')
        .whereIn('a.type', ['EXPIRING', 'EXPIRED'])
        .select('a.id', 'a.type', 'a.priority', 'p.name', 'b.batchNumber', 'b.expiresAt', 'b.quantity')
        .orderBy('b.expiresAt')
        .limit(8),
      alertSummary(),
      settingsService.getExpiryDays(),
      db('sales').where({ status: 'COMPLETED' }).where('completedAt', '>=', limaStartOfDay(startOfMonthYmd(today))).select('paymentMethod').count({ n: '*' }).sum({ total: 'total' }).groupBy('paymentMethod'),
    ]);

    // Completar los 30 días (días sin ventas = 0)
    const map = new Map<string, { sales: number; total: number }>((series.rows as any[]).map((r) => [r.day, { sales: r.sales, total: Number(r.total) }]));
    const daily = Array.from({ length: 30 }, (_, i) => {
      const d = addDaysYmd(today, -29 + i);
      return { day: d, sales: map.get(d)?.sales ?? 0, total: map.get(d)?.total ?? 0 };
    });

    return {
      today,
      sales: {
        day,
        week,
        month,
        avgTicketMonth: month.count ? Math.round((month.total / month.count) * 100) / 100 : 0,
        avgTicketDay: day.count ? Math.round((day.total / day.count) * 100) / 100 : 0,
      },
      avgServiceSeconds: avgService[0]?.avg != null ? Math.round(Number(avgService[0].avg)) : null,
      daily,
      topProducts: (top.rows as any[]).map((r) => ({ ...r, revenue: Number(r.revenue) })),
      criticalStock: critical,
      expiring,
      alerts,
      expiryDays,
      payments: (payments as any[]).map((p) => ({ method: p.paymentMethod, count: Number(p.n), total: Number(p.total) })),
    };
  },

  /** Pantalla "Indicadores": efectividad del sistema (últimos `days` días). */
  async indicators(days = 30) {
    const today = todayLima();
    const from = limaStartOfDay(addDaysYmd(today, -(days - 1)));

    const [sales, service, serviceDaily, stockouts, stockoutProducts, activeCount, outCount, counts, waste, rotation, topWaste] = await Promise.all([
      db('sales').where({ status: 'COMPLETED' }).where('completedAt', '>=', from).count({ n: '*' }),
      db('sales')
        .where({ status: 'COMPLETED' })
        .where('completedAt', '>=', from)
        .whereNotNull('serviceSeconds')
        .select(
          db.raw('COUNT(*)::int AS n'),
          db.raw('AVG(service_seconds) AS avg'),
          db.raw('percentile_cont(0.5) WITHIN GROUP (ORDER BY service_seconds) AS median'),
          db.raw('MAX(service_seconds) AS max'),
        ),
      db.raw(
        `SELECT ${LIMA_DAY}::text AS day, AVG(service_seconds) AS avg, COUNT(*)::int AS n
           FROM sales WHERE status='COMPLETED' AND service_seconds IS NOT NULL AND completed_at >= ? GROUP BY 1 ORDER BY 1`,
        [from],
      ),
      db('stockout_events').where('createdAt', '>=', from).select(db.raw('COUNT(*)::int AS events'), db.raw('COUNT(DISTINCT product_id)::int AS products')),
      db('stockout_events as e')
        .join('products as p', 'p.id', 'e.productId')
        .where('e.createdAt', '>=', from)
        .groupBy('p.id')
        .select('p.id', 'p.name', db.raw('COUNT(*)::int AS events'), db.raw('SUM(e.requested_qty - e.available_qty)::int AS missing_units'))
        .orderBy('events', 'desc')
        .limit(8),
      db('products').where({ active: true }).count({ n: '*' }),
      db.raw(
        `SELECT COUNT(*)::int AS n FROM products p
          WHERE p.active AND COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.product_id = p.id AND b.expires_at >= ?), 0) = 0`,
        [today],
      ),
      db.raw(
        `SELECT c.id, c.applied_at,
                COUNT(i.*) FILTER (WHERE i.counted_qty IS NOT NULL)::int AS counted,
                COUNT(i.*) FILTER (WHERE i.counted_qty IS NOT NULL AND i.counted_qty <> i.system_qty)::int AS with_diff,
                COALESCE(SUM(ABS(i.counted_qty - i.system_qty)) FILTER (WHERE i.counted_qty IS NOT NULL), 0)::int AS abs_units,
                COALESCE(SUM(i.system_qty) FILTER (WHERE i.counted_qty IS NOT NULL), 0)::int AS system_units,
                COALESCE(SUM((i.counted_qty - i.system_qty) * p.purchase_price) FILTER (WHERE i.counted_qty IS NOT NULL), 0) AS net_value,
                COALESCE(SUM(ABS(i.counted_qty - i.system_qty) * p.purchase_price) FILTER (WHERE i.counted_qty IS NOT NULL), 0) AS abs_value
           FROM stock_counts c
           JOIN stock_count_items i ON i.count_id = c.id
           JOIN products p ON p.id = i.product_id
          WHERE c.status = 'APPLIED'
          GROUP BY c.id ORDER BY c.applied_at DESC LIMIT 6`,
      ),
      db.raw(
        `SELECT COALESCE(SUM(-quantity),0)::int AS units, COALESCE(SUM(-quantity * COALESCE(unit_cost,0)),0) AS value
           FROM stock_movements WHERE type = 'WASTE' AND reason ILIKE 'Vencimiento%' AND created_at >= ?`,
        [from],
      ),
      db.raw(
        `SELECT
           COALESCE((SELECT SUM(si.quantity * si.unit_cost) FROM sale_items si JOIN sales s ON s.id = si.sale_id
                      WHERE s.status = 'COMPLETED' AND s.completed_at >= ?), 0) AS cogs,
           COALESCE((SELECT SUM(b.quantity * p.purchase_price) FROM batches b JOIN products p ON p.id = b.product_id), 0) AS inventory_value`,
        [from],
      ),
      db.raw(
        `SELECT p.name, SUM(-m.quantity)::int AS units, COALESCE(SUM(-m.quantity * COALESCE(m.unit_cost,0)),0) AS value
           FROM stock_movements m JOIN products p ON p.id = m.product_id
          WHERE m.type='WASTE' AND m.created_at >= ? GROUP BY p.id ORDER BY value DESC LIMIT 5`,
        [from],
      ),
    ]);

    const salesN = Number(sales[0].n);
    const events = stockouts[0].events as number;
    const active = Number(activeCount[0].n);
    const out = outCount.rows[0].n as number;
    const cogs = Number(rotation.rows[0].cogs);
    const invValue = Number(rotation.rows[0].inventoryValue);
    const turnover = invValue > 0 ? cogs / invValue : 0;

    const countRows = (counts.rows as any[]).map((c) => ({
      id: c.id,
      appliedAt: c.appliedAt,
      counted: c.counted,
      withDifference: c.withDiff,
      absUnits: c.absUnits,
      systemUnits: c.systemUnits,
      netValue: Number(c.netValue),
      absValue: Number(c.absValue),
      accuracyPct: c.counted ? Math.round(((c.counted - c.withDiff) / c.counted) * 1000) / 10 : null,
    }));

    return {
      days,
      service: {
        avgSeconds: service[0].avg != null ? Math.round(Number(service[0].avg)) : null,
        medianSeconds: service[0].median != null ? Math.round(Number(service[0].median)) : null,
        maxSeconds: service[0].max != null ? Number(service[0].max) : null,
        measuredSales: service[0].n as number,
        daily: (serviceDaily.rows as any[]).map((r) => ({ day: r.day, avgSeconds: Math.round(Number(r.avg)), sales: r.n })),
      },
      stockouts: {
        events,
        productsAffected: stockouts[0].products as number,
        salesWithoutStockoutPct: salesN + events > 0 ? Math.round((salesN / (salesN + events)) * 1000) / 10 : 100,
        currentOutOfStock: out,
        activeProducts: active,
        stockoutRatePct: active ? Math.round((out / active) * 1000) / 10 : 0,
        topProducts: (stockoutProducts as any[]).map((r) => ({ id: r.id, name: r.name, events: r.events, missingUnits: r.missingUnits })),
      },
      inventoryAccuracy: {
        counts: countRows,
        latest: countRows[0] ?? null,
      },
      expiryWaste: {
        units: waste.rows[0].units as number,
        value: Math.round(Number(waste.rows[0].value) * 100) / 100,
        top: (topWaste.rows as any[]).map((r) => ({ name: r.name, units: r.units, value: Math.round(Number(r.value) * 100) / 100 })),
      },
      rotation: {
        cogs: Math.round(cogs * 100) / 100,
        inventoryValue: Math.round(invValue * 100) / 100,
        turnover: Math.round(turnover * 100) / 100,
        annualized: Math.round(turnover * (365 / days) * 100) / 100,
        daysOfInventory: turnover > 0 ? Math.round(days / turnover) : null,
      },
      salesCount: salesN,
    };
  },
};
