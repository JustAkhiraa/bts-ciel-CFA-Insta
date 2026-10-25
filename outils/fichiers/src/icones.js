/* Les pictogrammes des outils : des traits sur une grille de 24, dans le
   style des icônes du site (trait 1,7, bouts arrondis). */

const D = {
  fusionner: '<rect x="3" y="3" width="10" height="13" rx="1.5"/><rect x="11" y="8" width="10" height="13" rx="1.5"/><path d="M14.5 14.5h4M16.5 12.5v4"/>',
  diviser: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6 20 18M8.6 16.4 20 6"/>',
  extraire: '<path d="M13 3H6v18h12V8z"/><path d="M13 3v5h5"/><path d="M9 14h6m-2.5-2.5L15 14l-2.5 2.5"/>',
  supprimer: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  organiser: '<rect x="3" y="3" width="7" height="8" rx="1"/><rect x="14" y="3" width="7" height="8" rx="1"/><rect x="3" y="13" width="7" height="8" rx="1"/><rect x="14" y="13" width="7" height="8" rx="1"/>',
  pivoter: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  "images-pdf": '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  scanner: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  "pdf-jpg": '<path d="M12 3H5v18h14V10"/><path d="M12 3v7h7"/><path d="m8 18 3-4 2 2.5 1.5-2L17 18z"/>',
  "pdf-images": '<rect x="3" y="3" width="13" height="13" rx="1.5"/><path d="m3 13 4-4 4 4 2-2 3 3"/><path d="M19 8v13H8"/>',
  numeroter: '<path d="M9 3 7 21M17 3l-2 18M4 8h17M3 16h17"/>',
  filigrane: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>',
  texte: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  signer: '<path d="m15 4 5 5L9 20H4v-5z"/><path d="M13 6l5 5"/>',
  recadrer: '<path d="M6 2v16h16"/><path d="M2 6h16v16"/>',
  metadonnees: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  compresser: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  proteger: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  deverrouiller: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/>',
  reparer: '<path d="M17.2 3.6a4.8 4.8 0 0 0-5.1 7.6L4.6 18.7a1.9 1.9 0 0 0 2.7 2.7l7.5-7.5a4.8 4.8 0 0 0 5.6-6.8l-2.9 2.9-2.6-.7-.7-2.6z"/>',
  convertir: '<path d="M4 7h14l-3-3M20 17H6l3 3"/>',
  "compresser-image": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v6H3M15 21v-6h6"/>',
  redimensionner: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  "recadrer-image": '<path d="M6 2v16h16"/><path d="M2 6h16v16"/><path d="M10 10h4v4"/>',
  "pivoter-image": '<path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M12 21V12M8 17l4 4 4-4"/>',
  exif: '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/><path d="M3 3l18 18"/>',
  "qr-creer": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20.5h1.5M20.5 14v1.5"/>',
  "qr-lire": '<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><path d="M6 12h12"/>',
  "zip-creer": '<path d="M3 4h18v4H3zM5 8v12h14V8"/><path d="M10 12h4"/>',
  "zip-ouvrir": '<path d="M5 8v12h14V8"/><path d="M3 4h7l2 4M21 4h-7l-2 4"/><path d="M12 11v6m-2.5-2.5L12 17l2.5-2.5"/>',
  empreinte: '<path d="M7 5.5A8 8 0 0 1 20 12v1M4 9a8 8 0 0 0-.5 3M8.5 20A12 12 0 0 0 10 13a2 2 0 0 1 4 0c0 3-.4 5.5-1.3 7.6M7 17.5c.5-1.4.8-2.9.8-4.5a4.2 4.2 0 0 1 8.4 0c0 1.7-.2 3.3-.5 4.8M19.5 17c.3-1.3.5-2.7.5-4"/>',
  "mots-de-passe": '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
  "texte-propre": '<path d="M4 6h16M4 10h16M4 14h10M4 18h7"/><path d="m15 17 2 2 4-4"/>',
  base64: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  depot: '<path d="M12 15V3m-4.5 4.5L12 3l4.5 4.5"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  cadenas: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  retour: '<path d="M19 12H5m6-6-6 6 6 6"/>',
};

export function icone(nom) {
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (D[nom] || D.organiser) + "</svg>";
}
