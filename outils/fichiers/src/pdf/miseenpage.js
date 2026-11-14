/* Mettre en page, nettoyer, annoter la STRUCTURE d'un PDF.

   Demandé le 13 novembre 2026 : ce que savent faire les boîtes à outils PDF
   qu'on installe sur un serveur, ici dans le navigateur. Rien de ce module
   ne dessine : il réarrange des objets PDF, avec les gestes de base du
   moteur (copier une page, écrire un fichier neuf).

   Le geste nouveau est la POSE. Une page devient un « formulaire » (un
   XObject Form) : son contenu et ses ressources, rangés dans un objet qu'on
   peut dessiner n'importe où, à n'importe quelle échelle, sur une autre
   page. Plusieurs pages par feuille, livret, changement de format, grande
   page et superposition ne sont que des façons de choisir OÙ poser.

   Une page se pose TELLE QU'ON LA VOIT : sa rotation (/Rotate) et son
   recadrage (/CropBox) sont appliqués. Ce que la pose perd, et qu'il faut
   dire à l'utilisateur : les liens et les annotations de la page, qui ne
   font pas partie de son contenu. */

import { N, Nom, Chaine, Ref, Dict, Flux, ecrireChaine } from "./objets.js";
import { Ecrivain, datePdf } from "./ecriture.js";
import { Copieur, copierPage, finir, CLES_CATALOGUE, nb, matriceVisible, reecrire, tamponnerPages, FORMATS, objetImage } from "./operations.js";
import { contenuPage } from "./rendu.js";
import { versWinAnsi, largeurTexte } from "./police.js";

const enc = new TextEncoder();
const r2 = (x) => Math.round(x * 100) / 100;
/* Cinq décimales pour une échelle : à trois, une page réduite au quart
   glissait d'un demi-point sur la longueur d'une feuille. */
const n5 = (x) => String(+x.toFixed(5));
const nomDe = (v) => (v instanceof Nom ? v.nom : null);
const inverse = ([a, b, c, d, e, f]) => {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
};
async function infoDe(doc) {
  const src = await doc.info();
  const i = new Dict();
  if (src instanceof Dict) for (const k of ["Title", "Author", "Subject", "Keywords", "Creator", "CreationDate"]) if (src.has(k)) i.set(k, await doc.resoudre(src.get(k)));
  return i;
}

/* ── la pose ── */
class Poseur {
  constructor(doc, ecrivain) {
    this.doc = doc;
    this.e = ecrivain;
    this.c = new Copieur(doc, ecrivain, new Set());   // aucune page n'est copiée EN TANT QUE page
    this.formes = new Map();
  }
  /* La page « index » en formulaire : faite une fois, posée autant qu'on veut. */
  async forme(index) {
    if (this.formes.has(index)) return this.formes.get(index);
    const p = (await this.doc.pages())[index];
    if (!p) throw new Error("page " + (index + 1) + " introuvable");
    const t = await this.doc.taillePage(p);
    const media = await Promise.all(((await this.doc.resoudre(p.herite.MediaBox)) || [0, 0, 612, 792]).map((x) => this.doc.resoudre(x)));
    const d = new Dict({ Type: N("XObject"), Subtype: N("Form"), FormType: 1, BBox: media });
    if (p.herite.Resources !== undefined) d.set("Resources", await this.c.valeur(p.herite.Resources));
    const ref = this.e.ajouter(new Flux(d, await contenuPage(this.doc, p)));
    const f = { ref, largeur: t.largeur, hauteur: t.hauteur, inv: inverse(matriceVisible(t.boite, t.rotation).m) };
    this.formes.set(index, f);
    return f;
  }
  /* Les opérateurs qui dessinent la page dans le cadre (x, y, l, h), entière
     et centrée. Le découpage (« re W n ») retient ce qui dépasse du recadrage. */
  async poser(index, nom, x, y, l, h, { agrandir = true } = {}) {
    const f = await this.forme(index);
    let k = Math.min(l / f.largeur, h / f.hauteur);
    if (!agrandir) k = Math.min(1, k);
    const w = f.largeur * k, hh = f.hauteur * k, X = x + (l - w) / 2, Y = y + (h - hh) / 2;
    return { ref: f.ref, x: X, y: Y, largeur: w, hauteur: hh, echelle: k,
      ops: "q " + [k, 0, 0, k, X, Y].map(n5).join(" ") + " cm 0 0 " + nb(f.largeur) + " " + nb(f.hauteur) + " re W n "
        + f.inv.map(n5).join(" ") + " cm /" + nom + " Do Q" };
  }
}

/* « feuilles » : [{ largeur, hauteur, bordure?, poses: [{ page, x, y, largeur, hauteur }] }],
   en points, origine en bas à gauche de la feuille. */
