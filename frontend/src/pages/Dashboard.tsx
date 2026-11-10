import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get } from '../api/client';
import type { Dashboard as DashboardData } from '../api/types';
import { axisTick, ChartBox, ChartTooltip, CHART, gridStroke } from '../components/charts';
import { AlertTypeBadge, Card, EmptyState, ErrorState, PageHeader, PriorityBadge, SkeletonRows, StatCard, Badge } from '../components/ui';
import { duration, fmtDate, money, num, PAYMENT_LABEL, shortDay } from '../lib/format';

export default function Dashboard() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get<{ data: DashboardData }>('/reports/dashboard'), refetchInterval: 60_000 });

  if (q.isLoading)
    return (
      <>
        <PageHeader title="Dashboard" />
        <SkeletonRows rows={8} />
      </>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!.data;
  const s = d.sales;
  const maxPay = Math.max(1, ...d.payments.map((p) => p.total));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Resumen de ventas, existencias y atención · se actualiza en tiempo real" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Ventas de hoy" value={money(s.day.total)} hint={`${s.day.count} venta(s)`} tone="brand" />
        <StatCard label="Ventas de la semana" value={money(s.week.total)} hint={`${s.week.count} venta(s)`} tone="brand" />
        <StatCard label="Ventas del mes" value={money(s.month.total)} hint={`${s.month.count} venta(s)`} tone="brand" />
        <StatCard label="Ticket promedio" value={money(s.avgTicketMonth)} hint="Mes en curso" tone="blue" />
        <StatCard label="Tiempo de atención" value={duration(d.avgServiceSeconds)} hint="Promedio últimos 30 días" tone="blue" />
        <Link to="/alertas" className="block focus-visible:rounded-xl">
          <StatCard label="Alertas abiertas" value={d.alerts.total} hint={`${d.alerts.critical} crítica(s) · ${d.alerts.high} alta(s)`} tone={d.alerts.critical ? 'red' : d.alerts.total ? 'amber' : 'brand'} />
        </Link>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Ventas de los últimos 30 días" className="lg:col-span-2">
          <ChartBox height={280}>
            <ResponsiveContainer>
              <BarChart data={d.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={gridStroke} strokeOpacity={0.15} />
                <XAxis dataKey="day" tick={axisTick} tickFormatter={shortDay} interval="preserveStartEnd" minTickGap={24} stroke={gridStroke} strokeOpacity={0.3} />
                <YAxis tick={axisTick} width={68} tickFormatter={(v: number) => `S/ ${v}`} stroke={gridStroke} strokeOpacity={0.3} />
                <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.08 }} content={<ChartTooltip format={(v, n) => (n === 'Ventas' ? String(v) : money(v))} labelFormat={(l) => fmtDate(String(l))} />} />
                <Bar dataKey="total" name="Importe" fill={CHART.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </Card>

        <Card title="Medios de pago (mes)">
          {d.payments.length === 0 ? (
            <EmptyState title="Sin ventas este mes" icon="cart" />
          ) : (
            <ul className="space-y-3">
              {d.payments.map((p) => (
                <li key={p.method}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-ink-800 dark:text-ink-100">{PAYMENT_LABEL[p.method]}</span>
                    <span className="num text-ink-700 dark:text-ink-200">
                      {money(p.total)} <span className="text-ink-500">({p.count})</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-800" role="presentation">
                    <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(p.total / maxPay) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Productos más vendidos (30 días)">
          {d.topProducts.length === 0 ? (
            <EmptyState title="Aún no hay ventas" icon="cart" />
          ) : (
            <ChartBox height={Math.max(220, d.topProducts.length * 34)}>
              <ResponsiveContainer>
                <BarChart data={d.topProducts} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={gridStroke} strokeOpacity={0.15} />
                  <XAxis type="number" tick={axisTick} stroke={gridStroke} strokeOpacity={0.3} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={150} tick={axisTick} stroke={gridStroke} strokeOpacity={0.3} tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
                  <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.08 }} content={<ChartTooltip format={(v) => `${num(v)} uds.`} />} />
                  <Bar dataKey="units" name="Unidades" fill={CHART.blue} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Stock crítico" actions={<Link to="/alertas" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">Ver todas</Link>} padded={false}>
            {d.criticalStock.length === 0 ? (
              <EmptyState title="Sin productos en nivel crítico" icon="check" />
            ) : (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {d.criticalStock.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-50">{c.name}</p>
                      <p className="text-xs text-ink-600 dark:text-ink-300">
                        Disponible {c.available} · mínimo {c.minStock}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <AlertTypeBadge type={c.type} />
                      <PriorityBadge priority={c.priority} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Próximos a vencer (${d.expiryDays.join('/')} días) y vencidos`} padded={false}>
            {d.expiring.length === 0 ? (
              <EmptyState title="Sin lotes por vencer" icon="check" />
            ) : (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {d.expiring.slice(0, 6).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-50">{e.name}</p>
                      <p className="text-xs text-ink-600 dark:text-ink-300">
                        Lote {e.batchNumber} · {e.quantity} uds. · vence {fmtDate(e.expiresAt)}
                      </p>
                    </div>
                    {e.type === 'EXPIRED' ? <Badge tone="red">Vencido</Badge> : <PriorityBadge priority={e.priority} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
