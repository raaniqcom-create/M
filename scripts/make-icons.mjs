// Builds the PWA icon set.
//
// Drop the official logo at public/logo-original.(png|jpg|jpeg|webp) and it is
// used automatically; otherwise the bundled SVG placeholder is used.
// Run:  node scripts/make-icons.mjs
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const CANDIDATES = [
  'public/logo-original.png',
  'public/logo-original.jpg',
  'public/logo-original.jpeg',
  'public/logo-original.webp',
];

const original = CANDIDATES.find(existsSync);
const source = original ?? 'public/icon-source.svg';
console.log(`source: ${source}${original ? '' : '  (placeholder — add public/logo-original.png to use the real logo)'}`);

mkdirSync('public/icons', { recursive: true });

// The supplied artwork sits on a wide white page. Trim that away so the mark
// itself fills the tile — this is the "remove the edges" step; without it every
// icon renders as a small logo floating in white.
async function squareMark(size) {
  const base = sharp(readFileSync(source), { density: 400 });
  const trimmed = original ? base.trim({ threshold: 12 }) : base;

  return trimmed
    .resize(size, size, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
}

const targets = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  // Android crops maskable icons to a circle; keep the mark inside the safe zone
  { file: 'icon-512-maskable.png', size: 512, pad: 0.1 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
];

for (const { file, size, pad } of targets) {
  const inner = Math.round(size * (1 - pad * 2));
  const offset = Math.round((size - inner) / 2);
  const mark = await squareMark(inner);

  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: mark, top: offset, left: offset }])
    .png()
    .toFile(`public/icons/${file}`);

  console.log(`public/icons/${file}  ${size}x${size}`);
}

// social preview card shown when the link is shared
const card = await squareMark(560);
await sharp({
  create: { width: 1200, height: 630, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
})
  .composite([{ input: card, top: 35, left: 320 }])
  .png()
  .toFile('public/og-image.png');

console.log('public/og-image.png  1200x630');
