import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA: register the offline-shell service worker in production only.
// (usePushNotifications also registers it for push — registration is
// idempotent and both paths share the same scope.)
// BASE_URL is '/' on Netlify and '/afa-registration/' on the GH Pages
// mirror — register relative to it so both deployments install correctly.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      /* SW registration is best-effort — app works without it */
    });
  });
}
