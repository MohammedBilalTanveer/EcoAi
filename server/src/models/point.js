import { Schema } from 'mongoose';

/** GeoJSON point; coordinates are [lng, lat]. */
export const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (c) =>
          c.length === 2 && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90,
        message: 'Invalid coordinates',
      },
    },
  },
  { _id: false },
);
