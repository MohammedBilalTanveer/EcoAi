import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import {
  Claim,
  FoodListing,
  SCREENING_DECISIONS,
  REPORT_CATEGORIES,
  REPORT_SEVERITIES,
  REPORT_STATUSES,
  Report,
  User,
} from '../models/index.js';
import { impactOf } from '../services/food.js';
import { escapeHtml, sendMail } from '../services/mailer.js';
import { announceListing, forwardReportToAuthority, notify } from '../services/notify.js';
import { env } from '../config/env.js';
import { badRequest, notFound } from '../utils/http.js';
import { listingDTO, reportDTO } from '../utils/serialize.js';
import { assertObjectId, escapeRegex, parse, zx } from '../utils/validate.js';

const router = Router();
router.use(requireAuth, requireStaff);

const optEnum = (values) => z.preprocess((v) => v || undefined, z.enum(values).optional());
const STATUS_LABEL = { pending: 'Pending', in_progress: 'In progress', resolved: 'Resolved', rejected: 'Rejected' };

const countBy = async (model, field, match = {}) =>
  Object.fromEntries(
    (await model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }])).map((r) => [
      r._id,
      r.n,
    ]),
  );

// GET /api/staff/stats — dashboard numbers
router.get('/stats', async (_req, res) => {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 13);

  const [byStatus, bySeverity, byCategory, daily, resolution, verified, total, foodByStatus, flagged, users, picked, reportChecks, foodChecks] =
    await Promise.all([
      countBy(Report, 'status'),
      countBy(Report, 'severity', { status: { $in: ['pending', 'in_progress'] } }),
      countBy(Report, 'category'),
      Report.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
            n: { $sum: 1 },
          },
        },
      ]),
      Report.aggregate([
        { $match: { status: 'resolved', resolvedAt: { $exists: true } } },
        { $group: { _id: null, avgMs: { $avg: { $subtract: ['$resolvedAt', '$createdAt'] } } } },
      ]),
      Report.countDocuments({ 'ai.verified': true }),
      Report.countDocuments(),
      countBy(FoodListing, 'status', { removed: { $ne: true } }),
      FoodListing.countDocuments({ flagged: true, removed: { $ne: true } }),
      countBy(User, 'role'),
      Claim.find({ status: 'picked_up' })
        .select('quantity unitPrice originalUnitPrice listing')
        .populate('listing', 'quantity.unit')
        .lean(),
      countBy(Report, 'screening.decision'),
      countBy(FoodListing, 'screening.decision', { removed: { $ne: true } }),
    ]);
  const checks = (counts) => Object.fromEntries(SCREENING_DECISIONS.map((d) => [d, counts[d] || 0]));

  const dailyMap = Object.fromEntries(daily.map((d) => [d._id, d.n]));
  const days = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    days.push({ date: key, count: dailyMap[key] || 0 });
  }

  res.json({
    reports: {
      total,
      byStatus: Object.fromEntries(REPORT_STATUSES.map((s) => [s, byStatus[s] || 0])),
      openBySeverity: Object.fromEntries(REPORT_SEVERITIES.map((s) => [s, bySeverity[s] || 0])),
      byCategory,
      verifiedPct: total ? Math.round((verified / total) * 100) : 0,
      avgResolutionHours: resolution[0] ? Math.round((resolution[0].avgMs / 3600000) * 10) / 10 : null,
      daily: days,
      screening: checks(reportChecks),
    },
    food: {
      byStatus: foodByStatus,
      flagged,
      screening: checks(foodChecks),
      impact: impactOf(picked.filter((c) => c.listing).map((c) => ({ ...c, unit: c.listing.quantity.unit }))),
    },
    users,
  });
});

