import { Router } from 'express';
import { limiter as rateLimiter } from '../middleware/rateLimit.js';
import { z } from 'zod';
import { HttpError } from '../utils/http.js';
import { parse, zx } from '../utils/validate.js';

/**
 * Small proxy over OpenStreetMap Nominatim for address search / reverse lookup.
 * Keeps us within Nominatim's usage policy: identifying User-Agent, max ~1 req/s,
 * and results cached in memory.
 */
const router = Router();
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'EcoAI/2.0 (sustainability platform; contact via site)';

router.use(rateLimiter({ windowMs: 60 * 1000, limit: 40 }));

const cache = new Map();
const MAX_CACHE = 1000;
let queue = Promise.resolve();
let lastCall = 0;

function throttled(url) {
  const run = async () => {
    const wait = Math.max(0, lastCall + 1100 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new HttpError(502, 'Address lookup is unavailable right now.', 'GEO_UNAVAILABLE');
    return res.json();
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

async function cached(key, url) {
  if (cache.has(key)) return cache.get(key);
  const value = await throttled(url);
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

const shortAddress = (r) => {
  const a = r.address || {};
  const parts = [
    a.road || a.pedestrian || a.neighbourhood,
    a.suburb || a.quarter || a.city_district,
    a.city || a.town || a.village || a.county,
  ].filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : r.display_name;
};

// GET /api/geo/search?q=
router.get('/search', async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().min(3, 'Type at least 3 characters.').max(120) }), req.query);
  const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
  const results = await cached(`s:${q.toLowerCase()}`, url);
  res.json({
    results: results.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      label: shortAddress(r),
      fullLabel: r.display_name,
    })),
  });
});

// GET /api/geo/reverse?lat&lng
router.get('/reverse', async (req, res) => {
  const { lat, lng } = parse(z.object({ lat: zx.lat(), lng: zx.lng() }), req.query);
  const key = `r:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`;
  const r = await cached(key, url);
  res.json({ label: r?.error ? '' : shortAddress(r), fullLabel: r?.display_name || '' });
});

export default router;
