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

/** موضعُ كلِّ فقرةٍ من النصّ على شريط الفيلم — بترتيب الفقرات في
 *  road-script.md.
 *
 *  **والأوّلتان على الشعارين لا على مشهد.** المقطعُ الأوّل «المحطةُ التقنية ..
 *  صنع في الأنبار» تعليقٌ على الافتتاح نفسِه: الشعارُ يظهر عند الصفر و«صنع في
 *  الأنبار» عند 2.9 — فلكلٍّ منهما مِرساةٌ تخصّه، وإلّا مضت الصورةُ وحدها
 *  وتأخّر الصوتُ عنها.
 *
 *  وفقرتان لمشهدٍ واحد (51): الامتدادُ الأطول، ثمّ ما بعد الصمت. */
const PARA_SCENE = [0, 2.9, 6, 11, 18, 24, 34, 42, 51, 51, 64, 77, 85, 91, 99, 109, 121];
/** مراسي الجدول على شريط الفيلم — مواضعُ المشاهد كما هي في الصفحة، ومعها
 *  ظهورُ «صنع في الأنبار» في الافتتاح. لا تتغيّر. */
const OLD = [0, 2.9, 6, 11, 18, 24, 34, 42, 51, 64, 77, 85, 91, 99, 109, 121, 131];

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
/** مقطعُ كلِّ وحدة نطق — والقيدُ الأقوى في المطابقة كلِّها */
const UTT_CLIP = [];
files.forEach((f, i) => {
  for (const [a, b] of utterances(f)) {
    UTT.push([cues[i].start + a, cues[i].start + b]);
    UTT_CLIP.push(i);
  }
});

// **جدولُ النطق حين يُطلَب: `UTT=1`.** المالك يقول «من الثانية 35 يختلّ»،
// وهذا الجدولُ وحدَه يقول أيُّ سكتةٍ عندها صالحةٌ لأن تكون حدَّ فقرة.
if (process.env.UTT) {
  UTT.forEach(([a, b], i) => {
    const g = i ? a - UTT[i - 1][1] : 0;
    const bar = i && UTT_CLIP[i] !== UTT_CLIP[i - 1] ? ' ── مقطعٌ جديد' : '';
    console.log(
      `  ${String(i + 1).padStart(2)}  ${a.toFixed(2).padStart(6)}–${b.toFixed(2).padStart(6)}` +
      `  طولٌ ${(b - a).toFixed(2)}  سكتةٌ قبلَه ${g.toFixed(2)}  [${CLIPS[UTT_CLIP[i]]}.mp3]${bar}`
    );
  });
  console.log('');
}

// ── نصُّ السكربت ───────────────────────────────────────────────────────────
//
// يُقرأ من السكربت نفسِه لا من نسخةٍ ثانية: نسختان تفترقان، والفيلمُ يتبع
// الفارقةَ منهما بلا أن يعلم أحد.
// CRLF: الملفّ يُحرَّر على وندوز، وفقرةٌ تُفصل بسطرٍ فارغ لا تُرى بدونه
const md = readFileSync(SCRIPT, 'utf8').replace(/\r\n/g, '\n');
const body = md.slice(md.indexOf('*‏[٠:٠٠'), md.indexOf('## ثانياً'));
const paras = body
  .split('\n\n')
  .map((p) => p.replace(/\s+/g, ' ').trim())
  .filter((p) => p && !p.startsWith('*‏[') && !p.startsWith('*(') && p !== '---')
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
//
// **ولا تعبر فقرةٌ حدَّ مقطع.** وهذا هو القيدُ الذي نقص، وكشفه المالك بأذنه:
// المقطعُ الرابع كلُّه «خدمةٌ جديدة تقدّمها المحطةُ التقنية: مساعدُ الطريق»،
// خمسُ ثوانٍ ونصف فيها سكتةٌ واحدة. والمطابقةُ رأت النصَّ قصيراً بالحروف
// فأعطته نصفَ المقطع ودفعت نصفَه الثاني إلى الفقرة التالية — فسبقت الصورةُ
// الصوتَ ثانيةً ونصفاً، ثمّ اتّسع الفارق.
//
// وحدُّ المقطع أقوى دليلٍ في الملفّ كلِّه: هناك أوقف المعلّقُ التسجيل. أما
// السكتةُ داخله فقد تكون نَفَساً. فالسكتاتُ تُرشَّح، وحدودُ المقاطع تُلزِم.
const chars = (s) => s.replace(/[^\u0621-\u064Aa-zA-Z ]/g, '').length;
const C = paras.map(chars);
const spoken = UTT.map(([a, b]) => b - a);
const rate = C.reduce((a, b) => a + b, 0) / spoken.reduce((a, b) => a + b, 0);
const ps = [0];
for (const x of spoken) ps.push(ps.at(-1) + x);

