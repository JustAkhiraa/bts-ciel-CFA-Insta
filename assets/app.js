/* ═══════════════════════════════════════════════════════════════════════
   COQUILLE — réglages, recherche, progression
   Aucun framework, aucun appel réseau, aucune dépendance.
   Repris de Sakina : la feuille coulissante, le catalogue d'ambiances,
   les accents, le réglage de taille, la persistance locale.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ───────────────────────────────────────────────── état persistant */
  var CLE = "bts-ciel";
  var DEFAUTS = { theme: "", accent: "", taille: "normal", anim: 1, faits: [], derniere: null };
  var S = (function () {
    try { return Object.assign({}, DEFAUTS, JSON.parse(localStorage.getItem(CLE) || "{}")); }
    catch (e) { return Object.assign({}, DEFAUTS); }
  })();
  function enregistrer() {
    try { localStorage.setItem(CLE, JSON.stringify(S)); } catch (e) {}
  }

  /* ───────────────────────────────────────────── catalogue d'ambiances */
  var AMBIANCES = [
    { id: "", nom: "Système", teinte: "linear-gradient(135deg,#F5F4F0 50%,#08090C 50%)", sombre: null },
    { id: "light", nom: "Clair", teinte: "#F5F4F0", sombre: false },
    { id: "sand", nom: "Sable", teinte: "#F3EBDD", sombre: false },
    { id: "cream", nom: "Crème", teinte: "#EBE1CD", sombre: false },
    { id: "dawn", nom: "Aube", teinte: "#F7F0F2", sombre: false },
    { id: "sakura", nom: "Sakura", teinte: "#FFF0F3", sombre: false },
    { id: "porcelain", nom: "Porcelaine", teinte: "#F8F5F0", sombre: false },
    { id: "linen", nom: "Lin", teinte: "#EFE7D8", sombre: false },
    { id: "mist", nom: "Brume", teinte: "#E8ECEF", sombre: false },
    { id: "frost", nom: "Givre", teinte: "#E8F1F5", sombre: false },
    { id: "peachlight", nom: "Pêche", teinte: "#FFE9DA", sombre: false },
    { id: "mintlight", nom: "Menthe", teinte: "#E7F5EE", sombre: false },
    { id: "marble", nom: "Marbre", teinte: "#F2EFE9", sombre: false },
    { id: "dark", nom: "Sombre", teinte: "#0E1013", sombre: true },
    { id: "emerald", nom: "Émeraude", teinte: "#0A1F15", sombre: true },
    { id: "ocean", nom: "Océan", teinte: "#0B1628", sombre: true },
    { id: "mocha", nom: "Moka", teinte: "#1F1611", sombre: true },
    { id: "nordic", nom: "Nordique", teinte: "#1B2430", sombre: true },
    { id: "carbon", nom: "Carbone", teinte: "#14181D", sombre: true },
    { id: "rosewood", nom: "Rosewood", teinte: "#1A0B10", sombre: true },
    { id: "sunset", nom: "Coucher", teinte: "#2A0F1E", sombre: true },
    { id: "starry", nom: "Nuit étoilée", teinte: "#060814", sombre: true },
    { id: "aurora", nom: "Aurore", teinte: "#071018", sombre: true },
    { id: "midnight", nom: "Minuit", teinte: "#050716", sombre: true },
    { id: "amoled", nom: "AMOLED", teinte: "#000000", sombre: true }
  ];

  var ACCENTS = [
    { id: "", nom: "Par matière", teinte: "linear-gradient(135deg,#2D5A27,#005B96,#8B0000)" },
    { id: "jade", nom: "Jade", teinte: "#16A34A" },
    { id: "saphir", nom: "Saphir", teinte: "#2563EB" },
    { id: "turquoise", nom: "Turquoise", teinte: "#0F766E" },
    { id: "violet", nom: "Violet", teinte: "#6D28D9" },
    { id: "rose", nom: "Rose", teinte: "#BE185D" },
    { id: "braise", nom: "Braise", teinte: "#C2410C" },
    { id: "or", nom: "Or", teinte: "#C9A96E" },
    { id: "perle", nom: "Perle", teinte: "#6B7280" }
  ];

  var TAILLES = [
    { id: "petit", nom: "Petit" }, { id: "normal", nom: "Normal" },
    { id: "grand", nom: "Grand" }, { id: "tres-grand", nom: "Très grand" }
  ];

  function ambiance(id) {
    for (var i = 0; i < AMBIANCES.length; i++) if (AMBIANCES[i].id === id) return AMBIANCES[i];
    return AMBIANCES[0];
  }

  function systemeSombre() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  /* ── applique tout l'état visuel ─────────────────────────────────── */
  function appliquer() {
    var d = document.documentElement;
    var a = ambiance(S.theme);
    var sombre = a.sombre === null ? systemeSombre() : a.sombre;

    d.dataset.theme = S.theme || (sombre ? "dark" : "light");
    d.dataset.sombre = sombre ? "1" : "0";
    d.dataset.taille = S.taille || "normal";
    d.dataset.anim = S.anim ? "1" : "0";
    if (S.accent) d.dataset.accent = S.accent; else delete d.dataset.accent;

    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", sombre ? "#0E1013" : "#FDF5E6");
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
  var voile, feuille;

  function fermer() {
    if (!feuille) return;
    feuille.classList.remove("ouverte");
    voile.classList.remove("ouvert");
    document.body.style.overflow = "";
  }

  function pastilles(liste, actuel, surChoix) {
    return liste.map(function (o) {
      return '<button type="button" data-v="' + o.id + '" aria-pressed="' +
             (o.id === actuel) + '">' + o.nom + "</button>";
    }).join("");
  }

  function nuanciers(liste, actuel) {
    return liste.map(function (o) {
      return '<button type="button" class="nuancier" data-v="' + o.id + '" aria-pressed="' +
             (o.id === actuel) + '" title="' + o.nom + '">' +
             '<span class="rond" style="background:' + o.teinte + '"></span>' +
             "<span>" + o.nom + "</span></button>";
    }).join("");
  }

  function construireFeuille() {
    voile = document.createElement("div");
    voile.className = "voile";
    voile.addEventListener("click", fermer);

    feuille = document.createElement("aside");
    feuille.className = "feuille";
    feuille.setAttribute("role", "dialog");
    feuille.setAttribute("aria-label", "Réglages");
    feuille.innerHTML =
      '<div class="feuille-tete"><h2>Réglages</h2>' +
      '<button type="button" class="bouton-rond" data-fermer aria-label="Fermer">✕</button></div>' +
      '<div class="feuille-corps">' +

        '<div class="reglage"><h3>Ambiance</h3>' +
        '<p>Vingt-cinq fonds. « Système » suit le réglage clair ou sombre de votre appareil.</p>' +
        '<div class="nuanciers" data-champ="theme">' + nuanciers(AMBIANCES, S.theme) + "</div></div>" +

        '<div class="reglage"><h3>Couleur d\'accent</h3>' +
        '<p>Par défaut, chaque matière garde la sienne.</p>' +
        '<div class="nuanciers" data-champ="accent">' + nuanciers(ACCENTS, S.accent) + "</div></div>" +

        '<div class="reglage"><h3>Taille du texte</h3>' +
        '<div class="pastilles" data-champ="taille">' + pastilles(TAILLES, S.taille) + "</div></div>" +

        '<div class="reglage"><h3>Confort</h3>' +
        '<button type="button" class="bascule" data-champ="anim" aria-pressed="' + !!S.anim + '">' +
          '<span class="txt"><b>Animations</b><span>Transitions et défilement doux</span></span>' +
          '<span class="interrupteur"></span></button></div>' +

        '<div class="reglage"><h3>Progression</h3>' +
        '<p id="compte-faits"></p>' +
        '<button type="button" class="danger" data-effacer>Effacer mes données locales</button></div>' +

        '<div class="reglage"><h3>Raccourcis</h3>' +
        '<p><b>/</b> chercher · <b>Échap</b> fermer · <b>↑ ↓</b> parcourir les résultats</p></div>' +
      "</div>";

    feuille.addEventListener("click", function (e) {
      var b;
      if ((b = e.target.closest("[data-fermer]"))) return fermer();

      if ((b = e.target.closest(".nuanciers [data-v], .pastilles [data-v]"))) {
        var champ = b.closest("[data-champ]").dataset.champ;
        S[champ] = b.dataset.v;
        b.parentNode.querySelectorAll("[data-v]").forEach(function (x) {
          x.setAttribute("aria-pressed", String(x === b));
        });
        enregistrer(); appliquer();
        return;
      }

      if ((b = e.target.closest('[data-champ="anim"]'))) {
        S.anim = S.anim ? 0 : 1;
        b.setAttribute("aria-pressed", String(!!S.anim));
        enregistrer(); appliquer();
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

    document.body.appendChild(voile);
    document.body.appendChild(feuille);
  }

  function ouvrir() {
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

  function poserBoutons() {
    var svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'aria-hidden="true"><circle cx="12" cy="12" r="3"/><path stroke-linecap="round" ' +
      'stroke-linejoin="round" d="M10.3 4.3a1.7 1.7 0 0 1 3.4 0 1.7 1.7 0 0 0 2.5 1 1.7 1.7 0 0 1 ' +
      '2.4 2.4 1.7 1.7 0 0 0 1 2.6 1.7 1.7 0 0 1 0 3.4 1.7 1.7 0 0 0-1 2.5 1.7 1.7 0 0 1-2.4 ' +
      '2.4 1.7 1.7 0 0 0-2.5 1 1.7 1.7 0 0 1-3.4 0 1.7 1.7 0 0 0-2.6-1 1.7 1.7 0 0 1-2.4-2.4 ' +
      '1.7 1.7 0 0 0-1-2.5 1.7 1.7 0 0 1 0-3.4 1.7 1.7 0 0 0 1-2.6 1.7 1.7 0 0 1 2.4-2.4 ' +
      '1.7 1.7 0 0 0 2.6-1z"/></svg>';

    var tete = document.querySelector(".app-tete nav");
    if (tete) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "bouton-rond";
      b.setAttribute("aria-label", "Réglages"); b.innerHTML = svg;
      b.addEventListener("click", ouvrir);
      tete.appendChild(b);
    } else {
      /* Sur une fiche il n'y a pas d'en-tête : un bouton flottant. */
      var f = document.createElement("button");
      f.type = "button"; f.className = "bascule-theme";
      f.setAttribute("aria-label", "Réglages"); f.innerHTML = svg;
      f.addEventListener("click", ouvrir);
      document.body.appendChild(f);
    }
  }

  /* ─────────────────────────────────────────────────────── recherche
     L'index est un SCRIPT, pas un fetch : il fonctionne aussi quand la
     page est ouverte depuis un fichier local, où fetch est interdit. */
  function normaliser(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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
        boite.innerHTML = '<p class="r-vide">Rien pour « ' +
          terme.replace(/[<>&]/g, "") + " ».</p>";
        return;
      }
      boite.innerHTML = trouves.slice(0, 12).map(function (e) {
        return '<a href="' + base + e.u + '">' +
               '<span class="r-titre">' + e.t + "</span>" +
               '<span class="r-chemin">' + e.m + " · " + e.c + "</span></a>";
      }).join("");
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
        if (i === -1) { faits.push(cle); toast("Chapitre révisé ✓"); }
        else { faits.splice(i, 1); }
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
    zone.innerHTML = '<a class="carte-matiere" href="' + S.derniere.url +
      '" style="grid-column:1/-1"><span class="ic">↩</span>' +
      "<h2>Reprendre</h2><p>" + S.derniere.titre + "</p></a>";
  }

  /* ──────────────────────────────────────────────── raccourci clavier */
  function raccourcis() {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && feuille && feuille.classList.contains("ouverte")) return fermer();
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      var a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      var champ = document.getElementById("q");
      if (champ) { e.preventDefault(); champ.focus(); champ.select(); }
    });
  }

  function init() {
    appliquer();
    poserBoutons();
    brancherRecherche();
    progression();
    memoriser();
    proposerReprise();
    raccourcis();
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var suivre = function () { if (!S.theme) appliquer(); };
      if (mq.addEventListener) mq.addEventListener("change", suivre);
      else if (mq.addListener) mq.addListener(suivre);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
