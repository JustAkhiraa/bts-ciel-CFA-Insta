/* Lire un fichier PDF (ISO 32000, § 7.2 à 7.5).

   Un PDF se lit par la FIN : « startxref » donne l'adresse de la table des
   objets (xref), qui donne l'adresse de chaque objet numéroté, et le
   « trailer » dit où est la racine (/Root, le catalogue). Depuis PDF 1.5,
   cette table peut être un flux compressé, et les petits objets peuvent
   être rangés à plusieurs dans un « flux d'objets ». Un fichier modifié
   après coup ajoute une table de plus, chaînée par /Prev : la plus récente
   gagne.

   Une table abîmée ou des adresses fausses (un fichier mal enregistré, un
   téléchargement tronqué) n'arrêtent pas la lecture : on RÉPARE en
   parcourant tout le fichier à la recherche des « n g obj ». */

import { N, Nom, Chaine, Ref, Dict, Flux } from "./objets.js";
import { decoder, inflate, predicteur } from "./filtres.js";
import { Dechiffreur } from "./chiffrement.js";

const BLANC = new Uint8Array(256);
[0, 9, 10, 12, 13, 32].forEach((c) => { BLANC[c] = 1; });
const DELIM = new Uint8Array(256);
"()<>[]{}/%".split("").forEach((c) => { DELIM[c.charCodeAt(0)] = 1; });

export class Mot { constructor(m) { this.mot = m; } }

export class Lexeur {
  constructor(o, pos = 0) { this.o = o; this.pos = pos; }

  passerBlancs() {
    const o = this.o;
    while (this.pos < o.length) {
      const c = o[this.pos];
      if (BLANC[c]) this.pos++;
      else if (c === 0x25) { while (this.pos < o.length && o[this.pos] !== 10 && o[this.pos] !== 13) this.pos++; }
      else break;
    }
  }

  jeton() {
    const o = this.o, debut = this.pos;
    while (this.pos < o.length && !BLANC[o[this.pos]] && !DELIM[o[this.pos]]) this.pos++;
    return String.fromCharCode(...o.subarray(debut, this.pos));
  }

