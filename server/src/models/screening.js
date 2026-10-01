import { Schema } from 'mongoose';
import { SCREENING_DECISIONS } from './constants.js';

/** Final photo-check decision: set by the AI, and possibly overridden by staff. */
export const screeningSchema = new Schema(
  {
    decision: { type: String, enum: SCREENING_DECISIONS, default: 'review' },
    reason: { type: String, trim: true, maxlength: 300 },
    source: { type: String, enum: ['ai', 'staff'], default: 'ai' },
    note: { type: String, trim: true, maxlength: 500 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { _id: false },
);
