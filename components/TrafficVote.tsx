'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isOpenNow } from '@/lib/hours';
import {
  activeTrafficLevel,
  trafficSource,
  PRODUCT_LABELS,
  PRODUCT_ORDER,
  TRAFFIC_COLORS,
  TRAFFIC_LABELS,
} from '@/lib/products';
import type {
  FuelProduct,
  ProductTraffic,
  StationProduct,
  StationTrafficAvg,
  TrafficLevel,
} from '@/types/database';

const LEVELS: TrafficLevel[] = ['green', 'yellow', 'red'];
const VOTE_WINDOW_MS = 30 * 60 * 1000;

/** Congestion, asked and answered per product.
 *
 *  A single number for the whole forecourt is unfair to the pump nobody is
 *  queueing at: premium can be twenty cars deep while regular is empty, and
 *  telling everyone «مزدحم» sends them away from fuel they could have had in
 *  two minutes. The database has carried a `product` column on every vote and a
 *  per-product view since the beginning — this screen simply never asked, so
 *  every vote landed with product = null and the view stayed empty. */
export function TrafficVote({
  stationId,
  traffic: initial = null,
  manualLevel = null,
  manualSetAt = null,
  hours,
}: {
  stationId: string;
  traffic?: StationTrafficAvg | null;
  /** what the owner set, and when — its 30-minute expiry is judged here,
   *  because this page is a static file and a build-time clock would freeze it */
  manualLevel?: TrafficLevel | null;
  manualSetAt?: string | null;
  /** Required. This screen used to know nothing about opening hours, so it
   *  showed a queue level for a shut forecourt and let people vote on one —
   *  which is where the stale readings came from in the first place. */
  hours: { is_24h: boolean; opens_at: string; closes_at: string; temp_closed?: boolean };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traffic, setTraffic] = useState<StationTrafficAvg | null>(initial);
  const [lanes, setLanes] = useState<ProductTraffic[]>([]);
  const [available, setAvailable] = useState<FuelProduct[]>([]);
  // set when a level is tapped; the vote is not cast until a product is picked
  const [pending, setPending] = useState<TrafficLevel | null>(null);
  const [voted, setVoted] = useState<string[]>([]);

  const key = (p: FuelProduct | null) => `voted:${stationId}:${p ?? 'all'}`;

  const refresh = useCallback(async () => {
    // The station page is a static file, so anything passed in was true when
    // the site was last built. Votes expire after 30 minutes — a build-time
    // count is almost always wrong by the time somebody reads it.
    const [avg, lane, prod] = await Promise.all([
      supabase.from('station_traffic_avg').select('*').eq('station_id', stationId).maybeSingle(),
      supabase.from('station_product_traffic').select('*').eq('station_id', stationId),
      supabase
        .from('station_products')
        .select('*')
        .eq('station_id', stationId)
        .eq('is_available', true),
    ]);
    setTraffic((avg.data as StationTrafficAvg) ?? null);
    setLanes((lane.data as ProductTraffic[]) ?? []);
    setAvailable(
      PRODUCT_ORDER.filter((p) =>
        ((prod.data as StationProduct[]) ?? []).some((r) => r.product === p)
      )
    );
  }, [stationId]);

  // one vote per product per 30-minute window, remembered across a refresh
  useEffect(() => {
    const done: string[] = [];
    for (const p of [...PRODUCT_ORDER, null]) {
      const last = Number(localStorage.getItem(key(p)) ?? 0);
      if (Date.now() - last < VOTE_WINDOW_MS) done.push(p ?? 'all');
    }
    setVoted(done);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, refresh]);

  async function vote(level: TrafficLevel, product: FuelProduct | null) {
    // Guarded here, not only by hiding the buttons: a vote cast on a shut
    // station is what produces the stale badge this whole change is about.
    if (busy || !open) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from('traffic_votes')
      .insert({ station_id: stationId, level, product });
    setBusy(false);
    if (e) {
      // a rejected vote used to leave the button silently unchanged, so the
      // person tapped it again and again
      setError('تعذّر تسجيل التقييم. تحقّق من الاتصال وحاول مجدداً.');
      return;
    }
    localStorage.setItem(key(product), String(Date.now()));
    setVoted((v) => [...v, product ?? 'all']);
    setPending(null);
    refresh();
  }

  // مقيسة هنا لا في البناء: الصفحة ملف ثابت، وساعة البناء كانت ستُجمّد الصلاحية
  const station = { manual_traffic_level: manualLevel, manual_traffic_set_at: manualSetAt, ...hours };
  const open = isOpenNow(station);
  const active = activeTrafficLevel(station, traffic);
  const source = trafficSource(station, traffic);
  const rated = available
    .map((p) => [p, lanes.find((l) => l.product === p)] as const)
    .filter((pair): pair is [FuelProduct, ProductTraffic] => !!pair[1]?.majority_level);

  // Closed: no badge, no per-product list, no buttons. The screen says why
  // instead of leaving a silent gap — a missing control reads as a bug.
  if (!open) {
    return (
      <p className="rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-medium text-slate-600">
        المحطة مغلقة الآن — لا ازدحام يُقاس.
      </p>
    );
  }

  return (
    <div>
      {active && (
        <span
          className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TRAFFIC_COLORS[active].bg} ${TRAFFIC_COLORS[active].text}`}
        >
          <span className={`h-2 w-2 rounded-full ${TRAFFIC_COLORS[active].dot}`} />
          الازدحام الآن: {TRAFFIC_LABELS[active]}
          <span className="font-normal opacity-70">
            {source === 'station'
              ? ' · من المحطة'
              : traffic?.total_votes
                ? ` · ${traffic.total_votes} تقييم`
                : ''}
          </span>
        </span>
      )}

      {rated.length > 0 && (
        <ul className="mb-3 space-y-1.5 rounded-xl bg-slate-50 p-3">
          {rated.map(([p, l]) => (
            <li key={p} className="flex items-center gap-2 text-xs">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${TRAFFIC_COLORS[l.majority_level!].dot}`}
              />
              <span className="font-semibold text-slate-700">{PRODUCT_LABELS[p]}</span>
              <span className={`font-extrabold ${TRAFFIC_COLORS[l.majority_level!].text}`}>
                {TRAFFIC_LABELS[l.majority_level!]}
              </span>
              <span className="ms-auto text-slate-400" dir="ltr">
                {l.total_votes}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">
          {pending ? `${TRAFFIC_LABELS[pending]} — على أي منتج؟` : 'كيف الازدحام الآن؟'}
        </span>
        {traffic && traffic.total_votes > 0 && !pending && (
          <span className="text-xs text-slate-400">{traffic.total_votes} تقييم / 30 دقيقة</span>
        )}
      </div>

      {!pending ? (
        <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="تقييم الازدحام">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              disabled={busy}
              onClick={() => setPending(level)}
              aria-label={`الازدحام ${TRAFFIC_LABELS[level]}`}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-colors duration-200 disabled:opacity-45 ${
                traffic?.majority_level === level
                  ? `${TRAFFIC_COLORS[level].bg} ${TRAFFIC_COLORS[level].text} ${TRAFFIC_COLORS[level].border}`
                  : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${TRAFFIC_COLORS[level].dot}`} />
              {TRAFFIC_LABELS[level]}
            </button>
          ))}
        </div>
      ) : (
        <>
          {/* Only what the station says it is selling. Rating the queue for a
              product that is not being pumped is noise, and the list would
              otherwise be seven rows of mostly nothing. */}
          <div className="mt-2 flex flex-wrap gap-2">
            {available.map((p) => {
              const done = voted.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  disabled={busy || done}
                  onClick={() => vote(pending, p)}
                  className={`min-h-[44px] rounded-xl border px-3 text-sm font-bold disabled:opacity-40 ${TRAFFIC_COLORS[pending].border} ${TRAFFIC_COLORS[pending].bg} ${TRAFFIC_COLORS[pending].text}`}
                >
                  {PRODUCT_LABELS[p]}
                  {done ? ' ✓' : ''}
                </button>
              );
            })}

            {/* A station with one pump, or a queue that is not about any one
                product, still needs a way to answer. */}
            <button
              type="button"
              disabled={busy || voted.includes('all')}
              onClick={() => vote(pending, null)}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 disabled:opacity-40"
            >
              الساحة كلها
              {voted.includes('all') ? ' ✓' : ''}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPending(null)}
            className="mt-2 w-full py-1.5 text-xs font-semibold text-slate-500 underline"
          >
            رجوع
          </button>
        </>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-traffic-red">{error}</p>}
    </div>
  );
}
