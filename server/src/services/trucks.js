import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLEET } from '../data/fleet.js';
import { bearing, haversine } from '../utils/geo.js';

/**
 * Deterministic, timetable-based truck simulation (Bengaluru time, IST).
 *
 * Each truck leaves its depot at fixed round times (see data/fleet.js), drives its
 * road-snapped route, spends a while collecting at every stop, drives back and
 * unloads. Outside its rounds it is parked at the depot. Position is a pure
 * function of the clock, so every client sees the same fleet with no background
 * loop or stored state.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_FILE = path.join(here, '..', 'data', 'truckRoutes.json');

const TZ_OFFSET_MS = 330 * 60 * 1000; // IST (UTC+5:30, no daylight saving)
const DAY_MS = 24 * 60 * 60 * 1000;
const COLLECT_SECONDS = 22 * 60; // door-to-door collection around each stop
const UNLOAD_SECONDS = 25 * 60; // weighing and unloading at the transfer station
const EMPTY_FILL = 4;
const FULL_FILL = 90;

function loadGeometry() {
  try {
    const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    return new Map(routes.map((r) => [r.id, r]));
  } catch {
    console.warn('[trucks] truckRoutes.json missing — using straight-line routes. Run npm run build:routes.');
    return new Map();
  }
}

const clockToSeconds = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h * 60 + m) * 60;
};
/** UTC timestamp of local (IST) midnight for the day containing `ms`. */
const localMidnight = (ms) => Math.floor((ms + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS;
/** "HH:MM" local time for seconds after local midnight. */
const clockLabel = (seconds) => {
  const m = Math.round(seconds / 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const iso = (ms) => new Date(ms).toISOString();

function buildTruck(def, geometry) {
  const geo = geometry.get(def.id);
  const points = geo?.points ?? [...def.stops, def.stops[0]].map((s) => [s.lat, s.lng]);
  const stopIndexes = geo?.stopIndexes ?? def.stops.map((_, i) => i);

  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1] + haversine({ lat: points[i - 1][0], lng: points[i - 1][1] }, { lat: points[i][0], lng: points[i][1] }));
  }
  const length = cum[cum.length - 1];
  const stopDist = stopIndexes.map((i) => cum[i]);
  const speed = 4.4 + (def.id % 3) * 0.3; // m/s, ~16–19 km/h in city traffic

  // One round: depot -> [drive, collect] x each stop -> drive back -> unload.
  const phases = [];
  let t = 0;
  for (let k = 1; k < def.stops.length; k += 1) {
    const duration = Math.max(1, (stopDist[k] - stopDist[k - 1]) / speed);
    phases.push({ kind: 'drive', to: k, from: stopDist[k - 1], dist: stopDist[k] - stopDist[k - 1], start: t, duration });
    t += duration;
    phases.push({ kind: 'collect', stop: k, start: t, duration: COLLECT_SECONDS });
    t += COLLECT_SECONDS;
  }
  const last = stopDist[def.stops.length - 1];
  const back = Math.max(1, (length - last) / speed);
  phases.push({ kind: 'return', to: 0, from: last, dist: length - last, start: t, duration: back });
  t += back;
  phases.push({ kind: 'unload', stop: 0, start: t, duration: UNLOAD_SECONDS });
  t += UNLOAD_SECONDS;

  const rounds = (def.rounds?.length ? def.rounds : ['06:00']).map((clock) => {
    const startSec = clockToSeconds(clock);
    return { startSec, label: startSec < 12 * 3600 ? 'Morning round' : 'Afternoon round' };
  });

  return { ...def, points, cum, length, stopDist, speed, phases, roundSeconds: t, rounds };
}

const geometry = loadGeometry();
const TRUCKS = FLEET.map((def) => buildTruck(def, geometry));

function positionAt(truck, d) {
  const { points, cum } = truck;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  const f = Math.min(1, Math.max(0, (d - cum[lo]) / span));
  const a = { lat: points[lo][0], lng: points[lo][1] };
  const b = { lat: points[hi][0], lng: points[hi][1] };
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, heading: Math.round(bearing(a, b)), index: lo };
}

/** Round instances (with absolute times) for the local day containing `ms`, plus the next day. */
function roundsAround(truck, ms) {
  const today = localMidnight(ms);
  return [today, today + DAY_MS].flatMap((day) =>
    truck.rounds.map((r) => ({
      label: r.label,
      startMs: day + r.startSec * 1000,
      endMs: day + (r.startSec + truck.roundSeconds) * 1000,
    })),
  );
}

/** When each collection stop is visited during a round starting at `startMs`. */
const stopTimes = (truck, startMs) =>
  truck.phases
    .filter((p) => p.kind === 'collect' || p.kind === 'unload')
    .map((p) => ({ name: truck.stops[p.stop].name, at: startMs + p.start * 1000, kind: p.kind, phase: p }));

function fillAt(truck, phase, elapsed) {
  const perStop = (FULL_FILL - EMPTY_FILL) / (truck.stops.length - 1);
  if (phase.kind === 'unload') return FULL_FILL - (FULL_FILL - EMPTY_FILL) * (elapsed / phase.duration);
  if (phase.kind === 'collect') return EMPTY_FILL + perStop * (phase.stop - 1 + elapsed / phase.duration);
  if (phase.kind === 'return') return FULL_FILL;
  return EMPTY_FILL + perStop * (phase.to - 1);
}

const roundInfo = (round) => round && { label: round.label, startsAt: iso(round.startMs), endsAt: iso(round.endMs) };

