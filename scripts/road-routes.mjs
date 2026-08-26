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
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const OUT = new URL('../public/road-routes.json', import.meta.url);
// ما حُسب سابقاً يُبقى — الخادم العامّ مجانيّ، وإعادة 756 طلباً لإضافة مدينةٍ
// واحدة إساءةُ استعمال. ‎--all‎ وحدها تُعيد الكلّ.
const ALL = process.argv.includes('--all');

// **النقاط تُقرأ من lib/geo.ts، لا تُكتب هنا.**
//
// كانت نسخةً سادسة من قائمة المدن، وقد سبق أن تباعدت النسخ: عانة كانت
// موضوعةً على موقع راوة في أربعة ملفّات معاً — اثنا عشر كيلومتراً من الخطأ،
// كشفها فحصٌ آليّ لا عين. فمصدرٌ واحد، والباقي يقرأ منه.
const geo = readFileSync(new URL('../lib/geo.ts', import.meta.url), 'utf8');
const POINTS = {};
{
  let inside = false;
  for (const line of geo.split(String.fromCharCode(10))) {
    if (line.includes('ENDPOINTS: Readonly')) { inside = true; continue; }
    if (!inside) continue;
    if (line.startsWith('};')) break;
    const m = /^\s*'([^']+)':\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/.exec(line);
    if (m) POINTS[m[1]] = [+m[2], +m[3]];
  }
  if (Object.keys(POINTS).length < 5) throw new Error('تعذّرت قراءة ENDPOINTS من lib/geo.ts');
}


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

/** [الطول, الدقائق, Δعرض, Δطول, …] بأعشار الآلاف من الدرجة.
 *
 *  756 مساراً بخمس خاناتٍ عشرية = 1.5 م.ب. وبأربعٍ — دقّة 11 متراً، والمحطة
 *  تُلتقط ضمن 500 — وفروقٍ صحيحة بين النقاط: 639 ك.ب، و47 بعد ضغط الخادم.
 *  أي أقلّ من صورةٍ واحدة، لصفحةٍ تُفتح قبل السفر لا في كل زيارة. */
function encode(kmv, min, path) {
  const out = [kmv, min];
  let pla = 0, plo = 0;
  for (const [la, lo] of path) {
    const a = Math.round(la * 1e4), o = Math.round(lo * 1e4);
    out.push(a - pla, o - plo);
    pla = a; plo = o;
  }
  return out;
}

function route(a, b) {
  const url = `${OSRM}/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
  const tmp = join(tmpdir(), `osrm-${process.pid}-${Math.round(process.uptime() * 1e6)}.json`);
  try {
    // curl لا fetch: الخوادم العامّة ترفض ترويسات نود الافتراضية، وقد وقع
    // ذلك مع Overpass في هذا المشروع نفسه.
    execFileSync('curl', ['-s', '--max-time', '60', '-o', tmp, url], { encoding: 'utf8' });
    const d = JSON.parse(readFileSync(tmp, 'utf8'));
    if (d.code !== 'Ok' || !d.routes?.length) return null;
    const r = d.routes[0];
    return encode(
      +(r.distance / 1000).toFixed(1),
      Math.round(r.duration / 60),
      // GeoJSON يعطي [lng,lat] — والمشروع كلّه [lat,lng].
      simplify(r.geometry.coordinates.map((c) => [c[1], c[0]]))
    );
  } catch {
    return null;
  } finally {
    try { unlinkSync(tmp); } catch { /* لا يضرّ */ }
  }
}

const prev = !ALL && existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { points: {}, routes: {} };

// **ما تغيّرت إحداثيّته يُبطَل.** إصلاحُ موقع مدينةٍ لا ينفع إن بقي مسارها
// المحفوظ محسوباً على الموقع الخطأ — وهو صمتٌ أسوأ من العطل.
const moved = new Set(
  Object.keys(POINTS).filter((n) => {
    const o = prev.points?.[n];
    return o && (o[0] !== POINTS[n][0] || o[1] !== POINTS[n][1]);
  })
);
if (moved.size) console.log(`  تغيّرت: ${[...moved].join('، ')}`);

const out = {};
for (const [k, v] of Object.entries(prev.routes || {})) {
  const [a, b] = k.split('|');
  if (POINTS[a] && POINTS[b] && !moved.has(a) && !moved.has(b)) out[k] = v;
}

const names = Object.keys(POINTS);
let done = 0, kept = 0, failed = 0;

// الاتجاهان كلاهما يُحسب، ولا يُعكس أحدهما عن الآخر: الطرق مزدوجة، ومسارُ
// العودة يسلك الجانب الآخر — وهو ما يجعل قائمة المحطات مختلفة أصلاً.
for (const from of names) {
  for (const to of names) {
    if (from === to) continue;
    const key = `${from}|${to}`;
    // ما تباعد أكثر من 600 كم ليس رحلةً داخل هذا النطاق.
    if (km(POINTS[from], POINTS[to]) > 600) continue;
    if (out[key]) { kept++; continue; }
    const r = route(POINTS[from], POINTS[to]);
    if (!r) { failed++; continue; }
    out[key] = r;
    done++;
    process.stdout.write(`
  ${done} جديداً · ${kept} محفوظاً…`);
  }
}

const payload = JSON.stringify({ points: POINTS, routes: out });
writeFileSync(OUT, payload, 'utf8');
console.log(
  `
✓ ${Object.keys(out).length} مساراً (${done} جديد · ${kept} محفوظ · ${failed} فشل) · ` +
  `${(Buffer.byteLength(payload, 'utf8') / 1024).toFixed(0)} ك.ب`
);
