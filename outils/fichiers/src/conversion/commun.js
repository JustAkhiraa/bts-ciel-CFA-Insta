/* Ce que partagent les écrivains de formats : l'échappement XML, les
   unités, les images du modèle prêtes à ranger, un encodeur PNG et un
   Base64 qui marchent aussi hors du navigateur, les tableaux en feuilles. */

import { decoder, deflate } from "../pdf/filtres.js";
import { pixelsImage } from "../pdf/operations.js";
import { Flux } from "../pdf/objets.js";
import { crc32 } from "../zip.js";
import { texteDe } from "./structure.js";

export { texteDe };

/* Le texte d'un fichier XML : rien d'interdit (caractères de contrôle,
   demi-paires UTF-16), et les cinq caractères réservés échappés. */
const INTERDITS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
export const propre = (s) => String(s ?? "").replace(INTERDITS, "");
export const xml = (s) => propre(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const utf8 = (s) => new TextEncoder().encode(s);
export const ENTETE_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/* Les unités : le point (1/72 pouce) du PDF vers celles des formats. */
export const twips = (p) => Math.round(p * 20);              // .docx, .rtf : 1/20 de point
export const emu = (p) => Math.round(p * 12700);             // dessins .docx, .pptx, .xlsx
export const cm = (p) => (p * 2.54 / 72).toFixed(3) + "cm";  // OpenDocument
export const px = (p) => Math.round(p * 96 / 72);            // HTML

/* Base64 (pour les images d'une page HTML autonome). */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function base64(o) {
  let s = "";
  for (let i = 0; i < o.length; i += 3) {
    const a = o[i], b = o[i + 1], c = o[i + 2];
    s += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? "=" : B64[c & 63]);
  }
  return s;
}
export const hex = (o) => Array.from(o, (b) => b.toString(16).padStart(2, "0")).join("");

/* Un PNG, écrit ici : en-tête IHDR, pixels filtrés (« Up ») et compressés
   en zlib dans IDAT, fin IEND. Opaque, il est écrit en RVB. */
export async function encoderPng(rgba, w, h) {
  let alpha = false;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { alpha = true; break; }
  const n = alpha ? 4 : 3, ligne = w * n + 1;
  const brut = new Uint8Array(ligne * h);
  const prec = new Uint8Array(w * n);
  const cur = new Uint8Array(w * n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) for (let k = 0; k < n; k++) cur[x * n + k] = rgba[(y * w + x) * 4 + k];
    const o = y * ligne;
    brut[o] = 2;
    for (let i = 0; i < cur.length; i++) brut[o + 1 + i] = (cur[i] - prec[i]) & 255;
    prec.set(cur);
  }
  const morceau = (type, donnees) => {
    const t = new Uint8Array(4 + donnees.length);
    for (let i = 0; i < 4; i++) t[i] = type.charCodeAt(i);
    t.set(donnees, 4);
    const out = new Uint8Array(12 + donnees.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, donnees.length);
    out.set(t, 4);
    v.setUint32(8 + donnees.length, crc32(t));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w); v.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  const parties = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), morceau("IHDR", ihdr), morceau("IDAT", await deflate(brut)), morceau("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parties.reduce((s, p) => s + p.length, 0));
  let k = 0;
  for (const p of parties) { out.set(p, k); k += p.length; }
  return out;
}

/* Une image du PDF → { octets, mime, ext, largeur, hauteur } : un JPEG tel
   qu'il est rangé (aucune perte), le reste en PNG, transparence comprise. */
export async function donneesImage(doc, f) {
  const r = (x) => doc.resoudre(x);
  const d = f.dict;
  const w = await r(d.get("Width")), h = await r(d.get("Height"));
  if (!(w > 0) || !(h > 0) || w * h > 40e6) return null;
  const dec = await decoder(f);
  const filtre = dec.reste[0];
  if (filtre === "DCTDecode" || filtre === "DCT") return { octets: dec.octets, mime: "image/jpeg", ext: "jpg", largeur: w, hauteur: h };
  if (dec.reste.length) return null;                       // JPEG 2000, JBIG2, fax : aucun traitement de texte ne les lit tous
  const px = await pixelsImage(doc, f);
  if (!px) return null;
  const rgba = px.rgba;
  const dt = await r(d.get("Decode"));
  if (Array.isArray(dt) && dt[0] === 1) for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 255 - rgba[i]; rgba[i + 1] = 255 - rgba[i + 1]; rgba[i + 2] = 255 - rgba[i + 2]; }
  const sm = await r(d.get("SMask"));
  if (sm instanceof Flux) {
    const a = await pixelsImage(doc, sm);
    if (a) for (let y = 0; y < h; y++) {
      const sy = Math.min(a.hauteur - 1, Math.floor((y * a.hauteur) / h));
      for (let x = 0; x < w; x++) rgba[(y * w + x) * 4 + 3] = a.rgba[(sy * a.largeur + Math.min(a.largeur - 1, Math.floor((x * a.largeur) / w))) * 4];
    }
  }
  return { octets: await encoderPng(rgba, w, h), mime: "image/png", ext: "png", largeur: w, hauteur: h };
}

