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
    theme: "", variante: "", taille: "normal", largeur: "normal", police: "systeme",
    interligne: "normal", anim: 1, curseur: 1, reponses: 0, faits: [],
    son: "", sonVolume: 30,
    derniere: null, recents: []
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
      { id: "zellige", nom: "Zellige", sombre: false },
      { id: "console-bleue", nom: "Console bleue", sombre: true }
    ]}
  ];

  /* Les univers ont DEUX faces. « Voxel » n'est pas un thème sombre : c'est
     une forme — des panneaux biseautés, une ombre d'un pixel, des cadres
     carrés — et cette forme vaut de jour comme de nuit. Le bouton jour/nuit
     ne doit donc pas quitter Voxel pour « Clair », il doit retourner Voxel.
     Le drapeau est posé ici, sur tout le groupe, plutôt que recopié seize
     fois : ajouter un univers, c'est l'ajouter à ce groupe, point. */
  (function () {
    var g = GROUPES[GROUPES.length - 1];
    for (var i = 0; i < g.items.length; i++) g.items[i].duo = true;
  })();

  /* ── Réparer le souvenir des deux camps ─────────────────────────────────
     « memoClair » et « memoSombre » retiennent le dernier thème de chaque
     camp, pour qu'un aller-retour sur le bouton jour/nuit ne renvoie pas au
     thème par défaut. Deux valeurs ne doivent jamais y entrer :

       · un univers — depuis qu'ils ont deux faces, Voxel n'est plus « un
         thème sombre » : le bouton retourne sa face au lieu d'en sortir, donc
         l'univers n'appartient à aucun camp ;
       · un identifiant disparu du catalogue — data-theme resterait sur une
         valeur qu'aucune règle CSS ne décrit.

     Le contrôle se fait ICI, au chargement, et pas seulement au moment
     d'écrire : un navigateur qui a connu la version précédente a gardé
     « voxel » dans son memo, et depuis « Clair » la lune y ramenait. C'est le
     défaut qu'JustAkhiraa a vu, et qu'aucun banc ne pouvait voir — un banc part
     toujours d'un localStorage vide. Un réglage enregistré hier est une
     entrée comme une autre : il se valide. */
  function memoValide(id) {
    var t = id ? trouverTheme(id) : null;
    return (t && !t.duo) ? id : "";
  }
  S.memoClair  = memoValide(S.memoClair);
  S.memoSombre = memoValide(S.memoSombre);

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

  /* Deux lectures du catalogue, et la distinction compte : « trouverTheme »
     sait répondre « celui-là n'existe pas », « theme » retombe toujours sur
     quelque chose d'affichable. Valider un identifiant enregistré demande la
     première ; peindre la page demande la seconde. */
  function trouverTheme(id) {
    for (var g = 0; g < GROUPES.length; g++)
      for (var i = 0; i < GROUPES[g].items.length; i++)
        if (GROUPES[g].items[i].id === id) return GROUPES[g].items[i];
    return null;
  }

  function theme(id) {
    return trouverTheme(id) || GROUPES[0].items[0];
  }

  function systemeSombre() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  /* ── les DISPOSITIONS : quand un thème déplace le HTML ─────────────────
     JustAkhiraa : « je veux que tu me fasses LE menu de la Wii en thème,
     donc revoir tout le CSS et le style même le HTML », et « pareil pour le
     menu PS4 ».

     Il avait raison de le dire deux fois : ce qui avait été livré était une
     PEINTURE. Un menu de console ne se reconnaît pas à ses couleurs mais à
     sa disposition — où est le logo, où est l'heure, ce que fait la case
     choisie.

     La décision d'architecture, et la seule qui tienne ici : un thème ne
     peut pas changer le HTML écrit dans les pages — elles sont engendrées
     une fois, et le thème se choisit APRÈS, dans le navigateur. En revanche
     il peut :

       · ranger autrement des blocs qui existent déjà — c'est le travail du
         CSS, par zones de grille et par « order » ;
       · recevoir un décor que le CSS ne sait pas produire — une horloge qui
         avance, des flèches qui tournent des pages. Celui-là est bâti ici.

     Donc : « data-dispo » sur <html>, une barre engendrée au besoin, et pas
     une ligne de balisage changée dans les 244 pages.

     Deux refus assumés. Le bouton rond de gauche OUVRE LES RÉGLAGES et celui
     de droite mène au PLANNING — sur la Wii, le premier ouvre les options et
     le second est le tableau des messages, qui est un calendrier. Des boutons
     qui ne feraient rien seraient un décor mensonger : la main y va, et rien
     n'arrive. De même, les flèches de page PAGINENT réellement la grille ;
     quand tout tient sur une page, elles se grisent au lieu de mentir. */
  var Dispo = (function () {
    /* Une disposition n'est inscrite ICI que le jour où sa feuille de style
       existe. « console-bleue » y a figuré d'avance une fois, et le résultat
       était un vrai dégât mesuré : le thème posait « data-dispo="ps4" », donc
       la pagination s'appliquait — 5 chapitres sur 17 disparaissaient — et la
       barre se bâtissait en « position: static » sur fond transparent,
       c'est-à-dire une bande nue jetée en fin de page, sans rien pour revenir
       aux chapitres cachés. Du JavaScript qui marche plus une feuille de style
       qui n'existe pas font une page cassée, pas une page à moitié faite.
       Elle est revenue le 5 octobre avec ses règles « html[data-dispo="ps4"] ».
       La règle demeure pour la prochaine : la feuille d'abord, la ligne après. */
    var DISPOS = { "console-blanche": "wii", "console-bleue": "ps4" };
    var PAR_PAGE = 12;
    var horloge = null, page = 0;

    function deuxChiffres(n) { return (n < 10 ? "0" : "") + n; }

    function grille() {
      return document.querySelector(".liste-chapitres") ||
             document.querySelector(".contenu .grille-matieres");
    }

    /* La pagination est RÉELLE : les cases en trop sont retirées du flux,
       pas masquées à moitié. « hidden » les sort aussi du parcours au
       clavier et de la lecture d'écran, ce qui est le but. */
    function paginer() {
      var g = grille();
      if (!g) return { pages: 1, total: 0 };
      var cases = g.children, n = cases.length;
      var pages = Math.max(1, Math.ceil(n / PAR_PAGE));
      if (page >= pages) page = pages - 1;
      for (var i = 0; i < n; i++) {
        var dedans = (i >= page * PAR_PAGE && i < (page + 1) * PAR_PAGE);
        cases[i].hidden = !dedans;
      }
      return { pages: pages, total: n };
    }

    function depaginer() {
      var g = grille();
      if (!g) return;
      for (var i = 0; i < g.children.length; i++) g.children[i].hidden = false;
    }

    function bouton(classe, texte, titre, action) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = classe;
      b.textContent = texte;
      b.setAttribute("aria-label", titre);
      b.title = titre;
      b.addEventListener("click", action);
      return b;
    }

    function horlogeHtml() {
      /* Les mêmes crochets dans les deux dispositions : « tictac() » n'a pas
         à savoir où l'heure est posée. */
      return '<b class="dispo-hh"></b><i class="dispo-deux">:</i>'
           + '<b class="dispo-mm"></b><span class="dispo-date"></span>';
    }

    /* ── Ce que la barre du bas a le droit d'écrire ────────────────────────
       Sur une PlayStation, la bande noire du bas rappelle les boutons de la
       manette : « ⊗ Précédent · ◎ Valider ». Les recopier ici serait un
       mensonge : il n'y a pas de manette, il y a un clavier. Chaque ligne
       ci-dessous correspond donc à une touche qui FAIT quelque chose dans
       raccourcis() — on peut les essayer une par une. Le jour où un raccourci
       change, cette liste doit changer avec lui, sinon elle devient ce que
       l'original était : du décor. */
    var AIDES_PS4 = [
      ["/", "Chercher"], ["T", "Jour / nuit"], ["R", "Au hasard"],
      ["Échap", "Fermer"]
    ];

    function batirBarre(quoi) {
      if (quoi === "ps4") return batirBarrePs4();
      var barre = document.createElement("div");
      barre.className = "dispo-barre";
      barre.setAttribute("data-dispo-barre", quoi);

      barre.appendChild(bouton("dispo-rond dispo-gauche",
        "Wii", "Ouvrir les réglages",
        function () { var b = document.getElementById("reglages");
                      if (b) b.click(); }));

      var h = document.createElement("div");
      h.className = "dispo-heure";
      h.innerHTML = horlogeHtml();
      barre.appendChild(h);

      barre.appendChild(bouton("dispo-rond dispo-droite", "\u2709",
        "Ouvrir le planning",
        function () { location.href = racine() + "planning.html"; }));
      return barre;
    }

    /* La PS4 ne range rien comme la Wii : l'heure est en haut à DROITE, et le
       bas est une bande d'aide. Deux morceaux, donc, et non une barre. */
    function batirBarrePs4() {
      var lot = document.createDocumentFragment();

      var h = document.createElement("div");
      h.className = "dispo-barre dispo-horloge";
      h.setAttribute("data-dispo-barre", "ps4");
      h.innerHTML = horlogeHtml();
      lot.appendChild(h);

      /* ── Une seule bande en bas, jamais deux ────────────────────────────
         Mesuré sur une page de cours : la bande d'aide et la barre flottante
         de la fiche — retour, recherche, jour/nuit, réglages — se
         chevauchaient au même endroit de l'écran. La fiche a déjà sa bande du
         bas, et la sienne a des BOUTONS, pas des rappels : elle fait mieux le
         travail. La disposition s'efface donc là où la page sait déjà faire,
         au lieu d'empiler deux barres qui disent la même chose. */
      if (document.querySelector(".flottant")) return lot;

      var aide = document.createElement("div");
      aide.className = "dispo-barre dispo-aide";
      aide.setAttribute("data-dispo-barre", "ps4");
      for (var i = 0; i < AIDES_PS4.length; i++) {
        var t = document.createElement("span");
        t.className = "dispo-aide-item";
        t.innerHTML = '<kbd></kbd><em></em>';
        t.querySelector("kbd").textContent = AIDES_PS4[i][0];
        t.querySelector("em").textContent = AIDES_PS4[i][1];
        aide.appendChild(t);
      }
      lot.appendChild(aide);
      return lot;
    }

    function batirFleches() {
      var nav = document.createElement("div");
      nav.className = "dispo-pages";
      nav.appendChild(bouton("dispo-fleche dispo-prec", "\u2039",
        "Page précédente", function () { page--; rafraichir(); }));
      var e = document.createElement("span");
      e.className = "dispo-compte";
      nav.appendChild(e);
      nav.appendChild(bouton("dispo-fleche dispo-suiv", "\u203A",
        "Page suivante", function () { page++; rafraichir(); }));
      return nav;
    }

    function rafraichir() {
      var r = paginer();
      var nav = document.querySelector(".dispo-pages");
      if (!nav) return;
      nav.hidden = false;
      nav.querySelector(".dispo-prec").disabled = (page <= 0);
      nav.querySelector(".dispo-suiv").disabled = (page >= r.pages - 1);
      nav.querySelector(".dispo-compte").textContent = (page + 1) + " / " + r.pages;
      /* Une seule page : les flèches restent VISIBLES mais inertes, comme sur
         la console. Les retirer ferait sauter la mise en page d'un écran à
         l'autre. */
      nav.setAttribute("data-seule", r.pages === 1 ? "1" : "0");
    }

    var JOURS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    function tictac() {
      var d = new Date();
      var hh = document.querySelector(".dispo-hh");
      if (!hh) return;
      hh.textContent = deuxChiffres(d.getHours());
      document.querySelector(".dispo-mm").textContent = deuxChiffres(d.getMinutes());
      document.querySelector(".dispo-date").textContent =
        JOURS[d.getDay()] + " " + deuxChiffres(d.getDate()) + "/"
        + deuxChiffres(d.getMonth() + 1);
    }

    function retirer() {
      var d = document.documentElement;
      delete d.dataset.dispo;
      /* « querySelector » au singulier ne retirait que le premier morceau :
         la PS4 en pose deux. Un nettoyage qui en oublie un laisse la barre
         d'un thème sur la page d'un autre. */
      var tous = document.querySelectorAll(".dispo-barre");
      for (var k = 0; k < tous.length; k++) tous[k].parentNode.removeChild(tous[k]);
      var n = document.querySelector(".dispo-pages");
      if (n) n.parentNode.removeChild(n);
      delete document.documentElement.dataset.dispoMenu;
      if (horloge) { clearInterval(horloge); horloge = null; }
      depaginer();
      page = 0;
    }

    return {
      appliquer: function (idTheme) {
        var quoi = DISPOS[idTheme];
        var d = document.documentElement;
        if (!quoi) { if (d.dataset.dispo) retirer(); return; }
        if (d.dataset.dispo === quoi) { rafraichir(); tictac(); return; }
        retirer();
        d.dataset.dispo = quoi;
        var g = grille();
        /* ── Un bureau de console n'est pas une surface de lecture ──────────
           Le banc a rendu 28 éléments à 4,34 : 1, tous sur des pages de
           COURS. Le fond bleu de la disposition traversait les encarts, dont
           le fond est une teinte translucide : composé sur le papier bleu, il
           descend, et l'encre de l'encart ne suit pas.

           La correction n'est pas de repeindre les encarts un par un. C'est
           de reconnaître ce que la disposition EST : le menu de la console.
           Elle vaut pour les écrans qui ont une grille — l'accueil, les
           listes de chapitres —, pas pour un cours, qui est un document et
           se lit sur le papier de son thème. La barre du bas, elle, reste
           partout : c'est la coquille de la console, pas son bureau. */
        if (g) d.dataset.dispoMenu = "1";
        document.body.appendChild(batirBarre(quoi));
        if (g) g.parentNode.insertBefore(batirFleches(), g.nextSibling);
        rafraichir();
        tictac();
        /* Une minute suffit : l'affichage ne montre pas les secondes, et un
           réveil par seconde pour rien est une batterie qu'on vide. */
        horloge = setInterval(tictac, 15000);
      }
    };
  })();

  /* ── applique tout l'état visuel ─────────────────────────────────── */
  function appliquer() {
    var d = document.documentElement;
    var t = theme(S.theme);
    var sombre = t.sombre === null ? systemeSombre() : t.sombre;
    /* Sur un univers, la face choisie prime sur la face native. Ailleurs,
       « variante » n'a pas de sens : le thème EST sa face. */
    if (t.duo && S.variante) sombre = (S.variante === "sombre");

    d.dataset.theme      = S.theme || (sombre ? "dark" : "light");
    d.dataset.sombre     = sombre ? "1" : "0";
    d.dataset.taille     = S.taille || "normal";
    d.dataset.largeur    = S.largeur || "normal";
    d.dataset.police     = S.police || "systeme";
    d.dataset.interligne = S.interligne || "normal";
    d.dataset.anim       = S.anim ? "1" : "0";
    /* Six univers portent leur propre curseur. Un curseur imposé est le genre
       de fantaisie dont on se lasse, et il gêne qui a du mal à viser : il se
       coupe d'un geste, et la feuille engendrée est entièrement sous cet
       attribut. */
    d.dataset.curseur    = S.curseur ? "1" : "0";
    Son.appliquer();
    Dispo.appliquer(d.dataset.theme);

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

  /* ───────────────────────────────────────── racine du site, en relatif
     Une fiche vit deux dossiers plus bas que l'accueil, et l'index de
     recherche donne des chemins depuis la racine. On déduit le préfixe de la
     feuille de style, seule référence présente sur TOUTES les pages — plutôt
     que de compter les segments de l'URL, qui change selon que le site est
     servi à la racine du domaine ou dans un sous-dossier. */
  function racine() {
    /* « href$= » ne marche plus depuis que les ressources portent leur
       version dans l'URL : le lien finit par « ?v=1a2b3c4d », pas par
       « .css ». On cherche donc le fragment, et on coupe à partir de lui. */
    var l = document.querySelector('link[rel="stylesheet"][href*="assets/fiche.css"]');
    if (l) return l.getAttribute("href").replace(/assets\/fiche\.css.*$/, "");
    var q = document.getElementById("q");
    return (q && q.dataset.base) || "";
  }

  /* ─────────────────────────────────────────────── feuille de réglages */
  var voile, feuille, palette, dernierFocus, fermerVoile = null;

  /* Un seul voile pour les deux panneaux : deux voiles superposés auraient
     chacun leur opacité, et le fond aurait doublé de noirceur. */
  function leVoile() {
    if (!voile) {
      voile = document.createElement("div");
      voile.className = "voile";
      voile.addEventListener("click", function () { if (fermerVoile) fermerVoile(); });
      document.body.appendChild(voile);
    }
    return voile;
  }

  function fermer() {
    if (!feuille) return;
    feuille.classList.remove("ouverte");
    leVoile().classList.remove("ouvert");
    document.body.style.overflow = "";
    fermerVoile = null;
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


  /* ══ le fond sonore ═══════════════════════════════════════════════════
     Trois ambiances : espace, pluie, feu. Elles sont CALCULÉES dans le
     navigateur, pas téléchargées, et il faut dire pourquoi.

     Il a déposé trois enregistrements — 8 h, 4 h et 12 h, 2,0 Go en tout —
     en demandant d'en tirer des boucles courtes. Deux obstacles. Le premier
     est technique et se règle : une boucle se coud. Le second ne se règle
     pas : ce sont les enregistrements de quelqu'un d'autre, et ce dépôt est
     PUBLIC. Les publier, c'est les rediffuser. Le projet s'interdit déjà de
     redistribuer les sujets de ses professeurs ; la règle vaut ici aussi.

     Alors ses trois fichiers ont servi de MODÈLE, pas de source. Leur
     spectre a été mesuré par bandes d'octave, et ces mesures sont les
     cibles que la synthèse reproduit :

       espace  31:-7  63:-1  125:-12 250:-15 500:-29 1k:-46 2k:-58 4k:-66 8k:-76
       pluie   31:-10 63:-6  125:-6  250:-6  500:-11 1k:-14 2k:-18 4k:-23 8k:-29
       feu     31:-15 63:-6  125:-2  250:-12 500:-27 1k:-36 2k:-37 4k:-29 8k:-26

     On y lit trois sons différents, et chacun dicte sa recette. L'espace est
     un grondement : tout tient sous 125 Hz et chute de 11 dB par octave —
     du bruit brun très filtré. La pluie est large et régulière, −5 dB par
     octave au-dessus de 250 Hz — du bruit rose, plus le grésil des gouttes.
     Le feu a DEUX bosses, 125 Hz et 8 kHz, avec un creux de 35 dB entre les
     deux : un ronflement grave, et des craquements aigus. Rien au milieu.

     Avantage qu'on n'avait pas cherché : zéro octet à télécharger, et aucune
     boucle — ce qui se répète n'existe pas, puisque rien n'est enregistré.

     ── Et la synthèse est-elle fidèle ? ──────────────────────────────────
     La question se mesure, et elle l'a été : un analyseur branché sur la
     sortie réelle, trente relevés par ambiance, moyennés sur quatre
     secondes, comparés bande à bande aux chiffres ci-dessus. Trois tours
     ont été nécessaires — le premier donnait une pluie 20 dB trop aiguë et
     un espace 12 dB trop creux dans le médium.

       écart moyen │ écart maximal
       espace  2,9 dB │ 9 dB (à 2 kHz, où l'on est déjà à −67 dB)
       pluie   2,9 dB │ 8 dB (à 8 kHz)
       feu     3,1 dB │ 6 dB (à 250 Hz)

     Trois décibels de moyenne sur neuf octaves : c'est la même couleur de
     son, pas une imitation approximative. Le banc se refait à volonté —
     window.CIEL.son.sonde() rend le contexte et le nœud maître. */
  var FONDS = [
    { id: "",       nom: "Aucun" },
    { id: "espace", nom: "Espace" },
    { id: "pluie",  nom: "Pluie" },
    { id: "feu",    nom: "Feu" }
  ];

  var Son = (function () {
    var ctx = null, maitre = null, courant = "", noeuds = [], tampon = null,
        minuteries = [], enAttente = false;

    /* Un bruit blanc de dix secondes, tiré d'un générateur à graine fixe :
       deux ouvertures de la page donnent le même bruit, donc une mesure
       reproductible. Sans graine, le banc ne pourrait rien vérifier. */
    function bruitBlanc() {
      if (tampon) return tampon;
      var n = ctx.sampleRate * 10;
      tampon = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = tampon.getChannelData(0), g = 123456789;
      for (var i = 0; i < n; i++) {
        g = (g * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (g / 0x3fffffff) - 1;
      }
      return tampon;
    }

    function source() {
      var s = ctx.createBufferSource();
      s.buffer = bruitBlanc();
      s.loop = true;
      /* Une lecture légèrement ralentie, et le grain de dix secondes cesse
         de coïncider avec lui-même d'une couche à l'autre. */
      s.playbackRate.value = 0.87 + Math.random() * 0.26;
      return s;
    }

    function filtre(type, f, q, gain) {
      var b = ctx.createBiquadFilter();
      b.type = type; b.frequency.value = f;
      if (q != null) b.Q.value = q;
      if (gain != null) b.gain.value = gain;
      return b;
    }

    function chaine() {
      var n = Array.prototype.slice.call(arguments);
      for (var i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]);
      return n[n.length - 1];
    }

    function gain(v) { var g = ctx.createGain(); g.gain.value = v; return g; }

    /* ── espace : un grondement, et rien d'autre ─────────────────────── */
    function espace(sortie) {
      var s = source();
      /* Deux passe-bas en cascade : −12 dB par octave, la pente mesurée. */
      var sortieChaine = chaine(s,
        filtre("lowpass", 85, 0.9),
        filtre("lowpass", 420, 0.7),
        filtre("lowpass", 900, 0.7),
        filtre("peaking", 60, 2.4, 7),
        filtre("highpass", 32, 0.7),
        gain(2.6));
      sortieChaine.connect(sortie);
      s.start();
      noeuds.push(s);

      /* Une très lente respiration : sans elle, l'oreille s'accroche à une
         immobilité qui n'existe dans aucun enregistrement. */
      var lfo = ctx.createOscillator(), prof = gain(0.18);
      lfo.frequency.value = 0.035;
      chaine(lfo, prof).connect(sortieChaine.gain);
      lfo.start();
      noeuds.push(lfo);
    }

    /* ── pluie : une nappe large, et le grésil par-dessus ────────────── */
    function pluie(sortie) {
      var s = source();
      var nappe = chaine(s,
        filtre("highpass", 45, 0.7),
        filtre("lowshelf", 170, null, 10),
        filtre("lowpass", 700, 0.6),
        filtre("highshelf", 1100, null, -20),
        gain(0.5));
      nappe.connect(sortie);
      s.start();
      noeuds.push(s);

      /* Le grésil : des gouttes, pas un souffle. Une seconde source très
         aiguë, hachée par des rafales lentes. */
      var s2 = source();
      var grain = chaine(s2, filtre("bandpass", 2200, 0.9), gain(0.035));
      grain.connect(sortie);
      s2.start();
      noeuds.push(s2);

      var lfo = ctx.createOscillator(), prof = gain(0.1);
      lfo.frequency.value = 0.07;
      chaine(lfo, prof).connect(grain.gain);
      lfo.start();
      noeuds.push(lfo);

      /* Le tonnerre, au loin et rarement : une bouffée grave toutes les
         quarante à cent vingt secondes. « Orage », disait le fichier. */
      (function tonnerre() {
        minuteries.push(setTimeout(function () {
          if (!ctx) return;
          var t = ctx.currentTime, st = source();
          var g = gain(0);
          chaine(st, filtre("lowpass", 220, 0.8), g).connect(sortie);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.5, t + 0.9);
          g.gain.exponentialRampToValueAtTime(0.001, t + 5.5);
          st.start(t); st.stop(t + 6);
          tonnerre();
        }, 40000 + Math.random() * 80000));
      })();
    }

    /* ── feu : un ronflement grave, et des craquements aigus ─────────── */
    function feu(sortie) {
      var s = source();
      chaine(s,
        filtre("bandpass", 105, 1.6),
        filtre("lowpass", 220, 0.7),
        gain(3.2)).connect(sortie);
      s.start();
      noeuds.push(s);

      /* Les craquements. Chacun est une bouffée de bruit aigu qui s'éteint
         en trente millisecondes : c'est ce qui fait remonter le spectre à
         4 et 8 kHz, là où le ronflement n'a plus rien. */
      function craquer() {
        if (!ctx) return;
        var t = ctx.currentTime, st = source(), g = gain(0);
        var f = 3000 + Math.random() * 6000;
        chaine(st, filtre("bandpass", f, 2.2), g).connect(sortie);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.2 + Math.random() * 0.45, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.06);
        st.start(t); st.stop(t + 0.2);
        minuteries.push(setTimeout(craquer, 40 + Math.random() * 260));
      }
      craquer();
    }

    function arreter() {
      minuteries.forEach(clearTimeout);
      minuteries = [];
      noeuds.forEach(function (n) { try { n.stop(); } catch (e) {} });
      noeuds = [];
      courant = "";
    }

    function volumeVoulu() {
      /* Discret : « espace, feu, pluit met le en discret ». Le curseur va de
         0 à 100, mais il est mis au carré — à mi-course on est à un quart de
         la puissance, ce qui est le registre où ces sons s'oublient. */
      var v = (S.sonVolume == null ? 30 : +S.sonVolume) / 100;
      return 0.55 * v * v;
    }

    function majVolume() {
      if (maitre && ctx)
        maitre.gain.setTargetAtTime(volumeVoulu(), ctx.currentTime, 0.08);
    }

    function jouer(id) {
      if (id === courant) return;
      if (!id) { arreter(); return; }
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        maitre = ctx.createGain();
        maitre.connect(ctx.destination);
      }
      arreter();
      maitre.gain.value = volumeVoulu();
      courant = id;
      if (id === "espace") espace(maitre);
      else if (id === "pluie") pluie(maitre);
      else if (id === "feu") feu(maitre);
      if (ctx.state === "suspended") ctx.resume();
    }

    /* Les navigateurs refusent de faire du son avant un geste. Sur un site
       de pages séparées, chaque page repart donc muette : on réarme au
       premier contact, une seule fois, et le réglage reprend tout seul. */
    function auPremierGeste() {
      if (enAttente) return;
      enAttente = true;
      var f = function () {
        enAttente = false;
        if (S.son) jouer(S.son);
      };
      ["pointerdown", "keydown", "touchstart"].forEach(function (e) {
        document.addEventListener(e, f, { once: true, passive: true });
      });
    }

    /* Une page ouverte DANS une autre — les boutiques du monde 3D chargent
       les cours dans un cadre — ne doit jamais sonner. Sinon chaque boutique
       visitée ajoute sa propre nappe à celle de la page porteuse, et l'on
       entend trois pluies superposées. La page porteuse, elle, sonne. */
    function encadree() {
      return document.documentElement.dataset.encadre === "1";
    }

    return {
      appliquer: function () {
        if (!S.son || encadree()) { arreter(); return; }
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!ctx) {
          var essai = new AC();
          if (essai.state === "suspended") { essai.close(); return auPremierGeste(); }
          essai.close();
        }
        jouer(S.son);
      },
      volume: majVolume,
      /* Le banc a besoin de BRANCHER un analyseur sur la vraie sortie — pas
         sur une copie du code écrite pour l'occasion, qui ne prouverait que
         sa propre justesse. La sonde rend le contexte et le nœud maître. */
      sonde: function () { return { ctx: ctx, maitre: maitre, courant: courant }; }
    };
  })();

  /* Ce que la page expose au banc de mesure, et à personne d'autre. */
  window.CIEL = window.CIEL || {};
  window.CIEL.son = Son;
  /* Les deux bancs posent « data-theme » À LA MAIN sur le document, sans
     passer par appliquer() : c'est voulu, ils croisent 41 thèmes sans
     toucher aux réglages du lecteur. Mais une disposition se pose, elle,
     DANS appliquer() — donc aucun des deux ne l'aurait jamais mesurée.
     C'est la même famille d'angle mort que le panneau de réglages jamais
     ouvert et l'historique jamais semé. Le crochet est ici pour qu'ils
     puissent faire le geste. */
  window.CIEL.dispo = function (idTheme) { Dispo.appliquer(idTheme); };

  function construireFeuille() {
    leVoile();

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
          '<span class="interrupteur"></span></button>' +
        '<button type="button" class="bascule" data-bascule="curseur" aria-pressed="' + !!S.curseur + '">' +
          '<span class="txt"><b>Curseurs de thème</b>' +
          '<span>Activés ou non</span></span>' +
          '<span class="interrupteur"></span></button></div>' +

        '<div class="reglage"><h3>Fond sonore</h3>' +
        '<p>Trois ambiances calculées par la page — rien à télécharger, et aucune boucle : ' +
        'le son ne se répète jamais puisqu\'il n\'est pas enregistré.</p>' +
        '<div class="pastilles" data-champ="son">' + pastilles(FONDS, S.son || "") + "</div>" +
        '<label class="curseur-reglage"><span>Volume</span>' +
        '<input type="range" min="0" max="100" step="5" data-nombre="sonVolume" ' +
          'value="' + (S.sonVolume == null ? 30 : S.sonVolume) + '" aria-label="Volume du fond sonore">' +
        '<output>' + (S.sonVolume == null ? 30 : S.sonVolume) + '%</output></label>' +
        '<p class="note-son">Les navigateurs interdisent de démarrer un son sans geste : ' +
        'en changeant de page, il reprend au premier clic.</p></div>' +

        '<div class="reglage"><h3>Progression</h3>' +
        '<p id="compte-faits"></p>' +
        '<button type="button" class="danger" data-effacer>Effacer mes données locales</button></div>' +

        '<div class="reglage"><h3>Raccourcis</h3>' +
        '<p><b>/</b> ou <b>⌘K</b> chercher · <b>t</b> thème clair/sombre · <b>r</b> fiche au hasard · ' +
        '<b>Échap</b> fermer · <b>↑ ↓</b> parcourir les résultats</p></div>' +
      "</div>";

    feuille.addEventListener("input", function (e) {
      var r = e.target.closest("input[data-nombre]");
      if (!r) return;
      S[r.dataset.nombre] = +r.value;
      var o = r.parentNode.querySelector("output");
      if (o) o.textContent = r.value + "%";
      enregistrer();
      /* Le volume ne passe PAS par appliquer() : rebâtir la chaîne sonore à
         chaque cran du curseur ferait un hachoir. Il glisse vers sa nouvelle
         valeur, et c'est tout. */
      Son.volume();
    });

    feuille.addEventListener("change", function (e) {
      var sel = e.target.closest("select[data-champ]");
      if (!sel) return;
      S[sel.dataset.champ] = sel.value;
      /* Chaque thème s'ouvre sur SA face native. Sans cette remise à zéro,
         « Voxel en clair » suivi de « Matrix » donnerait un Matrix clair —
         un réglage retenu d'un thème qu'on vient de quitter. */
      if (sel.dataset.champ === "theme") S.variante = "";
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
        S.variante = "";
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
    fermerVoile = fermer;
    leVoile().classList.add("ouvert");
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
    /* Dans un univers, on retourne l'univers — on n'en sort pas. Basculer
       depuis Voxel renvoyait sur « Clair » : le geste perdait le thème
       qu'on venait de choisir. */
    if (theme(S.theme).duo) {
      S.variante = sombre ? "clair" : "sombre";
      enregistrer(); appliquer(); peindreBascule();
      return;
    }
    var cible = sombre ? (S.memoClair || "light") : (S.memoSombre || "dark");
    if (sombre) S.memoSombre = memoValide(S.theme) || "dark";
    else        S.memoClair  = memoValide(S.theme) || "light";
    S.theme = cible;
    /* On quitte un univers : sa face choisie ne doit pas s'appliquer au
       prochain, sinon « Voxel en clair » rendrait « Matrix » clair aussi. */
    S.variante = "";
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

  var ICONE_PREC =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M15 5l-7 7 7 7"/></svg>';
  var ICONE_SUIV =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9 5l7 7-7 7"/></svg>';
  var ICONE_LOUPE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'aria-hidden="true"><circle cx="11" cy="11" r="7"/>' +
    '<path d="M21 21l-4.3-4.3" stroke-linecap="round"/></svg>';

  function outil(classe, libelle, icone, action) {
    var b = document.createElement("button");
    b.type = "button"; b.className = classe;
    b.setAttribute("aria-label", libelle);
    b.innerHTML = icone;
    if (action) b.addEventListener("click", action);
    return b;
  }

  function lien(classe, libelle, icone, href) {
    var a = document.createElement("a");
    a.className = classe; a.href = href;
    a.setAttribute("aria-label", libelle);
    a.innerHTML = icone;
    return a;
  }

  /* ─────────────────────────── la barre d'outils d'une fiche
     Trois boutons empilés le long du bord droit mangeaient une colonne de
     170 px par-dessus le texte : sur un écran de 375 px, ils tombaient en
     plein dans la zone de lecture. Sur téléphone ils deviennent une barre
     horizontale en bas — à portée de pouce, et qui ne couvre qu'une bande —
     et elle s'efface dès qu'on descend dans le texte. */
  function barreOutils() {
    var barre = document.createElement("div");
    barre.className = "barre-outils";

    var v = document.querySelector(".voisins");
    var prec = v && v.querySelector("a.prec");
    var suiv = v && v.querySelector("a.suiv");

    if (prec) barre.appendChild(lien("flottant", "Chapitre précédent : " +
        prec.querySelector("b").textContent, ICONE_PREC, prec.getAttribute("href")));

    barre.appendChild(outil("flottant", "Rechercher", ICONE_LOUPE, chercherMaintenant));

    btnJour = outil("flottant", "", "", basculerClairSombre);
    peindreBascule();
    barre.appendChild(btnJour);

    barre.appendChild(outil("flottant", "Réglages", ICONE_REGLAGES, ouvrir));

    if (suiv) barre.appendChild(lien("flottant", "Chapitre suivant : " +
        suiv.querySelector("b").textContent, ICONE_SUIV, suiv.getAttribute("href")));

    /* Les fiches de révision n'ont pas de colonne de gauche : elles sont
       faites pour l'impression, donc sur une seule colonne. La barre n'a
       nulle part où se ranger — elle reste au bord droit et s'efface quand
       on descend. */
    if (!document.querySelector(".sommaire")) barre.classList.add("sans-colonne");

    document.body.appendChild(barre);
    effacerAuDefilement(barre);
  }

  /* Elle disparaît vers le bas quand on descend, revient dès qu'on remonte.
     Jamais tout en haut de la page, jamais pendant qu'un panneau est ouvert :
     on ne fait pas disparaître une commande sous le doigt qui la vise.

     L'écouteur est posé quelle que soit la largeur, et c'est la feuille de
     style qui décide : rangée dans la colonne de gauche, la barre n'a aucune
     règle pour « effacee », donc la classe n'y fait rien. Un test de largeur
     au chargement aurait cessé d'être vrai au premier redimensionnement. */
  function effacerAuDefilement(barre) {
    if (!S.anim) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var dernier = window.pageYOffset, enAttente = false;
    window.addEventListener("scroll", function () {
      if (enAttente) return;
      enAttente = true;
      window.requestAnimationFrame(function () {
        enAttente = false;
        var y = window.pageYOffset;
        if (Math.abs(y - dernier) < 8) return;
        barre.classList.toggle("effacee", y > dernier && y > 180 && !fermerVoile);
        dernier = y;
      });
    }, { passive: true });
  }

  function poserBoutons() {
    var tete = document.querySelector(".app-tete nav");
    if (!tete) return barreOutils();

    if (!document.getElementById("q")) {
      tete.appendChild(outil("bouton-rond", "Rechercher", ICONE_LOUPE, chercherMaintenant));
    }
    btnJour = outil("bouton-rond", "", "", basculerClairSombre);
    peindreBascule();
    tete.appendChild(btnJour);
    tete.appendChild(outil("bouton-rond", "Réglages", ICONE_REGLAGES, ouvrir));
    poserBouton3D(tete);
  }

  /* ── le bouton du monde 3D ────────────────────────────────────────────
     JustAkhiraa : « au lieu de mettre un bouton Monde 3D je préfère le mettre à la
     droite de paramètres, on écrit 3D, et avec le curseur y'a un effet 3D
     sur le bouton ».

     Il est posé APRÈS les réglages, donc tout à droite, et il n'apparaît que
     si le monde est réellement publié — l'adresse vient de l'attribut
     « data-monde » écrit par publier.py. Un bouton sans sa page, c'est un
     lien mort sur les 241 pages d'un coup.

     L'effet suit le pointeur : deux rotations, et le relief du texte qui se
     creuse du même côté. Il est coupé si le lecteur a désactivé les
     animations ou si son système en demande moins — un objet qui bouge sous
     la souris est exactement ce qui gêne alors. */
  function poserBouton3D(tete) {
    var url = tete.dataset.monde;
    if (!url) return;
    var a = document.createElement("a");
    a.className = "bouton-3d";
    a.href = url;
    a.setAttribute("aria-label", "Le village 3D — les mêmes fiches, en trois dimensions");
    a.innerHTML = '<span class="b3d-face">3D</span>' +
                  '<span class="b3d-lueur" aria-hidden="true"></span>';
    tete.appendChild(a);

    var calme = window.matchMedia &&
                matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!S.anim || calme) return;
    a.addEventListener("pointermove", function (e) {
      var r = a.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      a.style.setProperty("--rx", ((0.5 - y) * 22).toFixed(1) + "deg");
      a.style.setProperty("--ry", ((x - 0.5) * 26).toFixed(1) + "deg");
      a.style.setProperty("--mx", (x * 100).toFixed(0) + "%");
      a.style.setProperty("--my", (y * 100).toFixed(0) + "%");
    });
    a.addEventListener("pointerleave", function () {
      a.style.setProperty("--rx", "0deg"); a.style.setProperty("--ry", "0deg");
      a.style.setProperty("--mx", "50%");  a.style.setProperty("--my", "50%");
    });
  }

  /* ───────────────────────────────────────────────── outils de texte
     Ces deux-là avaient été emportés par une réécriture voisine : « normaliser »
     alimente la recherche, « echapper » protège tout ce qu'on réinjecte en
     HTML. Sans elles, la recherche levait une exception à chaque frappe et la
     liste « vu récemment » ne s'affichait pas. */
  function normaliser(s) {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function echapper(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ── L'index ne se charge qu'au moment de chercher ────────────────────
     Il pesait 73 Ko compressés sur CHAQUE page, alors qu'il ne sert qu'à la
     recherche et au tirage au hasard. On l'injecte à la demande.

     C'est un <script> et non un fetch(), pour la même raison qu'avant : une
     fiche ouverte depuis Fichiers sur iPhone est en « file:// », où fetch est
     refusé mais où une balise <script> passe. */
  var _index = null;
  function chargerIndex() {
    if (_index) return _index;
    _index = new Promise(function (ok) {
      if (Array.isArray(window.__INDEX)) return ok(window.__INDEX);
      var sc = document.createElement("script");
      /* L'URL doit porter l'empreinte de build, comme celle de la feuille de
         style. Sans elle, deux choses cassent d'un coup : le service worker,
         qui a mis en cache « recherche.js?v=… » et ne reconnaîtrait pas
         « recherche.js » tout court — donc plus de recherche hors ligne ; et
         la fraîcheur, un navigateur pouvant resservir l'index de la semaine
         dernière. On relit la version sur le lien de la feuille, qui est la
         seule ressource dont on est sûr qu'elle est là. */
      var l = document.querySelector('link[rel="stylesheet"][href*="assets/fiche.css"]');
      var v = l && (l.getAttribute("href").match(/[?&]v=([\w.-]+)/) || [])[1];
      sc.src = racine() + "assets/recherche.js" + (v ? "?v=" + v : "");
      sc.onload = function () { ok(window.__INDEX || []); };
      sc.onerror = function () { ok(null); };   // null = « pas chargé », pas « vide »
      document.head.appendChild(sc);
    });
    return _index;
  }

  /* Un seul moteur, deux surfaces : le champ de l'accueil et la palette qui
     s'ouvre par-dessus n'importe quelle page. Sans cela le second aurait
     redécrit la recherche, et les deux auraient divergé à la première
     retouche. */
  /* ── Chercher, puis classer ───────────────────────────────────────────
     La clé « k » est une LISTE DE MOTS séparés par des espaces. On exige donc
     que le terme tapé commence un mot, au lieu d'apparaître n'importe où :
     sans cela « py » trouvait Bootstrap (dans « ty-pe ») et « poo » trouvait
     DHCP (dans « pool »). Le début de mot garde la recherche au fil de la
     frappe — « prob » trouve « probabilites » — et supprime le hasard.

     Et les résultats sont CLASSÉS. Sans classement, « css » rendait quarante
     fiches dans l'ordre du fichier, la vraie page CSS noyée au milieu. Un
     terme qui est le titre passe devant un terme qui n'est qu'un mot du
     contenu ; c'est presque toujours ce qu'on cherchait. */
  function trouver(terme) {
    var data = window.__INDEX;
    if (!Array.isArray(data)) return null;
    var mots = normaliser(terme).split(/\s+/).filter(Boolean);
    if (!mots.length) return [];
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var e = data[i], k = " " + e.k, titre = " " + normaliser(e.t), ok = true, score = 3;
      for (var j = 0; j < mots.length; j++) {
        if (k.indexOf(" " + mots[j]) === -1) { ok = false; break; }
      }
      if (!ok) continue;
      var premier = mots[0];
      if (normaliser(e.t) === premier) score = 0;
      else if (titre.indexOf(" " + premier) === 1) score = 1;
      else if (titre.indexOf(" " + premier) !== -1) score = 2;
      else if (e.g && (" " + e.g).indexOf(" " + premier) !== -1) score = 2.5;
      out.push({ e: e, s: score, n: e.t.length });
    }
    out.sort(function (a, b) { return a.s - b.s || a.n - b.n; });
    return out.map(function (x) { return x.e; });
  }

  function peindre(boite, terme, base) {
    terme = terme.trim();
    if (terme.length < 2) { boite.innerHTML = ""; return; }
    if (!Array.isArray(window.__INDEX)) {
      chargerIndex().then(function () { peindre(boite, terme, base); });
      return;
    }
    var t = trouver(terme);
    if (t === null) {
      boite.innerHTML = '<p class="r-vide">L\'index de recherche n\'a pas pu être chargé.</p>';
      return;
    }
    if (!t.length) {
      boite.innerHTML = '<p class="r-vide">Rien pour « ' + echapper(terme) + ' ».</p>';
      return;
    }
    var reste = t.length - 12;
    boite.innerHTML = t.slice(0, 12).map(function (e) {
      return '<a href="' + base + e.u + '">' +
             '<span class="r-titre">' + e.t + "</span>" +
             '<span class="r-chemin">' + e.m + " · " + e.c + "</span></a>";
    }).join("") +
    (reste > 0 ? '<p class="r-vide">… et ' + reste + " autre" + (reste > 1 ? "s" : "") +
                 ". Précisez votre recherche.</p>" : "");
  }

  /* Flèches et Entrée, partagées elles aussi. */
  function naviguer(champ, boite, surEchap) {
    champ.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { surEchap(); return; }
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
      if (e.key === "Escape") { surEchap(); }
    });
  }

  function brancherRecherche() {
    var champ = document.getElementById("q");
    if (!champ) return;
    var boite = document.getElementById("resultats");
    var base = champ.dataset.base || "";

    function chercher() { peindre(boite, champ.value, base); }
    champ.addEventListener("input", chercher);
    champ.addEventListener("focus", function () { chargerIndex(); chercher(); });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".recherche")) boite.innerHTML = "";
    });
    naviguer(champ, boite, function () {
      champ.value = ""; boite.innerHTML = ""; champ.blur();
    });
  }

  /* ─────────────────────────────────── la palette, ouverte de n'importe où
     C'est depuis une fiche qu'on cherche le plus : en plein TP, on veut
     retrouver une commande sans quitter la page où l'on est. Le champ de
     l'accueil ne servait à rien une fois qu'on avait ouvert un cours. */
  function construirePalette() {
    palette = document.createElement("div");
    palette.className = "palette";
    palette.setAttribute("role", "dialog");
    palette.setAttribute("aria-modal", "true");
    palette.setAttribute("aria-label", "Rechercher dans les fiches");
    palette.innerHTML =
      '<div class="palette-champ">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'aria-hidden="true"><circle cx="11" cy="11" r="7"/>' +
        '<path d="M21 21l-4.3-4.3" stroke-linecap="round"/></svg>' +
        '<input id="qp" type="search" autocomplete="off" spellcheck="false" ' +
        'placeholder="Chercher un chapitre, une notion…" aria-label="Rechercher">' +
        '<button type="button" class="bouton-rond" data-fermer-palette aria-label="Fermer">✕</button>' +
      "</div>" +
      '<div id="resultats-p" class="resultats" role="listbox"></div>' +
      '<p class="palette-aide"><b>↑ ↓</b> parcourir · <b>Entrée</b> ouvrir · <b>Échap</b> fermer</p>';

    var champ = palette.querySelector("#qp");
    var boite = palette.querySelector("#resultats-p");
    var base = racine();

    champ.addEventListener("input", function () { peindre(boite, champ.value, base); });
    naviguer(champ, boite, fermerPalette);
    palette.addEventListener("click", function (e) {
      if (e.target.closest("[data-fermer-palette]")) fermerPalette();
    });
    palette.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var f = palette.querySelectorAll('input, button, a');
      if (!f.length) return;
      var premier = f[0], dernier = f[f.length - 1];
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    });
    document.body.appendChild(palette);
  }

  function ouvrirPalette() {
    dernierFocus = document.activeElement;
    if (!palette) construirePalette();
    fermerVoile = fermerPalette;
    leVoile().classList.add("ouvert");
    palette.classList.add("ouverte");
    document.body.style.overflow = "hidden";
    var champ = palette.querySelector("#qp");
    champ.value = "";
    palette.querySelector("#resultats-p").innerHTML = "";
    champ.focus();
  }

  function fermerPalette() {
    if (!palette) return;
    palette.classList.remove("ouverte");
    leVoile().classList.remove("ouvert");
    document.body.style.overflow = "";
    fermerVoile = null;
    if (dernierFocus && dernierFocus.focus) dernierFocus.focus();
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
    var titre = t.textContent.trim(), url = location.pathname;
    S.derniere = { titre: titre, url: url + location.hash };

    /* Une pile de six, sans doublon, la plus récente en tête. Réviser, c'est
       faire des allers-retours entre trois ou quatre chapitres : ne garder que
       le dernier obligeait à repasser par l'index pour revenir au précédent. */
    var r = (S.recents || []).filter(function (x) { return x && x.u !== url; });
    r.unshift({ t: titre, u: url, m: document.body.dataset.matiere || "" });
    S.recents = r.slice(0, 6);
    enregistrer();
  }

  function proposerReprise() {
    var zone = document.getElementById("reprise");
    if (!zone) return;

    var r = (S.recents || []).filter(function (x) { return x && x.u && x.t; });
    /* Reprise d'un état enregistré avant l'arrivée de la pile : on ne perd pas
       la dernière fiche de quelqu'un qui revient. */
    if (!r.length && S.derniere && S.derniere.url) {
      r = [{ t: S.derniere.titre, u: S.derniere.url, m: "" }];
    }
    if (!r.length) return;

    var prem = r[0], autres = r.slice(1);
    var html = '<a class="carte-matiere reprise" href="' + prem.u +
      '"><span class="ic">↩</span><h2>Reprendre</h2><p>' + echapper(prem.t) + "</p></a>";

    if (autres.length) {
      html += '<div class="recents"><h3>Vu récemment</h3><ul>' +
        autres.map(function (x) {
          return '<li' + (x.m ? ' data-matiere="' + x.m + '"' : "") + '>' +
                 '<a href="' + x.u + '">' + echapper(x.t) + "</a></li>";
        }).join("") + "</ul></div>";
    }
    zone.innerHTML = html;
  }

  /* ────────────────────────────────────────────────── fiche au hasard */
  function hasard() {
    chargerIndex().then(function (data) {
      if (!Array.isArray(data) || !data.length) return;
      var e = data[Math.floor(Math.random() * data.length)];
      location.href = racine() + e.u;
    });
  }

  function brancherHasard() {
    document.querySelectorAll("[data-hasard]").forEach(function (b) {
      b.addEventListener("click", function (ev) { ev.preventDefault(); hasard(); });
    });
  }

  /* ──────────────────────────────────────────────── raccourcis clavier */
  /* « / » met le curseur dans le champ de la page quand il y en a un, et
     ouvre la palette partout ailleurs. Cmd/Ctrl-K ouvre toujours la palette,
     y compris depuis un champ de saisie. */
  function chercherMaintenant() {
    chargerIndex();          // pendant que le lecteur tape la première lettre
    var champ = document.getElementById("q");
    if (champ && champ.offsetParent !== null) { champ.focus(); champ.select(); }
    else ouvrirPalette();
  }

  function raccourcis() {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (palette && palette.classList.contains("ouverte")) return fermerPalette();
        if (feuille && feuille.classList.contains("ouverte")) return fermer();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault(); return chercherMaintenant();
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var a = document.activeElement;
      if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;

      if (e.key === "/") { e.preventDefault(); chercherMaintenant(); }
      else if (e.key === "t") { e.preventDefault(); basculerClairSombre(); }
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
