'use client';

import { useEffect, useState } from 'react';
import { isMuted, setMuted } from '@/lib/alertSound';

export function SoundToggle() {
  const [muted, setMutedState] = useState(false);

  useEffect(() => setMutedState(isMuted()), []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    // deliberately silent: the only tap that should make a sound is choosing
    // a tone in the settings drawer
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!muted}
      aria-label={muted ? 'تشغيل صوت التنبيه' : 'كتم صوت التنبيه'}
      title={muted ? 'صوت التنبيه مكتوم' : 'صوت التنبيه يعمل'}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white"
    >
      {muted ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M11 5 6 9H2v6h4l5 4z" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M11 5 6 9H2v6h4l5 4z" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  );
}
