# Modelo entidad-relación

```mermaid
erDiagram
  users ||--o{ refresh_tokens : "sesiones"
  users ||--o{ sales : "vende (seller_id)"
  users ||--o{ stock_movements : "registra"
  users ||--o{ audit_logs : "genera"
  users ||--o{ stock_counts : "crea"
  categories ||--o{ products : "clasifica"
  suppliers ||--o{ products : "abastece"
  products ||--o{ batches : "tiene lotes"
  products ||--o{ sale_items : "se vende"
  products ||--o{ alerts : "genera"
  products ||--o{ stockout_events : "quiebres"
  products ||--o{ stock_count_items : "se cuenta"
  batches ||--o{ stock_movements : "kardex"
  batches ||--o{ sale_item_batches : "origen FEFO"
  customers ||--o{ sales : "compra (opcional)"
  sales ||--|{ sale_items : "detalle"
  sale_items ||--|{ sale_item_batches : "lotes consumidos"
  stock_counts ||--|{ stock_count_items : "detalle"

  users { int id PK
    string email UK
    string password_hash "bcrypt"
    role role "ADMIN|SELLER|WAREHOUSE"
    bool active
    int failed_logins
    timestamptz locked_until }
  products { int id PK
    string sku UK
    string barcode UK
    string name
    string active_ingredient
    string laboratory
    string presentation
    numeric purchase_price
    numeric sale_price "incluye IGV"
    int min_stock
    bool requires_prescription
    bool active }
  batches { int id PK
    int product_id FK
    string batch_number
    date expires_at
    int quantity "CHECK >= 0"
    int initial_qty }
  stock_movements { int id PK
    int batch_id FK
    movement_type type "PURCHASE|SALE|ADJUSTMENT|WASTE|RETURN|VOID"
    int quantity "con signo"
    string reason
    string reference }
  sales { int id PK
    int number UK "secuencia"
    sale_status status "COMPLETED|VOIDED"
    payment_method payment_method "CASH|CARD|YAPE|PLIN"
    numeric subtotal
    numeric igv
    numeric discount
    numeric total
    timestamptz started_at
    int service_seconds
    string void_reason }
  sale_items { int id PK
    int quantity
    numeric unit_price
    numeric unit_cost
    numeric line_total }
  sale_item_batches { int sale_item_id FK
    int batch_id FK
    int quantity }
  customers { int id PK
    doc_type doc_type "DNI|RUC|CE"
    string doc_number
    string name }
  alerts { int id PK
    string key UK "p.ej. LOW_STOCK:p12"
    alert_type type
    alert_priority priority
    alert_status status "OPEN|RESOLVED" }
  stockout_events { int id PK
    int product_id FK
    int requested_qty
    int available_qty }
  settings { string key PK
    jsonb value }
  stock_counts { int id PK
    stock_count_status status }
  stock_count_items { int count_id FK
    int product_id FK
    int system_qty
    int counted_qty }
  audit_logs { int id PK
    string action
    string entity
    jsonb detail
    string ip }
  categories { int id PK
    string name UK }
  suppliers { int id PK
    string name
    string ruc }
  refresh_tokens { int id PK
    string token_hash
    timestamptz expires_at
    timestamptz revoked_at }
```

Restricciones clave: `batches.quantity >= 0` (última línea de defensa contra stock negativo), `sales.number` por secuencia, claves únicas en `alerts.key` (una alerta abierta por producto/lote y tipo).
