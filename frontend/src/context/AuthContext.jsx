import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ACCOUNT_STATUS_EVENT, api, clearToken, getToken, LOGOUT_EVENT, setToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setReady(true);
      return undefined;
    }
    api('/auth/me')
      .then((data) => !cancelled && setUser(data.user))
      .catch(() => clearToken())
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    // The server rejected a request because the account isn't active: reload it so the
    // app shows the "awaiting approval" screen.
    const onStatus = () =>
      api('/auth/me')
        .then((data) => setUser(data.user))
        .catch(() => {});
    window.addEventListener(LOGOUT_EVENT, onLogout);
    window.addEventListener(ACCOUNT_STATUS_EVENT, onStatus);
    return () => {
      window.removeEventListener(LOGOUT_EVENT, onLogout);
      window.removeEventListener(ACCOUNT_STATUS_EVENT, onStatus);
    };
  }, []);

  /** Stores the session returned by /auth/login, /auth/register or /auth/google. */
  const signIn = useCallback(({ token, user: nextUser }) => {
    setToken(token);
    setUser(nextUser);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const data = await api('/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({ user, ready, signIn, signOut, refresh, setUser }),
    [user, ready, signIn, signOut, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where to send someone right after they sign in. */
// eslint-disable-next-line react-refresh/only-export-components
export const homeFor = (user) =>
  ({ admin: '/admin', staff: '/staff/dashboard', restaurant: '/food/dashboard', ngo: '/food' })[user?.role] || '/';
