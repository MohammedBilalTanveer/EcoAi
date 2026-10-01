const TOKEN_KEY = 'ecoai_token';
/**
 * Where the API lives. Empty when the website and API share a domain (one server);
 * set VITE_API_URL at build time when the frontend is hosted separately (e.g. Vercel).
 */
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
export const LOGOUT_EVENT = 'ecoai:logout';
/** detail: true while the first request is slow (a free-tier server waking up), then false. */
export const SERVER_WAKING_EVENT = 'ecoai:server-waking';
/** Fired when the server says the account is pending / rejected / suspended. */
export const ACCOUNT_STATUS_EVENT = 'ecoai:account-status';

export class ApiError extends Error {
  constructor(message, status, code, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable (private mode) */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const getToken = () => storage.get(TOKEN_KEY);
export const setToken = (token) => storage.set(TOKEN_KEY, token);
export const clearToken = () => storage.remove(TOKEN_KEY);
export { storage };

let serverAwake = false;
let wakingShown = false;
function announceWaking(on) {
  if (on === wakingShown) return;
  wakingShown = on;
  window.dispatchEvent(new CustomEvent(SERVER_WAKING_EVENT, { detail: on }));
}

/**
 * Fetch wrapper for the EcoAI API.
 * - JSON bodies are serialised automatically; FormData is sent as-is.
 * - Non-2xx responses throw ApiError with the server's message and code.
 * - A 401 on an authenticated request clears the session.
 */
export async function api(path, { method = 'GET', body, headers = {}, signal, query } = {}) {
  const token = getToken();
  const h = { Accept: 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;

  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let url = `${API_URL}/api${path}`;
  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    const qs = params.toString();
    if (qs) url += `${url.includes('?') ? '&' : '?'}${qs}`;
  }

  // Free hosting puts the server to sleep when idle; the first request then takes up
  // to a minute. Let the UI explain the wait instead of looking broken.
  const waking = serverAwake ? null : setTimeout(() => announceWaking(true), 4000);
  let res;
  try {
    res = await fetch(url, { method, headers: h, body: payload, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the EcoAI server. Check your connection and try again.', 0, 'NETWORK');
  } finally {
    clearTimeout(waking);
  }
  if (!serverAwake) {
    serverAwake = true;
    announceWaking(false);
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && token) {
    clearToken();
    window.dispatchEvent(new Event(LOGOUT_EVENT));
  }
  if (res.status === 403 && data?.code?.startsWith('ACCOUNT_')) {
    window.dispatchEvent(new Event(ACCOUNT_STATUS_EVENT));
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code, data);
  }
  return data;
}
