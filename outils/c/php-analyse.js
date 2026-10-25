/* ═══════════════════════════════════════════════════════════════════════
   Le PHP de l'atelier, première moitié : lire le texte d'un fichier .php
   et en faire un arbre. La seconde moitié (php.js) l'exécute.

   Demandé le 24 octobre : PHP dans l'ultra-compilateur, avec un moteur
   « écrit ici ». Le dialecte est celui de PHP 8.3, celui de XAMPP et de
   WAMP aujourd'hui :
     · le HTML autour des balises <?php … ?> et <?= … ?>, le saut de ligne
       mangé après ?> ;
     · les chaînes : '…' brutes, "…" avec $var, $tab[cle], $obj->prop et
       {$expression} dedans, les heredoc <<<FIN et nowdoc <<<'FIN' ;
     · la syntaxe alternative des gabarits (if … : endif; foreach … :
       endforeach;) ;
     · fonctions (types, valeurs par défaut, &$référence, ...$reste,
       arguments nommés), fermetures et fonctions fléchées, classes,
       interfaces, traits, exceptions, match.
   Les fautes de syntaxe sont dites comme PHP les dit : « syntax error,
   unexpected token "}" », « unexpected end of file, expecting "," or ";" »
   — c'est le message que l'étudiant lira sur son XAMPP.
   ═══════════════════════════════════════════════════════════════════════ */
