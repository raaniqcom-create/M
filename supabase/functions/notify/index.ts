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
// A newline constant rather than an escape: automated edits to this repo have
// eaten backslash-n before, and a half-eaten comment once crashed a function
// on every boot.
const NL = String.fromCharCode(10);

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

async function audienceFor(
  city: string,
  products: string[],
  stamp = true,
  stationId: string | null = null
): Promise<Listener[]> {
  // السقف يخصّ ردود الدوالّ كما يخصّ الجداول — والدالة تختم من تُرجعه في
  // القاعدة قبل القصّ، فمن سقط منها يُعدّ مُخطَراً ولا يصله شيء.
  const { data, error } = await db.rpc('alerts_for', {
    p_city: city,
    p_products: products,
    p_stamp: stamp,
    // Whoever tapped «تابع هذه المحطة» is matched by station rather than by
    // city, and carries a cooldown of its own — so a neighbouring station
    // announcing first cannot swallow the alert they explicitly asked for.
    p_station: stationId,
  }).range(0, 99_999);
  if (!error) return (data ?? []) as Listener[];

  // The four-argument form arrives with a migration. If this function is
  // deployed first, every notification on the platform would stop — so fall
  // back to the three-argument call rather than let the deploy order decide
  // whether people hear that fuel arrived. Station followers simply are not
  // matched until the migration lands.
  const { data: legacy, error: legacyError } = await db
    .rpc('alerts_for', { p_city: city, p_products: products, p_stamp: stamp })
    .range(0, 99_999);
  if (legacyError) {
    // يُرمى ولا يُبتلع.
    //
    // كانت تردّ [] هنا، فتمضي notify إلى نهايتها وتردّ HTTP 200 وقد أرسلت
    // صفراً. وهذا ما أخفى توقّف الإشعارات تسعاً وثلاثين ساعة: alerts_for كانت
    // ترمي 42702 في كل نداء بالختم، فيسقط النداء إلى صيغةٍ قديمة لا وجود لها،
    // فتفشل هي الأخرى — وصاحب المحطة يرى «نُشر»، ولا شاشة تقول إن أحداً لم
    // يُخطَر. خطأٌ يُعلَن أرحم من نجاحٍ كاذب.
    console.error('alerts_for', error, legacyError);
    throw new Error(`alerts_for: ${error?.message ?? legacyError.message}`);
  }
  return (legacy ?? []) as Listener[];
}

/** The devices belonging to the station itself.
 *
 *  A station joining is not news to a citizen. Someone who asked to hear about
 *  «بانزين محسن في الرمادي» has no use for "a station joined" — it has no fuel
 *  to report yet, and the message used to go to every subscriber in that city
 *  whatever fuel they had picked. The people it is genuinely news to are the
 *  owner, who can now start publishing, and the admin, who is told separately.
 *  Citizens hear from a station when it has something to say. */
async function ownerDevices(stationId: string): Promise<Listener[]> {
  const { data } = await db
    .from('device_tokens')
    .select('token, platform, keys')
    .eq('station_id', stationId);
  // المفاتيح تُقرأ ولا تُصفَّر: منذ صار المالك يربط جهازه من المتصفح، صفّه هنا
  // عنوانُ دفعٍ لا يُرسَل إليه إلا بـp256dh وauth. وتصفيرها كان يجعل web-push
  // يرفض قبل أن يمسّ الشبكة، ورفضُه بلا statusCode فلا يُحذف ولا يُعدّ فاشلاً —
  // فيقرأ السجلّ «أُرسل إلى مستمع واحد» ولا يصل أحداً.
  return (data ?? []).map((d) => ({ channel: d.platform, address: d.token, keys: d.keys }));
}

// ---------- WhatsApp ----------

/** whatsapp_favorites has been written since the bot shipped and read by
 *  nothing: people tapped «أضف للمفضلة», were told they were following, and no
 *  code anywhere ever sent them a word. This is that promise, finally kept.
 *
 *  Honest limit: WhatsApp only permits a free-form message inside 24 hours of
 *  the person's last message. Outside it Meta rejects the send unless it uses
 *  an approved template, which this platform does not have yet. So this reaches
 *  people who used the bot recently, and the rest are counted as failures in
 *  the log rather than quietly dropped — the number is the argument for
 *  applying for a template.  ponytail: template approval when the miss rate
 *  justifies the paperwork. */
