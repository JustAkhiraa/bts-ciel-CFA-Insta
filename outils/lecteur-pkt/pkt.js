/* Décoder un fichier .pkt ou .pka en son XML, dans le navigateur.

   Le format suit la description publique qu'en donnent les lecteurs libres
   existants. Quatre étapes : un brouillage (octet i = octet n-1-i du fichier,
   combiné à (n - i*n) mod 256), un chiffrement Twofish en mode EAX à clé et
   vecteur fixes (16 x 0x89, 16 x 0x10, balise dans les 16 derniers octets),
   un second brouillage (octet i combiné à (m - i) mod 256), et une
   compression zlib précédée de la taille décompressée.

   Twofish et EAX sont écrits ici d'après leurs spécifications publiques
   (Schneier et al., 1998 ; Bellare, Rogaway, Wagner, 2004). Rien ne vient de
   l'application : seulement les fichiers de l'élève, lus pour être ouverts
   sans elle. Le fichier ne quitte jamais la page.

   Banc : node outils/lecteur-pkt/tests/decodage.test.mjs (dans le dépôt
   privé), qui compare chaque fichier du projet au lecteur de référence. */
(function (G) {
  "use strict";
  G.PKT = (function () {
  const T = [
    [[8, 1, 7, 13, 6, 15, 3, 2, 0, 11, 5, 9, 14, 12, 10, 4], [14, 12, 11, 8, 1, 2, 3, 5, 15, 4, 10, 6, 7, 0, 9, 13],
     [11, 10, 5, 14, 6, 13, 9, 0, 12, 8, 15, 3, 2, 4, 7, 1], [13, 7, 15, 4, 1, 2, 6, 14, 9, 11, 3, 0, 8, 5, 12, 10]],
    [[2, 8, 11, 13, 15, 7, 6, 14, 3, 1, 9, 4, 0, 10, 12, 5], [1, 14, 2, 11, 4, 12, 3, 7, 6, 13, 10, 5, 15, 9, 0, 8],
     [4, 12, 7, 5, 1, 6, 9, 10, 0, 14, 13, 8, 2, 11, 3, 15], [11, 9, 5, 1, 12, 3, 13, 14, 6, 4, 7, 15, 2, 0, 8, 10]],
  ];
  const ror4 = (x, n) => ((x >> n) | (x << (4 - n))) & 0xF;
  function q(t, x) {
    const a0 = x >> 4, b0 = x & 0xF;
    const a1 = a0 ^ b0, b1 = a0 ^ ror4(b0, 1) ^ ((8 * a0) & 0xF);
    const a2 = t[0][a1], b2 = t[1][b1];
    const a3 = a2 ^ b2, b3 = a2 ^ ror4(b2, 1) ^ ((8 * a2) & 0xF);
    return (t[3][b3] << 4) | t[2][a3];
  }
  const Q0 = new Uint8Array(256), Q1 = new Uint8Array(256);
  for (let x = 0; x < 256; x++) { Q0[x] = q(T[0], x); Q1[x] = q(T[1], x); }

  function gmul(a, b, poly) {
    let r = 0;
    while (b) { if (b & 1) r ^= a; a <<= 1; if (a & 0x100) a ^= poly; b >>= 1; }
    return r;
  }
  const MDS = [[0x01, 0xEF, 0x5B, 0x5B], [0x5B, 0xEF, 0xEF, 0x01], [0xEF, 0x5B, 0x01, 0xEF], [0xEF, 0x01, 0xEF, 0x5B]];
  const RS = [[0x01, 0xA4, 0x55, 0x87, 0x5A, 0x58, 0xDB, 0x9E], [0xA4, 0x56, 0x82, 0xF3, 0x1E, 0xC6, 0x68, 0xE5],
              [0x02, 0xA1, 0xFC, 0xC1, 0x47, 0xAE, 0x3D, 0x19], [0xA4, 0x55, 0x87, 0x5A, 0x58, 0xDB, 0x9E, 0x03]];
  const P_MDS = 0x169, P_RS = 0x14D;
  const rol = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
  const octets = w => [w & 0xFF, (w >>> 8) & 0xFF, (w >>> 16) & 0xFF, w >>> 24];
  const mot = b => (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
  function chaineQ(y, L) {
    const l0 = octets(L[0]), l1 = octets(L[1]);
    return [Q1[Q0[Q0[y[0]] ^ l1[0]] ^ l0[0]], Q0[Q0[Q1[y[1]] ^ l1[1]] ^ l0[1]],
            Q1[Q1[Q0[y[2]] ^ l1[2]] ^ l0[2]], Q0[Q1[Q1[y[3]] ^ l1[3]] ^ l0[3]]];
  }
  function mds(y) {
    const s = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) s[i] ^= gmul(MDS[i][j], y[j], P_MDS);
    return mot(s);
  }
  const h = (x, L) => mds(chaineQ(octets(x), L));

  class Twofish {
    constructor(cle) {
      if (cle.length !== 16) throw new Error("seule une clé de 128 bits est prise en charge");
      const M = [0, 1, 2, 3].map(i => mot(cle.subarray(4 * i, 4 * i + 4)));
      const Me = [M[0], M[2]], Mo = [M[1], M[3]];
      const S = [];
      for (let i = 0; i < 2; i++) {
        const s = [0, 0, 0, 0];
        for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) s[r] ^= gmul(RS[r][c], cle[8 * i + c], P_RS);
        S.push(mot(s));
      }
      S.reverse();
      const rho = 0x01010101, K = new Uint32Array(40);
      for (let i = 0; i < 20; i++) {
        const A = h((2 * i * rho) >>> 0, Me);
        const B = rol(h(((2 * i + 1) * rho) >>> 0, Mo), 8);
        K[2 * i] = (A + B) >>> 0;
        K[2 * i + 1] = rol((A + 2 * B) >>> 0, 9);
      }
      this.K = K;
      this.T = [0, 1, 2, 3].map(() => new Uint32Array(256));
      for (let x = 0; x < 256; x++) {
        const y = chaineQ([x, x, x, x], S);
        for (let j = 0; j < 4; j++) this.T[j][x] = mot([0, 1, 2, 3].map(i => gmul(MDS[i][j], y[j], P_MDS)));
      }
    }
    chiffrer(e, s) {
      const K = this.K, T0 = this.T[0], T1 = this.T[1], T2 = this.T[2], T3 = this.T[3];
      let r0 = ((e[0] | e[1] << 8 | e[2] << 16 | e[3] << 24) ^ K[0]) >>> 0;
      let r1 = ((e[4] | e[5] << 8 | e[6] << 16 | e[7] << 24) ^ K[1]) >>> 0;
      let r2 = ((e[8] | e[9] << 8 | e[10] << 16 | e[11] << 24) ^ K[2]) >>> 0;
      let r3 = ((e[12] | e[13] << 8 | e[14] << 16 | e[15] << 24) ^ K[3]) >>> 0;
      for (let r = 0; r < 16; r++) {
        const t0 = (T0[r0 & 0xFF] ^ T1[(r0 >>> 8) & 0xFF] ^ T2[(r0 >>> 16) & 0xFF] ^ T3[r0 >>> 24]) >>> 0;
        const t1 = (T0[r1 >>> 24] ^ T1[r1 & 0xFF] ^ T2[(r1 >>> 8) & 0xFF] ^ T3[(r1 >>> 16) & 0xFF]) >>> 0;
        const f0 = (t0 + t1 + K[2 * r + 8]) >>> 0;
        const f1 = (t0 + 2 * t1 + K[2 * r + 9]) >>> 0;
        const x = (r2 ^ f0) >>> 0;
        const n2 = ((x >>> 1) | (x << 31)) >>> 0;
        const n3 = (((r3 << 1) | (r3 >>> 31)) ^ f1) >>> 0;
        r2 = r0; r3 = r1; r0 = n2; r1 = n3;
      }
      const o = [r2 ^ K[4], r3 ^ K[5], r0 ^ K[6], r1 ^ K[7]];
      for (let i = 0; i < 4; i++) {
        const w = o[i];
        s[4 * i] = w & 0xFF; s[4 * i + 1] = (w >>> 8) & 0xFF; s[4 * i + 2] = (w >>> 16) & 0xFF; s[4 * i + 3] = (w >>> 24) & 0xFF;
      }
    }
  }

  class FormatInconnu extends Error {}

  // EAX : un compteur pour le secret, un OMAC pour l'authenticité
  function dbl(b) {
    const r = new Uint8Array(16);
    let retenue = 0;
    for (let i = 15; i >= 0; i--) { r[i] = ((b[i] << 1) & 0xFF) | retenue; retenue = b[i] >> 7; }
    if (b[0] & 0x80) r[15] ^= 0x87;
    return r;
  }
  function omac(tf, K1, K2, t, donnees) {
    const n = 16 + donnees.length, complet = n % 16 === 0;
    const total = complet ? n : n + 16 - (n % 16);
    const m = new Uint8Array(total);
    m[15] = t; m.set(donnees, 16);
    if (!complet) m[n] = 0x80;
    const x = new Uint8Array(16), tmp = new Uint8Array(16), dernier = total - 16;
    for (let i = 0; i < dernier; i += 16) {
      for (let j = 0; j < 16; j++) tmp[j] = x[j] ^ m[i + j];
      tf.chiffrer(tmp, x);
    }
    const K = complet ? K1 : K2;
    for (let j = 0; j < 16; j++) tmp[j] = x[j] ^ m[dernier + j] ^ K[j];
    const sortie = new Uint8Array(16);
    tf.chiffrer(tmp, sortie);
    return sortie;
  }
  function eaxDechiffrer(cle, nonce, tout) {
    const tf = new Twofish(cle);
    const L = new Uint8Array(16);
    tf.chiffrer(new Uint8Array(16), L);
    const K1 = dbl(L), K2 = dbl(K1);
    const c = tout.subarray(0, tout.length - 16), balise = tout.subarray(tout.length - 16);
    const N = omac(tf, K1, K2, 0, nonce), H = omac(tf, K1, K2, 1, new Uint8Array(0)), C = omac(tf, K1, K2, 2, c);
    for (let j = 0; j < 16; j++) {
      if ((N[j] ^ H[j] ^ C[j]) !== balise[j])
        throw new FormatInconnu("la balise EAX ne correspond pas : autre version du format, ou fichier abîmé");
    }
    const compteur = N.slice(), flux = new Uint8Array(16), sortie = new Uint8Array(c.length);
    for (let i = 0; i < c.length; i += 16) {
      tf.chiffrer(compteur, flux);
      const fin = Math.min(16, c.length - i);
      for (let j = 0; j < fin; j++) sortie[i + j] = c[i + j] ^ flux[j];
      for (let k = 15; k >= 0; k--) { compteur[k] = (compteur[k] + 1) & 0xFF; if (compteur[k]) break; }
    }
    return sortie;
  }

  async function inflate(octetsZ) {
    const flux = new Blob([octetsZ]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  }

  const CLE = new Uint8Array(16).fill(0x89), VECTEUR = new Uint8Array(16).fill(0x10);

  async function decoder(d) {
    const n = d.length;
    if (n < 32) throw new FormatInconnu("fichier trop court");
    const e1 = new Uint8Array(n);
    for (let i = 0; i < n; i++) e1[i] = d[n - 1 - i] ^ ((n - i * n) & 0xFF);
    const e2 = eaxDechiffrer(CLE, VECTEUR, e1);
    const m = e2.length;
    for (let i = 0; i < m; i++) e2[i] ^= (m - i) & 0xFF;
    const taille = ((e2[0] << 24) | (e2[1] << 16) | (e2[2] << 8) | e2[3]) >>> 0;
    let xml;
    try { xml = await inflate(e2.subarray(4)); }
    catch (err) { throw new FormatInconnu("décompression impossible"); }
    if (xml.length !== taille) throw new FormatInconnu("taille annoncée " + taille + ", obtenue " + xml.length);
    return xml;
  }

  return { decoder, Twofish, FormatInconnu };
})();
})(typeof window !== "undefined" ? window : globalThis);
