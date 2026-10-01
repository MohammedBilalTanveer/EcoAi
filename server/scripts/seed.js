/**
 * Seeds demo accounts and sample data so every feature has something to show.
 * Safe to re-run: it only replaces data owned by the demo accounts below.
 *
 *   npm run seed
 *
 * Demo accounts (all use DEMO_PASSWORD):
 *   admin@ecoai.example        – admin panel (approvals, users, reports)
 *   staff@ecoai.example        – staff portal
 *   spicegarden@ecoai.example  – restaurant (Koramangala)
 *   chaatstreet@ecoai.example  – restaurant (Indiranagar)
 *   annapurna@ecoai.example    – NGO (HSR Layout)
 *   hungerfree@ecoai.example   – NGO (Jayanagar)
 *   citizen@ecoai.example      – citizen
 *   greenbowl@ecoai.example    – restaurant, pending approval
 *   sevatrust@ecoai.example    – NGO, pending approval
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

process.env.ECOAI_SCRIPT = '1';
process.env.NODE_ENV ||= 'development';
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { Claim, FoodListing, Notification, Report, User } = await import('../src/models/index.js');
const { computeSafeUntil, claimExpiry } = await import('../src/services/food.js');
const { deleteImage, saveImage } = await import('../src/services/storage.js');
const { foodScreening, reportScreening } = await import('../src/services/screening.js');
const { detectImageType } = await import('../src/middleware/upload.js');
const { toPoint } = await import('../src/utils/geo.js');

export const DEMO_PASSWORD = 'EcoAI-demo-2026';
const DEMO_DOMAIN = '@ecoai.example';

const here = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.join(here, 'seed-images');
const min = (n) => new Date(Date.now() + n * 60 * 1000);
const hours = (n) => min(n * 60);
const days = (n) => hours(n * 24);

/** Stores a bundled sample photo with the app's storage driver (MongoDB, Cloudinary or disk). */
async function copyImage(file, folder) {
  const buffer = await fs.readFile(path.join(IMAGES, file));
  return saveImage(buffer, detectImageType(buffer), folder);
}

const connection = await connectDB();

// DEMO_PASSWORD is public (it's in this file), so a hosted database must not get demo
// accounts with it — especially the demo admin. Require a private password instead.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];
const remote = !LOCAL_HOSTS.includes(connection.host);
let password = DEMO_PASSWORD;
if (remote) {
  password = process.env.SEED_PASSWORD || '';
  if (password.length < 12) {
    console.error(
      `\nRefusing to seed ${connection.host}: it is not a local database, and the demo password is public.\n` +
        'Set SEED_PASSWORD (12+ characters) to give the demo accounts a private password, e.g. in PowerShell:\n' +
        '  $env:SEED_PASSWORD="choose-a-long-password"; npm run seed\n',
    );
    await disconnectDB();
    process.exit(1);
  }
}

// ---- clean previous demo data ------------------------------------------------
const oldUsers = await User.find({ email: { $regex: `${DEMO_DOMAIN.replace('.', '\\.')}$` } }).select('_id');
const oldIds = oldUsers.map((u) => u._id);
const oldListings = await FoodListing.find({ donor: { $in: oldIds } }).select('_id images');
const oldReports = await Report.find({ user: { $in: oldIds } }).select('image');
await Promise.all([...oldListings.flatMap((l) => l.images), ...oldReports.map((r) => r.image)].map(deleteImage));
await Promise.all([
  Claim.deleteMany({ $or: [{ claimer: { $in: oldIds } }, { listing: { $in: oldListings.map((l) => l._id) } }] }),
  FoodListing.deleteMany({ donor: { $in: oldIds } }),
  Report.deleteMany({ user: { $in: oldIds } }),
  Notification.deleteMany({ user: { $in: oldIds } }),
]);
await User.deleteMany({ _id: { $in: oldIds } });

// ---- users -------------------------------------------------------------------
const passwordHash = await bcrypt.hash(password, 10);
// Demo addresses don't exist, so email is off for them (avoids bounce-backs to your inbox).
const mk = (u) => ({
  passwordHash,
  authProviders: ['password'],
  emailNotifications: false,
  ...u,
  email: `${u.email}${DEMO_DOMAIN}`,
});