export async function imposer(doc, feuilles, { agrandir = true } = {}) {
  const e = new Ecrivain();
  const parent = e.reserver();
  const poseur = new Poseur(doc, e);
  const refs = [];
  for (const f of feuilles) {
    const lignes = [], formes = new Dict();
    for (const [k, pose] of (f.poses || []).entries()) {
      const r = await poseur.poser(pose.page, "P" + k, pose.x, pose.y, pose.largeur, pose.hauteur, { agrandir });
      lignes.push(r.ops);
      formes.set("P" + k, r.ref);
      if (f.bordure) lignes.push("q 0.5 w 0.55 G " + [r.x, r.y, r.largeur, r.hauteur].map(nb).join(" ") + " re S Q");
    }
    const contenu = e.ajouter(new Flux(new Dict(), enc.encode(lignes.join("\n") + "\n")));
    refs.push(e.ajouter(new Dict({ Type: N("Page"), Parent: parent, MediaBox: [0, 0, r2(f.largeur), r2(f.hauteur)], Contents: contenu,
      Resources: new Dict({ XObject: formes }) })));
  }
  return finir(e, refs, parent, { info: await infoDe(doc) });
}

/* ── plusieurs pages par feuille ── */
const GRILLES = { 2: [2, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2], 9: [3, 3], 16: [4, 4] };
export async function plusieursParFeuille(doc, { parFeuille = 4, format = "A4", marge = 18, espace = 8, bordure = false, selection = null } = {}) {
  const pages = await doc.pages();
  const indices = selection || pages.map((_, i) => i);
  if (!indices.length) throw new Error("aucune page à poser");
  const [g0, g1] = GRILLES[parFeuille] || GRILLES[4];
  const t = await doc.taillePage(pages[indices[0]]);
  const [a, b] = FORMATS[format] || FORMATS.A4;
  /* Debout ou couchée : la feuille qui laisse les pages les plus grandes. La
     grille tourne avec elle (deux pages : côte à côte sur une feuille couchée,
     l'une sous l'autre sur une feuille debout). */
  const essai = (L, H, cols, rangs) => Math.min((L - 2 * marge - (cols - 1) * espace) / cols / t.largeur, (H - 2 * marge - (rangs - 1) * espace) / rangs / t.hauteur);
  const debout = [Math.min(a, b), Math.max(a, b), Math.min(g0, g1), Math.max(g0, g1)];
  const couchee = [Math.max(a, b), Math.min(a, b), Math.max(g0, g1), Math.min(g0, g1)];
  const [L, H, cols, rangs] = essai(...couchee) > essai(...debout) ? couchee : debout;
  const cl = (L - 2 * marge - (cols - 1) * espace) / cols, ch = (H - 2 * marge - (rangs - 1) * espace) / rangs;
  if (cl < 20 || ch < 20) throw new Error("les marges ne laissent plus de place aux pages");
  const feuilles = [];
  for (let i = 0; i < indices.length; i += cols * rangs) {
    const poses = indices.slice(i, i + cols * rangs).map((page, k) => {
      const col = k % cols, rang = Math.floor(k / cols);
      return { page, x: marge + col * (cl + espace), y: H - marge - (rang + 1) * ch - rang * espace, largeur: cl, hauteur: ch };
    });
    feuilles.push({ largeur: L, hauteur: H, poses, bordure });
  }
  return imposer(doc, feuilles);
}

/* ── le livret ──
   Des feuilles couchées, deux pages par face, dans l'ordre qui donne un
   cahier une fois les feuilles empilées et pliées en deux : la face 1 porte
   la dernière page à gauche et la première à droite, son dos la 2 et
   l'avant-dernière, et ainsi de suite vers le milieu. Le nombre de pages est
   complété à un multiple de quatre par des pages blanches, à la fin. */
export async function livret(doc, { format = "A4", marge = 0, selection = null } = {}) {
  const pages = await doc.pages();
  const src = selection || pages.map((_, i) => i);
  if (!src.length) throw new Error("aucune page à mettre en livret");
  const n = Math.ceil(src.length / 4) * 4;
  const [a, b] = FORMATS[format] || FORMATS.A4;
  const L = Math.max(a, b), H = Math.min(a, b), demi = L / 2;
  const pose = (rang, cote) => (rang < src.length
    ? [{ page: src[rang], x: cote * demi + marge, y: marge, largeur: demi - 2 * marge, hauteur: H - 2 * marge }] : []);
  const feuilles = [];
  for (let k = 0; k < n / 4; k++) {
    feuilles.push({ largeur: L, hauteur: H, poses: [...pose(n - 1 - 2 * k, 0), ...pose(2 * k, 1)] });
    feuilles.push({ largeur: L, hauteur: H, poses: [...pose(2 * k + 1, 0), ...pose(n - 2 - 2 * k, 1)] });
  }
  return imposer(doc, feuilles);
}
/* L'ordre des pages d'un livret, pour le dire et pour le vérifier : [[gauche, droite], …],
   en numéros de page (1…n), 0 pour une page blanche. */
