/* ══════════════════════════════════════════════════════════════════════
   PYMINI — un interprète du Python DU COURS, écrit à la main.

   Pourquoi pas le vrai Python. Le porter demanderait MicroPython ou
   Pyodide en WebAssembly : dix à trente mégaoctets, du même ordre que le
   compilateur C de l'atelier. L'atelier C les paie parce qu'un TP de C se
   compile ou ne se compile pas — il n'y a pas de demi-compilateur. Un TP
   de Python de première année, lui, tient dans un sous-ensemble qu'on
   peut écrire : variables, calcul, chaînes, listes, conditions, boucles,
   fonctions. C'est ce qui est fait ici.

   La règle que cela impose : DIRE CE QUI MANQUE. Un programme qui emploie
   une construction absente reçoit une phrase qui la nomme, jamais un
   résultat faux. « import », « from … import » et les générateurs :
   refusés, et nommés.

   Les classes sont entrées le 2 novembre 2026 : sans elles, tout le
   chapitre de programmation objet était refusé — mesuré, 28 programmes
   sur les 126 qui tournent en vrai Python. Avec elles : l'héritage
   (multiple compris, dans l'ordre de Python), super(), @property et son
   setter, @staticmethod, @classmethod, les attributs « privés » renommés
   comme Python les renomme, __str__, __repr__, __eq__ et les autres
   méthodes spéciales du cours, et les exceptions qu'on dérive soi-même.

   Trois parties, comme tout interprète : un lecteur qui découpe le texte
   en jetons (et qui gère l'INDENTATION, ce qui est la particularité de
   Python), un analyseur qui en fait un arbre, un évaluateur qui le
   parcourt.
   ══════════════════════════════════════════════════════════════════════ */
