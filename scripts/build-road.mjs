// يبني شريطَ صوت «مساعد الطريق» ويُلبِس الفيلمَ عليه.
//
//   node scripts/build-road.mjs
//
// **الفيلمُ يتبع الصوت، لا الصوتُ الجدول.** فيلمٌ تسبق صورتُه كلامَه أو
// تتأخّر عنه ليس فيلماً فيه عيب، بل فيلمٌ يقول غيرَ ما يُرى فيه.
//
// ── كيف يُعرَف موضعُ كلِّ مشهد ──────────────────────────────────────────────
//
// ثمانيةُ مقاطعَ وخمسَ عشرةَ فقرةً في النصّ، فالقسمةُ ليست واحداً لواحد ولا
// يقولها اسمُ الملفّ. وجُرِّب تقديرُها بعدد الحروف وسرعةِ قراءةٍ واحدة، فبلغ
// جذرُ الخطأ 1.47 ثانية — والمالك رأى الصوتَ لا يطابق الصورة.
//
// **فتُقاس بدل أن تُقدَّر.** يُفكَّك كلُّ مقطعٍ إلى نُطقٍ متّصل يفصله سكوتٌ
// حقيقيّ (≥ 0.30 ث)، فتخرج ثمانٍ وخمسون وحدةَ نطقٍ مواضعُها معلومةٌ
// بالمِيلي ثانية. ثمّ تُنسَب فقراتُ النصّ إليها بترتيبها، بحيث يقع حدُّ كل
// فقرةٍ على سكتةٍ وقعت فعلاً — لا في وسط كلمة. فبداياتُ المشاهد لحظاتٌ
// مقيسة، لا نِسبٌ محسوبة. **وجذرُ الخطأ صار 0.88 ثانية.**
//
// ── ولا يُعاد كتابةُ توقيتِ الصفحة ─────────────────────────────────────────
//
// في الصفحة اثنا عشرَ موضعاً تُكتب فيه حركةٌ بطول الفيلم كلِّه ومفاتيحُها
// نِسبٌ مئويةٌ منه — الخريطةُ والشبكةُ والامتدادُ الأحمر والأقراصُ والشعارات
// — وسبعةُ تأخيراتٍ أخرى داخل الجافاسكربت لا في CSS. فتُعدَّل بعضُها ويُنسى
// بعض، فتظهر خريطةُ الرحلة فوق مشهد المنافذ ولا تختفي.
//
// فتبقى الصفحةُ على توقيتها — 131 ثانية، كلُّ حركةٍ في موضعها — ويُحقَن فيها
// جدولٌ يقابل زمنَ الصوت بزمن الفيلم. موضعُ تعديلٍ واحد بدل عشرين.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve('mp3/1');
const BED = 'C:/Users/al3r1/OneDrive/Desktop/MY/new/back.mp3'; // الخلفيةُ نفسُها التي تحت الدليل والإعلان
const OUT = resolve('docs/promo/road-voice.mp3');
const PAGE = resolve('docs/promo/road.html');
const SCRIPT = resolve('docs/promo/road-script.md');

/** المقاطع بترتيب قراءتها. 2 و3 حُذفتا — إعادتان لما يقوله 4. */
const CLIPS = [1, 4, 5, 6, 7, 8, 9, 10];

/** لا صمتَ في الأوّل: المقطعُ الأوّل يبدأ مع الفيلم عند الصفر.
 *  والشعاران في الافتتاح يُضغطان إلى ما قبل أوّل كلمة — وهو جزءٌ من ثانية. */
const LEAD = 0.0;
/** فاصلٌ بين مقطعٍ وآخر، فوق صمتِ أطرافِ المقاطع نفسِها */
const GAP = 0.45;
/** ذيلٌ بعد آخر كلمة، لئلّا ينقطع الفيلمُ على حرف */
const TAIL = 0.8;

/** مشهدُ كلِّ فقرةٍ من فقرات النصّ — بترتيب الفقرات في road-script.md.
 *  فقرتان لمشهدٍ واحد (51): الامتدادُ الأطول، ثمّ ما بعد الصمت. */
