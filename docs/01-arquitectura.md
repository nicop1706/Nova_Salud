# Arquitectura

```mermaid
flowchart LR
  subgraph Cliente["Navegador"]
    SPA["React + Vite + TS<br/>React Router · TanStack Query<br/>Tailwind · Recharts"]
  end

  subgraph Docker["docker compose"]
    NGINX["frontend (nginx-unprivileged :8080)<br/>SPA estática · cabeceras de seguridad<br/>proxy /api · SSE sin buffering"]
    subgraph API["backend (Node 20 + Express + TS)"]
      MW["Middlewares<br/>Helmet · CORS · rate limit · CSRF<br/>JWT/RBAC · Zod · pino"]
      RT["routes"] --> CT["controllers"] --> SV["services<br/>(reglas de negocio)"] --> RP["repositories<br/>(Knex, SQL parametrizado)"]
      HUB["SSE hub<br/>/api/events"]
      CRON["node-cron<br/>alertas cada hora"]
      DOCS["Swagger UI<br/>/api/docs"]
    end
    DB[("PostgreSQL 16<br/>volumen pgdata")]
    ADM["adminer (opcional)"]
  end

  SPA -- "HTTPS/HTTP · cookies httpOnly" --> NGINX
  NGINX -- "/api/*" --> MW
  MW --> RT
  RP --> DB
  SV -- "emite eventos" --> HUB
  CRON --> SV
  HUB -. "text/event-stream" .-> SPA
  ADM -.-> DB
```

**Capas del backend:** `routes` (HTTP + validación Zod + permisos) → `controllers` (traducen request/response) → `services` (reglas de negocio, transacciones, auditoría) → `repositories` (único lugar con SQL).

**Tiempo real:** cada venta, movimiento de inventario o recálculo de alertas publica un evento por SSE; el frontend invalida las consultas afectadas (contador de la barra superior, panel de alertas, stock en el POS, dashboard).
