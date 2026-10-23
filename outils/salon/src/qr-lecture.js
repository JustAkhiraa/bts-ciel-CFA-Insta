/* Lire un QR code dans une image (une photo de la caméra) — sans
   bibliothèque, pour les navigateurs qui n'ont pas l'outil intégré
   (BarcodeDetector manque sous Windows, Linux, iOS).

   1. NOIR ET BLANC : chaque pixel est comparé à la luminosité moyenne de
      son voisinage (un écran photographié n'est jamais éclairé
      uniformément) ;
   2. les trois CARRÉS DE REPÉRAGE : une ligne qui traverse leur centre lit
      noir-blanc-noir-noir-noir-blanc-noir, soit des longueurs 1:1:3:1:1 ;
   3. leur position donne l'ORIENTATION et la TAILLE de la grille ; le
      motif d'alignement, en bas à droite, corrige la PERSPECTIVE ;
   4. chaque module est échantillonné en son centre, les bits de FORMAT
      donnent le niveau de correction et le masque ;
   5. les octets sont relus dans l'ordre du zigzag, désentrelacés, et
      chaque bloc est CORRIGÉ par Reed-Solomon (syndromes,
      Berlekamp-Massey, Chien, Forney) avant d'être lu. */

import { EXP, LOG, mul, NIVEAUX, ECC_PAR_BLOC, NB_BLOCS, octetsBruts, bitsFormat, bitsVersion, grilleVierge, parcours, MASQUES } from "./qr.js";

/* ── 1. noir et blanc ── */
export function binariser(img) {
  const { width: w, height: h, data } = img;
  const gris = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) gris[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  const B = 8, bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  const moy = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let min = 255, max = 0, s = 0, n = 0;
    for (let y = by * B; y < Math.min(h, by * B + B); y++) for (let x = bx * B; x < Math.min(w, bx * B + B); x++) {
      const g = gris[y * w + x];
      s += g; n++;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    let m = s / n;
    // un bloc uni : on le suppose clair, sauf si ses voisins disent le contraire
    if (max - min <= 24) {
      m = min / 2;
      if (by > 0 && bx > 0) {
        const voisins = (moy[(by - 1) * bw + bx] + 2 * moy[by * bw + bx - 1] + moy[(by - 1) * bw + bx - 1]) / 4;
        if (min < voisins) m = voisins;
      }
    }
    moy[by * bw + bx] = m;
  }
  const noir = new Uint8Array(w * h);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let s = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const yy = Math.min(bh - 1, Math.max(0, by + dy)), xx = Math.min(bw - 1, Math.max(0, bx + dx));
      s += moy[yy * bw + xx]; n++;
    }
    const seuil = s / n;
    for (let y = by * B; y < Math.min(h, by * B + B); y++) for (let x = bx * B; x < Math.min(w, bx * B + B); x++) noir[y * w + x] = gris[y * w + x] <= seuil ? 1 : 0;
  }
  return { w, h, noir, at: (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? noir[(y | 0) * w + (x | 0)] : 0) };
}

/* ── 2. les carrés de repérage ── */
function rapportRepere(c) {
  const total = c[0] + c[1] + c[2] + c[3] + c[4];
  if (total < 7) return false;
  const m = total / 7, tol = m / 1.7;
  return Math.abs(m - c[0]) < tol && Math.abs(m - c[1]) < tol && Math.abs(3 * m - c[2]) < 3 * tol && Math.abs(m - c[3]) < tol && Math.abs(m - c[4]) < tol;
}
/* Le long d'une colonne (ou d'une ligne), autour d'un centre supposé : les
   cinq longueurs, ou null. */