export function ordreLivret(nbPages) {
  const n = Math.ceil(nbPages / 4) * 4, out = [];
  const num = (r) => (r < nbPages ? r + 1 : 0);
  for (let k = 0; k < n / 4; k++) { out.push([num(n - 1 - 2 * k), num(2 * k)]); out.push([num(2 * k + 1), num(n - 2 - 2 * k)]); }
  return out;
}

/* ── changer le format des pages ── */
export async function changerFormat(doc, { format = "A4", largeur = null, hauteur = null, orientation = "auto", marge = 0, agrandir = true, selection = null } = {}) {
  const pages = await doc.pages();
  const [a, b] = largeur && hauteur ? [largeur, hauteur] : (FORMATS[format] || FORMATS.A4);
  const feuilles = [];
  for (const i of selection || pages.map((_, k) => k)) {
    const t = await doc.taillePage(pages[i]);
    const couchee = orientation === "paysage" || (orientation === "auto" && t.largeur > t.hauteur);
    const L = couchee ? Math.max(a, b) : Math.min(a, b), H = couchee ? Math.min(a, b) : Math.max(a, b);
    if (L - 2 * marge < 20 || H - 2 * marge < 20) throw new Error("les marges mangent toute la feuille");
    feuilles.push({ largeur: L, hauteur: H, poses: [{ page: i, x: marge, y: marge, largeur: L - 2 * marge, hauteur: H - 2 * marge }] });
  }
  return imposer(doc, feuilles, { agrandir });
}

/* ── toutes les pages sur une seule, l'une sous l'autre ── */
const COTE_MAX = 14400;       // 200 pouces : au-delà, des lecteurs refusent la page
export async function grandePage(doc, { espace = 0, selection = null } = {}) {
  const pages = await doc.pages();
  const indices = selection || pages.map((_, i) => i);
  if (!indices.length) throw new Error("aucune page à réunir");
  const tailles = [];
  for (const i of indices) tailles.push(await doc.taillePage(pages[i]));
  const L = Math.max(...tailles.map((t) => t.largeur));
  const H = tailles.reduce((s, t) => s + t.hauteur, 0) + espace * (indices.length - 1);
  const k = Math.min(1, COTE_MAX / Math.max(L, H));
  let y = H * k;
  const poses = indices.map((page, n) => {
    const t = tailles[n];
    y -= t.hauteur * k;
    const pose = { page, x: ((L - t.largeur) / 2) * k, y, largeur: t.largeur * k, hauteur: t.hauteur * k };
    y -= espace * k;
    return pose;
  });
  return { octets: await imposer(doc, [{ largeur: L * k, hauteur: H * k, poses }]), reduite: k < 1, largeur: L * k, hauteur: H * k };
}

/* ── couper chaque page en deux ──
   Un livre scanné à plat : deux pages par image. Chaque page est gardée DEUX
   fois, et chaque copie ne montre que sa moitié (son /CropBox). Rien n'est
   redessiné : le texte reste du texte, les liens restent des liens. */
export async function couperEnDeux(doc, { sens = "vertical", ordre = "normal", selection = null } = {}) {
  const pages = await doc.pages();
  const touchees = new Set(selection || pages.map((_, i) => i));
  const indices = [];
  pages.forEach((_, i) => { indices.push(i); if (touchees.has(i)) indices.push(i); });
  const vues = new Map();
  return reecrire(doc, {
    selection: indices, garderStructure: false,
    modifier: async (d, i, p) => {
      if (!touchees.has(i)) return;
      const rang = vues.get(i) || 0;
      vues.set(i, rang + 1);
      const t = await doc.taillePage(p);
      const mv = matriceVisible(d.get("CropBox") || d.get("MediaBox"), t.rotation);
      // la moitié voulue, dans la page telle qu'on la voit (origine en bas à gauche)
      const premiere = (rang === 0) !== (ordre === "inverse");
      const r = sens === "vertical"
        ? (premiere ? [0, 0, mv.largeur / 2, mv.hauteur] : [mv.largeur / 2, 0, mv.largeur, mv.hauteur])
        : (premiere ? [0, mv.hauteur / 2, mv.largeur, mv.hauteur] : [0, 0, mv.largeur, mv.hauteur / 2]);
      const pt = (u, v) => [mv.m[0] * u + mv.m[2] * v + mv.m[4], mv.m[1] * u + mv.m[3] * v + mv.m[5]];
      const a = pt(r[0], r[1]), b = pt(r[2], r[3]);
      d.set("CropBox", [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])].map(r2));
    },
  });
}

/* ── superposer deux PDF ──
   Les pages du « calque » sont dessinées sur celles du document (un tampon,
   une grille de correction) ou dessous (un papier à en-tête). Le document
   garde tout : ses liens, ses signets, son texte. */
