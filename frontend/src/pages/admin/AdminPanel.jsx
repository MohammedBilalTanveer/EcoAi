import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FiAlertTriangle,
  FiCheck,
  FiClock,
  FiExternalLink,
  FiHeart,
  FiMail,
  FiMapPin,
  FiPhone,
  FiSearch,
  FiShield,
  FiSlash,
  FiUserCheck,
  FiUserPlus,
  FiUsers,
  FiX,
  FiZap,
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import { AiDecisionBadge } from '../../components/AiCheck';
import { Avatar, Badge, cx, EmptyState, ErrorState, Field, Modal, PageHeader, Spinner, StatCard, StatusBadge, Tabs } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import {
  ACCOUNT_STATUS,
  CLAIM_STATUS,
  dateOnly,
  dateTime,
  LISTING_STATUS,
  number,
  REPORT_CATEGORY,
  REPORT_STATUS,
  ROLE_LABEL,
  SEVERITY,
  timeAgo,
} from '../../lib/format';

const ROLE_TONE = { citizen: 'slate', restaurant: 'amber', ngo: 'sky', staff: 'violet', admin: 'rose' };
const RoleBadge = ({ role }) => <Badge tone={ROLE_TONE[role]}>{ROLE_LABEL[role] || role}</Badge>;

async function changeStatus(user, status, note) {
  const d = await api(`/admin/users/${user.id}/status`, { method: 'PATCH', body: { status, note: note?.trim() || undefined } });
  const who = user.organization || user.name;
  const msg = {
    active: user.status === 'pending' ? `${who} approved — they’ve been notified.` : `${who} reactivated.`,
    rejected: `${who}’s application rejected.`,
    suspended: `${who} suspended.`,
  }[status];
  toast.success(msg);
  return d.user;
}

/** Approve / reject / suspend / reactivate controls, with an optional note for the user. */
function StatusActions({ user, onChanged, compact }) {
  const { user: me } = useAuth();
  const [pending, setPending] = useState(null); // status awaiting a reason
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (user.role === 'admin' || user.id === me.id) {
    return <p className="text-xs text-ink-500">Admin accounts are managed from the server.</p>;
  }

  const run = async (status, withNote) => {
    setBusy(true);
    try {
      onChanged(await changeStatus(user, status, withNote));
      setPending(null);
      setNote('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (pending) {
    const label = { rejected: 'Reject application', suspended: 'Suspend account' }[pending];
    return (
      <div className="w-full space-y-2">
        <textarea
          className="input"
          rows={2}
          autoFocus
          placeholder={pending === 'rejected' ? 'Reason (sent to the applicant) — e.g. could not verify the business' : 'Reason (sent to the user)'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
        <div className="flex gap-2">
          <button type="button" className="btn btn-danger btn-sm" onClick={() => run(pending, note)} disabled={busy}>
            {busy ? <Spinner className="h-3 w-3" /> : label}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPending(null)} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cx('flex flex-wrap gap-2', compact && 'justify-end')}>
      {user.status === 'pending' && (
        <>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => run('active')} disabled={busy}>
            {busy ? <Spinner className="h-3 w-3" /> : <FiCheck />} Approve
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setPending('rejected')} disabled={busy}>
            <FiX /> Reject
          </button>
        </>
      )}
      {user.status === 'active' && (
        <button type="button" className="btn btn-danger btn-sm" onClick={() => setPending('suspended')} disabled={busy}>
          <FiSlash /> Suspend
        </button>
      )}
      {['rejected', 'suspended'].includes(user.status) && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => run('active')} disabled={busy}>
          {busy ? <Spinner className="h-3 w-3" /> : <FiUserCheck />} {user.status === 'rejected' ? 'Approve after all' : 'Reactivate'}
        </button>
      )}
    </div>
  );
}

