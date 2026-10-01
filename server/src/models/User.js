import mongoose, { Schema } from 'mongoose';
import { ACCOUNT_STATUSES, ROLES } from './constants.js';
import { pointSchema } from './point.js';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    authProviders: { type: [String], enum: ['password', 'google'], default: [] },
    avatar: { type: String },
    role: { type: String, enum: ROLES, default: 'citizen', index: true },
    // Restaurants and NGOs start 'pending' until an admin approves them.
    status: { type: String, enum: ACCOUNT_STATUSES, default: 'active', index: true },
    statusNote: { type: String, trim: true, maxlength: 500 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    phone: { type: String, trim: true, maxlength: 20 },
    organization: { type: String, trim: true, maxlength: 120 },
    address: { type: String, trim: true, maxlength: 300 },
    location: { type: pointSchema, default: undefined },
    notifyRadiusKm: { type: Number, default: 5, min: 1, max: 50 },
    emailNotifications: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ location: '2dsphere' });

export const User = mongoose.model('User', userSchema);