export async function superposer(doc, calque, { dessous = false, repeter = true, selection = null } = {}) {
  const nCalque = (await calque.pages()).length;
  if (!nCalque) throw new Error("le calque n'a aucune page");
  let poseur = null;
  return tamponnerPages(doc, async ({ index, largeur, hauteur, ecrivain }) => {
    const j = repeter ? index % nCalque : index;
    if (j >= nCalque) return null;
    if (!poseur) poseur = new Poseur(calque, ecrivain);
    const r = await poseur.poser(j, "CielCalque", 0, 0, largeur, hauteur);
    return { ops: [r.ops], ressources: { XObject: { CielCalque: r.ref } }, dessous };
  }, { selection });
}

/* ── le document recopié en entier, pour le retoucher ── */
async function copieEntiere(doc, surPage = null) {
  const pages = await doc.pages();
  const e = new Ecrivain();
  const parent = e.reserver();
  const c = new Copieur(doc, e, new Set(pages.map((p) => p.ref && p.ref.num).filter((x) => x != null)));
  const refs = [];
  for (const [i, p] of pages.entries()) refs.push(await copierPage(c, p, parent, surPage ? (d) => surPage(d, i) : null));
  const src = await doc.catalogue();
  const cat = new Dict();
  for (const k of CLES_CATALOGUE) if (src && src.has(k)) cat.set(k, await c.valeur(src.get(k)));
  return { e, parent, refs, cat, c, info: await infoDe(doc), direct: (v) => (v instanceof Ref ? e.obtenir(v) : v) };
}

/* Retirer du fichier ce qui n'est plus relié à rien.

   Couper le lien vers un objet ne l'efface pas : l'écrivain écrit TOUS les
   objets qu'il a reçus. Le premier banc du nettoyage l'a montré : le script
   n'était plus appelé, la pièce jointe n'était plus listée, et tous deux
   étaient encore dans le fichier, à la portée de qui l'ouvre dans un éditeur
   de texte. On suit donc le graphe depuis le catalogue, les pages et la
   fiche, et tout objet qu'on n'a pas atteint est remplacé par « null ». */
function purger(e, racines) {
  const atteints = new Set(), vus = new Set();
  const suivre = (v) => {
    if (v instanceof Ref) { if (atteints.has(v.num)) return; atteints.add(v.num); suivre(e.objets[v.num]); return; }
    if (v instanceof Flux) v = v.dict;
    if (Array.isArray(v)) { for (const x of v) suivre(x); return; }
    if (!(v instanceof Dict) || vus.has(v)) return;
    vus.add(v);
    for (const x of v.values()) suivre(x);
  };
  for (const r of racines) suivre(r);
  let retires = 0;
  for (let i = 1; i < e.objets.length; i++) if (!atteints.has(i) && e.objets[i] != null) { e.objets[i] = null; retires++; }
  return retires;
}
const terminer = (b, info) => { purger(b.e, [b.cat, b.parent, ...b.refs, info]); return finir(b.e, b.refs, b.parent, { catalogue: b.cat, info }); };

/* ── nettoyer ──
   Ce qu'un PDF peut porter et qu'on ne voit pas en le lisant : des scripts,
   des actions qui lancent un programme ou envoient un formulaire, des
   fichiers joints, des liens, des commentaires, sa fiche d'identité. Chaque
   option retire une famille, et le bilan dit combien il y en avait : zéro
   veut dire « il n'y en avait pas », pas « je n'ai pas regardé ». */
