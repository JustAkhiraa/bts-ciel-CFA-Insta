/* Le tableau blanc — l'appareil.

   « rendu.js » sait dessiner un élément ; ce fichier-ci sait tout le
   reste : la caméra, les outils, la sélection, le texte, l'historique, la
   mémoire, les fichiers. Il ne contient aucune géométrie de trait.

   Le modèle est un format de tableau blanc ouvert, champ pour champ, et
   c'est un choix, pas une commodité : un tableau enregistré ici s'ouvre
   dans les éditeurs qui le partagent, et l'inverse. */
(function () {
  "use strict";
  const R = window.TB_RENDU;
  const S = window.TB_STYLET;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const section = $("#tableau");
  if (!section || !R || !S) return;
  const scene = $("#tb-scene");
  const toile = $("#tb-toile");
  const ctx = toile.getContext("2d");

  /* ── le mode sombre, couleur par couleur ──
     Avant le 9 nov. 2026, la toile entière passait sous un filtre CSS
     (invert 93 %, puis hue-rotate 180°), et chaque image recevait le même
     filtre avant, pour l'annuler. Signalé : en sombre, les images sortaient
     fausses. Deux filtres de suite ne s'annulent pas : l'inversion à 93 %
     ne rend plus ni le noir ni le blanc, et la rotation de teinte écrête les
     couleurs saturées entre deux étapes (un rouge pur ressortait saumon,
     255, 143, 143, mesuré dans le navigateur).
     La toile n'est donc plus filtrée. Chaque couleur qu'on y pose (encre,
     texte, fond, grille, sélection) passe ici par le MÊME calcul que le
     filtre, refait à la main : le tableau sombre garde son aspect, au
     2/255 près (mesuré sur 308 couleurs contre le filtre du navigateur).
     Les images, elles, sont posées telles quelles. */
  let enSombre = false;
  const ROTATION_180 = [[-0.574, 1.43, 0.144], [0.426, 0.43, 0.144], [0.426, 1.43, -0.856]];
  const borne = (x) => Math.max(0, Math.min(1, x));
  const normaliseur = document.createElement("canvas").getContext("2d");
  const teintes = new Map();
  function teinteSombre(v) {
    if (typeof v !== "string") return v;
    let t = teintes.get(v);
    if (t !== undefined) return t;
    normaliseur.fillStyle = "#000";
    normaliseur.fillStyle = v;
    const n = normaliseur.fillStyle;           // « #rrggbb » ou « rgba(r, g, b, a) »
    let c, a = 1;
    if (n[0] === "#") c = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16));
    else {
      const p = (n.match(/\(([^)]*)\)/) || [, ""])[1].split(",").map(Number);
      if (p.length < 3 || p.some(isNaN)) { teintes.set(v, v); return v; }
      c = p.slice(0, 3);
      if (p.length > 3) a = p[3];
    }
    const inv = c.map((x) => borne(0.93 - 0.86 * x / 255));
    const o = ROTATION_180.map((l) => Math.round(255 * borne(l[0] * inv[0] + l[1] * inv[1] + l[2] * inv[2])));
    t = a < 1 ? "rgba(" + o.join(", ") + ", " + a + ")" : "rgb(" + o.join(", ") + ")";
    teintes.set(v, t);
    return t;
  }
  // Seule la toile de l'écran est concernée : un export n'est jamais sombre.
  ["fillStyle", "strokeStyle", "shadowColor"].forEach((nom) => {
    const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, nom);
    Object.defineProperty(ctx, nom, { configurable: true,
      get() { return d.get.call(this); },
      set(v) { d.set.call(this, enSombre ? teinteSombre(v) : v); } });
  });
  ["createLinearGradient", "createRadialGradient"].forEach((nom) => {
    const creer = CanvasRenderingContext2D.prototype[nom];
    ctx[nom] = function (...args) {
      const g = creer.apply(this, args);
      if (enSombre) { const poser = g.addColorStop.bind(g); g.addColorStop = (o, c) => poser(o, teinteSombre(c)); }
      return g;
    };
  });
  const saisie = $("#tb-saisie");
  const panneau = $("#tb-props");
  const etatLigne = $("#tb-etat");

  /* ═══════════════ 1. Les constantes ══════════════════════════════════
     La palette est Open Color : elle est faite pour
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
  /* Les douze couleurs de post-it, prises dans la même
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
  /* Les familles du format, par leur numéro, ramenées à TROIS polices
     déjà présentes sur la machine : on ne télécharge aucune fonte. Un
     fichier venu d'ailleurs garde son numéro — il retrouvera sa vraie
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
  const PAD = 5;               // le rembourrage du texte lié, dans le format
  const PAD_POSTIT = 14;

  /* ═══════════════ 2. L'état ═════════════════════════════════════════ */
  let elements = [];
  const etat = {
    outil: "selection", verrou: false,
    scrollX: 0, scrollY: 0, zoom: 1,
    fond: "#ffffff", grille: "points", theme: "site",
    titre: "Tableau sans titre", cote: "gauche", encre: true, format: false,
    /* Le style par défaut : trait NET, fond plein,
       police ordinaire. Le trait tremblé reste à un clic, dans
       « Format ». */
    courant: {
      strokeColor: NOIR, backgroundColor: "transparent", fillStyle: "solid",
      strokeWidth: 2, strokeStyle: "solid", roughness: 0, arrondi: true, opacity: 100,
      fontFamily: 2, fontSize: 20, textAlign: "left",
      startArrowhead: null, endArrowhead: "arrow",
      postit: POSTITS[0], surligneur: SURLIGNEURS[0], surligneurW: 6,
    },
    /* Les trois stylos, réglés chacun pour soi. */
    /* Cinq outils d'écriture, chacun sa pointe (demandé le 9 nov. 2026 :
       trois fois le même stylo ne servait à rien, la couleur se change
       déjà dans le réglage). Chacun garde sa couleur, son calibre, et sa
       pointe se change en le recliquant. */
    stylos: [
      { c: NOIR, w: 1.6 },                                  // stylo à bille
      { c: OC.blue[4], w: 1.6, pointe: "plume" },           // stylo-plume
      { c: OC.gray[4], w: 1.6, pointe: "crayon" },          // crayon de papier
      { c: OC.red[4], w: 2.4, pointe: "marqueur" },         // marqueur
      { c: OC.teal[4], w: 2.4, pointe: "aquarelle" },       // pinceau
    ],
    stylo: 0,
    /* Le stylet : les formes reconnues, la gomme qui coupe, la règle, et
       ce qu'on fait du doigt quand un stylet a été vu. */
    /* La gomme efface sous le curseur, comme une vraie gomme : c'est le
       défaut depuis le 8 nov. 2026. « Trait entier » reste à un clic. */
    formes: false, gommeMode: "partie", gommeChoisie: false, gommeTaille: 12,
    /* Le lasso prend les éléments ENTIERS, ou découpe ce qu'il entoure
       (« partie », demandé le 9 nov. 2026) : recliquer le lasso choisit. */
    lassoMode: "entier",
    /* La forme de la boucle (demandé le 9 nov. 2026 : plusieurs outils de
       sélection sous le lasso) : à main levée, rectangle, ellipse, ou
       polygone posé coin par coin. */
    lassoForme: "libre",
    /* Le laser se règle (demandé le 9 nov. 2026 : il disparaissait trop
       vite) : combien de temps il reste, sa couleur, son épaisseur, sa
       transparence. Par défaut, le laser d'avant, au réglage près. */
    laserDuree: 1.4, laserCouleur: "#ff2f2f", laserTaille: 5, laserOpacite: 1,
    styletSeul: false, inclinaison: true, regle: null,
  };
  /* Les douze encres, et les six calibres. */
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
  let calqueLaser = null;             // son calque, posé d'un coup avec sa transparence
  let traineeGomme = [];
  let fantomes = new Set();           // ce que la gomme va effacer
  const ignores = new Set();          // les doigts écartés : une paume posée
  let penBas = null;                  // le stylet en contact, s'il l'est
  let pressePapiers = null;

  /* ── l'historique : une photographie de la scène par action ── */
  let pile = [], curseurPile = -1;
  let baguette = null;               // la zone choisie à la baguette magique
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
          formes: etat.formes, gommeMode: etat.gommeMode, gommeChoisie: etat.gommeChoisie, gommeTaille: etat.gommeTaille,
          lassoMode: etat.lassoMode, lassoForme: etat.lassoForme, laserDuree: etat.laserDuree, laserCouleur: etat.laserCouleur,
          laserTaille: etat.laserTaille, laserOpacite: etat.laserOpacite,
          styletSeul: etat.styletSeul, inclinaison: etat.inclinaison,
        }));
        /* Les images vivent dans leur propre clé : réécrire un mégaoctet
           de photo à chaque trait tracé ferait ramer la main. Elles ne
           sont réécrites que quand la liste des images en usage change. */
        const vues = fichiersDe(elements), cle = Object.keys(vues).sort().join();
        if (cle !== fichiersGardes) {
          try { localStorage.setItem(FICHIERS_CLE, JSON.stringify(vues)); fichiersGardes = cle; }
          catch (e) {
            dire("Les images dépassent la mémoire du navigateur : Ctrl S enregistre le tableau en fichier, images comprises.", true);
            return;
          }
        }
        marquerSauve(true);
      } catch (e) { /* stockage plein ou bloqué : le tableau marche quand même */ }
    }, 250);
  }
  function relire() {
    try {
      const lu = JSON.parse(localStorage.getItem(ECRIT_CLE) || "null");
      if (!lu) return;
      if (Array.isArray(lu.elements)) elements = lu.elements.map(normaliser).filter(Boolean);
      ["fond", "grille", "theme", "scrollX", "scrollY", "zoom", "titre", "cote", "encre", "stylo",
       "formes", "gommeMode", "gommeChoisie", "gommeTaille", "lassoMode", "lassoForme", "laserDuree", "laserCouleur", "laserTaille", "laserOpacite", "styletSeul", "inclinaison"].forEach((k) => {
        if (lu[k] !== undefined && lu[k] !== null) etat[k] = lu[k];
      });
      // un « trait entier » enregistré AVANT le changement de défaut n'était
      // pas un choix, seulement l'ancien défaut : on ne le garde que s'il a
      // été choisi
      if (!lu.gommeChoisie) etat.gommeMode = "partie";
      if (lu.courant) Object.assign(etat.courant, lu.courant);
      // cinq stylos depuis le 9 nov. 2026 : un réglage à trois reprend les cinq nouveaux
      if (Array.isArray(lu.stylos) && lu.stylos.length === etat.stylos.length) etat.stylos = lu.stylos;
      if (!(etat.stylo < etat.stylos.length)) etat.stylo = 0;
      const f = JSON.parse(localStorage.getItem(FICHIERS_CLE) || "null");
      if (f && typeof f === "object") { fichiers = f; fichiersGardes = Object.keys(f).sort().join(); }
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
     version du format, un fichier écrit à la main) : on complète, sans
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
     forme qui grandit. Un post-it, lui, RÉDUIT d'abord
     sa police, et ne grandit qu'en dernier recours. */
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
     Écran = (scène + défilement) × zoom : la convention du format, qui
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
    majLiens();
    if (!demande) demande = requestAnimationFrame(() => { demande = 0; peindre(); });
  }
  const cacheChemins = new Map();
  function cleForme(el) {
    let s = el.type + "|" + el.width + "|" + el.height + "|" + el.seed + "|" + el.strokeColor + "|"
      + el.backgroundColor + "|" + el.fillStyle + "|" + el.strokeWidth + "|" + el.strokeStyle + "|"
      + el.roughness + "|" + JSON.stringify(el.roundness) + "|" + el.startArrowhead + "|" + el.endArrowhead
      + "|" + ((el.customData && el.customData.pointe) || "");
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
    // Le surligneur fonce ce qu'il recouvre ; en sombre, où les couleurs
    // sont retournées, c'est « screen » qui fait la même chose : il
    // éclaircit, et l'encre dessous reste lisible.
    if (estSurligneur(el)) c.globalCompositeOperation = c === ctx && enSombre ? "screen" : "multiply";
    if (estPostit(el)) {
      // l'ombre portée d'une note collée : ce qui la distingue d'un rectangle
      c.shadowColor = "rgba(0,0,0,.18)"; c.shadowBlur = 10; c.shadowOffsetY = 3;
    }
    const effet = el.type === "freedraw" && el.customData && el.customData.effet;
    const matiere = el.type === "freedraw" && el.customData && MATIERES[el.customData.pointe];
    if (el.type === "text") {
      dessinerTexte(c, el);
    } else if (el.type === "image") {
      dessinerImage(c, el);
    } else {
      cheminsDe(el).forEach((op) => {
        if (!op.couleur || op.couleur === "transparent") return;
        if (!op.p) op.p = new Path2D(op.d);
        if (op.mode === "fond" && matiere && op.couleur === el.strokeColor) peindreMatiere(c, el, matiere, op.p);
        else if (op.mode === "fond" && effet && op.couleur === el.strokeColor) peindreEffet(c, el, effet, op.p);
        else if (op.mode === "fond") { c.fillStyle = op.couleur; c.fill(op.p); }
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
  /* ── les matières de pointe ──
     Le crayon et le pastel déposent l'encre en GRAIN : un motif de la
     couleur du trait, criblé de trous, calculé une fois par couleur avec
     une graine fixe (le même grain à chaque rendu), et posé dans le repère
     de l'élément : il le suit quand on le déplace. Le marqueur et
     l'aquarelle laissent voir ce qu'il y a dessous ; l'aquarelle diffuse
     au bord, et son pigment s'y accumule en un liseré à peine plus foncé.
     Une matière remplace un effet : on ne peint pas un pastel en néon. */
  const MATIERES = {
    crayon: { grain: "fin", alpha: 0.92, svg: 0.8 },
    pastel: { grain: "gros", alpha: 0.95, svg: 0.85 },
    marqueur: { alpha: 0.85, svg: 0.85 },
    aquarelle: { alpha: 0.42, flou: 7, svg: 0.42 },
  };
  const toiles = new Map();
  function toileGrain(couleur, sorte) {
    const cle = couleur + "|" + sorte;
    if (toiles.has(cle)) return toiles.get(cle);
    const fin = sorte === "fin", t = fin ? 32 : 48, pas = fin ? 1 : 2;
    const cv = document.createElement("canvas");
    cv.width = cv.height = t;
    const g = cv.getContext("2d");
    let s = 20261108;
    const hasard = () => (s = (s * 16807) % 2147483647) / 2147483647;
    g.fillStyle = couleur;
    for (let y = 0; y < t; y += pas) {
      for (let x = 0; x < t; x += pas) {
        const v = hasard();
        // crayon : un grain serré, quelques trous ; pastel : des mottes
        const a = fin ? (v < 0.18 ? 0.12 : 0.5 + 0.5 * v) : (v < 0.3 ? 0 : 0.3 + 0.7 * v);
        if (!a) continue;
        g.globalAlpha = a;
        g.fillRect(x, y, pas, pas);
      }
    }
    toiles.set(cle, cv);
    return cv;
  }
  function peindreMatiere(c, el, m, p) {
    c.save();
    c.globalAlpha *= m.alpha;
    if (m.flou) { c.shadowColor = el.strokeColor; c.shadowBlur = m.flou; }
    // le grain est une petite toile à part : sa couleur s'assombrit ici
    const grain = c === ctx && enSombre ? teinteSombre(el.strokeColor) : el.strokeColor;
    c.fillStyle = m.grain ? c.createPattern(toileGrain(grain, m.grain), "repeat") : el.strokeColor;
    c.fill(p);
    if (m.flou) {
      c.shadowBlur = 0; c.shadowColor = "transparent";
      c.lineWidth = 1.2; c.strokeStyle = el.strokeColor;
      c.stroke(p);
    }
    c.restore();
  }

  /* ── les effets de pointe ──
     L'encre reste un contour plein ; seul son REMPLISSAGE change. Le
     dégradé suit la diagonale du trait, dans le repère de l'élément : il
     se déplace avec lui et ne dépend pas du zoom. */
  const EFFETS = {
    arcenciel: [[0, "#e03131"], [0.17, "#f08c00"], [0.33, "#f2c200"], [0.5, "#2f9e44"],
                [0.67, "#1c7ed6"], [0.83, "#6741d9"], [1, "#c2255c"]],
    or: [[0, "#8a6a12"], [0.22, "#e2bd4f"], [0.42, "#fff1a8"], [0.6, "#d1a12a"], [0.82, "#93700f"], [1, "#e6c158"]],
  };
  function diagonale(el) {
    // un morceau laissé par la gomme garde le dégradé du trait entier
    if (el.customData && el.customData.diag) return el.customData.diag;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of el.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (x1 - x0 < 1 && y1 - y0 < 1) { x0 -= 4; x1 += 4; }
    return [x0, y0, x1, y1];
  }
  function peindreEffet(c, el, effet, p) {
    if (effet === "neon") {
      // une lueur de la couleur, puis un cœur pâle : le tube allumé
      c.shadowColor = el.strokeColor; c.shadowBlur = 14;
      c.fillStyle = el.strokeColor; c.fill(p);
      c.shadowBlur = 0; c.shadowColor = "transparent";
      c.globalAlpha *= 0.35; c.fillStyle = "#ffffff"; c.fill(p); c.globalAlpha /= 0.35;
      return;
    }
    const arrets = EFFETS[effet];
    if (!arrets) { c.fillStyle = el.strokeColor; c.fill(p); return; }
    const [x0, y0, x1, y1] = diagonale(el);
    const g = c.createLinearGradient(x0, y0, x1, y1);
    arrets.forEach(([t, couleur]) => g.addColorStop(t, couleur));
    if (effet === "or") { c.shadowColor = "rgba(110,70,0,.35)"; c.shadowBlur = 2; c.shadowOffsetY = 1; }
    c.fillStyle = g; c.fill(p);
    c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetY = 0;
  }
  function svgEffet(el, effet, d) {
    if (effet === "neon") {
      const f = "n" + el.id;
      return '<filter id="' + f + '" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/>'
        + '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
        + '<path d="' + d + '" fill="' + el.strokeColor + '" filter="url(#' + f + ')"/>'
        + '<path d="' + d + '" fill="#ffffff" fill-opacity=".35"/>';
    }
    const [x0, y0, x1, y1] = diagonale(el), id = "d" + el.id;
    return '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + x0.toFixed(1) + '" y1="' + y0.toFixed(1)
      + '" x2="' + x1.toFixed(1) + '" y2="' + y1.toFixed(1) + '">'
      + EFFETS[effet].map(([t, couleur]) => '<stop offset="' + t + '" stop-color="' + couleur + '"/>').join("")
      + '</linearGradient><path d="' + d + '" fill="url(#' + id + ')"/>';
  }

  /* Une image se dessine telle quelle, en sombre comme en clair : seules
     les COULEURS posées sur la toile s'assombrissent (voir « le mode
     sombre, couleur par couleur »), et une image n'en a pas. */
  function dessinerImage(c, el) {
    // pendant un coup de gomme, c'est la copie gommée qu'on montre
    const gommee = c === ctx && geste && geste.toiles && geste.toiles.get(el.id);
    const img = gommee ? gommee.cv : imageDe(el.fileId);
    if (img && (gommee || (img.complete && img.naturalWidth))) {
      const s = Array.isArray(el.scale) ? el.scale : [1, 1];
      if (s[0] < 0 || s[1] < 0) {
        c.translate(s[0] < 0 ? el.width : 0, s[1] < 0 ? el.height : 0);
        c.scale(s[0] < 0 ? -1 : 1, s[1] < 0 ? -1 : 1);
      }
      c.drawImage(img, 0, 0, el.width, el.height);
      return;
    }
    // pas encore décodée, ou fichier absent : un cadre qui garde sa place
    c.fillStyle = "rgba(134,142,150,.12)"; c.fillRect(0, 0, el.width, el.height);
    c.strokeStyle = "rgba(134,142,150,.7)"; c.lineWidth = 1 / etat.zoom;
    c.setLineDash([6 / etat.zoom, 4 / etat.zoom]); c.strokeRect(0, 0, el.width, el.height); c.setLineDash([]);
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
    enSombre = sombre();
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
    dessinerRegle(dpr);
    $("#tb-accueil").hidden = elements.length > 0 || !!geste;
    placerContexte();
    placerLecture();
  }

  /* ── la grille ────────────────────────────────────────────────────
     Tracée en coordonnées d'écran, au pas de la scène. Quand le zoom
     l'écrase, son pas se multiplie par cinq ; quand elle s'éclaircit
     encore, elle s'efface en fondu — une grille saturée devient un gris
     uniforme et ne sert plus à rien. */
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
    dessinerPoigneeTourner(sel);
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
    // « jusqu'au relâchement » : tant qu'on tient le laser, rien ne vieillit
    const relache = etat.laserDuree === "relache";
    if (relache && geste && geste.mode === "laser") laser.forEach((p) => { p.t = maintenant; });
    const vieLaser = relache ? 900 : Number(etat.laserDuree) * 1000 || 1400;
    laser = laser.filter((p) => maintenant - p.t < vieLaser);
    traineeGomme = traineeGomme.filter((p) => maintenant - p.t < 260);
    /* Un trait reste plein, puis s'efface sur ses « fondu » dernières
       millisecondes (1,4 s au plus). Au réglage d'origine, durée et fondu
       sont égaux : le laser s'efface comme avant, dès qu'il est tracé. */
    const trace = (c, pts, couleur, epais, vie, fondu) => {
      fondu = Math.min(vie, fondu || vie);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (b.coupure) continue;
        const age = Math.max(0, Math.min(1, (maintenant - b.t - (vie - fondu)) / fondu));
        c.strokeStyle = couleur;
        c.globalAlpha = 1 - age;
        c.lineWidth = (epais * (1 - age * 0.7)) / z;
        c.lineCap = "round";
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
    };
    ctx.save();
    ctx.setLineDash([]);
    /* Le laser se peint sur un CALQUE à part, posé ensuite d'un coup avec sa
       transparence : tracé segment par segment, chaque jonction doublait
       l'opacité, et un laser à 45 % sortait presque plein (mesuré :
       51, 194, 104 pour un vert à 45 % sur du blanc). Le calque ne passe
       pas par les couleurs du mode sombre : un laser rouge reste rouge. */
    if (laser.length) {
      const W = toile.width, H = toile.height;
      if (!calqueLaser || calqueLaser.width !== W || calqueLaser.height !== H) {
        calqueLaser = document.createElement("canvas");
        calqueLaser.width = W; calqueLaser.height = H;
      }
      const c2 = calqueLaser.getContext("2d");
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.clearRect(0, 0, W, H);
      c2.setTransform(ctx.getTransform());
      // la lueur prend la couleur du laser
      c2.shadowColor = etat.laserCouleur + "cc"; c2.shadowBlur = 8;
      trace(c2, laser, etat.laserCouleur, etat.laserTaille, vieLaser, 1400);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = etat.laserOpacite;
      ctx.drawImage(calqueLaser, 0, 0);
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    if (traineeGomme.length) trace(ctx, traineeGomme, "rgba(120,120,120,.5)", 12, 260);
    if (geste && geste.mode === "lasso" && geste.forme === "polygone") {
      // les coins posés, le côté qui suit le doigt, et le premier coin à retoucher
      const pts = geste.survol ? geste.pts.concat([geste.survol]) : geste.pts;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.setLineDash([6 / z, 5 / z]); ctx.lineWidth = 1.5 / z; ctx.strokeStyle = BLEU_SEL; ctx.stroke();
      ctx.setLineDash([]);
      geste.pts.forEach(([x, y], i) => {
        ctx.beginPath(); ctx.arc(x, y, (i ? 3.5 : 6) / z, 0, Math.PI * 2);
        ctx.fillStyle = i ? BLEU_SEL : "#fff"; ctx.fill(); ctx.stroke();
      });
    } else if (geste && geste.mode === "lasso" && geste.pts.length > 1) {
      ctx.beginPath();
      geste.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = "rgba(76,110,245,.07)"; ctx.fill();
      ctx.setLineDash([6 / z, 5 / z]); ctx.lineWidth = 1.5 / z; ctx.strokeStyle = BLEU_SEL; ctx.stroke();
      ctx.setLineDash([]);
    }
    // la baguette : la zone choisie, posée sur l'image même
    if (baguette && baguette.voile) dessinerVoile();
    // la gomme partielle montre ce qu'elle va prendre
    if (etat.outil === "gomme" && etat.gommeMode === "partie" && dernierePos) {
      ctx.beginPath(); ctx.arc(dernierePos.x, dernierePos.y, etat.gommeTaille / z, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fill();
      ctx.lineWidth = 1 / z; ctx.strokeStyle = "rgba(73,80,87,.85)"; ctx.stroke();
    }
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

  /* ── tourner : la poignée ronde ──
     Demandé : tourner ce qu'on a sélectionné, au doigt, comme une feuille
     posée sur la table. La poignée se tient SOUS la sélection — au-dessus,
     la barre d'actions la cacherait. Elle sert aussi aux éléments déjà
     tournés : la boîte qui la place est celle qu'on VOIT, coins tournés
     compris, et non la boîte d'avant rotation. */
  function boiteVue(liste) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    liste.forEach((el) => {
      const b = R.boite(el);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = el.angle || 0;
      const co = Math.cos(a), si = Math.sin(a);
      [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].forEach(([x, y]) => {
        const X = cx + (x - cx) * co - (y - cy) * si, Y = cy + (x - cx) * si + (y - cy) * co;
        x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
      });
    });
    return liste.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  function poigneeTourner() {
    const sel = selectionnes();
    if (!sel.length || geste || edition || sel.some((e) => e.locked)) return null;
    const b = boiteVue(sel), z = etat.zoom;
    return { x: b.x + b.w / 2, y: b.y + b.h + 30 / z, r: 11 / z };
  }
  function surPoigneeTourner(x, y) {
    const T = poigneeTourner();
    // au doigt, une marge de plus : la poignée fait 22 px, une cible 34
    return !!T && Math.hypot(x - T.x, y - T.y) <= T.r + 7 / etat.zoom;
  }
  function dessinerPoigneeTourner(sel) {
    const z = etat.zoom;
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = BLEU_SEL;
    if (geste && geste.mode === "tourner") {
      // pendant le geste : le centre, le rayon jusqu'au doigt, et l'angle
      const g = geste;
      ctx.lineWidth = 1 / z;
      ctx.beginPath(); ctx.moveTo(g.c.x, g.c.y); ctx.lineTo(g.p.x, g.p.y); ctx.stroke();
      ctx.fillStyle = BLEU_SEL;
      ctx.beginPath(); ctx.arc(g.c.x, g.c.y, 3 / z, 0, Math.PI * 2); ctx.fill();
      const txt = (g.deg > 0 ? "+" : "") + g.deg + "°";
      ctx.font = "600 " + (13 / z) + "px system-ui, sans-serif";
      const w = ctx.measureText(txt).width + 12 / z, h = 20 / z;
      const x = g.p.x + 14 / z, y = g.p.y - h - 6 / z;
      ctx.fillStyle = BLEU_SEL;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 6 / z) : ctx.rect(x, y, w, h); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
      ctx.fillText(txt, x + 6 / z, y + h / 2);
      ctx.restore();
      return;
    }
    const T = poigneeTourner();
    if (!T || !sel.length) { ctx.restore(); return; }
    const b = boiteVue(sel);
    ctx.lineWidth = 1 / z;
    ctx.beginPath(); ctx.moveTo(T.x, b.y + b.h + 6 / z); ctx.lineTo(T.x, T.y - T.r); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(T.x, T.y, T.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // la flèche qui tourne : un arc ouvert, et sa pointe
    const r = T.r * 0.52, a0 = -Math.PI * 0.35, a1 = Math.PI * 1.25;
    ctx.lineWidth = 1.6 / z; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(T.x, T.y, r, a0, a1); ctx.stroke();
    const px = T.x + r * Math.cos(a0), py = T.y + r * Math.sin(a0), k = 3.2 / z;
    ctx.beginPath();
    ctx.moveTo(px - k, py - k * 0.6); ctx.lineTo(px + k * 0.2, py); ctx.lineTo(px - k * 0.7, py + k * 0.9);
    ctx.stroke();
    ctx.restore();
  }

  /* ── tourner et retourner ──
     Chaque élément est recalculé depuis sa COPIE d'origine, prise au début
     du geste : tourner de 1° deux cents fois ne doit pas accumuler deux cents
     arrondis. Un trait — à main levée, une ligne, une flèche — reçoit la
     transformation dans ses points : il reste droit dans sa boîte, donc
     redimensionnable. Une forme, un texte, une image gardent leur dessin et
     prennent un angle — un texte retourné en miroir resterait illisible, il
     change donc de place, pas de sens de lecture. */
  const TOUR = Math.PI * 2;
  const normaliserAngle = (a) => {
    const r = ((a % TOUR) + TOUR) % TOUR;
    return Math.abs(r) < 1e-9 || Math.abs(r - TOUR) < 1e-9 ? 0 : r;
  };
  function rotationAutour(c, a) {
    const co = Math.cos(a), si = Math.sin(a);
    return (x, y) => [c.x + (x - c.x) * co - (y - c.y) * si, c.y + (x - c.x) * si + (y - c.y) * co];
  }
  function pointsVus(o) {
    const b = R.boite(o);
    const f = o.angle ? rotationAutour({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, o.angle) : null;
    return o.points.map(([x, y]) => (f ? f(o.x + x, o.y + y) : [o.x + x, o.y + y]));
  }
  function transformer(origines, f, da, miroir) {
    origines.forEach((o) => {
      const el = parId(o.id);
      if (!el) return;
      if (o.points && o.points.length) {
        const pts = pointsVus(o).map(([x, y]) => f(x, y));
        el.x = pts[0][0]; el.y = pts[0][1];
        el.points = pts.map(([x, y]) => [x - el.x, y - el.y]);
        el.angle = 0;
        const bb = R.boite(Object.assign({}, el, { x: 0, y: 0 }));
        el.width = bb.w; el.height = bb.h;
      } else {
        const w = o.width || 0, h = o.height || 0;
        const cx = o.x + w / 2, cy = o.y + h / 2;
        const [nx, ny] = f(cx, cy);
        let a = normaliserAngle(miroir ? -(o.angle || 0) : (o.angle || 0) + da);
        el.width = w; el.height = h;
        /* Un rectangle, une ellipse, un losange tournés d'un quart de tour
           sont le même dessin, largeur et hauteur échangées : on les garde
           droits, et leurs poignées de taille restent là. */
        const quarts = a / (Math.PI / 2);
        if (/^(rectangle|ellipse|diamond)$/.test(el.type) && Math.abs(quarts - Math.round(quarts)) < 1e-9) {
          if (Math.round(quarts) % 2) { el.width = h; el.height = w; }
          a = 0;
        }
        el.x = nx - el.width / 2; el.y = ny - el.height / 2;
        el.angle = a;
        if (miroir && el.type === "image") {
          const s = Array.isArray(o.scale) ? o.scale : [1, 1];
          el.scale = miroir === "miroirH" ? [-s[0], s[1]] : [s[0], -s[1]];
        }
      }
      toucher(el);
    });
    replacerLies(origines.map((o) => parId(o.id)).filter(Boolean));
  }
  function centreDe(liste) {
    const b = boiteVue(liste);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  function transformerSelection(quoi) {
    const sel = selectionnes().filter((x) => !x.locked);
    if (!sel.length) return;
    const c = centreDe(sel);
    const origines = sel.map((el) => JSON.parse(JSON.stringify(el)));
    if (quoi === "droite" || quoi === "gauche") {
      const a = (quoi === "droite" ? 1 : -1) * Math.PI / 2;
      transformer(origines, rotationAutour(c, a), a, false);
    } else {
      transformer(origines, quoi === "miroirH" ? (x, y) => [2 * c.x - x, y] : (x, y) => [x, 2 * c.y - y], 0, quoi);
    }
    memoriser(); majPanneau(); demander();
    dire({ droite: "Tourné d'un quart de tour à droite.", gauche: "Tourné d'un quart de tour à gauche.",
           miroirH: "Retourné de gauche à droite.", miroirV: "Retourné de haut en bas." }[quoi]);
  }
  /* Le geste : l'angle est celui du doigt autour du centre, depuis là où
     il s'est posé. Il s'aimante à 0°, 45°, 90°… à 4° près ; avec Maj, il
     avance de 15° en 15°. */
  function tournerGeste(g, p, e) {
    let deg = (Math.atan2(p.y - g.c.y, p.x - g.c.x) - g.a0) * 180 / Math.PI;
    deg = ((deg % 360) + 540) % 360 - 180;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    else {
      const q = Math.round(deg / 45) * 45;
      if (Math.abs(deg - q) < 4) deg = q;
    }
    g.deg = Math.round(deg);
    g.p = p;
    const a = deg * Math.PI / 180;
    transformer(g.origines, rotationAutour(g.c, a), a, false);
    demander();
  }

  /* ═══════════════ 8. Les outils ══════════════════════════════════════ */
  const OUTILS_FORME = ["rectangle", "diamond", "ellipse", "postit"];
  const OUTILS_DESSIN = ["freedraw", "surligneur"];
  const OUTILS_ENCRE = ["freedraw", "surligneur", "gomme", "lasso", "laser", "baguette"];
  function choisirOutil(o) {
    if (edition) finirEdition();
    if (geste && geste.mode === "lasso") { geste = null; demander(); }
    etat.outil = o;
    lienDebut = null;
    if (o !== "selection") selection.clear();
    if (o !== "baguette") baguette = null;
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

  /* ═══════════════ 8 bis. Le stylet ══════════════════════════════════
     La géométrie vit dans « stylet.js » ; ici, seulement ce qu'il faut
     pour la brancher sur les gestes et sur la scène. */
  const absolus = (el) => el.points.map(([x, y]) => [el.x + x, el.y + y]);
  const NOM_FORME = { line: "segment", rectangle: "rectangle", diamond: "losange", ellipse: "ellipse",
                      triangle: "triangle", polygone: "quadrilatère" };

  /* ── la paume ──
     Dès qu'un stylet a touché l'écran, le doigt n'écrit plus sur les
     outils d'encre : il fait défiler, et deux doigts zooment. Tant que la
     pointe est posée, tout contact de la peau est ignoré — c'est la main
     qui s'appuie pour écrire. */
  function accueillir(e) {
    if (e.pointerType === "pen") {
      if (!etat.styletSeul) {
        etat.styletSeul = true; garder();
        dire("Stylet reconnu : il écrit, le doigt fait défiler. Réglable en recliquant sur un stylo.");
      }
      penBas = e.pointerId;
      // une paume posée AVANT la pointe : son geste est oublié
      for (const [id, q] of pointeurs) if (q.type === "touch") { pointeurs.delete(id); ignores.add(id); }
      if (geste && geste.type === "touch") annulerGeste();
      return true;
    }
    if (e.pointerType === "touch" && etat.styletSeul && penBas !== null) { ignores.add(e.pointerId); return false; }
    return true;
  }

  /* ── la pression, et l'inclinaison ──
     Un stylet couché élargit le trait, comme une mine qu'on incline pour
     ombrer. L'angle vient d'« altitudeAngle » (π/2 : debout), ou se déduit
     de tiltX / tiltY quand le navigateur n'a que ceux-là. Le résultat reste
     une PRESSION, le seul champ que le format connaisse : un tableau ouvert
     ailleurs garde le trait tel qu'il a été tracé. */
  function pressionDe(ev, el) {
    if (el.simulatePressure) return 0.5;
    let p = ev.pressure || 0.5;
    if (etat.inclinaison && ev.pointerType === "pen") {
      let alt = typeof ev.altitudeAngle === "number" ? ev.altitudeAngle : null;
      if (alt === null && (ev.tiltX || ev.tiltY)) {
        const tx = Math.tan(ev.tiltX * Math.PI / 180), ty = Math.tan(ev.tiltY * Math.PI / 180);
        alt = Math.atan(1 / Math.hypot(tx, ty));
      }
      if (alt !== null) {
        const couche = 1 - Math.max(0, Math.min(1, alt / (Math.PI / 2)));
        p *= 1 + 2 * couche * couche;
      }
    }
    return p;
  }

  /* ── d'un trait à une forme ── */
  function droite(el, a, b) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(L / 6));
    const pm = el.pressures && el.pressures.length
      ? el.pressures.reduce((s, x) => s + x, 0) / el.pressures.length : 0.5;
    el.x = a[0]; el.y = a[1];
    el.points = Array.from({ length: n + 1 }, (_, i) => [(b[0] - a[0]) * i / n, (b[1] - a[1]) * i / n]);
    el.pressures = el.points.map(() => pm);
    const bb = R.boite(Object.assign({}, el, { x: 0, y: 0 }));
    el.width = bb.w; el.height = bb.h;
    toucher(el);
    return el;
  }
  /* Un segment reste un TRAIT d'encre — il garde la plume, l'effet et le
     surligneur. Une forme fermée devient une vraie forme, que « Format »
     sait ensuite remplir, tramer ou arrondir. */
  function versForme(f, src) {
    if (f.type === "line") {
      const copie = Object.assign({}, src, { id: nouvelId(), seed: graine(),
        customData: src.customData ? Object.assign({}, src.customData) : null });
      return droite(copie, f.points[0], f.points[1]);
    }
    // la pointe qui remplit donne une forme pleine, de la couleur du trait
    const plein = src.customData && src.customData.pointe === "remplissage";
    const st = { strokeColor: src.strokeColor, strokeWidth: Math.max(1, Math.round(src.strokeWidth * 5) / 2),
                 backgroundColor: plein ? src.strokeColor : "transparent",
                 strokeStyle: "solid", roughness: 0, opacity: src.opacity };
    if (plein) st.fillStyle = "solid";
    if (f.type === "triangle" || f.type === "polygone") {
      const [x0, y0] = f.points[0];
      const pts = f.points.concat([f.points[0]]).map(([x, y]) => [x - x0, y - y0]);
      const el = nouvelElement("line", x0, y0, Object.assign(st, { points: pts, polygon: true, roundness: null,
        lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null }));
      const b = R.boite(Object.assign({}, el, { x: 0, y: 0 }));
      el.width = b.w; el.height = b.h;
      return el;
    }
    return nouvelElement(f.type, f.x, f.y, Object.assign(st, { width: f.width, height: f.height }));
  }
  /* Formes automatiques : à la fin du trait, s'il en est une. Sous 48 px
     d'écran, c'est de l'écriture — un « 0 » ne doit pas devenir une
     ellipse. Le trait brut est déjà dans l'historique : Ctrl Z le rend. */
  function formeAuto(el) {
    const b = R.boite(el);
    if (Math.max(b.w, b.h) * etat.zoom < 48) return;
    const f = S.reconnaitreForme(absolus(el));
    if (!f) return;
    const i = elements.indexOf(el);
    if (i < 0) return;
    elements[i] = versForme(f, el);
    memoriser();
    dire("Forme reconnue : " + NOM_FORME[f.type] + ". Ctrl + Z rend le trait à main levée.");
  }

  /* ── tenir pour redresser ──
     Une pointe qui s'arrête plus d'une demi-seconde transforme le trait :
     en forme nette s'il en est une, en segment sinon — et le segment suit
     encore la pointe, pour l'orienter avant de lâcher. Le tremblement d'une
     main posée n'est pas un mouvement : il faut s'éloigner de 6 px pour
     relancer l'attente. */
  function guetterArret(g, sx, sy) {
    if (g.regle) return;
    if (g.arret && Math.hypot(sx - g.arret.sx, sy - g.arret.sy) <= 6) return;
    g.arret = { sx, sy };
    clearTimeout(g.minuterie);
    g.minuterie = setTimeout(() => redresser(g), 550);
  }
  function redresser(g) {
    if (geste !== g) return;
    const src = g.el, abs = absolus(src), L = S.longueur(abs);
    if (L * etat.zoom < 24) return;
    let f = estSurligneur(src) ? null : S.reconnaitreForme(abs);
    if (!f) {
      // une boucle qu'on ne reconnaît pas reste telle quelle
      const a = abs[0], b = abs[abs.length - 1];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3 * L) return;
      f = { type: "line", points: [a, b] };
    }
    const fait = versForme(f, src);
    elements[elements.indexOf(src)] = fait;
    geste = { mode: "redresse", el: fait, brut: src, ligne: f.type === "line", depart: abs[0], type: g.type };
    // un frémissement sous la pointe — seulement après un vrai geste, sans quoi le navigateur le refuse en criant
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.isActive)) navigator.vibrate(8);
    dire("Redressé : " + NOM_FORME[f.type] + (f.type === "line" ? ", glissez pour l'orienter" : "")
      + ". Ctrl + Z rend le trait d'origine.");
    demander();
  }
  function ajusterRedresse(g, p, e) {
    if (!g.ligne) return;
    let dx = p.x - g.depart[0], dy = p.y - g.depart[1];
    const l = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    // aimanté à l'horizontale, à la verticale et aux diagonales ; Maj : tous les 15°
    const pas = e.shiftKey ? Math.PI / 12 : Math.PI / 4, cran = Math.round(a / pas) * pas;
    if (e.shiftKey || Math.abs(a - cran) < 0.05) { dx = Math.cos(cran) * l; dy = Math.sin(cran) * l; }
    droite(g.el, g.depart, [g.depart[0] + dx, g.depart[1] + dy]);
    demander();
  }

  /* ── la règle ──
     Elle vit à l'ÉCRAN, pas dans la scène : on zoome sous elle sans
     qu'elle grandisse, comme une vraie règle posée sur une feuille. Un
     trait commencé contre un de ses bords le suit ; saisie au milieu, elle
     se déplace ; par un bout, elle tourne — aimantée tous les 15°. */
  function regleEcran() {
    const L = Math.min(820, Math.max(300, toile.clientWidth * 0.8));
    return { x: etat.regle.sx, y: etat.regle.sy, angle: etat.regle.angle, longueur: L, largeur: 76 };
  }
  function regleScene() {
    const E = regleEcran(), c = versScene(E.x, E.y), z = etat.zoom;
    return { x: c.x, y: c.y, angle: E.angle, longueur: E.longueur / z, largeur: E.largeur / z };
  }
  function saisirRegle(e, sx, sy) {
    if (!etat.regle) return false;
    const E = regleEcran();
    if (!S.dansRegle(E, [sx, sy])) return false;
    const encre = OUTILS_DESSIN.includes(etat.outil) && !(e.pointerType === "touch" && etat.styletSeul);
    if (encre && S.bordProche(E, [sx, sy], 26)) return false;      // on trace contre le bord
    const t = (sx - E.x) * Math.cos(E.angle) + (sy - E.y) * Math.sin(E.angle);
    geste = { mode: "regle", tourne: Math.abs(t) > E.longueur / 2 - 70, sx, sy,
              r0: Object.assign({}, etat.regle), a0: Math.atan2(sy - E.y, sx - E.x) };
    return true;
  }
  function bougerRegle(g, sx, sy, e) {
    if (g.tourne) {
      let a = g.r0.angle + Math.atan2(sy - g.r0.sy, sx - g.r0.sx) - g.a0;
      const pas = Math.PI / 12, cran = Math.round(a / pas) * pas;
      if (e.shiftKey || Math.abs(a - cran) < 0.035) a = cran;
      etat.regle.angle = a;
    } else {
      etat.regle.sx = g.r0.sx + sx - g.sx;
      etat.regle.sy = g.r0.sy + sy - g.sy;
    }
    demander();
  }
  function dessinerRegle(dpr) {
    if (!etat.regle) return;
    const E = regleEcran(), L = E.longueur, W = E.largeur;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(E.x, E.y); ctx.rotate(E.angle);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-L / 2, -W / 2, L, W, 10); else ctx.rect(-L / 2, -W / 2, L, W);
    ctx.shadowColor = "rgba(0,0,0,.2)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2;
    ctx.fillStyle = "rgba(248,249,250,.84)"; ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(52,58,64,.4)"; ctx.stroke();
    /* Graduations : tous les 10 px, une moyenne tous les 50, une grande tous
       les 100. Signalé le 9 nov. 2026 : les chiffres n'étaient que sur le bord
       du haut, et une fois la règle tournée ils passaient à l'envers. Ils
       sont maintenant sur les DEUX bords, toujours à l'endroit, et croissent
       de gauche à droite à l'écran : la règle retournée se compte depuis
       l'autre bout, comme on retournerait une vraie règle. */
    const retourne = Math.cos(E.angle) < -1e-9;
    const K = Math.floor((L - 28) / 10);
    ctx.strokeStyle = "rgba(52,58,64,.7)"; ctx.fillStyle = "rgba(52,58,64,.85)";
    ctx.beginPath();
    for (let k = 0; k <= K; k++) {
      const x = -L / 2 + 14 + 10 * k, j = retourne ? K - k : k;
      const h = j % 10 === 0 ? 14 : j % 5 === 0 ? 10 : 6;
      ctx.moveTo(x, -W / 2); ctx.lineTo(x, -W / 2 + h);
      ctx.moveTo(x, W / 2); ctx.lineTo(x, W / 2 - h);
    }
    ctx.stroke();
    ctx.font = "600 10px " + SANS; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const aLEndroit = (texte, x, y) => {
      ctx.save(); ctx.translate(x, y); if (retourne) ctx.rotate(Math.PI);
      ctx.fillText(texte, 0, 0); ctx.restore();
    };
    for (let k = 0; k <= K; k++) {
      const j = retourne ? K - k : k;
      if (j % 10 !== 0 || !j) continue;
      const x = -L / 2 + 14 + 10 * k;
      aLEndroit(String(j / 10), x, -W / 2 + 22);
      aLEndroit(String(j / 10), x, W / 2 - 22);
    }
    // les deux poignées de rotation, et l'angle au centre
    ctx.lineWidth = 1.4;
    [-1, 1].forEach((s) => {
      const cx = s * (L / 2 - 34);
      ctx.beginPath(); ctx.arc(cx, 6, 8, -Math.PI * 0.85, Math.PI * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 4.5, 12.5); ctx.lineTo(cx - 1, 12.6); ctx.lineTo(cx - 3, 9.5); ctx.stroke();
    });
    const deg = ((Math.round(-E.angle * 180 / Math.PI) % 360) + 360) % 360;
    ctx.font = "600 13px " + SANS; ctx.textBaseline = "middle";
    aLEndroit(deg + "°", 0, retourne ? -8 : 8);
    // le bord contre lequel on trace s'allume
    if (geste && geste.mode === "dessin" && geste.regle) {
      const b = geste.regle.bord;
      const s = b.nx * -Math.sin(E.angle) + b.ny * Math.cos(E.angle) > 0 ? 1 : -1;
      ctx.strokeStyle = BLEU_SEL; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-L / 2 + 6, s * W / 2); ctx.lineTo(L / 2 - 6, s * W / 2); ctx.stroke();
    }
    ctx.restore();
  }
  function basculerRegle() {
    etat.regle = etat.regle ? null
      : { sx: toile.clientWidth / 2, sy: toile.clientHeight * 0.55, angle: 0 };
    majBascules();
    dire(etat.regle ? "Règle posée : tracez contre un bord. Glissez-la par le milieu, tournez-la par un bout ou à la molette."
      : "Règle rangée.");
    demander();
  }
  function basculerFormes() {
    etat.formes = !etat.formes;
    majBascules(); garder();
    dire(etat.formes ? "Formes automatiques : un cercle, un carré, un triangle ou un trait tracés à main levée deviennent nets."
      : "Formes automatiques coupées. Garder la pointe immobile en fin de trait redresse toujours.");
  }
  function majBascules() {
    $('[data-bascule="formes"]').setAttribute("aria-pressed", String(etat.formes));
    $('[data-bascule="regle"]').setAttribute("aria-pressed", String(!!etat.regle));
  }

  /* ── le lasso ──
     Une boucle à main levée ; est pris ce dont la plus grande part est
     dedans. La sélection faite, l'outil reste en main : on saisit ce
     qu'on a pris pour le déplacer, ou on entoure autre chose. */
  function debutLasso(e, p) {
    // un polygone en cours : chaque appui pose un coin, ou le ferme
    if (geste && geste.mode === "lasso" && geste.forme === "polygone") {
      const g = geste, tol = 12 / etat.zoom, [x0, y0] = g.pts[0], der = g.pts[g.pts.length - 1];
      const maintenant = performance.now();
      const surPremier = g.pts.length > 2 && Math.hypot(p.x - x0, p.y - y0) <= tol;
      const double = g.pts.length > 2 && maintenant - (g.dernierAppui || 0) < 350 && Math.hypot(p.x - der[0], p.y - der[1]) <= tol;
      g.dernierAppui = maintenant;
      if (surPremier || double) { geste = null; finLasso(g); return; }
      g.pts.push([p.x, p.y]); g.survol = null; demander();
      return;
    }
    const sel = selectionnes();
    if (sel.length) {
      if (poigneeSous(p.x, p.y) || surPoigneeTourner(p.x, p.y)) return debutSelection(e, p);
      const b = boiteDe(sel), m = 8 / etat.zoom;
      if (p.x >= b.x - m && p.x <= b.x + b.w + m && p.y >= b.y - m && p.y <= b.y + b.h + m) {
        geste = { mode: "deplacer", x0: p.x, y0: p.y, bouge: false,
                  origines: sel.filter((x) => !x.locked).map((x) => ({ el: x, x: x.x, y: x.y })) };
        return;
      }
    }
    if (!e.shiftKey) selection.clear();
    const forme = etat.lassoForme || "libre";
    geste = { mode: "lasso", forme, x0: p.x, y0: p.y, pts: [[p.x, p.y]], avant: new Set(selection),
              dernierAppui: performance.now() };
    if (forme === "polygone") dire("Un appui par coin, puis retouchez le premier.");
    majPanneau(); demander();
  }
  // la boucle d'un rectangle ou d'une ellipse, tirée du point de départ au doigt
  function boucleForme(g, p) {
    const x0 = Math.min(g.x0, p.x), x1 = Math.max(g.x0, p.x), y0 = Math.min(g.y0, p.y), y1 = Math.max(g.y0, p.y);
    if (g.forme === "rectangle") return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, out = [];
    for (let k = 0; k < 48; k++) out.push([cx + rx * Math.cos(k * Math.PI / 24), cy + ry * Math.sin(k * Math.PI / 24)]);
    return out;
  }
  /* Ce que le lasso regarde d'un élément, là où on le voit (voir « jalons »
     dans stylet.js) : la longueur d'un trait, la surface d'une forme. */
  function echantillon(el) {
    const b = R.boite(el);
    let pts;
    if (el.points && el.points.length) {
      const P = el.points.map(([x, y]) => [el.x + x, el.y + y]);
      pts = S.jalons(P, 48);
      // une forme remplie au stylo se juge à sa surface, pas à son contour
      if (el.type === "freedraw" && el.customData && el.customData.pointe === "remplissage" && P.length > 2) {
        const surface = S.grille(b, 9, (q) => S.dansPolygone(q, P));
        if (surface.length >= 4) pts = surface;
      }
    } else {
      const rx = b.w / 2, ry = b.h / 2, cx = b.x + rx, cy = b.y + ry;
      const garder = el.type === "ellipse" && rx && ry
        ? ([x, y]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
        : el.type === "diamond" && rx && ry
          ? ([x, y]) => Math.abs(x - cx) / rx + Math.abs(y - cy) / ry <= 1
          : null;
      pts = S.grille(b, 7, garder);
      if (!pts.length) pts = [[cx, cy]];
    }
    return S.tourner(pts, b, el.angle || 0);
  }
  function finLasso(g) {
    selection = new Set(g.avant);
    let coupes = 0;
    if (g.pts.length > 2) {
      if (etat.lassoMode === "partie") {
        const r = couperAuLasso(g.pts);
        r.pris.forEach((id) => selection.add(id));
        coupes = r.coupes;
      } else {
        elements.forEach((el) => { if (!estLie(el) && S.pris(echantillon(el), g.pts)) selection.add(el.id); });
      }
    }
    if (coupes) memoriser();
    const n = selection.size;
    dire(n ? n + " élément" + (n > 1 ? "s pris" : " pris") + " au lasso"
      + (coupes ? ", dont " + coupes + " découpé" + (coupes > 1 ? "s" : "") + " au bord. Ctrl + Z pour revenir." : ".")
      : "Rien d'entouré.");
    majPanneau(); demander();
  }

  /* ── le lasso qui découpe ──
     Ce qui est DANS la boucle est pris, ce qui est dehors reste où il était.
     Un trait est coupé au bord (ses morceaux gardent son dessin, comme pour
     la gomme). Une image est coupée en deux : l'intérieur devient une image
     à part, posée exactement à sa place et sélectionnée ; l'originale garde
     le reste, avec un trou transparent. Formes et textes ne se coupent pas :
     ils sont pris entiers, à la règle habituelle. */
  function couperAuLasso(poly) {
    const pris = new Set();
    let coupes = 0;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (estLie(el)) continue;
      const bb = R.boite(el);
      // la boucle dans le repère de l'élément (rotation défaite)
      const loc = () => poly.map((q) => { const r = versRepere(el, bb, q); return [r[0] - el.x, r[1] - el.y]; });
      if (el.type === "freedraw" && !el.locked && !(el.customData && el.customData.pointe === "remplissage")) {
        const t = R.trace(el), m = S.decouperPolygone(t.L, t.P, loc());
        if (!m.some((x) => x.dedans)) continue;
        if (m.every((x) => x.dedans)) { pris.add(el.id); continue; }
        const nouveaux = m.filter((x) => x.points.length > 1).map((x) => {
          const n = morceau(el, bb, x);
          if (x.dedans) pris.add(n.id);
          return n;
        });
        elements.splice(i, 1, ...nouveaux);
        selection.delete(el.id);
        coupes++;
        continue;
      }
      /* Une forme remplie au seau se coupe en SURFACES (signalé le 9 nov. :
         le lasso la prenait entière ou pas du tout). Le contour peint est
         découpé par la boucle ; si la découpe ne se vérifie pas (une forme
         qui se croise elle-même), on garde l'ancienne règle. */
      if (el.type === "freedraw" && !el.locked && el.customData && el.customData.pointe === "remplissage"
          && el.points && el.points.length > 2) {
        const r = S.couperSurfaceLibre(R.contourRemplissage(el), loc());
        if (r && r.dedans.length && r.dehors.length) {
          const piece = (P) => {
            const n = morceau(el, bb, { points: P, pressions: P.map(() => 0.5) });
            n.customData = Object.assign({}, n.customData, { net: true });
            return n;
          };
          const dedans = r.dedans.map(piece), dehors = r.dehors.map(piece);
          dedans.forEach((n) => pris.add(n.id));
          elements.splice(i, 1, ...dehors, ...dedans);
          selection.delete(el.id);
          coupes++;
          continue;
        }
        if (r && r.dedans.length) { pris.add(el.id); continue; }
        if (r) continue;
        if (S.pris(echantillon(el), poly)) pris.add(el.id);
        continue;
      }
      if (el.type === "image" && !el.locked) {
        const r = couperImage(el, bb, loc());
        if (r === "entier") pris.add(el.id);
        else if (r) { elements.splice(i + 1, 0, r); pris.add(r.id); coupes++; }
        continue;
      }
      if (S.pris(echantillon(el), poly)) pris.add(el.id);
    }
    return { pris, coupes };
  }
  /* Rend la nouvelle image (l'intérieur), « entier » si la boucle prend
     toute l'image, ou rien si elle n'en prend rien. */
  function couperImage(el, bb, loc) {
    const img = imageDe(el.fileId);
    if (!img || !img.complete || !img.naturalWidth || !el.width || !el.height) return null;
    const W = el.width, H = el.height, s = Array.isArray(el.scale) ? el.scale : [1, 1];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    loc.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    const chemin = (c, f) => { c.beginPath(); loc.forEach((q, k) => { const [x, y] = f ? f(q) : q; k ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };
    // la résolution de l'image : ses pixels, ou le double de l'écran pour un dessin vectoriel
    const vect = /svg/.test((fichiers[el.fileId] || {}).mimeType || "");
    const NW = vect ? Math.min(2048, Math.ceil(W * 2)) : img.naturalWidth;
    const NH = vect ? Math.min(2048, Math.ceil(H * 2)) : img.naturalHeight;
    const kx = NW / W, ky = NH / H;
    // 1. ce qui reste : l'image entière, moins la boucle (dans son sens à elle, miroir compris)
    const reste = document.createElement("canvas");
    reste.width = NW; reste.height = NH;
    const cr = reste.getContext("2d");
    cr.drawImage(img, 0, 0, NW, NH);
    cr.setTransform(kx, 0, 0, ky, 0, 0);
    cr.globalCompositeOperation = "destination-out";
    chemin(cr, ([x, y]) => [s[0] < 0 ? W - x : x, s[1] < 0 ? H - y : y]);
    cr.fill();
    if (toileVide(reste)) return "entier";
    // 2. l'intérieur, recadré sur la boucle, dans le sens où on le voit
    const pw = Math.max(1, Math.round((x1 - x0) * kx)), ph = Math.max(1, Math.round((y1 - y0) * ky));
    const dedans = document.createElement("canvas");
    dedans.width = pw; dedans.height = ph;
    const cd = dedans.getContext("2d");
    cd.setTransform(kx, 0, 0, ky, -x0 * kx, -y0 * ky);
    chemin(cd);
    cd.clip();
    if (s[0] < 0 || s[1] < 0) { cd.translate(s[0] < 0 ? W : 0, s[1] < 0 ? H : 0); cd.scale(s[0] < 0 ? -1 : 1, s[1] < 0 ? -1 : 1); }
    cd.drawImage(img, 0, 0, W, H);
    if (toileVide(dedans)) return null;
    // l'originale garde le reste ; la nouvelle se pose exactement où on la voyait
    el.fileId = enFichierToile(reste);
    toucher(el);
    const n = Object.assign({}, el, { id: nouvelId(), seed: graine(), x: el.x + x0, y: el.y + y0,
      width: x1 - x0, height: y1 - y0, scale: [1, 1], crop: null, fileId: enFichierToile(dedans),
      boundElements: null, groupIds: [] });
    if (el.angle) {
      const [cx, cy] = milieuBoite(bb), mx = n.x + n.width / 2, my = n.y + n.height / 2;
      const co = Math.cos(el.angle), si = Math.sin(el.angle), dx = mx - cx, dy = my - cy;
      n.x += dx * co - dy * si - dx;
      n.y += dx * si + dy * co - dy;
    }
    toucher(n);
    return n;
  }

  /* ── la gomme ──
     Deux manières : le trait ENTIER (fantôme, puis effacé au relâchement)
     ou une PARTIE du trait : l'encre sous le cercle disparaît, et le
     trait se coupe en morceaux.

     Un morceau garde le DESSIN du trait d'origine : sa ligne déjà lissée
     et ses pressions déjà calculées (« lisse »), le même repère (donc le
     même grain de crayon), le même dégradé, la même rotation. Avant le
     9 nov. 2026, chaque morceau redevenait un trait neuf : lissé de
     nouveau, pression simulée repartie de zéro, grain et dégradé recalés
     sur lui, rotation autour d'un autre centre. Signalé : l'encre restante
     bougeait sous la gomme, les courbes serrées s'élargissaient, et elle
     prenait plus que son cercle. Mesuré sur 48 traits d'essai : jusqu'à
     36 px pris hors d'un cercle de 10, l'encre restante déplacée de
     1,2 px ; après, 0,08 px au plus, et ce qui part hors du cercle ne
     dépasse plus la largeur du trait lui-même (un trait ne se coupe pas
     sur la moitié de son épaisseur). */
  function debutGomme(p) {
    geste = { mode: "gomme", partie: etat.gommeMode === "partie", avant: JSON.stringify(elements),
              traces: new Map(), toiles: new Map() };
    fantomes = new Set();
    effacer(geste, p, p);
  }
  function effacer(g, a, b) { if (g.partie) gommerPartie(g, a, b); else gommer(a, b); }
  // le centre de la boîte : c'est autour de lui qu'un élément tourne
  const milieuBoite = (b) => [b.x + b.w / 2, b.y + b.h / 2];
  // un point de la scène, ramené dans le repère d'un élément tourné
  function versRepere(el, b, q) {
    if (!el.angle) return q;
    const [cx, cy] = milieuBoite(b), co = Math.cos(-el.angle), si = Math.sin(-el.angle);
    const dx = q[0] - cx, dy = q[1] - cy;
    return [cx + dx * co - dy * si, cy + dx * si + dy * co];
  }
  function morceau(el, b, m) {
    const cd = Object.assign({}, el.customData || {}, { lisse: true });
    if (cd.effet && EFFETS[cd.effet] && !cd.diag) cd.diag = diagonale(el);
    // même x, y que le trait d'origine : les points restent où ils étaient
    const n = Object.assign({}, el, { id: nouvelId(), seed: graine(),
      points: m.points, pressures: m.pressions, simulatePressure: false, customData: cd });
    const nb = R.boite(n);
    n.width = nb.w; n.height = nb.h;
    // Tourné, un morceau tournerait autour de SON centre et non de celui du
    // trait : on le décale de (rotation − identité)(c′ − c), ce qui le pose
    // exactement où il était peint.
    if (el.angle) {
      const [cx, cy] = milieuBoite(b), [mx, my] = milieuBoite(nb);
      const co = Math.cos(el.angle), si = Math.sin(el.angle), dx = mx - cx, dy = my - cy;
      n.x += dx * co - dy * si - dx;
      n.y += dx * si + dy * co - dy;
    }
    toucher(n);
    return n;
  }
  /* Une forme de l'outil Formes (rectangle, ellipse, losange) devient, au
     premier coup de gomme partielle, ce qu'elle est à l'écran : un fond (une
     surface remplie) et un contour (un trait de même épaisseur), qui se
     coupent ensuite comme le reste. Signalé le 9 nov. 2026 : la gomme ne
     touchait pas les rectangles. Restent entiers : les post-its et les
     formes qui portent un texte, les fonds hachurés et les contours en
     tirets, qui n'ont pas d'équivalent en trait libre. */
  function contourForme(el) {
    const w = el.width || 0, h = el.height || 0;
    if (el.type === "ellipse") {
      const out = [];
      for (let k = 0; k < 64; k++) { const t = k * Math.PI / 32; out.push([w / 2 + (w / 2) * Math.cos(t), h / 2 + (h / 2) * Math.sin(t)]); }
      return out;
    }
    if (el.type === "diamond") return [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
    const ra = R.rayonAngle(el, Math.min(w, h));
    if (!ra) return [[0, 0], [w, 0], [w, h], [0, h]];
    const out = [];
    [[w - ra, ra, -Math.PI / 2], [w - ra, h - ra, 0], [ra, h - ra, Math.PI / 2], [ra, ra, Math.PI]].forEach(([cx, cy, t0]) => {
      for (let k = 0; k <= 6; k++) { const t = t0 + k * Math.PI / 12; out.push([cx + ra * Math.cos(t), cy + ra * Math.sin(t)]); }
    });
    return out;
  }
  function densifier(P, pas) {
    const Q = P.concat([P[0]]), out = [];
    for (let i = 0; i + 1 < Q.length; i++) {
      const u = Q[i], v = Q[i + 1], n = Math.max(1, Math.ceil(Math.hypot(v[0] - u[0], v[1] - u[1]) / pas));
      for (let k = 0; k < n; k++) out.push([u[0] + (v[0] - u[0]) * k / n, u[1] + (v[1] - u[1]) * k / n]);
    }
    out.push([Q[Q.length - 1][0], Q[Q.length - 1][1]]);
    return out;
  }
  function formeEnLibre(el) {
    if (!/^(rectangle|ellipse|diamond)$/.test(el.type) || el.locked || estPostit(el)) return null;
    if ((el.boundElements || []).some((x) => x.type === "text")) return null;
    const plein = el.backgroundColor && el.backgroundColor !== "transparent";
    if (plein && el.fillStyle && el.fillStyle !== "solid") return null;
    const trait = el.strokeColor && el.strokeColor !== "transparent" && (el.strokeWidth || 0) > 0;
    if (trait && el.strokeStyle && el.strokeStyle !== "solid") return null;
    if (!plein && !trait) return null;
    const C = contourForme(el), out = [];
    const libre = (points, extra) => {
      const n = Object.assign({}, el, { id: nouvelId(), seed: graine(), type: "freedraw", points,
        simulatePressure: false, lastCommittedPoint: null, backgroundColor: "transparent", roundness: null,
        boundElements: null }, extra);
      const bb = R.boite(n); n.width = bb.w; n.height = bb.h;
      toucher(n);
      return n;
    };
    if (plein) out.push(libre(C, { strokeColor: el.backgroundColor, pressures: C.map(() => 0.5),
                                   customData: { pointe: "remplissage", net: true } }));
    if (trait) {
      // la même épaisseur qu'à l'écran : demi-largeur = base × (0,4 + 0,9 p)
      const sw = el.strokeWidth || 1, ep = Math.max(0.6, sw * 0.31), base = ep * 1.9;
      const p = Math.max(0, Math.min(1, (sw / 2 / base - 0.4) / 0.9));
      const D = densifier(C, 4);
      out.push(libre(D, { strokeWidth: ep, pressures: D.map(() => p), customData: { lisse: true } }));
    }
    return out;
  }
  function gommerPartie(g, a, b) {
    const r = etat.gommeTaille / etat.zoom;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (r * 0.5)));
    for (let k = 0; k <= n; k++) {
      const c = [a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n];
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (/^(rectangle|ellipse|diamond)$/.test(el.type) && !el.locked) {
          if (!R.touche(el, c[0], c[1], r)) continue;
          const libres = formeEnLibre(el);
          if (!libres) continue;
          elements.splice(i, 1, ...libres);
          selection.delete(el.id);
          g.coupes = g.encre = true;
          i += libres.length;              // ses deux morceaux passent sous la gomme dès ce pas
          continue;
        }
        if (el.type !== "freedraw" || el.locked) continue;
        /* Une surface remplie n'est pas un trait : la gomme y découpe un
           ROND, par la même découpe de surface que le lasso (signalé le
           9 nov. : elle ne l'effaçait pas). Au milieu, il reste un trou. */
        if (el.customData && el.customData.pointe === "remplissage") {
          if (el.locked || !el.points || el.points.length < 3) continue;
          const bs = R.boite(el), qs = versRepere(el, bs, c);
          if (qs[0] < bs.x - r || qs[0] > bs.x + bs.w + r || qs[1] < bs.y - r || qs[1] > bs.y + bs.h + r) continue;
          const rond = [];
          for (let k2 = 0; k2 < 24; k2++) {
            const a2 = k2 * Math.PI / 12;
            rond.push([qs[0] - el.x + r * Math.cos(a2), qs[1] - el.y + r * Math.sin(a2)]);
          }
          const res = S.couperSurfaceLibre(R.contourRemplissage(el), rond, 20);
          if (!res || !res.dedans.length) continue;
          const restes = res.dehors.map((P) => {
            const n = morceau(el, bs, { points: P, pressions: P.map(() => 0.5) });
            n.customData = Object.assign({}, n.customData, { net: true });
            return n;
          });
          elements.splice(i, 1, ...restes);
          selection.delete(el.id);
          g.coupes = g.encre = true;
          continue;
        }
        const bb = R.boite(el), q = versRepere(el, bb, c);
        // aucune pointe ne dépasse 2,5 × 1,9 × l'épaisseur de demi-largeur
        const marge = r + 4.75 * Math.max(0.6, el.strokeWidth || 1) + 1;
        if (q[0] < bb.x - marge || q[0] > bb.x + bb.w + marge || q[1] < bb.y - marge || q[1] > bb.y + bb.h + marge) continue;
        let t = g.traces.get(el.id);
        if (!t) { t = R.trace(el); g.traces.set(el.id, t); }
        const morceaux = S.gommer(t.L, t.P, t.R, [q[0] - el.x, q[1] - el.y], r);
        if (!morceaux) continue;
        elements.splice(i, 1, ...morceaux.map((m) => morceau(el, bb, m)));
        selection.delete(el.id);
        g.coupes = g.encre = true;
      }
    }
    gommerImages(g, a, b, r);
    traineeGomme.push({ x: b.x, y: b.y, t: performance.now() });
    demander();
  }

  /* La gomme efface aussi dans les IMAGES (signalé le 9 nov. 2026 : elle
     ne prenait que les traits). Les pixels sous le cercle deviennent
     transparents. Pendant le geste, on gomme une COPIE de l'image, une
     toile à sa résolution, qu'on montre à sa place ; au relâchement, la
     copie devient un nouveau fichier (le chemin de la baguette magique),
     et Ctrl + Z rend l'ancien. Échap avant de lâcher : rien n'a changé.
     Une image vectorielle (les icônes réseau) est posée en pixels, au
     double de sa taille à l'écran. */
  function toileGommee(g, el) {
    let t = g.toiles.get(el.id);
    if (t) return t;
    const img = imageDe(el.fileId);
    if (!img || !img.complete || !img.naturalWidth || !el.width || !el.height) return null;
    const vect = /svg/.test((fichiers[el.fileId] || {}).mimeType || "");
    const w = vect ? Math.min(2048, Math.ceil(el.width * 2)) : img.naturalWidth;
    const h = vect ? Math.min(2048, Math.ceil(el.height * 2)) : img.naturalHeight;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const c = cv.getContext("2d");
    c.drawImage(img, 0, 0, w, h);
    c.globalCompositeOperation = "destination-out";
    c.lineCap = "round"; c.lineJoin = "round";
    // on gomme dans le repère de l'élément : une image étirée reçoit une
    // gomme étirée d'autant, qui reste ronde à l'écran
    c.setTransform(w / el.width, 0, 0, h / el.height, 0, 0);
    t = { cv, c, el };
    g.toiles.set(el.id, t);
    return t;
  }
  function gommerImages(g, a, b, r) {
    for (const el of elements) {
      if (el.type !== "image" || el.locked) continue;
      const bb = R.boite(el), s = Array.isArray(el.scale) ? el.scale : [1, 1];
      // un point de la scène, dans l'image : rotation défaite, miroir compris
      const local = (p) => {
        const q = versRepere(el, bb, [p.x, p.y]);
        const x = q[0] - el.x, y = q[1] - el.y;
        return [s[0] < 0 ? el.width - x : x, s[1] < 0 ? el.height - y : y];
      };
      const pa = local(a), pb = local(b);
      if (Math.max(pa[0], pb[0]) < -r || Math.min(pa[0], pb[0]) > el.width + r
          || Math.max(pa[1], pb[1]) < -r || Math.min(pa[1], pb[1]) > el.height + r) continue;
      const t = toileGommee(g, el);
      if (!t) continue;
      t.c.lineWidth = 2 * r;
      t.c.beginPath(); t.c.moveTo(pa[0], pa[1]); t.c.lineTo(pb[0] + 0.001, pb[1]); t.c.stroke();
      g.coupes = true;
    }
  }
  // une image dont il ne reste rien : on la retire plutôt que garder un cadre vide
  function toileVide(cv) {
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
    return true;
  }

  /* ── pointeur posé ── */
  toile.addEventListener("pointerdown", (e) => {
    /* Le geste appartient au tableau : pas de sélection de texte de la
       page, et surtout pas le focus que le navigateur donnerait au
       relâchement — il fermerait aussitôt la zone de frappe qu'un clic de
       l'outil Texte vient d'ouvrir. */
    e.preventDefault();
    if (!accueillir(e)) return;
    if (!lecture.hidden) fermerLecture();
    scene.focus({ preventScroll: true });
    if (edition) { finirEdition(); if (etat.outil === "texte") return; }
    toile.setPointerCapture(e.pointerId);
    const { sx, sy } = posPointeur(e);
    pointeurs.set(e.pointerId, { sx, sy, type: e.pointerType });
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
    if (e.button === 0 && saisirRegle(e, sx, sy)) return;
    // le bout gomme d'un stylet efface, quel que soit l'outil en main
    if (e.pointerType === "pen" && (e.buttons & 32)) { debutGomme(p); return; }
    // un stylet a été vu : sur les outils d'encre, le doigt fait défiler
    const doigt = e.pointerType === "touch" && etat.styletSeul && OUTILS_ENCRE.includes(etat.outil);
    if (e.button === 1 || e.button === 2 || espace || etat.outil === "main" || doigt) {
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
    if (o === "gomme") { debutGomme(p); return; }
    if (o === "lasso") return debutLasso(e, p);
    if (o === "baguette") return clicBaguette(e, p);
    if (o === "lien") return debutLien(e, p);
    if (o === "laser") {
      geste = { mode: "laser" };
      laser.push({ x: p.x, y: p.y, t: performance.now(), coupure: true });
      demander();
    }
  });

  function debutSelection(e, p) {
    if (surPoigneeTourner(p.x, p.y)) {
      const sel = selectionnes();
      geste = { mode: "tourner", c: centreDe(sel), a0: 0, deg: 0, p,
                origines: sel.map((el) => JSON.parse(JSON.stringify(el))) };
      geste.a0 = Math.atan2(p.y - geste.c.y, p.x - geste.c.x);
      majCurseur("grabbing");
      demander();
      return;
    }
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
      const groupe = groupeDe(el);
      if (e.shiftKey) {
        if (selection.has(el.id)) groupe.forEach((id) => selection.delete(id));
        else groupe.forEach((id) => selection.add(id));
      } else if (!selection.has(el.id)) {
        selection = new Set(groupe);
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
       qu'il faut la simuler par la vitesse. */
    const simuler = !(e.pointerType === "pen" && e.pressure && e.pressure !== 0.5);
    // posé contre un bord de la règle, le trait le suivra jusqu'au bout
    let regle = null;
    if (etat.regle) {
      const bord = S.bordProche(regleScene(), [p.x, p.y], 26 / etat.zoom);
      if (bord) {
        regle = { bord, ecart: (surl ? etat.courant.surligneurW : etat.stylos[etat.stylo].w) * 1.7 };
        const j = S.projeter(bord, [p.x, p.y], regle.ecart);
        p = { x: j[0], y: j[1] };
      }
    }
    const el = nouvelElement("freedraw", p.x, p.y, {
      points: [[0, 0]], pressures: [simuler ? 0.5 : pressionDe(e, { simulatePressure: false })], simulatePressure: simuler,
      lastCommittedPoint: null, backgroundColor: "transparent", roundness: null,
    });
    if (surl) {
      Object.assign(el, { strokeColor: etat.courant.surligneur, strokeWidth: etat.courant.surligneurW, opacity: 60,
                          customData: { surligneur: true } });
      el.simulatePressure = true;
    } else {
      const st = etat.stylos[etat.stylo];
      Object.assign(el, { strokeColor: st.c, strokeWidth: st.w, opacity: 100 });
      const cd = {};
      if (st.effet && !MATIERES[st.pointe]) cd.effet = st.effet;
      if (st.pointe) cd.pointe = st.pointe;
      if (cd.effet || cd.pointe) el.customData = cd;
    }
    elements.push(el);
    geste = { mode: "dessin", el, regle };
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
    if (ignores.has(e.pointerId)) return;
    const { sx, sy } = posPointeur(e);
    if (pointeurs.has(e.pointerId)) pointeurs.set(e.pointerId, { sx, sy, type: e.pointerType });
    const p = versScene(sx, sy);
    dernierePos = p;
    if (!geste) {
      survol(p);
      if (etat.outil === "gomme" && etat.gommeMode === "partie") demander();
      return;
    }
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
    if (g.mode === "regle") return bougerRegle(g, sx, sy, e);
    if (g.mode === "lasso") {
      if (g.forme === "rectangle" || g.forme === "ellipse") g.pts = boucleForme(g, p);
      else if (g.forme === "polygone") g.survol = [p.x, p.y];
      else g.pts.push([p.x, p.y]);
      demander(); return;
    }
    if (g.mode === "redresse") return ajusterRedresse(g, p, e);
    if (g.mode === "creer") return tracerForme(g, p, e);
    if (g.mode === "ligne") return tracerLigne(g.el, 1, p, e);
    if (g.mode === "bout") return tracerLigne(g.el, g.i, p, e);
    if (g.mode === "redim") return redimensionner(g, p, e);
    if (g.mode === "tourner") return tournerGeste(g, p, e);
    if (g.mode === "dessin") {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach((ev) => {
        let q = versScene(posPointeur(ev).sx, posPointeur(ev).sy);
        if (g.regle) { const j = S.projeter(g.regle.bord, [q.x, q.y], g.regle.ecart); q = { x: j[0], y: j[1] }; }
        const el = g.el, der = el.points[el.points.length - 1];
        const px = q.x - el.x, py = q.y - el.y;
        if (Math.hypot(px - der[0], py - der[1]) * etat.zoom < 1) return;
        el.points.push([px, py]);
        el.pressures.push(pressionDe(ev, el));
      });
      const b = R.boite(g.el);
      g.el.width = b.w; g.el.height = b.h;
      guetterArret(g, sx, sy);
      demander();
      return;
    }
    if (g.mode === "gomme") {
      effacer(g, g.dernier || p, p);
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
    if (surPoigneeTourner(p.x, p.y)) return majCurseur("grab");
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
     de 15°. Le point 0 reste l'origine de l'élément. */
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
    const texteSeul = g.origines.every((o) => o.type === "text" || o.type === "image");
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
     Ce que la gomme touche passe en fantôme (20 %),
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
    if (ignores.delete(e.pointerId)) return;
    if (e.pointerId === penBas) penBas = null;
    pointeurs.delete(e.pointerId);
    if (!geste) return;
    const g = geste;
    clearTimeout(g.minuterie);
    if (g.mode === "pince") { if (pointeurs.size < 2) { geste = null; garder(); } return; }
    if (g.mode === "lasso" && g.forme === "polygone") { demander(); return; }
    geste = null;
    if (g.mode === "pan") { garder(); majCurseur(); return; }
    if (g.mode === "deplacer") { if (g.bouge) memoriser(); majPanneau(); demander(); return; }
    if (g.mode === "cadre") { majPanneau(); demander(); return; }
    if (g.mode === "redim" || g.mode === "bout") { memoriser(); majPanneau(); demander(); return; }
    if (g.mode === "tourner") { if (g.deg) memoriser(); majCurseur(); majPanneau(); demander(); return; }
    if (g.mode === "regle") { demander(); return; }
    if (g.mode === "lasso") return finLasso(g);
    if (g.mode === "redresse") {
      // deux pas d'historique : le trait d'origine, puis la forme — Ctrl Z rend le premier
      const i = elements.indexOf(g.el);
      if (i >= 0) { elements[i] = g.brut; memoriser(); elements[i] = g.el; }
      toucher(g.el); memoriser(); demander();
      return;
    }
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
      if (etat.formes && !g.regle && !estSurligneur(g.el)) formeAuto(g.el);
      demander();
      return;
    }
    if (g.mode === "gomme") {
      if (g.partie) {
        // les images gommées deviennent de nouveaux fichiers ; vides, elles partent
        const vides = [];
        g.toiles.forEach((t) => {
          if (toileVide(t.cv)) { vides.push(t.el.id); return; }
          t.el.fileId = enFichierToile(t.cv);
          toucher(t.el);
        });
        if (vides.length) retirer(vides);
        if (g.coupes) {
          memoriser();
          const ou = g.toiles.size ? (g.encre ? "Effacé dans l'image et dans l'encre" : "Effacé dans l'image")
            : "Encre effacée";
          dire(ou
            + (vides.length ? " ; image entièrement effacée, retirée" : "") + ". Ctrl + Z pour revenir.");
        }
        demander();
        return;
      }
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
  toile.addEventListener("pointercancel", (e) => {
    if (ignores.delete(e.pointerId)) return;
    if (e.pointerId === penBas) penBas = null;
    annulerGeste(); pointeurs.delete(e.pointerId);
  });
  // le type du pointeur qui a commencé le geste : c'est lui que la paume écarte
  toile.addEventListener("pointerdown", (e) => { if (geste && !geste.type) geste.type = e.pointerType; });
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
    if (g.mode === "gomme" && g.partie && g.coupes) elements = JSON.parse(g.avant);
    if (g.mode === "redresse") retirer([g.el.id]);
    if (g.mode === "regle") etat.regle = g.r0;
    if (g.mode === "deplacer") g.origines.forEach((o) => { o.el.x = o.x; o.el.y = o.y; });
    if ((g.mode === "redim" || g.mode === "bout" || g.mode === "tourner") && pile[curseurPile])
      elements = JSON.parse(pile[curseurPile]);
    replacerLies();
    demander();
  }

  /* ── la molette : défiler, et zoomer avec Ctrl (ou le pincement d'un
     pavé tactile, que le navigateur transmet avec Ctrl) ── */
  toile.addEventListener("wheel", (e) => {
    e.preventDefault();
    const { sx, sy } = posPointeur(e);
    if (etat.regle && !e.ctrlKey && !e.metaKey && S.dansRegle(regleEcran(), [sx, sy])) {
      etat.regle.angle += Math.sign(e.deltaY || e.deltaX) * (e.shiftKey ? Math.PI / 12 : Math.PI / 180);
      demander();
      return;
    }
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
    // le contour d'un gabarit (un parallélogramme, un document) : on écrit
    // le texte de son groupe — celui du cadre invisible, ou le texte libre
    if (el && el.groupIds && el.groupIds.length) {
      const voisins = groupeDe(el).map(parId).filter(Boolean);
      const cadre = voisins.find((x) => conteneur(x) && texteDe(x));
      if (cadre) return editerLie(cadre);
      const libreDuGroupe = voisins.find((x) => x.type === "text" && !x.containerId);
      if (libreDuGroupe) return ouvrirEdition(libreDuGroupe);
    }
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
    // supprimer un équipement emporte les liens qui y sont accrochés
    elements.forEach((l) => {
      if (estLien(l) && ((l.startBinding && tout.has(l.startBinding.elementId))
                     || (l.endBinding && tout.has(l.endBinding.elementId)))) tout.add(l.id);
    });
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
    // une copie d'icône et de son nom forme un groupe à elle : garder
    // l'identifiant de groupe ferait sélectionner l'original avec la copie
    const groupes = new Map();
    return sources.map((e) => {
      const c = JSON.parse(JSON.stringify(e));
      c.id = map.get(e.id);
      c.groupIds = (c.groupIds || []).map((g) => {
        if (!groupes.has(g)) groupes.set(g, nouvelId());
        return groupes.get(g);
      });
      c.x += dx; c.y += dy;
      c.seed = graine(); c.version = 1; c.versionNonce = graine(); c.updated = Date.now();
      if (c.containerId) c.containerId = map.get(c.containerId) || null;
      // copiés ensemble, des équipements et leur lien : le lien suit les copies
      for (const k of ["startBinding", "endBinding"]) {
        if (c[k] && map.has(c[k].elementId)) c[k] = Object.assign({}, c[k], { elementId: map.get(c[k].elementId) });
      }
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
    /* Le format de presse-papiers partagé : ce qu'on copie ici se colle
       dans les éditeurs qui le lisent, et l'inverse. */
    const texte = JSON.stringify({ type: "excalidraw/clipboard", elements: liste, files: fichiersDe(liste) });
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
    // une capture d'écran collée devient une image, là où est la souris
    const img = e.clipboardData && Array.from(e.clipboardData.files || []).find((f) => /^image\//.test(f.type));
    if (img) { e.preventDefault(); insererImage(img, dernierePos); return; }
    const t = e.clipboardData && e.clipboardData.getData("text/plain");
    if (t) {
      try {
        const j = JSON.parse(t);
        if (j && Array.isArray(j.elements)) {
          e.preventDefault();
          if (j.files && typeof j.files === "object") Object.assign(fichiers, j.files);
          coller(j.elements);
          return;
        }
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
    /* Le format d'une sélection s'ouvre par le bouton
       de sa barre d'actions, il ne s'impose pas. Un outil de forme pris au
       clavier (R, D, O, A, L, T) montre, lui, les réglages du prochain
       élément — le geste reste disponible. */
    const outilAReglages = /^(rectangle|diamond|ellipse|arrow|line|texte|postit)$/.test(etat.outil);
    if (!T.length || geste || (selection.size && !etat.format) || (!selection.size && !outilAReglages)) {
      panneau.hidden = true; return;
    }
    panneau.hidden = false;
    const a = T[0];
    const types = new Set(T.map((e) => e.type));
    const a1 = (f) => T.some(f);
    const postits = T.every(estPostit);
    const images = T.every((e) => e.type === "image");
    const surl = T.every(estSurligneur);
    const formes = a1((e) => /^(rectangle|diamond|ellipse)$/.test(e.type) && !estPostit(e));
    const lignes = types.has("line") || types.has("arrow");
    const avecTexte = types.has("text") || a1((e) => conteneur(e) && (e.virtuel ? estPostit(e) : texteDe(e)));
    const t0 = a.type === "text" ? a : (conteneur(a) && !a.virtuel && texteDe(a)) || a;
    let h = selection.size ? '<div class="tb-props-tete"><b>Format</b><button type="button" class="tb-b tb-petit" data-fermer-format aria-label="Fermer le format">✕</button></div>' : "";
    const bloc = (titre, corps) => { h += '<fieldset class="tb-bloc"><legend>' + titre + '</legend>' + corps + '</fieldset>'; };
    if (postits) {
      bloc("Couleur du post-it", '<div class="tb-pastilles">' + POSTITS.map((c) => pastille("postit", c, a.backgroundColor)).join("") + '</div>');
    } else if (images) {
      // une image n'a ni trait ni fond : seulement l'opacité et les calques
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
    if (!types.has("text") && !postits && !surl && !types.has("image")) {
      bloc("Épaisseur", choix("strokeWidth", [[1, "Fin", IC.w1], [2, "Gras", IC.w2], [4, "Très gras", IC.w4]], a.strokeWidth));
      if (!types.has("freedraw")) {
        bloc("Style du trait", choix("strokeStyle", [["solid", "Continu", IC.solide], ["dashed", "Tirets", IC.tirets],
          ["dotted", "Pointillés", IC.points]], a.strokeStyle));
        bloc("Tremblement", choix("roughness", [[0, "Architecte : trait net", IC.r0],
          [1, "Artiste : légèrement tremblé", IC.r1], [2, "Dessinateur : croquis", IC.r2]], a.roughness));
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
     le prochain élément naîtra avec. */
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
     Les raccourcis du format, touche pour touche. Ils ne vivent que
     dans le tableau (quand il a le focus) : sur le reste de la page, « R »
     reste une lettre. */
  const TOUCHES = { v: "selection", 1: "selection", r: "rectangle", 2: "rectangle", d: "diamond", 3: "diamond",
                    o: "ellipse", 4: "ellipse", a: "arrow", 5: "arrow", l: "line", 6: "line", p: "freedraw",
                    7: "freedraw", t: "texte", 8: "texte", e: "gomme", 0: "gomme", h: "main", k: "laser",
                    n: "postit", m: "surligneur", s: "lasso", w: "baguette" };
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
    // Maj H, Maj V : retourner en miroir — la position de la touche, pour l'AZERTY comme le QWERTY
    if (e.shiftKey && selection.size && (e.code === "KeyH" || e.code === "KeyV")) {
      e.preventDefault(); transformerSelection(e.code === "KeyH" ? "miroirH" : "miroirV"); return;
    }
    if (e.key === " ") { e.preventDefault(); if (!espace) { espace = true; majCurseur(); } return; }
    if (e.key === "Escape") {
      if (geste) { annulerGeste(); return; }
      if (baguette) { baguette = null; reglage.hidden = true; demander(); return; }
      if (selection.size) { selection.clear(); majPanneau(); demander(); return; }
      if (section.classList.contains("tb-grand")) basculerPlein(false);
      else if (etat.outil !== "selection") choisirOutil("selection");
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); supprimerSelection(); return; }
    if (e.key === "Enter" && geste && geste.mode === "lasso" && geste.forme === "polygone") {
      e.preventDefault();
      const g = geste; geste = null; finLasso(g); return;
    }
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
    if (k === "g") { basculerRegle(); return; }
    if (k === "f") { basculerFormes(); return; }
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
      files: fichiersDe(elements),
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
    dire("Enregistré : le fichier s'ouvre ici, et dans les éditeurs qui partagent ce format.");
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
    if (j.files && typeof j.files === "object") Object.assign(fichiers, j.files);
    // une image dont le fichier n'a pas suivi n'a rien à montrer
    const orphelines = (e) => e.type === "image" && !fichiers[e.fileId];
    const images = lus.filter(orphelines).length;
    elements = lus.filter((e) => !orphelines(e) && e.type !== "embeddable" && e.type !== "iframe");
    reparer();
    elements.forEach((e) => { if (e.type === "text" && e.containerId) placerLie(e); });
    if (j.appState && j.appState.viewBackgroundColor) etat.fond = j.appState.viewBackgroundColor;
    selection.clear();
    cacheChemins.clear();
    memoriser(); ajuster(); majPanneau(); majFond();
    const nb = elements.length;
    dire(nb + " élément" + (nb > 1 ? "s" : "") + " ouvert" + (nb > 1 ? "s" : "")
      + (images ? " · " + images + " image(s) sans leur fichier, laissée(s) de côté." : "."));
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
    if (f && /^image\//.test(f.type)) { const { sx, sy } = posPointeur(e); insererImage(f, versScene(sx, sy)); return; }
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
      } else if (el.type === "image") {
        const f = fichiers[el.fileId];
        const s = Array.isArray(el.scale) ? el.scale : [1, 1];
        const miroir = s[0] < 0 || s[1] < 0
          ? ' transform="translate(' + (s[0] < 0 ? el.width.toFixed(2) : 0) + " " + (s[1] < 0 ? el.height.toFixed(2) : 0)
            + ") scale(" + (s[0] < 0 ? -1 : 1) + " " + (s[1] < 0 ? -1 : 1) + ')"' : "";
        if (f) t += '<image href="' + f.dataURL + '" width="' + el.width.toFixed(2) + '" height="' + el.height.toFixed(2)
          + '" preserveAspectRatio="none"' + miroir + "/>";
      } else {
        const effet = el.type === "freedraw" && el.customData && el.customData.effet;
        const matiere = el.type === "freedraw" && el.customData && MATIERES[el.customData.pointe];
        cheminsDe(el).forEach((o) => {
          if (!o.couleur || o.couleur === "transparent") return;
          // une matière garde sa forme et sa transparence ; son grain ne
          // passe pas dans un SVG (l'export PNG, lui, le garde)
          if (matiere && o.mode === "fond" && o.couleur === el.strokeColor) {
            t += '<path d="' + o.d + '" fill="' + o.couleur + '" fill-opacity="' + matiere.svg + '"/>'; return;
          }
          if (effet && o.mode === "fond" && o.couleur === el.strokeColor && (effet === "neon" || EFFETS[effet])) {
            t += svgEffet(el, effet, o.d); return;
          }
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
  /* Le message se pose TOUJOURS hors de la barre d'outils. Signalé le 9 nov.
     2026 : sur un écran étroit la barre est en bas, le message aussi, et il
     cachait les stylos le temps qu'il restait affiché. On mesure donc où est
     la barre : en bas, le message monte juste au-dessus d'elle. */
  function dire(t, faute) {
    etatLigne.textContent = t;
    etatLigne.classList.toggle("tb-faute", !!faute);
    const barre = $(".tb-encrage"), cadre = etatLigne.offsetParent;
    etatLigne.style.bottom = "";
    if (barre && cadre) {
      const rb = barre.getBoundingClientRect(), rc = cadre.getBoundingClientRect();
      if (rb.height && rb.top > rc.top + rc.height / 2) etatLigne.style.bottom = Math.round(rc.bottom - rb.top + 10) + "px";
    }
    etatLigne.classList.add("tb-vu");
    clearTimeout(dire.m);
    dire.m = setTimeout(() => etatLigne.classList.remove("tb-vu"), faute ? 4200 : 2800);
  }
  $$("[data-outil]").forEach((b) => b.addEventListener("click", () => {
    const o = b.dataset.outil;
    if (o === "verrou") basculerVerrou();
    else if ((o === "surligneur" || o === "gomme" || o === "baguette" || o === "lasso" || o === "laser") && etat.outil === o && b.closest(".tb-encrage")) {
      if (reglage.hidden || reglage.dataset.quoi !== o) ouvrirReglage(o); else reglage.hidden = true;
    } else choisirOutil(o);
    scene.focus({ preventScroll: true });
  }));
  $$("[data-bascule]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.bascule === "regle") basculerRegle(); else basculerFormes();
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
    /* « contains » et non « === » : un toucher sur l'icône du bouton vise le
       dessin, pas le bouton — le menu se fermait, puis le clic le rouvrait. */
    if (!menu.hidden && !menu.contains(e.target) && !bMenu.contains(e.target)) fermerMenu();
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
     teinte remise à l'endroit) : c'est le procédé usuel. Le noir
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

  /* ═══════════════ 14 bis. La disposition de la barre ═══════════════
     La barre de gauche (sélectionner, se déplacer, encrer, créer), la
     barre d'encrage (trois stylos, surligneur, gomme, laser), le panneau
     « Créer » qui POSE un objet au centre de l'écran d'un clic, et la
     barre d'actions qui flotte au-dessus de la sélection. */

  /* ── les formes du panneau « Créer » ──
     Rectangle, losange et ellipse sont les formes du format ; toutes les
     autres sont des POLYGONES fermés (une « ligne » dont le dernier point
     rejoint le premier). C'est ainsi que le format les connaît : un
     triangle posé ici reste un triangle ailleurs. Les points sont
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
    ["pointillee", "Flèche en pointillés", { type: "arrow", fin: "arrow", style: "dashed",
      ic: '<path d="M4 19L20 5" stroke-dasharray="3 2.5"/><path d="M13 5h7v7"/>' }],
    ["coudee", "Flèche coudée", { type: "arrow", fin: "arrow", coude: true, h: 90,
      ic: '<path d="M3 6h9v12h8M17 15l3 3-3 3"/>' }],
    ["pleine", "Flèche à pointe pleine", { type: "arrow", fin: "triangle",
      ic: '<path d="M4 19L15 8"/><path d="M20 4l-2.5 8.5-6-6z" fill="currentColor"/>' }],
    ["rond", "Flèche à rond", { type: "arrow", debut: "dot", fin: "arrow",
      ic: '<path d="M7 17L20 5M13 5h7v7"/><circle cx="5.5" cy="18.5" r="2.2" fill="currentColor"/>' }],
    ["epaisse", "Flèche épaisse", { type: "arrow", fin: "arrow", epais: 5,
      ic: '<path d="M4 19L20 5M13 5h7v7" stroke-width="3"/>' }],
    ["ligne-pointillee", "Ligne en pointillés", { type: "line", style: "dashed",
      ic: '<path d="M4 19L20 5" stroke-dasharray="3 2.5"/>' }],
  ];
  function apercu(def) {
    const svg = (corps) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + corps + "</svg>";
    if (def.ic) return svg(def.ic);
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
  /* ═══════════════ 13 bis. Images, réactions, modèles ══════════════════
     Ce que la liste « Bientôt » promettait. */

  /* ── les images ──
     Ramenées à 1 600 px au plus avant d'entrer : un appareil photo donne
     des 4 000 px, que personne ne regarde sur un tableau et que la mémoire
     du navigateur ne tiendrait pas. Le fichier est désigné par son
     EMPREINTE : coller deux fois la même capture n'en garde qu'une copie. */
  const FICHIERS_CLE = "ciel-tableau-fichiers-v1";
  let fichiers = {};                  // fileId → { id, mimeType, dataURL, created }
  let fichiersGardes = "";            // la liste écrite en dernier dans la mémoire
  const imagesChargees = new Map();
  function imageDe(id) {
    let img = imagesChargees.get(id);
    if (!img && fichiers[id]) {
      img = new Image();
      img.onload = () => demander();
      img.src = fichiers[id].dataURL;
      imagesChargees.set(id, img);
    }
    return img;
  }
  function fichiersDe(liste) {
    const o = {};
    liste.forEach((e) => { if (e.type === "image" && fichiers[e.fileId]) o[e.fileId] = fichiers[e.fileId]; });
    return o;
  }
  function empreinte(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0") + s.length.toString(16);
  }
  function preparerImage(f) {
    return new Promise((ok, ko) => {
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        // une photo reste en JPEG ; le reste en PNG, qui garde la transparence —
        // et en WebP si le navigateur sait l'écrire et qu'il pèse moins
        let type = f.type === "image/jpeg" ? "image/jpeg" : "image/png";
        let data = c.toDataURL(type, 0.86);
        if (type === "image/png" && data.length > 400000) {
          const w2 = c.toDataURL("image/webp", 0.9);
          if (w2.startsWith("data:image/webp") && w2.length < data.length) { data = w2; type = "image/webp"; }
        }
        ok({ dataURL: data, mimeType: type, w, h });
      };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("illisible")); };
      img.src = url;
    });
  }
  async function insererImage(f, ou) {
    if (!f || !/^image\//.test(f.type)) return;
    let r;
    try { r = await preparerImage(f); }
    catch (e) { dire("« " + (f.name || "image") + " » n'est pas une image lisible.", true); return; }
    const id = empreinte(r.dataURL);
    if (!fichiers[id]) fichiers[id] = { id, mimeType: r.mimeType, dataURL: r.dataURL, created: Date.now() };
    // au plus 480 px d'écran au zoom courant : elle se voit entière en arrivant
    const k = Math.min(1, 480 / Math.max(0.35, etat.zoom) / Math.max(r.w, r.h));
    const w = r.w * k, h = r.h * k;
    const p = ou ? { x: ou.x - w / 2, y: ou.y - h / 2 } : pointInsertion(w, h);
    inserer(nouvelElement("image", p.x, p.y, {
      width: w, height: h, fileId: id, status: "saved", scale: [1, 1], crop: null,
      strokeColor: "transparent", backgroundColor: "transparent", roundness: null, opacity: 100,
    }));
    dire("Image posée. Tirer un coin l'agrandit sans la déformer.");
  }

  /* ── les réactions ──
     Un tampon posé sur ce qu'on montre : au coin haut-droit de la
     sélection, ou au centre de l'écran. Plusieurs réactions sur la même
     chose se rangent côte à côte au lieu de s'empiler, et le panneau
     reste ouvert pour en poser une autre. C'est un texte : il se déplace,
     s'efface et s'enregistre comme les autres. */
  const REACTIONS = [["👍", "Pouce levé"], ["❤️", "Cœur"], ["😂", "Rire"], ["🎉", "Bravo"], ["⭐", "Étoile"],
                     ["✅", "Validé"], ["❌", "Refusé"], ["❓", "Question"], ["💡", "Idée"], ["🔥", "Génial"],
                     ["👀", "À regarder"], ["🙏", "Merci"]];
  const estReaction = (e) => !!(e && e.customData && e.customData.reaction);
  function insererReaction(r) {
    const taille = 36 / Math.max(0.35, etat.zoom);
    const cible = selectionnes().filter((e) => !estReaction(e) && !estLie(e));
    let x, y;
    if (cible.length) {
      const b = boiteDe(cible);
      y = b.y - taille * 0.75;
      // celles déjà posées sur ce coin
      const deja = elements.filter((e) => estReaction(e) && Math.abs(e.y - y) < taille * 0.3
        && e.x > b.x - taille * 8 && e.x < b.x + b.w + taille);
      x = b.x + b.w - taille * 0.6 - deja.length * taille * 1.15;
    } else {
      const p = pointInsertion(taille, taille * 1.25);
      x = p.x; y = p.y;
    }
    const el = nouvelElement("text", x, y, {
      text: r, originalText: r, fontSize: taille, fontFamily: 2, textAlign: "left", verticalAlign: "top",
      containerId: null, autoResize: true, lineHeight: 1.25, backgroundColor: "transparent", roundness: null,
      opacity: 100, customData: { reaction: true },
    });
    mesurerLibre(el);
    elements.push(el);
    memoriser(); demander();
    dire("Réaction posée" + (cible.length ? " sur la sélection." : ". Sélectionnez un objet d'abord pour la poser dessus."));
  }

  /* ── les icônes réseau ──
     Des symboles en volume, comme sur un schéma de réseau : le routeur est
     un cylindre à quatre flèches, le commutateur un boîtier plat. Ils sont
     dessinés par _pilotage/scripts/icones-tableau.py, qui écrit icones.js.
     L'icône est une IMAGE (un seul objet, qui s'agrandit sans se déformer)
     et son nom un texte ordinaire, qu'on réécrit au double-clic — « R1 »,
     « SW-ADMIN ». Les deux partagent un groupe : un clic les prend
     ensemble, le glisser les déplace ensemble. Une image n'est pas inversée
     en mode sombre : les couleurs restent celles du dessin. */
  const RESEAU = window.TB_ICONES || [];
  const FAMILLES_RESEAU = [["inter", "Interconnexion"], ["term", "Terminaux"], ["serv", "Serveurs et services"],
                           ["secu", "Sécurité"], ["zone", "Zones et infrastructure"]];
  const svgReseau = (r) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' + r[2] + "</svg>";
  function groupeDe(el) {
    const g = el.groupIds && el.groupIds.length ? el.groupIds[el.groupIds.length - 1] : null;
    if (!g) return [el.id];
    return elements.filter((e) => !e.isDeleted && e.groupIds && e.groupIds.includes(g)).map((e) => e.id);
  }
  /* ── les liens ──
     Comme dans un simulateur : on choisit le type de câble, puis on clique
     deux équipements. Le lien est ACCROCHÉ aux deux (startBinding,
     endBinding) : déplacer une icône le fait suivre, supprimer une icône
     l'emporte. Son tracé est recalculé à chaque image, d'un bord à
     l'autre — jamais d'un centre à l'autre, il passerait sous l'icône. */
  const LIENS = [
    // [id, nom, couleur, style, épaisseur]
    ["droit", "Cuivre droit", "#343a40", "solid", 2.5],
    ["croise", "Cuivre croisé", "#343a40", "dashed", 2.5],
    ["fibre", "Fibre optique", "#f08c00", "solid", 3],
    ["serie", "Série (WAN)", "#e03131", "solid", 2.5],
    ["console", "Console", "#4dabf7", "dotted", 2.5],
    ["coaxial", "Coaxial", "#0ca678", "solid", 3],
    ["sans-fil", "Sans fil", "#2f9e44", "dotted", 2],
    ["internet", "Internet", "#1971c2", "solid", 4.5],
    ["vpn", "Tunnel VPN", "#7048e8", "dashed", 3],
  ];
  const estLien = (el) => !!(el && el.customData && el.customData.lien);
  let lienDebut = null;
  function majLiens() {
    for (const l of elements) {
      if (!estLien(l)) continue;
      const a = l.startBinding && parId(l.startBinding.elementId), b = l.endBinding && parId(l.endBinding.elementId);
      if (!a || !b) continue;
      const A = R.boite(a), Bx = R.boite(b);
      const ax = A.x + A.w / 2, ay = A.y + A.h / 2, bx = Bx.x + Bx.w / 2, by = Bx.y + Bx.h / 2;
      const d = Math.hypot(bx - ax, by - ay);
      if (d < 1) continue;
      const ux = (bx - ax) / d, uy = (by - ay) / d;
      const bord = (k) => Math.min(k.w / 2 / Math.max(Math.abs(ux), 1e-9), k.h / 2 / Math.max(Math.abs(uy), 1e-9)) + 4;
      const ta = Math.min(bord(A), d / 2), tb = Math.min(bord(Bx), d / 2);
      const s = [ax + ux * ta, ay + uy * ta], f = [bx - ux * tb, by - uy * tb];
      let pts = [s, f];
      // la série : l'éclair rouge, au milieu, quand il y a la place
      if (l.customData.lien === "serie" && d - ta - tb > 40) {
        const mx = (s[0] + f[0]) / 2, my = (s[1] + f[1]) / 2, nx = -uy, ny = ux;
        pts = [s, [mx - ux * 9 + nx * 9, my - uy * 9 + ny * 9], [mx + ux * 9 - nx * 9, my + uy * 9 - ny * 9], f];
      }
      const rel = pts.map(([x, y]) => [x - s[0], y - s[1]]);
      if (l.x === s[0] && l.y === s[1] && JSON.stringify(rel) === JSON.stringify(l.points)) continue;
      l.x = s[0]; l.y = s[1]; l.points = rel;
      const xs = rel.map((q) => q[0]), ys = rel.map((q) => q[1]);
      l.width = Math.max(...xs) - Math.min(...xs); l.height = Math.max(...ys) - Math.min(...ys);
    }
  }
  /* Ce qu'un lien accroche : l'icône d'un groupe, même si l'on a cliqué
     son nom ; sinon la forme cliquée. Ni un trait de stylo, ni un lien. */
  function ancreLien(el) {
    if (!el || estLien(el) || el.type === "freedraw") return null;
    if (el.groupIds && el.groupIds.length) {
      const img = groupeDe(el).map(parId).find((e) => e && e.type === "image");
      if (img) return img;
    }
    return el;
  }
  function choisirLien(id) {
    etat.lienType = id;
    choisirOutil("lien");
    fermerCreer();
    scene.focus({ preventScroll: true });
    dire("Lien « " + LIENS.find((l) => l[0] === id)[1] + " » : cliquez le premier équipement, puis le second. Échap pour arrêter.");
  }
  function debutLien(e, p) {
    const el = ancreLien(aPortee(p.x, p.y));
    if (!el) { dire("Cliquez sur un équipement.", true); return; }
    if (!lienDebut || !parId(lienDebut) || lienDebut === el.id) {
      lienDebut = el.id;
      selection = new Set(groupeDe(el));
      demander();
      dire("Et maintenant le second équipement.");
      return;
    }
    const def = LIENS.find((l) => l[0] === etat.lienType) || LIENS[0];
    const l = nouvelElement("line", 0, 0, {
      points: [[0, 0], [1, 0]], lastCommittedPoint: null, startArrowhead: null, endArrowhead: null, polygon: false,
      startBinding: { elementId: lienDebut, focus: 0, gap: 4 }, endBinding: { elementId: el.id, focus: 0, gap: 4 },
      strokeColor: def[2], strokeStyle: def[3], strokeWidth: def[4], roughness: 0, roundness: null,
      backgroundColor: "transparent", opacity: 100, customData: { lien: def[0] },
    });
    // sous les icônes : un câble ne passe jamais par-dessus un équipement
    elements.unshift(l);
    majLiens();
    lienDebut = null;
    selection = new Set([l.id]);
    memoriser(); majPanneau(); demander();
    dire(def[1] + " posé. Il suit les équipements ; pour un autre, cliquez encore deux équipements.");
  }

  function insererReseau(id) {
    const def = RESEAU.find((r) => r[0] === id);
    // l'image : un vrai fichier SVG, désigné par son empreinte comme une photo
    const dataURL = "data:image/svg+xml;base64," + btoa(svgReseau(def));
    const fid = empreinte(dataURL);
    if (!fichiers[fid]) fichiers[fid] = { id: fid, mimeType: "image/svg+xml", dataURL, created: Date.now() };
    const z = Math.max(0.35, etat.zoom), s = 72 / z, g = nouvelId();
    const nom = libre(0, 0, def[1], 16 / z, { textAlign: "center", groupIds: [g] });
    const p = pointInsertion(Math.max(s, nom.width), s + 6 / z + nom.height);
    const icone = nouvelElement("image", p.x + (Math.max(s, nom.width) - s) / 2, p.y, {
      width: s, height: s, fileId: fid, status: "saved", scale: [1, 1], crop: null, groupIds: [g],
      strokeColor: "transparent", backgroundColor: "transparent", roundness: null, opacity: 100,
    });
    nom.x = icone.x + s / 2 - nom.width / 2;
    nom.y = icone.y + s + 6 / z;
    elements.push(icone, nom);
    choisirOutil("selection");
    selection = new Set([icone.id, nom.id]);
    fermerCreer();
    scene.focus({ preventScroll: true });
    memoriser(); majPanneau(); demander();
    dire(def[1] + " posé. Double-clic sur son nom pour l'écrire : « R1 », « SW-ADMIN ».");
  }

  /* ── les gabarits de diagramme ──
     Algorigramme, MCD, UML : des formes ORDINAIRES — rectangles, losanges,
     ellipses, contours — posées ensemble et groupées. Une forme qui n'est
     pas un conteneur (parallélogramme, hexagone, document) reçoit son texte
     par un cadre invisible posé dedans. Une fois posé, tout se déplace, se
     réécrit au double-clic et s'enregistre comme le reste. */
  const ENCRE_G = "#1e1e1e", FOND_G = "#ffffff";
  const styleG = (o) => Object.assign({ strokeColor: ENCRE_G, backgroundColor: FOND_G, fillStyle: "solid", strokeWidth: 2,
    strokeStyle: "solid", roughness: 0, opacity: 100, roundness: null }, o || {});
  const gRect = (x, y, w, h, o) => nouvelElement("rectangle", x, y, styleG(Object.assign({ width: w, height: h }, o)));
  const gEllipse = (x, y, w, h, o) => nouvelElement("ellipse", x, y, styleG(Object.assign({ width: w, height: h }, o)));
  const gLosange = (x, y, w, h, o) => nouvelElement("diamond", x, y, styleG(Object.assign({ width: w, height: h }, o)));
  function gTrace(pts, ferme, o) {
    o = o || {};
    const [x0, y0] = pts[0];
    const rel = pts.map(([x, y]) => [x - x0, y - y0]);
    if (ferme) rel.push([0, 0]);
    const fleche = !!(o.fin || o.debut);
    const el = nouvelElement(fleche ? "arrow" : "line", x0, y0, styleG({
      points: rel, lastCommittedPoint: null, startBinding: null, endBinding: null,
      startArrowhead: o.debut || null, endArrowhead: o.fin || null,
      backgroundColor: ferme ? (o.fond || FOND_G) : "transparent", strokeStyle: o.style || "solid", strokeWidth: o.w || 2,
    }));
    if (fleche) el.elbowed = false; else el.polygon = !!ferme;
    const b = R.boite(el);
    el.width = b.w; el.height = b.h;
    return el;
  }
  const gTexte = (c, t, o) => etiquette(c, t, Object.assign({ fontSize: 18 }, o || {}));
  // les attributs d'une entité, d'une classe : à gauche, en haut
  const gListe = (c, t) => gTexte(c, t, { textAlign: "left", verticalAlign: "top", fontSize: 16 });
  // le contour (ou null : seulement le cadre et son texte), un cadre invisible, le texte
  function gDans(contour, x, y, w, h, t) {
    const c = gRect(x, y, w, h, { strokeColor: "transparent", backgroundColor: "transparent" });
    return [contour, c, gTexte(c, t)];
  }
  const arcG = (cx, cy, rx, ry, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
  function gCylindre(w, h, t, fond) {
    const ry = Math.min(14, h * 0.14);
    const corps = gTrace([[0, ry]].concat(arcG(w / 2, h - ry, w / 2, ry, Math.PI, 0, 18), [[w, ry]],
                                          arcG(w / 2, ry, w / 2, ry, 0, -Math.PI, 18)), true, { fond });
    const devant = gTrace(arcG(w / 2, ry, w / 2, ry, Math.PI, 0, 18), false);
    return [corps, devant].concat(gDans(null, 8, ry * 2 + 4, w - 16, h - ry * 3 - 8, t).slice(1));
  }
  function gDocument(w, h, t) {
    const vague = Array.from({ length: 21 }, (_, i) => [w - w * i / 20, h - 10 + 9 * Math.sin(2 * Math.PI * i / 20)]);
    return gDans(gTrace([[0, 0], [w, 0]].concat(vague), true), 8, 8, w - 16, h - 30, t);
  }
  function gNote(w, h, t, fond) {
    const f = 22;
    return [gTrace([[0, 0], [w - f, 0], [w, f], [w, h], [0, h]], true, { fond }), gTrace([[w - f, 0], [w - f, f], [w, f]], false)]
      .concat(gDans(null, 8, f, w - 16, h - f - 8, t).slice(1));
  }
  function gEntete(w, h1, h2, couleur, titre, corps) {
    const tete = gRect(0, 0, w, h1, { backgroundColor: couleur }), bas = gRect(0, h1, w, h2);
    return [tete, gTexte(tete, titre), bas, gListe(bas, corps)];
  }
  const GABARITS = {
    // ── général ──
    cylindre: ["Cylindre", "general", '<path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><ellipse cx="12" cy="6" rx="7" ry="3"/>', "base disque stockage",
      () => gCylindre(150, 120, "")],
    document: ["Document", "general", '<path d="M5 4h14v13c-2.3 2-4.7-2-7 0s-4.7 2-7 0z"/>', "page fichier",
      () => gDocument(180, 110, "")],
    nuage: ["Nuage", "general", '<path d="M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6-1.4A4.3 4.3 0 0 0 7 18z"/>', "cloud",
      () => {
        const w = 220, h = 130;
        const pts = Array.from({ length: 96 }, (_, i) => {
          const a = 2 * Math.PI * i / 96, r = 0.84 + 0.16 * Math.abs(Math.sin(4 * a));
          return [w / 2 + w / 2 * r * Math.cos(a), h / 2 + h / 2 * r * Math.sin(a)];
        });
        return gDans(gTrace(pts, true), w * 0.22, h * 0.28, w * 0.56, h * 0.44, "");
      }],
    cube: ["Cube", "general", '<path d="M4 9h11v11H4zM4 9l5-5h11l-5 5M15 20l5-5V4"/>', "boite 3d",
      () => {
        const w = 150, h = 130, d = 24, face = gRect(0, d, w - d, h - d);
        return [gTrace([[0, d], [d, 0], [w, 0], [w - d, d]], true, { fond: "#f1f3f5" }),
                gTrace([[w - d, d], [w, 0], [w, h - d], [w - d, h]], true, { fond: "#dee2e6" }), face, gTexte(face, "")];
      }],
    note: ["Note pliée", "general", '<path d="M5 4h10l4 4v12H5zM15 4v4h4"/>', "post-it commentaire",
      () => gNote(170, 120, "Note", "#fff9db")],
    tableau: ["Tableau 3 × 3", "general", '<path d="M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14"/>', "grille cases cellules",
      () => { const o = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o.push(gRect(j * 110, i * 44, 110, 44, { backgroundColor: i ? FOND_G : "#e9ecef" })); return o; }],

    // ── diagramme de flux (algorigramme) ──
    debut: ["Début / Fin", "flux", '<rect x="3" y="8" width="18" height="8" rx="4"/>', "algorigramme terminal debut fin",
      () => { const c = gRect(0, 0, 170, 64, { roundness: { type: 3 } }); return [c, gTexte(c, "Début")]; }],
    traitement: ["Traitement", "flux", '<rect x="3" y="7" width="18" height="10"/>', "algorigramme instruction action affectation",
      () => { const c = gRect(0, 0, 190, 80); return [c, gTexte(c, "Traitement")]; }],
    decision: ["Test / Décision", "flux", '<path d="M12 4l9 8-9 8-9-8z"/>', "algorigramme condition si alors sinon",
      () => { const c = gLosange(0, 0, 200, 120); return [c, gTexte(c, "Condition ?")]; }],
    es: ["Entrée / Sortie", "flux", '<path d="M7 7h14l-4 10H3z"/>', "algorigramme lire afficher ecrire saisir",
      () => gDans(gTrace([[34, 0], [220, 0], [186, 84], [0, 84]], true), 34, 8, 152, 68, "Lire x")],
    sousprog: ["Sous-programme", "flux", '<path d="M3 7h18v10H3zM6 7v10M18 7v10"/>', "algorigramme fonction procedure appel",
      () => { const c = gRect(0, 0, 210, 80); return [c, gTexte(c, "Sous-programme"), gTrace([[16, 0], [16, 80]]), gTrace([[194, 0], [194, 80]])]; }],
    boucle: ["Boucle (préparation)", "flux", '<path d="M7 7h10l4 5-4 5H7l-4-5z"/>', "algorigramme pour tant que repeter iteration",
      () => gDans(gTrace([[26, 0], [194, 0], [220, 42], [194, 84], [26, 84], [0, 42]], true), 26, 8, 168, 68, "Pour i de 1 à n")],
    saisie: ["Saisie manuelle", "flux", '<path d="M3 10l18-4v12H3z"/>', "algorigramme clavier",
      () => gDans(gTrace([[0, 26], [200, 0], [200, 84], [0, 84]], true), 10, 30, 180, 50, "Saisie")],
    "doc-flux": ["Document", "flux", '<path d="M5 4h14v13c-2.3 2-4.7-2-7 0s-4.7 2-7 0z"/>', "algorigramme impression etat",
      () => gDocument(190, 100, "Document")],
    stockage: ["Données stockées", "flux", '<path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><ellipse cx="12" cy="6" rx="7" ry="3"/>', "algorigramme base fichier",
      () => gCylindre(150, 110, "Données")],
    connecteur: ["Connecteur", "flux", '<circle cx="12" cy="12" r="6"/>', "algorigramme renvoi",
      () => { const c = gEllipse(0, 0, 50, 50); return [c, gTexte(c, "A")]; }],
    commentaire: ["Commentaire", "flux", '<path d="M8 5H5v14h3M11 12h9"/>', "algorigramme annotation",
      () => { const t = libre(28, 26, "Commentaire", 18); return [gTrace([[18, 0], [0, 0], [0, 80], [18, 80]]), t]; }],
    liaison: ["Liaison", "flux", '<path d="M12 3v17M8 16l4 4 4-4"/>', "algorigramme fleche suite",
      () => [gTrace([[0, 0], [0, 90]], false, { fin: "arrow" })]],
    branche: ["Branche Oui / Non", "flux", '<path d="M3 15h16M16 12l3 3-3 3M5 9h5"/>', "algorigramme sortie test",
      () => [gTrace([[0, 30], [170, 30]], false, { fin: "arrow" }), libre(40, 0, "Oui", 18)]],

    // ── relation d'entité ──
    entite: ["Entité (MCD)", "mcd", '<path d="M4 5h16v14H4zM4 9h16"/>', "merise mcd entite attributs identifiant",
      () => gEntete(190, 42, 112, "#d0ebff", "CLIENT", "idClient\nnom\nprénom\nville")],
    association: ["Association", "mcd", '<ellipse cx="12" cy="12" rx="9" ry="5.5"/>', "merise mcd relation verbe",
      () => { const c = gEllipse(0, 0, 180, 74, { backgroundColor: "#fff3bf" }); return [c, gTexte(c, "Commander")]; }],
    "association-attr": ["Association porteuse", "mcd", '<ellipse cx="12" cy="12" rx="9" ry="6.5"/><path d="M7 12h10"/>', "merise mcd attribut",
      () => { const c = gEllipse(0, 0, 200, 100, { backgroundColor: "#fff3bf" }); return [c, gTexte(c, "Commander\nquantité")]; }],
    cardinalite: ["Cardinalité", "mcd", '<text x="12" y="16" font-size="10" font-family="sans-serif" text-anchor="middle" stroke="none" fill="currentColor">0,n</text>', "merise 0,n 1,1 0,1 1,n",
      () => [libre(0, 0, "0,n", 20)]],
    table: ["Table (MLD / SQL)", "mcd", '<path d="M4 5h16v14H4zM4 9h16M10 9v10"/>', "sql mld cle primaire etrangere colonne",
      () => gEntete(240, 42, 104, "#d3f9d8", "client", "id_client   INT   PK\nnom   VARCHAR(50)\nid_ville   INT   FK")],
    "lien-1n": ["Lien un à plusieurs", "mcd", '<path d="M3 12h18M6 9v6M17 12l4-3M17 12l4 3"/>', "patte d oie crow foot cardinalite",
      () => [gTrace([[0, 0], [200, 0]], false, { debut: "crowfoot_one", fin: "crowfoot_many" })]],
    "lien-11": ["Lien un à un", "mcd", '<path d="M3 12h18M6 9v6M18 9v6"/>', "crow foot cardinalite",
      () => [gTrace([[0, 0], [200, 0]], false, { debut: "crowfoot_one", fin: "crowfoot_one" })]],
    "lien-1-1n": ["Lien un à un ou plusieurs", "mcd", '<path d="M3 12h18M6 9v6M14 9v6M17 12l4-3M17 12l4 3"/>', "crow foot cardinalite",
      () => [gTrace([[0, 0], [200, 0]], false, { debut: "crowfoot_one", fin: "crowfoot_one_or_many" })]],
    "lien-mcd": ["Lien simple", "mcd", '<path d="M3 12h18"/>', "patte trait",
      () => [gTrace([[0, 0], [200, 0]], false)]],

    // ── UML ──
    classe: ["Classe", "uml", '<path d="M4 3h16v18H4zM4 8h16M4 14h16"/>', "uml poo attribut methode",
      () => { const o = gEntete(230, 44, 74, "#e5dbff", "Classe", "- nom : string\n- age : int"); const m = gRect(0, 118, 230, 74); return o.concat(m, gListe(m, "+ getNom() : string\n+ setNom(n : string)")); }],
    interface: ["Interface", "uml", '<path d="M4 4h16v16H4zM4 10h16M8 7h8"/>', "uml interface contrat",
      () => gEntete(230, 58, 60, "#d0ebff", "«interface»\nAffichable", "+ afficher() : void")],
    enumeration: ["Énumération", "uml", '<path d="M4 4h16v16H4zM4 9h16M7 12h6M7 15h6M7 18h4"/>', "uml enum",
      () => gEntete(200, 58, 86, "#fff3bf", "«enumeration»\nCouleur", "ROUGE\nVERT\nBLEU")],
    acteur: ["Acteur", "uml", '<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5v7M7 10h10M12 14.5l-4 6M12 14.5l4 6"/>', "uml cas utilisation utilisateur",
      () => { const t = libre(0, 110, "Acteur", 18); t.x = 36 - t.width / 2;
        return [gEllipse(22, 0, 28, 28), gTrace([[36, 28], [36, 70]]), gTrace([[12, 44], [60, 44]]), gTrace([[16, 104], [36, 70], [56, 104]]), t]; }],
    cas: ["Cas d'utilisation", "uml", '<ellipse cx="12" cy="12" rx="9" ry="5"/>', "uml use case",
      () => { const c = gEllipse(0, 0, 210, 84); return [c, gTexte(c, "Cas d'utilisation")]; }],
    systeme: ["Système (frontière)", "uml", '<rect x="3" y="3" width="18" height="18"/><path d="M6 6h6"/>', "uml cas utilisation limite",
      () => { const c = gRect(0, 0, 340, 420, { backgroundColor: "transparent" }); return [c, gTexte(c, "Système", { verticalAlign: "top" })]; }],
    "note-uml": ["Note", "uml", '<path d="M5 4h10l4 4v12H5zM15 4v4h4"/>', "uml commentaire",
      () => gNote(180, 100, "Note", "#fff9db")],
    paquetage: ["Paquetage", "uml", '<path d="M3 8h18v12H3zM3 8V5h7v3"/>', "uml package",
      () => { const tab = gRect(0, 0, 120, 30), corps = gRect(0, 30, 260, 150); return [tab, gTexte(tab, "paquetage", { fontSize: 16 }), corps]; }],
    "ligne-vie": ["Ligne de vie", "uml", '<rect x="6" y="3" width="12" height="5"/><path d="M12 8v13" stroke-dasharray="2 2"/>', "uml sequence objet",
      () => { const t = gRect(0, 0, 170, 50); return [t, gTexte(t, "objet : Classe"), gTrace([[85, 50], [85, 320]], false, { style: "dashed" })]; }],
    action: ["Action (activité)", "uml", '<rect x="3" y="7" width="18" height="10" rx="4"/>', "uml activite",
      () => { const c = gRect(0, 0, 190, 70, { roundness: { type: 3 } }); return [c, gTexte(c, "Action")]; }],
    "debut-act": ["Début (activité)", "uml", '<circle cx="12" cy="12" r="5" fill="currentColor"/>', "uml etat initial",
      () => [gEllipse(0, 0, 32, 32, { backgroundColor: ENCRE_G })]],
    "fin-act": ["Fin (activité)", "uml", '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>', "uml etat final",
      () => [gEllipse(0, 0, 38, 38), gEllipse(8, 8, 22, 22, { backgroundColor: ENCRE_G })]],
    "uml-association": ["Association", "uml", '<path d="M3 12h18"/>', "uml relation",
      () => [gTrace([[0, 0], [200, 0]], false)]],
    heritage: ["Héritage", "uml", '<path d="M3 12h12M15 7l6 5-6 5z"/>', "uml generalisation extends",
      () => [gTrace([[0, 0], [200, 0]], false, { fin: "triangle_outline" })]],
    realisation: ["Réalisation", "uml", '<path d="M3 12h12" stroke-dasharray="2.5 2"/><path d="M15 7l6 5-6 5z"/>', "uml implements interface",
      () => [gTrace([[0, 0], [200, 0]], false, { fin: "triangle_outline", style: "dashed" })]],
    dependance: ["Dépendance", "uml", '<path d="M3 12h17" stroke-dasharray="2.5 2"/><path d="M16 8l4 4-4 4"/>', "uml utilise",
      () => [gTrace([[0, 0], [200, 0]], false, { fin: "arrow", style: "dashed" })]],
    agregation: ["Agrégation", "uml", '<path d="M10 12h11M3 12l3.5-3 3.5 3-3.5 3z"/>', "uml losange vide",
      () => [gTrace([[0, 0], [200, 0]], false, { debut: "diamond_outline" })]],
    composition: ["Composition", "uml", '<path d="M10 12h11"/><path d="M3 12l3.5-3 3.5 3-3.5 3z" fill="currentColor"/>', "uml losange plein",
      () => [gTrace([[0, 0], [200, 0]], false, { debut: "diamond" })]],
    message: ["Message", "uml", '<path d="M3 12h15"/><path d="M15 8l5 4-5 4z" fill="currentColor"/>', "uml sequence appel synchrone",
      () => { const t = libre(40, -30, "message()", 16); return [gTrace([[0, 0], [200, 0]], false, { fin: "triangle" }), t]; }],
    retour: ["Retour", "uml", '<path d="M21 12H5" stroke-dasharray="2.5 2"/><path d="M8 8l-4 4 4 4"/>', "uml sequence reponse",
      () => [gTrace([[200, 0], [0, 0]], false, { fin: "arrow", style: "dashed" })]],
  };
  function insererGabarit(id) {
    const [nom, , , , faire] = GABARITS[id];
    const liste = faire().filter(Boolean);
    const k = 1 / Math.max(0.35, etat.zoom);
    if (k !== 1) liste.forEach((e) => {
      e.x *= k; e.y *= k; e.width *= k; e.height *= k;
      if (e.fontSize) e.fontSize *= k;
      if (e.strokeWidth && e.type !== "text") e.strokeWidth = Math.max(1, e.strokeWidth * Math.min(k, 2));
      if (e.points) e.points = e.points.map(([x, y]) => [x * k, y * k]);
    });
    liste.forEach((e) => { if (e.type === "text" && !e.containerId) mesurerLibre(e); });
    const libres = liste.filter((e) => !estLie(e));
    if (libres.length > 1) { const g = nouvelId(); libres.forEach((e) => { e.groupIds = [g]; }); }
    const b = boiteDe(libres), p = pointInsertion(b.w, b.h);
    liste.forEach((e) => { e.x += p.x - b.x; e.y += p.y - b.y; });
    elements.push(...liste);
    liste.forEach((e) => { if (estLie(e)) placerLie(e); });
    choisirOutil("selection");
    selection = new Set(libres.map((e) => e.id));
    fermerCreer();
    scene.focus({ preventScroll: true });
    memoriser(); majPanneau(); demander();
    dire(nom + " posé." + (liste.some((e) => e.type === "text") ? " Double-clic sur un texte pour l'écrire." : ""));
  }

  /* ── les modèles ──
     Des éléments ordinaires, posés d'un coup : un rectangle et son titre
     lié, des notes, des traits. Une fois posé, un modèle n'a plus rien de
     spécial — on le déplace, l'écrit, le défait comme le reste. */
  function cadre(x, y, w, h, o) {
    return nouvelElement("rectangle", x, y, Object.assign({
      width: w, height: h, strokeColor: OC.gray[3], backgroundColor: "transparent", fillStyle: "solid",
      strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, roundness: { type: 3 },
    }, o || {}));
  }
  function etiquette(c, texte, o) {
    const t = nouvelElement("text", c.x, c.y, Object.assign({
      text: texte, originalText: texte, fontSize: 20, fontFamily: etat.courant.fontFamily, textAlign: "center",
      verticalAlign: "middle", containerId: c.id, autoResize: true, lineHeight: 1.25, strokeColor: NOIR,
      backgroundColor: "transparent", roundness: null, opacity: 100,
    }, o || {}));
    c.boundElements = [{ type: "text", id: t.id }];
    return t;
  }
  function libre(x, y, texte, taille, o) {
    const t = nouvelElement("text", x, y, Object.assign({
      text: texte, originalText: texte, fontSize: taille, fontFamily: etat.courant.fontFamily, textAlign: "left",
      verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25, strokeColor: NOIR,
      backgroundColor: "transparent", roundness: null, opacity: 100,
    }, o || {}));
    mesurerLibre(t);
    return t;
  }
  function note(x, y, couleur, texte) {
    const n = cadre(x, y, 230, 110, { backgroundColor: couleur, strokeColor: "transparent", customData: { postit: true, taille: 22 } });
    return [n, etiquette(n, texte, { fontSize: 22 })];
  }
  function trait(x1, y1, x2, y2, o) {
    o = o || {};
    const el = nouvelElement(o.fleche ? "arrow" : "line", x1, y1, {
      points: [[0, 0], [x2 - x1, y2 - y1]], width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
      lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: null,
      endArrowhead: o.fleche ? "arrow" : null, strokeColor: o.couleur || OC.gray[4], strokeWidth: o.w || 2,
      strokeStyle: "solid", roughness: 0, backgroundColor: "transparent", roundness: null, opacity: 100,
    });
    if (o.fleche) el.elbowed = false; else el.polygon = false;
    return el;
  }
  const IC_MODELE = {
    kanban: '<rect x="2" y="3" width="5" height="14" rx="1"/><rect x="8" y="3" width="5" height="14" rx="1"/><rect x="14" y="3" width="4" height="14" rx="1"/><path d="M3 6h3M9 6h3"/>',
    swot: '<rect x="2.5" y="2.5" width="15" height="15" rx="1.5"/><path d="M10 2.5v15M2.5 10h15"/>',
    carte: '<ellipse cx="10" cy="10" rx="3.5" ry="2.2"/><rect x="1.5" y="2" width="4" height="3" rx=".8"/><rect x="14.5" y="2" width="4" height="3" rx=".8"/><rect x="1.5" y="15" width="4" height="3" rx=".8"/><rect x="14.5" y="15" width="4" height="3" rx=".8"/><path d="M5.5 4.5l2 3.5M14.5 4.5l-2 3.5M5.5 15.5l2-3.5M14.5 15.5l-2-3.5"/>',
    chrono: '<path d="M2 9h15M15 7l2 2-2 2M5 7.5v3M9.5 7.5v3M14 7.5v3"/><rect x="3" y="13" width="4" height="3" rx=".8"/><rect x="11.5" y="13" width="4" height="3" rx=".8"/>',
  };
  const MODELES = {
    kanban: ["Kanban", "trois colonnes, des notes à déplacer", () => {
      const out = [libre(0, -56, "Kanban", 32)];
      [["À faire", OC.gray[0]], ["En cours", OC.blue[0]], ["Fait", OC.green[0]]].forEach(([t, fond], i) => {
        const c = cadre(i * 290, 0, 270, 460, { backgroundColor: fond });
        out.push(c, etiquette(c, t, { fontSize: 22, verticalAlign: "top" }));
      });
      return out.concat(note(20, 64, POSTITS[0], "Une tâche"), note(20, 190, POSTITS[1], "Une autre"),
                        note(310, 64, POSTITS[3], "Commencée"));
    }],
    swot: ["SWOT", "forces, faiblesses, opportunités, menaces", () => {
      const out = [libre(0, -56, "Analyse SWOT", 32)];
      [["Forces", OC.green[1], 0, 0], ["Faiblesses", OC.red[1], 1, 0],
       ["Opportunités", OC.blue[1], 0, 1], ["Menaces", OC.yellow[1], 1, 1]].forEach(([t, fond, i, j]) => {
        const c = cadre(i * 350, j * 270, 340, 260, { backgroundColor: fond, strokeColor: "transparent" });
        out.push(c, etiquette(c, t, { fontSize: 24, verticalAlign: "top" }));
      });
      const gris = { strokeColor: OC.gray[3] };
      return out.concat(libre(-100, 118, "Interne", 18, gris), libre(-100, 388, "Externe", 18, gris),
                        libre(140, 540, "Positif", 18, gris), libre(490, 540, "Négatif", 18, gris));
    }],
    carte: ["Carte mentale", "un sujet au centre, quatre idées", () => {
      const cx = 380, cy = 230, rx = 120, ry = 60;
      const sujet = nouvelElement("ellipse", cx - rx, cy - ry, {
        width: rx * 2, height: ry * 2, backgroundColor: OC.violet[1], fillStyle: "solid", strokeColor: OC.violet[4],
        strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, roundness: null,
      });
      const out = [sujet, etiquette(sujet, "Sujet", { fontSize: 26 })];
      [[0, 0], [540, 0], [0, 370], [540, 370]].forEach(([x, y], i) => {
        const bx = x + 110, by = y + 45, d = Math.hypot(bx - cx, by - cy), ux = (bx - cx) / d, uy = (by - cy) / d;
        // d'un bord à l'autre, pas d'un centre à l'autre
        const te = 1 / Math.hypot(ux / rx, uy / ry), tb = Math.min(110 / Math.abs(ux || 1e-9), 45 / Math.abs(uy || 1e-9));
        out.push(trait(cx + ux * te, cy + uy * te, bx - ux * tb, by - uy * tb, { couleur: OC.violet[3] }));
        const b = cadre(x, y, 220, 90, { backgroundColor: OC.violet[0], strokeColor: OC.violet[3] });
        out.push(b, etiquette(b, "Idée " + (i + 1)));
      });
      return out;
    }],
    chrono: ["Chronologie", "une flèche du temps, quatre étapes", () => {
      const out = [libre(0, -70, "Chronologie", 32), trait(0, 60, 940, 60, { fleche: true, w: 3 })];
      for (let i = 0; i < 4; i++) {
        const x = 110 + i * 230;
        out.push(trait(x, 46, x, 74, { w: 3, couleur: OC.blue[4] }), libre(x - 26, 84, "Date", 18, { strokeColor: OC.blue[4] }));
        const e = cadre(x - 95, 130, 190, 84, { backgroundColor: OC.blue[0], strokeColor: OC.blue[2] });
        out.push(e, etiquette(e, "Étape " + (i + 1)));
      }
      return out;
    }],
  };
  function insererModele(nom) {
    const liste = MODELES[nom][2]();
    elements.push(...liste);
    liste.forEach((e) => { if (estLie(e)) placerLie(e); });
    const libres = liste.filter((e) => !estLie(e));
    const b = boiteDe(libres), c = versScene(toile.clientWidth / 2, toile.clientHeight / 2);
    const dx = c.x - (b.x + b.w / 2), dy = c.y - (b.y + b.h / 2);
    liste.forEach((e) => { e.x += dx; e.y += dy; });
    choisirOutil("selection");
    selection = new Set(libres.map((e) => e.id));
    fermerCreer();
    scene.focus({ preventScroll: true });
    // plus grand que la vue, barres flottantes comprises : on recule pour le voir
    // entier — la marge de 60 px est celle d'« Ajuster à l'écran ». Mesuré : un
    // Kanban de 516 px « tenait » dans 592 px, titre caché sous la barre du haut.
    if (b.w * etat.zoom > toile.clientWidth - 120 || b.h * etat.zoom > toile.clientHeight - 120) ajuster(libres);
    memoriser(); majPanneau(); demander();
    dire("Modèle « " + MODELES[nom][0] + " » posé. Double-clic sur un titre ou une note pour l'écrire.");
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
      el = nouvelElement(def.type, p.x, def.coude ? p.y : p.y + h / 2, {
        points: def.coude ? [[0, 0], [w / 2, 0], [w / 2, h], [w, h]] : [[0, 0], [w, 0]],
        lastCommittedPoint: null, startBinding: null, endBinding: null,
        startArrowhead: def.debut || null, endArrowhead: def.fin || null, width: w, height: def.coude ? h : 0,
        backgroundColor: "transparent",
      });
      if (def.type === "arrow") el.elbowed = false; else el.polygon = false;
      if (def.style) el.strokeStyle = def.style;
      if (def.epais) el.strokeWidth = def.epais;
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
  const estFleche = (id) => /^fleche-|^double-bloc$/.test(id);
  const boutonForme = (attr, id, t, def) => '<button type="button" class="tb-b tb-forme" ' + attr + '="' + id
    + '" title="' + t + '" aria-label="' + t + '">' + apercu(def) + "</button>";
  const boutonGab = (id, grand) => {
    const [nom, , dessin, mots] = GABARITS[id];
    const svg = '<svg viewBox="0 0 24 24" aria-hidden="true">' + dessin + "</svg>";
    return grand ? '<button type="button" class="tb-ic-ligne tb-gab" data-gabarit="' + id + '" data-mots="' + mots + '">' + svg + "<span>" + nom + "</span></button>"
                 : '<button type="button" class="tb-b tb-forme tb-gab" data-gabarit="' + id + '" data-mots="' + mots + '" title="' + nom + '" aria-label="' + nom + '">' + svg + "</button>";
  };
  const gabaritsDe = (fam) => Object.keys(GABARITS).filter((id) => GABARITS[id][1] === fam);
  $("#tb-formes").innerHTML = FORMES.filter(([id]) => !estFleche(id)).map(([id, t, def]) => boutonForme("data-forme", id, t, def)).join("")
    + gabaritsDe("general").map((id) => boutonGab(id, false)).join("");
  $("#tb-lignes").innerHTML = LIGNES.map(([id, t, def]) => boutonForme("data-ligne", id, t, def)).join("")
    + FORMES.filter(([id]) => estFleche(id)).map(([id, t, def]) => boutonForme("data-forme", id, t, def)).join("");
  for (const fam of ["flux", "mcd", "uml"]) $("#tb-" + fam).innerHTML = gabaritsDe(fam).map((id) => boutonGab(id, true)).join("");
  $("#tb-reactions").innerHTML = REACTIONS.map(([e, t]) => '<button type="button" class="tb-b tb-forme tb-reaction" data-reaction="'
    + e + '" title="' + t + '" aria-label="Réaction : ' + t + '">' + e + "</button>").join("");
  const icReseau = (r) => svgReseau(r).replace("<svg ", '<svg aria-hidden="true" ');
  $("#tb-reseau-n").textContent = RESEAU.length;
  $("#tb-reseau-tout").innerHTML = FAMILLES_RESEAU.map(([f, titre]) => '<div class="tb-famille"><p class="tb-famille-titre">' + titre + "</p>"
    + '<div class="tb-liste-ic">' + RESEAU.filter((r) => r[3] === f).map((r) => '<button type="button" class="tb-ic-ligne" data-reseau="' + r[0]
      + '" data-mots="' + r[4] + '">' + icReseau(r) + "<span>" + r[1] + "</span></button>").join("") + "</div></div>").join("");
  $("#tb-liens").innerHTML = LIENS.map(([id, nom, c, st, w]) => '<button type="button" class="tb-lien" data-lien="' + id + '" data-mots="cable lien ' + nom + '">'
    + '<svg viewBox="0 0 40 12" aria-hidden="true"><path d="' + (id === "serie" ? "M2 6h14l5-5-2 10 5-5h14" : "M2 6h36") + '" fill="none" stroke="' + c
    + '" stroke-width="' + Math.min(w, 3.5) + '" stroke-linecap="round"' + (st === "dashed" ? ' stroke-dasharray="6 4"' : st === "dotted" ? ' stroke-dasharray="0.1 4.5"' : "")
    + "/></svg><span>" + nom + "</span></button>").join("");

  /* Une recherche pour tout le panneau : on tape « routeur », « décision »,
     « classe », et seules les formes qui répondent restent, sections
     ouvertes. Effacer la recherche rend les sections dans l'état où on les
     avait laissées. */
  const sansAccent = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const SECTIONS_CLE = "ciel-tableau-sections-v1";
  const sections = $$("#tb-creer .tb-section");
  try {
    const ouvertes = JSON.parse(localStorage.getItem(SECTIONS_CLE) || "null");
    if (ouvertes) sections.forEach((s) => { s.open = ouvertes.includes(s.dataset.section); });
  } catch (e) { /* mémoire refusée : les sections gardent leur état d'origine */ }
  let avantRecherche = null;
  sections.forEach((s) => s.addEventListener("toggle", () => {
    // « toggle » arrive après coup : pendant une recherche, rien n'est retenu
    if (avantRecherche) return;
    try { localStorage.setItem(SECTIONS_CLE, JSON.stringify(sections.filter((x) => x.open).map((x) => x.dataset.section))); } catch (e) { /* rien */ }
  }));
  $("#tb-creer-f").addEventListener("input", (e) => {
    const mots = sansAccent(e.target.value.trim()).split(/\s+/).filter(Boolean);
    if (mots.length && !avantRecherche) avantRecherche = sections.map((s) => s.open);
    let total = 0;
    sections.forEach((s, i) => {
      let n = 0;
      s.querySelectorAll("button").forEach((b) => {
        const t = sansAccent((b.title || "") + " " + b.textContent + " " + (b.dataset.mots || "") + " " + s.querySelector("summary").textContent);
        b.hidden = mots.length > 0 && !mots.every((m) => t.includes(m));
        if (!b.hidden) n++;
      });
      s.querySelectorAll(".tb-famille").forEach((f) => { f.hidden = !f.querySelector("button:not([hidden])"); });
      s.hidden = mots.length > 0 && !n;
      if (mots.length) s.open = n > 0;
      else if (avantRecherche) s.open = avantRecherche[i];
      total += n;
    });
    if (!mots.length) avantRecherche = null;
    $("#tb-creer-rien").hidden = !mots.length || total > 0;
    $(".tb-creer-base").hidden = mots.length > 0;
  });
  $("#tb-modeles").innerHTML = Object.keys(MODELES).map((k) => '<button type="button" class="tb-carte tb-modele" data-modele="' + k
    + '"><span class="tb-carte-ic"><svg viewBox="0 0 20 20" aria-hidden="true">' + IC_MODELE[k] + "</svg></span><span>"
    + MODELES[k][0] + "<small>" + MODELES[k][1] + "</small></span></button>").join("");
  $("#tb-image-fichier").addEventListener("change", (e) => { insererImage(e.target.files[0]); e.target.value = ""; });
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
    if (b.dataset.creer === "image") { $("#tb-image-fichier").click(); return; }
    if (b.dataset.reaction) return insererReaction(b.dataset.reaction);
    if (b.dataset.modele) return insererModele(b.dataset.modele);
    if (b.dataset.reseau) return insererReseau(b.dataset.reseau);
    if (b.dataset.lien) return choisirLien(b.dataset.lien);
    if (b.dataset.gabarit) return insererGabarit(b.dataset.gabarit);
    if (b.dataset.forme) return insererForme(FORMES.find((f) => f[0] === b.dataset.forme)[2]);
    if (b.dataset.ligne) return insererForme(LIGNES.find((f) => f[0] === b.dataset.ligne)[2]);
  });

  /* ── la barre d'encrage ──
     Un clic prend le stylo ; un second clic sur le stylo déjà en main
     ouvre son réglage — couleur et calibre. */
  const reglage = $("#tb-reglage");
  /* L'icône d'un stylo dit sa POINTE : on reconnaît la plume, le crayon,
     le marqueur ou le pinceau sans lire. Tous écrivent vers le bas à
     gauche, comme l'icône d'origine. */
  const ICONES_POINTE = {
    "": '<path d="M5 15l1-3.5L13 4.5l2.5 2.5-7 7z"/><path d="M11.6 5.9l2.5 2.5"/>',
    plume: '<g transform="rotate(45 10 10)"><path d="M10 2.5c2.2 2 3.6 4.4 3.6 7L10 17.5l-3.6-8c0-2.6 1.4-5 3.6-7z"/>'
      + '<path d="M10 10.3v4.2"/><circle cx="10" cy="9" r="1.1" class="plein"/></g>',
    crayon: '<path d="M4.5 15.5l1.2-4.2L13.5 3.5l3 3-7.8 7.8z"/><path d="M5.7 11.3l3 3"/>'
      + '<path d="M4.5 15.5l.6-2.1 1.5 1.5z" class="plein"/><path d="M12 5l3 3"/>',
    marqueur: '<g transform="rotate(45 10 10)"><rect x="7" y="1.8" width="6" height="10.4" rx="1.2"/>'
      + '<path d="M7 5.2h6"/><path d="M7.6 12.2h4.8l-1 3h-2.8z"/><path d="M9.2 15.2l.4 2.4h.8l.4-2.4z" class="plein"/></g>',
    aquarelle: '<g transform="rotate(45 10 10)"><path d="M10 1.5v7"/><rect x="8.6" y="8.5" width="2.8" height="2.6" rx=".5"/>'
      + '<path d="M8.6 11.1c0 2.6-.6 4.6 1.4 7.4 2-2.8 1.4-4.8 1.4-7.4z" class="plein"/></g>',
    remplissage: '<path d="M4 9.5l5.5-5.5 6 6L10 15.5z"/><path d="M4 9.5h11.5"/>'
      + '<path d="M17 12.5c0 1.2-.7 2.2-1.5 2.2S14 13.7 14 12.5l1.5-2.6z" class="plein"/>',
  };
  ICONES_POINTE.monoligne = ICONES_POINTE[""];
  ICONES_POINTE.pastel = ICONES_POINTE.crayon;
  ICONES_POINTE.calame = ICONES_POINTE.plume;
  const nomStylo = (i) => {
    const v = etat.stylos[i].pointe || "";
    return (POINTES_NOMS.find(([p]) => p === v) || POINTES_NOMS[0])[1];
  };
  function majStylos() {
    $$("[data-stylo]").forEach((b) => {
      const i = Number(b.dataset.stylo), st = etat.stylos[i];
      const svg = b.querySelector("svg"), v = st.pointe || "";
      if (svg.dataset.pointe !== v) { svg.innerHTML = ICONES_POINTE[v] || ICONES_POINTE[""]; svg.dataset.pointe = v; }
      b.setAttribute("aria-label", nomStylo(i));
      b.title = nomStylo(i) + (i === 0 ? " (P ou 7)" : "") + " · recliquer pour le régler";
      b.querySelector("i").style.setProperty("--c", APERCUS[st.effet] || st.c);
      b.querySelector("i").style.setProperty("--w", Math.min(8, 2 + st.w * 1.3) + "px");
    });
    const s = $('.tb-encrage [data-outil="surligneur"] i');
    s.style.setProperty("--c", etat.courant.surligneur);
    s.style.setProperty("--w", "8px");
  }
  const EFFETS_NOMS = [["", "Aucun"], ["arcenciel", "Arc-en-ciel"], ["or", "Or"], ["neon", "Néon"]];
  const APERCUS = {
    arcenciel: "linear-gradient(90deg,#e03131,#f08c00,#f2c200,#2f9e44,#1c7ed6,#6741d9)",
    or: "linear-gradient(90deg,#8a6a12,#e2bd4f,#fff1a8,#d1a12a,#93700f)",
  };
  /* Les pointes, dans l'ordre du panneau. L'aperçu de chacune est tracé
     par le moteur de rendu lui-même, sur une même vague : ce qu'on voit
     dans le bouton est ce que le stylo dessinera. */
  const POINTES_NOMS = [["", "Stylo"], ["monoligne", "Monoligne"], ["marqueur", "Marqueur"],
    ["crayon", "Crayon"], ["pastel", "Pastel"], ["plume", "Stylo-plume"], ["calame", "Calame"],
    ["aquarelle", "Aquarelle"], ["remplissage", "Remplissage"]];
  const apercusPointe = {};
  function apercuPointe(v) {
    if (apercusPointe[v] != null) return apercusPointe[v];
    const vague = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      vague.push(v === "remplissage"
        ? [20 + 15 * Math.cos(t * 2 * Math.PI), 9 + 6 * Math.sin(t * 2 * Math.PI)]
        : [5 + t * 30, 9 - 5 * Math.sin(t * 2 * Math.PI)]);
    }
    const el = { type: "freedraw", points: vague, pressures: vague.map(() => 0.5), simulatePressure: false,
                 strokeWidth: 0.8, strokeColor: "#000", seed: 1, customData: v ? { pointe: v } : null };
    const op = MATIERES[v] ? MATIERES[v].svg : 1;
    apercusPointe[v] = '<svg viewBox="0 0 40 18" aria-hidden="true">' + R.chemins(el).map((o) =>
      '<path d="' + o.d + '" fill="currentColor" fill-opacity="' + op + '" stroke="none"/>').join("") + "</svg>";
    return apercusPointe[v];
  }
  const TAILLES_GOMME = [6, 12, 20, 32];
  const option = (opt, libelle) => '<button type="button" class="tb-option" data-ropt="' + opt
    + '" aria-pressed="' + !!etat[opt] + '">' + libelle + "</button>";
  /* Les réglages de la gomme et du lasso, en TUILES (demandé le 9 nov.
     2026 : la rangée de mots « Main levée Rectangle Ellipse Polygone » était
     laide et se lisait mal). Une tuile = un dessin de ce qu'elle fait et un
     mot court ; une seule ligne d'aide sous chaque groupe, qui change avec
     le choix, au lieu d'un paragraphe. */
  const TRAIT_TUILE = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + "</svg>";
  const POINTILLE = ' stroke-dasharray="2.6 2.2"';
  const IC_SELECTION = {
    libre: TRAIT_TUILE('<path' + POINTILLE + ' d="M8 5.5c5-2.5 11.5-.5 11.5 5s-4.5 8-9.5 8S3 15.5 3.8 11c.4-2.4 2.4-4 4.2-4.4"/>'),
    rectangle: TRAIT_TUILE('<rect' + POINTILLE + ' x="3.5" y="5.5" width="17" height="13" rx="1"/>'),
    ellipse: TRAIT_TUILE('<ellipse' + POINTILLE + ' cx="12" cy="12" rx="8.5" ry="6.5"/>'),
    polygone: TRAIT_TUILE('<path' + POINTILLE + ' d="M4.5 16.5 7.5 5.5l10.5 1.5 2 9.5-8.5 3z"/>'
      + '<g fill="currentColor" stroke="none"><circle cx="4.5" cy="16.5" r="1.4"/><circle cx="7.5" cy="5.5" r="1.4"/>'
      + '<circle cx="18" cy="7" r="1.4"/><circle cx="20" cy="16.5" r="1.4"/><circle cx="11.5" cy="19.5" r="1.4"/></g>'),
    entier: TRAIT_TUILE('<rect' + POINTILLE + ' x="2.5" y="4.5" width="12" height="15" rx="1"/>'
      + '<circle cx="14" cy="12" r="5" fill="currentColor" fill-opacity=".35"/>'),
    partie: TRAIT_TUILE('<rect' + POINTILLE + ' x="2.5" y="4.5" width="12" height="15" rx="1"/>'
      + '<path d="M14.5 7.1A5 5 0 0 1 14.5 16.9" opacity=".35"/><path d="M14.5 7.1a5 5 0 0 0 0 9.8z" fill="currentColor" fill-opacity=".35"/>'),
    sous: TRAIT_TUILE('<path d="M4 15c3-4 6-6 9-6s4 2 7 1" opacity=".35"/><circle cx="12" cy="11" r="4.5"/>'),
    objet: TRAIT_TUILE('<path d="M4 15c3-4 6-6 9-6s4 2 7 1" stroke-dasharray="1.5 2"/><path d="M6 8l12 9M18 8 6 17"/>'),
  };
  function tuiles(attr, choix, actuel) {
    return '<div class="tb-tuiles" style="--n:' + choix.length + '">' + choix.map(([v, t, ic]) =>
      '<button type="button" class="tb-tuile" data-' + attr + '="' + v + '" aria-pressed="' + (actuel === v) + '">'
      + (IC_SELECTION[ic || v] || "") + "<span>" + t + "</span></button>").join("") + "</div>";
  }
  function ouvrirReglageGomme() {
    const partie = etat.gommeMode === "partie";
    reglage.innerHTML = '<p class="tb-menu-titre">Gomme</p>'
      + tuiles("rg", [["partie", "Sous le rond", "sous"], ["objet", "Tout l'élément", "objet"]], etat.gommeMode)
      + '<p class="tb-indice">' + (partie
        ? "Efface ce qui passe sous le rond : encre, formes, images. Le texte reste."
        : "Efface en entier tout ce que la gomme touche. Échap avant de lâcher rend tout.") + "</p>"
      + (partie ? '<p class="tb-menu-titre">Taille</p><div class="tb-calibres">'
        + TAILLES_GOMME.map((t, i) => '<button type="button" class="tb-b tb-petit tb-calibre tb-calibre-gomme" data-rgt="' + t
          + '" aria-pressed="' + (t === etat.gommeTaille) + '" title="Taille ' + (i + 1) + '" aria-label="Taille ' + (i + 1)
          + '"><i style="--w:' + (6 + i * 4) + 'px"></i></button>').join("") + "</div>" : "");
    reglage.dataset.quoi = "gomme";
    reglage.hidden = false;
  }
  const LASSO_FORMES = [["libre", "Main levée"], ["rectangle", "Rectangle"], ["ellipse", "Ellipse"],
                        ["polygone", "Polygone"]];
  const AIDE_FORME = {
    libre: "Entourez à main levée.",
    rectangle: "Tirez d'un coin au coin opposé.",
    ellipse: "Tirez d'un coin au coin opposé.",
    polygone: "Un appui par coin ; retouchez le premier pour fermer.",
  };
  function ouvrirReglageLasso() {
    const partie = etat.lassoMode === "partie";
    reglage.innerHTML = '<p class="tb-menu-titre">Forme</p>'
      + tuiles("rf", LASSO_FORMES, etat.lassoForme || "libre")
      + '<p class="tb-indice">' + AIDE_FORME[etat.lassoForme || "libre"] + "</p>"
      + '<p class="tb-menu-titre">Ce qu\'il prend</p>'
      + tuiles("rl", [["entier", "Éléments entiers"], ["partie", "L'intérieur"]], etat.lassoMode)
      + '<p class="tb-indice">' + (partie
        ? "Coupe au bord : traits, formes et images sont découpés."
        : "Prend en entier ce qui est surtout dedans.") + "</p>";
    reglage.dataset.quoi = "lasso";
    reglage.hidden = false;
  }
  const LASER_DUREES = [[1.4, "1,4 s"], [3, "3 s"], [6, "6 s"], [10, "10 s"], ["relache", "Tant que j'appuie"]];
  const LASER_COULEURS = [["#ff2f2f", "Rouge"], ["#22c55e", "Vert"], ["#2f8cff", "Bleu"], ["#ffc61a", "Jaune"],
                          ["#c04dff", "Violet"], ["#ff7a1a", "Orange"]];
  const LASER_TAILLES = [3, 5, 8, 12];
  const LASER_OPACITES = [[1, "Opaque"], [0.7, "70 %"], [0.45, "45 %"], [0.25, "25 %"]];
  function ouvrirReglageLaser() {
    const bouton = (attr, v, texte, presse) => '<button type="button" class="tb-b tb-petit" data-' + attr + '="' + v
      + '" aria-pressed="' + presse + '">' + texte + "</button>";
    reglage.innerHTML = '<p class="tb-menu-titre">Laser : combien de temps il reste</p><div class="tb-choix tb-choix-laser">'
      + LASER_DUREES.map(([v, t]) => bouton("rld", v, t, String(etat.laserDuree) === String(v))).join("") + "</div>"
      + '<p class="tb-menu-titre">Couleur</p><div class="tb-pastilles">'
      + LASER_COULEURS.map(([c, t]) => '<button type="button" class="tb-pastille" data-rlc="' + c + '" style="--c:' + c
        + '" aria-pressed="' + (c === etat.laserCouleur) + '" title="' + t + '" aria-label="' + t + '"></button>').join("") + "</div>"
      + '<p class="tb-menu-titre">Épaisseur</p><div class="tb-calibres">'
      + LASER_TAILLES.map((w, i) => '<button type="button" class="tb-b tb-petit tb-calibre" data-rlt="' + w + '" aria-pressed="'
        + (w === etat.laserTaille) + '" title="Épaisseur ' + (i + 1) + '" aria-label="Épaisseur ' + (i + 1) + '"><i style="--w:'
        + (4 + i * 3) + 'px;--c:' + etat.laserCouleur + '"></i></button>').join("") + "</div>"
      + '<p class="tb-menu-titre">Transparence</p><div class="tb-choix tb-choix-laser">'
      + LASER_OPACITES.map(([v, t]) => bouton("rlo", v, t, Number(v) === Number(etat.laserOpacite))).join("") + "</div>"
      + '<p class="tb-note">Le laser montre sans écrire : il ne s\'enregistre pas et ne s\'exporte pas.</p>';
    reglage.dataset.quoi = "laser";
    reglage.hidden = false;
  }
  function ouvrirReglage(quoi) {
    if (quoi === "laser") return ouvrirReglageLaser();
    if (quoi === "gomme") return ouvrirReglageGomme();
    if (quoi === "lasso") return ouvrirReglageLasso();
    if (quoi === "baguette") return ouvrirReglageBaguette();
    const surl = quoi === "surligneur";
    const st = surl ? { c: etat.courant.surligneur, w: etat.courant.surligneurW } : etat.stylos[quoi];
    const couleurs = surl ? SURLIGNEURS.map((c) => [c, c]) : ENCRES;
    const calibres = surl ? [3, 4.5, 6, 8, 11, 15] : CALIBRES;
    reglage.innerHTML = '<p class="tb-menu-titre">' + (surl ? "Surligneur" : nomStylo(quoi)) + "</p>"
      + '<div class="tb-pastilles">' + couleurs.map(([c, t]) => '<button type="button" class="tb-pastille" data-rc="' + c
        + '" style="--c:' + c + '" aria-pressed="' + (c === st.c) + '" title="' + t + '" aria-label="' + t + '"></button>').join("") + "</div>"
      + (surl ? "" : '<p class="tb-menu-titre">Pointe</p><div class="tb-pointes">'
        + POINTES_NOMS.map(([v, t]) => '<button type="button" class="tb-b tb-petit tb-pointe" data-rpt="' + v
          + '" aria-pressed="' + ((st.pointe || "") === v) + '">' + apercuPointe(v) + "<span>" + t + "</span></button>").join("")
        + "</div>")
      + '<p class="tb-menu-titre">Épaisseur</p><div class="tb-calibres">'
      + calibres.map((w, i) => '<button type="button" class="tb-b tb-petit tb-calibre" data-rw="' + w + '" aria-pressed="'
        + (w === st.w) + '" title="Épaisseur ' + (i + 1) + '" aria-label="Épaisseur ' + (i + 1) + '"><i style="--w:'
        + Math.min(16, 2 + i * 2.4) + 'px;--c:' + st.c + '"></i></button>').join("") + "</div>"
      + (surl ? "" : '<p class="tb-menu-titre">Effet</p><div class="tb-effets">'
        + EFFETS_NOMS.map(([v, t]) => '<button type="button" class="tb-b tb-petit tb-effet" data-reff="' + v
          + '" aria-pressed="' + ((st.effet || "") === v) + '"><i style="--c:' + (APERCUS[v] || st.c)
          + '"' + (v === "neon" ? ' class="tb-neon"' : "") + "></i>" + t + "</button>").join("") + "</div>"
        + '<p class="tb-menu-titre">Pour tous les stylos</p><div class="tb-options">'
        + option("formes", "Formes automatiques") + option("styletSeul", "Le doigt fait défiler")
        + option("inclinaison", "Incliner le stylet élargit le trait") + "</div>");
    reglage.dataset.quoi = String(quoi);
    reglage.hidden = false;
  }
  reglage.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const q = reglage.dataset.quoi;
    if (q === "baguette") { cliquerReglageBaguette(b); return; }
    if (q === "laser") {
      if (b.dataset.rld) etat.laserDuree = b.dataset.rld === "relache" ? "relache" : Number(b.dataset.rld);
      if (b.dataset.rlc) etat.laserCouleur = b.dataset.rlc;
      if (b.dataset.rlt) etat.laserTaille = Number(b.dataset.rlt);
      if (b.dataset.rlo) etat.laserOpacite = Number(b.dataset.rlo);
      garder(); ouvrirReglageLaser();
      return;
    }
    if (q === "lasso") {
      if (b.dataset.rl) etat.lassoMode = b.dataset.rl;
      if (b.dataset.rf) { etat.lassoForme = b.dataset.rf; if (geste && geste.mode === "lasso") geste = null; }
      garder(); ouvrirReglageLasso(); demander();
      return;
    }
    if (q === "gomme") {
      if (b.dataset.rg) { etat.gommeMode = b.dataset.rg; etat.gommeChoisie = true; }
      if (b.dataset.rgt) etat.gommeTaille = Number(b.dataset.rgt);
      garder(); demander(); ouvrirReglageGomme();
      return;
    }
    const surl = q === "surligneur";
    if (b.dataset.rc) { if (surl) etat.courant.surligneur = b.dataset.rc; else etat.stylos[Number(q)].c = b.dataset.rc; }
    if (b.dataset.rw) { if (surl) etat.courant.surligneurW = Number(b.dataset.rw); else etat.stylos[Number(q)].w = Number(b.dataset.rw); }
    // une matière (crayon, pastel, marqueur, aquarelle) et un effet ne
    // vont pas ensemble : choisir l'un retire l'autre
    if (b.dataset.rpt !== undefined) {
      const s = etat.stylos[Number(q)];
      s.pointe = b.dataset.rpt || null;
      if (MATIERES[s.pointe]) s.effet = null;
    }
    if (b.dataset.reff !== undefined) {
      const s = etat.stylos[Number(q)];
      s.effet = b.dataset.reff || null;
      if (s.effet && MATIERES[s.pointe]) s.pointe = null;
    }
    if (b.dataset.ropt) { etat[b.dataset.ropt] = !etat[b.dataset.ropt]; majBascules(); }
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
    // un clic de baguette dans l'image OUVRE le réglage : ne pas le refermer aussitôt
    if (etat.outil === "baguette" && e.target === toile) return;
    if (!reglage.hidden && !reglage.contains(e.target) && !e.target.closest(".tb-stylo, .tb-encrage [data-outil]")) {
      reglage.hidden = true;
    }
  });
  /* ── la baguette magique ──
     Elle agit dans une IMAGE posée au tableau. Un clic prend la couleur du
     pixel touché et choisit la zone de couleur voisine (« zone touchée »),
     ou cette couleur partout dans l'image (« toute la couleur »), à une
     tolérance près. Maj + clic ajoute une zone. Puis : effacer la zone (le
     détourage d'un fond), ne garder qu'elle, la remplir de l'encre du
     stylo, l'inverser, ou l'extraire en nouvelle image.
     Le calcul se fait sur les pixels d'ORIGINE, pas sur l'écran. Chaque
     action fabrique un nouveau fichier : l'annulation retrouve l'image
     d'avant, qui reste dans le tableau.
     La tolérance est une fraction de la plus grande différence possible
     entre deux couleurs (rouge, vert, bleu et opacité) : 0 % ne prend que
     la couleur exacte, 100 % prend toute l'image. */
  const BAGUETTE = { tolerance: 30, mode: "contigu" };
  function imageSous(p) {
    const tol = 2 / etat.zoom;
    for (let i = elements.length - 1; i >= 0; i--) {
      const x = elements[i];
      if (x.type === "image" && R.touche(x, p.x, p.y, tol)) return x;
    }
    return null;
  }
  function versPixel(el, img, p) {
    const b = R.boite(el);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = -(el.angle || 0);
    let lx = cx + (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a) - el.x;
    let ly = cy + (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a) - el.y;
    const s = Array.isArray(el.scale) ? el.scale : [1, 1];
    if (s[0] < 0) lx = el.width - lx;
    if (s[1] < 0) ly = el.height - ly;
    return [Math.floor(lx / el.width * img.naturalWidth), Math.floor(ly / el.height * img.naturalHeight)];
  }
  function lirePixels(el, img) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return { id: el.id, fichier: el.fileId, w, h, px: g.getImageData(0, 0, w, h).data, clics: [], masque: null, voile: null };
  }
  // une zone : les pixels proches de la couleur touchée, voisins de proche
  // en proche (une pile, chaque pixel n'y entre qu'une fois), ou partout
  function zoneDe(B, u, v) {
    const { w, h, px } = B, n = w * h, zone = new Uint8Array(n);
    const j0 = (v * w + u) * 4, r0 = px[j0], g0 = px[j0 + 1], b0 = px[j0 + 2], a0 = px[j0 + 3];
    const t = BAGUETTE.tolerance / 100, lim = t * t * 4 * 255 * 255;
    const proche = (k) => {
      const j = k * 4;
      if (a0 === 0 && px[j + 3] === 0) return true;          // deux transparences se valent
      const dr = px[j] - r0, dg = px[j + 1] - g0, db = px[j + 2] - b0, da = px[j + 3] - a0;
      return dr * dr + dg * dg + db * db + da * da <= lim;
    };
    if (BAGUETTE.mode === "partout") {
      for (let k = 0; k < n; k++) if (proche(k)) zone[k] = 1;
      return zone;
    }
    const pile = new Int32Array(n);
    let sp = 0;
    zone[v * w + u] = 1; pile[sp++] = v * w + u;
    while (sp) {
      const k = pile[--sp], x = k % w, y = (k - x) / w;
      if (x > 0 && !zone[k - 1] && proche(k - 1)) { zone[k - 1] = 1; pile[sp++] = k - 1; }
      if (x < w - 1 && !zone[k + 1] && proche(k + 1)) { zone[k + 1] = 1; pile[sp++] = k + 1; }
      if (y > 0 && !zone[k - w] && proche(k - w)) { zone[k - w] = 1; pile[sp++] = k - w; }
      if (y < h - 1 && !zone[k + w] && proche(k + w)) { zone[k + w] = 1; pile[sp++] = k + w; }
    }
    return zone;
  }
  function recalculerBaguette() {
    const B = baguette;
    B.masque = null;
    for (const [u, v] of B.clics) {
      const z = zoneDe(B, u, v);
      if (!B.masque) B.masque = z; else for (let k = 0; k < z.length; k++) B.masque[k] |= z[k];
    }
    B.voile = B.masque ? voileDe(B) : null;
    demander();
  }
  /* Le voile : la zone teintée, et son bord en pointillés noirs et blancs.
     Le bord est épaissi à environ 1,5 pixel d'ÉCRAN : une image réduite à
     l'affichage ferait disparaître un bord d'un seul pixel d'image. On le
     trouve en deux passes (lignes puis colonnes) : un pixel choisi est au
     bord s'il a un pixel non choisi à moins de « r » de lui. */
  function voileDe(B) {
    const { w, h, masque } = B, el = parId(B.id);
    const r = el ? Math.max(1, Math.round(1.5 * w / Math.max(1, el.width * etat.zoom))) : 1;
    const hors = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let dernier = -1e9;
      for (let x = 0; x < w; x++) { if (!masque[y * w + x]) dernier = x; if (x - dernier <= r) hors[y * w + x] = 1; }
      dernier = 1e9;
      for (let x = w - 1; x >= 0; x--) { if (!masque[y * w + x]) dernier = x; if (dernier - x <= r) hors[y * w + x] = 1; }
    }
    const pres = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) {
      let dernier = -1e9;
      for (let y = 0; y < h; y++) { if (hors[y * w + x]) dernier = y; if (y - dernier <= r) pres[y * w + x] = 1; }
      dernier = 1e9;
      for (let y = h - 1; y >= 0; y--) { if (hors[y * w + x]) dernier = y; if (dernier - y <= r) pres[y * w + x] = 1; }
    }
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d"), im = g.createImageData(w, h), d = im.data;
    const pas = Math.max(2, r * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (!masque[k]) continue;
        const j = k * 4;
        const bord = pres[k] || x < r || y < r || x >= w - r || y >= h - r;
        if (bord) { const c = Math.floor((x + y) / pas) % 2 ? 255 : 0; d[j] = d[j + 1] = d[j + 2] = c; d[j + 3] = 255; }
        else { d[j] = 28; d[j + 1] = 126; d[j + 2] = 214; d[j + 3] = 90; }
      }
    }
    g.putImageData(im, 0, 0);
    return cv;
  }
  function dessinerVoile() {
    const el = parId(baguette.id);
    if (!el || el.fileId !== baguette.fichier) return;
    ctx.save();
    const b = R.boite(el);
    if (el.angle) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy);
    }
    ctx.translate(el.x, el.y);
    const s = Array.isArray(el.scale) ? el.scale : [1, 1];
    if (s[0] < 0 || s[1] < 0) {
      ctx.translate(s[0] < 0 ? el.width : 0, s[1] < 0 ? el.height : 0);
      ctx.scale(s[0] < 0 ? -1 : 1, s[1] < 0 ? -1 : 1);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(baguette.voile, 0, 0, el.width, el.height);
    ctx.restore();
  }
  function clicBaguette(e, p) {
    const el = imageSous(p);
    if (!el) { dire("La baguette agit dans une image : clique sur une couleur de l'image.", true); return; }
    const img = imageDe(el.fileId);
    if (!img || !img.complete || !img.naturalWidth) { dire("L'image n'est pas encore chargée.", true); return; }
    const [u, v] = versPixel(el, img, p);
    if (u < 0 || v < 0 || u >= img.naturalWidth || v >= img.naturalHeight) return;
    if (!baguette || baguette.id !== el.id || baguette.fichier !== el.fileId) baguette = lirePixels(el, img);
    if (!e.shiftKey) baguette.clics = [];
    baguette.clics.push([u, v]);
    recalculerBaguette();
    ouvrirReglageBaguette();
  }
  function ouvrirReglageBaguette() {
    const B = baguette && baguette.masque ? baguette : null;
    let n = 0;
    if (B) for (let k = 0; k < B.masque.length; k++) n += B.masque[k];
    const part = B ? Math.round(n / B.masque.length * 1000) / 10 : 0;
    const bouton = (a, t) => '<button type="button" class="tb-b tb-petit tb-effet" data-rb="' + a + '"'
      + (B ? "" : " disabled") + ">" + t + "</button>";
    reglage.innerHTML = '<p class="tb-menu-titre">Baguette magique</p>'
      + '<div class="tb-choix">' + [["contigu", "Zone touchée"], ["partout", "Toute la couleur"]].map(([v, t]) =>
        '<button type="button" class="tb-b tb-petit" data-rbm="' + v + '" aria-pressed="' + (BAGUETTE.mode === v) + '">' + t + "</button>").join("")
      + "</div>"
      + '<p class="tb-menu-titre">Tolérance : <span id="tb-bg-val">' + BAGUETTE.tolerance + ' %</span></p>'
      + '<input type="range" class="tb-tolerance" id="tb-bg-tol" min="0" max="100" step="1" value="' + BAGUETTE.tolerance
      + '" aria-label="Tolérance de la baguette">'
      + '<p class="tb-menu-titre">' + (B ? "La zone : " + String(part).replace(".", ",") + " % de l'image" : "Aucune zone") + "</p>"
      + '<div class="tb-effets">' + bouton("effacer", "Effacer la zone") + bouton("garder", "Garder la zone")
      + bouton("remplir", "Remplir (encre)") + bouton("extraire", "Extraire en image")
      + bouton("inverser", "Inverser") + "</div>"
      + '<p class="tb-note">Clique une couleur dans une image. Maj + clic ajoute une zone, Échap annule. '
      + "Chaque action se défait (Cmd ou Ctrl + Z).</p>";
    reglage.dataset.quoi = "baguette";
    reglage.hidden = false;
  }
  function cliquerReglageBaguette(b) {
    if (b.dataset.rbm) {
      BAGUETTE.mode = b.dataset.rbm;
      if (baguette && baguette.clics.length) recalculerBaguette();
      ouvrirReglageBaguette();
      return;
    }
    if (b.dataset.rb) appliquerBaguette(b.dataset.rb);
  }
  reglage.addEventListener("input", (e) => {
    if (e.target.id !== "tb-bg-tol") return;
    BAGUETTE.tolerance = Number(e.target.value);
    $("#tb-bg-val").textContent = BAGUETTE.tolerance + " %";
    clearTimeout(reglage.attente);
    reglage.attente = setTimeout(() => {
      if (baguette && baguette.clics.length) { recalculerBaguette(); ouvrirReglageBaguette(); $("#tb-bg-tol").focus(); }
    }, 120);
  });
  function enFichier(px, w, h) {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    cv.getContext("2d").putImageData(new ImageData(px, w, h), 0, 0);
    return enFichierToile(cv);
  }
  function enFichierToile(cv) {
    // PNG, pour garder la transparence ; WebP s'il est plus léger
    let data = cv.toDataURL("image/png"), type = "image/png";
    if (data.length > 400000) {
      const w2 = cv.toDataURL("image/webp", 0.92);
      if (w2.startsWith("data:image/webp") && w2.length < data.length) { data = w2; type = "image/webp"; }
    }
    const id = empreinte(data);
    if (!fichiers[id]) fichiers[id] = { id, mimeType: type, dataURL: data, created: Date.now() };
    return id;
  }
  function appliquerBaguette(action) {
    const B = baguette, el = B && parId(B.id);
    if (!el || !B.masque) return;
    const { w, h, px, masque } = B, n = w * h;
    if (action === "inverser") {
      for (let k = 0; k < n; k++) masque[k] ^= 1;
      B.voile = voileDe(B);
      ouvrirReglageBaguette(); demander();
      return;
    }
    const out = new Uint8ClampedArray(px);
    if (action === "effacer") for (let k = 0; k < n; k++) { if (masque[k]) out[k * 4 + 3] = 0; }
    if (action === "garder" || action === "extraire") for (let k = 0; k < n; k++) { if (!masque[k]) out[k * 4 + 3] = 0; }
    if (action === "remplir") {
      const c = document.createElement("canvas").getContext("2d");
      c.fillStyle = etat.stylos[etat.stylo].c; c.fillRect(0, 0, 1, 1);
      const [r, g, bl] = c.getImageData(0, 0, 1, 1).data;
      for (let k = 0; k < n; k++) if (masque[k]) { const j = k * 4; out[j] = r; out[j + 1] = g; out[j + 2] = bl; out[j + 3] = 255; }
    }
    if (action === "extraire") {
      // la zone seule, recadrée sur ce qu'elle occupe, posée à droite de l'image
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (masque[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1, morceau = new Uint8ClampedArray(cw * ch * 4);
      for (let y = 0; y < ch; y++) morceau.set(out.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * cw * 4);
      const id = enFichier(morceau, cw, ch), k = el.width / w;
      inserer(nouvelElement("image", el.x + el.width + 24 / etat.zoom, el.y + y0 * k, {
        width: cw * k, height: ch * k, fileId: id, status: "saved", scale: [1, 1], crop: null,
        strokeColor: "transparent", backgroundColor: "transparent", roundness: null, opacity: 100 }));
      baguette = null; reglage.hidden = true;
      dire("Zone extraite en nouvelle image, à droite de l'originale.");
      demander();
      return;
    }
    el.fileId = enFichier(out, w, h);
    toucher(el);
    baguette = null; reglage.hidden = true;
    memoriser(); demander();
    dire({ effacer: "Zone effacée : elle est devenue transparente.", garder: "Seule la zone est gardée.",
           remplir: "Zone remplie de l'encre du stylo." }[action] + " Cmd ou Ctrl + Z pour revenir.");
  }

  const bEncre = $("#tb-encre-b");
  function majEncre() {
    $("#tb-encrage").hidden = !etat.encre;
    bEncre.setAttribute("aria-pressed", String(etat.encre));
  }
  bEncre.addEventListener("click", () => {
    etat.encre = !etat.encre;
    if (!etat.encre && OUTILS_ENCRE.includes(etat.outil)) choisirOutil("selection");
    majEncre(); garder();
  });

  /* ── la barre d'actions de la sélection ── */
  const contexte = $("#tb-contexte");
  const menuTourner = $("#tb-tourner");
  function fermerTourner() {
    menuTourner.hidden = true;
    $('[data-ctx="tourner"]').setAttribute("aria-expanded", "false");
  }
  document.addEventListener("pointerdown", (e) => {
    if (!menuTourner.hidden && !contexte.contains(e.target)) fermerTourner();
  });
  function placerContexte() {
    const sel = selectionnes();
    if (!sel.length || geste || edition) { contexte.hidden = true; fermerTourner(); return; }
    const b = boiteVue(sel);
    const a = versEcran(b.x, b.y), z = versEcran(b.x + b.w, b.y + b.h);
    contexte.hidden = false;
    $('[data-ctx="lire"]').hidden = !traitsLisibles().length;
    const bw = contexte.offsetWidth, bh = contexte.offsetHeight;
    const W = scene.clientWidth, H = scene.clientHeight;
    let y = a.y - bh - 18;
    // dessous, elle laisse la place de la poignée ronde
    if (y < 52) y = z.y + 54;
    if (y + bh > H - 52) y = Math.max(52, Math.min(H - bh - 52, a.y + 8));
    const x = Math.max(8, Math.min(W - bw - 8, (a.x + z.x) / 2 - bw / 2));
    contexte.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
    $('[data-ctx="format"]').setAttribute("aria-pressed", String(etat.format));
  }
  contexte.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const a = b.dataset.ctx;
    if (a === "lire") { lireSelection(); return; }
    if (a === "tourner") {
      const ouvrir = menuTourner.hidden;
      menuTourner.hidden = !ouvrir;
      b.setAttribute("aria-expanded", String(ouvrir));
      if (ouvrir) {
        // le menu s'ouvre vers le bas, ou vers le haut s'il n'a pas la place
        menuTourner.classList.remove("tb-en-haut");
        const r = menuTourner.getBoundingClientRect(), s = scene.getBoundingClientRect();
        if (r.bottom > s.bottom - 8) menuTourner.classList.add("tb-en-haut");
      }
      return;
    }
    if (b.dataset.tourne) { transformerSelection(b.dataset.tourne); return; }
    if (a === "format") { etat.format = !etat.format; majPanneau(); demander(); }
    else if (a === "copier") copier(false);
    else if (a === "dupliquer") dupliquer();
    else if (a === "devant" || a === "fond") empiler(a);
    else if (a === "supprimer") supprimerSelection();
    scene.focus({ preventScroll: true });
  });

  /* ── lire l'écriture ──
     Chiffres et symboles écrits à la main deviennent du texte. La lecture
     se fait ICI, sans rien envoyer : « stylet.js » compare les traits à
     des modèles. Corriger un caractère mal lu, c'est apprendre — le
     symbole corrigé rejoint les modèles, dans ce navigateur seulement. */
  const APPRIS_CLE = "ciel-tableau-ecriture-v1";
  const lecture = $("#tb-lecture"), champLu = $("#tb-lu");
  let lu = null;
  function appris() {
    try {
      const t = JSON.parse(localStorage.getItem(APPRIS_CLE) || "[]");
      return Array.isArray(t) ? t.map((m) => ({ car: m.c, pts: m.p.map(([x, y, id]) => ({ x, y, id })),
                                                aspect: m.a, ferme: m.f, n: m.n })) : [];
    } catch (e) { return []; }
  }
  function retenir(nouveaux) {
    try {
      const t = JSON.parse(localStorage.getItem(APPRIS_CLE) || "[]");
      // le nuage, et l'allure qu'il ne dit pas : proportion, fermeture, nombre de traits
      nouveaux.forEach(({ car, traits }) => {
        const s = S.signature(traits);
        t.push({ c: car, p: s.pts.map((q) => [+q.x.toFixed(3), +q.y.toFixed(3), q.id]),
                 a: +s.aspect.toFixed(3), f: s.ferme, n: s.n });
      });
      localStorage.setItem(APPRIS_CLE, JSON.stringify(t.slice(-400)));
    } catch (e) { /* stockage refusé : la lecture marche, elle n'apprend pas */ }
  }
  function traitsLisibles() { return selectionnes().filter((el) => el.type === "freedraw" && !estSurligneur(el)); }
  function lireSelection() {
    const T = traitsLisibles();
    if (!T.length) return;
    const modeles = appris();
    lu = Object.assign(S.lireEcriture(T.map(absolus), modeles), { T });
    champLu.value = lu.texte;
    champLu.rows = Math.min(4, lu.texte.split("\n").length);
    $("#tb-lu-note").textContent = "Un caractère mal lu ? Corrigez-le : le tableau retient votre écriture"
      + (modeles.length ? " (" + modeles.length + " modèle" + (modeles.length > 1 ? "s" : "") + " appris)." : ".");
    $('[data-lu="oublier"]').hidden = !modeles.length;
    lecture.hidden = false;
    placerLecture();
    champLu.focus(); champLu.select();
  }
  function placerLecture() {
    if (lecture.hidden || !lu) return;
    const b = boiteDe(lu.T);
    const bas = versEcran(b.x, b.y + b.h), haut = versEcran(b.x + b.w, b.y);
    const W = scene.clientWidth, H = scene.clientHeight, lw = lecture.offsetWidth, lh = lecture.offsetHeight;
    let y = bas.y + 14;
    if (y + lh > H - 10) y = Math.max(10, haut.y - lh - 60);
    const x = Math.max(8, Math.min(W - lw - 8, (bas.x + haut.x) / 2 - lw / 2));
    lecture.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
  }
  function fermerLecture() { lecture.hidden = true; lu = null; scene.focus({ preventScroll: true }); }
  function validerLecture() {
    if (!lu) return;
    const texte = champLu.value.replace(/\s+$/, "");
    if (!texte.trim()) { fermerLecture(); return; }
    // chaque caractère retrouve son symbole : alors seulement on apprend
    const purs = Array.from(texte.replace(/\s/g, ""));
    let n = 0;
    if (purs.length === lu.symboles.length) {
      const neufs = lu.symboles.map((s, i) => ({ car: purs[i], traits: s.traits, avant: s.car }))
        .filter((s) => s.car !== s.avant);
      n = neufs.length;
      if (n) retenir(neufs);
    }
    const b = boiteDe(lu.T);
    const H = lu.lignes.reduce((s, l) => s + (l.y1 - l.y0), 0) / lu.lignes.length;
    const el = nouvelElement("text", b.x, b.y, {
      text: texte, originalText: texte, fontSize: Math.max(10, Math.round(H / 0.8)),
      fontFamily: etat.courant.fontFamily, textAlign: "left", verticalAlign: "top", containerId: null,
      autoResize: true, lineHeight: 1.25, backgroundColor: "transparent", roundness: null,
      strokeColor: lu.T[0].strokeColor,
    });
    mesurerLibre(el);
    retirer(lu.T.map((x) => x.id));
    elements.push(el);
    selection = new Set([el.id]);
    memoriser();
    dire("Écriture remplacée par du texte" + (n ? " · " + n + " symbole" + (n > 1 ? "s" : "") + " appris" : "")
      + ". Ctrl + Z pour revenir.");
    fermerLecture(); majPanneau(); demander();
  }
  lecture.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.lu === "ok") validerLecture();
    else if (b.dataset.lu === "annuler") fermerLecture();
    else if (b.dataset.lu === "oublier") {
      try { localStorage.removeItem(APPRIS_CLE); } catch (x) { /* rien à oublier */ }
      dire("Écriture oubliée : la lecture repart des modèles de base.");
      fermerLecture();
    }
  });
  champLu.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); fermerLecture(); }
    else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); validerLecture(); }
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
  majZoom(); majFond(); majStylos(); majEncre(); majCote(); majBascules(); choisirOutil("selection");
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { replacerLies(); demander(); });
  /* Un point d'entrée pour la vérification automatique : la scène lue
     et écrite telle qu'elle est, sans passer par la souris. */
  window.CIEL_TABLEAU = { scene: () => sceneJSON(), ouvrir: (t) => ouvrirTexte(t, "test"), etat: () => etat,
                          selection: (ids) => { selection = new Set(ids); majPanneau(); demander(); } };
})();
