// Fan-out for "fuel just arrived at this station", across three transports:
//   • web push — browsers and the iPhone PWA
//   • FCM      — the Android app, whose WebView has no Push API at all
//   • Telegram — the bot, the only channel that carries a custom tone
//
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

const TELEGRAM_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SITE = 'https://muhta.online';

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

// ---------- Telegram ----------

/** Fires the bot alert immediately rather than waiting for the scheduled
 *  sweep — fuel queues form within minutes, so a delay is a real cost. */
async function notifyTelegram(stationId: string, stationName: string, product: string) {
  const [{ data: favs }, { data: st }] = await Promise.all([
    db.from('telegram_favorites').select('chat_id').eq('station_id', stationId),
    db.from('stations').select('city').eq('id', stationId).maybeSingle(),
  ]);
  if (!favs?.length) return;

  const text =
    `⛽ <b>${PRODUCT_LABELS[product] ?? product} متوفر الآن</b>\n\n` +
    `<b>${stationName}</b>\n${st?.city ?? ''}\n\n` +
    `${SITE}/station/${stationId}`;

  await Promise.allSettled(
    favs.map((f) =>
      fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: f.chat_id,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      })
    )
  );

  // stops the scheduled sweep repeating what was just sent
  await db
    .from('product_alerts_sent')
    .upsert({ station_id: stationId, product, sent_at: new Date().toISOString() });
}

// ---------- Android app (FCM) ----------

// ponytail: this JWT/FCM block is duplicated in test-push. Deploys upload one
// file per function, so a shared module would cost more than the copy.
function pemToPkcs8(pem: string): Uint8Array {
  const stripped = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .split(/\s/)
    .join('');
  const raw = atob(stripped);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const b64url = (v: Uint8Array | string) =>
  btoa(typeof v === 'string' ? v : String.fromCharCode(...v))
    .split('+').join('-')
    .split('/').join('_')
    .replace(/=+$/, '');

/** FCM's HTTP v1 API only accepts an OAuth token, and Google issues one only
 *  against a JWT signed by the service account — hence the manual signing. */
async function fcmAccessToken(sa: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) +
    '.' +
    b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: sa.token_uri,
        iat: now,
        exp: now + 3600,
      })
    );

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  );

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(sig)}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body.access_token;
}

async function notifyAndroidApps(stationId: string, stationName: string, product: string) {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) return;

  const { data: devices } = await db
    .from('device_tokens')
    .select('token')
    .eq('platform', 'android');
  if (!devices?.length) return;

  const sa = JSON.parse(raw);
  const access = await fcmAccessToken(sa);
  const body = `${PRODUCT_LABELS[product] ?? product} متوفر الآن`;

  await Promise.allSettled(
    devices.map((d) =>
      fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: d.token,
            notification: { title: stationName, body },
            data: { stationId },
            android: {
              priority: 'HIGH',
              // the channel carries the custom tone
              notification: { channel_id: 'muhta_alerts', sound: 'alert' },
            },
          },
        }),
      }).then(async (r) => {
        // a token dies when the app is uninstalled — drop it rather than retry forever
        if (r.status === 404) await db.from('device_tokens').delete().eq('token', d.token);
      })
    )
  );
}

/** iOS talks to APNs directly rather than through Firebase. Routing it through
 *  FCM would mean adding the Firebase SDK to the Xcode project, a
 *  GoogleService-Info.plist in CI, and a second vendor between us and the
 *  device — for a hop Apple does not require. APNs wants an ES256 JWT signed
 *  with the .p8, which is a dozen lines here. */
async function apnsToken(keyId: string, teamId: string, pem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: 'ES256', kid: keyId })) +
    '.' +
    b64url(JSON.stringify({ iss: teamId, iat: now }));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(pem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(unsigned)
    )
  );
  return `${unsigned}.${b64url(sig)}`;
}

async function notifyIosApps(stationId: string, stationName: string, product: string) {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const pem = Deno.env.get('APNS_PRIVATE_KEY');
  const topic = Deno.env.get('APNS_TOPIC') ?? 'online.muhta.app';
  if (!keyId || !teamId || !pem) return;

  const { data: devices } = await db
    .from('device_tokens')
    .select('token')
    .eq('platform', 'ios');
  if (!devices?.length) return;

  const jwt = await apnsToken(keyId, teamId, pem);
  const body = `${PRODUCT_LABELS[product] ?? product} متوفر الآن`;

  await Promise.allSettled(
    devices.map((d) =>
      fetch(`https://api.push.apple.com/3/device/${d.token}`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${jwt}`,
          'apns-topic': topic,
          'apns-push-type': 'alert',
          'apns-priority': '10',
        },
        body: JSON.stringify({
          aps: {
            alert: { title: stationName, body },
            // ponytail: default tone. iOS plays a custom sound only if a .caf
            // ships inside the app bundle, and ours only has the mp3 the web
            // and Telegram use — convert and bundle it if the tone matters.
            sound: 'default',
            'interruption-level': 'time-sensitive',
          },
          stationId,
        }),
      }).then(async (r) => {
        // 410 is APNs for "this device is gone" — stop writing to it
        if (r.status === 410) await db.from('device_tokens').delete().eq('token', d.token);
        else if (!r.ok) console.error('apns', r.status, await r.text());
      })
    )
  );
}

// ---------- Handler ----------

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

  // Awaited, not fire-and-forget: the runtime may tear the function down as
  // soon as the response returns, dropping an in-flight request.
  const [tg, fcm, apns] = await Promise.allSettled([
    notifyTelegram(stationId, station.name, product),
    notifyAndroidApps(stationId, station.name, product),
    notifyIosApps(stationId, station.name, product),
  ]);
  if (tg.status === 'rejected') console.error('telegram', tg.reason);
  if (fcm.status === 'rejected') console.error('fcm', fcm.reason);
  if (apns.status === 'rejected') console.error('apns', apns.reason);

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('station_id', stationId)
    .eq('role', 'driver');

  if (!subs?.length) return json({ sent: 0, telegram: tg.status, fcm: fcm.status });

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

  return json({
    sent: results.filter((r) => r.status === 'fulfilled').length,
    pruned: dead.length,
    telegram: tg.status,
    fcm: fcm.status,
  });
});