const [staff, spice, chaat, annapurna, hungerFree, citizen] = await User.create([
  mk({ email: 'staff', name: 'Kavya Rao', role: 'staff', organization: 'BBMP Ward 151' }),
  mk({
    email: 'spicegarden',
    name: 'Anil Kumar',
    role: 'restaurant',
    organization: 'Spice Garden Restaurant',
    phone: '+91 98450 11223',
    address: '80 Feet Rd, Koramangala 4th Block',
    location: toPoint(12.9352, 77.6245),
  }),
  mk({
    email: 'chaatstreet',
    name: 'Meera Iyer',
    role: 'restaurant',
    organization: 'Chaat Street Kitchen',
    phone: '+91 98860 44556',
    address: '100 Feet Rd, Indiranagar',
    location: toPoint(12.9784, 77.6408),
  }),
  mk({
    email: 'annapurna',
    name: 'Rahul Verma',
    role: 'ngo',
    organization: 'Annapurna Food Bank',
    phone: '+91 99000 77881',
    address: '27th Main, HSR Layout Sector 1',
    location: toPoint(12.9121, 77.6446),
    notifyRadiusKm: 10,
  }),
  mk({
    email: 'hungerfree',
    name: 'Sana Sheikh',
    role: 'ngo',
    organization: 'Hunger Free Bengaluru',
    phone: '+91 99020 33445',
    address: '11th Main, Jayanagar 4th Block',
    location: toPoint(12.925, 77.5938),
    notifyRadiusKm: 15,
  }),
  mk({
    email: 'citizen',
    name: 'Priya Singh',
    role: 'citizen',
    phone: '+91 97400 55667',
    address: 'MG Road, Bengaluru',
    location: toPoint(12.9756, 77.6069),
  }),
]);

// Admin + two partner applications waiting in the approval queue.
await User.create([
  mk({ email: 'admin', name: 'EcoAI Admin', role: 'admin' }),
  mk({
    email: 'greenbowl',
    name: 'Arjun Nair',
    role: 'restaurant',
    status: 'pending',
    organization: 'Green Bowl Cafe',
    phone: '+91 98450 99887',
    address: 'CMH Road, Indiranagar',
    location: toPoint(12.9784, 77.6386),
  }),
  mk({
    email: 'sevatrust',
    name: 'Fatima Khan',
    role: 'ngo',
    status: 'pending',
    organization: 'Seva Food Trust',
    phone: '+91 99001 22334',
    address: 'BTM Layout 2nd Stage',
    location: toPoint(12.9166, 77.6101),
    notifyRadiusKm: 8,
  }),
]);

// ---- food listings -------------------------------------------------------------
async function listing(donor, data) {
  const listingAi = {
    analyzed: true,
    verified: data.ai?.verified ?? true,
    confidence: data.ai?.confidence ?? data.confidence ?? 0.94,
    labels: data.ai?.labels || data.labels || [],
    provider: 'openai',
    reason: data.ai?.reason || `${data.title} — freshly prepared food is clearly visible.`,
  };
  const preparedAt = data.preparedAt;
  const safeUntil = computeSafeUntil(data.storage, preparedAt, data.bestBefore);
  const doc = new FoodListing({
    donor: donor._id,
    title: data.title,
    description: data.description,
    images: [await copyImage(data.image, 'food')],
    category: data.category,
    dietType: data.dietType,
    allergens: data.allergens || [],
    quantity: { total: data.quantity, available: data.available ?? data.quantity, unit: data.unit },
    pricing: { original: data.original, offer: data.offer },
    audience: data.offer === 0 ? 'ngo' : 'public',
    storage: data.storage,
    preparedAt,
    safeUntil,
    pickup: {
      start: data.pickupStart || min(-10),
      end: data.pickupEnd,
      address: donor.address,
      instructions: data.instructions,
    },
    location: donor.location,
    status: data.status || 'available',
    ai: listingAi,
    screening: { ...foodScreening({ ...listingAi, isFood: listingAi.verified }), source: 'ai' },
    flagged: !listingAi.verified,
    notifiedNgos: listingAi.verified ? (data.notifiedNgos ?? 2) : 0,
    createdAt: data.createdAt || min(-15),
    updatedAt: data.createdAt || min(-15),
  });
  await doc.save({ timestamps: false });
  return doc;
}

