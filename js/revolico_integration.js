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

// ── AI helpers ──────────────────────────────────────────────────────────────

async function _generarTextoFacebookAI(producto) {
    if (typeof tmAIChat !== 'function') throw new Error('Módulo IA no cargado');
    const whatsapp = localStorage.getItem('whatsappNumero') || '5354320170';
    const url = `https://tiendamax.org/p/producto-${producto.id}.html`;
    const tasa = _getTasa();
    const mn = _precioMN(producto.precioActual);
    const info = [
        `Producto: ${producto.nombre}`,
        `Precio: $${producto.precioActual} USD${mn}`,
        producto.descripcion && `Descripción: ${producto.descripcion}`,
        producto.garantia && `Garantía: ${producto.garantia}`,
        producto.stock === 0 ? 'AGOTADO (consultar restock)' : `Disponibilidad: ${producto.stock} unidades`,
        producto.usado && 'Producto usado/refurbished',
        tasa > 0 && `Tasa: 1 USD = ${tasa} MN`,
    ].filter(Boolean).join('\n');
    const prompt = `Escribe una publicación atractiva y variada para un grupo de ventas de Facebook en Cuba (español cubano). Usa emojis creativos. Incluye precio en USD y en MN si hay tasa. Termina con WhatsApp wa.me/${whatsapp} y el enlace ${url}. Responde SOLO con el texto listo para pegar, sin explicaciones.\n\n${info}`;
    return await tmAIChat(prompt, { max_tokens: 550, temperature: 0.85 });
}

async function _generarTextoRevolicoAI(producto) {
    if (typeof tmAIChat !== 'function') throw new Error('Módulo IA no cargado');
    const whatsapp = localStorage.getItem('whatsappNumero') || '5354320170';
    const url = `https://tiendamax.org/p/producto-${producto.id}.html`;
    const tasa = _getTasa();
    const mn = _precioMN(producto.precioActual);
    const info = [
        `Nombre: ${producto.nombre}`,
        `Precio: $${producto.precioActual} USD${mn}`,
        producto.descripcion && `Descripción: ${producto.descripcion}`,
        producto.garantia && `Garantía: ${producto.garantia}`,
        producto.stock === 0 ? 'AGOTADO' : `Stock: ${producto.stock} unidades`,
        producto.usado && 'Usado/refurbished',
        tasa > 0 && `Tasa: 1 USD = ${tasa} MN`,
    ].filter(Boolean).join('\n');
    const prompt = `Crea un anuncio optimizado para Revolico.com (clasificados Cuba). Devuelve JSON sin markdown:\n{"titulo":"máx 70 caracteres con nombre y precio","descripcion":"texto plano 200-350 chars con especificaciones, precio, WhatsApp ${whatsapp} y enlace ${url}"}\n\nDATOS:\n${info}`;
    const raw = await tmAIChat(prompt, { max_tokens: 600, temperature: 0.6 });
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
        try {
            const parsed = JSON.parse(m[0]);
            if (parsed.titulo || parsed.descripcion) return { titulo: String(parsed.titulo || '').slice(0, 70), descripcion: parsed.descripcion || '' };
        } catch (_) {}
    }
    return { titulo: '', descripcion: raw };
}

// ── Canvas helpers para imagen de anuncio ────────────────────────────────────

function _revRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r); ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
}

async function _revLoadImg(src) {
    if (!src) return null;
    return new Promise(res => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => res(img); img.onerror = () => res(null);
        img.src = src;
    });
}

function _revWrapText(ctx, text, x, y, maxW, lineH, maxLines) {
    const words = text.split(' ');
    let line = '', lines = 0;
    for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) {
            if (lines < maxLines) { ctx.fillText(line.trim(), x, y); y += lineH; lines++; }
            line = w;
        } else { line = test; }
    }
    if (line && lines < maxLines) { ctx.fillText(line.trim(), x, y); }
    return y + lineH;
}

