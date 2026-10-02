import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(here, '..', '..');
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');
export const FRONTEND_DIR = path.join(PROJECT_ROOT, 'frontend');

// Variables already set in the environment (e.g. on Render) win over server/.env.
dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

const str = (key, fallback = '') => {
  const value = process.env[key];
  return value == null || value.trim() === '' ? fallback : value.trim();
};

const bool = (key, fallback) => {
  const value = str(key);
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const list = (key) =>
  str(key)
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

const nodeEnv = str('NODE_ENV', 'production');
const isDev = nodeEnv !== 'production';
const port = Number(str('PORT', '5000')) || 5000;
// Render sets RENDER=true and RENDER_EXTERNAL_URL for every web service.
const onRender = Boolean(process.env.RENDER);

// A placeholder value like "key" means the key was never configured.
const apiKey = (key) => {
  const value = str(key);
  return value && value.toLowerCase() !== 'key' ? value : '';
};

/** cloudinary://<api_key>:<api_secret>@<cloud_name> */
function parseCloudinaryUrl(url) {
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url);
  return m ? { apiKey: m[1], apiSecret: m[2], cloudName: m[3] } : null;
}

// --- Public URLs -----------------------------------------------------------------
// PUBLIC_URL is where people open the website (used in email links). SERVER_URL is
// where this API is reachable; it only matters when the website lives on another
// domain (e.g. frontend on Vercel, API on Render), so uploaded photos get full URLs.
const publicUrl = str('PUBLIC_URL', `http://localhost:${port}`).replace(/\/$/, '');
const serverUrl = str('SERVER_URL', str('RENDER_EXTERNAL_URL')).replace(/\/$/, '');

// --- Email ---------------------------------------------------------------------------
// Render's free plan blocks SMTP, so HTTPS email APIs (Brevo, Resend) are supported too.
const smtpUser = str('EMAIL_HOST_USER');
const smtpPass = str('EMAIL_HOST_PASSWORD');
const brevoKey = apiKey('BREVO_API_KEY');
const resendKey = apiKey('RESEND_API_KEY');
const mailProvider = brevoKey ? 'brevo' : resendKey ? 'resend' : smtpUser && smtpPass ? 'smtp' : null;

// --- Image storage ---------------------------------------------------------------
const cloudinary = parseCloudinaryUrl(str('CLOUDINARY_URL'));
const storageDriver = (() => {
  const wanted = str('STORAGE').toLowerCase();
  if (wanted === 'cloudinary' && !cloudinary) {
    throw new Error('STORAGE=cloudinary needs CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud_name>).');
  }
  if (['local', 'mongo', 'cloudinary'].includes(wanted)) return wanted;
  // Default: Cloudinary when configured, otherwise photos live in MongoDB (GridFS),
  // which survives redeploys on hosts with a temporary disk (Render, Railway, Heroku).
  return cloudinary ? 'cloudinary' : 'mongo';
})();

const trustProxyRaw = str('TRUST_PROXY', '1');

