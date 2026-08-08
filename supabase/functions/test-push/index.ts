// Sends one notification straight back to the device that asked for it.
// Nothing is stored: this exists so a person can prove notifications work on
// their own device before any station is registered.
//
// Two transports, because they are genuinely different systems:
//   • web push  — browsers and the iPhone PWA
//   • FCM       — the Android app, whose WebView has no Push API at all
import webpush from 'npm:web-push@3.6.7';

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

// ---------- Firebase access token ----------

function pemToPkcs8(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const b64url = (bytes: Uint8Array | string) => {
  const s = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** FCM's HTTP v1 API needs an OAuth token, and Google only issues one against
 *  a JWT signed by the service account — hence the hand-rolled signing. */
async function firebaseAccessToken(sa: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify(claim)
  )}`;

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
  if (!res.ok) throw new Error(`token: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function sendToDevice(token: string, title: string, body: string) {
  const sa = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!);
  const access = await firebaseAccessToken(sa);

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          android: {
            priority: 'HIGH',
            // the channel carries the custom tone; naming it here is what
            // routes the notification through it
            notification: { channel_id: 'muhta_alerts', sound: 'alert' },
          },
        },
      }),
    }
  );

  const out = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(out));
  return out;
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const body = await req.json().catch(() => null);
  const { endpoint, p256dh, auth, deviceToken } = body ?? {};

  try {
    if (typeof deviceToken === 'string' && deviceToken.length > 20) {
      const out = await sendToDevice(
        deviceToken,
        'المحطة التقنية',
        'الإشعارات تعمل على هذا الجهاز ✅'
      );
      return json({ sent: true, via: 'fcm', id: out.name });
    }

    if (typeof endpoint === 'string' && p256dh && auth) {
      webpush.setVapidDetails(
        'mailto:admin@muhta.online',
        Deno.env.get('VAPID_PUBLIC_KEY')!,
        Deno.env.get('VAPID_PRIVATE_KEY')!
      );
      await webpush.sendNotification(
        { endpoint, keys: { p256dh, auth } },
        JSON.stringify({
          title: 'المحطة التقنية',
          body: 'الإشعارات تعمل على هذا الجهاز ✅',
          url: '/',
        })
      );
      return json({ sent: true, via: 'webpush' });
    }

    return json({ error: 'no subscription or device token supplied' }, 400);
  } catch (err) {
    // the real reason, not a generic failure — this endpoint exists to diagnose
    const e = err as { statusCode?: number; body?: string; message?: string };
    return json({ error: e.body ?? e.message ?? String(err), statusCode: e.statusCode ?? 0 }, 502);
  }
});