function croiser(B, cx, cy, dx, dy, max) {
  const c = [0, 0, 0, 0, 0];
  let x = cx, y = cy;
  while (B.at(x, y) && c[2] <= max) { c[2]++; x -= dx; y -= dy; }
  while (!B.at(x, y) && c[1] <= max && inside(B, x, y)) { c[1]++; x -= dx; y -= dy; }
  while (B.at(x, y) && c[0] <= max) { c[0]++; x -= dx; y -= dy; }
  x = cx + dx; y = cy + dy;
  while (B.at(x, y) && c[2] <= max) { c[2]++; x += dx; y += dy; }
  while (!B.at(x, y) && c[3] <= max && inside(B, x, y)) { c[3]++; x += dx; y += dy; }
  while (B.at(x, y) && c[4] <= max) { c[4]++; x += dx; y += dy; }
  if (!rapportRepere(c)) return null;
  // le centre : le milieu du carré noir central
  const fin = dx ? x - dx * (c[4] + c[3]) : y - dy * (c[4] + c[3]);
  return { centre: fin - c[2] / 2, total: c.reduce((a, b) => a + b, 0) };
}
const inside = (B, x, y) => x >= 0 && y >= 0 && x < B.w && y < B.h;

function trouverReperes(B) {
  const cands = [];
  const pas = Math.max(1, Math.floor(B.h / 300));
  for (let y = 0; y < B.h; y += pas) {
    const c = [0, 0, 0, 0, 0];
    let etat = 0;
    for (let x = 0; x <= B.w; x++) {
      const n = x < B.w ? B.at(x, y) : 0;
      if (n) {
        if (etat === 1 || etat === 3) etat++;
        c[etat]++;
      } else if (etat === 0 && c[0] === 0) {
        continue;
      } else if (etat === 0 || etat === 2) {
        etat++; c[etat]++;
      } else if (etat === 1 || etat === 3) {
        c[etat]++;
      } else {
        // etat 4 : un motif complet vient de finir
        if (rapportRepere(c)) {
          const cx = x - c[4] - c[3] - c[2] / 2;
          const total = c.reduce((a, b) => a + b, 0);
          const v = croiser(B, Math.floor(cx), y, 0, 1, total);
          if (v) {
            const h = croiser(B, Math.floor(cx), Math.floor(v.centre), 1, 0, total);
            if (h) ajouterCandidat(cands, h.centre, v.centre, (h.total + v.total) / 14);
          }
        }
        c[0] = c[2]; c[1] = c[3]; c[2] = c[4]; c[3] = 1; c[4] = 0; etat = 3;
      }
    }
  }
  return cands;
}
function ajouterCandidat(cands, x, y, m) {
  for (const c of cands) {
    if (Math.abs(c.x - x) <= c.m * 2 && Math.abs(c.y - y) <= c.m * 2 && Math.abs(c.m - m) <= Math.max(1, c.m * 0.5)) {
      c.x = (c.x * c.n + x) / (c.n + 1); c.y = (c.y * c.n + y) / (c.n + 1); c.m = (c.m * c.n + m) / (c.n + 1); c.n++;
      return;
    }
  }
  cands.push({ x, y, m, n: 1 });
}

/* Les trois repères qui forment le mieux un coin de carré, rangés :
   haut-gauche, haut-droite, bas-gauche. */
function choisirTrio(cands) {
  const L = cands.filter((c) => c.n >= 2).sort((a, b) => b.n - a.n).slice(0, 12);
  const pool = L.length >= 3 ? L : cands.slice().sort((a, b) => b.n - a.n).slice(0, 12);
  let meilleur = null;
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) for (let k = j + 1; k < pool.length; k++) {
    const t = [pool[i], pool[j], pool[k]];
    const ms = t.map((c) => c.m), mm = (ms[0] + ms[1] + ms[2]) / 3;
    if (Math.max(...ms) > 1.6 * Math.min(...ms)) continue;
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const cotes = [[d(t[1], t[2]), 0], [d(t[0], t[2]), 1], [d(t[0], t[1]), 2]].sort((a, b) => b[0] - a[0]);
    const tl = t[cotes[0][1]], autres = t.filter((x) => x !== tl);
    const a = d(tl, autres[0]), b = d(tl, autres[1]);
    if (a < 7 * mm || b < 7 * mm) continue;
    // un angle droit, deux côtés égaux : l'hypoténuse vaut √2 fois un côté
    const ecart = Math.abs(a - b) / Math.max(a, b) + Math.abs(cotes[0][0] / Math.hypot(a, b) - 1) * 2;
    const score = ecart + (Math.max(...ms) - Math.min(...ms)) / mm;
    if (!meilleur || score < meilleur.score) meilleur = { score, tl, a: autres[0], b: autres[1], m: mm };
  }
  if (!meilleur || meilleur.score > 0.5) return null;
  let { tl, a, b } = meilleur;
  // le sens : de haut-gauche, haut-droite est « avant » bas-gauche en tournant
  if ((a.x - tl.x) * (b.y - tl.y) - (a.y - tl.y) * (b.x - tl.x) < 0) [a, b] = [b, a];
  return { tl, tr: a, bl: b, m: meilleur.m };
}

