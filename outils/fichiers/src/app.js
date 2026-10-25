/* L'atelier fichiers : l'accueil (les outils en tuiles) et l'ÉTABLI commun
   à tous les outils — le dépôt des fichiers, leur liste, les réglages, le
   bouton, les résultats à télécharger.

   Un outil se décrit (voir outils/pdf.js) :
     { id, titre, resume, description, mots,
       entree: { types: ["pdf" | "image" | "zip" | "tout"], multiple, min, libelle } | null,
       options(ctx) → HTML des réglages,  brancher?(ctx),  surFichiers?(ctx),
       bouton, executer(ctx) → [{ nom, blob, note? }] | { fichiers, resume } }

   Rien ne sort de la page : les fichiers sont lus en mémoire, travaillés
   ici, et rendus comme des liens de téléchargement (adresses « blob: »). */

import { DocumentPdf } from "./pdf/lecture.js";
import { creerZip } from "./zip.js";
import { OUTILS as PDF } from "./outils/pdf.js";
import { OUTILS as IMAGES } from "./outils/images.js";
import { OUTILS as DIVERS } from "./outils/divers.js";
import { icone } from "./icones.js";
import { Grille } from "./apercu.js";
import { esc, taille, typeDe, IMAGES as TYPES_IMAGE, decoderImage, octetsDe } from "./aides.js";

const FAMILLES = [
  { id: "pdf", titre: "PDF", outils: PDF,
    resume: "Assembler, découper, réordonner, signer, protéger — le travail de lovepdf, sans envoyer le fichier nulle part." },
  { id: "images", titre: "Images et photos", outils: IMAGES,
    resume: "Convertir, alléger, redimensionner, recadrer, et effacer ce qu'une photo dit de vous (GPS, téléphone)." },
  { id: "divers", titre: "Utilitaires", outils: DIVERS,
    resume: "QR codes, archives ZIP, empreintes de fichiers, mots de passe, texte copié d'un PDF." },
];
const TOUS = new Map(FAMILLES.flatMap((f) => f.outils.map((o) => [o.id, { ...o, famille: f.id }])));

const NON = [
  ["PDF ↔ Word, Excel, PowerPoint", "recomposer une mise en page demande un moteur énorme. Dans Word ou LibreOffice : Fichier → Exporter en PDF. Pour modifier un PDF : LibreOffice Draw ou Word l'ouvrent directement."],
  ["Reconnaître le texte d'un scan (OCR)", "il faut un modèle de reconnaissance de plusieurs dizaines de Mo. L'appareil photo du téléphone le fait déjà : Google Lens, ou « Texte en direct » sur iPhone."],
  ["Modifier le texte déjà écrit dans un PDF", "la police embarquée ne contient souvent que les lettres utilisées. On peut AJOUTER du texte par-dessus (outil « Ajouter du texte »)."],
  ["Signature électronique à valeur légale", "la signature dessinée ici est une image, comme une signature scannée. Un contrat qui exige une signature « qualifiée » passe par un service de signature certifié."],
  ["Vidéo et son", "convertir ou compresser une vidéo demande ffmpeg (plusieurs dizaines de Mo)."],
  ["Archives RAR, 7z", "seul le ZIP est pris en charge ; 7-Zip (gratuit) ouvre les autres."],
];

const accueil = document.getElementById("af-accueil");
const section = document.getElementById("af-outil");
const fil = document.querySelector(".fil-app");
const filOrigine = fil ? fil.innerHTML : "";
const TITRE = document.title;
let courant = null;
let transfert = null;              // des fichiers passés d'un outil au suivant

const sansAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ── l'accueil ── */
function dessinerAccueil() {
  let h = '<p class="af-confiance">' + icone("cadenas").replace("<svg", '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"') +
    " Vos fichiers ne quittent jamais cet appareil — l'atelier marche aussi hors ligne.</p>";
  h += '<label class="af-champ af-filtre"><span>Chercher un outil</span><input class="af-saisie" type="search" placeholder="fusionner, jpg, mot de passe, signature…" autocomplete="off"></label>';
  for (const f of FAMILLES) {
    h += '<section class="af-famille" data-famille="' + f.id + '"><h2>' + esc(f.titre) + ' <small class="af-compte">' + f.outils.length + " outils</small></h2><p>" + esc(f.resume) + '</p><div class="af-tuiles">';
    for (const o of f.outils) {
      h += '<a class="af-tuile" href="#' + o.id + '" data-mots="' + esc(sansAccents(o.titre + " " + o.resume + " " + (o.mots || ""))) + '">' +
        '<span class="af-ic">' + icone(o.id) + "</span><b>" + esc(o.titre) + "</b><span>" + esc(o.resume) + "</span></a>";
    }
    h += "</div></section>";
  }
  h += '<p class="af-vide" hidden>Aucun outil ne correspond. Essayez « pdf », « image », « zip »…</p>';
  h += '<aside class="af-non"><h2>Ce que l\'atelier ne fait pas — et quoi faire à la place</h2><ul>' +
    NON.map(([t, d]) => "<li><b>" + esc(t) + "</b> : " + esc(d) + "</li>").join("") + "</ul></aside>";
  accueil.innerHTML = h;
  const filtre = accueil.querySelector(".af-filtre input");
  filtre.addEventListener("input", () => {
    const mots = sansAccents(filtre.value).split(/\s+/).filter(Boolean);
    let total = 0;
    for (const s of accueil.querySelectorAll(".af-famille")) {
      let n = 0;
      for (const t of s.querySelectorAll(".af-tuile")) {
        const ok = mots.every((m) => t.dataset.mots.includes(m));
        t.hidden = !ok;
        if (ok) n++;
      }
      s.hidden = n === 0;
      total += n;
    }
    accueil.querySelector(".af-vide").hidden = total > 0;
  });
}

/* ── l'établi d'un outil ── */
class Etabli {
  constructor(outil, racine) {
    this.outil = outil;
    this.fichiers = [];
    this.urls = [];
    this.nettoyages = [];
    this.occupe = false;
    let id = 0;
    this.nouvelId = () => ++id;
    const e = outil.entree;
    racine.innerHTML =
      '<button type="button" class="af-retour">' + icone("retour").replace("<svg", '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"') + " Tous les outils</button>" +
      '<div class="af-carte"><h2><span class="af-ic">' + icone(outil.id) + "</span>" + esc(outil.titre) + "</h2>" +
      '<p class="af-desc">' + (outil.description || esc(outil.resume)) + "</p>" +
      (e ? '<label class="af-depot"><input type="file" hidden' + (e.multiple ? " multiple" : "") + (e.accepte ? ' accept="' + e.accepte + '"' : "") + ">" +
        icone("depot") + "<b>" + esc(e.libelle || (e.multiple ? "Choisir des fichiers" : "Choisir un fichier")) + "</b>" +
        "<span>ou glissez-les ici" + (e.types && e.types.includes("image") ? " — ou collez une capture (Ctrl+V)" : "") + "</span></label>" +
        '<ul class="af-liste"></ul>' : "") +
      '<div class="af-reglages"></div><div class="af-zone"></div>' +
      '<div class="af-go"><button type="button" class="af-bouton af-lancer">' + esc(outil.bouton || "Lancer") + '</button><span class="af-statut" role="status"></span></div>' +
      '<div class="af-resultats"></div></div>';
    this.carte = racine.querySelector(".af-carte");
    this.liste = this.q(".af-liste");
    this.reglages = this.q(".af-reglages");
    this.zone = this.q(".af-zone");
    this.bouton = this.q(".af-lancer");
    this.statutEl = this.q(".af-statut");
    this.resultatsEl = this.q(".af-resultats");
    racine.querySelector(".af-retour").onclick = () => { location.hash = ""; };
    if (e) {
      const input = this.q(".af-depot input");
      input.addEventListener("change", () => { this.ajouter([...input.files]); input.value = ""; });
      const depot = this.q(".af-depot");
      depot.addEventListener("dragenter", () => depot.classList.add("survol"));
      depot.addEventListener("dragleave", () => depot.classList.remove("survol"));
      depot.addEventListener("drop", () => depot.classList.remove("survol"));
    }
    this.reglages.innerHTML = outil.options ? outil.options(this) : "";
    if (!this.reglages.innerHTML) this.reglages.hidden = true;
    if (outil.sansBouton) this.q(".af-go").hidden = true;
    this.bouton.onclick = () => this.lancer();
    if (outil.brancher) outil.brancher(this);
    this.verifier();
  }