  objet() {
    this.passerBlancs();
    const o = this.o;
    if (this.pos >= o.length) throw new Error("fin de fichier inattendue");
    const c = o[this.pos];
    if (c === 0x2f) { this.pos++; return N(decoderNom(this.jeton())); }
    if (c === 0x28) return this.chaineLitterale();
    if (c === 0x3c) {
      if (o[this.pos + 1] === 0x3c) return this.dictionnaire();
      return this.chaineHex();
    }
    if (c === 0x5b) {
      this.pos++;
      const t = [];
      for (;;) {
        this.passerBlancs();
        if (this.pos >= o.length) throw new Error("tableau non fermé");
        if (o[this.pos] === 0x5d) { this.pos++; return t; }
        const v = this.objet();
        if (v instanceof Mot) { if (v.mot === "R" && t.length >= 2) { const g = t.pop(), n = t.pop(); t.push(new Ref(n, g)); continue; } throw new Error("mot inattendu dans un tableau : " + v.mot); }
        t.push(v);
      }
    }
    if (c === 0x5d || c === 0x3e || c === 0x29 || c === 0x7b || c === 0x7d) { this.pos++; return new Mot(String.fromCharCode(c)); }
    const t = this.jeton();
    if (!t) { this.pos++; return new Mot(String.fromCharCode(c)); }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) {
      const n = parseFloat(t);
      if (/^\d+$/.test(t)) {
        // « 12 0 R » : une référence se reconnaît en lisant deux jetons plus loin
        const garde = this.pos;
        this.passerBlancs();
        const t2 = this.jeton();
        if (/^\d+$/.test(t2)) {
          this.passerBlancs();
          if (o[this.pos] === 0x52 && (this.pos + 1 >= o.length || BLANC[o[this.pos + 1]] || DELIM[o[this.pos + 1]])) { this.pos++; return new Ref(n, +t2); }
        }
        this.pos = garde;
      }
      return n;
    }
    if (t === "true") return true;
    if (t === "false") return false;
    if (t === "null") return null;
    return new Mot(t);
  }

  dictionnaire() {
    this.pos += 2;
    const d = new Dict();
    for (;;) {
      this.passerBlancs();
      if (this.pos >= this.o.length) throw new Error("dictionnaire non fermé");
      if (this.o[this.pos] === 0x3e && this.o[this.pos + 1] === 0x3e) { this.pos += 2; return d; }
      const k = this.objet();
      if (!(k instanceof Nom)) { if (k instanceof Mot && k.mot === ">") continue; throw new Error("clé de dictionnaire attendue"); }
      const v = this.objet();
      if (v instanceof Mot) { if (v.mot === ">") { this.pos--; continue; } throw new Error("valeur attendue pour /" + k.nom); }
      d.set(k.nom, v);
    }
  }

  chaineLitterale() {
    const o = this.o, out = [];
    this.pos++;
    let prof = 1;
    while (this.pos < o.length) {
      const c = o[this.pos++];
      if (c === 0x5c) {
        const n = o[this.pos++];
        const esc = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12, 0x28: 0x28, 0x29: 0x29, 0x5c: 0x5c }[n];
        if (esc !== undefined) out.push(esc);
        else if (n === 13) { if (o[this.pos] === 10) this.pos++; }
        else if (n === 10) { /* suite sur la ligne d'après */ }
        else if (n >= 0x30 && n <= 0x37) {
          let v = n - 0x30;
          for (let k = 0; k < 2 && o[this.pos] >= 0x30 && o[this.pos] <= 0x37; k++) v = v * 8 + (o[this.pos++] - 0x30);
          out.push(v & 255);
        } else out.push(n);
      } else if (c === 0x28) { prof++; out.push(c); }
      else if (c === 0x29) { if (--prof === 0) break; out.push(c); }
      else if (c === 13) { out.push(10); if (o[this.pos] === 10) this.pos++; }
      else out.push(c);
    }
    return new Chaine(Uint8Array.from(out));
  }

  chaineHex() {
    const o = this.o;
    this.pos++;
    const out = [];
    let demi = -1;
    while (this.pos < o.length && o[this.pos] !== 0x3e) {
      const c = o[this.pos++];
      const v = c >= 0x30 && c <= 0x39 ? c - 0x30 : c >= 0x41 && c <= 0x46 ? c - 55 : c >= 0x61 && c <= 0x66 ? c - 87 : -1;
      if (v < 0) continue;
      if (demi < 0) demi = v; else { out.push((demi << 4) | v); demi = -1; }
    }
    this.pos++;
    if (demi >= 0) out.push(demi << 4);
    return new Chaine(Uint8Array.from(out), true);
  }
}

function decoderNom(s) {
  if (!s.includes("#")) return s;
  const octets = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "#" && /^[0-9a-fA-F]{2}$/.test(s.substr(i + 1, 2))) { octets.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else octets.push(s.charCodeAt(i));
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(octets)); }
  catch (e) { return String.fromCharCode(...octets); }
}

/* Chercher une suite d'octets (ASCII) à partir de « depuis ». */
function chercher(o, motif, depuis = 0, fin = o.length) {
  const m = Array.from(motif, (c) => c.charCodeAt(0));
  outer: for (let i = depuis; i <= fin - m.length; i++) {
    for (let k = 0; k < m.length; k++) if (o[i + k] !== m[k]) continue outer;
    return i;
  }
  return -1;
}
function chercherDepuisFin(o, motif, depuis = o.length) {
  const m = Array.from(motif, (c) => c.charCodeAt(0));
  outer: for (let i = Math.min(depuis, o.length - m.length); i >= 0; i--) {
    for (let k = 0; k < m.length; k++) if (o[i + k] !== m[k]) continue outer;
    return i;
  }
  return -1;
}

export class DocumentPdf {
  constructor(octets) {
    this.o = octets;
    this.xref = new Map();         // num → { type: 1, offset, gen } | { type: 2, flux, index }
    this.cache = new Map();
    this.trailer = new Dict();
    this.repare = false;
    this.dechiffreur = null;
    this.version = "1.4";
    this.fluxObjets = new Map();   // num du flux d'objets → objets décodés
  }

