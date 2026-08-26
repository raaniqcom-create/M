'use client';

import { supabase } from './supabase';
import type { FuelProduct, TrafficLevel } from '@/types/database';
import { randomId } from './uid';

/** Casting a traffic vote, through the one door the database still accepts.
 *
 *  Direct inserts into `traffic_votes` are revoked. They used to be open to
 *  anyone holding the published anon key — `with check (true)` — so a rival
 *  station owner could set a competitor to «مزدحم» with one curl, and with 26
 *  votes on the whole platform two or three of them decide what a station
 *  looks like. The rules now live in cast_traffic_vote(): one vote per device
 *  per station per product per 30 minutes, station must be open, and a
 *  "I am standing here" claim is measured against the station's coordinates
 *  server-side.
 *
 *  Stated plainly because someone will read this later and assume more than it
 *  does: a device id in localStorage is not an identity, and coordinates can
 *  be forged. This raises the cost of tampering from one tap to writing a
 *  program. Stopping the second kind needs real accounts, and the price of
 *  those is that the app stops working without one. */

const DEVICE_KEY = 'device-vote-id';

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // private mode: a per-session id still stops accidental double taps
    return 'ephemeral-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export type VoteResult =
  | 'ok'
  | 'too_soon'
  | 'closed'
  | 'too_far'
  | 'no_location'
  | 'no_station'
  | 'no_device'
  | 'failed';

export const VOTE_MESSAGES: Record<Exclude<VoteResult, 'ok'>, string> = {
  too_soon: 'قيّمت هذه المحطة قبل قليل. جرّب بعد نصف ساعة.',
  closed: 'المحطة مغلقة الآن — لا ازدحام يُقاس.',
  too_far: 'التقييم لمن يقف في المحطة. اقترب منها ثم أعد المحاولة.',
  no_location: 'تعذّر تحديد موقعك، والتقييم من المكان نفسه.',
  no_station: 'المحطة غير متاحة.',
  no_device: 'تعذّر التعرّف على الجهاز.',
  failed: 'تعذّر إرسال التقييم. تأكد من الاتصال وأعد المحاولة.',
};

export async function castVote(opts: {
  stationId: string;
  level: TrafficLevel;
  product: FuelProduct | null;
  /** 'here' is checked against the station's coordinates in the database. */
  source: 'here' | 'trip';
  coords?: { lat: number; lng: number } | null;
}): Promise<VoteResult> {
  const { data, error } = await supabase.rpc('cast_traffic_vote', {
    p_station: opts.stationId,
    p_level: opts.level,
    p_product: opts.product,
    p_device: deviceId(),
    p_source: opts.source,
    p_lat: opts.coords?.lat ?? null,
    p_lng: opts.coords?.lng ?? null,
  });
  if (error) return 'failed';
  return (data as VoteResult) ?? 'failed';
}

/** The current position, or null — never prompts. Asking for location at the
 *  moment somebody taps «خفيف» turns a one-tap answer into a permission
 *  dialogue, and most people decline a dialogue they did not expect. */
export async function quietPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (!navigator.geolocation) return null;
    const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (status && status.state !== 'granted') return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { maximumAge: 60_000, timeout: 8_000 }
      );
    });
  } catch {
    return null;
  }
}
