/**
 * Turns an AI photo check into a decision that people can see and staff can override:
 *  - passed:   the photo shows what it should. Reports go to the city authority;
 *              food listings are published and nearby NGOs are alerted.
 *  - rejected: the photo shows something else. Reports are closed as rejected;
 *              food listings are held back until staff approve them.
 *  - review:   the AI was unsure or unavailable. Staff decide. Food is still
 *              published (it's perishable), but staff can remove it.
 */
export { SCREENING_DECISIONS } from '../models/constants.js';

// Minimum AI certainty for an automatic "passed".
export const REPORT_PASS_CONFIDENCE = 0.6;
export const FOOD_PASS_CONFIDENCE = 0.5;

const pct = (n) => `${Math.round((Number(n) || 0) * 100)}%`;

export function reportScreening(ai) {
  if (!ai?.analyzed) {
    return { decision: 'review', reason: 'The automatic photo check was unavailable, so staff will review this report.' };
  }
  if (!ai.verified) {
    return { decision: 'rejected', reason: ai.reason || 'The photo does not appear to show garbage or dumped waste.' };
  }
  if (ai.confidence < REPORT_PASS_CONFIDENCE) {
    return { decision: 'review', reason: `The AI was unsure (${pct(ai.confidence)} confident), so staff will review it.` };
  }
  return { decision: 'passed', reason: ai.reason || `Garbage detected in the photo (${pct(ai.confidence)} confident).` };
}

export function foodScreening(ai) {
  if (!ai?.analyzed) {
    return { decision: 'review', reason: 'The automatic photo check was unavailable; staff may review this listing.' };
  }
  if (ai.isFood === false || ai.verified === false) {
    return { decision: 'rejected', reason: ai.reason || 'The photo does not appear to show food.' };
  }
  if (ai.confidence < FOOD_PASS_CONFIDENCE) {
    return { decision: 'review', reason: `The AI was unsure the photo shows food (${pct(ai.confidence)} confident).` };
  }
  return { decision: 'passed', reason: ai.reason || `Food detected in the photo (${pct(ai.confidence)} confident).` };
}

/**
 * Gives reports and listings created before photo-check decisions existed a decision
 * derived from their stored AI result. Statuses are left untouched.
 */
export async function backfillScreening() {
  const { FoodListing, Report } = await import('../models/index.js');
  const reports = await Report.find({ 'screening.decision': { $exists: false } }).select('ai').lean();
  const listings = await FoodListing.find({ 'screening.decision': { $exists: false } })
    .select('ai flagged removed reviewedBy updatedAt')
    .lean();

  const reportOps = reports.map((r) => ({
    updateOne: { filter: { _id: r._id }, update: { $set: { screening: { ...reportScreening(r.ai), source: 'ai' } } } },
  }));
  const listingOps = listings.map((l) => {
    let screening = { ...foodScreening(l.ai), source: 'ai' };
    if (l.reviewedBy) {
      // A moderator already approved (unflagged) or removed it.
      screening = l.removed
        ? { decision: 'rejected', reason: 'Removed by staff after reviewing the photo.', source: 'staff', reviewedBy: l.reviewedBy, reviewedAt: l.updatedAt }
        : { decision: 'passed', reason: 'Approved by staff after reviewing the photo.', source: 'staff', reviewedBy: l.reviewedBy, reviewedAt: l.updatedAt };
    }
    return { updateOne: { filter: { _id: l._id }, update: { $set: { screening } } } };
  });

  if (reportOps.length) await Report.bulkWrite(reportOps);
  if (listingOps.length) await FoodListing.bulkWrite(listingOps);
  if (reportOps.length + listingOps.length) {
    console.log(`[db] added photo-check decisions to ${reportOps.length} report(s) and ${listingOps.length} listing(s)`);
  }
}
