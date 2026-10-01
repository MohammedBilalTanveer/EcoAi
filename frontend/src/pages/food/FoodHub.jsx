import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Circle, MapContainer, Marker, useMap } from 'react-leaflet';
import MapTiles from '../../components/map/MapTiles';
import { FiCrosshair, FiGrid, FiMap, FiPlus, FiSearch, FiShoppingBag } from 'react-icons/fi';
import { toast } from 'react-toastify';
import ListingCard from '../../components/food/ListingCard';
import { priceIcon, userIcon } from '../../components/map/icons';
import { Alert, cx, EmptyState, ErrorState, PageHeader, Segmented, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { compact, DIET, money } from '../../lib/format';
import { DEFAULT_CENTER, getCurrentPosition } from '../../lib/geo';

const RADII = [2, 5, 10, 25, 50];
const ME_ICON = userIcon();
const SORTS = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'ending', label: 'Ending soon' },
  { value: 'discount', label: 'Biggest discount' },
  { value: 'newest', label: 'Newest' },
];

function FitMap({ center, radiusKm, listings }) {
  const map = useMap();
  // Only refit when the set of listings changes, not on every background refresh.
  const key = listings.map((l) => l.id).join(',');
  useEffect(() => {
    // Wait a tick so the sticky container has its final size before fitting.
    const t = setTimeout(() => {
      map.invalidateSize();
      if (listings.length) {
        const pts = listings.map((l) => [l.location.lat, l.location.lng]);
        pts.push([center.lat, center.lng]);
        map.fitBounds(pts, { padding: [48, 48], maxZoom: 15 });
      } else {
        map.setView([center.lat, center.lng], radiusKm > 10 ? 11 : 13);
      }
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, center, radiusKm, key]);
  return null;
}

function ImpactStrip() {
  const { data } = useApi('/stats/public');
  if (!data) return null;
  const f = data.food;
  const items = [
    { label: 'meals rescued', value: compact(f.meals) },
    { label: 'kg food saved', value: compact(f.kg) },
    { label: 'kg CO₂ avoided', value: compact(f.co2Kg) },
    { label: 'available right now', value: f.availableNow },
  ];
  return (
    <div className="card mb-6 grid grid-cols-2 divide-white/5 overflow-hidden sm:grid-cols-4 sm:divide-x">
      {items.map((i) => (
        <div key={i.label} className="px-5 py-4">
          <p className="text-2xl font-bold text-white">{i.value}</p>
          <p className="text-xs text-ink-400">{i.label}</p>
        </div>
      ))}
    </div>
  );
}

export default function FoodHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [center, setCenter] = useState(user?.location || null);
  const [placeLabel, setPlaceLabel] = useState(user?.location ? user.address || 'your saved location' : '');
  const [locating, setLocating] = useState(false);
  const [view, setView] = useState('list');
  const [hovered, setHovered] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ diet: '', audience: '', maxPrice: '', radiusKm: 10, sort: 'nearest', q: '' });

  const locate = async ({ silent } = {}) => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      setCenter({ lat: pos.lat, lng: pos.lng });
      setPlaceLabel('your current location');
    } catch (err) {
      if (!silent) toast.info(err.message);
      if (!center) {
        setCenter(DEFAULT_CENTER);
        setPlaceLabel('Bengaluru');
      }
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!center) locate({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = useMemo(
    () => (center ? { ...filters, lat: center.lat.toFixed(5), lng: center.lng.toFixed(5) } : null),
    [center, filters],
  );
  const { data, error, loading, reload } = useApi(center ? '/food' : null, { query, pollMs: 60000 });
  const listings = useMemo(() => data?.listings || [], [data]);
  const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const isDonor = user && ['restaurant', 'citizen'].includes(user.role);

  const markers = useMemo(
    () =>
      listings.map((l) => ({
        l,
        icon: priceIcon(l.pricing.isFree ? 'Free' : money(l.pricing.offer), {
          color: l.pricing.isFree ? '#9b6ff1' : '#fcd34d',
          active: hovered === l.id,
        }),
      })),
    [listings, hovered],
  );

  return (
    <div className="container-page py-10">
      <PageHeader
        eyebrow="Food rescue marketplace"
        title="Surplus food near you"
        subtitle="Restaurants share extra food at a big discount or free for NGOs. Reserve a portion, get a pickup code, collect before the window closes."
        actions={
          <>
            {user && (
              <Link to="/food/dashboard" className="btn btn-secondary">
                <FiShoppingBag /> My food activity
              </Link>
            )}
            {(isDonor || !user) && (
              <Link to="/food/new" className="btn btn-primary">
                <FiPlus /> Share surplus food
              </Link>
            )}
          </>
        }
      />

      <ImpactStrip />

      {user?.role === 'ngo' && !user.location && (
        <Alert tone="amber" className="mb-6">
          Set your NGO’s location to get instant alerts when food is listed nearby.{' '}
          <Link to="/profile" className="font-semibold underline">
            Update profile
          </Link>
        </Alert>
      )}

      <div className="card mb-6 space-y-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <form
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              set('q')(search.trim());
            }}
          >
            <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              className="input pl-10"
              placeholder="Search biryani, bread, rice…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => set('q')(search.trim())}
            />
          </form>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-400">Within</span>
            <select className="input w-auto py-2" value={filters.radiusKm} onChange={(e) => set('radiusKm')(Number(e.target.value))}>
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
            <span className="text-ink-400">of</span>
            <button type="button" className="btn btn-secondary py-2" onClick={() => locate()} disabled={locating}>
              {locating ? <Spinner className="h-4 w-4" /> : <FiCrosshair />}
              <span className="max-w-[12rem] truncate">{placeLabel || 'your location'}</span>
            </button>
            <select className="input w-auto py-2" value={filters.sort} onChange={(e) => set('sort')(e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Segmented
              value={filters.audience}
              onChange={set('audience')}
              options={[
                { value: '', label: 'All offers' },
                { value: 'ngo', label: 'Free for NGOs' },
                { value: 'public', label: 'Discounted' },
              ]}
            />
            <span className="mx-1 hidden w-px bg-white/10 sm:block" />
            <Segmented
              value={filters.diet}
              onChange={set('diet')}
              options={[
                { value: '', label: 'Any diet' },
                { value: 'veg', label: DIET.veg.label },
                { value: 'non_veg', label: DIET.non_veg.label },
                { value: 'vegan', label: DIET.vegan.label },
              ]}
            />
          </div>
          <div className="flex rounded-xl bg-white/[0.04] p-1 lg:hidden">
            {[
              { v: 'list', icon: FiGrid, label: 'List' },
              { v: 'map', icon: FiMap, label: 'Map' },
            ].map(({ v, icon: Icon, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold', view === v ? 'bg-ink-700 text-white' : 'text-ink-400')}
              >
                <Icon /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,420px)] xl:grid-cols-[1fr_minmax(0,480px)]">
        <div className={cx(view === 'map' && 'hidden lg:block')}>
          <p className="mb-3 text-sm text-ink-400">
            {loading ? 'Finding food…' : `${listings.length} listing${listings.length === 1 ? '' : 's'} available`}
          </p>
          {error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : loading && !data ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-80" />
              ))}
            </div>
          ) : listings.length === 0 ? (
            <EmptyState
              icon={FiShoppingBag}
              title="No surplus food nearby right now"
              action={
                filters.radiusKm < 50 && (
                  <button type="button" className="btn btn-secondary" onClick={() => set('radiusKm')(50)}>
                    Search within 50 km
                  </button>
                )
              }
            >
              {user?.role === 'ngo'
                ? `We'll notify you the moment a restaurant within your alert radius lists food.`
                : 'Listings appear here as soon as restaurants share them. Try a wider area or different filters.'}
            </EmptyState>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {listings.map((l) => (
                <ListingCard key={l.id} listing={l} active={hovered === l.id} onHover={setHovered} />
              ))}
            </div>
          )}
        </div>

        <div className={cx('lg:block', view === 'list' && 'hidden')}>
          <div className="sticky top-20 h-[70vh] overflow-hidden rounded-2xl border border-white/10 lg:h-[calc(100vh-7rem)]">
            {center && (
              <MapContainer center={[center.lat, center.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
                <MapTiles />
                <FitMap center={center} radiusKm={filters.radiusKm} listings={listings} />
                <Circle
                  center={[center.lat, center.lng]}
                  radius={filters.radiusKm * 1000}
                  pathOptions={{ color: '#9b6ff1', weight: 1, fillOpacity: 0.04, dashArray: '4 6' }}
                />
                <Marker position={[center.lat, center.lng]} icon={ME_ICON} />
                {markers.map(({ l, icon }) => (
                  <Marker
                    key={l.id}
                    position={[l.location.lat, l.location.lng]}
                    icon={icon}
                    zIndexOffset={hovered === l.id ? 1000 : 0}
                    eventHandlers={{
                      click: () => navigate(`/food/${l.id}`),
                      mouseover: () => setHovered(l.id),
                      mouseout: () => setHovered(null),
                    }}
                  />
                ))}
              </MapContainer>
            )}
          </div>
        </div>
      </div>

      {!user && (
        <div className="card mt-10 flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-lg">Are you an NGO or a restaurant?</h3>
            <p className="text-sm text-ink-400">Create a free account to reserve food or start sharing your surplus.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/signup?role=ngo" className="btn btn-secondary">
              I’m an NGO
            </Link>
            <Link to="/signup?role=restaurant" className="btn btn-primary">
              I’m a restaurant
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
