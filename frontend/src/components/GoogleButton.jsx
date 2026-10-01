import { useState } from 'react';
import { GoogleOAuthProvider, useGoogleLogin, useGoogleOAuth } from '@react-oauth/google';
import { toast } from 'react-toastify';
import { useConfig } from '../context/ConfigContext';
import { Spinner } from './ui';

const LABEL = { login: 'Continue with Google', signup: 'Sign up with Google' };

const BUTTON =
  'flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 text-[15px] font-semibold text-[#1f1f1f] shadow-sm ring-1 ring-inset ring-black/10 transition hover:bg-[#f3f3f3] active:bg-[#e8e8e8] disabled:cursor-not-allowed disabled:opacity-60';

/** Google's four-colour "G" mark. */
export function GoogleLogo({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function ConfiguredButton({ label, onToken, disabled }) {
  const [opening, setOpening] = useState(false);
  const { scriptLoadedSuccessfully: ready } = useGoogleOAuth();
  const login = useGoogleLogin({
    flow: 'implicit',
    scope: 'openid email profile',
    onSuccess: (res) => {
      setOpening(false);
      if (res.access_token) onToken({ accessToken: res.access_token });
    },
    onError: () => {
      setOpening(false);
      toast.error('Google sign-in failed. Please try again.');
    },
    onNonOAuthError: (err) => {
      setOpening(false);
      if (err?.type === 'popup_failed_to_open') {
        toast.error('Your browser blocked the Google window. Allow pop-ups for this site and try again.');
      }
    },
  });

  return (
    <button
      type="button"
      className={BUTTON}
      disabled={disabled || opening || !ready}
      onClick={() => {
        setOpening(true);
        login();
      }}
    >
      {opening || !ready ? <Spinner className="h-5 w-5 text-gray-500" /> : <GoogleLogo />}
      <span>{label}</span>
    </button>
  );
}

/**
 * EcoAI-styled Google sign-in button. On success calls onToken({ accessToken }),
 * which the server verifies against our Google client id.
 */
export default function GoogleButton({ mode = 'login', onToken, disabled }) {
  const { loaded, googleClientId } = useConfig();
  const label = LABEL[mode] || LABEL.login;

  if (!loaded) {
    // Still reaching the server (it may be waking up).
    return (
      <button type="button" className={BUTTON} disabled>
        <Spinner className="h-5 w-5 text-gray-500" />
        <span>{label}</span>
      </button>
    );
  }
  if (googleClientId) {
    // Google's script loads only on pages that show this button.
    return (
      <GoogleOAuthProvider clientId={googleClientId}>
        <ConfiguredButton label={label} onToken={onToken} disabled={disabled} />
      </GoogleOAuthProvider>
    );
  }

  return (
    <button
      type="button"
      className={BUTTON}
      disabled={disabled}
      onClick={() =>
        toast.info(
          import.meta.env.DEV
            ? 'Google sign-in isn’t set up yet. Add GOOGLE_CLIENT_ID to server/.env and restart the server.'
            : 'Google sign-in is unavailable right now. Please use your email instead.',
        )
      }
    >
      <GoogleLogo />
      <span>{label}</span>
    </button>
  );
}
