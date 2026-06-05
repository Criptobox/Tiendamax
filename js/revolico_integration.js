/**
 * revolico_integration.js — TiendaMax v2
 * Asistente para publicar en Facebook y Revolico desde el panel admin.
 */

function _escH(s) {
    return String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _getTasa() {
    return (typeof getTasaMN === 'function') ? getTasaMN() : 0;
}

function _precioMN(usd) {
    const tasa = _getTasa();
    if (!tasa || !usd) return '';
    return ' / ' + Math.round(usd * tasa).toLocaleString('es-CU') + ' MN';
}

function _hashtagsCategoria(categoria) {
    const mapa = {
        'WiFi':        '#wifi #router #internet #repetidor',
        'Energía':     '#energia #solar #inversor #bateria',
        'Celulares':   '#celular #movil #smartphone',
        'Computación': '#computacion #laptop #pc',
        'PC y Laptops':'#laptop #computadora #pc',
        'Hogar':       '#hogar #casa #electrodomesticos',
        'Audio':       '#audio #sonido #musica',
        'Cámaras':     '#camara #fotografia #seguridad',
        'Iluminación': '#iluminacion #led',
        'Carros':      '#autos #carros #vehiculos',
        'Motos':       '#motos #motocicletas',
        'Ropa':        '#ropa #moda #fashion',
        'Lencería':    '#ropa #lenceria #moda',
        'Seguridad':   '#seguridad #camaras #alarma',
        'Juegos':      '#videojuegos #juegos #gaming',
        'Útiles':      '#hogar #utiles #herramientas',
        'Herramientas':'#herramientas #tools',
        'Electrónica': '#electronica #tecnologia',
    };
    const base = '#tiendamax #cuba #oferta #envio';
    return `${base} ${mapa[categoria] || '#tecnologia'}`;
}

async function _copiar(texto) {
    try {
        await navigator.clipboard.writeText(texto);
    } catch(e) {
        const ta = document.createElement('textarea');
        ta.value = texto;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
}

// ══════════════════════════════════════════════════════════════
//  FACEBOOK
// ══════════════════════════════════════════════════════════════

function _textoFacebook(producto) {
    const whatsapp = localStorage.getItem('whatsappNumero') || '5354320170';
    const url      = `https://tiendamax.org/p/producto-${producto.id}.html`;
    const precio   = producto.precioActual;
    const mn       = _precioMN(precio);
    const tasa     = _getTasa();
    const hashtags = _hashtagsCategoria(producto.categoria);

    let t = `🛍️ ${producto.nombre}\n`;
    t += '─'.repeat(32) + '\n\n';

    if (producto.usado) t += '♻️ PRODUCTO USADO / REFURBISHED\n\n';
    if (producto.descripcion) t += `${producto.descripcion}\n\n`;
    if (producto.garantia)   t += `🛡️ Garantía: ${producto.garantia}\n`;
    if (producto.devolucion) t += `✅ Devolución segura garantizada\n`;

    t += `\n💰 Precio: $${precio} USD${mn}\n`;

    if (producto.precioOriginal > 0 && producto.precioOriginal > precio) {
        const ahorro = (producto.precioOriginal - precio).toFixed(0);
        t += `🏷️ Antes: $${producto.precioOriginal} USD — Ahorras $${ahorro}\n`;
    }
    if (tasa > 0) t += `📈 Tasa: 1 USD = ${tasa} MN\n`;

    if (producto.stock === 0) {
        t += '\n⚠️ PRODUCTO AGOTADO — Escríbenos para restock\n';
    } else if (producto.stock <= 3) {
        t += `\n🔥 ¡Solo quedan ${producto.stock} unidades!\n`;
    }

    t += `\n📲 Pedir por WhatsApp: wa.me/${whatsapp}\n`;
    t += `🔗 Ver producto: ${url}\n\n`;
    t += hashtags;

    return t;
}

async function copiarYAbrirFacebook(productoId, grupoUrl) {
    const producto = (typeof productos !== 'undefined') && productos.find(p => p.id === productoId);
    if (!producto) return;
    await _copiar(_textoFacebook(producto));
    mostrarNotificacion('✅ Texto copiado — pégalo en Facebook', 'success');
    window.open(grupoUrl || 'https://www.facebook.com', '_blank', 'noopener,noreferrer');
}

function mostrarSelectorAsistenteFacebook() {
    if (typeof productos === 'undefined' || !productos || productos.length === 0) {
        mostrarNotificacion('❌ No hay productos cargados', 'error'); return;
    }
    const existing = document.getElementById('fbSelectorModal');
    if (existing) document.body.removeChild(existing);

    const gruposFB = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    const modal = document.createElement('div');
    modal.id = 'fbSelectorModal';
    modal.className = 'modal';
    modal.style.display = 'flex';

    const gruposHtml = gruposFB.length
        ? `<div style="margin-bottom:14px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#888;text-transform:uppercase;margin-bottom:8px;">Grupos guardados</div>
            <div id="fbGruposList" style="display:flex;flex-direction:column;gap:6px;">
              ${gruposFB.map((g, i) => `
                <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(59,89,152,.12);border-radius:8px;">
                  <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📘 ${_escH(g.nombre || g.url)}</span>
                  <button type="button" data-grupo-idx="${i}" class="fb-grupo-btn"
                    style="background:#3B5998;color:#fff;border:none;padding:4px 12px;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap;">
                    Publicar aquí
                  </button>
                </div>`).join('')}
            </div>
           </div>` : '';

    modal.innerHTML = `
      <div class="modal-content" style="max-width:560px;max-height:90vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h2>📘 Publicar en Facebook</h2>
          <button class="close-btn" onclick="cerrarFbSelector()" type="button">✕</button>
        </div>
        <p style="font-size:12px;opacity:.7;margin:8px 0 12px;">El texto se copia automáticamente. Pégalo en el grupo.</p>
        ${gruposHtml}
        <input type="text" id="fbSearch" placeholder="🔍 Buscar producto…" aria-label="Buscar producto para publicar en Facebook"
          style="width:100%;padding:8px 12px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.07);color:inherit;font-size:13px;margin-bottom:10px;outline:none;">
        <div id="fbSelectorList" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;"></div>
      </div>`;

    document.body.appendChild(modal);

    function renderLista(filtro) {
        const list = document.getElementById('fbSelectorList');
        list.innerHTML = '';
        const filtrados = productos.filter(p =>
            !filtro || p.nombre.toLowerCase().includes(filtro.toLowerCase())
        );
        filtrados.forEach(p => {
            const agotado = p.stock === 0;
            const row = document.createElement('div');
            row.style.cssText = `display:flex;justify-content:space-between;align-items:center;
                padding:9px 12px;background:rgba(255,255,255,${agotado ? '.03' : '.06'});
                border-radius:8px;opacity:${agotado ? '.5' : '1'};`;
            const info = document.createElement('div');
            info.style.cssText = 'font-size:13px;display:flex;flex-direction:column;gap:2px;';
            const nombre = document.createElement('span');
            nombre.textContent = p.nombre;
            const meta = document.createElement('span');
            meta.style.cssText = 'font-size:11px;opacity:.6;';
            meta.textContent = `$${p.precioActual} USD · ${agotado ? '🚫 Agotado' : `📦 ${p.stock} uds`}`;
            info.appendChild(nombre);
            info.appendChild(meta);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Copiar y Abrir';
            btn.style.cssText = 'background:#3B5998;color:#fff;border:none;padding:5px 14px;border-radius:6px;font-size:12px;cursor:pointer;flex-shrink:0;';
            btn.addEventListener('click', () => { copiarYAbrirFacebook(p.id, null); cerrarFbSelector(); });
            row.appendChild(info);
            row.appendChild(btn);
            list.appendChild(row);
        });
        if (!filtrados.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align:center;padding:20px;opacity:.5;font-size:13px;';
            empty.textContent = 'No se encontraron productos';
            list.appendChild(empty);
        }
    }

    renderLista('');
    document.getElementById('fbSearch').addEventListener('input', e => renderLista(e.target.value));
    modal.querySelectorAll('.fb-grupo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const grupo = gruposFB[parseInt(btn.dataset.grupoIdx)];
            const p = productos.find(p => p.stock > 0) || productos[0];
            if (p) copiarYAbrirFacebook(p.id, grupo.url);
            cerrarFbSelector();
        });
    });
}

