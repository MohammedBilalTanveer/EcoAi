import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import MapTiles from '../components/map/MapTiles';
import { FiCheck, FiClock, FiCrosshair, FiMoon, FiNavigation, FiTruck, FiUser } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { dotIcon, truckIcon, userIcon } from '../components/map/icons';
import { cx, ErrorState, PageLoader, ProgressBar, Spinner, StatusBadge } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useNow } from '../hooks/useNow';
import { duration, eta, istTime, istWhen, km, TRUCK_STATUS } from '../lib/format';
import { DEFAULT_CENTER, distanceKm, getCurrentPosition } from '../lib/geo';

const LIVE_POLL_MS = 3000;
const IDLE_POLL_MS = 30000;
const ME_ICON = userIcon();

function LiveBadge({ updatedAt, live }) {
  const now = useNow(1000);
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (!live) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-ink-300">
        <FiMoon /> Off duty
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-brand-400/10 px-2.5 py-1 text-[11px] font-semibold text-brand-200">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" />
      {seconds < 5 ? 'Live' : `${seconds}s ago`}
    </span>
  );
}

/** Marker whose DOM element stays stable so CSS can glide it between updates. */
function TruckMarker({ truck, selected, onSelect }) {
  const ref = useRef(null);
  const icon = useMemo(() => truckIcon(truck.color, truck.heading, selected), [truck.color, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current?.getElement()?.querySelector('.truck-heading');
    if (el) el.style.transform = `rotate(${truck.heading}deg)`;
  }, [truck.heading, selected]);
  return (
    <Marker
      ref={ref}
      position={[truck.lat, truck.lng]}
      icon={icon}
      opacity={truck.onDuty ? 1 : 0.6}
      zIndexOffset={selected ? 1000 : 500}
      eventHandlers={{ click: () => onSelect(truck.id) }}
    >
      <Tooltip direction="top" offset={[0, -22]}>
        <span className="font-semibold">{truck.code}</span>
        {!truck.onDuty && <span> · parked at {truck.depot}</span>}
      </Tooltip>
    </Marker>
  );
}

/**
 * Truck markers glide between position updates with a CSS transition. When the map
 * itself zooms or flies (e.g. after selecting a truck), Leaflet repositions every
 * marker, and that glide made all trucks slowly slide across the map. Turn the glide
 * off while the map is moving and back on once it has settled.
 */
function GlideGuard() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let timer;
    const freeze = () => {
      clearTimeout(timer);
      el.classList.add('no-glide');
    };
    const release = () => {
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('no-glide'), 60);
    };
    map.on('zoomstart movestart', freeze);
    map.on('zoomend moveend', release);
    return () => {
      clearTimeout(timer);
      map.off('zoomstart movestart', freeze);
      map.off('zoomend moveend', release);
    };
  }, [map]);
  return null;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    const zoom = Math.max(map.getZoom(), 14);
    const { x, y } = map.getSize();
    // flyTo divides by the map's size, so a collapsed/hidden map (0×0) would throw.
    if (x > 0 && y > 0) map.flyTo([target.lat, target.lng], zoom, { duration: 0.8 });
    else map.setView([target.lat, target.lng], zoom, { animate: false });
    // Only when the selection changes, not on every position update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.key, map]);
  return null;
}

