import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { PRODUCT_LABELS, PRODUCT_ORDER } from '@/lib/products';
import type { FuelProduct } from '@/types/database';

export const runtime = 'nodejs';

// service role: push_subscriptions has no public SELECT policy, and this route
// must read every subscriber's endpoint. Never expose this key to the client.
const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(request: Request) {
  // configured per-request, not at module scope: build-time env has no real keys
  webpush.setVapidDetails(
    'mailto:admin@almahatta.app',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  const db = admin();

  const body = await request.json().catch(() => null);
  const stationId: unknown = body?.stationId;
  const product: unknown = body?.product;

  // this endpoint is callable by anyone — validate before it can be used to
  // spam a station's subscribers with arbitrary text
  if (typeof stationId !== 'string' || !PRODUCT_ORDER.includes(product as FuelProduct)) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  // the message body is built from our own labels, never from the request
  const { data: station } = await db
    .from('stations')
    .select('name, status')
    .eq('id', stationId)
    .single();

  if (!station || station.status !== 'approved') {
    return NextResponse.json({ error: 'station not found' }, { status: 404 });
  }

  // only notify if the product is genuinely available right now, so a forged
  // call can't announce fuel that isn't there
  const { data: row } = await db
    .from('station_products')
    .select('is_available')
    .eq('station_id', stationId)
    .eq('product', product as FuelProduct)
    .single();

  if (!row?.is_available) {
    return NextResponse.json({ error: 'product not available' }, { status: 409 });
  }

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('station_id', stationId);

  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const payload = JSON.stringify({
    title: station.name,
    body: `${PRODUCT_LABELS[product as FuelProduct]} متوفر الآن`,
    stationId,
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
  const dead = subs
    .filter((_, i) => {
      const r = results[i];
      return r.status === 'rejected' && [404, 410].includes(r.reason?.statusCode);
    })
    .map((s) => s.id);

  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);

  return NextResponse.json({
    sent: results.filter((r) => r.status === 'fulfilled').length,
    pruned: dead.length,
  });
}
