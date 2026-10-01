import { env } from '../config/env.js';
import { fromPoint } from './geo.js';

const idOf = (value) => (value?._id ?? value)?.toString();

/**
 * Photos stored by this server are saved as /uploads/... paths. When the website runs
 * on another domain (e.g. Vercel) they need this server's full URL to load.
 */
export const mediaUrl = (src) => (src && src.startsWith('/uploads/') ? `${env.mediaBaseUrl}${src}` : src);

/** The photo-check decision (AI, or a staff override). */
function screeningDTO(screening, { includeUser = false } = {}) {
  return {
    decision: screening?.decision || 'review',
    reason: screening?.reason || '',
    source: screening?.source || 'ai',
    note: screening?.note || '',
    reviewedAt: screening?.reviewedAt || null,
    reviewedBy: includeUser ? userRef(screening?.reviewedBy) : undefined,
  };
}

export function userDTO(user, { self = false } = {}) {
  if (!user) return null;
  const base = {
    id: idOf(user),
    name: user.name,
    role: user.role,
    avatar: user.avatar || null,
    organization: user.organization || null,
  };
  if (!self) return base;
  return {
    ...base,
    email: user.email,
    phone: user.phone || '',
    address: user.address || '',
    location: fromPoint(user.location),
    notifyRadiusKm: user.notifyRadiusKm ?? 5,
    emailNotifications: user.emailNotifications ?? true,
    authProviders: user.authProviders || [],
    status: user.status || 'active',
    statusNote: user.statusNote || '',
    isStaff: ['staff', 'admin'].includes(user.role),
    isAdmin: user.role === 'admin',
    createdAt: user.createdAt,
  };
}

/** Public-safe user reference (reporter / donor / claimer). */
export const userRef = (user) =>
  user && typeof user === 'object' && user.name
    ? {
        id: idOf(user),
        name: user.name,
        role: user.role,
        avatar: user.avatar || null,
        organization: user.organization || null,
      }
    : user
      ? { id: idOf(user) }
      : null;

export function reportDTO(report, { includeUser = false } = {}) {
  const loc = fromPoint(report.location);
  return {
    id: idOf(report),
    description: report.description || '',
    category: report.category,
    severity: report.severity,
    status: report.status,
    image: mediaUrl(report.image),
    address: report.address || '',
    lat: loc?.lat,
    lng: loc?.lng,
    ai: {
      analyzed: Boolean(report.ai?.analyzed),
      verified: Boolean(report.ai?.verified),
      confidence: report.ai?.confidence ?? 0,
      labels: report.ai?.labels ?? [],
      provider: report.ai?.provider ?? null,
      summary: report.ai?.summary ?? null,
      reason: report.ai?.reason ?? null,
    },
    screening: screeningDTO(report.screening, { includeUser }),
    authorityNotified: Boolean(report.authorityNotified),
    authorityNotifiedAt: report.authorityNotifiedAt || null,
    history: (report.history || []).map((h) => ({
      status: h.status,
      note: h.note || '',
      at: h.at,
      by: includeUser ? userRef(h.by) : undefined,
    })),
    user: includeUser ? userRef(report.user) : undefined,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    resolvedAt: report.resolvedAt || null,
  };
}

export function listingDTO(listing, { includeContact = false, distance } = {}) {
  const original = listing.pricing?.original ?? 0;
  const offer = listing.pricing?.offer ?? 0;
  const donor = listing.donor && typeof listing.donor === 'object' ? listing.donor : null;
  const dist = distance ?? listing.distance;
  return {
    id: idOf(listing),
    title: listing.title,
    description: listing.description || '',
    images: (listing.images || []).map(mediaUrl),
    category: listing.category,
    dietType: listing.dietType,
    allergens: listing.allergens || [],
    quantity: {
      total: listing.quantity.total,
      available: listing.quantity.available,
      unit: listing.quantity.unit,
    },
    pricing: {
      original,
      offer,
      isFree: offer === 0,
      discountPct: original > 0 ? Math.round((1 - offer / original) * 100) : 100,
    },
    audience: listing.audience,
    storage: listing.storage,
    preparedAt: listing.preparedAt,
    safeUntil: listing.safeUntil,
    pickup: {
      start: listing.pickup.start,
      end: listing.pickup.end,
      address: listing.pickup.address || '',
      instructions: listing.pickup.instructions || '',
    },
    location: fromPoint(listing.location),
    status: listing.status,
    ai: {
      analyzed: Boolean(listing.ai?.analyzed),
      verified: Boolean(listing.ai?.verified),
      confidence: listing.ai?.confidence ?? 0,
      provider: listing.ai?.provider ?? null,
      reason: listing.ai?.reason ?? null,
      labels: listing.ai?.labels ?? [],
    },
    screening: screeningDTO(listing.screening, { includeUser: includeContact }),
    flagged: Boolean(listing.flagged),
    notifiedNgos: listing.notifiedNgos ?? 0,
    donor: donor
      ? {
          ...userRef(donor),
          phone: includeContact ? donor.phone || null : undefined,
        }
      : userRef(listing.donor),
    distanceKm: typeof dist === 'number' ? Math.round((dist / 1000) * 10) / 10 : undefined,
    createdAt: listing.createdAt,
  };
}

export function claimDTO(claim, { showCode = false, includeContact = false } = {}) {
  const listing = claim.listing && typeof claim.listing === 'object' && claim.listing.title ? claim.listing : null;
  const claimer = claim.claimer && typeof claim.claimer === 'object' && claim.claimer.name ? claim.claimer : null;
  return {
    id: idOf(claim),
    listingId: idOf(claim.listing),
    listing: listing ? listingDTO(listing, { includeContact }) : undefined,
    claimer: claimer
      ? { ...userRef(claimer), phone: includeContact ? claimer.phone || null : undefined }
      : userRef(claim.claimer),
    quantity: claim.quantity,
    unitPrice: claim.unitPrice,
    originalUnitPrice: claim.originalUnitPrice,
    totalPrice: claim.quantity * claim.unitPrice,
    savings: claim.quantity * (claim.originalUnitPrice - claim.unitPrice),
    status: claim.status,
    note: claim.note || '',
    pickupCode: showCode ? claim.pickupCode : undefined,
    expiresAt: claim.expiresAt,
    pickedUpAt: claim.pickedUpAt || null,
    createdAt: claim.createdAt,
  };
}

export const notificationDTO = (n) => ({
  id: idOf(n),
  type: n.type,
  title: n.title,
  body: n.body || '',
  link: n.link || null,
  read: n.read,
  createdAt: n.createdAt,
});

/** Full user record for the admin panel, with optional activity counts. */
export const adminUserDTO = (user, counts) => ({
  ...userDTO(user, { self: true }),
  lastLoginAt: user.lastLoginAt || null,
  reviewedAt: user.reviewedAt || null,
  counts: counts || undefined,
});
