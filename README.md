# Nova Salud · Sistema de gestión para botica

Sistema completo (frontend + API + base de datos) para una botica en Lima: punto de venta rápido, inventario por lotes con **FEFO**, alertas de stock y vencimiento en tiempo real, reposición sugerida por proveedor, dashboard, reportes e indicadores de efectividad.

- Interfaz 100 % en español · moneda soles (S/) · IGV 18 % · zona horaria `America/Lima`.
- Comprobante: **ticket interno** con desglose de IGV. **No es un comprobante electrónico SUNAT.**

## Requisitos

- Docker 24+ con Docker Compose v2 (para ejecutar).
- Opcional, para desarrollo/pruebas fuera de Docker: Node.js 20 y PostgreSQL 16.

## Puesta en marcha (2 comandos)

```bash
cp .env.example .env
docker compose up --build
```

La primera vez, el backend espera a que la base esté sana, aplica las migraciones y carga los datos de demostración (solo si la base está vacía). Cuando `docker compose ps` muestre los tres servicios `healthy`:

| Qué | URL |
|---|---|
| Aplicación | http://localhost:8080 |
| Documentación de la API (Swagger) | http://localhost:8080/api/docs |
| Estado de la API | http://localhost:8080/api/health |
| Adminer (opcional) | `docker compose --profile tools up -d adminer` → http://localhost:8081 |

Atajo: `make up` (crea `.env` si falta y levanta todo). Para detener: `make down` (conserva datos); para borrar todo: `make reset`.

## Credenciales de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@novasalud.pe | `Admin#2026` |
| Vendedor | vendedor@novasalud.pe | `Vendedor#2026` |
| Almacenero | almacen@novasalud.pe | `Almacen#2026` |

> ⚠ **Son cuentas de demostración públicas.** Cámbialas en `.env` (`SEED_*_PASSWORD`) **antes** del primer arranque, o desde la pantalla *Usuarios* si ya arrancó. Genera secretos JWT propios con `make secrets`. No expongas el sistema a internet con los valores de `.env.example`.

Datos de ejemplo: 80 productos reales de botica en 9 categorías (algunos con stock bajo, agotados, por vencer y vencidos), 5 proveedores, 10 clientes y ~600 ventas de los últimos 30 días, con kardex y lotes conciliados.

## Qué hace cada rol

- **Administrador:** todo, incluido anular ventas, descuentos sin tope, usuarios, auditoría, dashboard e indicadores.
- **Vendedor:** POS, clientes, consulta de productos/stock (no ve precios de compra), alertas. Descuento hasta `MAX_SELLER_DISCOUNT_PCT` (5 % por defecto).
- **Almacenero:** productos, lotes/ingresos, ajustes, mermas, devoluciones, conteos de inventario, kardex, proveedores, reposición y reportes de inventario.

Los permisos se validan en el backend (middleware `authorize`) y se reflejan en el menú y las rutas del frontend.

## Uso del POS

`F2` buscar · `F4` cobrar · `F6` cliente · `Esc` cancelar. El lector de códigos de barras funciona como teclado (escanea y Enter). Cantidad rápida: `3*7750000000011`. El POS avisa de stock insuficiente (y lo bloquea), de lotes que vencen en ≤ 30 días y de productos con receta (exige confirmarla al cobrar). Pagos: efectivo (calcula vuelto), tarjeta, Yape y Plin (solo se registra el medio). Se mide el tiempo de atención desde el primer ítem hasta la confirmación.

## Variables de entorno

Todas están documentadas en [`.env.example`](.env.example). Las principales:

