// Cliente HTTP. La sesión viaja en cookies httpOnly (el JS nunca ve los tokens).
// Si el access token expira, se renueva automáticamente con el refresh token y se reintenta una vez.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;
interface Opts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

let onSessionLost: (() => void) | null = null;
export const setSessionLostHandler = (fn: (() => void) | null): void => {
  onSessionLost = fn;
};

export function qs(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function send(path: string, opts: Opts): Promise<Response> {
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    return await fetch(`/api${path}${qs(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }
}

async function toError(res: Response): Promise<ApiError> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* respuesta sin JSON */
  }
  const e = body?.error;
  return new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `Error ${res.status}`, e?.details);
}

let refreshing: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = send('/auth/refresh', { method: 'POST' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

const NO_REFRESH = ['/auth/login', '/auth/refresh', '/auth/logout'];

async function request(path: string, opts: Opts): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && !NO_REFRESH.includes(path)) {
    if (await refreshSession()) res = await send(path, opts);
    if (res.status === 401) {
      onSessionLost?.();
    }
  }
  return res;
}

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const res = await request(path, opts);
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Descarga un archivo (CSV, Excel, PDF) respetando la sesión. */
export async function download(path: string, query: Query, fallbackName: string): Promise<void> {
  const res = await request(path, { query });
  if (!res.ok) throw await toError(res);
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const get = <T>(path: string, query?: Query, signal?: AbortSignal) => api<T>(path, { query, signal });
export const post = <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T = void>(path: string) => api<T>(path, { method: 'DELETE' });
