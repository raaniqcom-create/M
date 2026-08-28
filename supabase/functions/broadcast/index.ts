// Sends an offer to the citizens who asked for one. Every send costs real
// credit and lands on a real phone, so this is the most expensive button in
// the product — it is admin-only, it reports the exact recipient count before
// spending anything, and it never invents its own audience.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const OTPIQ_KEY = Deno.env.get('OTPIQ_API_KEY')!;
/** اسمُ المُرسِل المسجَّل لدى OTPIQ — بدونه يُرفض كلُّ نصٍّ حرّ بـ400. */
const OTPIQ_SENDER = Deno.env.get('OTPIQ_SENDER_ID');

/** جوابُ المزوّد يُعاد كما هو حين لا يكون JSON — فالخطأ نصٌّ أحياناً */
const safeJson = (t: string): unknown => {
  try { return JSON.parse(t); } catch { return t.slice(0, 300); }
};
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
    // بابان لهذه الدالّة: الإدارةُ برمزها، والنداءُ الداخليّ بسرّ المهامّ —
    // كما في notify وrebuild وannounce. وإدارةُ اسم المُرسِل عملٌ تشغيليّ
    // يُنفَّذ من سطر الأوامر، لا من لوحةٍ يفتحها أحد كلَّ يوم.
    const internal = req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET');
    if (!internal && !(await isAdmin(req))) return json({ error: 'غير مصرّح' }, 403);
    const { action, message, city, senderId } = await req.json();

    const { data: subs } = await audience(city);
    const list = subs ?? [];

    // A dry run so the admin sees who this reaches before it costs anything.
    if (action === 'count') return json({ count: list.length });

    // ── اسمُ المُرسِل ─────────────────────────────────────────────────────
    //
    // **بابٌ لأمرٍ لا يُفعل من هنا عادةً — لكنه يُقفل كلَّ رسالةٍ نصّية.**
    // حسابُ OTPIQ بلا اسم مُرسِلٍ مسجَّل، فكلُّ smsType:'custom' يُرفض بـ400
    // «you must provide (senderId)». وهذا يمنع تذكيرَ الركود للمحطات التي لا
    // جهازَ لها، **ويمنع استعادةَ كلمة المرور لكلّ من نسيها** — إذ الطريقُ
    // الوحيد إليها رسالةٌ نصّية.
    //
    // فتُقرأ القائمة ويُطلب التسجيل من هنا، بدل تخمين اسمٍ ونشرِ رسائلَ باسمٍ
    // ليس لنا. والاعتمادُ عند المزوّد وشركات الاتصال، لا عندنا — فيُعاد ما
    // يقوله حرفاً بحرف.
    if (action === 'sender') {
      const list_ = await fetch('https://api.otpiq.com/api/sender-ids', {
        headers: { Authorization: `Bearer ${OTPIQ_KEY}` },
      });
      const current = await list_.text();

      const name = String((await Promise.resolve(senderId)) ?? '').trim();
      if (!name) return json({ ok: true, current: safeJson(current), configured: OTPIQ_SENDER ?? null });

      const made = await fetch('https://api.otpiq.com/api/sender-ids', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OTPIQ_KEY}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ senderId: name }),
      });
      const said = await made.text();
      const after = await (
        await fetch('https://api.otpiq.com/api/sender-ids', {
          headers: { Authorization: `Bearer ${OTPIQ_KEY}` },
        })
      ).text();
      return json({
        ok: made.ok,
        status: made.status,
        requested: name,
        said: safeJson(said),
        before: safeJson(current),
        after: safeJson(after),
      });
    }

    if (action !== 'send') return json({ error: 'unknown action' }, 400);
    const text = String(message ?? '').trim();
    if (text.length < 5) return json({ error: 'الرسالة قصيرة جداً' }, 400);
    if (text.length > 300) return json({ error: 'الرسالة أطول من ٣٠٠ حرف' }, 400);
    if (!list.length) return json({ error: 'لا يوجد مشتركون في هذا النطاق' }, 400);
    // قبل أول نداء: بلا مُرسِلٍ مسجَّل تسقط كلُّ رسالةٍ بـ400، والحلقةُ تعدّ
    // فشلاً بعدد المشتركين ثمّ تعود «تمّ الإرسال: 0». فيُقال السببُ مرّةً.
    if (!OTPIQ_SENDER) {
      return json(
        { error: 'لا يمكن الإرسال: لم يُضبط OTPIQ_SENDER_ID — سجّل اسم مُرسِلٍ في حساب OTPIQ أولاً.' },
        400
      );
    }

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
          // OTPIQ يرفض كلَّ نصٍّ حرٍّ بلا اسم مُرسِلٍ مسجَّل: 400 «you must
          // provide (senderId)». وقِيس على الحساب الحيّ فوُجد بلا مُرسِلٍ
          // واحد — أي أن هذا البثّ لم يُرسِل رسالةً قطُّ منذ كُتب، وكان
          // يعود بـ{ok:true, sent:0} فيُقرأ نجاحاً.
          senderId: OTPIQ_SENDER,
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
