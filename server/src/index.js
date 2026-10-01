import http from 'node:http';
import { createApp, serveFrontendBuild } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { configWarnings, env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { User } from './models/index.js';
import { aiSummary, checkAiKeys } from './services/ai.js';
import { ensureBootstrapAdmin } from './services/bootstrap.js';
import { startExpiryJob, stopExpiryJob } from './services/food.js';
import { backfillScreening } from './services/screening.js';
import { storageLabel } from './services/storage.js';

process.on('unhandledRejection', (reason) => console.error('[server] unhandled promise rejection:', reason));
process.on('uncaughtException', (err) => {
  // State may be corrupt: log and exit so the host restarts a clean process.
  console.error('[server] uncaught exception:', err);
  process.exit(1);
});

const app = createApp();
const server = http.createServer(app);
// Keep idle connections open longer than the host's load balancer does, otherwise it
// can reuse a socket Node just closed and answer with a random 502.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

await connectDB();
// Accounts created before approvals existed have no status: they are already trusted.
await User.updateMany({ status: { $exists: false } }, { $set: { status: 'active' } });
await backfillScreening();
await ensureBootstrapAdmin();

let vite = null;
if (env.isDev) {
  const { attachVite } = await import('./vite.js');
  vite = await attachVite(app, server);
} else {
  serveFrontendBuild(app);
}
app.use(errorHandler);

startExpiryJob();

server.listen(env.port, () => {
  const flag = (on) => (on ? 'on' : 'off');
  const mail = env.mail.enabled ? `on (${env.mail.provider})` : 'off';
  const web = env.isDev ? 'Vite dev server' : env.serveFrontend ? 'frontend/dist' : `API only, website at ${env.publicUrl}`;
  console.log(
    `\n  EcoAI running at http://localhost:${env.port}  (${env.isDev ? 'development' : 'production'})\n` +
      `  AI: ${aiSummary()} · Email: ${mail} · Google sign-in: ${flag(Boolean(env.googleClientId))}\n` +
      `  Photos: ${storageLabel()} · Web: ${web}\n`,
  );
  for (const warning of configWarnings()) console.warn(`  [config] ${warning}`);
  checkAiKeys();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${env.port} is already in use. Stop the other process or set PORT in server/.env.`);
    process.exit(1);
  }
  throw err;
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[server] ${signal} received, shutting down...`);
  stopExpiryJob();
  // Let in-flight requests finish, but never hang the host's restart.
  setTimeout(() => process.exit(0), 8000).unref();
  server.close();
  server.closeIdleConnections();
  await vite?.close().catch(() => {});
  await disconnectDB();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
