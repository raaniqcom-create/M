// Sends one notification straight back to the subscription that asked for it.
// Nothing is stored: this exists so a person can prove push works on their own
// device before any station is registered.
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  webpush.setVapidDetails(
    'mailto:admin@muhta.online',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!
  );

  const body = await req.json().catch(() => null);
  const { endpoint, p256dh, auth } = body ?? {};

  if (typeof endpoint !== 'string' || !p256dh || !auth) {
    return new Response(JSON.stringify({ error: 'invalid subscription' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      JSON.stringify({
        title: 'المحطة التقنية',
        body: 'الإشعارات تعمل على هذا الجهاز ✅',
        url: '/',
      })
    );
    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // surface the real reason instead of a generic failure
    const e = err as { statusCode?: number; body?: string };
    return new Response(
      JSON.stringify({ error: e.body ?? String(err), statusCode: e.statusCode ?? 0 }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
