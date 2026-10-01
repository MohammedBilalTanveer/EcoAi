import path from 'node:path';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, FRONTEND_DIR } from './config/env.js';
import { apiNotFound } from './middleware/error.js';
import { limiter } from './middleware/rateLimit.js';
import api from './routes/index.js';
import { mediaRouter } from './services/storage.js';

/** Turns CORS_ORIGINS entries (optionally with a * wildcard) into matchers. */
function originMatcher(patterns) {
  const tests = patterns.map((p) =>
    p.includes('*') ? new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`, 'i') : p,
  );
  return (origin) => tests.some((t) => (typeof t === 'string' ? t === origin : t.test(origin)));
}

export function createApp() {
  const app = express();
  app.set('trust proxy', env.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The SPA loads map tiles, Google Identity and remote images; CSP is left to the host.
      contentSecurityPolicy: false,
      // Google sign-in opens a popup that must be able to message this window.
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      // Photos are loaded by the website, which may live on another domain.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      // Helmet's default (no-referrer) makes OpenStreetMap reject every map tile with
      // "403 Access blocked": its tile policy requires the site's origin as Referer.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(compression());

  // The website may be served from another domain (e.g. Vercel). Auth uses a bearer
  // token, not cookies, so no credentials mode is needed.
  const allowed = originMatcher(env.corsOrigins);
  app.use(
    cors({
      origin: (origin, done) => done(null, !origin || allowed(origin)),
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(
    morgan(env.isDev ? 'dev' : 'combined', {
      // Skip non-API requests and the high-frequency polling endpoints.
      skip: (req) =>
        !req.originalUrl.startsWith('/api') ||
        /^\/api\/(health|trucks\/locations|notifications\/unread-count)/.test(req.originalUrl),
    }),
  );

  app.use('/uploads', mediaRouter());
  // A generous ceiling per visitor; tighter limits sit on auth, AI and posting routes.
  app.use('/api', limiter({ windowMs: 5 * 60 * 1000, limit: 1500 }));
  app.use('/api', api);
  app.use('/api', apiNotFound);
  return app;
}

/** Serves the built React app (frontend/dist) with SPA fallback. */
export function serveFrontendBuild(app) {
  const dist = path.join(FRONTEND_DIR, 'dist');
  const indexHtml = path.join(dist, 'index.html');

  if (!env.serveFrontend) {
    // API-only deployment (frontend hosted elsewhere): send browsers to the website.
    app.get('/', (req, res) => {
      if (new URL(env.publicUrl).host === req.get('host')) {
        return res.type('text').send('EcoAI API is running. Set PUBLIC_URL to your website’s address.');
      }
      res.redirect(302, env.publicUrl);
    });
    return;
  }

  // Hashed assets never change; everything else must be revalidated.
  app.use(
    '/assets',
    express.static(path.join(dist, 'assets'), { index: false, maxAge: '1y', immutable: true, fallthrough: false }),
  );
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || !req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}
