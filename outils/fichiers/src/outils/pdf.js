/* Les outils PDF de l'atelier. Chacun décrit ses réglages et son travail ;
   l'établi (app.js) s'occupe des fichiers, du bouton et des résultats. */

import * as Op from "../pdf/operations.js";
import { DocumentPdf } from "../pdf/lecture.js";
import { decoder } from "../pdf/filtres.js";
import { rendrePage } from "../pdf/rendu.js";
import { creerZip } from "../zip.js";
import { Grille, Placeur, Ardoise, rogner } from "../apercu.js";
import { esc, taille, pourcent, sansExtension, imagePourPdf, encoder, octetsDe, canevas, decoderImage, dessinerReduit } from "../aides.js";

const UN_PDF = { types: ["pdf"], multiple: false, min: 1, accepte: ".pdf,application/pdf", libelle: "Choisir un PDF" };
const pdf = (octets, nom, note) => ({ nom, blob: new Blob([octets], { type: "application/pdf" }), note });
const pages = (n) => n + " page" + (n > 1 ? "s" : "");
const nbPages = async (octets) => (await (await DocumentPdf.ouvrir(octets)).pages()).length;
const MM = 72 / 25.4;

/* Le choix « toutes / impaires / paires / certaines » */
function choixPages(nom = "quelles", titre = "Pages concernées") {
  return '<fieldset><legend>' + titre + '</legend><div class="af-choix">' +
    '<label><input type="radio" name="' + nom + '" value="toutes" checked> Toutes</label>' +
    '<label><input type="radio" name="' + nom + '" value="impaires"> Impaires</label>' +
    '<label><input type="radio" name="' + nom + '" value="paires"> Paires</label>' +
    '<label><input type="radio" name="' + nom + '" value="plage"> Certaines</label></div>' +
    '<input type="text" name="' + nom + '-plage" class="af-saisie af-plage" placeholder="ex. 1-3, 5, 8-fin" hidden autocomplete="off"></fieldset>';
}
function brancherChoix(ctx, nom = "quelles") {
  const champ = ctx.q('[name="' + nom + '-plage"]');
  for (const r of ctx.qa('[name="' + nom + '"]')) r.addEventListener("change", () => { champ.hidden = ctx.val(nom) !== "plage"; if (!champ.hidden) champ.focus(); });
}
function lireChoix(ctx, n, nom = "quelles") {
  const v = ctx.val(nom);
  const tout = [...Array(n).keys()];
  if (v === "impaires") return tout.filter((i) => i % 2 === 0);
  if (v === "paires") return tout.filter((i) => i % 2 === 1);
  if (v === "plage") return [...new Set(Op.lirePlages(ctx.val(nom + "-plage") || "", n))];
  return null;
}
/* « 1, 2, 3, 5 » → « 1-3, 5 » */
function enPlages(indices) {
  const t = [...new Set(indices)].sort((a, b) => a - b).map((i) => i + 1);
  const out = [];
  for (let i = 0; i < t.length;) {
    let j = i;
    while (j + 1 < t.length && t[j + 1] === t[j] + 1) j++;
    out.push(j > i ? t[i] + "-" + t[j] : String(t[i]));
    i = j + 1;
  }
  return out.join(", ");
}

/* La grille des pages d'un seul PDF, refaite quand le fichier change. */
function grilleDe(ctx, options) {
  if (ctx.grille) ctx.grille.detruire();
  ctx.grille = null;
  const f = ctx.premier;
  if (!f) { ctx.zone.innerHTML = ""; return null; }
  ctx.zone.innerHTML = '<div class="af-pages"></div>';
  const items = Array.from({ length: f.pages }, (_, i) => ({ doc: f.doc, index: i, rotation: 0 }));
  ctx.grille = new Grille(ctx.zone.firstChild, { items, ...options });
  ctx.surQuitter(() => ctx.grille && ctx.grille.detruire());
  return ctx.grille;
}

/* ── fusionner ── */
const fusionner = {
  id: "fusionner", titre: "Fusionner des PDF", resume: "Plusieurs PDF (ou photos) → un seul fichier, dans l'ordre voulu.",
  mots: "assembler combiner joindre regrouper merge concatener coller",
  description: "Ajoutez vos fichiers et rangez-les en les glissant (ou avec ↑ ↓) : leurs pages se suivront dans cet ordre. Une photo devient une page A4.",
  entree: { types: ["pdf", "image"], multiple: true, min: 2, accepte: ".pdf,application/pdf,image/*", libelle: "Choisir des PDF ou des images" },
  options: () => '<label class="af-case"><input type="checkbox" name="recto"> Chaque document commence sur un recto (une page blanche est ajoutée après ceux qui ont un nombre impair de pages — pour imprimer en recto verso)</label>',
  bouton: "Fusionner",
  nomZip: "fusion",
  async executer(ctx) {
    const morceaux = [];
    const recto = ctx.val("recto");
    for (const [k, f] of ctx.valides.entries()) {
      let doc = f.doc;
      if (!doc) doc = await DocumentPdf.ouvrir(await Op.imagesVersPdf([await imagePourPdf(f)], { format: "A4" }));
      morceaux.push({ doc });
      const n = (await doc.pages()).length;
      if (recto && n % 2 === 1 && k < ctx.valides.length - 1) {
        const t = await doc.taillePage((await doc.pages())[n - 1]);
        morceaux.push({ doc: await DocumentPdf.ouvrir(await Op.pdfVierge(t.largeur, t.hauteur)) });
      }
    }
    const octets = await Op.fusionner(morceaux);
    return [pdf(octets, sansExtension(ctx.valides[0].nom) + "-fusion.pdf", pages(await nbPages(octets)))];
  },
};