/* La taille d'un module, mesurée DANS L'AXE de la grille : de part et
   d'autre du centre d'un repère, vers un autre repère, on traverse
   noir-blanc-noir jusqu'au bord — 3,5 modules de chaque côté. Mesurée le
   long d'une ligne de l'image, elle serait gonflée dès que le QR penche. */
function demiLargeur(B, x, y, ux, uy) {
  let changements = 0, couleur = B.at(x, y), d = 0;
  for (; d < 400; d += 0.5) {
    const c = B.at(x + ux * d, y + uy * d);
    if (c !== couleur) { couleur = c; if (++changements === 3) return d; }
  }
  return null;
}
function moduleDansAxe(B, a, b) {
  const L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  const mesures = [];
  for (const [p, sx, sy] of [[a, ux, uy], [a, -ux, -uy], [b, -ux, -uy], [b, ux, uy]]) {
    const d = demiLargeur(B, p.x, p.y, sx, sy);
    if (d) mesures.push(d / 3.5);
  }
  return mesures.length ? mesures.reduce((s, x) => s + x, 0) / mesures.length : null;
}

/* ── 3. la perspective ── */
/* L'homographie qui envoie 4 points (u,v) de la grille sur 4 points (x,y)
   de l'image : un système de 8 équations, résolu par le pivot de Gauss. */
function homographie(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i], [x, y] = dst[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((x, i) => x / A[i][i]);
  return (u, v) => {
    const z = h[6] * u + h[7] * v + 1;
    return [(h[0] * u + h[1] * v + h[2]) / z, (h[3] * u + h[4] * v + h[5]) / z];
  };
}

/* Le motif d'alignement : un carré noir d'un module, cerné de blanc puis
   de noir. On le cherche autour de l'endroit où il devrait être. */
function trouverAlignement(B, ex, ey, m) {
  const r = Math.ceil(m * 4);
  let meilleur = null;
  for (let y = Math.floor(ey - r); y <= ey + r; y++) {
    for (let x = Math.floor(ex - r); x <= ex + r; x++) {
      if (!B.at(x, y)) continue;
      const mesure = (dx, dy) => {
        let n = 1, a = x - dx, b = y - dy;
        while (B.at(a, b) && n < 3 * m) { n++; a -= dx; b -= dy; }
        let blanc1 = 0; while (!B.at(a, b) && blanc1 < 3 * m && inside(B, a, b)) { blanc1++; a -= dx; b -= dy; }
        let c = x + dx, d = y + dy;
        while (B.at(c, d) && n < 3 * m) { n++; c += dx; d += dy; }
        let blanc2 = 0; while (!B.at(c, d) && blanc2 < 3 * m && inside(B, c, d)) { blanc2++; c += dx; d += dy; }
        return { n, blanc1, blanc2 };
      };
      const H = mesure(1, 0), V = mesure(0, 1);
      const okRun = (q) => q.n >= 0.5 * m && q.n <= 1.6 * m && q.blanc1 >= 0.5 * m && q.blanc1 <= 1.6 * m && q.blanc2 >= 0.5 * m && q.blanc2 <= 1.6 * m;
      if (!okRun(H) || !okRun(V)) continue;
      const d = Math.hypot(x - ex, y - ey);
      if (!meilleur || d < meilleur.d) meilleur = { x, y, d };
    }
  }
  if (!meilleur) return null;
  // affiner au centre du module noir
  let x0 = meilleur.x, x1 = meilleur.x, y0 = meilleur.y, y1 = meilleur.y;
  while (B.at(x0 - 1, meilleur.y)) x0--;
  while (B.at(x1 + 1, meilleur.y)) x1++;
  while (B.at(meilleur.x, y0 - 1)) y0--;
  while (B.at(meilleur.x, y1 + 1)) y1++;
  return { x: (x0 + x1 + 1) / 2, y: (y0 + y1 + 1) / 2 };
}

