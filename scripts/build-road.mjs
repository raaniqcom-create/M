// يبني شريطَ صوت «مساعد الطريق» ويُعيد توقيت صفحته عليه.
//
//   node scripts/build-road.mjs
//
// **القاعدةُ نفسُها التي بُني بها الدليل: أسماءُ المقاطع تحمل الترتيب،
// والتسجيلاتُ تحمل التوقيت.** فيلمٌ تسبق صورتُه كلامَه أو تتأخّر عنه ليس
// فيلماً فيه عيب، بل فيلمٌ يقول غيرَ ما يُرى فيه.
//
// **وما لا يُعرَف من التسجيل وحده: أيُّ مقطعٍ لأيّ مشهد.** عشرةُ مقاطع
// وأربعةَ عشرَ مشهداً، فالقسمة ليست واحداً لواحد. وحُلَّ بما لا يحتاج إلى
// تخمين: القراءةُ متّصلةٌ وبترتيب النصّ — وهذا يقينٌ لا افتراض — فيُبنى
// جدولُ «حرفٌ ← زمن» من أطوال المقاطع، ويُقرأ منه زمنُ كل مشهد بموضع أوّل
// حرفٍ من فقرته. فخطأُ المشهد محصورٌ في تفاوت سرعة القراءة داخل المقطع
// الواحد — ثانيةً أو نحوَها — لا في نسبة مشهدٍ إلى مقطعٍ ليس له.
//
// و**CLIP_SENTENCES** هو السطرُ الوحيد الذي يُعدَّل إن أخطأتِ المطابقة: عددُ
// جُمل النصّ في كل مقطع، بالترتيب. قِيس من أطوال المقاطع نفسِها وعدد
// الوقفات فيها، ووافق بجذرِ خطأٍ تربيعيّ 1.39 ثانية.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve('mp3/1');
const BED = 'C:/Users/al3r1/OneDrive/Desktop/MY/new/back.mp3'; // الخلفيةُ نفسُها التي تحت الدليل والإعلان
const OUT = resolve('docs/promo/road-voice.mp3');
const PAGE = resolve('docs/promo/road.html');
const SCRIPT = resolve('docs/promo/road-script.md');

const CLIPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** عددُ جُمل النصّ في كل مقطع، بالترتيب — مجموعها 39، وهو عددُ جُمل النصّ */
const CLIP_SENTENCES = [1, 1, 1, 1, 3, 4, 8, 5, 7, 8];

/** الافتتاحُ صامتٌ بنصِّ السكربت: الشعاران وحدَهما قبل أن يبدأ الكلام */
const LEAD = 6.0;
/** فاصلٌ بين مقطعٍ وآخر — ومع صمتِ أطرافِ المقاطع يصير نحوَ 0.9 ث */
const GAP = 0.45;
/** ذيلٌ بعد آخر كلمة، لئلّا ينقطع الفيلمُ على حرف */
const TAIL = 0.8;

/** مشهدُ كلِّ فقرةٍ من فقرات النصّ — بترتيب الفقرات في road-script.md.
 *  فقرتان لمشهدٍ واحد (51): «ثمّ يبدأ ما لا محطة فيه» ثمّ «صحراء مفتوحة». */
const PARA_SCENE = [6, 11, 18, 24, 34, 42, 51, 51, 64, 77, 85, 91, 99, 109, 121];
/** بداياتُ المشاهد كما هي مكتوبةٌ في الصفحة اليوم — مراسي إعادة التوقيت */
const OLD = [0, 6, 11, 18, 24, 34, 42, 51, 64, 77, 85, 91, 99, 109, 121, 131];

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

const files = CLIPS.map((c) => `${SRC}/${c}.mp3`);
const lengths = files.map(dur);
const speech = lengths.reduce((a, b) => a + b, 0);

let t = LEAD;
const cues = lengths.map((len, i) => {
  const start = t;
  t += len + GAP;
  return { i: i + 1, start: +start.toFixed(2), end: +(start + len).toFixed(2) };
});
const total = +(t - GAP + TAIL).toFixed(2);

// ── جدولُ «حرفٌ ← زمن» ────────────────────────────────────────────────────
//
// يُقرأ النصُّ من السكربت نفسِه لا من نسخةٍ ثانية: نسختان تفترقان، والفيلمُ
// يتبع الفارقةَ منهما بلا أن يعلم أحد.
// CRLF: الملفّ يُحرَّر على وندوز، وفقرةٌ تُفصل بسطرٍ فارغ لا تُرى بدون هذا
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

// جملٌ، ومعها مشهدُها وهل هي أوّلُ فقرتها
const units = [];
paras.forEach((p, pi) => {
  p.split(/(?<=[.؟])\s+/).map((s) => s.trim()).filter(Boolean)
    .forEach((s, si) => units.push({ text: s, scene: PARA_SCENE[pi], first: si === 0 }));
});

