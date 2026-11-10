import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { HomeRedirect, RequireAuth, RequireRole } from './components/guards';
import { Loading } from './components/ui';
import { AppLayout } from './layouts/AppLayout';
import Login from './pages/Login';

// Carga diferida por pantalla: el POS y el login cargan rápido; los reportes/gráficos solo cuando se usan.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const POS = lazy(() => import('./pages/POS'));
const Sales = lazy(() => import('./pages/Sales'));
const Customers = lazy(() => import('./pages/Customers'));
const Products = lazy(() => import('./pages/Products'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Kardex = lazy(() => import('./pages/Kardex'));
const StockCounts = lazy(() => import('./pages/StockCounts'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Catalog = lazy(() => import('./pages/Catalog'));
const Reports = lazy(() => import('./pages/Reports'));
const Indicators = lazy(() => import('./pages/Indicators'));
const Users = lazy(() => import('./pages/Users'));
const Audit = lazy(() => import('./pages/Audit'));

function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="text-4xl font-bold text-brand-700 dark:text-brand-500">404</p>
      <p className="mt-2 text-ink-700 dark:text-ink-200">La página que buscas no existe.</p>
      <Link to="/" className="mt-4 inline-block font-medium text-brand-700 underline dark:text-brand-300">
        Volver al inicio
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomeRedirect />} />

            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/indicadores" element={<Indicators />} />
              <Route path="/usuarios" element={<Users />} />
              <Route path="/auditoria" element={<Audit />} />
            </Route>

            <Route element={<RequireRole roles={['ADMIN', 'SELLER']} />}>
              <Route path="/pos" element={<POS />} />
              <Route path="/ventas" element={<Sales />} />
              <Route path="/clientes" element={<Customers />} />
            </Route>

            <Route element={<RequireRole roles={['ADMIN', 'WAREHOUSE']} />}>
              <Route path="/inventario" element={<Inventory />} />
              <Route path="/kardex" element={<Kardex />} />
              <Route path="/conteos" element={<StockCounts />} />
              <Route path="/catalogo" element={<Catalog />} />
              <Route path="/reportes" element={<Reports />} />
            </Route>

            <Route element={<RequireRole roles={['ADMIN', 'SELLER', 'WAREHOUSE']} />}>
              <Route path="/productos" element={<Products />} />
              <Route path="/alertas" element={<Alerts />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
