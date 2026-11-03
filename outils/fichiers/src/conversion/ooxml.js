/* Les formats Office Open XML (ISO/IEC 29500) : .docx, .xlsx, .pptx.

   Un fichier de ce genre est un ZIP de fichiers XML : un inventaire des
   types ([Content_Types].xml), des « relations » qui relient les parties
   entre elles (_rels/…), le document lui-même, ses styles, ses images.
   L'ORDRE des éléments compte : les lecteurs les plus stricts refusent un
   <w:b/> placé après <w:sz/>. Chaque suite ci-dessous suit le schéma. */

import { creerZip } from "../zip.js";
import { xml, utf8, twips, emu, ENTETE_XML, imagesDe, tailleImage, miseEnPage, couvertures, enteteGras, largeursDe, nomsDeFeuilles, nombre, colonne, grilleDe, dateIso, blocs, texteDe } from "./commun.js";

const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const R_IMAGE = NS_REL + "/image", R_LIEN = NS_REL + "/hyperlink";
const CT = "application/vnd.openxmlformats-officedocument.";
const APPLI = "BTS CIEL — atelier fichiers";

const rels = (liste) => ENTETE_XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  liste.map((r) => '<Relationship Id="' + r.id + '" Type="' + r.type + '" Target="' + xml(r.cible) + '"' + (r.externe ? ' TargetMode="External"' : "") + "/>").join("") + "</Relationships>";
const types = (defauts, surcharges) => ENTETE_XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
  '<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/>' + defauts.join("") +
  surcharges.map(([p, t]) => '<Override PartName="' + p + '" ContentType="' + t + '"/>').join("") + "</Types>";
