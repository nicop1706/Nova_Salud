import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { env, APP_TZ } from '../config/env';
import type { Dataset } from './reportService';

const dtf = new Intl.DateTimeFormat('es-PE', { timeZone: APP_TZ, dateStyle: 'short', timeStyle: 'short', hour12: false });

function fmt(v: unknown, type: string): string {
  if (v == null || v === '') return '';
  if (type === 'money') return Number(v).toFixed(2);
  if (type === 'datetime') return dtf.format(new Date(v as string | Date));
  if (type === 'date') return String(v).slice(0, 10);
  return String(v);
}

/** Neutraliza inyección de fórmulas en hojas de cálculo (=, +, -, @ al inicio de un texto). */
const safeCell = (s: string): string => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export const exportService = {
  csv(ds: Dataset): Buffer {
    const esc = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [ds.columns.map((c) => esc(c.label)).join(',')];
    for (const r of ds.rows) lines.push(ds.columns.map((c) => esc(c.type === 'text' ? safeCell(fmt(r[c.key], c.type)) : fmt(r[c.key], c.type))).join(','));
    if (ds.totals) lines.push(ds.columns.map((c) => esc(ds.totals![c.key] != null ? fmt(ds.totals![c.key], c.type === 'text' ? 'text' : c.type) : '')).join(','));
    return Buffer.from('﻿' + lines.join('\r\n'), 'utf8'); // BOM para que Excel lea las tildes
  },

  async xlsx(ds: Dataset): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = env.STORE_NAME;
    wb.created = new Date();
    const ws = wb.addWorksheet(ds.title.slice(0, 31));
    ws.addRow([ds.title]).font = { bold: true, size: 14 };
    ws.addRow([ds.subtitle]).font = { italic: true, color: { argb: 'FF555555' } };
    ws.addRow([]);
    const head = ws.addRow(ds.columns.map((c) => c.label));
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    });
    for (const r of ds.rows) {
      ws.addRow(
        ds.columns.map((c) => {
          const v = r[c.key];
          if (v == null) return '';
          if (c.type === 'money' || c.type === 'int') return Number(v);
          if (c.type === 'datetime') return fmt(v, c.type);
          if (c.type === 'date') return fmt(v, c.type);
          return safeCell(String(v));
        }),
      );
    }
    if (ds.totals) {
      const t = ws.addRow(ds.columns.map((c) => (ds.totals![c.key] != null ? ds.totals![c.key] : '')));
      t.font = { bold: true };
    }
    ds.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(10, Math.min(45, (c.width ?? 70) / 5));
      if (c.type === 'money') col.numFmt = '"S/" #,##0.00';
    });
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    return Buffer.from(await wb.xlsx.writeBuffer());
  },

  pdf(ds: Dataset): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const landscape = ds.columns.reduce((s, c) => s + (c.width ?? 70), 0) > 520;
      const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 32, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width - 64;
      const total = ds.columns.reduce((s, c) => s + (c.width ?? 70), 0);
      const widths = ds.columns.map((c) => ((c.width ?? 70) / total) * pageW);

      doc.fillColor('#0f766e').fontSize(15).font('Helvetica-Bold').text(`${env.STORE_NAME} — ${ds.title}`);
      doc.fillColor('#444').fontSize(8).font('Helvetica').text(ds.subtitle).moveDown(0.6);

      const rowH = 14;
      const drawRow = (cells: string[], opts: { bold?: boolean; head?: boolean; zebra?: boolean }) => {
        if (doc.y + rowH > doc.page.height - 48) {
          doc.addPage();
          drawRow(ds.columns.map((c) => c.label), { head: true });
        }
        const y = doc.y;
        let x = 32;
        if (opts.head) doc.rect(32, y - 2, pageW, rowH).fill('#0f766e');
        else if (opts.zebra) doc.rect(32, y - 2, pageW, rowH).fill('#f1f5f4');
        doc.fillColor(opts.head ? '#fff' : '#111').font(opts.bold || opts.head ? 'Helvetica-Bold' : 'Helvetica').fontSize(7);
        cells.forEach((txt, i) => {
          const right = ['money', 'int'].includes(ds.columns[i].type);
          doc.text(txt, x + 2, y, { width: widths[i] - 4, height: rowH - 2, align: right ? 'right' : 'left', lineBreak: false, ellipsis: true });
          x += widths[i];
        });
        doc.y = y + rowH;
      };

      drawRow(ds.columns.map((c) => c.label), { head: true });
      ds.rows.forEach((r, idx) => drawRow(ds.columns.map((c) => fmt(r[c.key], c.type)), { zebra: idx % 2 === 1 }));
      if (ds.totals) drawRow(ds.columns.map((c) => (ds.totals![c.key] != null ? fmt(ds.totals![c.key], c.type === 'text' ? 'text' : c.type) : '')), { bold: true });
      if (!ds.rows.length) doc.moveDown().fillColor('#666').fontSize(9).text('Sin datos para el periodo seleccionado.');

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor('#777').fontSize(7).text(`Generado el ${dtf.format(new Date())} · Documento interno, sin validez tributaria · Página ${i + 1} de ${range.count}`, 32, doc.page.height - 26, { width: pageW, align: 'center', lineBreak: false });
      }
      doc.end();
    });
  },
};
