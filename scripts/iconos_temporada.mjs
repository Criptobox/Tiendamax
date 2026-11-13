/* Dibuja los iconos de temporada (iconos/navidad/, iconos/halloween/).
 *
 * La bolsa con la M es la misma del icono de siempre, redibujada en SVG para
 * poder cambiarle el fondo y ponerle gorro. Todo lo importante (bolsa, gorro)
 * queda dentro del círculo seguro de los iconos "maskable" (80 % del lado):
 * Android recorta el icono en círculo, gota o cuadrado según el teléfono.
 *
 * No corre en ningún workflow: se ejecuta a mano si cambia el diseño.
 *   node scripts/iconos_temporada.mjs   (necesita Playwright y Pillow)
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js')); }
catch (e) { ({ chromium } = requerir('playwright')); }

const BOLSA = `
<path d="M190 186V170c0-42 30-66 66-66s66 24 66 66v16" fill="none" stroke="#FFFFFF" stroke-width="15" stroke-linecap="round"/>
<path d="M346 182h6c8 0 13 5 14 13l12 178c1 9-5 16-14 16h-20z" fill="#E8D8BC"/>
<path d="M160 182h186c8 0 14 6 14 14l10 178c1 8-5 15-13 15H147c-8 0-14-7-13-15l12-178c1-8 6-14 14-14z" fill="#F7F0DD"/>
<path d="M192 338V236h30l34 60 34-60h30v102h-24v-62l-30 52h-20l-30-52v62z" fill="#D7191F"/>`;

const SANTA = `
<g transform="translate(146 50) rotate(-10 90 80)">
  <defs><linearGradient id="sr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF5A5F"/><stop offset="1" stop-color="#A80F1C"/></linearGradient></defs>
  <path d="M20 128C16 66 52 18 112 14c28-2 48 8 62 26-18-4-32 2-36 16-5 22-2 46 4 72z" fill="url(#sr)"/>
  <path d="M52 120c2-38 18-70 46-88" stroke="#7E0C19" stroke-width="8" fill="none" opacity=".35" stroke-linecap="round"/>
  <rect x="4" y="112" width="160" height="38" rx="19" fill="#FFFFFF"/>
  <g fill="#E3ECF7"><circle cx="30" cy="140" r="7"/><circle cx="74" cy="142" r="6"/><circle cx="118" cy="140" r="7"/><circle cx="150" cy="134" r="5"/></g>
  <circle cx="176" cy="44" r="22" fill="#FFFFFF"/><circle cx="170" cy="38" r="7" fill="#fff" opacity=".9"/><circle cx="182" cy="52" r="9" fill="#E3ECF7"/>
</g>`;

const BRUJA = `
<g transform="translate(112 34) rotate(-14 100 90)">
  <defs><linearGradient id="bp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9F7AEA"/><stop offset="1" stop-color="#3B0764"/></linearGradient></defs>
  <path d="M132 6c-14 4-24 16-28 34-8 34-24 64-54 92h116c-12-30-16-62-12-96 2-12 6-20 12-26-12 0-24 0-34-4z" fill="url(#bp)"/>
  <path d="M110 40c-6 30-18 58-36 80" stroke="#D6BCFA" stroke-width="7" fill="none" opacity=".35" stroke-linecap="round"/>
  <path d="M52 112h116l3 18H49z" fill="#FF7A18"/>
  <rect x="94" y="108" width="32" height="26" rx="4" fill="none" stroke="#FFD166" stroke-width="7"/>
  <ellipse cx="110" cy="146" rx="104" ry="22" fill="#2E1065"/>
  <ellipse cx="110" cy="140" rx="80" ry="9" fill="#6D28D9" opacity=".6"/>
</g>`;

const COPOS = [[70, 90, 14], [432, 120, 11], [404, 430, 13], [88, 420, 10], [460, 300, 8], [52, 250, 7]].map(([x, y, s]) => {
    let d = '';
    for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        d += `M${x} ${y}L${(x + s * Math.cos(a)).toFixed(1)} ${(y + s * Math.sin(a)).toFixed(1)}`;
    }
    return d;
}).join('');

const MURCIELAGO = 'M0 -1C-3 -6-8 -7-16 -4C-13 -2-12 1-12 3C-10 1-7 1-5 3C-4 1-2 1 0 3C2 1 4 1 5 3C7 1 10 1 12 3C12 1 13 -2 16 -4C8 -7 3 -6 0 -1ZM-2.2 -2-2.8 -6-1 -3.6H1L2.8 -6 2.2 -2Z';

const DISENOS = {
    navidad: `
<defs><radialGradient id="f" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="#E5383B"/><stop offset=".7" stop-color="#A50F1F"/><stop offset="1" stop-color="#6E0A15"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#f)"/>
<path d="${COPOS}" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" opacity=".55"/>
<path d="M0 452c60-20 120-16 180-4s140 16 200 0 100-16 132-6V512H0z" fill="#FFFFFF" opacity=".92"/>
${BOLSA}${SANTA}`,
    halloween: `
<defs><radialGradient id="f" cx=".5" cy=".95" r="1"><stop offset="0" stop-color="#FF7A18"/><stop offset=".45" stop-color="#7C2D9C"/><stop offset="1" stop-color="#1E0B36"/></radialGradient>
<radialGradient id="l" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF6D5"/><stop offset="1" stop-color="#FFE3A3"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#f)"/>
<circle cx="420" cy="92" r="46" fill="url(#l)" opacity=".9"/><circle cx="400" cy="80" r="40" fill="#1E0B36" opacity=".0"/>
<g fill="#12071F"><g transform="translate(76 96) scale(2.6)"><path d="${MURCIELAGO}"/></g><g transform="translate(130 60) scale(1.7)"><path d="${MURCIELAGO}"/></g><g transform="translate(444 196) scale(2)"><path d="${MURCIELAGO}"/></g></g>
${BOLSA}${BRUJA}`,
};

// Nombre del fichero → tamaño. Los mismos que el icono de siempre.
const SALIDAS = {
    'favicon-16.png': 16, 'favicon-32.png': 32, 'favicon-48.png': 48, 'favicon-96.png': 96,
    'favicon-192.png': 192, 'favicon-512.png': 512, 'icon-192.png': 192, 'icon-512.png': 512,
    'icon-maskable-192.png': 192, 'icon-maskable-512.png': 512, 'apple-touch-icon.png': 180,
};

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 512, height: 512 } });
for (const [tema, svg] of Object.entries(DISENOS)) {
    const dir = join(RAIZ, 'iconos', tema);
    await mkdir(dir, { recursive: true });
    await pag.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${svg}</svg></body></html>`);
    const base = join(dir, '_base.png');
    await writeFile(base, await pag.screenshot({ clip: { x: 0, y: 0, width: 512, height: 512 } }));
    // Reducir con Pillow (LANCZOS): el escalado del navegador deja la bolsa borrosa en 16/32 px.
    execFileSync('python3', ['-c', `
import sys, os
from PIL import Image
base = Image.open(sys.argv[1]).convert('RGB')
for nombre, lado in [x.split(':') for x in sys.argv[3:]]:
    base.resize((int(lado), int(lado)), Image.LANCZOS).save(os.path.join(sys.argv[2], nombre), optimize=True)
os.remove(sys.argv[1])
`, base, dir, ...Object.entries(SALIDAS).map(([n, l]) => `${n}:${l}`)]);
    console.log('✅', tema);
}
await nav.close();
