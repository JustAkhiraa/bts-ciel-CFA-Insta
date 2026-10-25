/* Le QR code, écrit d'après la norme (ISO/IEC 18004) — sans bibliothèque.

   C'est par lui que deux appareils se présentent sans Internet : l'un
   affiche son « offre » WebRTC en QR, l'autre la photographie et répond par
   le sien. Ce fichier ENCODE ; qr-lecture.js DÉCODE.

   Les étapes, dans l'ordre de la norme :
   1. les octets du message, précédés du mode (« octets », 0100) et de leur
      nombre, complétés jusqu'à la capacité de la version choisie ;
   2. découpés en blocs, chacun suivi de ses octets de correction
      Reed-Solomon (corps de Galois GF(256), polynôme 0x11D) ;
   3. entrelacés, puis posés en zigzag sur la grille, entre les motifs fixes
      (les trois carrés de repérage, l'alternance de synchronisation, les
      motifs d'alignement) ;
   4. masqués par celui des huit masques qui donne la grille la plus
      lisible, et le masque est écrit dans les bits de format. */

/* ── le corps de Galois GF(256) ── */
export const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
export const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/* Le polynôme générateur de degré n : (x − α⁰)(x − α¹)…(x − αⁿ⁻¹). */
const generateurs = new Map();
function generateur(n) {
  if (!generateurs.has(n)) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const suivant = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        suivant[j] ^= g[j];
        suivant[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = suivant;
    }
    generateurs.set(n, g);
  }
  return generateurs.get(n);
}
/* Les n octets de correction : le reste de la division du message par le
   générateur. */
export function correction(donnees, n) {
  const g = generateur(n);
  const reste = new Array(n).fill(0);
  for (const octet of donnees) {
    const facteur = octet ^ reste.shift();
    reste.push(0);
    for (let i = 0; i < n; i++) reste[i] ^= mul(g[i + 1], facteur);
  }
  return reste;
}

/* ── les tables de la norme ── */
// niveaux de correction, dans l'ordre L M Q H ; leurs deux bits dans le format
export const NIVEAUX = { L: 0, M: 1, Q: 2, H: 3 };
export const BITS_NIVEAU = [1, 0, 3, 2];
// octets de correction PAR BLOC, puis nombre de blocs, version 1 à 40 (index 0 inutilisé)
export const ECC_PAR_BLOC = [
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
export const NB_BLOCS = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

/* Le nombre de modules libres pour les données (motifs fixes retirés). */
export function modulesDonnees(v) {
  let n = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const a = Math.floor(v / 7) + 2;
    n -= (25 * a - 10) * a - 55;
    if (v >= 7) n -= 36;
  }
  return n;
}
export const octetsBruts = (v) => Math.floor(modulesDonnees(v) / 8);
export const octetsUtiles = (v, n) => octetsBruts(v) - ECC_PAR_BLOC[n][v] * NB_BLOCS[n][v];

/* Les centres des motifs d'alignement sur un axe. */
export function positionsAlignement(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, taille = 4 * v + 17;
  const pas = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let p = taille - 7; out.length < n; p -= pas) out.splice(1, 0, p);
  return out;
}

/* Les 15 bits de format : niveau et masque, protégés par un code BCH. */
export function bitsFormat(niveau, masque) {
  const d = (BITS_NIVEAU[niveau] << 3) | masque;
  let r = d;
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  return ((d << 10) | r) ^ 0x5412;
}
export function bitsVersion(v) {
  let r = v;
  for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
  return (v << 12) | r;
}
export const MASQUES = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/* ── la grille ── */
/* Une grille vierge avec ses motifs fixes. « fixe[y][x] » dit quels modules
   ne portent pas de données — le lecteur reconstruit la même carte. */
