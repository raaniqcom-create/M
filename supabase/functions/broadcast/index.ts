// Sends an offer to the citizens who asked for one. Every send costs real
// credit and lands on a real phone, so this is the most expensive button in
// the product — it is admin-only, it reports the exact recipient count before
// spending anything, and it never invents its own audience.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const OTPIQ_KEY = Deno.env.get('OTPIQ_API_KEY')!;
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

/** The function runs without JWT verification so the public endpoints in this
 *  project stay reachable, which means the admin check has to happen here —
 *  an unguarded broadcast is a stranger spending our credit on our users. */
async function isAdmin(req: Request): Promise<boolean> {
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return false;
  const { data } = await db.auth.getUser(jwt);
  if (!data.user) return false;
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();
  return profile?.role === 'admin';
}

const audience = (city?: string | null) => {
  let q = db.from('subscribers').select('phone, city').is('unsubscribed_at', null);
  if (city) q = q.eq('city', city);
  return q;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (!(await isAdmin(req))) return json({ error: 'غير مصرّح' }, 403);
    const { action, message, city } = await req.json();

    const { data: subs } = await audience(city);
    const list = subs ?? [];

    // A dry run so the admin sees who this reaches before it costs anything.
    if (action === 'count') return json({ count: list.length });

    if (action !== 'send') return json({ error: 'unknown action' }, 400);
    const text = String(message ?? '').trim();
    if (text.length < 5) return json({ error: 'الرسالة قصيرة جداً' }, 400);
    if (text.length > 300) return json({ error: 'الرسالة أطول من ٣٠٠ حرف' }, 400);
    if (!list.length) return json({ error: 'لا يوجد مشتركون في هذا النطاق' }, 400);

    let sent = 0;
    const failures: string[] = [];

    // Sequential, not a fan-out: OTPIQ rate-limits, and a burst that trips it
    // would report success for messages that never left.
    for (const s of list) {
      const res = await fetch('https://api.otpiq.com/api/sms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OTPIQ_KEY}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          smsType: 'custom',
          phoneNumber: `964${s.phone}`,
          customMessage: text,
          provider: 'auto',
        }),
      });
      if (res.ok) sent++;
      else {
        const body = await res.text();
        failures.push(`${s.phone}: ${res.status}`);
        // out of credit part-way through: stop rather than hammer the API
        if (res.status === 400 && body.toLowerCase().includes('credit')) break;
      }
    }

    return json({ ok: true, sent, total: list.length, failed: failures.length });
  } catch (err) {
    console.error('broadcast', err);
    return json({ error: 'تعذّر الإرسال' }, 500);
  }
});