  static async ouvrir(octets, { motDePasse = "" } = {}) {
    const d = new DocumentPdf(octets instanceof Uint8Array ? octets : new Uint8Array(octets));
    const v = /%PDF-(\d\.\d)/.exec(String.fromCharCode(...d.o.subarray(0, 1024)));
    if (!v) throw new Error("ce n'est pas un fichier PDF (l'en-tête %PDF manque)");
    d.version = v[1];
    try {
      await d.lireTables();
      if (!d.trailer.get("Root")) throw new Error("pas de /Root");
      await d.obtenir(d.trailer.get("Root").num);
    } catch (e) {
      await d.reparer();
    }
    const enc = d.trailer.get("Encrypt");
    if (enc) {
      const dict = await d.obtenir(enc instanceof Ref ? enc.num : null, enc);
      d.numEncrypt = enc instanceof Ref ? enc.num : -1;
      d.dechiffreur = await Dechiffreur.creer(dict, d.trailer.get("ID"), motDePasse);
      d.cache.clear();
      d.fluxObjets.clear();
    }
    const cat = await d.catalogue();
    if (cat && cat.get("Version") instanceof Nom && cat.get("Version").nom > d.version) d.version = cat.get("Version").nom;
    return d;
  }

  /* ── les tables ── */
  async lireTables() {
    const debut = chercherDepuisFin(this.o, "startxref", this.o.length);
    if (debut < 0) throw new Error("startxref absent");
    const lx = new Lexeur(this.o, debut + 9);
    let offset = lx.objet();
    const vus = new Set();
    let premier = true;
    while (typeof offset === "number" && !vus.has(offset)) {
      vus.add(offset);
      const trailer = await this.lireUneTable(offset);
      if (premier) { this.trailer = trailer; premier = false; }
      else for (const [k, v] of trailer) if (!this.trailer.has(k)) this.trailer.set(k, v);
      const stm = trailer.get("XRefStm");
      if (typeof stm === "number" && !vus.has(stm)) { vus.add(stm); await this.lireUneTable(stm); }
      offset = trailer.get("Prev");
    }
  }
  poser(num, entree) {
    const avant = this.xref.get(num);
    if (!avant || avant.type === 0) this.xref.set(num, entree);
  }
  async lireUneTable(offset) {
    const lx = new Lexeur(this.o, offset);
    lx.passerBlancs();
    if (chercher(this.o, "xref", lx.pos, lx.pos + 4) === lx.pos) {
      lx.pos += 4;
      for (;;) {
        lx.passerBlancs();
        if (chercher(this.o, "trailer", lx.pos, lx.pos + 7) === lx.pos) { lx.pos += 7; break; }
        const debut = lx.objet(), nb = lx.objet();
        if (typeof debut !== "number" || typeof nb !== "number") throw new Error("table xref illisible");
        for (let i = 0; i < nb; i++) {
          const off = lx.objet(), gen = lx.objet(), t = lx.objet();
          if (!(t instanceof Mot)) throw new Error("entrée xref illisible");
          // l'objet 0 est toujours libre : une table qui commence à 1 par erreur se corrige
          const num = debut + i;
          if (t.mot === "n" && off > 0) this.poser(num, { type: 1, offset: off, gen });
          else this.poser(num, { type: 0 });
        }
      }
      const tr = lx.objet();
      if (!(tr instanceof Dict)) throw new Error("trailer illisible");
      return tr;
    }
    // un flux xref (PDF 1.5) : « n g obj << /Type /XRef … >> stream »
    const obj = this.lireIndirect(offset);
    if (!(obj.valeur instanceof Flux) || obj.valeur.dict.type() !== "XRef") throw new Error("table xref introuvable à " + offset);
    const f = obj.valeur, d = f.dict;
    const octets = (await decoder(f)).octets;
    const W = d.get("W"), taille = d.get("Size");
    const index = d.get("Index") || [0, taille];
    const largeur = W[0] + W[1] + W[2];
    let p = 0;
    const lire = (n, defaut) => { if (!n) return defaut; let v = 0; for (let i = 0; i < n; i++) v = v * 256 + octets[p++]; return v; };
    for (let s = 0; s < index.length; s += 2) {
      for (let i = 0; i < index[s + 1]; i++) {
        if (p + largeur > octets.length) break;
        const type = lire(W[0], 1), a = lire(W[1], 0), b = lire(W[2], 0);
        const num = index[s] + i;
        if (type === 1) this.poser(num, { type: 1, offset: a, gen: b });
        else if (type === 2) this.poser(num, { type: 2, flux: a, index: b });
        else this.poser(num, { type: 0 });
      }
    }
    return d;
  }

