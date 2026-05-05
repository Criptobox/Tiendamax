/**
 * revolico_integration.js
 * Módulo de integración con Revolico para TiendaMax
 * Incluye soporte para importar cookies desde Cookie-Editor
 */

// Usamos 127.0.0.1 para evitar bloqueos de seguridad y problemas de DNS en Windows
const BACKEND_URL_REVOLICO = 'http://127.0.0.1:5002/api';

// ===== IMPORTAR COOKIES DESDE COOKIE-EDITOR =====

/**
 * Muestra el panel para importar cookies exportadas desde Cookie-Editor.
 * El usuario pega el JSON directamente en el textarea.
 */
function mostrarImportarCookies() {
    // Crear modal si no existe
    let modal = document.getElementById('cookieImportModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cookieImportModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>🍪 Importar Cookies de Revolico</h2>
                    <button class="close-btn" onclick="cerrarCookieModal()">✕</button>
                </div>
                <div style="padding: 20px;">
                    <div style="background: rgba(52, 152, 219, 0.1); border: 1px solid #3498DB; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 13px;">
                        <strong>💡 Instrucciones:</strong> Abre Revolico o Facebook, usa <strong>Cookie-Editor</strong>, haz clic en <strong>Export All</strong> y pega el código en el cuadro correspondiente.
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 8px; color: #2980B9;">🛍️ Cookies de REVOLICO:</label>
                        <textarea id="cookieRevolicoInput" rows="6" style="
                            width: 100%; box-sizing: border-box; padding: 10px;
                            border: 2px solid #3498DB; border-radius: 8px; font-family: monospace;
                            font-size: 11px; resize: vertical; background: var(--card-bg);
                            color: var(--text-color);
                        " placeholder='Pega aquí el JSON de Revolico...'></textarea>
                        <button onclick="importarCookiesSeparadas('revolico')" style="
                            background: #3498DB; color: white; border: none; padding: 8px;
                            border-radius: 6px; font-size: 13px; cursor: pointer; width: 100%; margin-top: 5px;
                        ">📥 Guardar Cookies Revolico</button>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 8px; color: #3B5998;">📱 Cookies de FACEBOOK:</label>
                        <textarea id="cookieFacebookInput" rows="6" style="
                            width: 100%; box-sizing: border-box; padding: 10px;
                            border: 2px solid #3B5998; border-radius: 8px; font-family: monospace;
                            font-size: 11px; resize: vertical; background: var(--card-bg);
                            color: var(--text-color);
                        " placeholder='Pega aquí el JSON de Facebook...'></textarea>
                        <button onclick="importarCookiesSeparadas('facebook')" style="
                            background: #3B5998; color: white; border: none; padding: 8px;
                            border-radius: 6px; font-size: 13px; cursor: pointer; width: 100%; margin-top: 5px;
                        ">📥 Guardar Cookies Facebook</button>
                    </div>

                    <div id="cookieImportResult" style="margin-top: 12px; min-height: 24px; text-align: center; font-weight: bold;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
}

function cerrarCookieModal() {
    const modal = document.getElementById('cookieImportModal');
    if (modal) modal.classList.add('hidden');
}

async function importarCookiesSeparadas(plataforma) {
    const inputId = plataforma === 'revolico' ? 'cookieRevolicoInput' : 'cookieFacebookInput';
    const textarea = document.getElementById(inputId);
    const resultDiv = document.getElementById('cookieImportResult');
    const texto = textarea ? textarea.value.trim() : '';

    if (!texto) {
        if (resultDiv) resultDiv.innerHTML = `<span style="color: #E74C3C;">⚠️ Pega el JSON de ${plataforma} primero.</span>`;
        return;
    }

    let cookies;
    try {
        const textoLimpio = texto.replace(/\u00a0/g, ' ');
        cookies = JSON.parse(textoLimpio);
    } catch (e) {
        if (resultDiv) resultDiv.innerHTML = '<span style="color: #E74C3C;">❌ JSON inválido. Copia todo el texto del Export.</span>';
        return;
    }

    if (resultDiv) resultDiv.innerHTML = `<span style="color: #3498DB;">⏳ Enviando cookies de ${plataforma}...</span>`;

    try {
        const response = await fetch(`${BACKEND_URL_REVOLICO}/importar-cookies-${plataforma}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cookies)
        });
        const data = await response.json();

        if (data.success) {
            if (resultDiv) resultDiv.innerHTML = `<span style="color: #27AE60;">✅ Cookies de ${plataforma} guardadas!</span>`;
            mostrarNotificacion(`✅ Cookies de ${plataforma} actualizadas`, 'success');
            textarea.value = ''; // Limpiar campo
        } else {
            if (resultDiv) resultDiv.innerHTML = `<span style="color: #E74C3C;">❌ Error: ${data.error}</span>`;
        }
    } catch (e) {
        if (resultDiv) resultDiv.innerHTML = '<span style="color: #E74C3C;">❌ Backend no disponible. ¿Abriste iniciar_windows.bat?</span>';
    }
}

// ===== AGREGAR BOTÓN DE IMPORTAR COOKIES AL PANEL ADMIN =====

function agregarBotonCookies() {
    // Agregar botón en la pestaña de Publicar
    const publicarTab = document.getElementById('publicar-ahora');
    if (publicarTab && !document.getElementById('btnImportarCookies')) {
        const btnCookies = document.createElement('button');
        btnCookies.id = 'btnImportarCookies';
        btnCookies.onclick = mostrarImportarCookies;
        btnCookies.style.cssText = `
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white; border: none; padding: 12px 24px;
            border-radius: 10px; font-size: 14px; font-weight: 700;
            cursor: pointer; width: 100%; margin: 8px 0;
            transition: transform 0.2s;
        `;
        btnCookies.innerHTML = '🍪 Actualizar Cookies (Revolico/Facebook)';
        btnCookies.onmouseover = () => { btnCookies.style.transform = 'translateY(-2px)'; };
        btnCookies.onmouseout = () => { btnCookies.style.transform = 'none'; };

        // Insertar antes del botón de publicar
        const btnPublicar = document.getElementById('btnPublicarAhora');
        if (btnPublicar) {
            publicarTab.insertBefore(btnCookies, btnPublicar);
        } else {
            publicarTab.appendChild(btnCookies);
        }
    }
}

// ===== VERIFICAR COOKIES PENDIENTES =====

async function enviarCookiesPendientes() {
    const cookiesPendientes = localStorage.getItem('revolico_cookies_pendientes');
    if (!cookiesPendientes) return;

    try {
        const cookies = JSON.parse(cookiesPendientes);
        const response = await fetch(`${BACKEND_URL_REVOLICO}/importar-cookies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cookies)
        });
        const data = await response.json();
        if (data.success) {
            localStorage.removeItem('revolico_cookies_pendientes');
            console.log(`✅ Cookies pendientes enviadas al backend: ${data.mensaje}`);
        }
    } catch (e) {
        // Backend aún no disponible, intentar más tarde
    }
}

