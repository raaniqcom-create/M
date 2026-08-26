// يُولّد lib/roadStations.ts من ملفّات CSV.
//
//   node scripts/road-stations.mjs "…/الانبار.csv" "…/بغداد.csv"
//
// **لماذا ملفٌّ مولَّد لا جدولٌ في القاعدة:** البيانات ~12 ك.ب، مرجعيةٌ لا
// يكتبها أحد ولا يتفاعل معها أحد. وإدخالها إلى جدول stations يكسر عشرة
// أشياء — أشدّها أن اشتراك الزمن الحقيقي في الرئيسة يُطلق أربعة استعلامات
// لكل حدث، فإدراج 186×7 صفّ منتج يعني آلاف الطلبات من كل متصفّح مفتوح.
//
// **والتنظيف ليس تجميلاً.** المصدر نقاطُ خرائط، وقال المالك عن الرمادي:
// «41 محطة كثير، لم أشاهد هذا العدد» — وكان محقّاً. ثلاث مصافٍ تُنزلها إلى 30:
import { readFileSync, writeFileSync } from 'node:fs';

// ١) عمود category هو الحَكَم — لا تخمينُ الاسم.
const CATEGORY = 'gas_station';

// ٢) ما ليس محطة وإن حمل التصنيف: مولّدات كهرباء، ومجمّعات ماء، ومحلّات
//    زيوت، ومعامل، ونقاط بيع. وإدخالها يجعل المسافر يقصد مجمّع ماءٍ ليُعبّئ.
const NOT_A_STATION =
  /مجمع ماء|مولد|مولده|زيوت|فلاتر|معمل غاز|الشركة العامة|نقطه البيع|نقطة البيع|بانزين خانه|ساحة نفط|خدمات المدينة|موقع مولدات/;

// ٣) المتجاورات دون 250 متراً محطةٌ واحدة بأسماء متعدّدة. مقيسٌ في الرمادي:
//    «محطة بنزين محمود العبد | محطة التل الاخضر | محطة وقود البوذياب» —
//    ثلاثة أسماء وموضعٌ واحد. ويبقى أطولها اسماً، فهو غالباً الرسميّ.
const MERGE_M = 0.25;

const CITIES = [
  ['الرمادي', 33.4258, 43.3012], ['الفلوجة', 33.3556, 43.7864], ['هيت', 33.6383, 42.8258],
  ['حديثة', 34.1372, 42.3789], ['عانة', 34.3725, 41.9859], ['راوة', 34.4833, 41.9237],
  ['القائم', 34.39577, 40.99437], ['الرطبة', 33.0386, 40.2864], ['الحبانية', 33.3628, 43.5586],
  ['الخالدية', 33.3789, 43.4881], ['عامرية الفلوجة', 33.16347, 43.86422], ['الكرمة', 33.40494, 43.91423],
  ['البغدادي', 33.85175, 42.54918], ['الحقلانية', 34.0575, 42.3792], ['بروانة', 34.09579, 42.38882],
  ['النخيب', 32.0369, 42.2506],
  ['كبيسة', 33.5941, 42.6185], ['المحمدي', 33.5509, 42.9011], ['الصقلاوية', 33.3964, 43.6833], ['حصيبة الشرقية', 33.4207, 43.4533], ['الرحالية', 32.7658, 43.3911], ['العبيدي', 34.4281, 41.2173], ['الكرابلة', 34.3909, 41.0464], ['الرمانة', 34.3931, 41.078], ['عكاشات', 33.6675, 39.967], ['الوليد', 33.4328, 38.9321],
  ['الوفاء', 33.3975, 42.8531],
  ['بغداد', 33.3152, 44.3661], ['أبو غريب', 33.305, 44.18], ['المحمودية', 33.0513, 44.3659],
  ['التاجي', 33.5192, 44.2542], ['المدائن', 33.1108, 44.5805],
];

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
function km(a, b) {
  const x = rad(b[0] - a[0]), y = rad(b[1] - a[1]);
  const q = Math.sin(x / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}

/** قارئ CSV يحترم الحقول المقتبَسة — أسماء المحطات فيها فواصل واقتباسات
 *  مضاعفة، مثل «"محطة غربي بغداد للوقود " ديزل». */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.trim().replace(/^﻿/, ''));
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('استعمال: node scripts/road-stations.mjs <csv> [csv…]');
  process.exit(1);
}