function cerrarFbSelector() {
    const m = document.getElementById('fbSelectorModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
}

function publicarEnGrupoFB(iGrupo) {
    if (typeof productos === 'undefined' || !Array.isArray(productos) || productos.length === 0) return;
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    const grupo = grupos[iGrupo];
    if (!grupo || !grupo.url) { mostrarNotificacion('❌ Agrega la URL del grupo primero', 'error'); return; }
    const prods = productos.filter(p => (grupo.productos || []).includes(p.id))
        .sort((a, b) => (!a.stock || a.stock <= 0) - (!b.stock || b.stock <= 0));
    if (prods.length === 0) { mostrarNotificacion('❌ No hay productos seleccionados para este grupo', 'error'); return; }

    const existing = document.getElementById('grupoPublicarModal');
    if (existing) document.body.removeChild(existing);
    const modal = document.createElement('div');
    modal.id = 'grupoPublicarModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:520px;max-height:90vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h2>📢 Publicar en: ${_escH(grupo.nombre || grupo.url)}</h2>
          <button class="close-btn" onclick="cerrarGrupoPublicarModal()" type="button">✕</button>
        </div>
        <p style="font-size:12px;opacity:.7;margin:8px 0 12px;">Haz clic en cada producto. El texto se copia y se abre el grupo — pega y publica, luego vuelve.</p>
        <div id="grupoPublicarList" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;"></div>
      </div>`;
    document.body.appendChild(modal);

    const list = document.getElementById('grupoPublicarList');
    prods.forEach((p, idx) => {
        const agotado = p.stock === 0;
        const row = document.createElement('div');
        row.id = `gprow_${p.id}`;
        row.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 12px;
            background:rgba(255,255,255,${agotado ? '.03' : '.06'});border-radius:10px;opacity:${agotado ? '.5' : '1'};`;
        const num = document.createElement('span');
        num.style.cssText = 'font-size:12px;font-weight:700;opacity:.5;min-width:18px;';
        num.textContent = `${idx + 1}.`;
        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';
        const nombre = document.createElement('div');
        nombre.style.cssText = 'font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        nombre.textContent = p.nombre;
        const meta = document.createElement('div');
        meta.style.cssText = 'font-size:11px;opacity:.6;margin-top:2px;';
        meta.textContent = `$${p.precioActual} · ${agotado ? '🚫 Agotado' : `📦 ${p.stock} uds`}`;
        info.appendChild(nombre);
        info.appendChild(meta);
        const btn = document.createElement('button');
        btn.type = 'button';
        if (agotado) {
            btn.textContent = '🚫 Agotado';
            btn.disabled = true;
            btn.style.cssText = 'background:#555;color:#999;border:none;padding:7px 14px;border-radius:8px;font-size:12px;cursor:not-allowed;white-space:nowrap;flex-shrink:0;';
        } else {
            btn.textContent = '📋 Copiar y Abrir';
            btn.style.cssText = 'background:#4267B2;color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;';
            btn.addEventListener('click', async () => {
                await copiarYAbrirFacebook(p.id, grupo.url);
                btn.textContent = '✅ Publicado';
                btn.style.background = '#27AE60';
                btn.disabled = true;
                row.style.opacity = '.5';
            });
        }
        row.appendChild(num); row.appendChild(info); row.appendChild(btn);
        list.appendChild(row);
    });
}

