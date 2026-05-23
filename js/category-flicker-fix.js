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
  function _icono(cat) {
    if (typeof obtenerIconoCategoria === 'function') return obtenerIconoCategoria(cat);
    // Fallback por si no existe
    var defaultIcons = {
      'WIFI': '📡', 'ENERGIA': '⚡', 'CELULARES': '📱', 'UTILES': '🔧',
      'CARROS': '🚗', 'ROPA': '👗', 'LENCERIA': '👙', 'SEGURIDAD': '🔒',
      'HOGAR': '🏠', 'JUEGOS': '🎮', 'MOTOS': '🛵'
    };
    if (typeof iconosPersonalizados !== 'undefined' && iconosPersonalizados[cat]) {
      return iconosPersonalizados[cat];
    }
    return defaultIcons[cat] || '📦';
  }

  /**
   * Renderiza las categorías SIN parpadeo.
   * Solo actualiza las cards que cambiaron.
   */
  function renderizarCategoriasSinFlicker() {
    var grid = document.getElementById('categoriasGrid');
    if (!grid) return;

    var cats = (typeof categorias !== 'undefined') ? categorias : [];
    var prods = (typeof productos !== 'undefined') ? productos : [];

    var key = _renderKey(prods, cats);

    // Si nada cambió, no hacer nada
    if (key === _lastRenderKey && grid.children.length > 0) return;
    _lastRenderKey = key;

    var totalProductos = prods.length;

    // Construir la lista de datos esperados
    var items = [{ icon: '🛍️', name: 'Todos', count: totalProductos, special: true }];
    cats.forEach(function(cat) {
      var count = prods.filter(function(p) { return p.categoria === cat; }).length;
      items.push({ icon: _icono(cat), name: cat, count: count, special: false });
    });

    // Si el grid ya tiene el número correcto de cards, actualizarlas in-place
    if (grid.children.length === items.length) {
      var changed = false;
      for (var i = 0; i < items.length; i++) {
        var card = grid.children[i];
        var item = items[i];

        var iconEl = card.querySelector('.cat-icon');
        var nameEl = card.querySelector('.cat-name');
        var countEl = card.querySelector('.cat-count');

        if (iconEl && iconEl.textContent.trim() !== item.icon) {
          iconEl.textContent = item.icon;
          changed = true;
        }
        if (nameEl && nameEl.textContent.trim() !== item.name) {
          nameEl.textContent = item.name;
          changed = true;
        }
        var countText = item.count === 0
          ? 'Próximamente'
          : item.count + ' producto' + (item.count !== 1 ? 's' : '');
        if (countEl) {
          var currentText = countEl.textContent.trim();
          if (currentText !== countText && currentText !== '🕐 ' + countText) {
            countEl.textContent = countText;
            if (item.count === 0) {
              countEl.classList.add('proximamente');
            } else {
              countEl.classList.remove('proximamente');
            }
            changed = true;
          }
        }

        // Clase especial para "Todos"
        if (item.special) {
          card.classList.add('todos-card');
        }
      }
      // Si nada cambió realmente, salir sin tocar el DOM
      if (!changed) return;
    } else {
      // Número de cards cambió, reconstruir (pero SIN innerHTML = '')
      // Crear cards nuevas
      var fragment = document.createDocumentFragment();
      items.forEach(function(item) {
        var card = document.createElement('div');
        card.className = 'categoria-card' + (item.special ? ' todos-card' : '');
        card.innerHTML = '<span class="cat-icon">' + item.icon + '</span>'
          + '<span class="cat-name">' + item.name + '</span>'
          + '<span class="cat-count' + (item.count === 0 ? ' proximamente' : '') + '">'
          + (item.count === 0 ? 'Próximamente' : item.count + ' producto' + (item.count !== 1 ? 's' : ''))
          + '</span>';
        card.onclick = function() {
          if (typeof mostrarVistaCategoria === 'function') {
            mostrarVistaCategoria(item.name === 'Todos' ? 'Todas' : item.name);
          }
        };
        fragment.appendChild(card);
      });

      // Limpiar y agregar de una vez (un solo reflow)
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      grid.appendChild(fragment);

      // Marcar como visibles inmediatamente (sin esperar observer)
      requestAnimationFrame(function() {
        var cards = grid.querySelectorAll('.categoria-card');
        for (var i = 0; i < cards.length; i++) {
          cards[i].classList.add('visible');
        }
      });
    }

    // Disparar animaciones CSS
    if (!grid.classList.contains('tm-rendered')) {
      requestAnimationFrame(function() { grid.classList.add('tm-rendered'); });
    }
  }

  // ── Reemplazar funciones globales ──
  window.renderizarCategoriasHome = renderizarCategoriasSinFlicker;
  window.renderizarCategoriasHomeInstant = renderizarCategoriasSinFlicker;
  window._initCategorias = renderizarCategoriasSinFlicker;

  // ── Ejecutar inmediatamente ──
  if (document.readyState !== 'loading') {
    renderizarCategoriasSinFlicker();
  } else {
    document.addEventListener('DOMContentLoaded', renderizarCategoriasSinFlicker);
  }

  // ── Fix: evitar que initScrollAnimations ponga opacity:0 en categorías ──
  // Interceptar para que las categoría-card siempre empiecen visibles
  var _origInitScroll = (typeof initScrollAnimations === 'function') ? initScrollAnimations : null;

  window.initScrollAnimations = function() {
    // Ejecutar original si existe
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

  console.log('✅ Fix parpadeo categorías activado');
})();
