/* Convertir un PDF : retrouver un document modifiable (traitement de texte,
   tableur, diaporama, livre numérique, page web, Markdown, LaTeX…).

   Le chemin est toujours le même : texte.js RELÈVE chaque lettre à sa
   place, structure.js en refait titres, paragraphes, listes, tableaux et
   images (le « modèle »), puis l'écrivain du format choisi l'écrit. Pour
   une copie exacte de l'aspect, le mode « pages en images » dessine chaque
   page (rendu.js) et la pose telle quelle. Rien ne quitte l'appareil. */

import { lireDocument } from "../pdf/texte.js";
import { rendrePage } from "../pdf/rendu.js";
import { lireMetadonnees } from "../pdf/operations.js";
import { recomposer, texteMisEnPage, lignesEnCases } from "../conversion/structure.js";
import { preparerImages, feuillesDe, feuillesDuTexte } from "../conversion/commun.js";
import * as Textes from "../conversion/textes.js";
import { versDocx, versXlsx, versPptx } from "../conversion/ooxml.js";
import { versOdt, versOds, versOdp } from "../conversion/odf.js";
import { versEpub } from "../conversion/epub.js";
import { choixPages, brancherChoix, lireChoix } from "./pdf.js";
import { sansExtension, encoder, octetsDe } from "../aides.js";

const UN_PDF = { types: ["pdf"], multiple: false, min: 1, accepte: ".pdf,application/pdf", libelle: "Choisir un PDF" };
const pluriel = (n, mot) => n + " " + mot + (n > 1 ? "s" : "");

/* ── les réglages communs ── */
const MODES = (fidele = "Copie exacte : chaque page devient une image (l'aspect est garanti, le texte n'est plus modifiable)") =>
  '<fieldset><legend>Résultat</legend><div class="af-choix">' +
  '<label><input type="radio" name="mode" value="texte" checked> Texte modifiable</label>' +
  '<label><input type="radio" name="mode" value="pages"> Pages en images</label></div><p class="af-aide" data-mode-aide>' +
  "Titres, paragraphes, listes, tableaux et images sont reconstruits : tout se modifie.</p>" +
  '<p class="af-aide" data-mode-aide hidden>' + fidele + "</p></fieldset>";
const FINESSES = (sauts = true) =>
  '<details class="af-plus"><summary>Plus de réglages</summary>' +
  '<label class="af-case"><input type="checkbox" name="images" checked> Garder les images</label>' +
  '<label class="af-case"><input type="checkbox" name="entetes"> Garder les en-têtes, pieds et numéros de page</label>' +
  (sauts ? '<label class="af-case"><input type="checkbox" name="sauts"> Un saut de page là où le PDF changeait de page</label>' : "") +
  '<label class="af-champ"><span>Netteté des pages en images</span><select name="dpi"><option value="110">Écran (110 ppp)</option><option value="150" selected>Bonne (150 ppp)</option><option value="220">Impression (220 ppp)</option></select></label>' +
  "</details>";
function brancherModes(ctx) {
  brancherChoix(ctx);
  const aides = ctx.qa("[data-mode-aide]");
  for (const r of ctx.qa('[name="mode"]')) r.addEventListener("change", () => { const p = ctx.val("mode") === "pages"; aides[0].hidden = p; aides[1].hidden = !p; });
}