/* ── diviser ── */
const diviser = {
  id: "diviser", titre: "Diviser un PDF", resume: "Couper un PDF en plusieurs fichiers : où vous voulez, page par page, par plages.",
  mots: "decouper separer split scinder couper ciseaux extraire",
  description: "Cliquez sur les ciseaux ✂ entre deux pages pour couper à cet endroit — ou choisissez une règle. Les morceaux se téléchargent un par un ou en ZIP.",
  entree: UN_PDF,
  options: () => '<fieldset><legend>Comment couper</legend><div class="af-choix">' +
    '<label><input type="radio" name="mode" value="ciseaux" checked> Où je clique ✂</label>' +
    '<label><input type="radio" name="mode" value="chaque"> Une page par fichier</label>' +
    '<label><input type="radio" name="mode" value="groupes"> Toutes les N pages</label>' +
    '<label><input type="radio" name="mode" value="plages"> Par plages</label></div>' +
    '<div class="af-ligne af-sous" data-pour="groupes" hidden><label class="af-champ"><span>N (pages par fichier)</span><input type="number" name="n" min="1" value="2"></label></div>' +
    '<div class="af-sous" data-pour="plages" hidden><label class="af-champ"><span>Une plage par fichier, séparées par des virgules</span><input type="text" name="plages" placeholder="ex. 1-3, 4-10, 11-fin" autocomplete="off"></label></div></fieldset>',
  brancher(ctx) {
    ctx.coupures = new Set();
    const maj = () => {
      for (const s of ctx.qa(".af-sous")) s.hidden = s.dataset.pour !== ctx.val("mode");
      diviser.dessinerGroupes(ctx);
    };
    ctx.reglages.addEventListener("input", maj);
    ctx.reglages.addEventListener("change", maj);
  },
  groupes(ctx) {
    const n = ctx.premier ? ctx.premier.pages : 0;
    const mode = ctx.val("mode");
    const tout = [...Array(n).keys()];
    if (mode === "chaque") return tout.map((i) => [i]);
    if (mode === "groupes") { const k = Math.max(1, ctx.val("n") || 1), out = []; for (let i = 0; i < n; i += k) out.push(tout.slice(i, i + k)); return out; }
    if (mode === "plages") {
      const t = (ctx.val("plages") || "").split(",").map((s) => s.trim()).filter(Boolean);
      return t.map((s) => Op.lirePlages(s, n));
    }
    const out = [[]];
    for (const i of tout) { out[out.length - 1].push(i); if (ctx.coupures.has(i) && i < n - 1) out.push([]); }
    return out;
  },
  dessinerGroupes(ctx) {
    if (!ctx.grille) return;
    let groupes;
    try { groupes = diviser.groupes(ctx); ctx.statut(""); } catch (e) { ctx.statut(e.message, true); return; }
    const de = new Map();
    groupes.forEach((g, k) => g.forEach((i) => { if (!de.has(i)) de.set(i, k); }));
    ctx.grille.o.coupures.clear();
    for (let i = 0; i < ctx.grille.items.length - 1; i++) if (de.get(i) !== de.get(i + 1)) ctx.grille.o.coupures.add(i);
    if (ctx.val("mode") !== "ciseaux") ctx.coupures = new Set(ctx.grille.o.coupures);
    ctx.grille.items.forEach((it, i) => { it.groupe = de.get(i); it.source = groupes.length > 1 && de.has(i) ? "n° " + (de.get(i) + 1) : ""; });
    ctx.grille.dessiner();
    ctx.grille.el.querySelectorAll(".af-page").forEach((c, i) => c.classList.toggle("af-groupe-b", (de.get(i) ?? 0) % 2 === 1));
    ctx.bouton.textContent = "Diviser en " + groupes.length + " fichier" + (groupes.length > 1 ? "s" : "");
  },
  surFichiers(ctx) {
    ctx.coupures = new Set();
    grilleDe(ctx, {
      coupures: new Set(),
      legende: (it) => "p. " + (it.index + 1),
      surCoupure: (k) => {
        ctx.q('[name="mode"][value="ciseaux"]').checked = true;
        for (const s of ctx.qa(".af-sous")) s.hidden = true;
        if (ctx.coupures.has(k)) ctx.coupures.delete(k); else ctx.coupures.add(k);
        diviser.dessinerGroupes(ctx);
      },
    });
    diviser.dessinerGroupes(ctx);
  },
  bouton: "Diviser",
  async executer(ctx) {
    const f = ctx.premier;
    const groupes = diviser.groupes(ctx).filter((g) => g.length);
    if (groupes.length < 2 && groupes[0] && groupes[0].length === f.pages) throw new Error("rien à couper : cliquez sur les ciseaux ✂ entre deux pages, ou choisissez une règle");
    const out = [];
    for (const [k, g] of groupes.entries()) {
      ctx.statut("Fichier " + (k + 1) + " / " + groupes.length + "…");
      const octets = await Op.reecrire(f.doc, { selection: g });
      out.push(pdf(octets, sansExtension(f.nom) + "-p" + enPlages(g).replace(/, /g, "_") + ".pdf", pages(g.length)));
      await ctx.souffler();
    }
    return out;
  },
  nomZip: "morceaux",
};

/* ── extraire, supprimer : cliquer sur les pages ── */
function outilChoixPages({ id, titre, resume, mots, description, bouton, garder }) {
  return {
    id, titre, resume, mots, description, bouton, entree: UN_PDF,
    options: () => '<label class="af-champ"><span>Pages ' + (garder ? "à extraire" : "à supprimer") + ' — cliquez sur les vignettes, ou tapez</span><input type="text" name="plage" placeholder="ex. 1-3, 5, 8-fin" autocomplete="off"></label>' +
      (garder ? '<label class="af-case"><input type="checkbox" name="separes"> Un fichier par page (téléchargés ensemble en ZIP)</label>' : ""),
    brancher(ctx) {
      ctx.q('[name="plage"]').addEventListener("input", () => {
        if (!ctx.grille) return;
        let sel = [];
        try { sel = Op.lirePlages(ctx.val("plage"), ctx.premier.pages); ctx.statut(""); } catch (e) { if (ctx.val("plage").trim()) ctx.statut(e.message, true); }
        const s = new Set(sel);
        ctx.grille.items.forEach((it, k) => { it[garder ? "choisie" : "supprimee"] = s.has(k); ctx.grille.maj(k); });
      });
    },
    surFichiers(ctx) {
      ctx.q('[name="plage"]').value = "";
      grilleDe(ctx, {
        surClic: (it, k) => {
          const cle = garder ? "choisie" : "supprimee";
          it[cle] = !it[cle];
          ctx.grille.maj(k);
          ctx.q('[name="plage"]').value = enPlages(ctx.grille.items.filter((x) => x[cle]).map((x) => x.index));
          ctx.statut("");
        },
      });
    },
    async executer(ctx) {
      const f = ctx.premier;
      const texte = ctx.val("plage").trim();
      if (!texte) throw new Error("choisissez des pages : cliquez sur les vignettes, ou tapez « 1-3, 5 »");
      const choisies = Op.lirePlages(texte, f.pages);
      if (garder) {
        if (ctx.val("separes")) {
          return Promise.all(choisies.map(async (i) => pdf(await Op.reecrire(f.doc, { selection: [i] }), sansExtension(f.nom) + "-p" + (i + 1) + ".pdf", "1 page")));
        }
        return [pdf(await Op.reecrire(f.doc, { selection: choisies }), sansExtension(f.nom) + "-extrait.pdf", pages(choisies.length))];
      }
      const ote = new Set(choisies);
      const reste = [...Array(f.pages).keys()].filter((i) => !ote.has(i));
      if (!reste.length) throw new Error("toutes les pages seraient supprimées");
      return [pdf(await Op.reecrire(f.doc, { selection: reste }), sansExtension(f.nom) + "-sans-p" + enPlages(choisies).replace(/, /g, "_") + ".pdf", pages(reste.length) + " (− " + ote.size + ")")];
    },
    nomZip: "pages",
  };
}
const extraire = outilChoixPages({
  id: "extraire", titre: "Extraire des pages", resume: "Garder seulement certaines pages d'un PDF, dans un nouveau fichier.",
  mots: "selectionner garder copier pages sortir", bouton: "Extraire", garder: true,
  description: "Cliquez sur les pages à garder (ou tapez leurs numéros). L'ordre tapé est respecté : « 5, 1-3 » met la page 5 en premier.",
});
const supprimer = outilChoixPages({
  id: "supprimer", titre: "Supprimer des pages", resume: "Retirer des pages d'un PDF : une page blanche, une annexe, un brouillon.",
  mots: "effacer enlever retirer ote pages blanches", bouton: "Supprimer ces pages", garder: false,
  description: "Cliquez sur les pages à retirer : elles se grisent. Le reste du document est gardé tel quel.",
});