const tikka = await listing(spice, {
  title: 'Chicken Tikka & Curry Combo',
  description: 'Lunch buffet surplus: chicken tikka, butter chicken and dal, packed in sealed containers.',
  image: 'food-curries.jpg',
  category: 'cooked_meal',
  dietType: 'non_veg',
  allergens: ['dairy'],
  quantity: 15,
  unit: 'servings',
  original: 240,
  offer: 99,
  storage: 'refrigerated',
  preparedAt: hours(-2),
  pickupEnd: hours(4),
  instructions: 'Collect from the back entrance, ask for Anil.',
  labels: ['chicken tikka', 'curry', 'indian cuisine'],
});
const pulao = await listing(spice, {
  title: 'Veg Pulao & Papad',
  description: 'Freshly made veg pulao with papad and pickle from a cancelled catering order.',
  image: 'food-breads.jpg',
  category: 'cooked_meal',
  dietType: 'veg',
  quantity: 25,
  available: 15,
  unit: 'servings',
  original: 160,
  offer: 0,
  storage: 'room_temp',
  preparedAt: min(-40),
  pickupEnd: min(110),
  instructions: 'Bring your own containers if possible.',
  labels: ['pulao', 'rice', 'papad'],
});
await listing(chaat, {
  title: 'Samosas with Mint Chutney',
  description: 'Evening batch of potato samosas (2 per pack) with green chutney.',
  image: 'food-starters.jpg',
  category: 'cooked_meal',
  dietType: 'veg',
  allergens: ['gluten'],
  quantity: 40,
  unit: 'packets',
  original: 40,
  offer: 15,
  storage: 'room_temp',
  preparedAt: min(-60),
  pickupEnd: min(105),
  labels: ['samosa', 'snack', 'chutney'],
});
await listing(chaat, {
  title: 'Steamed Basmati Rice & Dal Tadka',
  description: 'Two large vessels of rice and dal, prepared for today’s lunch service.',
  image: 'food-rice.jpg',
  category: 'cooked_meal',
  dietType: 'veg',
  quantity: 8,
  unit: 'kg',
  original: 150,
  offer: 0,
  storage: 'room_temp',
  preparedAt: min(-30),
  pickupEnd: min(120),
  labels: ['rice', 'dal', 'indian cuisine'],
});

// Past, completed rescues so impact numbers are not empty.
const thali = await listing(spice, {
  title: 'Thali Buffet Leftovers',
  description: 'Assorted curries, rice and breads from the dinner buffet.',
  image: 'food-spread.jpg',
  category: 'cooked_meal',
  dietType: 'veg',
  quantity: 30,
  available: 0,
  unit: 'servings',
  original: 200,
  offer: 0,
  storage: 'refrigerated',
  preparedAt: days(-1),
  pickupStart: hours(-23),
  pickupEnd: hours(-20),
  status: 'completed',
  createdAt: hours(-23),
});
const samosaOld = await listing(chaat, {
  title: 'Samosa & Kachori Pack',
  description: 'Yesterday evening’s snacks, fresh and packed.',
  image: 'food-starters.jpg',
  category: 'cooked_meal',
  dietType: 'veg',
  quantity: 12,
  available: 0,
  unit: 'packets',
  original: 40,
  offer: 15,
  storage: 'room_temp',
  preparedAt: hours(-26),
  pickupStart: hours(-25.5),
  pickupEnd: hours(-24),
  status: 'completed',
  createdAt: hours(-25.5),
});

