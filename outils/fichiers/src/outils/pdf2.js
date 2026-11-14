/* Les outils PDF ajoutés le 13 novembre 2026 : mettre en page, nettoyer,
   comparer. Demandé : ce que savent faire les boîtes à outils PDF qu'on
   installe sur un serveur. Ici, comme le reste de l'atelier, tout se fait
   dans le navigateur et rien ne quitte l'appareil.

   Deux familles, et la différence compte pour qui s'en sert :
   · ceux qui RÉARRANGENT le fichier (plusieurs pages par feuille, livret,
     format, signets, pièces jointes, nettoyage) : le texte reste du texte ;
   · ceux qui REDESSINENT des pages (aplatir, caviarder, inverser, pages
     blanches) : ils passent par le moteur de rendu, et une page redessinée
     n'est plus qu'une image. C'est voulu pour un caviardage (ce qui est
     sous le cache n'existe plus), et c'est écrit dans chaque outil. */

import * as Op from "../pdf/operations.js";
import * as Mep from "../pdf/miseenpage.js";
import { DocumentPdf } from "../pdf/lecture.js";
import { rendrePage } from "../pdf/rendu.js";
import { lignesDuDocument, comparerLignes, bilan, rapportTexte, rapportHtml } from "../pdf/comparer.js";
import { Placeur } from "../apercu.js";
import { esc, sansExtension, encoder, octetsDe, canevas } from "../aides.js";
import { choixPages, brancherChoix, lireChoix } from "./pdf.js";

const UN_PDF = { types: ["pdf"], multiple: false, min: 1, accepte: ".pdf,application/pdf", libelle: "Choisir un PDF" };
const DEUX_PDF = { types: ["pdf"], multiple: true, min: 2, accepte: ".pdf,application/pdf", libelle: "Choisir deux PDF" };
const pdf = (octets, nom, note) => ({ nom, blob: new Blob([octets], { type: "application/pdf" }), note });
const pages = (n) => n + " page" + (n > 1 ? "s" : "");
const nbPages = async (octets) => (await (await DocumentPdf.ouvrir(octets)).pages()).length;
const MM = 72 / 25.4;
const FEUILLES = '<option value="A4">A4</option><option value="A3">A3</option><option value="A5">A5</option><option value="Lettre">Lettre (US)</option>';
const QUALITES = '<option value="96">Écran (96 ppp)</option><option value="150" selected>Bonne (150 ppp)</option><option value="220">Fine (220 ppp)</option><option value="300">Impression (300 ppp)</option>';

/* ── plusieurs pages par feuille ── */
const plusieurs = {
  id: "plusieurs-pages", titre: "Plusieurs pages par feuille", resume: "Imprimer 2, 4, 6, 9 ou 16 pages sur chaque feuille : moins de papier, tout sous les yeux.",
  mots: "n-up nup miniature imprimer economiser papier planche vignettes diapositives par page reduire",
  description: "Les pages sont réduites et rangées dans l'ordre de lecture, de gauche à droite puis de haut en bas. La feuille se couche d'elle-même quand les pages y tiennent mieux. Les liens cliquables ne suivent pas : c'est un document à imprimer.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Pages par feuille</span><select name="par"><option>2</option><option selected>4</option><option>6</option><option>8</option><option>9</option><option>16</option></select></label>' +
    '<label class="af-champ"><span>Feuille</span><select name="format">' + FEUILLES + "</select></label>" +
    '<label class="af-champ"><span>Marge (mm)</span><input type="number" name="marge" value="6" min="0" max="40"></label></div>' +
    '<label class="af-case"><input type="checkbox" name="bordure"> Un filet autour de chaque page</label>' + choixPages(),
  brancher: (ctx) => brancherChoix(ctx),
  bouton: "Mettre en page",
  async executer(ctx) {
    const f = ctx.premier;
    const octets = await Mep.plusieursParFeuille(f.doc, { parFeuille: +ctx.val("par"), format: ctx.val("format"), marge: (ctx.val("marge") ?? 6) * MM,
      bordure: ctx.val("bordure"), selection: lireChoix(ctx, f.pages) });
    const n = await nbPages(octets);
    return [pdf(octets, sansExtension(f.nom) + "-" + ctx.val("par") + "-par-feuille.pdf", n + " feuille" + (n > 1 ? "s" : ""))];
  },
};

