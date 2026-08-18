'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getPushSubscription } from './push';
import type { FuelProduct } from '@/types/database';

/** "Tell me about this fuel, in these cities" — the whole product until the
 *  first stations register.
 *
 *  A row is one (device, city, product) pair. A driver who picks 2 cities and
 *  3 products gets 6 rows, and the matcher in the database sends him one
 *  message however many of them hit at once.
 *
 *  Everything here is insert-and-delete only, never update. Anonymous visitors
 *  hold no UPDATE grant in this project — that is what silently rejected every
 *  device-token upsert for a fortnight — and they hold no SELECT policy
 *  either, so the current choice is mirrored in localStorage rather than read
 *  back from the server. Deletion goes through an RPC keyed on the address:
 *  a plain DELETE policy would let anyone holding the published anon key wipe
 *  every subscription on the platform with one filtered request. */

const KEY = 'alerts-choice';
/** One key per followed station rather than a list inside `alerts-choice`:
 *  a follow and a city choice are set and cleared by different buttons, and
 *  keeping them in one blob is how one would silently overwrite the other. */
const FOLLOW = (stationId: string) => `follow:${stationId}`;
export const ALERTS_CHANGED = 'alerts-changed';

export interface AlertChoice {
  cities: string[];
  products: FuelProduct[];
  /** Kept so unsubscribing never has to re-derive (and re-request) a target. */
  address?: string;
}

interface Target {
  channel: 'web' | 'ios' | 'android';
  address: string;
  keys: { p256dh?: string; auth?: string } | null;
}

export type SaveResult = 'ok' | 'denied' | 'unsupported' | 'pending' | 'failed';

export function readChoice(): AlertChoice | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as AlertChoice;
    return Array.isArray(c.cities) && Array.isArray(c.products) ? c : null;
  } catch {
    return null;
  }
}

/** Two pickers can be mounted at once — the onboarding screen and the one in
 *  the empty state — and each reads localStorage only on mount. Without this
 *  the second still shows "not subscribed" after the first has saved. */
function announceChange() {
  window.dispatchEvent(new Event(ALERTS_CHANGED));
}

function isNative(): boolean {
  return Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
      ?.isNativePlatform?.()
  );
}

/** The phone shells register with APNs/FCM and stash the token; the web asks
 *  the browser for a push endpoint. Both end up as one `address` the server
 *  can post to without caring which it is. */
async function currentTarget(): Promise<Target | 'denied' | 'unsupported' | 'pending'> {
  const cap = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }
  ).Capacitor;

  if (isNative()) {
    // Ask the OS before waiting on anything: a denied device will never
    // produce a token, and polling for one just to blame the user ten seconds
    // later is the worst version of this screen.
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const status = await PushNotifications.checkPermissions();
      if (status.receive !== 'granted') return 'denied';
    } catch {
      return 'unsupported';
    }

    // Registration may still be in flight on a first launch, so wait — but
    // briefly, and report waiting as its own state rather than as a failure.
    let token = localStorage.getItem('device-token');
    for (let i = 0; !token && i < 6; i++) {
      await new Promise((r) => setTimeout(r, 500));
      token = localStorage.getItem('device-token');
    }
    if (!token) return 'pending';

    return {
      channel: cap?.getPlatform?.() === 'ios' ? 'ios' : 'android',
      address: token,
      keys: null,
    };
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') {
    if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  }

  // Reuses lib/push.ts rather than repeating the subscribe dance: that helper
  // carries timeouts around navigator.serviceWorker.ready, which never rejects
  // and simply hangs forever when the worker fails to activate.
  const sub = await getPushSubscription();
  if (!sub) return 'pending';

  const json = sub.toJSON();
  return {
    channel: 'web',
    address: json.endpoint!,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  };
}

/** Replaces this device's whole subscription. Delete-then-insert rather than a
 *  diff: the set is at most 16 cities x 7 products, and a diff would need to
 *  read the existing rows back — which RLS does not permit.
 *
 *  Nothing is written to localStorage until the rows are actually in the
 *  database. The old order — delete, insert, then remember — turned one failed
 *  insert into a driver who is unsubscribed while his screen says otherwise,
 *  and who therefore never finds out he stopped being told. */
