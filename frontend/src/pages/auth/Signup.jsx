import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FiArrowRight, FiCheckCircle, FiMail, FiMapPin, FiPhone, FiUser } from 'react-icons/fi';
import { toast } from 'react-toastify';
import GoogleButton from '../../components/GoogleButton';
import { Alert, Avatar, cx, Field, Spinner } from '../../components/ui';
import { homeFor, useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { getCurrentPosition } from '../../lib/geo';
import AuthLayout, { OrDivider } from './AuthLayout';
import PasswordInput from './PasswordInput';

const ROLES = [
  {
    value: 'citizen',
    emoji: '🙋',
    title: 'Citizen',
    text: 'Report dumping, track trucks and grab discounted surplus food.',
  },
  {
    value: 'restaurant',
    emoji: '🍽️',
    title: 'Restaurant',
    text: 'List surplus food for NGOs for free or at a discount.',
  },
  {
    value: 'ngo',
    emoji: '🤝',
    title: 'NGO / Food bank',
    text: 'Get alerts for food nearby and collect it with a pickup code.',
  },
];

export default function Signup() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const initialRole = ROLES.some((r) => r.value === params.get('role')) ? params.get('role') : 'citizen';

  // Set when the user arrived here from "Sign in with Google" without an account.
  const [pendingGoogle, setPendingGoogle] = useState(location.state?.google || null);
  const [form, setForm] = useState({
    role: initialRole,
    name: '',
    email: location.state?.email || '',
    password: '',
    organization: '',
    phone: '',
    address: '',
    lat: null,
    lng: null,
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  // Email that was just tried on the login page and isn't registered.
  const notRegistered = location.state?.notRegistered || pendingGoogle?.email || null;

  if (user) {
    const from = location.state?.from;
    return <Navigate to={from ? `${from.pathname}${from.search || ''}` : homeFor(user)} replace />;
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));
  const isOrg = form.role !== 'citizen';
  const orgLabel = form.role === 'ngo' ? 'NGO name' : 'Restaurant / business name';

  const profilePayload = () => ({
    role: form.role,
    organization: isOrg ? form.organization.trim() : undefined,
    phone: form.phone.trim() || undefined,
    address: form.address.trim() || undefined,
    lat: form.lat ?? undefined,
    lng: form.lng ?? undefined,
  });

  const checkOrg = () => {
    if (isOrg && !form.organization.trim()) {
      setError({ message: `Please enter your ${orgLabel.toLowerCase()}.` });
      return false;
    }
    return true;
  };

  const done = (data) => {
    signIn(data);
    if (data.user.status === 'pending') {
      toast.info('Account created — an admin will verify it and we’ll email you once you’re approved.');
      return;
    }
    toast.success(`Welcome to EcoAI, ${data.user.name.split(' ')[0]}! 🌱`);
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      setForm((f) => ({ ...f, lat: pos.lat, lng: pos.lng }));
      const r = await api('/geo/reverse', { query: { lat: pos.lat, lng: pos.lng } }).catch(() => null);
      if (r?.label) setForm((f) => ({ ...f, address: f.address || r.label }));
    } catch (err) {
      toast.info(err.message);
    } finally {
      setLocating(false);
    }
  };

  const submitEmail = async (e) => {
    e.preventDefault();
    setError(null);
    if (!checkOrg()) return;
    setLoading(true);
    try {
      done(
        await api('/auth/register', {
          method: 'POST',
          body: { name: form.name.trim(), email: form.email.trim(), password: form.password, ...profilePayload() },
        }),
      );
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const signupWithGoogle = async (googleToken) => {
    setError(null);
    if (!checkOrg()) return;
    setLoading(true);
    try {
      done(await api('/auth/google', { method: 'POST', body: { ...googleToken, intent: 'signup', ...profilePayload() } }));
    } catch (err) {
      if (err.code === 'GOOGLE_TOKEN_INVALID') {
        setPendingGoogle(null);
        setError({ message: 'Your Google session expired. Please click "Sign up with Google" again.' });
      } else {
        if (err.code === 'ALREADY_REGISTERED') setPendingGoogle(null);
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const orgFields = isOrg && (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <Field label={orgLabel}>
        {(id) => (
          <input
            id={id}
            className="input"
            value={form.organization}
            onChange={set('organization')}
            placeholder={form.role === 'ngo' ? 'e.g. Annapurna Food Bank' : 'e.g. Spice Garden Restaurant'}
            required
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" optional hint="Shared only with confirmed pickups.">
          {(id) => (
            <div className="relative">
              <FiPhone className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
              <input id={id} className="input pl-10" value={form.phone} onChange={set('phone')} placeholder="+91 98xxx xxxxx" />
            </div>
          )}
        </Field>
        <Field label="Location" hint={form.role === 'ngo' ? 'Used to alert you about nearby food.' : 'Default pickup point.'}>
          <button
            type="button"
            className={cx('btn w-full', form.lat ? 'btn-secondary text-brand-200' : 'btn-secondary')}
            onClick={useMyLocation}
            disabled={locating}
          >
            {locating ? <Spinner className="h-4 w-4" /> : form.lat ? <FiCheckCircle /> : <FiMapPin />}
            {form.lat ? 'Location set' : 'Use my location'}
          </button>
        </Field>
      </div>
      <Field label="Address" optional>
        {(id) => (
          <input id={id} className="input" value={form.address} onChange={set('address')} placeholder="Street, area, city" />
        )}
      </Field>
    </div>
  );

  return (
    <AuthLayout
      title={pendingGoogle ? 'One last step' : 'Create your account'}
      subtitle={
        pendingGoogle
          ? 'Your Google account isn’t registered yet. Choose how you’ll use EcoAI to finish signing up.'
          : 'Join citizens, restaurants and NGOs making cities cleaner and hunger-free.'
      }
    >
      <p className="label">I am a…</p>
      <div className="mb-6 grid gap-2 sm:grid-cols-3">
        {ROLES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setForm((f) => ({ ...f, role: r.value }))}
            className={cx(
              'rounded-2xl border p-3 text-left transition',
              form.role === r.value
                ? 'border-brand-400/60 bg-brand-400/10 ring-1 ring-brand-400/30'
                : 'border-white/10 bg-white/[0.02] hover:border-white/20',
            )}
          >
            <span className="text-xl">{r.emoji}</span>
            <span className="mt-1 block text-sm font-semibold text-white">{r.title}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-ink-400">{r.text}</span>
          </button>
        ))}
      </div>

      {isOrg && (
        <Alert tone="amber" className="mb-5">
          {form.role === 'ngo' ? 'NGO' : 'Restaurant'} accounts are verified by an EcoAI admin before they can use the
          platform — usually within 24 hours. We’ll email you as soon as yours is approved.
        </Alert>
      )}

      {notRegistered && !error && (
        <Alert tone="sky" className="mb-5">
          <b>{notRegistered}</b> isn’t registered on EcoAI yet. Create your account below — it only takes a minute.
        </Alert>
      )}

      {error && (
        <Alert className="mb-5">
          {error.code === 'ALREADY_REGISTERED' && <b className="block">This account already exists.</b>}
          {error.message}
          {error.code === 'ALREADY_REGISTERED' && (
            <button
              type="button"
              className="ml-1 font-semibold underline"
              onClick={() => navigate('/login', { state: { email: error.data?.details?.email || form.email } })}
            >
              Log in instead
            </button>
          )}
        </Alert>
      )}

      {pendingGoogle ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <Avatar name={pendingGoogle.name || pendingGoogle.email} src={pendingGoogle.picture} size="h-11 w-11" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{pendingGoogle.name || 'Google account'}</p>
              <p className="truncate text-sm text-ink-400">{pendingGoogle.email}</p>
            </div>
          </div>
          {orgFields}
          <button
            type="button"
            className="btn btn-primary btn-lg w-full"
            disabled={loading}
            onClick={() => signupWithGoogle({ accessToken: pendingGoogle.accessToken, credential: pendingGoogle.credential })}
          >
            {loading ? <Spinner className="h-4 w-4" /> : <>Create account with Google <FiArrowRight /></>}
          </button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => setPendingGoogle(null)}>
            Use email instead
          </button>
        </div>
      ) : (
        <>
          {orgFields && <div className="mb-5">{orgFields}</div>}
          <GoogleButton mode="signup" onToken={signupWithGoogle} disabled={loading} />
          <OrDivider label="or sign up with email" />
          <form onSubmit={submitEmail} className="space-y-4">
            <Field label={isOrg ? 'Your name' : 'Full name'}>
              {(id) => (
                <div className="relative">
                  <FiUser className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
                  <input
                    id={id}
                    className="input pl-10"
                    value={form.name}
                    onChange={set('name')}
                    placeholder="Priya Singh"
                    autoComplete="name"
                    required
                  />
                </div>
              )}
            </Field>
            <Field label="Email">
              {(id) => (
                <div className="relative">
                  <FiMail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
                  <input
                    id={id}
                    type="email"
                    className="input pl-10"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              )}
            </Field>
            <Field label="Password">
              {(id) => (
                <PasswordInput
                  id={id}
                  value={form.password}
                  onChange={set('password')}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  showStrength
                />
              )}
            </Field>
            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
              {loading ? <Spinner className="h-4 w-4" /> : <>Create account <FiArrowRight /></>}
            </button>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-sm text-ink-400">
        Already registered?{' '}
        <Link to="/login" state={{ email: form.email }} className="link">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
