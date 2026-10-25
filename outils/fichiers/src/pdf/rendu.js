/* Dessiner une page PDF sur un canevas (ISO 32000, § 8 et 9).

   Le contenu d'une page est un petit programme : des nombres suivis
   d'opérateurs — « 1 0 0 1 72 720 cm » déplace le repère, « 10 10 m
   200 10 l S » trace un trait, « BT /F1 12 Tf (Bonjour) Tj ET » écrit.
   On l'exécute ici, opérateur par opérateur, avec le canevas 2D du
   navigateur : ses chemins, son découpage (clip), ses transformations
   sont presque ceux du PDF.

   Ce que ce moteur sait : traits et remplissages, découpages, couleurs
   (gris, RVB, CMJN, ICC, indexées, encres d'accompagnement), dégradés
   et motifs, images (JPEG, et tout ce qui se décompresse sans perte, avec
   leur transparence), formulaires XObject, annotations (champs remplis),
   texte — dessiné avec les contours de la police TrueType embarquée
   quand il y en a une, sinon avec une police du système de même famille,
   chaque lettre à sa place exacte.
   Ce qu'il ne sait pas : les images JBIG2, fax (CCITT) et JPEG 2000
   (une case grise à leur place), les polices Type 1 et CFF (police du
   système à la place), les maillages de dégradés, les masques de
   transparence. Assez pour une vignette, un aperçu, une page en image —
   pas pour remplacer un vrai lecteur. */

import { Nom, Chaine, Ref, Dict, Flux } from "./objets.js";
import { Lexeur, Mot } from "./lecture.js";
import { decoder } from "./filtres.js";
import { pixelsImage } from "./operations.js";
import { chargerPolice } from "./glyphes.js";
import { creerFonction } from "./fonctions.js";

const ID = [1, 0, 0, 1, 0, 0];
const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const LIMITE_OPERATEURS = 3e6;
const nomDe = (x) => (x instanceof Nom ? x.nom : null);
const css = (rgb) => "rgb(" + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(",") + ")";

/* ── les espaces de couleur ── */
const GRIS = { n: 1, rgb: (c) => [c[0], c[0], c[0]], defaut: [0] };
const RVB = { n: 3, rgb: (c) => c, defaut: [0, 0, 0] };
const CMJN = { n: 4, rgb: ([c, m, y, k]) => [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)], defaut: [0, 0, 0, 1] };
function espaceLab(blanc) {
  const [Xn, Yn, Zn] = blanc || [0.9505, 1, 1.089];
  const f = (t) => (t > 6 / 29 ? t * t * t : 3 * (6 / 29) ** 2 * (t - 4 / 29));
  const g = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  return { n: 3, defaut: [0, 0, 0], rgb: ([L, a, b]) => {
    const l = (L + 16) / 116, X = Xn * f(l + a / 500), Y = Yn * f(l), Z = Zn * f(l - b / 200);
    return [g(3.2406 * X - 1.5372 * Y - 0.4986 * Z), g(-0.9689 * X + 1.8758 * Y + 0.0415 * Z), g(0.0557 * X - 0.204 * Y + 1.057 * Z)];
  } };
}

/* ── le moteur ── */
class Peintre {
  constructor(doc, ctx, caches) {
    this.doc = doc;
    this.ctx = ctx;
    this.c = caches;                      // polices, images, espaces, fonctions : partagés entre pages
    this.pile = [];
    this.g = Peintre.etatInitial();
    this.clipAttente = null;
    this.cur = { x: 0, y: 0 };
    this.prof = 0;
    this.masque = [];                     // contenu marqué (calques masqués)
  }
  static etatInitial() {
    const noir = { cs: GRIS, comp: [0], css: "rgb(0,0,0)", motif: null };
    return { remplir: noir, tracer: { ...noir }, lw: 1, ca: 1, CA: 1, blend: "source-over",
      police: null, tfs: 0, tc: 0, tw: 0, th: 1, tl: 0, tr: 0, trise: 0, tm: ID, tlm: ID, dash: [], dashPhase: 0, cap: 0, join: 0, miter: 10 };
  }
  r(x) { return this.doc.resoudre(x); }

  /* Exécuter un flux de contenu avec ses ressources. */
  async executer(octets, res) {
    const lx = new Lexeur(octets);
    const ops = [];
    const n = octets.length;
    while (true) {
      lx.passerBlancs();
      if (lx.pos >= n) break;
      let v;
      try { v = lx.objet(); } catch (e) { lx.pos++; ops.length = 0; continue; }
      if (!(v instanceof Mot)) { ops.push(v); continue; }
      if (++this.c.operateurs > LIMITE_OPERATEURS) throw new Error("page trop complexe");
      if (v.mot === "BI") { try { await this.imageEnLigne(lx, res); } catch (e) { /* image illisible */ } ops.length = 0; continue; }
      try { await this.op(v.mot, ops, res); } catch (e) { if (e.message === "page trop complexe") throw e; }
      ops.length = 0;
    }
  }

  get cache() { return this.masque.some(Boolean); }

