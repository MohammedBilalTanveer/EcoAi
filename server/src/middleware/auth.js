import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { STAFF_ROLES, User } from '../models/index.js';
import { forbidden, unauthorized } from '../utils/http.js';

export const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

const bearer = (req) => {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
};

async function resolveUser(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  return User.findById(payload.sub);
}

const isActive = (user) => !user.status || user.status === 'active';

const STATUS_MESSAGE = {
  pending: 'Your account is waiting for admin approval.',
  rejected: 'Your account application was not approved.',
  suspended: 'Your account has been suspended. Please contact support.',
};

/**
 * Signed-in user in any account state. Only for routes a pending/rejected user
 * still needs: reading their own profile/status and editing their details.
 */
export async function requireSession(req, _res, next) {
  const token = bearer(req);
  if (!token) throw unauthorized();
  let user;
  try {
    user = await resolveUser(token);
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.', 'TOKEN_INVALID');
  }
  if (!user) throw unauthorized('Your account no longer exists.', 'TOKEN_INVALID');
  req.user = user;
  next();
}

/** Signed-in user whose account is active (approved). */
export async function requireAuth(req, res, next) {
  await requireSession(req, res, () => {});
  if (!isActive(req.user)) {
    throw forbidden(STATUS_MESSAGE[req.user.status] || 'Your account is not active.', `ACCOUNT_${req.user.status.toUpperCase()}`);
  }
  next();
}

/** Attaches req.user for active accounts when a valid token is present, but never rejects. */
export async function optionalAuth(req, _res, next) {
  const token = bearer(req);
  if (token) {
    const user = await resolveUser(token).catch(() => null);
    req.user = user && isActive(user) ? user : null;
  }
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) {
      throw forbidden('Your account type cannot do this.', 'ROLE_NOT_ALLOWED');
    }
    next();
  };

export const requireStaff = requireRole(...STAFF_ROLES);
export const requireAdmin = requireRole('admin');
export const isStaffUser = (user) => Boolean(user && STAFF_ROLES.includes(user.role));
