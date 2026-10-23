/* Le tableau blanc — l'appareil.

   « rendu.js » sait dessiner un élément ; ce fichier-ci sait tout le
   reste : la caméra, les outils, la sélection, le texte, l'historique, la
   mémoire, les fichiers. Il ne contient aucune géométrie de trait.

   Le modèle est celui d'Excalidraw, champ pour champ, et c'est un choix,
   pas une commodité : un tableau enregistré ici s'ouvre sur excalidraw.com,
   et un fichier « .excalidraw » trouvé ailleurs s'ouvre ici. */
(function () {
  "use strict";
  const R = window.TB_RENDU;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const section = $("#tableau");
  if (!section || !R) return;
  const scene = $("#tb-scene");
  const toile = $("#tb-toile");
  const ctx = toile.getContext("2d");
  const saisie = $("#tb-saisie");
  const panneau = $("#tb-props");
  const etatLigne = $("#tb-etat");

  /* ═══════════════ 1. Les constantes ══════════════════════════════════
     La palette est celle d'Excalidraw (Open Color) : elle est faite pour
     rester lisible une fois inversée en mode sombre. */
  const OC = {
    gray: ["#f8f9fa", "#e9ecef", "#ced4da", "#868e96", "#343a40"],
    red: ["#fff5f5", "#ffc9c9", "#ff8787", "#fa5252", "#e03131"],
    pink: ["#fff0f6", "#fcc2d7", "#f783ac", "#e64980", "#c2255c"],
    grape: ["#f8f0fc", "#eebefa", "#da77f2", "#be4bdb", "#9c36b5"],
    violet: ["#f3f0ff", "#d0bfff", "#9775fa", "#7950f2", "#6741d9"],
    blue: ["#e7f5ff", "#a5d8ff", "#4dabf7", "#228be6", "#1971c2"],
    cyan: ["#e3fafc", "#99e9f2", "#3bc9db", "#15aabf", "#0c8599"],
    teal: ["#e6fcf5", "#96f2d7", "#38d9a9", "#12b886", "#099268"],
    green: ["#ebfbee", "#b2f2bb", "#69db7c", "#40c057", "#2f9e44"],
    yellow: ["#fff9db", "#ffec99", "#ffd43b", "#fab005", "#f08c00"],
    orange: ["#fff4e6", "#ffd8a8", "#ffa94d", "#fd7e14", "#e8590c"],
    bronze: ["#f8f1ee", "#eaddd7", "#d2bab0", "#a18072", "#846358"],
  };
  const NOIR = "#1e1e1e";
  const TRAITS = [NOIR, OC.red[4], OC.green[4], OC.blue[4], OC.yellow[4]];
  const FONDS = ["transparent", OC.red[1], OC.green[1], OC.blue[1], OC.yellow[1]];
  /* Les douze couleurs de post-it de Whiteboard, prises dans la même
     palette pour qu'elles s'inversent proprement. */
  const POSTITS = [OC.yellow[1], OC.pink[1], OC.green[1], OC.blue[1], OC.orange[1], OC.violet[1],
                   OC.cyan[1], OC.teal[1], OC.grape[1], OC.red[1], OC.gray[1], OC.bronze[1]];
  const SURLIGNEURS = [OC.yellow[2], OC.green[2], OC.blue[2], OC.pink[2], OC.orange[2], OC.violet[2]];
  const FONDS_TABLEAU = [["#ffffff", "Blanc"], ["#f8f9fa", "Gris clair"], ["#f5faff", "Bleu pastel"],
                         ["#f8f0fc", "Violet pastel"], ["#ebfbee", "Vert pastel"],
                         ["#fffce8", "Jaune pastel"], ["#fff0f6", "Rose pastel"]];
  const GRILLES = [["aucune", "Aucune"], ["points", "Points"], ["carreaux", "Carreaux"],
                   ["grands", "Grands carreaux"], ["millimetre", "Millimétré"],
                   ["lignes", "Lignes serrées"], ["lignes-larges", "Lignes larges"],
                   ["iso", "Isométrique"], ["losanges", "Losanges"]];
  const LIRE_CSS = (v, sinon) => {
    try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || sinon; }
    catch (e) { return sinon; }
  };
  /* Les familles d'Excalidraw, par leur numéro, ramenées à TROIS polices
     déjà présentes sur la machine : on ne télécharge aucune fonte. Un
     fichier venu d'Excalidraw garde son numéro — il retrouvera sa vraie
     police là-bas. */
  const SANS = LIRE_CSS("--sans", "system-ui, sans-serif");
  const MONO = LIRE_CSS("--mono", "ui-monospace, monospace");
  /* La police « manuscrite » : la première qui EXISTE sur la machine. On
     ne peut pas s'en remettre au mot-clé « cursive » — sans police
     manuscrite installée, Chrome sous Linux le résout en une police à
     empattements, et « Routeur R1 » sortait en Times. On mesure donc
     chaque candidate : une police absente prend la largeur de sa police
     de repli, une police présente non. À défaut, la police ordinaire. */
  const MAIN = (() => {
    const c = document.createElement("canvas").getContext("2d");
    const essai = "mmmmmmmmmlli WwQ@ 0123";
    const largeur = (f) => { c.font = "40px " + f; return c.measureText(essai).width; };
    const temoins = ["monospace", "serif", "sans-serif"].map(largeur);
    const presente = (nom) => ["monospace", "serif", "sans-serif"]
      .some((repli, i) => largeur('"' + nom + '", ' + repli) !== temoins[i]);
    const trouvees = ["Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", "Comic Neue",
                      "Patrick Hand", "Kalam"].filter(presente);
    return trouvees.length ? trouvees.map((f) => '"' + f + '"').join(", ") + ", " + SANS : SANS;
  })();
  const POLICE = (f) => (f === 3 || f === 8 ? MONO : f === 1 || f === 5 ? MAIN : SANS);
  const TAILLES = [[16, "S"], [20, "M"], [28, "L"], [36, "XL"]];
  const ECRIT_CLE = "ciel-tableau-v1";
  const PAS_GRILLE = 20;
  const ZMIN = 0.05, ZMAX = 10;
  const BLEU_SEL = "#4c6ef5";
  const PAD = 5;               // BOUND_TEXT_PADDING d'Excalidraw
  const PAD_POSTIT = 14;

  /* ═══════════════ 2. L'état ═════════════════════════════════════════ */
  let elements = [];
  const etat = {
    outil: "selection", verrou: false,
    scrollX: 0, scrollY: 0, zoom: 1,
    fond: "#ffffff", grille: "points", theme: "site",
    titre: "Tableau sans titre", cote: "gauche", encre: true, format: false,
    /* Le style par défaut est celui de Whiteboard : trait NET, fond plein,
       police ordinaire. Le trait tremblé d'Excalidraw reste à un clic, dans
       « Format ». */
    courant: {
      strokeColor: NOIR, backgroundColor: "transparent", fillStyle: "solid",
      strokeWidth: 2, strokeStyle: "solid", roughness: 0, arrondi: true, opacity: 100,
      fontFamily: 2, fontSize: 20, textAlign: "left",
      startArrowhead: null, endArrowhead: "arrow",
      postit: POSTITS[0], surligneur: SURLIGNEURS[0], surligneurW: 6,
    },
    /* Les trois stylos de Whiteboard, réglés chacun pour soi. */
    stylos: [{ c: NOIR, w: 1.6 }, { c: OC.red[4], w: 1.6 }, { c: OC.blue[4], w: 1.6 }],
    stylo: 0,
  };
  /* Les douze encres de Whiteboard, et ses six calibres. */
  const ENCRES = [[NOIR, "Noir"], ["#ffffff", "Blanc"], [OC.gray[3], "Gris"], [OC.red[4], "Rouge"],
                  [OC.orange[3], "Orange"], [OC.yellow[3], "Jaune"], [OC.green[4], "Vert"],
                  [OC.blue[2], "Bleu clair"], [OC.blue[4], "Bleu foncé"], [OC.violet[4], "Violet"],
                  [OC.pink[3], "Rose"], [OC.bronze[4], "Marron"]];
  const CALIBRES = [0.6, 1, 1.6, 2.4, 3.4, 5];
  let selection = new Set();
  let edition = null;                 // l'élément texte en cours de frappe
  let espace = false;                 // barre d'espace tenue : la main
  let geste = null;                   // ce que fait le pointeur en ce moment
  const pointeurs = new Map();        // les doigts posés (pincement)
  let dernierePos = null;             // la souris, en coordonnées de scène
  let laser = [];                     // la traînée du pointeur laser
  let traineeGomme = [];
  let fantomes = new Set();           // ce que la gomme va effacer
  let pressePapiers = null;

  /* ── l'historique : une photographie de la scène par action ── */
  let pile = [], curseurPile = -1;
  function memoriser() {
    const photo = JSON.stringify(elements);
    if (pile[curseurPile] === photo) return;
    pile = pile.slice(0, curseurPile + 1);
    pile.push(photo);
    if (pile.length > 150) pile.shift();
    curseurPile = pile.length - 1;
    garder();
    majHistorique();
  }
  function revenir(sens) {
    if (edition) finirEdition();
    const i = curseurPile + sens;
    if (i < 0 || i >= pile.length) return;
    curseurPile = i;
    elements = JSON.parse(pile[i]);
    selection = new Set([...selection].filter((id) => parId(id)));
    garder(); majHistorique(); majPanneau(); demander();
  }
  function majHistorique() {
    $("#tb-annuler").disabled = curseurPile <= 0;
    $("#tb-retablir").disabled = curseurPile >= pile.length - 1;
  }

  /* ── la mémoire du navigateur ──────────────────────────────────────
     La scène reste dans CE navigateur ; rien n'est envoyé. Écrite en
     différé : un tracé à main levée change la scène soixante fois par
     seconde, on n'écrit pas soixante fois. */
  let minuterieGarde = 0;
  function marquerSauve(fait) {
    const m = $("#tb-sauve");
    if (m) m.textContent = fait ? "✓ Enregistré" : "Enregistrement…";
  }
  function garder() {
    marquerSauve(false);
    clearTimeout(minuterieGarde);
    minuterieGarde = setTimeout(() => {
      try {
        localStorage.setItem(ECRIT_CLE, JSON.stringify({
          elements, fond: etat.fond, grille: etat.grille, theme: etat.theme,
          scrollX: etat.scrollX, scrollY: etat.scrollY, zoom: etat.zoom, courant: etat.courant,
          titre: etat.titre, cote: etat.cote, encre: etat.encre, stylos: etat.stylos, stylo: etat.stylo,
        }));
        marquerSauve(true);
      } catch (e) { /* stockage plein ou bloqué : le tableau marche quand même */ }
    }, 250);
  }
  function relire() {
    try {
      const lu = JSON.parse(localStorage.getItem(ECRIT_CLE) || "null");
      if (!lu) return;
      if (Array.isArray(lu.elements)) elements = lu.elements.map(normaliser).filter(Boolean);
      ["fond", "grille", "theme", "scrollX", "scrollY", "zoom", "titre", "cote", "encre", "stylo"].forEach((k) => {
        if (lu[k] !== undefined && lu[k] !== null) etat[k] = lu[k];
      });
      if (lu.courant) Object.assign(etat.courant, lu.courant);
      if (Array.isArray(lu.stylos) && lu.stylos.length === 3) etat.stylos = lu.stylos;
    } catch (e) { /* mémoire illisible : on repart d'un tableau vierge */ }
  }

  /* ═══════════════ 3. Les éléments ═══════════════════════════════════ */
  const graine = () => Math.floor(Math.random() * 2 ** 31);
  const nouvelId = () => {
    const a = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let s = "";
    for (let i = 0; i < 21; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  };
  const parId = (id) => elements.find((e) => e.id === id);
  const estLie = (el) => el.type === "text" && el.containerId;
  const estPostit = (el) => !!(el && el.customData && el.customData.postit);
  const estSurligneur = (el) => !!(el && el.customData && el.customData.surligneur);
  const conteneur = (el) => /^(rectangle|diamond|ellipse)$/.test(el.type);
  const texteDe = (c) => {
    const b = (c.boundElements || []).find((x) => x.type === "text");
    return b ? parId(b.id) : null;
  };

  function nouvelElement(type, x, y, extra) {
    const c = etat.courant;
    const rond = c.arrondi
      ? (type === "rectangle" ? { type: 3 } : /^(diamond|line|arrow)$/.test(type) ? { type: 2 } : null)
      : null;
    return Object.assign({
      id: nouvelId(), type, x, y, width: 0, height: 0, angle: 0,
      strokeColor: c.strokeColor, backgroundColor: c.backgroundColor, fillStyle: c.fillStyle,
      strokeWidth: c.strokeWidth, strokeStyle: c.strokeStyle, roughness: c.roughness,
      opacity: c.opacity, groupIds: [], frameId: null, index: null, roundness: rond,
      seed: graine(), version: 1, versionNonce: graine(), isDeleted: false,
      boundElements: null, updated: Date.now(), link: null, locked: false,
    }, extra || {});
  }
  function toucher(el) {
    el.version = (el.version || 0) + 1;
    el.versionNonce = graine();
    el.updated = Date.now();
  }

  /* Un texte lié dont le conteneur a disparu (fichier abîmé, image
     écartée à l'ouverture) redevient un texte libre : sans ça, il serait
     peint « après son conteneur », c'est-à-dire jamais. */
  function reparer() {
    const ids = new Set(elements.map((e) => e.id));
    elements.forEach((e) => {
      if (e.type === "text" && e.containerId && !ids.has(e.containerId)) { e.containerId = null; mesurerLibre(e); }
      if (e.boundElements) {
        e.boundElements = e.boundElements.filter((b) => ids.has(b.id));
        if (!e.boundElements.length) e.boundElements = null;
      }
    });
    elements.forEach((e) => {
      if (e.type === "text" && e.containerId) {
        const c = parId(e.containerId);
        if (!(c.boundElements || []).some((b) => b.id === e.id)) {
          c.boundElements = (c.boundElements || []).concat([{ type: "text", id: e.id }]);
        }
      }
    });
  }

  /* Un fichier venu d'ailleurs peut manquer de champs (une ancienne
     version d'Excalidraw, un fichier écrit à la main) : on complète, sans
     rien inventer de ce qui est présent. */
  function normaliser(el) {
    if (!el || typeof el !== "object" || el.isDeleted || !el.type) return null;
    const def = {
      angle: 0, strokeColor: NOIR, backgroundColor: "transparent", fillStyle: "hachure",
      strokeWidth: 1, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [],
      frameId: null, roundness: null, seed: graine(), version: 1, versionNonce: graine(),
      isDeleted: false, boundElements: null, updated: Date.now(), link: null, locked: false,
      width: 0, height: 0, x: 0, y: 0,
    };
    const e = Object.assign({}, def, el);
    if (!e.id) e.id = nouvelId();
    if (e.type === "text") {
      e.text = String(e.text || "");
      if (e.originalText == null) e.originalText = e.text;
      e.fontSize = e.fontSize || 20;
      e.fontFamily = e.fontFamily || 5;
      e.textAlign = e.textAlign || "left";
      e.verticalAlign = e.verticalAlign || "top";
      e.lineHeight = e.lineHeight || 1.25;
      if (e.containerId === undefined) e.containerId = null;
    }
    if ((e.type === "line" || e.type === "arrow" || e.type === "freedraw") && !Array.isArray(e.points)) {
      e.points = [[0, 0], [e.width || 0, e.height || 0]];
    }
    return e;
  }

  /* ═══════════════ 4. Le texte ════════════════════════════════════════
     Mesuré sur un canevas à part, avec la police réelle : la largeur
     d'une ligne dépend de la fonte, et une boîte de texte mal mesurée
     déborde de son post-it. */
  const mesureur = document.createElement("canvas").getContext("2d");
  function largeurTexte(t, el, taille) {
    mesureur.font = (taille || el.fontSize) + "px " + POLICE(el.fontFamily);
    return mesureur.measureText(t).width;
  }
  function couper(texte, el, max, taille) {
    if (!max || max <= 0) return texte.split("\n");
    const sortie = [];
    texte.split("\n").forEach((ligne) => {
      const mots = ligne.split(/(\s+)/);
      let cour = "";
      mots.forEach((m) => {
        const essai = cour + m;
        if (largeurTexte(essai.trimEnd(), el, taille) <= max || !cour.trim()) {
          // un mot plus long que la boîte est coupé à la lettre
          if (largeurTexte(essai.trimEnd(), el, taille) > max && !cour.trim()) {
            let morceau = "";
            for (const ch of m) {
              if (largeurTexte(morceau + ch, el, taille) > max && morceau) { sortie.push(morceau); morceau = ""; }
              morceau += ch;
            }
            cour = morceau;
          } else cour = essai;
        } else {
          sortie.push(cour.trimEnd());
          cour = m.trimStart();
        }
      });
      sortie.push(cour.trimEnd());
    });
    return sortie;
  }
  function mesurerLibre(el) {
    const lignes = (el.originalText != null ? el.originalText : el.text).split("\n");
    el.text = lignes.join("\n");
    el.width = Math.max(1, ...lignes.map((l) => largeurTexte(l, el)));
    el.height = lignes.length * el.fontSize * (el.lineHeight || 1.25);
  }
  /* Le texte lié suit son conteneur : retour à la ligne à sa largeur,
     centré dedans ; et si le texte est plus haut que la forme, c'est la
     forme qui grandit — comme Excalidraw. Un post-it, lui, RÉDUIT d'abord
     sa police, comme Whiteboard, et ne grandit qu'en dernier recours. */
  function placerLie(t) {
    const c = parId(t.containerId);
    if (!c) return;
    const pad = estPostit(c) ? PAD_POSTIT : PAD;
    const facteur = c.type === "ellipse" ? Math.SQRT1_2 : c.type === "diamond" ? 0.5 : 1;
    const maxW = Math.max(10, c.width * facteur - pad * 2);
    const brut = t.originalText != null ? t.originalText : t.text;
    const lh = t.lineHeight || 1.25;
    if (estPostit(c)) {
      const voulue = c.customData.taille || 28;
      let taille = voulue;
      while (taille > 12 && couper(brut, t, maxW, taille).length * taille * lh > c.height - pad * 2) taille -= 2;
      t.fontSize = taille;
    }
    const lignes = couper(brut, t, maxW);
    t.text = lignes.join("\n");
    t.width = Math.min(maxW, Math.max(1, ...lignes.map((l) => largeurTexte(l, t))));
    t.height = lignes.length * t.fontSize * lh;
    const hUtile = c.height * facteur - pad * 2;
    if (t.height > hUtile) { c.height = (t.height + pad * 2) / facteur; toucher(c); }
    t.x = t.textAlign === "left" ? c.x + (c.width - maxW) / 2
      : t.textAlign === "right" ? c.x + (c.width + maxW) / 2 - t.width
      : c.x + c.width / 2 - t.width / 2;
    t.y = t.verticalAlign === "top" ? c.y + pad
      : t.verticalAlign === "bottom" ? c.y + c.height - pad - t.height
      : c.y + c.height / 2 - t.height / 2;
    t.angle = c.angle || 0;
  }
  function replacerLies(liste) {
    (liste || elements).forEach((c) => {
      if (!conteneur(c)) return;
      const t = texteDe(c);
      if (t) placerLie(t);
    });
  }

  /* ═══════════════ 5. La caméra ═══════════════════════════════════════
     Écran = (scène + défilement) × zoom : la convention d'Excalidraw, qui
     garde ses valeurs de scrollX / scrollY / zoom compatibles. */
  const versScene = (sx, sy) => ({ x: sx / etat.zoom - etat.scrollX, y: sy / etat.zoom - etat.scrollY });
  const versEcran = (x, y) => ({ x: (x + etat.scrollX) * etat.zoom, y: (y + etat.scrollY) * etat.zoom });
  function posPointeur(e) {
    const r = toile.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }
  function zoomerEn(nouveau, sx, sy) {
    nouveau = Math.max(ZMIN, Math.min(ZMAX, nouveau));
    const w = versScene(sx, sy);
    etat.zoom = nouveau;
    etat.scrollX = sx / nouveau - w.x;
    etat.scrollY = sy / nouveau - w.y;
    majZoom(); garder(); demander();
  }
  function zoomerCentre(facteur) {
    zoomerEn(etat.zoom * facteur, toile.clientWidth / 2, toile.clientHeight / 2);
  }
  function majZoom() {
    $("#tb-zoom-val").textContent = Math.round(etat.zoom * 100) + " %";
    if (edition) placerSaisie();
  }
  function boiteDe(liste) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    liste.forEach((el) => {
      const b = R.boite(el);
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    });
    return liste.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  /* « Ajuster à l'écran » : la boîte de TOUT, centrée, sans jamais
     grossir au-delà de 100 % — un seul post-it ne doit pas remplir l'écran. */
  function ajuster(liste) {
    const b = boiteDe(liste || elements);
    if (!b) { etat.scrollX = toile.clientWidth / 2; etat.scrollY = toile.clientHeight / 2; etat.zoom = 1; }
    else {
      const W = toile.clientWidth, H = toile.clientHeight, m = 60;
      const z = Math.max(ZMIN, Math.min(1, (W - m * 2) / (b.w || 1), (H - m * 2) / (b.h || 1)));
      etat.zoom = z;
      etat.scrollX = W / 2 / z - (b.x + b.w / 2);
      etat.scrollY = H / 2 / z - (b.y + b.h / 2);
    }
    majZoom(); garder(); demander();
  }

  /* ═══════════════ 6. La peinture ═════════════════════════════════════ */
  let demande = 0;
  function demander() {
    if (!demande) demande = requestAnimationFrame(() => { demande = 0; peindre(); });
  }
  const cacheChemins = new Map();
  function cleForme(el) {
    let s = el.type + "|" + el.width + "|" + el.height + "|" + el.seed + "|" + el.strokeColor + "|"
      + el.backgroundColor + "|" + el.fillStyle + "|" + el.strokeWidth + "|" + el.strokeStyle + "|"
      + el.roughness + "|" + JSON.stringify(el.roundness) + "|" + el.startArrowhead + "|" + el.endArrowhead;
    if (el.points) {
      let somme = 0;
      for (const p of el.points) somme += p[0] * 3.1 + p[1] * 7.7;
      s += "|" + el.points.length + "|" + somme.toFixed(2);
    }
    return s;
  }
  function cheminsDe(el) {
    const cle = cleForme(el);
    const c = cacheChemins.get(el.id);
    if (c && c.cle === cle) return c.ops;
    const ops = R.chemins(el);
    cacheChemins.set(el.id, { cle, ops });
    return ops;
  }

  function dessinerElement(c, el, fantome) {
    if (edition && edition.id === el.id) return;
    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, (el.opacity == null ? 100 : el.opacity) / 100)) * (fantome ? 0.2 : 1);
    const b = R.boite(el);
    if (el.angle) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      c.translate(cx, cy); c.rotate(el.angle); c.translate(-cx, -cy);
    }
    c.translate(el.x, el.y);
    if (estSurligneur(el)) c.globalCompositeOperation = "multiply";
    if (estPostit(el)) {
      // l'ombre portée d'une note collée : ce qui la distingue d'un rectangle
      c.shadowColor = "rgba(0,0,0,.18)"; c.shadowBlur = 10; c.shadowOffsetY = 3;
    }
    if (el.type === "text") {
      dessinerTexte(c, el);
    } else {
      cheminsDe(el).forEach((op) => {
        if (!op.couleur || op.couleur === "transparent") return;
        if (!op.p) op.p = new Path2D(op.d);
        if (op.mode === "fond") { c.fillStyle = op.couleur; c.fill(op.p); }
        else {
          c.strokeStyle = op.couleur; c.lineWidth = op.largeur || 1;
          c.lineCap = "round"; c.lineJoin = "round";
          c.setLineDash(op.tirets || []);
          c.stroke(op.p);
        }
        c.shadowColor = "transparent";
      });
    }
    c.restore();
  }
  function dessinerTexte(c, el) {
    const lignes = String(el.text).split("\n");
    const lh = el.fontSize * (el.lineHeight || 1.25);
    c.font = el.fontSize + "px " + POLICE(el.fontFamily);
    c.fillStyle = el.strokeColor;
    c.textBaseline = "middle";
    c.textAlign = el.textAlign === "center" ? "center" : el.textAlign === "right" ? "right" : "left";
    const x = el.textAlign === "center" ? el.width / 2 : el.textAlign === "right" ? el.width : 0;
    lignes.forEach((l, i) => c.fillText(l, x, i * lh + lh / 2));
  }

  /* La scène entière, dans l'ordre : les textes liés juste après leur
     conteneur, quel que soit leur rang dans la liste. */
  function dessinerScene(c, liste, visible) {
    liste.forEach((el) => {
      if (estLie(el)) return;
      if (visible) {
        const b = R.boite(el), m = 40 + (el.strokeWidth || 1) * 4;
        if (b.x > visible.x1 + m || b.y > visible.y1 + m || b.x + b.w < visible.x0 - m
            || b.y + b.h < visible.y0 - m) return;
      }
      dessinerElement(c, el, fantomes.has(el.id));
      if (conteneur(el)) {
        const t = texteDe(el);
        if (t) dessinerElement(c, t, fantomes.has(el.id));
      }
    });
  }

  function peindre() {
    const dpr = window.devicePixelRatio || 1;
    const W = toile.clientWidth, H = toile.clientHeight;
    if (toile.width !== Math.round(W * dpr) || toile.height !== Math.round(H * dpr)) {
      toile.width = Math.round(W * dpr); toile.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = etat.fond;
    ctx.fillRect(0, 0, W, H);
    dessinerGrille(W, H);
    const z = etat.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * z * etat.scrollX, dpr * z * etat.scrollY);
    const a = versScene(0, 0), b = versScene(W, H);
    dessinerScene(ctx, elements, { x0: a.x, y0: a.y, x1: b.x, y1: b.y });
    dessinerSelection();
    dessinerEphemeres();
    $("#tb-accueil").hidden = elements.length > 0 || !!geste;
    placerContexte();
  }

  /* ── la grille ────────────────────────────────────────────────────
     Tracée en coordonnées d'écran, au pas de la scène. Quand le zoom
     l'écrase, son pas se multiplie par cinq ; quand elle s'éclaircit
     encore, elle s'efface en fondu — une grille saturée devient un gris
     uniforme et ne sert plus à rien (Whiteboard fait de même). */
  function dessinerGrille(W, H) {
    const g = etat.grille;
    if (g === "aucune") return;
    const z = etat.zoom;
    let pas = { points: 20, carreaux: 20, grands: 60, millimetre: 10, lignes: 28, "lignes-larges": 44,
                iso: 30, losanges: 30 }[g] || 20;
    while (pas * z < 9) pas *= 5;
    const alpha = Math.max(0, Math.min(1, (pas * z - 6) / 14));
    if (!alpha) return;
    const o = versEcran(0, 0);
    const s = pas * z;
    ctx.save();
    ctx.lineWidth = 1;
    const encre = (a) => "rgba(30,30,30," + (a * alpha).toFixed(3) + ")";
    const ligne = (x1, y1, x2, y2) => { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); };
    const debX = ((o.x % s) + s) % s, debY = ((o.y % s) + s) % s;
    if (g === "points") {
      ctx.fillStyle = encre(0.3);
      const r = Math.max(0.8, Math.min(1.6, s / 16));
      for (let x = debX; x < W; x += s) for (let y = debY; y < H; y += s) {
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
    } else if (g === "carreaux" || g === "grands" || g === "millimetre") {
      ctx.beginPath(); ctx.strokeStyle = encre(g === "millimetre" ? 0.07 : 0.1);
      for (let x = debX; x < W; x += s) ligne(Math.round(x) + 0.5, 0, Math.round(x) + 0.5, H);
      for (let y = debY; y < H; y += s) ligne(0, Math.round(y) + 0.5, W, Math.round(y) + 0.5);
      ctx.stroke();
      if (g === "millimetre") {
        const S = s * 5, dx = ((o.x % S) + S) % S, dy = ((o.y % S) + S) % S;
        ctx.beginPath(); ctx.strokeStyle = encre(0.2);
        for (let x = dx; x < W; x += S) ligne(Math.round(x) + 0.5, 0, Math.round(x) + 0.5, H);
        for (let y = dy; y < H; y += S) ligne(0, Math.round(y) + 0.5, W, Math.round(y) + 0.5);
        ctx.stroke();
      }
    } else if (g === "lignes" || g === "lignes-larges") {
      ctx.beginPath(); ctx.strokeStyle = "rgba(25,113,194," + (0.22 * alpha).toFixed(3) + ")";
      for (let y = debY; y < H; y += s) ligne(0, Math.round(y) + 0.5, W, Math.round(y) + 0.5);
      ctx.stroke();
    } else {
      // isométrique : horizontales et deux familles à ±60° ; losanges : ±30°
      const angles = g === "iso" ? [0, 60, 120] : [30, 150];
      ctx.beginPath(); ctx.strokeStyle = encre(0.1);
      angles.forEach((deg) => {
        const t = deg * Math.PI / 180;
        const nx = -Math.sin(t), ny = Math.cos(t);
        const ecartN = s * (g === "iso" ? Math.sqrt(3) / 2 : 0.5);
        const proj = [[0, 0], [W, 0], [0, H], [W, H]].map((p) => (p[0] - o.x) * nx + (p[1] - o.y) * ny);
        const k0 = Math.floor(Math.min(...proj) / ecartN), k1 = Math.ceil(Math.max(...proj) / ecartN);
        const L = W + H;
        for (let k = k0; k <= k1; k++) {
          const cx = o.x + nx * k * ecartN, cy = o.y + ny * k * ecartN;
          ligne(cx - Math.cos(t) * L * 2, cy - Math.sin(t) * L * 2, cx + Math.cos(t) * L * 2, cy + Math.sin(t) * L * 2);
        }
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── la sélection : cadre en tirets et poignées ── */
  function poignees(b) {
    const z = etat.zoom, m = 6 / z;
    const x0 = b.x - m, y0 = b.y - m, x1 = b.x + b.w + m, y1 = b.y + b.h + m;
    const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    const P = { nw: [x0, y0], n: [xm, y0], ne: [x1, y0], e: [x1, ym], se: [x1, y1], s: [xm, y1],
                sw: [x0, y1], w: [x0, ym] };
    // Une boîte trop petite à l'écran n'a que ses coins : huit poignées
    // collées les unes aux autres ne s'attrapent plus.
    if (b.w * z < 30) { delete P.n; delete P.s; }
    if (b.h * z < 30) { delete P.e; delete P.w; }
    return P;
  }
  function selectionnes() {
    return elements.filter((e) => selection.has(e.id));
  }
  function poigneesActives() {
    const sel = selectionnes();
    if (!sel.length || geste || sel.some((e) => e.angle) || sel.some((e) => e.locked)) return null;
    if (sel.length === 1 && (sel[0].type === "line" || sel[0].type === "arrow") && sel[0].points.length === 2) {
      return null;
    }
    return poignees(boiteDe(sel));
  }
  function dessinerSelection() {
    const sel = selectionnes();
    const z = etat.zoom;
    ctx.save();
    ctx.lineWidth = 1 / z;
    ctx.strokeStyle = BLEU_SEL;
    sel.forEach((el) => {
      const b = R.boite(el), m = 4 / z;
      ctx.save();
      if (el.angle) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy);
      }
      ctx.setLineDash(sel.length > 1 ? [4 / z, 3 / z] : []);
      if ((el.type === "line" || el.type === "arrow") && el.points.length === 2) {
        // une ligne se règle par ses deux bouts, pas par une boîte
        ctx.fillStyle = "#fff";
        el.points.forEach((p) => {
          ctx.beginPath(); ctx.arc(el.x + p[0], el.y + p[1], 5 / z, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        });
      } else {
        ctx.strokeRect(b.x - m, b.y - m, b.w + m * 2, b.h + m * 2);
      }
      ctx.restore();
    });
    const P = poigneesActives();
    if (P) {
      const b = boiteDe(sel), m = 6 / z;
      if (sel.length > 1) {
        ctx.setLineDash([]);
        ctx.strokeRect(b.x - m, b.y - m, b.w + m * 2, b.h + m * 2);
      }
      ctx.setLineDash([]);
      ctx.fillStyle = "#fff";
      const t = 8 / z;
      Object.values(P).forEach((p) => {
        ctx.beginPath();
        ctx.rect(p[0] - t / 2, p[1] - t / 2, t, t);
        ctx.fill(); ctx.stroke();
      });
    }
    if (geste && geste.mode === "cadre") {
      const g = geste;
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(76,110,245,.08)";
      const x = Math.min(g.x0, g.x1), y = Math.min(g.y0, g.y1);
      ctx.fillRect(x, y, Math.abs(g.x1 - g.x0), Math.abs(g.y1 - g.y0));
      ctx.strokeRect(x, y, Math.abs(g.x1 - g.x0), Math.abs(g.y1 - g.y0));
    }
    ctx.restore();
  }

  /* ── ce qui ne reste pas : le laser et la traînée de la gomme ──
     Hors de la scène, hors de l'historique, hors du fichier. */
  function dessinerEphemeres() {
    const maintenant = performance.now();
    const z = etat.zoom;
    laser = laser.filter((p) => maintenant - p.t < 1400);
    traineeGomme = traineeGomme.filter((p) => maintenant - p.t < 260);
    const trace = (pts, couleur, epais, vie) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (b.coupure) continue;
        const age = Math.min(1, (maintenant - b.t) / vie);
        ctx.strokeStyle = couleur;
        ctx.globalAlpha = 1 - age;
        ctx.lineWidth = (epais * (1 - age * 0.7)) / z;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    };
    ctx.save();
    ctx.setLineDash([]);
    if (laser.length) {
      ctx.shadowColor = "rgba(255,40,40,.8)"; ctx.shadowBlur = 8;
      trace(laser, "#ff2f2f", 5, 1400);
    }
    ctx.shadowBlur = 0;
    if (traineeGomme.length) trace(traineeGomme, "rgba(120,120,120,.5)", 12, 260);
    ctx.restore();
    if (laser.length || traineeGomme.length) demander();
  }

  /* ═══════════════ 7. Viser un élément ════════════════════════════════ */
  function aPortee(x, y) {
    const tol = 10 / etat.zoom;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (estLie(el)) continue;
      if (R.touche(el, x, y, tol)) return el;
      // un conteneur se prend aussi par son texte, même sans fond
      if (conteneur(el)) {
        const t = texteDe(el);
        if (t && R.touche(t, x, y, tol)) return el;
      }
    }
    return null;
  }
  function poigneeSous(x, y) {
    const P = poigneesActives();
    if (!P) return null;
    const t = 9 / etat.zoom;
    for (const k in P) if (Math.abs(P[k][0] - x) <= t && Math.abs(P[k][1] - y) <= t) return k;
    return null;
  }
  function boutSous(x, y) {
    const sel = selectionnes();
    if (sel.length !== 1) return null;
    const el = sel[0];
    if (!((el.type === "line" || el.type === "arrow") && el.points.length === 2)) return null;
    const t = 9 / etat.zoom;
    for (let i = 0; i < 2; i++) {
      if (Math.hypot(el.x + el.points[i][0] - x, el.y + el.points[i][1] - y) <= t) return i;
    }
    return null;
  }

  /* ═══════════════ 8. Les outils ══════════════════════════════════════ */
  const OUTILS_FORME = ["rectangle", "diamond", "ellipse", "postit"];
  const OUTILS_DESSIN = ["freedraw", "surligneur"];
  function choisirOutil(o) {
    if (edition) finirEdition();
    etat.outil = o;
    if (o !== "selection") selection.clear();
    $$("[data-outil]").forEach((b) => {
      if (b.dataset.outil !== "verrou") b.setAttribute("aria-pressed", String(b.dataset.outil === o));
    });
    $$("[data-stylo]").forEach((b) => b.setAttribute("aria-pressed",
      String(o === "freedraw" && Number(b.dataset.stylo) === etat.stylo)));
    $("#tb-reglage").hidden = true;
    majCurseur();
    majPanneau();
    demander();
  }
  function majCurseur(sur) {
    let c = "default";
    const o = etat.outil;
    if (espace || o === "main") c = geste && geste.mode === "pan" ? "grabbing" : "grab";
    else if (o === "texte") c = "text";
    else if (o !== "selection") c = "crosshair";
    else if (sur) c = sur;
    toile.style.cursor = c;
  }

  /* ── pointeur posé ── */
  toile.addEventListener("pointerdown", (e) => {
    /* Le geste appartient au tableau : pas de sélection de texte de la
       page, et surtout pas le focus que le navigateur donnerait au
       relâchement — il fermerait aussitôt la zone de frappe qu'un clic de
       l'outil Texte vient d'ouvrir. */
    e.preventDefault();
    scene.focus({ preventScroll: true });
    if (edition) { finirEdition(); if (etat.outil === "texte") return; }
    toile.setPointerCapture(e.pointerId);
    const { sx, sy } = posPointeur(e);
    pointeurs.set(e.pointerId, { sx, sy });
    if (pointeurs.size === 2) {
      // deux doigts : on abandonne le geste commencé et on pince
      annulerGeste();
      const [a, b] = [...pointeurs.values()];
      geste = { mode: "pince", d0: Math.hypot(a.sx - b.sx, a.sy - b.sy), z0: etat.zoom,
                c0: versScene((a.sx + b.sx) / 2, (a.sy + b.sy) / 2) };
      return;
    }
    if (pointeurs.size > 2) return;
    const p = versScene(sx, sy);
    dernierePos = p;
    if (e.button === 1 || e.button === 2 || espace || etat.outil === "main") {
      e.preventDefault();
      geste = { mode: "pan", sx, sy, x0: etat.scrollX, y0: etat.scrollY };
      majCurseur();
      return;
    }
    if (e.button !== 0) return;
    const o = etat.outil;
    if (o === "selection") return debutSelection(e, p);
    if (OUTILS_FORME.includes(o)) return debutForme(e, p);
    if (o === "arrow" || o === "line") return debutLigne(e, p);
    if (OUTILS_DESSIN.includes(o)) return debutDessin(e, p);
    if (o === "texte") return debutTexte(e, p);
    if (o === "gomme") {
      geste = { mode: "gomme" };
      fantomes = new Set();
      gommer(p, p);
      return;
    }
    if (o === "laser") {
      geste = { mode: "laser" };
      laser.push({ x: p.x, y: p.y, t: performance.now(), coupure: true });
      demander();
    }
  });

  function debutSelection(e, p) {
    const bout = boutSous(p.x, p.y);
    if (bout !== null) {
      const el = selectionnes()[0];
      geste = { mode: "bout", el, i: bout, origine: JSON.parse(JSON.stringify(el)) };
      return;
    }
    const h = poigneeSous(p.x, p.y);
    if (h) {
      const sel = selectionnes();
      geste = { mode: "redim", h, b0: boiteDe(sel), origines: sel.map((el) => JSON.parse(JSON.stringify(el))) };
      return;
    }
    const el = aPortee(p.x, p.y);
    if (el) {
      if (e.shiftKey) {
        if (selection.has(el.id)) selection.delete(el.id); else selection.add(el.id);
      } else if (!selection.has(el.id)) {
        selection = new Set([el.id]);
      }
      const sel = selectionnes().filter((x) => !x.locked);
      geste = { mode: "deplacer", x0: p.x, y0: p.y, bouge: false,
                origines: sel.map((x) => ({ el: x, x: x.x, y: x.y })) };
    } else {
      if (!e.shiftKey) selection.clear();
      geste = { mode: "cadre", x0: p.x, y0: p.y, x1: p.x, y1: p.y, avant: new Set(selection) };
    }
    majPanneau();
    demander();
  }

  function debutForme(e, p) {
    const o = etat.outil;
    let el;
    if (o === "postit") {
      el = nouvelElement("rectangle", p.x, p.y, {
        backgroundColor: etat.courant.postit, fillStyle: "solid", strokeColor: "transparent",
        strokeWidth: 1, strokeStyle: "solid", roughness: 0, roundness: { type: 3 }, opacity: 100,
        customData: { postit: true, taille: 28 },
      });
    } else {
      el = nouvelElement(o, p.x, p.y);
    }
    elements.push(el);
    geste = { mode: "creer", el, x0: p.x, y0: p.y };
    demander();
  }

  function debutLigne(e, p) {
    const o = etat.outil;
    const el = nouvelElement(o, p.x, p.y, {
      points: [[0, 0], [0, 0]], lastCommittedPoint: null, startBinding: null, endBinding: null,
      startArrowhead: o === "arrow" ? etat.courant.startArrowhead : null,
      endArrowhead: o === "arrow" ? etat.courant.endArrowhead : null,
    });
    if (o === "arrow") el.elbowed = false; else el.polygon = false;
    elements.push(el);
    geste = { mode: "ligne", el };
    demander();
  }

  function debutDessin(e, p) {
    const surl = etat.outil === "surligneur";
    /* Une souris rend une pression de 0,5 tout le temps : c'est le signe
       qu'il faut la simuler par la vitesse (la règle d'Excalidraw). */
    const simuler = !(e.pointerType === "pen" && e.pressure && e.pressure !== 0.5);
    const el = nouvelElement("freedraw", p.x, p.y, {
      points: [[0, 0]], pressures: [simuler ? 0.5 : e.pressure], simulatePressure: simuler,
      lastCommittedPoint: null, backgroundColor: "transparent", roundness: null,
    });
    if (surl) {
      Object.assign(el, { strokeColor: etat.courant.surligneur, strokeWidth: etat.courant.surligneurW, opacity: 60,
                          customData: { surligneur: true } });
      el.simulatePressure = true;
    } else {
      const st = etat.stylos[etat.stylo];
      Object.assign(el, { strokeColor: st.c, strokeWidth: st.w, opacity: 100 });
    }
    elements.push(el);
    geste = { mode: "dessin", el };
    demander();
  }

  function debutTexte(e, p) {
    const sur = aPortee(p.x, p.y);
    if (sur && conteneur(sur)) { editerLie(sur); return; }
    if (sur && sur.type === "text") { ouvrirEdition(sur); return; }
    const c = etat.courant;
    const el = nouvelElement("text", p.x, p.y - c.fontSize * 0.625, {
      text: "", originalText: "", fontSize: c.fontSize, fontFamily: c.fontFamily,
      textAlign: c.textAlign, verticalAlign: "top", containerId: null, autoResize: true,
      lineHeight: 1.25, backgroundColor: "transparent", roundness: null,
    });
    elements.push(el);
    ouvrirEdition(el, true);
  }

  /* ── pointeur qui bouge ── */
  toile.addEventListener("pointermove", (e) => {
    const { sx, sy } = posPointeur(e);
    if (pointeurs.has(e.pointerId)) pointeurs.set(e.pointerId, { sx, sy });
    const p = versScene(sx, sy);
    dernierePos = p;
    if (!geste) { survol(p); return; }
    const g = geste;
    if (g.mode === "pince") {
      const [a, b] = [...pointeurs.values()];
      if (!a || !b) return;
      const d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      const z = Math.max(ZMIN, Math.min(ZMAX, g.z0 * d / (g.d0 || 1)));
      const mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
      etat.zoom = z;
      etat.scrollX = mx / z - g.c0.x;
      etat.scrollY = my / z - g.c0.y;
      majZoom(); demander();
      return;
    }
    if (g.mode === "pan") {
      etat.scrollX = g.x0 + (sx - g.sx) / etat.zoom;
      etat.scrollY = g.y0 + (sy - g.sy) / etat.zoom;
      demander();
      return;
    }
    if (g.mode === "deplacer") {
      let dx = p.x - g.x0, dy = p.y - g.y0;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (!g.bouge && Math.hypot(dx, dy) * etat.zoom < 3) return;
      g.bouge = true;
      g.origines.forEach((o) => { o.el.x = o.x + dx; o.el.y = o.y + dy; toucher(o.el); });
      replacerLies(g.origines.map((o) => o.el));
      demander();
      return;
    }
    if (g.mode === "cadre") {
      g.x1 = p.x; g.y1 = p.y;
      const x0 = Math.min(g.x0, g.x1), y0 = Math.min(g.y0, g.y1), x1 = Math.max(g.x0, g.x1), y1 = Math.max(g.y0, g.y1);
      selection = new Set(g.avant);
      elements.forEach((el) => {
        if (estLie(el)) return;
        const b = R.boite(el);
        if (b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1) selection.add(el.id);
      });
      demander();
      return;
    }
    if (g.mode === "creer") return tracerForme(g, p, e);
    if (g.mode === "ligne") return tracerLigne(g.el, 1, p, e);
    if (g.mode === "bout") return tracerLigne(g.el, g.i, p, e);
    if (g.mode === "redim") return redimensionner(g, p, e);
    if (g.mode === "dessin") {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach((ev) => {
        const q = versScene(posPointeur(ev).sx, posPointeur(ev).sy);
        const el = g.el, der = el.points[el.points.length - 1];
        const px = q.x - el.x, py = q.y - el.y;
        if (Math.hypot(px - der[0], py - der[1]) * etat.zoom < 1) return;
        el.points.push([px, py]);
        el.pressures.push(el.simulatePressure ? 0.5 : ev.pressure);
      });
      const b = R.boite(g.el);
      g.el.width = b.w; g.el.height = b.h;
      demander();
      return;
    }
    if (g.mode === "gomme") {
      gommer(g.dernier || p, p);
      g.dernier = p;
      return;
    }
    if (g.mode === "laser") {
      laser.push({ x: p.x, y: p.y, t: performance.now() });
      demander();
    }
  });

  function survol(p) {
    if (etat.outil !== "selection" || espace) return majCurseur();
    if (boutSous(p.x, p.y) !== null) return majCurseur("pointer");
    const h = poigneeSous(p.x, p.y);
    if (h) {
      return majCurseur({ n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
                          nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" }[h]);
    }
    majCurseur(aPortee(p.x, p.y) ? "move" : "default");
  }

  function tracerForme(g, p, e) {
    const el = g.el;
    let dx = p.x - g.x0, dy = p.y - g.y0;
    if (e.shiftKey) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m;
    }
    if (e.altKey) {
      el.x = g.x0 - Math.abs(dx); el.y = g.y0 - Math.abs(dy);
      el.width = Math.abs(dx) * 2; el.height = Math.abs(dy) * 2;
    } else {
      el.x = Math.min(g.x0, g.x0 + dx); el.y = Math.min(g.y0, g.y0 + dy);
      el.width = Math.abs(dx); el.height = Math.abs(dy);
    }
    toucher(el);
    demander();
  }

  /* Le bout « i » d'une ligne suit le pointeur ; Maj l'aimante par crans
     de 15°, comme Excalidraw. Le point 0 reste l'origine de l'élément. */
  function tracerLigne(el, i, p, e) {
    const autre = el.points[1 - i];
    const ax = el.x + autre[0], ay = el.y + autre[1];
    let dx = p.x - ax, dy = p.y - ay;
    if (e.shiftKey) {
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
      const l = Math.hypot(dx, dy);
      dx = Math.cos(a) * l; dy = Math.sin(a) * l;
    }
    const pts = [[0, 0], [0, 0]];
    pts[1 - i] = [ax, ay]; pts[i] = [ax + dx, ay + dy];
    el.x = pts[0][0]; el.y = pts[0][1];
    el.points = [[0, 0], [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]]];
    el.width = Math.abs(el.points[1][0]); el.height = Math.abs(el.points[1][1]);
    toucher(el);
    demander();
  }

  /* Le redimensionnement : la boîte de la sélection est étirée par une
     poignée ; chaque élément est remis à l'échelle DANS cette boîte —
     positions, tailles, points, et la police d'un texte quand on tire un
     coin. Maj garde les proportions. */
  function redimensionner(g, p, e) {
    const b = g.b0;
    let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
    if (g.h.includes("w")) x0 = Math.min(p.x, x1 - 1);
    if (g.h.includes("e")) x1 = Math.max(p.x, x0 + 1);
    if (g.h.includes("n")) y0 = Math.min(p.y, y1 - 1);
    if (g.h.includes("s")) y1 = Math.max(p.y, y0 + 1);
    let sx = b.w ? (x1 - x0) / b.w : 1, sy = b.h ? (y1 - y0) / b.h : 1;
    const coin = g.h.length === 2;
    const texteSeul = g.origines.every((o) => o.type === "text");
    if (coin && (e.shiftKey || texteSeul)) {
      const s = Math.max(sx, sy);
      sx = sy = s;
      if (g.h.includes("w")) x0 = x1 - b.w * s; else x1 = x0 + b.w * s;
      if (g.h.includes("n")) y0 = y1 - b.h * s; else y1 = y0 + b.h * s;
    }
    g.origines.forEach((o) => {
      const el = parId(o.id);
      if (!el) return;
      el.x = x0 + (o.x - b.x) * sx;
      el.y = y0 + (o.y - b.y) * sy;
      if (o.points) {
        el.points = o.points.map((q) => [q[0] * sx, q[1] * sy]);
        const bb = R.boite(Object.assign({}, el, { x: 0, y: 0 }));
        el.width = bb.w; el.height = bb.h;
      } else {
        el.width = Math.max(1, o.width * sx);
        el.height = Math.max(1, o.height * sy);
      }
      if (el.type === "text" && !el.containerId) {
        if (coin) {
          el.fontSize = Math.max(4, o.fontSize * sy);
          mesurerLibre(el);
        } else { el.width = o.width; el.height = o.height; }
      }
      toucher(el);
    });
    replacerLies(g.origines.map((o) => parId(o.id)).filter(Boolean));
    demander();
  }

  /* ── la gomme ──────────────────────────────────────────────────────
     Comme Excalidraw : ce que la gomme touche passe en fantôme (20 %),
     et n'est détruit qu'au relâchement. Échap avant de lâcher, et rien
     n'est effacé. Le segment parcouru est échantillonné : un geste rapide
     ne saute pas par-dessus un trait fin. */
  function gommer(a, b) {
    const pas = 4 / etat.zoom;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / pas));
    const tol = 6 / etat.zoom;
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (estLie(el) || el.locked || fantomes.has(el.id)) continue;
        if (R.touche(el, x, y, tol)) fantomes.add(el.id);
      }
    }
    traineeGomme.push({ x: b.x, y: b.y, t: performance.now() });
    demander();
  }

  /* ── pointeur levé ── */
  function finGeste(e) {
    const avait = !!geste;
    finGesteInterne(e);
    if (avait && !geste) majPanneau();
  }
  function finGesteInterne(e) {
    pointeurs.delete(e.pointerId);
    if (!geste) return;
    const g = geste;
    if (g.mode === "pince") { if (pointeurs.size < 2) { geste = null; garder(); } return; }
    geste = null;
    if (g.mode === "pan") { garder(); majCurseur(); return; }
    if (g.mode === "deplacer") { if (g.bouge) memoriser(); majPanneau(); demander(); return; }
    if (g.mode === "cadre") { majPanneau(); demander(); return; }
    if (g.mode === "redim" || g.mode === "bout") { memoriser(); majPanneau(); demander(); return; }
    if (g.mode === "creer") {
      const el = g.el;
      if (estPostit(el) && (el.width < 12 || el.height < 12)) {
        // un clic pose une note de taille normale, centrée sur le clic
        el.width = 180; el.height = 180; el.x = g.x0 - 90; el.y = g.y0 - 90;
      }
      if (el.width < 2 && el.height < 2) { retirer([el.id]); demander(); return; }
      toucher(el);
      apresCreation(el);
      if (estPostit(el)) editerLie(el);
      return;
    }
    if (g.mode === "ligne") {
      const el = g.el;
      if (Math.hypot(el.points[1][0], el.points[1][1]) < 3) { retirer([el.id]); demander(); return; }
      apresCreation(el);
      return;
    }
    if (g.mode === "dessin") {
      const b = R.boite(g.el);
      g.el.width = b.w; g.el.height = b.h;
      toucher(g.el);
      memoriser();
      demander();
      return;
    }
    if (g.mode === "gomme") {
      if (fantomes.size) {
        retirer([...fantomes]);
        dire(fantomes.size + " élément" + (fantomes.size > 1 ? "s effacés" : " effacé")
          + ". Ctrl + Z pour revenir.");
        fantomes = new Set();
        memoriser();
      }
      demander();
      return;
    }
    if (g.mode === "laser") demander();
  }
  toile.addEventListener("pointerup", finGeste);
  toile.addEventListener("pointercancel", (e) => { annulerGeste(); pointeurs.delete(e.pointerId); });
  toile.addEventListener("contextmenu", (e) => e.preventDefault());

  function apresCreation(el) {
    memoriser();
    if (!etat.verrou) {
      choisirOutil("selection");
      selection = new Set([el.id]);
    }
    majPanneau();
    demander();
  }
  function annulerGeste() {
    if (!geste) return;
    const g = geste;
    geste = null;
    if ((g.mode === "creer" || g.mode === "ligne" || g.mode === "dessin") && g.el) retirer([g.el.id]);
    if (g.mode === "gomme") fantomes = new Set();
    if (g.mode === "deplacer") g.origines.forEach((o) => { o.el.x = o.x; o.el.y = o.y; });
    if ((g.mode === "redim" || g.mode === "bout") && pile[curseurPile]) elements = JSON.parse(pile[curseurPile]);
    replacerLies();
    demander();
  }

  /* ── la molette : défiler, et zoomer avec Ctrl (ou le pincement d'un
     pavé tactile, que le navigateur transmet avec Ctrl) ── */
  toile.addEventListener("wheel", (e) => {
    e.preventDefault();
    const { sx, sy } = posPointeur(e);
    if (e.ctrlKey || e.metaKey) {
      // un cran de molette (100) vaut ×1,16 ; le pincement d'un pavé
      // tactile envoie de petits deltas, et zoome donc en douceur
      const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      zoomerEn(etat.zoom * f, sx, sy);
      return;
    }
    const k = e.deltaMode === 1 ? 30 : 1;
    let dx = e.deltaX * k, dy = e.deltaY * k;
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    etat.scrollX -= dx / etat.zoom;
    etat.scrollY -= dy / etat.zoom;
    garder(); demander();
  }, { passive: false });

  toile.addEventListener("dblclick", (e) => {
    if (etat.outil !== "selection") return;
    const { sx, sy } = posPointeur(e);
    const p = versScene(sx, sy);
    const el = aPortee(p.x, p.y);
    if (el && el.type === "text") return ouvrirEdition(el);
    if (el && conteneur(el)) return editerLie(el);
    if (!el) {
      etat.outil = "texte";
      debutTexte(e, p);
      etat.outil = "selection";
    }
  });

  /* ═══════════════ 9. L'édition de texte ══════════════════════════════
     Une vraie zone de saisie posée PAR-DESSUS le canevas, à la taille et
     à la police du texte, pour que la frappe, la sélection, le copier-
     coller et la correction orthographique soient ceux du navigateur. */
  function editerLie(c) {
    let t = texteDe(c);
    if (!t) {
      const k = etat.courant;
      t = nouvelElement("text", c.x, c.y, {
        text: "", originalText: "", fontSize: estPostit(c) ? 28 : k.fontSize,
        fontFamily: k.fontFamily, textAlign: "center", verticalAlign: "middle",
        containerId: c.id, autoResize: true, lineHeight: 1.25, strokeColor: estPostit(c) ? NOIR : c.strokeColor,
        backgroundColor: "transparent", roundness: null,
      });
      elements.push(t);
      c.boundElements = (c.boundElements || []).concat([{ type: "text", id: t.id }]);
      placerLie(t);
    }
    selection = new Set([c.id]);
    ouvrirEdition(t, false);
  }
  function ouvrirEdition(el, neuf) {
    if (etat.outil !== "selection" && !etat.verrou) choisirOutil("selection");
    edition = el;
    edition.neuf = !!neuf;
    saisie.hidden = false;
    saisie.value = el.originalText != null ? el.originalText : el.text;
    placerSaisie();
    saisie.focus();
    saisie.select();
    demander();
  }
  function placerSaisie() {
    const el = edition;
    if (!el) return;
    const z = etat.zoom;
    const c = el.containerId ? parId(el.containerId) : null;
    const s = saisie.style;
    s.fontFamily = POLICE(el.fontFamily);
    s.fontSize = el.fontSize * z + "px";
    s.lineHeight = String(el.lineHeight || 1.25);
    s.color = el.strokeColor;
    s.textAlign = el.textAlign;
    if (c) {
      const pad = estPostit(c) ? PAD_POSTIT : PAD;
      const facteur = c.type === "ellipse" ? Math.SQRT1_2 : c.type === "diamond" ? 0.5 : 1;
      const maxW = c.width * facteur - pad * 2;
      const pos = versEcran(c.x + (c.width - maxW) / 2, el.y);
      s.left = pos.x + "px"; s.top = pos.y + "px";
      s.width = Math.max(20, maxW * z) + "px";
      s.whiteSpace = "pre-wrap";
      s.height = Math.max(el.fontSize * 1.25, el.height) * z + "px";
    } else {
      const pos = versEcran(el.x, el.y);
      s.left = pos.x + "px"; s.top = pos.y + "px";
      s.whiteSpace = "pre";
      const lignes = saisie.value.split("\n");
      const w = Math.max(...lignes.map((l) => largeurTexte(l, el)), el.fontSize);
      s.width = (w + el.fontSize) * z + "px";
      s.height = lignes.length * el.fontSize * (el.lineHeight || 1.25) * z + "px";
    }
  }
  saisie.addEventListener("input", () => {
    const el = edition;
    if (!el) return;
    el.originalText = saisie.value;
    el.text = saisie.value;
    if (el.containerId) placerLie(el); else mesurerLibre(el);
    toucher(el);
    placerSaisie();
    demander();
  });
  saisie.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      const el = edition;
      finirEdition();
      if (el && !el.containerId && parId(el.id)) selection = new Set([el.id]);
      scene.focus({ preventScroll: true });
      majPanneau(); demander();
    }
  });
  saisie.addEventListener("blur", () => { if (edition) finirEdition(); });
  function finirEdition() {
    const el = edition;
    if (!el) return;
    edition = null;
    saisie.hidden = true;
    delete el.neuf;
    const vide = !(el.originalText || "").trim();
    if (vide) {
      retirer([el.id]);
    } else {
      if (el.containerId) placerLie(el); else mesurerLibre(el);
      toucher(el);
    }
    memoriser();
    majPanneau();
    demander();
  }

  /* ═══════════════ 10. Les actions sur la sélection ═══════════════════ */
  function retirer(ids) {
    const tout = new Set(ids);
    // le texte d'un conteneur part avec lui ; un conteneur perd son lien
    ids.forEach((id) => {
      const el = parId(id);
      if (el && conteneur(el)) { const t = texteDe(el); if (t) tout.add(t.id); }
    });
    elements.forEach((el) => {
      if (el.boundElements) {
        el.boundElements = el.boundElements.filter((b) => !tout.has(b.id));
        if (!el.boundElements.length) el.boundElements = null;
      }
    });
    elements = elements.filter((el) => !tout.has(el.id));
    tout.forEach((id) => { selection.delete(id); cacheChemins.delete(id); });
  }
  function supprimerSelection() {
    if (!selection.size) return;
    retirer([...selection].filter((id) => { const e = parId(id); return e && !e.locked; }));
    memoriser(); majPanneau(); demander();
  }
  /* Copier un élément, c'est aussi copier son texte lié — avec de
     nouveaux identifiants des deux côtés, et le lien refait. */
  function cloner(liste, dx, dy) {
    const ids = new Set(liste.map((e) => e.id));
    liste.forEach((e) => { if (conteneur(e)) { const t = texteDe(e); if (t) ids.add(t.id); } });
    const sources = elements.filter((e) => ids.has(e.id));
    return clonerBrut(sources, dx, dy);
  }
  function clonerBrut(sources, dx, dy) {
    const map = new Map(sources.map((e) => [e.id, nouvelId()]));
    return sources.map((e) => {
      const c = JSON.parse(JSON.stringify(e));
      c.id = map.get(e.id);
      c.x += dx; c.y += dy;
      c.seed = graine(); c.version = 1; c.versionNonce = graine(); c.updated = Date.now();
      if (c.containerId) c.containerId = map.get(c.containerId) || null;
      if (c.boundElements) {
        c.boundElements = c.boundElements.filter((b) => map.has(b.id)).map((b) => ({ type: b.type, id: map.get(b.id) }));
        if (!c.boundElements.length) c.boundElements = null;
      }
      return c;
    });
  }
  function dupliquer() {
    const sel = selectionnes();
    if (!sel.length) return;
    const copies = cloner(sel, 12, 12);
    elements.push(...copies);
    selection = new Set(copies.filter((c) => !estLie(c)).map((c) => c.id));
    memoriser(); majPanneau(); demander();
  }
  function copier(couper) {
    const sel = selectionnes();
    if (!sel.length) return;
    const ids = new Set(sel.map((e) => e.id));
    sel.forEach((e) => { if (conteneur(e)) { const t = texteDe(e); if (t) ids.add(t.id); } });
    const liste = elements.filter((e) => ids.has(e.id));
    pressePapiers = JSON.parse(JSON.stringify(liste));
    /* Le format du presse-papiers d'Excalidraw : ce qu'on copie ici se
       colle sur excalidraw.com, et l'inverse. */
    const texte = JSON.stringify({ type: "excalidraw/clipboard", elements: liste, files: {} });
    try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texte).catch(() => {}); }
    catch (e) { /* le presse-papiers interne suffit */ }
    if (couper) supprimerSelection();
    dire(liste.length + (couper ? " coupé" : " copié") + (liste.length > 1 ? "s." : "."));
  }
  function coller(liste) {
    if (!liste || !liste.length) return;
    const propres = liste.map(normaliser).filter(Boolean);
    const b = boiteDe(propres.filter((e) => !estLie(e)));
    const ou = dernierePos || versScene(toile.clientWidth / 2, toile.clientHeight / 2);
    const copies = clonerBrut(propres, b ? ou.x - (b.x + b.w / 2) : 10, b ? ou.y - (b.y + b.h / 2) : 10);
    elements.push(...copies);
    replacerLies(copies);
    selection = new Set(copies.filter((c) => !estLie(c)).map((c) => c.id));
    if (etat.outil !== "selection") choisirOutil("selection");
    memoriser(); majPanneau(); demander();
  }
  document.addEventListener("paste", (e) => {
    if (document.activeElement !== scene || edition) return;
    const t = e.clipboardData && e.clipboardData.getData("text/plain");
    if (t) {
      try {
        const j = JSON.parse(t);
        if (j && Array.isArray(j.elements)) { e.preventDefault(); coller(j.elements); return; }
      } catch (err) { /* ce n'est pas un dessin : c'est du texte */ }
      e.preventDefault();
      const ou = dernierePos || versScene(toile.clientWidth / 2, toile.clientHeight / 2);
      const c = etat.courant;
      const el = nouvelElement("text", ou.x, ou.y, {
        text: t, originalText: t, fontSize: c.fontSize, fontFamily: c.fontFamily, textAlign: c.textAlign,
        verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25,
        backgroundColor: "transparent", roundness: null,
      });
      mesurerLibre(el);
      elements.push(el);
      selection = new Set([el.id]);
      memoriser(); majPanneau(); demander();
      return;
    }
    if (pressePapiers) { e.preventDefault(); coller(pressePapiers); }
  });
  /* L'ordre d'empilement. Les textes liés n'y comptent pas : ils sont
     toujours peints juste au-dessus de leur conteneur. */
  function empiler(sens) {
    const sel = new Set(selection);
    if (!sel.size) return;
    if (sens === "devant") elements = elements.filter((e) => !sel.has(e.id)).concat(elements.filter((e) => sel.has(e.id)));
    else if (sens === "fond") elements = elements.filter((e) => sel.has(e.id)).concat(elements.filter((e) => !sel.has(e.id)));
    else {
      const arr = elements.slice();
      const idx = arr.map((e, i) => (sel.has(e.id) ? i : -1)).filter((i) => i >= 0);
      if (sens === "avancer") {
        for (let k = idx.length - 1; k >= 0; k--) {
          const i = idx[k];
          let j = i + 1;
          while (j < arr.length && (sel.has(arr[j].id) || estLie(arr[j]))) j++;
          if (j < arr.length) { const [e] = arr.splice(i, 1); arr.splice(j, 0, e); }
        }
      } else {
        for (let k = 0; k < idx.length; k++) {
          const i = idx[k];
          let j = i - 1;
          while (j >= 0 && (sel.has(arr[j].id) || estLie(arr[j]))) j--;
          if (j >= 0) { const [e] = arr.splice(i, 1); arr.splice(j, 0, e); }
        }
      }
      elements = arr;
    }
    memoriser(); demander();
  }

  /* ═══════════════ 11. Le panneau des propriétés ═════════════════════
     Ce qu'il montre dépend de ce qui est visé : la sélection si elle
     existe, sinon l'outil en main (et ce sont alors les réglages du
     prochain élément). Une case ne s'affiche que si elle a un sens pour
     ce qui est visé : pas de « remplissage » pour un trait libre. */
  function cibles() {
    const sel = selectionnes();
    if (sel.length) return sel;
    const o = etat.outil;
    const type = { rectangle: "rectangle", diamond: "diamond", ellipse: "ellipse", arrow: "arrow",
                   line: "line", freedraw: "freedraw", texte: "text", postit: "rectangle",
                   surligneur: "freedraw" }[o];
    if (!type) return [];
    const c = etat.courant;
    return [Object.assign({ virtuel: true, type, customData: o === "postit" ? { postit: true }
                              : o === "surligneur" ? { surligneur: true } : null,
                            backgroundColor: o === "postit" ? c.postit : c.backgroundColor,
                            strokeColor: o === "surligneur" ? c.surligneur : c.strokeColor,
                            roundness: c.arrondi ? { type: 3 } : null }, {
      fillStyle: c.fillStyle, strokeWidth: c.strokeWidth, strokeStyle: c.strokeStyle,
      roughness: c.roughness, opacity: c.opacity, fontFamily: c.fontFamily, fontSize: c.fontSize,
      textAlign: c.textAlign, startArrowhead: c.startArrowhead, endArrowhead: c.endArrowhead,
    })];
  }
  const ech = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function pastille(prop, valeur, actuelle, titre) {
    const transp = valeur === "transparent";
    return '<button type="button" class="tb-pastille' + (transp ? " tb-transp" : "") + '" data-prop="' + prop
      + '" data-val="' + ech(valeur) + '" aria-pressed="' + (valeur === actuelle) + '" title="' + ech(titre || valeur)
      + '" aria-label="' + ech(titre || valeur) + '" style="--c:' + ech(transp ? "#fff" : valeur) + '"></button>';
  }
  function choix(prop, liste, actuelle) {
    return '<div class="tb-choix">' + liste.map(([v, t, ic]) =>
      '<button type="button" class="tb-b tb-petit" data-prop="' + prop + '" data-val="' + ech(JSON.stringify(v))
      + '" data-json="1" aria-pressed="' + (JSON.stringify(v) === JSON.stringify(actuelle)) + '" title="' + ech(t)
      + '" aria-label="' + ech(t) + '">' + (ic || ech(t)) + '</button>').join("") + '</div>';
  }
  function grilleCouleurs(prop) {
    return '<details class="tb-plus"><summary>Plus de couleurs</summary><div class="tb-palette">'
      + Object.keys(OC).map((k) => OC[k].map((c) => pastille(prop, c, null, k + " " + c)).join("")).join("")
      + '</div><label class="tb-hex">Code <input type="color" data-prop="' + prop + '" aria-label="Couleur libre"></label></details>';
  }
  const IC = {
    hachure: '<svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M5 11l6-6M5 16l11-11M10 16l6-6"/></svg>',
    "cross-hatch": '<svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M5 11l6-6M5 16l11-11M10 16l6-6M9 5l6 6M4 5l11 11M4 10l6 6"/></svg>',
    solid: '<svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="2" class="plein"/></svg>',
    w1: '<svg viewBox="0 0 20 20"><path d="M3 10h14" style="stroke-width:1"/></svg>',
    w2: '<svg viewBox="0 0 20 20"><path d="M3 10h14" style="stroke-width:2.4"/></svg>',
    w4: '<svg viewBox="0 0 20 20"><path d="M3 10h14" style="stroke-width:4.5"/></svg>',
    solide: '<svg viewBox="0 0 20 20"><path d="M3 10h14"/></svg>',
    tirets: '<svg viewBox="0 0 20 20"><path d="M3 10h14" stroke-dasharray="4 3"/></svg>',
    points: '<svg viewBox="0 0 20 20"><path d="M3 10h14" stroke-dasharray="1 3"/></svg>',
    r0: '<svg viewBox="0 0 20 20"><path d="M3 15c4-1 9-7 14-10"/></svg>',
    r1: '<svg viewBox="0 0 20 20"><path d="M3 15c3-2 4-4 6-5s5-1 8-5"/></svg>',
    r2: '<svg viewBox="0 0 20 20"><path d="M3 15c2-3 4 0 5-3s3-4 4-2 3-3 5-5"/></svg>',
    vif: '<svg viewBox="0 0 20 20"><path d="M4 16V4h12"/></svg>',
    rond: '<svg viewBox="0 0 20 20"><path d="M4 16V9a5 5 0 0 1 5-5h7"/></svg>',
  };
  function majPanneau() {
    const T = cibles();
    if (!selection.size) etat.format = false;
    /* Comme Whiteboard : le format d'une sélection s'ouvre par le bouton
       de sa barre d'actions, il ne s'impose pas. Un outil de forme pris au
       clavier (R, D, O, A, L, T) montre, lui, les réglages du prochain
       élément — c'est le geste d'Excalidraw, et il reste disponible. */
    const outilAReglages = /^(rectangle|diamond|ellipse|arrow|line|texte|postit)$/.test(etat.outil);
    if (!T.length || geste || (selection.size && !etat.format) || (!selection.size && !outilAReglages)) {
      panneau.hidden = true; return;
    }
    panneau.hidden = false;
    const a = T[0];
    const types = new Set(T.map((e) => e.type));
    const a1 = (f) => T.some(f);
    const postits = T.every(estPostit);
    const surl = T.every(estSurligneur);
    const formes = a1((e) => /^(rectangle|diamond|ellipse)$/.test(e.type) && !estPostit(e));
    const lignes = types.has("line") || types.has("arrow");
    const avecTexte = types.has("text") || a1((e) => conteneur(e) && (e.virtuel ? estPostit(e) : texteDe(e)));
    const t0 = a.type === "text" ? a : (conteneur(a) && !a.virtuel && texteDe(a)) || a;
    let h = selection.size ? '<div class="tb-props-tete"><b>Format</b><button type="button" class="tb-b tb-petit" data-fermer-format aria-label="Fermer le format">✕</button></div>' : "";
    const bloc = (titre, corps) => { h += '<fieldset class="tb-bloc"><legend>' + titre + '</legend>' + corps + '</fieldset>'; };
    if (postits) {
      bloc("Couleur du post-it", '<div class="tb-pastilles">' + POSTITS.map((c) => pastille("postit", c, a.backgroundColor)).join("") + '</div>');
    } else if (surl) {
      bloc("Surligneur", '<div class="tb-pastilles">' + SURLIGNEURS.map((c) => pastille("surligneur", c, a.strokeColor)).join("") + '</div>');
    } else {
      bloc(types.has("text") && types.size === 1 ? "Couleur du texte" : "Trait",
        '<div class="tb-pastilles">' + TRAITS.map((c) => pastille("strokeColor", c, a.strokeColor)).join("") + '</div>'
        + grilleCouleurs("strokeColor"));
    }
    if ((formes || types.has("line") || types.has("freedraw")) && !surl && !postits) {
      bloc("Fond", '<div class="tb-pastilles">' + FONDS.map((c) => pastille("backgroundColor", c, a.backgroundColor,
        c === "transparent" ? "Transparent" : c)).join("") + '</div>' + grilleCouleurs("backgroundColor"));
    }
    if (formes && T.some((e) => e.backgroundColor && e.backgroundColor !== "transparent")) {
      bloc("Remplissage", choix("fillStyle", [["hachure", "Hachures", IC.hachure],
        ["cross-hatch", "Hachures croisées", IC["cross-hatch"]], ["solid", "Plein", IC.solid]], a.fillStyle));
    }
    if (!types.has("text") && !postits && !surl) {
      bloc("Épaisseur", choix("strokeWidth", [[1, "Fin", IC.w1], [2, "Gras", IC.w2], [4, "Très gras", IC.w4]], a.strokeWidth));
      if (!types.has("freedraw")) {
        bloc("Style du trait", choix("strokeStyle", [["solid", "Continu", IC.solide], ["dashed", "Tirets", IC.tirets],
          ["dotted", "Pointillés", IC.points]], a.strokeStyle));
        bloc("Tremblement", choix("roughness", [[0, "Architecte — trait net", IC.r0],
          [1, "Artiste — légèrement tremblé", IC.r1], [2, "Dessinateur — croquis", IC.r2]], a.roughness));
      }
    }
    if (a1((e) => e.type === "rectangle" || e.type === "diamond" || lignes) && !postits) {
      bloc(lignes && !formes ? "Tracé" : "Angles", choix("arrondi", [[false, lignes && !formes ? "Droit" : "Vifs", IC.vif],
        [true, lignes && !formes ? "Courbe" : "Arrondis", IC.rond]], !!a.roundness));
    }
    if (types.has("arrow")) {
      const P = [[null, "Aucune"], ["arrow", "Flèche"], ["triangle", "Triangle"], ["triangle_outline", "Triangle vide"],
                 ["bar", "Barre"], ["circle", "Rond"], ["circle_outline", "Rond vide"], ["diamond", "Losange"],
                 ["diamond_outline", "Losange vide"]];
      const sel = (prop, v) => '<select class="tb-select" data-prop="' + prop + '" aria-label="' + (prop === "startArrowhead" ? "Début" : "Fin") + '">'
        + P.map(([k, t]) => '<option value="' + ech(JSON.stringify(k)) + '"' + (k === v ? " selected" : "") + '>' + t + '</option>').join("") + '</select>';
      bloc("Extrémités", '<div class="tb-ligne"><span>Début</span>' + sel("startArrowhead", a.startArrowhead)
        + '</div><div class="tb-ligne"><span>Fin</span>' + sel("endArrowhead", a.endArrowhead) + '</div>');
    }
    if (avecTexte) {
      bloc("Police", choix("fontFamily", [[5, "Manuscrite", '<span style="font-family:' + ech(MAIN) + '">Aa</span>'],
        [2, "Normale", '<span style="font-family:' + ech(SANS) + '">Aa</span>'],
        [3, "Code", '<span style="font-family:' + ech(MONO) + '">Aa</span>']], t0.fontFamily));
      if (!postits) bloc("Taille", choix("fontSize", TAILLES.map(([v, t]) => [v, t]), t0.fontSize));
      bloc("Alignement", choix("textAlign", [["left", "À gauche", "⇤"], ["center", "Centré", "↔"], ["right", "À droite", "⇥"]], t0.textAlign));
    }
    h += '<fieldset class="tb-bloc"><legend>Opacité</legend><input type="range" min="0" max="100" step="10" data-prop="opacity" value="'
      + (a.opacity == null ? 100 : a.opacity) + '" aria-label="Opacité"></fieldset>';
    if (!a.virtuel) {
      bloc("Calques", '<div class="tb-choix">'
        + [["fond", "Tout au fond (Ctrl Maj [)", "⤓"], ["reculer", "Reculer (Ctrl [)", "↓"], ["avancer", "Avancer (Ctrl ])", "↑"],
           ["devant", "Tout devant (Ctrl Maj ])", "⤒"]].map(([k, t, i]) =>
          '<button type="button" class="tb-b tb-petit" data-empiler="' + k + '" title="' + t + '" aria-label="' + t + '">' + i + '</button>').join("")
        + '</div>');
      bloc("Actions", '<div class="tb-choix"><button type="button" class="tb-b tb-petit" data-action="dupliquer" title="Dupliquer (Ctrl D)" aria-label="Dupliquer">⧉</button>'
        + '<button type="button" class="tb-b tb-petit" data-action="supprimer" title="Supprimer (Suppr)" aria-label="Supprimer">🗑</button></div>');
    }
    panneau.innerHTML = h;
  }

  /* Un réglage s'applique à la sélection ET devient le réglage courant :
     le prochain élément naîtra avec, comme dans Excalidraw. */
  function appliquer(prop, v) {
    const c = etat.courant;
    if (prop === "arrondi") c.arrondi = v;
    else if (prop === "postit") c.postit = v;
    else if (prop === "surligneur") c.surligneur = v;
    else if (prop in c) c[prop] = v;
    const sel = selectionnes();
    sel.forEach((el) => {
      const touches = [el];
      if (/^font|textAlign/.test(prop) && conteneur(el)) { const t = texteDe(el); if (t) touches.push(t); }
      touches.forEach((x) => {
        if (prop === "arrondi") {
          if (x.type === "text" || x.type === "ellipse" || x.type === "freedraw") return;
          x.roundness = v ? (x.type === "rectangle" ? { type: 3 } : { type: 2 }) : null;
        } else if (prop === "postit") { if (estPostit(x)) x.backgroundColor = v; }
        else if (prop === "surligneur") { if (estSurligneur(x)) x.strokeColor = v; }
        else if (/^font|textAlign/.test(prop)) {
          if (x.type !== "text") return;
          if (prop === "fontSize" && estPostit(parId(x.containerId))) return;
          x[prop] = v;
          if (x.containerId) placerLie(x); else mesurerLibre(x);
        } else if (prop === "startArrowhead" || prop === "endArrowhead") {
          if (x.type === "arrow") x[prop] = v;
        } else if (prop === "strokeColor" && estPostit(x)) {
          const t = texteDe(x); if (t) { t.strokeColor = v; toucher(t); }
        } else x[prop] = v;
        toucher(x);
      });
    });
    if (sel.length) memoriser();
    garder(); majPanneau(); demander();
  }
  panneau.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-fermer-format")) { etat.format = false; majPanneau(); demander(); return; }
    if (b.dataset.empiler) return empiler(b.dataset.empiler);
    if (b.dataset.action === "dupliquer") return dupliquer();
    if (b.dataset.action === "supprimer") return supprimerSelection();
    if (b.dataset.prop) appliquer(b.dataset.prop, b.dataset.json ? JSON.parse(b.dataset.val) : b.dataset.val);
    // le focus revient au tableau : sinon les raccourcis se taisent
    if (!b.closest("details")) scene.focus({ preventScroll: true });
  });
  panneau.addEventListener("change", (e) => {
    const c = e.target;
    if (!c.dataset.prop) return;
    if (c.tagName === "SELECT") appliquer(c.dataset.prop, JSON.parse(c.value));
    else if (c.type === "range") appliquer("opacity", Number(c.value));
    else if (c.type === "color") appliquer(c.dataset.prop, c.value);
  });

  /* ═══════════════ 12. Le clavier ═════════════════════════════════════
     Les raccourcis d'Excalidraw, touche pour touche. Ils ne vivent que
     dans le tableau (quand il a le focus) : sur le reste de la page, « R »
     reste une lettre. */
  const TOUCHES = { v: "selection", 1: "selection", r: "rectangle", 2: "rectangle", d: "diamond", 3: "diamond",
                    o: "ellipse", 4: "ellipse", a: "arrow", 5: "arrow", l: "line", 6: "line", p: "freedraw",
                    7: "freedraw", t: "texte", 8: "texte", e: "gomme", 0: "gomme", h: "main", k: "laser",
                    n: "postit", m: "surligneur" };
  scene.addEventListener("keydown", (e) => {
    if (e.target !== scene) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    /* Le site a ses propres raccourcis (« r » ouvre une fiche au hasard,
       « t » change le thème, « / » cherche) : quand le tableau a la main,
       ses touches ne remontent pas jusqu'à eux. Seul Ctrl K, la recherche,
       passe toujours. */
    if (!(mod && k === "k")) e.stopPropagation();
    if (mod && k === "z") { e.preventDefault(); revenir(e.shiftKey ? 1 : -1); return; }
    if (mod && k === "y") { e.preventDefault(); revenir(1); return; }
    if (mod && k === "c") { e.preventDefault(); copier(false); return; }
    if (mod && k === "x") { e.preventDefault(); copier(true); return; }
    if (mod && k === "d") { e.preventDefault(); dupliquer(); return; }
    if (mod && k === "a") { e.preventDefault(); choisirOutil("selection");
      selection = new Set(elements.filter((x) => !estLie(x)).map((x) => x.id)); majPanneau(); demander(); return; }
    if (mod && k === "s") { e.preventDefault(); enregistrer(); return; }
    if (mod && k === "o") { e.preventDefault(); $("#tb-fichier").click(); return; }
    if (mod && e.shiftKey && k === "e") { e.preventDefault(); ouvrirExport(); return; }
    /* La touche, pas le caractère : avec Maj, « [ » devient « { » sur un
       clavier QWERTY, et sur un AZERTY « [ » demande AltGr. La position
       physique, elle, ne change pas. */
    if (mod && (e.code === "BracketLeft" || e.code === "BracketRight" || e.key === "[" || e.key === "]")) {
      e.preventDefault();
      const devant = e.code === "BracketRight" || e.key === "]";
      empiler(devant ? (e.shiftKey ? "devant" : "avancer") : (e.shiftKey ? "fond" : "reculer"));
      return;
    }
    if (mod && (e.key === "+" || e.key === "=")) { e.preventDefault(); zoomerCentre(1.25); return; }
    if (mod && (e.key === "-" || e.key === "_")) { e.preventDefault(); zoomerCentre(0.8); return; }
    if (mod && e.key === "0") { e.preventDefault(); zoomerEn(1, toile.clientWidth / 2, toile.clientHeight / 2); return; }
    if (mod) return;
    if (e.shiftKey && (e.code === "Digit1" || e.key === "!")) { e.preventDefault(); ajuster(); return; }
    if (e.key === " ") { e.preventDefault(); if (!espace) { espace = true; majCurseur(); } return; }
    if (e.key === "Escape") {
      if (geste) { annulerGeste(); return; }
      if (selection.size) { selection.clear(); majPanneau(); demander(); return; }
      if (section.classList.contains("tb-grand")) basculerPlein(false);
      else if (etat.outil !== "selection") choisirOutil("selection");
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); supprimerSelection(); return; }
    if (e.key === "Enter" && selection.size === 1) {
      const el = selectionnes()[0];
      e.preventDefault();
      if (el.type === "text") ouvrirEdition(el); else if (conteneur(el)) editerLie(el);
      return;
    }
    if (e.key.startsWith("Arrow") && selection.size) {
      e.preventDefault();
      const d = e.shiftKey ? PAS_GRILLE : 1;
      const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
      const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
      selectionnes().forEach((el) => { if (!el.locked) { el.x += dx; el.y += dy; toucher(el); } });
      replacerLies(selectionnes());
      memoriser(); demander();
      return;
    }
    if (k === "q") { basculerVerrou(); return; }
    if (e.key === "?") { ouvrirDialogue("#tb-aide"); return; }
    const o = TOUCHES[k] || TOUCHES[e.code.replace(/^(Digit|Numpad)/, "")];
    if (o && !e.altKey) { e.preventDefault(); choisirOutil(o); }
  });
  scene.addEventListener("keyup", (e) => {
    if (e.key === " ") { espace = false; majCurseur(); }
  });
  scene.addEventListener("blur", () => { if (espace) { espace = false; majCurseur(); } });

  function basculerVerrou() {
    etat.verrou = !etat.verrou;
    $('[data-outil="verrou"]').setAttribute("aria-pressed", String(etat.verrou));
    dire(etat.verrou ? "Outil verrouillé : il reste en main après chaque tracé (Q pour libérer)."
      : "Outil libéré : on revient à la sélection après chaque tracé.");
  }

  /* ═══════════════ 13. Les fichiers ═══════════════════════════════════ */
  function sceneJSON() {
    return {
      type: "excalidraw", version: 2, source: location.origin + location.pathname,
      elements: elements.map((e) => { const c = Object.assign({}, e); delete c.neuf; delete c.virtuel; return c; }),
      appState: { gridSize: PAS_GRILLE, gridStep: 5, gridModeEnabled: false, viewBackgroundColor: etat.fond },
      files: {},
    };
  }
  function telecharger(nom, contenu, type) {
    const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const nomFichier = () => (etat.titre || "tableau").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "tableau";
  function enregistrer() {
    telecharger(nomFichier() + ".excalidraw", JSON.stringify(sceneJSON(), null, 2), "application/json");
    dire("Enregistré au format Excalidraw : il s'ouvre ici, et sur excalidraw.com.");
  }
  function ouvrirTexte(t, nom) {
    let j;
    try { j = JSON.parse(t); } catch (e) { dire("« " + nom + " » n'est pas un fichier de tableau lisible.", true); return; }
    const liste = Array.isArray(j) ? j : j && Array.isArray(j.elements) ? j.elements : null;
    if (!liste) { dire("« " + nom + " » ne contient aucun élément de dessin.", true); return; }
    if (j.type && j.type !== "excalidraw" && j.type !== "excalidraw/clipboard") {
      dire("« " + nom + " » est un fichier « " + j.type + " », pas un tableau.", true); return;
    }
    const lus = liste.map(normaliser).filter(Boolean);
    const images = lus.filter((e) => e.type === "image").length;
    elements = lus.filter((e) => e.type !== "image" && e.type !== "embeddable" && e.type !== "iframe");
    reparer();
    elements.forEach((e) => { if (e.type === "text" && e.containerId) placerLie(e); });
    if (j.appState && j.appState.viewBackgroundColor) etat.fond = j.appState.viewBackgroundColor;
    selection.clear();
    cacheChemins.clear();
    memoriser(); ajuster(); majPanneau(); majFond();
    const nb = elements.length;
    dire(nb + " élément" + (nb > 1 ? "s" : "") + " ouvert" + (nb > 1 ? "s" : "")
      + (images ? " — " + images + " image(s) laissée(s) de côté : les images arrivent au prochain lot." : "."));
  }
  function lireFichier(f) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => ouvrirTexte(String(r.result), f.name);
    r.readAsText(f);
  }
  $("#tb-fichier").addEventListener("change", (e) => { lireFichier(e.target.files[0]); e.target.value = ""; });
  scene.addEventListener("dragover", (e) => { e.preventDefault(); });
  scene.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) lireFichier(f);
  });

  /* ── l'export en image : PNG et SVG ──
     Le cadre est la boîte de ce qui est exporté, plus une marge. Le
     mode sombre n'est pas exporté : une image se partage, et le papier
     est blanc. */
  function aExporter(seule) {
    const sel = selectionnes();
    if (seule && sel.length) {
      const ids = new Set(sel.map((e) => e.id));
      sel.forEach((e) => { if (conteneur(e)) { const t = texteDe(e); if (t) ids.add(t.id); } });
      return elements.filter((e) => ids.has(e.id));
    }
    return elements;
  }
  function exporterPNG(echelle, avecFond, seule) {
    const liste = aExporter(seule);
    const b = boiteDe(liste.filter((e) => !estLie(e)));
    if (!b) { dire("Le tableau est vide : rien à exporter.", true); return; }
    const m = 20;
    const c = document.createElement("canvas");
    c.width = Math.ceil((b.w + m * 2) * echelle); c.height = Math.ceil((b.h + m * 2) * echelle);
    const k = c.getContext("2d");
    if (avecFond) { k.fillStyle = etat.fond; k.fillRect(0, 0, c.width, c.height); }
    k.setTransform(echelle, 0, 0, echelle, (m - b.x) * echelle, (m - b.y) * echelle);
    const f = fantomes; fantomes = new Set();
    const ed = edition; edition = null;
    dessinerScene(k, liste, null);
    fantomes = f; edition = ed;
    c.toBlob((blob) => { if (blob) telecharger(nomFichier() + ".png", blob); dire("Image PNG exportée."); }, "image/png");
  }
  function exporterSVG(avecFond, seule) {
    const liste = aExporter(seule);
    const b = boiteDe(liste.filter((e) => !estLie(e)));
    if (!b) { dire("Le tableau est vide : rien à exporter.", true); return; }
    const m = 20, W = b.w + m * 2, H = b.h + m * 2;
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W.toFixed(1) + " " + H.toFixed(1)
      + '" width="' + W.toFixed(0) + '" height="' + H.toFixed(0) + '">\n';
    if (avecFond) s += '<rect width="100%" height="100%" fill="' + etat.fond + '"/>\n';
    s += '<g transform="translate(' + (m - b.x).toFixed(2) + " " + (m - b.y).toFixed(2) + ')">\n';
    const svgEl = (el) => {
      const bb = R.boite(el);
      const op = (el.opacity == null ? 100 : el.opacity) / 100;
      let t = '<g transform="' + (el.angle ? "rotate(" + (el.angle * 180 / Math.PI).toFixed(2) + " "
        + (bb.x + bb.w / 2).toFixed(2) + " " + (bb.y + bb.h / 2).toFixed(2) + ") " : "")
        + "translate(" + el.x.toFixed(2) + " " + el.y.toFixed(2) + ')"' + (op < 1 ? ' opacity="' + op + '"' : "")
        + (estSurligneur(el) ? ' style="mix-blend-mode:multiply"' : "") + ">";
      if (el.type === "text") {
        const lh = el.fontSize * (el.lineHeight || 1.25);
        const x = el.textAlign === "center" ? el.width / 2 : el.textAlign === "right" ? el.width : 0;
        const ancre = el.textAlign === "center" ? "middle" : el.textAlign === "right" ? "end" : "start";
        t += '<text font-family="' + ech(POLICE(el.fontFamily)) + '" font-size="' + el.fontSize + '" fill="'
          + el.strokeColor + '" text-anchor="' + ancre + '" dominant-baseline="middle">'
          + String(el.text).split("\n").map((l, i) => '<tspan x="' + x.toFixed(2) + '" y="' + (i * lh + lh / 2).toFixed(2)
            + '">' + ech(l) + "</tspan>").join("") + "</text>";
      } else {
        cheminsDe(el).forEach((o) => {
          if (!o.couleur || o.couleur === "transparent") return;
          t += o.mode === "fond" ? '<path d="' + o.d + '" fill="' + o.couleur + '"/>'
            : '<path d="' + o.d + '" fill="none" stroke="' + o.couleur + '" stroke-width="' + (o.largeur || 1)
              + '" stroke-linecap="round" stroke-linejoin="round"' + (o.tirets ? ' stroke-dasharray="' + o.tirets.join(" ") + '"' : "") + "/>";
        });
      }
      return t + "</g>\n";
    };
    liste.forEach((el) => {
      if (estLie(el)) return;
      s += svgEl(el);
      if (conteneur(el)) { const t = texteDe(el); if (t) s += svgEl(t); }
    });
    s += "</g>\n</svg>\n";
    telecharger(nomFichier() + ".svg", s, "image/svg+xml");
    dire("Image SVG exportée.");
  }

  /* ═══════════════ 14. Les commandes de l'écran ═══════════════════════ */
  function dire(t, faute) {
    etatLigne.textContent = t;
    etatLigne.classList.toggle("tb-faute", !!faute);
    etatLigne.classList.add("tb-vu");
    clearTimeout(dire.m);
    dire.m = setTimeout(() => etatLigne.classList.remove("tb-vu"), 3800);
  }
  $$("[data-outil]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.outil === "verrou") basculerVerrou(); else choisirOutil(b.dataset.outil);
    scene.focus({ preventScroll: true });
  }));
  $("#tb-annuler").addEventListener("click", () => revenir(-1));
  $("#tb-retablir").addEventListener("click", () => revenir(1));
  $$("[data-zoom]").forEach((b) => b.addEventListener("click", () => zoomerCentre(b.dataset.zoom === "+" ? 1.25 : 0.8)));
  $("#tb-zoom-val").addEventListener("click", () => zoomerEn(1, toile.clientWidth / 2, toile.clientHeight / 2));
  $("#tb-ajuster").addEventListener("click", () => ajuster());

  /* ── le menu ── */
  const bMenu = $("#tb-menu-b"), menu = $("#tb-menu");
  function fermerMenu() { menu.hidden = true; bMenu.setAttribute("aria-expanded", "false"); }
  bMenu.addEventListener("click", () => {
    const ouvrir = menu.hidden;
    menu.hidden = !ouvrir;
    bMenu.setAttribute("aria-expanded", String(ouvrir));
    if (ouvrir) majMenu();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== bMenu) fermerMenu();
  });
  function majMenu() {
    $("#tb-fonds").innerHTML = FONDS_TABLEAU.map(([c, t]) => pastille("fond", c, etat.fond, t)).join("");
    $("#tb-grilles").innerHTML = GRILLES.map(([v, t]) => '<option value="' + v + '"' + (v === etat.grille ? " selected" : "")
      + ">" + t + "</option>").join("");
    $("#tb-theme").value = etat.theme;
  }
  menu.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.prop === "fond") { etat.fond = b.dataset.val; majFond(); majMenu(); garder(); demander(); return; }
    const a = b.dataset.menu;
    if (!a) return;
    fermerMenu();
    if (a === "ouvrir") $("#tb-fichier").click();
    else if (a === "enregistrer") enregistrer();
    else if (a === "exporter") ouvrirExport();
    else if (a === "aide") ouvrirDialogue("#tb-aide");
    else if (a === "effacer") {
      if (!elements.length) return;
      if (!window.confirm("Effacer tout le tableau ? (Ctrl + Z le fait revenir.)")) return;
      retirer(elements.map((x) => x.id));
      memoriser(); majPanneau(); demander();
      dire("Tableau effacé. Ctrl + Z pour revenir.");
    }
  });
  $("#tb-grilles").addEventListener("change", (e) => { etat.grille = e.target.value; garder(); demander(); });
  $("#tb-theme").addEventListener("change", (e) => { etat.theme = e.target.value; majFond(); garder(); });

  /* ── le thème : celui du site par défaut ──
     En sombre, le canevas est INVERSÉ par un filtre (invert 93 %, puis la
     teinte remise à l'endroit) : c'est le procédé d'Excalidraw. Le noir
     enregistré reste noir dans le fichier ; seul l'écran s'inverse. */
  function sombre() {
    if (etat.theme === "sombre") return true;
    if (etat.theme === "clair") return false;
    return document.documentElement.dataset.sombre === "1";
  }
  function majFond() {
    scene.classList.toggle("tb-sombre", sombre());
    demander();
  }
  new MutationObserver(majFond).observe(document.documentElement, { attributes: true, attributeFilter: ["data-sombre", "data-theme"] });

  /* ── les dialogues ── */
  function ouvrirDialogue(sel) {
    const d = $(sel);
    if (d.showModal) { try { d.showModal(); return; } catch (e) { /* déjà ouvert */ } }
    d.setAttribute("open", "");
  }
  $$(".tb-dialogue [data-fermer]").forEach((b) => b.addEventListener("click", () => {
    const d = b.closest("dialog");
    if (d.close) d.close(); else d.removeAttribute("open");
    scene.focus({ preventScroll: true });
  }));
  function ouvrirExport() {
    $("#tb-ex-sel").disabled = !selection.size;
    $("#tb-ex-sel").checked = selection.size > 0;
    ouvrirDialogue("#tb-export");
  }
  $("#tb-ex-png").addEventListener("click", () => {
    exporterPNG(Number($("#tb-ex-echelle").value) || 2, $("#tb-ex-fond").checked, $("#tb-ex-sel").checked);
  });
  $("#tb-ex-svg").addEventListener("click", () => exporterSVG($("#tb-ex-fond").checked, $("#tb-ex-sel").checked));
  $("#tb-ex-json").addEventListener("click", enregistrer);

  /* ── agrandir : tout l'écran au tableau ── */
  const bPlein = $("#tb-plein");
  function basculerPlein(force) {
    const grand = force === undefined ? !section.classList.contains("tb-grand") : force;
    section.classList.toggle("tb-grand", grand);
    document.body.classList.toggle("nw-fige", grand);
    bPlein.setAttribute("aria-pressed", String(grand));
    bPlein.title = grand ? "Réduire (Échap)" : "Agrandir le tableau";
    bPlein.setAttribute("aria-label", bPlein.title);
    requestAnimationFrame(() => { demander(); });
    scene.focus({ preventScroll: true });
  }
  bPlein.addEventListener("click", () => basculerPlein());
  $("#tb-aide-b").addEventListener("click", () => ouvrirDialogue("#tb-aide"));

  /* ═══════════════ 14 bis. La disposition de Whiteboard ═══════════════
     La barre de gauche (sélectionner, se déplacer, encrer, créer), la
     barre d'encrage (trois stylos, surligneur, gomme, laser), le panneau
     « Créer » qui POSE un objet au centre de l'écran d'un clic, et la
     barre d'actions qui flotte au-dessus de la sélection. */

  /* ── les formes du panneau « Créer » ──
     Rectangle, losange et ellipse sont les formes du format ; toutes les
     autres sont des POLYGONES fermés (une « ligne » dont le dernier point
     rejoint le premier). C'est ainsi que le format les connaît : un
     triangle posé ici reste un triangle sur excalidraw.com. Les points sont
     donnés dans un carré de côté 1. */
  const regulier = (k, depart) => Array.from({ length: k }, (_, i) => {
    const a = (depart || -Math.PI / 2) + i * Math.PI * 2 / k;
    return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)];
  });
  const etoile = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.2 : 0.5;
    return [0.5 + r * Math.cos(a), 0.52 + r * Math.sin(a)];
  });
  const flecheD = [[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]];
  // 1 : miroir gauche-droite ; 2 : la pointe vers le haut ; 3 : vers le bas
  const tourner = (pts, q) => pts.map(([x, y]) => q === 1 ? [1 - x, y] : q === 2 ? [y, 1 - x] : [y, x]);
  const FORMES = [
    ["rectangle", "Rectangle", { type: "rectangle", rond: false }],
    ["arrondi", "Rectangle arrondi", { type: "rectangle", rond: true }],
    ["ellipse", "Ovale", { type: "ellipse", w: 180, h: 120 }],
    ["cercle", "Cercle", { type: "ellipse", w: 140, h: 140 }],
    ["losange", "Losange", { type: "diamond" }],
    ["triangle", "Triangle", { pts: [[0.5, 0], [1, 1], [0, 1]] }],
    ["triangle-r", "Triangle rectangle", { pts: [[0, 0], [1, 1], [0, 1]] }],
    ["parallelogramme", "Parallélogramme", { pts: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]], w: 180, h: 110 }],
    ["trapeze", "Trapèze", { pts: [[0.25, 0], [0.75, 0], [1, 1], [0, 1]], w: 180, h: 110 }],
    ["pentagone", "Pentagone", { pts: regulier(5) }],
    ["hexagone", "Hexagone", { pts: regulier(6, 0) }],
    ["octogone", "Octogone", { pts: regulier(8, Math.PI / 8) }],
    ["etoile", "Étoile", { pts: etoile }],
    ["fleche-d", "Flèche droite", { pts: flecheD, w: 180, h: 110 }],
    ["fleche-g", "Flèche gauche", { pts: tourner(flecheD, 1), w: 180, h: 110 }],
    ["fleche-h", "Flèche haut", { pts: tourner(flecheD, 2), w: 110, h: 180 }],
    ["fleche-b", "Flèche bas", { pts: tourner(flecheD, 3), w: 110, h: 180 }],
    ["double-bloc", "Double flèche", { pts: [[0, 0.5], [0.25, 0], [0.25, 0.3], [0.75, 0.3], [0.75, 0], [1, 0.5], [0.75, 1], [0.75, 0.7], [0.25, 0.7], [0.25, 1]], w: 200, h: 100 }],
    ["croix", "Croix", { pts: [[0.35, 0], [0.65, 0], [0.65, 0.35], [1, 0.35], [1, 0.65], [0.65, 0.65], [0.65, 1], [0.35, 1], [0.35, 0.65], [0, 0.65], [0, 0.35], [0.35, 0.35]] }],
    ["bulle", "Bulle de dialogue", { pts: [[0, 0], [1, 0], [1, 0.72], [0.45, 0.72], [0.22, 1], [0.27, 0.72], [0, 0.72]], w: 180, h: 130 }],
    ["banniere", "Bannière", { pts: [[0, 0], [1, 0], [0.86, 0.5], [1, 1], [0, 1], [0.14, 0.5]], w: 200, h: 90 }],
  ];
  const LIGNES = [
    ["ligne", "Ligne", { type: "line" }],
    ["fleche", "Flèche", { type: "arrow", fin: "arrow" }],
    ["double", "Flèche double", { type: "arrow", debut: "arrow", fin: "arrow" }],
  ];
  function apercu(def) {
    const svg = (corps) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + corps + "</svg>";
    if (def.pts) {
      const w = def.w || 140, h = def.h || 140, k = 18 / Math.max(w, h);
      const ox = 12 - w * k / 2, oy = 12 - h * k / 2;
      return svg('<path d="M' + def.pts.map(([x, y]) => (ox + x * w * k).toFixed(1) + " " + (oy + y * h * k).toFixed(1)).join("L") + 'Z"/>');
    }
    if (def.type === "rectangle") return svg('<rect x="3" y="6" width="18" height="12" rx="' + (def.rond ? 4 : 0.5) + '"/>');
    if (def.type === "ellipse") return svg(def.w === def.h ? '<circle cx="12" cy="12" r="8.5"/>' : '<ellipse cx="12" cy="12" rx="10" ry="7"/>');
    if (def.type === "diamond") return svg('<path d="M12 3l9 9-9 9-9-9z"/>');
    if (def.type === "line") return svg('<path d="M4 19L20 5"/>');
    if (def.debut) return svg('<path d="M4 19L20 5M14 5h6v6M4 13v6h6"/>');
    return svg('<path d="M4 19L20 5M13 5h7v7"/>');
  }
  let derniereInsertion = null;
  function pointInsertion(w, h) {
    const c = versScene(toile.clientWidth / 2, toile.clientHeight / 2);
    // deux insertions de suite ne se posent pas l'une sur l'autre
    if (derniereInsertion && Math.hypot(derniereInsertion.x - c.x, derniereInsertion.y - c.y) < 1) {
      derniereInsertion.n++;
    } else derniereInsertion = { x: c.x, y: c.y, n: 0 };
    const d = derniereInsertion.n * 24 / etat.zoom;
    return { x: c.x - w / 2 + d, y: c.y - h / 2 + d };
  }
  function inserer(el) {
    elements.push(el);
    choisirOutil("selection");
    selection = new Set([el.id]);
    fermerCreer();
    // le panneau se ferme sous le doigt : le clavier revient au tableau
    scene.focus({ preventScroll: true });
    memoriser(); majPanneau(); demander();
  }
  function insererForme(def) {
    const z = Math.max(0.35, etat.zoom);
    const w = (def.w || 160) / z, h = (def.h || (def.pts ? 140 : 110)) / z;
    const p = pointInsertion(w, h);
    let el;
    if (def.pts) {
      const pts = def.pts.map(([x, y]) => [x * w, y * h]);
      const o = pts[0];
      const rel = pts.map(([x, y]) => [x - o[0], y - o[1]]);
      rel.push([0, 0]);
      el = nouvelElement("line", p.x + o[0], p.y + o[1], {
        points: rel, polygon: true, roundness: null, lastCommittedPoint: null,
        startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null,
      });
      const b = R.boite(el);
      el.width = b.w; el.height = b.h;
    } else if (def.type === "line" || def.type === "arrow") {
      el = nouvelElement(def.type, p.x, p.y + h / 2, {
        points: [[0, 0], [w, 0]], lastCommittedPoint: null, startBinding: null, endBinding: null,
        startArrowhead: def.debut || null, endArrowhead: def.fin || null, width: w, height: 0,
        backgroundColor: "transparent",
      });
      if (def.type === "arrow") el.elbowed = false; else el.polygon = false;
    } else {
      el = nouvelElement(def.type, p.x, p.y, { width: w, height: h });
      if (def.type === "rectangle") el.roundness = def.rond ? { type: 3 } : null;
    }
    inserer(el);
  }
  function insererNote(couleur) {
    const z = Math.max(0.35, etat.zoom), s = 180 / z;
    const p = pointInsertion(s, s);
    etat.courant.postit = couleur;
    const el = nouvelElement("rectangle", p.x, p.y, {
      width: s, height: s, backgroundColor: couleur, fillStyle: "solid", strokeColor: "transparent",
      strokeWidth: 1, strokeStyle: "solid", roughness: 0, roundness: { type: 3 }, opacity: 100,
      customData: { postit: true, taille: 28 },
    });
    inserer(el);
    editerLie(el);
  }
  function insererTexte() {
    const c = etat.courant, z = Math.max(0.35, etat.zoom);
    const p = pointInsertion(200 / z, c.fontSize * 1.25);
    const el = nouvelElement("text", p.x, p.y, {
      text: "", originalText: "", fontSize: c.fontSize, fontFamily: c.fontFamily, textAlign: c.textAlign,
      verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25,
      backgroundColor: "transparent", roundness: null,
    });
    elements.push(el);
    fermerCreer();
    ouvrirEdition(el, true);
  }
  $("#tb-notes").innerHTML = POSTITS.map((c) => '<button type="button" class="tb-pastille tb-note" data-note="' + c
    + '" style="--c:' + c + '" title="Note" aria-label="Note de couleur ' + c + '"></button>').join("");
  $("#tb-formes").innerHTML = FORMES.map(([id, t, def]) => '<button type="button" class="tb-b tb-forme" data-forme="' + id
    + '" title="' + t + '" aria-label="' + t + '">' + apercu(def) + "</button>").join("");
  $("#tb-lignes").innerHTML = LIGNES.map(([id, t, def]) => '<button type="button" class="tb-b tb-forme" data-ligne="' + id
    + '" title="' + t + '" aria-label="' + t + '">' + apercu(def) + "</button>").join("");
  const creer = $("#tb-creer"), bCreer = $("#tb-creer-b");
  function fermerCreer() { creer.hidden = true; bCreer.setAttribute("aria-expanded", "false"); }
  bCreer.addEventListener("click", () => {
    const ouvrir = creer.hidden;
    creer.hidden = !ouvrir;
    bCreer.setAttribute("aria-expanded", String(ouvrir));
  });
  creer.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-fermer-creer")) { fermerCreer(); return; }
    if (b.dataset.note) return insererNote(b.dataset.note);
    if (b.dataset.creer === "texte") return insererTexte();
    if (b.dataset.forme) return insererForme(FORMES.find((f) => f[0] === b.dataset.forme)[2]);
    if (b.dataset.ligne) return insererForme(LIGNES.find((f) => f[0] === b.dataset.ligne)[2]);
  });

  /* ── la barre d'encrage ──
     Un clic prend le stylo ; un second clic sur le stylo déjà en main
     ouvre son réglage — couleur et calibre —, comme dans Whiteboard. */
  const reglage = $("#tb-reglage");
  function majStylos() {
    $$("[data-stylo]").forEach((b) => {
      const st = etat.stylos[Number(b.dataset.stylo)];
      b.querySelector("i").style.setProperty("--c", st.c);
      b.querySelector("i").style.setProperty("--w", Math.min(8, 2 + st.w * 1.3) + "px");
    });
    const s = $('.tb-encrage [data-outil="surligneur"] i');
    s.style.setProperty("--c", etat.courant.surligneur);
    s.style.setProperty("--w", "8px");
  }
  function ouvrirReglage(quoi) {
    const surl = quoi === "surligneur";
    const st = surl ? { c: etat.courant.surligneur, w: etat.courant.surligneurW } : etat.stylos[quoi];
    const couleurs = surl ? SURLIGNEURS.map((c) => [c, c]) : ENCRES;
    const calibres = surl ? [3, 4.5, 6, 8, 11, 15] : CALIBRES;
    reglage.innerHTML = '<p class="tb-menu-titre">' + (surl ? "Surligneur" : "Stylo " + (quoi + 1)) + "</p>"
      + '<div class="tb-pastilles">' + couleurs.map(([c, t]) => '<button type="button" class="tb-pastille" data-rc="' + c
        + '" style="--c:' + c + '" aria-pressed="' + (c === st.c) + '" title="' + t + '" aria-label="' + t + '"></button>').join("") + "</div>"
      + '<p class="tb-menu-titre">Épaisseur</p><div class="tb-calibres">'
      + calibres.map((w, i) => '<button type="button" class="tb-b tb-petit tb-calibre" data-rw="' + w + '" aria-pressed="'
        + (w === st.w) + '" title="Épaisseur ' + (i + 1) + '" aria-label="Épaisseur ' + (i + 1) + '"><i style="--w:'
        + Math.min(16, 2 + i * 2.4) + 'px;--c:' + st.c + '"></i></button>').join("") + "</div>";
    reglage.dataset.quoi = String(quoi);
    reglage.hidden = false;
  }
  reglage.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const q = reglage.dataset.quoi;
    const surl = q === "surligneur";
    if (b.dataset.rc) { if (surl) etat.courant.surligneur = b.dataset.rc; else etat.stylos[Number(q)].c = b.dataset.rc; }
    if (b.dataset.rw) { if (surl) etat.courant.surligneurW = Number(b.dataset.rw); else etat.stylos[Number(q)].w = Number(b.dataset.rw); }
    majStylos(); garder();
    ouvrirReglage(surl ? "surligneur" : Number(q));
  });
  $$("[data-stylo]").forEach((b) => b.addEventListener("click", () => {
    const i = Number(b.dataset.stylo);
    if (etat.outil === "freedraw" && etat.stylo === i) {
      if (reglage.hidden || reglage.dataset.quoi !== String(i)) ouvrirReglage(i); else reglage.hidden = true;
      return;
    }
    etat.stylo = i;
    choisirOutil("freedraw");
    garder();
    scene.focus({ preventScroll: true });
  }));
  document.addEventListener("pointerdown", (e) => {
    if (!reglage.hidden && !reglage.contains(e.target) && !e.target.closest(".tb-stylo")) reglage.hidden = true;
  });
  const bEncre = $("#tb-encre-b");
  function majEncre() {
    $("#tb-encrage").hidden = !etat.encre;
    bEncre.setAttribute("aria-pressed", String(etat.encre));
  }
  bEncre.addEventListener("click", () => {
    etat.encre = !etat.encre;
    if (!etat.encre && /^(freedraw|surligneur|gomme|laser)$/.test(etat.outil)) choisirOutil("selection");
    majEncre(); garder();
  });

  /* ── la barre d'actions de la sélection ── */
  const contexte = $("#tb-contexte");
  function placerContexte() {
    const sel = selectionnes();
    if (!sel.length || geste || edition) { contexte.hidden = true; return; }
    const b = boiteDe(sel);
    const a = versEcran(b.x, b.y), z = versEcran(b.x + b.w, b.y + b.h);
    contexte.hidden = false;
    const bw = contexte.offsetWidth, bh = contexte.offsetHeight;
    const W = scene.clientWidth, H = scene.clientHeight;
    let y = a.y - bh - 18;
    if (y < 52) y = z.y + 18;
    if (y + bh > H - 52) y = Math.max(52, Math.min(H - bh - 52, a.y + 8));
    const x = Math.max(8, Math.min(W - bw - 8, (a.x + z.x) / 2 - bw / 2));
    contexte.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
    $('[data-ctx="format"]').setAttribute("aria-pressed", String(etat.format));
  }
  contexte.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const a = b.dataset.ctx;
    if (a === "format") { etat.format = !etat.format; majPanneau(); demander(); }
    else if (a === "copier") copier(false);
    else if (a === "dupliquer") dupliquer();
    else if (a === "devant" || a === "fond") empiler(a);
    else if (a === "supprimer") supprimerSelection();
    scene.focus({ preventScroll: true });
  });

  /* ── le titre ── */
  const titre = $("#tb-titre");
  titre.addEventListener("change", () => { etat.titre = titre.value.trim() || "Tableau sans titre"; titre.value = etat.titre; garder(); });
  titre.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { titre.blur(); scene.focus({ preventScroll: true }); } });
  $("#tb-cote").addEventListener("change", (e) => { etat.cote = e.target.value; majCote(); garder(); });
  function majCote() { scene.classList.toggle("tb-a-droite", etat.cote === "droite"); }

  /* ═══════════════ 15. Le démarrage ═══════════════════════════════════ */
  relire();
  reparer();
  elements.forEach((e) => { if (e.type === "text") { if (e.containerId) placerLie(e); } });
  pile = [JSON.stringify(elements)]; curseurPile = 0;
  majHistorique();
  new ResizeObserver(() => demander()).observe(toile);
  if (!elements.length && !etat.scrollX && !etat.scrollY) {
    etat.scrollX = toile.clientWidth / 2; etat.scrollY = toile.clientHeight / 2;
  }
  majMenu();
  titre.value = etat.titre;
  $("#tb-cote").value = etat.cote;
  majZoom(); majFond(); majStylos(); majEncre(); majCote(); choisirOutil("selection");
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { replacerLies(); demander(); });
  /* Un point d'entrée pour la vérification automatique : la scène lue
     et écrite telle qu'elle est, sans passer par la souris. */
  window.CIEL_TABLEAU = { scene: () => sceneJSON(), ouvrir: (t) => ouvrirTexte(t, "test"), etat: () => etat };
})();
