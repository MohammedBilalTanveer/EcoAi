/** Rupee amount; always shows a number (₹0 for zero). */
export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** Price label; zero reads as "Free". */
export const money = (n) => (n === 0 ? 'Free' : inr(n));

export const number = (n) => Number(n || 0).toLocaleString('en-IN');

export const compact = (n) =>
  Number(n || 0).toLocaleString('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

export function duration(ms) {
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return 'less than a minute';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function timeAgo(date, now = Date.now()) {
  const diff = now - new Date(date).getTime();
  if (diff < 45 * 1000) return 'just now';
  return `${duration(diff)} ago`;
}

export const timeLeft = (date, now = Date.now()) => new Date(date).getTime() - now;

// Bengaluru time. Truck timetables are local to the city, whatever the viewer's timezone.
const IST = 'Asia/Kolkata';
const istDay = (date) => new Date(date).toLocaleDateString('en-CA', { timeZone: IST });
const VIEWER_IN_IST = new Date().getTimezoneOffset() === -330;

/** "6:30 am" in IST (with an "IST" suffix for viewers outside India). */
export const istTime = (date) =>
  `${new Date(date).toLocaleTimeString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' })}${VIEWER_IN_IST ? '' : ' IST'}`;

/** "today 2:30 pm" / "tomorrow 6:00 am" / "Sat 6:00 am", in IST. */
export function istWhen(date, now = Date.now()) {
  const day = istDay(date);
  const today = istDay(now);
  const tomorrow = istDay(now + 24 * 3600 * 1000);
  const prefix =
    day === today
      ? 'today'
      : day === tomorrow
        ? 'tomorrow'
        : new Date(date).toLocaleDateString('en-IN', { timeZone: IST, weekday: 'short' });
  return `${prefix} ${istTime(date)}`;
}

export const clock = (date) =>
  new Date(date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export const dateTime = (date) =>
  new Date(date).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const dateOnly = (date) =>
  new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Value for <input type="datetime-local"> in the user's local time. */
export function toLocalInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const km = (n) => (n == null ? '' : n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`);

export const eta = (sec) => {
  if (sec == null) return '';
  if (sec < 60) return 'arriving';
  return `${Math.round(sec / 60)} min`;
};

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

// ---------------------------------------------------------------------------
// Labels for enum values coming from the API
// ---------------------------------------------------------------------------

export const ROLE_LABEL = {
  citizen: 'Citizen',
  restaurant: 'Restaurant',
  ngo: 'NGO',
  staff: 'Staff',
  admin: 'Admin',
};

export const ACCOUNT_STATUS = {
  active: { label: 'Active', tone: 'emerald' },
  pending: { label: 'Pending approval', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'rose' },
  suspended: { label: 'Suspended', tone: 'slate' },
};

export const REPORT_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  in_progress: { label: 'In progress', tone: 'sky' },
  resolved: { label: 'Resolved', tone: 'emerald' },
  rejected: { label: 'Rejected', tone: 'rose' },
};

export const SEVERITY = {
  low: { label: 'Low', tone: 'slate', color: '#94a3b8' },
  medium: { label: 'Medium', tone: 'amber', color: '#fbbf24' },
  high: { label: 'High', tone: 'orange', color: '#fb923c' },
  critical: { label: 'Critical', tone: 'rose', color: '#f43f5e' },
};

export const REPORT_CATEGORY = {
  mixed: { label: 'Mixed waste', emoji: '🗑️' },
  plastic: { label: 'Plastic', emoji: '🧴' },
  construction: { label: 'Construction debris', emoji: '🧱' },
  e_waste: { label: 'E-waste', emoji: '🔌' },
  organic: { label: 'Organic / food', emoji: '🥬' },
  hazardous: { label: 'Hazardous', emoji: '☣️' },
  other: { label: 'Other', emoji: '📦' },
};

export const FOOD_CATEGORY = {
  cooked_meal: 'Cooked meal',
  bakery: 'Bakery',
  raw_produce: 'Fruits & vegetables',
  packaged: 'Packaged food',
  dairy: 'Dairy',
  beverages: 'Beverages',
  other: 'Other',
};

export const DIET = {
  veg: { label: 'Veg', color: '#22c55e' },
  vegan: { label: 'Vegan', color: '#16a34a' },
  egg: { label: 'Contains egg', color: '#eab308' },
  non_veg: { label: 'Non-veg', color: '#dc2626' },
};

export const UNIT = {
  servings: { one: 'serving', many: 'servings' },
  kg: { one: 'kg', many: 'kg' },
  packets: { one: 'packet', many: 'packets' },
  boxes: { one: 'box', many: 'boxes' },
};
export const unitLabel = (unit, n = 2) => (n === 1 ? UNIT[unit]?.one : UNIT[unit]?.many) || unit;

export const STORAGE = {
  room_temp: { label: 'Room temperature', hours: 3, hint: 'Cooked food kept at room temperature is safe for about 3 hours.' },
  refrigerated: { label: 'Refrigerated', hours: 24, hint: 'Kept below 5°C — safe for up to 24 hours.' },
  frozen: { label: 'Frozen', hours: 72, hint: 'Kept frozen — safe for up to 3 days.' },
  packaged: { label: 'Sealed / packaged', hours: 48, hint: 'Uses the best-before time on the pack (48h by default).' },
};

export const ALLERGENS = ['gluten', 'dairy', 'nuts', 'peanuts', 'soy', 'egg', 'fish', 'shellfish', 'sesame'];

export const LISTING_STATUS = {
  available: { label: 'Available', tone: 'emerald' },
  reserved: { label: 'Fully reserved', tone: 'sky' },
  completed: { label: 'Completed', tone: 'violet' },
  expired: { label: 'Expired', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'rose' },
};

export const CLAIM_STATUS = {
  reserved: { label: 'Reserved', tone: 'sky' },
  picked_up: { label: 'Picked up', tone: 'emerald' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
  expired: { label: 'Expired', tone: 'rose' },
};

export const TRUCK_STATUS = {
  en_route: { label: 'En route', tone: 'sky' },
  collecting: { label: 'Collecting', tone: 'emerald' },
  returning: { label: 'Returning to depot', tone: 'violet' },
  unloading: { label: 'Unloading', tone: 'amber' },
  off_duty: { label: 'Off duty', tone: 'slate' },
};

/** Outcome of the AI photo check on reports and food listings. */
export const AI_DECISION = {
  passed: { label: 'AI passed', tone: 'emerald' },
  rejected: { label: 'AI rejected', tone: 'rose' },
  review: { label: 'Needs review', tone: 'amber' },
};