function snapshot(truck, nowMs) {
  const rounds = roundsAround(truck, nowMs);
  const active = rounds.find((r) => nowMs >= r.startMs && nowMs < r.endMs);
  const next = rounds.find((r) => r.startMs > nowMs);
  const lastDone = [...rounds].reverse().find((r) => r.endMs <= nowMs);
  const base = {
    id: truck.id,
    code: truck.code,
    driver: truck.driver,
    zone: truck.zone,
    color: truck.color,
    depot: truck.stops[0].name,
    capacityKg: truck.capacityKg,
    routeKm: Math.round(truck.length / 100) / 10,
    stopsTotal: truck.stops.length - 1,
    nextRound: roundInfo(next),
    lastRoundEndedAt: lastDone && lastDone.endMs > localMidnight(nowMs) ? iso(lastDone.endMs) : null,
  };

  // Next visit to every collection stop: later in this round if still ahead, else next round.
  const nextVisits = truck.stops.slice(1).map((stop) => {
    const inRound = active && stopTimes(truck, active.startMs).find((s) => s.name === stop.name && s.at + COLLECT_SECONDS * 1000 > nowMs);
    const later = rounds.find((r) => r.startMs > nowMs);
    const at = inRound ? inRound.at : later ? stopTimes(truck, later.startMs).find((s) => s.name === stop.name).at : null;
    return { name: stop.name, at: at && iso(at), collectingNow: Boolean(inRound && inRound.at <= nowMs) };
  });

  if (!active) {
    const [lng, lat] = [truck.points[0][1], truck.points[0][0]];
    const plan = next ? stopTimes(truck, next.startMs) : [];
    return {
      ...base,
      onDuty: false,
      lat,
      lng,
      heading: 0,
      speedKmh: 0,
      status: 'off_duty',
      round: null,
      currentStop: null,
      nextStop: plan[0] ? { name: plan[0].name, at: iso(plan[0].at), etaSec: Math.round((plan[0].at - nowMs) / 1000) } : null,
      upcoming: plan.slice(0, 4).map((s) => ({ name: s.name, at: iso(s.at), etaSec: Math.round((s.at - nowMs) / 1000) })),
      schedule: plan.map((s) => ({ name: s.name, at: iso(s.at), kind: s.kind, state: 'upcoming' })),
      nextVisits,
      fillPercent: EMPTY_FILL,
      loadKg: Math.round((truck.capacityKg * EMPTY_FILL) / 100),
      progressPct: 0,
      pathIndex: -1,
      stopsDone: 0,
    };
  }

  const t = (nowMs - active.startMs) / 1000;
  const index = truck.phases.findIndex((p) => t >= p.start && t < p.start + p.duration);
  const phase = truck.phases[index === -1 ? truck.phases.length - 1 : index];
  const elapsed = t - phase.start;
  const moving = phase.kind === 'drive' || phase.kind === 'return';
  const distance = moving ? phase.from + (elapsed / phase.duration) * phase.dist : phase.kind === 'unload' ? truck.length : truck.stopDist[phase.stop];
  const pos = positionAt(truck, distance);

  const plan = stopTimes(truck, active.startMs);
  const schedule = plan.map((s) => {
    const end = s.at + s.phase.duration * 1000;
    return { name: s.name, at: iso(s.at), kind: s.kind, state: end <= nowMs ? 'done' : s.at <= nowMs ? 'current' : 'upcoming' };
  });
  const upcoming = plan
    .filter((s) => s.at > nowMs)
    .slice(0, 4)
    .map((s) => ({ name: s.name, at: iso(s.at), etaSec: Math.round((s.at - nowMs) / 1000) }));
  const fill = Math.round(fillAt(truck, phase, elapsed));
  const status = { drive: 'en_route', collect: 'collecting', return: 'returning', unload: 'unloading' }[phase.kind];

  return {
    ...base,
    onDuty: true,
    lat: Math.round(pos.lat * 1e6) / 1e6,
    lng: Math.round(pos.lng * 1e6) / 1e6,
    heading: pos.heading,
    speedKmh: moving ? Math.round(truck.speed * 3.6) : 0,
    status,
    round: roundInfo(active),
    currentStop: moving ? null : truck.stops[phase.stop].name,
    nextStop: upcoming[0] ?? null,
    upcoming,
    schedule,
    nextVisits,
    fillPercent: fill,
    loadKg: Math.round((truck.capacityKg * fill) / 100),
    progressPct: Math.round((distance / truck.length) * 100),
    // Route points up to this index (plus the truck's position) have been driven.
    pathIndex: pos.index,
    stopsDone: schedule.filter((s) => s.kind === 'collect' && s.state === 'done').length,
  };
}

export const truckLocations = (nowMs = Date.now()) => TRUCKS.map((truck) => snapshot(truck, nowMs));

/** Route geometry plus the daily timetable (local IST clock times). */
export const truckRoutes = () =>
  TRUCKS.map((truck) => ({
    id: truck.id,
    code: truck.code,
    color: truck.color,
    zone: truck.zone,
    points: truck.points,
    stops: truck.stops,
    timetable: truck.rounds.map((r) => ({
      label: r.label,
      start: clockLabel(r.startSec),
      end: clockLabel(r.startSec + truck.roundSeconds),
      stops: truck.phases
        .filter((p) => p.kind === 'collect')
        .map((p) => ({ name: truck.stops[p.stop].name, time: clockLabel(r.startSec + p.start) })),
    })),
  }));