  /* ── un objet indirect « n g obj … endobj » à une adresse ── */
  lireIndirect(offset, longueurs = null) {
    const lx = new Lexeur(this.o, offset);
    const num = lx.objet(), gen = lx.objet(), mot = lx.objet();
    if (typeof num !== "number" || typeof gen !== "number" || !(mot instanceof Mot) || mot.mot !== "obj") throw new Error("objet attendu à " + offset);
    let valeur = lx.objet();
    if (valeur instanceof Mot && valeur.mot === "endobj") valeur = null;
    lx.passerBlancs();
    if (valeur instanceof Dict && chercher(this.o, "stream", lx.pos, lx.pos + 6) === lx.pos) {
      let p = lx.pos + 6;
      if (this.o[p] === 13) p++;
      if (this.o[p] === 10) p++;
      let lg = valeur.get("Length");
      if (lg instanceof Ref) lg = longueurs ? longueurs(lg) : null;
      let fin = typeof lg === "number" ? p + lg : -1;
      // une longueur fausse est fréquente : on vérifie qu'« endstream » suit bien
      const apres = fin >= 0 ? chercher(this.o, "endstream", fin, Math.min(this.o.length, fin + 30)) : -1;
      if (apres < 0) {
        const e = chercher(this.o, "endstream", p);
        if (e < 0) throw new Error("flux sans fin");
        fin = e;
        while (fin > p && (this.o[fin - 1] === 10 || this.o[fin - 1] === 13)) fin--;
      }
      valeur = new Flux(valeur, this.o.subarray(p, fin));
    }
    return { num, gen, valeur };
  }

  /* ── obtenir un objet par son numéro ── */
  async obtenir(num, direct = undefined) {
    if (direct !== undefined && num === null) return direct;
    if (this.cache.has(num)) return this.cache.get(num);
    const e = this.xref.get(num);
    let v = null;
    if (e && e.type === 1) {
      const longueur = (ref) => {
        const ent = this.xref.get(ref.num);
        if (!ent || ent.type !== 1) return null;
        try { const x = this.lireIndirect(ent.offset).valeur; return typeof x === "number" ? x : null; } catch (err) { return null; }
      };
      const lu = this.lireIndirect(e.offset, longueur);
      v = lu.valeur;
      if (this.dechiffreur && num !== this.numEncrypt) v = await this.dechiffreur.objet(v, num, lu.gen);
    } else if (e && e.type === 2) {
      const objets = await this.lireFluxObjets(e.flux);
      v = objets.get(num) ?? null;
    }
    this.cache.set(num, v);
    return v;
  }
  async resoudre(v) { return v instanceof Ref ? this.obtenir(v.num) : v; }

  async lireFluxObjets(numFlux) {
    if (this.fluxObjets.has(numFlux)) return this.fluxObjets.get(numFlux);
    const f = await this.obtenir(numFlux);
    const out = new Map();
    this.fluxObjets.set(numFlux, out);
    if (!(f instanceof Flux)) return out;
    const octets = (await decoder(f)).octets;
    const n = f.dict.get("N"), premier = f.dict.get("First");
    const lx = new Lexeur(octets, 0);
    const entete = [];
    for (let i = 0; i < n; i++) entete.push([lx.objet(), lx.objet()]);
    for (const [num, off] of entete) {
      try { const l = new Lexeur(octets, premier + off); out.set(num, l.objet()); } catch (e) { /* objet illisible : ignoré */ }
    }
    return out;
  }

  /* Le contenu décodé d'un flux (déjà déchiffré par obtenir). */
  async decode(f) { return (await decoder(f)).octets; }