await Claim.create([
  {
    listing: pulao._id,
    donor: spice._id,
    claimer: annapurna._id,
    quantity: 10,
    unitPrice: 0,
    originalUnitPrice: 160,
    pickupCode: '482913',
    status: 'reserved',
    note: 'Our van will reach in 40 minutes.',
    expiresAt: claimExpiry(pulao.pickup.end),
  },
  {
    listing: thali._id,
    donor: spice._id,
    claimer: annapurna._id,
    quantity: 30,
    unitPrice: 0,
    originalUnitPrice: 200,
    pickupCode: '100001',
    status: 'picked_up',
    expiresAt: claimExpiry(thali.pickup.end),
    pickedUpAt: hours(-21),
  },
  {
    listing: samosaOld._id,
    donor: chaat._id,
    claimer: citizen._id,
    quantity: 6,
    unitPrice: 15,
    originalUnitPrice: 40,
    pickupCode: '100002',
    status: 'picked_up',
    expiresAt: claimExpiry(samosaOld.pickup.end),
    pickedUpAt: hours(-24.5),
  },
  {
    listing: samosaOld._id,
    donor: chaat._id,
    claimer: hungerFree._id,
    quantity: 6,
    unitPrice: 15,
    originalUnitPrice: 40,
    pickupCode: '100003',
    status: 'picked_up',
    expiresAt: claimExpiry(samosaOld.pickup.end),
    pickedUpAt: hours(-24.2),
  },
]);

// ---- dumping reports -----------------------------------------------------------
async function report(data) {
  const createdAt = data.createdAt;
  const reportAi = {
    analyzed: true,
    verified: data.ai?.verified ?? true,
    confidence: data.ai?.confidence ?? data.confidence,
    labels: data.ai?.labels || ['waste', 'litter', 'plastic', 'bottle'],
    provider: 'openai',
    reason: data.ai?.reason || 'Garbage and litter are clearly visible in a public place.',
  };
  const screening = reportScreening(reportAi);
  const history = [{ status: 'pending', note: 'Report submitted', by: citizen._id, at: createdAt }];
  if (screening.decision === 'rejected') {
    history.push({ status: 'rejected', note: `Automatically rejected by the AI photo check: ${screening.reason}`, at: createdAt });
  }
  for (const h of data.history || []) history.push({ ...h, by: staff._id });
  // The automatic rejection above has no staff author.
  history.forEach((h) => h.note?.startsWith('Automatically') && delete h.by);
  const doc = new Report({
    user: citizen._id,
    description: data.description,
    category: data.category,
    severity: data.severity,
    location: toPoint(data.lat, data.lng),
    address: data.address,
    image: await copyImage(data.image, 'reports'),
    status: data.status,
    ai: reportAi,
    screening: { ...screening, source: 'ai' },
    authorityNotified: screening.decision === 'passed',
    authorityNotifiedAt: screening.decision === 'passed' ? createdAt : undefined,
    history,
    resolvedAt: data.status === 'resolved' ? history[history.length - 1].at : undefined,
    createdAt,
    updatedAt: history[history.length - 1].at,
  });
  await doc.save({ timestamps: false });
}

await report({
  description: 'Overflowing public bin near the metro exit, bottles spilling onto the footpath.',
  category: 'mixed',
  severity: 'high',
  status: 'pending',
  lat: 12.9756,
  lng: 77.6069,
  address: 'MG Road Metro, Bengaluru',
  image: 'garbage-bin.jpg',
  confidence: 0.93,
  createdAt: hours(-2),
});
await report({
  description: 'Large pile of plastic waste dumped on the footpath overnight.',
  category: 'plastic',
  severity: 'critical',
  status: 'in_progress',
  lat: 12.9365,
  lng: 77.626,
  address: '1st Cross, Koramangala 5th Block',
  image: 'garbage-pile.jpg',
  confidence: 0.96,
  createdAt: days(-1),
  history: [{ status: 'in_progress', note: 'Cleanup crew assigned for tomorrow morning.', at: hours(-20) }],
});
await report({
  description: 'Construction debris and plastic bags near the lake walkway.',
  category: 'construction',
  severity: 'medium',
  status: 'resolved',
  lat: 12.915,
  lng: 77.64,
  address: 'Agara Lake, HSR Layout',
  image: 'garbage-street.jpg',
  confidence: 0.88,
  createdAt: days(-3),
  history: [
    { status: 'in_progress', note: 'Inspected by ward engineer.', at: days(-2.8) },
    { status: 'resolved', note: 'Debris cleared and fine issued to contractor.', at: days(-2) },
  ],
});
await report({
  description: 'Garbage accumulating next to the bus stop.',
  category: 'mixed',
  severity: 'low',
  status: 'pending',
  lat: 12.928,
  lng: 77.583,
  address: 'Jayanagar 4th Block Bus Stop',
  image: 'garbage-close.jpg',
  confidence: 0.79,
  createdAt: days(-5),
});
await report({
  description: 'Vegetable waste dumped behind the market every evening.',
  category: 'organic',
  severity: 'high',
  status: 'resolved',
  lat: 12.964,
  lng: 77.577,
  address: 'KR Market, Bengaluru',
  image: 'garbage-bin.jpg',
  confidence: 0.91,
  createdAt: days(-8),
  history: [
    { status: 'in_progress', note: 'Shared with market association.', at: days(-7.5) },
    { status: 'resolved', note: 'Composting bins installed at the market.', at: days(-6) },
  ],
});
await report({
  description: 'Old electronics and bags dumped on an empty plot.',
  category: 'e_waste',
  severity: 'medium',
  status: 'rejected',
  lat: 12.9719,
  lng: 77.6412,
  address: 'Indiranagar 2nd Stage',
  image: 'garbage-pile.jpg',
  confidence: 0.84,
  createdAt: days(-11),
  history: [{ status: 'rejected', note: 'Duplicate of an existing report — already scheduled.', at: days(-10) }],
});

