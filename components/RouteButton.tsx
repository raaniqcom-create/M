'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPinIcon } from './icons';

// Most drivers in Iraq navigate with Waze, a good number with Google Maps, and
// there is no reliable way to detect which is installed — so we ask instead of
// guessing, and put whichever they picked last on top.
const LAST = 'route-app';

type App = 'waze' | 'google';

const LINKS: Record<App, { label: string; url: (lat: number, lng: number) => string }> = {
  waze: {
    label: 'Waze',
    url: (lat, lng) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  },
  google: {
    label: 'خرائط Google',
    url: (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  },
};

export function RouteButton({
  lat,
  lng,
  stationId,
  stationName,
  compact = false,
}: {
  lat: number;
  lng: number;
  stationId?: string;
  stationName?: string;
  /** زرّ أيقونةٍ مربّع داخل بطاقة القائمة، بدل زرٍّ بعرض البطاقة. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState<App>('waze');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(LAST);
    if (saved === 'waze' || saved === 'google') setFirst(saved);
  }, []);

  // tapping anywhere else should dismiss, the same as any native sheet
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const order: App[] = first === 'waze' ? ['waze', 'google'] : ['google', 'waze'];

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="الطريق إلى المحطة"
        className={
          compact
            ? 'grid h-8 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-brand-700 active:bg-brand-50'
            : 'btn-ghost w-full'
        }
      >
        <MapPinIcon className="h-4 w-4" />
        {!compact && 'الطريق'}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft">
          {order.map((app) => (
            <a
              key={app}
              href={LINKS[app].url(lat, lng)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                localStorage.setItem(LAST, app);
                // Remember the trip. Twenty minutes from now this driver is
                // the only person on earth who knows what the queue was like.
                if (stationId) {
                  localStorage.setItem(
                    'trip',
                    JSON.stringify({ id: stationId, name: stationName ?? '', at: Date.now() })
                  );
                }
                setOpen(false);
              }}
              className="block px-3 py-2.5 text-center text-sm font-semibold text-slate-700 active:bg-slate-50"
            >
              {LINKS[app].label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
