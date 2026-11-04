/* Les formats OpenDocument (ISO/IEC 26300) : .odt, .ods, .odp.

   Un ZIP dont la PREMIÈRE entrée s'appelle « mimetype », rangée sans
   compression : c'est par elle qu'un lecteur reconnaît le format. Puis le
   manifeste (META-INF/manifest.xml), le contenu (content.xml), les styles
   communs (styles.xml), les métadonnées (meta.xml) et les images
   (Pictures/). La mise en forme d'un passage vit dans un style
   « automatique », déclaré en tête du contenu et nommé T1, T2… */

import { creerZip } from "../zip.js";
import { xml, utf8, cm, ENTETE_XML, imagesDe, tailleImage, miseEnPage, couvertures, enteteGras, largeursDe, nomsDeFeuilles, nombre, dateIso, blocs } from "./commun.js";

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
  'xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" ' +
  'xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" ' +
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3"';
const MIME = { odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation" };
const famille = (f) => "'" + String(f).replace(/'/g, "") + "'";

async function empaqueter(genre, parties, images) {
  const manifeste = ENTETE_XML + '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">' +
    '<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="' + MIME[genre] + '"/>' +
    parties.map(([n]) => '<manifest:file-entry manifest:full-path="' + n + '" manifest:media-type="text/xml"/>').join("") +
    images.map((d) => '<manifest:file-entry manifest:full-path="Pictures/' + d.nom + '" manifest:media-type="' + d.mime + '"/>').join("") + "</manifest:manifest>";
  const fichiers = [{ nom: "mimetype", octets: utf8(MIME[genre]) }, ...parties.map(([nom, c]) => ({ nom, octets: utf8(c) })),
    { nom: "META-INF/manifest.xml", octets: utf8(manifeste) }, ...images.map((d) => ({ nom: "Pictures/" + d.nom, octets: d.octets }))];
  return new Uint8Array(await (await creerZip(fichiers)).arrayBuffer());
}
const meta = (modele) => ENTETE_XML + "<office:document-meta " + NS + "><office:meta><meta:generator>BTS CIEL — atelier fichiers</meta:generator>" +
  (modele.titre ? "<dc:title>" + xml(modele.titre) + "</dc:title>" : "") + (modele.sujet ? "<dc:subject>" + xml(modele.sujet) + "</dc:subject>" : "") +
  (modele.auteur ? "<meta:initial-creator>" + xml(modele.auteur) + "</meta:initial-creator>" : "") + "<meta:creation-date>" + dateIso().replace("Z", "") + "</meta:creation-date></office:meta></office:document-meta>";

/* Le texte d'un passage : les espaces multiples, tabulations et retours à
   la ligne ont leurs propres éléments (sinon ils se fondent en une espace). */
function texteOdf(s) {
  return xml(s).replace(/\n/g, "<text:line-break/>").replace(/\t/g, "<text:tab/>").replace(/^ /, "<text:s/>").replace(/ {2,}/g, (m) => " <text:s text:c=\"" + (m.length - 1) + "\"/>");
}

/* Les styles automatiques : un par combinaison de mises en forme. */
class Styles {
  constructor(prefixe = "") { this.p = prefixe; this.t = new Map(); this.para = new Map(); this.autres = []; }
  texte(r, corps, { titre = false, echelle = 1 } = {}) {
    const a = [];
    if (r.gras && !titre) a.push('fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"');
    if (r.italique) a.push('fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"');
    if (r.couleur && !r.lien) a.push('fo:color="#' + r.couleur + '"');
    if (echelle !== 1 || Math.abs(r.taille - corps) > 0.25) a.push('fo:font-size="' + (Math.round(r.taille * echelle * 10) / 10) + 'pt"');
    if (r.souligne && !r.lien) a.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
    if (r.pos) a.push('style:text-position="' + (r.pos === "sup" ? "super" : "sub") + ' 58%"');
    if (r.mono && r.famille) a.push('fo:font-family="' + xml(famille(r.famille)) + '"');
    else if (r.mono) a.push("fo:font-family=\"'Courier'\"");
    if (!a.length) return null;
    const cle = a.join(" ");
    if (!this.t.has(cle)) this.t.set(cle, this.p + "T" + (this.t.size + 1));
    return this.t.get(cle);
  }
  paragraphe(parent, props) {
    const cle = parent + "|" + props;
    if (!this.para.has(cle)) this.para.set(cle, { nom: this.p + "P" + (this.para.size + 1), parent, props });
    return this.para.get(cle).nom;
  }
  xml() {
    return [...this.t].map(([a, n]) => '<style:style style:name="' + n + '" style:family="text"><style:text-properties ' + a + "/></style:style>").join("") +
      [...this.para.values()].map((p) => '<style:style style:name="' + p.nom + '" style:family="paragraph"' + (p.parent ? ' style:parent-style-name="' + p.parent + '"' : "") + ">" + p.props + "</style:style>").join("") + this.autres.join("");
  }
}
function passages(runs, st, corps, o) {
  let s = "";
  for (let i = 0; i < runs.length;) {
    const u = runs[i].lien;
    let g = "";
    do {
      const r = runs[i];
      const n = st.texte(r, corps, o);
      g += n ? '<text:span text:style-name="' + n + '">' + texteOdf(r.t) + "</text:span>" : texteOdf(r.t);
      i++;
    } while (u && i < runs.length && runs[i].lien === u);
    s += u ? '<text:a xlink:type="simple" xlink:href="' + xml(u) + '" text:style-name="Internet_20_link">' + g + "</text:a>" : g;
  }
  return s;
}
const ALIGN = { centre: "center", droite: "end", justifie: "justify" };
function propsParagraphe({ align = null, marge = 0, retrait = 0, saut = false, sansEspace = false } = {}) {
  const a = [];
  if (ALIGN[align]) a.push('fo:text-align="' + ALIGN[align] + '"');
  if (marge) a.push('fo:margin-left="' + cm(marge) + '"');
  if (retrait) a.push('fo:text-indent="' + cm(retrait) + '"');
  if (saut) a.push('fo:break-before="page"');
  if (sansEspace) a.push('fo:margin-top="0cm" fo:margin-bottom="0cm"');
  return a.length ? "<style:paragraph-properties " + a.join(" ") + "/>" : "";
}

/* Une liste : une définition par liste (puce ou numéro selon chaque niveau). */
function styleListe(nom, items) {
  let s = '<text:list-style style:name="' + nom + '">';
  for (let n = 0; n < 6; n++) {
    const it = items.find((i) => i.niveau === n) || items[0];
    const pos = '<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="' +
      (0.63 + 0.63 * (n + 1)).toFixed(2) + 'cm" fo:text-indent="-0.63cm" fo:margin-left="' + (0.63 + 0.63 * (n + 1)).toFixed(2) + 'cm"/></style:list-level-properties>';
    s += it.ordonnee
      ? '<text:list-level-style-number text:level="' + (n + 1) + '" style:num-suffix="." style:num-format="' + (/^[aAiI]$/.test(it.genreNum) ? it.genreNum : "1") + '"' + (it.debut > 1 && it === items.find((i) => i.niveau === n) ? ' text:start-value="' + it.debut + '"' : "") + ">" + pos + "</text:list-level-style-number>"
      : '<text:list-level-style-bullet text:level="' + (n + 1) + '" text:bullet-char="' + ["•", "◦", "▪"][n % 3] + '">' + pos + "</text:list-level-style-bullet>";
  }
  return s + "</text:list-style>";
}
function listeOdf(items, nomStyle, contenu, styleP) {
  let s = "";
  const pile = [];
  for (const it of items) {
    while (pile.length > it.niveau + 1) { s += "</text:list-item></text:list>"; pile.pop(); }
    if (pile.length === it.niveau) { s += "<text:list" + (pile.length === 0 ? ' text:style-name="' + nomStyle + '"' : "") + ">"; pile.push(1); }
    else s += "</text:list-item>";
    s += '<text:list-item><text:p text:style-name="' + styleP + '">' + contenu(it.runs) + "</text:p>";
  }
  while (pile.length) { s += "</text:list-item></text:list>"; pile.pop(); }
  return s;
}

/* ══════════════════════ .odt ══════════════════════ */
export async function versOdt(modele, { base, sauts = false, pleinePage = false }) {
  const mp = miseEnPage(modele, { pleinePage });
  const st = new Styles();
  const corps = [];
  const listes = [];
  let nImg = 0, nTab = 0, sautAttendu = false;
  const saut = () => { const s = sautAttendu; sautAttendu = false; return s; };
  const contenu = (runs, o) => passages(runs, st, modele.corps, o);
  for (const { b, premierDePage } of blocs(modele)) {
    if (premierDePage && (sauts || pleinePage)) sautAttendu = true;
    if (b.type === "titre") {
      const n = Math.min(6, b.niveau);
      const props = propsParagraphe({ align: b.align !== "justifie" ? b.align : null, saut: saut() });
      const nom = props ? st.paragraphe("Heading_20_" + n, props) : "Heading_20_" + n;
      corps.push('<text:h text:style-name="' + nom + '" text:outline-level="' + n + '">' + contenu(b.runs, { titre: true }) + "</text:h>");
    } else if (b.type === "para") {
      const props = propsParagraphe({ align: b.align, marge: b.marge, retrait: b.retrait, saut: saut() });
      corps.push('<text:p text:style-name="' + (props ? st.paragraphe("Standard", props) : "Standard") + '">' + contenu(b.runs) + "</text:p>");
    } else if (b.type === "liste") {
      const nom = "L" + (listes.length + 1);
      listes.push(styleListe(nom, b.items));
      const s = saut();
      if (s) corps.push('<text:p text:style-name="' + st.paragraphe("Standard", propsParagraphe({ saut: true, sansEspace: true })) + '"/>');
      corps.push(listeOdf(b.items, nom, contenu, "Liste"));
    } else if (b.type === "code") {
      b.lignes.forEach((l, i) => {
        const props = i === 0 && saut() ? propsParagraphe({ saut: true }) : "";
        corps.push('<text:p text:style-name="' + (props ? st.paragraphe("Preformatted_20_Text", props) : "Preformatted_20_Text") + '">' + texteOdf(l) + "</text:p>");
      });
    } else if (b.type === "image") {
      const d = b.image.donnees;
      let { l, h } = pleinePage ? { l: b.l, h: b.h } : tailleImage(b, mp.utile);
      if (pleinePage) { const k = Math.min((mp.largeur * 0.995) / l, (mp.hauteur * 0.985) / h); l *= k; h *= k; }
      nImg++;
      const props = propsParagraphe({ align: pleinePage ? "centre" : null, saut: saut(), sansEspace: pleinePage });
      corps.push('<text:p text:style-name="' + (props ? st.paragraphe("Standard", props) : "Standard") + '"><draw:frame draw:style-name="fr1" draw:name="Image' + nImg + '" text:anchor-type="as-char" svg:width="' + cm(l) + '" svg:height="' + cm(h) + '" draw:z-index="0">' +
        '<draw:image xlink:href="Pictures/' + d.nom + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>');
    } else if (b.type === "tableau") {
      nTab++;
      corps.push(tableauOdt(b, nTab, st, mp, contenu, saut()));
    }
  }
  if (!corps.length) corps.push('<text:p text:style-name="Standard"/>');
  st.autres.push('<style:style style:name="fr1" style:family="graphic" style:parent-style-name="Graphics"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline" style:horizontal-pos="center" style:horizontal-rel="paragraph"/></style:style>');
  const content = ENTETE_XML + "<office:document-content " + NS + "><office:automatic-styles>" + st.xml() + listes.join("") + "</office:automatic-styles><office:body><office:text>" + corps.join("") + "</office:text></office:body></office:document-content>";
  return [{ nom: base + ".odt", octets: await empaqueter("odt", [["content.xml", content], ["styles.xml", stylesOdt(modele, mp, pleinePage)], ["meta.xml", meta(modele)]], imagesDe(modele)), type: MIME.odt }];
}
function tableauOdt(b, n, st, mp, contenu, saut) {
  const g = couvertures(b.lignes);
  const ls = largeursDe(b, mp.utile);
  const nom = "Tableau" + n;
  st.autres.push('<style:style style:name="' + nom + '" style:family="table"><style:table-properties style:width="' + cm(ls.reduce((a, x) => a + x, 0)) + '" table:align="left"' + (saut ? ' fo:break-before="page"' : "") + "/></style:style>");
  ls.forEach((w, j) => st.autres.push('<style:style style:name="' + nom + ".C" + (j + 1) + '" style:family="table-column"><style:table-column-properties style:column-width="' + cm(w) + '"/></style:style>'));
  const fonds = new Map();
  const styleCase = (fond) => {
    const cle = fond || "";
    if (!fonds.has(cle)) {
      const nc = nom + ".X" + (fonds.size + 1);
      fonds.set(cle, nc);
      st.autres.push('<style:style style:name="' + nc + '" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm"' + (b.borde ? ' fo:border="0.5pt solid #000000"' : ' fo:border-bottom="0.5pt solid #d0d0d6"') + (fond ? ' fo:background-color="#' + fond + '"' : "") + "/></style:style>");
    }
    return fonds.get(cle);
  };
  const tete = enteteGras(b.lignes);
  let s = '<table:table table:name="' + nom + '" table:style-name="' + nom + '">' + ls.map((_, j) => '<table:table-column table:style-name="' + nom + ".C" + (j + 1) + '"/>').join("");
  g.forEach((l, i) => {
    let r = "<table:table-row>";
    for (const x of l) {
      if (x.genre !== "case") { r += "<table:covered-table-cell/>"; continue; }
      const c = x.c;
      r += '<table:table-cell table:style-name="' + styleCase(c.fond) + '" office:value-type="string"' + (c.colspan > 1 ? ' table:number-columns-spanned="' + c.colspan + '"' : "") + (c.rowspan > 1 ? ' table:number-rows-spanned="' + c.rowspan + '"' : "") + ">" +
        (c.paras.length ? c.paras.map((p) => '<text:p text:style-name="Table_20_Contents">' + contenu(p) + "</text:p>").join("") : '<text:p text:style-name="Table_20_Contents"/>') + "</table:table-cell>";
    }
    r += "</table:table-row>";
    s += tete && i === 0 ? "<table:table-header-rows>" + r + "</table:table-header-rows>" : r;
  });
  return s + "</table:table>";
}
function stylesOdt(modele, mp, pleinePage) {
  const c = modele.corps;
  // la police par son nom ET son genre : sans elle, le logiciel en prend une du même genre
  const f = modele.famille ? ' style:font-name="Police1"' : "";
  const faces = modele.famille ? '<office:font-face-decls><style:font-face style:name="Police1" svg:font-family="' + xml(famille(modele.famille)) + '" style:font-family-generic="' + (modele.genre || "swiss") + '" style:font-pitch="variable"/></office:font-face-decls>' : "";
  const titres = [1, 2, 3, 4, 5, 6].map((n) => '<style:style style:name="Heading_20_' + n + '" style:display-name="Heading ' + n + '" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Standard" style:default-outline-level="' + n + '" style:class="text">' +
    '<style:text-properties fo:font-size="' + (Math.round(c * [1.8, 1.45, 1.2, 1.1, 1, 1][n - 1] * 10) / 10) + 'pt" fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/></style:style>').join("");
  const marge = pleinePage ? 0 : mp.marge;
  return ENTETE_XML + "<office:document-styles " + NS + ">" + faces + "<office:styles>" +
    '<style:default-style style:family="paragraph"><style:text-properties fo:font-size="' + c + 'pt"' + f + ' fo:language="fr" fo:country="FR"/></style:default-style>' +
    '<style:style style:name="Standard" style:family="paragraph" style:class="text"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.21cm" fo:line-height="115%"/></style:style>' +
    '<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:class="text"><style:paragraph-properties fo:margin-top="0.42cm" fo:margin-bottom="0.21cm" fo:keep-with-next="always"/></style:style>' + titres +
    '<style:style style:name="Liste" style:family="paragraph" style:parent-style-name="Standard" style:class="list"><style:paragraph-properties fo:margin-bottom="0.1cm"/></style:style>' +
    '<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:line-height="100%" fo:background-color="#f3f3f5"/>' +
    "<style:text-properties fo:font-family=\"'Courier'\" fo:font-size=\"" + (Math.round(c * 0.88 * 10) / 10) + 'pt"/></style:style>' +
    '<style:style style:name="Table_20_Contents" style:display-name="Table Contents" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm"/></style:style>' +
    '<style:style style:name="Internet_20_link" style:display-name="Internet link" style:family="text"><style:text-properties fo:color="#0563c1" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>' +
    '<style:style style:name="Graphics" style:family="graphic"><style:graphic-properties text:anchor-type="as-char" svg:y="0cm" style:wrap="none" style:vertical-pos="top" style:vertical-rel="baseline"/></style:style>' +
    "</office:styles><office:automatic-styles>" +
    '<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="' + cm(mp.largeur) + '" fo:page-height="' + cm(mp.hauteur) + '" style:print-orientation="' + (mp.paysage ? "landscape" : "portrait") + '" ' +
    'fo:margin-top="' + cm(marge) + '" fo:margin-bottom="' + cm(marge) + '" fo:margin-left="' + cm(pleinePage ? 0 : mp.marge) + '" fo:margin-right="' + cm(pleinePage ? 0 : mp.marge) + '"/></style:page-layout>' +
    '</office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>';
}

/* ══════════════════════ .ods ══════════════════════ */
export async function versOds(feuilles, modele, { base }) {
  const noms = nomsDeFeuilles(feuilles);
  const autos = ['<style:style style:name="ceG" style:family="table-cell" style:parent-style-name="Default"><style:text-properties fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/></style:style>',
    '<style:style style:name="ceR" style:family="table-cell" style:parent-style-name="Default"><style:table-cell-properties fo:wrap-option="wrap" style:vertical-align="top"/></style:style>',
    '<style:style style:name="ceGR" style:family="table-cell" style:parent-style-name="Default"><style:table-cell-properties fo:wrap-option="wrap" style:vertical-align="top"/><style:text-properties fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/></style:style>',
    '<number:percentage-style style:name="N1"><number:number number:decimal-places="0" number:min-integer-digits="1"/><number:text>%</number:text></number:percentage-style>',
    '<style:style style:name="ceP" style:family="table-cell" style:parent-style-name="Default" style:data-style-name="N1"/>'];
  let nCol = 0;
  const tables = feuilles.map((f, k) => {
    const nc = Math.max(1, ...f.lignes.map((l) => l.length));
    const g = couvertures(f.lignes.map((l) => l.map((c) => (c ? { ...c, paras: [] } : { couvert: true }))));
    let s = '<table:table table:name="' + xml(noms[k]) + '">';
    for (let j = 0; j < nc; j++) {
      const larg = f.largeurs && f.largeurs[j] ? f.largeurs[j] : Math.max(40, Math.min(300, 6 * Math.max(...f.lignes.map((l) => (l[j] && l[j].texte ? l[j].texte.length : 0)))));
      nCol++;
      autos.push('<style:style style:name="co' + nCol + '" style:family="table-column"><style:table-column-properties style:column-width="' + cm(larg) + '"/></style:style>');
      s += '<table:table-column table:style-name="co' + nCol + '"/>';
    }
    g.forEach((l, i) => {
      s += "<table:table-row>";
      l.forEach((x, j) => {
        if (x.genre !== "case") { s += "<table:covered-table-cell/>"; return; }
        const c = f.lignes[i][j];
        if (!c || !c.texte) { s += "<table:table-cell/>"; return; }
        const multi = c.texte.includes("\n");
        const nb = multi ? null : nombre(c.texte);
        const style = multi ? (c.gras ? "ceGR" : "ceR") : c.gras ? "ceG" : nb && nb.pourcent ? "ceP" : null;
        const span = (c.colspan > 1 ? ' table:number-columns-spanned="' + c.colspan + '"' : "") + (c.rowspan > 1 ? ' table:number-rows-spanned="' + c.rowspan + '"' : "");
        const type = nb ? (nb.pourcent ? ' office:value-type="percentage"' : ' office:value-type="float"') + ' office:value="' + nb.valeur + '"' : ' office:value-type="string"';
        s += "<table:table-cell" + (style ? ' table:style-name="' + style + '"' : "") + type + span + ">" + c.texte.split("\n").map((t) => "<text:p>" + texteOdf(t) + "</text:p>").join("") + "</table:table-cell>";
      });
      s += "</table:table-row>";
    });
    return s + "</table:table>";
  });
  const content = ENTETE_XML + "<office:document-content " + NS + "><office:automatic-styles>" + autos.join("") + "</office:automatic-styles><office:body><office:spreadsheet>" + tables.join("") + "</office:spreadsheet></office:body></office:document-content>";
  const styles = ENTETE_XML + "<office:document-styles " + NS + '><office:styles><style:default-style style:family="table-cell"><style:text-properties fo:language="fr" fo:country="FR"/></style:default-style>' +
    '<style:style style:name="Default" style:family="table-cell"/></office:styles></office:document-styles>';
  return [{ nom: base + ".ods", octets: await empaqueter("ods", [["content.xml", content], ["styles.xml", styles], ["meta.xml", meta(modele)]], []), type: MIME.ods }];
}

/* ══════════════════════ .odp ══════════════════════ */
export async function versOdp(modele, { base, pleinePage = true }) {
  const p0 = modele.pages[0] || { largeur: 720, hauteur: 540 };
  const W = p0.largeur, H = p0.hauteur;
  const st = new Styles("d");
  const pages = [];
  const listes = [];
  let nTab = 0;
  modele.pages.forEach((page, k) => {
    const kx = W / page.largeur, ky = H / page.hauteur, ech = Math.min(kx, ky);
    const formes = [];
    const cadre = (x, y, l, h, interieur, style = "gr1") => formes.push('<draw:frame draw:style-name="' + style + '" draw:layer="layout" svg:width="' + cm(l) + '" svg:height="' + cm(h) + '" svg:x="' + cm(x) + '" svg:y="' + cm(y) + '">' + interieur + "</draw:frame>");
    const contenu = (runs) => passages(runs, st, -1, { echelle: ech });
    for (const b of page.blocs) {
      const bx = b.boite ? b.boite.x0 * kx : 0, by = b.boite ? b.boite.y0 * ky : 0;
      const bl = b.boite ? (b.boite.x1 - b.boite.x0) * kx : W, bh = b.boite ? (b.boite.y1 - b.boite.y0) * ky : H;
      const larg = Math.min(W - bx, bl * 1.06 + 4);
      if (b.type === "image") {
        const plein = pleinePage || !b.boite;
        cadre(plein ? 0 : bx, plein ? 0 : by, plein ? W : bl, plein ? H : bh, '<draw:image xlink:href="Pictures/' + b.image.donnees.nom + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"><text:p/></draw:image>');
      } else if (b.type === "titre" || b.type === "para") {
        const props = propsParagraphe({ align: b.align });
        cadre(bx, by, larg, bh, '<draw:text-box><text:p' + (props ? ' text:style-name="' + st.paragraphe(null, props) + '"' : "") + ">" + contenu(b.type === "titre" ? b.runs.map((r) => ({ ...r, gras: true })) : b.runs) + "</text:p></draw:text-box>", "gr2");
      } else if (b.type === "liste") {
        const nom = "dL" + (listes.length + 1);
        listes.push(styleListe(nom, b.items));
        cadre(bx, by, larg, bh, "<draw:text-box>" + listeOdf(b.items, nom, contenu, st.paragraphe(null, "")) + "</draw:text-box>", "gr2");
      } else if (b.type === "code") {
        cadre(bx, by, Math.min(W - bx, bl * 1.1 + 4), bh, "<draw:text-box>" + b.lignes.map((l) => "<text:p>" + passages([{ t: l, taille: (b.taille || 10), mono: true }], st, -1, { echelle: ech }) + "</text:p>").join("") + "</draw:text-box>", "gr2");
      } else if (b.type === "tableau") {
        nTab++;
        const g = couvertures(b.lignes);
        const ls = largeursDe(b, bl);
        const tot = ls.reduce((a, x) => a + x, 0) || 1;
        ls.forEach((w, j) => st.autres.push('<style:style style:name="dTab' + nTab + ".C" + (j + 1) + '" style:family="table-column"><style:table-column-properties style:column-width="' + cm((w * bl) / tot) + '"/></style:style>'));
        let t = '<table:table table:name="Tableau' + nTab + '">' + ls.map((_, j) => '<table:table-column table:style-name="dTab' + nTab + ".C" + (j + 1) + '"/>').join("");
        for (const l of g) {
          t += "<table:table-row>";
          for (const x of l) {
            if (x.genre !== "case") { t += "<table:covered-table-cell/>"; continue; }
            const c = x.c;
            t += '<table:table-cell table:style-name="' + (b.borde ? "dCaseB" : "dCase") + '" office:value-type="string"' + (c.colspan > 1 ? ' table:number-columns-spanned="' + c.colspan + '"' : "") + (c.rowspan > 1 ? ' table:number-rows-spanned="' + c.rowspan + '"' : "") + ">" +
              (c.paras.length ? c.paras.map((p) => "<text:p>" + contenu(p) + "</text:p>").join("") : "<text:p/>") + "</table:table-cell>";
          }
          t += "</table:table-row>";
        }
        cadre(bx, by, bl, bh, t + "</table:table>");
      }
    }
    pages.push('<draw:page draw:name="page' + (k + 1) + '" draw:master-page-name="Default">' + formes.join("") + "</draw:page>");
  });
  st.autres.push('<style:style style:name="gr1" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none"/></style:style>',
    '<style:style style:name="gr2" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none" draw:auto-grow-height="true" draw:textarea-vertical-align="top" fo:padding-top="0cm" fo:padding-bottom="0cm" fo:padding-left="0cm" fo:padding-right="0cm" fo:wrap-option="wrap"/></style:style>',
    '<style:style style:name="dCase" style:family="table-cell"><style:graphic-properties draw:fill="none"/><style:paragraph-properties fo:border="none"/></style:style>',
    '<style:style style:name="dCaseB" style:family="table-cell"><style:graphic-properties draw:fill="none"/><style:paragraph-properties fo:border="0.5pt solid #808080"/></style:style>');
  const content = ENTETE_XML + "<office:document-content " + NS + "><office:automatic-styles>" + st.xml() + listes.join("") + "</office:automatic-styles><office:body><office:presentation>" + pages.join("") + "</office:presentation></office:body></office:document-content>";
  const styles = ENTETE_XML + "<office:document-styles " + NS + '><office:styles><style:default-style style:family="graphic"><style:text-properties fo:font-size="18pt"' + (modele.famille ? ' fo:font-family="' + xml(famille(modele.famille)) + '"' : "") + ' fo:language="fr" fo:country="FR"/></style:default-style></office:styles>' +
    '<office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="' + cm(W) + '" fo:page-height="' + cm(H) + '" style:print-orientation="' + (W > H ? "landscape" : "portrait") + '"/></style:page-layout>' +
    '<style:style style:name="Mdp1" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#ffffff"/></style:style></office:automatic-styles>' +
    '<office:master-styles><draw:layer-set><draw:layer draw:name="layout"/><draw:layer draw:name="background"/><draw:layer draw:name="backgroundobjects"/><draw:layer draw:name="controls"/><draw:layer draw:name="measurelines"/></draw:layer-set>' +
    '<style:master-page style:name="Default" style:page-layout-name="PM1" draw:style-name="Mdp1"/></office:master-styles></office:document-styles>';
  return [{ nom: base + ".odp", octets: await empaqueter("odp", [["content.xml", content], ["styles.xml", styles], ["meta.xml", meta(modele)]], imagesDe(modele)), type: MIME.odp }];
}
