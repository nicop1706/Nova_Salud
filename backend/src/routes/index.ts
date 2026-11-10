import { Router } from 'express';
import { db } from '../db/knex';
import { alertRoutes } from './alertRoutes';
import { authRoutes } from './authRoutes';
import { categoryRoutes, supplierRoutes } from './catalogRoutes';
import { customerRoutes } from './customerRoutes';
import { eventRoutes } from './eventRoutes';
import { inventoryRoutes } from './inventoryRoutes';
import { productRoutes } from './productRoutes';
import { reportRoutes } from './reportRoutes';
import { saleRoutes } from './saleRoutes';
import { auditRoutes, userRoutes } from './userRoutes';

export const apiRouter = Router();

apiRouter.get('/health', async (_req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'down' });
  }
});

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/audit', auditRoutes);
apiRouter.use('/categories', categoryRoutes);
apiRouter.use('/suppliers', supplierRoutes);
apiRouter.use('/products', productRoutes);
apiRouter.use('/inventory', inventoryRoutes);
apiRouter.use('/alerts', alertRoutes);
apiRouter.use('/sales', saleRoutes);
apiRouter.use('/customers', customerRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/events', eventRoutes);
