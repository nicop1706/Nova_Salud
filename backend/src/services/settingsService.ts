import { db, Db } from '../db/knex';
import { defaultExpiryDays } from '../config/env';

const EXPIRY_KEY = 'expiry_alert_days';

export const settingsService = {
  /** Umbrales de alerta de vencimiento (días), p. ej. [30, 60, 90]. Configurables por el administrador. */
  async getExpiryDays(conn: Db = db): Promise<number[]> {
    const row = await conn('settings').where({ key: EXPIRY_KEY }).first();
    const v = row?.value;
    if (Array.isArray(v) && v.length && v.every((n) => Number.isInteger(n) && n > 0)) {
      return [...v].sort((a, b) => a - b);
    }
    return defaultExpiryDays.length ? defaultExpiryDays : [30, 60, 90];
  },

  async setExpiryDays(days: number[], conn: Db = db): Promise<number[]> {
    const clean = [...new Set(days)].sort((a, b) => a - b);
    await conn('settings')
      .insert({ key: EXPIRY_KEY, value: JSON.stringify(clean) })
      .onConflict('key')
      .merge();
    return clean;
  },
};
