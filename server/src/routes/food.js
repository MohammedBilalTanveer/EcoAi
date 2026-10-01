import { Router } from 'express';
import { z } from 'zod';
import { isStaffUser, optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { limiter } from '../middleware/rateLimit.js';
import { hashBuffer, requireImage, upload } from '../middleware/upload.js';
import { foodScreening } from '../services/screening.js';
import { saveImage } from '../services/storage.js';
import {
  CITIZEN_CLAIM_LIMIT,
  Claim,
  DIET_TYPES,
  FOOD_CATEGORIES,
  FOOD_DONOR_ROLES,
  FOOD_UNITS,
  FoodListing,
  MIN_DISCOUNT,
  SAFE_HOURS,
  STORAGE_TYPES,
} from '../models/index.js';
import { analyzeFoodImage } from '../services/ai.js';
import { claimExpiry, computeSafeUntil, generatePickupCode, impactOf, settleListing } from '../services/food.js';
import { announceListing, findNearbyNgos, notify, notifyStaff } from '../services/notify.js';
import { toPoint } from '../utils/geo.js';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../utils/http.js';
import { claimDTO, listingDTO } from '../utils/serialize.js';
import { assertObjectId, escapeRegex, parse, zx } from '../utils/validate.js';

const router = Router();

const analyzeLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  perUser: true,
  message: 'Too many AI analyses. Please wait a few minutes.',
});
const createLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  perUser: true,
  message: 'You have posted a lot of listings in the last hour. Please try again later.',
});

const optEnum = (values) => z.preprocess((v) => v || undefined, z.enum(values).optional());
const DONOR_FIELDS = 'name organization avatar role phone';
const fmtTime = (d) =>
  d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

// ---------------------------------------------------------------------------
// Create listing
// ---------------------------------------------------------------------------

const createSchema = z.object({
  title: zx.str(100, 'Title'),
  description: zx.optStr(1000, 'Description'),
  category: optEnum(FOOD_CATEGORIES),
  dietType: optEnum(DIET_TYPES),
  allergens: zx.list(10),
  quantity: zx.num('Quantity', { min: 1, max: 1000 }),
  unit: optEnum(FOOD_UNITS),
  isFree: zx.bool(false),
  originalPrice: zx.num('Original price', { min: 0, max: 10000 }),
  offerPrice: zx.optNum('Offer price', { min: 0, max: 10000 }),
  storage: optEnum(STORAGE_TYPES),
  preparedAt: zx.date('Preparation time'),
  bestBefore: zx.optDate('Best before'),
  pickupStart: zx.optDate('Pickup start'),
  pickupEnd: zx.date('Pickup end time'),
  address: zx.optStr(300, 'Pickup address'),
  instructions: zx.optStr(300, 'Pickup instructions'),
  lat: zx.lat(),
  lng: zx.lng(),
});

const STORAGE_LABEL = {
  room_temp: 'room-temperature food',
  refrigerated: 'refrigerated food',
  frozen: 'frozen food',
  packaged: 'packaged food',
};

