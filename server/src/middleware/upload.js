import crypto from 'node:crypto';
import multer from 'multer';
import { badRequest } from '../utils/http.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Files are kept in memory so AI analysis can run before anything touches disk. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 3 },
});

/** Detects the real image type from magic bytes instead of trusting the client. */
export function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

export function requireImage(file, label = 'photo') {
  if (!file) throw badRequest(`Please attach a ${label}.`, 'IMAGE_REQUIRED');
  const type = detectImageType(file.buffer);
  if (!type) throw badRequest('Only JPEG, PNG or WEBP images are supported.', 'IMAGE_TYPE');
  return type;
}

export const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
