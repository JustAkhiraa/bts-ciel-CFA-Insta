/* Le chiffrement des PDF (ISO 32000-1 § 7.6, ISO 32000-2 § 7.6.4).

   LIRE un PDF protégé, quelle que soit l'époque :
   - R2 / R3 : RC4 40 à 128 bits, clé tirée de MD5 (PDF 1.1 à 1.4) ;
   - R4 : RC4 ou AES-128 (« AESV2 », PDF 1.5 à 1.7) ;
   - R5 / R6 : AES-256 (« AESV3 », PDF 2.0) — la clé du fichier est rangée
     chiffrée dans /UE et /OE, sous une clé tirée du mot de passe par
     l'algorithme 2.B (SHA-256/384/512 et AES enchaînés, 64 tours au moins).
   Le mot de passe « utilisateur » ouvre le fichier ; le mot de passe
   « propriétaire » aussi. Beaucoup de PDF ont un mot de passe utilisateur
   VIDE : ils s'ouvrent sans rien demander, seules des permissions
   (imprimer, copier) les restreignent.

   PROTÉGER un PDF : toujours en AES-256 (R6), le seul que la norme
   actuelle recommande.

   RC4 et MD5 sont écrits ici (Web Crypto ne les a pas, à raison) ; AES et
   SHA viennent de Web Crypto. AES sans bourrage, dont la norme a besoin,
   s'obtient de l'AES-CBC de Web Crypto en jetant (ou en fabriquant) le
   bloc de bourrage final. */

import { md5 } from "../md5.js";
import { N, Nom, Chaine, Ref, Dict, Flux } from "./objets.js";

const subtle = globalThis.crypto.subtle;
const PAD = Uint8Array.from([0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a]);