/* Toutes les images du modèle, prêtes : chacune reçoit ses octets et un nom
   de fichier (« image3.png ») ; une image illisible quitte le modèle.
   « fournir(image) » peut remplacer la lecture (pages rendues en images). */
export async function preparerImages(modele, doc, { surImage = null } = {}) {
  const parCle = new Map();
  let n = 0, perdues = 0;
  const visiter = async (blocs) => {
    for (let i = blocs.length - 1; i >= 0; i--) {
      const b = blocs[i];
      if (b.type !== "image") continue;
      const im = b.image;
      if (!im.donnees) {
        const cle = im.cle != null ? "r" + im.cle : null;
        let d = cle && parCle.has(cle) ? parCle.get(cle) : undefined;
        if (d === undefined) {
          try { d = await donneesImage(doc, im.flux); } catch (e) { d = null; }
          if (d) d.nom = "image" + ++n + "." + d.ext;
          if (cle) parCle.set(cle, d);
          if (surImage) await surImage(n);
        }
        if (!d) { blocs.splice(i, 1); perdues++; continue; }
        im.donnees = d;
      } else if (!im.donnees.nom) im.donnees.nom = "image" + ++n + "." + im.donnees.ext;
    }
  };
  for (const p of modele.pages) await visiter(p.blocs);
  return { images: n, perdues };
}
/* Les images distinctes du modèle (une seule fois chacune). */
export function imagesDe(modele) {
  const vues = new Map();
  for (const p of modele.pages) for (const b of p.blocs) if (b.type === "image" && b.image.donnees && !vues.has(b.image.donnees.nom)) vues.set(b.image.donnees.nom, b.image.donnees);
  return [...vues.values()];
}

/* La taille d'affichage d'une image (en points), bornée par la largeur utile. */
export function tailleImage(b, largeurUtile) {
  let l = b.l || b.image.donnees.largeur * 0.75, h = b.h || b.image.donnees.hauteur * 0.75;
  if (l > largeurUtile) { h *= largeurUtile / l; l = largeurUtile; }
  return { l, h };
}

/* La mise en page du document produit : la taille de la première page et
   des marges raisonnables (celles du texte du PDF, bornées). */
export function miseEnPage(modele, { pleinePage = false } = {}) {
  const p = modele.pages[0] || { largeur: 595.28, hauteur: 841.89, blocs: [] };
  if (pleinePage) return { largeur: p.largeur, hauteur: p.hauteur, marge: 0, utile: p.largeur, paysage: p.largeur > p.hauteur };
  const xs = modele.pages.flatMap((q) => q.blocs.map((b) => b.boite).filter(Boolean));
  let marge = 56.7;                                   // 2 cm
  if (xs.length) {
    const g = Math.min(...xs.map((b) => b.x0));
    if (g > 20 && g < 110) marge = Math.round(g);
  }
  return { largeur: p.largeur, hauteur: p.hauteur, marge, utile: p.largeur - 2 * marge, paysage: p.largeur > p.hauteur };
}

/* Les tableaux du modèle, en feuilles de tableur : une feuille par tableau.
   Chaque case : { texte, gras, colspan, rowspan, fond } ou null (couverte). */
export function feuillesDe(modele) {
  const out = [];
  let n = 0;
  for (const p of modele.pages) for (const b of p.blocs) {
    if (b.type !== "tableau") continue;
    n++;
    const lignes = b.lignes.map((l) => l.map((c) => c.couvert ? null : {
      texte: c.paras.map(texteDe).join("\n"), gras: c.paras.length > 0 && c.paras.every((r) => r.every((x) => x.gras || !x.t.trim())),
      colspan: c.colspan || 1, rowspan: c.rowspan || 1, fond: c.fond || null,
    }));
    out.push({ nom: "Tableau " + n + " (p. " + (p.index + 1) + ")", lignes, largeurs: b.largeurs });
  }
  return out;
}
/* Les lignes de texte de chaque page, en cases (lignesEnCases de structure.js) → feuilles. */
export function feuillesDuTexte(cases) {
  return cases.filter((p) => p.lignes.length).map((p) => ({
    nom: "Page " + (p.page + 1),
    lignes: p.lignes.map((l) => l.map((t) => ({ texte: t, gras: false, colspan: 1, rowspan: 1, fond: null }))),
    largeurs: null,
  }));
}
/* Un nom de feuille admis partout : 31 caractères, sans []:*?/\ , unique. */
export function nomsDeFeuilles(feuilles) {
  const vus = new Set();
  return feuilles.map((f) => {
    let n = f.nom.replace(/[[\]:*?/\\]/g, "-").slice(0, 31) || "Feuille";
    let k = 2;
    const base = n;
    while (vus.has(n.toLowerCase())) n = (base.slice(0, 27) + " " + k++).slice(0, 31);
    vus.add(n.toLowerCase());
    return n;
  });
}
/* « 1 234,56 », « 12.5 », « 45 % » → un nombre ; le reste (une adresse IP,
   une date, un code postal à zéro initial) reste du texte. */
