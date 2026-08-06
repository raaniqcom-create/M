import type { Config } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Runs on Netlify's scheduler, not as a public URL — there is no endpoint an
// outsider could hit to spam owners.
export const config: Config = { schedule: '*/30 * * * *' };

const STALE_MINUTES = 30;
const BAGHDAD = 'Asia/Baghdad';

const PRODUCT_LABELS: Record<string, string> = {
  gasoline_regular: 'بانزين عادي',
  gasoline_premium: 'بانزين محسن',
  gasoline_super: 'بانزين سوبر',
  kerosene: 'كاز',
  gas: 'غاز',
  lpg: 'LPG',
  white_oil: 'نفط أبيض',
};

function baghdadMinutesNow(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BAGHDAD,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function isOpenNow(s: { is_24h: boolean; opens_at: string; closes_at: string }): boolean {
  if (s.is_24h) return true;
  const now = baghdadMinutesNow();
  const open = toMinutes(s.opens_at);
  const close = toMinutes(s.closes_at);
  return close > open ? now >= open && now < close : now >= open || now < close;
}

export default async function handler() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  webpush.setVapidDetails(
    'mailto:admin@muhta.app',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

  const { data: stations } = await db
    .from('stations')
    .select('id, name, is_24h, opens_at, closes_at, manual_traffic_level, last_reminded_at')
    .eq('status', 'approved');

  if (!stations?.length) return new Response('no stations');

  // Only nag a station while its pumps are actually running, and never twice
  // inside one window even if the scheduler double-fires.
  const candidates = stations.filter(
    (s) => isOpenNow(s) && (!s.last_reminded_at || s.last_reminded_at < cutoff)
  );
  if (!candidates.length) return new Response('nothing due');

  const ids = candidates.map((s) => s.id);

  const [{ data: products }, { data: subs }] = await Promise.all([
    db.from('station_products').select('station_id, product, is_available, updated_at').in('station_id', ids),
    db.from('push_subscriptions').select('id, station_id, endpoint, p256dh, auth').eq('role', 'owner').in('station_id', ids),
  ]);

  const subsByStation = new Map<string, typeof subs>();
  for (const sub of subs ?? []) {
    subsByStation.set(sub.station_id, [...(subsByStation.get(sub.station_id) ?? []), sub]);
  }

  const dead: string[] = [];
  const reminded: string[] = [];
  let sent = 0;

  for (const station of candidates) {
    const targets = subsByStation.get(station.id) ?? [];
    if (!targets.length) continue;

    const rows = (products ?? []).filter((p) => p.station_id === station.id);
    const stale = rows.filter((p) => p.updated_at < cutoff);
    if (!stale.length) continue;

    const available = rows.filter((p) => p.is_available).map((p) => PRODUCT_LABELS[p.product]);
    const body = available.length
      ? `المعروض حالياً: ${available.join(' · ')}. هل ما زال صحيحاً؟`
      : 'لا يوجد أي منتج معلن كمتوفر. حدّث الحالة ليراك السائقون.';

    const payload = JSON.stringify({
      title: `${station.name} — تحديث الحالة`,
      body,
      stationId: station.id,
      url: '/owner',
    });

    const results = await Promise.allSettled(
      targets.map((t) =>
        webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          payload
        )
      )
    );

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') sent++;
      // 404/410 means the browser dropped the subscription — prune it
      else if ([404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0)) {
        dead.push(targets[i].id);
      }
    });

    reminded.push(station.id);
  }

  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);
  if (reminded.length) {
    await db.from('stations').update({ last_reminded_at: new Date().toISOString() }).in('id', reminded);
  }

  return new Response(`sent ${sent}, stations ${reminded.length}, pruned ${dead.length}`);
}