const ACTIONS_VIVES = new Set(["JavaScript", "Launch", "ImportData", "SubmitForm", "Rendition", "Movie", "Sound", "GoToE"]);
export async function nettoyer(doc, { scripts = true, pieces = true, liens = false, annotations = false, formulaires = false, signets = false, metadonnees = false } = {}) {
  const bilan = { scripts: 0, pieces: 0, liens: 0, annotations: 0, formulaires: 0, signets: 0, metadonnees: 0 };
  const b = await copieEntiere(doc, (d) => { if (metadonnees) { d.delete("Metadata"); d.delete("PieceInfo"); } });
  const { e, cat, direct } = b;
  if (signets && cat.has("Outlines")) { bilan.signets = (await lireSignets(doc)).length || 1; cat.delete("Outlines"); }
  if (formulaires && cat.has("AcroForm")) cat.delete("AcroForm");
  const noms = direct(cat.get("Names"));
  if (noms instanceof Dict) {
    if (scripts && noms.has("JavaScript")) { noms.delete("JavaScript"); bilan.scripts++; }
    if (pieces && noms.has("EmbeddedFiles")) noms.delete("EmbeddedFiles");
  }
  if (pieces) bilan.pieces = (await listerPieces(doc)).length;
  // les annotations, page par page
  for (const r of b.refs) {
    const page = e.obtenir(r);
    const annots = direct(page.get("Annots"));
    if (!Array.isArray(annots)) continue;
    const gardees = annots.filter((a) => {
      const d = direct(a);
      if (!(d instanceof Dict)) return false;
      const sorte = nomDe(d.get("Subtype"));
      if (sorte === "Link") { if (liens) { bilan.liens++; return false; } return true; }
      if (sorte === "Widget") { if (formulaires) { bilan.formulaires++; return false; } return true; }
      if (sorte === "FileAttachment") return !pieces;
      if (annotations) { if (sorte !== "Popup") bilan.annotations++; return false; }
      return true;
    });
    if (gardees.length) page.set("Annots", gardees); else page.delete("Annots");
  }
  // les scripts et les fichiers, où qu'ils soient accrochés
  const vus = new Set(), neutralisees = new Set();
  const visiter = (v) => {
    if (v instanceof Flux) v = v.dict;
    if (Array.isArray(v)) { for (const x of v) visiter(x); return; }
    if (!(v instanceof Dict) || vus.has(v)) return;
    vus.add(v);
    if (scripts) {
      if (v.has("AA")) { v.delete("AA"); bilan.scripts++; }
      const vive = (x) => { const a = direct(x); return a instanceof Dict && ACTIONS_VIVES.has(nomDe(a.get("S"))) ? a : null; };
      for (const k of ["A", "OpenAction", "Next"]) {
        const brut = v.get(k), liste = direct(brut);
        if (Array.isArray(liste) && k === "Next") {
          const gardees = liste.filter((x) => { const a = vive(x); if (a) neutralisees.add(a); return !a; });
          if (gardees.length !== liste.length) { if (gardees.length) v.set(k, gardees); else v.delete(k); }
        } else if (vive(brut)) { neutralisees.add(vive(brut)); v.delete(k); }
      }
      if (ACTIONS_VIVES.has(nomDe(v.get("S")))) { neutralisees.add(v); v.clear(); return; }
      if (v.has("JS")) { v.delete("JS"); bilan.scripts++; }
    }
    if (pieces && v.has("EF")) v.delete("EF");
    for (const x of [...v.values()]) visiter(x);
  };
  for (let i = 1; i < e.objets.length; i++) visiter(e.objets[i]);
  bilan.scripts += neutralisees.size;
  let info = b.info;
  if (metadonnees) { bilan.metadonnees = info.size; info = new Dict(); }
  return { octets: await terminer(b, info), bilan };
}