/** Food-safety and pricing rules for a new listing. */
function buildListingFields(data) {
  const now = Date.now();
  const storage = data.storage || 'room_temp';
  if (data.preparedAt.getTime() > now + 10 * 60 * 1000) {
    throw badRequest('Preparation time cannot be in the future.', 'INVALID_PREPARED_AT');
  }
  if (data.preparedAt.getTime() < now - 7 * 86400 * 1000) {
    throw badRequest('Preparation time is too far in the past.', 'INVALID_PREPARED_AT');
  }

  const safeUntil = computeSafeUntil(storage, data.preparedAt, data.bestBefore);
  if (safeUntil.getTime() <= now + 15 * 60 * 1000) {
    throw badRequest(
      `This food is past its safe window (${STORAGE_LABEL[storage]} is safe for ${SAFE_HOURS[storage]}h after preparation), so it cannot be listed.`,
      'FOOD_NOT_SAFE',
    );
  }

  let pickupStart = data.pickupStart ?? new Date(now);
  if (pickupStart.getTime() < now) pickupStart = new Date(now);
  const pickupEnd = data.pickupEnd;
  if (pickupEnd.getTime() - pickupStart.getTime() < 15 * 60 * 1000) {
    throw badRequest('The pickup window must be at least 15 minutes long.', 'INVALID_PICKUP_WINDOW');
  }
  if (pickupEnd.getTime() > safeUntil.getTime() + 60 * 1000) {
    throw badRequest(`For food safety, pickup must end by ${fmtTime(safeUntil)}.`, 'PICKUP_AFTER_SAFE');
  }
  if (pickupEnd.getTime() - now > 72 * 3600 * 1000) {
    throw badRequest('The pickup window can be at most 3 days long.', 'INVALID_PICKUP_WINDOW');
  }

  const original = Math.round(data.originalPrice);
  let offer = data.isFree ? 0 : Math.round(data.offerPrice ?? 0);
  if (!data.isFree) {
    if (original <= 0) throw badRequest('Enter the original (menu) price so buyers can see the saving.', 'PRICE_REQUIRED');
    if (offer > Math.floor(original * (1 - MIN_DISCOUNT))) {
      throw badRequest(
        `The offer price must be at least ${MIN_DISCOUNT * 100}% below the original price (max ₹${Math.floor(original * (1 - MIN_DISCOUNT))}).`,
        'DISCOUNT_TOO_SMALL',
      );
    }
  }
  if (offer < 0) offer = 0;

  const quantity = Math.round(data.quantity);
  return {
    title: data.title,
    description: data.description,
    category: data.category || 'cooked_meal',
    dietType: data.dietType || 'veg',
    allergens: [...new Set(data.allergens.map((a) => a.toLowerCase()))],
    quantity: { total: quantity, available: quantity, unit: data.unit || 'servings' },
    pricing: { original, offer },
    audience: offer === 0 ? 'ngo' : 'public',
    storage,
    preparedAt: data.preparedAt,
    safeUntil,
    pickup: { start: pickupStart, end: pickupEnd, address: data.address, instructions: data.instructions },
    location: toPoint(data.lat, data.lng),
  };
}

// POST /api/food/analyze — AI autofill from a food photo
router.post('/analyze', requireAuth, requireRole(...FOOD_DONOR_ROLES), analyzeLimiter, upload.single('image'), async (req, res) => {
  const type = requireImage(req.file, 'food photo');
  const ai = await analyzeFoodImage(req.file.buffer, type.mime, hashBuffer(req.file.buffer));
  res.json({ ai });
});

// GET /api/food/nearby-ngos?lat&lng — how many NGOs would be alerted from here
router.get('/nearby-ngos', requireAuth, async (req, res) => {
  const { lat, lng } = parse(z.object({ lat: zx.lat(), lng: zx.lng() }), req.query);
  const ngos = await findNearbyNgos(toPoint(lat, lng));
  res.json({ count: ngos.length });
});

// POST /api/food — publish surplus food
router.post('/', requireAuth, requireRole(...FOOD_DONOR_ROLES), createLimiter, upload.array('images', 3), async (req, res) => {
  const data = parse(createSchema, req.body);
  const files = req.files || [];
  if (files.length === 0) throw badRequest('Please add at least one photo of the food.', 'IMAGE_REQUIRED');
  const types = files.map((f) => requireImage(f, 'food photo'));
  const fields = buildListingFields(data);

  const [images, ai] = await Promise.all([
    Promise.all(files.map((f, i) => saveImage(f.buffer, types[i], 'food'))),
    analyzeFoodImage(files[0].buffer, types[0].mime, hashBuffer(files[0].buffer)),
  ]);

  const screening = foodScreening(ai);
  const listing = await FoodListing.create({
    ...fields,
    donor: req.user._id,
    images,
    ai: {
      analyzed: ai.analyzed,
      verified: Boolean(ai.verified),
      confidence: ai.confidence,
      labels: ai.labels,
      provider: ai.provider,
      reason: ai.reason,
    },
    screening: { decision: screening.decision, reason: screening.reason, source: 'ai' },
    // Rejected photos are held back until staff approve them; food that couldn't be
    // checked is still published because it's perishable.
    flagged: screening.decision === 'rejected',
    pickup: { ...fields.pickup, address: fields.pickup.address || req.user.address },
  });

  if (listing.flagged) {
    await notifyStaff({
      type: 'food_flagged',
      title: 'Food listing held by the AI check',
      body: `"${listing.title}": ${screening.reason}`,
      link: '/staff/dashboard?tab=food',
    });
  } else {
    listing.notifiedNgos = await announceListing(listing, req.user);
    await listing.save();
  }

  await listing.populate('donor', DONOR_FIELDS);
  res.status(201).json({
    listing: listingDTO(listing, { includeContact: true }),
    notifiedNgos: listing.notifiedNgos,
    ai: { analyzed: ai.analyzed, isFood: ai.isFood, confidence: ai.confidence, provider: ai.provider, reason: ai.reason },
    screening,
  });
});

