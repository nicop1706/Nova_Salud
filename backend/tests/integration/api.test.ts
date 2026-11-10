import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { db } from '../../src/db/knex';
import { recalculateAlerts } from '../../src/services/alertService';
import { Fixture, makeBatch, makeProduct, resetDb, seedBasics } from '../helpers';

const app = createApp();
const X = { 'X-Requested-With': 'XMLHttpRequest' };
let f: Fixture;
let productId: number;

async function login(email: string, password = 'Clave1234') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set(X).send({ email, password });
  return { agent, res };
}

beforeAll(async () => {
  await resetDb();
});
beforeEach(async () => {
  await resetDb();
  f = await seedBasics();
  productId = await makeProduct(f, { sku: 'API-1', name: 'Ibuprofeno 400 mg', price: 11.8, cost: 4 });
  await makeBatch(productId, 'A', 200, 25);
});
afterAll(async () => {
  await recalculateAlerts().catch(() => undefined);
  await db.destroy();
});

describe('Autenticación', () => {
  it('inicia sesión con cookies httpOnly y sin exponer el hash de la contraseña', async () => {
    const { res } = await login('admin@test.pe');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'admin@test.pe', role: 'ADMIN' });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookies).toMatch(/ns_access=.*HttpOnly/i);
    expect(cookies).toMatch(/ns_refresh=.*HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Strict/i);
  });

  it('responde igual ante usuario inexistente y contraseña incorrecta', async () => {
    const a = await login('nadie@test.pe', 'Clave1234');
    const b = await login('admin@test.pe', 'incorrecta1');
    expect(a.res.status).toBe(401);
    expect(b.res.status).toBe(401);
    expect(a.res.body.error.message).toBe(b.res.body.error.message);
  });

  it('bloquea la cuenta tras 5 intentos fallidos', async () => {
    for (let i = 0; i < 5; i++) await login('vendedor@test.pe', 'mala-clave-1');
    const res = (await login('vendedor@test.pe')).res; // aun con la clave correcta
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('CUENTA_BLOQUEADA');
  });

  it('rota el refresh token y detecta su reutilización', async () => {
    const agent = request.agent(app);
    const first = await agent.post('/api/auth/login').set(X).send({ email: 'admin@test.pe', password: 'Clave1234' });
    const oldRefresh = (first.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('ns_refresh='))!.split(';')[0];

    expect((await agent.post('/api/auth/refresh').set(X)).status).toBe(200);
    // Reutilizar el token anterior (ya rotado) → sesión inválida
    const replay = await request(app).post('/api/auth/refresh').set(X).set('Cookie', oldRefresh);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_REUTILIZADO');
  });

  it('cierra sesión y revoca el acceso', async () => {
    const { agent } = await login('admin@test.pe');
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await agent.post('/api/auth/logout').set(X)).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});

describe('RBAC: permisos por rol', () => {
  it('rechaza peticiones sin sesión', async () => {
    expect((await request(app).get('/api/products')).status).toBe(401);
  });

  it('administrador: acceso completo', async () => {
    const { agent } = await login('admin@test.pe');
    for (const url of ['/api/users', '/api/audit', '/api/reports/dashboard', '/api/reports/indicators', '/api/products', '/api/suppliers', '/api/sales']) {
      expect((await agent.get(url)).status, url).toBe(200);
    }
  });

  it('vendedor: POS, clientes y consulta de stock; sin precio de compra; nada de administración', async () => {
    const { agent } = await login('vendedor@test.pe');
    const list = await agent.get('/api/products/search').query({ q: 'ibup' });
    expect(list.status).toBe(200);
    expect(list.body.data[0]).not.toHaveProperty('purchasePrice');
    expect((await agent.get('/api/customers')).status).toBe(200);
    expect((await agent.get('/api/sales')).status).toBe(200);
    for (const url of ['/api/users', '/api/audit', '/api/suppliers', '/api/inventory/kardex', '/api/inventory/batches', '/api/reports/dashboard', '/api/reports/sales', '/api/alerts/replenishment']) {
      expect((await agent.get(url)).status, url).toBe(403);
    }
    const create = await agent.post('/api/products').set(X).send({ sku: 'NEW', name: 'Nuevo', categoryId: f.categoryId, purchasePrice: 1, salePrice: 2 });
    expect(create.status).toBe(403);
  });

  it('almacenero: productos, lotes, ingresos, ajustes y proveedores; sin ventas ni usuarios', async () => {
    const { agent } = await login('almacen@test.pe');
    expect((await agent.get('/api/suppliers')).status).toBe(200);
    expect((await agent.get('/api/inventory/batches')).status).toBe(200);
    expect((await agent.get(`/api/products/${productId}`)).body.data).toHaveProperty('purchasePrice');
    for (const url of ['/api/users', '/api/sales', '/api/customers', '/api/reports/sales', '/api/reports/dashboard']) {
      expect((await agent.get(url)).status, url).toBe(403);
    }
    const sale = await agent.post('/api/sales').set(X).send({ items: [{ productId, quantity: 1 }], paymentMethod: 'CARD' });
    expect(sale.status).toBe(403);
  });

  it('solo el administrador puede anular ventas', async () => {
    const { agent: seller } = await login('vendedor@test.pe');
    const created = await seller.post('/api/sales').set(X).send({ items: [{ productId, quantity: 2 }], paymentMethod: 'CARD' });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect((await seller.post(`/api/sales/${id}/void`).set(X).send({ reason: 'Quiero anular' })).status).toBe(403);
    const { agent: admin } = await login('admin@test.pe');
    expect((await admin.post(`/api/sales/${id}/void`).set(X).send({ reason: 'Error de registro' })).status).toBe(200);
  });
});

