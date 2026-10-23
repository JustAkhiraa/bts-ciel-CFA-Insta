/* Les polices d'un PDF, vues par le moteur de rendu (ISO 32000, § 9).

   Un PDF n'écrit pas des lettres mais des CODES (un octet, ou deux pour
   les polices « composites »). Pour dessiner, il faut savoir pour chaque
   code :
     · sa LARGEUR (où poser le caractère suivant) — /Widths, /W, ou les
       métriques des 14 polices standard ;
     · son DESSIN — si la police TrueType est embarquée (/FontFile2), on
       lit ses contours (tables glyf, loca, cmap) et on les trace tels
       quels ; sinon on écrit le caractère Unicode avec une police du
       système de la même famille (avec ou sans empattement, à chasse fixe) ;
     · le caractère Unicode — /ToUnicode, ou l'encodage et ses noms de
       glyphes (« eacute » → é).
   Rien d'autre ne sert ici : ce module ne dépend pas du navigateur. */

import { Nom, Chaine, Dict, Flux, Ref } from "./objets.js";
import { Lexeur, Mot } from "./lecture.js";
import { largeurTexte } from "./police.js";

/* ── les encodages de base ── */
// WinAnsi = Latin-1, sauf 0x80–0x9F (écrits ici : certains TextDecoder
// « windows-1252 » y rendent les caractères de contrôle de Latin-1)
const WIN = Array.from({ length: 256 }, (_, i) => String.fromCharCode(i));
"€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ".split("").forEach((c, i) => { WIN[0x80 + i] = c; });
const decMac = new TextDecoder("macintosh");
const MAC = Array.from({ length: 256 }, (_, i) => decMac.decode(Uint8Array.of(i)));
const STANDARD = WIN.slice();
STANDARD[0x27] = "’"; STANDARD[0x60] = "‘";
for (let i = 0x80; i < 256; i++) STANDARD[i] = "";
Object.entries({ 0xa1: "¡", 0xa2: "¢", 0xa3: "£", 0xa4: "⁄", 0xa5: "¥", 0xa6: "ƒ", 0xa7: "§", 0xa8: "¤", 0xa9: "'", 0xaa: "“", 0xab: "«", 0xac: "‹", 0xad: "›",
  0xae: "ﬁ", 0xaf: "ﬂ", 0xb1: "–", 0xb2: "†", 0xb3: "‡", 0xb4: "·", 0xb6: "¶", 0xb7: "•", 0xb8: "‚", 0xb9: "„", 0xba: "”", 0xbb: "»", 0xbc: "…", 0xbd: "‰",
  0xbf: "¿", 0xc1: "`", 0xc2: "´", 0xc3: "ˆ", 0xc4: "˜", 0xc5: "¯", 0xc6: "˘", 0xc7: "˙", 0xc8: "¨", 0xca: "˚", 0xcb: "¸", 0xcd: "˝", 0xce: "˛", 0xcf: "ˇ",
  0xd0: "—", 0xe1: "Æ", 0xe3: "ª", 0xe8: "Ł", 0xe9: "Ø", 0xea: "Œ", 0xeb: "º", 0xf1: "æ", 0xf5: "ı", 0xf8: "ł", 0xf9: "ø", 0xfa: "œ", 0xfb: "ß" })
  .forEach(([k, v]) => { STANDARD[k] = v; });
