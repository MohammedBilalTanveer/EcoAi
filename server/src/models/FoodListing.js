import mongoose, { Schema } from 'mongoose';
import {
  DIET_TYPES,
  FOOD_CATEGORIES,
  FOOD_UNITS,
  LISTING_STATUSES,
  STORAGE_TYPES,
} from './constants.js';
import { pointSchema } from './point.js';
import { screeningSchema } from './screening.js';

const foodListingSchema = new Schema(
  {
    donor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000 },
    images: { type: [String], default: [] },
    category: { type: String, enum: FOOD_CATEGORIES, default: 'cooked_meal' },
    dietType: { type: String, enum: DIET_TYPES, default: 'veg' },
    allergens: { type: [String], default: [] },

    quantity: {
      total: { type: Number, required: true, min: 1 },
      available: { type: Number, required: true, min: 0 },
      unit: { type: String, enum: FOOD_UNITS, default: 'servings' },
    },
    // Prices are per unit, in INR. offer = 0 means a free donation.
    pricing: {
      original: { type: Number, required: true, min: 0 },
      offer: { type: Number, required: true, min: 0 },
    },
    // 'ngo' = free donation reserved for NGOs; 'public' = discounted, anyone can reserve.
    audience: { type: String, enum: ['ngo', 'public'], default: 'ngo' },

    storage: { type: String, enum: STORAGE_TYPES, default: 'room_temp' },
    preparedAt: { type: Date, required: true },
    safeUntil: { type: Date, required: true },

    pickup: {
      start: { type: Date, required: true },
      end: { type: Date, required: true, index: true },
      address: { type: String, trim: true, maxlength: 300 },
      instructions: { type: String, trim: true, maxlength: 300 },
    },
    location: { type: pointSchema, required: true },

    status: { type: String, enum: LISTING_STATUSES, default: 'available', index: true },
    ai: {
      analyzed: { type: Boolean, default: false },
      verified: { type: Boolean, default: false },
      confidence: { type: Number, default: 0 },
      labels: { type: [String], default: [] },
      provider: { type: String },
      reason: { type: String },
    },
    screening: { type: screeningSchema, default: () => ({}) },
    // Set while a rejected listing waits for staff: hidden from browsing and NGO alerts.
    flagged: { type: Boolean, default: false },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    removed: { type: Boolean, default: false },
    notifiedNgos: { type: Number, default: 0 },
    cancelReason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

foodListingSchema.index({ location: '2dsphere' });
foodListingSchema.index({ status: 1, 'pickup.end': 1 });

export const FoodListing = mongoose.model('FoodListing', foodListingSchema);
