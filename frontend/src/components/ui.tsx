import {
  ButtonHTMLAttributes,
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { ApiError } from '../api/client';
import type { AlertPriority, AlertType, StockStatus } from '../api/types';
import { ALERT_TYPE_LABEL, PRIORITY_LABEL } from '../lib/format';
import { Icon } from './Icon';

export const cn = (...c: Array<string | false | null | undefined>): string => c.filter(Boolean).join(' ');

/* ------------------------------ Botones ------------------------------ */
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/50',
  secondary: 'border border-ink-300 bg-white text-ink-800 hover:bg-ink-100 dark:border-ink-600 dark:bg-ink-800 dark:text-ink-100 dark:hover:bg-ink-700',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-700/50',
  ghost: 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800',
};
const SIZE: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-base' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn('inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70', VARIANT[variant], SIZE[size], className)}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

/* ------------------------------ Campos ------------------------------ */
const inputBase =
  'block w-full rounded-lg border border-ink-300 bg-white px-3 text-ink-900 shadow-sm transition-colors placeholder:text-ink-500 focus:border-brand-600 disabled:cursor-not-allowed disabled:bg-ink-100 dark:border-ink-600 dark:bg-ink-800 dark:text-ink-50 dark:disabled:bg-ink-900';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputBase, 'h-10', invalid && 'border-red-600', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(inputBase, 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputBase, 'py-2', className)} rows={3} {...rest} />;
});

export function Field({ label, hint, error, required, children, className }: { label: string; hint?: string; error?: string | null; required?: boolean; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">
        {label}
        {required && (
          <span className="ml-0.5 text-red-700 dark:text-red-400" aria-hidden>
            *
          </span>
        )}
      </label>
      {children(id)}
      {error ? (
        <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-800 dark:text-ink-100">
      <input type="checkbox" className="h-4 w-4 rounded border-ink-400 accent-brand-700" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/* ------------------------------ Contenedores ------------------------------ */
export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn('rounded-xl border border-ink-200 bg-white shadow-card dark:border-ink-700 dark:bg-ink-900', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 px-4 py-3 dark:border-ink-700">
          {title && <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-ink-900 dark:text-ink-50 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-300">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONE: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-900/30 dark:text-brand-200 dark:ring-brand-800',
  red: 'bg-red-50 text-red-800 ring-red-200 dark:bg-red-900/30 dark:text-red-200 dark:ring-red-800',
  amber: 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800',
  blue: 'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:ring-sky-800',
  gray: 'bg-ink-100 text-ink-700 ring-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:ring-ink-700',
};
export type Tone = keyof typeof TONE;

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', TONE[tone], className)}>{children}</span>;
}

export function StatCard({ label, value, hint, tone = 'gray' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  const bar: Record<string, string> = { brand: 'bg-brand-600', red: 'bg-red-600', amber: 'bg-amber-500', blue: 'bg-sky-600', gray: 'bg-ink-400' };
  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-white p-4 shadow-card dark:border-ink-700 dark:bg-ink-900">
      <span className={cn('absolute inset-y-0 left-0 w-1', bar[tone])} aria-hidden />
      <p className="text-xs font-medium uppercase tracking-wide text-ink-600 dark:text-ink-300">{label}</p>
      <p className="num mt-1 whitespace-nowrap text-xl font-bold text-ink-900 dark:text-ink-50 sm:text-2xl">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-300">{hint}</p>}
    </div>
  );
}

/* ------------------------------ Estados ------------------------------ */
export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" role="status" aria-label="Cargando">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-ink-600 dark:text-ink-300" role="status">
      <Spinner />
      {label}
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-md bg-ink-100 dark:bg-ink-800" />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, action, icon = 'box' }: { title: string; hint?: string; action?: ReactNode; icon?: Parameters<typeof Icon>[0]['name'] }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="font-semibold text-ink-900 dark:text-ink-50">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-ink-600 dark:text-ink-300">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof ApiError ? error.message : 'No se pudieron cargar los datos.';
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center" role="alert">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
        <Icon name="alert" className="h-6 w-6" />
      </span>
      <p className="font-semibold text-ink-900 dark:text-ink-50">Algo salió mal</p>
      <p className="mt-1 max-w-sm text-sm text-ink-600 dark:text-ink-300">{msg}</p>
      {onRetry && (
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          <Icon name="refresh" className="h-4 w-4" /> Reintentar
        </Button>
      )}
    </div>
  );
}

/* ------------------------------ Modal ------------------------------ */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus],input:not([disabled]),select:not([disabled]),textarea:not([disabled])') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab' && el) {
        const nodes = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!nodes.length) return;
        const a = nodes[0];
        const z = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink-950/60" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn('relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-ink-900 sm:rounded-2xl', width)}>
        <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5 dark:border-ink-700">
          <h2 id={titleId} className="text-base font-semibold text-ink-900 dark:text-ink-50">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800" aria-label="Cerrar">
            <Icon name="x" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-ink-200 px-5 py-3 dark:border-ink-700">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  danger,
  onConfirm,
  onClose,
  children,
  disabled,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown> | void;
  onClose: () => void;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      /* el llamador muestra el error */
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={run} loading={busy} disabled={disabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink-700 dark:text-ink-200">{message}</div>
      {children}
    </Modal>
  );
}

