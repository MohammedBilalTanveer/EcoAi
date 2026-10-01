import mongoose, { Schema } from 'mongoose';
import { CLAIM_STATUSES } from './constants.js';

/** A reservation of (part of) a food listing by an NGO or citizen. */
const claimSchema = new Schema(
  {
    listing: { type: Schema.Types.ObjectId, ref: 'FoodListing', required: true, index: true },
    donor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    claimer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    originalUnitPrice: { type: Number, required: true, min: 0 },
    pickupCode: { type: String, required: true },
    status: { type: String, enum: CLAIM_STATUSES, default: 'reserved', index: true },
    note: { type: String, trim: true, maxlength: 300 },
    expiresAt: { type: Date, required: true },
    pickedUpAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true },
);

// One active reservation per person per listing.
claimSchema.index(
  { listing: 1, claimer: 1 },
  { unique: true, partialFilterExpression: { status: 'reserved' } },
);

claimSchema.virtual('totalPrice').get(function totalPrice() {
  return this.quantity * this.unitPrice;
});

export const Claim = mongoose.model('Claim', claimSchema);
