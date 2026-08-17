// One message to everyone who asked to hear from us.
//
// Separate from notify on purpose. notify speaks for a station and is bounded
// by a city, a fuel and a cooldown; this speaks for the platform and reaches
// every registered device, so it carries the one guard that matters: only an
// admin may fire it, proved by their session, not by holding the anon key.
//
// The browser cannot do this itself — device_tokens and alerts grant SELECT to
// nobody, and they should not: a leaked list of push endpoints is a leaked
// megaphone.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// every fuel the app knows, for an announcement that names no product
const ALL_PRODUCTS = [
  'gasoline_regular','gasoline_premium','gasoline_super','kerosene','gas','lpg','white_oil',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ponytail: PEM/JWT helpers duplicated from notify. Deploys upload one file per
// function, so a shared module costs more than the copy.
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

async function apnsJwt(): Promise<string | null> {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const pem = Deno.env.get('APNS_PRIVATE_KEY');
  if (!keyId || !teamId || !pem) return null;
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
  return `${unsigned}.${b64url(sig)}`;
}

async function fcmToken(sa: { client_email: string; private_key: string; token_uri: string }) {
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
  if (!res.ok) throw new Error(JSON.stringify(await res.json()).slice(0, 140));
  return (await res.json()).access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  // A scheduled send has no person behind it to hold a session. notify-favorites
  // already solved this with a shared x-cron-secret header, so this uses the
  // same one rather than inventing a second door.
  //
  // Not the service role key: the project's signing key was rotated to ES256
  // and Supabase now hands the function a different-format key than the one in
  // .env.local, so comparing the two strings could never match. A purpose-made
  // secret also fails safe — leaked, it sends a notification; the master key
  // would hand over the database.
  const cronSecret = Deno.env.get('CRON_SECRET');
  const isCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;
  if (!isCron) {
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth.user) return json({ error: 'unauthorized' }, 401);
    const { data: profile } = await db
      .from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
    if (profile?.role !== 'admin') return json({ error: 'forbidden' }, 403);
  }

  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? '').trim().slice(0, 64);
  const text = String(body?.body ?? '').trim().slice(0, 178);
  const dryRun = body?.dryRun === true;
  // Where the tap lands. Defaults to the home page, as before.
  const url = typeof body?.url === 'string' && body.url.startsWith('/') ? body.url : '/';
  // Optional targeting. Without it this stays the broadcast it has always been.
  const cities: string[] = Array.isArray(body?.cities)
    ? body.cities.filter((c: unknown) => typeof c === 'string' && c.trim()).slice(0, 40)
    : [];
  const products: string[] = Array.isArray(body?.products)
    ? body.products.filter((p: unknown) => typeof p === 'string').slice(0, 10)
    : [];
  if (!title || !text) return json({ error: 'العنوان والنص مطلوبان' }, 400);

  // Two audiences, one shape.
  //
  // Untargeted, this reaches every registered device — the broadcast it has
  // always been. Given cities, it asks alerts_for() instead, which is the same
  // routing a real station announcement uses: it honours each person's chosen
  // city and fuel, returns one row per person, and (when it stamps) skips
  // anyone already notified in the last 45 minutes. That last rule is why two
  // stations in one city cannot be sent as two messages — the second would
  // reach nobody.
  let devices: { token: string; platform: string }[] = [];
  const web = new Map<string, { p256dh?: string; auth?: string }>();

  if (cities.length) {
    const seen = new Set<string>();
    for (const city of cities) {
      const { data: rows, error } = await db.rpc('alerts_for', {
        p_city: city,
        p_products: products.length ? products : ALL_PRODUCTS,
        p_stamp: !dryRun,
      });
      if (error) return json({ error: `alerts_for: ${error.message}` }, 500);
      for (const r of rows ?? []) {
        if (seen.has(r.address)) continue;
        seen.add(r.address);
        if (r.channel === 'web') web.set(r.address, r.keys ?? {});
        else devices.push({ token: r.address, platform: r.channel });
      }
    }
  } else {
    const [{ data: d }, { data: alerts }] = await Promise.all([
      db.from('device_tokens').select('token, platform'),
      db.from('alerts').select('channel, address, keys').eq('channel', 'web'),
    ]);
    devices = d ?? [];
    for (const a of alerts ?? []) if (!web.has(a.address)) web.set(a.address, a.keys ?? {});
  }

  const audience = {
    ios: devices.filter((d) => d.platform === 'ios').length,
    android: devices.filter((d) => d.platform === 'android').length,
    web: web.size,
  };
  // Counting without sending: an announcement cannot be recalled, so the panel
  // asks how many it would reach before it reaches them.
  if (dryRun) return json({ dryRun: true, audience });

  const results = { ok: 0, failed: 0, pruned: 0, errors: [] as string[] };

  const jwtApns = await apnsJwt();
  const topic = Deno.env.get('APNS_TOPIC') ?? 'online.muhta.app';
  const saRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  const sa = saRaw ? JSON.parse(saRaw) : null;
  let access: string | null = null;
  if (sa) {
    try {
      access = await fcmToken(sa);
    } catch (e) {
      results.errors.push('fcm: ' + String(e).slice(0, 90));
    }
  }

  await Promise.allSettled(
    devices.map(async (d) => {
      try {
        if (d.platform === 'ios') {
          if (!jwtApns) throw new Error('APNs secrets missing');
          const r = await fetch(`https://api.push.apple.com/3/device/${d.token}`, {
            method: 'POST',
            headers: {
              authorization: `bearer ${jwtApns}`,
              'apns-topic': topic,
              'apns-push-type': 'alert',
              'apns-priority': '10',
            },
            body: JSON.stringify({
              aps: {
                alert: { title, body: text },
                sound: 'alert.caf',
                'interruption-level': 'time-sensitive',
              },
              url,
            }),
          });
          if (r.status === 410) {
            await db.from('device_tokens').delete().eq('token', d.token);
            await db.from('alerts').delete().eq('address', d.token);
            results.pruned++;
          } else if (r.ok) results.ok++;
          else { results.failed++; results.errors.push(`ios ${r.status}`); }
          return;
        }

        if (!access || !sa) throw new Error('Firebase unavailable');
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: d.token,
              notification: { title, body: text },
              data: { url },
              android: { priority: 'HIGH', notification: { channel_id: 'muhta_alerts', sound: 'alert' } },
            },
          }),
        });
        if (r.status === 404) {
          await db.from('device_tokens').delete().eq('token', d.token);
          await db.from('alerts').delete().eq('address', d.token);
          results.pruned++;
        } else if (r.ok) results.ok++;
        else { results.failed++; results.errors.push(`android ${r.status}`); }
      } catch (e) {
        results.failed++;
        results.errors.push(String(e).slice(0, 70));
      }
    })
  );

  if (web.size) {
    webpush.setVapidDetails(
      'mailto:admin@muhta.online',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!
    );
    const payload = JSON.stringify({ title, body: text, url });
    await Promise.allSettled(
      [...web.entries()].map(async ([endpoint, keys]) => {
        try {
          await webpush.sendNotification({ endpoint, keys }, payload);
          results.ok++;
        } catch (e) {
          const code = (e as { statusCode?: number })?.statusCode ?? 0;
          if (code === 404 || code === 410) {
            await db.from('alerts').delete().eq('address', endpoint);
            results.pruned++;
          } else {
            results.failed++;
            results.errors.push(`web ${code}`);
          }
        }
      })
    );
  }

  return json({ ...results, audience, errors: results.errors.slice(0, 5) });
});