var PHP_ANALYSE = (function () {
  "use strict";

  function ErreurSyntaxe(message, ligne) {
    var e = new Error(message);
    e.syntaxe = true; e.ligne = ligne;
    return e;
  }

  /* ═════════════════════════════ 1. LES JETONS ═════════════════════════ */
  /* { t: "html"|"var"|"id"|"int"|"float"|"str"|"tpl"|"cast"|"op"|"fin", v, ligne }
     « str » : une chaîne sans rien à remplacer ; « tpl » : ses morceaux,
     textes et expressions. */
  var OPS = ["<<=", ">>=", "**=", "...", "<=>", "===", "!==", "??=", "?->",
    "++", "--", "->", "=>", "::", "==", "!=", "<>", "<=", ">=", "&&", "||", "??", "+=", "-=", "*=", "/=",
    ".=", "%=", "&=", "|=", "^=", "<<", ">>", "**",
    "+", "-", "*", "/", "%", "=", "<", ">", "!", ".", "(", ")", "[", "]", "{", "}", ",", ";", "?", ":",
    "&", "|", "^", "~", "@", "$"];
  var CASTS = { int: "int", integer: "int", bool: "bool", boolean: "bool", float: "float", double: "float",
    real: "float", string: "string", binary: "string", array: "array", object: "object", unset: "null" };
  var NOM = /^\\?[A-Za-z_\u0080-￿][\w\u0080-￿]*(?:\\[A-Za-z_\u0080-￿][\w\u0080-￿]*)*/;
  var NOM_VAR = /^[A-Za-z_\u0080-￿][\w\u0080-￿]*/;

  function decouper(src) {
    var j = [], i = 0, n = src.length, ligne = 1;
    var avis = [];   // ce que PHP signale à la compilation (Deprecated)
    var push = function (t, v, l, extra) {
      var x = { t: t, v: v, ligne: l === undefined ? ligne : l };
      if (extra) for (var k in extra) x[k] = extra[k];
      j.push(x);
      return x;
    };
    var compter = function (d, f) { for (var k = d; k < f; k++) if (src.charCodeAt(k) === 10) ligne++; };
    /* Les parenthèses, crochets et accolades ouverts : le lexeur de PHP les
       suit, et c'est lui qui dit « Unmatched '}' » — avant l'analyseur. */
    var pile = [];
    var FERME = { ")": "(", "]": "[", "}": "{" };

    // le HTML jusqu'à la première balise
    function html() {
      var re = /<\?php(?=\s|$)|<\?=/gi;
      re.lastIndex = i;
      var m = re.exec(src);
      var fin = m ? m.index : n;
      if (fin > i) { push("html", src.slice(i, fin)); compter(i, fin); }
      if (!m) { i = n; return; }
      i = fin + m[0].length;
      if (m[0] === "<?=") push("id", "echo", ligne, { synth: true });
      else {
        // « <?php » suivi d'un saut de ligne : il fait partie de la balise
        if (src[i] === "\n") { ligne++; i++; }
        else if (src[i] === "\r" && src[i + 1] === "\n") { ligne++; i += 2; }
      }
    }
    html();
    while (i < n) {
      var c = src[i];
      if (c === "\n") { ligne++; i++; continue; }
      if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v") { i++; continue; }
      // ?> : fin d'instruction, et retour au HTML (le saut de ligne qui suit est mangé)
      if (c === "?" && src[i + 1] === ">") {
        push("op", ";", ligne, { ferme: true });
        i += 2;
        if (src[i] === "\n") { ligne++; i++; } else if (src[i] === "\r" && src[i + 1] === "\n") { ligne++; i += 2; }
        html();
        continue;
      }
      // les commentaires
      if ((c === "#" && src[i + 1] !== "[") || (c === "/" && src[i + 1] === "/")) {
        while (i < n && src[i] !== "\n" && !(src[i] === "?" && src[i + 1] === ">")) i++;
        continue;
      }
      if (c === "#" && src[i + 1] === "[") {
        // un attribut #[…] : ignoré, comme il ne change rien à l'exécution
        var prof = 0;
        while (i < n) { if (src[i] === "[") prof++; else if (src[i] === "]") { prof--; if (!prof) { i++; break; } } else if (src[i] === "\n") ligne++; i++; }
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        var f = src.indexOf("*/", i + 2);
        if (f < 0) throw ErreurSyntaxe("Unterminated comment starting line " + ligne, ligne);
        compter(i, f + 2); i = f + 2;
        continue;
      }
      var d = i, l0 = ligne;
      // les variables
      if (c === "$" && NOM_VAR.test(src.slice(i + 1, i + 2) || "")) {
        var nv = NOM_VAR.exec(src.slice(i + 1))[0];
        push("var", nv); i += 1 + nv.length;
        continue;
      }
      // les nombres
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
        var mn = /^(?:0[xX][0-9a-fA-F]+(?:_[0-9a-fA-F]+)*|0[bB][01]+(?:_[01]+)*|0[oO][0-7]+(?:_[0-7]+)*|(?:\d+(?:_\d+)*)?\.?\d+(?:_\d+)*(?:[eE][+-]?\d+(?:_\d+)*)?|\d+(?:_\d+)*\.(?:[eE][+-]?\d+)?)/.exec(src.slice(i));
        var brut = mn[0], net = brut.replace(/_/g, "");
        i += brut.length;
        if (/^0[xX]/.test(net)) entier(parseInt(net.slice(2), 16), brut);
        else if (/^0[bB]/.test(net)) entier(parseInt(net.slice(2), 2), brut);
        else if (/^0[oO]/.test(net)) entier(parseInt(net.slice(2), 8), brut);
        else if (/[.eE]/.test(net)) push("float", parseFloat(net), l0, { brut: brut });
        else if (/^0\d/.test(net)) { if (/[89]/.test(net)) throw ErreurSyntaxe("Invalid numeric literal", l0); entier(parseInt(net, 8), brut); }
        else entier(parseFloat(net), brut);
        continue;
      }
      // les noms (mots-clés, fonctions, classes, constantes), avec leur espace de noms
      if (/[A-Za-z_\u0080-￿\\]/.test(c)) {
        var mm = NOM.exec(src.slice(i));
        if (mm) {
          // (int) et ses cousins ont été pris plus bas ; ici, un nom
          var plein = mm[0];
          push("id", plein.replace(/^\\/, "").split("\\").pop(), l0, { plein: plein });
          i += plein.length;
          continue;
        }
      }
      // les transtypages : ( int ), (string)…
      if (c === "(") {
        var mc = /^\(\s*([A-Za-z]+)\s*\)/.exec(src.slice(i, i + 20));
        if (mc && CASTS[mc[1].toLowerCase()]) { push("cast", CASTS[mc[1].toLowerCase()], l0, { brut: mc[0] }); i += mc[0].length; continue; }
      }
      // les chaînes
      if (c === "'") { simple(); continue; }
      if (c === '"') { double(); continue; }
      if (c === "`") { // l'exécution de commandes n'existe pas ici
        var fb = src.indexOf("`", i + 1);
        throw ErreurSyntaxe("syntax error, unexpected token \"`\" (shell_exec is disabled in the atelier)", ligne);
      }
      if (c === "<" && src.startsWith("<<<", i)) { heredoc(); continue; }
      // les opérateurs
      var op = null;
      for (var k = 0; k < OPS.length; k++) if (src.startsWith(OPS[k], i)) { op = OPS[k]; break; }
      if (op) {
        if (op === "(" || op === "[" || op === "{") pile.push({ c: op, ligne: ligne });
        else if (FERME[op]) {
          var haut = pile.pop();
          if (!haut) { push("faute", "Unmatched '" + op + "'"); break; }
          if (haut.c !== FERME[op]) { push("faute", "Unclosed '" + haut.c + "'" + (haut.ligne !== ligne ? " on line " + haut.ligne : "") + " does not match '" + op + "'"); break; }
        }
        push("op", op); i += op.length; continue;
      }
      throw ErreurSyntaxe("syntax error, unexpected character 0x" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"), ligne);
    }
    var dernier = j[j.length - 1];
    if (!dernier || dernier.t !== "faute") push("fin", null, undefined, { ouverts: pile.slice() });
    return { jetons: j, avis: avis };

    function entier(v, brut) {
      // au-delà de PHP_INT_MAX, un entier écrit devient un flottant
      if (v > 9223372036854775807) push("float", v, l0, { brut: brut });
      else push("int", v, l0, { brut: brut });
    }
    function simple() {
      var s = "", k = i + 1;
      while (k < n && src[k] !== "'") {
        if (src[k] === "\\" && (src[k + 1] === "'" || src[k + 1] === "\\")) { s += src[k + 1]; k += 2; continue; }
        s += src[k]; k++;
      }
      if (k >= n) throw ErreurSyntaxe("syntax error, unexpected string content \"" + s.split("\n")[0] + "\"", ligne);
      push("str", s, ligne, { guillemets: "single-quoted" });
      compter(i, k + 1); i = k + 1;
    }
    function ligneFin() { var l = ligne; for (var k = i; k < n; k++) if (src[k] === "\n") l++; return l; }
    function double() {
      var l0 = ligne;
      var r = morceaux(i + 1, '"', l0);
      if (r.fin >= n) throw ErreurSyntaxe("syntax error, unexpected end of file, expecting variable or \"${\" or \"{$\"", ligneFin());
      compter(i, r.fin + 1);
      i = r.fin + 1;
      if (r.parts.length === 0) push("str", "", l0, { guillemets: "double-quoted" });
      else if (r.parts.length === 1 && typeof r.parts[0] === "string") push("str", r.parts[0], l0, { guillemets: "double-quoted" });
      else push("tpl", r.parts, l0);
    }
    /* Les morceaux d'une chaîne interprétée, jusqu'au guillemet (ou jusqu'à
       la fin du texte pour un heredoc) : du texte, et des expressions. */
    function morceaux(k, fermant, lDebut) {
      var parts = [], s = "", lg = lDebut;
      var poser = function () { if (s) { parts.push(s); s = ""; } };
      while (k < n) {
        var x = src[k];
        if (fermant && x === fermant) break;
        if (x === "\n") lg++;
        if (x === "\\") {
          var y = src[k + 1];
          var simples = { n: "\n", t: "\t", r: "\r", v: "\v", e: "\x1b", f: "\f", "\\": "\\", $: "$" };
          if (fermant === '"' && y === '"') { s += '"'; k += 2; continue; }
          if (simples[y] !== undefined) { s += simples[y]; k += 2; continue; }
          var mo = /^[0-7]{1,3}/.exec(src.slice(k + 1, k + 4));
          if (mo) { s += String.fromCharCode(parseInt(mo[0], 8) & 255); k += 1 + mo[0].length; continue; }
          var mx = /^x([0-9a-fA-F]{1,2})/.exec(src.slice(k + 1, k + 4));
          if (mx) { s += String.fromCharCode(parseInt(mx[1], 16)); k += 1 + mx[0].length; continue; }
          var mu = /^u\{([0-9a-fA-F]+)\}/.exec(src.slice(k + 1, k + 12));
          if (mu) { s += String.fromCodePoint(parseInt(mu[1], 16)); k += 1 + mu[0].length; continue; }
          s += "\\"; k++;
          continue;
        }
        if (x === "$" && NOM_VAR.test(src[k + 1] || "")) {
          poser();
          var nom = NOM_VAR.exec(src.slice(k + 1))[0];
          var noeud = { t: "var", nom: nom, ligne: lg };
          k += 1 + nom.length;
          if (src[k] === "[") {
            // $tab[cle] : une clé sans guillemets est un TEXTE ; un nombre, un entier ; $i, une variable
            var mk = /^\[(?:(-?\d+)|([A-Za-z_\u0080-￿][\w\u0080-￿]*)|\$([A-Za-z_\u0080-￿][\w\u0080-￿]*))\]/.exec(src.slice(k));
            if (mk) {
              var cle = mk[1] !== undefined ? (/^-?(0|[1-9]\d*)$/.test(mk[1]) ? { t: "int", v: +mk[1] } : { t: "str", v: mk[1] })
                : mk[2] !== undefined ? { t: "str", v: mk[2] } : { t: "var", nom: mk[3], ligne: lg };
              noeud = { t: "idx", base: noeud, cle: cle, ligne: lg };
              k += mk[0].length;
            }
          } else if (src[k] === "-" && src[k + 1] === ">" && NOM_VAR.test(src[k + 2] || "")) {
            var np = NOM_VAR.exec(src.slice(k + 2))[0];
            noeud = { t: "prop", obj: noeud, nom: np, ligne: lg };
            k += 2 + np.length;
          } else if (src[k] === "?" && src[k + 1] === "-" && src[k + 2] === ">" && NOM_VAR.test(src[k + 3] || "")) {
            var np2 = NOM_VAR.exec(src.slice(k + 3))[0];
            noeud = { t: "prop", obj: noeud, nom: np2, nullsafe: true, ligne: lg };
            k += 3 + np2.length;
          }
          parts.push(noeud);
          continue;
        }
        if (x === "{" && src[k + 1] === "$") {
          poser();
          var fin = accoladeFermante(k);
          parts.push({ t: "source", src: src.slice(k + 1, fin), ligne: lg });
          for (var q = k; q < fin; q++) if (src[q] === "\n") lg++;
          k = fin + 1;
          continue;
        }
        if (x === "$" && src[k + 1] === "{") {
          poser();
          var fin2 = accoladeFermante(k + 1);
          var dedans = src.slice(k + 2, fin2);
          var noeud2 = NOM_VAR.test(dedans) && NOM_VAR.exec(dedans)[0] === dedans ? { t: "var", nom: dedans, ligne: lg } : { t: "source", src: "${" + dedans + "}", ligne: lg };
          noeud2.deprec = "Using \\${var} in strings is deprecated, use {$var} instead";
          parts.push(noeud2);
          k = fin2 + 1;
          continue;
        }
        s += x; k++;
      }
      poser();
      return { parts: parts, fin: k };
    }
    function accoladeFermante(k) {
      var prof = 0;
      for (var q = k; q < n; q++) {
        var ch = src[q];
        if (ch === "'" || ch === '"') { var g = ch; q++; while (q < n && src[q] !== g) { if (src[q] === "\\") q++; q++; } continue; }
        if (ch === "{") prof++;
        else if (ch === "}") { prof--; if (!prof) return q; }
      }
      throw ErreurSyntaxe("syntax error, unexpected end of file", ligneFin());
    }
    function heredoc() {
      var m = /^<<<[ \t]*(["']?)([A-Za-z_\u0080-￿][\w\u0080-￿]*)\1\r?\n/.exec(src.slice(i));
      if (!m) { push("op", "<<"); i += 2; return; }
      var id = m[2], nowdoc = m[1] === "'";
      var debut = i + m[0].length, l0 = ligne;
      // la ligne de fermeture : l'identifiant, précédé d'espaces, suivi d'autre chose qu'un caractère de nom
      var re = new RegExp("(^|\\n)([ \\t]*)" + id + "(?![\\w\\u0080-\\uffff])", "g");
      re.lastIndex = debut - 1;
      var f = re.exec(src);
      if (!f) throw ErreurSyntaxe("syntax error, unexpected end of file", ligneFin());
      var corpsFin = f.index + (f[1] ? 0 : 0);   // le \n avant la ligne de fermeture n'est pas dans la chaîne
      if (corpsFin < debut) corpsFin = debut;
      var alinea = f[2];
      var corps = src.slice(debut, corpsFin);
      if (alinea) corps = corps.split("\n").map(function (lg) { return lg.startsWith(alinea) ? lg.slice(alinea.length) : lg.replace(/^[ \t]+/, ""); }).join("\n");
      ligne++;
      if (nowdoc) push("str", corps, l0, { guillemets: "nowdoc" });
      else {
        // on relit le corps comme une chaîne entre guillemets, sans guillemet fermant
        var sauve = { src: src, n: n };
        var r = (function () { src = corps; n = corps.length; try { return morceaux(0, null, ligne); } finally { src = sauve.src; n = sauve.n; } })();
        if (r.parts.length === 0) push("str", "", l0, { guillemets: "heredoc" });
        else if (r.parts.length === 1 && typeof r.parts[0] === "string") push("str", r.parts[0], l0, { guillemets: "heredoc" });
        else push("tpl", r.parts, l0);
      }
      compter(i, f.index + f[0].length);
      ligne--;      // la ligne d'ouverture a été comptée deux fois
      i = f.index + f[0].length;
    }
  }

  /* ═════════════════════════════ 2. L'ARBRE ════════════════════════════ */
  var MOTS = ("abstract and array as break callable case catch class clone const continue declare default do echo else " +
    "elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function " +
    "global goto if implements include include_once instanceof insteadof interface isset list match namespace new or " +
    "print private protected public readonly require require_once return static switch throw trait try unset use var " +
    "while xor yield enum").split(" ");
  var EST_MOT = {};
  MOTS.forEach(function (m) { EST_MOT[m] = true; });
  var AFFECTATIONS = { "=": 1, "+=": 1, "-=": 1, "*=": 1, "/=": 1, ".=": 1, "%=": 1, "**=": 1, "??=": 1, "&=": 1, "|=": 1, "^=": 1, "<<=": 1, ">>=": 1 };
  var BINAIRES = {
    "or": [1, "g"], "xor": [2, "g"], "and": [3, "g"],
    "??": [6, "d"], "||": [7, "g"], "&&": [8, "g"], "|": [9, "g"], "^": [10, "g"], "&": [11, "g"],
    "==": [12, "n"], "!=": [12, "n"], "<>": [12, "n"], "===": [12, "n"], "!==": [12, "n"], "<=>": [12, "n"],
    "<": [13, "n"], "<=": [13, "n"], ">": [13, "n"], ">=": [13, "n"],
    ".": [14, "g"], "<<": [15, "g"], ">>": [15, "g"], "+": [16, "g"], "-": [16, "g"],
    "*": [17, "g"], "/": [17, "g"], "%": [17, "g"], "instanceof": [18, "n"], "**": [20, "d"],
  };
  var P_TERNAIRE = 5, P_AFFECT = 4;

  function Analyseur(src, fichier) {
    var d = decouper(src);
    this.j = d.jetons; this.avis = d.avis;
    this.i = 0; this.src = src; this.fichier = fichier || "index.php";
  }
  var A = Analyseur.prototype;
  A.voir = function (k) {
    var x = this.j[Math.min(this.i + (k || 0), this.j.length - 1)];
    if (x.t === "faute") throw ErreurSyntaxe(x.v, x.ligne);
    return x;
  };
  A.prendre = function () { return this.j[this.i++]; };
  A.estOp = function (o, k) { var x = this.voir(k); return x.t === "op" && x.v === o; };
  A.estMot = function (m, k) { var x = this.voir(k); return x.t === "id" && x.v.toLowerCase() === m; };
  A.op = function (o) { if (this.estOp(o)) { this.i++; return true; } return false; };
  A.mot = function (m) { if (this.estMot(m)) { this.i++; return true; } return false; };
  /* « unexpected … » : chaque sorte de jeton a sa façon d'être nommée. */
  function decrire(x) {
    switch (x.t) {
      case "fin": return "end of file";
      case "var": return "variable \"$" + x.v + "\"";
      case "int": return "integer \"" + (x.brut || x.v) + "\"";
      case "float": return "floating-point number \"" + (x.brut || x.v) + "\"";
      case "str": return (x.guillemets === "single-quoted" ? "single-quoted string" : x.guillemets === "double-quoted" ? "double-quoted string" : "string content") + " \"" + x.v + "\"";
      case "tpl": return "token \"\"\"";
      case "html": return "token \"?>\"";
      case "cast": return "token \"(" + x.v + ")\"";
      case "id": return EST_MOT[x.v.toLowerCase()] ? "token \"" + x.v.toLowerCase() + "\"" : "identifier \"" + x.v + "\"";
      case "op": return x.ferme ? "token \"?>\"" : "token \"" + x.v + "\"";
    }
    return "token";
  }
  A.erreur = function (attendu, x) {
    x = x || this.voir();
    var l = x.ligne;
    if (x.t === "fin") {
      l = this.ligneFin();
      // au bout du fichier avec une accolade encore ouverte : PHP le dit ainsi
      if (x.ouverts && x.ouverts.length) { var o = x.ouverts[x.ouverts.length - 1]; return ErreurSyntaxe("Unclosed '" + o.c + "' on line " + o.ligne, l); }
    }
    return ErreurSyntaxe("syntax error, unexpected " + decrire(x) + (attendu ? ", expecting " + attendu : ""), l);
  };
  A.ligneFin = function () { var l = 1; for (var k = 0; k < this.src.length; k++) if (this.src.charCodeAt(k) === 10) l++; return l; };
  A.exigerOp = function (o, attendu) { if (!this.op(o)) throw this.erreur(attendu === false ? null : attendu || "\"" + o + "\""); };
  A.exigerMot = function (m) { if (!this.mot(m)) throw this.erreur("\"" + m + "\""); };
  A.finInstruction = function (attendu) {
    if (this.op(";")) return;
    throw this.erreur(attendu || null);
  };
  A.nom = function () {
    var x = this.voir();
    if (x.t !== "id") throw this.erreur("identifier");
    this.i++;
    return x.v;
  };

  /* ── le fichier, les instructions ── */
  A.fichierEntier = function () {
    var corps = [];
    while (this.voir().t !== "fin") {
      if (this.estOp("}")) throw ErreurSyntaxe("Unmatched '}'", this.voir().ligne);
      corps.push(this.instruction());
    }
    return { t: "fichier", corps: corps, avis: this.avis, fichier: this.fichier };
  };
  A.bloc = function () {
    this.exigerOp("{");
    var corps = [];
    while (!this.estOp("}")) {
      if (this.voir().t === "fin") throw this.erreur();
      corps.push(this.instruction());
    }
    this.i++;
    return corps;
  };
  /* Le corps d'une structure : un bloc { }, une seule instruction, ou la
     syntaxe alternative « : … endif; ». */
  A.corps = function (fins) {
    if (this.estOp(":") && fins) {
      this.i++;
      var corps = [];
      while (!fins.some(function (f) { return this.estMot(f); }, this)) {
        if (this.voir().t === "fin") throw this.erreur();
        corps.push(this.instruction());
      }
      return { alt: true, corps: corps };
    }
    if (this.estOp("{")) return { corps: this.bloc() };
    return { corps: [this.instruction()] };
  };
  A.instruction = function () {
    var x = this.voir(), l = x.ligne;
    if (x.t === "html") { this.i++; return { t: "html", v: x.v, ligne: l }; }
    if (x.t === "op") {
      if (x.v === ";") { this.i++; return { t: "rien", ligne: l }; }
      if (x.v === "{") return { t: "bloc", corps: this.bloc(), ligne: l };
    }
    if (x.t === "id" && !this.estOp("::", 1) && !this.estOp("(", 1) || (x.t === "id" && /^(if|while|for|foreach|switch|echo|return|print|unset|isset|empty|list|array|exit|die|include|include_once|require|require_once|elseif|fn|function|static|match|declare|catch)$/i.test(x.v) && this.estOp("(", 1))) {
      var m = x.v.toLowerCase();
      switch (m) {
        case "echo": return this.echo();
        case "if": return this.si();
        case "while": return this.tantQue();
        case "do": return this.faire();
        case "for": return this.pour();
        case "foreach": return this.pourChaque();
        case "switch": return this.selon();
        case "break": case "continue": {
          this.i++;
          var nb = 1;
          if (this.voir().t === "int") nb = this.prendre().v;
          this.finInstruction();
          return { t: m, n: nb, ligne: l };
        }
        case "return": {
          this.i++;
          var e = null;
          if (!this.estOp(";") && this.voir().t !== "fin") e = this.expr();
          this.finInstruction();
          return { t: "return", e: e, ligne: l };
        }
        case "function":
          if (this.voir(1).t === "id" || (this.estOp("&", 1) && this.voir(2).t === "id")) return this.fonction();
          break;
        case "abstract": case "final": case "class": case "readonly":
          if (m !== "readonly" || this.estMot("class", 1) || this.estMot("final", 1) || this.estMot("abstract", 1)) return this.classe();
          break;
        case "interface": return this.interfaceDecl();
        case "trait": return this.traitDecl();
        case "enum": if (this.voir(1).t === "id") return this.enumDecl(); break;
        case "try": return this.essayer();
        case "throw": {
          this.i++;
          var te = this.expr();
          this.finInstruction();
          return { t: "throw", e: te, ligne: l };
        }
        case "global": {
          this.i++;
          var noms = [];
          do { var v = this.voir(); if (v.t !== "var") throw this.erreur("variable"); this.i++; noms.push(v.v); } while (this.op(","));
          this.finInstruction();
          return { t: "global", noms: noms, ligne: l };
        }
        case "static":
          if (this.voir(1).t === "var") {
            this.i++;
            var vars = [];
            do {
              var sv = this.voir(); if (sv.t !== "var") throw this.erreur("variable"); this.i++;
              vars.push({ nom: sv.v, init: this.op("=") ? this.expr() : null });
            } while (this.op(","));
            this.finInstruction();
            return { t: "static", vars: vars, ligne: l };
          }
          break;
        case "unset": {
          this.i++;
          this.exigerOp("(");
          var cibles = [];
          if (!this.estOp(")")) do { if (this.estOp(")")) break; cibles.push(this.expr()); } while (this.op(","));
          this.exigerOp(")");
          this.finInstruction();
          return { t: "unset", cibles: cibles, ligne: l };
        }
        case "namespace": {
          this.i++;
          if (this.voir().t === "id") this.i++;
          if (this.estOp("{")) return { t: "bloc", corps: this.bloc(), ligne: l };
          this.finInstruction();
          return { t: "rien", ligne: l };
        }
        case "use": {
          this.i++;
          // use Un\Espace\Classe [as Alias], …; — les espaces de noms ne sont pas suivis ici
          while (!this.estOp(";") && this.voir().t !== "fin") this.i++;
          this.finInstruction();
          return { t: "rien", ligne: l };
        }
        case "const": {
          this.i++;
          var cs = [];
          do { var cn = this.nom(); this.exigerOp("="); cs.push({ nom: cn, e: this.expr() }); } while (this.op(","));
          this.finInstruction();
          return { t: "const", consts: cs, ligne: l };
        }
        case "declare": {
          this.i++;
          this.exigerOp("(");
          var dir = {};
          do { var dn = this.nom().toLowerCase(); this.exigerOp("="); dir[dn] = this.expr(); } while (this.op(","));
          this.exigerOp(")");
          if (!this.op(";")) { if (this.estOp("{")) return { t: "bloc", corps: this.bloc(), ligne: l }; }
          return { t: "declare", strict: !!(dir.strict_types && dir.strict_types.v === 1), ligne: l };
        }
        case "goto": throw ErreurSyntaxe("'goto' is not supported in the atelier", l);
        case "else": case "elseif": case "endif": case "endwhile": case "endfor": case "endforeach": case "endswitch":
        case "case": case "default": case "catch": case "finally":
          throw this.erreur();
      }
    }
    var ex = this.expr();
    this.finInstruction();
    return { t: "expr", e: ex, ligne: l };
  };
  A.echo = function () {
    var l = this.prendre().ligne;
    var args = [];
    do { args.push(this.expr()); } while (this.op(","));
    this.finInstruction("\",\" or \";\"");
    return { t: "echo", args: args, ligne: l };
  };
  A.parenthese = function () {
    this.exigerOp("(");
    var e = this.expr();
    this.exigerOp(")");
    return e;
  };
  A.si = function () {
    var l = this.prendre().ligne;
    var cond = this.parenthese();
    var c = this.corps(["elseif", "else", "endif"]);
    var n = { t: "if", cond: cond, alors: c.corps, sinonsi: [], sinon: null, ligne: l };
    if (c.alt) {
      for (;;) {
        if (this.mot("elseif")) {
          var ce = this.parenthese(); this.exigerOp(":");
          var cc = []; while (!this.estMot("elseif") && !this.estMot("else") && !this.estMot("endif")) { if (this.voir().t === "fin") throw this.erreur(); cc.push(this.instruction()); }
          n.sinonsi.push({ cond: ce, corps: cc });
          continue;
        }
        if (this.mot("else")) {
          if (this.estMot("if")) throw this.erreur("\":\"");
          this.exigerOp(":");
          var cs = []; while (!this.estMot("endif")) { if (this.voir().t === "fin") throw this.erreur(); cs.push(this.instruction()); }
          n.sinon = cs;
        }
        this.exigerMot("endif");
        this.finInstruction();
        return n;
      }
    }
    for (;;) {
      if (this.estMot("elseif") || (this.estMot("else") && this.estMot("if", 1))) {
        if (this.estMot("else")) this.i++;
        this.i++;
        var co = this.parenthese();
        n.sinonsi.push({ cond: co, corps: this.corps(null).corps });
        continue;
      }
      if (this.mot("else")) n.sinon = this.corps(null).corps;
      return n;
    }
  };
  A.tantQue = function () {
    var l = this.prendre().ligne;
    var cond = this.parenthese();
    var c = this.corps(["endwhile"]);
    if (c.alt) { this.exigerMot("endwhile"); this.finInstruction(); }
    return { t: "while", cond: cond, corps: c.corps, ligne: l };
  };
  A.faire = function () {
    var l = this.prendre().ligne;
    var c = this.corps(null).corps;
    this.exigerMot("while");
    var cond = this.parenthese();
    this.finInstruction();
    return { t: "dowhile", cond: cond, corps: c, ligne: l };
  };
  A.listeExpr = function (fin) {
    var l = [];
    if (this.estOp(fin)) return l;
    do { l.push(this.expr()); } while (this.op(","));
    return l;
  };
  A.pour = function () {
    var l = this.prendre().ligne;
    this.exigerOp("(");
    var init = this.listeExpr(";"); this.exigerOp(";");
    var cond = this.listeExpr(";"); this.exigerOp(";");
    var pas = this.listeExpr(")"); this.exigerOp(")");
    var c = this.corps(["endfor"]);
    if (c.alt) { this.exigerMot("endfor"); this.finInstruction(); }
    return { t: "for", init: init, cond: cond, pas: pas, corps: c.corps, ligne: l };
  };
  A.pourChaque = function () {
    var l = this.prendre().ligne;
    this.exigerOp("(");
    var sujet = this.expr();
    this.exigerMot("as");
    var cible = function (a) {
      var ref = a.op("&");
      var e = a.expr(P_AFFECT + 1);
      if (e.t === "tab") e = a.enListe(e);
      return { e: e, ref: ref };
    };
    var premier = cible(this), cle = null, val = premier;
    if (this.op("=>")) { cle = premier.e; val = cible(this); }
    this.exigerOp(")");
    var c = this.corps(["endforeach"]);
    if (c.alt) { this.exigerMot("endforeach"); this.finInstruction(); }
    return { t: "foreach", sujet: sujet, cle: cle, val: val.e, ref: val.ref, corps: c.corps, ligne: l };
  };
  A.selon = function () {
    var l = this.prendre().ligne;
    var sujet = this.parenthese();
    var alt = false;
    if (this.op(":")) alt = true; else this.exigerOp("{");
    var cas = [];
    for (;;) {
      if (alt ? this.estMot("endswitch") : this.estOp("}")) break;
      var x = this.voir();
      if (x.t === "fin") throw this.erreur();
      var test = null;
      if (this.mot("case")) test = this.expr();
      else if (!this.mot("default")) throw this.erreur();
      if (!this.op(":") && !this.op(";")) throw this.erreur("\":\"");
      var corps = [];
      while (!this.estMot("case") && !this.estMot("default") && !(alt ? this.estMot("endswitch") : this.estOp("}"))) {
        if (this.voir().t === "fin") throw this.erreur();
        corps.push(this.instruction());
      }
      cas.push({ test: test, corps: corps, defaut: test === null, ligne: x.ligne });
    }
    this.i++;
    if (alt) this.finInstruction();
    return { t: "switch", sujet: sujet, cas: cas, ligne: l };
  };
  A.essayer = function () {
    var l = this.prendre().ligne;
    var corps = this.bloc();
    var captures = [], finalement = null;
    while (this.mot("catch")) {
      this.exigerOp("(");
      var types = [this.nom()];
      while (this.op("|")) types.push(this.nom());
      var v = null;
      if (this.voir().t === "var") v = this.prendre().v;
      this.exigerOp(")");
      captures.push({ types: types, v: v, corps: this.bloc() });
    }
    if (this.mot("finally")) finalement = this.bloc();
    if (!captures.length && !finalement) throw ErreurSyntaxe("Cannot use try without catch or finally", l);
    return { t: "try", corps: corps, captures: captures, finalement: finalement, ligne: l };
  };

  /* ── les fonctions ── */
  A.type = function () {
    // ?int, int|string, A&B, static, array… — le type est noté, la vérification est à l'exécution
    var nullable = this.op("?");
    var noms = [];
    var un = function (a) {
      if (a.op("(")) { var t = a.type(); a.exigerOp(")"); return t.noms.join("|"); }
      return a.nom().toLowerCase();
    };
    noms.push(un(this));
    for (;;) {
      if (this.estOp("|")) { this.i++; noms.push(un(this)); continue; }
      if (this.estOp("&") && this.voir(1).t === "id") { this.i++; noms.push(un(this)); continue; }
      break;
    }
    if (nullable) noms.push("null");
    return { noms: noms, texte: (nullable ? "?" : "") + noms.filter(function (x) { return !nullable || x !== "null"; }).join("|") };
  };
  A.estDebutType = function () {
    var x = this.voir();
    return (x.t === "id" && !/^(public|private|protected|readonly|static|var|abstract|final)$/i.test(x.v)) || this.estOp("?") || (this.estOp("(") && this.voir(1).t === "id");
  };
  A.parametres = function () {
    this.exigerOp("(");
    var ps = [];
    while (!this.estOp(")")) {
      var p = { nom: null, defaut: null, ref: false, variadique: false, type: null, promu: null, ligne: this.voir().ligne };
      while (this.voir().t === "id" && /^(public|private|protected|readonly)$/i.test(this.voir().v)) {
        var mod = this.prendre().v.toLowerCase();
        if (mod !== "readonly") p.promu = mod; else { p.lectureSeule = true; p.promu = p.promu || "public"; }
      }
      if (this.estDebutType() && this.voir().t !== "var") p.type = this.type();
      if (this.op("&")) p.ref = true;
      if (this.op("...")) p.variadique = true;
      var v = this.voir();
      if (v.t !== "var") throw this.erreur("variable");
      this.i++;
      p.nom = v.v;
      if (this.op("=")) p.defaut = this.expr();
      ps.push(p);
      if (!this.op(",")) break;
    }
    this.exigerOp(")");
    return ps;
  };
  A.fonction = function () {
    var l = this.prendre().ligne;
    var ref = this.op("&");
    var nom = this.nom();
    var params = this.parametres();
    var typeRetour = null;
    if (this.op(":")) typeRetour = this.type();
    var corps = this.bloc();
    return { t: "fonction", nom: nom, params: params, corps: corps, ref: ref, typeRetour: typeRetour, ligne: l, fichier: this.fichier };
  };
  A.fermeture = function (statique) {
    var l = this.prendre().ligne;
    var ref = this.op("&");
    var params = this.parametres();
    var uses = [];
    if (this.mot("use")) {
      this.exigerOp("(");
      while (!this.estOp(")")) {
        var r = this.op("&");
        var v = this.voir(); if (v.t !== "var") throw this.erreur("variable"); this.i++;
        uses.push({ nom: v.v, ref: r });
        if (!this.op(",")) break;
      }
      this.exigerOp(")");
    }
    var typeRetour = null;
    if (this.op(":")) typeRetour = this.type();
    var corps = this.bloc();
    return { t: "fermeture", params: params, uses: uses, corps: corps, ref: ref, statique: statique, typeRetour: typeRetour, ligne: l, fichier: this.fichier };
  };
  A.fleche = function (statique) {
    var l = this.prendre().ligne;
    var ref = this.op("&");
    var params = this.parametres();
    var typeRetour = null;
    if (this.op(":")) typeRetour = this.type();
    this.exigerOp("=>");
    var e = this.expr(P_AFFECT);
    return { t: "fleche", params: params, e: e, ref: ref, statique: statique, typeRetour: typeRetour, ligne: l, fichier: this.fichier };
  };

  /* ── les classes ── */
  A.classe = function () {
    var l = this.voir().ligne;
    var abstraite = false, finale = false, lectureSeule = false;
    for (;;) {
      if (this.mot("abstract")) { abstraite = true; continue; }
      if (this.mot("final")) { finale = true; continue; }
      if (this.mot("readonly")) { lectureSeule = true; continue; }
      break;
    }
    this.exigerMot("class");
    var nom = this.nom();
    var parent = null, interfaces = [];
    if (this.mot("extends")) parent = this.nom();
    if (this.mot("implements")) { do { interfaces.push(this.nom()); } while (this.op(",")); }
    var c = this.corpsClasse(nom);
    return { t: "classe", nom: nom, parent: parent, interfaces: interfaces, abstraite: abstraite, finale: finale,
      lectureSeule: lectureSeule, membres: c, ligne: l, fichier: this.fichier, genre: "class" };
  };
  A.interfaceDecl = function () {
    var l = this.prendre().ligne;
    var nom = this.nom(), parents = [];
    if (this.mot("extends")) { do { parents.push(this.nom()); } while (this.op(",")); }
    var c = this.corpsClasse(nom);
    return { t: "classe", genre: "interface", nom: nom, parent: null, interfaces: parents, abstraite: true, membres: c, ligne: l, fichier: this.fichier };
  };
  A.traitDecl = function () {
    var l = this.prendre().ligne;
    var nom = this.nom();
    var c = this.corpsClasse(nom);
    return { t: "classe", genre: "trait", nom: nom, parent: null, interfaces: [], abstraite: true, membres: c, ligne: l, fichier: this.fichier };
  };
  A.enumDecl = function () {
    var l = this.prendre().ligne;
    var nom = this.nom();
    var typeSupport = null, interfaces = [];
    if (this.op(":")) typeSupport = this.type();
    if (this.mot("implements")) { do { interfaces.push(this.nom()); } while (this.op(",")); }
    var c = this.corpsClasse(nom);
    return { t: "classe", genre: "enum", nom: nom, parent: null, interfaces: interfaces, abstraite: false, finale: true, membres: c, typeSupport: typeSupport, ligne: l, fichier: this.fichier };
  };
  A.corpsClasse = function (nomClasse) {
    this.exigerOp("{");
    var m = { constantes: [], proprietes: [], methodes: [], traits: [], cas: [] };
    while (!this.op("}")) {
      var x = this.voir();
      if (x.t === "fin") throw this.erreur();
      if (this.mot("use")) {
        do { m.traits.push(this.nom()); } while (this.op(","));
        if (this.estOp("{")) { var prof = 0; do { if (this.estOp("{")) prof++; if (this.estOp("}")) prof--; this.i++; } while (prof > 0); }
        else this.finInstruction();
        continue;
      }
      if (this.mot("case")) {
        var cn = this.nom();
        m.cas.push({ nom: cn, e: this.op("=") ? this.expr() : null, ligne: x.ligne });
        this.finInstruction();
        continue;
      }
      var mods = { visibilite: null, statique: false, abstraite: false, finale: false, lectureSeule: false };
      for (;;) {
        var y = this.voir();
        if (y.t !== "id") break;
        var mv = y.v.toLowerCase();
        if (mv === "public" || mv === "private" || mv === "protected") { mods.visibilite = mv; this.i++; continue; }
        if (mv === "static") { mods.statique = true; this.i++; continue; }
        if (mv === "abstract") { mods.abstraite = true; this.i++; continue; }
        if (mv === "final") { mods.finale = true; this.i++; continue; }
        if (mv === "readonly") { mods.lectureSeule = true; this.i++; continue; }
        if (mv === "var") { mods.visibilite = "public"; this.i++; continue; }
        break;
      }
      if (this.mot("const")) {
        // const TYPE NOM = … (PHP 8.3 accepte un type)
        if (this.voir(1).t === "id" && this.estOp("=", 2) === false && this.voir().t === "id" && this.voir(1).t === "id") this.i++;
        do { var nc = this.nom(); this.exigerOp("="); m.constantes.push({ nom: nc, e: this.expr(), visibilite: mods.visibilite || "public", ligne: x.ligne }); } while (this.op(","));
        this.finInstruction();
        continue;
      }
      if (this.estMot("function")) {
        var lf = this.prendre().ligne;
        var ref = this.op("&");
        var nomF = this.voir();
        if (nomF.t !== "id") throw this.erreur("identifier");
        this.i++;
        var params = this.parametres();
        var tr = null;
        if (this.op(":")) tr = this.type();
        var corps = null;
        if (this.estOp("{")) corps = this.bloc(); else this.finInstruction("\"{\"");
        m.methodes.push({ nom: nomF.v, params: params, corps: corps, ref: ref, typeRetour: tr, visibilite: mods.visibilite || "public",
          statique: mods.statique, abstraite: mods.abstraite || corps === null, finale: mods.finale, ligne: lf, fichier: this.fichier });
        continue;
      }
      // une propriété : [type] $nom [= défaut], …
      var type = null;
      if (this.voir().t !== "var") type = this.type();
      do {
        var v = this.voir();
        if (v.t !== "var") throw this.erreur("variable");
        this.i++;
        m.proprietes.push({ nom: v.v, defaut: this.op("=") ? this.expr() : null, type: type, visibilite: mods.visibilite || "public",
          statique: mods.statique, lectureSeule: mods.lectureSeule, ligne: v.ligne });
      } while (this.op(","));
      this.finInstruction();
    }
    return m;
  };

  /* ── les expressions ── */
  A.expr = function (min) {
    min = min || 0;
    var g = this.unaire();
    for (;;) {
      var x = this.voir();
      var op = x.t === "op" ? x.v : (x.t === "id" && /^(and|or|xor|instanceof)$/i.test(x.v) ? x.v.toLowerCase() : null);
      if (op === null) break;
      if (op === "?") {
        if (P_TERNAIRE < min) break;
        this.i++;
        if (this.op(":")) { g = { t: "tern", cond: g, alors: null, sinon: this.expr(P_TERNAIRE + 1), ligne: x.ligne }; continue; }
        var alors = this.expr(0);
        this.exigerOp(":", "\":\"");
        var sinon = this.expr(P_TERNAIRE + 1);
        g = { t: "tern", cond: g, alors: alors, sinon: sinon, ligne: x.ligne };
        continue;
      }
      var b = BINAIRES[op];
      if (!b || b[0] < min) break;
      this.i++;
      if (op === "instanceof") {
        var c;
        if (this.voir().t === "id") c = { t: "nomClasse", nom: this.prendre().v };
        else c = this.unaire();
        g = { t: "instanceof", e: g, classe: c, ligne: x.ligne };
        continue;
      }
      var d = this.expr(b[1] === "d" ? b[0] : b[0] + 1);
      // 1 < 2 < 3 : les comparaisons ne s'enchaînent pas en PHP
      if (b[1] === "n") { var suite = this.voir(); var bs = suite.t === "op" && BINAIRES[suite.v]; if (bs && bs[0] === b[0]) throw this.erreur(); }
      if (op === "&&" || op === "and") g = { t: "et", g: g, d: d, ligne: x.ligne };
      else if (op === "||" || op === "or") g = { t: "ou", g: g, d: d, ligne: x.ligne };
      else if (op === "xor") g = { t: "bin", op: "xor", g: g, d: d, ligne: x.ligne };
      else if (op === "??") g = { t: "nul", g: g, d: d, ligne: x.ligne };
      else g = { t: "bin", op: op === "<>" ? "!=" : op, g: g, d: d, ligne: x.ligne };
    }
    return g;
  };
  var ASSIGNABLE = { "var": 1, "varvar": 1, "idx": 1, "prop": 1, "sprop": 1, "liste": 1 };
  A.unaire = function () {
    var x = this.voir(), l = x.ligne;
    if (x.t === "op") {
      switch (x.v) {
        case "!": this.i++; return { t: "non", e: this.expr(18), ligne: l };
        case "-": case "+": case "~": {
          this.i++;
          var e = this.expr(20);
          // -5 écrit tel quel : un littéral négatif (et -9223372036854775808 reste un entier)
          if (x.v === "-" && (e.t === "int" || e.t === "float") && !e.paren) return { t: e.t, v: -e.v, ligne: l };
          return { t: "un", op: x.v, e: e, ligne: l };
        }
        case "@": this.i++; return { t: "silence", e: this.expr(20), ligne: l };
        case "++": case "--": {
          this.i++;
          var c = this.unaire();
          if (!ASSIGNABLE[c.t]) throw this.erreur();
          return { t: "incr", op: x.v, pre: true, cible: c, ligne: l };
        }
        case "&": throw this.erreur();
      }
    }
    if (x.t === "cast") { this.i++; return { t: "cast", type: x.v, e: this.expr(20), ligne: l }; }
    if (x.t === "id") {
      var m = x.v.toLowerCase();
      if (m === "new") return this.postfixe(this.nouveau());
      if (m === "clone") { this.i++; return { t: "clone", e: this.expr(21), ligne: l }; }
      if (m === "print") { this.i++; return { t: "print", e: this.expr(P_AFFECT), ligne: l }; }
      if (m === "throw") { this.i++; return { t: "throw", e: this.expr(0), ligne: l }; }
      if ((m === "include" || m === "include_once" || m === "require" || m === "require_once")) {
        this.i++;
        return { t: "inclure", mode: m, e: this.expr(P_AFFECT), ligne: l };
      }
      if (m === "yield") throw ErreurSyntaxe("Generators (yield) are not supported in the atelier", l);
    }
    return this.postfixe(this.primaire());
  };
  A.nouveau = function () {
    var l = this.prendre().ligne;
    var classe;
    var x = this.voir();
    if (x.t === "id" && x.v.toLowerCase() === "class") {
      throw ErreurSyntaxe("Anonymous classes are not supported in the atelier", l);
    }
    if (x.t === "id") { this.i++; classe = { t: "nomClasse", nom: x.v }; }
    else if (x.t === "var") {
      this.i++;
      classe = { t: "var", nom: x.v, ligne: l };
      // new $this->classe, new $noms['x']
      for (;;) {
        if (this.estOp("->")) { this.i++; classe = { t: "prop", obj: classe, nom: this.nom(), ligne: l }; continue; }
        if (this.estOp("[")) { this.i++; classe = { t: "idx", base: classe, cle: this.expr(), ligne: l }; this.exigerOp("]"); continue; }
        if (this.estOp("::") && this.voir(1).t === "var") { this.i++; classe = { t: "sprop", classe: classe, nom: this.prendre().v, ligne: l }; continue; }
        break;
      }
    } else if (this.op("(")) { classe = this.expr(); this.exigerOp(")"); }
    else throw this.erreur();
    var args = this.estOp("(") ? this.arguments() : [];
    return { t: "new", classe: classe, args: args, ligne: l };
  };
  A.arguments = function () {
    this.exigerOp("(");
    var args = [];
    while (!this.estOp(")")) {
      if (this.estOp("...") && this.estOp(")", 1)) { this.i++; args.premiereClasse = true; break; }
      var a = { etale: false, nom: null };
      if (this.op("...")) a.etale = true;
      else if (this.voir().t === "id" && this.estOp(":", 1) && !this.estOp("::", 1)) { a.nom = this.prendre().v; this.i++; }
      a.e = this.expr();
      args.push(a);
      if (!this.op(",")) break;
    }
    this.exigerOp(")");
    return args;
  };
  A.primaire = function () {
    var x = this.voir(), l = x.ligne;
    switch (x.t) {
      case "var": this.i++; return { t: "var", nom: x.v, ligne: l };
      case "int": this.i++; return { t: "int", v: x.v, ligne: l };
      case "float": this.i++; return { t: "float", v: x.v, ligne: l };
      case "str": this.i++; return { t: "str", v: x.v, ligne: l };
      case "tpl": this.i++; return { t: "tpl", parts: x.v.map(function (p) { return p && p.t === "source" ? this.sousExpression(p.src, p.ligne) : p; }, this), ligne: l };
      case "fin": throw this.erreur();
      case "html": throw this.erreur();
    }
    if (x.t === "op") {
      if (x.v === "(") {
        this.i++;
        var e = this.expr();
        this.exigerOp(")");
        if (e.t === "int" || e.t === "float") e = { t: e.t, v: e.v, ligne: e.ligne, paren: true };
        return e;
      }
      if (x.v === "[") return this.tableau("]");
      if (x.v === "$") {
        this.i++;
        if (this.op("{")) { var ve = this.expr(); this.exigerOp("}"); return { t: "varvar", e: ve, ligne: l }; }
        return { t: "varvar", e: this.primaire(), ligne: l };
      }
      if (x.v === "&") throw this.erreur();
      throw this.erreur();
    }
    if (x.t === "id") {
      var m = x.v.toLowerCase();
      switch (m) {
        case "true": case "false": case "null":
          if (!this.estOp("(", 1) && !this.estOp("::", 1)) { this.i++; return { t: "lit", v: m === "null" ? null : m === "true", ligne: l }; }
          break;
        case "array":
          if (this.estOp("(", 1)) { this.i++; return this.tableau(")"); }
          break;
        case "list":
          if (this.estOp("(", 1)) { this.i++; var lt = this.tableau(")"); return this.enListe(lt); }
          break;
        case "isset": {
          this.i++;
          this.exigerOp("(");
          var args = [];
          do { if (this.estOp(")")) break; args.push(this.expr()); } while (this.op(","));
          this.exigerOp(")");
          return { t: "isset", args: args, ligne: l };
        }
        case "empty": this.i++; return { t: "empty", e: this.parenthese(), ligne: l };
        case "exit": case "die": {
          this.i++;
          var ee = null;
          if (this.op("(")) { if (!this.estOp(")")) ee = this.expr(); this.exigerOp(")"); }
          return { t: "exit", e: ee, ligne: l };
        }
        case "function": return this.fermeture(false);
        case "fn": return this.fleche(false);
        case "static":
          if (this.estMot("function", 1)) { this.i++; return this.fermeture(true); }
          if (this.estMot("fn", 1)) { this.i++; return this.fleche(true); }
          break;
        case "match": if (this.estOp("(", 1)) return this.correspondance(); break;
        case "__line__": this.i++; return { t: "int", v: l, ligne: l };
        case "__file__": case "__dir__": case "__function__": case "__class__": case "__method__": case "__namespace__":
          this.i++; return { t: "magique", nom: m, ligne: l, fichier: this.fichier };
      }
      this.i++;
      if (this.estOp("(")) {
        var argsF = this.arguments();
        return { t: "appel", nom: x.v, args: argsF, ligne: l };
      }
      if (this.estOp("::")) return { t: "nomClasse", nom: x.v, ligne: l };
      return { t: "const", nom: x.v, ligne: l };
    }
    throw this.erreur();
  };
  A.sousExpression = function (src, ligne) {
    var a = new Analyseur("<?php " + src + ";", this.fichier);
    a.j.forEach(function (x) { x.ligne += ligne - 1; });
    var e = a.expr();
    if (a.voir().t !== "op" || a.voir().v !== ";") throw a.erreur();
    return e;
  };
  A.tableau = function (fin) {
    var l = this.prendre().ligne;   // [ ou (
    var elems = [];
    while (!this.estOp(fin)) {
      if (this.estOp(",")) { this.i++; elems.push(null); continue; }   // [, $b] dans une destructuration
      var el = { cle: null, val: null, ref: false, etale: false };
      if (this.op("...")) { el.etale = true; el.val = this.expr(); }
      else if (this.op("&")) { el.ref = true; el.val = this.expr(); }
      else {
        var v = this.expr();
        if (this.op("=>")) { el.cle = v; if (this.op("&")) el.ref = true; el.val = this.expr(); }
        else el.val = v;
      }
      elems.push(el);
      if (!this.op(",")) break;
    }
    this.exigerOp(fin, fin === "]" ? "\"]\"" : "\")\"");
    return { t: "tab", elems: elems, ligne: l };
  };
  A.enListe = function (t) {
    var self = this;
    return { t: "liste", ligne: t.ligne, elems: t.elems.map(function (el) {
      if (!el) return null;
      var v = el.val;
      if (v.t === "tab") v = self.enListe(v);
      if (!ASSIGNABLE[v.t]) throw ErreurSyntaxe("Assignments can only happen to writable values", t.ligne);
      return { cle: el.cle, val: v, ref: el.ref };
    }) };
  };
  A.correspondance = function () {
    var l = this.prendre().ligne;
    var sujet = this.parenthese();
    this.exigerOp("{");
    var bras = [];
    while (!this.estOp("}")) {
      var conds = null;
      if (this.mot("default")) conds = null;
      else { conds = []; do { if (this.estOp("=>")) break; conds.push(this.expr()); } while (this.op(",")); }
      this.exigerOp("=>");
      bras.push({ conds: conds, e: this.expr() });
      if (!this.op(",")) break;
    }
    this.exigerOp("}");
    return { t: "match", sujet: sujet, bras: bras, ligne: l };
  };
  A.postfixe = function (e) {
    for (;;) {
      var x = this.voir(), l = x.ligne;
      if (x.t !== "op") break;
      if (x.v === "[") {
        this.i++;
        if (this.op("]")) { e = { t: "idx", base: e, cle: null, ligne: l }; continue; }
        var apres = this.voir();
        if (apres.t === "op" && /^[;),}]$/.test(apres.v)) throw this.erreur("\"]\"");
        var c = this.expr();
        this.exigerOp("]", "\"]\"");
        e = { t: "idx", base: e, cle: c, ligne: l };
        continue;
      }
      if (x.v === "{" && (e.t === "var" || e.t === "idx" || e.t === "prop")) {
        // $chaine{0} : l'ancienne écriture, refusée depuis PHP 8
        this.i++;
        this.expr();
        this.exigerOp("}");
        throw ErreurSyntaxe("Array and string offset access syntax with curly braces is no longer supported", l);
      }
      if (x.v === "->" || x.v === "?->") {
        this.i++;
        var nom;
        var y = this.voir();
        if (y.t === "id") { this.i++; nom = y.v; }
        else if (y.t === "var") { this.i++; nom = { t: "var", nom: y.v, ligne: y.ligne }; }
        else if (this.op("{")) { nom = this.expr(); this.exigerOp("}"); }
        else throw this.erreur();
        if (this.estOp("(")) e = { t: "methode", obj: e, nom: nom, args: this.arguments(), nullsafe: x.v === "?->", ligne: l };
        else e = { t: "prop", obj: e, nom: nom, nullsafe: x.v === "?->", ligne: l };
        continue;
      }
      if (x.v === "::") {
        this.i++;
        var cl = e.t === "nomClasse" ? e.nom : e;
        var z = this.voir();
        if (z.t === "var") {
          this.i++;
          if (this.estOp("(")) { e = { t: "sappel", classe: cl, nom: { t: "var", nom: z.v, ligne: l }, args: this.arguments(), ligne: l }; continue; }
          e = { t: "sprop", classe: cl, nom: z.v, ligne: l };
          continue;
        }
        if (z.t === "id") {
          this.i++;
          if (this.estOp("(")) { e = { t: "sappel", classe: cl, nom: z.v, args: this.arguments(), ligne: l }; continue; }
          if (z.v.toLowerCase() === "class") { e = { t: "nomDeClasse", classe: cl, ligne: l }; continue; }
          e = { t: "cconst", classe: cl, nom: z.v, ligne: l };
          continue;
        }
        if (this.op("{")) { var ne = this.expr(); this.exigerOp("}"); e = { t: "sappel", classe: cl, nom: ne, args: this.arguments(), ligne: l }; continue; }
        throw this.erreur();
      }
      if (x.v === "(" && e.t !== "nomClasse") {
        e = { t: "appelValeur", f: e, args: this.arguments(), ligne: l };
        continue;
      }
      if ((x.v === "++" || x.v === "--") && ASSIGNABLE[e.t]) {
        this.i++;
        e = { t: "incr", op: x.v, pre: false, cible: e, ligne: l };
        continue;
      }
      if (AFFECTATIONS[x.v] && (ASSIGNABLE[e.t] || (e.t === "tab" && x.v === "="))) {
        this.i++;
        var cible = e.t === "tab" ? this.enListe(e) : e;
        if (x.v === "=" && this.estOp("&")) {
          this.i++;
          var source = this.expr(P_AFFECT);
          return { t: "affref", cible: cible, source: source, ligne: l };
        }
        var val = this.expr(P_AFFECT);
        return { t: "aff", op: x.v, cible: cible, val: val, ligne: l };
      }
      break;
    }
    if (e.t === "nomClasse") throw this.erreur();
    return e;
  };

  /* L'arbre d'un fichier entier. Jette une erreur { syntaxe: true, ligne }. */
  function analyser(src, fichier) {
    var a = new Analyseur(src, fichier);
    return a.fichierEntier();
  }
  return { analyser: analyser, decouper: decouper, Analyseur: Analyseur };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PHP_ANALYSE;