  async op(op, a, res) {
    const ctx = this.ctx, g = this.g;
    switch (op) {
      // l'état graphique
      case "q": this.pile.push({ ...g }); ctx.save(); return;
      case "Q": if (this.pile.length) { this.g = this.pile.pop(); ctx.restore(); } return;
      case "cm": if (a.length >= 6) ctx.transform(a[0], a[1], a[2], a[3], a[4], a[5]); return;
      case "w": g.lw = a[0]; return;
      case "J": g.cap = a[0]; return;
      case "j": g.join = a[0]; return;
      case "M": g.miter = a[0]; return;
      case "d": g.dash = Array.isArray(a[0]) ? a[0].filter((x) => typeof x === "number") : []; g.dashPhase = a[1] || 0; return;
      case "gs": return this.etatExterne(a[0], res);
      case "ri": case "i": return;
      // les chemins
      case "m": this.ctx.moveTo(a[0], a[1]); this.cur = { x: a[0], y: a[1] }; return;
      case "l": this.ctx.lineTo(a[0], a[1]); this.cur = { x: a[0], y: a[1] }; return;
      case "c": this.ctx.bezierCurveTo(a[0], a[1], a[2], a[3], a[4], a[5]); this.cur = { x: a[4], y: a[5] }; return;
      case "v": this.ctx.bezierCurveTo(this.cur.x, this.cur.y, a[0], a[1], a[2], a[3]); this.cur = { x: a[2], y: a[3] }; return;
      case "y": this.ctx.bezierCurveTo(a[0], a[1], a[2], a[3], a[2], a[3]); this.cur = { x: a[2], y: a[3] }; return;
      case "h": this.ctx.closePath(); return;
      case "re": this.ctx.rect(a[0], a[1], a[2], a[3]); this.cur = { x: a[0], y: a[1] }; return;
      case "S": return this.peindre(false, true, "nonzero", false);
      case "s": return this.peindre(false, true, "nonzero", true);
      case "f": case "F": return this.peindre(true, false, "nonzero", false);
      case "f*": return this.peindre(true, false, "evenodd", false);
      case "B": return this.peindre(true, true, "nonzero", false);
      case "B*": return this.peindre(true, true, "evenodd", false);
      case "b": return this.peindre(true, true, "nonzero", true);
      case "b*": return this.peindre(true, true, "evenodd", true);
      case "n": return this.peindre(false, false, "nonzero", false);
      case "W": this.clipAttente = "nonzero"; return;
      case "W*": this.clipAttente = "evenodd"; return;
      // les couleurs
      case "g": g.remplir = this.couleur(GRIS, a); return;
      case "G": g.tracer = this.couleur(GRIS, a); return;
      case "rg": g.remplir = this.couleur(RVB, a); return;
      case "RG": g.tracer = this.couleur(RVB, a); return;
      case "k": g.remplir = this.couleur(CMJN, a); return;
      case "K": g.tracer = this.couleur(CMJN, a); return;
      case "cs": { const cs = await this.espace(a[0], res); g.remplir = this.couleur(cs, cs.defaut || [0]); return; }
      case "CS": { const cs = await this.espace(a[0], res); g.tracer = this.couleur(cs, cs.defaut || [0]); return; }
      case "sc": case "scn": g.remplir = await this.couleurIndexee(g.remplir.cs, a, res); return;
      case "SC": case "SCN": g.tracer = await this.couleurIndexee(g.tracer.cs, a, res); return;
      // le texte
      case "BT": g.tm = ID; g.tlm = ID; return;
      case "ET": return;
      case "Tf": g.tfs = a[1]; g.police = await this.police(a[0], res); return;
      case "Tc": g.tc = a[0]; return;
      case "Tw": g.tw = a[0]; return;
      case "Tz": g.th = a[0] / 100; return;
      case "TL": g.tl = a[0]; return;
      case "Tr": g.tr = a[0]; return;
      case "Ts": g.trise = a[0]; return;
      case "Td": g.tlm = mul([1, 0, 0, 1, a[0], a[1]], g.tlm); g.tm = g.tlm; return;
      case "TD": g.tl = -a[1]; g.tlm = mul([1, 0, 0, 1, a[0], a[1]], g.tlm); g.tm = g.tlm; return;
      case "Tm": g.tlm = a.slice(0, 6); g.tm = g.tlm; return;
      case "T*": g.tlm = mul([1, 0, 0, 1, 0, -g.tl], g.tlm); g.tm = g.tlm; return;
      case "Tj": return this.montrer([a[0]], res);
      case "TJ": return this.montrer(a[0], res);
      case "'": g.tlm = mul([1, 0, 0, 1, 0, -g.tl], g.tlm); g.tm = g.tlm; return this.montrer([a[0]], res);
      case '"': g.tw = a[0]; g.tc = a[1]; g.tlm = mul([1, 0, 0, 1, 0, -g.tl], g.tlm); g.tm = g.tlm; return this.montrer([a[2]], res);
      case "d0": case "d1": return;
      // les objets
      case "Do": if (!this.cache) await this.objetExterne(a[0], res); return;
      case "sh": if (!this.cache) await this.degradePlein(a[0], res); return;
      // le contenu marqué : les calques masqués
      case "BMC": this.masque.push(false); return;
      case "BDC": this.masque.push(await this.calqueMasque(a[0], a[1], res)); return;
      case "EMC": this.masque.pop(); return;
      default: return;
    }
  }

  /* ── peindre un chemin ── */
  async peindre(remplir, tracer, regle, fermer) {
    const ctx = this.ctx, g = this.g;
    if (fermer) ctx.closePath();
    if (!this.cache) {
      ctx.globalCompositeOperation = g.blend;
      if (remplir) {
        if (g.remplir.motif) await this.remplirMotif(g.remplir, regle);
        else if (g.remplir.css) { ctx.fillStyle = g.remplir.css; ctx.globalAlpha = g.ca; ctx.fill(regle); }
      }
      if (tracer && g.tracer.css !== null) {
        ctx.strokeStyle = g.tracer.motif ? "rgb(128,128,128)" : g.tracer.css;
        ctx.globalAlpha = g.CA;
        this.styleTrait();
        ctx.stroke();
      }
    }
    if (this.clipAttente) { ctx.clip(this.clipAttente); this.clipAttente = null; }
    ctx.beginPath();
  }
  styleTrait() {
    const ctx = this.ctx, g = this.g;
    const m = ctx.getTransform();
    const k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    // un trait de largeur 0 (ou très fin) reste visible : au moins ¾ de pixel
    ctx.lineWidth = Math.max(g.lw, 0.75 / k);
    ctx.lineCap = ["butt", "round", "square"][g.cap] || "butt";
    ctx.lineJoin = ["miter", "round", "bevel"][g.join] || "miter";
    ctx.miterLimit = g.miter > 0 ? g.miter : 10;
    const tirets = g.dash.length && g.dash.some((x) => x > 0) ? g.dash : [];
    ctx.setLineDash(tirets);
    ctx.lineDashOffset = g.dashPhase || 0;
  }