// ── المطابقة: أين تبدأ كلُّ فقرةٍ على شريط الصوت ────────────────────────
//
// **وجُرِّب أن تُلزَم كلُّ فقرةٍ بمقطعٍ واحد، فلم يستقم.** فُحصت القسماتُ
// الأربعُ والتسعون والمئتان التي تجعل كلَّ مقطعٍ عدداً صحيحاً من الفقرات،
// فلم تخلُ واحدةٌ منها من مقطعٍ يُنطَق فيه ثمانيةٌ وعشرون حرفاً في الثانية
// فأكثر — والعربيةُ تُقرأ بين سبعةَ عشرَ وأربعةٍ وعشرين. فالقسمةُ ليست
// واحداً لواحد: في المقطع الخامس فضلةُ كلامٍ لا يفسّرها نصُّه، وفي السابع
// نقص. أي أن المعلّق لم يقف عند كلِّ فقرةٍ ليبدأ تسجيلاً جديداً.
//
// فحدُّ المقطع ترجيحٌ قويّ لا قيدٌ قاطع: **يُكافَأ** الحدُّ الذي يقع عليه
// بثانيتين من الخطأ المغفور، ولا يُمنَع الذي يقع دونه. وما سمعه المالكُ
// بأذنه هو وحدَه القيدُ القاطع.

/** ما سُمع فثُبِّت: ‎فقرة -> وحدةُ النطق التي تبدأ عندها‎.
 *
 *  وهذه هي المعرفةُ الوحيدة المؤكَّدة في الملفّ كلِّه، إذ من يبني الفيلم
 *  لا يسمعه. وكلُّ خطأٍ يبقى يُصلَح بسطرٍ يُزاد هنا: رقمُ الفقرة، ورقمُ
 *  وحدةِ النطق — يُقرآن من `UTT=1 node scripts/build-road.mjs`.
 *
 *    0-2   «المحطة التقنية» · «صنع في الأنبار» · «خدمةٌ جديدة … مساعدُ الطريق»
 *    3     «تُجيبُ سؤالاً واحداً»   سمعه المالك 10.0-15.5
 *    4     «لكنّ أغلبَ الطرق»
 *    6     «فتختارُ من أين تنطلق»   سمعه المالك عند 53، والشريحةُ كانت عند 38
 *    7     «والمحطاتُ التي نعرفها»   سمعه عند 71.8، والشريحةُ كانت عند 61.5 */
const ANCHOR = new Map([[0, 0], [1, 1], [2, 2], [3, 4], [4, 6], [6, 21], [7, 28]]);

/** كم من الخطأ يُغفَر لحدٍّ يقع على أوّلِ مقطع — بالثانية المربّعة. */
const CLIP_BONUS = 2.0;
const CLIP_HEAD = new Set(CLIPS.map((_, c) => UTT_CLIP.indexOf(c)));

// ── ولا وتيرةَ واحدة للفيلم كلِّه ────────────────────────────────────────
//
// **وهذا هو الخطأ الذي كشفه المالك.** حُسبت وتيرةٌ واحدة — عشرون حرفاً في
// الثانية — وقُسِم الفيلمُ كلُّه عليها. فجاءت «فتختارُ من أين تنطلق» عند
// السابعة والثلاثين، والمالكُ يسمعها عند الثالثة والخمسين.
//
// والوتيرةُ ليست واحدة، والمقيسُ يقول ذلك: المقطعُ الأوّل اثنا عشرَ حرفاً
// في الثانية، والرابع أحدَ عشرَ — وكلاهما مثبَّتٌ بأذن المالك. أي أن
// الافتتاح يُقرأ متمهّلاً، والتفاصيلُ العدديةُ بعده تُقرأ ضِعفَ ذلك. فوتيرةٌ
// وسطى تُسرِع الأوّلَ وتُبطئ الآخِر، ويتراكم الفرق.
//
// فتُقاس الوتيرةُ **بين مِرساتين** لا على الفيلم كلِّه: ما بينهما من حروفٍ
// معلوم، وما بينهما من ثوانٍ مقيس، فالقسمةُ وتيرتُهما هما. ولا يُقدَّر إلا
// موضعُ الحدود داخلَ المدى. وكلُّ مِرساةٍ يزيدها المالك تشدّ مدىً وتقسمه.

