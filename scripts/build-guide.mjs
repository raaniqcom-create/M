// Builds the owner guide's soundtrack and retimes its page to match.
//
// Same rule as the explainer: the clip names carry the ORDER, the recordings
// carry the TIMING. A guide is worse than an ad when the two drift — the
// viewer is following along on their own phone, so a caption that arrives
// before or after the words is not a blemish, it is a wrong instruction.
//
//   node scripts/build-guide.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = 'C:/Users/al3r1/OneDrive/Desktop/MY/new/G';
const BED = 'C:/Users/al3r1/OneDrive/Desktop/MY/new/back.mp3';
const OUT = resolve('docs/promo/guide-audio.mp3');
const PAGE = resolve('docs/promo/guide.html');

// one entry per scene, in scene order
const CLIPS = ['G00', 'G008', 'G016', 'G024', 'G032', 'G040', 'G048', 'G056', 'G064', 'G072', 'G080'];

const missing = CLIPS.filter((c) => !existsSync(`${SRC}/${c}.mp3`));
if (missing.length) {
  console.log(`missing ${missing.length}: ${missing.join(', ')}`);
  console.log('the video cannot be built until every scene has its narration');
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

// A guide is followed, not watched. The pause after each instruction is where
// the viewer looks down at their own phone and does the thing — so it is
// deliberately longer here than in the ad.
const GAP = 1.1;
const total = speech + GAP * (CLIPS.length - 1);

let t = 0;
const cues = lengths.map((len, i) => {
  const start = t;
  t += len + (i < CLIPS.length - 1 ? GAP : 0);
  return { i, start: +start.toFixed(2), end: +(start + len).toFixed(2) };
});

// ---- mix: each clip at its cue, music bed underneath, looped to length ----
const inputs = files.flatMap((f) => ['-i', f]);
const delays = cues
  .map((c, i) => `[${i}:a]adelay=${Math.round(c.start * 1000)}|${Math.round(c.start * 1000)}[v${i}]`)
  .join(';');
const mixVoice = cues.map((_, i) => `[v${i}]`).join('') + `amix=inputs=${CLIPS.length}:normalize=0[voice]`;
// the bed is shorter than a guide this long, so it loops rather than stopping
const bedChain =
  `[${CLIPS.length}:a]volume=0.10,aloop=loop=-1:size=2e9,atrim=0:${total.toFixed(2)},` +
  `afade=t=in:st=0:d=1.5,afade=t=out:st=${(total - 2).toFixed(2)}:d=2[bg]`;
const filter = `${delays};${mixVoice};${bedChain};[voice][bg]amix=inputs=2:normalize=0:duration=first[out]`;

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  ...inputs, '-i', BED,
  '-filter_complex', filter,
  '-map', '[out]',
  '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100',
  OUT,
]);

const made = dur(OUT);

// ---- retime the page from the cues ----
let page = readFileSync(PAGE, 'utf8');
const OLD = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 89];
const NEW = [...cues.map((c) => c.start), +made.toFixed(2)];
const r2 = (n) => Math.round(n * 100) / 100;
const HOLD = 0.9;

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

let idx = 0;
page = page.replace(/animation:scene [\d.]+s both;animation-delay:[\d.]+s/g, () => {
  const i = ++idx;
  return `animation:scene ${span(i)}s both;animation-delay: ${r2(NEW[i])}s`;
});
page = page.replace(/animation:scene [\d.]+s both"/g, () => `animation:scene ${span(0)}s both"`);
page = page.replace(/animation-delay:([\d.]+)s/g, (_, d) => `animation-delay:${r2(at(+d))}s`);
page = page.split('animation-delay: ').join('animation-delay:');
page = page.replace(/--total:[\d.]+s/, `--total:${made.toFixed(2)}s`);
writeFileSync(PAGE, page);

writeFileSync(resolve('docs/promo/guide-cues.json'), JSON.stringify({ total: +made.toFixed(2), cues }, null, 2));

console.log(`clips ${CLIPS.length}  speech ${speech.toFixed(1)}s  gap ${GAP}s  ->  ${made.toFixed(2)}s`);
cues.forEach((c, i) => console.log(`  ${CLIPS[i].padEnd(6)} ${String(c.start).padStart(6)}s`));
