// Pushes an operational event to the admins' own devices — a station
// registered, a complaint filed. Deliberately not wired to availability
// toggles: those happen all day, and an alert that fires constantly is one the
// admin learns to swipe away.
//
// Anyone may call it, but never with a message of their own: the caller names
// an event and passes an id, and the text is composed here from the database.
// Otherwise the endpoint is an open channel for writing whatever they like
// onto the admin's lock screen.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

function pemToPkcs8(pem: string): Uint8Array {
  const raw = atob(
    pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').split(/\s/).join('')
  );
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const b64url = (v: Uint8Array | string) =>
  btoa(typeof v === 'string' ? v : String.fromCharCode(...v))
    .split('+').join('-').split('/').join('_').replace(/=+$/, '');

async function fcmAccessToken(sa: { client_email: string; private_key: string; token_uri: string }) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) +
    '.' +
    b64url(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }));
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
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
  return body.access_token as string;
}

async function apnsJwt(keyId: string, teamId: string, pem: string) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: 'ES256', kid: keyId })) + '.' + b64url(JSON.stringify({ iss: teamId, iat: now }));
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned))
  );
  return `${unsigned}.${b64url(sig)}`;
}

async function pushToAdmins(title: string, body: string) {
  const { data: devices } = await db
    .from('device_tokens')
    .select('token, platform')
    .eq('is_admin', true);
  if (!devices?.length) return 0;

  const android = devices.filter((d) => d.platform !== 'ios');
  const ios = devices.filter((d) => d.platform === 'ios');
  let sent = 0;

  const saRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (android.length && saRaw) {
    const sa = JSON.parse(saRaw);
    const access = await fcmAccessToken(sa);
    await Promise.allSettled(
      android.map((d) =>
        fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: d.token,
              notification: { title, body },
              android: { priority: 'HIGH', notification: { channel_id: 'muhta_alerts', sound: 'alert' } },
            },
          }),
        }).then((r) => {
          if (r.ok) sent++;
          else if (r.status === 404) db.from('device_tokens').delete().eq('token', d.token);
        })
      )
    );
  }

  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const pem = Deno.env.get('APNS_PRIVATE_KEY');
  if (ios.length && keyId && teamId && pem) {
    const jwt = await apnsJwt(keyId, teamId, pem);
    const topic = Deno.env.get('APNS_TOPIC') ?? 'online.muhta.app';
    await Promise.allSettled(
      ios.map((d) =>
        fetch(`https://api.push.apple.com/3/device/${d.token}`, {
          method: 'POST',
          headers: {
            authorization: `bearer ${jwt}`,
            'apns-topic': topic,
            'apns-push-type': 'alert',
            'apns-priority': '10',
          },
          body: JSON.stringify({
            aps: { alert: { title, body }, sound: 'alert.caf', 'interruption-level': 'time-sensitive' },
          }),
        }).then((r) => {
          if (r.ok) sent++;
          else if (r.status === 410) db.from('device_tokens').delete().eq('token', d.token);
        })
      )
    );
  }
  return sent;
}

/** Telegram's HTML mode needs these three neutralised; the lock-screen push
 *  carries the raw text, which is fine because a notification renders no markup. */
const escapeHtml = (s: string) =>
  s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');

async function telegramAdmins(text: string) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const ids = (Deno.env.get('TELEGRAM_ADMIN_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!token || !ids.length) return;
  await Promise.allSettled(
    ids.map((chat_id) =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        // charset stated outright: Arabic arriving as ????? is what happens
        // when something downstream guesses latin-1
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' }),
      })
    )
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { event, stationId, reason } = await req.json();

    const { data: station } = await db
      .from('stations')
      .select('name, city')
      .eq('id', stationId)
      .maybeSingle();
    if (!station) return json({ error: 'unknown station' }, 404);

    let title: string;
    let body: string;
    if (event === 'complaint') {
      title = '⚠️ شكوى جديدة';
      body = `${station.name} — ${String(reason ?? '').slice(0, 80)}`;
    } else if (event === 'registration') {
      title = '🏪 طلب تسجيل محطة';
      body = `${station.name} — ${station.city}`;
    } else if (event === 'approved') {
      title = '✅ محطة اعتُمدت';
      body = `${station.name} — ${station.city}`;
    } else {
      return json({ error: 'unknown event' }, 400);
    }

    const [push] = await Promise.allSettled([
      pushToAdmins(title, body),
      // `reason` inside body is the one field a caller writes, and this message
      // is sent with parse_mode: HTML. Unescaped, a complaint reading
      // «<a href="…">اضغط هنا</a>» would arrive on the admin's Telegram as a
      // working link that the platform appears to have sent itself. The push
      // above takes body raw — a lock screen renders no markup.
      telegramAdmins(`<b>${title}</b>\n${escapeHtml(body)}`),
    ]);
    return json({ ok: true, devices: push.status === 'fulfilled' ? push.value : 0 });
  } catch (err) {
    console.error('admin-alert', err);
    return json({ error: 'failed' }, 500);
  }
});
