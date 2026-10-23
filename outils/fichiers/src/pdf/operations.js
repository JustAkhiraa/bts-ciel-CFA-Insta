/* Ce qu'on fait d'un PDF : chaque opération lit un ou plusieurs documents
   et écrit un fichier NEUF.

   Le geste commun est la COPIE de pages : une page n'est qu'un
   dictionnaire, mais elle traîne derrière elle tout ce qu'elle référence —
   ses polices, ses images, ses annotations. On suit le graphe depuis la
   page, on renumérote chaque objet rencontré, et l'on s'arrête à ce qui
   n'est pas demandé : un lien vers une page qu'on ne garde pas devient
   « null », plutôt que d'embarquer la page entière en passager clandestin.

   Ce qu'une page hérite de ses parents (/Resources, /MediaBox, /CropBox,
   /Rotate) est recopié dans la page elle-même : sortie de son arbre
   d'origine, elle reste identique. */

import { N, Nom, Chaine, Ref, Dict, Flux, ecrireChaine } from "./objets.js";
import { DocumentPdf } from "./lecture.js";
import { Ecrivain, datePdf } from "./ecriture.js";
import { decoder, deflate } from "./filtres.js";
import { Chiffreur } from "./chiffrement.js";
import { versWinAnsi, largeurTexte } from "./police.js";
import { matriceOrientation } from "../exif.js";

export const PRODUCTEUR = "BTS CIEL — boîte à fichiers (dans le navigateur)";

/* ── la copie d'objets d'un document vers l'écrivain ── */
class Copieur {
  constructor(doc, ecrivain, pagesGardees) {
    this.doc = doc;
    this.e = ecrivain;
    this.map = new Map();
    this.gardees = pagesGardees;          // Set des numéros d'objet des pages copiées
  }
  async ref(r) {
    if (this.map.has(r.num)) return this.map.get(r.num);
    const v = await this.doc.obtenir(r.num);
    if (v instanceof Dict && v.type() === "Page" && !this.gardees.has(r.num)) return null;
    if (v instanceof Dict && v.type() === "Pages") return null;
    const nouveau = this.e.reserver();
    this.map.set(r.num, nouveau);
    this.e.poser(nouveau, await this.valeur(v));
    return nouveau;
  }
  async valeur(v) {
    if (v instanceof Ref) return this.ref(v);
    if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await this.valeur(x)); return out; }
    if (v instanceof Dict) {
      const d = new Dict();
      for (const [k, x] of v) {
        if (k === "Parent" && (v.type() === "Page" || v.type() === "Pages")) continue;
        d.set(k, await this.valeur(x));
      }
      return d;
    }
    if (v instanceof Flux) return new Flux(await this.valeur(v.dict), v.donnees);
    return v;
  }
}

/* Recopier une page sous un nouveau parent, ses héritages compris. */
async function copierPage(copieur, p, parent, modifier = null) {
  const cible = p.ref && copieur.map.has(p.ref.num) ? copieur.map.get(p.ref.num) : copieur.e.reserver();
  if (p.ref) copieur.map.set(p.ref.num, cible);
  const d = await copieur.valeur(p.dict);
  for (const k of ["Resources", "MediaBox", "CropBox", "Rotate"]) if (!d.has(k) && p.herite[k] !== undefined) d.set(k, await copieur.valeur(p.herite[k]));
  // boîtes et rotation en valeurs directes : les retouches (pivoter, recadrer,
  // tamponner) les lisent sans avoir à suivre une référence du NOUVEAU fichier
  const direct = (v) => (v instanceof Ref ? copieur.e.obtenir(v) : v);
  for (const k of ["MediaBox", "CropBox", "Rotate"]) {
    const v = direct(d.get(k));
    if (v !== undefined) d.set(k, Array.isArray(v) ? v.map(direct) : v);
  }
  if (!d.has("MediaBox")) d.set("MediaBox", [0, 0, 612, 792]);
  d.set("Type", N("Page"));
  d.set("Parent", parent);
  d.delete("StructParents"); d.delete("B");
  if (modifier) await modifier(d);
  copieur.e.poser(cible, d);
  return cible;
}

