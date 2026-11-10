import knexLib from 'knex';
import path from 'node:path';

// Aplica las migraciones una sola vez sobre la BD de pruebas.
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://novasalud:novasalud_dev@localhost:5432/novasalud_test';
  const dbName = new URL(url).pathname.replace('/', '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Los tests de integración exigen una BD cuyo nombre termine en "_test" (recibido: "${dbName}")`);
  }
  const k = knexLib({
    client: 'pg',
    connection: url,
    migrations: { directory: path.resolve(__dirname, '../migrations'), loadExtensions: ['.ts'] },
  });
  await k.migrate.latest();
  await k.destroy();
}