const SYMBOLE = WIN.slice(0, 128).map((c) => c);
"ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ".split("").forEach((c, i) => { SYMBOLE[0x41 + i] = c; });
"αβχδεφγηιϕκλμνοπθρστυϖωξψζ".split("").forEach((c, i) => { SYMBOLE[0x61 + i] = c; });
Object.entries({ 0x22: "∀", 0x24: "∃", 0x27: "∋", 0x2a: "∗", 0x2d: "−", 0x40: "≅", 0x5c: "∴", 0x5e: "⊥", 0xa3: "≤", 0xa5: "∞", 0xa7: "♣", 0xa8: "♦", 0xa9: "♥", 0xaa: "♠",
  0xab: "↔", 0xac: "←", 0xad: "↑", 0xae: "→", 0xaf: "↓", 0xb0: "°", 0xb1: "±", 0xb3: "≥", 0xb4: "×", 0xb5: "∝", 0xb6: "∂", 0xb7: "•", 0xb8: "÷", 0xb9: "≠", 0xba: "≡",
  0xbb: "≈", 0xbc: "…", 0xc4: "⊗", 0xc5: "⊕", 0xc6: "∅", 0xc7: "∩", 0xc8: "∪", 0xc9: "⊃", 0xca: "⊇", 0xcb: "⊄", 0xcc: "⊂", 0xcd: "⊆", 0xce: "∈", 0xcf: "∉",
  0xd0: "∠", 0xd1: "∇", 0xd5: "∏", 0xd6: "√", 0xd7: "⋅", 0xd8: "¬", 0xd9: "∧", 0xda: "∨", 0xdb: "⇔", 0xdc: "⇐", 0xdd: "⇑", 0xde: "⇒", 0xdf: "⇓", 0xe0: "◊",
  0xe5: "∑", 0xf2: "∫" }).forEach(([k, v]) => { SYMBOLE[k] = v; });
// ZapfDingbats (les cases cochées des formulaires : « 4 » = ✔) : le bloc
// Unicode des Dingbats a été calqué sur elle, à quelques exceptions près
const DINGBATS_HORS = { 0x20: " ", 0x25: "☎", 0x2a: "☛", 0x2b: "☞", 0x48: "★", 0x6c: "●", 0x6e: "■", 0x73: "▲", 0x74: "▼", 0x75: "◆", 0x77: "◗", 0xa8: "♣", 0xa9: "♦", 0xaa: "♥", 0xab: "♠" };
const dingbat = (c) => DINGBATS_HORS[c] || (c > 0x20 && c < 0x7f ? String.fromCharCode(0x2700 + c - 0x20) : c >= 0xa1 && c <= 0xfe ? String.fromCharCode(0x2761 + c - 0xa1) : "");
// Wingdings, la police des puces de Word : les quelques codes qui servent
const WINGDINGS = { 0x6c: "●", 0x6e: "■", 0x6f: "□", 0x71: "❑", 0x76: "❖", 0xa7: "▪", 0xa8: "◻", 0xd8: "➢", 0xe0: "→", 0xe8: "➔", 0xef: "⇦", 0xf0: "⇨", 0xfb: "✗", 0xfc: "✓", 0xfe: "☑" };

/* ── les noms de glyphes ── */
const NOMS = {
  space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$", percent: "%", ampersand: "&", quotesingle: "'", quoteright: "’", quoteleft: "‘",
  parenleft: "(", parenright: ")", asterisk: "*", plus: "+", comma: ",", hyphen: "-", period: ".", slash: "/", colon: ":", semicolon: ";", less: "<", equal: "=",
  greater: ">", question: "?", at: "@", bracketleft: "[", backslash: "\\", bracketright: "]", asciicircum: "^", underscore: "_", grave: "`", braceleft: "{", bar: "|",
  braceright: "}", asciitilde: "~", zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  exclamdown: "¡", cent: "¢", sterling: "£", currency: "¤", yen: "¥", brokenbar: "¦", section: "§", dieresis: "¨", copyright: "©", ordfeminine: "ª",
  guillemotleft: "«", guillemetleft: "«", logicalnot: "¬", registered: "®", macron: "¯", degree: "°", plusminus: "±", twosuperior: "²", threesuperior: "³", acute: "´",
  mu: "µ", paragraph: "¶", periodcentered: "·", cedilla: "¸", onesuperior: "¹", ordmasculine: "º", guillemotright: "»", guillemetright: "»", onequarter: "¼",
  onehalf: "½", threequarters: "¾", questiondown: "¿", AE: "Æ", ae: "æ", Eth: "Ð", eth: "ð", multiply: "×", divide: "÷", Oslash: "Ø", oslash: "ø", Thorn: "Þ",
  thorn: "þ", germandbls: "ß", Euro: "€", quotesinglbase: "‚", florin: "ƒ", quotedblbase: "„", ellipsis: "…", dagger: "†", daggerdbl: "‡", circumflex: "ˆ",
  perthousand: "‰", guilsinglleft: "‹", guilsinglright: "›", OE: "Œ", oe: "œ", quotedblleft: "“", quotedblright: "”", bullet: "•", endash: "–", emdash: "—",
  tilde: "˜", trademark: "™", fi: "ﬁ", fl: "ﬂ", ff: "ﬀ", ffi: "ﬃ", ffl: "ﬄ", dotlessi: "ı", dotlessj: "ȷ", Lslash: "Ł", lslash: "ł", minus: "−", fraction: "⁄",
  nbspace: " ", nonbreakingspace: " ", sfthyphen: "­", softhyphen: "­", breve: "˘", dotaccent: "˙", ring: "˚", ogonek: "˛", caron: "ˇ", hungarumlaut: "˝",
  arrowright: "→", arrowleft: "←", arrowup: "↑", arrowdown: "↓", infinity: "∞", lessequal: "≤", greaterequal: "≥", notequal: "≠", approxequal: "≈", Omega: "Ω",
  Delta: "Δ", pi: "π", alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", lambda: "λ", sigma: "σ", theta: "θ", omega: "ω", summation: "∑", radical: "√",
  integral: "∫", partialdiff: "∂", lozenge: "◊", dcroat: "đ", Dcroat: "Đ", napostrophe: "ŉ", visiblespace: "␣", quotedblbase1: "„",
};
const ACCENTS = { grave: "̀", acute: "́", circumflex: "̂", tilde: "̃", macron: "̄", breve: "̆", dotaccent: "̇", dieresis: "̈",
  ring: "̊", hungarumlaut: "̋", caron: "̌", cedilla: "̧", ogonek: "̨", commaaccent: "̦" };
