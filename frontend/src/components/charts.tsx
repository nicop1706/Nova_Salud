import type { ReactNode } from 'react';

// Colores de series (contraste suficiente en claro y oscuro)
export const CHART = { green: '#059669', blue: '#0369a1', amber: '#d97706', red: '#dc2626', gray: '#64748b' };

/** Contenedor que fija el color de ejes/cuadrícula (currentColor) según el tema. */
export function ChartBox({ height = 260, children }: { height?: number; children: ReactNode }) {
  return (
    <div className="w-full text-ink-600 dark:text-ink-300" style={{ height }}>
      {children}
    </div>
  );
}

interface TipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, unknown> }>;
  label?: string | number;
  format?: (v: number, name?: string) => string;
  labelFormat?: (l: string | number) => string;
}

export function ChartTooltip({ active, payload, label, format, labelFormat }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-ink-600 dark:bg-ink-800">
      {label !== undefined && <p className="mb-1 font-semibold text-ink-900 dark:text-ink-50">{labelFormat ? labelFormat(label) : label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-ink-700 dark:text-ink-200">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="num font-semibold">{format ? format(p.value ?? 0, p.name) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export const axisTick = { fill: 'currentColor', fontSize: 12 };
export const gridStroke = 'currentColor';
