import exifr from 'exifr';

const MAX_SIDE = 1600;

/**
 * Downscales a photo to at most 1600px and re-encodes it as JPEG so uploads are
 * fast on mobile data. Falls back to the original file if the browser can't decode it.
 */
export async function compressImage(file, { maxSide = MAX_SIDE, quality = 0.84 } = {}) {
  if (!file?.type?.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || (blob.size > file.size && scale === 1 && file.type !== 'image/heic')) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Reads GPS coordinates and capture time embedded in a photo, if present. */
export async function readPhotoMeta(file) {
  try {
    const [gps, tags] = await Promise.all([
      exifr.gps(file).catch(() => null),
      exifr.parse(file, ['DateTimeOriginal']).catch(() => null),
    ]);
    return {
      gps: gps && Number.isFinite(gps.latitude) ? { lat: gps.latitude, lng: gps.longitude } : null,
      takenAt: tags?.DateTimeOriginal instanceof Date ? tags.DateTimeOriginal : null,
    };
  } catch {
    return { gps: null, takenAt: null };
  }
}
