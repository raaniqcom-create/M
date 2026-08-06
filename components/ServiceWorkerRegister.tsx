'use client';

import { useEffect } from 'react';

// next-pwa only auto-registers via pages/_document; App Router needs this.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // In development the worker's cache-first rule for /_next/static pins the
    // first bundle it sees — and Turbopack reuses chunk filenames, so every
    // later edit is served stale. Production chunks are content-hashed, so the
    // cache is only a problem here. Unregister instead of registering.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      caches?.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return null;
}
