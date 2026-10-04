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
  const CMD = MAC ? "⌘" : "Ctrl";
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
  const C_TYP = MOTS("int", "float", "double", "char", "void", "long", "short",
    "unsigned", "signed", "bool", "FILE", "size_t", "ssize_t", "time_t", "NULL");
  const CPP_TYP = MOTS("std", "string", "vector", "map", "set", "pair", "cout", "cin",
    "cerr", "endl", "ostream", "istream", "ifstream", "ofstream", "fstream",
    "unique_ptr", "shared_ptr", "array", "list", "queue", "stack", "deque");
  const CHAINE = '"(?:\\\\.|[^"\\\\\\n])*"' + "|'(?:\\\\.|[^'\\\\\\n])*'";
  const NOMBRE = "\\b0[xX][0-9A-Fa-f]+\\b|\\b\\d+(?:[.,]\\d+)?\\b";
  const APPEL = "\\b[A-Za-z_]\\w*(?=\\s*\\()";

  function scanneur(cpp) {
    const regles = [
      ["com", "/\\*[\\s\\S]*?\\*/|//[^\\n]*"],
      ["pre", "(?:^|(?<=\\n))[ \\t]*#[A-Za-z_]+"],
      ["txt", CHAINE],
      ["mc", cpp ? C_MC + "|" + CPP_MC : C_MC],
      ["typ", cpp ? C_TYP + "|" + CPP_TYP : C_TYP],
      ["fn", APPEL],
      ["num", NOMBRE],
    ];
    return new RegExp(regles.map(([c, r]) => "(?<" + c + ">" + r + ")").join("|"), "gm");
  }
  const SCAN = { c: scanneur(false), "c++": scanneur(true) };

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
    let langue = "c";
    let marques = [];

    function redessiner() {
      const t = saisie.value;
      peint.innerHTML = peindre(t, langue) + "\n";
      /* Après la coloration, jamais avant : surligner d'abord reviendrait à
         faire colorer des balises qu'on vient d'insérer. */
      if (typeof motCourant === "string" && motCourant) surligner(motCourant);
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
      }
      surChangement && surChangement(t);
    }

    /* ── Les gestes de VS Code, repris à la main ──────────────────────
       JustAkhiraa : « récupère le projet VSCodium et adapte », et plus tôt :
       « j'aime bien Ctrl+D pour copier les mots qui se ressemblent, ou
       Alt+Z, ou encore quand tu cliques sur un mot et ça te surligne les
       mêmes mots ».

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

    /* Ctrl/Cmd+D — d'abord le mot sous le curseur, puis l'occurrence
       suivante, en bouclant. Rien n'est modifié : on sélectionne. */
    function occurrenceSuivante() {
      const t = saisie.value;
      let cible = t.slice(saisie.selectionStart, saisie.selectionEnd);
      if (!cible || !/^[A-Za-z_]\w*$/.test(cible)) {
        const m = motAutour(t, saisie.selectionStart);
        if (!m) return false;
        saisie.setSelectionRange(m.index, m.index + m[0].length);
        return true;
      }
      const re = new RegExp("\\b" + cible.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
      re.lastIndex = saisie.selectionEnd;
      let m = re.exec(t);
      if (!m) { re.lastIndex = 0; m = re.exec(t); }   // on boucle au début
      if (!m) return false;
      saisie.setSelectionRange(m.index, m.index + m[0].length);
      /* Sans ce recentrage, la sélection suivante peut tomber hors du cadre
         et l'on croit que rien ne s'est passé. */
      const avant = t.slice(0, m.index).split("\n").length - 1;
      const hLigne = saisie.scrollHeight / Math.max(1, t.split("\n").length);
      const y = avant * hLigne;
      if (y < saisie.scrollTop || y > saisie.scrollTop + saisie.clientHeight - hLigne * 2)
        saisie.scrollTop = Math.max(0, y - saisie.clientHeight / 2);
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
      return on;
    }

    /* Le surlignage des occurrences. On ne touche pas au HTML peint avec une
       expression régulière — ce serait colorer des balises. On marche sur les
       NŒUDS DE TEXTE du rendu et on découpe ceux qui portent le mot : le texte
       n'est pas modifié d'un caractère, il est seulement enveloppé. */
    function surligner(mot) {
      if (!mot || mot.length < 2) return;
      const re = new RegExp("\\b" + mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
      const marcheur = document.createTreeWalker(peint, NodeFilter.SHOW_TEXT);
      const noeuds = [];
      let nd;
      while ((nd = marcheur.nextNode())) if (re.test(nd.nodeValue)) { re.lastIndex = 0; noeuds.push(nd); }
      for (const noeud of noeuds) {
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
          marque.className = "edi-occ";
          milieu.parentNode.insertBefore(marque, milieu);
          marque.appendChild(milieu);
        }
      }
    }

    let motCourant = "";
    function majOccurrences() {
      const t = saisie.value;
      const sel = t.slice(saisie.selectionStart, saisie.selectionEnd);
      let mot = "";
      if (sel && /^[A-Za-z_]\w*$/.test(sel)) mot = sel;
      else if (saisie.selectionStart === saisie.selectionEnd) {
        const m = motAutour(t, saisie.selectionStart);
        if (m) mot = m[0];
      }
      if (mot === motCourant) return;
      motCourant = mot;
      redessiner();
    }

    saisie.addEventListener("input", redessiner);
    saisie.addEventListener("keyup", majOccurrences);
    saisie.addEventListener("click", majOccurrences);
    saisie.addEventListener("blur", () => { motCourant = ""; redessiner(); });
    saisie.addEventListener("scroll", () => {
      peint.style.transform = "translate(" + -saisie.scrollLeft + "px," + -saisie.scrollTop + "px)";
      marge.scrollTop = saisie.scrollTop;
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

      if (e.key === "Escape") { echappe = true; return; }

      /* Ctrl+D sur PC, Cmd+D sur Mac — c'est la touche que chacun a dans les
         doigts, et elle ouvre un marque-page dans les deux navigateurs si on
         ne l'arrête pas. « preventDefault » n'est pas une précaution ici,
         c'est la condition pour que le geste existe. */
      if ((e.ctrlKey || e.metaKey) && !e.altKey &&
          (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        if (occurrenceSuivante()) majOccurrences();
        return;
      }
      /* Alt+Z : le retour à la ligne visuel, comme dans VS Code. */
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "z" || e.key === "Z" ||
          e.code === "KeyZ")) {
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

      if (e.key === "Tab") {
        if (echappe) { echappe = false; return; }
        e.preventDefault();
        if (d !== f || e.shiftKey) {
          const dl = t.lastIndexOf("\n", d - 1) + 1;
          const lignes = t.slice(dl, f).split("\n");
          const neuf = lignes.map((l) => e.shiftKey ? l.replace(/^ {1,4}/, "") : "    " + l).join("\n");
          remplacer(dl, f, neuf, dl, dl + neuf.length);
        } else remplacer(d, f, "    ", d + 4, d + 4);
        return;
      }
      echappe = false;

      if (e.key === "Enter") {
        e.preventDefault();
        const dl = t.lastIndexOf("\n", d - 1) + 1;
        const creux = (t.slice(dl, d).match(/^[ \t]*/) || [""])[0];
        const avant = t.slice(0, d).trimEnd().slice(-1);
        const apres = t.slice(f, f + 1);
        if (avant === "{" && apres === "}") {
          const ins = "\n" + creux + "    \n" + creux;
          remplacer(d, f, ins, d + creux.length + 5, d + creux.length + 5);
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
      saisie.setSelectionRange(d, f);
      let ok = false;
      try { ok = document.execCommand("insertText", false, texte); } catch (e) {}
      if (!ok) {
        const t = saisie.value;
        saisie.value = t.slice(0, d) + texte + t.slice(f);
      }
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
         sert à rien. */
      const h = saisie.scrollHeight / Math.max(1, lignes.length);
      saisie.scrollTop = Math.max(0, (ligne - 1) * h - saisie.clientHeight / 2);
      saisie.dispatchEvent(new Event("scroll"));
    }

    return {
      get valeur() { return saisie.value; },
      set valeur(v) { saisie.value = v; redessiner(); },
      get langue() { return langue; },
      set langue(l) { langue = l; redessiner(); },
      set marquesErreur(m) { marques = m; marge.dataset.marques = "-"; redessiner(); },
      aller, focus: () => saisie.focus(), element: saisie,
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
    let pret = false, attentes = [], jeton = 0, enCours = null, lance = false;

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
      if (m.jeton !== undefined && enCours && m.jeton === enCours.jeton) {
        const r = enCours; enCours = null;
        r.resoudre(m);
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
        enCours = { jeton: j, resoudre };
        ouvrier.postMessage({ t: "batir", source, langue, strict, jeton: j });
      });
    }
    return { batir, quandPret, lancer, get pret() { return pret; } };
  }

  /* ══════════════════════════════════════════════════════ 5. L'ATELIER */
  function demarrer() {
    const racine = $("#atelier");
    if (!racine) return;
    const base = racine.dataset.moteur || "c/";

    const editeur = Editeur($(".edi", racine), () => { planifierSauvegarde(); marquerModifie(); });
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

    let langue = "c";
    let strict = true;
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
        setTimeout(() => { if (etat.textContent === "Compilateur prêt") dirEtat("", ""); }, 4000);
      } else if (m.t === "panne") {
        jauge.hidden = true;
        dirEtat("Le compilateur n'a pas pu se charger : " + m.message, "erreur");
      }
    }, differe);

    /* ── exécuter ─────────────────────────────────────────────────── */
    async function executer(relance) {
      if (tourne && !relance) return;
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
    function poserLangue(l) {
      langue = l;
      editeur.langue = l;
      $("#at-nom-fichier").textContent = l === "c++" ? "programme.cpp" : "programme.c";
      choixLangue.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.langue === l)));
      planifierSauvegarde();
    }
    choixLangue.forEach((b) => b.addEventListener("click", () => poserLangue(b.dataset.langue)));

    bStrict.addEventListener("click", () => {
      strict = !strict;
      bStrict.setAttribute("aria-pressed", String(strict));
      planifierSauvegarde();
    });

    let tSauve = null, modifie = false;
    function marquerModifie() { modifie = true; }
    function planifierSauvegarde() {
      clearTimeout(tSauve);
      tSauve = setTimeout(sauver, 600);
    }
    function sauver() {
      try {
        localStorage.setItem(CLE, JSON.stringify({
          source: editeur.valeur, langue, strict, quand: Date.now(),
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
    };

    function charger() {
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
          bStrict.setAttribute("aria-pressed", String(strict));
          poserLangue(s.langue === "c++" ? "c++" : "c");
          return;
        }
      } catch (e) {}
      editeur.valeur = DEPART.c;
      poserLangue("c");
    }
    const devine = (s) => /#include\s*<(iostream|vector|string|fstream|algorithm|map)>|std::|using namespace std/.test(s) ? "c++" : "c";

    /* ── exemples ───────────────────────────────────────────────────── */
    const listeEx = $("#at-liste-exemples");
    fetch(base + "exemples.json").then((r) => r.json()).then((ex) => {
      const groupes = {};
      ex.forEach((e) => { (groupes[e.groupe] = groupes[e.groupe] || []).push(e); });
      listeEx.innerHTML = Object.keys(groupes).map((g) =>
        '<div class="at-ex-groupe"><h4>' + ech(g) + "</h4>" +
        groupes[g].map((e, i) =>
          '<button type="button" class="at-ex" data-g="' + ech(g) + '" data-i="' + i + '">' +
          "<b>" + ech(e.titre) + "</b><span>" + ech(e.quoi || "") + "</span></button>").join("") +
        "</div>").join("");
      listeEx.addEventListener("click", (e) => {
        const b = e.target.closest(".at-ex");
        if (!b) return;
        const x = groupes[b.dataset.g][+b.dataset.i];
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
      });
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
    $("#at-partager").addEventListener("click", async () => {
      const oct = new TextEncoder().encode(editeur.valeur);
      let bin = "";
      oct.forEach((o) => { bin += String.fromCharCode(o); });
      const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_");
      const url = location.origin + location.pathname + "#p=" + b64 + "&l=" + langue;
      try {
        await navigator.clipboard.writeText(url);
        dirEtat("Lien copié — il contient le programme entier", "ok");
      } catch (e) {
        location.hash = "p=" + b64 + "&l=" + langue;
        dirEtat("Lien mis dans la barre d'adresse", "ok");
      }
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

    /* ── raccourcis ─────────────────────────────────────────────────── */
    document.addEventListener("keydown", (e) => {
      const meta = MAC ? e.metaKey : e.ctrlKey;
      if (meta && e.key === "Enter") { e.preventDefault(); budget = 5000; executer(); }
      else if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); sauver();
                                                      dirEtat("Programme enregistré", "ok"); }
    });
    bEx.addEventListener("click", () => { budget = 5000; executer(); });
    $$("[data-raccourci]").forEach((e) => { e.textContent = e.dataset.raccourci.replace("CMD", CMD); });

    charger();

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
