/* ═══════════════════════════════════════════════════════════════════════
   Les empreintes (hachages) de l'atelier : MD5 (RFC 1321), SHA-1 et
   SHA-256 (FIPS 180-4), écrites d'après les normes.

   Pourquoi pas crypto.subtle ? Il ne répond qu'en différé (une promesse),
   et le SQL (SELECT MD5('a')) comme le PHP (md5($mdp)) attendent la réponse
   tout de suite, au milieu d'une expression. Ces trois-là tiennent en
   quelques lignes et rendent exactement ce que rendent MariaDB et PHP :
   l'empreinte des octets UTF-8 du texte, en hexadécimal minuscule.

   MD5 et SHA-1 ne protègent PLUS un mot de passe — le cours le dit, et
   password_hash() est là pour ça. On les offre parce qu'on les croise.
   ═══════════════════════════════════════════════════════════════════════ */
var EMPREINTES = (function () {
  "use strict";

  function octets(texte) {
    if (texte instanceof Uint8Array) return texte;
    return new TextEncoder().encode(String(texte));
  }
  function hex(mots, petitBout) {
    var s = "";
    for (var i = 0; i < mots.length; i++) {
      var m = mots[i] >>> 0;
      if (petitBout) m = ((m & 0xff) << 24 | (m & 0xff00) << 8 | (m >>> 8) & 0xff00 | m >>> 24) >>> 0;
      s += ("0000000" + m.toString(16)).slice(-8);
    }
    return s;
  }
  /* Le message complété : 0x80, des zéros, puis sa longueur en bits sur
     64 bits (gros-boutiste pour SHA, petit-boutiste pour MD5). */
  function completer(o, petitBout) {
    var n = o.length, total = ((n + 8) >> 6) + 1 << 6;
    var b = new Uint8Array(total);
    b.set(o);
    b[n] = 0x80;
    var bits = n * 8, haut = Math.floor(n / 0x20000000);
    for (var i = 0; i < 4; i++) {
      var bas = (bits >>> (8 * i)) & 0xff, h = (haut >>> (8 * i)) & 0xff;
      if (petitBout) { b[total - 8 + i] = bas; b[total - 4 + i] = h; }
      else { b[total - 1 - i] = bas; b[total - 5 - i] = h; }
    }
    return b;
  }
  var rotg = function (x, n) { return x << n | x >>> (32 - n); };

  /* ── MD5 ── */
  var K5 = [], R5 = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (var i = 0; i < 64; i++) K5[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  function md5(texte) {
    var b = completer(octets(texte), true);
    var h0 = 0x67452301, h1 = 0xefcdab89 | 0, h2 = 0x98badcfe | 0, h3 = 0x10325476;
    var M = new Int32Array(16);
    for (var p = 0; p < b.length; p += 64) {
      for (var j = 0; j < 16; j++) M[j] = b[p + 4 * j] | b[p + 4 * j + 1] << 8 | b[p + 4 * j + 2] << 16 | b[p + 4 * j + 3] << 24;
      var a = h0, bb = h1, c = h2, d = h3;
      for (var k = 0; k < 64; k++) {
        var f, g, ronde = k >> 4;
        if (ronde === 0) { f = (bb & c) | (~bb & d); g = k; }
        else if (ronde === 1) { f = (d & bb) | (~d & c); g = (5 * k + 1) & 15; }
        else if (ronde === 2) { f = bb ^ c ^ d; g = (3 * k + 5) & 15; }
        else { f = c ^ (bb | ~d); g = (7 * k) & 15; }
        var t = d; d = c; c = bb;
        bb = (bb + rotg((a + f + K5[k] + M[g]) | 0, R5[ronde * 4 + (k & 3)])) | 0;
        a = t;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + bb) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    }
    return hex([h0, h1, h2, h3], true);
  }

  /* ── SHA-1 ── */
  function sha1(texte) {
    var b = completer(octets(texte), false);
    var h = [0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476, 0xc3d2e1f0 | 0];
    var W = new Int32Array(80);
    for (var p = 0; p < b.length; p += 64) {
      for (var j = 0; j < 16; j++) W[j] = b[p + 4 * j] << 24 | b[p + 4 * j + 1] << 16 | b[p + 4 * j + 2] << 8 | b[p + 4 * j + 3];
      for (j = 16; j < 80; j++) W[j] = rotg(W[j - 3] ^ W[j - 8] ^ W[j - 14] ^ W[j - 16], 1);
      var a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4];
      for (var k = 0; k < 80; k++) {
        var f, kk;
        if (k < 20) { f = (bb & c) | (~bb & d); kk = 0x5a827999; }
        else if (k < 40) { f = bb ^ c ^ d; kk = 0x6ed9eba1; }
        else if (k < 60) { f = (bb & c) | (bb & d) | (c & d); kk = 0x8f1bbcdc | 0; }
        else { f = bb ^ c ^ d; kk = 0xca62c1d6 | 0; }
        var t = (rotg(a, 5) + f + e + kk + W[k]) | 0;
        e = d; d = c; c = rotg(bb, 30); bb = a; a = t;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0;
    }
    return hex(h, false);
  }

  /* ── SHA-256 : les constantes sont les décimales des racines des premiers nombres premiers ── */
  var K2 = [], H2 = [];
  (function () {
    var premiers = [], n = 2;
    while (premiers.length < 64) { if (premiers.every(function (q) { return n % q; })) premiers.push(n); n++; }
    var frac = function (x) { return (x - Math.floor(x)) * 4294967296 | 0; };
    for (var i = 0; i < 64; i++) K2[i] = frac(Math.cbrt(premiers[i]));
    for (i = 0; i < 8; i++) H2[i] = frac(Math.sqrt(premiers[i]));
  })();
  var rotd = function (x, n) { return x >>> n | x << (32 - n); };
  function sha256(texte) {
    var b = completer(octets(texte), false);
    var h = H2.slice();
    var W = new Int32Array(64);
    for (var p = 0; p < b.length; p += 64) {
      for (var j = 0; j < 16; j++) W[j] = b[p + 4 * j] << 24 | b[p + 4 * j + 1] << 16 | b[p + 4 * j + 2] << 8 | b[p + 4 * j + 3];
      for (j = 16; j < 64; j++) {
        var s0 = rotd(W[j - 15], 7) ^ rotd(W[j - 15], 18) ^ (W[j - 15] >>> 3);
        var s1 = rotd(W[j - 2], 17) ^ rotd(W[j - 2], 19) ^ (W[j - 2] >>> 10);
        W[j] = (W[j - 16] + s0 + W[j - 7] + s1) | 0;
      }
      var a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (var k = 0; k < 64; k++) {
        var S1 = rotd(e, 6) ^ rotd(e, 11) ^ rotd(e, 25);
        var t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K2[k] + W[k]) | 0;
        var S0 = rotd(a, 2) ^ rotd(a, 13) ^ rotd(a, 22);
        var t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return hex(h, false);
  }

  /* Le texte hexadécimal d'une empreinte, en octets (pour PASSWORD() et le
     « binaire » de PHP). */
  function versOctets(h) {
    var o = new Uint8Array(h.length / 2);
    for (var i = 0; i < o.length; i++) o[i] = parseInt(h.substr(2 * i, 2), 16);
    return o;
  }

  return { md5: md5, sha1: sha1, sha256: sha256, octets: octets, versOctets: versOctets };
})();
if (typeof module !== "undefined" && module.exports) module.exports = EMPREINTES;
