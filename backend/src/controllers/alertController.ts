import type { Request, Response } from 'express';
import { alertSummary, listAlerts, recalculateAlerts } from '../services/alertService';
import { auditReq } from '../services/auditService';
import { exportService } from '../services/exportService';
import { replenishmentService } from '../services/replenishmentService';
import { Dataset } from '../services/reportService';
import { settingsService } from '../services/settingsService';
import { pageParams } from '../utils/http';
import { todayLima } from '../utils/dates';

function replenishmentDataset(r: Awaited<ReturnType<typeof replenishmentService.build>>): Dataset {
  const rows = r.groups.flatMap((g) => g.lines.map((l) => ({ supplier: g.supplierName, ...l })));
  return {
    key: 'replenishment',
    title: 'Orden de reposición sugerida',
    subtitle: `Generada el ${todayLima()} · cobertura de ${r.coverageDays} días según la rotación de los últimos 30 días. Importes a precio de compra.`,
    columns: [
      { key: 'supplier', label: 'Proveedor', type: 'text', width: 110 },
      { key: 'sku', label: 'SKU', type: 'text', width: 55 },
      { key: 'name', label: 'Producto', type: 'text', width: 150 },
      { key: 'available', label: 'Stock', type: 'int', width: 35 },
      { key: 'minStock', label: 'Mín.', type: 'int', width: 35 },
      { key: 'sold30', label: 'Vend. 30 d', type: 'int', width: 50 },
      { key: 'suggestedQty', label: 'Sugerido', type: 'int', width: 50 },
      { key: 'unitCost', label: 'Costo unit.', type: 'money', width: 55 },
      { key: 'lineCost', label: 'Costo total', type: 'money', width: 60 },
    ],
    rows,
    totals: { supplier: 'TOTAL', suggestedQty: rows.reduce((s, x) => s + x.suggestedQty, 0), lineCost: r.totalCost },
  };
}

export const alertController = {
  async list(req: Request, res: Response) {
    const q = req.query as Record<string, any>;
    const { page, limit, offset } = pageParams(q, 50);
    const { rows, total } = await listAlerts({ status: q.status, type: q.type, priority: q.priority, limit, offset });
    res.json({ data: rows, meta: { page, limit, total } });
  },

  async summary(_req: Request, res: Response) {
    res.json({ data: await alertSummary() });
  },

  async recalculate(req: Request, res: Response) {
    const r = await recalculateAlerts();
    await auditReq(req, 'ALERTAS_RECALCULADAS', 'alerts', null, { abiertas: r.opened, resueltas: r.resolved });
    res.json({ data: { opened: r.opened, resolved: r.resolved, summary: r.summary } });
  },

  async getSettings(_req: Request, res: Response) {
    res.json({ data: { expiryDays: await settingsService.getExpiryDays() } });
  },

  async putSettings(req: Request, res: Response) {
    const days = await settingsService.setExpiryDays(req.body.expiryDays);
    await auditReq(req, 'CONFIG_ALERTAS', 'settings', 'expiry_alert_days', { days });
    await recalculateAlerts();
    res.json({ data: { expiryDays: days } });
  },

  async replenishment(req: Request, res: Response) {
    const q = req.query as Record<string, any>;
    const r = await replenishmentService.build(q.coverageDays);
    await auditReq(req, 'ORDEN_REPOSICION_GENERADA', 'alerts', null, { lineas: r.totalLines, costo: r.totalCost });
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="reposicion-${todayLima()}.csv"`);
      return void res.send(exportService.csv(replenishmentDataset(r)));
    }
    if (q.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="reposicion-${todayLima()}.pdf"`);
      return void res.send(await exportService.pdf(replenishmentDataset(r)));
    }
    res.json({ data: r });
  },
};