/* Le squelette d'un fichier : un nœud /Pages, un catalogue, une fiche Info. */
async function finir(e, pagesRefs, parent, { catalogue = null, info = null, chiffreur = null, version = "1.7" } = {}) {
  e.poser(parent, new Dict({ Type: N("Pages"), Kids: pagesRefs, Count: pagesRefs.length }));
  const cat = catalogue || new Dict();
  cat.set("Type", N("Catalog"));
  cat.set("Pages", parent);
  const racine = e.ajouter(cat);
  const i = info || new Dict();
  i.set("Producer", Chaine.depuisTexte(PRODUCTEUR));
  i.set("ModDate", Chaine.depuisTexte(datePdf()));
  if (!i.has("CreationDate")) i.set("CreationDate", Chaine.depuisTexte(datePdf()));
  const refInfo = e.ajouter(i);
  return e.octets({ racine, info: refInfo, chiffreur, version });
}

/* Ce qu'on garde du catalogue quand TOUTES les pages restent : signets,
   destinations nommées, formulaires, langue, préférences d'affichage. */
const CLES_CATALOGUE = ["Outlines", "Names", "Dests", "PageMode", "PageLayout", "Lang", "ViewerPreferences", "AcroForm", "PageLabels", "OCProperties"];

/* ── l'opération de base : un document → un nouveau document ── */
/* « selection » : les indices des pages, dans l'ordre voulu (doublons permis) ;
   « modifier(dict, index, page) » : retouche chaque page copiée. */
export async function reecrire(doc, { selection = null, modifier = null, chiffreur = null, info = undefined, garderStructure = null } = {}) {
  const pages = await doc.pages();
  const indices = selection || pages.map((_, i) => i);
  const toutes = garderStructure ?? (indices.length === pages.length && indices.every((x, i) => x === i));
  const e = new Ecrivain();
  const parent = e.reserver();
  const gardees = new Set(indices.map((i) => pages[i].ref && pages[i].ref.num).filter((x) => x != null));
  const c = new Copieur(doc, e, gardees);
  const refs = [];
  const dejaVues = new Set();
  for (const i of indices) {
    const p = pages[i];
    // une page demandée deux fois : la seconde est une copie indépendante
    const vue = { ...p, ref: dejaVues.has(i) ? null : p.ref };
    dejaVues.add(i);
    refs.push(await copierPage(c, vue, parent, modifier ? (d) => modifier(d, i, p) : null));
  }
  let catalogue = null;
  if (toutes) {
    const src = await doc.catalogue();
    catalogue = new Dict();
    for (const k of CLES_CATALOGUE) if (src && src.has(k)) catalogue.set(k, await c.valeur(src.get(k)));
  }
  let infoDict = info;
  if (infoDict === undefined) {
    const src = await doc.info();
    infoDict = new Dict();
    if (src instanceof Dict) for (const k of ["Title", "Author", "Subject", "Keywords", "Creator", "CreationDate"]) if (src.has(k)) infoDict.set(k, await doc.resoudre(src.get(k)));
  }
  return finir(e, refs, parent, { catalogue, info: infoDict, chiffreur, version: doc.version > "1.7" ? doc.version : "1.7" });
}

/* ── fusionner ── */
/* « morceaux » : [{ doc, selection?, modifier? }] — les pages de chacun, à
   la suite. Un même document peut revenir en plusieurs morceaux (pages
   entrelacées de deux fichiers) : ses polices et images ne sont copiées
   qu'une fois. « modifier(dict, index, rang) » retouche une page copiée. */
export async function fusionner(morceaux) {
  const e = new Ecrivain();
  const parent = e.reserver();
  const refs = [];
  const gardeesPar = new Map();
  for (const m of morceaux) {
    const pages = await m.doc.pages();
    if (!gardeesPar.has(m.doc)) gardeesPar.set(m.doc, new Set());
    for (const i of m.selection || pages.map((_, k) => k)) if (pages[i].ref) gardeesPar.get(m.doc).add(pages[i].ref.num);
  }
  const copieurs = new Map();
  for (const m of morceaux) {
    const pages = await m.doc.pages();
    if (!copieurs.has(m.doc)) copieurs.set(m.doc, { c: new Copieur(m.doc, e, gardeesPar.get(m.doc)), deja: new Set() });
    const { c, deja } = copieurs.get(m.doc);
    const indices = m.selection || pages.map((_, i) => i);
    for (let rang = 0; rang < indices.length; rang++) {
      const i = indices[rang], p = pages[i];
      refs.push(await copierPage(c, { ...p, ref: deja.has(i) ? null : p.ref }, parent, m.modifier ? (d) => m.modifier(d, i, rang) : null));
      deja.add(i);
    }
  }
  return finir(e, refs, parent, { info: new Dict() });
}