const K = C.length, M = UTT.length, INFC = Infinity;
const marks = [...ANCHOR.entries()].sort((a, b) => a[0] - b[0]);
if (marks[0][0] !== 0 || marks[0][1] !== 0) {
  console.log('أوّلُ مِرساةٍ يجب أن تكون الفقرةَ صفر عند النطق صفر');
  process.exit(1);
}
marks.push([K, M]);
for (let i = 1; i < marks.length; i++) {
  if (marks[i][0] <= marks[i - 1][0] || marks[i][1] <= marks[i - 1][1] ||
      marks[i][0] - marks[i - 1][0] > marks[i][1] - marks[i - 1][1]) {
    console.log(`مِرساةٌ لا تستقيم عند الفقرة ${marks[i][0]} — راجِع ANCHOR`);
    process.exit(1);
  }
}

const groups = [];
/** وتيرةُ المدى الذي وقعت فيه كلُّ فقرة — للتقرير، فيُقرأ الخطأ بميزانه */
const paraRate = new Array(K).fill(0);
for (let s = 0; s + 1 < marks.length; s++) {
  const [p0, u0] = marks[s], [p1, u1] = marks[s + 1];
  const n = p1 - p0, m = u1 - u0;
  const R = C.slice(p0, p1).reduce((a, b) => a + b, 0) / (ps[u1] - ps[u0]);
  for (let p = p0; p < p1; p++) paraRate[p] = R;
  if (n === 1) { groups.push([u0, u1]); continue; }

  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(INFC));
  const bk = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(-1));
  d[0][0] = 0;
  for (let j = 1; j <= n; j++)
    for (let i = j; i <= m; i++)
      for (let q = j - 1; q < i; q++) {
        if (d[q][j - 1] === INFC) continue;
        const dd = C[p0 + j - 1] / R - (ps[u0 + i] - ps[u0 + q]);
        const e = d[q][j - 1] + dd * dd - (CLIP_HEAD.has(u0 + q) ? CLIP_BONUS : 0);
        if (e < d[i][j]) { d[i][j] = e; bk[i][j] = q; }
      }
  const cuts = [];
  for (let i = m, j = n; j > 0; j--) { const q = bk[i][j]; cuts.unshift([u0 + q, u0 + i]); i = q; }
  groups.push(...cuts);
}

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

