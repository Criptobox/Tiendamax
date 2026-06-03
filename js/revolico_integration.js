/**
 * revolico_integration.js — TiendaMax
 * Asistente para copiar y publicar en Facebook y Revolico.
 * (Backend eliminado — solo funciones de copia de texto.)
 */

function _escH(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── ASISTENTE FACEBOOK ────────────────────────────────────────────────────

async function copiarYAbrirFacebook(productoId) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    const precio    = producto.precioActual;
    const original  = producto.precioOriginal || null;
    const descuento = producto.descuento || 0;
    const whatsapp  = localStorage.getItem('whatsappNumero') || '5354320170';
    const url       = `https://tiendamax.org/p/producto-${producto.id}.html`;

    let texto = `🛍️ ${producto.nombre}\n\n`;
    if (producto.usado) texto += `♻️ PRODUCTO USADO/REFURBISHED\n\n`;
    texto += `${producto.descripcion || ''}\n\n`;
    if (producto.garantia) texto += `🛡️ Garantía: ${producto.garantia}\n`;
    if (producto.devolucion) texto += `✓ Devolución Segura Garantizada\n`;
    texto += `\n💰 Precio: $${precio} USD`;
    if (original && descuento > 0) texto += `\n💳 Antes: $${original} USD (-${descuento}%)`;
    if (producto.stock <= 3 && producto.stock > 0) texto += `\n⚠️ ¡Solo quedan ${producto.stock} unidades!`;
    texto += `\n\n📲 Info: wa.me/${whatsapp}\n🔗 ${url}`;

    try { await navigator.clipboard.writeText(texto); } catch(e) {
        const ta = document.createElement('textarea');
        ta.value = texto; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
    }

    mostrarNotificacion('✅ Texto copiado. Pegalo en Facebook', 'success');
    window.open('https://www.facebook.com', '_blank');
}

function mostrarSelectorAsistenteFacebook() {
    if (!productos || productos.length === 0) {
        mostrarNotificacion('❌ No hay productos para publicar', 'error'); return;
    }
    let modal = document.getElementById('fbSelectorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'fbSelectorModal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content" style="max-width:540px">
            <div class="modal-header">
              <h2>📘 Publicar en Facebook</h2>
              <button class="close-btn" onclick="cerrarFbSelector()" type="button">✕</button>
            </div>
            <p style="margin:12px 0 8px;font-size:13px;opacity:.8;">Elige el producto. El texto se copia automáticamente.</p>
            <div id="fbSelectorList" style="max-height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;"></div>
          </div>`;
        const list = modal.querySelector('#fbSelectorList');
        productos.forEach(p => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#f8f8f8;border-radius:8px;';
            const span = document.createElement('span');
            span.style.fontSize = '13px';
            span.textContent = `${p.nombre} — $${p.precioActual}`;
            const btn = document.createElement('button');
            btn.style.cssText = 'background:#3B5998;color:white;border:none;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px;';
            btn.type = 'button';
            btn.textContent = 'Copiar y Abrir';
            btn.addEventListener('click', () => { copiarYAbrirFacebook(p.id); cerrarFbSelector(); });
            row.appendChild(span);
            row.appendChild(btn);
            list.appendChild(row);
        });
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function cerrarFbSelector() {
    const m = document.getElementById('fbSelectorModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
}

// ── ASISTENTE REVOLICO ────────────────────────────────────────────────────

async function copiarYAbrirRevolico(productoId) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    const whatsapp = localStorage.getItem('whatsappNumero') || '5354320170';
    const url      = `https://tiendamax.org/p/producto-${producto.id}.html`;

    let texto = `${producto.nombre}\n`;
    if (producto.usado) texto += `✨ PRODUCTO USADO/REFURBISHED\n`;
    texto += `${producto.descripcion || ''}\n`;
    if (producto.garantia) texto += `🛡️ Garantía: ${producto.garantia}\n`;
    if (producto.devolucion) texto += `✓ Devolución Segura Garantizada\n`;
    texto += `💰 Precio: $${producto.precioActual} USD\n`;
    if (producto.stock > 0) {
        texto += `📦 Stock: ${producto.stock} unidad${producto.stock !== 1 ? 'es' : ''}\n`;
    } else {
        texto += `📦 Sin stock\n`;
    }
    texto += `📲 WhatsApp: ${whatsapp}\n🔗 ${url}`;

    try { await navigator.clipboard.writeText(texto); } catch(e) {
        const ta = document.createElement('textarea');
        ta.value = texto; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
    }

    mostrarNotificacion('✅ Texto copiado. Pegalo en Revolico', 'success');
    window.open('https://www.revolico.com/anuncios/nuevo', '_blank');
}

function mostrarSelectorAsistenteRevolico() {
    if (!productos || productos.length === 0) {
        mostrarNotificacion('❌ No hay productos para publicar', 'error'); return;
    }
    let modal = document.getElementById('revSelectorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'revSelectorModal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content" style="max-width:540px">
            <div class="modal-header">
              <h2>🟠 Publicar en Revolico</h2>
              <button class="close-btn" onclick="cerrarRevSelector()" type="button">✕</button>
            </div>
            <p style="margin:12px 0 8px;font-size:13px;opacity:.8;">Elige el producto. El texto se copia listo para pegar.</p>
            <div id="revSelectorList" style="max-height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;"></div>
          </div>`;
        const list = modal.querySelector('#revSelectorList');
        productos.forEach(p => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#f8f8f8;border-radius:8px;';
            const span = document.createElement('span');
            span.style.fontSize = '13px';
            span.textContent = `${p.nombre} — $${p.precioActual}`;
            const btn = document.createElement('button');
            btn.style.cssText = 'background:#FF6B35;color:white;border:none;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px;';
            btn.type = 'button';
            btn.textContent = 'Copiar y Abrir';
            btn.addEventListener('click', () => { copiarYAbrirRevolico(p.id); cerrarRevSelector(); });
            row.appendChild(span);
            row.appendChild(btn);
            list.appendChild(row);
        });
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function cerrarRevSelector() {
    const m = document.getElementById('revSelectorModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
}
