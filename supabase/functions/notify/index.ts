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

/** The title is the fuel and nothing else.
 *
 *  Station name used to lead. That is backwards on a lock screen: every
 *  station in the province is called «mahatta something», so the first
 *  words a driver reads told him nothing, while the one fact he opened the
 *  app for sat on the second line where the OS truncates. The verb went too
 *  — the notification firing IS «available now», and the phone stamps the
 *  time beside it for free. */
function headline(products: string[]): string {
  return `⛽ ${products.map((p) => PRODUCT_LABELS[p] ?? p).join(' و')}`;
}

/** Where, on one line: the station, then the city. */
function placeline(stationName: string, city: string): string {
  return city ? `${stationName} · ${city}` : stationName;
}

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

/** Who asked to hear about this. Replaces three separate "every device on the
 *  platform" queries — the app channels used to broadcast every arrival at
 *  every station to everyone who had ever opened the app, which is a fine way
 *  to get uninstalled the week the station count grows.
 *
 *  The matching, the 45-minute per-device cooldown and the de-duplication all
 *  live in alerts_for() so a device subscribed to five matching rows still
 *  gets exactly one message. */
interface Listener {
  channel: string;
  address: string;
  keys: { p256dh?: string; auth?: string } | null;
}

async function audienceFor(city: string, products: string[]): Promise<Listener[]> {
  const { data, error } = await db.rpc('alerts_for', {
    p_city: city,
    p_products: products,
  });
  if (error) {
    console.error('alerts_for', error);
    return [];
  }
  return (data ?? []) as Listener[];
}

// ---------- Telegram ----------

/** Fires the bot alert immediately rather than waiting for the scheduled
 *  sweep — fuel queues form within minutes, so a delay is a real cost. */
async function notifyTelegram(stationId: string, stationName: string, products: string[]) {
  if (!products.length) return; // an approval announcement names no fuel
  const [{ data: favs }, { data: st }] = await Promise.all([
    db.from('telegram_favorites').select('chat_id').eq('station_id', stationId),
    db.from('stations').select('city').eq('id', stationId).maybeSingle(),
  ]);
  if (!favs?.length) return;

  const text =
    `<b>${headline(products)}</b>\n\n` +
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
  const sent_at = new Date().toISOString();
  await db
    .from('product_alerts_sent')
    .upsert(products.map((product) => ({ station_id: stationId, product, sent_at })));
}

// ---------- Android app (FCM) ----------

// ponytail: this JWT/FCM block is duplicated in test-push. Deploys upload one
// file per function, so a shared module would cost more than the copy.
/** Accepts the .p8 in either shape it tends to arrive in: the PEM text as
 *  Apple ships it, or that same text wrapped in one more layer of base64 —
 *  which is how the key is stored for GitHub Actions, and how it ended up in
 *  this project's secret. Decoding once on a doubly-encoded key yields the PEM
 *  text as bytes, and importKey rejects it with "expected valid PKCS#8 data",
 *  which reads like a corrupt key rather than a double wrap. */
