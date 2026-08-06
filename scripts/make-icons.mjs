// Renders the PWA icon set from public/icon-source.svg.
// Run after changing the logo:  node scripts/make-icons.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync('public/icon-source.svg');
mkdirSync('public/icons', { recursive: true });

// Android maskable icons are cropped to a circle; keeping the mark inside the
// inner 80% keeps it whole on every launcher shape.
const targets = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'icon-512-maskable.png', size: 512, pad: 0.1 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
];

for (const { file, size, pad } of targets) {
  const inner = Math.round(size * (1 - pad * 2));
  const offset = Math.round((size - inner) / 2);

  const mark = await sharp(svg, { density: 400 }).resize(inner, inner).png().toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: mark, top: offset, left: offset }])
    .png()
    .toFile(`public/icons/${file}`);

  console.log(`public/icons/${file}  ${size}x${size}`);
}

// social preview card (1200x630) for shared station links
const card = await sharp(readFileSync('public/logo.svg'), { density: 400 })
  .resize(600, 600)
  .png()
  .toBuffer();

await sharp({
  create: { width: 1200, height: 630, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
})
  .composite([{ input: card, top: 15, left: 300 }])
  .png()
  .toFile('public/og-image.png');

console.log('public/og-image.png  1200x630');
