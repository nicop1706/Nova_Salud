// Especificación OpenAPI 3.0 de la API de Nova Salud (se sirve en /api/docs).
// Se construye con una tabla de endpoints para mantenerla corta y fácil de actualizar.

type Role = 'ADMIN' | 'SELLER' | 'WAREHOUSE';
interface Ep {
  m: 'get' | 'post' | 'put' | 'delete';
  p: string;
  tag: string;
  s: string;
  roles?: Role[] | 'public' | 'any';
  body?: string;
  q?: string[];
  status?: number;
}

const A: Role[] = ['ADMIN'];
const AW: Role[] = ['ADMIN', 'WAREHOUSE'];
const AS: Role[] = ['ADMIN', 'SELLER'];

const endpoints: Ep[] = [
  { m: 'get', p: '/health', tag: 'Sistema', s: 'Estado del servicio y de la base de datos', roles: 'public' },

  { m: 'post', p: '/auth/login', tag: 'Autenticación', s: 'Inicia sesión (access y refresh en cookies httpOnly)', roles: 'public', body: 'Login' },
  { m: 'post', p: '/auth/refresh', tag: 'Autenticación', s: 'Rota el refresh token y renueva el access token', roles: 'public' },
  { m: 'post', p: '/auth/logout', tag: 'Autenticación', s: 'Cierra la sesión', roles: 'public', status: 204 },
  { m: 'get', p: '/auth/me', tag: 'Autenticación', s: 'Usuario autenticado', roles: 'any' },
  { m: 'post', p: '/auth/change-password', tag: 'Autenticación', s: 'Cambia la contraseña propia', roles: 'any', body: 'ChangePassword', status: 204 },

  { m: 'get', p: '/users', tag: 'Usuarios', s: 'Lista usuarios', roles: A },
  { m: 'post', p: '/users', tag: 'Usuarios', s: 'Crea un usuario', roles: A, body: 'User', status: 201 },
  { m: 'put', p: '/users/{id}', tag: 'Usuarios', s: 'Actualiza nombre, rol o estado', roles: A },
  { m: 'post', p: '/users/{id}/reset-password', tag: 'Usuarios', s: 'Restablece la contraseña de un usuario', roles: A, status: 204 },
  { m: 'get', p: '/audit', tag: 'Auditoría', s: 'Registro de auditoría (quién hizo qué y cuándo)', roles: A, q: ['page', 'limit', 'userId', 'entity', 'action', 'from', 'to'] },

  { m: 'get', p: '/categories', tag: 'Catálogo', s: 'Lista categorías', roles: 'any' },
  { m: 'post', p: '/categories', tag: 'Catálogo', s: 'Crea una categoría', roles: AW, status: 201 },
  { m: 'put', p: '/categories/{id}', tag: 'Catálogo', s: 'Actualiza una categoría', roles: AW },
  { m: 'delete', p: '/categories/{id}', tag: 'Catálogo', s: 'Elimina una categoría sin productos', roles: AW, status: 204 },
  { m: 'get', p: '/suppliers', tag: 'Catálogo', s: 'Lista proveedores', roles: AW },
  { m: 'post', p: '/suppliers', tag: 'Catálogo', s: 'Crea un proveedor', roles: AW, status: 201 },
  { m: 'put', p: '/suppliers/{id}', tag: 'Catálogo', s: 'Actualiza un proveedor', roles: AW },
  { m: 'delete', p: '/suppliers/{id}', tag: 'Catálogo', s: 'Elimina un proveedor sin productos', roles: AW, status: 204 },

  { m: 'get', p: '/products', tag: 'Productos', s: 'Lista paginada con filtros y estado de stock', roles: 'any', q: ['q', 'categoryId', 'supplierId', 'status', 'stock', 'sort', 'dir', 'page', 'limit'] },
  { m: 'get', p: '/products/search', tag: 'Productos', s: 'Búsqueda instantánea (nombre, principio activo, SKU, código de barras)', roles: 'any', q: ['q', 'limit'] },
  { m: 'get', p: '/products/by-code/{code}', tag: 'Productos', s: 'Busca por código de barras o SKU exacto', roles: 'any' },
  { m: 'get', p: '/products/{id}', tag: 'Productos', s: 'Detalle con lotes', roles: 'any' },
  { m: 'post', p: '/products', tag: 'Productos', s: 'Crea un producto', roles: AW, body: 'Product', status: 201 },
  { m: 'put', p: '/products/{id}', tag: 'Productos', s: 'Actualiza un producto', roles: AW, body: 'Product' },
  { m: 'delete', p: '/products/{id}', tag: 'Productos', s: 'Desactiva un producto (conserva el historial)', roles: AW, status: 204 },
  { m: 'post', p: '/products/import', tag: 'Productos', s: 'Importación masiva desde CSV (todo o nada, con modo simulación)', roles: AW, body: 'Import' },

  { m: 'get', p: '/inventory/batches', tag: 'Inventario', s: 'Lotes con filtros de vencimiento', roles: AW, q: ['productId', 'status', 'days', 'page', 'limit'] },
  { m: 'get', p: '/inventory/kardex', tag: 'Inventario', s: 'Kardex con saldo acumulado por producto', roles: AW, q: ['productId', 'type', 'from', 'to', 'page', 'limit'] },
  { m: 'post', p: '/inventory/receive', tag: 'Inventario', s: 'Ingreso por compra (crea o suma a un lote)', roles: AW, body: 'Receive', status: 201 },
  { m: 'post', p: '/inventory/adjust', tag: 'Inventario', s: 'Ajuste manual con motivo obligatorio', roles: AW, body: 'Adjust' },
  { m: 'post', p: '/inventory/waste', tag: 'Inventario', s: 'Merma (vencimiento, deterioro, rotura)', roles: AW, body: 'Waste' },
  { m: 'post', p: '/inventory/waste-expired', tag: 'Inventario', s: 'Da de baja todos los lotes vencidos', roles: AW },
  { m: 'post', p: '/inventory/returns', tag: 'Inventario', s: 'Devolución de cliente o a proveedor', roles: AW },
  { m: 'get', p: '/inventory/counts', tag: 'Conteo físico', s: 'Lista tomas de inventario', roles: AW },
  { m: 'post', p: '/inventory/counts', tag: 'Conteo físico', s: 'Inicia una toma de inventario (congela el stock del sistema)', roles: AW, status: 201 },
  { m: 'get', p: '/inventory/counts/{id}', tag: 'Conteo físico', s: 'Detalle con diferencias', roles: AW },
  { m: 'put', p: '/inventory/counts/{id}', tag: 'Conteo físico', s: 'Guarda cantidades contadas', roles: AW },
  { m: 'post', p: '/inventory/counts/{id}/apply', tag: 'Conteo físico', s: 'Aplica las diferencias como ajustes de kardex', roles: AW },
  { m: 'delete', p: '/inventory/counts/{id}', tag: 'Conteo físico', s: 'Cancela el conteo', roles: AW, status: 204 },

  { m: 'get', p: '/alerts', tag: 'Alertas', s: 'Panel de alertas por prioridad', roles: 'any', q: ['status', 'type', 'priority', 'page', 'limit'] },
  { m: 'get', p: '/alerts/summary', tag: 'Alertas', s: 'Contadores para la barra superior', roles: 'any' },
  { m: 'post', p: '/alerts/recalculate', tag: 'Alertas', s: 'Fuerza el recálculo de alertas', roles: AW },
  { m: 'get', p: '/alerts/replenishment', tag: 'Alertas', s: 'Orden de reposición sugerida por proveedor (json, csv o pdf)', roles: AW, q: ['coverageDays', 'format'] },
  { m: 'get', p: '/alerts/settings', tag: 'Alertas', s: 'Umbrales de vencimiento (30/60/90 días)', roles: 'any' },
  { m: 'put', p: '/alerts/settings', tag: 'Alertas', s: 'Configura umbrales de vencimiento', roles: A },

  { m: 'post', p: '/sales', tag: 'Ventas', s: 'Registra una venta (transacción atómica, FEFO)', roles: AS, body: 'Sale', status: 201 },
  { m: 'post', p: '/sales/stockout', tag: 'Ventas', s: 'Registra un intento de venta sin stock (indicador de quiebres)', roles: AS, status: 204 },
  { m: 'get', p: '/sales', tag: 'Ventas', s: 'Lista ventas (el vendedor solo ve las propias)', roles: AS, q: ['from', 'to', 'status', 'paymentMethod', 'q', 'page', 'limit'] },
  { m: 'get', p: '/sales/{id}', tag: 'Ventas', s: 'Detalle de venta con lotes descontados', roles: AS },
  { m: 'get', p: '/sales/{id}/ticket', tag: 'Ventas', s: 'Ticket interno (HTML o PDF) — no es comprobante SUNAT', roles: AS, q: ['format'] },
  { m: 'post', p: '/sales/{id}/void', tag: 'Ventas', s: 'Anula la venta y revierte el stock (solo administrador)', roles: A, body: 'Void' },

  { m: 'get', p: '/customers', tag: 'Clientes', s: 'Lista clientes', roles: AS, q: ['q', 'page', 'limit'] },
  { m: 'get', p: '/customers/search', tag: 'Clientes', s: 'Búsqueda rápida (DNI/RUC/nombre)', roles: AS, q: ['q'] },
  { m: 'post', p: '/customers', tag: 'Clientes', s: 'Crea un cliente (alta rápida desde el POS)', roles: AS, body: 'Customer', status: 201 },
  { m: 'get', p: '/customers/{id}', tag: 'Clientes', s: 'Cliente con historial de compras y frecuentes', roles: AS },
  { m: 'get', p: '/customers/{id}/frequent', tag: 'Clientes', s: 'Productos frecuentes del cliente', roles: AS },
  { m: 'put', p: '/customers/{id}', tag: 'Clientes', s: 'Actualiza un cliente', roles: AS, body: 'Customer' },
  { m: 'delete', p: '/customers/{id}', tag: 'Clientes', s: 'Desactiva un cliente', roles: AS, status: 204 },

  { m: 'get', p: '/reports/dashboard', tag: 'Reportes', s: 'Datos del dashboard', roles: A },
  { m: 'get', p: '/reports/indicators', tag: 'Reportes', s: 'Indicadores de efectividad del sistema', roles: A, q: ['days'] },
  { m: 'get', p: '/reports/{key}', tag: 'Reportes', s: 'Reporte (sales, kardex, valued-inventory, low-rotation, expirations) en json, csv, xlsx o pdf', roles: AW, q: ['from', 'to', 'productId', 'days', 'format'] },

  { m: 'get', p: '/events', tag: 'Tiempo real', s: 'Server-Sent Events: stock, alertas y ventas', roles: 'any' },
];

