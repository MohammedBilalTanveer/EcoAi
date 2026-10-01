import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import {
  ACCOUNT_STATUSES,
  Claim,
  FoodListing,
  REPORT_STATUSES,
  ROLES,
  Report,
  SCREENING_DECISIONS,
  STAFF_ROLES,
  User,
} from '../models/index.js';
import { impactOf } from '../services/food.js';
import { escapeHtml, sendMail } from '../services/mailer.js';
import { notify } from '../services/notify.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/http.js';
import { adminUserDTO, listingDTO, reportDTO } from '../utils/serialize.js';
import { assertObjectId, escapeRegex, parse, zx } from '../utils/validate.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const optEnum = (values) => z.preprocess((v) => v || undefined, z.enum(values).optional());

const countMap = async (model, field, ids, match = {}) =>
  new Map(
    (await model.aggregate([{ $match: { [field]: { $in: ids }, ...match } }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }])).map(
      (r) => [String(r._id), r.n],
    ),
  );

/** Reports filed, food listed and reservations made, per user id. */
async function activityFor(ids) {
  const [reports, listings, claims] = await Promise.all([
    countMap(Report, 'user', ids),
    countMap(FoodListing, 'donor', ids, { removed: { $ne: true } }),
    countMap(Claim, 'claimer', ids),
  ]);
  return (id) => ({
    reports: reports.get(String(id)) || 0,
    listings: listings.get(String(id)) || 0,
    claims: claims.get(String(id)) || 0,
  });
}

// GET /api/admin/stats — overview numbers + newest accounts
router.get('/stats', async (_req, res) => {
  const [roleStatus, reportsByStatus, listings, picked, recent, reportChecks, foodChecks] = await Promise.all([
    User.aggregate([{ $group: { _id: { role: '$role', status: { $ifNull: ['$status', 'active'] } }, n: { $sum: 1 } } }]),
    Report.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    FoodListing.countDocuments({ removed: { $ne: true } }),
    Claim.find({ status: 'picked_up' })
      .select('quantity unitPrice originalUnitPrice listing')
      .populate('listing', 'quantity.unit')
      .lean(),
    User.find().sort({ createdAt: -1 }).limit(8).lean(),
    Report.aggregate([{ $group: { _id: '$screening.decision', n: { $sum: 1 } } }]),
    FoodListing.aggregate([{ $match: { removed: { $ne: true } } }, { $group: { _id: '$screening.decision', n: { $sum: 1 } } }]),
  ]);
  const checks = (rows) => {
    const counts = Object.fromEntries(rows.map((r) => [r._id, r.n]));
    return Object.fromEntries(SCREENING_DECISIONS.map((d) => [d, counts[d] || 0]));
  };

  const users = { total: 0, byRole: Object.fromEntries(ROLES.map((r) => [r, 0])), byStatus: Object.fromEntries(ACCOUNT_STATUSES.map((s) => [s, 0])) };
  for (const { _id, n } of roleStatus) {
    users.total += n;
    users.byRole[_id.role] = (users.byRole[_id.role] || 0) + n;
    users.byStatus[_id.status] = (users.byStatus[_id.status] || 0) + n;
  }
  const reports = { total: 0, byStatus: Object.fromEntries(REPORT_STATUSES.map((s) => [s, 0])) };
  for (const { _id, n } of reportsByStatus) {
    reports.total += n;
    reports.byStatus[_id] = n;
  }

  res.json({
    users,
    pending: users.byStatus.pending,
    reports: { ...reports, screening: checks(reportChecks) },
    food: {
      listings,
      screening: checks(foodChecks),
      impact: impactOf(picked.filter((c) => c.listing).map((c) => ({ ...c, unit: c.listing.quantity.unit }))),
    },
    recentUsers: recent.map((u) => adminUserDTO(u)),
  });
});

const listSchema = z.object({
  role: optEnum(ROLES),
  status: optEnum(ACCOUNT_STATUSES),
  q: zx.optStr(80, 'Search'),
  page: zx.optNum('Page', { min: 1, max: 10000 }),
  limit: zx.optNum('Limit', { min: 1, max: 100 }),
});

