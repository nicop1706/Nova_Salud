import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { db } from './db/knex';
import { runMigrations } from './db/migrate';
import { startAlertsJob } from './jobs/alertsJob';
import { userRepository } from './repositories/userRepository';
import { recalculateAlerts } from './services/alertService';
import { runSeed } from '../seeds/seed';

async function waitForDb(retries = 30): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      await db.raw('SELECT 1');
      return;
    } catch (err) {
      logger.warn({ intento: i }, 'Esperando a la base de datos...');
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main(): Promise<void> {
  await waitForDb();
  if (env.AUTO_MIGRATE) await runMigrations();
  if (env.AUTO_SEED && ((await userRepository.count()) === 0 || env.SEED_FORCE)) {
    logger.info('Base de datos vacía: cargando datos de demostración');
    await runSeed();
  }
  await recalculateAlerts();

  const app = createApp();
  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  server.listen(env.PORT, () => logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API Nova Salud lista'));
  const job = startAlertsJob();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Cerrando servidor');
    job.stop();
    server.close(async () => {
      await db.destroy();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'No se pudo iniciar la API');
  process.exit(1);
});