  q(sel) { return this.carte.querySelector(sel); }
  qa(sel) { return [...this.carte.querySelectorAll(sel)]; }
  /* La valeur d'un réglage, d'après son « name ». */
  val(nom) {
    const els = this.qa('[name="' + nom + '"]');
    if (!els.length) return undefined;
    const el = els[0];
    if (el.type === "radio") { const c = els.find((x) => x.checked); return c ? c.value : undefined; }
    if (el.type === "checkbox") return el.checked;
    if (el.type === "number" || el.type === "range") return el.value === "" ? undefined : Number(el.value);
    return el.value;
  }
  get valides() { return this.fichiers.filter((f) => f.pret); }
  get premier() { return this.valides[0]; }
  url(blob) { const u = URL.createObjectURL(blob); this.urls.push(u); return u; }
  surQuitter(fn) { this.nettoyages.push(fn); }
  quitter() {
    if (this.grilleResultat) this.grilleResultat.detruire();
    for (const f of this.nettoyages) { try { f(); } catch (e) { /* rien */ } }
    for (const u of this.urls) URL.revokeObjectURL(u);
  }
  statut(msg, erreur = false) {
    this.statutEl.textContent = msg || "";
    this.statutEl.classList.toggle("erreur", !!erreur);
  }
  /* Rendre la main au navigateur (une barre de progression qui bouge). */
  souffler() { return new Promise((r) => setTimeout(r, 0)); }

