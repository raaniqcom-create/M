// شاشةُ السيارة لا تكشف رقماً لا تكشفه المنصّةُ أصلاً.
//
//   node scripts/check-car-privacy.mjs
//
// سبعَ عشرةَ محطةً من أربعين اختارت إخفاءَ رقمها، ووُعدت في لوحتها حرفيّاً:
// «يختفي زرُّ الاتصال من التطبيق والبوتات». و`car_nearby` تطوي بوّابةَ المسافر
// (`station_phone_for`) داخلها لتوفّر الرقمَ في يد السائق قبل أن يضغط — لا
// بنداءٍ ثانٍ بعد الضغط وهو يقود.
//
// وطيُّ قاعدةِ خصوصيّةٍ داخل دالّةٍ أخرى يحتاج دليلاً، لا حسنَ نيّة. فهذا
// الفحصُ يثبت ثلاثة أشياء على القاعدة الحيّة:
//
//   ١ · لا رقمَ مخفيٌّ يُفتح لمن يقف في مدينة المحطة نفسِها.
//   ٢ · ولا لمن هو أقربُ من عشرة كيلومترات — فمحطةٌ على بُعد تسعةٍ ليست رحلة،
//       وصاحبُها أخفى رقمه عمّن يستطيع أن يمرّ بها.
//   ٣ · وكلُّ رقمٍ تعطيه `car_nearby` تعطيه `station_phone_for` للمدينة نفسِها.
//       أي أنّ الشاشةَ **أضيقُ أبداً** من الباب القائم، لا أوسع.
//
// يُقرأ المفتاحُ العامّ من `.env.local` — وهو المفتاح المطبوع في حزمة كلّ
// زائر، فالفحصُ يرى ما يراه أيُّ أحد.

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

/** المسافةُ الدنيا التي تُعدّ رحلة — مرآةُ الحارس في `20260909c_car_nearby.sql`. */
const TRIP_KM = 10;

const rpc = async (name, body) => {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${name}: ${r.status} ${await r.text()}`);
  return r.json();
};

// مواقعُ يُنطلق منها: مركزُ مدينةٍ فيها محطاتٌ مخفيّة، ومركزُ أخرى، وصحراءُ
// الطريق — وهي الحالُ التي كُتبت البوّابةُ لأجلها.
// و`city` هي المدينةُ التي يشتقّها الخادمُ من هذه الإحداثيّات — مركزُ المدينة
// يقع داخل حدّ الاثني عشر كيلومتراً، والصحراءُ خارجَه فلا مدينةَ لها.
const SPOTS = [
  { label: 'مركز الرمادي', lat: 33.4258, lng: 43.3012, city: 'الرمادي' },
  { label: 'مركز الفلوجة', lat: 33.3556, lng: 43.7864, city: 'الفلوجة' },
  { label: 'صحراءُ غرب هيت', lat: 33.6, lng: 41.5, city: null },
];

let checks = 0;
let failed = 0;

const assert = (ok, what) => {
  checks++;
  if (ok) return;
  failed++;
  console.log(`  ✗ ${what}`);
};

const hidden = await (async () => {
  const r = await fetch(
    `${URL_}/rest/v1/stations_public?select=id,name,city,phone,phone_hidden&status=eq.approved&phone_hidden=is.true`,
    { headers: H }
  );
  return r.json();
})();

console.log(`محطاتٌ تُخفي رقمها: ${hidden.length}`);
const byId = new Map(hidden.map((s) => [s.id, s]));

for (const spot of SPOTS) {
  const rows = await rpc('car_nearby', { p_lat: spot.lat, p_lng: spot.lng, p_limit: 40 });
  let opened = 0;

  for (const row of rows) {
    if (!byId.has(row.id)) continue; // محطةٌ تنشر رقمها — لا شأن لهذا الفحص بها
    if (row.phone === null) continue;
    opened++;

    // ١ · لا من مدينتها
    assert(
      row.city !== spot.city,
      `${row.name}: رقمٌ مخفيٌّ فُتح داخل مدينته (${row.city}) من ${spot.label}`
    );

    // ٢ · ولا أقربَ من عشرة كيلومترات
    assert(
      row.distance_km >= TRIP_KM,
      `${row.name}: رقمٌ مخفيٌّ فُتح على بُعد ${row.distance_km} كم من ${spot.label} — دون حدّ الرحلة`
    );

    // ٣ · وما فُتح، تفتحه البوّابةُ القائمة نفسُها للمدينة التي اشتقّها الخادم.
    //     فالشاشةُ لا تعرف رقماً من طريقٍ خاصّ بها.
    const gate = await rpc('station_phone_for', { p_station: row.id, p_city: spot.city ?? 'خارج المدن' });
    assert(
      gate === row.phone,
      `${row.name}: الشاشةُ أعطت رقماً لا تعطيه بوّابةُ المسافر من ${spot.label}`
    );
  }

  console.log(`  ${spot.label}: ${rows.length} محطة، فُتح منها ${opened} رقماً مخفيّاً`);
}

console.log(failed ? `\n${failed} من ${checks} فحصاً سقط.` : `\n${checks} فحصاً — كلُّها سليمة.`);
process.exit(failed ? 1 : 0);
