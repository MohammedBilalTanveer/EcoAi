import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { FiMail, FiShield } from 'react-icons/fi';
import { toast } from 'react-toastify';
import GoogleButton from '../../components/GoogleButton';
import { Alert, Field, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import AuthLayout from './AuthLayout';
import PasswordInput from './PasswordInput';

const PORTAL_ROLES = ['staff', 'admin'];

/** Sign-in for city staff and EcoAI admins (served at /staff-login and /admin/login). */
export default function StaffLogin() {
  const { user, signIn } = useAuth();
  const adminEntry = useLocation().pathname.startsWith('/admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
  if (user?.role === 'staff') return <Navigate to="/staff/dashboard" replace />;

  /** Only staff and admin sessions are kept from this page. */
  const enter = (data) => {
    if (!PORTAL_ROLES.includes(data.user.role)) {
      setError({ message: 'This is not a staff or admin account. Use the regular sign in instead.' });
      return;
    }
    signIn(data);
    toast.success(data.user.role === 'admin' ? 'Signed in to the admin panel.' : 'Signed in to the staff portal.');
  };

  const attempt = async (request) => {
    setLoading(true);
    setError(null);
    try {
      enter(await request());
    } catch (err) {
      setError(err.code === 'USER_NOT_FOUND' ? { message: 'No staff or admin account exists for this email.' } : err);
    } finally {
      setLoading(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    attempt(() => api('/auth/login', { method: 'POST', body: { email, password } }));
  };

  // For staff accounts an admin created without a password.
  const google = (token) => attempt(() => api('/auth/google', { method: 'POST', body: { ...token, intent: 'login' } }));

  return (
    <AuthLayout
      title={adminEntry ? 'Admin login' : 'Staff & admin login'}
      subtitle={
        adminEntry
          ? 'Approve restaurants and NGOs, manage users and review every report filed.'
          : 'Staff review dumping reports and moderate food listings. Admins also approve partners and manage users.'
      }
    >
      {user && (
        <Alert tone="amber" className="mb-5">
          You are signed in as {user.name}, which is not a staff or admin account.
        </Alert>
      )}
      {error && <Alert className="mb-5">{error.message}</Alert>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Work email">
          {(id) => (
            <div className="relative">
              <FiMail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
              <input
                id={id}
                type="email"
                className="input pl-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@city.gov.in"
                autoComplete="username"
                required
              />
            </div>
          )}
        </Field>
        <Field label="Password">
          {(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="current-password" />}
        </Field>
        <button type="submit" className="btn btn-accent btn-lg w-full" disabled={loading}>
          {loading ? <Spinner className="h-4 w-4" /> : <><FiShield /> Sign in</>}
        </button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-ink-500">
        <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
      </div>
      <GoogleButton mode="login" onToken={google} disabled={loading} />
      <p className="mt-6 text-center text-sm text-ink-400">
        Citizen, restaurant or NGO?{' '}
        <Link to="/login" className="link">
          Regular sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
