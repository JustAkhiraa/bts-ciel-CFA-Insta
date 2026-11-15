/* Le nuancier du tableau : choisir n'importe quelle couleur.

   Demandé le 15 nov. 2026 : « le meilleur sélecteur de couleur au monde,
   niveau ergonomie et choix ». Avant, la couleur libre ouvrait le nuancier
   du navigateur : une petite fenêtre qui change d'un navigateur à l'autre,
   sans nuances, sans couleurs gardées, et mal commode au doigt.

   Ce qu'il offre, dans l'ordre où l'œil le lit :
   - Avant / Après : la couleur de départ reste à côté de la nouvelle, et la
     toucher y revient. On ose essayer, puisqu'on peut revenir.
   - Un code ou un NOM : « #3b5bdb », « 3b5bdb », « f0a », « rouge »,
     « bleu ciel », « 120, 30, 200 », « hsl(210 60% 40%) », et dans le
     navigateur tous les noms de couleur du web.
   - La pipette d'écran, là où le navigateur la permet.
   - Une grande zone (saturation, luminosité) et une barre des teintes, au
     doigt, au stylet, à la souris, ou aux flèches du clavier.
   - Les valeurs, en Rouge Vert Bleu ou en Teinte Saturation Luminosité.
   - Nuances : la même teinte, du plus clair au plus foncé.
   - Accords : les teintes qui vont avec (voisines, complémentaire, triade).
   - Mes couleurs : celles qu'on garde, d'un tableau à l'autre.

   La couleur change EN DIRECT pendant le geste ; elle n'est « retenue »
   (couleurs récentes, historique) qu'au lâcher. Au téléphone, le nuancier
   monte du bas de l'écran, sous le pouce ; ailleurs, il s'ouvre à côté de
   la pastille qui l'a appelé.

   Deux parties : le CALCUL des couleurs, pur, éprouvé sous node par
   « tests/nuancier.test.js », puis la fenêtre. Aucune dépendance. */