async function _dibujarImagenAnuncio(canvas, producto) {
    const W = 1080, H = 1080;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Fondo degradado de marca
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0d0d0d'); bg.addColorStop(.6, '#2b160c'); bg.addColorStop(1, '#c0390a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Borde dorado
    ctx.strokeStyle = 'rgba(201,169,110,.8)'; ctx.lineWidth = 9;
    _revRoundRect(ctx, 38, 38, W-76, H-76, 46); ctx.stroke();

    // Foto del producto
    const im = await _revLoadImg(producto.imagen || '');
    const px = 76, py = 76, pw = W-152, ph = H - 76 - 200;
    if (im) {
        ctx.save(); _revRoundRect(ctx, px, py, pw, ph, 32); ctx.clip();
        const r = Math.max(pw/im.width, ph/im.height);
        ctx.drawImage(im, px+(pw-im.width*r)/2, py+(ph-im.height*r)/2, im.width*r, im.height*r);
        ctx.restore();
    } else {
        ctx.save(); _revRoundRect(ctx, px, py, pw, ph, 32); ctx.clip();
        const ph2 = ctx.createLinearGradient(px, py, px+pw, py+ph);
        ph2.addColorStop(0, '#1e3a5c'); ph2.addColorStop(1, '#0a1828');
        ctx.fillStyle = ph2; ctx.fillRect(px, py, pw, ph);
        ctx.font = '200px serif'; ctx.fillStyle = 'rgba(255,107,53,.2)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('📷', px+pw/2, py+ph/2);
        ctx.restore();
    }

    // Franja de marca abajo
    const barY = H - 200;
    const barGrad = ctx.createLinearGradient(0, barY, 0, H);
    barGrad.addColorStop(0, 'rgba(8,6,4,0)');
    barGrad.addColorStop(.35, 'rgba(8,6,4,.88)');
    barGrad.addColorStop(1, 'rgba(8,6,4,.97)');
    ctx.fillStyle = barGrad; ctx.fillRect(0, barY, W, H - barY);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 68px system-ui,Arial'; ctx.fillStyle = '#FF6B35';
    ctx.fillText('TiendaMax', W/2, H - 112);
    ctx.font = '36px system-ui,Arial'; ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.fillText('tiendamax.org', W/2, H - 58);
}

// ── end canvas helpers ────────────────────────────────────────────────────────

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

