import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { userRepository } from '../repositories/userRepository';
import { recalculateAlerts } from '../services/alertService';

/** Tarea programada: recalcula las alertas (por defecto cada hora, en punto) y purga refresh tokens vencidos. */
export function startAlertsJob(): cron.ScheduledTask {
  if (!cron.validate(env.ALERT_CRON)) throw new Error(`ALERT_CRON inválido: ${env.ALERT_CRON}`);
  const task = cron.schedule(
    env.ALERT_CRON,
    async () => {
      try {
        const r = await recalculateAlerts();
        await userRepository.purgeExpiredRefresh();
        logger.info({ abiertas: r.opened, resueltas: r.resolved, total: r.summary.total }, 'Cron de alertas ejecutado');
      } catch (err) {
        logger.error({ err }, 'Falló el cron de alertas');
      }
    },
    { timezone: 'America/Lima' },
  );
  logger.info({ cron: env.ALERT_CRON }, 'Tarea programada de alertas activa');
  return task;
}
