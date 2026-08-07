// Web-push fan-out for "fuel just arrived at this station".
// Moved off the Next.js server so the site can ship as static files.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const PRODUCT_LABELS: Record<string, string> = {
  gasoline_regular: 'بانزين عادي',
  gasoline_premium: 'بانزين محسن',
  gasoline_super: 'بانزين سوبر',
  kerosene: 'كاز',
  gas: 'غاز',
  lpg: 'LPG',
  white_oil: 'نفط أبيض',
};

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  webpush.setVapidDetails(
    'mailto:admin@muhta.online',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!
  );

  const body = await req.json().catch(() => null);
  const stationId = body?.stationId;
  const product = body?.product;

  // Anyone can reach this endpoint, so every claim in the request is checked
  // against the database before a single notification goes out.
  if (typeof stationId !== 'string' || !Object.keys(PRODUCT_LABELS).includes(product)) {
    return json({ error: 'invalid payload' }, 400);
  }

  const { data: station } = await db
    .from('stations')
    .select('name, status')
    .eq('id', stationId)
    .maybeSingle();

  if (!station || station.status !== 'approved') return json({ error: 'station not found' }, 404);

  // only announce fuel that is genuinely in stock right now, so a forged call
  // cannot tell drivers to drive to an empty station
  const { data: row } = await db
    .from('station_products')
    .select('is_available')
    .eq('station_id', stationId)
    .eq('product', product)
    .maybeSingle();

  if (!row?.is_available) return json({ error: 'product not available' }, 409);

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('station_id', stationId)
    .eq('role', 'driver');

  if (!subs?.length) return json({ sent: 0 });

  // the text is built from our own labels, never from the request
  const payload = JSON.stringify({
    title: station.name,
    body: `${PRODUCT_LABELS[product]} متوفر الآن`,
    stationId,
    url: `/station/${stationId}`,
  });

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );

  // 404/410 means the browser dropped the subscription — prune it
  const dead = results
    .map((r, i) =>
      r.status === 'rejected' &&
      [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0)
        ? subs[i].id
        : null
    )
    .filter(Boolean) as string[];

  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);

  return json({ sent: results.filter((r) => r.status === 'fulfilled').length, pruned: dead.length });
});