// GET /api/admin/users — searchable, filterable user list with activity counts
router.get('/users', async (req, res) => {
  const q = parse(listSchema, req.query);
  const filter = {};
  if (q.role) filter.role = q.role;
  if (q.status) filter.status = q.status;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { organization: rx }, { phone: rx }];
  }
  const page = Math.floor(q.page ?? 1);
  const limit = Math.floor(q.limit ?? 20);
  // Approval queue: oldest applications first. Everything else: newest first.
  const sort = q.status === 'pending' ? { createdAt: 1 } : { createdAt: -1 };

  const [items, total] = await Promise.all([
    User.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  const activity = await activityFor(items.map((u) => u._id));
  res.json({
    users: items.map((u) => adminUserDTO(u, activity(u._id))),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

// GET /api/admin/users/:id — one user with their recent activity
router.get('/users/:id', async (req, res) => {
  assertObjectId(req.params.id, 'User');
  const user = await User.findById(req.params.id).populate('reviewedBy', 'name').lean();
  if (!user) throw notFound('User not found.');
  const [activity, reports, listings, claims] = await Promise.all([
    activityFor([user._id]),
    Report.find({ user: user._id }).sort({ createdAt: -1 }).limit(5).lean(),
    FoodListing.find({ donor: user._id, removed: { $ne: true } }).sort({ createdAt: -1 }).limit(5).lean(),
    Claim.find({ claimer: user._id }).sort({ createdAt: -1 }).limit(5).populate('listing', 'title').lean(),
  ]);
  res.json({
    user: { ...adminUserDTO(user, activity(user._id)), reviewedBy: user.reviewedBy?.name || null },
    recent: {
      reports: reports.map((r) => reportDTO(r)),
      listings: listings.map((l) => listingDTO(l)),
      claims: claims.map((c) => ({
        id: c._id,
        title: c.listing?.title || 'Listing',
        quantity: c.quantity,
        status: c.status,
        createdAt: c.createdAt,
      })),
    },
  });
});

const WELCOME = {
  restaurant: { body: 'You can now list surplus food for NGOs and people nearby.', link: '/food/new' },
  ngo: { body: 'You will now get alerts when food is listed near you, and you can reserve it.', link: '/food' },
};

function statusMessage(user, status, previous, note) {
  if (status === 'active') {
    const welcome = WELCOME[user.role] || { body: 'You now have full access to EcoAI.', link: '/' };
    return previous === 'pending'
      ? { title: 'Your EcoAI account has been approved 🎉', body: note || welcome.body, link: welcome.link }
      : { title: 'Your EcoAI account is active again', body: note || welcome.body, link: welcome.link };
  }
  if (status === 'rejected') {
    return {
      title: 'Your EcoAI account application was not approved',
      body: note || 'If you think this is a mistake, reply to this email or contact us from the website.',
      link: '/',
    };
  }
  return {
    title: 'Your EcoAI account has been suspended',
    body: note || 'Please contact us from the website if you have any questions.',
    link: '/',
  };
}

const createStaffSchema = z.object({
  name: zx.str(80, 'Name'),
  email: z
    .string({ error: 'Email is required.' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Please enter a valid email address.' })),
  role: z.enum(STAFF_ROLES, { error: 'Choose staff or admin.' }),
  // Optional: without a password the person signs in with Google using this email.
  password: z.preprocess(
    (v) => v || undefined,
    z.string().min(10, 'Use at least 10 characters for a staff or admin password.').max(128).optional(),
  ),
  phone: zx.optStr(20, 'Phone'),
});

// POST /api/admin/users — create a staff or admin account
router.post('/users', async (req, res) => {
  const data = parse(createStaffSchema, req.body);
  if (await User.exists({ email: data.email })) {
    throw conflict('An account with this email already exists. Ask them to use a different email for staff access.', 'ALREADY_REGISTERED');
  }
  const user = await User.create({
    name: data.name,
    email: data.email,
    phone: data.phone,
    role: data.role,
    status: 'active',
    passwordHash: data.password ? await bcrypt.hash(data.password, 12) : undefined,
    authProviders: data.password ? ['password'] : [],
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
  });

  const kind = data.role === 'admin' ? 'an admin' : 'a staff';
  const loginPath = data.role === 'admin' ? '/admin/login' : '/staff-login';
  sendMail({
    to: user.email,
    subject: `EcoAI: you've been given ${kind} account`,
    text: `${req.user.name} created ${kind} account for you on EcoAI. Sign in at ${env.publicUrl}${loginPath}`,
    heading: `Welcome to the EcoAI team`,
    lines: [
      `Hi ${escapeHtml(user.name)}, ${escapeHtml(req.user.name)} created ${kind} account for you.`,
      data.password
        ? 'Sign in with this email address and the password they shared with you, then change it under Profile.'
        : 'Sign in with “Continue with Google” using this email address.',
    ],
    cta: { label: 'Sign in', href: `${env.publicUrl}${data.password ? loginPath : '/login'}` },
  });

  const activity = await activityFor([user._id]);
  res.status(201).json({ user: adminUserDTO(user.toObject(), activity(user._id)) });
});

// PATCH /api/admin/users/:id/status — approve / reject / suspend / reactivate
router.patch('/users/:id/status', async (req, res) => {
  assertObjectId(req.params.id, 'User');
  const { status, note } = parse(
    z.object({
      status: z.enum(['active', 'rejected', 'suspended'], { error: 'Choose approve, reject or suspend.' }),
      note: zx.optStr(500, 'Note'),
    }),
    req.body,
  );
  const user = await User.findById(req.params.id);
  if (!user) throw notFound('User not found.');
  if (String(user._id) === String(req.user._id)) throw badRequest('You cannot change your own account status.', 'SELF_CHANGE');
  if (user.role === 'admin') throw forbidden('Admin accounts can only be changed from the server.', 'ADMIN_PROTECTED');
  const previous = user.status || 'active';
  if (previous === status) throw badRequest('The account already has this status.', 'NO_CHANGE');

  user.status = status;
  user.statusNote = note || '';
  user.reviewedBy = req.user._id;
  user.reviewedAt = new Date();
  await user.save();

  const msg = statusMessage(user, status, previous, note);
  await notify(user._id, { type: `account_${status}`, title: msg.title, body: msg.body, link: msg.link });
  // Account decisions are transactional, so the email goes out regardless of notification preferences.
  sendMail({
    to: user.email,
    subject: `EcoAI: ${msg.title}`,
    text: `${msg.title}\n\n${msg.body}`,
    heading: msg.title,
    lines: [`Hi ${escapeHtml(user.name)},`, escapeHtml(msg.body)],
    cta: status === 'active' ? { label: 'Open EcoAI', href: `${env.publicUrl}${msg.link}` } : undefined,
  });

  const activity = await activityFor([user._id]);
  res.json({ user: adminUserDTO(user.toObject(), activity(user._id)) });
});

export default router;
