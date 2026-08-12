import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Route all uncaught errors through console.error so the Replit log collector
// captures them (window.onerror alone is NOT captured by it).
window.addEventListener('error', (e) => {
  console.error('[uncaught error]', e.message, e.filename, e.lineno, e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled rejection]', e.reason);
});

// ── PWA: register service worker ────────────────────────────────────────────
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[MIDIVid] Service worker registered — scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('[MIDIVid] Service worker registration failed:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