function echantillonner(B, t, transfo) {
  const g = [];
  for (let y = 0; y < t; y++) {
    const ligne = [];
    for (let x = 0; x < t; x++) {
      const [px, py] = transfo(x + 0.5, y + 0.5);
      if (px < -1 || py < -1 || px > B.w || py > B.h) return null;
      ligne.push(B.at(Math.round(px - 0.5), Math.round(py - 0.5)) === 1);
    }
    g.push(ligne);
  }
  return g;
}

/* ── 4. les bits de format ── */
const distance = (a, b) => { let x = a ^ b, n = 0; while (x) { n += x & 1; x >>>= 1; } return n; };
function lireFormat(g, t) {
  const b = (y, x) => (g[y][x] ? 1 : 0);
  let f1 = 0, f2 = 0;
  for (let i = 0; i <= 5; i++) f1 |= b(i, 8) << i;
  f1 |= b(7, 8) << 6; f1 |= b(8, 8) << 7; f1 |= b(8, 7) << 8;
  for (let i = 9; i < 15; i++) f1 |= b(8, 14 - i) << i;
  for (let i = 0; i < 8; i++) f2 |= b(8, t - 1 - i) << i;
  for (let i = 8; i < 15; i++) f2 |= b(t - 15 + i, 8) << i;
  let meilleur = null;
  for (let n = 0; n < 4; n++) for (let m = 0; m < 8; m++) {
    const ref = bitsFormat(n, m);
    const d = Math.min(distance(ref, f1), distance(ref, f2));
    if (!meilleur || d < meilleur.d) meilleur = { d, n, m };
  }
  return meilleur && meilleur.d <= 3 ? meilleur : null;
}
function lireVersion(g, t) {
  let v1 = 0, v2 = 0;
  for (let i = 0; i < 18; i++) {
    const a = t - 11 + (i % 3), c = Math.floor(i / 3);
    v1 |= (g[c][a] ? 1 : 0) << i;
    v2 |= (g[a][c] ? 1 : 0) << i;
  }
  let meilleur = null;
  for (let v = 7; v <= 40; v++) {
    const d = Math.min(distance(bitsVersion(v), v1), distance(bitsVersion(v), v2));
    if (!meilleur || d < meilleur.d) meilleur = { d, v };
  }
  return meilleur && meilleur.d <= 3 ? meilleur.v : null;
}