/* ── organiser : ranger, pivoter, retirer, mélanger plusieurs PDF ── */
const organiser = {
  id: "organiser", titre: "Organiser les pages", resume: "Glisser les pages pour les ranger, les pivoter, en retirer — même venues de plusieurs PDF.",
  mots: "ordre reordonner trier deplacer ranger pivoter inverser melanger",
  description: "Glissez les vignettes pour changer l'ordre (sur téléphone : flèches ← →). ↻ pivote une page, ✕ la retire. Ajoutez d'autres PDF : leurs pages rejoignent la grille.",
  entree: { types: ["pdf"], multiple: true, min: 1, accepte: ".pdf,application/pdf", libelle: "Choisir un ou plusieurs PDF" },
  options: () => '<div class="af-ligne af-gauche"><button type="button" class="af-bouton af-second" data-g="inverser">Inverser l\'ordre</button>' +
    '<button type="button" class="af-bouton af-second" data-g="tourner">Tout pivoter ↻</button>' +
    '<button type="button" class="af-bouton af-second" data-g="remettre">Tout remettre</button></div>',
  brancher(ctx) {
    ctx.reglages.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-g]");
      if (!b || !ctx.grille) return;
      const items = ctx.grille.items;
      if (b.dataset.g === "inverser") items.reverse();
      if (b.dataset.g === "tourner") items.forEach((it) => { it.rotation = (it.rotation + 90) % 360; });
      if (b.dataset.g === "remettre") { ctx.items = null; organiser.surFichiers(ctx); return; }
      ctx.grille.dessiner();
    });
  },
  surFichiers(ctx) {
    if (ctx.grille) ctx.grille.detruire();
    const fichiers = ctx.valides;
    if (!fichiers.length) { ctx.zone.innerHTML = ""; ctx.grille = null; return; }
    const lettres = new Map(fichiers.map((f, k) => [f, String.fromCharCode(65 + (k % 26))]));
    // garder l'ordre déjà fait pour les fichiers encore là, ajouter les nouveaux à la fin
    const anciens = (ctx.items || []).filter((it) => fichiers.includes(it.fichier));
    const vus = new Set(anciens.map((it) => it.fichier));
    const items = [...anciens];
    for (const f of fichiers) if (!vus.has(f)) for (let i = 0; i < f.pages; i++) items.push({ fichier: f, doc: f.doc, index: i, rotation: 0 });
    for (const it of items) it.source = fichiers.length > 1 ? lettres.get(it.fichier) : "";
    ctx.items = items;
    ctx.zone.innerHTML = (fichiers.length > 1 ? '<p class="af-aide">' + fichiers.map((f) => "<b>" + lettres.get(f) + "</b> = " + esc(f.nom)).join(" · ") + "</p>" : "") + '<div class="af-pages"></div>';
    ctx.grille = new Grille(ctx.zone.querySelector(".af-pages"), {
      items, ordre: true,
      legende: (it, k) => String(k + 1),
      boutons: (it) => (it.supprimee
        ? '<button type="button" class="af-mini" data-a="garder" aria-label="Remettre la page">↩</button>'
        : '<button type="button" class="af-mini" data-a="gauche" aria-label="Avancer">←</button><button type="button" class="af-mini" data-a="tourner" aria-label="Pivoter">↻</button>' +
          '<button type="button" class="af-mini" data-a="retirer" aria-label="Retirer">✕</button><button type="button" class="af-mini" data-a="droite" aria-label="Reculer">→</button>'),
      surAction: (it, a, k, vers) => {
        const g = ctx.grille;
        if (a === "tourner") { it.rotation = (it.rotation + 90) % 360; g.maj(k); return; }
        if (a === "retirer") { it.supprimee = true; g.maj(k); return; }
        if (a === "garder") { it.supprimee = false; g.maj(k); return; }
        let j = a === "gauche" ? k - 1 : a === "droite" ? k + 1 : vers;
        if (j < 0 || j >= g.items.length) return;
        const [x] = g.items.splice(k, 1);
        g.items.splice(j, 0, x);
        g.dessiner();
      },
    });
    ctx.surQuitter(() => ctx.grille && ctx.grille.detruire());
  },
  bouton: "Enregistrer le PDF",
  async executer(ctx) {
    const items = ctx.grille.items.filter((it) => !it.supprimee);
    if (!items.length) throw new Error("toutes les pages sont retirées");
    // des « morceaux » : les suites de pages venues du même fichier
    const morceaux = [];
    for (const it of items) {
      let m = morceaux[morceaux.length - 1];
      if (!m || m.doc !== it.doc) { m = { doc: it.doc, selection: [], rotations: [] }; morceaux.push(m); }
      m.selection.push(it.index);
      m.rotations.push(it.rotation);
    }
    for (const m of morceaux) m.modifier = (d, i, rang) => { if (m.rotations[rang]) Op.tourner(d, m.rotations[rang]); };
    const octets = await Op.fusionner(morceaux);
    return [pdf(octets, sansExtension(ctx.valides[0].nom) + "-organise.pdf", pages(items.length))];
  },
};

/* ── pivoter ── */
const pivoter = {
  id: "pivoter", titre: "Pivoter des pages", resume: "Remettre à l'endroit les pages scannées de travers ou en paysage.",
  mots: "tourner rotation paysage portrait retourner sens",
  description: "Cliquez sur une page pour la tourner d'un quart de tour, ou tournez-les toutes d'un coup. Le contenu n'est pas touché : seule l'orientation change.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne af-gauche"><button type="button" class="af-bouton af-second" data-g="-90">Toutes ↺</button>' +
    '<button type="button" class="af-bouton af-second" data-g="90">Toutes ↻</button><button type="button" class="af-bouton af-second" data-g="paires">Paires ↻ 180°</button></div>',
  brancher(ctx) {
    ctx.reglages.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-g]");
      if (!b || !ctx.grille) return;
      ctx.grille.items.forEach((it, k) => {
        if (b.dataset.g === "paires") { if (k % 2 === 1) it.rotation = (it.rotation + 180) % 360; }
        else it.rotation = (it.rotation + +b.dataset.g + 360) % 360;
        ctx.grille.maj(k);
      });
    });
  },
  surFichiers(ctx) {
    grilleDe(ctx, {
      legende: (it) => "p. " + (it.index + 1) + (it.rotation ? " · " + it.rotation + "°" : ""),
      boutons: () => '<button type="button" class="af-mini" data-a="g" aria-label="Pivoter à gauche">↺</button><button type="button" class="af-mini" data-a="d" aria-label="Pivoter à droite">↻</button>',
      surAction: (it, a, k) => { it.rotation = (it.rotation + (a === "g" ? 270 : 90)) % 360; ctx.grille.maj(k); },
      surClic: (it, k) => { it.rotation = (it.rotation + 90) % 360; ctx.grille.maj(k); },
    });
  },
  bouton: "Enregistrer",
  async executer(ctx) {
    const f = ctx.premier;
    const angles = {};
    ctx.grille.items.forEach((it, k) => { if (it.rotation) angles[k] = it.rotation; });
    if (!Object.keys(angles).length) throw new Error("aucune page n'a été tournée : cliquez sur une vignette");
    return [pdf(await Op.pivoter(f.doc, angles), sansExtension(f.nom) + "-pivote.pdf", Object.keys(angles).length + " page(s) tournée(s)")];
  },
};

