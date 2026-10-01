import { useEffect, useRef, useState } from 'react';
import { FiCamera, FiImage, FiUploadCloud, FiX } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { compressImage, readPhotoMeta } from '../lib/image';
import { cx, Spinner } from './ui';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
let seq = 0;

/**
 * Photo picker with camera capture (mobile), drag & drop and previews.
 * Photos are compressed in the browser; EXIF GPS/time is read before compression.
 * `items` is an array of { id, file, preview, meta }.
 */
export default function ImageDropzone({ items, onChange, max = 1, title = 'Add a photo', subtitle, className }) {
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach((it) => URL.revokeObjectURL(it.preview)), []);

  const add = async (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!incoming.length) return;
    const room = max - items.length;
    if (room <= 0) {
      toast.info(`You can add up to ${max} photo${max > 1 ? 's' : ''}.`);
      return;
    }
    setBusy(true);
    try {
      const next = [];
      for (const original of incoming.slice(0, room)) {
        const meta = await readPhotoMeta(original);
        const file = await compressImage(original);
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${original.name} is too large (max 10 MB).`);
          continue;
        }
        seq += 1;
        next.push({ id: `img-${seq}`, file, preview: URL.createObjectURL(file), meta });
      }
      if (next.length) onChange([...items, ...next]);
    } finally {
      setBusy(false);
    }
  };

  const remove = (id) => {
    const it = items.find((x) => x.id === id);
    if (it) URL.revokeObjectURL(it.preview);
    onChange(items.filter((x) => x.id !== id));
  };

  const full = items.length >= max;

  return (
    <div className={className}>
      {!full && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
          className={cx(
            'flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition',
            dragging ? 'border-brand-400 bg-brand-400/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20',
          )}
        >
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-400/10 text-2xl text-brand-300">
            {busy ? <Spinner className="h-5 w-5" /> : <FiUploadCloud />}
          </div>
          <p className="font-semibold text-white">{busy ? 'Preparing photo…' : title}</p>
          <p className="mt-1 text-xs text-ink-400">
            {subtitle || 'Take a photo or drop an image here · JPG, PNG or WEBP'}
            {max > 1 && ` · up to ${max}`}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => cameraRef.current?.click()} disabled={busy}>
              <FiCamera /> Take photo
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => uploadRef.current?.click()} disabled={busy}>
              <FiImage /> Choose from gallery
            </button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={uploadRef}
            type="file"
            accept={ACCEPT}
            multiple={max > 1}
            className="hidden"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {items.length > 0 && (
        <div className={cx('grid gap-3', max > 1 ? 'mt-3 grid-cols-3' : 'grid-cols-1')}>
          {items.map((it, i) => (
            <div key={it.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-ink-850">
              <img
                src={it.preview}
                alt={`Photo ${i + 1}`}
                className={cx('w-full object-cover', max > 1 ? 'aspect-square' : 'max-h-80')}
              />
              {max > 1 && i === 0 && (
                <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  Cover
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(it.id)}
                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-rose-500"
                aria-label="Remove photo"
              >
                <FiX />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
