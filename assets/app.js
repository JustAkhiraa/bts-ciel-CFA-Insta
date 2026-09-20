/* ═══════════════════════════════════════════════════════════════════════
   COQUILLE — thème, recherche, reprise de lecture
   Aucun framework, aucun appel réseau. Tout tient dans ce fichier.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── Thème ──────────────────────────────────────────────────────────
     Ordre de décision : ce que l'utilisateur a choisi, sinon ce que son
     système demande. Le choix est relu avant le premier rendu (voir le
     script en ligne dans <head>) pour éviter l'éclair blanc. */
  var CLE = "bts-theme";

  function appliquer(t) {
    document.documentElement.dataset.theme = t;
    var b = document.querySelector(".bascule-theme");
    if (b) {
      b.textContent = t === "dark" ? "☀" : "☾";
      b.setAttribute("aria-label", t === "dark" ? "Passer en clair" : "Passer en sombre");
    }
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", t === "dark" ? "#0E1013" : "#FDF5E6");
  }

  function themeActuel() {
    try {
      var enregistre = localStorage.getItem(CLE);
      if (enregistre) return enregistre;
    } catch (e) { /* navigation privée : on se rabat sur le système */ }
    return window.matchMedia &&
           window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function poserBascule() {
    if (document.querySelector(".bascule-theme")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "bascule-theme";
    b.addEventListener("click", function () {
      var t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(CLE, t); } catch (e) {}
      appliquer(t);
    });
    document.body.appendChild(b);
    appliquer(themeActuel());
  }

  /* ── Recherche ──────────────────────────────────────────────────────
     L'index est chargé une seule fois, à la première frappe : la page
     s'affiche sans l'attendre. */
  var index = null, chargement = null;

  function normaliser(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function chargerIndex(base) {
    if (index) return Promise.resolve(index);
    if (!chargement) {
      chargement = fetch(base + "recherche.json")
        .then(function (r) { return r.json(); })
        .then(function (d) { index = d; return d; })
        .catch(function () { return (index = []); });
    }
    return chargement;
  }

  function brancherRecherche() {
    var champ = document.getElementById("q");
    if (!champ) return;
    var boite = document.getElementById("resultats");
    var base = champ.dataset.base || "";

    function rendre(liste, terme) {
      if (!terme) { boite.innerHTML = ""; return; }
      if (!liste.length) {
        boite.innerHTML = '<p class="r-vide">Rien pour « ' +
          terme.replace(/[<>&]/g, "") + ' ».</p>';
        return;
      }
      boite.innerHTML = liste.slice(0, 12).map(function (e) {
        return '<a href="' + base + e.u + '">' +
               '<span class="r-titre">' + e.t + "</span>" +
               '<span class="r-chemin">' + e.m + " · " + e.c + "</span></a>";
      }).join("");
    }

    function chercher() {
      var terme = champ.value.trim();
      if (terme.length < 2) { boite.innerHTML = ""; return; }
      chargerIndex(base).then(function (data) {
        var n = normaliser(terme);
        var mots = n.split(/\s+/).filter(Boolean);
        var trouves = data.filter(function (e) {
          return mots.every(function (mot) { return e.k.indexOf(mot) !== -1; });
        });
        rendre(trouves, terme);
      });
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

  /* ── Raccourci clavier « / » ───────────────────────────────────────── */
  function raccourci() {
    document.addEventListener("keydown", function (e) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      var a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      var champ = document.getElementById("q");
      if (champ) { e.preventDefault(); champ.focus(); champ.select(); }
    });
  }

  /* ── Dernière fiche consultée ──────────────────────────────────────── */
  function memoriser() {
    var m = document.body.dataset.matiere;
    var t = document.querySelector("h1");
    if (!m || !t || !/\/(cours|exercices|fiche-revision)\.html$/.test(location.pathname)) return;
    try {
      localStorage.setItem("bts-derniere", JSON.stringify({
        titre: t.textContent.trim(), url: location.pathname + location.hash
      }));
    } catch (e) {}
  }

  function proposerReprise() {
    var zone = document.getElementById("reprise");
    if (!zone) return;
    var d;
    try { d = JSON.parse(localStorage.getItem("bts-derniere") || "null"); } catch (e) { return; }
    if (!d || !d.url) return;
    zone.innerHTML = '<a class="carte-matiere" href="' + d.url + '" style="grid-column:1/-1">' +
      '<span class="ic">↩</span><h2>Reprendre</h2><p>' + d.titre + "</p></a>";
  }

  function init() {
    poserBascule();
    brancherRecherche();
    raccourci();
    memoriser();
    proposerReprise();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