  /* ── les fichiers ── */
  ajouter(fichiers) {
    const e = this.outil.entree;
    if (!e || !fichiers.length) return;
    if (!e.multiple) { this.fichiers = []; fichiers = fichiers.slice(0, 1); }
    for (const f of fichiers) {
      const entree = { id: this.nouvelId(), fichier: f, nom: f.name || "fichier", taille: f.size, info: "lecture…", pret: false };
      this.fichiers.push(entree);
      this.charger(entree);
    }
    this.resultatsEl.innerHTML = "";
    this.statut("");
    this.dessinerListe();
    this.verifier();
  }
  async charger(f) {
    try {
      f.octets = new Uint8Array(await f.fichier.arrayBuffer());
      f.type = typeDe(f.octets, f.nom);
      const types = this.outil.entree.types || ["tout"];
      const famille = f.type === "pdf" ? "pdf" : TYPES_IMAGE.has(f.type) ? "image" : f.type;
      if (!types.includes("tout") && !types.includes(famille)) throw new Error(refus(types, f.type));
      if (f.type === "pdf" && types.includes("pdf")) await this.ouvrirPdf(f);
      else if (famille === "image" && types.includes("image")) {
        const img = await decoderImage(f.octets, f.type);
        f.largeur = img.largeur; f.hauteur = img.hauteur;
        img.fermer();
        f.info = taille(f.taille) + " · " + f.type.toUpperCase() + " · " + f.largeur + " × " + f.hauteur + " px";
        f.pret = true;
      } else { f.info = taille(f.taille); f.pret = true; }
      f.erreur = null;
    } catch (err) {
      f.erreur = err.message || String(err);
      f.pret = false;
    }
    if (!this.fichiers.includes(f)) return;
    this.dessinerListe();
    this.verifier();
    if (this.outil.surFichiers) this.outil.surFichiers(this);
  }
  async ouvrirPdf(f, motDePasse = "") {
    try {
      f.doc = await DocumentPdf.ouvrir(f.octets, { motDePasse });
      f.motDePasse = motDePasse;
      f.verrouille = false;
      f.pages = (await f.doc.pages()).length;
      if (!f.pages) throw new Error("ce PDF ne contient aucune page lisible");
      f.info = taille(f.taille) + " · " + f.pages + " page" + (f.pages > 1 ? "s" : "") +
        (f.doc.dechiffreur ? " · protégé, ouvert" : "") + (f.doc.repare ? " · abîmé, réparé à la lecture" : "");
      f.pret = true;
      f.erreur = null;
    } catch (err) {
      if (!err.motDePasse) throw err;
      f.verrouille = true;
      f.pret = false;
      f.info = "protégé par un mot de passe";
      f.erreur = motDePasse ? "mot de passe incorrect" : null;
    }
  }
  retirer(id) {
    this.fichiers = this.fichiers.filter((f) => f.id !== id);
    this.dessinerListe();
    this.verifier();
    if (this.outil.surFichiers) this.outil.surFichiers(this);
  }
  deplacer(id, versId) {
    const i = this.fichiers.findIndex((f) => f.id === id), j = this.fichiers.findIndex((f) => f.id === versId);
    if (i < 0 || j < 0 || i === j) return;
    const [f] = this.fichiers.splice(i, 1);
    this.fichiers.splice(j, 0, f);
    this.dessinerListe();
    if (this.outil.surFichiers) this.outil.surFichiers(this);
  }
  dessinerListe() {
    if (!this.liste) return;
    const multiple = this.outil.entree.multiple && this.fichiers.length > 1;
    this.liste.innerHTML = this.fichiers.map((f, i) =>
      '<li class="af-fichier" data-id="' + f.id + '"' + (multiple ? ' draggable="true"' : "") + ">" +
      (multiple ? '<span class="af-poignee" title="Glisser pour ranger" aria-hidden="true">⠿</span>' : "<span></span>") +
      '<span class="af-nom" title="' + esc(f.nom) + '">' + esc(f.nom) + "</span>" +
      '<span class="af-actions-f">' +
      (multiple ? '<button type="button" class="af-mini" data-a="haut" aria-label="Monter"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
        '<button type="button" class="af-mini" data-a="bas" aria-label="Descendre"' + (i === this.fichiers.length - 1 ? " disabled" : "") + ">↓</button>" : "") +
      '<button type="button" class="af-mini" data-a="retirer" aria-label="Retirer ' + esc(f.nom) + '">✕</button></span>' +
      '<span class="af-info' + (f.erreur ? " erreur" : "") + '">' + esc(f.erreur ? (f.verrouille ? f.info + " — " : "") + f.erreur : f.info) + "</span>" +
      (f.verrouille ? '<form class="af-mdp"><input type="password" autocomplete="off" placeholder="Mot de passe du PDF" aria-label="Mot de passe de ' + esc(f.nom) + '"><button class="af-bouton af-second">Ouvrir</button></form>' : "") +
      "</li>").join("");
    for (const li of this.liste.children) {
      const id = +li.dataset.id;
      li.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-a]");
        if (!b) return;
        const i = this.fichiers.findIndex((f) => f.id === id);
        if (b.dataset.a === "retirer") this.retirer(id);
        else if (b.dataset.a === "haut" && i > 0) this.deplacer(id, this.fichiers[i - 1].id);
        else if (b.dataset.a === "bas" && i < this.fichiers.length - 1) this.deplacer(id, this.fichiers[i + 1].id);
      });
      const form = li.querySelector(".af-mdp");
      if (form) form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = this.fichiers.find((x) => x.id === id);
        f.info = "ouverture…";
        await this.ouvrirPdf(f, form.querySelector("input").value).catch((err) => { f.erreur = err.message; });
        this.dessinerListe();
        this.verifier();
        if (f.pret && this.outil.surFichiers) this.outil.surFichiers(this);
        else if (!f.pret) { const i2 = this.liste.querySelector('[data-id="' + id + '"] .af-mdp input'); if (i2) i2.focus(); }
      });
      if (multiple) {
        li.addEventListener("dragstart", (ev) => { ev.dataTransfer.setData("text/x-af", String(id)); ev.dataTransfer.effectAllowed = "move"; li.classList.add("glisse"); });
        li.addEventListener("dragend", () => li.classList.remove("glisse"));
        li.addEventListener("dragover", (ev) => { if (ev.dataTransfer.types.includes("text/x-af")) { ev.preventDefault(); li.classList.add("cible"); } });
        li.addEventListener("dragleave", () => li.classList.remove("cible"));
        li.addEventListener("drop", (ev) => {
          li.classList.remove("cible");
          const de = +ev.dataTransfer.getData("text/x-af");
          if (de) { ev.preventDefault(); ev.stopPropagation(); this.deplacer(de, id); }
        });
      }
    }
  }
  verifier() {
    const e = this.outil.entree;
    let ok = !this.occupe;
    if (e) {
      const enCours = this.fichiers.some((f) => !f.pret && !f.erreur && !f.verrouille);
      ok = ok && !enCours && this.valides.length >= (e.min || 1);
    }
    if (this.outil.pret) ok = ok && this.outil.pret(this);
    this.bouton.disabled = !ok;
  }

  /* ── lancer, et montrer ce qui en sort ── */
  async lancer() {
    if (this.occupe) return;
    this.occupe = true;
    this.verifier();
    this.resultatsEl.innerHTML = "";
    this.statut("Travail en cours…");
    const t0 = performance.now();
    try {
      await this.souffler();
      const r = await this.outil.executer(this);
      const ms = performance.now() - t0;
      if (r) {
        this.resultats(r);
        this.statut((ms < 150 ? "Fait." : "Fait en " + (ms / 1000).toFixed(1).replace(".", ",") + " s.") + " Rien n'a quitté votre appareil.");
      }
    } catch (err) {
      console.error(err);
      this.statut(err.message || String(err), true);
    } finally {
      this.occupe = false;
      this.verifier();
    }
  }
  resultats(r) {
    const liste = Array.isArray(r) ? r : r.fichiers || [];
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
    let h = r.resume ? '<div class="af-info-boite">' + r.resume + "</div>" : "";
    const ligne = (x) => {
      const u = this.url(x.blob);
      return '<div class="af-resultat"><span class="af-nom" title="' + esc(x.nom) + '">' + esc(x.nom) + "</span><small>" + taille(x.blob.size) + (x.note ? " · " + esc(x.note) : "") + "</small>" +
        '<a class="af-bouton" href="' + u + '" download="' + esc(x.nom) + '">Télécharger</a>' +
        (/^(application\/pdf|image\/)/.test(x.blob.type) ? '<a href="' + u + '" target="_blank" rel="noopener">Ouvrir</a>' : "") + "</div>";
    };
    if (liste.length > 1) {
      h += '<div class="af-resultat"><span class="af-nom">Les ' + liste.length + " fichiers d'un coup</span><small>" + taille(liste.reduce((s, x) => s + x.blob.size, 0)) + "</small>" +
        '<button type="button" class="af-bouton af-zip">Télécharger le ZIP</button></div>';
    }
    if (liste.length > 12) {
      h += liste.slice(0, 5).map(ligne).join("") + "<details><summary>Voir les " + (liste.length - 5) + " autres fichiers</summary>" + liste.slice(5).map(ligne).join("") + "</details>";
    } else h += liste.map(ligne).join("");
    // l'aperçu : le lecteur PDF du navigateur, ou l'image
    const seul = liste.length === 1 ? liste[0] : null;
    if (seul && seul.blob.type === "application/pdf" && navigator.pdfViewerEnabled) {
      h += '<iframe class="af-apercu" title="Aperçu de ' + esc(seul.nom) + '" src="' + this.urls[0] + '"></iframe>';
    } else if (seul && seul.blob.type === "application/pdf") {
      // pas de lecteur PDF intégré (Android) : les pages, dessinées par l'atelier
      h += '<div class="af-pages af-apercu-pages" aria-label="Aperçu des pages"></div>';
    } else if (seul && /^image\//.test(seul.blob.type)) {
      h += '<img class="af-image-apercu" alt="Aperçu de ' + esc(seul.nom) + '" src="' + this.urls[0] + '">';
    } else if (liste.length > 1 && liste.length <= 24 && liste.every((x) => /^image\//.test(x.blob.type))) {
      h += '<div class="af-vignettes">' + liste.map((x, i) => '<figure><img alt="' + esc(x.nom) + '" src="' + this.urls[i] + '"></figure>').join("") + "</div>";
    }
    // continuer avec le résultat dans un autre outil
    if (seul && !this.outil.sansSuite) {
      const famille = seul.blob.type === "application/pdf" ? "pdf" : /^image\//.test(seul.blob.type) ? "image" : null;
      const suites = famille ? [...TOUS.values()].filter((o) => o.id !== this.outil.id && o.entree && o.entree.types && o.entree.types.includes(famille)) : [];
      if (suites.length) {
        h += '<label class="af-champ af-suite"><span>Continuer avec ce résultat</span><select><option value="">— choisir un outil —</option>' +
          suites.map((o) => '<option value="' + o.id + '">' + esc(o.titre) + "</option>").join("") + "</select></label>";
      }
    }
    this.resultatsEl.innerHTML = h;
    if (this.grilleResultat) { this.grilleResultat.detruire(); this.grilleResultat = null; }
    const ap = this.resultatsEl.querySelector(".af-apercu-pages");
    if (ap) {
      seul.blob.arrayBuffer().then((b) => DocumentPdf.ouvrir(new Uint8Array(b))).then(async (doc) => {
        const n = (await doc.pages()).length;
        this.grilleResultat = new Grille(ap, { items: Array.from({ length: Math.min(n, 24) }, (_, i) => ({ doc, index: i, rotation: 0 })) });
      }).catch(() => ap.remove());                       // protégé par mot de passe : pas d'aperçu
    }
    const z = this.resultatsEl.querySelector(".af-zip");
    if (z) z.onclick = async () => {
      z.disabled = true;
      const nom = (this.outil.nomZip || this.outil.id) + ".zip";
      const zip = await creerZip(await Promise.all(liste.map(async (x) => ({ nom: x.nom, octets: await octetsDe(x.blob) }))));
      const a = document.createElement("a");
      a.href = this.url(zip); a.download = nom;
      document.body.appendChild(a); a.click(); a.remove();
      z.disabled = false;
    };
    const s = this.resultatsEl.querySelector(".af-suite select");
    if (s) s.onchange = () => {
      if (!s.value) return;
      transfert = [new File([seul.blob], seul.nom, { type: seul.blob.type })];
      location.hash = s.value;
    };
    this.resultatsEl.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }
}

