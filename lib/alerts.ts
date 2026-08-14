'use client';

import { supabase } from './supabase';
import { urlBase64ToUint8Array } from './push';
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
 *  back from the server. */

const KEY = 'alerts-choice';

export interface AlertChoice {
  cities: string[];
  products: FuelProduct[];
}

interface Target {
  channel: 'web' | 'ios' | 'android';
  address: string;
  keys: { p256dh?: string; auth?: string } | null;
}

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

/** The phone shells register with APNs/FCM and stash the token; the web asks
 *  the browser for a push endpoint. Both end up as one `address` the server
 *  can post to without caring which it is. */
async function currentTarget(): Promise<Target | null> {
  const cap = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }
  ).Capacitor;

  if (cap?.isNativePlatform?.()) {
    const token = localStorage.getItem('device-token');
    if (!token) return null; // registration hasn't come back yet
    return {
      channel: cap.getPlatform?.() === 'ios' ? 'ios' : 'android',
      address: token,
      keys: null,
    };
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  if (Notification.permission !== 'granted') {
    if ((await Notification.requestPermission()) !== 'granted') return null;
  }

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    }));

  const json = sub.toJSON();
  return {
    channel: 'web',
    address: json.endpoint!,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  };
}

/** Replaces this device's whole subscription. Delete-then-insert rather than a
 *  diff: the set is at most 16 cities x 7 products, and a diff would need to
 *  read the existing rows back — which RLS does not permit. */
export async function saveChoice(choice: AlertChoice): Promise<'ok' | 'no-permission' | 'failed'> {
  const target = await currentTarget();
  if (!target) return 'no-permission';

  await supabase.from('alerts').delete().eq('address', target.address);

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
  // like a rejected write.
  const { error } = await supabase.from('alerts').insert(rows);
  if (error && error.code !== '23505') return 'failed';

  localStorage.setItem(KEY, JSON.stringify(choice));
  return 'ok';
}

export async function clearChoice(): Promise<void> {
  const target = await currentTarget().catch(() => null);
  if (target) await supabase.from('alerts').delete().eq('address', target.address);
  localStorage.removeItem(KEY);
}
