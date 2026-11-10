import type { Request, Response } from 'express';
import { auditReq } from '../services/auditService';
import { dashboardService } from '../services/dashboardService';
import { exportService } from '../services/exportService';
import { reportService, ReportKey } from '../services/reportService';
import { todayLima } from '../utils/dates';

export const reportController = {
  async dashboard(_req: Request, res: Response) {
    res.json({ data: await dashboardService.summary() });
  },

  async indicators(req: Request, res: Response) {
    res.json({ data: await dashboardService.indicators((req.query as any).days) });
  },

  async report(req: Request, res: Response) {
    const key = req.params.key as ReportKey;
    const q = req.query as Record<string, any>;
    const ds = await reportService.build(key, q);
    const file = `${key}-${todayLima()}`;

    if (q.format === 'csv') {
      await auditReq(req, 'REPORTE_EXPORTADO', 'reports', key, { formato: 'csv' });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${file}.csv"`);
      return void res.send(exportService.csv(ds));
    }
    if (q.format === 'xlsx') {
      await auditReq(req, 'REPORTE_EXPORTADO', 'reports', key, { formato: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${file}.xlsx"`);
      return void res.send(await exportService.xlsx(ds));
    }
    if (q.format === 'pdf') {
      await auditReq(req, 'REPORTE_EXPORTADO', 'reports', key, { formato: 'pdf' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${file}.pdf"`);
      return void res.send(await exportService.pdf(ds));
    }
    // JSON: se limita el volumen enviado a la pantalla (la exportación sí incluye todo)
    const LIMIT = 500;
    res.json({ data: { ...ds, rows: ds.rows.slice(0, LIMIT), totalRows: ds.rows.length, truncated: ds.rows.length > LIMIT } });
  },
};
