/**
 * revolico_integration.js — TiendaMax
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
        'WiFi': '#wifi #router #internet',
        'Energía': '#energia #solar #bateria',
        'Herramientas': '#herramientas #tools',
        'Electrónica': '#electronica #tecnologia',
        'Celulares': '#celular #movil #smartphone',
        'Computación': '#computacion #laptop #pc',
        'Hogar': '#hogar #casa',
        'Audio': '#audio #sonido #musica',
        'Cámaras': '#camara #fotografia',
        'Iluminación': '#iluminacion #led',
    };
    const base = '#tiendamax #cuba #oferta #envio';
    const cat  = mapa[categoria] || '#tecnologia';
    return `${base} ${cat}`;
}

// ── Copiar al portapapeles ─────────────────────────────────────
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

    t += '\n';
    t += `💰 Precio: $${precio} USD${mn}\n`;

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

    const texto = _textoFacebook(producto);
    await _copiar(texto);

    mostrarNotificacion('✅ Texto copiado — pégalo en Facebook', 'success');

    const destino = grupoUrl || 'https://www.facebook.com';
    window.open(destino, '_blank', 'noopener,noreferrer');
}

function mostrarSelectorAsistenteFacebook() {
    if (typeof productos === 'undefined' || !productos || productos.length === 0) {
        mostrarNotificacion('❌ No hay productos cargados', 'error'); return;
    }
    const existing = document.getElementById('fbSelectorModal');
    if (existing) { document.body.removeChild(existing); }

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
           </div>`
        : '';

    modal.innerHTML = `
      <div class="modal-content" style="max-width:560px;max-height:90vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h2>📘 Publicar en Facebook</h2>
          <button class="close-btn" onclick="cerrarFbSelector()" type="button">✕</button>
        </div>
        <p style="font-size:12px;opacity:.7;margin:8px 0 12px;">El texto se copia automáticamente. Pégalo en el grupo.</p>
        ${gruposHtml}
        <input type="text" id="fbSearch" placeholder="🔍 Buscar producto…"
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
            btn.textContent = 'Copiar';
            btn.style.cssText = 'background:#3B5998;color:#fff;border:none;padding:5px 14px;border-radius:6px;font-size:12px;cursor:pointer;flex-shrink:0;';
            btn.addEventListener('click', () => {
                copiarYAbrirFacebook(p.id, null);
                cerrarFbSelector();
            });
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
            const idx = parseInt(btn.dataset.grupoIdx);
            const grupo = gruposFB[idx];
            const primerProducto = productos.find(p => p.stock > 0) || productos[0];
            if (primerProducto) copiarYAbrirFacebook(primerProducto.id, grupo.url);
            cerrarFbSelector();
        });
    });
}

function cerrarFbSelector() {
    const m = document.getElementById('fbSelectorModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
}

// Publicar todos los productos asignados a un grupo específico
function publicarEnGrupoFB(iGrupo) {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    const grupo = grupos[iGrupo];
    if (!grupo || !grupo.url) {
        mostrarNotificacion('❌ Agrega la URL del grupo primero', 'error'); return;
    }
    const idsAsignados = grupo.productos || [];
    const prods = (typeof productos !== 'undefined')
        ? productos.filter(p => idsAsignados.includes(p.id))
              .sort((a, b) => (!a.stock || a.stock <= 0) - (!b.stock || b.stock <= 0))
        : [];
    if (prods.length === 0) {
        mostrarNotificacion('❌ No hay productos seleccionados para este grupo', 'error'); return;
    }

    const existing = document.getElementById('grupoPublicarModal');
    if (existing) document.body.removeChild(existing);

    const modal = document.createElement('div');
    modal.id = 'grupoPublicarModal';
    modal.className = 'modal';
    modal.style.display = 'flex';

    const nombreGrupo = _escH(grupo.nombre || grupo.url);

    modal.innerHTML = `
      <div class="modal-content" style="max-width:520px;max-height:90vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h2>📢 Publicar en: ${nombreGrupo}</h2>
          <button class="close-btn" onclick="cerrarGrupoPublicarModal()" type="button">✕</button>
        </div>
        <p style="font-size:12px;opacity:.7;margin:8px 0 12px;">
          Haz clic en cada producto. El texto se copia y se abre el grupo — pega y publica, luego vuelve y continúa con el siguiente.
        </p>
        <div id="grupoPublicarList" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;"></div>
      </div>`;

    document.body.appendChild(modal);

    const list = document.getElementById('grupoPublicarList');
    prods.forEach((p, idx) => {
        const agotado = p.stock === 0;
        const row = document.createElement('div');
        row.id = `gprow_${p.id}`;
        row.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 12px;
            background:rgba(255,255,255,${agotado ? '.03' : '.06'});border-radius:10px;
            opacity:${agotado ? '.5' : '1'};`;

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
            btn.style.cssText = 'background:#555;color:#999;border:none;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:not-allowed;white-space:nowrap;flex-shrink:0;';
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

        row.appendChild(num);
        row.appendChild(info);
        row.appendChild(btn);
        list.appendChild(row);
    });
}

function cerrarGrupoPublicarModal() {
    const m = document.getElementById('grupoPublicarModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
}


// ══════════════════════════════════════════════════════════════
//  REVOLICO
// ══════════════════════════════════════════════════════════════

const _REVOLICO_CATS = {
    'WiFi':          { label: 'Computación > Redes',       url: 'https://www.revolico.com/anuncios/nuevo/?c=58' },
    'Energía':       { label: 'Electrónica > Baterías',    url: 'https://www.revolico.com/anuncios/nuevo/?c=74' },
    'Herramientas':  { label: 'Herramientas',              url: 'https://www.revolico.com/anuncios/nuevo/?c=23' },
    'Electrónica':   { label: 'Electrónica',               url: 'https://www.revolico.com/anuncios/nuevo/?c=9'  },
    'Celulares':     { label: 'Celulares y Tablets',       url: 'https://www.revolico.com/anuncios/nuevo/?c=7'  },
    'Computación':   { label: 'Computación',               url: 'https://www.revolico.com/anuncios/nuevo/?c=8'  },
    'Hogar':         { label: 'Hogar',                     url: 'https://www.revolico.com/anuncios/nuevo/?c=10' },
    'Audio':         { label: 'Electrónica > Audio',       url: 'https://www.revolico.com/anuncios/nuevo/?c=72' },
    'Cámaras':       { label: 'Electrónica > Fotografía',  url: 'https://www.revolico.com/anuncios/nuevo/?c=73' },
    'Iluminación':   { label: 'Electrónica',               url: 'https://www.revolico.com/anuncios/nuevo/?c=9'  },
};
const _REVOLICO_DEFAULT = 'https://www.revolico.com/anuncios/nuevo/?c=9';

function _textoRevolico(producto) {
    const whatsapp = localStorage.getItem('whatsappNumero') || '5354320170';
    const url      = `https://tiendamax.org/p/producto-${producto.id}.html`;
    const precio   = producto.precioActual;
    const mn       = _precioMN(precio);
    const tasa     = _getTasa();

    let titulo = producto.nombre;
    if (producto.precioActual) titulo += ` - $${precio} USD${mn}`;
    if (titulo.length > 70) titulo = titulo.substring(0, 67) + '...';

    let desc = '';
    if (producto.usado) desc += 'PRODUCTO USADO / REFURBISHED\n\n';
    if (producto.descripcion) desc += `${producto.descripcion}\n\n`;

    if (producto.garantia)   desc += `Garantía: ${producto.garantia}\n`;
    if (producto.devolucion) desc += `Devolución segura garantizada\n`;

    desc += `\nPrecio: $${precio} USD${mn}\n`;
    if (tasa > 0) desc += `Tasa: 1 USD = ${tasa} MN\n`;

    if (producto.precioOriginal > 0 && producto.precioOriginal > precio) {
        desc += `Precio anterior: $${producto.precioOriginal} USD\n`;
    }

    if (producto.stock === 0) {
        desc += '\n⚠️ AGOTADO — Consultar disponibilidad\n';
    } else if (producto.stock <= 5) {
        desc += `\nDisponibilidad: ${producto.stock} unidad${producto.stock !== 1 ? 'es' : ''}\n`;
    }

    desc += `\nContacto: WhatsApp ${whatsapp}\nVer más: ${url}`;

    return { titulo, descripcion: desc };
}

async function copiarYAbrirRevolico(productoId) {
    const producto = (typeof productos !== 'undefined') && productos.find(p => p.id === productoId);
    if (!producto) return;

    const { titulo, descripcion } = _textoRevolico(producto);
    const textoCompleto = `${titulo}\n\n${descripcion}`;
    await _copiar(textoCompleto);

    const catInfo  = _REVOLICO_CATS[producto.categoria];
    const revUrl   = catInfo ? catInfo.url : _REVOLICO_DEFAULT;
    const catLabel = catInfo ? catInfo.label : 'Electrónica';

    mostrarNotificacion(`✅ Copiado — Categoría sugerida: ${catLabel}`, 'success');
    window.open(revUrl, '_blank', 'noopener,noreferrer');
}

function mostrarSelectorAsistenteRevolico() {
    if (typeof productos === 'undefined' || !productos || productos.length === 0) {
        mostrarNotificacion('❌ No hay productos cargados', 'error'); return;
    }
    const existing = document.getElementById('revSelectorModal');
    if (existing) { document.body.removeChild(existing); }

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
          El texto y título se copian listos. Revolico se abre en la categoría correcta automáticamente.
        </p>
        <input type="text" id="revSearch" placeholder="🔍 Buscar producto…"
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
            const catInfo  = _REVOLICO_CATS[p.categoria];
            const catLabel = catInfo ? catInfo.label : 'Electrónica';
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
            meta.textContent = `$${p.precioActual} · ${agotado ? '🚫 Agotado' : `📦 ${p.stock} uds`} · 📁 ${catLabel}`;
            info.appendChild(nombre);
            info.appendChild(meta);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Copiar y Abrir';
            btn.style.cssText = 'background:#FF6B35;color:#fff;border:none;padding:5px 14px;border-radius:6px;font-size:12px;cursor:pointer;flex-shrink:0;';
            btn.addEventListener('click', () => {
                copiarYAbrirRevolico(p.id);
                cerrarRevSelector();
            });
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