const listSchema = z.object({
  status: optEnum(REPORT_STATUSES),
  severity: optEnum(REPORT_SEVERITIES),
  category: optEnum(REPORT_CATEGORIES),
  verified: optEnum(['yes', 'no']),
  ai: optEnum(SCREENING_DECISIONS),
  q: zx.optStr(80, 'Search'),
  page: zx.optNum('Page', { min: 1, max: 10000 }),
  limit: zx.optNum('Limit', { min: 1, max: 200 }),
  sort: optEnum(['newest', 'oldest', 'severity']),
});

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// GET /api/staff/reports — filterable, paginated list
router.get('/reports', async (req, res) => {
  const q = parse(listSchema, req.query);
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.severity) filter.severity = q.severity;
  if (q.category) filter.category = q.category;
  if (q.verified) filter['ai.verified'] = q.verified === 'yes';
  if (q.ai) filter['screening.decision'] = q.ai;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ description: rx }, { address: rx }];
  }
  const page = Math.floor(q.page ?? 1);
  const limit = Math.floor(q.limit ?? 20);

  let query = Report.find(filter).populate('user', 'name email role avatar');
  if (q.sort === 'oldest') query = query.sort({ createdAt: 1 });
  else query = query.sort({ createdAt: -1 });

  const [items, total] = await Promise.all([
    q.sort === 'severity' ? query.lean() : query.skip((page - 1) * limit).limit(limit).lean(),
    Report.countDocuments(filter),
  ]);
  let reports = items;
  if (q.sort === 'severity') {
    reports = items
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.createdAt - a.createdAt)
      .slice((page - 1) * limit, page * limit);
  }

  res.json({
    // Staff and admins see who filed each report.
    reports: reports.map((r) => {
      const dto = reportDTO(r, { includeUser: true });
      return { ...dto, user: dto.user && { ...dto.user, email: r.user?.email || null } };
    }),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

// GET /api/staff/reports/:id
router.get('/reports/:id', async (req, res) => {
  assertObjectId(req.params.id, 'Report');
  const report = await Report.findById(req.params.id)
    .populate('user', 'name email phone role avatar')
    .populate('history.by', 'name role')
    .populate('screening.reviewedBy', 'name role')
    .lean();
  if (!report) throw notFound('Report not found.');
  const dto = reportDTO(report, { includeUser: true });
  dto.user = { ...dto.user, email: report.user?.email, phone: report.user?.phone || null };
  res.json({ report: dto });
});

const updateSchema = z.object({
  status: z.enum(REPORT_STATUSES, { error: 'Choose a valid status.' }),
  note: zx.optStr(500, 'Note'),
});

async function updateReport(req, res) {
  assertObjectId(req.params.id, 'Report');
  const { status, note } = parse(updateSchema, req.body);
  const report = await Report.findById(req.params.id).populate('user', 'name email emailNotifications');
  if (!report) throw notFound('Report not found.');
  if (report.status === status && !note) throw badRequest('Choose a new status or add a note.', 'NO_CHANGE');

  const changed = report.status !== status;
  report.status = status;
  report.history.push({ status, note, by: req.user._id, at: new Date() });
  if (status === 'resolved') report.resolvedAt = new Date();
  await report.save();

  const reporter = report.user;
  if (reporter?._id) {
    const title = changed
      ? `Your dumping report is now ${STATUS_LABEL[status].toLowerCase()}`
      : 'Update on your dumping report';
    await notify(reporter._id, {
      type: 'report_status',
      title,
      body: note || report.address || 'Thanks for helping keep the city clean.',
      link: '/my-reports',
    });
    if (changed && reporter.emailNotifications !== false) {
      sendMail({
        to: reporter.email,
        subject: `EcoAI: ${title}`,
        text: note || title,
        heading: title,
        lines: [
          `Hi ${escapeHtml(reporter.name)}, your report${report.address ? ` at <b>${escapeHtml(report.address)}</b>` : ''} was updated to <b>${STATUS_LABEL[status]}</b>.`,
          note ? `<b>Note from staff:</b> ${escapeHtml(note)}` : 'Thank you for helping keep the city clean.',
        ],
        cta: { label: 'View my reports', href: `${env.publicUrl}/my-reports` },
      });
    }
  }

  await report.populate('history.by', 'name role');
  res.json({ report: reportDTO(report.toObject(), { includeUser: true }) });
}

// PATCH /api/staff/reports/:id (+ legacy /update/)
router.patch('/reports/:id', updateReport);
router.patch('/reports/:id/update', updateReport);
router.put('/reports/:id/update', updateReport);

const screeningInput = z.object({
  decision: z.enum(['passed', 'rejected'], { error: 'Choose whether the photo passes or is rejected.' }),
  note: zx.optStr(500, 'Note'),
});

// PATCH /api/staff/reports/:id/screening — staff confirm or overturn the AI photo check
router.patch('/reports/:id/screening', async (req, res) => {
  assertObjectId(req.params.id, 'Report');
  const { decision, note } = parse(screeningInput, req.body);
  const report = await Report.findById(req.params.id).populate('user', 'name email emailNotifications');
  if (!report) throw notFound('Report not found.');
  const passed = decision === 'passed';
  const changed = report.screening?.decision !== decision;

  report.screening = {
    decision,
    reason: passed ? 'Accepted by staff after reviewing the photo.' : 'Rejected by staff after reviewing the photo.',
    source: 'staff',
    note,
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
  };
  const historyNote = `Photo check ${passed ? 'accepted' : 'rejected'} by staff${note ? ` — ${note}` : ''}`;
  if (!passed) report.status = 'rejected';
  else if (report.status === 'rejected') report.status = 'pending';
  report.history.push({ status: report.status, note: historyNote, by: req.user._id, at: new Date() });
  await report.save();

  const sentToAuthority = passed ? await forwardReportToAuthority(report, report.user?.name, { byStaff: true }) : false;
  if (changed && report.user?._id) {
    await notify(report.user._id, {
      type: 'report_status',
      title: passed ? 'Your dumping report was accepted after review' : 'Your dumping report was rejected after review',
      body: note || (passed ? 'Thanks — it has been passed on for cleanup.' : 'The photo did not show illegal dumping.'),
      link: '/my-reports',
    });
  }

  await report.populate([{ path: 'history.by', select: 'name role' }, { path: 'screening.reviewedBy', select: 'name role' }]);
  res.json({ report: reportDTO(report.toObject(), { includeUser: true }), sentToAuthority });
});

// ---------------------------------------------------------------------------
// Food moderation
// ---------------------------------------------------------------------------

const foodListSchema = z.object({
  status: optEnum(['available', 'reserved', 'completed', 'expired', 'cancelled']),
  flagged: optEnum(['yes', 'no']),
  ai: optEnum(SCREENING_DECISIONS),
  limit: zx.optNum('Limit', { min: 1, max: 200 }),
});

// GET /api/staff/food
router.get('/food', async (req, res) => {
  const q = parse(foodListSchema, req.query);
  const filter = { removed: { $ne: true } };
  if (q.status) filter.status = q.status;
  if (q.flagged) filter.flagged = q.flagged === 'yes';
  if (q.ai) filter['screening.decision'] = q.ai;
  const listings = await FoodListing.find(filter)
    .populate('donor', 'name organization role avatar phone')
    .populate('screening.reviewedBy', 'name role')
    .sort({ flagged: -1, createdAt: -1 })
    .limit(Math.floor(q.limit ?? 50))
    .lean();
  res.json({ listings: listings.map((l) => listingDTO(l, { includeContact: true })) });
});

// PATCH /api/staff/food/:id — { action: 'approve' | 'remove', note }
router.patch('/food/:id', async (req, res) => {
  assertObjectId(req.params.id, 'Listing');
  const { action, note } = parse(
    z.object({ action: z.enum(['approve', 'remove']), note: zx.optStr(300, 'Note') }),
    req.body,
  );
  const listing = await FoodListing.findById(req.params.id).populate('donor', 'name organization role avatar phone');
  if (!listing || listing.removed) throw notFound('Listing not found.');
  listing.reviewedBy = req.user._id;

  listing.screening = {
    decision: action === 'approve' ? 'passed' : 'rejected',
    reason: action === 'approve' ? 'Approved by staff after reviewing the photo.' : 'Removed by staff after reviewing the photo.',
    source: 'staff',
    note,
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
  };

  if (action === 'approve') {
    // Only listings that were held back still need publishing and NGO alerts.
    const wasHeld = listing.flagged;
    listing.flagged = false;
    await listing.save();
    if (wasHeld && listing.status === 'available' && listing.pickup.end > new Date()) {
      listing.notifiedNgos = await announceListing(listing, listing.donor);
      await listing.save();
    }
    if (wasHeld) await notify(listing.donor._id, {
      type: 'listing_approved',
      title: `Your listing "${listing.title}" was approved`,
      body: 'Nearby NGOs have been alerted.',
      link: `/food/${listing._id}`,
    });
  } else {
    listing.removed = true;
    listing.status = 'cancelled';
    listing.cancelReason = note || 'Removed by moderator';
    await listing.save();
    const active = await Claim.find({ listing: listing._id, status: 'reserved' });
    await Claim.updateMany({ _id: { $in: active.map((c) => c._id) } }, { status: 'cancelled', cancelledAt: new Date() });
    await notify(active.map((c) => c.claimer), {
      type: 'listing_cancelled',
      title: `Listing removed: ${listing.title}`,
      body: 'This listing was removed by a moderator.',
      link: '/food/dashboard?tab=reservations',
    });
    await notify(listing.donor._id, {
      type: 'listing_removed',
      title: `Your listing "${listing.title}" was removed`,
      body: note || 'A moderator removed it because the photo did not appear to show food.',
      link: '/food/dashboard',
    });
  }
  res.json({ listing: listingDTO(listing, { includeContact: true }) });
});

export default router;
