/* Le livre numérique (EPUB 3) : un ZIP dont la première entrée est
   « mimetype » (non compressée), un conteneur qui désigne le paquet
   (content.opf : métadonnées, inventaire, ordre de lecture), une table des
   matières (nav.xhtml, et toc.ncx pour les liseuses anciennes), et des
   chapitres en XHTML.

   Deux façons de faire : un texte REDISTRIBUABLE (la liseuse choisit la
   taille des lettres ; le PDF est découpé en chapitres à ses titres), ou
   des pages FIXES (chaque page du PDF est une image : pour un scan, une BD). */

import { creerZip } from "../zip.js";
import { xml, utf8, imagesDe, miseEnPage, identifiant, dateIso, texteDe } from "./commun.js";
import { blocHtml } from "./textes.js";

const CSS = `body{margin:0 4%;font-family:serif;line-height:1.5}
h1,h2,h3,h4,h5,h6{font-family:sans-serif;line-height:1.25;margin:1.4em 0 .5em;page-break-after:avoid}
p{margin:0 0 .7em}figure{margin:1em 0;text-align:center}img{max-width:100%;height:auto}
pre{font-size:.85em;white-space:pre-wrap;background:#f2f2f2;padding:.5em}code{font-family:monospace}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.9em}td,th{padding:.25em .4em;vertical-align:top;text-align:left}
table.borde td,table.borde th{border:1px solid #888}table.libre td,table.libre th{border-bottom:1px solid #ccc}`;

const xhtml = (titre, corps, tete = "") => '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="fr" lang="fr">\n' +
  "<head><meta charset=\"UTF-8\"/><title>" + xml(titre) + '</title><link rel="stylesheet" type="text/css" href="style.css"/>' + tete + "</head>\n<body>\n" + corps + "\n</body>\n</html>\n";

/* Où couper en chapitres : au plus petit niveau de titre qui revient au moins deux fois. */
function chapitres(modele) {
  const tous = modele.pages.flatMap((p) => p.blocs);
  let niveau = 0;
  for (let n = 1; n <= 6 && !niveau; n++) if (tous.filter((b) => b.type === "titre" && b.niveau <= n).length >= 2) niveau = n;
  const out = [];
  let cur = null;
  for (const b of tous) {
    const coupe = niveau ? b.type === "titre" && b.niveau <= niveau : cur && cur.blocs.length >= 60;
    if (!cur || (coupe && cur.blocs.some((x) => x.type !== "titre"))) { cur = { titre: null, blocs: [] }; out.push(cur); }
    if (!cur.titre && b.type === "titre") cur.titre = texteDe(b.runs);
    cur.blocs.push(b);
  }
  if (!out.length) out.push({ titre: modele.titre || "Document", blocs: [] });
  out.forEach((c, i) => { if (!c.titre) c.titre = i === 0 ? modele.titre || "Début" : "Partie " + (i + 1); });
  return out;
}

export async function versEpub(modele, { base, pleinePage = false }) {
  const titre = modele.titre || base;
  const id = "urn:uuid:" + identifiant(titre + "|" + modele.pages.length + "|" + modele.pages.flatMap((p) => p.blocs).length);
  const images = imagesDe(modele);
  const mp = miseEnPage(modele);
  const parties = [];
  let items, toc;
  if (pleinePage) {
    // une page fixe par page du PDF, l'image à pleine taille
    items = modele.pages.map((p, k) => {
      const b = p.blocs.find((x) => x.type === "image");
      const d = b ? b.image.donnees : null;
      const w = d ? d.largeur : Math.round(p.largeur), h = d ? d.hauteur : Math.round(p.hauteur);
      const corps = d ? '<div style="width:100%;height:100%;margin:0;padding:0"><img src="images/' + d.nom + '" alt="Page ' + (k + 1) + '" style="width:100%;height:100%"/></div>' : "";
      parties.push(["OEBPS/page" + (k + 1) + ".xhtml", xhtml("Page " + (k + 1), corps, '<meta name="viewport" content="width=' + w + ", height=" + h + '"/><style>html,body{margin:0;padding:0}</style>')]);
      return { href: "page" + (k + 1) + ".xhtml", titre: "Page " + (k + 1) };
    });
    toc = items;
  } else {
    const chs = chapitres(modele);
    items = chs.map((c, k) => {
      const corps = c.blocs.map((b) => blocHtml(b, modele, { source: (d) => "images/" + d.nom, utile: mp.utile })).join("\n");
      parties.push(["OEBPS/chap" + (k + 1) + ".xhtml", xhtml(c.titre, corps)]);
      return { href: "chap" + (k + 1) + ".xhtml", titre: c.titre };
    });
    toc = items;
  }
  const nav = xhtml("Sommaire", '<nav epub:type="toc" id="toc"><h1>Sommaire</h1><ol>' + toc.map((t) => '<li><a href="' + t.href + '">' + xml(t.titre) + "</a></li>").join("") + "</ol></nav>");
  const ncx = '<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="' + xml(id) + '"/></head><docTitle><text>' + xml(titre) + "</text></docTitle><navMap>" +
    toc.map((t, k) => '<navPoint id="n' + (k + 1) + '" playOrder="' + (k + 1) + '"><navLabel><text>' + xml(t.titre) + '</text></navLabel><content src="' + t.href + '"/></navPoint>').join("") + "</navMap></ncx>";
  const opf = '<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="fr">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">' + xml(id) + "</dc:identifier><dc:title>" + xml(titre) + "</dc:title><dc:language>fr</dc:language>" +
    (modele.auteur ? "<dc:creator>" + xml(modele.auteur) + "</dc:creator>" : "") + '<meta property="dcterms:modified">' + dateIso() + "</meta>" +
    (pleinePage ? '<meta property="rendition:layout">pre-paginated</meta><meta property="rendition:spread">none</meta>' : "") + "</metadata><manifest>" +
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/>' +
    items.map((t, k) => '<item id="c' + (k + 1) + '" href="' + t.href + '" media-type="application/xhtml+xml"/>').join("") +
    images.map((d, k) => '<item id="i' + (k + 1) + '" href="images/' + d.nom + '" media-type="' + d.mime + '"/>').join("") +
    '</manifest><spine toc="ncx">' + items.map((_, k) => '<itemref idref="c' + (k + 1) + '"/>').join("") + "</spine></package>";
  const fichiers = [
    { nom: "mimetype", octets: utf8("application/epub+zip") },
    { nom: "META-INF/container.xml", octets: utf8('<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>') },
    { nom: "OEBPS/content.opf", octets: utf8(opf) }, { nom: "OEBPS/nav.xhtml", octets: utf8(nav) }, { nom: "OEBPS/toc.ncx", octets: utf8(ncx) }, { nom: "OEBPS/style.css", octets: utf8(CSS) },
    ...parties.map(([nom, c]) => ({ nom, octets: utf8(c) })), ...images.map((d) => ({ nom: "OEBPS/images/" + d.nom, octets: d.octets })),
  ];
  return [{ nom: base + ".epub", octets: new Uint8Array(await (await creerZip(fichiers)).arrayBuffer()), type: "application/epub+zip" }];
}