function pemToPkcs8(pem: string): Uint8Array {
  const decode = (text: string): Uint8Array => {
    const stripped = text
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .split(/\s/)
      .join('');
    const raw = atob(stripped);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  };

  let bytes = decode(pem);
  // A PKCS#8 key starts with the DER SEQUENCE tag 0x30. Printable ASCII here
  // means we decoded a wrapper and the real PEM is inside.
  const looksLikeText = bytes[0] !== 0x30;
  if (looksLikeText) {
    const inner = new TextDecoder().decode(bytes);
    if (inner.includes('PRIVATE KEY')) bytes = decode(inner);
  }
  return bytes;
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

/** Reports like the APNs path rather than swallowing failures. A push that
 *  never arrives is indistinguishable from one never sent, and this function
 *  used to return silently on a missing secret, a bad service account, and
 *  every rejected send alike — the exact blind spot that hid the iOS outage.
 *
 *  The credential is exchanged BEFORE the device count is checked, on purpose:
 *  with no Android device registered yet, that exchange is the only proof the
 *  secret is intact. Waiting until a real phone exists means discovering a
 *  truncated key from a user who never got their notification. */
async function notifyAndroidApps(
  stationId: string,
  title: string,
  body: string,
  tokens: string[]
): Promise<Record<string, unknown>> {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) return { skipped: 'FIREBASE_SERVICE_ACCOUNT missing' };

  let sa: { project_id: string; client_email: string; private_key: string; token_uri: string };
  try {
    sa = JSON.parse(raw);
  } catch (e) {
    return { error: 'service account is not valid JSON: ' + String(e), length: raw.length };
  }

  let access: string;
  try {
    access = await fcmAccessToken(sa);
  } catch (e) {
    return {
      error: 'oauth: ' + String(e),
      project: sa.project_id,
      keyShape: {
        length: sa.private_key?.length ?? 0,
        hasBeginHeader: sa.private_key?.includes('BEGIN') ?? false,
        hasRealNewlines: sa.private_key?.includes(String.fromCharCode(10)) ?? false,
      },
    };
  }

  const devices = tokens.map((token) => ({ token }));
  if (!devices.length) {
    return { credentialOk: true, project: sa.project_id, skipped: 'no android listeners' };
  }

  const report: string[] = [];

  await Promise.allSettled(
    devices.map((d) =>
      fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: d.token,
            notification: { title, body },
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
        if (r.status === 404) {
          await db.from('alerts').delete().eq('address', d.token);
          await db.from('device_tokens').delete().eq('token', d.token);
          report.push('404 unregistered');
        } else if (!r.ok) {
          report.push(`${r.status} ${(await r.text()).slice(0, 160)}`);
        } else {
          report.push('200 ok');
        }
      }, (e) => report.push('fetch: ' + String(e)))
    )
  );
  return { devices: devices.length, results: report, channel: 'muhta_alerts', sound: 'alert' };
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

/** Returns a report rather than swallowing failures into console.error: a
 *  push that never arrives looks identical to one that was never sent, and the
 *  only way to tell them apart from outside is to say what APNs answered. */