  /* ── les couleurs ── */
  couleur(cs, comp) {
    if (cs.motif) return { cs, comp, css: "rgb(128,128,128)", motif: null };
    if (cs.rien) return { cs, comp, css: null, motif: null };
    let rgb;
    try { rgb = cs.rgb(comp.slice(0, cs.n)); } catch (e) { rgb = [0, 0, 0]; }
    return { cs, comp, css: css(rgb), motif: null };
  }
  async couleurIndexee(cs, a, res) {
    if (cs && cs.motif) {
      const nom = a[a.length - 1];
      const motif = nom instanceof Nom ? await this.ressource(res, "Pattern", nom) : null;
      const comp = a.filter((x) => typeof x === "number");
      const base = cs.base ? this.couleur(cs.base, comp) : null;
      return { cs, comp, css: base ? base.css : "rgb(128,128,128)", motif, base };
    }
    return this.couleur(cs || GRIS, a.filter((x) => typeof x === "number"));
  }
  async ressource(res, categorie, nom) {
    if (!(res instanceof Dict) || !(nom instanceof Nom)) return null;
    const d = await this.r(res.get(categorie));
    if (!(d instanceof Dict)) return null;
    return { ref: d.get(nom.nom), valeur: await this.r(d.get(nom.nom)) };
  }
  async espace(x, res, prof = 0) {
    if (prof > 5) return GRIS;
    if (x instanceof Nom) {
      switch (x.nom) {
        case "DeviceGray": case "G": case "CalGray": return GRIS;
        case "DeviceRGB": case "RGB": case "CalRGB": return RVB;
        case "DeviceCMYK": case "CMYK": return CMJN;
        case "Pattern": return { motif: true, n: 0, base: null, defaut: [] };
      }
      const r = await this.ressource(res, "ColorSpace", x);
      if (!r || r.valeur == null) return GRIS;
      const cle = r.ref instanceof Ref ? "r" + r.ref.num : null;
      if (cle && this.c.espaces.has(cle)) return this.c.espaces.get(cle);
      const e = await this.espace(r.valeur, res, prof + 1);
      if (cle) this.c.espaces.set(cle, e);
      return e;
    }
    if (!Array.isArray(x)) { x = await this.r(x); if (!Array.isArray(x)) return x instanceof Nom ? this.espace(x, res, prof + 1) : GRIS; }
    const t = nomDe(await this.r(x[0]));
    if (t === "ICCBased") {
      const s = await this.r(x[1]);
      const n = s instanceof Flux ? await this.r(s.dict.get("N")) : 3;
      return n === 1 ? GRIS : n === 4 ? CMJN : RVB;
    }
    if (t === "CalRGB") return RVB;
    if (t === "CalGray") return GRIS;
    if (t === "Lab") { const d = await this.r(x[1]); return espaceLab(d instanceof Dict ? await this.r(d.get("WhitePoint")) : null); }
    if (t === "Indexed" || t === "I") {
      const base = await this.espace(await this.r(x[1]), res, prof + 1);
      const hival = await this.r(x[2]);
      const lut = await this.r(x[3]);
      const o = lut instanceof Chaine ? lut.octets : lut instanceof Flux ? await this.doc.decode(lut) : new Uint8Array(0);
      const n = base.n || 1;
      return { n: 1, defaut: [0], rgb: ([i]) => {
        const k = Math.max(0, Math.min(hival, Math.round(i)));
        return base.rgb(Array.from(o.subarray(k * n, k * n + n), (v) => v / 255));
      } };
    }
    if (t === "Separation" || t === "DeviceN") {
      const noms = await this.r(x[1]);
      const alt = await this.espace(await this.r(x[2]), res, prof + 1);
      const fn = await creerFonction(this.doc, x[3]);
      const n = t === "Separation" ? 1 : Array.isArray(noms) ? noms.length : 1;
      if (t === "Separation" && nomDe(noms) === "None") return { n: 1, defaut: [1], rien: true, rgb: () => [1, 1, 1] };
      return { n, defaut: new Array(n).fill(1), rgb: (c) => alt.rgb(fn(c)) };
    }
    if (t === "Pattern") return { motif: true, n: 0, base: x[1] ? await this.espace(await this.r(x[1]), res, prof + 1) : null, defaut: [] };
    if (t === "DeviceGray" || t === "DeviceRGB" || t === "DeviceCMYK") return this.espace(N_(t), res, prof + 1);
    return RVB;
  }
  async etatExterne(nom, res) {
    const r = await this.ressource(res, "ExtGState", nom);
    const d = r && r.valeur;
    if (!(d instanceof Dict)) return;
    const g = this.g;
    for (const [k, v0] of d) {
      const v = await this.r(v0);
      if (k === "LW") g.lw = v;
      else if (k === "LC") g.cap = v;
      else if (k === "LJ") g.join = v;
      else if (k === "ML") g.miter = v;
      else if (k === "D" && Array.isArray(v)) { g.dash = (await this.r(v[0])) || []; g.dashPhase = v[1] || 0; }
      else if (k === "ca") g.ca = v;
      else if (k === "CA") g.CA = v;
      else if (k === "BM") g.blend = melange(Array.isArray(v) ? v[0] : v);
      else if (k === "Font" && Array.isArray(v)) { g.police = await this.policeDe(v[0]); g.tfs = v[1]; }
    }
  }
  async calqueMasque(tag, props, res) {
    if (nomDe(tag) !== "OC") return false;
    let p = props;
    let ref = null;
    if (p instanceof Nom) { const r = await this.ressource(res, "Properties", p); ref = r && r.ref; p = r && r.valeur; }
    return ref instanceof Ref && this.c.calquesMasques.has(ref.num);
  }

