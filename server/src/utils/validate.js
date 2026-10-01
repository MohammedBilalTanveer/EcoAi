import mongoose from 'mongoose';
import { z } from 'zod';
import { badRequest, notFound } from './http.js';

/** Parses `data` with a zod schema and throws a friendly 400 on failure. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
  const first = issues[0];
  throw badRequest(first.message, 'VALIDATION_ERROR', issues);
}

export function assertObjectId(id, what = 'Item') {
  if (!mongoose.isValidObjectId(id)) throw notFound(`${what} not found.`);
  return id;
}

const blankToUndefined = (value) =>
  value === '' || value === null || value === 'null' || value === 'undefined' ? undefined : value;

/** Helpers that tolerate multipart/form-data where every field is a string. */
export const zx = {
  str: (max, label) =>
    z
      .string({ error: `${label} is required.` })
      .trim()
      .min(1, `${label} is required.`)
      .max(max, `${label} must be at most ${max} characters.`),
  optStr: (max, label = 'Field') =>
    z.preprocess(
      blankToUndefined,
      z.string().trim().max(max, `${label} must be at most ${max} characters.`).optional(),
    ),
  num: (label, { min = -Infinity, max = Infinity } = {}) =>
    z.preprocess(
      (v) => (blankToUndefined(v) === undefined ? undefined : Number(v)),
      z
        .number({ error: `${label} must be a number.` })
        .finite(`${label} must be a number.`)
        .min(min, `${label} must be at least ${min}.`)
        .max(max, `${label} must be at most ${max}.`),
    ),
  optNum: (label, opts) => z.preprocess(blankToUndefined, zx.num(label, opts).optional()),
  bool: (fallback = false) =>
    z.preprocess((v) => {
      const b = blankToUndefined(v);
      if (b === undefined) return fallback;
      if (typeof b === 'boolean') return b;
      return ['1', 'true', 'yes', 'on'].includes(String(b).toLowerCase());
    }, z.boolean()),
  date: (label) =>
    z.preprocess(
      (v) => (blankToUndefined(v) === undefined ? undefined : new Date(v)),
      z.date({ error: `${label} is required.` }).refine((d) => !Number.isNaN(d.getTime()), `${label} is not a valid date.`),
    ),
  optDate: (label) =>
    z.preprocess(
      (v) => (blankToUndefined(v) === undefined ? undefined : new Date(v)),
      z
        .date()
        .refine((d) => !Number.isNaN(d.getTime()), `${label} is not a valid date.`)
        .optional(),
    ),
  lat: () => zx.num('Latitude', { min: -90, max: 90 }),
  lng: () => zx.num('Longitude', { min: -180, max: 180 }),
  /** Accepts a JSON array string, a comma separated string or an array. */
  list: (max = 20) =>
    z.preprocess((v) => {
      const b = blankToUndefined(v);
      if (b === undefined) return [];
      if (Array.isArray(b)) return b;
      const s = String(b).trim();
      if (s.startsWith('[')) {
        try {
          return JSON.parse(s);
        } catch {
          return [];
        }
      }
      return s.split(',');
    }, z.array(z.string().trim().min(1).max(40)).max(max)),
};

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