/* ── lire le PDF en modèle (texte), ou en pages dessinées ── */
async function modeleTexte(ctx, { images = ctx.val("images") !== false } = {}) {
  const f = ctx.premier;
  const selection = lireChoix(ctx, f.pages);
  if (selection && !selection.length) throw new Error("aucune page choisie : tapez des numéros de pages (ex. 1-3, 5)");
  const lu = await lireDocument(f.doc, { selection, surPage: async (k, n) => { ctx.statut("Lecture de la page " + (k + 1) + " / " + n + "…"); await ctx.souffler(); } });
  ctx.statut("Mise en forme…");
  await ctx.souffler();
  let meta = {};
  try { meta = await lireMetadonnees(f.doc); } catch (e) { /* pas de métadonnées */ }
  const modele = recomposer(lu, { entetes: ctx.val("entetes") === true, images, meta });
  if (images) await preparerImages(modele, f.doc, { surImage: async (n) => { ctx.statut("Image " + n + "…"); await ctx.souffler(); } });
  return { lu, modele };
}
async function modelePages(ctx) {
  const f = ctx.premier;
  const selection = lireChoix(ctx, f.pages) || [...Array(f.pages).keys()];
  if (!selection.length) throw new Error("aucune page choisie : tapez des numéros de pages (ex. 1-3, 5)");
  const k = (+ctx.val("dpi") || 150) / 72;
  let meta = {};
  try { meta = await lireMetadonnees(f.doc); } catch (e) { /* pas de métadonnées */ }
  const pages = [];
  for (const [n, i] of selection.entries()) {
    ctx.statut("Page " + (i + 1) + " (" + (n + 1) + " / " + selection.length + ")…");
    const c = await rendrePage(f.doc, i, { echelle: k });
    const octets = await octetsDe(await encoder(c, "image/jpeg", 0.88));
    const l = c.width / k, h = c.height / k;
    pages.push({ index: i, largeur: l, hauteur: h, blocs: [{ type: "image", image: { donnees: { octets, mime: "image/jpeg", ext: "jpg", largeur: c.width, hauteur: c.height, nom: "page" + String(i + 1).padStart(3, "0") + ".jpg" } }, l, h, boite: null }] });
    c.width = c.height = 0;
    await ctx.souffler();
  }
  return { titre: meta.Title || "", auteur: meta.Author || "", sujet: meta.Subject || "", corps: 11, famille: null, genre: "swiss", pages, stats: { pagesImages: pages.length } };
}

/* Ce que l'atelier a trouvé, dit simplement — et ce qui demande de l'attention. */
function resume(modele, extra = "") {
  const s = modele.stats || {};
  if (s.pagesImages) return pluriel(s.pagesImages, "page") + " posée" + (s.pagesImages > 1 ? "s" : "") + " en image" + (s.pagesImages > 1 ? "s" : "") + ", à l'identique." + extra;
  const blocs = modele.pages.flatMap((p) => p.blocs);
  const n = (t) => blocs.filter((b) => b.type === t).length;
  const morceaux = [pluriel(n("titre"), "titre"), pluriel(n("para"), "paragraphe")];
  if (n("liste")) morceaux.push(pluriel(n("liste"), "liste"));
  if (n("tableau")) morceaux.push(pluriel(n("tableau"), "tableau").replace("tableaus", "tableaux"));
  if (n("image")) morceaux.push(pluriel(n("image"), "image"));
  if (n("code")) morceaux.push(pluriel(n("code"), "bloc") + " de code");
  let h = "Retrouvé dans " + pluriel(modele.pages.length, "page") + " : " + morceaux.join(", ") + ".";
  if (s.entetesRetires) h += " En-têtes et numéros de page retirés (" + s.entetesRetires + ").";
  const vides = s.pagesSansTexte || [];
  if (vides.length === modele.pages.length && vides.length) h += "<br><b>Ce PDF ne contient aucun texte</b> : ce sont des pages scannées ou photographiées. Elles sont reprises comme images ; pour une copie fidèle, choisissez « Pages en images ».";
  else if (vides.length) h += "<br>Page" + (vides.length > 1 ? "s " : " ") + vides.map((i) => i + 1).join(", ") + " : image" + (vides.length > 1 ? "s" : "") + " sans texte (scan), reprise" + (vides.length > 1 ? "s" : "") + " telle" + (vides.length > 1 ? "s" : "") + " quelle" + (vides.length > 1 ? "s" : "") + ".";
  return h + extra;
}
const sortir = (liste) => liste.map((x) => ({ nom: x.nom, blob: new Blob([x.octets], { type: x.type }) }));

