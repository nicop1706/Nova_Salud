import PDFDocument from 'pdfkit';
import { APP_TZ, env } from '../config/env';

const dtf = new Intl.DateTimeFormat('es-PE', { timeZone: APP_TZ, dateStyle: 'short', timeStyle: 'medium', hour12: false });
const money = (n: number) => `S/ ${Number(n).toFixed(2)}`;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const PAY: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', YAPE: 'Yape', PLIN: 'Plin' };

export const ticketNumber = (n: number) => `NV-${String(n).padStart(6, '0')}`;

/** Ticket interno en HTML (80 mm). NO es comprobante electrónico SUNAT. */
export function ticketHtml(sale: any): string {
  const rows = sale.items
    .map(
      (i: any) => `<tr><td colspan="3" class="n">${esc(i.name)}${i.presentation ? ` <small>(${esc(i.presentation)})</small>` : ''}</td></tr>
      <tr><td>${i.quantity} x ${Number(i.unitPrice).toFixed(2)}</td><td class="r">${Number(i.discount) > 0 ? `-${Number(i.discount).toFixed(2)}` : ''}</td><td class="r">${Number(i.lineTotal).toFixed(2)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${ticketNumber(sale.number)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
 body{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;width:302px;margin:8px auto;color:#000}
 h1{font-size:15px;text-align:center;margin:0}.c{text-align:center}.r{text-align:right}small{font-size:10px}
 table{width:100%;border-collapse:collapse}td{padding:1px 0;vertical-align:top}.n{font-weight:bold;padding-top:4px}
 hr{border:0;border-top:1px dashed #000;margin:6px 0}.tot td{font-size:13px;font-weight:bold}
 .void{border:2px solid #b91c1c;color:#b91c1c;text-align:center;font-weight:bold;padding:4px;margin:6px 0}
 .note{font-size:10px;text-align:center;margin-top:6px}
 @media print{@page{size:80mm auto;margin:2mm}body{margin:0;width:auto}.noprint{display:none}}
 .noprint{margin:10px 0;text-align:center}.noprint button{padding:6px 14px;font-size:13px}
</style></head><body>
<h1>${esc(env.STORE_NAME)}</h1>
<div class="c">RUC ${esc(env.STORE_RUC)}<br>${esc(env.STORE_ADDRESS)}<br>Tel. ${esc(env.STORE_PHONE)}</div><hr>
<div class="c"><b>NOTA DE VENTA ${ticketNumber(sale.number)}</b><br><small>Comprobante interno — no válido como comprobante electrónico SUNAT</small></div>
${sale.status === 'VOIDED' ? '<div class="void">VENTA ANULADA</div>' : ''}
<hr>
Fecha: ${esc(dtf.format(new Date(sale.completedAt)))}<br>
Cajero: ${esc(sale.sellerName)}<br>
Cliente: ${esc(sale.customerName ?? 'Consumidor final')}${sale.customerDoc ? ` (${esc(sale.customerDocType)} ${esc(sale.customerDoc)})` : ''}
<hr><table>${rows}</table><hr>
<table>
<tr><td>Op. gravada</td><td class="r">${money(sale.subtotal)}</td></tr>
<tr><td>IGV (${Math.round(env.IGV_RATE * 100)} %)</td><td class="r">${money(sale.igv)}</td></tr>
${Number(sale.discount) > 0 ? `<tr><td>Descuentos</td><td class="r">-${money(sale.discount)}</td></tr>` : ''}
<tr class="tot"><td>TOTAL</td><td class="r">${money(sale.total)}</td></tr>
<tr><td>Pago: ${esc(PAY[sale.paymentMethod] ?? sale.paymentMethod)}</td><td></td></tr>
${sale.paymentMethod === 'CASH' ? `<tr><td>Recibido</td><td class="r">${money(sale.cashReceived)}</td></tr><tr><td>Vuelto</td><td class="r">${money(sale.changeGiven)}</td></tr>` : ''}
</table><hr>
<div class="note">¡Gracias por su compra!<br>Conserve este documento. Para cambios presente este ticket.</div>
<div class="noprint"><button onclick="window.print()">Imprimir</button></div>
</body></html>`;
}

export function ticketPdf(sale: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [226, 420 + sale.items.length * 28], margin: 10 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const W = 206;
    const line = () => doc.moveDown(0.2).text('-'.repeat(44), { width: W, align: 'center' }).moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(12).text(env.STORE_NAME, { align: 'center' });
    doc.font('Helvetica').fontSize(7).text(`RUC ${env.STORE_RUC}\n${env.STORE_ADDRESS}\nTel. ${env.STORE_PHONE}`, { align: 'center' });
    line();
    doc.font('Helvetica-Bold').fontSize(9).text(`NOTA DE VENTA ${ticketNumber(sale.number)}`, { align: 'center' });
    doc.font('Helvetica').fontSize(6).text('Comprobante interno — no válido como comprobante electrónico SUNAT', { align: 'center' });
    if (sale.status === 'VOIDED') doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(10).text('VENTA ANULADA', { align: 'center' }).fillColor('#000');
    line();
    doc.font('Helvetica').fontSize(7).text(`Fecha: ${dtf.format(new Date(sale.completedAt))}\nCajero: ${sale.sellerName}\nCliente: ${sale.customerName ?? 'Consumidor final'}`);
    line();
    for (const i of sale.items) {
      doc.font('Helvetica-Bold').fontSize(7).text(i.name, { width: W });
      doc.font('Helvetica').text(`${i.quantity} x ${Number(i.unitPrice).toFixed(2)}`, { continued: true, width: W }).text(Number(i.lineTotal).toFixed(2), { align: 'right' });
    }
    line();
    const row = (l: string, v: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 9 : 7).text(l, { continued: true, width: W }).text(v, { align: 'right' });
    };
    row('Op. gravada', money(sale.subtotal));
    row(`IGV (${Math.round(env.IGV_RATE * 100)} %)`, money(sale.igv));
    if (Number(sale.discount) > 0) row('Descuentos', `-${money(sale.discount)}`);
    row('TOTAL', money(sale.total), true);
    row('Pago', PAY[sale.paymentMethod] ?? sale.paymentMethod);
    if (sale.paymentMethod === 'CASH') {
      row('Recibido', money(sale.cashReceived));
      row('Vuelto', money(sale.changeGiven));
    }
    doc.moveDown().font('Helvetica').fontSize(7).text('¡Gracias por su compra!', { align: 'center' });
    doc.end();
  });
}
