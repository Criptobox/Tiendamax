/**
 * Revisa lo que el cartel promo va a PUBLICAR de cada producto, buscando
 * contradicciones dentro de los propios datos del catálogo.
 *
 *     node scripts/revisar-catalogo.mjs
 *
 * Para qué sirve: el generador de carteles solo muestra texto que ya está en
 * productos.json (eso lo garantiza tests/cartel_titulos_check.mjs), así que
 * nunca inventa nada. Pero si la ficha de un producto está mal escrita, el
 * cartel publica el error igual de fiel. Esto busca justo eso.
 *
 * Qué comprueba, todo verificable sin salir del repositorio:
 *   - el código de modelo del nombre (AX3000, AC1200) contra las velocidades
 *     que se publican, admitiendo el redondeo del fabricante
 *   - que la suma de las bandas cuadre con el total declarado
 *   - cantidades del nombre que el cartel contradice ("8 Puertos" vs 5)
 *   - amperaje y potencia del nombre contra lo publicado
 *   - Wi-Fi 6 = 802.11ax y Wi-Fi 5 = 802.11ac
 *
 * Lo que NO puede comprobar: si un dato es cierto en el mundo real. Para eso
 * hace falta la ficha del fabricante. Esto solo detecta que el catálogo se
 * contradice a sí mismo, que es la mayoría de los errores de captura.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'js/admin-copilot.js'), 'utf8');
const PRODUCTOS = JSON.parse(readFileSync(join(ROOT, 'productos.json'), 'utf8'));

// Se reusa el generador real, no una copia: así lo que se revisa es
// exactamente lo que se publica.
const g = re => {
  const m = SRC.match(re);
  if (!m) throw new Error(`No se pudo extraer ${re} de js/admin-copilot.js`);
  return m[0];
};
const api = new Function([
  g(/function _cStrip[\s\S]*?\n}/), g(/function _cClip[\s\S]*?\n}/),
  g(/function _cFirstSentence[\s\S]*?\n}/), g(/const _C_ETIQUETAS = \[[\s\S]*?\n\];/),
  g(/const _C_ETIQUETA_MAX = \d+;/), g(/function _cEtiquetaCorta[\s\S]*?\n}/),
  g(/function _cEtiquetaFrase[\s\S]*?\n}/), g(/const _C_MIN_ANTES_DE_CORTAR = \d+;/),
  g(/const _C_RELLENO = [\s\S]*?;\n/), g(/function _cResumirDetalle[\s\S]*?\n}/),
  g(/function _cFeatures[\s\S]*?\n  return out;\n}/),
].join('\n') + '; return {_cFeatures};')();

const avisos = [];
const avisar = (p, tipo, msg) => avisos.push({ id: p.id, nombre: p.nombre, tipo, msg });

for (const p of PRODUCTOS) {
  // Solo lo que ACABA en el cartel: título (nombre) + las 4 características.
  const feats = api._cFeatures(p.descripcion, p.specs, 92).slice(0, 4);
  const publicado = feats.map(f => `${f.title}: ${f.desc}`).join(' | ');
  const nombre = String(p.nombre || '').replace(/​/g, '');
  const todo = `${nombre} ${publicado}`;

  // 1. Código de modelo (AX3000 / AC1200) contra la velocidad que se publica.
  // "10/100/1000 Mbps" es la notación de un puerto Ethernet (WAN/LAN), no
  // una banda Wi-Fi — sin excluirla, un router con esa frase en las specs
  // (casi todos) sumaba un falso "1000 Mbps" de más y disparaba un aviso
  // que no era real.
  const modelo = nombre.match(/\b(?:AX|AC)\s?(\d{3,4})\b/i);
  if (modelo) {
    const declarado = Number(modelo[1]);
    const sinPuertoEthernet = publicado.replace(/\b(?:10\/100\/1000|10\/100)\s*Mbps\b/gi, '');
    const mbps = [...sinPuertoEthernet.matchAll(/(\d{3,5})\s*Mbps/gi)].map(m => Number(m[1]));
    // AC1200 = 867 + 300 = 1167: el número del modelo es la suma de las
    // bandas redondeada hacia arriba por el fabricante. Se acepta que
    // cuadre una banda suelta O la suma, con el margen de ese redondeo.
    const suma = mbps.reduce((a, b) => a + b, 0);
    const cuadra = v => Math.abs(v - declarado) <= Math.max(60, declarado * 0.08);
    if (mbps.length && !mbps.some(cuadra) && !cuadra(suma)) {
      avisar(p, 'modelo-vs-velocidad',
        `el nombre dice ${modelo[0]} pero en el cartel se publica ${mbps.join('/')} Mbps (suma ${suma})`);
    }
  }

  // 2. Suma de bandas contra el total declarado, dentro del mismo texto.
  for (const m of publicado.matchAll(/(\d{3,5})\s*Mbps[^.|]*?\((\d{3,4})[^)]*?\+\s*(\d{3,4})[^)]*\)/gi)) {
    const [tot, a, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (Math.abs(a + b - tot) > Math.max(60, tot * 0.06)) {
      avisar(p, 'suma-de-bandas', `dice ${tot} Mbps pero ${a}+${b}=${a + b}`);
    }
  }

  // 3. Cantidades del nombre que el cartel contradice ("8 Puertos" vs "5 puertos").
  for (const m of nombre.matchAll(/\b(\d{1,2})\s+(puertos?|antenas?|canales?|c[áa]maras?|cabezales?)/gi)) {
    const n = Number(m[1]), cosa = m[2].toLowerCase().replace(/s$/, '');
    const re = new RegExp(`\\b(\\d{1,2})\\s+${cosa}`, 'gi');
    for (const q of publicado.matchAll(re)) {
      if (Number(q[1]) !== n) avisar(p, 'cantidad-contradictoria',
        `el nombre dice ${n} ${cosa}(s) y el cartel publica ${q[1]}`);
    }
  }

  // 4. Amperaje / potencia del nombre contra lo publicado.
  const amp = nombre.match(/\b(\d{2,4})\s?A\b/);
  if (amp) {
    const otros = [...publicado.matchAll(/\b(\d{2,4})\s?A\b/g)].map(m => Number(m[1]));
    if (otros.length && !otros.includes(Number(amp[1]))) {
      avisar(p, 'amperaje', `el nombre dice ${amp[1]}A y el cartel publica ${otros.join('/')}A`);
    }
  }
  const w = nombre.match(/\b(\d{3,5})\s?W\b/i);
  if (w) {
    const otros = [...publicado.matchAll(/\b(\d{3,5})\s?W\b/gi)].map(m => Number(m[1]));
    if (otros.length && !otros.includes(Number(w[1]))) {
      avisar(p, 'potencia', `el nombre dice ${w[1]}W y el cartel publica ${otros.join('/')}W`);
    }
  }

  // 5. Wi-Fi 6 es 802.11ax y Wi-Fi 5 es 802.11ac (dato fijo, no opinable).
  if (/wi-?fi\s*6\b/i.test(todo) && /802\.11\s*ac\b/i.test(todo) && !/802\.11\s*ax/i.test(todo)) {
    avisar(p, 'estandar-wifi', 'dice Wi-Fi 6 pero el estándar publicado es 802.11ac (Wi-Fi 6 es 802.11ax)');
  }
  if (/wi-?fi\s*5\b/i.test(todo) && /802\.11\s*ax\b/i.test(todo)) {
    avisar(p, 'estandar-wifi', 'dice Wi-Fi 5 pero el estándar publicado es 802.11ac, no ax');
  }
}

if (!avisos.length) {
  console.log(`Sin contradicciones detectables en lo que publican los ${PRODUCTOS.length} productos.`);
} else {
  console.log(`${avisos.length} aviso(s) sobre ${PRODUCTOS.length} productos — revisar a mano:\n`);
  for (const a of avisos) console.log(`[${a.tipo}] ${a.nombre}\n    ${a.msg}\n    id=${a.id}\n`);
}
