import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, Popup } from 'react-leaflet';
import MapTiles from '../../components/map/MapTiles';
import { FiAlertTriangle, FiCheckCircle, FiClock, FiGrid, FiList, FiMap, FiSearch, FiZap } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { AiDecisionBadge } from '../../components/AiCheck';
import { dotIcon } from '../../components/map/icons';
import { Avatar, Badge, cx, EmptyState, ErrorState, PageHeader, Spinner, StatCard, StatusBadge, Tabs } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { dateTime, LISTING_STATUS, number, REPORT_CATEGORY, REPORT_STATUS, SEVERITY, timeAgo } from '../../lib/format';
import { DEFAULT_CENTER } from '../../lib/geo';

const icons = {};
const sevIcon = (s) => (icons[s] ||= dotIcon(SEVERITY[s]?.color || '#94a3b8', { size: 16 }));

function niceStep(max) {
  if (max <= 5) return 1;
  if (max <= 10) return 2;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw);
}

/** Single-series column chart of reports per day, with hover/focus tooltips and a table view. */
function DailyChart({ days }) {
  const [hover, setHover] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const max = Math.max(1, ...days.map((d) => d.count));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const peak = days.reduce((best, d, i) => (d.count > days[best].count ? i : best), 0);
  const label = (iso, opts) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', opts);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-base">Reports submitted</h3>
          <p className="text-xs text-ink-400">Last 14 days · {number(days.reduce((s, d) => s + d.count, 0))} total</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTable((v) => !v)}>
          {showTable ? <FiGrid /> : <FiList />} {showTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-52 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500">
              <tr>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 text-right font-medium">Reports</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 tabular-nums">
              {days.map((d) => (
                <tr key={d.date}>
                  <td className="py-1.5 text-ink-300">{label(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td className="py-1.5 text-right text-ink-100">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2 pt-3">
          <div className="relative h-44 w-6 shrink-0 text-right text-[10px] tabular-nums text-ink-500">
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
                {t}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-44">
              {ticks.map((t) => (
                <span key={t} className="absolute inset-x-0 h-px bg-white/[0.06]" style={{ bottom: `${(t / top) * 100}%` }} />
              ))}
              <div className="absolute inset-0 flex items-end gap-[2px]">
                {days.map((d, i) => (
                  <button
                    key={d.date}
                    type="button"
                    className="group relative flex h-full flex-1 items-end justify-center outline-none"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    aria-label={`${label(d.date, { day: 'numeric', month: 'short' })}: ${d.count} reports`}
                  >
                    <span
                      className={cx('w-full max-w-[24px] rounded-t-[4px] transition', hover === i ? 'bg-brand-300' : 'bg-brand-400')}
                      style={{ height: `${(d.count / top) * 100}%` }}
                    />
                    {i === peak && d.count > 0 && hover !== i && (
                      <span
                        className="absolute text-[10px] font-semibold tabular-nums text-ink-200"
                        style={{ bottom: `calc(${(d.count / top) * 100}% + 4px)` }}
                      >
                        {d.count}
                      </span>
                    )}
                    {hover === i && (
                      <span
                        className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-white/10 bg-ink-850 px-2.5 py-1.5 text-left shadow-xl"
                        style={{ bottom: `calc(${(d.count / top) * 100}% + 8px)` }}
                      >
                        <span className="block text-sm font-bold text-white">{d.count} reports</span>
                        <span className="block text-[11px] text-ink-400">{label(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex gap-[2px] text-[10px] text-ink-500">
              {days.map((d, i) => (
                <span key={d.date} className="flex-1 text-center">
                  {i % 2 === 0 ? label(d.date, { day: 'numeric', month: 'short' }) : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SeverityBreakdown({ counts }) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0) || 1;
  return (
    <div className="card p-5">
      <h3 className="text-base">Open reports by severity</h3>
      <p className="mb-4 text-xs text-ink-400">Pending + in progress</p>
      <div className="space-y-3">
        {['critical', 'high', 'medium', 'low'].map((s) => (
          <div key={s}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="flex items-center gap-2 text-ink-200">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY[s].color }} />
                {SEVERITY[s].label}
              </span>
              <span className="font-semibold tabular-nums text-white">{counts[s] || 0}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${((counts[s] || 0) / total) * 100}%`, background: SEVERITY[s].color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsTab({ stats }) {
  const [filters, setFilters] = useState({ status: '', severity: '', category: '', ai: '', q: '', sort: 'newest', page: 1 });
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list');
  const query = useMemo(() => ({ ...filters, limit: view === 'map' ? 200 : 15, page: view === 'map' ? 1 : filters.page }), [filters, view]);
  const { data, error, loading, reload } = useApi('/staff/reports', { query, pollMs: 60000 });
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value, page: 1 }));
  const s = stats?.reports;
  const open = s ? s.byStatus.pending + s.byStatus.in_progress : 0;

  return (
    <div className="space-y-6">
      {s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={FiAlertTriangle} label="Open reports" value={number(open)} sub={`${s.openBySeverity.critical} critical · ${s.openBySeverity.high} high`} tone="rose" />
            <StatCard icon={FiClock} label="Awaiting review" value={number(s.byStatus.pending)} sub="status: pending" tone="amber" />
            <StatCard
              icon={FiCheckCircle}
              label="Resolved"
              value={number(s.byStatus.resolved)}
              sub={s.avgResolutionHours != null ? `avg ${s.avgResolutionHours}h to resolve` : 'no resolutions yet'}
            />
            <StatCard
              icon={FiZap}
              label="AI photo check"
              value={`${number(s.screening?.passed)} passed`}
              sub={`${number(s.screening?.rejected)} rejected · ${number(s.screening?.review)} need review`}
              tone="violet"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <DailyChart days={s.daily} />
            <SeverityBreakdown counts={s.openBySeverity} />
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-[200px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters((f) => ({ ...f, q: search.trim(), page: 1 }));
          }}
        >
          <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
          <input className="input pl-10" placeholder="Search description or address" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <select className="input w-auto" value={filters.status} onChange={set('status')} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(REPORT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={filters.severity} onChange={set('severity')} aria-label="Severity">
          <option value="">All severities</option>
          {Object.entries(SEVERITY).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={filters.category} onChange={set('category')} aria-label="Category">
          <option value="">All types</option>
          {Object.entries(REPORT_CATEGORY).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={filters.ai} onChange={set('ai')} aria-label="AI photo check">
          <option value="">AI check: any</option>
          <option value="passed">Passed</option>
          <option value="rejected">Rejected</option>
          <option value="review">Needs review</option>
        </select>
        <select className="input w-auto" value={filters.sort} onChange={set('sort')} aria-label="Sort">
          <option value="newest">Newest first</option>
          <option value="severity">Most severe first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <div className="flex rounded-xl bg-white/[0.04] p-1">
          {[
            { v: 'list', icon: FiList },
            { v: 'map', icon: FiMap },
          ].map(({ v, icon: Icon }) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cx('rounded-lg px-3 py-1.5 text-sm', view === v ? 'bg-ink-700 text-white' : 'text-ink-400')}
              aria-label={`${v} view`}
            >
              <Icon />
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <div className="skeleton h-96" />
      ) : view === 'map' ? (
        <div className="h-[60vh] overflow-hidden rounded-2xl border border-white/10">
          <MapContainer center={[DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]} zoom={12} style={{ height: '100%' }}>
            <MapTiles />
            {data.reports.map((r) => (
              <Marker key={r.id} position={[r.lat, r.lng]} icon={sevIcon(r.severity)}>
                <Popup>
                  <p className="font-semibold">
                    {REPORT_CATEGORY[r.category]?.emoji} {REPORT_CATEGORY[r.category]?.label} · {SEVERITY[r.severity]?.label}
                  </p>
                  <p className="text-xs text-ink-400">{r.address || 'No address'} · {timeAgo(r.createdAt)}</p>
                  <Link to={`/staff/report/${r.id}`} className="mt-1 inline-block text-xs font-semibold text-brand-300">
                    Review →
                  </Link>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      ) : data.reports.length === 0 ? (
        <EmptyState icon={FiCheckCircle} title="No reports match these filters" />
      ) : (
        <div className={cx('card overflow-hidden transition', loading && 'opacity-60')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Report</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">AI</th>
                  <th className="px-4 py-3 font-medium">Reported</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.reports.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={r.image} alt="" className="h-11 w-14 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">
                            {REPORT_CATEGORY[r.category]?.emoji} {REPORT_CATEGORY[r.category]?.label}
                          </p>
                          <p className="max-w-xs truncate text-xs text-ink-400">{r.address || r.description || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={SEVERITY[r.severity]?.tone}>{SEVERITY[r.severity]?.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge map={REPORT_STATUS} value={r.status} />
                    </td>
                    <td className="px-4 py-3" title={r.screening.reason}>
                      <AiDecisionBadge screening={r.screening} />
                      {r.ai.analyzed && (
                        <span className="ml-1.5 text-xs tabular-nums text-ink-500">{Math.round(r.ai.confidence * 100)}%</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={r.user?.name} src={r.user?.avatar} size="h-6 w-6" />
                        <span className="text-ink-300" title={dateTime(r.createdAt)}>
                          {timeAgo(r.createdAt)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/staff/report/${r.id}`} className="btn btn-secondary btn-sm">
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-sm text-ink-400">
            <span>
              {number(data.total)} reports · page {data.page} of {data.pages}
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary btn-sm" disabled={data.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
                Previous
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={data.page >= data.pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const DECISION_TEXT = { passed: 'text-emerald-300/90', rejected: 'text-rose-300', review: 'text-amber-200' };

function FoodTab({ stats, onChanged }) {
  const [decision, setDecision] = useState('');
  const { data, error, reload } = useApi('/staff/food', { query: { ai: decision } });
  const checks = stats?.food.screening;
  const [busy, setBusy] = useState(null);

  const act = async (listing, action) => {
    setBusy(`${listing.id}:${action}`);
    try {
      await api(`/staff/food/${listing.id}`, { method: 'PATCH', body: { action } });
      toast.success(
        action === 'remove' ? 'Listing removed.' : listing.flagged ? 'Approved and published — nearby NGOs alerted.' : 'Photo check confirmed.',
      );
      reload({ silent: true });
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs
        className="w-fit"
        value={decision}
        onChange={setDecision}
        tabs={[
          { value: '', label: 'All listings' },
          { value: 'rejected', label: 'Held by AI', count: checks?.rejected || undefined },
          { value: 'review', label: 'Needs review', count: checks?.review || undefined },
          { value: 'passed', label: 'Passed' },
        ]}
      />
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <div className="skeleton h-64" />
      ) : data.listings.length === 0 ? (
        <EmptyState icon={FiCheckCircle} title={decision ? 'Nothing here' : 'No food listings yet'}>
          Listings whose photo fails the AI check are held here, unpublished, until staff approve them.
        </EmptyState>
      ) : (
        <div className="card divide-y divide-white/5">
          {data.listings.map((l) => (
            <div key={l.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <Link to={`/food/${l.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                <img src={l.images[0]} alt="" className="h-14 w-16 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-white">{l.title}</p>
                    <AiDecisionBadge screening={l.screening} />
                    {l.flagged && <Badge tone="slate">Not published</Badge>}
                  </div>
                  <p className="truncate text-xs text-ink-400">
                    {l.donor?.organization || l.donor?.name} · {timeAgo(l.createdAt)} · {l.quantity.total} {l.quantity.unit}
                    {!l.flagged && ` · ${l.notifiedNgos} NGO${l.notifiedNgos === 1 ? '' : 's'} alerted`}
                  </p>
                  {l.screening.reason && (
                    <p className={cx('mt-0.5 line-clamp-2 text-xs', DECISION_TEXT[l.screening.decision])}>
                      {l.screening.source === 'staff' ? 'Staff: ' : 'AI: '}
                      {l.screening.reason}
                      {l.ai.analyzed && l.screening.source === 'ai' ? ` (${Math.round(l.ai.confidence * 100)}% confident)` : ''}
                    </p>
                  )}
                </div>
              </Link>
              <div className="flex items-center gap-2">
                <StatusBadge map={LISTING_STATUS} value={l.status} />
                {(l.flagged || (l.screening.decision === 'review' && ['available', 'reserved'].includes(l.status))) && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => act(l, 'approve')} disabled={Boolean(busy)}>
                    {busy === `${l.id}:approve` ? <Spinner className="h-3 w-3" /> : l.flagged ? 'Approve & publish' : 'Looks fine'}
                  </button>
                )}
                {['available', 'reserved'].includes(l.status) && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => act(l, 'remove')} disabled={Boolean(busy)}>
                    {busy === `${l.id}:remove` ? <Spinner className="h-3 w-3" /> : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StaffDashboard() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'food' ? 'food' : 'reports';
  const { data: stats, reload } = useApi('/staff/stats', { pollMs: 60000 });

  return (
    <div className="container-page py-10">
      <PageHeader
        eyebrow="Staff portal"
        title="City operations"
        subtitle="Review illegal dumping reports, update residents on progress and moderate food listings."
        actions={
          <Link to="/live-map" className="btn btn-secondary">
            <FiMap /> Live trucks
          </Link>
        }
      />
      <Tabs
        className="mb-6 w-fit"
        value={tab}
        onChange={(v) => setParams(v === 'food' ? { tab: 'food' } : {})}
        tabs={[
          { value: 'reports', label: 'Dumping reports' },
          { value: 'food', label: 'Food moderation', count: stats?.food.flagged || undefined },
        ]}
      />
      {tab === 'reports' ? <ReportsTab stats={stats} /> : <FoodTab stats={stats} onChanged={() => reload({ silent: true })} />}
    </div>
  );
}
