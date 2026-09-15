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
import { emailFor, userForPhone } from '../_shared/owner.ts';

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

/** من يطلب: معرّفُه، وهل هو إدارة. */
async function caller(req: Request): Promise<{ id: string; admin: boolean } | null> {
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  if (!data.user) return null;
  const { data: p } = await db.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  return { id: data.user.id, admin: p?.role === 'admin' };
}

/** اسمُ دخولٍ لاتينيٌّ ٤–٢٠ حرفاً، لا يلتبس بحسابات الهواتف p7XXXXXXXXX. */
const USERNAME = /^[a-z][a-z0-9_.]{3,19}$/;

/** «07901234567» أو «ahmed_night» → {phone|username, email}. */
function loginOf(raw: string): { phone: string | null; username: string | null; email: string } | null {
  const v = String(raw ?? '').trim();
  if (/^[0-9+\s()-]+$/.test(v)) {
    const c = core(v);
    return /^7\d{9}$/.test(c) ? { phone: `0${c}`, username: null, email: emailFor(c) } : null;
  }
  const u = v.toLowerCase();
  return USERNAME.test(u) && !/^p\d+$/.test(u) ? { phone: null, username: u, email: `${u}@muhta.app` } : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const who = await caller(req);
    if (!who) return json({ error: 'غير مصرّح' }, 403);

    const { stationId, phone, action, label, login } = await req.json();

    // ── موظّفٌ للمحطة: حسابٌ باسمٍ أو رقم، صفٌّ في station_managers ─────────
    //
    // «إضافةُ موظّفين … من الحساب الأساسيّ». صاحبُ المحطة يضيف حساباتٍ
    // **جديدةً** فقط: حسابٌ قائمٌ لا يُضاف ولا تُبدَّل كلمتُه من هنا — وإلّا
    // صار رقمُ جارِه بابَ استيلاء. والإدارةُ تضيف القائمَ بلا محطةٍ بكلمةٍ جديدة.
    if (action === 'add_staff') {
      const { data: st } = await db.from('stations').select('id, name, phone, owner_id').eq('id', stationId).maybeSingle();
      if (!st) return json({ error: 'المحطة غير موجودة' }, 404);
      if (!who.admin && st.owner_id !== who.id) return json({ error: 'غير مصرّح' }, 403);

      const l = loginOf(login ?? phone);
      if (!l) return json({ error: 'اسمُ الدخول: حروفٌ إنجليزيّة وأرقام (٤ فأكثر)، أو رقمُ هاتف 07XXXXXXXXX' }, 400);
      if (l.phone && core(st.phone) === core(l.phone)) return json({ error: 'هذا هو رقم المحطة الأساسي' }, 400);

      let password: string = newPassword();
      const { data: created } = await db.auth.admin.createUser({ email: l.email, password, email_confirm: true });
      let userId = created?.user?.id ?? null;
      if (!userId) {
        if (!who.admin) return json({ error: 'هذا الاسم أو الرقم له حسابٌ من قبل. اختر اسماً آخر، أو اطلب من الإدارة إضافته.' }, 409);
        // الإدارة: حسابٌ قائمٌ بلا محطة يُضاف بكلمةٍ جديدة.
        const u = l.phone ? await userForPhone(db, core(l.phone)) : null;
        if (!u) {
          const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
          userId = list?.users?.find((x) => x.email === l.email)?.id ?? null;
        } else userId = u.id;
        if (!userId) return json({ error: 'تعذّر تجهيز الحساب' }, 500);
        const { data: owns } = await db.from('stations').select('name').eq('owner_id', userId).limit(1).maybeSingle();
        if (owns) return json({ error: `الحسابُ صاحبُ محطةٍ أخرى «${owns.name}»` }, 409);
        const { data: prof } = await db.from('profiles').select('role').eq('id', userId).maybeSingle();
        if (prof?.role === 'admin') return json({ error: 'هذا حسابُ إدارة' }, 400);
        password = newPassword();
        const { error: pwErr } = await db.auth.admin.updateUserById(userId, { password });
        if (pwErr) return json({ error: 'تعذّر تجهيز الحساب' }, 500);
      }

      const { error: insErr } = await db.from('station_managers').insert({
        user_id: userId,
        station_id: stationId,
        phone: l.phone,
        username: l.username,
        label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 20) : null,
        added_by: who.id,
      });
      if (insErr) {
        if (insErr.code === '23505') return json({ error: 'هذا الحسابُ موظّفٌ في محطةٍ أخرى أصلاً' }, 409);
        return json({ error: 'تعذّر حفظ الحساب' }, 500);
      }
      return json({ ok: true, login: l.phone ?? l.username, phone: l.phone, username: l.username, label: label ?? null, password });
    }

    if (!who.admin) return json({ error: 'غير مصرّح' }, 403);

    // ── كلمةٌ جديدة لصاحب المحطة — بطلبه، وبيد الإدارة وحدَها ──────────────
    // ومع `login`/`phone`: لموظّفٍ من موظّفي هذه المحطة.
    if (action === 'password' && (login || phone)) {
      const l = loginOf(login ?? phone);
      if (!l) return json({ error: 'اسمُ دخولٍ غير صحيح' }, 400);
      let q = db.from('station_managers').select('user_id, phone, username').eq('station_id', stationId);
      q = l.phone ? q.eq('phone', l.phone) : q.eq('username', l.username);
      const { data: m } = await q.maybeSingle();
      if (!m) return json({ error: 'ليس من موظّفي هذه المحطة' }, 404);
      const fresh = newPassword();
      const { error: pwErr } = await db.auth.admin.updateUserById(m.user_id, { password: fresh });
      if (pwErr) return json({ error: 'تعذّر تغيير كلمة المرور' }, 500);
      return json({ ok: true, login: m.phone ?? m.username, phone: m.phone, password: fresh });
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