  /* ── le texte ── */
  async police(nom, res) {
    const r = await this.ressource(res, "Font", nom);
    if (!r || !(r.valeur instanceof Dict)) return this.policeDe(null);
    return this.policeDe(r.ref instanceof Ref ? r.ref : r.valeur);
  }
  async policeDe(x) {
    const cle = x instanceof Ref ? "r" + x.num : x || "défaut";
    if (this.c.polices.has(cle)) return this.c.polices.get(cle);
    let p;
    try { p = await chargerPolice(this.doc, x ? await this.r(x) : new Dict()); }
    catch (e) { p = await chargerPolice(this.doc, new Dict()); }
    p.chemins = new Map();
    this.c.polices.set(cle, p);
    return p;
  }
  async montrer(elements, res) {
    const g = this.g, ctx = this.ctx;
    const p = g.police || (g.police = await this.policeDe(null));
    if (!Array.isArray(elements)) return;
    const mode = g.tr & 3;
    const visible = !this.cache && g.tr !== 3 && g.tr !== 7;
    const T0 = ctx.getTransform();
    const type3 = p.sousType === "Type3";
    if (visible) {
      ctx.globalCompositeOperation = g.blend;
      ctx.fillStyle = g.remplir.css || "rgba(0,0,0,0)";
      ctx.strokeStyle = g.tracer.css || "rgba(0,0,0,0)";
      if (!type3) ctx.font = (p.italique ? "italic " : "") + (p.gras ? "bold " : "") + "100px " + p.css;
    }
    const tfs = g.tfs, th = g.th;
    for (const el of elements) {
      if (typeof el === "number") { g.tm = mul([1, 0, 0, 1, (-el / 1000) * tfs * th, 0], g.tm); continue; }
      if (!(el instanceof Chaine)) continue;
      for (const code of p.codes(el.octets)) {
        const w0 = type3 ? p.largeur(code) * (p.matrice ? p.matrice[0] : 0.001) : p.largeur(code) / 1000;
        if (visible) {
          ctx.setTransform(T0);
          const m = g.tm;
          ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
          ctx.transform(tfs * th, 0, 0, tfs, 0, g.trise);
          if (type3) await this.glyphe3(p, code, res);
          else this.glyphe(p, code, w0, mode);
        }
        const tx = (w0 * tfs + g.tc + (p.espaceMot(code) ? g.tw : 0)) * th;
        g.tm = mul([1, 0, 0, 1, tx, 0], g.tm);
      }
    }
    ctx.setTransform(T0);
  }
  glyphe(p, code, w0, mode) {
    const ctx = this.ctx, g = this.g;
    if (p.tt) {
      const gid = p.gid(code);
      if (gid > 0) {
        let chemin = p.chemins.get(gid);
        if (chemin === undefined) {
          const cmds = p.tt.contours(gid);
          chemin = null;
          if (cmds.length) {
            chemin = new Path2D();
            for (const c of cmds) {
              if (c[0] === "M") chemin.moveTo(c[1], c[2]);
              else if (c[0] === "L") chemin.lineTo(c[1], c[2]);
              else if (c[0] === "Q") chemin.quadraticCurveTo(c[1], c[2], c[3], c[4]);
              else chemin.closePath();
            }
          }
          p.chemins.set(gid, chemin);
        }
        if (chemin) {
          ctx.scale(1 / p.upem, 1 / p.upem);
          if (mode === 0 || mode === 2) { ctx.globalAlpha = g.ca; ctx.fill(chemin); }
          if (mode === 1 || mode === 2) { ctx.globalAlpha = g.CA; ctx.lineWidth = (g.lw * p.upem) / Math.max(1, g.tfs); ctx.stroke(chemin); }
          return;
        }
        if (p.tt.contours(gid) && !(p.unicode(code) || "").trim()) return;
      }
    }
    const u = p.unicode(code);
    if (!u || !u.trim()) return;
    // une police du système : la lettre, ajustée à la largeur que le PDF lui donne
    const cle = ctx.font + "|" + u;
    let mesure = this.c.mesures.get(cle);
    if (mesure === undefined) { mesure = ctx.measureText(u).width / 100; this.c.mesures.set(cle, mesure); }
    let sx = 1;
    if (mesure > 0.05 && w0 > 0.05) sx = Math.max(0.7, Math.min(1.3, w0 / mesure));
    ctx.scale(0.01 * sx, -0.01);
    if (mode === 0 || mode === 2) { ctx.globalAlpha = g.ca; ctx.fillText(u, 0, 0); }
    if (mode === 1 || mode === 2) { ctx.globalAlpha = g.CA; ctx.lineWidth = 4; ctx.strokeText(u, 0, 0); }
  }
  async glyphe3(p, code, resPage) {
    if (!(p.procs instanceof Dict) || this.prof > 6) return;
    const nom = p.nomsGlyphes[code];
    const proc = nom ? await this.r(p.procs.get(nom)) : null;
    if (!(proc instanceof Flux)) return;
    const m = p.matrice;
    const ctx = this.ctx;
    const sauve = { ...this.g };
    ctx.save();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    this.prof++;
    const pile = this.pile;
    this.pile = [];
    try { await this.executer(await this.doc.decode(proc), p.ressources instanceof Dict ? p.ressources : resPage); }
    finally {
      this.prof--;
      while (this.pile.length) { this.pile.pop(); ctx.restore(); }
      this.pile = pile;
      ctx.restore();
      this.g = sauve;
    }
  }