async function notifyIosApps(
  stationId: string,
  title: string,
  body: string,
  tokens: string[]
): Promise<Record<string, unknown>> {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const pem = Deno.env.get('APNS_PRIVATE_KEY');
  const topic = Deno.env.get('APNS_TOPIC') ?? 'online.muhta.app';
  if (!keyId || !teamId || !pem) {
    return { skipped: 'APNS secrets missing', keyId: !!keyId, teamId: !!teamId, pem: !!pem };
  }

  const devices = tokens.map((token) => ({ token }));
  if (!devices.length) return { skipped: 'no ios listeners' };

  let jwt: string;
  try {
    jwt = await apnsToken(keyId, teamId, pem);
  } catch (e) {
    // Shape only — never the key itself. Enough to tell a wrong format from a
    // wrong key without putting a private key in an HTTP response.
    let firstByte = -1;
    try {
      firstByte = pemToPkcs8(pem)[0] ?? -1;
    } catch { /* decode itself failed */ }
    return {
      error: 'jwt: ' + String(e),
      keyShape: {
        length: pem.length,
        hasBeginHeader: pem.includes('BEGIN'),
        hasRealNewlines: pem.includes(String.fromCharCode(10)),
        hasEscapedNewlines: pem.includes(String.fromCharCode(92) + 'n'),
        startsWith: pem.slice(0, 12),
        firstDecodedByte: firstByte,
      },
    };
  }
  const report: string[] = [];

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
            alert: { title, body },
            // ships in the app bundle as ios/App/App/alert.caf; iOS falls back
            // to the default tone if it is ever missing
            sound: 'alert.caf',
            'interruption-level': 'time-sensitive',
          },
          stationId,
        }),
      }).then(async (r) => {
        // 410 is APNs for "this device is gone" — stop writing to it
        if (r.status === 410) {
          await db.from('alerts').delete().eq('address', d.token);
          await db.from('device_tokens').delete().eq('token', d.token);
          report.push('410 gone');
        } else if (!r.ok) {
          report.push(`${r.status} ${(await r.text()).slice(0, 160)}`);
        } else {
          report.push('200 ok');
        }
      }, (e) => report.push('fetch: ' + String(e)))
    )
  );
  return { devices: devices.length, results: report, topic };
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
  // `product` is still accepted on its own: the admin panel and the
  // scheduled sweep both send one at a time.
  const asked: unknown[] = Array.isArray(body?.products)
    ? body.products
    : body?.product != null
      ? [body.product]
      : [];
  const wanted = [...new Set(asked)].filter(
    (p): p is string => typeof p === 'string' && p in PRODUCT_LABELS
  );
  // A station joining is news in its own right — that is the entire promise
  // made to everyone who subscribed while the map was still empty. It has no
  // product to verify, so it takes its own path through the checks below.
  const isNewStation = body?.newStation === true;

  // Anyone can reach this endpoint, so every claim in the request is checked
  // against the database before a single notification goes out.
  if (typeof stationId !== 'string') return json({ error: 'invalid payload' }, 400);
  if (!isNewStation && (!wanted.length || wanted.length !== asked.length)) {
    return json({ error: 'invalid payload' }, 400);
  }

  const { data: station } = await db
    .from('stations')
    .select('name, status, city')
    .eq('id', stationId)
    .maybeSingle();

  if (!station || station.status !== 'approved') return json({ error: 'station not found' }, 404);

  // only announce fuel that is genuinely in stock right now, so a forged call
  // cannot tell drivers to drive to an empty station
  // Anyone watching this city, whatever fuel they picked, is owed this one.
  const allProducts = Object.keys(PRODUCT_LABELS);
  const { data: rows } = await db
    .from('station_products')
    .select('product')
    .eq('station_id', stationId)
    .eq('is_available', true)
    .in('product', wanted);

  // Order by our own list, not the database's: the message reads in the
  // order drivers see on the station card.
  const live = Object.keys(PRODUCT_LABELS).filter((p) =>
    rows?.some((r) => r.product === p)
  );
  if (!isNewStation && !live.length) return json({ error: 'product not available' }, 409);
  const alertTitle = isNewStation ? `⛽ محطة جديدة` : headline(live);
  const alertBody = placeline(station.name, station.city);

  const listeners = await audienceFor(station.city, isNewStation ? allProducts : live);
  const pick = (c: string) => listeners.filter((l) => l.channel === c);
  const webListeners = pick('web');

  // Awaited, not fire-and-forget: the runtime may tear the function down as
  // soon as the response returns, dropping an in-flight request.
  const [tg, fcm, apns] = await Promise.allSettled([
    notifyTelegram(stationId, station.name, isNewStation ? [] : live),
    notifyAndroidApps(stationId, alertTitle, alertBody, pick('android').map((l) => l.address)),
    notifyIosApps(stationId, alertTitle, alertBody, pick('ios').map((l) => l.address)),
  ]);
  if (tg.status === 'rejected') console.error('telegram', tg.reason);
  if (fcm.status === 'rejected') console.error('fcm', fcm.reason);
  if (apns.status === 'rejected') console.error('apns', apns.reason);


  const apnsReport = apns.status === 'fulfilled' ? apns.value : { rejected: String(apns.reason) };
  const fcmReport = fcm.status === 'fulfilled' ? fcm.value : { rejected: String(fcm.reason) };

  if (!webListeners.length) {
    return json({
      sent: 0,
      listeners: listeners.length,
      city: station.city,
      telegram: tg.status,
      fcm: fcmReport,
      apns: apnsReport,
    });
  }

  // the text is built from our own labels, never from the request
  const payload = JSON.stringify({
    title: alertTitle,
    body: alertBody,
    stationId,
    url: `/station/${stationId}`,
  });

  const results = await Promise.allSettled(
    webListeners.map((l) =>
      webpush.sendNotification(
        { endpoint: l.address, keys: { p256dh: l.keys?.p256dh, auth: l.keys?.auth } },
        payload
      )
    )
  );

  // 404/410 means the browser dropped the subscription — prune it
  const dead = results
    .map((r, i) =>
      r.status === 'rejected' &&
      [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0)
        ? webListeners[i].address
        : null
    )
    .filter(Boolean) as string[];

  if (dead.length) await db.from('alerts').delete().in('address', dead);

  return json({
    sent: results.filter((r) => r.status === 'fulfilled').length,
    pruned: dead.length,
    listeners: listeners.length,
    city: station.city,
    telegram: tg.status,
    fcm: fcmReport,
    apns: apnsReport,
  });
});