/** Explains why nothing is moving (night, or between rounds) and when collection resumes. */
function FleetBanner({ trucks }) {
  const now = useNow(30000);
  const onDuty = trucks.filter((t) => t.onDuty).length;
  if (onDuty > 0) return null;
  const next = trucks
    .filter((t) => t.nextRound)
    .sort((a, b) => new Date(a.nextRound.startsAt) - new Date(b.nextRound.startsAt))[0];
  const finishedToday = trucks.some((t) => t.lastRoundEndedAt);
  const nextIsToday = next && istWhen(next.nextRound.startsAt, now).startsWith('today');
  return (
    <div className="card flex gap-3 border-sky-400/20 bg-sky-400/[0.04] p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-400/10 text-lg text-sky-300">
        <FiMoon />
      </span>
      <div className="text-sm">
        <p className="font-semibold text-white">
          {finishedToday && !nextIsToday
            ? 'Today’s collection is finished'
            : finishedToday
              ? 'Morning rounds are finished'
              : 'Collection hasn’t started yet'}
        </p>
        <p className="mt-0.5 text-ink-300">
          All trucks are parked at their depots.
          {next && (
            <>
              {' '}
              Next: <b className="text-white">{next.nextRound.label.toLowerCase()}</b> by {next.code},{' '}
              <b className="text-white">{istWhen(next.nextRound.startsAt, now)}</b> (in{' '}
              {duration(new Date(next.nextRound.startsAt) - now)}).
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function NearYou({ me, trucks, routes, onLocate, locating, onSelect }) {
  const now = useNow(30000);
  const nearest = useMemo(() => {
    if (!me || !trucks.length) return null;
    const truck = trucks.map((t) => ({ t, d: distanceKm(me, t) })).sort((a, b) => a.d - b.d)[0];
    // Closest collection point on any route (depots don't count), and its next pickup.
    let stop = null;
    routes?.forEach((r) =>
      r.stops.slice(1).forEach((s) => {
        const d = distanceKm(me, s);
        if (!stop || d < stop.d) stop = { ...s, d, truckId: r.id };
      }),
    );
    const serving = stop && trucks.find((t) => t.id === stop.truckId);
    const visit = serving?.nextVisits?.find((v) => v.name === stop.name);
    return { truck, stop, serving, visit };
  }, [me, trucks, routes]);

  if (!me) {
    return (
      <div className="card p-4">
        <p className="text-sm font-semibold text-white">When is the truck coming to me?</p>
        <p className="mt-1 text-xs text-ink-400">Share your location to see your nearest collection point and its next pickup.</p>
        <button type="button" className="btn btn-primary btn-sm mt-3" onClick={onLocate} disabled={locating}>
          {locating ? <Spinner className="h-3 w-3" /> : <FiCrosshair />} Use my location
        </button>
      </div>
    );
  }
  if (!nearest) return null;
  const { stop, serving, visit } = nearest;
  return (
    <div className="card space-y-3 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <FiUser className="text-sky-300" /> Near you
      </p>
      {stop && (
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="text-xs text-ink-400">Nearest collection point · {km(stop.d)}</p>
          <p className="font-semibold text-white">{stop.name}</p>
          <p className="mt-1 text-sm text-brand-200">
            {visit?.collectingNow
              ? `${serving.code} is collecting there now`
              : visit?.at
                ? `Next pickup ${istWhen(visit.at, now)} · in ${duration(new Date(visit.at) - now)}`
                : 'No pickup scheduled'}
          </p>
          {serving && <p className="mt-0.5 text-xs text-ink-500">Served by {serving.code} ({serving.zone})</p>}
        </div>
      )}
      <button
        type="button"
        onClick={() => onSelect(nearest.truck.t.id)}
        className="flex w-full items-center justify-between rounded-xl bg-white/[0.03] p-3 text-left hover:bg-white/[0.06]"
      >
        <span>
          <span className="block text-xs text-ink-400">Closest truck right now</span>
          <span className="block font-semibold text-white">{nearest.truck.t.code}</span>
          {!nearest.truck.t.onDuty && <span className="block text-xs text-ink-500">Parked at {nearest.truck.t.depot}</span>}
        </span>
        <span className="text-right text-sm text-ink-200">{km(nearest.truck.d)}</span>
      </button>
    </div>
  );
}

const STATE_DOT = {
  done: 'bg-brand-500 text-white',
  current: 'bg-amber-400/20 text-amber-200 ring-2 ring-amber-400/50',
  upcoming: 'bg-white/5 text-ink-500',
};

function Schedule({ truck }) {
  return (
    <ol className="space-y-1.5">
      {truck.schedule.map((s, i) => (
        <li key={s.name + i} className="flex items-center gap-2.5 text-sm">
          <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold', STATE_DOT[s.state])}>
            {s.state === 'done' ? <FiCheck /> : i + 1}
          </span>
          <span className={cx('min-w-0 flex-1 truncate', s.state === 'upcoming' ? 'text-ink-300' : 'text-white')}>
            {s.kind === 'unload' ? `Back at ${s.name} (unload)` : s.name}
          </span>
          <span className={cx('shrink-0 tabular-nums', s.state === 'current' ? 'text-amber-200' : 'text-ink-400')}>
            {s.state === 'current' ? 'now' : istTime(s.at)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TruckCard({ truck, timetable, selected, onSelect }) {
  const now = useNow(30000);
  return (
    <button
      type="button"
      onClick={() => onSelect(truck.id)}
      className={cx(
        'w-full rounded-2xl border p-4 text-left transition',
        selected ? 'border-white/25 bg-white/[0.06]' : 'border-white/[0.07] bg-ink-900/60 hover:border-white/15',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: truck.color }} />
          <span className="font-mono text-sm font-bold text-white">{truck.code}</span>
        </span>
        <StatusBadge map={TRUCK_STATUS} value={truck.status} />
      </div>
      <p className="mt-1 text-xs text-ink-400">
        {truck.zone} · {truck.driver}
      </p>

      {truck.onDuty ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar
              value={truck.fillPercent}
              color={truck.fillPercent > 80 ? 'bg-rose-400' : truck.fillPercent > 55 ? 'bg-amber-300' : 'bg-brand-400'}
            />
            <span className="w-10 text-right text-xs text-ink-300">{truck.fillPercent}%</span>
          </div>
          <p className="mt-2 text-xs text-ink-300">
            {truck.currentStop ? (
              <>
                {truck.status === 'unloading' ? 'Unloading at ' : 'Collecting at '}
                <b className="text-white">{truck.currentStop}</b>
              </>
            ) : truck.nextStop ? (
              <>
                Next: <b className="text-white">{truck.nextStop.name}</b> · {eta(truck.nextStop.etaSec)} ({istTime(truck.nextStop.at)})
              </>
            ) : null}
          </p>
          <p className="mt-1 text-[11px] text-ink-500">
            {truck.round.label} · {truck.stopsDone} of {truck.stopsTotal} stops done · ends ~{istTime(truck.round.endsAt)}
          </p>
        </>
      ) : (
        <div className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2 text-xs">
          <p className="text-ink-300">
            Parked at <b className="text-white">{truck.depot}</b>
            {truck.lastRoundEndedAt && <> · finished at {istTime(truck.lastRoundEndedAt)}</>}
          </p>
          {truck.nextRound && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sky-200">
              <FiClock className="shrink-0" /> {truck.nextRound.label} starts {istWhen(truck.nextRound.startsAt, now)} · in{' '}
              {duration(new Date(truck.nextRound.startsAt) - now)}
            </p>
          )}
        </div>
      )}

      {selected && (
        <div className="mt-4 space-y-4 border-t border-white/5 pt-3">
          {truck.onDuty && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Speed', value: `${truck.speedKmh} km/h` },
                { label: 'Load', value: `${(truck.loadKg / 1000).toFixed(1)} t` },
                { label: 'Route', value: `${truck.progressPct}%` },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-white/[0.03] py-2">
                  <p className="text-sm font-semibold text-white">{s.value}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-500">{s.label}</p>
                </div>
              ))}
            </div>
          )}
          {truck.schedule?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                {truck.onDuty ? `${truck.round.label} schedule` : `Next round · ${istWhen(truck.nextRound.startsAt, now)}`}
              </p>
              <Schedule truck={truck} />
            </div>
          )}
          {timetable?.length > 0 && (
            <p className="text-[11px] text-ink-500">
              Runs daily: {timetable.map((r) => `${r.label.replace(' round', '')} ${r.start}–${r.end}`).join(' · ')} (IST),{' '}
              {truck.routeKm} km
            </p>
          )}
        </div>
      )}
    </button>
  );
}

/** A route split into the part driven this round (solid) and the rest (dashed). */
function RoutePath({ route, truck, selectedId, onSelect }) {
  const focus = selectedId == null ? 1 : selectedId === route.id ? 1.6 : 0.35;
  const handlers = { click: () => onSelect(route.id) };
  if (!truck?.onDuty || truck.pathIndex < 0) {
    return (
      <Polyline
        positions={route.points}
        pathOptions={{ color: route.color, weight: selectedId === route.id ? 4 : 2.5, opacity: 0.35 * focus, dashArray: '6 8' }}
        eventHandlers={handlers}
      />
    );
  }
  const here = [truck.lat, truck.lng];
  const done = [...route.points.slice(0, truck.pathIndex + 1), here];
  const ahead = [here, ...route.points.slice(truck.pathIndex + 1)];
  return (
    <>
      <Polyline
        positions={done}
        pathOptions={{ color: route.color, weight: selectedId === route.id ? 5 : 3.5, opacity: Math.min(1, 0.6 * focus) }}
        eventHandlers={handlers}
      />
      <Polyline
        positions={ahead}
        pathOptions={{ color: route.color, weight: selectedId === route.id ? 4 : 2.5, opacity: 0.35 * focus, dashArray: '6 8' }}
        eventHandlers={handlers}
      />
    </>
  );
}

export default function GarbageTrucks() {
  const [pollMs, setPollMs] = useState(LIVE_POLL_MS);
  const { data: trucks, error, reload } = useApi('/trucks/locations', { pollMs });
  const { data: routes } = useApi('/trucks/routes');
  const [selectedId, setSelectedId] = useState(null);
  const [me, setMe] = useState(null);
  const [locating, setLocating] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const now = useNow(60000);

  const onDuty = trucks?.filter((t) => t.onDuty).length ?? 0;
  useEffect(() => {
    if (!trucks) return;
    setUpdatedAt(Date.now());
    // Poll fast while trucks are moving; slowly while they're parked, but wake up
    // in time for the next round.
    const nextStart = Math.min(...trucks.map((t) => (t.nextRound ? new Date(t.nextRound.startsAt).getTime() : Infinity)));
    setPollMs(onDuty > 0 || nextStart - Date.now() < IDLE_POLL_MS ? LIVE_POLL_MS : IDLE_POLL_MS);
  }, [trucks, onDuty]);

  const locate = async () => {
    setLocating(true);
    try {
      setMe(await getCurrentPosition());
    } catch (err) {
      toast.info(err.message);
    } finally {
      setLocating(false);
    }
  };

  const stopIcons = useMemo(() => {
    const cache = {};
    return (color) => (cache[color] ||= dotIcon(color, { size: 10, ring: '#0b0a1f' }));
  }, []);

  if (error && !trucks) {
    return (
      <div className="container-page py-16">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }
  if (!trucks) return <PageLoader label="Connecting to the fleet…" />;

  const selected = trucks.find((t) => t.id === selectedId);
  const flyTarget = selected ? { ...selected, key: selected.id } : me ? { ...me, key: 'me' } : null;
  const byId = Object.fromEntries(trucks.map((t) => [t.id, t]));
  const timetables = Object.fromEntries((routes || []).map((r) => [r.id, r.timetable]));

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col-reverse lg:flex-row">
      <aside className="h-[45%] w-full shrink-0 space-y-3 overflow-y-auto border-white/5 p-4 lg:h-full lg:w-[380px] lg:border-r">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl">
              <FiTruck className="text-brand-300" /> Live trucks
            </h1>
            <p className="text-xs text-ink-400">
              {onDuty > 0 ? `${onDuty} of ${trucks.length} trucks on their rounds` : `All ${trucks.length} trucks parked`} · Bengaluru
            </p>
          </div>
          <LiveBadge updatedAt={updatedAt} live={onDuty > 0} />
        </div>

        <FleetBanner trucks={trucks} />
        <NearYou me={me} trucks={trucks} routes={routes} onLocate={locate} locating={locating} onSelect={setSelectedId} />

        {[...trucks]
          .sort((a, b) => Number(b.onDuty) - Number(a.onDuty) || a.id - b.id)
          .map((t) => (
            <TruckCard
              key={t.id}
              truck={t}
              timetable={timetables[t.id]}
              selected={t.id === selectedId}
              onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
            />
          ))}
        <p className="px-1 pb-2 text-[11px] leading-relaxed text-ink-500">
          Trucks follow a daily timetable (IST): morning rounds start from 6:00 am, and the busy commercial routes run again in
          the afternoon. Solid lines show the road already covered this round. Routes follow real roads; the fleet is simulated.
        </p>
      </aside>

      <div className="relative min-h-0 flex-1 p-2 lg:p-3">
        <MapContainer center={[DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]} zoom={12} style={{ height: '100%', width: '100%' }}>
          <MapTiles />
          <GlideGuard />
          <FlyTo target={flyTarget} />
          {routes?.map((r) => (
            <RoutePath key={r.id} route={r} truck={byId[r.id]} selectedId={selectedId} onSelect={setSelectedId} />
          ))}
          {routes?.map((r) =>
            r.stops.map((s, i) => {
              const visit = byId[r.id]?.nextVisits?.find((v) => v.name === s.name);
              return (
                <Marker key={`${r.id}-${s.name}`} position={[s.lat, s.lng]} icon={stopIcons(r.color)}>
                  <Tooltip direction="top" offset={[0, -6]}>
                    <b>{s.name}</b>
                    {i === 0 ? ' · depot' : visit?.collectingNow ? ' · collecting now' : visit?.at ? ` · next pickup ${istWhen(visit.at, now)}` : ''}
                  </Tooltip>
                </Marker>
              );
            }),
          )}
          {trucks.map((t) => (
            <TruckMarker key={t.id} truck={t} selected={t.id === selectedId} onSelect={setSelectedId} />
          ))}
          {me && <Marker position={[me.lat, me.lng]} icon={ME_ICON} />}
        </MapContainer>
        <button
          type="button"
          onClick={locate}
          className="btn btn-secondary absolute bottom-8 right-6 z-[500] bg-ink-900/90 backdrop-blur"
          disabled={locating}
        >
          {locating ? <Spinner className="h-4 w-4" /> : <FiNavigation />} Near me
        </button>
      </div>
    </div>
  );
}