  /* ── les objets externes : images et formulaires ── */
  async objetExterne(nom, res) {
    const r = await this.ressource(res, "XObject", nom);
    if (!r || !(r.valeur instanceof Flux)) return;
    const f = r.valeur;
    const st = nomDe(f.dict.get("Subtype"));
    if (st === "Image") return this.dessinerImage(f, r.ref instanceof Ref ? r.ref.num : null);
    if (st === "Form") {
      const oc = await this.r(f.dict.get("OC"));
      if (oc && f.dict.get("OC") instanceof Ref && this.c.calquesMasques.has(f.dict.get("OC").num)) return;
      return this.formulaire(f, res);
    }
  }
  async formulaire(f, resParent) {
    if (this.prof > 12) return;
    const d = f.dict;
    const m = (await this.r(d.get("Matrix"))) || ID;
    const bbox = await this.r(d.get("BBox"));
    const res = (await this.r(d.get("Resources"))) || resParent;
    const ctx = this.ctx;
    this.pile.push({ ...this.g });
    ctx.save();
    const pile = this.pile;
    this.pile = [];
    this.prof++;
    try {
      ctx.transform(...(await Promise.all(m.map((x) => this.r(x)))));
      if (Array.isArray(bbox) && bbox.length === 4) {
        const b = await Promise.all(bbox.map((x) => this.r(x)));
        ctx.beginPath();
        ctx.rect(Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.abs(b[2] - b[0]), Math.abs(b[3] - b[1]));
        ctx.clip();
        ctx.beginPath();
      }
      await this.executer(await this.doc.decode(f), res);
    } finally {
      this.prof--;
      while (this.pile.length) { this.pile.pop(); ctx.restore(); }
      this.pile = pile;
      ctx.restore();
      this.g = this.pile.pop();
    }
  }

  async dessinerImage(f, cle) {
    let im = cle != null ? this.c.images.get(cle) : null;
    if (!im) {
      try { im = await this.preparerImage(f); } catch (e) { im = null; }
      if (!im) return;
      if (cle != null) this.c.images.set(cle, im);
    }
    const ctx = this.ctx, g = this.g;
    ctx.save();
    ctx.transform(1, 0, 0, -1, 0, 1);
    ctx.globalAlpha = g.ca;
    ctx.globalCompositeOperation = g.blend;
    const m = ctx.getTransform();
    const largeurVue = Math.hypot(m.a, m.b), hauteurVue = Math.hypot(m.c, m.d);
    // agrandie (un QR code, un pictogramme) : des pixels nets ; réduite : lissée
    ctx.imageSmoothingEnabled = !(im.net || (largeurVue > im.largeur * 2.5 && hauteurVue > im.hauteur * 2.5));
    ctx.imageSmoothingQuality = "high";
    if (im.gris) { ctx.fillStyle = "rgba(160,160,160,.35)"; ctx.fillRect(0, 0, 1, 1); }
    else if (im.masque) {
      // un masque au pochoir : la couleur de remplissage, là où il laisse passer
      const couleurCss = g.remplir.css || "rgb(0,0,0)";
      let teinte = im.teintes.get(couleurCss);
      if (!teinte) {
        teinte = document.createElement("canvas");
        teinte.width = im.largeur; teinte.height = im.hauteur;
        const t = teinte.getContext("2d");
        t.drawImage(im.masque, 0, 0);
        t.globalCompositeOperation = "source-in";
        t.fillStyle = couleurCss;
        t.fillRect(0, 0, im.largeur, im.hauteur);
        if (im.teintes.size > 8) im.teintes.clear();
        im.teintes.set(couleurCss, teinte);
      }
      ctx.drawImage(teinte, 0, 0, 1, 1);
    } else ctx.drawImage(im.source, 0, 0, 1, 1);
    ctx.restore();
  }