const schemas: Record<string, object> = {
  Login: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', example: 'admin@novasalud.pe' }, password: { type: 'string' } } },
  ChangePassword: { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } } },
  User: { type: 'object', required: ['email', 'name', 'role', 'password'], properties: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', enum: ['ADMIN', 'SELLER', 'WAREHOUSE'] }, password: { type: 'string' } } },
  Product: {
    type: 'object',
    required: ['sku', 'name', 'categoryId', 'purchasePrice', 'salePrice'],
    properties: {
      sku: { type: 'string' }, barcode: { type: 'string' }, name: { type: 'string' }, activeIngredient: { type: 'string' }, laboratory: { type: 'string' },
      presentation: { type: 'string' }, categoryId: { type: 'integer' }, supplierId: { type: 'integer', nullable: true },
      purchasePrice: { type: 'number' }, salePrice: { type: 'number', description: 'Precio de venta con IGV incluido' },
      minStock: { type: 'integer' }, requiresPrescription: { type: 'boolean' }, active: { type: 'boolean' },
    },
  },
  Import: { type: 'object', required: ['csv'], properties: { csv: { type: 'string', description: 'Contenido del CSV' }, dryRun: { type: 'boolean' } } },
  Receive: { type: 'object', required: ['productId', 'batchNumber', 'expiresAt', 'quantity'], properties: { productId: { type: 'integer' }, batchNumber: { type: 'string' }, expiresAt: { type: 'string', format: 'date' }, quantity: { type: 'integer' }, unitCost: { type: 'number' }, note: { type: 'string' } } },
  Adjust: { type: 'object', required: ['batchId', 'delta', 'reason'], properties: { batchId: { type: 'integer' }, delta: { type: 'integer', description: 'Positivo suma, negativo resta' }, reason: { type: 'string', minLength: 5 } } },
  Waste: { type: 'object', required: ['batchId', 'quantity', 'reason'], properties: { batchId: { type: 'integer' }, quantity: { type: 'integer' }, reason: { type: 'string', enum: ['VENCIMIENTO', 'DETERIORO', 'ROTURA', 'OTRO'] }, note: { type: 'string' } } },
  Sale: {
    type: 'object',
    required: ['items', 'paymentMethod'],
    properties: {
      items: { type: 'array', items: { type: 'object', required: ['productId', 'quantity'], properties: { productId: { type: 'integer' }, quantity: { type: 'integer' }, discountPct: { type: 'number' } } } },
      paymentMethod: { type: 'string', enum: ['CASH', 'CARD', 'YAPE', 'PLIN'] },
      cashReceived: { type: 'number' }, discountPct: { type: 'number' }, customerId: { type: 'integer', nullable: true },
      startedAt: { type: 'string', format: 'date-time', description: 'Momento del primer ítem (mide el tiempo de atención)' },
      prescriptionChecked: { type: 'boolean' },
    },
  },
  Void: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 5 } } },
  Customer: { type: 'object', required: ['docNumber', 'name'], properties: { docType: { type: 'string', enum: ['DNI', 'RUC', 'CE'] }, docNumber: { type: 'string' }, name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' } } },
};

export function buildOpenApi(): object {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of endpoints) {
    const params: object[] = [];
    for (const m of e.p.matchAll(/\{(\w+)\}/g)) params.push({ name: m[1], in: 'path', required: true, schema: { type: m[1] === 'id' ? 'integer' : 'string' } });
    for (const q of e.q ?? []) params.push({ name: q, in: 'query', required: false, schema: { type: 'string' } });
    const roleText = e.roles === 'public' ? 'Público' : e.roles === 'any' || !e.roles ? 'Cualquier usuario autenticado' : `Roles: ${e.roles.join(', ')}`;
    (paths[e.p] ??= {})[e.m] = {
      tags: [e.tag],
      summary: e.s,
      description: roleText,
      parameters: params,
      ...(e.roles && e.roles !== 'public' ? { security: [{ cookieAuth: [] }] } : {}),
      ...(e.body ? { requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${e.body}` } } } } } : {}),
      responses: {
        [String(e.status ?? 200)]: { description: 'Correcto' },
        '400': { description: 'Datos inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        ...(e.roles && e.roles !== 'public' ? { '401': { description: 'No autenticado' }, '403': { description: 'Sin permisos' } } : {}),
      },
    };
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'Nova Salud API',
      version: '1.0.0',
      description:
        'API de gestión de inventario, ventas (POS) y atención al cliente de la botica Nova Salud.\n\n' +
        '**Moneda:** soles (S/). **IGV:** 18 % (los precios de venta incluyen IGV). **Zona horaria:** America/Lima.\n\n' +
        '**Autenticación:** inicia sesión en `POST /api/auth/login`; el access token viaja en una cookie httpOnly. ' +
        'Las peticiones que modifican datos requieren la cabecera `X-Requested-With: XMLHttpRequest` (protección CSRF).\n\n' +
        'Los comprobantes generados son internos y **no** tienen validez tributaria (sin integración SUNAT).',
    },
    servers: [{ url: '/api' }],
    tags: [...new Set(endpoints.map((e) => e.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'ns_access' } },
      schemas: {
        ...schemas,
        Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } },
      },
    },
  };
}
