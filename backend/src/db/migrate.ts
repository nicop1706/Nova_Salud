import { db } from './knex';
import { logger } from '../config/logger';

export async function runMigrations(): Promise<void> {
  const [batchNo, log] = await db.migrate.latest();
  if (log.length) logger.info({ batchNo, migrations: log }, 'Migraciones aplicadas');
  else logger.info('Base de datos al día (sin migraciones pendientes)');
}

if (require.main === module) {
  runMigrations()
    .then(() => db.destroy())
    .catch(async (err) => {
      logger.error({ err }, 'Fallo en migraciones');
      await db.destroy();
      process.exit(1);
    });
}