/* ------------------------------ Tablas y navegación ------------------------------ */
export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  hideOnMobile?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, dense }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string | number; onRowClick?: (r: T) => void; dense?: boolean }) {
  const al = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50 dark:border-ink-700 dark:bg-ink-800/60">
            {columns.map((c, i) => (
              <th key={i} scope="col" className={cn('whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-300', al(c.align), c.hideOnMobile && 'hidden md:table-cell')}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn(onRowClick && 'cursor-pointer', 'hover:bg-ink-50 dark:hover:bg-ink-800/50')}>
              {columns.map((c, i) => (
                <td key={i} className={cn('px-3 text-ink-800 dark:text-ink-100', dense ? 'py-1.5' : 'py-2.5', al(c.align), c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 px-4 py-3 text-sm dark:border-ink-700" aria-label="Paginación">
      <span className="text-ink-600 dark:text-ink-300">
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <span className="num px-1 text-ink-700 dark:text-ink-200">
          {page} / {pages}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Siguiente
        </Button>
      </div>
    </nav>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string; count?: number }>; value: T; onChange: (t: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-ink-200 dark:border-ink-700" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn('-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors', value === t.id ? 'border-brand-700 text-brand-800 dark:border-brand-500 dark:text-brand-200' : 'border-transparent text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50')}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-xs text-ink-700 dark:bg-ink-800 dark:text-ink-200">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', className, inputRef }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; inputRef?: React.Ref<HTMLInputElement> }) {
  return (
    <div className={cn('relative', className)}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
      <Input ref={inputRef} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" aria-label={placeholder} />
    </div>
  );
}

/* ------------------------------ Insignias de dominio ------------------------------ */
export function StockBadge({ status, qty }: { status: StockStatus; qty?: number }) {
  const map: Record<StockStatus, { tone: Tone; label: string }> = { OUT: { tone: 'red', label: 'Agotado' }, LOW: { tone: 'amber', label: 'Stock bajo' }, OK: { tone: 'brand', label: 'Disponible' } };
  const m = map[status];
  return (
    <Badge tone={m.tone}>
      {qty != null ? `${qty} · ` : ''}
      {m.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: AlertPriority }) {
  const tone: Record<AlertPriority, Tone> = { CRITICAL: 'red', HIGH: 'amber', MEDIUM: 'blue' };
  return <Badge tone={tone[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}

export function AlertTypeBadge({ type }: { type: AlertType }) {
  const tone: Record<AlertType, Tone> = { OUT_OF_STOCK: 'red', LOW_STOCK: 'amber', EXPIRING: 'blue', EXPIRED: 'red' };
  return <Badge tone={tone[type]}>{ALERT_TYPE_LABEL[type]}</Badge>;
}

export function ExpiryBadge({ days }: { days: number | null }) {
  if (days == null) return <span className="text-ink-500">—</span>;
  if (days < 0) return <Badge tone="red">Vencido hace {-days} d</Badge>;
  if (days <= 30) return <Badge tone="red">{days} d</Badge>;
  if (days <= 90) return <Badge tone="amber">{days} d</Badge>;
  return <Badge tone="gray">{days} d</Badge>;
}
