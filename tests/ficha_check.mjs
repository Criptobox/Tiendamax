/* La ficha ampliada, ida y vuelta — js/src/tm-ficha.src.js
 *
 * El admin edita la ficha como texto: `tmFichaATexto` la arma desde el
 * producto guardado y `tmParsearFicha` la vuelve a repartir en los cuatro
 * campos que dibuja el modal. Si las dos no encajan, el dueño abre un producto
 * para tocarle el precio y guarda una ficha distinta de la que tenía, sin que
 * nada falle ni avise.
 *
 * El caso que originó esto: "1x Ficha técnica del fabricante" es un renglón de
 * *Qué incluye*, pero el parser lo tomaba por encabezado (corto, sin dos
 * puntos, dice "ficha técnica"), cambiaba de sección y el renglón desaparecía.
 * El producto quedaba con una cosa menos en la caja.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({});
vm.runInContext(readFileSync(join(RAIZ, 'js/src/tm-ficha.src.js'), 'utf8'), ctx);
const { tmParsearFicha, tmFichaATexto } = ctx;

const fallos = [];
const mal = (m) => fallos.push(m);
const igual = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) mal(`${m}\n     esperaba ${JSON.stringify(b)}\n     obtuvo   ${JSON.stringify(a)}`); };

if (typeof tmFichaATexto !== 'function') mal('tmFichaATexto no existe: el modal de edición no puede cargar la ficha');

/* 1. Los encabezados de la plantilla del dueño se siguen reconociendo, con o
      sin emoji, con "Detallada"/"Principales" detrás y con los signos de
      "¿Qué incluye la caja?" delante. */
const PLANTILLA = [
    '📊 Especificaciones Clave', 'Marca: Tataliken', '',
    '⚙️ Ficha Técnica Detallada', 'Potencia: 4000W (pico)', '',
    '⚡ Características Principales', 'Protección: contra cortocircuito', 'Frase suelta sin título.', '',
    '🎯 Ideal Para', 'Respaldo del hogar.', '',
    '📦 ¿Qué incluye la caja?', '1x Inversor', '1x Ficha técnica del fabricante', '1x Manual de usuario.',
].join('\n');
const r = tmParsearFicha(PLANTILLA);
igual(r.ficha, [{ k: 'Marca', v: 'Tataliken' }, { k: 'Potencia', v: '4000W', nota: 'pico' }],
    'los encabezados de la plantilla no reparten la ficha');
igual(r.caracteristicas, [{ t: 'Protección', d: 'contra cortocircuito' }, { d: 'Frase suelta sin título.' }],
    'las características no se reparten');
igual(r.idealPara, ['Respaldo del hogar.'], 'Ideal Para no se reparte');
// El punto final se cae solo en "incluye": ahí son etiquetas, no oraciones.
igual(r.incluye, ['1x Inversor', '1x Ficha técnica del fabricante', '1x Manual de usuario'],
    'un renglón de la caja se perdió o cambió');

/* 2. Un renglón que empieza con el nombre de otra sección no es un encabezado. */
['1x Ficha técnica del fabricante', '2x Manual de características', '1x Guía Ideal Para principiantes']
    .forEach((linea) => {
        const p = tmParsearFicha(`📦 Qué incluye\n${linea}`);
        if (p.incluye.length !== 1) mal(`"${linea}" se tragó como encabezado en vez de quedar en la caja`);
    });

/* 3. Ida y vuelta sobre el catálogo real: ningún producto puede perder ni
      ganar renglones al abrirse en el editor, y una segunda pasada tiene que
      dar exactamente lo mismo que la primera (si no, cada guardado corre el
      dato un poco más). */
const catalogo = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));
const CAMPOS = ['ficha', 'caracteristicas', 'idealPara', 'incluye'];
let conFicha = 0;
for (const p of catalogo) {
    const texto = tmFichaATexto(p);
    if (!texto) continue;
    conFicha++;
    const vuelta = tmParsearFicha(texto);
    for (const k of CAMPOS) {
        const antes = (p[k] || []).length;
        if (vuelta[k].length !== antes) {
            mal(`${p.nombre.slice(0, 40)}: ${k} tenía ${antes} renglones y volvió con ${vuelta[k].length}`);
        }
    }
    const otra = tmParsearFicha(tmFichaATexto(vuelta));
    igual(otra, vuelta, `${p.nombre.slice(0, 40)}: la ficha cambia sola en cada guardado`);
}
if (conFicha < 100) mal(`solo ${conFicha} productos con ficha: la prueba no está mirando el catálogo real`);

/* 4. La nota se escribe explícita, para que un valor que ya traía paréntesis
      no se parta al volver. */
const nota = tmParsearFicha(tmFichaATexto({ ficha: [{ k: 'Voltaje', v: '12.8V', nota: 'carga máx 14.6V' }] }));
igual(nota.ficha, [{ k: 'Voltaje', v: '12.8V', nota: 'carga máx 14.6V' }], 'la nota no sobrevive la ida y vuelta');

if (fallos.length) {
    console.error(`\n❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach((f) => console.error(`   • ${f}`));
    process.exit(1);
}
console.log(`✅ ficha: ida y vuelta estable en ${conFicha} productos`);