const RE_ACCENT = new RegExp("^([A-Za-z])(" + Object.keys(ACCENTS).join("|") + ")$");

export function unicodeDuNom(nom) {
  if (!nom) return "";
  if (NOMS[nom] !== undefined) return NOMS[nom];
  if (/^[A-Za-z]$/.test(nom)) return nom;
  let m = RE_ACCENT.exec(nom);
  if (m) return (m[1] + ACCENTS[m[2]]).normalize("NFC");
  m = /^uni([0-9A-Fa-f]{4})+$/.exec(nom);
  if (m) { let s = ""; for (let i = 3; i < nom.length; i += 4) s += String.fromCharCode(parseInt(nom.substr(i, 4), 16)); return s; }
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(nom);
  if (m) { const c = parseInt(m[1], 16); return c <= 0x10ffff ? String.fromCodePoint(c) : ""; }
  const p = nom.indexOf(".");                  // « a.sc », « one.oldstyle » : la variante d'une lettre
  if (p > 0) return unicodeDuNom(nom.slice(0, p));
  if (nom.includes("_")) return nom.split("_").map(unicodeDuNom).join("");
  return "";
}

/* ── les CMap (ToUnicode et encodages des polices composites) ── */
/* Le flux CMap est du PostScript ; on n'en lit que les sections utiles :
   codespacerange (la longueur des codes), bfchar/bfrange (→ Unicode),
   cidchar/cidrange (→ CID). */
