import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireSession, signToken } from '../middleware/auth.js';
import { limiter } from '../middleware/rateLimit.js';
import { APPROVAL_ROLES, SIGNUP_ROLES, User } from '../models/index.js';
import { escapeHtml } from '../services/mailer.js';
import { notifyAdmins } from '../services/notify.js';
import { toPoint } from '../utils/geo.js';
import { HttpError, badRequest, conflict, notFound, unauthorized } from '../utils/http.js';
import { userDTO } from '../utils/serialize.js';
import { parse, zx } from '../utils/validate.js';

const router = Router();
const googleClient = new OAuth2Client();

const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

const emailField = z
  .string({ error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Please enter a valid email address.' }));

const passwordField = z
  .string({ error: 'Password is required.' })
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.');

const profileFields = {
  phone: zx.optStr(20, 'Phone'),
  organization: zx.optStr(120, 'Organization name'),
  address: zx.optStr(300, 'Address'),
  lat: zx.optNum('Latitude', { min: -90, max: 90 }),
  lng: zx.optNum('Longitude', { min: -180, max: 180 }),
};

const requireOrgForRole = (data, ctx) => {
  if (data.role && data.role !== 'citizen' && !data.organization) {
    ctx.addIssue({
      code: 'custom',
      path: ['organization'],
      message: data.role === 'ngo' ? 'Please enter your NGO name.' : 'Please enter your restaurant / business name.',
    });
  }
};

const roleField = z.enum(SIGNUP_ROLES, { error: 'Please choose an account type.' }).default('citizen');

const registerSchema = z
  .object({ name: zx.str(80, 'Name'), email: emailField, password: passwordField, role: roleField, ...profileFields })
  .superRefine(requireOrgForRole);

const loginSchema = z.object({
  email: emailField,
  password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.'),
});

const googleSchema = z
  .object({
    // Access token from EcoAI's own Google button, or an ID token (credential) from Google's widget.
    accessToken: z.string().min(20).optional(),
    credential: z.string().min(20).optional(),
    intent: z.enum(['login', 'signup']).default('login'),
    role: roleField,
    ...profileFields,
  })
  .superRefine((data, ctx) => {
    if (!data.accessToken && !data.credential) {
      ctx.addIssue({ code: 'custom', path: ['accessToken'], message: 'Missing Google sign-in token.' });
    }
    if (data.intent === 'signup') requireOrgForRole(data, ctx);
  });

const profileFromInput = (data) => ({
  phone: data.phone,
  organization: data.role === 'citizen' ? undefined : data.organization,
  address: data.address,
  location: data.lat != null && data.lng != null ? toPoint(data.lat, data.lng) : undefined,
});

/** Restaurants and NGOs need an admin's approval; everyone else is active immediately. */
const initialStatus = (role) => (APPROVAL_ROLES.includes(role) ? 'pending' : 'active');

async function announceApplication(user) {
  if (user.status !== 'pending') return;
  const kind = user.role === 'ngo' ? 'NGO' : 'Restaurant';
  const org = user.organization || user.name;
  await notifyAdmins(
    {
      type: 'account_pending',
      title: `New ${kind} awaiting approval: ${org}`,
      body: `${user.name} · ${user.email}${user.phone ? ` · ${user.phone}` : ''}`,
      link: '/admin?tab=approvals',
    },
    {
      email: {
        subject: `EcoAI: new ${kind.toLowerCase()} account to review — ${org}`,
        text: `${org} (${user.email}) signed up as a ${kind} and is waiting for approval.`,
        heading: `New ${kind} awaiting approval`,
        lines: [
          `<b>${escapeHtml(org)}</b> signed up as a ${kind.toLowerCase()}.`,
          `<b>Contact:</b> ${escapeHtml(user.name)} · ${escapeHtml(user.email)}${user.phone ? ` · ${escapeHtml(user.phone)}` : ''}`,
          user.address ? `<b>Address:</b> ${escapeHtml(user.address)}` : '',
        ].filter(Boolean),
        cta: { label: 'Review in admin panel', href: `${env.publicUrl}/admin?tab=approvals` },
      },
    },
  );
}

/** "Already registered" error that says how the existing account signs in. */
function alreadyRegistered(user, email) {
  // No password on the account: it signs in with Google (also staff an admin created without one).
  const googleOnly = !(user.authProviders || []).includes('password');
  return conflict(
    googleOnly
      ? `An account for ${email} already exists — it was created with Google. Log in with “Continue with Google”.`
      : `An account for ${email} already exists. Please log in instead.`,
    'ALREADY_REGISTERED',
    { email, provider: googleOnly ? 'google' : 'password' },
  );
}

function sendAuth(res, user, status = 200, extra = {}) {
  res.status(status).json({ token: signToken(user), user: userDTO(user, { self: true }), ...extra });
}

const googleFailed = () =>
  unauthorized('Google sign-in failed or expired. Please try again.', 'GOOGLE_TOKEN_INVALID');

/** Verifies an ID token issued by Google's sign-in widget. */
async function profileFromIdToken(credential) {
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    return ticket.getPayload();
  } catch {
    throw googleFailed();
  }
}

/**
 * Verifies an OAuth access token from EcoAI's own Google button: it must have been
 * issued to our client id (so a token minted for another app can't be replayed),
 * then the profile is read from Google's userinfo endpoint.
 */
async function profileFromAccessToken(accessToken) {
  try {
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, {
      signal: AbortSignal.timeout(10000),
    });
    const info = await infoRes.json();
    if (!infoRes.ok || (info.aud !== env.googleClientId && info.azp !== env.googleClientId)) throw googleFailed();

    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const profile = await userRes.json();
    if (!userRes.ok || profile.sub !== info.sub) throw googleFailed();
    return { ...profile, email_verified: profile.email_verified === true || info.email_verified === 'true' };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw googleFailed();
  }
}