/* ── livret ── */
const livret = {
  id: "livret", titre: "Livret à plier", resume: "Ranger les pages pour imprimer un cahier : on plie les feuilles en deux, on agrafe au milieu.",
  mots: "brochure cahier plier agrafer imposition booklet recto verso fascicule imprimer",
  description: "Chaque feuille porte deux pages par face, dans l'ordre qui donne un cahier une fois les feuilles empilées et pliées. Le nombre de pages est complété à un multiple de quatre par des pages blanches, à la fin.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Feuille à imprimer</span><select name="format"><option value="A4">A4 (livret A5)</option><option value="A3">A3 (livret A4)</option><option value="Lettre">Lettre (US)</option></select></label></div>',
  bouton: "Faire le livret",
  async executer(ctx) {
    const f = ctx.premier;
    const octets = await Mep.livret(f.doc, { format: ctx.val("format") });
    const feuilles = (await nbPages(octets)) / 2, blanches = feuilles * 4 - f.pages;
    return { fichiers: [pdf(octets, sansExtension(f.nom) + "-livret.pdf", feuilles + " feuille" + (feuilles > 1 ? "s" : "") + " recto verso")],
      resume: "Imprimez en <strong>recto verso</strong>, en retournant sur le <strong>bord court</strong>, puis pliez les " + feuilles + " feuille" + (feuilles > 1 ? "s" : "") + " ensemble."
        + (blanches ? " " + blanches + " page" + (blanches > 1 ? "s blanches ont été ajoutées" : " blanche a été ajoutée") + " à la fin, pour arriver à un multiple de quatre." : "") };
  },
};

/* ── changer le format ── */
const format = {
  id: "format-pages", titre: "Changer le format des pages", resume: "Mettre un PDF en A4, A5, A3 ou Lettre : le contenu est agrandi ou réduit avec la page.",
  mots: "taille papier a4 a5 a3 letter redimensionner echelle agrandir reduire imprimer marge",
  description: "Chaque page est posée, entière et centrée, sur une feuille du format choisi. Une page couchée reçoit une feuille couchée. Les liens cliquables ne suivent pas : c'est fait pour imprimer.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Format</span><select name="format">' + FEUILLES + "</select></label>" +
    '<label class="af-champ"><span>Sens</span><select name="sens"><option value="auto">Comme la page</option><option value="portrait">Debout</option><option value="paysage">Couchée</option></select></label>' +
    '<label class="af-champ"><span>Marge (mm)</span><input type="number" name="marge" value="0" min="0" max="60"></label></div>' +
    '<label class="af-case"><input type="checkbox" name="petit"> Ne pas agrandir une page plus petite que la feuille</label>',
  bouton: "Changer le format",
  async executer(ctx) {
    const f = ctx.premier;
    const octets = await Mep.changerFormat(f.doc, { format: ctx.val("format"), orientation: ctx.val("sens"), marge: (ctx.val("marge") || 0) * MM, agrandir: !ctx.val("petit") });
    return [pdf(octets, sansExtension(f.nom) + "-" + ctx.val("format").toLowerCase() + ".pdf", pages(f.pages) + " en " + ctx.val("format"))];
  },
};

/* ── une seule grande page ── */
const grandePage = {
  id: "grande-page", titre: "Une seule grande page", resume: "Mettre toutes les pages l'une sous l'autre, sur une page unique : à faire défiler d'un trait.",
  mots: "continu defilement rouleau une page longue affiche reunir pages bout a bout",
  description: "Pratique pour lire sans saut de page, ou pour une capture d'un seul tenant. Une page ne peut pas dépasser cinq mètres : au-delà, l'ensemble est réduit pour tenir.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Espace entre les pages (mm)</span><input type="number" name="espace" value="0" min="0" max="50"></label></div>',
  bouton: "Réunir les pages",
  async executer(ctx) {
    const f = ctx.premier;
    const r = await Mep.grandePage(f.doc, { espace: (ctx.val("espace") || 0) * MM });
    return { fichiers: [pdf(r.octets, sansExtension(f.nom) + "-une-page.pdf", Math.round(r.largeur / MM) + " × " + Math.round(r.hauteur / MM) + " mm")],
      resume: r.reduite ? "L'ensemble dépassait la plus grande page permise : il a été réduit pour tenir." : "" };
  },
};

