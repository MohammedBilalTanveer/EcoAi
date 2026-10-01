import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapContainer, Marker } from 'react-leaflet';
import MapTiles from '../../components/map/MapTiles';
import { FiArrowLeft, FiCheck, FiMail, FiMapPin, FiNavigation, FiPhone, FiX } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { AiCheckPanel } from '../../components/AiCheck';
import { dotIcon } from '../../components/map/icons';
import { Alert, Avatar, Badge, cx, ErrorState, PageLoader, Spinner, StatusBadge } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { dateTime, REPORT_CATEGORY, REPORT_STATUS, SEVERITY, timeAgo } from '../../lib/format';
import { directionsUrl } from '../../lib/geo';

const QUICK_NOTES = {
  in_progress: ['Cleanup crew assigned.', 'Inspection scheduled for tomorrow.'],
  resolved: ['Site cleared and cleaned.', 'Site cleared; offender fined.'],
  rejected: ['Duplicate of an existing report.', 'Not illegal dumping — regular collection point.'],
  pending: ['Waiting for more information.'],
};

/** The AI photo check, with buttons for staff to confirm or overturn it. */
function ScreeningCard({ report: r, onChange }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const decision = r.screening.decision;

  const decide = async (next) => {
    setBusy(next);
    try {
      const d = await api(`/staff/reports/${r.id}/screening`, { method: 'PATCH', body: { decision: next, note: note.trim() || undefined } });
      onChange(d.report);
      setNote('');
      toast.success(
        next === 'passed'
          ? d.sentToAuthority
            ? 'Accepted — the city authority has been emailed.'
            : 'Accepted — the reporter has been notified.'
          : 'Rejected — the reporter has been notified.',
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const outcome = r.authorityNotified
    ? `Sent to the city authority${r.authorityNotifiedAt ? ` ${timeAgo(r.authorityNotifiedAt)}` : ''}.`
    : decision === 'passed'
      ? 'Not emailed to the authority (AUTHORITY_EMAIL is not set or email is off).'
      : decision === 'rejected'
        ? 'Not sent to the city authority.'
        : 'Waiting for a staff decision.';

  return (
    <div className="card p-5">
      <AiCheckPanel ai={r.ai} screening={r.screening} outcome={outcome}>
        <div className="mt-4 border-t border-white/5 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
            {decision === 'review' ? 'Your decision' : 'Override the decision'}
          </p>
          <input
            className="input mb-2"
            placeholder="Optional note for the reporter"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
          <div className="flex flex-wrap gap-2">
            {decision !== 'passed' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => decide('passed')} disabled={Boolean(busy)}>
                {busy === 'passed' ? <Spinner className="h-3 w-3" /> : <FiCheck />} Accept & send to authority
              </button>
            )}
            {decision !== 'rejected' && (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => decide('rejected')} disabled={Boolean(busy)}>
                {busy === 'rejected' ? <Spinner className="h-3 w-3" /> : <FiX />} Reject photo
              </button>
            )}
          </div>
        </div>
      </AiCheckPanel>
    </div>
  );
}