export function lireCMap(octets) {
  const lx = new Lexeur(octets);
  const espaces = [], uni = new Map(), cids = [], cid1 = new Map();
  const texte = (c) => {
    if (!(c instanceof Chaine)) return "";
    const o = c.octets;
    let s = "";
    for (let i = 0; i + 1 < o.length; i += 2) s += String.fromCharCode((o[i] << 8) | o[i + 1]);
    if (o.length === 1) s = String.fromCharCode(o[0]);
    return s;
  };
  const code = (c) => { let v = 0; for (const b of c.octets) v = v * 256 + b; return v; };
  const pile = [];
  let usecmap = null;
  for (let garde = 0; garde < 2e6; garde++) {
    let v;
    try { lx.passerBlancs(); if (lx.pos >= octets.length) break; v = lx.objet(); } catch (e) { break; }
    if (!(v instanceof Mot)) { pile.push(v); continue; }
    const mot = v.mot;
    if (mot === "endcodespacerange") {
      for (let i = 0; i + 1 < pile.length; i += 2) if (pile[i] instanceof Chaine) espaces.push({ n: pile[i].octets.length, bas: code(pile[i]), haut: code(pile[i + 1]) });
    } else if (mot === "endbfchar") {
      for (let i = 0; i + 1 < pile.length; i += 2) if (pile[i] instanceof Chaine) uni.set(code(pile[i]), pile[i + 1] instanceof Nom ? unicodeDuNom(pile[i + 1].nom) : texte(pile[i + 1]));
    } else if (mot === "endbfrange") {
      for (let i = 0; i + 2 < pile.length; i += 3) {
        const a = code(pile[i]), b = code(pile[i + 1]), d = pile[i + 2];
        if (b - a > 65535) continue;
        if (Array.isArray(d)) { for (let k = 0; k <= b - a && k < d.length; k++) uni.set(a + k, texte(d[k])); }
        else if (d instanceof Chaine) {
          const s = texte(d);
          for (let k = 0; k <= b - a; k++) uni.set(a + k, s.slice(0, -1) + String.fromCharCode(s.charCodeAt(s.length - 1) + k));
        }
      }
    } else if (mot === "endcidrange") {
      for (let i = 0; i + 2 < pile.length; i += 3) cids.push({ bas: code(pile[i]), haut: code(pile[i + 1]), cid: pile[i + 2] });
    } else if (mot === "endcidchar") {
      for (let i = 0; i + 1 < pile.length; i += 2) cid1.set(code(pile[i]), pile[i + 1]);
    } else if (mot === "usecmap") {
      const n = pile[pile.length - 1];
      if (n instanceof Nom) usecmap = n.nom;
    }
    if (mot.startsWith("begin") || mot.startsWith("end") || mot === "def" || mot === "usecmap") pile.length = 0;
  }
  return { espaces, uni, cids, cid1, usecmap };
}

/* ── TrueType : lire les contours des glyphes ── */
export class TrueType {
  constructor(o) {
    this.o = o;
    const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
    this.v = v;
    let base = 0;
    if (v.getUint32(0) === 0x74746366) base = v.getUint32(12);            // « ttcf » : la première police de la collection
    const n = v.getUint16(base + 4);
    this.tables = {};
    for (let i = 0; i < n; i++) {
      const p = base + 12 + 16 * i;
      const tag = String.fromCharCode(o[p], o[p + 1], o[p + 2], o[p + 3]);
      this.tables[tag] = { offset: v.getUint32(p + 8), longueur: v.getUint32(p + 12) };
    }
    const head = this.tables.head, maxp = this.tables.maxp;
    if (!head || !this.tables.glyf || !this.tables.loca) throw new Error("police TrueType sans contours");
    this.upem = v.getUint16(head.offset + 18) || 1000;
    this.locaLong = v.getInt16(head.offset + 50) === 1;
    this.nbGlyphes = maxp ? v.getUint16(maxp.offset + 4) : 65535;
    this.cache = new Map();
    this.cmaps = this.lireCmaps();
  }

  lireCmaps() {
    const t = this.tables.cmap;
    if (!t) return [];
    const v = this.v, out = [];
    const n = v.getUint16(t.offset + 2);
    for (let i = 0; i < n; i++) {
      const p = t.offset + 4 + 8 * i;
      const plateforme = v.getUint16(p), encodage = v.getUint16(p + 2), off = t.offset + v.getUint32(p + 4);
      if (off + 2 > this.o.length) continue;
      const format = v.getUint16(off);
      out.push({ plateforme, encodage, format, off });
    }
    return out;
  }
  /* Chercher un code dans une table cmap : le numéro de glyphe, ou 0. */
  dansCmap(c, code) {
    const v = this.v, p = c.off;
    try {
      if (c.format === 0) return code < 256 ? this.o[p + 6 + code] : 0;
      if (c.format === 4) {
        const n = v.getUint16(p + 6) / 2;
        const fins = p + 14, debuts = fins + 2 * n + 2, deltas = debuts + 2 * n, ranges = deltas + 2 * n;
        let a = 0, b = n - 1;
        while (a <= b) {
          const m = (a + b) >> 1;
          const fin = v.getUint16(fins + 2 * m), debut = v.getUint16(debuts + 2 * m);
          if (code > fin) a = m + 1;
          else if (code < debut) b = m - 1;
          else {
            const delta = v.getUint16(deltas + 2 * m), ro = v.getUint16(ranges + 2 * m);
            if (!ro) return (code + delta) & 0xffff;
            const g = v.getUint16(ranges + 2 * m + ro + 2 * (code - debut));
            return g ? (g + delta) & 0xffff : 0;
          }
        }
        return 0;
      }
      if (c.format === 6) {
        const premier = v.getUint16(p + 6), n = v.getUint16(p + 8);
        return code >= premier && code < premier + n ? v.getUint16(p + 10 + 2 * (code - premier)) : 0;
      }
      if (c.format === 12) {
        const n = v.getUint32(p + 12);
        let a = 0, b = n - 1;
        while (a <= b) {
          const m = (a + b) >> 1, q = p + 16 + 12 * m;
          const debut = v.getUint32(q), fin = v.getUint32(q + 4);
          if (code > fin) a = m + 1; else if (code < debut) b = m - 1; else return v.getUint32(q + 8) + code - debut;
        }
      }
    } catch (e) { /* table abîmée */ }
    return 0;
  }
  cmap(plateforme, encodage) { return this.cmaps.find((c) => c.plateforme === plateforme && c.encodage === encodage); }