/* ── 5. Reed-Solomon : corriger un bloc ── */
const div = (a, b) => (a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0);
function evaluer(p, x) {                       // p[0] = coefficient du plus haut degré
  let r = 0;
  for (const c of p) r = mul(r, x) ^ c;
  return r;
}
export function corriger(bloc, ecc) {
  const n = bloc.length;
  const S = [];
  let erreur = false;
  for (let j = 0; j < ecc; j++) { S.push(evaluer(bloc, EXP[j])); if (S[j]) erreur = true; }
  if (!erreur) return bloc;
  // Berlekamp-Massey : le polynôme localisateur Λ (coefficients du degré 0 vers le haut)
  let C = [1], Bp = [1], L = 0, m = 1, b = 1;
  for (let k = 0; k < ecc; k++) {
    let d = S[k];
    for (let i = 1; i <= L; i++) d ^= mul(C[i] || 0, S[k - i]);
    if (d === 0) { m++; continue; }
    const coef = div(d, b);
    const T = C.slice();
    const nouveau = C.slice();
    for (let i = 0; i < Bp.length; i++) {
      while (nouveau.length <= i + m) nouveau.push(0);
      nouveau[i + m] ^= mul(coef, Bp[i]);
    }
    if (2 * L <= k) { L = k + 1 - L; Bp = T; b = d; m = 1; } else m++;
    C = nouveau;
  }
  if (2 * L > ecc) return null;
  // Chien : les racines de Λ donnent les positions fautives
  const positions = [];
  for (let i = 0; i < n; i++) {
    const xinv = EXP[(255 - i) % 255];
    let s = 0;
    for (let k = C.length - 1; k >= 0; k--) s = mul(s, xinv) ^ C[k];
    if (s === 0) positions.push(i);
  }
  if (positions.length !== L) return null;
  // Forney : Ω = S·Λ mod x^ecc, et la valeur de chaque erreur
  const omega = new Array(ecc).fill(0);
  for (let i = 0; i < ecc; i++) for (let j = 0; j < C.length && i + j < ecc; j++) omega[i + j] ^= mul(S[i], C[j]);
  const out = bloc.slice();
  for (const i of positions) {
    const X = EXP[i], Xinv = EXP[(255 - i) % 255];
    let num = 0;
    for (let k = omega.length - 1; k >= 0; k--) num = mul(num, Xinv) ^ omega[k];
    let den = 0;
    for (let k = 1; k < C.length; k += 2) den ^= mul(C[k], EXP[(LOG[Xinv] * (k - 1)) % 255]);
    if (!den) return null;
    out[n - 1 - i] ^= mul(X, div(num, den));
  }
  // la preuve : plus aucun syndrome
  for (let j = 0; j < ecc; j++) if (evaluer(out, EXP[j])) return null;
  return out;
}

/* ── 6. de la grille aux octets ── */
export function lireGrille(g) {
  const t = g.length, v = (t - 17) / 4;
  if (!Number.isInteger(v) || v < 1 || v > 40) return null;
  const fmt = lireFormat(g, t);
  if (!fmt) return null;
  const { fixe } = grilleVierge(v);
  const bits = [];
  for (const [x, y] of parcours(t, fixe)) bits.push(g[y][x] !== MASQUES[fmt.m](x, y) ? 1 : 0);
  const brut = octetsBruts(v);
  const octs = [];
  for (let i = 0; i < brut; i++) { let o = 0; for (let k = 0; k < 8; k++) o = (o << 1) | bits[i * 8 + k]; octs.push(o); }
  const nb = NB_BLOCS[fmt.n][v], ecc = ECC_PAR_BLOC[fmt.n][v];
  const courts = nb - (brut % nb), longueurCourt = Math.floor(brut / nb);
  const blocs = Array.from({ length: nb }, (_, i) => ({ d: [], len: longueurCourt - ecc + (i < courts ? 0 : 1) }));
  let k = 0;
  for (let i = 0; i < longueurCourt - ecc + 1; i++) for (const b of blocs) if (i < b.len) b.d.push(octs[k++]);
  for (let i = 0; i < ecc; i++) for (const b of blocs) b.d.push(octs[k++]);
  const donnees = [];
  let corrections = 0;
  for (const b of blocs) {
    const c = corriger(b.d, ecc);
    if (!c) return null;
    for (let i = 0; i < b.d.length; i++) if (c[i] !== b.d[i]) corrections++;
    donnees.push(...c.slice(0, b.len));
  }
  const message = segments(donnees, v);
  return message === null ? null : { octets: message, version: v, niveau: "LMQH"[fmt.n], corrections };
}

