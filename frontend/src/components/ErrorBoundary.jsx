import { Component } from 'react';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import { isStaleChunkError, reloadForNewVersion } from '../lib/staleBuild';

/** Catches render errors so one broken page doesn't blank the whole site. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (isStaleChunkError(error) && reloadForNewVersion()) return;
    console.error('[ui] page crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    // Navigating elsewhere gives the new page a fresh start.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const stale = isStaleChunkError(this.state.error);
    return (
      <div className="container-page grid min-h-[60vh] place-items-center py-16">
        <div className="card max-w-md p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-400/15 text-2xl text-rose-300">
            <FiAlertTriangle />
          </span>
          <h1 className="mt-5 text-2xl">{stale ? 'EcoAI was just updated' : 'Something went wrong'}</h1>
          <p className="mt-2 text-ink-300">
            {stale
              ? 'Reload the page to get the latest version.'
              : 'This page hit an unexpected error. Reloading usually fixes it.'}
          </p>
          <button type="button" className="btn btn-primary mt-6" onClick={() => window.location.reload()}>
            <FiRefreshCw /> Reload page
          </button>
        </div>
      </div>
    );
  }
}
