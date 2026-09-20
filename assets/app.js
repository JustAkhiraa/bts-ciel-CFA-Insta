/* ═══════════════════════════════════════════════════════════════════════
   COQUILLE — réglages, recherche, progression
   Aucun framework, aucun appel réseau, aucune dépendance.
   Repris de Sakina : la feuille coulissante, le catalogue de thèmes,
   le réglage de taille, la persistance locale, le tirage au sort.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ───────────────────────────────────────────────── état persistant */
  var CLE = "bts-ciel";
  var DEFAUTS = {
    theme: "", taille: "normal", largeur: "normal", police: "systeme",
    interligne: "normal", anim: 1, reponses: 0, faits: [], derniere: null
  };
  var S = (function () {
    try { return Object.assign({}, DEFAUTS, JSON.parse(localStorage.getItem(CLE) || "{}")); }
    catch (e) { return Object.assign({}, DEFAUTS); }
  })();
  function enregistrer() {
    try { localStorage.setItem(CLE, JSON.stringify(S)); } catch (e) {}
  }

  /* ─────────────────────────────────────────────────── catalogue de thèmes
     Un seul axe, rangé en groupes : le sélecteur tient en trois lignes là où
     quarante pastilles occupaient tout l'écran des réglages. La couleur
     d'accent séparée a disparu — elle avait un sens pour un texte arabe, pas
     pour des fiches où chaque matière porte déjà sa couleur. */
  var GROUPES = [
    { nom: "Automatique", items: [
      { id: "", nom: "Système (suit l'appareil)", sombre: null }
    ]},
    { nom: "Clair", items: [
      { id: "light", nom: "Clair", sombre: false },
      { id: "sand", nom: "Sable", sombre: false },
      { id: "cream", nom: "Crème", sombre: false },
      { id: "dawn", nom: "Aube", sombre: false },
      { id: "sakura", nom: "Sakura", sombre: false },
      { id: "porcelain", nom: "Porcelaine", sombre: false },
      { id: "linen", nom: "Lin", sombre: false },
      { id: "mist", nom: "Brume", sombre: false },
      { id: "frost", nom: "Givre", sombre: false },
      { id: "peachlight", nom: "Pêche", sombre: false },
      { id: "mintlight", nom: "Menthe", sombre: false },
      { id: "marble", nom: "Marbre", sombre: false }
    ]},
    { nom: "Sombre", items: [
      { id: "dark", nom: "Sombre", sombre: true },
      { id: "emerald", nom: "Émeraude", sombre: true },
      { id: "ocean", nom: "Océan", sombre: true },
      { id: "mocha", nom: "Moka", sombre: true },
      { id: "nordic", nom: "Nordique", sombre: true },
      { id: "carbon", nom: "Carbone", sombre: true },
      { id: "rosewood", nom: "Rosewood", sombre: true },
      { id: "sunset", nom: "Coucher de soleil", sombre: true },
      { id: "starry", nom: "Nuit étoilée", sombre: true },
      { id: "aurora", nom: "Aurore", sombre: true },
      { id: "midnight", nom: "Minuit", sombre: true },
      { id: "amoled", nom: "AMOLED", sombre: true }
    ]},
    { nom: "Jeux et écrans", items: [
      { id: "voxel", nom: "Voxel", sombre: true },
      { id: "pixel", nom: "Pixel", sombre: true },
      { id: "terminal", nom: "Terminal", sombre: true },
      { id: "matrix", nom: "Matrix", sombre: true },
      { id: "crt", nom: "Retro CRT", sombre: true },
      { id: "midgar", nom: "Midgar", sombre: true },
      { id: "determination", nom: "Détermination", sombre: true },
      { id: "velours", nom: "Velours", sombre: true },
      { id: "neon-lime", nom: "Neon Lime", sombre: true },
      { id: "androide", nom: "Androïde", sombre: false },
      { id: "grand-large", nom: "Grand Large", sombre: false },
      { id: "cahier-rose", nom: "Cahier rose", sombre: false },
      { id: "console-blanche", nom: "Console blanche", sombre: false },
      { id: "bloc-notes", nom: "Bloc-notes", sombre: false },
      { id: "liquid", nom: "Liquid Glass", sombre: false },
      { id: "zellige", nom: "Zellige", sombre: false }
    ]}
  ];

  var TAILLES = [
    { id: "petit", nom: "Petit" }, { id: "normal", nom: "Normal" },
    { id: "grand", nom: "Grand" }, { id: "tres-grand", nom: "Très grand" }
  ];
  var LARGEURS = [
    { id: "etroit", nom: "Étroite" }, { id: "normal", nom: "Normale" },
    { id: "large", nom: "Large" }, { id: "pleine", nom: "Pleine" }
  ];
  var POLICES = [
    { id: "systeme", nom: "Système" }, { id: "serif", nom: "Serif" },
    { id: "mono", nom: "Mono" }
  ];
  var INTERLIGNES = [
    { id: "serre", nom: "Serré" }, { id: "normal", nom: "Normal" },
    { id: "aere", nom: "Aéré" }
  ];

  function theme(id) {
    for (var g = 0; g < GROUPES.length; g++)
      for (var i = 0; i < GROUPES[g].items.length; i++)
        if (GROUPES[g].items[i].id === id) return GROUPES[g].items[i];
    return GROUPES[0].items[0];
  }

  function systemeSombre() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  /* ── applique tout l'état visuel ─────────────────────────────────── */
  function appliquer() {
    var d = document.documentElement;
    var t = theme(S.theme);
    var sombre = t.sombre === null ? systemeSombre() : t.sombre;

    d.dataset.theme      = S.theme || (sombre ? "dark" : "light");
    d.dataset.sombre     = sombre ? "1" : "0";
    d.dataset.taille     = S.taille || "normal";
    d.dataset.largeur    = S.largeur || "normal";
    d.dataset.police     = S.police || "systeme";
    d.dataset.interligne = S.interligne || "normal";
    d.dataset.anim       = S.anim ? "1" : "0";

    /* La barre d'état du téléphone doit suivre le fond réel du thème, pas une
       valeur figée : sur « Voxel » elle restait crème au-dessus d'un fond noir. */
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) {
      var fond = getComputedStyle(d).getPropertyValue("--papier").trim();
      m.setAttribute("content", fond || (sombre ? "#0E1013" : "#FDF5E6"));
    }

    /* Choisir « Voxel » dans le sélecteur passait la page en sombre mais
       laissait l'icône sur la lune : elle proposait d'aller là où l'on était
       déjà. Elle se repeint désormais à chaque application de l'état. */
    peindreBascule();
  }

  /* ───────────────────────────────────────────────────────── toast */
  var _tm;
  function toast(msg) {
    var t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("visible");
    clearTimeout(_tm);
    _tm = setTimeout(function () { t.classList.remove("visible"); }, 2200);
  }

  /* ─────────────────────────────────────────────── feuille de réglages */
  var voile, feuille, dernierFocus;

  function fermer() {
    if (!feuille) return;
    feuille.classList.remove("ouverte");
    voile.classList.remove("ouvert");
    document.body.style.overflow = "";
    if (dernierFocus && dernierFocus.focus) dernierFocus.focus();
  }

  function pastilles(liste, actuel) {
    return liste.map(function (o) {
      return '<button type="button" data-v="' + o.id + '" aria-pressed="' +
             (o.id === actuel) + '">' + o.nom + "</button>";
    }).join("");
  }

  function selecteurThemes(actuel) {
    return '<select id="choix-theme" data-champ="theme" aria-label="Thème">' +
      GROUPES.map(function (g) {
        return '<optgroup label="' + g.nom + '">' + g.items.map(function (o) {
          return '<option value="' + o.id + '"' + (o.id === actuel ? " selected" : "") +
                 ">" + o.nom + "</option>";
        }).join("") + "</optgroup>";
      }).join("") + "</select>";
  }

  function construireFeuille() {
    voile = document.createElement("div");
    voile.className = "voile";
    voile.addEventListener("click", fermer);

    feuille = document.createElement("aside");
    feuille.className = "feuille";
    feuille.setAttribute("role", "dialog");
    feuille.setAttribute("aria-modal", "true");
    feuille.setAttribute("aria-label", "Réglages");
    feuille.innerHTML =
      '<div class="feuille-tete"><h2>Réglages</h2>' +
      '<button type="button" class="bouton-rond" data-fermer aria-label="Fermer">✕</button></div>' +
      '<div class="feuille-corps">' +

        '<div class="reglage"><h3>Thème</h3>' +
        '<p>Quarante thèmes, dont seize venus de jeux et de vieux écrans.</p>' +
        '<div class="champ-select">' + selecteurThemes(S.theme) +
        '<button type="button" class="mini" data-hasard-theme title="Thème au hasard">🎲</button></div>' +
        '<div class="apercu-theme" aria-hidden="true">' +
          '<span class="ap-carte"><i></i><b></b></span>' +
          '<span class="ap-txt">Aperçu du thème</span></div></div>' +

        '<div class="reglage"><h3>Taille du texte</h3>' +
        '<div class="pastilles" data-champ="taille">' + pastilles(TAILLES, S.taille) + "</div></div>" +

        '<div class="reglage"><h3>Largeur de lecture</h3>' +
        '<p>« Large » et « Pleine » exploitent les grands écrans ; « Étroite » garde une ligne courte, plus facile à suivre.</p>' +
        '<div class="pastilles" data-champ="largeur">' + pastilles(LARGEURS, S.largeur) + "</div></div>" +

        '<div class="reglage"><h3>Police</h3>' +
        '<div class="pastilles" data-champ="police">' + pastilles(POLICES, S.police) + "</div></div>" +

        '<div class="reglage"><h3>Interligne</h3>' +
        '<div class="pastilles" data-champ="interligne">' + pastilles(INTERLIGNES, S.interligne) + "</div></div>" +

        '<div class="reglage"><h3>Révision</h3>' +
        '<button type="button" class="bascule" data-bascule="reponses" aria-pressed="' + !!S.reponses + '">' +
          '<span class="txt"><b>Réponses déjà ouvertes</b>' +
          '<span>Les corrections des exercices s\'affichent sans cliquer</span></span>' +
          '<span class="interrupteur"></span></button>' +
        '<button type="button" class="bascule" data-bascule="anim" aria-pressed="' + !!S.anim + '">' +
          '<span class="txt"><b>Animations</b><span>Transitions et défilement doux</span></span>' +
          '<span class="interrupteur"></span></button></div>' +

        '<div class="reglage"><h3>Progression</h3>' +
        '<p id="compte-faits"></p>' +
        '<button type="button" class="danger" data-effacer>Effacer mes données locales</button></div>' +

        '<div class="reglage"><h3>Raccourcis</h3>' +
        '<p><b>/</b> chercher · <b>t</b> thème clair/sombre · <b>r</b> fiche au hasard · ' +
        '<b>Échap</b> fermer · <b>↑ ↓</b> parcourir les résultats</p></div>' +
      "</div>";

    feuille.addEventListener("change", function (e) {
      var sel = e.target.closest("select[data-champ]");
      if (!sel) return;
      S[sel.dataset.champ] = sel.value;
      enregistrer(); appliquer();
    });

    feuille.addEventListener("click", function (e) {
      var b;
      if (e.target.closest("[data-fermer]")) return fermer();

      if ((b = e.target.closest("[data-hasard-theme]"))) {
        var tous = [];
        GROUPES.forEach(function (g) { g.items.forEach(function (o) { if (o.id) tous.push(o); }); });
        var choisi = tous[Math.floor(Math.random() * tous.length)];
        S.theme = choisi.id;
        feuille.querySelector("#choix-theme").value = choisi.id;
        enregistrer(); appliquer(); toast(choisi.nom);
        return;
      }

      if ((b = e.target.closest(".pastilles [data-v]"))) {
        var champ = b.closest("[data-champ]").dataset.champ;
        S[champ] = b.dataset.v;
        b.parentNode.querySelectorAll("[data-v]").forEach(function (x) {
          x.setAttribute("aria-pressed", String(x === b));
        });
        enregistrer(); appliquer();
        return;
      }

      if ((b = e.target.closest("[data-bascule]"))) {
        var nom = b.dataset.bascule;
        S[nom] = S[nom] ? 0 : 1;
        b.setAttribute("aria-pressed", String(!!S[nom]));
        enregistrer(); appliquer();
        if (nom === "reponses") reponses();
        return;
      }

      if (e.target.closest("[data-effacer]")) {
        if (!confirm("Effacer le thème choisi et les chapitres cochés ?")) return;
        S = Object.assign({}, DEFAUTS);
        try { localStorage.removeItem(CLE); } catch (err) {}
        appliquer(); fermer();
        toast("Données effacées");
        setTimeout(function () { location.reload(); }, 600);
      }
    });

    /* Le focus reste dans la feuille tant qu'elle est ouverte : sans cela, la
       tabulation partait derrière le voile, sur une page qu'on ne voit plus. */
    feuille.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var f = feuille.querySelectorAll('button, select, [href], input, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var premier = f[0], dernier = f[f.length - 1];
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    });

    document.body.appendChild(voile);
    document.body.appendChild(feuille);
  }

  function ouvrir() {
    dernierFocus = document.activeElement;
    if (!feuille) construireFeuille();
    var c = feuille.querySelector("#compte-faits");
    if (c) {
      var n = (S.faits || []).length;
      c.textContent = n ? n + " chapitre" + (n > 1 ? "s" : "") + " coché" + (n > 1 ? "s" : "") +
                          " comme révisé" + (n > 1 ? "s" : "") + "."
                        : "Aucun chapitre coché pour l'instant.";
    }
    voile.classList.add("ouvert");
    feuille.classList.add("ouverte");
    document.body.style.overflow = "hidden";
    var p = feuille.querySelector("[data-fermer]");
    if (p) p.focus();
  }

  /* ────────────────────────────────── boutons d'en-tête et bascule rapide */
  var ICONE_REGLAGES =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'aria-hidden="true"><circle cx="12" cy="12" r="3"/><path stroke-linecap="round" ' +
    'stroke-linejoin="round" d="M10.3 4.3a1.7 1.7 0 0 1 3.4 0 1.7 1.7 0 0 0 2.5 1 1.7 1.7 0 0 1 ' +
    '2.4 2.4 1.7 1.7 0 0 0 1 2.6 1.7 1.7 0 0 1 0 3.4 1.7 1.7 0 0 0-1 2.5 1.7 1.7 0 0 1-2.4 ' +
    '2.4 1.7 1.7 0 0 0-2.5 1 1.7 1.7 0 0 1-3.4 0 1.7 1.7 0 0 0-2.6-1 1.7 1.7 0 0 1-2.4-2.4 ' +
    '1.7 1.7 0 0 0-1-2.5 1.7 1.7 0 0 1 0-3.4 1.7 1.7 0 0 0 1-2.6 1.7 1.7 0 0 1 2.4-2.4 ' +
    '1.7 1.7 0 0 0 2.6-1z"/></svg>';
  var ICONE_SOLEIL =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/>' +
    '<path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M5.6 5.6 7.2 7.2M16.8 16.8l1.6 1.6' +
    'M18.4 5.6 16.8 7.2M7.2 16.8l-1.6 1.6"/></svg>';
  var ICONE_LUNE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 ' +
    '0 0 12 20.6a8.4 8.4 0 0 0 8-6.4z"/></svg>';

  /* Bascule clair/sombre en un geste : elle retient le dernier thème de chaque
     camp, pour qu'un aller-retour ne renvoie pas sur le thème par défaut. */
  function basculerClairSombre() {
    var sombre = document.documentElement.dataset.sombre === "1";
    var cible = sombre ? (S.memoClair || "light") : (S.memoSombre || "dark");
    if (sombre) S.memoSombre = S.theme || "dark"; else S.memoClair = S.theme || "light";
    S.theme = cible;
    enregistrer(); appliquer(); peindreBascule();
    var sel = feuille && feuille.querySelector("#choix-theme");
    if (sel) sel.value = S.theme;
  }

  var btnJour;
  function peindreBascule() {
    if (!btnJour) return;
    var sombre = document.documentElement.dataset.sombre === "1";
    btnJour.innerHTML = sombre ? ICONE_SOLEIL : ICONE_LUNE;
    btnJour.setAttribute("aria-label", sombre ? "Passer en clair" : "Passer en sombre");
  }

  function poserBoutons() {
    var tete = document.querySelector(".app-tete nav");
    var cible = tete || document.body;

    btnJour = document.createElement("button");
    btnJour.type = "button";
    btnJour.className = tete ? "bouton-rond" : "flottant flottant-2";
    btnJour.addEventListener("click", basculerClairSombre);
    peindreBascule();

    var reg = document.createElement("button");
    reg.type = "button";
    reg.className = tete ? "bouton-rond" : "flottant";
    reg.setAttribute("aria-label", "Réglages");
    reg.innerHTML = ICONE_REGLAGES;
    reg.addEventListener("click", ouvrir);

    cible.appendChild(btnJour);
    cible.appendChild(reg);
  }

  /* ─────────────────────────────────────────────────────── recherche
     L'index est un SCRIPT, pas un fetch : il fonctionne aussi quand la
     page est ouverte depuis un fichier local, où fetch est interdit. */
  function normaliser(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function echapper(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function brancherRecherche() {
    var champ = document.getElementById("q");
    if (!champ) return;
    var boite = document.getElementById("resultats");
    var base = champ.dataset.base || "";

    function chercher() {
      var terme = champ.value.trim();
      if (terme.length < 2) { boite.innerHTML = ""; return; }

      var data = window.__INDEX;
      if (!Array.isArray(data)) {
        boite.innerHTML = '<p class="r-vide">L\'index de recherche n\'a pas pu être chargé.</p>';
        return;
      }
      var mots = normaliser(terme).split(/\s+/).filter(Boolean);
      var trouves = data.filter(function (e) {
        return mots.every(function (mot) { return e.k.indexOf(mot) !== -1; });
      });
      if (!trouves.length) {
        boite.innerHTML = '<p class="r-vide">Rien pour « ' + echapper(terme) + " ».</p>";
        return;
      }
      boite.innerHTML = trouves.slice(0, 12).map(function (e) {
        return '<a href="' + base + e.u + '">' +
               '<span class="r-titre">' + e.t + "</span>" +
               '<span class="r-chemin">' + e.m + " · " + e.c + "</span></a>";
      }).join("") +
      (trouves.length > 12
        ? '<p class="r-vide">… et ' + (trouves.length - 12) + " autre" +
          (trouves.length - 12 > 1 ? "s" : "") + ". Précisez votre recherche.</p>"
        : "");
    }

    champ.addEventListener("input", chercher);
    champ.addEventListener("focus", chercher);
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".recherche")) boite.innerHTML = "";
    });
    champ.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { champ.value = ""; boite.innerHTML = ""; champ.blur(); }
      if (e.key === "ArrowDown") {
        var premier = boite.querySelector("a");
        if (premier) { e.preventDefault(); premier.focus(); }
      }
      if (e.key === "Enter") {
        var p = boite.querySelector("a");
        if (p) { e.preventDefault(); location.href = p.getAttribute("href"); }
      }
    });
    boite.addEventListener("keydown", function (e) {
      var liens = Array.prototype.slice.call(boite.querySelectorAll("a"));
      var i = liens.indexOf(document.activeElement);
      if (e.key === "ArrowDown" && i < liens.length - 1) { e.preventDefault(); liens[i + 1].focus(); }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (i > 0) liens[i - 1].focus(); else champ.focus();
      }
      if (e.key === "Escape") { boite.innerHTML = ""; champ.focus(); }
    });
  }

  /* ──────────────────────────────────────────────────── progression */
  function progression() {
    var liste = document.querySelector(".liste-chapitres");
    if (!liste) return;
    var faits = S.faits || (S.faits = []);

    liste.querySelectorAll(".chapitre").forEach(function (art) {
      var cle = art.dataset.cle;
      if (!cle) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "coche";
      b.textContent = "✓";
      function peindre() {
        var on = faits.indexOf(cle) !== -1;
        b.setAttribute("aria-pressed", String(on));
        b.setAttribute("aria-label", on ? "Marquer comme non révisé" : "Marquer comme révisé");
        art.classList.toggle("fait", on);
      }
      b.addEventListener("click", function () {
        var i = faits.indexOf(cle);
        if (i === -1) { faits.push(cle); b.classList.add("pulse"); toast("Chapitre révisé ✓"); }
        else { faits.splice(i, 1); }
        setTimeout(function () { b.classList.remove("pulse"); }, 450);
        enregistrer(); peindre(); jauge();
      });
      peindre();
      art.appendChild(b);
    });

    function jauge() {
      var tous = Array.prototype.map.call(liste.querySelectorAll(".chapitre"),
                   function (a) { return a.dataset.cle; }).filter(Boolean);
      var n = tous.filter(function (c) { return faits.indexOf(c) !== -1; }).length;
      var barre = document.querySelector(".jauge-matiere i");
      var txt = document.querySelector(".jauge-txt");
      if (barre) barre.style.width = (tous.length ? Math.round(n / tous.length * 100) : 0) + "%";
      if (txt) txt.textContent = n + " / " + tous.length + " chapitre" +
        (tous.length > 1 ? "s" : "") + " révisé" + (n > 1 ? "s" : "");
    }
    jauge();
  }

  /* ─────────────────────────────── réponses des exercices, en un geste
     Sur une page de vingt quiz, ouvrir chaque réponse à la main quand on
     relit sa correction est fastidieux. Ce réglage les déplie toutes.

     Il ne touche PAS les encarts « 🔧 Corrigé » : ceux-là signalent qu'une
     erreur du cours d'origine a été rectifiée. Les masquer reviendrait à
     cacher l'avertissement qui justifie la correction — ils restent visibles
     en permanence, quel que soit le réglage.

     On passe par le bouton du quiz plutôt que par « hidden » : c'est fiche.js
     qui tient le libellé et les attributs ARIA, et lui seul doit les écrire. */
  function reponses() {
    var ouvrir = !!S.reponses;
    document.querySelectorAll(".quiz").forEach(function (q) {
      var btn = null;
      for (var k = 0; k < q.children.length; k++) {
        if (q.children[k].tagName === "BUTTON") { btn = q.children[k]; break; }
      }
      if (!btn) return;
      var ouvert = btn.getAttribute("aria-expanded") === "true";
      if (ouvert !== ouvrir) btn.click();
    });
  }

  /* ───────────────────────────────────────── dernière fiche consultée */
  function memoriser() {
    var t = document.querySelector("h1");
    if (!t || !/\/(cours|exercices|fiche-revision)\.html$/.test(location.pathname)) return;
    S.derniere = { titre: t.textContent.trim(), url: location.pathname + location.hash };
    enregistrer();
  }

  function proposerReprise() {
    var zone = document.getElementById("reprise");
    if (!zone || !S.derniere || !S.derniere.url) return;
    zone.innerHTML = '<a class="carte-matiere reprise" href="' + S.derniere.url +
      '"><span class="ic">↩</span><h2>Reprendre</h2><p>' +
      echapper(S.derniere.titre) + "</p></a>";
  }

  /* ────────────────────────────────────────────────── fiche au hasard */
  function hasard() {
    var data = window.__INDEX;
    if (!Array.isArray(data) || !data.length) return;
    var champ = document.getElementById("q");
    var base = (champ && champ.dataset.base) || "";
    var e = data[Math.floor(Math.random() * data.length)];
    location.href = base + e.u;
  }

  function brancherHasard() {
    document.querySelectorAll("[data-hasard]").forEach(function (b) {
      b.addEventListener("click", function (ev) { ev.preventDefault(); hasard(); });
    });
  }

  /* ──────────────────────────────────────────────── raccourcis clavier */
  function raccourcis() {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && feuille && feuille.classList.contains("ouverte")) return fermer();
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var a = document.activeElement;
      if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;

      if (e.key === "/") {
        var champ = document.getElementById("q");
        if (champ) { e.preventDefault(); champ.focus(); champ.select(); }
      } else if (e.key === "t") { e.preventDefault(); basculerClairSombre(); }
      else if (e.key === "r") { e.preventDefault(); hasard(); }
    });
  }

  /* ────────────────────── apparition progressive des cartes (Emotional Design)
     Une entrée douce donne le sentiment que la page « se pose ». Elle est
     coupée si les animations sont désactivées ou si le système demande moins
     de mouvement — l'effet est un plus, jamais une condition d'affichage. */
  function apparitions() {
    if (!S.anim || !("IntersectionObserver" in window)) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var cibles = document.querySelectorAll(".carte-matiere, .chapitre, .chiffres div");
    if (!cibles.length || cibles.length > 120) return;
    var obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (x) {
        if (!x.isIntersecting) return;
        x.target.classList.add("vu");
        obs.unobserve(x.target);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    cibles.forEach(function (c, i) {
      c.classList.add("apparait");
      c.style.setProperty("--retard", Math.min(i, 8) * 45 + "ms");
      obs.observe(c);
    });
  }

  function init() {
    appliquer();
    poserBoutons();
    brancherRecherche();
    progression();
    reponses();
    memoriser();
    proposerReprise();
    brancherHasard();
    raccourcis();
    apparitions();
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var suivre = function () { if (!S.theme) { appliquer(); peindreBascule(); } };
      if (mq.addEventListener) mq.addEventListener("change", suivre);
      else if (mq.addListener) mq.addListener(suivre);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