/* ── les signets (la table des matières du volet de gauche) ── */
async function feuillesArbre(doc, noeud, sur, profondeur = 0, vus = new Set()) {
  if (noeud instanceof Ref) { if (vus.has(noeud.num)) return; vus.add(noeud.num); }
  const n = await doc.resoudre(noeud);
  if (!(n instanceof Dict) || profondeur > 16) return;
  const noms = await doc.resoudre(n.get("Names"));
  if (Array.isArray(noms)) {
    for (let i = 0; i + 1 < noms.length; i += 2) {
      const cle = await doc.resoudre(noms[i]);
      await sur(cle instanceof Chaine ? cle.texte() : String(cle), noms[i + 1]);
    }
  }
  const kids = await doc.resoudre(n.get("Kids"));
  if (Array.isArray(kids)) for (const k of kids) await feuillesArbre(doc, k, sur, profondeur + 1, vus);
}
async function destinationNommee(doc, cle) {
  const cat = await doc.catalogue();
  const dests = await doc.resoudre(cat && cat.get("Dests"));
  if (dests instanceof Dict && dests.has(cle)) return doc.resoudre(dests.get(cle));
  const noms = await doc.resoudre(cat && cat.get("Names"));
  let trouve;
  if (noms instanceof Dict) await feuillesArbre(doc, noms.get("Dests"), async (k, v) => { if (trouve === undefined && k === cle) trouve = await doc.resoudre(v); });
  return trouve;
}
async function pageDeDestination(doc, dest, indexParNum) {
  dest = await doc.resoudre(dest);
  if (dest instanceof Nom || dest instanceof Chaine) dest = await destinationNommee(doc, dest instanceof Nom ? dest.nom : dest.texte());
  if (dest instanceof Dict) dest = await doc.resoudre(dest.get("D"));
  if (!Array.isArray(dest) || !dest.length) return null;
  const cible = dest[0];
  if (cible instanceof Ref) return indexParNum.has(cible.num) ? indexParNum.get(cible.num) : null;
  return typeof cible === "number" ? cible : null;
}
/* [{ titre, niveau (1…), page (indice, ou null si le signet ne mène nulle part) }] */
export async function lireSignets(doc) {
  const cat = await doc.catalogue();
  const racine = await doc.resoudre(cat && cat.get("Outlines"));
  const out = [];
  if (!(racine instanceof Dict)) return out;
  const indexParNum = new Map();
  (await doc.pages()).forEach((p, i) => { if (p.ref) indexParNum.set(p.ref.num, i); });
  const vus = new Set();
  const marcher = async (ref, niveau) => {
    while (ref instanceof Ref && !vus.has(ref.num) && out.length < 5000) {
      vus.add(ref.num);
      const it = await doc.obtenir(ref.num);
      if (!(it instanceof Dict)) break;
      const t = await doc.resoudre(it.get("Title"));
      let dest = it.get("Dest");
      if (dest === undefined) {
        const a = await doc.resoudre(it.get("A"));
        if (a instanceof Dict && nomDe(a.get("S")) === "GoTo") dest = a.get("D");
      }
      out.push({ titre: t instanceof Chaine ? t.texte() : "", niveau, page: dest === undefined ? null : await pageDeDestination(doc, dest, indexParNum) });
      if (niveau < 12) await marcher(it.get("First"), niveau + 1);
      ref = it.get("Next");
    }
  };
  await marcher(racine.get("First"), 1);
  return out;
}
/* Remplacer les signets par « liste » ([{ titre, page, niveau }]) ; une liste vide les retire. */
export async function poserSignets(doc, liste) {
  const b = await copieEntiere(doc);
  const { e, cat } = b;
  cat.delete("Outlines");
  const valides = (liste || []).filter((s) => s && String(s.titre || "").trim() && Number.isInteger(s.page) && s.page >= 0 && s.page < b.refs.length);
  if (valides.length) {
    const racine = e.reserver();
    const noeuds = valides.map((s) => ({ titre: String(s.titre).trim(), page: s.page, niveau: s.niveau || 1, ref: e.reserver(), enfants: [] }));
    // un signet de niveau n est l'enfant du dernier signet de niveau n − 1
    const pile = [], tete = [];
    for (const n of noeuds) {
      const niveau = Math.max(1, Math.min(n.niveau, pile.length + 1));
      pile.length = niveau - 1;
      (pile.length ? pile[pile.length - 1].enfants : tete).push(n);
      pile.push(n);
    }
    const compter = (n) => n.enfants.reduce((s, x) => s + 1 + compter(x), 0);
    const ecrireFreres = (freres, parentRef) => freres.forEach((n, i) => {
      const d = new Dict({ Title: Chaine.depuisTexte(n.titre), Parent: parentRef, Dest: [b.refs[n.page], N("Fit")] });
      if (i > 0) d.set("Prev", freres[i - 1].ref);
      if (i < freres.length - 1) d.set("Next", freres[i + 1].ref);
      if (n.enfants.length) {
        d.set("First", n.enfants[0].ref); d.set("Last", n.enfants[n.enfants.length - 1].ref); d.set("Count", compter(n));
        ecrireFreres(n.enfants, n.ref);
      }
      e.poser(n.ref, d);
    });
    ecrireFreres(tete, racine);
    e.poser(racine, new Dict({ Type: N("Outlines"), First: tete[0].ref, Last: tete[tete.length - 1].ref, Count: noeuds.length }));
    cat.set("Outlines", racine);
    cat.set("PageMode", N("UseOutlines"));
  } else if (nomDe(cat.get("PageMode")) === "UseOutlines") cat.delete("PageMode");
  return terminer(b, b.info);
}
/* « Introduction ; 1 », « - Contexte ; 2 » : une ligne par signet, des tirets pour descendre d'un niveau. */
export function lireListeSignets(texte, nbPages) {
  const out = [];
  for (const [n, brut] of String(texte).split(/\r?\n/).entries()) {
    if (!brut.trim()) continue;
    const m = /^(\s*(?:[-*>]\s*)*)(.*?)\s*[;|\t]\s*(\d+)\s*$/.exec(brut);
    if (!m) throw new Error("ligne " + (n + 1) + " : il manque le numéro de page (exemple : « Introduction ; 1 »)");
    const page = +m[3];
    if (page < 1 || page > nbPages) throw new Error("ligne " + (n + 1) + " : la page " + page + " n'existe pas (" + nbPages + " pages)");
    out.push({ titre: m[2].trim(), page: page - 1, niveau: 1 + (m[1].match(/[-*>]/g) || []).length });
  }
  return out;
}