| Variable | Descripción |
|---|---|
| `POSTGRES_DB/USER/PASSWORD` | Base de datos (la contraseña es obligatoria) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Secretos de firma (≥ 32 caracteres, distintos) |
| `ACCESS_TOKEN_TTL_MIN`, `REFRESH_TOKEN_TTL_DAYS` | Vida de los tokens (15 min / 7 días) |
| `COOKIE_SECURE` | `true` si se publica con HTTPS |
| `CORS_ORIGINS` | Orígenes permitidos (lista separada por comas) |
| `TRUST_PROXY` | Saltos de proxy confiables (1 = el nginx del compose) |
| `RATE_LIMIT_*`, `LOGIN_RATE_LIMIT_MAX`, `LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_LOCK_MINUTES` | Límites y bloqueo por fuerza bruta |
| `MAX_SELLER_DISCOUNT_PCT`, `IGV_RATE` | Reglas de negocio |
| `EXPIRY_ALERT_DAYS`, `ALERT_CRON` | Umbrales iniciales de vencimiento y frecuencia del recálculo |
| `STORE_*` | Datos que se imprimen en el ticket |
| `AUTO_MIGRATE`, `AUTO_SEED`, `SEED_*_PASSWORD` | Arranque y cuentas demo |

## Comandos útiles

```bash
make up            # construir y levantar          make down      # detener
make logs          # logs de la API                make ps        # estado
make seed          # recargar datos demo (BORRA datos actuales)
make test          # pruebas de backend y frontend (necesita Node 20 + PostgreSQL local)
make backup        # respaldo en ./backups         make restore FILE=backups/<archivo>.sql.gz
make dev           # desarrollo con recarga en caliente → http://localhost:5173
```

### Respaldo y restauración

`scripts/backup.sh` genera `backups/novasalud-AAAAMMDD-HHMMSS.sql.gz` (`pg_dump` desde el contenedor; `BACKUP_KEEP=14` conserva solo los 14 más recientes). `scripts/restore.sh <archivo> [--yes]` **reemplaza** la base actual: detiene la API, restaura y la vuelve a iniciar. Programa el respaldo con `cron` en el host, por ejemplo: `0 2 * * * cd /ruta/nova-salud && ./scripts/backup.sh`.

### Pruebas sin Docker

```bash
# PostgreSQL local con un rol y dos bases: novasalud y novasalud_test
cd backend  && npm ci && npm test      # 70 pruebas (ventas/FEFO/concurrencia, stock, alertas, API/RBAC)
cd frontend && npm ci && npm test      # componentes y cálculo de totales
```
Las pruebas de integración se niegan a ejecutarse contra una base cuyo nombre no termine en `_test`. Se puede apuntar a otra con `TEST_DATABASE_URL`.

## Estructura del proyecto

```
nova-salud/
├── docker-compose.yml · docker-compose.dev.yml · Makefile · .env.example
├── scripts/            backup.sh · restore.sh
├── docs/               diagramas Mermaid (arquitectura, ER, casos de uso, secuencia de venta, alertas)
├── backend/
│   ├── migrations/     esquema PostgreSQL (Knex)
│   ├── seeds/          datos de demostración (determinísticos)
│   ├── src/
│   │   ├── routes/ controllers/ services/ repositories/   (capas)
│   │   ├── middlewares/ schemas/ (Zod) utils/ realtime/ jobs/ docs/ (OpenAPI)
│   │   └── config/ db/
│   └── tests/          unitarias + integración
└── frontend/
    ├── nginx.conf      SPA + proxy /api + SSE + cabeceras de seguridad
    └── src/ pages/ components/ api/ store/ hooks/ lib/ layouts/
```

## Diagramas

[Arquitectura](docs/01-arquitectura.md) · [Modelo ER](docs/02-modelo-er.md) · [Casos de uso por rol](docs/03-casos-de-uso.md) · [Secuencia de una venta](docs/04-secuencia-venta.md) · [Alertas y reposición](docs/05-alertas-reposicion.md)

## Decisiones técnicas

