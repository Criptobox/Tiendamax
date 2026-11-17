/* qr-mini — generador de códigos QR, sin dependencias (solo para el panel).
 *
 * Lo usa la Tarjeta de cliente (js/tarjeta-cliente.js) para dibujar en el
 * canvas el QR que abre /t?c=<código>. Tiene que funcionar sin conexión: la
 * tarjeta se crea al cerrar una venta, a veces con datos móviles flojos, y un
 * QR pedido a un servicio externo (como el de la pestaña 📱 QR) no saldría.
 *
 * Alcance deliberadamente corto: modo byte, corrección M (≈15 %: aguanta una
 * tarjeta doblada o una foto regular), versiones 1–6 (hasta 106 bytes, de
 * sobra para un enlace corto). La máscara se elige por penalización, como
 * manda la norma ISO/IEC 18004. tests/tarjeta_check.mjs lee los QR que genera
 * con un lector independiente (OpenCV): un QR que «parece» un QR y no se lee
 * es exactamente el fallo que no se ve.
 *
 *   tmQR('https://…') → { n, get(fila, col) → bool }   (null si no cabe)
 */
(function (global) {
  'use strict';
  // [total de codewords, datos por bloque, nº de bloques, alineamiento]  (nivel M)
  var V = [null,
    [26, 16, 1, []],
    [44, 28, 1, [6, 18]],
    [70, 44, 1, [6, 22]],
    [100, 32, 2, [6, 26]],
    [134, 43, 2, [6, 30]],
    [172, 27, 4, [6, 34]]];

  // Aritmética en GF(256), polinomio 0x11d.
  var EXP = new Array(512), LOG = new Array(256);
  (function () { var x = 1; for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  function mul(a, b) { return (a && b) ? EXP[LOG[a] + LOG[b]] : 0; }
  function generador(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var s = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) { s[j] ^= g[j]; s[j + 1] ^= mul(g[j], EXP[i]); }
      g = s;
    }
    return g;
  }
  function reedSolomon(datos, n) {
    var g = generador(n), r = datos.concat(new Array(n).fill(0));
    for (var i = 0; i < datos.length; i++) {
      var c = r[i]; if (!c) continue;
      for (var j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], c);
    }
    return r.slice(datos.length);
  }

  function utf8(s) { return Array.prototype.slice.call(unescape(encodeURIComponent(s))).map(function (c) { return c.charCodeAt(0); }); }

  function codewords(bytes, v) {
    var t = V[v], nDatos = t[1] * t[2], bits = [];
    function pon(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    pon(4, 4); pon(bytes.length, 8); bytes.forEach(function (b) { pon(b, 8); });
    var cap = nDatos * 8;
    for (var k = 0; k < 4 && bits.length < cap; k++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    var cw = [];
    for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; cw.push(b); }
    for (var p = 0; cw.length < nDatos; p++) cw.push(p % 2 ? 0x11 : 0xec);
    // Bloques: datos y corrección, intercalados.
    var nEcc = (t[0] - nDatos) / t[2], bloques = [], eccs = [];
    for (var bI = 0; bI < t[2]; bI++) { var d = cw.slice(bI * t[1], (bI + 1) * t[1]); bloques.push(d); eccs.push(reedSolomon(d, nEcc)); }
    var out = [];
    for (i = 0; i < t[1]; i++) bloques.forEach(function (d) { out.push(d[i]); });
    for (i = 0; i < nEcc; i++) eccs.forEach(function (e) { out.push(e[i]); });
    return out;
  }

  function matriz(v) {
    var n = 17 + 4 * v, m = [], fija = [];
    for (var i = 0; i < n; i++) { m.push(new Array(n).fill(false)); fija.push(new Array(n).fill(false)); }
    function set(f, c, val) { if (f >= 0 && f < n && c >= 0 && c < n) { m[f][c] = val; fija[f][c] = true; } }
    function buscador(f, c) {
      for (var y = -1; y <= 7; y++) for (var x = -1; x <= 7; x++) {
        var dentro = y >= 0 && y <= 6 && x >= 0 && x <= 6;
        var negro = dentro && (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4));
        set(f + y, c + x, negro);
      }
    }
    buscador(0, 0); buscador(0, n - 7); buscador(n - 7, 0);
    for (i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    var al = V[v][3];
    al.forEach(function (f) { al.forEach(function (c) {
      if (fija[f][c]) return;
      for (var y = -2; y <= 2; y++) for (var x = -2; x <= 2; x++) set(f + y, c + x, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    }); });
    set(n - 8, 8, true);  // módulo oscuro
    // Reservar las zonas de formato (se escriben luego).
    for (i = 0; i < 9; i++) { if (!fija[8][i]) fija[8][i] = true; if (!fija[i][8]) fija[i][8] = true; }
    for (i = 0; i < 8; i++) { fija[8][n - 1 - i] = true; fija[n - 1 - i][8] = true; }
    return { n: n, m: m, fija: fija };
  }

  var MASCARAS = [
    function (f, c) { return (f + c) % 2 === 0; },
    function (f) { return f % 2 === 0; },
    function (f, c) { return c % 3 === 0; },
    function (f, c) { return (f + c) % 3 === 0; },
    function (f, c) { return (Math.floor(f / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (f, c) { return (f * c) % 2 + (f * c) % 3 === 0; },
    function (f, c) { return ((f * c) % 2 + (f * c) % 3) % 2 === 0; },
    function (f, c) { return ((f + c) % 2 + (f * c) % 3) % 2 === 0; }];

  function colocar(base, cw, mask) {
    var n = base.n, m = base.m.map(function (r) { return r.slice(); }), fija = base.fija, k = 0, bits = [];
    cw.forEach(function (b) { for (var i = 7; i >= 0; i--) bits.push((b >>> i) & 1); });
    var arriba = true;
    for (var c = n - 1; c > 0; c -= 2) {
      if (c === 6) c--;
      for (var t = 0; t < n; t++) {
        var f = arriba ? n - 1 - t : t;
        for (var d = 0; d < 2; d++) {
          var cc = c - d;
          if (fija[f][cc]) continue;
          var bit = k < bits.length ? bits[k] : 0; k++;
          m[f][cc] = !!(bit ^ (MASCARAS[mask](f, cc) ? 1 : 0));
        }
      }
      arriba = !arriba;
    }
    // Formato: nivel M (00) + máscara, BCH(15,5) y XOR 0x5412.
    var dato = (0 << 3) | mask, rem = dato;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var fmt = ((dato << 10) | rem) ^ 0x5412;
    function fbit(i) { return ((fmt >>> i) & 1) === 1; }
    // Copia 1, alrededor del buscador de arriba a la izquierda (salta el temporizador).
    for (i = 0; i <= 5; i++) m[i][8] = fbit(i);
    m[7][8] = fbit(6); m[8][8] = fbit(7); m[8][7] = fbit(8);
    for (i = 9; i < 15; i++) m[8][14 - i] = fbit(i);
    // Copia 2, repartida entre los buscadores de arriba a la derecha y abajo.
    for (i = 0; i < 8; i++) m[8][n - 1 - i] = fbit(i);
    for (i = 8; i < 15; i++) m[n - 15 + i][8] = fbit(i);
    m[n - 8][8] = true;
    return m;
  }

  function penalizacion(m) {
    var n = m.length, p = 0, f, c, i;
    for (var eje = 0; eje < 2; eje++) for (f = 0; f < n; f++) {
      var run = 1;
      for (c = 1; c < n; c++) {
        var a = eje ? m[c][f] : m[f][c], b = eje ? m[c - 1][f] : m[f][c - 1];
        if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
      }
    }
    for (f = 0; f < n - 1; f++) for (c = 0; c < n - 1; c++) {
      var v = m[f][c]; if (v === m[f][c + 1] && v === m[f + 1][c] && v === m[f + 1][c + 1]) p += 3;
    }
    var pat = [true, false, true, true, true, false, true];
    for (f = 0; f < n; f++) for (c = 0; c + 6 < n; c++) {
      var h = true, w = true;
      for (i = 0; i < 7; i++) { if (m[f][c + i] !== pat[i]) h = false; if (m[c + i][f] !== pat[i]) w = false; }
      if (h) p += 40; if (w) p += 40;
    }
    var oscuros = 0; m.forEach(function (r) { r.forEach(function (x) { if (x) oscuros++; }); });
    p += Math.floor(Math.abs(oscuros * 100 / (n * n) - 50) / 5) * 10;
    return p;
  }

  function tmQR(texto) {
    var bytes = utf8(String(texto || '')), v;
    for (v = 1; v < V.length; v++) if (bytes.length + 2 <= V[v][1] * V[v][2]) break;
    if (v >= V.length) return null;
    var cw = codewords(bytes, v), base = matriz(v), mejor = null, pMejor = Infinity;
    for (var k = 0; k < 8; k++) {
      var m = colocar(base, cw, k), p = penalizacion(m);
      if (p < pMejor) { pMejor = p; mejor = m; }
    }
    return { n: base.n, get: function (f, c) { return !!mejor[f][c]; } };
  }
  global.tmQR = tmQR;
})(typeof window !== 'undefined' ? window : globalThis);