  /* Les contours d'un glyphe, en unités de la police : une liste
     d'ordres ["M", x, y] ["L", x, y] ["Q", cx, cy, x, y] ["Z"]. */
  contours(gid, prof = 0) {
    if (this.cache.has(gid)) return this.cache.get(gid);
    let r = [];
    try { r = this.lireGlyphe(gid, prof); } catch (e) { r = []; }
    this.cache.set(gid, r);
    return r;
  }
  lireGlyphe(gid, prof) {
    if (gid < 0 || gid >= this.nbGlyphes || prof > 6) return [];
    const v = this.v, loca = this.tables.loca.offset, glyf = this.tables.glyf.offset;
    const a = this.locaLong ? v.getUint32(loca + 4 * gid) : v.getUint16(loca + 2 * gid) * 2;
    const b = this.locaLong ? v.getUint32(loca + 4 * gid + 4) : v.getUint16(loca + 2 * gid + 2) * 2;
    if (b <= a) return [];
    let p = glyf + a;
    const nc = v.getInt16(p);
    p += 10;
    if (nc < 0) return this.composite(p, prof);
    const fins = [];
    for (let i = 0; i < nc; i++) fins.push(v.getUint16(p + 2 * i));
    p += 2 * nc;
    p += 2 + v.getUint16(p);                                            // les instructions de hinting : sautées
    const n = nc ? fins[nc - 1] + 1 : 0;
    const drapeaux = new Uint8Array(n);
    for (let i = 0; i < n;) {
      const f = this.o[p++];
      drapeaux[i++] = f;
      if (f & 8) { let r = this.o[p++]; while (r-- > 0 && i < n) drapeaux[i++] = f; }
    }
    const xs = new Int32Array(n), ys = new Int32Array(n);
    let x = 0;
    for (let i = 0; i < n; i++) {
      const f = drapeaux[i];
      if (f & 2) { const d = this.o[p++]; x += f & 16 ? d : -d; }
      else if (!(f & 16)) { x += v.getInt16(p); p += 2; }
      xs[i] = x;
    }
    let y = 0;
    for (let i = 0; i < n; i++) {
      const f = drapeaux[i];
      if (f & 4) { const d = this.o[p++]; y += f & 32 ? d : -d; }
      else if (!(f & 32)) { y += v.getInt16(p); p += 2; }
      ys[i] = y;
    }
    const out = [];
    let debut = 0;
    for (const fin of fins) {
      const pts = [];
      for (let i = debut; i <= fin; i++) pts.push({ x: xs[i], y: ys[i], sur: (drapeaux[i] & 1) === 1 });
      debut = fin + 1;
      if (!pts.length) continue;
      // le premier point « sur la courbe » ; sinon le milieu des deux premiers
      let k = pts.findIndex((q) => q.sur);
      let depart;
      if (k < 0) { depart = { x: (pts[0].x + pts[1 % pts.length].x) / 2, y: (pts[0].y + pts[1 % pts.length].y) / 2, sur: true }; k = 0; pts.splice(1, 0, depart); k = 1; }
      else depart = pts[k];
      out.push(["M", depart.x, depart.y]);
      let ctrl = null;
      for (let j = 1; j <= pts.length; j++) {
        const q = pts[(k + j) % pts.length];
        if (q.sur) {
          if (ctrl) { out.push(["Q", ctrl.x, ctrl.y, q.x, q.y]); ctrl = null; } else out.push(["L", q.x, q.y]);
        } else {
          if (ctrl) { const mx = (ctrl.x + q.x) / 2, my = (ctrl.y + q.y) / 2; out.push(["Q", ctrl.x, ctrl.y, mx, my]); }
          ctrl = q;
        }
      }
      if (ctrl) out.push(["Q", ctrl.x, ctrl.y, depart.x, depart.y]);
      out.push(["Z"]);
    }
    return out;
  }
  composite(p, prof) {
    const v = this.v, out = [];
    for (let garde = 0; garde < 64; garde++) {
      const f = v.getUint16(p), g = v.getUint16(p + 2);
      p += 4;
      let dx, dy;
      if (f & 1) { dx = v.getInt16(p); dy = v.getInt16(p + 2); p += 4; }
      else { dx = v.getInt8(p); dy = v.getInt8(p + 1); p += 2; }
      if (!(f & 2)) { dx = 0; dy = 0; }                                     // points accrochés : rare, on les ignore
      let a = 1, b = 0, c = 0, d = 1;
      const f2 = (q) => v.getInt16(q) / 16384;
      if (f & 8) { a = d = f2(p); p += 2; }
      else if (f & 0x40) { a = f2(p); d = f2(p + 2); p += 4; }
      else if (f & 0x80) { a = f2(p); b = f2(p + 2); c = f2(p + 4); d = f2(p + 6); p += 8; }
      for (const cmd of this.contours(g, prof + 1)) {
        if (cmd[0] === "Z") { out.push(cmd); continue; }
        const t = [cmd[0]];
        for (let i = 1; i < cmd.length; i += 2) t.push(a * cmd[i] + c * cmd[i + 1] + dx, b * cmd[i] + d * cmd[i + 1] + dy);
        out.push(t);
      }
      if (!(f & 0x20)) break;
    }
    return out;
  }
}