- **Knex en lugar de Prisma.** Migraciones en TypeScript, SQL explícito y siempre parametrizado; sin motor binario extra en la imagen. Un mapeo propio convierte `snake_case` ↔ `camelCase`.
- **FEFO + concurrencia.** Cada venta es una transacción que bloquea (`SELECT … FOR UPDATE`) los lotes del producto en orden estable (sin interbloqueos), reparte la cantidad entre lotes por vencimiento y registra de qué lote salió cada unidad (así una anulación devuelve el stock a los mismos lotes). `CHECK (quantity >= 0)` es la defensa final. Precios y costos se leen **siempre de la BD**, nunca del cliente.
- **Dinero.** Los precios de venta incluyen IGV; el subtotal es `total / 1.18`. Los cálculos se hacen en céntimos y el frontend replica el algoritmo del servidor solo para mostrar.
- **Sesiones.** Access token (15 min) y refresh token (7 días) en cookies `httpOnly`, `SameSite=Strict`; el refresh rota y se guarda hasheado, con detección de reutilización. Como defensa adicional contra CSRF, las peticiones que modifican datos exigen la cabecera `X-Requested-With`. Bloqueo de cuenta tras 5 intentos fallidos y limitador específico para el login.
- **Tiempo real con SSE** (no WebSocket): flujo unidireccional servidor → cliente, reconexión automática del navegador y compatible con el proxy sin configuración especial (`proxy_buffering off`). El frontend invalida consultas de TanStack Query al recibir eventos.
- **Alertas con clave única** (`LOW_STOCK:p12`, `EXPIRING:b87`…): se abren, actualizan, reabren o resuelven al recalcular (cada hora por cron, con bloqueo asesor de PostgreSQL, y tras cada movimiento relevante). Umbrales de vencimiento configurables en la tabla `settings`.
- **Reposición:** objetivo = máx(2 × stock mínimo, rotación diaria de 30 días × días de cobertura); sugerido = objetivo − disponible; agrupado por proveedor y valorizado a precio de compra.
- **Seguridad:** Helmet, CORS con lista blanca, rate limiting, validación Zod en cada entrada, consultas parametrizadas, saneamiento de texto, logs `pino` con redacción de credenciales, auditoría de operaciones sensibles, vendedor sin acceso a precios de compra. Contenedores Alpine multi-etapa, **sin root**, backend con sistema de archivos de solo lectura y `cap_drop: ALL`; nginx sin privilegios con CSP y cabeceras de seguridad; `X-Forwarded-For` lo fija nginx para que no se pueda falsear la IP del limitador.
- **Frontend:** carga diferida por pantalla (los gráficos solo se descargan en las pantallas que los usan), formularios con validación en línea, estados de carga/vacío/error, confirmación en acciones destructivas, modo oscuro, navegación por teclado y contraste WCAG AA.
- **Reportes:** un solo conjunto de datos por reporte que se muestra en pantalla y se exporta a CSV (UTF-8 con BOM, abre bien en Excel), XLSX (exceljs) y PDF (pdfkit). Las exportaciones quedan auditadas.

## Limitaciones conocidas

- **Las imágenes Docker no pudieron construirse en el entorno donde se desarrolló** (sin acceso a Docker Hub). Se validaron `docker compose config` en ambos archivos y, por separado, el backend compilado (`dist/`) contra PostgreSQL 16 (migración + datos demo desde base vacía, login, venta completa, alertas en tiempo real) y el frontend compilado con una prueba automatizada de navegador. Si algo del `docker compose up --build` falla en tu máquina, el primer sospechoso es un detalle de Dockerfile/nginx; abre un issue con la salida de `docker compose logs`.
- El ticket es un documento HTML para imprimir (pensado para impresora térmica de 80 mm); no hay integración con impresoras ni con SUNAT / facturación electrónica.
- Yape y Plin solo registran el medio de pago; no hay conciliación con las apps.
- El hub de SSE vive en memoria de un solo proceso. Para escalar el backend a varias réplicas habría que añadir un bus (p. ej. Redis o `LISTEN/NOTIFY`); el cron ya es seguro con varias réplicas gracias al bloqueo asesor.
- Una sola sucursal y un solo almacén; los lotes no se mueven entre ubicaciones.
- Las migraciones están escritas para ejecutarse compiladas (`.js`) en Docker o con `tsx` en desarrollo; no mezcles ambos modos sobre la misma base (Knex guarda el nombre con extensión). `make reset` limpia el volumen.
- El frontend no tiene pruebas end-to-end en el repositorio (la verificación de navegador se hizo con un script puntual); las pruebas automatizadas cubren backend (70) y componentes/cálculos del frontend (7).
