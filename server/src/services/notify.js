import { env } from '../config/env.js';
import { FRESH_HOURS, STAFF_ROLES } from '../models/constants.js';
import { Notification, User } from '../models/index.js';
import { escapeHtml, sendMail } from './mailer.js';

const MAX_NGO_SEARCH_METERS = 50_000;

/** Creates in-app notifications for one or many users. */
export async function notify(userIds, { type, title, body, link }) {
  const ids = [...new Set([].concat(userIds).filter(Boolean).map(String))];
  if (ids.length === 0) return;
  await Notification.insertMany(ids.map((user) => ({ user, type, title, body, link }))).catch((err) =>
    console.error('[notify] failed to create notifications:', err.message),
  );
}

export async function notifyStaff(payload) {
  const staff = await User.find({ role: { $in: STAFF_ROLES } }).select('_id').lean();
  await notify(staff.map((s) => s._id), payload);
}

/** In-app notification (and optional email) to every admin. */
export async function notifyAdmins(payload, { email } = {}) {
  const admins = await User.find({ role: 'admin' }).select('_id email emailNotifications').lean();
  await notify(admins.map((a) => a._id), payload);
  if (email) {
    const to = admins.filter((a) => a.emailNotifications !== false).map((a) => a.email);
    await Promise.allSettled(to.map((addr) => sendMail({ ...email, to: addr })));
  }
}

/** NGOs whose own alert radius covers the given point. */
export async function findNearbyNgos(point) {
  return User.aggregate([
    {
      $geoNear: {
        near: point,
        distanceField: 'distance',
        maxDistance: MAX_NGO_SEARCH_METERS,
        spherical: true,
        // Only approved NGOs receive food alerts.
        query: { role: 'ngo', status: 'active' },
      },
    },
    {
      $match: {
        $expr: { $lte: ['$distance', { $multiply: [{ $ifNull: ['$notifyRadiusKm', 5] }, 1000] }] },
      },
    },
    { $project: { name: 1, email: 1, emailNotifications: 1, distance: 1 } },
  ]);
}

const money = (n) => (n === 0 ? 'Free' : `₹${n}`);

/**
 * Alerts nearby NGOs (in-app + email) about a new listing and keeps the original
 * behaviour of emailing NGO_EMAIL when AI-verified food is still fresh.
 * Returns how many NGOs were alerted.
 */
export async function announceListing(listing, donor) {
  const ngos = await findNearbyNgos(listing.location);
  const link = `/food/${listing._id}`;
  const qty = `${listing.quantity.available} ${listing.quantity.unit}`;
  const donorName = donor.organization || donor.name;
  const priceLine = listing.pricing.offer === 0 ? 'Free donation' : `${money(listing.pricing.offer)} per unit (was ${money(listing.pricing.original)})`;
  const pickupBy = listing.pickup.end.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  await notify(
    ngos.map((n) => n._id),
    {
      type: 'food_nearby',
      title: `${qty} of ${listing.title} available nearby`,
      body: `${donorName} · ${priceLine} · pick up by ${pickupBy}`,
      link,
    },
  );

  const emailTargets = ngos.filter((n) => n.emailNotifications !== false).map((n) => n.email);
  const lines = [
    `<b>${escapeHtml(donorName)}</b> just listed surplus food near you.`,
    `<b>Food:</b> ${escapeHtml(listing.title)} (${escapeHtml(qty)})`,
    `<b>Price:</b> ${escapeHtml(priceLine)}`,
    `<b>Pickup:</b> ${escapeHtml(listing.pickup.address || 'See map')} — before ${escapeHtml(pickupBy)}`,
  ];
  const cta = { label: 'Reserve this food', href: `${env.publicUrl}${link}` };
  if (emailTargets.length) {
    // BCC-style: one email per NGO so addresses stay private.
    Promise.allSettled(
      emailTargets.map((to) =>
        sendMail({ to, subject: `Surplus food nearby: ${listing.title}`, text: lines.join('\n'), heading: 'Surplus food available near you', lines, cta }),
      ),
    );
  }

  const fresh = Date.now() - listing.preparedAt.getTime() < FRESH_HOURS * 3600 * 1000;
  if (env.ngoEmail && listing.ai?.verified && fresh) {
    sendMail({
      to: env.ngoEmail,
      subject: `Fresh, consumable food available: ${listing.title}`,
      text: lines.join('\n'),
      heading: 'Fresh, consumable food available',
      lines,
      cta,
    });
  }

  return ngos.length;
}

/**
 * Sends a report that passed the photo check to the city authority (AUTHORITY_EMAIL)
 * and records it on the report. Returns whether the email went out.
 */
export async function forwardReportToAuthority(report, reporterName, { byStaff = false } = {}) {
  if (!env.authorityEmail || report.authorityNotified) return false;
  const [lng, lat] = report.location.coordinates;
  const lines = [
    byStaff
      ? 'A new illegal dumping report was reviewed and accepted by EcoAI staff.'
      : 'A new illegal dumping report passed EcoAI’s automatic photo check.',
    `<b>Report:</b> #${report._id}`,
    `<b>Category:</b> ${escapeHtml(report.category)} · <b>Severity:</b> ${escapeHtml(report.severity)}`,
    report.ai?.analyzed ? `<b>AI check:</b> ${Math.round((report.ai.confidence || 0) * 100)}% confident — ${escapeHtml(report.ai.reason || report.ai.summary || '')}` : '',
    `<b>Location:</b> ${escapeHtml(report.address || '')} (${lat}, ${lng}) · <a href="https://www.google.com/maps?q=${lat},${lng}">map</a>`,
    `<b>Description:</b> ${escapeHtml(report.description || '—')}`,
    `<b>Reported by:</b> ${escapeHtml(reporterName || 'a citizen')}`,
  ].filter(Boolean);
  const sent = await sendMail({
    to: env.authorityEmail,
    subject: `Illegal dumping report #${String(report._id).slice(-6)} (${report.severity})`,
    text: lines.join('\n').replace(/<[^>]+>/g, ''),
    heading: 'Illegal dumping reported',
    lines,
    cta: { label: 'Open in staff portal', href: `${env.publicUrl}/staff/report/${report._id}` },
  });
  if (sent) {
    report.authorityNotified = true;
    report.authorityNotifiedAt = new Date();
    await report.save();
  }
  return sent;
}
