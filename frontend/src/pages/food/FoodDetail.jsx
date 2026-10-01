import { useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker } from 'react-leaflet';
import MapTiles from '../../components/map/MapTiles';
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiInfo,
  FiMapPin,
  FiMinus,
  FiNavigation,
  FiPhone,
  FiPlus,
  FiShield,
  FiX,
  FiZap,
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import { Countdown, DietMark, DiscountBadge, PriceTag, QuantityLeft } from '../../components/food/FoodBits';
import { pinIcon } from '../../components/map/icons';
import { Alert, Avatar, Badge, cx, ErrorState, Modal, PageLoader, Spinner, StatusBadge } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import {
  CLAIM_STATUS,
  clock,
  dateTime,
  DIET,
  FOOD_CATEGORY,
  LISTING_STATUS,
  money,
  ROLE_LABEL,
  STORAGE,
  timeAgo,
  unitLabel,
} from '../../lib/format';
import { directionsUrl } from '../../lib/geo';

const pin = pinIcon('#9b6ff1');

function Gallery({ images, title }) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-850">
        <img src={images[active]} alt={title} className="aspect-[16/10] w-full object-cover" />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-3">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              className={cx('h-16 w-20 overflow-hidden rounded-xl border-2', i === active ? 'border-brand-400' : 'border-transparent opacity-70')}
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PickupCode({ claim, listing, onCancel, cancelling }) {
  return (
    <div className="rounded-2xl border border-brand-400/30 bg-brand-400/[0.07] p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-brand-200">
        <FiCheckCircle /> Reserved for you
      </p>
      <p className="mt-4 text-xs uppercase tracking-wider text-ink-400">Pickup code</p>
      <p className="font-mono text-4xl font-extrabold tracking-[0.3em] text-white">{claim.pickupCode}</p>
      <p className="mt-2 text-sm text-ink-300">Show this code at pickup. The restaurant enters it to confirm the handover.</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-ink-500">Quantity</dt>
          <dd className="font-semibold text-white">
            {claim.quantity} {unitLabel(listing.quantity.unit, claim.quantity)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Pay at pickup</dt>
          <dd className="font-semibold text-white">{money(claim.totalPrice)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-ink-500">Collect before</dt>
          <dd className="font-semibold text-white">{dateTime(listing.pickup.end)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={directionsUrl(listing.location)} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
          <FiNavigation /> Directions
        </a>
        {listing.donor?.phone && (
          <a href={`tel:${listing.donor.phone}`} className="btn btn-secondary btn-sm">
            <FiPhone /> Call {listing.donor.organization ? 'restaurant' : 'donor'}
          </a>
        )}
        <button type="button" className="btn btn-danger btn-sm" onClick={onCancel} disabled={cancelling}>
          {cancelling ? <Spinner className="h-3 w-3" /> : <FiX />} Cancel
        </button>
      </div>
    </div>
  );
}

function ReservePanel({ listing, permissions, onReserved }) {
  const location = useLocation();
  const [qty, setQty] = useState(Math.min(permissions.maxQuantity || 1, listing.quantity.unit === 'kg' ? 2 : 5));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const max = permissions.maxQuantity;

  if (!permissions.canClaim) {
    const messages = {
      login: (
        <div className="space-y-3">
          <p className="text-sm text-ink-300">Sign in to reserve this food and get your pickup code.</p>
          <Link to="/login" state={{ from: location }} className="btn btn-primary w-full">
            Sign in to reserve
          </Link>
        </div>
      ),
      ngo_only: (
        <Alert tone="sky">
          <b>Reserved for NGOs.</b> Free donations go to registered NGOs and food banks so they reach people in need.
        </Alert>
      ),
      unavailable: <Alert tone="amber">This food is no longer available for reservation.</Alert>,
      staff: <Alert tone="sky">Staff accounts can view but not reserve food.</Alert>,
    };
    return messages[permissions.reason] || null;
  }

  const reserve = async () => {
    setBusy(true);
    try {
      const data = await api(`/food/${listing.id}/claim`, { method: 'POST', body: { quantity: qty, note: note.trim() || undefined } });
      toast.success('Reserved! Show your pickup code at the counter.');
      onReserved(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const unit = listing.quantity.unit;
  return (
    <div className="space-y-4">
      <div>
        <p className="label">How much do you need?</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-white/10 bg-ink-850">
            <button type="button" className="grid h-11 w-11 place-items-center text-ink-300 hover:text-white disabled:opacity-30" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Less">
              <FiMinus />
            </button>
            <input
              type="number"
              className="w-14 bg-transparent text-center text-lg font-bold text-white outline-none"
              value={qty}
              min={1}
              max={max}
              onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
            />
            <button type="button" className="grid h-11 w-11 place-items-center text-ink-300 hover:text-white disabled:opacity-30" onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={qty >= max} aria-label="More">
              <FiPlus />
            </button>
          </div>
          <span className="text-sm text-ink-400">
            {unitLabel(unit, qty)} · max {max}
          </span>
        </div>
      </div>
      <textarea
        className="input"
        rows={2}
        placeholder="Note for the restaurant (optional) — e.g. arrival time"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
      />
      <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
        <span className="text-sm text-ink-400">Pay at pickup</span>
        <span className="text-right">
          <span className="block text-xl font-bold text-white">{money(qty * listing.pricing.offer)}</span>
          {listing.pricing.original > 0 && (
            <span className="block text-xs text-brand-300">
              you save {money(qty * (listing.pricing.original - listing.pricing.offer))}
            </span>
          )}
        </span>
      </div>
      <button type="button" className="btn btn-primary btn-lg w-full" onClick={reserve} disabled={busy}>
        {busy ? <Spinner className="h-4 w-4" /> : 'Reserve now'}
      </button>
      <p className="text-center text-[11px] text-ink-500">No online payment — pay the restaurant directly when you collect.</p>
    </div>
  );
}

function DonorPanel({ listing, claims, onChanged, readOnly = false }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const active = !readOnly && ['available', 'reserved'].includes(listing.status);

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api(`/food/${listing.id}/verify`, { method: 'POST', body: { code } });
      toast.success(`Pickup confirmed for ${data.claim.claimer.organization || data.claim.claimer.name}. Thank you! 🎉`);
      setCode('');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelListing = async () => {
    setBusy(true);
    try {
      await api(`/food/${listing.id}/cancel`, { method: 'POST', body: { reason: reason.trim() || undefined } });
      toast.info('Listing cancelled. Anyone who reserved it has been notified.');
      setCancelOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {active && (
        <form onSubmit={verify} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="font-semibold text-white">Confirm a pickup</p>
          <p className="mt-0.5 text-xs text-ink-400">Ask the NGO / customer for their 6-digit code.</p>
          <div className="mt-3 flex gap-2">
            <input
              className="input text-center font-mono text-lg tracking-[0.3em]"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
              Verify
            </button>
          </div>
        </form>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-white">Reservations ({claims.length})</p>
        {claims.length === 0 ? (
          <p className="text-sm text-ink-400">No reservations yet. NGOs nearby have been alerted.</p>
        ) : (
          <ul className="space-y-2">
            {claims.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3">
                <Avatar name={c.claimer.organization || c.claimer.name} src={c.claimer.avatar} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{c.claimer.organization || c.claimer.name}</p>
                  <p className="text-xs text-ink-400">
                    {c.quantity} {unitLabel(listing.quantity.unit, c.quantity)} · {money(c.totalPrice)} · {timeAgo(c.createdAt)}
                  </p>
                  {c.note && <p className="mt-0.5 text-xs italic text-ink-400">“{c.note}”</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge map={CLAIM_STATUS} value={c.status} />
                  {c.claimer.phone && c.status === 'reserved' && (
                    <a href={`tel:${c.claimer.phone}`} className="text-xs text-brand-300">
                      <FiPhone className="inline" /> Call
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active && (
        <button type="button" className="btn btn-danger w-full" onClick={() => setCancelOpen(true)}>
          Cancel listing
        </button>
      )}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this listing?"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setCancelOpen(false)}>
              Keep it
            </button>
            <button type="button" className="btn btn-danger" onClick={cancelListing} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : 'Cancel listing'}
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-300">Anyone with an active reservation will be notified.</p>
        <textarea
          className="input mt-4"
          rows={3}
          placeholder="Reason (optional) — e.g. food got used for staff meals"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}

export default function FoodDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { data, error, loading, reload, setData } = useApi(`/food/${id}`, { pollMs: 30000 });
  const [cancelling, setCancelling] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error) {
    return (
      <div className="container-page py-16">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  const { listing, myClaim, claims, permissions } = data;
  const donorName = listing.donor?.organization || listing.donor?.name;
  const created = params.get('created') === '1';
  const notified = Number(params.get('notified') || 0);

  const cancelClaim = async () => {
    setCancelling(true);
    try {
      await api(`/food/claims/${myClaim.id}/cancel`, { method: 'POST' });
      toast.info('Reservation cancelled.');
      reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const facts = [
    { icon: FiClock, label: 'Prepared', value: `${clock(listing.preparedAt)} (${timeAgo(listing.preparedAt)})` },
    { icon: FiShield, label: 'Storage', value: STORAGE[listing.storage]?.label },
    { icon: FiShield, label: 'Safe until', value: dateTime(listing.safeUntil) },
    { icon: FiInfo, label: 'Category', value: FOOD_CATEGORY[listing.category] },
  ];

  return (
    <div className="container-page py-8">
      <Link to="/food" className="btn btn-ghost -ml-3 mb-4">
        <FiArrowLeft /> All food
      </Link>

      {created && permissions.isDonor && !listing.flagged && (
        <Alert tone="emerald" className="mb-6 flex items-start gap-3">
          <FiCheckCircle className="mt-0.5 shrink-0 text-lg" />
          <span>
            <b>Your listing is live!</b>{' '}
            {notified > 0
              ? `${notified} NGO${notified > 1 ? 's' : ''} nearby ${notified > 1 ? 'were' : 'was'} notified. You’ll get a notification as soon as someone reserves.`
              : 'It is now visible to everyone nearby. You’ll get a notification when someone reserves.'}
          </span>
        </Alert>
      )}
      {listing.flagged && (permissions.isDonor || permissions.isStaff) && (
        <Alert tone="amber" className="mb-6 flex items-start gap-3">
          <FiAlertTriangle className="mt-0.5 shrink-0 text-lg" />
          <span>
            <b>Held for review — not published yet.</b> The photo didn’t pass the AI check
            {listing.screening.reason ? `: ${listing.screening.reason}` : '.'} A moderator will review it; nearby NGOs are alerted as
            soon as it’s approved.
          </span>
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <div className="relative">
            <Gallery images={listing.images} title={listing.title} />
            <DiscountBadge pricing={listing.pricing} className="absolute left-4 top-4 text-xs" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge map={LISTING_STATUS} value={listing.status} />
              <Badge tone="slate">
                <DietMark diet={listing.dietType} /> {DIET[listing.dietType]?.label}
              </Badge>
              {listing.screening.decision === 'passed' ? (
                <Badge tone="violet">
                  <FiZap /> {listing.screening.source === 'staff' ? 'Checked by staff' : 'AI-verified food'}
                </Badge>
              ) : listing.flagged ? (
                <Badge tone="amber">
                  <FiAlertTriangle /> Under review
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-3 text-3xl sm:text-4xl">{listing.title}</h1>
            {listing.description && <p className="mt-3 text-ink-300">{listing.description}</p>}
          </div>

          <div className="card flex items-center gap-4 p-4">
            <Avatar name={donorName} src={listing.donor?.avatar} size="h-12 w-12" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">{donorName}</p>
              <p className="text-sm text-ink-400">
                {ROLE_LABEL[listing.donor?.role] || 'Donor'} · listed {timeAgo(listing.createdAt)}
              </p>
            </div>
            {listing.donor?.phone && (
              <a href={`tel:${listing.donor.phone}`} className="btn btn-secondary btn-sm">
                <FiPhone /> {listing.donor.phone}
              </a>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {facts.map((f) => (
              <div key={f.label} className="card flex items-center gap-3 p-4">
                <f.icon className="text-lg text-brand-300" />
                <div>
                  <p className="text-xs text-ink-500">{f.label}</p>
                  <p className="text-sm font-semibold text-ink-100">{f.value}</p>
                </div>
              </div>
            ))}
          </div>

          {listing.allergens.length > 0 && (
            <div className="card p-4">
              <p className="text-sm font-semibold text-white">Contains</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {listing.allergens.map((a) => (
                  <span key={a} className="badge bg-amber-400/10 capitalize text-amber-200 ring-amber-400/25">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <FiMapPin className="mt-1 text-brand-300" />
                <div>
                  <p className="font-semibold text-white">{listing.pickup.address || 'Pickup location'}</p>
                  {listing.pickup.instructions && <p className="text-sm text-ink-400">{listing.pickup.instructions}</p>}
                </div>
              </div>
              <a href={directionsUrl(listing.location)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                <FiNavigation /> Directions
              </a>
            </div>
            <div className="h-64">
              <MapContainer center={[listing.location.lat, listing.location.lng]} zoom={15} style={{ height: '100%', width: '100%', borderRadius: 0 }} scrollWheelZoom={false}>
                <MapTiles />
                <Marker position={[listing.location.lat, listing.location.lng]} icon={pin} />
              </MapContainer>
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card space-y-5 p-6">
            <PriceTag pricing={listing.pricing} unit={listing.quantity.unit} size="lg" />
            <QuantityLeft quantity={listing.quantity} />
            <div className="flex items-center justify-between text-sm">
              <Countdown to={listing.pickup.end} className="text-sm" />
              <span className="text-ink-400">until {clock(listing.pickup.end)}</span>
            </div>
            <div className="h-px bg-white/5" />

            {permissions.isDonor || ['staff', 'admin'].includes(user?.role) ? (
              <DonorPanel
                listing={listing}
                claims={claims || []}
                readOnly={!permissions.isDonor}
                onChanged={() => reload({ silent: true })}
              />
            ) : myClaim?.status === 'reserved' ? (
              <PickupCode claim={myClaim} listing={listing} onCancel={cancelClaim} cancelling={cancelling} />
            ) : myClaim?.status === 'picked_up' ? (
              <Alert tone="emerald" className="flex gap-2">
                <FiCheckCircle className="mt-0.5 shrink-0" />
                <span>
                  You collected {myClaim.quantity} {unitLabel(listing.quantity.unit, myClaim.quantity)}. Thank you for rescuing food!
                </span>
              </Alert>
            ) : (
              <ReservePanel
                listing={listing}
                permissions={permissions}
                onReserved={(d) =>
                  setData((prev) => ({
                    ...prev,
                    listing: d.listing,
                    myClaim: d.claim,
                    permissions: { ...prev.permissions, canClaim: false, reason: 'already' },
                  }))
                }
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