/* Ajouter des degrés à la rotation d'une page copiée. */
export function tourner(d, angle) {
  const r = typeof d.get("Rotate") === "number" ? d.get("Rotate") : 0;
  d.set("Rotate", (((r + angle) % 360) + 360) % 360);
}

/* Un PDF de pages blanches (pour intercaler, ou commencer un document). */
export async function pdfVierge(largeur = 595.28, hauteur = 841.89, n = 1) {
  const e = new Ecrivain();
  const parent = e.reserver();
  const refs = [];
  for (let i = 0; i < n; i++) refs.push(e.ajouter(new Dict({ Type: N("Page"), Parent: parent, MediaBox: [0, 0, nb2(largeur), nb2(hauteur)], Resources: new Dict() })));
  return finir(e, refs, parent, { info: new Dict() });
}

/* ── « 1-3, 5, 8-10 » → [0, 1, 2, 4, 7, 8, 9] ── */
export function lirePlages(texte, nbPages) {
  const out = [];
  for (const morceau of String(texte).split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+|fin|n)?\s*(?:-\s*(\d+|fin|n)?)?$/i.exec(morceau);
    if (!m || (!m[1] && !m[2])) throw new Error("« " + morceau + " » n'est pas une page ni une plage (exemple : 1-3, 5, 8-fin)");
    const val = (x, defaut) => (x === undefined ? defaut : /^(fin|n)$/i.test(x) ? nbPages : +x);
    const a = val(m[1], 1), b = morceau.includes("-") ? val(m[2], nbPages) : a;
    if (a < 1 || b < 1 || a > nbPages || b > nbPages) throw new Error("page hors du document (" + nbPages + " pages) : « " + morceau + " »");
    if (a <= b) for (let i = a; i <= b; i++) out.push(i - 1);
    else for (let i = a; i >= b; i--) out.push(i - 1);
  }
  return out;
}

/* ── pivoter, recadrer ── */
export async function pivoter(doc, angles) {
  // « angles » : un angle pour toutes, ou { index: angle }
  return reecrire(doc, {
    modifier: async (d, i) => {
      const a = typeof angles === "number" ? angles : angles[i] || 0;
      if (a) tourner(d, a);
    },
  });
}
/* Marges en points, à retirer de la boîte visible : { haut, bas, gauche, droite }. */
export async function recadrer(doc, marges, selection = null) {
  const touchees = selection ? new Set(selection) : null;
  return reecrire(doc, {
    modifier: async (d, i) => {
      if (touchees && !touchees.has(i)) return;
      const b = d.get("CropBox") || d.get("MediaBox");
      const [x0, y0, x1, y1] = [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])];
      const box = [x0 + (marges.gauche || 0), y0 + (marges.bas || 0), x1 - (marges.droite || 0), y1 - (marges.haut || 0)];
      if (box[2] - box[0] < 10 || box[3] - box[1] < 10) throw new Error("les marges mangent toute la page");
      d.set("CropBox", box);
    },
  });
}

/* ── écrire par-dessus une page ── */
/* La matrice qui fait dessiner « à l'endroit », dans la page telle qu'on la
   VOIT : une page pivotée de 90° a ses axes tournés. */
export function matriceVisible(boite, rotation) {
  const [x0, y0, x1, y1] = [Math.min(boite[0], boite[2]), Math.min(boite[1], boite[3]), Math.max(boite[0], boite[2]), Math.max(boite[1], boite[3])];
  const W = x1 - x0, H = y1 - y0;
  if (rotation === 90) return { m: [0, 1, -1, 0, x0 + W, y0], largeur: H, hauteur: W };
  if (rotation === 180) return { m: [-1, 0, 0, -1, x0 + W, y0 + H], largeur: W, hauteur: H };
  if (rotation === 270) return { m: [0, -1, 1, 0, x0, y0 + H], largeur: H, hauteur: W };
  return { m: [1, 0, 0, 1, x0, y0], largeur: W, hauteur: H };
}
const nb = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));

