/* ════════════════════════════════════════════════════════
   TiendaMax · Efectos Premium del Hero (JS)
   Efecto máquina de escribir en el título del hero.
   Autocontenido. No depende de otros scripts ni los modifica.
   ════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── EFECTO MÁQUINA DE ESCRIBIR EN EL TÍTULO ─────── */
    function initTypewriter() {
        var h1 = document.querySelector('.hero-content h1, .hero-content-full h1');
        if (!h1 || h1.dataset.tmxTyped) return;
        h1.dataset.tmxTyped = '1';

        // El sitio aplica un reveal "tm-fade" (opacity:0 hasta verse) al h1.
        // El typewriter ES la animación de entrada, así que forzamos el h1
        // visible para que no compita con el fade.
        h1.classList.remove('tm-fade');
        h1.classList.add('tm-visible');
        h1.style.opacity = '1';
        h1.style.transform = 'none';

        // Reconstruir el contenido como segmentos, respetando <br> y <span>
        // Estructura esperada: texto <br> <span>...</span> <br> texto
        var segments = [];
        h1.childNodes.forEach(function (node) {
            if (node.nodeType === 3) { // texto
                segments.push({ type: 'text', text: node.textContent });
            } else if (node.nodeName === 'BR') {
                segments.push({ type: 'br' });
            } else if (node.nodeName === 'SPAN') {
                segments.push({ type: 'span', text: node.textContent });
            }
        });

        if (reduceMotion) return; // deja el título tal cual, sin animar

        // Texto plano total para escribir caracter a caracter
        // Guardamos un mapa de a qué segmento pertenece cada caracter.
        var plan = [];
        segments.forEach(function (seg, si) {
            if (seg.type === 'br') {
                plan.push({ kind: 'br', seg: si });
            } else {
                for (var c = 0; c < seg.text.length; c++) {
                    plan.push({ kind: 'char', ch: seg.text[c], type: seg.type, seg: si });
                }
            }
        });

        // Limpiar el h1 y preparar contenedores por segmento
        h1.classList.add('tmx-typing');
        h1.textContent = '';
        var holders = {};
        segments.forEach(function (seg, si) {
            if (seg.type === 'br') {
                h1.appendChild(document.createElement('br'));
            } else if (seg.type === 'span') {
                var sp = document.createElement('span');
                holders[si] = sp;
                h1.appendChild(sp);
            } else {
                var tn = document.createElement('span');
                tn.style.color = 'inherit';
                holders[si] = tn;
                h1.appendChild(tn);
            }
        });

        // Cursor
        var cursor = document.createElement('span');
        cursor.className = 'tmx-type-cursor';
        h1.appendChild(cursor);

        var i = 0, SPEED = 42;
        function step() {
            // saltar marcas de br (ya están en el DOM)
            while (i < plan.length && plan[i].kind === 'br') i++;
            if (i >= plan.length) {
                cursor.classList.add('tmx-done');
                return;
            }
            var item = plan[i];
            var holder = holders[item.seg];
            if (holder) {
                holder.textContent += item.ch;
                // mover el cursor justo después del segmento que se escribe
                if (cursor.previousSibling !== holder && holder.nextSibling !== cursor) {
                    if (holder.nextSibling) {
                        holder.parentNode.insertBefore(cursor, holder.nextSibling);
                    } else {
                        holder.parentNode.appendChild(cursor);
                    }
                }
            }
            i++;
            var pause = (item.ch === ',' || item.ch === '.') ? SPEED + 120 : SPEED;
            setTimeout(step, pause);
        }
        setTimeout(step, 350);
    }

    /* ── Arranque ───────────────────────────────────────── */
    function boot() {
        // Pequeño retraso para correr DESPUÉS del script de reveal del sitio,
        // que añade la clase tm-fade al h1 en DOMContentLoaded.
        setTimeout(function () {
            try { initTypewriter(); } catch (e) {}
        }, 60);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
