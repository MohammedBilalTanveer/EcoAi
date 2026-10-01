import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import MapTiles from './MapTiles';
import { FiCrosshair, FiMapPin, FiSearch } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { api } from '../../lib/api';
import { DEFAULT_CENTER, getCurrentPosition } from '../../lib/geo';
import { pinIcon } from './icons';
import { Spinner } from '../ui';

function ClickToPlace({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FollowValue({ value }) {
  const map = useMap();
  const last = useRef(null);
  useEffect(() => {
    if (!value) return;
    const key = `${value.lat.toFixed(5)},${value.lng.toFixed(5)}`;
    if (last.current === key) return;
    last.current = key;
    const inView = map.getBounds().pad(-0.2).contains([value.lat, value.lng]);
    if (!inView) map.flyTo([value.lat, value.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [value, map]);
  return null;
}

const icon = pinIcon('#9b6ff1');

/**
 * Map-based location picker: click or drag the pin, search an address, or use GPS.
 * Calls onResolve(label) with a reverse-geocoded address whenever the pin moves.
 */
export default function LocationPicker({ value, onChange, onResolve, height = 340, autoLocate = true, hint }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const resolveRef = useRef(onResolve);
  resolveRef.current = onResolve;

  const locate = async ({ silent = false } = {}) => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      onChange({ lat: pos.lat, lng: pos.lng });
    } catch (err) {
      if (!silent) toast.info(err.message);
      if (!value) onChange(DEFAULT_CENTER);
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!value && autoLocate) locate({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reverse-geocode the pin (debounced) so the address fills itself in.
  useEffect(() => {
    if (!value || !resolveRef.current) return undefined;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api('/geo/reverse', { query: { lat: value.lat, lng: value.lng }, signal: ctrl.signal })
        .then((r) => r.label && resolveRef.current?.(r.label))
        .catch(() => {});
    }, 700);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  const search = async (e) => {
    e?.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const data = await api('/geo/search', { query: { q: query.trim() } });
      setResults(data.results);
      if (!data.results.length) toast.info('No places found. Try a landmark or area name.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSearching(false);
    }
  };

  const center = value || DEFAULT_CENTER;

  return (
    <div className="space-y-2">
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            className="input pl-9"
            placeholder="Search an area, street or landmark"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search(e)}
          />
        </div>
        <button type="button" className="btn btn-secondary" onClick={search} disabled={searching}>
          {searching ? <Spinner className="h-4 w-4" /> : 'Search'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => locate()}
          disabled={locating}
          title="Use my current location"
        >
          {locating ? <Spinner className="h-4 w-4" /> : <FiCrosshair />}
          <span className="hidden sm:inline">My location</span>
        </button>
        {results.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-[500] mt-1 overflow-hidden rounded-xl border border-white/10 bg-ink-850 shadow-2xl">
            {results.map((r) => (
              <li key={`${r.lat},${r.lng}`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/5"
                  onClick={() => {
                    onChange({ lat: r.lat, lng: r.lng });
                    setResults([]);
                    setQuery(r.label);
                  }}
                >
                  <FiMapPin className="mt-0.5 shrink-0 text-brand-300" />
                  <span>
                    <span className="block text-ink-100">{r.label}</span>
                    <span className="line-clamp-1 text-xs text-ink-500">{r.fullLabel}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10" style={{ height }}>
        <MapContainer center={[center.lat, center.lng]} zoom={value ? 15 : 12} style={{ height: '100%', width: '100%' }}>
          <MapTiles />
          <ClickToPlace onPick={onChange} />
          <FollowValue value={value} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={icon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const p = e.target.getLatLng();
                  onChange({ lat: p.lat, lng: p.lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="hint">{hint || 'Tap the map or drag the pin to the exact spot.'}</p>
    </div>
  );
}