/* ── les pièces jointes ── */
const nomPropre = (s) => String(s || "").replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f]/g, "").trim() || "piece-jointe";
export async function listerPieces(doc) {
  const out = [], vus = new Set();
  const lire = async (spec, cle) => {
    if (spec instanceof Ref) { if (vus.has(spec.num)) return; vus.add(spec.num); }
    const s = await doc.resoudre(spec);
    if (!(s instanceof Dict)) return;
    const ef = await doc.resoudre(s.get("EF"));
    if (!(ef instanceof Dict)) return;
    const f = await doc.resoudre(ef.get("UF") !== undefined ? ef.get("UF") : ef.get("F"));
    if (!(f instanceof Flux)) return;
    let octets;
    try { octets = await doc.decode(f); } catch (err) { return; }
    const texteDe = async (k) => { const v = await doc.resoudre(s.get(k)); return v instanceof Chaine ? v.texte() : ""; };
    out.push({ nom: nomPropre((await texteDe("UF")) || (await texteDe("F")) || cle), octets, description: await texteDe("Desc") });
  };
  const cat = await doc.catalogue();
  const noms = await doc.resoudre(cat && cat.get("Names"));
  if (noms instanceof Dict) await feuillesArbre(doc, noms.get("EmbeddedFiles"), (k, v) => lire(v, k));
  for (const p of await doc.pages()) {
    const annots = await doc.resoudre(p.dict.get("Annots"));
    if (!Array.isArray(annots)) continue;
    for (const a of annots) {
      const d = await doc.resoudre(a);
      if (d instanceof Dict && nomDe(d.get("Subtype")) === "FileAttachment") await lire(d.get("FS"), null);
    }
  }
  return out;
}
/* « pieces » : [{ nom, octets, description? }]. Celles que le PDF portait déjà restent. */
export async function ajouterPieces(doc, pieces) {
  const b = await copieEntiere(doc);
  const { e, cat, direct } = b;
  let noms = direct(cat.get("Names"));
  if (!(noms instanceof Dict)) { noms = new Dict(); cat.set("Names", noms); }
  const entrees = [];
  const relire = (n, profondeur) => {
    n = direct(n);
    if (!(n instanceof Dict) || profondeur > 16) return;
    const liste = direct(n.get("Names"));
    if (Array.isArray(liste)) for (let i = 0; i + 1 < liste.length; i += 2) { const k = direct(liste[i]); entrees.push([k instanceof Chaine ? k.texte() : String(k), liste[i + 1]]); }
    const kids = direct(n.get("Kids"));
    if (Array.isArray(kids)) for (const k of kids) relire(k, profondeur + 1);
  };
  relire(noms.get("EmbeddedFiles"), 0);
  const pris = new Set(entrees.map((x) => x[0]));
  for (const p of pieces) {
    let nom = nomPropre(p.nom);
    for (let k = 2; pris.has(nom); k++) nom = nomPropre(p.nom).replace(/(\.[^.]*)?$/, "-" + k + "$1");
    pris.add(nom);
    const flux = e.ajouter(new Flux(new Dict({ Type: N("EmbeddedFile"), Params: new Dict({ Size: p.octets.length, ModDate: Chaine.depuisTexte(datePdf()) }) }), p.octets));
    const spec = new Dict({ Type: N("Filespec"), F: Chaine.depuisTexte(nom.replace(/[^\x20-\x7e]/g, "_")), UF: Chaine.depuisTexte(nom), EF: new Dict({ F: flux, UF: flux }) });
    if (p.description) spec.set("Desc", Chaine.depuisTexte(p.description));
    entrees.push([nom, e.ajouter(spec)]);
  }
  entrees.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  noms.set("EmbeddedFiles", new Dict({ Names: entrees.flatMap(([k, v]) => [Chaine.depuisTexte(k), v]) }));
  cat.set("PageMode", N("UseAttachments"));
  return terminer(b, b.info);
}

/* ── un texte devient un PDF ──
   Helvetica pour le texte, Helvetica-Bold pour les titres, Courier pour le
   code : trois polices que tout lecteur connaît, rien à embarquer. Le
   Markdown est lu dans ce qu'il a de courant (titres « # », listes, blocs de
   code, filet « --- ») ; le gras et l'italique en ligne sont écrits sans
   leurs astérisques. Ce qui n'existe pas en WinAnsi (un émoji, du chinois)
   devient « ? » : mieux vaut le savoir que le découvrir à l'impression. */