// ===== INICIALIZACIÓN =====

document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ Módulo de publicación automática cargado - Horarios: 8:00 AM y 5:00 PM');

    // Agregar botón de cookies cuando se abra el panel admin
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const adminPanel = document.getElementById('adminPanel');
                if (adminPanel && !adminPanel.classList.contains('hidden')) {
                    setTimeout(agregarBotonCookies, 300);
                }
            }
        });
    });

    const adminPanel = document.getElementById('adminPanel');
    if (adminPanel) {
        observer.observe(adminPanel, { attributes: true });
    }

    // Intentar enviar cookies pendientes al cargar
    setTimeout(enviarCookiesPendientes, 5000);
});

// ===== ASISTENTE DE PUBLICACIÓN EN FACEBOOK =====

async function publicarEnFacebook(productoId) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) {
        mostrarNotificacion('❌ Producto no encontrado', 'error');
        return;
    }

    // Crear el texto del anuncio
    const textoAnuncio = `Vendo: ${producto.nombre}\n\nPrecio: ${producto.precioActual} USD\n\nDescripción: ${producto.descripcion}\n\n📦 Stock disponible\n📍 Contacto: 5354320170`;

    // Intentar copiar al portapapeles
    try {
        const tempInput = document.createElement("textarea");
        tempInput.value = textoAnuncio;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        
        mostrarNotificacion('📋 ¡Texto copiado! Ahora pégalo en Facebook', 'success');
    } catch (err) {
        console.error('Error al copiar:', err);
    }

    // Abrir Facebook Marketplace en una nueva pestaña
    setTimeout(() => {
        window.open('https://www.facebook.com/marketplace/create/item', '_blank');
    }, 1000);
}

// ===== SELECTOR DE PRODUCTO PARA FACEBOOK =====

function mostrarSelectorAsistenteFacebook() {
    if (productos.length === 0) {
        mostrarNotificacion('❌ No hay productos para publicar', 'error');
        return;
    }

    let modal = document.getElementById('fbSelectorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'fbSelectorModal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    let itemsHtml = productos.map(p => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <img src="${p.imagen}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;">
                <span style="font-weight: bold; font-size: 14px;">${p.nombre}</span>
            </div>
            <button onclick="publicarEnFacebook(${p.id}); cerrarFbSelector();" style="background: #3B5998; color: white; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer;">Copiar y Abrir</button>
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>📱 Selecciona producto para Facebook</h2>
                <button class="close-btn" onclick="cerrarFbSelector()">✕</button>
            </div>
            <div style="padding: 20px; max-height: 400px; overflow-y: auto;">
                <p style="font-size: 13px; color: #666; margin-bottom: 15px;">Elige un producto. Se copiará el texto y se abrirá Marketplace para que solo tengas que <strong>pegar (Ctrl+V)</strong>.</p>
                ${itemsHtml}
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
}

function cerrarFbSelector() {
    document.getElementById('fbSelectorModal').classList.add('hidden');
}
