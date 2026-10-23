/* Ce qu'une photo raconte d'elle-même : les métadonnées EXIF d'un JPEG.

   Un téléphone y écrit sa marque, la date, l'ORIENTATION (une photo prise
   de côté est stockée couchée, avec la consigne « à tourner de 90° ») et,
   souvent, la POSITION GPS de la prise de vue. Envoyer la photo, c'est
   envoyer tout ça.

   Ici : lire ces informations (pour les montrer), et les RETIRER sans
   toucher à l'image elle-même — les segments de métadonnées sont ôtés du
   fichier, les pixels restent octet pour octet ceux d'origine. */

/* Les segments d'un JPEG : [{ marqueur, debut, fin }]. */
function segments(o) {
  if (o[0] !== 0xff || o[1] !== 0xd8) return null;
  const out = [];
  let p = 2;
  while (p + 4 <= o.length) {
    if (o[p] !== 0xff) return out;
    const m = o[p + 1];
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { p += 2; continue; }
    if (m === 0xda) { out.push({ marqueur: m, debut: p, fin: o.length }); return out; }  // les données d'image : jusqu'au bout
    const lg = (o[p + 2] << 8) | o[p + 3];
    out.push({ marqueur: m, debut: p, fin: p + 2 + lg });
    p += 2 + lg;
  }
  return out;
}

/* Lire l'EXIF d'un JPEG : { orientation, marque, modele, date, gps: { lat, lon, alt } }. */
export function lireExif(o) {
  const s = segments(o);
  if (!s) return null;
  const app1 = s.find((x) => x.marqueur === 0xe1 && o[x.debut + 4] === 0x45 && o[x.debut + 5] === 0x78 && o[x.debut + 6] === 0x69 && o[x.debut + 7] === 0x66);
  if (!app1) return { orientation: 1 };
  const t = app1.debut + 10;                            // le début de l'en-tête TIFF
  const le = o[t] === 0x49;
  const u16 = (p) => (le ? o[p] | (o[p + 1] << 8) : (o[p] << 8) | o[p + 1]);
  const u32 = (p) => (le ? (o[p] | (o[p + 1] << 8) | (o[p + 2] << 16) | (o[p + 3] << 24)) >>> 0 : ((o[p] << 24) | (o[p + 1] << 16) | (o[p + 2] << 8) | o[p + 3]) >>> 0);
  const lireIfd = (off) => {
    const tags = new Map();
    const p = t + off;
    if (p + 2 > app1.fin) return tags;
    const n = u16(p);
    for (let i = 0; i < n; i++) {
      const e = p + 2 + i * 12;
      if (e + 12 > app1.fin) break;
      tags.set(u16(e), { type: u16(e + 2), nombre: u32(e + 4), valeur: e + 8 });
    }
    return tags;
  };
  const valeur = (tag) => {
    if (!tag) return null;
    const { type, nombre } = tag;
    const taille = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 1;
    const p = taille * nombre > 4 ? t + u32(tag.valeur) : tag.valeur;
    if (type === 2) { let s2 = ""; for (let i = 0; i < nombre - 1 && p + i < app1.fin; i++) s2 += String.fromCharCode(o[p + i]); return s2.trim(); }
    if (type === 3) return u16(p);
    if (type === 4) return u32(p);
    if (type === 5) { const L = []; for (let i = 0; i < nombre; i++) { const d = u32(p + 8 * i + 4); L.push(d ? u32(p + 8 * i) / d : 0); } return L; }
    return null;
  };
  const ifd0 = lireIfd(u32(t + 4));
  const out = { orientation: valeur(ifd0.get(0x112)) || 1, marque: valeur(ifd0.get(0x10f)), modele: valeur(ifd0.get(0x110)), date: valeur(ifd0.get(0x132)) };
  const exifPtr = valeur(ifd0.get(0x8769));
  if (exifPtr) { const ex = lireIfd(exifPtr); out.date = valeur(ex.get(0x9003)) || out.date; }
  const gpsPtr = valeur(ifd0.get(0x8825));
  if (gpsPtr) {
    const g = lireIfd(gpsPtr);
    const dms = (v) => (v && v.length === 3 ? v[0] + v[1] / 60 + v[2] / 3600 : null);
    const lat = dms(valeur(g.get(2))), lon = dms(valeur(g.get(4)));
    if (lat !== null && lon !== null) {
      out.gps = { lat: valeur(g.get(1)) === "S" ? -lat : lat, lon: valeur(g.get(3)) === "W" ? -lon : lon };
      const alt = valeur(g.get(6));
      if (alt) out.gps.alt = alt[0];
    }
  }
  return out;
}