/* ── PDF en .docx ── */
const pdfDocx = {
  id: "pdf-docx", titre: "PDF en .docx", resume: "Retrouver un texte modifiable pour un traitement de texte : titres, listes, tableaux, images.",
  mots: "docx doc traitement de texte modifier editer reprendre corriger document bureautique convertir",
  description: "Le PDF est relu lettre par lettre ; l'atelier en reconstruit les titres (repérés à leur taille), les paragraphes, les listes à puces ou numérotées, les tableaux, les liens et les images. Le résultat s'ouvre dans tous les traitements de texte. Une mise en page très libre (colonnes, zones flottantes) ne revient pas à l'identique : pour une copie exacte de l'aspect, choisissez « Pages en images ».",
  entree: UN_PDF,
  options: () => MODES() + choixPages() + FINESSES(),
  brancher: brancherModes,
  bouton: "Convertir en .docx",
  async executer(ctx) {
    const base = sansExtension(ctx.premier.nom);
    if (ctx.val("mode") === "pages") { const m = await modelePages(ctx); return { fichiers: sortir(await versDocx(m, { base, pleinePage: true })), resume: resume(m) }; }
    const { modele } = await modeleTexte(ctx);
    return { fichiers: sortir(await versDocx(modele, { base, sauts: ctx.val("sauts") })), resume: resume(modele) };
  },
};

/* ── PDF en .odt ── */
const pdfOdt = {
  id: "pdf-odt", titre: "PDF en .odt", resume: "Le même travail au format ouvert OpenDocument, celui des suites bureautiques libres.",
  mots: "odt opendocument libre traitement de texte modifier editer document bureautique convertir",
  description: "Titres, paragraphes, listes, tableaux, liens et images sont reconstruits dans un fichier OpenDocument (norme ISO 26300). Pour une copie exacte de l'aspect, choisissez « Pages en images ».",
  entree: UN_PDF,
  options: () => MODES() + choixPages() + FINESSES(),
  brancher: brancherModes,
  bouton: "Convertir en .odt",
  async executer(ctx) {
    const base = sansExtension(ctx.premier.nom);
    if (ctx.val("mode") === "pages") { const m = await modelePages(ctx); return { fichiers: sortir(await versOdt(m, { base, pleinePage: true })), resume: resume(m) }; }
    const { modele } = await modeleTexte(ctx);
    return { fichiers: sortir(await versOdt(modele, { base, sauts: ctx.val("sauts") })), resume: resume(modele) };
  },
};

