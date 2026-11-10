import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, get, post } from '../api/client';
import type { Customer, FrequentProduct, PaymentMethod, Product, SaleDetail } from '../api/types';
import { CustomerForm } from '../components/CustomerForm';
import { Icon } from '../components/Icon';
import { Badge, Button, Checkbox, cn, ConfirmDialog, EmptyState, Input, Modal, Spinner, StockBadge } from '../components/ui';
import { errMsg, useDebounce } from '../hooks/common';
import { duration, money, PAYMENT_LABEL } from '../lib/format';
import { computeTotals } from '../lib/totals';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';

interface Line {
  product: Product;
  qty: number;
  discountPct: number;
}

const SELLER_MAX_DISCOUNT = 5; // el servidor es quien manda (ver MAX_SELLER_DISCOUNT_PCT)
const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'YAPE', 'PLIN'];
const QUICK_CASH = [10, 20, 50, 100, 200];

/** "3*7750123" → cantidad 3, código 7750123 */
function parseQuery(raw: string): { qty: number; term: string } {
  const m = /^(\d{1,3})\s*[*xX]\s*(.+)$/.exec(raw.trim());
  return m ? { qty: Math.max(1, parseInt(m[1], 10)), term: m[2].trim() } : { qty: 1, term: raw.trim() };
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function POS() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const maxPct = user?.role === 'ADMIN' ? 100 : SELLER_MAX_DISCOUNT;

  const [lines, setLines] = useState<Line[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const [globalPct, setGlobalPct] = useState(0);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custQuery, setCustQuery] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [done, setDone] = useState<SaleDetail | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const debounced = useDebounce(query, 150);
  const { term } = parseQuery(debounced);

  /* ---------- búsqueda instantánea ---------- */
  const search = useQuery({
    queryKey: ['pos-search', term],
    queryFn: () => get<{ data: Product[] }>('/products/search', { q: term, limit: 8 }),
    enabled: term.length >= 1,
    staleTime: 5_000,
    placeholderData: (prev) => prev,
  });
  const results = term.length >= 1 ? (search.data?.data ?? []) : [];
  useEffect(() => setHi(0), [term]);

  /* ---------- stock en tiempo real de los ítems del carrito ---------- */
  const liveQueries = useQueries({
    queries: lines.map((l) => ({
      queryKey: ['products', 'live', l.product.id],
      queryFn: () => get<{ data: Product }>(`/products/${l.product.id}`),
      staleTime: 10_000,
      refetchInterval: 30_000,
    })),
  });
  const liveStock = useMemo(() => {
    const m = new Map<number, number>();
    lines.forEach((l, i) => {
      const d = liveQueries[i]?.data?.data;
      m.set(l.product.id, d ? d.availableStock : l.product.availableStock);
    });
    return m;
  }, [lines, liveQueries]);
  const liveRef = useRef(liveStock);
  liveRef.current = liveStock;

  /* ---------- clientes ---------- */
  const dCust = useDebounce(custQuery, 200);
  const custSearch = useQuery({
    queryKey: ['customers', 'search', dCust],
    queryFn: () => get<{ data: Customer[] }>('/customers/search', { q: dCust }),
    enabled: dCust.trim().length >= 2 && !customer,
  });
  const frequent = useQuery({
    queryKey: ['customers', 'frequent', customer?.id],
    queryFn: () => get<{ data: FrequentProduct[] }>(`/customers/${customer!.id}/frequent`),
    enabled: !!customer,
  });

  /* ---------- tiempo de atención (primer ítem → confirmación) ---------- */
  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  /* ---------- totales ---------- */
  const totals = useMemo(() => computeTotals(lines.map((l) => ({ unitPrice: l.product.salePrice, quantity: l.qty, discountPct: l.discountPct })), globalPct), [lines, globalPct]);
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);
  const needsRx = lines.some((l) => l.product.requiresPrescription);
  const overStock = lines.filter((l) => l.qty > (liveStock.get(l.product.id) ?? l.product.availableStock));

  /* ---------- acciones sobre el carrito ---------- */
  const reportStockout = (p: Product, qty: number) => {
    post('/sales/stockout', { productId: p.id, requestedQty: qty }).catch(() => undefined);
  };

  const addProduct = useCallback(
    (p: Product, qty = 1) => {
      const cur = linesRef.current;
      const idx = cur.findIndex((l) => l.product.id === p.id);
      const have = idx >= 0 ? cur[idx].qty : 0;
      const available = idx >= 0 ? (liveRef.current.get(p.id) ?? p.availableStock) : p.availableStock;
      if (available <= 0) {
        toast.error(`"${p.name}" está agotado. No se puede vender.`);
        reportStockout(p, qty);
        return false;
      }
      let add = qty;
      if (have + qty > available) {
        add = available - have;
        if (add <= 0) {
          toast.error(`Stock máximo alcanzado: solo hay ${available} unidad(es) de "${p.name}".`);
          reportStockout(p, qty);
          return false;
        }
        toast.warning(`Solo hay ${available} unidad(es) de "${p.name}". Se agregaron ${add}.`);
        reportStockout(p, qty - add);
      }
      if (!startedAt && cur.length === 0) setStartedAt(new Date().toISOString());
      if (p.daysToExpiry != null && p.daysToExpiry <= 30 && idx < 0) {
        toast.warning(`"${p.name}": el lote más próximo vence en ${p.daysToExpiry} día(s). Se despacha primero (FEFO).`);
      }
      if (p.requiresPrescription && idx < 0) toast.info(`"${p.name}" requiere receta médica. Verifícala al cobrar.`);
      setLines(idx >= 0 ? cur.map((l, i) => (i === idx ? { ...l, qty: l.qty + add, product: { ...l.product, ...p } } : l)) : [...cur, { product: p, qty: add, discountPct: 0 }]);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startedAt, toast],
  );

  const setQty = (id: number, qty: number) => {
    const line = lines.find((l) => l.product.id === id);
    if (!line) return;
    const available = liveStock.get(id) ?? line.product.availableStock;
    if (qty > available) {
      toast.warning(`Stock disponible: ${available} unidad(es).`);
      reportStockout(line.product, qty - available);
      qty = available;
    }
    if (qty <= 0) return removeLine(id);
    setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, qty } : l)));
  };
  const setLineDiscount = (id: number, pct: number) => setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, discountPct: Math.min(Math.max(pct, 0), maxPct) } : l)));
  const removeLine = (id: number) =>
    setLines((ls) => {
      const next = ls.filter((l) => l.product.id !== id);
      if (!next.length) setStartedAt(null);
      return next;
    });

  const resetSale = useCallback(() => {
    setLines([]);
    setStartedAt(null);
    setQuery('');
    setGlobalPct(0);
    setCustomer(null);
    setCustQuery('');
    setPayOpen(false);
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  /* ---------- Enter en el buscador: lector de códigos / selección ---------- */
  const submitQuery = async () => {
    const { qty, term: t } = parseQuery(query);
    if (!t) return;
    // Resultado resaltado de la lista (si el texto coincide con lo mostrado)
    const shown = t === term ? results : [];
    try {
      let product: Product | undefined;
      if (shown.length) {
        // Coincidencia exacta de código (lector de barras) tiene prioridad sobre el resaltado
        product = shown.find((p) => p.barcode === t || p.sku.toLowerCase() === t.toLowerCase()) ?? shown[hi] ?? shown[0];
      } else {
        const r = await get<{ data: Product[] }>('/products/search', { q: t, limit: 5 });
        product = r.data.find((p) => p.barcode === t || p.sku.toLowerCase() === t.toLowerCase()) ?? r.data[0];
      }
      if (!product) {
        toast.error(`No se encontró ningún producto para "${t}".`);
        return;
      }
      if (addProduct(product, qty)) setQuery('');
    } catch (e) {
      toast.error(errMsg(e));
    }
    searchRef.current?.focus();
  };

  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void submitQuery();
    }
  };

  /* ---------- atajos globales: F2 buscar · F4 cobrar · F6 cliente · Esc cancelar ---------- */
  const modalOpen = payOpen || confirmClear || showNewCustomer || !!done;
  const openPay = useCallback(() => {
    if (!linesRef.current.length) {
      toast.info('Agrega al menos un producto para cobrar.');
      return;
    }
    setPayOpen(true);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen) return;
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        openPay();
      } else if (e.key === 'F6') {
        e.preventDefault();
        document.getElementById('pos-customer')?.focus();
      } else if (e.key === 'Escape') {
        if (query) setQuery('');
        else if (linesRef.current.length) setConfirmClear(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, openPay, query]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  /* ---------- reintento de stock tras un rechazo del servidor ---------- */
  const refreshStock = () => {
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['pos-search'] });
  };

  return (
    <div className="mx-auto max-w-7xl pb-28 lg:pb-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900 dark:text-ink-50 sm:text-2xl">Punto de venta</h1>
          <p className="text-sm text-ink-600 dark:text-ink-300">Escanea el código o escribe el nombre y presiona Enter. Cantidad rápida: <span className="kbd">3*código</span></p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-700 dark:text-ink-200">
          <span><span className="kbd">F2</span> Buscar</span>
          <span><span className="kbd">F4</span> Cobrar</span>
          <span><span className="kbd">F6</span> Cliente</span>
          <span><span className="kbd">Esc</span> Cancelar</span>
          {startedAt && (
            <Badge tone="blue" className="ml-1">
              <Icon name="refresh" className="mr-1 h-3 w-3" /> Atención {mmss(elapsed)}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------- Izquierda: búsqueda y carrito ------------- */}
        <div className="space-y-4 lg:col-span-2">
          <div className="relative">
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Código de barras, SKU, nombre o principio activo…"
                className="h-14 pl-11 text-base shadow-card"
                aria-label="Buscar producto"
                aria-controls="pos-results"
                aria-expanded={results.length > 0}
                role="combobox"
                aria-autocomplete="list"
                autoComplete="off"
                inputMode="search"
                autoFocus
              />
              {search.isFetching && <Spinner className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" />}
            </div>

            {term.length >= 1 && query.trim() && (
              <ul id="pos-results" role="listbox" className="absolute z-20 mt-1 max-h-[26rem] w-full overflow-y-auto rounded-xl border border-ink-200 bg-white shadow-xl dark:border-ink-700 dark:bg-ink-900">
                {search.isError ? (
                  <li className="px-4 py-3 text-sm text-red-700 dark:text-red-300">No se pudo buscar: {errMsg(search.error)}</li>
                ) : results.length === 0 && !search.isFetching ? (
                  <li className="px-4 py-4 text-sm text-ink-600 dark:text-ink-300">Sin resultados para “{term}”.</li>
                ) : (
                  results.map((p, i) => (
                    <li
                      key={p.id}
                      role="option"
                      aria-selected={i === hi}
                      onMouseEnter={() => setHi(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (addProduct(p, parseQuery(query).qty)) setQuery('');
                        searchRef.current?.focus();
                      }}
                      className={cn('flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5', i === hi ? 'bg-brand-50 dark:bg-brand-900/30' : '')}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">
                          {p.name}
                          {p.requiresPrescription && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">Rx</span>}
                        </p>
                        <p className="truncate text-xs text-ink-600 dark:text-ink-300">
                          {[p.presentation, p.activeIngredient, p.sku].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="num text-sm font-bold text-ink-900 dark:text-ink-50">{money(p.salePrice)}</span>
                        <StockBadge status={p.stockStatus} qty={p.availableStock} />
                      </div>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          {customer && frequent.data && frequent.data.data.length > 0 && (
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-800 dark:bg-brand-900/20">
              <p className="mb-2 text-xs font-semibold text-brand-900 dark:text-brand-200">Frecuentes de {customer.name.split(' ')[0]} (clic para agregar)</p>
              <div className="flex flex-wrap gap-2">
                {frequent.data.data.slice(0, 6).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    disabled={f.availableStock <= 0}
                    onClick={async () => {
                      try {
                        const r = await get<{ data: Product }>(`/products/${f.id}`);
                        addProduct(r.data);
                      } catch (e) {
                        toast.error(errMsg(e));
                      }
                    }}
                    className="rounded-full border border-brand-300 bg-white px-3 py-1 text-xs font-medium text-brand-900 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-700 dark:bg-ink-900 dark:text-brand-200 dark:hover:bg-ink-800"
                  >
                    + {f.name} <span className="text-ink-500">· {money(f.salePrice)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <section className="rounded-xl border border-ink-200 bg-white shadow-card dark:border-ink-700 dark:bg-ink-900" aria-label="Carrito de venta">
            <header className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-700">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                Detalle de la venta <span className="ml-1 text-ink-600 dark:text-ink-300">({itemCount} {itemCount === 1 ? 'unidad' : 'unidades'})</span>
              </h2>
              {lines.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
                  <Icon name="trash" className="h-4 w-4" /> Vaciar
                </Button>
              )}
            </header>

            {lines.length === 0 ? (
              <EmptyState title="El carrito está vacío" hint="Escanea un producto o búscalo por nombre. Presiona Enter para agregarlo." icon="cart" />
            ) : (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {lines.map((l, i) => {
                  const avail = liveStock.get(l.product.id) ?? l.product.availableStock;
                  const lt = totals.lines[i];
                  const over = l.qty > avail;
                  return (
                    <li key={l.product.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{l.product.name}</p>
                        <p className="truncate text-xs text-ink-600 dark:text-ink-300">
                          {l.product.presentation} · {money(l.product.salePrice)} c/u · disp. {avail}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {l.product.requiresPrescription && <Badge tone="amber">Requiere receta</Badge>}
                          {l.product.daysToExpiry != null && l.product.daysToExpiry <= 30 && <Badge tone="red">Lote vence en {l.product.daysToExpiry} d</Badge>}
                          {over && <Badge tone="red">Stock insuficiente (máx. {avail})</Badge>}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1 sm:order-2" role="group" aria-label={`Cantidad de ${l.product.name}`}>
                        <button type="button" onClick={() => setQty(l.product.id, l.qty - 1)} className="h-9 w-9 rounded-lg border border-ink-300 text-lg font-bold text-ink-800 hover:bg-ink-100 dark:border-ink-600 dark:text-ink-100 dark:hover:bg-ink-800" aria-label="Disminuir cantidad">
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={avail}
                          value={l.qty}
                          onChange={(e) => setQty(l.product.id, parseInt(e.target.value || '0', 10))}
                          onFocus={(e) => e.target.select()}
                          className="num h-9 w-14 rounded-lg border border-ink-300 bg-white text-center text-sm font-semibold text-ink-900 dark:border-ink-600 dark:bg-ink-800 dark:text-ink-50"
                          aria-label="Cantidad"
                        />
                        <button type="button" onClick={() => setQty(l.product.id, l.qty + 1)} className="h-9 w-9 rounded-lg border border-ink-300 text-lg font-bold text-ink-800 hover:bg-ink-100 dark:border-ink-600 dark:text-ink-100 dark:hover:bg-ink-800" aria-label="Aumentar cantidad">
                          +
                        </button>
                      </div>

                      <div className="flex items-center gap-1 sm:order-3">
                        <label className="sr-only" htmlFor={`d-${l.product.id}`}>
                          Descuento (%)
                        </label>
                        <input
                          id={`d-${l.product.id}`}
                          type="number"
                          min={0}
                          max={maxPct}
                          step={1}
                          value={l.discountPct || ''}
                          placeholder="0"
                          onChange={(e) => setLineDiscount(l.product.id, parseFloat(e.target.value || '0'))}
                          className="num h-9 w-14 rounded-lg border border-ink-300 bg-white px-1 text-center text-sm text-ink-900 dark:border-ink-600 dark:bg-ink-800 dark:text-ink-50"
                          title={`Descuento por ítem (máx. ${maxPct} %)`}
                        />
                        <span className="text-xs text-ink-600 dark:text-ink-300">%</span>
                      </div>

                      <div className="flex items-center justify-end gap-2 sm:order-4 sm:w-28">
                        <span className="num text-right text-sm font-bold text-ink-900 dark:text-ink-50">{money(lt.total)}</span>
                        <button type="button" onClick={() => removeLine(l.product.id)} className="rounded-md p-1.5 text-ink-600 hover:bg-red-50 hover:text-red-700 dark:text-ink-300 dark:hover:bg-red-900/30" aria-label={`Quitar ${l.product.name}`}>
                          <Icon name="x" className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* ------------- Derecha: cliente, totales y cobro ------------- */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-xl border border-ink-200 bg-white p-4 shadow-card dark:border-ink-700 dark:bg-ink-900">
            <h2 className="mb-2 text-sm font-semibold text-ink-900 dark:text-ink-50">Cliente</h2>
            {customer ? (
              <div className="flex items-start justify-between gap-2 rounded-lg bg-ink-50 p-3 dark:bg-ink-800">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{customer.name}</p>
                  <p className="text-xs text-ink-600 dark:text-ink-300">
                    {customer.docType} {customer.docNumber}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setCustomer(null)} aria-label="Quitar cliente">
                  <Icon name="x" className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input id="pos-customer" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder="Consumidor final · buscar DNI/RUC o nombre (F6)" aria-label="Buscar cliente" autoComplete="off" />
                {dCust.trim().length >= 2 && (
                  <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-ink-200 bg-white shadow-lg dark:border-ink-700 dark:bg-ink-900">
                    {(custSearch.data?.data ?? []).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-ink-50 dark:hover:bg-ink-800"
                          onClick={() => {
                            setCustomer(c);
                            setCustQuery('');
                          }}
                        >
                          <span className="font-medium text-ink-900 dark:text-ink-50">{c.name}</span>
                          <span className="ml-2 text-xs text-ink-600 dark:text-ink-300">
                            {c.docType} {c.docNumber}
                          </span>
                        </button>
                      </li>
                    ))}
                    {custSearch.isSuccess && custSearch.data.data.length === 0 && <li className="px-3 py-2 text-sm text-ink-600 dark:text-ink-300">Sin resultados.</li>}
                    <li className="border-t border-ink-100 dark:border-ink-800">
                      <button type="button" className="block w-full px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-ink-50 dark:text-brand-300 dark:hover:bg-ink-800" onClick={() => setShowNewCustomer(true)}>
                        + Alta rápida de cliente
                      </button>
                    </li>
                  </ul>
                )}
                {dCust.trim().length < 2 && (
                  <button type="button" onClick={() => setShowNewCustomer(true)} className="mt-2 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
                    + Alta rápida de cliente
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-ink-200 bg-white p-4 shadow-card dark:border-ink-700 dark:bg-ink-900" aria-label="Totales">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-ink-700 dark:text-ink-200">
                <dt>Subtotal (sin IGV)</dt>
                <dd className="num">{money(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-700 dark:text-ink-200">
                <dt>IGV (18 %)</dt>
                <dd className="num">{money(totals.igv)}</dd>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-brand-800 dark:text-brand-300">
                  <dt>Descuentos</dt>
                  <dd className="num">− {money(totals.discount)}</dd>
                </div>
              )}
            </dl>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-ink-200 pt-2 dark:border-ink-700">
              <label htmlFor="g-disc" className="text-xs text-ink-700 dark:text-ink-200">
                Descuento total (máx. {maxPct} %)
              </label>
              <div className="flex items-center gap-1">
                <input id="g-disc" type="number" min={0} max={maxPct} value={globalPct || ''} placeholder="0" onChange={(e) => setGlobalPct(Math.min(Math.max(parseFloat(e.target.value || '0'), 0), maxPct))} className="num h-8 w-16 rounded-lg border border-ink-300 bg-white px-1 text-center text-sm text-ink-900 dark:border-ink-600 dark:bg-ink-800 dark:text-ink-50" />
                <span className="text-xs text-ink-600 dark:text-ink-300">%</span>
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between border-t border-ink-200 pt-3 dark:border-ink-700">
              <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">TOTAL</span>
              <span className="num text-3xl font-extrabold text-brand-800 dark:text-brand-300" aria-live="polite">
                {money(totals.total)}
              </span>
            </div>
            {overStock.length > 0 && <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">Hay productos con cantidad mayor al stock disponible. Corrígelos para cobrar.</p>}
            <Button size="lg" className="mt-3 hidden w-full lg:inline-flex" onClick={openPay} disabled={!lines.length || overStock.length > 0}>
              Cobrar <span className="kbd ml-1 !border-white/40 !bg-white/20 !text-white">F4</span>
            </Button>
          </section>
        </aside>
      </div>

      {/* Barra inferior fija (móvil / tablet) */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-ink-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,.08)] dark:border-ink-700 dark:bg-ink-900 lg:hidden">
        <div>
          <p className="text-xs text-ink-600 dark:text-ink-300">{itemCount} unid.</p>
          <p className="num text-2xl font-extrabold text-brand-800 dark:text-brand-300">{money(totals.total)}</p>
        </div>
        <Button size="lg" onClick={openPay} disabled={!lines.length || overStock.length > 0}>
          Cobrar
        </Button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Cancelar la venta"
        message="Se vaciará el carrito y se perderá el tiempo de atención en curso. ¿Deseas continuar?"
        confirmLabel="Sí, cancelar venta"
        danger
        onClose={() => {
          setConfirmClear(false);
          setTimeout(() => searchRef.current?.focus(), 50);
        }}
        onConfirm={() => resetSale()}
      />

      <CustomerForm
        open={showNewCustomer}
        onClose={() => setShowNewCustomer(false)}
        initialDoc={/^\d{8}$|^\d{11}$/.test(custQuery.trim()) ? custQuery.trim() : undefined}
        onSaved={(c) => {
          setCustomer(c);
          setCustQuery('');
        }}
      />

      {payOpen && (
        <PaymentModal
          total={totals.total}
          needsRx={needsRx}
          onClose={() => {
            setPayOpen(false);
            setTimeout(() => searchRef.current?.focus(), 50);
          }}
          onConfirm={async ({ method, cash, rx }) => {
            try {
              const r = await post<{ data: SaleDetail }>('/sales', {
                items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty, discountPct: l.discountPct })),
                discountPct: globalPct,
                paymentMethod: method,
                cashReceived: method === 'CASH' ? cash : undefined,
                customerId: customer?.id ?? null,
                startedAt: startedAt ?? undefined,
                prescriptionChecked: rx,
              });
              setPayOpen(false);
              setDone(r.data);
              refreshStock();
              qc.invalidateQueries({ queryKey: ['sales'] });
              return null;
            } catch (e) {
              if (e instanceof ApiError && (e.code === 'STOCK_INSUFICIENTE' || e.code === 'STOCK_CAMBIO')) refreshStock();
              return errMsg(e);
            }
          }}
        />
      )}

      <Modal
        open={!!done}
        onClose={() => {
          setDone(null);
          resetSale();
        }}
        title="Venta registrada"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => done && window.open(`/api/sales/${done.id}/ticket`, '_blank', 'noopener,width=420,height=700')}
            >
              <Icon name="printer" className="h-4 w-4" /> Imprimir ticket
            </Button>
            <Button
              data-autofocus
              onClick={() => {
                setDone(null);
                resetSale();
              }}
            >
              Nueva venta
            </Button>
          </>
        }
      >
        {done && (
          <div className="text-center">
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
              <Icon name="check" className="h-7 w-7" />
            </span>
            <p className="text-sm text-ink-600 dark:text-ink-300">Nota de venta interna N.º {String(done.number).padStart(6, '0')}</p>
            <p className="num my-1 text-4xl font-extrabold text-ink-900 dark:text-ink-50">{money(done.total)}</p>
            <p className="text-sm text-ink-700 dark:text-ink-200">{PAYMENT_LABEL[done.paymentMethod]}</p>
            {done.changeGiven != null && done.paymentMethod === 'CASH' && (
              <p className="mt-3 rounded-lg bg-amber-50 py-3 text-lg font-bold text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
                Vuelto: <span className="num">{money(done.changeGiven)}</span>
              </p>
            )}
            <p className="mt-3 text-xs text-ink-600 dark:text-ink-300">Tiempo de atención: {duration(done.serviceSeconds)} · Stock descontado por lote (FEFO)</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------ Modal de cobro ------------------------------ */
function PaymentModal({ total, needsRx, onClose, onConfirm }: { total: number; needsRx: boolean; onClose: () => void; onConfirm: (p: { method: PaymentMethod; cash: number; rx: boolean }) => Promise<string | null> }) {
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [cashStr, setCashStr] = useState('');
  const [rx, setRx] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cash = parseFloat(cashStr.replace(',', '.'));
  const received = Number.isFinite(cash) ? cash : 0;
  const change = Math.round((received - total) * 100) / 100;
  const cashOk = method !== 'CASH' || received + 1e-9 >= total;
  const canPay = cashOk && (!needsRx || rx) && !busy;

  const pay = async () => {
    if (!canPay) return;
    setBusy(true);
    setError(null);
    const err = await onConfirm({ method, cash: method === 'CASH' ? (received || total) : 0, rx });
    if (err) setError(err);
    setBusy(false);
  };

  const suggestions = useMemo(() => {
    const s = new Set<number>([Math.ceil(total)]);
    for (const q of QUICK_CASH) if (q >= total) s.add(q);
    return [...s].sort((a, b) => a - b).slice(0, 5);
  }, [total]);

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="Cobrar venta"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Volver <span className="kbd ml-1">Esc</span>
          </Button>
          <Button size="lg" onClick={pay} loading={busy} disabled={!canPay} data-testid="confirm-pay">
            Confirmar cobro <span className="kbd ml-1 !border-white/40 !bg-white/20 !text-white">Enter</span>
          </Button>
        </>
      }
    >
      <div
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
            e.preventDefault();
            void pay();
          }
        }}
      >
        <p className="text-center text-sm text-ink-600 dark:text-ink-300">Total a cobrar</p>
        <p className="num mb-4 text-center text-4xl font-extrabold text-brand-800 dark:text-brand-300">{money(total)}</p>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-900/30 dark:text-red-100" role="alert">
            {error}
          </div>
        )}

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-medium text-ink-700 dark:text-ink-200">Medio de pago</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                aria-pressed={method === m}
                className={cn('h-12 rounded-lg border-2 text-sm font-semibold transition-colors', method === m ? 'border-brand-700 bg-brand-50 text-brand-900 dark:border-brand-500 dark:bg-brand-900/30 dark:text-brand-100' : 'border-ink-300 text-ink-800 hover:bg-ink-50 dark:border-ink-600 dark:text-ink-100 dark:hover:bg-ink-800')}
              >
                {PAYMENT_LABEL[m]}
              </button>
            ))}
          </div>
          {(method === 'YAPE' || method === 'PLIN') && <p className="mt-2 text-xs text-ink-600 dark:text-ink-300">Solo se registra el medio de pago; confirma la transferencia en tu app antes de cobrar.</p>}
        </fieldset>

        {method === 'CASH' && (
          <div className="mb-4">
            <label htmlFor="cash" className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">
              Efectivo recibido (S/)
            </label>
            <Input id="cash" data-autofocus inputMode="decimal" value={cashStr} onChange={(e) => setCashStr(e.target.value)} placeholder={total.toFixed(2)} className="h-12 text-lg" autoFocus />
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => setCashStr(String(s))} className="rounded-full border border-ink-300 px-3 py-1 text-sm font-medium text-ink-800 hover:bg-ink-100 dark:border-ink-600 dark:text-ink-100 dark:hover:bg-ink-800">
                  {s === Math.ceil(total) && s !== total ? 'Exacto ' : ''}S/ {s}
                </button>
              ))}
            </div>
            <div className={cn('mt-3 flex items-center justify-between rounded-lg px-4 py-3', cashStr && change < 0 ? 'bg-red-50 text-red-900 dark:bg-red-900/30 dark:text-red-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100')} aria-live="polite">
              <span className="text-sm font-medium">{cashStr && change < 0 ? 'Falta' : 'Vuelto'}</span>
              <span className="num text-2xl font-extrabold">{money(cashStr ? Math.abs(change) : 0)}</span>
            </div>
          </div>
        )}

        {needsRx && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
            <p className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-100">Hay productos que requieren receta médica</p>
            <Checkbox checked={rx} onChange={setRx} label="Verifiqué la receta del cliente" />
          </div>
        )}
      </div>
    </Modal>
  );
}