/* ── une police du PDF, prête à dessiner ── */
const famille = (nom, desc) => {
  const n = (nom || "").replace(/^[A-Z]{6}\+/, "");
  const fl = desc ? desc.flags || 0 : 0;
  const mono = /courier|mono|consol|typewriter|cmtt|lucidaconsole/i.test(n) || (fl & 1) === 1;
  const serif = !mono && (/times|serif|roman|georgia|garamond|cambria|book|palatino|minion|cmr|cmmi|lmroman|century|charter|caslon/i.test(n) && !/sans/i.test(n) || (fl & 2) === 2);
  return {
    css: mono ? '"Courier New", "Liberation Mono", Courier, monospace' : serif ? '"Times New Roman", "Liberation Serif", Times, serif' : 'Arial, "Liberation Sans", Helvetica, sans-serif',
    gras: /bold|black|heavy|semibold|demi/i.test(n) || (desc && desc.poids >= 600) || (fl & 0x40000) !== 0,
    italique: /italic|oblique|slanted|cmti|cmmi/i.test(n) || (desc && desc.angle !== 0) || (fl & 0x40) !== 0,
    mono,
  };
};

/* Lire une police : { type, composite, largeur(code), unicode(code),
   codes(octets) → [code…], glyphe(code) → contours | null, upem, matrice, css… } */