const chaine = (s) => ecrireChaine(new Chaine(versWinAnsi(s)));
const sansMarques = (s) => s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
  .replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/(^|[\s(])[*_]([^*_\s][^*_]*)[*_](?=[\s).,;:!?]|$)/g, "$1$2").replace(/`([^`]+)`/g, "$1");
export async function textePdf(texte, { format = "A4", marge = 56, corps = 11, markdown = true, titre = null } = {}) {
  const [L, H] = FORMATS[format] || FORMATS.A4;
  const utile = L - 2 * marge;
  if (utile < 80) throw new Error("les marges ne laissent plus de place au texte");
  const pagesOps = [[]];
  let y = H - marge;
  const saut = () => { pagesOps.push([]); y = H - marge; };
  const ligne = (s, x, police, taille, interligne) => {
    if (y - taille < marge) saut();
    y -= interligne;
    if (s) pagesOps[pagesOps.length - 1].push("BT /" + police + " " + nb(taille) + " Tf 1 0 0 1 " + nb(x) + " " + nb(y) + " Tm " + chaine(s) + " Tj ET");
  };
  const largeur = (s, police, taille) => (police === "F3" ? s.length * taille * 0.6 : largeurTexte(s, taille) * (police === "F2" ? 1.07 : 1));
  // couper à la largeur, mot par mot ; un mot plus long que la ligne est coupé à la lettre
  const couper = (s, police, taille, dispo) => {
    const out = [];
    let cur = "";
    for (let mot of s.split(/\s+/).filter(Boolean)) {
      while (largeur(mot, police, taille) > dispo && mot.length > 1) {
        let n = mot.length - 1;
        while (n > 1 && largeur((cur ? cur + " " : "") + mot.slice(0, n), police, taille) > dispo) n--;
        if (cur && largeur(cur + " " + mot.slice(0, n), police, taille) > dispo) { out.push(cur); cur = ""; continue; }
        out.push((cur ? cur + " " : "") + mot.slice(0, n));
        cur = ""; mot = mot.slice(n);
      }
      const essai = cur ? cur + " " + mot : mot;
      if (cur && largeur(essai, police, taille) > dispo) { out.push(cur); cur = mot; } else cur = essai;
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  };
  const bloc = (s, police, taille, { retrait = 0, puce = null, avant = 0, apres = 0 } = {}) => {
    y -= avant;
    const lignes = couper(s, police, taille, utile - retrait);
    lignes.forEach((l, i) => {
      const debutPage = y - taille < marge;
      ligne(l, marge + retrait, police, taille, taille * 1.38);
      if (puce && i === 0) pagesOps[pagesOps.length - 1].push("BT /F1 " + nb(taille) + " Tf 1 0 0 1 " + nb(marge + retrait - 14) + " " + nb(y) + " Tm " + chaine(puce) + " Tj ET");
      void debutPage;
    });
    y -= apres;
  };
  const lignes = String(texte).replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  let dansCode = false, para = [];
  const viderPara = () => { if (para.length) { bloc(sansMarques(para.join(" ")), "F1", corps, { apres: corps * 0.55 }); para = []; } };
  for (const brut of lignes) {
    if (!markdown) { if (brut.trim()) bloc(brut, "F1", corps); else y -= corps * 0.9; continue; }
    if (/^\s*(```|~~~)/.test(brut)) { viderPara(); dansCode = !dansCode; y -= corps * 0.3; continue; }
    if (dansCode) {
      const taille = corps * 0.9, max = Math.max(10, Math.floor(utile / (taille * 0.6)));
      const l = brut.replace(/\s+$/, "");
      for (let i = 0; i < Math.max(1, l.length); i += max) ligne(l.slice(i, i + max), marge, "F3", taille, taille * 1.3);
      continue;
    }
    const t = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(brut);
    if (t) { viderPara(); const n = t[1].length, taille = [0, corps * 2, corps * 1.55, corps * 1.25][n] || corps * 1.1; bloc(sansMarques(t[2]), "F2", taille, { avant: taille * 0.5, apres: taille * 0.25 }); continue; }
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(brut)) {
      viderPara();
      if (y - 14 < marge) saut();
      y -= 8;
      pagesOps[pagesOps.length - 1].push("q 0.6 w 0.6 G " + nb(marge) + " " + nb(y) + " m " + nb(L - marge) + " " + nb(y) + " l S Q");
      y -= 8;
      continue;
    }
    const p = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(brut);
    if (p) { viderPara(); bloc(sansMarques(p[3]), "F1", corps, { retrait: 18 + Math.min(3, Math.floor(p[1].length / 2)) * 16, puce: /\d/.test(p[2]) ? p[2] : "•" }); continue; }
    if (!brut.trim()) { viderPara(); continue; }
    para.push(brut.trim());
  }
  viderPara();
  const e = new Ecrivain();
  const parent = e.reserver();
  const police = (base) => e.ajouter(new Dict({ Type: N("Font"), Subtype: N("Type1"), BaseFont: N(base), Encoding: N("WinAnsiEncoding") }));
  const polices = new Dict({ F1: police("Helvetica"), F2: police("Helvetica-Bold"), F3: police("Courier") });
  const refs = pagesOps.map((ops) => e.ajouter(new Dict({ Type: N("Page"), Parent: parent, MediaBox: [0, 0, r2(L), r2(H)],
    Contents: e.ajouter(new Flux(new Dict(), enc.encode(ops.join("\n") + "\n"))), Resources: new Dict({ Font: polices }) })));
  const info = new Dict();
  if (titre) info.set("Title", Chaine.depuisTexte(titre));
  return finir(e, refs, parent, { info });
}

/* ── des images de pages → un PDF aux mêmes dimensions ──
   « pagesImage » : [{ image: { type: "jpeg", octets } | { largeur, hauteur, pixels }, largeur, hauteur }],
   la taille de la page en points. C'est ce que produisent les outils qui
   REDESSINENT une page (aplatir, caviarder, inverser) : après eux, la page
   n'est plus qu'une image, et ce qui était dessous n'existe plus. */
export async function pdfDepuisImages(pagesImage, { info = null } = {}) {
  const e = new Ecrivain();
  const parent = e.reserver();
  const refs = [];
  for (const p of pagesImage) {
    const o = await objetImage(e, p.image);
    const contenu = e.ajouter(new Flux(new Dict(), enc.encode("q " + nb(p.largeur) + " 0 0 " + nb(p.hauteur) + " 0 0 cm /Im0 Do Q\n")));
    refs.push(e.ajouter(new Dict({ Type: N("Page"), Parent: parent, MediaBox: [0, 0, r2(p.largeur), r2(p.hauteur)], Contents: contenu,
      Resources: new Dict({ XObject: new Dict({ Im0: o.ref }) }) })));
  }
  return finir(e, refs, parent, { info: info || new Dict() });
}