/* ── couper les pages en deux ── */
const couper = {
  id: "couper-deux", titre: "Couper les pages en deux", resume: "Un livre scanné à plat, deux pages par image : chaque moitié redevient une page.",
  mots: "scan livre double page moitie separer gauche droite decouper cahier",
  description: "Chaque page est gardée deux fois, et chaque copie ne montre que sa moitié. Rien n'est redessiné : le texte reste du texte, et la partie cachée reste dans le fichier.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Coupe</span><select name="sens"><option value="vertical">Gauche / droite</option><option value="horizontal">Haut / bas</option></select></label>' +
    '<label class="af-champ"><span>Ordre</span><select name="ordre"><option value="normal">Gauche (ou haut) d\'abord</option><option value="inverse">Droite (ou bas) d\'abord</option></select></label></div>' + choixPages("quelles", "Pages à couper"),
  brancher: (ctx) => brancherChoix(ctx),
  bouton: "Couper",
  async executer(ctx) {
    const f = ctx.premier;
    const octets = await Mep.couperEnDeux(f.doc, { sens: ctx.val("sens"), ordre: ctx.val("ordre"), selection: lireChoix(ctx, f.pages) });
    return [pdf(octets, sansExtension(f.nom) + "-coupe.pdf", pages(await nbPages(octets)))];
  },
};

/* ── superposer ── */
const superposer = {
  id: "superposer", titre: "Superposer deux PDF", resume: "Poser un PDF sur un autre : un papier à en-tête, un tampon, une grille de correction.",
  mots: "calque fond en-tete papier a lettre tampon overlay underlay filigrane image de fond modele",
  description: "Le premier fichier de la liste est le document, le second le calque (glissez-les pour les échanger). Le document garde ses liens, ses signets et son texte ; le calque est ajusté à chaque page.",
  entree: DEUX_PDF,
  options: () => '<fieldset><legend>Le calque passe</legend><div class="af-choix"><label><input type="radio" name="ou" value="dessus" checked> Par-dessus</label>' +
    '<label><input type="radio" name="ou" value="dessous"> Par-dessous (un fond)</label></div></fieldset>' +
    '<label class="af-case"><input type="checkbox" name="repeter" checked> Si le calque a moins de pages, le reprendre du début</label>',
  bouton: "Superposer",
  async executer(ctx) {
    const [doc, calque] = ctx.valides;
    const octets = await Mep.superposer(doc.doc, calque.doc, { dessous: ctx.val("ou") === "dessous", repeter: ctx.val("repeter") });
    return [pdf(octets, sansExtension(doc.nom) + "-superpose.pdf", pages(doc.pages) + " · calque : " + calque.nom)];
  },
};

/* ── nettoyer ── */
const LIBELLES_BILAN = [["scripts", "script ou action automatique", "scripts ou actions automatiques"], ["pieces", "pièce jointe", "pièces jointes"],
  ["liens", "lien", "liens"], ["annotations", "commentaire", "commentaires"], ["formulaires", "champ de formulaire", "champs de formulaire"],
  ["signets", "signet", "signets"], ["metadonnees", "information de la fiche", "informations de la fiche"]];
const nettoyer = {
  id: "nettoyer", titre: "Nettoyer un PDF", resume: "Retirer ce qu'on ne voit pas en lisant : scripts, pièces jointes, liens, commentaires, fiche d'identité.",
  mots: "assainir sanitize javascript script securite piece jointe lien commentaire annotation metadonnees auteur confidentialite",
  description: "Avant d'envoyer un PDF, ou après en avoir reçu un d'une source douteuse. Ce qui est retiré disparaît du fichier, pas seulement de l'affichage. Le bilan dit combien il y en avait : zéro veut dire qu'il n'y en avait pas.",
  entree: UN_PDF,
  options: () => '<fieldset><legend>Retirer</legend><div class="af-cases">' +
    '<label class="af-case"><input type="checkbox" name="scripts" checked> Scripts et actions automatiques (lancer un programme, envoyer un formulaire)</label>' +
    '<label class="af-case"><input type="checkbox" name="pieces" checked> Pièces jointes</label>' +
    '<label class="af-case"><input type="checkbox" name="liens"> Liens cliquables</label>' +
    '<label class="af-case"><input type="checkbox" name="annotations"> Commentaires, notes et surlignages</label>' +
    '<label class="af-case"><input type="checkbox" name="formulaires"> Champs de formulaire</label>' +
    '<label class="af-case"><input type="checkbox" name="signets"> Signets (la table des matières du volet)</label>' +
    '<label class="af-case"><input type="checkbox" name="metadonnees"> Fiche du fichier : titre, auteur, logiciel</label></div></fieldset>',
  bouton: "Nettoyer",
  async executer(ctx) {
    const f = ctx.premier;
    const choix = Object.fromEntries(LIBELLES_BILAN.map(([k]) => [k, !!ctx.val(k)]));
    const r = await Mep.nettoyer(f.doc, choix);
    const trouves = LIBELLES_BILAN.filter(([k]) => choix[k] && r.bilan[k]).map(([k, un, des]) => r.bilan[k] + " " + (r.bilan[k] > 1 ? des : un));
    return { fichiers: [pdf(r.octets, sansExtension(f.nom) + "-nettoye.pdf", pages(f.pages))],
      resume: trouves.length ? "Retiré : " + trouves.join(", ") + "." : "Ce PDF ne contenait rien de ce que vous avez coché : il est recopié tel quel." };
  },
};

