/* Caducidad de los avisos push ya mostrados — firebase-messaging-sw.js
 *
 * Un push de la web no desaparece solo: se queda en la bandeja del teléfono
 * hasta que alguien lo aparta, y lleva el texto congelado del momento en que se
 * mandó. Un "🏷️ 4 productos rebajados" de la mañana seguía puesto por la noche,
 * con uno de los cuatro ya agotado.
 *
 * Lo que se prueba aquí no lanza excepciones si se rompe: simplemente el aviso
 * se queda, o —peor— se borra uno que no tocaba. El fallo caro es el segundo:
 * los recordatorios del dueño (tag admin-*) llegan a su propio teléfono, y
 * cerrarlos porque abrió la tienda le haría perder avisos de trabajo.
 *
 * Se evalúa el código de verdad del service worker, no se buscan cadenas: hay
 * dos funciones parecidas —una borra por edad y la otra borra todas las de la
 * tienda— y confundirlas es exactamente el error que nadie vería.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RAIZ, 'firebase-messaging-sw.js'), 'utf8');

// Solo el bloque de caducidad: el resto del archivo hace importScripts de
// Firebase, que aquí no existe.
const desde = src.indexOf('const MAX_EDAD_MS');
const hasta = src.indexOf('// ── Recibir mensajes');
if (desde < 0 || hasta < 0 || hasta < desde) {
    console.error('!! no encuentro el bloque de caducidad en firebase-messaging-sw.js');
    process.exit(1);
}

let abiertas = [];
const sb = {
    self: { registration: { getNotifications: async () => abiertas.slice() } },
    Date,
    console,
};
sb.globalThis = sb;
vm.createContext(sb);
// El `const` de nivel superior NO se convierte en propiedad del objeto global
// —el mismo detalle que hace que `window.productos` sea undefined en el bundle—,
// así que se saca a mano.
vm.runInContext(src.slice(desde, hasta) + '\nglobalThis.__maxEdad = MAX_EDAD_MS;', sb);

const HORA = 60 * 60 * 1000;
function aviso(tag, hace) {
    return { tag, data: { fechaRecibida: Date.now() - hace }, cerrada: false,
             close() { this.cerrada = true; } };
}

let fallos = 0;
function comprobar(nombre, ok) {
    if (!ok) { console.error(`!! ${nombre}`); fallos++; }
    else console.log(`   ok — ${nombre}`);
}

// ── Por edad: llega otro push y se barre lo caducado ───────────────
{
    const viejo   = aviso('tiendamax', 9 * HORA);
    const reciente = aviso('tiendamax', 1 * HORA);
    const delDueno = aviso('admin-alert', 30 * HORA);
    abiertas = [viejo, reciente, delDueno];
    await sb.cerrarAvisosViejos();
    comprobar('el aviso de hace 9 h se cierra', viejo.cerrada);
    comprobar('el de hace 1 h se queda', !reciente.cerrada);
    comprobar('el del dueño no se toca aunque sea el más viejo', !delDueno.cerrada);
}

// ── Sin fecha: no se puede saber la edad, así que no se toca ────────
{
    const sinFecha = { tag: 'tiendamax', data: {}, cerrada: false,
                       close() { this.cerrada = true; } };
    abiertas = [sinFecha];
    await sb.cerrarAvisosViejos();
    comprobar('un aviso sin fecha no se cierra a ciegas', !sinFecha.cerrada);
}

// ── El cliente abrió la tienda: los de la tienda sobran ─────────────
{
    const a = aviso('tiendamax', 1 * HORA);
    const b = aviso('rebajas', 1);
    const delDueno = aviso('admin-recordatorio', 1);
    abiertas = [a, b, delDueno];
    await sb.cerrarAvisosDeLaTienda();
    comprobar('al abrir la tienda se cierran sus avisos, sin mirar la edad',
              a.cerrada && b.cerrada);
    comprobar('los recordatorios del dueño sobreviven a que abra la tienda',
              !delDueno.cerrada);
}

// ── Un aviso sin tag es de la tienda (el tag por defecto lo pone el SW) ──
{
    const suelto = { data: { fechaRecibida: Date.now() }, cerrada: false,
                     close() { this.cerrada = true; } };
    abiertas = [suelto];
    await sb.cerrarAvisosDeLaTienda();
    comprobar('un aviso sin tag cuenta como de la tienda', suelto.cerrada);
}

// ── El caso que motivó todo: 8 h es el techo ───────────────────────
{
    comprobar('el techo de edad es de horas, no de días',
              sb.__maxEdad > 0 && sb.__maxEdad <= 12 * HORA);
}

if (fallos) { console.error(`\n${fallos} comprobación(es) fallida(s)`); process.exit(1); }
console.log('\nTodo correcto.');
