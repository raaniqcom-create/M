// يحسب مسارات القيادة الحقيقية بين نقاط الرحلات، ويكتبها في
// public/road-routes.json.
//
//   node scripts/road-routes.mjs
//
// **لماذا OSRM ولماذا وقت البناء؟**
//
// خياطة أجزاء الطرق من OSM بمراجعها (M1, 12, 22…) حلّت أكثر الرحلات وعجزت
// عن واحدة: الرمادي ← عرعر. طريق الحج البري يبعد 100 كم عن الرمادي ولا يمرّ
// بها، والوصلة بينهما طرقٌ ثانوية بلا مرجع — فلا تُخاط بالمراجع.
//
// وOSRM محرّك توجيهٍ يعرف الشبكة كلّها لا مراجعها، فيُعطي الطريق الحقيقي
// **ومدّته الحقيقية** — لا متوسّط 80 كم/س مفترضاً.
//
// لكنه **خادم**، والموقع تصديرٌ ساكن على GitHub Pages بلا خادم. فيُستدعى هنا
// مرّةً واحدة وتُخزَّن النتيجة في المستودع — كما فُعل بهندسة الطرق من
// Overpass. فلا يعتمد المستخدم على خدمةٍ خارجية، ولا يُحمَّل الخادم العامّ
// بطلبٍ لكل زائر.
//
// والملفّ في public/ لا في lib/: تحمّله صفحة مساعد الطريق وحدها عند فتحها،
// فلا يُثقل حزمة التطبيق على من لا يسافر.
import { writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OSRM = 'https://router.project-osrm.org/route/v1/driving';

const POINTS = {
  'الرمادي': [33.4258, 43.3012],
  'الفلوجة': [33.3556, 43.7864],
  'بغداد': [33.3152, 44.3661],
  'الخالدية': [33.3789, 43.4881],
  'الحبانية': [33.3628, 43.5586],
  'عامرية الفلوجة': [33.2264, 43.6786],
  'الكرمة': [33.4453, 43.7972],
  'هيت': [33.6383, 42.8258],
  'البغدادي': [33.8517, 42.6472],
  'الحقلانية': [34.0575, 42.3792],
  'حديثة': [34.1372, 42.3789],
  'عانة': [34.4686, 41.9375],
  'راوة': [34.4756, 41.9139],
  'القائم': [34.3689, 41.0906],
  'الرطبة': [33.0386, 40.2864],
  'النخيب': [32.0369, 42.2506],
  'كبيسة': [33.5941, 42.6185],
  'المحمدي': [33.5509, 42.9011],
  'الصقلاوية': [33.3964, 43.6833],
  'حصيبة': [33.4207, 43.4533],
  'الرحالية': [32.7658, 43.3911],
  'العبيدي': [34.4281, 41.2173],
  'الكرابلة': [34.3909, 41.0464],
  'الرمانة': [34.3931, 41.078],
  'عكاشات': [33.6675, 39.967],
  'الوليد': [33.4328, 38.9321],
  'طريبيل (الأردن)': [32.92, 38.98],
  'منفذ عرعر': [31.37148, 41.44502],
};

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
function km(a, b) {
  const x = rad(b[0] - a[0]), y = rad(b[1] - a[1]);
  const q = Math.sin(x / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}
function pointToSegment(p, a, b) {
  const ax = a[1], ay = a[0], bx = b[1], by = b[0], px = p[1], py = p[0];
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return km(a, p);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return km([ay + t * dy, ax + t * dx], p);
}

/** Douglas–Peucker. المسار الخام يبلغ 3,300 نقطة، وبتسامح 120 متراً يهبط
 *  إلى مئة — دقّةٌ تكفي لرسم خطٍّ ولترشيح محطةٍ على بُعد 500 متر. */
function simplify(pts, tolKm = 0.12) {
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

function route(a, b) {
  const url = `${OSRM}/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
  const tmp = join(tmpdir(), `osrm-${Date.now()}.json`);
  try {
    // curl لا fetch: الخوادم العامّة ترفض ترويسات نود الافتراضية، وقد وقع
    // ذلك مع Overpass في هذا المشروع نفسه.
    execFileSync('curl', ['-s', '--max-time', '60', '-o', tmp, url], { encoding: 'utf8' });
    const d = JSON.parse(execFileSync('cat', [tmp], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    if (d.code !== 'Ok' || !d.routes?.length) return null;
    const r = d.routes[0];
    return {
      km: +(r.distance / 1000).toFixed(1),
      min: Math.round(r.duration / 60),
      // GeoJSON يعطي [lng,lat] — والمشروع كلّه [lat,lng].
      path: simplify(r.geometry.coordinates.map((c) => [+c[1].toFixed(5), +c[0].toFixed(5)])),
    };
  } catch {
    return null;
  } finally {
    try { unlinkSync(tmp); } catch { /* لا يضرّ */ }
  }
}

const names = Object.keys(POINTS);
const out = {};
let done = 0, failed = 0;

// الاتجاهان كلاهما يُحسب، ولا يُعكس أحدهما عن الآخر: الطرق مزدوجة، ومسارُ
// العودة يسلك الجانب الآخر — وهو ما يجعل قائمة المحطات مختلفة أصلاً.
for (const from of names) {
  for (const to of names) {
    if (from === to) continue;
    const straight = km(POINTS[from], POINTS[to]);
    // ما تباعد أكثر من 600 كم ليس رحلةً داخل هذا النطاق.
    if (straight > 600) continue;
    const r = route(POINTS[from], POINTS[to]);
    if (!r) { failed++; continue; }
    out[`${from}|${to}`] = r;
    done++;
    process.stdout.write(`\r  ${done} مساراً…`);
    // الخادم العامّ مجانيّ — والفاصل أدبٌ لا تحسين.
    execFileSync('curl', ['-s', '-o', join(tmpdir(), 'nul.txt'), 'https://router.project-osrm.org/'], { encoding: 'utf8' });
  }
}

writeFileSync(
  new URL('../public/road-routes.json', import.meta.url),
  JSON.stringify({ points: POINTS, routes: out }),
  'utf8'
);

const bytes = Buffer.byteLength(JSON.stringify({ points: POINTS, routes: out }), 'utf8');
console.log(`\n✓ ${done} مساراً · فشل ${failed} · ${(bytes / 1024).toFixed(0)} ك.ب`);
