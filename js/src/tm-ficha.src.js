/* ============================================================
   TiendaMax — módulo: tm-ficha
   Parser de la "ficha ampliada": pasa el texto que escribe el admin a los
   campos que dibuja el modal (ficha, caracteristicas, idealPara, incluye).

   Vive aparte porque lo usan dos lugares y tenerlo duplicado era cuestión de
   tiempo: el formulario del admin (via el bundle) y el probador de fichas
   (scripts/ficha-probador.html, que carga este archivo suelto). Si las reglas
   divergen, lo que se prueba en el probador deja de ser lo que se guarda.
   ============================================================ */

// El admin escribe la ficha como texto, igual que la redacta para el catálogo.
// Acá se parte en los campos que dibuja el modal.
const _TM_FICHA_SECCIONES = [
    [/especificaciones\s+clave|ficha\s+t[eé]cnica|especificaciones/i, 'ficha'],
    [/caracter[ií]sticas/i, 'caracteristicas'],
    [/ideal\s+para/i, 'idealPara'],
    [/(incluye|contenido).*caja|qu[eé]\s+incluye|incluye/i, 'incluye']
];
const _TM_EMOJI_INI = /^((?:[\p{Extended_Pictographic}\u3030\u303d\ufe0f\u200d])+)\s*/u;

function _tmFichaLimpiar(t) {
    return String(t == null ? '' : t).replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, '')
        .replace(/\s+/g, ' ').trim();
}

// El paréntesis final del valor es una aclaración, no parte del dato:
// "2000W (lo que sostiene…)" -> valor 2000W + nota. Separarlo es lo que deja
// el valor comparable entre productos.
function _tmFichaPartirNota(v) {
    const m = _tmFichaLimpiar(v).match(/^(.*?)\s*\(\s*(?:nota\s*:\s*)?([^()]{4,})\)\s*\.?\s*$/i);
    if (m && m[1].trim()) return { v: m[1].trim(), nota: m[2].trim() };
    return { v: _tmFichaLimpiar(v), nota: '' };
}

function tmParsearFicha(texto) {
    const R = { ficha: [], caracteristicas: [], idealPara: [], incluye: [] };
    let sec = null;
    String(texto || '').split('\n').forEach(function (linea) {
        const l = _tmFichaLimpiar(linea);
        if (!l) return;
        // Un encabezado es una línea corta y sin dato propio ("⚙️ Ficha
        // Técnica"), no una que además trae valor ("Marca: Tataliken").
        const sinEmoji = l.replace(_TM_EMOJI_INI, '');
        const cab = _TM_FICHA_SECCIONES.find(function (par) { return par[0].test(sinEmoji); });
        if (cab && l.length < 48 && !/:\s*\S/.test(l.replace(/:\s*$/, ''))) {
            sec = cab[1];
            return;
        }
        if (!sec) return;
        if (sec === 'idealPara' || sec === 'incluye') {
            const t = l.replace(/^[-•*▪]\s*/, '');
            // "1x Manual de usuario." es una etiqueta de lo que trae la caja, no
            // una oración: el punto final sobra. En "Ideal para" sí son frases,
            // así que ahí se respeta.
            R[sec].push(sec === 'incluye' ? t.replace(/\s*\.\s*$/, '') : t);
            return;
        }
        const m = l.match(/^([^:]{2,46}):\s*(.+)$/);
        if (sec === 'caracteristicas') {
            // Acepta "Título: frase" y también la frase sola.
            if (m) R.caracteristicas.push({ t: m[1].trim(), d: _tmFichaLimpiar(m[2]) });
            else R.caracteristicas.push({ d: l });
            return;
        }
        if (!m) return;
        const par = _tmFichaPartirNota(m[2]);
        const fila = { k: m[1].trim(), v: par.v };
        if (par.nota) fila.nota = par.nota;
        R.ficha.push(fila);
    });
    return R;
}

