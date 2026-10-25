/* La cryptographie du salon, toute dans Web Crypto — le navigateur fait le
   calcul, aucune bibliothèque n'est chargée.

   Une IDENTITÉ, ce sont deux paires de clés sur la courbe P-256 :
   - ECDSA, pour SIGNER chaque paquet : personne ne peut écrire au nom d'un
     autre, ni modifier un message en route ;
   - ECDH, pour qu'on puisse lui écrire en PRIVÉ.
   Son EMPREINTE est le SHA-256 de ses deux clés publiques : on ne peut pas
   choisir son empreinte, donc on ne peut pas usurper celle d'un autre.

   P-256 et non X25519 / Ed25519 : ces deux-là ne sont pas encore dans tous
   les navigateurs d'un lycée ; P-256 l'est partout.

   Un message PRIVÉ suit le schéma ECIES : une paire ECDH NEUVE pour chaque
   message, combinée à la clé publique du destinataire ; HKDF en tire une clé
   AES-256-GCM, qui chiffre ET authentifie. Le tout est signé par l'auteur.
   Un salon à MOT DE PASSE : PBKDF2 (210 000 tours, SHA-256) tire la clé
   AES-256-GCM du mot de passe et du nom du salon. Argon2id serait plus
   résistant, mais Web Crypto ne l'a pas. */

const subtle = globalThis.crypto.subtle;
const ECDH = { name: "ECDH", namedCurve: "P-256" };
const ECDSA = { name: "ECDSA", namedCurve: "P-256" };
const SIGNATURE = { name: "ECDSA", hash: "SHA-256" };
export const TOURS_PBKDF2 = 210000;

/* ── encodages ── */
const enc = new TextEncoder(), dec = new TextDecoder();
export const octets = (s) => enc.encode(s);
export const texte = (b) => dec.decode(b);
export function versB64(b) {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function depuisB64(s) {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
export const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const aleatoire = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
export async function sha256(donnees) { return new Uint8Array(await subtle.digest("SHA-256", donnees)); }

/* Le JSON canonique : clés triées à tous les niveaux. Deux appareils qui
   signent et vérifient le même objet doivent produire les mêmes octets. */
export function canonique(v) {
  if (Array.isArray(v)) return "[" + v.map(canonique).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canonique(v[k])).join(",") + "}";
  return JSON.stringify(v);
}

/* ── l'identité ── */
export async function creerIdentite() {
  // les clés privées ne sont PAS extractibles : même un script hostile dans
  // la page ne pourrait pas les lire, seulement s'en servir
  const signe = await subtle.generateKey(ECDSA, false, ["sign", "verify"]);
  const echange = await subtle.generateKey(ECDH, false, ["deriveBits"]);
  return completer({ signe, echange });
}
/* Une identité relue (IndexedDB garde les CryptoKey telles quelles). */
export async function completer({ signe, echange }) {
  const pubSigne = new Uint8Array(await subtle.exportKey("raw", signe.publicKey));
  const pubEchange = new Uint8Array(await subtle.exportKey("raw", echange.publicKey));
  const empreinte = hex(await sha256(concat(pubSigne, pubEchange)));
  return { signe, echange, pubSigne: versB64(pubSigne), pubEchange: versB64(pubEchange), empreinte };
}
export function concat(...tableaux) {
  const n = tableaux.reduce((s, t) => s + t.length, 0);
  const out = new Uint8Array(n);
  let i = 0;
  for (const t of tableaux) { out.set(t, i); i += t.length; }
  return out;
}
/* L'empreinte qu'AURAIT le porteur de ces deux clés : c'est ce qui rend
   l'identité auto-certifiée. */
export async function empreinteDe(pubSigneB64, pubEchangeB64) {
  return hex(await sha256(concat(depuisB64(pubSigneB64), depuisB64(pubEchangeB64))));
}

/* Une couleur stable par empreinte, pour reconnaître quelqu'un d'un coup d'œil. */
export function couleur(empreinte) {
  const h = parseInt(empreinte.slice(0, 4), 16) % 360;
  return "hsl(" + h + " 70% 62%)";
}
/* « 3fa2 b1c9 » : ce qu'on compare à voix haute pour vérifier quelqu'un. */
export function empreinteLisible(empreinte, n = 16) {
  return empreinte.slice(0, n).match(/.{4}/g).join(" ");
}

/* ── signer, vérifier ── */
export async function signer(identite, objet) {
  const sig = await subtle.sign(SIGNATURE, identite.signe.privateKey, octets(canonique(objet)));
  return versB64(sig);
}
const clesImportees = new Map();
async function clePublique(b64, algo, usages) {
  const k = algo.name + b64;
  if (!clesImportees.has(k)) {
    if (clesImportees.size > 500) clesImportees.clear();
    clesImportees.set(k, subtle.importKey("raw", depuisB64(b64), algo, false, usages));
  }
  return clesImportees.get(k);
}
export async function verifier(pubSigneB64, sigB64, objet) {
  try {
    const cle = await clePublique(pubSigneB64, ECDSA, ["verify"]);
    return await subtle.verify(SIGNATURE, cle, depuisB64(sigB64), octets(canonique(objet)));
  } catch (e) {
    return false;                 // une clé ou une signature mal formée ne vérifie rien
  }
}

/* ── AES-256-GCM ── */
async function chiffrerAvec(cle, clair, donneesAssociees) {
  const iv = aleatoire(12);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: octets(donneesAssociees) }, cle, octets(clair));
  return { iv: versB64(iv), ct: versB64(ct) };
}
async function dechiffrerAvec(cle, { iv, ct }, donneesAssociees) {
  try {
    const clair = await subtle.decrypt({ name: "AES-GCM", iv: depuisB64(iv), additionalData: octets(donneesAssociees) }, cle, depuisB64(ct));
    return texte(clair);
  } catch (e) {
    return null;                  // mauvaise clé, ou message altéré : GCM le détecte
  }
}

/* ── messages privés (ECIES) ── */
async function cleDeSecret(bits, sel, info) {
  const base = await subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: sel, info: octets(info) }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function chiffrerPrive(destPubEchangeB64, clair, contexte) {
  const eph = await subtle.generateKey(ECDH, true, ["deriveBits"]);
  const dest = await clePublique(destPubEchangeB64, ECDH, []);
  const bits = await subtle.deriveBits({ name: "ECDH", public: dest }, eph.privateKey, 256);
  const ephPub = new Uint8Array(await subtle.exportKey("raw", eph.publicKey));
  const cle = await cleDeSecret(bits, ephPub, "ciel-salon prive v1");
  return { eph: versB64(ephPub), ...(await chiffrerAvec(cle, clair, contexte)) };
}
export async function dechiffrerPrive(identite, { eph, iv, ct }, contexte) {
  try {
    const ephCle = await clePublique(eph, ECDH, []);
    const bits = await subtle.deriveBits({ name: "ECDH", public: ephCle }, identite.echange.privateKey, 256);
    const cle = await cleDeSecret(bits, depuisB64(eph), "ciel-salon prive v1");
    return dechiffrerAvec(cle, { iv, ct }, contexte);
  } catch (e) {
    return null;
  }
}

/* ── salons à mot de passe ── */
export async function cleDeSalon(salon, motDePasse) {
  const base = await subtle.importKey("raw", octets(motDePasse), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: octets("ciel-salon|" + salon), iterations: TOURS_PBKDF2 },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export const chiffrerSalon = (cle, clair, contexte) => chiffrerAvec(cle, clair, contexte);
export const dechiffrerSalon = (cle, boite, contexte) => dechiffrerAvec(cle, boite, contexte);
