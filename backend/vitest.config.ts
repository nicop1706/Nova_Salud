import { defineConfig } from 'vitest/config';

// Los tests de integración usan SIEMPRE una base de datos aparte (termina en "_test"):
// borran datos entre pruebas, así que jamás deben apuntar a la base real.
const testDbUrl = process.env.TEST_DATABASE_URL ?? 'postgresql://novasalud:novasalud_dev@localhost:5432/novasalud_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testDbUrl,
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef012345678',
      BCRYPT_ROUNDS: '4',
      COOKIE_SECURE: 'false',
      CORS_ORIGINS: 'http://localhost:8080',
    },
  },
});