// المزجُ يتعلّق بـ CLIPS و LEAD و GAP وحدها — لا بالمطابقة. فتجريبُ
// CLIP_PARAS لا يحتاج إعادةَ ترميزِ مئةٍ وخمسين ثانية: `SKIP_MIX=1`.
if (!(process.env.SKIP_MIX && existsSync(OUT))) execFileSync('ffmpeg', [
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

// ── طبقةُ الكلمات: ‎?words=1‎ ─────────────────────────────────────────────
//
// **لأن من يبني الفيلم لا يسمعه.** المطابقةُ تنسب كلَّ فقرةٍ إلى وحدة نطقٍ
// مقيسة، وقد تُخطئ النسبة — ولا يظهر خطؤها في أيّ رقم: الجدولُ متّسقٌ مع
// نفسه مهما كان الإسناد. والذي يكشفه أذنٌ تسمع وعينٌ تقرأ في اللحظة نفسِها.
//
// فتُعرض أوّلُ كلمات الفقرة التي يظنّ الجدولُ أنها تُقال الآن. فمن شاهد
// الفيلم بـ‎?words=1‎ رأى الانحراف فوراً، وقال الثانيةَ التي وقع عندها بدل
// «الصوت لا يطابق الصورة».
const paraCue = groups.map(([a], p) => {
  const words = paras[p].split(/\s+/).slice(0, 7).join(' ');
  return `[${r2(UTT[a][0])},${JSON.stringify(words)}]`;
}).join(',');

const block = `${OPEN}
/* مُولَّدٌ بـ scripts/build-road.mjs — لا يُحرَّر بيد.
   ‎[زمنُ الفيلم, زمنُ الصوت]‎ عند كل مشهد. وما بينهما خطٌّ مستقيم. */
const WARP = [${OLD.map((o, i) => `[${o},${r2(NEW[i])}]`).join(',')}];
const AUDIO_TOTAL = ${made.toFixed(2)};
/* ‎[بدايةُ الفقرة بالصوت, أوّلُ كلماتها]‎ — تُعرض مع ‎?words=1‎ وحدها */
const PARAS = [${paraCue}];
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
/* طبقةُ الكلمات — بمفتاح W، على نمط V وD وR. وسلسلةُ الاستعلام تسقط في بعض
   نوافذ المعاينة، والمفتاحُ لا يسقط. ولا تظهر في التسجيل ما لم تُطلب. */
let wordsTag = null;
function toggleWords() {
  if (wordsTag) { wordsTag.remove(); wordsTag = null; return; }
  wordsTag = buildWords();
}
function buildWords() {
  const tag = document.createElement('div');
  tag.style.cssText =
    'position:absolute;left:0;right:0;bottom:52px;z-index:60;text-align:center;' +
    'font:700 20px/1.5 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.62);' +
    'padding:10px 16px;pointer-events:none;direction:rtl';
  stage.appendChild(tag);
  setInterval(() => {
    const a = haveVoice ? voice.currentTime : 0;
    let cur = PARAS[0];
    for (const p of PARAS) if (a >= p[0]) cur = p;
    // بلا قالبٍ نصّيّ: هذا السطر داخل قالبِ البناء، فمُعامِلُ القالب يُفسَّر مرّتين
    tag.textContent = a.toFixed(1) + ' ث — يُفترض: ' + (cur ? cur[1] : '—');
  }, 120);
  return tag;
}
if (new URLSearchParams(location.search).has('words')) wordsTag = buildWords();
addEventListener('keydown', (e) => { if (e.code === 'KeyW') toggleWords(); });

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

const err = groups.map(([a, b], p) => C[p] / paraRate[p] - (ps[b] - ps[a]));
const rms = Math.sqrt(err.reduce((s, x) => s + x * x, 0) / K);
writeFileSync(
  resolve('docs/promo/road-cues.json'),
  JSON.stringify({
    audioTotal: +made.toFixed(2), filmTotal: OLD.at(-1), lead: LEAD, gap: GAP,
    rms: +rms.toFixed(2), utterances: UTT.length, clips: cues,
    scenes: OLD.slice(1, -1).map((o, i) => ({ film: o, audio: NEW[i + 1] })),
  }, null, 2)
);

console.log(`مقاطع ${CLIPS.length}  نُطق ${UTT.length}  ->  ${made.toFixed(2)} ث   (جذر الخطأ ${rms.toFixed(2)} ث)`);
// **توزيعُ الفقرات على المقاطع — وهو ما يُصحَّح بالأذن.** يُطبع ليُقرأ: نجمةٌ
// لما ثُبِّت سماعاً، وفراغٌ لما قدّره الحساب. وخطأُ ثانيتين في مشهدٍ يُرَدّ
// إلى رقمٍ في هذا السطر، لا إلى المطابقة كلِّها.
console.log('');
console.log('المقاطعُ وحدودُ الفقرات فيها:');
CLIPS.forEach((name, c) => {
  const utts = UTT_CLIP.filter((x) => x === c).length;
  const heads = groups.filter(([a]) => UTT_CLIP[a] === c).length;
  const onHead = groups.some(([a]) => a === UTT_CLIP.indexOf(c));
  console.log(
    `  ${String(name).padStart(2)}.mp3  ${cues[c].start.toFixed(2)}–${cues[c].end.toFixed(2)} ث` +
    `  ·  ${utts} نطقاً  ·  ${heads} بدايةَ فقرة` +
    `  ·  ${onHead ? 'يبدأ بفقرةٍ جديدة' : 'يُكمل فقرةً بدأت قبله'}`
  );
});
console.log('');
groups.forEach(([a, b], p) => {
  const d = C[p] / paraRate[p] - (ps[b] - ps[a]);
  const mark = ANCHOR.has(p) ? '✓' : CLIP_HEAD.has(a) ? '·' : ' ';
  console.log(`  ${mark} مشهد ${String(PARA_SCENE[p]).padStart(3)}  ${String(r2(UTT[a][0])).padStart(7)} ث   نطق ${String(a + 1).padStart(2)}-${String(b).padStart(2)}  (${d >= 0 ? '+' : ''}${d.toFixed(1)})  ${String(Math.round(paraRate[p])).padStart(2)}ح/ث  ${paras[p].slice(0, 32)}`);
});
