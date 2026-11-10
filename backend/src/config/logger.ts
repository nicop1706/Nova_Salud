import pino from 'pino';
import { env, isProd } from './env';

// Logs estructurados (JSON). Se redactan credenciales, cookies y tokens.
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { app: 'nova-salud-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
      '*.currentPassword',
      '*.newPassword',
      '*.token',
      '*.refreshToken',
      'password',
      'newPassword',
      'currentPassword',
    ],
    censor: '[REDACTADO]',
  },
  ...(isProd || env.NODE_ENV === 'test'
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
});
