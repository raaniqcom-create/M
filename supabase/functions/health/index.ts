// Does the platform actually work right now?
//
// Every outage this project has had looked identical from outside: a green
// screen and no notification. The APNs key sat truncated at 27 characters for
// six days, the Android path returned silently on a missing secret, and the
// admin panel read zeros from tables it had no permission to see. In each case
// something *said* it was fine.
//
// So this proves each dependency instead of trusting it: it mints a real FCM
// token from the service account, signs a real APNs JWT with the .p8, and asks
// Apple to accept it. Anything less would report the same green screen.
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

// ponytail: this PEM/JWT pair is duplicated from notify. Deploys upload one
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

interface Check {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

async function checkFcm(): Promise<Check> {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) return { key: 'fcm', label: 'إشعارات أندرويد', ok: false, detail: 'السرّ غير مضبوط' };
  try {
    const sa = JSON.parse(raw);
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
    if (!res.ok) {
      return { key: 'fcm', label: 'إشعارات أندرويد', ok: false, detail: `جوجل رفضت المفتاح (${res.status})` };
    }
    return { key: 'fcm', label: 'إشعارات أندرويد', ok: true, detail: `جوجل قبلت المفتاح · ${sa.project_id}` };
  } catch (e) {
    return { key: 'fcm', label: 'إشعارات أندرويد', ok: false, detail: String(e).slice(0, 90) };
  }
}

async function checkApns(): Promise<Check> {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const pem = Deno.env.get('APNS_PRIVATE_KEY');
  const topic = Deno.env.get('APNS_TOPIC') ?? 'online.muhta.app';
  if (!keyId || !teamId || !pem) {
    return { key: 'apns', label: 'إشعارات آيفون', ok: false, detail: 'أسرار APNs ناقصة' };
  }
  try {
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
    const jwt = `${unsigned}.${b64url(sig)}`;

    // A deliberately invalid device id: Apple answers BadDeviceToken only after
    // it has accepted the signature, so that reply proves the key works. A
    // rejected key answers 403 instead, which is the case worth catching.
    const res = await fetch('https://api.push.apple.com/3/device/0000000000000000000000000000000000000000000000000000000000000000', {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': topic,
        'apns-push-type': 'alert',
      },
      body: JSON.stringify({ aps: { alert: 'health' } }),
    });
    const body = await res.text();
    if (res.status === 403) {
      return { key: 'apns', label: 'إشعارات آيفون', ok: false, detail: `أبل رفضت المفتاح: ${body.slice(0, 70)}` };
    }
    return { key: 'apns', label: 'إشعارات آيفون', ok: true, detail: `أبل قبلت المفتاح · ${topic}` };
  } catch (e) {
    return { key: 'apns', label: 'إشعارات آيفون', ok: false, detail: 'المفتاح غير صالح: ' + String(e).slice(0, 70) };
  }
}

async function checkSite(): Promise<Check> {
  try {
    const res = await fetch('https://muhta.online/', { method: 'HEAD' });
    return {
      key: 'site', label: 'الموقع', ok: res.ok,
      detail: res.ok ? 'يستجيب' : `الموقع يردّ ${res.status}`,
    };
  } catch {
    return { key: 'site', label: 'الموقع', ok: false, detail: 'لا يستجيب' };
  }
}

async function checkTelegram(): Promise<Check> {
  const t = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!t) return { key: 'telegram', label: 'بوت تيليجرام', ok: false, detail: 'التوكن غير مضبوط' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${t}/getMe`);
    const b = await r.json();
    return {
      key: 'telegram', label: 'بوت تيليجرام', ok: !!b?.ok,
      detail: b?.ok ? `@${b.result.username}` : 'تيليجرام رفضت التوكن',
    };
  } catch {
    return { key: 'telegram', label: 'بوت تيليجرام', ok: false, detail: 'تعذّر الوصول' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // admin only: these checks name secrets and touch two vendors
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth.user) return json({ error: 'unauthorized' }, 401);
  const { data: profile } = await db
    .from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
  if (profile?.role !== 'admin') return json({ error: 'forbidden' }, 403);

  const [fcm, apns, site, telegram] = await Promise.all([
    checkFcm(), checkApns(), checkSite(), checkTelegram(),
  ]);

  const [stations, alerts, devices] = await Promise.all([
    db.from('stations').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    db.from('alerts').select('address'),
    db.from('device_tokens').select('platform'),
  ]);

  return json({
    checks: [site, apns, fcm, telegram],
    counts: {
      stations: stations.count ?? 0,
      subscribers: new Set((alerts.data ?? []).map((r) => r.address)).size,
      devices: (devices.data ?? []).length,
    },
    at: new Date().toISOString(),
  });
});
