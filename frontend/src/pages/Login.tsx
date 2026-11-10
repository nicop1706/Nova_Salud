import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { homePathFor } from '../components/guards';
import { Icon } from '../components/Icon';
import { Button, Field, Input } from '../components/ui';
import { errMsg } from '../hooks/common';
import { useAuth } from '../store/auth';

const DEMO = [
  { label: 'Administrador', email: 'admin@novasalud.pe' },
  { label: 'Vendedor', email: 'vendedor@novasalud.pe' },
  { label: 'Almacenero', email: 'almacen@novasalud.pe' },
];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? homePathFor(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Ingresa tu correo y contraseña.');
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password);
      nav((loc.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setError(errMsg(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-sky-50 px-4 py-10 dark:from-ink-950 dark:via-ink-900 dark:to-ink-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-lg">
            <Icon name="pill" className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-50">Nova Salud</h1>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">Inicia sesión para gestionar la botica</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-ink-200 bg-white p-6 shadow-card dark:border-ink-700 dark:bg-ink-900" noValidate aria-label="Inicio de sesión">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-900/30 dark:text-red-100" role="alert">
              {error}
            </div>
          )}
          <Field label="Correo electrónico" required>
            {(id) => <Input id={id} type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@novasalud.pe" />}
          </Field>
          <Field label="Contraseña" required>
            {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Ingresar
          </Button>

          {import.meta.env.DEV && (
            <div className="border-t border-ink-200 pt-3 dark:border-ink-700">
              <p className="mb-2 text-xs text-ink-600 dark:text-ink-300">Modo desarrollo · rellenar correo:</p>
              <div className="flex flex-wrap gap-2">
                {DEMO.map((d) => (
                  <button key={d.email} type="button" onClick={() => setEmail(d.email)} className="rounded-full border border-ink-300 px-3 py-1 text-xs text-ink-700 hover:bg-ink-100 dark:border-ink-600 dark:text-ink-200 dark:hover:bg-ink-800">
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
        <p className="mt-4 text-center text-xs text-ink-600 dark:text-ink-300">Sistema interno · Los comprobantes no tienen validez tributaria (SUNAT)</p>
      </div>
    </div>
  );
}
