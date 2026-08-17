// Re-times the explainer from cues.json and splits the closing scene.
//
// The cue table is derived from the recordings themselves, so it is the only
// source of truth about when anything should appear. Retiming by hand across
// nine scenes and forty-odd inner delays is how the "scene at 87.89s in an 82s
// video" bug happened the first time.
//
//   node scripts/build-voice.mjs && node scripts/retime-explainer.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE = resolve('docs/promo/explainer.html');
const { total, cues } = JSON.parse(readFileSync(resolve('docs/promo/cues.json'), 'utf8'));

// the eight scene starts the file currently carries, in document order
const OLD = [0, 7.7, 16, 25, 36.9, 50.95, 58.4, 67.3, 82.03];
// nine now: the old closing scene held both the brand and the QR codes, and the
// new script gives them separate cues — «المحطة التقنية» then «صوّر الرمز».
const NEW = [...cues.map((c) => c.start), total];

const r2 = (n) => Math.round(n * 100) / 100;
const FADE_HOLD = 0.88;

/** Map a cue inside the OLD timeline onto the NEW one, proportionally within
 *  its scene, so an element that appeared a third of the way through a scene
 *  still does. */
function at(t) {
  // the old file had 8 scenes; fold its last two boundaries onto the new 9th
  const O = OLD;
  const N = [NEW[0], NEW[1], NEW[2], NEW[3], NEW[4], NEW[5], NEW[6], NEW[7], NEW[9] ?? total];
  for (let i = 0; i < O.length - 1; i++) {
    if (t >= O[i] && t <= O[i + 1]) {
      const f = (t - O[i]) / (O[i + 1] - O[i]);
      return N[i] + f * (N[i + 1] - N[i]);
    }
  }
  return total;
}

let page = readFileSync(PAGE, 'utf8');

// 1) scene spans, derived from the next scene's start
const spanFor = (i) =>
  i === NEW.length - 2 ? r2(total - NEW[i]) : r2((NEW[i + 1] - NEW[i]) / FADE_HOLD);

let idx = 0;
page = page.replace(/animation:scene [\d.]+s both;animation-delay:[\d.]+s/g, () => {
  const i = ++idx;
  return `animation:scene ${spanFor(i)}s both;animation-delay: ${r2(NEW[i])}s`;
});
page = page.replace(/animation:scene [\d.]+s both"/g, () => `animation:scene ${spanFor(0)}s both"`);

// 2) inner cues
page = page.replace(/animation-delay:([\d.]+)s/g, (_, d) => `animation-delay:${r2(at(+d))}s`);
page = page.split('animation-delay: ').join('animation-delay:');

// 3) progress bar
page = page.replace(/--t:[\d.]+s/, `--t:${total}s`);

writeFileSync(PAGE, page);
console.log(`retimed ${idx + 1} scenes to ${total}s`);
NEW.slice(0, -1).forEach((s, i) => console.log(`  scene ${i + 1}: ${s}s`));
