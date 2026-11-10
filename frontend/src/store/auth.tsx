import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, get, post, setSessionLostHandler } from '../api/client';
import type { Role, User } from '../api/types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    get<{ user: User }>('/auth/me')
      .then((r) => alive && setUser(r.user))
      .catch((e) => {
        if (!(e instanceof ApiError) || e.status !== 401) console.error('No se pudo verificar la sesión');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Si el servidor invalida la sesión (expiró o fue revocada), volvemos al login
  useEffect(() => {
    setSessionLostHandler(() => {
      setUser(null);
      qc.clear();
    });
    return () => setSessionLostHandler(null);
  }, [qc]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await post<{ user: User }>('/auth/login', { email, password });
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await post('/auth/logout');
    } finally {
      setUser(null);
      qc.clear();
    }
  }, [qc]);

  const can = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user]);
  const value = useMemo(() => ({ user, loading, login, logout, can }), [user, loading, login, logout, can]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return c;
}
