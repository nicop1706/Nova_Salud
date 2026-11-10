import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';

type Kind = 'success' | 'error' | 'info' | 'warning';
interface Toast {
  id: number;
  kind: Kind;
  text: string;
}
interface ToastCtx {
  push: (kind: Kind, text: string) => void;
  success: (t: string) => void;
  error: (t: string) => void;
  info: (t: string) => void;
  warning: (t: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const STYLE: Record<Kind, string> = {
  success: 'border-brand-600 bg-white text-ink-900 dark:bg-ink-800 dark:text-ink-50',
  error: 'border-red-600 bg-white text-ink-900 dark:bg-ink-800 dark:text-ink-50',
  warning: 'border-amber-500 bg-white text-ink-900 dark:bg-ink-800 dark:text-ink-50',
  info: 'border-sky-600 bg-white text-ink-900 dark:bg-ink-800 dark:text-ink-50',
};
const ICON: Record<Kind, string> = { success: '✓', error: '✕', warning: '!', info: 'i' };
const ICON_STYLE: Record<Kind, string> = { success: 'bg-brand-700', error: 'bg-red-700', warning: 'bg-amber-700', info: 'bg-sky-700' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((kind: Kind, text: string) => {
    const id = ++seq.current;
    setItems((x) => [...x.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4500);
  }, []);

  const value = useMemo<ToastCtx>(
    () => ({
      push,
      success: (t) => push('success', t),
      error: (t) => push('error', t),
      info: (t) => push('info', t),
      warning: (t) => push('warning', t),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-4" role="region" aria-label="Notificaciones" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border-l-4 p-3 shadow-lg ring-1 ring-black/5 ${STYLE[t.kind]}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${ICON_STYLE[t.kind]}`} aria-hidden>
              {ICON[t.kind]}
            </span>
            <p className="text-sm leading-snug">{t.text}</p>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast debe usarse dentro de ToastProvider');
  return c;
}