// A photo that isn't dumping (rejected by the AI) and one the AI was unsure about.
await report({
  description: 'Rubbish near the corner of our street.',
  category: 'mixed',
  severity: 'medium',
  status: 'rejected',
  lat: 12.9784,
  lng: 77.6408,
  address: '100 Feet Road, Indiranagar',
  image: 'food-spread.jpg',
  ai: {
    verified: false,
    confidence: 0.95,
    labels: ['food', 'plates', 'table', 'restaurant'],
    reason: 'The photo shows plates of food on a table, not dumped waste.',
  },
  createdAt: hours(-5),
});
await report({
  description: 'Some bags left near the park gate, not sure if it is waste.',
  category: 'mixed',
  severity: 'low',
  status: 'pending',
  lat: 12.9507,
  lng: 77.5848,
  address: 'Lalbagh West Gate',
  image: 'garbage-close.jpg',
  ai: {
    verified: true,
    confidence: 0.45,
    labels: ['bags', 'pavement', 'gate'],
    reason: 'A few bags are visible but it is unclear whether they are dumped waste.',
  },
  createdAt: hours(-3),
});

// A listing whose photo failed the AI check: held back until staff approve it.
await listing(chaat, {
  title: 'Leftover snacks',
  description: 'Evening snacks, packed.',
  image: 'garbage-street.jpg',
  category: 'cooked_meal',
  dietType: 'veg',
  quantity: 8,
  unit: 'packets',
  original: 40,
  offer: 0,
  storage: 'room_temp',
  preparedAt: min(-40),
  pickupEnd: hours(2),
  ai: { verified: false, confidence: 0.9, labels: ['street', 'debris'], reason: 'The photo shows a street with debris, not food.' },
  createdAt: min(-30),
});

await Notification.create([
  {
    user: annapurna._id,
    type: 'food_nearby',
    title: '15 servings of Chicken Tikka & Curry Combo available nearby',
    body: 'Spice Garden Restaurant · ₹99 per unit (was ₹240)',
    link: `/food/${tikka._id}`,
  },
  {
    user: spice._id,
    type: 'claim_new',
    title: 'Annapurna Food Bank reserved 10 servings of Veg Pulao & Papad',
    body: 'Free pickup. Ask for their pickup code.',
    link: `/food/${pulao._id}`,
  },
  {
    user: citizen._id,
    type: 'report_status',
    title: 'Your dumping report is now in progress',
    body: 'Cleanup crew assigned for tomorrow morning.',
    link: '/my-reports',
  },
]);

console.log(
  remote
    ? `\nSeeded demo data on ${connection.host}. Demo accounts use your SEED_PASSWORD.`
    : `\nSeeded demo data. Demo accounts use the password defined in server/scripts/seed.js (DEMO_PASSWORD).`,
);
const accounts = ['admin', 'staff', 'spicegarden', 'chaatstreet', 'annapurna', 'hungerfree', 'citizen'].map((e) => `${e}${DEMO_DOMAIN}`);
accounts.push(`greenbowl${DEMO_DOMAIN} (restaurant, pending approval)`, `sevatrust${DEMO_DOMAIN} (NGO, pending approval)`);
for (const account of accounts) console.log(`  ${account}`);
await disconnectDB();
