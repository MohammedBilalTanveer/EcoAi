import mongoose, { Schema } from 'mongoose';
import { REPORT_CATEGORIES, REPORT_SEVERITIES, REPORT_STATUSES } from './constants.js';
import { pointSchema } from './point.js';
import { screeningSchema } from './screening.js';

const aiSchema = new Schema(
  {
    analyzed: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    confidence: { type: Number, default: 0 },
    labels: { type: [String], default: [] },
    provider: { type: String },
    summary: { type: String },
    reason: { type: String },
  },
  { _id: false },
);

const historySchema = new Schema(
  {
    status: { type: String, enum: REPORT_STATUSES, required: true },
    note: { type: String, trim: true, maxlength: 500 },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const reportSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    description: { type: String, trim: true, maxlength: 1000 },
    category: { type: String, enum: REPORT_CATEGORIES, default: 'mixed' },
    severity: { type: String, enum: REPORT_SEVERITIES, default: 'medium' },
    location: { type: pointSchema, required: true },
    address: { type: String, trim: true, maxlength: 300 },
    image: { type: String, required: true },
    status: { type: String, enum: REPORT_STATUSES, default: 'pending', index: true },
    wasteType: { type: String, default: 'general' },
    ai: { type: aiSchema, default: () => ({}) },
    screening: { type: screeningSchema, default: () => ({}) },
    authorityNotified: { type: Boolean, default: false },
    authorityNotifiedAt: { type: Date },
    history: { type: [historySchema], default: [] },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

reportSchema.index({ location: '2dsphere' });
reportSchema.index({ createdAt: -1 });
reportSchema.index({ 'screening.decision': 1, createdAt: -1 });

export const Report = mongoose.model('Report', reportSchema);