/* ── signets ── */
const texteSignets = (liste) => liste.map((s) => "- ".repeat(Math.max(0, s.niveau - 1)) + s.titre + " ; " + (s.page == null ? "?" : s.page + 1)).join("\n");
const signets = {
  id: "signets", titre: "Signets d'un PDF", resume: "Voir, écrire ou retirer la table des matières cliquable du volet de gauche.",
  mots: "table des matieres sommaire plan chapitres navigation outline bookmarks volet",
  description: "Une ligne par signet : son titre, un point-virgule, sa page. Un tiret devant le titre le range sous le signet du dessus. Les signets déjà présents sont affichés : corrigez-les sur place.",
  entree: UN_PDF,
  options: () => '<fieldset><legend>Que faire</legend><div class="af-choix"><label><input type="radio" name="mode" value="ecrire" checked> Écrire ces signets</label>' +
    '<label><input type="radio" name="mode" value="exporter"> Les sortir en texte</label><label><input type="radio" name="mode" value="retirer"> Les retirer</label></div></fieldset>' +
    '<label class="af-champ"><span>Signets (titre ; page)</span><textarea name="liste" rows="8" spellcheck="false" placeholder="Introduction ; 1&#10;- Contexte ; 2&#10;- Méthode ; 4&#10;Conclusion ; 10"></textarea></label>',
  surFichiers(ctx) {
    const f = ctx.premier, champ = ctx.q('[name="liste"]');
    if (!f || !champ) return;
    Mep.lireSignets(f.doc).then((liste) => {
      if (ctx.premier !== f) return;
      champ.value = texteSignets(liste);
      ctx.statut(liste.length ? liste.length + " signet" + (liste.length > 1 ? "s" : "") + " dans ce PDF." : "Ce PDF n'a aucun signet : écrivez les siens ci-dessus.");
      ctx.verifier();
    }).catch(() => {});
  },
  brancher(ctx) { ctx.q('[name="liste"]').addEventListener("input", () => ctx.verifier()); for (const r of ctx.qa('[name="mode"]')) r.addEventListener("change", () => ctx.verifier()); },
  pret: (ctx) => ctx.val("mode") !== "ecrire" || !!(ctx.val("liste") || "").trim(),
  bouton: "Appliquer",
  async executer(ctx) {
    const f = ctx.premier, mode = ctx.val("mode");
    if (mode === "exporter") {
      const liste = await Mep.lireSignets(f.doc);
      if (!liste.length) return { fichiers: [], resume: "Ce PDF n'a aucun signet." };
      return [{ nom: sansExtension(f.nom) + "-signets.txt", blob: new Blob([texteSignets(liste) + "\n"], { type: "text/plain;charset=utf-8" }), note: liste.length + " signet(s)" }];
    }
    const liste = mode === "retirer" ? [] : Mep.lireListeSignets(ctx.val("liste"), f.pages);
    const octets = await Mep.poserSignets(f.doc, liste);
    return [pdf(octets, sansExtension(f.nom) + (liste.length ? "-signets.pdf" : "-sans-signets.pdf"), liste.length ? liste.length + " signet(s)" : "signets retirés")];
  },
};

