import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiAlertTriangle, FiBell, FiCheckCircle, FiGift, FiShield, FiTag, FiZap } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { DietMark, DiscountBadge, PriceTag } from '../../components/food/FoodBits';
import ImageDropzone from '../../components/ImageDropzone';
import LocationPicker from '../../components/map/LocationPicker';
import { Alert, cx, Field, PageHeader, Segmented, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { useNow } from '../../hooks/useNow';
import { api } from '../../lib/api';
import {
  ALLERGENS,
  clock,
  DIET,
  duration,
  FOOD_CATEGORY,
  money,
  STORAGE,
  toLocalInput,
  UNIT,
  unitLabel,
} from '../../lib/format';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function computeSafeUntil(storage, preparedAt, bestBefore) {
  if (storage === 'packaged' && bestBefore) return new Date(bestBefore);
  return new Date(new Date(preparedAt).getTime() + STORAGE[storage].hours * HOUR);
}

function defaultPickupEnd(safeUntil, storage) {
  const now = Date.now();
  const cap = now + (storage === 'room_temp' ? 2 : 4) * HOUR;
  const end = Math.min(safeUntil.getTime() - 5 * MIN, cap);
  return new Date(Math.round(end / (5 * MIN)) * 5 * MIN);
}

function Section({ step, title, subtitle, children, aside }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-400/15 text-sm font-bold text-brand-300">
            {step}
          </span>
          <div>
            <h2 className="text-lg">{title}</h2>
            {subtitle && <p className="text-sm text-ink-400">{subtitle}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

const AiTag = ({ show }) =>
  show ? (
    <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-300">
      <FiZap /> AI
    </span>
  ) : null;

export default function FoodNew() {
  const { user } = useAuth();
  const { features } = useConfig();
  const navigate = useNavigate();
  const now = useNow(30000);
  const aiEnabled = features?.photoCheck;

  const [photos, setPhotos] = useState([]);
  const [ai, setAi] = useState({ status: 'idle' });
  const [aiFilled, setAiFilled] = useState(new Set());
  const touched = useRef(new Set());
  const analyzedId = useRef(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [ngoCount, setNgoCount] = useState(null);

  const [form, setForm] = useState(() => {
    const preparedAt = new Date(Date.now() - 15 * MIN);
    return {
      title: '',
      description: '',
      category: 'cooked_meal',
      dietType: 'veg',
      allergens: [],
      quantity: 10,
      unit: 'servings',
      mode: user.role === 'restaurant' ? 'discount' : 'free',
      originalPrice: '',
      discountPct: 50,
      storage: 'room_temp',
      preparedAt: toLocalInput(preparedAt),
      bestBefore: '',
      pickupEnd: toLocalInput(defaultPickupEnd(computeSafeUntil('room_temp', preparedAt), 'room_temp')),
      address: user.address || '',
      instructions: '',
      location: user.location || null,
    };
  });

  const setField = (key, value) => {
    touched.current.add(key);
    setAiFilled((s) => {
      if (!s.has(key)) return s;
      const next = new Set(s);
      next.delete(key);
      return next;
    });
    setErrors((e) => ({ ...e, [key]: undefined }));
    setForm((f) => ({ ...f, [key]: value }));
  };

  // ---- derived values -------------------------------------------------------
  const safeUntil = useMemo(
    () => computeSafeUntil(form.storage, form.preparedAt, form.bestBefore),
    [form.storage, form.preparedAt, form.bestBefore],
  );
  const pickupEnd = new Date(form.pickupEnd);
  const original = Number(form.originalPrice) || 0;
  const isFree = form.mode === 'free';
  const offer = isFree ? 0 : Math.round(original * (1 - form.discountPct / 100));
  const qty = Number(form.quantity) || 0;
  const pricing = {
    original,
    offer,
    isFree,
    discountPct: isFree ? 100 : form.discountPct,
  };

  // Keep the pickup window inside the safe window unless the user set it.
  useEffect(() => {
    if (touched.current.has('pickupEnd')) return;
    setForm((f) => ({ ...f, pickupEnd: toLocalInput(defaultPickupEnd(safeUntil, f.storage)) }));
  }, [safeUntil]);

  // How many NGOs would be alerted from this pickup point.
  useEffect(() => {
    if (!form.location) return undefined;
    const t = setTimeout(() => {
      api('/food/nearby-ngos', { query: { lat: form.location.lat, lng: form.location.lng } })
        .then((d) => setNgoCount(d.count))
        .catch(() => setNgoCount(null));
    }, 500);
    return () => clearTimeout(t);
  }, [form.location]);

  // AI autofill from the first photo.
  useEffect(() => {
    const first = photos[0];
    if (!first) {
      analyzedId.current = null;
      setAi({ status: 'idle' });
      return;
    }
    if (analyzedId.current === first.id) return;
    analyzedId.current = first.id;
    if (!aiEnabled) {
      setAi({ status: 'off' });
      return;
    }
    setAi({ status: 'running' });
    const fd = new FormData();
    fd.append('image', first.file);
    api('/food/analyze', { method: 'POST', body: fd })
      .then(({ ai: result }) => {
        if (analyzedId.current !== first.id) return;
        setAi({ status: 'done', result });
        if (!result.analyzed || result.isFood === false) return;
        const s = result.suggestion || {};
        const filled = new Set();
        setForm((f) => {
          const next = { ...f };
          const apply = (key, value) => {
            if (value == null || value === '' || (Array.isArray(value) && !value.length)) return;
            if (touched.current.has(key)) return;
            next[key] = value;
            filled.add(key);
          };
          apply('title', s.title);
          apply('description', s.description);
          apply('category', s.category);
          apply('dietType', s.dietType);
          apply('quantity', s.quantity);
          apply('unit', s.unit);
          apply('allergens', s.allergens?.filter((a) => ALLERGENS.includes(a)));
          apply('originalPrice', s.pricePerUnit ? String(s.pricePerUnit) : null);
          return next;
        });
        setAiFilled(filled);
      })
      .catch((err) => analyzedId.current === first.id && setAi({ status: 'error', message: err.message }));
  }, [photos, aiEnabled]);

  // ---- validation & submit --------------------------------------------------
  const validate = () => {
    const e = {};
    if (!photos.length) e.photos = 'Add at least one photo of the food.';
    if (!form.title.trim()) e.title = 'Give your listing a short title.';
    if (!(qty >= 1)) e.quantity = 'Quantity must be at least 1.';
    if (!isFree && !(original > 0)) e.originalPrice = 'Enter the menu price so people can see the saving.';
    const prepared = new Date(form.preparedAt).getTime();
    if (Number.isNaN(prepared)) e.preparedAt = 'Enter when the food was prepared.';
    else if (prepared > Date.now() + 10 * MIN) e.preparedAt = 'Preparation time cannot be in the future.';
    if (safeUntil.getTime() <= Date.now() + 15 * MIN) {
      e.preparedAt = `This food is past its safe window (${STORAGE[form.storage].label.toLowerCase()}: ${STORAGE[form.storage].hours}h).`;
    }
    if (Number.isNaN(pickupEnd.getTime()) || pickupEnd.getTime() < Date.now() + 15 * MIN) {
      e.pickupEnd = 'The pickup window must stay open for at least 15 more minutes.';
    } else if (pickupEnd.getTime() > safeUntil.getTime() + MIN) {
      e.pickupEnd = `For food safety, pickup must end by ${clock(safeUntil)}.`;
    }
    if (!form.location) e.location = 'Set the pickup location on the map.';
    setErrors(e);
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0]);
      return;
    }
    setSubmitting(true);
    const fd = new FormData();
    photos.forEach((p) => fd.append('images', p.file));
    const fields = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      dietType: form.dietType,
      allergens: JSON.stringify(form.allergens),
      quantity: qty,
      unit: form.unit,
      isFree,
      originalPrice: original,
      offerPrice: offer,
      storage: form.storage,
      preparedAt: new Date(form.preparedAt).toISOString(),
      bestBefore: form.storage === 'packaged' && form.bestBefore ? new Date(form.bestBefore).toISOString() : '',
      pickupEnd: pickupEnd.toISOString(),
      address: form.address.trim(),
      instructions: form.instructions.trim(),
      lat: form.location.lat,
      lng: form.location.lng,
    };
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    try {
      const data = await api('/food', { method: 'POST', body: fd });
      if (data.listing.flagged) toast.info('Saved — it’s held for a quick review because the photo didn’t pass the AI check.');
      else toast.success('Your food is listed! 🎉');
      navigate(`/food/${data.listing.id}?created=1&notified=${data.notifiedNgos}`);
    } catch (err) {
      toast.error(err.message);
      setErrors((x) => ({ ...x, submit: err.message }));
    } finally {
      setSubmitting(false);
    }
  };

  const leftMs = safeUntil.getTime() - now;
  const firstPhoto = photos[0]?.preview;

  return (
    <form onSubmit={submit} className="container-page py-10" noValidate>
      <PageHeader
        eyebrow="Share surplus food"
        title="List food for rescue"
        subtitle="Snap a photo, let AI fill in the details, set a fair price (or donate it) and nearby NGOs are alerted instantly."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* 1. Photos */}
          <Section step="1" title="Photos" subtitle="Clear photos build trust — the first one is the cover.">
            <ImageDropzone
              items={photos}
              onChange={(items) => {
                setPhotos(items);
                setErrors((e) => ({ ...e, photos: undefined }));
              }}
              max={3}
              title="Add photos of the food"
            />
            {errors.photos && <p className="mt-2 text-xs text-rose-300">{errors.photos}</p>}

            {ai.status === 'running' && (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent-200">
                <Spinner className="h-4 w-4" /> AI is looking at your photo and filling in the details…
              </div>
            )}
            {ai.status === 'done' && ai.result.analyzed && ai.result.isFood !== false && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
                <FiZap className="mt-0.5 shrink-0 text-accent-300" />
                <div>
                  <p className="font-semibold text-white">
                    AI recognised {ai.result.suggestion?.title ? `“${ai.result.suggestion.title}”` : 'food'}
                    {ai.result.confidence ? ` · ${Math.round(ai.result.confidence * 100)}% sure` : ''}
                  </p>
                  <p className="text-ink-300">
                    {aiFilled.size
                      ? 'We pre-filled the fields marked AI below — please double-check them.'
                      : 'Your details were kept as you entered them.'}
                  </p>
                </div>
              </div>
            )}
            {ai.status === 'done' && ai.result.isFood === false && (
              <Alert tone="amber" className="mt-4 flex gap-2">
                <FiAlertTriangle className="mt-0.5 shrink-0" />
                <span>
                  This photo doesn’t look like food to our AI. You can still publish, but it will be reviewed before
                  NGOs are alerted. Try a clearer photo of the food itself.
                </span>
              </Alert>
            )}
            {ai.status === 'done' && !ai.result.analyzed && (
              <p className="mt-3 text-xs text-ink-400">AI couldn’t analyse this photo right now — please fill in the details below.</p>
            )}
            {ai.status === 'error' && (
              <p className="mt-3 text-xs text-ink-400">AI autofill is unavailable right now ({ai.message}). Fill in the details below.</p>
            )}
          </Section>

          {/* 2. Details */}
          <Section step="2" title="What are you sharing?">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={<>Title<AiTag show={aiFilled.has('title')} /></>}
                error={errors.title}
                className="sm:col-span-2"
              >
                {(id) => (
                  <input
                    id={id}
                    className={cx('input', errors.title && 'input-error')}
                    value={form.title}
                    onChange={(e) => setField('title', e.target.value)}
                    placeholder="e.g. Veg biryani with raita"
                    maxLength={100}
                  />
                )}
              </Field>
              <Field label={<>Description<AiTag show={aiFilled.has('description')} /></>} optional className="sm:col-span-2">
                {(id) => (
                  <textarea
                    id={id}
                    rows={3}
                    className="input"
                    value={form.description}
                    onChange={(e) => setField('description', e.target.value)}
                    placeholder="What’s included, how it’s packed, spice level…"
                    maxLength={1000}
                  />
                )}
              </Field>
              <Field label={<>Category<AiTag show={aiFilled.has('category')} /></>}>
                {(id) => (
                  <select id={id} className="input" value={form.category} onChange={(e) => setField('category', e.target.value)}>
                    {Object.entries(FOOD_CATEGORY).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={<>Quantity<AiTag show={aiFilled.has('quantity')} /></>} error={errors.quantity}>
                {(id) => (
                  <div className="flex gap-2">
                    <input
                      id={id}
                      type="number"
                      min={1}
                      max={1000}
                      className={cx('input', errors.quantity && 'input-error')}
                      value={form.quantity}
                      onChange={(e) => setField('quantity', e.target.value)}
                    />
                    <select className="input w-36" value={form.unit} onChange={(e) => setField('unit', e.target.value)} aria-label="Unit">
                      {Object.entries(UNIT).map(([v, u]) => (
                        <option key={v} value={v}>
                          {u.many}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </Field>
              <div className="sm:col-span-2">
                <p className="label">
                  Diet type<AiTag show={aiFilled.has('dietType')} />
                </p>
                <Segmented
                  value={form.dietType}
                  onChange={(v) => setField('dietType', v)}
                  options={Object.entries(DIET).map(([v, d]) => ({ value: v, label: d.label, icon: <DietMark diet={v} /> }))}
                />
              </div>
              <div className="sm:col-span-2">
                <p className="label">
                  Contains allergens<AiTag show={aiFilled.has('allergens')} />
                </p>
                <div className="flex flex-wrap gap-2">
                  {ALLERGENS.map((a) => {
                    const on = form.allergens.includes(a);
                    return (
                      <button
                        key={a}
                        type="button"
                        className={cx('chip capitalize', on && 'chip-active')}
                        onClick={() =>
                          setField('allergens', on ? form.allergens.filter((x) => x !== a) : [...form.allergens, a])
                        }
                      >
                        {a}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Section>

          {/* 3. Price */}
          <Section step="3" title="Price" subtitle="Rescued food should always cost less than your menu price.">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { v: 'free', icon: FiGift, title: 'Donate for free', text: 'Reserved for registered NGOs & food banks.' },
                { v: 'discount', icon: FiTag, title: 'Sell at a discount', text: 'Anyone nearby can reserve at a reduced price.' },
              ].map(({ v, icon: Icon, title, text }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setField('mode', v)}
                  className={cx(
                    'flex gap-3 rounded-2xl border p-4 text-left transition',
                    form.mode === v ? 'border-brand-400/60 bg-brand-400/10' : 'border-white/10 hover:border-white/20',
                  )}
                >
                  <Icon className={cx('mt-0.5 text-lg', form.mode === v ? 'text-brand-300' : 'text-ink-400')} />
                  <span>
                    <span className="block font-semibold text-white">{title}</span>
                    <span className="block text-xs text-ink-400">{text}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field
                label={<>Menu price per {unitLabel(form.unit, 1)}<AiTag show={aiFilled.has('originalPrice')} /></>}
                optional={isFree}
                error={errors.originalPrice}
                hint={isFree ? 'Shows NGOs the value of your donation.' : undefined}
              >
                {(id) => (
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400">₹</span>
                    <input
                      id={id}
                      type="number"
                      min={0}
                      className={cx('input pl-8', errors.originalPrice && 'input-error')}
                      value={form.originalPrice}
                      onChange={(e) => setField('originalPrice', e.target.value)}
                      placeholder="180"
                    />
                  </div>
                )}
              </Field>
              {!isFree && (
                <div>
                  <div className="label flex justify-between">
                    <span>Discount</span>
                    <span className="font-bold text-amber-300">{form.discountPct}% off</span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={90}
                    step={5}
                    value={form.discountPct}
                    onChange={(e) => setField('discountPct', Number(e.target.value))}
                    className="mt-3 w-full accent-brand-400"
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-ink-500">
                    <span>20% (min)</span>
                    <span>50% suggested</span>
                    <span>90%</span>
                  </div>
                </div>
              )}
            </div>

            {original > 0 && (
              <div className="mt-5 rounded-xl bg-white/[0.03] px-4 py-3 text-sm text-ink-300">
                {isFree ? (
                  <>
                    You’re donating food worth <b className="text-white">{money(original * qty)}</b> — that’s about{' '}
                    <b className="text-white">{Math.round(qty * (form.unit === 'kg' ? 2.5 : 1))} meals</b> kept out of the bin.
                  </>
                ) : (
                  <>
                    Buyers pay <b className="text-white">{money(offer)}</b> instead of {money(original)} per {unitLabel(form.unit, 1)}. If
                    everything is picked up you recover <b className="text-white">{money(offer * qty)}</b> instead of wasting it.
                  </>
                )}
              </div>
            )}
          </Section>

          {/* 4. Safety */}
          <Section
            step="4"
            title="Food safety & pickup window"
            subtitle="We only show food while it is safe to eat."
            aside={<FiShield className="text-xl text-brand-300" />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prepared at" error={errors.preparedAt}>
                {(id) => (
                  <input
                    id={id}
                    type="datetime-local"
                    className={cx('input', errors.preparedAt && 'input-error')}
                    value={form.preparedAt}
                    max={toLocalInput(Date.now() + 10 * MIN)}
                    onChange={(e) => setField('preparedAt', e.target.value)}
                  />
                )}
              </Field>
              <Field label="Storage" hint={STORAGE[form.storage].hint}>
                {(id) => (
                  <select id={id} className="input" value={form.storage} onChange={(e) => setField('storage', e.target.value)}>
                    {Object.entries(STORAGE).map(([v, s]) => (
                      <option key={v} value={v}>
                        {s.label} ({s.hours}h)
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {form.storage === 'packaged' && (
                <Field label="Best before" optional hint="From the pack label. Defaults to 48h after packing.">
                  {(id) => (
                    <input
                      id={id}
                      type="datetime-local"
                      className="input"
                      value={form.bestBefore}
                      onChange={(e) => setField('bestBefore', e.target.value)}
                    />
                  )}
                </Field>
              )}
              <Field label="Pickup available until" error={errors.pickupEnd}>
                {(id) => (
                  <input
                    id={id}
                    type="datetime-local"
                    className={cx('input', errors.pickupEnd && 'input-error')}
                    value={form.pickupEnd}
                    min={toLocalInput(Date.now() + 15 * MIN)}
                    max={toLocalInput(safeUntil)}
                    onChange={(e) => setField('pickupEnd', e.target.value)}
                  />
                )}
              </Field>
            </div>
            <div
              className={cx(
                'mt-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm',
                leftMs > 60 * MIN ? 'bg-brand-400/10 text-brand-100' : leftMs > 15 * MIN ? 'bg-amber-400/10 text-amber-100' : 'bg-rose-500/10 text-rose-200',
              )}
            >
              <FiShield className="shrink-0" />
              {leftMs > 15 * MIN ? (
                <span>
                  Safe to eat until <b>{clock(safeUntil)}</b> ({duration(leftMs)} from now). The listing hides itself
                  automatically when the pickup window closes.
                </span>
              ) : (
                <span>This food is past its safe window and can’t be listed.</span>
              )}
            </div>
          </Section>

          {/* 5. Location */}
          <Section step="5" title="Pickup location">
            <LocationPicker
              value={form.location}
              onChange={(loc) => setField('location', loc)}
              onResolve={(label) => {
                if (!touched.current.has('address')) setForm((f) => ({ ...f, address: label }));
              }}
              autoLocate={!user.location}
              height={300}
            />
            {errors.location && <p className="mt-2 text-xs text-rose-300">{errors.location}</p>}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Pickup address">
                {(id) => (
                  <input id={id} className="input" value={form.address} onChange={(e) => setField('address', e.target.value)} placeholder="Shop no., street, area" />
                )}
              </Field>
              <Field label="Pickup instructions" optional>
                {(id) => (
                  <input
                    id={id}
                    className="input"
                    value={form.instructions}
                    onChange={(e) => setField('instructions', e.target.value)}
                    placeholder="e.g. Back entrance, ask for Ravi"
                    maxLength={300}
                  />
                )}
              </Field>
            </div>
          </Section>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card overflow-hidden">
            <div className="relative aspect-[16/10] bg-ink-850">
              {firstPhoto ? (
                <img src={firstPhoto} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-sm text-ink-500">Your cover photo</div>
              )}
              <DiscountBadge pricing={pricing} className="absolute left-3 top-3" />
            </div>
            <div className="space-y-3 p-5">
              <p className="text-xs uppercase tracking-wider text-ink-500">Preview</p>
              <div className="flex items-start gap-2">
                <DietMark diet={form.dietType} className="mt-1" />
                <h3 className="text-base">{form.title || 'Your food title'}</h3>
              </div>
              <p className="text-sm text-ink-400">{user.organization || user.name}</p>
              {(original > 0 || isFree) && <PriceTag pricing={pricing} unit={form.unit} />}
              <p className="text-sm text-ink-300">
                {qty || 0} {unitLabel(form.unit, qty)} · pickup until {Number.isNaN(pickupEnd.getTime()) ? '—' : clock(pickupEnd)}
              </p>
            </div>
            <div className="border-t border-white/5 p-5">
              <div className="flex items-start gap-3 text-sm">
                <FiBell className="mt-0.5 shrink-0 text-brand-300" />
                {ngoCount == null ? (
                  <span className="text-ink-400">Set the pickup location to see how many NGOs will be alerted.</span>
                ) : ngoCount > 0 ? (
                  <span className="text-ink-200">
                    <b className="text-white">{ngoCount} NGO{ngoCount > 1 ? 's' : ''}</b> near this spot will be notified instantly.
                  </span>
                ) : (
                  <span className="text-ink-400">No NGOs have alerts set for this area yet — your listing will still be visible to everyone nearby.</span>
                )}
              </div>
              {errors.submit && <Alert className="mt-4">{errors.submit}</Alert>}
              <button type="submit" className="btn btn-primary btn-lg mt-5 w-full" disabled={submitting}>
                {submitting ? <Spinner className="h-4 w-4" /> : <><FiCheckCircle /> Publish listing</>}
              </button>
              <p className="mt-3 text-center text-[11px] text-ink-500">
                By publishing you confirm the food is fresh, hygienically stored and safe to eat.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}
