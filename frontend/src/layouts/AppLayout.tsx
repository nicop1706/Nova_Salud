import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { get } from '../api/client';
import type { AlertSummary, Role } from '../api/types';
import { Icon, IconName } from '../components/Icon';
import { cn } from '../components/ui';
import { useRealtime } from '../hooks/useRealtime';
import { ROLE_LABEL } from '../lib/format';
import { useAuth } from '../store/auth';
import { useTheme } from '../store/theme';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  roles: Role[];
}
const A: Role = 'ADMIN';
const S: Role = 'SELLER';
const W: Role = 'WAREHOUSE';

const NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: 'Atención',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'chart', roles: [A] },
      { to: '/pos', label: 'Punto de venta', icon: 'cart', roles: [A, S] },
      { to: '/ventas', label: 'Ventas', icon: 'file', roles: [A, S] },
      { to: '/clientes', label: 'Clientes', icon: 'users', roles: [A, S] },
    ],
  },
  {
    section: 'Inventario',
    items: [
      { to: '/productos', label: 'Productos', icon: 'pill', roles: [A, S, W] },
      { to: '/inventario', label: 'Lotes e ingresos', icon: 'box', roles: [A, W] },
      { to: '/kardex', label: 'Kardex', icon: 'list', roles: [A, W] },
      { to: '/conteos', label: 'Toma de inventario', icon: 'clipboard', roles: [A, W] },
      { to: '/alertas', label: 'Alertas y reposición', icon: 'bell', roles: [A, S, W] },
      { to: '/catalogo', label: 'Proveedores y categorías', icon: 'truck', roles: [A, W] },
    ],
  },
  {
    section: 'Gestión',
    items: [
      { to: '/reportes', label: 'Reportes', icon: 'download', roles: [A, W] },
      { to: '/indicadores', label: 'Indicadores', icon: 'scale', roles: [A] },
      { to: '/usuarios', label: 'Usuarios', icon: 'shield', roles: [A] },
      { to: '/auditoria', label: 'Auditoría', icon: 'tag', roles: [A] },
    ],
  },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { connected } = useRealtime();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => setOpen(false), [loc.pathname]);

  const summary = useQuery({
    queryKey: ['alerts', 'summary'],
    queryFn: () => get<{ data: AlertSummary }>('/alerts/summary'),
    refetchInterval: 5 * 60_000, // respaldo: el canal SSE ya lo mantiene al día
    staleTime: 60_000,
  });
  const s = summary.data?.data;
  const count = s?.total ?? 0;

  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Navegación principal">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
          <Icon name="pill" className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <p className="text-base font-bold text-ink-900 dark:text-ink-50">Nova Salud</p>
          <p className="text-xs text-ink-600 dark:text-ink-300">Gestión de botica</p>
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => {
          const items = g.items.filter((i) => user && i.roles.includes(user.role));
          if (!items.length) return null;
          return (
            <div key={g.section}>
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">{g.section}</p>
              <ul className="space-y-0.5">
                {items.map((i) => (
                  <li key={i.to}>
                    <NavLink
                      to={i.to}
                      className={({ isActive }) =>
                        cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-200' : 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800')
                      }
                    >
                      <Icon name={i.icon} className="h-[18px] w-[18px]" />
                      <span className="flex-1">{i.label}</span>
                      {i.to === '/alertas' && count > 0 && <span className="rounded-full bg-red-700 px-1.5 text-[11px] font-bold text-white">{count}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-brand-800">
        Saltar al contenido
      </a>

      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900 lg:block">{sidebar}</aside>

      {/* Cajón (móvil/tablet) */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl dark:bg-ink-900">{sidebar}</aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-ink-200 bg-white/95 px-3 backdrop-blur dark:border-ink-800 dark:bg-ink-900/95 sm:px-5">
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800 lg:hidden" aria-label="Abrir menú">
          <Icon name="menu" />
        </button>
        <div className="flex-1" />

        <span className={cn('hidden items-center gap-1.5 text-xs sm:inline-flex', connected ? 'text-brand-800 dark:text-brand-200' : 'text-ink-600 dark:text-ink-300')} title={connected ? 'Actualización en tiempo real activa' : 'Reconectando…'}>
          <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-brand-600' : 'bg-amber-500')} aria-hidden />
          {connected ? 'En vivo' : 'Reconectando'}
        </span>

        <button
          type="button"
          onClick={() => nav('/alertas')}
          className="relative rounded-lg p-2 text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
          aria-label={count > 0 ? `Alertas: ${count} pendientes, ${s?.critical ?? 0} críticas` : 'Alertas: sin pendientes'}
        >
          <Icon name="bell" />
          {count > 0 && (
            <span className={cn('absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold leading-[18px] text-white', (s?.critical ?? 0) > 0 ? 'bg-red-700' : 'bg-amber-700')}>{count > 99 ? '99+' : count}</span>
          )}
        </button>

        <button type="button" onClick={toggle} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800" aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>

        <div className="ml-1 hidden text-right leading-tight sm:block">
          <p className="max-w-[12rem] truncate text-sm font-medium text-ink-900 dark:text-ink-50">{user?.name}</p>
          <p className="text-xs text-ink-600 dark:text-ink-300">{user && ROLE_LABEL[user.role]}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await logout();
            nav('/login', { replace: true });
          }}
          className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <Icon name="logout" />
        </button>
      </header>

      <main id="contenido" className="px-3 py-5 sm:px-6" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