function UserModal({ userId, onClose, onChanged }) {
  const { data, error, loading, setData } = useApi(userId ? `/admin/users/${userId}` : null);
  const u = data?.user;
  const recent = data?.recent;

  return (
    <Modal open={Boolean(userId)} onClose={onClose} title="User details" size="max-w-2xl">
      {loading && !data ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : error ? (
        <ErrorState error={error} />
      ) : u ? (
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <div className="flex items-start gap-4">
            <Avatar name={u.organization || u.name} src={u.avatar} size="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-white">{u.organization || u.name}</p>
              {u.organization && <p className="text-sm text-ink-300">Contact: {u.name}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <RoleBadge role={u.role} />
                <StatusBadge map={ACCOUNT_STATUS} value={u.status} />
                {u.authProviders.includes('google') && <Badge tone="slate">Google sign-in</Badge>}
              </div>
            </div>
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2 text-ink-200">
              <FiMail className="shrink-0 text-ink-500" /> <a href={`mailto:${u.email}`} className="truncate hover:text-white">{u.email}</a>
            </div>
            {u.phone && (
              <div className="flex items-center gap-2 text-ink-200">
                <FiPhone className="shrink-0 text-ink-500" /> <a href={`tel:${u.phone}`} className="hover:text-white">{u.phone}</a>
              </div>
            )}
            {u.address && (
              <div className="flex items-center gap-2 text-ink-200 sm:col-span-2">
                <FiMapPin className="shrink-0 text-ink-500" /> {u.address}
                {u.location && (
                  <a
                    href={`https://www.google.com/maps?q=${u.location.lat},${u.location.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 inline-flex items-center gap-1 text-xs text-brand-300 hover:text-brand-200"
                  >
                    map <FiExternalLink />
                  </a>
                )}
              </div>
            )}
            <div className="text-ink-400">Joined {dateTime(u.createdAt)}</div>
            <div className="text-ink-400">Last sign-in {u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'never'}</div>
            {u.reviewedAt && (
              <div className="text-ink-400 sm:col-span-2">
                Reviewed {timeAgo(u.reviewedAt)}
                {u.reviewedBy ? ` by ${u.reviewedBy}` : ''}
                {u.statusNote ? ` — “${u.statusNote}”` : ''}
              </div>
            )}
          </dl>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="mb-3 text-sm font-semibold text-white">Account status</p>
            <StatusActions
              user={u}
              onChanged={(next) => {
                setData((d) => ({ ...d, user: { ...d.user, ...next } }));
                onChanged(next);
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Reports filed', value: u.counts?.reports },
              { label: 'Food listed', value: u.counts?.listings },
              { label: 'Reservations', value: u.counts?.claims },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-white/[0.03] py-3">
                <p className="text-xl font-bold text-white">{s.value ?? 0}</p>
                <p className="text-[11px] text-ink-400">{s.label}</p>
              </div>
            ))}
          </div>

          {recent.reports.length > 0 && (
            <section>
              <p className="mb-2 text-sm font-semibold text-white">Recent reports</p>
              <ul className="divide-y divide-white/5 rounded-xl bg-white/[0.02]">
                {recent.reports.map((r) => (
                  <li key={r.id}>
                    <Link to={`/staff/report/${r.id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-white/[0.03]">
                      <img src={r.image} alt="" className="h-9 w-11 rounded-md object-cover" />
                      <span className="min-w-0 flex-1 truncate text-ink-200">
                        {REPORT_CATEGORY[r.category]?.label} · {r.address || 'no address'}
                      </span>
                      <StatusBadge map={REPORT_STATUS} value={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {recent.listings.length > 0 && (
            <section>
              <p className="mb-2 text-sm font-semibold text-white">Recent food listings</p>
              <ul className="divide-y divide-white/5 rounded-xl bg-white/[0.02]">
                {recent.listings.map((l) => (
                  <li key={l.id}>
                    <Link to={`/food/${l.id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-white/[0.03]">
                      <img src={l.images[0]} alt="" className="h-9 w-11 rounded-md object-cover" />
                      <span className="min-w-0 flex-1 truncate text-ink-200">{l.title}</span>
                      <StatusBadge map={LISTING_STATUS} value={l.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {recent.claims.length > 0 && (
            <section>
              <p className="mb-2 text-sm font-semibold text-white">Recent reservations</p>
              <ul className="divide-y divide-white/5 rounded-xl bg-white/[0.02]">
                {recent.claims.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink-200">
                      {c.title} · {c.quantity}
                    </span>
                    <StatusBadge map={CLAIM_STATUS} value={c.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function Overview({ stats, onOpenUser, goTo }) {
  if (!stats) return <div className="skeleton h-72" />;
  const r = stats.users.byRole;
  const roles = ['citizen', 'restaurant', 'ngo', 'staff', 'admin'];
  const maxRole = Math.max(1, ...roles.map((x) => r[x] || 0));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FiUsers} label="Total users" value={number(stats.users.total)} sub={`${r.citizen || 0} citizens · ${r.restaurant || 0} restaurants · ${r.ngo || 0} NGOs`} tone="violet" />
        <button type="button" onClick={() => goTo('approvals')} className="text-left">
          <StatCard
            icon={FiClock}
            label="Waiting for approval"
            value={number(stats.pending)}
            sub={stats.pending ? 'Review applications →' : 'All caught up'}
            tone="amber"
            className={cx('h-full transition hover:border-amber-400/40', stats.pending > 0 && 'border-amber-400/30')}
          />
        </button>
        <button type="button" onClick={() => goTo('reports')} className="text-left">
          <StatCard
            icon={FiAlertTriangle}
            label="Dumping reports"
            value={number(stats.reports.total)}
            sub={`${stats.reports.byStatus.pending + stats.reports.byStatus.in_progress} open · ${stats.reports.byStatus.resolved} resolved`}
            tone="rose"
            className="h-full transition hover:border-rose-400/30"
          />
        </button>
        <StatCard icon={FiHeart} label="Meals rescued" value={number(stats.food.impact.meals)} sub={`${stats.food.listings} food listings so far`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChecksCard title="Dumping report photo checks" counts={stats.reports.screening} onOpen={() => goTo('reports')} />
        <ChecksCard title="Food listing photo checks" counts={stats.food.screening} onOpen={() => goTo('food')} />
      </div>

      <EmailCard email={stats.email} />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="card p-5">
          <h3 className="text-base">Users by type</h3>
          <p className="mb-4 text-xs text-ink-400">
            {stats.users.byStatus.suspended || 0} suspended · {stats.users.byStatus.rejected || 0} rejected
          </p>
          <div className="space-y-3">
            {roles.map((role) => (
              <div key={role}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-ink-200">{ROLE_LABEL[role]}</span>
                  <span className="font-semibold tabular-nums text-white">{r[role] || 0}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${((r[role] || 0) / maxRole) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5">
            <h3 className="text-base">Newest accounts</h3>
            <button type="button" className="text-sm text-brand-300 hover:text-brand-200" onClick={() => goTo('users')}>
              All users →
            </button>
          </div>
          <ul className="mt-3 divide-y divide-white/5">
            {stats.recentUsers.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => onOpenUser(u.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-white/[0.03]">
                  <Avatar name={u.organization || u.name} src={u.avatar} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{u.organization || u.name}</span>
                    <span className="block truncate text-xs text-ink-400">
                      {u.email} · {timeAgo(u.createdAt)}
                    </span>
                  </span>
                  <RoleBadge role={u.role} />
                  <StatusBadge map={ACCOUNT_STATUS} value={u.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Approvals({ onOpenUser, onChanged }) {
  const { data, error, loading, reload, setData } = useApi('/admin/users', { query: { status: 'pending', limit: 50 } });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <div className="skeleton h-64" />;
  if (!data.users.length) {
    return (
      <EmptyState icon={FiUserCheck} title="No applications waiting">
        New restaurant and NGO sign-ups appear here. They can’t use EcoAI until you approve them.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-400">
        {data.users.length} application{data.users.length > 1 ? 's' : ''} waiting · oldest first. Approved partners are notified by email and
        in-app; NGOs start receiving food alerts right away.
      </p>
      {data.users.map((u) => (
        <div key={u.id} className="card flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
          <button type="button" onClick={() => onOpenUser(u.id)} className="flex min-w-0 flex-1 items-start gap-4 text-left">
            <Avatar name={u.organization || u.name} src={u.avatar} size="h-12 w-12" />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">{u.organization || u.name}</span>
                <RoleBadge role={u.role} />
              </span>
              <span className="mt-1 block text-sm text-ink-300">
                {u.name} · {u.email}
                {u.phone ? ` · ${u.phone}` : ''}
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">
                {u.address || 'No address given'} · applied {timeAgo(u.createdAt)}
                {u.authProviders.includes('google') ? ' · via Google' : ''}
              </span>
            </span>
          </button>
          <div className="lg:w-72">
            <StatusActions
              user={u}
              compact
              onChanged={(next) => {
                setData((d) => ({ ...d, users: d.users.filter((x) => x.id !== next.id) }));
                onChanged();
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Users({ onOpenUser, refreshKey, onChanged }) {
  const [filters, setFilters] = useState({ role: '', status: '', q: '', page: 1 });
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const query = useMemo(() => ({ ...filters, limit: 15, _: refreshKey }), [filters, refreshKey]);
  const { data, error, loading, reload } = useApi('/admin/users', { query });
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value, page: 1 }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <form
          className="relative min-w-[220px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters((f) => ({ ...f, q: search.trim(), page: 1 }));
          }}
        >
          <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
          <input className="input pl-10" placeholder="Search name, email, organisation or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <select className="input w-auto" value={filters.role} onChange={set('role')} aria-label="Account type">
          <option value="">All types</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={filters.status} onChange={set('status')} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(ACCOUNT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <FiUserPlus /> Add staff or admin
        </button>
      </div>
      <AddStaffModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(user) => {
          setAdding(false);
          onChanged();
          onOpenUser(user.id);
        }}
      />

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <div className="skeleton h-96" />
      ) : data.users.length === 0 ? (
        <EmptyState icon={FiUsers} title="No users match these filters" />
      ) : (
        <div className={cx('card overflow-hidden transition', loading && 'opacity-60')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.users.map((u) => (
                  <tr key={u.id} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => onOpenUser(u.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.organization || u.name} src={u.avatar} size="h-9 w-9" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">{u.organization || u.name}</p>
                          <p className="truncate text-xs text-ink-400">{u.organization ? `${u.name} · ${u.email}` : u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge map={ACCOUNT_STATUS} value={u.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-300">
                      {u.counts.reports} reports · {u.counts.listings} listings · {u.counts.claims} reservations
                    </td>
                    <td className="px-4 py-3 text-ink-300" title={dateTime(u.createdAt)}>
                      {dateOnly(u.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="btn btn-secondary btn-sm">View</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-sm text-ink-400">
            <span>
              {number(data.total)} users · page {data.page} of {data.pages}
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

function Reports() {
  const [filters, setFilters] = useState({ status: '', severity: '', ai: '', q: '', page: 1 });
  const [search, setSearch] = useState('');
  const query = useMemo(() => ({ ...filters, limit: 15 }), [filters]);
  const { data, error, loading, reload } = useApi('/staff/reports', { query });
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value, page: 1 }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <form
          className="relative min-w-[220px] flex-1"
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
        <AiFilter value={filters.ai} onChange={set('ai')} />
        <Link to="/staff/dashboard" className="btn btn-secondary">
          <FiShield /> Open staff portal
        </Link>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <div className="skeleton h-96" />
      ) : data.reports.length === 0 ? (
        <EmptyState icon={FiAlertTriangle} title="No reports match these filters" />
      ) : (
        <div className={cx('card overflow-hidden transition', loading && 'opacity-60')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Report</th>
                  <th className="px-4 py-3 font-medium">Filed by</th>
                  <th className="px-4 py-3 font-medium">AI photo check</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Filed</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.reports.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={r.image} alt="" className="h-10 w-12 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">
                            {REPORT_CATEGORY[r.category]?.emoji} {REPORT_CATEGORY[r.category]?.label}
                          </p>
                          <p className="max-w-[16rem] truncate text-xs text-ink-400">{r.address || r.description || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="truncate text-ink-100">{r.user?.name || 'Unknown'}</p>
                      <p className="truncate text-xs text-ink-500">{r.user?.email}</p>
                    </td>
                    <td className="max-w-[15rem] px-4 py-3">
                      <AiDecisionBadge screening={r.screening} />
                      <p className="mt-1 line-clamp-2 text-xs text-ink-400" title={r.screening.reason}>
                        {r.screening.reason}
                        {r.authorityNotified ? ' · Sent to authority' : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={SEVERITY[r.severity]?.tone}>{SEVERITY[r.severity]?.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge map={REPORT_STATUS} value={r.status} />
                    </td>
                    <td className="px-4 py-3 text-ink-300" title={dateTime(r.createdAt)}>
                      {timeAgo(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/staff/report/${r.id}`} className="btn btn-secondary btn-sm">
                        Open
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

function AiFilter({ value, onChange }) {
  return (
    <select className="input w-auto" value={value} onChange={onChange} aria-label="AI photo check">
      <option value="">AI check: any</option>
      <option value="passed">Passed</option>
      <option value="rejected">Rejected</option>
      <option value="review">Needs review</option>
    </select>
  );
}

const PROVIDER_NAME = { brevo: 'Brevo', resend: 'Resend', smtp: 'SMTP' };

/** Shows how email is sent and lets an admin send a test message to any address. */
function EmailCard({ email }) {
  const { user } = useAuth();
  const [to, setTo] = useState(user.email);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      setResult(await api('/admin/test-email', { method: 'POST', body: { to } }));
    } catch (err) {
      setResult({ ok: false, error: err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base">
            <FiMail className="text-sky-300" /> Email delivery
          </h3>
          <p className="mt-1 text-sm text-ink-400">
            {email?.enabled ? (
              <>
                On · {PROVIDER_NAME[email.provider] || email.provider} · from <b className="text-ink-200">{email.from || 'not set'}</b>
              </>
            ) : (
              'Off — no email provider is configured on the server.'
            )}
          </p>
        </div>
        <form onSubmit={send} className="flex w-full flex-wrap gap-2 sm:w-auto">
          <input
            type="email"
            className="input min-w-[220px] flex-1 sm:w-64"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Send the test email to"
            required
          />
          <button type="submit" className="btn btn-secondary" disabled={sending}>
            {sending ? <Spinner className="h-4 w-4" /> : <FiMail />} Send test email
          </button>
        </form>
      </div>
      {result && (
        <div
          className={cx(
            'mt-4 rounded-xl border px-4 py-3 text-sm',
            result.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-rose-500/30 bg-rose-500/10 text-rose-100',
          )}
        >
          {result.ok ? (
            <>
              <b>Sent to {result.to}.</b> Check the inbox (and Spam / Promotions) in a minute or two.
              {result.provider === 'brevo' && ' Delivery status is in Brevo → Transactional → Logs.'}
            </>
          ) : (
            <>
              <b>Not sent:</b> {result.error}
              {result.hint && <span className="mt-1 block">{result.hint}</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChecksCard({ title, counts, onOpen }) {
  const total = (counts?.passed || 0) + (counts?.rejected || 0) + (counts?.review || 0);
  const rows = [
    { key: 'passed', label: 'Passed', color: 'bg-emerald-400' },
    { key: 'rejected', label: 'Rejected', color: 'bg-rose-400' },
    { key: 'review', label: 'Needs review', color: 'bg-amber-300' },
  ];
  return (
    <button type="button" onClick={onOpen} className="card p-5 text-left transition hover:border-white/20">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base">
          <FiZap className="text-accent-300" /> {title}
        </h3>
        <span className="text-xs text-ink-400">{number(total)} total →</span>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
        {rows.map((r) => (
          <div key={r.key} className={r.color} style={{ width: total ? `${((counts?.[r.key] || 0) / total) * 100}%` : 0 }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {rows.map((r) => (
          <span key={r.key} className="flex items-center gap-2 text-ink-300">
            <span className={cx('h-2 w-2 rounded-full', r.color)} />
            {r.label} <b className="tabular-nums text-white">{number(counts?.[r.key])}</b>
          </span>
        ))}
      </div>
    </button>
  );
}

const EMPTY_STAFF = { name: '', email: '', role: 'staff', password: '', phone: '' };

/** Creates a staff or admin account (staff can't sign up on the website). */
function AddStaffModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_STAFF);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const d = await api('/admin/users', {
        method: 'POST',
        body: { ...form, password: form.password || undefined, phone: form.phone.trim() || undefined },
      });
      toast.success(`${d.user.name} can now sign in as ${form.role === 'admin' ? 'an admin' : 'staff'}.`);
      setForm(EMPTY_STAFF);
      onCreated(d.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add staff or admin">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'staff', title: 'Staff', text: 'Reviews dumping reports and moderates food listings.' },
            { value: 'admin', title: 'Admin', text: 'Everything staff can do, plus approvals and user management.' },
          ].map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setForm((f) => ({ ...f, role: r.value }))}
              className={cx(
                'rounded-2xl border p-3 text-left transition',
                form.role === r.value ? 'border-brand-400/60 bg-brand-400/10' : 'border-white/10 hover:border-white/20',
              )}
            >
              <span className="block text-sm font-semibold text-white">{r.title}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-ink-400">{r.text}</span>
            </button>
          ))}
        </div>
        <Field label="Full name">
          {(id) => <input id={id} className="input" value={form.name} onChange={set('name')} required maxLength={80} />}
        </Field>
        <Field label="Work email">
          {(id) => <input id={id} type="email" className="input" value={form.email} onChange={set('email')} required />}
        </Field>
        <Field
          label="Temporary password"
          optional
          hint="Share it with them privately; they can change it under Profile. Leave empty if they'll sign in with Google using this email."
        >
          {(id) => (
            <input id={id} type="text" className="input" value={form.password} onChange={set('password')} minLength={10} autoComplete="new-password" />
          )}
        </Field>
        <Field label="Phone" optional>
          {(id) => <input id={id} className="input" value={form.phone} onChange={set('phone')} maxLength={20} />}
        </Field>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <FiUserPlus />} Create account
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Every food listing with its photo check; held listings can be approved or removed. */
function Food({ onChanged }) {
  const [decision, setDecision] = useState('');
  const { data, error, loading, reload } = useApi('/staff/food', { query: { ai: decision, limit: 100 } });
  const [busy, setBusy] = useState(null);

  const act = async (listing, action) => {
    setBusy(`${listing.id}:${action}`);
    try {
      await api(`/staff/food/${listing.id}`, { method: 'PATCH', body: { action } });
      toast.success(action === 'remove' ? 'Listing removed.' : listing.flagged ? 'Approved and published — nearby NGOs alerted.' : 'Photo check confirmed.');
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
      <div className="flex flex-wrap items-center gap-2">
        <AiFilter value={decision} onChange={(e) => setDecision(e.target.value)} />
        <p className="text-sm text-ink-400">Listings whose photo fails the AI check stay unpublished until approved.</p>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <div className="skeleton h-96" />
      ) : data.listings.length === 0 ? (
        <EmptyState icon={FiHeart} title="No food listings match" />
      ) : (
        <div className={cx('card overflow-hidden transition', loading && 'opacity-60')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Listing</th>
                  <th className="px-4 py-3 font-medium">AI photo check</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">NGOs alerted</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.listings.map((l) => (
                  <tr key={l.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <Link to={`/food/${l.id}`} className="flex items-center gap-3">
                        <img src={l.images[0]} alt="" className="h-10 w-12 shrink-0 rounded-lg object-cover" />
                        <span className="min-w-0">
                          <span className="block max-w-[14rem] truncate font-semibold text-white">{l.title}</span>
                          <span className="block truncate text-xs text-ink-400">
                            {l.donor?.organization || l.donor?.name} · {timeAgo(l.createdAt)}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="max-w-[18rem] px-4 py-3">
                      <AiDecisionBadge screening={l.screening} />
                      <p className="mt-1 line-clamp-2 text-xs text-ink-400" title={l.screening.reason}>
                        {l.screening.reason}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {l.flagged ? <Badge tone="slate">Not published</Badge> : <StatusBadge map={LISTING_STATUS} value={l.status} />}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink-300">{l.flagged ? '—' : l.notifiedNgos}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = ['overview', 'approvals', 'users', 'reports', 'food'];

export default function AdminPanel() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview';
  const { data: stats, reload: reloadStats } = useApi('/admin/stats', { pollMs: 60000 });
  const [openUser, setOpenUser] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const goTo = (t) => setParams(t === 'overview' ? {} : { tab: t });
  const changed = () => {
    reloadStats({ silent: true });
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="container-page py-10">
      <PageHeader
        eyebrow="Admin"
        title="Admin panel"
        subtitle="Approve restaurants and NGOs, manage users and staff, and see every report and food listing with its AI photo check."
        actions={
          <Link to="/staff/dashboard" className="btn btn-secondary">
            <FiShield /> Staff portal
          </Link>
        }
      />
      <Tabs
        className="mb-6 w-fit"
        value={tab}
        onChange={goTo}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'approvals', label: 'Approvals', count: stats?.pending || undefined },
          { value: 'users', label: 'Users', count: stats?.users.total },
          { value: 'reports', label: 'Reports', count: stats?.reports.total },
          { value: 'food', label: 'Food', count: stats?.food.screening.rejected || undefined },
        ]}
      />

      {tab === 'overview' && <Overview stats={stats} onOpenUser={setOpenUser} goTo={goTo} />}
      {tab === 'approvals' && <Approvals onOpenUser={setOpenUser} onChanged={changed} />}
      {tab === 'users' && <Users onOpenUser={setOpenUser} refreshKey={refreshKey} onChanged={changed} />}
      {tab === 'reports' && <Reports />}
      {tab === 'food' && <Food onChanged={changed} />}

      <UserModal userId={openUser} onClose={() => setOpenUser(null)} onChanged={changed} />
    </div>
  );
}
