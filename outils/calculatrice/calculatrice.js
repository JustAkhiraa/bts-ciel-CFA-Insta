/* ═══════════════════════════════════════════════════════════════════════
   La calculatrice — l'appareil. Le calcul, lui, est dans « moteur.js »,
   qui ne connaît ni écran ni clavier et se mesure donc hors navigateur.

   Ce fichier ne contient AUCUNE formule. S'il en contenait une, elle
   existerait en deux endroits et finirait par diverger de celle du
   moteur ; c'est arrivé deux fois dans ce dépôt, et les deux fois le
   banc mesurait la mauvaise copie.

   ── Ce que l'appareil reprend de la machine ──────────────────────────
   · l'accueil en grille d'applications, parcourue aux flèches ;
   · le clavier : bloc de navigation, six colonnes de fonctions, cinq de
     pavé numérique, avec les touches Maj et alpha qui changent le sens
     des touches — c'est ce qui permet d'avoir soixante fonctions sur
     trente touches ;
   · le résultat EXACT en gros, sa valeur approchée dessous ;
   · la boîte à outils, qui est aussi la documentation de l'outil ;
   · huit applications, dont chacune renvoie au chapitre qu'elle sert.

   ── Un choix d'architecture, et la raison ────────────────────────────
   L'écran est redessiné en entier à chaque changement d'état. C'est
   grossier mais c'est la seule façon simple de ne jamais afficher un
   état périmé — le défaut le plus coûteux d'une interface qui se met à
   jour par morceaux. Le prix à payer est le FOCUS, qui serait perdu à
   chaque frappe : il est donc sauvegardé et rendu (voir `redessiner`),
   avec la position du curseur dans le champ.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  const section = document.getElementById("calculatrice");
  if (!section || typeof CALC === "undefined") return;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const ecran = $("#nw-ecran"), page = $("#nw-page"), bTitre = $("#nw-titre");
  const bAngle = $("#nw-angle"), bHeure = $("#nw-heure"), bExamen = $("#nw-examen");
  const etat = $("#nw-etat");
  const ech = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                              .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* ═══════════════ 1. L'état, et ce qui en est gardé ═════════════════
     Tout ce que l'élève a saisi survit à la fermeture de l'onglet : ses
     fonctions, ses listes, ses variables. Un outil qui oublie tout à
     chaque visite n'est pas un outil de révision.

     localStorage peut lever — navigation privée, stockage bloqué, cadre
     restreint. Chaque accès est donc protégé, et l'absence de mémoire
     n'empêche JAMAIS la calculatrice de fonctionner : elle oublie, et
     c'est tout. */
  const CLE = "ciel-calculatrice-v1";
  const PAR_DEFAUT = () => ({
    reglages: { angle: "rad", format: "auto", chiffres: 10, ecranSombre: false, examen: false },
    variables: {},
    historique: [],
    fonctions: [{ expr: "x^2-2", visible: true }, { expr: "", visible: true },
                { expr: "", visible: true }, { expr: "", visible: true }],
    fenetre: { xmin: -10, xmax: 10, ymin: -10, ymax: 10, auto: true, panneau: "" },
    tableau: { debut: 0, pas: 1 },
    suites: [{ type: "recurrente", expr: "u+3", premier: "5", second: "1", rang0: 0 },
             { type: "explicite", expr: "2^n", premier: "1", second: "1", rang0: 0 }],
    stats: { valeurs: [2, 4, 4, 4, 5, 5, 7, 9], effectifs: [1, 1, 1, 1, 1, 1, 1, 1],
             graphe: "histogramme", histo: { largeur: "", debut: "" }, lecture: 0 },
    /* La machine range les régressions en SÉRIES — X1/Y1, X2/Y2, X3/Y3 —
       et chacune a son modèle. Une seule paire de colonnes ne permettait
       pas de comparer deux jeux de mesures sur le même nuage, ce que les
       sujets demandent dès qu'il y a un « avant » et un « après ». */
    regression: {
      series: [{ X: [1, 2, 3, 4, 5, 6], Y: [2.1, 3.9, 6.2, 8.1, 9.8, 12.2],
                 modele: "lineaire" }],
      actif: 0, pred: "", predY: "", pointMoyen: true,
      /* La barre de l'onglet Graphique, comme sur la machine :
         « Auto » cadre tout seul, « Axes » ouvre la fenêtre à la main,
         « Naviguer » promène un curseur de point en point. */
      auto: true, panneau: "", curseur: null,
      /* Deux vues du même ajustement, comme sur la machine : le nuage,
         ou ses RÉSIDUS. Et « sans modèle », pour regarder le nuage seul. */
      residus: false, sansModele: false,
      fenetre: { xmin: "-10", xmax: "10", ymin: "-10", ymax: "10" },
    },
    probas: { loi: "binomiale", n: 10, p: 0.3, mu: 0, sigma: 1, lambda: 0.25,
              a: 0, b: 1, N: 49, K: 6, nu: 10, d1: 3, d2: 12,
              question: "egal", k: 3, k2: 5, seuil: 0.95 },
    equations: { mode: "polynome", coeffs: ["1", "-3", "2"], degre: 2,
                 systeme: [["2", "1", "5"], ["1", "-1", "1"]], inconnues: 2,
                 /* La troisième porte de la machine : une équation QUELCONQUE,
                    résolue numériquement sur un intervalle qu'on choisit. Un
                    polynôme a ses racines exactes ; cos(x) = x n'en a pas. */
                 gauche: "cos(x)", droite: "x", a: "-10", b: "10" },
    finance: {
      mode: "composes", cherche: "paiement",
      /* Intérêts simples */
      capital: "5000", taux: "4", jours: "90", base: "365", interets: "",
      /* Intérêts composés — les six paramètres du solveur classique */
      n: "60", tauxN: "5", pv: "10000", pmt: "", fv: "0",
      parAn: "12", composition: "12", quand: "fin",
    },
    /* Inférence. Deux familles, comme sur la machine : estimer (intervalle
       de confiance) et décider (test d'hypothèse). Et deux grandeurs : une
       moyenne, une proportion — ce sont celles des sujets de BTS. */
    python: { source: "", entree: "", sortie: [], erreur: null },
    elements: { z: 6, colorer: "famille" },
    inference: {
      famille: "intervalle", grandeur: "moyenne",
      /* moyenne */
      xbar: "12.4", sigma: "2.1", sEch: "2.3", nEch: "40", sigmaConnu: false,
      mu0: "12", 
      /* proportion */
      f: "0.42", nProp: "250", p0: "0.5",
      /* commun */
      niveau: "0.95", cote: "bilateral", alpha: "0.05",
    },
    /* La vue graphique des Suites, avec la MÊME barre que le Grapheur et les
       Régressions : « Auto », « Axes », « Naviguer », et un quatrième bouton
       propre à l'application. Le contrôleur partagé d'Epsilon n'en déclare
       que quatre, et c'est pourquoi ils se ressemblent d'une application à
       l'autre : m_autoButton, m_rangeButton, m_navigationButton et un
       m_calculusButton que chaque application remplit à sa façon. */
    suitesVue: { auto: true, panneau: "", nmin: "0", nmax: "25",
                 ymin: "-10", ymax: "10", curseur: 0, suite: 0,
                 escalier: false, sommeDe: "0", sommeA: "10" },
    onglets: { fonctions: "expressions", suites: "expressions", stats: "donnees",
               regression: "donnees" },
  });
  let ETAT = PAR_DEFAUT();
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) {
      const lu = JSON.parse(brut);
      /* Fusion CHAMP PAR CHAMP et non remplacement : une version plus
         ancienne de la mémoire n'a pas les clés ajoutées depuis, et un
         « ETAT = lu » laisserait des trous que le rendu lirait comme
         undefined — écran blanc, sans message. */
      for (const k in ETAT) if (lu[k] !== undefined && lu[k] !== null) {
        if (Array.isArray(ETAT[k])) ETAT[k] = lu[k];
        else if (typeof ETAT[k] === "object") Object.assign(ETAT[k], lu[k]);
        else ETAT[k] = lu[k];
      }
    }
  } catch (e) { /* mémoire illisible : on repart du neuf, sans rien dire */ }
  /* Une mémoire écrite avant les séries porte « X », « Y » et « modele »
     à plat. La fusion champ par champ les a recopiés tels quels, à côté
     d'un « series » resté par défaut : les points de l'étudiant seraient
     remplacés par l'exemple. On les remonte en première série. */
  if (Array.isArray(ETAT.regression.X) && ETAT.regression.X.length) {
    ETAT.regression.series = [{ X: ETAT.regression.X,
                                Y: ETAT.regression.Y || [],
                                modele: ETAT.regression.modele || "lineaire" }];
  }
  delete ETAT.regression.X; delete ETAT.regression.Y; delete ETAT.regression.modele;
  if (!Array.isArray(ETAT.regression.series) || !ETAT.regression.series.length) {
    ETAT.regression.series = PAR_DEFAUT().regression.series;
  }
  ETAT.regression.actif = Math.min(ETAT.regression.actif | 0,
                                   ETAT.regression.series.length - 1);
  let appel = 0;
  function garder() {
    clearTimeout(appel);
    appel = setTimeout(() => {
      try { localStorage.setItem(CLE, JSON.stringify(ETAT)); } catch (e) {}
    }, 150);
  }

  /* Le contexte de calcul : les variables rangées, les fonctions et les
     suites définies. Il est reconstruit à chaque calcul pour que
     « f(2) » dans Calculs voie la fonction qu'on vient d'écrire. */
  function contexte() {
    const ctx = CALC.contexte(ETAT.reglages);
    for (const nom in ETAT.variables) {
      const v = Number(ETAT.variables[nom]);
      if (Number.isFinite(v)) ctx.vars.set(nom, v);
    }
    ctx.fonctions = Object.create(null);
    ETAT.fonctions.forEach((f, i) => {
      if (!f.expr.trim()) return;
      const c = CALC.fonction(f.expr, "x", CALC.contexte(ETAT.reglages));
      if (!c.erreur) ctx.fonctions[i === 0 ? "f" : "f" + (i + 1)] = c.f;
      if (!c.erreur && i === 1) ctx.fonctions.g = c.f;
      if (!c.erreur && i === 2) ctx.fonctions.h = c.f;
    });
    ["u", "v"].forEach((nom, i) => {
      const d = ETAT.suites[i];
      if (!d || !d.expr.trim()) return;
      const s = CALC.suite({ type: d.type, nom, expr: d.expr,
                             premier: parseFloat(d.premier), second: parseFloat(d.second),
                             rang0: d.rang0 }, CALC.contexte(ETAT.reglages));
      if (!s.erreur) ctx.fonctions[nom] = s.terme;
    });
    return ctx;
  }
  const fmt = (x) => CALC.formater(x, ETAT.reglages);

  /* ═══════════════ 2. Le clavier ═════════════════════════════════════
     Une seule table, trois lectures : la touche nue, la touche sous Maj,
     la touche sous alpha. Écrire les quarante touches à la main dans le
     HTML, c'était se condamner à corriger chaque libellé deux fois. */
  /* Les pictogrammes des touches : dessinés, et non écrits. Un « ⌂ » ou
     un « 🧰 » posé dans une touche, ce sont deux polices différentes qui
     décident de sa taille, de sa graisse et parfois de sa couleur — le
     coffre à outils sortait en rouge et brun au milieu d'un clavier
     d'encre, parce que l'émoji a sa palette et ne la prête pas. Un tracé
     hérite de « currentColor », se met à l'échelle avec le texte, et
     s'imprime. */
  const ICO = (d) => '<svg class="nw-ico" viewBox="0 0 24 24" fill="none" '
    + 'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" '
    + 'stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const PLEIN = (d) => '<svg class="nw-ico" viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="' + d + '" fill="currentColor"/></svg>';
  const I_MAISON = ICO('<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M6 9.8V20h12V9.8"/>');
  const I_RETOUR = ICO('<path d="M9 6.5 4.5 11 9 15.5"/><path d="M4.5 11H14a5 5 0 0 1 0 10h-2.5"/>');
  const I_MAJ    = PLEIN('M12 4.2 4.8 12H9v7.3h6V12h4.2z');
  const I_EFF    = ICO('<path d="M9.3 5.5h8.9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.3L3 12z"/>'
                     + '<path d="m12.6 9.7 4.3 4.6M16.9 9.7l-4.3 4.6"/>');
  const I_BOITE  = ICO('<rect x="3" y="8.3" width="18" height="11.4" rx="2.2"/>'
                     + '<path d="M9 8.3V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2.3"/><path d="M3 13.2h18"/>');
  const I_HAUT   = PLEIN('M12 8.4 17.2 15.3H6.8z');
  const I_BAS    = PLEIN('M12 15.6 6.8 8.7h10.4z');
  const I_GAUCHE = PLEIN('M8.4 12 15.3 6.8v10.4z');
  const I_DROITE = PLEIN('M15.6 12 8.7 17.2V6.8z');

  const NAV = [
    { act: "accueil", t: "⌂", svg: I_MAISON, aide: "Accueil des applications", cls: "nw-touche-nav" },
    { act: "retour", t: "↰", svg: I_RETOUR, aide: "Revenir à l'accueil", cls: "nw-touche-nav" },
    { vide: true },
    { croix: [
      { act: "haut", t: "▲", svg: I_HAUT, aide: "Haut", k: "k-haut" },
      { act: "gauche", t: "◀", svg: I_GAUCHE, aide: "Gauche", k: "k-gauche" },
      { act: "ok", t: "OK", aide: "Valider", k: "k-ok" },
      { act: "droite", t: "▶", svg: I_DROITE, aide: "Droite", k: "k-droite" },
      { act: "bas", t: "▼", svg: I_BAS, aide: "Bas", k: "k-bas" },
    ] },
  ];
  const FONCTIONS = [
    { act: "maj", t: "⇧", svg: I_MAJ, aide: "Maj : allume les fonctions écrites en petit", cls: "nw-touche-fn" },
    { act: "alpha", t: "α", aide: "alpha : les lettres de mémoire", cls: "nw-touche-fn" },
    { ins: "x", t: "x", s: "n", si: "n", a: "", aide: "La variable x (Maj : n)" },
    { act: "var", t: "var", aide: "Les valeurs rangées en mémoire", cls: "nw-touche-fn" },
    { act: "boite", t: "🧰", svg: I_BOITE, aide: "Boîte à outils", cls: "nw-touche-fn" },
    { act: "eff", t: "⌫", svg: I_EFF, aide: "Effacer", cls: "nw-touche-fn" },

    { ins: "exp(", t: "eˣ", s: "ln", si: "ln(", a: "A", aide: "Exponentielle (Maj : ln)" },
    { ins: "ln(", t: "ln", s: "eˣ", si: "exp(", a: "B", aide: "Logarithme népérien" },
    { ins: "log(", t: "log", s: "10ˣ", si: "10^", a: "C", aide: "Logarithme décimal" },
    { ins: "integrale(", t: "∫", s: "Σ", si: "somme(", a: "D",
      aide: "Intégrale (Maj : somme). La touche i de l'appareil : les complexes ne sont pas de ce semestre." },
    { ins: ";", t: ";", s: ",", si: ",", a: "E", aide: "Séparateur d'arguments" },
    { ins: "^", t: "xʸ", s: "!", si: "!", a: "F", aide: "Puissance (Maj : factorielle)" },

    { ins: "sin(", t: "sin", s: "sin⁻¹", si: "arcsin(", a: "G", aide: "Sinus (Maj : arc sinus)" },
    { ins: "cos(", t: "cos", s: "cos⁻¹", si: "arccos(", a: "H", aide: "Cosinus (Maj : arc cosinus)" },
    { ins: "tan(", t: "tan", s: "tan⁻¹", si: "arctan(", a: "I", aide: "Tangente (Maj : arc tangente)" },
    { ins: "π", t: "π", s: "e", si: "e", a: "J", aide: "Pi (Maj : la constante e)" },
    { ins: "√(", t: "√", s: "x³", si: "^3", a: "K", aide: "Racine carrée (Maj : cube)" },
    { ins: "^2", t: "x²", s: "√", si: "√(", a: "L", aide: "Carré (Maj : racine carrée)" },
  ];
  const NUMERIQUE = [
    { ins: "7", t: "7", a: "M" }, { ins: "8", t: "8", a: "N" }, { ins: "9", t: "9", a: "O" },
    { ins: "(", t: "(", a: "P" }, { ins: ")", t: ")", a: "Q" },
    { ins: "4", t: "4", a: "R" }, { ins: "5", t: "5", a: "S" }, { ins: "6", t: "6", a: "T" },
    { ins: "*", t: "×", a: "U" }, { ins: "/", t: "÷", a: "V" },
    { ins: "1", t: "1", a: "W" }, { ins: "2", t: "2", a: "X" }, { ins: "3", t: "3", a: "Y" },
    { ins: "+", t: "+", a: "Z" }, { ins: "-", t: "−", a: " " },
    { ins: "0", t: "0" }, { ins: ".", t: "." }, { ins: "-", t: "(−)", aide: "Signe moins" },
    { ins: "ans", t: "ans", aide: "Le résultat précédent" },
    { act: "exe", t: "EXE", aide: "Valider le calcul", cls: "nw-touche-exe" },
  ];
  let maj = false, alpha = false;

  function toucheHTML(k) {
    if (k.vide) return '<span class="nw-vide-case"></span>';
    if (k.croix) {
      return '<div class="nw-croix">' + k.croix.map((c) =>
        '<button type="button" class="nw-touche nw-touche-nav ' + c.k + '" data-act="' + c.act
        + '" title="' + ech(c.aide) + '" aria-label="' + ech(c.aide) + '">' + (c.svg || ech(c.t))
        + '</button>').join("") + '</div>';
    }
    /* L'espace est la valeur alpha de la touche « moins », comme sur
       l'appareil. Écrit tel quel, il donnait une touche VIDE en mode
       alpha et une légende absente au repos : la seule touche du clavier
       dont on ne pouvait pas savoir ce qu'elle faisait. Elle s'affiche
       donc « ␣ » — et insère toujours une espace, qui est dans
       « data-alpha » et n'a pas bougé. */
    const aAff = k.a === " " ? "␣" : k.a;
    const libelle = alpha && k.a !== undefined && k.a !== "" ? ech(aAff)
                  : maj && k.s ? ech(k.s) : (k.svg || ech(k.t));
    /* DEUX légendes, et c'est de l'information, pas de l'ornement. La
       table porte depuis toujours les deux autres sens d'une touche :
       « s » sous Maj, « a » sous alpha. L'ancien rendu n'en montrait
       qu'UN, et toujours le même — sur les douze touches qui ont les
       deux, la lettre de mémoire n'était écrite nulle part. Pour taper
       « A » il fallait l'avoir deviné.

       Les deux sont donc rendues ensemble, même vides : sans la balise
       vide, « space-between » collerait une légende solitaire à gauche,
       et la place — gauche pour Maj, droite pour alpha — est justement
       ce qui dit laquelle est laquelle. */
    const lMaj = k.s ? ech(k.s) : "";
    const lAlp = k.a ? ech(aAff) : "";
    const sec = (lMaj || lAlp)
      ? '<span class="nw-leg" aria-hidden="true"><i class="nw-l-maj">' + lMaj
        + '</i><i class="nw-l-alp">' + lAlp + '</i></span>' : "";
    const aide = k.aide || ("Insérer " + (k.ins || k.t));
    const cls = "nw-touche " + (k.cls || "");
    const presse = (k.act === "maj" && maj) || (k.act === "alpha" && alpha);
    return '<button type="button" class="' + cls + '"'
      + (k.act ? ' data-act="' + k.act + '"' : '')
      + (k.ins !== undefined ? ' data-ins="' + ech(k.ins) + '"' : '')
      + (k.si ? ' data-maj="' + ech(k.si) + '"' : '')
      + (k.a ? ' data-alpha="' + ech(k.a) + '"' : '')
      + (k.act === "maj" || k.act === "alpha" ? ' aria-pressed="' + presse + '"' : '')
      + (k.svg ? ' aria-label="' + ech(aide) + '"' : '')
      + ' title="' + ech(aide) + '">' + libelle + sec + '</button>';
  }
  function dessinerClavier() {
    const cl = $("#nw-clavier");
    cl.innerHTML =
      '<div class="nw-bloc nw-bloc-nav">' + NAV.map(toucheHTML).join("") + '</div>'
      + '<div class="nw-bloc nw-bloc-fn">' + FONCTIONS.map(toucheHTML).join("") + '</div>'
      + '<div class="nw-bloc nw-bloc-num">' + NUMERIQUE.map(toucheHTML).join("") + '</div>'
      + '<p class="nw-clavier-note">Le clavier de l\'ordinateur marche aussi.</p>';
    /* Un modificateur allumé change le sens de trente touches. S'il ne
       se voit que sur la touche qu'on vient de presser — en bas, hors du
       regard, qui est sur l'écran — c'est un MODE CACHÉ, et Norman en
       fait la première cause d'erreur : on tape « 7 », il arrive « M ».
       L'état est donc écrit à deux endroits à la fois : sur le clavier,
       où il repeint les touches atteintes, et dans le bandeau de
       l'écran, où il reste sous les yeux pendant qu'on lit le résultat.
       C'est ce que fait l'appareil, et pour cette raison. */
    cl.dataset.mod = maj ? "maj" : alpha ? "alpha" : "";
    const m = $("#nw-mod");
    if (m) {
      m.textContent = maj ? "⇧ maj" : alpha ? "α alpha" : "";
      m.hidden = !maj && !alpha;
    }
  }

  /* Où écrit une touche ? Dans le champ qui a le focus s'il appartient à
     l'écran, sinon dans le champ principal de l'application. Sans cette
     règle, taper « 5 » après avoir cliqué dans une cellule de
     statistiques l'écrivait dans la ligne de calcul — invisible, et
     incompréhensible. */
  function champActif() {
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")
        && section.contains(a) && a.type !== "radio" && a.type !== "checkbox"
        && a.type !== "range") return a;
    return $(".nw-champ", page) || null;
  }
  /* ── Les exposants s'écrivent en petit, à la frappe ──────────────────
     Demandé : « quand j'écris e^1 je veux que le 1 se mette en puissance
     en haut, et pareil pour tout. »

     Fait avec les VRAIS caractères d'exposant, et non avec une couche
     dessinée par-dessus le champ. Un exposant rendu en HTML au-dessus
     d'un <input> ne peut pas suivre le curseur : les lettres n'ont plus
     la même largeur, et le trait clignotant se décale d'autant à chaque
     puissance. Un caractère pour un caractère, et le curseur, la
     sélection, le copier-coller et le clavier du téléphone continuent de
     marcher sans rien savoir de nous.

     Le mode exposant se PROLONGE tant que viennent des chiffres —
     « 2^10 » donne « 2¹⁰ » et non « 2¹0 » — et s'arrête à tout le reste,
     de sorte que « 2^10+3 » s'écrit tout seul. « ^( » reste tel quel :
     une parenthèse ne s'écrit pas en petit, et un accent circonflexe
     honnête vaut mieux qu'un exposant à moitié.

     Signalé : « je peux pas mettre de point dans les puissance ».
     « e^10.93 » s'écrivait « e¹⁰.93 » — et le pire n'était pas l'écriture :
     le moteur lisait « e¹⁰ » puis « 0,93 » et rendait leur PRODUIT,
     20484,6 au lieu de 55700,5. Une réponse fausse rendue sans un mot, sur
     un outil de révision. Le point PROLONGE donc l'exposant lui aussi, à
     une condition : qu'un chiffre le suive. « e¹⁰. » attend, « e¹⁰.⁹³ »
     est un seul exposant. Le point reste écrit en grand parce qu'Unicode
     n'a pas de point en exposant, et que « · » veut déjà dire « fois »
     dans ce moteur : lui donner un second sens serait un piège d'énoncé.
     Ce qui lève l'ambiguïté, ce sont les chiffres des DEUX côtés — si le
     5 de « 2³.5 » reste en gros, c'est bien un cube multiplié par 0,5. */
  const EN_PETIT = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
                     "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  const petit = (t) => t.split("").map((c) => EN_PETIT[c] || c).join("");
  function enExposants(t) {
    return t.replace(/\^(-?\d+(?:\.\d+)?)/g, (m, d) => petit(d))
            .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹])(\.?\d+)/g, (m, e, d) => e + petit(d));
  }
  /* Le curseur se replace à la main : la réécriture RACCOURCIT le texte
     (« ^1 » fait deux caractères, « ¹ » un seul) et le navigateur, lui,
     remet le curseur à la fin dès qu'on touche à « value ». */
  function exposantsALaFrappe(c) {
    const avant = c.value, apres = enExposants(avant);
    if (apres === avant) return;
    const pos = c.selectionStart === null ? avant.length : c.selectionStart;
    const neuf = Math.max(0, pos - (avant.length - apres.length));
    c.value = apres;
    try { c.setSelectionRange(neuf, neuf); } catch (e) {}
  }

  function inserer(texte) {
    const c = champActif();
    if (!c) return;
    c.focus();
    const d = c.selectionStart === null ? c.value.length : c.selectionStart;
    const f = c.selectionEnd === null ? c.value.length : c.selectionEnd;
    c.value = c.value.slice(0, d) + texte + c.value.slice(f);
    const pos = d + texte.length;
    try { c.setSelectionRange(pos, pos); } catch (e) {}
    c.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function effacer() {
    const c = champActif();
    if (!c) return;
    c.focus();
    const d = c.selectionStart, f = c.selectionEnd;
    if (d === f && d > 0) {
      c.value = c.value.slice(0, d - 1) + c.value.slice(d);
      try { c.setSelectionRange(d - 1, d - 1); } catch (e) {}
    } else if (d !== f) {
      c.value = c.value.slice(0, d) + c.value.slice(f);
      try { c.setSelectionRange(d, d); } catch (e) {}
    }
    c.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /* ═══════════════ 3. Le tracé, en SVG ═══════════════════════════════
     Un pas d'échantillonnage par pixel, et la courbe est COUPÉE dès
     qu'elle sort du cadre d'une hauteur d'écran. Sans cette coupure, une
     asymptote relie +∞ à −∞ par un trait vertical qui n'existe pas :
     c'est l'erreur de lecture la plus fréquente sur une calculatrice
     graphique, et elle est évitable. */
  const LARG = 320, HAUT = 198;
  function pas(etendue, cible) {
    const brut = etendue / (cible || 8);
    const p = Math.pow(10, Math.floor(Math.log10(brut)));
    const n = brut / p;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
  }
  function tracer(o) {
    const { xmin, xmax, ymin, ymax } = o;
    const dx = xmax - xmin, dy = ymax - ymin;
    if (!(dx > 0) || !(dy > 0)) return '<p class="nw-erreur">Fenêtre impossible : vérifiez Xmin &lt; Xmax et Ymin &lt; Ymax.</p>';
    const X = (x) => (x - xmin) / dx * LARG;
    const Y = (y) => HAUT - (y - ymin) / dy * HAUT;
    const bouts = [];
    const px = pas(dx), py = pas(dy);
    for (let x = Math.ceil(xmin / px) * px; x <= xmax; x += px) {
      bouts.push('<line class="grille" x1="' + X(x).toFixed(1) + '" y1="0" x2="'
        + X(x).toFixed(1) + '" y2="' + HAUT + '"/>');
    }
    for (let y = Math.ceil(ymin / py) * py; y <= ymax; y += py) {
      bouts.push('<line class="grille" x1="0" y1="' + Y(y).toFixed(1) + '" x2="' + LARG
        + '" y2="' + Y(y).toFixed(1) + '"/>');
    }
    if (ymin <= 0 && ymax >= 0)
      bouts.push('<line class="axe" x1="0" y1="' + Y(0).toFixed(1) + '" x2="' + LARG
        + '" y2="' + Y(0).toFixed(1) + '"/>');
    if (xmin <= 0 && xmax >= 0)
      bouts.push('<line class="axe" x1="' + X(0).toFixed(1) + '" y1="0" x2="' + X(0).toFixed(1)
        + '" y2="' + HAUT + '"/>');
    /* ── les graduations ──────────────────────────────────────────────
       Une sur deux étiquetée, sinon elles se touchent. Et elles sont
       mises de côté pour être dessinées EN DERNIER : signalé sur un
       diagramme de loi, « 0.3 » apparaissait coupé — en réalité la barre
       passait par-dessus, puisque les barres se dessinaient après. Un
       chiffre à moitié caché derrière une barre se lit de travers, et sur
       une probabilité, lire de travers coûte un exercice.

       Posées par-dessus, elles portent un liseré de la couleur du fond
       (« paint-order: stroke » dans la feuille de style) : lisibles sur la
       grille comme sur une barre pleine, sans boîte opaque qui masquerait
       le tracé. */
    const graduations = [];
    let i = 0;
    for (let x = Math.ceil(xmin / px) * px; x <= xmax; x += px, i++) {
      if (i % 2 || Math.abs(X(x)) < 12 || X(x) > LARG - 12) continue;
      graduations.push('<text x="' + X(x).toFixed(1) + '" y="'
        + Math.min(HAUT - 2, Y(0) + 9).toFixed(1)
        + '" text-anchor="middle">' + ech(nombreCourt(x)) + '</text>');
    }
    i = 0;
    for (let y = Math.ceil(ymin / py) * py; y <= ymax; y += py, i++) {
      if (i % 2 || Math.abs(Y(y) - Y(0)) < 7) continue;
      /* L'étiquette la plus haute sortait aussi du cadre par le haut : on
         la rabat dedans. */
      graduations.push('<text x="' + Math.max(2, X(0) + 3).toFixed(1) + '" y="'
        + Math.max(9, Y(y) - 2).toFixed(1)
        + '">' + ech(nombreCourt(y)) + '</text>');
    }
    (o.aires || []).forEach((a) => {
      const pts = [];
      const n = 240;
      for (let k = 0; k <= n; k++) {
        const x = a.a + (a.b - a.a) * k / n;
        const y = a.f(x);
        if (!Number.isFinite(y)) continue;
        pts.push(X(x).toFixed(1) + "," + Y(Math.max(ymin, Math.min(ymax, y))).toFixed(1));
      }
      if (pts.length > 1) {
        const base = Y(Math.max(ymin, Math.min(ymax, 0))).toFixed(1);
        bouts.push('<polygon class="aire" points="' + X(a.a).toFixed(1) + "," + base + " "
          + pts.join(" ") + " " + X(a.b).toFixed(1) + "," + base + '"/>');
      }
    });
    (o.courbes || []).forEach((c, idx) => {
      const marge = dy;
      let chemin = "", ouvert = false;
      for (let k = 0; k <= LARG; k++) {
        const x = xmin + dx * k / LARG;
        const y = c.f(x);
        const bon = Number.isFinite(y) && y > ymin - marge && y < ymax + marge;
        if (!bon) { ouvert = false; continue; }
        const sx = k.toFixed(1), sy = Y(y).toFixed(1);
        chemin += (ouvert ? "L" : "M") + sx + " " + sy + " ";
        ouvert = true;
      }
      if (chemin) bouts.push('<path class="courbe ' + (c.classe || ("c" + (idx + 1)))
        + '" d="' + chemin.trim() + '"/>');
    });
    (o.barres || []).forEach((b) => {
      const x0 = X(b.x0), x1 = X(b.x1), y0 = Y(Math.max(ymin, Math.min(ymax, b.h)));
      const base = Y(Math.max(ymin, Math.min(ymax, 0)));
      if (!Number.isFinite(x0) || !Number.isFinite(y0)) return;
      bouts.push('<rect class="' + (b.classe || "barre") + '" x="' + Math.min(x0, x1).toFixed(1)
        + '" y="' + Math.min(y0, base).toFixed(1) + '" width="'
        + Math.max(0.8, Math.abs(x1 - x0) - 1).toFixed(1) + '" height="'
        + Math.abs(base - y0).toFixed(1) + '"/>');
    });
    (o.points || []).forEach((p) => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      if (p.x < xmin || p.x > xmax || p.y < ymin || p.y > ymax) return;
      bouts.push('<circle class="point' + (p.classe ? " " + p.classe : "")
        + '" cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1)
        + '" r="' + (p.r || 2.4) + '"/>');
    });
    (o.segments || []).forEach((s) => {
      bouts.push('<line class="' + (s.classe || "curseur") + '" x1="' + X(s.x1).toFixed(1)
        + '" y1="' + Y(s.y1).toFixed(1) + '" x2="' + X(s.x2).toFixed(1) + '" y2="'
        + Y(s.y2).toFixed(1) + '"/>');
    });
    if (o.curseur && Number.isFinite(o.curseur.x)) {
      const cx = X(o.curseur.x), cy = Y(o.curseur.y);
      bouts.push('<line class="curseur" x1="' + cx.toFixed(1) + '" y1="0" x2="' + cx.toFixed(1)
        + '" y2="' + HAUT + '"/>');
      if (Number.isFinite(cy) && cy >= 0 && cy <= HAUT)
        bouts.push('<circle class="point" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1)
          + '" r="3.2"/>');
    }
    (o.etiquettes || []).forEach((e) => {
      bouts.push('<text class="etiq" x="' + X(e.x).toFixed(1) + '" y="' + Y(e.y).toFixed(1)
        + '" text-anchor="' + (e.ancre || "start") + '">' + ech(e.texte) + '</text>');
    });
    return '<svg class="nw-trace" viewBox="0 0 ' + LARG + ' ' + HAUT + '" role="img"'
      + ' aria-label="' + ech(o.aide || "Tracé") + '">' + bouts.join("")
      + '<g class="graduations">' + graduations.join("") + '</g></svg>';
  }
  function nombreCourt(x) {
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e5 || a < 1e-3) return x.toExponential(0).replace("e", "·10^").replace("-", "−");
    return String(Math.round(x * 1e6) / 1e6).replace("-", "−");
  }

  /* ═══════════════ 4. Le routage et le rendu ═════════════════════════ */
  const APPS = {};          // rempli par les sections suivantes
  /* L'ordre de la machine, pas le nôtre. Un élève qui a la NumWorks en main
     retrouve ses applications à la place où il a l'habitude de les voir — et
     l'accueil est justement l'écran qu'on traverse sans lire. Les quatre
     applications que la machine a en plus (Python, Éléments, Inférence,
     Finance) laissent un trou dans la grille : il est assumé, et dit sur la
     page plutôt que caché par un réarrangement. */
  /* L'ordre de l'accueil de la machine, les douze applications comprises.
     Demandé : « mets Python même si la fonctionnalité n'est pas encore là,
     mets-les tous à leur place. »

     Les trois qui ne sont pas écrites y figurent donc, à leur rang, et
     elles s'ouvrent sur un écran qui DIT ce qu'elles feront et pourquoi
     elles ne le font pas encore. Un bouton posé doit faire quelque chose
     ou dire qu'il ne fait rien : muet, on clique, rien ne vient, et on ne
     sait pas si c'est cassé ou pas encore fait. */
  const ORDRE = ["calculs", "fonctions", "python", "stats", "probas",
                 "equations", "suites", "regression", "elements",
                 "inference", "finance", "reglages"];
  let courante = "accueil", choisi = 0;

  function aller(cle) {
    courante = cle;
    maj = alpha = false;
    redessiner();
    const champ = $(".nw-champ", page) || $("input,select,button", page);
    if (champ && cle !== "accueil") { try { champ.focus(); } catch (e) {} }
  }

  /* ── les pictogrammes des applications ────────────────────────────
     « 1+2 », « f(x) », « x̄ », « ax+b », « P(X) », « x=? » : six formules
     en petit, toutes dans la même police, toutes de la même couleur.
     L'œil ne les distingue pas, il les LIT — c'est-à-dire qu'il relit
     les huit à chaque retour à l'accueil. Huit silhouettes différentes
     se reconnaissent sans être lues, et c'est tout ce qu'on demande à
     une icône.

     Elles sont donc choisies pour leur FORME avant leur sens : une
     grille d'opérateurs, une courbe, des points isolés, des barres, un
     nuage traversé d'une droite, une cloche, une balance, une roue
     dentée. Aucune ne peut être confondue avec une autre à trente
     pixels, les yeux mi-clos.

     « f » éteint un trait au rang de décor (les axes, la ligne de
     base) ; « a » en allume un seul, celui qui porte le sens. */
  const A_ICO = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  const APP_ICO = {
    calculs: A_ICO('<path d="M4.2 7h5.2M6.8 4.4v5.2"/><path d="M14.6 7h5.2"/>'
      + '<path d="m4.6 14.8 4.6 4.6M9.2 14.8l-4.6 4.6"/>'
      + '<path d="M14.6 15.6h5.2M14.6 18.8h5.2"/>'),
    fonctions: A_ICO('<path class="f" d="M4.3 3.6v16.6h16.4"/>'
      + '<path d="M5.6 17.4c3.4 0 3-10.2 7-10.2s4.2 6.8 7.4 6.8"/>'),
    suites: A_ICO('<path class="f" d="M3.6 20.4h17"/>'
      + '<circle cx="6.4" cy="16.6" r="1.7" fill="currentColor" stroke="none"/>'
      + '<circle cx="10.6" cy="13.2" r="1.7" fill="currentColor" stroke="none"/>'
      + '<circle cx="14.8" cy="10.4" r="1.7" fill="currentColor" stroke="none"/>'
      + '<circle cx="19" cy="8.2" r="1.7" fill="currentColor" stroke="none"/>'),
    stats: A_ICO('<path class="f" d="M3.2 20.4h17.6"/>'
      + '<path d="M5.6 18.6v-5.4M10.4 18.6V7.4M15.2 18.6v-8.2M20 18.6V4.6" stroke-width="3.1"/>'),
    regression: A_ICO('<path class="a" d="M3.8 18.8 20.2 6.2" stroke-width="2.2"/>'
      + '<circle cx="6.6" cy="17" r="1.6" fill="currentColor" stroke="none"/>'
      + '<circle cx="10.2" cy="13.4" r="1.6" fill="currentColor" stroke="none"/>'
      + '<circle cx="13.8" cy="12.4" r="1.6" fill="currentColor" stroke="none"/>'
      + '<circle cx="17.4" cy="8.4" r="1.6" fill="currentColor" stroke="none"/>'),
    probas: A_ICO('<path class="a" d="M3.4 19.4c3.6 0 4-12.4 8.6-12.4v12.4z" '
      + 'fill="currentColor" stroke="none" opacity=".4"/>'
      + '<path d="M3.4 19.4c3.6 0 4-12.4 8.6-12.4s5 12.4 8.6 12.4"/>'),
    equations: A_ICO('<path d="M12 5.4V20M8 20h8"/><path d="M4.4 8.6h15.2"/>'
      + '<path d="M4.4 8.6 1.9 13.8h5zM19.6 8.6l-2.5 5.2h5z"/>'),
    reglages: A_ICO('<path class="f" d="M3.6 6.4h16.8M3.6 12h16.8M3.6 17.6h16.8"/>'
      + '<circle cx="8.6" cy="6.4" r="2.6" fill="currentColor" stroke="none"/>'
      + '<circle cx="15.4" cy="12" r="2.6" fill="currentColor" stroke="none"/>'
      + '<circle cx="10.4" cy="17.6" r="2.6" fill="currentColor" stroke="none"/>'),
  };

  function accueilHTML() {
    return '<div class="nw-accueil" id="nw-grille-apps">'
      + ORDRE.map((c, i) => '<button type="button" class="nw-tuile'
        + (APPS[c].aVenir ? " nw-tuile-avenir" : "") + '" data-app="' + c + '"'
        + (APPS[c].aVenir ? ' title="Pas encore écrite — ouvrez pour savoir ce '
            + 'qu\'elle fera"' : "")
        + ' aria-current="' + (i === choisi) + '">'
        + '<span class="nw-tuile-ic" aria-hidden="true">'
        + (APP_ICO[c] || ech(APPS[c].icone)) + '</span>'
        + '<span class="nw-tuile-nom">' + ech(APPS[c].nom) + '</span></button>').join("")
      + '</div>'
      + '<p class="nw-accueil-note">Les flèches déplacent la sélection, '
      + '<b>Entrée</b> ouvre. Chaque application renvoie au chapitre du cours '
      + 'dont elle se sert.</p>';
  }

  function redessiner() {
    /* Sauvegarde du focus AVANT de remplacer le HTML. Sans elle, taper
       dans une cellule la vidait de son focus à chaque caractère. */
    const avant = document.activeElement;
    const id = avant && section.contains(avant) ? avant.id : null;
    const dataCle = avant && avant.dataset ? avant.dataset.cle : null;
    const sel = avant && avant.selectionStart !== undefined && avant.selectionStart !== null
              ? [avant.selectionStart, avant.selectionEnd] : null;
    const app = courante === "accueil" ? null : APPS[courante];
    bTitre.textContent = app ? app.nom : "Accueil";
    page.innerHTML = app ? app.html() : accueilHTML();
    bAngle.textContent = ETAT.reglages.angle;
    bAngle.hidden = false;
    bExamen.hidden = !ETAT.reglages.examen;
    ecran.dataset.ecran = ETAT.reglages.ecranSombre ? "sombre" : "clair";
    if (app && app.apres) app.apres();
    let cible = null;
    if (id) cible = document.getElementById(id);
    if (!cible && dataCle) cible = $('[data-cle="' + dataCle + '"]', page);
    if (cible && cible.focus) {
      try {
        cible.focus();
        if (sel && cible.setSelectionRange) cible.setSelectionRange(sel[0], sel[1]);
      } catch (e) {}
    }
    dessinerClavier();
  }

  function dire(texte, classe) {
    etat.textContent = texte || "";
    etat.className = "nw-etat" + (classe ? " " + classe : "");
  }

  /* ═══════════════ 5. La boîte à outils ══════════════════════════════
     Elle lit « catalogue.js », produit à la publication depuis le MÊME
     fichier que le tableau imprimable du bas de page. Une fonction
     documentée là et absente ici serait un mensonge ; le banc vérifie
     qu'aucune ne manque dans un sens ni dans l'autre. */
  const boite = $("#nw-boite"), boiteListe = $("#nw-boite-liste");
  function dessinerBoite(filtre) {
    const cat = (typeof CALC_CATALOGUE === "object" && CALC_CATALOGUE.categories) || [];
    const f = (filtre || "").trim().toLowerCase();
    const bouts = [];
    let n = 0;
    for (const c of cat) {
      const gardees = c.entrees.filter((e) => !f
        || (e.nom + " " + e.syntaxe + " " + e.aide).toLowerCase().includes(f));
      if (!gardees.length) continue;
      bouts.push('<p class="nw-boite-cat">' + ech(c.titre) + '</p>');
      for (const e of gardees) {
        n++;
        bouts.push('<button type="button" class="nw-boite-item" data-ins="' + ech(e.insere) + '">'
          + '<b>' + ech(e.syntaxe) + '</b> — ' + ech(e.nom)
          + '<i>' + ech(e.aide) + '</i></button>');
      }
    }
    boiteListe.innerHTML = n ? bouts.join("")
      : '<p class="nw-boite-rien">Aucune fonction ne correspond à « ' + ech(f) + ' ».</p>';
  }
  function ouvrirBoite(ouvrir) {
    boite.hidden = !ouvrir;
    $("#nw-catalogue").setAttribute("aria-expanded", String(!!ouvrir));
    if (ouvrir) { dessinerBoite($("#nw-boite-filtre").value); $("#nw-boite-filtre").focus(); }
  }

  /* ═══════════════ 6. Calculs ════════════════════════════════════════
     Le fil des calculs, du plus ancien au plus récent, et la ligne de
     saisie en bas — l'ordre de lecture d'une conversation, pas d'une
     pile. La flèche du haut rappelle le calcul précédent : c'est le
     geste le plus utilisé d'une calculatrice, et il doit marcher sans
     souris. */
  let rappel = -1;
  let panneauVar = false;

  const ESSAIS = ["1/3+1/6", "cos(π/6)", "√12", "binomialeCdf(10;0.3;4)"];

  /* ═══════════ Les résultats complémentaires de l'application Calculs ═══
     La machine propose, sous un résultat, d'autres lectures du MÊME
     nombre : hexadécimal, binaire, facteurs premiers, division
     euclidienne, notation scientifique. Ce n'est pas un gadget — en BTS
     CIEL, un masque se lit en binaire et une adresse en hexadécimal, et
     retaper le nombre dans le convertisseur pour le voir autrement est
     une rupture de geste.

     On ne propose QUE ce qui a un sens pour le nombre obtenu : un
     résultat décimal n'a pas de facteurs premiers, et un entier de vingt
     chiffres ne se factorise pas en un temps raisonnable. Une rubrique
     affichée mais vide vaudrait moins que pas de rubrique. */
  const COMPL_MAX_FACTEURS = 1e12;

  function facteursPremiers(n) {
    const f = [];
    let m = Math.abs(n), d = 2;
    while (d * d <= m) {
      while (m % d === 0) { f.push(d); m /= d; }
      d += d === 2 ? 1 : 2;
    }
    if (m > 1) f.push(m);
    return f;
  }

  function ecrireFacteurs(n) {
    if (n === 0) return "0 n'a pas de décomposition.";
    if (Math.abs(n) === 1) return String(n) + " n'a pas de facteur premier.";
    const f = facteursPremiers(n);
    if (f.length === 1) return (n < 0 ? "−" : "") + f[0] + " est premier.";
    const groupes = [];
    for (const p2 of f) {
      const dernier = groupes[groupes.length - 1];
      if (dernier && dernier[0] === p2) dernier[1]++;
      else groupes.push([p2, 1]);
    }
    return (n < 0 ? "−" : "")
      + groupes.map(([b, e]) => e > 1 ? b + petit(String(e)) : String(b)).join(" × ");
  }

  function complements(valeur, entree) {
    if (!Number.isFinite(valeur)) return [];
    const out = [];
    const entier = Number.isInteger(valeur);

    if (entier && Math.abs(valeur) <= Number.MAX_SAFE_INTEGER) {
      const abs = Math.abs(valeur), signe = valeur < 0 ? "−" : "";
      out.push(["Hexadécimal", signe + "0x" + abs.toString(16).toUpperCase()]);
      out.push(["Binaire", signe + "0b" + abs.toString(2)]);
      if (abs >= 2 && abs <= COMPL_MAX_FACTEURS)
        out.push(["Facteurs premiers", ecrireFacteurs(valeur)]);
    }

    /* La division euclidienne ne se déduit PAS du résultat : il faut
       l'entrée. « 123/7 » donne 17,571… et le quotient entier n'y est
       plus. On relit donc ce qui a été tapé. */
    const m = /^\s*(-?\d+)\s*\/\s*(-?\d+)\s*$/.exec(String(entree || ""));
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      if (b !== 0 && Number.isSafeInteger(a) && Number.isSafeInteger(b)) {
        /* Le reste est celui des MATHÉMATIQUES, toujours positif, et non
           celui de « % » en JavaScript qui prend le signe du dividende.
           −123 % 7 vaut −4 en machine ; le reste euclidien est 3. */
        const qe = Math.floor(a / b);
        const r = a - b * qe;
        const rr = r < 0 ? r + Math.abs(b) : r;
        const qq = (a - rr) / b;
        /* Le vrai signe moins, pas le trait d'union : tout le reste de la
           calculatrice écrit « −5 », et deux glyphes pour la même idée se
           remarquent dans une colonne de résultats. */
        const moins = (x) => String(x).replace("-", "−");
        out.push(["Division euclidienne",
                  moins(a) + " = " + moins(b) + " × " + moins(qq) + " + " + rr]);
      }
    }

    /* La notation scientifique n'a d'intérêt que si elle DIT quelque
       chose : pour 42, elle n'apprend rien. */
    const a2 = Math.abs(valeur);
    if (valeur !== 0 && (a2 >= 1e5 || a2 < 1e-3)) {
      const e = Math.floor(Math.log10(a2));
      const mant = valeur / Math.pow(10, e);
      out.push(["Notation scientifique",
                fmt(mant) + " × 10" + petit(String(e))]);
    }
    return out;
  }

  APPS.calculs = {
    nom: "Calculs", icone: "1+2",
    html() {
      const h = ETAT.historique;
      /* L'entrée passée est un BOUTON : un clic la remet dans la ligne
         de saisie. Une faute de frappe dans « binomialeCdf(10;0.3;4) »
         ne se corrigeait qu'en la retapant en entier — la flèche haut
         la rappelait, mais encore fallait-il le savoir ET avoir le
         curseur dans le champ. Le calcul est à l'écran ; qu'on puisse
         le toucher est le geste le plus court. */
      const lignes = h.length ? h.map((l, i) => '<div class="nw-ligne">'
          + '<button type="button" class="nw-saisie" data-reprendre="' + i + '" '
          + 'title="Reprendre ce calcul dans la ligne de saisie">'
          + ech(l.entree) + '</button>'
          + (l.erreur
            ? '<span class="nw-erreur">' + ech(l.erreur) + '</span>'
            : '<span class="nw-resultat">' + ech(l.exact || l.approx) + '</span>'
              + (l.deux ? '<span class="nw-approche">≈ ' + ech(l.approx) + '</span>' : ''))
          /* Les compléments ne s'affichent que sous le DERNIER calcul :
             les coller sous chaque ligne de l'historique noierait celui
             qu'on vient de faire, qui est le seul qu'on regarde. */
          + (i === h.length - 1 && !l.erreur && l.complements && l.complements.length
            ? '<div class="nw-complements"><span class="nw-compl-titre">Résultats '
              + 'complémentaires</span>'
              + l.complements.map(([t, x]) => '<span class="nw-compl"><b>' + ech(t)
                  + '</b> ' + ech(x) + '</span>').join("")
              + '</div>'
            : "")
          + '</div>')
        /* Demandé : « inverse le sens met le exe en haut et quand on tape
           ca part en bas l'historique ». L'index de « data-reprendre » est
           posé AVANT le retournement : il doit continuer de désigner la
           même ligne de l'historique, qui, lui, reste dans l'ordre où les
           calculs ont été faits. Retourner la liste et retourner les
           numéros serait deux fois la même idée, et une fois de trop. */
        .reverse().join("")
        /* Les quatre exemples sont CLIQUABLES. Un écran vide qui donne un
           exemple est déjà poli ; un écran vide qui fait l'exemple à
           votre place supprime le seul obstacle qui reste — savoir quoi
           taper d'abord. La première réussite arrive en un clic, et
           c'est elle qui décide si on revient. */
        : '<p class="nw-vide">Tapez un calcul et validez — ou prenez un de '
          + 'ceux-ci : '
          + ESSAIS.map((e) => '<button type="button" class="nw-essai" data-essai="'
              + ech(e) + '">' + ech(e) + '</button>').join(" ")
          + '</p>';
      const vars = Object.keys(ETAT.variables).sort();
      const panneau = panneauVar ? '<div class="nw-rangee" style="margin-top:.6rem">'
          + (vars.length
            ? vars.map((v) => '<button type="button" class="nw-bouton" data-insvar="' + ech(v)
                + '">' + ech(v) + ' = ' + ech(fmt(ETAT.variables[v])) + '</button>').join("")
            : '<span class="nw-sous">Aucune valeur rangée. Écrivez par exemple '
              + '<code>5→A</code> pour en ranger une.</span>')
          + (vars.length ? '<button type="button" class="nw-bouton" id="nw-vider-vars">'
              + 'Tout effacer</button>' : '')
          + '</div>' : "";
      /* La saisie passe EN TÊTE, et le dernier calcul apparaît juste en
         dessous d'elle. Ce qu'on vient de taper et ce qu'on vient
         d'obtenir se touchent : plus rien ne pousse le résultat hors de
         l'écran à mesure que l'historique s'allonge, et sur un téléphone
         le champ ne fuit plus sous le clavier. */
      return '<div class="nw-saisie-boite">'
        + '<input type="text" class="nw-champ" id="nw-calc" autocomplete="off" '
        + 'spellcheck="false" autocapitalize="off" aria-label="Votre calcul" '
        + 'placeholder="votre calcul, puis Entrée">'
        + '<button type="button" class="nw-valider" id="nw-calc-ok">EXE</button></div>'
        + '<div class="nw-flux" id="nw-flux">' + lignes + '</div>' + panneau
        + '<p class="nw-sous">La <b>forme exacte</b> est au-dessus, sa valeur approchée '
        + 'en dessous : sur une copie, c\'est la forme exacte qu\'on recopie. '
        + '<kbd>↑</kbd> rappelle le calcul précédent, et <b>un clic sur un calcul '
        + 'passé le reprend</b>. Les <b>puissances s\'écrivent en petit</b> : '
        + 'tapez <code>^</code> puis les chiffres, et <code>e^1</code> devient '
        + '<code>e¹</code>.</p>';
    },
    apres() {
      /* Le plus récent est en haut : c'est donc en haut qu'on se place. */
      const flux = $("#nw-flux");
      if (flux) flux.scrollTop = 0;
      const champ = $("#nw-calc");
      if (champ) champ.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); valider(); }
        else if (e.key === "ArrowUp" && ETAT.historique.length) {
          e.preventDefault();
          rappel = rappel < 0 ? ETAT.historique.length - 1 : Math.max(0, rappel - 1);
          champ.value = ETAT.historique[rappel].entree;
        } else if (e.key === "ArrowDown" && rappel >= 0) {
          e.preventDefault();
          rappel++;
          if (rappel >= ETAT.historique.length) { rappel = -1; champ.value = ""; }
          else champ.value = ETAT.historique[rappel].entree;
        }
      });
      const ok = $("#nw-calc-ok");
      if (ok) ok.addEventListener("click", valider);
      const vider = $("#nw-vider-vars");
      if (vider) vider.addEventListener("click", () => {
        ETAT.variables = {}; garder(); redessiner();
        dire("Mémoires effacées.", "e-ok");
      });
      $$("[data-insvar]", page).forEach((b) => b.addEventListener("click", () => {
        panneauVar = false; redessiner(); inserer(b.dataset.insvar);
      }));
      $$("[data-essai]", page).forEach((b) => b.addEventListener("click", () => {
        const c = $("#nw-calc");
        if (!c) return;
        c.value = b.dataset.essai;
        c.focus();
        valider();
      }));
      $$("[data-reprendre]", page).forEach((b) => b.addEventListener("click", () => {
        const l = ETAT.historique[+b.dataset.reprendre];
        const c = $("#nw-calc");
        if (!l || !c) return;
        c.value = l.entree;
        c.focus();
        try { c.setSelectionRange(c.value.length, c.value.length); } catch (e) {}
        dire("Calcul repris — corrigez-le et validez.", "e-ok");
      }));
    },
  };

  function valider() {
    const champ = $("#nw-calc");
    if (!champ) return;
    const texte = champ.value.trim();
    if (!texte) return;
    const ctx = contexte();
    ctx.vars.set("ans", ETAT.dernier === undefined ? 0 : ETAT.dernier);
    /* Un calcul qui commence par un opérateur reprend le résultat
       précédent : « +3 » après 7 fait 10. C'est le geste de la machine. */
    const prefixe = /^[+\-*/^]/.test(texte) && ETAT.historique.length ? "ans" : "";
    const r = CALC.calculer(prefixe + texte, ctx);
    if (r.ok) {
      ETAT.dernier = r.valeur;
      for (const [nom, v] of ctx.vars) if (/^[A-Za-z]$/.test(nom)) ETAT.variables[nom] = v;
      if (r.stocke) dire("Rangé dans " + r.stocke + ".", "e-ok");
      else dire("");
    } else {
      dire(r.erreur, "e-erreur");
    }
    ETAT.historique.push({ entree: prefixe ? prefixe + texte : texte,
                           exact: r.exact || null, approx: r.approx || "",
                           deux: !!r.montrerLesDeux, erreur: r.ok ? null : r.erreur,
                           complements: r.ok ? complements(r.valeur, texte) : [] });
    if (ETAT.historique.length > 40) ETAT.historique.splice(0, ETAT.historique.length - 40);
    rappel = -1;
    garder();
    redessiner();
    const neuf = $("#nw-calc");
    if (neuf) { neuf.value = ""; neuf.focus(); }
    if (r.desaccord && window.console)
      console.warn("calculatrice : forme exacte écartée", r.desaccord);
  }

  /* ═══════════════ 7. Fonctions ══════════════════════════════════════
     Trois vues de la même chose — l'expression, la courbe, le tableau —
     parce que c'est ainsi que l'énoncé les demande. Et un menu
     « calculer » qui répond aux cinq questions d'un exercice de
     terminale : les zéros, les extremums, les intersections,
     l'intégrale, le nombre dérivé. */
  const COULEURS = ["c1", "c2", "c3", "c4"];
  const NOMS_F = ["f", "g", "h", "k"];

  /* ──────────────────────────────────────────── écrire les maths en maths
     Signalé, capture de l'émulateur à l'appui : « les puissances c'est des
     accents ». C'était vrai — la machine affiche « f(x)=x²-2 » et nous
     montrions « x^2-2 », le signe de la saisie, pas celui des maths.

     On ne touche PAS à ce qu'on tape : « ^ », « * » et « sqrt » restent la
     façon d'écrire au clavier. C'est l'AFFICHAGE qui change, et seulement
     quand le champ n'a pas le curseur — sinon on verrait ses lettres se
     transformer sous ses doigts, et on ne saurait plus quoi corriger. */
  const EXPOSANTS = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵",
                      "6":"⁶","7":"⁷","8":"⁸","9":"⁹","-":"⁻","n":"ⁿ",
                      "x":"ˣ","i":"ⁱ","+":"⁺","(":"⁽",")":"⁾" };
  function joliMath(txt) {
    let t = String(txt || "");
    /* Les puissances d'abord, tant que la chaîne est encore brute :
       « x^12 » prend ses DEUX chiffres, « x^(n+1) » prend sa parenthèse. */
    t = t.replace(/\^\(([^()]{1,12})\)/g, (m, g) => montee(g, m));
    t = t.replace(/\^(-?[0-9]+)/g, (m, g) => montee(g, m));
    t = t.replace(/\^([a-zA-Z])/g, (m, g) => montee(g, m));
    return ech(t)
      .replace(/sqrt/g, "√").replace(/\bpi\b/g, "π")
      .replace(/\*/g, "×").replace(/(^|[^-])-(?!-)/g, "$1−")
      .replace(/&lt;=/g, "≤").replace(/&gt;=/g, "≥").replace(/!=/g, "≠")
      .replace(/\u0001([^\u0001]*)\u0001/g, "<sup>$1</sup>");
    /* Un exposant qu'on ne sait pas monter est laissé tel quel : mieux
       vaut un accent circonflexe qu'un carré faux. */
    function montee(g, entier) {
      if (/^[0-9-]+$/.test(g) && g.length <= 3) {
        return [...g].map((c) => EXPOSANTS[c] || c).join("");
      }
      return "\u0001" + g + "\u0001";
    }
  }

  /* Le type de la fonction, comme la machine l'écrit sous l'expression.
     Lu sur la forme écrite, pas sur la courbe : c'est ce que la machine
     fait aussi, et ça reste vrai même quand l'expression ne compile pas.
     Dans le doute on dit « Fonction » — une étiquette fausse serait pire
     que pas d'étiquette. */
  function typeFonction(expr) {
    const t = String(expr || "").replace(/\s+/g, "").toLowerCase();
    if (!t) return "";
    if (/sin\(|cos\(|tan\(/.test(t)) return "Fonction trigonométrique";
    if (/\bln\(|\blog\(/.test(t)) return "Fonction logarithmique";
    if (/\bexp\(|\be\^/.test(t)) return "Fonction exponentielle";
    if (/sqrt\(/.test(t)) return "Fonction racine";
    if (/abs\(/.test(t)) return "Valeur absolue";
    if (!/x/.test(t)) return "Fonction constante";
    /* Une division PAR une expression qui contient x : c'est le propre
       d'une rationnelle, et c'est ce qui la distingue d'un polynôme
       divisé par un nombre. */
    if (/\/[^/]*x/.test(t)) return "Fonction rationnelle";
    const deg = degrePolynome(t);
    if (deg === 1) return "Fonction affine";
    if (deg === 2) return "Fonction du second degré";
    if (deg !== null && deg >= 3) return "Fonction polynomiale de degré " + deg;
    return "Fonction";
  }
  function degrePolynome(t) {
    if (!/^[-+*/^().0-9x]*$/.test(t)) return null;   /* un nom inconnu : on se tait */
    let deg = /x/.test(t) ? 1 : 0;
    const m = t.match(/x\^\(?(-?[0-9]+)/g) || [];
    for (const e of m) {
      const n = Number(e.replace(/[^0-9-]/g, ""));
      if (Number.isFinite(n)) deg = Math.max(deg, n);
    }
    return deg;
  }
  /* ── huit couleurs, comme la machine ──────────────────────────────────
     Quatre fonctions, mais huit couleurs : on choisit la sienne. Le rouge
     pour une parabole et le bleu pour sa dérivée, c'est le même geste que
     surligner deux couleurs sur une copie. */
  const TEINTES = [["c1", "Bleu"], ["c2", "Rouge"], ["c3", "Vert"], ["c4", "Violet"],
                   ["c5", "Orange"], ["c6", "Turquoise"], ["c7", "Magenta"], ["c8", "Ocre"]];
  function couleurDe(i) {
    const d = ETAT.fonctions[i];
    return (d && d.couleur) || COULEURS[i];
  }
  /* Quelle ligne est ouverte en saisie, quelle ligne a son menu déplié.
     Deux nombres, et pas dans ETAT : ça ne se garde pas d'une visite à
     l'autre. Retrouver un menu ouvert trois jours plus tard n'aide
     personne. */
  let editionF = -1, menuF = -1;

  /* La dérivée POUR LE TRACÉ : une différence centrée toute simple.
     CALC.num.derivee fait douze extrapolations de Richardson pour arracher
     les dernières décimales — c'est ce qu'il faut pour afficher f′(3), ce
     n'est pas ce qu'il faut six cent quarante fois par tracé. Ici une
     erreur de 10⁻⁸ est invisible à l'écran ; une seconde d'attente, non.
     Les trous restent des trous : si la fonction n'existe pas d'un côté,
     la dérivée n'existe pas non plus, et le trait se rompt. */
  function derivPourTrace(f) {
    return (x) => {
      const h = Math.max(1e-5, Math.abs(x) * 1e-5);
      const a = f(x + h), b = f(x - h);
      return Number.isFinite(a) && Number.isFinite(b) ? (a - b) / (2 * h) : NaN;
    };
  }

  /* On RECONSTRUIT les coefficients depuis la fonction, jamais depuis le
     texte : « (x−1)(x+3) », « x²+2x−3 » et « x*x+2*x-3 » sont la même
     parabole et doivent donner les mêmes détails. Trois points suffisent
     à déterminer un polynôme de degré 2 ; quatre de plus servent à
     VÉRIFIER que c'en est un. Sans cette vérification, on afficherait un
     discriminant pour sin(x) — un chiffre faux, présenté comme sûr. */
  function coefficients(f) {
    let y0, y1, ym;
    try { y0 = f(0); y1 = f(1); ym = f(-1); } catch (e) { return null; }
    if (![y0, y1, ym].every(Number.isFinite)) return null;
    const a = (y1 + ym) / 2 - y0, b = (y1 - ym) / 2, c = y0;
    const echelle = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c));
    for (const x of [2, -2, 0.5, 3.7]) {
      let v;
      try { v = f(x); } catch (e) { return null; }
      const attendu = a * x * x + b * x + c;
      if (!Number.isFinite(v)) return null;
      if (Math.abs(v - attendu) > 1e-7 * echelle * (1 + x * x)) return null;
    }
    const net = (v) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e9) / 1e9);
    const A = net(a), B = net(b), C = net(c);
    return { a: A, b: B, c: C, deg: A !== 0 ? 2 : B !== 0 ? 1 : 0 };
  }

  /* Les détails que la machine donne sous « Détails ». Elle y met la
     distance focale d'une parabole ; nous y mettons le discriminant, les
     racines et le sommet — c'est ce que l'énoncé demande en BTS, et c'est
     le même geste : nommer ce qu'on a sous les yeux. */
  function detailsFonction(i, c) {
    const d = ETAT.fonctions[i];
    if (!c) return '<p class="nw-sous">Expression vide.</p>';
    if (c.erreur) return '<p class="nw-erreur">' + ech(c.erreur) + '</p>';
    const l = ['<dt>nature</dt><dd>' + ech(typeFonction(d.expr)) + '</dd>'];
    const p = coefficients(c.brute || c.f);
    if (p && p.deg === 1) {
      l.push('<dt>coefficient directeur a</dt><dd>' + ech(fmt(p.a)) + '</dd>');
      l.push('<dt>ordonnée à l\'origine b</dt><dd>' + ech(fmt(p.b)) + '</dd>');
      l.push('<dt>racine</dt><dd>x = ' + ech(fmt(-p.b / p.a)) + '</dd>');
      l.push('<dt>sens</dt><dd>' + (p.a > 0 ? "croissante" : "décroissante") + '</dd>');
    } else if (p && p.deg === 2) {
      const D = p.b * p.b - 4 * p.a * p.c;
      const xs = -p.b / (2 * p.a);
      l.push('<dt>discriminant Δ</dt><dd>' + ech(fmt(D)) + '</dd>');
      if (D > 0) {
        const r1 = (-p.b - Math.sqrt(D)) / (2 * p.a), r2 = (-p.b + Math.sqrt(D)) / (2 * p.a);
        l.push('<dt>racines</dt><dd>' + ech(fmt(Math.min(r1, r2))) + '  et  '
          + ech(fmt(Math.max(r1, r2))) + '</dd>');
      } else if (D === 0) {
        l.push('<dt>racine double</dt><dd>' + ech(fmt(xs)) + '</dd>');
      } else {
        l.push('<dt>racines</dt><dd>aucune racine réelle</dd>');
      }
      l.push('<dt>sommet S</dt><dd>(' + ech(fmt(xs)) + ' ; '
        + ech(fmt(p.a * xs * xs + p.b * xs + p.c)) + ')</dd>');
      /* « 1(x − 0)² − 2 » est juste et illisible. On écrit la forme
         canonique comme on l'écrit au tableau : le 1 ne se note pas, le
         « − 0 » non plus, et un terme nul disparaît. Ce qui reste est ce
         qu'on recopie sur une copie. */
      const beta = p.a * xs * xs + p.b * xs + p.c;
      const tete = p.a === 1 ? "" : p.a === -1 ? "−" : ech(fmt(p.a));
      const dedans = xs === 0 ? "x"
        : "(x " + (xs > 0 ? "− " + ech(fmt(xs)) : "+ " + ech(fmt(-xs))) + ")";
      const queue = beta === 0 ? ""
        : beta > 0 ? " + " + ech(fmt(beta)) : " − " + ech(fmt(-beta));
      l.push('<dt>forme canonique</dt><dd>' + tete + dedans + '<sup>2</sup>'
        + queue + '</dd>');
      l.push('<dt>allure</dt><dd>parabole tournée vers le '
        + (p.a > 0 ? "haut" : "bas") + '</dd>');
    }
    const z = c.f(0);
    if (Number.isFinite(z)) l.push('<dt>' + NOMS_F[i] + '(0)</dt><dd>' + ech(fmt(z)) + '</dd>');
    return '<dl class="nw-valeurs">' + l.join("") + '</dl>'
      + (p ? "" : '<p class="nw-sous">Cette fonction n\'est ni affine ni du second degré : '
          + 'les zéros, les extremums et les intersections se cherchent dans l\'onglet '
          + 'Graphique, bouton « Calculer ».</p>');
  }

  /* Le menu « ⋯ ». C'est celui de la machine, entrée pour entrée, à ceci
     près que nous le dépions sous la ligne au lieu de recouvrir l'écran :
     sur un téléphone, un menu qui cache ce qu'il modifie fait perdre le
     fil. */
  function optionsFonction(i, c) {
    const d = ETAT.fonctions[i];
    const dom = d.domaine || {};
    const val = (v) => (v === undefined || v === null ? "" : String(v));
    return '<div class="nw-expr-options">'
      + '<div class="nw-opt-bloc"><h4>Détails</h4>' + detailsFonction(i, c) + '</div>'
      + '<div class="nw-opt-bloc"><h4>Couleur</h4><div class="nw-teintes">'
      + TEINTES.map(([k, n]) => '<button type="button" class="nw-teinte'
          + (couleurDe(i) === k ? " nw-choisie" : "") + '" data-teinte="' + i + ':' + k
          + '" style="--t:var(--nw-' + k + ')" title="' + n + '" aria-label="' + n
          + '" aria-pressed="' + (couleurDe(i) === k) + '"></button>').join("")
      + '</div></div>'
      + '<div class="nw-opt-bloc"><h4>Tracés</h4>'
      + '<label class="nw-coche"><input type="checkbox" data-voir="' + i + '"'
      + (d.visible !== false ? " checked" : "") + '> tracer la courbe</label>'
      + '<label class="nw-coche"><input type="checkbox" data-deriv="' + i + '"'
      + (d.derivee ? " checked" : "") + '> tracer la dérivée ' + NOMS_F[i] + '′ '
      + '<span class="nw-sous">(en pointillés)</span></label></div>'
      + '<div class="nw-opt-bloc"><h4>Domaine de tracé</h4><div class="nw-rangee">'
      + '<label for="nw-dmin' + i + '">de</label>'
      + '<input type="text" class="nw-petit nw-court" id="nw-dmin' + i + '" data-dom="'
      + i + ':min" value="' + ech(val(dom.min)) + '" placeholder="−∞" autocomplete="off">'
      + '<label for="nw-dmax' + i + '">à</label>'
      + '<input type="text" class="nw-petit nw-court" id="nw-dmax' + i + '" data-dom="'
      + i + ':max" value="' + ech(val(dom.max)) + '" placeholder="+∞" autocomplete="off">'
      + '</div><p class="nw-sous">Laissés vides, la courbe est tracée partout. '
      + 'Le domaine ne change pas la fonction : il décide seulement où elle se dessine.</p>'
      + '</div>'
      + '<div class="nw-opt-bloc"><button type="button" class="nw-bouton" data-effacer="'
      + i + '">Supprimer l\'expression</button></div>'
      + '</div>';
  }

  let curseur = { i: 0, x: 0 }, calculResultat = null;

  function fonctionsCompilees() {
    return ETAT.fonctions.map((d, i) => {
      if (!d.expr.trim()) return null;
      const c = CALC.fonction(d.expr, "x", contexte());
      const dom = d.domaine || {};
      const brute = c.f;
      /* Le domaine ne modifie pas la fonction, il modifie son TRACÉ : hors
         bornes on rend « n'existe pas », et tracer() rompt le trait tout
         seul, exactement comme pour une division par zéro. « brute » reste
         disponible pour les calculs, qui, eux, n'ont pas à être bornés. */
      const f = (dom.min === undefined && dom.max === undefined) ? brute
        : (x) => ((dom.min !== undefined && x < dom.min)
               || (dom.max !== undefined && x > dom.max)) ? NaN : brute(x);
      return { i, nom: NOMS_F[i], expr: d.expr, visible: d.visible !== false,
               f, brute, derivee: !!d.derivee,
               erreur: c.erreur, avert: c.avert, classe: couleurDe(i) };
    });
  }
  function fenetreAuto(liste) {
    const F = ETAT.fenetre;
    if (!F.auto) return F;
    const dessinees = liste.filter((c) => c && c.visible && !c.erreur);
    if (!dessinees.length) return F;
    let bas = Infinity, haut = -Infinity;
    for (let k = 0; k <= 200; k++) {
      const x = F.xmin + (F.xmax - F.xmin) * k / 200;
      for (const c of dessinees) {
        const y = c.f(x);
        if (Number.isFinite(y)) { bas = Math.min(bas, y); haut = Math.max(haut, y); }
      }
    }
    if (!Number.isFinite(bas) || !Number.isFinite(haut)) return F;
    if (haut - bas < 1e-9) { bas -= 1; haut += 1; }
    const marge = (haut - bas) * 0.1;
    /* Les valeurs calculées ne REMPLACENT pas les réglages manuels : on
       les rend séparément. Sinon, décocher « automatique » ramènerait la
       fenêtre d'avant, ce que personne n'attend. */
    return { xmin: F.xmin, xmax: F.xmax, ymin: bas - marge, ymax: haut + marge, auto: true };
  }

  APPS.fonctions = {
    nom: "Grapheur", icone: "f(x)",
    chapitre: ["03-fonctions-variations", "Fonctions et variations"],
    html() {
      const vue = ETAT.onglets.fonctions;
      const onglets = '<div class="nw-onglets" role="tablist">'
        + [["expressions", "Expressions"], ["graphique", "Graphique"], ["tableau", "Tableau"]]
          .map(([c, t]) => '<button type="button" class="nw-onglet" role="tab" data-onglet="fonctions:'
            + c + '" aria-selected="' + (vue === c) + '">' + t + '</button>').join("")
        + '</div>';
      const liste = fonctionsCompilees();
      if (vue === "expressions") {
        /* ── la liste s'allonge ────────────────────────────────────────
           La machine n'affiche pas quatre cases vides : elle affiche ce
           qui existe, et une seule ligne « Ajouter un élément » au bout.
           Quatre cases vides disent « remplis-moi quatre fois » ; une
           ligne d'ajout dit « il y en a autant qu'il en faut ». C'est la
           même place à l'écran et ce n'est pas le même message.

           Et la ligne au repos n'est PAS un champ : c'est l'expression
           écrite en maths — « f(x) = x²−2 » —, sa nature en dessous, et
           un « ⋯ » à droite. On ne retombe dans le champ qu'en cliquant
           dessus. Signalé, capture à l'appui : « les puissances c'est des
           accents ». Un accent circonflexe au milieu d'une formule, ce
           n'est pas des mathématiques. */
        const premierVide = ETAT.fonctions.findIndex((d) => !d.expr.trim());
        const rangs = [];
        for (let i = 0; i < NOMS_F.length; i++) {
          const d = ETAT.fonctions[i];
          const c = liste[i];
          const vide = !d.expr.trim();
          if (vide && i !== premierVide) continue;
          const teinte = couleurDe(i);
          if (editionF === i) {
            rangs.push('<div class="nw-expr nw-expr-saisie" style="--filet:var(--nw-'
              + teinte + ')">'
              + '<label for="nw-f' + i + '">' + NOMS_F[i] + '(x) =</label>'
              + '<input type="text" class="nw-petit nw-large" id="nw-f' + i
              + '" data-cle="f' + i + '" value="' + ech(d.expr)
              + '" autocomplete="off" spellcheck="false" enterkeyhint="done">'
              + '<button type="button" class="nw-bouton nw-primaire" data-poser="' + i
              + '">OK</button>'
              + (c && c.erreur ? '<span class="nw-erreur">' + ech(c.erreur) + '</span>' : "")
              + (c && !c.erreur && c.avert
                 ? '<span class="nw-erreur">' + ech(c.avert) + '</span>' : "")
              + '</div>');
            continue;
          }
          if (vide) {
            rangs.push('<button type="button" class="nw-expr-ajout" data-editer="' + i + '">'
              + '<span aria-hidden="true">+</span> Ajouter un élément</button>');
            continue;
          }
          const ouvert = menuF === i;
          const etat = [];
          if (d.visible === false) etat.push("non tracée");
          if (d.derivee) etat.push("dérivée tracée");
          if (d.domaine && (d.domaine.min !== undefined || d.domaine.max !== undefined))
            etat.push("domaine restreint");
          rangs.push('<div class="nw-expr' + (ouvert ? " nw-expr-ouvert" : "")
            + '" style="--filet:var(--nw-' + teinte + ')">'
            + '<button type="button" class="nw-expr-corps" data-editer="' + i + '">'
            + '<span class="nw-expr-math">' + NOMS_F[i] + '(x) = ' + joliMath(d.expr)
            + '</span>'
            + '<span class="nw-expr-type">'
            + (c && c.erreur ? ech(c.erreur)
               : ech(typeFonction(d.expr) + (etat.length ? " · " + etat.join(" · ") : "")))
            + '</span></button>'
            + '<button type="button" class="nw-expr-menu" data-menu="' + i + '" aria-expanded="'
            + ouvert + '" aria-label="Options de ' + NOMS_F[i] + '">'
            + '<span aria-hidden="true">⋯</span></button>'
            + '</div>'
            + (ouvert ? optionsFonction(i, c) : ""));
        }
        return onglets + '<div class="nw-expr-liste">' + rangs.join("") + '</div>'
          /* Les deux boutons de la machine, au même endroit : ils mènent
             aux deux autres onglets. Une liste d'expressions sans porte
             de sortie oblige à remonter chercher l'onglet ; la machine ne
             le demande pas, nous non plus. */
          + '<div class="nw-expr-bas">'
          + '<button type="button" class="nw-bouton" data-onglet="fonctions:graphique">'
          + 'Tracer le graphique</button>'
          + '<button type="button" class="nw-bouton" data-onglet="fonctions:tableau">'
          + 'Afficher les valeurs</button></div>'
          + '<p class="nw-sous">Écrivez la variable <code>x</code>, et les puissances avec '
          + '<code>^</code> : elles s\'affichent en petit. Les quatre fonctions '
          + 'sont utilisables dans Calculs : <code>f(2)</code>, <code>g(0)</code>. '
          + 'Les noms sont f, g, h et k, dans cet ordre.</p>'
          + lienChapitre(this.chapitre);
      }
      if (vue === "graphique") {
        const F = fenetreAuto(liste);
        const courbes = liste.filter((c) => c && c.visible && !c.erreur);
        const act = courbes.find((c) => c.i === curseur.i) || courbes[0];
        const ycur = act ? act.f(curseur.x) : NaN;
        const svg = tracer({
          xmin: F.xmin, xmax: F.xmax, ymin: F.ymin, ymax: F.ymax,
          /* La tangente demandée par « calculer » est tracée AVEC les
             courbes, en trait d'appui : on vérifie à l'œil qu'elle touche
             la courbe au bon endroit, ce qu'une équation écrite ne montre
             pas. Elle disparaît dès qu'on change une expression — une
             tangente à une courbe qui n'existe plus mentirait. */
          courbes: courbes.map((c) => ({ f: c.f, classe: c.classe }))
            /* La dérivée se trace dans la MÊME couleur que sa courbe, en
               pointillés : deux couleurs pour un même objet obligeraient à
               tenir une légende de plus en tête. Le pointillé dit « c'est
               la pente de celle-là », la couleur dit laquelle. */
            .concat(courbes.filter((c) => c.derivee)
              .map((c) => ({ f: derivPourTrace(c.f), classe: c.classe + " nw-deriv" })))
            .concat(ETAT.fenetre.tangente
              && courbes.some((c) => c.i === ETAT.fenetre.tangente.i)
              ? [{ f: (x) => ETAT.fenetre.tangente.m * x + ETAT.fenetre.tangente.p,
                   classe: "appui" }] : []),
          curseur: act ? { x: curseur.x, y: ycur } : null,
          aide: "Courbes de " + courbes.map((c) => c.nom).join(", "),
        });
        /* ── La barre du Grapheur ─────────────────────────────────────
           Quatre boutons, et ce sont EXACTEMENT ceux de la machine : le
           contrôleur partagé d'Epsilon en déclare quatre — m_autoButton,
           m_rangeButton (Axes), m_navigationButton, et un quatrième
           propre à l'application. D'où la même barre au Grapheur, aux
           Suites et aux Régressions, le dernier bouton seul changeant de
           nom : « Calculer » ici, « Régression » là-bas.

           Rien n'est inventé ni perdu : les commandes existaient toutes,
           empilées sous le tracé. Elles sont seulement remises à la place
           où on les cherche. Une fonction qui existe ailleurs que là où
           l'élève a l'habitude de la voir ne sert pas pendant une
           épreuve. */
        const pan = ETAT.fenetre.panneau || "";
        const barre = '<div class="nw-barre-outils" role="toolbar">'
          + '<button type="button" class="nw-outil" id="nw-g-auto" aria-pressed="'
          + (ETAT.fenetre.auto ? "true" : "false") + '">Auto <span class="nw-pastille'
          + (ETAT.fenetre.auto ? " nw-allumee" : "") + '" aria-hidden="true"></span></button>'
          + [["axes", "Axes"], ["naviguer", "Naviguer"], ["calculer", "Calculer"]]
            .map(([c, t]) => '<button type="button" class="nw-outil'
              + (pan === c ? " nw-ouvert" : "") + '" data-gpan="' + c
              + '" aria-expanded="' + (pan === c) + '">' + t + '</button>').join("")
          + '</div>';
        let panneau = "";
        if (pan === "axes") {
          panneau = '<div class="nw-panneau"><div class="nw-rangee">'
            + ["xmin", "xmax"].map((k) => '<label for="nw-' + k + '">' + k
              + '</label><input type="text" class="nw-petit nw-court" id="nw-' + k
              + '" data-fen="' + k + '" value="' + ech(ETAT.fenetre[k]) + '">').join("")
            + (ETAT.fenetre.auto ? ""
              : ["ymin", "ymax"].map((k) => '<label for="nw-' + k + '">' + k
                + '</label><input type="text" class="nw-petit nw-court" id="nw-' + k
                + '" data-fen="' + k + '" value="' + ech(ETAT.fenetre[k]) + '">').join(""))
            + '</div><div class="nw-rangee">'
            + '<button type="button" class="nw-bouton" data-zoom="0.5">Zoom +</button>'
            + '<button type="button" class="nw-bouton" data-zoom="2">Zoom −</button>'
            + '<button type="button" class="nw-bouton" id="nw-recadrer">Recadrer</button>'
            + '</div>'
            + (ETAT.fenetre.auto ? '<p class="nw-sous">« Auto » est allumé : les ordonnées '
                + 'suivent les courbes. Éteignez-le pour saisir ymin et ymax.</p>' : "")
            + '</div>';
        } else if (pan === "naviguer") {
          panneau = '<div class="nw-panneau"><div class="nw-rangee">'
            + '<button type="button" class="nw-bouton" data-curseur="-1">◀ précédent</button>'
            + '<button type="button" class="nw-bouton" data-curseur="1">suivant ▶</button>'
            + (courbes.length > 1 ? '<button type="button" class="nw-bouton" id="nw-suivante">'
                + 'courbe suivante</button>' : "")
            + '</div></div>';
        }
        return onglets + barre + panneau + svg
          + '<p class="nw-curseur-info">'
          + (act ? '<span>' + ech(act.nom) + '(' + ech(fmt(curseur.x)) + ') = '
                   + ech(Number.isFinite(ycur) ? fmt(ycur) : "n\'existe pas") + '</span>'
                 : '<span>Aucune fonction à tracer.</span>')
          + '</p>'
          + '<div class="nw-legende">' + courbes.map((c) => '<span><i style="background:var(--nw-'
            + c.classe + ')"></i>' + ech(c.nom) + '(x) = ' + joliMath(c.expr) + '</span>'
            + (c.derivee ? '<span><i class="nw-leg-deriv" style="background:var(--nw-'
                + c.classe + ')"></i>' + ech(c.nom) + '\u2032(x)</span>' : "")).join("")
          + '</div>'
          + (pan === "calculer" ? blocCalculer(courbes, F) : "");
      }
      const T = ETAT.tableau;
      const colonnes = liste.filter((c) => c && !c.erreur);
      let corps = "";
      for (let n = 0; n < 24; n++) {
        const x = T.debut + n * T.pas;
        corps += '<tr><td>' + ech(fmt(x)) + '</td>'
          + colonnes.map((c) => {
            const y = c.f(x);
            return '<td>' + ech(Number.isFinite(y) ? fmt(y) : "—") + '</td>';
          }).join("") + '</tr>';
      }
      return onglets
        + '<div class="nw-rangee">'
        + '<label for="nw-tdebut">début</label><input type="text" class="nw-petit" '
        + 'id="nw-tdebut" data-tab="debut" value="' + ech(T.debut) + '">'
        + '<label for="nw-tpas">pas</label><input type="text" class="nw-petit" '
        + 'id="nw-tpas" data-tab="pas" value="' + ech(T.pas) + '">'
        + '</div>'
        + '<div class="nw-defile"><table class="nw-table"><thead><tr><th>x</th>'
        + colonnes.map((c) => '<th>' + ech(c.nom) + '(x)</th>').join("")
        + '</tr></thead><tbody>' + corps + '</tbody></table></div>'
        + '<p class="nw-sous">Un tiret signifie que la fonction n\'existe pas en ce point '
        + '— une division par zéro, un logarithme de nombre négatif.</p>';
    },
    apres() {
      brancherOnglets();
      /* ── ouvrir une ligne ──────────────────────────────────────────
         Un clic sur la ligne la rend saisissable et place le curseur à la
         fin. Le champ apparaît déjà actif : demander un deuxième clic pour
         écrire serait un clic de trop, et sur un téléphone le clavier ne
         monterait qu'au second essai. */
      $$("[data-editer]", page).forEach((b) => b.addEventListener("click", () => {
        editionF = Number(b.dataset.editer); menuF = -1; redessiner();
        const champ = $("#nw-f" + editionF);
        if (champ) {
          champ.focus();
          try { champ.setSelectionRange(champ.value.length, champ.value.length); } catch (e) {}
        }
      }));
      $$("[data-menu]", page).forEach((b) => b.addEventListener("click", () => {
        const i = Number(b.dataset.menu);
        menuF = menuF === i ? -1 : i; editionF = -1; redessiner();
      }));
      const poser = (i, c) => {
        /* Une tangente calculée sur l'ancienne expression mentirait sur
           la nouvelle : on l'oublie plutôt que de la laisser flotter. */
        ETAT.fonctions[i].expr = c.value; ETAT.fenetre.tangente = null;
        editionF = -1; garder(); redessiner();
      };
      $$("[data-cle^='f']", page).forEach((c) => {
        const i = Number(c.dataset.cle.slice(1));
        c.addEventListener("change", () => poser(i, c));
        c.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); poser(i, c); }
          /* Échap sort sans valider : c'est la sortie de secours d'un
             champ qu'on a ouvert par erreur. */
          else if (e.key === "Escape") { e.stopPropagation(); editionF = -1; redessiner(); }
        });
      });
      $$("[data-poser]", page).forEach((b) => b.addEventListener("click", () => {
        const i = Number(b.dataset.poser), c = $("#nw-f" + i);
        if (c) poser(i, c);
      }));
      $$("[data-teinte]", page).forEach((b) => b.addEventListener("click", () => {
        const [i, k] = b.dataset.teinte.split(":");
        ETAT.fonctions[Number(i)].couleur = k; garder(); redessiner();
      }));
      $$("[data-deriv]", page).forEach((c) => c.addEventListener("change", () => {
        ETAT.fonctions[Number(c.dataset.deriv)].derivee = c.checked; garder(); redessiner();
      }));
      $$("[data-dom]", page).forEach((c) => c.addEventListener("change", () => {
        const [i, bout] = c.dataset.dom.split(":");
        const d = ETAT.fonctions[Number(i)];
        d.domaine = d.domaine || {};
        if (!c.value.trim()) { delete d.domaine[bout]; dire(""); garder(); redessiner(); return; }
        const v = nombreSaisi(c.value);
        if (v === null) { dire("« " + c.value + " » n'est pas un nombre.", "e-erreur"); return; }
        d.domaine[bout] = v;
        /* Des bornes à l'envers ne dessinent rien du tout, et l'écran vide
           ne dit pas pourquoi. On le dit, et on ne pose pas la borne. */
        if (d.domaine.min !== undefined && d.domaine.max !== undefined
            && d.domaine.min >= d.domaine.max) {
          delete d.domaine[bout];
          dire("La borne de gauche doit être plus petite que celle de droite.", "e-erreur");
          redessiner(); return;
        }
        dire(""); garder(); redessiner();
      }));
      $$("[data-effacer]", page).forEach((b) => b.addEventListener("click", () => {
        const i = Number(b.dataset.effacer);
        ETAT.fonctions[i] = { expr: "", visible: true };
        ETAT.fenetre.tangente = null; menuF = -1; editionF = -1;
        garder(); redessiner();
        dire(NOMS_F[i] + " est effacée.", "e-ok");
      }));
      $$("[data-voir]", page).forEach((c) => c.addEventListener("change", () => {
        ETAT.fonctions[Number(c.dataset.voir)].visible = c.checked; garder(); redessiner();
      }));
      $$("[data-curseur]", page).forEach((b) => b.addEventListener("click", () => {
        bougerCurseur(Number(b.dataset.curseur));
      }));
      const suiv = $("#nw-suivante");
      if (suiv) suiv.addEventListener("click", () => {
        const c = fonctionsCompilees().filter((x) => x && x.visible && !x.erreur);
        const pos = c.findIndex((x) => x.i === curseur.i);
        curseur.i = c[(pos + 1) % c.length].i;
        redessiner();
      });
      $$("[data-zoom]", page).forEach((b) => b.addEventListener("click", () => {
        const k = Number(b.dataset.zoom);
        const F = ETAT.fenetre, cx = (F.xmin + F.xmax) / 2, cy = (F.ymin + F.ymax) / 2;
        F.xmin = cx - (cx - F.xmin) * k; F.xmax = cx + (F.xmax - cx) * k;
        F.ymin = cy - (cy - F.ymin) * k; F.ymax = cy + (F.ymax - cy) * k;
        garder(); redessiner();
      }));
      const rec = $("#nw-recadrer");
      if (rec) rec.addEventListener("click", () => {
        Object.assign(ETAT.fenetre, { xmin: -10, xmax: 10, ymin: -10, ymax: 10, auto: true });
        curseur.x = 0; garder(); redessiner();
      });
      /* « Auto » est devenu un bouton d'état dans la barre, comme sur la
         machine, au lieu d'une case à cocher perdue sous le tracé. En
         l'éteignant, on recopie les bornes que le cadrage automatique
         venait de trouver : repartir de −10/10 ferait sauter le tracé
         alors qu'on voulait seulement le figer. */
      const auto = $("#nw-g-auto");
      if (auto) auto.addEventListener("click", () => {
        ETAT.fenetre.auto = !ETAT.fenetre.auto;
        if (!ETAT.fenetre.auto) {
          const F = fenetreAuto(fonctionsCompilees());
          ETAT.fenetre.ymin = Math.round(F.ymin * 1000) / 1000;
          ETAT.fenetre.ymax = Math.round(F.ymax * 1000) / 1000;
        }
        garder(); redessiner();
      });
      /* Un deuxième clic referme : c'est un menu, pas un onglet. */
      $$("[data-gpan]", page).forEach((b2) => b2.addEventListener("click", () => {
        ETAT.fenetre.panneau =
          ETAT.fenetre.panneau === b2.dataset.gpan ? "" : b2.dataset.gpan;
        garder(); redessiner();
      }));
      $$("[data-fen]", page).forEach((c) => c.addEventListener("change", () => {
        const v = nombreSaisi(c.value);
        if (v === null) { dire("« " + c.value + " » n'est pas un nombre.", "e-erreur"); return; }
        ETAT.fenetre[c.dataset.fen] = v; dire(""); garder(); redessiner();
      }));
      $$("[data-tab]", page).forEach((c) => c.addEventListener("change", () => {
        const v = nombreSaisi(c.value);
        if (v === null) { dire("« " + c.value + " » n'est pas un nombre.", "e-erreur"); return; }
        if (c.dataset.tab === "pas" && v === 0) {
          dire("Un pas nul donnerait vingt-quatre fois la même ligne.", "e-erreur"); return;
        }
        ETAT.tableau[c.dataset.tab] = v; dire(""); garder(); redessiner();
      }));
      brancherCalculer();
    },
  };

  function bougerCurseur(sens) {
    const F = fenetreAuto(fonctionsCompilees());
    curseur.x += sens * (F.xmax - F.xmin) / 40;
    curseur.x = Math.max(F.xmin, Math.min(F.xmax, curseur.x));
    redessiner();
  }
  function nombreSaisi(texte) {
    const r = CALC.calculer(String(texte), CALC.contexte(ETAT.reglages));
    return r.ok && Number.isFinite(r.valeur) ? r.valeur : null;
  }
  function lienChapitre(ch) {
    if (!ch) return "";
    return '<a class="nw-chapitre" href="../03-mathematiques/' + ch[0] + '/cours.html">'
      + '📘 Le cours : ' + ech(ch[1]) + '</a>';
  }
  function brancherOnglets() {
    $$("[data-onglet]", page).forEach((b) => b.addEventListener("click", () => {
      const [app, vue] = b.dataset.onglet.split(":");
      ETAT.onglets[app] = vue; calculResultat = null; garder(); redessiner();
    }));
  }

  /* Le menu « calculer » : cinq questions, et la réponse s'affiche sous
     le tracé avec l'aire hachurée quand c'est une intégrale. Chaque
     réponse DIT ce qu'elle a cherché et où — « sur [−10 ; 10] » —, parce
     qu'un zéro hors de la fenêtre n'est pas un zéro absent. */
  function blocCalculer(courbes, F) {
    const noms = courbes.map((c) => '<option value="' + c.i + '">' + ech(c.nom) + '</option>');
    return '<div class="nw-rangee" style="margin-top:.7rem">'
      + '<label for="nw-quoi">calculer</label>'
      + '<select class="nw-petit" id="nw-quoi">'
      + '<option value="zeros">les zéros</option>'
      + '<option value="extremums">les extremums</option>'
      + '<option value="integrale">une intégrale</option>'
      + '<option value="derivee">un nombre dérivé</option>'
      + '<option value="intersections">les intersections</option>'
      + '<option value="antecedent">un antécédent</option>'
      + '<option value="tangente">la tangente</option>'
      + '</select>'
      + (courbes.length > 1 ? '<label for="nw-quelle">de</label>'
          + '<select class="nw-petit" id="nw-quelle">' + noms.join("") + '</select>' : "")
      + '<label for="nw-ca">a</label><input type="text" class="nw-petit" id="nw-ca" value="0">'
      + '<label for="nw-cb">b</label><input type="text" class="nw-petit" id="nw-cb" value="1">'
      + '<button type="button" class="nw-bouton nw-primaire" id="nw-calculer">Calculer</button>'
      + '</div>'
      + (calculResultat ? '<div class="nw-ligne"><span class="nw-saisie">'
          + ech(calculResultat.question) + '</span><span class="nw-resultat">'
          + ech(calculResultat.reponse) + '</span></div>'
          + (calculResultat.note ? '<p class="nw-sous">' + calculResultat.note + '</p>' : "")
        : "");
  }
  function brancherCalculer() {
    const b = $("#nw-calculer");
    if (!b) return;
    b.addEventListener("click", () => {
      const courbes = fonctionsCompilees().filter((c) => c && c.visible && !c.erreur);
      if (!courbes.length) { dire("Aucune fonction tracée.", "e-erreur"); return; }
      const quoi = $("#nw-quoi").value;
      const quelle = $("#nw-quelle");
      const c = courbes.find((x) => x.i === Number(quelle ? quelle.value : courbes[0].i))
              || courbes[0];
      const F = fenetreAuto(fonctionsCompilees());
      const a = nombreSaisi($("#nw-ca").value), bb = nombreSaisi($("#nw-cb").value);
      const dansFenetre = " sur [" + fmt(F.xmin) + " ; " + fmt(F.xmax) + "]";
      if (quoi === "zeros") {
        const z = CALC.num.zeros(c.f, F.xmin, F.xmax);
        calculResultat = { question: "zéros de " + c.nom + dansFenetre,
          reponse: z.length ? z.map((x) => fmt(x)).join("  ·  ") : "aucun",
          note: "Un zéro en dehors de la fenêtre n'apparaît pas ici : élargissez "
                + "xmin et xmax pour le chercher ailleurs." };
      } else if (quoi === "extremums") {
        const e = CALC.num.extremums(c.f, F.xmin, F.xmax);
        calculResultat = { question: "extremums de " + c.nom + dansFenetre,
          reponse: e.length ? e.map((p) => (p.type === "min" ? "min" : "max") + " ("
            + fmt(p.x) + " ; " + fmt(p.y) + ")").join("  ·  ") : "aucun",
          note: "Ce sont les extremums LOCAUX trouvés dans la fenêtre." };
      } else if (quoi === "integrale") {
        if (a === null || bb === null) { dire("Bornes a et b illisibles.", "e-erreur"); return; }
        const v = CALC.num.integrale(c.f, a, bb);
        calculResultat = { question: "∫ de " + fmt(a) + " à " + fmt(bb) + " de " + c.nom,
          reponse: fmt(v),
          note: "C'est une aire ALGÉBRIQUE : ce qui est sous l'axe compte en négatif. "
                + "Pour une aire géométrique, intégrez |" + c.nom + "|." };
      } else if (quoi === "derivee") {
        if (a === null) { dire("La borne a est illisible.", "e-erreur"); return; }
        const d = CALC.num.derivee(c.f, a);
        calculResultat = { question: c.nom + "′(" + fmt(a) + ")", reponse: fmt(d),
          note: "Calculé numériquement : c'est le nombre dérivé, pas la fonction dérivée." };
      } else if (quoi === "antecedent") {
        /* L'ANTÉCÉDENT, et non le zéro : on cherche x tel que f(x) = a. La
           machine le propose parce qu'un énoncé demande bien plus souvent
           « pour quelle valeur de x a-t-on 250 € ? » que « où s'annule-t-elle ».
           C'est le même solveur, appliqué à f(x) − a. */
        if (a === null) { dire("La valeur cherchée (a) est illisible.", "e-erreur"); return; }
        const z = CALC.num.zeros((x) => c.f(x) - a, F.xmin, F.xmax);
        calculResultat = {
          question: c.nom + "(x) = " + fmt(a) + dansFenetre,
          reponse: z.length ? z.map((x) => "x = " + fmt(x)).join("  ·  ") : "aucun",
          note: z.length ? null
            : "Aucun antécédent DANS CETTE FENÊTRE. Il peut en exister ailleurs : "
              + "élargissez xmin et xmax avant de conclure.",
        };
      } else if (quoi === "tangente") {
        /* La tangente en a : y = f′(a)·(x − a) + f(a). Elle est AJOUTÉE au
           tracé, pas seulement écrite — c'est en la voyant toucher la courbe
           qu'on vérifie qu'on n'a pas confondu le point et la pente. */
        if (a === null) { dire("L'abscisse a est illisible.", "e-erreur"); return; }
        const ya = c.f(a), m = CALC.num.derivee(c.f, a);
        if (!Number.isFinite(ya) || !Number.isFinite(m)) {
          dire("La courbe n'a pas de tangente en ce point.", "e-erreur"); return;
        }
        ETAT.fenetre.tangente = { i: c.i, a, m, p: ya - m * a };
        const signe = (ya - m * a) < 0 ? " − " : " + ";
        calculResultat = {
          question: "tangente à " + c.nom + " en x = " + fmt(a),
          reponse: "y = " + fmt(m) + "x" + signe + fmt(Math.abs(ya - m * a)),
          note: "Pente f′(" + fmt(a) + ") = " + fmt(m) + ", point ("
                + fmt(a) + " ; " + fmt(ya) + "). La tangente est tracée.",
        };
      } else {
        const autres = courbes.filter((x) => x.i !== c.i);
        if (!autres.length) { dire("Il faut deux courbes tracées.", "e-erreur"); return; }
        const lignes = autres.map((o) => {
          const z = CALC.num.zeros((x) => c.f(x) - o.f(x), F.xmin, F.xmax);
          return c.nom + " = " + o.nom + " : " + (z.length
            ? z.map((x) => "(" + fmt(x) + " ; " + fmt(c.f(x)) + ")").join("  ·  ") : "aucune");
        });
        calculResultat = { question: "intersections" + dansFenetre,
          reponse: lignes.join("   "), note: null };
      }
      dire("");
      redessiner();
    });
  }

  /* ═══════════════ 8. Suites ═════════════════════════════════════════
     Trois formes, parce que les énoncés les trois donnent : explicite
     u(n) = …, récurrente u(n+1) = f(u(n)), et d'ordre deux
     u(n+2) = f(u(n+1), u(n)) — celle de Fibonacci. Dans l'expression,
     « u » désigne le terme précédent et « u1 » celui d'avant lui. */
  const NOMS_U = ["u", "v"];
  APPS.suites = {
    nom: "Suites", icone: "uₙ",
    chapitre: ["03-fonctions-variations", "Fonctions et variations"],
    html() {
      const vue = ETAT.onglets.suites;
      const onglets = '<div class="nw-onglets" role="tablist">'
        + [["expressions", "Expressions"], ["graphique", "Graphique"], ["tableau", "Tableau"]]
          .map(([c, t]) => '<button type="button" class="nw-onglet" role="tab" data-onglet="suites:'
            + c + '" aria-selected="' + (vue === c) + '">' + t + '</button>').join("")
        + '</div>';
      const suites = suitesCompilees();
      if (vue === "expressions") {
        return onglets + ETAT.suites.map((d, i) => {
          const nom = NOMS_U[i];
          const forme = d.type === "explicite" ? nom + "(n) ="
                      : d.type === "recurrente" ? nom + "(n+1) ="
                      : nom + "(n+2) =";
          return '<div class="nw-rangee">'
            + '<select class="nw-petit" data-stype="' + i + '" aria-label="Forme de ' + nom + '">'
            + [["explicite", "explicite"], ["recurrente", "récurrente"],
               ["ordre2", "ordre 2"]].map(([v, t]) => '<option value="' + v + '"'
                 + (d.type === v ? " selected" : "") + '>' + t + '</option>').join("")
            + '</select>'
            + '<label for="nw-u' + i + '">' + forme + '</label>'
            + '<input type="text" class="nw-petit nw-large" id="nw-u' + i + '" data-cle="u' + i
            + '" value="' + ech(d.expr) + '" autocomplete="off" spellcheck="false">'
            + '</div>'
            + (d.type !== "explicite" ? '<div class="nw-rangee">'
                + '<label for="nw-p' + i + '">' + nom + '(' + d.rang0 + ') =</label>'
                + '<input type="text" class="nw-petit" id="nw-p' + i + '" data-cle="p' + i
                + '" value="' + ech(d.premier) + '">'
                + (d.type === "ordre2" ? '<label for="nw-s' + i + '">' + nom + '('
                    + (d.rang0 + 1) + ') =</label><input type="text" class="nw-petit" id="nw-s'
                    + i + '" data-cle="s' + i + '" value="' + ech(d.second) + '">' : "")
                + '<label for="nw-r' + i + '">premier rang</label>'
                + '<select class="nw-petit" id="nw-r' + i + '" data-srang="' + i + '">'
                + [0, 1].map((r) => '<option value="' + r + '"' + (d.rang0 === r ? " selected" : "")
                    + '>' + r + '</option>').join("") + '</select>'
                + '</div>' : "")
            + (suites[i] && suites[i].erreur
                ? '<p class="nw-erreur">' + ech(suites[i].erreur) + '</p>' : "");
        }).join("")
          + '<p class="nw-sous">Dans une récurrence, <code>u</code> est le terme précédent '
          + 'et <code>n</code> son rang : <code>u+3</code> pour une suite arithmétique, '
          + '<code>2*u</code> pour une géométrique. À l\'ordre 2, <code>u1</code> désigne '
          + 'le terme d\'avant : Fibonacci s\'écrit <code>u+u1</code>. Les suites '
          + 's\'appellent aussi depuis Calculs : <code>u(10)</code>.</p>';
      }
      const rang0 = Math.min(...ETAT.suites.map((d) => d.rang0));
      const n = 30;
      const pts = [];
      let bas = Infinity, haut = -Infinity;
      suites.forEach((s, i) => {
        if (!s || s.erreur) return;
        for (let k = 0; k <= n; k++) {
          const y = s.terme(rang0 + k);
          if (!Number.isFinite(y)) continue;
          pts.push({ x: rang0 + k, y, serie: i });
          bas = Math.min(bas, y); haut = Math.max(haut, y);
        }
      });
      if (vue === "graphique") {
        if (!pts.length) return onglets + '<p class="nw-vide">Aucune suite calculable.</p>';
        const V = ETAT.suitesVue;
        const pan = V.panneau || "";
        /* La barre de la machine. Les quatre boutons sont ceux du
           contrôleur partagé d'Epsilon ; seul le dernier change de nom
           d'une application à l'autre. Ici « Calculer » fait la SOMME des
           termes, qui est la question posée dans tous les sujets de suites. */
        const barre = '<div class="nw-barre-outils" role="toolbar">'
          + '<button type="button" class="nw-outil" id="nw-s-auto" aria-pressed="'
          + (V.auto ? "true" : "false") + '">Auto <span class="nw-pastille'
          + (V.auto ? " nw-allumee" : "") + '" aria-hidden="true"></span></button>'
          + [["axes", "Axes"], ["naviguer", "Naviguer"], ["calculer", "Calculer"]]
            .map(([c, t]) => '<button type="button" class="nw-outil'
              + (pan === c ? " nw-ouvert" : "") + '" data-span="' + c
              + '" aria-expanded="' + (pan === c) + '">' + t + '</button>').join("")
          + '</div>';

        const nmin = V.auto ? rang0 - 1 : (parseFloat(V.nmin) || 0) - 1;
        const nmax = V.auto ? rang0 + n + 1 : (parseFloat(V.nmax) || 25) + 1;
        let ybas = bas, yhaut = haut;
        if (!V.auto) { ybas = parseFloat(V.ymin); yhaut = parseFloat(V.ymax); }
        if (!(yhaut - ybas > 1e-9)) { ybas -= 1; yhaut += 1; }
        const marge = V.auto ? (yhaut - ybas) * 0.1 : 0;

        let panneau = "";
        if (pan === "axes") {
          const champ = (k, lib) => '<label for="nw-s-' + k + '">' + lib
            + '</label><input type="text" class="nw-petit nw-court" id="nw-s-' + k
            + '" data-sfen="' + k + '" value="' + ech(V[k]) + '">';
          panneau = '<div class="nw-panneau"><div class="nw-rangee">'
            + champ("nmin", "n min") + champ("nmax", "n max")
            + (V.auto ? "" : champ("ymin", "y min") + champ("ymax", "y max"))
            + '</div>'
            + (V.auto ? '<p class="nw-sous">« Auto » est allumé : les ordonnées suivent '
                + 'les termes. Éteignez-le pour saisir y min et y max.</p>' : "")
            + '<div class="nw-rangee"><button type="button" class="nw-bascule nw-bouton" '
            + 'id="nw-s-escalier" aria-pressed="' + (V.escalier ? "true" : "false") + '">'
            + 'Graphique en escalier</button></div>'
            + '<p class="nw-sous">L\'escalier ne vaut que pour une suite '
            + '<strong>récurrente</strong> : il trace y = x et la courbe de la fonction de '
            + 'récurrence, puis saute de l\'une à l\'autre. C\'est ce qui montre la '
            + 'convergence — ou son absence.</p></div>';
        } else if (pan === "naviguer") {
          panneau = '<div class="nw-panneau"><div class="nw-rangee">'
            + '<button type="button" class="nw-bouton" data-sterme="-1">◀ terme précédent</button>'
            + '<button type="button" class="nw-bouton" data-sterme="1">terme suivant ▶</button>'
            + (suites.filter((x) => x && !x.erreur).length > 1
               ? '<button type="button" class="nw-bouton" id="nw-s-suite">suite suivante</button>'
               : "")
            + '</div></div>';
        }

        /* L'escalier : la première bissectrice, la courbe de récurrence, et
           le chemin qui va de l'une à l'autre. On ne le propose QUE si la
           suite choisie est récurrente — sur une suite explicite il ne
           voudrait rien dire, et un dessin qui ne veut rien dire est pire
           qu'un dessin absent. */
        const choisie = Math.min(V.suite, ETAT.suites.length - 1);
        const def = ETAT.suites[choisie];
        const sc = suites[choisie];
        const segments = [];
        let courbesEsc = [];
        /* La courbe de récurrence n'existe QUE si la relation ne dépend pas
           du rang : « u+3 » en a une, « u+n » en aurait une par rang. On ne
           le devine pas sur le texte, on le MESURE — deux rangs, la même
           image ou non. L'escalier reste tracé dans les deux cas, mais sans
           courbe quand elle n'a pas de sens. */
        let dependDeN = false;
        if (V.escalier && def && def.type === "recurrente" && sc && !sc.erreur) {
          const a1 = sc.image(1, 0), a2 = sc.image(1, 7);
          dependDeN = Number.isFinite(a1) && Number.isFinite(a2)
                      && Math.abs(a1 - a2) > 1e-12;
          const f = (x) => {
            try { return sc.image(x, def.rang0); } catch (e) { return NaN; }
          };
          /* « f », et non « fn » : c'est le nom que « tracer » attend. Le
             premier essai a planté la vue entière — un onglet qui ne
             s'ouvre plus — et c'est la console qui l'a dit, pas l'écran. */
          courbesEsc = [{ f: (x) => x, classe: "appui" }];
          if (!dependDeN) courbesEsc.push({ f: f, classe: "c1" });
          let x = sc.terme(def.rang0);
          for (let k = 0; k < 14 && Number.isFinite(x); k++) {
            const y = sc.terme(def.rang0 + k + 1);
            if (!Number.isFinite(y)) break;
            segments.push({ x1: x, y1: x, x2: x, y2: y });
            segments.push({ x1: x, y1: y, x2: y, y2: y });
            x = y;
          }
        }

        const curseur = Math.max(0, Math.min(V.curseur, n));
        const rangCur = rang0 + curseur;
        const yCur = sc && !sc.erreur ? sc.terme(rangCur) : NaN;

        const svg = tracer({
          xmin: nmin, xmax: nmax, ymin: ybas - marge, ymax: yhaut + marge,
          points: pts.filter((p) => p.x >= nmin && p.x <= nmax)
                     .map((p) => ({ x: p.x, y: p.y, r: 2.2 })),
          courbes: courbesEsc.length ? courbesEsc : undefined,
          segments: segments.length ? segments : undefined,
          curseur: Number.isFinite(yCur) ? { x: rangCur, y: yCur } : undefined,
          aide: "Termes des suites",
        });

        let calcul = "";
        if (pan === "calculer") {
          const de = Math.round(parseFloat(V.sommeDe));
          const a2 = Math.round(parseFloat(V.sommeA));
          let somme = null, termes = 0;
          if (sc && !sc.erreur && Number.isFinite(de) && Number.isFinite(a2) && a2 >= de
              && a2 - de <= 5000) {
            somme = 0;
            for (let k = de; k <= a2; k++) {
              const y = sc.terme(k);
              if (!Number.isFinite(y)) { somme = null; break; }
              somme += y; termes++;
            }
          }
          calcul = '<div class="nw-panneau"><p class="nw-sous">Somme des termes de '
            + ech(NOMS_U[choisie]) + '</p><div class="nw-rangee">'
            + '<label for="nw-s-de">de n =</label>'
            + '<input type="text" class="nw-petit nw-court" id="nw-s-de" data-ssomme="sommeDe" '
            + 'value="' + ech(V.sommeDe) + '">'
            + '<label for="nw-s-a">à n =</label>'
            + '<input type="text" class="nw-petit nw-court" id="nw-s-a" data-ssomme="sommeA" '
            + 'value="' + ech(V.sommeA) + '"></div>'
            + '<dl class="nw-valeurs"><dt>Σ</dt><dd>'
            + ech(somme === null ? "—" : fmt(somme)) + '</dd>'
            + '<dt>termes additionnés</dt><dd>' + termes + '</dd></dl></div>';
        }

        return onglets + barre + panneau + svg
          + '<p class="nw-curseur-info"><span>'
          + (sc && !sc.erreur
             ? ech(NOMS_U[choisie]) + '(' + rangCur + ') = '
               + ech(Number.isFinite(yCur) ? fmt(yCur) : "n\'existe pas")
             : "Aucune suite calculable.")
          + '</span></p>'
          + '<p class="nw-sous">Les termes sont des POINTS, pas une courbe : une suite '
          + 'n\'est définie que sur les entiers. Les relier serait une faute de lecture.</p>'
          + (V.escalier && def && def.type !== "recurrente"
             ? '<p class="nw-sous">L\'escalier est demandé, mais ' + ech(NOMS_U[choisie])
               + ' n\'est pas récurrente : il n\'y a pas de fonction à faire rebondir. '
               + 'Seuls les termes sont tracés.</p>'
             : "")
          + (dependDeN ? '<p class="nw-sous">La récurrence dépend du rang <code>n</code> : '
               + 'il n\'y a donc pas UNE courbe y = f(x), mais une par rang. L\'escalier '
               + 'est tracé, la courbe est écartée — la dessiner serait affirmer une '
               + 'relation qui change à chaque pas.</p>' : "")
          + calcul;
      }
      let corps = "";
      for (let k = 0; k <= 24; k++) {
        const r = rang0 + k;
        corps += '<tr><td>' + r + '</td>'
          + suites.map((s) => {
            if (!s || s.erreur) return '<td>—</td>';
            const y = s.terme(r);
            return '<td>' + ech(Number.isFinite(y) ? fmt(y) : "—") + '</td>';
          }).join("") + '</tr>';
      }
      const sommes = suites.map((s) => {
        if (!s || s.erreur) return null;
        let t = 0;
        for (let k = 0; k <= 24; k++) {
          const y = s.terme(rang0 + k);
          if (!Number.isFinite(y)) return null;
          t += y;
        }
        return t;
      });
      return onglets + '<div class="nw-defile"><table class="nw-table"><thead><tr><th>n</th>'
        + NOMS_U.map((nom) => '<th>' + nom + '(n)</th>').join("")
        + '</tr></thead><tbody>' + corps + '</tbody></table></div>'
        + '<dl class="nw-valeurs">' + sommes.map((s, i) => '<dt>Σ des 25 premiers termes de '
          + NOMS_U[i] + '</dt><dd>' + ech(s === null ? "—" : fmt(s)) + '</dd>').join("")
        + '</dl>';
    },
    apres() {
      brancherOnglets();
      /* La barre de la vue graphique. Chaque bouton fait quelque chose :
         un bouton posé qui ne répond pas est pire qu'un bouton absent. */
      const V = ETAT.suitesVue;
      const bAuto = $("#nw-s-auto", page);
      if (bAuto) bAuto.addEventListener("click", () => {
        V.auto = !V.auto; garder(); redessiner();
      });
      $$("[data-span]", page).forEach((b2) => b2.addEventListener("click", () => {
        V.panneau = V.panneau === b2.dataset.span ? "" : b2.dataset.span;
        garder(); redessiner();
      }));
      $$("[data-sfen]", page).forEach((c) => {
        const maj = () => { V[c.dataset.sfen] = c.value; garder(); redessiner(); };
        c.addEventListener("change", maj);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") maj(); });
      });
      const bEsc = $("#nw-s-escalier", page);
      if (bEsc) bEsc.addEventListener("click", () => {
        V.escalier = !V.escalier; garder(); redessiner();
      });
      $$("[data-sterme]", page).forEach((b2) => b2.addEventListener("click", () => {
        V.curseur = Math.max(0, Math.min(30, V.curseur + Number(b2.dataset.sterme)));
        garder(); redessiner();
      }));
      const bSuite = $("#nw-s-suite", page);
      if (bSuite) bSuite.addEventListener("click", () => {
        V.suite = (V.suite + 1) % ETAT.suites.length;
        garder(); redessiner();
      });
      $$("[data-ssomme]", page).forEach((c) => {
        const maj = () => { V[c.dataset.ssomme] = c.value; garder(); redessiner(); };
        c.addEventListener("change", maj);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") maj(); });
      });
      $$("[data-stype]", page).forEach((s) => s.addEventListener("change", () => {
        ETAT.suites[Number(s.dataset.stype)].type = s.value; garder(); redessiner();
      }));
      $$("[data-srang]", page).forEach((s) => s.addEventListener("change", () => {
        ETAT.suites[Number(s.dataset.srang)].rang0 = Number(s.value); garder(); redessiner();
      }));
      $$("[data-cle]", page).forEach((c) => {
        const m = /^([ups])(\d)$/.exec(c.dataset.cle);
        if (!m) return;
        const champ = { u: "expr", p: "premier", s: "second" }[m[1]];
        const maj = () => { ETAT.suites[Number(m[2])][champ] = c.value; garder(); redessiner(); };
        c.addEventListener("change", maj);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") maj(); });
      });
    },
  };
  function suitesCompilees() {
    return ETAT.suites.map((d, i) => {
      if (!d.expr.trim()) return null;
      const s = CALC.suite({ type: d.type, nom: NOMS_U[i], expr: d.expr,
                             premier: parseFloat(d.premier), second: parseFloat(d.second),
                             rang0: d.rang0 }, contexte());
      return s.erreur ? { erreur: s.erreur } : s;
    });
  }

  /* ═══════════════ 9. Statistiques ═══════════════════════════════════ */
  APPS.stats = {
    nom: "Statistiques", icone: "x̄",
    html() {
      const vue = ETAT.onglets.stats;
      const onglets = '<div class="nw-onglets" role="tablist">'
        + [["donnees", "Données"], ["resultats", "Résultats"], ["graphique", "Graphique"]]
          .map(([c, t]) => '<button type="button" class="nw-onglet" role="tab" data-onglet="stats:'
            + c + '" aria-selected="' + (vue === c) + '">' + t + '</button>').join("")
        + '</div>';
      const S = ETAT.stats;
      if (vue === "donnees") {
        let corps = "";
        for (let i = 0; i < S.valeurs.length; i++) {
          corps += '<tr><td>' + (i + 1) + '</td>'
            + '<td><input class="nw-cellule" data-cle="sv' + i + '" data-sv="' + i
            + '" value="' + ech(S.valeurs[i]) + '" aria-label="Valeur ' + (i + 1) + '"></td>'
            + '<td><input class="nw-cellule" data-cle="se' + i + '" data-se="' + i
            + '" value="' + ech(S.effectifs[i]) + '" aria-label="Effectif ' + (i + 1)
            + '"></td></tr>';
        }
        /* Les colonnes CALCULÉES de la machine : fréquence, effectifs
           cumulés croissants, fréquences cumulées croissantes. Elles ne se
           saisissent pas — elles se lisent, et c'est précisément ce qu'un
           sujet demande de savoir lire. Elles suivent l'ordre des valeurs
           TRIÉES, sinon un cumul ne veut rien dire. */
        const aperçu = CALC.STATS.unVariable(S.valeurs, S.effectifs);
        let colonnes = "";
        if (aperçu && aperçu.N > 0) {
          let cum = 0;
          colonnes = '<div class="nw-defile"><table class="nw-table"><thead><tr>'
            + '<th>valeur</th><th>effectif</th><th>fréquence</th>'
            + '<th>ECC</th><th>FCC</th></tr></thead><tbody>'
            + aperçu.paires.map((pr) => {
                cum += pr[1];
                return '<tr><td>' + ech(fmt(pr[0])) + '</td><td>' + ech(fmt(pr[1]))
                  + '</td><td>' + ech(fmt(pr[1] / aperçu.N))
                  + '</td><td>' + ech(fmt(cum))
                  + '</td><td>' + ech(fmt(cum / aperçu.N)) + '</td></tr>';
              }).join("")
            + '</tbody></table></div>'
            + '<p class="nw-sous"><b>ECC</b> : effectifs cumulés croissants — combien '
            + 'd\'individus ont une valeur inférieure ou égale. <b>FCC</b> : la même '
            + 'chose en fréquence. Les valeurs sont triées : un cumul sur des valeurs '
            + 'en désordre ne veut rien dire.</p>';
        }
        return onglets + '<div class="nw-defile"><table class="nw-table"><thead><tr>'
          + '<th>#</th><th>valeur</th><th>effectif</th></tr></thead><tbody>' + corps
          + '</tbody></table></div>'
          + '<div class="nw-rangee" style="margin-top:.5rem">'
          + '<button type="button" class="nw-bouton" id="nw-ligne-plus">+ une ligne</button>'
          + '<button type="button" class="nw-bouton" id="nw-ligne-moins">− la dernière</button>'
          + '<button type="button" class="nw-bouton" id="nw-stats-vider">Tout effacer</button>'
          + '</div>'
          + '<p class="nw-sous">Un effectif de 1 partout, c\'est une liste brute. '
          + 'Les valeurs répétées sont regroupées automatiquement.</p>'
          + colonnes;
      }
      const R = CALC.STATS.unVariable(S.valeurs, S.effectifs);
      if (!R) return onglets + '<p class="nw-vide">Aucune donnée exploitable.</p>';
      if (vue === "resultats") {
        const l = (t, v) => '<dt>' + t + '</dt><dd>' + ech(fmt(v)) + '</dd>';
        const bloc = (titre, lignes) => '<h3 class="nw-titre-bloc">' + titre + '</h3>'
          + '<dl class="nw-valeurs">' + lignes + '</dl>';
        /* Deux colonnes de lecture, comme la machine : la POPULATION
           (μ, σ, σ² — on a tout le monde) et l'ÉCHANTILLON (x̄, s, s² — on
           a une partie, et on estime). La moyenne est le même nombre dans
           les deux cas ; c'est son nom qui change, et le nom est ce que le
           sujet emploie pour dire laquelle des deux variances il attend. */
        return onglets
          + bloc("Effectifs", l("effectif total N", R.N) + l("somme Σxᵢnᵢ", R.somme)
              + l("somme des carrés Σxᵢ²nᵢ", R.sommeCarres))
          + bloc("Population", l("moyenne μ", R.moyenne)
              + l("variance σ²", R.variance) + l("écart type σ", R.ecartType))
          + bloc("Échantillon", l("moyenne x̄", R.moyenne)
              + l("variance s²", R.varianceEch) + l("écart type s", R.ecartTypeEch))
          + bloc("Position", l("minimum", R.min) + l("premier quartile Q1", R.q1)
              + l("médiane Me", R.mediane) + l("troisième quartile Q3", R.q3)
              + l("maximum", R.max)
              + '<dt>mode</dt><dd>' + ech(R.modes.length === R.paires.length ? "aucun"
                  : R.modes.map((m) => fmt(m)).join(" · ")) + '</dd>'
              /* L'effectif du mode : « 4 » ne dit pas si la valeur revient deux
                 fois ou trente. La machine l'affiche, et c'est lui qui dit si le
                 mode veut dire quelque chose. */
              + (R.modes.length === R.paires.length ? ""
                 : '<dt>effectif du mode Nm</dt><dd>'
                   + ech(fmt(Math.max(...R.paires.map((p) => p[1])))) + '</dd>'))
          + bloc("Dispersion", l("étendue", R.etendue)
              + l("écart interquartile", R.interquartile))
          + '<p class="nw-sous"><b>σ divise par N, s divise par N−1.</b> Un énoncé qui parle '
          + 'de « la population » ou de « la série » attend σ ; un énoncé qui parle d\'un '
          + '« échantillon » et d\'une estimation attend s. Avec un seul individu, s '
          + 'n\'existe pas.</p>'
          + '<p class="nw-sous"><b>Convention française des quartiles</b> : Q1 est la plus '
          + 'petite valeur telle qu\'au moins un quart de l\'effectif lui est inférieur ou '
          + 'égal — la valeur de rang ⌈N/4⌉. Un tableur interpole et ne donne donc pas '
          + 'toujours le même Q1.</p>';
      }
      const mode = ETAT.stats.graphe || "histogramme";
      const choix = '<div class="nw-rangee">'
        + [["histogramme", "Histogramme"], ["moustaches", "Boîte à moustaches"],
           ["cumul", "Fréquences cumulées"], ["normale", "Loi normale"]].map(([v, t]) =>
          '<button type="button" class="nw-bouton" data-sgraphe="' + v + '"'
          + (mode === v ? ' aria-pressed="true"' : '') + '>' + t + '</button>').join("")
        + '</div>';
      /* ── La barre de lecture ────────────────────────────────────────
         Chaque graphique a la sienne, sous le tracé, comme sur la
         machine : ◀ ▶ promènent le curseur d'un élément au suivant — une
         barre, un repère de la boîte, un point — et la ligne dit ce qu'il
         vaut. Un graphique qu'on ne peut que regarder se lit à l'œil, et
         l'œil se trompe d'une graduation. */
      const lectures = [];
      let svg = "";
      let reglages = "";
      let choisi = 0;
      const viser = (n) => (n ? Math.max(0, Math.min(n - 1, ETAT.stats.lecture | 0)) : 0);
      if (mode === "histogramme") {
        /* La machine règle son histogramme par DEUX nombres — la largeur
           d'une barre et le début de la première — et les AFFICHE même
           quand elle les a choisis seule. Les nôtres disaient « auto », ce
           qui ne dit rien : on ne peut pas corriger une valeur qu'on ne
           voit pas. Calculées, elles valent le plus petit écart entre deux
           valeurs, et un demi-écart avant la première : une barre par
           valeur, centrée sur elle, ce que donnait l'ancien « auto ». */
        const H = S.histo || {};
        let ecartMin = Infinity;
        for (let k = 1; k < R.paires.length; k++)
          ecartMin = Math.min(ecartMin, R.paires[k][0] - R.paires[k - 1][0]);
        const largAuto = Number.isFinite(ecartMin) && ecartMin > 0 ? ecartMin : 1;
        const debAuto = R.min - largAuto / 2;
        const saisieL = parseFloat(H.largeur), saisieD = parseFloat(H.debut);
        const manuel = saisieL > 0 || Number.isFinite(saisieD);
        const pasBarre = saisieL > 0 ? saisieL : largAuto;
        /* Une largeur saisie sans début part de la première valeur, comme
           avant : le demi-écart n'a de sens que pour la largeur calculée. */
        const d0 = Number.isFinite(saisieD) ? saisieD : saisieL > 0 ? R.min : debAuto;
        reglages = '<div class="nw-panneau"><div class="nw-rangee">'
          + '<label for="nw-h-larg">largeur</label>'
          + '<input type="text" class="nw-petit nw-court" id="nw-h-larg" data-histo="largeur" '
          + 'value="' + ech(saisieL > 0 ? H.largeur : fmt(pasBarre)) + '">'
          + '<label for="nw-h-deb">début</label>'
          + '<input type="text" class="nw-petit nw-court" id="nw-h-deb" data-histo="debut" '
          + 'value="' + ech(Number.isFinite(saisieD) ? H.debut : fmt(d0)) + '">'
          + '<button type="button" class="nw-bouton" id="nw-h-auto"'
          + (manuel ? '' : ' aria-pressed="true"') + '>Auto</button>'
          + '</div><p class="nw-sous">'
          + (manuel ? 'Réglages saisis : les valeurs sont groupées en classes [a ; b[ de cette '
              + 'largeur à partir de ce début. « Auto » revient au calcul.'
            : '« Auto » : une barre par valeur — la largeur est le plus petit écart entre '
              + 'deux valeurs, le début un demi-écart avant la première. Changez l\'un des '
              + 'deux pour grouper en classes, comme le demande un énoncé.')
          + '</p></div>';

        const classes = new Map();
        R.paires.forEach((pr) => {
          const k = Math.floor((pr[0] - d0) / pasBarre + 1e-9);
          classes.set(k, (classes.get(k) || 0) + pr[1]);
        });
        const cles = [...classes.keys()].sort((x, y) => x - y);
        choisi = viser(cles.length);
        const hmax = Math.max(...classes.values());
        cles.forEach((k) => {
          const a = d0 + k * pasBarre, b = a + pasBarre, n = classes.get(k);
          lectures.push('<span>[' + ech(fmt(a)) + ' ; ' + ech(fmt(b)) + '[</span>'
            + '<span>effectif ' + ech(fmt(n)) + '</span>'
            + '<span>fréquence ' + ech(fmt(n / R.N)) + '</span>');
        });
        svg = tracer({
          xmin: d0 + (cles[0] - 0.3) * pasBarre,
          xmax: d0 + (cles[cles.length - 1] + 1.3) * pasBarre,
          ymin: 0, ymax: hmax * 1.15,
          barres: cles.map((k, i) => ({ x0: d0 + k * pasBarre, x1: d0 + (k + 1) * pasBarre,
                                        h: classes.get(k),
                                        classe: i === choisi ? "barre-choisie" : "" })),
          aide: manuel ? "Histogramme par classes" : "Histogramme des effectifs",
        });
      } else if (mode === "moustaches") {
        const dx = Math.max(1e-9, R.max - R.min);
        const reperes = [["minimum", R.min], ["premier quartile Q1", R.q1],
                         ["médiane Me", R.mediane], ["troisième quartile Q3", R.q3],
                         ["maximum", R.max]];
        choisi = viser(reperes.length);
        reperes.forEach(([nom, v]) => lectures.push('<span>' + ech(nom) + ' = '
          + ech(fmt(v)) + '</span>'));
        svg = tracer({
          xmin: R.min - dx * 0.12, xmax: R.max + dx * 0.12, ymin: 0, ymax: 1,
          barres: [{ x0: R.q1, x1: R.q3, h: 0.72 }],
          segments: [{ x1: R.min, y1: 0.36, x2: R.q1, y2: 0.36, classe: "axe" },
                     { x1: R.q3, y1: 0.36, x2: R.max, y2: 0.36, classe: "axe" },
                     { x1: R.mediane, y1: 0.02, x2: R.mediane, y2: 0.72, classe: "axe" }],
          etiquettes: [{ x: R.min, y: 0.85, texte: "min " + fmt(R.min) },
                       { x: R.mediane, y: 0.93, texte: "Me " + fmt(R.mediane), ancre: "middle" },
                       { x: R.max, y: 0.85, texte: "max " + fmt(R.max), ancre: "end" }],
          curseur: { x: reperes[choisi][1], y: 0.36 },
          aide: "Boîte à moustaches",
        });
      } else if (mode === "cumul") {
        /* En FRÉQUENCES, comme la machine : la courbe monte de 0 à 100 %
           quel que soit l'effectif, et c'est ainsi qu'on y lit une médiane
           (50 %) ou un quartile (25 %, 75 %) sans rien recalculer. Les
           effectifs cumulés restent dans le tableau des Données. */
        let c = 0;
        const pts = R.paires.map((p) => { c += p[1]; return { x: p[0], y: 100 * c / R.N }; });
        choisi = viser(pts.length);
        c = 0;
        R.paires.forEach((p) => {
          c += p[1];
          lectures.push('<span>x ≤ ' + ech(fmt(p[0])) + '</span>'
            + '<span>' + ech(fmt(100 * c / R.N)) + ' %</span>'
            + '<span>(' + ech(fmt(c)) + ' sur ' + ech(fmt(R.N)) + ')</span>');
        });
        svg = tracer({
          xmin: R.min - (R.etendue || 1) * 0.1, xmax: R.max + (R.etendue || 1) * 0.1,
          ymin: 0, ymax: 110, points: pts,
          courbes: [{ f: (x) => { let s = 0; for (const p of R.paires) if (p[0] <= x) s += p[1];
                                  return 100 * s / R.N; } }],
          curseur: pts[choisi],
          aide: "Fréquences cumulées croissantes, en pourcentage",
        });
      } else {
        /* La droite de Henry. Chaque individu, rangé par ordre croissant,
           reçoit la valeur z qu'il aurait dans une loi normale centrée
           réduite à la même place : z = Φ⁻¹((k − ½) / N). Si la série suit
           une loi normale, les points (x ; z) s'alignent sur la droite
           z = (x − μ) / σ, tracée à côté. Ce n'est pas un test : c'est une
           lecture, et un point qui s'écarte se voit tout de suite. */
        const individus = [];
        for (const [v, n] of R.paires) {
          for (let k = 0; k < n && individus.length < 2000; k++) individus.push(v);
        }
        const N2 = individus.length;
        const pts = individus.map((v, k) => ({
          x: v, y: CALC.LOIS.invNormale((k + 0.5) / N2, 0, 1) }));
        choisi = viser(pts.length);
        pts.forEach((p, k) => lectures.push('<span>individu ' + (k + 1) + ' sur ' + N2
          + '</span><span>x = ' + ech(fmt(p.x)) + '</span><span>z = ' + ech(fmt(p.y))
          + '</span>'));
        const zmax = Math.max(2, ...pts.map((p) => Math.abs(p.y))) * 1.15;
        const dx = R.etendue || 1;
        svg = tracer({
          xmin: R.min - dx * 0.12, xmax: R.max + dx * 0.12, ymin: -zmax, ymax: zmax,
          points: pts,
          courbes: R.ecartType > 0
            ? [{ f: (x) => (x - R.moyenne) / R.ecartType, classe: "appui" }] : undefined,
          curseur: pts[choisi],
          aide: "Droite de Henry : la série face à la loi normale",
        });
      }
      const nav = lectures.length
        ? '<div class="nw-rangee">'
          + '<button type="button" class="nw-bouton" data-slire="' + (choisi - 1) + '"'
          + (choisi === 0 ? ' disabled' : '') + '>◀ précédent</button>'
          + '<button type="button" class="nw-bouton" data-slire="' + (choisi + 1) + '"'
          + (choisi === lectures.length - 1 ? ' disabled' : '') + '>suivant ▶</button>'
          + '</div>'
          + '<p class="nw-curseur-info" aria-live="polite">' + lectures[choisi] + '</p>'
        : "";
      /* Les valeurs ABERRANTES, au sens usuel : au-delà de 1,5 écart
         interquartile des quartiles. Les moustaches, elles, gardent la
         convention du lycée — elles vont aux extrêmes. On ne change donc
         pas le dessin, on NOMME ce qu'il contient : un sujet qui demande
         « y a-t-il des valeurs aberrantes ? » attend ce calcul-là. */
      let apres = "";
      if (mode === "moustaches") {
        const bas = R.q1 - 1.5 * R.interquartile;
        const haut2 = R.q3 + 1.5 * R.interquartile;
        const hors = R.paires.filter((pr) => pr[0] < bas || pr[0] > haut2).map((pr) => pr[0]);
        apres = '<p class="nw-sous">Les moustaches vont jusqu\'aux valeurs '
          + 'EXTRÊMES, convention du lycée — et non à 1,5 écart interquartile. Le seuil '
          + 'de 1,5 sert à NOMMER les valeurs aberrantes, pas à couper le dessin.</p>'
          + '<dl class="nw-valeurs">'
          + '<dt>seuil bas — Q1 − 1,5 × EIQ</dt><dd>' + ech(fmt(bas)) + '</dd>'
          + '<dt>seuil haut — Q3 + 1,5 × EIQ</dt><dd>' + ech(fmt(haut2)) + '</dd>'
          + '<dt>valeurs aberrantes</dt><dd>'
          + (hors.length ? ech(hors.map((v) => fmt(v)).join(" · ")) : "aucune") + '</dd>'
          + '</dl>';
      } else if (mode === "cumul") {
        apres = '<p class="nw-sous">On lit la médiane là où la courbe passe 50 %, Q1 à '
          + '25 %, Q3 à 75 %. Les effectifs cumulés (ECC) sont dans l\'onglet Données.</p>';
      } else if (mode === "normale") {
        apres = '<p class="nw-sous"><b>Droite de Henry.</b> Les points sont les individus '
          + 'rangés : en abscisse leur valeur, en ordonnée la valeur z qu\'ils auraient à la '
          + 'même place dans la loi normale centrée réduite, z = Φ⁻¹((k − ½) / N). '
          + 'Le trait en tirets est z = (x − μ) / σ. Plus les points s\'alignent dessus, '
          + 'plus la série ressemble à une loi normale — c\'est une lecture, pas un test.</p>'
          + (R.N > 2000 ? '<p class="nw-sous">Seuls les 2 000 premiers individus sont '
              + 'placés.</p>' : '');
      }
      return onglets + choix + reglages + svg + nav + apres;
    },
    apres() {
      brancherOnglets();
      $$("[data-sv]", page).forEach((c) => c.addEventListener("change", () => {
        const v = nombreSaisi(c.value);
        if (v === null) { dire("« " + c.value + " » n'est pas un nombre.", "e-erreur"); return; }
        ETAT.stats.valeurs[Number(c.dataset.sv)] = v; dire(""); garder(); redessiner();
      }));
      $$("[data-se]", page).forEach((c) => c.addEventListener("change", () => {
        const v = nombreSaisi(c.value);
        if (v === null || v < 0) {
          dire("Un effectif est un nombre positif.", "e-erreur"); return;
        }
        ETAT.stats.effectifs[Number(c.dataset.se)] = v; dire(""); garder(); redessiner();
      }));
      const plus = $("#nw-ligne-plus");
      if (plus) plus.addEventListener("click", () => {
        ETAT.stats.valeurs.push(0); ETAT.stats.effectifs.push(1); garder(); redessiner();
      });
      const moins = $("#nw-ligne-moins");
      if (moins) moins.addEventListener("click", () => {
        if (ETAT.stats.valeurs.length <= 1) {
          dire("Il faut au moins une ligne.", "e-erreur"); return;
        }
        ETAT.stats.valeurs.pop(); ETAT.stats.effectifs.pop(); garder(); redessiner();
      });
      const vider = $("#nw-stats-vider");
      if (vider) vider.addEventListener("click", () => {
        ETAT.stats.valeurs = [0]; ETAT.stats.effectifs = [1]; garder(); redessiner();
      });
      $$("[data-sgraphe]", page).forEach((b) => b.addEventListener("click", () => {
        ETAT.stats.graphe = b.dataset.sgraphe; ETAT.stats.lecture = 0;
        garder(); redessiner();
      }));
      $$("[data-slire]", page).forEach((b) => b.addEventListener("click", () => {
        ETAT.stats.lecture = Math.max(0, Number(b.dataset.slire));
        garder(); redessiner();
      }));
      const hAuto = $("#nw-h-auto", page);
      if (hAuto) hAuto.addEventListener("click", () => {
        ETAT.stats.histo = { largeur: "", debut: "" }; ETAT.stats.lecture = 0;
        garder(); redessiner();
      });
      $$("[data-histo]", page).forEach((c) => {
        const maj = () => {
          ETAT.stats.histo = ETAT.stats.histo || {};
          ETAT.stats.histo[c.dataset.histo] = c.value.trim();
          ETAT.stats.lecture = 0; garder(); redessiner();
        };
        c.addEventListener("change", maj);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") maj(); });
      });
    },
  };

  /* ═══════════════ 10. Régressions ═══════════════════════════════════ */
  /* ═══════════════ 10. Régressions ═══════════════════════════════════
     Rangée comme sur la machine : Données · Graphique · Stats. Ce n'est
     pas un détail d'habillage. Un élève qui a la NumWorks en main pendant
     l'épreuve cherche l'onglet qu'il connaît ; s'il doit réapprendre un
     rangement ici, l'outil lui coûte plus qu'il ne lui rapporte.

     Les données tiennent dans un tableau à COLONNES — X1 Y1 X2 Y2 — et
     non en lignes « x ; y » : c'est ce que la machine affiche, et c'est
     aussi la forme sous laquelle un énoncé donne ses mesures. */
  const COUL_SERIE = ["c2", "c3", "c4"];
  APPS.regression = {
    nom: "Régressions", icone: "ax+b",
    html() {
      const G = ETAT.regression;
      const vue = ETAT.onglets.regression;
      const onglets = '<div class="nw-onglets" role="tablist">'
        + [["donnees", "Données"], ["graphique", "Graphique"], ["stats", "Stats"]]
          .map(([c, t]) => '<button type="button" class="nw-onglet" role="tab" '
            + 'data-onglet="regression:' + c + '" aria-selected="' + (vue === c)
            + '">' + t + '</button>').join("")
        + '</div>';

      /* ── Données : le tableau à colonnes de la machine ───────────── */
      if (vue === "donnees") {
        const lignes = Math.max(1, ...G.series.map((S) => Math.max(S.X.length, S.Y.length)));
        let tete = '<th>#</th>';
        G.series.forEach((S, j) => {
          tete += '<th class="nw-col-' + COUL_SERIE[j] + '">X' + (j + 1) + '</th>'
                + '<th class="nw-col-' + COUL_SERIE[j] + '">Y' + (j + 1) + '</th>';
        });
        let corps = "";
        for (let i = 0; i < lignes; i++) {
          corps += '<tr><td>' + (i + 1) + '</td>';
          G.series.forEach((S, j) => {
            corps += '<td><input class="nw-cellule" data-cle="rx' + j + '_' + i
              + '" data-serie="' + j + '" data-axe="X" data-rang="' + i + '" value="'
              + ech(S.X[i] === undefined ? "" : S.X[i])
              + '" aria-label="X' + (j + 1) + ' ligne ' + (i + 1) + '"></td>'
              + '<td><input class="nw-cellule" data-cle="ry' + j + '_' + i
              + '" data-serie="' + j + '" data-axe="Y" data-rang="' + i + '" value="'
              + ech(S.Y[i] === undefined ? "" : S.Y[i])
              + '" aria-label="Y' + (j + 1) + ' ligne ' + (i + 1) + '"></td>';
          });
          corps += '</tr>';
        }
        return onglets
          + '<div class="nw-defile"><table class="nw-table nw-table-reg"><thead><tr>'
          + tete + '</tr></thead><tbody>' + corps + '</tbody></table></div>'
          + '<div class="nw-rangee" style="margin-top:.5rem">'
          + '<button type="button" class="nw-bouton" id="nw-rligne-plus">+ une ligne</button>'
          + '<button type="button" class="nw-bouton" id="nw-rligne-moins">− la dernière</button>'
          + '<button type="button" class="nw-bouton" id="nw-rserie-plus"'
          + (G.series.length >= 3 ? " disabled" : "") + '>+ une série</button>'
          + '<button type="button" class="nw-bouton" id="nw-rserie-moins"'
          + (G.series.length <= 1 ? " disabled" : "") + '>− la dernière série</button>'
          + '</div>'
          + '<p class="nw-sous">Une colonne vide ne compte pas : un point n\'existe '
          + 'que si <b>X et Y</b> sont tous deux renseignés sur la ligne.</p>';
      }

      /* ── les ajustements, calculés une fois pour les deux autres vues ── */
      const ajust = G.series.map((S) => CALC.ajuster(S.X, S.Y, S.modele));
      const deux = G.series.map((S) => CALC.STATS.deuxVariables(S.X, S.Y));
      const choixSerie = G.series.length < 2 ? "" :
        '<label for="nw-rserie">série</label>'
        + '<select class="nw-petit" id="nw-rserie">'
        + G.series.map((S, j) => '<option value="' + j + '"'
          + (G.actif === j ? " selected" : "") + '>X' + (j + 1) + ' / Y' + (j + 1)
          + '</option>').join("")
        + '</select>';

      /* ── Graphique : la barre de la machine, puis le tracé ───────── */
      if (vue === "graphique") {
        const tous = deux.filter(Boolean);
        if (!tous.length) {
          return onglets + '<p class="nw-vide">Il faut au moins deux points '
            + 'complets pour tracer quoi que ce soit.</p>';
        }
        const j = G.actif, r = ajust[j], d = deux[j];

        /* La barre : quatre entrées, dans l'ordre de la machine. « Auto »
           porte une pastille allumée ou éteinte — c'est un état, pas une
           action, et la machine le montre ainsi. */
        const barre = '<div class="nw-barre-outils" role="toolbar">'
          + '<button type="button" class="nw-outil" id="nw-auto" aria-pressed="'
          + (G.auto ? "true" : "false") + '">Auto <span class="nw-pastille'
          + (G.auto ? " nw-allumee" : "") + '" aria-hidden="true"></span></button>'
          + ['axes', "Axes", "naviguer", "Naviguer", "regression", "Régression"]
              .reduce((acc, _, i, t) => i % 2 ? acc.concat([[t[i - 1], t[i]]]) : acc, [])
              .map(([cle, lib]) => '<button type="button" class="nw-outil'
                + (G.panneau === cle ? " nw-ouvert" : "") + '" data-panneau="' + cle
                + '" aria-expanded="' + (G.panneau === cle) + '">' + lib + '</button>')
              .join("")
          + '</div>';

        /* La fenêtre : cadrée sur les données ET l'origine tant qu'« Auto »
           est allumé — sans l'origine, le nuage flotte sur une grille et on
           ne peut pas lire b. Éteint, ce sont les bornes de « Axes ». */
        const brut = (v, repli) => {
          const x = nombreSaisi(String(v));
          return x === null ? repli : x;
        };
        const xs = [].concat(...tous.map((e) => e.X), 0);
        /* En résidus, l'échelle des y est celle des ÉCARTS : reprendre celle
           des données écraserait le nuage sur une ligne. */
        const ys = G.residus
          ? [].concat(...deux.map((e, k) => {
              const r2 = ajust[k];
              return (!e || r2.erreur) ? []
                : e.X.map((x, i) => e.Y[i] - r2.f(x));
            }), 0)
          : [].concat(...tous.map((e) => e.Y), 0);
        const dx = Math.max(1e-9, Math.max(...xs) - Math.min(...xs));
        const dy = Math.max(1e-9, Math.max(...ys) - Math.min(...ys));
        let F;
        if (G.auto) {
          F = { xmin: Math.min(...xs) - dx * 0.1, xmax: Math.max(...xs) + dx * 0.1,
                ymin: Math.min(...ys) - dy * 0.15, ymax: Math.max(...ys) + dy * 0.15 };
        } else {
          F = { xmin: brut(G.fenetre.xmin, -10), xmax: brut(G.fenetre.xmax, 10),
                ymin: brut(G.fenetre.ymin, -10), ymax: brut(G.fenetre.ymax, 10) };
          if (F.xmax <= F.xmin) { F.xmin = -10; F.xmax = 10; }
          if (F.ymax <= F.ymin) { F.ymin = -10; F.ymax = 10; }
        }

        /* Les résidus : y − f(x), tracés contre x. Une droite qui ajuste bien
           donne un nuage de résidus SANS FORME ; s'il reste une courbure, le
           modèle choisi n'est pas le bon — et ça se voit là où ça ne se voit
           pas sur le nuage d'origine, parce que l'échelle des y y est cent
           fois plus grande que les écarts. C'est tout l'intérêt de la vue. */
        const points = [];
        deux.forEach((e, k) => {
          if (!e) return;
          const r2 = ajust[k];
          e.X.forEach((x, i) => points.push({
            x, y: G.residus ? (r2.erreur ? NaN : e.Y[i] - r2.f(x)) : e.Y[i],
            classe: COUL_SERIE[k] }));
        });
        if (G.residus) {
          for (let k = points.length - 1; k >= 0; k--)
            if (!Number.isFinite(points[k].y)) points.splice(k, 1);
        }
        /* Le point moyen (x̄ ; ȳ) : la machine le marque, et toute droite des
           moindres carrés y passe — la vérification visuelle la plus rapide
           qu'un ajustement affine n'est pas aberrant. */
        if (G.pointMoyen !== false && !G.residus) {
          deux.forEach((e, k) => {
            if (e) points.push({ x: e.moyenneX, y: e.moyenneY,
                                 classe: COUL_SERIE[k] + " nw-moyen" });
          });
        }
        /* Le curseur de « Naviguer » : un point de la série active. */
        let vise = null;
        if (G.panneau === "naviguer" && d) {
          const i = Math.min(Math.max(0, G.curseur | 0), d.X.length - 1);
          vise = { i, x: d.X[i], y: d.Y[i] };
        }
        const svg = tracer({
          xmin: F.xmin, xmax: F.xmax, ymin: F.ymin, ymax: F.ymax,
          /* En résidus, la seule ligne qui compte est y = 0 ; les courbes
             ajustées n'y ont aucun sens. « Supprimer le modèle » les retire
             aussi, pour regarder le nuage seul. */
          courbes: (G.residus || G.sansModele) ? []
            : ajust.map((e, k) => e.erreur ? null : { f: e.f, classe: COUL_SERIE[k] })
                   .filter(Boolean),
          points: points,
          curseur: vise ? { x: vise.x, y: vise.y } : null,
          aide: "Nuage de points, point moyen et courbes ajustées",
        });

        /* Le panneau ouvert sous la barre — un seul à la fois, comme un menu. */
        let panneau = "";
        if (G.panneau === "axes") {
          panneau = '<div class="nw-panneau"><div class="nw-rangee">'
            + ["xmin", "xmax", "ymin", "ymax"].map((c) =>
                '<label for="nw-f-' + c + '">' + c + '</label>'
                + '<input type="text" class="nw-petit nw-court" id="nw-f-' + c
                + '" data-fenetre="' + c + '" value="' + ech(G.fenetre[c]) + '"'
                + (G.auto ? " disabled" : "") + '>').join("")
            + '</div>'
            + (G.auto ? '<p class="nw-sous">« Auto » est allumé : la fenêtre suit '
                        + 'les données. Éteignez-le pour saisir des bornes.</p>' : "")
            + '</div>';
        } else if (G.panneau === "naviguer") {
          panneau = '<div class="nw-panneau"><div class="nw-rangee">'
            + choixSerie
            + '<button type="button" class="nw-bouton" id="nw-prec">◀ précédent</button>'
            + '<button type="button" class="nw-bouton" id="nw-suiv">suivant ▶</button>'
            + '</div></div>';
        } else if (G.panneau === "regression") {
          panneau = '<div class="nw-panneau"><div class="nw-rangee">' + choixSerie
            + '<label for="nw-modele">modèle</label>'
            + '<select class="nw-petit" id="nw-modele">'
            + Object.keys(CALC.MODELES).map((k) => '<option value="' + k + '"'
              + (G.series[j].modele === k ? " selected" : "") + '>'
              + ech(CALC.MODELES[k].titre) + ' — ' + ech(CALC.MODELES[k].forme)
              + '</option>').join("")
            + '</select>'
            + '<label class="nw-case"><input type="checkbox" id="nw-moyen"'
            + (G.pointMoyen !== false ? " checked" : "") + '> Point moyen</label>'
            + '</div><div class="nw-rangee">'
            + '<label class="nw-case"><input type="checkbox" id="nw-residus"'
            + (G.residus ? " checked" : "") + '> Graphique des résidus</label>'
            + '<label class="nw-case"><input type="checkbox" id="nw-sans-modele"'
            + (G.sansModele ? " checked" : "") + '> Supprimer le modèle</label>'
            + '</div></div>';
        }

        /* Le bandeau du bas : ce que la machine y met — le point visé quand on
           navigue, le point moyen sinon. */
        const bandeau = vise
          ? '<p class="nw-moyenne">Point ' + (vise.i + 1) + ' sur ' + d.X.length
            + ' &#8195; x = ' + ech(fmt(vise.x)) + ' &#8195; y = ' + ech(fmt(vise.y))
            + (r.erreur ? "" : ' &#8195; résidu = ' + ech(fmt(vise.y - r.f(vise.x)))) + '</p>'
          : (d ? '<p class="nw-moyenne">Point moyen &#8195; x&#772; = ' + ech(fmt(d.moyenneX))
                 + ' &#8195; y&#772; = ' + ech(fmt(d.moyenneY)) + '</p>' : "");

        return onglets + barre + panneau + svg
          + '<p class="nw-equation">' + (r.erreur
              ? '<b>Les données ne conviennent pas</b> — ' + ech(r.erreur)
              : (G.residus ? 'Résidus de X' + (j + 1) + '/Y' + (j + 1)
                             + ' — y = ' + ech(r.forme)
                           : 'X' + (j + 1) + '/Y' + (j + 1) + ' : y = ' + ech(r.forme)))
          + '</p>'
          + bandeau
          + '<div class="nw-rangee" style="margin-top:.6rem">'
          + '<label for="nw-pred">prédiction sachant X</label>'
          + '<input type="text" class="nw-petit" id="nw-pred" value="' + ech(G.pred || "") + '">'
          + '<span class="nw-resultat" style="text-align:left">'
          + (G.pred !== undefined && G.pred !== "" && !r.erreur
              ? (() => { const x = nombreSaisi(G.pred);
                         return x === null ? "—" : "y = " + ech(fmt(r.f(x))); })()
              : "") + '</span></div>'
          + '<div class="nw-rangee">'
          + '<label for="nw-predy">prédiction sachant Y</label>'
          + '<input type="text" class="nw-petit" id="nw-predy" value="' + ech(G.predY || "") + '">'
          + '<span class="nw-resultat" style="text-align:left">'
          + (G.predY !== undefined && G.predY !== "" && !r.erreur
              ? (() => {
                  const y = nombreSaisi(G.predY);
                  if (y === null) return "—";
                  /* On cherche x tel que f(x) = y en balayant la fenêtre puis en
                     coupant en deux. Sans monotonie garantie — la trigonométrique
                     n'en a pas — c'est le PREMIER x trouvé, et la machine dit la
                     même chose : « dans cette fenêtre ». */
                  const g = (x) => r.f(x) - y;
                  let pa = F.xmin, ga = g(F.xmin), trouve = null;
                  for (let k = 1; k <= 600; k++) {
                    const pb = F.xmin + (F.xmax - F.xmin) * k / 600, gb = g(pb);
                    if (Number.isFinite(ga) && Number.isFinite(gb) && ga * gb <= 0) {
                      let lo = pa, hi = pb;
                      for (let it = 0; it < 80; it++) {
                        const mi = (lo + hi) / 2;
                        if (g(lo) * g(mi) <= 0) hi = mi; else lo = mi;
                      }
                      trouve = (lo + hi) / 2; break;
                    }
                    pa = pb; ga = gb;
                  }
                  return trouve === null
                    ? "valeur non atteinte dans cette fenêtre"
                    : "x = " + ech(fmt(trouve));
                })()
              : "") + '</span></div>';
      }

      /* ── Stats : une COLONNE par série, comme sur la machine ─────── */
      const lettres = "abcde".split("");
      const maxP = Math.max(...ajust.map((r) => r.erreur ? 0 : r.params.length));
      const rangs = [
        ["nombre de points", (d) => d ? String(d.n) : "—"],
        ["moyenne x̄", (d) => d ? fmt(d.moyenneX) : "—"],
        ["moyenne ȳ", (d) => d ? fmt(d.moyenneY) : "—"],
        ["écart type σx", (d) => d ? fmt(d.ecartTypeX) : "—"],
        ["écart type σy", (d) => d ? fmt(d.ecartTypeY) : "—"],
        ["somme Σx", (d) => d ? fmt(d.sommeX) : "—"],
        ["somme Σy", (d) => d ? fmt(d.sommeY) : "—"],
        ["somme des produits Σxy", (d) => d ? fmt(d.sommeXY) : "—"],
        ["covariance", (d) => d ? fmt(d.covariance) : "—"],
      ];
      let corps = '<tr><th scope="row">modèle</th>'
        + ajust.map((r) => '<td>' + (r.erreur ? "—" : "y = " + ech(r.forme)) + '</td>').join("")
        + '</tr>';
      for (let k = 0; k < maxP; k++) {
        corps += '<tr><th scope="row">' + lettres[k] + '</th>'
          + ajust.map((r) => '<td>' + (r.erreur || r.params[k] === undefined
              ? "—" : ech(fmt(r.params[k]))) + '</td>').join("") + '</tr>';
      }
      /* L'écart-type résiduel : la machine l'affiche, et c'est lui qui dit
         en UNITÉS DE Y ce que r² dit sans unité. Un r² de 0,98 sur des prix
         en euros ne renseigne pas ; « on se trompe de 1,20 € en moyenne » si. */
      corps += '<tr><th scope="row">écart-type résiduel</th>'
        + ajust.map((r, j) => {
            const d2 = deux[j];
            if (r.erreur || !d2) return '<td>—</td>';
            let sse = 0;
            for (let i = 0; i < d2.X.length; i++) sse += (d2.Y[i] - r.f(d2.X[i])) ** 2;
            return '<td>' + ech(fmt(Math.sqrt(sse / d2.n))) + '</td>';
          }).join("") + '</tr>';
      corps += '<tr><th scope="row">coeff. corrélation r</th>'
        + ajust.map((r) => '<td>' + (r.erreur || r.r === undefined ? "—"
            : ech(fmt(r.r))) + '</td>').join("") + '</tr>'
        + '<tr><th scope="row">coeff. détermination r²</th>'
        + ajust.map((r) => '<td>' + (r.erreur ? "—" : ech(fmt(r.r2))) + '</td>').join("")
        + '</tr>';
      rangs.forEach(([lib, f]) => {
        corps += '<tr><th scope="row">' + lib + '</th>'
          + deux.map((d) => '<td>' + ech(f(d)) + '</td>').join("") + '</tr>';
      });
      const erreurs = ajust.map((r, j) => r.erreur
        ? 'X' + (j + 1) + '/Y' + (j + 1) + ' : ' + r.erreur : null).filter(Boolean);
      return onglets
        + '<div class="nw-defile"><table class="nw-table nw-table-reg"><thead><tr><th></th>'
        + G.series.map((S, j) => '<th class="nw-col-' + COUL_SERIE[j] + '">X' + (j + 1)
            + '/Y' + (j + 1) + '</th>').join("")
        + '</tr></thead><tbody>' + corps + '</tbody></table></div>'
        + (erreurs.length ? '<p class="nw-erreur">' + ech(erreurs.join(" · ")) + '</p>' : "")
        + '<p class="nw-sous">r² est calculé sur les <b>points d\'origine</b>, jamais sur '
        + 'les données transformées : un ajustement exponentiel qui paraît parfait en '
        + 'échelle logarithmique peut être médiocre sur les vraies ordonnées.</p>';
    },
    apres() {
      brancherOnglets();
      const G = ETAT.regression;
      const m = $("#nw-modele");
      if (m) m.addEventListener("change", () => {
        G.series[G.actif].modele = m.value; garder(); redessiner();
      });
      const se = $("#nw-rserie");
      if (se) se.addEventListener("change", () => {
        G.actif = Number(se.value); garder(); redessiner();
      });
      $$("[data-serie]", page).forEach((c) => c.addEventListener("change", () => {
        const j = Number(c.dataset.serie), i = Number(c.dataset.rang), axe = c.dataset.axe;
        /* Une cellule vidée retire le point : sans ça, on ne pourrait plus
           jamais raccourcir une série autrement que par le bouton. */
        if (c.value.trim() === "") {
          G.series[j][axe][i] = undefined; dire(""); garder(); redessiner(); return;
        }
        const v = nombreSaisi(c.value);
        if (v === null) { dire("« " + c.value + " » n'est pas un nombre.", "e-erreur"); return; }
        G.series[j][axe][i] = v; dire(""); garder(); redessiner();
      }));
      const p = $("#nw-rligne-plus");
      if (p) p.addEventListener("click", () => {
        const n = Math.max(...G.series.map((S) => Math.max(S.X.length, S.Y.length)));
        G.series.forEach((S) => { S.X[n] = undefined; S.Y[n] = undefined;
                                  S.X.length = n + 1; S.Y.length = n + 1; });
        garder(); redessiner();
      });
      const mo = $("#nw-rligne-moins");
      if (mo) mo.addEventListener("click", () => {
        const n = Math.max(...G.series.map((S) => Math.max(S.X.length, S.Y.length)));
        if (n <= 2) { dire("Deux lignes au minimum.", "e-erreur"); return; }
        G.series.forEach((S) => { S.X.length = Math.min(S.X.length, n - 1);
                                  S.Y.length = Math.min(S.Y.length, n - 1); });
        garder(); redessiner();
      });
      const sp = $("#nw-rserie-plus");
      if (sp) sp.addEventListener("click", () => {
        if (G.series.length >= 3) return;
        G.series.push({ X: [], Y: [], modele: "lineaire" });
        G.actif = G.series.length - 1; garder(); redessiner();
      });
      const sm = $("#nw-rserie-moins");
      if (sm) sm.addEventListener("click", () => {
        if (G.series.length <= 1) return;
        G.series.pop();
        G.actif = Math.min(G.actif, G.series.length - 1); garder(); redessiner();
      });
      const au = $("#nw-auto");
      if (au) au.addEventListener("click", () => {
        G.auto = !G.auto; garder(); redessiner();
      });
      $$("[data-panneau]", page).forEach((b2) => b2.addEventListener("click", () => {
        /* Un deuxième clic referme : c'est un menu, pas un onglet. */
        G.panneau = G.panneau === b2.dataset.panneau ? "" : b2.dataset.panneau;
        if (G.panneau === "naviguer" && G.curseur === null) G.curseur = 0;
        garder(); redessiner();
      }));
      $$("[data-fenetre]", page).forEach((c) => c.addEventListener("change", () => {
        G.fenetre[c.dataset.fenetre] = c.value; garder(); redessiner();
      }));
      const pas = (sens) => {
        const S = G.series[G.actif];
        const n = CALC.STATS.deuxVariables(S.X, S.Y);
        if (!n) return;
        G.curseur = Math.min(Math.max(0, (G.curseur | 0) + sens), n.X.length - 1);
        garder(); redessiner();
      };
      const pv = $("#nw-prec"); if (pv) pv.addEventListener("click", () => pas(-1));
      const sv = $("#nw-suiv"); if (sv) sv.addEventListener("click", () => pas(1));
      const pm = $("#nw-moyen");
      if (pm) pm.addEventListener("change", () => {
        G.pointMoyen = pm.checked; garder(); redessiner();
      });
      const rs = $("#nw-residus");
      if (rs) rs.addEventListener("change", () => {
        G.residus = rs.checked; garder(); redessiner();
      });
      const sm2 = $("#nw-sans-modele");
      if (sm2) sm2.addEventListener("change", () => {
        G.sansModele = sm2.checked; garder(); redessiner();
      });
      [["#nw-pred", "pred"], ["#nw-predy", "predY"]].forEach(([sel, cle]) => {
        const c = $(sel);
        if (!c) return;
        const maj = () => { G[cle] = c.value; garder(); redessiner(); };
        c.addEventListener("change", maj);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") maj(); });
      });
    },
  };

  /* ═══════════════ 11. Probabilités ══════════════════════════════════
     C'est l'application la plus utile des trois chapitres de
     probabilités, et la plus facile à rater : la machine ne sait
     calculer que P(X = k) et P(X ⩽ k), et tout l'exercice consiste à
     ramener la question à l'une des deux. Cette application fait la
     conversion À L'ÉCRAN et l'écrit : « P(X ⩾ k) = 1 − P(X ⩽ k−1) ».
     Qui l'a lue une fois ne l'oublie plus — et c'est elle qui est
     demandée en contrôle, pas le chiffre. */
  const dicho = (cdf, cible, lo, hi) => {
    for (let i = 0; i < 200; i++) {
      const m = (lo + hi) / 2;
      if (cdf(m) < cible) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  };
  const LOIS_UI = {
    binomiale: {
      nom: "Binomiale B(n ; p)", discrete: true, params: ["n", "p"],
      chapitre: ["08-variables-aleatoires-loi-binomiale", "Loi binomiale"],
      pdf: (P, k) => CALC.LOIS.binomialePdf(P.n, P.p, k),
      cdf: (P, k) => CALC.LOIS.binomialeCdf(P.n, P.p, k),
      inv: (P, q) => CALC.LOIS.invBinomiale(P.n, P.p, q),
      domaine: (P) => [0, Math.max(1, P.n)],
      esperance: (P) => P.n * P.p, ecart: (P) => Math.sqrt(P.n * P.p * (1 - P.p)),
    },
    normale: {
      nom: "Normale N(µ ; σ)", discrete: false, params: ["mu", "sigma"],
      chapitre: ["10-loi-normale", "Loi normale"],
      pdf: (P, x) => CALC.LOIS.normalePdf(x, P.mu, P.sigma),
      cdf: (P, x) => CALC.LOIS.normaleCdf(x, P.mu, P.sigma),
      inv: (P, q) => CALC.LOIS.invNormale(q, P.mu, P.sigma),
      domaine: (P) => [P.mu - 4 * P.sigma, P.mu + 4 * P.sigma],
      esperance: (P) => P.mu, ecart: (P) => P.sigma,
    },
    uniforme: {
      nom: "Uniforme sur [a ; b]", discrete: false, params: ["a", "b"],
      chapitre: ["09-lois-uniforme-exponentielle", "Lois uniforme et exponentielle"],
      pdf: (P, x) => (x >= P.a && x <= P.b ? 1 / (P.b - P.a) : 0),
      cdf: (P, x) => CALC.LOIS.uniformeCdf(x, P.a, P.b),
      inv: (P, q) => P.a + q * (P.b - P.a),
      domaine: (P) => [P.a - (P.b - P.a) * 0.15, P.b + (P.b - P.a) * 0.15],
      esperance: (P) => (P.a + P.b) / 2, ecart: (P) => (P.b - P.a) / Math.sqrt(12),
    },
    exponentielle: {
      nom: "Exponentielle de paramètre λ", discrete: false, params: ["lambda"],
      chapitre: ["09-lois-uniforme-exponentielle", "Lois uniforme et exponentielle"],
      pdf: (P, x) => CALC.LOIS.expoPdf(P.lambda, x),
      cdf: (P, x) => CALC.LOIS.expoCdf(P.lambda, x),
      inv: (P, q) => CALC.LOIS.invExpo(q, P.lambda),
      domaine: (P) => [0, 5 / P.lambda],
      esperance: (P) => 1 / P.lambda, ecart: (P) => 1 / P.lambda,
    },
    poisson: {
      nom: "Poisson de paramètre λ", discrete: true, params: ["lambda"],
      pdf: (P, k) => CALC.LOIS.poissonPdf(P.lambda, k),
      cdf: (P, k) => CALC.LOIS.poissonCdf(P.lambda, k),
      inv: (P, q) => { let s = 0;
        for (let k = 0; k < 100000; k++) { s += CALC.LOIS.poissonPdf(P.lambda, k);
          if (s >= q - 1e-12) return k; } return 0; },
      domaine: (P) => [0, Math.ceil(P.lambda + 4 * Math.sqrt(P.lambda) + 3)],
      esperance: (P) => P.lambda, ecart: (P) => Math.sqrt(P.lambda),
    },
    geometrique: {
      nom: "Géométrique de paramètre p", discrete: true, params: ["p"], premier: 1,
      pdf: (P, k) => CALC.LOIS.geomPdf(P.p, k),
      cdf: (P, k) => CALC.LOIS.geomCdf(P.p, k),
      inv: (P, q) => Math.max(1, Math.ceil(Math.log1p(-q) / Math.log1p(-P.p))),
      domaine: (P) => [1, Math.max(5, Math.ceil(5 / P.p))],
      esperance: (P) => 1 / P.p, ecart: (P) => Math.sqrt((1 - P.p) / (P.p * P.p)),
    },
    hypergeometrique: {
      nom: "Hypergéométrique H(N ; K ; n)", discrete: true, params: ["N", "K", "n"],
      pdf: (P, k) => CALC.LOIS.hyperPdf(P.N, P.K, P.n, k),
      cdf: (P, k) => CALC.LOIS.hyperCdf(P.N, P.K, P.n, k),
      inv: (P, q) => { let s = 0;
        for (let k = 0; k <= P.n; k++) { s += CALC.LOIS.hyperPdf(P.N, P.K, P.n, k);
          if (s >= q - 1e-12) return k; } return P.n; },
      domaine: (P) => [Math.max(0, P.n - (P.N - P.K)), Math.min(P.n, P.K)],
      esperance: (P) => P.n * P.K / P.N,
      ecart: (P) => Math.sqrt(P.n * (P.K / P.N) * (1 - P.K / P.N) * (P.N - P.n) / (P.N - 1)),
    },
    student: {
      nom: "Student à ν degrés", discrete: false, params: ["nu"],
      pdf: (P, x) => Math.exp(CALC.num.lgamma((P.nu + 1) / 2) - CALC.num.lgamma(P.nu / 2))
        / Math.sqrt(P.nu * Math.PI) * Math.pow(1 + x * x / P.nu, -(P.nu + 1) / 2),
      cdf: (P, x) => CALC.LOIS.studentCdf(x, P.nu),
      inv: (P, q) => dicho((x) => CALC.LOIS.studentCdf(x, P.nu), q, -200, 200),
      domaine: () => [-4.5, 4.5], esperance: () => 0,
      ecart: (P) => (P.nu > 2 ? Math.sqrt(P.nu / (P.nu - 2)) : NaN),
    },
    khi2: {
      nom: "Khi deux à k degrés", discrete: false, params: ["nu"],
      pdf: (P, x) => x <= 0 ? 0 : Math.exp(-(P.nu / 2) * Math.LN2 - CALC.num.lgamma(P.nu / 2)
        + (P.nu / 2 - 1) * Math.log(x) - x / 2),
      cdf: (P, x) => CALC.LOIS.khi2Cdf(x, P.nu),
      inv: (P, q) => dicho((x) => CALC.LOIS.khi2Cdf(x, P.nu), q, 0, 2000),
      domaine: (P) => [0, P.nu + 5 * Math.sqrt(2 * P.nu) + 6],
      esperance: (P) => P.nu, ecart: (P) => Math.sqrt(2 * P.nu),
    },
    fisher: {
      nom: "Fisher F(d₁ ; d₂)", discrete: false, params: ["d1", "d2"],
      pdf: (P, x) => { if (x <= 0) return 0;
        const a = P.d1 / 2, b = P.d2 / 2;
        return Math.exp(CALC.num.lgamma(a + b) - CALC.num.lgamma(a) - CALC.num.lgamma(b)
          + a * Math.log(P.d1 / P.d2) + (a - 1) * Math.log(x)
          - (a + b) * Math.log1p(P.d1 * x / P.d2)); },
      cdf: (P, x) => CALC.LOIS.fisherCdf(x, P.d1, P.d2),
      inv: (P, q) => dicho((x) => CALC.LOIS.fisherCdf(x, P.d1, P.d2), q, 0, 5000),
      domaine: () => [0, 6], esperance: (P) => (P.d2 > 2 ? P.d2 / (P.d2 - 2) : NaN),
      ecart: () => NaN,
    },
  };
  const LIB_PARAM = { n: "n", p: "p", mu: "µ", sigma: "σ", lambda: "λ", a: "a", b: "b",
                      N: "N", K: "K", nu: "ν", d1: "d₁", d2: "d₂" };

  /* ── les quatre vignettes ─────────────────────────────────────────────
     Signalé, capture de l'émulateur à l'appui : « comment ça question ?
     dans l'émulateur on a des graphs qui montrent ce qu'on veut ». C'est
     exact. La machine ne demande pas « quelle question » dans un menu
     déroulant : elle montre quatre petits dessins de la même courbe, avec
     une zone noircie différente, et on choisit le dessin qui ressemble à
     ce qu'on cherche. Le dessin EST la question.

     Un menu déroulant oblige à traduire « P(X ⩽ k) » en français, puis le
     français en image mentale. Les deux traductions sautent. */
  const COURBE_VQ = "M1 16.4C7 16.4 8 3.2 14 3.2C20 3.2 21 16.4 27 16.4";
  const AIRE_VQ = COURBE_VQ + "L27 16.4L1 16.4Z";
  const ZONES_VQ = { inf: [0, 11], entre: [9, 10], sup: [17, 11] };
  function vignetteQuestion(forme) {
    let dedans;
    if (forme === "egal") {
      dedans = '<rect class="vq-plein" x="13.1" y="3.4" width="1.8" height="13"/>';
    } else {
      const z = ZONES_VQ[forme], id = "vq-" + forme;
      dedans = '<clipPath id="' + id + '"><rect x="' + z[0] + '" y="0" width="' + z[1]
        + '" height="18"/></clipPath><path class="vq-plein" d="' + AIRE_VQ
        + '" clip-path="url(#' + id + ')"/>';
    }
    return '<svg class="nw-vq" viewBox="0 0 28 18" aria-hidden="true">' + dedans
      + '<path class="vq-trait" d="' + COURBE_VQ + '"/></svg>';
  }

  /* Le nom en toutes lettres de chaque paramètre. La machine écrit
     « n — Nombre de répétitions » sous le champ, et c'est la moitié du
     cours : un élève qui sait ce que n DÉSIGNE ne se trompe plus de
     place. « n » tout seul ne désigne rien. */
  const DESC_PARAM = {
    binomiale: { n: "Nombre de répétitions", p: "Probabilité de succès" },
    normale: { mu: "Moyenne", sigma: "Écart type" },
    uniforme: { a: "Borne inférieure", b: "Borne supérieure" },
    exponentielle: { lambda: "Taux — l'inverse de la durée moyenne" },
    poisson: { lambda: "Nombre moyen d'événements sur la période" },
    geometrique: { p: "Probabilité de succès à chaque essai" },
    hypergeometrique: { N: "Taille de la population", K: "Nombre d'individus favorables",
                        n: "Taille du tirage, sans remise" },
    student: { nu: "Degrés de liberté" },
    khi2: { nu: "Degrés de liberté" },
    fisher: { d1: "Degrés de liberté du numérateur",
              d2: "Degrés de liberté du dénominateur" },
  };

  APPS.probas = {
    nom: "Probabilités", icone: "P(X)",
    html() {
      const P = ETAT.probas, L = LOIS_UI[P.loi];
      const q = P.question;
      const discret = L.discrete;
      const conversions = {
        egal: discret ? "P(X = k)" : "P(X = x) = 0 pour une loi continue",
        inf: "P(X ⩽ " + (discret ? "k" : "x") + ")",
        sup: discret ? "P(X ⩾ k) = 1 − P(X ⩽ k−1)" : "P(X ⩾ x) = 1 − P(X ⩽ x)",
        entre: discret ? "P(a ⩽ X ⩽ b) = P(X ⩽ b) − P(X ⩽ a−1)"
                       : "P(a ⩽ X ⩽ b) = P(X ⩽ b) − P(X ⩽ a)",
        inverse: discret ? "le plus petit k tel que P(X ⩽ k) ⩾ seuil"
                         : "le x tel que P(X ⩽ x) = seuil",
      };
      let valeur = NaN, formule = conversions[q];
      const k = P.k, k2 = P.k2;
      try {
        if (q === "egal") valeur = discret ? L.pdf(P, k) : 0;
        else if (q === "inf") valeur = L.cdf(P, k);
        else if (q === "sup") valeur = 1 - L.cdf(P, discret ? k - 1 : k);
        else if (q === "entre") valeur = L.cdf(P, k2) - L.cdf(P, discret ? k - 1 : k);
        else valeur = L.inv(P, P.seuil);
      } catch (e) { valeur = NaN; }
      const dom = L.domaine(P);
      let svg = "";
      if (discret) {
        const [d0, d1] = dom;
        const total = d1 - d0 + 1;
        /* Au-delà de soixante barres on ne distingue plus rien : on
           centre alors la vue sur l'espérance, et on le DIT. */
        const centre = Math.round(L.esperance(P));
        const bas = total > 60 ? Math.max(d0, centre - 30) : d0;
        const haut = total > 60 ? Math.min(d1, centre + 30) : d1;
        const barres = [];
        let hmax = 0;
        for (let i = bas; i <= haut; i++) {
          const h = L.pdf(P, i);
          if (!Number.isFinite(h)) continue;
          hmax = Math.max(hmax, h);
          const dedans = q === "egal" ? i === k
            : q === "inf" ? i <= k
            : q === "sup" ? i >= k
            : q === "entre" ? (i >= k && i <= k2) : false;
          barres.push({ x0: i - 0.42, x1: i + 0.42, h,
                        classe: dedans ? "barre-choisie" : "barre" });
        }
        svg = tracer({ xmin: bas - 1, xmax: haut + 1, ymin: 0, ymax: (hmax || 1) * 1.15,
                       barres, aide: "Diagramme en bâtons de la loi" })
          + (total > 60 ? '<p class="nw-sous">Vue centrée sur l\'espérance : '
              + total + ' valeurs possibles, trop pour être toutes lisibles.</p>' : "");
      } else {
        const aires = [];
        if (q === "inf") aires.push({ f: (x) => L.pdf(P, x), a: dom[0], b: Math.min(k, dom[1]) });
        else if (q === "sup") aires.push({ f: (x) => L.pdf(P, x), a: Math.max(k, dom[0]), b: dom[1] });
        else if (q === "entre") aires.push({ f: (x) => L.pdf(P, x), a: k, b: k2 });
        else if (q === "inverse" && Number.isFinite(valeur))
          aires.push({ f: (x) => L.pdf(P, x), a: dom[0], b: Math.min(valeur, dom[1]) });
        let hmax = 0;
        for (let i = 0; i <= 100; i++)
          hmax = Math.max(hmax, L.pdf(P, dom[0] + (dom[1] - dom[0]) * i / 100) || 0);
        svg = tracer({ xmin: dom[0], xmax: dom[1], ymin: 0, ymax: (hmax || 1) * 1.15,
                       courbes: [{ f: (x) => L.pdf(P, x) }], aires,
                       aide: "Densité de la loi et aire correspondant à la probabilité" });
      }
      /* ── trois zones, comme la machine ─────────────────────────────
         Signalé : « mets loi en haut et puis juste en bas n p ». La loi
         et ses paramètres tenaient sur une seule ligne, qui passait à la
         ligne n'importe où : le « p » restait seul au bout d'un rang et
         son champ tombait au rang suivant. Une étiquette séparée de son
         champ ne désigne plus rien.

         Donc trois zones empilées, et chacune occupe toute la largeur :
         la LOI, puis les PARAMÈTRES — un par ligne, avec leur nom écrit
         en toutes lettres —, puis la QUESTION, qui se choisit par un
         dessin et s'écrit comme une équation. */
      const E = L.esperance ? L.esperance(P) : NaN, S = L.ecart ? L.ecart(P) : NaN;
      const champs = L.params.map((nom) => '<div class="nw-par">'
        + '<label for="nw-pp-' + nom + '"><b>' + ech(LIB_PARAM[nom] || nom) + '</b>'
        + '<i>' + ech((DESC_PARAM[P.loi] || {})[nom] || "") + '</i></label>'
        + '<input type="text" class="nw-petit" id="nw-pp-' + nom + '" data-pp="' + nom
        + '" value="' + ech(P[nom]) + '" inputmode="decimal" autocomplete="off">'
        + '</div>').join("");

      /* Les formes possibles. Pour une loi continue, P(X = x) vaut zéro :
         la vignette « un seul bâton » n'est pas proposée, et on dit
         pourquoi plutôt que de la laisser donner 0 sans un mot. */
      const FORMES = [["inf", "P(X ⩽ …)"], ["entre", "P(… ⩽ X ⩽ …)"],
                      ["sup", "P(X ⩾ …)"]].concat(discret ? [["egal", "P(X = …)"]] : []);
      const choix = '<div class="nw-formes" role="group" aria-label="Ce qu\'on cherche">'
        + FORMES.map(([f, t]) => '<button type="button" class="nw-forme'
            + (q === f ? " nw-choisie" : "") + '" data-forme="' + f + '" title="' + t
            + '" aria-label="' + t + '" aria-pressed="' + (q === f) + '">'
            + vignetteQuestion(f) + '</button>').join("")
        + '</div>';

      const champK = (cle, val) => '<input type="text" class="nw-petit nw-court" data-pp="'
        + cle + '" value="' + ech(val) + '" inputmode="decimal" autocomplete="off" '
        + 'aria-label="' + (cle === "k2" ? "borne haute" : "borne") + '">';
      /* Le résultat est un CHAMP, pas un texte : y écrire une probabilité
         fait le calcul inverse — « quelle valeur de k donne 0,5 ? ». La
         machine le fait, et c'est exactement la question d'un énoncé qui
         demande un seuil. Il n'est saisissable que là où la réponse est
         unique : sur « = » et sur un encadrement, deux bornes pour une
         seule probabilité, il y aurait une infinité de réponses. */
      const inversable = q === "inf" || q === "sup";
      const champRes = '<input type="text" class="nw-petit nw-res" data-pres '
        + (inversable ? "" : "readonly ") + 'value="'
        + ech(Number.isFinite(valeur) ? fmt(valeur) : "—") + '" inputmode="decimal" '
        + 'autocomplete="off" aria-label="probabilité">';
      const V = discret ? "X" : "X";
      const equation = '<div class="nw-equation">' + choix
        + '<span class="nw-eq">P(' + (q === "entre" ? champK("k", P.k) + " ⩽ " + V + " ⩽ "
              + champK("k2", P.k2)
            : V + (q === "inf" ? " ⩽ " : q === "sup" ? " ⩾ " : " = ") + champK("k", P.k))
        + ') =</span>' + champRes + '</div>';

      return '<div class="nw-proba-tete">'
        + '<label for="nw-loi" class="nw-proba-lib">loi</label>'
        + '<select class="nw-petit nw-loi" id="nw-loi">'
        + Object.keys(LOIS_UI).map((c) => '<option value="' + c + '"'
          + (P.loi === c ? " selected" : "") + '>' + ech(LOIS_UI[c].nom) + '</option>').join("")
        + '</select></div>'
        + '<div class="nw-params">' + champs + '</div>'
        + equation
        + svg
        + '<dl class="nw-valeurs">'
        + (Number.isFinite(E) ? '<dt>espérance E(X)</dt><dd>' + ech(fmt(E)) + '</dd>' : "")
        + (Number.isFinite(S) ? '<dt>écart type σ(X)</dt><dd>' + ech(fmt(S)) + '</dd>' : "")
        + '</dl>'
        + '<p class="nw-sous">' + ech(formule)
        + (inversable ? ' — et le champ du résultat se remplit aussi : '
            + 'écrivez une probabilité, la borne se calcule.' : "")
        + (!discret ? ' Pour une loi continue, la probabilité d\'une valeur EXACTE est '
            + 'nulle : seules les probabilités d\'intervalles ont un sens.' : "")
        + '</p>'
        + lienChapitre(L.chapitre);
    },
    apres() {
      const loi = $("#nw-loi");
      if (loi) loi.addEventListener("change", () => {
        ETAT.probas.loi = loi.value;
        const L = LOIS_UI[loi.value];
        if (!L.discrete && ETAT.probas.question === "egal") ETAT.probas.question = "inf";
        if (L.premier === 1 && ETAT.probas.k < 1) ETAT.probas.k = 1;
        garder(); redessiner();
      });
      $$("[data-forme]", page).forEach((b) => b.addEventListener("click", () => {
        ETAT.probas.question = b.dataset.forme; garder(); redessiner();
      }));
      /* ── le calcul inverse, dans l'équation ────────────────────────
         Écrire une probabilité dans le champ du résultat demande la
         borne qui la donne. C'est ce que fait la machine, et c'est la
         question des énoncés : « à partir de combien de pièces la
         probabilité dépasse-t-elle 0,95 ? »

         Sur une loi DISCRÈTE, la réponse exacte n'existe presque jamais :
         P(X ⩽ 9) vaut 0,41 et P(X ⩽ 10) vaut 0,59, rien ne vaut 0,5. On
         rend donc le plus petit k qui ATTEINT le seuil, et on réaffiche
         aussitôt la probabilité vraie — sinon l'écran montrerait 0,5 là
         où la machine calcule 0,588, et ce serait un mensonge d'un seul
         chiffre, le pire genre. */
      const res = $("[data-pres]");
      if (res && !res.readOnly) {
        const inverser = () => {
          const P = ETAT.probas, L = LOIS_UI[P.loi];
          const cible = nombreSaisi(res.value);
          if (cible === null) { dire("« " + res.value + " » n'est pas un nombre.", "e-erreur"); return; }
          if (cible < 0 || cible > 1) { dire("Une probabilité est entre 0 et 1.", "e-erreur"); return; }
          let k;
          try {
            k = P.question === "inf" ? L.inv(P, cible)
              : L.discrete ? L.inv(P, 1 - cible) + 1 : L.inv(P, 1 - cible);
          } catch (e) { k = NaN; }
          if (!Number.isFinite(k)) {
            dire("Aucune borne ne donne cette probabilité.", "e-erreur"); return;
          }
          ETAT.probas.k = L.discrete ? Math.round(k) : k;
          dire(""); garder(); redessiner();
        };
        res.addEventListener("change", inverser);
        res.addEventListener("keydown", (e) => { if (e.key === "Enter") inverser(); });
      }
      $$("[data-pp]", page).forEach((c) => {
        const maj = () => {
          const v = nombreSaisi(c.value);
          if (v === null) { dire("« " + c.value + " » n'est pas un nombre.", "e-erreur"); return; }
          const nom = c.dataset.pp;
          if ((nom === "p" || nom === "seuil") && (v < 0 || v > 1)) {
            dire("Une probabilité est entre 0 et 1.", "e-erreur"); return;
          }
          if ((nom === "sigma" || nom === "lambda") && v <= 0) {
            dire("Ce paramètre est strictement positif.", "e-erreur"); return;
          }
          if (nom === "n" && (!Number.isInteger(v) || v < 0)) {
            dire("n est un entier positif.", "e-erreur"); return;
          }
          ETAT.probas[nom] = v; dire(""); garder(); redessiner();
        };
        c.addEventListener("change", maj);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") maj(); });
      });
    },
  };

  /* ═══════════════ 12. Équations ═════════════════════════════════════ */
  APPS.equations = {
    nom: "Equations", icone: "x=?",
    chapitre: ["03-fonctions-variations", "Fonctions et variations"],
    html() {
      const E = ETAT.equations;
      const choix = '<div class="nw-onglets">'
        + [["polynome", "Polynôme"], ["systeme", "Système linéaire"],
           ["quelconque", "Équation quelconque"]].map(([v, t]) =>
          '<button type="button" class="nw-onglet" data-emode="' + v + '" aria-selected="'
          + (E.mode === v) + '">' + t + '</button>').join("") + '</div>';
      if (E.mode === "quelconque") {
        /* Deux expressions, un intervalle, et des solutions APPROCHÉES. Le
           mot compte : on ne rend pas une forme exacte, on rend des nombres
           trouvés par changement de signe puis dichotomie. Annoncer « x =
           0,739085 » sans dire « approchée » serait affirmer plus que ce
           qu'on a calculé. L'intervalle est à l'élève : hors de lui, on ne
           cherche pas, et on le dit. */
        /* « CALC.fonction », comme le Grapheur : c'est la porte d'entrée du
           moteur pour une expression d'une variable, et elle rend « f ». */
        const compile = (txt) => {
          const r = CALC.fonction(txt, "x", contexte());
          return r && !r.erreur && r.f ? r.f : null;
        };
        const G = compile(E.gauche), D = compile(E.droite);
        const a0 = parseFloat(E.a), b0 = parseFloat(E.b);
        let bloc;
        if (!G || !D) {
          bloc = '<p class="nw-erreur">Une des deux expressions ne se lit pas.</p>';
        } else if (!(b0 > a0)) {
          bloc = '<p class="nw-erreur">L\'intervalle de recherche demande a &lt; b.</p>';
        } else {
          const diff = (x) => {
            const g = G(x), d2 = D(x);
            return Number.isFinite(g) && Number.isFinite(d2) ? g - d2 : NaN;
          };
          const sols = CALC.num.zeros(diff, a0, b0, 2000);
          bloc = sols.length
            ? '<dl class="nw-valeurs">' + sols.map((x, i) => '<dt>solution '
                + (i + 1) + ' (approchée)</dt><dd>x ≈ ' + ech(fmt(x)) + '</dd>').join("")
              + '</dl>'
            : '<p class="nw-resultat" style="text-align:left">Aucune solution trouvée '
              + 'sur [' + ech(fmt(a0)) + ' ; ' + ech(fmt(b0)) + '].</p>';
        }
        const champ = (cle, lib, large) => '<label for="nw-eq-' + cle + '">' + lib
          + '</label><input type="text" class="nw-petit' + (large ? "" : " nw-court")
          + '" id="nw-eq-' + cle + '" data-eq="' + cle + '" value="' + ech(E[cle]) + '">';
        return choix
          + '<div class="nw-rangee">' + champ("gauche", "f(x) =", true)
          + champ("droite", "g(x) =", true) + '</div>'
          + '<div class="nw-rangee">' + champ("a", "chercher de x =")
          + champ("b", "à x =") + '</div>'
          + bloc
          + '<p class="nw-sous">Les solutions sont <b>approchées</b> : elles viennent d\'un '
          + 'changement de signe de f − g, puis d\'une dichotomie. Deux solutions très '
          + 'proches peuvent n\'en faire qu\'une à l\'écran, et une solution hors de '
          + 'l\'intervalle n\'est pas cherchée — c\'est pour cela que l\'intervalle se '
          + 'saisit.</p>';
      }
      if (E.mode === "polynome") {
        const d = E.degre;
        const termes = [];
        for (let i = 0; i <= d; i++) {
          const p = d - i;
          termes.push('<label for="nw-co' + i + '">'
            + (p === 0 ? "cst" : p === 1 ? "x" : "x" + ["", "", "²", "³", "⁴", "⁵", "⁶"][p])
            + '</label><input type="text" class="nw-petit" id="nw-co' + i + '" data-co="' + i
            + '" data-cle="co' + i + '" value="' + ech(E.coeffs[i] === undefined ? "0"
              : E.coeffs[i]) + '">');
        }
        const nums = E.coeffs.slice(0, d + 1).map((c) => nombreSaisi(c === undefined ? "0" : c));
        let bloc;
        if (nums.some((v) => v === null)) {
          bloc = '<p class="nw-erreur">Un coefficient n\'est pas un nombre.</p>';
        } else {
          const r = CALC.ALGEBRE.racinesPolynome(nums);
          if (r.erreur) bloc = '<p class="nw-erreur">' + ech(r.erreur) + '</p>';
          else {
            const reelles = r.racines.filter((z) => z.im === 0);
            const complexes = r.racines.filter((z) => z.im !== 0);
            bloc = '<dl class="nw-valeurs">'
              + (r.delta !== undefined
                  ? '<dt>discriminant Δ</dt><dd>' + ech(fmt(r.delta)) + ' — '
                    + (r.delta > 0 ? "deux racines" : r.delta === 0 ? "une racine double"
                       : "aucune racine réelle") + '</dd>' : "")
              + (reelles.length
                  ? reelles.map((z, i) => '<dt>x' + (i + 1) + '</dt><dd>' + ech(fmt(z.re))
                      + '</dd>').join("")
                  : '<dt>racines réelles</dt><dd>aucune</dd>')
              + (complexes.length ? '<dt>racines complexes</dt><dd>'
                  + complexes.map((z) => fmt(z.re) + (z.im > 0 ? " + " : " − ")
                      + fmt(Math.abs(z.im)) + "i").join("  ·  ") + '</dd>' : "")
              + '</dl>';
          }
        }
        return choix + '<div class="nw-rangee">'
          + '<label for="nw-degre">degré</label><select class="nw-petit" id="nw-degre">'
          + [1, 2, 3, 4].map((v) => '<option value="' + v + '"' + (d === v ? " selected" : "")
            + '>' + v + '</option>').join("") + '</select></div>'
          + '<div class="nw-rangee">' + termes.join("") + '</div>' + bloc
          + '<p class="nw-sous">Les coefficients vont du plus haut degré au terme constant. '
          + 'Une racine double n\'est écrite qu\'une fois, et le discriminant le dit. '
          + 'Les racines non réelles sont données : elles existent, même hors programme.</p>'
          + lienChapitre(this.chapitre);
      }
      const n = E.inconnues;
      const noms = ["x", "y", "z", "t"];
      let lignes = "";
      for (let i = 0; i < n; i++) {
        let l = "";
        for (let j = 0; j <= n; j++) {
          l += '<td><input class="nw-cellule" data-cle="sy' + i + "_" + j + '" data-sy="'
            + i + "," + j + '" value="' + ech((E.systeme[i] && E.systeme[i][j]) || "0")
            + '" aria-label="ligne ' + (i + 1) + (j < n ? " coefficient de " + noms[j]
              : " second membre") + '"></td>';
          if (j < n - 1) l += '<td>' + noms[j] + ' +</td>';
          else if (j === n - 1) l += '<td>' + noms[j] + ' =</td>';
        }
        lignes += '<tr>' + l + '</tr>';
      }
      const M = [], B = [];
      let lisible = true;
      for (let i = 0; i < n; i++) {
        const ligne = [];
        for (let j = 0; j < n; j++) {
          const v = nombreSaisi((E.systeme[i] && E.systeme[i][j]) || "0");
          if (v === null) lisible = false;
          ligne.push(v || 0);
        }
        const bv = nombreSaisi((E.systeme[i] && E.systeme[i][n]) || "0");
        if (bv === null) lisible = false;
        M.push(ligne); B.push(bv || 0);
      }
      let bloc;
      if (!lisible) bloc = '<p class="nw-erreur">Un coefficient n\'est pas un nombre.</p>';
      else {
        const S = CALC.ALGEBRE.resoudreSysteme(M, B);
        bloc = S.type === "unique"
          ? '<dl class="nw-valeurs">' + S.x.map((v, i) => '<dt>' + noms[i] + '</dt><dd>'
              + ech(fmt(v)) + '</dd>').join("") + '</dl>'
          : S.type === "aucune"
            ? '<p class="nw-resultat" style="text-align:left">Aucune solution — '
              + 'les équations se contredisent.</p>'
            : '<p class="nw-resultat" style="text-align:left">Une infinité de solutions — '
              + 'rang ' + S.rang + ' pour ' + S.inconnues + ' inconnues.</p>';
      }
      return choix + '<div class="nw-rangee">'
        + '<label for="nw-inconnues">inconnues</label>'
        + '<select class="nw-petit" id="nw-inconnues">'
        + [2, 3, 4].map((v) => '<option value="' + v + '"' + (n === v ? " selected" : "")
          + '>' + v + '</option>').join("") + '</select></div>'
        + '<div class="nw-defile"><table class="nw-table"><tbody>' + lignes
        + '</tbody></table></div>' + bloc
        + '<p class="nw-sous">« Aucune solution » et « une infinité » ne sont pas des '
        + 'erreurs : ce sont des réponses, et un énoncé peut les attendre.</p>';
    },
    apres() {
      $$("[data-emode]", page).forEach((b) => b.addEventListener("click", () => {
        ETAT.equations.mode = b.dataset.emode; garder(); redessiner();
      }));
      $$("[data-eq]", page).forEach((c) => {
        const maj = () => { ETAT.equations[c.dataset.eq] = c.value; garder(); redessiner(); };
        c.addEventListener("change", maj);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") maj(); });
      });
      const dg = $("#nw-degre");
      if (dg) dg.addEventListener("change", () => {
        const d = Number(dg.value);
        ETAT.equations.degre = d;
        while (ETAT.equations.coeffs.length < d + 1) ETAT.equations.coeffs.push("0");
        garder(); redessiner();
      });
      $$("[data-co]", page).forEach((c) => {
        const maj = () => {
          ETAT.equations.coeffs[Number(c.dataset.co)] = c.value; garder(); redessiner();
        };
        c.addEventListener("change", maj);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") maj(); });
      });
      const inc = $("#nw-inconnues");
      if (inc) inc.addEventListener("change", () => {
        const n = Number(inc.value);
        ETAT.equations.inconnues = n;
        while (ETAT.equations.systeme.length < n) ETAT.equations.systeme.push([]);
        for (const l of ETAT.equations.systeme)
          while (l.length < n + 1) l.push("0");
        garder(); redessiner();
      });
      $$("[data-sy]", page).forEach((c) => {
        const maj = () => {
          const [i, j] = c.dataset.sy.split(",").map(Number);
          if (!ETAT.equations.systeme[i]) ETAT.equations.systeme[i] = [];
          ETAT.equations.systeme[i][j] = c.value; garder(); redessiner();
        };
        c.addEventListener("change", maj);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") maj(); });
      });
    },
  };

  /* ═══════════════ 12 bis. Finance ═══════════════════════════════════
     Les deux calculs de la machine. Ce n'est pas au programme de BTS
     CIEL, mais c'est au programme de la vie : le jour où l'on signe un
     crédit, savoir ce que paie vraiment une mensualité vaut un chapitre.

     Le principe du solveur : on écrit UNE équation, et on résout pour
     celui des paramètres qu'on laisse vide. Les quatre premiers se
     retournent à la main ; le TAUX, lui, n'a pas de forme close — on le
     cherche par dichotomie, exactement comme la machine. */
  APPS.finance = {
    nom: "Finance", icone: "€",
    html() {
      const F = ETAT.finance;
      const v = (c) => nombreSaisi(String(F[c]));
      const champ = (cle, lib, taille) =>
        '<label for="nw-f-' + cle + '">' + ech(lib) + '</label>'
        + '<input type="text" class="nw-petit' + (taille || "") + '" id="nw-f-' + cle
        + '" data-fin="' + cle + '" value="' + ech(F[cle]) + '">';

      const onglets = '<div class="nw-onglets" role="tablist">'
        + [["simples", "Intérêts simples"], ["composes", "Intérêts composés"]]
          .map(([c, t]) => '<button type="button" class="nw-onglet" role="tab" '
            + 'data-fmode="' + c + '" aria-selected="' + (F.mode === c) + '">'
            + t + '</button>').join("")
        + '</div>';

      if (F.mode === "simples") {
        /* I = C × t/100 × j/base. Quatre inconnues, une équation : on
           résout celle qu'on laisse vide. La BASE n'est pas un détail —
           360 jours est la convention bancaire, 365 la civile, et l'écart
           se voit dès le premier exemple : 50,00 € contre 49,32 €. */
        const C = v("capital"), tx = v("taux"), j = v("jours"), base = v("base");
        const I = v("interets");
        let reponse = "", quoi = "";
        const vides = [["capital", C], ["taux", tx], ["jours", j], ["interets", I]]
          .filter(([, x]) => x === null).map(([k]) => k);
        if (!base || base <= 0) reponse = "La base doit être 360 ou 365.";
        else if (vides.length !== 1)
          reponse = vides.length === 0
            ? "Laissez UN champ vide : c'est lui qui sera calculé."
            : "Il y a " + vides.length + " champs vides : je ne peux en calculer qu'un.";
        else {
          quoi = vides[0];
          if (quoi === "interets") reponse = fmt(C * tx / 100 * j / base) + " €";
          else if (quoi === "capital") reponse = fmt(I / (tx / 100 * j / base)) + " €";
          else if (quoi === "taux") reponse = fmt(I / (C * j / base) * 100) + " %";
          else reponse = fmt(I / (C * tx / 100) * base) + " jours";
        }
        return onglets
          + '<div class="nw-rangee">' + champ("capital", "capital de départ (€)")
          + champ("taux", "taux annuel (%)") + '</div>'
          + '<div class="nw-rangee">' + champ("jours", "nombre de jours")
          + '<label for="nw-f-base">jours dans l\'année</label>'
          + '<select class="nw-petit" id="nw-f-base" data-fin="base">'
          + ["360", "365"].map((b2) => '<option value="' + b2 + '"'
              + (String(F.base) === b2 ? " selected" : "") + '>' + b2 + '</option>').join("")
          + '</select></div>'
          + '<div class="nw-rangee">' + champ("interets", "intérêts (€)") + '</div>'
          + '<p class="nw-moyenne">' + (quoi ? ech(quoi) + " = " : "") + ech(reponse) + '</p>'
          + '<p class="nw-sous">Laissez <b>un seul champ vide</b> : c\'est celui-là qui est '
          + 'calculé. La base de 360 jours est la convention bancaire, 365 la convention '
          + 'civile — sur 5 000 € à 4 % pendant 90 jours, l\'écart est de 68 centimes.</p>';
      }

      /* ── Intérêts composés : l'équation du solveur ─────────────────
         PV(1+i)^N + PMT(1 + i·d)·((1+i)^N − 1)/i + FV = 0
         avec i le taux par période de PAIEMENT, et d = 1 si le paiement
         tombe en début de période. */
      const N = v("n"), tN = v("tauxN"), PV = v("pv"), PMT = v("pmt"), FV = v("fv");
      const pAn = v("parAn") || 12, cAn = v("composition") || 12;
      const d = F.quand === "debut" ? 1 : 0;
      const tauxPeriode = (tAnnuel) =>
        Math.pow(1 + tAnnuel / 100 / cAn, cAn / pAn) - 1;
      const bilan = (n2, i, pv, pmt, fv) => {
        if (Math.abs(i) < 1e-12) return pv + pmt * n2 + fv;
        const g = Math.pow(1 + i, n2);
        return pv * g + pmt * (1 + i * d) * (g - 1) / i + fv;
      };
      const vides = [["n", N], ["tauxN", tN], ["pv", PV], ["pmt", PMT], ["fv", FV]]
        .filter(([, x]) => x === null).map(([k]) => k);
      let quoi = "", reponse = "";
      if (vides.length !== 1) {
        reponse = vides.length === 0
          ? "Laissez UN champ vide : c'est lui qui sera calculé."
          : "Il y a " + vides.length + " champs vides : je ne peux en calculer qu'un.";
      } else {
        quoi = vides[0];
        const i = tauxPeriode(tN);
        const g = Math.pow(1 + i, N);
        if (quoi === "pv") reponse = fmt(-(PMT * (1 + i * d) * (g - 1) / i + FV) / g) + " €";
        else if (quoi === "fv") reponse = fmt(-(PV * g + PMT * (1 + i * d) * (g - 1) / i)) + " €";
        else if (quoi === "pmt") {
          reponse = Math.abs(i) < 1e-12
            ? fmt(-(PV + FV) / N) + " €"
            : fmt(-(PV * g + FV) * i / ((1 + i * d) * (g - 1))) + " €";
        } else if (quoi === "n") {
          /* N se cherche aussi par dichotomie : la forme close demande un
             logarithme qui n'existe pas pour tous les signes de PMT. */
          const f = (x) => bilan(x, i, PV, PMT, FV);
          const z = CALC.num.zeros(f, 0.0001, 2000);
          reponse = z.length ? fmt(z[0]) + " périodes"
                             : "aucune durée ne solde ce plan";
        } else {
          /* LE TAUX : pas de forme close. Dichotomie sur [−99 ; 200] %,
             exactement ce que fait la machine. */
          const f = (t2) => bilan(N, tauxPeriode(t2), PV, PMT, FV);
          const z = CALC.num.zeros(f, -99, 200);
          reponse = z.length ? fmt(z[0]) + " %" : "aucun taux ne solde ce plan";
        }
      }
      return onglets
        + '<div class="nw-rangee">' + champ("n", "nombre de paiements N")
        + champ("tauxN", "taux nominal annuel (%)") + '</div>'
        + '<div class="nw-rangee">' + champ("pv", "montant de départ PV (€)")
        + champ("pmt", "paiement par période (€)") + '</div>'
        + '<div class="nw-rangee">' + champ("fv", "montant final FV (€)")
        + '<label for="nw-f-quand">paiement</label>'
        + '<select class="nw-petit" id="nw-f-quand" data-fin="quand">'
        + [["fin", "en fin de période"], ["debut", "en début de période"]]
          .map(([k, t2]) => '<option value="' + k + '"'
            + (F.quand === k ? " selected" : "") + '>' + t2 + '</option>').join("")
        + '</select></div>'
        + '<div class="nw-rangee">' + champ("parAn", "paiements par an")
        + champ("composition", "compositions par an") + '</div>'
        + '<p class="nw-moyenne">' + (quoi ? ech(quoi) + " = " : "") + ech(reponse) + '</p>'
        + '<p class="nw-sous">Un emprunt se saisit avec <b>PV positif</b> (on reçoit) et le '
        + 'paiement ressort <b>négatif</b> (on verse) : c\'est la convention de signe de la '
        + 'machine, et elle évite de se tromper de sens. 10 000 € à 5 % sur 60 mois donnent '
        + '−188,71 € par mois.</p>';
    },
    apres() {
      $$("[data-fmode]", page).forEach((b2) => b2.addEventListener("click", () => {
        ETAT.finance.mode = b2.dataset.fmode; garder(); redessiner();
      }));
      $$("[data-fin]", page).forEach((c) => {
        const maj = () => { ETAT.finance[c.dataset.fin] = c.value; garder(); redessiner(); };
        c.addEventListener("change", maj);
        if (c.tagName === "INPUT")
          c.addEventListener("keydown", (e) => { if (e.key === "Enter") maj(); });
      });
    },
  };

  /* ═══════════════ Les applications encore à écrire ══════════════════
     Elles tiennent leur place dans l'accueil pour que la carte soit juste
     — et chacune dit ce qu'elle fera, ce qu'il faut pour y arriver, et ce
     qu'on peut utiliser en attendant. Une application annoncée qui
     n'explique rien ferait perdre deux minutes à chaque fois qu'on
     l'ouvre par curiosité. */

  /* ═══════════════ 12. Inférence ═════════════════════════════════════
     Deux familles, et c'est la division de la machine : ESTIMER — donner
     un intervalle de confiance — et DÉCIDER — conduire un test. Deux
     grandeurs : une moyenne, une proportion.

     Trois choix de fond, et chacun évite une faute de cours :

     · σ CONNU ou non. Avec σ, c'est la loi normale ; sans lui, on estime
       par s et c'est Student à n−1 degrés. Les deux donnent presque la
       même chose à n = 200 et pas du tout à n = 8 — c'est précisément ce
       qu'un sujet veut faire remarquer.
     · Les CONDITIONS sont vérifiées et affichées. Un intervalle de
       proportion n'a de sens que si n ⩾ 30, nf ⩾ 5 et n(1−f) ⩾ 5 ; le
       dire après coup serait laisser lire un chiffre qui ne vaut rien.
     · La conclusion est écrite EN TOUTES LETTRES, avec le risque. « On
       rejette H₀ au seuil de 5 % » est la phrase attendue sur la copie ;
       un p plus petit que α ne l'est pas. */
  APPS.inference = {
    nom: "Inférence", icone: "x̄±",
    chapitre: ["10-loi-normale", "Loi normale"],
    html() {
      const I = ETAT.inference;
      const seg = (cle, valeurs) => valeurs.map(([v, t]) =>
        '<button type="button" class="nw-bouton" data-inf="' + cle + ':' + v + '"'
        + (String(I[cle]) === String(v) ? ' aria-pressed="true"' : '') + '>'
        + ech(t) + '</button>').join("");
      const champ = (cle, lib) => '<label for="nw-i-' + cle + '">' + lib
        + '</label><input type="text" class="nw-petit nw-court" id="nw-i-' + cle
        + '" data-ival="' + cle + '" value="' + ech(I[cle]) + '">';
      const nb = (cle) => { const v = nombreSaisi(I[cle]); return v === null ? NaN : v; };

      const tetes = '<div class="nw-onglets">'
        + [["intervalle", "Intervalles"], ["test", "Tests"]]
          .map(([v, t]) => '<button type="button" class="nw-onglet" data-inf="famille:' + v
            + '" aria-selected="' + (I.famille === v) + '">' + t + '</button>').join("")
        + '</div>'
        + '<div class="nw-rangee"><label>grandeur</label>'
        + seg("grandeur", [["moyenne", "Une moyenne"], ["proportion", "Une proportion"]])
        + '</div>';

      const n = I.grandeur === "moyenne" ? nb("nEch") : nb("nProp");
      let saisie = "", bloc = "", conditions = "";

      if (I.grandeur === "moyenne") {
        saisie = '<div class="nw-rangee">' + champ("xbar", "Moyenne échantillon") + champ("nEch", "Taille échantillon")
          + '</div><div class="nw-rangee"><label>écart type</label>'
          + seg("sigmaConnu", [[false, "Ecart-type de l’échantillon"], [true, "Ecart-type de la population"]])
          + (I.sigmaConnu ? champ("sigma", "σ population") : champ("sEch", "s échantillon")) + '</div>';
      } else {
        saisie = '<div class="nw-rangee">' + champ("f", "Proportion échantillon")
          + champ("nProp", "Taille échantillon") + '</div>';
        const f = nb("f");
        if (Number.isFinite(f) && Number.isFinite(n)) {
          const c1 = n >= 30, c2 = n * f >= 5, c3 = n * (1 - f) >= 5;
          conditions = '<dl class="nw-valeurs">'
            + '<dt>n ⩾ 30</dt><dd>' + (c1 ? "oui — " : "NON — ") + ech(fmt(n)) + '</dd>'
            + '<dt>n·f ⩾ 5</dt><dd>' + (c2 ? "oui — " : "NON — ") + ech(fmt(n * f)) + '</dd>'
            + '<dt>n(1−f) ⩾ 5</dt><dd>' + (c3 ? "oui — " : "NON — ")
            + ech(fmt(n * (1 - f))) + '</dd></dl>'
            + (c1 && c2 && c3 ? ""
               : '<p class="nw-sous"><b>Une condition n’est pas remplie.</b> '
                 + 'L’approximation normale ne tient plus : le résultat ci-dessous est '
                 + 'affiché, mais il ne vaut pas comme réponse. Un sujet attend qu’on le '
                 + 'dise.</p>');
        }
      }

      if (I.famille === "intervalle") {
        const niv = nb("niveau");
        saisie += '<div class="nw-rangee">' + champ("niveau", "Seuil de confiance")
          + '</div>';
        if (!(niv > 0 && niv < 1)) {
          bloc = '<p class="nw-erreur">Le niveau de confiance est entre 0 et 1 — 0,95 pour 95 %.</p>';
        } else if (!Number.isFinite(n) || n < 2) {
          bloc = '<p class="nw-erreur">Il faut un effectif n d’au moins 2.</p>';
        } else if (I.grandeur === "moyenne") {
          const xbar = nb("xbar");
          const ec = I.sigmaConnu ? nb("sigma") : nb("sEch");
          if (!Number.isFinite(xbar) || !(ec > 0)) {
            bloc = '<p class="nw-erreur">x̄ et l’écart type doivent être des nombres, '
                 + 'l’écart type strictement positif.</p>';
          } else {
            const q = (1 + niv) / 2;
            const t = I.sigmaConnu
              ? CALC.LOIS.invNormale(q, 0, 1)
              : dicho((x) => CALC.LOIS.studentCdf(x, n - 1), q, -200, 200);
            const marge = t * ec / Math.sqrt(n);
            bloc = '<dl class="nw-valeurs">'
              + '<dt>' + (I.sigmaConnu ? "quantile z" : "quantile t à " + fmt(n - 1) + " degrés")
              + '</dt><dd>' + ech(fmt(t)) + '</dd>'
              + '<dt>Erreur-type</dt><dd>' + ech(fmt(ec / Math.sqrt(n))) + '</dd>'
              + '<dt>Marge d’erreur</dt><dd>± ' + ech(fmt(marge)) + '</dd>'
              + '<dt>Intervalle de confiance</dt><dd>[ ' + ech(fmt(xbar - marge)) + ' ; '
              + ech(fmt(xbar + marge)) + ' ]</dd></dl>'
              + '<p class="nw-sous">À retenir pour la copie : « au niveau de confiance '
              + ech(fmt(niv * 100)) + ' %, la moyenne de la population appartient à cet '
              + 'intervalle ». Ce n’est pas « il y a ' + ech(fmt(niv * 100)) + ' % de '
              + 'chances que μ y soit » : μ est fixe, c’est l’intervalle qui varie '
              + 'd’un échantillon à l’autre.</p>';
          }
        } else {
          const f = nb("f");
          if (!(f >= 0 && f <= 1)) {
            bloc = '<p class="nw-erreur">La fréquence f est entre 0 et 1.</p>';
          } else {
            const z = CALC.LOIS.invNormale((1 + niv) / 2, 0, 1);
            const marge = z * Math.sqrt(f * (1 - f) / n);
            const simple = 1 / Math.sqrt(n);
            bloc = '<dl class="nw-valeurs">'
              + '<dt>quantile z</dt><dd>' + ech(fmt(z)) + '</dd>'
              + '<dt>Marge d’erreur</dt><dd>± ' + ech(fmt(marge)) + '</dd>'
              + '<dt>Intervalle de confiance</dt><dd>[ ' + ech(fmt(Math.max(0, f - marge))) + ' ; '
              + ech(fmt(Math.min(1, f + marge))) + ' ]</dd>'
              + '<dt>intervalle simplifié f ± 1/√n</dt><dd>[ '
              + ech(fmt(Math.max(0, f - simple))) + ' ; '
              + ech(fmt(Math.min(1, f + simple))) + ' ]</dd></dl>'
              + '<p class="nw-sous">Le second est celui du lycée : il ne dépend que de n, '
              + 'il est toujours plus large, et il vaut pour un niveau d’au moins 95 %. '
              + 'Les deux sont donnés parce que les deux sont demandés selon le sujet.</p>';
          }
        }
      } else {
        const alpha = nb("alpha");
        saisie += '<div class="nw-rangee">'
          + champ(I.grandeur === "moyenne" ? "mu0" : "p0",
                  I.grandeur === "moyenne" ? "μ₀ de H₀" : "p₀ de H₀")
          + champ("alpha", "Seuil de risque") + '</div>'
          + '<div class="nw-rangee"><label>hypothèse H₁</label>'
          + seg("cote", [["bilateral", "≠"], ["gauche", "<"], ["droite", ">"]]) + '</div>';
        if (!(alpha > 0 && alpha < 1)) {
          bloc = '<p class="nw-erreur">Le risque α est entre 0 et 1 — 0,05 pour 5 %.</p>';
        } else if (!Number.isFinite(n) || n < 2) {
          bloc = '<p class="nw-erreur">Il faut un effectif n d’au moins 2.</p>';
        } else {
          let stat = NaN, loiNom = "", cdf = null, h0 = "", obs = "";
          if (I.grandeur === "moyenne") {
            const xbar = nb("xbar"), mu0 = nb("mu0");
            const ec = I.sigmaConnu ? nb("sigma") : nb("sEch");
            if (Number.isFinite(xbar) && Number.isFinite(mu0) && ec > 0) {
              stat = (xbar - mu0) / (ec / Math.sqrt(n));
              if (I.sigmaConnu) { loiNom = "z"; cdf = (x) => CALC.LOIS.normaleCdf(x, 0, 1); }
              else { loiNom = "t à " + fmt(n - 1) + " degrés";
                     cdf = (x) => CALC.LOIS.studentCdf(x, n - 1); }
              h0 = "μ = " + fmt(mu0); obs = "x̄ = " + fmt(xbar);
            }
          } else {
            const f = nb("f"), p0 = nb("p0");
            if (f >= 0 && f <= 1 && p0 > 0 && p0 < 1) {
              stat = (f - p0) / Math.sqrt(p0 * (1 - p0) / n);
              loiNom = "z"; cdf = (x) => CALC.LOIS.normaleCdf(x, 0, 1);
              h0 = "p = " + fmt(p0); obs = "f = " + fmt(f);
            }
          }
          if (!Number.isFinite(stat) || !cdf) {
            bloc = '<p class="nw-erreur">Une des valeurs saisies n’est pas exploitable.</p>';
          } else {
            const pval = I.cote === "bilateral" ? 2 * (1 - cdf(Math.abs(stat)))
                       : I.cote === "gauche" ? cdf(stat) : 1 - cdf(stat);
            const rejette = pval < alpha;
            const signe = I.cote === "bilateral" ? "≠" : I.cote === "gauche" ? "<" : ">";
            bloc = '<dl class="nw-valeurs">'
              + '<dt>Hypothèse nulle H₀</dt><dd>' + ech(h0) + '</dd>'
              + '<dt>Hypothèse alternative H₁</dt><dd>' + ech(h0.replace("=", signe)) + '</dd>'
              + '<dt>observé</dt><dd>' + ech(obs) + '</dd>'
              + '<dt>Variable de décision ' + ech(loiNom) + '</dt><dd>' + ech(fmt(stat)) + '</dd>'
              + '<dt>valeur-p</dt><dd>' + ech(fmt(pval)) + '</dd>'
              + '<dt>décision au seuil ' + ech(fmt(alpha * 100)) + ' %</dt><dd>'
              + (rejette ? "on REJETTE H₀" : "on ne rejette pas H₀") + '</dd></dl>'
              + '<p class="nw-resultat" style="text-align:left">'
              + (rejette
                 ? "p = " + ech(fmt(pval)) + " < α = " + ech(fmt(alpha))
                   + " : on rejette H₀ au seuil de " + ech(fmt(alpha * 100)) + " %."
                 : "p = " + ech(fmt(pval)) + " ⩾ α = " + ech(fmt(alpha))
                   + " : on ne rejette pas H₀ au seuil de " + ech(fmt(alpha * 100)) + " %.")
              + '</p>'
              + '<p class="nw-sous"><b>« Ne pas rejeter » n’est pas « accepter ».</b> '
              + 'Un test ne prouve jamais H₀ : il dit seulement que les données ne suffisent '
              + 'pas à la mettre en doute. C’est la phrase que les correcteurs '
              + 'attendent.</p>';
          }
        }
      }
      return tetes + saisie + conditions + bloc;
    },
    apres() {
      $$("[data-inf]", page).forEach((b) => b.addEventListener("click", () => {
        const i = b.dataset.inf.indexOf(":");
        const cle = b.dataset.inf.slice(0, i), v = b.dataset.inf.slice(i + 1);
        ETAT.inference[cle] = v === "true" ? true : v === "false" ? false : v;
        garder(); redessiner();
      }));
      $$("[data-ival]", page).forEach((c) => {
        const maj = () => { ETAT.inference[c.dataset.ival] = c.value; garder(); redessiner(); };
        c.addEventListener("change", maj);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") maj(); });
      });
    },
  };


  /* ═══════════════ 11. Éléments ══════════════════════════════════════
     Le tableau périodique. La donnée n'est pas tapée ici : elle est
     CONSTRUITE par « _pilotage/scripts/elements.py » depuis un jeu public,
     puis recontrôlée — numéros contigus, symboles distincts, huit valeurs
     d'ancrage, et les trois seules inversions de masse qu'un tableau réel
     porte chez les éléments stables. Deux masses sont ramenées à la valeur
     conventionnelle IUPAC, que la source écrivait avec un chiffre de trop.
     « Une masse atomique fausse est pire qu'absente. »

     La machine colore le tableau par PROPRIÉTÉ, et c'est ce qui le rend
     utile : la même grille raconte les familles, puis les masses, puis les
     états. On reprend ce geste. */
  const EL_FAMILLES = {
    "métal alcalin": "f1", "métal alcalino-terreux": "f2",
    "métal de transition": "f3", "métal pauvre": "f4", "métalloïde": "f5",
    "non-métal": "f6", "gaz noble": "f7", "lanthanide": "f8", "actinide": "f9",
  };
  function elFamille(c) {
    if (EL_FAMILLES[c]) return EL_FAMILLES[c];
    for (const cle of Object.keys(EL_FAMILLES))
      if (c && c.indexOf(cle) >= 0) return EL_FAMILLES[cle];
    return "f0";
  }
  APPS.elements = {
    nom: "Eléments", icone: "⚛",
    chapitre: null,
    html() {
      if (typeof ELEMENTS === "undefined" || !ELEMENTS.length) {
        return '<p class="nw-vide">Le tableau périodique n’a pas été chargé.</p>';
      }
      const E = ETAT.elements;
      const choisi = ELEMENTS.find((x) => x.z === E.z) || ELEMENTS[0];
      const colorer = E.colorer || "famille";

      /* Les bornes de la propriété colorée, calculées sur les éléments qui
         l'ont : une échelle inventée mentirait sur les extrêmes. */
      let bornes = null;
      if (colorer !== "famille" && colorer !== "etat") {
        const vs = ELEMENTS.map((x) => x[colorer]).filter((v) => typeof v === "number");
        if (vs.length) bornes = [Math.min(...vs), Math.max(...vs)];
      }
      const teinte = (x) => {
        if (colorer === "famille") return "nw-el-" + elFamille(x.c);
        if (colorer === "etat") return "nw-el-" + (x.e === "gaz" ? "e-gaz"
          : x.e === "liquide" ? "e-liq" : x.e === "solide" ? "e-sol" : "e-inc");
        return "";
      };
      const fond = (x) => {
        if (!bornes || typeof x[colorer] !== "number") return "";
        const t = (x[colorer] - bornes[0]) / (bornes[1] - bornes[0] || 1);
        return ' style="--el-t:' + t.toFixed(3) + '"';
      };

      /* La grille : 18 colonnes, les deux rangées détachées en dessous.
         Les positions viennent de la donnée (xpos/ypos), pas d'un calcul —
         le tableau a des trous, et ils sont à leur place. */
      let cases = "";
      for (const x of ELEMENTS) {
        cases += '<button type="button" class="nw-el ' + teinte(x)
          + (x.z === choisi.z ? " nw-el-actif" : "")
          + (colorer !== "famille" && colorer !== "etat" ? " nw-el-degrade" : "")
          + '" data-el="' + x.z + '"'
          + ' style="grid-column:' + x.x + ';grid-row:' + x.y + ';'
          + (bornes && typeof x[colorer] === "number"
             ? "--el-t:" + ((x[colorer] - bornes[0]) / (bornes[1] - bornes[0] || 1)).toFixed(3)
             : "") + '"'
          + ' aria-pressed="' + (x.z === choisi.z) + '">'
          + '<i>' + x.z + '</i><b>' + ech(x.s) + '</b></button>';
      }

      const choixCouleur = '<div class="nw-rangee">'
        + [["famille", "famille"], ["etat", "état"], ["m", "masse"],
           ["en", "électronégativité"], ["fus", "fusion"]].map(([v, t]) =>
          '<button type="button" class="nw-bouton" data-elcol="' + v + '"'
          + (colorer === v ? ' aria-pressed="true"' : '') + '>' + ech(t) + '</button>').join("")
        + '</div>';

      const l = (t, v, u) => v === null || v === undefined || v === ""
        ? '<dt>' + t + '</dt><dd>inconnue</dd>'
        : '<dt>' + t + '</dt><dd>' + ech(typeof v === "number" ? fmt(v) : v)
          + (u ? " " + u : "") + '</dd>';

      const fiche = '<div class="nw-el-fiche">'
        + '<p class="nw-el-tete"><span class="nw-el-z">' + choisi.z + '</span>'
        + '<span class="nw-el-s">' + ech(choisi.s) + '</span>'
        + '<span class="nw-el-n">' + ech(choisi.n) + '</span></p>'
        + '<dl class="nw-valeurs">'
        + l("masse atomique", choisi.m, "u")
        + l("famille", choisi.c)
        /* Au-delà du rutherfordium, l'état n'est pas mesuré : il est PRÉVU.
           Quelques atomes produits un par un ne forment ni solide ni
           liquide. Le dire change la nature de la ligne — c'est une
           prédiction, pas un relevé. */
        + l("état à 25 °C", choisi.z >= 104 ? "prévu : " + choisi.e : choisi.e)
        + l("configuration", choisi.cfg)
        + l("électronégativité (Pauling)", choisi.en)
        + l("masse volumique", choisi.d, choisi.e === "gaz" ? "g/L" : "g/cm³")
        + l("fusion", choisi.fus, "K")
        + l("ébullition", choisi.eb, "K")
        + l("période · groupe · bloc",
            choisi.p + " · " + (choisi.g ? choisi.g : "—") + " · " + (choisi.b || "—"))
        + '</dl></div>';

      const legende = colorer === "famille"
        ? '<div class="nw-el-legende">'
          + Object.keys(EL_FAMILLES).map((c) => '<span class="nw-el-' + EL_FAMILLES[c]
            + '">' + ech(c) + '</span>').join("") + '</div>'
        : colorer === "etat"
          ? '<div class="nw-el-legende"><span class="nw-el-e-sol">solide</span>'
            + '<span class="nw-el-e-liq">liquide</span>'
            + '<span class="nw-el-e-gaz">gaz</span></div>'
          : bornes
            ? '<p class="nw-sous">Du plus clair au plus foncé, de '
              + ech(fmt(bornes[0])) + ' à ' + ech(fmt(bornes[1]))
              + '. Les éléments sans valeur connue restent neutres.</p>'
            : "";

      return choixCouleur
        + '<div class="nw-el-grille" role="group" aria-label="Tableau périodique">'
        + cases + '</div>' + legende + fiche
        + '<p class="nw-sous">Les masses sont les valeurs conventionnelles de l’IUPAC. '
        + 'Au-delà du bismuth (Z = 83), ce n’est plus une moyenne isotopique mais le '
        + '<b>nombre de masse de l’isotope le plus stable</b> : c’est pour cela que '
        + 'la suite des masses n’y est plus croissante.</p>';
    },
    apres() {
      $$("[data-el]", page).forEach((b) => b.addEventListener("click", () => {
        ETAT.elements.z = Number(b.dataset.el); garder(); redessiner();
      }));
      $$("[data-elcol]", page).forEach((b) => b.addEventListener("click", () => {
        ETAT.elements.colorer = b.dataset.elcol; garder(); redessiner();
      }));
    },
  };


  /* ═══════════════ 3 bis. Python ═════════════════════════════════════
     Un interprète du Python DU COURS, écrit à la main (« python-mini.js »).
     Pourquoi pas le vrai : le porter demanderait MicroPython ou Pyodide en
     WebAssembly, dix à trente mégaoctets. L'atelier C les paie parce qu'un
     TP de C se compile ou ne se compile pas. Un TP de Python de première
     année, lui, tient dans un sous-ensemble — et ce sous-ensemble est
     ANNONCÉ, pas espéré : ce qui manque est écrit sous l'éditeur.

     Le banc ne compare pas l'interprète à lui-même : il exécute quinze
     programmes avec le VRAI python3 et compare les sorties caractère pour
     caractère, plus douze refus qui doivent refuser. */
  APPS.python = {
    nom: "Python", icone: "py",
    chapitre: ["07-python", "Python"],
    html() {
      const P = ETAT.python;
      if (typeof PYMINI === "undefined") {
        return '<p class="nw-vide">L’interprète Python n’a pas été chargé.</p>';
      }
      const sortie = P.sortie || [];
      const err = P.erreur;
      return '<div class="nw-rangee">'
        + '<button type="button" class="nw-bouton nw-bouton-fort" id="nw-py-run">'
        + '▶ Exécuter le script</button>'
        + '<button type="button" class="nw-bouton" id="nw-py-effacer">Effacer la console</button>'
        + '<button type="button" class="nw-bouton" id="nw-py-exemple">Un exemple</button>'
        + '</div>'
        + '<label class="nw-sous" for="nw-py-src">script.py</label>'
        + '<textarea id="nw-py-src" class="nw-py-editeur" spellcheck="false" '
        + 'autocapitalize="off" autocorrect="off" rows="12">' + ech(P.source) + '</textarea>'
        + '<label class="nw-sous" for="nw-py-entree">entrées de input(), une par ligne</label>'
        + '<textarea id="nw-py-entree" class="nw-py-entree" spellcheck="false" rows="2">'
        + ech(P.entree) + '</textarea>'
        + '<p class="nw-sous">Console d\u2019exécution</p>'
        + '<pre class="nw-py-console">' + (sortie.length ? ech(sortie.join("\n")) : "")
        + (err ? (sortie.length ? "\n" : "")
                 + '<span class="nw-py-err">Erreur'
                 + (err.ligne ? " ligne " + err.ligne : "") + " — " + ech(err.message)
                 + '</span>' : "")
        + (!sortie.length && !err ? '<span class="nw-py-vide">rien pour l’instant</span>' : "")
        + '</pre>'
        + '<details class="nw-py-limites"><summary>Ce que cet interprète ne fait pas</summary>'
        + '<dl class="nw-valeurs">'
        + PYMINI.MANQUES.map((m) => '<dt>' + ech(m[0]) + '</dt><dd>' + ech(m[1]) + '</dd>').join("")
        + '</dl>'
        + '<p class="nw-sous">Un programme qui emploie l’une de ces constructions reçoit '
        + 'une phrase qui la nomme — jamais un résultat faux. Le reste du Python de '
        + 'première année est là : variables, calcul, chaînes, listes, conditions, '
        + 'boucles, fonctions, et la récursivité.</p></details>';
    },
    apres() {
      const src = $("#nw-py-src", page), ent = $("#nw-py-entree", page);
      if (src) src.addEventListener("change", () => { ETAT.python.source = src.value; garder(); });
      if (ent) ent.addEventListener("change", () => { ETAT.python.entree = ent.value; garder(); });
      const run = $("#nw-py-run", page);
      if (run) run.addEventListener("click", () => {
        ETAT.python.source = src ? src.value : ETAT.python.source;
        ETAT.python.entree = ent ? ent.value : ETAT.python.entree;
        const entrees = ETAT.python.entree.split("\n").filter((x, k, t) =>
          x !== "" || k < t.length - 1);
        const r = PYMINI.executer(ETAT.python.source, { entree: entrees });
        ETAT.python.sortie = r.sortie;
        ETAT.python.erreur = r.ok ? null : r.erreur;
        garder(); redessiner();
        dire(r.ok ? "Programme terminé." : "Le programme s'est arrêté.",
             r.ok ? "e-ok" : "e-erreur");
      });
      const eff = $("#nw-py-effacer", page);
      if (eff) eff.addEventListener("click", () => {
        ETAT.python.sortie = []; ETAT.python.erreur = null; garder(); redessiner();
      });
      const ex = $("#nw-py-exemple", page);
      if (ex) ex.addEventListener("click", () => {
        ETAT.python.source = PY_EXEMPLE;
        ETAT.python.sortie = []; ETAT.python.erreur = null;
        garder(); redessiner();
      });
    },
  };
  const PY_EXEMPLE = "# Moyenne d'une serie de notes\n"
    + "notes = [12, 15, 8, 17, 11]\n\n"
    + "total = 0\n"
    + "for n in notes:\n"
    + "    total += n\n\n"
    + "moyenne = total / len(notes)\n"
    + "print(\"Notes   :\", notes)\n"
    + "print(\"Moyenne :\", round(moyenne, 2))\n\n"
    + "admis = 0\n"
    + "for n in notes:\n"
    + "    if n >= 10:\n"
    + "        admis += 1\n\n"
    + "print(\"Admis   :\", admis, \"sur\", len(notes))\n";

  /* Plus aucune application « à venir » : les douze sont écrites. Le
     mécanisme reste, parce qu'il servira à la suivante — et parce qu'un
     écran qui dit « pas encore » vaut toujours mieux qu'un bouton muet. */
  const A_VENIR = {};

  for (const cle of Object.keys(A_VENIR)) {
    const d = A_VENIR[cle];
    APPS[cle] = {
      nom: d.nom, icone: d.icone, aVenir: true,
      html() {
        return '<div class="nw-avenir">'
          + '<p class="nw-avenir-titre">Pas encore écrite</p>'
          + '<p>' + ech(d.quoi) + '</p>'
          + '<p class="nw-sous"><b>Ce qu\'il faut pour y arriver.</b> '
          + ech(d.pourquoi) + '</p>'
          + '<p class="nw-sous"><b>En attendant.</b> ' + ech(d.enAttendant) + '</p>'
          + (d.lien ? '<p class="nw-lien-outil"><a href="' + d.lien[0] + '">'
              + ech(d.lien[1]) + '</a></p>' : "")
          + '</div>';
      },
      apres() {},
    };
  }

  /* ═══════════════ 13. Réglages ══════════════════════════════════════ */
  APPS.reglages = {
    nom: "Paramètres", icone: "⚙",
    html() {
      const R = ETAT.reglages;
      const seg = (nom, valeurs, actuel) => valeurs.map(([v, t]) =>
        '<button type="button" class="nw-bouton" data-reglage="' + nom + ':' + v + '"'
        + (actuel === v ? ' aria-pressed="true"' : '') + '>' + ech(t) + '</button>').join("");
      return '<div class="nw-rangee"><label>unité d\'angle</label>'
        + seg("angle", [["rad", "radian"], ["deg", "degré"], ["grad", "grade"]], R.angle)
        + '</div>'
        + '<div class="nw-rangee"><label>écriture des nombres</label>'
        + seg("format", [["auto", "automatique"], ["sci", "scientifique"],
                         ["ing", "ingénieur"]], R.format) + '</div>'
        + '<div class="nw-rangee"><label for="nw-chiffres">chiffres significatifs</label>'
        + '<input type="text" class="nw-petit" id="nw-chiffres" data-cle="chiffres" value="'
        + ech(R.chiffres) + '"></div>'
        + '<div class="nw-rangee"><label>écran</label>'
        + seg("ecranSombre", [[false, "clair"], [true, "sombre"]], R.ecranSombre)
        + '</div>'
        + '<div class="nw-rangee"><label>mode examen</label>'
        + seg("examen", [[false, "éteint"], [true, "allumé"]], R.examen) + '</div>'
        /* La machine a un sixième réglage : la forme des nombres complexes.
           Le moteur ne les calcule pas — « complexe: false » depuis le
           premier jour. Le réglage est donc montré À SA PLACE, et il dit
           qu'il ne fait rien : une case grisée sans explication laisse
           croire à une panne, et une case active qui ne répond pas est
           pire encore. */
        + '<div class="nw-rangee nw-avenir-ligne"><label>forme des nombres complexes</label>'
        + '<span class="nw-tuile-badge">à venir</span></div>'
        + '<p class="nw-sous">La machine propose ici <i>réel</i>, <i>algébrique</i> (a + ib) '
        + 'et <i>exponentielle</i> (r·e<sup>iθ</sup>). Ce moteur ne calcule pas encore dans '
        + 'ℂ : <code>√(−4)</code> répond « hors domaine » plutôt que <code>2i</code>. Le '
        + 'réglage est posé à sa place pour que la liste soit juste, et il le dit au lieu '
        + 'de faire semblant. Ce qu\'il faudrait : une arithmétique complexe dans le '
        + 'moteur, et les fonctions usuelles qui la suivent — c\'est un chantier, pas un '
        + 'réglage.</p>'
        + '<p class="nw-sous"><b>Le mode examen efface les mémoires</b> — les variables, '
        + 'les fonctions, les suites, les listes — et l\'affiche en haut de l\'écran, comme '
        + 'la machine. Mais il faut être honnête : une page web ne se scelle pas. C\'est un '
        + 'outil d\'entraînement, pas une attestation ; le jour de l\'épreuve, c\'est la '
        + 'vraie machine et son voyant rouge.</p>'
        + '<div class="nw-rangee" style="margin-top:.8rem">'
        + '<button type="button" class="nw-bouton" id="nw-tout-effacer">'
        + 'Tout remettre à zéro</button></div>'
        + '<p class="nw-sous">Remet les réglages, les fonctions, les listes et l\'historique '
        + 'dans leur état d\'origine. Rien n\'est envoyé nulle part : tout vit dans ce '
        + 'navigateur, sur cet appareil.</p>'
        /* « À propos », comme la machine — et il dit ce qui est vrai de
           celle-ci : douze applications, ce qu'elle sait, ce qu'elle ne sait
           pas encore. Un outil doit savoir se décrire. */
        + '<h3 class="nw-titre-bloc">À propos</h3>'
        + '<dl class="nw-valeurs">'
        + '<dt>applications</dt><dd>' + ORDRE.length + '</dd>'
        + '<dt>écrites</dt><dd>' + ORDRE.filter((c) => APPS[c] && !APPS[c].aVenir).length
        + '</dd>'
        + '<dt>à venir</dt><dd>' + ORDRE.filter((c) => APPS[c] && APPS[c].aVenir)
            .map((c) => APPS[c].nom).join(" · ") + '</dd>'
        + '<dt>fonctions du moteur</dt><dd>' + (CALC.FONCTIONS ? CALC.FONCTIONS.length : "—")
        + '</dd>'
        + '</dl>'
        + '<p class="nw-sous">Tout est calculé ici, dans la page : aucun serveur, aucune '
        + 'requête, et le travail reste sur l\'appareil. La calculatrice s\'ouvre hors '
        + 'ligne une fois la page visitée.</p>';
    },
    apres() {
      $$("[data-reglage]", page).forEach((b) => b.addEventListener("click", () => {
        const [nom, v] = b.dataset.reglage.split(":");
        const valeur = v === "true" ? true : v === "false" ? false : v;
        ETAT.reglages[nom] = valeur;
        if (nom === "examen" && valeur === true) {
          ETAT.variables = {}; ETAT.historique = [];
          ETAT.fonctions = PAR_DEFAUT().fonctions.map((f) => ({ expr: "", visible: true }));
          ETAT.suites = PAR_DEFAUT().suites.map((s) => Object.assign({}, s, { expr: "" }));
          ETAT.stats = { valeurs: [0], effectifs: [1] };
          dire("Mode examen : mémoires effacées.", "e-ok");
        }
        garder(); redessiner();
      }));
      const ch = $("#nw-chiffres");
      if (ch) ch.addEventListener("change", () => {
        const v = Math.round(Number(ch.value));
        if (!Number.isFinite(v) || v < 3 || v > 14) {
          dire("Entre 3 et 14 chiffres significatifs.", "e-erreur"); return;
        }
        ETAT.reglages.chiffres = v; dire(""); garder(); redessiner();
      });
      const tout = $("#nw-tout-effacer");
      if (tout) tout.addEventListener("click", () => {
        ETAT = PAR_DEFAUT(); garder(); redessiner();
        dire("Calculatrice remise à zéro.", "e-ok");
      });
    },
  };

  /* ═══════════════ 14. Les gestes ════════════════════════════════════
     Tout passe par la DÉLÉGATION : le clavier est redessiné à chaque
     rendu, donc des écouteurs posés sur les touches elles-mêmes
     disparaîtraient au premier calcul. Posés sur le conteneur, ils
     survivent. */
  const clavier = $("#nw-clavier");

  /* Un bouton prend le focus au mousedown, et le champ de saisie le
     perd : le curseur sautait à la fin du texte à chaque touche. On
     empêche donc le geste par défaut sur le clavier dessiné — c'est la
     seule façon de garder le curseur là où l'élève l'a mis. */
  clavier.addEventListener("mousedown", (e) => {
    if (e.target.closest(".nw-touche")) e.preventDefault();
  });
  clavier.addEventListener("click", (e) => {
    const t = e.target.closest(".nw-touche");
    if (!t) return;
    const act = t.dataset.act;
    if (act) { action(act); return; }
    let texte = t.dataset.ins;
    if (alpha && t.dataset.alpha) texte = t.dataset.alpha;
    else if (maj && t.dataset.maj) texte = t.dataset.maj;
    if (texte === undefined) return;
    inserer(texte);
    if (maj || alpha) { maj = alpha = false; dessinerClavier(); }
  });

  function action(nom) {
    switch (nom) {
      case "accueil": case "retour": aller("accueil"); return;
      case "maj": maj = !maj; alpha = false; dessinerClavier(); return;
      case "alpha": alpha = !alpha; maj = false; dessinerClavier(); return;
      case "eff": effacer(); return;
      case "boite": ouvrirBoite(boite.hidden); return;
      case "var":
        if (courante !== "calculs") aller("calculs");
        panneauVar = !panneauVar; redessiner(); return;
      case "exe": case "ok":
        if (courante === "accueil") { aller(ORDRE[choisi]); return; }
        if (courante === "calculs") { valider(); return; }
        {
          const b = $(".nw-primaire", page) || $(".nw-valider", page);
          if (b) b.click();
        }
        return;
      case "haut": case "bas": case "gauche": case "droite": fleche(nom, false); return;
    }
  }

  /* Les flèches : elles déplacent la sélection sur l'accueil, le curseur
     sur un tracé, et rappellent l'historique dans Calculs. Une même
     touche, trois sens — mais jamais deux en même temps, et c'est
     l'application courante qui tranche. */
  function fleche(sens, duClavierPhysique) {
    if (courante === "accueil") {
      const n = ORDRE.length, col = 3;
      if (sens === "droite") choisi = (choisi + 1) % n;
      else if (sens === "gauche") choisi = (choisi - 1 + n) % n;
      else if (sens === "bas") choisi = (choisi + col) % n;
      else choisi = (choisi - col + n) % n;
      redessiner();
      const tuile = $$(".nw-tuile", page)[choisi];
      if (tuile && duClavierPhysique) { try { tuile.focus(); } catch (e) {} }
      return;
    }
    if (courante === "fonctions" && ETAT.onglets.fonctions === "graphique") {
      if (sens === "gauche") bougerCurseur(-1);
      else if (sens === "droite") bougerCurseur(1);
      return;
    }
  }

  /* ── les boutons du châssis ──────────────────────────────────────── */
  $("#nw-vers-accueil").addEventListener("click", () => aller("accueil"));
  $("#nw-catalogue").addEventListener("click", () => ouvrirBoite(boite.hidden));
  $("#nw-reglages").addEventListener("click", () => aller("reglages"));
  $("#nw-boite-fermer").addEventListener("click", () => ouvrirBoite(false));
  $("#nw-boite-filtre").addEventListener("input", (e) => dessinerBoite(e.target.value));
  boiteListe.addEventListener("mousedown", (e) => {
    if (e.target.closest(".nw-boite-item")) e.preventDefault();
  });
  boiteListe.addEventListener("click", (e) => {
    const b = e.target.closest(".nw-boite-item");
    if (!b) return;
    if (courante === "accueil") aller("calculs");
    inserer(b.dataset.ins);
    dire("Inséré. La boîte reste ouverte pour en ajouter d'autres.", "e-ok");
  });

  const bPlein = $("#nw-plein");
  bPlein.addEventListener("click", () => {
    const grand = !section.classList.contains("nw-grand");
    section.classList.toggle("nw-grand", grand);
    document.body.classList.toggle("nw-fige", grand);
    bPlein.setAttribute("aria-pressed", String(grand));
    $(".nw-lib-plein").textContent = grand ? "Réduire" : "Agrandir";
  });

  /* Un seul écouteur, posé sur l'écran qui ne change jamais : il attrape
     la frappe au clavier ET les touches dessinées, puisque « inserer »
     émet le même événement. Tous les champs de texte de l'appareil en
     profitent — la ligne de calcul, les expressions de fonctions, les
     suites —, et c'est le « pareil pour tout » demandé. */
  page.addEventListener("input", (e) => {
    const c = e.target;
    if (!c || c.tagName !== "INPUT") return;
    const type = (c.getAttribute("type") || "text").toLowerCase();
    if (type !== "text" && type !== "search") return;
    exposantsALaFrappe(c);
  });

  page.addEventListener("click", (e) => {
    const tuile = e.target.closest(".nw-tuile");
    if (tuile) { choisi = ORDRE.indexOf(tuile.dataset.app); aller(tuile.dataset.app); }
  });

  /* ── le clavier physique ─────────────────────────────────────────────
     Il doit marcher PARTOUT : taper son calcul au clavier est plus
     rapide que de viser trente touches dessinées, et c'est ce que fait
     n'importe qui devant un ordinateur. Les raccourcis globaux sont donc
     réduits au minimum, pour ne jamais voler une frappe à un champ. */
  document.addEventListener("keydown", (e) => {
    if (!section.contains(document.activeElement) && document.activeElement !== document.body)
      return;
    const dansChamp = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (e.key === "F1") { e.preventDefault(); ouvrirBoite(boite.hidden); return; }
    if (e.key === "Escape") {
      if (!boite.hidden) { ouvrirBoite(false); return; }
      if (section.classList.contains("nw-grand")) { bPlein.click(); return; }
      if (courante !== "accueil") { aller("accueil"); return; }
      return;
    }
    if (courante === "accueil" && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]
        .includes(e.key)) {
      e.preventDefault();
      fleche({ ArrowUp: "haut", ArrowDown: "bas", ArrowLeft: "gauche",
               ArrowRight: "droite" }[e.key], true);
      return;
    }
    if (courante === "accueil" && (e.key === "Enter" || e.key === " ")) {
      if (dansChamp) return;
      e.preventDefault(); aller(ORDRE[choisi]); return;
    }
    if (courante === "fonctions" && ETAT.onglets.fonctions === "graphique" && !dansChamp
        && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      bougerCurseur(e.key === "ArrowLeft" ? -1 : 1);
    }
  });

  /* ── l'heure du bandeau ──────────────────────────────────────────────
     Une calculatrice affiche l'heure ; c'est un détail, et c'est
     justement pourquoi il compte. Rafraîchie à la minute, pas à la
     seconde : rien ne justifie de réveiller la page soixante fois plus
     souvent. */
  function heure() {
    const d = new Date();
    bHeure.textContent = String(d.getHours()).padStart(2, "0") + ":"
      + String(d.getMinutes()).padStart(2, "0");
  }
  heure();
  setInterval(heure, 30000);

  /* ── le départ ───────────────────────────────────────────────────── */
  dessinerClavier();
  aller("accueil");
  dire("");

  /* Le diagnostic, pour le banc de rendu et pour la console : il dit ce
     que la page sait d'elle-même. Sans point d'entrée mesurable, un
     outil ne se vérifie qu'à l'œil. */
  window.CALCULATRICE = {
    etat: () => ETAT,
    aller,
    diagnostic() {
      const r = { apps: ORDRE.length, touches: 0, catalogue: 0, erreurs: [] };
      r.touches = NAV.filter((k) => !k.vide && !k.croix).length + 5
                + FONCTIONS.length + NUMERIQUE.length;
      const cat = (typeof CALC_CATALOGUE === "object" && CALC_CATALOGUE.categories) || [];
      for (const c of cat) r.catalogue += c.entrees.length;
      for (const cle of ORDRE) {
        try {
          courante = cle;
          const h = APPS[cle].html();
          if (!h || h.length < 20) r.erreurs.push(cle + " : écran vide");
        } catch (e) { r.erreurs.push(cle + " : " + e.message); }
      }
      aller("accueil");
      return r;
    },
  };
})();
