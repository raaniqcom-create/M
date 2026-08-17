'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { activeTrafficLevel, TRAFFIC_COLORS, TRAFFIC_LABELS } from '@/lib/products';
import type { StationTrafficAvg, TrafficLevel } from '@/types/database';

const LEVELS: TrafficLevel[] = ['green', 'yellow', 'red'];
const VOTE_WINDOW_MS = 30 * 60 * 1000;

export function TrafficVote({
  stationId,
  traffic: initial = null,
  manualLevel = null,
  manualSetAt = null,
}: {
  stationId: string;
  traffic?: StationTrafficAvg | null;
  /** what the owner set, and when — its 30-minute expiry is judged here,
   *  because this page is a static file and a build-time clock would freeze it */
  manualLevel?: TrafficLevel | null;
  manualSetAt?: string | null;
}) {
  const voteKey = `voted:${stationId}`;
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traffic, setTraffic] = useState<StationTrafficAvg | null>(initial);

  // The station page is a static file, so anything passed in was true when the
  // site was last built. Votes expire after 30 minutes — a build-time count is
  // almost always wrong by the time somebody reads it.
  async function refresh() {
    const { data } = await supabase
      .from('station_traffic_avg')
      .select('*')
      .eq('station_id', stationId)
      .maybeSingle();
    setTraffic((data as StationTrafficAvg) ?? null);
  }

  // survive a refresh: one vote per station per 30-minute window
  useEffect(() => {
    const last = Number(localStorage.getItem(voteKey) ?? 0);
    if (Date.now() - last < VOTE_WINDOW_MS) setVoted(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voteKey, stationId]);

  async function vote(level: TrafficLevel) {
    if (voted || busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from('traffic_votes').insert({ station_id: stationId, level });
    setBusy(false);
    if (e) {
      // a rejected vote used to leave the button silently unchanged, so the
      // person tapped it again and again
      setError('تعذّر تسجيل التقييم. تحقّق من الاتصال وحاول مجدداً.');
      return;
    }
    localStorage.setItem(voteKey, String(Date.now()));
    setVoted(true);
    refresh();
  }

  // مقيسة هنا لا في البناء: الصفحة ملف ثابت، وساعة البناء كانت ستُجمّد الصلاحية
  const active = activeTrafficLevel(
    { manual_traffic_level: manualLevel, manual_traffic_set_at: manualSetAt },
    traffic
  );

  return (
    <div>
      {active && (
        <span
          className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TRAFFIC_COLORS[active].bg} ${TRAFFIC_COLORS[active].text}`}
        >
          <span className={`h-2 w-2 rounded-full ${TRAFFIC_COLORS[active].dot}`} />
          الازدحام الآن: {TRAFFIC_LABELS[active]}
        </span>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">
          {voted ? 'شكراً، تم تسجيل تقييمك' : 'كيف الازدحام الآن؟'}
        </span>
        {traffic && traffic.total_votes > 0 && (
          <span className="text-xs text-slate-400">{traffic.total_votes} تقييم / 30 دقيقة</span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="تقييم الازدحام">
        {LEVELS.map((level) => {
          const isMajority = traffic?.majority_level === level;
          return (
            <button
              key={level}
              type="button"
              disabled={voted || busy}
              onClick={() => vote(level)}
              aria-label={`الازدحام ${TRAFFIC_LABELS[level]}`}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-colors duration-200 disabled:opacity-45 ${
                isMajority
                  ? `${TRAFFIC_COLORS[level].bg} ${TRAFFIC_COLORS[level].text} ${TRAFFIC_COLORS[level].border}`
                  : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${TRAFFIC_COLORS[level].dot}`} />
              {TRAFFIC_LABELS[level]}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-traffic-red">{error}</p>}
    </div>
  );
}