const concat = (...t) => { const n = t.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let i = 0; for (const x of t) { o.set(x, i); i += x.length; } return o; };
const egaux = (a, b, n = a.length) => { for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; };
const utf8 = (s) => new TextEncoder().encode(s);
const latin1 = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);
const aleatoire = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function rc4(cle, donnees) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  for (let i = 0, j = 0; i < 256; i++) { j = (j + S[i] + cle[i % cle.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
  const out = new Uint8Array(donnees.length);
  for (let k = 0, i = 0, j = 0; k < donnees.length; k++) {
    i = (i + 1) & 255; j = (j + S[i]) & 255;
    [S[i], S[j]] = [S[j], S[i]];
    out[k] = donnees[k] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

/* ── AES par Web Crypto ── */
const cleAes = (k, usages) => subtle.importKey("raw", k, "AES-CBC", false, usages);
export async function aesCbcChiffrer(cle, iv, donnees, bourrage = true) {
  const c = new Uint8Array(await subtle.encrypt({ name: "AES-CBC", iv }, await cleAes(cle, ["encrypt"]), donnees));
  return bourrage ? c : c.subarray(0, donnees.length);         // sans bourrage : le dernier bloc (le bourrage) tombe
}
export async function aesCbcDechiffrer(cle, iv, donnees, bourrage = true) {
  const k = await cleAes(cle, ["encrypt", "decrypt"]);
  if (bourrage) {
    try { return new Uint8Array(await subtle.decrypt({ name: "AES-CBC", iv }, k, donnees)); }
    catch (e) { /* bourrage abîmé : on déchiffre sans, et on retire ce qui ressemble à du bourrage */ }
  }
  // sans bourrage : on fabrique le bloc qui, déchiffré, donnerait un bourrage valide
  const n = donnees.length - (donnees.length % 16);
  if (!n) return new Uint8Array(0);
  const dernier = donnees.subarray(n - 16, n);
  const faux = (await aesCbcChiffrer(cle, dernier, new Uint8Array(16).fill(16), false)).subarray(0, 16);
  const clair = new Uint8Array(await subtle.decrypt({ name: "AES-CBC", iv }, k, concat(donnees.subarray(0, n), faux)));
  if (!bourrage) return clair;
  const p = clair[clair.length - 1];
  return p >= 1 && p <= 16 ? clair.subarray(0, clair.length - p) : clair;
}

/* L'algorithme 2.B (PDF 2.0) : le hachage itéré d'un mot de passe. */
export async function hash2B(motDePasse, sel, udata = new Uint8Array(0)) {
  let K = new Uint8Array(await subtle.digest("SHA-256", concat(motDePasse, sel, udata)));
  for (let tour = 0; ; tour++) {
    const un = concat(motDePasse, K, udata);
    const K1 = new Uint8Array(un.length * 64);
    for (let i = 0; i < 64; i++) K1.set(un, i * un.length);
    const E = await aesCbcChiffrer(K.subarray(0, 16), K.subarray(16, 32), K1, false);
    let somme = 0;
    for (let i = 0; i < 16; i++) somme += E[i];
    const algo = ["SHA-256", "SHA-384", "SHA-512"][somme % 3];
    K = new Uint8Array(await subtle.digest(algo, E));
    if (tour >= 63 && E[E.length - 1] <= tour - 31) break;
  }
  return K.subarray(0, 32);
}
const motDePasseR6 = (s) => utf8(String(s).normalize("NFKC")).subarray(0, 127);
const sha256 = async (o) => new Uint8Array(await subtle.digest("SHA-256", o));

/* ── lire : le déchiffreur d'un document ── */
export class Dechiffreur {
  static async creer(dict, ids, motDePasse = "") {
    const d = new Dechiffreur();
    const val = (k) => dict.get(k);
    if (!(val("Filter") instanceof Nom) || val("Filter").nom !== "Standard") throw new Error("chiffrement non standard (certificat) : ce PDF ne peut être ouvert qu'avec la clé de son destinataire");
    d.V = val("V") || 0;
    d.R = val("R") || 2;
    d.P = val("P") | 0;
    const O = val("O").octets, U = val("U").octets;
    const id0 = Array.isArray(ids) && ids[0] instanceof Chaine ? ids[0].octets : new Uint8Array(0);
    d.metadonnees = val("EncryptMetadata") !== false;
    // la méthode : RC4 (V1, V2), ou celle du filtre de chiffrement /StdCF (V4, V5)
    d.methodeFlux = d.methodeChaines = "V2";
    if (d.V >= 4) {
      const cf = val("CF") || new Dict();
      const methode = (nom) => {
        if (!nom || (nom instanceof Nom && nom.nom === "Identity")) return "Identity";
        const f = cf.get(nom.nom);
        return f && f.get("CFM") instanceof Nom ? f.get("CFM").nom : "V2";
      };
      d.methodeFlux = methode(val("StmF"));
      d.methodeChaines = methode(val("StrF"));
    }
    const motOctets = d.R >= 5 ? motDePasseR6(motDePasse) : latin1(motDePasse);
    if (d.R >= 5) {
      const essayer = async (pwd, valSel, cleSel, udata, cible, enveloppe) => {
        const h = d.R === 5 ? await sha256(concat(pwd, valSel, udata)) : await hash2B(pwd, valSel, udata);
        if (!egaux(h, cible, 32)) return null;
        const inter = d.R === 5 ? await sha256(concat(pwd, cleSel, udata)) : await hash2B(pwd, cleSel, udata);
        return aesCbcDechiffrer(inter, new Uint8Array(16), enveloppe, false);
      };
      d.cle = await essayer(motOctets, O.subarray(32, 40), O.subarray(40, 48), U.subarray(0, 48), O, val("OE").octets);
      if (d.cle) d.proprietaire = true;
      else d.cle = await essayer(motOctets, U.subarray(32, 40), U.subarray(40, 48), new Uint8Array(0), U, val("UE").octets);
    } else {
      const n = d.R === 2 ? 5 : (val("Length") || 40) / 8;
      const cleDe = (pwdPad) => {
        let h = md5(concat(pwdPad, O, Uint8Array.of(d.P & 255, (d.P >> 8) & 255, (d.P >> 16) & 255, (d.P >>> 24) & 255), id0,
          d.R >= 4 && !d.metadonnees ? Uint8Array.of(255, 255, 255, 255) : new Uint8Array(0)));
        if (d.R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, n));
        return h.subarray(0, n);
      };
      const verifier = (cle) => {
        if (d.R === 2) return egaux(rc4(cle, PAD), U, 32);
        let x = rc4(cle, md5(concat(PAD, id0)));
        for (let i = 1; i <= 19; i++) x = rc4(cle.map((b) => b ^ i), x);
        return egaux(x, U, 16);
      };
      const pad = (p) => concat(p.subarray(0, 32), PAD.subarray(0, Math.max(0, 32 - p.length)));
      // le mot de passe propriétaire d'abord : il redonne le mot de passe utilisateur
      let h = md5(pad(motOctets));
      if (d.R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, n));
      const kO = h.subarray(0, n);
      let user = O;
      if (d.R === 2) user = rc4(kO, O);
      else for (let i = 19; i >= 0; i--) user = rc4(kO.map((b) => b ^ i), user);
      let cle = cleDe(user);
      if (verifier(cle)) { d.cle = cle; d.proprietaire = true; }
      else { cle = cleDe(pad(motOctets)); if (verifier(cle)) d.cle = cle; }
    }
    if (!d.cle) {
      const e = new Error(motDePasse ? "mot de passe incorrect" : "ce PDF est protégé par un mot de passe");
      e.motDePasse = true;
      throw e;
    }
    return d;
  }

  async cleObjet(num, gen, aes) {
    if (this.R >= 5) return this.cle;
    const n = this.cle.length;
    const h = md5(concat(this.cle, Uint8Array.of(num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255),
      aes ? Uint8Array.of(0x73, 0x41, 0x6c, 0x54) : new Uint8Array(0)));
    return h.subarray(0, Math.min(n + 5, 16));
  }

  async octets(o, num, gen, methode) {
    if (methode === "Identity") return o;
    if (methode === "AESV2" || methode === "AESV3") {
      if (o.length < 32) return new Uint8Array(0);
      return aesCbcDechiffrer(await this.cleObjet(num, gen, true), o.subarray(0, 16), o.subarray(16));
    }
    return rc4(await this.cleObjet(num, gen, false), o);
  }

  /* Déchiffrer un objet entier : ses chaînes, et ses octets s'il est un flux. */
  async objet(v, num, gen) {
    if (v instanceof Chaine) return new Chaine(await this.octets(v.octets, num, gen, this.methodeChaines), v.hex);
    if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await this.objet(x, num, gen)); return out; }
    if (v instanceof Dict) { const d = new Dict(); for (const [k, x] of v) d.set(k, await this.objet(x, num, gen)); return d; }
    if (v instanceof Flux) {
      const t = v.dict.type();
      const dict = await this.objet(v.dict, num, gen);
      if (t === "XRef") return new Flux(dict, v.donnees);
      if (t === "Metadata" && !this.metadonnees) return new Flux(dict, v.donnees);
      return new Flux(dict, await this.octets(v.donnees, num, gen, this.methodeFlux));
    }
    return v;
  }
}

