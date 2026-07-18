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
    const info = [
        `Producto: ${producto.nombre}`,
        `Precio: $${producto.precioActual} USD`,
        producto.descripcion && `Descripción: ${producto.descripcion}`,
        producto.garantia && `Garantía: ${producto.garantia}`,
        producto.usado && 'Producto usado/refurbished',
    ].filter(Boolean).join('\n');
    const prompt = `Escribe una publicación atractiva y variada para un grupo de ventas de Facebook en Cuba (español cubano). Usa emojis creativos. Muestra el precio SOLO en USD (no menciones precio en MN/CUP ni la cantidad en stock). Termina con WhatsApp wa.me/${whatsapp} y el enlace ${url}. Responde SOLO con el texto listo para pegar, sin explicaciones.\n\n${info}`;
    return await tmAIChat(prompt, { max_tokens: 550, temperature: 0.85 });
}

async function _generarTextoRevolicoAI(producto) {
    if (typeof tmAIChat !== 'function') throw new Error('Módulo IA no cargado');
    const url  = `https://tiendamax.org/p/producto-${producto.id}.html`;
    const tags = _hashtagsCategoria(producto.categoria);
    const info = [
        `Nombre: ${producto.nombre}`,
        `Precio: $${producto.precioActual} USD`,
        producto.descripcion && `Descripción: ${producto.descripcion}`,
        producto.garantia && `Garantía: ${producto.garantia}`,
        producto.stock === 0 ? 'AGOTADO' : `Stock: ${producto.stock} unidades`,
        producto.usado && 'Usado/refurbished',
    ].filter(Boolean).join('\n');
    const prompt = `Crea un anuncio para Revolico.com (clasificados Cuba). Responde SOLO con JSON válido, sin markdown ni bloques de código:\n{"titulo":"solo nombre del producto, máx 70 chars, sin precio","descripcion":"descripción persuasiva en texto plano, 150-280 chars, menciona especificaciones clave y disponibilidad. NO incluir precio ni número de WhatsApp (Revolico los muestra automáticamente). Terminar con enlace ${url} y los hashtags: ${tags}"}\n\nDATOS DEL PRODUCTO:\n${info}`;
    const raw = await tmAIChat(prompt, { max_tokens: 700, temperature: 0.65 });
    // Extraer JSON — intenta con y sin bloque de código
    const clean = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) {
        try {
            const parsed = JSON.parse(m[0]);
            return {
                titulo: String(parsed.titulo || producto.nombre).slice(0, 70),
                descripcion: String(parsed.descripcion || raw)
            };
        } catch (_) {}
    }
    // Fallback: usar respuesta como descripción
    return { titulo: producto.nombre.slice(0, 70), descripcion: clean.slice(0, 500) };
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
    const hashtags = _hashtagsCategoria(producto.categoria);

    let t = `✨ ${producto.nombre}\n\n`;

    if (producto.usado) t += '♻️ Producto usado / refurbished\n\n';
    if (producto.descripcion) t += `${producto.descripcion}\n\n`;

    t += '━━━━━━━━━━━━━━━━━━━━━\n';

    if (producto.precioOriginal > 0 && producto.precioOriginal > precio) {
        const ahorro = (producto.precioOriginal - precio).toFixed(0);
        t += `~~$${producto.precioOriginal} USD~~   👉  💰 $${precio} USD\n`;
        t += `🎉 Ahorras $${ahorro} USD\n`;
    } else {
        t += `💰 Precio: $${precio} USD\n`;
    }

    if (producto.garantia)   t += `🛡️ Garantía: ${producto.garantia}\n`;
    if (producto.devolucion) t += `✅ Devolución segura garantizada\n`;

    t += '\n━━━━━━━━━━━━━━━━━━━━━\n';
    t += `📲 Pedir ahora → wa.me/${whatsapp}\n`;
    t += `🔗 ${url}\n\n`;
    t += hashtags;

    return t;
}

async function copiarYAbrirFacebook(productoId, grupoUrl) {
    const _allProds = (() => { try { if (Array.isArray(window.productos)) return window.productos; } catch(e){} try { return JSON.parse(localStorage.getItem('productos')||'[]'); } catch(e){ return []; } })();
    const producto = _allProds.find(p => String(p.id) === String(productoId));
    if (!producto) return;
    await _copiar(_textoFacebook(producto));
    mostrarNotificacion('✅ Texto copiado — pégalo en Facebook', 'success');
    window.open(grupoUrl || 'https://www.facebook.com', '_blank', 'noopener,noreferrer');
}

