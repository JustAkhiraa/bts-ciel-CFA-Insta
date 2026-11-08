/* Les jeux du jour.

   Quatre jeux, un nouveau chaque jour, faits avec le cours :
     · le mot du jour      : un mot du vocabulaire, en six essais. Un essai
                             doit être un mot ÉCRIT dans les fiches publiées
                             (le lexique, fabriqué par publier.py) : une suite
                             de lettres au hasard est refusée ;
     · la notion cachée    : un passage du cours, mots masqués, à dévoiler ;
     · le terminal         : des machines à infiltrer en tapant les bonnes
                             commandes, de plus en plus vite (une partie
                             s'arrête à la troisième erreur) ;
     · la grille binaire   : des 0 et des 1 à placer selon trois règles.

   Pas de serveur : le jeu du jour est TIRÉ DE LA DATE. Une graine faite de
   la date donne la même suite de hasards sur tous les appareils, donc le
   même jeu pour toute la classe, et hors ligne. La partie et les séries
   sont gardées dans le navigateur de chacun.

   L'écran : un accueil (la date, et les quatre jeux avec l'aperçu de leur
   partie du jour), puis un jeu à la fois, avec sa barre (retour, titre,
   règles). La fin d'une partie montre le bilan, les séries, le partage et
   le jeu suivant.

   Les données (mots, lexique, commandes, passages du cours) sont écrites
   dans « donnees.js » par la publication. */
