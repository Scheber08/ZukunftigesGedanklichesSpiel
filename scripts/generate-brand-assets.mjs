/**
 * Erzeugt PNG-Favicons und das OG-Standardbild aus den SVG-Vorlagen (Plan §3.1).
 * Aufruf: node scripts/generate-brand-assets.mjs
 * Sobald das echte Logo vektorisiert ist: SVGs in public/brand ersetzen und erneut ausführen.
 */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const favicon = await readFile('public/favicon.svg');
await sharp(favicon, { density: 300 }).resize(32, 32).png().toFile('public/favicon-32.png');
await sharp(favicon, { density: 600 }).resize(180, 180).png().toFile('public/apple-touch-icon.png');

// maskable: Motiv mit Sicherheitsabstand (innere 80 %) auf vollflächigem Schwarz
const symbol = (await readFile('public/brand/logo-symbol-gradient.svg', 'utf8'));
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#050505"/><g transform="translate(128 118) scale(4)" fill="none" stroke="url(#g)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${symbol.replace(/^[\s\S]*?<svg[^>]*>/, '').replace('</svg>', '')}</g></svg>`;
await sharp(Buffer.from(maskable)).png().toFile('public/icon-512-maskable.png');
await sharp(Buffer.from(maskable)).resize(192, 192).png().toFile('public/icon-192.png');

// OG-Standardbild 1200×630: Logo mit Glow auf Schwarz
const inner = symbol.replace(/^[\s\S]*?<svg[^>]*>/, '').replace('</svg>', '');
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glowA" cx="0.45" cy="0.45" r="0.5"><stop offset="0" stop-color="#37BE89" stop-opacity="0.55"/><stop offset="1" stop-color="#37BE89" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="0.55" cy="0.55" r="0.5"><stop offset="0" stop-color="#34C4D0" stop-opacity="0.5"/><stop offset="1" stop-color="#34C4D0" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#050505"/>
  <circle cx="600" cy="300" r="300" fill="url(#glowA)"/>
  <circle cx="600" cy="300" r="300" fill="url(#glowB)"/>
  <g transform="translate(472 150) scale(4)" stroke="#fff" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${inner.replace(/stroke="url\(#g\)"/g, '')}</g>
</svg>`;
await sharp(Buffer.from(og)).png().toFile('public/og-default.png');

await writeFile(
  'public/site.webmanifest',
  JSON.stringify(
    {
      name: '[LIGANAME]',
      short_name: '[KÜRZEL]',
      start_url: '/',
      display: 'standalone',
      background_color: '#050505',
      theme_color: '#050505',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log('Brand-Assets erzeugt.');
