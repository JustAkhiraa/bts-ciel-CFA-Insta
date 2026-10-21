/* ═══════════════════════════════════════════════════════════════════════
   L'atelier : un vrai compilateur C et C++ dans la page.

   Trois morceaux, trois fils d'exécution, et une raison pour chacun.

     · la PAGE tient l'éditeur et la console — elle ne calcule rien de lourd,
       donc elle ne se fige jamais ;
     · l'ouvrier COMPILATEUR détient clang et lld pour toute la session ;
     · un ouvrier d'EXÉCUTION jetable porte le programme de l'étudiant, et
       lui seul est supprimé quand une boucle part sans fin.

   Ce que l'interface doit à quatre livres, et où ça se voit :

   Krug — on ne doit rien déchiffrer. Un seul bouton plein, toujours au même
     endroit, qui dit ce qu'il va faire. L'état du compilateur est une phrase,
     jamais un sablier : « Compilateur prêt », « 12 Mo sur 60 ».
   Norman — chaque geste a son retour immédiat, et chaque erreur nomme la
     cause ET le remède (traductions.js). Le bouton descend d'un pixel quand
     on l'enfonce ; l'exécution en cours se voit sans avoir à chercher.
   Yablonski — loi de Doherty : au-delà de 400 ms sans signe de vie, on croit
     que c'est cassé. La barre de progression du téléchargement, l'état
     « compilation… » et la sortie qui s'écrit au fur et à mesure sont là
     pour ça. Loi de Fitts : rien sous 34 px. Loi de Jakob : les raccourcis
     sont ceux de VS Code (Ctrl/⌘ + Entrée, Ctrl/⌘ + S).
   Kholmatova — pas une couleur neuve. Tout vient des variables du design
     system, donc l'atelier se repeint avec les quarante thèmes sans qu'on
     ait rien à faire, et le code y prend exactement les teintes qu'il a
     dans les fiches.

   Hooked, enfin : le déclencheur est « je veux voir si ça marche », la
   récompense doit arriver tout de suite. D'où le téléchargement du
   compilateur lancé dès l'ouverture de la page, pendant qu'on écrit — et
   non au moment où l'on appuie sur « Exécuter ».
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const ech = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  /* Le pas d'indentation, nommé une fois. Il valait « 4 » écrit en dur à cinq
     endroits ; le jour où Tab et Retour arrière cessent de s'accorder, c'est
     un alinéa qu'on pose et qu'on ne peut plus retirer. */
  const PAS = 4;
  const ALINEA = " ".repeat(PAS);
  const CMD = MAC ? "⌘" : "Ctrl";
  /* Sur un Mac la touche s'appelle Option et s'écrit ⌥ : « Alt+Z » écrit pour
     un PC ne se reconnaît pas sur un clavier Apple, et c'est exactement ce
     qui a fait chercher le raccourci sans le trouver. */
  const ALT = MAC ? "⌥" : "Alt";
  const CLE = "bts-ciel-atelier-c";

  /* ══════════════════════════════════════════════ 1. COLORATION DU CODE
     Les mêmes classes et le même ordre de règles que coloration.py, qui
     peint les blocs des fiches à la publication. C'est ce qui fait que le
     code écrit ici a exactement l'allure de celui du cours, sur les quarante
     thèmes — et qu'une teinte mesurée une fois vaut pour les deux. */
  const MOTS = (...m) => "\\b(?:" + m.join("|") + ")\\b";
  const C_MC = MOTS("if", "else", "for", "while", "do", "switch", "case", "default",
    "break", "continue", "return", "goto", "sizeof", "const", "static", "struct",
    "typedef", "enum", "union", "extern", "volatile", "register", "inline", "restrict");
  const CPP_MC = MOTS("class", "public", "private", "protected", "virtual", "override",
    "template", "typename", "namespace", "using", "new", "delete", "this", "try",
    "catch", "throw", "operator", "friend", "explicit", "constexpr", "noexcept",
    "nullptr", "true", "false", "auto", "mutable", "final", "static_cast",
    "dynamic_cast", "const_cast", "reinterpret_cast", "decltype");
  /* Les types à taille fixe de <stdint.h> et les constantes de la
     bibliothèque standard manquaient : « uint8_t », « EOF », « stdin ». Ce
     sont des mots qu'un élève de BTS rencontre dès le premier TP de fichiers,
     et qui sortaient en gris au milieu d'une ligne colorée. */
  const C_TYP = MOTS("int", "float", "double", "char", "void", "long", "short",
    "unsigned", "signed", "bool", "_Bool", "FILE", "size_t", "ssize_t", "time_t",
    "ptrdiff_t", "wchar_t", "va_list", "clock_t",
    "int8_t", "int16_t", "int32_t", "int64_t",
    "uint8_t", "uint16_t", "uint32_t", "uint64_t",
    "NULL", "EOF", "stdin", "stdout", "stderr", "true", "false");
  const CPP_TYP = MOTS("std", "string", "vector", "map", "set", "pair", "cout", "cin",
    "cerr", "endl", "ostream", "istream", "ifstream", "ofstream", "fstream",
    "unique_ptr", "shared_ptr", "array", "list", "queue", "stack", "deque");
  const CHAINE = '"(?:\\\\.|[^"\\\\\\n])*"' + "|'(?:\\\\.|[^'\\\\\\n])*'";
  /* Le SUFFIXE fait partie du nombre : « 3.14f » est un littéral flottant, pas
     un nombre suivi d'une variable nommée f. Sans lui, le « f » restait gris —
     six fois dans le code publié, et à chaque fois au milieu d'un nombre
     coloré, ce qui se voit. L'exposant aussi : « 1e-9 ». */
  const NOMBRE = "\\b0[xX][0-9A-Fa-f]+[uUlL]*\\b|" +
                 "\\b\\d+(?:[.,]\\d+)?(?:[eE][-+]?\\d+)?[fFlLuU]*\\b";
  const APPEL = "\\b[A-Za-z_]\\w*(?=\\s*\\()";

  /* L'en-tête entre chevrons. « #include » était coloré, « <stdio.h> » non :
     mesuré sur les 90 blocs de C publiés, « stdio » sortait 41 fois en gris et
     « h » 43 fois. Il passe AVANT les opérateurs, sinon le « < » serait lu
     comme une comparaison et le nom partirait en clair. */
  const ENTETE = "<[A-Za-z0-9_/.]+\\.h(?:pp)?>";
  /* Les opérateurs. Près de cinq cents signes sans couleur dans le code
     publié : 130 « = », 80 « < », 57 « > », 40 « ++ ». C'était le plus gros
     trou, et il ne se voyait pas parce qu'un signe gris au milieu d'un mot
     coloré passe pour de la ponctuation. */
  const OPERATEUR = "[-+*/%=<>!&|^~?:]+";
  /* Les identifiants, en DERNIER. L'ordre des alternatives est la priorité :
     placé plus haut, « var » avalerait les mots-clés, les types et les appels,
     qui sont tous des identifiants eux aussi. */
  const IDENT = "\\b[A-Za-z_]\\w*\\b";

  function scanneur(cpp) {
    const regles = [
      ["com", "/\\*[\\s\\S]*?\\*/|//[^\\n]*"],
      ["pre", "(?:^|(?<=\\n))[ \\t]*#[A-Za-z_]+"],
      ["txt", ENTETE + "|" + CHAINE],
      ["mc", cpp ? C_MC + "|" + CPP_MC : C_MC],
      ["typ", cpp ? C_TYP + "|" + CPP_TYP : C_TYP],
      ["fn", APPEL],
      ["num", NOMBRE],
      ["op", OPERATEUR],
      ["var", IDENT],
    ];
    return new RegExp(regles.map(([c, r]) => "(?<" + c + ">" + r + ")").join("|"), "gm");
  }
  /* ── et le Python ────────────────────────────────────────────────
     Signalé : l'interprète Python existait déjà, et il n'était QUE dans la
     calculatrice. L'atelier est l'endroit où l'on écrit des programmes ;
     c'est là qu'il manquait. Il n'est pas recopié — la page charge le même
     fichier que la calculatrice, parce que deux copies finissent toujours
     par diverger.

     Le scanneur du C ne convient pas : le dièse y est une directive de
     préprocesseur, en Python c'est un commentaire, et les deux se peignent
     à l'opposé. Les mots-clés et les fonctions de base listés ici sont ceux
     que l'interprète connaît réellement — en colorer d'autres promettrait
     ce qu'il ne sait pas faire. */
  const PY_MC = "\\b(?:and|as|assert|break|class|continue|def|del|elif|else|except|"
    + "False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|"
    + "raise|return|True|try|while|with|yield)\\b";
  const PY_FN = "\\b(?:abs|all|any|bool|chr|dict|enumerate|float|input|int|len|list|"
    + "max|min|ord|print|range|reversed|round|set|sorted|str|sum|tuple|type|zip)\\b";
  const PY_TRIPLE = '"{3}[\\s\\S]*?"{3}' + "|'{3}[\\s\\S]*?'{3}";
  const SCAN = {
    c: scanneur(false),
    "c++": scanneur(true),
    python: new RegExp([
      ["com", "#[^\\n]*"],
      ["txt", PY_TRIPLE + "|" + CHAINE],
      ["mc", PY_MC],
      ["typ", PY_FN],
      ["fn", APPEL],
      ["num", NOMBRE],
      ["op", OPERATEUR],
      ["var", IDENT],
    ].map(([c, r]) => "(?<" + c + ">" + r + ")").join("|"), "gm"),
  };

  function peindre(code, langue) {
    const scan = SCAN[langue];
    scan.lastIndex = 0;
    let out = "", pos = 0, m;
    while ((m = scan.exec(code))) {
      if (m.index > pos) out += ech(code.slice(pos, m.index));
      const classe = Object.keys(m.groups).find((k) => m.groups[k] !== undefined);
      out += '<span class="j-' + classe + '">' + ech(m[0]) + "</span>";
      pos = m.index + m[0].length;
    }
    return out + ech(code.slice(pos));
  }

  /* ══════════════════════════════════════════════════════ 2. L'ÉDITEUR
     Un <textarea> transparent posé sur un <pre> peint. Aucune bibliothèque :
     la saisie reste celle du système — annulation native, clavier mobile
     natif, sélection native, dictée native. Un éditeur réécrit en JavaScript
     perd les quatre, et c'est le genre de perte qu'on ne remarque qu'une
     fois qu'on en a besoin. */
  function Editeur(racine, surChangement) {
    const saisie = $(".edi-saisie", racine);
    const peint = $(".edi-peint", racine);
    const marge = $(".edi-marge", racine);
    const tete = racine.closest(".at-volet");
    const etat = tete && tete.querySelector(".edi-etat");
    const formRenom = tete && tete.querySelector(".edi-renommer");
    let langue = "c";
    let marques = [];
    /* Déclaré AVEC les autres états, et non à côté de la fonction qui
       l'emploie : « redessiner » le lit, et un « let » déclaré plus bas
       vit dans sa zone morte temporelle jusqu'à sa ligne. Le dépôt a
       déjà payé cette erreur une fois (CLAUDE.md). */
    let margeAjustee = false;

    /* ── cliquer un numéro de ligne sélectionne la ligne ──────────────
       Demandé : le geste de VS Code — un clic sur le numéro sélectionne
       la ligne entière.

       Il y avait un obstacle, et il est écrit dans le commentaire de la
       marge quelques lignes plus bas : un numéro de ligne fait 22 px de
       haut — c'est l'interligne du code, il ne s'étire pas — alors que la
       règle du site veut qu'une COMMANDE fasse au moins 34 px. Le banc de
       rendu avait compté quinze cibles sous le seuil, et il avait raison.

       La sortie est de ne PAS faire des numéros des commandes : l'écoute
       est posée sur la MARGE, qui est un long bandeau, et la ligne est
       déduite de l'endroit cliqué. Un seul élément interactif, haut de
       toute la hauteur de l'éditeur, et les numéros restent des <div> qui
       signalent. C'est aussi exactement le fonctionnement de VS Code, où
       la gouttière est une bande et non une colonne de boutons.

       Trois gestes, les mêmes que là-bas : cliquer prend la ligne,
       Maj+cliquer étend depuis la précédente, glisser prend un bloc.
       Aucune de ces trois actions n'est perdue au clavier — Début puis
       Maj+Fin sélectionne déjà une ligne —, donc rien de nouveau ne
       devient inaccessible à qui n'a pas de souris. */
    function bornesLigne(i) {
      const lignes = saisie.value.split("\n");
      let d = 0;
      for (let k = 0; k < i && k < lignes.length; k++) d += lignes[k].length + 1;
      const f = d + (lignes[i] === undefined ? 0 : lignes[i].length);
      /* On avale le saut de ligne final quand il existe : sélectionner
         « la ligne » et taper doit la remplacer en entier, pas laisser
         une ligne vide derrière. La dernière ligne n'en a pas. */
      return { d, f: Math.min(saisie.value.length, i < lignes.length - 1 ? f + 1 : f) };
    }
    function ligneSousLaSouris(e) {
      const num = e.target.closest ? e.target.closest(".edi-num") : null;
      if (num) return Array.prototype.indexOf.call(marge.children, num);
      /* Cliqué dans la marge, mais à côté d'un numéro : au-dessus du
         premier — dans le rembourrage du haut — on prend la première
         ligne, en dessous du dernier on prend la dernière. Plutôt que de
         ne rien faire : c'est ce qu'on voulait dire.

         Le calcul d'avant divisait la distance par la hauteur d'UN
         numéro. C'était juste tant que tous faisaient 22 px ; depuis que
         la marge suit les lignes enroulées, ils n'ont plus tous la même
         hauteur, et cette division désignerait n'importe quelle ligne.
         Les deux seuls cas possibles ici ne demandent aucun calcul. */
      const n = marge.children.length;
      if (!n) return 0;
      return e.clientY < marge.children[0].getBoundingClientRect().top ? 0 : n - 1;
    }
    let ancreLigne = null;
    function prendreLignes(de, a) {
      const i = Math.min(de, a), j = Math.max(de, a);
      const debut = bornesLigne(i), fin = bornesLigne(j);
      saisie.focus();
      saisie.setSelectionRange(debut.d, fin.f);
      redessiner();
    }
    marge.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      /* preventDefault, sinon le navigateur sélectionne le TEXTE du
         numéro dans la marge et le champ ne reçoit jamais le focus. */
      e.preventDefault();
      const i = ligneSousLaSouris(e);
      if (e.shiftKey && ancreLigne !== null) prendreLignes(ancreLigne, i);
      else { ancreLigne = i; prendreLignes(i, i); }
      const bouger = (ev) => prendreLignes(ancreLigne, ligneSousLaSouris(ev));
      const lacher = () => {
        document.removeEventListener("mousemove", bouger);
        document.removeEventListener("mouseup", lacher);
      };
      document.addEventListener("mousemove", bouger);
      document.addEventListener("mouseup", lacher);
    });

    /* ── Un repeint par IMAGE, pas un par frappe ──────────────────────
       Signalé : « c'est toujours beaucoup trop lent là, trouve une
       solution, c'est pas possible. »

       Chaque appel reconstruisait tout le DOM coloré du fichier —
       « peint.innerHTML = peindre(tout) » — puis le reparcourait trois
       fois pour poser les marques, et la marge mesurait derrière. À la
       frappe soutenue, à la répétition d'une touche ou à un collage, cela
       se produisait une fois par caractère, chacune forçant un recalcul de
       mise en page.

       Or l'écran ne montre que soixante images par seconde : repeindre
       plus souvent, c'est jeter le travail. On enregistre donc la demande
       et on la sert à la prochaine image — dix frappes dans la même image
       ne coûtent plus qu'un seul repeint.

       « redessinerMaintenant » reste disponible pour les rares endroits
       qui mesurent le rendu juste après l'avoir demandé. */
    let repeintPlanifie = false;

    function redessiner() {
      if (repeintPlanifie) return;
      repeintPlanifie = true;
      requestAnimationFrame(() => {
        repeintPlanifie = false;
        redessinerMaintenant();
      });
    }

    function redessinerMaintenant() {
      const t = saisie.value;
      deplacerSurlignages(texteConnu, t);
      texteConnu = t;
      peint.innerHTML = peindre(t, langue) + "\n";
      /* Le surlignage se pose AVANT les autres marques : c'est un fond, et
         le mot courant ou la paire d'accolades doivent rester visibles
         par-dessus. */
      peindreSurlignages();
      /* Après la coloration, jamais avant : surligner d'abord reviendrait à
         faire colorer des balises qu'on vient d'insérer. */
      if (multi.length > 1) {
        peindreMulti();
        direEtat("", -1, 0);
        if (etat) etat.textContent = multi.length + " sélections — tapez pour les changer toutes";
      } else {
        if (typeof motCourant === "string" && motCourant) {
          surlignerOccurrences(motCourant, posCourante);
          const [k, n] = rangOccurrence(motCourant, posCourante);
          direEtat(motCourant, k, n);
        } else direEtat("", -1, 0);
        /* La paire se peint APRÈS le mot : si les deux tombent au même
           endroit, c'est la paire qu'on veut voir par-dessus. */
        if (paire) {
          const [a1, b1] = paire;
          if (b1 >= 0) {
            marquerIntervalle(b1, b1 + 1, "edi-paire");
            marquerIntervalle(a1, a1 + 1, "edi-paire");
            if (etat && !motCourant) {
              const ligne = saisie.value.slice(0, b1).split("\n").length;
              etat.textContent = saisie.value[a1] + " " + saisie.value[b1] +
                                 " · appariés, ligne " + ligne;
            }
          } else {
            marquerIntervalle(a1, a1 + 1, "edi-paire orpheline");
            if (etat) etat.textContent = saisie.value[a1] + " · rien ne la ferme";
          }
        }
      }
      const n = t.split("\n").length;
      if (marge.childElementCount !== n || marge.dataset.marques !== String(marques.length)) {
        marge.dataset.marques = String(marques.length);
        /* Des <div>, pas des boutons. Un numéro de ligne fait 22 px de haut
           — c'est l'interligne du code, on ne peut pas l'étirer — et la
           règle du site est qu'une COMMANDE fait au moins 34 px. La marge
           ne commande donc rien : elle signale. Le saut à la ligne fautive
           existe déjà sur la carte de diagnostic, où le bouton « ligne 13 »
           tient ses 34 px. Mesuré : le banc relevait quinze cibles sous le
           seuil, et il avait raison de les compter. */
        let h = "";
        for (let i = 1; i <= n; i++) {
          const m = marques.find((x) => x.ligne === i);
          h += '<div class="edi-num' + (m ? " a-" + m.niveau : "") + '">' + i + "</div>";
        }
        marge.innerHTML = h;
        margeAjustee = false;   // l'innerHTML a emporté les hauteurs posées
      }
      ajusterMarge(t);
      surChangement && surChangement(t);
    }

    /* ── la marge doit suivre les lignes ENROULÉES ────────────────────
       Signalé : les numéros ne tombaient plus en face de leur ligne, et
       le décalage grandissait.

       Un numéro par ligne LOGIQUE, c'est juste ; une rangée par
       numéro, ça ne l'est plus dès qu'une ligne s'enroule et en occupe
       trois. Le premier enroulement décalait donc TOUS les numéros
       suivants, et l'écart grandissait à chaque ligne longue.

       Le texte, lui, restait juste : les deux couches enroulent ensemble
       depuis le premier jour. C'est la marge seule qui mentait — et elle
       mentait sur la seule chose qu'on lui demande, dire à quelle ligne
       on est.

       Où une ligne casse ne se calcule pas : cela dépend de la police
       réellement chargée, de la largeur du volet au pixel près et de
       l'endroit où la césure tombe. On le MESURE donc sur la couche
       peinte, qui a exactement la géométrie du champ — c'est l'invariant
       sur lequel l'éditeur entier repose. Hors enroulement, aucune
       mesure : une rangée par ligne, et la hauteur naturelle suffit.

       Toutes les mesures d'abord, toutes les écritures ensuite. Mesurer
       et écrire en alternance ferait recalculer la mise en page à chaque
       ligne — sur trois cents lignes, l'éditeur se mettrait à coller. */
    function ajusterMarge(t) {
      const nums = marge.children;
      if (!nums.length) return;
      if (!racine.classList.contains("enroule")) {
        /* Rien à défaire tant que rien n'a été posé : sans ce drapeau, on
           réécrirait mille styles à chaque frappe pour les remettre vides. */
        if (!margeAjustee) return;
        for (let i = 0; i < nums.length; i++) nums[i].style.height = "";
        margeAjustee = false;
        return;
      }
      const marcheur = document.createTreeWalker(peint, NodeFilter.SHOW_TEXT);
      const noeuds = [];
      let nd, base = 0;
      while ((nd = marcheur.nextNode())) { noeuds.push([nd, base]); base += nd.nodeValue.length; }
      if (!noeuds.length) return;
      /* Les deux curseurs n'avancent que vers la droite : les débuts de
         ligne sont croissants, les nœuds de texte aussi. Chercher depuis
         le début à chaque ligne rendrait la fonction quadratique. */
      let k = 0;
      const place = (pos) => {
        while (k < noeuds.length - 1
               && pos > noeuds[k][1] + noeuds[k][0].nodeValue.length) k++;
        const [noeud, deb] = noeuds[k];
        return [noeud, Math.max(0, Math.min(pos - deb, noeud.nodeValue.length))];
      };
      /* Le pas d'une rangée, lu sur la couche peinte : c'est la même
         valeur que celle du champ, et la seule qui compte ici. */
      const pas = parseFloat(getComputedStyle(peint).lineHeight);
      if (!(pas > 0)) return;
      const r = document.createRange();
      /* L'origine de la grille, lue UNE fois : toutes les mesures qui
         suivent sont relatives à elle, et aucune écriture n'a encore eu
         lieu — la mise en page ne peut donc pas avoir bougé entre deux. */
      const hautPeint = peint.getBoundingClientRect().top;
      const rangees = [];
      let debut = 0;
      for (let i = 0; i < nums.length; i++) {
        const saut = t.indexOf("\n", debut);
        const fin = saut < 0 ? t.length : saut;
        const [na, oa] = place(debut);
        const [nb, ob] = place(fin);
        r.setStart(na, oa);
        r.setEnd(nb, ob);
        /* On COMPTE les rangées, on ne les déduit plus d'une hauteur.
           L'ancien calcul faisait « round(hauteur du texte / pas) », ce qui
           suppose que les glyphes occupent toujours la même part de la
           rangée — 15,5 px sur 22. Un emoji est plus haut qu'une lettre :
           avec « 🎈 » dans la ligne, la hauteur mesurée passait au-dessus
           de la demie et l'arrondi inventait une rangée. La marge gagnait
           un cran que le texte n'avait pas, et tout ce qui suivait était
           décalé — des numéros disparaissaient sous la ligne suivante.

           Chaque rangée d'un intervalle a son propre rectangle. Il suffit
           donc de compter les SOMMETS distincts : c'est exact quelle que
           soit la hauteur des glyphes. Une même rangée peut rendre
           plusieurs rectangles — un par fragment coloré — d'où le
           regroupement à une demi-rangée près. Une ligne vide n'a aucun
           rectangle : elle vaut une rangée, comme à l'écran. */
        /* Les rangées se comptent en RETOMBANT SUR LA GRILLE, et non en
           comparant les sommets deux à deux.

           Signalé : « quand je clique sur la ligne, ça ne me met pas la
           bonne ligne » — avec, en capture, des numéros qui sautent une
           ligne puis en doublent une autre. Le fichier en cause est plein
           d'emoji (« 🎈 »), et c'est là que l'ancienne règle lâchait : un
           emoji est rendu par une police de repli plus haute, donc son
           rectangle commence PLUS HAUT que celui des lettres de la même
           rangée. Tant que l'écart restait sous une demi-rangée, le
           regroupement tenait ; au-delà, la même rangée comptait pour deux
           — la cellule devenait deux fois trop haute, et tous les numéros
           suivants glissaient. La marge faisant foi pour le clic (c'est
           elle qu'on interroge, § 47), le clic désignait alors la
           mauvaise ligne : un seul défaut, deux symptômes.

           Une rangée a une position CONNUE : elle tombe sur un multiple du
           pas, depuis le haut de la couche peinte. On y ramène donc chaque
           rectangle au lieu de les comparer entre eux — un rectangle plus
           haut de dix-huit pixels retombe sur la même rangée que ses
           voisins, et deux rangées voisines restent à deux indices
           distincts, quelle que soit la hauteur des glyphes. */
        const rects = r.getClientRects();
        const bandes = [];
        for (let q = 0; q < rects.length; q++) {
          const rangee = Math.round((rects[q].top - hautPeint) / pas);
          if (bandes.indexOf(rangee) < 0) bandes.push(rangee);
        }
        rangees.push(Math.max(1, bandes.length));
        debut = fin + 1;
      }
      for (let i = 0; i < nums.length; i++)
        nums[i].style.height = rangees[i] > 1 ? rangees[i] * pas + "px" : "";
      margeAjustee = true;
    }

    /* Reconnaître une LETTRE sous un modificateur — et il faut trois
       essais, pas un.

       Signalé : Alt+Z restait sans effet, et écrivait « Â » par-dessus
       le marché. Ce Â est la signature du défaut : sur un Mac, Option ne
       se contente pas d'être
       un modificateur, il COMPOSE un caractère. Option+Z donne « Â », et
       « e.key » vaut donc « Â », jamais « z ».

       Le réflexe est alors de passer à « e.code », qui désigne la
       POSITION physique de la touche. Il est layout-indépendant, et c'est
       justement le problème : sur un clavier AZERTY, la touche qui écrit
       « z » est à l'emplacement du W d'un QWERTY, donc e.code vaut
       « KeyW ». Les deux contrôles échouaient ensemble, rien n'était
       intercepté, et le navigateur écrivait tranquillement le Â.

       Reste « e.keyCode ». Il est marqué obsolète dans les
       spécifications, et c'est pourtant le SEUL des trois qui réponde à
       la question posée : quelle lettre porte la touche que l'utilisateur
       a enfoncée, dans SA disposition, indépendamment des modificateurs.
       Pour Option+Z sur un Mac français il vaut 90, c'est-à-dire Z.

       On essaie donc les trois, dans cet ordre : le caractère produit, la
       lettre de la disposition, et la position physique seulement en
       dernier recours — elle ferait répondre Option+W sur un AZERTY. */
    function lettre(e, l) {
      const L = l.toUpperCase();
      if (typeof e.key === "string" && e.key.length === 1
          && e.key.toUpperCase() === L) return true;
      if (e.keyCode === L.charCodeAt(0)) return true;
      if (!e.keyCode && e.code === "Key" + L) return true;
      return false;
    }

    /* ── Les gestes de VS Code, repris à la main ──────────────────────
       Demandé : reprendre les gestes de VSCodium et les adapter — et,
       plus tôt, trois d'entre eux par leur nom : Ctrl+D pour attraper les
       mots identiques, Alt+Z pour le retour à la ligne visuel, et le
       surlignage des jumeaux quand on clique sur un mot.

       VSCodium lui-même ne peut pas entrer ici : c'est une application de
       bureau Electron de plusieurs centaines de mégaoctets, pas une page.
       Ce qui tourne dans un navigateur, c'est son ÉDITEUR, Monaco — et
       Monaco remplacerait ce champ, donc l'annulation du système, le clavier
       mobile, la dictée et la sélection native, tous gardés exprès.

       Ce sont les GESTES qu'il demande. Ils tiennent en quatre-vingts lignes,
       sans rien charger. Une seule différence est assumée et dite : dans VS
       Code, Ctrl+D AJOUTE un curseur ; un <textarea> n'en a qu'un, alors ici
       il DÉPLACE la sélection d'une occurrence à la suivante. Le travail —
       repérer un identifiant, le parcourir, le corriger — est le même ; la
       mécanique ne peut pas l'être. */
    const MOT = /[A-Za-z_]\w*/g;

    function motAutour(texte, pos) {
      MOT.lastIndex = 0;
      let m;
      while ((m = MOT.exec(texte))) {
        if (m.index <= pos && pos <= m.index + m[0].length) return m;
        if (m.index > pos) break;
      }
      return null;
    }

    /* ── les parenthésages ─────────────────────────────────────────────
       « tu dois le faire pour tout, pour les { les ; tout ». Pour une
       accolade, ce que fait VS Code — et ce qui sert — n'est pas d'allumer
       toutes les accolades du fichier : c'est de montrer CELLE QUI FERME.
       Un bloc qu'on croit fermé et qui ne l'est pas, c'est la moitié des
       erreurs de compilation du premier semestre.

       Encore faut-il ne pas compter les accolades qui n'en sont pas :
       celles d'une chaîne — printf("}\n") — ou d'un commentaire. D'où ce
       masque, qui dit pour chaque caractère s'il est du vrai code. Il se
       recalcule à chaque déplacement du curseur ; sur un programme de TP,
       c'est quelques milliers de caractères, soit rien. */
    const OUVRANTS = "([{";
    const FERMANTS = ")]}";

    function masqueCode(t) {
      const m = new Uint8Array(t.length);
      let etat = 0;            // 0 code · 1 "…" · 2 '…' · 3 //… · 4 /*…*/
      for (let i = 0; i < t.length; i++) {
        const c = t[i], d = t[i + 1];
        if (etat === 0) {
          if (c === '"') { etat = 1; continue; }
          if (c === "'") { etat = 2; continue; }
          if (c === "/" && d === "/") { etat = 3; continue; }
          if (c === "/" && d === "*") { etat = 4; i++; continue; }
          m[i] = 1;
        } else if (etat === 1) {
          if (c === "\\") { i++; } else if (c === '"') etat = 0;
        } else if (etat === 2) {
          if (c === "\\") { i++; } else if (c === "'") etat = 0;
        } else if (etat === 3) {
          if (c === "\n") { etat = 0; m[i] = 1; }
        } else if (etat === 4) {
          if (c === "*" && d === "/") { etat = 0; i++; }
        }
      }
      return m;
    }

    /* La paire autour du curseur : on regarde le caractère qui suit, puis
       celui qui précède — c'est l'ordre de VS Code, et il compte quand le
       curseur est coincé entre « ) » et « { ». */
    function paireAutour(t, pos) {
      const m = masqueCode(t);
      for (const i of [pos, pos - 1]) {
        if (i < 0 || i >= t.length || !m[i]) continue;
        const c = t[i];
        const io = OUVRANTS.indexOf(c), if_ = FERMANTS.indexOf(c);
        if (io < 0 && if_ < 0) continue;
        const sens = io >= 0 ? 1 : -1;
        const ouvre = io >= 0 ? c : OUVRANTS[if_];
        const ferme = io >= 0 ? FERMANTS[io] : c;
        let profondeur = 0;
        for (let j = i; j >= 0 && j < t.length; j += sens) {
          if (!m[j]) continue;
          if (t[j] === ouvre) profondeur += sens;
          else if (t[j] === ferme) profondeur -= sens;
          if (profondeur === 0) return i < j ? [i, j] : [j, i];
        }
        return [i, -1];                 // orpheline : rien ne la ferme
      }
      return null;
    }

    /* ── Ctrl/Cmd+D : AJOUTER une sélection, pas la déplacer ───────────

       Demandé : sélectionner « int », appuyer sur Ctrl+D, et obtenir la
       sélection de départ PLUS la suivante ; appuyer encore, et une de
       plus. C'est exactement ce que fait VS Code, et ma première
       version faisait autre chose : elle DÉPLAÇAIT la sélection d'une
       occurrence à la suivante. J'avais écrit qu'un <textarea> n'a qu'un
       curseur et qu'on ne pouvait pas faire mieux. C'est vrai du champ
       natif ; ce n'est pas vrai de l'éditeur, puisque la peinture est à
       nous. Les sélections en trop s'y dessinent, et la frappe est
       appliquée à toutes.

       « multi » garde les intervalles DANS L'ORDRE DU TEXTE. Le champ natif
       en porte une — la dernière ajoutée, pour que le défilement la suive.
       Les autres sont peintes. */
    let multi = [];
    /* « remplacer » déclenche un événement « input », et l'écouteur d'input
       abandonne les sélections multiples — c'est ce qu'il doit faire pour un
       collage ou une dictée. Pendant NOTRE écriture, il ne doit pas : ce
       drapeau fait la différence entre les deux. */
    let enFrappeMultiple = false;

    function echapperRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

    function oublierMulti() {
      if (!multi.length) return false;
      multi = [];
      redessiner();
      return true;
    }

    function montrer(pos) {
      /* Sans ce recentrage, la sélection ajoutée peut tomber hors du cadre
         et l'on croit que rien ne s'est passé. */
      const t = saisie.value;
      const avant = t.slice(0, pos).split("\n").length - 1;
      const hLigne = saisie.scrollHeight / Math.max(1, t.split("\n").length);
      const y = avant * hLigne;
      if (y < saisie.scrollTop || y > saisie.scrollTop + saisie.clientHeight - hLigne * 2)
        saisie.scrollTop = Math.max(0, y - saisie.clientHeight / 2);
    }

    function ajouterOccurrence() {
      const t = saisie.value;
      // Premier appui : on part de ce qui est sélectionné, ou du mot sous le
      // curseur s'il n'y a rien de sélectionné.
      if (!multi.length) {
        let d = saisie.selectionStart, f = saisie.selectionEnd;
        if (d === f) {
          const m = motAutour(t, d);
          if (!m) return false;
          d = m.index; f = m.index + m[0].length;
        }
        saisie.setSelectionRange(d, f);
        multi = [{ d: d, f: f }];
        redessiner();
        return true;
      }
      const cible = t.slice(multi[0].d, multi[0].f);
      if (!cible) return false;
      // Un mot entier se cherche entre limites de mot ; un fragment
      // quelconque — « 5) » — se cherche tel quel.
      const mot = /^[A-Za-z_]\w*$/.test(cible);
      const re = new RegExp((mot ? "\\b" : "") + echapperRegex(cible) + (mot ? "\\b" : ""), "g");
      const pris = new Set(multi.map((x) => x.d));
      const depuis = multi[multi.length - 1].f;
      let trouve = null;
      re.lastIndex = depuis;
      let m;
      while ((m = re.exec(t))) { if (!pris.has(m.index)) { trouve = m; break; } }
      if (!trouve) {                       // on boucle au début du texte
        re.lastIndex = 0;
        while ((m = re.exec(t))) { if (!pris.has(m.index)) { trouve = m; break; } }
      }
      if (!trouve) return false;           // toutes les occurrences sont prises
      multi.push({ d: trouve.index, f: trouve.index + trouve[0].length });
      multi.sort((a, b) => a.d - b.d);
      saisie.setSelectionRange(trouve.index, trouve.index + trouve[0].length);
      montrer(trouve.index);
      redessiner();
      return true;
    }

    /* Toutes les sélections, toutes les occurrences : Ctrl+Shift+L. */
    function toutesLesOccurrences() {
      const t = saisie.value;
      let cible = multi.length ? t.slice(multi[0].d, multi[0].f)
                               : t.slice(saisie.selectionStart, saisie.selectionEnd);
      if (!cible) {
        const m = motAutour(t, saisie.selectionStart);
        if (!m) return false;
        cible = m[0];
      }
      const mot = /^[A-Za-z_]\w*$/.test(cible);
      const re = new RegExp((mot ? "\\b" : "") + echapperRegex(cible) + (mot ? "\\b" : ""), "g");
      const tous = [];
      let m;
      while ((m = re.exec(t))) tous.push({ d: m.index, f: m.index + m[0].length });
      if (!tous.length) return false;
      multi = tous;
      const dernier = tous[tous.length - 1];
      saisie.setSelectionRange(dernier.d, dernier.f);
      redessiner();
      return true;
    }

    /* La frappe, appliquée à TOUTES les sélections. De la fin vers le début :
       chaque remplacement déplace ce qui suit, et traiter l'inverse ferait
       dériver tous les intervalles d'après. Un seul écrit pour tout le texte,
       donc un seul coup d'annulation. */
    function frapperPartout(texte, avant, apres) {
      if (multi.length < 2) return false;
      const t = saisie.value;
      const rangs = multi.slice().sort((a, b) => a.d - b.d);
      /* Les intervalles sont d'abord étendus (Retour arrière mange le
         caractère d'avant, Suppr celui d'après), PUIS désempilés. Sans cette
         seconde étape, deux curseurs voisins peuvent se recouvrir une fois
         étendus — et comme les remplacements suivants s'appliquent à un texte
         déjà modifié, le résultat devient faux. Le cas ne se produit pas avec
         Ctrl+D, dont les occurrences sont toujours disjointes ; il se ferme
         ici en trois lignes plutôt que d'attendre qu'il morde. */
      const etendus = [];
      for (const r of rangs) {
        let d = r.d, f = r.f;
        if (d === f) { d = Math.max(0, d - avant); f = Math.min(t.length, f + apres); }
        if (etendus.length && d < etendus[etendus.length - 1].f)
          d = etendus[etendus.length - 1].f;
        if (f < d) f = d;
        etendus.push({ d: d, f: f });
      }
      let out = t, neuf = [];
      for (let i = etendus.length - 1; i >= 0; i--) {
        const { d, f } = etendus[i];
        out = out.slice(0, d) + texte + out.slice(f);
        neuf.unshift({ d: d, f: f, pose: d + texte.length });
      }
      // Les positions d'arrivée se recalculent de gauche à droite : chaque
      // remplacement décale ce qui suit de (longueur insérée − longueur ôtée).
      let decalage = 0;
      const apresCoup = [];
      for (const r of neuf) {
        const p = r.d + decalage + texte.length;
        apresCoup.push({ d: p, f: p });
        decalage += texte.length - (r.f - r.d);
      }
      const fin = apresCoup[apresCoup.length - 1];

      /* NE PAS réécrire tout le document. L'écriture passe par
         setSelectionRange(début, fin) : prendre 0 comme début ancre la
         sélection en tête de fichier, et le navigateur y fait remonter la
         vue. On tapait, le remplacement avait bien lieu partout — mais on
         se retrouvait en haut du programme sans rien voir de ce qu'on
         venait d'écrire.
         On ne réécrit donc que la tranche qui va de la PREMIÈRE sélection
         à la DERNIÈRE. Tout est modifié à l'intérieur, rien au-dehors :
         le préfixe et le suffixe sont identiques au caractère près. Un
         seul écrit, donc toujours un seul coup d'annulation. */
      const dMin = neuf[0].d;
      const fMax = neuf[neuf.length - 1].f;
      const tranche = out.slice(dMin, out.length - (t.length - fMax));

      /* Et par sécurité, le défilement est relevé puis reposé : même
         réduite, la tranche reste une sélection posée par programme, et
         selon le navigateur elle peut bouger la vue. */
      const hautAvant = saisie.scrollTop, gaucheAvant = saisie.scrollLeft;
      enFrappeMultiple = true;
      try { remplacer(dMin, fMax, tranche, fin.d, fin.f); }
      finally { enFrappeMultiple = false; }
      saisie.scrollTop = hautAvant;
      saisie.scrollLeft = gaucheAvant;
      /* Si le curseur a malgré tout quitté le cadre — une frappe qui ajoute
         des lignes, par exemple — on le ramène. « montrer » ne fait rien
         tant qu'il est visible : la vue ne bouge que lorsqu'il le faut. */
      montrer(fin.d);
      saisie.dispatchEvent(new Event("scroll"));

      multi = apresCoup;
      redessiner();
      return true;
    }

    /* Alt+Z — le retour à la ligne visuel. Les DEUX couches basculent :
       le champ et sa peinture. Si l'une enroule et l'autre non, le texte
       coloré se décale d'une ligne à chaque enroulement, et tout glisse. */
    function basculerEnroulement() {
      const on = racine.classList.toggle("enroule");
      saisie.setAttribute("wrap", on ? "soft" : "off");
      if (!on) peint.style.transform =
        "translate(" + -saisie.scrollLeft + "px," + -saisie.scrollTop + "px)";
      ajusterMarge(saisie.value);
      return on;
    }

    /* Le surlignage des occurrences. On ne touche pas au HTML peint avec une
       expression régulière — ce serait colorer des balises. On marche sur les
       NŒUDS DE TEXTE du rendu et on découpe ceux qui portent le mot : le texte
       n'est pas modifié d'un caractère, il est seulement enveloppé. */
    /* Elle s'appelait « surligner », comme la fonction des COULEURS huit cents
       lignes plus bas. Deux déclarations de même nom dans la même portée : la
       seconde gagne, et celle-ci n'a jamais été appelée. L'appel d'en haut
       atterrissait donc dans le surlignage de couleur, avec le MOT CLIQUÉ en
       guise de couleur — ce qui effaçait la couleur posée et fabriquait une
       classe que le style ne connaît pas. Signalé : « je mets en rouge, je
       clique dessus, ça retire ». */
    function surlignerOccurrences(mot, posActive) {
      /* Le seuil était à DEUX lettres, et c'était une erreur : « i » est le
         compteur de boucle de tout le langage C, donc le mot qu'on suit le
         plus souvent des yeux. Mesuré sur son exemple : l'état annonçait
         « i · 1 sur 4 » pendant que ZÉRO occurrence était marquée.
         Les limites de mot font déjà le tri — le « i » de « int », de
         « include » ou de « printf » n'est pas une occurrence de « i ». */
      if (!mot) return;
      /* Un MOT se cherche entre limites de mot — le « i » de « int » n'est
         pas une occurrence de « i ». Un littéral — « ; », « 5) » — n'a pas
         de limites de mot : on le cherche tel quel. */
      const bord = /^[A-Za-z_]\w*$/.test(mot) ? "\\b" : "";
      const re = new RegExp(bord + mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + bord, "g");
      /* On relève TOUS les nœuds de texte avec leur position absolue AVANT
         la moindre découpe : splitText change l'arbre sous les pieds du
         marcheur, et c'est cette position qui dit laquelle des occurrences
         est celle où se trouve le curseur. */
      const marcheur = document.createTreeWalker(peint, NodeFilter.SHOW_TEXT);
      const noeuds = [];
      let nd, debut = 0;
      while ((nd = marcheur.nextNode())) { noeuds.push([nd, debut]); debut += nd.nodeValue.length; }
      for (const [noeud, base] of noeuds) {
        const trouves = [];
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(noeud.nodeValue))) trouves.push([m.index, m[0].length]);
        /* De la fin vers le début : chaque découpe déplace ce qui suit. */
        for (let i = trouves.length - 1; i >= 0; i--) {
          const [deb, lg] = trouves[i];
          const milieu = noeud.splitText(deb);
          milieu.splitText(lg);
          const marque = document.createElement("span");
          marque.className = "edi-occ" + (base + deb === posActive ? " actif" : "");
          milieu.parentNode.insertBefore(marque, milieu);
          marque.appendChild(milieu);
        }
      }
    }

    /* Envelopper un intervalle du texte peint dans un <span>. Les nœuds
       sont relevés AVEC leur position absolue avant la moindre découpe :
       splitText change l'arbre sous les pieds du marcheur. */
    function marquerIntervalle(d, f, classe) {
      if (f <= d) return;
      const marcheur = document.createTreeWalker(peint, NodeFilter.SHOW_TEXT);
      const noeuds = [];
      let nd, base = 0;
      while ((nd = marcheur.nextNode())) { noeuds.push([nd, base]); base += nd.nodeValue.length; }
      /* De la fin vers le début : un intervalle peut couvrir plusieurs
         nœuds — un mot-clé coloré suivi d'un espace, par exemple. */
      for (let i = noeuds.length - 1; i >= 0; i--) {
        const [noeud, deb] = noeuds[i];
        const fin = deb + noeud.nodeValue.length;
        const a = Math.max(d, deb), b = Math.min(f, fin);
        if (b <= a) continue;
        let cible = noeud;
        if (b < fin) cible.splitText(b - deb);
        if (a > deb) cible = cible.splitText(a - deb);
        const marque = document.createElement("span");
        marque.className = classe;
        cible.parentNode.insertBefore(marque, cible);
        marque.appendChild(cible);
      }
    }

    function peindreMulti() {
      if (multi.length < 2) return;
      for (let i = multi.length - 1; i >= 0; i--) {
        const r = multi[i];
        if (r.f > r.d) marquerIntervalle(r.d, r.f, "edi-sel");
        else marquerIntervalle(r.d, r.d + 1, "edi-sel vide");
      }
    }

    /* Le rang de l'occurrence où est le curseur, et le nombre total.
       Calculé sur le TEXTE, qui fait foi — pas sur la peinture. */
    function rangOccurrence(mot, pos) {
      if (!mot) return [-1, 0];
      const bord = /^[A-Za-z_]\w*$/.test(mot) ? "\\b" : "";
      const re = new RegExp(bord + mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + bord, "g");
      const t = saisie.value;
      let m, n = 0, k = -1;
      while ((m = re.exec(t))) { if (m.index === pos) k = n; n++; }
      return [k, n];
    }

    /* F2 — renommer toutes les occurrences d'un coup.

       C'est le geste que Ctrl+D ne peut PAS rendre ici, et il faut le dire
       franchement : dans VS Code, Ctrl+D AJOUTE un curseur, puis l'on tape
       une fois pour toutes les occurrences. Un <textarea> n'a qu'un curseur
       — ce n'est pas un manque de code, c'est la plateforme : le champ natif
       du navigateur n'expose qu'une sélection. Ctrl+D DÉPLACE donc la
       sélection d'une occurrence à la suivante, et F2 offre l'autre geste de
       VS Code, celui qui atteint le but visé : renommer partout. */
    function motVise() {
      const sel = saisie.value.slice(saisie.selectionStart, saisie.selectionEnd);
      if (sel && /^[A-Za-z_]\w*$/.test(sel)) return sel;
      const m = motAutour(saisie.value, saisie.selectionStart);
      return m ? m[0] : "";
    }

    function ouvrirRenommage() {
      if (!formRenom) return false;
      const mot = motVise();
      if (!mot) return false;
      const champ = formRenom.querySelector("input");
      const [, n] = rangOccurrence(mot, -1);
      formRenom.dataset.mot = mot;
      champ.value = mot;
      champ.removeAttribute("aria-invalid");
      formRenom.hidden = false;
      direEtat(mot, -1, n);
      champ.focus();
      champ.select();
      return true;
    }

    function fermerRenommage() {
      if (!formRenom || formRenom.hidden) return;
      formRenom.hidden = true;
      saisie.focus();
    }

    function renommerPartout(ancien, neuf) {
      if (!ancien || !neuf || ancien === neuf) return 0;
      if (!/^[A-Za-z_]\w*$/.test(neuf)) return -1;
      const re = new RegExp("\\b" + ancien.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
      const avant = saisie.value;
      let n = 0;
      const apres = avant.replace(re, () => { n++; return neuf; });
      if (!n) return 0;
      /* Un seul remplacement pour tout le texte : un seul coup d'annulation.
         Remplacer occurrence par occurrence en demanderait autant qu'il y en
         a, et Ctrl+Z deviendrait une corvée.

         Et il faut RENDRE LE FOCUS au champ de code avant d'écrire :
         execCommand agit sur l'élément actif, qui est à cet instant la petite
         zone de saisie du renommage. Sans cette ligne, la commande réussissait
         — elle renvoyait true, donc la reprise de secours ne se déclenchait
         pas — et le programme restait intact pendant que l'état annonçait
         fièrement « 7 occurrences renommées ». Mesuré : 7 « compteur »
         toujours là, 0 « total ». */
      saisie.focus();
      const pos = Math.min(saisie.selectionStart, apres.length);
      remplacer(0, avant.length, apres, pos, pos);
      motCourant = ""; posCourante = -1;
      majOccurrences();
      return n;
    }

    let motCourant = "", posCourante = -1;
    let litteral = false;          // la cible n'est pas un mot : « ; », « 5) »
    let paire = null, paireCle = ""; // les deux positions de la paire ouverte

    /* Ce que l'éditeur sait et que le lecteur ne voit pas, il le DIT.
       C'est tout le défaut qu'il a signalé : « ctrl d ça sélectionne tous
       les mêmes mots ». Les occurrences étaient marquées AVANT même qu'on
       presse la touche — par le seul fait de poser le curseur dans un mot —
       et toutes de la même façon. Rien ne distinguait donc celle où l'on
       était, et appuyer sur Ctrl+D ne changeait rien de visible. */
    function direEtat(mot, k, n) {
      if (!etat) return;
      if (!mot || n === 0) { etat.textContent = ""; return; }
      etat.textContent = n === 1
        ? mot + " · 1 seule fois"
        : mot + " · " + (k >= 0 ? k + 1 : "–") + " sur " + n;
    }

    /* « repeindre » à faux : on met l'état à jour SANS redessiner, parce
       que l'appelant va le faire lui-même juste après. Signalé : « j'ai
       lancé un compilateur vide, j'ai écrit une ligne et c'est lent ».
       Mesuré sur le site, en tapant pour de vrai : des images à 419 ms.
       La cause tenait en deux lignes — « input » redessinait, puis
       « keyup » appelait majOccurrences qui redessinait une SECONDE fois.
       Deux repeints complets du fichier par caractère frappé.

       Mes premières mesures ne voyaient rien parce qu'elles envoyaient des
       événements « input » fabriqués : sans vrai clavier, pas de « keyup »,
       donc pas de second repeint. L'instrument manquait la moitié du
       chemin. */
    function majOccurrences(repeindre) {
      const t = saisie.value;
      const sel = t.slice(saisie.selectionStart, saisie.selectionEnd);
      let mot = "", pos = -1;
      litteral = false;
      if (sel && /^[A-Za-z_]\w*$/.test(sel)) { mot = sel; pos = saisie.selectionStart; }
      else if (sel && sel.length <= 40 && sel.indexOf("\n") < 0) {
        /* Une sélection qui n'est pas un mot — « ; », « 5) », « i++ » —
           s'éclaire quand même : c'est ce que fait VS Code dès qu'on
           sélectionne quoi que ce soit, et c'est la réponse à « les ; ».
           Sans limite de longueur, sélectionner la moitié du programme
           ferait chercher cette moitié partout, pour rien. */
        mot = sel; pos = saisie.selectionStart; litteral = true;
      } else if (saisie.selectionStart === saisie.selectionEnd) {
        const m = motAutour(t, saisie.selectionStart);
        if (m) { mot = m[0]; pos = m.index; }
      }
      /* La paire d'accolades, de crochets ou de parenthèses, quand le
         curseur en touche une. Elle vit à côté du surlignage de mot, pas à
         sa place : on peut très bien être dans un mot ET contre une
         parenthèse — « printf( » en est un. */
      const pr = saisie.selectionStart === saisie.selectionEnd
               ? paireAutour(t, saisie.selectionStart) : null;
      const prCle = pr ? pr.join(",") : "";
      if (prCle !== paireCle) { paireCle = prCle; paire = pr; }
      else if (mot === motCourant && pos === posCourante) return;
      /* La POSITION fait partie de l'état. Sans elle, Ctrl+D déplaçait bien
         la sélection d'une occurrence à la suivante — le mot, lui, ne
         changeait pas — et l'on sortait d'ici sans rien redessiner : la
         marque active restait sur place. Le geste marchait, il ne se voyait
         pas. */
      motCourant = mot;
      posCourante = pos;
      if (repeindre !== false) redessiner();
    }

    /* ── Le surlignage ────────────────────────────────────────────────────
       Demandé : « je sélectionne une ligne, par exemple le commentaire de la
       question 1 d'un TP, et une commande ou un bouton me la surligne en une
       couleur ».

       Trois décisions, et chacune évite un piège :

       · SANS SÉLECTION, c'est la LIGNE ENTIÈRE qui est prise. C'est le geste
         décrit — on veut marquer une question, pas trois caractères — et ça
         évite d'avoir à sélectionner proprement avant de cliquer.
       · Les marques sont rangées par POSITION, et déplacées à chaque
         modification du texte. Sans ça, écrire une ligne au-dessus décalerait
         tous les surlignages d'en dessous, ce qui est pire que de ne rien
         marquer : on croirait avoir marqué autre chose.
       · Repasser la MÊME couleur sur une zone déjà marquée l'enlève. Un
         marqueur qu'on ne peut pas retirer n'est pas un marqueur. */
    const TEINTES = ["rouge", "ambre", "vert", "bleu"];
    let surlignages = [];
    let texteConnu = saisie.value;

    function deplacerSurlignages(ancien, nouveau) {
      if (ancien === nouveau || !surlignages.length) return;
      const court = Math.min(ancien.length, nouveau.length);
      let p = 0;
      while (p < court && ancien[p] === nouveau[p]) p++;
      let q = 0;
      while (q < court - p
             && ancien[ancien.length - 1 - q] === nouveau[nouveau.length - 1 - q]) q++;
      const finA = ancien.length - q, delta = (nouveau.length - q) - finA;
      const bouge = (x) => (x <= p ? x : (x >= finA ? x + delta : p));
      const gardees = [];
      for (const m of surlignages) {
        const d = bouge(m.d), f = bouge(m.f);
        if (f > d) gardees.push({ d: d, f: f, couleur: m.couleur });
      }
      surlignages = gardees;
    }

    function peindreSurlignages() {
      for (const m of surlignages)
        marquerIntervalle(m.d, m.f, "edi-surligne edi-surligne-" + m.couleur);
    }

    /* La zone à marquer : la sélection si elle existe, la ligne entière
       sinon — bornes de ligne comprises, sans le retour à la ligne. */
    function zoneAMarquer() {
      const d = saisie.selectionStart, f = saisie.selectionEnd, t = saisie.value;
      if (f > d) return { d: d, f: f };
      const deb = t.lastIndexOf("\n", d - 1) + 1;
      let fin = t.indexOf("\n", d);
      if (fin < 0) fin = t.length;
      return { d: deb, f: fin };
    }

    function surligner(couleur) {
      const z = zoneAMarquer();
      if (z.f <= z.d) return 0;
      const restantes = [];
      let enleve = 0;
      for (const m of surlignages) {
        const croise = m.d < z.f && z.d < m.f;
        if (!croise) { restantes.push(m); continue; }
        enleve++;
        if (m.couleur !== couleur) {
          /* Une autre couleur : on garde ce qui dépasse de part et d'autre,
             sinon marquer en rouge au milieu d'un bloc vert effacerait tout
             le vert. */
          if (m.d < z.d) restantes.push({ d: m.d, f: z.d, couleur: m.couleur });
          if (z.f < m.f) restantes.push({ d: z.f, f: m.f, couleur: m.couleur });
        }
      }
      /* Une pastille POSE toujours sa couleur. Elle basculait : recliquer
         du rouge sur du rouge l'effaçait. Signalé : « quand je clique sur
         une ligne avec une couleur ça retire la couleur, c'est pas normal,
         c'est moi qui décide quand la couleur part. » Il a raison — la
         croix est là pour enlever, et elle seule. Une bascule oblige à se
         souvenir de ce qu'on a mis pour prévoir ce qu'un clic va faire. */
      if (couleur) restantes.push({ d: z.d, f: z.f, couleur: couleur });
      restantes.sort((a, b) => a.d - b.d);
      surlignages = restantes;
      redessiner();
      saisie.focus();
      return 1;
    }

    saisie.addEventListener("input", () => {
      /* Une frappe ordinaire — collage, dictée, saisie tactile — n'a touché
         qu'une sélection : les autres ne veulent plus rien dire. */
      if (multi.length > 1 && !enFrappeMultiple) multi = [];
      /* L'état des occurrences AVANT le repeint, et un seul repeint : le
         « keyup » qui suit trouvera l'état déjà à jour et sortira sans
         rien redessiner. */
      majOccurrences(false);
      redessiner();
    });
    /* ── coller, couper, copier quand plusieurs sélections sont posées ─
       Signalé : un collage ne remplaçait qu'une seule des sélections.
       C'était vrai, et le mal était double : le champ natif ne connaît
       qu'une sélection, donc le collage n'allait que dans la dernière —
       et l'écouteur d'input, en voyant une frappe qu'il croyait
       ordinaire, ABANDONNAIT les autres au passage. On tapait ensuite
       une lettre, elle n'allait plus qu'à un endroit, et Ctrl+D semblait
       cassé : il n'y avait simplement plus rien à prolonger.

       Les trois gestes se tiennent : sans le couper, on supprimerait une
       seule occurrence ; sans le copier, on recopierait une seule des
       trois qu'on vient de sélectionner. Un seul des trois corrigé aurait
       laissé le même piège un cran plus loin.

       La règle du collage est la plus simple possible, et elle est écrite
       dans l'aide : le texte va ENTIER dans chaque sélection. VS Code en
       a une seconde — autant de lignes que de curseurs, une ligne
       chacun — qui rend le collage imprévisible dès qu'on colle un bloc.
       Ici, une seule règle, qui se devine. */
    function texteDesSelections() {
      const t = saisie.value;
      return multi.map((r) => t.slice(r.d, r.f)).join("\n");
    }
    /* Après une frappe ou un collage, les sélections sont retombées en
       CURSEURS VIDES. Copier donnerait « \n\n » — rien, mais un rien qui
       écrase ce qu'on avait dans le presse-papiers. Le banc de l'éditeur
       a trouvé ce cas tout seul, et il a eu raison : on rend la main au
       navigateur plutôt que de voler le geste pour ne rien en faire. */
    function selectionsVides() {
      return multi.every((r) => r.f <= r.d);
    }
    saisie.addEventListener("paste", (e) => {
      if (multi.length < 2 || !e.clipboardData) return;
      const texte = e.clipboardData.getData("text/plain");
      if (!texte) return;
      e.preventDefault();
      frapperPartout(texte, 0, 0);
      if (etat) etat.textContent = multi.length + " sélections remplacées par le presse-papiers";
    });
    saisie.addEventListener("copy", (e) => {
      if (multi.length < 2 || !e.clipboardData || selectionsVides()) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", texteDesSelections());
      if (etat) etat.textContent = multi.length + " sélections copiées, une par ligne";
    });
    saisie.addEventListener("cut", (e) => {
      if (multi.length < 2 || !e.clipboardData || selectionsVides()) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", texteDesSelections());
      frapperPartout("", 0, 0);
      if (etat) etat.textContent = "sélections coupées, une par ligne";
    });

    saisie.addEventListener("keyup", () => majOccurrences(true));
    saisie.addEventListener("click", () => { oublierMulti(); majOccurrences(true); });
    saisie.addEventListener("blur", (e) => {
      /* Passer dans le champ de renommage ne doit pas effacer le surlignage :
         c'est précisément ce qu'on est en train de renommer. */
      if (formRenom && !formRenom.hidden && formRenom.contains(e.relatedTarget)) return;
      motCourant = ""; posCourante = -1; redessiner();
    });

    if (formRenom) {
      const champRenom = formRenom.querySelector("input");
      formRenom.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const neuf = champRenom.value.trim();
        const n = renommerPartout(formRenom.dataset.mot, neuf);
        if (n === -1) {
          champRenom.setAttribute("aria-invalid", "true");
          if (etat) etat.textContent = "Un nom de C : lettres, chiffres, souligné — jamais de chiffre en tête.";
          champRenom.focus();
          return;
        }
        fermerRenommage();
        if (n > 0 && etat)
          etat.textContent = n + (n > 1 ? " occurrences renommées" : " occurrence renommée") + " en " + neuf;
      });
      formRenom.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") { ev.preventDefault(); fermerRenommage(); }
      });
      const annuler = formRenom.querySelector("button[type=button]");
      if (annuler) annuler.addEventListener("click", fermerRenommage);
    }
    saisie.addEventListener("scroll", () => {
      peint.style.transform = "translate(" + -saisie.scrollLeft + "px," + -saisie.scrollTop + "px)";
      marge.scrollTop = saisie.scrollTop;
    });

    /* ── Le défilement pendant une sélection à la souris ───────────────
       Signalé : « quand je sélectionne et monte le curseur en haut pour
       que ça sélectionne le haut et que ça scroll auto, ça veut pas
       scroller. » Mesuré : la sélection s'étend bien — 296 caractères —
       mais « scrollTop » ne bouge pas d'un pixel. On s'arrête donc à la
       première ligne visible, et il faut lâcher, remonter à la molette,
       recommencer.

       Le navigateur ne le fait pas ici ; on le fait. La vitesse suit le
       dépassement du pointeur hors du champ — quelques pixels par image
       quand on effleure le bord, quarante quand on tire loin — parce
       qu'une vitesse fixe est soit trop lente sur un fichier long, soit
       incontrôlable sur un court.

       La tête de la sélection est posée sur la PREMIÈRE ou la DERNIÈRE
       ligne visible, lue dans la marge. Pas calculée par division :
       depuis que les lignes s'enroulent, elles n'ont plus toutes la même
       hauteur, et une division désignerait n'importe laquelle (§ 47). */
    let ancreSel = null, filant = false, dernierY = 0;

    function ligneAuBord(versLeHaut) {
      const nums = marge.children;
      if (!nums.length) return 0;
      const base = nums[0].offsetTop;
      const y = saisie.scrollTop + (versLeHaut ? 0 : saisie.clientHeight);
      let trouvee = 0;
      for (let i = 0; i < nums.length; i++) {
        if (nums[i].offsetTop - base <= y) trouvee = i; else break;
      }
      return trouvee;
    }

    /* La dernière ligne visée, pour ne repeindre que lorsqu'elle CHANGE.
       Repeindre à chaque image coûtait un fichier entier recoloré soixante
       fois par seconde — c'est ce qui rendait l'éditeur inutilisable. */
    let derniereTete = null;

    function etendreAuBord(vitesse) {
      if (ancreSel === null) return;
      const ligne = ligneAuBord(vitesse < 0);
      if (ligne === derniereTete) return;
      derniereTete = ligne;
      const b = bornesLigne(ligne);
      const tete = vitesse < 0 ? b.d : b.f;
      saisie.setSelectionRange(Math.min(ancreSel, tete), Math.max(ancreSel, tete),
                               tete < ancreSel ? "backward" : "forward");
      redessiner();
    }

    function filer() {
      if (!filant) return;
      const r = saisie.getBoundingClientRect();
      const dessus = r.top - dernierY, dessous = dernierY - r.bottom;
      let v = 0;
      if (dessus > 0) v = -Math.min(40, 4 + dessus / 2);
      else if (dessous > 0) v = Math.min(40, 4 + dessous / 2);
      if (!v) {
        /* Le pointeur est revenu DANS le champ : plus rien à faire. On
           arrête la boucle au lieu de la laisser tourner à vide — le
           prochain déplacement la relancera. Une boucle qui ne s'arrête
           que sur un événement finit toujours par survivre à sa raison
           d'être. */
        filant = false;
        return;
      }
      const avant = saisie.scrollTop;
      saisie.scrollTop += v;
      /* Seulement si l'on a VRAIMENT bougé : en butée, réécrire la
         sélection à chaque image la ferait clignoter sans rien gagner. */
      if (saisie.scrollTop !== avant) etendreAuBord(v);
      else { filant = false; return; }   /* butée : plus rien à défiler */
      requestAnimationFrame(filer);
    }

    saisie.addEventListener("pointerdown", (e) => {
      /* Souris seulement : au doigt, le glissement fait défiler la page,
         et s'en mêler casserait un geste qui marche déjà. */
      if (e.button !== 0 || e.pointerType === "touch") return;
      dernierY = e.clientY;
      derniereTete = null;
      /* L'ancre se lit APRÈS que le navigateur a posé le curseur, sinon
         c'est l'ancienne sélection qu'on retiendrait. */
      requestAnimationFrame(() => { ancreSel = saisie.selectionStart; });
      /* La CAPTURE du pointeur : sans elle, un bouton relâché hors de la
         fenêtre ne nous revient jamais, la boucle tourne indéfiniment et
         l'éditeur se met à ramer sans qu'on sache pourquoi. Mesuré : deux
         secondes par image. La capture garantit le « pointerup », et
         « lostpointercapture » rattrape le reste. */
      try { saisie.setPointerCapture(e.pointerId); } catch (x) {}
      const bouger = (ev) => {
        /* Ceinture et bretelles : si plus aucun bouton n'est tenu, le
           relâchement s'est perdu — on arrête là plutôt que de filer. */
        if (!(ev.buttons & 1)) { lacher(); return; }
        dernierY = ev.clientY;
        if (!filant) { filant = true; requestAnimationFrame(filer); }
      };
      const lacher = () => {
        filant = false; ancreSel = null; derniereTete = null;
        try { saisie.releasePointerCapture(e.pointerId); } catch (x) {}
        document.removeEventListener("pointermove", bouger);
        document.removeEventListener("pointerup", lacher);
        document.removeEventListener("pointercancel", lacher);
        saisie.removeEventListener("lostpointercapture", lacher);
        removeEventListener("blur", lacher);
      };
      document.addEventListener("pointermove", bouger);
      document.addEventListener("pointerup", lacher);
      document.addEventListener("pointercancel", lacher);
      saisie.addEventListener("lostpointercapture", lacher);
      addEventListener("blur", lacher);
    });

    /* ── confort de frappe ────────────────────────────────────────────
       Chaque geste ci-dessous remplace un aller-retour à la souris. Tab
       reste capturé — c'est ce qu'on attend d'un éditeur — mais Échap rend
       la tabulation à la navigation clavier, sans quoi on s'y trouverait
       enfermé. */
    const PAIRES = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'" };
    let echappe = false;

    saisie.addEventListener("keydown", (e) => {
      const d = saisie.selectionStart, f = saisie.selectionEnd, t = saisie.value;

      if (e.key === "Escape") {
        /* Échap abandonne d'abord les sélections multiples, comme dans
           VS Code : on sort d'un état avant de sortir du champ. */
        if (oublierMulti()) { e.preventDefault(); return; }
        echappe = true; return;
      }

      /* Ctrl+D sur PC, Cmd+D sur Mac — c'est la touche que chacun a dans les
         doigts, et elle ouvre un marque-page dans les deux navigateurs si on
         ne l'arrête pas. « preventDefault » n'est pas une précaution ici,
         c'est la condition pour que le geste existe. */
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && lettre(e, "d")) {
        e.preventDefault();
        const ajoutee = ajouterOccurrence();
        majOccurrences();
        /* Un geste qui ne fait rien doit dire POURQUOI, sinon on le croit
           cassé — c'est exactement ce qui s'est passé. */
        if (!ajoutee && etat) {
          etat.textContent = multi.length
            ? "toutes les occurrences sont déjà prises (" + multi.length + ")"
            : "placez le curseur dans un mot, ou sélectionnez un morceau";
        }
        return;
      }
      /* Ctrl/Cmd+Shift+L — toutes les occurrences d'un coup. */
      if ((e.ctrlKey || e.metaKey) && e.shiftKey &&
          lettre(e, "l")) {
        e.preventDefault();
        toutesLesOccurrences();
        return;
      }

      /* ── surligner au clavier ─────────────────────────────────────────
         ⇧⌘1 à ⇧⌘4 posent une couleur, ⇧⌘0 l'enlève. Les chiffres se
         reconnaissent par « code », pas par « key » : sous Maj, la touche 1
         d'un AZERTY produit « 1 » mais celle d'un QWERTY produit « ! ».
         C'est la même leçon que l'Option+Z du § 27, à l'autre bout du
         clavier. */
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
        const COULEURS = { Digit1: "rouge", Digit2: "ambre", Digit3: "vert",
                           Digit4: "bleu", Digit0: "" };
        let c = COULEURS[e.code];
        if (c === undefined && /^[0-4]$/.test(e.key))
          c = ["", "rouge", "ambre", "vert", "bleu"][+e.key];
        if (c !== undefined) {
          e.preventDefault();
          surligner(c);
          if (etat) etat.textContent = c ? "surligné en " + c : "surlignage enlevé";
          return;
        }
      }

      /* ── deux espaces ne font pas un point ────────────────────────────
         Signalé : « si des fois je clic deux fois sur espace ca genere
         un . ». Ce n'est pas l'éditeur : c'est la substitution du
         système — « ajouter un point avec deux espaces » — qui remplace
         la paire d'espaces par « . ». Dans un programme en C, elle
         frappe à chaque indentation tapée à la main.

         « autocorrect=off » est posé sur le champ depuis le premier jour
         et ne l'arrête pas : la substitution est faite par la couche de
         saisie du système, en amont du document. Le seul moyen sûr est
         de ne pas lui laisser la touche — on écrit l'espace nous-mêmes,
         et le système n'a plus de paire à reconnaître.

         Uniquement sur un curseur simple précédé d'un espace : c'est le
         seul cas que le système substitue, et le chemin multi-sélection
         passe déjà par « frapperPartout », qui empêche la même chose
         pour la même raison. « remplacer » écrit par execCommand, donc
         Ctrl+Z défait l'espace comme s'il avait été tapé. */
      if (e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey
          && multi.length < 2 && d === f && d > 0 && t[d - 1] === " ") {
        e.preventDefault();
        remplacer(d, f, " ", d + 1, d + 1);
        return;
      }

      /* ── la frappe quand plusieurs sélections sont posées ─────────────
         Le champ natif n'en connaît qu'une : si on le laissait écrire, il
         ne toucherait que celle-là. On prend donc la main sur les touches
         qui MODIFIENT, et sur elles seulement — les autres (flèches, Tab,
         Ctrl+quelque chose) retombent plus bas, et la plupart abandonnent
         les sélections, ce qui est le comportement de VS Code. */
      if (multi.length > 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key.length === 1) {
          e.preventDefault(); frapperPartout(e.key, 0, 0); return;
        }
        if (e.key === "Enter") {
          e.preventDefault(); frapperPartout("\n", 0, 0); return;
        }
        if (e.key === "Backspace") {
          e.preventDefault(); frapperPartout("", 1, 0); return;
        }
        if (e.key === "Delete") {
          e.preventDefault(); frapperPartout("", 0, 1); return;
        }
        if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End" ||
            e.key === "PageUp" || e.key === "PageDown") {
          oublierMulti();           // on ne les retient pas, on navigue
        }
      }
      /* Alt+Maj+F — remettre l'alinéa, comme dans VS Code. */
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && lettre(e, "f")) {
        e.preventDefault();
        const r = realigner();
        if (etat) etat.textContent = !r.ok
          ? "alinéa : rien changé, le contrôle de sûreté n'est pas passé"
          : (r.change ? "alinéa refait" : "l'alinéa était déjà en place");
        return;
      }

      /* F2 — le renommage. VS Code l'a aussi, et c'est le seul des deux
         gestes qu'un champ natif puisse tenir en entier. */
      if (e.key === "F2") {
        e.preventDefault();
        ouvrirRenommage();
        return;
      }
      /* Alt+Z : le retour à la ligne visuel, comme dans VS Code. */
      if (e.altKey && !e.ctrlKey && !e.metaKey && lettre(e, "z")) {
        e.preventDefault();
        const on = basculerEnroulement();
        /* L'état se DIT, il ne se devine pas : l'onglet du volet l'affiche, et
           le champ le porte dans son nom pour un lecteur d'écran. Un
           interrupteur dont on ne voit pas la position n'est pas un
           interrupteur. */
        racine.closest(".at-volet").dataset.enroule = on ? "1" : "0";
        saisie.setAttribute("aria-label",
          "Votre programme. Retour à la ligne " + (on ? "activé" : "désactivé") +
          " (Alt+Z). Ctrl+D sélectionne l'occurrence suivante du mot.");
        return;
      }

      /* ═══ Les gestes d'édition de VS Code ═══════════════════════════
         « Ajoute un max de fonctionnalités de VS Code. » Ceux qui suivent ont
         été choisis sur un critère : ce qu'on fait DIX FOIS par séance en
         écrivant du C. Commenter un bloc d'essai, déplacer une ligne mal
         placée, dupliquer une ligne presque identique, supprimer une ligne.
         Pas la palette de commandes ni le minimap — on n'a pas mille
         fichiers, on en a un.

         Tous passent par « remplacer », qui écrit avec execCommand : c'est ce
         qui garde l'ANNULATION du système. Un éditeur qui casse Ctrl+Z est
         pire qu'un éditeur sans raccourcis. */
      function bornesLignes() {
        const dl = t.lastIndexOf("\n", d - 1) + 1;
        let fl = t.indexOf("\n", f);
        if (fl === -1) fl = t.length;
        return [dl, fl];
      }

      /* Ctrl+/ — commenter ou décommenter. On regarde si TOUTES les lignes
         non vides sont déjà commentées : c'est ce qui décide du sens, et
         c'est ce que fait VS Code. Une bascule ligne par ligne donnerait un
         bloc à moitié commenté au second appui. */
      /* Le commentaire de ligne. VS Code l'écrit « ⌘/ » sur un clavier
         américain — mais sur un clavier FRANÇAIS, le menu affiche
         « ⇧⌘: », parce que le « / » d'un AZERTY se tape avec Maj. Les deux
         notations désignent la même touche physique, et son navigateur
         rapporte tantôt « / » tantôt « : » selon la disposition. On accepte
         donc les deux, avec ou sans Maj, sur Mac comme sur PC — plutôt que
         de parier sur une disposition. */
      if ((e.ctrlKey || e.metaKey) && !e.altKey &&
          (e.key === "/" || e.key === ":" || e.code === "Slash" ||
           e.code === "Period" || e.code === "Semicolon")) {
        e.preventDefault();
        const [dl, fl] = bornesLignes();
        const lignes = t.slice(dl, fl).split("\n");
        const toutes = lignes.every((l) => !l.trim() || /^\s*\/\//.test(l));
        const neuf = lignes.map((l) => !l.trim() ? l
          : toutes ? l.replace(/^(\s*)\/\/ ?/, "$1")
                   : l.replace(/^(\s*)/, "$1// ")).join("\n");
        remplacer(dl, fl, neuf, dl, dl + neuf.length);
        return;
      }

      /* Maj+Alt+A — le commentaire de BLOC, le second de sa capture
         d'écran. Même raccourci sur Mac et sur Windows, c'est l'un des rares
         que VS Code n'a pas eu besoin de dédoubler.

         Sur une sélection, on l'entoure ; sans sélection, on entoure la
         ligne. Et si l'on est DÉJÀ dans un bloc commenté, on l'enlève —
         « afficher/masquer », dit le menu, pas « ajouter ». */
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && lettre(e, "a")) {
        e.preventDefault();
        let [dd, ff] = [d, f];
        if (dd === ff) [dd, ff] = bornesLignes();
        const dedans = t.slice(dd, ff);
        const avant = t.slice(0, dd), apres = t.slice(ff);
        const ouvert = /\/\*\s?$/.test(avant) && /^\s?\*\//.test(apres);
        if (/^\/\*[\s\S]*\*\/$/.test(dedans.trim())) {
          // la sélection EST le bloc : on le retire
          const nu = dedans.trim().replace(/^\/\*\s?/, "").replace(/\s?\*\/$/, "");
          remplacer(dd, ff, nu, dd, dd + nu.length);
        } else if (ouvert) {
          // le bloc entoure la sélection : on retire les deux bouts
          const d2 = avant.replace(/\/\*\s?$/, "").length;
          const f2 = ff + (apres.length - apres.replace(/^\s?\*\//, "").length);
          const nu = t.slice(dd, ff);
          remplacer(d2, f2, nu, d2, d2 + nu.length);
        } else {
          const nu = "/* " + dedans + " */";
          remplacer(dd, ff, nu, dd + 3, dd + 3 + dedans.length);
        }
        return;
      }

      /* Alt+↑ / Alt+↓ — déplacer la ligne. Shift en plus : la dupliquer. */
      if (e.altKey && !e.ctrlKey && !e.metaKey &&
          (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const [dl, fl] = bornesLignes();
        const bloc = t.slice(dl, fl);
        if (e.shiftKey) {
          if (e.key === "ArrowDown")
            remplacer(fl, fl, "\n" + bloc, d + bloc.length + 1, f + bloc.length + 1);
          else
            remplacer(dl, dl, bloc + "\n", d, f);
          return;
        }
        if (e.key === "ArrowUp") {
          if (dl === 0) return;                      // déjà tout en haut
          const pl = t.lastIndexOf("\n", dl - 2) + 1;
          const prec = t.slice(pl, dl - 1);
          const neuf = bloc + "\n" + prec;
          remplacer(pl, fl, neuf, d - (dl - pl), f - (dl - pl));
        } else {
          if (fl >= t.length) return;                // déjà tout en bas
          let nf = t.indexOf("\n", fl + 1);
          if (nf === -1) nf = t.length;
          const suiv = t.slice(fl + 1, nf);
          const neuf = suiv + "\n" + bloc;
          const dec = suiv.length + 1;
          remplacer(dl, nf, neuf, d + dec, f + dec);
        }
        return;
      }

      /* Ctrl+Shift+K — supprimer la ligne entière. On emporte le retour à la
         ligne QUI SUIT, sauf sur la dernière ligne où il faut prendre celui
         d'avant : sinon on laisse une ligne vide à la place de la ligne
         supprimée, et le geste n'a servi à rien. */
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "K" || e.key === "k")) {
        e.preventDefault();
        const [dl, fl] = bornesLignes();
        const fin = fl < t.length ? fl + 1 : fl;
        const deb = (fin === fl && dl > 0) ? dl - 1 : dl;
        remplacer(deb, fin, "", deb, deb);
        return;
      }

      /* ── Un raccourci ne peut pas faire deux choses ──────────────────
         Signalé : dans le compilateur, Commande+Entrée lançait bien
         l'exécution — mais ajoutait aussi un saut de ligne au passage.

         C'était vrai, et c'était ma faute : ⌘⏎ était pris DEUX fois. Ici
         pour « ouvrir une ligne en dessous », repris de VS Code — et plus
         bas pour « Exécuter », qui est l'action principale de l'atelier et
         qui est écrite sur le bouton. Les deux handlers se déclenchaient, et
         on exécutait un programme à qui l'on venait d'ajouter une ligne.

         L'arbitrage n'est pas discutable : **⌘⏎ exécute**. C'est ce que dit
         le bouton, c'est le geste qu'on fait cinquante fois par séance, et
         un raccourci écrit à l'écran doit faire ce qu'il annonce. « Ouvrir
         une ligne » passe donc sur ⌥⏎ (et ⌥⇧⏎ pour celle du dessus) —
         touches libres, et la liste des commandes les montre.

         La leçon vaut au-delà : quand un raccourci est repris d'un éditeur,
         il faut d'abord regarder s'il n'est pas DÉJÀ pris par l'application
         qui l'accueille. */
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === "Enter") {
        e.preventDefault();
        const [dl, fl] = bornesLignes();
        const creux = (t.slice(dl).match(/^[ \t]*/) || [""])[0];
        if (e.shiftKey)
          remplacer(dl, dl, creux + "\n", dl + creux.length, dl + creux.length);
        else
          remplacer(fl, fl, "\n" + creux, fl + 1 + creux.length, fl + 1 + creux.length);
        return;
      }

      /* Début — d'abord le premier caractère NON BLANC, puis la colonne zéro
         au second appui. C'est le « smart home » de VS Code, et il sert
         justement parce que le code est indenté. */
      if (e.key === "Home" && !e.ctrlKey && !e.metaKey) {
        const dl = t.lastIndexOf("\n", d - 1) + 1;
        const prem = dl + (t.slice(dl).match(/^[ \t]*/) || [""])[0].length;
        const cible = d === prem ? dl : prem;
        e.preventDefault();
        if (e.shiftKey) saisie.setSelectionRange(Math.min(cible, f), Math.max(cible, f));
        else saisie.setSelectionRange(cible, cible);
        majOccurrences();
        return;
      }

      /* ── Retour arrière : un ALINÉA d'un coup ─────────────────────────
         Demandé : le comportement de VS Code. Tab pose un alinéa, et le
         retour arrière le reprend d'un coup — l'éditeur se souvient qu'un
         alinéa vaut un nombre fixe d'espaces.

         Rien n'est « pris en mémoire » : VS Code ne retient pas qu'on a tapé
         Tab, il REGARDE où se trouve le curseur. S'il n'y a que des espaces
         entre le début de la ligne et lui, le retour arrière ramène au
         multiple de quatre précédent — donc efface un alinéa entier. Dès
         qu'il y a un caractère avant, il efface un seul espace, comme
         partout.

         C'est cette règle-là qui est reprise, et elle vaut mieux qu'une
         mémoire : elle marche aussi sur du code collé, ou rouvert le
         lendemain, où aucune frappe n'a été enregistrée. */
      if (e.key === "Backspace" && d === f && d > 0 && !e.altKey &&
          !(MAC ? e.metaKey : e.ctrlKey)) {
        const dl = t.lastIndexOf("\n", d - 1) + 1;
        const avant = t.slice(dl, d);
        if (avant.length && /^ +$/.test(avant)) {
          const recule = ((avant.length - 1) % PAS) + 1;   // jusqu'au multiple en dessous
          e.preventDefault();
          remplacer(d - recule, d, "", d - recule, d - recule);
          return;
        }
      }

      if (e.key === "Tab") {
        if (echappe) { echappe = false; return; }
        e.preventDefault();
        if (d !== f || e.shiftKey) {
          const dl = t.lastIndexOf("\n", d - 1) + 1;
          const lignes = t.slice(dl, f).split("\n");
          const neuf = lignes.map((l) => e.shiftKey
            ? l.replace(new RegExp("^ {1," + PAS + "}"), "") : ALINEA + l).join("\n");
          remplacer(dl, f, neuf, dl, dl + neuf.length);
        } else remplacer(d, f, ALINEA, d + PAS, d + PAS);
        return;
      }
      echappe = false;

      /* L'Entrée simple — l'indentation automatique. Elle se garde bien de
         se déclencher quand un modificateur est tenu : sans ce garde, ⌘⏎
         ajoutait un retour à la ligne AVANT même d'exécuter. */
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const dl = t.lastIndexOf("\n", d - 1) + 1;
        const debutLigne = t.slice(dl, d);
        const creux = (debutLigne.match(/^[ \t]*/) || [""])[0];
        /* Signalé : valider sur une ligne vide ajoutait un alinéa de
           plus à chaque fois — l'escalier.

           Le caractère qui décide d'ouvrir un cran, c'est le dernier de
           LA LIGNE COURANTE. Il était pris sur tout le document :
           « t.slice(0, d).trimEnd() » saute les lignes vides et remonte
           au dernier caractère écrit, qui est justement l'accolade
           ouvrante quand on vient d'entrer dans un bloc. Chaque Entrée
           sur une ligne vide rajoutait donc un cran — quatre espaces,
           puis huit, puis douze. L'escalier.

           Sur une ligne vide, il n'y a pas de dernier caractère : on
           recopie l'alinéa, et c'est tout. */
        const avant = debutLigne.trimEnd().slice(-1);
        const apres = t.slice(f, f + 1);
        if (avant === "{" && apres === "}") {
          const ins = "\n" + creux + "    \n" + creux;
          remplacer(d, f, ins, d + creux.length + 5, d + creux.length + 5);
        } else if (d === f && creux && !debutLigne.trim()) {
          /* On quitte une ligne qui ne contient QUE l'alinéa posé au
             retour précédent. On ne la laisse pas pleine d'espaces
             invisibles : le fichier d'un TP se relit, et se rend. */
          const ins = "\n" + creux;
          remplacer(dl, f, ins, dl + ins.length, dl + ins.length);
        } else {
          const ins = "\n" + creux + (avant === "{" || avant === ":" ? "    " : "");
          remplacer(d, f, ins, d + ins.length, d + ins.length);
        }
        return;
      }

      if (PAIRES[e.key] && d === f) {
        const suivant = t.slice(d, d + 1);
        /* Une apostrophe dans un mot n'ouvre pas une paire. */
        if ((e.key === "'" || e.key === '"') && /[\w]/.test(t.slice(d - 1, d))) return;
        if (!suivant || /[\s)\];},]/.test(suivant)) {
          e.preventDefault();
          remplacer(d, f, e.key + PAIRES[e.key], d + 1, d + 1);
        }
        return;
      }
      if ((e.key === ")" || e.key === "]" || e.key === "}" || e.key === '"' || e.key === "'")
          && d === f && t.slice(d, d + 1) === e.key) {
        e.preventDefault();
        saisie.selectionStart = saisie.selectionEnd = d + 1;
        return;
      }
      if (e.key === "Backspace" && d === f && PAIRES[t.slice(d - 1, d)] === t.slice(d, d + 1)) {
        e.preventDefault();
        remplacer(d - 1, d + 1, "", d - 1, d - 1);
      }
    });

    /* execCommand garde l'historique d'annulation du navigateur ; un
       affectation directe de .value l'efface. Ctrl+Z doit marcher. */
    function remplacer(d, f, texte, nd, nf) {
      const t = saisie.value;
      const attendu = t.slice(0, d) + texte + t.slice(f);
      saisie.focus();
      saisie.setSelectionRange(d, f);
      /* « execCommand » garde l'ANNULATION native — Ctrl+Z défait ce
         qu'on vient d'écrire comme si on l'avait tapé —, et c'est la
         seule raison de l'essayer d'abord.

         Mais il RETOURNE VRAI sans rien faire quand le champ n'a pas le
         focus : une page ouverte dans un cadre, un navigateur qui n'est
         pas au premier plan, et l'écriture disparaît en silence. Croire
         sa parole, c'était croire un témoin qui n'a pas regardé. On
         relit donc le texte : c'est la seule preuve qui compte, et elle
         ne coûte qu'une comparaison. Trouvé par le diagnostic de
         l'éditeur, au premier passage du banc de rendu. */
      try { document.execCommand("insertText", false, texte); } catch (e) {}
      if (saisie.value !== attendu) saisie.value = attendu;
      saisie.setSelectionRange(nd, nf);
      redessiner();
    }

    function aller(ligne, colonne) {
      const lignes = saisie.value.split("\n");
      let p = 0;
      for (let i = 0; i < Math.min(ligne - 1, lignes.length); i++) p += lignes[i].length + 1;
      p += Math.max(0, (colonne || 1) - 1);
      saisie.focus();
      saisie.setSelectionRange(p, p);
      /* Centrer la ligne visée : un curseur posé hors du cadre visible ne
         sert à rien.

         Signalé : « quand je fais alt z les lignes ne sont pas les
         bonnes ». Le curseur, lui, était au bon endroit — c'est le
         DÉFILEMENT qui montrait ailleurs. Il divisait la hauteur totale
         par le nombre de lignes, ce qui n'est juste que si chaque ligne
         occupe exactement une rangée : vrai tant que l'enroulement est
         éteint, faux dès qu'Alt+Z l'allume. Mesuré sur un programme de
         huit lignes dont deux s'enroulent : la ligne 4 est à 142 px, la
         moyenne visait 308 — sept rangées trop bas.

         C'est MOT POUR MOT le défaut du clic dans la marge, corrigé en
         son temps… dans la marge seulement. La marge, elle, porte déjà
         la bonne géométrie : ses numéros ont la hauteur des lignes
         enroulées. On lui demande donc la position au lieu de la
         recalculer — et la réponse est juste dans les deux modes, y
         compris sur une ligne vide, qu'aucune mesure de texte ne sait
         situer. */
      const nums = marge.children;
      const premier = nums[0];
      const vise = nums[Math.min(Math.max(1, ligne), nums.length) - 1];
      if (premier && vise) {
        saisie.scrollTop = Math.max(0, vise.offsetTop - premier.offsetTop
                                       - saisie.clientHeight / 2);
      } else {
        const h = saisie.scrollHeight / Math.max(1, lignes.length);
        saisie.scrollTop = Math.max(0, (ligne - 1) * h - saisie.clientHeight / 2);
      }
      saisie.dispatchEvent(new Event("scroll"));
    }

    /* Élargir le volet, tirer le séparateur, passer en plein écran,
       tourner le téléphone : la largeur change, les enroulements changent
       avec elle, et les numéros se décaleraient de nouveau. Un
       observateur sur la couche peinte les couvre tous les quatre — et il
       ne mesure rien tant que l'enroulement est éteint. */
    if (typeof ResizeObserver === "function") {
      let largeur = 0;
      new ResizeObserver(() => {
        const l = peint.clientWidth;
        if (l === largeur) return;
        largeur = l;
        ajusterMarge(saisie.value);
      }).observe(peint);
    }

    /* ── remettre l'alinéa de tout le programme ───────────────────────
       Demandé : un bouton, parce que refaire l'alinéa ligne à ligne est
       fastidieux.

       Le calcul vit dans « indenter.js », qui ne connaît pas le DOM et
       se mesure donc hors navigateur — 289 contrôles, dont le seul qui
       compte vraiment : le texte rendu, chaque ligne débarrassée de son
       alinéa, est identique au texte reçu. Si la preuve ne passe pas, on
       n'écrit rien. Mal aligner est un défaut ; rendre autre chose que
       le programme serait une perte.

       Le curseur ne se repose pas à la même POSITION — le texte a bougé
       — mais sur la même ligne et à la même place dans cette ligne.
       C'est ce qu'on suit des yeux, et c'est ce qu'on s'attend à
       retrouver. */
    function realigner() {
      if (typeof INDENTER === "undefined") return { ok: false };
      const t = saisie.value;
      const r = INDENTER.reindenter(t);
      if (!r.ok) return { ok: false };
      if (!r.change) return { ok: true, change: false };
      const d = saisie.selectionStart;
      const debutLigne = t.lastIndexOf("\n", d - 1) + 1;
      const ligne = t.slice(0, d).split("\n").length - 1;
      const creuxAvant = (t.slice(debutLigne).match(/^[ \t]*/) || [""])[0].length;
      const colonne = Math.max(0, d - debutLigne - creuxAvant);
      const lignes = r.texte.split("\n");
      let pos = 0;
      for (let i = 0; i < ligne && i < lignes.length; i++) pos += lignes[i].length + 1;
      const creuxApres = ((lignes[ligne] || "").match(/^[ \t]*/) || [""])[0].length;
      const p = Math.min(r.texte.length, pos + creuxApres + colonne);
      remplacer(0, t.length, r.texte, p, p);
      return { ok: true, change: true };
    }

    /* ── le diagnostic de l'éditeur ───────────────────────────────────
       Les deux défauts signalés le 11 octobre n'étaient visibles ni à
       l'œil ni par une mesure de mise en page : un collage qui ne va
       qu'à un endroit ne déborde pas, et une marge décalée non plus. Le
       banc de rendu peut mesurer deux mille largeurs sans rien voir.
       Un outil doit donc savoir se dire en panne, et c'est ici.

       Il MODIFIE le programme en cours le temps de quelques gestes, puis
       le repose au caractère près — texte, sélections, position du
       curseur et enroulement. Les gestes sont déclenchés par de VRAIS
       événements quand c'est possible : ce qui se casse, dans ce genre
       de défaut, c'est le branchement, pas la fonction. */
    function diagnostic() {
      const r = { controles: 0, erreurs: [] };
      const sauve = saisie.value;
      const selD = saisie.selectionStart, selF = saisie.selectionEnd;
      const multiSauve = multi.slice();
      const enrouleSauve = racine.classList.contains("enroule");
      const dit = (ok, quoi) => { r.controles++; if (!ok) r.erreurs.push(quoi); };
      const poser = (v) => { saisie.value = v; multi = []; redessiner(); };
      const TROIS = "int n = 0;\nint n2 = n + 1;\nreturn n;\n";
      const troisFois = () => {
        poser(TROIS);
        saisie.setSelectionRange(4, 5);
        ajouterOccurrence(); ajouterOccurrence(); ajouterOccurrence();
      };
      try {
        // 1. Ctrl+D prend bien les trois occurrences.
        troisFois();
        dit(multi.length === 3, "Ctrl+D : " + multi.length + " sélections au lieu de 3");

        // 2. une frappe va dans les trois.
        frapperPartout("k", 0, 0);
        dit(saisie.value === "int k = 0;\nint n2 = k + 1;\nreturn k;\n",
            "frappe multiple : " + JSON.stringify(saisie.value));

        // 3. le collage et la copie aussi — par leurs écouteurs.
        let presse = null;
        try { presse = new DataTransfer(); } catch (e) { presse = null; }
        if (presse) {
          troisFois();
          presse.setData("text/plain", "cpt");
          saisie.dispatchEvent(new ClipboardEvent("paste",
            { clipboardData: presse, bubbles: true, cancelable: true }));
          dit(saisie.value === "int cpt = 0;\nint n2 = cpt + 1;\nreturn cpt;\n",
              "collage multiple : " + JSON.stringify(saisie.value));
          dit(multi.length === 3, "collage multiple : les sélections sont perdues après coup");

          /* Les curseurs sont retombés vides : le presse-papiers ne doit
             PAS être écrasé par trois chaînes vides. */
          const vide = new DataTransfer();
          vide.setData("text/plain", "ce-qui-etait-la");
          saisie.dispatchEvent(new ClipboardEvent("copy",
            { clipboardData: vide, bubbles: true, cancelable: true }));
          dit(vide.getData("text/plain") === "ce-qui-etait-la",
              "copie sur curseurs vides : le presse-papiers a été écrasé par "
              + JSON.stringify(vide.getData("text/plain")));

          /* Et sur des sélections vivantes, les trois partent. */
          troisFois();
          const copie = new DataTransfer();
          saisie.dispatchEvent(new ClipboardEvent("copy",
            { clipboardData: copie, bubbles: true, cancelable: true }));
          dit(copie.getData("text/plain") === "n\nn\nn",
              "copie multiple : " + JSON.stringify(copie.getData("text/plain")));
        }

        // 4. l'alinéa automatique ne monte pas en escalier.
        poser("int main() {");
        saisie.setSelectionRange(12, 12);
        for (let i = 0; i < 4; i++)
          saisie.dispatchEvent(new KeyboardEvent("keydown",
            { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
        dit(saisie.value === "int main() {\n\n\n\n    ",
            "alinéa en escalier : " + JSON.stringify(saisie.value));
        poser("int main() {");
        saisie.setSelectionRange(12, 12);
        saisie.dispatchEvent(new KeyboardEvent("keydown",
          { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
        dit(saisie.value === "int main() {\n    ",
            "l'accolade n'ouvre plus un cran : " + JSON.stringify(saisie.value));

        // 5. le bouton « Indenter » remet l'alinéa, et ne casse rien.
        if (typeof INDENTER !== "undefined") {
          poser("int main()\n{\nint x = 0;\nif (x)\n{\nfoo();\n}\n}\n");
          saisie.setSelectionRange(0, 0);
          var rr = realigner();
          dit(rr.ok && rr.change, "le bouton Indenter n'a rien fait");
          dit(saisie.value === "int main()\n{\n    int x = 0;\n    if (x)\n    {\n        foo();\n    }\n}\n",
              "alinéa refait de travers : " + JSON.stringify(saisie.value));
          var fige = saisie.value;
          realigner();
          dit(saisie.value === fige, "deux appels ne donnent pas la même chose");
        }

        // 6. la marge suit les lignes enroulées — si l'éditeur est posé.
        if (peint.clientWidth > 10) {
          poser("a\n// " + "mot ".repeat(90).trim() + "\nb\n");
          if (!racine.classList.contains("enroule")) basculerEnroulement();
          ajusterMarge(saisie.value);
          const pas = parseFloat(getComputedStyle(peint).lineHeight);
          const hauts = [];
          for (let i = 0; i < marge.children.length; i++)
            hauts.push(marge.children[i].getBoundingClientRect().height);
          dit(hauts.length === 4, "marge : " + hauts.length + " numéros au lieu de 4");
          dit(hauts[1] > pas * 1.5, "marge : la ligne enroulée occupe "
              + Math.round(hauts[1]) + " px, soit une seule rangée");
          dit(Math.abs(marge.scrollHeight - saisie.scrollHeight) <= 4,
              "marge : " + marge.scrollHeight + " px contre "
              + saisie.scrollHeight + " px dans le champ");
        }
      } catch (e) {
        r.erreurs.push("exception : " + e.message);
      } finally {
        if (racine.classList.contains("enroule") !== enrouleSauve) basculerEnroulement();
        saisie.value = sauve;
        multi = multiSauve;
        redessiner();
        try { saisie.setSelectionRange(selD, selF); } catch (e) {}
      }
      return r;
    }

    return {
      get valeur() { return saisie.value; },
      set valeur(v) { saisie.value = v; redessiner(); },
      get langue() { return langue; },
      set langue(l) { langue = l; redessiner(); },
      set marquesErreur(m) { marques = m; marge.dataset.marques = "-"; redessiner(); },
      get surlignages() { return surlignages.map((m) => [m.d, m.f, m.couleur]); },
      set surlignages(v) {
        /* Les quatre teintes, et rien d'autre. Un état enregistré pendant
           que le défaut ci-dessus était vivant porte des « couleurs » qui
           sont des mots du programme : elles n'ont aucune règle de style,
           donc un surlignage invisible qui mange les vrais. On les jette au
           chargement plutôt que de les laisser revenir. */
        surlignages = (Array.isArray(v) ? v : []).filter(
          (m) => Array.isArray(m) && m.length === 3 && m[1] > m[0]
                 && TEINTES.indexOf(m[2]) >= 0
        ).map((m) => ({ d: m[0], f: m[1], couleur: m[2] }));
        redessiner();
      },
      surligner,
      aller, focus: () => saisie.focus(), element: saisie, diagnostic, realigner,
    };
  }

  /* ═════════════════════════════════════════════════════ 3. LA CONSOLE
     Le transcript est une suite de segments : ce que le programme écrit, et
     ce que l'étudiant tape. Il faut les distinguer parce qu'une exécution
     peut être REJOUÉE (voir « relance » plus bas) : la sortie du programme
     est alors réémise à l'identique, tandis que les saisies, elles, ont déjà
     eu lieu et ne doivent pas être redemandées. */
  function Console(racine) {
    const flux = $(".con-flux", racine);
    let sortieProg = "";      // sortie cumulée du programme, depuis le début
    let saisies = [];         // { position, texte, avant } — ce qu'on a tapé, et où
    let posees = 0;           // combien de saisies sont déjà replacées
    let noeud = null;

    function vider() { flux.textContent = ""; sortieProg = ""; saisies = []; posees = 0; noeud = null; }

    /* Une relance rejoue le programme DEPUIS LE DÉBUT avec la saisie en plus.
       On efface donc l'affichage et on le reconstruit — sortie du programme
       et saisies intercalées à leur place — plutôt que d'empiler deux
       transcriptions. C'est ce qui fait que ça ressemble à un terminal. */
    function reprendre() { flux.textContent = ""; sortieProg = ""; posees = 0; noeud = null; }

    function segment(classe) {
      const s = document.createElement("span");
      s.className = classe;
      flux.appendChild(s);
      noeud = null;
      return s;
    }
    function ajouter(texte, erreur) {
      if (!texte) return;
      if (!noeud || noeud.dataset.err !== (erreur ? "1" : "0")) {
        noeud = document.createElement("span");
        noeud.className = erreur ? "con-prog con-err" : "con-prog";
        noeud.dataset.err = erreur ? "1" : "0";
        flux.appendChild(noeud);
      }
      noeud.appendChild(document.createTextNode(texte));
    }
    function poserSaisie(s) {
      const e = segment("con-saisie");
      e.textContent = s.texte + "\n";
    }

    /* Reçoit la sortie CUMULÉE du programme depuis le début de l'exécution. */
    function poser(cumul, erreur) {
      let base = sortieProg.length;
      let reste = cumul.slice(base);
      for (;;) {
        const p = saisies[posees];
        if (p && p.position <= base) {
          /* Le programme n'a pas réécrit la même chose qu'au tour d'avant :
             la saisie ne tombe plus au bon endroit. On le dit une fois,
             plutôt que de laisser croire à une transcription fidèle. */
          if (p.avant && cumul.slice(Math.max(0, p.position - p.avant.length), p.position) !== p.avant) {
            const n = segment("con-note");
            n.textContent = "[ ce programme ne réagit pas deux fois pareil : "
                          + "la transcription ci-dessous est approximative ]\n";
            p.avant = "";
          }
          poserSaisie(p);
          posees++;
          continue;
        }
        if (!reste) break;
        const coupe = p ? Math.max(0, Math.min(reste.length, p.position - base)) : reste.length;
        if (coupe === 0) break;
        ajouter(reste.slice(0, coupe), erreur);
        base += coupe;
        reste = reste.slice(coupe);
      }
      sortieProg = cumul;
      flux.scrollTop = flux.scrollHeight;
    }

    function echo(texte) {
      saisies.push({ position: sortieProg.length, texte,
                     avant: sortieProg.slice(-48) });
      posees = saisies.length;
      poserSaisie(saisies[saisies.length - 1]);
      flux.scrollTop = flux.scrollHeight;
    }

    function note(texte, genre) {
      segment("con-note" + (genre ? " con-" + genre : "")).textContent = texte + "\n";
      flux.scrollTop = flux.scrollHeight;
    }

    return { vider, reprendre, poser, echo, note,
             get sortie() { return sortieProg; } };
  }

  /* ═══════════════════════════════════════════════════════ 4. LE MOTEUR */
  function Moteur(base, surEtat, differe) {
    const ouvrier = new Worker(base + "ouvrier-compilateur.js");
    /* Une TABLE de demandes en cours, et non une seule : depuis que la
       relecture tourne pendant qu'on écrit, une construction lancée au
       même moment doit pouvoir cohabiter avec elle. Un emplacement
       unique faisait perdre la réponse de la première arrivée. */
    let pret = false, attentes = [], jeton = 0, lance = false;
    const enCours = new Map();

    ouvrier.onmessage = (e) => {
      const m = e.data;
      if (m.t === "progres" || m.t === "phase") { surEtat(m); return; }
      if (m.t === "pret") {
        pret = true;
        surEtat({ t: "pret" });
        try { localStorage.setItem(CLE + "-moteur", "1"); } catch (err) {}
        const a = attentes; attentes = [];
        a.forEach((f) => f());
        return;
      }
      if (m.jeton !== undefined && enCours.has(m.jeton)) {
        const r = enCours.get(m.jeton);
        enCours.delete(m.jeton);
        r(m);
      }
    };
    ouvrier.onerror = (e) => surEtat({ t: "panne", message: e.message || "ouvrier interrompu" });

    /* « differe » : le moteur ne se télécharge pas tout seul. Il reste
       lançable à la demande — c'est ce qui permet à un banc d'essai de
       mesurer la page sans tirer soixante mégaoctets quatre-vingts fois. */
    function lancer() {
      if (lance) return;
      lance = true;
      surEtat({ t: "demarre" });
      ouvrier.postMessage({ t: "demarrer" });
    }
    if (!differe) lancer();

    function quandPret() {
      lancer();
      return pret ? Promise.resolve() : new Promise((r) => attentes.push(r));
    }
    async function batir(source, langue, strict) {
      await quandPret();
      const j = ++jeton;
      return new Promise((resoudre) => {
        enCours.set(j, resoudre);
        ouvrier.postMessage({ t: "batir", source, langue, strict, jeton: j });
      });
    }
    /* La relecture ne RÉVEILLE JAMAIS le moteur : tant qu'il n'est pas
       déjà là, elle se tait. Télécharger soixante mégaoctets parce que
       quelqu'un a tapé une lettre serait le contraire d'un service. */
    function relire(source, langue) {
      if (!pret) return Promise.resolve(null);
      const j = ++jeton;
      return new Promise((resoudre) => {
        enCours.set(j, resoudre);
        ouvrier.postMessage({ t: "relire", source, langue, jeton: j });
      });
    }
    return { batir, relire, quandPret, lancer, get pret() { return pret; } };
  }

  /* ══════════════════════════════════════════════════════ 5. L'ATELIER */
  function demarrer() {
    const racine = $("#atelier");
    if (!racine) return;
    const base = racine.dataset.moteur || "c/";

    const editeur = Editeur($(".edi", racine), () => {
      planifierSauvegarde(); marquerModifie(); planifierRelecture();
    });
    const console2 = Console($(".con", racine));
    const bEx = $("#at-executer");
    const bArret = $("#at-arreter");
    const etat = $("#at-etat");
    const jauge = $("#at-jauge");
    const diags = $("#at-diagnostics");
    const zoneEntree = $("#at-entree");
    const champEntree = $("#at-champ-entree");
    const choixLangue = $$("#at-langue [data-langue]");
    const bStrict = $("#at-strict");
    const bRelecture = $("#at-relecture");

    let langue = "c";
    let strict = true;
    let relirePendantLaFrappe = true;
    let ouvrierExec = null, minuteur = null, budget = 5000;
    let entreeCumul = "", attendEntree = false, wasmCourant = null, fichiers = {};
    let finSaisie = false;
    let tourne = false;

    /* ── état affiché ─────────────────────────────────────────────── */
    const mo = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0).replace(".", ",");
    function dirEtat(texte, genre) {
      etat.textContent = texte;
      etat.className = "at-etat" + (genre ? " e-" + genre : "");
    }
    /* Deux raisons de ne pas télécharger d'office, décidées avant même de
       créer l'ouvrier : le mode économie de données du téléphone, et la page
       ouverte dans un cadre — c'est ainsi que les deux bancs d'essai du site
       chargent chaque page, quarante thèmes fois deux largeurs. */
    const enCadre = window.top !== window.self;
    const economie = !!(navigator.connection && navigator.connection.saveData);
    const differe = enCadre || economie;

    const moteur = Moteur(base, (m) => {
      if (m.t === "progres") {
        jauge.hidden = false;
        jauge.style.setProperty("--part", (m.recus / m.total * 100).toFixed(1) + "%");
        dirEtat("Compilateur : " + mo(m.recus) + " Mo sur " + mo(m.total), "charge");
        jauge.setAttribute("aria-valuenow", Math.round(m.recus / m.total * 100));
      } else if (m.t === "demarre") {
        dirEtat("Chargement du compilateur…", "charge");
        bEx.disabled = true;
      } else if (m.t === "phase") {
        dirEtat("Préparation du compilateur…", "charge");
      } else if (m.t === "pret") {
        jauge.hidden = true;
        dirEtat("Compilateur prêt", "ok");
        bEx.disabled = false;
        /* Une faute déjà présente à l'ouverture doit se voir sans qu'on
           ait besoin de taper quelque chose pour la réveiller. */
        planifierRelecture();
        setTimeout(() => { if (etat.textContent === "Compilateur prêt") dirEtat("", ""); }, 4000);
      } else if (m.t === "panne") {
        jauge.hidden = true;
        dirEtat("Le compilateur n'a pas pu se charger : " + m.message, "erreur");
      }
    }, differe);

    /* ── exécuter ─────────────────────────────────────────────────── */
    /* ── exécuter du Python ───────────────────────────────────────────
       Rien à compiler, rien à télécharger : l'interprète est déjà là, et il
       rend tout d'un coup — la sortie complète, ou l'erreur avec sa ligne.
       Il n'y a donc ni ouvrier, ni minuterie, ni saisie au clavier : c'est
       un sous-ensemble assumé, pas un Python incomplet dont on espère que
       ça passe, et la page le dit sous l'éditeur.

       La borne d'opérations est DANS l'interprète : une boucle sans fin
       s'arrête d'elle-même au lieu de figer l'onglet. C'est le seul endroit
       où elle peut être posée — un setTimeout ne peut pas interrompre du
       JavaScript synchrone. */
    function executerPython() {
      console2.vider();
      diags.innerHTML = "";
      editeur.marquesErreur = [];
      zoneEntree.hidden = true;
      if (!window.PYMINI) {
        dirEtat("L'interprète Python n'a pas pu être chargé.", "erreur");
        console2.note("Le fichier calculatrice/python-mini.js est absent.", "stop");
        return;
      }
      const t0 = performance.now();
      let r;
      try { r = window.PYMINI.executer(editeur.valeur); }
      catch (e) { r = { ok: false, sortie: [], erreur: { message: String(e && e.message || e), ligne: 0 } }; }
      const ms = Math.round(performance.now() - t0);
      const sortie = (r.sortie || []).join("\n");
      if (sortie) console2.poser(sortie + "\n", false);
      if (r.ok) {
        dirEtat("Terminé en " + ms + " ms — " + (r.operations || 0) + " opérations", "ok");
      } else {
        const g = r.erreur || {};
        if (g.ligne) {
          editeur.marquesErreur = [{ ligne: g.ligne, niveau: "error" }];
          afficherDiagnostics([{ ligne: g.ligne, colonne: 1, niveau: "error",
                                 message: g.message, fr: g.message }]);
        }
        console2.note("⚑ " + (g.message || "erreur")
          + (g.ligne ? " (ligne " + g.ligne + ")" : ""), "stop");
        dirEtat("Le programme s'est arrêté sur une erreur", "erreur");
      }
    }

    async function executer(relance) {
      if (tourne && !relance) return;
      /* Le Python ne passe pas par le compilateur : il part d'ici, avant
         qu'on allume quoi que ce soit de la chaîne wasm. */
      if (langue === "python") { executerPython(); return; }
      arreterExec();
      tourne = true;
      bEx.disabled = true;
      /* « Compilation… » serait faux tant que le moteur n'est pas là : au
         premier lancement, l'attente est un téléchargement, et le dire
         autrement laisse croire que c'est le programme qui met vingt
         secondes à compiler. */
      bEx.querySelector(".lib").textContent = moteur.pret ? "Compilation…" : "Chargement…";
      bArret.hidden = false;
      if (!relance) {
        console2.vider();
        diags.innerHTML = "";
        entreeCumul = "";
        finSaisie = false;
        fichiers = {};
        editeur.marquesErreur = [];
        zoneEntree.hidden = true;
      } else {
        console2.reprendre();       // la sortie va être réémise depuis le début
      }
      attendEntree = false;

      const t0 = performance.now();
      if (!moteur.pret) dirEtat("Attente du compilateur…", "charge");
      const r = await moteur.batir(editeur.valeur, langue, strict);
      const msC = Math.round(performance.now() - t0);
      bEx.querySelector(".lib").textContent = "Exécution…";

      afficherDiagnostics(r.diagnostics || []);
      if (!r.ok) {
        tourne = false;
        bEx.disabled = false;
        bEx.querySelector(".lib").textContent = "Exécuter";
        bArret.hidden = true;
        const n = (r.diagnostics || []).filter((d) => d.niveau !== "warning" && d.niveau !== "note").length;
        dirEtat(n > 1 ? n + " erreurs — le programme n'a pas pu être construit"
                      : "Une erreur — le programme n'a pas pu être construit", "erreur");
        console2.note("Rien n'a été exécuté : le programme ne compile pas.", "stop");
        return;
      }
      wasmCourant = r.wasm;
      dirEtat("Exécution…", "charge");
      bEx.querySelector(".lib").textContent = "Exécution…";
      lancerProgramme(r.wasm, msC);
    }

    function lancerProgramme(wasm, msC) {
      /* La copie est nécessaire : un ArrayBuffer transféré à l'ouvrier est
         détaché ici, et il faut pouvoir REJOUER la même exécution quand
         l'étudiant fournit une saisie. */
      const copie = wasm.slice(0);
      ouvrierExec = new Worker(base + "ouvrier-execution.js");
      let sortie = "";
      const t0 = performance.now();

      ouvrierExec.onmessage = (e) => {
        const m = e.data;
        if (m.t === "sortie") { sortie += m.texte; console2.poser(sortie, m.erreur); return; }
        if (m.t === "garde") { ajouterGarde(m); return; }
        if (m.t === "attente") { attendEntree = true; demanderEntree(); return; }
        if (m.t === "fini") {
          clearTimeout(minuteur);
          fichiers = m.fichiers || {};
          finExec(m, msC, Math.round(performance.now() - t0));
        }
      };
      ouvrierExec.onerror = (e) => {
        clearTimeout(minuteur);
        console2.note("L'exécution s'est interrompue : " + (e.message || "erreur inconnue"), "stop");
        finExec({ code: -1 }, msC, 0);
      };
      minuteur = setTimeout(() => {
        arreterExec();
        console2.note("⏱ Arrêté au bout de " + (budget / 1000) + " s : le programme ne s'arrêtait pas.", "stop");
        carteBoucle();
        finExec({ code: -1, interrompu: true }, msC, budget);
      }, budget);

      ouvrierExec.postMessage({ wasm: copie, entree: entreeCumul,
                                finEntree: finSaisie, fichiers }, [copie]);
    }

    function finExec(m, msC, msE) {
      tourne = false;
      bEx.disabled = false;
      bEx.querySelector(".lib").textContent = "Exécuter";
      bArret.hidden = true;
      if (m.panne) {
        if (m.panne.genre === "trop-ecrit") { console2.note("⏱ " + m.panne.message, "stop"); carteBoucle(); }
        else console2.note("Le programme s'est arrêté brutalement : " + m.panne.message, "stop");
      }
      if (!attendEntree) zoneEntree.hidden = true;
      /* Le programme s'est arrêté sur une question, pas à sa fin : il ne
         faut ni annoncer « Terminé », ni chercher dans une sortie encore
         incomplète la trace d'une variable non initialisée. */
      if (m.attente) { dirEtat("Le programme attend une saisie", "avert"); return; }
      signaturePattern();
      if (m.interrompu) { dirEtat("Interrompu", "erreur"); return; }
      const bilan = "compilé en " + msC + " ms, exécuté en " + msE + " ms";
      if (m.code === 0) dirEtat("Terminé — " + bilan, "ok");
      else dirEtat("Terminé avec le code " + m.code + " — " + bilan, "avert");
      listerFichiers();
    }

    function arreterExec() {
      if (ouvrierExec) { ouvrierExec.terminate(); ouvrierExec = null; }
      clearTimeout(minuteur);
    }

    bArret.addEventListener("click", () => {
      arreterExec();
      console2.note("Arrêté à la demande.", "stop");
      tourne = false;
      bEx.disabled = false;
      bEx.querySelector(".lib").textContent = "Exécuter";
      bArret.hidden = true;
      dirEtat("Arrêté", "avert");
    });

    /* ── la saisie au clavier, rejouée ───────────────────────────────
       WebAssembly ne sait pas suspendre une exécution pour attendre une
       frappe : il n'y a pas d'appel bloquant possible sans SharedArrayBuffer,
       que GitHub Pages ne peut pas activer. Plutôt qu'exiger de préparer
       l'entrée à l'avance — ce qu'aucun terminal ne demande —, on REJOUE le
       programme depuis le début avec la saisie ajoutée. Le programme étant
       déterministe, il réécrit exactement la même chose : la console n'a
       donc rien à réafficher jusqu'au point où l'on en était, et l'illusion
       d'un vrai terminal tient. Si jamais il diverge, la console le dit au
       lieu de faire semblant. */
    function demanderEntree() {
      zoneEntree.hidden = false;
      champEntree.focus();
    }
    function envoyerEntree() {
      if (!attendEntree || !wasmCourant) return;
      const v = champEntree.value;
      champEntree.value = "";
      console2.echo(v);
      entreeCumul += v + "\n";
      zoneEntree.hidden = true;
      attendEntree = false;
      arreterExec();
      if (wasmCourant) { dirEtat("Reprise…", "charge"); tourne = true; bEx.disabled = true;
                         bArret.hidden = false; lancerProgramme(wasmCourant, 0); }
    }
    $("#at-envoyer").addEventListener("click", envoyerEntree);
    /* L'équivalent du Ctrl+D d'un terminal. Sans lui, un programme bâti sur
       « while (scanf(…) == 1) » — la boucle de lecture la plus courante —
       redemanderait indéfiniment : on ne peut jamais lui dire que c'est fini. */
    $("#at-fin-saisie").addEventListener("click", () => {
      if (!attendEntree || !wasmCourant) return;
      finSaisie = true;
      attendEntree = false;
      zoneEntree.hidden = true;
      console2.note("— fin de saisie —", "info");
      tourne = true; bEx.disabled = true; bArret.hidden = false;
      arreterExec();
      dirEtat("Reprise…", "charge");
      lancerProgramme(wasmCourant, 0);
    });
    champEntree.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); envoyerEntree(); }
    });

    /* ── la relecture pendant la frappe ──────────────────────────────
       Demandé : que la faute soit signalée dans programme.c AVANT de
       lancer — « il manque un ; ».

       Trois précautions, et chacune répond à une façon de rendre ce
       confort insupportable :

       · on attend que la frappe s'arrête. Relire à chaque touche
         signalerait une faute à chaque mot commencé : tout programme
         est incorrect pendant qu'on l'écrit.
       · on ne relit QUE si le compilateur est déjà là. Télécharger
         soixante mégaoctets parce que quelqu'un a tapé une lettre
         serait le contraire d'un service.
       · on ne montre que les ERREURS. Un avertissement « variable
         inutilisée » sur une ligne en cours d'écriture est du bruit ;
         les avertissements restent pour l'exécution, qui est un geste
         volontaire.

       Et une quatrième, moins visible : la réponse est jetée si le
       texte a changé entre-temps. Afficher une faute qui vient d'être
       corrigée est pire que de ne rien afficher. */
    let minuterieRelire = null, texteRelu = null;
    const DELAI_RELIRE = 900;
    function planifierRelecture() {
      /* La relecture pendant la frappe est un CONFORT, pas une garantie :
         l'exécution dit de toute façon la vérité. Elle fait travailler le
         compilateur à chaque pause, et sur une machine lente ce travail se
         voit. Signalé : « quand je code maintenant c'est devenu super
         lent. » On peut donc l'éteindre — et c'est à lui d'en décider,
         pas à moi de supposer que sa machine suit. */
      if (!relirePendantLaFrappe) return;
      if (!moteur.pret) return;
      clearTimeout(minuterieRelire);
      minuterieRelire = setTimeout(relireMaintenant, DELAI_RELIRE);
    }
    async function relireMaintenant() {
      if (!moteur.pret || tourne) return;
      const source = editeur.valeur;
      if (source === texteRelu) return;
      const r = await moteur.relire(source, langue);
      if (!r || r.passe) return;
      if (editeur.valeur !== source) return;     // la frappe a continué
      texteRelu = source;
      const erreurs = (r.diagnostics || [])
        .filter((d) => String(d.niveau).indexOf("error") >= 0);
      afficherDiagnostics(erreurs);
      if (erreurs.length) {
        const d = erreurs[0];
        const fr = TRADUCTIONS.traduire(d.message);
        dirEtat((d.ligne ? "Ligne " + d.ligne + " · " : "")
                + (fr ? fr.titre : d.message)
                + (erreurs.length > 1 ? " — et " + (erreurs.length - 1) + " autre"
                   + (erreurs.length > 2 ? "s" : "") : ""), "erreur");
      } else {
        dirEtat("Pas de faute de syntaxe", "ok");
      }
    }

    /* ── diagnostics ────────────────────────────────────────────────── */
    function afficherDiagnostics(liste) {
      diags.innerHTML = "";
      /* Sans cette remise à zéro, l'en-tête « 3 erreurs » de l'exécution
         précédente restait posé au-dessus d'une liste devenue vide. */
      $("#at-diag-tete").hidden = true;
      const marques = [];
      const vrais = liste.filter((d) => d.niveau !== "note");
      for (const d of vrais) {
        const niveau = d.niveau.indexOf("error") >= 0 ? "erreur" : "avert";
        if (d.ligne) marques.push({ ligne: d.ligne, niveau, titre: d.message });
        diags.appendChild(carteDiagnostic(d, niveau));
      }
      editeur.marquesErreur = marques;
      if (!vrais.length) return;
      const n = vrais.filter((d) => d.niveau.indexOf("error") >= 0).length;
      const a = vrais.length - n;
      $("#at-diag-tete").hidden = false;
      $("#at-diag-tete").textContent =
        (n ? n + (n > 1 ? " erreurs" : " erreur") : "") + (n && a ? ", " : "") +
        (a ? a + (a > 1 ? " avertissements" : " avertissement") : "");
    }

    function carteDiagnostic(d, niveau) {
      const fr = TRADUCTIONS.traduire(d.message);
      const c = document.createElement("div");
      c.className = "at-diag d-" + niveau;
      const lieu = d.ligne
        ? '<button type="button" class="at-aller" data-ligne="' + d.ligne + '" data-colonne="'
          + d.colonne + '">ligne ' + d.ligne + "</button>"
        : "";
      const extrait = d.ligne ? extraitSource(d) : "";
      c.innerHTML =
        '<div class="at-diag-tete"><span class="at-puce">' +
        (niveau === "erreur" ? "✕" : "!") + "</span>" +
        "<h4>" + ech(fr ? fr.titre : d.message) + "</h4>" + lieu + "</div>" +
        extrait +
        (fr ? '<p class="at-pourquoi">' + ech(fr.explication) + "</p>" +
              (fr.remede ? '<p class="at-remede"><b>À faire :</b> ' + ech(fr.remede) + "</p>" : "")
            : "") +
        (d.notes && d.notes.length
          ? '<ul class="at-notes">' + d.notes.map((n) => {
              const t = TRADUCTIONS.traduire(n.message);
              return "<li>" + ech(t ? t.titre + " — " + t.remede : n.message) + "</li>";
            }).join("") + "</ul>"
          : "") +
        (fr ? '<details class="at-vo"><summary>Message d\'origine</summary><code>'
              + ech(d.message) + "</code></details>" : "");
      return c;
    }

    function extraitSource(d) {
      const ligne = editeur.valeur.split("\n")[d.ligne - 1];
      if (ligne === undefined) return "";
      const e = (d.etendues || []).filter((x) => x.l1 === d.ligne && x.l2 === d.ligne);
      let deb = d.colonne - 1, fin = d.colonne;
      if (e.length) {
        deb = Math.min.apply(null, e.map((x) => x.c1 - 1));
        fin = Math.max.apply(null, e.map((x) => x.c2 - 1));
      }
      deb = Math.max(0, Math.min(deb, ligne.length));
      fin = Math.max(deb + 1, Math.min(fin, ligne.length));
      return '<pre class="at-extrait"><code>' + peindre(ligne.slice(0, deb), langue)
        + '<mark>' + ech(ligne.slice(deb, fin) || " ") + "</mark>"
        + peindre(ligne.slice(fin), langue) + "</code></pre>";
    }

    function ajouterGarde(g) {
      const fr = TRADUCTIONS.traduireGarde(g);
      const c = document.createElement("div");
      c.className = "at-diag d-garde";
      c.innerHTML =
        '<div class="at-diag-tete"><span class="at-puce">⚑</span><h4>' + ech(fr.titre) + "</h4>" +
        (g.ligne ? '<button type="button" class="at-aller" data-ligne="' + g.ligne +
                   '" data-colonne="' + g.colonne + '">ligne ' + g.ligne + "</button>" : "") +
        "</div>" +
        (g.ligne ? extraitSource({ ligne: g.ligne, colonne: g.colonne, etendues: [] }) : "") +
        '<p class="at-pourquoi">' + ech(fr.explication) + "</p>" +
        (fr.remede ? '<p class="at-remede"><b>À faire :</b> ' + ech(fr.remede) + "</p>" : "") +
        '<p class="at-source">Détecté pendant l\'exécution — un compilateur ordinaire ' +
        "ne le signale pas.</p>";
      diags.appendChild(c);
      $("#at-diag-tete").hidden = false;
      console2.note("⚑ " + fr.titre + (g.ligne ? " (ligne " + g.ligne + ")" : ""), "garde");
    }

    function carteBoucle() {
      const c = document.createElement("div");
      c.className = "at-diag d-garde";
      c.innerHTML =
        '<div class="at-diag-tete"><span class="at-puce">⏱</span>' +
        "<h4>Le programme ne s'arrête pas</h4></div>" +
        '<p class="at-pourquoi">Une boucle tourne sans jamais remplir sa condition de sortie. ' +
        "C'est le seul défaut que ni le compilateur ni l'exécution ne peuvent signaler : " +
        "on ne peut que constater qu'il dure.</p>" +
        '<p class="at-remede"><b>À faire :</b> vérifiez que la variable testée par la boucle ' +
        "change bien à chaque tour, et dans le bon sens. Un « i++ » oublié, un « i-- » " +
        "à la place d'un « i++ », une condition « i &gt; 0 » sur un compteur qui monte.</p>" +
        '<p class="at-source"><button type="button" class="at-relancer">Relancer avec 30 secondes</button></p>';
      $(".at-relancer", c).addEventListener("click", () => { budget = 30000; executer(); });
      diags.appendChild(c);
      $("#at-diag-tete").hidden = false;
    }

    /* La signature de -ftrivial-auto-var-init : si ce nombre apparaît, la
       cause est connue et il vaut mieux la nommer que laisser chercher. */
    function signaturePattern() {
      const v = TRADUCTIONS.nonInitialise(console2.sortie);
      if (v === null || $(".d-noninit", diags)) return;
      const c = document.createElement("div");
      c.className = "at-diag d-garde d-noninit";
      c.innerHTML =
        '<div class="at-diag-tete"><span class="at-puce">⚑</span>' +
        "<h4>Une variable sert sans avoir été initialisée</h4></div>" +
        '<p class="at-pourquoi">La valeur <code>' + v + "</code> affichée par votre programme " +
        "n'est pas un hasard : c'est le motif que cet atelier écrit dans toute variable à " +
        "laquelle vous n'avez pas donné de valeur de départ. Sur votre PC, vous auriez eu un " +
        "nombre différent à chaque exécution — d'où les programmes qui « marchent une fois " +
        "sur deux ».</p>" +
        '<p class="at-remede"><b>À faire :</b> cherchez la variable et donnez-lui une valeur ' +
        "à sa déclaration : <code>int somme = 0;</code></p>";
      diags.appendChild(c);
      $("#at-diag-tete").hidden = false;
    }

    function listerFichiers() {
      const noms = Object.keys(fichiers);
      if (!noms.length) return;
      const c = document.createElement("div");
      c.className = "at-diag d-fichier";
      c.innerHTML = '<div class="at-diag-tete"><span class="at-puce">▤</span><h4>' +
        (noms.length > 1 ? noms.length + " fichiers écrits" : "Fichier écrit") + "</h4></div>" +
        noms.map((n) => "<p class=\"at-nomfic\">" + ech(n) + "</p><pre class=\"at-extrait\"><code>"
          + ech(fichiers[n].slice(0, 2000)) + "</code></pre>").join("");
      diags.appendChild(c);
      $("#at-diag-tete").hidden = false;
    }

    diags.addEventListener("click", (e) => {
      const b = e.target.closest(".at-aller");
      if (b) editeur.aller(+b.dataset.ligne, +b.dataset.colonne);
    });

    /* ── réglages, sauvegarde, exemples ─────────────────────────────── */
    /* Le tiroir des TP se redessine quand le langage change. « var », et non
       « let » : poserLangue peut être appelée pendant l'initialisation, avant
       que la ligne du tiroir ne soit atteinte. */
    var redessinerExemples = null;
    const NOM_LANGUE = { "c": "C", "c++": "C++", "python": "Python" };
    function poserLangue(l) {
      langue = l;
      editeur.langue = l;
      $("#at-nom-fichier").textContent =
        l === "c++" ? "programme.cpp" : l === "python" ? "programme.py" : "programme.c";
      /* « Strict » règle les avertissements du compilateur : en Python il
         n'y a pas de compilateur, et un bouton qui n'agit sur rien use la
         confiance dans tous les autres. */
      if (bStrict) bStrict.hidden = (l === "python");
      choixLangue.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.langue === l)));
      if (redessinerExemples) redessinerExemples(l);
      planifierSauvegarde();
    }
    choixLangue.forEach((b) => b.addEventListener("click", () => poserLangue(b.dataset.langue)));

    bStrict.addEventListener("click", () => {
      strict = !strict;
      bStrict.setAttribute("aria-pressed", String(strict));
      planifierSauvegarde();
    });

    if (bRelecture) bRelecture.addEventListener("click", () => {
      relirePendantLaFrappe = !relirePendantLaFrappe;
      bRelecture.setAttribute("aria-pressed", String(relirePendantLaFrappe));
      if (!relirePendantLaFrappe) {
        /* Éteindre doit aussi EFFACER ce qui était affiché : laisser un
           soulignement rouge qui ne se mettra plus jamais à jour serait
           pire que de ne rien montrer. */
        clearTimeout(minuterieRelire);
        texteRelu = null;
        afficherDiagnostics([]);
      } else {
        planifierRelecture();
      }
      planifierSauvegarde();
    });

    let tSauve = null, modifie = false;
    function marquerModifie() { modifie = true; }
    function planifierSauvegarde() {
      clearTimeout(tSauve);
      tSauve = setTimeout(sauver, 600);
    }
    /* Déclarée ICI, et pas dans le bloc du séparateur deux cents lignes
       plus bas : « sauver » la lit, et un « let » dans sa zone morte
       temporelle lève — même interrogé par « typeof ». Ce dépôt s'est
       déjà fait avoir par quatre déclarations dans cet ordre-là. */
    let partVolets = 0.5;
    let ediTheme = "nuit";

    /* ── Le menu Réglages ──────────────────────────────────────────────
       Il se ferme sur un clic ailleurs et sur Échap, et PAS quand on
       actionne ce qu'il contient : on veut pouvoir basculer les contrôles
       d'exécution puis changer de thème sans le rouvrir deux fois. Les
       trois actions — indenter, partager, commandes — le ferment, elles,
       parce qu'elles emmènent ailleurs. */
    const btReglages = $("#at-reglages", racine);
    const menu = $("#at-menu", racine);
    function ouvrirMenu(ouvrir) {
      if (!menu || !btReglages) return;
      menu.hidden = !ouvrir;
      btReglages.setAttribute("aria-expanded", ouvrir ? "true" : "false");
    }
    if (btReglages && menu) {
      btReglages.addEventListener("click", () => ouvrirMenu(menu.hidden));
      document.addEventListener("click", (e) => {
        if (menu.hidden) return;
        if (!menu.contains(e.target) && e.target !== btReglages
            && !btReglages.contains(e.target)) ouvrirMenu(false);
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !menu.hidden) { ouvrirMenu(false); btReglages.focus(); }
      });
      for (const id of ["at-indenter", "at-partager", "at-commandes", "at-exemples",
                        "at-notice-btn"]) {
        const b = $("#" + id, racine);
        if (b) b.addEventListener("click", () => ouvrirMenu(false));
      }

      /* La notice des six fautes. Demandé : « retire-moi ce texte de base,
         mets-le ailleurs dans réglages — tu cliques sur un bouton, ça
         t'ouvre une fenêtre sur la même page, tu lis. »

         Elle n'est donc plus un pavé dépliable sous l'éditeur : c'est un
         panneau, posé DANS l'atelier comme la liste des commandes, qu'on
         referme d'un Échap ou de sa croix. Même géométrie, même fond, même
         ombre — un seul objet à comprendre plutôt que deux. Il est déplacé
         ici plutôt que dans le gabarit : sa place dépend du positionnement
         de l'atelier, qui est connu de ce fichier et de lui seul. */
      const btNotice = $("#at-notice-btn", racine);
      const notice = document.getElementById("at-notice");
      if (btNotice && notice) {
        if (notice.parentElement !== racine) racine.appendChild(notice);
        const montrerNotice = (oui) => {
          notice.hidden = !oui;
          btNotice.setAttribute("aria-expanded", oui ? "true" : "false");
          if (oui) {
            const croix = notice.querySelector("[data-fermer-notice]");
            if (croix) croix.focus();
          } else btNotice.focus();
        };
        btNotice.addEventListener("click", () => montrerNotice(notice.hidden));
        const croix = notice.querySelector("[data-fermer-notice]");
        if (croix) croix.addEventListener("click", () => montrerNotice(false));
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && !notice.hidden) {
            e.preventDefault();
            montrerNotice(false);
          }
        });
      }
    }

    /* ── Les pastilles de surlignage ───────────────────────────────────
       Elles agissent sur la sélection — ou sur la ligne du curseur quand il
       n'y a pas de sélection. On ne vole pas le focus avant d'agir : la
       sélection du champ reste lisible même quand le champ n'a plus le
       focus, et c'est elle qui compte. */
    for (const b of racine.querySelectorAll("[data-surligne]")) {
      b.addEventListener("click", () => {
        const c = b.dataset.surligne;
        editeur.surligner(c);
        if (etat) etat.textContent =
          c ? "Surligné en " + c + "." : "Surlignage enlevé.";
      });
    }

    /* ── Les cinq jeux de couleurs ─────────────────────────────────────
       Demandé : « j'aimerais pouvoir changer la couleur du thème de la
       console et du compilateur […] j'en veux plusieurs sélectionnables ».
       Le choix porte sur l'atelier seulement, pas sur le site : on peut
       vouloir lire ses fiches en clair et programmer en sombre.

       Chaque jeu a été mesuré avant d'être proposé — onze teintes de code
       contre leur fond, et les quatre surlignages contre ces teintes. Le
       pire rapport des cinq est 4,73 ; le seuil est 4,5. */
    racine.dataset.ediTheme = "nuit";
    function poserTheme(nom) {
      ediTheme = nom;
      racine.dataset.ediTheme = nom;
      for (const b of racine.querySelectorAll("[data-edi-theme]"))
        b.setAttribute("aria-pressed", b.dataset.ediTheme === nom ? "true" : "false");
    }
    for (const b of racine.querySelectorAll("[data-edi-theme]")) {
      b.addEventListener("click", () => { poserTheme(b.dataset.ediTheme); sauver(); });
    }

    function sauver() {
      try {
        localStorage.setItem(CLE, JSON.stringify({
          source: editeur.valeur, langue, strict, relirePendantLaFrappe,
          quand: Date.now(), part: partVolets,
          theme: ediTheme, surlignages: editeur.surlignages,
        }));
      } catch (e) {}
      modifie = false;
    }

    const DEPART = {
      c: '#include <stdio.h>\n\nint main(void)\n{\n    int notes[5] = {12, 15, 9, 18, 14};\n' +
         '    int somme = 0;\n\n    for (int i = 0; i < 5; i++) {\n' +
         '        printf("Note %d : %d\\n", i + 1, notes[i]);\n        somme += notes[i];\n    }\n\n' +
         '    printf("Moyenne : %.2f\\n", somme / 5.0);\n    return 0;\n}\n',
      "c++": '#include <iostream>\n#include <vector>\n#include <string>\n\n' +
         'int main()\n{\n    std::vector<std::string> eleves = {"Aya", "Karim", "Lina"};\n\n' +
         '    for (const std::string& nom : eleves) {\n' +
         '        std::cout << "Bonjour " << nom << " !" << std::endl;\n    }\n\n    return 0;\n}\n',
      /* Le même exercice qu'en C — parcourir des notes et en faire la
         moyenne — pour qu'on VOIE la différence entre les deux langages
         plutôt que de la lire. C'est le geste de l'épreuve : le même
         problème, deux outils. */
      python: 'notes = [12, 15, 9, 18, 14]\nsomme = 0\n\n'
         + 'for i in range(len(notes)):\n'
         + '    print("Note " + str(i + 1) + " : " + str(notes[i]))\n'
         + '    somme = somme + notes[i]\n\n'
         + 'print("Moyenne : " + str(somme / len(notes)))\n',
    };

    /* ── le raccourcisseur, chargé à la DEMANDE ───────────────────────
       « fais quelque chose pour raccourcir le lien peut-être tu fais un
       programme qui compresse les liens » — c'est « lien.js », et son
       dictionnaire de quarante kilooctets de vrai code C. Quarante
       kilooctets, c'est trop pour les imposer à quelqu'un qui vient
       seulement compiler : les deux fichiers ne sont donc téléchargés
       qu'au premier partage, ou à l'ouverture d'un lien compressé.

       Pas de « fetch » : deux balises <script>, qui marchent aussi
       depuis un fichier local — c'est la règle du dépôt, une page doit
       s'ouvrir hors ligne. */
    let promesseLien = null;
    function chargerLien() {
      if (promesseLien) return promesseLien;
      promesseLien = new Promise((fini) => {
        if (typeof LIEN !== "undefined" && typeof LIEN_DICO === "string") {
          fini(LIEN.dictionnaire(LIEN_DICO)); return;
        }
        let reste = 2, rate = false;
        const poser = (src) => {
          const b = document.createElement("script");
          b.src = src;
          b.onload = () => {
            if (--reste === 0) {
              fini(!rate && typeof LIEN !== "undefined" && typeof LIEN_DICO === "string"
                ? LIEN.dictionnaire(LIEN_DICO) : null);
            }
          };
          b.onerror = () => { rate = true; if (--reste === 0) fini(null); };
          document.head.appendChild(b);
        };
        /* L'ordre n'a pas d'importance — les deux fichiers ne se
           connaissent pas — mais le compte, lui, en a : la promesse ne
           se résout qu'une fois les deux arrivés. */
        poser("c/lien.js");
        poser("c/dico-liens.js");
      });
      return promesseLien;
    }

    /* Déclarée ici, au-dessus de tout ce qui la lit : « charger » s'en
       sert pour « #n= », et le tiroir la remplit deux cents lignes plus
       bas. Une promesse non encore assignée vaut undefined, pas une
       erreur de zone morte — à condition de la déclarer en « var ». */
    var promesseExemples = null;
    function lesExemples() {
      if (!promesseExemples)
        promesseExemples = fetch(base + "exemples.json").then((r) => r.json());
      return promesseExemples;
    }

    /* Le pendant de « comprimer ». Déclarée en « function » : elle est donc
       hissée, et « charger » peut l'appeler bien qu'elle soit écrite plus
       bas. */
    async function decomprimer(frag) {
      try {
        let b64 = frag.replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        const oct = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const flux = new Blob([oct]).stream()
                       .pipeThrough(new DecompressionStream("deflate-raw"));
        return await new Response(flux).text();
      } catch (e) { return null; }
    }

    function charger() {
      /* Un lien compressé — « #c= ». Il faut attendre le décompresseur, donc
         on rend la main tout de suite et on remplit l'éditeur quand c'est
         prêt : quelques millisecondes, et surtout on ne charge pas le
         brouillon entre-temps, ce qui ferait clignoter un programme qui n'est
         pas celui qu'on a ouvert. */
      /* « #n= » : le programme n'est pas DANS le lien, il est dans le
         site. Soixante-deux caractères, quel que soit sa longueur.
         L'identifiant est une empreinte du code : il désigne pour
         toujours le même programme, ou plus rien — jamais un autre. */
      const nn = location.hash.match(/[#&]n=([0-9a-f]{4,8})/);
      if (nn) {
        lesExemples().then((ex) => {
          const e = ex.find((x) => x.id === nn[1]);
          if (!e) {
            dirEtat("Ce numéro de programme n'existe pas (ou plus) dans le site", "ko");
            editeur.valeur = DEPART.c; poserLangue("c");
            return;
          }
          editeur.valeur = e.code;
          poserLangue(e.langue === "c++" ? "c++" : "c");
          dirEtat("Programme du site : " + e.titre, "ok");
        }).catch(() => {
          dirEtat("La liste des programmes n'a pas pu être chargée", "ko");
          editeur.valeur = DEPART.c; poserLangue("c");
        });
        return;
      }
      /* Les formats du raccourcisseur : « z » (dictionnaire + deflate)
         et « y » (dictionnaire seul). Ils demandent le dictionnaire,
         donc un aller-retour de chargement — on rend la main et on
         remplit l'éditeur quand c'est prêt, exactement comme pour
         « c ». */
      const zz = location.hash.match(/[#&]([zy])=([^&]+)/);
      if (zz) {
        chargerLien().then(async (dico) => {
          const txt = dico ? await LIEN.relire(zz[1], zz[2], dico) : null;
          if (txt == null) {
            dirEtat("Ce lien n'a pas pu être lu — il est peut-être tronqué", "ko");
            editeur.valeur = DEPART.c; poserLangue("c");
            return;
          }
          editeur.valeur = txt;
          const l = /[#&]l=(c\+\+|c)/.exec(location.hash);
          poserLangue(l ? l[1] : devine(txt));
        });
        return;
      }
      const z = location.hash.match(/[#&]c=([^&]+)/);
      if (z) {
        decomprimer(z[1]).then((txt) => {
          if (txt == null) {
            dirEtat("Ce lien n'a pas pu être lu — il est peut-être tronqué", "ko");
            editeur.valeur = DEPART.c; poserLangue("c");
            return;
          }
          editeur.valeur = txt;
          const l = /[#&]l=(c\+\+|c)/.exec(location.hash);
          poserLangue(l ? l[1] : devine(txt));
        });
        return;
      }
      /* L'adresse prime : c'est elle qui porte un programme ouvert depuis
         une fiche de cours ou partagé par un camarade. */
      const h = location.hash.match(/[#&]p=([^&]+)/);
      if (h) {
        try {
          let b64 = h[1].replace(/-/g, "+").replace(/_/g, "/");
          while (b64.length % 4) b64 += "=";
          const bin = atob(b64);
          const oct = Uint8Array.from(bin, (c) => c.charCodeAt(0));
          editeur.valeur = new TextDecoder().decode(oct);
          const l = /[#&]l=(c\+\+|c)/.exec(location.hash);
          poserLangue(l ? l[1] : devine(editeur.valeur));
          return;
        } catch (e) {}
      }
      try {
        const s = JSON.parse(localStorage.getItem(CLE) || "null");
        if (s && s.source) {
          editeur.valeur = s.source;
          strict = s.strict !== false;
          relirePendantLaFrappe = s.relirePendantLaFrappe !== false;
          if (bRelecture)
            bRelecture.setAttribute("aria-pressed", String(relirePendantLaFrappe));
          bStrict.setAttribute("aria-pressed", String(strict));
          /* Signalé : du code Python revenait sous le bouton « C », et le
             compilateur répondait « expected ';' ». Le langage ÉTAIT bien
             enregistré ; cette ligne, écrite avant que Python n'existe,
             n'en connaissait que deux et renvoyait tout le reste sur C.
             La liste est maintenant celle des boutons. */
          poserLangue(["c", "c++", "python"].indexOf(s.langue) >= 0 ? s.langue : "c");
          /* Le jeu de couleurs et les surlignages reviennent avec le
             programme : un marqueur qu'on perd en fermant l'onglet ne sert
             à rien pour réviser. Les deux sont relus avec méfiance — une
             valeur inconnue retombe sur « nuit », et une marque mal formée
             est jetée par le filtre de l'accesseur. */
          poserTheme(["nuit", "ardoise", "encre", "contraste", "papier"]
                     .indexOf(s.theme) >= 0 ? s.theme : "nuit");
          editeur.surlignages = s.surlignages || [];
          return;
        }
      } catch (e) {}
      editeur.valeur = DEPART.c;
      poserLangue("c");
    }
    const devine = (s) =>
      /^\s*(?:def |import |from |print\()/m.test(s) && !/[;{}]\s*$/m.test(s) ? "python"
      : /#include\s*<(iostream|vector|string|fstream|algorithm|map)>|std::|using namespace std/
        .test(s) ? "c++" : "c";

    /* ── exemples ───────────────────────────────────────────────────── */
    const listeEx = $("#at-liste-exemples");
    /* La promesse est GARDÉE : le tiroir s'en sert pour dessiner la liste,
       le partage pour reconnaître un programme du site, et l'ouverture
       d'un lien « #n= » pour le retrouver. Trois usages, un seul
       téléchargement. */
    lesExemples().then((ex) => {
      let groupes = {};
      /* ── Les TP deviennent des DOSSIERS ──────────────────────────────
         Demandé : nommer les groupes « TP 1 », « TP 2 », et les ouvrir
         comme un dossier d'applications sur téléphone — un clic, et une
         bulle montre ce qu'il contient : Ex 1, Ex 2, et ainsi de suite.

         Quinze corrigés à la file, c'est une liste qu'on parcourt des yeux
         sans la lire. Regroupés par TP, ce sont deux objets au lieu de quinze
         — et c'est la seule question qu'on se pose vraiment en ouvrant ce
         tiroir : « celui de quel TP ? ».

         La reconnaissance se fait sur le TITRE, pas sur le nom du groupe :
         « TP 2 · Note sur 20 ». Aucune liste de groupes à tenir à jour, et un
         TP 4 ajouté demain fabrique son dossier tout seul. Un groupe dont
         aucun titre ne porte ce préfixe reste une liste à plat : on ne range
         pas en dossiers ce qui n'a pas de familles. */
      const PREFIXE_TP = /^(TP\s*\d+)\s*[·:-]\s*(.+)$/;

      function enFamilles(items) {
        const fam = new Map();
        const seuls = [];
        items.forEach((e, i) => {
          const m = PREFIXE_TP.exec(e.titre || "");
          if (!m) { seuls.push({ e: e, i: i }); return; }
          const cle = m[1].replace(/\s+/g, " ");
          if (!fam.has(cle)) fam.set(cle, []);
          fam.get(cle).push({ e: e, i: i, court: m[2] });
        });
        return { fam: fam, seuls: seuls };
      }

      const carte = (g, o, titre) =>
        '<button type="button" class="at-ex" data-g="' + ech(g) + '" data-i="' + o.i + '">' +
        "<b>" + ech(titre) + "</b><span>" + ech(o.e.quoi || "") + "</span></button>";

      /* Demandé : « quand je clique sur C ça doit me mettre les TP en C,
         et pareil quand je clique sur Python ». Le tiroir montrait TOUT, quel
         que soit le bouton : des corrigés en C proposés sous Python, qui ne
         peuvent pas s'exécuter là où on les ouvre. On ne garde donc que ce qui
         tourne dans le langage choisi, et on redessine à chaque changement.

         Le vide est dit, pas masqué : un tiroir qui s'ouvre sur rien sans un
         mot laisse croire à une panne. */
      function dessinerExemples(l) {
        groupes = {};
        ex.forEach((e) => {
          if ((e.langue || "c") !== l) return;
          (groupes[e.groupe] = groupes[e.groupe] || []).push(e);
        });
        if (!Object.keys(groupes).length) {
          listeEx.innerHTML = '<p class="at-ex-vide">Aucun TP ni exemple en <b>' +
            ech(NOM_LANGUE[l] || l) + "</b> pour l'instant. Les corrigés de C et " +
            "de C++ sont sur leur propre bouton.</p>";
          return;
        }
        listeEx.innerHTML = Object.keys(groupes).map((g) => {
          const { fam, seuls } = enFamilles(groupes[g]);
          let corps = seuls.map((o) => carte(g, o, o.e.titre)).join("");
          if (fam.size) {
            corps += '<div class="at-dossiers">' + [...fam.keys()].map((cle) => {
              const liste = fam.get(cle);
              /* Les vignettes du dossier : une par exercice, neuf au plus —
                 au-delà, une grille 3×3 ne montre plus rien et c'est le compte
                 écrit dessous qui renseigne. C'est exactement ce que fait un
                 téléphone, et pour la même raison. */
              const vignettes = liste.slice(0, 9)
                .map(() => '<span class="at-vignette"></span>').join("");
              /* Le compte annoncé est celui du SUJET : le programme de contrôle
                 n'est pas un exercice de plus, il les refait tous. Annoncer huit
                 pour un TP qui en a sept, c'est la même erreur que le numéro. */
              const nbExos = liste.filter((o) => !o.e.hors).length;
              return '<button type="button" class="at-dossier" data-g="' + ech(g) +
                     '" data-tp="' + ech(cle) + '">' +
                     '<span class="at-dossier-grille">' + vignettes + "</span>" +
                     "<b>" + ech(cle) + "</b><span>" + nbExos +
                     (nbExos > 1 ? " exercices" : " exercice") + "</span></button>";
            }).join("") + "</div>";
          }
          return '<div class="at-ex-groupe"><h4>' + ech(g) + "</h4>" + corps + "</div>";
        }).join("");
      }
      dessinerExemples(langue);
      redessinerExemples = dessinerExemples;

      /* La « bulle carrée » : un seul panneau, rempli à la demande. En
         fabriquer un par dossier aurait mis quinze boutons cachés dans la
         page, tous atteignables au clavier alors qu'aucun n'est visible. */
      const sac = document.createElement("div");
      sac.className = "at-sac";
      sac.hidden = true;
      sac.setAttribute("role", "dialog");
      sac.setAttribute("aria-modal", "false");
      listeEx.parentNode.appendChild(sac);
      let rendeur = null;

      /* Combien de programmes « hors sujet » avant le rang k : c'est ce qu'il
         faut retrancher pour que les exercices gardent leur numéro du sujet. */
      function horsAvant(liste, k) {
        let n = 0;
        for (let q = 0; q < k; q++) if (liste[q].e.hors) n++;
        return n;
      }

      function ouvrirDossier(g, cle, bouton) {
        const liste = enFamilles(groupes[g]).fam.get(cle) || [];
        sac.innerHTML =
          '<div class="at-sac-tete"><h5>' + ech(cle) + "</h5>" +
          '<button type="button" class="at-sac-fermer" aria-label="Fermer le dossier">✕</button></div>' +
          '<div class="at-sac-grille">' + liste.map((o, k) =>
            '<button type="button" class="at-ex at-ex-sac' +
            (o.e.hors ? " at-ex-sac-tous" : "") + '" data-g="' + ech(g) +
            /* Signalé : « quand je vois 8, j'ai l'impression que c'est l'exo 8 ».
               Le programme de contrôle refait TOUS les exercices du TP ; il n'en
               est pas un de plus. Il porte donc « tous » au lieu d'un rang, et il
               ne consomme pas de numéro : le septième exercice reste le 7. */
            '" data-i="' + o.i + '">' +
            (o.e.hors ? '<i class="at-ex-tous">tous</i>'
                      : "<i>" + (k + 1 - horsAvant(liste, k)) + "</i>") +
            "<b>" + ech(o.court) + "</b><span>" + ech(o.e.quoi || "") +
            "</span></button>").join("") + "</div>";
        sac.hidden = false;
        rendeur = bouton;
        const premier = sac.querySelector(".at-ex");
        premier && premier.focus();
      }
      function fermerDossier() {
        if (sac.hidden) return;
        sac.hidden = true;
        rendeur && rendeur.focus();
        rendeur = null;
      }
      listeEx.addEventListener("click", (e) => {
        const d = e.target.closest(".at-dossier");
        if (d) ouvrirDossier(d.dataset.g, d.dataset.tp, d);
      });
      sac.addEventListener("click", (e) => {
        if (e.target.closest(".at-sac-fermer")) fermerDossier();
      });
      /* Échap referme le dossier AVANT le tiroir : c'est l'ordre dans lequel
         on les a ouverts, et c'est celui qu'on attend en appuyant. */
      sac.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.stopPropagation(); fermerDossier(); }
      });
      /* Charger un exemple dans l'éditeur. C'était une fonction anonyme
         accrochée à la seule liste — et la bulle carrée est posée À CÔTÉ de
         cette liste, pas dedans. Signalé : la bulle affichait bien les
         exercices, mais aucun n'était cliquable. Les boutons étaient bien
         là, visibles et focalisables ; aucun écouteur ne les entendait. Le
         geste est donc nommé une fois et branché aux DEUX endroits. */
      function charger(b) {
        const x = groupes[b.dataset.g][+b.dataset.i];
        if (!x) return;
        fermerDossier();
        editeur.valeur = x.code;
        poserLangue(x.langue || devine(x.code));
        if (x.entree) { entreeCumul = ""; champEntree.value = ""; }
        fermerTiroir();
        sauver();
        console2.vider();
        diags.innerHTML = "";
        $("#at-diag-tete").hidden = true;
        if (x.source) console2.note("Programme tiré de : " + x.source, "info");
        editeur.focus();
      }
      const auClic = (e) => {
        const b = e.target.closest(".at-ex");
        if (b) charger(b);
      };
      listeEx.addEventListener("click", auClic);
      sac.addEventListener("click", auClic);
    }).catch(() => { listeEx.innerHTML = "<p class=\"at-vide\">Exemples indisponibles.</p>"; });

    const tiroir = $("#at-tiroir");
    const bExemples = $("#at-exemples");
    function ouvrirTiroir() { tiroir.hidden = false; bExemples.setAttribute("aria-expanded", "true");
                              $(".at-ex", tiroir) && $(".at-ex", tiroir).focus(); }
    function fermerTiroir() { tiroir.hidden = true; bExemples.setAttribute("aria-expanded", "false"); }
    bExemples.addEventListener("click", () => (tiroir.hidden ? ouvrirTiroir() : fermerTiroir()));
    $("#at-fermer-tiroir").addEventListener("click", () => { fermerTiroir(); bExemples.focus(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !tiroir.hidden) { fermerTiroir(); bExemples.focus(); }
    });

    /* ── partager ───────────────────────────────────────────────────── */
    /* Signalé : le partage rend bien service, mais le lien est si long
       que certains sites le refusent.

       Il a raison, et le chiffre le dit : un programme de cent lignes faisait
       une adresse de plus de deux mille caractères. Discord coupe à 2 000,
       beaucoup de forums à 255, et un QR code devient illisible bien avant.

       Le lien ne peut pas RÉTRÉCIR en perdant du texte — il n'y a pas de
       serveur derrière, tout le programme voyage dans l'adresse, et c'est
       exactement ce qui fait que ça marche hors ligne et pour toujours. On ne
       raccourcit donc pas le contenu : on le COMPRESSE. « deflate-raw », qui
       est dans le navigateur depuis Chrome 80, Safari 16.4 et Firefox 113,
       divise par trois à cinq un texte source — qui est très répétitif.

       Deux précautions :
         · les anciens liens « #p= » continuent de s'ouvrir. Un lien partagé
           il y a un mois dans une conversation doit encore marcher dans un
           an ; casser ça pour gagner des caractères serait un mauvais
           échange ;
         · si le navigateur ne sait pas compresser, on retombe sur « #p= »
           sans rien dire. Le lien est long, mais il existe. */
    async function comprimer(texte) {
      if (typeof CompressionStream !== "function") return null;
      try {
        const flux = new Blob([texte]).stream()
                       .pipeThrough(new CompressionStream("deflate-raw"));
        const oct = new Uint8Array(await new Response(flux).arrayBuffer());
        let bin = "";
        oct.forEach((o) => { bin += String.fromCharCode(o); });
        return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      } catch (e) { return null; }
    }

    function en64(texte) {
      const oct = new TextEncoder().encode(texte);
      let bin = "";
      oct.forEach((o) => { bin += String.fromCharCode(o); });
      return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_");
    }

    /* L'adresse courte. « outils/langage-c.html » coûte vingt-huit
       caractères dans CHAQUE lien partagé ; « c.html » posé à la racine du
       site n'en coûte que six et renvoie ici en gardant le fragment.
       Quatorze caractères gagnés pour un fichier de vingt lignes, écrit
       par publier.py — qui est donc le seul endroit où cette page existe.
       Si le site est consulté depuis une copie partielle qui n'aurait pas
       la racine, on garde l'adresse longue. */
    function basesPossibles() {
      const longue = location.origin + location.pathname;
      const racine = location.pathname.replace(/outils\/[^/]*$/, "");
      const courte = racine !== location.pathname
        ? location.origin + racine + "c.html" : null;
      return { longue, courte };
    }

    $("#at-partager").addEventListener("click", async () => {
      const texte = editeur.valeur;
      dirEtat("Compression du lien…", "");
      /* Avant toute compression : est-ce un programme QUE LE SITE A DÉJÀ ?
         Si oui, il n'y a rien à transmettre — son numéro suffit, et
         aucune compression ne battra jamais cinq caractères. On compare
         le texte au caractère près : un espace de différence, et c'est un
         autre programme, qu'il faut donc envoyer en entier. */
      try {
        const ex = await lesExemples();
        const meme = ex.find((x) => x.code === texte);
        if (meme) {
          const url = (basesPossibles().courte || basesPossibles().longue) + "#n=" + meme.id;
          try { await navigator.clipboard.writeText(url); dirEtat("Lien copié", "ok"); }
          catch (e) {
            location.hash = "n=" + meme.id;
            dirEtat("Lien dans la barre d'adresse", "ok");
          }
          return;
        }
      } catch (e) { /* liste indisponible : on compresse, comme avant */ }
      const dico = await chargerLien();
      let frag = null;
      /* Les deux anciens formats restent calculés : ils servent de REPLI
         si le raccourcisseur ne se charge pas ou si aucun de ses formats
         ne se relit à l'identique. */
      const brutAvant = en64(texte);
      const deflAvant = await comprimer(texte);
      if (dico && typeof LIEN !== "undefined") {
        const r = await LIEN.fabriquer(texte, dico);
        if (r) frag = r.cle + "=" + r.charge + "&l=" + langue;
      }
      if (!frag) {
        /* Le raccourcisseur n'a pas pu se charger, ou aucun de ses
           formats n'a tenu l'aller-retour : on retombe sur l'ancien
           comportement sans rien casser. Un lien long existe ; un lien
           faux, non. */
        frag = (deflAvant && deflAvant.length < brutAvant.length)
          ? "c=" + deflAvant + "&l=" + langue
          : "p=" + brutAvant + "&l=" + langue;
      }
      const bases = basesPossibles();
      const url = (bases.courte || bases.longue) + "#" + frag;
      /* Jugé inutile, et à raison : le message annonçait le nombre de
         caractères, le pourcentage gagné et la vérification de
         l'aller-retour. C'étaient les chiffres de la construction, pas
         ceux de l'usage — ce qu'on veut savoir, c'est que le lien est
         prêt, et où il est. Tout le reste est mesuré par le banc, qui
         est l'endroit des chiffres. La vérification, elle, a toujours
         lieu : on la fait, on ne s'en vante plus. */
      try {
        await navigator.clipboard.writeText(url);
        dirEtat("Lien copié", "ok");
      } catch (e) {
        /* Le presse-papier est refusé dans certains contextes (page
           locale, permission non accordée). Le lien existe quand même :
           il est posé dans la barre d'adresse — et ça, il faut le dire,
           parce que le geste à faire n'est plus le même. */
        location.hash = frag;
        dirEtat("Lien dans la barre d'adresse", "ok");
      }
    });

    /* ── le séparateur des deux volets ───────────────────────────────
       Demandé : pouvoir élargir la fenêtre de programme.c vers la
       droite, ce qui prend d'autant sur celle de la console.

       Une seule variable CSS pilote les deux colonnes : ce qu'on donne à
       l'une est pris à l'autre, par construction. Impossible d'arriver à
       un état où les deux largeurs ne font pas le compte.

       Bornes à 20 % et 80 % : au-delà, le cadre perdant devient une
       bande inutilisable, et rien ne dirait comment en sortir. La règle
       vaut aussi pour les poignées de redimensionnement.

       Et le geste marche au CLAVIER — flèches gauche et droite, Début
       pour revenir au milieu. Un réglage qui n'existe qu'à la souris
       n'existe pas pour tout le monde. */
    const separateur = $("#at-separateur");
    const grille = $(".at-grille", racine);
    function poserPart(p, garder) {
      partVolets = Math.max(0.2, Math.min(0.8, p));
      grille.style.setProperty("--at-part", (partVolets / (1 - partVolets)).toFixed(4) + "fr");
      if (separateur)
        separateur.setAttribute("aria-valuenow", String(Math.round(partVolets * 100)));
      if (garder) sauver();
    }
    try {
      const vieux = JSON.parse(localStorage.getItem(CLE) || "null");
      if (vieux && typeof vieux.part === "number") poserPart(vieux.part, false);
    } catch (e) {}
    if (separateur) {
      let tire = false;
      const depuisX = (x) => {
        const r = grille.getBoundingClientRect();
        if (!r.width) return;
        poserPart((x - r.left) / r.width, false);
      };
      separateur.addEventListener("pointerdown", (e) => {
        /* setPointerCapture : le pointeur peut sortir du séparateur — il
           le fait forcément, puisqu'on l'éloigne — et les événements
           continuent d'arriver ici. Sans lui, le glissement s'arrête dès
           qu'on dépasse les 34 px de la colonne. */
        tire = true;
        separateur.setPointerCapture(e.pointerId);
        separateur.dataset.tire = "1";
        document.body.classList.add("at-tire");
        e.preventDefault();
      });
      separateur.addEventListener("pointermove", (e) => { if (tire) depuisX(e.clientX); });
      const lacher = (e) => {
        if (!tire) return;
        tire = false;
        try { separateur.releasePointerCapture(e.pointerId); } catch (err) {}
        separateur.removeAttribute("data-tire");
        document.body.classList.remove("at-tire");
        sauver();
      };
      separateur.addEventListener("pointerup", lacher);
      separateur.addEventListener("pointercancel", lacher);
      separateur.addEventListener("dblclick", () => poserPart(0.5, true));
      separateur.addEventListener("keydown", (e) => {
        const pas = e.shiftKey ? 0.1 : 0.02;
        if (e.key === "ArrowLeft") { e.preventDefault(); poserPart(partVolets - pas, true); }
        else if (e.key === "ArrowRight") { e.preventDefault(); poserPart(partVolets + pas, true); }
        else if (e.key === "Home" || e.key === "End") { e.preventDefault(); poserPart(0.5, true); }
      });
    }

    const voirCommandes = $("#at-voir-commandes");
    if (voirCommandes) voirCommandes.addEventListener("click", () => {
      const b = $("#at-commandes");
      if (b) b.click();
    });

    /* ── plein écran ────────────────────────────────────────────────── */
    const bPlein = $("#at-plein");
    function plein(oui) {
      racine.classList.toggle("at-grand", oui);
      document.body.classList.toggle("at-fige", oui);
      bPlein.setAttribute("aria-pressed", String(oui));
      $(".at-lib-plein", bPlein).textContent = oui ? "Réduire" : "Agrandir";
      if (oui) editeur.focus();
    }
    bPlein.addEventListener("click", () => plein(!racine.classList.contains("at-grand")));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && racine.classList.contains("at-grand") && tiroir.hidden) {
        plein(false); bPlein.focus();
      }
    });

    /* ── la liste des commandes ─────────────────────────────────────────
       Signalé : Alt+Z fonctionne, mais sur Mac la touche est
       introuvable — d'où la demande d'une commande qui montre les
       commandes.

       Le raccourci existait, la touche marchait — ce qui manquait, c'est de
       pouvoir le RETROUVER. Un raccourci qu'on ne peut pas redécouvrir
       n'existe que pour qui l'a appris le jour où on le lui a montré, et sur
       Mac « Alt » s'appelle « Option » et s'écrit ⌥, ce qui suffit à ne plus
       le reconnaître dans une note écrite pour un PC.

       Trois façons d'ouvrir la liste, parce qu'on ne sait pas laquelle le
       lecteur connaît : le bouton de la barre, F1, et ⇧⌘P — celui de VS Code.
       Et les touches s'écrivent AVEC LES SYMBOLES DE LA MACHINE : ⌥⇧A sur un
       Mac, Alt+Maj+A sur un PC. La même liste, dans la langue du clavier
       qu'on a sous les doigts. */
    const COMMANDES = [
      ["Exécuter le programme",              [CMD, "⏎"]],
      ["Enregistrer le brouillon",           [CMD, "S"]],
      ["Partager — copier le lien",          []],
      ["Plein écran / réduire",              []],
      ["Fermer un panneau, sortir du plein écran", ["Échap"]],

      ["Poser un alinéa",                    ["Tab"]],
      ["Retirer un alinéa",                  ["⇧", "Tab"]],
      ["Retirer un alinéa entier (en début de ligne)", ["⌫"]],
      ["Aller au premier caractère, puis à la marge", ["Début"]],

      ["Commenter / décommenter la ligne",   [CMD, "/"]],
      ["Commentaire de bloc /* … */",        [ALT, "⇧", "A"]],
      ["Déplacer la ligne vers le haut",     [ALT, "↑"]],
      ["Déplacer la ligne vers le bas",      [ALT, "↓"]],
      ["Dupliquer la ligne vers le haut",    [ALT, "⇧", "↑"]],
      ["Dupliquer la ligne vers le bas",     [ALT, "⇧", "↓"]],
      ["Supprimer la ligne entière",         [CMD, "⇧", "K"]],
      ["Ouvrir une ligne en dessous",        [ALT, "⏎"]],
      ["Ouvrir une ligne au-dessus",         [ALT, "⇧", "⏎"]],

      ["Sélectionner l'occurrence suivante du mot", [CMD, "D"]],
      ["Sélectionner toutes les occurrences", [CMD, "⇧", "L"]],
      ["Remettre l'alinéa de tout le programme", [ALT, "⇧", "F"]],
      ["Renommer partout",                   ["F2"]],
      ["Coller dans toutes les sélections (le texte entier dans chacune)", [CMD, "V"]],
      ["Copier ou couper toutes les sélections (une par ligne)", [CMD, "C"]],
      ["Abandonner les curseurs multiples",  ["Échap"]],

      ["Retour à la ligne visuel",           [ALT, "Z"]],
      ["Sélectionner la ligne (clic sur son numéro)", []],
      ["Élargir l'éditeur sur la console (tirer le séparateur)", ["←", "→"]],

      /* Ce que l'éditeur fait TOUT SEUL. Ces quatre-là n'ont pas de
         raccourci : ce sont des comportements, pas des commandes. Ils
         étaient écrits dans un pavé de six lignes sous les deux cadres —
         et ce pavé était jugé laid, à raison. Il est retiré, mais rien
         n'est perdu : tout ce qu'il disait est ici, dans la liste qu'on
         ouvre d'une touche. */
      ["Cliquer un mot encadre ses jumeaux", []],
      ["Se poser contre une accolade montre celle qui ferme — en rouge si rien ne la ferme", []],
      ["Sélectionner autre chose, un « ; » par exemple, allume toutes ses occurrences", []],
      ["Agrandir un cadre en hauteur : tirer son coin inférieur droit", []],
      ["Afficher cette liste",               ["F1"]],
      ["Afficher cette liste (comme VS Code)", [CMD, "⇧", "P"]],
    ];

    const pal = document.createElement("div");
    pal.className = "at-palette";
    pal.hidden = true;
    pal.setAttribute("role", "dialog");
    pal.setAttribute("aria-modal", "false");
    pal.setAttribute("aria-label", "Les commandes de l'atelier");
    pal.innerHTML =
      '<div class="at-palette-tete">' +
        '<h3>Les commandes</h3>' +
        '<button type="button" class="at-creux" data-fermer>Fermer</button>' +
      '</div>' +
      '<input type="search" class="at-palette-filtre" placeholder="Filtrer — « ligne », « alinéa »…" ' +
             'aria-label="Filtrer les commandes">' +
      '<ul class="at-palette-liste"></ul>' +
      '<p class="at-palette-pied"></p>';
    racine.appendChild(pal);

    const palListe  = $(".at-palette-liste", pal);
    const palFiltre = $(".at-palette-filtre", pal);
    $(".at-palette-pied", pal).textContent = MAC
      ? "⌘ Commande · ⌥ Option · ⇧ Majuscule · ⌫ Retour arrière"
      : "Ctrl · Alt · Maj · ⌫ Retour arrière";

    function dessinerPalette(q) {
      const mots = (q || "").trim().toLowerCase();
      palListe.innerHTML = "";
      let n = 0;
      COMMANDES.forEach(([quoi, touches]) => {
        if (mots && !quoi.toLowerCase().includes(mots) &&
            !touches.join(" ").toLowerCase().includes(mots)) return;
        n++;
        const li = document.createElement("li");
        const nom = document.createElement("span");
        nom.textContent = quoi;
        li.appendChild(nom);
        const boite = document.createElement("span");
        boite.className = "at-palette-touches";
        if (touches.length === 0) {
          const k = document.createElement("em");
          k.textContent = "bouton de la barre";
          boite.appendChild(k);
        } else {
          touches.forEach((t) => {
            const k = document.createElement("kbd");
            k.textContent = t;
            boite.appendChild(k);
          });
        }
        li.appendChild(boite);
        palListe.appendChild(li);
      });
      if (!n) {
        const li = document.createElement("li");
        li.className = "at-palette-rien";
        li.textContent = "Aucune commande ne porte ce mot.";
        palListe.appendChild(li);
      }
    }

    let rendreFocus = null;
    function ouvrirPalette() {
      rendreFocus = document.activeElement;
      palFiltre.value = "";
      dessinerPalette("");
      pal.hidden = false;
      bCommandes.setAttribute("aria-expanded", "true");
      palFiltre.focus();
    }
    function fermerPalette() {
      if (pal.hidden) return;
      pal.hidden = true;
      bCommandes.setAttribute("aria-expanded", "false");
      if (rendreFocus && rendreFocus.focus) rendreFocus.focus();
    }
    palFiltre.addEventListener("input", () => dessinerPalette(palFiltre.value));
    $("[data-fermer]", pal).addEventListener("click", fermerPalette);

    const bCommandes = $("#at-commandes");
    bCommandes.addEventListener("click", () => (pal.hidden ? ouvrirPalette() : fermerPalette()));

    /* ── raccourcis ─────────────────────────────────────────────────── */
    document.addEventListener("keydown", (e) => {
      const meta = MAC ? e.metaKey : e.ctrlKey;
      /* F1 et ⇧⌘P ouvrent la liste. Elles sont volontairement captées sur le
         DOCUMENT et non sur l'éditeur : on cherche un raccourci précisément
         quand on ne sait plus où cliquer. */
      if (e.key === "F1" ||
          (meta && e.shiftKey && (e.key === "P" || e.key === "p" || e.code === "KeyP"))) {
        e.preventDefault();
        if (pal.hidden) ouvrirPalette(); else fermerPalette();
        return;
      }
      if (e.key === "Escape" && !pal.hidden) { e.preventDefault(); fermerPalette(); return; }
      if (meta && e.key === "Enter") { e.preventDefault(); budget = 5000; executer(); }
      else if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); sauver();
                                                      dirEtat("Programme enregistré", "ok"); }
    });
    const bIndent = $("#at-indenter");
    if (bIndent) bIndent.addEventListener("click", () => {
      const r = editeur.realigner();
      dirEtat(!r.ok
        ? "Alinéa : rien n'a été changé, le contrôle de sûreté n'est pas passé"
        : (r.change ? "Alinéa refait" : "L'alinéa était déjà en place"),
        r.ok ? "ok" : "avert");
      editeur.focus();
    });
    bEx.addEventListener("click", () => { budget = 5000; executer(); });
    $$("[data-raccourci]").forEach((e) => { e.textContent = e.dataset.raccourci.replace("CMD", CMD); });

    charger();

    /* Le point d'entrée du banc de rendu, posé APRÈS « charger() » : il
       repose le programme tel qu'il l'a trouvé, encore faut-il que ce
       soit le bon. */
    window.ATELIER = { diagnostic: () => editeur.diagnostic() };

    if (differe) {
      bEx.disabled = false;
      dirEtat(enCadre ? "Compilateur en attente — appuyez sur Exécuter"
                      : "Économie de données : le compilateur (60 Mo) se charge "
                        + "au premier Exécuter", "avert");
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
})();