/* Retirer les métadonnées d'un JPEG sans le recompresser : APP1 (EXIF,
   XMP), APP13 (IPTC), APP2 hors profil de couleur, commentaires. */
export function nettoyerJpeg(o) {
  const s = segments(o);
  if (!s) return null;
  const gardes = [Uint8Array.of(0xff, 0xd8)];
  let retires = 0;
  for (const x of s) {
    const m = x.marqueur;
    const profilIcc = m === 0xe2 && String.fromCharCode(...o.subarray(x.debut + 4, x.debut + 15)) === "ICC_PROFILE";
    if (m === 0xe1 || m === 0xed || m === 0xfe || (m >= 0xe3 && m <= 0xef) || (m === 0xe2 && !profilIcc)) { retires += x.fin - x.debut; continue; }
    gardes.push(o.subarray(x.debut, x.fin));
  }
  const n = gardes.reduce((a, b) => a + b.length, 0), out = new Uint8Array(n);
  let i = 0;
  for (const g of gardes) { out.set(g, i); i += g.length; }
  return { octets: out, retires };
}

/* Un JPEG nettoyé perd aussi sa consigne d'orientation : une photo prise
   en portrait s'afficherait couchée. On lui rend un EXIF minuscule, qui ne
   dit QUE cela (34 octets : l'étiquette 0x0112). */
export function avecOrientation(o, orientation) {
  if (!orientation || orientation === 1) return o;
  const app1 = Uint8Array.of(0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8,
    0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0);
  // après SOI et l'éventuel APP0 (JFIF), qui doit rester premier
  let p = 2;
  if (o[2] === 0xff && o[3] === 0xe0) p = 4 + ((o[4] << 8) | o[5]);
  const out = new Uint8Array(o.length + app1.length);
  out.set(o.subarray(0, p), 0);
  out.set(app1, p);
  out.set(o.subarray(p), p + app1.length);
  return out;
}

/* Même chose pour un PNG : ses morceaux de texte et d'EXIF (tEXt, iTXt, zTXt, eXIf, tIME). */
export function nettoyerPng(o) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((x, i) => o[i] === x)) return null;
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  const gardes = [o.subarray(0, 8)];
  let p = 8, retires = 0;
  while (p + 12 <= o.length) {
    const lg = v.getUint32(p);
    const type = String.fromCharCode(o[p + 4], o[p + 5], o[p + 6], o[p + 7]);
    const fin = p + 12 + lg;
    if (["tEXt", "iTXt", "zTXt", "eXIf", "tIME"].includes(type)) retires += fin - p;
    else gardes.push(o.subarray(p, fin));
    p = fin;
    if (type === "IEND") break;
  }
  const n = gardes.reduce((a, b) => a + b.length, 0), out = new Uint8Array(n);
  let i = 0;
  for (const g of gardes) { out.set(g, i); i += g.length; }
  return { octets: out, retires };
}

/* La matrice PDF qui dessine un JPEG stocké « couché » à l'endroit, dans
   le rectangle (x, y, l, h) visible — sans le recompresser. */
export function matriceOrientation(orientation, x, y, l, h) {
  switch (orientation) {
    case 2: return [-l, 0, 0, h, x + l, y];
    case 3: return [-l, 0, 0, -h, x + l, y + h];
    case 4: return [l, 0, 0, -h, x, y + h];
    case 5: return [0, -h, -l, 0, x + l, y + h];
    case 6: return [0, -h, l, 0, x, y + h];
    case 7: return [0, h, l, 0, x, y];
    case 8: return [0, h, -l, 0, x + l, y];
    default: return [l, 0, 0, h, x, y];
  }
}