  async preparerImage(f) {
    const d = f.dict;
    const w = await this.r(d.get("Width")), h = await this.r(d.get("Height"));
    if (!(w > 0) || !(h > 0) || w * h > 64e6) return null;
    const bpc = (await this.r(d.get("BitsPerComponent"))) || 1;
    const decodeTab = await this.r(d.get("Decode"));
    let inverse = Array.isArray(decodeTab) && decodeTab[0] === 1;
    if ((await this.r(d.get("ImageMask"))) === true) {
      const dec = await decoder(f);
      if (dec.reste.length) return { largeur: w, hauteur: h, gris: true };
      return { largeur: w, hauteur: h, masque: masqueBits(dec.octets, w, h, !inverse), teintes: new Map(), net: true };
    }
    const dec = await decoder(f);
    let source = null;
    const filtre = dec.reste[0];
    if (filtre === "DCTDecode" || filtre === "DCT") {
      inverse = false;                                   // le décodeur JPEG sait déjà (marqueur Adobe)
      try { source = await createImageBitmap(new Blob([dec.octets], { type: "image/jpeg" })); } catch (e) { return { largeur: w, hauteur: h, gris: true }; }
    } else if (dec.reste.length) return { largeur: w, hauteur: h, gris: true };
    // la transparence : un masque doux (SMask), un pochoir (Mask), ou rien
    const sm = await this.r(d.get("SMask"));
    const mk = await this.r(d.get("Mask"));
    const besoinPixels = !source || sm instanceof Flux || mk instanceof Flux || inverse;
    if (!besoinPixels) return { largeur: w, hauteur: h, source, net: bpc === 1 };
    let rgba;
    if (source) {
      const c = toile(w, h);
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(source, 0, 0, w, h);
      rgba = x.getImageData(0, 0, w, h).data;
      if (source.close) source.close();
    } else {
      const px = await pixelsImage(this.doc, f);
      if (!px) return { largeur: w, hauteur: h, gris: true };
      rgba = px.rgba;
      if (inverse) for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 255 - rgba[i]; rgba[i + 1] = 255 - rgba[i + 1]; rgba[i + 2] = 255 - rgba[i + 2]; }
    }
    if (sm instanceof Flux) {
      const a = await pixelsImage(this.doc, sm);
      const ds = await this.r(sm.dict.get("Decode"));
      if (a && Array.isArray(ds) && ds[0] === 1) for (let i = 0; i < a.rgba.length; i += 4) a.rgba[i] = 255 - a.rgba[i];
      if (a) poserAlpha(rgba, w, h, a.rgba, a.largeur, a.hauteur, false);
    } else if (mk instanceof Flux) {
      const dm = await decoder(mk);
      const mw = await this.r(mk.dict.get("Width")), mh = await this.r(mk.dict.get("Height"));
      const dmk = await this.r(mk.dict.get("Decode"));
      if (!dm.reste.length && mw && mh) {
        const bits = masqueBits(dm.octets, mw, mh, !(Array.isArray(dmk) && dmk[0] === 1));
        const t = bits.getContext("2d").getImageData(0, 0, mw, mh).data;
        poserAlpha(rgba, w, h, t, mw, mh, true);
      }
    }
    const c = toile(w, h);
    c.getContext("2d").putImageData(new ImageData(rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer), w, h), 0, 0);
    return { largeur: w, hauteur: h, source: c, net: bpc === 1 };
  }

  async imageEnLigne(lx, res) {
    const d = new Dict();
    const ABR = { W: "Width", H: "Height", BPC: "BitsPerComponent", CS: "ColorSpace", F: "Filter", DP: "DecodeParms", IM: "ImageMask", D: "Decode", I: "Interpolate", L: "Length" };
    const VAL = { G: "DeviceGray", RGB: "DeviceRGB", CMYK: "DeviceCMYK", I: "Indexed", AHx: "ASCIIHexDecode", A85: "ASCII85Decode", LZW: "LZWDecode",
      Fl: "FlateDecode", RL: "RunLengthDecode", CCF: "CCITTFaxDecode", DCT: "DCTDecode" };
    const plein = (v) => (v instanceof Nom && VAL[v.nom] ? new Nom(VAL[v.nom]) : Array.isArray(v) ? v.map(plein) : v);
    for (let garde = 0; garde < 100; garde++) {
      const k = lx.objet();
      if (k instanceof Mot && k.mot === "ID") break;
      const v = lx.objet();
      if (k instanceof Nom) d.set(ABR[k.nom] || k.nom, plein(v));
    }
    const o = lx.o;
    let debut = lx.pos + 1;                              // un blanc après « ID »
    // la fin : « EI » entouré de blancs (on vérifie qu'un opérateur suit)
    let fin = -1;
    for (let i = debut; i < o.length - 1; i++) {
      if (o[i] === 0x45 && o[i + 1] === 0x49 && (i === debut || o[i - 1] <= 32) && (i + 2 >= o.length || o[i + 2] <= 32)) { fin = i; break; }
    }
    if (fin < 0) { lx.pos = o.length; return; }
    lx.pos = fin + 2;
    const donnees = o.subarray(debut, Math.max(debut, fin - 1 >= debut && o[fin - 1] <= 32 ? fin - 1 : fin));
    if (this.cache) return;
    // l'espace de couleur d'une image en ligne peut nommer une ressource
    const cs = d.get("ColorSpace");
    if (cs instanceof Nom && !/^Device|^Cal/.test(cs.nom) && cs.nom !== "Indexed") {
      const r = await this.ressource(res, "ColorSpace", cs);
      if (r) d.set("ColorSpace", r.valeur);
    }
    await this.dessinerImage(new Flux(d, donnees), null);
  }

  /* ── dégradés et motifs ── */
  async degrade(sh, ctx) {
    const d = sh instanceof Flux ? sh.dict : sh;
    if (!(d instanceof Dict)) return null;
    const type = await this.r(d.get("ShadingType"));
    if (type !== 2 && type !== 3) return null;
    const co = await Promise.all(((await this.r(d.get("Coords"))) || []).map((x) => this.r(x)));
    const dom = (await this.r(d.get("Domain"))) || [0, 1];
    const fn = await creerFonction(this.doc, d.get("Function"));
    const cs = await this.espace(await this.r(d.get("ColorSpace")), null);
    const gr = type === 2 ? ctx.createLinearGradient(co[0], co[1], co[2], co[3]) : ctx.createRadialGradient(co[0], co[1], co[2], co[3], co[4], co[5]);
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const t = dom[0] + ((dom[1] - dom[0]) * i) / N;
      let rgb;
      try { rgb = cs.rgb(fn([t])); } catch (e) { rgb = [0.5, 0.5, 0.5]; }
      gr.addColorStop(i / N, css(rgb));
    }
    // sans /Extend, le dégradé s'arrête à ses bornes (le canevas, lui, prolonge toujours)
    const ext = (await this.r(d.get("Extend"))) || [false, false];
    let borner = null;
    if (type === 2 && (!ext[0] || !ext[1])) {
      const dx = co[2] - co[0], dy = co[3] - co[1], l = Math.hypot(dx, dy);
      if (l > 0) {
        const ux = dx / l, uy = dy / l, L = 1e5;
        const ax = ext[0] ? co[0] - ux * L : co[0], ay = ext[0] ? co[1] - uy * L : co[1];
        const bx = ext[1] ? co[2] + ux * L : co[2], by = ext[1] ? co[3] + uy * L : co[3];
        borner = (x) => { x.beginPath(); x.moveTo(ax - uy * L, ay + ux * L); x.lineTo(bx - uy * L, by + ux * L); x.lineTo(bx + uy * L, by - ux * L); x.lineTo(ax + uy * L, ay - ux * L); x.closePath(); x.clip(); };
      }
    } else if (type === 3 && !ext[1]) {
      const r = Math.max(co[2], co[5]), cx = co[5] >= co[2] ? co[3] : co[0], cy = co[5] >= co[2] ? co[4] : co[1];
      borner = (x) => { x.beginPath(); x.arc(cx, cy, r, 0, 2 * Math.PI); x.clip(); };
    }
    gr.borner = borner;
    return gr;
  }
  zoneVisible() {
    // le rectangle du canevas, ramené dans le repère courant
    const m = this.ctx.getTransform();
    if (!m.is2D || Math.abs(m.a * m.d - m.b * m.c) < 1e-12) return null;
    const inv = m.inverse();
    const W = this.ctx.canvas.width, H = this.ctx.canvas.height;
    const pts = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => inv.transformPoint({ x, y }));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  }
  async degradePlein(nom, res) {
    const r = await this.ressource(res, "Shading", nom);
    if (!r) return;
    const gr = await this.degrade(r.valeur, this.ctx);
    const z = this.zoneVisible();
    if (!gr || !z) return;
    this.ctx.save();
    if (gr.borner) gr.borner(this.ctx);
    this.ctx.globalAlpha = this.g.ca;
    this.ctx.fillStyle = gr;
    this.ctx.fillRect(...z);
    this.ctx.restore();
  }
  async remplirMotif(couleur, regle) {
    const ctx = this.ctx, mo = couleur.motif;
    if (!mo || !mo.valeur) return;
    const p = mo.valeur;
    const d = p instanceof Flux ? p.dict : p;
    if (!(d instanceof Dict)) return;
    const type = await this.r(d.get("PatternType"));
    const M = await Promise.all(((await this.r(d.get("Matrix"))) || ID).map((x) => this.r(x)));
    const espaceMotif = this.c.base.multiply(new DOMMatrix(M));
    ctx.save();
    ctx.clip(regle);
    ctx.setTransform(espaceMotif);
    ctx.globalAlpha = this.g.ca;
    try {
      if (type === 2) {
        const gr = await this.degrade(await this.r(d.get("Shading")), ctx);
        const z = this.zoneVisible();
        if (gr && z) { if (gr.borner) gr.borner(ctx); ctx.fillStyle = gr; ctx.fillRect(...z); }
      } else if (type === 1 && p instanceof Flux && this.prof < 4) {
        const tuile = await this.tuile(p, espaceMotif, couleur);
        const z = this.zoneVisible();
        if (tuile && z) { ctx.fillStyle = tuile; ctx.fillRect(...z); }
      }
    } finally { ctx.restore(); }
  }
  async tuile(p, M, couleur) {
    const d = p.dict;
    const b = await Promise.all(((await this.r(d.get("BBox"))) || [0, 0, 1, 1]).map((x) => this.r(x)));
    const xs = Math.abs((await this.r(d.get("XStep"))) || b[2] - b[0]), ys = Math.abs((await this.r(d.get("YStep"))) || b[3] - b[1]);
    const s = Math.sqrt(Math.abs(M.a * M.d - M.b * M.c));
    const cw = Math.ceil(xs * s), ch = Math.ceil(ys * s);
    if (!(cw >= 1 && ch >= 1) || cw * ch > 4e6) return null;
    const c = toile(cw, ch);
    const x = c.getContext("2d");
    const base = new DOMMatrix([s, 0, 0, -s, -b[0] * s, (b[1] + ys) * s]);
    x.setTransform(base);
    x.beginPath();
    x.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    x.clip();
    x.beginPath();
    const sous = new Peintre(this.doc, x, { ...this.c, base });
    sous.prof = this.prof + 1;
    if ((await this.r(d.get("PaintType"))) === 2 && couleur.base) { sous.g.remplir = couleur.base; sous.g.tracer = couleur.base; }
    await sous.executer(await this.doc.decode(p), (await this.r(d.get("Resources"))) || null);
    const motif = this.ctx.createPattern(c, "repeat");
    motif.setTransform(new DOMMatrix([1 / s, 0, 0, -1 / s, b[0], b[1] + ys]));
    return motif;
  }

  /* ── les annotations : leur apparence, déjà dessinée par qui les a faites ── */
  async annotations(page, res) {
    const annots = await this.r(page.dict.get("Annots"));
    if (!Array.isArray(annots)) return;
    for (const a of annots) {
      const d = await this.r(a);
      if (!(d instanceof Dict)) continue;
      if (nomDe(d.get("Subtype")) === "Popup") continue;
      const fl = (await this.r(d.get("F"))) | 0;
      if (fl & 2 || fl & 32) continue;
      const ap = await this.r(d.get("AP"));
      if (!(ap instanceof Dict)) continue;
      let n = await this.r(ap.get("N"));
      if (n instanceof Dict) { const as = d.get("AS"); n = as instanceof Nom ? await this.r(n.get(as.nom)) : null; }
      if (!(n instanceof Flux)) continue;
      const rect = await Promise.all(((await this.r(d.get("Rect"))) || []).map((x) => this.r(x)));
      const bb = await Promise.all(((await this.r(n.dict.get("BBox"))) || []).map((x) => this.r(x)));
      if (rect.length !== 4 || bb.length !== 4) continue;
      const m = await Promise.all(((await this.r(n.dict.get("Matrix"))) || ID).map((x) => this.r(x)));
      const coins = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
      const tx0 = Math.min(...coins.map((c) => c[0])), tx1 = Math.max(...coins.map((c) => c[0]));
      const ty0 = Math.min(...coins.map((c) => c[1])), ty1 = Math.max(...coins.map((c) => c[1]));
      const rx0 = Math.min(rect[0], rect[2]), rx1 = Math.max(rect[0], rect[2]), ry0 = Math.min(rect[1], rect[3]), ry1 = Math.max(rect[1], rect[3]);
      if (tx1 - tx0 < 1e-6 || ty1 - ty0 < 1e-6) continue;
      const sx = (rx1 - rx0) / (tx1 - tx0), sy = (ry1 - ry0) / (ty1 - ty0);
      this.ctx.save();
      this.ctx.setTransform(this.c.base);
      this.ctx.transform(sx, 0, 0, sy, rx0 - tx0 * sx, ry0 - ty0 * sy);
      this.g = Peintre.etatInitial();
      try { await this.formulaire(n, res); } catch (e) { /* une annotation ratée */ }
      this.ctx.restore();
    }
  }
}
const N_ = (s) => new Nom(s);