const PARA_SCENE = [6, 11, 18, 24, 34, 42, 51, 51, 64, 77, 85, 91, 99, 109, 121];
/** بداياتُ المشاهد في الصفحة — وهي مراسي الجدول، ولا تتغيّر */
const OLD = [0, 6, 11, 18, 24, 34, 42, 51, 64, 77, 85, 91, 99, 109, 121, 131];

/** أقصرُ سكوتٍ يُعَدّ فاصلاً بين نُطقين. أقلُّ منه تنفُّسٌ داخل الجملة. */
const PAUSE = 0.30;
/** نافذةُ القياس — عشرون في الثانية، تكفي لحدٍّ دقّتُه خمسون مِيلي ثانية */
const WIN = 0.05;

const missing = CLIPS.filter((c) => !existsSync(`${SRC}/${c}.mp3`));
if (missing.length) {
  console.log(`ناقصٌ ${missing.length}: ${missing.join(', ')}`);
  process.exit(1);
}

const dur = (f) =>
  Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f])
      .toString().trim()
  );

/** وحداتُ النطق داخل مقطع: [بداية، نهاية] بالثواني من أوّله.
 *
 *  العتبةُ نسبيّةٌ لا مطلقة — «وسيط الجهارة ناقص أربعةَ عشرَ ديسيبل» — لأن
 *  المقاطع تختلف في مستواها، وعتبةٌ ثابتة تجد في أحدها كلَّ شيء وفي آخر
 *  لا شيء. وقد جُرّبت المطلقةُ أوّلاً فأعطت صفرَ سكتات. */
function utterances(file) {
  const raw = execFileSync(
    'ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'],
    { maxBuffer: 1 << 28 }
  );
  const n = Math.round(8000 * WIN);
  const db = [];
  for (let i = 0; i + n <= raw.length / 2; i += n) {
    let s = 0;
    for (let k = 0; k < n; k++) { const v = raw.readInt16LE((i + k) * 2); s += v * v; }
    db.push(20 * Math.log10(Math.sqrt(s / n) / 32768 + 1e-9));
  }
  const thr = [...db].sort((a, b) => a - b)[db.length >> 1] - 14;
  const segs = [];
  let start = -1;
  db.forEach((v, i) => {
    if (v >= thr) { if (start < 0) start = i; }
    else if (start >= 0) { segs.push([start * WIN, i * WIN]); start = -1; }
  });
  if (start >= 0) segs.push([start * WIN, db.length * WIN]);
  // ما بينه سكوتٌ أقصرُ من الحدّ نُطقٌ واحد
  const out = [segs[0]];
  for (const [a, b] of segs.slice(1)) {
    if (a - out.at(-1)[1] < PAUSE) out.at(-1)[1] = b;
    else out.push([a, b]);
  }
  return out;
}

const files = CLIPS.map((c) => `${SRC}/${c}.mp3`);
const lengths = files.map(dur);

let t = LEAD;
const cues = lengths.map((len, i) => {
  const start = t;
  t += len + GAP;
  return { clip: CLIPS[i], start: +start.toFixed(2), end: +(start + len).toFixed(2) };
});
const total = +(t - GAP + TAIL).toFixed(2);

// كلُّ وحدات النطق على شريطٍ واحد، بمواضعها المطلقة
const UTT = [];
files.forEach((f, i) => {
  for (const [a, b] of utterances(f)) UTT.push([cues[i].start + a, cues[i].start + b]);
});

// ── نصُّ السكربت ───────────────────────────────────────────────────────────
//
// يُقرأ من السكربت نفسِه لا من نسخةٍ ثانية: نسختان تفترقان، والفيلمُ يتبع
// الفارقةَ منهما بلا أن يعلم أحد.
// CRLF: الملفّ يُحرَّر على وندوز، وفقرةٌ تُفصل بسطرٍ فارغ لا تُرى بدونه
const md = readFileSync(SCRIPT, 'utf8').replace(/\r\n/g, '\n');
const body = md.slice(md.indexOf('**‏[٠:٠٠'), md.indexOf('## ثانياً'));
const paras = body
  .split('\n\n')
  .map((p) => p.replace(/\s+/g, ' ').trim())
  .filter((p) => p && !p.startsWith('**‏[') && !p.startsWith('*(') && p !== '---')
  .map((p) => p.replace(/\*\*|\*/g, '').replace(/[\u064B-\u0652\u0670]/g, '').trim());