export function nombre(t) {
  const s = String(t).trim().replace(/[   ]/g, "");
  if (!s || s.length > 18) return null;
  if (/^0\d/.test(s)) return null;
  let m = /^([-+−]?)(\d+)(?:[.,](\d+))?(%?)$/.exec(s);
  if (m) {
    const v = Number((m[1] === "−" ? "-" : m[1]) + m[2] + (m[3] ? "." + m[3] : ""));
    return m[4] ? { valeur: v / 100, pourcent: true } : { valeur: v, pourcent: false };
  }
  return null;
}
/* La colonne « A », « B »… « AA » d'un tableur. */
export function colonne(j) {
  let s = "";
  for (j++; j > 0; j = Math.floor((j - 1) / 26)) s = String.fromCharCode(65 + ((j - 1) % 26)) + s;
  return s;
}
/* Une feuille en grille rectangulaire, les fusions à part : [{ i, j, colspan, rowspan }]. */
export function grilleDe(f) {
  const lignes = f.lignes;
  const nc = Math.max(1, ...lignes.map((l) => l.length));
  const fusions = [];
  lignes.forEach((l, i) => l.forEach((c, j) => { if (c && (c.colspan > 1 || c.rowspan > 1)) fusions.push({ i, j, colspan: c.colspan, rowspan: c.rowspan }); }));
  return { nc, nl: lignes.length, fusions };
}

/* Un tableau en grille complète : chaque place est la case elle-même
   (« case »), ou la suite d'une case fusionnée vers le bas (« v ») ou vers
   la droite (« h »). Les formats ne notent pas les fusions de la même façon. */
export function couvertures(lignes) {
  const nc = Math.max(1, ...lignes.map((l) => l.length));
  const g = lignes.map(() => Array(nc).fill(null));
  lignes.forEach((l, i) => l.forEach((c, j) => {
    if (!c || c.couvert) return;
    for (let a = 0; a < (c.rowspan || 1); a++) for (let b = 0; b < (c.colspan || 1); b++) {
      if (!g[i + a] || j + b >= nc) continue;
      g[i + a][j + b] = a === 0 && b === 0 ? { genre: "case", c } : { genre: b === 0 ? "v" : "h", c };
    }
  }));
  return g.map((r) => r.map((x) => x || { genre: "case", c: { paras: [], colspan: 1, rowspan: 1 } }));
}
/* La ligne d'en-tête : la première, si tout y est en gras. */
export const enteteGras = (lignes) => lignes.length > 1 && lignes[0].every((c) => c.couvert || (c.paras.length && c.paras.every((r) => r.every((x) => x.gras || !x.t.trim()))));
/* Les largeurs des colonnes, ramenées à « total » si elles le dépassent. */
export function largeursDe(b, total) {
  const ls = b.largeurs && b.largeurs.length ? b.largeurs.map((x) => Math.max(12, x)) : [total];
  const s = ls.reduce((a, x) => a + x, 0);
  return s > total ? ls.map((x) => (x * total) / s) : ls;
}

/* Un identifiant stable (pour l'.epub) tiré du contenu. */
export function identifiant(texte) {
  const c = crc32(utf8(texte)).toString(16).padStart(8, "0"), d = crc32(utf8(texte + "|2")).toString(16).padStart(8, "0");
  const h = (c + d + c.split("").reverse().join("") + d.split("").reverse().join("")).slice(0, 32);
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-4" + h.slice(13, 16) + "-a" + h.slice(17, 20) + "-" + h.slice(20, 32);
}
export const dateIso = (d = new Date()) => d.toISOString().replace(/\.\d+Z$/, "Z");

/* Les blocs de tout le document, avec la page d'où ils viennent. */
export function* blocs(modele) {
  for (const [k, p] of modele.pages.entries()) for (const [i, b] of p.blocs.entries()) yield { b, page: p, premierDePage: i === 0 && k > 0 };
}
/* La numérotation d'une liste : « 1 », « a », « i »… selon le genre du premier numéro. */
export function numero(n, genre) {
  if (genre === "a" || genre === "A") { let s = ""; for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s; return genre === "A" ? s.toUpperCase() : s; }
  if (genre === "i" || genre === "I") {
    const R = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
    let s = "", k = n;
    for (const [v, l] of R) while (k >= v) { s += l; k -= v; }
    return genre === "I" ? s.toUpperCase() : s;
  }
  return String(n);
}