/* ── images → PDF ── */
const imagesPdf = {
  id: "images-pdf", titre: "Images en PDF", resume: "JPG, PNG, WebP, captures d'écran → un PDF, une image par page.",
  mots: "jpg jpeg png photo image convertir capture ecran webp gif scan",
  description: "Les photos JPEG sont mises telles quelles (aucune perte) et redressées si le téléphone les a prises de côté. Rangez-les dans l'ordre voulu.",
  entree: { types: ["image"], multiple: true, min: 1, accepte: "image/*", libelle: "Choisir des images" },
  options: () => '<div class="af-ligne">' +
    '<label class="af-champ"><span>Format de page</span><select name="format"><option value="A4">A4</option><option value="Lettre">Lettre US</option><option value="A5">A5</option><option value="A3">A3</option><option value="ajuste">À la taille de l\'image</option></select></label>' +
    '<label class="af-champ"><span>Orientation</span><select name="orientation"><option value="auto">Selon l\'image</option><option value="portrait">Portrait</option><option value="paysage">Paysage</option></select></label>' +
    '<label class="af-champ"><span>Marges</span><select name="marge"><option value="0">Aucune</option><option value="20" selected>Petites</option><option value="45">Grandes</option></select></label></div>' +
    '<label class="af-case"><input type="checkbox" name="alleger"> Alléger (images réduites à 2000 px, en JPEG) — pour un envoi par mail ou une plateforme limitée en taille</label>',
  bouton: "Créer le PDF",
  async executer(ctx) {
    const images = [];
    for (const [k, f] of ctx.valides.entries()) {
      ctx.statut("Image " + (k + 1) + " / " + ctx.valides.length + "…");
      images.push(await imagePourPdf(f, { alleger: ctx.val("alleger") }));
      await ctx.souffler();
    }
    const octets = await Op.imagesVersPdf(images, { format: ctx.val("format"), orientation: ctx.val("orientation"), marge: +ctx.val("marge") });
    return [pdf(octets, (ctx.valides.length === 1 ? sansExtension(ctx.valides[0].nom) : "images") + ".pdf", pages(images.length))];
  },
};

/* ── scanner avec la caméra ── */
function filtrer(c, mode) {
  if (mode === "couleur") return c;
  const x = c.getContext("2d", { willReadFrequently: true });
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data, n = c.width * c.height;
  const gris = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) gris[i] = (d[4 * i] * 299 + d[4 * i + 1] * 587 + d[4 * i + 2] * 114) / 1000;
  if (mode === "gris" || mode === "document") {
    // étirer les niveaux : le papier devient blanc, l'encre noire
    const h = new Uint32Array(256);
    for (let i = 0; i < n; i++) h[gris[i]]++;
    let bas = 0, haut = 255, s = 0;
    while (bas < 255 && (s += h[bas]) < n * 0.02) bas++;
    s = 0;
    while (haut > 0 && (s += h[haut]) < n * (mode === "document" ? 0.35 : 0.01)) haut--;
    const e = Math.max(1, haut - bas);
    for (let i = 0; i < n; i++) { const v = Math.max(0, Math.min(255, ((gris[i] - bas) * 255) / e)); d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = v; }
  } else {
    // noir et blanc : seuil adaptatif (moyenne locale, par l'image intégrale)
    const W = c.width, H = c.height, I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let ligne = 0; for (let x2 = 0; x2 < W; x2++) { ligne += gris[y * W + x2]; I[(y + 1) * (W + 1) + x2 + 1] = I[y * (W + 1) + x2 + 1] + ligne; } }
    const r = Math.max(8, Math.round(Math.min(W, H) / 16));
    for (let y = 0; y < H; y++) for (let x2 = 0; x2 < W; x2++) {
      const x0 = Math.max(0, x2 - r), x1 = Math.min(W, x2 + r), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r);
      const moy = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      const v = gris[y * W + x2] < moy * 0.86 ? 0 : 255;
      const i = y * W + x2;
      d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = v;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}
const scanner = {
  id: "scanner", titre: "Scanner en PDF", resume: "Photographier des feuilles avec la caméra → un PDF propre, page après page.",
  mots: "camera photo appareil numeriser scan document feuille copie",
  description: "Posez la feuille sur une table, bien éclairée, et prenez-la d'aplomb. L'effet « document » blanchit le papier et fonce l'encre. Rien n'est envoyé : les photos restent dans cette page.",
  entree: null,
  options: () => '<div class="af-ligne af-gauche"><button type="button" class="af-bouton" data-s="camera">Ouvrir la caméra</button>' +
    '<label class="af-bouton af-second">Prendre avec l\'appareil photo<input type="file" accept="image/*" capture="environment" multiple hidden data-s="fichier"></label></div>' +
    '<div class="af-scan" hidden><video class="af-video" playsinline muted></video><div class="af-ligne af-gauche"><button type="button" class="af-bouton" data-s="prendre">📸 Prendre la page</button><button type="button" class="af-bouton af-second" data-s="fermer">Fermer la caméra</button></div></div>' +
    '<fieldset><legend>Rendu</legend><div class="af-choix">' +
    '<label><input type="radio" name="filtre" value="document" checked> Document</label><label><input type="radio" name="filtre" value="nb"> Noir et blanc</label>' +
    '<label><input type="radio" name="filtre" value="gris"> Gris</label><label><input type="radio" name="filtre" value="couleur"> Couleur</label></div></fieldset>' +
    '<div class="af-vignettes" aria-live="polite"></div>',
  brancher(ctx) {
    ctx.photos = [];
    let flux = null;
    const video = ctx.q("video");
    const fermer = () => { if (flux) flux.getTracks().forEach((t) => t.stop()); flux = null; video.srcObject = null; ctx.q(".af-scan").hidden = true; };
    ctx.surQuitter(fermer);
    const ajouter = async (source, l, h) => {
      const k = Math.min(1, 2200 / Math.max(l, h));
      const c = canevas(l * k, h * k);
      const x = c.getContext("2d");
      x.imageSmoothingQuality = "high";
      x.drawImage(source, 0, 0, c.width, c.height);
      ctx.photos.push({ brut: c });
      await scanner.vignettes(ctx);
    };
    ctx.reglages.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-s]");
      if (!b) return;
      if (b.dataset.s === "camera") {
        try {
          flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
          video.srcObject = flux;
          await video.play();
          ctx.q(".af-scan").hidden = false;
        } catch (e) { ctx.statut("Caméra indisponible (" + (e.name === "NotAllowedError" ? "accès refusé" : e.message) + "). Utilisez « Prendre avec l'appareil photo ».", true); }
      } else if (b.dataset.s === "prendre" && video.videoWidth) {
        await ajouter(video, video.videoWidth, video.videoHeight);
        video.classList.add("flash");
        setTimeout(() => video.classList.remove("flash"), 180);
      } else if (b.dataset.s === "fermer") fermer();
    });
    ctx.q('[data-s="fichier"]').addEventListener("change", async (ev) => {
      for (const f of ev.target.files) {
        try {
          const o = new Uint8Array(await f.arrayBuffer());
          const img = await decoderImage(o, f.type === "image/png" ? "png" : "jpeg");
          await ajouter(img.source, img.largeur, img.hauteur);
          img.fermer();
        } catch (e) { ctx.statut(e.message, true); }
      }
      ev.target.value = "";
    });
    ctx.reglages.addEventListener("change", (ev) => { if (ev.target.name === "filtre") scanner.vignettes(ctx); });
    ctx.q(".af-vignettes").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-i]");
      if (!b) return;
      ctx.photos.splice(+b.dataset.i, 1);
      scanner.vignettes(ctx);
    });
  },
  async vignettes(ctx) {
    const mode = ctx.val("filtre");
    for (const p of ctx.photos) if (p.mode !== mode) {
      const c = canevas(p.brut.width, p.brut.height);
      c.getContext("2d").drawImage(p.brut, 0, 0);
      p.rendu = filtrer(c, mode);
      p.mode = mode;
    }
    const zone = ctx.q(".af-vignettes");
    zone.replaceChildren(...ctx.photos.map((p, i) => {
      const fig = document.createElement("figure");
      const v = dessinerReduit({ source: p.rendu, largeur: p.rendu.width, hauteur: p.rendu.height }, (110 * p.rendu.width) / p.rendu.height * 2, 220);
      v.style.height = "110px";
      fig.append(v);
      fig.insertAdjacentHTML("beforeend", '<button type="button" class="af-mini" data-i="' + i + '" aria-label="Retirer la page ' + (i + 1) + '">✕</button><figcaption>' + (i + 1) + "</figcaption>");
      return fig;
    }));
    ctx.verifier();
  },
  pret: (ctx) => ctx.photos && ctx.photos.length > 0,
  bouton: "Créer le PDF",
  async executer(ctx) {
    await scanner.vignettes(ctx);
    const images = [];
    for (const p of ctx.photos) images.push({ type: "jpeg", octets: await octetsDe(await encoder(p.rendu, "image/jpeg", p.mode === "nb" ? 0.7 : 0.82)), orientation: 1 });
    const octets = await Op.imagesVersPdf(images, { format: "A4", marge: 0 });
    const d = new Date();
    return [pdf(octets, "scan-" + d.toISOString().slice(0, 10) + ".pdf", pages(images.length))];
  },
};

