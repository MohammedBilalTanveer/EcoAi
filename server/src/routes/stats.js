import { Router } from 'express';
import { Claim, FoodListing, Report, User } from '../models/index.js';
import { impactOf } from '../services/food.js';
import { truckLocations } from '../services/trucks.js';

const router = Router();

let cache = { at: 0, value: null };
const TTL = 60 * 1000;

async function computePublicStats() {
  const [reportsTotal, reportsResolved, listingsTotal, ngos, restaurants, users, pickedUp] = await Promise.all([
    Report.countDocuments(),
    Report.countDocuments({ status: 'resolved' }),
    FoodListing.countDocuments({ removed: { $ne: true } }),
    User.countDocuments({ role: 'ngo', status: 'active' }),
    User.countDocuments({ role: 'restaurant', status: 'active' }),
    User.countDocuments(),
    Claim.find({ status: 'picked_up' })
      .select('quantity unitPrice originalUnitPrice listing')
      .populate('listing', 'quantity.unit')
      .lean(),
  ]);
  const impact = impactOf(
    pickedUp.filter((c) => c.listing).map((c) => ({ ...c, unit: c.listing.quantity.unit })),
  );
  const availableNow = await FoodListing.countDocuments({
    status: 'available',
    flagged: { $ne: true },
    removed: { $ne: true },
    'pickup.end': { $gt: new Date() },
  });
  return {
    reports: { total: reportsTotal, resolved: reportsResolved },
    food: { listings: listingsTotal, availableNow, ...impact },
    community: { users, ngos, restaurants },
    trucks: (() => {
      const fleet = truckLocations();
      return { active: fleet.filter((t) => t.onDuty).length, total: fleet.length };
    })(),
    updatedAt: new Date(),
  };
}

// GET /api/stats/public — headline impact numbers for the home page
router.get('/public', async (_req, res) => {
  if (!cache.value || Date.now() - cache.at > TTL) {
    cache = { at: Date.now(), value: await computePublicStats() };
  }
  res.json(cache.value);
});

export default router;