describe('Seguridad HTTP', () => {
  it('exige la cabecera anti-CSRF en peticiones que modifican datos', async () => {
    const { agent } = await login('admin@test.pe');
    const res = await agent.post('/api/categories').send({ name: 'Sin cabecera' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
  });

  it('envía cabeceras de seguridad (Helmet) y oculta X-Powered-By', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('CORS: solo permite el origen configurado', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:8080');
    const bad = await request(app).get('/api/health').set('Origin', 'https://sitio-malicioso.example');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:8080');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('valida entradas con Zod y no filtra detalles internos en errores', async () => {
    const { agent } = await login('admin@test.pe');
    const res = await agent.post('/api/products').set(X).send({ sku: '', name: '', categoryId: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDACION');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    const nf = await agent.get('/api/ruta-inexistente');
    expect(nf.status).toBe(404);
    expect(JSON.stringify(nf.body)).not.toMatch(/stack|node_modules/);
  });

  it('resiste inyección SQL en la búsqueda (consultas parametrizadas)', async () => {
    const { agent } = await login('admin@test.pe');
    const res = await agent.get('/api/products/search').query({ q: "'; DROP TABLE products; --" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect((await db('products')).length).toBe(1);
  });

  it('el ticket es un comprobante interno, escapado y sin validez SUNAT', async () => {
    await db('products').where({ id: productId }).update({ name: '<script>alert(1)</script> Ibuprofeno' });
    const { agent } = await login('vendedor@test.pe');
    const s = await agent.post('/api/sales').set(X).send({ items: [{ productId, quantity: 1 }], paymentMethod: 'YAPE' });
    const t = await agent.get(`/api/sales/${s.body.data.id}/ticket`);
    expect(t.status).toBe(200);
    expect(t.text).toContain('no válido como comprobante electrónico SUNAT');
    expect(t.text).toContain('IGV (18 %)');
    expect(t.text).not.toContain('<script>alert(1)</script>');
  });
});

describe('Flujo POS completo por API', () => {
  it('busca, vende, descuenta stock por lote y refleja el cambio en las alertas', async () => {
    await db('products').where({ id: productId }).update({ minStock: 20 });
    const { agent } = await login('vendedor@test.pe');

    const found = await agent.get('/api/products/search').query({ q: 'ibuprofeno' });
    expect(found.body.data[0]).toMatchObject({ id: productId, availableStock: 25, stockStatus: 'OK' });

    const sale = await agent.post('/api/sales').set(X).send({ items: [{ productId, quantity: 10 }], paymentMethod: 'CASH', cashReceived: 200 });
    expect(sale.status).toBe(201);
    expect(sale.body.data).toMatchObject({ total: 118, subtotal: 100, igv: 18, changeGiven: 82 });

    const after = await agent.get(`/api/products/${productId}`);
    expect(after.body.data.availableStock).toBe(15);
    expect(after.body.data.stockStatus).toBe('LOW');

    await recalculateAlerts();
    const { agent: admin } = await login('admin@test.pe');
    const alerts = await admin.get('/api/alerts').query({ type: 'LOW_STOCK' });
    expect(alerts.body.data).toHaveLength(1);
    expect((await admin.get('/api/alerts/summary')).body.data.total).toBe(1);
  });
});
