import crypto from 'node:crypto';
import {
  CO2_PER_KG_FOOD,
  KG_PER_UNIT,
  MEALS_PER_UNIT,
  PICKUP_GRACE_MINUTES,
  SAFE_HOURS,
} from '../models/constants.js';
import { Claim, FoodListing } from '../models/index.js';
import { notify } from './notify.js';

export function computeSafeUntil(storage, preparedAt, bestBefore) {
  if (storage === 'packaged' && bestBefore) return bestBefore;
  return new Date(preparedAt.getTime() + (SAFE_HOURS[storage] ?? SAFE_HOURS.room_temp) * 3600 * 1000);
}

export const claimExpiry = (pickupEnd) => new Date(pickupEnd.getTime() + PICKUP_GRACE_MINUTES * 60 * 1000);

export async function generatePickupCode(listingId) {
  const taken = new Set(
    (await Claim.find({ listing: listingId, status: 'reserved' }).select('pickupCode').lean()).map((c) => c.pickupCode),
  );
  let code;
  do {
    code = String(crypto.randomInt(100000, 1000000));
  } while (taken.has(code));
  return code;
}

/** Impact of collected food: meals, kg, CO2 avoided and money figures. */
export function impactOf(items) {
  const totals = { meals: 0, kg: 0, co2Kg: 0, paid: 0, saved: 0, pickups: 0 };
  for (const { quantity, unit, unitPrice = 0, originalUnitPrice = 0 } of items) {
    totals.meals += quantity * (MEALS_PER_UNIT[unit] ?? 1);
    totals.kg += quantity * (KG_PER_UNIT[unit] ?? 0.4);
    totals.paid += quantity * unitPrice;
    totals.saved += quantity * Math.max(0, originalUnitPrice - unitPrice);
    totals.pickups += 1;
  }
  totals.co2Kg = totals.kg * CO2_PER_KG_FOOD;
  return {
    meals: Math.round(totals.meals),
    kg: Math.round(totals.kg * 10) / 10,
    co2Kg: Math.round(totals.co2Kg),
    paid: Math.round(totals.paid),
    saved: Math.round(totals.saved),
    pickups: totals.pickups,
  };
}

/** Marks a listing completed/expired once nothing is left to collect. */
export async function settleListing(listingId) {
  const listing = await FoodListing.findById(listingId);
  if (!listing || !['available', 'reserved'].includes(listing.status)) return listing;
  const pending = await Claim.countDocuments({ listing: listing._id, status: 'reserved' });
  if (pending > 0) return listing;

  const windowOver = listing.pickup.end.getTime() < Date.now();
  if (listing.quantity.available === 0 || windowOver) {
    const collected = await Claim.exists({ listing: listing._id, status: 'picked_up' });
    listing.status = collected ? 'completed' : 'expired';
    await listing.save();
  }
  return listing;
}

/** Expires stale reservations and closes listings whose pickup window is over. */
export async function runExpirySweep() {
  const now = new Date();

  const stale = await Claim.find({ status: 'reserved', expiresAt: { $lt: now } })
    .populate('listing', 'title')
    .limit(500);
  for (const claim of stale) {
    claim.status = 'expired';
    await claim.save();
    const title = claim.listing?.title || 'food';
    await notify(claim.claimer, {
      type: 'claim_expired',
      title: `Reservation expired: ${title}`,
      body: 'The pickup window ended before this reservation was collected.',
      link: '/food/dashboard?tab=reservations',
    });
    await notify(claim.donor, {
      type: 'claim_no_show',
      title: `No-show for ${title}`,
      body: `A reservation of ${claim.quantity} was not collected in time.`,
      link: '/food/dashboard',
    });
  }

  const graceCutoff = new Date(now.getTime() - PICKUP_GRACE_MINUTES * 60 * 1000);
  const overdue = await FoodListing.find({
    status: { $in: ['available', 'reserved'] },
    'pickup.end': { $lt: graceCutoff },
  })
    .select('_id')
    .limit(500)
    .lean();
  for (const { _id } of overdue) await settleListing(_id);
}

let timer = null;
export function startExpiryJob(intervalMs = 60_000) {
  if (timer) return;
  const tick = () => runExpirySweep().catch((err) => console.error('[jobs] expiry sweep failed:', err.message));
  tick();
  timer = setInterval(tick, intervalMs);
  timer.unref();
}
export const stopExpiryJob = () => {
  clearInterval(timer);
  timer = null;
};
