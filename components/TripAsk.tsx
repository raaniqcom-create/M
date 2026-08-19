'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isOpenNow } from '@/lib/hours';
import { PRODUCT_LABELS, TRAFFIC_COLORS, TRAFFIC_LABELS } from '@/lib/products';
import { distanceKm } from '@/lib/stations';
import { castVote, quietPosition, VOTE_MESSAGES } from '@/lib/vote';
import type { FuelProduct, StationWithStatus, TrafficLevel } from '@/types/database';

const LEVELS: TrafficLevel[] = ['green', 'yellow', 'red'];
const KEY = 'trip';
const MIN_MS = 15 * 60_000; // long enough to have arrived
const MAX_MS = 3 * 60 * 60_000; // after this they no longer remember

/** Close enough to be standing on the forecourt rather than driving past. */
const NEAR_KM = 0.2;

interface Ask {
  id: string;
  name: string;
  /** true when we found them standing at the station, not just intending to go */
  here: boolean;
}

/** Asks about the queue at the one moment the driver actually knows.
 *
 *  Two ways in, cheapest first:
 *   • They are AT the station right now — the honest signal, and the only one
 *     that catches a driver who never tapped a route button.
 *   • They tapped الطريق a while ago — an intention, which they may not have
 *     followed through on.
 *
 *  The location check is deliberately silent: it runs only when the browser
 *  already holds a granted permission, so opening the app never triggers a
 *  prompt nobody asked for. Someone who declined location simply falls back to
 *  the trip path. */
export function TripAsk({ stations }: { stations: StationWithStatus[] | null }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [product, setProduct] = useState<FuelProduct | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // path 1: the remembered intention
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const t = JSON.parse(raw) as { id: string; name: string; at: number };
      const age = Date.now() - t.at;
      if (age < MIN_MS) return;
      if (age > MAX_MS) return void localStorage.removeItem(KEY);
      setAsk({ id: t.id, name: t.name, here: false });
    } catch {
      localStorage.removeItem(KEY);
    }
  }, []);

  // path 2: they are standing here now — outranks the intention
  useEffect(() => {
    if (!stations?.length || !navigator.geolocation) return;
    let cancelled = false;

    (async () => {
      try {
        const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        if (status && status.state !== 'granted') return; // never prompt from here
      } catch {
        return; // no permissions API: stay silent rather than risk a prompt
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const { latitude, longitude } = pos.coords;
          const near = stations
            .filter((s) => s.lat != null && s.lng != null)
            .map((s) => ({ s, d: distanceKm({ lat: latitude, lng: longitude }, { lat: s.lat!, lng: s.lng! }) }))
            .sort((a, b) => a.d - b.d)[0];
          // Standing next to a shut station is not standing in its queue. This
          // is the second unguarded vote path — it fires on proximity alone,
          // and a 4am «خفيف» here is exactly the stale badge people complained
          // about seeing on a closed card.
          if (near && near.d <= NEAR_KM && isOpenNow(near.s)) {
            // Kept so the database can check the claim itself. A distance the
            // browser computes and sends is not proof, it is an assertion.
            setCoords({ lat: latitude, lng: longitude });
            setAsk({ id: near.s.id, name: near.s.name, here: true });
          }
        },
        () => {},
        { maximumAge: 60_000, timeout: 8_000 }
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [stations]);

  // What this station actually sells right now, from the list already loaded.
  const askProducts = ask
    ? ((stations ?? []).find((s) => s.id === ask.id)?.products ?? [])
        .filter((p) => p.is_available)
        .map((p) => p.product)
    : [];

  async function answer(level: TrafficLevel) {
    if (!ask || !product) return;
    localStorage.removeItem(KEY);
    // the pump, not the forecourt: a vote without it cannot be shown on the
    // chip the next driver is actually looking at
    const outcome = await castVote({
      stationId: ask.id,
      level,
      product,
      // «here» is checked against the station's coordinates in the database;
      // a trip is trusted on its own record.
      source: ask.here ? 'here' : 'trip',
      coords,
    });
    if (outcome === 'ok') return setDone(true);
    // Said rather than swallowed. This used to be a bare insert whose failure
    // nobody saw — the card closed and the vote was simply gone.
    setNote(VOTE_MESSAGES[outcome]);
  }

  function dismiss() {
    localStorage.removeItem(KEY);
    setAsk(null);
  }

  if (!ask) return null;

  if (done) {
    return (
      <div className="mb-3 rounded-2xl bg-brand-50 px-4 py-3 text-center text-sm font-bold text-brand-700">
        شكراً — ساعدت غيرك من المستخدمين.
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-2xl border border-brand-100 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold">
          {ask.here
            ? `أنت قرب ${ask.name || 'المحطة'} — شلون الازدحام؟`
            : `شلون كان الطابور بـ${ask.name || 'المحطة'}؟`}
        </p>
        <button type="button" onClick={dismiss} aria-label="إخفاء" className="text-xs text-slate-400">
          ✕
        </button>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {product ? `طابور ${PRODUCT_LABELS[product]}` : 'أي منتج عبّيت؟'}
      </p>

      {/* The station's own products, not a fixed three. It used to offer
          premium/regular/kerosene to every station, so people were asked about
          fuel the forecourt does not sell — and the list is already in memory
          on this page. */}
      {!product && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {askProducts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProduct(p)}
              className="min-h-[44px] rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
            >
              {PRODUCT_LABELS[p]}
            </button>
          ))}
        </div>
      )}

      {note && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          {note}
        </p>
      )}

      <div className={`mt-3 grid grid-cols-3 gap-2 ${product ? '' : 'hidden'}`}>
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