async function notifyWhatsapp(stationId: string, stationName: string, products: string[]) {
  if (!products.length) return;
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneId = Deno.env.get('WHATSAPP_PHONE_ID');
  if (!token || !phoneId) return;

  const [{ data: favs }, { data: st }] = await Promise.all([
    db.from('whatsapp_favorites').select('wa_id').eq('station_id', stationId),
    db.from('stations').select('city').eq('id', stationId).maybeSingle(),
  ]);
  if (!favs?.length) return;

  const body =
    headline(products) + NL + NL +
    stationName + NL + (st?.city ?? '') + NL + NL +
    SITE + '/station/' + stationId;

  let sent = 0;
  let outsideWindow = 0;
  await Promise.allSettled(
    favs.map(async (f) => {
      const r = await fetch('https://graph.facebook.com/v25.0/' + phoneId + '/messages', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: f.wa_id,
          type: 'text',
          text: { body, preview_url: false },
        }),
      });
      if (r.ok) sent++;
      else if (r.status === 400) outsideWindow++;
      else console.error('whatsapp notify', r.status, await r.text());
    })
  );
  console.log('whatsapp favourites: ' + sent + ' sent, ' + outsideWindow + ' outside the 24h window');
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
  url: string,
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
            data: { stationId, url },
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
  url: string,
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
          url,
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

/** The endpoint answered to anyone: no apikey, no session, no cookie. Station
 *  ids are public (they are in every /station/<id> URL), so a stranger could
 *  announce fuel that never arrived, and — worse — spend every subscriber's
 *  cooldown so the real announcement was silently dropped.
 *
 *  Only the station's own owner or an admin may speak for a station. */
