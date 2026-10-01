/**
 * Snaps each simulated truck route to real roads using the public OSRM demo
 * server and writes src/data/truckRoutes.json. Run once (npm run build:routes);
 * the server falls back to straight lines if the file is missing.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLEET } from '../src/data/fleet.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'src', 'data', 'truckRoutes.json');
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sq = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

async function buildRoute(truck) {
  const loop = [...truck.stops, truck.stops[0]];
  const coords = loop.map((s) => `${s.lng},${s.lat}`).join(';');
  const res = await fetch(`${OSRM}/${coords}?overview=full&geometries=geojson`, {
    headers: { 'User-Agent': 'EcoAI-route-builder/1.0' },
  });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = await res.json();
  if (json.code !== 'Ok') throw new Error(`OSRM ${json.code}`);

  // geometry is [lng, lat]; store as [lat, lng] rounded to ~1m.
  const points = json.routes[0].geometry.coordinates.map(([lng, lat]) => [
    Math.round(lat * 1e5) / 1e5,
    Math.round(lng * 1e5) / 1e5,
  ]);

  // Locate each (snapped) stop along the geometry, moving forward only.
  const stopIndexes = [];
  let from = 0;
  for (const wp of json.waypoints.slice(0, -1)) {
    const target = [wp.location[1], wp.location[0]];
    let best = from;
    for (let i = from; i < points.length; i += 1) {
      if (sq(points[i], target) < sq(points[best], target)) best = i;
    }
    stopIndexes.push(best);
    from = best;
  }
  return { id: truck.id, points, stopIndexes, distance: json.routes[0].distance };
}

const routes = [];
for (const truck of FLEET) {
  process.stdout.write(`Routing truck ${truck.id} (${truck.zone})... `);
  const route = await buildRoute(truck);
  console.log(`${route.points.length} points, ${(route.distance / 1000).toFixed(1)} km`);
  routes.push(route);
  await sleep(1200); // be polite to the free demo server
}
await fs.writeFile(OUT, JSON.stringify(routes));
console.log(`Wrote ${OUT}`);
