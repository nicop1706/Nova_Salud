import { parse } from 'csv-parse/sync';
import type { Request } from 'express';
import { z } from 'zod';
import { db } from '../db/knex';
import { badRequest } from '../utils/errors';
import { auditReq } from './auditService';
import { stockChanged } from './stockEvents';

// Acepta encabezados en español o inglés.
const ALIASES: Record<string, string> = {
  sku: 'sku', codigo: 'sku', 'código': 'sku',
  barcode: 'barcode', codigo_barras: 'barcode', 'código_de_barras': 'barcode', codigobarras: 'barcode',
  name: 'name', nombre: 'name', nombre_comercial: 'name',
  active_ingredient: 'activeIngredient', principio_activo: 'activeIngredient', activeingredient: 'activeIngredient',
  laboratory: 'laboratory', laboratorio: 'laboratory',
  presentation: 'presentation', presentacion: 'presentation', 'presentación': 'presentation',
  category: 'category', categoria: 'category', 'categoría': 'category',
  supplier: 'supplier', proveedor: 'supplier',
  purchase_price: 'purchasePrice', precio_compra: 'purchasePrice', purchaseprice: 'purchasePrice',
  sale_price: 'salePrice', precio_venta: 'salePrice', saleprice: 'salePrice',
  min_stock: 'minStock', stock_minimo: 'minStock', 'stock_mínimo': 'minStock', minstock: 'minStock',
  requires_prescription: 'requiresPrescription', requiere_receta: 'requiresPrescription', requiresprescription: 'requiresPrescription',
};

const norm = (h: string) => h.replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, '_');
const truthy = (v: unknown) => ['si', 'sí', 'true', '1', 'yes', 'y', 's'].includes(String(v ?? '').trim().toLowerCase());
const num = z.preprocess((v) => (typeof v === 'string' ? v.replace(',', '.').trim() : v), z.coerce.number().min(0).max(99999.99));

const rowSchema = z.object({
  sku: z.string().trim().min(1, 'SKU obligatorio').max(40).transform((s) => s.toUpperCase()),
  barcode: z.string().trim().max(40).optional().transform((s) => s || null),
  name: z.string().trim().min(1, 'Nombre obligatorio').max(150),
  activeIngredient: z.string().trim().max(150).optional().transform((s) => s || null),
  laboratory: z.string().trim().max(100).optional().transform((s) => s || null),
  presentation: z.string().trim().max(100).optional().transform((s) => s || null),
  category: z.string().trim().min(1, 'Categoría obligatoria').max(80),
  supplier: z.string().trim().max(120).optional().transform((s) => s || null),
  purchasePrice: num,
  salePrice: num,
  minStock: z.preprocess((v) => (v === '' || v == null ? 0 : v), z.coerce.number().int().min(0).max(100000)),
  requiresPrescription: z.any().transform(truthy),
});

export interface ImportResult {
  dryRun: boolean;
  totalRows: number;
  created: number;
  updated: number;
  errors: Array<{ row: number; message: string }>;
}

export const importService = {
  /** Importación todo-o-nada: si alguna fila es inválida no se guarda nada y se devuelve el detalle de errores. */
  async importProducts(req: Request, csv: string, dryRun: boolean): Promise<ImportResult> {
    let records: Record<string, string>[];
    try {
      const firstLine = csv.split(/\r?\n/, 1)[0] ?? '';
      const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
      records = parse(csv, {
        columns: (hdr: string[]) => hdr.map((h) => ALIASES[norm(h)] ?? norm(h)),
        skip_empty_lines: true,
        trim: true,
        bom: true,
        delimiter,
        relax_column_count: true,
      });
    } catch (e) {
      throw badRequest(`No se pudo leer el CSV: ${(e as Error).message}`, undefined, 'CSV_INVALIDO');
    }
    if (!records.length) throw badRequest('El CSV no tiene filas de datos', undefined, 'CSV_VACIO');
    if (records.length > 5000) throw badRequest('Máximo 5000 filas por importación', undefined, 'CSV_GRANDE');

    const errors: ImportResult['errors'] = [];
    const parsed: Array<z.infer<typeof rowSchema> & { _row: number }> = [];
    const seenSku = new Set<string>();
    const seenBar = new Set<string>();
    records.forEach((rec, i) => {
      const rowNo = i + 2;
      const r = rowSchema.safeParse(rec);
      if (!r.success) {
        errors.push({ row: rowNo, message: r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
        return;
      }
      if (seenSku.has(r.data.sku)) errors.push({ row: rowNo, message: `SKU repetido en el archivo: ${r.data.sku}` });
      if (r.data.barcode && seenBar.has(r.data.barcode)) errors.push({ row: rowNo, message: `Código de barras repetido: ${r.data.barcode}` });
      seenSku.add(r.data.sku);
      if (r.data.barcode) seenBar.add(r.data.barcode);
      parsed.push({ ...r.data, _row: rowNo });
    });

    const existing = new Map<string, number>((await db('products').whereIn('sku', parsed.map((p) => p.sku)).select('id', 'sku')).map((p: any) => [p.sku, p.id]));
    const barOwners = parsed.filter((p) => p.barcode).length
      ? await db('products').whereIn('barcode', parsed.filter((p) => p.barcode).map((p) => p.barcode as string)).select('id', 'sku', 'barcode')
      : [];
    for (const p of parsed) {
      const owner = barOwners.find((b: any) => b.barcode === p.barcode);
      if (owner && owner.sku !== p.sku) errors.push({ row: p._row, message: `El código de barras ${p.barcode} ya pertenece al SKU ${owner.sku}` });
      if (p.salePrice < p.purchasePrice) errors.push({ row: p._row, message: 'El precio de venta es menor al precio de compra' });
    }

    const result: ImportResult = { dryRun, totalRows: records.length, created: 0, updated: 0, errors: errors.sort((a, b) => a.row - b.row) };
    if (errors.length) return result;
    if (dryRun) {
      result.created = parsed.filter((p) => !existing.has(p.sku)).length;
      result.updated = parsed.length - result.created;
      return result;
    }

    const touched: number[] = [];
    await db.transaction(async (trx) => {
      const catCache = new Map<string, number>();
      const supCache = new Map<string, number>();
      const getId = async (table: 'categories' | 'suppliers', name: string, cache: Map<string, number>) => {
        const key = name.toLowerCase();
        if (cache.has(key)) return cache.get(key)!;
        let row = await trx(table).whereRaw('lower(name) = ?', [key]).first('id');
        if (!row) [row] = await trx(table).insert({ name }).returning('id');
        cache.set(key, row.id);
        return row.id as number;
      };
      for (const p of parsed) {
        const data = {
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          activeIngredient: p.activeIngredient,
          laboratory: p.laboratory,
          presentation: p.presentation,
          categoryId: await getId('categories', p.category, catCache),
          supplierId: p.supplier ? await getId('suppliers', p.supplier, supCache) : null,
          purchasePrice: p.purchasePrice,
          salePrice: p.salePrice,
          minStock: p.minStock,
          requiresPrescription: p.requiresPrescription,
        };
        const id = existing.get(p.sku);
        if (id) {
          await trx('products').where({ id }).update({ ...data, updatedAt: new Date() });
          result.updated += 1;
          touched.push(id);
        } else {
          const [row] = await trx('products').insert(data).returning('id');
          result.created += 1;
          touched.push(row.id);
        }
      }
    });
    await auditReq(req, 'PRODUCTOS_IMPORTADOS', 'products', null, { creados: result.created, actualizados: result.updated });
    stockChanged(touched);
    return result;
  },
};