(function (racine) {
  "use strict";

  /* ── 1. Le lecteur ────────────────────────────────────────────────
     L'indentation EST la syntaxe. On tient une pile de colonnes : une
     ligne plus indentée ouvre un bloc, une ligne moins indentée en ferme
     autant qu'il faut. Une indentation qui ne retombe sur aucune colonne
     connue est une faute, et c'est celle que tout débutant fait. */
  const MOTS = new Set(["if", "elif", "else", "while", "for", "in", "def",
    "return", "break", "continue", "and", "or", "not", "True", "False",
    "None", "pass", "import", "from", "class", "try", "except", "finally",
    "with", "lambda", "global", "nonlocal", "yield", "raise", "assert",
    "del", "is", "as"]);

  /* « | & ^ » servent aux ensembles (union, intersection, différence
     symétrique) ; « |= &= ^= -= » à leur version qui affecte. Ils étaient
     absents, si bien qu'un « ports_actifs & ports_autorises » — la
     question 7 du TP 4 de Python — ne se lisait même pas. */
  /* « @ » ouvre un décorateur : « @property » au-dessus d'une méthode. */
  const OPS = ["**=", "//=", "...", "**", "//", "==", "!=", "<=", ">=",
    "+=", "-=", "*=", "/=", "%=", "|=", "&=", "^=", "->",
    "(", ")", "[", "]", "{", "}", ",",
    ":", ".", "+", "-", "*", "/", "%", "<", ">", "=", ";", "|", "&", "^", "@"];

  /* La classe de l'erreur, en plus du message. Elle ne change rien à
     l'affichage — mais elle est ce que « except ValueError » regarde,
     et sans elle le TP 9 (gestion des erreurs) ne peut pas distinguer
     deux pannes. Par défaut : « Exception ». */
  function ErreurPy(message, ligne, classe) {
    this.message = message;
    this.ligne = ligne;
    this.classe = classe || "Exception";
    this.estPy = true;
  }

  /* Les deux marques de la chaîne à trois guillemets, nommées pour ne
     pas avoir à les écrire dans une chaîne qui les contient. */
  const TRIPLE_D = String.fromCharCode(34, 34, 34);
  const TRIPLE_S = String.fromCharCode(39, 39, 39);

  function lire(src) {
    const jetons = [];
    const lignes = src.replace(/\r\n?/g, "\n").split("\n");
    const pile = [0];
    let profParen = 0;
    for (let i = 0; i < lignes.length; i++) {
      const brute = lignes[i];
      const num = i + 1;
      if (/^\s*(#.*)?$/.test(brute)) continue;          // ligne vide ou commentaire
      let col = 0;
      while (col < brute.length && (brute[col] === " " || brute[col] === "\t")) {
        col += brute[col] === "\t" ? 4 : 1;
      }
      if (brute.indexOf("\t") >= 0 && brute.indexOf("\t") < col) {
        throw new ErreurPy("Tabulation dans l'indentation : Python ne les mélange pas "
          + "avec les espaces. Utilisez quatre espaces.", num);
      }
      if (profParen === 0) {
        if (col > pile[pile.length - 1]) {
          pile.push(col);
          jetons.push({ t: "INDENT", l: num });
        } else {
          while (col < pile[pile.length - 1]) {
            pile.pop();
            jetons.push({ t: "DEDENT", l: num });
          }
          if (col !== pile[pile.length - 1]) {
            throw new ErreurPy("Indentation inattendue : cette ligne ne retombe sur "
              + "aucun bloc ouvert.", num);
          }
        }
      }
      let p = col;
      let texte = brute;
      while (p < texte.length) {
        const c = texte[p];
        if (c === " " || c === "\t") { p++; continue; }
        if (c === "#") break;
        /* La chaîne à TROIS guillemets. Elle peut courir sur plusieurs
           lignes — une exception dans un lecteur qui travaille ligne par
           ligne : on avance alors l'indice de la boucle extérieure
           jusqu'à la ligne de fermeture, et l'on reprend la lecture
           après elle.

           C'est elle qui porte les « docstrings » — la phrase sous le
           « def » qui dit ce que fait la fonction. Elles sont dans tous
           les corrigés, et sans elles une fonction juste était refusée. */
        if (texte.startsWith(TRIPLE_D, p) || texte.startsWith(TRIPLE_S, p)) {
          const marque = texte.substr(p, 3);
          let reste = texte.slice(p + 3);
          let val = "";
          let k = i;
          let fin = reste.indexOf(marque);
          while (fin < 0) {
            val += reste + "\n";
            k++;
            if (k >= lignes.length) {
              throw new ErreurPy("Chaîne à trois guillemets non refermée.", num);
            }
            reste = lignes[k];
            fin = reste.indexOf(marque);
          }
          val += reste.slice(0, fin);
          jetons.push({ t: "CHAINE", v: val, l: num });
          /* On reprend juste après la fermeture : si elle était sur une
             autre ligne, c'est cette ligne-là que l'on finit de lire, et
             la boucle extérieure continuera en dessous. L'indentation,
             elle, a déjà été calculée pour la ligne d'OUVERTURE — c'est
             la bonne, puisqu'on est toujours dans la même instruction. */
          i = k;
          texte = reste.slice(fin + 3);
          p = 0;
          continue;
        }
        /* La f-chaîne. On repère le « f » collé au guillemet, et on
           garde le texte BRUT : les accolades n'ont de sens qu'au moment
           de l'analyse, et les échappements de l'expression intérieure
           ne doivent pas être traités deux fois. */
        if ((c === "f" || c === "F") && (texte[p + 1] === '"' || texte[p + 1] === "'")) {
          const guil = texte[p + 1];
          let q = p + 2, brut = "";
          while (q < texte.length && texte[q] !== guil) {
            if (texte[q] === "\\") { brut += texte[q] + (texte[q + 1] || ""); q += 2; }
            else { brut += texte[q]; q++; }
          }
          if (q >= texte.length) throw new ErreurPy("Guillemet non refermé.", num);
          jetons.push({ t: "FCHAINE", v: brut, l: num });
          p = q + 1; continue;
        }
        if (c === '"' || c === "'") {
          let q = p + 1, val = "";
          while (q < texte.length && texte[q] !== c) {
            if (texte[q] === "\\") {
              const n = texte[q + 1];
              val += n === "n" ? "\n" : n === "t" ? "\t" : n === "\\" ? "\\"
                   : n === '"' ? '"' : n === "'" ? "'" : "\\" + n;
              q += 2;
            } else { val += texte[q]; q++; }
          }
          if (q >= texte.length) {
            throw new ErreurPy("Guillemet non refermé.", num);
          }
          jetons.push({ t: "CHAINE", v: val, l: num });
          p = q + 1; continue;
        }
        if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(texte[p + 1] || ""))) {
          let q = p;
          while (q < texte.length && /[0-9._]/.test(texte[q])) q++;
          if (texte[q] === "e" || texte[q] === "E") {
            q++;
            if (texte[q] === "+" || texte[q] === "-") q++;
            while (q < texte.length && /[0-9]/.test(texte[q])) q++;
          }
          const brut = texte.slice(p, q).replace(/_/g, "");
          jetons.push({ t: "NOMBRE", v: parseFloat(brut),
                        entier: !/[.eE]/.test(brut), l: num });
          p = q; continue;
        }
        if (/[A-Za-z_À-ɏ]/.test(c)) {
          let q = p;
          while (q < texte.length && /[A-Za-z0-9_À-ɏ]/.test(texte[q])) q++;
          const mot = texte.slice(p, q);
          jetons.push({ t: MOTS.has(mot) ? "MOT" : "NOM", v: mot, l: num });
          p = q; continue;
        }
        /* L'antislash en fin de ligne : l'instruction continue sur la
           ligne suivante. C'est l'écriture des longues conditions des
           corrigés — « if (a and b) \ » puis « or (c and d): ». La ligne
           suivante est collée à celle-ci, et son retrait ne compte pas :
           c'est la même instruction. */
        if (c === "\\" && !texte.slice(p + 1).trim() && i + 1 < lignes.length) {
          i++;
          texte = texte.slice(0, p) + " " + lignes[i];
          continue;
        }
        const op = OPS.find((o) => texte.startsWith(o, p));
        if (!op) {
          throw new ErreurPy("Caractère que je ne sais pas lire : « " + c + " ».", num);
        }
        if (op === "(" || op === "[" || op === "{") profParen++;
        if (op === ")" || op === "]" || op === "}") profParen = Math.max(0, profParen - 1);
        jetons.push({ t: "OP", v: op, l: num });
        p += op.length;
      }
      if (profParen === 0) jetons.push({ t: "FIN", l: num });
    }
    while (pile.length > 1) { pile.pop(); jetons.push({ t: "DEDENT", l: lignes.length }); }
    jetons.push({ t: "EOF", l: lignes.length });
    return jetons;
  }

  /* ── 2. L'analyseur ───────────────────────────────────────────────
     Descente récursive pour les instructions, précédences pour les
     expressions. Les constructions hors du cours sont REFUSÉES ICI, avec
     leur nom : c'est le seul endroit où l'on sait encore ce que l'élève a
     écrit, et donc le seul où l'on peut le lui dire clairement. */
  const HORS_COURS = {
    "yield": "les générateurs",
    "import": "les modules (import)",
    "from": "les modules (from … import)",
  };

  function analyser(jetons, classesDehors) {
    let i = 0;
    const voir = (d) => jetons[i + (d || 0)];
    const estOp = (v, d) => { const j = voir(d); return j.t === "OP" && j.v === v; };
    const estMot = (v, d) => { const j = voir(d); return j.t === "MOT" && j.v === v; };
    function manger(t, v) {
      const j = voir();
      if (j.t !== t || (v !== undefined && j.v !== v)) {
        throw new ErreurPy("J'attendais « " + (v || t) + " » et je trouve « "
          + (j.v !== undefined ? j.v : j.t) + " ».", j.l);
      }
      i++;
      return j;
    }
    function refusSiHorsCours(j) {
      if (j.t === "MOT" && HORS_COURS[j.v]) {
        throw new ErreurPy("Cet interprète ne connaît pas " + HORS_COURS[j.v]
          + ". Il couvre le Python du cours : variables, calcul, chaînes, listes, "
          + "conditions, boucles, fonctions et classes — un seul fichier à la fois, "
          + "donc rien à importer.", j.l);
      }
    }

    /* Les noms « privés » : dans le corps d'une classe, Python renomme
       tout attribut qui commence par deux soulignés (sans en finir par
       deux) en « _Classe__nom ». C'est ce qui rend « compte.__solde »
       introuvable depuis l'extérieur — et c'est ce que le cours fait
       constater. Le renommage se fait au texte, donc ici. */
    const classes = classesDehors ? classesDehors.slice() : [];
    function prive(nom) {
      if (!classes.length || !/^__/.test(nom) || /__$/.test(nom)) return nom;
      return "_" + classes[classes.length - 1].replace(/^_+/, "") + nom;
    }

    /* Une cible de « for » : un nom, ou un groupe entre parenthèses —
       « for i, (nom, note) in enumerate(eleves) ». */
    function cibleSimple() {
      if (estOp("(")) {
        const l = manger("OP").l;
        const el = [cibleSimple()];
        while (estOp(",")) { manger("OP"); if (estOp(")")) break; el.push(cibleSimple()); }
        manger("OP", ")");
        return { k: "cibles", el, l };
      }
      const j = manger("NOM");
      return { k: "nom", v: j.v, l: j.l };
    }
    function cibleFor() {
      const el = [cibleSimple()];
      while (estOp(",")) { manger("OP"); el.push(cibleSimple()); }
      return el.length === 1 ? el[0] : { k: "cibles", el, l: el[0].l };
    }

    /* Les clauses d'une compréhension, après la valeur : un ou plusieurs
       « for … in … », chacun suivi de ses « if ». La source et le filtre
       s'arrêtent avant le ternaire (« ou() » et non « expr() ») : sinon
       « [x for x in r if x > 0] » lirait « x if x > 0 » et réclamerait
       un « else ». */
    function clauses() {
      const cl = [];
      while (estMot("for")) {
        manger("MOT");
        const cible = cibleFor();
        manger("MOT", "in");
        const source = ou();
        const filtres = [];
        while (estMot("if")) { manger("MOT"); filtres.push(ou()); }
        cl.push({ cible, source, filtres });
      }
      return cl;
    }

    /* Les expressions, de la plus faible précédence à la plus forte. */
    function expr() {
      const e = ou();
      /* « a if condition else b » — l'expression conditionnelle. Elle est
         partout dans les corrigés, et sans elle une ligne juste est
         refusée. Elle se lit APRÈS la valeur, ce qui est l'ordre de
         Python et de personne d'autre. */
      if (estMot("if")) {
        const l = manger("MOT").l;
        const cond = ou();
        if (!estMot("else")) {
          throw new ErreurPy("« a if condition » veut toujours son « else b ».", l);
        }
        manger("MOT");
        return { k: "ternaire", cond, oui: e, non: expr(), l };
      }
      return e;
    }
    function ou() {
      let g = et();
      while (estMot("or")) { const l = manger("MOT").l; g = { k: "ou", g, d: et(), l }; }
      return g;
    }
    function et() {
      let g = non();
      while (estMot("and")) { const l = manger("MOT").l; g = { k: "et", g, d: non(), l }; }
      return g;
    }
    function non() {
      if (estMot("not")) { const l = manger("MOT").l; return { k: "non", e: non(), l }; }
      return comparaison();
    }
    function comparaison() {
      let g = ouBinaire();
      while (true) {
        const j = voir();
        if (j.t === "OP" && ["==", "!=", "<", ">", "<=", ">="].indexOf(j.v) >= 0) {
          i++; g = { k: "comp", op: j.v, g, d: ouBinaire(), l: j.l };
        } else if (j.t === "MOT" && j.v === "in") {
          i++; g = { k: "dans", g, d: ouBinaire(), l: j.l };
        } else if (j.t === "MOT" && j.v === "not" && estMot("in", 1)) {
          i += 2; g = { k: "non", e: { k: "dans", g, d: ouBinaire(), l: j.l }, l: j.l };
        } else if (j.t === "MOT" && j.v === "is") {
          /* « is » demande si c'est le MÊME objet, « == » s'ils ont la
             même valeur. En pratique on ne l'écrit que pour None —
             « x is None » — et c'est pour cela qu'il manquait. */
          i++;
          if (estMot("not")) { i++; g = { k: "non", e: { k: "memeque", g, d: ouBinaire(), l: j.l }, l: j.l }; }
          else g = { k: "memeque", g, d: ouBinaire(), l: j.l };
        } else break;
      }
      return g;
    }
    /* Les trois opérateurs d'ensembles, dans l'ordre de précédence de
       Python : « | » plus faible que « ^ », lui-même plus faible que
       « & ». Entre la comparaison et l'addition, comme dans le vrai
       langage — « a | b == c » se lit donc « a | (b == c) »… non :
       justement, la comparaison est AU-DESSUS, donc « (a|b) == c ». */
    function ouBinaire() {
      let g = ouExclusif();
      while (estOp("|")) { const j = manger("OP"); g = { k: "bin", op: "|", g, d: ouExclusif(), l: j.l }; }
      return g;
    }
    function ouExclusif() {
      let g = etBinaire();
      while (estOp("^")) { const j = manger("OP"); g = { k: "bin", op: "^", g, d: etBinaire(), l: j.l }; }
      return g;
    }
    function etBinaire() {
      let g = somme();
      while (estOp("&")) { const j = manger("OP"); g = { k: "bin", op: "&", g, d: somme(), l: j.l }; }
      return g;
    }
    function somme() {
      let g = produit();
      while (estOp("+") || estOp("-")) {
        const j = manger("OP"); g = { k: "bin", op: j.v, g, d: produit(), l: j.l };
      }
      return g;
    }
    function produit() {
      let g = unaire();
      while (estOp("*") || estOp("/") || estOp("//") || estOp("%")) {
        const j = manger("OP"); g = { k: "bin", op: j.v, g, d: unaire(), l: j.l };
      }
      return g;
    }
    function unaire() {
      if (estOp("-")) { const l = manger("OP").l; return { k: "moins", e: unaire(), l }; }
      if (estOp("+")) { manger("OP"); return unaire(); }
      return puissance();
    }
    function puissance() {
      const g = suffixe();
      if (estOp("**")) { const l = manger("OP").l; return { k: "bin", op: "**", g, d: unaire(), l }; }
      return g;
    }
    function suffixe() {
      let e = primaire();
      while (true) {
        if (estOp("(")) {
          const l = manger("OP").l;
          const args = [];
          const nommes = {};
          /* Les arguments NOMMÉS : « print(x, end=" ") », « round(v,
             ndigits=2) », « sorted(l, reverse=True) ». Ils se
             reconnaissent à « NOM = » — et pas « NOM == », d'où le
             contrôle sur le jeton suivant. Sans eux, le « end=" " » qui
             est dans tous les corrigés faisait tomber la ligne. */
          /* « *liste » étale une suite en arguments, « **d » un
             dictionnaire en arguments nommés : print(*notes). */
          const unArg = () => {
            if (voir().t === "NOM" && estOp("=", 1)) {
              const nom = manger("NOM").v;
              manger("OP", "=");
              nommes[nom] = expr();
              return;
            }
            if (estOp("*")) { manger("OP"); args.push({ k: "etoile", e: expr(), l }); return; }
            if (estOp("**")) { manger("OP"); args.push({ k: "etoile2", e: expr(), l }); return; }
            args.push(expr());
          };
          if (!estOp(")")) {
            unArg();
            /* « sum(n * n for n in notes) » : une expression génératrice,
               seul argument, sans crochets. Elle est calculée d'un coup,
               comme une liste — ce qui revient au même pour sum, min,
               max, any, all, sorted ou list. */
            if (estMot("for") && args.length === 1) {
              args[0] = { k: "comprehension", genre: "liste", valeur: args[0], clauses: clauses(), l };
            }
            while (estOp(",")) { manger("OP"); if (estOp(")")) break; unArg(); }
          }
          manger("OP", ")");
          e = { k: "appel", f: e, args, nommes, l };
        } else if (estOp("[")) {
          const l = manger("OP").l;
          let a = null, b = null, pasT = null, tranche = false;
          if (!estOp(":")) a = expr();
          if (estOp(":")) {
            tranche = true; manger("OP");
            if (!estOp("]") && !estOp(":")) b = expr();
            if (estOp(":")) { manger("OP"); if (!estOp("]")) pasT = expr(); }
          }
          manger("OP", "]");
          e = tranche ? { k: "tranche", e, a, b, pas: pasT, l } : { k: "index", e, i: a, l };
        } else if (estOp(".")) {
          const l = manger("OP").l;
          const brut = manger("NOM").v;
          e = { k: "attribut", e, nom: prive(brut), brut, l };
        } else break;
      }
      return e;
    }
    function primaire() {
      const j = voir();
      refusSiHorsCours(j);
      if (j.t === "NOMBRE") { i++; return { k: "nombre", v: j.v, entier: j.entier, l: j.l }; }
      if (j.t === "CHAINE") { i++; return { k: "chaine", v: j.v, l: j.l }; }
      if (j.t === "FCHAINE") { i++; return decouperF(j.v, j.l); }
      if (j.t === "NOM") { i++; return { k: "nom", v: j.v, l: j.l }; }
      if (j.t === "MOT" && (j.v === "True" || j.v === "False")) {
        i++; return { k: "bool", v: j.v === "True", l: j.l };
      }
      if (j.t === "MOT" && j.v === "None") { i++; return { k: "rien", l: j.l }; }
      /* « ... » : l'Ellipsis, le « à compléter » qu'on laisse dans un
         corps de fonction pas encore écrit. */
      if (estOp("...")) { i++; return { k: "constante", v: { t: "ellipsis", v: "Ellipsis" }, l: j.l }; }
      /* « lambda x: x[1] » — une fonction d'une expression, sans nom.
         C'est la clé de tri qu'on passe à sorted() : « trier les élèves
         par note » s'écrit sorted(eleves, key=lambda e: e.note). */
      if (j.t === "MOT" && j.v === "lambda") {
        i++;
        const params = [];
        while (!estOp(":")) {
          const p = manger("NOM").v;
          let defaut = null;
          if (estOp("=")) { manger("OP"); defaut = ou(); }
          params.push({ nom: p, defaut });
          if (!estOp(",")) break;
          manger("OP");
        }
        manger("OP", ":");
        return { k: "lambda", params, corps: expr(), l: j.l };
      }
      if (estOp("(")) {
        const l = manger("OP").l;
        /* Le tuple vide : « () ». */
        if (estOp(")")) { manger("OP"); return { k: "tuple", el: [], l }; }
        const premier = expr();
        if (estMot("for")) {
          const cl = clauses();
          manger("OP", ")");
          return { k: "comprehension", genre: "liste", valeur: premier, clauses: cl, l };
        }
        if (!estOp(",")) { manger("OP", ")"); return premier; }
        /* Une virgule, et ce n'est plus un simple groupe : c'est un
           TUPLE. Y compris « (1,) » — la virgule finale est ce qui
           distingue le tuple à un élément du nombre entre parenthèses.
           C'est une particularité de Python, et elle se voit ici. */
        const el = [premier];
        while (estOp(",")) {
          manger("OP");
          if (estOp(")")) break;
          el.push(expr());
        }
        manger("OP", ")");
        return { k: "tuple", el, l };
      }
      if (estOp("{")) {
        const l = manger("OP").l;
        /* « {} » est un DICTIONNAIRE vide, pas un ensemble vide. Python
           a choisi ainsi parce que les dictionnaires sont arrivés en
           premier ; l'ensemble vide s'écrit « set() ». */
        if (estOp("}")) { manger("OP"); return { k: "dico", paires: [], l }; }
        const premier = expr();
        if (estOp(":")) {
          manger("OP");
          const paires = [{ cle: premier, val: expr() }];
          /* « {nom: note for nom, note in couples} » */
          if (estMot("for")) {
            const cl = clauses();
            manger("OP", "}");
            return { k: "comprehension", genre: "dico", cle: premier, valeur: paires[0].val, clauses: cl, l };
          }
          while (estOp(",")) {
            manger("OP");
            if (estOp("}")) break;
            const c = expr();
            manger("OP", ":");
            paires.push({ cle: c, val: expr() });
          }
          manger("OP", "}");
          return { k: "dico", paires, l };
        }
        if (estMot("for")) {
          const cl = clauses();
          manger("OP", "}");
          return { k: "comprehension", genre: "ensemble", valeur: premier, clauses: cl, l };
        }
        const el = [premier];
        while (estOp(",")) {
          manger("OP");
          if (estOp("}")) break;
          el.push(expr());
        }
        manger("OP", "}");
        return { k: "ensemble", el, l };
      }
      if (estOp("[")) {
        const l = manger("OP").l;
        const el = [];
        if (!estOp("]")) {
          el.push(expr());
          /* La compréhension : « [x * 2 for x in liste if x > 0] ».
             Elle se reconnaît au « for » qui suit la première
             expression. C'est une boucle écrite à l'envers — la valeur
             d'abord, le parcours ensuite — et elle est partout dans les
             corrigés. */
          if (estMot("for")) {
            const cl = clauses();
            manger("OP", "]");
            return { k: "comprehension", genre: "liste", valeur: el[0], clauses: cl, l };
          }
          while (estOp(",")) { manger("OP"); if (estOp("]")) break; el.push(expr()); }
        }
        manger("OP", "]");
        return { k: "liste", el, l };
      }
      throw new ErreurPy("Je n'attendais pas « " + (j.v !== undefined ? j.v : j.t)
        + " » ici.", j.l);
    }

    /* Une f-chaîne devient une addition de morceaux : du texte, et des
       expressions passées à str(). « f"x={x}" » est donc exactement
       « "x=" + str(x) », et c'est ce que le message d'aide disait
       d'écrire à la main avant que cette fonction n'existe.

       Le format après « : » — « {prix:.2f} », « {nom:>10} » — est
       traduit en « %…f » / « %…s », que l'opérateur « % » sait déjà
       faire. Les deux fonctions se rendent service. */
    function decouperF(brut, l) {
      const morceaux = [];
      let texte = "";
      let p = 0;
      while (p < brut.length) {
        const c = brut[p];
        if (c === "{" && brut[p + 1] === "{") { texte += "{"; p += 2; continue; }
        if (c === "}" && brut[p + 1] === "}") { texte += "}"; p += 2; continue; }
        if (c === "\\") {
          const n = brut[p + 1];
          texte += n === "n" ? "\n" : n === "t" ? "\t" : n === "\\" ? "\\"
                 : n === '"' ? '"' : n === "'" ? "'" : "\\" + n;
          p += 2; continue;
        }
        if (c === "{") {
          /* On cherche l'accolade fermante, en comptant les
             imbrications : « {d[\'a\']} » contient des crochets, et
             « {f(g(x))} » des parenthèses. */
          let q = p + 1, prof = 0, dedans = "";
          while (q < brut.length) {
            const d = brut[q];
            if (d === "(" || d === "[" || d === "{") prof++;
            if (d === ")" || d === "]") prof--;
            if (d === "}" && prof === 0) break;
            if (d === "}") prof--;
            dedans += d; q++;
          }
          if (q >= brut.length) {
            throw new ErreurPy("Accolade non refermée dans la f-chaîne.", l);
          }
          if (texte) { morceaux.push({ k: "chaine", v: texte, l }); texte = ""; }
          /* Le format éventuel, après le premier « : » qui n'est ni dans
             des crochets, ni dans des parenthèses, ni dans une chaîne —
             « {d['a:b']} » et « {l[1:3]} » n'en ont pas. Puis « !r »,
             qui demande repr() au lieu de str(). */
          let format = null, code = dedans, conv = null;
          let prof2 = 0, guil = null;
          for (let q2 = 0; q2 < dedans.length; q2++) {
            const d = dedans[q2];
            if (guil) { if (d === guil) guil = null; continue; }
            if (d === "'" || d === '"') { guil = d; continue; }
            if ("([{".indexOf(d) >= 0) prof2++;
            else if (")]}".indexOf(d) >= 0) prof2--;
            else if (d === ":" && prof2 === 0) { code = dedans.slice(0, q2); format = dedans.slice(q2 + 1); break; }
          }
          const cv = /!([rs])\s*$/.exec(code);
          if (cv) { conv = cv[1]; code = code.slice(0, cv.index); }
          if (!code.trim()) throw new ErreurPy("Accolade vide dans la f-chaîne.", l);
          const sous = analyser(lire(code + "\n"), classes);
          if (sous.length !== 1 || sous[0].k !== "expression") {
            throw new ErreurPy("« " + code + " » n'est pas une expression que je peux "
              + "mettre dans une f-chaîne.", l);
          }
          morceaux.push({ k: "fmorceau", e: sous[0].e, format, conv, l });
          p = q + 1;
          continue;
        }
        texte += c; p++;
      }
      if (texte || !morceaux.length) morceaux.push({ k: "chaine", v: texte, l });
      return { k: "fchaine", morceaux, l };
    }

    /* Les instructions. */
    function bloc() {
      manger("OP", ":");
      /* Le bloc tient parfois sur la MÊME ligne : « if x > 2: break ».
         Python l'autorise pour une ou plusieurs instructions simples
         séparées par « ; ». C'est écrit partout dans les corrigés —
         et c'était refusé ici, ce qui faisait tomber une ligne juste. */
      if (voir().t !== "FIN") {
        const corps = [instruction(true)];
        while (estOp(";")) {
          manger("OP");
          if (voir().t === "FIN") break;
          corps.push(instruction(true));
        }
        manger("FIN");
        return corps;
      }
      manger("FIN");
      manger("INDENT");
      const corps = [];
      while (voir().t !== "DEDENT" && voir().t !== "EOF") corps.push(...ligne());
      if (voir().t === "DEDENT") i++;
      if (!corps.length) throw new ErreurPy("Ce bloc est vide.", voir().l);
      return corps;
    }
    /* Une ligne peut porter plusieurs instructions simples séparées par
       « ; » — « incrementer(); incrementer() ». Une instruction composée
       (if, for, def, class…) consomme elle-même la fin de son bloc. */
    const COMPOSEES = new Set(["si", "tantque", "pour", "def", "classe", "essayer", "avec"]);
    function ligne() {
      const premier = instruction(true);
      if (COMPOSEES.has(premier.k)) return [premier];
      const out = [premier];
      while (estOp(";")) {
        manger("OP");
        if (voir().t === "FIN") break;
        out.push(instruction(true));
      }
      manger("FIN");
      return out;
    }
    function instruction(surUneLigne) {
      /* « surUneLigne » : l'instruction est le corps d'un « if x: … » et
         le FIN appartient à l'appelant, qui doit encore lire les « ; ».
         Sans ce drapeau, la première instruction avalerait la fin de
         ligne et les suivantes seraient perdues. */
      const finir = () => { if (!surUneLigne) manger("FIN"); };
      const j = voir();
      refusSiHorsCours(j);
      /* Les décorateurs : « @property » sur sa ligne, puis la méthode.
         « @f def g » veut dire « g = f(g) », appliqués du bas vers le
         haut — c'est tout, et c'est ce qui rend @x.setter possible. */
      if (estOp("@")) {
        const decorateurs = [];
        while (estOp("@")) {
          manger("OP");
          decorateurs.push(expr());
          manger("FIN");
        }
        if (!estMot("def") && !estMot("class")) {
          throw new ErreurPy("Un décorateur « @ » se pose juste au-dessus d'un « def » "
            + "ou d'une « class ».", voir().l);
        }
        const st = instruction();
        st.decorateurs = decorateurs;
        return st;
      }
      if (j.t === "MOT") {
        if (j.v === "if") {
          i++;
          const cond = expr(), corps = bloc();
          const sinonsi = [];
          let sinon = null;
          while (estMot("elif")) {
            i++;
            const c2 = expr(); sinonsi.push({ cond: c2, corps: bloc() });
          }
          if (estMot("else")) { i++; sinon = bloc(); }
          return { k: "si", cond, corps, sinonsi, sinon, l: j.l };
        }
        if (j.v === "while") {
          i++; const cond = expr(); return { k: "tantque", cond, corps: bloc(), l: j.l };
        }
        if (j.v === "for") {
          i++;
          /* « for cle, valeur in d.items() » : plusieurs noms, et chaque
             élément parcouru est DÉPAQUETÉ dans ces noms. C'est ce qui
             rend .items() et enumerate() utilisables. */
          const cible = cibleFor();
          manger("MOT", "in");
          let source = expr();
          /* « for x in 1, 2, 3 » : un tuple sans parenthèses. */
          if (estOp(",")) {
            const el = [source];
            while (estOp(",")) { manger("OP"); if (estOp(":")) break; el.push(expr()); }
            source = { k: "tuple", el, l: j.l };
          }
          return { k: "pour", cible, source, corps: bloc(), l: j.l };
        }
        if (j.v === "def") {
          i++;
          const nom = prive(manger("NOM").v);
          manger("OP", "(");
          const params = [];
          if (!estOp(")")) {
            do {
              if (estOp(")")) break;
              /* « *args » : tous les arguments restants dans un tuple.
                 C'est l'exercice 3 du TP 5 — « total(*args) » — et il
                 était impossible à écrire. « **options » ramasse les
                 arguments nommés en trop dans un dictionnaire. */
              let reste = false, kw = false;
              if (estOp("*")) { manger("OP"); reste = true; }
              else if (estOp("**")) { manger("OP"); kw = true; }
              const p = manger("NOM").v;
              /* « nom: str » — l'annotation de type. Python ne la vérifie
                 pas à l'exécution ; on la lit, et on fait comme lui. */
              if (estOp(":")) { manger("OP"); expr(); }
              let defaut = null;
              if (estOp("=")) { manger("OP"); defaut = expr(); }
              params.push({ nom: p, defaut, reste, kw });
            } while (estOp(",") && manger("OP"));
          }
          manger("OP", ")");
          if (estOp("->")) { manger("OP"); expr(); }      /* « -> float », idem */
          return { k: "def", nom, params, corps: bloc(), l: j.l };
        }
        /* ── class ──
           Le corps d'une classe est un bloc ordinaire, exécuté une fois :
           ses « def » deviennent les méthodes, ses affectations les
           attributs de classe. Les noms privés y sont renommés. */
        if (j.v === "class") {
          i++;
          const nom = manger("NOM").v;
          const bases = [];
          if (estOp("(")) {
            manger("OP");
            while (!estOp(")")) {
              bases.push(expr());
              if (!estOp(",")) break;
              manger("OP");
            }
            manger("OP", ")");
          }
          classes.push(nom);
          let corps;
          try { corps = bloc(); } finally { classes.pop(); }
          return { k: "classe", nom, bases, corps, l: j.l };
        }
        /* ── del ── une variable, une case, une tranche ou un attribut. */
        if (j.v === "del") {
          i++;
          const cibles = [expr()];
          while (estOp(",")) { manger("OP"); cibles.push(expr()); }
          finir();
          for (const c of cibles) {
            if (["nom", "index", "tranche", "attribut"].indexOf(c.k) < 0) {
              throw new ErreurPy("« del » efface une variable, une case de liste ou de "
                + "dictionnaire, ou un attribut.", j.l);
            }
          }
          return { k: "supprimer", cibles, l: j.l };
        }
        /* ── with ── « with open(…) as f: » ferme le fichier en sortant,
           même si une erreur est levée dans le bloc. */
        if (j.v === "with") {
          i++;
          const e = expr();
          let alias = null;
          if (estMot("as")) { i++; alias = cibleSimple(); }
          if (estOp(",")) {
            throw new ErreurPy("Un seul « with … as … » par ligne ici : imbriquez-en "
              + "deux.", j.l);
          }
          return { k: "avec", e, alias, corps: bloc(), l: j.l };
        }
        if (j.v === "global" || j.v === "nonlocal") {
          i++;
          const noms = [manger("NOM").v];
          while (estOp(",")) { manger("OP"); noms.push(manger("NOM").v); }
          finir();
          return { k: j.v === "global" ? "globale" : "nonlocale", noms, l: j.l };
        }
        if (j.v === "assert") {
          i++;
          const cond = expr();
          let msg = null;
          if (estOp(",")) { manger("OP"); msg = expr(); }
          finir();
          return { k: "affirmer", cond, msg, l: j.l };
        }
        if (j.v === "return") {
          i++;
          /* « return a, b » rend un TUPLE sans parenthèses : c'est ainsi
             qu'une fonction Python rend deux valeurs, et le TP 6 le
             demande (« retourne (nom, prix) »). */
          let e = null;
          if (voir().t !== "FIN" && !estOp(";")) {
            e = expr();
            if (estOp(",")) {
              const el = [e];
              while (estOp(",")) {
                manger("OP");
                if (voir().t === "FIN" || estOp(";")) break;
                el.push(expr());
              }
              e = { k: "tuple", el, l: j.l };
            }
          }
          finir();
          return { k: "retour", e, l: j.l };
        }
        if (j.v === "break" || j.v === "continue" || j.v === "pass") {
          i++; finir();
          return { k: j.v === "pass" ? "rien-faire" : j.v === "break" ? "casser" : "suivant",
                   l: j.l };
        }
        /* ── raise ── */
        if (j.v === "raise") {
          i++;
          let e = null;
          if (voir().t !== "FIN" && !estOp(";")) e = expr();
          finir();
          return { k: "lever", e, l: j.l };
        }
        /* ── try / except / else / finally ──
           Le TP 9 entier repose dessus. « except » sans type attrape
           tout ; « except ValueError as e » attrape une famille et
           nomme l'erreur. */
        if (j.v === "try") {
          i++;
          const essai = bloc();
          const prises = [];
          let sinon = null, enfin = null;
          while (estMot("except")) {
            i++;
            let classe = null, alias = null;
            if (!estOp(":")) {
              /* « except (ValueError, TypeError) as e: » — plusieurs
                 familles d'un coup. La classe est gardée en LISTE. */
              if (estOp("(")) {
                manger("OP");
                classe = [manger("NOM").v];
                while (estOp(",")) { manger("OP"); if (estOp(")")) break; classe.push(manger("NOM").v); }
                manger("OP", ")");
              } else classe = [manger("NOM").v];
              if (estMot("as")) { i++; alias = manger("NOM").v; }
            }
            prises.push({ classe, alias, corps: bloc() });
          }
          if (estMot("else")) { i++; sinon = bloc(); }
          if (estMot("finally")) { i++; enfin = bloc(); }
          if (!prises.length && !enfin) {
            throw new ErreurPy("Un « try » veut au moins un « except » ou un "
              + "« finally ».", j.l);
          }
          return { k: "essayer", essai, prises, sinon, enfin, l: j.l };
        }
      }
      /* Affectation, ou simple expression. */
      let cible = expr();
      /* « a, b = b, a » : plusieurs cibles à gauche, un tuple à droite.
         L'échange de deux variables en une ligne, et le dépaquetage
         d'un tuple rendu par une fonction, passent tous les deux par
         là. */
      if (estOp(",")) {
        const el = [cible];
        while (estOp(",")) {
          manger("OP");
          if (voir().t === "FIN" || estOp("=") || estOp(";")) break;
          el.push(expr());
        }
        cible = { k: "cibles", el, l: cible.l };
      }
      /* « age: int = 20 » — l'annotation d'une variable. Lue, ignorée,
         comme Python le fait. Sans valeur, elle ne fait rien du tout. */
      if (estOp(":") && (cible.k === "nom" || cible.k === "attribut")) {
        manger("OP");
        expr();
        if (!estOp("=")) { finir(); return { k: "rien-faire", l: j.l }; }
      }
      const o = voir();
      if (o.t === "OP" && ["=", "+=", "-=", "*=", "/=", "//=", "%=", "**=",
                           "|=", "&=", "^="].indexOf(o.v) >= 0) {
        i++;
        const valeurDroite = () => {
          let val = expr();
          if (estOp(",")) {
            const el = [val];
            while (estOp(",")) {
              manger("OP");
              if (voir().t === "FIN" || estOp(";") || estOp("=")) break;
              el.push(expr());
            }
            val = { k: "tuple", el, l: o.l };
          }
          return val;
        };
        let val = valeurDroite();
        /* « a = b = 0 » : plusieurs cibles pour une même valeur. */
        const autres = [];
        while (o.v === "=" && estOp("=")) {
          manger("OP");
          autres.push(val.k === "tuple" ? { k: "cibles", el: val.el, l: val.l } : val);
          val = valeurDroite();
        }
        finir();
        /* Une cible : un nom, une case, un attribut (« self.nom = nom »),
           ou un groupe qui se dépaquette — y compris imbriqué. */
        const bonne = (c) => c.k === "nom" || c.k === "index" || c.k === "attribut"
          || ((c.k === "cibles" || c.k === "tuple" || c.k === "liste") && c.el.every(bonne));
        for (const c of [cible].concat(autres)) {
          if (c.k === "cibles" && o.v !== "=") {
            throw new ErreurPy("« " + o.v + " » ne s'écrit pas avec plusieurs "
              + "cibles.", o.l);
          }
          if (!bonne(c)) {
            throw new ErreurPy("On ne peut affecter qu'à une variable, à une case de "
              + "liste ou de dictionnaire, ou à un attribut.", o.l);
          }
        }
        return { k: "affecter", cible, autres, op: o.v, val, l: o.l };
      }
      if (cible.k === "cibles") {
        throw new ErreurPy("Une suite d'expressions séparées par des virgules ne fait "
          + "rien toute seule. Un tuple s'écrit entre parenthèses.", cible.l);
      }
      finir();
      return { k: "expression", e: cible, l: j.l };
    }

    const prog = [];
    while (voir().t !== "EOF") {
      if (voir().t === "FIN" || voir().t === "INDENT" || voir().t === "DEDENT") { i++; continue; }
      prog.push(...ligne());
    }
    return prog;
  }

  /* ── 3. Les valeurs ───────────────────────────────────────────────
     Python distingue l'entier du flottant, et cette distinction compte :
     « 7 / 2 » vaut 3.5, « 7 // 2 » vaut 3, et « print(4/2) » écrit « 2.0 »
     et non « 2 ». Un interprète qui rendrait « 2 » ici tromperait sur ce
     que la vraie machine affiche — c'est la faute à ne pas commettre. */
  const Ent = (v) => ({ t: "int", v: Math.trunc(v) });
  const Flo = (v) => ({ t: "float", v });
  const Str = (v) => ({ t: "str", v });
  const Bool = (v) => ({ t: "bool", v: !!v });
  const Nul = { t: "none", v: null };
  const Lst = (v) => ({ t: "list", v });
  /* Le tuple porte la même forme que la liste — un tableau — et c'est
     volontaire : tout ce qui LIT une séquence marche sur les deux. Seul
     ce qui ÉCRIT les distingue, et c'est exactement la différence que
     le TP 4 fait découvrir : un tuple ne se modifie pas. */
  const Tup = (v) => ({ t: "tuple", v });

  /* L'ensemble et le dictionnaire tiennent une Map de JavaScript, qui
     garde l'ordre d'insertion — comme les dictionnaires de Python
     depuis la version 3.7. La clé de la Map est une EMPREINTE de la
     valeur, parce que deux objets {t:"int", v:1} distincts doivent
     compter pour la même clé. L'entrée garde la valeur d'origine, pour
     pouvoir la rendre telle quelle. */
  const Ens = (m) => ({ t: "set", m: m || new Map() });
  const Dic = (m) => ({ t: "dict", m: m || new Map() });

  /* L'empreinte, et le refus qui va avec. Une liste change ; une clé
     qui change casserait la table. Python dit « unhashable type » ;
     ici on le dit en français, et on nomme le remplacement. */
  /* L'exécution en cours, pour les quelques fonctions de ce niveau qui
     doivent appeler du Python : écrire un objet, c'est appeler son
     __str__. Posé par executer(), rendu à la fin. */
  let ACTIF = null;
  const speciale = (x, nom, args) => (ACTIF && x.t === "objet" ? ACTIF.speciale(x, nom, args) : undefined);

  function empreinte(x, l) {
    switch (x.t) {
      case "int": case "float": return "n:" + x.v;
      case "bool": return "n:" + (x.v ? 1 : 0);   /* True == 1, comme en Python */
      case "str": return "s:" + x.v;
      case "none": return "none";
      case "tuple": return "t:(" + x.v.map((e) => empreinte(e, l)).join("\u0001") + ")";
      /* Un objet se range par son IDENTITÉ, comme en Python tant que sa
         classe ne dit pas autrement : deux élèves homonymes sont deux
         clés. Une classe et une fonction aussi. */
      case "objet": case "classe": case "fonction": return "o:" + x.id;
      default:
        throw new ErreurPy("Un " + typeNom(x) + " ne peut pas servir de clé de "
          + "dictionnaire ni d'élément d'ensemble, parce qu'il peut changer. "
          + "Un tuple, lui, convient.", l);
    }
  }

  function nombre(v, entier) { return entier ? Ent(v) : Flo(v); }
  function estNombre(x) { return x.t === "int" || x.t === "float" || x.t === "bool"; }
  function num(x) { return x.t === "bool" ? (x.v ? 1 : 0) : x.v; }

  function vrai(x) {
    if (x.t === "none") return false;
    if (x.t === "bool") return x.v;
    if (x.t === "int" || x.t === "float") return x.v !== 0;
    if (x.t === "str") return x.v.length > 0;
    if (x.t === "list" || x.t === "tuple") return x.v.length > 0;
    if (x.t === "set" || x.t === "dict") return x.m.size > 0;
    if (x.t === "objet") {
      const b = speciale(x, "__bool__", []);
      if (b !== undefined) return vrai(b);
      const n = speciale(x, "__len__", []);
      if (n !== undefined) return num(n) !== 0;
    }
    return true;
  }

  /* L'écriture d'un flottant, à la manière de Python : « 2.0 » garde son
     « .0 », et 0.1 + 0.2 écrit bien 0.30000000000000004 — ce n'est pas un
     défaut à cacher, c'est la leçon sur les flottants. */
  function ecrireFlottant(v) {
    if (!isFinite(v)) return v > 0 ? "inf" : (v < 0 ? "-inf" : "nan");
    if (Number.isInteger(v) && Math.abs(v) < 1e16) return v.toFixed(1);
    let s = String(v);
    if (s.indexOf("e") >= 0) return s;
    return s;
  }
  function ecrire(x) {
    switch (x.t) {
      case "none": return "None";
      case "bool": return x.v ? "True" : "False";
      case "int": return String(x.v);
      case "float": return ecrireFlottant(x.v);
      case "str": return x.v;
      case "list": return "[" + x.v.map(repr).join(", ") + "]";
      /* « (1,) » : la virgule solitaire du tuple à un élément. Sans
         elle, on lirait « (1) », qui est un nombre entre parenthèses —
         et c'est bien pour cela que Python l'écrit ainsi. */
      case "tuple": return x.v.length === 1
        ? "(" + repr(x.v[0]) + ",)"
        : "(" + x.v.map(repr).join(", ") + ")";
      case "set": return x.m.size === 0 ? "set()"
        : "{" + [...x.m.values()].map(repr).join(", ") + "}";
      case "dict": return "{" + [...x.m.values()]
        .map((e) => repr(e.cle) + ": " + repr(e.val)).join(", ") + "}";
      case "fonction": return "<function " + x.nom + ">";
      /* « print(e) » dans un « except … as e » écrit le MESSAGE, pas la
         classe : c'est ce que fait Python, et c'est ce qu'on veut
         afficher à l'utilisateur. */
      case "exception": return x.v;
      case "fichier": return "<fichier " + x.nom + " mode '" + x.mode + "'>";
      /* print(objet) appelle __str__ ; à défaut __repr__ ; à défaut
         l'écriture de Python, adresse comprise. Une exception qu'on a
         dérivée soi-même s'écrit par son message, comme les autres. */
      case "objet": {
        const s = speciale(x, "__str__", []);
        if (s !== undefined) return ecrire(s);
        if (x.classe.exception) {
          const a = x.argsExc || [];
          return a.length === 0 ? "" : a.length === 1 ? ecrire(a[0]) : ecrire(Tup(a));
        }
        return repr(x);
      }
      case "classe": return "<class '__main__." + x.nom + "'>";
      case "native": return NOMS_TYPES[x.nom] ? "<class '" + x.nom + "'>" : "<built-in function " + x.nom + ">";
      case "lie": return "<bound method " + (x.f.qualnom || x.f.nom) + " of " + repr(x.soi) + ">";
      case "propriete": return "<property object>";
      default: return String(x.v);
    }
  }
  function repr(x) {
    if (x.t === "str") {
      /* La guillemet que choisit Python : l'apostrophe, sauf si le
         texte en contient une et pas de guillemet double. */
      const g = x.v.indexOf("'") >= 0 && x.v.indexOf('"') < 0 ? '"' : "'";
      return g + x.v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\t/g, "\\t")
        .split(g).join(g === "'" ? "\\'" : g) + g;
    }
    if (x.t === "objet") {
      const r = speciale(x, "__repr__", []);
      if (r !== undefined) return ecrire(r);
      if (x.classe.exception) {
        return x.classe.nom + "(" + (x.argsExc || []).map(repr).join(", ") + ")";
      }
      return "<__main__." + x.classe.nom + " object at 0x" + (0x7f3a2c000000 + x.id * 48).toString(16) + ">";
    }
    return ecrire(x);
  }
  const NOMS_TYPES = { int: 1, float: 1, str: 1, bool: 1, list: 1, tuple: 1, set: 1, dict: 1, object: 1 };

  function typeNom(x) {
    if (x.t === "objet") return x.classe.nom;
    return { int: "int", float: "float", str: "str", bool: "bool",
             none: "NoneType", list: "list", tuple: "tuple", set: "set",
             dict: "dict", fonction: "function", fichier: "TextIOWrapper",
             exception: "Exception", classe: "type", lie: "method",
             native: "builtin_function_or_method" }[x.t] || x.t;
  }

  /* ── 4. L'évaluateur ──────────────────────────────────────────────
     Les ruptures de flux — return, break, continue — voyagent comme des
     exceptions JavaScript : c'est la façon la plus simple de traverser
     des blocs imbriqués sans porter un drapeau à chaque niveau. */
  function Retour(v) { this.v = v; }
  function Casser() {}
  function Suivant() {}

  function executer(src, options) {
    const o = options || {};
    const sorties = [];
    const entrees = (o.entree || []).slice();
    let lignesLues = 0;
    const PLAFOND = o.plafond || 2000000;
    let pas = 0;

    /* Ce qu'un « print(..., end="") » a laissé en suspens : il sera
       collé au début du prochain affichage, et versé tel quel à la fin
       du programme s'il ne vient rien d'autre. */
    let enAttente = "";
    /* La sortie BRUTE, telle qu'un terminal la reçoit : l'invite d'un
       input() n'y est pas suivie d'un saut de ligne — c'est la frappe de
       l'utilisateur, puis Entrée, qui en met un. La console de l'atelier
       s'en sert pour intercaler les saisies à leur place. */
    let brut = "";
    const ATTENTE = { attente: true };

    function ecrireSortie(s) {
      sorties.push(s);
      if (o.sortie) o.sortie(s);
      if (sorties.length > 20000) {
        throw new ErreurPy("Le programme écrit sans s'arrêter (plus de 20 000 lignes).", 0);
      }
    }
    function compter(l) {
      if (++pas > PLAFOND) {
        throw new ErreurPy("Le programme ne s'arrête pas : plus de deux millions "
          + "d'opérations. Une boucle tourne sans fin ?", l);
      }
    }

    const global = Object.create(null);

    /* Le disque du programme : un dictionnaire { nom: contenu }. Il naît
       vide à chaque exécution, et un programme qui veut relire un
       fichier commence donc par l'écrire — ce que font les TP. Les
       fichiers fournis par l'appelant (options.fichiers) sont là dès le
       départ, pour le jour où l'outil en proposera. */
    const disque = Object.assign(Object.create(null), o.fichiers || {});

    const exc = (classe, args) => ({ t: "exception", classe,
      v: args && args.length ? ecrire(args[0]) : classe });

    function chercher(env, nom) {
      let e = env;
      while (e) {
        if (nom in e.vars) return e.vars[nom];
        e = e.parent;
      }
      return undefined;
    }
    /* Python affecte dans la portée COURANTE, sauf si la fonction a dit
       « global x » (alors c'est la variable du programme) ou
       « nonlocal x » (celle de la fonction qui l'entoure). */
    function poser(env, nom, val) {
      let vars = env.vars;
      if (env.globales && env.globales.has(nom)) vars = global;
      else if (env.nonlocales && env.nonlocales.has(nom)) {
        let e = env.parent;
        while (e && (e.estClasse || !(nom in e.vars))) e = e.parent;
        if (e && e.vars !== global) vars = e.vars;
      }
      const ancien = avecDel ? vars[nom] : undefined;
      vars[nom] = val;
      if (ancien && ancien !== val) ramasser([ancien], []);
    }

    /* ── Le destructeur, __del__ ──────────────────────────────────────
       Python l'appelle quand plus RIEN ne désigne l'objet : « del c »
       sur sa seule variable, une variable qui reçoit autre chose, une
       fonction qui se termine sans le rendre, ou la fin du programme.
       Python le sait en comptant les références ; ici on cherche, au
       moment où une référence disparaît, si l'objet est encore
       joignable depuis les variables vivantes. Le tout ne coûte rien
       tant qu'aucune classe n'écrit __del__. */
    let avecDel = false;
    const pile = [];          /* les portées des fonctions en cours */
    const tenus = [];         /* l'objet qu'on construit, celui dont une méthode tourne */
    function joignables(extras) {
      const vus = new Set();
      const voir = (v) => {
        if (!v || typeof v !== "object" || vus.has(v)) return;
        vus.add(v);
        if (v.t === "objet") { for (const k in v.attrs) voir(v.attrs[k]); }
        else if (v.t === "list" || v.t === "tuple") v.v.forEach(voir);
        else if (v.t === "set") for (const x of v.m.values()) voir(x);
        else if (v.t === "dict") for (const e of v.m.values()) { voir(e.cle); voir(e.val); }
        else if (v.t === "classe") { for (const k in v.attrs) voir(v.attrs[k]); }
        else if (v.t === "lie" || v.t === "super") voir(v.soi);
      };
      const portees = new Set();
      for (const p of pile) for (let e = p; e; e = e.parent) portees.add(e.vars);
      portees.add(global);
      for (const vars of portees) for (const k in vars) voir(vars[k]);
      tenus.forEach(voir);
      enTraitement.forEach((e) => voir(e.objet));
      extras.forEach(voir);
      return vus;
    }
    function ramasser(valeurs, extras) {
      if (!avecDel) return;
      const candidats = [], vus = new Set();
      /* L'objet d'abord, puis ce qu'il contient ; une liste se vide de
         la fin vers le début — l'ordre de CPython. */
      const cueillir = (v) => {
        if (!v || typeof v !== "object" || vus.has(v)) return;
        vus.add(v);
        if (v.t === "objet") {
          if (!v.finalise && dansClasse(v.classe, "__del__") !== undefined) candidats.push(v);
          for (const k in v.attrs) cueillir(v.attrs[k]);
        } else if (v.t === "list" || v.t === "tuple") {
          for (let k = v.v.length - 1; k >= 0; k--) cueillir(v.v[k]);
        } else if (v.t === "set") for (const x of v.m.values()) cueillir(x);
        else if (v.t === "dict") for (const e of v.m.values()) { cueillir(e.cle); cueillir(e.val); }
      };
      valeurs.forEach(cueillir);
      if (!candidats.length) return;
      const vivants = joignables(extras);
      for (const o of candidats) {
        if (vivants.has(o) || o.finalise) continue;
        o.finalise = true;
        /* Une erreur dans __del__ n'arrête pas le programme : Python
           l'ignore, et nous aussi. */
        try { speciale(o, "__del__", []); }
        catch (e) { if (!e || !e.estPy) throw e; }
      }
    }

    /* ── Les classes ──────────────────────────────────────────────────
       Une classe : { t: "classe", nom, bases, attrs, mro }. Un objet :
       { t: "objet", classe, attrs }. Chercher un attribut sur un objet,
       c'est regarder l'objet, puis chaque classe de son MRO — l'ordre de
       résolution des méthodes, celui que Python calcule (C3) et qu'il
       affiche dans « Classe.__mro__ ». Pour un héritage simple, c'est la
       chaîne des parents ; pour un héritage multiple, c'est ce qui fait
       qu'une méthode commune n'est trouvée qu'une fois. */
    let compteurId = 0;
    function lineariser(c, l) {
      const suites = c.bases.map((b) => b.mro.slice()).concat([c.bases.slice()]);
      const out = [c];
      for (;;) {
        const pleines = suites.filter((s) => s.length);
        if (!pleines.length) return out;
        let tete = null;
        for (const s of pleines) {
          if (!pleines.some((t) => t.indexOf(s[0]) > 0)) { tete = s[0]; break; }
        }
        if (!tete) {
          throw new ErreurPy("L'ordre des classes parentes de « " + c.nom + " » est "
            + "impossible à résoudre : une classe y passe avant son propre parent.", l,
            "TypeError");
        }
        out.push(tete);
        for (const s of pleines) if (s[0] === tete) s.shift();
      }
    }
    function dansClasse(classe, nom) {
      for (const c of classe.mro) if (nom in c.attrs) return c.attrs[nom];
      return undefined;
    }
    /* Ce qu'une méthode devient quand on la lit sur un objet : liée à
       lui, et c'est pour cela qu'on n'écrit pas « self » à l'appel. */
    function lier(v, soi) {
      if (v.t === "fonction") return { t: "lie", f: v, soi };
      if (v.t === "statique") return v.f;
      if (v.t === "methodeclasse") return { t: "lie", f: v.f, soi: soi.t === "objet" ? soi.classe : soi };
      return v;
    }
    const estObjetPy = (x) => x.t === "objet" || x.t === "classe" || x.t === "super"
      || x.t === "propriete" || x.t === "exception";
    const natif = (nom, fn) => ({ t: "natif", nom, fn });
    /* La portée qu'une fonction emporte avec elle. Le corps d'une classe
       n'en est pas une : une méthode ne voit pas les attributs de classe
       par leur nom nu — elle passe par « self. » ou « NomClasse. ». */
    const portee = (env) => { let e = env; while (e.estClasse) e = e.parent; return e; };

    function introuvable(x, nom, l) {
      const quoi = x.t === "classe" ? "La classe « " + x.nom + " »" : "Un objet « " + typeNom(x) + " »";
      let aide = "";
      /* L'attribut privé lu depuis dehors : le cas que le cours montre. */
      const m = /^_([A-Za-z0-9]\w*)(__\w+)$/.exec(nom);
      const brut = m ? m[2] : nom;
      if (/^__/.test(brut) && !/__$/.test(brut) && x.t === "objet") {
        const nomPrive = "_" + x.classe.nom.replace(/^_+/, "") + brut;
        if (nomPrive in x.attrs || dansClasse(x.classe, nomPrive) !== undefined) {
          aide = " Un nom qui commence par deux soulignés est PRIVÉ : Python le "
            + "renomme « " + nomPrive + " » à l'intérieur de la classe, et il "
            + "n'existe pas sous son nom d'origine au dehors. On passe par une "
            + "méthode — un « getter ».";
        }
      }
      throw new ErreurPy(quoi + " n'a pas d'attribut « " + brut + " »." + aide, l,
        "AttributeError");
    }

    function attribut(x, nom, l) {
      if (x.t === "objet") {
        if (nom === "__class__") return x.classe;
        if (nom === "__dict__") {
          const m = new Map();
          for (const k in x.attrs) m.set(empreinte(Str(k), l), { cle: Str(k), val: x.attrs[k] });
          return Dic(m);
        }
        if (nom === "args" && x.classe.exception) return Tup((x.argsExc || []).slice());
        const c = dansClasse(x.classe, nom);
        /* Une propriété passe AVANT l'attribut de l'objet : c'est elle
           qui garde « self.age » derrière son contrôle. */
        if (c !== undefined && c.t === "propriete") {
          if (!c.fget) throw new ErreurPy("La propriété « " + nom + " » ne se lit pas.", l, "AttributeError");
          return appeler(c.fget, [x], {}, l);
        }
        if (nom in x.attrs) return x.attrs[nom];
        if (c !== undefined) return lier(c, x);
        const ga = dansClasse(x.classe, "__getattr__");
        if (ga !== undefined) return appeler(lier(ga, x), [Str(nom)], {}, l);
        return introuvable(x, nom, l);
      }
      if (x.t === "classe") {
        if (nom === "__name__") return Str(x.nom);
        if (nom === "__mro__") return Tup(x.mro.slice());
        if (nom === "__bases__") return Tup(x.bases.slice());
        const c = dansClasse(x, nom);
        if (c === undefined) return introuvable(x, nom, l);
        if (c.t === "statique") return c.f;
        if (c.t === "methodeclasse") return { t: "lie", f: c.f, soi: x };
        return c;
      }
      /* super() : la suite du MRO, APRÈS la classe où la méthode est
         écrite — pas après la classe de l'objet. C'est ce qui permet à
         chaque niveau d'appeler le sien. */
      if (x.t === "super") {
        const mro = (x.soi.t === "objet" ? x.soi.classe : x.soi).mro;
        for (let k = mro.indexOf(x.classe) + 1; k < mro.length; k++) {
          if (nom in mro[k].attrs) {
            const v = mro[k].attrs[nom];
            if (v.t === "propriete") return appeler(v.fget, [x.soi], {}, l);
            return lier(v, x.soi);
          }
        }
        /* Rien plus haut : c'est la classe « object » de Python, ou une
           exception de base. Son __init__ range les arguments d'une
           exception, et ne fait rien pour le reste. */
        if (nom === "__init__") {
          const exc = mro.some((c) => c.exception);
          return natif("__init__", (args, nommes, l2) => {
            if (exc) x.soi.argsExc = args.slice();
            else if (args.length) throw new ErreurPy("object.__init__() ne prend pas "
              + "d'argument : la classe mère n'a pas de __init__ à qui les passer.", l2, "TypeError");
            return Nul;
          });
        }
        if (nom === "__str__" || nom === "__repr__") {
          return natif(nom, () => Str(nom === "__str__" ? ecrireBase(x.soi) : reprBase(x.soi)));
        }
        throw new ErreurPy("super() : aucune classe parente n'a d'attribut « " + nom + " ».", l,
          "AttributeError");
      }
      /* « @age.setter » : la propriété fabrique sa jumelle, qui sait
         aussi écrire. */
      if (x.t === "propriete") {
        if (nom === "setter") return natif("setter", (a) => ({ t: "propriete", fget: x.fget, fset: a[0] }));
        if (nom === "getter") return natif("getter", (a) => ({ t: "propriete", fget: a[0], fset: x.fset }));
        if (nom === "deleter") return natif("deleter", () => x);
        return introuvable(x, nom, l);
      }
      if (x.t === "exception" && nom === "args") return Tup([Str(x.v)]);
      return introuvable(x, nom, l);
    }
    /* L'écriture d'un objet sans son __str__ : ce que rend super().__str__(). */
    function ecrireBase(o) {
      if (o.classe.exception) {
        const a = o.argsExc || [];
        return a.length === 0 ? "" : a.length === 1 ? ecrire(a[0]) : ecrire(Tup(a));
      }
      return reprBase(o);
    }
    function reprBase(o) {
      return "<__main__." + o.classe.nom + " object at 0x" + (0x7f3a2c000000 + o.id * 48).toString(16) + ">";
    }

    function poserAttribut(x, nom, val, l) {
      if (x.t === "objet") {
        const c = dansClasse(x.classe, nom);
        if (c !== undefined && c.t === "propriete") {
          if (!c.fset) {
            throw new ErreurPy("La propriété « " + nom + " » de « " + x.classe.nom + " » se "
              + "lit mais ne s'écrit pas : elle n'a pas de setter.", l, "AttributeError");
          }
          appeler(c.fset, [x, val], {}, l);
          return;
        }
        x.attrs[nom] = val;
        return;
      }
      if (x.t === "classe") { x.attrs[nom] = val; return; }
      throw new ErreurPy("On n'ajoute pas d'attribut à un " + typeNom(x) + " : seuls les "
        + "objets de vos propres classes en reçoivent.", l, "AttributeError");
    }

    /* Appeler quoi que ce soit : une fonction, une méthode liée, une
       classe (c'est construire un objet), une native. Un seul chemin,
       pour que tout ce qui s'appelle s'appelle de la même façon. */
    function appeler(f, args, nommes, l, nomVu) {
      switch (f.t) {
        case "native": return NATIVES[f.nom](args, l, nommes);
        case "natif": return f.fn(args, nommes, l);
        case "methode": return methode(f.cible, f.nom, args, l, nommes);
        case "fonction": return appelerFonction(f, args, nommes, l);
        case "lie": {
          tenus.push(f.soi);
          try { return appeler(f.f, [f.soi].concat(args), nommes, l); }
          finally { tenus.pop(); }
        }
        case "classe": return instancier(f, args, nommes, l);
      }
      throw new ErreurPy("« " + (nomVu || repr(f)) + " » n'est pas une fonction : un "
        + typeNom(f) + " ne s'appelle pas.", l, "TypeError");
    }

    function appelerFonction(f, args, nommes, l) {
      const local = { vars: Object.create(null), parent: f.env };
      const positionnels = f.params.filter((p) => !p.reste && !p.kw);
      const aReste = f.params.some((p) => p.reste);
      const pKw = f.params.find((p) => p.kw);
      if (args.length > positionnels.length && !aReste) {
        throw new ErreurPy(f.nom + "() reçoit " + args.length + " argument(s) pour "
          + positionnels.length + " paramètre(s)"
          + (f.classe && positionnels.length && args.length === positionnels.length + 1
            ? " — une méthode reçoit « self » en premier : l'a-t-on oublié dans sa définition ?"
            : ".") , l, "TypeError");
      }
      const restants = Object.assign(Object.create(null), nommes);
      let k = 0;
      f.params.forEach((p, rang) => {
        /* « *args » ramasse tout ce qui reste, dans un TUPLE — comme
           en Python, et c'est pour cela que « total(*args) » peut
           faire sum(args). */
        if (p.reste) { local.vars[p.nom] = Tup(args.slice(k)); k = args.length; return; }
        if (p.kw) return;
        if (k < args.length) {
          if (p.nom in restants) {
            throw new ErreurPy(f.nom + "() reçoit deux valeurs pour « " + p.nom + " ».", l,
              "TypeError");
          }
          local.vars[p.nom] = args[k++];
        } else if (p.nom in restants) {
          local.vars[p.nom] = restants[p.nom];
          delete restants[p.nom];
        } else if (f.defauts[rang] !== undefined) local.vars[p.nom] = f.defauts[rang];
        else throw new ErreurPy(f.nom + "() : il manque l'argument « " + p.nom + " ».",
          l, "TypeError");
      });
      const enTrop = Object.keys(restants);
      if (pKw) {
        const m = new Map();
        for (const c of enTrop) m.set(empreinte(Str(c), l), { cle: Str(c), val: restants[c] });
        local.vars[pKw.nom] = Dic(m);
      } else if (enTrop.length) {
        throw new ErreurPy(f.nom + "() n'a pas de paramètre « " + enTrop[0] + " ».", l,
          "TypeError");
      }
      /* Ce dont super() a besoin : la classe où la méthode est écrite,
         et l'objet qu'elle a reçu. Des noms qu'aucun programme ne peut
         écrire, puisqu'ils commencent par une espace. */
      if (f.classe) { local.vars[" classe"] = f.classe; if (args.length) local.vars[" soi"] = args[0]; }
      let resultat = Nul;
      pile.push(local);
      try {
        for (const st of f.corps) executerInstruction(st, local);
      } catch (e) {
        if (!(e instanceof Retour)) throw e;
        resultat = e.v;
      } finally {
        pile.pop();
      }
      /* Les locales meurent avec la fonction — sauf ce qu'elle rend. */
      if (avecDel) ramasser(Object.keys(local.vars).map((k) => local.vars[k]), [resultat]);
      return resultat;
    }

    function instancier(classe, args, nommes, l) {
      const obj = { t: "objet", classe, attrs: Object.create(null), id: ++compteurId };
      /* Une exception garde ses arguments d'office, avant même son
         __init__ — c'est ce que fait BaseException en Python. */
      if (classe.exception) obj.argsExc = args.slice();
      const init = dansClasse(classe, "__init__");
      if (init !== undefined) {
        const r = appeler(lier(init, obj), args, nommes, l);
        if (r.t !== "none") {
          throw new ErreurPy("__init__() doit rendre None : il prépare l'objet, il ne "
            + "le renvoie pas.", l, "TypeError");
        }
      } else if (!classe.exception && (args.length || Object.keys(nommes).length)) {
        throw new ErreurPy(classe.nom + "() ne prend pas d'argument : la classe n'a pas de "
          + "méthode __init__ pour les recevoir.", l, "TypeError");
      }
      return obj;
    }

    function creerClasse(n, env) {
      const classe = { t: "classe", nom: n.nom, bases: [], attrs: Object.create(null),
                       id: ++compteurId, exception: null };
      for (const b of n.bases.map((e) => evaluer(e, env))) {
        if (b.t === "classe") { classe.bases.push(b); if (!classe.exception) classe.exception = b.exception; }
        else if (b.t === "native" && FAMILLES[b.nom]) { if (!classe.exception) classe.exception = b.nom; }
        else if (b.t === "native" && b.nom === "object") { /* la racine de tout */ }
        else {
          throw new ErreurPy("La classe « " + n.nom + " » ne peut hériter que d'une autre "
            + "classe du programme, ou d'une exception ; pas d'un " + typeNom(b) + ".",
            n.l, "TypeError");
        }
      }
      classe.mro = lineariser(classe, n.l);
      const corpsEnv = { vars: classe.attrs, parent: env, estClasse: true };
      for (const st of n.corps) executerInstruction(st, corpsEnv);
      if ("__del__" in classe.attrs) avecDel = true;
      /* Chaque méthode apprend dans quelle classe elle est écrite :
         c'est ce que super() lira. */
      for (const k in classe.attrs) {
        const v = classe.attrs[k];
        const marquer = (f) => { if (f && f.t === "fonction") { f.classe = classe; f.qualnom = n.nom + "." + f.nom; } };
        marquer(v);
        if (v.t === "statique" || v.t === "methodeclasse") marquer(v.f);
        if (v.t === "propriete") { marquer(v.fget); marquer(v.fset); }
      }
      return classe;
    }

    function decorer(val, n, env) {
      if (!n.decorateurs) return val;
      for (let k = n.decorateurs.length - 1; k >= 0; k--) {
        val = appeler(evaluer(n.decorateurs[k], env), [val], Object.create(null), n.l);
      }
      return val;
    }

    /* Les méthodes spéciales, appelées par le langage lui-même : « a + b »
       appelle a.__add__(b), « print(a) » appelle a.__str__(). */
    ACTIF = {
      speciale(x, nom, args) {
        const m = dansClasse(x.classe, nom);
        if (m === undefined) return undefined;
        return appeler(lier(m, x), args, Object.create(null), 0);
      },
    };

    /* Les fonctions natives. Chacune vérifie ses arguments et refuse par
       une phrase : « int('abc') » doit dire pourquoi, pas rendre NaN. */
    const NATIVES = {
      /* print() a deux réglages, et ils servent vraiment :
           sep — ce qui sépare les valeurs (une espace par défaut)
           end — ce qui termine la ligne (un saut de ligne)
         « end="" » colle les affichages les uns aux autres, et c'est
         l'écriture que les corrigés emploient pour aligner des nombres
         sur une seule ligne. Ici les sorties sont des LIGNES : un
         « end » sans saut de ligne continue donc la ligne précédente au
         lieu d'en ouvrir une. */
      print(args, l, nommes) {
        const sep = nommes && nommes.sep !== undefined ? ecrire(nommes.sep) : " ";
        const fin = nommes && nommes.end !== undefined ? ecrire(nommes.end) : "\n";
        const corps = args.map(ecrire).join(sep);
        const morceaux = (corps + fin).split("\n");
        /* La dernière tranche n'est pas terminée par un saut : elle
           reste « en attente », et le prochain print la complètera. */
        for (let k = 0; k < morceaux.length - 1; k++) {
          ecrireSortie(enAttente + morceaux[k]);
          enAttente = "";
        }
        enAttente += morceaux[morceaux.length - 1];
        brut += corps + fin;
        return Nul;
      },
      input(args, l) {
        if (args.length) { ecrireSortie(ecrire(args[0])); brut += ecrire(args[0]); }
        if (lignesLues >= entrees.length) {
          /* Plus de saisie : l'atelier demande la suivante et REJOUE le
             programme avec elle (options.attente) ; « Fin de saisie »
             ferme l'entrée, et input() lève EOFError comme sous Ctrl+D. */
          if (o.finEntree) throw new ErreurPy("EOF when reading a line", l, "EOFError");
          if (o.attente) throw ATTENTE;
          throw new ErreurPy("Le programme demande une saisie, et il n'y en a plus.", l, "EOFError");
        }
        return Str(String(entrees[lignesLues++]));
      },
      len(args, l) {
        const x = args[0];
        if (x.t === "objet") {
          const n = speciale(x, "__len__", []);
          if (n !== undefined) return n;
        }
        if (x.t === "str") return Ent(x.v.length);
        if (x.t === "list" || x.t === "tuple") return Ent(x.v.length);
        if (x.t === "set" || x.t === "dict") return Ent(x.m.size);
        throw new ErreurPy("len() veut une chaîne, une liste, un tuple, un ensemble "
          + "ou un dictionnaire, pas un " + typeNom(x) + ".", l, "TypeError");
      },
      int(args, l) {
        const x = args[0];
        if (x.t === "str") {
          const t = x.v.trim();
          if (!/^[+-]?\d+$/.test(t)) {
            throw new ErreurPy("int('" + x.v + "') : ce texte n'est pas un entier.", l,
              "ValueError");
          }
          return Ent(parseInt(t, 10));
        }
        if (estNombre(x)) return Ent(num(x));
        throw new ErreurPy("int() ne sait pas convertir un " + typeNom(x) + ".", l);
      },
      float(args, l) {
        const x = args[0];
        if (x.t === "str") {
          const v = parseFloat(x.v.trim());
          if (!isFinite(v)) {
            throw new ErreurPy("float('" + x.v + "') : ce texte n'est pas un nombre.", l,
              "ValueError");
          }
          return Flo(v);
        }
        if (estNombre(x)) return Flo(num(x));
        throw new ErreurPy("float() ne sait pas convertir un " + typeNom(x) + ".", l);
      },
      str(args) { return Str(args.length ? ecrire(args[0]) : ""); },
      repr(args) { return Str(repr(args[0])); },
      bool(args) { return Bool(args.length ? vrai(args[0]) : false); },
      abs(args, l) {
        const x = args[0];
        if (!estNombre(x)) throw new ErreurPy("abs() veut un nombre.", l);
        return x.t === "int" ? Ent(Math.abs(num(x))) : Flo(Math.abs(num(x)));
      },
      round(args, l) {
        const x = args[0];
        if (!estNombre(x)) throw new ErreurPy("round() veut un nombre.", l);
        const d = args.length > 1 ? num(args[1]) : 0;
        const val = num(x);
        /* Deux règles de Python, et la seconde m'a pris en défaut.

           1. Sur un demi EXACT, Python arrondit au PAIR : round(0.5) vaut 0,
              round(2.5) vaut 2. Pas « au supérieur ».
           2. Et « exact » veut dire exact EN BINAIRE. round(2.675, 2) rend
              2,67 et non 2,68, parce que 2,675 n'est pas représentable :
              le nombre réellement stocké est 2,674999999999999822…

           Mon premier code multipliait par 100 avant d'arrondir. Or
           2.675 × 100 vaut EXACTEMENT 267,5 en binaire — la multiplication
           fabriquait l'égalité que le nombre n'avait pas, et je rendais
           2,68. C'est le vrai Python qui me l'a dit, pas une relecture.

           La bonne méthode n'arrondit jamais deux fois : « toFixed » arrondit
           la valeur binaire réelle. Reste à reconnaître un VRAI demi, et
           c'est un aller-retour qui le prouve : si la valeur coupée à d+1
           décimales se termine par 5 et redonne exactement le nombre de
           départ, alors c'était un demi exact. */
        /* Un demi EXACT se reconnaît sur le développement décimal RÉEL du
           flottant, pas sur sa plus courte écriture. « toFixed(3) » rend
           "2.675" pour un nombre qui vaut 2,674999999999999822 : s'y fier
           ferait croire à une égalité. On lit donc vingt décimales — un
           double dyadique y tient — et on exige un 5 suivi de zéros. */
        const exact = val.toFixed(20);
        const pt = exact.indexOf(".");
        const apres = exact.slice(pt + 1);
        const reste = apres.slice(Math.max(0, d));
        const demiExact = reste[0] === "5" && /^5 ?0*$/.test(reste.replace(/ /g, ""));
        let v;
        if (demiExact) {
          const tronque = Number(exact.slice(0, pt + 1 + d).replace(/\.$/, ""));
          const pasDec = Math.pow(10, -d);
          const haut = tronque + (val >= 0 ? pasDec : -pasDec);
          const entierDe = (z) => Math.abs(Math.round(Number(z.toFixed(20)) * Math.pow(10, d)));
          v = entierDe(tronque) % 2 === 0 ? tronque : haut;
        } else {
          v = Number(val.toFixed(Math.min(20, Math.max(0, d))));
        }
        /* Avec un second argument, Python rend TOUJOURS un flottant —
           round(2.5, 0) écrit « 2.0 », pas « 2 ». */
        return args.length > 1 || x.t === "float" && d > 0 ? Flo(v) : Ent(v);
      },
      min(args, l, nommes) { return extremum(args, l, "min", nommes); },
      max(args, l, nommes) { return extremum(args, l, "max", nommes); },
      sum(args, l) {
        const x = args[0];
        if (!x) throw new ErreurPy("sum() veut une suite de nombres.", l);
        let s = 0, flottant = false;
        for (const e of elements(x, l)) {
          if (!estNombre(e)) throw new ErreurPy("sum() : la liste contient un "
            + typeNom(e) + ".", l);
          if (e.t === "float") flottant = true;
          s += num(e);
        }
        return flottant ? Flo(s) : Ent(s);
      },
      range(args, l) {
        const n = args.map((a) => {
          if (a.t !== "int" && a.t !== "bool") {
            throw new ErreurPy("range() veut des entiers.", l);
          }
          return num(a);
        });
        let d = 0, f = 0, p = 1;
        if (n.length === 1) f = n[0];
        else if (n.length === 2) { d = n[0]; f = n[1]; }
        else if (n.length >= 3) { d = n[0]; f = n[1]; p = n[2]; }
        if (p === 0) throw new ErreurPy("range() : le pas ne peut pas être nul.", l);
        const out = [];
        for (let k = d; p > 0 ? k < f : k > f; k += p) {
          out.push(Ent(k));
          if (out.length > 1000000) {
            throw new ErreurPy("range() produit plus d'un million de valeurs.", l);
          }
        }
        return Lst(out);
      },
      list(args, l) {
        const x = args[0];
        if (!x) return Lst([]);
        return Lst(elements(x, l).slice());
      },
      /* tuple(), set(), dict() : les trois convertisseurs. Ils prennent
         tout ce qui se parcourt — c'est ainsi qu'on « enlève les
         doublons d'une liste » en une ligne : list(set(ma_liste)). */
      tuple(args, l) {
        const x = args[0];
        if (!x) return Tup([]);
        return Tup(elements(x, l).slice());
      },
      set(args, l) {
        const x = args[0];
        if (!x) return Ens();
        const m = new Map();
        for (const e of elements(x, l)) m.set(empreinte(e, l), e);
        return Ens(m);
      },
      dict(args, l) {
        const x = args[0];
        if (!x) return Dic();
        if (x.t === "dict") {
          return Dic(new Map([...x.m].map(([k, e]) => [k, { cle: e.cle, val: e.val }])));
        }
        /* dict() depuis une liste de paires : dict([(1,'a'), (2,'b')]).
           C'est l'inverse de .items(), et le couple des deux sert tout
           le temps dès qu'on transforme un dictionnaire. */
        const m = new Map();
        for (const e of elements(x, l)) {
          if ((e.t !== "tuple" && e.t !== "list") || e.v.length !== 2) {
            throw new ErreurPy("dict() veut une suite de paires (clé, valeur) ; "
              + "ici j'ai trouvé " + repr(e) + ".", l, "ValueError");
          }
          m.set(empreinte(e.v[0], l), { cle: e.v[0], val: e.v[1] });
        }
        return Dic(m);
      },
      /* enumerate() rend des couples (rang, valeur). Sans lui, on écrit
         « for i in range(len(liste)) » puis « liste[i] » — ce qui marche
         et qui est l'écriture que tout le monde finit par abandonner. */
      enumerate(args, l) {
        const x = args[0];
        const depart = args.length > 1 ? num(args[1]) : 0;
        return Lst(elements(x, l).map((e, k) => Tup([Ent(k + depart), e])));
      },
      /* zip() assemble deux suites en couples, et s'arrête sur la plus
         courte — c'est sa règle, et elle surprend quand on l'oublie. */
      zip(args, l) {
        if (args.length < 2) throw new ErreurPy("zip() veut au moins deux suites.", l);
        const suites = args.map((a) => elements(a, l));
        const n = Math.min.apply(null, suites.map((s) => s.length));
        const out = [];
        for (let k = 0; k < n; k++) out.push(Tup(suites.map((s) => s[k])));
        return Lst(out);
      },
      sorted(args, l, nommes) {
        const x = args[0];
        if (!x) throw new ErreurPy("sorted() veut une suite à trier.", l);
        /* sorted() rend TOUJOURS une liste, même sur un ensemble ou un
           dictionnaire : c'est la façon d'obtenir un ordre là où il n'y
           en a pas. « sorted(mon_set) » est l'idiome. */
        return Lst(trierAvec(elements(x, l).slice(), nommes, l));
      },
      /* type(objet) rend sa classe : « type(e).__name__ » donne son nom. */
      type(args) {
        const x = args[0];
        if (x.t === "objet") return x.classe;
        return Str("<class '" + typeNom(x) + "'>");
      },
      /* Les trois décorateurs du cours. Ce sont des fonctions ordinaires
         qui emballent la méthode : « @property » au-dessus de « def age »
         veut dire « age = property(age) ». */
      property(args) { return { t: "propriete", fget: args[0] || null, fset: args[1] || null }; },
      staticmethod(args) { return { t: "statique", f: args[0] }; },
      classmethod(args) { return { t: "methodeclasse", f: args[0] }; },
      object(args, l) {
        throw new ErreurPy("object() n'a pas d'usage ici : « class A(object) » s'écrit "
          + "aussi « class A », et c'est la même chose.", l, "TypeError");
      },
      hasattr(args, l) {
        try { attribut(args[0], ecrire(args[1]), l); return Bool(true); }
        catch (e) { if (e && e.estPy && e.classe === "AttributeError") return Bool(false); throw e; }
      },
      getattr(args, l) {
        try { return attribut(args[0], ecrire(args[1]), l); }
        catch (e) {
          if (args.length > 2 && e && e.estPy && e.classe === "AttributeError") return args[2];
          throw e;
        }
      },
      setattr(args, l) { poserAttribut(args[0], ecrire(args[1]), args[2], l); return Nul; },
      issubclass(args, l) {
        const [a, b] = args;
        if (a.t !== "classe") throw new ErreurPy("issubclass() veut une classe.", l, "TypeError");
        const bs = b.t === "tuple" ? b.v : [b];
        return Bool(bs.some((c) => c.t === "classe" ? a.mro.indexOf(c) >= 0
          : c.t === "native" && (c.nom === "object" || (a.exception && familleDe(a).indexOf(c.nom) >= 0))));
      },
      callable(args) { return Bool(["fonction", "lie", "classe", "native", "natif", "methode"].indexOf(args[0].t) >= 0); },
      id(args) { return Ent(args[0].id || 0); },
      any(args, l) { return Bool(elements(args[0], l).some(vrai)); },
      all(args, l) { return Bool(elements(args[0], l).every(vrai)); },
      reversed(args, l) { return Lst(elements(args[0], l).slice().reverse()); },
      map(args, l) {
        const suites = args.slice(1).map((a) => elements(a, l));
        const n = Math.min.apply(null, suites.map((s) => s.length));
        const out = [];
        for (let k = 0; k < n; k++) out.push(appeler(args[0], suites.map((s) => s[k]), Object.create(null), l));
        return Lst(out);
      },
      filter(args, l) {
        return Lst(elements(args[1], l).filter((x) => vrai(args[0].t === "none" ? x
          : appeler(args[0], [x], Object.create(null), l))));
      },
      chr(args) { return Str(String.fromCodePoint(num(args[0]))); },
      ord(args, l) {
        if (args[0].t !== "str" || [...args[0].v].length !== 1) {
          throw new ErreurPy("ord() veut UN caractère.", l, "TypeError");
        }
        return Ent(args[0].v.codePointAt(0));
      },
      divmod(args, l) { return Tup([binaire("//", args[0], args[1], l), binaire("%", args[0], args[1], l)]); },
      pow(args, l) { return binaire("**", args[0], args[1], l); },
      hex(args) { const v = num(args[0]); return Str((v < 0 ? "-0x" : "0x") + Math.abs(v).toString(16)); },
      bin(args) { const v = num(args[0]); return Str((v < 0 ? "-0b" : "0b") + Math.abs(v).toString(2)); },
      oct(args) { const v = num(args[0]); return Str((v < 0 ? "-0o" : "0o") + Math.abs(v).toString(8)); },

      /* isinstance(x, int) — « est-ce bien un entier ? ». Le TP 9 s'en
         sert pour vérifier une saisie avant de l'utiliser.

         Le second argument est le NOM d'un type, qui est aussi le nom
         d'une fonction de conversion : « int » s'évalue donc en native,
         et c'est son nom qu'on lit. Un tuple de types est accepté, comme
         en Python : isinstance(x, (int, float)). */
      isinstance(args, l) {
        if (args.length < 2) {
          throw new ErreurPy("isinstance() veut une valeur et un type.", l, "TypeError");
        }
        const types = args[1].t === "tuple" ? args[1].v : [args[1]];
        /* Un objet est une instance de sa classe ET de chacun de ses
           ancêtres : isinstance(chien, Animal) rend True. */
        const x = args[0];
        if (x.t === "objet") {
          const fam = x.classe.exception ? familleDe(x.classe) : [];
          return Bool(types.some((c) => c.t === "classe" ? x.classe.mro.indexOf(c) >= 0
            : c.t === "native" && (c.nom === "object" || fam.indexOf(c.nom) >= 0)));
        }
        if (x.t === "exception") {
          return Bool(types.some((c) => c.t === "native" && (FAMILLES[x.classe] || []).indexOf(c.nom) >= 0));
        }
        const attendus = types.filter((a) => a.t !== "classe").map((a) => {
          if (a.t !== "native") {
            throw new ErreurPy("isinstance() : le second argument doit être un type "
              + "(int, float, str, bool, list, tuple, set, dict) ou une classe.", l, "TypeError");
          }
          return a.nom;
        });
        const reel = typeNom(x);
        /* En Python, un booléen EST un entier : isinstance(True, int)
           rend True. La bizarrerie est vraie, donc on la garde. */
        return Bool(attendus.some((n) => n === reel
          || (n === "int" && reel === "bool")
          || (n === "float" && reel === "int" && false)));
      },

      /* ── Les exceptions, comme VALEURS ──
         « raise ValueError("port invalide") » appelle ici : la native
         fabrique l'objet, et « raise » le transforme en erreur. Les
         mêmes noms servent après « except ». */
      ValueError(args, l) { return exc("ValueError", args); },
      TypeError(args, l) { return exc("TypeError", args); },
      KeyError(args, l) { return exc("KeyError", args); },
      IndexError(args, l) { return exc("IndexError", args); },
      ZeroDivisionError(args, l) { return exc("ZeroDivisionError", args); },
      NameError(args, l) { return exc("NameError", args); },
      AttributeError(args, l) { return exc("AttributeError", args); },
      FileNotFoundError(args, l) { return exc("FileNotFoundError", args); },
      PermissionError(args, l) { return exc("PermissionError", args); },
      OSError(args, l) { return exc("OSError", args); },
      Exception(args, l) { return exc("Exception", args); },
      /* NotImplementedError : la méthode « à écrire dans la classe
         fille » — le geste de la classe abstraite, en programmation
         objet. */
      NotImplementedError(args, l) { return exc("NotImplementedError", args); },
      RuntimeError(args, l) { return exc("RuntimeError", args); },
      AssertionError(args, l) { return exc("AssertionError", args); },
      LookupError(args, l) { return exc("LookupError", args); },
      ArithmeticError(args, l) { return exc("ArithmeticError", args); },
      EOFError(args, l) { return exc("EOFError", args); },

      /* ── open() ──
         Le disque est en mémoire, et il ne survit pas au programme :
         c'est exactement ce qu'il faut pour un TP, qui écrit son
         fichier puis le relit. Les trois modes du cours : 'r', 'w', 'a'.

         Un fichier absent en lecture lève FileNotFoundError — la vraie
         classe, celle que le TP 9 attrape. */
      open(args, l) {
        const nom = args[0] && args[0].t === "str" ? args[0].v : null;
        if (nom === null) throw new ErreurPy("open() veut un nom de fichier.", l,
          "TypeError");
        const mode = args.length > 1 && args[1].t === "str" ? args[1].v : "r";
        if (["r", "w", "a", "r+", "rt", "wt", "at"].indexOf(mode) < 0) {
          throw new ErreurPy("open() : le mode « " + mode + " » n'est pas géré. "
            + "Les trois du cours sont 'r' (lire), 'w' (écrire en remplaçant) "
            + "et 'a' (ajouter à la fin).", l, "ValueError");
        }
        const lecture = mode[0] === "r";
        if (lecture && !(nom in disque)) {
          throw new ErreurPy("[Errno 2] No such file or directory: '" + nom + "'", l,
            "FileNotFoundError");
        }
        if (mode[0] === "w") disque[nom] = "";
        if (mode[0] === "a" && !(nom in disque)) disque[nom] = "";
        return { t: "fichier", nom, mode: mode[0], pos: 0, ouvert: true };
      },
    };

    function extremum(args, l, quoi, nommes) {
      let el = args;
      if (args.length === 1) el = elements(args[0], l);
      if (!el.length) {
        if (nommes && nommes.default !== undefined) return nommes.default;
        throw new ErreurPy(quoi + "() sur une suite vide.", l, "ValueError");
      }
      /* « max(eleves, key=lambda e: e.note) » : on compare les CLÉS, on
         rend l'élément. À égalité, le premier rencontré gagne. */
      if (nommes && nommes.key && nommes.key.t !== "none") {
        let best = el[0], cb = appeler(nommes.key, [el[0]], Object.create(null), l);
        for (const x of el.slice(1)) {
          const c = appeler(nommes.key, [x], Object.create(null), l);
          if (vrai(comparer(quoi === "min" ? "<" : ">", c, cb, l))) { best = x; cb = c; }
        }
        return best;
      }
      if (el.some((x) => x.t === "objet" || x.t === "tuple" || x.t === "list")) {
        let best = el[0];
        for (const x of el.slice(1)) if (vrai(comparer(quoi === "min" ? "<" : ">", x, best, l))) best = x;
        return best;
      }
      let best = el[0];
      for (const x of el) {
        if (!estNombre(x) && x.t !== "str") {
          throw new ErreurPy(quoi + "() ne compare pas des " + typeNom(x) + ".", l);
        }
        const a = x.t === "str" ? x.v : num(x), b = best.t === "str" ? best.v : num(best);
        if (quoi === "min" ? a < b : a > b) best = x;
      }
      return best;
    }
    function trier(tab, l) {
      const tousTextes = tab.every((x) => x.t === "str");
      const tousNombres = tab.every(estNombre);
      /* Les suites se trient entre elles, élément par élément : c'est ce
         qui permet de trier une liste de tuples — « trier par note, puis
         par nom » sans écrire de clé de tri. */
      const toutesSuites = tab.length > 0
        && tab.every((x) => x.t === "tuple" || x.t === "list");
      if (!tousTextes && !tousNombres && !toutesSuites) {
        throw new ErreurPy("On ne trie pas une suite qui mélange les types.", l,
          "TypeError");
      }
      if (toutesSuites) {
        tab.sort((a, b) => vrai(comparer("<", a, b, l)) ? -1
                         : vrai(comparer("<", b, a, l)) ? 1 : 0);
        return tab;
      }
      tab.sort((a, b) => tousTextes ? (a.v < b.v ? -1 : a.v > b.v ? 1 : 0)
                                    : num(a) - num(b));
      return tab;
    }
    /* Le tri avec « key= » et « reverse= ». Le tri de JavaScript est
       stable, comme celui de Python : à clé égale, l'ordre de départ
       reste — et « reverse=True » le garde aussi, il ne retourne pas
       la liste triée (ce qui inverserait les égalités). */
    function trierAvec(tab, nommes, l) {
      const cle = nommes && nommes.key && nommes.key.t !== "none" ? nommes.key : null;
      const inverse = !!(nommes && nommes.reverse && vrai(nommes.reverse));
      if (!cle && !inverse && !tab.some((x) => x.t === "objet")) return trier(tab, l);
      const cles = cle ? tab.map((x) => appeler(cle, [x], Object.create(null), l)) : tab.slice();
      if (!cle && !tab.some((x) => x.t === "objet")) trier(cles.slice(), l);   /* même contrôle des types */
      const rang = tab.map((_, k) => k);
      rang.sort((i, j) => {
        const c = vrai(comparer("<", cles[i], cles[j], l)) ? -1
                : vrai(comparer("<", cles[j], cles[i], l)) ? 1 : 0;
        return inverse ? -c : c;
      });
      const out = rang.map((k) => tab[k]);
      for (let k = 0; k < out.length; k++) tab[k] = out[k];
      return tab;
    }

    /* Les méthodes des chaînes et des listes — celles du cours. */
    function methode(cible, nom, args, l, nommes) {
      if (cible.t === "str") {
        const s = cible.v;
        /* Le caractère de remplissage, et la largeur : ljust, rjust,
           center. Ce sont elles qui alignent les colonnes d'un tableau
           affiché en console — le menu de 31 des TP de l'année. */
        const largeur = () => {
          if (!args.length || !estNombre(args[0])) {
            throw new ErreurPy(nom + "() veut une largeur entière.", l, "TypeError");
          }
          return num(args[0]);
        };
        const remplir = () => {
          if (args.length < 2) return " ";
          if (args[1].t !== "str" || [...args[1].v].length !== 1) {
            throw new ErreurPy(nom + "() : le caractère de remplissage doit être UN "
              + "caractère.", l, "TypeError");
          }
          return args[1].v;
        };
        /* strip(), lstrip(), rstrip() : les espaces, ou les caractères
           donnés — « "**titre**".strip("*") ». */
        const ote = (cote) => {
          const jeu = args.length && args[0].t === "str" ? args[0].v : null;
          const garde = (c) => (jeu === null ? !/\s/.test(c) : jeu.indexOf(c) < 0);
          const t = [...s];
          let a = 0, b = t.length;
          if (cote !== "d") while (a < b && !garde(t[a])) a++;
          if (cote !== "g") while (b > a && !garde(t[b - 1])) b--;
          return Str(t.slice(a, b).join(""));
        };
        switch (nom) {
          case "upper": return Str(s.toUpperCase());
          case "lower": return Str(s.toLowerCase());
          case "strip": return ote("");
          case "lstrip": return ote("g");
          case "rstrip": return ote("d");
          case "ljust": { const n = largeur(); return Str(s + remplir().repeat(Math.max(0, n - [...s].length))); }
          case "rjust": { const n = largeur(); return Str(remplir().repeat(Math.max(0, n - [...s].length)) + s); }
          /* center() : le surplus impair va À GAUCHE quand la largeur
             est impaire, à droite sinon — la règle exacte de CPython. */
          case "center": {
            const n = largeur(), c = remplir(), marge = n - [...s].length;
            if (marge <= 0) return Str(s);
            const g = Math.floor(marge / 2) + (marge & n & 1);
            return Str(c.repeat(g) + s + c.repeat(marge - g));
          }
          case "zfill": {
            const n = largeur(), signe = /^[+-]/.test(s) ? s[0] : "";
            const corps = signe ? s.slice(1) : s;
            return Str(signe + "0".repeat(Math.max(0, n - s.length)) + corps);
          }
          case "title":
            return Str(s.replace(/[A-Za-zÀ-ɏ]+/g, (m) => m[0].toUpperCase() + m.slice(1).toLowerCase()));
          case "swapcase":
            return Str([...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(""));
          case "isupper": return Bool(/[A-ZÀ-Þ]/.test(s) && s === s.toUpperCase());
          case "islower": return Bool(/[a-zß-ÿ]/.test(s) && s === s.toLowerCase());
          case "isalnum": return Bool(/^[0-9A-Za-zÀ-ɏ]+$/.test(s));
          case "isspace": return Bool(/^\s+$/.test(s));
          case "isnumeric": case "isdecimal": return Bool(/^[0-9]+$/.test(s));
          case "rfind": return Ent(s.lastIndexOf(args[0].v));
          case "index": case "rindex": {
            const k = nom === "index" ? s.indexOf(args[0].v) : s.lastIndexOf(args[0].v);
            if (k < 0) throw new ErreurPy(nom + "() : « " + args[0].v + " » n'est pas dans le "
              + "texte. Pour un -1 au lieu d'une erreur : find().", l, "ValueError");
            return Ent(k);
          }
          case "splitlines": return Lst(s.split(/\r?\n/).filter((p, k, t) => k < t.length - 1 || p !== "").map(Str));
          case "partition": {
            const k = s.indexOf(args[0].v);
            return k < 0 ? Tup([Str(s), Str(""), Str("")])
              : Tup([Str(s.slice(0, k)), Str(args[0].v), Str(s.slice(k + args[0].v.length))]);
          }
          /* "{} a {} ans".format(nom, age) — l'écriture d'avant les
             f-chaînes, encore partout dans les exemples. Mêmes formats. */
          case "format": {
            let auto = 0;
            const sortie = s.replace(/\{\{|\}\}|\{([^{}]*)\}/g, (tout, dedans) => {
              if (tout === "{{") return "{";
              if (tout === "}}") return "}";
              const k = dedans.indexOf(":");
              const champ = k < 0 ? dedans : dedans.slice(0, k);
              const spec = k < 0 ? "" : dedans.slice(k + 1);
              let v;
              if (champ === "") v = args[auto++];
              else if (/^\d+$/.test(champ)) v = args[+champ];
              else {
                const [base, ...suite] = champ.split(".");
                v = nommes && nommes[base];
                for (const a of suite) if (v !== undefined) v = attribut(v, a, l);
              }
              if (v === undefined) {
                throw new ErreurPy("format() : rien pour remplir « {" + dedans + "} ».", l,
                  champ === "" || /^\d+$/.test(champ) ? "IndexError" : "KeyError");
              }
              return spec ? formater(v, spec, l) : ecrire(v);
            });
            return Str(sortie);
          }
          case "split": {
            const sep = args.length && args[0].t !== "none" ? args[0].v : null;
            const max = args.length > 1 ? num(args[1]) : -1;
            let morceaux = (sep === null ? s.trim().split(/\s+/) : s.split(sep))
              .filter((p, k, t) => sep !== null || p !== "" || t.length === 1);
            if (max >= 0 && morceaux.length > max + 1) {
              const joint = sep === null ? " " : sep;
              morceaux = morceaux.slice(0, max).concat([morceaux.slice(max).join(joint)]);
            }
            return Lst(morceaux.map(Str));
          }
          case "join": {
            if (!args.length || args[0].t !== "list") {
              throw new ErreurPy("join() veut une liste.", l);
            }
            for (const e of args[0].v) {
              if (e.t !== "str") {
                throw new ErreurPy("join() : la liste doit ne contenir que des chaînes.", l);
              }
            }
            return Str(args[0].v.map((e) => e.v).join(s));
          }
          case "replace": return Str(s.split(args[0].v).join(args[1].v));
          case "find": return Ent(s.indexOf(args[0].v));
          case "count": return Ent(args[0].v === "" ? s.length + 1
            : s.split(args[0].v).length - 1);
          case "startswith": return Bool(s.startsWith(args[0].v));
          case "endswith": return Bool(s.endsWith(args[0].v));
          case "isdigit": return Bool(/^[0-9]+$/.test(s));
          case "isalpha": return Bool(/^[A-Za-zÀ-ɏ]+$/.test(s));
          case "capitalize": return Str(s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
        }
      }
      if (cible.t === "list") {
        const t = cible.v;
        switch (nom) {
          case "append": t.push(args[0]); return Nul;
          case "pop": {
            if (!t.length) throw new ErreurPy("pop() sur une liste vide.", l);
            const k = args.length ? num(args[0]) : t.length - 1;
            if (k < 0 || k >= t.length) throw new ErreurPy("pop(" + k + ") : hors de la "
              + "liste.", l, "IndexError");
            return t.splice(k, 1)[0];
          }
          case "insert": t.splice(num(args[0]), 0, args[1]); return Nul;
          case "remove": {
            const k = t.findIndex((x) => egal(x, args[0]));
            if (k < 0) throw new ErreurPy("remove() : cette valeur n'est pas dans la "
              + "liste.", l, "ValueError");
            t.splice(k, 1); return Nul;
          }
          case "index": {
            const k = t.findIndex((x) => egal(x, args[0]));
            if (k < 0) throw new ErreurPy("index() : cette valeur n'est pas dans la liste.", l);
            return Ent(k);
          }
          case "count": return Ent(t.filter((x) => egal(x, args[0])).length);
          case "sort": trierAvec(t, nommes, l); return Nul;
          case "reverse": t.reverse(); return Nul;
          case "clear": t.length = 0; return Nul;
          case "copy": return Lst(t.slice());
          case "extend": {
            if (!args.length) throw new ErreurPy("extend() veut une suite.", l);
            for (const e of elements(args[0], l)) t.push(e);
            return Nul;
          }
        }
      }
      /* ── Le TUPLE ──
         Deux méthodes seulement, et c'est tout le sujet du TP 4 : un
         tuple ne se modifie pas. append, remove, sort n'existent PAS, et
         le message le dit en nommant le remplacement — parce que la
         question 3 du TP (« modifier l'OS du serveur ») n'a pas d'autre
         réponse que celle-là. */
      if (cible.t === "tuple") {
        const t2 = cible.v;
        switch (nom) {
          case "count": return Ent(t2.filter((x) => egal(x, args[0])).length);
          case "index": {
            const k = t2.findIndex((x) => egal(x, args[0]));
            if (k < 0) throw new ErreurPy("index() : cette valeur n'est pas dans le "
              + "tuple.", l, "ValueError");
            return Ent(k);
          }
          case "append": case "remove": case "insert": case "pop":
          case "sort": case "clear": case "extend": case "reverse":
            throw new ErreurPy("Un tuple ne se modifie pas : « " + nom + "() » "
              + "n'existe pas sur un tuple. Pour le changer, on en fabrique un "
              + "NOUVEAU — par exemple « t = t[:2] + (\"CentOS\",) + t[3:] » — ou "
              + "l'on prend une liste à la place.", l, "AttributeError");
        }
      }
      /* ── L'ENSEMBLE ── */
      if (cible.t === "set") {
        const m = cible.m;
        const autre = (k) => {
          if (!args.length) throw new ErreurPy(nom + "() veut un argument.", l);
          if (args[k === undefined ? 0 : k].t !== "set") {
            throw new ErreurPy(nom + "() veut un autre ensemble.", l, "TypeError");
          }
          return args[k === undefined ? 0 : k].m;
        };
        switch (nom) {
          case "add": m.set(empreinte(args[0], l), args[0]); return Nul;
          case "remove": {
            const e = empreinte(args[0], l);
            if (!m.has(e)) throw new ErreurPy("remove() : " + repr(args[0])
              + " n'est pas dans l'ensemble. Pour ne pas lever d'erreur : "
              + ".discard().", l, "KeyError");
            m.delete(e); return Nul;
          }
          /* discard() est la question 11 du TP 4 : « supprime le port
             9000 SANS PROVOQUER D'ERREUR ». C'est toute la différence
             avec remove(). */
          case "discard": m.delete(empreinte(args[0], l)); return Nul;
          case "pop": {
            if (!m.size) throw new ErreurPy("pop() sur un ensemble vide.", l, "KeyError");
            const c = m.keys().next().value;
            const v = m.get(c); m.delete(c); return v;
          }
          case "clear": m.clear(); return Nul;
          case "copy": return Ens(new Map(m));
          case "union": {
            const r = new Map(m);
            for (const [k, v] of autre()) r.set(k, v);
            return Ens(r);
          }
          case "intersection": {
            const o = autre(), r = new Map();
            for (const [k, v] of m) if (o.has(k)) r.set(k, v);
            return Ens(r);
          }
          case "difference": {
            const o = autre(), r = new Map();
            for (const [k, v] of m) if (!o.has(k)) r.set(k, v);
            return Ens(r);
          }
          case "symmetric_difference": {
            const o = autre(), r = new Map();
            for (const [k, v] of m) if (!o.has(k)) r.set(k, v);
            for (const [k, v] of o) if (!m.has(k)) r.set(k, v);
            return Ens(r);
          }
          case "issubset": {
            const o = autre();
            for (const k of m.keys()) if (!o.has(k)) return Bool(false);
            return Bool(true);
          }
          case "issuperset": {
            const o = autre();
            for (const k of o.keys()) if (!m.has(k)) return Bool(false);
            return Bool(true);
          }
          case "isdisjoint": {
            const o = autre();
            for (const k of m.keys()) if (o.has(k)) return Bool(false);
            return Bool(true);
          }
          case "update": {
            for (const e of elements(args[0], l)) m.set(empreinte(e, l), e);
            return Nul;
          }
        }
      }
      /* ── Le FICHIER ──
         Attention au nom : « nom » est celui de la MÉTHODE appelée, et
         « cible.nom » celui du fichier. Les confondre est la première
         chose qui casse ici. */
      if (cible.t === "fichier") {
        const f = cible.nom;
        const exige = () => {
          if (!cible.ouvert) {
            throw new ErreurPy("Ce fichier est fermé : « " + nom + "() » après "
              + "close() n'est pas possible.", l, "ValueError");
          }
        };
        const contenu = () => (disque[f] === undefined ? "" : disque[f]);
        switch (nom) {
          case "read": {
            exige();
            if (cible.mode !== "r") {
              throw new ErreurPy("Ce fichier est ouvert en écriture : on n'y lit "
                + "pas.", l, "OSError");
            }
            const s = contenu(), reste = s.slice(cible.pos);
            cible.pos = s.length;
            return Str(reste);
          }
          /* readlines() GARDE le « \n » de chaque ligne : c'est pour
             cela que les TP écrivent .strip() derrière. */
          case "readlines": {
            exige();
            const s = contenu();
            cible.pos = s.length;
            return Lst(s.length ? s.split(/(?<=\n)/).map(Str) : []);
          }
          /* readline() rend une chaîne VIDE à la fin du fichier — et
             c'est ce qui arrête une boucle « while ligne: ». */
          case "readline": {
            exige();
            const s = contenu();
            if (cible.pos >= s.length) return Str("");
            const k = s.indexOf("\n", cible.pos);
            const bout = k < 0 ? s.length : k + 1;
            const ligne = s.slice(cible.pos, bout);
            cible.pos = bout;
            return Str(ligne);
          }
          case "write": {
            exige();
            if (cible.mode === "r") {
              throw new ErreurPy("Ce fichier est ouvert en lecture : on n'y écrit "
                + "pas. Ouvrez-le en mode 'w' ou 'a'.", l, "OSError");
            }
            if (!args.length || args[0].t !== "str") {
              throw new ErreurPy("write() veut du texte. Pour écrire un nombre : "
                + "str(n).", l, "TypeError");
            }
            disque[f] = contenu() + args[0].v;
            return Ent(args[0].v.length);
          }
          case "writelines": {
            exige();
            if (cible.mode === "r") {
              throw new ErreurPy("Ce fichier est ouvert en lecture.", l, "OSError");
            }
            for (const e of elements(args[0], l)) {
              if (e.t !== "str") {
                throw new ErreurPy("writelines() veut des textes.", l, "TypeError");
              }
              disque[f] = contenu() + e.v;
            }
            return Nul;
          }
          case "close": cible.ouvert = false; return Nul;
          case "seek": cible.pos = args.length ? num(args[0]) : 0; return Nul;
          case "tell": return Ent(cible.pos);
        }
      }

      /* ── Le DICTIONNAIRE ── */
      if (cible.t === "dict") {
        const m = cible.m;
        switch (nom) {
          /* .keys(), .values() et .items() rendent ici de vraies listes.
             Python rend des « vues », qui suivent le dictionnaire s'il
             change ; la différence ne se voit que si l'on modifie
             pendant qu'on parcourt — ce qu'on ne doit pas faire. */
          case "keys": return Lst([...m.values()].map((e) => e.cle));
          case "values": return Lst([...m.values()].map((e) => e.val));
          case "items": return Lst([...m.values()].map((e) => Tup([e.cle, e.val])));
          /* .get() : la valeur, ou une valeur de secours au lieu d'une
             erreur. C'est LA méthode qui évite le « KeyError » — et le
             deuxième argument vaut None si on ne le donne pas. */
          case "get": {
            const e = m.get(empreinte(args[0], l));
            return e === undefined ? (args.length > 1 ? args[1] : Nul) : e.val;
          }
          /* .setdefault() lit, et crée si c'est absent. Il remplace le
             « if cle not in d: d[cle] = 0 » qu'on écrit sans cesse pour
             compter. */
          case "setdefault": {
            const c = empreinte(args[0], l);
            if (!m.has(c)) m.set(c, { cle: args[0], val: args.length > 1 ? args[1] : Nul });
            return m.get(c).val;
          }
          case "pop": {
            const c = empreinte(args[0], l);
            if (!m.has(c)) {
              if (args.length > 1) return args[1];
              throw new ErreurPy("pop() : la clé " + repr(args[0])
                + " n'est pas dans le dictionnaire.", l, "KeyError");
            }
            const v = m.get(c).val; m.delete(c); return v;
          }
          case "update": {
            if (!args.length || args[0].t !== "dict") {
              throw new ErreurPy("update() veut un autre dictionnaire.", l, "TypeError");
            }
            for (const [k, e] of args[0].m) m.set(k, { cle: e.cle, val: e.val });
            return Nul;
          }
          case "clear": m.clear(); return Nul;
          case "copy":
            return Dic(new Map([...m].map(([k, e]) => [k, { cle: e.cle, val: e.val }])));
        }
      }
      throw new ErreurPy("Un " + typeNom(cible) + " n'a pas de méthode « " + nom + " ».", l,
        "AttributeError");
    }

    /* Le mini-langage de format, après « : » dans une f-chaîne ou un
       format() : [remplissage][alignement][signe][0][largeur][,][.précision][type].
       « {prix:>8.2f} », « {nom:^12} », « {n:05d} », « {total:,} »,
       « {taux:.1%} ». Un nombre s'aligne à droite, un texte à gauche,
       comme en Python. */
    function formater(v, spec, l) {
      const m = /^(?:(.)?([<>^=]))?([+\- ])?(0)?(\d+)?([,_])?(?:\.(\d+))?([sdfFeEgGxXobc%n])?$/.exec(spec);
      if (!m) throw new ErreurPy("Format « " + spec + " » que je ne sais pas lire.", l, "ValueError");
      let [, rempl, align, signe, zero, larg, millier, prec, genre] = m;
      if (v.t === "objet") v = Str(ecrire(v));
      const estNb = estNombre(v);
      if (!genre) genre = estNb ? (v.t === "float" && prec !== undefined ? "g" : "") : "s";
      if (genre === "n") genre = v.t === "float" ? "g" : "d";
      if ("dxXobc".indexOf(genre) >= 0 && v.t === "float") {
        throw new ErreurPy("Le format « " + genre + " » veut un entier, pas un float : "
          + "« .0f » arrondit un flottant sans décimale.", l, "ValueError");
      }
      if (genre !== "s" && genre !== "" && !estNb) {
        throw new ErreurPy("Le format « " + spec + " » veut un nombre, pas un " + typeNom(v)
          + ".", l, "ValueError");
      }
      let corps;
      if (genre === "s") corps = ecrire(v);
      else if (genre === "") corps = ecrire(v.t === "bool" ? Ent(num(v)) : v);
      else {
        const x = num(v), p = prec === undefined ? 6 : +prec;
        const a = Math.abs(x);
        switch (genre) {
          case "d": corps = String(Math.trunc(a)); break;
          case "f": case "F": corps = a.toFixed(p); break;
          case "%": corps = (a * 100).toFixed(p) + "%"; break;
          case "e": case "E": {
            const t = a.toExponential(p).replace(/e([+-])(\d)$/, "e$10$2");
            corps = genre === "E" ? t.toUpperCase() : t;
            break;
          }
          case "g": case "G": {
            const q = p === 0 ? 1 : p;
            const ex = a === 0 ? 0 : Math.floor(Math.log10(a));
            corps = ex < -4 || ex >= q
              ? a.toExponential(q - 1).replace(/\.?0+e/, "e").replace(/e([+-])(\d)$/, "e$10$2")
              : String(Number(a.toPrecision(q)));
            if (genre === "G") corps = corps.toUpperCase();
            break;
          }
          case "x": corps = a.toString(16); break;
          case "X": corps = a.toString(16).toUpperCase(); break;
          case "o": corps = a.toString(8); break;
          case "b": corps = a.toString(2); break;
          case "c": corps = String.fromCodePoint(a); break;
        }
        if (millier && /^\d/.test(corps)) {
          const [ent, dec] = corps.split(".");
          corps = ent.replace(/\B(?=(\d{3})+(?!\d))/g, millier) + (dec !== undefined ? "." + dec : "");
        }
        const neg = x < 0 || Object.is(x, -0);
        corps = (neg ? "-" : signe === "+" ? "+" : signe === " " ? " " : "") + corps;
      }
      const n = larg ? +larg : 0;
      const lg = [...corps].length;
      if (lg >= n) return corps;
      if (zero && !align) { rempl = "0"; align = "="; }
      const c = rempl || " ";
      align = align || (estNb && genre !== "s" ? ">" : "<");
      const manque = n - lg;
      if (align === "<") return corps + c.repeat(manque);
      if (align === ">") return c.repeat(manque) + corps;
      if (align === "^") return c.repeat(Math.floor(manque / 2)) + corps + c.repeat(manque - Math.floor(manque / 2));
      const sg = /^[+\- ]/.test(corps) ? corps[0] : "";
      return sg + c.repeat(manque) + corps.slice(sg.length);
    }

    function egal(a, b) {
      /* Deux objets sont égaux s'ils sont le MÊME — à moins que leur
         classe n'écrive __eq__, qui dit alors ce qu'« égal » veut dire. */
      if (a.t === "objet" || b.t === "objet") {
        const o = a.t === "objet" ? a : b, autre = o === a ? b : a;
        const r = speciale(o, "__eq__", [autre]);
        if (r !== undefined && !(r.t === "native" && r.nom === "NotImplemented")) return vrai(r);
        return a === b;
      }
      if (a.t === "classe" || b.t === "classe" || a.t === "fonction" || b.t === "fonction") return a === b;
      if (estNombre(a) && estNombre(b)) return num(a) === num(b);
      if (a.t !== b.t) return false;
      if (a.t === "list" || a.t === "tuple") {
        return a.v.length === b.v.length && a.v.every((x, k) => egal(x, b.v[k]));
      }
      /* Deux ensembles sont égaux s'ils ont les mêmes éléments, quel
         que soit l'ordre d'insertion : c'est la définition. */
      if (a.t === "set") {
        if (a.m.size !== b.m.size) return false;
        for (const k of a.m.keys()) if (!b.m.has(k)) return false;
        return true;
      }
      if (a.t === "dict") {
        if (a.m.size !== b.m.size) return false;
        for (const [k, e] of a.m) {
          if (!b.m.has(k) || !egal(e.val, b.m.get(k).val)) return false;
        }
        return true;
      }
      return a.v === b.v;
    }

    /* « a + b » sur des objets : a.__add__(b), et à défaut b.__radd__(a). */
    const DUNDER = { "+": "add", "-": "sub", "*": "mul", "/": "truediv", "//": "floordiv",
                     "%": "mod", "**": "pow", "&": "and", "|": "or", "^": "xor" };
    function binaire(op, a, b, l) {
      if ((a.t === "objet" || b.t === "objet") && DUNDER[op]) {
        if (a.t === "objet") {
          const r = speciale(a, "__" + DUNDER[op] + "__", [b]);
          if (r !== undefined) return r;
        }
        if (b.t === "objet") {
          const r = speciale(b, "__r" + DUNDER[op] + "__", [a]);
          if (r !== undefined) return r;
        }
        throw new ErreurPy("L'opérateur « " + op + " » ne s'applique pas à un " + typeNom(a)
          + " et un " + typeNom(b) + " : la classe n'écrit pas de méthode __" + DUNDER[op]
          + "__.", l, "TypeError");
      }
      /* Les quatre opérations d'ensembles. Elles ne s'appliquent qu'à
         deux ensembles : « {1,2} | [3] » est refusé en Python aussi, et
         le message doit le dire plutôt que de convertir en silence. */
      if ("|&^".indexOf(op) >= 0 || (op === "-" && (a.t === "set" || b.t === "set"))) {
        if (a.t !== "set" || b.t !== "set") {
          throw new ErreurPy("L'opérateur « " + op + " » veut deux ensembles ; ici un "
            + typeNom(a) + " et un " + typeNom(b) + ".", l);
        }
        const m = new Map();
        if (op === "|") { for (const [k, v] of a.m) m.set(k, v); for (const [k, v] of b.m) m.set(k, v); }
        if (op === "&") { for (const [k, v] of a.m) if (b.m.has(k)) m.set(k, v); }
        if (op === "-") { for (const [k, v] of a.m) if (!b.m.has(k)) m.set(k, v); }
        if (op === "^") {
          for (const [k, v] of a.m) if (!b.m.has(k)) m.set(k, v);
          for (const [k, v] of b.m) if (!a.m.has(k)) m.set(k, v);
        }
        return Ens(m);
      }
      if (op === "+" && a.t === "tuple" && b.t === "tuple") return Tup(a.v.concat(b.v));
      if (op === "*" && a.t === "tuple" && estNombre(b)) {
        let out = [];
        for (let k = 0; k < num(b); k++) out = out.concat(a.v);
        return Tup(out);
      }
      /* Le formatage à l'ancienne : « "%.2f" %% x ». Il est partout dans
         les corrigés, et sans lui une ligne juste était refusée. */
      if (op === "%" && a.t === "str") {
        const vals = b.t === "tuple" ? b.v : [b];
        let k = 0;
        const sortie = a.v.replace(/%(-?)(0?)(\d*)(?:\.(\d+))?([sdifg%])/g,
          function (tout, gauche, zero, large, prec, genre) {
            if (genre === "%") return "%";
            if (k >= vals.length) {
              throw new ErreurPy("Il manque une valeur pour « " + tout + " ».", l);
            }
            const x = vals[k++];
            let s;
            if (genre === "s") s = ecrire(x);
            else if (genre === "d" || genre === "i") s = String(Math.trunc(num(x)));
            else s = num(x).toFixed(prec === undefined ? 6 : +prec);
            if (large) {
              const n = +large;
              if (s.length < n) s = gauche ? s.padEnd(n) : s.padStart(n, zero ? "0" : " ");
            }
            return s;
          });
        if (k < vals.length) {
          throw new ErreurPy("« %% » reçoit " + vals.length + " valeur(s) pour " + k
            + " emplacement(s) dans la chaîne.", l);
        }
        return Str(sortie);
      }
      if (op === "+" && a.t === "str" && b.t === "str") return Str(a.v + b.v);
      if (op === "+" && a.t === "list" && b.t === "list") return Lst(a.v.concat(b.v));
      if (op === "*" && a.t === "str" && estNombre(b)) return Str(a.v.repeat(Math.max(0, num(b))));
      if (op === "*" && estNombre(a) && b.t === "str") return Str(b.v.repeat(Math.max(0, num(a))));
      if (op === "*" && a.t === "list" && estNombre(b)) {
        let out = [];
        for (let k = 0; k < num(b); k++) out = out.concat(a.v);
        return Lst(out);
      }
      if (op === "+" && (a.t === "str") !== (b.t === "str")) {
        throw new ErreurPy("On n'additionne pas un " + typeNom(a) + " et un "
          + typeNom(b) + ". Pour coller un nombre à du texte : str(n).", l, "TypeError");
      }
      if (!estNombre(a) || !estNombre(b)) {
        throw new ErreurPy("L'opérateur « " + op + " » ne s'applique pas à un "
          + typeNom(a) + " et un " + typeNom(b) + ".", l, "TypeError");
      }
      const x = num(a), y = num(b);
      const entier = (a.t !== "float") && (b.t !== "float");
      switch (op) {
        case "+": return nombre(x + y, entier);
        case "-": return nombre(x - y, entier);
        case "*": return nombre(x * y, entier);
        case "/":
          if (y === 0) throw new ErreurPy("Division par zéro.", l, "ZeroDivisionError");
          return Flo(x / y);                      /* « / » rend TOUJOURS un flottant */
        case "//":
          if (y === 0) throw new ErreurPy("Division entière par zéro.", l,
            "ZeroDivisionError");
          return nombre(Math.floor(x / y), entier);
        case "%":
          if (y === 0) throw new ErreurPy("Modulo par zéro.", l, "ZeroDivisionError");
          /* Le modulo de Python suit le signe du DIVISEUR : −7 % 3 vaut 2,
             et non −1 comme en C ou en JavaScript. */
          return nombre(x - Math.floor(x / y) * y, entier);
        case "**": {
          const v = Math.pow(x, y);
          return nombre(v, entier && y >= 0);
        }
      }
      throw new ErreurPy("Opérateur inconnu : " + op, l);
    }

    const REFLET = { "<": ["lt", "gt"], ">": ["gt", "lt"], "<=": ["le", "ge"], ">=": ["ge", "le"] };
    function comparer(op, a, b, l) {
      if (op === "==") return Bool(egal(a, b));
      if (op === "!=") {
        if (a.t === "objet") { const r = speciale(a, "__ne__", [b]); if (r !== undefined) return Bool(vrai(r)); }
        return Bool(!egal(a, b));
      }
      /* « a < b » sur des objets : a.__lt__(b), sinon b.__gt__(a). C'est
         ce qui permet de trier une liste d'objets sans clé. */
      if (a.t === "objet" || b.t === "objet") {
        const [direct, reflet] = REFLET[op];
        if (a.t === "objet") { const r = speciale(a, "__" + direct + "__", [b]); if (r !== undefined) return Bool(vrai(r)); }
        if (b.t === "objet") { const r = speciale(b, "__" + reflet + "__", [a]); if (r !== undefined) return Bool(vrai(r)); }
        throw new ErreurPy("On ne compare pas deux « " + typeNom(a) + " » avec « " + op + " » : "
          + "la classe n'écrit pas __" + direct + "__. Pour trier, on donne une clé : "
          + "sorted(liste, key=lambda o: o.attribut).", l, "TypeError");
      }
      if (a.t === "str" && b.t === "str") {
        const r = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
        return Bool(op === "<" ? r < 0 : op === ">" ? r > 0 : op === "<=" ? r <= 0 : r >= 0);
      }
      /* Deux listes ou deux tuples se comparent élément par élément,
         comme deux mots se comparent lettre par lettre : on s'arrête au
         premier qui diffère. C'est ce qui permet de trier une liste de
         tuples, et donc de trier « par nom, puis par prénom » sans rien
         écrire de plus. */
      if ((a.t === "list" || a.t === "tuple") && a.t === b.t) {
        const n = Math.min(a.v.length, b.v.length);
        for (let k = 0; k < n; k++) {
          if (!egal(a.v[k], b.v[k])) {
            return comparer(op, a.v[k], b.v[k], l);
          }
        }
        const x = a.v.length, y = b.v.length;
        return Bool(op === "<" ? x < y : op === ">" ? x > y : op === "<=" ? x <= y : x >= y);
      }
      if (!estNombre(a) || !estNombre(b)) {
        throw new ErreurPy("On ne compare pas un " + typeNom(a) + " et un "
          + typeNom(b) + " avec « " + op + " ».", l, "TypeError");
      }
      const x = num(a), y = num(b);
      return Bool(op === "<" ? x < y : op === ">" ? x > y : op === "<=" ? x <= y : x >= y);
    }

    /* Ce qu'on peut parcourir, et ce que ça donne. Un dictionnaire rend
       ses CLÉS — comme en Python, et c'est la source d'étonnement n° 1 :
       « for x in d » ne donne pas les valeurs. */
    function elements(x, l) {
      if (x.t === "list" || x.t === "tuple") return x.v;
      if (x.t === "str") return x.v.split("").map(Str);
      if (x.t === "set") return [...x.m.values()];
      if (x.t === "dict") return [...x.m.values()].map((e) => e.cle);
      /* « for ligne in fichier » : c'est l'écriture que tous les TP
         emploient, et elle rend les lignes une par une, « \n » compris
         — comme readlines(). */
      if (x.t === "fichier") {
        const s = disque[x.nom] === undefined ? "" : disque[x.nom];
        return s.length ? s.split(/(?<=\n)/).map(Str) : [];
      }
      /* Un objet se parcourt si sa classe le dit : __iter__ rend une
         suite (ici, on accepte qu'elle rende directement une liste). */
      if (x.t === "objet") {
        const it = speciale(x, "__iter__", []);
        if (it !== undefined && it !== x) return elements(it, l);
        throw new ErreurPy("On ne parcourt pas un objet « " + x.classe.nom + " » : sa classe "
          + "n'écrit pas __iter__. Parcourez plutôt la liste qu'il contient.", l, "TypeError");
      }
      throw new ErreurPy("On ne parcourt pas un " + typeNom(x)
        + " : « for » veut une liste, un tuple, une chaîne, un ensemble, "
        + "un dictionnaire ou un range().", l);
    }

    function indexer(cible, idx, l) {
      if (cible.t === "objet") {
        const r = speciale(cible, "__getitem__", [idx]);
        if (r !== undefined) return r;
        throw new ErreurPy("Un objet « " + cible.classe.nom + " » ne s'indexe pas : sa "
          + "classe n'écrit pas __getitem__.", l, "TypeError");
      }
      /* Le dictionnaire s'indexe par sa CLÉ, pas par un rang. Et une
         clé absente lève une erreur — c'est là que .get() prend son
         sens, puisqu'il rend None au lieu de s'arrêter. */
      if (cible.t === "dict") {
        const e = cible.m.get(empreinte(idx, l));
        if (e === undefined) {
          throw new ErreurPy("La clé " + repr(idx) + " n'est pas dans le dictionnaire. "
            + "Pour une valeur par défaut au lieu d'une erreur : .get(" + repr(idx)
            + ").", l, "KeyError");
        }
        return e.val;
      }
      if (cible.t === "set") {
        throw new ErreurPy("Un ensemble ne s'indexe pas : ses éléments n'ont pas "
          + "d'ordre. On le parcourt avec « for », ou on teste avec « in ».", l,
          "TypeError");
      }
      if (!estNombre(idx)) {
        throw new ErreurPy("Un indice est un entier, pas un " + typeNom(idx) + ".", l,
          "TypeError");
      }
      let k = num(idx);
      const n = cible.t === "str" || cible.t === "list" || cible.t === "tuple"
              ? cible.v.length : -1;
      if (n < 0) throw new ErreurPy("Un " + typeNom(cible) + " ne s'indexe pas.", l,
        "TypeError");
      if (k < 0) k += n;
      if (k < 0 || k >= n) {
        throw new ErreurPy("Indice " + num(idx) + " hors de la "
          + (cible.t === "str" ? "chaîne" : cible.t === "tuple" ? "séquence" : "liste")
          + " : elle a " + n
          + " élément" + (n > 1 ? "s" : "") + ", donc les indices vont de 0 à "
          + (n - 1) + ".", l, "IndexError");
      }
      return cible.t === "str" ? Str(cible.v[k]) : cible.v[k];
    }

    /* Poser une valeur dans un ou plusieurs noms. Un seul nom : on pose.
       Plusieurs : la valeur doit être une suite de la bonne longueur, et
       le message le dit quand elle ne l'est pas — c'est l'erreur qu'on
       fait en oubliant .items(). */
    function affecterCible(c, val, env, l) {
      if (c.k === "nom") { poser(env, c.v, val); return; }
      if (c.k === "attribut") { poserAttribut(evaluer(c.e, env), c.nom, val, l); return; }
      if (c.k === "index") { poserCase(evaluer(c.e, env), evaluer(c.i, env), val, l); return; }
      const cibles = c.el;
      if (["tuple", "list", "str", "set", "dict"].indexOf(val.t) < 0) {
        throw new ErreurPy("Il y a " + cibles.length + " noms à gauche, et à droite un "
          + typeNom(val) + " qui ne se découpe pas. Pour parcourir un dictionnaire par "
          + "couples : « for cle, valeur in d.items() ».", l, "TypeError");
      }
      const el = elements(val, l);
      if (el.length !== cibles.length) {
        throw new ErreurPy("Il y a " + cibles.length + " noms à gauche et "
          + el.length + " valeur" + (el.length > 1 ? "s" : "") + " à droite.",
          l, "ValueError");
      }
      cibles.forEach((sous, k) => affecterCible(sous, el[k], env, l));
    }
    function poserCase(cible, idx, val, l) {
      /* La case d'un dictionnaire : « d[cle] = valeur » CRÉE la
         clé si elle n'existe pas. C'est ce qui le distingue d'une
         liste, où l'indice doit déjà être là. */
      if (cible.t === "dict") {
        cible.m.set(empreinte(idx, l), { cle: idx, val });
        return;
      }
      if (cible.t === "objet") {
        if (speciale(cible, "__setitem__", [idx, val]) !== undefined) return;
      }
      if (cible.t === "tuple") {
        throw new ErreurPy("Un tuple ne se modifie pas : « t[" + ecrire(idx)
          + "] = … » est impossible. C'est sa raison d'être — pour changer, "
          + "prenez une liste.", l, "TypeError");
      }
      if (cible.t !== "list") {
        throw new ErreurPy("On ne modifie pas une case d'un " + typeNom(cible)
          + " — une chaîne ne se change pas sur place.", l, "TypeError");
      }
      let k = num(idx);
      if (k < 0) k += cible.v.length;
      if (k < 0 || k >= cible.v.length) {
        throw new ErreurPy("Indice " + num(idx) + " hors de la liste (0 à "
          + (cible.v.length - 1) + ").", l, "IndexError");
      }
      cible.v[k] = val;
    }
    function lireCible(c, env, l) {
      if (c.k === "nom") return evaluer(c, env);
      if (c.k === "attribut") return attribut(evaluer(c.e, env), c.nom, l);
      return indexer(evaluer(c.e, env), evaluer(c.i, env), l);
    }

    /* Une exception Python, telle qu'un « except » la voit. Les classes
       sont rangées en familles : « except Exception » attrape tout, et
       « except LookupError » attrape IndexError comme KeyError. */
    const FAMILLES = {
      ValueError: ["ValueError", "Exception", "BaseException"],
      TypeError: ["TypeError", "Exception", "BaseException"],
      KeyError: ["KeyError", "LookupError", "Exception", "BaseException"],
      IndexError: ["IndexError", "LookupError", "Exception", "BaseException"],
      ZeroDivisionError: ["ZeroDivisionError", "ArithmeticError", "Exception", "BaseException"],
      NameError: ["NameError", "Exception", "BaseException"],
      AttributeError: ["AttributeError", "Exception", "BaseException"],
      FileNotFoundError: ["FileNotFoundError", "OSError", "IOError", "Exception", "BaseException"],
      PermissionError: ["PermissionError", "OSError", "IOError", "Exception", "BaseException"],
      OSError: ["OSError", "IOError", "Exception", "BaseException"],
      StopIteration: ["StopIteration", "Exception", "BaseException"],
      NotImplementedError: ["NotImplementedError", "RuntimeError", "Exception", "BaseException"],
      RuntimeError: ["RuntimeError", "Exception", "BaseException"],
      AssertionError: ["AssertionError", "Exception", "BaseException"],
      LookupError: ["LookupError", "Exception", "BaseException"],
      ArithmeticError: ["ArithmeticError", "Exception", "BaseException"],
      EOFError: ["EOFError", "Exception", "BaseException"],
      Exception: ["Exception", "BaseException"],
    };
    /* La famille d'une exception qu'on a dérivée soi-même : ses classes,
       puis celle de l'exception de base dont elle descend. */
    function familleDe(classe) {
      return classe.mro.map((c) => c.nom).concat(FAMILLES[classe.exception] || ["Exception", "BaseException"]);
    }
    function attrape(leve, classesEcrites) {
      if (!classesEcrites) return true;        /* « except: » tout nu */
      const fam = leve.famille || FAMILLES[leve.classe] || ["Exception", "BaseException"];
      return classesEcrites.some((c) => fam.indexOf(c) >= 0);
    }

    function evaluer(n, env) {
      compter(n.l);
      switch (n.k) {
        case "nombre": return nombre(n.v, n.entier);
        case "constante": return n.v;
        case "chaine": return Str(n.v);
        case "bool": return Bool(n.v);
        case "rien": return Nul;
        case "liste": return Lst(n.el.map((e) => evaluer(e, env)));
        case "tuple": return Tup(n.el.map((e) => evaluer(e, env)));
        case "ensemble": {
          const m = new Map();
          for (const e of n.el) {
            const v = evaluer(e, env);
            /* Le doublon disparaît sans un mot : c'est ce que la
               question 1 du TP 4 fait observer avec « 21, 53, 110,
               443, 21 ». La Map s'en charge toute seule. */
            m.set(empreinte(v, n.l), v);
          }
          return Ens(m);
        }
        case "dico": {
          const m = new Map();
          for (const p of n.paires) {
            const cle = evaluer(p.cle, env);
            m.set(empreinte(cle, n.l), { cle, val: evaluer(p.val, env) });
          }
          return Dic(m);
        }
        case "nom": {
          const v = chercher(env, n.v);
          if (v === undefined) {
            if (NATIVES[n.v] && n.v !== "super") return { t: "native", nom: n.v };
            throw new ErreurPy("La variable « " + n.v + " » n'existe pas encore. "
              + "Elle doit être affectée avant d'être lue.", n.l, "NameError");
          }
          return v;
        }
        case "moins": {
          const v = evaluer(n.e, env);
          if (!estNombre(v)) throw new ErreurPy("Le moins unaire veut un nombre.", n.l);
          return v.t === "float" ? Flo(-num(v)) : Ent(-num(v));
        }
        case "non": return Bool(!vrai(evaluer(n.e, env)));
        case "et": { const g = evaluer(n.g, env); return vrai(g) ? evaluer(n.d, env) : g; }
        case "ou": { const g = evaluer(n.g, env); return vrai(g) ? g : evaluer(n.d, env); }
        case "bin": return binaire(n.op, evaluer(n.g, env), evaluer(n.d, env), n.l);
        case "comp": return comparer(n.op, evaluer(n.g, env), evaluer(n.d, env), n.l);
        case "dans": {
          const a = evaluer(n.g, env), b = evaluer(n.d, env);
          if (b.t === "str") {
            if (a.t !== "str") throw new ErreurPy("« in » dans une chaîne cherche du texte.", n.l);
            return Bool(b.v.indexOf(a.v) >= 0);
          }
          if (b.t === "list" || b.t === "tuple") return Bool(b.v.some((x) => egal(x, a)));
          /* Sur un ensemble et un dictionnaire, « in » ne parcourt
             rien : il calcule l'empreinte et regarde si la case est
             prise. C'est pour cela qu'il reste instantané sur un
             million d'éléments, là où une liste les visite tous. Et sur
             un dictionnaire, « in » cherche une CLÉ — pas une valeur. */
          if (b.t === "set") return Bool(b.m.has(empreinte(a, n.l)));
          if (b.t === "dict") return Bool(b.m.has(empreinte(a, n.l)));
          if (b.t === "objet") {
            const r = speciale(b, "__contains__", [a]);
            if (r !== undefined) return Bool(vrai(r));
            return Bool(elements(b, n.l).some((x) => egal(x, a)));
          }
          throw new ErreurPy("« in » veut une chaîne, une liste, un tuple, un "
            + "ensemble ou un dictionnaire à droite.", n.l);
        }
        case "ternaire":
          return vrai(evaluer(n.cond, env)) ? evaluer(n.oui, env) : evaluer(n.non, env);
        /* « is » : le MÊME objet. Pour les valeurs simples — nombres,
           textes, None, booléens — on compare la valeur, ce qui donne la
           même réponse que Python dans tous les cas qu'un TP rencontre.
           Pour une liste, un dictionnaire ou un ensemble, on compare
           l'identité JavaScript, qui EST l'identité Python. */
        case "memeque": {
          const a = evaluer(n.g, env), b = evaluer(n.d, env);
          if (a.t === "none" || b.t === "none") return Bool(a.t === b.t);
          if (a.t !== b.t) return Bool(false);
          if (["list", "dict", "set", "tuple", "objet", "classe", "fonction"].indexOf(a.t) >= 0) {
            return Bool(a === b);
          }
          return Bool(a.v === b.v);
        }
        case "fchaine": {
          let s = "";
          for (const m of n.morceaux) {
            if (m.k === "chaine") { s += m.v; continue; }
            let v = evaluer(m.e, env);
            if (m.conv === "r") v = Str(repr(v));
            if (!m.format) { s += ecrire(v); continue; }
            /* Le format de la f-chaîne est celui de format() : un seul
               code pour les deux écritures. */
            s += formater(v, m.format, n.l);
          }
          return Str(s);
        }
        case "lambda": {
          const f = { t: "fonction", nom: "<lambda>", params: n.params,
                      corps: [{ k: "retour", e: n.corps, l: n.l }], env: portee(env),
                      defauts: n.params.map((p) => (p.defaut ? evaluer(p.defaut, env) : undefined)),
                      id: ++compteurId };
          return f;
        }
        case "comprehension": {
          /* La compréhension a sa propre portée en Python 3 : la
             variable de boucle ne fuit pas. On lui donne donc un
             environnement fils. Plusieurs « for » s'imbriquent dans
             l'ordre où ils sont écrits. */
          const local = { vars: Object.create(null), parent: env };
          const out = [];
          const m = new Map();
          const tour = (k) => {
            if (k === n.clauses.length) {
              if (n.genre === "dico") {
                const cle = evaluer(n.cle, local);
                m.set(empreinte(cle, n.l), { cle, val: evaluer(n.valeur, local) });
              } else if (n.genre === "ensemble") {
                const v = evaluer(n.valeur, local);
                m.set(empreinte(v, n.l), v);
              } else out.push(evaluer(n.valeur, local));
              return;
            }
            const c = n.clauses[k];
            for (const x of elements(evaluer(c.source, local), n.l)) {
              compter(n.l);
              affecterCible(c.cible, x, local, n.l);
              if (c.filtres.every((f) => vrai(evaluer(f, local)))) tour(k + 1);
            }
          };
          tour(0);
          return n.genre === "dico" ? Dic(m) : n.genre === "ensemble" ? Ens(m) : Lst(out);
        }
        case "index": return indexer(evaluer(n.e, env), evaluer(n.i, env), n.l);
        case "tranche": {
          const c = evaluer(n.e, env);
          const long = c.t === "str" || c.t === "list" || c.t === "tuple"
                     ? c.v.length : -1;
          if (long < 0) throw new ErreurPy("Un " + typeNom(c) + " ne se tranche pas.", n.l,
            "TypeError");
          const pasV = n.pas ? num(evaluer(n.pas, env)) : 1;
          if (pasV === 0) throw new ErreurPy("Le pas d'une tranche ne peut pas être nul.", n.l);
          /* Un pas négatif parcourt à l'envers, et les bornes par défaut
             s'inversent avec lui : « mot[::-1] » renverse, et c'est
             l'idiome que tout le monde écrit. */
          let a = n.a !== null && n.a !== undefined ? num(evaluer(n.a, env))
                : (pasV > 0 ? 0 : long - 1);
          let b = n.b !== null && n.b !== undefined ? num(evaluer(n.b, env))
                : (pasV > 0 ? long : -1);
          if (a < 0 && n.a) a += long;
          if (b < 0 && n.b) b += long;
          const el = c.t === "str" ? c.v.split("") : c.v;
          const out = [];
          if (pasV > 0) {
            a = Math.max(0, Math.min(long, a)); b = Math.max(0, Math.min(long, b));
            for (let k = a; k < b; k += pasV) out.push(el[k]);
          } else {
            a = Math.max(-1, Math.min(long - 1, a)); b = Math.max(-1, Math.min(long, b));
            for (let k = a; k > b; k += pasV) out.push(el[k]);
          }
          return c.t === "str" ? Str(out.join("")) : c.t === "tuple" ? Tup(out) : Lst(out);
        }
        case "attribut": {
          const c = evaluer(n.e, env);
          if (estObjetPy(c)) return attribut(c, n.nom, n.l);
          return { t: "methode", cible: c, nom: n.nom };
        }
        case "appel": {
          const args = [];
          const nommes = Object.create(null);
          for (const a of n.args) {
            if (a.k === "etoile") args.push(...elements(evaluer(a.e, env), n.l));
            else if (a.k === "etoile2") {
              const d = evaluer(a.e, env);
              if (d.t !== "dict") throw new ErreurPy("« ** » veut un dictionnaire.", n.l, "TypeError");
              for (const e of d.m.values()) nommes[ecrire(e.cle)] = e.val;
            } else args.push(evaluer(a, env));
          }
          for (const cle in (n.nommes || {})) nommes[cle] = evaluer(n.nommes[cle], env);
          /* super() : sans argument, comme en Python 3 — il retrouve la
             classe de la méthode en cours et l'objet qu'elle a reçu. */
          if (n.f.k === "nom" && n.f.v === "super" && chercher(env, "super") === undefined) {
            const classe = chercher(env, " classe"), soi = chercher(env, " soi");
            if (!classe || !soi) {
              throw new ErreurPy("super() ne s'emploie que dans une méthode de classe.", n.l,
                "RuntimeError");
            }
            return { t: "super", classe, soi };
          }
          if (n.f.k === "attribut") {
            const cible = evaluer(n.f.e, env);
            if (estObjetPy(cible)) return appeler(attribut(cible, n.f.nom, n.l), args, nommes, n.l, n.f.brut);
            return methode(cible, n.f.nom, args, n.l, nommes);
          }
          const f = evaluer(n.f, env);
          return appeler(f, args, nommes, n.l, n.f.v);
        }
      }
      throw new ErreurPy("Expression que je ne sais pas évaluer.", n.l);
    }

    function executerInstruction(n, env) {
      compter(n.l);
      switch (n.k) {
        case "expression": {
          /* Une valeur calculée et jetée : « Connexion("x") » tout seul
             construit un objet que rien ne garde. */
          const v = evaluer(n.e, env);
          if (avecDel) ramasser([v], []);
          return;
        }
        case "rien-faire": return;
        case "affecter": {
          let val = evaluer(n.val, env);
          if (n.op !== "=") {
            /* L'objet de « self.solde += x » n'est évalué qu'une fois. */
            const c = n.cible;
            const porteur = c.k === "attribut" || c.k === "index" ? evaluer(c.e, env) : null;
            const idx = c.k === "index" ? evaluer(c.i, env) : null;
            const avant = c.k === "nom" ? evaluer(c, env)
              : c.k === "attribut" ? attribut(porteur, c.nom, n.l)
              : indexer(porteur, idx, n.l);
            const op = n.op.slice(0, -1);
            /* « liste += [x] » modifie la liste EN PLACE, comme extend() :
               une autre variable qui la désigne voit le changement. */
            if (op === "+" && avant.t === "list" && val.t === "list") { avant.v.push(...val.v); val = avant; }
            else if (avant.t === "objet" && speciale(avant, "__i" + DUNDER[op] + "__", [val]) !== undefined) {
              val = speciale(avant, "__i" + DUNDER[op] + "__", [val]);
            } else val = binaire(op, avant, val, n.l);
            if (c.k === "nom") poser(env, c.v, val);
            else if (c.k === "attribut") poserAttribut(porteur, c.nom, val, n.l);
            else poserCase(porteur, idx, val, n.l);
            return;
          }
          /* Python affecte dans la portée COURANTE : une affectation dans
             une fonction y crée une locale, même si une globale porte le
             même nom. C'est la règle, et c'est celle qui surprend. */
          affecterCible(n.cible, val, env, n.l);
          for (const c of n.autres || []) affecterCible(c, val, env, n.l);
          return;
        }
        case "si": {
          if (vrai(evaluer(n.cond, env))) { n.corps.forEach((s) => executerInstruction(s, env)); return; }
          for (const b of n.sinonsi) {
            if (vrai(evaluer(b.cond, env))) {
              b.corps.forEach((s) => executerInstruction(s, env));
              return;
            }
          }
          if (n.sinon) n.sinon.forEach((s) => executerInstruction(s, env));
          return;
        }
        case "tantque": {
          while (vrai(evaluer(n.cond, env))) {
            compter(n.l);
            try { n.corps.forEach((s) => executerInstruction(s, env)); }
            catch (e) {
              if (e instanceof Casser) break;
              if (e instanceof Suivant) continue;
              throw e;
            }
          }
          return;
        }
        case "pour": {
          const src = evaluer(n.source, env);
          const el = elements(src, n.l);
          for (const x of el) {
            compter(n.l);
            affecterCible(n.cible, x, env, n.l);
            try { n.corps.forEach((s) => executerInstruction(s, env)); }
            catch (e) {
              if (e instanceof Casser) break;
              if (e instanceof Suivant) continue;
              throw e;
            }
          }
          return;
        }
        /* Une fonction emporte la portée où elle est écrite : c'est ce
           qui permet à une fonction imbriquée — un décorateur — de
           relire les variables de celle qui l'entoure. Ses valeurs par
           défaut sont calculées ICI, une fois, comme en Python. */
        case "def": {
          const f = { t: "fonction", nom: n.nom, params: n.params, corps: n.corps,
                      env: portee(env), id: ++compteurId,
                      defauts: n.params.map((p) => (p.defaut ? evaluer(p.defaut, env) : undefined)) };
          poser(env, n.nom, decorer(f, n, env));
          return;
        }
        case "classe":
          poser(env, n.nom, decorer(creerClasse(n, env), n, env));
          return;
        case "supprimer": {
          for (const c of n.cibles) {
            if (c.k === "nom") {
              if (!(c.v in env.vars)) {
                throw new ErreurPy("« del " + c.v + " » : cette variable n'existe pas ici.",
                  n.l, "NameError");
              }
              const ancien = env.vars[c.v];
              delete env.vars[c.v];
              ramasser([ancien], []);
            } else if (c.k === "attribut") {
              const o = evaluer(c.e, env);
              if (o.t !== "objet" || !(c.nom in o.attrs)) introuvable(o, c.nom, n.l);
              const ancien = o.attrs[c.nom];
              delete o.attrs[c.nom];
              ramasser([ancien], []);
            } else if (c.k === "index") {
              const o = evaluer(c.e, env), idx = evaluer(c.i, env);
              if (o.t === "dict") {
                const k = empreinte(idx, n.l);
                if (!o.m.has(k)) throw new ErreurPy("del : la clé " + repr(idx) + " n'est pas "
                  + "dans le dictionnaire.", n.l, "KeyError");
                const e = o.m.get(k);
                o.m.delete(k);
                ramasser([e.cle, e.val], []);
              } else if (o.t === "list") {
                indexer(o, idx, n.l);                    /* même contrôle de l'indice */
                let k = num(idx); if (k < 0) k += o.v.length;
                ramasser(o.v.splice(k, 1), []);
              } else throw new ErreurPy("del ne retire pas de case d'un " + typeNom(o) + ".", n.l, "TypeError");
            } else {
              const o = evaluer(c.e, env);
              if (o.t !== "list") throw new ErreurPy("del ne coupe qu'une tranche de liste.", n.l, "TypeError");
              /* La tranche est prise sur la liste de ses RANGS : on sait
                 alors exactement quelles cases retirer, doublons compris. */
              const rangs = evaluer(Object.assign({}, c, { e: { k: "constante", v: Lst(o.v.map((_, k) => Ent(k))) } }), env)
                .v.map((x) => x.v).sort((a, b) => b - a);
              const partis = [];
              for (const k of rangs) partis.push(...o.v.splice(k, 1));
              ramasser(partis, []);
            }
          }
          return;
        }
        /* « with » : on entre, on exécute, et l'on SORT quoi qu'il arrive —
           le fichier est fermé même si le bloc lève une erreur. */
        case "avec": {
          const v = evaluer(n.e, env);
          let entree = v;
          if (v.t === "objet") {
            const r = speciale(v, "__enter__", []);
            if (r !== undefined) entree = r;
          }
          if (n.alias) affecterCible(n.alias, entree, env, n.l);
          try {
            n.corps.forEach((s) => executerInstruction(s, env));
          } finally {
            if (v.t === "fichier") v.ouvert = false;
            if (v.t === "objet") speciale(v, "__exit__", [Nul, Nul, Nul]);
          }
          return;
        }
        case "globale": case "nonlocale": {
          const cle = n.k === "globale" ? "globales" : "nonlocales";
          if (!env.parent && n.k === "nonlocale") {
            throw new ErreurPy("« nonlocal » ne s'emploie que dans une fonction imbriquée.", n.l);
          }
          env[cle] = env[cle] || new Set();
          for (const nom of n.noms) env[cle].add(nom);
          return;
        }
        case "affirmer":
          if (!vrai(evaluer(n.cond, env))) {
            throw new ErreurPy(n.msg ? ecrire(evaluer(n.msg, env)) : "AssertionError", n.l,
              "AssertionError");
          }
          return;
        case "essayer": {
          let leve = null;
          try {
            n.essai.forEach((s) => executerInstruction(s, env));
          } catch (e) {
            /* L'attente d'une saisie n'est pas une erreur du programme :
               elle interrompt tout, « finally » compris — le programme sera
               rejoué depuis le début avec la saisie en plus. */
            if (e === ATTENTE) throw e;
            /* Les ruptures de flux — return, break, continue — ne sont
               pas des erreurs : elles traversent le try sans être
               attrapées, comme en Python. */
            if (e instanceof Retour || e instanceof Casser || e instanceof Suivant) {
              if (n.enfin) n.enfin.forEach((s) => executerInstruction(s, env));
              throw e;
            }
            if (!e || !e.estPy) {
              if (n.enfin) n.enfin.forEach((s) => executerInstruction(s, env));
              throw e;
            }
            leve = e;
          }
          if (leve) {
            let pris = false;
            for (const p of n.prises) {
              if (!attrape(leve, p.classe)) continue;
              pris = true;
              /* Une exception qu'on a dérivée soi-même se rend telle
                 quelle : « e.code », ses attributs, sa méthode. */
              if (p.alias) {
                poser(env, p.alias, leve.objet || { t: "exception", classe: leve.classe,
                                                    v: leve.message });
              }
              enTraitement.push(leve);
              try { p.corps.forEach((s) => executerInstruction(s, env)); }
              finally {
                enTraitement.pop();
                if (n.enfin) n.enfin.forEach((s) => executerInstruction(s, env));
              }
              return;
            }
            /* Aucun « except » ne correspond : l'erreur continue sa
               route, après le « finally ». C'est le comportement de
               Python, et c'est ce qui permet d'attraper plus haut. */
            if (!pris) {
              if (n.enfin) n.enfin.forEach((s) => executerInstruction(s, env));
              throw leve;
            }
          }
          if (n.sinon) n.sinon.forEach((s) => executerInstruction(s, env));
          if (n.enfin) n.enfin.forEach((s) => executerInstruction(s, env));
          return;
        }
        case "lever": {
          /* « raise » tout seul, dans un « except » : on relance l'erreur
             qu'on est en train de traiter, telle quelle. */
          if (!n.e && enTraitement.length) throw enTraitement[enTraitement.length - 1];
          if (!n.e) throw new ErreurPy("« raise » tout seul ne peut relancer une erreur "
            + "que dans un « except ».", n.l, "RuntimeError");
          let v = evaluer(n.e, env);
          if (v.t === "exception") throw new ErreurPy(v.v, n.l, v.classe);
          /* « raise NotImplementedError » sans parenthèses : la classe
             seule, qu'on fabrique sans message. */
          if (v.t === "native" && FAMILLES[v.nom]) throw new ErreurPy(v.nom, n.l, v.nom);
          if (v.t === "classe") v = instancier(v, [], Object.create(null), n.l);
          if (v.t === "objet" && v.classe.exception) {
            const e = new ErreurPy(ecrire(v) || v.classe.nom, n.l, v.classe.nom);
            e.objet = v;
            e.famille = familleDe(v.classe);
            throw e;
          }
          /* « raise ValueError("message") » : l'appel a été évalué
             comme une fonction native portant le nom de la classe. */
          throw new ErreurPy("On ne lève qu'une exception — ValueError(…), ou une classe "
            + "dérivée d'Exception ; pas un " + typeNom(v) + ".", n.l, "TypeError");
        }
        case "retour": throw new Retour(n.e ? evaluer(n.e, env) : Nul);
        case "casser": throw new Casser();
        case "suivant": throw new Suivant();
      }
      throw new ErreurPy("Instruction que je ne sais pas exécuter.", n.l);
    }

    const enTraitement = [];
    /* « if __name__ == "__main__": » — le programme est toujours le
       programme principal ici. */
    global.__name__ = Str("__main__");

    try {
      const arbre = analyser(lire(src));
      const env = { vars: global, parent: null };
      for (const st of arbre) executerInstruction(st, env);
      /* La fin du programme : Python vide ses variables dans l'ordre où
         elles sont nées, et chaque objet qui n'est plus désigné passe
         par son __del__. */
      if (avecDel) {
        for (const k of Object.keys(global)) {
          const v = global[k];
          delete global[k];
          ramasser([v], []);
        }
      }
      /* Un « print(..., end="") » en dernière instruction laisse une
         ligne commencée : elle doit sortir, sinon le programme perd son
         affichage final. */
      if (enAttente) { sorties.push(enAttente); if (o.sortie) o.sortie(enAttente); enAttente = ""; }
      return { texte: brut, ok: true, sortie: sorties, operations: pas };
    } catch (e) {
      if (enAttente) { sorties.push(enAttente); enAttente = ""; }
      if (e === ATTENTE) return { texte: brut, ok: false, attente: true, sortie: sorties };
      if (e instanceof Retour) {
        return { texte: brut, ok: false, sortie: sorties,
                 erreur: { message: "« return » hors d'une fonction.", ligne: 0 } };
      }
      if (e instanceof Casser || e instanceof Suivant) {
        return { texte: brut, ok: false, sortie: sorties,
                 erreur: { message: "« break » ou « continue » hors d'une boucle.", ligne: 0 } };
      }
      if (e && e.estPy) {
        return { texte: brut, ok: false, sortie: sorties,
                 erreur: { message: e.message, ligne: e.ligne, classe: e.classe } };
      }
      if (e instanceof RangeError) {
        return { texte: brut, ok: false, sortie: sorties,
                 erreur: { message: "Récursion trop profonde : une fonction s'appelle "
                   + "elle-même sans fin.", ligne: 0 } };
      }
      throw e;
    }
  }

  /* Ce que l'interprète NE fait pas. La liste est affichée dans la page :
     un outil doit savoir se décrire, et celui-ci est un sous-ensemble
     assumé — pas un Python incomplet dont on espère que ça passe. */
  /* Cette liste est AFFICHÉE dans la page : elle doit rester exacte, et
     elle a fondu. Les dictionnaires, les tuples, les ensembles, les
     f-chaînes, les exceptions et les compréhensions sont désormais
     couverts — c'est ce qu'il fallait pour que les TP de l'année
     tournent. Ce qui reste absent l'est pour une raison, et la raison
     est dite. */
  const MANQUES = [
    ["les modules", "pas de « import math » ni de « from … import » : un seul "
      + "fichier à la fois, donc rien à importer. Les fonctions du cours et « ** » "
      + "remplacent math."],
    ["les générateurs", "yield, et les expressions paresseuses"],
  ];

  racine.PYMINI = { executer, MANQUES, version: 1 };
})(typeof window !== "undefined" ? window : globalThis);
