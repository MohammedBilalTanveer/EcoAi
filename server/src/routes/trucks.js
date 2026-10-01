import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { truckLocations, truckRoutes } from '../services/trucks.js';

const router = Router();

// GET /api/trucks/locations — live (simulated) positions, same path as before
router.get('/locations', requireAuth, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(truckLocations());
});

// GET /api/trucks/routes — road geometry + stops for drawing the routes
router.get('/routes', requireAuth, (_req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json(truckRoutes());
});

export default router;