/* ── protéger : AES-256, R6 ── */
export class Chiffreur {
  /* « permissions » : P, le mot de 32 bits des droits (−4 : tout permis). */
  static async creer(motUtilisateur, motProprietaire = null, permissions = -4) {
    const c = new Chiffreur();
    c.cle = aleatoire(32);
    const u = motDePasseR6(motUtilisateur), o = motDePasseR6(motProprietaire || C_aleatoireTexte());
    const uVal = aleatoire(8), uCle = aleatoire(8), oVal = aleatoire(8), oCle = aleatoire(8);
    const U = concat(await hash2B(u, uVal), uVal, uCle);
    const UE = await aesCbcChiffrer(await hash2B(u, uCle), new Uint8Array(16), c.cle, false);
    const O = concat(await hash2B(o, oVal, U), oVal, oCle);
    const OE = await aesCbcChiffrer(await hash2B(o, oCle, U), new Uint8Array(16), c.cle, false);
    const p = permissions | 0;
    const perms = concat(Uint8Array.of(p & 255, (p >> 8) & 255, (p >> 16) & 255, (p >>> 24) & 255, 255, 255, 255, 255, 0x54, 0x61, 0x64, 0x62), aleatoire(4));
    const Perms = await aesCbcChiffrer(c.cle, new Uint8Array(16), perms, false);
    c.dict = new Dict({
      Filter: N("Standard"), V: 5, R: 6, Length: 256, P: p, EncryptMetadata: true,
      CF: new Dict({ StdCF: new Dict({ AuthEvent: N("DocOpen"), CFM: N("AESV3"), Length: 32 }) }),
      StmF: N("StdCF"), StrF: N("StdCF"),
      O: Chaine.octets(O), U: Chaine.octets(U), OE: Chaine.octets(OE), UE: Chaine.octets(UE), Perms: Chaine.octets(Perms),
    });
    return c;
  }
  async octets(o) {
    const iv = aleatoire(16);
    return concat(iv, await aesCbcChiffrer(this.cle, iv, o, true));
  }
  async objet(v) {
    if (v instanceof Chaine) return new Chaine(await this.octets(v.octets), true);
    if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await this.objet(x)); return out; }
    if (v instanceof Dict) { const d = new Dict(); for (const [k, x] of v) d.set(k, await this.objet(x)); return d; }
    return v;
  }
}
function C_aleatoireTexte() { return [...aleatoire(24)].map((b) => b.toString(36)).join(""); }

export { Ref };
