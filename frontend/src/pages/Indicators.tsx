import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get } from '../api/client';
import type { Indicators as IndicatorsData } from '../api/types';
import { axisTick, ChartBox, ChartTooltip, CHART, gridStroke } from '../components/charts';
import { Card, DataTable, EmptyState, ErrorState, PageHeader, Select, SkeletonRows, StatCard, Badge } from '../components/ui';
import { duration, fmtDate, money, num, pct, shortDay } from '../lib/format';

export default function Indicators() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['dashboard', 'indicators', days], queryFn: () => get<{ data: IndicatorsData }>('/reports/indicators', { days }) });

  const header = (
    <PageHeader
      title="Indicadores de efectividad"
      subtitle="Mide si el sistema reduce el tiempo de atención, los quiebres de stock y los errores de inventario"
      actions={
        <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
          Periodo
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-36">
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </Select>
        </label>
      }
    />
  );

  if (q.isLoading) return <>{header}<SkeletonRows rows={8} /></>;
  if (q.isError) return <>{header}<ErrorState error={q.error} onRetry={() => q.refetch()} /></>;
  const d = q.data!.data;
  const acc = d.inventoryAccuracy.latest;

  return (
    <>
      {header}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Tiempo promedio de atención" value={duration(d.service.avgSeconds)} hint={`Mediana ${duration(d.service.medianSeconds)} · máx. ${duration(d.service.maxSeconds)} · ${num(d.service.measuredSales)} ventas medidas`} tone="blue" />
        <StatCard label="Ventas sin quiebre de stock" value={pct(d.stockouts.salesWithoutStockoutPct)} hint={`${d.stockouts.events} intento(s) bloqueado(s) por falta de stock en ${d.stockouts.productsAffected} producto(s)`} tone={d.stockouts.salesWithoutStockoutPct >= 97 ? 'brand' : 'amber'} />
        <StatCard label="Tasa de desabastecimiento" value={pct(d.stockouts.stockoutRatePct)} hint={`${d.stockouts.currentOutOfStock} de ${d.stockouts.activeProducts} productos activos agotados hoy`} tone={d.stockouts.stockoutRatePct > 5 ? 'red' : 'brand'} />
        <StatCard label="Exactitud del inventario (último conteo)" value={acc ? pct(acc.accuracyPct) : 'Sin conteos'} hint={acc ? `${acc.withDifference} de ${acc.counted} productos con diferencia · ${acc.absUnits} uds. · ${money(acc.absValue)}` : 'Realiza una toma de inventario'} tone={acc && acc.accuracyPct >= 95 ? 'brand' : 'amber'} />
        <StatCard label="Mermas por vencimiento" value={`${num(d.expiryWaste.units)} uds.`} hint={`Valorizado al costo: ${money(d.expiryWaste.value)}`} tone={d.expiryWaste.units ? 'amber' : 'brand'} />
        <StatCard label="Rotación de inventario" value={`${d.rotation.turnover.toFixed(2).replace('.', ',')} veces`} hint={`${d.rotation.daysOfInventory != null ? `${d.rotation.daysOfInventory} días de inventario` : 'Sin datos'} · anualizada ${d.rotation.annualized.toFixed(1).replace('.', ',')}`} tone="blue" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Tiempo de atención por día (promedio)">
          {d.service.daily.length === 0 ? (
            <EmptyState title="Sin mediciones en el periodo" icon="chart" />
          ) : (
            <ChartBox>
              <ResponsiveContainer>
                <LineChart data={d.service.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={gridStroke} strokeOpacity={0.15} />
                  <XAxis dataKey="day" tick={axisTick} tickFormatter={shortDay} minTickGap={24} stroke={gridStroke} strokeOpacity={0.3} />
                  <YAxis tick={axisTick} width={44} tickFormatter={(v: number) => `${v}s`} stroke={gridStroke} strokeOpacity={0.3} />
                  <Tooltip content={<ChartTooltip format={(v) => duration(v)} labelFormat={(l) => fmtDate(String(l))} />} />
                  <Line type="monotone" dataKey="avgSeconds" name="Atención promedio" stroke={CHART.blue} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartBox>
          )}
        </Card>

        <Card title="Productos con más quiebres de stock" padded={false}>
          {d.stockouts.topProducts.length === 0 ? (
            <EmptyState title="Sin quiebres registrados" hint="Se registran cuando el POS intenta vender sin stock." icon="check" />
          ) : (
            <DataTable
              rows={d.stockouts.topProducts}
              rowKey={(r) => r.id}
              columns={[
                { header: 'Producto', cell: (r) => <span className="font-medium">{r.name}</span> },
                { header: 'Eventos', align: 'right', cell: (r) => <span className="num">{r.events}</span> },
                { header: 'Uds. no atendidas', align: 'right', cell: (r) => <span className="num">{r.missingUnits}</span> },
              ]}
            />
          )}
        </Card>

        <Card title="Historial de tomas de inventario (stock físico vs. sistema)" padded={false}>
          {d.inventoryAccuracy.counts.length === 0 ? (
            <EmptyState title="Aún no hay tomas de inventario aplicadas" icon="clipboard" />
          ) : (
            <DataTable
              rows={d.inventoryAccuracy.counts}
              rowKey={(r) => r.id}
              columns={[
                { header: 'Fecha', cell: (r) => fmtDate(r.appliedAt) },
                { header: 'Contados', align: 'right', cell: (r) => <span className="num">{r.counted}</span> },
                { header: 'Con diferencia', align: 'right', cell: (r) => <span className="num">{r.withDifference}</span> },
                { header: 'Dif. (uds.)', align: 'right', cell: (r) => <span className="num">{r.absUnits}</span> },
                { header: 'Dif. (S/)', align: 'right', cell: (r) => <span className="num">{money(r.absValue)}</span> },
                { header: 'Exactitud', align: 'right', cell: (r) => <Badge tone={r.accuracyPct >= 95 ? 'brand' : 'amber'}>{pct(r.accuracyPct)}</Badge> },
              ]}
            />
          )}
        </Card>

        <Card title="Mermas por vencimiento (mayor impacto)" padded={false}>
          {d.expiryWaste.top.length === 0 ? (
            <EmptyState title="Sin mermas por vencimiento en el periodo" icon="check" />
          ) : (
            <DataTable
              rows={d.expiryWaste.top}
              rowKey={(r) => r.name}
              columns={[
                { header: 'Producto', cell: (r) => <span className="font-medium">{r.name}</span> },
                { header: 'Unidades', align: 'right', cell: (r) => <span className="num">{r.units}</span> },
                { header: 'Costo', align: 'right', cell: (r) => <span className="num">{money(r.value)}</span> },
              ]}
            />
          )}
        </Card>
      </div>
    </>
  );
}