export async function chargerPolice(doc, dict) {
  const r = (x) => doc.resoudre(x);
  const nomType = (x) => (x instanceof Nom ? x.nom : null);
  const sousType = nomType(await r(dict.get("Subtype")));
  const nomPolice = nomType(await r(dict.get("BaseFont"))) || "";
  const p = { sousType, nom: nomPolice, composite: sousType === "Type0", matrice: null, upem: 1000 };
  let descendante = null;
  if (p.composite) {
    const ds = await r(dict.get("DescendantFonts"));
    descendante = Array.isArray(ds) ? await r(ds[0]) : null;
  }
  const fdict = descendante || dict;
  const fd = await r(fdict.get("FontDescriptor"));
  const desc = fd instanceof Dict ? { flags: (await r(fd.get("Flags"))) | 0, poids: (await r(fd.get("FontWeight"))) || 0, angle: (await r(fd.get("ItalicAngle"))) || 0,
    manque: (await r(fd.get("MissingWidth"))) || 0 } : null;
  Object.assign(p, famille(nomPolice || nomType(await r(fdict.get("BaseFont"))), desc));
  const symbolique = desc ? (desc.flags & 4) !== 0 : /symbol|dingbat|wingding/i.test(nomPolice);

  // l'Unicode : /ToUnicode d'abord
  let versUni = null;
  const tu = await r(dict.get("ToUnicode"));
  if (tu instanceof Flux) { try { versUni = lireCMap(await doc.decode(tu)).uni; } catch (e) { versUni = null; } }

  if (p.composite) {
    // les codes → CID : Identity-H (2 octets, CID = code) ou une CMap embarquée
    const enc = await r(dict.get("Encoding"));
    let cmap = null;
    if (enc instanceof Flux) { try { cmap = lireCMap(await doc.decode(enc)); } catch (e) { cmap = null; } }
    const espaces = cmap && cmap.espaces.length ? cmap.espaces : [{ n: 2, bas: 0, haut: 0xffff }];
    p.codes = (o) => {
      const out = [];
      for (let i = 0; i < o.length;) {
        let pris = false;
        for (let n = 1; n <= 4 && !pris; n++) {
          if (i + n > o.length) break;
          let c = 0;
          for (let k = 0; k < n; k++) c = c * 256 + o[i + k];
          if (espaces.some((e) => e.n === n && c >= e.bas && c <= e.haut)) { out.push(c); i += n; pris = true; }
        }
        if (!pris) { out.push(o[i]); i++; }
      }
      return out;
    };
    p.cid = (c) => {
      if (!cmap || (!cmap.cids.length && !cmap.cid1.size)) return c;
      if (cmap.cid1.has(c)) return cmap.cid1.get(c);
      for (const g of cmap.cids) if (c >= g.bas && c <= g.haut) return g.cid + c - g.bas;
      return 0;
    };
    // les largeurs : /W [c [w…]] ou [c1 c2 w], /DW
    const dw = (await r(descendante && descendante.get("DW"))) ?? 1000;
    const larg = new Map();
    const W = await r(descendante && descendante.get("W"));
    if (Array.isArray(W)) {
      for (let i = 0; i < W.length;) {
        const a = await r(W[i]), b = await r(W[i + 1]);
        if (Array.isArray(b)) { for (let k = 0; k < b.length; k++) larg.set(a + k, await r(b[k])); i += 2; }
        else { const w = await r(W[i + 2]); for (let k = a; k <= b && k - a < 65536; k++) larg.set(k, w); i += 3; }
      }
    }
    p.largeur = (c) => { const w = larg.get(p.cid(c)); return w ?? dw; };
    p.unicode = (c) => (versUni && versUni.has(c) ? versUni.get(c) : "");
    p.espaceMot = () => false;
  } else {
    p.codes = (o) => Array.from(o);
    // l'encodage : de base, puis /Differences
    const enc = await r(dict.get("Encoding"));
    const nomStd = nomPolice.replace(/^[A-Z]{6}\+/, "");
    let base = /symbol/i.test(nomStd) ? SYMBOLE : /zapf|dingbat/i.test(nomStd) ? null : sousType === "TrueType" && !symbolique ? WIN : STANDARD;
    if (/wingding/i.test(nomStd)) base = null;
    const noms = new Array(256).fill(null);
    let encDict = enc;
    if (enc instanceof Nom) encDict = null;
    const nomBase = enc instanceof Nom ? enc.nom : encDict instanceof Dict ? nomType(await r(encDict.get("BaseEncoding"))) : null;
    if (nomBase === "WinAnsiEncoding") base = WIN;
    else if (nomBase === "MacRomanEncoding") base = MAC;
    else if (nomBase === "StandardEncoding") base = STANDARD;
    p.encodageNomme = !!nomBase;
    if (encDict instanceof Dict) {
      const diff = await r(encDict.get("Differences"));
      if (Array.isArray(diff)) {
        let c = 0;
        for (const x0 of diff) { const x = await r(x0); if (typeof x === "number") c = x; else if (x instanceof Nom && c < 256) noms[c++] = x.nom; }
      }
    }
    p.nomsGlyphes = noms;
    p.unicode = (c) => {
      if (versUni && versUni.has(c)) return versUni.get(c);
      if (noms[c]) { const u = unicodeDuNom(noms[c]); if (u) return u; }
      if (/wingding/i.test(nomStd)) return WINGDINGS[c] || "•";
      if (/zapf|dingbat/i.test(nomStd)) return dingbat(c);
      return base ? base[c] || "" : "";
    };
    const premier = (await r(dict.get("FirstChar"))) ?? 0;
    const widths = await r(dict.get("Widths"));
    const ws = Array.isArray(widths) ? await Promise.all(widths.map(r)) : null;
    const std = sansWidths(nomStd);
    p.largeur = (c) => {
      if (ws && c >= premier && c < premier + ws.length && typeof ws[c - premier] === "number") return ws[c - premier];
      if (ws && desc) return desc.manque || 0;
      return std(c, p.unicode(c));
    };
    p.espaceMot = (c) => c === 32;
    if (sousType === "Type3") {
      const m = await r(dict.get("FontMatrix"));
      p.matrice = Array.isArray(m) ? await Promise.all(m.map(r)) : [0.001, 0, 0, 0.001, 0, 0];
      p.procs = await r(dict.get("CharProcs"));
      p.ressources = await r(dict.get("Resources"));
    }
  }

  // le dessin : la police TrueType embarquée, si elle est lisible
  if (fd instanceof Dict) {
    const ff2 = await r(fd.get("FontFile2"));
    const ff3 = await r(fd.get("FontFile3"));
    let tt = null;
    const essai = async (f) => { try { return new TrueType(await doc.decode(f)); } catch (e) { return null; } };
    if (ff2 instanceof Flux) tt = await essai(ff2);
    else if (ff3 instanceof Flux && nomType(ff3.dict.get("Subtype")) === "OpenType") tt = await essai(ff3);
    if (tt) {
      p.tt = tt;
      p.upem = tt.upem;
      if (p.composite) {
        const c2g = await r(descendante.get("CIDToGIDMap"));
        let table = null;
        if (c2g instanceof Flux) table = await doc.decode(c2g);
        p.gid = (c) => { const cid = p.cid(c); return table ? (table[2 * cid] << 8) | table[2 * cid + 1] : cid; };
      } else p.gid = gidSimple(p, tt, symbolique);
    }
  }
  return p;
}

