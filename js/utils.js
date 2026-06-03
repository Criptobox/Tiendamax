"use strict";

function escapeHtml(s) {
    return s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeAttr(s) {
    return escapeHtml(s);
}

function safeNum(n, def = 0) {
    const val = Number(n);
    return isFinite(val) ? val : def;
}

function _generarSal() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let salt = '';
    for (let i = 0; i < 16; i++) salt += chars.charAt(Math.floor(Math.random() * chars.length));
    return salt;
}

function _getSalt() {
    let s = localStorage.getItem('admin_salt');
    if (!s) {
        s = _generarSal();
        localStorage.setItem('admin_salt', s);
    }
    return s;
}

async function _hashSha256(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
    const combined = password + salt;
    const hash = await _hashSha256(combined);
    return hash;
}
