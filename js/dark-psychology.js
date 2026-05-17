/**
 * TiendaMax — dark-psychology.js
 * =========================================================
 * Agrega al final de index.html, ANTES del </body>:
 *   <script src="js/dark-psychology.js?v=1"></script>
 *
 * Incluye:
 *  1. Notificaciones de compra en vivo (toast esquina inferior izquierda)
 *  2. Pop-up de salida (exit intent — desktop: mouse al tope, mobile: 45s)
 *  3. WhatsApp pre-llenado con nombre del producto desde el carrito
 *  4. Productos relacionados dentro del carrito (upsell)
 * =========================================================
 */
(function () {
  'use strict';

  // ─── CSS GLOBAL ───────────────────────────────────────────
  const css = document.createElement('style');
  css.textContent = `
    /* Animaciones compartidas */
    @keyframes tm-slideIn  { from { transform: translateX(-120%); opacity:0; } to { transform: translateX(0); opacity:1; } }
    @keyframes tm-slideOut { from { transform: translateX(0); opacity:1; } to { transform: translateX(-120%); opacity:0; } }
    @keyframes tm-fadeIn   { from { opacity:0; transform:scale(.95); } to { opacity:1; transform:scale(1); } }
    @keyframes tm-fadeOut  { from { opacity:1; transform:scale(1);   } to { opacity:0; transform:scale(.95); } }
    @keyframes tm-pulse    { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }

    /* Toast notificación */
    #tm-notif-wrap {
      position: fixed;
      bottom: 80px;
      left: 12px;
      z-index: 99990;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .tm-toast {
      background: #fff;
      border-left: 4px solid #25D366;
      border-radius: 14px;
      padding: 11px 14px;
      box-shadow: 0 6px 24px rgba(0,0,0,.18);
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 272px;
      pointer-events: auto;
      animation: tm-slideIn .35s ease;
      font-family: inherit;
    }
    .tm-toast-icon { font-size: 26px; line-height: 1; flex-shrink: 0; }
    .tm-toast-name { font-weight: 700; font-size: 13px; color: #111; }
    .tm-toast-item { font-size: 12px; color: #444; margin-top: 2px; }
    .tm-toast-time { font-size: 11px; color: #aaa; margin-top: 2px; }

    /* Exit popup overlay */
    #tm-exit-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.72);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: tm-fadeIn .3s ease;
    }
    #tm-exit-box {
      background: #fff;
      border-radius: 22px;
      padding: 34px 26px 26px;
      max-width: 360px;
      width: 100%;
      text-align: center;
      position: relative;
      box-shadow: 0 24px 64px rgba(0,0,0,.42);
    }
    #tm-exit-close {
      position: absolute;
      top: 14px; right: 16px;
      background: none; border: none;
      font-size: 24px; cursor: pointer; color: #bbb;
      line-height: 1; padding: 0;
    }
    #tm-exit-close:hover { color: #555; }
    #tm-exit-emoji { font-size: 52px; margin-bottom: 6px; }
    #tm-exit-title {
      font-size: 20px; font-weight: 900; color: #111;
      margin: 0 0 8px; line-height: 1.2;
    }
    #tm-exit-desc {
      font-size: 13.5px; color: #555;
      margin: 0 0 18px; line-height: 1.55;
    }
    #tm-exit-badge {
      background: #fff8f2;
      border: 2px solid #FF6B35;
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 18px;
    }
    #tm-exit-badge-label  { font-size: 12px; color: #aaa; text-decoration: line-through; }
    #tm-exit-badge-valor  { font-size: 21px; font-weight: 900; color: #FF6B35; margin-top: 2px; animation: tm-pulse 1.6s ease infinite; }
    #tm-exit-badge-sub    { font-size: 11.5px; color: #777; margin-top: 4px; }
    #tm-exit-cta {
      display: block;
      background: linear-gradient(135deg, #25D366, #1ebe5a);
      color: #fff; text-decoration: none;
      padding: 15px; border-radius: 14px;
      font-weight: 800; font-size: 15px;
      margin-bottom: 10px;
      box-shadow: 0 4px 16px rgba(37,211,102,.35);
      transition: transform .15s;
    }
    #tm-exit-cta:hover { transform: translateY(-1px); }
    #tm-exit-decline {
      background: none; border: none;
      color: #bbb; font-size: 11.5px;
      cursor: pointer; text-decoration: underline;
    }

    /* Relacionados en carrito */
    #tm-related {
      border-top: 1px solid #eee;
      padding: 14px 16px 6px;
    }
    #tm-related-title {
      font-weight: 700; font-size: 13px;
      color: #111; margin-bottom: 10px;
    }
    .tm-rel-item {
      display: flex; align-items: center;
      gap: 10px; cursor: pointer;
      padding: 8px 10px; border-radius: 12px;
      background: #f7f7f7; margin-bottom: 8px;
      transition: background .18s;
    }
    .tm-rel-item:hover { background: #efefef; }
    .tm-rel-img {
      width: 48px; height: 48px;
      object-fit: cover; border-radius: 8px;
      background: #e0e0e0; flex-shrink: 0;
    }
    .tm-rel-info { flex: 1; min-width: 0; }
    .tm-rel-nombre {
      font-size: 12px; font-weight: 600; color: #111;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .tm-rel-precio { font-size: 13px; font-weight: 800; color: #FF6B35; margin-top: 2px; }
    .tm-rel-ver { font-size: 11px; color: #25D366; font-weight: 700; flex-shrink: 0; }
  `;
  document.head.appendChild(css);


  // ══════════════════════════════════════════════════════════
  // 1. NOTIFICACIONES DE COMPRA EN VIVO
  // ══════════════════════════════════════════════════════════
  const COMPRADORES = [
    { n: 'Carlos R.', c: 'La Habana'         },
    { n: 'María G.', c: 'Santiago de Cuba'   },
    { n: 'Luis M.',  c: 'Camagüey'           },
    { n: 'Ana P.',   c: 'Holguín'            },
    { n: 'Roberto S.', c: 'Santa Clara'      },
    { n: 'Yolanda T.', c: 'Matanzas'         },
    { n: 'Pedro F.', c: 'Cienfuegos'         },
    { n: 'Isabel V.', c: 'Pinar del Río'     },
    { n: 'Miguel A.', c: 'Guantánamo'        },
    { n: 'Diana C.', c: 'Las Tunas'          },
  ];

  // Productos de respaldo si aún no hay productos cargados
  const PRODUCTOS_FALLBACK = [
    'Inversor 1000W', 'Router WiFi', 'Panel Solar 200W',
    'Ventilador 3 velocidades', 'TV 32" Smart', 'Lavadora 7kg',
    'Auriculares Bluetooth', 'Cámara IP WiFi', 'Batería 200Ah',
  ];

  const TIEMPOS = ['hace 2 min', 'hace 4 min', 'hace 7 min', 'hace 11 min',
                   'hace 15 min', 'hace 20 min', 'hace 25 min'];

  const wrap = document.createElement('div');
  wrap.id = 'tm-notif-wrap';
  document.body.appendChild(wrap);

  let _toastIdx = 0;

  function _productName() {
    const pool = (window.productos && window.productos.length)
      ? window.productos.map(p => p.nombre || p.name).filter(Boolean)
      : PRODUCTOS_FALLBACK;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function mostrarToast() {
    const who  = COMPRADORES[_toastIdx % COMPRADORES.length];
    const prod = _productName();
    const when = TIEMPOS[Math.floor(Math.random() * TIEMPOS.length)];
    _toastIdx++;

    const el = document.createElement('div');
    el.className = 'tm-toast';
    el.innerHTML = `
      <div class="tm-toast-icon">🛒</div>
      <div>
        <div class="tm-toast-name">${who.n} · ${who.c}</div>
        <div class="tm-toast-item">compró <strong>${prod}</strong></div>
        <div class="tm-toast-time">${when}</div>
      </div>`;
    wrap.appendChild(el);

    // Auto-ocultar a los 4.5 s
    setTimeout(() => {
      el.style.animation = 'tm-slideOut .3s ease forwards';
      setTimeout(() => el.remove(), 320);
    }, 4500);
  }

  // Primera notif a los 10 s, luego cada 35–55 s aleatoriamente
  setTimeout(function loop() {
    mostrarToast();
    setTimeout(loop, 35000 + Math.random() * 20000);
  }, 10000);


  // ══════════════════════════════════════════════════════════
  // 2. POP-UP DE SALIDA (EXIT INTENT)
  // ══════════════════════════════════════════════════════════
  let _exitShown = false;

  function mostrarExitPopup() {
    if (_exitShown) return;
    _exitShown = true;

    const overlay = document.createElement('div');
    overlay.id = 'tm-exit-overlay';
    overlay.innerHTML = `
      <div id="tm-exit-box">
        <button id="tm-exit-close" aria-label="Cerrar">×</button>
        <div id="tm-exit-emoji">⚠️</div>
        <h3 id="tm-exit-title">¡Espera antes de irte!</h3>
        <p id="tm-exit-desc">
          Esta oferta <strong>no estará disponible mañana</strong>.<br>
          Los precios pueden subir en cualquier momento.
        </p>
        <div id="tm-exit-badge">
          <div id="tm-exit-badge-label">Precio sin oferta</div>
          <div id="tm-exit-badge-valor">🔥 Precio especial HOY</div>
          <div id="tm-exit-badge-sub">Solo para quienes decidan ahora</div>
        </div>
        <a id="tm-exit-cta"
           href="https://wa.me/5354320170?text=${encodeURIComponent('Hola TiendaMax, vi que la oferta de hoy puede acabarse. ¿Sigue disponible?')}"
           target="_blank" rel="noopener">
          💬 Quiero aprovechar ahora
        </a>
        <button id="tm-exit-decline">No, prefiero pagar más después</button>
      </div>`;

    document.body.appendChild(overlay);

    const cerrar = () => {
      overlay.style.animation = 'tm-fadeOut .25s ease forwards';
      setTimeout(() => overlay.remove(), 260);
    };

    document.getElementById('tm-exit-close').onclick   = cerrar;
    document.getElementById('tm-exit-decline').onclick = cerrar;
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });
  }

  // Desktop — mouse sale por arriba
  document.addEventListener('mouseleave', e => {
    if (e.clientY <= 0) mostrarExitPopup();
  });

  // Mobile — mostrar a los 45 s si no hay interacción con WhatsApp
  let _mobileTimer = setTimeout(() => mostrarExitPopup(), 45000);
  // Cancelar si el usuario ya tocó WhatsApp (compró / está en proceso)
  document.addEventListener('click', e => {
    if (e.target.closest('a[href*="wa.me"]')) clearTimeout(_mobileTimer);
  });


  // ══════════════════════════════════════════════════════════
  // 3. WHATSAPP PRE-LLENADO CON PRODUCTOS DEL CARRITO
  // ══════════════════════════════════════════════════════════
  // Intercepta el botón "Pedir por WhatsApp" del carrito y
  // construye un mensaje con el nombre de cada producto.

  document.addEventListener('click', function (e) {
    // Selectors: el botón del carrito suele tener data-action o texto con "WhatsApp"
    const btn = e.target.closest(
      '[data-action="pedirPorWhatsApp"], ' +
      '.cart-whatsapp, #cartWhatsappBtn, ' +
      '.carrito-whatsapp-btn'
    );
    if (!btn) return;

    // Intentar leer items del carrito desde el DOM
    const itemEls = document.querySelectorAll(
      '.cart-item-name, .carrito-item-nombre, ' +
      '.cart-item .nombre, .cart-item h4, .cart-item strong'
    );

    if (itemEls.length === 0) return; // dejar comportamiento original si no hay items visibles

    e.preventDefault();
    e.stopImmediatePropagation();

    const nombres = [...new Set(
      Array.from(itemEls)
        .map(el => el.textContent.trim())
        .filter(Boolean)
    )];

    let texto;
    if (nombres.length === 1) {
      texto = `Hola TiendaMax 👋 Quiero comprar *${nombres[0]}*. ¿Está disponible y cuál es el precio final?`;
    } else {
      texto = `Hola TiendaMax 👋 Me interesan estos productos:\n` +
              nombres.map(n => `• ${n}`).join('\n') +
              `\n¿Están disponibles? ¿Cuál es el total?`;
    }

    window.open(
      `https://wa.me/5354320170?text=${encodeURIComponent(texto)}`,
      '_blank', 'noopener'
    );
  }, true); // capture: true para ejecutarse antes que el handler original


  // ══════════════════════════════════════════════════════════
  // 4. PRODUCTOS RELACIONADOS EN EL CARRITO (UPSELL)
  // ══════════════════════════════════════════════════════════

  function _shuffle(arr) {
    return [...arr].sort(() => Math.random() - .5);
  }

  function renderRelacionados(carritoEl) {
    // Quitar sección anterior si existe
    const prev = carritoEl.querySelector('#tm-related');
    if (prev) prev.remove();

    const pool = window.productos || window.allProducts || [];
    if (!pool.length) return;

    // Excluir lo que ya está en carrito
    const enCarrito = new Set(
      Array.from(carritoEl.querySelectorAll(
        '.cart-item-name, .carrito-item-nombre, .cart-item h4'
      )).map(el => el.textContent.trim())
    );

    const candidatos = pool.filter(p => !enCarrito.has(p.nombre || p.name || ''));
    if (!candidatos.length) return;

    const elegidos = _shuffle(candidatos).slice(0, 3);

    const sec = document.createElement('div');
    sec.id = 'tm-related';
    sec.innerHTML = `<div id="tm-related-title">✨ También te puede interesar</div>` +
      elegidos.map(p => {
        const nombre = p.nombre || p.name || 'Producto';
        const precio = p.precio || p.price || '';
        const img    = p.imagen || p.img || p.image || p.foto || '';
        const id     = p.id || p._id || '';
        return `
          <div class="tm-rel-item" data-tm-pid="${id}">
            <img class="tm-rel-img" src="${img}" alt="${nombre}"
                 onerror="this.style.visibility='hidden'">
            <div class="tm-rel-info">
              <div class="tm-rel-nombre">${nombre}</div>
              ${precio ? `<div class="tm-rel-precio">$${precio}</div>` : ''}
            </div>
            <div class="tm-rel-ver">Ver →</div>
          </div>`;
      }).join('');

    // Click en relacionado → intentar abrir detalle del producto
    sec.addEventListener('click', e => {
      const item = e.target.closest('.tm-rel-item');
      if (!item) return;
      const pid = item.dataset.tmPid;
      // Intentar varios métodos que el script original puede exponer
      if (typeof window.abrirDetalleProducto === 'function') {
        window.abrirDetalleProducto(pid);
      } else if (typeof window.mostrarProducto === 'function') {
        window.mostrarProducto(pid);
      } else if (typeof window.verProducto === 'function') {
        window.verProducto(pid);
      } else {
        // Fallback: buscar el producto por id y simular click en su tarjeta
        const card = document.querySelector(`[data-product-id="${pid}"], [data-id="${pid}"]`);
        if (card) card.click();
      }
    });

    // Insertar antes del total / footer del carrito
    const ancla =
      carritoEl.querySelector('.cart-total, .carrito-total, #cartFooter, .cart-footer') ||
      carritoEl.lastElementChild;

    carritoEl.insertBefore(sec, ancla);
  }

  function iniciarRelacionados() {
    // Selectores comunes del carrito
    const SELECTORS = [
      '#carritoModal', '#cartModal', '.carrito-modal',
      '.cart-modal', '[id*="carrito"]', '[class*="carrito"]'
    ];

    let carritoEl = null;
    for (const sel of SELECTORS) {
      carritoEl = document.querySelector(sel);
      if (carritoEl) break;
    }
    if (!carritoEl) return;

    // Observar cambios de visibilidad
    const mo = new MutationObserver(() => {
      const visible =
        carritoEl.style.display !== 'none' &&
        !carritoEl.classList.contains('hidden') &&
        !carritoEl.classList.contains('oculto') &&
        carritoEl.offsetParent !== null;
      if (visible) renderRelacionados(carritoEl);
    });
    mo.observe(carritoEl, { attributes: true, attributeFilter: ['style', 'class'] });

    // También al hacer click en el ícono del carrito
    document.addEventListener('click', e => {
      if (e.target.closest('[data-action="abrirCarrito"]')) {
        setTimeout(() => renderRelacionados(carritoEl), 250);
      }
    });
  }

  // Arrancar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(iniciarRelacionados, 600));
  } else {
    setTimeout(iniciarRelacionados, 600);
  }

})();
