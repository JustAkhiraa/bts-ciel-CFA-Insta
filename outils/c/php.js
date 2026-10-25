/* ═══════════════════════════════════════════════════════════════════════
   Le PHP de l'atelier, seconde moitié : exécuter l'arbre que php-analyse.js
   a construit, et rendre ce que XAMPP rendrait.

   Ce qui est offert, parce que le cours s'en sert :
     · echo, le HTML autour des balises, print_r / var_dump / var_export ;
     · les variables (type qui change en route), les tableaux à SÉMANTIQUE
       DE VALEUR (une copie à l'affectation, comme en PHP, pas une
       référence comme en JavaScript), &$référence ;
     · if/elseif/else, while, do…while, for, foreach, switch, match, et la
       syntaxe alternative des gabarits ;
     · les fonctions (défaut, type, &référence, ...variadique, arguments
       nommés), les fermetures (use), les fonctions fléchées, la récursion ;
     · les classes : propriétés, méthodes, static, visibilité, héritage,
       interfaces, traits, constantes, $this, parent::, self::, les
       exceptions (try/catch/finally, throw) ;
     · le web : $_GET, $_POST, $_SESSION, $_SERVER, $_REQUEST, $_COOKIE ;
       session_start / session_destroy, header("Location: …"), exit ;
       htmlspecialchars, filter_var, trim, isset, empty, le ?? et le ?: ;
     · les fichiers : fopen/fwrite/fgets/fread/feof/fclose sur un disque
       virtuel ; PDO sur le moteur SQL (sql.js) — prepare/execute/fetch/
       fetchAll/query/fetchColumn/lastInsertId/rowCount ;
     · password_hash / password_verify (bcrypt, empreintes.js).

   Les avertissements et les erreurs fatales sortent comme ceux de PHP, à la
   bonne ligne (« Warning: Undefined array key "nom" in … on line 12 »,
   « Fatal error: Uncaught Error: … »), et l'atelier les explique en français.

   Ce que ce PHP n'est PAS : le vrai. Pas de générateurs (yield), pas de
   goto, pas de vraies ressources réseau, pas tout l'écosystème de fonctions.
   Le cours n'en demande pas — et la page le dit.
   ═══════════════════════════════════════════════════════════════════════ */
