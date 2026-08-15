// Sends one notification to one device, through the same transports a real
// alert uses.
//
// It used to post every token to FCM. An iPhone's token is an APNs device
// token, not an FCM registration id, so Google answered INVALID_ARGUMENT and
// the admin's own test button could never succeed on the platform the admin
// was holding. The platform is not guessable from the token's shape either —
// it is recorded in device_tokens when the device registers, so that is what
// decides the route.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const TITLE = '⛽ إشعار تجريبي';
const BODY = 'المحطة التقنية · وصلك هذا الإشعار بنجاح';

// ponytail: the PEM/JWT helpers are duplicated from notify. Deploys upload one
// file per function, so a shared module costs more than the copy.
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
  if (bytes[0] !== 0x30) {
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

async function sendApns(token: string): Promise<{ ok: boolean; detail: string }> {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const pem = Deno.env.get('APNS_PRIVATE_KEY');
  const topic = Deno.env.get('APNS_TOPIC') ?? 'online.muhta.app';
  if (!keyId || !teamId || !pem) return { ok: false, detail: 'أسرار APNs ناقصة' };

  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: 'ES256', kid: keyId })) + '.' +
    b64url(JSON.stringify({ iss: teamId, iat: now }));
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned))
  );

  const res = await fetch(`https://api.push.apple.com/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${unsigned}.${b64url(sig)}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    },
    body: JSON.stringify({
      aps: {
        alert: { title: TITLE, body: BODY },
        sound: 'alert.caf',
        'interruption-level': 'time-sensitive',
      },
      url: '/',
    }),
  });
  if (res.ok) return { ok: true, detail: 'أبل قبلته' };
  return { ok: false, detail: `أبل ردّت ${res.status}: ${(await res.text()).slice(0, 120)}` };
}

async function fcmAccessToken(sa: { client_email: string; private_key: string; token_uri: string }) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64url(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: sa.token_uri, iat: now, exp: now + 3600,
    }));
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
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
  if (!res.ok) throw new Error(JSON.stringify(body).slice(0, 140));
  return body.access_token as string;
}

async function sendFcm(token: string): Promise<{ ok: boolean; detail: string }> {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) return { ok: false, detail: 'سرّ Firebase غير مضبوط' };
  const sa = JSON.parse(raw);
  const access = await fcmAccessToken(sa);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: TITLE, body: BODY },
        data: { url: '/' },
        android: { priority: 'HIGH', notification: { channel_id: 'muhta_alerts', sound: 'alert' } },
      },
    }),
  });
  if (res.ok) return { ok: true, detail: 'جوجل قبلته' };
  return { ok: false, detail: `جوجل ردّت ${res.status}: ${(await res.text()).slice(0, 120)}` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { deviceToken, endpoint, p256dh, auth } = (await req.json().catch(() => ({}))) ?? {};

    if (typeof deviceToken === 'string' && deviceToken.length > 20) {
      // The token itself does not say which vendor issued it, so ask the row
      // written when the device registered.
      const { data: row } = await db
        .from('device_tokens')
        .select('platform')
        .eq('token', deviceToken)
        .maybeSingle();

      if (!row) {
        return json({ error: 'هذا الجهاز غير مسجّل في النظام. افتح التطبيق وفعّل الإشعارات ثم أعد المحاولة.' }, 404);
      }

      const out = row.platform === 'ios' ? await sendApns(deviceToken) : await sendFcm(deviceToken);
      return out.ok
        ? json({ sent: true, via: row.platform, detail: out.detail })
        : json({ error: out.detail, via: row.platform }, 502);
    }

    if (typeof endpoint === 'string') {
      webpush.setVapidDetails(
        'mailto:admin@muhta.online',
        Deno.env.get('VAPID_PUBLIC_KEY')!,
        Deno.env.get('VAPID_PRIVATE_KEY')!
      );
      await webpush.sendNotification(
        { endpoint, keys: { p256dh, auth } },
        JSON.stringify({ title: TITLE, body: BODY, url: '/' })
      );
      return json({ sent: true, via: 'webpush' });
    }

    return json({ error: 'لم يُرسل رمز جهاز ولا اشتراك متصفح' }, 400);
  } catch (err) {
    const e = err as { body?: string; message?: string; statusCode?: number };
    return json({ error: e.body ?? e.message ?? String(err), statusCode: e.statusCode ?? 0 }, 502);
  }
});
