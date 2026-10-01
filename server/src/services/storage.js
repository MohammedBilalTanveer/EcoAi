import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';

/**
 * Where uploaded photos live:
 *  - mongo (default): GridFS in the app's MongoDB, served from /uploads/db/<id>.<ext>.
 *    Survives redeploys on hosts whose disk is temporary (Render, Railway, Heroku).
 *  - cloudinary: Cloudinary's CDN (set CLOUDINARY_URL). Fastest for a public site.
 *  - local: server/uploads on disk. Fine for development or a host with a persistent disk.
 * Old /uploads/<folder>/<file> paths on disk keep working whatever the driver.
 */
const BUCKET = 'media';
const GRIDFS_PREFIX = '/uploads/db/';
const MIME_BY_EXT = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
const uniqueName = (ext) => `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

// ---------------------------------------------------------------------------
// Cloudinary (signed REST uploads; no SDK needed)
// ---------------------------------------------------------------------------

/** Cloudinary signature: SHA-1 of the sorted params plus the API secret. */
export function cloudinarySignature(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

async function cloudinaryCall(action, params, file) {
  const { cloudName, apiKey, apiSecret } = env.storage.cloudinary;
  const signed = { ...params, timestamp: Math.floor(Date.now() / 1000) };
  const form = new FormData();
  Object.entries(signed).forEach(([k, v]) => form.append(k, String(v)));
  form.append('api_key', apiKey);
  form.append('signature', cloudinarySignature(signed, apiSecret));
  if (file) form.append('file', file);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/${action}`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Cloudinary ${action} failed: ${data.error?.message || res.status}`);
  return data;
}

/** https://res.cloudinary.com/<cloud>/image/upload/v123/ecoai/food/abc.jpg -> ecoai/food/abc */
const cloudinaryPublicId = (url) => /\/image\/upload\/(?:[^/]+\/)*?(?:v\d+\/)(.+)\.[a-z0-9]+$/i.exec(url)?.[1] || null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Stores an image and returns the URL to save on the document: a path such as
 * /uploads/db/<id>.jpg (served by this server) or an absolute CDN URL.
 */
export async function saveImage(buffer, type, folder) {
  const driver = env.storage.driver;

  if (driver === 'cloudinary') {
    const data = await cloudinaryCall(
      'upload',
      { folder: `${env.storage.cloudinaryFolder}/${folder}` },
      new Blob([buffer], { type: type.mime }),
    );
    return data.secure_url;
  }

  if (driver === 'mongo') {
    const id = new mongoose.Types.ObjectId();
    await new Promise((resolve, reject) => {
      const stream = bucket().openUploadStreamWithId(id, uniqueName(type.ext), {
        metadata: { contentType: type.mime, folder },
      });
      stream.once('finish', resolve).once('error', reject);
      stream.end(buffer);
    });
    return `${GRIDFS_PREFIX}${id}.${type.ext}`;
  }

  const dir = path.join(env.uploadDir, folder);
  await fs.mkdir(dir, { recursive: true });
  const name = uniqueName(type.ext);
  await fs.writeFile(path.join(dir, name), buffer);
  return `/uploads/${folder}/${name}`;
}

/** Best-effort removal of a stored image (any driver). Never throws. */
export async function deleteImage(url) {
  if (!url) return;
  try {
    if (url.startsWith(GRIDFS_PREFIX)) {
      const id = url.slice(GRIDFS_PREFIX.length).split('.')[0];
      if (mongoose.isValidObjectId(id)) await bucket().delete(new mongoose.Types.ObjectId(id));
    } else if (url.startsWith('/uploads/')) {
      const file = path.resolve(env.uploadDir, url.slice('/uploads/'.length));
      if (file.startsWith(path.resolve(env.uploadDir) + path.sep)) await fs.unlink(file);
    } else if (url.includes('res.cloudinary.com') && env.storage.cloudinary) {
      const publicId = cloudinaryPublicId(url);
      if (publicId) await cloudinaryCall('destroy', { public_id: publicId });
    }
  } catch (err) {
    if (!/not found|ENOENT|FileNotFound/i.test(err.message)) console.warn(`[storage] could not delete ${url}: ${err.message}`);
  }
}

/** Serves /uploads: GridFS images plus any files saved on disk. */
export function mediaRouter() {
  const router = express.Router();

  router.get('/db/:file', async (req, res, next) => {
    const [id, ext] = req.params.file.split('.');
    if (!mongoose.isValidObjectId(id)) return next();
    const _id = new mongoose.Types.ObjectId(id);
    const [file] = await bucket().find({ _id }).limit(1).toArray();
    if (!file) return res.status(404).end();

    // Stored images never change, so browsers and CDNs may cache them for good.
    const etag = `"${id}"`;
    res.set({
      'Content-Type': file.metadata?.contentType || MIME_BY_EXT[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: etag,
    });
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.set('Content-Length', String(file.length));
    bucket().openDownloadStream(_id).once('error', next).pipe(res);
  });

  router.use(express.static(env.uploadDir, { maxAge: '7d', index: false }));
  // Never fall through to the website's HTML for a missing photo.
  router.use((_req, res) => res.status(404).end());
  return router;
}

export const storageLabel = () =>
  ({ mongo: 'MongoDB (GridFS)', cloudinary: 'Cloudinary', local: 'local disk' })[env.storage.driver];