async function verifyGoogle({ accessToken, credential }) {
  if (!env.googleClientId) {
    throw new HttpError(503, 'Google sign-in is not configured on the server yet.', 'GOOGLE_NOT_CONFIGURED');
  }
  const payload = accessToken ? await profileFromAccessToken(accessToken) : await profileFromIdToken(credential);
  if (!payload?.email || !payload.sub || payload.email_verified === false) {
    throw unauthorized('Your Google account email is not verified.', 'GOOGLE_EMAIL_UNVERIFIED');
  }
  return payload;
}

// POST /api/auth/register — email + password sign up
router.post('/register', authLimiter, async (req, res) => {
  const data = parse(registerSchema, req.body);
  const existing = await User.findOne({ email: data.email }).select('authProviders').lean();
  if (existing) throw alreadyRegistered(existing, data.email);
  const user = await User.create({
    name: data.name,
    email: data.email,
    role: data.role,
    passwordHash: await bcrypt.hash(data.password, 12),
    authProviders: ['password'],
    status: initialStatus(data.role),
    lastLoginAt: new Date(),
    ...profileFromInput(data),
  });
  await announceApplication(user);
  sendAuth(res, user, 201, { isNew: true });
});

// POST /api/auth/login — email + password
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    throw notFound(`${email} isn’t registered on EcoAI yet. Please sign up first.`, 'USER_NOT_FOUND', { email });
  }
  if (!user.passwordHash) {
    throw badRequest('This account was created with Google. Use “Continue with Google” to log in.', 'USE_GOOGLE');
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw unauthorized('Incorrect password. Please try again.', 'INVALID_CREDENTIALS');
  }
  user.lastLoginAt = new Date();
  await user.save();
  sendAuth(res, user);
});

// POST /api/auth/google — Google sign in / sign up with an ID token from Google Identity Services
router.post('/google', authLimiter, async (req, res) => {
  const data = parse(googleSchema, req.body);
  const google = await verifyGoogle(data);
  const email = google.email.toLowerCase();

  let user = await User.findOne({ $or: [{ googleId: google.sub }, { email }] });
  if (user) {
    // "Sign up with Google" for an account that already exists: say so instead of
    // silently signing in, so people know they already have an account.
    if (data.intent === 'signup') throw alreadyRegistered(user, user.email);
    if (!user.googleId) user.googleId = google.sub;
    if (!user.authProviders.includes('google')) user.authProviders.push('google');
    if (!user.avatar && google.picture) user.avatar = google.picture;
    user.lastLoginAt = new Date();
    await user.save();
    return sendAuth(res, user, 200, { isNew: false });
  }

  if (data.intent === 'login') {
    throw notFound(`${email} isn’t registered on EcoAI yet. Choose an account type to sign up with Google.`, 'USER_NOT_FOUND', {
      email,
      name: google.name || '',
      picture: google.picture || '',
    });
  }

  user = await User.create({
    name: (google.name || email.split('@')[0]).slice(0, 80),
    email,
    googleId: google.sub,
    avatar: google.picture,
    role: data.role,
    authProviders: ['google'],
    status: initialStatus(data.role),
    lastLoginAt: new Date(),
    ...profileFromInput(data),
  });
  await announceApplication(user);
  sendAuth(res, user, 201, { isNew: true });
});

// GET /api/auth/me — also works for pending accounts so they can see their status
router.get('/me', requireSession, (req, res) => {
  res.json({ user: userDTO(req.user, { self: true }) });
});

const updateSchema = z.object({
  name: zx.str(80, 'Name').optional(),
  ...profileFields,
  notifyRadiusKm: zx.optNum('Alert radius', { min: 1, max: 50 }),
  emailNotifications: z.boolean().optional(),
});

// PATCH /api/auth/me — update profile / organization / location / alert preferences
router.patch('/me', requireSession, async (req, res) => {
  const data = parse(updateSchema, req.body);
  const user = req.user;
  if (data.name !== undefined) user.name = data.name;
  if ('phone' in req.body) user.phone = data.phone || '';
  if ('address' in req.body) user.address = data.address || '';
  if ('organization' in req.body && user.role !== 'citizen') user.organization = data.organization || '';
  if (data.notifyRadiusKm != null) user.notifyRadiusKm = data.notifyRadiusKm;
  if (data.emailNotifications != null) user.emailNotifications = data.emailNotifications;
  if (data.lat != null && data.lng != null) user.location = toPoint(data.lat, data.lng);
  await user.save();
  res.json({ user: userDTO(user, { self: true }) });
});

const passwordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: passwordField,
});

// POST /api/auth/me/password — change password, or add one to a Google-only account
router.post('/me/password', requireSession, authLimiter, async (req, res) => {
  const { currentPassword, newPassword } = parse(passwordSchema, req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (user.passwordHash && !(await bcrypt.compare(currentPassword || '', user.passwordHash))) {
    throw unauthorized('Your current password is incorrect.', 'INVALID_CREDENTIALS');
  }
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  if (!user.authProviders.includes('password')) user.authProviders.push('password');
  await user.save();
  res.json({ user: userDTO(user, { self: true }) });
});

export default router;