/* ── PDF en texte, Markdown, page web, RTF, LaTeX, JSON ── */
const FORMATS_TEXTE = [
  ["txt", "Texte brut (.txt)", "Le texte seul, dans l'ordre de lecture."],
  ["txt-page", "Texte mis en page (.txt)", "Chaque ligne à sa place, les colonnes alignées comme sur la page."],
  ["md", "Markdown (.md)", "Pour un wiki, un dépôt de code, des notes : titres, listes, tableaux, liens."],
  ["html", "Page web (.html)", "Un seul fichier, images comprises, lisible sur téléphone."],
  ["rtf", "Texte enrichi (.rtf)", "Lu par tous les traitements de texte, même anciens."],
  ["tex", "LaTeX (.tex)", "Pour reprendre le texte dans un document scientifique."],
  ["json", "Structure (.json)", "Ce que l'atelier a compris, bloc par bloc, pour un programme."],
];
const pdfTexte = {
  id: "pdf-texte", titre: "PDF en texte, Markdown, HTML…", resume: "Sept formats : texte brut ou mis en page, Markdown, page web, RTF, LaTeX, JSON.",
  mots: "txt texte brut markdown md html page web rtf latex tex json extraire copier recuperer le texte convertir",
  description: "Le texte du PDF, remis dans l'ordre de lecture (une page à deux colonnes se lit colonne par colonne), avec ses titres, listes et tableaux selon ce que le format sait dire. Les formats qui ne savent pas ranger une image (Markdown, LaTeX, JSON) la donnent à côté, dans un dossier « images » du ZIP.",
  entree: UN_PDF,
  options: () => '<label class="af-champ"><span>Format</span><select name="format">' + FORMATS_TEXTE.map(([v, t], i) => '<option value="' + v + '"' + (i === 0 ? " selected" : "") + ">" + t + "</option>").join("") + "</select></label>" +
    '<p class="af-aide" data-format-aide>' + FORMATS_TEXTE[0][2] + "</p>" + choixPages() + FINESSES(),
  brancher: (ctx) => {
    brancherChoix(ctx);
    const aide = ctx.q("[data-format-aide]");
    ctx.q('[name="format"]').addEventListener("change", () => { aide.textContent = FORMATS_TEXTE.find((f) => f[0] === ctx.val("format"))[2]; });
  },
  bouton: "Convertir",
  nomZip: "texte",
  async executer(ctx) {
    const base = sansExtension(ctx.premier.nom);
    const format = ctx.val("format");
    const sansImages = format === "txt" || format === "txt-page";
    const { lu, modele } = await modeleTexte(ctx, { images: !sansImages && ctx.val("images") !== false });
    const o = { base, sauts: ctx.val("sauts") };
    const liste = format === "txt" ? Textes.versTxt(modele, o) : format === "txt-page" ? Textes.versTxtPage(texteMisEnPage(lu), o) : format === "md" ? Textes.versMd(modele, o)
      : format === "html" ? Textes.versHtml(modele, o) : format === "rtf" ? Textes.versRtf(modele, o) : format === "tex" ? Textes.versTex(modele, o) : Textes.versJson(modele, o);
    if (!liste[0].octets.length || !modele.stats.lettres) return { fichiers: sortir(liste), resume: resume(modele) };
    return { fichiers: sortir(liste), resume: resume(modele, liste.length > 1 ? " Les images sont à côté du texte : « Télécharger le ZIP » les garde ensemble." : "") };
  },
};

/* ── PDF en livre numérique ── */
const pdfEpub = {
  id: "pdf-epub", titre: "PDF en livre numérique", resume: "Un .epub pour liseuse ou téléphone : le texte s'adapte à l'écran, ou les pages restent fixes.",
  mots: "epub livre numerique liseuse ebook lecture telephone tablette bd bande dessinee convertir",
  description: "En texte redistribuable, la liseuse choisit la taille des lettres et le PDF est découpé en chapitres à ses titres (avec un sommaire). En pages fixes, chaque page reste une image — le bon choix pour un scan ou une bande dessinée.",
  entree: UN_PDF,
  options: () => MODES("Pages fixes : chaque page devient une image, à l'identique (scan, bande dessinée)") + choixPages() + FINESSES(false),
  brancher: brancherModes,
  bouton: "Créer le livre",
  async executer(ctx) {
    const base = sansExtension(ctx.premier.nom);
    if (ctx.val("mode") === "pages") { const m = await modelePages(ctx); return { fichiers: sortir(await versEpub(m, { base, pleinePage: true })), resume: resume(m) }; }
    const { modele } = await modeleTexte(ctx);
    return { fichiers: sortir(await versEpub(modele, { base })), resume: resume(modele) };
  },
};

