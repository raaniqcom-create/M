// Deletes the caller's own account and everything attached to it.
//
// Apple guideline 5.1.1(v) is unconditional: an app that lets you create an
// account must let you delete it from inside the app. Pointing owners at the
// Telegram bot — which is what the privacy page used to say — does not count.
//
// The caller proves who they are with their own JWT; nothing here takes an id
// from the request body, so one owner can never delete another's station.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'غير مصرّح' }, 401);

    const { data: auth } = await db.auth.getUser(jwt);
    const user = auth?.user;
    if (!user) return json({ error: 'غير مصرّح' }, 401);

    // An admin deleting themselves would strand the platform, and it is never
    // what the button in the owner panel is for.
    const { data: profile } = await db
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role === 'admin') {
      return json({ error: 'حساب الإدارة لا يُحذف من التطبيق' }, 400);
    }

    const { data: stations } = await db
      .from('stations').select('id, phone').eq('owner_id', user.id);
    const ids = (stations ?? []).map((s) => s.id);

    // Children first: station_products and traffic_votes reference the station.
    if (ids.length) {
      await db.from('station_products').delete().in('station_id', ids);
      await db.from('traffic_votes').delete().in('station_id', ids);
      await db.from('complaints').delete().in('station_id', ids);
      await db.from('push_subscriptions').delete().in('station_id', ids);
      await db.from('telegram_favorites').delete().in('station_id', ids);
      await db.from('telegram_links').delete().in('station_id', ids);
      await db.from('stations').delete().in('id', ids);
    }

    // The phone doubles as the subscriber key, so an owner who also subscribed
    // to offers stops receiving them too.
    for (const s of stations ?? []) {
      if (s.phone) await db.from('subscribers').delete().eq('phone', s.phone);
    }

    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, stations: ids.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
