import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .enum(['true', 'false'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: bool(false),

  CORS_ORIGINS: z.string().default('http://localhost:8080'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  STORE_NAME: z.string().default('Nova Salud'),
  STORE_RUC: z.string().default('20000000000'),
  STORE_ADDRESS: z.string().default('Av. Comercial 123, Lima, Perú'),
  STORE_PHONE: z.string().default('(01) 000-0000'),

  IGV_RATE: z.coerce.number().min(0).max(1).default(0.18),
  MAX_SELLER_DISCOUNT_PCT: z.coerce.number().min(0).max(100).default(5),
  EXPIRY_ALERT_DAYS: z.string().default('30,60,90'),
  ALERT_CRON: z.string().default('0 * * * *'),

  // Contraseñas de las cuentas de demostración (CÁMBIALAS en cualquier entorno real)
  SEED_ADMIN_PASSWORD: z.string().min(8).default('Admin#2026'),
  SEED_SELLER_PASSWORD: z.string().min(8).default('Vendedor#2026'),
  SEED_WAREHOUSE_PASSWORD: z.string().min(8).default('Almacen#2026'),

  AUTO_MIGRATE: bool(true),
  AUTO_SEED: bool(true),
  SEED_FORCE: bool(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Variables de entorno inválidas:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const APP_TZ = 'America/Lima';
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
export const defaultExpiryDays = env.EXPIRY_ALERT_DAYS.split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => a - b);