const seen = new Set();
const kept = [];
let notCategory = 0, notStation = 0, exactDupe = 0;

for (const f of files) {
  for (const r of parseCsv(readFileSync(f, 'utf8'))) {
    if ((r.category || '').trim() !== CATEGORY) { notCategory++; continue; }
    const lat = Number(r.lat), lng = Number(r.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    let name = (r.name_ar || r.name_en || '').replace(/\s+/g, ' ').trim();
    name = name.replace(/^["'.\s]+|["'\s]+$/g, '');
    if (!name) continue;
    if (NOT_A_STATION.test(name)) { notStation++; continue; }
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(key)) { exactDupe++; continue; }
    seen.add(key);
    kept.push({ n: name, la: lat, lo: lng });
  }
}

// دمج المتجاورات
const merged = [];
const taken = new Set();
let nearDupe = 0;
for (let i = 0; i < kept.length; i++) {
  if (taken.has(i)) continue;
  const group = [kept[i]];
  for (let j = i + 1; j < kept.length; j++) {
    if (taken.has(j)) continue;
    if (km([kept[i].la, kept[i].lo], [kept[j].la, kept[j].lo]) < MERGE_M) {
      group.push(kept[j]); taken.add(j); nearDupe++;
    }
  }
  taken.add(i);
  // أطول الأسماء: «محطة تعبئة وقود الأوائل النموذجية» أولى من «بنزين محسن»
  merged.push(group.reduce((a, b) => (b.n.length > a.n.length ? b : a)));
}

const out = merged.map((s) => ({
  n: s.n,
  la: +s.la.toFixed(5),
  lo: +s.lo.toFixed(5),
  c: CITIES.reduce((best, c) =>
    km([s.la, s.lo], [c[1], c[2]]) < km([s.la, s.lo], [best[1], best[2]]) ? c : best
  )[0],
}));

out.sort((a, b) => (a.c === b.c ? a.n.localeCompare(b.n, 'ar') : a.c.localeCompare(b.c, 'ar')));

const body = out
  .map((s) => `  { n: ${JSON.stringify(s.n)}, la: ${s.la}, lo: ${s.lo}, c: ${JSON.stringify(s.c)} },`)
  .join('\n');

writeFileSync(
  new URL('../lib/roadStations.ts', import.meta.url),
  `// مولَّد — لا يُحرَّر بيد.
//
//   node scripts/road-stations.mjs <csv> [csv…]
//
// محطاتٌ على الطرق، **إرشادية لا التزامية**: لا أصحاب لها ولا منتجات معلَنة
// ولا أرقام — الملفّان المصدران بلا عمود هاتفٍ واحد مملوء، في 220 صفّاً.
// غرضها أن يعرف المسافر أين تقع المحطات على طريقه، وأين لا تقع.
//
// وهي **ليست** جدول stations ولا تُخلط به: تلك محطاتٌ مسجّلة يلتزم أصحابها
// بما يُعلنون ويُحاسَبون عليه، وهذه نقاطٌ على خريطة.

/** محطة إرشادية: اسمٌ وموقعٌ وأقرب مدينة. لا أكثر — ولا يُدَّعى أكثر. */
export interface RoadStation {
  n: string;
  la: number;
  lo: number;
  /** أقرب مدينة معروفة — للعرض والتجميع، لا حدٌّ إداري */
  c: string;
}

export const ROAD_STATIONS: readonly RoadStation[] = [
${body}
];
`,
  'utf8'
);

const byCity = out.reduce((m, s) => ((m[s.c] = (m[s.c] ?? 0) + 1), m), {});
console.log(`✓ ${out.length} محطة`);
console.log(`   استُبعد: ${notCategory} ليست gas_station · ${notStation} ليست محطة · ${exactDupe} مكرّرة تماماً · ${nearDupe} متجاورة دون ${MERGE_M * 1000} م`);
console.log(Object.entries(byCity).sort((a, b) => b[1] - a[1]).map(([c, n]) => `   ${c}: ${n}`).join('\n'));
