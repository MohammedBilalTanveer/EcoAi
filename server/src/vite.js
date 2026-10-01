import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FRONTEND_DIR } from './config/env.js';

/**
 * Development only: runs Vite inside this Express server (middleware mode) so a
 * single process serves the API, the React app and hot-module reloading.
 */
export async function attachVite(app, httpServer) {
  const viteEntry = path.join(FRONTEND_DIR, 'node_modules', 'vite', 'dist', 'node', 'index.js');
  if (!fs.existsSync(viteEntry)) {
    throw new Error('Frontend dependencies are missing. Run "npm install" in the project root.');
  }
  process.env.ECOAI_EMBEDDED = '1';
  const { createServer } = await import(pathToFileURL(viteEntry).href);
  const vite = await createServer({
    root: FRONTEND_DIR,
    configFile: path.join(FRONTEND_DIR, 'vite.config.js'),
    appType: 'spa',
    server: { middlewareMode: true, hmr: { server: httpServer } },
  });
  app.use(vite.middlewares);
  return vite;
}
