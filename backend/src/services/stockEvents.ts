import { logger } from '../config/logger';
import { eventHub } from '../realtime/eventHub';
import { recalculateAlerts } from './alertService';

/**
 * Se llama DESPUÉS de confirmar una transacción que cambió stock:
 *  1) avisa a los navegadores conectados (SSE) para refrescar existencias,
 *  2) recalcula las alertas (que a su vez emiten sus propios eventos).
 * No bloquea la respuesta HTTP ni propaga errores.
 */
export function stockChanged(productIds: number[]): void {
  eventHub.broadcast('stock', { productIds: [...new Set(productIds)] });
  recalculateAlerts().catch((err) => logger.error({ err }, 'No se pudieron recalcular las alertas'));
}
