/* Les objets d'un fichier PDF, et leur écriture en octets (ISO 32000, § 7.3).

   Un PDF n'est qu'un graphe de huit sortes d'objets : null, booléen,
   nombre, chaîne, nom (/Type), tableau, dictionnaire (<< >>), flux (un
   dictionnaire suivi d'octets) — plus la RÉFÉRENCE « 12 0 R », qui pointe
   vers un objet numéroté ailleurs dans le fichier.

   Ici : les nombres, booléens et null sont ceux de JavaScript, le tableau
   est un Array ; les autres ont leur classe. */

export class Nom {
  constructor(nom) { this.nom = nom; }
  toString() { return "/" + this.nom; }
}
const noms = new Map();
/* Les noms sont partagés : N("Type") === N("Type"), on les compare par === */
export const N = (s) => { if (!noms.has(s)) noms.set(s, new Nom(s)); return noms.get(s); };

export class Chaine {
  constructor(octets, hex = false) { this.octets = octets; this.hex = hex; }
  /* Une chaîne de texte lisible : PDFDocEncoding (≈ Latin-1) ou UTF-16BE avec BOM. */
  texte() {
    const o = this.octets;
    if (o.length >= 2 && o[0] === 0xfe && o[1] === 0xff) {
      let s = "";
      for (let i = 2; i + 1 < o.length; i += 2) s += String.fromCharCode((o[i] << 8) | o[i + 1]);
      return s;
    }
    if (o.length >= 3 && o[0] === 0xef && o[1] === 0xbb && o[2] === 0xbf) return new TextDecoder().decode(o.subarray(3));
    return String.fromCharCode(...o);
  }
  static depuisTexte(s) {
    if (/^[\x20-\x7e]*$/.test(s)) return new Chaine(Uint8Array.from(s, (c) => c.charCodeAt(0)));
    const o = new Uint8Array(2 + s.length * 2);
    o[0] = 0xfe; o[1] = 0xff;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); o[2 + 2 * i] = c >> 8; o[3 + 2 * i] = c & 255; }
    return new Chaine(o);
  }
  static octets(o) { return new Chaine(o, true); }
}

export class Ref {
  constructor(num, gen = 0) { this.num = num; this.gen = gen; }
  toString() { return this.num + " " + this.gen + " R"; }
}

/* Un dictionnaire : une Map dont les clés sont les noms SANS la barre. */
export class Dict extends Map {
  constructor(entrees) { super(entrees ? Object.entries(entrees).filter(([, v]) => v !== undefined) : undefined); }
  type() { const t = this.get("Type"); return t instanceof Nom ? t.nom : null; }
}

export class Flux {
  /* « donnees » : les octets tels qu'ils sont dans le fichier, encore codés
     selon /Filter. « decode » (facultatif) : ces octets une fois décodés. */
  constructor(dict, donnees) { this.dict = dict; this.donnees = donnees; }
}

/* ── l'écriture ── */
const enc = new TextEncoder();
export const versOctets = (s) => enc.encode(s);

export function ecrireNombre(n) {
  if (Number.isInteger(n)) return String(n);
  let s = n.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return s;
}

export function ecrireNom(nom) {
  let s = "/";
  for (const o of enc.encode(nom)) {
    s += o < 33 || o > 126 || "#()<>[]{}/%".includes(String.fromCharCode(o)) ? "#" + o.toString(16).padStart(2, "0") : String.fromCharCode(o);
  }
  return s;
}

export function ecrireChaine(c) {
  const o = c.octets;
  const binaire = c.hex || o.some((x) => x < 32 && x !== 10 && x !== 13 && x !== 9);
  if (binaire) return "<" + [...o].map((x) => x.toString(16).padStart(2, "0")).join("") + ">";
  let s = "(";
  for (const x of o) {
    if (x === 0x28 || x === 0x29 || x === 0x5c) s += "\\" + String.fromCharCode(x);
    else if (x === 10) s += "\\n";
    else if (x === 13) s += "\\r";
    else if (x === 9) s += "\\t";
    else if (x > 126) s += "\\" + x.toString(8).padStart(3, "0");
    else s += String.fromCharCode(x);
  }
  return s + ")";
}

/* Un objet direct en texte. Les flux sont écrits à part (ils ont des octets). */
export function ecrire(v) {
  if (v === null || v === undefined) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "number") return ecrireNombre(v);
  if (v instanceof Nom) return ecrireNom(v.nom);
  if (v instanceof Ref) return v.num + " " + v.gen + " R";
  if (v instanceof Chaine) return ecrireChaine(v);
  if (Array.isArray(v)) return "[" + v.map(ecrire).join(" ") + "]";
  if (v instanceof Dict) {
    let s = "<<";
    for (const [k, x] of v) if (x !== undefined) s += ecrireNom(k) + " " + ecrire(x);
    return s + ">>";
  }
  if (v instanceof Flux) throw new Error("un flux ne s'écrit pas en objet direct");
  throw new Error("objet PDF inconnu : " + typeof v);
}
