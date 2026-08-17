// Builds the explainer's soundtrack, and prints the timeline the page must use.
//
// The clips are named for the seconds in the written script (007 = 0:07), but
// the recordings run longer than the slots that script allowed: 045.mp3 is
// 14.7s with only 8s before 053 begins. Honouring the names would overlap the
// narrator with himself six times.
//
// So the names give ORDER, and the recordings give TIMING. Each clip follows
// the previous one, and the caption boundaries are derived from the real
// durations — which is what "the text matches the voice" actually requires.
//
//   node scripts/build-voice.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = 'C:/Users/al3r1/OneDrive/Desktop/MY/new';
const OUT = resolve('docs/promo/voice.mp3');

// order matters; the numbers are the script's intended cues, kept as names only
const CLIPS = ['00', '007', '014', '020', '029', '039', '045', '053', '057'];

const CAPTIONS = [
  'في الأنبار، أسئلة تتكرر كل يوم…',
  'والجواب يأتي متأخراً. ساعة في ازدحام ينتهي قبل دورك. ولتر يُحرق في الدوران بين المحطات. وخبر من منشور قديم.',
  'لكن المعلومة موجودة أصلاً… عند صاحب المحطة نفسه. غير أن لا يوجد طريق لإيصالها إلى الناس.',
  'فصنعنا الطريق. صاحب المحطة يحدّث التوفر بضغطة واحدة من هاتفه —',
  'فتصل لحظتها إلى كل من اختار مدينته ونوع الوقود الذي يهمّه. تعرف قبل أن تتحرك — لا دوران، ولا ازدحام ينتهي قبل دورك.',
  'مجانية بالكامل. لا رسوم على المستخدم ولا على المحطة، ولا نطلب حساباً ولا بيانات شخصية.',
  'انضمّ إلينا. إن كنت صاحب محطة، سجّل محطتك مجاناً وحدّث التوفر بضغطة. وإن كنت مستخدماً، حمّل التطبيق واختر مدينتك ونوع وقودك. وكلاهما مجاني تماماً.',
  'المحطة التقنية. التقنية حق للجميع.',
  'صوّر الرمز بكاميرا هاتفك — وانشر التطبيق بين أصدقائك وأهلك.',
];

const dur = (f) =>
  Number(
    execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f,
    ]).toString().trim()
  );

const files = CLIPS.map((c) => `${SRC}/${c}.mp3`);
const lengths = files.map(dur);
const bed = dur(`${SRC}/back.mp3`);
const speech = lengths.reduce((a, b) => a + b, 0);

// A breath between sentences, sized so the narration ends exactly with the
// music bed — the bed was clearly cut for this script, and letting it run on
// after the last word would sound like a mistake.
const gap = Math.max(0.15, (bed - speech) / (CLIPS.length - 1));
const total = speech + gap * (CLIPS.length - 1);

let t = 0;
const cues = lengths.map((len, i) => {
  const start = t;
  t += len + (i < CLIPS.length - 1 ? gap : 0);
  return { i, start: +start.toFixed(2), end: +(start + len).toFixed(2), text: CAPTIONS[i] };
});

// ---- mix ----
// Each clip is delayed to its cue and summed, then the bed is laid under at
// 15%. `amix` would divide every input's level by the number of inputs, so the
// voice is summed with `amerge`-free adelay+amix on normalized weights instead.
const inputs = files.flatMap((f) => ['-i', f]);
const delays = cues
  .map((c, i) => `[${i}:a]adelay=${Math.round(c.start * 1000)}|${Math.round(c.start * 1000)}[v${i}]`)
  .join(';');
const mixVoice = cues.map((_, i) => `[v${i}]`).join('') + `amix=inputs=${CLIPS.length}:normalize=0[voice]`;
const bedChain = `[${CLIPS.length}:a]volume=0.15,atrim=0:${total.toFixed(2)},afade=t=in:st=0:d=1.5,afade=t=out:st=${(total - 2).toFixed(2)}:d=2[bg]`;
const filter = `${delays};${mixVoice};${bedChain};[voice][bg]amix=inputs=2:normalize=0:duration=first[out]`;

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  ...inputs,
  '-i', `${SRC}/back.mp3`,
  '-filter_complex', filter,
  '-map', '[out]',
  '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100',
  OUT,
]);

const made = dur(OUT);
console.log(`clips ${CLIPS.length}  speech ${speech.toFixed(2)}s  bed ${bed.toFixed(2)}s`);
console.log(`gap ${gap.toFixed(3)}s  ->  voice.mp3 ${made.toFixed(2)}s`);
console.log('\ncues:');
for (const c of cues) console.log(`  ${String(c.start).padStart(6)}  ${c.text.slice(0, 60)}`);

writeFileSync(
  resolve('docs/promo/cues.json'),
  JSON.stringify({ total: +made.toFixed(2), cues }, null, 2)
);
console.log('\ncues.json written');
