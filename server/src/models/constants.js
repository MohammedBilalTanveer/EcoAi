export const ROLES = ['citizen', 'restaurant', 'ngo', 'staff', 'admin'];
/** Roles that can use the staff portal (admins can do everything staff can). */
export const STAFF_ROLES = ['staff', 'admin'];
/** Organisation accounts that need an admin's approval before they get access. */
export const APPROVAL_ROLES = ['restaurant', 'ngo'];
export const ACCOUNT_STATUSES = ['active', 'pending', 'rejected', 'suspended'];
export const SIGNUP_ROLES = ['citizen', 'restaurant', 'ngo'];
export const FOOD_DONOR_ROLES = ['citizen', 'restaurant'];

export const REPORT_STATUSES = ['pending', 'in_progress', 'resolved', 'rejected'];
/** Outcome of the photo check on reports and food listings (see services/screening.js). */
export const SCREENING_DECISIONS = ['passed', 'rejected', 'review'];
export const REPORT_SEVERITIES = ['low', 'medium', 'high', 'critical'];
export const REPORT_CATEGORIES = [
  'mixed',
  'plastic',
  'construction',
  'e_waste',
  'organic',
  'hazardous',
  'other',
];

export const FOOD_CATEGORIES = [
  'cooked_meal',
  'bakery',
  'raw_produce',
  'packaged',
  'dairy',
  'beverages',
  'other',
];
export const DIET_TYPES = ['veg', 'vegan', 'egg', 'non_veg'];
export const FOOD_UNITS = ['servings', 'kg', 'packets', 'boxes'];
export const STORAGE_TYPES = ['room_temp', 'refrigerated', 'frozen', 'packaged'];
export const LISTING_STATUSES = ['available', 'reserved', 'completed', 'expired', 'cancelled'];
export const CLAIM_STATUSES = ['reserved', 'picked_up', 'cancelled', 'expired'];

/** How long food stays safe after preparation, by storage type (hours). */
export const SAFE_HOURS = {
  room_temp: 3,
  refrigerated: 24,
  frozen: 72,
  packaged: 48,
};

/** Food prepared within this window counts as "fresh" (original NGO email rule). */
export const FRESH_HOURS = 3;

/** Grace period after the pickup window before an uncollected reservation expires. */
export const PICKUP_GRACE_MINUTES = 30;

/** Minimum discount for paid listings, so food is always cheaper than menu price. */
export const MIN_DISCOUNT = 0.2;

/** Max quantity a citizen can reserve from one public listing (NGOs are unlimited). */
export const CITIZEN_CLAIM_LIMIT = 10;

/** Rough conversions used for impact numbers. */
export const KG_PER_UNIT = { servings: 0.4, kg: 1, packets: 0.25, boxes: 0.5 };
export const MEALS_PER_UNIT = { servings: 1, kg: 2.5, packets: 0.6, boxes: 1.2 };
export const CO2_PER_KG_FOOD = 2.5;
