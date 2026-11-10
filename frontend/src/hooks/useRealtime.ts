import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { AlertSummary } from '../api/types';
import { useToast } from '../store/toast';

/**
 * Conexión SSE con el servidor: actualiza existencias, alertas y ventas sin recargar la página.
 * - 'alerts': nuevo contador (barra superior)
 * - 'alert' : alerta recién abierta → notificación emergente
 * - 'stock' : cambió el stock → se refrescan las consultas de productos/lotes/POS
 * - 'sale'  : nueva venta → se refrescan dashboard e historial
 */
export function useRealtime(): { connected: boolean } {
  const qc = useQueryClient();
  const toast = useToast();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/events', { withCredentials: true });
    let shown = 0;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener('alerts', (e) => {
      qc.setQueryData(['alerts', 'summary'], { data: JSON.parse((e as MessageEvent).data) as AlertSummary });
      qc.invalidateQueries({ queryKey: ['alerts', 'list'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    });
    es.addEventListener('alert', (e) => {
      const a = JSON.parse((e as MessageEvent).data) as { priority: string; message: string };
      if (shown++ < 3) toast[a.priority === 'CRITICAL' ? 'error' : 'warning'](`Alerta: ${a.message}`);
    });
    es.addEventListener('stock', () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['pos-search'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    });
    es.addEventListener('sale', () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
    });

    return () => es.close();
  }, [qc, toast]);

  return { connected };
}
