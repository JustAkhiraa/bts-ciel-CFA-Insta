/* Le texte d'une page PDF, AVEC SA PLACE (ISO 32000, § 9).

   Pour refaire un document modifiable à partir d'un PDF, il faut savoir où
   est chaque lettre, dans quelle police, à quelle taille, de quelle
   couleur : c'est exactement ce que calcule le rendu (rendu.js) pour
   dessiner. On fait donc tourner le MÊME moteur sur un canevas fantôme,
   qui ne peint rien et suit seulement les transformations ; à la place
   des lettres dessinées, on les RELÈVE. On relève aussi les images (là où
   elles sont posées), les traits droits (bordures de tableaux,
   soulignements), les aplats (cases colorées) et les liens.

   Le repère du relevé est celui de la page telle qu'on la voit : origine
   en haut à gauche, y vers le bas, en points (1/72 de pouce), rotation
   /Rotate comprise. Une lettre est repérée par son point d'origine, sur la
   ligne de base. */

import { Dict, Nom, Chaine } from "./objets.js";
import { Peintre, cachesDe, contenuPage } from "./rendu.js";

const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const LIMITE_TRAITS = 20000;

/* Ce qu'il faut d'une DOMMatrix au moteur (node n'en a pas). */
class Matrice {
  constructor(a, b, c, d, e, f) { Object.assign(this, { a, b, c, d, e, f }); }
  get is2D() { return true; }
  multiply(o) { const m = mul([o.a, o.b, o.c, o.d, o.e, o.f], [this.a, this.b, this.c, this.d, this.e, this.f]); return new Matrice(...m); }
  inverse() {
    const { a, b, c, d, e, f } = this, k = a * d - b * c || 1e-12;
    return new Matrice(d / k, -b / k, -c / k, a / k, (c * f - d * e) / k, (b * e - a * f) / k);
  }
  transformPoint({ x, y }) { return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f }; }
}

/* Le canevas fantôme : il suit la matrice courante et les chemins, et ne
   dessine rien. Les points des chemins sont gardés dans le repère de la page. */
