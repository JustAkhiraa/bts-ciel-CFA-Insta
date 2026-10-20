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
   résultat faux. « from … import », les classes, les générateurs, les
   exceptions, les décorateurs : refusés, et nommés.

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
    "del", "is"]);

  const OPS = ["**=", "//=", "...", "**", "//", "==", "!=", "<=", ">=",
    "+=", "-=", "*=", "/=", "%=", "->", "(", ")", "[", "]", "{", "}", ",",
    ":", ".", "+", "-", "*", "/", "%", "<", ">", "=", ";"];

  function ErreurPy(message, ligne) {
    this.message = message;
    this.ligne = ligne;
    this.estPy = true;
  }

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
      const texte = brute;
      while (p < texte.length) {
        const c = texte[p];
        if (c === " " || c === "\t") { p++; continue; }
        if (c === "#") break;
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
    "class": "les classes", "try": "les exceptions (try/except)",
    "except": "les exceptions", "finally": "les exceptions",
    "with": "le bloc with", "lambda": "les fonctions lambda",
    "yield": "les générateurs", "raise": "lever une exception",
    "global": "global", "nonlocal": "nonlocal", "import": "les modules (import)",
    "from": "les modules (from … import)", "assert": "assert", "is": "l'opérateur is",
    "del": "del",
  };

  function analyser(jetons) {
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
          + "conditions, boucles et fonctions.", j.l);
      }
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
      let g = somme();
      while (true) {
        const j = voir();
        if (j.t === "OP" && ["==", "!=", "<", ">", "<=", ">="].indexOf(j.v) >= 0) {
          i++; g = { k: "comp", op: j.v, g, d: somme(), l: j.l };
        } else if (j.t === "MOT" && j.v === "in") {
          i++; g = { k: "dans", g, d: somme(), l: j.l };
        } else if (j.t === "MOT" && j.v === "not" && estMot("in", 1)) {
          i += 2; g = { k: "non", e: { k: "dans", g, d: somme(), l: j.l }, l: j.l };
        } else break;
      }
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
          if (!estOp(")")) {
            args.push(expr());
            while (estOp(",")) { manger("OP"); if (estOp(")")) break; args.push(expr()); }
          }
          manger("OP", ")");
          e = { k: "appel", f: e, args, l };
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
          const nom = manger("NOM").v;
          e = { k: "attribut", e, nom, l };
        } else break;
      }
      return e;
    }
    function primaire() {
      const j = voir();
      refusSiHorsCours(j);
      if (j.t === "NOMBRE") { i++; return { k: "nombre", v: j.v, entier: j.entier, l: j.l }; }
      if (j.t === "CHAINE") { i++; return { k: "chaine", v: j.v, l: j.l }; }
      if (j.t === "NOM") { i++; return { k: "nom", v: j.v, l: j.l }; }
      if (j.t === "MOT" && (j.v === "True" || j.v === "False")) {
        i++; return { k: "bool", v: j.v === "True", l: j.l };
      }
      if (j.t === "MOT" && j.v === "None") { i++; return { k: "rien", l: j.l }; }
      if (estOp("(")) {
        manger("OP"); const e = expr(); manger("OP", ")"); return e;
      }
      if (estOp("[")) {
        const l = manger("OP").l;
        const el = [];
        if (!estOp("]")) {
          el.push(expr());
          while (estOp(",")) { manger("OP"); if (estOp("]")) break; el.push(expr()); }
        }
        manger("OP", "]");
        return { k: "liste", el, l };
      }
      throw new ErreurPy("Je n'attendais pas « " + (j.v !== undefined ? j.v : j.t)
        + " » ici.", j.l);
    }

    /* Les instructions. */
    function bloc() {
      manger("OP", ":");
      manger("FIN");
      manger("INDENT");
      const corps = [];
      while (voir().t !== "DEDENT" && voir().t !== "EOF") corps.push(instruction());
      if (voir().t === "DEDENT") i++;
      if (!corps.length) throw new ErreurPy("Ce bloc est vide.", voir().l);
      return corps;
    }
    function instruction() {
      const j = voir();
      refusSiHorsCours(j);
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
          const nom = manger("NOM").v;
          manger("MOT", "in");
          const source = expr();
          return { k: "pour", nom, source, corps: bloc(), l: j.l };
        }
        if (j.v === "def") {
          i++;
          const nom = manger("NOM").v;
          manger("OP", "(");
          const params = [];
          if (!estOp(")")) {
            do {
              if (estOp(")")) break;
              const p = manger("NOM").v;
              let defaut = null;
              if (estOp("=")) { manger("OP"); defaut = expr(); }
              params.push({ nom: p, defaut });
            } while (estOp(",") && manger("OP"));
          }
          manger("OP", ")");
          return { k: "def", nom, params, corps: bloc(), l: j.l };
        }
        if (j.v === "return") {
          i++;
          const e = (voir().t === "FIN") ? null : expr();
          manger("FIN");
          return { k: "retour", e, l: j.l };
        }
        if (j.v === "break" || j.v === "continue" || j.v === "pass") {
          i++; manger("FIN");
          return { k: j.v === "pass" ? "rien-faire" : j.v === "break" ? "casser" : "suivant",
                   l: j.l };
        }
      }
      /* Affectation, ou simple expression. */
      const cible = expr();
      const o = voir();
      if (o.t === "OP" && ["=", "+=", "-=", "*=", "/=", "//=", "%=", "**="].indexOf(o.v) >= 0) {
        i++;
        const val = expr();
        manger("FIN");
        if (cible.k !== "nom" && cible.k !== "index") {
          throw new ErreurPy("On ne peut affecter qu'à une variable ou à une case de "
            + "liste.", o.l);
        }
        return { k: "affecter", cible, op: o.v, val, l: o.l };
      }
      manger("FIN");
      return { k: "expression", e: cible, l: j.l };
    }

    const prog = [];
    while (voir().t !== "EOF") {
      if (voir().t === "FIN" || voir().t === "INDENT" || voir().t === "DEDENT") { i++; continue; }
      prog.push(instruction());
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

  function nombre(v, entier) { return entier ? Ent(v) : Flo(v); }
  function estNombre(x) { return x.t === "int" || x.t === "float" || x.t === "bool"; }
  function num(x) { return x.t === "bool" ? (x.v ? 1 : 0) : x.v; }

  function vrai(x) {
    if (x.t === "none") return false;
    if (x.t === "bool") return x.v;
    if (x.t === "int" || x.t === "float") return x.v !== 0;
    if (x.t === "str") return x.v.length > 0;
    if (x.t === "list") return x.v.length > 0;
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
      case "fonction": return "<function " + x.nom + ">";
      default: return String(x.v);
    }
  }
  function repr(x) { return x.t === "str" ? "'" + x.v + "'" : ecrire(x); }

  function typeNom(x) {
    return { int: "int", float: "float", str: "str", bool: "bool",
             none: "NoneType", list: "list", fonction: "function" }[x.t] || x.t;
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

    function chercher(env, nom) {
      let e = env;
      while (e) {
        if (nom in e.vars) return e.vars[nom];
        e = e.parent;
      }
      return undefined;
    }
    function poser(env, nom, val) { env.vars[nom] = val; }

    /* Les fonctions natives. Chacune vérifie ses arguments et refuse par
       une phrase : « int('abc') » doit dire pourquoi, pas rendre NaN. */
    const NATIVES = {
      print(args, l) {
        ecrireSortie(args.map(ecrire).join(" "));
        return Nul;
      },
      input(args, l) {
        if (args.length) ecrireSortie(ecrire(args[0]));
        if (lignesLues >= entrees.length) {
          throw new ErreurPy("Le programme demande une saisie, et il n'y en a plus.", l);
        }
        return Str(String(entrees[lignesLues++]));
      },
      len(args, l) {
        const x = args[0];
        if (x.t === "str") return Ent(x.v.length);
        if (x.t === "list") return Ent(x.v.length);
        throw new ErreurPy("len() veut une chaîne ou une liste, pas un "
          + typeNom(x) + ".", l);
      },
      int(args, l) {
        const x = args[0];
        if (x.t === "str") {
          const t = x.v.trim();
          if (!/^[+-]?\d+$/.test(t)) {
            throw new ErreurPy("int('" + x.v + "') : ce texte n'est pas un entier.", l);
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
            throw new ErreurPy("float('" + x.v + "') : ce texte n'est pas un nombre.", l);
          }
          return Flo(v);
        }
        if (estNombre(x)) return Flo(num(x));
        throw new ErreurPy("float() ne sait pas convertir un " + typeNom(x) + ".", l);
      },
      str(args) { return Str(ecrire(args[0])); },
      bool(args) { return Bool(vrai(args[0])); },
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
      min(args, l) { return extremum(args, l, "min"); },
      max(args, l) { return extremum(args, l, "max"); },
      sum(args, l) {
        const x = args[0];
        if (!x || x.t !== "list") throw new ErreurPy("sum() veut une liste.", l);
        let s = 0, flottant = false;
        for (const e of x.v) {
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
        if (x.t === "list") return Lst(x.v.slice());
        if (x.t === "str") return Lst(x.v.split("").map(Str));
        throw new ErreurPy("list() veut une liste ou une chaîne.", l);
      },
      sorted(args, l) {
        const x = args[0];
        if (!x || x.t !== "list") throw new ErreurPy("sorted() veut une liste.", l);
        return Lst(trier(x.v.slice(), l));
      },
      type(args) { return Str("<class '" + typeNom(args[0]) + "'>"); },
    };

    function extremum(args, l, quoi) {
      let el = args;
      if (args.length === 1 && args[0].t === "list") el = args[0].v;
      if (!el.length) throw new ErreurPy(quoi + "() sur une liste vide.", l);
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
      if (!tousTextes && !tousNombres) {
        throw new ErreurPy("On ne trie pas une liste qui mélange les types.", l);
      }
      tab.sort((a, b) => tousTextes ? (a.v < b.v ? -1 : a.v > b.v ? 1 : 0)
                                    : num(a) - num(b));
      return tab;
    }

    /* Les méthodes des chaînes et des listes — celles du cours. */
    function methode(cible, nom, args, l) {
      if (cible.t === "str") {
        const s = cible.v;
        switch (nom) {
          case "upper": return Str(s.toUpperCase());
          case "lower": return Str(s.toLowerCase());
          case "strip": return Str(s.trim());
          case "split": {
            const sep = args.length ? args[0].v : null;
            return Lst((sep === null ? s.trim().split(/\s+/) : s.split(sep))
              .filter((p, k, t) => sep !== null || p !== "" || t.length === 1).map(Str));
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
            if (k < 0 || k >= t.length) throw new ErreurPy("pop(" + k + ") : hors de la liste.", l);
            return t.splice(k, 1)[0];
          }
          case "insert": t.splice(num(args[0]), 0, args[1]); return Nul;
          case "remove": {
            const k = t.findIndex((x) => egal(x, args[0]));
            if (k < 0) throw new ErreurPy("remove() : cette valeur n'est pas dans la liste.", l);
            t.splice(k, 1); return Nul;
          }
          case "index": {
            const k = t.findIndex((x) => egal(x, args[0]));
            if (k < 0) throw new ErreurPy("index() : cette valeur n'est pas dans la liste.", l);
            return Ent(k);
          }
          case "count": return Ent(t.filter((x) => egal(x, args[0])).length);
          case "sort": trier(t, l); return Nul;
          case "reverse": t.reverse(); return Nul;
          case "clear": t.length = 0; return Nul;
          case "copy": return Lst(t.slice());
          case "extend": {
            if (!args.length || args[0].t !== "list") {
              throw new ErreurPy("extend() veut une liste.", l);
            }
            for (const e of args[0].v) t.push(e);
            return Nul;
          }
        }
      }
      throw new ErreurPy("Un " + typeNom(cible) + " n'a pas de méthode « " + nom + " ».", l);
    }

    function egal(a, b) {
      if (estNombre(a) && estNombre(b)) return num(a) === num(b);
      if (a.t !== b.t) return false;
      if (a.t === "list") {
        return a.v.length === b.v.length && a.v.every((x, k) => egal(x, b.v[k]));
      }
      return a.v === b.v;
    }

    function binaire(op, a, b, l) {
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
          + typeNom(b) + ". Pour coller un nombre à du texte : str(n).", l);
      }
      if (!estNombre(a) || !estNombre(b)) {
        throw new ErreurPy("L'opérateur « " + op + " » ne s'applique pas à un "
          + typeNom(a) + " et un " + typeNom(b) + ".", l);
      }
      const x = num(a), y = num(b);
      const entier = (a.t !== "float") && (b.t !== "float");
      switch (op) {
        case "+": return nombre(x + y, entier);
        case "-": return nombre(x - y, entier);
        case "*": return nombre(x * y, entier);
        case "/":
          if (y === 0) throw new ErreurPy("Division par zéro.", l);
          return Flo(x / y);                      /* « / » rend TOUJOURS un flottant */
        case "//":
          if (y === 0) throw new ErreurPy("Division entière par zéro.", l);
          return nombre(Math.floor(x / y), entier);
        case "%":
          if (y === 0) throw new ErreurPy("Modulo par zéro.", l);
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

    function comparer(op, a, b, l) {
      if (op === "==") return Bool(egal(a, b));
      if (op === "!=") return Bool(!egal(a, b));
      if (a.t === "str" && b.t === "str") {
        const r = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
        return Bool(op === "<" ? r < 0 : op === ">" ? r > 0 : op === "<=" ? r <= 0 : r >= 0);
      }
      if (!estNombre(a) || !estNombre(b)) {
        throw new ErreurPy("On ne compare pas un " + typeNom(a) + " et un "
          + typeNom(b) + " avec « " + op + " ».", l);
      }
      const x = num(a), y = num(b);
      return Bool(op === "<" ? x < y : op === ">" ? x > y : op === "<=" ? x <= y : x >= y);
    }

    function indexer(cible, idx, l) {
      if (!estNombre(idx)) {
        throw new ErreurPy("Un indice est un entier, pas un " + typeNom(idx) + ".", l);
      }
      let k = num(idx);
      const n = cible.t === "str" ? cible.v.length : cible.t === "list" ? cible.v.length : -1;
      if (n < 0) throw new ErreurPy("Un " + typeNom(cible) + " ne s'indexe pas.", l);
      if (k < 0) k += n;
      if (k < 0 || k >= n) {
        throw new ErreurPy("Indice " + num(idx) + " hors de la "
          + (cible.t === "str" ? "chaîne" : "liste") + " : elle a " + n
          + " élément" + (n > 1 ? "s" : "") + ", donc les indices vont de 0 à "
          + (n - 1) + ".", l);
      }
      return cible.t === "str" ? Str(cible.v[k]) : cible.v[k];
    }

    function evaluer(n, env) {
      compter(n.l);
      switch (n.k) {
        case "nombre": return nombre(n.v, n.entier);
        case "chaine": return Str(n.v);
        case "bool": return Bool(n.v);
        case "rien": return Nul;
        case "liste": return Lst(n.el.map((e) => evaluer(e, env)));
        case "nom": {
          const v = chercher(env, n.v);
          if (v === undefined) {
            if (NATIVES[n.v]) return { t: "native", nom: n.v };
            throw new ErreurPy("La variable « " + n.v + " » n'existe pas encore. "
              + "Elle doit être affectée avant d'être lue.", n.l);
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
          if (b.t === "list") return Bool(b.v.some((x) => egal(x, a)));
          throw new ErreurPy("« in » veut une chaîne ou une liste à droite.", n.l);
        }
        case "ternaire":
          return vrai(evaluer(n.cond, env)) ? evaluer(n.oui, env) : evaluer(n.non, env);
        case "index": return indexer(evaluer(n.e, env), evaluer(n.i, env), n.l);
        case "tranche": {
          const c = evaluer(n.e, env);
          const long = c.t === "str" ? c.v.length : c.t === "list" ? c.v.length : -1;
          if (long < 0) throw new ErreurPy("Un " + typeNom(c) + " ne se tranche pas.", n.l);
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
          return c.t === "str" ? Str(out.join("")) : Lst(out);
        }
        case "attribut":
          return { t: "methode", cible: evaluer(n.e, env), nom: n.nom };
        case "appel": {
          const args = n.args.map((a) => evaluer(a, env));
          if (n.f.k === "attribut") {
            const cible = evaluer(n.f.e, env);
            return methode(cible, n.f.nom, args, n.l);
          }
          const f = evaluer(n.f, env);
          if (f.t === "native") return NATIVES[f.nom](args, n.l);
          if (f.t !== "fonction") {
            throw new ErreurPy("« " + (n.f.v || "cette valeur") + " » n'est pas une "
              + "fonction.", n.l);
          }
          if (args.length > f.params.length) {
            throw new ErreurPy(f.nom + "() reçoit " + args.length + " argument(s) pour "
              + f.params.length + " paramètre(s).", n.l);
          }
          const local = { vars: Object.create(null), parent: { vars: global, parent: null } };
          f.params.forEach((p, k) => {
            if (k < args.length) local.vars[p.nom] = args[k];
            else if (p.defaut) local.vars[p.nom] = evaluer(p.defaut, local);
            else throw new ErreurPy(f.nom + "() : il manque l'argument « " + p.nom + " ».", n.l);
          });
          try {
            for (const st of f.corps) executerInstruction(st, local);
          } catch (e) {
            if (e instanceof Retour) return e.v;
            throw e;
          }
          return Nul;
        }
      }
      throw new ErreurPy("Expression que je ne sais pas évaluer.", n.l);
    }

    function executerInstruction(n, env) {
      compter(n.l);
      switch (n.k) {
        case "expression": evaluer(n.e, env); return;
        case "rien-faire": return;
        case "affecter": {
          let val = evaluer(n.val, env);
          if (n.op !== "=") {
            const avant = n.cible.k === "nom"
              ? evaluer(n.cible, env)
              : indexer(evaluer(n.cible.e, env), evaluer(n.cible.i, env), n.l);
            val = binaire(n.op.slice(0, -1), avant, val, n.l);
          }
          if (n.cible.k === "nom") {
            /* Python affecte dans la portée COURANTE : une affectation dans
               une fonction y crée une locale, même si une globale porte le
               même nom. C'est la règle, et c'est celle qui surprend. */
            poser(env, n.cible.v, val);
          } else {
            const cible = evaluer(n.cible.e, env);
            const idx = evaluer(n.cible.i, env);
            if (cible.t !== "list") {
              throw new ErreurPy("On ne modifie pas une case d'un " + typeNom(cible)
                + " — une chaîne ne se change pas sur place.", n.l);
            }
            let k = num(idx);
            if (k < 0) k += cible.v.length;
            if (k < 0 || k >= cible.v.length) {
              throw new ErreurPy("Indice " + num(idx) + " hors de la liste (0 à "
                + (cible.v.length - 1) + ").", n.l);
            }
            cible.v[k] = val;
          }
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
          const el = src.t === "list" ? src.v
                   : src.t === "str" ? src.v.split("").map(Str) : null;
          if (!el) {
            throw new ErreurPy("On ne parcourt pas un " + typeNom(src)
              + " : « for » veut une liste, une chaîne ou un range().", n.l);
          }
          for (const x of el) {
            compter(n.l);
            poser(env, n.nom, x);
            try { n.corps.forEach((s) => executerInstruction(s, env)); }
            catch (e) {
              if (e instanceof Casser) break;
              if (e instanceof Suivant) continue;
              throw e;
            }
          }
          return;
        }
        case "def":
          poser(env, n.nom, { t: "fonction", nom: n.nom, params: n.params, corps: n.corps });
          return;
        case "retour": throw new Retour(n.e ? evaluer(n.e, env) : Nul);
        case "casser": throw new Casser();
        case "suivant": throw new Suivant();
      }
      throw new ErreurPy("Instruction que je ne sais pas exécuter.", n.l);
    }

    try {
      const arbre = analyser(lire(src));
      const env = { vars: global, parent: null };
      for (const st of arbre) executerInstruction(st, env);
      return { ok: true, sortie: sorties, operations: pas };
    } catch (e) {
      if (e instanceof Retour) {
        return { ok: false, sortie: sorties,
                 erreur: { message: "« return » hors d'une fonction.", ligne: 0 } };
      }
      if (e instanceof Casser || e instanceof Suivant) {
        return { ok: false, sortie: sorties,
                 erreur: { message: "« break » ou « continue » hors d'une boucle.", ligne: 0 } };
      }
      if (e && e.estPy) {
        return { ok: false, sortie: sorties,
                 erreur: { message: e.message, ligne: e.ligne } };
      }
      if (e instanceof RangeError) {
        return { ok: false, sortie: sorties,
                 erreur: { message: "Récursion trop profonde : une fonction s'appelle "
                   + "elle-même sans fin.", ligne: 0 } };
      }
      throw e;
    }
  }

  /* Ce que l'interprète NE fait pas. La liste est affichée dans la page :
     un outil doit savoir se décrire, et celui-ci est un sous-ensemble
     assumé — pas un Python incomplet dont on espère que ça passe. */
  const MANQUES = [
    ["les modules", "pas de « import math » : utilisez ** et les fonctions du cours"],
    ["les classes", "l'objet est au programme de deuxième année, pas ici"],
    ["les dictionnaires", "les listes couvrent les TP de première année"],
    ["les f-chaînes", "f\"{x}\" n'est pas lu : écrivez \"valeur : \" + str(x)"],
    ["les exceptions", "try / except / raise"],
    ["les générateurs", "yield, et les expressions de liste [x for x in …]"],
  ];

  racine.PYMINI = { executer, MANQUES, version: 1 };
})(typeof window !== "undefined" ? window : globalThis);