/* Ajouter un contenu à chaque page choisie. « dessiner(page) » rend
   { ops: [lignes d'opérateurs], ressources: { Font: {}, XObject: {}, ExtGState: {} } }
   ou null, dans les coordonnées VISIBLES (origine en bas à gauche). Les
   ressources de chaque page touchée lui deviennent propres : une page qui
   les partageait avec d'autres ne les leur modifie pas. */
export async function tamponnerPages(doc, dessiner, options = {}) {
  const pages = await doc.pages();
  const touchees = options.selection ? new Set(options.selection) : null;
  const e = new Ecrivain();
  const parent = e.reserver();
  const gardees = new Set(pages.map((p) => p.ref && p.ref.num).filter((x) => x != null));
  const c = new Copieur(doc, e, gardees);
  const refs = [];
  const enc = new TextEncoder();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    refs.push(await copierPage(c, p, parent, async (d) => {
      if (touchees && !touchees.has(i)) return;
      const t = await doc.taillePage(p);
      const mv = matriceVisible(d.get("CropBox") || d.get("MediaBox"), t.rotation);
      const r = await dessiner({ index: i, total: pages.length, largeur: mv.largeur, hauteur: mv.hauteur, ecrivain: e });
      if (!r) return;
      const avant = e.ajouter(new Flux(new Dict(), enc.encode("q\n")));
      const apres = e.ajouter(new Flux(new Dict(), enc.encode("Q\nq " + mv.m.map(nb).join(" ") + " cm\n" + r.ops.join("\n") + "\nQ\n")));
      const contenu = d.get("Contents");
      const existants = contenu == null ? [] : Array.isArray(contenu) ? contenu : [contenu];
      d.set("Contents", [avant, ...existants, apres]);
      // les ressources de la page, résolues et complétées (une copie à elle)
      let res = d.get("Resources");
      if (res instanceof Ref) res = e.obtenir(res);
      const ressources = new Dict();
      if (res instanceof Dict) for (const [k, v] of res) ressources.set(k, v);
      for (const [cat, entrees] of Object.entries(r.ressources || {})) {
        let ex = ressources.get(cat);
        if (ex instanceof Ref) ex = e.obtenir(ex);
        const sous = new Dict();
        if (ex instanceof Dict) for (const [k, v] of ex) sous.set(k, v);
        for (const [k, v] of Object.entries(entrees)) sous.set(k, v);
        ressources.set(cat, sous);
      }
      d.set("Resources", ressources);
    }));
  }
  const src = await doc.catalogue();
  const catalogue = new Dict();
  for (const k of CLES_CATALOGUE) if (src && src.has(k)) catalogue.set(k, await c.valeur(src.get(k)));
  const info = new Dict();
  const si = await doc.info();
  if (si instanceof Dict) for (const k of ["Title", "Author", "Subject", "Keywords", "Creator", "CreationDate"]) if (si.has(k)) info.set(k, await doc.resoudre(si.get(k)));
  return finir(e, refs, parent, { catalogue, info });
}

/* ── texte, numéros, filigrane ── */
const HELV = () => new Dict({ Type: N("Font"), Subtype: N("Type1"), BaseFont: N("Helvetica"), Encoding: N("WinAnsiEncoding") });
const HELV_GRAS = () => new Dict({ Type: N("Font"), Subtype: N("Type1"), BaseFont: N("Helvetica-Bold"), Encoding: N("WinAnsiEncoding") });
const chaineTexte = (s) => ecrireChaine(new Chaine(versWinAnsi(s)));
function couleur(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "#000000");
  return m ? [1, 2, 3].map((i) => +(parseInt(m[i], 16) / 255).toFixed(3)) : [0, 0, 0];
}

/* Numéroter : « {n} », « {n} / {total} », « Page {n} sur {total} »… */
export async function numeroter(doc, { modele = "{n} / {total}", position = "bas-centre", corps = 10, marge = 28, debut = 1, couleurHex = "#000000", selection = null } = {}) {
  return tamponnerPages(doc, ({ index, total, largeur, hauteur }) => {
    const rang = selection ? selection.indexOf(index) : index;
    const texte = modele.replace(/\{n\}/g, String(rang + debut)).replace(/\{total\}/g, String((selection ? selection.length : total) + debut - 1));
    const w = largeurTexte(texte, corps);
    const [v, h] = position.split("-");
    const x = h === "gauche" ? marge : h === "droite" ? largeur - marge - w : (largeur - w) / 2;
    const y = v === "haut" ? hauteur - marge - corps * 0.75 : marge;
    return { ops: [couleur(couleurHex).join(" ") + " rg", "BT /CielH " + corps + " Tf " + nb(x) + " " + nb(y) + " Td " + chaineTexte(texte) + " Tj ET"],
      ressources: { Font: { CielH: HELV() } } };
  }, { selection });
}