/* Le numéro de glyphe d'un code d'une police TrueType « simple »
   (ISO 32000, § 9.6.6.4) : par la cmap Unicode de la police quand
   l'encodage nomme ses glyphes, sinon par sa cmap « symbole » (3,0) ou
   Macintosh (1,0), où les codes sont rangés tels quels. */
function gidSimple(p, tt, symbolique) {
  const c31 = tt.cmap(3, 1), c30 = tt.cmap(3, 0), c10 = tt.cmap(1, 0);
  const cacheGid = new Map();
  return (code) => {
    if (cacheGid.has(code)) return cacheGid.get(code);
    let g = 0;
    if (c31 && (!symbolique || p.encodageNomme || p.nomsGlyphes[code])) {
      const u = p.nomsGlyphes[code] ? unicodeDuNom(p.nomsGlyphes[code]) : WIN[code];
      if (u) g = tt.dansCmap(c31, u.codePointAt(0));
    }
    if (!g && c30) for (const b of [0, 0xf000, 0xf100, 0xf200]) { g = tt.dansCmap(c30, b + code); if (g) break; }
    if (!g && c10) g = tt.dansCmap(c10, code);
    if (!g && c31) { const u = p.unicode(code); if (u) g = tt.dansCmap(c31, u.codePointAt(0)); }
    if (!g && !c31 && !c30 && !c10) g = code;
    cacheGid.set(code, g);
    return g;
  };
}

/* Les largeurs des 14 polices standard quand le PDF ne les donne pas. */
function sansWidths(nom) {
  if (/courier/i.test(nom)) return () => 600;
  const facteur = /times/i.test(nom) ? 0.94 : /symbol|dingbat/i.test(nom) ? 0.9 : 1;
  const gras = /bold/i.test(nom) ? 1.06 : 1;
  return (c, u) => (u ? Math.round((largeurTexte(u, 1000) * facteur * gras)) : 500);
}

export { Ref };