function melange(n) {
  const nom = nomDe(n);
  const M = { Multiply: "multiply", Screen: "screen", Overlay: "overlay", Darken: "darken", Lighten: "lighten", ColorDodge: "color-dodge", ColorBurn: "color-burn",
    HardLight: "hard-light", SoftLight: "soft-light", Difference: "difference", Exclusion: "exclusion", Hue: "hue", Saturation: "saturation", Color: "color", Luminosity: "luminosity" };
  return M[nom] || "source-over";
}

function toile(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/* Un masque d'un bit par pixel → un canevas blanc, opaque là où l'on peint. */
function masqueBits(o, w, h, peindreSurZero) {
  const c = toile(w, h);
  const x = c.getContext("2d");
  const img = x.createImageData(w, h);
  const ligne = Math.ceil(w / 8);
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
    const bit = (o[y * ligne + (i >> 3)] >> (7 - (i & 7))) & 1;
    const k = (y * w + i) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = (bit === 0) === peindreSurZero ? 255 : 0;
  }
  x.putImageData(img, 0, 0);
  return c;
}
/* Poser une couche alpha (ou un pochoir) sur des pixels RGBA, à l'échelle. */
function poserAlpha(rgba, w, h, a, aw, ah, pochoir) {
  for (let y = 0; y < h; y++) {
    const sy = Math.min(ah - 1, Math.floor((y * ah) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(aw - 1, Math.floor((x * aw) / w));
      const k = (sy * aw + sx) * 4;
      rgba[(y * w + x) * 4 + 3] = pochoir ? a[k + 3] : a[k];
    }
  }
}

/* ── ce qu'on appelle du dehors ── */
const cachesParDoc = new WeakMap();
async function cachesDe(doc) {
  let c = cachesParDoc.get(doc);
  if (c) return c;
  const masques = new Set();
  try {
    const cat = await doc.catalogue();
    const ocp = cat && (await doc.resoudre(cat.get("OCProperties")));
    const def = ocp instanceof Dict ? await doc.resoudre(ocp.get("D")) : null;
    const off = def instanceof Dict ? await doc.resoudre(def.get("OFF")) : null;
    if (Array.isArray(off)) for (const r of off) if (r instanceof Ref) masques.add(r.num);
  } catch (e) { /* pas de calques */ }
  c = { polices: new Map(), images: new Map(), espaces: new Map(), mesures: new Map(), calquesMasques: masques, operateurs: 0 };
  cachesParDoc.set(doc, c);
  return c;
}

/* Dessiner la page « index » : un canevas de (largeur × échelle) pixels,
   la page telle qu'on la voit (rotation /Rotate appliquée). */
export async function rendrePage(doc, index, { echelle = 1, canevas = null, fond = "#ffffff", annotations = true, maxPixels = 24e6 } = {}) {
  const pages = await doc.pages();
  const p = pages[index];
  if (!p) throw new Error("page " + (index + 1) + " introuvable");
  const t = await doc.taillePage(p);
  const [x0, y0, x1, y1] = [Math.min(t.boite[0], t.boite[2]), Math.min(t.boite[1], t.boite[3]), Math.max(t.boite[0], t.boite[2]), Math.max(t.boite[1], t.boite[3])];
  if (t.largeur * t.hauteur * echelle * echelle > maxPixels) echelle = Math.sqrt(maxPixels / (t.largeur * t.hauteur));
  const c = canevas || document.createElement("canvas");
  c.width = Math.max(1, Math.round(t.largeur * echelle));
  c.height = Math.max(1, Math.round(t.hauteur * echelle));
  const ctx = c.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fond) { ctx.fillStyle = fond; ctx.fillRect(0, 0, c.width, c.height); } else ctx.clearRect(0, 0, c.width, c.height);
  // le repère de la page : origine en bas à gauche de la boîte, y vers le haut, rotation comprise
  const s = c.width / t.largeur;
  const base = t.rotation === 90 ? [0, s, s, 0, -s * y0, -s * x0]
    : t.rotation === 180 ? [-s, 0, 0, s, s * x1, -s * y0]
      : t.rotation === 270 ? [0, -s, -s, 0, s * y1, s * x1]
        : [s, 0, 0, -s, -s * x0, s * y1];
  const caches = await cachesDe(doc);
  caches.operateurs = 0;
  const peintre = new Peintre(doc, ctx, { ...caches, base: new DOMMatrix(base) });
  peintre.c.operateurs = 0;
  ctx.setTransform(...base);
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.beginPath();
  const res = await doc.resoudre(p.herite.Resources);
  let contenu = await doc.resoudre(p.dict.get("Contents"));
  if (!Array.isArray(contenu)) contenu = contenu ? [contenu] : [];
  const morceaux = [];
  for (const x of contenu) {
    const f = await doc.resoudre(x);
    if (f instanceof Flux) { try { morceaux.push(await doc.decode(f)); } catch (e) { /* flux abîmé */ } }
  }
  const total = morceaux.reduce((n, m) => n + m.length + 1, 0);
  const octets = new Uint8Array(total);
  let k = 0;
  for (const m of morceaux) { octets.set(m, k); k += m.length; octets[k++] = 10; }
  ctx.save();
  try { await peintre.executer(octets, res); } catch (e) { /* page trop complexe : ce qui est dessiné reste */ }
  ctx.restore();
  if (annotations) { ctx.save(); try { await peintre.annotations(p, res); } catch (e) { /* rien */ } ctx.restore(); }
  return c;
}

/* Une vignette : la page réduite pour tenir dans « cote » × « cote » pixels. */
export async function vignette(doc, index, cote = 160) {
  const pages = await doc.pages();
  const t = await doc.taillePage(pages[index]);
  const echelle = Math.min(cote / t.largeur, cote / t.hauteur) * (globalThis.devicePixelRatio > 1 ? 2 : 1);
  return rendrePage(doc, index, { echelle });
}
