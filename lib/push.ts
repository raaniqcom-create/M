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

async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  return (
    (await registration.pushManager.getSubscription()) ??
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    })
  );
}

export async function subscribeToStation(
  stationId: string,
  role: 'driver' | 'owner' = 'driver'
): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if ((await Notification.requestPermission()) !== 'granted') return false;

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
  if (error) return false;

  localStorage.setItem(subKey(stationId, role), json.endpoint!);
  return true;
}

export async function unsubscribeFromStation(
  stationId: string,
  role: 'driver' | 'owner' = 'driver'
): Promise<void> {
  const endpoint = localStorage.getItem(subKey(stationId, role));
  if (!endpoint) return;
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('station_id', stationId)
    .eq('endpoint', endpoint)
    .eq('role', role);
  localStorage.removeItem(subKey(stationId, role));
}
