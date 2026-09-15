// Moves a station onto its real owner's number.
//
// Several stations were entered by hand with the admin's own number standing
// in. The phone is not just a field: it is the public contact *and* the login
// username, since accounts are keyed p<digits>@muhta.app. Changing it in the
// stations table alone would leave the station reachable on a number that
// belongs to nobody, still signed in to by the admin. So this moves both.
//
// ويعيد أيضاً محطةً باسم الإدارة تحمل رقمَ صاحبها إلى حسابه (الرقمُ نفسُه —
// كان يُرفض «هذا هو الرقم الحالي» فلا تعود أبداً)، ويُصدر كلمةَ سرٍّ جديدة
// لصاحب المحطة بطلبٍ صريحٍ من الإدارة (`action: 'password'`) — لا تدويرَ
// تلقائيّاً في أيّ مسار: قاعدةُ صاحب المنصّة.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { newPassword } from '../_shared/password.ts';
import { userForPhone } from '../_shared/owner.ts';

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

function core(raw: string): string {
  const d = (raw ?? '').replace(/\D/g, '').replace(/^00/, '');
  return (d.startsWith('964') ? d.slice(3) : d).replace(/^0+/, '');
}

/** معرّفُ الإدارة إن كان الطالبُ إدارةً — وإلّا null. */
async function adminId(req: Request): Promise<string | null> {
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  if (!data.user) return null;
  const { data: p } = await db.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  return p?.role === 'admin' ? data.user.id : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = await adminId(req);
    if (!admin) return json({ error: 'غير مصرّح' }, 403);

    const { stationId, phone, action, label } = await req.json();

    // ── رقمٌ إضافيٌّ لوردية: حسابٌ بكلمته، صفٌّ في station_managers ─────────
    //
    // «أكثرُ من رقمٍ لإدارة المحطة لأنّ يوجد أكثرُ من أوقات دوام». الإضافةُ
    // بيد الإدارة وحدَها: إنشاءُ الحساب يحتاج مفتاحَ الخدمة، ومالكٌ يضيف
    // رقمَ غيره ثمّ يطلب كلمتَه بابُ استيلاء.
    if (action === 'add_manager') {
      const c = core(phone);
      if (!/^7\d{9}$/.test(c)) return json({ error: 'رقم غير صحيح. اكتبه هكذا: 07901234567' }, 400);
      const { data: st } = await db.from('stations').select('id, name, phone').eq('id', stationId).maybeSingle();
      if (!st) return json({ error: 'المحطة غير موجودة' }, 404);
      if (core(st.phone) === c) return json({ error: 'هذا هو رقم المحطة الأساسي' }, 400);

      const u = await userForPhone(db, c);
      if (!u) return json({ error: 'تعذّر تجهيز حساب الرقم' }, 500);

      // بالهويّة لا بالرقم: صاحبُ محطةٍ أخرى أو حسابُ إدارة لا يصير وردية.
      const { data: owns } = await db.from('stations').select('name').eq('owner_id', u.id).limit(1).maybeSingle();
      if (owns) return json({ error: `الرقم صاحبُ محطةٍ أخرى «${owns.name}»` }, 409);
      const { data: prof } = await db.from('profiles').select('role').eq('id', u.id).maybeSingle();
      if (prof?.role === 'admin') return json({ error: 'هذا حسابُ إدارة' }, 400);

      // حسابٌ سابقٌ بلا محطة (سجّل ولم يُكمل): كلمةٌ جديدةٌ تُصدر بيد الإدارة
      // وتُعرض لها — فلا يبقى الرقمُ بكلمةٍ يعرفها غريبٌ سجّله من قبل.
      let password = u.password;
      if (password === null) {
        password = newPassword();
        const { error: pwErr } = await db.auth.admin.updateUserById(u.id, { password });
        if (pwErr) return json({ error: 'تعذّر تجهيز حساب الرقم' }, 500);
      }

      const { error: insErr } = await db.from('station_managers').insert({
        user_id: u.id,
        station_id: stationId,
        phone: `0${c}`,
        label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 20) : null,
        added_by: admin,
      });
      if (insErr) {
        if (insErr.code === '23505') return json({ error: 'الرقم مسؤولٌ عن محطةٍ أخرى أصلاً' }, 409);
        return json({ error: 'تعذّر حفظ الرقم' }, 500);
      }
      return json({ ok: true, phone: `0${c}`, label: label ?? null, password });
    }

    // ── كلمةٌ جديدة لصاحب المحطة — بطلبه، وبيد الإدارة وحدَها ──────────────
    // ومع `phone`: لرقمٍ إضافيٍّ من أرقام هذه المحطة.
    if (action === 'password' && phone) {
      const c = core(phone);
      const { data: m } = await db
        .from('station_managers')
        .select('user_id, phone')
        .eq('station_id', stationId)
        .eq('phone', `0${c}`)
        .maybeSingle();
      if (!m) return json({ error: 'الرقم ليس من أرقام هذه المحطة' }, 404);
      const fresh = newPassword();
      const { error: pwErr } = await db.auth.admin.updateUserById(m.user_id, { password: fresh });
      if (pwErr) return json({ error: 'تعذّر تغيير كلمة المرور' }, 500);
      return json({ ok: true, phone: m.phone, password: fresh });
    }
    if (action === 'password') {
      const { data: st } = await db
        .from('stations')
        .select('id, name, phone, owner_id')
        .eq('id', stationId)
        .maybeSingle();
      if (!st) return json({ error: 'المحطة غير موجودة' }, 404);
      const { data: prof } = await db.from('profiles').select('role').eq('id', st.owner_id).maybeSingle();
      if (prof?.role === 'admin') {
        return json({ error: 'المحطة باسمك أنت لا باسم صاحبها — اكتب رقمه في الحقل واضغط «نقل» أوّلاً.' }, 400);
      }
      const { data: u } = await db.auth.admin.getUserById(st.owner_id);
      if (!u?.user) return json({ error: 'لا حسابَ لصاحب المحطة بعد.' }, 404);
      const fresh = newPassword();
      const { error: pwErr } = await db.auth.admin.updateUserById(u.user.id, { password: fresh });
      if (pwErr) return json({ error: 'تعذّر تغيير كلمة المرور' }, 500);
      return json({ ok: true, phone: st.phone, password: fresh });
    }

    const c = core(phone);
    if (!/^7\d{9}$/.test(c)) return json({ error: 'رقم غير صحيح. اكتبه هكذا: 07901234567' }, 400);

    const { data: station } = await db
      .from('stations')
      .select('id, name, phone, owner_id')
      .eq('id', stationId)
      .maybeSingle();
    if (!station) return json({ error: 'المحطة غير موجودة' }, 404);

    // Another station already publishing this number would leave drivers with
    // two entries pointing at one forecourt.
    const { data: clash } = await db
      .from('stations')
      .select('id, name')
      .eq('phone', `0${c}`)
      .neq('id', stationId)
      .maybeSingle();
    if (clash) return json({ error: `الرقم مستخدم في «${clash.name}»` }, 409);

    const email = `p${c}@muhta.app`;
    // كانت مشتقّةً من الرقم نفسِه، واسمُ الدخول ذلك الرقم — فالنصفان علنيّان.
    // انظر `_shared/password.ts`.
    const password = newPassword();

    let ownerId: string | null = null;
    let issued: string | null = null;

    const { data: created } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created?.user) {
      ownerId = created.user.id;
      issued = password;
    } else {
      // the number already has an account — hand the station to it rather than
      // resetting a password its owner may already be using
      const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      ownerId = list?.users?.find((u) => u.email === email)?.id ?? null;
    }
    if (!ownerId) return json({ error: 'تعذّر تجهيز حساب الرقم الجديد' }, 500);
    // الرقمُ نفسُه لكنّ المحطةَ باسم غيرِ حسابه (استُرجعت باسم المدير مثلاً):
    // تُعاد إليه. ولا يُرفض إلا ما لا يغيّر شيئاً.
    if (core(station.phone) === c && station.owner_id === ownerId) {
      return json({ error: 'المحطة على هذا الرقم وحسابه أصلاً' }, 400);
    }

    const { error } = await db
      .from('stations')
      .update({ phone: `0${c}`, owner_id: ownerId })
      .eq('id', stationId);
    if (error) return json({ error: 'تعذّر تحديث المحطة' }, 500);

    // the old owner's Telegram link now points at a station they no longer own
    // — رابطُ الرقم الأساسيّ المغادر وحدَه؛ أرقامُ الورديات تبقى.
    await db.from('telegram_links').delete().eq('station_id', stationId).eq('phone', core(station.phone));
    // ورديةٌ رُفعت إلى الأساسيّ لا تبقى صفَّ وردية.
    await db.from('station_managers').delete().eq('user_id', ownerId);

    return json({ ok: true, phone: `0${c}`, password: issued });
  } catch (err) {
    console.error('station-phone', err);
    return json({ error: 'تعذّر إتمام الطلب' }, 500);
  }
});
