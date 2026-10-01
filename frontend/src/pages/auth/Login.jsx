import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FiArrowRight, FiMail } from 'react-icons/fi';
import { toast } from 'react-toastify';
import GoogleButton from '../../components/GoogleButton';
import { Alert, Field, Spinner } from '../../components/ui';
import { homeFor, useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import AuthLayout, { OrDivider } from './AuthLayout';
import PasswordInput from './PasswordInput';

export default function Login() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    const target = from ? `${from.pathname}${from.search || ''}` : homeFor(user);
    return <Navigate to={target} replace />;
  }

  const welcome = (data) => {
    signIn(data);
    if (data.user.status === 'pending') toast.info('Your account is still waiting for admin approval.');
    else if (data.user.status === 'active') toast.success(`Welcome back, ${data.user.name.split(' ')[0]}!`);
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      welcome(await api('/auth/login', { method: 'POST', body: { email, password } }));
    } catch (err) {
      if (err.code === 'USER_NOT_FOUND') {
        toast.info(`${email} isn’t registered yet — let’s create your account.`);
        navigate('/signup', { state: { email, from, notRegistered: email } });
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const google = async (googleToken) => {
    setLoading(true);
    setError(null);
    try {
      welcome(await api('/auth/google', { method: 'POST', body: { ...googleToken, intent: 'login' } }));
    } catch (err) {
      if (err.code === 'USER_NOT_FOUND') {
        toast.info(`${err.data?.details?.email || 'This Google account'} isn’t registered yet — finish signing up in one step.`);
        navigate('/signup', { state: { google: { ...googleToken, ...(err.data?.details || {}) }, from } });
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to report dumping, rescue food and track trucks.">
      <GoogleButton mode="login" onToken={google} disabled={loading} />
      <OrDivider label="or sign in with email" />

      {error && (
        <Alert className="mb-5">
          {error.message}
          {error.code === 'USE_GOOGLE' && <span className="mt-1 block text-xs">Use the Google button above.</span>}
        </Alert>
      )}

      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          {(id) => (
            <div className="relative">
              <FiMail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
              <input
                id={id}
                type="email"
                className="input pl-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
          )}
        </Field>
        <Field label="Password">
          {(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="current-password" />}
        </Field>
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
          {loading ? <Spinner className="h-4 w-4" /> : <>Sign in <FiArrowRight /></>}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-400">
        New to EcoAI?{' '}
        <Link to="/signup" state={{ email, from }} className="link">
          Create an account
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-ink-500">
        Municipal staff or admin?{' '}
        <Link to="/staff-login" className="text-ink-300 hover:text-white">
          Staff &amp; admin login
        </Link>
      </p>
    </AuthLayout>
  );
}
