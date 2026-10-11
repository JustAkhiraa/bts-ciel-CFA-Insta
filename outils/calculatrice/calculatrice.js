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
    fenetre: { xmin: -10, xmax: 10, ymin: -10, ymax: 10, auto: true },
    tableau: { debut: 0, pas: 1 },
    suites: [{ type: "recurrente", expr: "u+3", premier: "5", second: "1", rang0: 0 },
             { type: "explicite", expr: "2^n", premier: "1", second: "1", rang0: 0 }],
    stats: { valeurs: [2, 4, 4, 4, 5, 5, 7, 9], effectifs: [1, 1, 1, 1, 1, 1, 1, 1] },
    regression: { X: [1, 2, 3, 4, 5, 6], Y: [2.1, 3.9, 6.2, 8.1, 9.8, 12.2], modele: "lineaire" },
    probas: { loi: "binomiale", n: 10, p: 0.3, mu: 0, sigma: 1, lambda: 0.25,
              a: 0, b: 1, N: 49, K: 6, nu: 10, d1: 3, d2: 12,
              question: "egal", k: 3, k2: 5, seuil: 0.95 },
    equations: { mode: "polynome", coeffs: ["1", "-3", "2"], degre: 2,
                 systeme: [["2", "1", "5"], ["1", "-1", "1"]], inconnues: 2 },
    onglets: { fonctions: "expressions", suites: "expressions", stats: "donnees" },
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
  const NAV = [
    { act: "accueil", t: "⌂", aide: "Accueil des applications", cls: "nw-touche-nav" },
    { act: "retour", t: "↰", aide: "Revenir à l'accueil", cls: "nw-touche-nav" },
    { vide: true },
    { croix: [
      { act: "haut", t: "▲", aide: "Haut", k: "k-haut" },
      { act: "gauche", t: "◀", aide: "Gauche", k: "k-gauche" },
      { act: "ok", t: "OK", aide: "Valider", k: "k-ok" },
      { act: "droite", t: "▶", aide: "Droite", k: "k-droite" },
      { act: "bas", t: "▼", aide: "Bas", k: "k-bas" },
    ] },
  ];
  const FONCTIONS = [
    { act: "maj", t: "⇧", aide: "Maj : allume les fonctions écrites en petit", cls: "nw-touche-fn" },
    { act: "alpha", t: "α", aide: "alpha : les lettres de mémoire", cls: "nw-touche-fn" },
    { ins: "x", t: "x", s: "n", si: "n", a: "", aide: "La variable x (Maj : n)" },
    { act: "var", t: "var", aide: "Les valeurs rangées en mémoire", cls: "nw-touche-fn" },
    { act: "boite", t: "🧰", aide: "Boîte à outils", cls: "nw-touche-fn" },
    { act: "eff", t: "⌫", aide: "Effacer", cls: "nw-touche-fn" },

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
    if (k.vide) return '<span></span>';
    if (k.croix) {
      return '<div class="nw-croix">' + k.croix.map((c) =>
        '<button type="button" class="nw-touche nw-touche-nav ' + c.k + '" data-act="' + c.act
        + '" title="' + ech(c.aide) + '" aria-label="' + ech(c.aide) + '">' + ech(c.t)
        + '</button>').join("") + '</div>';
    }
    const libelle = alpha && k.a !== undefined && k.a !== "" ? ech(k.a)
                  : maj && k.s ? ech(k.s) : ech(k.t);
    const sec = !alpha && !maj && k.s ? '<span class="sec">' + ech(k.s) + '</span>'
              : !alpha && !maj && k.a ? '<span class="sec">' + ech(k.a) + '</span>' : "";
    const aide = k.aide || ("Insérer " + (k.ins || k.t));
    const cls = "nw-touche " + (k.cls || "");
    const presse = (k.act === "maj" && maj) || (k.act === "alpha" && alpha);
    return '<button type="button" class="' + cls + '"'
      + (k.act ? ' data-act="' + k.act + '"' : '')
      + (k.ins !== undefined ? ' data-ins="' + ech(k.ins) + '"' : '')
      + (k.si ? ' data-maj="' + ech(k.si) + '"' : '')
      + (k.a ? ' data-alpha="' + ech(k.a) + '"' : '')
      + (k.act === "maj" || k.act === "alpha" ? ' aria-pressed="' + presse + '"' : '')
      + ' title="' + ech(aide) + '">' + libelle + sec + '</button>';
  }
  function dessinerClavier() {
    $("#nw-clavier").innerHTML =
      '<div class="nw-bloc nw-bloc-nav">' + NAV.map(toucheHTML).join("") + '</div>'
      + '<div class="nw-bloc nw-bloc-fn">' + FONCTIONS.map(toucheHTML).join("") + '</div>'
      + '<div class="nw-bloc nw-bloc-num">' + NUMERIQUE.map(toucheHTML).join("") + '</div>'
      + '<p class="nw-clavier-note">Le clavier de l\'ordinateur marche aussi.</p>';
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
    /* Les graduations : une sur deux étiquetée, sinon elles se touchent. */
    let i = 0;
    for (let x = Math.ceil(xmin / px) * px; x <= xmax; x += px, i++) {
      if (i % 2 || Math.abs(X(x)) < 12 || X(x) > LARG - 12) continue;
      bouts.push('<text x="' + X(x).toFixed(1) + '" y="' + Math.min(HAUT - 2, Y(0) + 9).toFixed(1)
        + '" text-anchor="middle">' + ech(nombreCourt(x)) + '</text>');
    }
    i = 0;
    for (let y = Math.ceil(ymin / py) * py; y <= ymax; y += py, i++) {
      if (i % 2 || Math.abs(Y(y) - Y(0)) < 7) continue;
      bouts.push('<text x="' + Math.max(2, X(0) + 3).toFixed(1) + '" y="' + (Y(y) - 2).toFixed(1)
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
      bouts.push('<circle class="point" cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1)
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
      + ' aria-label="' + ech(o.aide || "Tracé") + '">' + bouts.join("") + '</svg>';
  }
  function nombreCourt(x) {
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e5 || a < 1e-3) return x.toExponential(0).replace("e", "·10^").replace("-", "−");
    return String(Math.round(x * 1e6) / 1e6).replace("-", "−");
  }

  /* ═══════════════ 4. Le routage et le rendu ═════════════════════════ */
  const APPS = {};          // rempli par les sections suivantes
  const ORDRE = ["calculs", "fonctions", "suites", "stats", "regression",
                 "probas", "equations", "reglages"];
  let courante = "accueil", choisi = 0;

  function aller(cle) {
    courante = cle;
    maj = alpha = false;
    redessiner();
    const champ = $(".nw-champ", page) || $("input,select,button", page);
    if (champ && cle !== "accueil") { try { champ.focus(); } catch (e) {} }
  }

  function accueilHTML() {
    return '<div class="nw-accueil" id="nw-grille-apps">'
      + ORDRE.map((c, i) => '<button type="button" class="nw-tuile" data-app="' + c + '"'
        + ' aria-current="' + (i === choisi) + '">'
        + '<span class="nw-tuile-ic" aria-hidden="true">' + ech(APPS[c].icone) + '</span>'
        + ech(APPS[c].nom) + '</button>').join("")
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

  APPS.calculs = {
    nom: "Calculs", icone: "1+2",
    html() {
      const h = ETAT.historique;
      const lignes = h.length ? h.map((l) => '<div class="nw-ligne">'
          + '<span class="nw-saisie">' + ech(l.entree) + '</span>'
          + (l.erreur
            ? '<span class="nw-erreur">' + ech(l.erreur) + '</span>'
            : '<span class="nw-resultat">' + ech(l.exact || l.approx) + '</span>'
              + (l.deux ? '<span class="nw-approche">≈ ' + ech(l.approx) + '</span>' : ''))
          + '</div>').join("")
        : '<p class="nw-vide">Tapez un calcul et validez. Par exemple : '
          + '<code>1/3+1/6</code>, <code>cos(π/6)</code>, '
          + '<code>binomialeCdf(10;0.3;4)</code>.</p>';
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
      return '<div class="nw-flux" id="nw-flux">' + lignes + '</div>' + panneau
        + '<div class="nw-saisie-boite">'
        + '<input type="text" class="nw-champ" id="nw-calc" autocomplete="off" '
        + 'spellcheck="false" autocapitalize="off" aria-label="Votre calcul" '
        + 'placeholder="votre calcul, puis Entrée">'
        + '<button type="button" class="nw-valider" id="nw-calc-ok">EXE</button></div>'
        + '<p class="nw-sous">La <b>forme exacte</b> est au-dessus, sa valeur approchée '
        + 'en dessous : sur une copie, c\'est la forme exacte qu\'on recopie. '
        + '<kbd>↑</kbd> rappelle le calcul précédent.</p>';
    },
    apres() {
      const flux = $("#nw-flux");
      if (flux) flux.scrollTop = flux.scrollHeight;
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
                           deux: !!r.montrerLesDeux, erreur: r.ok ? null : r.erreur });
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
  let curseur = { i: 0, x: 0 }, calculResultat = null;

  function fonctionsCompilees() {
    return ETAT.fonctions.map((d, i) => {
      if (!d.expr.trim()) return null;
      const c = CALC.fonction(d.expr, "x", contexte());
      return { i, nom: NOMS_F[i], expr: d.expr, visible: d.visible !== false,
               f: c.f, erreur: c.erreur, avert: c.avert, classe: COULEURS[i] };
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
    nom: "Fonctions", icone: "f(x)",
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
        return onglets + liste.map((c, i) => {
          const d = ETAT.fonctions[i];
          return '<div class="nw-rangee">'
            + '<label for="nw-f' + i + '">' + NOMS_F[i] + '(x) =</label>'
            + '<input type="text" class="nw-petit nw-large" id="nw-f' + i + '" data-cle="f' + i
            + '" value="' + ech(d.expr) + '" autocomplete="off" spellcheck="false">'
            + '<label><input type="checkbox" data-voir="' + i + '"'
            + (d.visible !== false ? " checked" : "") + '> tracer</label>'
            + (c && c.erreur ? '<span class="nw-erreur">' + ech(c.erreur) + '</span>' : "")
            + (c && !c.erreur && c.avert ? '<span class="nw-erreur">' + ech(c.avert) + '</span>' : "")
            + '</div>';
        }).join("")
          + '<p class="nw-sous">Écrivez la variable <code>x</code>. Les quatre fonctions '
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
          courbes: courbes.map((c) => ({ f: c.f, classe: c.classe })),
          curseur: act ? { x: curseur.x, y: ycur } : null,
          aide: "Courbes de " + courbes.map((c) => c.nom).join(", "),
        });
        return onglets + svg
          + '<p class="nw-curseur-info">'
          + (act ? '<span>' + ech(act.nom) + '(' + ech(fmt(curseur.x)) + ') = '
                   + ech(Number.isFinite(ycur) ? fmt(ycur) : "n\'existe pas") + '</span>'
                 : '<span>Aucune fonction à tracer.</span>')
          + '</p>'
          + '<div class="nw-legende">' + courbes.map((c) => '<span><i style="background:var(--nw-'
            + c.classe + ')"></i>' + ech(c.nom) + '(x) = ' + ech(c.expr) + '</span>').join("")
          + '</div>'
          + '<div class="nw-rangee" style="margin-top:.6rem">'
          + '<button type="button" class="nw-bouton" data-curseur="-1">◀ curseur</button>'
          + '<button type="button" class="nw-bouton" data-curseur="1">curseur ▶</button>'
          + (courbes.length > 1 ? '<button type="button" class="nw-bouton" id="nw-suivante">'
              + 'courbe suivante</button>' : "")
          + '<button type="button" class="nw-bouton" data-zoom="0.5">Zoom +</button>'
          + '<button type="button" class="nw-bouton" data-zoom="2">Zoom −</button>'
          + '<button type="button" class="nw-bouton" id="nw-recadrer">Recadrer</button>'
          + '</div>'
          + '<div class="nw-rangee">'
          + ["xmin", "xmax"].map((k) => '<label for="nw-' + k + '">' + k
            + '</label><input type="text" class="nw-petit" id="nw-' + k + '" data-fen="' + k
            + '" value="' + ech(ETAT.fenetre[k]) + '">').join("")
          + '<label><input type="checkbox" id="nw-auto"'
          + (ETAT.fenetre.auto ? " checked" : "") + '> Y automatique</label>'
          + '</div>'
          + (ETAT.fenetre.auto ? "" : '<div class="nw-rangee">'
            + ["ymin", "ymax"].map((k) => '<label for="nw-' + k + '">' + k
              + '</label><input type="text" class="nw-petit" id="nw-' + k + '" data-fen="' + k
              + '" value="' + ech(ETAT.fenetre[k]) + '">').join("") + '</div>')
          + blocCalculer(courbes, F);
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
      $$("[data-cle^='f']", page).forEach((c) => {
        const i = Number(c.dataset.cle.slice(1));
        c.addEventListener("change", () => {
          ETAT.fonctions[i].expr = c.value; garder(); redessiner();
        });
        c.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { ETAT.fonctions[i].expr = c.value; garder(); redessiner(); }
        });
      });
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
      const auto = $("#nw-auto");
      if (auto) auto.addEventListener("change", () => {
        ETAT.fenetre.auto = auto.checked;
        if (!auto.checked) {
          const F = fenetreAuto(fonctionsCompilees());
          ETAT.fenetre.ymin = Math.round(F.ymin * 1000) / 1000;
          ETAT.fenetre.ymax = Math.round(F.ymax * 1000) / 1000;
        }
        garder(); redessiner();
      });
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
        if (haut - bas < 1e-9) { bas -= 1; haut += 1; }
        const marge = (haut - bas) * 0.1;
        return onglets + tracer({
          xmin: rang0 - 1, xmax: rang0 + n + 1, ymin: bas - marge, ymax: haut + marge,
          points: pts.map((p) => ({ x: p.x, y: p.y, r: 2.2 })),
          aide: "Termes des suites",
        })
          + '<p class="nw-sous">Les termes sont des POINTS, pas une courbe : une suite '
          + 'n\'est définie que sur les entiers. Les relier serait une faute de lecture.</p>';
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
        return onglets + '<div class="nw-defile"><table class="nw-table"><thead><tr>'
          + '<th>#</th><th>valeur</th><th>effectif</th></tr></thead><tbody>' + corps
          + '</tbody></table></div>'
          + '<div class="nw-rangee" style="margin-top:.5rem">'
          + '<button type="button" class="nw-bouton" id="nw-ligne-plus">+ une ligne</button>'
          + '<button type="button" class="nw-bouton" id="nw-ligne-moins">− la dernière</button>'
          + '<button type="button" class="nw-bouton" id="nw-stats-vider">Tout effacer</button>'
          + '</div>'
          + '<p class="nw-sous">Un effectif de 1 partout, c\'est une liste brute. '
          + 'Les valeurs répétées sont regroupées automatiquement.</p>';
      }
      const R = CALC.STATS.unVariable(S.valeurs, S.effectifs);
      if (!R) return onglets + '<p class="nw-vide">Aucune donnée exploitable.</p>';
      if (vue === "resultats") {
        const l = (t, v) => '<dt>' + t + '</dt><dd>' + ech(fmt(v)) + '</dd>';
        return onglets + '<dl class="nw-valeurs">'
          + l("effectif total N", R.N) + l("somme Σxᵢnᵢ", R.somme)
          + l("Σxᵢ²nᵢ", R.sommeCarres) + l("moyenne x̄", R.moyenne)
          + l("variance V", R.variance) + l("écart type σ", R.ecartType)
          + l("écart type s (échantillon)", R.ecartTypeEch)
          + l("minimum", R.min) + l("maximum", R.max) + l("étendue", R.etendue)
          + l("premier quartile Q1", R.q1) + l("médiane Me", R.mediane)
          + l("troisième quartile Q3", R.q3) + l("écart interquartile", R.interquartile)
          + '<dt>mode</dt><dd>' + ech(R.modes.length === R.paires.length ? "aucun"
              : R.modes.map((m) => fmt(m)).join(" · ")) + '</dd>'
          + '</dl>'
          + '<p class="nw-sous"><b>Convention française des quartiles</b> : Q1 est la plus '
          + 'petite valeur telle qu\'au moins un quart de l\'effectif lui est inférieur ou '
          + 'égal — la valeur de rang ⌈N/4⌉. Un tableur interpole et ne donne donc pas '
          + 'toujours le même Q1. σ divise par N ; s divise par N−1.</p>';
      }
      const mode = ETAT.stats.graphe || "histogramme";
      const choix = '<div class="nw-rangee">'
        + [["histogramme", "Histogramme"], ["moustaches", "Boîte à moustaches"],
           ["cumul", "Effectifs cumulés"]].map(([v, t]) =>
          '<button type="button" class="nw-bouton" data-sgraphe="' + v + '"'
          + (mode === v ? ' aria-pressed="true"' : '') + '>' + t + '</button>').join("")
        + '</div>';
      let svg = "";
      if (mode === "histogramme") {
        const hmax = Math.max(...R.paires.map((p) => p[1]));
        const larg = R.paires.length > 1
          ? (R.paires[R.paires.length - 1][0] - R.paires[0][0]) / (R.paires.length - 1) : 1;
        svg = tracer({
          xmin: R.min - larg, xmax: R.max + larg, ymin: 0, ymax: hmax * 1.15,
          barres: R.paires.map((p) => ({ x0: p[0] - larg * 0.4, x1: p[0] + larg * 0.4, h: p[1] })),
          aide: "Histogramme des effectifs",
        });
      } else if (mode === "moustaches") {
        const dx = Math.max(1e-9, R.max - R.min);
        svg = tracer({
          xmin: R.min - dx * 0.12, xmax: R.max + dx * 0.12, ymin: 0, ymax: 1,
          barres: [{ x0: R.q1, x1: R.q3, h: 0.72 }],
          segments: [{ x1: R.min, y1: 0.36, x2: R.q1, y2: 0.36, classe: "axe" },
                     { x1: R.q3, y1: 0.36, x2: R.max, y2: 0.36, classe: "axe" },
                     { x1: R.mediane, y1: 0.02, x2: R.mediane, y2: 0.72, classe: "curseur" }],
          etiquettes: [{ x: R.min, y: 0.85, texte: "min " + fmt(R.min) },
                       { x: R.mediane, y: 0.93, texte: "Me " + fmt(R.mediane), ancre: "middle" },
                       { x: R.max, y: 0.85, texte: "max " + fmt(R.max), ancre: "end" }],
          aide: "Boîte à moustaches",
        });
      } else {
        let c = 0;
        const pts = R.paires.map((p) => { c += p[1]; return { x: p[0], y: c }; });
        svg = tracer({
          xmin: R.min - (R.etendue || 1) * 0.1, xmax: R.max + (R.etendue || 1) * 0.1,
          ymin: 0, ymax: R.N * 1.1, points: pts,
          courbes: [{ f: (x) => { let s = 0; for (const p of R.paires) if (p[0] <= x) s += p[1];
                                  return s; } }],
          aide: "Effectifs cumulés croissants",
        });
      }
      return onglets + choix + svg
        + (mode === "moustaches" ? '<p class="nw-sous">Les moustaches vont jusqu\'aux valeurs '
            + 'EXTRÊMES, convention du lycée — et non à 1,5 écart interquartile.</p>' : "");
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
        ETAT.stats.graphe = b.dataset.sgraphe; garder(); redessiner();
      }));
    },
  };

  /* ═══════════════ 10. Régressions ═══════════════════════════════════ */
  APPS.regression = {
    nom: "Régressions", icone: "ax+b",
    html() {
      const G = ETAT.regression;
      const n = Math.max(G.X.length, G.Y.length);
      let corps = "";
      for (let i = 0; i < n; i++) {
        corps += '<tr><td>' + (i + 1) + '</td>'
          + '<td><input class="nw-cellule" data-cle="rx' + i + '" data-rx="' + i + '" value="'
          + ech(G.X[i] === undefined ? "" : G.X[i]) + '" aria-label="x' + (i + 1) + '"></td>'
          + '<td><input class="nw-cellule" data-cle="ry' + i + '" data-ry="' + i + '" value="'
          + ech(G.Y[i] === undefined ? "" : G.Y[i]) + '" aria-label="y' + (i + 1) + '"></td></tr>';
      }
      const r = CALC.ajuster(G.X, G.Y, G.modele);
      const d = CALC.STATS.deuxVariables(G.X, G.Y);
      let bloc = "";
      if (r.erreur) bloc = '<p class="nw-erreur">' + ech(r.erreur) + '</p>';
      else {
        const lettres = "abcde".split("");
        bloc = '<dl class="nw-valeurs">'
          + '<dt>modèle</dt><dd>y = ' + ech(r.forme) + '</dd>'
          + r.params.map((v, i) => '<dt>' + lettres[i] + '</dt><dd>' + ech(fmt(v)) + '</dd>').join("")
          + (r.r !== undefined ? '<dt>coefficient r</dt><dd>' + ech(fmt(r.r)) + '</dd>' : "")
          + '<dt>r²</dt><dd>' + ech(fmt(r.r2)) + '</dd>'
          + (d ? '<dt>covariance</dt><dd>' + ech(fmt(d.covariance)) + '</dd>'
               + '<dt>x̄ · ȳ</dt><dd>' + ech(fmt(d.moyenneX)) + " · " + ech(fmt(d.moyenneY))
               + '</dd>' : "")
          + '</dl>';
      }
      let svg = "";
      if (d) {
        const dx = Math.max(1e-9, Math.max(...d.X) - Math.min(...d.X));
        const dy = Math.max(1e-9, Math.max(...d.Y) - Math.min(...d.Y));
        svg = tracer({
          xmin: Math.min(...d.X) - dx * 0.1, xmax: Math.max(...d.X) + dx * 0.1,
          ymin: Math.min(...d.Y) - dy * 0.15, ymax: Math.max(...d.Y) + dy * 0.15,
          courbes: r.erreur ? [] : [{ f: r.f, classe: "c2" }],
          points: d.X.map((x, i) => ({ x, y: d.Y[i] })),
          aide: "Nuage de points et courbe ajustée",
        });
      }
      return '<div class="nw-rangee">'
        + '<label for="nw-modele">modèle</label>'
        + '<select class="nw-petit" id="nw-modele">'
        + Object.keys(CALC.MODELES).map((k) => '<option value="' + k + '"'
          + (G.modele === k ? " selected" : "") + '>' + ech(CALC.MODELES[k].titre)
          + ' — ' + ech(CALC.MODELES[k].forme) + '</option>').join("")
        + '</select>'
        + '<button type="button" class="nw-bouton" id="nw-rligne-plus">+ un point</button>'
        + '<button type="button" class="nw-bouton" id="nw-rligne-moins">− le dernier</button>'
        + '</div>'
        + svg + bloc
        + '<div class="nw-rangee" style="margin-top:.6rem">'
        + '<label for="nw-pred">prédire pour x =</label>'
        + '<input type="text" class="nw-petit" id="nw-pred" value="' + ech(G.pred || "") + '">'
        + '<span class="nw-resultat" style="text-align:left">'
        + (G.pred !== undefined && G.pred !== "" && !r.erreur
            ? (() => { const x = nombreSaisi(G.pred);
                       return x === null ? "—" : "y ≈ " + ech(fmt(r.f(x))); })()
            : "") + '</span></div>'
        + '<div class="nw-defile"><table class="nw-table"><thead><tr><th>#</th><th>x</th>'
        + '<th>y</th></tr></thead><tbody>' + corps + '</tbody></table></div>'
        + '<p class="nw-sous">r² est calculé sur les <b>points d\'origine</b>, jamais sur '
        + 'les données transformées : un ajustement exponentiel qui paraît parfait en '
        + 'échelle logarithmique peut être médiocre sur les vraies ordonnées.</p>';
    },
    apres() {
      const m = $("#nw-modele");
      if (m) m.addEventListener("change", () => {
        ETAT.regression.modele = m.value; garder(); redessiner();
      });
      $$("[data-rx]", page).forEach((c) => c.addEventListener("change", () => {
        const v = nombreSaisi(c.value);
        if (v === null) { dire("« " + c.value + " » n'est pas un nombre.", "e-erreur"); return; }
        ETAT.regression.X[Number(c.dataset.rx)] = v; dire(""); garder(); redessiner();
      }));
      $$("[data-ry]", page).forEach((c) => c.addEventListener("change", () => {
        const v = nombreSaisi(c.value);
        if (v === null) { dire("« " + c.value + " » n'est pas un nombre.", "e-erreur"); return; }
        ETAT.regression.Y[Number(c.dataset.ry)] = v; dire(""); garder(); redessiner();
      }));
      const p = $("#nw-rligne-plus");
      if (p) p.addEventListener("click", () => {
        ETAT.regression.X.push(0); ETAT.regression.Y.push(0); garder(); redessiner();
      });
      const mo = $("#nw-rligne-moins");
      if (mo) mo.addEventListener("click", () => {
        if (ETAT.regression.X.length <= 2) {
          dire("Deux points au minimum.", "e-erreur"); return;
        }
        ETAT.regression.X.pop(); ETAT.regression.Y.pop(); garder(); redessiner();
      });
      const pr = $("#nw-pred");
      if (pr) {
        const maj = () => { ETAT.regression.pred = pr.value; garder(); redessiner(); };
        pr.addEventListener("change", maj);
        pr.addEventListener("keydown", (e) => { if (e.key === "Enter") maj(); });
      }
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
      const champs = L.params.map((nom) => '<label for="nw-pp-' + nom + '">'
        + ech(LIB_PARAM[nom] || nom) + '</label>'
        + '<input type="text" class="nw-petit" id="nw-pp-' + nom + '" data-pp="' + nom
        + '" value="' + ech(P[nom]) + '">').join("");
      const kChamps = q === "inverse"
        ? '<label for="nw-pseuil">seuil</label><input type="text" class="nw-petit" '
          + 'id="nw-pseuil" data-pp="seuil" value="' + ech(P.seuil) + '">'
        : '<label for="nw-pk">' + (q === "entre" ? "a" : discret ? "k" : "x") + '</label>'
          + '<input type="text" class="nw-petit" id="nw-pk" data-pp="k" value="' + ech(P.k) + '">'
          + (q === "entre" ? '<label for="nw-pk2">b</label><input type="text" class="nw-petit" '
              + 'id="nw-pk2" data-pp="k2" value="' + ech(P.k2) + '">' : "");
      const E = L.esperance ? L.esperance(P) : NaN, S = L.ecart ? L.ecart(P) : NaN;
      return '<div class="nw-rangee">'
        + '<label for="nw-loi">loi</label><select class="nw-petit" id="nw-loi">'
        + Object.keys(LOIS_UI).map((c) => '<option value="' + c + '"'
          + (P.loi === c ? " selected" : "") + '>' + ech(LOIS_UI[c].nom) + '</option>').join("")
        + '</select>' + champs + '</div>'
        + '<div class="nw-rangee">'
        + '<label for="nw-question">question</label><select class="nw-petit" id="nw-question">'
        + [["egal", "P(X = k)"], ["inf", "P(X ⩽ k)"], ["sup", "P(X ⩾ k)"],
           ["entre", "P(a ⩽ X ⩽ b)"], ["inverse", "k pour un seuil donné"]]
          .map(([v, t]) => '<option value="' + v + '"' + (q === v ? " selected" : "")
            + '>' + ech(t) + '</option>').join("")
        + '</select>' + kChamps + '</div>'
        + svg
        + '<div class="nw-ligne" style="margin-top:.5rem">'
        + '<span class="nw-saisie">' + ech(formule) + '</span>'
        + '<span class="nw-resultat">' + ech(Number.isFinite(valeur) ? fmt(valeur) : "—")
        + '</span></div>'
        + '<dl class="nw-valeurs">'
        + (Number.isFinite(E) ? '<dt>espérance E(X)</dt><dd>' + ech(fmt(E)) + '</dd>' : "")
        + (Number.isFinite(S) ? '<dt>écart type σ(X)</dt><dd>' + ech(fmt(S)) + '</dd>' : "")
        + '</dl>'
        + (q === "egal" && !discret
            ? '<p class="nw-sous">Pour une loi continue, la probabilité d\'une valeur '
              + 'EXACTE est nulle : seules les probabilités d\'intervalles ont un sens. '
              + 'C\'est la densité qu\'on lit sur la courbe, pas une probabilité.</p>' : "")
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
      const qu = $("#nw-question");
      if (qu) qu.addEventListener("change", () => {
        ETAT.probas.question = qu.value; garder(); redessiner();
      });
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
    nom: "Équations", icone: "x=?",
    chapitre: ["03-fonctions-variations", "Fonctions et variations"],
    html() {
      const E = ETAT.equations;
      const choix = '<div class="nw-onglets">'
        + [["polynome", "Polynôme"], ["systeme", "Système linéaire"]].map(([v, t]) =>
          '<button type="button" class="nw-onglet" data-emode="' + v + '" aria-selected="'
          + (E.mode === v) + '">' + t + '</button>').join("") + '</div>';
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

  /* ═══════════════ 13. Réglages ══════════════════════════════════════ */
  APPS.reglages = {
    nom: "Réglages", icone: "⚙",
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
        + 'navigateur, sur cet appareil.</p>';
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
