import { APP_TZ } from '../config/env';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha (YYYY-MM-DD) en la zona horaria America/Lima. */
export function limaDate(d: Date = new Date()): string {
  return fmt.format(d);
}

export const todayLima = (): string => limaDate(new Date());

/** Lima es UTC-5 todo el año (sin horario de verano). */
export function limaStartOfDay(ymd: string): Date {
  return new Date(`${ymd}T00:00:00-05:00`);
}

export function limaEndOfDay(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999-05:00`);
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Días enteros desde `from` hasta `to` (ambos YYYY-MM-DD). */
export function diffDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Primer día de la semana (lunes) para una fecha YYYY-MM-DD. */
export function startOfWeekYmd(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  return addDaysYmd(ymd, -dow);
}

export const startOfMonthYmd = (ymd: string): string => `${ymd.slice(0, 8)}01`;

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
