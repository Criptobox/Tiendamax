/* ============================================================
 * event-delegation.js  —  v2
 * Delegador único de eventos en sustitución de los onclick inline.
 *
 * Atributos soportados:
 *   data-action="abrirCarrito"
 *       → llama window.abrirCarrito()
 *
 *   data-action="abrirCarrito" data-arg="Todas"
 *       → llama window.abrirCarrito("Todas")
 *
 *   data-action="volverAlInicio,cerrarMenuMovil"
 *       → llama varias funciones en orden, separadas por coma
 *
 *   data-pass-element="true"  (en el mismo elemento)
 *       → la función recibe el elemento DOM como argumento (sustituye a `this`)
 *
 *   data-stop-propagation="true"
 *       → equivalente a onclick="event.stopPropagation()"
 *
 *   data-prevent-default="true"
 *       → equivalente a return false / preventDefault().
 *       Por defecto los <a data-action> ya hacen preventDefault automáticamente.
 *
 *   data-backdrop-close="cerrarCarrito"
 *       → si se hace clic en el propio elemento (no en un hijo), llama a la función.
 *         Equivale a onclick="if(event.target===this) cerrarCarrito()".
 *
 * Cargar SIEMPRE después de script.js, subcategorias.js y revolico_integration.js.
 * ============================================================ */
(function () {
    'use strict';

    function callFn(name, arg, el) {
        var fn = window[name];
        if (typeof fn !== 'function') {
            console.warn('[event-delegation] Acción desconocida:', name);
            return;
        }
        try {
            var passEl = el && el.getAttribute('data-pass-element') === 'true';
            if (passEl) {
                fn(el);
            } else if (arg === undefined || arg === null || arg === '') {
                fn();
            } else if (/^-?\d+(\.\d+)?$/.test(arg)) {
                fn(Number(arg));
            } else {
                fn(arg);
            }
        } catch (err) {
            console.error('[event-delegation] Error en', name, err);
        }
    }

    function dispatch(actionStr, arg, el) {
        // Soporte multi-acción separada por coma
        var actions = actionStr.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        actions.forEach(function (a) { callFn(a, arg, el); });
    }

    document.addEventListener('click', function (evt) {
        // 1) Backdrop close: clic directo sobre el elemento (no sobre un hijo)
        var backdrop = evt.target.closest('[data-backdrop-close]');
        if (backdrop && evt.target === backdrop) {
            var fnName = backdrop.getAttribute('data-backdrop-close');
            callFn(fnName, null, backdrop);
            // No return: el evento puede tener además data-action propio (raro)
        }

        // 2) Acción principal
        var el = evt.target.closest('[data-action]');
        if (!el) return;

        // Si todavía tiene onclick inline, cedemos: el onclick ya corrió.
        if (el.hasAttribute('onclick')) return;

        if (el.getAttribute('data-stop-propagation') === 'true') {
            evt.stopPropagation();
        }

        // Por defecto, <a> con data-action evita la navegación a "#"
        var isAnchor = el.tagName === 'A';
        var prevent  = el.getAttribute('data-prevent-default') === 'true' || isAnchor;
        if (prevent) evt.preventDefault();

        dispatch(el.getAttribute('data-action'),
                 el.getAttribute('data-arg'),
                 el);
    }, false);

    // Soporte teclado: Enter / Espacio para elementos no-interactivos
    document.addEventListener('keydown', function (evt) {
        if (evt.key !== 'Enter' && evt.key !== ' ') return;
        var el = evt.target.closest('[data-action]');
        if (!el) return;
        if (el.tagName === 'BUTTON' || el.tagName === 'A') return;
        if (el.hasAttribute('onclick')) return;
        evt.preventDefault();
        dispatch(el.getAttribute('data-action'),
                 el.getAttribute('data-arg'),
                 el);
    }, false);

    // Para inputs con data-stop-propagation, también detener en click directo del input
    document.addEventListener('click', function (evt) {
        var inp = evt.target.closest('input[data-stop-propagation="true"]');
        if (inp) evt.stopPropagation();
    }, true); // capture para llegar antes que otros listeners

    // Diagnóstico
    document.addEventListener('DOMContentLoaded', function () {
        var legacy   = document.querySelectorAll('[onclick]').length;
        var migrated = document.querySelectorAll('[data-action]').length;
        console.info('[event-delegation v2] data-action: ' + migrated +
                     ' · onclick legacy: ' + legacy);
    });
})();
