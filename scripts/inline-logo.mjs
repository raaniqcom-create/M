// Embeds the real app icon into the explainer page as a data: URI.
//
// The page had a hand-rebuilt SVG approximation of the mark. The actual icon
// is the brand — nozzle, circuit trace, pin, and the wordmark — and no
// reconstruction is going to match it.
//
// A data: URI rather than <img src="../../public/icons/…"> because this file
// gets opened from wherever it lands, sent around, and recorded. A relative
// path that resolves on this machine and nowhere else is a broken logo in the
// one frame that is on screen for the whole video.
//
//   node scripts/inline-logo.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const PAGE = new URL('../docs/promo/explainer.html', import.meta.url);
// 192px for a box that renders at 76 — enough for a 2x recording, and a
// twentieth of the weight of the 512.
const ICON = new URL('../public/icons/icon-192.png', import.meta.url);

const b64 = readFileSync(ICON).toString('base64');
const uri = `data:image/png;base64,${b64}`;

let page = readFileSync(PAGE, 'utf8');

// Replace the whole inline <svg class="logo">…</svg> with the real bitmap.
const svg = /<svg class="logo"[\s\S]*?<\/svg>/;
if (!svg.test(page)) {
  // Already swapped: keep the data URI current instead of appending a second one.
  const img = /<img class="logo"[^>]*>/;
  if (!img.test(page)) throw new Error('no logo element found to replace');
  page = page.replace(img, `<img class="logo" src="${uri}" alt="">`);
} else {
  page = page.replace(svg, `<img class="logo" src="${uri}" alt="">`);
}

writeFileSync(PAGE, page);
console.log(`icon-192.png inlined — ${(uri.length / 1024).toFixed(0)} KB as data URI`);
