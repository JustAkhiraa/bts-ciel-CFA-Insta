/* Helvetica, l'une des 14 polices que tout lecteur PDF possède : on peut
   écrire avec elle sans rien embarquer dans le fichier.

   Ses largeurs (en millièmes de la taille du corps) servent à centrer ou à
   aligner à droite un numéro de page, un filigrane. L'encodage est
   WinAnsi (la page de code 1252) : il couvre le français, € et œ compris. */

// les largeurs Helvetica des caractères 32 à 126 (métriques AFM standard)
const ASCII = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

// la plage 0x80–0x9F de la page de code 1252
const CP1252 = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b,
  "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a,
  "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
const LARGEURS_SPECIALES = { 0x80: 556, 0x85: 1000, 0x8c: 1000, 0x9c: 944, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x99: 1000 };

/* Le texte en octets WinAnsi ; ce qui n'y entre pas devient « ? ». */
export function versWinAnsi(s) {
  const out = [];
  for (const c of String(s).normalize("NFC")) {
    const u = c.codePointAt(0);
    if (u >= 32 && u < 127) out.push(u);
    else if (u >= 0xa0 && u <= 0xff) out.push(u);
    else if (CP1252[c]) out.push(CP1252[c]);
    else if (c === " " || c === " ") out.push(0x20);
    else out.push(0x3f);
  }
  return Uint8Array.from(out);
}

function largeurOctet(o) {
  if (o >= 32 && o <= 126) return ASCII[o - 32];
  if (LARGEURS_SPECIALES[o]) return LARGEURS_SPECIALES[o];
  if (o >= 0xc0) {
    // une lettre accentuée a la largeur de sa lettre de base
    const base = String.fromCharCode(o).normalize("NFD")[0];
    if (base && base.charCodeAt(0) < 127) return ASCII[base.charCodeAt(0) - 32];
    if (o === 0xc6) return 1000;
    if (o === 0xe6) return 889;
    if (o === 0xdf) return 611;
    if (o === 0xd8 || o === 0xf8) return o === 0xd8 ? 778 : 611;
  }
  return 556;
}

/* La largeur d'un texte, en points, au corps donné. */
export function largeurTexte(s, corps) {
  let w = 0;
  for (const o of versWinAnsi(s)) w += largeurOctet(o);
  return (w * corps) / 1000;
}