// ---------------------------------------------------------------------------
// Browse
// ---------------------------------------------------------------------------

const browseSchema = z.object({
  lat: zx.optNum('Latitude', { min: -90, max: 90 }),
  lng: zx.optNum('Longitude', { min: -180, max: 180 }),
  radiusKm: zx.optNum('Radius', { min: 1, max: 100 }),
  diet: optEnum(DIET_TYPES),
  category: optEnum(FOOD_CATEGORIES),
  audience: optEnum(['ngo', 'public']),
  maxPrice: zx.optNum('Max price', { min: 0, max: 10000 }),
  q: zx.optStr(80, 'Search'),
  sort: z.preprocess((v) => v || undefined, z.enum(['nearest', 'ending', 'discount', 'newest']).default('nearest')),
  limit: zx.optNum('Limit', { min: 1, max: 100 }),
});

// GET /api/food — available listings, optionally near a point
router.get('/', optionalAuth, async (req, res) => {
  const q = parse(browseSchema, req.query);
  const now = new Date();
  const match = {
    status: 'available',
    removed: { $ne: true },
    flagged: { $ne: true },
    'pickup.end': { $gt: now },
    'quantity.available': { $gt: 0 },
  };
  if (q.diet) match.dietType = q.diet === 'veg' ? { $in: ['veg', 'vegan'] } : q.diet;
  if (q.category) match.category = q.category;
  if (q.audience) match.audience = q.audience;
  if (q.maxPrice != null) match['pricing.offer'] = { $lte: q.maxPrice };
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    match.$or = [{ title: rx }, { description: rx }];
  }

  const geo = q.lat != null && q.lng != null;
  const pipeline = geo
    ? [
        {
          $geoNear: {
            near: toPoint(q.lat, q.lng),
            distanceField: 'distance',
            maxDistance: (q.radiusKm ?? 10) * 1000,
            spherical: true,
            query: match,
          },
        },
      ]
    : [{ $match: match }];

  pipeline.push({
    $addFields: {
      discount: {
        $cond: [
          { $gt: ['$pricing.original', 0] },
          { $subtract: [1, { $divide: ['$pricing.offer', '$pricing.original'] }] },
          1,
        ],
      },
    },
  });
  const sorts = {
    nearest: geo ? null : { createdAt: -1 },
    ending: { 'pickup.end': 1 },
    discount: { discount: -1, createdAt: -1 },
    newest: { createdAt: -1 },
  };
  if (sorts[q.sort]) pipeline.push({ $sort: sorts[q.sort] });
  pipeline.push(
    { $limit: q.limit ?? 60 },
    {
      $lookup: {
        from: 'users',
        localField: 'donor',
        foreignField: '_id',
        as: 'donor',
        pipeline: [{ $project: { name: 1, organization: 1, avatar: 1, role: 1 } }],
      },
    },
    { $unwind: '$donor' },
  );

  const listings = await FoodListing.aggregate(pipeline);
  res.json({ listings: listings.map((l) => listingDTO(l)), count: listings.length });
});

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