(function () {
  "use strict";
  const D = window.JEUX_DONNEES;
  const racine = document.getElementById("jeux");
  if (!racine || !D) return;

  /* ═══════════════ 1. Le jour, la graine, le hasard ═════════════════ */
  const pad = (n) => String(n).padStart(2, "0");
  const maintenant = new Date();
  const jourDe = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const JOUR = jourDe(maintenant);
  const HIER = jourDe(new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - 1));
  // le n° 1 est le dimanche 8 novembre 2026, le jour où les jeux sont nés
  const NUMERO = Math.round((Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
    - Date.UTC(2026, 10, 8)) / 86400000) + 1;
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
                "septembre", "octobre", "novembre", "décembre"];

  function graine(texte) {
    let h = 2166136261;
    for (let i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function hasard(g) {
    let s = g >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function melanger(tab, r) {
    const t = tab.slice();
    for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
    return t;
  }
  // le n-ième élément d'une liste mélangée une fois pour toutes : aucun
  // retour avant que la liste entière soit passée
  function duJour(liste, nom) {
    const ordre = melanger(liste.map((_, i) => i), hasard(graine(nom + "-v1")));
    const k = ((NUMERO - 1) % liste.length + liste.length) % liste.length;
    return liste[ordre[k]];
  }

  /* ═══════════════ 2. La mémoire de chacun ══════════════════════════ */
  const CLE = "jeux-du-jour-v1";
  let memoire = {};
  try { memoire = JSON.parse(localStorage.getItem(CLE)) || {}; } catch (e) { memoire = {}; }
  memoire.jours = memoire.jours || {};
  memoire.stats = memoire.stats || {};
  memoire.regles = memoire.regles || {};
  // trente jours gardés, pas plus
  Object.keys(memoire.jours).sort().slice(0, -30).forEach((j) => delete memoire.jours[j]);
  function ecrireMemoire() {
    try { localStorage.setItem(CLE, JSON.stringify(memoire)); } catch (e) { /* navigation privée : on joue sans mémoire */ }
  }
  const partieDuJour = (jeu) => (memoire.jours[JOUR] || {})[jeu];
  const fini = (jeu) => !!(partieDuJour(jeu) || {}).fini;
  function garder(jeu, etat) {
    (memoire.jours[JOUR] = memoire.jours[JOUR] || {})[jeu] = etat;
    ecrireMemoire();
  }
  // Les compteurs d'une version précédente ont pu être écrits incomplets
  // (un « record » posé avant le premier compte) : chaque champ absent ou
  // illisible repart de zéro au lieu de devenir NaN.
  function statsDe(jeu) {
    const s = memoire.stats[jeu] = memoire.stats[jeu] || {};
    ["joues", "gagnes", "serie", "meilleure"].forEach((k) => { if (typeof s[k] !== "number" || !isFinite(s[k])) s[k] = 0; });
    s.dernier = s.dernier || "";
    return s;
  }
  function compter(jeu, gagne, detail) {
    const s = statsDe(jeu);
    if (s.dernierJour === JOUR) return s;
    s.dernierJour = JOUR;
    s.joues++;
    if (gagne) {
      s.serie = s.dernier === HIER ? s.serie + 1 : 1;
      s.meilleure = Math.max(s.meilleure, s.serie);
      s.gagnes++;
      s.dernier = JOUR;
      if (jeu === "mot") { s.dist = s.dist || {}; s.dist[detail] = (s.dist[detail] || 0) + 1; }
      if (jeu === "binaire") s.record = s.record ? Math.min(s.record, detail) : detail;
    } else s.serie = 0;
    ecrireMemoire();
    return s;
  }
  // une série affichée n'est vivante que si le dernier succès date
  // d'aujourd'hui ou d'hier
  const serieDe = (jeu) => { const s = statsDe(jeu); return s.dernier === JOUR || s.dernier === HIER ? s.serie : 0; };

  /* ═══════════════ 3. Petits outils ═════════════════════════════════ */
  const ech = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sansAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const el = (balise, classe, html) => { const e = document.createElement(balise); if (classe) e.className = classe; if (html != null) e.innerHTML = html; return e; };
  const pluriel = (n, mot, pl) => n + " " + (n > 1 ? (pl || mot + "s") : mot);
  const minSec = (s) => Math.floor(s / 60) + ":" + pad(s % 60);
  const duree = (s) => (s < 60 ? s + " s" : Math.floor(s / 60) + " min " + pad(s % 60));
  const animations = () => document.documentElement.dataset.anim !== "0"
    && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const lienCours = (chemin, ancre) => "../" + chemin + "/cours.html" + (ancre ? "#" + ancre : "");
  const MATIERE = { "01-informatique-dev": "Dev", "02-reseaux-systemes": "Réseaux", "03-mathematiques": "Maths",
    "04-anglais": "Anglais", "05-culture-generale": "Culture G", "06-physique": "Physique" };
  const matiereDe = (chemin) => MATIERE[chemin.split("/")[0]] || "";

  // les pictogrammes : même trait que ceux du site (24 × 24, trait rond)
  const SVG = {
    retour: '<path d="m14.5 6-6 6 6 6"/>',
    aide: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.4a2.4 2.4 0 0 1 4.6.8c0 1.6-2.3 2.1-2.3 3.5"/><path d="M12 16.6v.1"/>',
    fermer: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    horloge: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    ampoule: '<path d="M9.5 17.5h5M10.5 20.5h3"/><path d="M12 3.5a5.5 5.5 0 0 0-3.3 9.9c.5.4.8 1 .8 1.6v.5h5V15c0-.6.3-1.2.8-1.6A5.5 5.5 0 0 0 12 3.5z"/>',
    copier: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    fleche: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    effacer: '<path d="M20 5H9l-6.5 7L9 19h11a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m16 9.5-5 5M11 9.5l5 5"/>',
    annuler: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    rejouer: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/>',
    jouer: '<path d="M7.5 5v14l11-7z"/>',
    coeur: '<path d="M12 20s-7.5-4.6-7.5-10.3A4.1 4.1 0 0 1 12 7.5a4.1 4.1 0 0 1 7.5 2.2C19.5 15.4 12 20 12 20z"/>',
  };
  const ico = (nom, classe) => '<svg class="jx-ico' + (classe ? " " + classe : "") + '" viewBox="0 0 24 24" fill="none" '
    + 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SVG[nom] + "</svg>";

  function avant() {
    const minuit = new Date(); minuit.setHours(24, 0, 0, 0);
    if (jourDe(new Date()) !== JOUR) return "un instant : recharge la page";
    const ms = minuit - Date.now(), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
    return h ? h + " h " + pad(m) : m + " min";
  }

  /* ═══════════════ 4. L'accueil, la coque d'un jeu, le bilan ════════ */
  const JEUX = [
    { id: "mot", nom: "Le mot du jour", dit: "Un mot du cours, en six essais." },
    { id: "notion", nom: "La notion cachée", dit: "Un passage du cours aux mots masqués : trouve son titre." },
    { id: "terminal", nom: "Le terminal", dit: "Infiltre des machines en tapant les bonnes commandes." },
    { id: "binaire", nom: "La grille binaire", dit: "Des 0 et des 1, trois règles, une seule solution." },
  ];
  const scene = el("div");
  const voix = el("p", "jx-cache");
  voix.setAttribute("aria-live", "polite");
  racine.append(scene, voix);
  const dire = (t) => { voix.textContent = ""; setTimeout(() => { voix.textContent = t; }, 40); };

  // ce que le jeu ouvert doit défaire en partant : minuteurs, écouteurs
  let nettoyer = [];
  function quitter() { nettoyer.forEach((f) => f()); nettoyer = []; }

  function ouvrir() {
    quitter();
    const id = location.hash.slice(1);
    const jeu = JEUX.find((j) => j.id === id);
    document.documentElement.classList.toggle("jx-en-partie", !!jeu);
    scene.innerHTML = "";
    if (!jeu) accueil();
    else ({ mot: jeuMot, notion: jeuNotion, terminal: jeuTerminal, binaire: jeuBinaire })[id]();
  }
  window.addEventListener("hashchange", () => { ouvrir(); window.scrollTo(0, 0); });
  setInterval(() => document.querySelectorAll("[data-compte]").forEach((e) => { e.textContent = avant(); }), 30000);

  function etat(id) {
    const p = partieDuJour(id), a = { texte: "À jouer", classe: "a-jouer" };
    if (!p) return a;
    if (id === "mot") return p.fini ? (p.gagne ? { texte: "Trouvé en " + p.essais.length + "/6", classe: "reussi" } : { texte: "Raté", classe: "rate" })
      : p.essais.length ? { texte: "En cours · " + p.essais.length + "/6", classe: "en-cours" } : a;
    if (id === "notion") return p.fini ? (p.gagne ? { texte: "Trouvée en " + pluriel(p.mots.length, "mot"), classe: "reussi" } : { texte: "Réponse dévoilée", classe: "rate" })
      : p.mots.length ? { texte: "En cours · " + pluriel(p.mots.length, "mot"), classe: "en-cours" } : a;
    if (id === "terminal") return p.fini ? { texte: pluriel(p.machines, "machine") + " · " + pluriel(p.reussies, "commande"), classe: p.machines ? "reussi" : "rate" }
      : p.commence ? { texte: "En cours · machine " + p.machine, classe: "en-cours" } : a;
    return p.fini ? { texte: "Résolue en " + duree(p.duree), classe: "reussi" } : p.debut ? { texte: "En cours", classe: "en-cours" } : a;
  }

  function accueil() {
    const faits = JEUX.filter((j) => fini(j.id)).length, j = maintenant.getDay();
    const tete = el("div", "jx-jour");
    tete.innerHTML = '<h2 class="jx-jour-titre">' + JOURS[j][0].toUpperCase() + JOURS[j].slice(1) + " " + maintenant.getDate()
      + " " + MOIS[maintenant.getMonth()] + '</h2><p class="jx-jour-meta"><span>Jeux n° <b>' + NUMERO + "</b></span><span><b>"
      + faits + "</b> sur 4 terminés</span><span class=\"jx-compte\">" + ico("horloge") + "Nouveaux dans <b data-compte>"
      + avant() + "</b></span></p>";
    const liste = el("ul", "jx-liste");
    JEUX.forEach((jeu) => {
      const e = etat(jeu.id), serie = serieDe(jeu.id);
      const li = el("li");
      li.innerHTML = '<a class="jx-tuile" href="#' + jeu.id + '"><span class="jx-apercu' + (jeu.id === "terminal" ? " sombre" : "")
        + '" aria-hidden="true">' + APERCUS[jeu.id]() + '</span><span class="jx-tuile-texte"><span class="jx-tuile-nom">' + jeu.nom
        + '</span><span class="jx-tuile-dit">' + jeu.dit + '</span><span class="jx-tuile-pied"><span class="jx-statut ' + e.classe + '">'
        + e.texte + "</span>" + (serie ? '<span class="jx-serie">Série de ' + pluriel(serie, "jour") + "</span>" : "") + "</span></span></a>";
      liste.append(li);
    });
    scene.append(tete, liste);
  }

  // la coque d'un jeu : la barre (retour, titre, règles), les règles
  // repliables (ouvertes d'office la première fois), la zone de jeu et
  // le message éphémère
  function coque(id, titre, meta, regles) {
    const bloc = el("div", "jx-partie jx-" + id);
    const barre = el("div", "jx-barre");
    barre.innerHTML = '<a class="jx-retour" href="#">' + ico("retour") + "<span>Jeux</span></a>"
      + '<div class="jx-barre-titre"><h2>' + titre + "</h2><p>" + meta + "</p></div>"
      + '<button type="button" class="jx-bouton-ico" aria-controls="jx-regles" aria-label="Comment jouer">' + ico("aide") + "</button>";
    const reg = el("div", "jx-regles", '<h3>Comment jouer</h3>' + regles
      + '<button type="button" class="jx-bouton-ico jx-fermer" aria-label="Fermer les règles">' + ico("fermer") + "</button>");
    reg.id = "jx-regles";
    const bouton = barre.querySelector(".jx-bouton-ico");
    const montrer = (oui) => { reg.hidden = !oui; bouton.setAttribute("aria-expanded", String(oui)); };
    montrer(!memoire.regles[id]);
    const vu = () => { if (!memoire.regles[id]) { memoire.regles[id] = 1; ecrireMemoire(); } };
    bouton.addEventListener("click", () => { montrer(reg.hidden); vu(); });
    reg.querySelector(".jx-fermer").addEventListener("click", () => { montrer(false); vu(); bouton.focus(); });
    const zone = el("div", "jx-zone");
    const toast = el("p", "jx-toast");
    toast.setAttribute("aria-hidden", "true");   // « dire » porte l'annonce
    bloc.append(barre, reg, zone, toast);
    scene.append(bloc);
    return { zone, toast, vu, meta: barre.querySelector(".jx-barre-titre p") };
  }
  function signaler(toast, texte) {
    toast.textContent = texte;
    toast.classList.add("vu");
    clearTimeout(toast.minuterie);
    toast.minuterie = setTimeout(() => {
      toast.classList.remove("vu");
      toast.minuterie = setTimeout(() => { toast.textContent = ""; }, 250);
    }, 1900);
    dire(texte);
  }
  // un geste qui efface se confirme d'une seconde touche
  function deuxTemps(bouton, confirmation, action) {
    const libelle = bouton.innerHTML;
    let arme = null;
    bouton.addEventListener("click", () => {
      if (!arme) {
        bouton.textContent = confirmation;
        bouton.classList.add("arme");
        arme = setTimeout(() => { arme = null; bouton.innerHTML = libelle; bouton.classList.remove("arme"); }, 3500);
        return;
      }
      clearTimeout(arme); arme = null; bouton.innerHTML = libelle; bouton.classList.remove("arme");
      action();
    });
  }
  function bouton(classe, icone, texte) {
    const b = el("button", "jx-b" + (classe ? " " + classe : ""), (icone ? ico(icone) : "") + "<span>" + texte + "</span>");
    b.type = "button";
    return b;
  }
  function boutonCopie(texte) {
    const b = bouton("jx-plein", "copier", "Copier mon résultat"), s = b.querySelector("span");
    b.addEventListener("click", () => {
      const finir = (ok) => { s.textContent = ok ? "Copié" : "Copie refusée"; setTimeout(() => { s.textContent = "Copier mon résultat"; }, 2200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte).then(() => finir(true), () => finir(false));
      else finir(false);
    });
    return b;
  }
  function suivant(id) {
    const i = JEUX.findIndex((j) => j.id === id);
    for (let k = 1; k < JEUX.length; k++) { const j = JEUX[(i + k) % JEUX.length]; if (!fini(j.id)) return j; }
    return null;
  }
  const chiffres = (jeu) => { const s = statsDe(jeu); return [[s.joues, "Parties"],
    [(s.joues ? Math.round(s.gagnes / s.joues * 100) : 0) + " %", "Réussite"], [serieDe(jeu), "Série"], [s.meilleure, "Meilleure"]]; };
  function bilan(o) {
    const b = el("div", "jx-bilan", '<p class="jx-bilan-titre">' + o.titre + "</p>"
      + (o.corps ? '<div class="jx-bilan-corps">' + o.corps + "</div>" : "")
      + (o.chiffres ? '<dl class="jx-chiffres">' + o.chiffres.map(([v, l]) => "<div><dt>" + l + "</dt><dd>" + v + "</dd></div>").join("") + "</dl>" : "")
      + (o.repartition || ""));
    const actions = el("div", "jx-actions");
    if (o.partage) actions.append(boutonCopie(o.partage));
    (o.boutons || []).forEach((x) => actions.append(x));
    const s = suivant(o.id);
    const a = el("a", "jx-b", (s ? "<span>Jeu suivant : " + s.nom.replace(/^L[ae] /, "") + "</span>" : "<span>Tous les jeux</span>") + ico("fleche"));
    a.href = s ? "#" + s.id : "#";
    actions.append(a);
    b.append(actions, el("p", "jx-bilan-pied", "Nouveaux jeux dans <b data-compte>" + avant() + "</b>"));
    return b;
  }

  /* ═══════════════ 5. Le mot du jour ════════════════════════════════
     Un mot du vocabulaire du cours. Chaque essai colore ses lettres :
     bien placée, présente ailleurs, absente. Une lettre présente une seule
     fois dans le mot n'est signalée qu'une fois, même tapée deux fois.
     Un essai doit être un mot du LEXIQUE : tous les mots de 4 à 10 lettres
     écrits dans les fiches publiées, sans accent. */
  const ESSAIS = 6;
  const [MOT, DEF, CHEMIN] = duJour(D.mots, "mot");
  let LEXIQUE = null;
  function connu(mot) {
    if (!D.lexique) return true;
    if (!LEXIQUE) {
      LEXIQUE = new Set(D.mots.map((m) => m[0]));
      Object.keys(D.lexique).forEach((n) => {
        const s = D.lexique[n], k = +n;
        for (let i = 0; i + k <= s.length; i += k) LEXIQUE.add(s.slice(i, i + k));
      });
    }
    return LEXIQUE.has(mot);
  }
  function noter(essai) {
    const res = Array(MOT.length).fill("absente"), reste = {};
    for (let i = 0; i < MOT.length; i++) {
      if (essai[i] === MOT[i]) res[i] = "juste"; else reste[MOT[i]] = (reste[MOT[i]] || 0) + 1;
    }
    for (let i = 0; i < MOT.length; i++) {
      if (res[i] !== "juste" && reste[essai[i]]) { res[i] = "ailleurs"; reste[essai[i]]--; }
    }
    return res;
  }
  const NOTE = { juste: "bien placée", ailleurs: "mal placée", absente: "absente" };
  const BRAVO = ["Du premier coup !", "Magnifique", "Très fort", "Bien joué", "Pas mal", "De justesse"];
  // Les règles se lisent ligne à ligne : un exemple dessiné à gauche, une
  // phrase courte à droite, le mot qui compte en couleur. Signalé : un
  // paragraphe d'un bloc se lisait mal.
  const kbd = (t) => '<kbd class="jx-kbd">' + t + "</kbd>";
  const mini = (v, classe) => '<i class="jx-mini' + (classe ? " " + classe : "") + '">' + v + "</i>";
  const REGLES_MOT = '<p class="jx-intro">Trouve le mot du jour en <b class="jx-cle">6 essais</b>.</p><ol class="jx-pas">'
    + '<li><span class="jx-vis"><span class="jx-case juste">R</span></span><span>Bonne lettre, <b>bonne place</b>.</span></li>'
    + '<li><span class="jx-vis"><span class="jx-case ailleurs">O</span></span><span>Bonne lettre, <b>mauvaise place</b>.</span></li>'
    + '<li><span class="jx-vis"><span class="jx-case absente">T</span></span><span>Lettre <b>absente</b> du mot.</span></li></ol>'
    + '<p class="jx-note">Chaque essai doit être un vrai mot du cours, de la bonne longueur.<br>Au clavier : les lettres, '
    + kbd("Entrée") + " pour valider, " + kbd(ico("effacer")) + " pour effacer.</p>";

  function jeuMot() {
    const p = partieDuJour("mot") || { essais: [], indice: false, fini: false, gagne: false };
    const c = coque("mot", "Le mot du jour", "n° " + NUMERO + " · " + MOT.length + " lettres · " + matiereDe(CHEMIN), REGLES_MOT);
    let saisie = "", revele = -1, frappe = -1, verrou = false;

    const grille = el("div", "jx-grille-mot");
    grille.style.setProperty("--n", MOT.length);
    const lignes = [];
    for (let r = 0; r < ESSAIS; r++) {
      const l = el("div", "jx-ligne"), cases = [];
      l.setAttribute("role", "group");
      for (let i = 0; i < MOT.length; i++) { const k = el("span", "jx-case"); k.style.setProperty("--i", i); l.append(k); cases.push(k); }
      grille.append(l);
      lignes.push({ l, cases });
    }
    const sous = el("div", "jx-sous-grille"), clavier = el("div", "jx-clavier"), fin = el("div");
    c.zone.append(grille, sous, clavier, fin);

    const touches = {};
    [["A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P"], ["Q", "S", "D", "F", "G", "H", "J", "K", "L", "M"],
     ["Entrée", "W", "X", "C", "V", "B", "N", "Effacer"]].forEach((rangee) => {
      const r = el("div", "jx-rangee");
      rangee.forEach((t) => {
        const b = el("button", "jx-touche" + (t.length > 1 ? " large" : ""), t === "Effacer" ? ico("effacer") : t);
        b.type = "button";
        if (t === "Effacer") b.setAttribute("aria-label", "Effacer");
        // la souris ne prend pas le focus : la touche Entrée du vrai
        // clavier doit valider l'essai, pas rejouer la dernière lettre
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => taper(t === "Entrée" ? "Enter" : t === "Effacer" ? "Backspace" : t));
        r.append(b);
        touches[t] = b;
      });
      clavier.append(r);
    });

    function peindreGrille() {
      lignes.forEach(({ l, cases }, r) => {
        const essai = p.essais[r], notes = essai ? noter(essai) : null, courante = !p.fini && r === p.essais.length;
        cases.forEach((k, i) => {
          const lettre = essai ? essai[i] : courante ? saisie[i] || "" : "";
          k.textContent = lettre;
          k.className = "jx-case" + (notes ? " " + notes[i] : lettre ? " tapee" : "") + (r === revele ? " revele" : "")
            + (courante && i === frappe ? " pop" : "");
        });
        l.setAttribute("aria-label", essai ? "Essai " + (r + 1) + " : " + [...essai].map((x, i) => x + " " + NOTE[notes[i]]).join(", ")
          : courante ? "Essai en cours : " + (saisie || "vide") : "Essai " + (r + 1) + " : vide");
      });
      frappe = -1;
    }
    function peindreClavier() {
      const vu = {}, rang = { juste: 3, ailleurs: 2, absente: 1 };
      p.essais.forEach((e) => noter(e).forEach((n, i) => { if (!vu[e[i]] || rang[n] > rang[vu[e[i]]]) vu[e[i]] = n; }));
      Object.keys(touches).forEach((t) => {
        if (t.length > 1) return;
        touches[t].className = "jx-touche" + (vu[t] ? " " + vu[t] : "");
        touches[t].setAttribute("aria-label", t + (vu[t] ? ", " + NOTE[vu[t]] : ""));
      });
    }
    function peindreSous() {
      sous.innerHTML = "";
      sous.hidden = p.fini;
      if (p.fini) return;
      if (p.indice) { sous.innerHTML = '<p class="jx-indice"><b>Indice</b>' + ech(DEF) + "</p>"; return; }
      const b = bouton("jx-discret", "ampoule", "Voir la définition");
      b.addEventListener("click", () => { p.indice = true; garder("mot", p); peindreSous(); });
      sous.append(b);
    }
    function finir() {
      clavier.hidden = true;
      sous.innerHTML = "";
      const s = statsDe("mot"), dist = s.dist || {}, max = Math.max(1, ...Object.values(dist));
      let rep = '<div class="jx-repartition"><p>Tes victoires, par nombre d\'essais</p>';
      for (let k = 1; k <= ESSAIS; k++) {
        const v = dist[k] || 0;
        rep += '<div class="jx-rep' + (p.gagne && p.essais.length === k ? " jour" : "") + '"><span>' + k
          + '</span><b style="--l:' + Math.max(7, v / max * 100) + '%">' + v + "</b></div>";
      }
      const carres = p.essais.map((e) => noter(e).map((n) => ({ juste: "🟩", ailleurs: "🟨", absente: "⬜" }[n])).join("")).join("\n");
      fin.innerHTML = "";
      fin.append(bilan({ id: "mot", titre: p.gagne ? "Trouvé en " + pluriel(p.essais.length, "essai") : "Le mot était " + MOT,
        corps: "<p><b>" + MOT + "</b> : " + ech(DEF) + '</p><p><a href="' + lienCours(CHEMIN) + '">Revoir le chapitre</a></p>',
        chiffres: chiffres("mot"), repartition: rep + "</div>",
        partage: "Mot du jour n° " + NUMERO + " · " + (p.gagne ? p.essais.length : "X") + "/" + ESSAIS
          + (p.indice ? " · avec indice" : "") + "\n" + carres }));
    }
    function secouer() {
      const l = lignes[p.essais.length].l;
      l.classList.remove("secoue"); void l.offsetWidth; l.classList.add("secoue");
    }
    function valider() {
      if (saisie.length < MOT.length) { secouer(); return signaler(c.toast, "Il manque " + pluriel(MOT.length - saisie.length, "lettre")); }
      if (!connu(saisie)) { secouer(); return signaler(c.toast, saisie + " n'est pas un mot du cours"); }
      if (p.essais.includes(saisie)) { secouer(); return signaler(c.toast, "Déjà essayé"); }
      c.vu();
      p.essais.push(saisie);
      saisie = "";
      const r = p.essais.length - 1, gagne = p.essais[r] === MOT;
      if (gagne) { p.fini = true; p.gagne = true; compter("mot", true, p.essais.length); }
      else if (p.essais.length >= ESSAIS) { p.fini = true; compter("mot", false); }
      garder("mot", p);
      revele = r; peindreGrille(); revele = -1;
      const notes = noter(p.essais[r]);
      dire("Essai " + (r + 1) + " : " + [...p.essais[r]].map((x, i) => x + " " + NOTE[notes[i]]).join(", "));
      // le clavier et le bilan attendent la fin du retournement : ils
      // diraient la réponse avant les cases
      verrou = true;
      setTimeout(() => {
        verrou = false;
        peindreClavier();
        if (gagne) { signaler(c.toast, BRAVO[r]); if (animations()) lignes[r].l.classList.add("gagne"); }
        if (p.fini) finir();
      }, animations() ? MOT.length * 120 + 560 : 0);
    }
    function taper(t) {
      if (p.fini || verrou) return;
      if (t === "Enter") return valider();
      if (t === "Backspace") saisie = saisie.slice(0, -1);
      else if (/^[A-Z]$/.test(t) && saisie.length < MOT.length) { saisie += t; frappe = saisie.length - 1; }
      else return;
      peindreGrille();
    }
    const surTouche = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const cible = e.target;
      if (cible && (/^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName) || cible.isContentEditable)) return;
      // Entrée sur un lien ou un bouton qui a le focus : c'est à lui
      if (e.key === "Enter" && cible && cible.closest && cible.closest("a, button")) return;
      const k = e.key === "Enter" || e.key === "Backspace" ? e.key : sansAccent(e.key || "").toUpperCase();
      if (k === "Enter" || k === "Backspace" || /^[A-Z]$/.test(k)) { e.preventDefault(); taper(k); }
    };
    document.addEventListener("keydown", surTouche);
    nettoyer.push(() => document.removeEventListener("keydown", surTouche));

    peindreGrille(); peindreClavier(); peindreSous();
    if (p.fini) finir();
  }

  /* ═══════════════ 6. La notion cachée ══════════════════════════════
     Un passage du cours, tous ses mots masqués sauf les petits mots. On
     propose des mots : chaque occurrence trouvée se dévoile. Le titre de
     la section est masqué lui aussi, et c'est lui qu'il faut trouver.
     Un mot est reconnu sans ses accents, au singulier comme au pluriel. */
  const PETITS = new Set(("le la les l un une des du de d et ou a au aux en dans par pour sur sous avec sans ce cet cette ces "
    + "qui que qu quoi dont il elle ils elles on se s son sa ses leur leurs ne n pas plus est sont etre "
    + "c j m t y mais donc car si ni comme tout tous toute toutes meme aussi").split(" "));
  const cleMot = (m) => { const k = sansAccent(m.toLowerCase()); return k.length > 3 ? k.replace(/[sx]$/, "") : k; };
  // « petit » se juge sur la forme écrite ET sur la clé : sans quoi « plus »
  // (clé « plu ») restait affiché tout en étant exigé pour gagner
  const petit = (j) => PETITS.has(sansAccent(j.toLowerCase())) || PETITS.has(cleMot(j));
  const estMot = (j) => /[\p{L}\p{N}]/u.test(j);
  const NOTION = D.notions.length ? duJour(D.notions, "notion") : null;
  function decouper(texte) { return texte.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) || []; }
  const REGLES_NOTION = '<p class="jx-intro">Trouve le <b class="jx-cle">titre</b> de la section cachée.</p><ol class="jx-pas">'
    + '<li><span class="jx-vis"><span class="jx-masque" style="--n:7">7</span></span><span>Un mot caché, et <b>sa longueur</b>.</span></li>'
    + '<li><span class="jx-vis">' + kbd("routeur") + "</span><span>Propose un mot : il se <b>dévoile partout</b> dans le passage.</span></li>"
    + '<li><span class="jx-vis"><b class="jx-cle ok">réseaux</b></span><span>Les accents et le pluriel <b>ne comptent pas</b>.</span></li></ol>'
    + '<p class="jx-note">Gagné quand tous les mots du titre sont trouvés.<br>Les petits mots (le, de, est…) sont déjà visibles.</p>';

  function jeuNotion() {
    if (!NOTION) { scene.append(el("p", "jx-vide", "Aucun passage disponible aujourd'hui.")); return; }
    const p = partieDuJour("notion") || { mots: [], formes: {}, fini: false, gagne: false, abandon: false };
    p.formes = p.formes || {};
    const c = coque("notion", "La notion cachée", "n° " + NUMERO + " · " + matiereDe(NOTION.u), REGLES_NOTION);
    c.zone.innerHTML = '<form class="jx-proposer"><label class="jx-cache" for="jx-mot">Proposer un mot</label>'
      + '<input id="jx-mot" class="jx-champ" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" '
      + 'enterkeyhint="send" placeholder="Propose un mot"><button class="jx-b jx-plein" type="submit"><span>Proposer</span></button></form>'
      + '<p class="jx-progres"></p><article class="jx-doc"><h3 class="jx-doc-titre"></h3><p class="jx-doc-texte"></p></article>'
      + '<div class="jx-essais"><div class="jx-col"><p class="jx-col-titre">Trouvés <b></b></p><ol aria-label="Mots trouvés"></ol></div>'
      + '<div class="jx-col absents"><p class="jx-col-titre">Absents <b></b></p><ol aria-label="Mots absents du passage"></ol></div></div><div></div>';
    const form = c.zone.querySelector("form"), champ = form.querySelector("input"), progres = c.zone.querySelector(".jx-progres");
    const titre = c.zone.querySelector(".jx-doc-titre"), texte = c.zone.querySelector(".jx-doc-texte");
    const essais = c.zone.querySelector(".jx-essais"), fin = c.zone.lastElementChild;
    const [colTrouves, colAbsents] = essais.querySelectorAll(".jx-col");
    const jetonsTitre = decouper(NOTION.t), jetonsTexte = decouper(NOTION.x), tous = jetonsTitre.concat(jetonsTexte);
    const aTrouver = [...new Set(jetonsTitre.filter((j) => estMot(j) && !petit(j)).map(cleMot))];
    const compte = (k) => tous.filter((j) => estMot(j) && cleMot(j) === k).length;
    let dernier = null;

    function rendre(jetons, cible) {
      cible.innerHTML = jetons.map((j) => {
        if (!estMot(j)) return ech(j);
        const k = cleMot(j);
        if (p.fini || petit(j) || p.mots.includes(k)) return k === dernier && !petit(j) ? '<mark class="jx-neuf">' + ech(j) + "</mark>" : ech(j);
        const n = [...j].length;
        return '<span class="jx-masque" style="--n:' + n + '">' + n + "</span>";
      }).join("");
    }
    function peindre() {
      rendre(jetonsTitre, titre); rendre(jetonsTexte, texte);
      const trouves = aTrouver.filter((k) => p.mots.includes(k)).length;
      progres.innerHTML = p.fini ? "" : "<b>" + trouves + "</b> sur " + pluriel(aTrouver.length, "mot") + " du titre · " + pluriel(p.mots.length, "essai");
      progres.hidden = p.fini;
      // deux colonnes, le plus récent en haut : à gauche ce qui est dans le
      // passage (avec son nombre), à droite ce qui n'y est pas
      const recents = p.mots.slice().reverse().map((k) => [k, compte(k)]);
      const colonne = (col, liste, avecNombre) => {
        col.querySelector("b").textContent = liste.length;
        col.querySelector("ol").innerHTML = liste.map(([k, n]) => "<li" + (k === dernier ? ' class="dernier"' : "") + "><span>"
          + ech(p.formes[k] || k) + "</span>" + (avecNombre ? "<b>" + n + "</b>" : "") + "</li>").join("");
      };
      colonne(colTrouves, recents.filter(([, n]) => n), true);
      colonne(colAbsents, recents.filter(([, n]) => !n), false);
      essais.hidden = !p.mots.length;
      fin.innerHTML = "";
      form.hidden = p.fini;
      if (p.fini) {
        fin.append(bilan({ id: "notion", titre: p.gagne ? "Trouvée en " + pluriel(p.mots.length, "mot") : "Réponse dévoilée",
          corps: "<p>La section : <b>" + ech(NOTION.t) + "</b>, en " + ech(NOTION.m) + '.</p><p><a href="../' + NOTION.u
            + '">Lire la section du cours</a></p>',
          chiffres: chiffres("notion"),
          partage: "Notion cachée n° " + NUMERO + " · " + (p.gagne ? pluriel(p.mots.length, "mot") : "réponse dévoilée") }));
      } else {
        const b = el("button", "jx-lien", "Abandonner et voir la réponse");
        b.type = "button";
        deuxTemps(b, "Sûr ? Touche encore pour voir la réponse", () => {
          p.fini = true; p.abandon = true; compter("notion", false); garder("notion", p); dernier = null; peindre();
        });
        const d = el("div", "jx-abandon"); d.append(b); fin.append(d);
      }
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      // un mot est fait de lettres ou de chiffres : la ponctuation ne compte pas
      const mots = champ.value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      champ.value = "";
      if (!mots.length) return;
      c.vu();
      // un petit mot (« est », « sur ») est déjà visible : il ne compte pas
      // comme un essai
      const utiles = mots.filter((m) => !petit(m));
      if (!utiles.length) { signaler(c.toast, "Ce petit mot est déjà visible"); return; }
      const nouveaux = [];
      utiles.forEach((m) => { const k = cleMot(m); if (k && !p.mots.includes(k)) { p.mots.push(k); p.formes[k] = m.toLowerCase(); nouveaux.push(k); } });
      if (!nouveaux.length) { signaler(c.toast, "Déjà proposé"); return; }
      dernier = nouveaux[nouveaux.length - 1];
      const n = compte(dernier);
      signaler(c.toast, "« " + p.formes[dernier] + " » : " + (n ? pluriel(n, "fois", "fois") : "absent du passage"));
      if (aTrouver.every((k) => p.mots.includes(k))) { p.fini = true; p.gagne = true; compter("notion", true); }
      garder("notion", p); peindre();
      if (!p.fini) champ.focus();
    });
    peindre();
    if (!p.fini && window.matchMedia && matchMedia("(pointer: fine)").matches) champ.focus({ preventScroll: true });
  }

  /* ═══════════════ 7. Le terminal ═══════════════════════════════════
     Une partie : des machines à infiltrer, trois commandes chacune. Le
     temps par commande raccourcit de machine en machine, et les commandes
     deviennent plus pointues. Trois erreurs (ou trois temps écoulés), et
     la partie s'arrête. La partie du jour suit la graine du jour : la
     même pour tous, et elle ne se rejoue pas. Recharger la page la
     REPREND où elle en était, avec le temps qui a continué de courir
     (« echeance » est une heure, pas une durée) : sans cela, recharger
     rendait les vies perdues. On peut ensuite s'entraîner sur des parties
     au hasard, qui ne comptent pas. */
  const normaliser = (s) => s.trim().replace(/\s+/g, " ");
  // une commande Cisco se tape dans le mode où elle vit : l'invite le dit
  // (une invite Linux devant « configure terminal » ne voulait rien dire)
  function inviteCisco(cmd) {
    const nom = /vlan/.test(cmd) ? "SW1" : "R1";
    if (cmd === "enable") return nom + ">";
    if (/^(no shutdown|end)$/.test(cmd)) return nom + "(config-if)#";
    if (/^version /.test(cmd)) return nom + "(config-router)#";
    if (/^(hostname|vlan \d|ip route|service)/.test(cmd)) return nom + "(config)#";
    return nom + "#";
  }
  const REGLES_TERMINAL = '<p class="jx-intro">Infiltre un maximum de machines, <b class="jx-cle">3 commandes</b> chacune.</p><ol class="jx-pas">'
    + '<li><span class="jx-vis">' + kbd("Entrée") + "</span><span>Lis la <b>mission</b>, tape la commande, valide.</span></li>"
    + '<li><span class="jx-vis jx-vies">' + ico("coeur", "plein") + ico("coeur", "plein") + ico("coeur", "plein")
    + "</span><span><b>3 vies.</b> Une erreur ou un temps écoulé en coûte une.</span></li>"
    + '<li><span class="jx-vis"><i class="jx-temps-mini"></i></span><span>Le temps <b>raccourcit</b> à chaque machine.</span></li>'
    + '<li><span class="jx-vis">' + kbd("ls") + kbd("LS") + "</span><span>Linux distingue les <b>majuscules</b>, Cisco non.</span></li></ol>"
    + '<p class="jx-note">La partie du jour ne se rejoue pas.<br>L\'entraînement, lui, est illimité.</p>';

  function jeuTerminal(entrainement) {
    const officielle = !entrainement;
    const graineP = officielle ? graine(JOUR + "-terminal") : (Math.random() * 4294967296) >>> 0;
    const r = hasard(graineP);
    const pioches = { 1: melanger(D.commandes.filter((x) => x.n === 1), r), 2: melanger(D.commandes.filter((x) => x.n === 2), r),
                      3: melanger(D.commandes.filter((x) => x.n === 3), r) };
    const machines = [];
    function machine(k) {
      while (machines.length < k) {
        const i = machines.length + 1, niveau = Math.min(3, 1 + Math.floor((i - 1) / 2));
        const noms = ["srv", "rt", "sw", "db", "web", "nas", "pc", "fw"];
        const nom = noms[Math.floor(r() * noms.length)] + "-" + Math.floor(r() * 256).toString(16).padStart(2, "0");
        const ip = "10." + Math.floor(r() * 250 + 1) + "." + Math.floor(r() * 250) + "." + Math.floor(r() * 250 + 2);
        const taches = [];
        for (let t = 0; t < 3; t++) {
          let n = niveau;
          while (n > 1 && !pioches[n].length) n--;
          if (!pioches[n].length) pioches[n] = melanger(D.commandes.filter((x) => x.n === n), r);
          taches.push(pioches[n].shift());
        }
        machines.push({ nom, ip, taches, temps: Math.max(12, 42 - 5 * (i - 1)) });
      }
      return machines[k - 1];
    }
    const p = (officielle && partieDuJour("terminal")) || { vies: 3, machine: 1, tache: 0, reussies: 0, machines: 0, fini: false };
    // une partie commencée avec la version d'avant n'avait pas ce drapeau
    p.commence = p.commence || p.reussies > 0 || p.vies < 3 || p.machine > 1 || p.tache > 0;
    const c = coque("terminal", "Le terminal", officielle ? "n° " + NUMERO + " · la partie du jour" : "Entraînement · ne compte pas", REGLES_TERMINAL);
    c.zone.innerHTML = '<div class="jx-term"><div class="jx-term-barre"><span class="jx-term-hote">etuciel@cfa</span>'
      + '<span class="jx-term-hud"></span></div><div class="jx-temps" aria-hidden="true"><span></span></div>'
      + '<pre class="jx-ecran" role="log" aria-live="polite"></pre><p class="jx-mission" hidden></p>'
      + '<form class="jx-invite"><label class="jx-invite-lib" for="jx-cmd">$</label><input id="jx-cmd" class="jx-cmd" '
      + 'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" disabled></form></div><div></div>';
    const term = c.zone.querySelector(".jx-term"), hote = c.zone.querySelector(".jx-term-hote"), hud = c.zone.querySelector(".jx-term-hud");
    const barre = c.zone.querySelector(".jx-temps span"), ecran = c.zone.querySelector(".jx-ecran"), mission = c.zone.querySelector(".jx-mission");
    const form = c.zone.querySelector("form"), champ = form.querySelector("input"), invite = form.querySelector("label");
    const fz = c.zone.lastElementChild;
    const lignes = [];
    function ecrire(t, classe) {
      lignes.push('<span class="' + (classe || "") + '">' + ech(t) + "</span>");
      ecran.innerHTML = lignes.slice(-60).join("\n");
      ecran.scrollTop = ecran.scrollHeight;
    }
    function eclair(classe) {
      if (!animations()) return;
      term.classList.remove("ok", "aie"); void term.offsetWidth; term.classList.add(classe);
    }
    let minuteur = null;
    const arreter = () => { if (minuteur) { clearInterval(minuteur); minuteur = null; } };
    nettoyer.push(arreter);
    function majHud() {
      hud.innerHTML = "<span>Machine <b>" + p.machine + "</b></span><span><b>" + p.reussies + "</b> réussie" + (p.reussies > 1 ? "s" : "")
        + '</span><span class="jx-vies" role="img" aria-label="' + pluriel(p.vies, "vie") + '">'
        + [0, 1, 2].map((k) => ico("coeur", k < p.vies ? "plein" : "perdu")).join("") + "</span>";
    }
    function poser(reprise) {
      const m = machine(p.machine), t = m.taches[p.tache];
      if (p.tache === 0 && !reprise) {
        ecrire("");
        ecrire("ssh etuciel@" + m.ip, "jx-gris");
        ecrire("Connexion à " + m.nom + " établie.", "jx-gris");
      }
      ecrire("# " + t.t, "jx-tache");
      mission.hidden = false;
      mission.innerHTML = "<span>Mission</span>" + ech(t.t);
      invite.textContent = t.d === "cisco" ? inviteCisco(t.r[0]) : "etuciel@" + m.nom + ":~$";
      hote.textContent = "etuciel@" + m.nom;
      if (!(reprise && p.echeance)) p.echeance = Date.now() + m.temps * 1000;
      if (officielle) garder("terminal", p);
      majHud();
      arreter();
      const total = m.temps * 1000;
      const tic = () => {
        const reste = p.echeance - Date.now(), f = Math.max(0, Math.min(1, reste / total));
        barre.style.width = f * 100 + "%";
        barre.style.background = f > .5 ? "#8CE99A" : f > .25 ? "#FFD43B" : "#FFA8A8";
        if (reste <= 0) { arreter(); rate("temps écoulé"); }
      };
      if (p.echeance <= Date.now()) { rate("temps écoulé"); return; }
      minuteur = setInterval(tic, 100);
      tic();
      champ.disabled = false;
      champ.focus({ preventScroll: true });
    }
    function rate(pourquoi) {
      const t = machine(p.machine).taches[p.tache];
      ecrire("✗ " + pourquoi + ". Attendu : " + t.r[0], "jx-rouge");
      ecrire("  " + t.e, "jx-gris");
      p.vies--;
      eclair("aie");
      suivante();
    }
    function suivante() {
      p.tache++;
      p.echeance = 0;
      if (p.tache === 3) {
        p.machines++;
        ecrire("Machine " + machine(p.machine).nom + " infiltrée.", "jx-vert");
        p.machine++; p.tache = 0;
      }
      if (p.vies <= 0) return terminer();
      poser();
    }
    function terminer() {
      arreter();
      p.fini = true;
      champ.disabled = true;
      mission.hidden = true;
      barre.style.width = "0%";
      ecrire("");
      ecrire("Connexion perdue. " + pluriel(p.machines, "machine") + " infiltrée" + (p.machines > 1 ? "s" : "") + ", "
        + pluriel(p.reussies, "commande") + " réussie" + (p.reussies > 1 ? "s" : "") + ".", "jx-tache");
      majHud();
      if (officielle) {
        const s = compter("terminal", p.machines > 0);
        s.record = Math.max(s.record || 0, p.reussies);
        garder("terminal", p);
      }
      montrerFin();
    }
    function montrerFin() {
      fz.innerHTML = "";
      const entr = bouton("", "rejouer", officielle ? "S'entraîner" : "Rejouer");
      entr.addEventListener("click", () => { quitter(); scene.innerHTML = ""; jeuTerminal(true); window.scrollTo(0, 0); });
      const titre = pluriel(p.machines, "machine") + " infiltrée" + (p.machines > 1 ? "s" : "");
      const corps = "<p>" + pluriel(p.reussies, "commande") + " réussie" + (p.reussies > 1 ? "s" : "") + " avant la perte de connexion.</p>";
      if (!officielle) { fz.append(bilan({ id: "terminal", titre, corps: corps + "<p>Partie d'entraînement : elle ne compte pas.</p>", boutons: [entr] })); return; }
      const s = statsDe("terminal");
      fz.append(bilan({ id: "terminal", titre, corps,
        chiffres: [[s.joues, "Parties"], [s.record || 0, "Record"], [serieDe("terminal"), "Série"], [s.meilleure, "Meilleure"]],
        partage: "Terminal du jour n° " + NUMERO + " · " + pluriel(p.machines, "machine") + " · " + pluriel(p.reussies, "commande"),
        boutons: [entr] }));
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (p.fini || champ.disabled) return;
      const t = machine(p.machine).taches[p.tache];
      const tape = normaliser(champ.value);
      champ.value = "";
      if (!tape) return;
      ecrire(invite.textContent + " " + tape);
      // Cisco ne distingue pas les majuscules ; Linux, si
      const egal = (a) => (t.d === "cisco" ? a.toLowerCase() === tape.toLowerCase() : a === tape);
      arreter();
      if (t.r.some(egal)) { ecrire("✓ accepté", "jx-vert"); p.reussies++; eclair("ok"); suivante(); }
      else rate("commande refusée");
    });

    majHud();
    if (p.fini) {
      ecrire("La partie du jour est jouée.", "jx-tache");
      ecrire(pluriel(p.machines, "machine") + ", " + pluriel(p.reussies, "commande") + ". Prochaine partie demain.", "jx-gris");
      barre.style.width = "0%";
      montrerFin();
    } else if (p.commence) {
      ecrire("Reprise de la partie : machine " + p.machine + ", " + pluriel(p.vies, "vie") + ".", "jx-gris");
      poser(true);
    } else {
      ecrire(officielle ? "Partie du jour n° " + NUMERO + "." : "Partie d'entraînement.", "jx-tache");
      ecrire("Trois vies. Trois commandes par machine,", "jx-gris");
      ecrire("et le temps raccourcit à chaque machine.", "jx-gris");
      const go = bouton("jx-plein jx-go", "jouer", officielle ? "Commencer la partie" : "Commencer");
      go.addEventListener("click", () => { go.remove(); c.vu(); p.commence = true; poser(); });
      fz.append(go);
    }
  }

  /* ═══════════════ 8. La grille binaire ═════════════════════════════
     Trois règles : pas plus de deux chiffres identiques côte à côte,
     autant de 0 que de 1 sur chaque ligne et chaque colonne, et deux
     lignes (ou deux colonnes) jamais identiques. La grille du jour est
     fabriquée à partir de la graine : une grille pleine d'abord, puis on
     retire des chiffres tant que la solution reste UNIQUE (on le vérifie
     en cherchant une deuxième solution, jusqu'à preuve qu'elle n'existe
     pas). 6 × 6 en semaine, 8 × 8 le week-end. */
  function possible(g, n, i) {
    const x = i % n, y = (i - x) / n, v = g[i], h = n / 2;
    const a = (xx, yy) => (xx < 0 || yy < 0 || xx >= n || yy >= n ? -2 : g[yy * n + xx]);
    for (let d = -2; d <= 0; d++) {
      if (a(x + d, y) === v && a(x + d + 1, y) === v && a(x + d + 2, y) === v) return false;
      if (a(x, y + d) === v && a(x, y + d + 1) === v && a(x, y + d + 2) === v) return false;
    }
    let cl = 0, cc = 0, vl = 0, vc = 0;
    for (let k = 0; k < n; k++) {
      const l = g[y * n + k], c = g[k * n + x];
      if (l === v) cl++; if (c === v) cc++; if (l === -1) vl++; if (c === -1) vc++;
    }
    if (cl > h || cc > h) return false;
    const egales = (p, q, ligne) => {
      for (let k = 0; k < n; k++) {
        const u = ligne ? g[p * n + k] : g[k * n + p], w = ligne ? g[q * n + k] : g[k * n + q];
        if (u === -1 || w === -1 || u !== w) return false;
      }
      return true;
    };
    if (!vl) for (let yy = 0; yy < n; yy++) if (yy !== y && egales(y, yy, true)) return false;
    if (!vc) for (let xx = 0; xx < n; xx++) if (xx !== x && egales(x, xx, false)) return false;
    return true;
  }
  function solutions(g, n, limite) {
    const vides = [];
    for (let i = 0; i < g.length; i++) if (g[i] === -1) vides.push(i);
    let nb = 0;
    (function essayer(k) {
      if (k === vides.length) { nb++; return; }
      const i = vides[k];
      for (let v = 0; v <= 1 && nb < limite; v++) { g[i] = v; if (possible(g, n, i)) essayer(k + 1); }
      g[i] = -1;
    })(0);
    return nb;
  }
  function fabriquer(n, r) {
    const g = Array(n * n).fill(-1);
    (function remplir(i) {
      if (i === n * n) return true;
      const ordre = r() < 0.5 ? [0, 1] : [1, 0];
      for (const v of ordre) { g[i] = v; if (possible(g, n, i) && remplir(i + 1)) return true; }
      g[i] = -1;
      return false;
    })(0);
    const solution = g.slice(), grille = g.slice();
    // au moins un tiers des chiffres restent donnés : la solution reste
    // unique, et la grille se résout par raisonnement, pas à l'aveugle
    const plancher = Math.ceil(n * n / 3);
    let donnes = n * n;
    for (const i of melanger(grille.map((_, k) => k), r)) {
      if (donnes <= plancher) break;
      const v = grille[i];
      grille[i] = -1;
      if (solutions(grille.slice(), n, 2) !== 1) grille[i] = v; else donnes--;
    }
    return { solution, grille };
  }
  let GRILLE = null;
  function grilleDuJour() {
    if (!GRILLE) {
      const n = [0, 6].includes(maintenant.getDay()) ? 8 : 6;
      GRILLE = Object.assign({ n }, fabriquer(n, hasard(graine(JOUR + "-binaire-" + n))));
    }
    return GRILLE;
  }
  // les cases en faute : trois identiques côte à côte, trop de 0 ou de 1
  // sur une ligne ou une colonne, deux lignes (ou colonnes) pleines et
  // identiques. Une grille pleine sans faute est résolue.
  function fautes(c, n) {
    const f = new Set(), h = n / 2;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x, v = c[i];
      if (v === -1) continue;
      if (x <= n - 3 && c[i + 1] === v && c[i + 2] === v) [i, i + 1, i + 2].forEach((k) => f.add(k));
      if (y <= n - 3 && c[i + n] === v && c[i + 2 * n] === v) [i, i + n, i + 2 * n].forEach((k) => f.add(k));
    }
    const ligne = (k) => c.slice(k * n, k * n + n), colonne = (k) => Array.from({ length: n }, (_, j) => c[j * n + k]);
    for (let k = 0; k < n; k++) {
      for (const v of [0, 1]) {
        const l = [], co = [];
        for (let j = 0; j < n; j++) { if (c[k * n + j] === v) l.push(k * n + j); if (c[j * n + k] === v) co.push(j * n + k); }
        if (l.length > h) l.forEach((i) => f.add(i));
        if (co.length > h) co.forEach((i) => f.add(i));
      }
    }
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const la = ligne(a), ca = colonne(a);
      if (!la.includes(-1) && la.join() === ligne(b).join()) for (let j = 0; j < n; j++) { f.add(a * n + j); f.add(b * n + j); }
      if (!ca.includes(-1) && ca.join() === colonne(b).join()) for (let j = 0; j < n; j++) { f.add(j * n + a); f.add(j * n + b); }
    }
    return f;
  }
  const REGLES_BINAIRE = '<p class="jx-intro">Remplis la grille de <b class="jx-cle">0</b> et de <b class="jx-cle">1</b>.</p><ol class="jx-pas">'
    + '<li><span class="jx-vis">' + mini(1, "faute") + mini(1, "faute") + mini(1, "faute")
    + "</span><span><b>Jamais trois</b> chiffres identiques côte à côte.</span></li>"
    + '<li><span class="jx-vis">' + mini(0) + mini(1, "un") + mini(1, "un") + mini(0)
    + "</span><span><b>Autant de 0 que de 1</b> sur chaque ligne et chaque colonne.</span></li>"
    + '<li><span class="jx-vis jx-vis-lignes"><span>' + mini(0, "faute") + mini(1, "faute") + mini(1, "faute") + mini(0, "faute")
    + "</span><span>" + mini(0, "faute") + mini(1, "faute") + mini(1, "faute") + mini(0, "faute")
    + "</span></span><span><b>Jamais deux lignes</b>, ni deux colonnes, identiques.</span></li></ol>"
    + '<p class="jx-intro jx-intro-2">Pour jouer</p><ol class="jx-pas">'
    + '<li><span class="jx-vis">' + mini("") + ico("fleche", "jx-ico-mini") + mini(0) + ico("fleche", "jx-ico-mini") + mini(1, "un")
    + "</span><span>Touche une case pour la <b>faire changer</b>.</span></li>"
    + '<li><span class="jx-vis">' + mini(1, "fixe") + mini(1, "un") + "</span><span><b>Pleine</b> : donnée. <b>Claire</b> : la tienne.</span></li>"
    + '<li><span class="jx-vis">' + kbd(ico("annuler")) + "</span><span><b>Annuler</b> revient d'un coup en arrière.</span></li></ol>"
    + '<p class="jx-note">Au clavier : les flèches, puis 0, 1 ou Effacer. Ctrl + Z (⌘ + Z sur Mac) annule.<br>'
    + "6 × 6 en semaine, 8 × 8 le week-end.</p>";

  function jeuBinaire() {
    const { n, grille } = grilleDuJour();
    const p = partieDuJour("binaire") || { cases: grille.slice(), debut: 0, duree: 0, fini: false, gagne: false };
    const meta = "n° " + NUMERO + " · " + n + " × " + n;
    const c = coque("binaire", "La grille binaire", meta, REGLES_BINAIRE);
    const plateau = el("div", "jx-plateau"), etatG = el("p", "jx-etat-grille"), cmd = el("div", "jx-commandes"), fz = el("div");
    plateau.style.setProperty("--n", n);
    plateau.setAttribute("role", "group");
    plateau.setAttribute("aria-label", "Grille de " + n + " sur " + n);
    c.zone.append(plateau, etatG, cmd, fz);
    const cellules = p.cases.map((_, i) => {
      const b = el("button", "jx-cellule");
      b.type = "button";
      b.dataset.i = i;
      b.style.setProperty("--i", i % n + Math.floor(i / n));
      b.tabIndex = i === grille.indexOf(-1) ? 0 : -1;
      b.addEventListener("click", () => { focaliser(i, false); jouer(i); });
      plateau.append(b);
      return b;
    });
    const pile = [];
    function focaliser(i, donner) {
      cellules.forEach((b, k) => { b.tabIndex = k === i ? 0 : -1; });
      if (donner) cellules[i].focus();
    }
    function jouer(i, valeur) {
      if (p.fini || grille[i] !== -1) return;
      const v = p.cases[i], nv = valeur !== undefined ? valeur : v === -1 ? 0 : v === 0 ? 1 : -1;
      if (nv === v) return;
      c.vu();
      if (!p.debut) p.debut = Date.now();
      pile.push([i, v]);
      p.cases[i] = nv;
      verifier();
    }
    function verifier() {
      const f = fautes(p.cases, n);
      if (!p.fini && p.cases.every((x) => x !== -1) && !f.size) {
        p.fini = true; p.gagne = true;
        p.duree = Math.max(1, Math.round((Date.now() - p.debut) / 1000));
        compter("binaire", true, p.duree);
        if (animations()) plateau.classList.add("resolu");
        dire("Grille résolue en " + duree(p.duree));
      }
      garder("binaire", p);
      peindre(f);
    }
    function majChrono() {
      const s = p.fini ? p.duree : p.debut ? Math.round((Date.now() - p.debut) / 1000) : 0;
      c.meta.textContent = meta + " · " + minSec(s);
    }
    function peindre(f) {
      f = f || fautes(p.cases, n);
      cellules.forEach((b, i) => {
        const v = p.cases[i], fixe = grille[i] !== -1;
        b.className = "jx-cellule" + (fixe ? " fixe" : "") + (v === 1 ? " un" : v === 0 ? " zero" : "") + (f.has(i) ? " faute" : "");
        b.textContent = v === -1 ? "" : v;
        b.setAttribute("aria-label", "Ligne " + (Math.floor(i / n) + 1) + ", colonne " + (i % n + 1) + " : "
          + (v === -1 ? "vide" : v) + (fixe ? ", donnée" : "") + (f.has(i) ? ", en faute" : ""));
        if (fixe || p.fini) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled");
      });
      const vides = p.cases.filter((x) => x === -1).length;
      etatG.className = "jx-etat-grille" + (f.size ? " mal" : "");
      etatG.textContent = p.fini ? "" : f.size ? "Une règle n'est pas respectée : regarde les cases en rouge."
        : vides ? pluriel(vides, "case") + " à remplir" : "";
      etatG.hidden = p.fini;
      cmd.hidden = p.fini;
      if (annuler) annuler.disabled = !pile.length;
      majChrono();
      if (p.fini && !fz.firstChild) {
        const s = statsDe("binaire");
        fz.append(bilan({ id: "binaire", titre: "Grille résolue en " + duree(p.duree),
          corps: "<p>" + n + " × " + n + (n === 8 ? ", la grande grille du week-end" : "") + ".</p>",
          chiffres: [[s.gagnes, "Résolues"], [s.record ? minSec(s.record) : "0:00", "Record"], [serieDe("binaire"), "Série"], [s.meilleure, "Meilleure"]],
          partage: "Grille binaire n° " + NUMERO + " · " + n + "×" + n + " · " + duree(p.duree) }));
      }
    }
    plateau.addEventListener("keydown", (e) => {
      const i = Number((e.target.dataset || {}).i);
      if (!Number.isInteger(i)) return;
      const x = i % n, y = (i - x) / n;
      let j = null;
      if (e.key === "ArrowRight") j = y * n + Math.min(n - 1, x + 1);
      else if (e.key === "ArrowLeft") j = y * n + Math.max(0, x - 1);
      else if (e.key === "ArrowDown") j = Math.min(n - 1, y + 1) * n + x;
      else if (e.key === "ArrowUp") j = Math.max(0, y - 1) * n + x;
      else if (e.key === "0" || e.key === "1") { e.preventDefault(); jouer(i, +e.key); return; }
      else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); jouer(i, -1); return; }
      else return;
      e.preventDefault();
      focaliser(j, true);
    });
    const annuler = bouton("", "annuler", "Annuler");
    const revenir = () => { const d = pile.pop(); if (!d || p.fini) return; p.cases[d[0]] = d[1]; verifier(); };
    annuler.addEventListener("click", revenir);
    // Ctrl+Z, ⌘+Z sur Mac. La lettre se lit par « key » puis « keyCode » :
    // sur un AZERTY, « code » désigne la touche W
    const surTouche = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if ((e.key || "").toLowerCase() !== "z" && e.keyCode !== 90) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      e.preventDefault();
      revenir();
    };
    document.addEventListener("keydown", surTouche);
    nettoyer.push(() => document.removeEventListener("keydown", surTouche));
    const vider = bouton("", "rejouer", "Tout effacer");
    deuxTemps(vider, "Sûr ? Touche encore", () => { if (p.fini) return; pile.length = 0; p.cases = grille.slice(); verifier(); });
    cmd.append(annuler, vider);
    const chrono = setInterval(majChrono, 1000);
    nettoyer.push(() => clearInterval(chrono));
    peindre();
  }

  /* ═══════════════ 9. Les aperçus de l'accueil ══════════════════════
     Chaque carte montre la partie du jour en miniature : les essais
     colorés du mot, les barres du passage masqué, la grille du jour. Pas
     un pictogramme décoratif : l'état réel, lisible d'un coup d'œil. */
  const APERCUS = {
    mot() {
      const p = partieDuJour("mot");
      let h = '<span class="jx-ap jx-ap-mot" style="--n:' + MOT.length + '">';
      for (let r = 0; r < ESSAIS; r++) {
        const e = p && p.essais[r], notes = e ? noter(e) : null;
        for (let i = 0; i < MOT.length; i++) h += "<i" + (notes ? ' class="' + notes[i] + '"' : "") + "></i>";
      }
      return h + "</span>";
    },
    notion() {
      if (!NOTION) return "";
      const p = partieDuJour("notion") || { mots: [] };
      const barres = (jetons, classe, max) => jetons.filter(estMot).slice(0, max).map((j) => '<i class="' + classe
        + (petit(j) ? " p" : p.fini || p.mots.includes(cleMot(j)) ? " ok" : "") + '" style="--n:' + Math.min(12, [...j].length) + '"></i>').join("");
      return '<span class="jx-ap jx-ap-notion">' + barres(decouper(NOTION.t), "t", 6) + "<b></b>" + barres(decouper(NOTION.x), "", 70) + "</span>";
    },
    terminal() {
      return '<span class="jx-ap jx-ap-term"><i class="v" style="--l:46%"></i><i style="--l:74%"></i><i class="j" style="--l:60%"></i>'
        + '<i style="--l:36%"></i><i class="v" style="--l:24%"></i><b></b></span>';
    },
    binaire() {
      const { n, grille } = grilleDuJour(), p = partieDuJour("binaire"), cs = p ? p.cases : grille;
      return '<span class="jx-ap jx-ap-bin" style="--n:' + n + '">' + cs.map((v, i) => "<i"
        + (v === -1 ? "" : ' class="' + (v ? "u" : "z") + (grille[i] === -1 ? " j" : "") + '"') + "></i>").join("") + "</span>";
    },
  };

  // pour le banc : les mécanismes, sans l'écran
  window.JEUX = { possible, solutions, fabriquer, fautes, noter, connu, cleMot, petit, duJour, graine, hasard, NUMERO, JOUR };
  ouvrir();
})();