export const env = {
  nodeEnv,
  isDev,
  port,
  onRender,
  publicUrl,
  serverUrl,
  /** Prefix for relative /uploads/... paths in API responses ('' = same origin). */
  mediaBaseUrl: serverUrl && originOf(serverUrl) !== originOf(publicUrl) ? serverUrl : '',

  mongoUri: str('MONGODB_URI'),
  mongoDbName: str('MONGODB_DB', 'ecoai'),

  jwtSecret: str('JWT_SECRET', isDev ? 'ecoai-dev-only-secret-change-me' : ''),
  jwtExpiresIn: str('JWT_EXPIRES_IN', '7d'),

  googleClientId: str('GOOGLE_CLIENT_ID'),

  // First admin, created on startup if that email has no account yet (handy on hosts
  // without a shell). Remove ADMIN_PASSWORD from the host once you've signed in.
  bootstrapAdmin: {
    email: str('ADMIN_EMAIL').toLowerCase(),
    password: str('ADMIN_PASSWORD'),
    name: str('ADMIN_NAME', 'EcoAI Admin'),
  },

  // OpenAI powers GreenBot and the photo checks when OPENAI_API_KEY is set.
  // OPENAI_BASE_URL also lets you use an OpenAI-compatible service.
  openai: {
    apiKey: apiKey('OPENAI_API_KEY'),
    model: str('OPENAI_MODEL', 'gpt-6-luna'),
    reasoningEffort: str('OPENAI_REASONING_EFFORT', 'low'),
    baseUrl: str('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, ''),
  },

  geminiApiKey: apiKey('GEMINI_API_KEY'),
  geminiModel: str('GEMINI_MODEL', 'gemini-flash-latest'),
  visionApiKey: apiKey('GOOGLE_CLOUD_VISION_API_KEY'),

  mail: {
    provider: mailProvider,
    enabled: Boolean(mailProvider) && bool('MAIL_ENABLED', true),
    host: str('EMAIL_HOST', 'smtp.gmail.com'),
    port: Number(str('EMAIL_PORT', '587')) || 587,
    user: smtpUser,
    pass: smtpPass,
    brevoKey,
    resendKey,
    from: str('MAIL_FROM', str('DEFAULT_FROM_EMAIL', smtpUser)),
    fromName: str('MAIL_FROM_NAME', 'EcoAI'),
  },
  authorityEmail: str('AUTHORITY_EMAIL'),
  ngoEmail: str('NGO_EMAIL'),

  // Browsers may call the API from these origins. The website's own origin (PUBLIC_URL)
  // is always allowed; entries may use a wildcard, e.g. https://*.vercel.app
  corsOrigins: [...new Set([...list('CORS_ORIGINS'), originOf(publicUrl)].filter(Boolean))],

  // Number of proxies in front of the app (Express "trust proxy").
  trustProxy: /^\d+$/.test(trustProxyRaw) ? Number(trustProxyRaw) : trustProxyRaw === 'true' ? true : trustProxyRaw,
  // Header holding the visitor's real IP, set by the CDN in front of the app. Render
  // routes all traffic through Cloudflare, which sets CF-Connecting-IP.
  clientIpHeader: str('CLIENT_IP_HEADER', onRender ? 'cf-connecting-ip' : '').toLowerCase(),

  // Serve frontend/dist from this server. Turn off when the frontend is hosted elsewhere.
  serveFrontend: bool('SERVE_FRONTEND', fs.existsSync(path.join(FRONTEND_DIR, 'dist', 'index.html'))),

  storage: {
    driver: storageDriver,
    cloudinary,
    cloudinaryFolder: str('CLOUDINARY_FOLDER', 'ecoai'),
  },
  uploadDir: path.join(SERVER_ROOT, 'uploads'),
};

// --- Production safety checks ----------------------------------------------------
if (!env.jwtSecret) {
  throw new Error('JWT_SECRET must be set in production. Add it to server/.env or your host’s environment.');
}
if (!isDev && env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET is too short for production — use at least 32 random characters.');
}

/** Non-fatal configuration problems, printed at startup. */
export function configWarnings() {
  const warnings = [];
  if (isDev) return warnings;
  if (!process.env.PUBLIC_URL) warnings.push('PUBLIC_URL is not set — email links will point at localhost.');
  if (env.storage.driver === 'local') {
    warnings.push('STORAGE=local keeps photos on this server’s disk; they are lost on hosts with a temporary disk (e.g. Render free).');
  }
  if (env.mail.provider === 'smtp' && onRender) {
    warnings.push('Render’s free plan blocks SMTP — set BREVO_API_KEY (or RESEND_API_KEY) to send email.');
  }
  if (!env.mail.provider) warnings.push('No email provider configured — approval, report and food alert emails are off.');
  if (env.mail.provider && !env.mail.from) {
    warnings.push('MAIL_FROM is empty — emails will be rejected. Set it to the sender address you verified with your email provider.');
  }
  if (!env.openai.apiKey && !env.geminiApiKey && !env.visionApiKey) {
    warnings.push('No AI key configured — set OPENAI_API_KEY to enable GreenBot and the photo checks.');
  }
  if (!env.serveFrontend && originOf(publicUrl) === originOf(serverUrl || `http://localhost:${port}`)) {
    warnings.push('SERVE_FRONTEND is off but PUBLIC_URL points at this server — set PUBLIC_URL to your frontend’s URL.');
  }
  return warnings;
}
