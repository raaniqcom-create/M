// «غسيل» M11: الطلبُ بعدّة سيارات كما يراه الزائرُ (anon) — سقفُ العدّاد في الإعدادات،
// «حجوزاتي» بالمفتاح والنوع، وأنّ الحجزَ والإلغاءَ الجماعيَّين موجودان ويردّان خطأً عربيّاً
// لا 404 (الدالّةُ غائبة) ولا 500 (انفجرت).
//
//   node scripts/probe-wash-cars.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.log('✗ .env.local بلا NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function call(path, body, method) {
  const r = await fetch(URL_ + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: H,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: r.status, text, json };
}

// نداءٌ لا يصيب شيئاً يُحسب تخميناً على الهاتف (10/ساعة) — هاتفٌ عشوائيّ كي لا يقفل الفحصُ نفسَه.
const PHONE = '0770' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
const NIL = '00000000-0000-0000-0000-000000000000';
const brief = (r) => `${r.status} ${r.text.slice(0, 120)}`;
const arabic = (s) => /[؀-ۿ]/.test(s || '');

// [اسم، مسار، جسم (undefined = GET)، حكم → نصُّ الخطأ أو null]
const CHECKS = [
  // الهجرةُ تعيد كتابة wash_config يدويّاً لتضيف مفتاحاً — فنتحقّق من المفاتيح كلِّها لا الجديدِ وحدَه:
  // مفتاحٌ ساقطٌ يرجع 200 بلا خطأ، وlib/wash.ts يصير undefined بلا أيّ إنذار.
  ['rpc wash_config: كلُّ المفاتيح + max_cars_order', '/rest/v1/rpc/wash_config', {},
    (r) => (r.status === 200 && Array.isArray(r.json?.plans)
      && ['promo_first_month', 'trial_days', 'grace_days', 'cancel_free_min', 'horizon_guest', 'horizon_sub', 'max_cars_order']
        .every((k) => Number.isFinite(r.json[k]))
      && r.json.max_cars_order >= 1 ? null : brief(r))],
  ['rpc wash_my_bookings (رمزٌ وهميّ → [])', '/rest/v1/rpc/wash_my_bookings', { p_codes: ['000000'], p_phone: PHONE },
    (r) => (r.status === 200 && Array.isArray(r.json) && r.json.length === 0 ? null : brief(r))],
  // مغسلةٌ لا وجودَ لها: الدالّةُ موجودةٌ وتردّ رسالةً عربيّة — لا 404 ولا 500.
  ['rpc book_wash_group: مغسلةٌ وهميّة → خطأٌ عربيّ', '/rest/v1/rpc/book_wash_group',
    { p_wash: NIL, p_service: NIL, p_day: new Date().toISOString().slice(0, 10), p_slot: '10:00',
      p_name: 'فحص', p_phone: PHONE, p_vehicles: { small: 1 } },
    (r) => (r.status === 400 && arabic(r.json?.message) ? null : brief(r))],
  ['rpc cancel_wash_group: مفتاحٌ وهميّ → 0', '/rest/v1/rpc/cancel_wash_group', { p_group: NIL, p_phone: PHONE },
    (r) => (r.status === 200 && r.json === 0 ? null : brief(r))],
];

let bad = 0;
for (const [name, path, body, judge] of CHECKS) {
  const t0 = Date.now();
  try {
    const r = await call(path, body);
    const err = judge(r);
    if (err) bad++;
    console.log(`${err ? '✗' : '✓'} ${name}  ${Date.now() - t0}ms${err ? '  ' + err : ''}`);
  } catch (e) {
    bad++;
    console.log(`✗ ${name}  ${Date.now() - t0}ms  ${e.name}: ${e.message}`);
  }
}

console.log(bad ? `\n${bad} فشل` : '\nطلبُ عدّةِ سياراتٍ سليمٌ من جهة الزائر');
process.exit(bad ? 1 : 0);