class Fantome {
  constructor(l, h) {
    this.m = [1, 0, 0, 1, 0, 0];
    this.pile = [];
    this.chemin = [];
    this.canvas = { width: l, height: h };
    this.font = "";
  }
  save() { this.pile.push(this.m); }
  restore() { if (this.pile.length) this.m = this.pile.pop(); }
  transform(a, b, c, d, e, f) { this.m = mul([a, b, c, d, e, f], this.m); }
  setTransform(a, b, c, d, e, f) {
    if (a && typeof a === "object") this.m = [a.a, a.b, a.c, a.d, a.e, a.f];
    else this.m = [a, b, c, d, e, f];
  }
  getTransform() { return new Matrice(...this.m); }
  scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
  point(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  beginPath() { this.chemin = []; }
  moveTo(x, y) { this.chemin.push(["M", ...this.point(x, y)]); }
  lineTo(x, y) { this.chemin.push(["L", ...this.point(x, y)]); }
  bezierCurveTo(a, b, c, d, x, y) { this.chemin.push(["C", ...this.point(x, y)]); }
  quadraticCurveTo(a, b, x, y) { this.chemin.push(["C", ...this.point(x, y)]); }
  closePath() { this.chemin.push(["Z"]); }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  clip() {} fill() {} stroke() {} fillRect() {} clearRect() {} drawImage() {} fillText() {} strokeText() {} setLineDash() {}
  measureText() { return { width: 0 }; }
}

/* « rgb(12,34,56) » → « 0c2238 » ; le noir et le presque noir → null (la couleur par défaut). */
function hexDe(css) {
  const m = /rgba?\((\d+),(\d+),(\d+)/.exec(css || "");
  if (!m) return null;
  const [r, g, b] = [+m[1], +m[2], +m[3]];
  if (r < 48 && g < 48 && b < 48) return null;
  return [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
const blanc = (css) => /rgba?\((2[4-5]\d),(2[4-5]\d),(2[4-5]\d)/.test(css || "");

/* Une police composite sans /ToUnicode : on retrouve la lettre par la cmap
   Unicode de la police embarquée, lue à l'envers (glyphe → caractère). */
const PLAGES = [[0x20, 0x7e], [0xa0, 0x24f], [0x370, 0x3ff], [0x400, 0x4ff], [0x2000, 0x206f], [0x20a0, 0x20cf], [0x2100, 0x218f], [0x2190, 0x23ff], [0x2460, 0x27bf], [0xfb00, 0xfb06]];
function secours(p) {
  if (p.secours !== undefined) return p.secours;
  p.secours = null;
  const tt = p.tt;
  const table = tt && (tt.cmap(3, 1) || tt.cmap(0, 3) || tt.cmap(0, 4));
  if (table && p.gid) {
    const inverse = new Map();
    for (const [a, b] of PLAGES) for (let cp = a; cp <= b; cp++) {
      const g = tt.dansCmap(table, cp);
      if (g > 0 && !inverse.has(g)) inverse.set(g, String.fromCodePoint(cp));
    }
    p.secours = (code) => inverse.get(p.gid(code)) || "";
  }
  return p.secours;
}

/* Le moteur du rendu, qui relève au lieu de peindre. */
class Releveur extends Peintre {
  constructor(doc, ctx, caches, sortie) { super(doc, ctx, caches); this.s = sortie; }

  async montrer(elements, res) {
    const g = this.g;
    const p = g.police || (g.police = await this.policeDe(null));
    if (!Array.isArray(elements)) return;
    const T0 = this.ctx.m;
    const type3 = p.sousType === "Type3";
    const tfs = g.tfs, th = g.th;
    const releve = !this.cache;
    const mode = g.tr & 3;
    const invisible = g.tr === 3 || g.tr === 7;
    const couleur = hexDe(mode === 1 ? g.tracer.css : g.remplir.css);
    const gras = p.gras || mode === 2;
    const k3 = type3 && p.matrice ? Math.abs(p.matrice[3]) * 1000 || 1 : 1;
    for (const el of elements) {
      if (typeof el === "number") { g.tm = mul([1, 0, 0, 1, (-el / 1000) * tfs * th, 0], g.tm); continue; }
      if (!(el instanceof Chaine)) continue;
      for (const code of p.codes(el.octets)) {
        const w0 = type3 ? p.largeur(code) * (p.matrice ? p.matrice[0] : 0.001) : p.largeur(code) / 1000;
        if (releve && this.s.lettres.length < 400000) {
          const M = mul([tfs * th, 0, 0, tfs, 0, g.trise], mul(g.tm, T0));
          let u = p.unicode(code);
          if (!u) { const s = secours(p); u = s ? s(code) : ""; }
          if (u) {
            const sx = Math.hypot(M[0], M[1]);
            this.s.lettres.push({
              u, x: M[4], y: M[5], l: w0 * sx, taille: Math.hypot(M[2], M[3]) * k3,
              angle: Math.atan2(M[1], M[0]), police: p, gras, italique: p.italique, mono: p.mono, couleur, invisible,
            });
          }
        }
        const tx = (w0 * tfs + g.tc + (p.espaceMot(code) ? g.tw : 0)) * th;
        g.tm = mul([1, 0, 0, 1, tx, 0], g.tm);
      }
    }
  }

  /* Un chemin peint : ses segments droits, horizontaux ou verticaux, sont
     des traits (bordures, soulignements) ; un rectangle plein est un aplat. */
  async peindre(remplir, tracer, regle, fermer) {
    if (fermer) this.ctx.closePath();
    if (!this.cache && (remplir || tracer) && this.s.traits.length < LIMITE_TRAITS) this.releverTraits(remplir, tracer);
    this.clipAttente = null;
    this.ctx.beginPath();
  }
  releverTraits(remplir, tracer) {
    const g = this.g;
    const css = tracer ? g.tracer.css : g.remplir.css;
    if (!css || blanc(css)) return;
    const sous = [];
    let cur = null;
    for (const c of this.ctx.chemin) {
      if (c[0] === "M") { cur = { pts: [[c[1], c[2]]], courbe: false, ferme: false }; sous.push(cur); }
      else if (c[0] === "Z") { if (cur) cur.ferme = true; }
      else if (cur) { cur.pts.push([c[1], c[2]]); if (c[0] === "C") cur.courbe = true; }
    }
    for (const s of sous) {
      if (s.courbe) continue;
      const pts = s.ferme && s.pts.length > 1 ? [...s.pts, s.pts[0]] : s.pts;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const droit = pts.every((p, i) => i === 0 || Math.abs(p[0] - pts[i - 1][0]) < 0.6 || Math.abs(p[1] - pts[i - 1][1]) < 0.6);
      if (remplir && droit && pts.length >= 4) {
        // un rectangle plein : fin, c'est un trait ; large, c'est un aplat
        if (y1 - y0 <= 2.5 && x1 - x0 > 3) this.s.traits.push({ x0, y0: (y0 + y1) / 2, x1, y1: (y0 + y1) / 2 });
        else if (x1 - x0 <= 2.5 && y1 - y0 > 3) this.s.traits.push({ x0: (x0 + x1) / 2, y0, x1: (x0 + x1) / 2, y1 });
        else if (x1 - x0 > 3 && y1 - y0 > 3) this.s.fonds.push({ x0, y0, x1, y1, couleur: hexDe(css) || "000000" });
        continue;
      }
      if (!tracer) continue;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        if (Math.abs(ay - by) < 0.6 && Math.abs(ax - bx) > 3) this.s.traits.push({ x0: Math.min(ax, bx), y0: ay, x1: Math.max(ax, bx), y1: ay });
        else if (Math.abs(ax - bx) < 0.6 && Math.abs(ay - by) > 3) this.s.traits.push({ x0: ax, y0: Math.min(ay, by), x1: ax, y1: Math.max(ay, by) });
      }
    }
  }

  /* Une image : on note où elle est posée (le carré unité, dans le repère de la page). */
  async dessinerImage(f, cle) {
    if (this.cache) return;
    const m = mul([1, 0, 0, -1, 0, 1], this.ctx.m);
    const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const masque = (await this.r(f.dict.get("ImageMask"))) === true;
    this.s.images.push({ flux: f, cle, masque, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  }
  async degradePlein() {}
  async remplirMotif() {}
}

/* Les liens d'une page : les annotations /Link qui ouvrent une adresse. */
async function liensDe(doc, p, base) {
  const out = [];
  const annots = await doc.resoudre(p.dict.get("Annots"));
  if (!Array.isArray(annots)) return out;
  for (const a of annots) {
    const d = await doc.resoudre(a);
    if (!(d instanceof Dict) || !(d.get("Subtype") instanceof Nom) || d.get("Subtype").nom !== "Link") continue;
    const act = await doc.resoudre(d.get("A"));
    if (!(act instanceof Dict)) continue;
    const uri = await doc.resoudre(act.get("URI"));
    if (!(uri instanceof Chaine)) continue;
    const r = await Promise.all(((await doc.resoudre(d.get("Rect"))) || []).map((x) => doc.resoudre(x)));
    if (r.length !== 4) continue;
    const pts = [[r[0], r[1]], [r[2], r[3]]].map(([x, y]) => [base[0] * x + base[2] * y + base[4], base[1] * x + base[3] * y + base[5]]);
    const adresse = uri.texte().trim();
    if (!/^(https?:|mailto:|ftp:)/i.test(adresse)) continue;
    out.push({ x0: Math.min(pts[0][0], pts[1][0]), y0: Math.min(pts[0][1], pts[1][1]), x1: Math.max(pts[0][0], pts[1][0]), y1: Math.max(pts[0][1], pts[1][1]), uri: adresse });
  }
  return out;
}

/* Relever la page « index » : { largeur, hauteur, lettres, images, traits, fonds, liens }. */
export async function lirePage(doc, index) {
  const pages = await doc.pages();
  const p = pages[index];
  if (!p) throw new Error("page " + (index + 1) + " introuvable");
  const t = await doc.taillePage(p);
  const [x0, y0, x1, y1] = [Math.min(t.boite[0], t.boite[2]), Math.min(t.boite[1], t.boite[3]), Math.max(t.boite[0], t.boite[2]), Math.max(t.boite[1], t.boite[3])];
  // le repère de la page vue : origine en haut à gauche, y vers le bas (comme rendrePage, à l'échelle 1)
  const base = t.rotation === 90 ? [0, 1, 1, 0, -y0, -x0]
    : t.rotation === 180 ? [-1, 0, 0, 1, x1, -y0]
      : t.rotation === 270 ? [0, -1, -1, 0, y1, x1]
        : [1, 0, 0, -1, -x0, y1];
  const caches = await cachesDe(doc);
  const ctx = new Fantome(t.largeur, t.hauteur);
  ctx.setTransform(...base);
  const s = { lettres: [], images: [], traits: [], fonds: [] };
  const r = new Releveur(doc, ctx, { ...caches, base: new Matrice(...base), operateurs: 0 }, s);
  const res = await doc.resoudre(p.herite.Resources);
  try { await r.executer(await contenuPage(doc, p), res); } catch (e) { /* page trop complexe : ce qui est relevé reste */ }
  try { await r.annotations(p, res); } catch (e) { /* rien */ }
  let liens = [];
  try { liens = await liensDe(doc, p, base); } catch (e) { /* rien */ }
  return { index, largeur: t.largeur, hauteur: t.hauteur, ...s, liens };
}

/* Relever plusieurs pages ; « surPage(n, total) » suit l'avancement. */
export async function lireDocument(doc, { selection = null, surPage = null } = {}) {
  const n = (await doc.pages()).length;
  const indices = selection || [...Array(n).keys()];
  const pages = [];
  for (const [k, i] of indices.entries()) {
    if (surPage) await surPage(k, indices.length, i);
    pages.push(await lirePage(doc, i));
  }
  return pages;
}
