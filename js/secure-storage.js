// ═══════════════════════════════════════════════════════
// 🔐 SECURE STORAGE — Cifrado de datos sensibles (OPCIONAL)
// Usa Web Crypto API si está disponible, sino fallback a localStorage
// ═══════════════════════════════════════════════════════

(function() {
    'use strict';
    
    // Verificar si crypto.subtle está disponible (solo HTTPS o localhost)
    const CRYPTO_AVAILABLE = !!(window.crypto && window.crypto.subtle);
    
    const SECURE_STORAGE_ITERATIONS = 100000;
    const SECURE_STORAGE_SALT_KEY = 'tm_secure_salt';
    const GITHUB_TOKEN_KEY = 'tm_github_token_enc';
    const GITHUB_TOKEN_LEGACY_KEY = 'githubToken';
    
    // Variable global para password de sesión
    window._sessionPassword = null;
    
    // Generar salt único por dispositivo
    function _getOrCreateSalt() {
        let salt = localStorage.getItem(SECURE_STORAGE_SALT_KEY);
        if (!salt && CRYPTO_AVAILABLE) {
            const array = new Uint8Array(16);
            crypto.getRandomValues(array);
            salt = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
            localStorage.setItem(SECURE_STORAGE_SALT_KEY, salt);
        }
        return salt;
    }
    
    // Derivar clave AES-GCM desde contraseña usando PBKDF2
    async function _deriveKey(password) {
        if (!CRYPTO_AVAILABLE) return null;
        const salt = _getOrCreateSalt();
        if (!salt) return null;
        
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
        if (!CRYPTO_AVAILABLE) return null;
        try {
            const key = await _deriveKey(password);
            if (!key) return null;
            
            const encoder = new TextEncoder();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encoder.encode(plaintext)
            );
            
            const combined = new Uint8Array(iv.length + encrypted.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(encrypted), iv.length);
            
            return btoa(String.fromCharCode(...combined));
        } catch (e) {
            console.warn('[SecureStorage] Cifrado no disponible:', e.message);
            return null;
        }
    }
    
    // Descifrar texto con AES-GCM
    async function secureDecrypt(ciphertext, password) {
        if (!CRYPTO_AVAILABLE) return null;
        try {
            const key = await _deriveKey(password);
            if (!key) return null;
            
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
            console.warn('[SecureStorage] Descifrado falló:', e.message);
            return null;
        }
    }
    
    // Guardar token de GitHub (cifrado si es posible, sino plano)
    window.secureSaveGitHubToken = async function(token, adminPassword) {
        if (!token) return false;
        
        // Intentar cifrar si crypto está disponible
        if (CRYPTO_AVAILABLE && adminPassword) {
            const encrypted = await secureEncrypt(token, adminPassword);
            if (encrypted) {
                localStorage.setItem(GITHUB_TOKEN_KEY, encrypted);
                localStorage.removeItem(GITHUB_TOKEN_LEGACY_KEY);
                return true;
            }
        }
        
        // Fallback: guardar sin cifrar
        localStorage.setItem(GITHUB_TOKEN_LEGACY_KEY, token);
        return true;
    };
    
    // Obtener token de GitHub (descifrado si es posible, sino plano)
    window.secureGetGitHubToken = async function(adminPassword) {
        // Intentar versión cifrada
        if (CRYPTO_AVAILABLE && adminPassword) {
            const encrypted = localStorage.getItem(GITHUB_TOKEN_KEY);
            if (encrypted) {
                const decrypted = await secureDecrypt(encrypted, adminPassword);
                if (decrypted) return decrypted;
            }
        }
        
        // Fallback: token legacy sin cifrar
        return localStorage.getItem(GITHUB_TOKEN_LEGACY_KEY) || null;
    };
    
    // Limpiar token de GitHub
    window.secureClearGitHubToken = function() {
        localStorage.removeItem(GITHUB_TOKEN_KEY);
        localStorage.removeItem(GITHUB_TOKEN_LEGACY_KEY);
    };
    
    // Verificar si hay token cifrado
    window.hasSecureGitHubToken = function() {
        return !!localStorage.getItem(GITHUB_TOKEN_KEY);
    };
    
    // Verificar si hay token legacy (sin cifrar)
    window.hasLegacyGitHubToken = function() {
        return !!localStorage.getItem(GITHUB_TOKEN_LEGACY_KEY);
    };
    
    // Migrar token legacy a cifrado (llamar después de login exitoso)
    window.migrateLegacyTokenIfNeeded = async function(adminPassword) {
        if (!CRYPTO_AVAILABLE) return;
        if (window.hasLegacyGitHubToken() && !window.hasSecureGitHubToken()) {
            const legacy = localStorage.getItem(GITHUB_TOKEN_LEGACY_KEY);
            if (legacy && adminPassword) {
                await window.secureSaveGitHubToken(legacy, adminPassword);
                console.log('[SecureStorage] Token migrado a cifrado');
            }
        }
    };
    
    // Setters/getters para password de sesión
    window.setSessionPassword = function(password) {
        window._sessionPassword = password;
    };
    
    window.clearSessionPassword = function() {
        window._sessionPassword = null;
    };
    
    console.log('[SecureStorage] Cargado - Crypto disponible:', CRYPTO_AVAILABLE);
})();
