/* El catálogo real con un stock que no depende del día.
 *
 * hilo_check y comandos_check prueban cómo conversa Max —que tras enseñar
 * varios routers «cuánto cuesta» hable de esos, que un presupuesto deje de
 * filtrar al cambiar de tipo—, no qué hay hoy en el almacén. Con el
 * productos.json de verdad se pusieron rojos el día que WIFI se agotó entera:
 * no había routers que enseñar y ninguna conversación sobre routers podía
 * empezar. Nada del bot se había roto.
 *
 * Se conservan nombres, precios, fichas y categorías reales (es lo que el
 * bot lee para entender), y el stock se fija así: lo que tiene stock lo
 * conserva, y de lo agotado, uno de cada tres —por posición, para que sea
 * siempre el mismo— sigue agotado y los demás vuelven con 5. Quedan agotados
 * de sobra para los casos que los necesitan.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

export function catalogoEstable() {
    const crudo = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));
    const lista = crudo.productos || crudo;
    let agotados = 0;
    return lista.map(p => {
        if (Number(p.stock) > 0) return p;
        return (agotados++ % 3 === 0) ? p : { ...p, stock: 5 };
    });
}