/* ── PDF → JPG : chaque page en image ── */
const pdfJpg = {
  id: "pdf-jpg", titre: "PDF en images", resume: "Chaque page devient une image JPG ou PNG (pour une présentation, un réseau social).",
  mots: "jpg jpeg png image convertir capture page photo exporter",
  description: "Les pages sont dessinées par le moteur de l'atelier. Il reproduit fidèlement la plupart des documents ; s'il manque une police rare, une police du système la remplace.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Format</span><select name="format"><option value="image/jpeg">JPG</option><option value="image/png">PNG (sans perte)</option></select></label>' +
    '<label class="af-champ"><span>Qualité</span><select name="dpi"><option value="96">Écran (96 ppp)</option><option value="150" selected>Bonne (150 ppp)</option><option value="300">Impression (300 ppp)</option></select></label></div>' +
    choixPages(),
  brancher: (ctx) => brancherChoix(ctx),
  bouton: "Convertir",
  async executer(ctx) {
    const f = ctx.premier;
    const sel = lireChoix(ctx, f.pages) || [...Array(f.pages).keys()];
    const type = ctx.val("format"), ext = type === "image/png" ? "png" : "jpg";
    const k = +ctx.val("dpi") / 72;
    const out = [];
    for (const [n, i] of sel.entries()) {
      ctx.statut("Page " + (i + 1) + " (" + (n + 1) + " / " + sel.length + ")…");
      const c = await rendrePage(f.doc, i, { echelle: k });
      out.push({ nom: sansExtension(f.nom) + "-p" + String(i + 1).padStart(String(f.pages).length, "0") + "." + ext, blob: await encoder(c, type, 0.9), note: c.width + " × " + c.height + " px" });
      c.width = c.height = 0;
      await ctx.souffler();
    }
    return out;
  },
  nomZip: "pages",
};

/* ── extraire les images contenues ── */
const pdfImages = {
  id: "pdf-images", titre: "Extraire les images", resume: "Récupérer les photos et figures contenues dans un PDF, dans leur qualité d'origine.",
  mots: "photos figures recuperer sortir jpg png illustrations",
  description: "Les images JPEG sortent telles qu'elles sont rangées dans le PDF, sans perte ; les autres sont enregistrées en PNG.",
  entree: UN_PDF,
  bouton: "Extraire les images",
  async executer(ctx) {
    const f = ctx.premier;
    const images = await Op.listerImages(f.doc);
    if (!images.length) throw new Error("ce PDF ne contient aucune image (une page de texte n'en est pas une : utilisez « PDF en images »)");
    const out = [];
    let n = 0;
    for (const im of images) {
      n++;
      ctx.statut("Image " + n + " / " + images.length + "…");
      const base = sansExtension(f.nom) + "-p" + (im.page + 1) + "-img" + n;
      try {
        const dec = await decoder(im.flux);
        const w = await f.doc.resoudre(im.flux.dict.get("Width")), h = await f.doc.resoudre(im.flux.dict.get("Height"));
        if (dec.reste[0] === "DCTDecode" || dec.reste[0] === "DCT") { out.push({ nom: base + ".jpg", blob: new Blob([dec.octets], { type: "image/jpeg" }), note: w + " × " + h + " px" }); continue; }
        if (dec.reste[0] === "JPXDecode") { out.push({ nom: base + ".jp2", blob: new Blob([dec.octets], { type: "image/jp2" }), note: "JPEG 2000" }); continue; }
        if (dec.reste.length) continue;
        const px = await Op.pixelsImage(f.doc, im.flux);
        if (!px || px.largeur * px.hauteur < 16) continue;
        const c = canevas(px.largeur, px.hauteur);
        c.getContext("2d").putImageData(new ImageData(px.rgba, px.largeur, px.hauteur), 0, 0);
        out.push({ nom: base + ".png", blob: await encoder(c, "image/png"), note: px.largeur + " × " + px.hauteur + " px" });
      } catch (e) { /* une image illisible : la suivante */ }
      await ctx.souffler();
    }
    if (!out.length) throw new Error("les images de ce PDF sont dans un format que l'atelier ne sait pas extraire (fax, JBIG2)");
    return out;
  },
  nomZip: "images",
};

/* ── numéroter ── */
const numeroter = {
  id: "numeroter", titre: "Numéroter les pages", resume: "Ajouter « 1 / 12 » ou « Page 1 sur 12 » en bas de chaque page.",
  mots: "numero pagination numeros bas de page pied",
  entree: UN_PDF,
  description: "Le numéro est écrit en Helvetica, une police que tous les lecteurs PDF connaissent : rien à embarquer, le fichier grossit à peine.",
  options: () => '<div class="af-ligne">' +
    '<label class="af-champ"><span>Modèle</span><select name="modele"><option value="{n} / {total}">1 / 12</option><option value="{n}">1</option><option value="Page {n} sur {total}">Page 1 sur 12</option><option value="Page {n}">Page 1</option><option value="– {n} –">– 1 –</option></select></label>' +
    '<label class="af-champ"><span>Position</span><select name="position"><option value="bas-centre">En bas, au centre</option><option value="bas-droite">En bas, à droite</option><option value="bas-gauche">En bas, à gauche</option><option value="haut-centre">En haut, au centre</option><option value="haut-droite">En haut, à droite</option><option value="haut-gauche">En haut, à gauche</option></select></label>' +
    '<label class="af-champ"><span>Taille (points)</span><input type="number" name="corps" value="10" min="6" max="40"></label></div>' +
    '<label class="af-case"><input type="checkbox" name="garde"> Pas de numéro sur la page de garde (la 2<sup>e</sup> page porte le n° 2)</label>',
  bouton: "Numéroter",
  async executer(ctx) {
    const f = ctx.premier;
    const garde = ctx.val("garde");
    const selection = garde ? [...Array(f.pages).keys()].slice(1) : null;
    const octets = await Op.numeroter(f.doc, { modele: ctx.val("modele"), position: ctx.val("position"), corps: ctx.val("corps") || 10, selection, debut: garde ? 2 : 1 });
    return [pdf(octets, sansExtension(f.nom) + "-numerote.pdf", pages(f.pages))];
  },
};