/* Les segments : octets, chiffres, alphanumérique ; ECI ignoré. */
const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
function segments(donnees, v) {
  let pos = 0;
  const lire = (n) => {
    let x = 0;
    for (let i = 0; i < n; i++) { const o = donnees[pos >>> 3]; x = (x << 1) | (o === undefined ? 0 : (o >>> (7 - (pos & 7))) & 1); pos++; }
    return x;
  };
  const taille = donnees.length * 8;
  const groupe = v < 10 ? 0 : v < 27 ? 1 : 2;
  const out = [];
  while (pos + 4 <= taille) {
    const mode = lire(4);
    if (mode === 0) break;
    if (mode === 4) {
      const n = lire([8, 16, 16][groupe]);
      for (let i = 0; i < n; i++) out.push(lire(8));
    } else if (mode === 2) {
      let n = lire([9, 11, 13][groupe]);
      for (; n >= 2; n -= 2) { const x = lire(11); out.push(ALNUM.charCodeAt(Math.floor(x / 45)), ALNUM.charCodeAt(x % 45)); }
      if (n === 1) out.push(ALNUM.charCodeAt(lire(6)));
    } else if (mode === 1) {
      let n = lire([10, 12, 14][groupe]);
      for (; n >= 3; n -= 3) String(lire(10)).padStart(3, "0").split("").forEach((c) => out.push(c.charCodeAt(0)));
      if (n === 2) String(lire(7)).padStart(2, "0").split("").forEach((c) => out.push(c.charCodeAt(0)));
      if (n === 1) out.push(String(lire(4)).charCodeAt(0));
    } else if (mode === 7) {
      lire(8);                                 // désignateur ECI (on lit tout en UTF-8)
    } else {
      return null;
    }
  }
  return new Uint8Array(out);
}

/* ── tout ensemble ── */
export function lireQr(img) {
  const B = binariser(img);
  const trio = choisirTrio(trouverReperes(B));
  if (!trio) return null;
  const { tl, tr, bl } = trio;
  const m1 = moduleDansAxe(B, tl, tr) || trio.m, m2 = moduleDansAxe(B, tl, bl) || trio.m;
  const m = (m1 + m2) / 2;
  const d1 = Math.hypot(tr.x - tl.x, tr.y - tl.y) / m1, d2 = Math.hypot(bl.x - tl.x, bl.y - tl.y) / m2;
  let dim = Math.round((d1 + d2) / 2) + 7;
  dim += [1, 0, -1, 2][dim & 3];
  // on essaie la taille estimée, puis ses voisines (la mesure peut se tromper d'une version)
  for (const t of [dim, dim - 4, dim + 4]) {
    if (t < 21 || t > 177) continue;
    const r = lireTaille(B, tl, tr, bl, m, t);
    if (r) return r;
  }
  return null;
}
function lireTaille(B, tl, tr, bl, m, t) {
  const src = [[3.5, 3.5], [t - 3.5, 3.5], [3.5, t - 3.5]];
  const dst = [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y]];
  const essais = [];
  // le quatrième point : le motif d'alignement s'il existe, sinon le coin du parallélogramme
  if (t > 21) {
    const affine = homographie([...src, [t - 3.5, t - 3.5]], [...dst, [tr.x + bl.x - tl.x, tr.y + bl.y - tl.y]]);
    if (affine) {
      const [ex, ey] = affine(t - 6.5, t - 6.5);
      const al = trouverAlignement(B, ex, ey, m);
      if (al) essais.push([[t - 6.5, t - 6.5], [al.x, al.y]]);
    }
  }
  essais.push([[t - 3.5, t - 3.5], [tr.x + bl.x - tl.x, tr.y + bl.y - tl.y]]);
  for (const [s4, d4] of essais) {
    const H = homographie([...src, s4], [...dst, d4]);
    if (!H) continue;
    let g = echantillonner(B, t, H);
    if (!g) continue;
    let r = lireGrille(g);
    if (!r && t >= 45) {
      const v = lireVersion(g, t);
      if (v && 4 * v + 17 !== t) return lireTaille(B, tl, tr, bl, m, 4 * v + 17);
    }
    if (r) return { ...r, texte: new TextDecoder().decode(r.octets) };
  }
  return null;
}
