/* Les filtres des flux PDF (ISO 32000, § 7.4) : comment les octets d'un flux
   sont compressés ou codés, et comment les retrouver.

   FlateDecode — le plus courant — est le « deflate » de zlib : le navigateur
   le fait lui-même (CompressionStream / DecompressionStream), aucune
   bibliothèque. Les autres (ASCIIHex, ASCII85, LZW, RunLength) sont courts
   et écrits ici. DCTDecode (JPEG) et JPXDecode (JPEG 2000) ne sont pas
   décodés : ce sont des images, on les garde telles quelles. */

import { Nom } from "./objets.js";

async function flux(octets, transformation) {
  const s = new Blob([octets]).stream().pipeThrough(transformation);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export const deflate = (o) => flux(o, new CompressionStream("deflate"));
export const deflateBrut = (o) => flux(o, new CompressionStream("deflate-raw"));
export const inflateBrut = (o) => flux(o, new DecompressionStream("deflate-raw"));

/* Bien des PDF ont un flux zlib abîmé à la fin (somme de contrôle fausse,
   octets en trop) : on décode alors sans l'en-tête, et l'on garde ce qui
   sort — c'est ce que font les lecteurs indulgents. */
export async function inflate(o) {
  try { return await flux(o, new DecompressionStream("deflate")); }
  catch (e) {
    return inflatePartiel(o.subarray(2));
  }
}
async function inflatePartiel(o) {
  const morceaux = [];
  const lecteur = new Blob([o]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  try {
    for (;;) { const { done, value } = await lecteur.read(); if (done) break; morceaux.push(value); }
  } catch (e) { /* la fin est abîmée : on garde le début */ }
  const n = morceaux.reduce((s, m) => s + m.length, 0), out = new Uint8Array(n);
  let i = 0;
  for (const m of morceaux) { out.set(m, i); i += m.length; }
  return out;
}

/* Les prédicteurs PNG (10 à 15) : chaque ligne est précédée d'un octet qui
   dit comment elle a été prédite à partir de la précédente. */
export function predicteur(o, params) {
  const p = params && params.get ? params.get("Predictor") || 1 : 1;
  if (p === 1) return o;
  const couleurs = params.get("Colors") || 1, bpc = params.get("BitsPerComponent") || 8, colonnes = params.get("Columns") || 1;
  const bpp = Math.max(1, Math.ceil(couleurs * bpc / 8)), ligne = Math.ceil(colonnes * couleurs * bpc / 8);
  if (p === 2) {                                   // TIFF : la différence horizontale (8 bits seulement)
    const out = o.slice();
    if (bpc !== 8) return out;
    for (let r = 0; r * ligne < out.length; r++) for (let i = bpp; i < ligne; i++) out[r * ligne + i] = (out[r * ligne + i] + out[r * ligne + i - bpp]) & 255;
    return out;
  }
  const lignes = Math.floor(o.length / (ligne + 1));
  const out = new Uint8Array(lignes * ligne);
  let prec = new Uint8Array(ligne);
  for (let r = 0; r < lignes; r++) {
    const type = o[r * (ligne + 1)], src = o.subarray(r * (ligne + 1) + 1, (r + 1) * (ligne + 1));
    const cur = out.subarray(r * ligne, (r + 1) * ligne);
    for (let i = 0; i < ligne; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prec[i], c = i >= bpp ? prec[i - bpp] : 0;
      let v = src[i];
      if (type === 1) v += a;
      else if (type === 2) v += b;
      else if (type === 3) v += (a + b) >> 1;
      else if (type === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    prec = cur;
  }
  return out;
}

export function asciiHex(o) {
  const out = [];
  let demi = -1;
  for (const x of o) {
    if (x === 0x3e) break;
    const c = String.fromCharCode(x);
    if (!/[0-9a-fA-F]/.test(c)) continue;
    const v = parseInt(c, 16);
    if (demi < 0) demi = v; else { out.push((demi << 4) | v); demi = -1; }
  }
  if (demi >= 0) out.push(demi << 4);
  return Uint8Array.from(out);
}

export function ascii85(o) {
  const out = [];
  let groupe = [];
  for (let i = 0; i < o.length; i++) {
    const x = o[i];
    if (x === 0x7e) break;                          // « ~> » : la fin
    if (x <= 32) continue;
    if (x === 0x7a && groupe.length === 0) { out.push(0, 0, 0, 0); continue; }   // « z »
    groupe.push(x - 33);
    if (groupe.length === 5) {
      let v = 0;
      for (const g of groupe) v = v * 85 + g;
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      groupe = [];
    }
  }
  if (groupe.length > 1) {
    const n = groupe.length;
    while (groupe.length < 5) groupe.push(84);
    let v = 0;
    for (const g of groupe) v = v * 85 + g;
    const b = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...b.slice(0, n - 1));
  }
  return Uint8Array.from(out);
}

export function lzw(o, early = 1) {
  const out = [];
  let dico = [], taille = 9, bits = 0, acc = 0, prec = null;
  const reinit = () => { dico = []; for (let i = 0; i < 256; i++) dico.push([i]); dico.push(null, null); taille = 9; prec = null; };
  reinit();
  for (const x of o) {
    acc = (acc << 8) | x; bits += 8;
    while (bits >= taille) {
      const code = (acc >>> (bits - taille)) & ((1 << taille) - 1);
      bits -= taille;
      acc &= (1 << bits) - 1;
      if (code === 256) { reinit(); continue; }
      if (code === 257) return Uint8Array.from(out);
      let entree;
      if (code < dico.length && dico[code]) entree = dico[code];
      else if (prec) entree = prec.concat(prec[0]);
      else continue;
      out.push(...entree);
      if (prec) dico.push(prec.concat(entree[0]));
      prec = entree;
      if (dico.length + early >= (1 << taille) && taille < 12) taille++;
    }
  }
  return Uint8Array.from(out);
}

export function runLength(o) {
  const out = [];
  for (let i = 0; i < o.length;) {
    const n = o[i++];
    if (n === 128) break;
    if (n < 128) { for (let k = 0; k <= n; k++) out.push(o[i++]); }
    else { const v = o[i++]; for (let k = 0; k < 257 - n; k++) out.push(v); }
  }
  return Uint8Array.from(out);
}

/* Décoder un flux selon ses /Filter et /DecodeParms. S'arrête (sans erreur)
   devant un filtre d'image, et dit lequel. */
export const FILTRES_IMAGE = new Set(["DCTDecode", "JPXDecode", "CCITTFaxDecode", "JBIG2Decode", "DCT", "CCF"]);
export async function decoder(fluxPdf) {
  const d = fluxPdf.dict;
  let filtres = d.get("Filter") || [], params = d.get("DecodeParms") || d.get("DP") || [];
  if (!Array.isArray(filtres)) filtres = [filtres];
  if (!Array.isArray(params)) params = [params];
  let o = fluxPdf.donnees;
  for (let i = 0; i < filtres.length; i++) {
    const f = filtres[i] instanceof Nom ? filtres[i].nom : String(filtres[i]);
    const p = params[i] || null;
    if (FILTRES_IMAGE.has(f)) return { octets: o, reste: filtres.slice(i).map((x) => x.nom), params: params.slice(i) };
    if (f === "FlateDecode" || f === "Fl") o = predicteur(await inflate(o), p);
    else if (f === "LZWDecode" || f === "LZW") o = predicteur(lzw(o, p && p.get && p.get("EarlyChange") === 0 ? 0 : 1), p);
    else if (f === "ASCIIHexDecode" || f === "AHx") o = asciiHex(o);
    else if (f === "ASCII85Decode" || f === "A85") o = ascii85(o);
    else if (f === "RunLengthDecode" || f === "RL") o = runLength(o);
    else if (f === "Crypt") continue;
    else throw new Error("filtre PDF non géré : " + f);
  }
  return { octets: o, reste: [], params: [] };
}