/* ── filigrane ── */
const filigrane = {
  id: "filigrane", titre: "Filigrane", resume: "Écrire « COPIE », « CONFIDENTIEL » ou votre nom en travers des pages.",
  mots: "tampon confidentiel copie brouillon marque watermark",
  description: "Utile pour une pièce d'identité envoyée à une agence : « Copie pour l'agence X, le 23/10 » empêche de la réutiliser ailleurs.",
  entree: UN_PDF,
  options: () => '<label class="af-champ"><span>Texte</span><input type="text" name="texte" value="COPIE" maxlength="80"></label><div class="af-ligne">' +
    '<label class="af-champ"><span>Taille</span><input type="number" name="corps" value="64" min="10" max="200"></label>' +
    '<label class="af-champ"><span>Opacité</span><input type="range" name="opacite" min="5" max="80" value="20"></label>' +
    '<label class="af-champ"><span>Couleur</span><input type="color" name="couleur" value="#c0392b"></label>' +
    '<label class="af-champ"><span>Sens</span><select name="angle"><option value="45">En diagonale ↗</option><option value="-45">En diagonale ↘</option><option value="0">À plat</option></select></label></div>' +
    choixPages(),
  brancher: (ctx) => brancherChoix(ctx),
  bouton: "Ajouter le filigrane",
  async executer(ctx) {
    const f = ctx.premier;
    const texte = ctx.val("texte").trim();
    if (!texte) throw new Error("le texte du filigrane est vide");
    const octets = await Op.filigraner(f.doc, { texte, corps: ctx.val("corps") || 60, opacite: (ctx.val("opacite") || 20) / 100, couleurHex: ctx.val("couleur"), angle: +ctx.val("angle"), selection: lireChoix(ctx, f.pages) });
    return [pdf(octets, sansExtension(f.nom) + "-filigrane.pdf", pages(f.pages))];
  },
};

/* ── ajouter du texte, signer : le placeur ── */
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
let idBoite = 0;
const texte = {
  id: "texte", titre: "Ajouter du texte", resume: "Écrire sur un PDF : remplir un formulaire « papier », ajouter une date, un nom.",
  mots: "ecrire remplir formulaire annoter date nom champ ajouter",
  description: "Tapez votre texte, cliquez « Poser sur la page », puis glissez-le où il faut (le coin ◢ l'agrandit). Une boîte par endroit à remplir.",
  entree: UN_PDF,
  options: () => '<label class="af-champ"><span>Texte</span><textarea name="texte" rows="2" placeholder="ex. Zoé Martin — 23/10/2026"></textarea></label><div class="af-ligne">' +
    '<label class="af-champ"><span>Taille</span><input type="number" name="corps" value="12" min="5" max="72"></label>' +
    '<label class="af-champ"><span>Couleur</span><input type="color" name="couleur" value="#0b2a6f"></label>' +
    '<span><button type="button" class="af-bouton af-second" data-t="poser">Poser sur la page</button></span></div>',
  brancher(ctx) {
    ctx.q('[data-t="poser"]').addEventListener("click", () => {
      const p = ctx.placeur;
      const t = ctx.val("texte");
      if (!p || !t.trim()) { ctx.statut("Tapez d'abord un texte.", true); return; }
      const corps = ctx.val("corps") || 12, couleur = ctx.val("couleur");
      const lignes = t.split("\n");
      const largeur = Math.max(...lignes.map((l) => l.length)) * corps * 0.55 + 8;
      const boite = {
        id: ++idBoite, page: p.index, x: 40, y: 40, l: Math.min(largeur, p.largeur - 80), h: lignes.length * corps * 1.2 + 4, texte: t, corps, couleur, classe: "af-boite-texte",
        contenu: (k) => {
          const d = document.createElement("div");
          d.className = "af-boite-contenu";
          d.style.fontSize = boite.corps * k + "px"; d.style.lineHeight = "1.2"; d.style.color = boite.couleur;
          d.textContent = boite.texte;
          return d;
        },
      };
      p.ajouter(boite);
      ctx.statut("");
    });
  },
  surFichiers: (ctx) => placeurDe(ctx),
  pret: (ctx) => !!(ctx.placeur && ctx.placeur.boites.length),
  bouton: "Enregistrer le PDF",
  async executer(ctx) {
    const f = ctx.premier, p = ctx.placeur;
    const pagesDoc = await f.doc.pages();
    const textes = [];
    for (const b of p.boites) {
      const t = await f.doc.taillePage(pagesDoc[b.page]);
      // la ligne de base de la première ligne : sous le haut de la boîte
      textes.push({ page: b.page, x: b.x + 2, y: t.hauteur - b.y - b.corps * 0.95, texte: b.texte, corps: b.corps, couleurHex: b.couleur });
    }
    return [pdf(await Op.poserTextes(f.doc, textes), sansExtension(f.nom) + "-complete.pdf", textes.length + " texte(s) ajouté(s)")];
  },
};

const signer = {
  id: "signer", titre: "Signer un PDF", resume: "Dessiner sa signature au doigt (ou importer une image) et la poser sur le document.",
  mots: "signature parapher tampon approuver contrat convention stage",
  description: "Signez dans le cadre, puis « Poser la signature » et glissez-la au bon endroit. C'est une signature <b>dessinée</b> (une image), comme une signature scannée — pas une signature électronique certifiée.",
  entree: UN_PDF,
  options: () => '<div class="af-signature-zone"><canvas class="af-signature" aria-label="Zone de signature : dessinez au doigt ou à la souris"></canvas>' +
    '<div class="af-ligne af-gauche"><button type="button" class="af-bouton af-second" data-s="effacer">Effacer</button><button type="button" class="af-bouton af-second" data-s="annuler">Annuler le dernier trait</button>' +
    '<label class="af-champ af-court"><span>Encre</span><input type="color" name="encre" value="#0b2a6f"></label>' +
    '<label class="af-bouton af-second">Importer une image<input type="file" accept="image/*" hidden data-s="image"></label></div></div>' +
    '<div class="af-ligne af-gauche"><button type="button" class="af-bouton" data-s="poser">Poser la signature</button>' +
    '<label class="af-case"><input type="checkbox" name="partout"> Sur toutes les pages, au même endroit (paraphe)</label></div>',
  brancher(ctx) {
    const ardoise = new Ardoise(ctx.q(".af-signature"));
    ctx.ardoise = ardoise;
    ctx.q('[name="encre"]').addEventListener("input", () => { ardoise.couleur = ctx.val("encre"); });
    ctx.reglages.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-s]");
      if (!b) return;
      if (b.dataset.s === "effacer") { ardoise.effacer(); ctx.imageSignature = null; }
      if (b.dataset.s === "annuler") ardoise.annuler();
      if (b.dataset.s === "poser") {
        const sig = ctx.imageSignature || ardoise.signature();
        if (!sig) { ctx.statut("Signez d'abord dans le cadre (ou importez une image).", true); return; }
        if (!ctx.placeur) { ctx.statut("Choisissez d'abord le PDF à signer.", true); return; }
        const c = canevas(sig.largeur, sig.hauteur);
        c.getContext("2d").putImageData(new ImageData(sig.pixels, sig.largeur, sig.hauteur), 0, 0);
        const url = c.toDataURL();
        const p = ctx.placeur;
        const l = Math.min(160, p.largeur / 3);
        p.ajouter({ id: ++idBoite, page: p.index, x: p.largeur - l - 50, y: p.hauteur - (l * sig.hauteur) / sig.largeur - 80, l, h: (l * sig.hauteur) / sig.largeur,
          ratio: sig.largeur / sig.hauteur, signature: sig, classe: "af-boite-image",
          contenu: () => { const i = new Image(); i.src = url; i.alt = ""; return i; } });
        ctx.statut("");
      }
    });
    ctx.q('[data-s="image"]').addEventListener("change", async (ev) => {
      const fichier = ev.target.files[0];
      ev.target.value = "";
      if (!fichier) return;
      try {
        const img = await decoderImage(new Uint8Array(await fichier.arrayBuffer()), fichier.type.includes("png") ? "png" : "jpeg");
        const k = Math.min(1, 1200 / Math.max(img.largeur, img.hauteur));
        const c = canevas(img.largeur * k, img.hauteur * k);
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img.source, 0, 0, c.width, c.height);
        img.fermer();
        // un scan de signature : le papier blanc devient transparent
        const d = x.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) {
          const lum = (d.data[i] * 299 + d.data[i + 1] * 587 + d.data[i + 2] * 114) / 1000;
          if (lum > 200) d.data[i + 3] = 0; else if (lum > 150) d.data[i + 3] = Math.min(d.data[i + 3], ((200 - lum) * 255) / 50);
        }
        ctx.imageSignature = rogner(d);
        if (!ctx.imageSignature) throw new Error("l'image est vide (ou toute blanche)");
        ctx.statut("Image importée : cliquez « Poser la signature ».");
      } catch (e) { ctx.statut(e.message, true); }
    });
  },
  surFichiers: (ctx) => placeurDe(ctx),
  pret: (ctx) => !!(ctx.placeur && ctx.placeur.boites.length),
  bouton: "Enregistrer le PDF signé",
  async executer(ctx) {
    const f = ctx.premier, p = ctx.placeur;
    let doc = f.doc;
    let octets = null;
    // une image par boîte (chacune peut venir d'une signature différente)
    for (const b of p.boites) {
      const places = [];
      const cibles = ctx.val("partout") ? [...Array(f.pages).keys()] : [b.page];
      for (const i of cibles) {
        const t = await doc.taillePage((await doc.pages())[i]);
        places.push({ page: i, x: b.x, y: t.hauteur - b.y - b.h, largeur: b.l });
      }
      octets = await Op.poserImage(doc, { type: "pixels", largeur: b.signature.largeur, hauteur: b.signature.hauteur, pixels: b.signature.pixels }, places);
      doc = await DocumentPdf.ouvrir(octets);
    }
    return [pdf(octets, sansExtension(f.nom) + "-signe.pdf", "signature posée")];
  },
};