/* Un filigrane : un texte en diagonale, transparent. */
export async function filigraner(doc, { texte = "CONFIDENTIEL", corps = 60, opacite = 0.18, couleurHex = "#c0392b", angle = 45, selection = null } = {}) {
  return tamponnerPages(doc, ({ largeur, hauteur }) => {
    const w = largeurTexte(texte, corps);
    const a = (angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return {
      ops: ["/CielGS gs", couleur(couleurHex).join(" ") + " rg",
        nb(c) + " " + nb(s) + " " + nb(-s) + " " + nb(c) + " " + nb(largeur / 2) + " " + nb(hauteur / 2) + " cm",
        "BT /CielHB " + corps + " Tf " + nb(-w / 2) + " " + nb(-corps * 0.35) + " Td " + chaineTexte(texte) + " Tj ET"],
      ressources: { Font: { CielHB: HELV_GRAS() }, ExtGState: { CielGS: new Dict({ Type: N("ExtGState"), ca: opacite, CA: opacite }) } },
    };
  }, { selection });
}

/* Des textes posés : [{ page, x, y, texte, corps, couleurHex }] (x, y en points depuis le bas à gauche visible). */
export async function poserTextes(doc, textes) {
  const parPage = new Map();
  for (const t of textes) { if (!parPage.has(t.page)) parPage.set(t.page, []); parPage.get(t.page).push(t); }
  return tamponnerPages(doc, ({ index }) => {
    const L = parPage.get(index);
    if (!L) return null;
    const ops = [];
    for (const t of L) {
      const corps = t.corps || 12;
      String(t.texte).split("\n").forEach((ligne, k) => {
        ops.push(couleur(t.couleurHex).join(" ") + " rg", "BT /CielH " + corps + " Tf " + nb(t.x) + " " + nb(t.y - k * corps * 1.2) + " Td " + chaineTexte(ligne) + " Tj ET");
      });
    }
    return { ops, ressources: { Font: { CielH: HELV() } } };
  }, { selection: [...parPage.keys()] });
}

/* ── les images ── */
/* Les dimensions et les composantes d'un JPEG, lues dans son en-tête SOF. */
export function lireJpeg(o) {
  if (o[0] !== 0xff || o[1] !== 0xd8) return null;
  let p = 2;
  while (p + 9 < o.length) {
    if (o[p] !== 0xff) { p++; continue; }
    const m = o[p + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { p += 2; continue; }
    const lg = (o[p + 2] << 8) | o[p + 3];
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
      return { bits: o[p + 4], hauteur: (o[p + 5] << 8) | o[p + 6], largeur: (o[p + 7] << 8) | o[p + 8], composantes: o[p + 9] };
    }
    p += 2 + lg;
  }
  return null;
}

/* Une image en objet PDF : un JPEG tel quel (aucune perte), ou des pixels
   RGBA compressés sans perte, la transparence dans un masque à part. */
export async function objetImage(e, img) {
  if (img.type === "jpeg") {
    const j = lireJpeg(img.octets);
    if (!j) throw new Error("JPEG illisible");
    const cs = j.composantes === 1 ? "DeviceGray" : j.composantes === 4 ? "DeviceCMYK" : "DeviceRGB";
    const d = new Dict({ Type: N("XObject"), Subtype: N("Image"), Width: j.largeur, Height: j.hauteur, ColorSpace: N(cs), BitsPerComponent: 8, Filter: N("DCTDecode") });
    // les JPEG CMYK d'Adobe sont stockés inversés
    if (j.composantes === 4) d.set("Decode", [1, 0, 1, 0, 1, 0, 1, 0]);
    return { ref: e.ajouter(new Flux(d, img.octets)), largeur: j.largeur, hauteur: j.hauteur };
  }
  const { largeur: w, hauteur: h, pixels } = img;
  const rgb = new Uint8Array(w * h * 3), alpha = new Uint8Array(w * h);
  let opaque = true;
  for (let i = 0; i < w * h; i++) {
    rgb[3 * i] = pixels[4 * i]; rgb[3 * i + 1] = pixels[4 * i + 1]; rgb[3 * i + 2] = pixels[4 * i + 2];
    alpha[i] = pixels[4 * i + 3];
    if (alpha[i] !== 255) opaque = false;
  }
  const d = new Dict({ Type: N("XObject"), Subtype: N("Image"), Width: w, Height: h, ColorSpace: N("DeviceRGB"), BitsPerComponent: 8, Filter: N("FlateDecode") });
  if (!opaque) {
    const m = new Dict({ Type: N("XObject"), Subtype: N("Image"), Width: w, Height: h, ColorSpace: N("DeviceGray"), BitsPerComponent: 8, Filter: N("FlateDecode") });
    d.set("SMask", e.ajouter(new Flux(m, await deflate(alpha))));
  }
  return { ref: e.ajouter(new Flux(d, await deflate(rgb))), largeur: w, hauteur: h };
}

export const FORMATS = { A4: [595.28, 841.89], A3: [841.89, 1190.55], A5: [419.53, 595.28], Lettre: [612, 792] };

/* Des images → un PDF, une image par page. Un JPEG de téléphone « couché »
   (orientation EXIF 5 à 8) est redressé par la matrice de dessin, sans
   être recompressé. */
export async function imagesVersPdf(images, { format = "A4", orientation = "auto", marge = 20, titre = null } = {}) {
  const e = new Ecrivain();
  const parent = e.reserver();
  const refs = [];
  const enc = new TextEncoder();
  for (const img of images) {
    const o = await objetImage(e, img);
    const orient = img.type === "jpeg" ? img.orientation || 1 : 1;
    const couche = orient >= 5;
    const vu = couche ? { largeur: o.hauteur, hauteur: o.largeur } : o;
    let pw, ph;
    if (format === "ajuste") {
      // l'image à 96 ppp, sans dépasser un A3
      const k = Math.min(0.75, 1190.55 / Math.max(vu.largeur, vu.hauteur));
      pw = vu.largeur * k + 2 * marge; ph = vu.hauteur * k + 2 * marge;
    } else {
      [pw, ph] = FORMATS[format] || FORMATS.A4;
      const paysage = orientation === "paysage" || (orientation === "auto" && vu.largeur > vu.hauteur);
      if (paysage) [pw, ph] = [ph, pw];
    }
    const k = Math.min((pw - 2 * marge) / vu.largeur, (ph - 2 * marge) / vu.hauteur);
    const w = vu.largeur * k, h = vu.hauteur * k, x = (pw - w) / 2, y = (ph - h) / 2;
    const m = matriceOrientation(orient, x, y, w, h);
    const contenu = e.ajouter(new Flux(new Dict(), enc.encode("q " + m.map(nb).join(" ") + " cm /Im0 Do Q\n")));
    refs.push(e.ajouter(new Dict({ Type: N("Page"), Parent: parent, MediaBox: [0, 0, nb2(pw), nb2(ph)], Contents: contenu,
      Resources: new Dict({ XObject: new Dict({ Im0: o.ref }), ProcSet: [N("PDF"), N("ImageB"), N("ImageC")] }) })));
  }
  const info = new Dict();
  if (titre) info.set("Title", Chaine.depuisTexte(titre));
  return finir(e, refs, parent, { info });
}
const nb2 = (x) => Math.round(x * 100) / 100;

/* Une image posée sur une page (une signature, un tampon). « place » :
   { page, x, y, largeur } en points, coordonnées visibles. */
export async function poserImage(doc, img, places) {
  const parPage = new Map(places.map((p) => [p.page, p]));
  let refImage = null, dims = null;
  return tamponnerPages(doc, async ({ index, ecrivain }) => {
    const p = parPage.get(index);
    if (!p) return null;
    if (!refImage) { const o = await objetImage(ecrivain, img); refImage = o.ref; dims = o; }
    const w = p.largeur, h = (w * dims.hauteur) / dims.largeur;
    return { ops: ["q " + nb(w) + " 0 0 " + nb(h) + " " + nb(p.x) + " " + nb(p.y) + " cm /CielSig Do Q"], ressources: { XObject: { CielSig: refImage } } };
  }, { selection: [...parPage.keys()] });
}

/* ── métadonnées ── */
export async function lireMetadonnees(doc) {
  const i = await doc.info();
  const out = {};
  if (i instanceof Dict) for (const [k, v] of i) { const x = await doc.resoudre(v); if (x instanceof Chaine) out[k] = x.texte(); }
  return out;
}
/* « valeurs » : { Title, Author, Subject, Keywords } ; null pour tout effacer. */
export async function ecrireMetadonnees(doc, valeurs) {
  const info = new Dict();
  if (valeurs) for (const [k, v] of Object.entries(valeurs)) if (v) info.set(k, Chaine.depuisTexte(v));
  return reecrire(doc, { info });
}

/* ── protéger, déverrouiller ── */
export async function proteger(doc, motDePasse, { proprietaire = null, permissions = -4 } = {}) {
  const ch = await Chiffreur.creer(motDePasse, proprietaire, permissions);
  return reecrire(doc, { chiffreur: ch });
}
export async function deverrouiller(doc) { return reecrire(doc); }

/* ── les images contenues ── */
/* Toutes les images des pages (y compris dans les formulaires XObject), une fois chacune. */
export async function listerImages(doc) {
  const out = [];
  const vues = new Set();
  const visiter = async (res, page, prof = 0) => {
    res = await doc.resoudre(res);
    if (!(res instanceof Dict) || prof > 8) return;
    const xo = await doc.resoudre(res.get("XObject"));
    if (!(xo instanceof Dict)) return;
    for (const [nom, r] of xo) {
      const cle = r instanceof Ref ? r.num : null;
      if (cle !== null && vues.has(cle)) continue;
      if (cle !== null) vues.add(cle);
      const f = await doc.resoudre(r);
      if (!(f instanceof Flux)) continue;
      const st = f.dict.get("Subtype");
      if (st instanceof Nom && st.nom === "Image") out.push({ page, nom, ref: r, flux: f });
      else if (st instanceof Nom && st.nom === "Form") await visiter(f.dict.get("Resources"), page, prof + 1);
    }
  };
  const pages = await doc.pages();
  for (let i = 0; i < pages.length; i++) await visiter(pages[i].herite.Resources, i);
  return out;
}

/* Les pixels d'une image PDF non-JPEG (8 bits : gris, RVB, indexée ; 1 bit) → RGBA. */
export async function pixelsImage(doc, f) {
  const d = f.dict;
  const w = await doc.resoudre(d.get("Width")), h = await doc.resoudre(d.get("Height"));
  const dec = await decoder(f);
  if (dec.reste.length) return null;                     // JPEG, JPEG 2000, fax : à part
  const o = dec.octets;
  let cs = await doc.resoudre(d.get("ColorSpace"));
  const bpc = (await doc.resoudre(d.get("BitsPerComponent"))) || 1;
  const masque = d.get("ImageMask") === true;
  const rgba = new Uint8ClampedArray(w * h * 4);
  let comp = 1, palette = null, base = 1;
  if (Array.isArray(cs)) {
    const n = cs[0] instanceof Nom ? cs[0].nom : "";
    if (n === "ICCBased") { const icc = await doc.resoudre(cs[1]); comp = (await doc.resoudre(icc.dict.get("N"))) || 3; }
    else if (n === "Indexed") {
      const b = await doc.resoudre(cs[1]);
      base = b instanceof Nom ? (b.nom === "DeviceGray" ? 1 : b.nom === "DeviceCMYK" ? 4 : 3) : Array.isArray(b) && b[0] instanceof Nom && b[0].nom === "ICCBased" ? ((await doc.resoudre((await doc.resoudre(b[1])).dict.get("N"))) || 3) : 3;
      let lut = await doc.resoudre(cs[3]);
      palette = lut instanceof Chaine ? lut.octets : lut instanceof Flux ? await doc.decode(lut) : null;
      comp = 1;
    } else if (n === "CalRGB" || n === "Lab") comp = 3;
    else if (n === "CalGray") comp = 1;
    else if (n === "DeviceN" || n === "Separation") return null;
  } else if (cs instanceof Nom) comp = cs.nom === "DeviceRGB" || cs.nom === "RGB" ? 3 : cs.nom === "DeviceCMYK" || cs.nom === "CMYK" ? 4 : 1;
  const ligne = Math.ceil(w * comp * bpc / 8);
  const echant = (y, k) => {
    if (bpc === 8) return o[y * ligne + k];
    if (bpc === 16) return o[y * ligne + 2 * k];
    const bit = k * bpc, octet = o[y * ligne + (bit >> 3)];
    const v = (octet >> (8 - bpc - (bit & 7))) & ((1 << bpc) - 1);
    return palette ? v : Math.round((v * 255) / ((1 << bpc) - 1));
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (masque) { const v = echant(y, x); rgba[i] = rgba[i + 1] = rgba[i + 2] = v ? 255 : 0; rgba[i + 3] = 255; continue; }
    let r, g, b;
    if (palette) {
      const idx = echant(y, x);
      const p = palette.subarray(idx * base, idx * base + base);
      if (base === 1) r = g = b = p[0];
      else if (base === 4) { r = 255 - Math.min(255, p[0] + p[3]); g = 255 - Math.min(255, p[1] + p[3]); b = 255 - Math.min(255, p[2] + p[3]); }
      else { r = p[0]; g = p[1]; b = p[2]; }
    } else if (comp === 1) r = g = b = echant(y, x);
    else if (comp === 4) { const c = echant(y, 4 * x), m = echant(y, 4 * x + 1), j = echant(y, 4 * x + 2), k = echant(y, 4 * x + 3); r = 255 - Math.min(255, c + k); g = 255 - Math.min(255, m + k); b = 255 - Math.min(255, j + k); }
    else { r = echant(y, 3 * x); g = echant(y, 3 * x + 1); b = echant(y, 3 * x + 2); }
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
  }
  return { largeur: w, hauteur: h, rgba };
}

/* ── compresser ── */
/* « recompresser(info) » rend { octets (JPEG), largeur, hauteur } ou null.
   C'est la page qui le fournit : elle a le canevas du navigateur. */
export async function compresser(doc, recompresser) {
  const e = new Ecrivain();
  const parent = e.reserver();
  const pages = await doc.pages();
  const c = new Copieur(doc, e, new Set(pages.map((p) => p.ref && p.ref.num).filter((x) => x != null)));
  // d'abord, les images : chacune remplacée si sa version recompressée est plus petite
  const images = await listerImages(doc);
  let avant = 0, apres = 0;
  for (const im of images) {
    if (!(im.ref instanceof Ref) || c.map.has(im.ref.num)) continue;
    const f = im.flux, d = f.dict;
    avant += f.donnees.length;
    if (d.get("ImageMask") === true || d.get("Mask") !== undefined) { apres += f.donnees.length; continue; }
    let r = null;
    try { r = await recompresser({ doc, flux: f, jpeg: filtreDe(d) === "DCTDecode" }); } catch (err) { r = null; }
    if (!r || r.octets.length >= f.donnees.length * 0.92) { apres += f.donnees.length; continue; }
    const nd = new Dict({ Type: N("XObject"), Subtype: N("Image"), Width: r.largeur, Height: r.hauteur, ColorSpace: N("DeviceRGB"), BitsPerComponent: 8, Filter: N("DCTDecode") });
    if (d.has("SMask")) nd.set("SMask", await c.valeur(d.get("SMask")));
    if (d.has("Interpolate")) nd.set("Interpolate", d.get("Interpolate"));
    const ref = e.reserver();
    c.map.set(im.ref.num, ref);
    e.poser(ref, new Flux(nd, r.octets));
    apres += r.octets.length;
  }
  const refs = [];
  for (const p of pages) refs.push(await copierPage(c, p, parent));
  const src = await doc.catalogue();
  const catalogue = new Dict();
  for (const k of CLES_CATALOGUE) if (src && src.has(k)) catalogue.set(k, await c.valeur(src.get(k)));
  const octets = await finir(e, refs, parent, { catalogue, info: new Dict() });
  return { octets, imagesAvant: avant, imagesApres: apres, nbImages: images.length };
}
function filtreDe(d) {
  const f = d.get("Filter");
  const n = Array.isArray(f) ? f[f.length - 1] : f;
  return n instanceof Nom ? n.nom : null;
}

export { DocumentPdf };
