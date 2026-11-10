import type { Knex } from 'knex';

// Esquema inicial de Nova Salud (PostgreSQL 16).
// Las restricciones CHECK son la última línea de defensa: ningún lote puede quedar con
// cantidad negativa aunque falle la lógica de aplicación o haya concurrencia.

const UP = `
CREATE TYPE role AS ENUM ('ADMIN', 'SELLER', 'WAREHOUSE');
CREATE TYPE doc_type AS ENUM ('DNI', 'RUC', 'CE');
CREATE TYPE movement_type AS ENUM ('PURCHASE', 'SALE', 'ADJUSTMENT', 'WASTE', 'RETURN', 'VOID');
CREATE TYPE sale_status AS ENUM ('COMPLETED', 'VOIDED');
CREATE TYPE payment_method AS ENUM ('CASH', 'CARD', 'YAPE', 'PLIN');
CREATE TYPE alert_type AS ENUM ('OUT_OF_STOCK', 'LOW_STOCK', 'EXPIRED', 'EXPIRING');
CREATE TYPE alert_priority AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM');
CREATE TYPE alert_status AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE stock_count_status AS ENUM ('OPEN', 'APPLIED', 'CANCELLED');

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          role NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id);

CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE suppliers (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  ruc        TEXT,
  contact    TEXT,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id                    SERIAL PRIMARY KEY,
  sku                   TEXT NOT NULL UNIQUE,
  barcode               TEXT UNIQUE,
  name                  TEXT NOT NULL,
  active_ingredient     TEXT,
  laboratory            TEXT,
  presentation          TEXT,
  category_id           INTEGER NOT NULL REFERENCES categories(id),
  supplier_id           INTEGER REFERENCES suppliers(id),
  purchase_price        NUMERIC(12,2) NOT NULL CHECK (purchase_price >= 0),
  sale_price            NUMERIC(12,2) NOT NULL CHECK (sale_price >= 0),
  min_stock             INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  requires_prescription BOOLEAN NOT NULL DEFAULT FALSE,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_name_idx ON products (lower(name));
CREATE INDEX products_ingredient_idx ON products (lower(active_ingredient));
CREATE INDEX products_category_idx ON products (category_id);
CREATE INDEX products_supplier_idx ON products (supplier_id);

CREATE TABLE batches (
  id           SERIAL PRIMARY KEY,
  product_id   INTEGER NOT NULL REFERENCES products(id),
  batch_number TEXT NOT NULL,
  expires_at   DATE NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity >= 0),
  initial_qty  INTEGER NOT NULL CHECK (initial_qty >= 0),
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, batch_number)
);
CREATE INDEX batches_product_expiry_idx ON batches (product_id, expires_at);
CREATE INDEX batches_expiry_idx ON batches (expires_at);

CREATE TABLE stock_movements (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  batch_id   INTEGER REFERENCES batches(id),
  type       movement_type NOT NULL,
  quantity   INTEGER NOT NULL CHECK (quantity <> 0), -- con signo: + entrada, - salida
  unit_cost  NUMERIC(12,2),
  reason     TEXT,
  reference  TEXT,
  user_id    INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX movements_product_idx ON stock_movements (product_id, created_at);
CREATE INDEX movements_type_idx ON stock_movements (type, created_at);
CREATE INDEX movements_batch_idx ON stock_movements (batch_id);

CREATE TABLE customers (
  id         SERIAL PRIMARY KEY,
  doc_type   doc_type NOT NULL DEFAULT 'DNI',
  doc_number TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customers_name_idx ON customers (lower(name));

CREATE SEQUENCE sales_number_seq START 1;

CREATE TABLE sales (
  id                   SERIAL PRIMARY KEY,
  number               INTEGER NOT NULL UNIQUE DEFAULT nextval('sales_number_seq'),
  customer_id          INTEGER REFERENCES customers(id),
  seller_id            INTEGER NOT NULL REFERENCES users(id),
  status               sale_status NOT NULL DEFAULT 'COMPLETED',
  payment_method       payment_method NOT NULL,
  subtotal             NUMERIC(12,2) NOT NULL, -- base imponible (sin IGV)
  igv                  NUMERIC(12,2) NOT NULL,
  discount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                NUMERIC(12,2) NOT NULL CHECK (total >= 0), -- con IGV
  cash_received        NUMERIC(12,2),
  change_given         NUMERIC(12,2),
  prescription_checked BOOLEAN NOT NULL DEFAULT FALSE,
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  service_seconds      INTEGER,
  voided_at            TIMESTAMPTZ,
  voided_by_id         INTEGER REFERENCES users(id),
  void_reason          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sales_completed_idx ON sales (completed_at);
CREATE INDEX sales_customer_idx ON sales (customer_id);
CREATE INDEX sales_seller_idx ON sales (seller_id);
CREATE INDEX sales_status_idx ON sales (status, completed_at);

CREATE TABLE sale_items (
  id         SERIAL PRIMARY KEY,
  sale_id    INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL, -- con IGV
  unit_cost  NUMERIC(12,2) NOT NULL, -- costo al momento de la venta
  discount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL
);
CREATE INDEX sale_items_sale_idx ON sale_items (sale_id);
CREATE INDEX sale_items_product_idx ON sale_items (product_id);

CREATE TABLE sale_item_batches (
  id           SERIAL PRIMARY KEY,
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  batch_id     INTEGER NOT NULL REFERENCES batches(id),
  quantity     INTEGER NOT NULL CHECK (quantity > 0)
);
CREATE INDEX sale_item_batches_item_idx ON sale_item_batches (sale_item_id);
CREATE INDEX sale_item_batches_batch_idx ON sale_item_batches (batch_id);

CREATE TABLE stockout_events (
  id            SERIAL PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  requested_qty INTEGER NOT NULL,
  available_qty INTEGER NOT NULL,
  source        TEXT NOT NULL DEFAULT 'POS',
  user_id       INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stockouts_created_idx ON stockout_events (created_at);
CREATE INDEX stockouts_product_idx ON stockout_events (product_id);

CREATE TABLE alerts (
  id          SERIAL PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  type        alert_type NOT NULL,
  priority    alert_priority NOT NULL,
  status      alert_status NOT NULL DEFAULT 'OPEN',
  product_id  INTEGER NOT NULL REFERENCES products(id),
  batch_id    INTEGER REFERENCES batches(id),
  message     TEXT NOT NULL,
  data        JSONB,
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX alerts_status_idx ON alerts (status, priority);
CREATE INDEX alerts_type_idx ON alerts (type, status);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE stock_counts (
  id            SERIAL PRIMARY KEY,
  status        stock_count_status NOT NULL DEFAULT 'OPEN',
  notes         TEXT,
  created_by_id INTEGER NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at    TIMESTAMPTZ
);

CREATE TABLE stock_count_items (
  id          SERIAL PRIMARY KEY,
  count_id    INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  system_qty  INTEGER NOT NULL,
  counted_qty INTEGER CHECK (counted_qty IS NULL OR counted_qty >= 0),
  UNIQUE (count_id, product_id)
);

CREATE TABLE audit_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  detail     JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON audit_logs (created_at);
CREATE INDEX audit_entity_idx ON audit_logs (entity, entity_id);
CREATE INDEX audit_user_idx ON audit_logs (user_id);
`;

const DOWN = `
DROP TABLE IF EXISTS audit_logs, stock_count_items, stock_counts, settings, alerts, stockout_events,
  sale_item_batches, sale_items, sales, customers, stock_movements, batches, products, suppliers,
  categories, refresh_tokens, users CASCADE;
DROP SEQUENCE IF EXISTS sales_number_seq;
DROP TYPE IF EXISTS stock_count_status, alert_status, alert_priority, alert_type, payment_method,
  sale_status, movement_type, doc_type, role;
`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(UP);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(DOWN);
}
