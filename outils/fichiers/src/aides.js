/* Les petits outils du navigateur que partagent les outils de l'atelier :
   reconnaître un fichier à ses premiers octets, décoder une image,
   l'encoder en JPEG/PNG/WebP par le canevas, nommer un fichier produit. */

import { lireExif } from "./exif.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* « 1,4 Mo » */
export function taille(n) {
  if (n < 1024) return n + " o";
  const u = ["Ko", "Mo", "Go"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < 2);
  return (n >= 100 ? Math.round(n) : n.toFixed(1).replace(".", ",")) + " " + u[i];
}
export const pourcent = (avant, apres) => (avant ? Math.round((1 - apres / avant) * 100) : 0);

/* Le nom sans son extension, et un nom de sortie : « cours.pdf » → « cours-compresse.pdf ». */
export const sansExtension = (nom) => String(nom).replace(/\.[a-z0-9]{1,5}$/i, "");
export const nomSortie = (nom, suffixe, ext) => sansExtension(nom) + (suffixe ? "-" + suffixe : "") + "." + ext;

/* Ce qu'est un fichier, d'après ses premiers octets — l'extension peut mentir. */
export function typeDe(o, nom = "") {
  const s = (i, t) => o.length >= i + t.length && [...t].every((c, k) => o[i + k] === c.charCodeAt(0));
  const debut = String.fromCharCode(...o.subarray(0, 1024));
  if (debut.includes("%PDF-")) return "pdf";
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return "jpeg";
  if (s(0, "\x89PNG")) return "png";
  if (s(0, "GIF8")) return "gif";
  if (s(0, "RIFF") && s(8, "WEBP")) return "webp";
  if (s(0, "BM")) return "bmp";
  if (s(4, "ftyp")) {
    const marque = String.fromCharCode(...o.subarray(8, 12));
    if (/^avi[fs]$/.test(marque)) return "avif";
    if (/^(hei[cxms]|hev[cx]|mif1|msf1)$/.test(marque)) return "heic";
  }
  if (s(0, "II*\0") || s(0, "MM\0*")) return "tiff";
  if (s(0, "\0\0\x01\0")) return "ico";
  if (s(0, "PK\x03\x04") || s(0, "PK\x05\x06")) return /\.(docx|xlsx|pptx|odt|ods|odp)$/i.test(nom) ? "bureautique" : "zip";
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(debut)) return "svg";
  return "autre";
}
export const IMAGES = new Set(["jpeg", "png", "gif", "webp", "bmp", "avif", "svg", "ico", "heic", "tiff"]);
export const MIME = { jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon", heic: "image/heic", tiff: "image/tiff", pdf: "application/pdf", zip: "application/zip" };
export const EXTENSION = { jpeg: "jpg", png: "png", gif: "gif", webp: "webp", bmp: "bmp", avif: "avif", svg: "svg", ico: "ico", heic: "heic", tiff: "tif", pdf: "pdf", zip: "zip" };

/* ── les images ── */
/* Décoder une image : { source (dessinable), largeur, hauteur, fermer() }.
   L'orientation EXIF d'une photo est appliquée : elle sort « à l'endroit ». */
export async function decoderImage(octets, type) {
  const blob = new Blob([octets], { type: MIME[type] || "" });
  if (type !== "svg") {
    try {
      const b = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: b, largeur: b.width, hauteur: b.height, fermer: () => b.close() };
    } catch (e) { /* on essaie l'élément <img>, plus tolérant */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    let w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) { w = 1024; h = 1024; }                  // un SVG sans taille
    return { source: img, largeur: w, hauteur: h, fermer: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    if (type === "heic") throw new Error("ce navigateur ne lit pas le format HEIC des iPhone — sur l'iPhone : Réglages → Appareil photo → Formats → « Le plus compatible », ou partagez la photo « en JPEG »");
    if (type === "tiff") throw new Error("ce navigateur ne lit pas le format TIFF (Safari le lit) — convertissez-le d'abord en PNG ou JPEG");
    throw new Error("image illisible ou abîmée");
  }
}

export function canevas(l, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(l)); c.height = Math.max(1, Math.round(h));
  return c;
}

/* Dessiner une image réduite proprement : par moitiés successives, puis
   le dernier pas — une réduction brutale de 4000 à 400 px « crénelle ». */
export function dessinerReduit(img, l, h, { fond = null, transformer = null } = {}) {
  let src = img.source, sl = img.largeur, sh = img.hauteur;
  while (sl / 2 >= l * 1.05 && sh / 2 >= h * 1.05 && !transformer) {
    const c = canevas(Math.round(sl / 2), Math.round(sh / 2));
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(src, 0, 0, c.width, c.height);
    src = c; sl = c.width; sh = c.height;
  }
  const c = canevas(l, h);
  const x = c.getContext("2d");
  if (fond) { x.fillStyle = fond; x.fillRect(0, 0, c.width, c.height); }
  x.imageSmoothingQuality = "high";
  if (transformer) transformer(x, src, sl, sh);
  else x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/* Le canevas en fichier. Si le navigateur ne sait pas écrire le format
   demandé, il rend du PNG : on le signale plutôt que de mentir. */
export function encoder(c, type = "image/jpeg", qualite = 0.85) {
  return new Promise((ok, ko) => c.toBlob((b) => {
    if (!b) return ko(new Error("l'image est trop grande pour ce navigateur"));
    if (b.type !== type) return ko(new Error("ce navigateur ne sait pas écrire le format " + type.replace("image/", "").toUpperCase()));
    ok(b);
  }, type, qualite));
}

export const octetsDe = async (blob) => new Uint8Array(await blob.arrayBuffer());

/* Les pixels RGBA d'une image décodée. */
export function pixelsDe(img) {
  const c = canevas(img.largeur, img.hauteur);
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img.source, 0, 0, c.width, c.height);
  return { largeur: c.width, hauteur: c.height, pixels: x.getImageData(0, 0, c.width, c.height).data };
}

/* Une image prête pour le PDF : un JPEG est repris TEL QUEL (sans perte,
   son orientation EXIF corrigée par le dessin) ; le reste devient des
   pixels compressés sans perte. « alleger » : tout en JPEG, ≤ 2000 px. */
export async function imagePourPdf(entree, { alleger = false } = {}) {
  if (entree.type === "jpeg" && !alleger) return { type: "jpeg", octets: entree.octets, orientation: (lireExif(entree.octets) || {}).orientation || 1 };
  const img = await decoderImage(entree.octets, entree.type);
  try {
    if (alleger) {
      const k = Math.min(1, 2000 / Math.max(img.largeur, img.hauteur));
      const c = dessinerReduit(img, img.largeur * k, img.hauteur * k, { fond: "#ffffff" });
      return { type: "jpeg", octets: await octetsDe(await encoder(c, "image/jpeg", 0.82)), orientation: 1 };
    }
    return { type: "pixels", ...pixelsDe(img) };
  } finally { img.fermer(); }
}

/* Télécharger un Blob tout de suite (sans passer par un lien affiché). */
export function telecharger(blob, nom) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

export async function copier(texte) {
  try { await navigator.clipboard.writeText(texte); return true; }
  catch (e) {
    const t = document.createElement("textarea");
    t.value = texte; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

/* Une valeur au hasard dans [0, n), sans biais (rejet des tirages en trop). */
export function hasard(n) {
  const lim = Math.floor(0x100000000 / n) * n;
  const t = new Uint32Array(1);
  do crypto.getRandomValues(t); while (t[0] >= lim);
  return t[0] % n;
}
