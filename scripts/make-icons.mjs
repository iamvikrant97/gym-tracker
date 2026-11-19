// Generates PWA icons: dark square with a loaded barbell (blue, teal and amber plates).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const bg = '#0B0D11';
const blue = '#4C8DFF';

// Barbell drawn on a 512 grid; `scale` shrinks it for the maskable safe zone.
const svg = (size, { rounded, scale }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${bg}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <rect x="30" y="246" width="452" height="20" rx="8" fill="#8B93A3"/>
    <rect x="146" y="142" width="40" height="228" rx="12" fill="${blue}"/>
    <rect x="106" y="170" width="32" height="172" rx="10" fill="#2DD4BF"/>
    <rect x="70" y="198" width="28" height="116" rx="9" fill="#F2B544"/>
    <rect x="326" y="142" width="40" height="228" rx="12" fill="${blue}"/>
    <rect x="374" y="170" width="32" height="172" rx="10" fill="#2DD4BF"/>
    <rect x="414" y="198" width="28" height="116" rx="9" fill="#F2B544"/>
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
