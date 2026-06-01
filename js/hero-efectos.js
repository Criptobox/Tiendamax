/* ════════════════════════════════════════════════════════
   TiendaMax · Efectos Premium del Hero (JS)
   1) Líneas diagonales animadas en el hero (canvas, se pausa
      automáticamente cuando el hero sale de pantalla).
   2) Efecto máquina de escribir en el título del hero.
   Autocontenido. No depende de otros scripts ni los modifica.
   ════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── 1. LÍNEAS DIAGONALES EN EL HERO ───────────────── */
    function initHeroLines() {
        if (reduceMotion) return;
        var hero = document.querySelector('.hero');
        if (!hero) return;
        if (document.getElementById('tmxHeroLines')) return;

        // .hero ya es position:relative en el CSS base, pero por si acaso:
        var cs = window.getComputedStyle(hero);
        if (cs.position === 'static') hero.style.position = 'relative';

        var canvas = document.createElement('canvas');
        canvas.id = 'tmxHeroLines';
        // insertar como primer hijo para quedar detrás del contenido
        hero.insertBefore(canvas, hero.firstChild);

        var ctx = canvas.getContext('2d');
        var W = 0, H = 0, lines = [], running = true, rafId = null;

        var ANGLE = -42 * Math.PI / 180;
        var DX = Math.cos(ANGLE), DY = Math.sin(ANGLE);
        var PX = -DY, PY = DX;          // dirección de avance (perpendicular)
        var SPD = 0.22, N = 20;

        function rnd(a, b) { return a + Math.random() * (b - a); }

        function makeLine() {
            var bright = Math.random() < 0.26;
            return {
                x: rnd(-W * 0.3, W * 1.3),
                y: rnd(-H * 0.3, H * 1.3),
                length: rnd(H * 0.6, H * 1.5),
                width: bright ? rnd(1.1, 2.4) : rnd(0.5, 1.2),
                speed: SPD * rnd(0.4, 1.7),
                opacity: bright ? rnd(0.18, 0.42) : rnd(0.04, 0.15),
                // acento dorado/coral del branding en algunas líneas
                tint: Math.random() < 0.2 ? '201,169,110,' : '255,255,255,',
                glow: bright
            };
        }

        function initLines() {
            lines = [];
            for (var i = 0; i < N; i++) lines.push(makeLine());
        }

        function resize() {
            var r = hero.getBoundingClientRect();
            W = canvas.width = Math.max(1, Math.round(r.width));
            H = canvas.height = Math.max(1, Math.round(r.height));
        }

        function draw(l) {
            var x2 = l.x + DX * l.length, y2 = l.y + DY * l.length;
            ctx.save();
            if (l.glow) {
                ctx.shadowColor = 'rgba(255,255,255,0.4)';
                ctx.shadowBlur = 10;
            }
            var g = ctx.createLinearGradient(l.x, l.y, x2, y2);
            g.addColorStop(0, 'rgba(' + l.tint + '0)');
            g.addColorStop(0.25, 'rgba(' + l.tint + l.opacity + ')');
            g.addColorStop(0.75, 'rgba(' + l.tint + l.opacity + ')');
            g.addColorStop(1, 'rgba(' + l.tint + '0)');
            ctx.beginPath();
            ctx.moveTo(l.x, l.y);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = g;
            ctx.lineWidth = l.width;
            ctx.stroke();
            ctx.restore();
        }

        function tick() {
            if (!running) return;
            ctx.clearRect(0, 0, W, H);
            for (var i = 0; i < lines.length; i++) {
                var l = lines[i];
                draw(l);
                l.x += PX * l.speed;
                l.y += PY * l.speed;
                var mx = l.x + DX * l.length * 0.5;
                var my = l.y + DY * l.length * 0.5;
                if (mx < -W * 0.5 || mx > W * 1.5 || my < -H * 0.5 || my > H * 1.5) {
                    var nl = makeLine();
                    nl.x = PX > 0 ? -W * 0.4 : W * 1.2;
                    nl.y = PY > 0 ? -H * 0.4 : H * 1.2;
                    lines[i] = nl;
                }
            }
            rafId = requestAnimationFrame(tick);
        }

        function start() {
            if (running && rafId) return;
            running = true;
            tick();
        }
        function stop() {
            running = false;
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        }

        resize();
        initLines();
        start();

        // Pausar cuando el hero no está visible (ahorra batería/CPU)
        if ('IntersectionObserver' in window) {
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (e.isIntersecting) start(); else stop();
                });
            }, { threshold: 0 });
            io.observe(hero);
        }

        // Pausar si la pestaña está oculta
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) stop(); else start();
        });

        var rt;
        window.addEventListener('resize', function () {
            clearTimeout(rt);
            rt = setTimeout(function () { resize(); initLines(); }, 150);
        });
    }

    /* ── 2. EFECTO MÁQUINA DE ESCRIBIR EN EL TÍTULO ─────── */
    function initTypewriter() {
        var h1 = document.querySelector('.hero-content h1');
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
        try { initHeroLines(); } catch (e) {}
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
