import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * The visitor's IP. Behind a CDN (Render routes everything through Cloudflare) the
 * CDN's own header is the reliable source; otherwise Express's req.ip, which honours
 * TRUST_PROXY. Without this, every user could share one rate-limit bucket.
 */
export function clientIp(req) {
  if (env.clientIpHeader) {
    const value = req.get(env.clientIpHeader);
    if (value) return value.split(',')[0].trim();
  }
  return req.ip;
}

const byIp = (req) => ipKeyGenerator(clientIp(req) || 'unknown');
const byUser = (req) => (req.user ? `user:${req.user._id}` : byIp(req));

/**
 * Rate limiter keyed by visitor IP, or by signed-in user with `perUser`
 * (place it after requireAuth).
 */
export function limiter({ windowMs, limit, message = 'Too many requests. Please slow down and try again shortly.', perUser = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: perUser ? byUser : byIp,
    message: { error: message, code: 'RATE_LIMITED' },
  });
}