function previsualizarFacebook(productoId, grupoUrl) {
    const _allProds = (() => { try { if (Array.isArray(window.productos)) return window.productos; } catch(e){} try { return JSON.parse(localStorage.getItem('productos')||'[]'); } catch(e){ return []; } })();
    const producto = _allProds.find(p => String(p.id) === String(productoId));
    if (!producto) return;

    const _grupos = (() => { try { return JSON.parse(localStorage.getItem('gruposFB') || '[]').filter(g => g && g.url && g.url.includes('facebook.com')); } catch(e) { return []; } })();

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
          ${_grupos.length ? `<button type="button" id="btnFbAllGroups"
            style="width:100%;padding:14px;background:linear-gradient(135deg,#FF6B35,#C9A96E);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;letter-spacing:.3px;box-sizing:border-box;">
            📢 Abrir en todos mis grupos (${_grupos.length})
          </button>` : ''}
          <button type="button" id="btnAbrirFb"
            style="width:100%;padding:14px;background:linear-gradient(135deg,#3B5998,#4267B2);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;letter-spacing:.3px;box-sizing:border-box;">
            📘 Copiar y Abrir ${_grupos.length ? 'un grupo' : 'Facebook'} →
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    document.getElementById('fbPostTA').value = _textoFacebook(producto);

    // Abrir TODOS los grupos a la vez: abre las pestañas (síncrono, para que el
    // navegador no bloquee los pop-ups) y luego copia el texto. Pegas en cada una.
    document.getElementById('btnFbAllGroups')?.addEventListener('click', function() {
        let abiertos = 0;
        _grupos.forEach(g => { try { const w = window.open(g.url, '_blank', 'noopener,noreferrer'); if (w) abiertos++; } catch(e) {} });
        _copiar(document.getElementById('fbPostTA').value);
        if (abiertos >= _grupos.length) {
            mostrarNotificacion(`✅ Texto copiado · abrí ${abiertos} grupo(s). Pega (Ctrl/Cmd+V) y publica en cada pestaña.`, 'success');
        } else {
            mostrarNotificacion(`⚠️ El navegador bloqueó algunas ventanas (abrí ${abiertos}/${_grupos.length}). Permite las ventanas emergentes para este sitio y vuelve a intentar.`, 'warning');
        }
    });

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
            meta.textContent = `$${p.precioActual} USD${agotado ? ' · 🚫 Agotado' : ''}`;
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
        meta.textContent = `$${p.precioActual}${agotado ? ' · 🚫 Agotado' : ''}`;
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
    const url   = `https://tiendamax.org/p/producto-${producto.id}.html`;
    const tags  = _hashtagsCategoria(producto.categoria);

    // Título: solo nombre, sin precio (Revolico tiene campo de precio separado)
    let titulo = producto.nombre;
    if (titulo.length > 70) titulo = titulo.substring(0, 67) + '...';

    let desc = '';
    if (producto.usado)       desc += 'PRODUCTO USADO / REFURBISHED\n\n';
    if (producto.descripcion) desc += `${producto.descripcion}\n\n`;
    if (producto.garantia)    desc += `Garantía: ${producto.garantia}\n`;
    if (producto.devolucion)  desc += `Devolución segura garantizada\n`;

    if (producto.stock === 0) {
        desc += '\n⚠️ AGOTADO — Consultar disponibilidad\n';
    } else if (producto.stock <= 5) {
        desc += `\nDisponibilidad: ${producto.stock} unidad${producto.stock !== 1 ? 'es' : ''}\n`;
    }

    desc += `\nMás info: ${url}\n\n${tags}`;
    return { titulo, descripcion: desc.trim() };
}

