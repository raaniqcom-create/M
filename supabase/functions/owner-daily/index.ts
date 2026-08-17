// The station's own working day, spoken back to it.
//
// Three messages, each at the moment it means something:
//
//   at opening, never published   — a welcome and the one thing to do
//   at opening, published before  — a good-morning nudge, because yesterday's
//                                   board is today's lie
//   at closing, published today   — thanks, and an offer to schedule tomorrow
//
// The third is the point of the other two. A station that publishes and hears
// nothing back learns that publishing is unpaid work; one that is thanked at
// the end of the day it did the work learns the opposite. Nobody is scolded:
// the station that forgot gets the same wording as the station that is new.
//
// Times are the station's own opens_at/closes_at in Baghdad, so a station that
// opens at 5am is greeted at 5am and one that opens at 8 is greeted at 8.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CRON_SECRET = Deno.env.get('CRON_SECRET')!;
const BAGHDAD = 'Asia/Baghdad';
// the cron runs every 15 minutes; a message fires if its moment falls inside
// the window that just passed, so nothing is missed and nothing repeats
const WINDOW_MIN = 20;

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

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

async function apnsJwt(): Promise<string | null> {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const pem = Deno.env.get('APNS_PRIVATE_KEY');
  if (!keyId || !teamId || !pem) return null;
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
    return `${unsigned}.${b64url(sig)}`;
  } catch {
    return null;
  }
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
  if (!res.ok) throw new Error(JSON.stringify(body).slice(0, 120));
  return body.access_token as string;
}

/** Baghdad wall clock, as minutes past midnight, plus today's date there. */
function baghdadNow(): { minutes: number; day: string } {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: BAGHDAD, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? '00';
  return {
    minutes: Number(g('hour')) * 60 + Number(g('minute')),
    day: `${g('year')}-${g('month')}-${g('day')}`,
  };
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Did `moment` fall inside the window that just closed? */
function justPassed(moment: number, now: number): boolean {
  const diff = (now - moment + 1440) % 1440;
  return diff >= 0 && diff < WINDOW_MIN;
}

interface Msg { title: string; body: string }

const MESSAGES: Record<string, (name: string) => Msg> = {
  opening_first: (name) => ({
    title: `${name} — ابدأ يومك`,
    body: 'محطتك مسجّلة وظاهرة للناس. يبقى أن تحدّد ما يتوفر عندك اليوم بضغطة، فيصل خبرها إلى أهل مدينتك في اللحظة نفسها.',
  }),
  opening_again: (name) => ({
    title: `${name} — صباح الخير`,
    body: 'حدّث توفّر اليوم ليصل الخبر إلى من ينتظره. تحديثٌ واحد في الصباح يكفي، وما نُشر أمس لا يصف اليوم.',
  }),
  closing_thanks: (name) => ({
    title: `${name} — شكراً لالتزامك`,
    body: 'نشرتَ اليوم فوصل خبرك إلى أهل مدينتك. نوصيك بالنشر غداً، أو جدوِله الآن من لوحة محطتك فيُرسل تلقائياً. كل الاحترام والتقدير.',
  }),
};

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const { minutes, day } = baghdadNow();

  const { data: stations } = await db
    .from('stations')
    .select('id, name, owner_id, is_24h, opens_at, closes_at')
    .eq('status', 'approved')
    .eq('is_demo', false);

  if (!stations?.length) return new Response('no stations');

  const ids = stations.map((s) => s.id);
  const [{ data: products }, { data: pinged }] = await Promise.all([
    db.from('station_products').select('station_id, updated_at').in('station_id', ids),
    db.from('owner_pings').select('station_id, kind').eq('day', day),
  ]);

  const already = new Set((pinged ?? []).map((p) => `${p.station_id}:${p.kind}`));
  const lastUpdate = new Map<string, string>();
  for (const p of products ?? []) {
    const cur = lastUpdate.get(p.station_id);
    if (!cur || p.updated_at > cur) lastUpdate.set(p.station_id, p.updated_at);
  }

  // Which of the three, if any, is due for each station right now
  const due: { station: (typeof stations)[number]; kind: string }[] = [];
  for (const s of stations) {
    // a 24-hour station has no opening or closing moment; its day is judged at
    // 07:00 and 21:00, the hours a forecourt actually changes hands
    const open = s.is_24h ? 420 : toMinutes(s.opens_at);
    const close = s.is_24h ? 1260 : toMinutes(s.closes_at);

    const last = lastUpdate.get(s.id) ?? null;
    const publishedToday = !!last && last.slice(0, 10) === day;
    const everPublished = !!last;

    let kind: string | null = null;
    if (justPassed(open, minutes) && !publishedToday) {
      kind = everPublished ? 'opening_again' : 'opening_first';
    } else if (justPassed(close, minutes) && publishedToday) {
      kind = 'closing_thanks';
    }
    if (kind && !already.has(`${s.id}:${kind}`)) due.push({ station: s, kind });
  }

  if (!due.length) return new Response(`nothing due at ${minutes} (${day})`);

  const { data: devices } = await db
    .from('device_tokens')
    .select('token, platform, station_id')
    .in('station_id', due.map((d) => d.station.id));

  const byStation = new Map<string, { token: string; platform: string }[]>();
  for (const d of devices ?? []) {
    if (!d.station_id) continue;
    byStation.set(d.station_id, [...(byStation.get(d.station_id) ?? []), d]);
  }

  const jwt = await apnsJwt();
  const topic = Deno.env.get('APNS_TOPIC') ?? 'online.muhta.app';
  const saRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  const sa = saRaw ? JSON.parse(saRaw) : null;
  let access: string | null = null;
  if (sa) {
    try { access = await fcmToken(sa); } catch { access = null; }
  }

  const marks: { station_id: string; kind: string; day: string }[] = [];
  let sent = 0;
  let failed = 0;

  for (const { station, kind } of due) {
    const targets = byStation.get(station.id) ?? [];
    // Nothing to send to. Recorded anyway: an owner who installs the app at
    // noon should not receive this morning's greeting when they arrive.
    if (!targets.length) { marks.push({ station_id: station.id, kind, day }); continue; }

    const { title, body } = MESSAGES[kind](station.name);

    for (const t of targets) {
      try {
        if (t.platform === 'ios') {
          if (!jwt) throw new Error('apns');
          const r = await fetch(`https://api.push.apple.com/3/device/${t.token}`, {
            method: 'POST',
            headers: {
              authorization: `bearer ${jwt}`,
              'apns-topic': topic,
              'apns-push-type': 'alert',
              'apns-priority': '10',
            },
            body: JSON.stringify({
              aps: { alert: { title, body }, sound: 'alert.caf' },
              url: '/owner',
            }),
          });
          if (r.status === 410) await db.from('device_tokens').delete().eq('token', t.token);
          else if (r.ok) sent++;
          else failed++;
        } else {
          if (!access || !sa) throw new Error('fcm');
          const r = await fetch(
            `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: {
                  token: t.token,
                  notification: { title, body },
                  data: { url: '/owner' },
                  android: { priority: 'HIGH', notification: { channel_id: 'muhta_alerts', sound: 'alert' } },
                },
              }),
            }
          );
          if (r.status === 404) await db.from('device_tokens').delete().eq('token', t.token);
          else if (r.ok) sent++;
          else failed++;
        }
      } catch {
        failed++;
      }
    }
    marks.push({ station_id: station.id, kind, day });
  }

  if (marks.length) await db.from('owner_pings').upsert(marks);

  return new Response(
    JSON.stringify({ at: minutes, day, due: due.length, sent, failed }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
