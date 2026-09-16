// «غسيل» v3: كلُّ ما يقرؤه الزائرُ (anon) من الجديد — العرضُ بالمنطقة و«مموَّلة»،
// الإعلاناتُ العامّة، أقربُ موعدٍ لكلّ مغسلة، «حجوزاتي» — وأنّ جدولَ الإعلانات الخامَ محجوب
// وأنّ المنظورَين العامَّين لا يقبلان كتابةً (منظورٌ من جدولٍ واحدٍ بصلاحيّة المالك يقبلها ما لم تُسحب).
//
//   node scripts/probe-wash-v3.mjs
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
const denied = (r) => (r.status === 401 || r.status === 403 ? null : `${r.status} ${r.text.slice(0, 120)}`);

// [اسم، مسار، جسم (undefined = GET)، حكم → نصُّ الخطأ أو null، طريقة؟]
const CHECKS = [
  ['washes_public: area, sponsored', '/rest/v1/washes_public?select=id,name,area,sponsored&limit=5', undefined,
    (r) => (r.status === 200 && Array.isArray(r.json) ? null : `${r.status} ${r.text.slice(0, 120)}`)],
  ['wash_ads_public', '/rest/v1/wash_ads_public?select=*&limit=20', undefined,
    (r) => (r.status === 200 && Array.isArray(r.json) ? null : `${r.status} ${r.text.slice(0, 120)}`)],
  ['rpc wash_next_slot_all', '/rest/v1/rpc/wash_next_slot_all', {},
    (r) => (r.status === 200 && Array.isArray(r.json) ? null : `${r.status} ${r.text.slice(0, 120)}`)],
  ['rpc wash_my_bookings (رمزٌ وهميّ → [])', '/rest/v1/rpc/wash_my_bookings', { p_codes: ['000000'], p_phone: PHONE },
    (r) => (r.status === 200 && Array.isArray(r.json) && r.json.length === 0 ? null : `${r.status} ${r.text.slice(0, 120)}`)],
  ['wash_ads محجوبٌ عن anon', '/rest/v1/wash_ads?select=id&limit=1', undefined,
    (r) => {
      if (r.status === 401 || r.status === 403) return null;
      if (r.status === 200 && Array.isArray(r.json) && r.json.length === 0) return null;
      return `${r.status} ${r.text.slice(0, 120)}`;
    }],
  // title بحرفٍ واحد يخالف القيد — لو غابت الصلاحيّةُ فالجواب 400 ولا يُدرَج شيء.
  ['wash_ads_public لا يقبل كتابةً من anon', '/rest/v1/wash_ads_public', { kind: 'banner', title: 'x' }, denied],
  // المعرّفُ الصفريّ لا يطابق صفّاً — لو غابت الصلاحيّةُ فالجواب 204 ولا يتغيّر شيء.
  ['washes_public لا يقبل تعديلاً من anon', `/rest/v1/washes_public?id=eq.${NIL}`, { name: 'x' }, denied, 'PATCH'],
];

let bad = 0;
for (const [name, path, body, judge, method] of CHECKS) {
  const t0 = Date.now();
  try {
    const r = await call(path, body, method);
    const err = judge(r);
    if (err) bad++;
    const how = name.startsWith('wash_ads محجوب') && !err ? (r.status === 200 ? ' (RLS → [])' : ` (${r.status})`) : '';
    console.log(`${err ? '✗' : '✓'} ${name}${how}  ${Date.now() - t0}ms${err ? '  ' + err : ''}`);
  } catch (e) {
    bad++;
    console.log(`✗ ${name}  ${Date.now() - t0}ms  ${e.name}: ${e.message}`);
  }
}

console.log(bad ? `\n${bad} فشل` : '\nكلُّ قراءات «غسيل» v3 سليمة');
process.exit(bad ? 1 : 0);