/* ── pièces jointes ── */
const piecesJointes = {
  id: "pieces-jointes", titre: "Pièces jointes d'un PDF", resume: "Sortir les fichiers qu'un PDF transporte, ou lui en joindre : un tableur, une archive, des sources.",
  mots: "fichier joint attachement embarque annexe trombone extraire ajouter portfolio",
  description: "Déposez le PDF seul pour en sortir les pièces jointes. Déposez le PDF puis d'autres fichiers pour les lui joindre : le premier PDF de la liste est le document, tout le reste est joint.",
  entree: { types: ["pdf", "tout"], multiple: true, min: 1, libelle: "Choisir le PDF, puis les fichiers à joindre" },
  options: () => "",
  pret: (ctx) => ctx.valides.some((f) => f.doc),
  bouton: "Lancer",
  async executer(ctx) {
    const lePdf = ctx.valides.find((f) => f.doc);
    if (!lePdf) throw new Error("il faut un PDF : c'est lui qui porte les pièces jointes");
    const autres = ctx.valides.filter((f) => f !== lePdf);
    if (autres.length) {
      const octets = await Mep.ajouterPieces(lePdf.doc, autres.map((f) => ({ nom: f.nom, octets: f.octets })));
      return [pdf(octets, sansExtension(lePdf.nom) + "-avec-pieces.pdf", autres.length + " pièce" + (autres.length > 1 ? "s jointes" : " jointe"))];
    }
    const liste = await Mep.listerPieces(lePdf.doc);
    if (!liste.length) return { fichiers: [], resume: "Ce PDF ne porte aucune pièce jointe. Pour lui en joindre, ajoutez des fichiers à la liste." };
    return { fichiers: liste.map((p) => ({ nom: p.nom, blob: new Blob([p.octets]), note: p.description || "pièce jointe" })),
      resume: liste.length + " pièce" + (liste.length > 1 ? "s jointes trouvées" : " jointe trouvée") + ". Un fichier sorti d'un PDF inconnu se regarde avec la même prudence qu'une pièce jointe de courriel." };
  },
  nomZip: "pieces-jointes",
};

/* ── comparer ── */
const comparer = {
  id: "comparer", titre: "Comparer deux PDF", resume: "Trouver ce qui a changé entre deux versions d'un document : les lignes retirées, les lignes ajoutées.",
  mots: "difference diff versions modifications relecture correction avant apres changements",
  description: "La comparaison porte sur le TEXTE, ligne par ligne : elle trouve la phrase qui a bougé, pas une image remplacée ni une couleur. Le premier fichier de la liste est l'ancienne version, le second la nouvelle.",
  entree: DEUX_PDF,
  options: () => "",
  bouton: "Comparer",
  async executer(ctx) {
    const [a, b] = ctx.valides;
    const la = await lignesDuDocument(a.doc, async (i, n) => { ctx.statut("Lecture de « " + a.nom + " », page " + (i + 1) + " / " + n + "…"); await ctx.souffler(); });
    const lb = await lignesDuDocument(b.doc, async (i, n) => { ctx.statut("Lecture de « " + b.nom + " », page " + (i + 1) + " / " + n + "…"); await ctx.souffler(); });
    if (!la.length && !lb.length) throw new Error("aucun texte dans ces deux PDF : ce sont sans doute des scans (des images de pages)");
    const ops = comparerLignes(la, lb), r = bilan(ops);
    const base = sansExtension(a.nom) + "-compare";
    return { fichiers: [
      { nom: base + ".html", blob: new Blob([rapportHtml(ops, a.nom, b.nom)], { type: "text/html;charset=utf-8" }), note: "à ouvrir dans le navigateur" },
      { nom: base + ".txt", blob: new Blob([rapportTexte(ops, a.nom, b.nom)], { type: "text/plain;charset=utf-8" }), note: "les différences seules" }],
      resume: !r.retirees && !r.ajoutees ? "Le texte des deux documents est <strong>identique</strong> (" + r.egales + " lignes)."
        : "<strong>" + r.retirees + "</strong> ligne" + (r.retirees > 1 ? "s" : "") + " seulement dans « " + esc(a.nom) + " », <strong>" + r.ajoutees + "</strong> seulement dans « " + esc(b.nom) + " », " + r.egales + " identiques." };
  },
  nomZip: "comparaison",
};

