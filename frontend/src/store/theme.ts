import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function initial(): Theme {
  try {
    const t = localStorage.getItem('ns_theme');
    if (t === 'dark' || t === 'light') return t;
  } catch {
    /* almacenamiento no disponible */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Modo oscuro opcional; la preferencia se recuerda en el navegador. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('ns_theme', theme);
    } catch {
      /* ignorar */
    }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, toggle };
}
