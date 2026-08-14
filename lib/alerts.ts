'use client';

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

  const { error: gone } = await supabase.rpc('alerts_unsubscribe', {
    p_address: target.address,
  });
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
  announceChange();
  return true;
}
