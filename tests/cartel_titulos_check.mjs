/**
 * Regresión del título y las features del cartel promo (js/admin-copilot.js).
 *
 * Estas dos cosas se rompieron dos veces seguidas en producción y son de lo
 * más visible que publica la tienda (el cartel es lo que se manda a WhatsApp
 * Estados y a los grupos de Facebook), así que quedan cubiertas:
 *
 *  - El título mostraba solo DOS palabras del nombre, no el nombre completo:
 *    "Switch Gigabit de 8 Puertos" salía "SWITCH PUERTOS" (sin el 8, que es
 *    justo lo que lo diferencia del de 5 puertos) y "Repetidor WiFi de Rango
 *    Extendido tp - Link" salía "REPETIDOR TP".
 *  - Las tarjetas de características metían la frase entera de la descripción
 *    como título y la tarjeta la cortaba a la mitad ("REPETIDOR WIFI DE…").
 *
 * Se corre solo (`node tests/cartel_titulos_check.mjs`) y desde unittest
 * (tests/test_cartel_titulos.py). Sale con código 1 si algo falla.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'js/admin-copilot.js'), 'utf8');
const PRODUCTOS = JSON.parse(readFileSync(join(ROOT, 'productos.json'), 'utf8'));

// Ancho útil de la columna de título y tamaño de fuente base de cada
// plantilla, sacados del CSS de admin-copilot.js (.tcp-title / .tcp2-title /
// .tcp3-title). Si el CSS cambia, estos números cambian con él.
const PLANTILLAS = [
  { nombre: 'clasico',    ancho: 471, font: (a, b) => api._cTitleFont(a, b) },
  { nombre: 'pro-v2',     ancho: 692, font: (a, b) => api._cTitleFontFit(a, b, 42, 26) },
  { nombre: 'horizontal', ancho: 616, font: (a, b) => api._cTitleFontFit(a, b, 36, 27) },
];
// Ancho medio de un carácter en mayúscula con peso 900, como fracción del
// tamaño de fuente. Aproximación deliberada: sirve para detectar desbordes
// gruesos, no para cuadrar el píxel exacto.
const ANCHO_CHAR = 0.58;

function extraer(re, que) {
  const m = SRC.match(re);
  if (!m) {
    throw new Error(
      `No se pudo extraer ${que} de js/admin-copilot.js. Si la renombraste o ` +
      `cambiaste su forma, actualiza el patrón en ${'tests/cartel_titulos_check.mjs'}.`
    );
  }
  return m[0];
}

const api = new Function(`
  ${extraer(/function _cStrip[\s\S]*?\n}/, '_cStrip')}
  ${extraer(/function _cClip[\s\S]*?\n}/, '_cClip')}
  ${extraer(/function _cNombreCartel[\s\S]*?\n}/, '_cNombreCartel')}
  ${extraer(/const _C_STOP_FIN = \[[^\]]*\];/, '_C_STOP_FIN')}
  ${extraer(/function _cSplitTitle[\s\S]*?\n}/, '_cSplitTitle')}
  ${extraer(/function _cTitleFontFit[\s\S]*?\n}/, '_cTitleFontFit')}
  ${extraer(/function _cTitleFont\(a,b\)\{[^}]*\}/, '_cTitleFont')}
  ${extraer(/function _cFirstSentence[\s\S]*?\n}/, '_cFirstSentence')}
  ${extraer(/const _C_ETIQUETAS = \[[\s\S]*?\n\];/, '_C_ETIQUETAS')}
  ${extraer(/const _C_ETIQUETA_MAX = \d+;/, '_C_ETIQUETA_MAX')}
  ${extraer(/function _cEtiquetaCorta[\s\S]*?\n}/, '_cEtiquetaCorta')}
  ${extraer(/function _cEtiquetaFrase[\s\S]*?\n}/, '_cEtiquetaFrase')}
  ${extraer(/function _cFeatures[\s\S]*?\n  return out;\n}/, '_cFeatures')}
  return { _cNombreCartel, _cSplitTitle, _cTitleFont, _cTitleFontFit, _cFeatures, _C_STOP_FIN };
`)();

const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };

// ── 1. Casos concretos que se rompieron y no deben volver a romperse ──────
const CASOS = [
  // [nombre en el catálogo, trozos que el título TIENE que contener]
  ['​🌐 Switch Gigabit de 8 Puertos',                 ['SWITCH', 'GIGABIT', '8', 'PUERTOS']],
  ['Repetidor WiFi de Rango Extendido tp - Link',    ['REPETIDOR', 'TP-LINK']],
  ['Router WiFi Inalámbrico d - Link Avanzado de Doble Banda', ['D-LINK']],
  ['🛜 Router Wi-fi 6 AX1800 Asus RT-AX1800S',       ['AX1800', 'ASUS']],
  ['🛜 Router Wi-fi 6 AX3000 Tp-link Archer AX55',   ['AX3000', 'ARCHER', 'AX55']],
];
for (const [nombre, trozos] of CASOS) {
  const titulo = api._cSplitTitle(nombre).join(' ');
  for (const t of trozos) {
    check(titulo.split(/\s+/).includes(t) || titulo.includes(t),
      `El título de "${nombre}" perdió "${t}" — salió "${titulo}"`);
  }
}

// Dos productos distintos no pueden generar el mismo título (era el bug
// original: dos routers de $150, de marcas distintas, con cartel idéntico).
{
  const a = api._cSplitTitle('🛜 Router Wi-fi 6 AX1800 Asus RT-AX1800S').join(' ');
  const b = api._cSplitTitle('🛜 Router Wi-fi 6 AX3000 Tp-link Archer AX55').join(' ');
  check(a !== b, `Dos routers distintos generan el mismo título: "${a}"`);
}

// ── 2. Sobre el catálogo real: el título muestra el nombre COMPLETO ───────
for (const p of PRODUCTOS) {
  const [l1, l2] = api._cSplitTitle(p.nombre);
  const completo = api._cNombreCartel(p.nombre).trim();
  const mostrado = `${l1} ${l2}`.trim();

  check(mostrado === completo,
    `Título incompleto en ${p.id}: se muestra "${mostrado}" y el nombre es "${completo}"`);
  check(!l1.trim().endsWith('-') && !l2.trim().endsWith('-'),
    `Título de ${p.id} deja un guion colgando: "${l1} / ${l2}"`);
  check(!api._C_STOP_FIN.includes(l1.split(' ').pop()),
    `Título de ${p.id} corta después de una preposición: "${l1} / ${l2}"`);

  for (const pl of PLANTILLAS) {
    const font = pl.font(l1, l2);
    const px = Math.max(l1.length, l2.length) * ANCHO_CHAR * font;
    check(px <= pl.ancho,
      `Título de ${p.id} desborda en plantilla ${pl.nombre}: ~${Math.round(px)}px de ${pl.ancho}px ("${l1} / ${l2}")`);
  }
}

// ── 3. Las tarjetas de características no salen cortadas a la mitad ───────
// El título de la tarjeta es una etiqueta corta; el texto largo va en el
// detalle, que es donde hay ancho para leerlo.
const MAX_TITULO_FEATURE = 20;   // la plantilla horizontal recorta en 20 (_cClip(f.title,20))
for (const p of PRODUCTOS) {
  const feats = api._cFeatures(p.descripcion, p.specs).slice(0, 4);
  check(feats.length > 0, `El producto ${p.id} ("${p.nombre}") no genera ninguna característica`);
  for (const f of feats) {
    check(!/…$/.test(f.title),
      `Característica de ${p.id} con el título ya cortado en origen: "${f.title}"`);
    check(f.title.length <= MAX_TITULO_FEATURE,
      `Característica de ${p.id} con título de ${f.title.length} caracteres (la tarjeta corta en ${MAX_TITULO_FEATURE}): "${f.title}"`);
  }
}

if (fallos.length) {
  console.error(`❌ ${fallos.length} fallo(s) en el cartel:\n` + fallos.map(f => '  · ' + f).join('\n'));
  process.exit(1);
}
console.log(`✅ Cartel OK — título y características verificados sobre ${PRODUCTOS.length} productos.`);