function refus(types, type) {
  const quoi = types.map((t) => ({ pdf: "un PDF", image: "une image", zip: "une archive ZIP" })[t] || t).join(" ou ");
  if (type === "bureautique") return "c'est un document Word/Excel/PowerPoint : exportez-le d'abord en PDF (Fichier → Exporter)";
  return "ce fichier n'est pas " + quoi + (type && type !== "autre" ? " (c'est un fichier " + type.toUpperCase() + ")" : "");
}

/* ── la navigation : #fusionner ouvre l'outil, rien = l'accueil ── */
function route() {
  const id = decodeURIComponent(location.hash.slice(1));
  const o = TOUS.get(id);
  if (courant) { courant.quitter(); courant = null; }
  document.body.classList.toggle("af-ouvert", !!o);
  if (o) {
    accueil.hidden = true;
    section.hidden = false;
    courant = new Etabli(o, section);
    if (transfert) { courant.ajouter(transfert); transfert = null; }
    document.title = o.titre + " — Atelier fichiers — BTS CIEL";
    if (fil) fil.innerHTML = filOrigine.replace(/<span>Atelier fichiers<\/span>/, '<a href="#">Atelier fichiers</a> <span>/</span> <span>' + esc(o.titre) + "</span>");
    section.scrollIntoView({ block: "start" });
  } else {
    section.hidden = true;
    section.innerHTML = "";
    accueil.hidden = false;
    document.title = TITRE;
    if (fil) fil.innerHTML = filOrigine;
  }
}

/* Un fichier lâché à côté de la zone ne doit pas faire quitter la page
   (le navigateur l'ouvrirait à la place de l'atelier). */
addEventListener("dragover", (ev) => { if (ev.dataTransfer && ev.dataTransfer.types.includes("Files")) ev.preventDefault(); });
addEventListener("drop", (ev) => {
  if (!ev.dataTransfer || !ev.dataTransfer.files.length) return;
  ev.preventDefault();
  if (courant && courant.outil.entree) courant.ajouter([...ev.dataTransfer.files]);
});
/* Coller une capture d'écran (Ctrl+V) dans un outil qui prend des images. */
addEventListener("paste", (ev) => {
  if (!courant || !courant.outil.entree || !ev.clipboardData) return;
  const f = [...ev.clipboardData.files];
  if (!f.length) return;
  ev.preventDefault();
  courant.ajouter(f.map((x, i) => (x.name && x.name !== "image.png" ? x : new File([x], "capture-" + (i + 1) + "." + (x.type.split("/")[1] || "png"), { type: x.type }))));
});

dessinerAccueil();
addEventListener("hashchange", route);
route();