const chars = (s) => s.replace(/[^\u0621-\u064Aa-zA-Z ]/g, '').length;
const sum = CLIP_SENTENCES.reduce((a, b) => a + b, 0);
if (sum !== units.length) {
  console.log(`CLIP_SENTENCES مجموعُها ${sum} وجُملُ النصّ ${units.length} — عدّلها`);
  process.exit(1);
}

// لكل مقطعٍ مداه من الجمل، فزمنُ أي جملةٍ بتناسبٍ حرفيّ داخل مقطعها
let u = 0;
const spans = CLIP_SENTENCES.map((n, ci) => {
  const from = u; u += n;
  const len = units.slice(from, u).reduce((a, x) => a + chars(x.text), 0);
  return { from, to: u, len, start: cues[ci].start, dur: lengths[ci] };
});

const timeOfUnit = (idx) => {
  const s = spans.find((x) => idx >= x.from && idx < x.to);
  if (!s) return total;
  const before = units.slice(s.from, idx).reduce((a, x) => a + chars(x.text), 0);
  return s.start + (before / Math.max(1, s.len)) * s.dur;
};

const sceneAt = new Map();
units.forEach((x, i) => {
  if (x.first && !sceneAt.has(x.scene)) sceneAt.set(x.scene, +timeOfUnit(i).toFixed(2));
});
const NEW = [0, LEAD, ...OLD.slice(2, -1).map((o) => sceneAt.get(o)), total];
if (NEW.some((x) => x == null)) {
  console.log('مشهدٌ بلا زمن — راجِع PARA_SCENE');
  process.exit(1);
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

// ── إعادةُ توقيت الصفحة ───────────────────────────────────────────────────
let page = readFileSync(PAGE, 'utf8');
const r2 = (n) => Math.round(n * 100) / 100;
/** المشهدُ يبقى قائماً بعد أن يسكت المعلّق قليلاً، فلا يُقطع على الكلمة */
const HOLD = 0.94;
const at = (x) => {
  for (let i = 0; i < OLD.length - 1; i++) {
    if (x >= OLD[i] && x <= OLD[i + 1]) {
      const f = (x - OLD[i]) / (OLD[i + 1] - OLD[i]);
      return NEW[i] + f * (NEW[i + 1] - NEW[i]);
    }
  }
  return NEW.at(-1);
};
const span = (i) => (i === NEW.length - 2 ? r2(NEW.at(-1) - NEW[i]) : r2((NEW[i + 1] - NEW[i]) / HOLD));

// مددُ المشاهد أوّلاً — أربعةَ عشرَ إعلاناً بترتيبها في الصفحة
let idx = 0;
page = page.replace(/animation:scene [\d.]+s both;animation-delay:[\d.]+s/g, () => {
  const i = ++idx;
  return `animation:scene ${span(i)}s both;animation-delay:\u0000${r2(NEW[i])}s`;
});
if (idx !== NEW.length - 2) {
  console.log(`مشاهدُ الصفحة ${idx} ولا تطابق ${NEW.length - 2}`);
  process.exit(1);
}
// ثمّ كلُّ تأخيرٍ آخر داخل المشاهد — والمُعلَّمةُ أعلاه محميّةٌ من جولةٍ ثانية
page = page.replace(/animation-delay:([\d.]+)s/g, (_, d) => `animation-delay:${r2(at(+d))}s`);
page = page.split('\u0000').join('');

// عتباتُ انكماش الخريطتين تُقرأ بالثواني، فتتبع التوقيت الجديد
page = page.replace(/const small = s >= [\d.]+ && s < [\d.]+;/,
  `const small = s >= ${r2(NEW[6])} && s < ${r2(NEW[7])};`);
page = page.replace(/const gates = s >= [\d.]+ && s < [\d.]+;/,
  `const gates = s >= ${r2(NEW[8])} && s < ${r2(NEW[9])};`);
page = page.replace(/const TOTAL = [\d.]+;/, `const TOTAL = ${made.toFixed(2)};`);
writeFileSync(PAGE, page);

writeFileSync(
  resolve('docs/promo/road-cues.json'),
  JSON.stringify({ total: +made.toFixed(2), lead: LEAD, gap: GAP, cues, scenes: [...sceneAt] }, null, 2)
);

console.log(`مقاطع ${CLIPS.length}  كلام ${speech.toFixed(1)} ث  ->  ${made.toFixed(2)} ث`);
cues.forEach((c, i) => console.log(`  ${String(CLIPS[i]).padStart(2)}.mp3  ${String(c.start).padStart(7)} ث  (${lengths[i].toFixed(2)})`));
console.log('\nالمشاهد:');
OLD.slice(1, -1).forEach((o, i) => console.log(`  ${String(o).padStart(4)} ->  ${String(NEW[i + 1]).padStart(7)} ث`));