/* ── recadrer ── */
const recadrer = {
  id: "recadrer", titre: "Recadrer des pages", resume: "Couper les marges d'un PDF (un scan trop large, une diapo avec bandeau).",
  mots: "rogner marges couper bords crop decouper zone",
  description: "Ajustez le cadre sur la page (ses quatre coins se tirent). Seule la zone visible change : le contenu caché reste dans le fichier.",
  entree: UN_PDF,
  options: () => choixPages("quelles", "Appliquer le même cadre à"),
  brancher: (ctx) => brancherChoix(ctx),
  surFichiers(ctx) {
    const p = placeurDe(ctx);
    if (!p) return;
    const poser = () => {
      p.boites = [];
      p.ajouter({ id: "cadre", page: p.index, x: p.largeur * 0.06, y: p.hauteur * 0.06, l: p.largeur * 0.88, h: p.hauteur * 0.88, fixe: true, coins: ["nw", "ne", "sw", "se"], classe: "af-cadre-boite" });
    };
    const afficher = p.afficher.bind(p);
    p.afficher = async (i) => { await afficher(i); if (!p.boites.length || p.boites[0].page !== p.index) poser(); };
    p.afficher(0);
  },
  bouton: "Recadrer",
  async executer(ctx) {
    const f = ctx.premier, b = ctx.placeur.boites[0];
    const marges = { gauche: b.x, haut: b.y, droite: ctx.placeur.largeur - b.x - b.l, bas: ctx.placeur.hauteur - b.y - b.h };
    // les marges sont mesurées sur la page VUE : une page pivotée a ses côtés échangés
    const pagesDoc = await f.doc.pages();
    const t = await f.doc.taillePage(pagesDoc[ctx.placeur.index]);
    const r = t.rotation;
    const m = r === 90 ? { gauche: marges.haut, haut: marges.droite, droite: marges.bas, bas: marges.gauche }
      : r === 180 ? { gauche: marges.droite, haut: marges.bas, droite: marges.gauche, bas: marges.haut }
        : r === 270 ? { gauche: marges.bas, haut: marges.gauche, droite: marges.haut, bas: marges.droite } : marges;
    const octets = await Op.recadrer(f.doc, m, lireChoix(ctx, f.pages));
    return [pdf(octets, sansExtension(f.nom) + "-recadre.pdf", Math.round(b.l / MM) + " × " + Math.round(b.h / MM) + " mm")];
  },
};

/* ── métadonnées ── */
const CHAMPS = [["Title", "Titre"], ["Author", "Auteur"], ["Subject", "Sujet"], ["Keywords", "Mots-clés"], ["Creator", "Logiciel d'origine"], ["Producer", "Producteur"]];
const metadonnees = {
  id: "metadonnees", titre: "Propriétés du PDF", resume: "Voir et changer le titre, l'auteur… ou tout effacer avant d'envoyer.",
  mots: "auteur titre informations proprietes metadata effacer anonyme vie privee",
  description: "Un PDF garde souvent le nom de son auteur (votre nom de session Windows !), le logiciel et les dates. Changez ce que vous voulez ; laisser un champ vide l'efface.",
  entree: UN_PDF,
  options: () => '<div class="af-meta">' + CHAMPS.slice(0, 4).map(([k, l]) => '<label class="af-champ"><span>' + l + '</span><input type="text" name="m-' + k + '" autocomplete="off"></label>').join("") + "</div>" +
    '<div class="af-meta-avant"></div><label class="af-case"><input type="checkbox" name="vider"> Tout effacer (aucune information sur l\'auteur ni le logiciel)</label>',
  async surFichiers(ctx) {
    const f = ctx.premier;
    const zone = ctx.q(".af-meta-avant");
    if (!f) { zone.innerHTML = ""; return; }
    const m = await Op.lireMetadonnees(f.doc);
    for (const [k] of CHAMPS.slice(0, 4)) { const i = ctx.q('[name="m-' + k + '"]'); if (i) i.value = m[k] || ""; }
    const lignes = Object.entries(m).filter(([, v]) => v);
    zone.innerHTML = lignes.length ? '<table class="af-tableau"><tr><th colspan="2">Ce que le fichier dit de lui aujourd\'hui</th></tr>' +
      lignes.map(([k, v]) => "<tr><td>" + esc((CHAMPS.find((c) => c[0] === k) || [k, k])[1]) + "</td><td>" + esc(/^D:\d{8}/.test(v) ? datePdfLisible(v) : v) + "</td></tr>").join("") + "</table>"
      : '<p class="af-aide">Ce PDF ne contient aucune information de propriété.</p>';
  },
  bouton: "Enregistrer",
  async executer(ctx) {
    const f = ctx.premier;
    const valeurs = ctx.val("vider") ? null : Object.fromEntries(CHAMPS.slice(0, 4).map(([k]) => [k, ctx.val("m-" + k).trim()]));
    return [pdf(await Op.ecrireMetadonnees(f.doc, valeurs), f.nom, valeurs ? "propriétés mises à jour" : "propriétés effacées")];
  },
};
function datePdfLisible(v) {
  const m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/.exec(v);
  return m ? m[3] + "/" + m[2] + "/" + m[1] + (m[4] ? " " + m[4] + ":" + (m[5] || "00") : "") : v;
}