var PHP = (function () {
  "use strict";
  var ANALYSE = typeof PHP_ANALYSE !== "undefined" ? PHP_ANALYSE : require("./php-analyse.js");
  var EMP = typeof EMPREINTES !== "undefined" ? EMPREINTES : require("./empreintes.js");
  var SQL = typeof MOTEUR_SQL !== "undefined" ? MOTEUR_SQL : (function () { try { return require("./sql.js"); } catch (e) { return null; } })();

  /* ═══════════════ 1. LES VALEURS ═══════════════════════════════════════
     Un entier et un flottant sont des nombres JavaScript, distingués par un
     drapeau : PhpFloat marque « c'est un flottant » (3.0 s'écrit « 3 » mais
     se divise comme un réel). Une chaîne est une chaîne. Un booléen, un
     booléen. null, null. Un tableau est un PhpArray (ordonné, clés int ou
     texte). Un objet est un PhpObjet. */
  function PhpFloat(v) { this.v = v; }
  PhpFloat.prototype.valueOf = function () { return this.v; };
  function flottant(v) { return new PhpFloat(+v); }
  function estFloat(v) { return v instanceof PhpFloat; }
  function estEntier(v) { return typeof v === "number"; }

  /* Un tableau PHP : des paires clé→valeur dans l'ordre d'insertion, un
     compteur pour la prochaine clé entière automatique. Les clés sont des
     entiers ou des chaînes ; « 5 » devient 5, true devient 1, null devient
     "" (règles de PHP). */
  function PhpArray() { this.cles = []; this.vals = Object.create(null); this.prochaine = 0; }
  PhpArray.prototype.normCle = function (k) {
    if (typeof k === "number") return Math.trunc(k);
    if (estFloat(k)) return Math.trunc(k.v);
    if (k === true) return 1;
    if (k === false) return 0;
    if (k === null) return "";
    var s = String(k);
    if (/^-?(0|[1-9][0-9]*)$/.test(s)) { var n = parseInt(s, 10); if (String(n) === s && n >= -9007199254740991 && n <= 9007199254740991) return n; }
    return s;
  };
  PhpArray.prototype.has = function (k) { return this.normCle(k) in this.vals; };
  PhpArray.prototype.get = function (k) { var n = this.normCle(k); return n in this.vals ? this.vals[n] : undefined; };
  PhpArray.prototype.set = function (k, v) {
    if (k === null || k === undefined) { k = this.prochaine; }
    var n = this.normCle(k);
    if (!(n in this.vals)) this.cles.push(n);
    this.vals[n] = v;
    if (typeof n === "number" && n >= this.prochaine) this.prochaine = n + 1;
    return n;
  };
  PhpArray.prototype.pousser = function (v) { var k = this.prochaine; this.set(k, v); return k; };
  PhpArray.prototype.supprimer = function (k) {
    var n = this.normCle(k);
    if (n in this.vals) { delete this.vals[n]; var i = this.cles.indexOf(n); if (i >= 0) this.cles.splice(i, 1); }
  };
  PhpArray.prototype.taille = function () { return this.cles.length; };
  PhpArray.prototype.forEach = function (f) { for (var i = 0; i < this.cles.length; i++) f(this.vals[this.cles[i]], this.cles[i], i); };
  PhpArray.prototype.copie = function () {
    var a = new PhpArray();
    a.cles = this.cles.slice(); a.prochaine = this.prochaine;
    for (var i = 0; i < this.cles.length; i++) { var k = this.cles[i]; a.vals[k] = copierValeur(this.vals[k]); }
    return a;
  };
  PhpArray.prototype.estListe = function () {
    for (var i = 0; i < this.cles.length; i++) if (this.cles[i] !== i) return false;
    return true;
  };
  function tableauDe(paires) { var a = new PhpArray(); paires.forEach(function (p) { a.set(p[0], p[1]); }); return a; }
  function listeDe(vals) { var a = new PhpArray(); vals.forEach(function (v) { a.pousser(v); }); return a; }

  /* Une copie en profondeur des tableaux (sémantique de valeur), mais les
     objets restent partagés (sémantique de référence), comme en PHP. */
  function copierValeur(v) { return v instanceof PhpArray ? v.copie() : v; }

  function PhpObjet(classe) { this.classe = classe; this.props = Object.create(null); this.ordre = []; this.id = ++PhpObjet.compteur; }
  PhpObjet.compteur = 0;
  PhpObjet.prototype.set = function (nom, v) { if (this.ordre.indexOf(nom) < 0) this.ordre.push(nom); this.props[nom] = v; };
  PhpObjet.prototype.get = function (nom) { return this.props[nom]; };
  PhpObjet.prototype.has = function (nom) { return nom in this.props; };

  /* ═══════════════ 2. LES SIGNAUX ════════════════════════════════════════
     break, continue, return, exit et une exception PHP remontent la pile en
     JavaScript sous forme d'objets jetés. */
  function Signal(genre, val) { this.signal = genre; this.val = val; }
  function Lancee(objet) { this.lancee = objet; }   // une exception PHP (throw)
  function ErreurPhp(message, ligne, nomClasse) { this.phpFatal = true; this.message = message; this.ligne = ligne; this.nomClasse = nomClasse || "Error"; }

  /* ═══════════════ 3. LES CONVERSIONS (les règles de PHP) ═══════════════ */
  function versBool(v) {
    if (v === null || v === undefined || v === false) return false;
    if (v === true) return true;
    if (typeof v === "number") return v !== 0;
    if (estFloat(v)) return v.v !== 0;
    if (typeof v === "string") return v !== "" && v !== "0";
    if (v instanceof PhpArray) return v.taille() > 0;
    return true;   // un objet est toujours vrai
  }
  var NUM_TETE = /^[ \t\n\r\v\f]*[+-]?(?:0x[0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/;
  function versNombre(v, ctx, ligne) {
    if (typeof v === "number") return v;
    if (estFloat(v)) return v.v;
    if (v === true) return 1;
    if (v === null || v === undefined || v === false) return 0;
    if (typeof v === "string") {
      var s = v.trim();
      if (/^[+-]?\d+$/.test(s)) return parseInt(s, 10);
      var m = NUM_TETE.exec(v);
      if (!m) { if (ctx && /\S/.test(v)) ctx.avertir("A non-numeric value encountered", ligne); return 0; }
      var t = m[0].trim();
      if (ctx && t.length < v.trim().length && /\S/.test(v)) ctx.avertir("A non-numeric value encountered", ligne);
      else if (ctx && !/^[+-]?\d+$/.test(t) && !/[.eE]/.test(t) === false) { /* flottant propre */ }
      return /[.eE]/.test(t) || /^0x/i.test(t) ? parseFloat(t) : parseInt(t, 10);
    }
    if (v instanceof PhpArray) { if (ctx) ctx.avertir("Array to string conversion", ligne); return v.taille() ? 1 : 0; }
    return 1;
  }
  /* Un nombre PHP garde son type : entier si les deux opérandes le sont et
     que le résultat l'est. estReel marque qu'il faut un flottant. */
  function numerique(v, ctx, ligne) {
    if (typeof v === "number") return { n: v, reel: false };
    if (estFloat(v)) return { n: v.v, reel: true };
    if (v === true) return { n: 1, reel: false };
    if (v === null || v === undefined || v === false) return { n: 0, reel: false };
    if (typeof v === "string") {
      var s = v.trim();
      if (/^[+-]?\d+$/.test(s)) { var e = parseInt(s, 10); return { n: e, reel: !Number.isSafeInteger(e) }; }
      var m = NUM_TETE.exec(v);
      if (!m) { if (ctx && /\S/.test(v)) ctx.avertir("A non-numeric value encountered", ligne); return { n: 0, reel: false }; }
      var t = m[0].trim();
      if (ctx && t.length < v.trim().length) ctx.avertir("A non-numeric value encountered", ligne);
      if (/[.eE]/.test(t) || /^0x/i.test(t)) return { n: parseFloat(t), reel: true };
      return { n: parseInt(t, 10), reel: false };
    }
    return { n: versNombre(v, ctx, ligne), reel: false };
  }
  function nombrePhp(n, reel) {
    if (reel) return flottant(n);
    if (Number.isSafeInteger(n)) return n;
    return flottant(n);   // un entier trop grand devient un flottant, comme en PHP
  }
  /* Le texte d'un nombre, à la façon de PHP : un entier tel quel, un
     flottant avec 14 chiffres significatifs (precision=14) et « E+ ». */
  function texteNombre(n, reel) {
    if (!reel && n === 9223372036854775807) return "9223372036854775807";   // PHP_INT_MAX, inexact en JS
    if (!reel && n === -9223372036854775808) return "-9223372036854775808";
    if (!reel && Number.isInteger(n)) return String(n);
    if (!isFinite(n)) return n > 0 ? "INF" : n < 0 ? "-INF" : "NAN";
    if (n === 0) return Object.is(n, -0) ? "-0" : "0";
    var s = precision14(n);
    return s;
  }
  function precision14(n) { return formatFloat(n, 14, 14); }
  /* Le flottant à la façon de PHP : « sig » chiffres significatifs (14 pour
     echo, 0 = le plus court pour var_dump), passage en notation « E » quand
     l'exposant décimal atteint « seuilHaut » (14 pour echo, 17 pour var_dump)
     ou descend sous −4. */
  function formatFloat(n, sig, seuilHaut) {
    if (!isFinite(n)) return n > 0 ? "INF" : n < 0 ? "-INF" : "NAN";
    var neg = n < 0 || Object.is(n, -0);
    var a = Math.abs(n);
    if (a === 0) return neg ? "-0" : "0";
    // mantisse et exposant, arrondis au besoin à « sig » chiffres
    var ex = sig ? a.toExponential(sig - 1) : a.toExponential();
    var m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(ex);
    var chiffres = m[1] + (m[2] || "");
    chiffres = chiffres.replace(/0+$/, "") || "0";          // on retire les zéros inutiles
    var exp = +m[3];
    var s;
    if (exp < -4 || exp >= seuilHaut) {
      var mant = chiffres[0] + (chiffres.length > 1 ? "." + chiffres.slice(1) : ".0");
      s = mant + "E" + (exp >= 0 ? "+" : "-") + Math.abs(exp);
    } else if (exp >= 0) {
      if (chiffres.length <= exp + 1) s = chiffres + "0".repeat(exp + 1 - chiffres.length);
      else s = chiffres.slice(0, exp + 1) + "." + chiffres.slice(exp + 1);
    } else {
      s = "0." + "0".repeat(-exp - 1) + chiffres;
    }
    return neg ? "-" + s : s;
  }
  function versTexte(v, ctx, ligne) {
    if (typeof v === "string") return v;
    if (v === null || v === undefined) return "";
    if (v === true) return "1";
    if (v === false) return "";
    if (typeof v === "number") return texteNombre(v, false);
    if (estFloat(v)) return texteNombre(v.v, true);
    if (v instanceof PhpArray) { if (ctx) ctx.avertir("Array to string conversion", ligne); return "Array"; }
    if (v instanceof PhpObjet) {
      var m = ctx && ctx.moteur.methode(v.classe, "__tostring");
      if (m) return versTexte(ctx.moteur.appelerMethode(v, m, [], ligne), ctx, ligne);
      throw new ErreurPhp("Object of class " + v.classe.nom + " could not be converted to string", ligne, "Error");
    }
    return String(v);
  }
  function typeNom(v) {
    if (v === null || v === undefined) return "null";
    if (v === true || v === false) return "bool";
    if (typeof v === "number") return "int";
    if (estFloat(v)) return "float";
    if (typeof v === "string") return "string";
    if (v instanceof PhpArray) return "array";
    if (v instanceof PhpObjet) return "object";
    return "mixed";
  }
  function typeGettype(v) {
    switch (typeNom(v)) {
      case "null": return "NULL"; case "bool": return "boolean"; case "int": return "integer";
      case "float": return "double"; case "string": return "string"; case "array": return "array"; case "object": return "object";
    }
    return "unknown type";
  }

  /* L'égalité lâche == et stricte === de PHP (règles de PHP 8). */
  function egalLache(a, b, ctx, ligne) {
    if (a === null || a === undefined) a = null;
    if (b === null || b === undefined) b = null;
    var ta = typeNom(a), tb = typeNom(b);
    if (ta === tb) {
      if (ta === "string" && estChaineNumerique(a) && estChaineNumerique(b)) return versNombre(a) === versNombre(b);
      return egalStrict(a, b);
    }
    if (a === null) return !versBool(b) && (tb === "bool" || tb === "null") ? b === null || b === false : b === null;
    if (b === null) return egalLache(b, a, ctx, ligne);
    if (ta === "bool" || tb === "bool") return versBool(a) === versBool(b);
    if ((ta === "int" || ta === "float") && (tb === "int" || tb === "float")) return versNombre(a) === versNombre(b);
    // nombre vs chaîne : PHP 8 — si la chaîne est numérique, on compare en nombres, sinon en chaînes
    if ((ta === "int" || ta === "float") && tb === "string") return estChaineNumerique(b) ? versNombre(a) === versNombre(b) : texteNombre(ta === "int" ? a : a.v, ta === "float") === b;
    if (ta === "string" && (tb === "int" || tb === "float")) return egalLache(b, a, ctx, ligne);
    if (ta === "array" || tb === "array") return false;
    return versBool(a) === versBool(b);
  }
  function egalStrict(a, b) {
    var ta = typeNom(a), tb = typeNom(b);
    if (ta !== tb) return false;
    if (ta === "null") return true;
    if (ta === "int" || ta === "bool" || ta === "string") return a === b;
    if (ta === "float") return a.v === b.v;
    if (ta === "object") return a === b;
    if (ta === "array") {
      if (a.taille() !== b.taille()) return false;
      for (var i = 0; i < a.cles.length; i++) { if (a.cles[i] !== b.cles[i]) return false; if (!egalStrict(a.vals[a.cles[i]], b.vals[b.cles[i]])) return false; }
      return true;
    }
    return a === b;
  }
  function estChaineNumerique(s) {
    if (typeof s !== "string") return false;
    return /^[ \t\n\r\v\f]*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(s) || /^[ \t\n\r\v\f]*[+-]?\d+[ \t\n\r\v\f]*$/.test(s);
  }
  /* <=> et < > de PHP : nombres si possible, sinon texte ; les tableaux par
     taille puis élément à élément. */
  function comparer(a, b, ctx, ligne) {
    var ta = typeNom(a), tb = typeNom(b);
    if (ta === "array" && tb === "array") {
      if (a.taille() !== b.taille()) return a.taille() < b.taille() ? -1 : 1;
      var r = 0;
      a.forEach(function (v, k) { if (r) return; if (!b.has(k)) { r = 1; return; } r = comparer(v, b.get(k), ctx, ligne); });
      return r;
    }
    if (ta === "array") return 1;
    if (tb === "array") return -1;
    if (ta === "bool" || tb === "bool" || ta === "null" || tb === "null") { var x = versBool(a) ? 1 : 0, y = versBool(b) ? 1 : 0; return x < y ? -1 : x > y ? 1 : 0; }
    if (ta === "string" && tb === "string") {
      if (estChaineNumerique(a) && estChaineNumerique(b)) { var na = versNombre(a), nb = versNombre(b); return na < nb ? -1 : na > nb ? 1 : 0; }
      return a < b ? -1 : a > b ? 1 : 0;
    }
    // nombre vs chaîne : PHP 8 compare en NOMBRES si la chaîne est numérique,
    // sinon en TEXTE (le nombre devient une chaîne) — sans avertissement
    if ((ta === "int" || ta === "float") && tb === "string") {
      if (estChaineNumerique(b)) { var x = versNombre(a), y = versNombre(b); return x < y ? -1 : x > y ? 1 : 0; }
      var sa = versTexte(a, null, ligne); return sa < b ? -1 : sa > b ? 1 : 0;
    }
    if (ta === "string" && (tb === "int" || tb === "float")) return -comparer(b, a, ctx, ligne);
    var pa = versNombre(a, ctx, ligne), pb = versNombre(b, ctx, ligne);
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  }

  /* ═══════════════ 4. LE MOTEUR ═════════════════════════════════════════ */
  function Moteur(options) {
    options = options || {};
    this.sortie = [];
    this.avis = [];                       // Warning, Deprecated, Notice
    this.fonctions = Object.create(null); // minuscules → déclaration
    this.classes = Object.create(null);
    this.constantes = Object.create(null);
    this.fs = options.fs || Object.create(null);     // disque virtuel { nom: texte }
    this.fichiers = Object.create(null);  // les .php du projet { nom: source }
    this.inclus = Object.create(null);
    this.session = options.session || null;          // { user: ... } ou null tant que session_start() n'est pas appelé
    this.sessionDemarree = false;
    this.entetes = [];
    this.redirection = null;
    this.cookies = options.cookies || Object.create(null);
    this.finies = false;
    this.pdo = null;
    this.serveur = options.serveur || (SQL ? new SQL.Serveur(options.etatSql) : null);
    this.budget = options.budget || 2000000;         // opérations avant « temps dépassé »
    this.ops = 0;
    this.ligneCourante = 0;
    this.derniereId = 0;
    this.globales = new Cadre(null);
    this.globales.vars["GLOBALS"] = null;             // marqueur
    this.sortantesStatiques = Object.create(null);
    this.poserSuperglobales(options);
    this.initClassesDeBase();
  }
  var M = Moteur.prototype;

  function Cadre(parent) { this.vars = Object.create(null); this.parent = parent; }

  M.poserSuperglobales = function (o) {
    var G = this.globales.vars;
    G["_GET"] = o.get || new PhpArray();
    G["_POST"] = o.post || new PhpArray();
    G["_REQUEST"] = fusionner(G["_GET"], G["_POST"]);
    G["_COOKIE"] = o.cookie || new PhpArray();
    G["_FILES"] = new PhpArray();
    G["_ENV"] = new PhpArray();
    var srv = o.server || new PhpArray();
    if (!srv.has("REQUEST_METHOD")) srv.set("REQUEST_METHOD", o.methode || "GET");
    if (!srv.has("REQUEST_URI")) srv.set("REQUEST_URI", o.uri || "/" + (o.page || "index.php"));
    if (!srv.has("SCRIPT_NAME")) srv.set("SCRIPT_NAME", "/" + (o.page || "index.php"));
    if (!srv.has("PHP_SELF")) srv.set("PHP_SELF", "/" + (o.page || "index.php"));
    if (!srv.has("SERVER_NAME")) srv.set("SERVER_NAME", "localhost");
    if (!srv.has("HTTP_HOST")) srv.set("HTTP_HOST", "localhost");
    if (!srv.has("SERVER_SOFTWARE")) srv.set("SERVER_SOFTWARE", "Atelier BTS CIEL");
    G["_SERVER"] = srv;
  };
  function fusionner(a, b) { var r = new PhpArray(); a.forEach(function (v, k) { r.set(k, copierValeur(v)); }); b.forEach(function (v, k) { r.set(k, copierValeur(v)); }); return r; }

  M.ecrire = function (s) { if (s !== "") this.sortie.push(s); };
  M.avertir = function (message, ligne, niveau) {
    this.avis.push({ niveau: niveau || "Warning", message: message, ligne: ligne || this.ligneCourante, fichier: this.fichierCourant });
    // à l'affichage, PHP intercale l'avertissement dans la sortie
    this.ecrire("\n" + (niveau || "Warning") + ": " + message + " in " + (this.fichierCourant || "") + " on line " + (ligne || this.ligneCourante) + "\n");
  };
  M.compteOp = function (ligne) {
    if (++this.ops > this.budget) throw new ErreurPhp("Maximum execution time exceeded (l'atelier arrête un programme trop long)", ligne || this.ligneCourante, "__temps__");
  };

  /* ── préparer un fichier : déclarer ses fonctions et classes (hissées) ── */
  M.chargerDeclarations = function (arbre) {
    var self = this;
    arbre.corps.forEach(function (st) { self.declarerSi(st); });
  };
  M.declarerSi = function (st) {
    if (st.t === "fonction") { var k = st.nom.toLowerCase(); if (!(k in this.fonctions)) this.fonctions[k] = st; }
    else if (st.t === "classe") { if (!(st.nom.toLowerCase() in this.classes)) this.definirClasse(st); }
  };

  /* ═══════════════ 5. EXÉCUTION D'UN FICHIER ════════════════════════════ */
  M.executerFichier = function (nom, source, estEntree) {
    var arbre = ANALYSE.analyser(source, nom);
    var prec = this.fichierCourant;
    this.fichierCourant = nom;
    (arbre.avis || []).forEach(function (a) { /* avis de lexeur : à la demande */ });
    this.chargerDeclarations(arbre);
    var ctx = { moteur: this, cadre: this.globales, fichier: nom, classe: null, thisObj: null, fonction: null };
    try {
      this.execCorps(arbre.corps, ctx);
    } catch (e) { if ((e instanceof ErreurPhp || (e && e.syntaxe)) && !e.fichier) e.fichier = nom; throw e; }
    finally { this.fichierCourant = prec; }
  };

  M.execCorps = function (corps, ctx) {
    for (var i = 0; i < corps.length; i++) this.execInstruction(corps[i], ctx);
  };
  M.execInstruction = function (st, ctx) {
    this.ligneCourante = st.ligne || this.ligneCourante;
    this.compteOp(st.ligne);
    switch (st.t) {
      case "html": this.ecrire(st.v); return;
      case "echo": for (var i = 0; i < st.args.length; i++) this.ecrire(this.versTexte(this.evaluer(st.args[i], ctx), st.ligne)); return;
      case "expr": this.evaluer(st.e, ctx); return;
      case "rien": return;
      case "bloc": this.execCorps(st.corps, ctx); return;
      case "fonction": return;   // déjà hissée
      case "classe": return;
      case "const": for (var c = 0; c < st.consts.length; c++) this.constantes[st.consts[c].nom] = this.evaluer(st.consts[c].e, ctx); return;
      case "declare": return;
      case "if": return this.execIf(st, ctx);
      case "while": return this.execWhile(st, ctx);
      case "dowhile": return this.execDoWhile(st, ctx);
      case "for": return this.execFor(st, ctx);
      case "foreach": return this.execForeach(st, ctx);
      case "switch": return this.execSwitch(st, ctx);
      case "break": throw new Signal("break", st.n);
      case "continue": throw new Signal("continue", st.n);
      case "return": throw new Signal("return", st.e ? this.evaluer(st.e, ctx) : null);
      case "throw": return this.lancer(this.evaluer(st.e, ctx), st.ligne);
      case "try": return this.execTry(st, ctx);
      case "global": for (var g = 0; g < st.noms.length; g++) { var nm = st.noms[g]; if (!(nm in this.globales.vars)) this.globales.vars[nm] = null; ctx.cadre.vars[nm] = new Ref(this.globales.vars, nm); } return;
      case "static": return this.execStatic(st, ctx);
      case "unset": for (var u = 0; u < st.cibles.length; u++) this.detruire(st.cibles[u], ctx); return;
    }
    throw new ErreurPhp("Instruction inconnue : " + st.t, st.ligne);
  };

  /* Une référence vers une case (variable, élément de tableau, propriété) :
     c'est ce qui rend &$x et les paramètres par référence possibles. */
  function Ref(conteneur, cle) { this.conteneur = conteneur; this.cle = cle; }
  Ref.prototype.lire = function () { return this.conteneur[this.cle]; };
  Ref.prototype.ecrire = function (v) { this.conteneur[this.cle] = v; };
  function deref(v) { return v instanceof Ref ? v.lire() : v; }

  M.execIf = function (st, ctx) {
    if (versBool(this.evaluer(st.cond, ctx))) return this.execCorps(st.alors, ctx);
    for (var i = 0; i < st.sinonsi.length; i++) if (versBool(this.evaluer(st.sinonsi[i].cond, ctx))) return this.execCorps(st.sinonsi[i].corps, ctx);
    if (st.sinon) this.execCorps(st.sinon, ctx);
  };
  M.boucle = function (corps, ctx) {
    try { this.execCorps(corps, ctx); return 0; }
    catch (e) {
      if (e instanceof Signal) {
        if (e.signal === "continue") { if (e.val > 1) throw new Signal("continue", e.val - 1); return 0; }
        if (e.signal === "break") { if (e.val > 1) throw new Signal("break", e.val - 1); return 1; }
      }
      throw e;
    }
  };
  M.execWhile = function (st, ctx) { while (versBool(this.evaluer(st.cond, ctx))) { this.compteOp(st.ligne); if (this.boucle(st.corps, ctx)) break; } };
  M.execDoWhile = function (st, ctx) { do { this.compteOp(st.ligne); if (this.boucle(st.corps, ctx)) break; } while (versBool(this.evaluer(st.cond, ctx))); };
  M.execFor = function (st, ctx) {
    var self = this;
    st.init.forEach(function (e) { self.evaluer(e, ctx); });
    for (;;) {
      this.compteOp(st.ligne);
      var ok = true;
      st.cond.forEach(function (e) { ok = versBool(self.evaluer(e, ctx)); });
      if (st.cond.length && !ok) break;
      if (this.boucle(st.corps, ctx)) break;
      st.pas.forEach(function (e) { self.evaluer(e, ctx); });
    }
  };
  M.execForeach = function (st, ctx) {
    var sujet = this.evaluer(st.sujet, ctx);
    if (sujet instanceof PhpObjet) return this.foreachObjet(st, sujet, ctx);
    if (!(sujet instanceof PhpArray)) { this.avertir("foreach() argument must be of type array|object, " + typeNom(sujet) + " given", st.ligne); return; }
    // une copie des clés : modifier le tableau pendant la boucle ne la perturbe pas
    var src = st.ref ? sujet : sujet;
    var cles = sujet.cles.slice();
    for (var i = 0; i < cles.length; i++) {
      this.compteOp(st.ligne);
      var k = cles[i];
      if (!(k in sujet.vals)) continue;
      if (st.cle) this.affecterA(st.cle, k, ctx);
      if (st.ref) {
        var ref = new Ref(sujet.vals, k);
        this.lierRef(st.val, ref, ctx);
      } else {
        this.affecterA(st.val, copierValeur(sujet.vals[k]), ctx);
      }
      if (this.boucle(st.corps, ctx)) break;
    }
  };
  M.foreachObjet = function (st, obj, ctx) {
    // un PDOStatement se parcourt ligne à ligne, comme ses fetch()
    if (obj.resultat !== undefined) {
      if (!obj.resultat || obj.resultat.type !== "select") return;
      while (obj.pos < obj.resultat.lignes.length) {
        this.compteOp(st.ligne);
        var i = obj.pos;
        var ligne = this.pdoLigne(obj.resultat, obj.pos++, obj.pdoFetch || 4);
        if (st.cle) this.affecterA(st.cle, i, ctx);
        this.affecterA(st.val, ligne, ctx);
        if (this.boucle(st.corps, ctx)) break;
      }
      return;
    }
    var noms = obj.ordre.slice();
    for (var i = 0; i < noms.length; i++) {
      this.compteOp(st.ligne);
      var nom = noms[i];
      var p = this.infoPropriete(obj.classe, nom);
      if (p && p.visibilite !== "public" && ctx.classe !== obj.classe) continue;   // seules les publiques depuis l'extérieur
      if (st.cle) this.affecterA(st.cle, nom, ctx);
      this.affecterA(st.val, copierValeur(obj.props[nom]), ctx);
      if (this.boucle(st.corps, ctx)) break;
    }
  };
  M.execSwitch = function (st, ctx) {
    var i, demarre = -1;
    // PHP compare le sujet à chaque case tour à tour, en le relisant à
    // chaque fois (un $x indéfini redonne donc l'avertissement par case).
    for (i = 0; i < st.cas.length; i++) {
      if (st.cas[i].defaut) continue;
      this.ligneCourante = st.cas[i].ligne;
      var v = this.evaluer(st.sujet, ctx);
      if (egalLache(v, this.evaluer(st.cas[i].test, ctx), this, st.cas[i].ligne)) { demarre = i; break; }
    }
    if (demarre < 0) for (i = 0; i < st.cas.length; i++) if (st.cas[i].defaut) { demarre = i; break; }
    if (demarre < 0) return;
    try { for (i = demarre; i < st.cas.length; i++) this.execCorps(st.cas[i].corps, ctx); }
    catch (e) { if (e instanceof Signal && e.signal === "break") { if (e.val > 1) throw new Signal("break", e.val - 1); return; } if (e instanceof Signal && e.signal === "continue") { if (e.val > 1) throw new Signal("continue", e.val - 1); return; } throw e; }
  };
  /* Une erreur interne (DivisionByZeroError, TypeError…) devient un objet
     PHP qu'un catch peut rattraper, comme sur un vrai serveur. */
  M.erreurEnObjet = function (e) {
    var nom = (e.nomClasse || "Error");
    var classe = this.classes[nom.toLowerCase()] || this.classes["error"];
    var o = this.nouvelObjet(classe);
    o.set("message", e.message); o.set("code", 0);
    o.set("line", e.ligne || this.ligneCourante); o.set("file", "/atelier/" + (this.fichierCourant || ""));
    return o;
  };
  M.execTry = function (st, ctx) {
    try { this.execCorps(st.corps, ctx); }
    catch (e0) {
      var e = e0;
      // les erreurs internes attrapables sont converties en objet Throwable
      if (e instanceof ErreurPhp && e.nomClasse && e.nomClasse !== "__temps__" && this.classes[e.nomClasse.toLowerCase()]) e = new Lancee(this.erreurEnObjet(e));
      if (e instanceof Lancee) {
        for (var i = 0; i < st.captures.length; i++) {
          var cap = st.captures[i];
          if (cap.types.some(function (t) { return this.estInstance(e.lancee, t); }, this)) {
            if (cap.v) ctx.cadre.vars[cap.v] = e.lancee;
            try { this.execCorps(cap.corps, ctx); }
            finally { if (st.finalement) this.execCorps(st.finalement, ctx); }
            return;
          }
        }
      }
      if (st.finalement) this.execCorps(st.finalement, ctx);
      throw e;
    }
    if (st.finalement) this.execCorps(st.finalement, ctx);
  };
  M.execStatic = function (st, ctx) {
    var cle = (ctx.fonction ? ctx.fonction.cleStatique : "@global") || "@global";
    for (var i = 0; i < st.vars.length; i++) {
      var v = st.vars[i];
      var id = cle + "::" + v.nom;
      if (!(id in this.sortantesStatiques)) this.sortantesStatiques[id] = { val: v.init ? this.evaluer(v.init, ctx) : null };
      ctx.cadre.vars[v.nom] = new Ref(this.sortantesStatiques[id], "val");
    }
  };

  /* ═══════════════ 6. ÉVALUATION DES EXPRESSIONS ════════════════════════ */
  M.evaluer = function (e, ctx) {
    this.compteOp(e.ligne);
    switch (e.t) {
      case "int": return e.v;
      case "float": return flottant(e.v);
      case "str": return e.v;
      case "lit": return e.v;
      case "tpl": return this.evalTpl(e, ctx);
      case "var": return this.lireVar(e.nom, ctx, e.ligne);
      case "varvar": { var nom = this.versTexte(this.evaluer(e.e, ctx), e.ligne); return this.lireVar(nom, ctx, e.ligne); }
      case "const": return this.lireConstante(e.nom, e.ligne);
      case "magique": return this.magique(e, ctx);
      case "tab": return this.evalTab(e, ctx);
      case "idx": return this.lireIndex(e, ctx);
      case "prop": return this.lirePropriete(e, ctx);
      case "sprop": return this.lireStatique(e, ctx);
      case "cconst": return this.lireConstClasse(e, ctx);
      case "nomDeClasse": return this.resoudreNomClasse(e.classe, ctx, e.ligne).nom;
      case "aff": return this.affecter(e, ctx);
      case "affref": return this.affecterRef(e, ctx);
      case "incr": return this.incrementer(e, ctx);
      case "bin": return this.binaire(e, ctx);
      case "et": return versBool(this.evaluer(e.g, ctx)) ? versBool(this.evaluer(e.d, ctx)) : false;
      case "ou": return versBool(this.evaluer(e.g, ctx)) ? true : versBool(this.evaluer(e.d, ctx));
      case "non": return !versBool(this.evaluer(e.e, ctx));
      case "nul": { var g = this.evaluerDouce(e.g, ctx); return (g === null || g === undefined) ? this.evaluer(e.d, ctx) : g; }
      case "tern": { var c = this.evaluer(e.cond, ctx); return versBool(c) ? (e.alors === null ? c : this.evaluer(e.alors, ctx)) : this.evaluer(e.sinon, ctx); }
      case "un": return this.unaire(e, ctx);
      case "cast": return this.transtyper(e, ctx);
      case "silence": { var n = this.avis.length, sl = this.sortie.length; try { return this.evaluer(e.e, ctx); } catch (err) { if (err instanceof ErreurPhp && !err.phpFatalDur) return null; throw err; } finally { /* on garde la sortie, mais on pourrait retirer les avis */ } }
      case "appel": return this.appelFonction(e, ctx);
      case "appelValeur": return this.appelValeur(e, ctx);
      case "methode": return this.appelMethodeExpr(e, ctx);
      case "sappel": return this.appelStatique(e, ctx);
      case "new": return this.instancier(e, ctx);
      case "clone": return this.cloner(e, ctx);
      case "isset": return this.evalIsset(e, ctx);
      case "empty": { var v = this.evaluerDouce(e.e, ctx); return !versBool(v); }
      case "exit": { if (e.e) { var val = this.evaluer(e.e, ctx); if (typeof val === "string") this.ecrire(val); } throw new Signal("exit", 0); }
      case "print": this.ecrire(this.versTexte(this.evaluer(e.e, ctx), e.ligne)); return 1;
      case "fermeture": return this.faireFermeture(e, ctx);
      case "fleche": return this.faireFleche(e, ctx);
      case "match": return this.evalMatch(e, ctx);
      case "instanceof": return this.evalInstanceof(e, ctx);
      case "inclure": return this.inclure(e, ctx);
      case "nomClasse": return e.nom;
      case "liste": throw new ErreurPhp("list() ne peut être qu'à gauche d'une affectation", e.ligne);
    }
    throw new ErreurPhp("Expression inconnue : " + e.t, e.ligne);
  };
  /* Une lecture « douce » (?? , empty, isset, @) ne doit pas déclencher
     « Undefined variable/key ». */
  M.evaluerDouce = function (e, ctx) {
    if (e.t === "var") return e.nom in ctx.cadre.vars ? deref(ctx.cadre.vars[e.nom]) : (this.superglobale(e.nom) || null);
    if (e.t === "idx") return this.lireIndex(e, ctx, true);
    if (e.t === "prop") return this.lirePropriete(e, ctx, true);
    if (e.t === "sprop") { try { return this.lireStatique(e, ctx); } catch (x) { return null; } }
    return this.evaluer(e, ctx);
  };

  M.evalTpl = function (e, ctx) {
    var s = "";
    for (var i = 0; i < e.parts.length; i++) {
      var p = e.parts[i];
      s += typeof p === "string" ? p : this.versTexte(this.evaluer(p, ctx), e.ligne);
    }
    return s;
  };
  M.evalTab = function (e, ctx) {
    var a = new PhpArray();
    for (var i = 0; i < e.elems.length; i++) {
      var el = e.elems[i];
      if (!el) continue;
      if (el.etale) {
        var src = this.evaluer(el.val, ctx);
        if (src instanceof PhpArray) src.forEach(function (v, k) { if (typeof k === "number") a.pousser(copierValeur(v)); else a.set(k, copierValeur(v)); });
        continue;
      }
      var v = copierValeur(this.evaluer(el.val, ctx));
      if (el.cle !== null && el.cle !== undefined) a.set(this.cleTableau(this.evaluer(el.cle, ctx), e.ligne), v);
      else a.pousser(v);
    }
    return a;
  };
  M.cleTableau = function (v, ligne) {
    if (v instanceof PhpArray) { throw new ErreurPhp("Illegal offset type", ligne, "TypeError"); }
    if (v instanceof PhpObjet) { throw new ErreurPhp("Illegal offset type", ligne, "TypeError"); }
    if (estFloat(v)) { return Math.trunc(v.v); }
    if (v === true) return 1; if (v === false) return 0; if (v === null) return "";
    return v;
  };

  /* ── variables ── */
  M.superglobale = function (nom) {
    if (/^(_GET|_POST|_REQUEST|_SERVER|_SESSION|_COOKIE|_FILES|_ENV|GLOBALS)$/.test(nom)) {
      if (nom === "_SESSION") return this.session;
      if (nom === "GLOBALS") return this.fabriquerGlobals();
      return this.globales.vars[nom];
    }
    return undefined;
  };
  M.lireVar = function (nom, ctx, ligne) {
    if (nom === "this") { if (ctx.thisObj) return ctx.thisObj; this.avertir("Undefined variable $this", ligne); return null; }
    if (nom in ctx.cadre.vars) return deref(ctx.cadre.vars[nom]);
    var sg = this.superglobale(nom);
    if (sg !== undefined) return sg;
    if (nom === "_SESSION") { this.avertir("Undefined global variable $_SESSION", ligne); return null; }
    this.avertir("Undefined variable $" + nom, ligne);
    return null;
  };
  M.fabriquerGlobals = function () {
    var a = new PhpArray();
    for (var k in this.globales.vars) if (k !== "GLOBALS") a.set(k, deref(this.globales.vars[k]));
    return a;
  };

  /* ── accès indexé $a[k] ── */
  M.lireIndex = function (e, ctx, douce) {
    var base = this.evaluerDouce(e.base, ctx);
    if (base instanceof PhpArray) {
      if (e.cle === null) { this.avertir("Cannot use [] for reading", e.ligne); return null; }
      var k = this.cleTableau(this.evaluer(e.cle, ctx), e.ligne);
      if (base.has(k)) return base.get(k);
      if (!douce) this.avertir("Undefined array key " + (typeof k === "number" ? k : "\"" + k + "\""), e.ligne);
      return null;
    }
    if (typeof base === "string") {
      var i = versNombre(this.evaluer(e.cle, ctx), this, e.ligne);
      if (i < 0) i += base.length;
      if (i < 0 || i >= base.length) { if (!douce) this.avertir("Uninitialized string offset " + i, e.ligne); return ""; }
      return base[i];
    }
    if (base === null || base === undefined) { if (!douce) this.avertir("Trying to access array offset on null", e.ligne); return null; }
    if (estEntier(base) || estFloat(base) || base === true || base === false) { if (!douce) this.avertir("Trying to access array offset on " + typeNom(base), e.ligne); return null; }
    throw new ErreurPhp("Cannot use object of type " + (base instanceof PhpObjet ? base.classe.nom : typeNom(base)) + " as array", e.ligne, "TypeError");
  };

  /* ── l'affectation, le cœur de la sémantique de valeur ── */
  M.affecter = function (e, ctx) {
    if (e.op === "=") {
      if (e.cible.t === "liste") { var v = this.evaluer(e.val, ctx); this.destructurer(e.cible, v, ctx); return v; }
      var val = copierValeur(this.evaluer(e.val, ctx));
      this.ecrireCase(e.cible, val, ctx);
      return val;
    }
    if (e.op === "??=") {
      var actuel = this.evaluerDouce(e.cible, ctx);
      if (actuel !== null && actuel !== undefined) return actuel;
      var nv = copierValeur(this.evaluer(e.val, ctx));
      this.ecrireCase(e.cible, nv, ctx);
      return nv;
    }
    var courant = this.evaluer(e.cible, ctx);
    var droite = this.evaluer(e.val, ctx);
    var res = this.operation(e.op.slice(0, -1), courant, droite, e.ligne);
    res = copierValeur(res);
    this.ecrireCase(e.cible, res, ctx);
    return res;
  };
  M.affecterA = function (cibleAst, val, ctx) { this.ecrireCase(cibleAst, copierValeur(val), ctx); };
  /* Écrire dans une case (variable, élément, propriété), en créant au besoin
     le tableau intermédiaire — « autovivification » de PHP. */
  M.ecrireCase = function (cible, val, ctx) {
    switch (cible.t) {
      case "var": {
        if (cible.nom === "this") throw new ErreurPhp("Cannot re-assign $this", cible.ligne);
        if (cible.nom === "_SESSION") { this.session = val; return val; }
        // écrire À TRAVERS une référence, au lieu de la remplacer (paramètre &$x, use (&$v))
        if (ctx.cadre.vars[cible.nom] instanceof Ref) { ctx.cadre.vars[cible.nom].ecrire(val); return val; }
        ctx.cadre.vars[cible.nom] = val; return val;
      }
      case "varvar": { var nom = this.versTexte(this.evaluer(cible.e, ctx), cible.ligne); ctx.cadre.vars[nom] = val; return val; }
      case "idx": { var conteneur = this.caseConteneur(cible.base, ctx); this.poserIndex(conteneur, cible, val, ctx); return val; }
      case "prop": { var obj = this.evaluer(cible.obj, ctx); this.ecrirePropriete(obj, cible, val, ctx); return val; }
      case "sprop": { this.ecrireStatique(cible, val, ctx); return val; }
      case "liste": this.destructurer(cible, val, ctx); return val;
    }
    throw new ErreurPhp("Affectation impossible", cible.ligne);
  };
  /* La case (conteneur + clé) à écrire — pour $a[x][y] = … on remonte. */
  M.caseConteneur = function (baseAst, ctx) {
    if (baseAst.t === "var") {
      var nom = baseAst.nom;
      if (nom === "_SESSION") { if (!this.session) this.session = new PhpArray(); return { obj: this, cle: "session", type: "session" }; }
      if (!(nom in ctx.cadre.vars) || deref(ctx.cadre.vars[nom]) === null || deref(ctx.cadre.vars[nom]) === undefined || deref(ctx.cadre.vars[nom]) === "") {
        var sg = this.superglobale(nom);
        if (sg instanceof PhpArray) return { arr: sg };
        if (ctx.cadre.vars[nom] instanceof Ref) { if (deref(ctx.cadre.vars[nom]) === null) ctx.cadre.vars[nom].ecrire(new PhpArray()); return { arr: deref(ctx.cadre.vars[nom]) }; }
        ctx.cadre.vars[nom] = new PhpArray();
      }
      var v = deref(ctx.cadre.vars[nom]);
      if (v instanceof PhpArray) return { arr: v };
      if (v instanceof PhpObjet) return { obj: v, type: "arrayaccess" };
      if (typeof v === "string") return { strVar: ctx.cadre.vars, nom: nom, type: "string" };
      throw new ErreurPhp("Cannot use a scalar value as an array", baseAst.ligne);
    }
    if (baseAst.t === "idx") {
      var parent = this.caseConteneur(baseAst.base, ctx);
      var arr = parent.arr;
      var k = baseAst.cle === null ? null : this.cleTableau(this.evaluer(baseAst.cle, ctx), baseAst.ligne);
      if (k === null) { var na = new PhpArray(); arr.pousser(na); return { arr: na }; }
      var ex = arr.get(k);
      if (!(ex instanceof PhpArray)) { if (ex === undefined || ex === null || ex === "") { ex = new PhpArray(); arr.set(k, ex); } else if (ex instanceof PhpObjet) return { obj: ex }; else throw new ErreurPhp("Cannot use a scalar value as an array", baseAst.ligne); }
      return { arr: ex };
    }
    if (baseAst.t === "prop") {
      var obj = this.evaluer(baseAst.obj, ctx);
      var pn = this.nomPropriete(baseAst, ctx);
      if (!(obj instanceof PhpObjet)) throw new ErreurPhp("Attempt to assign property \"" + pn + "\" on " + typeNom(obj), baseAst.ligne, "Error");
      var cur = obj.props[pn];
      if (!(cur instanceof PhpArray)) { cur = new PhpArray(); obj.set(pn, cur); }
      return { arr: cur };
    }
    var val = this.evaluer(baseAst, ctx);
    if (val instanceof PhpArray) return { arr: val };
    throw new ErreurPhp("Cannot use a scalar value as an array", baseAst.ligne);
  };
  M.poserIndex = function (conteneur, cible, val, ctx) {
    if (conteneur.type === "session") { if (!this.session) this.session = new PhpArray(); conteneur = { arr: this.session }; }
    if (conteneur.type === "string") {
      var s = deref(conteneur.strVar[conteneur.nom]);
      var i = versNombre(this.evaluer(cible.cle, ctx), this, cible.ligne);
      var ch = this.versTexte(val, cible.ligne)[0] || " ";
      while (s.length < i) s += " ";
      conteneur.strVar[conteneur.nom] = s.slice(0, i) + ch + s.slice(i + 1);
      return;
    }
    var arr = conteneur.arr;
    if (cible.cle === null) arr.pousser(val);
    else arr.set(this.cleTableau(this.evaluer(cible.cle, ctx), cible.ligne), val);
  };
  M.destructurer = function (liste, source, ctx) {
    if (!(source instanceof PhpArray)) { this.avertir("Trying to access array offset on " + typeNom(source), liste.ligne); source = new PhpArray(); }
    var auto = 0;
    for (var i = 0; i < liste.elems.length; i++) {
      var el = liste.elems[i];
      if (!el) { auto++; continue; }
      var k = el.cle !== null && el.cle !== undefined ? this.cleTableau(this.evaluer(el.cle, ctx), liste.ligne) : auto++;
      var v = source.has(k) ? copierValeur(source.get(k)) : null;
      if (el.val.t === "liste") this.destructurer(el.val, v, ctx);
      else this.ecrireCase(el.val, v, ctx);
    }
  };
  M.affecterRef = function (e, ctx) {
    var ref = this.obtenirRef(e.source, ctx);
    this.lierRef(e.cible, ref, ctx);
    return ref.lire();
  };
  M.lierRef = function (cible, ref, ctx) {
    if (cible.t === "var") { ctx.cadre.vars[cible.nom] = ref; return; }
    if (cible.t === "idx") { var c = this.caseConteneur(cible.base, ctx); var k = cible.cle === null ? c.arr.prochaine : this.cleTableau(this.evaluer(cible.cle, ctx), cible.ligne); if (!c.arr.has(k)) c.arr.cles.push(c.arr.normCle(k)); Object.defineProperty(c.arr.vals, c.arr.normCle(k), { get: function () { return ref.lire(); }, set: function (x) { ref.ecrire(x); }, configurable: true, enumerable: true }); return; }
    if (cible.t === "prop") { var obj = this.evaluer(cible.obj, ctx); var pn = this.nomPropriete(cible, ctx); if (obj.ordre.indexOf(pn) < 0) obj.ordre.push(pn); Object.defineProperty(obj.props, pn, { get: function () { return ref.lire(); }, set: function (x) { ref.ecrire(x); }, configurable: true, enumerable: true }); return; }
    throw new ErreurPhp("Référence impossible", cible.ligne);
  };
  M.obtenirRef = function (e, ctx) {
    if (e.t === "var") {
      var nom = e.nom;
      if (ctx.cadre.vars[nom] instanceof Ref) return ctx.cadre.vars[nom];
      if (!(nom in ctx.cadre.vars)) ctx.cadre.vars[nom] = null;
      return new Ref(ctx.cadre.vars, nom);
    }
    if (e.t === "idx") {
      var c = this.caseConteneur(e.base, ctx);
      var k = e.cle === null ? c.arr.pousser(null) : this.cleTableau(this.evaluer(e.cle, ctx), e.ligne);
      if (!c.arr.has(k)) c.arr.set(k, null);
      return new Ref(c.arr.vals, c.arr.normCle(k));
    }
    if (e.t === "prop") {
      var obj = this.evaluer(e.obj, ctx);
      var pn = this.nomPropriete(e, ctx);
      if (!(pn in obj.props)) obj.set(pn, null);
      return new Ref(obj.props, pn);
    }
    if (e.t === "sprop") {
      var classe = this.classeDe(this.resoudreNomClasse(e.classe, ctx, e.ligne).nom, e.ligne);
      for (var c = classe; c; c = c.parent) if (e.nom in c.propStatiques) return new Ref(c.propStatiques[e.nom], "val");
      throw new ErreurPhp("Access to undeclared static property " + classe.nom + "::$" + e.nom, e.ligne, "Error");
    }
    // une valeur non référencable : une case jetable
    var box = { v: this.evaluer(e, ctx) };
    return new Ref(box, "v");
  };
  M.detruire = function (cible, ctx) {
    if (cible.t === "var") { delete ctx.cadre.vars[cible.nom]; return; }
    if (cible.t === "idx") { var base = this.evaluerDouce(cible.base, ctx); if (base instanceof PhpArray && cible.cle !== null) base.supprimer(this.cleTableau(this.evaluer(cible.cle, ctx), cible.ligne)); return; }
    if (cible.t === "prop") { var obj = this.evaluer(cible.obj, ctx); var pn = this.nomPropriete(cible, ctx); if (obj instanceof PhpObjet) { delete obj.props[pn]; var i = obj.ordre.indexOf(pn); if (i >= 0) obj.ordre.splice(i, 1); } return; }
  };

  M.incrementer = function (e, ctx) {
    var ref = this.obtenirRef(e.cible, ctx);
    var av = ref.lire();
    var ap;
    if (e.op === "++") {
      if (av === null) ap = 1;
      else if (typeof av === "string") ap = incrChaine(av);
      else { var nn = numerique(av, this, e.ligne); ap = nombrePhp(nn.n + 1, nn.reel); }
    } else {
      if (av === null) { this.avertir("Decrement on type null has no effect, this will change in the next major version of PHP", e.ligne, "Warning"); ap = null; }
      else if (typeof av === "string" && !estChaineNumerique(av)) ap = av;   // -- sur une chaîne non numérique ne fait rien
      else { var nn2 = numerique(av, this, e.ligne); ap = nombrePhp(nn2.n - 1, nn2.reel); }
    }
    ref.ecrire(ap);
    return e.pre ? ap : av;
  };
  function incrChaine(s) {
    if (s === "") return "1";
    if (estChaineNumerique(s)) { var nn = numerique(s); return nombrePhp(nn.n + 1, nn.reel); }
    // l'incrément « perl » : z → aa, Az → Ba, a9 → b0
    var a = s.split(""), i = a.length - 1;
    for (;;) {
      var c = a[i];
      if (c >= "a" && c < "z" || c >= "A" && c < "Z" || c >= "0" && c < "9") { a[i] = String.fromCharCode(c.charCodeAt(0) + 1); break; }
      if (c === "z") { a[i] = "a"; }
      else if (c === "Z") { a[i] = "A"; }
      else if (c === "9") { a[i] = "0"; }
      else break;
      i--;
      if (i < 0) { a.unshift(c === "9" ? "1" : c === "z" ? "a" : "A"); break; }
    }
    return a.join("");
  }

  /* ── les opérateurs binaires ── */
  M.binaire = function (e, ctx) {
    var op = e.op;
    if (op === "xor") return versBool(this.evaluer(e.g, ctx)) !== versBool(this.evaluer(e.d, ctx));
    var g = this.evaluer(e.g, ctx), d = this.evaluer(e.d, ctx);
    return this.operation(op, g, d, e.ligne);
  };
  M.operation = function (op, g, d, ligne) {
    switch (op) {
      case ".": return this.versTexte(g, ligne) + this.versTexte(d, ligne);
      case "+":
        if (g instanceof PhpArray && d instanceof PhpArray) { var r = g.copie(); d.forEach(function (v, k) { if (!r.has(k)) r.set(k, copierValeur(v)); }); return r; }
        return this.arith("+", g, d, ligne);
      case "-": case "*": case "/": case "%": case "**": return this.arith(op, g, d, ligne);
      case "==": return egalLache(g, d, this, ligne);
      case "!=": return !egalLache(g, d, this, ligne);
      case "===": return egalStrict(g, d);
      case "!==": return !egalStrict(g, d);
      case "<": return comparer(g, d, this, ligne) < 0;
      case "<=": return comparer(g, d, this, ligne) <= 0;
      case ">": return comparer(g, d, this, ligne) > 0;
      case ">=": return comparer(g, d, this, ligne) >= 0;
      case "<=>": return comparer(g, d, this, ligne);
      case "&": return (entier32(g) & entier32(d));
      case "|": return (entier32(g) | entier32(d));
      case "^": return (entier32(g) ^ entier32(d));
      case "<<": return multEntier(entier32(g), Math.pow(2, entier32(d)));
      case ">>": return Math.floor(entier32(g) / Math.pow(2, entier32(d)));
    }
    throw new ErreurPhp("Opérateur inconnu " + op, ligne);
  };
  function entier32(v) { return Math.trunc(versNombre(v)) | 0; }
  function multEntier(a, b) { return a * b; }
  M.arith = function (op, g, d, ligne) {
    if ((g instanceof PhpArray || d instanceof PhpArray) && op !== "+") throw new ErreurPhp("Unsupported operand types: " + typeNom(g) + " " + op + " " + typeNom(d), ligne, "TypeError");
    if (typeof g === "string" && !estChaineNumerique(g) && /\S/.test(g) || typeof d === "string" && !estChaineNumerique(d) && /\S/.test(d)) {
      throw new ErreurPhp("Unsupported operand types: " + typeNom(g) + " " + op + " " + typeNom(d), ligne, "TypeError");
    }
    var a = numerique(g, this, ligne), b = numerique(d, this, ligne);
    var reel = a.reel || b.reel;
    switch (op) {
      case "+": return nombrePhp(a.n + b.n, reel);
      case "-": return nombrePhp(a.n - b.n, reel);
      case "*": return nombrePhp(a.n * b.n, reel);
      case "/":
        if (b.n === 0) throw new ErreurPhp("Division by zero", ligne, "DivisionByZeroError");
        var q = a.n / b.n;
        return nombrePhp(q, reel || !Number.isInteger(q));
      case "%":
        var bi = Math.trunc(b.n);
        if (bi === 0) throw new ErreurPhp("Modulo by zero", ligne, "DivisionByZeroError");
        return Math.trunc(a.n) % bi;
      case "**":
        var p = Math.pow(a.n, b.n);
        return nombrePhp(p, reel || b.n < 0 || !Number.isInteger(p));
    }
  };
  M.unaire = function (e, ctx) {
    var v = this.evaluer(e.e, ctx);
    if (e.op === "-") { var n = numerique(v, this, e.ligne); return nombrePhp(-n.n, n.reel); }
    if (e.op === "+") { var n2 = numerique(v, this, e.ligne); return nombrePhp(n2.n, n2.reel); }
    if (e.op === "~") return ~entier32(v);
    return v;
  };
  M.transtyper = function (e, ctx) {
    var v = this.evaluer(e.e, ctx);
    switch (e.type) {
      case "int": return Math.trunc(versNombre(v, this, e.ligne));
      case "float": return flottant(versNombre(v, this, e.ligne));
      case "bool": return versBool(v);
      case "string": return this.versTexte(v, e.ligne);
      case "array":
        if (v instanceof PhpArray) return v;
        if (v === null) return new PhpArray();
        if (v instanceof PhpObjet) { var a = new PhpArray(); v.ordre.forEach(function (k) { a.set(k, v.props[k]); }); return a; }
        return listeDe([v]);
      case "object":
        if (v instanceof PhpObjet) return v;
        var o = new PhpObjet(this.classes["stdclass"]);
        if (v instanceof PhpArray) v.forEach(function (x, k) { o.set(String(k), x); });
        else if (v !== null) o.set("scalar", v);
        return o;
      case "null": return null;
    }
    return v;
  };
  M.versTexte = function (v, ligne) { return versTexte(v, { moteur: this, avertir: this.avertir.bind(this) }, ligne); };

  M.lireConstante = function (nom, ligne) {
    if (nom in this.constantes) return this.constantes[nom];
    var k = nom.toUpperCase();
    var base = { PHP_EOL: "\n", PHP_INT_MAX: 9223372036854775807, PHP_INT_MIN: -9223372036854775808, PHP_INT_SIZE: 8,
      PHP_FLOAT_EPSILON: flottant(2.220446049250313e-16), PHP_FLOAT_MAX: flottant(1.7976931348623157e308), PHP_FLOAT_MIN: flottant(2.2250738585072014e-308),
      PHP_VERSION: "8.3.0", PHP_MAJOR_VERSION: 8, PHP_MINOR_VERSION: 3, PHP_OS: "Linux", PHP_OS_FAMILY: "Linux", DIRECTORY_SEPARATOR: "/", PATH_SEPARATOR: ":",
      M_PI: flottant(Math.PI), M_E: flottant(Math.E), M_SQRT2: flottant(Math.SQRT2), NAN: flottant(NaN), INF: flottant(Infinity),
      E_ALL: 32767, E_WARNING: 2, E_NOTICE: 8, E_ERROR: 1, E_STRICT: 2048, E_DEPRECATED: 8192, E_USER_WARNING: 512, E_USER_ERROR: 256,
      PHP_ROUND_HALF_UP: 1, PHP_ROUND_HALF_DOWN: 2, PHP_ROUND_HALF_EVEN: 3, PHP_ROUND_HALF_ODD: 4,
      SORT_REGULAR: 0, SORT_NUMERIC: 1, SORT_STRING: 2, SORT_FLAG_CASE: 8, SORT_ASC: 4, SORT_DESC: 3,
      COUNT_NORMAL: 0, COUNT_RECURSIVE: 1, STR_PAD_RIGHT: 1, STR_PAD_LEFT: 0, STR_PAD_BOTH: 2, ARRAY_FILTER_USE_KEY: 2, ARRAY_FILTER_USE_BOTH: 1,
      JSON_PRETTY_PRINT: 128, JSON_UNESCAPED_UNICODE: 256, JSON_UNESCAPED_SLASHES: 64, JSON_THROW_ON_ERROR: 4194304,
      ENT_QUOTES: 3, ENT_COMPAT: 2, ENT_NOQUOTES: 0, ENT_HTML5: 48, ENT_HTML401: 0,
      FILTER_VALIDATE_INT: 257, FILTER_VALIDATE_FLOAT: 259, FILTER_VALIDATE_BOOLEAN: 258, FILTER_VALIDATE_BOOL: 258,
      FILTER_VALIDATE_EMAIL: 274, FILTER_VALIDATE_URL: 273, FILTER_VALIDATE_IP: 275, FILTER_VALIDATE_DOMAIN: 277, FILTER_VALIDATE_REGEXP: 272,
      FILTER_SANITIZE_STRING: 513, FILTER_SANITIZE_NUMBER_INT: 519, FILTER_SANITIZE_EMAIL: 517, FILTER_SANITIZE_SPECIAL_CHARS: 515,
      FILTER_SANITIZE_FULL_SPECIAL_CHARS: 522, FILTER_DEFAULT: 516, FILTER_FLAG_IPV4: 1048576, FILTER_FLAG_IPV6: 2097152, FILTER_NULL_ON_FAILURE: 134217728,
      PASSWORD_DEFAULT: "2y", PASSWORD_BCRYPT: "2y", PASSWORD_BCRYPT_DEFAULT_COST: 12,
      true: true, TRUE: true, false: false, FALSE: false, null: null, NULL: null };
    if (k in base) return base[k];
    if (nom in base) return base[nom];
    throw new ErreurPhp("Undefined constant \"" + nom + "\"", ligne, "Error");
  };
  M.magique = function (e, ctx) {
    switch (e.nom) {
      case "__line__": return e.ligne;
      case "__file__": return "/atelier/" + (e.fichier || ctx.fichier);
      case "__dir__": return "/atelier";
      case "__function__": return ctx.fonction ? ctx.fonction.nomSimple || "" : "";
      case "__class__": return ctx.classe ? ctx.classe.nom : "";
      case "__method__": return ctx.classe && ctx.fonction ? ctx.classe.nom + "::" + (ctx.fonction.nomSimple || "") : (ctx.fonction ? ctx.fonction.nomSimple : "");
      case "__namespace__": return "";
    }
    return "";
  };

  /* ═══════════════ 7. LES FONCTIONS ═════════════════════════════════════ */
  M.appelFonction = function (e, ctx) {
    var nom = e.nom, k = nom.toLowerCase();
    if (k in this.fonctions) return this.appelerDeclaration(this.fonctions[k], e.args, ctx, null, null);
    if (k in INTEGREES) return this.appelInterne(k, e.args, ctx, e.ligne);
    throw new ErreurPhp("Call to undefined function " + nom + "()", e.ligne, "Error");
  };
  M.appelValeur = function (e, ctx) {
    var f = this.evaluer(e.f, ctx);
    return this.appelerCallable(f, this.evalArgs(e.args, ctx, null).positionnels, e.ligne, ctx, e.args);
  };
  M.appelerCallable = function (f, argsVal, ligne, ctx, argsAst) {
    if (typeof f === "string") {
      var k = f.toLowerCase();
      if (k.indexOf("::") > 0) { var pr = f.split("::"); return this.appelStatiqueDirect(pr[0], pr[1], argsVal, ligne, ctx); }
      if (k in this.fonctions) return this.appelerDeclaration(this.fonctions[k], argsAst || argsVal.map(enveloppeArg), ctx, null, null, argsVal);
      if (k in INTEGREES) return this.appelInterneVal(k, argsVal, ctx, ligne);
      throw new ErreurPhp("Call to undefined function " + f + "()", ligne, "Error");
    }
    if (f instanceof PhpObjet) {
      if (f.cloture) return this.appelerFermetureVal(f, argsVal, ligne);
      var inv = this.methode(f.classe, "__invoke");
      if (inv) return this.appelerMethode(f, inv, argsVal, ligne);
    }
    if (f instanceof PhpArray && f.taille() === 2) {
      var cible = f.get(0), meth = this.versTexte(f.get(1), ligne);
      if (cible instanceof PhpObjet) { var m = this.methode(cible.classe, meth.toLowerCase()); if (m) return this.appelerMethode(cible, m, argsVal, ligne); }
      if (typeof cible === "string") return this.appelStatiqueDirect(cible, meth, argsVal, ligne, ctx);
    }
    throw new ErreurPhp("Value not callable", ligne, "Error");
  };
  function enveloppeArg(v) { return { preEvalue: v, etale: false, nom: null }; }

  M.evalArgs = function (argsAst, ctx, decl) {
    // les valeurs des arguments, dans l'ordre, en déroulant ...$x et en notant les nommés
    var positionnels = [], nommes = Object.create(null);
    for (var i = 0; i < argsAst.length; i++) {
      var a = argsAst[i];
      if (a.preEvalue !== undefined) { positionnels.push(a.preEvalue); continue; }
      if (a.etale) {
        var src = this.evaluer(a.e, ctx);
        if (src instanceof PhpArray) src.forEach(function (v, kk) { if (typeof kk === "number") positionnels.push(v); else nommes[kk] = v; });
        continue;
      }
      if (a.nom) { nommes[a.nom] = this.evaluer(a.e, ctx); continue; }
      positionnels.push(this.evaluer(a.e, ctx));
    }
    return { positionnels: positionnels, nommes: nommes };
  };

  M.appelerDeclaration = function (decl, argsAst, ctx, thisObj, classe, argsValDejaEval) {
    var cadre = new Cadre(null);
    var params = decl.params;
    // d'abord, repérer les références : on les lie plutôt que de les copier
    var vals, nommes;
    if (argsValDejaEval) { vals = argsValDejaEval.slice(); nommes = Object.create(null); }
    else { var ev = this.evalArgsAvecRef(argsAst, ctx, params); vals = ev.positionnels; nommes = ev.nommes; ctx.__refsArgs = ev.refs; }
    var refs = ctx.__refsArgs || [];
    ctx.__refsArgs = null;
    var pi = 0;
    for (var p = 0; p < params.length; p++) {
      var par = params[p];
      if (par.variadique) {
        var reste = new PhpArray();
        for (; pi < vals.length; pi++) reste.pousser(copierValeur(deref(vals[pi])));
        for (var nk in nommes) reste.set(nk, copierValeur(nommes[nk]));
        cadre.vars[par.nom] = reste;
        break;
      }
      var fourni = pi < vals.length;
      var valeur;
      if (fourni) { valeur = vals[pi]; pi++; }
      else if (par.nom in nommes) { valeur = nommes[par.nom]; delete nommes[par.nom]; }
      else if (par.defaut) { valeur = this.evaluer(par.defaut, { moteur: this, cadre: cadre, fichier: decl.fichier, classe: classe, thisObj: thisObj, fonction: null }); }
      else {
        var attendus = this.compteObligatoires(params);
        var f = this.fichierCourant || this.pageEntree || "";
        throw new ErreurPhp("Too few arguments to function " + this.nomDecl(decl, classe) + "(), " + vals.length + " passed in " + f + " on line " + this.ligneCourante + " and " + (attendus.exact ? "exactly " : "at least ") + attendus.n + " expected", decl.ligne, "ArgumentCountError");
      }
      if (par.ref && refs[pi - 1]) { cadre.vars[par.nom] = refs[pi - 1]; }
      else {
        valeur = this.verifierType(par, deref(valeur), decl, classe, p + 1, decl.ligne);
        cadre.vars[par.nom] = copierValeur(valeur);
      }
      if (par.promu && thisObj) thisObj.set(par.nom, copierValeur(deref(cadre.vars[par.nom])));
    }
    // arguments nommés inconnus
    for (var extra in nommes) throw new ErreurPhp("Unknown named parameter $" + extra, decl.ligne, "Error");
    var fctx = { moteur: this, cadre: cadre, fichier: decl.fichier || ctx.fichier, classe: classe, thisObj: thisObj,
      fonction: { nomSimple: decl.nomSimple || decl.nom, cleStatique: (classe ? classe.nom + "::" : "") + (decl.nomSimple || decl.nom || "{closure}") } };
    if (thisObj) cadre.vars["this"] = thisObj;
    this.pileAppels = (this.pileAppels || 0) + 1;
    if (this.pileAppels > 2000) { this.pileAppels--; throw new ErreurPhp("Allowed memory exhausted / récursion trop profonde", decl.ligne, "Error"); }
    try {
      this.execCorps(decl.corps, fctx);
      return null;
    } catch (e) {
      if (e instanceof Signal && e.signal === "return") return this.verifierTypeRetour(decl, e.val);
      throw e;
    } finally { this.pileAppels--; }
  };
  M.evalArgsAvecRef = function (argsAst, ctx, params) {
    var positionnels = [], nommes = Object.create(null), refs = [];
    var idx = 0;
    for (var i = 0; i < argsAst.length; i++) {
      var a = argsAst[i];
      if (a.preEvalue !== undefined) { positionnels.push(a.preEvalue); refs[idx] = null; idx++; continue; }
      if (a.etale) {
        var src = this.evaluer(a.e, ctx);
        if (src instanceof PhpArray) src.forEach(function (v, kk) { if (typeof kk === "number") { positionnels.push(v); refs[idx] = null; idx++; } else nommes[kk] = v; });
        continue;
      }
      if (a.nom) { nommes[a.nom] = this.evaluer(a.e, ctx); continue; }
      var par = params && params[Math.min(idx, params.length - 1)];
      if (par && par.ref && (a.e.t === "var" || a.e.t === "idx" || a.e.t === "prop")) { var r = this.obtenirRef(a.e, ctx); refs[idx] = r; positionnels.push(r.lire()); }
      else { refs[idx] = null; positionnels.push(this.evaluer(a.e, ctx)); }
      idx++;
    }
    return { positionnels: positionnels, nommes: nommes, refs: refs };
  };
  M.compteObligatoires = function (params) {
    var n = 0, exact = true;
    for (var i = 0; i < params.length; i++) { if (params[i].variadique) { exact = false; break; } if (params[i].defaut) { exact = false; break; } n++; }
    return { n: n, exact: exact };
  };
  M.nomDecl = function (decl, classe) { return (classe ? classe.nom + "::" : "") + (decl.nomSimple || decl.nom || "{closure}"); };
  M.verifierType = function (par, v, decl, classe, pos, ligne) {
    if (!par.type) return v;
    var noms = par.type.noms;
    if (this.typeAccepte(noms, v)) return this.coercer(noms, v, decl, par, pos, ligne);
    if ((v === null) && par.defaut && par.defaut.t === "lit" && par.defaut.v === null) return null;
    throw new ErreurPhp(this.nomDecl(decl, classe) + "(): Argument #" + pos + " ($" + par.nom + ") must be of type " + par.type.texte + ", " + typeNom(v) + " given", decl.ligne, "TypeError");
  };
  M.typeAccepte = function (noms, v) {
    var t = typeNom(v);
    for (var i = 0; i < noms.length; i++) {
      var n = noms[i];
      if (n === "mixed") return true;
      if (n === t) return true;
      if (n === "float" && t === "int") return true;
      if (n === "bool" && (t === "bool")) return true;
      if (n === "iterable" && (t === "array")) return true;
      if (n === "callable" && (t === "string" || t === "array" || t === "object")) return true;
      if (n === "object" && t === "object") return true;
      if ((n === "int" || n === "string" || n === "float" || n === "bool") && (t === "int" || t === "float" || t === "string" || t === "bool")) return true;  // coercition en mode non strict
      if (v instanceof PhpObjet && this.estSousType(v.classe, n)) return true;
      if (n === "self" || n === "static" || n === "parent") return v instanceof PhpObjet;
    }
    return false;
  };
  M.coercer = function (noms, v, decl, par, pos, ligne) {
    var t = typeNom(v);
    if (noms.indexOf(t) >= 0 || noms.indexOf("mixed") >= 0) return v;
    var seul = noms.filter(function (n) { return n !== "null"; });
    if (seul.length === 1) {
      var n = seul[0];
      if (n === "int") { if (t === "float") { if (!Number.isInteger(v.v)) this.avertir("Implicit conversion from float " + texteNombre(v.v, true) + " to int loses precision", decl.ligne, "Deprecated"); return Math.trunc(v.v); } if (t === "string") { if (!estChaineNumerique(v)) throw this.typeErr(decl, par, pos, v); var nn = numerique(v); if (nn.reel && !Number.isInteger(nn.n)) this.avertir("Implicit conversion from float-string \"" + v + "\" to int loses precision", decl.ligne, "Deprecated"); return Math.trunc(nn.n); } if (t === "bool") return v ? 1 : 0; }
      if (n === "float") { if (t === "int") return flottant(v); if (t === "string") { if (!estChaineNumerique(v)) throw this.typeErr(decl, par, pos, v); return flottant(versNombre(v)); } if (t === "bool") return flottant(v ? 1 : 0); }
      if (n === "string") { if (t === "int" || t === "float" || t === "bool") return this.versTexte(v, ligne); }
      if (n === "bool") { if (t === "int" || t === "float" || t === "string") return versBool(v); }
    }
    return v;
  };
  M.typeErr = function (decl, par, pos, v) { return new ErreurPhp(this.nomDecl(decl) + "(): Argument #" + pos + " ($" + par.nom + ") must be of type " + par.type.texte + ", " + typeNom(v) + " given", decl.ligne, "TypeError"); };
  M.verifierTypeRetour = function (decl, v) {
    if (!decl.typeRetour) return v;
    var noms = decl.typeRetour.noms;
    if (noms.indexOf("void") >= 0 || noms.indexOf("never") >= 0 || noms.indexOf("mixed") >= 0) return v;
    if (this.typeAccepte(noms, v)) { var seul = noms.filter(function (n) { return n !== "null"; }); if (seul.length === 1) return this.coercer(noms, v, decl, { nom: "", type: decl.typeRetour }, 0, decl.ligne); return v; }
    throw new ErreurPhp(this.nomDecl(decl) + "(): Return value must be of type " + decl.typeRetour.texte + ", " + typeNom(v) + " returned", decl.ligne, "TypeError");
  };

  /* ── fermetures et fonctions fléchées ── */
  M.faireFermeture = function (e, ctx) {
    var capt = Object.create(null);
    for (var i = 0; i < e.uses.length; i++) {
      var u = e.uses[i];
      if (u.ref) { capt[u.nom] = this.obtenirRef({ t: "var", nom: u.nom, ligne: e.ligne }, ctx); }
      else capt[u.nom] = copierValeur(u.nom in ctx.cadre.vars ? deref(ctx.cadre.vars[u.nom]) : null);
    }
    return this.objetFermeture(e, capt, e.statique ? null : ctx.thisObj, ctx.classe);
  };
  M.faireFleche = function (e, ctx) {
    // une fonction fléchée capture TOUT l'environnement, par valeur, à la création
    var capt = Object.create(null);
    for (var k in ctx.cadre.vars) capt[k] = deref(ctx.cadre.vars[k]);
    return this.objetFermeture(e, capt, e.statique ? null : ctx.thisObj, ctx.classe, true);
  };
  M.objetFermeture = function (decl, capt, thisObj, classe, fleche) {
    var o = new PhpObjet(this.classes["closure"]);
    o.cloture = { decl: decl, capt: capt, thisObj: thisObj, classe: classe, fleche: fleche };
    return o;
  };
  M.appelerFermetureVal = function (o, argsVal, ligne) {
    var cl = o.cloture, decl = cl.decl;
    var cadre = new Cadre(null);
    for (var k in cl.capt) cadre.vars[k] = cl.capt[k] instanceof Ref ? cl.capt[k] : copierValeur(cl.capt[k]);
    // lier les paramètres
    var params = decl.params, pi = 0;
    for (var p = 0; p < params.length; p++) {
      var par = params[p];
      if (par.variadique) { var reste = new PhpArray(); for (; pi < argsVal.length; pi++) reste.pousser(copierValeur(argsVal[pi])); cadre.vars[par.nom] = reste; break; }
      var v = pi < argsVal.length ? argsVal[pi] : (par.defaut ? this.evaluer(par.defaut, { moteur: this, cadre: cadre, classe: cl.classe, thisObj: cl.thisObj, fichier: decl.fichier }) : null);
      pi++;
      cadre.vars[par.nom] = this.verifierType(par, deref(v), decl, cl.classe, p + 1, ligne);
    }
    var fctx = { moteur: this, cadre: cadre, fichier: decl.fichier, classe: cl.classe, thisObj: cl.thisObj, fonction: { nomSimple: "{closure}", cleStatique: "{closure}#" + o.id } };
    if (cl.thisObj) cadre.vars["this"] = cl.thisObj;
    this.pileAppels = (this.pileAppels || 0) + 1;
    if (this.pileAppels > 2000) { this.pileAppels--; throw new ErreurPhp("récursion trop profonde", decl.ligne, "Error"); }
    try {
      if (decl.t === "fleche") { var r = this.evaluer(decl.e, fctx); return this.verifierTypeRetour(decl, r); }
      this.execCorps(decl.corps, fctx);
      return null;
    } catch (err) { if (err instanceof Signal && err.signal === "return") return this.verifierTypeRetour(decl, err.val); throw err; }
    finally { this.pileAppels--; }
  };

  /* ═══════════════ 8. LES CLASSES ═══════════════════════════════════════ */
  M.definirClasse = function (st) {
    var self = this;
    var classe = { nom: st.nom, genre: st.genre, parent: null, interfaces: st.interfaces || [], abstraite: st.abstraite, finale: st.finale,
      decl: st, methodes: Object.create(null), proprietes: [], propStatiques: Object.create(null), constantes: Object.create(null), cas: Object.create(null), ordreCas: [] };
    this.classes[st.nom.toLowerCase()] = classe;
    // les traits : leurs membres sont copiés dans la classe
    (st.membres.traits || []).forEach(function (nt) {
      var tr = self.classes[nt.toLowerCase()];
      if (!tr) throw new ErreurPhp("Trait \"" + nt + "\" not found", st.ligne, "Error");
      tr.decl.membres.methodes.forEach(function (m) { classe.methodes[m.nom.toLowerCase()] = { decl: m, classe: classe }; });
      tr.decl.membres.proprietes.forEach(function (p) { classe.proprietes.push(p); if (p.statique) classe.propStatiques[p.nom] = { val: p.defaut ? self.evalConst(p.defaut, classe) : null }; });
    });
    if (st.parent) { classe.parent = this.classes[st.parent.toLowerCase()]; if (!classe.parent) throw new ErreurPhp("Class \"" + st.parent + "\" not found", st.ligne, "Error"); }
    st.membres.methodes.forEach(function (m) { classe.methodes[m.nom.toLowerCase()] = { decl: m, classe: classe }; });
    st.membres.proprietes.forEach(function (p) { classe.proprietes.push(p); if (p.statique) classe.propStatiques[p.nom] = { val: p.defaut ? self.evalConst(p.defaut, classe) : null }; });
    st.membres.constantes.forEach(function (c) { classe.constantes[c.nom] = { e: c.e, val: undefined, classe: classe, visibilite: c.visibilite }; });
    if (st.genre === "enum") (st.membres.cas || []).forEach(function (cas) { classe.ordreCas.push(cas.nom); classe.casAst = classe.casAst || {}; classe.casAst[cas.nom] = cas; });
    return classe;
  };
  M.evalConst = function (e, classe) {
    return this.evaluer(e, { moteur: this, cadre: new Cadre(null), classe: classe, thisObj: null, fichier: classe.decl.fichier });
  };
  M.classeDe = function (nom, ligne) {
    var c = this.classes[String(nom).toLowerCase().replace(/^\\/, "")];
    if (!c) throw new ErreurPhp("Class \"" + nom + "\" not found", ligne, "Error");
    return c;
  };
  M.estSousType = function (classe, nom) {
    nom = String(nom).toLowerCase().replace(/^\\/, "");
    for (var c = classe; c; c = c.parent) {
      if (c.nom.toLowerCase() === nom) return true;
      if (this.implemente(c, nom)) return true;
    }
    return false;
  };
  M.implemente = function (classe, nom) {
    for (var i = 0; i < classe.interfaces.length; i++) {
      if (classe.interfaces[i].toLowerCase() === nom) return true;
      var it = this.classes[classe.interfaces[i].toLowerCase()];
      if (it && (this.estSousType(it, nom))) return true;
    }
    return false;
  };
  M.estInstance = function (v, nomClasse) {
    if (!(v instanceof PhpObjet)) return false;
    var n = String(nomClasse).toLowerCase().replace(/^\\/, "");
    if (n === "throwable" && this.estJetable(v.classe)) return true;
    return this.estSousType(v.classe, n);
  };
  M.estJetable = function (classe) { return this.estSousType(classe, "exception") || this.estSousType(classe, "error") || this.estSousType(classe, "throwable"); };

  M.methode = function (classe, nomMin) {
    for (var c = classe; c; c = c.parent) if (c.methodes[nomMin]) return c.methodes[nomMin];
    return null;
  };
  M.infoPropriete = function (classe, nom) {
    for (var c = classe; c; c = c.parent) for (var i = 0; i < c.proprietes.length; i++) if (c.proprietes[i].nom === nom) return c.proprietes[i];
    return null;
  };
  M.instancier = function (e, ctx) {
    var nom = this.resoudreNomClasse(e.classe, ctx, e.ligne).nom;
    var classe = this.classeDe(nom, e.ligne);
    if (classe.abstraite && classe.genre === "class") throw new ErreurPhp("Cannot instantiate abstract class " + classe.nom, e.ligne, "Error");
    if (classe.genre === "interface") throw new ErreurPhp("Cannot instantiate interface " + classe.nom, e.ligne, "Error");
    if (classe.genre === "trait") throw new ErreurPhp("Cannot instantiate trait " + classe.nom, e.ligne, "Error");
    if (classe.genre === "enum") throw new ErreurPhp("Cannot instantiate enum " + classe.nom, e.ligne, "Error");
    var obj = this.nouvelObjet(classe);
    if (this.estJetable(classe)) { obj.set("file", "/atelier/" + (this.fichierCourant || this.pageEntree || "")); obj.set("line", e.ligne); obj.fichierSimple = this.fichierCourant || this.pageEntree; }
    var ctor = this.methode(classe, "__construct");
    if (ctor) {
      if (ctor.decl.visibilite !== "public" && ctx.classe !== ctor.classe && !(ctx.classe && this.estSousType(ctx.classe, ctor.classe.nom))) throw new ErreurPhp("Call to " + ctor.decl.visibilite + " " + classe.nom + "::__construct() from " + (ctx.classe ? "scope " + ctx.classe.nom : "global scope"), e.ligne, "Error");
      if (ctor.interne) ctor.interne.call(this, obj, this.evalArgs(e.args, ctx).positionnels, e.ligne, ctx);
      else this.appelerDeclaration(Object.assign({}, ctor.decl, { nomSimple: "__construct" }), e.args, ctx, obj, ctor.classe);
    } else if (e.args.length && !this.classeInterne(classe)) {
      // PHP ignore silencieusement les arguments si pas de constructeur
    }
    return obj;
  };
  M.nouvelObjet = function (classe) {
    var obj = new PhpObjet(classe);
    // les propriétés par défaut, du plus ancien ancêtre au plus récent
    var chaine = [];
    for (var c = classe; c; c = c.parent) chaine.unshift(c);
    var self = this;
    chaine.forEach(function (c) {
      c.proprietes.forEach(function (p) {
        if (p.statique) return;
        obj.set(p.nom, p.defaut ? copierValeur(self.evalConst(p.defaut, c)) : null);
      });
    });
    return obj;
  };
  M.resoudreNomClasse = function (astOuNom, ctx, ligne) {
    if (typeof astOuNom === "string") {
      var b = astOuNom.toLowerCase();
      if (b === "self") { if (!ctx.classe) throw new ErreurPhp("Cannot use \"self\" outside class", ligne, "Error"); return { nom: ctx.classe.nom }; }
      if (b === "static") { return { nom: (ctx.thisObj ? ctx.thisObj.classe.nom : (ctx.classe ? ctx.classe.nom : "")) }; }
      if (b === "parent") { if (!ctx.classe || !ctx.classe.parent) throw new ErreurPhp("Cannot use \"parent\" when current class scope has no parent", ligne, "Error"); return { nom: ctx.classe.parent.nom }; }
      return { nom: astOuNom.replace(/^\\/, "") };
    }
    var v = this.evaluer(astOuNom, ctx);
    if (v instanceof PhpObjet) return { nom: v.classe.nom };
    return { nom: this.versTexte(v, ligne).replace(/^\\/, "") };
  };
  M.cloner = function (e, ctx) {
    var v = this.evaluer(e.e, ctx);
    if (!(v instanceof PhpObjet)) throw new ErreurPhp("__clone method called on non-object", e.ligne, "Error");
    var o = new PhpObjet(v.classe);
    v.ordre.forEach(function (k) { o.set(k, copierValeur(v.props[k])); });
    var m = this.methode(v.classe, "__clone");
    if (m) this.appelerMethode(o, m, [], e.ligne);
    return o;
  };

  /* ── propriétés ── */
  M.nomPropriete = function (e, ctx) { return typeof e.nom === "string" ? e.nom : this.versTexte(this.evaluer(e.nom, ctx), e.ligne); };
  M.lirePropriete = function (e, ctx, douce) {
    var obj = this.evaluerDouce(e.obj, ctx);
    if (e.nullsafe && (obj === null || obj === undefined)) return null;
    var nom = this.nomPropriete(e, ctx);
    if (!(obj instanceof PhpObjet)) {
      if (obj === null || obj === undefined) { if (!douce) this.avertir("Attempt to read property \"" + nom + "\" on null", e.ligne); return null; }
      if (!douce) this.avertir("Attempt to read property \"" + nom + "\" on " + typeNom(obj), e.ligne);
      return null;
    }
    if (obj.has(nom)) {
      var info = this.infoPropriete(obj.classe, nom);
      if (info && info.visibilite !== "public" && !this.accesAutorise(info, obj.classe, ctx)) {
        var g = this.methode(obj.classe, "__get"); if (g) return this.appelerMethode(obj, g, [nom], e.ligne);
        throw new ErreurPhp("Cannot access " + info.visibilite + " property " + obj.classe.nom + "::$" + nom, e.ligne, "Error");
      }
      return obj.props[nom];
    }
    var mg = this.methode(obj.classe, "__get");
    if (mg) return this.appelerMethode(obj, mg, [nom], e.ligne);
    if (!douce) this.avertir("Undefined property: " + obj.classe.nom + "::$" + nom, e.ligne);
    return null;
  };
  M.accesAutorise = function (info, classeDef, ctx) {
    var vis = info.visibilite;
    if (vis === "public") return true;
    if (!ctx.classe) return false;
    if (vis === "private") return ctx.classe.nom === classeDef.nom || (this.proprietaireProp(ctx.classe, info.nom) === ctx.classe.nom);
    if (vis === "protected") return this.estSousType(ctx.classe, classeDef.nom) || this.estSousType(classeDef, ctx.classe.nom);
    return false;
  };
  M.proprietaireProp = function (classe, nom) { for (var c = classe; c; c = c.parent) for (var i = 0; i < c.proprietes.length; i++) if (c.proprietes[i].nom === nom) return c.nom; return null; };
  M.ecrirePropriete = function (obj, e, val, ctx) {
    var nom = this.nomPropriete(e, ctx);
    if (!(obj instanceof PhpObjet)) {
      if (obj === null || obj === undefined) throw new ErreurPhp("Attempt to assign property \"" + nom + "\" on null", e.ligne, "Error");
      throw new ErreurPhp("Attempt to assign property \"" + nom + "\" on " + typeNom(obj), e.ligne, "Error");
    }
    var info = this.infoPropriete(obj.classe, nom);
    if (info && info.visibilite !== "public" && !this.accesAutorise(info, obj.classe, ctx)) {
      var s = this.methode(obj.classe, "__set"); if (s) { this.appelerMethode(obj, s, [nom, val], e.ligne); return; }
      throw new ErreurPhp("Cannot access " + info.visibilite + " property " + obj.classe.nom + "::$" + nom, e.ligne, "Error");
    }
    if (!info && !obj.has(nom)) {
      // propriété dynamique : Deprecated en 8.2+, sauf #[AllowDynamicProperties] et stdClass
      if (obj.classe.nom !== "stdClass" && !this.methode(obj.classe, "__set")) this.avertir("Creation of dynamic property " + obj.classe.nom + "::$" + nom + " is deprecated", e.ligne, "Deprecated");
      var ms = this.methode(obj.classe, "__set"); if (ms && !obj.has(nom)) { this.appelerMethode(obj, ms, [nom, val], e.ligne); return; }
    }
    if (info && info.lectureSeule && obj.has(nom) && obj.props[nom] !== null && !(ctx.__initLectureSeule)) {
      throw new ErreurPhp("Cannot modify readonly property " + obj.classe.nom + "::$" + nom, e.ligne, "Error");
    }
    obj.set(nom, val);
  };

  /* ── statiques ── */
  M.lireStatique = function (e, ctx) {
    var classe = this.classeDe(this.resoudreNomClasse(e.classe, ctx, e.ligne).nom, e.ligne);
    for (var c = classe; c; c = c.parent) if (e.nom in c.propStatiques) return c.propStatiques[e.nom].val;
    throw new ErreurPhp("Access to undeclared static property " + classe.nom + "::$" + e.nom, e.ligne, "Error");
  };
  M.ecrireStatique = function (e, val, ctx) {
    var classe = this.classeDe(this.resoudreNomClasse(e.classe, ctx, e.ligne).nom, e.ligne);
    for (var c = classe; c; c = c.parent) if (e.nom in c.propStatiques) { c.propStatiques[e.nom].val = val; return; }
    throw new ErreurPhp("Access to undeclared static property " + classe.nom + "::$" + e.nom, e.ligne, "Error");
  };
  M.lireConstClasse = function (e, ctx) {
    var classe = this.classeDe(this.resoudreNomClasse(e.classe, ctx, e.ligne).nom, e.ligne);
    // les constantes des classes internes (PDO::…)
    if (classe.internes && e.nom in classe.internes) return classe.internes[e.nom];
    for (var c = classe; c; c = c.parent) {
      if (e.nom in c.constantes) { var k = c.constantes[e.nom]; if (k.val === undefined) k.val = this.evalConst(k.e, c); return k.val; }
      if (c.casAst && e.nom in c.casAst) return this.casEnum(c, e.nom, e.ligne);
    }
    // une constante d'interface
    for (var i = 0; i < classe.interfaces.length; i++) { var it = this.classes[classe.interfaces[i].toLowerCase()]; if (it && e.nom in it.constantes) { var kk = it.constantes[e.nom]; if (kk.val === undefined) kk.val = this.evalConst(kk.e, it); return kk.val; } }
    throw new ErreurPhp("Undefined constant " + classe.nom + "::" + e.nom, e.ligne, "Error");
  };
  M.casEnum = function (classe, nom, ligne) {
    classe.casObj = classe.casObj || {};
    if (classe.casObj[nom]) return classe.casObj[nom];
    var o = new PhpObjet(classe);
    o.set("name", nom);
    if (classe.casAst[nom].e) o.set("value", this.evalConst(classe.casAst[nom].e, classe));
    o.estCasEnum = true;
    classe.casObj[nom] = o;
    return o;
  };

  /* ── appels de méthodes ── */
  M.appelMethodeExpr = function (e, ctx) {
    var obj = this.evaluer(e.obj, ctx);
    if (e.nullsafe && (obj === null || obj === undefined)) return null;
    var nom = typeof e.nom === "string" ? e.nom : this.versTexte(this.evaluer(e.nom, ctx), e.ligne);
    if (!(obj instanceof PhpObjet)) throw new ErreurPhp("Call to a member function " + nom + "() on " + typeNom(obj), e.ligne, "Error");
    if (obj.cloture && nom.toLowerCase() === "call") { var a = this.evalArgs(e.args, ctx).positionnels; return this.appelerFermetureVal(obj, a, e.ligne); }
    var m = this.methode(obj.classe, nom.toLowerCase());
    if (!m) {
      var mc = this.methode(obj.classe, "__call");
      if (mc) { var args = listeDe(this.evalArgs(e.args, ctx).positionnels); return this.appelerMethode(obj, mc, [nom, args], e.ligne); }
      if (obj.classe.internes || this.classeInterne(obj.classe)) return this.appelMethodeInterne(obj, nom, this.evalArgs(e.args, ctx).positionnels, e.ligne, ctx);
      throw new ErreurPhp("Call to undefined method " + obj.classe.nom + "::" + nom + "()", e.ligne, "Error");
    }
    if (m.decl.visibilite !== "public" && !this.methodeAutorisee(m, obj.classe, ctx)) {
      var mc2 = this.methode(obj.classe, "__call");
      if (mc2 && ctx.classe !== m.classe) { var args2 = listeDe(this.evalArgs(e.args, ctx).positionnels); return this.appelerMethode(obj, mc2, [nom, args2], e.ligne); }
      throw new ErreurPhp("Call to " + m.decl.visibilite + " method " + obj.classe.nom + "::" + nom + "() from " + (ctx.classe ? "scope " + ctx.classe.nom : "global scope"), e.ligne, "Error");
    }
    if (this.classeInterne(m.classe) && m.interne) return m.interne.call(this, obj, this.evalArgs(e.args, ctx).positionnels, e.ligne, ctx);
    return this.appelerDeclaration(Object.assign({}, m.decl, { nomSimple: m.decl.nom }), e.args, ctx, obj, m.classe);
  };
  M.methodeAutorisee = function (m, classeObj, ctx) {
    var vis = m.decl.visibilite;
    if (vis === "public") return true;
    if (!ctx.classe) return false;
    if (vis === "private") return ctx.classe === m.classe;
    return this.estSousType(ctx.classe, m.classe.nom) || this.estSousType(m.classe, ctx.classe.nom);
  };
  M.appelerMethode = function (obj, m, argsVal, ligne) {
    if (this.classeInterne(m.classe) && m.interne) return m.interne.call(this, obj, argsVal, ligne, { moteur: this, classe: m.classe, thisObj: obj });
    return this.appelerDeclaration(Object.assign({}, m.decl, { nomSimple: m.decl.nom }), argsVal.map(enveloppeArg), { moteur: this, cadre: new Cadre(null), classe: m.classe, thisObj: obj, fichier: m.decl.fichier }, obj, m.classe, argsVal);
  };
  M.appelStatique = function (e, ctx) {
    var info = this.resoudreNomClasse(e.classe, ctx, e.ligne);
    var classe = this.classeDe(info.nom, e.ligne);
    var nom = typeof e.nom === "string" ? e.nom : this.versTexte(this.evaluer(e.nom, ctx), e.ligne);
    // Enum::cases(), Enum::from(), ::tryFrom()
    if (classe.genre === "enum") { var r = this.methodeEnum(classe, nom, this.evalArgs(e.args, ctx).positionnels, e.ligne); if (r !== undefined) return r; }
    var estParent = typeof e.classe === "string" && e.classe.toLowerCase() === "parent";
    var m = this.methode(classe, nom.toLowerCase());
    if (!m) {
      var mcs = this.methode(classe, "__callstatic");
      if (mcs) return this.appelerDeclaration(Object.assign({}, mcs.decl, { nomSimple: "__callStatic" }), [enveloppeArg(nom), enveloppeArg(listeDe(this.evalArgs(e.args, ctx).positionnels))], ctx, null, classe, [nom, listeDe(this.evalArgs(e.args, ctx).positionnels)]);
      throw new ErreurPhp("Call to undefined method " + classe.nom + "::" + nom + "()", e.ligne, "Error");
    }
    // parent::methode() et self::methode() depuis une méthode d'instance : $this reste
    var thisObj = null;
    if (!m.decl.statique && ctx.thisObj && this.estSousType(ctx.thisObj.classe, classe.nom) || (!m.decl.statique && ctx.thisObj && estParent)) thisObj = ctx.thisObj;
    if (m.decl.visibilite !== "public" && !this.methodeAutorisee(m, classe, ctx)) throw new ErreurPhp("Call to " + m.decl.visibilite + " method " + classe.nom + "::" + nom + "() from " + (ctx.classe ? "scope " + ctx.classe.nom : "global scope"), e.ligne, "Error");
    return this.appelerDeclaration(Object.assign({}, m.decl, { nomSimple: m.decl.nom }), e.args, ctx, thisObj, estParent ? classe : m.classe);
  };
  M.appelStatiqueDirect = function (nomClasse, nomMeth, argsVal, ligne, ctx) {
    var classe = this.classeDe(nomClasse, ligne);
    var m = this.methode(classe, nomMeth.toLowerCase());
    if (!m) throw new ErreurPhp("Call to undefined method " + classe.nom + "::" + nomMeth + "()", ligne, "Error");
    return this.appelerMethode(null, m, argsVal, ligne);
  };
  M.methodeEnum = function (classe, nom, args, ligne) {
    var n = nom.toLowerCase();
    if (n === "cases") { var self = this; return listeDe(classe.ordreCas.map(function (c) { return self.casEnum(classe, c, ligne); })); }
    if (n === "from" || n === "tryfrom") {
      var val = args[0];
      for (var i = 0; i < classe.ordreCas.length; i++) { var o = this.casEnum(classe, classe.ordreCas[i], ligne); if (o.has("value") && egalStrict(o.props["value"], val)) return o; }
      if (n === "tryfrom") return null;
      throw this.exception("ValueError", versTexte(val, null) + " is not a valid backing value for enum " + classe.nom, ligne);
    }
    return undefined;
  };
  M.evalInstanceof = function (e, ctx) {
    var v = this.evaluer(e.e, ctx);
    if (!(v instanceof PhpObjet)) return false;
    var nom = e.classe.t === "nomClasse" ? e.classe.nom : (function () { var x = this.evaluer(e.classe, ctx); return x instanceof PhpObjet ? x.classe.nom : this.versTexte(x, e.ligne); }).call(this);
    return this.estInstance(v, this.resoudreNomClasse(nom, ctx, e.ligne).nom);
  };
  M.evalMatch = function (e, ctx) {
    var sujet = this.evaluer(e.sujet, ctx);
    for (var i = 0; i < e.bras.length; i++) {
      var b = e.bras[i];
      if (b.conds === null) continue;
      for (var j = 0; j < b.conds.length; j++) if (egalStrict(sujet, this.evaluer(b.conds[j], ctx))) return this.evaluer(b.e, ctx);
    }
    for (var k = 0; k < e.bras.length; k++) if (e.bras[k].conds === null) return this.evaluer(e.bras[k].e, ctx);
    throw this.exception("UnhandledMatchError", "Unhandled match case " + this.representer(sujet), e.ligne);
  };
  M.representer = function (v) {
    if (typeof v === "string") return "'" + v + "'";
    if (v === true) return "true"; if (v === false) return "false"; if (v === null) return "NULL";
    if (v instanceof PhpObjet) return "of type " + v.classe.nom;
    return this.versTexte(v, 0);
  };

  /* ── isset ── */
  M.evalIsset = function (e, ctx) {
    for (var i = 0; i < e.args.length; i++) { var v = this.evaluerIsset(e.args[i], ctx); if (v === null || v === undefined) return false; }
    return true;
  };
  M.evalIsset = function (e, ctx) {
    for (var i = 0; i < e.args.length; i++) {
      var ok = this.existe(e.args[i], ctx);
      if (!ok) return false;
    }
    return true;
  };
  M.existe = function (e, ctx) {
    if (e.t === "var") { if (e.nom === "this") return !!ctx.thisObj; if (e.nom in ctx.cadre.vars) return deref(ctx.cadre.vars[e.nom]) !== null && deref(ctx.cadre.vars[e.nom]) !== undefined; var sg = this.superglobale(e.nom); return sg !== undefined && sg !== null; }
    if (e.t === "idx") {
      var base = this.evaluerDouce(e.base, ctx);
      if (base instanceof PhpArray) { if (e.cle === null) return false; var k = this.cleTableau(this.evaluer(e.cle, ctx), e.ligne); return base.has(k) && base.get(k) !== null; }
      if (typeof base === "string") { var i = Math.trunc(versNombre(this.evaluer(e.cle, ctx))); return i >= 0 && i < base.length; }
      return false;
    }
    if (e.t === "prop") { var obj = this.evaluerDouce(e.obj, ctx); if (!(obj instanceof PhpObjet)) return false; var nom = this.nomPropriete(e, ctx); if (obj.has(nom)) return obj.props[nom] !== null; var m = this.methode(obj.classe, "__isset"); if (m) return versBool(this.appelerMethode(obj, m, [nom], e.ligne)); return false; }
    if (e.t === "sprop") { try { var v = this.lireStatique(e, ctx); return v !== null && v !== undefined; } catch (x) { return false; } }
    var val = this.evaluerDouce(e, ctx);
    return val !== null && val !== undefined;
  };

  /* ═══════════════ 9. LES EXCEPTIONS ════════════════════════════════════ */
  M.lancer = function (obj, ligne) {
    if (!(obj instanceof PhpObjet) || !this.estJetable(obj.classe)) throw new ErreurPhp("Can only throw objects", ligne, "TypeError");
    throw new Lancee(obj);
  };
  M.exception = function (nomClasse, message, ligne) {
    var classe = this.classes[nomClasse.toLowerCase()] || this.classes["exception"];
    var o = this.nouvelObjet(classe);
    o.set("message", message); o.set("code", 0); o.set("file", "/atelier/" + (this.fichierCourant || "")); o.set("line", ligne || this.ligneCourante);
    return new Lancee(o);
  };
  M.initClassesDeBase = function () {
    var self = this;
    // on compile en texte PHP les classes de base, pour qu'elles se comportent comme les vraies
    var base = [
      "class stdClass {}",
      "interface Throwable {}",
      "interface Stringable { public function __toString(): string; }",
      "interface Countable { public function count(): int; }",
      "interface JsonSerializable {}",
      "interface Traversable {}",
      "interface Iterator extends Traversable {}",
      "interface IteratorAggregate extends Traversable {}",
      "interface ArrayAccess {}",
      "interface UnitEnum {}",
      "interface BackedEnum extends UnitEnum {}",
      "class Closure {}",
      "class Exception implements Throwable {",
      "  protected $message = ''; protected $code = 0; protected $file = ''; protected $line = 0; private $previous = null;",
      "  public function __construct($message = '', $code = 0, $previous = null) { $this->message = $message; $this->code = $code; $this->previous = $previous; }",
      "  public function getMessage(): string { return $this->message; }",
      "  public function getCode() { return $this->code; }",
      "  public function getPrevious() { return $this->previous; }",
      "  public function getFile(): string { return $this->file; }",
      "  public function getLine(): int { return $this->line; }",
      "  public function getTrace(): array { return []; }",
      "  public function getTraceAsString(): string { return '#0 {main}'; }",
      "  public function __toString(): string { return get_class($this) . ': ' . $this->message; }",
      "}",
      "class Error implements Throwable {",
      "  protected $message = ''; protected $code = 0; protected $file = ''; protected $line = 0; private $previous = null;",
      "  public function __construct($message = '', $code = 0, $previous = null) { $this->message = $message; $this->code = $code; $this->previous = $previous; }",
      "  public function getMessage(): string { return $this->message; }",
      "  public function getCode() { return $this->code; }",
      "  public function getPrevious() { return $this->previous; }",
      "  public function getFile(): string { return $this->file; }",
      "  public function getLine(): int { return $this->line; }",
      "  public function getTrace(): array { return []; }",
      "  public function getTraceAsString(): string { return '#0 {main}'; }",
      "  public function __toString(): string { return get_class($this) . ': ' . $this->message; }",
      "}",
      "class ErrorException extends Exception {}",
      "class TypeError extends Error {}",
      "class ValueError extends Error {}",
      "class ArgumentCountError extends TypeError {}",
      "class ArithmeticError extends Error {}",
      "class DivisionByZeroError extends ArithmeticError {}",
      "class UnhandledMatchError extends Error {}",
      "class AssertionError extends Error {}",
      "class LogicException extends Exception {}",
      "class BadFunctionCallException extends LogicException {}",
      "class BadMethodCallException extends BadFunctionCallException {}",
      "class DomainException extends LogicException {}",
      "class InvalidArgumentException extends LogicException {}",
      "class LengthException extends LogicException {}",
      "class OutOfRangeException extends LogicException {}",
      "class RuntimeException extends Exception {}",
      "class OutOfBoundsException extends RuntimeException {}",
      "class OverflowException extends RuntimeException {}",
      "class RangeException extends RuntimeException {}",
      "class UnderflowException extends RuntimeException {}",
      "class UnexpectedValueException extends RuntimeException {}",
      "class JsonException extends Exception {}",
    ].join("\n");
    var arbre = ANALYSE.analyser("<?php\n" + base, "<base>");
    arbre.corps.forEach(function (st) { if (st.t === "classe") self.definirClasse(st); });
    this.definirPDO();
  };
  M.classeInterne = function (classe) { for (var c = classe; c; c = c.parent) if (c.interne) return true; return false; };

  /* ═══════════════ 10. PDO ══════════════════════════════════════════════ */
  M.definirPDO = function () {
    var self = this;
    var pdo = { nom: "PDO", genre: "class", parent: null, interfaces: [], methodes: Object.create(null), proprietes: [], propStatiques: Object.create(null), constantes: Object.create(null), interne: true,
      internes: { FETCH_ASSOC: 2, FETCH_NUM: 3, FETCH_BOTH: 4, FETCH_OBJ: 5, FETCH_LAZY: 1, FETCH_COLUMN: 7, FETCH_KEY_PAIR: 12, FETCH_UNIQUE: 196608, FETCH_CLASS: 8,
        ATTR_ERRMODE: 3, ERRMODE_SILENT: 0, ERRMODE_WARNING: 1, ERRMODE_EXCEPTION: 2, ATTR_DEFAULT_FETCH_MODE: 19, ATTR_EMULATE_PREPARES: 20,
        PARAM_NULL: 0, PARAM_INT: 1, PARAM_STR: 2, PARAM_BOOL: 5, PARAM_LOB: 3, ATTR_PERSISTENT: 12, CASE_NATURAL: 0, MYSQL_ATTR_INIT_COMMAND: 1002 } };
    function def(classe, nom, fn) { classe.methodes[nom.toLowerCase()] = { decl: { nom: nom, visibilite: "public", params: [] }, classe: classe, interne: fn }; }
    def(pdo, "__construct", function (obj, args, ligne) {
      var dsn = versTexte(args[0], null);
      obj.pdoServeur = self.serveur;
      obj.pdoErrmode = 0;
      obj.pdoFetch = 4;
      var mBase = /dbname\s*=\s*([^;]+)/i.exec(dsn);
      if (!self.serveur) throw self.pdoException("could not find driver", "HY000", ligne, obj);
      if (mBase) { try { self.serveur.courante = self.serveur.base(mBase[1].trim()).nom; } catch (e) { throw self.pdoException("SQLSTATE[HY000] [1049] Unknown database '" + mBase[1].trim() + "'", "HY000", ligne, obj); } }
      return null;
    });
    def(pdo, "setAttribute", function (obj, args) { if (args[0] === 3) obj.pdoErrmode = versNombre(args[1]); if (args[0] === 19) obj.pdoFetch = versNombre(args[1]); return true; });
    def(pdo, "getAttribute", function (obj, args) { if (args[0] === 3) return obj.pdoErrmode; return null; });
    def(pdo, "query", function (obj, args, ligne) {
      var r = self.pdoExec(obj, versTexte(args[0], null), null, ligne);
      if (r === false) return false;
      var st = self.nouvelObjet(self.classes["pdostatement"]);
      st.pdo = obj; st.resultat = r; st.pos = 0; st.pdoFetch = args.length > 1 ? versNombre(args[1]) : obj.pdoFetch;
      return st;
    });
    def(pdo, "exec", function (obj, args, ligne) {
      var r = self.pdoExec(obj, versTexte(args[0], null), null, ligne);
      if (r === false) return false;
      return r.type === "modif" ? (r.affectees || 0) : 0;
    });
    def(pdo, "prepare", function (obj, args, ligne) {
      var st = self.nouvelObjet(self.classes["pdostatement"]);
      st.pdo = obj; st.sql = versTexte(args[0], null); st.lies = new PhpArray(); st.pdoFetch = obj.pdoFetch; st.pos = 0;
      return st;
    });
    def(pdo, "lastInsertId", function (obj) { return String(self.serveur ? self.serveur.derniereId || 0 : 0); });
    def(pdo, "beginTransaction", function () { return true; });
    def(pdo, "commit", function () { return true; });
    def(pdo, "rollBack", function () { return true; });
    def(pdo, "inTransaction", function () { return false; });
    def(pdo, "quote", function (obj, args) { return "'" + versTexte(args[0], null).replace(/'/g, "''") + "'"; });
    def(pdo, "errorInfo", function (obj) { return obj.pdoErreur || listeDe(["00000", null, null]); });
    def(pdo, "errorCode", function (obj) { return obj.pdoErreur ? obj.pdoErreur.get(0) : "00000"; });
    this.classes["pdo"] = pdo;

    var stmt = { nom: "PDOStatement", genre: "class", parent: null, interfaces: ["Traversable"], methodes: Object.create(null), proprietes: [{ nom: "queryString", defaut: null, visibilite: "public" }], propStatiques: Object.create(null), constantes: Object.create(null), interne: true, internes: pdo.internes };
    def(stmt, "execute", function (obj, args, ligne) {
      var params = args[0] instanceof PhpArray ? args[0] : obj.lies;
      var p = self.pdoParams(params);
      var r = self.pdoExec(obj.pdo, obj.sql, p, ligne);
      if (r === false) return false;
      obj.resultat = r; obj.pos = 0;
      return true;
    });
    def(stmt, "bindValue", function (obj, args) { var cle = typeof args[0] === "number" ? args[0] : versTexte(args[0], null); obj.lies.set(cle, args[1]); return true; });
    def(stmt, "bindParam", function (obj, args) { var cle = typeof args[0] === "number" ? args[0] : versTexte(args[0], null); obj.lies.set(cle, args[1]); return true; });
    def(stmt, "fetch", function (obj, args, ligne) {
      if (!obj.resultat || obj.resultat.type !== "select") return false;
      if (obj.pos >= obj.resultat.lignes.length) return false;
      var mode = args.length ? versNombre(args[0]) : obj.pdoFetch;
      return self.pdoLigne(obj.resultat, obj.pos++, mode);
    });
    def(stmt, "fetchAll", function (obj, args, ligne) {
      var out = new PhpArray();
      if (!obj.resultat || obj.resultat.type !== "select") return out;
      var mode = args.length ? versNombre(args[0]) : obj.pdoFetch;
      if (mode === 7) { for (var i = obj.pos; i < obj.resultat.lignes.length; i++) out.pousser(self.pdoValeur(obj.resultat, i, 0)); obj.pos = obj.resultat.lignes.length; return out; }
      while (obj.pos < obj.resultat.lignes.length) out.pousser(self.pdoLigne(obj.resultat, obj.pos++, mode));
      return out;
    });
    def(stmt, "fetchColumn", function (obj, args) {
      if (!obj.resultat || obj.resultat.type !== "select") return false;
      if (obj.pos >= obj.resultat.lignes.length) return false;
      var col = args.length ? versNombre(args[0]) : 0;
      return self.pdoValeur(obj.resultat, obj.pos++, col);
    });
    def(stmt, "rowCount", function (obj) { if (!obj.resultat) return 0; return obj.resultat.type === "select" ? obj.resultat.lignes.length : (obj.resultat.affectees || 0); });
    def(stmt, "columnCount", function (obj) { return obj.resultat && obj.resultat.colonnes ? obj.resultat.colonnes.length : 0; });
    def(stmt, "setFetchMode", function (obj, args) { obj.pdoFetch = versNombre(args[0]); return true; });
    def(stmt, "errorInfo", function (obj) { return obj.pdo.pdoErreur || listeDe(["00000", null, null]); });
    def(stmt, "errorCode", function (obj) { return obj.pdo.pdoErreur ? obj.pdo.pdoErreur.get(0) : "00000"; });
    def(stmt, "closeCursor", function (obj) { obj.pos = obj.resultat ? obj.resultat.lignes.length : 0; return true; });
    this.classes["pdostatement"] = stmt;

    var pdoEx = { nom: "PDOException", genre: "class", parent: this.classes["runtimeexception"], interfaces: [], methodes: Object.create(null), proprietes: [], propStatiques: Object.create(null), constantes: Object.create(null) };
    this.classes["pdoexception"] = pdoEx;
  };
  M.pdoParams = function (arr) {
    // transforme [':login' => 'x'] ou [0 => 'x'] en ce que sql.js attend
    if (!(arr instanceof PhpArray)) return null;
    if (arr.estListe()) { var l = []; arr.forEach(function (v) { l.push(valeurSql(v)); }); return l; }
    var o = Object.create(null);
    arr.forEach(function (v, k) { o[String(k).replace(/^:/, "")] = valeurSql(v); });
    return o;
  };
  function valeurSql(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return v;
    if (estFloat(v)) return v.v;
    if (v === true) return 1;
    if (v === false) return 0;
    return String(v);
  }
  M.pdoExec = function (obj, sql, params, ligne) {
    if (!this.serveur) throw this.pdoException("SQLSTATE[HY000]: General error: driver indisponible", "HY000", ligne, obj);
    var r;
    try { r = this.serveur.requete(sql, params); }
    catch (e) {
      if (!e.sql) throw e;
      obj.pdoErreur = listeDe([e.etat || "HY000", e.code || 0, e.message]);
      if (obj.pdoErrmode === 2) throw this.pdoException("SQLSTATE[" + (e.etat || "HY000") + "] [" + e.code + "] " + e.message, e.etat, ligne, obj, e.code);
      if (obj.pdoErrmode === 1) this.avertir("PDO::query(): SQLSTATE[" + (e.etat || "HY000") + "]: " + e.message, ligne);
      return false;
    }
    obj.pdoErreur = listeDe(["00000", null, null]);
    return r;
  };
  M.pdoException = function (message, etat, ligne, obj, code) {
    var o = this.nouvelObjet(this.classes["pdoexception"]);
    o.set("message", message); o.set("code", code || 0); o.set("errorInfo", listeDe([etat || "HY000", code || 0, message]));
    o.set("line", ligne || this.ligneCourante); o.set("file", "/atelier/" + (this.fichierCourant || ""));
    return new Lancee(o);
  };
  M.pdoLigne = function (res, i, mode) {
    var ligne = res.lignes[i], cols = res.colonnes, types = res.types || [];
    var assoc = (mode & 2) || mode === 4 || !mode;
    var num = (mode & 3) === 3 || mode === 4;
    if (mode === 5) { var o = new PhpObjet(this.classes["stdclass"]); for (var j = 0; j < cols.length; j++) o.set(cols[j], this.valeurPhp(ligne[j], types[j])); return o; }
    var a = new PhpArray();
    for (var k = 0; k < cols.length; k++) {
      var val = this.valeurPhp(ligne[k], types[k]);
      if (mode === 2 || mode === 4 || !mode) a.set(cols[k], val);
      if (mode === 3 || mode === 4) a.set(k, val);
    }
    if (mode === 4 || mode === undefined) { /* FETCH_BOTH déjà rempli */ }
    return a;
  };
  M.pdoValeur = function (res, i, col) { return this.valeurPhp(res.lignes[i][col], (res.types || [])[col]); };
  M.valeurPhp = function (v, type) {
    if (v === null || v === undefined) return null;
    // mysqlnd rend tout en chaîne par défaut (émulation des requêtes préparées PDO)
    if (typeof v === "number") return SQL && SQL.afficher ? SQL.afficher(v, type) : String(v);
    if (type && type.famille === "decimal" && typeof v === "number") return v.toFixed(type.args && type.args.length > 1 ? type.args[1] : 0);
    return String(v);
  };

  /* ── appeler une méthode interne (PDO) ── */
  M.appelMethodeInterne = function (obj, nom, args, ligne, ctx) {
    var m = this.methode(obj.classe, nom.toLowerCase());
    if (m && m.interne) return m.interne.call(this, obj, args, ligne, ctx);
    throw new ErreurPhp("Call to undefined method " + obj.classe.nom + "::" + nom + "()", ligne, "Error");
  };

  /* ═══════════════ 11. INCLUDE / REQUIRE ════════════════════════════════ */
  M.inclure = function (e, ctx) {
    var nom = this.versTexte(this.evaluer(e.e, ctx), e.ligne).replace(/^\.\//, "");
    var src = this.fichiers[nom];
    if (src === undefined) {
      var m = e.mode.indexOf("require") === 0 ? "require" : "include";
      if (m === "require") throw new ErreurPhp("Failed opening required '" + nom + "' (include_path='.')", e.ligne, "Error");
      this.avertir(e.mode + "(" + nom + "): Failed to open stream: No such file or directory", e.ligne);
      this.avertir(e.mode + "(): Failed opening '" + nom + "' for inclusion (include_path='.')", e.ligne);
      return false;
    }
    if (e.mode.indexOf("_once") > 0 && this.inclus[nom]) return true;
    this.inclus[nom] = true;
    var arbre = ANALYSE.analyser(src, nom);
    this.chargerDeclarations(arbre);
    var prec = this.fichierCourant;
    this.fichierCourant = nom;
    // le fichier inclus partage les variables de la portée appelante
    try { this.execCorps(arbre.corps, { moteur: this, cadre: ctx.cadre, fichier: nom, classe: ctx.classe, thisObj: ctx.thisObj, fonction: ctx.fonction }); return 1; }
    catch (sig) { if (sig instanceof Signal && sig.signal === "return") return sig.val; throw sig; }
    finally { this.fichierCourant = prec; }
  };

  /* ═══════════════ 12. LES FONCTIONS INTÉGRÉES ══════════════════════════ */
  M.appelInterne = function (k, argsAst, ctx, ligne) {
    var spec = INTEGREES[k];
    var ev = this.evalArgsAvecRef(argsAst, ctx, spec.params);
    return this.lancerInterne(k, ev.positionnels, ev.refs, ligne, ctx, argsAst);
  };
  M.appelInterneVal = function (k, argsVal, ctx, ligne) { return this.lancerInterne(k, argsVal, [], ligne, ctx, null); };
  M.lancerInterne = function (k, args, refs, ligne, ctx, argsAst) {
    var spec = INTEGREES[k];
    if (spec.min !== undefined && args.length < spec.min) throw new ErreurPhp(k + "() expects " + (spec.max === spec.min ? "exactly" : "at least") + " " + spec.min + " argument" + (spec.min > 1 ? "s" : "") + ", " + args.length + " given", ligne, "ArgumentCountError");
    return spec.fn.call(this, args.map(deref), { refs: refs, ligne: ligne, ctx: ctx, args: args, argsAst: argsAst });
  };

  /* La valeur « print_r » / « var_dump » / « var_export ». */
  M.print_r = function (v, retrait) {
    retrait = retrait || "";
    if (v instanceof PhpArray || v instanceof PhpObjet) {
      var entete = v instanceof PhpArray ? "Array" : v.classe.nom + " Object";
      var s = entete + "\n" + retrait + "(\n";
      var dedans = retrait + "    ";
      var self = this;
      var paires = v instanceof PhpArray ? v.cles.map(function (k) { return [k, v.vals[k]]; }) : v.ordre.map(function (k) { return [k, v.props[k]]; });
      paires.forEach(function (p) { s += dedans + "[" + p[0] + "] => " + self.print_r(p[1], dedans + "    ") + "\n"; });
      return s + retrait + ")\n";
    }
    return this.versTexte(v, 0);
  };
  M.var_dump = function (v, retrait) {
    retrait = retrait || "";
    if (typeof v === "string") return "string(" + octetsDe(v) + ") \"" + v + "\"";
    if (typeof v === "number") return "int(" + texteNombre(v, false) + ")";
    if (estFloat(v)) return "float(" + dumpFloat(v.v) + ")";
    if (v === true) return "bool(true)";
    if (v === false) return "bool(false)";
    if (v === null || v === undefined) return "NULL";
    if (v instanceof PhpArray) {
      var s = "array(" + v.taille() + ") {\n";
      var self = this;
      v.forEach(function (val, k) { s += retrait + "  [" + (typeof k === "number" ? k : "\"" + k + "\"") + "]=>\n" + retrait + "  " + self.var_dump(val, retrait + "  ") + "\n"; });
      return s + retrait + "}";
    }
    if (v instanceof PhpObjet) {
      if (v.estCasEnum) return "enum(" + v.classe.nom + "::" + v.props["name"] + ")";
      var props = v.ordre;
      var o = "object(" + v.classe.nom + ")#" + v.id + " (" + props.length + ") {\n";
      var self2 = this;
      props.forEach(function (k) { var info = self2.infoPropriete(v.classe, k); var vis = info && info.visibilite === "private" ? ":\"" + v.classe.nom + "\":private" : info && info.visibilite === "protected" ? ":protected" : ""; o += retrait + "  [\"" + k + "\"" + vis + "]=>\n" + retrait + "  " + self2.var_dump(v.props[k], retrait + "  ") + "\n"; });
      return o + retrait + "}";
    }
    return "NULL";
  };
  function dumpFloat(n) { return formatFloat(n, 0, 17); }
  function octetsDe(s) { return EMP.octets(s).length; }
  M.var_export = function (v, retrait) {
    retrait = retrait || "";
    if (typeof v === "string") return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
    if (typeof v === "number") return String(v);
    if (estFloat(v)) return Number.isInteger(v.v) ? v.v + ".0" : dumpFloat(v.v);
    if (v === true) return "true"; if (v === false) return "false"; if (v === null) return "NULL";
    if (v instanceof PhpArray) {
      var s = "array (\n", self = this;
      v.forEach(function (val, k) { s += retrait + "  " + (typeof k === "number" ? k : "'" + k + "'") + " => " + (val instanceof PhpArray ? "\n" + retrait + "  " : "") + self.var_export(val, retrait + "  ") + ",\n"; });
      return s + retrait + ")";
    }
    if (v instanceof PhpObjet) {
      var o = "\\" + v.classe.nom + "::__set_state(array(\n", self2 = this;
      v.ordre.forEach(function (k) { o += retrait + "   '" + k + "' => " + self2.var_export(v.props[k], retrait + "  ") + ",\n"; });
      return o + retrait + "))";
    }
    return "NULL";
  };

  /* ═══════════════ 13. LE RÉSULTAT ══════════════════════════════════════ */
  M.lancerProgramme = function (page, source) {
    var self = this;
    this.pageEntree = page;
    this.fichiers[page] = source;
    try {
      this.executerFichier(page, source, true);
    } catch (e) {
      if (e instanceof Signal && e.signal === "exit") { /* fin normale */ }
      else if (e instanceof Lancee) { this.fatalException(e.lancee); }
      else if (e instanceof ErreurPhp) { this.fatal(e); }
      else if (e && e.syntaxe) { this.fatalSyntaxe(e); }
      else if (e instanceof Signal) { /* return/break au niveau fichier : ignoré */ }
      else throw e;
    }
    return this.resultat();
  };
  M.fatalSyntaxe = function (e) {
    var f = e.fichier || this.fichierCourant || this.pageEntree || "";
    // une faute de syntaxe empêche toute la page de tourner : PHP n'affiche
    // que l'erreur, rien de la sortie déjà produite
    this.sortie = [];
    this.ecrire("\nParse error: " + e.message + " in " + f + " on line " + e.ligne + "\n");
    this.erreurFatale = { message: e.message, ligne: e.ligne, classe: "ParseError" };
  };
  M.fatal = function (e) {
    var f = e.fichier || this.fichierCourant || this.pageEntree || "";
    if (e.nomClasse === "__temps__") { this.ecrire("\nFatal error: " + e.message + " in " + f + " on line " + e.ligne + "\n"); this.erreurFatale = { message: e.message, ligne: e.ligne, classe: "TempsDepasse" }; return; }
    var cl = e.nomClasse || "Error";
    this.ecrire("\nFatal error: Uncaught " + cl + ": " + e.message + " in " + f + ":" + e.ligne + "\nStack trace:\n#0 {main}\n  thrown in " + f + " on line " + e.ligne + "\n");
    this.erreurFatale = { message: e.message, ligne: e.ligne, classe: cl };
  };
  M.fatalException = function (obj) {
    var cl = obj.classe.nom;
    var msg = obj.has("message") ? this.versTexte(obj.props["message"], 0) : "";
    var ligne = obj.has("line") ? versNombre(obj.props["line"]) : this.ligneCourante;
    var fichier = obj.fichierSimple !== undefined ? obj.fichierSimple : (this.fichierCourant || this.pageEntree || "");
    this.ecrire("\nFatal error: Uncaught " + cl + ": " + msg + " in " + fichier + ":" + ligne + "\nStack trace:\n#0 {main}\n  thrown in " + fichier + " on line " + ligne + "\n");
    this.erreurFatale = { message: msg, ligne: ligne, classe: cl };
  };
  M.resultat = function () {
    return { sortie: this.sortie.join(""), avis: this.avis, redirection: this.redirection, entetes: this.entetes,
      erreurFatale: this.erreurFatale || null, session: this.session, cookies: this.cookies, fs: this.fs,
      etatSql: this.serveur ? this.serveur.exporter() : null, sessionDemarree: this.sessionDemarree };
  };

  /* La table des fonctions intégrées est dans php-fonctions.js (chargé après),
     qui appelle PHP.enregistrer(...). On garde ici un objet partagé. */
  var INTEGREES = Object.create(null);

  var API = {
    Moteur: Moteur, PhpArray: PhpArray, PhpObjet: PhpObjet, PhpFloat: PhpFloat, flottant: flottant, estFloat: estFloat,
    versBool: versBool, versNombre: versNombre, versTexte: versTexte, numerique: numerique, nombrePhp: nombrePhp,
    texteNombre: texteNombre, typeNom: typeNom, typeGettype: typeGettype, egalLache: egalLache, egalStrict: egalStrict,
    comparer: comparer, copierValeur: copierValeur, listeDe: listeDe, tableauDe: tableauDe, estChaineNumerique: estChaineNumerique,
    ErreurPhp: ErreurPhp, Lancee: Lancee, Signal: Signal, Ref: Ref, deref: deref, INTEGREES: INTEGREES,
    octetsDe: octetsDe,
    enregistrer: function (nom, spec) { INTEGREES[nom] = spec; },
    executer: function (page, source, options) { return new Moteur(options || {}).lancerProgramme(page, source); },
  };
  return API;
})();
if (typeof module !== "undefined" && module.exports) module.exports = PHP;
