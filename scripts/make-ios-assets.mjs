// Generates the two images Xcode actually needs: a 1024 app icon and a square
// splash. The App Store rejects an icon with an alpha channel, so both are
// flattened onto white — the logo is drawn for a white card anyway.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const LOGO = 'public/logo-original.png';
const ICONSET = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
const SPLASHSET = 'ios/App/App/Assets.xcassets/Splash.imageset';

const white = { r: 255, g: 255, b: 255, alpha: 1 };

async function square(size, logoRatio, out) {
  const inner = Math.round(size * logoRatio);
  const logo = await sharp(LOGO).resize(inner, inner, { fit: 'contain', background: white }).toBuffer();
  const pad = Math.round((size - inner) / 2);
  await sharp({ create: { width: size, height: size, channels: 3, background: white } })
    .composite([{ input: logo, top: pad, left: pad }])
    .flatten({ background: white }) // no alpha: App Store Connect rejects it
    .png()
    .toFile(out);
  console.log(out, `${size}x${size}`);
}

mkdirSync(ICONSET, { recursive: true });
mkdirSync(SPLASHSET, { recursive: true });

// icon: the logo fills most of the tile, iOS applies its own rounding
await square(1024, 0.86, `${ICONSET}/AppIcon-512@2x.png`);

// splash is drawn into any screen size, so the logo stays small and centred
for (const [name, size] of [
  ['splash-2732x2732.png', 2732],
  ['splash-2732x2732-1.png', 2732],
  ['splash-2732x2732-2.png', 2732],
]) {
  await square(size, 0.26, `${SPLASHSET}/${name}`);
}
