import { Link } from 'react-router-dom';
import { FiCompass } from 'react-icons/fi';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <div className="container-page py-20">
      <EmptyState
        icon={FiCompass}
        title="Page not found"
        action={
          <Link to="/" className="btn btn-primary">
            Go home
          </Link>
        }
      >
        The page you are looking for doesn’t exist or has moved.
      </EmptyState>
    </div>
  );
}