const proprietes = (modele) => [
  ["docProps/core.xml", ENTETE_XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    (modele.titre ? "<dc:title>" + xml(modele.titre) + "</dc:title>" : "") + (modele.sujet ? "<dc:subject>" + xml(modele.sujet) + "</dc:subject>" : "") + (modele.auteur ? "<dc:creator>" + xml(modele.auteur) + "</dc:creator>" : "") +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + dateIso() + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + dateIso() + "</dcterms:modified></cp:coreProperties>"],
  ["docProps/app.xml", ENTETE_XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>' + APPLI + "</Application></Properties>"],
];
const SURCHARGES_PROPS = [["/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"], ["/docProps/app.xml", CT + "extended-properties+xml"]];
const RELS_RACINE = (principal) => rels([{ id: "rId1", type: NS_REL + "/officeDocument", cible: principal },
  { id: "rId2", type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", cible: "docProps/core.xml" },
  { id: "rId3", type: NS_REL + "/extended-properties", cible: "docProps/app.xml" }]);
async function empaqueter(parties) {
  return new Uint8Array(await (await creerZip(parties.map(([nom, contenu]) => ({ nom, octets: typeof contenu === "string" ? utf8(contenu) : contenu })))).arrayBuffer());
}

/* ══════════════════════ .docx ══════════════════════ */
const JC = { centre: "center", droite: "right", justifie: "both" };
const FORMATS_NUM = { "1": "decimal", "1.1": "decimal", a: "lowerLetter", A: "upperLetter", i: "lowerRoman", I: "upperRoman" };
const PUCES_NIV = ["•", "◦", "▪", "•", "◦", "▪"];

export async function versDocx(modele, { base, sauts = false, pleinePage = false }) {
  const mp = miseEnPage(modele, { pleinePage });
  const relsDoc = [{ id: "rIdStyles", type: NS_REL + "/styles", cible: "styles.xml" }, { id: "rIdNum", type: NS_REL + "/numbering", cible: "numbering.xml" }, { id: "rIdReglages", type: NS_REL + "/settings", cible: "settings.xml" },
    { id: "rIdPolices", type: NS_REL + "/fontTable", cible: "fontTable.xml" }];
  const imgId = new Map();
  for (const d of imagesDe(modele)) { const id = "rIdI" + (imgId.size + 1); imgId.set(d.nom, id); relsDoc.push({ id, type: R_IMAGE, cible: "media/" + d.nom }); }
  const liens = new Map();
  const lienId = (u) => { if (!liens.has(u)) { const id = "rIdL" + (liens.size + 1); liens.set(u, id); relsDoc.push({ id, type: R_LIEN, cible: u, externe: true }); } return liens.get(u); };
  const mono = familleMono(modele);
  let dessin = 0;

  const run = (r, { titre = false } = {}) => {
    let p = "";
    if (r.lien) p += '<w:rStyle w:val="Lienhypertexte"/>';
    const f = r.mono ? mono : r.famille && r.famille !== modele.famille ? r.famille : null;
    if (f) p += '<w:rFonts w:ascii="' + xml(f) + '" w:hAnsi="' + xml(f) + '" w:cs="' + xml(f) + '"/>';
    if (r.gras) p += "<w:b/><w:bCs/>";
    if (r.italique) p += "<w:i/><w:iCs/>";
    if (r.couleur && !r.lien) p += '<w:color w:val="' + r.couleur.toUpperCase() + '"/>';
    if (titre || Math.abs(r.taille - modele.corps) > 0.25) p += '<w:sz w:val="' + Math.round(r.taille * 2) + '"/><w:szCs w:val="' + Math.round(r.taille * 2) + '"/>';
    if (r.souligne && !r.lien) p += '<w:u w:val="single"/>';
    if (r.pos) p += '<w:vertAlign w:val="' + (r.pos === "sup" ? "superscript" : "subscript") + '"/>';
    return "<w:r>" + (p ? "<w:rPr>" + p + "</w:rPr>" : "") + '<w:t xml:space="preserve">' + xml(r.t) + "</w:t></w:r>";
  };
  const runs = (rs, o) => {
    let s = "";
    for (let i = 0; i < rs.length;) {
      const u = rs[i].lien;
      if (!u) { s += run(rs[i], o); i++; continue; }
      let g = "";
      while (i < rs.length && rs[i].lien === u) g += run(rs[i++], o);
      s += '<w:hyperlink r:id="' + lienId(u) + '" w:history="1">' + g + "</w:hyperlink>";
    }
    return s;
  };
  const para = (contenu, { style = null, saut = false, num = null, jc = null, marge = 0, retrait = 0, avant = null, apres = null } = {}) => {
    let p = "";
    if (style) p += '<w:pStyle w:val="' + style + '"/>';
    if (saut) p += "<w:pageBreakBefore/>";
    if (num) p += '<w:numPr><w:ilvl w:val="' + num.niveau + '"/><w:numId w:val="' + num.id + '"/></w:numPr>';
    if (avant !== null || apres !== null) p += "<w:spacing" + (avant !== null ? ' w:before="' + avant + '"' : "") + (apres !== null ? ' w:after="' + apres + '"' : "") + "/>";
    if (marge || retrait) p += '<w:ind w:left="' + twips(marge) + '"' + (retrait ? ' w:firstLine="' + twips(retrait) + '"' : "") + "/>";
    if (jc && JC[jc]) p += '<w:jc w:val="' + JC[jc] + '"/>';
    return "<w:p>" + (p ? "<w:pPr>" + p + "</w:pPr>" : "") + contenu + "</w:p>";
  };
  const image = (d, l, h) => {
    dessin++;
    const cx = emu(l), cy = emu(h);
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + dessin + '" name="Image ' + dessin + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + dessin + '" name="' + xml(d.nom) + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + imgId.get(d.nom) + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  };

  // les listes : une définition pour les puces, une par liste numérotée (qui repart de son premier numéro)
  const abstraits = [abstraitPuces()], nums = ['<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'];
  const corps = [];
  let sautAttendu = false;
  const saut = () => { const s = sautAttendu; sautAttendu = false; return s; };
  for (const { b, premierDePage } of blocs(modele)) {
    if (premierDePage && (sauts || pleinePage)) sautAttendu = true;
    if (b.type === "titre") corps.push(para(runs(b.runs, { titre: true }), { style: "Titre" + Math.min(6, b.niveau), saut: saut(), jc: b.align !== "gauche" && b.align !== "justifie" ? b.align : null }));
    else if (b.type === "para") corps.push(para(runs(b.runs), { saut: saut(), jc: b.align, marge: b.marge, retrait: b.retrait }));
    else if (b.type === "liste") {
      let numId = null;
      const premier = b.items.find((i) => i.ordonnee);
      if (premier) {
        const id = nums.length + 1;
        abstraits.push(abstraitNumeros(abstraits.length, premier));
        nums.push('<w:num w:numId="' + id + '"><w:abstractNumId w:val="' + (abstraits.length - 1) + '"/></w:num>');
        numId = id;
      }
      for (const it of b.items) corps.push(para(runs(it.runs), { style: "Paragraphedeliste", saut: saut(), num: { niveau: it.niveau, id: it.ordonnee && numId ? numId : 1 } }));
    } else if (b.type === "code") b.lignes.forEach((l, i) => corps.push(para(run({ t: l, taille: b.taille || modele.corps, mono: false, famille: null }), { style: "Code", saut: i === 0 && saut() })));
    else if (b.type === "image") {
      const d = b.image.donnees;
      let { l, h } = pleinePage ? { l: b.l, h: b.h } : tailleImage(b, mp.utile);
      if (pleinePage) { const k = Math.min((mp.largeur * 0.995) / l, (mp.hauteur * 0.985) / h); l *= k; h *= k; }
      corps.push(para(image(d, l, h), { saut: saut(), jc: pleinePage ? "centre" : null, avant: pleinePage ? 0 : null, apres: pleinePage ? 0 : null }));
    } else if (b.type === "tableau") {
      if (saut()) corps.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      corps.push(tableauDocx(b, mp, runs, para));
      corps.push(para("", { apres: 0 }));
    }
  }
  if (!corps.length) corps.push(para(""));
  const sect = '<w:sectPr><w:pgSz w:w="' + twips(mp.largeur) + '" w:h="' + twips(mp.hauteur) + '"' + (mp.paysage ? ' w:orient="landscape"' : "") + "/>" +
    '<w:pgMar w:top="' + twips(pleinePage ? 0 : mp.marge) + '" w:right="' + twips(mp.marge) + '" w:bottom="' + twips(pleinePage ? 0 : mp.marge) + '" w:left="' + twips(mp.marge) + '" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
  const document = ENTETE_XML + '<w:document xmlns:w="' + NS_W + '" xmlns:r="' + NS_REL + '" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="' + NS_A + '" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    "<w:body>" + corps.join("") + sect + "</w:body></w:document>";
  const parties = [
    ["[Content_Types].xml", types([], [["/word/document.xml", CT + "wordprocessingml.document.main+xml"], ["/word/styles.xml", CT + "wordprocessingml.styles+xml"],
      ["/word/numbering.xml", CT + "wordprocessingml.numbering+xml"], ["/word/settings.xml", CT + "wordprocessingml.settings+xml"], ["/word/fontTable.xml", CT + "wordprocessingml.fontTable+xml"], ...SURCHARGES_PROPS])],
    ["_rels/.rels", RELS_RACINE("word/document.xml")],
    ["word/document.xml", document],
    ["word/_rels/document.xml.rels", rels(relsDoc)],
    ["word/styles.xml", stylesDocx(modele, mono)],
    ["word/numbering.xml", ENTETE_XML + '<w:numbering xmlns:w="' + NS_W + '">' + abstraits.join("") + nums.join("") + "</w:numbering>"],
    ["word/settings.xml", ENTETE_XML + '<w:settings xmlns:w="' + NS_W + '"><w:defaultTabStop w:val="709"/><w:characterSpacingControl w:val="doNotCompress"/></w:settings>'],
    ["word/fontTable.xml", tablePolices(modele, mono)],
    ...proprietes(modele),
    ...imagesDe(modele).map((d) => ["word/media/" + d.nom, d.octets]),
  ];
  return [{ nom: base + ".docx", octets: await empaqueter(parties), type: CT + "wordprocessingml.document" }];
}
/* La table des polices : le GENRE de chacune, pour qu'un logiciel qui ne
   l'a pas en prenne une semblable (sans empattement, à empattement, fixe). */
function tablePolices(modele, mono) {
  const vues = new Map();
  if (modele.famille) vues.set(modele.famille, modele.genre || "swiss");
  vues.set(mono, "modern");
  for (const p of modele.pages) for (const b of p.blocs) for (const r of b.runs || []) if (r.famille && !vues.has(r.famille)) vues.set(r.famille, r.mono ? "modern" : modele.genre || "swiss");
  return ENTETE_XML + '<w:fonts xmlns:w="' + NS_W + '">' + [...vues].map(([n, g]) => '<w:font w:name="' + xml(n) + '"><w:family w:val="' + g + '"/><w:pitch w:val="' + (g === "modern" ? "fixed" : "variable") + '"/></w:font>').join("") + "</w:fonts>";
}
function familleMono(modele) {
  for (const p of modele.pages) for (const b of p.blocs) for (const r of b.runs || []) if (r.mono && r.famille) return r.famille;
  return "Courier";
}
function abstraitPuces() {
  return '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>' + PUCES_NIV.map((c, n) =>
    '<w:lvl w:ilvl="' + n + '"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="' + c + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + (720 + 720 * n) + '" w:hanging="360"/></w:pPr></w:lvl>').join("") + "</w:abstractNum>";
}
function abstraitNumeros(id, premier) {
  const fmts = [FORMATS_NUM[premier.genreNum] || "decimal", "lowerLetter", "lowerRoman", "decimal", "lowerLetter", "lowerRoman"];
  return '<w:abstractNum w:abstractNumId="' + id + '"><w:multiLevelType w:val="hybridMultilevel"/>' + fmts.map((f, n) =>
    '<w:lvl w:ilvl="' + n + '"><w:start w:val="' + (n === 0 ? premier.debut || 1 : 1) + '"/><w:numFmt w:val="' + f + '"/><w:lvlText w:val="%' + (n + 1) + '."/><w:lvlJc w:val="left"/>' +
    '<w:pPr><w:ind w:left="' + (720 + 720 * n) + '" w:hanging="360"/></w:pPr></w:lvl>').join("") + "</w:abstractNum>";
}
function stylesDocx(modele, mono) {
  const f = modele.famille;
  const polices = (x) => '<w:rFonts w:ascii="' + xml(x) + '" w:hAnsi="' + xml(x) + '" w:cs="' + xml(x) + '" w:eastAsia="' + xml(x) + '"/>';
  const demi = Math.round(modele.corps * 2);
  const titres = [1, 2, 3, 4, 5, 6].map((n) => '<w:style w:type="paragraph" w:styleId="Titre' + n + '"><w:name w:val="heading ' + n + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>' +
    '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="' + (n <= 2 ? 360 : 240) + '" w:after="120"/><w:outlineLvl w:val="' + (n - 1) + '"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="' + Math.round(demi * [1.8, 1.45, 1.2, 1.1, 1, 1][n - 1]) + '"/></w:rPr></w:style>').join("");
  return ENTETE_XML + '<w:styles xmlns:w="' + NS_W + '"><w:docDefaults><w:rPrDefault><w:rPr>' + (f ? polices(f) : "") + '<w:sz w:val="' + demi + '"/><w:szCs w:val="' + demi + '"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' + titres +
    '<w:style w:type="paragraph" w:styleId="Paragraphedeliste"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F3F3F5"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr>' + polices(mono) + '<w:sz w:val="' + Math.round(demi * 0.88) + '"/></w:rPr></w:style>' +
    '<w:style w:type="character" w:styleId="Lienhypertexte"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableauNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '<w:style w:type="table" w:styleId="Grilledutableau"><w:name w:val="Table Grid"/><w:basedOn w:val="TableauNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>' +
    ["top", "left", "bottom", "right", "insideH", "insideV"].map((c) => "<w:" + c + ' w:val="single" w:sz="4" w:space="0" w:color="auto"/>').join("") + "</w:tblBorders></w:tblPr></w:style></w:styles>";
}
function tableauDocx(b, mp, runs, para) {
  const g = couvertures(b.lignes);
  const ls = largeursDe(b, mp.utile).map(twips);
  const tete = enteteGras(b.lignes);
  // les bordures écrites sur le tableau lui-même : certains lecteurs ignorent celles du style
  const bordures = b.borde ? "<w:tblBorders>" + ["top", "left", "bottom", "right", "insideH", "insideV"].map((c) => "<w:" + c + ' w:val="single" w:sz="4" w:space="0" w:color="auto"/>').join("") + "</w:tblBorders>" : "";
  let s = "<w:tbl><w:tblPr>" + (b.borde ? '<w:tblStyle w:val="Grilledutableau"/>' : "") + '<w:tblW w:w="' + ls.reduce((a, x) => a + x, 0) + '" w:type="dxa"/>' + bordures + '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>';
  s += "<w:tblGrid>" + ls.map((w) => '<w:gridCol w:w="' + w + '"/>').join("") + "</w:tblGrid>";
  g.forEach((l, i) => {
    s += "<w:tr>" + (tete && i === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : "");
    l.forEach((x, j) => {
      if (x.genre === "h") return;
      const span = x.c.colspan || 1;
      let w = 0;
      for (let k = 0; k < span; k++) w += ls[j + k] || 0;
      let pr = '<w:tcW w:w="' + w + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : "");
      if (x.genre === "v") pr += "<w:vMerge/>";
      else if ((x.c.rowspan || 1) > 1) pr += '<w:vMerge w:val="restart"/>';
      if (x.genre === "case" && x.c.fond) pr += '<w:shd w:val="clear" w:color="auto" w:fill="' + x.c.fond.toUpperCase() + '"/>';
      const paras = x.genre === "case" && x.c.paras.length ? x.c.paras.map((r) => para(runs(r), { apres: 0 })).join("") : para("", { apres: 0 });
      s += "<w:tc><w:tcPr>" + pr + "</w:tcPr>" + paras + "</w:tc>";
    });
    s += "</w:tr>";
  });
  return s + "</w:tbl>";
}

/* ══════════════════════ .xlsx ══════════════════════ */
export async function versXlsx(feuilles, modele, { base }) {
  const noms = nomsDeFeuilles(feuilles);
  const parties = [];
  const surcharges = [["/xl/workbook.xml", CT + "spreadsheetml.sheet.main+xml"], ["/xl/styles.xml", CT + "spreadsheetml.styles+xml"], ...SURCHARGES_PROPS];
  const relsClasseur = [{ id: "rIdStyles", type: NS_REL + "/styles", cible: "styles.xml" }];
  feuilles.forEach((f, k) => {
    const n = k + 1;
    surcharges.push(["/xl/worksheets/sheet" + n + ".xml", CT + "spreadsheetml.worksheet+xml"]);
    relsClasseur.push({ id: "rId" + n, type: NS_REL + "/worksheet", cible: "worksheets/sheet" + n + ".xml" });
    parties.push(["xl/worksheets/sheet" + n + ".xml", feuilleXlsx(f)]);
  });
  const classeur = ENTETE_XML + '<workbook xmlns="' + NS_S + '" xmlns:r="' + NS_REL + '"><bookViews><workbookView/></bookViews><sheets>' +
    noms.map((nom, k) => '<sheet name="' + xml(nom) + '" sheetId="' + (k + 1) + '" r:id="rId' + (k + 1) + '"/>').join("") + "</sheets></workbook>";
  const styles = ENTETE_XML + '<styleSheet xmlns="' + NS_S + '"><fonts count="2"><font><sz val="11"/></font><font><b/><sz val="11"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  parties.unshift(["[Content_Types].xml", types([], surcharges)], ["_rels/.rels", RELS_RACINE("xl/workbook.xml")], ["xl/workbook.xml", classeur],
    ["xl/_rels/workbook.xml.rels", rels(relsClasseur)], ["xl/styles.xml", styles], ...proprietes(modele));
  return [{ nom: base + ".xlsx", octets: await empaqueter(parties), type: CT + "spreadsheetml.sheet" }];
}
function feuilleXlsx(f) {
  const { nc, fusions } = grilleDe(f);
  const larg = [...Array(nc).keys()].map((j) => {
    if (f.largeurs && f.largeurs[j]) return Math.max(6, Math.min(70, f.largeurs[j] / 5.2));
    return Math.max(6, Math.min(60, Math.max(...f.lignes.map((l) => (l[j] && l[j].texte ? Math.max(...l[j].texte.split("\n").map((x) => x.length)) : 0))) + 2));
  });
  const tete = f.lignes.length > 1 && f.lignes[0].every((c) => !c || c.gras);
  let s = ENTETE_XML + '<worksheet xmlns="' + NS_S + '" xmlns:r="' + NS_REL + '"><sheetViews><sheetView workbookViewId="0">' + (tete ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : "") + "</sheetView></sheetViews>" +
    '<sheetFormatPr defaultRowHeight="15"/><cols>' + larg.map((w, j) => '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + w.toFixed(1) + '" customWidth="1"/>').join("") + "</cols><sheetData>";
  f.lignes.forEach((l, i) => {
    s += '<row r="' + (i + 1) + '">';
    l.forEach((c, j) => {
      if (!c || !c.texte) return;
      const ref = colonne(j) + (i + 1);
      const nb = c.texte.includes("\n") ? null : nombre(c.texte);
      const style = c.texte.includes("\n") ? (c.gras ? 3 : 2) : c.gras ? 1 : nb && nb.pourcent ? 4 : 0;
      if (nb) s += '<c r="' + ref + '"' + (style ? ' s="' + style + '"' : "") + "><v>" + nb.valeur + "</v></c>";
      else s += '<c r="' + ref + '" t="inlineStr"' + (style ? ' s="' + style + '"' : "") + '><is><t xml:space="preserve">' + xml(c.texte) + "</t></is></c>";
    });
    s += "</row>";
  });
  s += "</sheetData>";
  if (fusions.length) s += '<mergeCells count="' + fusions.length + '">' + fusions.map((m) => '<mergeCell ref="' + colonne(m.j) + (m.i + 1) + ":" + colonne(m.j + m.colspan - 1) + (m.i + m.rowspan) + '"/>').join("") + "</mergeCells>";
  return s + '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
}

/* ══════════════════════ .pptx ══════════════════════ */
/* Une diapositive par page. « images » : la page dessinée (fidèle) ;
   sinon des zones de texte modifiables, posées où étaient les blocs. */
export async function versPptx(modele, { base, pleinePage = true }) {
  const p0 = modele.pages[0] || { largeur: 720, hauteur: 540 };
  const W = Math.max(72, Math.min(4032, p0.largeur)), H = Math.max(72, Math.min(4032, p0.hauteur));
  const f = modele.famille || "Arial";
  const parties = [];
  const surcharges = [["/ppt/presentation.xml", CT + "presentationml.presentation.main+xml"], ["/ppt/slideMasters/slideMaster1.xml", CT + "presentationml.slideMaster+xml"],
    ["/ppt/slideLayouts/slideLayout1.xml", CT + "presentationml.slideLayout+xml"], ["/ppt/theme/theme1.xml", CT + "theme+xml"],
    ["/ppt/presProps.xml", CT + "presentationml.presProps+xml"], ["/ppt/viewProps.xml", CT + "presentationml.viewProps+xml"], ["/ppt/tableStyles.xml", CT + "presentationml.tableStyles+xml"], ...SURCHARGES_PROPS];
  const relsPres = [{ id: "rId1", type: NS_REL + "/slideMaster", cible: "slideMasters/slideMaster1.xml" }, { id: "rId2", type: NS_REL + "/theme", cible: "theme/theme1.xml" },
    { id: "rIdPres", type: NS_REL + "/presProps", cible: "presProps.xml" }, { id: "rIdVue", type: NS_REL + "/viewProps", cible: "viewProps.xml" }, { id: "rIdTab", type: NS_REL + "/tableStyles", cible: "tableStyles.xml" }];
  const ids = [];
  const groupe = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const espaces = 'xmlns:a="' + NS_A + '" xmlns:r="' + NS_REL + '" xmlns:p="' + NS_P + '"';
  modele.pages.forEach((page, k) => {
    const n = k + 1;
    const relsDia = [{ id: "rId1", type: NS_REL + "/slideLayout", cible: "../slideLayouts/slideLayout1.xml" }];
    const imgs = new Map();
    const imgId = (d) => { if (!imgs.has(d.nom)) { const id = "rIdI" + (imgs.size + 1); imgs.set(d.nom, id); relsDia.push({ id, type: R_IMAGE, cible: "../media/" + d.nom }); } return imgs.get(d.nom); };
    const liens = new Map();
    const lienId = (u) => { if (!liens.has(u)) { const id = "rIdL" + (liens.size + 1); liens.set(u, id); relsDia.push({ id, type: R_LIEN, cible: u, externe: true }); } return liens.get(u); };
    const kx = W / page.largeur, ky = H / page.hauteur;
    let forme = 1;
    const formes = [];
    const xfrm = (x, y, l, h) => '<a:xfrm><a:off x="' + emu(x) + '" y="' + emu(y) + '"/><a:ext cx="' + Math.max(1, emu(l)) + '" cy="' + Math.max(1, emu(h)) + '"/></a:xfrm>';
    const rpr = (r) => '<a:rPr lang="fr-FR" sz="' + Math.max(100, Math.min(400000, Math.round(r.taille * Math.min(kx, ky) * 100))) + '"' + (r.gras ? ' b="1"' : "") + (r.italique ? ' i="1"' : "") +
      (r.souligne ? ' u="sng"' : "") + (r.pos === "sup" ? ' baseline="30000"' : r.pos === "sub" ? ' baseline="-25000"' : "") + ' dirty="0">' +
      (r.couleur ? '<a:solidFill><a:srgbClr val="' + r.couleur.toUpperCase() + '"/></a:solidFill>' : "") + (r.famille && r.famille !== f ? '<a:latin typeface="' + xml(r.famille) + '"/>' : "") +
      (r.lien ? '<a:hlinkClick r:id="' + lienId(r.lien) + '"/>' : "") + "</a:rPr>";
    const pa = (rs, ppr = "") => "<a:p>" + (ppr ? "<a:pPr" + ppr : "") + rs.map((r) => "<a:r>" + rpr(r) + "<a:t>" + xml(r.t) + "</a:t></a:r>").join("") + '<a:endParaRPr lang="fr-FR" dirty="0"/></a:p>';
    const zone = (x, y, l, h, paras) => {
      forme++;
      formes.push('<p:sp><p:nvSpPr><p:cNvPr id="' + forme + '" name="Texte ' + forme + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>' + xfrm(x, y, l, h) +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/>' + paras + "</p:txBody></p:sp>");
    };
    const ALGN = { centre: ' algn="ctr"', droite: ' algn="r"', justifie: ' algn="just"' };
    for (const b of page.blocs) {
      const bx = b.boite ? b.boite.x0 * kx : 0, by = b.boite ? b.boite.y0 * ky : 0;
      const bl = b.boite ? (b.boite.x1 - b.boite.x0) * kx : W, bh = b.boite ? (b.boite.y1 - b.boite.y0) * ky : H;
      if (b.type === "image") {
        const d = b.image.donnees;
        const plein = pleinePage || !b.boite;
        forme++;
        formes.push('<p:pic><p:nvPicPr><p:cNvPr id="' + forme + '" name="' + xml(d.nom) + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
          '<p:blipFill><a:blip r:embed="' + imgId(d) + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>' + (plein ? xfrm(0, 0, W, H) : xfrm(bx, by, bl, bh)) +
          '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>');
      } else if (b.type === "titre" || b.type === "para") {
        zone(bx, by, Math.min(W - bx, bl * 1.06 + 4), bh, pa(b.runs, (ALGN[b.align] || "") + "/>"));
      } else if (b.type === "liste") {
        const n = b.items.map((it) => pa(it.runs, ' marL="' + emu(18 * (it.niveau + 1)) + '" indent="-' + emu(14) + '">' + (it.ordonnee ? '<a:buAutoNum type="arabicPeriod"' + (it.debut > 1 ? ' startAt="' + it.debut + '"' : "") + "/>" : '<a:buChar char="•"/>') + "</a:pPr>")).join("");
        zone(bx, by, Math.min(W - bx, bl * 1.06 + 4), bh, n);
      } else if (b.type === "code") {
        zone(bx, by, Math.min(W - bx, bl * 1.1 + 4), bh, b.lignes.map((l) => pa([{ t: l, taille: b.taille || 10, mono: true, famille: familleMono(modele) }])).join(""));
      } else if (b.type === "tableau") {
        forme++;
        formes.push(tableauPptx(b, forme, xfrm(bx, by, bl, bh), bl, bh, pa));
      }
    }
    parties.push(["ppt/slides/slide" + n + ".xml", ENTETE_XML + "<p:sld " + espaces + "><p:cSld><p:spTree>" + groupe + formes.join("") + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>']);
    parties.push(["ppt/slides/_rels/slide" + n + ".xml.rels", rels(relsDia)]);
    surcharges.push(["/ppt/slides/slide" + n + ".xml", CT + "presentationml.slide+xml"]);
    relsPres.push({ id: "rIdS" + n, type: NS_REL + "/slide", cible: "slides/slide" + n + ".xml" });
    ids.push('<p:sldId id="' + (255 + n) + '" r:id="rIdS' + n + '"/>');
  });
  const presentation = ENTETE_XML + "<p:presentation " + espaces + ' saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    "<p:sldIdLst>" + ids.join("") + '</p:sldIdLst><p:sldSz cx="' + emu(W) + '" cy="' + emu(H) + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
  const maitre = ENTETE_XML + "<p:sldMaster " + espaces + '><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>' + groupe + "</p:spTree></p:cSld>" +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr></p:titleStyle>' +
    '<p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>';
  const disposition = ENTETE_XML + "<p:sldLayout " + espaces + ' type="blank" preserve="1"><p:cSld name="Vide"><p:spTree>' + groupe + "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>";
  const remplir = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const theme = ENTETE_XML + '<a:theme xmlns:a="' + NS_A + '" name="Atelier"><a:themeElements><a:clrScheme name="Atelier">' +
    [["dk1", "000000"], ["lt1", "FFFFFF"], ["dk2", "1F2937"], ["lt2", "F3F4F6"], ["accent1", "2563EB"], ["accent2", "DC2626"], ["accent3", "16A34A"], ["accent4", "9333EA"], ["accent5", "EA580C"], ["accent6", "0891B2"], ["hlink", "0563C1"], ["folHlink", "954F72"]]
      .map(([k, v]) => "<a:" + k + '><a:srgbClr val="' + v + '"/></a:' + k + ">").join("") + "</a:clrScheme>" +
    '<a:fontScheme name="Atelier"><a:majorFont><a:latin typeface="' + xml(f) + '"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="' + xml(f) + '"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="Atelier"><a:fillStyleLst>' + remplir.repeat(3) + "</a:fillStyleLst><a:lnStyleLst>" + [6350, 12700, 19050].map((w) => '<a:ln w="' + w + '">' + remplir + "</a:ln>").join("") + "</a:lnStyleLst>" +
    "<a:effectStyleLst>" + "<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3) + "</a:effectStyleLst><a:bgFillStyleLst>" + remplir.repeat(3) + "</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>";
  parties.unshift(
    ["[Content_Types].xml", types([], surcharges)], ["_rels/.rels", RELS_RACINE("ppt/presentation.xml")], ["ppt/presentation.xml", presentation], ["ppt/_rels/presentation.xml.rels", rels(relsPres)],
    ["ppt/slideMasters/slideMaster1.xml", maitre], ["ppt/slideMasters/_rels/slideMaster1.xml.rels", rels([{ id: "rId1", type: NS_REL + "/slideLayout", cible: "../slideLayouts/slideLayout1.xml" }, { id: "rId2", type: NS_REL + "/theme", cible: "../theme/theme1.xml" }])],
    ["ppt/slideLayouts/slideLayout1.xml", disposition], ["ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels([{ id: "rId1", type: NS_REL + "/slideMaster", cible: "../slideMasters/slideMaster1.xml" }])],
    ["ppt/theme/theme1.xml", theme], ["ppt/presProps.xml", ENTETE_XML + "<p:presentationPr " + espaces + "/>"],
    ["ppt/viewProps.xml", ENTETE_XML + "<p:viewPr " + espaces + '><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>'],
    ["ppt/tableStyles.xml", ENTETE_XML + '<a:tblStyleLst xmlns:a="' + NS_A + '" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>'], ...proprietes(modele),
    ...imagesDe(modele).map((d) => ["ppt/media/" + d.nom, d.octets]));
  return [{ nom: base + ".pptx", octets: await empaqueter(parties), type: CT + "presentationml.presentation" }];
}
function tableauPptx(b, id, xfrm, l, h, pa) {
  const g = couvertures(b.lignes);
  const ls = largeursDe(b, l);
  const tot = ls.reduce((a, x) => a + x, 0) || 1;
  const k = l / tot;
  const trait = (c) => "<a:ln" + c + ' w="9525"><a:solidFill><a:srgbClr val="808080"/></a:solidFill></a:ln' + c + ">";
  let s = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + id + '" name="Tableau ' + id + '"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>' +
    xfrm.replace("<a:xfrm>", "<p:xfrm>").replace("</a:xfrm>", "</p:xfrm>") + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr' + (enteteGras(b.lignes) ? ' firstRow="1"' : "") + "/>" +
    "<a:tblGrid>" + ls.map((w) => '<a:gridCol w="' + emu(w * k) + '"/>').join("") + "</a:tblGrid>";
  const hl = h / Math.max(1, g.length);
  for (const ligne of g) {
    s += '<a:tr h="' + emu(hl) + '">';
    for (const x of ligne) {
      const c = x.c;
      const attrs = x.genre === "h" ? ' hMerge="1"' : x.genre === "v" ? ' vMerge="1"' : (c.colspan > 1 ? ' gridSpan="' + c.colspan + '"' : "") + (c.rowspan > 1 ? ' rowSpan="' + c.rowspan + '"' : "");
      const paras = x.genre === "case" && c.paras.length ? c.paras.map((r) => pa(r)).join("") : '<a:p><a:endParaRPr lang="fr-FR" dirty="0"/></a:p>';
      s += "<a:tc" + attrs + '><a:txBody><a:bodyPr/><a:lstStyle/>' + paras + '</a:txBody><a:tcPr marL="45720" marR="45720" marT="22860" marB="22860">' +
        (b.borde ? ["L", "R", "T", "B"].map(trait).join("") : "") + (x.genre === "case" && c.fond ? '<a:solidFill><a:srgbClr val="' + c.fond.toUpperCase() + '"/></a:solidFill>' : "") + "</a:tcPr></a:tc>";
    }
    s += "</a:tr>";
  }
  return s + "</a:tbl></a:graphicData></a:graphic></p:graphicFrame>";
}
