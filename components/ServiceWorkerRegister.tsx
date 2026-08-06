'use client';

import { useEffect } from 'react';

// next-pwa only auto-registers via pages/_document; App Router needs this.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