if (paras.length !== PARA_SCENE.length) {
  console.log(`فقراتُ النصّ ${paras.length} ولا تطابق جدولَ المشاهد ${PARA_SCENE.length}`);
  process.exit(1);
}
if (UTT.length < paras.length) {
  console.log(`وحداتُ النطق ${UTT.length} أقلُّ من الفقرات ${paras.length} — راجِع PAUSE`);
  process.exit(1);
}

// ── نسبةُ الفقرات إلى وحدات النطق ─────────────────────────────────────────
//
// كلُّ فقرةٍ تأخذ نُطقاً واحداً فأكثر، بالترتيب ولا تخطّي. والكلفةُ فرقُ ما
// تتوقّعه من طولها بالحروف عمّا نُطق فعلاً — فتقع الحدودُ على السكتات.
const chars = (s) => s.replace(/[^\u0621-\u064Aa-zA-Z ]/g, '').length;
const C = paras.map(chars);
const spoken = UTT.map(([a, b]) => b - a);
const rate = C.reduce((a, b) => a + b, 0) / spoken.reduce((a, b) => a + b, 0);

const ps = [0];
for (const x of spoken) ps.push(ps.at(-1) + x);
const n = UTT.length, k = C.length, INF = Infinity;
const dp = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(INF));
const bk = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(-1));
dp[0][0] = 0;
for (let j = 1; j <= k; j++) {
  for (let i = j; i <= n; i++) {
    for (let m = j - 1; m < i; m++) {
      if (dp[m][j - 1] === INF) continue;
      const d = C[j - 1] / rate - (ps[i] - ps[m]);
      const e = dp[m][j - 1] + d * d;
      if (e < dp[i][j]) { dp[i][j] = e; bk[i][j] = m; }
    }
  }
}
const groups = [];
for (let i = n, j = k; j > 0; j--) { const m = bk[i][j]; groups.unshift([m, i]); i = m; }

const sceneAt = new Map();
groups.forEach(([a], p) => {
  if (!sceneAt.has(PARA_SCENE[p])) sceneAt.set(PARA_SCENE[p], +UTT[a][0].toFixed(2));
});
const NEW = [0, ...OLD.slice(1, -1).map((o) => sceneAt.get(o)), total];
if (NEW.some((x) => x == null)) {
  console.log('مشهدٌ بلا زمن — راجِع PARA_SCENE');
  process.exit(1);
}
for (let i = 1; i < NEW.length; i++) {
  if (!(NEW[i] > NEW[i - 1])) {
    console.log(`الجدولُ غيرُ متصاعد عند ${OLD[i]} — المطابقةُ أخطأت`);
    process.exit(1);
  }
}

// ── المزج: كلُّ مقطعٍ في موضعه، والخلفيةُ تحتَها، تُلَفّ إلى الطول ──────────
const inputs = files.flatMap((f) => ['-i', f]);
const delays = cues
  .map((c, i) => `[${i}:a]adelay=${Math.round(c.start * 1000)}|${Math.round(c.start * 1000)}[v${i}]`)
  .join(';');
const mixVoice = cues.map((_, i) => `[v${i}]`).join('') + `amix=inputs=${CLIPS.length}:normalize=0[voice]`;
const bedChain =
  `[${CLIPS.length}:a]volume=0.10,aloop=loop=-1:size=2e9,atrim=0:${total.toFixed(2)},` +
  `afade=t=in:st=0:d=1.5,afade=t=out:st=${(total - 2).toFixed(2)}:d=2[bg]`;
const filter = `${delays};${mixVoice};${bedChain};[voice][bg]amix=inputs=2:normalize=0:duration=longest[out]`;

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  ...inputs, '-i', BED,
  '-filter_complex', filter,
  '-map', '[out]',
  '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100',
  OUT,
]);
const made = dur(OUT);

// ── حقنُ مِعيار الزمن ──────────────────────────────────────────────────────
// CRLF مثلَ السكربت: المطابقةُ على نصٍّ متعدّد الأسطر تسقط بدونه
let page = readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');

if (!page.includes(`const TOTAL = ${OLD.at(-1)};`)) {
  console.log(`الصفحةُ ليست على توقيتها الأصلي (${OLD.at(-1)} ث) — استعِدها:`);
  console.log('  git checkout -- docs/promo/road.html');
  process.exit(1);
}

