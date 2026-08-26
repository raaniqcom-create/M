// يجلب هندسة الطرق الحقيقية من OpenStreetMap ويولّد lib/corridors.ts.
//
//   node scripts/road-corridors.mjs
//
// **لماذا هندسةٌ حقيقية لا خطٌّ مستقيم بين مدينتين؟**
//
// جُرِّب الخطّ المستقيم أولاً فكذب مرّتين: عدّ 133 محطة على طريق بغداد–الرمادي
// (لأن شريط 15 كم حول الخطّ يبتلع مدينتَي الطرفين)، ومرّ بمراكز المدن فأدرج
// محطات الفلوجة والحبانية والخالدية على أنها «على الطريق» — وهي داخل المدن.
//
// والطريق الحقيقي حلّ الاثنين، وزاد ثالثاً: **M1 مزدوج، وكل جزء منه
// oneway=yes**. فالذهاب والعودة مسارانِ مستقلّان في البيانات نفسها — والعراق
// يسير على اليمين، فالمحطة التي تخدمك تقع يمين اتجاه سيرك.
//
// والنتيجة طابقت ذاكرة المالك الذي يقطع هذا الطريق: محطتان ذهاباً، وأربع عودةً.
import { writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** الطرق التي تصل الأنبار بجيرانها. المراجع مأخوذة من OSM نفسه لا مخترعة. */
const ROADS = [
  { ref: 'M1', label: 'طريق المرور السريع رقم 1', note: 'بغداد ↔ الرمادي ↔ الرطبة ↔ طريبيل' },
  { ref: '12', label: 'طريق الفرات', note: 'الرمادي ↔ هيت ↔ حديثة ↔ عانة ↔ راوة ↔ القائم' },
  { ref: '11', label: 'الطريق القديم', note: 'بغداد ↔ أبو غريب ↔ الفلوجة ↔ الرمادي' },
  { ref: '22', label: 'طريق الحج البري', note: 'نحو عرعر' },
  { ref: '21', label: 'طريق الرطبة — النخيب', note: '' },
  { ref: '20', label: 'طريق عكاشات', note: '' },
];

// غرب العراق: من الحدود الأردنية شرقاً إلى بغداد، ومن جنوب النخيب شمالاً إلى القائم.
const BBOX = '32.30,38.90,34.60,44.60';

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
function km(a, b) {
  const x = rad(b[0] - a[0]), y = rad(b[1] - a[1]);
  const q = Math.sin(x / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}

/** Douglas–Peucker — الهندسة الخام تسعة آلاف نقطة للطريق الواحد، وهي
 *  دقّةٌ لا تُرى على شاشة هاتف ولا تُغيّر ترشيح محطةٍ على بُعد 500 متر.
 *  بتسامح 40 متراً تسقط ~90% من النقاط ويبقى الشكل كما هو. */
function simplify(pts, tolKm = 0.04) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let far = -1, best = 0;
    for (let k = i + 1; k < j; k++) {
      const d = pointToSegment(pts[k], pts[i], pts[j]);
      if (d > best) { best = d; far = k; }
    }
    if (best > tolKm && far > 0) { keep[far] = true; stack.push([i, far], [far, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function pointToSegment(p, a, b) {
  const ax = a[1], ay = a[0], bx = b[1], by = b[0], px = p[1], py = p[0];
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return km(a, p);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return km([ay + t * dy, ax + t * dx], p);
}

async function fetchRoad(ref) {
  const q = `[out:json][timeout:180];
(way["highway"~"^(motorway|trunk|primary)$"]["ref"="${ref}"](${BBOX}););
out geom;`;
  // curl لا fetch.
  //
  // Overpass يردّ 406 على كل صيغةٍ يرسلها fetch الخاص بنود — جُرِّب الجسم
  // الخام وترميز النموذج كلاهما — بينما curl ينجح بالثلاث صيغ. والسبب على
  // الأرجح ترويسةٌ افتراضية يرفضها الخادم. وهذا سكربت بناءٍ لا شيفرة تطبيق،
  // فاستعمالُ ما يعمل أولى من مطاردة ترويسة.
  const tmp = join(tmpdir(), `overpass-${ref.replace(/\W/g, '')}.txt`);
  writeFileSync(tmp, q, 'utf8');
  try {
    const raw = execFileSync(
      'curl',
      ['-s', '--max-time', '180', '-X', 'POST', OVERPASS, '--data-binary', `@${tmp}`],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
    );
    return JSON.parse(raw).elements ?? [];
  } finally {
    try { unlinkSync(tmp); } catch { /* لا يضرّ */ }
  }
}

const out = [];
for (const road of ROADS) {
  process.stdout.write(`  ${road.ref} … `);
  let els;
  try { els = await fetchRoad(road.ref); }
  catch (e) { console.log(`تعذّر: ${e.message}`); continue; }

  const ways = els
    .filter((e) => (e.geometry ?? []).length > 1)
    .map((e) => ({
      pts: e.geometry.map((p) => [+p.lat.toFixed(5), +p.lon.toFixed(5)]),
      oneway: e.tags?.oneway === 'yes',
    }));

  // اتجاهٌ واحد لكل جزء: أيّ طرفيه أقرب إلى شرق البلاد؟ (بغداد شرقاً،
  // والحدود غرباً) — فيصير الفرز شرقيّاً/غربيّاً بلا نقاطٍ مرجعية تُخترع.
  const east = [], west = [], both = [];
  for (const w of ways) {
    const simplified = simplify(w.pts);
    if (!w.oneway) { both.push(simplified); continue; }
    const goesEast = w.pts[w.pts.length - 1][1] > w.pts[0][1];
    (goesEast ? east : west).push(simplified);
  }
  const pts = east.flat().length + west.flat().length + both.flat().length;
  const rawPts = ways.reduce((n, w) => n + w.pts.length, 0);
  out.push({ ...road, east, west, both });
  console.log(`${ways.length} جزءاً · ${rawPts} نقطة → ${pts} بعد التبسيط`);

  // Overpass عامّةٌ مجانية — فاصلٌ بين الطلبات أدبٌ لا تحسين.
  await new Promise((r) => setTimeout(r, 1500));
}

const body = out
  .map(
    (r) => `  {
    ref: ${JSON.stringify(r.ref)},
    label: ${JSON.stringify(r.label)},
    note: ${JSON.stringify(r.note)},
    // شرقاً (نحو بغداد) · غرباً (نحو الحدود) · وباتجاهين لِما ليس مزدوجاً
    east: ${JSON.stringify(r.east)},
    west: ${JSON.stringify(r.west)},
    both: ${JSON.stringify(r.both)},
  },`
  )
  .join('\n');

writeFileSync(
  new URL('../lib/corridors.ts', import.meta.url),
  `// مولَّد من OpenStreetMap — لا يُحرَّر بيد.
//
//   node scripts/road-corridors.mjs
//
// هندسة الطرق التي تصل الأنبار بجيرانها، مبسَّطة بتسامح 40 متراً.
// و«شرقاً/غرباً» ليسا زينة: الطرق السريعة مزدوجة وكل جزء oneway، فالذهاب
// والعودة مساران مستقلّان — والمحطة تخدم من يسير في جهةٍ دون الأخرى.

export interface Corridor {
  /** مرجع الطريق في OSM — M1, 12, 11… */
  ref: string;
  label: string;
  note: string;
  /** أجزاء المسار المتّجهة شرقاً (نحو بغداد) */
  east: number[][][];
  /** أجزاء المسار المتّجهة غرباً (نحو الحدود) */
  west: number[][][];
  /** ما ليس مزدوجاً — يخدم الاتجاهين */
  both: number[][][];
}

export const CORRIDORS: readonly Corridor[] = [
${body}
];
`,
  'utf8'
);

const bytes = Buffer.byteLength(body, 'utf8');
console.log(`\n✓ ${out.length} طريقاً · ~${(bytes / 1024).toFixed(0)} ك.ب`);
