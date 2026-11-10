// Formato para Perú: soles (S/), fechas en America/Lima, interfaz en español.

const TZ = 'America/Lima';
const moneyFmt = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat('es-PE');
const dateFmt = new Intl.DateTimeFormat('es-PE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('es-PE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const timeFmt = new Intl.DateTimeFormat('es-PE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const shortDayFmt = new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', day: '2-digit', month: 'short' });

export const money = (n: number | null | undefined): string => (n == null ? '—' : moneyFmt.format(n).replace(/\s/g, ' '));
export const num = (n: number | null | undefined): string => (n == null ? '—' : numFmt.format(n));
export const pct = (n: number | null | undefined, digits = 1): string => (n == null ? '—' : `${n.toFixed(digits).replace('.', ',')} %`);

export const fmtDate = (s: string | null | undefined): string => {
  if (!s) return '—';
  // Las columnas DATE llegan como YYYY-MM-DD: se formatean sin conversión de zona
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return dateFmt.format(new Date(s));
};
export const fmtDateTime = (s: string | null | undefined): string => (s ? dateTimeFmt.format(new Date(s)) : '—');
export const fmtTime = (s: string | null | undefined): string => (s ? timeFmt.format(new Date(s)) : '—');
export const shortDay = (ymd: string): string => shortDayFmt.format(new Date(`${ymd}T12:00:00Z`)).replace('.', '');

/** 135 → "2 min 15 s" */
export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}

/** Fecha de hoy (YYYY-MM-DD) en Lima */
export const todayLima = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administrador', SELLER: 'Vendedor', WAREHOUSE: 'Almacenero' };
export const PAYMENT_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', YAPE: 'Yape', PLIN: 'Plin' };
export const SALE_STATUS_LABEL: Record<string, string> = { COMPLETED: 'Completada', VOIDED: 'Anulada' };
export const ALERT_TYPE_LABEL: Record<string, string> = { OUT_OF_STOCK: 'Agotado', LOW_STOCK: 'Stock bajo', EXPIRING: 'Por vencer', EXPIRED: 'Vencido' };
export const PRIORITY_LABEL: Record<string, string> = { CRITICAL: 'Crítica', HIGH: 'Alta', MEDIUM: 'Media' };
export const MOVEMENT_LABEL: Record<string, string> = {
  PURCHASE: 'Ingreso por compra',
  SALE: 'Venta',
  ADJUSTMENT: 'Ajuste',
  WASTE: 'Merma',
  RETURN: 'Devolución',
  VOID: 'Anulación de venta',
};
export const DOC_LABEL: Record<string, string> = { DNI: 'DNI', RUC: 'RUC', CE: 'C.E.' };