export function grilleVierge(v) {
  const t = 4 * v + 17;
  const g = Array.from({ length: t }, () => new Array(t).fill(false));
  const fixe = Array.from({ length: t }, () => new Array(t).fill(false));
  const poser = (x, y, noir) => { if (x >= 0 && y >= 0 && x < t && y < t) { g[y][x] = noir; fixe[y][x] = true; } };
  for (let i = 0; i < t; i++) { poser(6, i, i % 2 === 0); poser(i, 6, i % 2 === 0); }
  // les trois carrés de repérage, avec leur liseré blanc
  for (const [cx, cy] of [[3, 3], [t - 4, 3], [3, t - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      poser(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  }
  const al = positionsAlignement(v);
  for (const cy of al) for (const cx of al) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === t - 7) || (cx === t - 7 && cy === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poser(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // les zones de format (réservées ici, écrites à la fin) et le module toujours noir
  // (la ligne et la colonne 6 restent à la synchronisation, qui les traverse)
  for (let i = 0; i < 9; i++) if (i !== 6) { poser(8, i, false); poser(i, 8, false); }
  for (let i = 0; i < 8; i++) { poser(t - 1 - i, 8, false); poser(8, t - 1 - i, false); }
  poser(8, t - 8, true);
  if (v >= 7) {
    const b = bitsVersion(v);
    for (let i = 0; i < 18; i++) {
      const bit = ((b >>> i) & 1) === 1, a = t - 11 + (i % 3), c = Math.floor(i / 3);
      poser(a, c, bit); poser(c, a, bit);
    }
  }
  return { g, fixe, t };
}

export function ecrireFormat(g, t, niveau, masque) {
  const b = bitsFormat(niveau, masque);
  const bit = (i) => ((b >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) g[i][8] = bit(i);
  g[7][8] = bit(6); g[8][8] = bit(7); g[8][7] = bit(8);
  for (let i = 9; i < 15; i++) g[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) g[8][t - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) g[t - 15 + i][8] = bit(i);
  g[t - 8][8] = true;
}

/* L'ordre de pose des modules de données : des colonnes doubles, de la
   droite vers la gauche, en montant puis en descendant, la colonne 6
   (synchronisation) sautée. Le lecteur suit le même chemin. */
export function* parcours(t, fixe) {
  for (let droite = t - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5;
    for (let k = 0; k < t; k++) {
      for (let j = 0; j < 2; j++) {
        const x = droite - j;
        const monte = ((droite + 1) & 2) === 0;
        const y = monte ? t - 1 - k : k;
        if (!fixe[y][x]) yield [x, y];
      }
    }
  }
}

/* La pénalité d'une grille (norme, § 7.8.3) : on garde le masque le moins pénalisé. */
function penalite(g, t) {
  let p = 0;
  const lignes = [];
  for (let y = 0; y < t; y++) lignes.push(g[y]);
  for (let x = 0; x < t; x++) lignes.push(g.map((r) => r[x]));
  for (const L of lignes) {
    let n = 1;
    for (let i = 1; i <= t; i++) {
      if (i < t && L[i] === L[i - 1]) n++;
      else { if (n >= 5) p += 3 + (n - 5); n = 1; }
    }
    // le motif 1:1:3:1:1 bordé de 4 clairs : faux carré de repérage
    const s = "0000" + L.map((b) => (b ? "1" : "0")).join("") + "0000";
    for (let i = s.indexOf("10111010000"); i >= 0; i = s.indexOf("10111010000", i + 1)) p += 40;
    for (let i = s.indexOf("00001011101"); i >= 0; i = s.indexOf("00001011101", i + 1)) p += 40;
  }
  for (let y = 0; y < t - 1; y++) for (let x = 0; x < t - 1; x++) {
    const c = g[y][x];
    if (c === g[y][x + 1] && c === g[y + 1][x] && c === g[y + 1][x + 1]) p += 3;
  }
  const noirs = g.reduce((s, r) => s + r.filter(Boolean).length, 0);
  p += Math.floor(Math.abs(noirs * 20 - t * t * 10) / (t * t)) * 10;
  return p;
}

/* ── encoder ── */
export function encoder(message, { niveau = "M", versionMin = 1 } = {}) {
  const octs = typeof message === "string" ? new TextEncoder().encode(message) : message;
  const n = NIVEAUX[niveau];
  let v = versionMin;
  const bitsNeeded = (ver) => 4 + (ver < 10 ? 8 : 16) + octs.length * 8;
  while (v <= 40 && bitsNeeded(v) > octetsUtiles(v, n) * 8) v++;
  if (v > 40) throw new Error("message trop long pour un QR code");
  // 1. les bits : mode, longueur, octets, terminaison, bourrage
  const bits = [];
  const ajouter = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  ajouter(0b0100, 4);
  ajouter(octs.length, v < 10 ? 8 : 16);
  for (const o of octs) ajouter(o, 8);
  const capacite = octetsUtiles(v, n) * 8;
  ajouter(0, Math.min(4, capacite - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < capacite; pad ^= 0xec ^ 0x11) ajouter(pad, 8);
  const donnees = [];
  for (let i = 0; i < bits.length; i += 8) donnees.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // 2. les blocs et leur correction
  const nb = NB_BLOCS[n][v], ecc = ECC_PAR_BLOC[n][v], brut = octetsBruts(v);
  const courts = nb - (brut % nb), longueurCourt = Math.floor(brut / nb);
  const blocs = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = longueurCourt - ecc + (i < courts ? 0 : 1);
    const d = donnees.slice(k, k + len);
    k += len;
    blocs.push({ d, e: correction(d, ecc) });
  }
  // 3. l'entrelacement : le 1er octet de chaque bloc, puis le 2e…
  const suite = [];
  for (let i = 0; i < longueurCourt - ecc + 1; i++) for (const b of blocs) if (i < b.d.length) suite.push(b.d[i]);
  for (let i = 0; i < ecc; i++) for (const b of blocs) suite.push(b.e[i]);
  // 4. la pose, puis le meilleur masque
  const { g, fixe, t } = grilleVierge(v);
  let i = 0;
  for (const [x, y] of parcours(t, fixe)) {
    g[y][x] = i < suite.length * 8 ? ((suite[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false;
    i++;
  }
  let meilleur = null;
  for (let m = 0; m < 8; m++) {
    const essai = g.map((r) => r.slice());
    for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) if (!fixe[y][x] && MASQUES[m](x, y)) essai[y][x] = !essai[y][x];
    ecrireFormat(essai, t, n, m);
    const p = penalite(essai, t);
    if (!meilleur || p < meilleur.p) meilleur = { p, g: essai, m };
  }
  return { version: v, taille: t, niveau, masque: meilleur.m, modules: meilleur.g };
}

/* Le QR en SVG : un chemin par ligne de modules noirs, et la marge
   blanche de 4 modules que la norme exige. */
export function versSvg(qr, { marge = 4, clair = "#fff", fonce = "#000" } = {}) {
  const t = qr.taille, T = t + 2 * marge;
  let d = "";
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      if (!qr.modules[y][x]) continue;
      let l = 1;
      while (x + l < t && qr.modules[y][x + l]) l++;
      d += "M" + (x + marge) + " " + (y + marge) + "h" + l + "v1h-" + l + "z";
      x += l - 1;
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + T + " " + T + '" shape-rendering="crispEdges">'
    + '<rect width="' + T + '" height="' + T + '" fill="' + clair + '"/><path d="' + d + '" fill="' + fonce + '"/></svg>';
}