export async function saveChoice(choice: AlertChoice): Promise<SaveResult> {
  const target = await currentTarget();
  if (typeof target === 'string') return target;

  // alerts_clear_choice, not alerts_unsubscribe: the latter deletes every row
  // for this address, and this runs on every edit of the city picker — so
  // changing your city would silently drop the stations you follow.
  //
  // Falls back if that function is not deployed yet. Shipping a client that
  // calls an RPC the database does not have would break every alert edit on
  // the platform until the migration landed, and the ordering is not something
  // a person changing their city should ever pay for.
  let { error: gone } = await supabase.rpc('alerts_clear_choice', {
    p_address: target.address,
  });
  if (gone) {
    ({ error: gone } = await supabase.rpc('alerts_unsubscribe', {
      p_address: target.address,
    }));
  }
  if (gone) return 'failed';

  // An empty city list means "anywhere", an empty product list "any fuel" —
  // null carries that in the database, so the matcher needs no special case.
  const cities: (string | null)[] = choice.cities.length ? choice.cities : [null];
  const products: (FuelProduct | null)[] = choice.products.length ? choice.products : [null];

  const rows = cities.flatMap((city) =>
    products.map((product) => ({
      channel: target.channel,
      address: target.address,
      keys: target.keys,
      city,
      product,
    }))
  );

  // No .select() here on purpose: PostgREST turns that into INSERT..RETURNING,
  // which RLS refuses without a SELECT policy — and the failure looks exactly
  // like a rejected write. 23505 is not swallowed either: the delete above
  // means a duplicate can only mean the delete silently did nothing.
  const { error } = await supabase.from('alerts').insert(rows);
  if (error) return 'failed';

  localStorage.setItem(KEY, JSON.stringify({ ...choice, address: target.address }));
  announceChange();
  return 'ok';
}

/** Stopping must never ask for anything. It used to route through
 *  currentTarget(), so "turn alerts off" could raise a permission prompt and
 *  mint a brand-new push subscription on its way to deleting one. */
export async function clearChoice(): Promise<boolean> {
  const saved = readChoice();
  const address = saved?.address;
  if (address) {
    const { error } = await supabase.rpc('alerts_unsubscribe', { p_address: address });
    if (error) return false;
  }
  localStorage.removeItem(KEY);
  // alerts_unsubscribe drops the follow rows too, so the mirrors have to go
  // with them — otherwise every station page keeps claiming "you follow this"
  // for a subscription the server no longer has.
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('follow:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
  announceChange();
  return true;
}

/** ------------------------------------------------------------------------
 *  Following one station.
 *
 *  Same table, same sender, same de-duplication as the city alerts above — a
 *  row with `station_id` set and city/product null. It deliberately does NOT
 *  use push_subscriptions: that table is written by lib/push.ts and read by no
 *  sender at all, so a button built on it would look like it worked and
 *  deliver nothing.
 *
 *  The mirror stores the address, so unfollowing never has to re-derive a push
 *  target — which would raise a permission prompt on the way to cancelling.
 *  --------------------------------------------------------------------- */

export function isFollowing(stationId: string): boolean {
  try {
    return localStorage.getItem(FOLLOW(stationId)) !== null;
  } catch {
    return false;
  }
}

export async function followStation(stationId: string): Promise<SaveResult> {
  const target = await currentTarget();
  if (typeof target === 'string') return target;

  const { error } = await supabase.from('alerts').insert({
    channel: target.channel,
    address: target.address,
    keys: target.keys,
    city: null,
    product: null,
    station_id: stationId,
  });
  // 23505 means this device already follows it — the state the caller asked
  // for, so it is a success, not a failure (same call as lib/push.ts:89).
  if (error && error.code !== '23505') return 'failed';

  localStorage.setItem(FOLLOW(stationId), target.address);
  announceChange();
  return 'ok';
}

export async function unfollowStation(stationId: string): Promise<boolean> {
  const address = localStorage.getItem(FOLLOW(stationId));
  if (address) {
    const { error } = await supabase.rpc('alerts_unfollow_station', {
      p_address: address,
      p_station: stationId,
    });
    if (error) return false;
  }
  localStorage.removeItem(FOLLOW(stationId));
  announceChange();
  return true;
}

/** Every station this device follows, read from the same mirrors isFollowing
 *  uses. There is no server list to ask — `alerts` grants no SELECT. */
export function followedIds(): string[] {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith('follow:'))
      .map((k) => k.slice('follow:'.length));
  } catch {
    return [];
  }
}