function previsualizarRevolico(productoId) {
    const _allProds = (() => { try { if (Array.isArray(window.productos)) return window.productos; } catch(e){} try { return JSON.parse(localStorage.getItem('productos')||'[]'); } catch(e){ return []; } })();
    const producto = _allProds.find(p => String(p.id) === String(productoId));
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
              style="width:100%;padding:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:inherit;font-size:13px;resize:none;outline:none;font-family:inherit;box-sizing:border-box;">${_escH(titulo)}</textarea>
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label for="revPrecioInp" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.6;">Precio (USD)</label>
              <button id="btnCopyPrecio" type="button"
                style="${sBtnBase}background:rgba(255,107,53,.15);border:1px solid rgba(255,107,53,.35);color:#FF6B35;">📋 Copiar precio</button>
            </div>
            <input id="revPrecioInp" type="text" value="${Number(producto.precioActual || 0)}"
              style="width:100%;padding:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,107,53,.18);border-radius:8px;color:#FF6B35;font-size:15px;font-weight:700;outline:none;font-family:inherit;box-sizing:border-box;">
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
              style="width:100%;padding:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:inherit;font-size:12px;resize:vertical;outline:none;font-family:inherit;box-sizing:border-box;">${_escH(descripcion)}</textarea>
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
                await navigator.clipboard.write([new ClipboardItem({'image/jpeg': blob})]);
                mostrarNotificacion('✅ Imagen copiada — pégala en el campo de foto de Revolico', 'success');
            } catch(e) {
                mostrarNotificacion('❌ No se pudo copiar — usa ⬇️ Descargar', 'error');
            }
        }, 'image/jpeg', 0.85);
    });

    document.getElementById('btnDlRevImg')?.addEventListener('click', function() {
        const cv = document.getElementById('revImgCanvas');
        if (!cv) return;
        const a = document.createElement('a');
        a.download = `anuncio-${producto.id}.jpg`;
        a.href = cv.toDataURL('image/jpeg', 0.85);
        a.click();
    });

    document.getElementById('revTituloTA')?.addEventListener('input', function() {
        const count = document.getElementById('revTituloCount');
        if (count) count.textContent = `${this.value.length}/70`;
    });

    document.getElementById('btnCopyPrecio')?.addEventListener('click', async function() {
        const val = document.getElementById('revPrecioInp')?.value || '';
        await _copiar(val);
        this.textContent = '✅ Copiado';
        setTimeout(() => { this.textContent = '📋 Copiar precio'; }, 2000);
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
        mostrarNotificacion('✅ Descripción copiada — regresa aquí para copiar más campos', 'success');
        sessionStorage.setItem('_tmRevActive', String(productoId));
        window.open(revUrl, '_blank', 'noopener,noreferrer');
        // No cerrar el modal — el usuario regresa a esta pantalla para seguir copiando
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
    sessionStorage.removeItem('_tmRevActive');
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

// ══════════════════════════════════════════════════════════════
//  NUEVO TAB PUBLICAR — lista de productos con botones directos
// ══════════════════════════════════════════════════════════════
(function () {

    // ── helpers localStorage ──────────────────────────────────
    function _getGrupos() { try { return JSON.parse(localStorage.getItem('gruposFB') || '[]'); } catch (e) { return []; } }
    function _setGrupos(g) { localStorage.setItem('gruposFB', JSON.stringify(g)); }
    function _getGrupoProd(id) { try { return JSON.parse(localStorage.getItem('tm_prod_grupo') || '{}')[id] ?? null; } catch (e) { return null; } }
    function _setGrupoProd(id, idx) { const m = JSON.parse(localStorage.getItem('tm_prod_grupo') || '{}'); m[id] = idx; localStorage.setItem('tm_prod_grupo', JSON.stringify(m)); }
    function _getLastPub(id) { try { return JSON.parse(localStorage.getItem('tm_last_pub') || '{}')[id] || null; } catch (e) { return null; } }
    function _setLastPub(id) { const m = JSON.parse(localStorage.getItem('tm_last_pub') || '{}'); m[id] = Date.now(); localStorage.setItem('tm_last_pub', JSON.stringify(m)); }

    // ── estado interno ────────────────────────────────────────
    let _filtroCat = '', _filtroTxt = '';

    function _prods() {
        try { if (Array.isArray(window.productos)) return window.productos; } catch (e) { }
        try { return JSON.parse(localStorage.getItem('productos') || '[]'); } catch (e) { return []; }
    }

    // ── render completo del tab ───────────────────────────────
    function renderTabPublicar() {
        const root = document.getElementById('tmPublicarRoot');
        if (!root) return;

        const todos = _prods();
        if (!todos.length) {
            root.innerHTML = '<div style="padding:24px;text-align:center;color:#555;font-size:13px;">No hay productos cargados.</div>';
            return;
        }

        const cats = [...new Set(todos.map(p => p.categoria).filter(Boolean))].sort();

        root.innerHTML = `
<style>
.tm-pub-cats{display:flex!important;gap:7px!important;flex-wrap:nowrap!important;overflow-x:auto!important;padding-bottom:6px;scrollbar-width:none;margin-bottom:10px}
.tm-pub-cats::-webkit-scrollbar{display:none}
.tm-pub-chip{display:inline-block!important;border:1px solid #333!important;border-radius:20px!important;padding:5px 13px!important;font-size:11px!important;font-weight:700!important;cursor:pointer!important;white-space:nowrap!important;background:#1a1a25!important;color:#888!important;flex-shrink:0!important;min-height:auto!important;width:auto!important;transition:all .15s}
.tm-pub-chip.on{background:#FF6B35!important;border-color:#FF6B35!important;color:#fff!important}
.tm-pub-search{position:relative;margin-bottom:10px}
.tm-pub-search input{width:100%!important;min-height:auto!important;height:38px!important;background:#1a1a25;border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#f0f0f0;font-size:13px;padding:8px 14px 8px 36px;outline:none}
.tm-pub-search input::placeholder{color:#444}
.tm-pub-search .si{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#444;font-size:14px;pointer-events:none}
.tm-pub-acc{background:#1a1a23;border:1px solid rgba(255,255,255,.08);border-radius:14px;margin-bottom:10px;overflow:hidden}
.tm-pub-acc-btn{width:100%;background:none;border:none;min-height:auto;color:#f0f0f0;padding:12px 16px;display:flex!important;align-items:center;justify-content:space-between;cursor:pointer;font-size:14px;font-weight:700;gap:10px}
.tm-pub-acc-btn:hover{background:rgba(255,255,255,.03)}
.tm-pub-acc-left{display:flex;align-items:center;gap:10px}
.tm-pub-badge{font-size:11px;font-weight:800;padding:2px 9px;border-radius:20px}
.tm-pub-badge.s{background:rgba(255,107,53,.15);color:#FF6B35}
.tm-pub-badge.a{background:rgba(231,76,60,.12);color:#e74c3c}
.tm-pub-acc-arrow{font-size:12px;color:#555;transition:transform .2s}
.tm-pub-acc-btn.open .tm-pub-acc-arrow{transform:rotate(180deg)}
.tm-pub-acc-body{display:none;border-top:1px solid rgba(255,255,255,.07)}
.tm-pub-acc-body.open{display:block}
.tm-pub-row{display:flex!important;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.04);transition:background .15s}
.tm-pub-row:last-child{border-bottom:none}
.tm-pub-row:hover{background:rgba(255,255,255,.02)}
.tm-pub-thumb{width:46px;height:46px;border-radius:9px;background:#252535;flex-shrink:0;object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:20px}
.tm-pub-info{flex:1;min-width:0}
.tm-pub-nom{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-pub-precio{font-size:11px;color:#777;margin-top:2px}
.tm-pub-btns{display:flex!important;gap:5px;flex-shrink:0;flex-direction:column;align-items:flex-end}
.tm-pub-btnrow{display:flex!important;gap:5px}
.sh-b{border:none!important;border-radius:7px!important;font-size:10px!important;font-weight:700!important;cursor:pointer!important;padding:6px 9px!important;white-space:nowrap!important;min-height:auto!important;width:auto!important;transition:transform .1s}
.sh-b:active{transform:scale(.92)}
.sh-b.wa{background:rgba(37,211,102,.15)!important;border:1px solid rgba(37,211,102,.3)!important;color:#4ade80!important}
.sh-b.fb{background:rgba(59,89,152,.2)!important;border:1px solid rgba(59,89,152,.4)!important;color:#93c5fd!important}
.sh-b.fb.sg{background:rgba(96,165,250,.15)!important;border:1px solid rgba(96,165,250,.4)!important;color:#60a5fa!important;max-width:100px;overflow:hidden;text-overflow:ellipsis}
.sh-b.fg{background:#111!important;border:1px solid #333!important;color:#555!important;font-size:9px!important}
.sh-b.rv{background:rgba(230,126,34,.15)!important;border:1px solid rgba(230,126,34,.35)!important;color:#fb923c!important}
</style>

<div class="tm-pub-cats" id="tmPubCats">
  <div class="tm-pub-chip on" onclick="tmPubFiltrarCat(this,'')">Todas</div>
  ${cats.map(c => `<div class="tm-pub-chip" onclick="tmPubFiltrarCat(this,'${_escH(c)}')">${_escH(c)}</div>`).join('')}
</div>

<div class="tm-pub-search">
  <span class="si">🔍</span>
  <input type="text" placeholder="Buscar producto…" oninput="tmPubBuscar(this.value)" autocomplete="off">
</div>

<div id="tmPubListaStock"></div>
<div id="tmPubListaAgo"></div>`;

        _renderListas();
    }

    function _renderListas() {
        const todos = _prods();
        const filtra = arr => arr.filter(p => {
            const cOk = !_filtroCat || p.categoria === _filtroCat;
            const tOk = !_filtroTxt || (p.nombre || '').toLowerCase().includes(_filtroTxt.toLowerCase());
            return cOk && tOk;
        });

        const stock = filtra(todos.filter(p => Number(p.stock || 0) > 0));
        const ago   = filtra(todos.filter(p => Number(p.stock || 0) <= 0));

        const bs = document.getElementById('tmPubListaStock');
        const ba = document.getElementById('tmPubListaAgo');
        if (!bs || !ba) return;

        bs.innerHTML = _accHtml('tmAccStock', '📦 Con stock', 's', stock, false, true);
        ba.innerHTML = _accHtml('tmAccAgo',   '🚫 Agotados',  'a', ago,   true,  false);

        // wire open toggles
        ['tmAccStock', 'tmAccAgo'].forEach(id => {
            const btn = document.getElementById(id + 'Btn');
            if (btn) btn.onclick = () => {
                const body = document.getElementById(id + 'Body');
                const open = body.classList.contains('open');
                body.classList.toggle('open', !open);
                btn.classList.toggle('open', !open);
            };
        });
    }

    function _accHtml(id, label, badgeCls, prods, agotado, defaultOpen) {
        const rows = prods.map(p => _rowHtml(p, agotado)).join('');
        const empty = `<div style="padding:16px;text-align:center;font-size:12px;color:#555;">Sin productos.</div>`;
        return `
<div class="tm-pub-acc">
  <button class="tm-pub-acc-btn${defaultOpen ? ' open' : ''}" id="${id}Btn">
    <div class="tm-pub-acc-left">
      <span>${label}</span>
      <span class="tm-pub-badge ${badgeCls}">${prods.length}</span>
    </div>
    <span class="tm-pub-acc-arrow">▾</span>
  </button>
  <div class="tm-pub-acc-body${defaultOpen ? ' open' : ''}" id="${id}Body">
    ${rows || empty}
  </div>
</div>`;
    }

    function _rowHtml(p, agotado) {
        const grpIdx = _getGrupoProd(p.id);
        const grupos = _getGrupos();
        const grp    = grpIdx != null && grupos[grpIdx] ? grupos[grpIdx] : null;
        const fbLbl  = grp ? '📘 ' + (grp.nombre.length > 12 ? grp.nombre.slice(0, 11) + '…' : grp.nombre) : '📘 FB';
        const fbCls  = grp ? 'sh-b fb sg' : 'sh-b fb';
        const addBtn = grp ? '' : `<button class="sh-b fg" onclick="tmPubFBAgregar('${p.id}')">+grp</button>`;

        const lastT = _getLastPub(p.id);
        let lastTxt = 'Sin publicar', recentCls = '';
        if (lastT) {
            const h = Math.round((Date.now() - lastT) / 3600000);
            lastTxt = h < 24 ? `Publicado hace ${h}h` : `Publicado hace ${Math.round(h / 24)}d`;
            recentCls = (Date.now() - lastT) < 86400000 * 2 ? 'r' : '';
        }

        const precioStr = agotado
            ? '<span style="color:#e74c3c">Agotado</span>'
            : `$${Number(p.precioActual || 0)} USD · ${p.stock} uds`;

        const imgEl = p.imagen
            ? `<img class="tm-pub-thumb" src="${_escH(p.imagen)}" onerror="this.outerHTML='<div class=tm-pub-thumb>📦</div>'">`
            : `<div class="tm-pub-thumb">${p.categoria === 'WiFi' ? '📡' : p.categoria === 'Celulares' ? '📱' : p.categoria === 'Energía' ? '🔋' : p.categoria === 'Laptops' || p.categoria === 'PC y Laptops' ? '💻' : p.categoria === 'Seguridad' ? '📷' : p.categoria === 'Audio' ? '🎵' : '📦'}</div>`;

        return `
<div class="tm-pub-row" style="opacity:${agotado ? '.5' : '1'}">
  ${imgEl}
  <div class="tm-pub-info">
    <div class="tm-pub-nom">${_escH(p.nombre || '')}</div>
    <div class="tm-pub-precio">${precioStr}</div>
  </div>
  <div class="tm-pub-btns">
    <div class="tm-pub-btnrow">
      <button class="sh-b wa" onclick="tmPubAbrirWA('${p.id}')">🟢 Estado</button>
      <button class="${fbCls}" onclick="tmPubAbrirFB('${p.id}')">${fbLbl}</button>
      ${addBtn}
    </div>
    <div class="tm-pub-btnrow">
      <button class="sh-b rv" onclick="tmPubAbrirRev('${p.id}')">🟠 Revolico</button>
    </div>
  </div>
</div>`;
    }

    // ── Filtros ───────────────────────────────────────────────
    window.tmPubFiltrarCat = function (chip, cat) {
        document.querySelectorAll('.tm-pub-chip').forEach(c => c.classList.remove('on'));
        chip.classList.add('on');
        _filtroCat = cat;
        _renderListas();
    };
    window.tmPubBuscar = function (v) {
        _filtroTxt = v;
        _renderListas();
    };

    // ── Abrir Estado WA ───────────────────────────────────────
    window.tmPubAbrirWA = function (id) {
        const p = _prods().find(x => String(x.id) === String(id));
        if (!p) return;
        // Reutiliza shareStory del módulo de marketing si está disponible
        const shareBtn = document.querySelector(`.tm-share-row[data-id="${id}"] [data-act="story"]`);
        if (shareBtn) { shareBtn.click(); return; }
        // Fallback: generar imagen con nuestro código
        _abrirModalWA(p);
    };

    function _abrirModalWA(p) {
        const ex = document.getElementById('tmPubWAModal');
        if (ex) ex.remove();
        // Cartel Pro: mismo diseño premium del generador del copiloto (tmCartelHTML)
        // + html2canvas. Si por algo no están cargados, cae al canvas viejo.
        const usarCartel = (typeof window.tmCartelHTML === 'function') && (typeof window.html2canvas === 'function');
        const m = document.createElement('div');
        m.id = 'tmPubWAModal';
        m.className = 'modal';
        m.style.cssText = 'display:flex;align-items:flex-end;';
        const preview = usarCartel
          ? `<div class="tcp-preview-wrap" style="margin:0 auto"><div class="tcp-preview-scale"><div class="tcp-card" id="tmPubCartel"></div></div></div>`
          : `<canvas id="tmPubWACanvas" style="width:100%;border-radius:12px;background:#111;display:block;"></canvas>`;
        m.innerHTML = `
<div class="modal-content" style="max-width:520px;max-height:92vh;display:flex;flex-direction:column;">
  <div class="modal-header"><h2>🟢 Estado WhatsApp — ${_escH(p.nombre)}</h2>
  <button class="close-btn" onclick="document.getElementById('tmPubWAModal').remove()" type="button">✕</button></div>
  <div style="padding:16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;">
    ${preview}
    <div style="display:flex;gap:8px;">
      <button type="button" onclick="tmPubEstadoCopiar()"
        style="flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#ccc;font-size:13px;font-weight:700;cursor:pointer;padding:11px;">📋 Copiar</button>
      <button type="button" onclick="tmPubEstadoDescargar('${p.id}')"
        style="flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#ccc;font-size:13px;font-weight:700;cursor:pointer;padding:11px;">⬇️ Descargar</button>
    </div>
    <button type="button" onclick="tmPubEstadoCompartir('${p.id}')"
      style="width:100%;padding:14px;background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;">
      🟢 Compartir como Estado →
    </button>
    <p style="font-size:11px;color:#555;text-align:center;">En móvil: Compartir → WhatsApp → Estado</p>
  </div>
</div>`;
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target === m) m.remove(); });
        if (usarCartel) {
            document.getElementById('tmPubCartel').innerHTML = window.tmCartelHTML(p);
        } else {
            _drawStoryCanvas(document.getElementById('tmPubWACanvas'), p);
        }
    }
    // Devuelve un <canvas> del cartel: html2canvas del nodo Cartel Pro, o el
    // canvas viejo como fallback.
    async function _tmPubCartelCanvas() {
        const node = document.getElementById('tmPubCartel');
        if (node && typeof window.html2canvas === 'function') {
            await Promise.all([...node.querySelectorAll('img')].map(im => im.complete ? null : new Promise(r => { im.onload = r; im.onerror = r; setTimeout(r, 4000); })));
            return await window.html2canvas(node, { backgroundColor: '#000', scale: 2, useCORS: true, logging: false, width: node.offsetWidth, height: node.offsetHeight });
        }
        return document.getElementById('tmPubWACanvas');
    }
    window.tmPubEstadoDescargar = async function (id) {
        try { const cv = await _tmPubCartelCanvas(); if (!cv) return; const a = document.createElement('a'); a.download = 'estado-' + id + '.png'; a.href = cv.toDataURL('image/png'); a.click(); }
        catch (e) { mostrarNotificacion('No pude generar el cartel: ' + (e && e.message || e), 'error'); }
    };
    window.tmPubEstadoCopiar = async function () {
        try {
            const cv = await _tmPubCartelCanvas(); if (!cv) return;
            cv.toBlob(async blob => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); mostrarNotificacion('✅ Imagen copiada', 'success'); } catch (e) { mostrarNotificacion('Descargá la imagen y adjuntala', 'error'); } }, 'image/png', .95);
        } catch (e) { mostrarNotificacion('No pude generar el cartel', 'error'); }
    };
    window.tmPubEstadoCompartir = async function (id) {
        try {
            const cv = await _tmPubCartelCanvas(); if (!cv) return;
            cv.toBlob(async blob => {
                const file = new File([blob], 'estado-tiendamax.png', { type: 'image/png' });
                if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
                    try { await navigator.share({ files: [file] }); return; } catch (e) { if (/abort/i.test(e.message || '')) return; }
                }
                const a = document.createElement('a'); a.download = 'estado-' + id + '.png'; a.href = cv.toDataURL('image/png'); a.click();
                mostrarNotificacion('Imagen descargada — súbela como estado', 'info');
            });
        } catch (e) { mostrarNotificacion('No pude generar el cartel', 'error'); }
        document.getElementById('tmPubWAModal')?.remove();
    };

    async function _drawStoryCanvas(canvas, p) {
        const W = 1080, H = 1920;
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, '#0d0d0d'); grad.addColorStop(.55, '#2b160c'); grad.addColorStop(1, '#ff6b35');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(0,0,0,.30)'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(201,169,110,.75)'; ctx.lineWidth = 8;
        _revRoundRect(ctx, 44, 44, W - 88, H - 88, 42); ctx.stroke();
        const im = await _revLoadImg(p.imagen || '');
        if (im) {
            ctx.save(); _revRoundRect(ctx, 120, 170, 840, 650, 36); ctx.clip();
            const r = Math.max(840 / im.width, 650 / im.height);
            ctx.drawImage(im, 120 + (840 - im.width * r) / 2, 170 + (650 - im.height * r) / 2, im.width * r, im.height * r);
            ctx.restore();
        } else {
            ctx.save(); _revRoundRect(ctx, 120, 170, 840, 650, 36); ctx.clip();
            const pg = ctx.createLinearGradient(120, 170, 960, 820);
            pg.addColorStop(0, '#1a3a5c'); pg.addColorStop(1, '#060e1a');
            ctx.fillStyle = pg; ctx.fillRect(120, 170, 840, 650);
            ctx.font = '160px serif'; ctx.fillStyle = 'rgba(255,107,53,.2)';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('📦', 540, 495); ctx.restore();
        }
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        ctx.font = 'bold 66px system-ui,Arial';
        let y = 940;
        const words = (p.nombre || '').split(' '); let line = '';
        for (const w of words) {
            const t = line ? line + ' ' + w : w;
            if (ctx.measureText(t).width > 860 && line) { ctx.fillText(line, W / 2, y); y += 78; line = w; } else line = t;
        }
        if (line) { ctx.fillText(line, W / 2, y); y += 78; }
        ctx.fillStyle = '#ff6b35'; ctx.font = 'bold 82px system-ui,Arial';
        ctx.fillText('$' + Number(p.precioActual || 0).toFixed(2) + ' USD', W / 2, y + 28); y += 130;
        ctx.fillStyle = '#f0e0c5'; ctx.font = 'bold 42px system-ui,Arial';
        ctx.fillText('📦 Stock: ' + Number(p.stock || 0) + '   🏷️ ' + (p.categoria || 'TiendaMax'), W / 2, y); y += 95;
        ctx.fillStyle = '#fff'; ctx.font = '42px system-ui,Arial';
        ctx.fillText('Pídelo directo por WhatsApp en TiendaMax', W / 2, y);
        ctx.fillStyle = '#c9a96e'; ctx.font = 'bold 48px system-ui,Arial';
        ctx.fillText('tiendamax.org', W / 2, H - 245);
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = '32px system-ui,Arial';
        ctx.fillText('Toca "Pedir" en la tienda para reservar', W / 2, H - 185);
    }

    window.tmPubCopyCanvas = function (cvId) {
        const cv = document.getElementById(cvId);
        if (!cv) return;
        cv.toBlob(async blob => {
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                mostrarNotificacion('✅ Imagen copiada', 'success');
            } catch (e) { mostrarNotificacion('Descargá la imagen y adjuntala', 'error'); }
        }, 'image/png', .95);
    };
    window.tmPubDlCanvas = function (cvId, name) {
        const cv = document.getElementById(cvId);
        if (!cv) return;
        const a = document.createElement('a'); a.download = name + '.png';
        a.href = cv.toDataURL('image/png', .95); a.click();
    };
    window.tmPubCompartirWA = async function (id) {
        const cv = document.getElementById('tmPubWACanvas');
        if (!cv) return;
        cv.toBlob(async blob => {
            const file = new File([blob], 'estado-tiendamax.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
                try { await navigator.share({ files: [file] }); return; } catch (e) { if (/abort/i.test(e.message || '')) return; }
            }
            window.tmPubDlCanvas('tmPubWACanvas', 'estado-' + id);
            mostrarNotificacion('Imagen descargada — súbela como estado', 'info');
        });
        document.getElementById('tmPubWAModal')?.remove();
    };

    // ── Abrir Facebook ────────────────────────────────────────
    window.tmPubAbrirFB = function (id) {
        const p = _prods().find(x => String(x.id) === String(id));
        if (!p) return;
        const grpIdx = _getGrupoProd(id);
        const grupos = _getGrupos();
        const grp = grpIdx != null && grupos[grpIdx] ? grupos[grpIdx] : null;
        if (grp) {
            _abrirFBConGrupo(p, grp);
        } else {
            _abrirFBSelectorGrupo(p);
        }
    };
    window.tmPubFBAgregar = function (id) {
        const p = _prods().find(x => String(x.id) === String(id));
        if (p) _abrirFBSelectorGrupo(p);
    };

    function _abrirFBSelectorGrupo(p) {
        const grupos = _getGrupos();
        const ex = document.getElementById('tmPubFBModal');
        if (ex) ex.remove();
        const m = document.createElement('div');
        m.id = 'tmPubFBModal';
        m.className = 'modal';
        m.style.cssText = 'display:flex;align-items:flex-end;';
        const gruposHtml = grupos.length
            ? grupos.map((g, i) => `<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:rgba(59,89,152,.12);border:1px solid rgba(59,89,152,.25);border-radius:10px;">
                <span style="flex:1;font-size:13px;">📘 ${_escH(g.nombre)}</span>
                <button type="button" onclick="tmPubUsarGrupo('${p.id}',${i})"
                  style="background:#3B5998;color:#fff;border:none;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                  Publicar aquí</button></div>`).join('')
            : '<p style="font-size:12px;color:#555;text-align:center;">Aún no hay grupos guardados.</p>';
        m.innerHTML = `
<div class="modal-content" style="max-width:500px;max-height:88vh;display:flex;flex-direction:column;">
  <div class="modal-header">
    <h2>📘 ¿Dónde publicar?</h2>
    <button class="close-btn" onclick="document.getElementById('tmPubFBModal').remove()" type="button">✕</button>
  </div>
  <div style="padding:16px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;">
    <p style="font-size:12px;color:#888;">Selecciona el grupo o agrega uno nuevo. Quedará guardado para este producto.</p>
    ${gruposHtml}
    <div style="border-top:1px solid rgba(255,255,255,.07);padding-top:12px;display:flex;flex-direction:column;gap:8px;">
      <label style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.5;">Nuevo grupo</label>
      <input id="tmPubFBNom" type="text" placeholder="Nombre del grupo (ej: TiendaMax Ofertas)"
        style="width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#f0f0f0;font-size:13px;padding:9px 12px;outline:none;">
      <input id="tmPubFBUrl" type="text" placeholder="URL del grupo (opcional)"
        style="width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#f0f0f0;font-size:13px;padding:9px 12px;outline:none;">
      <button type="button" onclick="tmPubGuardarGrupo('${p.id}')"
        style="width:100%;padding:13px;background:linear-gradient(135deg,#3B5998,#4267B2);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;">
        💾 Guardar y Publicar</button>
    </div>
  </div>
</div>`;
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    }

    window.tmPubGuardarGrupo = function (id) {
        const nom = document.getElementById('tmPubFBNom')?.value.trim();
        const url = document.getElementById('tmPubFBUrl')?.value.trim();
        if (!nom) { mostrarNotificacion('❌ Escribe el nombre del grupo', 'error'); return; }
        const grupos = _getGrupos();
        const idx = grupos.length;
        grupos.push({ nombre: nom, url: url || 'https://www.facebook.com' });
        _setGrupos(grupos);
        _setGrupoProd(id, idx);
        document.getElementById('tmPubFBModal')?.remove();
        const p = _prods().find(x => String(x.id) === String(id));
        if (p) _abrirFBConGrupo(p, { nombre: nom, url: url || 'https://www.facebook.com' });
        _renderListas();
    };

    window.tmPubUsarGrupo = function (id, idx) {
        _setGrupoProd(id, idx);
        document.getElementById('tmPubFBModal')?.remove();
        const p = _prods().find(x => String(x.id) === String(id));
        const grp = _getGrupos()[idx];
        if (p && grp) _abrirFBConGrupo(p, grp);
        _renderListas();
    };

    function _abrirFBConGrupo(p, grp) {
        // Reutiliza el modal de previsualizarFacebook con la URL del grupo
        previsualizarFacebook(p.id, grp.url);
        // Marcamos publicado al cerrar / al abrir
        const orig = window.cerrarFbPreview;
        window.cerrarFbPreview = function () {
            _setLastPub(p.id);
            _renderListas();
            window.cerrarFbPreview = orig;
            if (typeof orig === 'function') orig();
        };
    }

    // ── Abrir Revolico ────────────────────────────────────────
    window.tmPubAbrirRev = function (id) {
        previsualizarRevolico(id);
        // Marcar como publicado al abrir
        _setLastPub(id);
        setTimeout(_renderListas, 300);
    };

    // ── Hook al tab switch ────────────────────────────────────
    function _hookTab() {
        const orig = window.switchTab;
        if (typeof orig !== 'function') { setTimeout(_hookTab, 300); return; }
        if (window.__tmPubHooked) return;
        window.__tmPubHooked = true;
        const _prev = window.switchTab;
        window.switchTab = function (tab) {
            const r = _prev.apply(this, arguments);
            if (tab === 'publicar-ahora' || tab === 'publicacion') setTimeout(renderTabPublicar, 400);
            return r;
        };
    }

    window.renderTabPublicar = renderTabPublicar;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _hookTab);
    } else {
        _hookTab();
    }
    // También renderizar si el tab ya está activo al cargar
    setTimeout(() => {
        if (document.getElementById('publicar-ahora')?.classList.contains('active') ||
            document.getElementById('publicacion')?.classList.contains('active')) {
            renderTabPublicar();
        }
    }, 1200);
})();

// Restaurar vista previa de Revolico si el usuario vuelve después de ir a otra app
window.addEventListener('pageshow', function() {
    const savedId = sessionStorage.getItem('_tmRevActive');
    if (!savedId) return;
    if (document.getElementById('revPreviewModal')?.style.display !== 'none') return;
    // Esperar a que los productos estén disponibles antes de reabrir
    const tryReopen = (attempts) => {
        const prods = (typeof productos !== 'undefined' && Array.isArray(productos) ? productos : null)
            || (() => { try { return JSON.parse(localStorage.getItem('productos') || '[]'); } catch(e) { return []; } })();
        if (prods.length) { previsualizarRevolico(savedId); return; }
        if (attempts > 0) setTimeout(() => tryReopen(attempts - 1), 600);
    };
    setTimeout(() => tryReopen(5), 400);
});
