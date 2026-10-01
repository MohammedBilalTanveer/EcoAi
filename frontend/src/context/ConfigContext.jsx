import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

const ConfigContext = createContext({ loaded: false, googleClientId: null, features: {} });

/**
 * Loads public runtime config from the server (Google client id, enabled AI features).
 * The app renders straight away: a sleeping free-tier server can take a while to answer.
 */
export function ConfigProvider({ children }) {
  const [config, setConfig] = useState({ loaded: false, googleClientId: null, features: {} });

  useEffect(() => {
    let cancelled = false;
    const load = (attempt = 0) =>
      api('/config')
        .then((data) => !cancelled && setConfig({ loaded: true, ...data }))
        .catch(() => {
          // Keep trying while the server wakes up or the network comes back.
          if (!cancelled && attempt < 5) setTimeout(() => load(attempt + 1), 3000 * (attempt + 1));
          else if (!cancelled) setConfig((c) => ({ ...c, loaded: true }));
        });
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useConfig = () => useContext(ConfigContext);