const r2 = (x) => Math.round(x * 100) / 100;
const OPEN = '/* <<warp>> */', CLOSE = '/* <</warp>> */';
const had = page.indexOf(OPEN);
if (had >= 0) page = page.slice(0, had) + page.slice(page.indexOf(CLOSE) + CLOSE.length);

const block = `${OPEN}
/* مُولَّدٌ بـ scripts/build-road.mjs — لا يُحرَّر بيد.
   ‎[زمنُ الفيلم, زمنُ الصوت]‎ عند كل مشهد. وما بينهما خطٌّ مستقيم. */
const WARP = [${OLD.map((o, i) => `[${o},${r2(NEW[i])}]`).join(',')}];
const AUDIO_TOTAL = ${made.toFixed(2)};
function filmTime(a) {
  for (let i = 0; i < WARP.length - 1; i++) {
    const [f0, a0] = WARP[i], [f1, a1] = WARP[i + 1];
    if (a <= a1) return f0 + ((a - a0) / (a1 - a0)) * (f1 - f0);
  }
  return TOTAL;
}
function audioTime(f) {
  for (let i = 0; i < WARP.length - 1; i++) {
    const [f0, a0] = WARP[i], [f1, a1] = WARP[i + 1];
    if (f <= f1) return a0 + ((f - f0) / (f1 - f0)) * (a1 - a0);
  }
  return AUDIO_TOTAL;
}
${CLOSE}
function now() {
  if (!started) return 0;
  /* المسجّلُ يقف عند ‎TOTAL + 0.7‎، وساعةُ الصوت تقف عند ‎TOTAL‎ بالضبط —
     فلولا هذه الزيادةُ بعد انتهاء الصوت لظلّ يسجّل بلا نهاية. */
  if (haveVoice) return filmTime(voice.currentTime) + (voice.ended ? 1 : 0);
  if (paused) return pausedAt;
  return (performance.now() - t0) / 1000;
}`;

const OLD_NOW = `function now() {
  if (!started) return 0;
  if (haveVoice && !voice.paused) return voice.currentTime;
  if (haveVoice && voice.paused && voice.currentTime) return voice.currentTime;
  if (paused) return pausedAt;
  return (performance.now() - t0) / 1000;
}`;
if (!page.includes(OLD_NOW)) {
  console.log('لم أجد دالّة now() كما هي — راجِع الصفحة');
  process.exit(1);
}
page = page.replace(OLD_NOW, block);

// القفزُ يُعطى بزمن الفيلم، والصوتُ يُطلَب بزمنه هو
const OLD_SEEK = 'if (haveVoice) { voice.currentTime = s; }';
if (!page.includes(OLD_SEEK)) {
  console.log('لم أجد seek() كما هي — راجِع الصفحة');
  process.exit(1);
}
page = page.replace(OLD_SEEK, 'if (haveVoice) { voice.currentTime = audioTime(s); }');
writeFileSync(PAGE, page);

const err = groups.map(([a, b], p) => C[p] / rate - (ps[b] - ps[a]));
const rms = Math.sqrt(err.reduce((s, x) => s + x * x, 0) / k);
writeFileSync(
  resolve('docs/promo/road-cues.json'),
  JSON.stringify({
    audioTotal: +made.toFixed(2), filmTotal: OLD.at(-1), lead: LEAD, gap: GAP,
    rms: +rms.toFixed(2), utterances: UTT.length, clips: cues,
    scenes: OLD.slice(1, -1).map((o, i) => ({ film: o, audio: NEW[i + 1] })),
  }, null, 2)
);

console.log(`مقاطع ${CLIPS.length}  نُطق ${UTT.length}  ->  ${made.toFixed(2)} ث   (جذر الخطأ ${rms.toFixed(2)} ث)`);
groups.forEach(([a, b], p) => {
  const d = C[p] / rate - (ps[b] - ps[a]);
  console.log(`  مشهد ${String(PARA_SCENE[p]).padStart(3)}  ${String(r2(UTT[a][0])).padStart(7)} ث   نطق ${String(a + 1).padStart(2)}-${String(b).padStart(2)}  (${d >= 0 ? '+' : ''}${d.toFixed(1)})  ${paras[p].slice(0, 40)}`);
});