function cerrarGrupoPublicarModal() {
    const m = document.getElementById('grupoPublicarModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
}


// ══════════════════════════════════════════════════════════════
//  REVOLICO — Vista previa + publicación
// ══════════════════════════════════════════════════════════════

const _REVOLICO_CATS = {
    'WiFi':         { label: 'Computación › Redes',         url: 'https://www.revolico.com/anuncios/nuevo/?c=58' },
    'Energía':      { label: 'Electrónica › Baterías',      url: 'https://www.revolico.com/anuncios/nuevo/?c=74' },
    'Herramientas': { label: 'Herramientas',                url: 'https://www.revolico.com/anuncios/nuevo/?c=23' },
    'Electrónica':  { label: 'Electrónica',                 url: 'https://www.revolico.com/anuncios/nuevo/?c=9'  },
    'Celulares':    { label: 'Celulares y Tablets',         url: 'https://www.revolico.com/anuncios/nuevo/?c=7'  },
    'Computación':  { label: 'Computación',                 url: 'https://www.revolico.com/anuncios/nuevo/?c=8'  },
    'PC y Laptops': { label: 'Computación',                 url: 'https://www.revolico.com/anuncios/nuevo/?c=8'  },
    'Hogar':        { label: 'Hogar y Jardín',              url: 'https://www.revolico.com/anuncios/nuevo/?c=10' },
    'Útiles':       { label: 'Hogar y Jardín',              url: 'https://www.revolico.com/anuncios/nuevo/?c=10' },
    'Audio':        { label: 'Electrónica › Audio',         url: 'https://www.revolico.com/anuncios/nuevo/?c=72' },
    'Cámaras':      { label: 'Electrónica › Fotografía',   url: 'https://www.revolico.com/anuncios/nuevo/?c=73' },
    'Iluminación':  { label: 'Electrónica',                 url: 'https://www.revolico.com/anuncios/nuevo/?c=9'  },
    'Carros':       { label: 'Autos y Otros Vehículos',     url: 'https://www.revolico.com/anuncios/nuevo/?c=3'  },
    'Motos':        { label: 'Motocicletas y Bicicletas',   url: 'https://www.revolico.com/anuncios/nuevo/?c=4'  },
    'Ropa':         { label: 'Moda y Accesorios',           url: 'https://www.revolico.com/anuncios/nuevo/?c=12' },
    'Lencería':     { label: 'Moda y Accesorios',           url: 'https://www.revolico.com/anuncios/nuevo/?c=12' },
    'Seguridad':    { label: 'Electrónica',                 url: 'https://www.revolico.com/anuncios/nuevo/?c=9'  },
    'Juegos':       { label: 'Juguetes y Videojuegos',      url: 'https://www.revolico.com/anuncios/nuevo/?c=44' },
};
const _REVOLICO_DEFAULT = { label: 'Electrónica', url: 'https://www.revolico.com/anuncios/nuevo/?c=9' };

function _textoRevolico(producto) {
    const whatsapp = localStorage.getItem('whatsappNumero') || '5354320170';
    const url      = `https://tiendamax.org/p/producto-${producto.id}.html`;
    const precio   = producto.precioActual;
    const mn       = _precioMN(precio);
    const tasa     = _getTasa();

    let titulo = producto.nombre;
    if (precio) titulo += ` — $${precio} USD${mn}`;
    if (titulo.length > 70) titulo = titulo.substring(0, 67) + '...';

    let desc = '';
    if (producto.usado)       desc += 'PRODUCTO USADO / REFURBISHED\n\n';
    if (producto.descripcion) desc += `${producto.descripcion}\n\n`;
    if (producto.garantia)    desc += `Garantía: ${producto.garantia}\n`;
    if (producto.devolucion)  desc += `Devolución segura garantizada\n`;

    desc += `\nPrecio: $${precio} USD${mn}\n`;
    if (tasa > 0) desc += `Tasa: 1 USD = ${tasa} MN\n`;
    if (producto.precioOriginal > 0 && producto.precioOriginal > precio)
        desc += `Precio anterior: $${producto.precioOriginal} USD\n`;

    if (producto.stock === 0) {
        desc += '\n⚠️ AGOTADO — Consultar disponibilidad\n';
    } else if (producto.stock <= 5) {
        desc += `\nDisponibilidad: ${producto.stock} unidad${producto.stock !== 1 ? 'es' : ''}\n`;
    }

    desc += `\nContacto WhatsApp: ${whatsapp}\nMás info: ${url}`;
    return { titulo, descripcion: desc };
}

function previsualizarRevolico(productoId) {
    const producto = (typeof productos !== 'undefined') && productos.find(p => p.id === productoId);
    if (!producto) return;

    const catInfo = _REVOLICO_CATS[producto.categoria] || _REVOLICO_DEFAULT;
    const { titulo, descripcion } = _textoRevolico(producto);
    const imgSrc = producto.imagen || '';
    const revUrl = catInfo.url;

    const existing = document.getElementById('revPreviewModal');
    if (existing) document.body.removeChild(existing);

    const modal = document.createElement('div');
    modal.id = 'revPreviewModal';
    modal.className = 'modal';
    modal.style.display = 'flex';

    const sBtnBase = 'border:none;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;';

    modal.innerHTML = `
      <div class="modal-content" style="max-width:540px;max-height:92vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h2>🟠 Vista previa — Revolico</h2>
          <button class="close-btn" onclick="cerrarRevPreview()" type="button">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;">
          ${imgSrc ? `<img src="${imgSrc}" alt="" style="width:100%;max-height:160px;object-fit:contain;border-radius:10px;background:rgba(255,255,255,.05);">` : ''}

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label for="revTituloTA" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.6;">
                Título &nbsp;<span id="revTituloCount" style="color:#FF6B35;">${titulo.length}/70</span>
              </label>
              <button id="btnCopyTitulo" type="button" onclick="copiarRevTitulo()"
                style="${sBtnBase}background:rgba(255,107,53,.15);border:1px solid rgba(255,107,53,.35);color:#FF6B35;">📋 Copiar título</button>
            </div>
            <textarea id="revTituloTA" maxlength="70" rows="2"
              style="width:100%;padding:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:inherit;font-size:13px;resize:none;outline:none;font-family:inherit;box-sizing:border-box;">${titulo}</textarea>
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label for="revDescTA" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.6;">Descripción</label>
              <button id="btnCopyDesc" type="button" onclick="copiarRevDesc()"
                style="${sBtnBase}background:rgba(255,107,53,.15);border:1px solid rgba(255,107,53,.35);color:#FF6B35;">📋 Copiar descripción</button>
            </div>
            <textarea id="revDescTA" rows="8"
              style="width:100%;padding:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:inherit;font-size:12px;resize:vertical;outline:none;font-family:inherit;box-sizing:border-box;">${descripcion}</textarea>
          </div>

          <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(255,255,255,.05);border-radius:8px;font-size:12px;">
            <span style="opacity:.6;">Categoría sugerida:</span>
            <span style="font-weight:700;color:#FF6B35;">${catInfo.label}</span>
          </div>

          <button type="button" id="btnAbrirRev"
            style="width:100%;padding:14px;background:linear-gradient(135deg,#e67e22,#d35400);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;letter-spacing:.3px;box-sizing:border-box;">
            🟠 Copiar descripción y Abrir Revolico →
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    document.getElementById('revTituloTA').addEventListener('input', function() {
        document.getElementById('revTituloCount').textContent = `${this.value.length}/70`;
    });

    document.getElementById('btnAbrirRev').addEventListener('click', async function() {
        const desc = document.getElementById('revDescTA').value;
        await _copiar(desc);
        mostrarNotificacion('✅ Descripción copiada — pégala en Revolico', 'success');
        window.open(revUrl, '_blank', 'noopener,noreferrer');
        cerrarRevPreview();
    });
}

async function copiarRevTitulo() {
    const ta = document.getElementById('revTituloTA');
    if (!ta) return;
    await _copiar(ta.value);
    const btn = document.getElementById('btnCopyTitulo');
    if (btn) { btn.textContent = '✅ Copiado'; setTimeout(() => { btn.textContent = '📋 Copiar título'; }, 2000); }
}

async function copiarRevDesc() {
    const ta = document.getElementById('revDescTA');
    if (!ta) return;
    await _copiar(ta.value);
    const btn = document.getElementById('btnCopyDesc');
    if (btn) { btn.textContent = '✅ Copiado'; setTimeout(() => { btn.textContent = '📋 Copiar descripción'; }, 2000); }
}

function cerrarRevPreview() {
    const m = document.getElementById('revPreviewModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
}

// copiarYAbrirRevolico → abre la vista previa
async function copiarYAbrirRevolico(productoId) {
    previsualizarRevolico(productoId);
}

function mostrarSelectorAsistenteRevolico() {
    if (typeof productos === 'undefined' || !productos || productos.length === 0) {
        mostrarNotificacion('❌ No hay productos cargados', 'error'); return;
    }
    const existing = document.getElementById('revSelectorModal');
    if (existing) document.body.removeChild(existing);

    const modal = document.createElement('div');
    modal.id = 'revSelectorModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:560px;max-height:90vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h2>🟠 Publicar en Revolico</h2>
          <button class="close-btn" onclick="cerrarRevSelector()" type="button">✕</button>
        </div>
        <p style="font-size:12px;opacity:.7;margin:8px 0 12px;">
          Selecciona el producto. Se abre vista previa con título y descripción editables.
        </p>
        <input type="text" id="revSearch" placeholder="🔍 Buscar producto…" aria-label="Buscar producto para publicar en Revolico"
          style="width:100%;padding:8px 12px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.07);color:inherit;font-size:13px;margin-bottom:10px;outline:none;">
        <div id="revSelectorList" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;"></div>
      </div>`;

    document.body.appendChild(modal);

    function renderLista(filtro) {
        const list = document.getElementById('revSelectorList');
        list.innerHTML = '';
        const filtrados = productos.filter(p =>
            !filtro || p.nombre.toLowerCase().includes(filtro.toLowerCase())
        );
        filtrados.forEach(p => {
            const agotado  = p.stock === 0;
            const catInfo  = _REVOLICO_CATS[p.categoria] || _REVOLICO_DEFAULT;
            const row = document.createElement('div');
            row.style.cssText = `display:flex;justify-content:space-between;align-items:center;
                padding:9px 12px;background:rgba(255,255,255,${agotado ? '.03' : '.06'});
                border-radius:8px;opacity:${agotado ? '.5' : '1'};gap:10px;`;
            const info = document.createElement('div');
            info.style.cssText = 'font-size:13px;display:flex;flex-direction:column;gap:2px;min-width:0;';
            const nombre = document.createElement('span');
            nombre.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            nombre.textContent = p.nombre;
            const meta = document.createElement('span');
            meta.style.cssText = 'font-size:11px;opacity:.6;';
            meta.textContent = `$${p.precioActual} · ${agotado ? '🚫 Agotado' : `📦 ${p.stock} uds`} · ${catInfo.label}`;
            info.appendChild(nombre);
            info.appendChild(meta);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Vista previa';
            btn.style.cssText = 'background:#e67e22;color:#fff;border:none;padding:5px 14px;border-radius:6px;font-size:12px;cursor:pointer;flex-shrink:0;';
            btn.addEventListener('click', () => { cerrarRevSelector(); previsualizarRevolico(p.id); });
            row.appendChild(info);
            row.appendChild(btn);
            list.appendChild(row);
        });
        if (!filtrados.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align:center;padding:20px;opacity:.5;font-size:13px;';
            empty.textContent = 'No se encontraron productos';
            list.appendChild(empty);
        }
    }

    renderLista('');
    document.getElementById('revSearch').addEventListener('input', e => renderLista(e.target.value));
}

function cerrarRevSelector() {
    const m = document.getElementById('revSelectorModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
}