export default function StaffReportDetail() {
  const { id } = useParams();
  const { data, error, loading, reload, setData } = useApi(`/staff/reports/${id}`);
  const [status, setStatus] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error) {
    return (
      <div className="container-page py-16">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  const r = data.report;
  const nextStatus = status ?? r.status;

  const save = async () => {
    setSaving(true);
    try {
      const d = await api(`/staff/reports/${r.id}`, { method: 'PATCH', body: { status: nextStatus, note: note.trim() || undefined } });
      setData((prev) => ({ report: { ...d.report, user: prev.report.user } }));
      setNote('');
      setStatus(null);
      toast.success('Report updated — the reporter has been notified.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-page py-8">
      <Link to="/staff/dashboard" className="btn btn-ghost -ml-3 mb-4">
        <FiArrowLeft /> All reports
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">Report #{r.id.slice(-6).toUpperCase()}</h1>
        <StatusBadge map={REPORT_STATUS} value={r.status} />
        <Badge tone={SEVERITY[r.severity]?.tone}>{SEVERITY[r.severity]?.label} severity</Badge>
        {r.authorityNotified && (
          <Badge tone="sky">
            <FiMail /> Authority emailed
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <a href={r.image} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-white/10">
            <img src={r.image} alt="Reported dumping site" className="max-h-[520px] w-full object-cover" />
          </a>

          <div className="card p-5">
            <h2 className="mb-3 text-lg">Details</h2>
            <p className="text-ink-200">
              {REPORT_CATEGORY[r.category]?.emoji} <b className="text-white">{REPORT_CATEGORY[r.category]?.label}</b>
            </p>
            {r.description && <p className="mt-2 text-ink-300">{r.description}</p>}
            <div className="mt-4 flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] p-3">
              <p className="flex items-start gap-2 text-sm text-ink-200">
                <FiMapPin className="mt-0.5 shrink-0 text-brand-300" />
                <span>
                  {r.address || 'No address given'}
                  <span className="block text-xs text-ink-500">
                    {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                  </span>
                </span>
              </p>
              <a href={directionsUrl(r)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                <FiNavigation /> Directions
              </a>
            </div>
          </div>

          <div className="h-72 overflow-hidden rounded-2xl border border-white/10">
            <MapContainer center={[r.lat, r.lng]} zoom={16} style={{ height: '100%' }}>
              <MapTiles />
              <Marker position={[r.lat, r.lng]} icon={dotIcon(SEVERITY[r.severity]?.color, { size: 18 })} />
            </MapContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card space-y-4 p-5">
            <h2 className="text-lg">Update status</h2>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(REPORT_STATUS).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatus(k)}
                  className={cx('chip justify-center py-2', nextStatus === k && 'chip-active')}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(QUICK_NOTES[nextStatus] || []).map((n) => (
                <button key={n} type="button" className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-ink-300 hover:bg-white/10" onClick={() => setNote(n)}>
                  {n}
                </button>
              ))}
            </div>
            <textarea
              className="input"
              rows={3}
              placeholder="Note for the reporter (visible to them)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
            <button type="button" className="btn btn-primary w-full" onClick={save} disabled={saving || (nextStatus === r.status && !note.trim())}>
              {saving ? <Spinner className="h-4 w-4" /> : 'Save & notify reporter'}
            </button>
          </div>

          <ScreeningCard report={r} onChange={(report) => setData((prev) => ({ report: { ...report, user: prev.report.user } }))} />

          <div className="card p-5">
            <h2 className="mb-3 text-lg">Reporter</h2>
            <div className="flex items-center gap-3">
              <Avatar name={r.user?.name} src={r.user?.avatar} size="h-10 w-10" />
              <div className="min-w-0">
                <p className="font-semibold text-white">{r.user?.name}</p>
                <p className="truncate text-sm text-ink-400">{r.user?.email}</p>
              </div>
            </div>
            {r.user?.phone && (
              <a href={`tel:${r.user.phone}`} className="btn btn-secondary btn-sm mt-3">
                <FiPhone /> {r.user.phone}
              </a>
            )}
            <p className="mt-3 text-xs text-ink-500">Submitted {dateTime(r.createdAt)} ({timeAgo(r.createdAt)})</p>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-lg">History</h2>
            <ol className="relative ml-2 space-y-4 border-l border-white/10 pl-5">
              {r.history.map((h, i) => (
                <li key={i} className="relative">
                  <span className={cx('absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-ink-900', i === r.history.length - 1 ? 'bg-brand-400' : 'bg-ink-500')} />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge map={REPORT_STATUS} value={h.status} dot={false} />
                    <span className="text-xs text-ink-500">{dateTime(h.at)}</span>
                  </div>
                  {h.note && <p className="mt-1 text-sm text-ink-300">{h.note}</p>}
                  {h.by?.name && <p className="text-[11px] text-ink-500">by {h.by.name}</p>}
                </li>
              ))}
            </ol>
          </div>
          {r.status === 'resolved' && r.resolvedAt && (
            <Alert tone="emerald">Resolved {timeAgo(r.resolvedAt)} after {Math.max(1, Math.round((new Date(r.resolvedAt) - new Date(r.createdAt)) / 3600000))}h.</Alert>
          )}
        </div>
      </div>
    </div>
  );
}
