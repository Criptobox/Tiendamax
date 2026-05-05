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
                    <p style="margin-bottom: 12px; font-size: 14px; color: var(--text-color);">
                        Pega aquí el JSON exportado desde <strong>Cookie-Editor</strong> mientras estás logueado en Revolico o Facebook.
                    </p>
                    <div style="background: rgba(255,107,53,0.1); border: 1px solid #FF6B35; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 13px;">
                        <strong>¿Cómo obtenerlo?</strong><br>
                        1. Abre <a href="https://www.revolico.com" target="_blank">revolico.com</a> o <a href="https://www.facebook.com" target="_blank">facebook.com</a> y asegúrate de estar logueado<br>
                        2. Haz clic en la extensión Cookie-Editor<br>
                        3. Haz clic en <strong>Export</strong> → <strong>Export All</strong> (esto copiará todas las cookies de la página abierta)<br>
                        4. Copia el JSON y pégalo abajo. <strong>Repite el proceso para ambas páginas</strong> si quieres publicar en ambas.
                    </div>
                    <textarea id="cookieJsonInput" rows="10" style="
                        width: 100%; box-sizing: border-box; padding: 12px;
                        border: 2px solid #ddd; border-radius: 8px; font-family: monospace;
                        font-size: 12px; resize: vertical; background: var(--card-bg);
                        color: var(--text-color);
                    " placeholder='[{"domain": "www.revolico.com", "name": "st-access-token", ...}]'></textarea>
                    <div id="cookieImportResult" style="margin-top: 12px; min-height: 24px;"></div>
                    <button onclick="importarCookiesDesdeTexto()" style="
                        background: linear-gradient(135deg, #FF6B35, #f7931e);
                        color: white; border: none; padding: 12px 24px;
                        border-radius: 8px; font-size: 15px; font-weight: 700;
                        cursor: pointer; width: 100%; margin-top: 8px;
                    ">🍪 Importar Cookies</button>
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

async function importarCookiesDesdeTexto() {
    const textarea = document.getElementById('cookieJsonInput');
    const resultDiv = document.getElementById('cookieImportResult');
    const texto = textarea ? textarea.value.trim() : '';

    if (!texto) {
        if (resultDiv) resultDiv.innerHTML = '<span style="color: #E74C3C;">⚠️ Pega el JSON de las cookies primero.</span>';
        return;
    }

    let cookies;
    try {
        // Limpiar non-breaking spaces que puede exportar Cookie-Editor
        const textoLimpio = texto.replace(/\u00a0/g, ' ');
        cookies = JSON.parse(textoLimpio);
    } catch (e) {
        if (resultDiv) resultDiv.innerHTML = '<span style="color: #E74C3C;">❌ JSON inválido. Verifica que copiaste el texto completo.</span>';
        return;
    }

    if (!Array.isArray(cookies) || cookies.length === 0) {
        if (resultDiv) resultDiv.innerHTML = '<span style="color: #E74C3C;">❌ El JSON debe ser un array de cookies.</span>';
        return;
    }

    if (resultDiv) resultDiv.innerHTML = '<span style="color: #3498DB;">⏳ Importando cookies al servidor...</span>';

    try {
        const response = await fetch(`${BACKEND_URL_REVOLICO}/importar-cookies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cookies)
        });
        const data = await response.json();

        if (data.success) {
            if (resultDiv) resultDiv.innerHTML = `<span style="color: #27AE60;">✅ ${data.mensaje}</span>`;
            mostrarNotificacion(`✅ ${data.mensaje}`, 'success');
            setTimeout(() => cerrarCookieModal(), 2000);
        } else {
            if (resultDiv) resultDiv.innerHTML = `<span style="color: #E74C3C;">❌ Error: ${data.error}</span>`;
        }
        } catch (e) {
        // Si el backend no está disponible, guardar localmente
        try {
            localStorage.setItem('revolico_cookies_pendientes', JSON.stringify(cookies));
            if (resultDiv) {
                resultDiv.innerHTML = `
                    <div style="background:#fff3cd; color:#856404; padding:12px; border-radius:8px; border:1px solid #ffeeba; margin-top:10px; font-size:13px; text-align:left;">
                        <strong>⚠️ Backend no detectado</strong><br>
                        El programa del bot no está respondiendo en el puerto 5002.<br><br>
                        <strong>Cómo arreglarlo:</strong><br>
                        1. Abre tu terminal y escribe: <code>bash iniciar.sh</code><br>
                        2. Si estás en VS Code, asegúrate de que el puerto 5002 esté abierto.<br>
                        3. Tus cookies se guardaron en el navegador por ahora.
                    </div>
                `;
            }
            mostrarNotificacion(`⚠️ Backend no detectado. Cookies guardadas en navegador.`, 'info');
        } catch (err) {
            if (resultDiv) resultDiv.innerHTML = '<span style="color: #E74C3C;">❌ Error de conexión total.</span>';
        }
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