/* ── PDF en tableur ── */
const pdfTableur = {
  id: "pdf-tableur", titre: "PDF en tableur", resume: "Les tableaux du PDF en .xlsx, .ods ou .csv, les nombres reconnus comme nombres.",
  mots: "xlsx ods csv tsv tableur feuille de calcul tableau donnees chiffres notes releve convertir extraire",
  description: "Chaque tableau du PDF (à bordures ou aligné en colonnes) devient une feuille ; les cases fusionnées le restent, « 12,5 » ou « 45 % » deviennent des nombres. Un PDF sans tableau peut être pris ligne par ligne : chaque grand blanc d'une ligne sépare deux colonnes.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Format</span><select name="format"><option value="xlsx">.xlsx</option><option value="ods">.ods (OpenDocument)</option>' +
    '<option value="csv">.csv (avec ;)</option><option value="csv,">.csv (avec ,)</option><option value="tsv">.tsv (tabulations)</option></select></label>' +
    '<label class="af-champ"><span>Contenu</span><select name="contenu"><option value="tableaux">Les tableaux trouvés</option><option value="lignes">Tout le texte, ligne par ligne</option></select></label></div>' + choixPages(),
  brancher: (ctx) => brancherChoix(ctx),
  bouton: "Convertir",
  nomZip: "tableaux",
  async executer(ctx) {
    const base = sansExtension(ctx.premier.nom);
    const { lu, modele } = await modeleTexte(ctx, { images: false });
    let feuilles = ctx.val("contenu") === "lignes" ? [] : feuillesDe(modele);
    let note = "";
    if (!feuilles.length) {
      feuilles = feuillesDuTexte(lignesEnCases(lu));
      if (ctx.val("contenu") !== "lignes") note = " Aucun tableau trouvé : le texte est pris ligne par ligne, une feuille par page.";
    }
    if (!feuilles.length) throw new Error("ce PDF ne contient aucun texte (pages scannées) : il n'y a rien à mettre en cases");
    const f = ctx.val("format");
    const liste = f === "xlsx" ? await versXlsx(feuilles, modele, { base }) : f === "ods" ? await versOds(feuilles, modele, { base })
      : Textes.versCsv(feuilles, { base, separateur: f === "csv," ? "," : ";", tab: f === "tsv" });
    return { fichiers: sortir(liste), resume: pluriel(feuilles.length, "feuille") + " : " + feuilles.map((x) => x.nom + " (" + x.lignes.length + " lignes)").slice(0, 6).join(", ") + (feuilles.length > 6 ? "…" : "") + "." + note };
  },
};

/* ── PDF en diaporama ── */
const pdfDiaporama = {
  id: "pdf-diaporama", titre: "PDF en diaporama", resume: "Une diapositive par page, en .pptx ou .odp — à l'identique, ou en zones de texte modifiables.",
  mots: "pptx odp diaporama presentation diapositive slides projeter expose oral convertir",
  description: "« Pages en images » garde l'aspect exact de chaque page (idéal pour projeter un support). « Texte modifiable » pose chaque bloc à sa place dans une zone de texte, avec ses tableaux et ses images.",
  entree: UN_PDF,
  options: () => '<label class="af-champ"><span>Format</span><select name="format"><option value="pptx">.pptx</option><option value="odp">.odp (OpenDocument)</option></select></label>' +
    '<fieldset><legend>Résultat</legend><div class="af-choix"><label><input type="radio" name="mode" value="pages" checked> Pages en images</label><label><input type="radio" name="mode" value="texte"> Texte modifiable</label></div></fieldset>' +
    choixPages() + FINESSES(false),
  brancher: (ctx) => brancherChoix(ctx),
  bouton: "Créer le diaporama",
  async executer(ctx) {
    const base = sansExtension(ctx.premier.nom);
    const ecrire = ctx.val("format") === "odp" ? versOdp : versPptx;
    if (ctx.val("mode") === "pages") { const m = await modelePages(ctx); return { fichiers: sortir(await ecrire(m, { base, pleinePage: true })), resume: resume(m) }; }
    const { modele } = await modeleTexte(ctx);
    return { fichiers: sortir(await ecrire(modele, { base, pleinePage: false })), resume: resume(modele) };
  },
};

export const OUTILS = [pdfDocx, pdfOdt, pdfTexte, pdfEpub, pdfTableur, pdfDiaporama];
