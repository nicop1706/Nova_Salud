import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from '../store/auth';
import { Loading } from './ui';

/** Guard de autenticación: sin sesión → /login (recuerda la ruta de destino). */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading label="Verificando sesión…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

/** Guard de rol: el backend también lo exige (RBAC); esto evita mostrar pantallas inaccesibles. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Forbidden />;
  return <Outlet />;
}

export function Forbidden() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-ink-200 bg-white p-8 text-center shadow-card dark:border-ink-700 dark:bg-ink-900" role="alert">
      <p className="text-4xl font-bold text-brand-700 dark:text-brand-500">403</p>
      <h1 className="mt-2 text-lg font-semibold text-ink-900 dark:text-ink-50">Acceso restringido</h1>
      <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">Tu rol no tiene permisos para ver esta sección.</p>
    </div>
  );
}

export const homePathFor = (role: Role): string => (role === 'ADMIN' ? '/dashboard' : role === 'SELLER' ? '/pos' : '/alertas');

export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}
