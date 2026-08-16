import { supabase } from './supabase';

// VAPID keys are base64url; the Push API wants a raw Uint8Array. No library
// does this one conversion — it's the standard MDN snippet.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

const subKey = (stationId: string, role: 'driver' | 'owner' = 'driver') =>
  role === 'owner' ? `sub-owner:${stationId}` : `sub:${stationId}`;

export async function isSubscribed(
  stationId: string,
  role: 'driver' | 'owner' = 'driver'
): Promise<boolean> {
  return typeof localStorage !== 'undefined' && localStorage.getItem(subKey(stationId, role)) !== null;
}

/** navigator.serviceWorker.ready never rejects — if the worker fails to
 *  activate it simply hangs, leaving the button spinning forever. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  const registration = await withTimeout(navigator.serviceWorker.ready, 15000);
  if (!registration) return null;

  // Reusing the browser's existing push endpoint is instant; only the very
  // first activation pays the round trip to the push service (FCM / Apple),
  // which is what makes that one tap feel slow on mobile data.
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return withTimeout(
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    }),
    20000
  );
}

/** Resolved once the worker is active, so the first tap doesn't wait for it. */
export function warmUpPush(): void {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    void navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription());
  }
}

export async function subscribeToStation(
  stationId: string,
  role: 'driver' | 'owner' = 'driver'
): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  // asking again when already granted costs a needless round trip on mobile
  if (Notification.permission !== 'granted') {
    if ((await Notification.requestPermission()) !== 'granted') return false;
  }

  const subscription = await getPushSubscription();
  if (!subscription) return false;

  // one browser push endpoint can follow many stations — the row is per pair
  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').insert({
    station_id: stationId,
    role,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  });

  // 23505 = this device already follows this station, which is the desired
  // end state. Any upsert/ON CONFLICT form is rejected outright here: RLS
  // evaluates it against an UPDATE policy that anonymous visitors are not
  // granted, so a plain insert plus this check is the only thing that works.
  if (error && error.code !== '23505') return false;

  localStorage.setItem(subKey(stationId, role), json.endpoint!);
  return true;
}

export async function unsubscribeFromStation(
  stationId: string,
  role: 'driver' | 'owner' = 'driver'
): Promise<void> {
  const endpoint = localStorage.getItem(subKey(stationId, role));
  if (!endpoint) return;
  // Through an RPC rather than a DELETE. The delete policy on this table was
  // USING (true), so the same request with the filters removed emptied it for
  // everybody; the function can only ever reach the one row named here.
  await supabase.rpc('push_unsubscribe', {
    p_station_id: stationId,
    p_endpoint: endpoint,
    p_role: role,
  });
  localStorage.removeItem(subKey(stationId, role));
}
