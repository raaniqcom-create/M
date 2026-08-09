// One-time codes over SMS, for the two moments a phone number has to be proven:
// registering a station, and recovering its password. Accounts here are keyed
// by phone rather than email, so there is no inbox to send a reset link to —
// the SMS is not a nicety, it is the only channel that exists.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const OTPIQ_KEY = Deno.env.get('OTPIQ_API_KEY')!;
const OTPIQ_URL = 'https://api.otpiq.com/api/sms';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** 07XXXXXXXXX / +9647XXXXXXXXX / 9647… all reduce to 7XXXXXXXXX. */
function core(raw: string): string {
  const d = (raw ?? '').replace(/\D/g, '').replace(/^00/, '');
  return (d.startsWith('964') ? d.slice(3) : d).replace(/^0+/, '');
}

/** Codes are stored hashed. A leaked database row should not hand someone a
 *  live code, and the phone in the digest stops a stolen hash being replayed
 *  against a different number. */
async function digest(phone: string, code: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${phone}:${code}`)
  );
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const sixDigits = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');

async function sendSms(msisdn: string, code: string) {
  const res = await fetch(OTPIQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${OTPIQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      smsType: 'verification',
      phoneNumber: msisdn,
      verificationCode: code,
      // 'auto' lets OTPIQ fall back across WhatsApp/Telegram/SMS, which matters
      // on Iraqi networks where a plain SMS can sit undelivered for minutes
      provider: 'auto',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('otpiq', res.status, body);
    // An empty balance is an operations problem, not the caller's — say so
    // plainly instead of telling them to try again at something that cannot work.
    const out_of_credit =
      body?.canCover === false || String(body?.message ?? '').toLowerCase().includes('credit');
    throw Object.assign(new Error('otpiq'), {
      userMessage: out_of_credit
        ? 'خدمة الرسائل بلا رصيد حالياً. تواصل معنا عبر البوت.'
        : 'تعذّر إرسال الرمز. حاول بعد قليل.',
    });
  }
  return body;
}

/** The login account, not the station, is what both flows must agree on.
 *  Checking `stations` for recovery while signup checked accounts produced the
 *  contradiction that an admin's number was "already registered" and "not
 *  registered" at the same time — an account can exist without a station. */
async function accountId(c: string): Promise<string | null> {
  const email = `p${c}@muhta.app`;
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users?.find((u) => u.email === email)?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { action, phone, code, password, purpose } = await req.json();
    const c = core(phone);
    if (!/^7\d{9}$/.test(c)) return json({ error: 'رقم الهاتف غير صحيح' }, 400);

    if (action === 'send') {
      const forReset = purpose === 'reset';
      const exists = Boolean(await accountId(c));
      if (forReset && !exists) return json({ error: 'لا يوجد حساب بهذا الرقم' }, 404);
      if (!forReset && exists) return json({ error: 'هذا الرقم مسجّل مسبقاً' }, 409);

      // One code a minute, ten an hour. Without this the endpoint is a free
      // SMS cannon pointed at any Iraqi number, billed to us.
      const { data: prev } = await db
        .from('otp_codes')
        .select('sent_at, sent_count')
        .eq('phone', c)
        .maybeSingle();
      if (prev) {
        const since = Date.now() - new Date(prev.sent_at).getTime();
        if (since < 60_000) {
          return json({ error: 'انتظر دقيقة قبل طلب رمز جديد', retryIn: Math.ceil((60_000 - since) / 1000) }, 429);
        }
        if (since < 3_600_000 && prev.sent_count >= 10) {
          return json({ error: 'تجاوزت عدد المحاولات. حاول بعد ساعة.' }, 429);
        }
      }

      const value = sixDigits();
      await db.from('otp_codes').upsert(
        {
          phone: c,
          code_hash: await digest(c, value),
          purpose: forReset ? 'reset' : 'register',
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          attempts: 0,
          sent_at: new Date().toISOString(),
          sent_count:
            prev && Date.now() - new Date(prev.sent_at).getTime() < 3_600_000
              ? prev.sent_count + 1
              : 1,
        },
        { onConflict: 'phone' }
      );

      await sendSms(`964${c}`, value);
      return json({ ok: true });
    }

    if (action === 'verify') {
      const { data: row } = await db.from('otp_codes').select('*').eq('phone', c).maybeSingle();
      if (!row) return json({ error: 'اطلب رمزاً أولاً' }, 400);
      if (new Date(row.expires_at).getTime() < Date.now())
        return json({ error: 'انتهت صلاحية الرمز' }, 400);
      if (row.attempts >= 5) return json({ error: 'تجاوزت عدد المحاولات' }, 429);

      if ((await digest(c, String(code ?? ''))) !== row.code_hash) {
        await db.from('otp_codes').update({ attempts: row.attempts + 1 }).eq('phone', c);
        return json({ error: 'الرمز غير صحيح' }, 400);
      }

      if (row.purpose === 'reset') {
        if (typeof password !== 'string' || password.length < 6)
          return json({ error: 'كلمة المرور ٦ أحرف على الأقل' }, 400);

        const id = await accountId(c);
        if (!id) return json({ error: 'لا يوجد حساب بهذا الرقم' }, 404);
        const { error } = await db.auth.admin.updateUserById(id, { password });
        if (error) return json({ error: 'تعذّر تغيير كلمة المرور' }, 500);
      }

      // burn the code either way: one success, one use
      await db.from('otp_codes').delete().eq('phone', c);
      return json({ ok: true });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (err) {
    console.error('otp', err);
    const msg = (err as { userMessage?: string })?.userMessage;
    return json({ error: msg ?? 'تعذّر إتمام الطلب. حاول مجدداً.' }, msg ? 503 : 500);
  }
});
