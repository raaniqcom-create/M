// Rebuilds the public site after a station is approved.
//
// The site is a static export: a station's page only exists if it was approved
// when the build ran. deploy.yml has always listened for a `stations-changed`
// repository_dispatch — nothing ever sent one, so every station approved since
// the last push had a dead link, and the owner was handed a URL that 404s.
//
// The GitHub token cannot live in the browser bundle, so the dispatch goes
// through here. Admin-only: a rebuild is cheap but not free, and an open
// endpoint is a free CI-minute faucet for anyone holding the anon key.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const REPO = 'raaniqcom-create/M';

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
    if (!auth?.user) return json({ error: 'غير مصرّح' }, 401);

    const { data: profile } = await db
      .from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
    if (profile?.role !== 'admin') return json({ error: 'غير مصرّح' }, 403);

    const token = Deno.env.get('GH_DISPATCH_TOKEN');
    if (!token) return json({ error: 'GH_DISPATCH_TOKEN غير مضبوط' }, 500);

    const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'muhta-rebuild',
      },
      body: JSON.stringify({ event_type: 'stations-changed' }),
    });

    // 204 is the documented success; anything else is worth surfacing so the
    // admin knows the link will stay dead until someone pushes.
    if (res.status !== 204) {
      return json({ error: `GitHub ${res.status}: ${await res.text()}` }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
