import { Router } from 'express';
import { z } from 'zod';
import { isStaffUser, requireAuth } from '../middleware/auth.js';
import { limiter } from '../middleware/rateLimit.js';
import { requireImage, upload } from '../middleware/upload.js';
import { saveImage } from '../services/storage.js';
import { REPORT_CATEGORIES, REPORT_SEVERITIES, Report } from '../models/index.js';
import { analyzeWasteImage } from '../services/ai.js';
import { forwardReportToAuthority, notifyStaff } from '../services/notify.js';
import { reportScreening } from '../services/screening.js';
import { toPoint } from '../utils/geo.js';
import { forbidden, notFound } from '../utils/http.js';
import { reportDTO } from '../utils/serialize.js';
import { assertObjectId, parse, zx } from '../utils/validate.js';

const router = Router();

const createSchema = z.object({
  description: zx.optStr(1000, 'Description'),
  category: z.preprocess((v) => v || undefined, z.enum(REPORT_CATEGORIES).default('mixed')),
  severity: z.preprocess((v) => v || undefined, z.enum(REPORT_SEVERITIES).default('medium')),
  address: zx.optStr(300, 'Address'),
  lat: zx.lat(),
  lng: zx.lng(),
});

/** What happened to the report, in words the reporter understands. */
const OUTCOME = {
  passed: (sent) =>
    sent
      ? 'Your photo passed the AI check and the report was sent to the city authority.'
      : 'Your photo passed the AI check. Municipal staff have been alerted.',
  review: () => 'Thanks! Municipal staff will review your report shortly.',
  rejected: () => 'Your photo did not pass the AI check, so the report was not sent to the city.',
};

async function createReport(req, res) {
  const body = { ...req.body };
  // Accept the original frontend's field names too.
  body.lat ??= body.location_lat;
  body.lng ??= body.location_lng;
  const data = parse(createSchema, body);
  const type = requireImage(req.file, 'photo of the dumping site');

  const [image, ai] = await Promise.all([
    saveImage(req.file.buffer, type, 'reports'),
    analyzeWasteImage(req.file.buffer, type.mime),
  ]);
  const screening = reportScreening(ai);
  const rejected = screening.decision === 'rejected';

  const report = await Report.create({
    user: req.user._id,
    description: data.description,
    category: data.category,
    severity: data.severity,
    address: data.address,
    location: toPoint(data.lat, data.lng),
    image,
    status: rejected ? 'rejected' : 'pending',
    ai: {
      analyzed: ai.analyzed,
      verified: ai.verified,
      confidence: ai.confidence,
      labels: ai.labels,
      provider: ai.provider,
      summary: ai.summary,
      reason: ai.reason,
    },
    screening: { decision: screening.decision, reason: screening.reason, source: 'ai' },
    history: [
      { status: 'pending', note: 'Report submitted', by: req.user._id },
      ...(rejected ? [{ status: 'rejected', note: `Automatically rejected by the AI photo check: ${screening.reason}` }] : []),
    ],
  });

  let sent = false;
  if (screening.decision === 'passed') {
    sent = await forwardReportToAuthority(report, req.user.name);
    await notifyStaff({
      type: 'report_new',
      title: `New ${report.severity} dumping report (AI passed)`,
      body: report.address || data.description || 'A citizen reported illegal dumping.',
      link: `/staff/report/${report._id}`,
    });
  } else if (screening.decision === 'review') {
    await notifyStaff({
      type: 'report_review',
      title: 'Dumping report needs review',
      body: screening.reason,
      link: `/staff/report/${report._id}`,
    });
  }

  res.status(201).json({
    report: reportDTO(report),
    ai,
    screening: { ...screening, sentToAuthority: sent, message: OUTCOME[screening.decision](sent) },
  });
}

// POST /api/reports (and legacy /api/reports/create/)
// Each report runs paid image analysis, so cap how many one account can file.
const reportLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  perUser: true,
  message: 'You have filed a lot of reports in the last hour. Please try again later.',
});
router.post('/', requireAuth, reportLimiter, upload.single('image'), createReport);
router.post('/create', requireAuth, reportLimiter, upload.single('image'), createReport);

// GET /api/reports/mine — the signed-in citizen's reports
router.get('/mine', requireAuth, async (req, res) => {
  const reports = await Report.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(200).lean();
  const counts = { total: reports.length, pending: 0, in_progress: 0, resolved: 0, rejected: 0 };
  for (const r of reports) counts[r.status] += 1;
  res.json({ reports: reports.map((r) => reportDTO(r)), counts });
});

const mapSchema = z.object({
  status: z.enum(['open', 'all', 'resolved']).default('open'),
  days: zx.optNum('Days', { min: 1, max: 365 }),
});

// GET /api/reports/map — anonymised community map of reports
router.get('/map', async (req, res) => {
  const { status, days } = parse(mapSchema, req.query);
  // Photos the AI or staff rejected never appear on the public map.
  const filter = { 'screening.decision': { $ne: 'rejected' } };
  if (status === 'open') filter.status = { $in: ['pending', 'in_progress'] };
  if (status === 'resolved') filter.status = 'resolved';
  filter.createdAt = { $gte: new Date(Date.now() - (days ?? 90) * 86400 * 1000) };
  const reports = await Report.find(filter)
    .sort({ createdAt: -1 })
    .limit(500)
    .select('location severity status category createdAt ai.verified')
    .lean();
  res.json({
    reports: reports.map((r) => ({
      id: r._id,
      lat: r.location.coordinates[1],
      lng: r.location.coordinates[0],
      severity: r.severity,
      status: r.status,
      category: r.category,
      verified: Boolean(r.ai?.verified),
      createdAt: r.createdAt,
    })),
  });
});

// GET /api/reports/:id — owner or staff
router.get('/:id', requireAuth, async (req, res) => {
  assertObjectId(req.params.id, 'Report');
  const report = await Report.findById(req.params.id).populate('history.by', 'name role').lean();
  if (!report) throw notFound('Report not found.');
  const isOwner = String(report.user) === String(req.user._id);
  if (!isOwner && !isStaffUser(req.user)) throw forbidden();
  res.json({ report: reportDTO(report, { includeUser: false }) });
});

export default router;
