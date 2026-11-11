// Generates PWA icons: dark square with a blue dumbbell glyph.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const bg = '#0B0D11';
const blue = '#4C8DFF';

// Dumbbell drawn on a 512 grid; `scale` shrinks it for the maskable safe zone.
const svg = (size, { rounded, scale }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${bg}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)" fill="${blue}">
    <rect x="196" y="238" width="120" height="36" rx="10"/>
    <rect x="150" y="170" width="48" height="172" rx="14"/>
    <rect x="314" y="170" width="48" height="172" rx="14"/>
    <rect x="104" y="204" width="40" height="104" rx="12"/>
    <rect x="368" y="204" width="40" height="104" rx="12"/>
  </g>
</svg>`;

mkdirSync('public/icons', { recursive: true });
const jobs = [
  ['icon-192.png', 192, { rounded: true, scale: 1 }],
  ['icon-512.png', 512, { rounded: true, scale: 1 }],
  ['maskable-512.png', 512, { rounded: false, scale: 0.72 }],
];
for (const [name, size, opts] of jobs) {
  await sharp(Buffer.from(svg(size, opts))).png().toFile(`public/icons/${name}`);
  console.log('wrote', name);
}
