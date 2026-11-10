import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { corsOrigins, env, isTest } from './config/env';
import { logger } from './config/logger';
import { buildOpenApi } from './docs/openapi';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { apiLimiter, csrfGuard } from './middlewares/security';
import { apiRouter } from './routes';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.use(
    cors({
      origin(origin, cb) {
        // Sin cabecera Origin (curl, mismo origen, healthchecks) → permitido; con Origin, solo la lista blanca.
        if (!origin || corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-Requested-With', 'Authorization'],
      maxAge: 600,
    }),
  );

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url === '/api/health' || req.url === '/api/events' },
        customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
        serializers: {
          req: (req) => ({ id: req.id, method: req.method, url: String(req.url).split('?')[0], ip: req.remoteAddress }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      }),
    );
  }

  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser());

  // Swagger UI (se monta antes del CSRF/límites; su CSP propia permite sus scripts)
  app.use(
    '/api/docs',
    helmet.contentSecurityPolicy({
      directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'] },
    }),
    swaggerUi.serve,
    swaggerUi.setup(buildOpenApi() as any, { customSiteTitle: 'Nova Salud API', swaggerOptions: { requestInterceptor: (r: any) => { r.headers['X-Requested-With'] = 'XMLHttpRequest'; return r; } } }),
  );
  app.get('/api/openapi.json', (_req, res) => void res.json(buildOpenApi()));

  app.use('/api', apiLimiter, csrfGuard, apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
