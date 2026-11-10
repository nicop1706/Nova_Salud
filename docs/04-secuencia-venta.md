# Secuencia: venta en el POS

```mermaid
sequenceDiagram
  autonumber
  actor S as Vendedor
  participant UI as POS (React)
  participant API as POST /api/sales
  participant SV as saleService
  participant DB as PostgreSQL
  participant HUB as SSE hub
  participant AL as alertService

  S->>UI: escanea código / escribe nombre (Enter)
  UI->>API: GET /products/by-code | /products/search
  UI-->>S: valida stock disponible, avisa receta y lotes por vencer
  S->>UI: F4 · medio de pago · efectivo recibido
  UI->>API: items, descuentos, pago, customerId, startedAt
  API->>API: JWT + rol + CSRF + validación Zod
  API->>SV: create()
  SV->>DB: BEGIN
  SV->>DB: SELECT lotes FOR UPDATE (orden por producto)
  Note over SV,DB: precio y costo SIEMPRE desde la BD
  SV->>SV: planFefo (vence antes → sale antes)
  alt stock insuficiente
    SV->>DB: ROLLBACK + stockout_event
    SV-->>UI: 409 STOCK_INSUFICIENTE
  else stock suficiente
    SV->>DB: UPDATE batches · INSERT sale, items, item_batches, stock_movements
    SV->>DB: COMMIT
    SV->>AL: recalcular alertas de los productos afectados
    AL->>HUB: alerts / stock / sale
    HUB-->>UI: evento SSE (todos los clientes)
    SV-->>UI: 201 venta (número, total, vuelto, tiempo de atención)
    UI-->>S: confirmación + imprimir ticket
  end
```

**Concurrencia:** dos ventas simultáneas del mismo producto se serializan con `SELECT … FOR UPDATE`; el `CHECK (quantity >= 0)` es la defensa final. Prueba incluida: 20 ventas paralelas sobre 5 unidades → 5 aceptadas, 15 rechazadas, stock = 0.
