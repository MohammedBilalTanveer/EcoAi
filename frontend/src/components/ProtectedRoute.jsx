import { Link, Navigate, useLocation } from 'react-router-dom';
import { FiLock } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABEL } from '../lib/format';
import { EmptyState, PageLoader } from './ui';

/**
 * Guards a route. `roles` limits access to specific account types
 * (e.g. ['staff', 'admin'] or ['restaurant', 'citizen']).
 */
export default function ProtectedRoute({ children, roles }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={FiLock}
          title="This page isn't available for your account"
          action={
            <Link to="/" className="btn btn-secondary">
              Back to home
            </Link>
          }
        >
          It is only for {roles.map((r) => ROLE_LABEL[r]).join(' / ')} accounts. You are signed in as{' '}
          {ROLE_LABEL[user.role]}.
        </EmptyState>
      </div>
    );
  }
  return children;
}