async function callerMayAnnounce(req: Request, stationId: string): Promise<boolean> {
  // بابٌ داخليّ للدوالّ الطرفية الأخرى.
  //
  // البوّابة كانت رمز جلسة مستخدمٍ وحده — والبوتات تعمل بمفتاح الخدمة ولا
  // جلسة لها. فمالكٌ يبدّل منتجه من تيليجرام كان خبرُه يصل مفضّلي تيليجرام
  // وحدهم بعد دقيقتين، ولا يصل 4,728 مشتركاً على الويب وأندرويد وآيفون.
  // يُعلن لجمهورٍ واحد من خمسة وهو يظنّ أنه أعلن للكلّ.
  //
  // والسرّ لا يملكه إلا الخادم، والمُنادي يتحقّق من الملكية بنفسه قبل أن
  // ينادي (telegram_links في البوت). وهو النمط نفسه الذي تعمل به announce.
  const cron = Deno.env.get('CRON_SECRET');
  if (cron && req.headers.get('x-cron-secret') === cron) return true;

  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return false;

  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) return false;

  const [{ data: profile }, { data: station }] = await Promise.all([
    db.from('profiles').select('role').eq('id', data.user.id).maybeSingle(),
    db.from('stations').select('owner_id').eq('id', stationId).maybeSingle(),
  ]);

  return profile?.role === 'admin' || station?.owner_id === data.user.id;
}

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
  if (!(await callerMayAnnounce(req, stationId))) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (!isNewStation && (!wanted.length || wanted.length !== asked.length)) {
    return json({ error: 'invalid payload' }, 400);
  }

  const { data: station } = await db
    .from('stations')
    .select('name, status, city')
    .eq('id', stationId)
    .maybeSingle();

  if (!station || station.status !== 'approved') return json({ error: 'station not found' }, 404);

  // ولا يخرج خبرُ وصولٍ من محطة مغلقة.
  //
  // الحارس هنا لا في alerts_for: فرعا تيليجرام وواتساب يقرآن جداول المفضّلة
  // مباشرةً ولا يمرّان بها، فحارسٌ داخلها يترك قناتين مفتوحتين. وهذا الموضع
  // فوق فروع الإرسال الخمسة كلّها.
  //
  // والقاعدة تُنادى ولا تُكتب: station_open_now في القاعدة تعرف temp_closed
  // و is_24h ونافذة بغداد — ونسخةٌ رابعة منها هنا تنحرف عنها بعد شهر، وهو
  // ما وقع فعلاً في بوت تيليجرام (نسخته تتجاهل temp_closed).
  //
  // وخبرُ الموافقة يمرّ: وجهته جهاز المالك نفسه لا الناس، ومحطةٌ وافقنا
  // عليها ليلاً يجب أن يعلم صاحبها الآن لا في الصباح.
  if (!isNewStation) {
    const { data: openNow, error: openErr } = await db.rpc('station_open_now_id', {
      p_id: stationId,
    });
    // والفشل يُقال ولا يُبتلع. والصمت هو الافتراض الآمن: إشعارٌ لم يُرسل
    // يُعاد إرساله، وإشعارٌ أُرسل لا يُستعاد.
    if (openErr) {
      return json({ error: `تعذّر التحقّق من دوام المحطة: ${openErr.message}` }, 502);
    }
    if (!openNow) {
      return json(
        { error: 'محطتك مغلقة الآن — حُفظت الحالة، ولم يُرسل إشعار. سيصل الخبر حين تفتح.' },
        409
      );
    }
  }

  // only announce fuel that is genuinely in stock right now, so a forged call
  // cannot tell drivers to drive to an empty station
  //
  // وموعدُ النفاد المُعلَن حارسٌ ثانٍ هنا: هذه بوّابةُ الفتحات الخمس كلِّها —
  // دفعُ الويب، وFCM، وAPNs، ومفضّلو تيليجرام، ومفضّلو واتساب — فسطرٌ واحدٌ
  // يمنع الخمسة من الإعلان عن وقودٍ قال صاحبُه إنه نفد.
  const { data: rows } = await db
    .from('station_products')
    .select('product')
    .eq('station_id', stationId)
    .eq('is_available', true)
    .or(`runs_out_at.is.null,runs_out_at.gt.${new Date().toISOString()}`)
    .in('product', wanted);

  // Order by our own list, not the database's: the message reads in the
  // order drivers see on the station card.
  const live = Object.keys(PRODUCT_LABELS).filter((p) =>
    rows?.some((r) => r.product === p)
  );
  if (!isNewStation && !live.length) return json({ error: 'product not available' }, 409);
  // The approval message is written for its reader. It used to say «محطة
  // جديدة» to a whole city; it now tells the one person who can act on it
  // what to do next.
  const alertTitle = isNewStation ? 'تمّت الموافقة على محطتك' : headline(live);
  // وذِكرُ الصورة في النصّ لا في اللوحة وحدها: البطاقةُ في أعلى /owner لا
  // يعرفها من لم يفتح اللوحة، والإشعارُ هو ما يفتحها.
  const alertBody = isNewStation
    ? 'حدّث توفّر الوقود من لوحتك، وفيها صورةٌ إعلانية جاهزة باسم محطتك لتنشرها'
    : placeline(station.name, station.city);
  // An approval fires while the static export containing the station's own
  // page is still building — about two minutes of 404 for anyone who taps.
  // /owner is part of the shell and always exists, and it is where the owner
  // has to go anyway.
  const alertUrl = isNewStation ? '/owner' : `/station/${stationId}`;

  let listeners: Listener[];
  try {
    listeners = isNewStation
      ? await ownerDevices(stationId)
      : await audienceFor(station.city, live, true, stationId);
  } catch (e) {
    // 502 لا 200: النشر وقع في القاعدة، والإخطار لم يقع. واللوحة تعرض الفرق.
    return json({ error: `تعذّر تحديد المستقبِلين: ${(e as Error).message}` }, 502);
  }

  // One row per person told. Until now the only record was alerts.last_sent_at,
  // which holds the latest send and overwrites everything before it — so when a
  // user complained he was getting one every day, there was no way to check.
  // A complaint that cannot be measured is answered by guesswork.
  //
  // Fire-and-forget on purpose: a logging failure must never be the reason
  // somebody does not hear that fuel arrived.
  if (listeners.length) {
    db.from('notification_log')
      .insert(
        listeners.map((l) => ({
          address: l.address,
          kind: isNewStation ? 'approved' : 'fuel',
          station_id: stationId,
          // The words, not just the fact. Without them a history row can say
          // "something about station X at 14:32" and no more — `kind` carries
          // no product, and the product is the entire content of the title.
          title: alertTitle,
          body: alertBody,
        }))
      )
      .then(({ error }) => {
        if (error) console.error('notification_log', error.message);
      });
  }

  // The admin asked to be told too, and their working channel is Telegram —
  // no device on the platform carries is_admin today. admin-alert already
  // owns both, so this reuses it rather than repeating the fan-out here.
  if (isNewStation) {
    // **وأثرٌ يبقى بعد أن يزول الإشعار.**
    //
    // الإشعارُ يُمسَح أو يُفوَّت، فلا يبقى منه شيء. والمجرى يبقى: صاحبُ
    // المحطة يفتح تبويب «الرسائل» بعد أسبوع فيجد ما قيل له يومَ اعتُمد.
    //
    // و sender:'system' لا تقبلها سياسةٌ من المتصفّح، ودورُ الخدمة وحدَه
    // يكتبها — وهو هنا. و kind إلزاميّةٌ غيرُ فارغة بحكم القيد
    // station_messages_kind_is_system، و'approved' هي الكلمة التي يسمّي بها
    // notification_log هذا الحدث بعينه.
    db.from('station_messages')
      .insert({
        station_id: stationId,
        sender: 'system',
        kind: 'approved',
        body:
          'اعتُمدت محطتك وصارت ظاهرةً للناس. وفي أعلى لوحتك صورةٌ إعلانية جاهزة ' +
          'باسم محطتك ورابطها — احفظها وانشرها على صفحاتك ليتابعك زبائنك، فيصلهم ' +
          'خبرُ توفّر الوقود عندك فور إعلانه.',
      })
      .then(() => {});

    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/admin-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ event: 'approved', stationId }),
    }).catch(() => {});
  }
  const pick = (c: string) => listeners.filter((l) => l.channel === c);
  const webListeners = pick('web');

  // Awaited, not fire-and-forget: the runtime may tear the function down as
  // soon as the response returns, dropping an in-flight request.
  // أربعة وعود وأربعة متغيّرات.
  //
  // كانت ثلاثة: أُضيف واتساب في الموضع الثاني بلا توسيع التفكيك، فصار fcm هو
  // واتساب، وapns هو أندرويد، وتقرير آيفون يسقط كلّه. أي أن ٥١٢ جهاز آيفون
  // بلا أي تقرير عن أعطالها، واللوحة تعرض أندرويد تحت اسم APNs.
  //
  // وهذا يُعيد فتح العمى نفسه الذي أخفى انقطاع مفتاح APNs ستة أيام، وهو
  // السبب الذي كُتبت من أجله هذه التقارير أصلاً.
  const [tg, wa, fcm, apns] = await Promise.allSettled([
    notifyTelegram(stationId, station.name, isNewStation ? [] : live),
    notifyWhatsapp(stationId, station.name, isNewStation ? [] : live),
    notifyAndroidApps(stationId, alertTitle, alertBody, alertUrl, pick('android').map((l) => l.address)),
    notifyIosApps(stationId, alertTitle, alertBody, alertUrl, pick('ios').map((l) => l.address)),
  ]);
  if (tg.status === 'rejected') console.error('telegram', tg.reason);
  if (wa.status === 'rejected') console.error('whatsapp', wa.reason);
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
    // An approval fires the moment the admin taps, while the static export
    // that contains the station's page is still building — about two minutes
    // of 404 for everyone who taps. Send them somewhere that already exists.
    url: alertUrl,
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

  // ومن الجدولين معاً: المستمع قد يكون مواطناً في alerts أو مالكاً في
  // device_tokens، وعنوانٌ ميت لا يُحذف يُعاد إليه كل مرة إلى الأبد.
  if (dead.length) {
    await db.from('alerts').delete().in('address', dead);
    await db.from('device_tokens').delete().in('token', dead);
  }

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
