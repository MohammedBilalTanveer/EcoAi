import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCheck, FiClock, FiEdit2, FiLogOut, FiRefreshCw, FiSlash, FiXCircle } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { Avatar, cx, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABEL } from '../lib/format';

const COPY = {
  pending: {
    icon: FiClock,
    iconTone: 'bg-amber-400/15 text-amber-300',
    title: 'Your account is awaiting approval',
  },
  rejected: {
    icon: FiXCircle,
    iconTone: 'bg-rose-400/15 text-rose-300',
    title: 'Your application wasn’t approved',
  },
  suspended: {
    icon: FiSlash,
    iconTone: 'bg-white/10 text-ink-200',
    title: 'Your account is suspended',
  },
};

/**
 * Shown instead of the app to restaurant / NGO accounts that an admin hasn't approved
 * yet (and to rejected or suspended accounts). Re-checks the status automatically.
 */
export default function AccountStatus() {
  const { user, refresh, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const copy = COPY[user.status] || COPY.pending;
  const kind = ROLE_LABEL[user.role] || 'partner';

  useEffect(() => {
    const id = setInterval(() => refresh().catch(() => {}), 30000);
    return () => clearInterval(id);
  }, [refresh]);

  const check = async () => {
    setChecking(true);
    try {
      const next = await refresh();
      if (next.status === 'active') toast.success('Your account is approved — welcome to EcoAI! 🎉');
      else toast.info('Still under review. We’ll email you as soon as it’s approved.');
    } catch {
      toast.error('Could not check right now. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const steps = [
    { label: 'Account created', done: true },
    { label: 'Admin review', done: user.status !== 'pending', current: user.status === 'pending' },
    { label: 'Full access', done: false },
  ];

  return (
    <div className="container-page grid min-h-[calc(100vh-4rem)] place-items-center py-12">
      <div className="card w-full max-w-xl overflow-hidden">
        <div className="bg-gradient-to-br from-brand-500/20 via-transparent to-accent/10 p-8 text-center">
          <span className={cx('mx-auto grid h-16 w-16 place-items-center rounded-2xl text-3xl', copy.iconTone)}>
            <copy.icon />
          </span>
          <h1 className="mt-5 text-2xl sm:text-3xl">{copy.title}</h1>
          <p className="mx-auto mt-3 max-w-md text-ink-300">
            {user.status === 'pending' && (
              <>
                Thanks for joining EcoAI as {kind === 'NGO' ? 'an' : 'a'} {kind.toLowerCase()}! Our team verifies every
                restaurant and NGO before they get access — usually within 24 hours. We’ll email{' '}
                <b className="text-white">{user.email}</b> as soon as you’re approved.
              </>
            )}
            {user.status !== 'pending' &&
              (user.statusNote || 'If you think this is a mistake, contact us using the form on the home page.')}
          </p>
        </div>

        {user.status === 'pending' && (
          <ol className="flex items-center justify-between gap-2 border-y border-white/5 px-8 py-5">
            {steps.map((s, i) => (
              <li key={s.label} className="flex flex-1 items-center gap-2">
                <span
                  className={cx(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                    s.done ? 'bg-brand-500 text-white' : s.current ? 'bg-amber-400/20 text-amber-200 ring-2 ring-amber-400/50' : 'bg-white/5 text-ink-500',
                  )}
                >
                  {s.done ? <FiCheck /> : i + 1}
                </span>
                <span className={cx('text-xs sm:text-sm', s.done || s.current ? 'text-white' : 'text-ink-500')}>{s.label}</span>
                {i < steps.length - 1 && <span className="hidden h-px flex-1 bg-white/10 sm:block" />}
              </li>
            ))}
          </ol>
        )}

        <div className="p-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">Your application</p>
          <div className="flex items-start gap-3 rounded-2xl bg-white/[0.03] p-4">
            <Avatar name={user.organization || user.name} src={user.avatar} size="h-11 w-11" />
            <dl className="min-w-0 flex-1 space-y-1 text-sm">
              <dt className="sr-only">Organisation</dt>
              <dd className="font-semibold text-white">{user.organization || user.name}</dd>
              <dd className="text-ink-300">
                {kind} · contact {user.name}
              </dd>
              <dd className="truncate text-ink-400">{[user.email, user.phone].filter(Boolean).join(' · ')}</dd>
              {user.address && <dd className="text-ink-400">{user.address}</dd>}
            </dl>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {user.status === 'pending' && (
              <button type="button" className="btn btn-primary" onClick={check} disabled={checking}>
                {checking ? <Spinner className="h-4 w-4" /> : <FiRefreshCw />} Check status
              </button>
            )}
            <Link to="/profile" className="btn btn-secondary">
              <FiEdit2 /> Edit my details
            </Link>
            <button type="button" className="btn btn-ghost ml-auto" onClick={signOut}>
              <FiLogOut /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