/* ── un texte devient un PDF ── */
const textePdf = {
  id: "texte-pdf", titre: "Texte en PDF", resume: "Écrire ou coller un texte, du Markdown, un compte rendu : il devient un PDF propre.",
  mots: "markdown md txt ecrire rediger note compte rendu document creer convertir texte brut",
  description: "Les titres (« # »), les listes, les blocs de code et les filets (« --- ») du Markdown sont mis en forme. Trois polices que tout lecteur connaît, donc un fichier minuscule. Un caractère rare (émoji, alphabet non latin) devient « ? ».",
  entree: null,
  options: () => '<label class="af-champ"><span>Texte <label class="af-mini af-charger">Ouvrir un fichier<input type="file" name="fichier" accept=".txt,.md,.markdown,text/plain,text/markdown" hidden></label></span>' +
    '<textarea name="source" rows="12" spellcheck="true" placeholder="# Titre&#10;&#10;Un paragraphe.&#10;&#10;- un point&#10;- un autre"></textarea></label>' +
    '<div class="af-ligne"><label class="af-champ"><span>Feuille</span><select name="format">' + FEUILLES + "</select></label>" +
    '<label class="af-champ"><span>Taille (points)</span><input type="number" name="corps" value="11" min="7" max="24"></label>' +
    '<label class="af-champ"><span>Marge (mm)</span><input type="number" name="marge" value="20" min="5" max="60"></label></div>' +
    '<label class="af-case"><input type="checkbox" name="markdown" checked> Lire le Markdown (décoché : le texte est écrit tel quel)</label>',
  brancher(ctx) {
    const zone = ctx.q('[name="source"]');
    zone.addEventListener("input", () => ctx.verifier());
    ctx.q('[name="fichier"]').addEventListener("change", async (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      zone.value = await f.text();
      ctx.nomTexte = sansExtension(f.name);
      ctx.verifier();
    });
  },
  pret: (ctx) => !!(ctx.val("source") || "").trim(),
  bouton: "Faire le PDF",
  async executer(ctx) {
    const source = ctx.val("source");
    const premier = (/^\s*#*\s*(.+)$/m.exec(source) || [])[1] || "texte";
    const octets = await Mep.textePdf(source, { format: ctx.val("format"), corps: ctx.val("corps") || 11, marge: (ctx.val("marge") || 20) * MM, markdown: ctx.val("markdown"), titre: premier.slice(0, 80) });
    const nom = (ctx.nomTexte || premier.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "texte") + ".pdf";
    return [pdf(octets, nom, pages(await nbPages(octets)))];
  },
};

/* ── redessiner des pages ── */
/* La page « i » dessinée puis rangée en JPEG, à sa taille d'origine. « retoucher(canevas, échelle) »
   peint par-dessus avant l'encodage. */
async function pageEnImage(doc, i, ppp, retoucher = null) {
  const t = await doc.taillePage((await doc.pages())[i]);
  let c = await rendrePage(doc, i, { echelle: ppp / 72 });
  if (retoucher) {
    /* On retouche une COPIE de l'image, sur un canevas neuf. Le moteur de
       rendu laisse le sien à l'échelle de la page (et parfois découpé) : y
       peindre directement plaçait un cache deux fois trop loin, à côté de ce
       qu'il devait couvrir. Mesuré le 14 nov. 2026 en relisant le fichier
       produit : le passage visé était encore lisible. Un canevas neuf n'a ni
       échelle ni découpage, donc un pixel y est un pixel. */
    const neuf = canevas(c.width, c.height);
    neuf.getContext("2d").drawImage(c, 0, 0);
    c.width = c.height = 0;
    c = neuf;
    retoucher(c, c.width / (t.largeur || 1));
  }
  const octets = await octetsDe(await encoder(c, "image/jpeg", 0.9));
  c.width = c.height = 0;
  return { image: { type: "jpeg", octets }, largeur: t.largeur, hauteur: t.hauteur };
}
/* Le document, où les pages de « rendues » (indice → image) remplacent les leurs. */
async function remplacer(doc, rendues) {
  const n = (await doc.pages()).length;
  const indices = [...rendues.keys()].sort((a, b) => a - b);
  if (indices.length === n) return Mep.pdfDepuisImages(indices.map((i) => rendues.get(i)));
  const images = await DocumentPdf.ouvrir(await Mep.pdfDepuisImages(indices.map((i) => rendues.get(i))));
  const morceaux = [];
  for (let i = 0; i < n; i++) morceaux.push(rendues.has(i) ? { doc: images, selection: [indices.indexOf(i)] } : { doc, selection: [i] });
  return Op.fusionner(morceaux);
}
async function redessiner(ctx, f, ppp, retoucher = null, selection = null) {
  const sel = selection || [...Array(f.pages).keys()];
  const rendues = new Map();
  for (const [n, i] of sel.entries()) {
    ctx.statut("Page " + (i + 1) + " (" + (n + 1) + " / " + sel.length + ")…");
    rendues.set(i, await pageEnImage(f.doc, i, ppp, retoucher ? (c, k) => retoucher(c, k, i) : null));
    await ctx.souffler();
  }
  return remplacer(f.doc, rendues);
}

const aplatir = {
  id: "aplatir", titre: "Aplatir un PDF", resume: "Chaque page devient une image : formulaires, commentaires et calques sont figés dans la page.",
  mots: "figer image rasteriser flatten formulaire rempli annotation calque non modifiable imprimer",
  description: "Utile pour qu'un formulaire rempli ne soit plus modifiable, ou qu'un commentaire s'imprime partout pareil. En contrepartie le texte n'est plus sélectionnable, et le fichier est souvent plus lourd.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Finesse</span><select name="ppp">' + QUALITES + "</select></label></div>" + choixPages("quelles", "Pages à aplatir"),
  brancher: (ctx) => brancherChoix(ctx),
  bouton: "Aplatir",
  async executer(ctx) {
    const f = ctx.premier, sel = lireChoix(ctx, f.pages);
    const octets = await redessiner(ctx, f, +ctx.val("ppp"), null, sel);
    return [pdf(octets, sansExtension(f.nom) + "-aplati.pdf", (sel ? sel.length : f.pages) + " page(s) en image")];
  },
};

const inverser = {
  id: "inverser", titre: "Inverser les couleurs", resume: "Fond noir et texte clair, pour lire un PDF la nuit ou économiser une batterie.",
  mots: "mode sombre nuit noir negatif contraste lecture ecran dark",
  description: "Les pages sont redessinées en négatif. Ce sont alors des images : le texte n'est plus sélectionnable. Gardez l'original pour l'imprimer.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Finesse</span><select name="ppp">' + QUALITES + "</select></label></div>",
  bouton: "Inverser",
  async executer(ctx) {
    const f = ctx.premier;
    const octets = await redessiner(ctx, f, +ctx.val("ppp"), (c) => {
      const x = c.getContext("2d");
      x.globalCompositeOperation = "difference";
      x.fillStyle = "#ffffff";
      x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = "source-over";
    });
    return [pdf(octets, sansExtension(f.nom) + "-sombre.pdf", pages(f.pages))];
  },
};

/* ── caviarder ── */
let idCache = 0;
function placeurDe(ctx) {
  if (ctx.placeur) ctx.placeur.detruire();
  ctx.placeur = null;
  const f = ctx.premier;
  if (!f) { ctx.zone.innerHTML = ""; return null; }
  ctx.zone.innerHTML = '<div class="af-placeur-zone"></div>';
  ctx.placeur = new Placeur(ctx.zone.firstChild, f.doc, { surChange: () => ctx.verifier() });
  ctx.surQuitter(() => ctx.placeur && ctx.placeur.detruire());
  ctx.placeur.afficher(0);
  return ctx.placeur;
}
const caviarder = {
  id: "caviarder", titre: "Caviarder un PDF", resume: "Noircir pour de bon un nom, une adresse, un numéro : ce qui est sous le cache disparaît du fichier.",
  mots: "masquer cacher noircir anonymiser censurer rectangle noir confidentiel donnees personnelles rgpd redact",
  description: "Posez un cache, glissez-le sur ce qu'il faut masquer (son coin l'agrandit), recommencez. Un simple rectangle noir posé sur du texte se retire d'un clic ; ici, chaque page caviardée est redessinée en image, donc le texte dessous n'existe plus. Les autres pages restent intactes.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Finesse des pages caviardées</span><select name="ppp">' + QUALITES + "</select></label>" +
    '<span><button type="button" class="af-bouton af-second" data-t="cache">Poser un cache sur cette page</button></span></div>',
  brancher(ctx) {
    ctx.q('[data-t="cache"]').addEventListener("click", () => {
      const p = ctx.placeur;
      if (!p) { ctx.statut("Choisissez d'abord un PDF.", true); return; }
      if (!(p.largeur > 0 && p.hauteur > 0)) { ctx.statut("La page s'affiche encore : réessayez dans un instant.", true); return; }
      p.ajouter({ id: "cache" + (++idCache), page: p.index, x: p.largeur * 0.2, y: p.hauteur * 0.2, l: p.largeur * 0.35, h: Math.max(14, p.hauteur * 0.03),
        coins: ["nw", "ne", "sw", "se"], classe: "af-cache-boite" });
      ctx.statut("");
    });
  },
  surFichiers: (ctx) => placeurDe(ctx),
  pret: (ctx) => !!(ctx.placeur && ctx.placeur.boites.length),
  bouton: "Caviarder",
  async executer(ctx) {
    const f = ctx.premier;
    const parPage = new Map();
    for (const b of ctx.placeur.boites) { if (!parPage.has(b.page)) parPage.set(b.page, []); parPage.get(b.page).push(b); }
    const sel = [...parPage.keys()].sort((a, b) => a - b);
    const octets = await redessiner(ctx, f, +ctx.val("ppp"), (c, k, i) => {
      const x = c.getContext("2d");
      x.fillStyle = "#000000";
      for (const b of parPage.get(i)) {
        if (![b.x, b.y, b.l, b.h].every(Number.isFinite)) throw new Error("un cache n'a pas de position : retirez-le et posez-le de nouveau, une fois la page affichée");
        // un pixel de plus de chaque côté : l'anticrénelage ne laisse pas dépasser un jambage
        x.fillRect(Math.floor(b.x * k) - 1, Math.floor(b.y * k) - 1, Math.ceil(b.l * k) + 2, Math.ceil(b.h * k) + 2);
        // la seule preuve qu'un cache est posé, c'est le pixel : on relit son centre
        const px = x.getImageData(Math.min(c.width - 1, Math.round((b.x + b.l / 2) * k)), Math.min(c.height - 1, Math.round((b.y + b.h / 2) * k)), 1, 1).data;
        if (px[0] > 8 || px[1] > 8 || px[2] > 8) throw new Error("un cache n'a pas pu être peint sur la page " + (i + 1) + " : rien n'est enregistré");
      }
    }, sel);
    return { fichiers: [pdf(octets, sansExtension(f.nom) + "-caviarde.pdf", ctx.placeur.boites.length + " cache(s) sur " + pages(sel.length))],
      resume: "Les pages caviardées (" + sel.map((i) => i + 1).join(", ") + ") sont maintenant des images : ce qui était sous les caches n'est plus dans le fichier. Vérifiez quand même la fiche du fichier (titre, auteur) avec « Propriétés du PDF »." };
  },
};

/* ── pages blanches ── */
/* La part de la page qui porte de l'encre, lue sur une petite image. */
async function partEncree(doc, i) {
  const c = await rendrePage(doc, i, { echelle: 0.4 });
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let k = 0; k < d.length; k += 4) if (d[k] < 235 || d[k + 1] < 235 || d[k + 2] < 235) n++;
  const part = n / (d.length / 4 || 1);
  c.width = c.height = 0;
  return part;
}
const pagesBlanches = {
  id: "pages-blanches", titre: "Retirer les pages blanches", resume: "Un scan recto verso laisse des versos vides : ils sont repérés et retirés d'un coup.",
  mots: "vide blanche scan recto verso supprimer nettoyer automatique detecter",
  description: "Chaque page est dessinée en petit, et l'on mesure la part qui porte de l'encre. Un scan n'est jamais parfaitement blanc (poussières, bord d'ombre) : le réglage dit jusqu'où une page compte encore comme vide.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Une page est vide si elle porte</span><select name="seuil"><option value="0.0005">presque rien (0,05 %)</option>' +
    '<option value="0.003" selected>quelques poussières (0,3 %)</option><option value="0.015">des taches ou un bord d\'ombre (1,5 %)</option></select></label></div>',
  bouton: "Chercher et retirer",
  async executer(ctx) {
    const f = ctx.premier, seuil = +ctx.val("seuil"), vides = [];
    for (let i = 0; i < f.pages; i++) {
      ctx.statut("Page " + (i + 1) + " / " + f.pages + "…");
      if ((await partEncree(f.doc, i)) < seuil) vides.push(i);
      await ctx.souffler();
    }
    if (!vides.length) return { fichiers: [], resume: "Aucune page blanche dans ce PDF (" + pages(f.pages) + " regardées)." };
    if (vides.length === f.pages) throw new Error("toutes les pages paraissent vides avec ce réglage : rien n'est retiré");
    const gardees = [...Array(f.pages).keys()].filter((i) => !vides.includes(i));
    const octets = await Op.reecrire(f.doc, { selection: gardees });
    return { fichiers: [pdf(octets, sansExtension(f.nom) + "-sans-blanches.pdf", pages(gardees.length))],
      resume: vides.length + " page" + (vides.length > 1 ? "s blanches retirées" : " blanche retirée") + " : " + vides.map((i) => i + 1).join(", ") + "." };
  },
};

export const OUTILS = [plusieurs, livret, format, grandePage, couper, superposer, nettoyer, caviarder, aplatir, pagesBlanches,
  signets, piecesJointes, comparer, textePdf, inverser];