  /* ── la réparation : tout le fichier parcouru ── */
  async reparer() {
    this.repare = true;
    this.xref = new Map();
    this.cache.clear();
    const o = this.o;
    const texte = new TextDecoder("latin1").decode(o);
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    const trouves = [];
    while ((m = re.exec(texte))) {
      // l'objet doit commencer une ligne (ou suivre un délimiteur)
      const avant = m.index > 0 ? o[m.index - 1] : 10;
      if (!BLANC[avant] && !DELIM[avant] && avant !== 0x3e) continue;
      trouves.push({ num: +m[1], gen: +m[2], offset: m.index });
    }
    for (const t of trouves) this.xref.set(t.num, { type: 1, offset: t.offset, gen: t.gen });   // la dernière définition gagne
    // les objets rangés dans des flux d'objets
    for (const t of trouves) {
      let v;
      try { v = this.lireIndirect(t.offset).valeur; } catch (e) { continue; }
      if (v instanceof Flux && v.dict.type() === "ObjStm") {
        try {
          const octets = (await decoder(v)).octets, n = v.dict.get("N");
          const lx = new Lexeur(octets, 0);
          for (let i = 0; i < n; i++) { const num = lx.objet(); lx.objet(); if (!this.xref.has(num)) this.xref.set(num, { type: 2, flux: t.num, index: i }); }
        } catch (e) { /* flux d'objets illisible */ }
      }
    }
    // le trailer : le dernier « trailer » lisible, ou le dernier flux XRef, sinon le catalogue trouvé
    this.trailer = new Dict();
    let pos = texte.lastIndexOf("trailer");
    while (pos >= 0) {
      try { const d = new Lexeur(o, pos + 7).objet(); if (d instanceof Dict && d.get("Root")) { this.trailer = d; break; } } catch (e) { /* le précédent */ }
      pos = texte.lastIndexOf("trailer", pos - 1);
    }
    if (!this.trailer.get("Root")) {
      for (const t of trouves.slice().reverse()) {
        let v;
        try { v = await this.obtenir(t.num); } catch (e) { continue; }
        const d = v instanceof Flux ? v.dict : v;
        if (d instanceof Dict && d.type() === "XRef" && d.get("Root")) { for (const [k, x] of d) if (["Root", "Info", "ID", "Encrypt"].includes(k)) this.trailer.set(k, x); break; }
      }
    }
    if (!this.trailer.get("Root")) {
      for (const [num] of this.xref) {
        let v;
        try { v = await this.obtenir(num); } catch (e) { continue; }
        if (v instanceof Dict && v.type() === "Catalog") { this.trailer.set("Root", new Ref(num, 0)); break; }
      }
    }
    if (!this.trailer.get("Root")) throw new Error("fichier PDF trop abîmé : impossible de retrouver ses pages");
  }

  /* ── le catalogue, les pages ── */
  async catalogue() { return this.resoudre(this.trailer.get("Root")); }
  async info() { return this.resoudre(this.trailer.get("Info")); }

  /* Les pages, dans l'ordre, avec ce qu'elles héritent de leurs parents. */
  async pages() {
    if (this.pagesCache) return this.pagesCache;
    const cat = await this.catalogue();
    const out = [];
    const vus = new Set();
    const parcourir = async (ref, herite) => {
      const cle = ref instanceof Ref ? ref.num : null;
      if (cle !== null) { if (vus.has(cle)) return; vus.add(cle); }
      const n = await this.resoudre(ref);
      if (!(n instanceof Dict)) return;
      const h = { ...herite };
      for (const k of ["Resources", "MediaBox", "CropBox", "Rotate"]) if (n.has(k)) h[k] = n.get(k);
      const kids = await this.resoudre(n.get("Kids"));
      if (n.type() === "Pages" || (Array.isArray(kids) && n.type() !== "Page")) {
        for (const k of kids || []) await parcourir(k, h);
      } else {
        out.push({ ref: ref instanceof Ref ? ref : null, dict: n, herite: h });
      }
    };
    if (cat) await parcourir(cat.get("Pages"), {});
    this.pagesCache = out;
    return out;
  }

  /* La taille visible d'une page, en points (1/72 de pouce), rotation comprise. */
  async taillePage(p) {
    const boite = (await this.resoudre(p.herite.CropBox)) || (await this.resoudre(p.herite.MediaBox)) || [0, 0, 612, 792];
    const b = await Promise.all(boite.map((x) => this.resoudre(x)));
    let w = Math.abs(b[2] - b[0]), h = Math.abs(b[3] - b[1]);
    const r = ((((await this.resoudre(p.herite.Rotate)) || 0) % 360) + 360) % 360;
    if (r === 90 || r === 270) [w, h] = [h, w];
    return { largeur: w, hauteur: h, rotation: r, boite: b };
  }
}

export { inflate, predicteur };
