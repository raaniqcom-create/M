'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TRAFFIC_COLORS, TRAFFIC_LABELS } from '@/lib/products';
import type { StationTrafficAvg, TrafficLevel } from '@/types/database';

const LEVELS: TrafficLevel[] = ['green', 'yellow', 'red'];
const VOTE_WINDOW_MS = 30 * 60 * 1000;

export function TrafficVote({
  stationId,
  traffic,
}: {
  stationId: string;
  traffic: StationTrafficAvg | null;
}) {
  const voteKey = `voted:${stationId}`;
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);

  // survive a refresh: one vote per station per 30-minute window
  useEffect(() => {
    const last = Number(localStorage.getItem(voteKey) ?? 0);
    if (Date.now() - last < VOTE_WINDOW_MS) setVoted(true);
  }, [voteKey]);

  async function vote(level: TrafficLevel) {
    if (voted || busy) return;
    setBusy(true);
    const { error } = await supabase.from('traffic_votes').insert({ station_id: stationId, level });
    setBusy(false);
    if (!error) {
      localStorage.setItem(voteKey, String(Date.now()));
      setVoted(true);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">
          {voted ? 'شكراً، تم تسجيل تقييمك' : 'كيف الازدحام الآن؟'}
        </span>
        {traffic && traffic.total_votes > 0 && (
          <span className="text-xs text-slate-400">{traffic.total_votes} تقييم / ٣٠ دقيقة</span>
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
    </div>
  );
}