function previsualizarFacebook(productoId, grupoUrl) {
    const producto = (typeof productos !== 'undefined') && productos.find(p => p.id === productoId);
    if (!producto) return;

    const existing = document.getElementById('fbPreviewModal');
    if (existing) document.body.removeChild(existing);

    const modal = document.createElement('div');
    modal.id = 'fbPreviewModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    const imgSrc = producto.imagen || '';
    const fbUrl = grupoUrl || 'https://www.facebook.com';
    const sBtnBase = 'border:none;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;';

    modal.innerHTML = `
      <div class="modal-content" style="max-width:540px;max-height:92vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h2>📘 Vista previa — Facebook</h2>
          <button class="close-btn" onclick="cerrarFbPreview()" type="button">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;">
          ${imgSrc ? `<img src="${imgSrc}" alt="" style="width:100%;max-height:160px;object-fit:contain;border-radius:10px;background:rgba(255,255,255,.05);">` : ''}
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label for="fbPostTA" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.6;">Texto del post</label>
              <div style="display:flex;gap:6px;">
                <button id="btnFbAI" type="button" style="${sBtnBase}background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.4);color:#c4b5fd;">✨ Mejorar con IA</button>
                <button id="btnCopyFbPost" type="button" style="${sBtnBase}background:rgba(59,89,152,.15);border:1px solid rgba(59,89,152,.35);color:#93c5fd;">📋 Copiar</button>
              </div>
            </div>
            <textarea id="fbPostTA" rows="13"
              style="width:100%;padding:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:inherit;font-size:12px;resize:vertical;outline:none;font-family:inherit;box-sizing:border-box;"></textarea>
          </div>
          <button type="button" id="btnAbrirFb"
            style="width:100%;padding:14px;background:linear-gradient(135deg,#3B5998,#4267B2);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;letter-spacing:.3px;box-sizing:border-box;">
            📘 Copiar y Abrir Facebook →
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    document.getElementById('fbPostTA').value = _textoFacebook(producto);

    document.getElementById('btnFbAI')?.addEventListener('click', async function() {
        this.textContent = '⏳ Generando...';
        this.disabled = true;
        try {
            const texto = await _generarTextoFacebookAI(producto);
            document.getElementById('fbPostTA').value = texto;
            mostrarNotificacion('✅ Post mejorado con IA', 'success');
        } catch(e) {
            mostrarNotificacion('❌ ' + (e.message || 'Error IA'), 'error');
        } finally {
            this.textContent = '✨ Mejorar con IA';
            this.disabled = false;
        }
    });

    document.getElementById('btnCopyFbPost')?.addEventListener('click', async function() {
        await _copiar(document.getElementById('fbPostTA').value);
        this.textContent = '✅ Copiado';
        setTimeout(() => { this.textContent = '📋 Copiar'; }, 2000);
    });

    document.getElementById('btnAbrirFb')?.addEventListener('click', async function() {
        await _copiar(document.getElementById('fbPostTA').value);
        mostrarNotificacion('✅ Texto copiado — pégalo en Facebook', 'success');
        window.open(fbUrl, '_blank', 'noopener,noreferrer');
        cerrarFbPreview();
    });
}

function cerrarFbPreview() {
    const m = document.getElementById('fbPreviewModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
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
            btn.textContent = 'Vista previa';
            btn.style.cssText = 'background:#3B5998;color:#fff;border:none;padding:5px 14px;border-radius:6px;font-size:12px;cursor:pointer;flex-shrink:0;';
            btn.addEventListener('click', () => { cerrarFbSelector(); previsualizarFacebook(p.id, null); });
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

          <!-- Imagen de anuncio con branding -->
          <div>
            <canvas id="revImgCanvas" style="width:100%;border-radius:12px;display:block;background:#111;"></canvas>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button id="btnCopyRevImg" type="button"
                style="${sBtnBase}flex:1;padding:8px 12px;background:rgba(255,107,53,.15);border:1px solid rgba(255,107,53,.35);color:#FF6B35;">📋 Copiar imagen</button>
              <button id="btnDlRevImg" type="button"
                style="${sBtnBase}flex:1;padding:8px 12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#ccc;">⬇️ Descargar</button>
            </div>
          </div>

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
              <div style="display:flex;gap:6px;">
                <button id="btnRevAI" type="button"
                  style="${sBtnBase}background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.4);color:#c4b5fd;">✨ IA</button>
                <button id="btnCopyDesc" type="button" onclick="copiarRevDesc()"
                  style="${sBtnBase}background:rgba(255,107,53,.15);border:1px solid rgba(255,107,53,.35);color:#FF6B35;">📋 Copiar</button>
              </div>
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

    // Generar imagen de anuncio con branding
    const revCanvas = document.getElementById('revImgCanvas');
    if (revCanvas) {
        _dibujarImagenAnuncio(revCanvas, producto).catch(() => {
            revCanvas.style.display = 'none';
        });
    }

    document.getElementById('btnCopyRevImg')?.addEventListener('click', async function() {
        const cv = document.getElementById('revImgCanvas');
        if (!cv) return;
        cv.toBlob(async blob => {
            try {
                await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
                mostrarNotificacion('✅ Imagen copiada — pégala en el campo de foto de Revolico', 'success');
            } catch(e) {
                mostrarNotificacion('❌ No se pudo copiar — usa ⬇️ Descargar', 'error');
            }
        }, 'image/png', .95);
    });

    document.getElementById('btnDlRevImg')?.addEventListener('click', function() {
        const cv = document.getElementById('revImgCanvas');
        if (!cv) return;
        const a = document.createElement('a');
        a.download = `anuncio-${producto.id}.png`;
        a.href = cv.toDataURL('image/png', .95);
        a.click();
    });

    document.getElementById('revTituloTA')?.addEventListener('input', function() {
        const count = document.getElementById('revTituloCount');
        if (count) count.textContent = `${this.value.length}/70`;
    });

    document.getElementById('btnRevAI')?.addEventListener('click', async function() {
        this.textContent = '⏳...';
        this.disabled = true;
        try {
            const result = await _generarTextoRevolicoAI(producto);
            if (result.titulo) {
                const ta = document.getElementById('revTituloTA');
                if (ta) { ta.value = result.titulo; }
                const count = document.getElementById('revTituloCount');
                if (count) count.textContent = `${result.titulo.length}/70`;
            }
            if (result.descripcion) {
                const da = document.getElementById('revDescTA');
                if (da) da.value = result.descripcion;
            }
            mostrarNotificacion('✅ Anuncio mejorado con IA', 'success');
        } catch(e) {
            mostrarNotificacion('❌ ' + (e.message || 'Error IA'), 'error');
        } finally {
            this.textContent = '✨ IA';
            this.disabled = false;
        }
    });

    document.getElementById('btnAbrirRev')?.addEventListener('click', async function() {
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

// ── Botones "Publicar" directos en la lista de configuración de Revolico ─────
(function() {
    const BTN_STYLE = 'background:#e67e22;color:#fff;border:none;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;margin-left:4px;';

    function _addPublishButtons() {
        const lista = document.getElementById('listaRevolicoConfig');
        if (!lista || typeof productos === 'undefined') return;
        lista.querySelectorAll(':scope > div').forEach(row => {
            if (row.querySelector('.rev-pub-direct')) return;
            if (!row.querySelector('select')) return; // agotado rows have no select
            const nameEl = row.querySelector('span');
            if (!nameEl) return;
            const nombre = nameEl.textContent.trim();
            const prod = productos.find(p => p.nombre === nombre);
            if (!prod) return;
            const btn = document.createElement('button');
            btn.className = 'rev-pub-direct';
            btn.type = 'button';
            btn.textContent = '🟠 Publicar';
            btn.style.cssText = BTN_STYLE;
            btn.addEventListener('click', () => previsualizarRevolico(prod.id));
            row.appendChild(btn);
        });
    }

    // Patch renderizarRevolicoConfig so buttons are added every time the list re-renders
    function _patchIfReady() {
        if (typeof window.renderizarRevolicoConfig !== 'function') {
            setTimeout(_patchIfReady, 200);
            return;
        }
        const _orig = window.renderizarRevolicoConfig;
        window.renderizarRevolicoConfig = function() {
            _orig.apply(this, arguments);
            setTimeout(_addPublishButtons, 0);
        };
        _addPublishButtons(); // run once for already-rendered list
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _patchIfReady);
    } else {
        _patchIfReady();
    }
})();