// GET /api/food/mine — donor's listings with their reservations and impact
router.get('/mine', requireAuth, async (req, res) => {
  const listings = await FoodListing.find({ donor: req.user._id, removed: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  const claims = await Claim.find({ listing: { $in: listings.map((l) => l._id) } })
    .populate('claimer', 'name organization role avatar phone')
    .sort({ createdAt: -1 })
    .lean();

  const byListing = new Map();
  for (const c of claims) {
    const key = String(c.listing);
    if (!byListing.has(key)) byListing.set(key, []);
    byListing.get(key).push(c);
  }
  const unitOf = new Map(listings.map((l) => [String(l._id), l.quantity.unit]));
  const impact = impactOf(
    claims.filter((c) => c.status === 'picked_up').map((c) => ({ ...c, unit: unitOf.get(String(c.listing)) })),
  );

  res.json({
    listings: listings.map((l) => ({
      ...listingDTO(l),
      claims: (byListing.get(String(l._id)) || []).map((c) => claimDTO(c, { includeContact: true })),
    })),
    impact: {
      ...impact,
      listed: listings.length,
      active: listings.filter((l) => ['available', 'reserved'].includes(l.status)).length,
    },
  });
});

// GET /api/food/claims/mine — reservations made by the signed-in NGO / citizen
router.get('/claims/mine', requireAuth, async (req, res) => {
  const claims = await Claim.find({ claimer: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate({ path: 'listing', populate: { path: 'donor', select: DONOR_FIELDS } })
    .lean();
  const valid = claims.filter((c) => c.listing);
  const impact = impactOf(
    valid.filter((c) => c.status === 'picked_up').map((c) => ({ ...c, unit: c.listing.quantity.unit })),
  );
  res.json({
    claims: valid.map((c) => claimDTO(c, { showCode: c.status === 'reserved', includeContact: true })),
    impact,
  });
});

// ---------------------------------------------------------------------------
// Listing detail + reservations
// ---------------------------------------------------------------------------

function eligibility(listing, user, activeClaim) {
  if (!user) return { ok: false, reason: 'login' };
  if (String(listing.donor?._id ?? listing.donor) === String(user._id)) return { ok: false, reason: 'own' };
  if (isStaffUser(user)) return { ok: false, reason: 'staff' };
  if (activeClaim) return { ok: false, reason: 'already' };
  if (listing.status !== 'available' || listing.pickup.end <= new Date() || listing.quantity.available <= 0) {
    return { ok: false, reason: 'unavailable' };
  }
  if (listing.audience === 'ngo' && user.role !== 'ngo') return { ok: false, reason: 'ngo_only' };
  return { ok: true };
}

const maxClaimFor = (listing, user) =>
  user?.role === 'ngo' ? listing.quantity.available : Math.min(listing.quantity.available, CITIZEN_CLAIM_LIMIT);

// GET /api/food/:id
router.get('/:id', optionalAuth, async (req, res) => {
  assertObjectId(req.params.id, 'Listing');
  const listing = await FoodListing.findById(req.params.id).populate('donor', DONOR_FIELDS);
  const user = req.user;
  const isDonor = Boolean(user && listing && String(listing.donor?._id) === String(user._id));
  const isStaff = isStaffUser(user);
  if (!listing || (listing.removed && !isStaff) || (listing.flagged && !isDonor && !isStaff)) {
    throw notFound('This listing is no longer available.');
  }

  const myClaim = user
    ? await Claim.findOne({ listing: listing._id, claimer: user._id, status: { $in: ['reserved', 'picked_up'] } })
        .sort({ createdAt: -1 })
        .lean()
    : null;
  const claims =
    isDonor || isStaff
      ? await Claim.find({ listing: listing._id })
          .populate('claimer', 'name organization role avatar phone')
          .sort({ createdAt: -1 })
          .lean()
      : undefined;

  const activeClaim = myClaim?.status === 'reserved' ? myClaim : null;
  const canClaim = eligibility(listing, user, activeClaim);
  res.json({
    listing: listingDTO(listing, { includeContact: isDonor || isStaff || Boolean(myClaim) }),
    myClaim: myClaim ? claimDTO(myClaim, { showCode: myClaim.status === 'reserved' }) : null,
    claims: claims?.map((c) => claimDTO(c, { includeContact: true })),
    permissions: {
      isDonor,
      isStaff,
      canClaim: canClaim.ok,
      reason: canClaim.reason || null,
      maxQuantity: canClaim.ok ? maxClaimFor(listing, user) : 0,
    },
  });
});

const claimSchema = z.object({
  quantity: zx.num('Quantity', { min: 1, max: 1000 }).transform((n) => Math.round(n)),
  note: zx.optStr(300, 'Note'),
});

const REASON_ERRORS = {
  login: () => new HttpError(401, 'Please sign in to reserve food.', 'AUTH_REQUIRED'),
  own: () => forbidden('You cannot reserve your own listing.', 'OWN_LISTING'),
  staff: () => forbidden('Staff accounts cannot reserve food.', 'ROLE_NOT_ALLOWED'),
  already: () => conflict('You already have an active reservation for this food.', 'ALREADY_RESERVED'),
  unavailable: () => new HttpError(410, 'This food is no longer available.', 'UNAVAILABLE'),
  ngo_only: () => forbidden('This free donation is reserved for registered NGOs.', 'NGO_ONLY'),
};

// POST /api/food/:id/claim — reserve some or all of a listing
router.post('/:id/claim', requireAuth, async (req, res) => {
  assertObjectId(req.params.id, 'Listing');
  const { quantity, note } = parse(claimSchema, req.body);
  const user = req.user;
  const listing = await FoodListing.findById(req.params.id).populate('donor', DONOR_FIELDS);
  if (!listing || listing.removed || listing.flagged) throw notFound('This listing is no longer available.');

  const active = await Claim.findOne({ listing: listing._id, claimer: user._id, status: 'reserved' }).lean();
  const check = eligibility(listing, user, active);
  if (!check.ok) throw REASON_ERRORS[check.reason]();
  const max = maxClaimFor(listing, user);
  if (quantity > max) {
    throw badRequest(`You can reserve up to ${max} ${listing.quantity.unit} of this listing.`, 'QUANTITY_TOO_HIGH');
  }

  const updated = await FoodListing.findOneAndUpdate(
    {
      _id: listing._id,
      status: 'available',
      'quantity.available': { $gte: quantity },
      'pickup.end': { $gt: new Date() },
    },
    { $inc: { 'quantity.available': -quantity } },
    { returnDocument: 'after' },
  );
  if (!updated) {
    throw conflict('Someone just reserved this food. Refresh and try a smaller quantity.', 'NOT_ENOUGH_LEFT');
  }

  let claim;
  try {
    claim = await Claim.create({
      listing: listing._id,
      donor: listing.donor._id,
      claimer: user._id,
      quantity,
      unitPrice: listing.pricing.offer,
      originalUnitPrice: listing.pricing.original,
      pickupCode: await generatePickupCode(listing._id),
      note,
      expiresAt: claimExpiry(listing.pickup.end),
    });
  } catch (err) {
    await FoodListing.updateOne({ _id: listing._id }, { $inc: { 'quantity.available': quantity } });
    if (err?.code === 11000) throw REASON_ERRORS.already();
    throw err;
  }
  if (updated.quantity.available === 0) {
    await FoodListing.updateOne({ _id: listing._id, status: 'available' }, { status: 'reserved' });
    updated.status = 'reserved';
  }

  const who = user.organization || user.name;
  await notify(listing.donor._id, {
    type: 'claim_new',
    title: `${who} reserved ${quantity} ${listing.quantity.unit} of ${listing.title}`,
    body: `${claim.unitPrice === 0 ? 'Free pickup' : `₹${claim.quantity * claim.unitPrice} to collect at pickup`} · before ${fmtTime(listing.pickup.end)}. Ask for their pickup code.`,
    link: `/food/${listing._id}`,
  });

  updated.donor = listing.donor;
  res.status(201).json({
    claim: claimDTO(claim, { showCode: true }),
    listing: listingDTO(updated, { includeContact: true }),
  });
});

// POST /api/food/claims/:claimId/cancel — claimer cancels their reservation
router.post('/claims/:claimId/cancel', requireAuth, async (req, res) => {
  assertObjectId(req.params.claimId, 'Reservation');
  const claim = await Claim.findById(req.params.claimId).populate('listing', 'title quantity');
  if (!claim || String(claim.claimer) !== String(req.user._id)) throw notFound('Reservation not found.');
  if (claim.status !== 'reserved') throw badRequest('Only active reservations can be cancelled.', 'NOT_ACTIVE');

  claim.status = 'cancelled';
  claim.cancelledAt = new Date();
  await claim.save();

  const listingId = claim.listing._id;
  await FoodListing.updateOne(
    { _id: listingId, status: { $in: ['available', 'reserved'] } },
    { $inc: { 'quantity.available': claim.quantity } },
  );
  await FoodListing.updateOne(
    { _id: listingId, status: 'reserved', 'pickup.end': { $gt: new Date() } },
    { status: 'available' },
  );
  await notify(claim.donor, {
    type: 'claim_cancelled',
    title: `Reservation cancelled: ${claim.listing.title}`,
    body: `${req.user.organization || req.user.name} cancelled ${claim.quantity} ${claim.listing.quantity.unit}. It is available again.`,
    link: `/food/${listingId}`,
  });
  res.json({ claim: claimDTO(claim) });
});

// POST /api/food/:id/verify — donor confirms a pickup with the claimer's code
router.post('/:id/verify', requireAuth, async (req, res) => {
  assertObjectId(req.params.id, 'Listing');
  const { code } = parse(z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit pickup code.') }), req.body);
  const listing = await FoodListing.findById(req.params.id);
  if (!listing) throw notFound('Listing not found.');
  if (String(listing.donor) !== String(req.user._id)) throw forbidden('Only the donor can confirm pickups.');

  const claim = await Claim.findOne({ listing: listing._id, pickupCode: code, status: 'reserved' }).populate(
    'claimer',
    'name organization role avatar phone',
  );
  if (!claim) {
    throw badRequest('That code does not match any active reservation for this listing.', 'INVALID_CODE');
  }
  claim.status = 'picked_up';
  claim.pickedUpAt = new Date();
  await claim.save();

  await notify(claim.claimer._id, {
    type: 'claim_picked_up',
    title: `Pickup confirmed: ${listing.title}`,
    body: 'Thank you for rescuing food and keeping it out of landfill!',
    link: '/food/dashboard?tab=reservations',
  });
  const settled = await settleListing(listing._id);
  res.json({ claim: claimDTO(claim, { includeContact: true }), listing: listingDTO(settled) });
});

// POST /api/food/:id/cancel — donor withdraws a listing
router.post('/:id/cancel', requireAuth, async (req, res) => {
  assertObjectId(req.params.id, 'Listing');
  const { reason } = parse(z.object({ reason: zx.optStr(300, 'Reason') }), req.body);
  const listing = await FoodListing.findById(req.params.id);
  if (!listing) throw notFound('Listing not found.');
  if (String(listing.donor) !== String(req.user._id)) throw forbidden('Only the donor can cancel this listing.');
  if (!['available', 'reserved'].includes(listing.status)) {
    throw badRequest('This listing is already closed.', 'NOT_ACTIVE');
  }

  listing.status = 'cancelled';
  listing.cancelReason = reason;
  await listing.save();

  const active = await Claim.find({ listing: listing._id, status: 'reserved' });
  await Claim.updateMany(
    { _id: { $in: active.map((c) => c._id) } },
    { status: 'cancelled', cancelledAt: new Date() },
  );
  await notify(
    active.map((c) => c.claimer),
    {
      type: 'listing_cancelled',
      title: `Listing cancelled: ${listing.title}`,
      body: reason ? `The donor cancelled this listing: ${reason}` : 'The donor cancelled this listing.',
      link: '/food/dashboard?tab=reservations',
    },
  );
  res.json({ listing: listingDTO(listing) });
});

export default router;
