/* Écrire un fichier PDF neuf (ISO 32000, § 7.5).

   On numérote les objets à partir de 1, on écrit chacun « n 0 obj … endobj »
   en notant son adresse, puis la table xref (une ligne de 20 octets par
   objet), le trailer, et « startxref ». C'est la forme la plus simple et la
   plus lue de toutes : n'importe quel lecteur, même ancien, l'ouvre.

   Les flux non compressés le sont au passage (FlateDecode). */

import { N, Nom, Chaine, Ref, Dict, Flux, ecrire, versOctets } from "./objets.js";
import { deflate } from "./filtres.js";

export class Ecrivain {
  constructor() {
    this.objets = [null];          // index = numéro
  }
  reserver() { this.objets.push(undefined); return new Ref(this.objets.length - 1, 0); }
  poser(ref, v) { this.objets[ref.num] = v; return ref; }
  ajouter(v) { const r = this.reserver(); this.objets[r.num] = v; return r; }
  obtenir(ref) { return this.objets[ref.num]; }

  /* Un flux de contenu ou de données, compressé. */
  async flux(dict, octets, { compresser = true } = {}) {
    const d = dict instanceof Dict ? dict : new Dict(dict);
    if (compresser && octets.length > 40) {
      d.set("Filter", N("FlateDecode"));
      octets = await deflate(octets);
    }
    return new Flux(d, octets);
  }

  /* Les octets du fichier. « racine » : le catalogue ; « info » facultatif ;
     « chiffreur » : un Chiffreur (AES-256) pour un fichier protégé. */
  async octets({ racine, info = null, chiffreur = null, version = "1.7" }) {
    const morceaux = [];
    let pos = 0;
    const pousser = (o) => { const b = typeof o === "string" ? versOctets(o) : o; morceaux.push(b); pos += b.length; };
    pousser("%PDF-" + version + "\n");
    pousser(Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a));     // %âãÏÓ : « ce fichier est binaire »
    // les flux non compressés le sont maintenant
    for (let i = 1; i < this.objets.length; i++) {
      const v = this.objets[i];
      if (v instanceof Flux && !v.dict.has("Filter") && v.donnees.length > 60 && v.dict.type() !== "Metadata") {
        const d = new Dict(); for (const [k, x] of v.dict) d.set(k, x);
        d.set("Filter", N("FlateDecode"));
        this.objets[i] = new Flux(d, await deflate(v.donnees));
      }
    }
    let refChiffrement = null;
    if (chiffreur) refChiffrement = this.ajouter(chiffreur.dict);
    const adresses = new Array(this.objets.length).fill(0);
    for (let i = 1; i < this.objets.length; i++) {
      let v = this.objets[i];
      if (v === undefined) v = null;
      adresses[i] = pos;
      pousser(i + " 0 obj\n");
      const chiffrer = chiffreur && (!refChiffrement || i !== refChiffrement.num);
      if (v instanceof Flux) {
        let donnees = v.donnees;
        let dict = v.dict;
        if (chiffrer) { dict = await chiffreur.objet(dict); donnees = await chiffreur.octets(donnees); }
        const d = new Dict(); for (const [k, x] of dict) d.set(k, x);
        d.set("Length", donnees.length);
        pousser(ecrire(d) + "\nstream\n");
        pousser(donnees);
        pousser("\nendstream\nendobj\n");
      } else {
        if (chiffrer) v = await chiffreur.objet(v);
        pousser(ecrire(v) + "\nendobj\n");
      }
    }
    const debutXref = pos;
    const n = this.objets.length;
    let x = "xref\n0 " + n + "\n0000000000 65535 f \n";
    for (let i = 1; i < n; i++) x += String(adresses[i]).padStart(10, "0") + " 00000 n \n";
    pousser(x);
    const id = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const trailer = new Dict({ Size: n, Root: racine, Info: info || undefined, Encrypt: refChiffrement || undefined,
      ID: [Chaine.octets(id), Chaine.octets(id)] });
    pousser("trailer\n" + ecrire(trailer) + "\nstartxref\n" + debutXref + "\n%%EOF\n");
    const out = new Uint8Array(pos);
    let i = 0;
    for (const m of morceaux) { out.set(m, i); i += m.length; }
    return out;
  }
}

/* La date PDF : « D:20261023214500+02'00' ». */
export function datePdf(d = new Date()) {
  const p = (x) => String(x).padStart(2, "0");
  const tz = -d.getTimezoneOffset(), s = tz >= 0 ? "+" : "-";
  return "D:" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
    + s + p(Math.floor(Math.abs(tz) / 60)) + "'" + p(Math.abs(tz) % 60) + "'";
}
