import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import mongoose from 'mongoose';
import { env, SERVER_ROOT } from './env.js';

// Fixed port so scripts (seed, create-staff) can share the dev server's embedded DB.
const EMBEDDED_PORT = 27027;
let embeddedServer = null;

const hasDbInUri = (uri) => /^mongodb(\+srv)?:\/\/[^/]+\/[^?/]+/.test(uri);

const isPortOpen = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(800, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });

/**
 * Starts a local MongoDB (persisted in server/.data/db) when no MONGODB_URI is set,
 * so the app runs out of the box during development. Production must use a real URI.
 */
async function embeddedMongoUri() {
  if (!env.isDev && !process.env.ECOAI_SCRIPT) {
    throw new Error('MONGODB_URI is required in production. Add it to server/.env');
  }
  if (await isPortOpen(EMBEDDED_PORT)) return `mongodb://127.0.0.1:${EMBEDDED_PORT}/`;

  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = await import('mongodb-memory-server'));
  } catch {
    throw new Error(
      'MONGODB_URI is not set. Either add a MongoDB connection string to server/.env ' +
        'or install dev dependencies (npm install) to use the embedded dev database.',
    );
  }
  const dbPath = path.join(SERVER_ROOT, '.data', 'db');
  fs.mkdirSync(dbPath, { recursive: true });
  embeddedServer = await MongoMemoryServer.create({
    instance: { dbPath, port: EMBEDDED_PORT, storageEngine: 'wiredTiger' },
  });
  console.warn(
    '\n[db] MONGODB_URI not set: using the embedded development MongoDB (data in server/.data/db).\n' +
      '     Set MONGODB_URI in server/.env to use your own MongoDB / Atlas cluster.\n',
  );
  return embeddedServer.getUri();
}

export async function connectDB() {
  const uri = env.mongoUri || (await embeddedMongoUri());
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    dbName: hasDbInUri(uri) ? undefined : env.mongoDbName,
    serverSelectionTimeoutMS: 15000,
  });
  const { host, port, name } = mongoose.connection;
  console.log(`[db] connected to MongoDB (${host}:${port}/${name})`);
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect().catch(() => {});
  if (embeddedServer) {
    await embeddedServer.stop({ doCleanup: false }).catch(() => {});
    embeddedServer = null;
  }
}
