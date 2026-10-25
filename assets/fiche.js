/* ===========================================================================
   BTS CIEL — comportements des fiches. Vanilla, sans dépendance.
   Chargé en fin de <body> ; s'auto-initialise et reste inoffensif si un
   élément attendu est absent.
   ======================================================================== */
(function () {
  "use strict";

  /* --- 1. Sommaire : construction automatique depuis les titres --------- */
  function construireSommaire() {
    var nav = document.querySelector(".sommaire ol");
    if (!nav || nav.children.length) return;          // sommaire écrit à la main : on respecte
    var titres = document.querySelectorAll(".corps section > h2, .corps section > h3");
    titres.forEach(function (t) {
      if (!t.id) {
        var s = t.closest("section");
        t.id = (s && s.id ? s.id + "-" : "") + t.textContent.trim().toLowerCase()
               .normalize("NFD").replace(/[̀-ͯ]/g, "")
               .replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      }
      var li = document.createElement("li");
      if (t.tagName === "H3") li.className = "sous";
      var a = document.createElement("a");
      a.href = "#" + (t.closest("section").id || t.id);
      a.textContent = t.textContent.replace(/^\s*[\d.]+\s*/, "").trim();
      li.appendChild(a);
      nav.appendChild(li);
    });
  }

  /* --- 2. Sommaire : mise en évidence de la section visible ------------- */
  function suivreLecture() {
    var liens = Array.prototype.slice.call(document.querySelectorAll(".sommaire a[href^='#']"));
    if (!liens.length || !("IntersectionObserver" in window)) return;
    var carte = {};
    liens.forEach(function (a) { carte[a.getAttribute("href").slice(1)] = a; });
    var cibles = Object.keys(carte).map(function (id) { return document.getElementById(id); })
                       .filter(Boolean);
    if (!cibles.length) return;

    var visibles = new Set();
    var obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (e.isIntersecting) visibles.add(e.target.id); else visibles.delete(e.target.id);
      });
      var actif = cibles.filter(function (c) { return visibles.has(c.id); })[0];
      if (!actif) return;
      liens.forEach(function (a) { a.classList.remove("actif"); });
      if (carte[actif.id]) carte[actif.id].classList.add("actif");
    }, { rootMargin: "-8% 0px -70% 0px", threshold: 0 });
    cibles.forEach(function (c) { obs.observe(c); });
  }

  /* --- 3. Sommaire repliable sur mobile --------------------------------- */
  function sommaireMobile() {
    var som = document.querySelector(".sommaire");
    var tete = som && som.querySelector("h2");
    if (!tete) return;
    tete.addEventListener("click", function () { som.classList.toggle("ouvert"); });
    som.addEventListener("click", function (e) {
      if (e.target.tagName === "A" && window.innerWidth <= 900) som.classList.remove("ouvert");
    });
  }

  /* --- 4. Blocs de code : bouton copier --------------------------------- */
  function boutonsCopier() {
    document.querySelectorAll(".bloc-code").forEach(function (bloc) {
      var pre = bloc.querySelector("pre");
      if (!pre || bloc.querySelector(".copier")) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "copier";
      b.textContent = "Copier";
      b.setAttribute("aria-label", "Copier le code");
      b.addEventListener("click", function () {
        var texte = pre.innerText;
        var fini = function (ok) {
          b.textContent = ok ? "Copié ✓" : "Échec";
          b.classList.toggle("fait", ok);
          setTimeout(function () { b.textContent = "Copier"; b.classList.remove("fait"); }, 1800);
        };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(texte).then(function () { fini(true); },
                                                    function () { fini(false); });
        } else {                                    // repli : fichier ouvert en file://
          var z = document.createElement("textarea");
          z.value = texte; z.style.position = "fixed"; z.style.opacity = "0";
          document.body.appendChild(z); z.select();
          var ok = false;
          try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
          document.body.removeChild(z); fini(ok);
        }
      });
      bloc.appendChild(b);
      essayer(bloc, pre);
    });
  }

  /* --- 4 bis. « Essayer » : du cours à l'atelier, d'un clic -------------
     Un programme lu n'apprend pas grand-chose ; un programme qu'on casse
     et qu'on relance, si. Le bouton porte le code jusqu'à l'atelier C, qui
     le compile et l'exécute dans le navigateur.

     Le code n'est PAS recopié dans la page : il est lu au moment du clic.
     Encoder les quarante-huit programmes du site dans autant de liens
     aurait alourdi les deux fiches de langage C de plusieurs dizaines de
     kilo-octets, pour un bouton qu'on presse une fois.

     Le bouton n'apparaît que sur le site PUBLIÉ, reconnu à sa feuille de
     style : le dépôt privé charge « assets/theme.css » et n'a pas de
     dossier « outils/ ». Poser un lien qui ne mène nulle part serait pire
     que de ne rien poser. */
  var BASE_ATELIER = (function () {
    var l = document.querySelector('link[href*="assets/fiche.css"]');
    if (!l) return null;
    var h = l.getAttribute("href");
    return h.slice(0, h.indexOf("assets/fiche.css"));
  })();

  function langueDuBloc(bloc) {
    var e = bloc.querySelector(".langue");
    if (!e) return "";
    var t = e.textContent.split(/\s+[—–]\s+/)[0].trim().toLowerCase();
    return t.normalize ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : t;
  }

  function essayer(bloc, pre) {
    if (!BASE_ATELIER || bloc.querySelector(".essayer")) return;
    var langue = langueDuBloc(bloc);
    if (langue !== "c" && langue !== "c++") return;
    var code = pre.innerText;
    if (!/\bint\s+main\s*\(/.test(code)) return;   // un fragment ne s'exécute pas

    var a = document.createElement("a");
    a.className = "essayer";
    a.textContent = "Essayer";
    a.setAttribute("title", "Ouvrir ce programme dans l'atelier, sans quitter la page");
    a.href = BASE_ATELIER + "outils/langage-c.html";
    a.addEventListener("click", function (ev) {
      ev.preventDefault();
      var octets = new TextEncoder().encode(pre.innerText);
      var bin = "";
      for (var i = 0; i < octets.length; i++) bin += String.fromCharCode(octets[i]);
      var b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_");
      var url = a.href + "#p=" + b64 + "&l=" + langue;
      var e = bloc.querySelector(".langue");
      var titre = e ? e.textContent.trim() : "Atelier C";
      /* Ctrl, Cmd ou Maj : l'habitude du navigateur est d'ouvrir ailleurs,
         et on ne la contrarie pas. */
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey) {
        window.open(url, "_blank", "noopener");
        return;
      }
      if (!ouvrirAtelier(url, titre, a)) window.open(url, "_blank", "noopener");
    });
    bloc.appendChild(a);
  }

  /* --- 4 ter. L'atelier PAR-DESSUS le cours ----------------------------
     Signalé : « Essayer » menait à l'outil, donc hors du cours. Mieux
     vaut un panneau sur la même page, avec une croix en haut à droite
     pour le refermer.

     C'est juste, et pour une raison qui a un nom : la charge de navigation.
     Un onglet neuf fait perdre sa place dans la page, et il faut revenir à
     la main — pour un programme qu'on veut juste casser trois fois.

     L'atelier s'ouvre donc dans un <dialog>. L'élément natif donne le fond
     assombri, le piège à tabulation et la fermeture par Échap sans une
     ligne de script : c'est la raison de le préférer à une pile de <div>.
     Le cours reste derrière ; on referme, on est exactement où on était.

     Échap n'est PAS détourné à l'intérieur du cadre : la touche y sert déjà
     à lâcher les sélections multiples de l'éditeur. Elle ne ferme que
     lorsque le focus est resté sur la fenêtre elle-même. */
  var modale = null, cadre = null, rendreFocus = null;

  function fermerAtelier() { if (modale) modale.close(); }

  function ouvrirAtelier(url, titre, bouton) {
    var d = document.createElement("dialog");
    if (!d.showModal) return false;         // navigateur trop ancien : onglet

    if (!modale) {
      modale = d;
      modale.className = "modale-atelier";
      modale.setAttribute("aria-label", "Atelier C");

      var barre = document.createElement("div");
      barre.className = "modale-barre";
      var nom = document.createElement("strong");
      nom.className = "modale-titre";
      barre.appendChild(nom);

      var onglet = document.createElement("a");
      onglet.className = "modale-onglet";
      onglet.target = "_blank";
      onglet.rel = "noopener";
      onglet.textContent = "Ouvrir dans un onglet";
      barre.appendChild(onglet);

      var croix = document.createElement("button");
      croix.type = "button";
      croix.className = "modale-croix";
      croix.setAttribute("aria-label", "Fermer l'atelier");
      croix.textContent = "\u00D7";
      croix.addEventListener("click", fermerAtelier);
      barre.appendChild(croix);

      cadre = document.createElement("iframe");
      cadre.className = "modale-cadre";
      cadre.setAttribute("title", "Atelier C");

      modale.appendChild(barre);
      modale.appendChild(cadre);

      /* Le fond ferme aussi. Un clic hors du contenu vise le <dialog>
         lui-même et jamais un de ses enfants : la comparaison suffit. */
      modale.addEventListener("click", function (ev) {
        if (ev.target === modale) fermerAtelier();
      });
      modale.addEventListener("close", function () {
        /* On vide le cadre : l'atelier porte un compilateur WebAssembly,
           le laisser vivre derrière une fenêtre fermée serait payer une
           mémoire qu'on n'utilise plus. */
        cadre.src = "about:blank";
        document.documentElement.classList.remove("modale-ouverte");
        if (rendreFocus) {
          try { rendreFocus.focus(); } catch (e) {}
          rendreFocus = null;
        }
      });
      document.body.appendChild(modale);
      modale._nom = nom;
      modale._onglet = onglet;
    }

    modale._nom.textContent = titre;
    modale._onglet.href = url;
    cadre.src = url;
    rendreFocus = bouton || null;
    /* Le fond ne défile plus derrière la fenêtre : sans cela, la molette
       passe au travers et le cours glisse pendant qu'on tape du code. */
    document.documentElement.classList.add("modale-ouverte");
    modale.showModal();
    return true;
  }

  /* --- 5. Quiz : révélation de la réponse ------------------------------- */
  function quiz() {
    document.querySelectorAll(".quiz").forEach(function (q, i) {
      var rep = q.querySelector(".reponse");
      if (!rep) return;
      /* Le bouton doit être un ENFANT DIRECT du quiz. « querySelector » prendrait
         sinon le premier bouton venu — y compris le « Copier » que la fonction
         précédente vient de poser DANS la réponse. Ce bouton-là se retrouvait
         promu déclencheur, renommé « Afficher la réponse », puis masqué avec la
         réponse qu'il devait ouvrir : le quiz devenait impossible à dérouler, et
         la copie du code disparaissait avec lui. */
      var btn = null, k;
      for (k = 0; k < q.children.length; k++) {
        if (q.children[k].tagName === "BUTTON") { btn = q.children[k]; break; }
      }
      if (!btn) {                  // fiche incomplète : on pose le bouton manquant
        btn = document.createElement("button");
        btn.type = "button";
        rep.parentNode.insertBefore(btn, rep);
      }
      var id = rep.id || ("reponse-" + (i + 1));
      // libellés personnalisables : data-ouvrir / data-fermer sur le bouton
      var libOuvrir = btn.getAttribute("data-ouvrir") || "Afficher la réponse";
      var libFermer = btn.getAttribute("data-fermer") || "Masquer la réponse";
      rep.id = id;
      rep.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", id);
      btn.textContent = libOuvrir;
      btn.addEventListener("click", function () {
        var ouvert = rep.hidden;
        rep.hidden = !ouvert;
        btn.setAttribute("aria-expanded", String(ouvert));
        btn.textContent = ouvert ? libFermer : libOuvrir;
      });
    });
  }

  /* --- 6. Tableaux larges : enrobage défilable -------------------------- */
  function tableauxDefilables() {
    document.querySelectorAll(".corps table").forEach(function (t) {
      if (t.parentElement.classList.contains("tableau")) return;
      var box = document.createElement("div");
      box.className = "tableau";
      t.parentNode.insertBefore(box, t);
      box.appendChild(t);
    });
  }

  /* --- 7. Coloration syntaxique : elle a déménagé ----------------------- */
  /* Elle vivait ici, et elle peignait 10 blocs sur les 74 d'un chapitre de
     langage C — parce que « langueDe » n'avait tout simplement AUCUNE règle
     pour le C, ni « REGLES » de famille « c ». Le défaut ne se voyait pas :
     une langue non reconnue ne produit pas d'erreur, elle produit du gris.

     Elle est désormais faite à la PUBLICATION, par
     _pilotage/scripts/coloration.py :
       · la page arrive colorée, sans clignotement au chargement ;
       · elle reste colorée si JavaScript est coupé ;
       · le nombre de blocs colorés est ANNONCÉ à chaque publication, donc
         une langue oubliée se voit tout de suite ;
       · 220 lignes de moins à télécharger sur chaque page.
     Le dépôt privé, lui, garde son code nu — c'est ce qui permet à
     verif-c.py d'en extraire les programmes et de les compiler. */

  /* --- 8. Démonstrations : le code à gauche, le résultat à droite -------- */
  var STYLE_APERCU =
    'body{margin:0;padding:14px;font:14px/1.55 -apple-system,BlinkMacSystemFont,' +
    '"Segoe UI",Roboto,sans-serif;color:#2F2F2F;background:#fff}' +
    'img{max-width:100%}*{box-sizing:border-box}';

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || !d.__apercu) return;
    var c = document.querySelector('iframe[data-jeton="' + d.__apercu + '"]');
    if (c) c.style.height = Math.max(70, Math.min(d.h, 460)) + "px";
  });

  function apercus() {
    document.querySelectorAll(".demo").forEach(function (demo) {
      if (demo.querySelector(".apercu")) return;
      var code = demo.querySelector(".bloc-code pre code");
      if (!code) return;
      var src = code.textContent;
      var type = demo.getAttribute("data-apercu") || "html";
      var gabarit = demo.querySelector("template.markup");
      var balisage = gabarit ? gabarit.innerHTML : "";
      var doc;
      if (type === "css") {
        doc = "<style>" + STYLE_APERCU + src + "</style>" + balisage;
      } else if (type === "js") {
        /* le balisage d'abord, puis le script : il doit trouver le DOM en place */
        doc = "<style>" + STYLE_APERCU + "</style>" + balisage +
              "<script>" + src + "<\/script>";
      } else {
        doc = "<style>" + STYLE_APERCU + "</style>" + src;
      }

      /* Les démos JS doivent EXÉCUTER du script. On leur donne « allow-scripts »
         SANS « allow-same-origin » : le code tourne, mais dans une origine opaque,
         donc il ne peut pas toucher à la page qui l'héberge. En contrepartie on ne
         peut plus mesurer sa hauteur directement : l'iframe nous la poste. */
      var estJs = (type === "js");
      if (estJs) {
        var jeton = "d" + Math.random().toString(36).slice(2, 9);
        doc += '<script>(function(){function h(){parent.postMessage(' +
               '{__apercu:"' + jeton + '",h:document.documentElement.scrollHeight},"*");}' +
               'addEventListener("load",h);setTimeout(h,60);' +
               'addEventListener("click",function(){setTimeout(h,30);});})();<\/script>';
      }

      var boite = document.createElement("div");
      boite.className = "apercu";
      var lab = document.createElement("div");
      lab.className = "etiquette";
      lab.textContent = "Résultat dans le navigateur";
      var cadre = document.createElement("iframe");
      cadre.setAttribute("title", "Aperçu du résultat");
      cadre.setAttribute("loading", "lazy");
      cadre.setAttribute("sandbox", estJs ? "allow-scripts" : "allow-same-origin");
      if (estJs) {
        cadre.setAttribute("data-jeton", jeton);
        cadre.style.height = "150px";
      }
      cadre.srcdoc = "<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"utf-8\"></head><body>"
                   + doc + "</body></html>";
      cadre.addEventListener("load", function () {
        try {
          var h = cadre.contentDocument.documentElement.scrollHeight;
          cadre.style.height = Math.max(70, Math.min(h, 460)) + "px";
        } catch (e) { cadre.style.height = "160px"; }
      });
      /* Hauteur de départ au plancher : « scrollHeight » ne descend jamais
         sous la hauteur du cadre, donc partir de 120 px ferait mesurer 120 px
         à une démonstration qui n'en fait que 80. On part du plancher. */
      cadre.style.height = "70px";
      boite.appendChild(lab); boite.appendChild(cadre);
      demo.appendChild(boite);
    });
  }

  /* ── Le rail de section ───────────────────────────────────────────────
     Une page de cours fait trente-sept sections. Arrivé à la quatorzième,
     on ne sait plus si le paragraphe qu'on lit relève encore des pointeurs
     — et le sommaire est resté tout en haut.

     Un rail d'une ligne, collé sous le bord de l'écran, qui dit le numéro
     et le titre de la section courante, et combien il en reste. Repris de
     getartcraft.com, où chaque chapitre porte sa barre collante ; ici une
     SEULE barre dont le texte change, pour ne pas répéter trente-sept fois
     le même titre dans le document.

     Il est « aria-hidden » : les titres de section existent déjà, un
     lecteur d'écran les annonce, et une barre qui répète le titre courant
     ne ferait que doubler chaque annonce.

     Posé uniquement là où « data-rail » le demande : on l'essaie sur un
     chapitre avant de l'imposer aux soixante. */
  function railDeSection() {
    const corps = document.querySelector("main[data-rail]");
    if (!corps) return;
    const sections = Array.prototype.slice.call(
      corps.querySelectorAll(":scope > section[id] > h2")
    ).map(function (h) { return h.parentNode; });
    if (sections.length < 4) return;   /* trois sections se tiennent de tête */

    const rail = document.createElement("div");
    rail.className = "rail";
    rail.setAttribute("aria-hidden", "true");
    rail.hidden = true;
    rail.innerHTML = '<span class="r-num"></span>'
                   + '<span class="r-titre"></span>'
                   + '<span class="r-tot"></span>';
    /* La piste a une hauteur nulle : c'est elle qui colle en haut, et le
       rail flotte dedans. Montrer ou masquer le rail ne déplace donc plus
       une seule ligne de la page — c'était la moitié du clignotement. */
    const piste = document.createElement("div");
    piste.className = "rail-piste";
    piste.appendChild(rail);
    corps.insertBefore(piste, corps.firstChild);
    const vNum = rail.querySelector(".r-num");
    const vTitre = rail.querySelector(".r-titre");
    const vTot = rail.querySelector(".r-tot");

    /* Le titre sans son numéro : il est déjà affiché à gauche. */
    /* Avant la première section, le rail portait du vide et restait caché.
       Sur une fiche, l'en-tête et le sommaire font 1 100 px — presque deux
       écrans. On descendait donc longtemps sans que rien n'apparaisse, et
       on en concluait qu'il n'y avait pas de rail. Il porte maintenant le
       TITRE DU CHAPITRE pendant ce trajet : il se montre dès que le grand
       titre sort par le haut, et il a toujours quelque chose à dire. */
    const grandTitre = corps.querySelector("h1");
    const nomChapitre = grandTitre ? grandTitre.textContent.trim() : "";

    const titres = sections.map(function (s) {
      const h = s.querySelector("h2").cloneNode(true);
      const n = h.querySelector(".num");
      const num = n ? n.textContent.trim() : "";
      if (n) n.remove();
      return { num: num, texte: h.textContent.trim() };
    });

    let courante = -1, attend = false, hRail = 0;
    function placer() {
      attend = false;
      /* La DERNIÈRE section dont le haut est passé sous le rail. La hauteur
         se mesure — elle change avec la taille de police des réglages — mais
         SEULEMENT quand le rail est visible : masqué, il mesure zéro, et un
         seuil qui retombe à 2 px rallume aussitôt ce qu'il venait d'éteindre.
         On garde donc la dernière hauteur connue. */
      if (!rail.hidden && rail.offsetHeight) hRail = rail.offsetHeight;
      const seuil = (hRail || 34) + 2;
      let i = -1;
      for (let k = 0; k < sections.length; k++) {
        if (sections[k].getBoundingClientRect().top <= seuil) i = k; else break;
      }
      /* Passé la dernière section, le rail n'a plus rien à dire. */
      if (i >= 0 && sections[i].getBoundingClientRect().bottom < seuil) i = -1;
      /* « −1 » recouvre deux états — avant la première section et après la
         dernière — et le rail n'y dit pas la même chose. On ne peut donc
         pas court-circuiter sur « rien n'a changé » quand i vaut −1. */
      if (i === courante && i >= 0) return;
      courante = i;
      if (i < 0) {
        /* Avant la première section : le nom du chapitre, dès que le grand
           titre est passé. Après la dernière, plus rien — on est dans le
           pied de page. */
        const avantTout = !sections.length
          || sections[0].getBoundingClientRect().top > seuil;
        const titrePasse = grandTitre
          && grandTitre.getBoundingClientRect().bottom <= seuil;
        if (avantTout && titrePasse && nomChapitre) {
          vNum.textContent = "";
          vTitre.textContent = nomChapitre;
          vTot.textContent = sections.length + " sections";
          rail.hidden = false;
        } else {
          rail.hidden = true;
        }
        return;
      }
      vNum.textContent = titres[i].num;
      vTitre.textContent = titres[i].texte;
      vTot.textContent = (i + 1) + "/" + sections.length;
      rail.hidden = false;
    }
    function auDefilement() {
      if (attend) return;
      attend = true;
      requestAnimationFrame(placer);
    }
    addEventListener("scroll", auDefilement, { passive: true });
    addEventListener("resize", auDefilement);
    placer();
  }

  function init() {
    tableauxDefilables();
    construireSommaire();
    sommaireMobile();
    apercus();
    boutonsCopier();
    quiz();
    suivreLecture();
    railDeSection();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
