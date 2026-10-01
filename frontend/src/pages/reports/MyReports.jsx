import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Popup } from 'react-leaflet';
import MapTiles from '../../components/map/MapTiles';
import { FiAlertTriangle, FiChevronDown, FiMapPin, FiPlus } from 'react-icons/fi';
import { AiCheckPanel, AiDecisionBadge } from '../../components/AiCheck';
import { dotIcon } from '../../components/map/icons';
import { Badge, cx, EmptyState, ErrorState, PageHeader, StatusBadge, Tabs } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { dateTime, REPORT_CATEGORY, REPORT_STATUS, SEVERITY, timeAgo } from '../../lib/format';
import { DEFAULT_CENTER } from '../../lib/geo';

const iconCache = {};
const severityIcon = (sev) => (iconCache[sev] ||= dotIcon(SEVERITY[sev]?.color || '#94a3b8', { size: 16 }));

function Timeline({ history }) {
  return (
    <ol className="relative ml-2 space-y-4 border-l border-white/10 pl-5">
      {history.map((h, i) => (
        <li key={i} className="relative">
          <span
            className={cx(
              'absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-ink-900',
              i === history.length - 1 ? 'bg-brand-400' : 'bg-ink-500',
            )}
          />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge map={REPORT_STATUS} value={h.status} dot={false} />
            <span className="text-xs text-ink-500">{dateTime(h.at)}</span>
          </div>
          {h.note && <p className="mt-1 text-sm text-ink-300">{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}

function ReportItem({ report }) {
  const [open, setOpen] = useState(false);
  const cat = REPORT_CATEGORY[report.category];
  const latestNote = [...report.history].reverse().find((h) => h.note && h.note !== 'Report submitted');
  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full gap-4 p-4 text-left">
        <img src={report.image} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge map={REPORT_STATUS} value={report.status} />
            <Badge tone={SEVERITY[report.severity]?.tone}>{SEVERITY[report.severity]?.label}</Badge>
            <AiDecisionBadge screening={report.screening} />
          </div>
          <p className="mt-2 truncate font-semibold text-white">
            {cat?.emoji} {cat?.label}
            {report.description ? ` — ${report.description}` : ''}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink-400">
            <FiMapPin className="shrink-0" /> {report.address || `${report.lat.toFixed(4)}, ${report.lng.toFixed(4)}`} ·{' '}
            {timeAgo(report.createdAt)}
          </p>
          {latestNote && !open && <p className="mt-1 truncate text-xs text-brand-200">Update: {latestNote.note}</p>}
        </div>
        <FiChevronDown className={cx('mt-1 shrink-0 text-ink-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-6 border-t border-white/5 p-5 md:grid-cols-2">
          <div className="space-y-5">
            <AiCheckPanel
              ai={report.ai}
              screening={report.screening}
              outcome={report.authorityNotified ? 'Sent to the city authority.' : undefined}
            />
            <div>
              <p className="mb-3 text-sm font-semibold text-white">Progress</p>
              <Timeline history={report.history} />
            </div>
          </div>
          <div className="h-48 overflow-hidden rounded-xl">
            <MapContainer center={[report.lat, report.lng]} zoom={15} style={{ height: '100%' }} scrollWheelZoom={false}>
              <MapTiles />
              <Marker position={[report.lat, report.lng]} icon={severityIcon(report.severity)} />
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function CommunityMap() {
  const [status, setStatus] = useState('open');
  const { data, error, reload } = useApi('/reports/map', { query: { status } });
  const reports = data?.reports || [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            { value: 'open', label: 'Open' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'all', label: 'All (90 days)' },
          ]}
        />
        <div className="flex flex-wrap gap-3 text-xs text-ink-400">
          {Object.entries(SEVERITY).map(([k, s]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="h-[60vh] overflow-hidden rounded-2xl border border-white/10">
          <MapContainer center={[DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]} zoom={12} style={{ height: '100%' }}>
            <MapTiles />
            {reports.map((r) => (
              <Marker key={r.id} position={[r.lat, r.lng]} icon={severityIcon(r.severity)}>
                <Popup>
                  <p className="font-semibold">
                    {REPORT_CATEGORY[r.category]?.emoji} {REPORT_CATEGORY[r.category]?.label}
                  </p>
                  <p className="text-xs text-ink-400">
                    {SEVERITY[r.severity]?.label} · {REPORT_STATUS[r.status]?.label} · {timeAgo(r.createdAt)}
                  </p>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
      <p className="text-xs text-ink-500">{reports.length} reports shown. Reporter identities are never shown on the public map.</p>
    </div>
  );
}

export default function MyReports() {
  const [tab, setTab] = useState('mine');
  const { data, error, loading, reload } = useApi('/reports/mine', { pollMs: 60000 });
  const counts = data?.counts;

  return (
    <div className="container-page py-10">
      <PageHeader
        eyebrow="Illegal dumping"
        title="My reports"
        subtitle="Follow each report from submission to cleanup, and see what’s been reported around the city."
        actions={
          <Link to="/report-waste" className="btn btn-primary">
            <FiPlus /> New report
          </Link>
        }
      />

      <Tabs
        className="mb-6 w-fit"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'mine', label: 'My reports', count: counts?.total },
          { value: 'map', label: 'Community map' },
        ]}
      />

      {tab === 'map' ? (
        <CommunityMap />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
      ) : data.reports.length === 0 ? (
        <EmptyState
          icon={FiAlertTriangle}
          title="You haven’t reported anything yet"
          action={
            <Link to="/report-waste" className="btn btn-primary">
              Report dumping
            </Link>
          }
        >
          Seen garbage dumped on a street, lake or empty plot? Report it in 30 seconds.
        </EmptyState>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {Object.entries(REPORT_STATUS).map(([k, s]) => (
              <Badge key={k} tone={s.tone}>
                {counts[k]} {s.label.toLowerCase()}
              </Badge>
            ))}
          </div>
          <div className="space-y-3">
            {data.reports.map((r) => (
              <ReportItem key={r.id} report={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
