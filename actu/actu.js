/* ═══ La page « Actu » ══════════════════════════════════════════════════════
   Les titres du jour de plusieurs sites, rangés par jour, avec le choix des
   sites. Demandé le 13 novembre 2026.

   Ce que la page lit : « actu/donnees/index.json » (la liste des jours) puis
   un fichier par jour. Ces fichiers sont tenus par un robot, toutes les
   heures ; la page ne parle à aucun autre serveur pour ses titres. Un clic
   ouvre l'article chez son éditeur, dans le même onglet : « retour » ramène
   ici, à l'endroit où l'on était.

   Ce qui reste dans CE navigateur, et nulle part ailleurs : les sites
   choisis, les articles déjà ouverts, et le dernier titre vu (pour marquer
   les nouveaux à la visite suivante).

   Tout texte venu des flux est posé par « textContent », jamais comme du
   HTML : un titre n'est pas du code. */
(function () {
  "use strict";
  var page = document.getElementById("actu");
  if (!page) return;

  var DONNEES = "actu/donnees/";
  var CLE = "bts-ciel-actu";
  var RETOUR = "bts-ciel-actu-retour";
  var liste = document.getElementById("actu-liste");
  var etat = document.getElementById("actu-etat");
  var suite = document.getElementById("actu-suite");
  var filtres = document.getElementById("actu-filtres");
  var message = document.getElementById("actu-message");
  var pastille = document.getElementById("actu-neufs");
  var bRafraichir = document.getElementById("actu-rafraichir");
  var bImages = document.getElementById("actu-images");

  /* ── ce que ce navigateur retient ── */
  var E = { src: [], lus: [], img: true, vu: "" };
  try {
    var garde = JSON.parse(localStorage.getItem(CLE) || "{}");
    if (Array.isArray(garde.src)) E.src = garde.src.filter(function (x) { return typeof x === "string"; });
    if (Array.isArray(garde.lus)) E.lus = garde.lus.filter(function (x) { return typeof x === "string"; });
    if (garde.img === false) E.img = false;
    if (typeof garde.vu === "string") E.vu = garde.vu;
  } catch (e) { /* stockage fermé : la page marche sans mémoire */ }
  function garder() {
    try { localStorage.setItem(CLE, JSON.stringify(E)); } catch (e) { /* idem */ }
  }
  var lus = new Set(E.lus);
  var vuAvant = E.vu;

  /* ── les sites : ils sont écrits dans la page, on les relit ── */
  var SOURCES = {};
  filtres.querySelectorAll("[data-site]").forEach(function (b) {
    var id = b.getAttribute("data-site");
    if (!id) return;
    var i = b.querySelector("i");
    SOURCES[id] = { nom: b.getAttribute("data-nom"), sigle: i ? i.textContent : id.slice(0, 2),
                    couleur: b.style.getPropertyValue("--src") };
  });
  E.src = E.src.filter(function (id) { return SOURCES[id]; });

  /* ── les dates, dites comme on les dit ── */
  var H = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
  var J = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  function cleJour(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function nomJour(cle) {
    var auj = new Date(), hier = new Date(auj.getTime() - 864e5);
    var p = cle.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
    var long = J.format(d);
    if (cle === cleJour(auj)) return ["Aujourd'hui", long];
    if (cle === cleJour(hier)) return ["Hier", long];
    var mots = long.split(" ");
    return [mots[0].charAt(0).toUpperCase() + mots[0].slice(1), mots.slice(1).join(" ")];
  }
  function ilYA(d) {
    var m = Math.max(0, Math.round((Date.now() - d.getTime()) / 6e4));
    if (m < 1) return "à l'instant";
    if (m < 60) return "il y a " + m + " min";
    var h = Math.round(m / 60);
    if (h < 24) return "il y a " + h + " h";
    var j = Math.round(h / 24);
    return "il y a " + j + " jour" + (j > 1 ? "s" : "");
  }

  /* ── fabriquer une ligne ── */
  var connus = new Map();          // adresse → { a, li }
  function ligne(a) {
    var src = SOURCES[a.s] || { nom: a.s, sigle: a.s.slice(0, 2), couleur: "" };
    var d = new Date(a.d);
    var li = document.createElement("li");
    li.className = "actu-art";
    li.dataset.site = a.s;
    li.dataset.d = a.d;
    if (lus.has(a.u)) li.dataset.lu = "1";
    var lien = document.createElement("a");
    lien.href = a.u;
    lien.rel = "noopener";
    var vig = document.createElement("span");
    vig.className = "actu-vignette";
    vig.setAttribute("aria-hidden", "true");
    if (src.couleur) vig.style.setProperty("--src", src.couleur);
    var sigle = document.createElement("b");
    sigle.textContent = src.sigle;
    vig.appendChild(sigle);
    var txt = document.createElement("span");
    txt.className = "actu-texte";
    var s = document.createElement("span");
    s.className = "actu-source";
    s.textContent = src.nom;
    var t = document.createElement("span");
    t.className = "actu-titre";
    t.textContent = a.t;
    var m = document.createElement("span");
    m.className = "actu-meta";
    var heure = document.createElement("time");
    heure.dateTime = a.d;
    heure.textContent = H.format(d);
    m.appendChild(heure);
    var lu = document.createElement("span");
    lu.className = "actu-etat-lu";
    lu.textContent = lus.has(a.u) ? " · lu" : "";
    m.appendChild(lu);
    txt.appendChild(s); txt.appendChild(t); txt.appendChild(m);
    lien.appendChild(vig); lien.appendChild(txt);
    li.appendChild(lien);
    if (E.img) image(li, a);
    return li;
  }
  /* La vignette vient du site de l'article, au moment où la ligne approche
     de l'écran. Si elle ne vient pas, les initiales restent : la ligne n'a
     jamais de trou. */
  function image(li, a) {
    if (!a.i || a.i.indexOf("https://") !== 0) return;
    var vig = li.querySelector(".actu-vignette");
    if (!vig || vig.querySelector("img")) return;
    var im = document.createElement("img");
    im.alt = "";
    im.loading = "lazy";
    im.decoding = "async";
    im.referrerPolicy = "no-referrer";
    im.width = 76; im.height = 76;
    /* « load » dit que l'image est arrivée, pas qu'elle est prête à être
       peinte : montrée trop tôt, elle laissait un carré pâle à la place des
       initiales. On attend donc qu'elle soit décodée. */
    im.addEventListener("load", function () {
      var montrer = function () { im.classList.add("la"); };
      if (im.decode) im.decode().then(montrer, montrer); else montrer();
      // un onglet en arrière-plan ne décode pas : l'image ne reste pas cachée pour autant
      setTimeout(montrer, 1200);
    });
    im.addEventListener("error", function () { im.remove(); });
    im.src = a.i;
    vig.appendChild(im);
  }

  /* ── ranger une ligne dans son jour, à sa place ── */
  function section(cle) {
    var sec = liste.querySelector('.actu-jour[data-jour="' + cle + '"]');
    if (sec) return sec;
    sec = document.createElement("section");
    sec.className = "actu-jour";
    sec.dataset.jour = cle;
    var h = document.createElement("h2");
    h.className = "actu-jour-titre";
    var n = nomJour(cle);
    var fort = document.createElement("span");
    fort.textContent = n[0];
    var petit = document.createElement("small");
    petit.textContent = n[1];
    h.appendChild(fort); h.appendChild(petit);
    var ul = document.createElement("ul");
    ul.className = "actu-articles";
    sec.appendChild(h); sec.appendChild(ul);
    var apres = null;
    liste.querySelectorAll(".actu-jour").forEach(function (x) {
      if (!apres && x.dataset.jour < cle) apres = x;
    });
    liste.insertBefore(sec, apres);
    return sec;
  }
  function ajouter(articles, comment) {
    var neufs = [];
    articles.forEach(function (a) {
      if (!a || typeof a.u !== "string" || a.u.indexOf("https://") !== 0 || typeof a.t !== "string"
          || isNaN(Date.parse(a.d)) || connus.has(a.u)) return;
      var li = ligne(a);
      var ul = section(cleJour(new Date(a.d))).querySelector(".actu-articles");
      var apres = null, enfants = ul.children;
      for (var i = 0; i < enfants.length; i++) {
        if (enfants[i].dataset.d < a.d) { apres = enfants[i]; break; }
      }
      ul.insertBefore(li, apres);
      connus.set(a.u, { a: a, li: li });
      if (vuAvant && a.d > vuAvant) li.dataset.neuf = "1";
      if (comment === "arrive") { li.dataset.neuf = "1"; li.classList.add("arrive"); }
      neufs.push(li);
    });
    return neufs;
  }
  liste.addEventListener("animationend", function (e) {
    var li = e.target.closest && e.target.closest(".actu-art");
    if (li && e.target === li) { li.classList.remove("entre", "arrive"); li.style.removeProperty("--i"); }
  });

  /* ── le choix des sites ── */
  function choisi(id) { return !E.src.length || E.src.indexOf(id) > -1; }
  function peindrePuces() {
    filtres.querySelectorAll("[data-site]").forEach(function (b) {
      var id = b.getAttribute("data-site");
      b.setAttribute("aria-pressed", String(id ? E.src.indexOf(id) > -1 : !E.src.length));
    });
  }
  function filtrer() {
    var visibles = 0, auj = cleJour(new Date()), aujourdhui = 0;
    liste.querySelectorAll(".actu-jour").forEach(function (sec) {
      var n = 0;
      sec.querySelectorAll(".actu-art").forEach(function (li) {
        var ok = choisi(li.dataset.site);
        li.hidden = !ok;
        if (ok) n++;
      });
      sec.hidden = !n;
      visibles += n;
      if (sec.dataset.jour === auj) aujourdhui = n;
    });
    return { visibles: visibles, aujourdhui: aujourdhui };
  }
  filtres.addEventListener("click", function (e) {
    var b = e.target.closest("[data-site]");
    if (!b) return;
    var id = b.getAttribute("data-site");
    if (!id) E.src = [];
    else {
      var i = E.src.indexOf(id);
      if (i > -1) E.src.splice(i, 1); else E.src.push(id);
      if (E.src.length === Object.keys(SOURCES).length) E.src = [];
    }
    garder();
    peindrePuces();
    apresChangement();
  });

  /* ── l'état : ce que la page sait, en une ligne ── */
  var index = null, charges = 0, enCours = false, panne = false;
  function plusRecent() {
    var d = "";
    connus.forEach(function (x) { if (x.a.d > d) d = x.a.d; });
    return d;
  }
  function direEtat(force) {
    if (force) { etat.textContent = force; return; }
    var d = plusRecent();
    if (!d) { etat.textContent = ""; return; }
    var c = filtrer();
    var noms = E.src.length ? E.src.map(function (id) { return SOURCES[id].nom; }).join(", ") : "";
    etat.textContent = "Dernier titre " + ilYA(new Date(d)) + " · " + c.aujourdhui + " aujourd'hui"
      + (noms ? " · " + noms : "") + (panne ? " · hors ligne, relevé gardé en mémoire" : "");
  }
  function apresChangement() {
    var c = filtrer();
    var reste = index && charges < index.jours.length;
    suite.hidden = !reste;
    message.hidden = true;
    if (!c.visibles && !reste && connus.size) {
      message.hidden = false;
      message.querySelector("b").textContent = "Rien à afficher pour ce choix";
      message.querySelector("span").textContent = "Aucun titre relevé chez les sites choisis.";
      message.querySelector("button").hidden = false;
    }
    direEtat();
    // un choix étroit (un seul site) : on va chercher les jours d'avant
    if (c.visibles < 14 && reste && !enCours) jourSuivant();
  }

  /* ── lire les fichiers ── */
  function lire(nom) {
    return fetch(DONNEES + nom, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(nom + " : " + r.status);
      return r.json();
    });
  }
  function jourSuivant(comment) {
    if (enCours || !index || charges >= index.jours.length) return Promise.resolve();
    enCours = true;
    var j = index.jours[charges][0];
    return lire("jours/" + j + ".json").then(function (arts) {
      charges++;
      var neufs = ajouter(arts, comment);
      if (comment === "entre") neufs.slice(0, 16).forEach(function (li, i) {
        if (!choisi(li.dataset.site)) return;
        li.style.setProperty("--i", i); li.classList.add("entre");
      });
    }).catch(function () {
      panne = true;
    }).then(function () {
      enCours = false;
      apresChangement();
    });
  }
  suite.addEventListener("click", function () { jourSuivant(); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      if (es.some(function (x) { return x.isIntersecting; })) jourSuivant();
    }, { rootMargin: "700px 0px" }).observe(suite);
  }

  function erreur(titre, texte) {
    liste.textContent = "";
    liste.removeAttribute("aria-busy");
    suite.hidden = true;
    message.hidden = false;
    message.querySelector("b").textContent = titre;
    message.querySelector("span").textContent = texte;
    var b = message.querySelector("button");
    b.hidden = false;
    b.textContent = "Réessayer";
    b.dataset.role = "relancer";
    direEtat(" ");
  }
  message.querySelector("button").addEventListener("click", function () {
    if (this.dataset.role === "relancer") { location.reload(); return; }
    E.src = []; garder(); peindrePuces(); apresChangement();
  });

  /* ── revenir d'un article : la page se retrouve où on l'a laissée ── */
  var retour = null;
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    if (nav && nav.type === "back_forward") retour = JSON.parse(sessionStorage.getItem(RETOUR) || "null");
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch (e) { retour = null; }
  addEventListener("pagehide", function () {
    try {
      sessionStorage.setItem(RETOUR, JSON.stringify({ n: charges, y: Math.round(scrollY) }));
    } catch (e) { /* tant pis */ }
    var d = plusRecent();
    if (d) { E.vu = d; garder(); }
  });

  /* Revenir à sa place se fait d'un coup. Le site défile en douceur
     (« scroll-behavior: smooth ») : sans cette parenthèse, la page repartait
     du haut et descendait cinq mille pixels sous les yeux du lecteur. */
  function sauter(y) {
    var d = document.documentElement, avant = d.style.scrollBehavior;
    d.style.scrollBehavior = "auto";
    scrollTo(0, y);
    requestAnimationFrame(function () { d.style.scrollBehavior = avant; });
  }

  function demarrer() {
    peindrePuces();
    bImages.setAttribute("aria-pressed", String(E.img));
    lire("index.json").then(function (ix) {
      if (!ix || !Array.isArray(ix.jours) || !ix.jours.length) {
        erreur("Pas encore de relevé", "Le premier relevé des titres n'a pas encore eu lieu. Il passe toutes les heures.");
        message.querySelector("button").hidden = true;
        return;
      }
      index = ix;
      liste.textContent = "";
      liste.removeAttribute("aria-busy");
      var combien = retour && retour.n > 0 ? Math.min(retour.n, index.jours.length) : 1;
      var comment = retour ? "" : "entre";
      var p = jourSuivant(comment);
      for (var i = 1; i < combien; i++) p = p.then(function () { return jourSuivant(); });
      return p.then(function () {
        // un début de journée presque vide : on montre aussi la veille
        if (!retour && connus.size < 24) return jourSuivant();
      }).then(function () {
        if (retour && retour.y) sauter(retour.y);
      });
    }).catch(function () {
      erreur("Le relevé ne répond pas", "Pas de connexion, et rien en mémoire sur cet appareil.");
    });
  }

  /* ── le relevé a-t-il bougé ? ── */
  var enAttente = [], dernierControle = Date.now();
  function controler(manuel) {
    if (!index) return Promise.resolve();
    dernierControle = Date.now();
    if (manuel) bRafraichir.classList.add("tourne");
    return lire("index.json").then(function (ix) {
      panne = false;
      if (!ix || !Array.isArray(ix.jours) || !ix.jours.length) return [];
      var avant = index.jours.map(function (x) { return x[0]; });
      var change = ix.maj !== index.maj;
      // les jours déjà chargés gardent leur rang : on ne remplace que la liste
      var neufsJours = ix.jours.filter(function (x) { return avant.indexOf(x[0]) < 0 && x[0] > avant[0]; });
      index = { maj: ix.maj, jours: neufsJours.concat(ix.jours.filter(function (x) { return avant.indexOf(x[0]) > -1; })) };
      charges += neufsJours.length;
      if (!change && !manuel) return [];
      var aLire = neufsJours.map(function (x) { return x[0]; }).concat([avant[0]]);
      return Promise.all(aLire.map(function (j) { return lire("jours/" + j + ".json"); })).then(function (lots) {
        var tous = [];
        lots.forEach(function (l) { l.forEach(function (a) { if (a && !connus.has(a.u)) tous.push(a); }); });
        return tous;
      });
    }).then(function (neufs) {
      neufs = neufs || [];
      var visibles = neufs.filter(function (a) { return choisi(a.s); });
      if (neufs.length && (manuel || scrollY < 260 || !visibles.length)) {
        ajouter(neufs, "arrive");
        apresChangement();
      } else if (neufs.length) {
        enAttente = enAttente.concat(neufs);
        var n = enAttente.filter(function (a) { return choisi(a.s); }).length;
        pastille.querySelector("span").textContent = n + (n > 1 ? " nouveaux titres" : " nouveau titre");
        pastille.classList.add("visible");
      } else if (manuel) {
        direEtat("Rien de neuf depuis le dernier relevé.");
        setTimeout(direEtat, 2600);
      }
    }).catch(function () {
      panne = true;
      if (manuel) { direEtat("Pas de connexion : le relevé affiché est celui gardé en mémoire."); setTimeout(direEtat, 3200); }
    }).then(function () { bRafraichir.classList.remove("tourne"); });
  }
  pastille.addEventListener("click", function () {
    pastille.classList.remove("visible");
    ajouter(enAttente, "arrive");
    enAttente = [];
    apresChangement();
    scrollTo({ top: 0, behavior: document.documentElement.dataset.anim === "0" ? "auto" : "smooth" });
  });
  bRafraichir.addEventListener("click", function () { controler(true); });
  setInterval(function () {
    if (document.visibilityState === "visible") { controler(false); direEtat(); }
  }, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - dernierControle > 90 * 1000) controler(false);
  });
  addEventListener("pageshow", function (e) {
    // la page est ressortie telle quelle de la mémoire du navigateur
    if (e.persisted) { direEtat(); controler(false); }
  });

  /* ── les images : un interrupteur, pour qui compte ses données ── */
  bImages.addEventListener("click", function () {
    E.img = !E.img;
    garder();
    bImages.setAttribute("aria-pressed", String(E.img));
    connus.forEach(function (x) {
      if (E.img) image(x.li, x.a);
      else { var im = x.li.querySelector(".actu-vignette img"); if (im) im.remove(); }
    });
  });

  /* ── un article ouvert est un article lu ── */
  function marquer(e) {
    var lien = e.target.closest && e.target.closest(".actu-art a");
    if (!lien || (e.type === "auxclick" && e.button !== 1)) return;
    var u = lien.getAttribute("href");
    if (lus.has(u)) return;
    lus.add(u);
    E.lus.push(u);
    if (E.lus.length > 600) E.lus = E.lus.slice(-600);
    garder();
    var li = lien.parentNode;
    li.dataset.lu = "1";
    li.removeAttribute("data-neuf");
    var m = li.querySelector(".actu-etat-lu");
    if (m) m.textContent = " · lu";
  }
  liste.addEventListener("click", marquer);
  liste.addEventListener("auxclick", marquer);

  /* ── la rangée des sites se cale sous l'en-tête, quel qu'il soit ── */
  function caler() {
    /* Trois barres peuvent tenir le haut de l'écran selon l'appareil : celle
       du téléphone, la barre de page de l'ordinateur, l'en-tête du site. On
       ne devine pas laquelle : on prend celles qui sont affichées ET
       collantes, et la plus basse fixe le niveau. Première version : elle
       ne connaissait que deux des trois, et sur ordinateur la rangée des
       sites passait par-dessus la navigation. */
    var h = 0;
    document.querySelectorAll(".tel-tete, .lan-actions-page, .app-tete").forEach(function (b) {
      var cs = getComputedStyle(b);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      if (cs.position !== "sticky" && cs.position !== "fixed") return;
      h = Math.max(h, (parseFloat(cs.top) || 0) + b.offsetHeight);
    });
    var cp = getComputedStyle(page);
    page.style.setProperty("--actu-marge",
      Math.max(0, Math.min(parseFloat(cp.paddingLeft) || 0, parseFloat(cp.paddingRight) || 0)) + "px");
    page.style.setProperty("--actu-haut", h + "px");
    pastille.style.setProperty("--actu-haut", h + "px");
    filtres.classList.toggle("colle", filtres.getBoundingClientRect().top <= h + 1 && scrollY > 4);
  }
  var attente = false;
  addEventListener("scroll", function () {
    if (attente) return;
    attente = true;
    requestAnimationFrame(function () { attente = false; caler(); });
  }, { passive: true });
  addEventListener("resize", caler);
  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(caler);
    ro.observe(document.body);
  }
  // la coquille du téléphone est posée par app.js, chargé après ce script
  addEventListener("load", caler);
  setTimeout(caler, 400);

  /* Le banc de rendu ne voit pas une liste vide : la page sait se dire en
     panne (même principe que la calculatrice et l'atelier). */
  window.ACTU = {
    diagnostic: function () {
      var c = filtrer();
      return { jours: index ? index.jours.length : 0, charges: charges, articles: connus.size,
               visibles: c.visibles, sources: Object.keys(SOURCES).length, panne: panne };
    }
  };

  demarrer();
})();
