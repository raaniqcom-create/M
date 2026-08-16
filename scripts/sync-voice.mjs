// Re-times the explainer so every scene change lands on a pause in the voice
// track, instead of cutting through the middle of a sentence.
//
// The scene starts below are not arithmetic. They were measured: an RMS
// envelope of docs/promo/voice.mp3 in 50 ms windows shows 27 dips at -60 to
// -69 dB below peak, which are the gaps between sentences. Each boundary is
// snapped to the nearest one. The dip at 16.00 s is also the seam between the
// two recordings, which is why scene 3 starts exactly there.
//
// Runs against the committed 63 s baseline. It is NOT idempotent — re-running
// it on its own output would remap already-remapped numbers. Restore first:
//   git checkout -- docs/promo/explainer.html && node scripts/sync-voice.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const PAGE = new URL('../docs/promo/explainer.html', import.meta.url);

const OLD = [0, 6.6, 13.2, 19.4, 28.6, 37.9, 44.4, 52.2, 63];
const NEW = [0, 7.7, 16.0, 25.0, 36.9, 50.95, 58.4, 67.3, 82.03];

/** Piecewise-linear remap: a cue keeps its position *within its scene*. */
function at(t) {
  for (let i = 0; i < OLD.length - 1; i++) {
    if (t >= OLD[i] && t <= OLD[i + 1]) {
      const f = (t - OLD[i]) / (OLD[i + 1] - OLD[i]);
      return NEW[i] + f * (NEW[i + 1] - NEW[i]);
    }
  }
  const k = (NEW.at(-1) - NEW.at(-2)) / (OLD.at(-1) - OLD.at(-2));
  return NEW.at(-1) + (t - OLD.at(-1)) * k;
}

const r2 = (n) => Math.round(n * 100) / 100;

// Scene spans are DERIVED from the next scene's start, never scaled from the
// old ones. The `scene` keyframe holds full opacity to 88% then fades over the
// last 12%, so a scene must run to (gap / 0.88) for its fade-out to begin
// exactly as the next scene begins. Scaling instead left 0.26 s and 0.45 s
// windows after scenes 4 and 5 where one scene had finished fading and the next
// had not started — a blank flash, inherited from the original timings and
// stretched wider by the remap.
const FADE_HOLD = 0.88;
const spanFor = (i) =>
  i === NEW.length - 2
    ? r2(NEW.at(-1) - NEW[i]) // last scene fades out on the final words
    : r2((NEW[i + 1] - NEW[i]) / FADE_HOLD);

let page = readFileSync(PAGE, 'utf8');
let scenes = 0;
let delays = 0;

// 1. scenes 2..8 — delay parked behind a sentinel space so pass 2's broader
//    `animation-delay:` pattern cannot match and remap it a second time. That
//    double application is how the first run put a scene at 87.89 s in an 82 s
//    video.
let idx = 0;
page = page.replace(/animation:scene [\d.]+s both;animation-delay:[\d.]+s/g, () => {
  const i = ++idx;
  scenes++;
  return `animation:scene ${spanFor(i)}s both;animation-delay: ${r2(NEW[i])}s`;
});

// 2. scene 1 carries no delay
page = page.replace(/animation:scene [\d.]+s both"/g, () => {
  scenes++;
  return `animation:scene ${spanFor(0)}s both"`;
});

// 3. every remaining animation-delay is a cue inside a scene
page = page.replace(/animation-delay:([\d.]+)s/g, (_, d) => {
  delays++;
  return `animation-delay:${r2(at(+d))}s`;
});

page = page.split('animation-delay: ').join('animation-delay:');

// 4. the progress bar spans the whole track
page = page.replace(/--t:[\d.]+s/, `--t:${NEW.at(-1)}s`);

writeFileSync(PAGE, page);
console.log(`scenes ${scenes}   cues ${delays}`);
for (let i = 0; i < NEW.length - 1; i++) {
  const end = NEW[i] + spanFor(i);
  console.log(
    `  scene ${i + 1}: ${NEW[i].toFixed(2).padStart(6)} → fade at ${NEW[i + 1] ? NEW[i + 1].toFixed(2) : '—'}, ends ${end.toFixed(2)}`
  );
}
