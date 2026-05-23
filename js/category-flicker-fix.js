/**
 * ═══════════════════════════════════════════════════════
 * TIENDAMAX — Fix parpadeo de categorías
 * ═══════════════════════════════════════════════════════
 *
 * PROBLEMA: Las categorías parpadean al cargar porque:
 * 1. Se renderizan 6-8 veces (instant + GitHub + retries)
 * 2. Cada render hace innerHTML = '' (destruye las cards)
 * 3. initScrollAnimations pone opacity:0 y tarda en poner .visible
 *
 * SOLUCIÓN: Reemplazar renderizarCategoriasHome y
 * renderizarCategoriasHomeInstant con versiones que solo
 * actualizan lo que cambió (sin destruir el DOM).
 *
 * INSTALACIÓN: Agregar en index.html DESPUÉS de script.js:
 * <script src="js/category-flicker-fix.js?v=1"></script>
 */

(function() {
  'use strict';

  // Cache del último render para evitar re-renders innecesarios
  var _lastRenderKey = '';

  /**
   * Genera una clave única basada en los datos actuales
   * para saber si realmente hay que re-renderizar
   */
  function _renderKey(prods, cats) {
    var counts = cats.map(function(cat) {
      var count = prods.filter(function(p) { return p.categoria === cat; }).length;
      return cat + ':' + count;
    }).join('|');
    return 'all:' + prods.length + '|' + counts;
  }

  /**
   * Función helper para obtener ícono de categoría
   */
  function _getIcon(catName) {
    if (typeof o_categorias_iconos !== 'undefined' && o_categorias_iconos[catName]) {
      return o_categorias_iconos[catName];
    }
    return '📦'; // Default
  }

  /**
   * Renderizado inteligente sin parpadeos (Shadow DOM / Diffing conceptual)
   */
  function renderizarCategoriasSinFlicker() {
    var grid = document.getElementById('categoriasGrid');
    if (!grid) return;

    // Obtener datos globales (asumiendo que script.js los expone)
    var prods = window.productos || [];
    var cats = window.categorias || [];

    if (cats.length === 0) return;

    // Verificar si el contenido real cambió desde la última vez
    var currentKey = _renderKey(prods, cats);
    if (_lastRenderKey === currentKey && grid.children.length > 0) {
      // Los datos son idénticos, no destruimos nada para evitar flicker
      return;
    }
    _lastRenderKey = currentKey;

    // Clonar el contenedor actual para armar el nuevo diseño en memoria (Offline)
    var fragment = document.createDocumentFragment();

    // 1. Añadir botón "TODOS" siempre al inicio
    var totalProds = prods.length;
    var todosCard = document.createElement('div');
    todosCard.className = 'categoria-card visible'; // Forzar visible de inmediato
    todosCard.setAttribute('data-action', 'filtrarCategoria');
    todosCard.setAttribute('data-arg', 'Todas');
    todosCard.innerHTML = `
      <div class="categoria-icono">🛍️</div>
      <div class="categoria-info">
        <h3>TODOS</h3>
        <p><span style="color: var(--orange, #ff6a00); font-weight: 500; font-size: 0.9em; opacity: 0.95;">${totalProds} ${totalProds === 1 ? 'producto' : 'productos'}</span></p>
      </div>
    `;
    fragment.appendChild(todosCard);

    // 2. Añadir las categorías dinámicas del JSON
    cats.forEach(function(cat) {
      var count = prods.filter(function(p) { return p.categoria === cat; }).length;
      var icon = _getIcon(cat);

      var card = document.createElement('div');
      card.className = 'categoria-card visible'; // Forzar visible de inmediato
      card.setAttribute('data-action', 'filtrarCategoria');
      card.setAttribute('data-arg', cat);

      // Fix render color naranja premium en la cantidad de productos
      var countText = '<span style="color: var(--orange, #ff6a00); font-weight: 500; font-size: 0.9em; opacity: 0.95;">' + count + ' ' + (count === 1 ? 'producto' : 'productos') + '</span>';
      
      // Manejo sutil para la sección próximamente
      if (cat.toUpperCase() === 'LENCERÍA' || cat.toUpperCase() === 'LENCERIA') {
         countText = '<span style="font-size:0.85em; opacity:0.7;"><i class="far fa-clock"></i> Próximamente</span>';
      }

      card.innerHTML = `
        <div class="categoria-icono">${icon}</div>
        <div class="categoria-info">
          <h3>${cat.toUpperCase()}</h3>
          <p>${countText}</p>
        </div>
      `;
      fragment.appendChild(card);
    });

    // 3. Reemplazo atómico en el DOM (minimiza drásticamente el parpadeo blanco)
    grid.innerHTML = '';
    grid.appendChild(fragment);
  }

  // Sobrescribir las funciones globales antiguas para redirigirlas al Fix
  window.renderizarCategoriasHome = renderizarCategoriasSinFlicker;
  window.renderizarCategoriasHomeInstant = renderizarCategoriasSinFlicker;
  window.initCategorias = renderizarCategoriasSinFlicker;

  // ── Ejecutar inmediatamente ──
  if (document.readyState !== 'loading') {
    renderizarCategoriasSinFlicker();
  } else {
    document.addEventListener('DOMContentLoaded', renderizarCategoriasSinFlicker);
  }

  // ── Fix: evitar que initScrollAnimations ponga opacity:0 en categorías ──
  var _origInitScroll = (typeof initScrollAnimations === 'function') ? initScrollAnimations : null;

  window.initScrollAnimations = function() {
    if (_origInitScroll) _origInitScroll();

    // Forzar visibilidad inmediata en categorías
    requestAnimationFrame(function() {
      var catCards = document.querySelectorAll('.categoria-card');
      for (var i = 0; i < catCards.length; i++) {
        catCards[i].classList.add('visible');
      }
    });

    // Observar cambios futuros en el grid de categorías para marcarlas visibles
    var catGrid = document.getElementById('categoriasGrid');
    if (catGrid) {
      var catObs = new MutationObserver(function() {
        requestAnimationFrame(function() {
          var cards = catGrid.querySelectorAll('.categoria-card:not(.visible)');
          for (var i = 0; i < cards.length; i++) {
            cards[i].classList.add('visible');
          }
        });
      });
      catObs.observe(catGrid, { childList: true });
    }
  };

  console.log('✅ Fix parpadeo categorías premium inyectado perfectamente.');
})();
