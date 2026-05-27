// ═══════════════════════════════════════════════════════
// 🔐 SECURE STORAGE — Cifrado de datos sensibles
// Usa Web Crypto API para cifrar tokens y credenciales
// ═══════════════════════════════════════════════════════

const SECURE_STORAGE_ITERATIONS = 100000;
const SECURE_STORAGE_SALT_KEY = 'tm_secure_salt';

// Generar salt único por dispositivo
function _getOrCreateSalt() {
    let salt = localStorage.getItem(SECURE_STORAGE_SALT_KEY);
    if (!salt) {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        salt = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(SECURE_STORAGE_SALT_KEY, salt);
    }
    return salt;
}

// Derivar clave AES-GCM desde contraseña usando PBKDF2
async function _deriveKey(password) {
    const salt = _getOrCreateSalt();
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );
    
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode(salt),
            iterations: SECURE_STORAGE_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// Cifrar texto con AES-GCM
async function secureEncrypt(plaintext, password) {
    try {
        const key = await _deriveKey(password);
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encoder.encode(plaintext)
        );
        
        // Combinar IV + ciphertext
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);
        
        // Convertir a base64
        return btoa(String.fromCharCode(...combined));
    } catch (e) {
        console.error('[SecureStorage] Error cifrando:', e);
        return null;
    }
}

// Descifrar texto con AES-GCM
async function secureDecrypt(ciphertext, password) {
    try {
        const key = await _deriveKey(password);
        const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            data
        );
        
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error('[SecureStorage] Error descifrando:', e);
        return null;
    }
}

// ═══════════════════════════════════════════════════════
// API PÚBLICA — Token de GitHub
// ═══════════════════════════════════════════════════════

const GITHUB_TOKEN_KEY = 'tm_github_token_enc';
const GITHUB_TOKEN_LEGACY_KEY = 'githubToken';

// Guardar token de GitHub cifrado
async function secureSaveGitHubToken(token, adminPassword) {
    if (!token || !adminPassword) return false;
    
    const encrypted = await secureEncrypt(token, adminPassword);
    if (encrypted) {
        localStorage.setItem(GITHUB_TOKEN_KEY, encrypted);
        localStorage.removeItem(GITHUB_TOKEN_LEGACY_KEY); // Limpiar versión legacy
        return true;
    }
    return false;
}

// Obtener token de GitHub descifrado
async function secureGetGitHubToken(adminPassword) {
    // Primero intentar versión cifrada
    const encrypted = localStorage.getItem(GITHUB_TOKEN_KEY);
    if (encrypted && adminPassword) {
        const decrypted = await secureDecrypt(encrypted, adminPassword);
        if (decrypted) return decrypted;
    }
    
    // Fallback: migrar token legacy si existe
    const legacy = localStorage.getItem(GITHUB_TOKEN_LEGACY_KEY);
    if (legacy && adminPassword) {
        const migrated = await secureEncrypt(legacy, adminPassword);
        if (migrated) {
            localStorage.setItem(GITHUB_TOKEN_KEY, migrated);
            localStorage.removeItem(GITHUB_TOKEN_LEGACY_KEY);
        }
        return legacy;
    }
    
    return null;
}

// Limpiar token de GitHub
function secureClearGitHubToken() {
    localStorage.removeItem(GITHUB_TOKEN_KEY);
    localStorage.removeItem(GITHUB_TOKEN_LEGACY_KEY);
}

// ═══════════════════════════════════════════════════════
// API PÚBLICA — Helpers para UI
// ═══════════════════════════════════════════════════════

// Verificar si hay token cifrado
function hasSecureGitHubToken() {
    return !!localStorage.getItem(GITHUB_TOKEN_KEY);
}

// Verificar si hay token legacy (sin cifrar)
function hasLegacyGitHubToken() {
    return !!localStorage.getItem(GITHUB_TOKEN_LEGACY_KEY);
}

// Migrar token legacy a cifrado (llamar después de login exitoso)
async function migrateLegacyTokenIfNeeded(adminPassword) {
    if (hasLegacyGitHubToken() && !hasSecureGitHubToken()) {
        const legacy = localStorage.getItem(GITHUB_TOKEN_LEGACY_KEY);
        if (legacy && adminPassword) {
            await secureSaveGitHubToken(legacy, adminPassword);
            console.log('[SecureStorage] Token legacy migrado a cifrado');
        }
    }
}

// ═══════════════════════════════════════════════════════
// COMPATIBILIDAD — Wrappers para código existente
// ═══════════════════════════════════════════════════════

// Wrapper síncrono para compatibilidad (requiere password en sesión)
let _sessionPassword = null;

function setSessionPassword(password) {
    _sessionPassword = password;
}

function clearSessionPassword() {
    _sessionPassword = null;
}

// Versión síncrona para código legacy (usa password de sesión)
function getGitHubTokenSync() {
    const encrypted = localStorage.getItem(GITHUB_TOKEN_KEY);
    if (!encrypted) {
        return localStorage.getItem(GITHUB_TOKEN_LEGACY_KEY) || null;
    }
    // Si hay token cifrado pero no password en sesión, retornar null
    // El código debe usar la versión async
    if (!_sessionPassword) {
        console.warn('[SecureStorage] Token cifrado requiere password. Usa secureGetGitHubToken()');
        return null;
    }
    // Retornar promesa para mantener compatibilidad
    return secureGetGitHubToken(_sessionPassword);
}
