// Inlines the three QR codes into the explainer video page.
//
// segno writes width/height and NO viewBox. Embedded that way the SVG cannot
// scale to its container — it rendered blank in the printed guide for exactly
// this reason. So the fixed size comes off and a viewBox goes on, computed
// from the size segno actually emitted rather than assumed.
//
//   node scripts/inline-qr.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const PAGE = new URL('../docs/promo/explainer.html', import.meta.url);
const QR = (n) => new URL(`../docs/anbar-oil/qr/${n}.svg`, import.meta.url);

function prepare(name) {
  let s = readFileSync(QR(name), 'utf8');

  s = s.replace(/<\?xml[^>]*\?>\s*/, '');

  const w = Number(/\bwidth="(\d+(?:\.\d+)?)"/.exec(s)?.[1]);
  const h = Number(/\bheight="(\d+(?:\.\d+)?)"/.exec(s)?.[1]);
  if (!w || !h) throw new Error(`${name}: no width/height to derive a viewBox from`);

  if (!/viewBox=/.test(s)) {
    s = s.replace('<svg', `<svg viewBox="0 0 ${w} ${h}"`);
  }
  // Drop the fixed size only after the viewBox exists, never before.
  s = s.replace(/\s(width|height)="[^"]*"/g, '');

  // shape-rendering keeps the modules crisp at any scale; a blurred QR is an
  // unreadable QR, and this one is filmed off a screen.
  s = s.replace('<svg', '<svg shape-rendering="crispEdges" aria-hidden="true"');

  return s.trim();
}

let page = readFileSync(PAGE, 'utf8');
for (const name of ['site', 'ios', 'android']) {
  const marker = `<!--QR:${name}-->`;
  if (!page.includes(marker)) throw new Error(`marker ${marker} not found`);
  page = page.replace(marker, prepare(name));
  console.log(`${name.padEnd(8)} inlined`);
}
writeFileSync(PAGE, page);
console.log('explainer.html updated');
