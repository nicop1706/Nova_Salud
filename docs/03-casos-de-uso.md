# Casos de uso por rol

```mermaid
flowchart LR
  A(["Administrador"])
  V(["Vendedor"])
  W(["Almacenero"])

  subgraph POS["Ventas"]
    U1["Cobrar en el POS<br/>(FEFO, receta, vuelto)"]
    U2["Consultar historial y reimprimir ticket"]
    U3["Anular venta (motivo, revierte stock)"]
    U4["Descuento mayor al tope del vendedor"]
    U5["Gestionar clientes<br/>(DNI/RUC, historial, frecuentes)"]
  end
  subgraph INV["Inventario"]
    U6["Consultar productos y stock<br/>(sin precio de compra)"]
    U7["CRUD de productos, categorías, proveedores"]
    U8["Importar productos por CSV"]
    U9["Ingreso de lotes · ajustes · mermas · devoluciones"]
    U10["Toma de inventario físico"]
    U11["Kardex"]
  end
  subgraph ALR["Alertas"]
    U12["Ver alertas y contador en tiempo real"]
    U13["Generar orden de reposición (CSV/PDF)"]
    U14["Configurar umbrales de vencimiento"]
  end
  subgraph ADM["Gestión"]
    U15["Dashboard e indicadores"]
    U16["Reportes CSV / Excel / PDF"]
    U17["Usuarios y roles"]
    U18["Auditoría"]
  end

  V --> U1 & U2 & U5 & U6 & U12
  W --> U6 & U7 & U8 & U9 & U10 & U11 & U12 & U13 & U16
  A --> U1 & U2 & U3 & U4 & U5 & U6 & U7 & U8 & U9 & U10 & U11 & U12 & U13 & U14 & U15 & U16 & U17 & U18
```

| Capacidad | Admin | Vendedor | Almacenero |
|---|:-:|:-:|:-:|
| POS, ventas, clientes | ✔ | ✔ | — |
| Anular ventas | ✔ | — | — |
| Descuentos sobre el tope (`MAX_SELLER_DISCOUNT_PCT`) | ✔ | — | — |
| Ver productos / alertas | ✔ | ✔ (sin precio de compra) | ✔ |
| Crear/editar productos, lotes, ajustes, conteos, kardex | ✔ | — | ✔ |
| Orden de reposición | ✔ | — | ✔ |
| Reportes (ventas: solo Admin) | ✔ | — | ✔ |
| Dashboard, indicadores, usuarios, auditoría, umbrales | ✔ | — | — |

Los permisos se aplican **en el backend** (middleware `authorize`) y se reflejan en el frontend (rutas protegidas y menú).
