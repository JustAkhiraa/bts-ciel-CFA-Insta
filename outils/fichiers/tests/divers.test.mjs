/* Le banc des petits outils : EXIF (lire, retirer sans perte), ZIP (écrire,
   lire une archive faite par Python), MD5 et CRC-32. */
import { readFileSync } from "node:fs";
import { lireExif, nettoyerJpeg, nettoyerPng } from "../src/exif.js";
import { creerZip, lireZip, crc32 } from "../src/zip.js";
import { md5 } from "../src/md5.js";
import { DocumentPdf } from "../src/pdf/lecture.js";
import * as Op from "../src/pdf/operations.js";

export const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const fichier = (n) => new Uint8Array(readFileSync(new URL("./pdf/" + n, import.meta.url)));

test("EXIF : orientation, marque, date et position GPS d'une photo de téléphone", () => {
  const e = lireExif(fichier("orient6.jpg"));
  ok(e.orientation === 6, "orientation 6 : " + e.orientation);
  ok(e.marque === "Pomme" && e.modele === "Telephone 15" && e.date === "2026:10:23 14:05:00", "marque, modèle, date : " + JSON.stringify(e));
  ok(e.gps && Math.abs(e.gps.lat - 48.8584) < 0.001 && Math.abs(e.gps.lon - 2.2945) < 0.001 && e.gps.alt === 35, "GPS : " + JSON.stringify(e.gps));
});

test("EXIF retiré sans recompresser : les données d'image restent octet pour octet", () => {
  const o = fichier("orient6.jpg");
  const r = nettoyerJpeg(o);
  ok(r.retires > 100, "des octets retirés : " + r.retires);
  const apres = lireExif(r.octets);
  ok(apres.orientation === 1 && !apres.gps, "plus d'EXIF");
  // le flux d'image (à partir du marqueur SOS) est identique
  const sos = (b) => { for (let i = 2; i < b.length - 1; i++) if (b[i] === 0xff && b[i + 1] === 0xda) return b.subarray(i); return null; };
  const a = sos(o), b = sos(r.octets);
  ok(a.length === b.length && a.every((x, i) => x === b[i]), "pixels intacts");
  ok(nettoyerPng(o) === null && nettoyerJpeg(Uint8Array.of(1, 2, 3)) === null, "un autre format est refusé");
});

test("images → PDF : la photo « couchée » est posée debout, sans recompression", async () => {
  const o = fichier("orient6.jpg");
  const d = await DocumentPdf.ouvrir(await Op.imagesVersPdf([{ type: "jpeg", octets: o, orientation: 6 }], { format: "ajuste", marge: 0 }));
  const t = await d.taillePage((await d.pages())[0]);
  ok(t.largeur > t.hauteur, "la page suit l'image VUE (paysage) : " + Math.round(t.largeur) + "×" + Math.round(t.hauteur));
  const im = await Op.listerImages(d);
  ok(im[0].flux.donnees.length === o.length, "le JPEG est inséré tel quel");
});

test("ZIP : une archive écrite ici, relue ici ; et une archive écrite par Python", async () => {
  const enc = new TextEncoder();
  const z = new Uint8Array(await (await creerZip([
    { nom: "notes/cours réseau.txt", octets: enc.encode("VLAN ".repeat(400)) },
    { nom: "photo.jpg", octets: fichier("photo.jpg") },
  ])).arrayBuffer());
  const L = lireZip(z);
  ok(L.length === 2 && L[0].nom === "notes/cours réseau.txt" && L[0].methode === 8 && L[1].methode === 0, "deux fichiers, le texte compressé, la photo rangée telle quelle");
  ok(new TextDecoder().decode(await L[0].octets()) === "VLAN ".repeat(400), "texte relu");
  const P = lireZip(fichier("python.zip"));
  ok(P.map((x) => x.nom).join("|") === "dossier/|cours réseau.txt|brut.bin", "noms : " + P.map((x) => x.nom));
  ok(new TextDecoder().decode(await P[1].octets()) === "ARP, VLAN, routage ".repeat(50), "fichier compressé de Python relu");
  ok((await P[2].octets()).every((x, i) => x === i), "fichier stocké relu");
  const abime = fichier("python.zip").slice();
  abime[abime.indexOf(0x41, 120)] ^= 0xff;                 // un octet changé dans les données
  let err = null;
  try { for (const f of lireZip(abime)) if (!f.dossier) await f.octets(); } catch (e) { err = e; }
  ok(err, "une archive abîmée est détectée (CRC-32 ou flux deflate)");
});

test("MD5 et CRC-32 : valeurs de référence", () => {
  const enc = new TextEncoder();
  const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  ok(hex(md5(enc.encode("abc"))) === "900150983cd24fb0d6963f7d28e17f72", "md5");
  ok(crc32(enc.encode("123456789")).toString(16) === "cbf43926", "crc32 du vecteur de test");
});

test("EXIF : nettoyer une photo en gardant son orientation", async () => {
  const { lireExif, nettoyerJpeg, avecOrientation } = await import("../src/exif.js");
  const o = new Uint8Array(readFileSync(new URL("./pdf/orient6.jpg", import.meta.url)));
  ok(lireExif(o).orientation === 6, "la photo de test est couchée (6)");
  const net = nettoyerJpeg(o).octets;
  ok(lireExif(net).orientation === 1, "nettoyée : plus d'orientation");
  const remis = avecOrientation(net, 6);
  const e = lireExif(remis);
  ok(e.orientation === 6 && !e.gps && !e.marque, "orientation rendue, rien d'autre : " + JSON.stringify(e));
  ok(remis.length === net.length + 36, "36 octets de plus");
});
