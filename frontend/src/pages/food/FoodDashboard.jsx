import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiCloud, FiDollarSign, FiHeart, FiNavigation, FiPackage, FiPhone, FiPlus, FiShoppingBag, FiTrendingUp } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { Countdown, DietMark } from '../../components/food/FoodBits';
import { AiDecisionBadge } from '../../components/AiCheck';
import { EmptyState, ErrorState, Modal, PageHeader, Spinner, StatCard, StatusBadge, Tabs } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { CLAIM_STATUS, dateTime, inr, LISTING_STATUS, money, number, timeAgo, unitLabel } from '../../lib/format';
import { directionsUrl } from '../../lib/geo';

function VerifyModal({ listing, onClose, onDone }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api(`/food/${listing.id}/verify`, { method: 'POST', body: { code } });
      toast.success(`Pickup confirmed for ${d.claim.claimer.organization || d.claim.claimer.name} 🎉`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Confirm pickup · ${listing.title}`}>
      <form onSubmit={submit}>
        <p className="text-sm text-ink-300">Enter the 6-digit code shown by the NGO or customer.</p>
        <input
          autoFocus
          className="input mt-4 text-center font-mono text-2xl tracking-[0.4em]"
          inputMode="numeric"
          maxLength={6}
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        <button type="submit" className="btn btn-primary mt-4 w-full" disabled={busy || code.length !== 6}>
          {busy ? <Spinner className="h-4 w-4" /> : 'Confirm pickup'}
        </button>
      </form>
    </Modal>
  );
}

function ListingsTab() {
  const { data, error, loading, reload } = useApi('/food/mine', { pollMs: 30000 });
  const [verifying, setVerifying] = useState(null);
  if (loading && !data) return <div className="skeleton h-64" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { listings, impact } = data;
  const active = listings.filter((l) => ['available', 'reserved'].includes(l.status));
  const past = listings.filter((l) => !['available', 'reserved'].includes(l.status));

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FiHeart} label="Meals rescued" value={number(impact.meals)} sub={`${impact.pickups} completed pickups`} />
        <StatCard icon={FiPackage} label="Food saved" value={`${impact.kg} kg`} sub="kept out of landfill" tone="sky" />
        <StatCard icon={FiCloud} label="CO₂ avoided" value={`${number(impact.co2Kg)} kg`} sub="estimated emissions" tone="violet" />
        <StatCard icon={FiDollarSign} label="Recovered" value={inr(impact.paid)} sub={`${inr(impact.saved)} value donated`} tone="amber" />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl">Active listings</h2>
          <Link to="/food/new" className="btn btn-primary btn-sm">
            <FiPlus /> New listing
          </Link>
        </div>
        {active.length === 0 ? (
          <EmptyState icon={FiShoppingBag} title="Nothing listed right now" action={<Link to="/food/new" className="btn btn-primary">Share surplus food</Link>}>
            Have extra food after service? List it in under a minute and nearby NGOs are alerted instantly.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {active.map((l) => {
              const reserved = l.claims.filter((c) => c.status === 'reserved');
              return (
                <div key={l.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <Link to={`/food/${l.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <img src={l.images[0]} alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <DietMark diet={l.dietType} />
                        <p className="truncate font-semibold text-white">{l.title}</p>
                        {l.flagged && <AiDecisionBadge screening={l.screening} />}
                      </div>
                      {l.flagged && (
                        <p className="truncate text-xs text-rose-300">Held for review: {l.screening.reason || 'photo did not pass the AI check'}</p>
                      )}
                      <p className="text-sm text-ink-400">
                        {l.quantity.available}/{l.quantity.total} {unitLabel(l.quantity.unit)} left · {l.pricing.isFree ? 'Free' : `${money(l.pricing.offer)} each`}
                      </p>
                      <Countdown to={l.pickup.end} className="mt-1" />
                    </div>
                  </Link>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-sm">
                      <p className="font-semibold text-white">{reserved.length} awaiting pickup</p>
                      <p className="text-xs text-ink-400">{l.notifiedNgos} NGOs alerted</p>
                    </div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setVerifying(l)} disabled={!reserved.length}>
                      Verify code
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl">History</h2>
          <div className="card divide-y divide-white/5">
            {past.map((l) => {
              const collected = l.claims.filter((c) => c.status === 'picked_up').reduce((s, c) => s + c.quantity, 0);
              return (
                <Link key={l.id} to={`/food/${l.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02]">
                  <img src={l.images[0]} alt="" className="h-10 w-12 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-100">{l.title}</p>
                    <p className="text-xs text-ink-500">{dateTime(l.createdAt)}</p>
                  </div>
                  <p className="hidden text-sm text-ink-300 sm:block">
                    {collected}/{l.quantity.total} {unitLabel(l.quantity.unit)} collected
                  </p>
                  <StatusBadge map={LISTING_STATUS} value={l.status} />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {verifying && <VerifyModal listing={verifying} onClose={() => setVerifying(null)} onDone={() => reload({ silent: true })} />}
    </div>
  );
}

function ReservationsTab() {
  const { data, error, loading, reload } = useApi('/food/claims/mine', { pollMs: 30000 });
  const [busyId, setBusyId] = useState(null);
  if (loading && !data) return <div className="skeleton h-64" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { claims, impact } = data;
  const active = claims.filter((c) => c.status === 'reserved');
  const past = claims.filter((c) => c.status !== 'reserved');

  const cancel = async (claim) => {
    setBusyId(claim.id);
    try {
      await api(`/food/claims/${claim.id}/cancel`, { method: 'POST' });
      toast.info('Reservation cancelled.');
      reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={FiHeart} label="Meals collected" value={number(impact.meals)} sub={`${impact.pickups} pickups`} />
        <StatCard icon={FiCloud} label="CO₂ avoided" value={`${number(impact.co2Kg)} kg`} tone="violet" />
        <StatCard icon={FiTrendingUp} label="Money saved" value={inr(impact.saved)} sub="vs. menu price" tone="amber" />
      </div>

      <section>
        <h2 className="mb-3 text-xl">Upcoming pickups</h2>
        {active.length === 0 ? (
          <EmptyState icon={FiShoppingBag} title="No active reservations" action={<Link to="/food" className="btn btn-primary">Find food nearby</Link>}>
            Reserve surplus food near you and your pickup code will appear here.
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((c) => (
              <div key={c.id} className="card overflow-hidden">
                <Link to={`/food/${c.listingId}`} className="flex items-center gap-4 p-4">
                  <img src={c.listing.images[0]} alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{c.listing.title}</p>
                    <p className="truncate text-sm text-ink-400">{c.listing.donor.organization || c.listing.donor.name}</p>
                    <Countdown to={c.listing.pickup.end} prefix="Collect within" className="mt-1" />
                  </div>
                </Link>
                <div className="flex items-center justify-between border-t border-white/5 bg-brand-400/[0.05] px-4 py-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-ink-400">Pickup code</p>
                    <p className="font-mono text-2xl font-extrabold tracking-[0.25em] text-white">{c.pickupCode}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold text-white">
                      {c.quantity} {unitLabel(c.listing.quantity.unit, c.quantity)}
                    </p>
                    <p className="text-ink-400">{c.totalPrice ? `Pay ${money(c.totalPrice)}` : 'Free'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 p-4 pt-3">
                  <a href={directionsUrl(c.listing.location)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                    <FiNavigation /> Directions
                  </a>
                  {c.listing.donor.phone && (
                    <a href={`tel:${c.listing.donor.phone}`} className="btn btn-secondary btn-sm">
                      <FiPhone /> Call
                    </a>
                  )}
                  <button type="button" className="btn btn-danger btn-sm ml-auto" onClick={() => cancel(c)} disabled={busyId === c.id}>
                    {busyId === c.id ? <Spinner className="h-3 w-3" /> : 'Cancel'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl">History</h2>
          <div className="card divide-y divide-white/5">
            {past.map((c) => (
              <Link key={c.id} to={`/food/${c.listingId}`} className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02]">
                <img src={c.listing.images[0]} alt="" className="h-10 w-12 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-100">{c.listing.title}</p>
                  <p className="text-xs text-ink-500">
                    {c.quantity} {unitLabel(c.listing.quantity.unit, c.quantity)} · {timeAgo(c.createdAt)}
                  </p>
                </div>
                {c.savings > 0 && c.status === 'picked_up' && <p className="hidden text-sm text-brand-300 sm:block">saved {money(c.savings)}</p>}
                <StatusBadge map={CLAIM_STATUS} value={c.status} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function FoodDashboard() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const canList = ['restaurant', 'citizen'].includes(user.role);
  const tabs = [
    ...(canList ? [{ value: 'listings', label: 'My listings' }] : []),
    { value: 'reservations', label: 'My reservations' },
  ];
  const fallback = user.role === 'restaurant' ? 'listings' : 'reservations';
  const requested = params.get('tab');
  const tab = tabs.some((t) => t.value === requested) ? requested : fallback;

  return (
    <div className="container-page py-10">
      <PageHeader
        eyebrow="Food rescue"
        title={user.role === 'restaurant' ? 'Your surplus food' : 'Your food activity'}
        subtitle={
          user.role === 'restaurant'
            ? 'Track listings, confirm pickups with codes and see the impact of every meal you rescue.'
            : 'Your reservations, pickup codes and the impact of the food you’ve rescued.'
        }
        actions={
          <Link to="/food" className="btn btn-secondary">
            <FiShoppingBag /> Browse food
          </Link>
        }
      />
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={(v) => setParams({ tab: v })} className="mb-8 w-fit" />}
      {tab === 'listings' ? <ListingsTab /> : <ReservationsTab />}
    </div>
  );
}