(function (racine) {
  "use strict";

  /* ═══ 1. Le calcul ═══════════════════════════════════════════════════ */

  const borne = (x, a, b) => Math.min(b, Math.max(a, x));

  // « #rrggbb » → [r, v, b] de 0 à 255, ou null
  function versRvb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function versHex(r, v, b) {
    return "#" + [r, v, b].map((x) => borne(Math.round(x), 0, 255).toString(16).padStart(2, "0")).join("");
  }
  function teinteDe(r, v, b, M, d) {
    if (!d) return 0;
    let h = M === r ? ((v - b) / d) % 6 : M === v ? (b - r) / d + 2 : (r - v) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  }
  // teinte 0-360, saturation et valeur 0-1 (la zone du nuancier)
  function rvbVersTsv(r, v, b) {
    r /= 255; v /= 255; b /= 255;
    const M = Math.max(r, v, b), d = M - Math.min(r, v, b);
    return [teinteDe(r, v, b, M, d), M ? d / M : 0, M];
  }
  function tsvVersRvb(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5) * 255, f(3) * 255, f(1) * 255];
  }
  // teinte 0-360, saturation et luminosité 0-1 (les valeurs « TSL »)
  function rvbVersTsl(r, v, b) {
    r /= 255; v /= 255; b /= 255;
    const M = Math.max(r, v, b), m = Math.min(r, v, b), d = M - m, l = (M + m) / 2;
    return [teinteDe(r, v, b, M, d), d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
  }
  function tslVersRvb(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }
  // luminance relative, pour savoir si un repère doit être clair ou foncé
  function luminance(hex) {
    const c = versRvb(hex);
    if (!c) return 0;
    const [r, v, b] = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * v + 0.0722 * b;
  }

  /* Les noms qu'on tape sans réfléchir. Les accents et les majuscules ne
     comptent pas : « Bleu Ciel » vaut « bleu ciel ». Les teintes sont
     celles de la palette du tableau, pour que « rouge » donne le rouge des
     encres, pas un rouge d'écran criard. */
  const NOMS = {
    noir: "#1e1e1e", blanc: "#ffffff", gris: "#868e96", "gris clair": "#ced4da", "gris fonce": "#495057",
    rouge: "#e03131", bordeaux: "#862e2e", corail: "#ff6b6b", saumon: "#ffa8a8", rose: "#e64980",
    "rose pale": "#fcc2d7", fuchsia: "#d6336c", framboise: "#c2255c", prune: "#862e9c", violet: "#7048e8",
    lavande: "#b197fc", mauve: "#9775fa", indigo: "#4263eb", bleu: "#1971c2", "bleu ciel": "#74c0fc",
    ciel: "#74c0fc", "bleu marine": "#1c2e6e", marine: "#1c2e6e", "bleu clair": "#a5d8ff", "bleu fonce": "#1864ab",
    cyan: "#15aabf", turquoise: "#12b886", menthe: "#63e6be", vert: "#2f9e44", "vert clair": "#8ce99a",
    "vert fonce": "#2b8a3e", "vert sapin": "#1b5e3b", olive: "#808000", kaki: "#8a8a4a", citron: "#ffe066",
    jaune: "#fcc419", or: "#d4a017", moutarde: "#e0a800", orange: "#f76707", abricot: "#ffc078",
    marron: "#8b5a2b", chocolat: "#5a3825", beige: "#f5e6c8", sable: "#e2c799", creme: "#fff8e7",
    argent: "#c0c0c0",
  };
  const sansAccent = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

  /* Lire ce que l'on tape. « normaliserCss », donné par la page, reconnaît
     en plus tous les noms et notations du web ; sous node, il manque, et
     ces noms-là sont simplement refusés. */
  function lire(texte, normaliserCss) {
    const t = String(texte == null ? "" : texte).trim().toLowerCase().replace(/\s+/g, " ");
    if (!t) return null;
    const nom = NOMS[sansAccent(t)];
    if (nom) return nom;
    let m = /^#?([0-9a-f]{3})$/.exec(t);
    if (m) return "#" + m[1].split("").map((c) => c + c).join("");
    m = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(t);
    if (m) return "#" + m[1];
    // « 120, 30, 200 » ou « 120 30 200 » : du rouge, du vert, du bleu
    m = /^(?:rgba?\()?\s*(\d{1,3})\s*[,; ]\s*(\d{1,3})\s*[,; ]\s*(\d{1,3})(?:\s*[,;/ ]\s*[\d.]+%?)?\s*\)?$/.exec(t);
    if (m && [m[1], m[2], m[3]].every((x) => Number(x) <= 255)) return versHex(+m[1], +m[2], +m[3]);
    m = /^hsla?\(\s*(-?[\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/.exec(t);
    if (m) {
      const h = ((Number(m[1]) % 360) + 360) % 360;
      return versHex(...tslVersRvb(h, borne(m[2] / 100, 0, 1), borne(m[3] / 100, 0, 1)));
    }
    return normaliserCss ? normaliserCss(t) : null;
  }

  /* Nuances : la même teinte et la même saturation, sept luminosités, du
     presque blanc au presque noir. Un gris donne des gris. */
  const PALIERS = [0.93, 0.82, 0.68, 0.54, 0.41, 0.29, 0.17];
  function nuances(hex) {
    const c = versRvb(hex);
    if (!c) return [];
    const [h, s] = rvbVersTsl(...c);
    return PALIERS.map((l) => versHex(...tslVersRvb(h, s, l)));
  }

  /* Accords : les teintes qui vont avec, à la même saturation et la même
     valeur. Un gris, même teinté, ou un presque noir n'a pas de vraie
     teinte : ses accords seraient d'autres gris. Il n'en a donc pas. */
  const ACCORDS = [[-30, "Voisine"], [30, "Voisine"], [150, "Complémentaire proche"], [180, "Complémentaire"],
                   [210, "Complémentaire proche"], [120, "Triade"], [240, "Triade"]];
  function accords(hex) {
    const c = versRvb(hex);
    if (!c) return [];
    const [h, s, v] = rvbVersTsv(...c);
    if (s < 0.15 || v < 0.1) return [];
    return ACCORDS.map(([dh, nom]) => [versHex(...tsvVersRvb((h + dh + 360) % 360, s, v)), nom]);
  }

  const CALCUL = { versRvb, versHex, rvbVersTsv, tsvVersRvb, rvbVersTsl, tslVersRvb, luminance, lire, nuances, accords, NOMS };

  if (typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) module.exports = CALCUL;
    return;
  }

  /* ═══ 2. La fenêtre ══════════════════════════════════════════════════ */

  // Le navigateur sait lire tous les noms du web : on le lui demande, avec
  // deux valeurs témoins pour reconnaître un refus.
  let toileCss = null;
  function cssVersHex(t) {
    try {
      toileCss = toileCss || document.createElement("canvas").getContext("2d");
      toileCss.fillStyle = "#010203"; toileCss.fillStyle = t; const a = toileCss.fillStyle;
      toileCss.fillStyle = "#040506"; toileCss.fillStyle = t; const b = toileCss.fillStyle;
      if (a !== b) return null;
      if (/^#[0-9a-f]{6}$/i.test(a)) return a.toLowerCase();
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(a);
      return m ? versHex(+m[1], +m[2], +m[3]) : null;
    } catch (e) { return null; }
  }

  const FAVORIS_MAX = 14;
  const SVG_PIPETTE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13.5 3.5l3 3-2 2-3-3zM11.5 5.5l3 3-7 7H4.5v-3z"/></svg>';
  const SVG_OK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>';
  const ech = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let el = null;          // la fenêtre, bâtie une fois
  let o = null;           // les réglages de l'ouverture en cours
  let h = 0, s = 0, v = 0; // la couleur, gardée en TSV : la teinte survit au gris
  let avant = "#000000";
  let mode = "rvb";
  const coupleTelephone = typeof matchMedia === "function" ? matchMedia("(max-width: 560px)") : null;

  const hexActuel = () => versHex(...tsvVersRvb(h, s, v));
  const q = (sel) => el.querySelector(sel);

  function batir() {
    el = document.createElement("div");
    el.className = "nc";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Couleur libre");
    el.innerHTML =
      '<div class="nc-poignee" aria-hidden="true"></div>'
      + '<div class="nc-tete">'
      +   '<div class="nc-apercu">'
      +     '<button type="button" class="nc-avant" title="Revenir à la couleur d\'avant" aria-label="Revenir à la couleur d\'avant"></button>'
      +     '<span class="nc-apres" title="La nouvelle couleur"></span>'
      +   "</div>"
      +   '<input type="text" class="nc-code" spellcheck="false" autocomplete="off" autocapitalize="off" enterkeyhint="done"'
      +     ' aria-label="Code ou nom de la couleur" placeholder="#3b5bdb, rouge…">'
      +   '<button type="button" class="nc-b nc-pipette" title="Prendre une couleur n\'importe où à l\'écran" aria-label="Pipette : prendre une couleur à l\'écran" hidden>' + SVG_PIPETTE + "</button>"
      +   '<button type="button" class="nc-b nc-ok" title="Fermer (Échap)" aria-label="Fermer le nuancier">' + SVG_OK + "</button>"
      + "</div>"
      + '<p class="nc-erreur" aria-live="polite"></p>'
      + '<div class="nc-zone" role="slider" tabindex="0" aria-label="Saturation et luminosité : flèches pour régler">'
      +   '<div class="nc-repere"></div></div>'
      + '<div class="nc-teinte" role="slider" tabindex="0" aria-label="Teinte" aria-valuemin="0" aria-valuemax="360">'
      +   '<div class="nc-repere"></div></div>'
      + '<div class="nc-ligne"><p class="nc-titre">Valeurs</p>'
      +   '<div class="nc-modes" role="group" aria-label="Façon d\'écrire la couleur">'
      +     '<button type="button" data-ncm="rvb" title="Rouge, vert, bleu (0 à 255)">RVB</button>'
      +     '<button type="button" data-ncm="tsl" title="Teinte (0 à 360), saturation et luminosité (en %)">TSL</button>'
      +   "</div></div>"
      + '<div class="nc-valeurs">'
      +   [0, 1, 2].map((i) => '<label><input type="text" inputmode="numeric" data-nci="' + i + '" autocomplete="off"><span></span></label>').join("")
      + "</div>"
      + '<p class="nc-titre">Nuances</p><div class="nc-rang" data-ncr="nuances"></div>'
      + '<div data-ncb="accords"><p class="nc-titre">Accords</p><div class="nc-rang" data-ncr="accords"></div></div>'
      + '<div class="nc-ligne"><p class="nc-titre">Mes couleurs</p>'
      +   '<button type="button" class="nc-garder"></button></div>'
      + '<div class="nc-rang" data-ncr="favoris"></div>'
      + '<p class="nc-vide">Garde ici tes couleurs préférées : elles restent d\'un tableau à l\'autre.</p>';

    if ("EyeDropper" in racine) q(".nc-pipette").hidden = false;

    // ── les deux glissières : zone et teinte ──
    glisser(q(".nc-zone"), (x, y) => { s = x; v = 1 - y; });
    glisser(q(".nc-teinte"), (x) => { h = x * 360; });
    q(".nc-zone").addEventListener("keydown", (e) => {
      const p = e.shiftKey ? 0.1 : 0.01;
      const d = { ArrowLeft: [-p, 0], ArrowRight: [p, 0], ArrowUp: [0, p], ArrowDown: [0, -p] }[e.key];
      if (!d) return;
      e.preventDefault();
      s = borne(s + d[0], 0, 1); v = borne(v + d[1], 0, 1);
      changer(true);
    });
    q(".nc-teinte").addEventListener("keydown", (e) => {
      const p = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: -p, ArrowDown: -p, ArrowRight: p, ArrowUp: p, Home: -720, End: 720 }[e.key];
      if (d === undefined) return;
      e.preventDefault();
      h = borne(h + d, 0, 360);
      changer(true);
    });

    // ── le code ou le nom ──
    const code = q(".nc-code");
    const lireCode = (fin) => {
      const c = lire(code.value, cssVersHex);
      if (!c) {
        if (fin && code.value.trim()) erreur("« " + code.value.trim() + " » : je ne connais pas cette couleur. Essaie #3b5bdb, rouge ou 120, 30, 200.");
        return;
      }
      erreur("");
      poser(c);
      // pendant la frappe, le texte reste tel quel ; à la validation, il
      // devient le code : « bleu ciel » s'affiche « #74c0fc »
      changer(fin, !fin);
    };
    code.addEventListener("input", () => lireCode(false));
    code.addEventListener("change", () => lireCode(true));
    code.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); lireCode(true); code.select(); }
    });
    code.addEventListener("focus", () => code.select());

    // ── les valeurs ──
    el.addEventListener("input", (e) => {
      if (!e.target.matches("[data-nci]")) return;
      lireValeurs(false);
    });
    el.addEventListener("change", (e) => {
      if (!e.target.matches("[data-nci]")) return;
      lireValeurs(true);
    });
    el.addEventListener("keydown", (e) => {
      const c = e.target;
      if (c.matches && c.matches("[data-nci]") && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const max = mode === "tsl" && c.dataset.nci === "0" ? 360 : mode === "tsl" ? 100 : 255;
        c.value = borne((parseInt(c.value, 10) || 0) + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1), 0, max);
        lireValeurs(true);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); fermer(); }
    });

    // ── les boutons ──
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.classList.contains("nc-ok")) return fermer();
      if (b.classList.contains("nc-avant")) { poser(avant); changer(true, true); return; }
      if (b.dataset.ncm) { mode = b.dataset.ncm; peindre(); return; }
      if (b.dataset.ncc) { poser(b.dataset.ncc); changer(true, true); return; }
      if (b.classList.contains("nc-garder")) return garderOuRetirer();
      if (b.classList.contains("nc-pipette")) {
        try {
          new racine.EyeDropper().open().then((r) => {
            const c = lire(r && r.sRGBHex, cssVersHex);
            if (c) { poser(c); changer(true, true); }
          }, () => {});
        } catch (err) { /* refusé : rien à faire */ }
      }
    });

    /* Un clic ailleurs ferme. Pas sur une pastille « couleur libre » : son
       propre clic ouvre ou referme, et le réglage qui la porte peut avoir
       été redessiné depuis l'ouverture (l'ancre d'origine n'existe plus). */
    document.addEventListener("pointerdown", (e) => {
      if (el.hidden || el.contains(e.target)) return;
      if (e.target.closest && e.target.closest("[data-nuancier]")) return;
      fermer();
    }, true);
    racine.addEventListener("resize", () => { if (!el.hidden) placer(); });
  }

  /* Une glissière au doigt, au stylet ou à la souris : le premier contact
     y saute, le geste suit, le lâcher retient. */
  function glisser(zone, regler) {
    let id = null, attente = null, image = 0;
    const suivre = (e) => {
      const r = zone.getBoundingClientRect();
      regler(borne((e.clientX - r.left) / r.width, 0, 1), borne((e.clientY - r.top) / r.height, 0, 1));
      changer(false);
    };
    // un stylet envoie bien plus de mouvements que l'écran n'a d'images :
    // on n'en suit qu'un par image, le dernier, et le lâcher prend le reste
    const vider = () => { cancelAnimationFrame(image); image = 0; if (attente) { const e = attente; attente = null; suivre(e); } };
    zone.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      id = e.pointerId;
      try { zone.setPointerCapture(id); } catch (err) { /* pointeur sans capture */ }
      zone.focus({ preventScroll: true });
      suivre(e);
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      attente = e;
      if (!image) image = requestAnimationFrame(vider);
    });
    const lacher = (e) => {
      if (e.pointerId !== id) return;
      vider();
      id = null;
      changer(true);
    };
    zone.addEventListener("pointerup", lacher);
    zone.addEventListener("pointercancel", lacher);
    zone.addEventListener("lostpointercapture", lacher);
  }

  function lireValeurs(fin) {
    const n = Array.from(el.querySelectorAll("[data-nci]")).map((c) => parseInt(c.value, 10));
    if (n.some((x) => !Number.isFinite(x))) return;
    let c;
    if (mode === "tsl") c = versHex(...tslVersRvb(borne(n[0], 0, 360) % 360, borne(n[1], 0, 100) / 100, borne(n[2], 0, 100) / 100));
    else c = versHex(borne(n[0], 0, 255), borne(n[1], 0, 255), borne(n[2], 0, 255));
    poser(c);
    changer(fin, true, true);
  }

  /* Poser une couleur venue d'ailleurs. Un gris (ou le noir) n'a pas de
     teinte : on garde celle d'avant, sinon tirer la zone vers le blanc
     ferait sauter la barre des teintes au rouge. */
  function poser(hex) {
    const c = versRvb(hex);
    if (!c) return;
    const t = rvbVersTsv(...c);
    if (t[1] > 0) h = t[0];
    s = t[1]; v = t[2];
  }

  function erreur(t) { q(".nc-erreur").textContent = t; q(".nc-erreur").hidden = !t; }

  /* Chaque changement : la couleur part en direct vers le tableau ; au
     lâcher (« fin »), elle est retenue. Le dessin suit AUSSITÔT : remis à
     l'image suivante, un clic laissait l'affichage en retard d'un cran
     (vu au banc : « Avant » semblait ramener la couleur d'avant-dernière). */
  function changer(fin, depuisTexte, depuisValeurs) {
    const c = hexActuel();
    if (o && o.enDirect) o.enDirect(c);
    if (fin && o && o.valider) o.valider(c);
    dessiner(depuisTexte, depuisValeurs);
  }
  const peindre = () => dessiner();

  function rang(liste, actuel) {
    return liste.map(([c, t]) => '<button type="button" class="nc-pastille" data-ncc="' + c + '" style="--c:' + c
      + '" aria-pressed="' + (c === actuel) + '" title="' + ech(t) + '" aria-label="' + ech(t) + '"></button>').join("");
  }

  function dessiner(depuisTexte, depuisValeurs) {
    if (!el || el.hidden) return;
    const c = hexActuel();
    el.style.setProperty("--nc-c", c);
    el.style.setProperty("--nc-avant", avant);
    el.style.setProperty("--nc-h", "hsl(" + Math.round(h) + " 100% 50%)");

    const zone = q(".nc-zone"), teinte = q(".nc-teinte");
    const rz = zone.querySelector(".nc-repere"), rt = teinte.querySelector(".nc-repere");
    rz.style.left = (s * 100) + "%"; rz.style.top = ((1 - v) * 100) + "%";
    rt.style.left = (h / 360 * 100) + "%";
    zone.setAttribute("aria-valuetext", "Saturation " + Math.round(s * 100) + " %, luminosité " + Math.round(v * 100) + " %");
    teinte.setAttribute("aria-valuenow", String(Math.round(h)));
    teinte.setAttribute("aria-valuetext", "Teinte " + Math.round(h) + " degrés");

    const code = q(".nc-code");
    if (!depuisTexte || document.activeElement !== code) code.value = c;

    el.querySelectorAll("[data-ncm]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ncm === mode)));
    const rvb = versRvb(c), tsl = rvbVersTsl(...rvb);
    const vals = mode === "tsl" ? [Math.round(h) % 360, Math.round(tsl[1] * 100), Math.round(tsl[2] * 100)] : rvb;
    const noms = mode === "tsl" ? ["Teinte", "Satur.", "Lumin."] : ["Rouge", "Vert", "Bleu"];
    el.querySelectorAll("[data-nci]").forEach((ch, i) => {
      if (!(depuisValeurs && document.activeElement === ch)) ch.value = String(vals[i]);
      ch.nextElementSibling.textContent = noms[i];
      ch.setAttribute("aria-label", noms[i] === "Satur." ? "Saturation (%)" : noms[i] === "Lumin." ? "Luminosité (%)" : noms[i]);
    });

    q('[data-ncr="nuances"]').innerHTML = rang(nuances(c).map((x, i) => [x, "Nuance " + (i + 1) + " sur 7 : " + x]), c);
    const acc = accords(c);
    q('[data-ncb="accords"]').hidden = !acc.length;
    q('[data-ncr="accords"]').innerHTML = rang(acc.map(([x, t]) => [x, t + " : " + x]), c);

    const fav = favoris();
    q('[data-ncr="favoris"]').innerHTML = rang(fav.map((x) => [x, "Ma couleur " + x]), c);
    q(".nc-vide").hidden = fav.length > 0;
    const garde = fav.indexOf(c) > -1;
    const g = q(".nc-garder");
    g.textContent = garde ? "− Retirer" : "+ Garder";
    g.title = garde ? "Retirer cette couleur de mes couleurs" : "Garder cette couleur dans mes couleurs";
  }

  function favoris() {
    const l = o && o.favoris ? o.favoris() : [];
    return (Array.isArray(l) ? l : []).filter((x) => versRvb(x)).map((x) => x.toLowerCase());
  }
  function garderOuRetirer() {
    if (!o || !o.garderFavoris) return;
    const c = hexActuel(), l = favoris();
    const i = l.indexOf(c);
    if (i > -1) l.splice(i, 1); else l.unshift(c);
    o.garderFavoris(l.slice(0, FAVORIS_MAX));
    peindre();
  }

  /* Au téléphone, une feuille qui monte du bas. Ailleurs, une bulle À CÔTÉ
     du panneau qui porte la pastille (« cote ») : posée dessous, elle
     cachait la rangée même où l'on venait de cliquer. Sans place à droite
     ni à gauche, sous la pastille (ou au-dessus). Jamais hors de l'écran. */
  function placer() {
    const tel = !!(coupleTelephone && coupleTelephone.matches);
    el.classList.toggle("nc-feuille", tel);
    if (tel) { el.style.left = el.style.top = ""; return; }
    const vu = (x) => (x && x.isConnected ? x.getBoundingClientRect() : null);
    const r = vu(o && o.ancre), c = vu(o && o.cote);
    const L = el.offsetWidth, H = el.offsetHeight, W = racine.innerWidth, Hv = racine.innerHeight, m = 8;
    let x, y;
    if (c && c.right + 8 + L <= W - m) { x = c.right + 8; y = (r || c).top - 12; }
    else if (c && c.left - 8 - L >= m) { x = c.left - 8 - L; y = (r || c).top - 12; }
    else if (r) {
      x = r.left; y = r.bottom + 6;
      if (y + H > Hv - m && r.top - 6 - H >= m) y = r.top - 6 - H;
    } else {
      // l'ancre a été redessinée depuis : la bulle reste où elle est
      x = parseFloat(el.style.left) || (W - L) / 2;
      y = parseFloat(el.style.top) || (Hv - H) / 2;
    }
    x = borne(x, m, Math.max(m, W - L - m));
    y = borne(y, m, Math.max(m, Hv - H - m));
    el.style.left = Math.round(x) + "px";
    el.style.top = Math.round(y) + "px";
  }

  /* Ouvrir. « options » :
       ancre        l'élément qui l'appelle
       cote         le panneau qui le porte : la bulle s'ouvre à côté de lui
       hote        l'élément où le poser (le tableau, pour hériter de ses couleurs)
       couleur      la couleur de départ, « #rrggbb »
       enDirect(c)  pendant le geste
       valider(c)   au lâcher, à la saisie, au choix d'une pastille
       favoris()    la liste « Mes couleurs »
       garderFavoris(liste)
       fermer()     quand il se ferme */
  function ouvrir(options) {
    if (!el) batir();
    if (o && o.fermer && o !== options) { const f = o.fermer; o = null; f(); }
    o = options || {};
    (o.hote || document.body).appendChild(el);
    avant = versRvb(o.couleur) ? String(o.couleur).toLowerCase() : "#000000";
    h = 0; poser(avant);
    erreur("");
    el.hidden = false;
    dessiner();
    placer();
    q(".nc-zone").focus({ preventScroll: true });
  }
  function fermer() {
    if (!el || el.hidden) return;
    el.hidden = true;
    const f = o && o.fermer;
    o = null;
    if (f) f();
  }

  racine.TB_NUANCIER = Object.assign({ ouvrir, fermer, ouvert: () => !!(el && !el.hidden) }, CALCUL);
})(typeof window !== "undefined" ? window : this);
