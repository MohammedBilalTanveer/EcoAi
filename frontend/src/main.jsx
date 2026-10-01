import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { reloadForNewVersion } from './lib/staleBuild';
import './index.css';

// After a redeploy, an open tab may ask for page files that no longer exist.
// Vite reports it here; reloading picks up the new version.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
