import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

/**
 * Loads `path` from the API and re-fetches when `path`/`query` change.
 * Pass `null` as path to skip. `pollMs` re-fetches silently on an interval.
 */
export function useApi(path, { query, pollMs, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path && enabled) });
  const queryKey = JSON.stringify(query ?? {});
  const mounted = useRef(true);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!path || !enabled) return null;
      if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await api(path, { query: JSON.parse(queryKey) });
        if (mounted.current) setState({ data, error: null, loading: false });
        return data;
      } catch (error) {
        if (mounted.current) setState((s) => ({ data: silent ? s.data : null, error, loading: false }));
        return null;
      }
    },
    [path, queryKey, enabled],
  );

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!pollMs || !path || !enabled) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load({ silent: true });
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, path, enabled, load]);

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);

  return { ...state, reload: load, setData };
}
