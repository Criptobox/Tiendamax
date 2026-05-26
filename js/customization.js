
// ═══════════════════════════════════════════════════════
//  PERSONALIZACIÓN VISUAL (Temas Editables)
// ═══════════════════════════════════════════════════════

function cambiarVistaPreviaColor(color) {
    document.documentElement.style.setProperty('--gold', color);
    // Calcular un color más claro para hover
    const colorLight = color + 'CC'; // Simple opacity addition for preview
    document.documentElement.style.setProperty('--gold-light', colorLight);
}

function cambiarVistaPreviaBordes(radius) {
    document.documentElement.style.setProperty('--border-radius', radius);
}

async function guardarConfiguracionVisual() {
    const primaryColor = document.getElementById('themePrimaryColor').value;
    const borderRadius = document.getElementById('themeBorderRadius').value;

    const visualConfig = {
        primaryColor,
        borderRadius
    };

    localStorage.setItem('visualConfig', JSON.stringify(visualConfig));
    mostrarNotificacion('✅ Tema guardado localmente');

    // Sincronizar con GitHub
    const user = localStorage.getItem('githubUser');
    const repo = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');

    if (!user || !repo || !token) {
        mostrarNotificacion('⚠️ Configura GitHub para que todos vean el tema nuevo', 'info');
        return;
    }

    try {
        const existing = await fetch(`https://raw.githubusercontent.com/${user}/${repo}/main/config.json?_=${Date.now()}`)
            .then(r => r.ok ? r.json() : {})
            .catch(() => ({}));
        
        existing.visualConfig = visualConfig;
        existing.actualizado = new Date().toISOString();
        
        await subirArchivoAGitHub(user, repo, token, 'config.json', existing);
        mostrarNotificacion('☁️ Tema subido a GitHub — ¡Tienda actualizada!', 'success');
    } catch (e) {
        console.error('Error al subir tema:', e);
    }
}

function aplicarConfigVisual(config) {
    if (!config) return;
    if (config.primaryColor) {
        document.documentElement.style.setProperty('--gold', config.primaryColor);
        // Generar variaciones
        document.documentElement.style.setProperty('--gold-light', config.primaryColor + 'DD');
    }
    if (config.borderRadius) {
        document.documentElement.style.setProperty('--border-radius', config.borderRadius);
    }
}

// Cargar al iniciar
(function initVisual() {
    // 1. Intentar desde localStorage (instantáneo)
    const local = localStorage.getItem('visualConfig');
    if (local) aplicarConfigVisual(JSON.parse(local));

    // 2. Cargar desde config.json (sincronizado)
    fetch('config.json?_=' + Date.now())
        .then(r => r.ok ? r.json() : null)
        .then(cfg => {
            if (cfg && cfg.visualConfig) {
                aplicarConfigVisual(cfg.visualConfig);
                localStorage.setItem('visualConfig', JSON.stringify(cfg.visualConfig));
                
                // Si estamos en admin, poblar los inputs
                const cp = document.getElementById('themePrimaryColor');
                const br = document.getElementById('themeBorderRadius');
                if (cp) cp.value = cfg.visualConfig.primaryColor;
                if (br) br.value = cfg.visualConfig.borderRadius;
            }
        })
        .catch(() => {});
})();