/** The star on a station card.
 *
 *  It used to be a separate feature: a list in localStorage that sorted the
 *  station to the top and played a sound *while the home page was open*, and
 *  did nothing at all once the app was closed. A star beside a petrol station
 *  reads as "tell me when this one has fuel", so people starred stations and
 *  waited for a notification that was never coming. Now the star is the
 *  follow — one concept, and the promise it makes is the one it keeps.
 *
 *  The cost is deliberate and visible: tapping a star now asks for
 *  notification permission, where before it asked nothing. That is the honest
 *  price of the star meaning what people already thought it meant. */
export function useFollowedStations() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setIds(followedIds());
    sync();
    window.addEventListener(ALERTS_CHANGED, sync);
    return () => window.removeEventListener(ALERTS_CHANGED, sync);
  }, []);

  const isFollowed = useCallback((id: string) => ids.includes(id), [ids]);

  /** 'ok' when now following, 'off' when unfollowed, otherwise why it failed. */
  const toggle = useCallback(async (id: string): Promise<SaveResult | 'off'> => {
    if (followedIds().includes(id)) {
      await unfollowStation(id);
      return 'off';
    }
    return followStation(id);
  }, []);

  return { followed: ids, isFollowed, toggle };
}

/** ------------------------------------------------------------------------
 *  When this person is willing to be interrupted.
 *
 *  From a complaint: "I already filled my tank — there should be hours for
 *  receiving notifications, not one every day." Two separate answers, and the
 *  complaint contains both: a daily window for when a phone may ring at all,
 *  and a temporary stop for the week you do not need fuel.
 *
 *  Kept on the address, not on the alert rows: a person holds one row per
 *  (city, product) and one per followed station, so a preference copied onto
 *  rows would be missing from the next row they create — and the phone would
 *  ring inside the hours its owner had closed.
 *  --------------------------------------------------------------------- */

const PREFS_KEY = "alerts-prefs";

export interface AlertPrefs {
  /** minutes past midnight, Baghdad. null = no restriction. */
  from: number | null;
  to: number | null;
  /** ISO timestamp; null = not paused. */
  pausedUntil: string | null;
}

export const NO_PREFS: AlertPrefs = { from: null, to: null, pausedUntil: null };

export function readPrefs(): AlertPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return NO_PREFS;
    const p = JSON.parse(raw) as AlertPrefs;
    return {
      from: typeof p.from === "number" ? p.from : null,
      to: typeof p.to === "number" ? p.to : null,
      pausedUntil: typeof p.pausedUntil === "string" ? p.pausedUntil : null,
    };
  } catch {
    return NO_PREFS;
  }
}

/** The push address this device already has, without asking for anything.
 *  Reading it from the mirrors means changing your quiet hours never raises a
 *  permission prompt — the same reason clearChoice avoids currentTarget(). */
function knownAddress(): string | null {
  const saved = readChoice()?.address;
  if (saved) return saved;
  try {
    const k = Object.keys(localStorage).find((x) => x.startsWith("follow:"));
    return k ? localStorage.getItem(k) : null;
  } catch {
    return null;
  }
}

export async function savePrefs(prefs: AlertPrefs): Promise<boolean> {
  const address = knownAddress();
  // Nothing to scope the preference to yet. Store it anyway so the screen
  // reflects the choice, and it lands server-side with the first subscription.
  if (!address) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
    announceChange();
    return true;
  }

  const { error } = await supabase.rpc("alerts_set_prefs", {
    p_address: address,
    p_from: prefs.from,
    p_to: prefs.to,
    p_paused: prefs.pausedUntil,
  });
  if (error) return false;

  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
  announceChange();
  return true;
}

/** Pause for a whole number of days from now. */
export function pausedFor(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}
