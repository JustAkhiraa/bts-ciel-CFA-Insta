/* Lire un QR code avec la caméra — ou dans une photo.

   Le détecteur intégré du navigateur (BarcodeDetector) est pris quand il
   existe : rapide, et souvent présent sur Android et macOS. Sinon, notre
   lecteur (qr-lecture.js) analyse l'image, quatre à cinq fois par seconde.
   Rien ne quitte l'appareil : l'image ne sert qu'à lire le code. */

import { lireQr } from "./qr-lecture.js";

async function detecteurNatif() {
  try {
    if (!("BarcodeDetector" in globalThis)) return null;
    const formats = await BarcodeDetector.getSupportedFormats();
    return formats.includes("qr_code") ? new BarcodeDetector({ formats: ["qr_code"] }) : null;
  } catch (e) {
    return null;
  }
}

function lireCanevas(source, largeur, hauteur, canevas) {
  const k = Math.min(1, 900 / Math.max(largeur, hauteur));
  canevas.width = Math.round(largeur * k); canevas.height = Math.round(hauteur * k);
  const ctx = canevas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canevas.width, canevas.height);
  return lireQr(ctx.getImageData(0, 0, canevas.width, canevas.height));
}

export async function scanner(video, surCode) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("ce navigateur ne donne pas accès à la caméra");
  const flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = flux;
  video.setAttribute("playsinline", "");
  video.muted = true;
  await video.play();
  const natif = await detecteurNatif();
  const canevas = document.createElement("canvas");
  let fini = false;
  const arreter = () => { fini = true; flux.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
  const tour = async () => {
    if (fini) return;
    if (video.readyState >= 2 && video.videoWidth) {
      try {
        let texte = null;
        if (natif) { const r = await natif.detect(video); if (r[0]) texte = r[0].rawValue; }
        if (!texte) { const r = lireCanevas(video, video.videoWidth, video.videoHeight, canevas); if (r) texte = r.texte; }
        if (texte && !fini) { arreter(); surCode(texte); return; }
      } catch (e) { /* une image ratée : la suivante */ }
    }
    setTimeout(tour, 220);
  };
  tour();
  return { arreter };
}

/* Une photo choisie dans la galerie (iPhone : souvent plus simple). */
export async function lireFichier(fichier) {
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const natif = await detecteurNatif();
    if (natif) { const r = await natif.detect(img); if (r[0]) return r[0].rawValue; }
    const r = lireCanevas(img, img.naturalWidth, img.naturalHeight, document.createElement("canvas"));
    return r ? r.texte : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
