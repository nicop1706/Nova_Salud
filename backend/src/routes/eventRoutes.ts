import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { eventHub } from '../realtime/eventHub';
import { alertSummary } from '../services/alertService';
import { ah } from '../utils/http';

export const eventRoutes = Router();

/** Canal SSE: stock, alertas y ventas en tiempo real. Requiere sesión (cookie httpOnly). */
eventRoutes.get(
  '/',
  authenticate,
  ah(async (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx: sin buffering
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    eventHub.send(res, 'hello', { user: req.user!.name });
    eventHub.send(res, 'alerts', await alertSummary());
    const remove = eventHub.add(res, req.user!.id, req.user!.role);
    req.on('close', remove);
  }),
);
