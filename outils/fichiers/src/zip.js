/* Le format ZIP (la spécification APPNOTE de PKWARE), écrit ici.

   Une archive ZIP, c'est une suite de fichiers, chacun précédé d'un petit
   en-tête local, puis un « répertoire central » qui les liste tous, puis un
   enregistrement de fin qui dit où commence ce répertoire. La compression
   est « deflate » brut — celle que le navigateur sait faire tout seul
   (CompressionStream("deflate-raw")). Chaque fichier porte sa somme CRC-32,
   que l'on vérifie en le décompressant. */

import { deflateBrut, inflateBrut } from "./pdf/filtres.js";

const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLE[n] = c >>> 0;
}
/* CRC-32 (polynôme 0xEDB88320), qu'on peut nourrir par morceaux. */
export function crc32(o, depart = 0) {
  let c = (depart ^ 0xffffffff) >>> 0;
  for (let i = 0; i < o.length; i++) c = TABLE[(c ^ o[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dateDos(d) {
  return {
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    jour: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/* « fichiers » : [{ nom, octets, date? }] → l'archive. Un fichier déjà
   compressé (JPEG, PNG, PDF, ZIP…) est rangé tel quel : le recompresser ne
   gagnerait rien et coûterait du temps. */
export async function creerZip(fichiers) {
  const enc = new TextEncoder();
  const morceaux = [], central = [];
  let pos = 0;
  const DEJA = /\.(jpe?g|png|gif|webp|avif|zip|7z|rar|gz|mp3|mp4|m4a|mov|pdf|docx|xlsx|pptx|odt)$/i;
  for (const f of fichiers) {
    const nom = enc.encode(f.nom);
    const crc = crc32(f.octets);
    let methode = 0, donnees = f.octets;
    if (!DEJA.test(f.nom) && f.octets.length > 64) {
      const c = await deflateBrut(f.octets);
      if (c.length < f.octets.length) { methode = 8; donnees = c; }
    }
    const { heure, jour } = dateDos(f.date || new Date());
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);              // bit 11 : nom en UTF-8
    local.setUint16(8, methode, true);
    local.setUint16(10, heure, true); local.setUint16(12, jour, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, donnees.length, true);
    local.setUint32(22, f.octets.length, true);
    local.setUint16(26, nom.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, methode, true);
    c.setUint16(12, heure, true); c.setUint16(14, jour, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, donnees.length, true);
    c.setUint32(24, f.octets.length, true);
    c.setUint16(28, nom.length, true);
    c.setUint32(42, pos, true);
    central.push(new Uint8Array(c.buffer), nom);
    morceaux.push(new Uint8Array(local.buffer), nom, donnees);
    pos += 30 + nom.length + donnees.length;
  }
  const tailleCentral = central.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true);
  fin.setUint32(16, pos, true);
  return new Blob([...morceaux, ...central, new Uint8Array(fin.buffer)], { type: "application/zip" });
}

/* Lire une archive : la liste de ses fichiers, chacun décompressé à la demande. */
export function lireZip(o) {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  let fin = -1;
  for (let i = o.length - 22; i >= Math.max(0, o.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("ce n'est pas une archive ZIP (ou elle est tronquée)");
  const n = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  if (p === 0xffffffff) throw new Error("archive ZIP64 (plus de 4 Go) : non prise en charge");
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < n; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("répertoire central abîmé");
    const drapeaux = v.getUint16(p + 8, true), methode = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true), taille = v.getUint32(p + 20, true), brut = v.getUint32(p + 24, true);
    const ln = v.getUint16(p + 28, true), le = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const octetsNom = o.subarray(p + 46, p + 46 + ln);
    const nom = drapeaux & 0x800 ? dec.decode(octetsNom) : String.fromCharCode(...octetsNom);
    const dossier = nom.endsWith("/");
    const chiffre = (drapeaux & 1) === 1;
    out.push({
      nom, taille: brut, compresse: taille, methode, dossier, chiffre,
      async octets() {
        if (chiffre) throw new Error("« " + nom + " » est protégé par un mot de passe ZIP : non pris en charge");
        const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
        const donnees = o.subarray(debut, debut + taille);
        let r;
        if (methode === 0) r = donnees;
        else if (methode === 8) r = await inflateBrut(donnees);
        else throw new Error("« " + nom + " » : méthode de compression " + methode + " non prise en charge");
        if (crc32(r) !== crc) throw new Error("« " + nom + " » : somme de contrôle fausse, le fichier est abîmé");
        return r;
      },
    });
    p += 46 + ln + le + lc;
  }
  return out;
}
