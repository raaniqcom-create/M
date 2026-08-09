'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TRAFFIC_COLORS, TRAFFIC_LABELS } from '@/lib/products';
import type { TrafficLevel } from '@/types/database';

const LEVELS: TrafficLevel[] = ['green', 'yellow', 'red'];
const KEY = 'trip';
const MIN_MS = 15 * 60_000; // long enough to have arrived
const MAX_MS = 3 * 60 * 60_000; // after this they no longer remember

/** Asks about the queue at the one moment the driver actually knows: after
 *  they have been. The old prompt sat on the home screen before the trip,
 *  where nobody could answer it honestly — hence two votes in two days. */
export function TripAsk() {
  const [trip, setTrip] = useState<{ id: string; name: string } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const t = JSON.parse(raw) as { id: string; name: string; at: number };
      const age = Date.now() - t.at;
      if (age < MIN_MS) return;
      if (age > MAX_MS) return void localStorage.removeItem(KEY);
      setTrip({ id: t.id, name: t.name });
    } catch {
      localStorage.removeItem(KEY);
    }
  }, []);

  async function answer(level: TrafficLevel) {
    if (!trip) return;
    localStorage.removeItem(KEY);
    setDone(true);
    await supabase.from('traffic_votes').insert({ station_id: trip.id, level });
  }

  function dismiss() {
    localStorage.removeItem(KEY);
    setTrip(null);
  }

  if (!trip) return null;

  if (done) {
    return (
      <div className="mb-3 rounded-2xl bg-brand-50 px-4 py-3 text-center text-sm font-bold text-brand-700">
        شكراً — ساعدت غيرك من السائقين.
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-2xl border border-brand-100 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold">
          كيف كان الطابور في {trip.name || 'المحطة'}؟
        </p>
        <button type="button" onClick={dismiss} aria-label="إخفاء" className="text-xs text-slate-400">
          ✕
        </button>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">ضغطة واحدة تفيد بقية السائقين.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => answer(l)}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold ${TRAFFIC_COLORS[l].bg} ${TRAFFIC_COLORS[l].text} ${TRAFFIC_COLORS[l].border}`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${TRAFFIC_COLORS[l].dot}`} />
            {TRAFFIC_LABELS[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
