import { Router } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { aiStatus } from '../services/ai.js';
import adminRoutes from './admin.js';
import authRoutes from './auth.js';
import chatRoutes from './chat.js';
import foodRoutes from './food.js';
import geoRoutes from './geo.js';
import notificationRoutes from './notifications.js';
import reportRoutes from './reports.js';
import staffRoutes from './staff.js';
import statsRoutes from './stats.js';
import truckRoutes from './trucks.js';

const api = Router();

// Used by the host's health checks: 503 while the database is unreachable.
api.get('/health', (_req, res) => {
  const db = mongoose.connection.readyState === 1;
  res.status(db ? 200 : 503).json({ ok: db, db: db ? 'connected' : 'disconnected', uptime: Math.round(process.uptime()) });
});

// Public runtime config for the frontend (so only server/.env needs editing).
api.get('/config', (_req, res) => {
  res.json({
    googleClientId: env.googleClientId || null,
    features: { ...aiStatus(), email: env.mail.enabled },
  });
});

api.use('/auth', authRoutes);
api.use('/reports', reportRoutes);
api.use('/food', foodRoutes);
api.use('/chat', chatRoutes);
api.use('/trucks', truckRoutes);
api.use('/notifications', notificationRoutes);
api.use('/stats', statsRoutes);
api.use('/staff', staffRoutes);
api.use('/admin', adminRoutes);
api.use('/geo', geoRoutes);

export default api;