/* ── compresser ── */
const NIVEAUX = { legere: { max: 2400, q: 0.85 }, moyenne: { max: 1600, q: 0.72 }, forte: { max: 1100, q: 0.55 } };
const compresser = {
  id: "compresser", titre: "Compresser un PDF", resume: "Alléger un PDF trop lourd pour un mail ou une plateforme (Pronote, Parcoursup…).",
  mots: "reduire alleger taille poids mail optimiser compression mo",
  description: "Ce sont presque toujours les IMAGES qui pèsent : elles sont réenregistrées plus petites. Un PDF de texte seul ne rétrécit guère — il est déjà léger.",
  entree: UN_PDF,
  options: () => '<fieldset><legend>Niveau</legend><div class="af-choix">' +
    '<label><input type="radio" name="niveau" value="legere"> Légère (qualité intacte)</label>' +
    '<label><input type="radio" name="niveau" value="moyenne" checked> Moyenne (conseillée)</label>' +
    '<label><input type="radio" name="niveau" value="forte"> Forte (le plus petit)</label></div></fieldset>',
  bouton: "Compresser",
  async executer(ctx) {
    const f = ctx.premier;
    const { max, q } = NIVEAUX[ctx.val("niveau")] || NIVEAUX.moyenne;
    let n = 0;
    const r = await Op.compresser(f.doc, async ({ doc, flux, jpeg }) => {
      ctx.statut("Image " + ++n + "…");
      const d = flux.dict;
      if (((await doc.resoudre(d.get("BitsPerComponent"))) || 8) === 1) return null;   // un scan noir et blanc : déjà au plus juste
      let source, w, h;
      if (jpeg) {
        const dec = await decoder(flux);
        if (dec.reste.length !== 1) return null;
        source = await createImageBitmap(new Blob([dec.octets], { type: "image/jpeg" }));
        w = source.width; h = source.height;
      } else {
        const px = await Op.pixelsImage(doc, flux);
        if (!px) return null;
        w = px.largeur; h = px.hauteur;
        source = canevas(w, h);
        source.getContext("2d").putImageData(new ImageData(px.rgba, w, h), 0, 0);
      }
      const k = Math.min(1, max / Math.max(w, h));
      const c = dessinerReduit({ source, largeur: w, hauteur: h }, w * k, h * k, { fond: "#ffffff" });
      if (source.close) source.close();
      return { octets: await octetsDe(await encoder(c, "image/jpeg", q)), largeur: c.width, hauteur: c.height };
    });
    const avant = f.taille, apres = r.octets.length;
    if (apres >= avant * 0.97) {
      return { fichiers: [pdf(r.octets, sansExtension(f.nom) + "-compresse.pdf", "à peine plus léger")],
        resume: "Ce PDF était déjà léger : " + taille(avant) + " → " + taille(apres) + ". " + (r.nbImages ? "Ses " + r.nbImages + " image(s) ne gagnaient rien à être réenregistrées." : "Il ne contient pas d'image : c'est du texte, déjà compact.") };
    }
    return { fichiers: [pdf(r.octets, sansExtension(f.nom) + "-compresse.pdf", "−" + pourcent(avant, apres) + " %")],
      resume: "<b>" + taille(avant) + " → " + taille(apres) + "</b> (−" + pourcent(avant, apres) + " %). " + r.nbImages + " image(s) réenregistrée(s) au plus " + max + " px." };
  },
};

/* ── protéger, déverrouiller, réparer ── */
const proteger = {
  id: "proteger", titre: "Protéger par mot de passe", resume: "Chiffrer un PDF : sans le mot de passe, impossible de l'ouvrir.",
  mots: "chiffrer securiser mot de passe verrouiller crypter confidentiel aes",
  description: "Chiffrement AES-256, le plus fort que prévoit la norme PDF. Retenez bien le mot de passe : <b>personne</b> ne pourra rouvrir le fichier sans lui.",
  entree: UN_PDF,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Mot de passe</span><input type="password" name="mdp" autocomplete="new-password"></label>' +
    '<label class="af-champ"><span>Le retaper</span><input type="password" name="mdp2" autocomplete="new-password"></label></div>' +
    '<label class="af-case"><input type="checkbox" name="voir"> Afficher le mot de passe</label>' +
    '<label class="af-case"><input type="checkbox" name="interdire"> Demander aux lecteurs d\'interdire l\'impression et la copie du texte (une consigne que respectent Acrobat et la plupart des lecteurs)</label>',
  brancher(ctx) {
    ctx.q('[name="voir"]').addEventListener("change", () => { for (const i of ctx.qa('[name^="mdp"]')) i.type = ctx.val("voir") ? "text" : "password"; });
  },
  bouton: "Protéger",
  async executer(ctx) {
    const f = ctx.premier;
    const m = ctx.val("mdp");
    if (!m) throw new Error("choisissez un mot de passe");
    if (m !== ctx.val("mdp2")) throw new Error("les deux mots de passe ne sont pas identiques");
    const permissions = ctx.val("interdire") ? -2072 : -4;          // -4 sans les bits 3 (imprimer), 5 (copier), 12 (imprimer en HD)
    const octets = await Op.proteger(f.doc, m, { permissions });
    return [pdf(octets, sansExtension(f.nom) + "-protege.pdf", "AES-256")];
  },
};
const deverrouiller = {
  id: "deverrouiller", titre: "Retirer un mot de passe", resume: "Enregistrer un PDF protégé sans son mot de passe (il faut le connaître).",
  mots: "debloquer enlever supprimer mot de passe dechiffrer ouvrir securite",
  description: "Choisissez le PDF et tapez son mot de passe dans la liste : une copie sans protection est enregistrée. Fonctionne avec RC4 40 et 128 bits, AES-128 et AES-256.",
  entree: UN_PDF,
  bouton: "Retirer la protection",
  async executer(ctx) {
    const f = ctx.premier;
    if (!f.doc.dechiffreur) throw new Error("ce PDF n'est pas protégé : il n'y a rien à retirer");
    return [pdf(await Op.deverrouiller(f.doc), sansExtension(f.nom) + "-sans-mdp.pdf", "protection retirée")];
  },
};
const reparer = {
  id: "reparer", titre: "Réparer un PDF", resume: "Récupérer un PDF abîmé (téléchargement coupé, fichier « endommagé »).",
  mots: "endommage corrompu casse abime recuperer erreur ouvrir",
  description: "L'atelier relit le fichier octet par octet pour retrouver ses objets quand la table qui les indexe est fausse, puis l'enregistre proprement.",
  entree: UN_PDF,
  bouton: "Réparer",
  async executer(ctx) {
    const f = ctx.premier;
    const octets = await Op.reecrire(f.doc);
    const n = await nbPages(octets);
    return { fichiers: [pdf(octets, sansExtension(f.nom) + "-repare.pdf", pages(n))],
      resume: f.doc.repare ? "Le fichier était bien abîmé : sa table d'objets a été reconstruite, " + pages(n) + " récupérée(s)." : "Le fichier n'avait pas de défaut visible : il a été réécrit proprement (" + pages(n) + ")." };
  },
};

export const OUTILS = [fusionner, diviser, organiser, extraire, supprimer, pivoter, compresser, imagesPdf, scanner, pdfJpg, pdfImages,
  signer, texte, numeroter, filigrane, recadrer, proteger, deverrouiller, metadonnees, reparer];
