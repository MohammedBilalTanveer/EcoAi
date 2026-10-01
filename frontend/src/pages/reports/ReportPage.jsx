import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiAlertTriangle, FiCheckCircle, FiMail, FiMapPin, FiSend, FiXCircle } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { AiCheckPanel } from '../../components/AiCheck';
import ImageDropzone from '../../components/ImageDropzone';
import LocationPicker from '../../components/map/LocationPicker';
import { Alert, cx, Field, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { REPORT_CATEGORY, SEVERITY } from '../../lib/format';

const SEVERITY_HELP = {
  low: 'A few items, not blocking anything',
  medium: 'Noticeable pile, needs cleanup soon',
  high: 'Large dump, bad smell or blocking the path',
  critical: 'Hazardous, burning or a health risk',
};

const RESULT_HEAD = {
  passed: { icon: FiCheckCircle, tone: 'text-brand-300', title: 'Report submitted' },
  review: { icon: FiCheckCircle, tone: 'text-amber-300', title: 'Report submitted for review' },
  rejected: { icon: FiXCircle, tone: 'text-rose-300', title: 'Photo not accepted' },
};

function Result({ result, onAgain }) {
  const { report, ai } = result;
  const screening = result.screening || report.screening;
  const head = RESULT_HEAD[screening.decision] || RESULT_HEAD.review;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl">
      <div className="card overflow-hidden">
        <div className="relative">
          <img src={report.image} alt="Reported site" className="max-h-72 w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
          <div className="absolute bottom-4 left-5 flex items-center gap-2 text-white">
            <head.icon className={cx('text-2xl', head.tone)} />
            <span className="text-xl font-bold">{head.title}</span>
          </div>
        </div>
        <div className="space-y-5 p-6">
          <p className="text-ink-300">
            {screening.message ||
              (screening.decision === 'rejected'
                ? 'Your photo did not pass the AI check, so the report was not sent to the city.'
                : 'Thanks for helping keep the city clean.')}{' '}
            Report <b className="text-white">#{report.id.slice(-6).toUpperCase()}</b>
            {screening.decision === 'rejected' ? ' is saved in My Reports.' : ' — we’ll notify you when its status changes.'}
          </p>

          <AiCheckPanel ai={ai} screening={screening}>
            {screening.decision === 'rejected' && (
              <p className="mt-3 text-xs text-ink-400">
                If this is a real dumping spot, try a closer, well-lit photo that clearly shows the waste. Staff can also review
                rejected reports.
              </p>
            )}
          </AiCheckPanel>

          {(screening.sentToAuthority || report.authorityNotified) && (
            <Alert tone="emerald" className="flex items-center gap-2">
              <FiMail className="shrink-0" /> The city authority has been emailed about this spot.
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Link to="/my-reports" className="btn btn-primary">
              Track my reports
            </Link>
            <button type="button" className="btn btn-secondary" onClick={onAgain}>
              {screening.decision === 'rejected' ? 'Try another photo' : 'Report another spot'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function ReportPage() {
  const [photos, setPhotos] = useState([]);
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('');
  const [addressTouched, setAddressTouched] = useState(false);
  const [category, setCategory] = useState('mixed');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [fromPhoto, setFromPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const onPhotos = (items) => {
    setPhotos(items);
    const gps = items[0]?.meta?.gps;
    if (gps && !fromPhoto) {
      setLocation(gps);
      setFromPhoto(true);
      toast.success('📍 Location taken from your photo’s GPS data.');
    }
  };

  const reset = () => {
    setResult(null);
    setPhotos([]);
    setDescription('');
    setSeverity('medium');
    setCategory('mixed');
    setFromPhoto(false);
    setAddressTouched(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!photos.length) return setError('Please add a photo of the dumping site.');
    if (!location) return setError('Please set the location on the map.');
    setSubmitting(true);
    const fd = new FormData();
    fd.append('image', photos[0].file);
    fd.append('category', category);
    fd.append('severity', severity);
    fd.append('description', description.trim());
    fd.append('address', address.trim());
    fd.append('lat', location.lat);
    fd.append('lng', location.lng);
    try {
      const data = await api('/reports', { method: 'POST', body: fd });
      setResult(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="container-page py-10">
        <Result result={result} onAgain={reset} />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="container-page py-10" noValidate>
      <PageHeader
        eyebrow="Report illegal dumping"
        title="Spotted garbage dumped where it shouldn’t be?"
        subtitle="Snap a photo and pin the spot. AI verifies the photo, high-confidence reports go straight to the city authority, and you can track the cleanup."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 text-lg">1 · Photo evidence</h2>
            <ImageDropzone items={photos} onChange={onPhotos} max={1} title="Photograph the dumping site" />
            {fromPhoto && (
              <p className="mt-3 flex items-center gap-2 text-xs text-brand-300">
                <FiMapPin /> Location was read from the photo. Adjust the pin if needed.
              </p>
            )}
          </section>

          <section className="card space-y-5 p-5 sm:p-6">
            <h2 className="text-lg">2 · What did you see?</h2>
            <div>
              <p className="label">Type of waste</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(REPORT_CATEGORY).map(([v, c]) => (
                  <button key={v} type="button" onClick={() => setCategory(v)} className={cx('chip', category === v && 'chip-active')}>
                    <span>{c.emoji}</span> {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="label">How bad is it?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(SEVERITY).map(([v, s]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSeverity(v)}
                    className={cx(
                      'flex items-start gap-3 rounded-xl border p-3 text-left transition',
                      severity === v ? 'border-white/30 bg-white/[0.06]' : 'border-white/10 hover:border-white/20',
                    )}
                  >
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span>
                      <span className="block text-sm font-semibold text-white">{s.label}</span>
                      <span className="block text-xs text-ink-400">{SEVERITY_HELP[v]}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <Field label="Description" optional>
              {(id) => (
                <textarea
                  id={id}
                  rows={3}
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Construction debris dumped overnight next to the lake walkway"
                  maxLength={1000}
                />
              )}
            </Field>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 text-lg">3 · Where is it?</h2>
            <LocationPicker
              value={location}
              onChange={setLocation}
              onResolve={(label) => !addressTouched && setAddress(label)}
              height={360}
            />
            <Field label="Address / landmark" className="mt-4">
              {(id) => (
                <input
                  id={id}
                  className="input"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setAddressTouched(true);
                  }}
                  placeholder="Near bus stop, opposite the temple…"
                />
              )}
            </Field>
          </section>

          {error && (
            <Alert className="flex items-center gap-2">
              <FiAlertTriangle className="shrink-0" /> {error}
            </Alert>
          )}
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner className="h-4 w-4" /> Analysing photo & submitting…
              </>
            ) : (
              <>
                <FiSend /> Submit report
              </>
            )}
          </button>
          <p className="text-center text-xs text-ink-500">Your name is never shown publicly. Only staff can see who reported.</p>
        </div>
      </div>
    </form>
  );
}
