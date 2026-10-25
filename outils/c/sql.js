/* ═══════════════════════════════════════════════════════════════════════
   Le moteur SQL de l'atelier — écrit ici, dans le dialecte de MariaDB.

   Demandé le 24 octobre : PHP et SQL dans l'ultra-compilateur, avec des
   moteurs « écrits ici » plutôt que téléchargés. Celui-ci parle le SQL du
   cours (chapitre 9, et le PDO des chapitres 5 et 6) comme le parle
   MariaDB sous XAMPP ou WAMP :
     · CREATE DATABASE / USE, CREATE TABLE avec INT AUTO_INCREMENT PRIMARY
       KEY, VARCHAR(n), DECIMAL(p,s), DATE, NOT NULL, UNIQUE, DEFAULT,
       FOREIGN KEY … REFERENCES … ON DELETE CASCADE ; ALTER, DROP, TRUNCATE ;
     · INSERT (plusieurs lignes), UPDATE, DELETE — et leurs contrôles :
       doublon de clé, NOT NULL, texte trop long, clé étrangère orpheline ;
     · SELECT : WHERE, LIKE, IN, BETWEEN, IS NULL, jointures INNER / LEFT /
       RIGHT, alias, GROUP BY, HAVING, COUNT/SUM/AVG/MIN/MAX, DISTINCT,
       ORDER BY, LIMIT, sous-requêtes, UNION, CASE, fonctions de texte et
       de date ;
     · SHOW TABLES, DESCRIBE.
   Les erreurs sont celles de MariaDB, mot pour mot (« Column 'id' in field
   list is ambiguous », « Duplicate entry '1' for key 'PRIMARY' ») : ce sont
   celles que l'étudiant retrouvera dans phpMyAdmin, et l'atelier les
   explique en français à côté.

   Comme MariaDB : les mots-clés et les noms de colonnes ignorent la casse ;
   les textes se comparent sans tenir compte des majuscules ni des accents
   (interclassement utf8mb4_general_ci) ; le mode strict refuse un texte
   trop long plutôt que de le couper en silence.

   Ce que ce moteur n'est PAS : un serveur. Pas d'utilisateurs ni de droits,
   pas d'index (les tables du cours tiennent en mémoire), pas de
   transactions (BEGIN et COMMIT sont acceptés et ne font rien).
   ═══════════════════════════════════════════════════════════════════════ */
var MOTEUR_SQL = (function () {
  "use strict";
  // MD5, SHA-1, SHA-256 (empreintes.js, chargé avant ce fichier)
  var EMP = typeof EMPREINTES !== "undefined" ? EMPREINTES : require("./empreintes.js");

  /* ── les erreurs, numérotées comme celles de MariaDB ── */
  function ErreurSql(code, etat, message, ligne) {
    var e = new Error(message);
    e.code = code; e.etat = etat; e.ligne = ligne || 0; e.sql = true;
    return e;
  }
  var E = {
    syntaxe: function (pres, ligne) {
      return ErreurSql(1064, "42000", "You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near '" + pres + "' at line " + ligne, ligne);
    },
    tableAbsente: function (base, t) { return ErreurSql(1146, "42S02", "Table '" + base + "." + t + "' doesn't exist"); },
    tableExiste: function (t) { return ErreurSql(1050, "42S01", "Table '" + t + "' already exists"); },
    baseAbsente: function (b) { return ErreurSql(1049, "42000", "Unknown database '" + b + "'"); },
    baseExiste: function (b) { return ErreurSql(1007, "HY000", "Can't create database '" + b + "'; database exists"); },
    pasDeBase: function () { return ErreurSql(1046, "3D000", "No database selected"); },
    colonneInconnue: function (c, ou) { return ErreurSql(1054, "42S22", "Unknown column '" + c + "' in '" + ou + "'"); },
    ambigue: function (c, ou) { return ErreurSql(1052, "23000", "Column '" + c + "' in " + ou + " is ambiguous"); },
    doublon: function (v, cle) { return ErreurSql(1062, "23000", "Duplicate entry '" + v + "' for key '" + cle + "'"); },
    nonNul: function (c) { return ErreurSql(1048, "23000", "Column '" + c + "' cannot be null"); },
    sansDefaut: function (c) { return ErreurSql(1364, "HY000", "Field '" + c + "' doesn't have a default value"); },
    tropLong: function (c, l) { return ErreurSql(1406, "22001", "Data too long for column '" + c + "' at row " + l); },
    // c : la colonne déjà écrite `base`.`table`.`colonne`, comme MariaDB
    entierFaux: function (v, c, l) { return ErreurSql(1366, "22007", "Incorrect integer value: '" + v + "' for column " + c + " at row " + l); },
    decimalFaux: function (v, c, l) { return ErreurSql(1366, "22007", "Incorrect decimal value: '" + v + "' for column " + c + " at row " + l); },
    dateFausse: function (v, c, l, quoi) { return ErreurSql(1292, "22007", "Incorrect " + (quoi || "date") + " value: '" + v + "' for column " + c + " at row " + l); },
    horsLimites: function (c, l) { return ErreurSql(1264, "22003", "Out of range value for column '" + c + "' at row " + l); },
    enumFaux: function (c, l) { return ErreurSql(1265, "01000", "Data truncated for column '" + c + "' at row " + l); },
    nbColonnes: function (l) { return ErreurSql(1136, "21S01", "Column count doesn't match value count at row " + l); },
    fkEnfant: function (desc) { return ErreurSql(1452, "23000", "Cannot add or update a child row: a foreign key constraint fails (" + desc + ")"); },
    fkParent: function (desc) { return ErreurSql(1451, "23000", "Cannot delete or update a parent row: a foreign key constraint fails (" + desc + ")"); },
    sousLignes: function () { return ErreurSql(1242, "21000", "Subquery returns more than 1 row"); },
    operandes: function (n) { return ErreurSql(1241, "21000", "Operand should contain " + n + " column(s)"); },
    fonction: function (b, f) { return ErreurSql(1305, "42000", "FUNCTION " + b + "." + f + " does not exist"); },
    groupe: function () { return ErreurSql(1111, "HY000", "Invalid use of group function"); },
    union: function () { return ErreurSql(1222, "21000", "The used SELECT statements have a different number of columns"); },
    colonneExiste: function (c) { return ErreurSql(1060, "42S21", "Duplicate column name '" + c + "'"); },
    clePrimaire: function () { return ErreurSql(1068, "42000", "Multiple primary key defined"); },
    autoSansCle: function () { return ErreurSql(1075, "42000", "Incorrect table definition; there can be only one auto column and it must be defined as a key"); },
    parametre: function () { return ErreurSql(2031, "HY093", "Invalid parameter number: parameter was not defined"); },
  };

  /* ═══════════════════════════════ 1. LES JETONS ═══════════════════════ */
  var MOTS_CLES = ("SELECT FROM WHERE AND OR NOT XOR INSERT INTO VALUES VALUE UPDATE SET DELETE CREATE TABLE DATABASE SCHEMA " +
    "DROP ALTER ADD MODIFY CHANGE COLUMN RENAME TO AS ON JOIN INNER LEFT RIGHT OUTER CROSS NATURAL USING " +
    "GROUP BY HAVING ORDER ASC DESC LIMIT OFFSET DISTINCT ALL UNION NULL IS IN BETWEEN LIKE ESCAPE EXISTS " +
    "CASE WHEN THEN ELSE END PRIMARY KEY FOREIGN REFERENCES UNIQUE DEFAULT AUTO_INCREMENT CONSTRAINT INDEX " +
    "IF USE SHOW TABLES DATABASES SCHEMAS COLUMNS FIELDS DESCRIBE DESC EXPLAIN TRUNCATE TRUE FALSE DIV MOD " +
    "CASCADE RESTRICT ACTION NO CHECK REGEXP RLIKE INTERVAL BEGIN COMMIT ROLLBACK START TRANSACTION " +
    "IGNORE REPLACE DUPLICATE COMMENT ENGINE CHARSET CHARACTER COLLATE UNSIGNED ZEROFILL FIRST AFTER " +
    "TEMPORARY VIEW ROW ROWS KEYS FULL STATUS").split(" ");
  var EST_MOT_CLE = {};
  MOTS_CLES.forEach(function (m) { EST_MOT_CLE[m] = true; });

  /* Les jetons : { t: "mot"|"id"|"nombre"|"texte"|"op"|"param"|"fin", v, pos, ligne } */
  function decouper(sql) {
    var j = [], i = 0, n = sql.length, ligne = 1;
    var push = function (t, v, pos, brut) { j.push({ t: t, v: v, pos: pos, ligne: ligne, brut: brut }); };
    var d = 0, ligneD = 1;
    /* Une apostrophe jamais fermée ne fait pas échouer TOUT le script : elle
       devient un jeton « faute », et l'analyse s'arrête dessus. Ce qui la
       précède s'exécute, comme dans le client mariadb. */
    try { lire(); }
    catch (e) { if (!e.sql) throw e; j.push({ t: "faute", v: null, pos: d, ligne: ligneD, brut: sql.slice(d, d + 1) }); }
    j.push({ t: "fin", v: null, pos: n, ligne: ligne, brut: "" });
    return j;
    function lire() {
    while (i < n) {
      var c = sql[i];
      if (c === "\n") { ligne++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      // les commentaires : « -- » suivi d'un espace (MariaDB l'exige), « # », « /* */ »
      if ((c === "-" && sql[i + 1] === "-" && (i + 2 >= n || /\s/.test(sql[i + 2]))) || c === "#") {
        while (i < n && sql[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && sql[i + 1] === "*") {
        var f = sql.indexOf("*/", i + 2);
        var bout = f < 0 ? n : f + 2;
        for (var k = i; k < bout; k++) if (sql[k] === "\n") ligne++;
        i = bout;
        continue;
      }
      d = i; ligneD = ligne;
      if (c === "'" || c === '"') {
        var s = "";
        i++;
        for (;;) {
          if (i >= n) throw E.syntaxe(sql.slice(d, d + 40), ligne);
          var x = sql[i];
          if (x === "\\" && i + 1 < n) {
            var y = sql[i + 1];
            var ech = { n: "\n", t: "\t", r: "\r", 0: "\0", b: "\b", Z: "\x1a" }[y];
            // \% et \_ gardent leur barre : c'est LIKE qui les lira (un % ou un _ pour de vrai)
            s += ech !== undefined ? ech : y === "%" || y === "_" ? "\\" + y : y;
            i += 2; continue;
          }
          if (x === c) {
            if (sql[i + 1] === c) { s += c; i += 2; continue; }   // '' dans '…'
            i++; break;
          }
          if (x === "\n") ligne++;
          s += x; i++;
        }
        push("texte", s, d, sql.slice(d, i));
        continue;
      }
      if (c === "`") {
        var fin = sql.indexOf("`", i + 1);
        if (fin < 0) throw E.syntaxe(sql.slice(d, d + 40), ligne);
        push("id", sql.slice(i + 1, fin), d, sql.slice(d, fin + 1));
        i = fin + 1;
        continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(sql[i + 1] || ""))) {
        var m = /^(0x[0-9a-f]+|\d*\.?\d+(?:e[+-]?\d+)?|\d+\.(?:e[+-]?\d+)?)/i.exec(sql.slice(i));
        // un identifiant peut commencer par un chiffre (« 1a ») : c'est alors un nom
        var apres = sql[i + m[0].length] || "";
        if (/[A-Za-z_$]/.test(apres) && !/^0x/i.test(m[0])) {
          var mm = /^[0-9A-Za-z_$]+/.exec(sql.slice(i));
          push("id", mm[0], d, mm[0]);
          i += mm[0].length;
          continue;
        }
        push("nombre", /^0x/i.test(m[0]) ? parseInt(m[0], 16) : parseFloat(m[0]), d, m[0]);
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_$À-￿]/.test(c)) {
        var mot = /^[0-9A-Za-z_$À-￿]+/.exec(sql.slice(i))[0];
        var haut = mot.toUpperCase();
        push(EST_MOT_CLE[haut] ? "mot" : "id", EST_MOT_CLE[haut] ? haut : mot, d, mot);
        i += mot.length;
        continue;
      }
      if (c === "?") { push("param", null, d, "?"); i++; continue; }
      if (c === ":" && /[A-Za-z_]/.test(sql[i + 1] || "")) {
        var nom = /^:[A-Za-z_][\w]*/.exec(sql.slice(i))[0];
        push("param", nom.slice(1), d, nom);
        i += nom.length;
        continue;
      }
      var trois = sql.substr(i, 3), deux = sql.substr(i, 2);
      if (trois === "<=>") { push("op", trois, d, trois); i += 3; continue; }
      if (["<=", ">=", "<>", "!=", "||", "&&", "<<", ">>", ":="].indexOf(deux) >= 0) { push("op", deux, d, deux); i += 2; continue; }
      if ("=<>+-*/%(),.;!~&|^@".indexOf(c) >= 0) { push("op", c, d, c); i++; continue; }
      throw E.syntaxe(sql.slice(d, d + 40), ligne);
    }
    }
  }

  /* ═══════════════════════════════ 2. LA GRAMMAIRE ═════════════════════ */
  function Analyseur(sql) {
    this.sql = sql;
    this.j = decouper(sql);
    this.i = 0;
    this.nbParams = 0;
  }
  var A = Analyseur.prototype;
  A.voir = function (k) { return this.j[this.i + (k || 0)]; };
  A.prendre = function () { return this.j[this.i++]; };
  A.erreur = function (jeton) {
    jeton = jeton || this.voir();
    var reste = this.sql.slice(jeton.pos, jeton.pos + 60).split("\n").slice(0, 2).join("\n");
    var e = E.syntaxe(reste, jeton.ligne);
    e.colonne = colonneDe(this.sql, jeton.pos);
    return e;
  };
  function colonneDe(sql, pos) { return pos - sql.lastIndexOf("\n", pos - 1); }
  A.estMot = function (m, k) { var x = this.voir(k); return x.t === "mot" && x.v === m; };
  A.estOp = function (o, k) { var x = this.voir(k); return x.t === "op" && x.v === o; };
  A.mot = function (m) { if (this.estMot(m)) { this.i++; return true; } return false; };
  A.op = function (o) { if (this.estOp(o)) { this.i++; return true; } return false; };
  A.exigerMot = function (m) { if (!this.mot(m)) throw this.erreur(); };
  A.exigerOp = function (o) { if (!this.op(o)) throw this.erreur(); };
  /* Un nom (table, colonne, alias) : un identifiant, ou un mot-clé que
     MariaDB accepte comme nom (« date », « statut », « value »…). */
  var MOTS_NOMMABLES = { KEY: 1, VALUE: 1, STATUS: 1, COMMENT: 1, ACTION: 1, NO: 1, FIRST: 1, AFTER: 1, FULL: 1, ROW: 1, ROWS: 1,
    TEMPORARY: 1, VIEW: 1, ENGINE: 1, CHARSET: 1, COLUMNS: 1, FIELDS: 1, START: 1, BEGIN: 1, TRANSACTION: 1, COMMIT: 1, ROLLBACK: 1, DUPLICATE: 1, KEYS: 1, TABLES: 1, DATABASES: 1, SCHEMAS: 1, MODIFY: 1, CHANGE: 1, RENAME: 1, OFFSET: 1, ESCAPE: 1, CASCADE: 1, RESTRICT: 1, CHECK: 1, INDEX: 1, IGNORE: 1, REPLACE: 1, INTERVAL: 1 };
  A.estNom = function (k) { var x = this.voir(k); return x.t === "id" || (x.t === "mot" && MOTS_NOMMABLES[x.v]); };
  A.nom = function () {
    var x = this.voir();
    if (x.t === "id" || (x.t === "mot" && MOTS_NOMMABLES[x.v])) { this.i++; return x.t === "id" ? x.v : x.brut; }
    throw this.erreur();
  };
  /* « base.table » ou « table » */
  A.nomTable = function () {
    var a = this.nom();
    if (this.op(".")) return { base: a, nom: this.nom() };
    return { base: null, nom: a };
  };

  /* L'instruction suivante, ou null à la fin du script. Le serveur exécute
     chacune AVANT de lire la suivante, comme le client mariadb : une faute
     de syntaxe à la ligne 12 n'empêche pas les onze premières de tourner. */
  A.suivante = function () {
    while (this.op(";")) { /* des ; en trop ne gênent pas */ }
    if (this.voir().t === "fin") return null;
    var d = this.voir();
    var st = this.instruction();
    st.debut = d.pos; st.ligne = d.ligne;
    st.texte = this.sql.slice(d.pos, this.voir().pos).trim();
    if (this.voir().t !== "fin" && !this.op(";")) throw this.erreur();
    return st;
  };
  A.script = function () {
    var out = [], st;
    while ((st = this.suivante())) out.push(st);
    return out;
  };

  A.instruction = function () {
    var x = this.voir();
    if (x.t === "op" && x.v === "(") return this.selectComplet();
    if (x.t !== "mot") throw this.erreur();
    switch (x.v) {
      case "SELECT": return this.selectComplet();
      case "INSERT": case "REPLACE": return this.insert();
      case "UPDATE": return this.update();
      case "DELETE": return this.delete_();
      case "CREATE": return this.create();
      case "DROP": return this.drop();
      case "ALTER": return this.alter();
      case "USE": this.i++; return { t: "use", nom: this.nom() };
      case "SHOW": return this.show();
      case "DESCRIBE": case "DESC": case "EXPLAIN":
        this.i++;
        if (this.estMot("SELECT")) return this.selectComplet();
        return { t: "describe", table: this.nomTable() };
      case "TRUNCATE": this.i++; this.mot("TABLE"); return { t: "truncate", table: this.nomTable() };
      case "RENAME": {
        this.i++; this.exigerMot("TABLE");
        var de = this.nomTable(); this.exigerMot("TO");
        return { t: "renommer", de: de, vers: this.nomTable() };
      }
      case "BEGIN": case "COMMIT": case "ROLLBACK": case "START":
        while (this.voir().t !== "fin" && !this.estOp(";")) this.i++;
        return { t: "rien", quoi: x.v };
      case "SET":
        // SET NAMES utf8, SET FOREIGN_KEY_CHECKS = 0… : acceptés
        this.i++;
        var reglage = [];
        while (this.voir().t !== "fin" && !this.estOp(";")) reglage.push(this.prendre().brut);
        return { t: "reglage", texte: reglage.join(" ") };
    }
    throw this.erreur();
  };

  /* ── SELECT ── */
  A.selectComplet = function () {
    var premier = this.selectCoeur();
    var unions = [];
    while (this.mot("UNION")) {
      var tous = this.mot("ALL");
      if (!tous) this.mot("DISTINCT");
      unions.push({ tous: tous, select: this.selectCoeur() });
    }
    var s = unions.length ? { t: "select", coeur: premier, unions: unions } : { t: "select", coeur: premier, unions: [] };
    this.ordreLimite(s);
    // un ORDER BY / LIMIT sans UNION appartient au SELECT unique
    if (!unions.length && premier.ordre === undefined) { premier.ordre = s.ordre; premier.limite = s.limite; premier.decalage = s.decalage; s.ordre = null; s.limite = null; s.decalage = null; }
    return s;
  };
  A.ordreLimite = function (s) {
    s.ordre = null; s.limite = null; s.decalage = null;
    if (this.mot("ORDER")) {
      this.exigerMot("BY");
      s.ordre = [];
      do {
        var e = this.expr();
        var desc = false;
        if (this.mot("DESC")) desc = true; else this.mot("ASC");
        s.ordre.push({ e: e, desc: desc });
      } while (this.op(","));
    }
    if (this.mot("LIMIT")) {
      var a = this.expr();
      if (this.op(",")) { s.decalage = a; s.limite = this.expr(); }
      else { s.limite = a; if (this.mot("OFFSET")) s.decalage = this.expr(); }
    }
  };
  A.selectCoeur = function () {
    if (this.op("(")) {
      var s = this.selectComplet();
      this.exigerOp(")");
      return { sousSelect: s };
    }
    this.exigerMot("SELECT");
    var c = { distinct: false, colonnes: [], de: null, ou: null, groupe: null, ayant: null };
    if (this.mot("DISTINCT")) c.distinct = true; else this.mot("ALL");
    do {
      var d = this.voir();
      if (this.op("*")) { c.colonnes.push({ etoile: true }); continue; }
      if (this.estNom() && this.estOp(".", 1) && this.estOp("*", 2)) {
        var t = this.nom(); this.i += 2;
        c.colonnes.push({ etoile: true, table: t });
        continue;
      }
      var e = this.expr();
      var texte = this.sql.slice(d.pos, this.voir(-1).pos + this.voir(-1).brut.length);
      var alias = null;
      if (this.mot("AS")) alias = this.voir().t === "texte" ? this.prendre().v : this.nom();
      else if (this.estNom() && !this.estMot("FROM")) alias = this.nom();
      else if (this.voir().t === "texte") alias = this.prendre().v;
      c.colonnes.push({ e: e, alias: alias, texte: texte });
    } while (this.op(","));
    if (this.mot("FROM")) c.de = this.sources();
    if (this.mot("WHERE")) c.ou = this.expr();
    if (this.mot("GROUP")) {
      this.exigerMot("BY");
      c.groupe = [];
      do { c.groupe.push(this.expr()); this.mot("ASC") || this.mot("DESC"); } while (this.op(","));
    }
    if (this.mot("HAVING")) c.ayant = this.expr();
    return c;
  };
  /* FROM a, b JOIN c ON … : un arbre de jointures */
  A.sources = function () {
    var g = this.jointures();
    while (this.op(",")) g = { t: "jointure", type: "cross", gauche: g, droite: this.jointures(), on: null };
    return g;
  };
  A.jointures = function () {
    var g = this.sourceSimple();
    for (;;) {
      var type = null, naturel = false;
      if (this.mot("NATURAL")) { naturel = true; if (this.mot("LEFT")) { this.mot("OUTER"); type = "left"; } else if (this.mot("RIGHT")) { this.mot("OUTER"); type = "right"; } else { this.mot("INNER"); type = "inner"; } this.exigerMot("JOIN"); }
      else if (this.mot("INNER") || this.mot("CROSS")) { type = this.voir(-1).v === "CROSS" ? "cross" : "inner"; this.exigerMot("JOIN"); }
      else if (this.mot("LEFT")) { this.mot("OUTER"); this.exigerMot("JOIN"); type = "left"; }
      else if (this.mot("RIGHT")) { this.mot("OUTER"); this.exigerMot("JOIN"); type = "right"; }
      else if (this.mot("JOIN")) type = "inner";
      else break;
      var d = this.sourceSimple();
      var on = null, using = null;
      if (this.mot("ON")) on = this.expr();
      else if (this.mot("USING")) {
        this.exigerOp("(");
        using = [];
        do { using.push(this.nom()); } while (this.op(","));
        this.exigerOp(")");
      }
      g = { t: "jointure", type: type, gauche: g, droite: d, on: on, using: using, naturel: naturel };
    }
    return g;
  };
  A.sourceSimple = function () {
    if (this.op("(")) {
      if (this.estMot("SELECT")) {
        var s = this.selectComplet();
        this.exigerOp(")");
        this.mot("AS");
        return { t: "sous", select: s, alias: this.nom() };
      }
      var j = this.sources();
      this.exigerOp(")");
      return j;
    }
    var nt = this.nomTable();
    var alias = null;
    if (this.mot("AS")) alias = this.nom();
    else if (this.estNom() && !this.estMot("ON") && !this.estMot("USING")) alias = this.nom();
    return { t: "table", base: nt.base, nom: nt.nom, alias: alias };
  };

  /* ── les expressions, par priorité croissante ── */
  A.expr = function () { return this.ou(); };
  A.ou = function () {
    var g = this.xou();
    while (this.mot("OR") || this.op("||")) g = { t: "bin", op: "OR", g: g, d: this.xou() };
    return g;
  };
  A.xou = function () {
    var g = this.et();
    while (this.mot("XOR")) g = { t: "bin", op: "XOR", g: g, d: this.et() };
    return g;
  };
  A.et = function () {
    var g = this.non();
    while (this.mot("AND") || this.op("&&")) g = { t: "bin", op: "AND", g: g, d: this.non() };
    return g;
  };
  A.non = function () {
    if (this.mot("NOT")) return { t: "un", op: "NOT", e: this.non() };
    return this.comparaison();
  };
  A.comparaison = function () {
    var g = this.bits();
    for (;;) {
      var x = this.voir();
      if (x.t === "op" && ["=", "<>", "!=", "<", ">", "<=", ">=", "<=>"].indexOf(x.v) >= 0) {
        this.i++;
        var op = x.v === "!=" ? "<>" : x.v;
        if (this.estMot("ALL") || this.estMot("ANY") ) throw this.erreur();
        g = { t: "bin", op: op, g: g, d: this.bits() };
        continue;
      }
      if (this.mot("IS")) {
        var non = this.mot("NOT");
        var quoi = this.mot("NULL") ? null : this.mot("TRUE") ? true : this.mot("FALSE") ? false : undefined;
        if (quoi === undefined) throw this.erreur();
        g = { t: "est", e: g, non: non, quoi: quoi };
        continue;
      }
      var neg = false, k = 0;
      if (this.estMot("NOT")) { neg = true; k = 1; }
      if (this.estMot("LIKE", k)) {
        this.i += k + 1;
        var motif = this.bits(), echap = null;
        if (this.mot("ESCAPE")) echap = this.bits();
        g = { t: "comme", e: g, motif: motif, echap: echap, non: neg };
        continue;
      }
      if (this.estMot("REGEXP", k) || this.estMot("RLIKE", k)) {
        this.i += k + 1;
        g = { t: "regexp", e: g, motif: this.bits(), non: neg };
        continue;
      }
      if (this.estMot("IN", k)) {
        this.i += k + 1;
        this.exigerOp("(");
        if (this.estMot("SELECT")) {
          var s = this.selectComplet();
          this.exigerOp(")");
          g = { t: "dans", e: g, select: s, non: neg };
        } else {
          var liste = [];
          do { liste.push(this.expr()); } while (this.op(","));
          this.exigerOp(")");
          g = { t: "dans", e: g, liste: liste, non: neg };
        }
        continue;
      }
      if (this.estMot("BETWEEN", k)) {
        this.i += k + 1;
        var bas = this.bits();
        this.exigerMot("AND");
        g = { t: "entre", e: g, bas: bas, haut: this.bits(), non: neg };
        continue;
      }
      return g;
    }
  };
  A.bits = function () {
    var g = this.somme();
    for (;;) {
      var x = this.voir();
      if (x.t === "op" && (x.v === "|" || x.v === "&" || x.v === "<<" || x.v === ">>")) { this.i++; g = { t: "bin", op: x.v, g: g, d: this.somme() }; }
      else return g;
    }
  };
  A.somme = function () {
    var g = this.produit();
    for (;;) {
      if (this.op("+")) g = { t: "bin", op: "+", g: g, d: this.produit() };
      else if (this.op("-")) g = { t: "bin", op: "-", g: g, d: this.produit() };
      else if (this.estMot("INTERVAL")) return g;
      else return g;
    }
  };
  A.produit = function () {
    var g = this.unaire();
    for (;;) {
      if (this.op("*")) g = { t: "bin", op: "*", g: g, d: this.unaire() };
      else if (this.op("/")) g = { t: "bin", op: "/", g: g, d: this.unaire() };
      else if (this.op("%") || this.mot("MOD")) g = { t: "bin", op: "%", g: g, d: this.unaire() };
      else if (this.mot("DIV")) g = { t: "bin", op: "DIV", g: g, d: this.unaire() };
      else if (this.op("^")) g = { t: "bin", op: "^", g: g, d: this.unaire() };
      else return g;
    }
  };
  A.unaire = function () {
    if (this.op("-")) return { t: "un", op: "-", e: this.unaire() };
    if (this.op("+")) return this.unaire();
    if (this.op("!")) return { t: "un", op: "NOT", e: this.unaire() };
    if (this.op("~")) return { t: "un", op: "~", e: this.unaire() };
    return this.primaire();
  };
  A.primaire = function () {
    var x = this.voir();
    if (x.t === "nombre") { this.i++; return { t: "val", v: x.v }; }
    if (x.t === "texte") {
      this.i++;
      var v = x.v;
      while (this.voir().t === "texte") v += this.prendre().v;    // 'a' 'b' → 'ab'
      return { t: "val", v: v };
    }
    if (x.t === "param") { this.i++; return { t: "param", nom: x.v, rang: x.v === null ? this.nbParams++ : null }; }
    if (x.t === "op" && x.v === "(") {
      this.i++;
      if (this.estMot("SELECT")) {
        var s = this.selectComplet();
        this.exigerOp(")");
        return { t: "sous", select: s };
      }
      var e = this.expr();
      if (this.op(",")) {
        var l = [e];
        do { l.push(this.expr()); } while (this.op(","));
        this.exigerOp(")");
        return { t: "liste", l: l };
      }
      this.exigerOp(")");
      return e;
    }
    if (x.t === "op" && x.v === "@") {
      this.i++;
      if (this.op("@")) this.nom();
      return { t: "val", v: null, variable: this.nom() };
    }
    if (x.t === "mot") {
      if (x.v === "NULL") { this.i++; return { t: "val", v: null }; }
      if (x.v === "TRUE") { this.i++; return { t: "val", v: 1 }; }
      if (x.v === "FALSE") { this.i++; return { t: "val", v: 0 }; }
      if (x.v === "EXISTS") {
        this.i++; this.exigerOp("(");
        var se = this.selectComplet();
        this.exigerOp(")");
        return { t: "existe", select: se };
      }
      if (x.v === "CASE") return this.cas();
      if (x.v === "INTERVAL") {
        this.i++;
        var q = this.somme();
        var u = this.prendre();
        return { t: "intervalle", e: q, unite: String(u.v || u.brut).toUpperCase() };
      }
      if ((x.v === "IF" || x.v === "LEFT" || x.v === "RIGHT" || x.v === "REPLACE" || x.v === "DEFAULT" || x.v === "MOD" || x.v === "CHARSET" || x.v === "DATABASE" || x.v === "SCHEMA" || x.v === "VALUES" || x.v === "VALUE") && this.estOp("(", 1))
        return this.appel(x.brut);
      if (x.v === "DEFAULT") { this.i++; return { t: "defaut" }; }
    }
    if (this.estNom()) {
      if (this.estOp("(", 1)) return this.appel(this.voir().t === "id" ? this.voir().v : this.voir().brut);
      var a = this.nom();
      if (this.op(".")) {
        var b = this.nom();
        if (this.op(".")) return { t: "col", base: a, table: b, nom: this.nom() };
        return { t: "col", table: a, nom: b };
      }
      return { t: "col", table: null, nom: a };
    }
    throw this.erreur();
  };
  A.appel = function (nom) {
    this.i++;
    this.exigerOp("(");
    var f = { t: "fn", nom: nom.toUpperCase(), args: [], distinct: false, etoile: false };
    if (this.op(")")) return f;
    if (this.op("*")) { f.etoile = true; this.exigerOp(")"); return f; }
    if (this.mot("DISTINCT")) f.distinct = true;
    // TIMESTAMPDIFF(YEAR, a, b), EXTRACT(MONTH FROM d) : une unité, pas une colonne
    if (/^(TIMESTAMPDIFF|TIMESTAMPADD|EXTRACT)$/.test(f.nom) && this.voir().t !== "op") {
      f.args.push({ t: "val", v: String(this.prendre().brut).toUpperCase() });
      if (f.nom === "EXTRACT") this.exigerMot("FROM"); else this.exigerOp(",");
    }
    do {
      f.args.push(this.expr());
      // GROUP_CONCAT(x ORDER BY … SEPARATOR ', ')
      if (f.nom === "GROUP_CONCAT") {
        if (this.mot("ORDER")) { this.exigerMot("BY"); f.ordre = []; do { var oe = this.expr(); var de = this.mot("DESC"); if (!de) this.mot("ASC"); f.ordre.push({ e: oe, desc: de }); } while (this.op(",")); }
        if (this.voir().t === "id" && this.voir().v.toUpperCase() === "SEPARATOR") { this.i++; f.separateur = this.prendre().v; }
      }
      if (f.nom === "CAST" || f.nom === "CONVERT") {
        if (this.mot("AS") || this.op(",")) { f.type = String(this.prendre().brut).toUpperCase(); if (this.op("(")) { while (!this.op(")")) this.i++; } }
      }
    } while (this.op(","));
    this.exigerOp(")");
    return f;
  };
  A.cas = function () {
    this.exigerMot("CASE");
    var c = { t: "cas", base: null, quand: [], sinon: null };
    if (!this.estMot("WHEN")) c.base = this.expr();
    while (this.mot("WHEN")) {
      var si = this.expr();
      this.exigerMot("THEN");
      c.quand.push({ si: si, alors: this.expr() });
    }
    if (this.mot("ELSE")) c.sinon = this.expr();
    this.exigerMot("END");
    return c;
  };

  /* ── INSERT, UPDATE, DELETE ── */
  A.insert = function () {
    var remplacer = this.prendre().v === "REPLACE";
    var ignorer = this.mot("IGNORE");
    this.mot("INTO");
    var st = { t: "insert", table: this.nomTable(), colonnes: null, lignes: null, select: null, ignorer: ignorer, remplacer: remplacer };
    if (this.estOp("(") && !this.estMot("SELECT", 1)) {
      this.i++;
      st.colonnes = [];
      if (!this.estOp(")")) do { st.colonnes.push(this.nom()); } while (this.op(","));
      this.exigerOp(")");
    }
    if (this.mot("VALUES") || this.mot("VALUE")) {
      st.lignes = [];
      do {
        this.exigerOp("(");
        var l = [];
        if (!this.estOp(")")) do { l.push(this.expr()); } while (this.op(","));
        this.exigerOp(")");
        st.lignes.push(l);
      } while (this.op(","));
    } else if (this.mot("SET")) {
      st.colonnes = []; var vals = [];
      do { st.colonnes.push(this.nom()); this.exigerOp("="); vals.push(this.expr()); } while (this.op(","));
      st.lignes = [vals];
    } else if (this.estMot("SELECT") || this.estOp("(")) st.select = this.selectComplet();
    else throw this.erreur();
    if (this.mot("ON")) {
      this.exigerMot("DUPLICATE"); this.exigerMot("KEY"); this.exigerMot("UPDATE");
      st.surDoublon = this.affectations();
    }
    return st;
  };
  A.affectations = function () {
    var l = [];
    do {
      var a = this.nom();
      if (this.op(".")) a = this.nom();
      this.exigerOp("=");
      l.push({ col: a, e: this.expr() });
    } while (this.op(","));
    return l;
  };
  A.update = function () {
    this.exigerMot("UPDATE");
    this.mot("IGNORE");
    var source = this.jointures();
    this.exigerMot("SET");
    var st = { t: "update", source: source, affectations: this.affectations(), ou: null };
    if (this.mot("WHERE")) st.ou = this.expr();
    this.ordreLimite(st);
    return st;
  };
  A.delete_ = function () {
    this.exigerMot("DELETE");
    this.mot("IGNORE");
    var cibles = null;
    if (!this.estMot("FROM")) { cibles = []; do { cibles.push(this.nom()); this.op(".") && this.op("*"); } while (this.op(",")); }
    this.exigerMot("FROM");
    var source = cibles ? this.sources() : this.sourceSimple();
    var st = { t: "delete", source: source, cibles: cibles, ou: null };
    if (this.mot("WHERE")) st.ou = this.expr();
    this.ordreLimite(st);
    return st;
  };

  /* ── CREATE, DROP, ALTER, SHOW ── */
  A.create = function () {
    this.exigerMot("CREATE");
    this.mot("TEMPORARY");
    if (this.mot("DATABASE") || this.mot("SCHEMA")) {
      var si = false;
      if (this.mot("IF")) { this.exigerMot("NOT"); this.exigerMot("EXISTS"); si = true; }
      var nom = this.nom();
      while (this.voir().t !== "fin" && !this.estOp(";")) this.i++;     // CHARACTER SET …, COLLATE …
      return { t: "creerBase", nom: nom, siAbsente: si };
    }
    if (this.mot("UNIQUE") || this.estMot("INDEX")) {
      this.mot("INDEX");
      while (this.voir().t !== "fin" && !this.estOp(";")) this.i++;
      return { t: "rien", quoi: "INDEX" };
    }
    if (this.estMot("VIEW") || (this.voir().t === "id" && /^or$/i.test(this.voir().v))) throw ErreurSql(1235, "42000", "This version of the atelier doesn't yet support 'CREATE VIEW'");
    this.exigerMot("TABLE");
    var siAbs = false;
    if (this.mot("IF")) { this.exigerMot("NOT"); this.exigerMot("EXISTS"); siAbs = true; }
    var st = { t: "creerTable", table: this.nomTable(), siAbsente: siAbs, colonnes: [], contraintes: [] };
    if (this.mot("AS") || this.estMot("SELECT")) { st.select = this.selectComplet(); return st; }
    if (this.mot("LIKE")) { st.comme = this.nomTable(); return st; }
    this.exigerOp("(");
    do {
      if (this.estMot("PRIMARY") || this.estMot("FOREIGN") || this.estMot("UNIQUE") || this.estMot("CONSTRAINT") || this.estMot("INDEX") || this.estMot("KEY") || this.estMot("CHECK"))
        st.contraintes.push(this.contrainte());
      else st.colonnes.push(this.colonne());
    } while (this.op(","));
    this.exigerOp(")");
    // ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 … : acceptés, sans effet
    while (this.voir().t !== "fin" && !this.estOp(";")) this.i++;
    return st;
  };
  A.typeColonne = function () {
    var x = this.prendre();
    var type = String(x.t === "id" ? x.v : x.brut).toUpperCase();
    var t = { nom: type, args: [] };
    if (type === "DOUBLE" && this.voir().t === "id" && /^precision$/i.test(this.voir().v)) this.i++;
    if ((type === "CHARACTER" || type === "NATIONAL") && this.voir().t === "id") { this.i++; t.nom = "VARCHAR"; }
    if (this.op("(")) {
      do {
        var a = this.prendre();
        if (a.t === "nombre" || a.t === "texte") t.args.push(a.v);
        else throw this.erreur(a);
      } while (this.op(","));
      this.exigerOp(")");
    }
    for (;;) {
      if (this.mot("UNSIGNED")) { t.nonSigne = true; continue; }
      if (this.mot("ZEROFILL")) continue;
      if (this.estMot("CHARACTER") || this.estMot("CHARSET")) { this.i++; this.mot("SET"); this.nom(); continue; }
      if (this.mot("COLLATE")) { this.nom(); continue; }
      break;
    }
    var familles = {
      INT: "entier", INTEGER: "entier", TINYINT: "entier", SMALLINT: "entier", MEDIUMINT: "entier", BIGINT: "entier", BOOL: "entier", BOOLEAN: "entier", BIT: "entier", SERIAL: "entier",
      DECIMAL: "decimal", NUMERIC: "decimal", DEC: "decimal", FIXED: "decimal",
      FLOAT: "reel", DOUBLE: "reel", REAL: "reel",
      VARCHAR: "texte", CHAR: "texte", TEXT: "texte", TINYTEXT: "texte", MEDIUMTEXT: "texte", LONGTEXT: "texte", NVARCHAR: "texte", NCHAR: "texte", VARBINARY: "texte", BINARY: "texte", BLOB: "texte", LONGBLOB: "texte", JSON: "texte",
      DATE: "date", DATETIME: "dateheure", TIMESTAMP: "dateheure", TIME: "heure", YEAR: "entier",
      ENUM: "enum", SET: "texte",
    };
    t.famille = familles[t.nom];
    if (!t.famille) throw this.erreur(x);
    if (t.nom === "BOOL" || t.nom === "BOOLEAN") { t.nom = "TINYINT"; t.args = [1]; }
    return t;
  };
  A.colonne = function () {
    var c = { nom: this.nom(), type: this.typeColonne(), nonNul: false, defaut: undefined, auto: false, primaire: false, unique: false, ref: null, commentaire: null };
    if (c.type.nom === "SERIAL") { c.type = { nom: "BIGINT", args: [], famille: "entier", nonSigne: true }; c.auto = true; c.nonNul = true; c.unique = true; }
    for (;;) {
      if (this.mot("NOT")) { this.exigerMot("NULL"); c.nonNul = true; continue; }
      if (this.mot("NULL")) continue;
      if (this.mot("DEFAULT")) {
        if (this.op("(")) { c.defaut = this.expr(); this.exigerOp(")"); }
        else c.defaut = this.unaire();
        continue;
      }
      if (this.mot("AUTO_INCREMENT")) { c.auto = true; continue; }
      if (this.mot("PRIMARY")) { this.exigerMot("KEY"); c.primaire = true; continue; }
      if (this.mot("UNIQUE")) { this.mot("KEY"); c.unique = true; continue; }
      if (this.mot("KEY")) { c.primaire = true; continue; }
      if (this.mot("COMMENT")) { c.commentaire = this.prendre().v; continue; }
      if (this.mot("CHECK")) { this.exigerOp("("); c.verif = this.expr(); this.exigerOp(")"); continue; }
      if (this.mot("REFERENCES")) { c.ref = this.reference(); continue; }
      if (this.voir().t === "id" && /^on$/i.test(this.voir().v)) break;
      if (this.estMot("ON") && this.estMot("UPDATE", 1)) { this.i += 2; this.expr(); continue; }   // ON UPDATE CURRENT_TIMESTAMP
      if (this.mot("COLLATE")) { this.nom(); continue; }
      if (this.estMot("CHARACTER")) { this.i++; this.mot("SET"); this.nom(); continue; }
      break;
    }
    return c;
  };
  A.reference = function () {
    var r = { table: this.nomTable(), colonnes: [], surSuppr: "RESTRICT", surMaj: "RESTRICT" };
    if (this.op("(")) { do { r.colonnes.push(this.nom()); } while (this.op(",")); this.exigerOp(")"); }
    while (this.mot("ON")) {
      var quand = this.mot("DELETE") ? "surSuppr" : (this.exigerMot("UPDATE"), "surMaj");
      var action;
      if (this.mot("CASCADE")) action = "CASCADE";
      else if (this.mot("RESTRICT")) action = "RESTRICT";
      else if (this.mot("SET")) { if (this.mot("NULL")) action = "SET NULL"; else { this.exigerMot("DEFAULT"); action = "SET DEFAULT"; } }
      else if (this.mot("NO")) { this.exigerMot("ACTION"); action = "RESTRICT"; }
      else throw this.erreur();
      r[quand] = action;
    }
    return r;
  };
  A.contrainte = function () {
    var nom = null;
    if (this.mot("CONSTRAINT")) { if (this.estNom()) nom = this.nom(); }
    var liste = function (a) { var l = []; a.exigerOp("("); do { l.push(a.nom()); if (a.op("(")) { a.prendre(); a.exigerOp(")"); } a.mot("ASC") || a.mot("DESC"); } while (a.op(",")); a.exigerOp(")"); return l; };
    if (this.mot("PRIMARY")) { this.exigerMot("KEY"); return { t: "primaire", colonnes: liste(this), nom: nom }; }
    if (this.mot("FOREIGN")) {
      this.exigerMot("KEY");
      if (this.estNom()) this.nom();
      var cols = liste(this);
      this.exigerMot("REFERENCES");
      return { t: "etrangere", colonnes: cols, ref: this.reference(), nom: nom };
    }
    if (this.mot("UNIQUE")) {
      this.mot("KEY") || this.mot("INDEX");
      var n2 = this.estNom() ? this.nom() : null;
      return { t: "unique", colonnes: liste(this), nom: nom || n2 };
    }
    if (this.mot("CHECK")) { this.exigerOp("("); var e = this.expr(); this.exigerOp(")"); return { t: "verif", e: e, nom: nom }; }
    this.mot("INDEX") || this.mot("KEY");
    if (this.estNom()) this.nom();
    return { t: "index", colonnes: liste(this) };
  };
  A.drop = function () {
    this.exigerMot("DROP");
    this.mot("TEMPORARY");
    if (this.mot("DATABASE") || this.mot("SCHEMA")) {
      var si = false;
      if (this.mot("IF")) { this.exigerMot("EXISTS"); si = true; }
      return { t: "supprimerBase", nom: this.nom(), siExiste: si };
    }
    if (this.mot("INDEX")) { while (this.voir().t !== "fin" && !this.estOp(";")) this.i++; return { t: "rien", quoi: "INDEX" }; }
    this.exigerMot("TABLE");
    var siE = false;
    if (this.mot("IF")) { this.exigerMot("EXISTS"); siE = true; }
    var tables = [];
    do { tables.push(this.nomTable()); } while (this.op(","));
    this.mot("CASCADE") || this.mot("RESTRICT");
    return { t: "supprimerTable", tables: tables, siExiste: siE };
  };
  A.alter = function () {
    this.exigerMot("ALTER");
    this.exigerMot("TABLE");
    var st = { t: "modifierTable", table: this.nomTable(), actions: [] };
    do {
      if (this.mot("ADD")) {
        if (this.estMot("PRIMARY") || this.estMot("FOREIGN") || this.estMot("UNIQUE") || this.estMot("CONSTRAINT") || this.estMot("INDEX") || this.estMot("KEY") || this.estMot("CHECK"))
          st.actions.push({ t: "ajouterContrainte", c: this.contrainte() });
        else {
          this.mot("COLUMN");
          var col = this.colonne();
          var pos = null;
          if (this.mot("FIRST")) pos = { premier: true }; else if (this.mot("AFTER")) pos = { apres: this.nom() };
          st.actions.push({ t: "ajouterColonne", col: col, pos: pos });
        }
      } else if (this.mot("MODIFY")) {
        this.mot("COLUMN");
        st.actions.push({ t: "changerColonne", ancien: null, col: this.colonne() });
        this.mot("FIRST") || (this.mot("AFTER") && this.nom());
      } else if (this.mot("CHANGE")) {
        this.mot("COLUMN");
        var ancien = this.nom();
        st.actions.push({ t: "changerColonne", ancien: ancien, col: this.colonne() });
        this.mot("FIRST") || (this.mot("AFTER") && this.nom());
      } else if (this.mot("DROP")) {
        if (this.mot("PRIMARY")) { this.exigerMot("KEY"); st.actions.push({ t: "retirerPrimaire" }); }
        else if (this.mot("FOREIGN")) { this.exigerMot("KEY"); st.actions.push({ t: "retirerEtrangere", nom: this.nom() }); }
        else if (this.mot("INDEX") || this.mot("KEY")) { st.actions.push({ t: "retirerIndex", nom: this.nom() }); }
        else { this.mot("COLUMN"); st.actions.push({ t: "retirerColonne", nom: this.nom() }); }
      } else if (this.mot("RENAME")) {
        if (this.mot("COLUMN")) { var a = this.nom(); this.exigerMot("TO"); st.actions.push({ t: "renommerColonne", ancien: a, nouveau: this.nom() }); }
        else { this.mot("TO") || this.mot("AS"); st.actions.push({ t: "renommer", nom: this.nomTable() }); }
      } else if (this.mot("ENGINE") || this.mot("AUTO_INCREMENT") || this.mot("DEFAULT") || this.mot("CHARSET") || this.mot("CONVERT")) {
        while (this.voir().t !== "fin" && !this.estOp(";") && !this.estOp(",")) this.i++;
      } else throw this.erreur();
    } while (this.op(","));
    return st;
  };
  A.show = function () {
    this.exigerMot("SHOW");
    this.mot("FULL");
    if (this.mot("DATABASES") || this.mot("SCHEMAS")) return { t: "montrer", quoi: "bases" };
    if (this.mot("TABLES")) {
      var base = null;
      if (this.mot("FROM") || this.mot("IN")) base = this.nom();
      return { t: "montrer", quoi: "tables", base: base };
    }
    if (this.mot("COLUMNS") || this.mot("FIELDS")) {
      this.mot("FROM") || this.exigerMot("IN");
      return { t: "describe", table: this.nomTable() };
    }
    if (this.mot("CREATE")) { this.exigerMot("TABLE"); return { t: "montrerCreation", table: this.nomTable() }; }
    if (this.estMot("INDEX") || this.estMot("KEYS")) { this.i++; this.mot("FROM") || this.mot("IN"); return { t: "montrerIndex", table: this.nomTable() }; }
    throw this.erreur();
  };

  /* ═══════════════════════════════ 3. LES VALEURS ══════════════════════ */
  /* L'interclassement utf8mb4_general_ci : ni la casse ni les accents ne
     comptent, ni les espaces de fin. */
  var CLES = new Map();
  function cleTexte(s) {
    var k = CLES.get(s);
    if (k !== undefined) return k;
    k = String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+$/, "");
    if (CLES.size > 50000) CLES.clear();
    CLES.set(s, k);
    return k;
  }
  /* Un texte lu comme un nombre, à la façon de MariaDB : « 12abc » vaut 12,
     « abc » vaut 0. */
  function versNombre(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    var m = /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(String(v));
    return m ? parseFloat(m[0]) : 0;
  }
  function estNombre(v) { return typeof v === "number"; }
  /* Comparer deux valeurs : -1, 0, 1, ou null si l'une est NULL. */
  function comparer(a, b) {
    if (a === null || b === null || a === undefined || b === undefined) return null;
    if (estNombre(a) || estNombre(b)) {
      var x = versNombre(a), y = versNombre(b);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    var p = cleTexte(a), q = cleTexte(b);
    return p < q ? -1 : p > q ? 1 : 0;
  }
  function vrai(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return v !== 0;
    return versNombre(v) !== 0;
  }
  var deVerite = function (b) { return b === null ? null : b ? 1 : 0; };
  function texte(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return formatNombre(v);
    return String(v);
  }
  function formatNombre(n) {
    if (Number.isInteger(n)) return String(n);
    if (!isFinite(n)) return String(n);
    var s = String(Math.round(n * 1e12) / 1e12);
    return s;
  }

  /* Les dates : « AAAA-MM-JJ » et « AAAA-MM-JJ HH:MM:SS », comme MariaDB les écrit. */
  var p2 = function (x) { return String(x).padStart(2, "0"); };
  function maintenant() {
    var d = new Date();
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds());
  }
  function lireDate(v) {
    if (v === null || v === undefined) return null;
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v));
    if (!m) {
      var n = /^(\d{4})(\d{2})(\d{2})$/.exec(String(v));
      if (!n) return null;
      m = [n[0], n[1], n[2], n[3]];
    }
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
    if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return d;
  }
  var ecrireDate = function (d) { return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()); };
  var ecrireDateHeure = function (d) { return ecrireDate(d) + " " + p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()) + ":" + p2(d.getUTCSeconds()); };

  /* Une valeur rangée dans une colonne : convertie, et refusée en mode
     strict si elle n'y entre pas — c'est le comportement par défaut de
     MariaDB depuis la 10.2. */
  function convertir(v, col, rang, table) {
    var t = col.type;
    if (v === null || v === undefined) return null;
    var qui = (table && table.base ? "`" + table.base + "`.`" + table.nom + "`." : "") + "`" + col.nom + "`";
    switch (t.famille) {
      case "entier": {
        var n;
        if (typeof v === "number") n = v;
        else { var s = String(v).trim(); if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) { throw E.entierFaux(v, qui, rang); } n = parseFloat(s); }
        n = Math.round(n);
        var bornes = { TINYINT: 127, SMALLINT: 32767, MEDIUMINT: 8388607, INT: 2147483647, INTEGER: 2147483647, BIGINT: 9223372036854775807, YEAR: 2155, BIT: 1 };
        var max = bornes[t.nom] || 2147483647;
        if (t.nonSigne) { if (n < 0 || n > max * 2 + 1) throw E.horsLimites(col.nom, rang); }
        else if (n > max || n < -max - 1) throw E.horsLimites(col.nom, rang);
        return n;
      }
      case "decimal": {
        var d;
        if (typeof v === "number") d = v;
        else { var s2 = String(v).trim(); if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s2)) throw E.decimalFaux(v, qui, rang); d = parseFloat(s2); }
        var echelle = t.args.length > 1 ? t.args[1] : 0, precision = t.args.length ? t.args[0] : 10;
        d = Math.round(d * Math.pow(10, echelle)) / Math.pow(10, echelle);
        if (Math.abs(d) >= Math.pow(10, precision - echelle)) throw E.horsLimites(col.nom, rang);
        return d;
      }
      case "reel": {
        if (typeof v === "number") return v;
        var s3 = String(v).trim();
        if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s3)) throw ErreurSql(1366, "22007", "Incorrect double value: '" + v + "' for column " + qui + " at row " + rang);
        return parseFloat(s3);
      }
      case "texte": {
        var x = texte(v);
        var lim = t.args.length ? t.args[0] : { TINYTEXT: 255, TEXT: 65535, MEDIUMTEXT: 16777215, LONGTEXT: 4294967295 }[t.nom];
        if (lim !== undefined && [...x].length > lim) throw E.tropLong(col.nom, rang);
        return x;
      }
      case "date": {
        if (v === 0 || v === "0000-00-00") return "0000-00-00";
        var dt = lireDate(v);
        if (!dt) throw E.dateFausse(v, qui, rang);
        return ecrireDate(dt);
      }
      case "dateheure": {
        var dh = lireDate(v);
        if (!dh) throw E.dateFausse(v, qui, rang, "datetime");
        return ecrireDateHeure(dh);
      }
      case "heure": return texte(v);
      case "enum": {
        var k = cleTexte(texte(v));
        for (var i = 0; i < t.args.length; i++) if (cleTexte(t.args[i]) === k) return t.args[i];
        throw E.enumFaux(col.nom, rang);
      }
    }
    return v;
  }
  /* Le type écrit comme MariaDB l'affiche (DESCRIBE, SHOW CREATE TABLE). */
  function ecrireType(t) {
    var n = t.nom.toLowerCase();
    if (t.nom === "INT" && !t.args.length) n = "int(11)";
    else if (t.args.length) n += "(" + t.args.map(function (a) { return typeof a === "string" ? "'" + a + "'" : a; }).join(",") + ")";
    return n + (t.nonSigne ? " unsigned" : "");
  }

  /* ═══════════════════════════════ 4. LE SERVEUR ═══════════════════════ */
  function Serveur(etat) {
    this.bases = new Map();       // nom en minuscules → { nom, tables: Map }
    this.courante = null;
    this.derniereId = 0;
    if (etat) this.charger(etat);
  }
  var S = Serveur.prototype;

  S.base = function (nom) {
    var b = this.bases.get(String(nom).toLowerCase());
    if (!b) throw E.baseAbsente(nom);
    return b;
  };
  S.baseCourante = function (nom) {
    if (nom) return this.base(nom);
    if (!this.courante) throw E.pasDeBase();
    return this.base(this.courante);
  };
  S.table = function (ref) {
    var b = this.baseCourante(ref.base);
    var t = b.tables.get(String(ref.nom).toLowerCase());
    if (!t) throw E.tableAbsente(b.nom, ref.nom);
    return t;
  };
  S.indexColonne = function (t, nom, ou) {
    var k = String(nom).toLowerCase();
    for (var i = 0; i < t.colonnes.length; i++) if (t.colonnes[i].nom.toLowerCase() === k) return i;
    throw E.colonneInconnue(nom, ou || "field list");
  };

  /* Exécuter un script : chaque instruction tour à tour, jusqu'à la
     première erreur (comme l'onglet SQL de phpMyAdmin). */
  S.executer = function (sql, params) {
    var a = new Analyseur(sql), res = [];
    for (;;) {
      var st;
      try { st = a.suivante(); }
      catch (e) { if (!e.sql) throw e; e.lecture = true; return { resultats: res, erreur: e, restantes: null }; }
      if (!st) return { resultats: res, erreur: null };
      try {
        var r = this.instruction(st, params || null);
        r.texte = st.texte; r.ligne = st.ligne; r.colonne = colonneDe(sql, st.debut);
        res.push(r);
      } catch (e) {
        if (!e.sql) throw e;
        e.ligne = e.ligne || st.ligne;
        e.colonne = e.colonne || colonneDe(sql, st.debut);
        e.texte = st.texte;
        // ce qui ne s'exécutera pas : MariaDB s'arrête à la première erreur
        var restantes = 0;
        try { while (a.suivante()) restantes++; } catch (e2) { restantes++; }
        return { resultats: res, erreur: e, restantes: restantes };
      }
    }
  };
  /* Une seule instruction, avec ses paramètres (PDO) : jette en cas d'erreur. */
  S.requete = function (sql, params) {
    var a = new Analyseur(sql);
    var l = a.script();
    if (!l.length) throw ErreurSql(1065, "42000", "Query was empty");
    var r = null;
    for (var k = 0; k < l.length; k++) r = this.instruction(l[k], params || null);
    return r;
  };
  S.instruction = function (st, params) {
    var r = this.executerUne(st, params);
    this.dernierCompte = r.type === "modif" ? r.affectees : -1;   // pour ROW_COUNT()
    return r;
  };
  S.executerUne = function (st, params) {
    var ctx = { serveur: this, params: params, avert: [] };
    switch (st.t) {
      case "select": return this.selectionner(st, ctx);
      case "insert": return this.inserer(st, ctx);
      case "update": return this.mettreAJour(st, ctx);
      case "delete": return this.supprimer(st, ctx);
      case "creerBase": return this.creerBase(st);
      case "supprimerBase": return this.supprimerBase(st);
      case "use": this.base(st.nom); this.courante = this.base(st.nom).nom; return { type: "info", message: "Base « " + this.courante + " » sélectionnée" };
      case "creerTable": return this.creerTable(st, ctx);
      case "supprimerTable": return this.supprimerTable(st);
      case "modifierTable": return this.modifierTable(st, ctx);
      case "truncate": { var t = this.table(st.table); this.verifierParent(t, t.lignes, "suppr"); t.lignes = []; t.auto = 1; return { type: "modif", affectees: 0 }; }
      case "renommer": return this.modifierTable({ table: st.de, actions: [{ t: "renommer", nom: st.vers }] }, ctx);
      case "montrer": return this.montrer(st);
      case "describe": return this.decrire(st.table);
      case "montrerCreation": return this.montrerCreation(st.table);
      case "montrerIndex": return { type: "select", colonnes: ["Table", "Non_unique", "Key_name", "Column_name"], lignes: this.index(this.table(st.table)) };
      case "rien": case "reglage": return { type: "info", message: "OK" };
    }
    throw ErreurSql(1064, "42000", "Instruction non prise en charge");
  };

  /* ── les bases ── */
  S.creerBase = function (st) {
    var k = String(st.nom).toLowerCase();
    if (this.bases.has(k)) {
      if (st.siAbsente) return { type: "modif", affectees: 0, avertissements: 1 };
      throw E.baseExiste(st.nom);
    }
    this.bases.set(k, { nom: st.nom, tables: new Map() });
    return { type: "modif", affectees: 1 };
  };
  S.supprimerBase = function (st) {
    var k = String(st.nom).toLowerCase();
    if (!this.bases.has(k)) {
      if (st.siExiste) return { type: "modif", affectees: 0 };
      throw ErreurSql(1008, "HY000", "Can't drop database '" + st.nom + "'; database doesn't exist");
    }
    var n = this.bases.get(k).tables.size;
    this.bases.delete(k);
    if (this.courante && this.courante.toLowerCase() === k) this.courante = null;
    return { type: "modif", affectees: n };
  };

  /* ── CREATE TABLE ── */
  /* La valeur par défaut d'une colonne déclarée : une constante, ou
     CURRENT_TIMESTAMP / NOW(), recalculée à chaque insertion. */
  S.defautDe = function (c, ctx) {
    var d = c.defaut;
    if (d === undefined) return undefined;
    if (d.t === "val") return d.v;
    if (d.t === "col" && /^current_timestamp$/i.test(d.nom)) return { fn: "NOW" };
    if (d.t === "fn" && /^(now|current_timestamp|curdate|current_date|sysdate)$/i.test(d.nom)) return { fn: d.nom.toUpperCase() };
    return this.evaluer(d, { ligne: [], schema: [] }, ctx);
  };
  S.creerTable = function (st, ctx) {
    var b = this.baseCourante(st.table.base);
    var k = String(st.table.nom).toLowerCase();
    if (b.tables.has(k)) {
      if (st.siAbsente) return { type: "modif", affectees: 0, avertissements: 1 };
      throw E.tableExiste(st.table.nom);
    }
    var t = { nom: st.table.nom, base: b.nom, colonnes: [], lignes: [], auto: 1, primaire: null, uniques: [], etrangeres: [], verifs: [], nbFk: 0 };
    if (st.comme) {
      var modele = this.table(st.comme);
      t.colonnes = JSON.parse(JSON.stringify(modele.colonnes));
      t.primaire = modele.primaire ? modele.primaire.slice() : null;
      t.uniques = JSON.parse(JSON.stringify(modele.uniques));
      b.tables.set(k, t);
      return { type: "modif", affectees: 0 };
    }
    if (st.select) {
      var r = this.selectionner(st.select, ctx);
      t.colonnes = r.colonnes.map(function (c, i) {
        var tous = r.lignes.map(function (l) { return l[i]; }).filter(function (v) { return v !== null; });
        var entier = tous.length && tous.every(function (v) { return typeof v === "number" && Number.isInteger(v); });
        var reel = tous.length && tous.every(function (v) { return typeof v === "number"; });
        return { nom: c, type: entier ? { nom: "INT", args: [], famille: "entier" } : reel ? { nom: "DOUBLE", args: [], famille: "reel" } : { nom: "TEXT", args: [], famille: "texte" }, nonNul: false, defaut: undefined, auto: false };
      });
      t.lignes = r.lignes.map(function (l) { return l.slice(); });
      b.tables.set(k, t);
      return { type: "modif", affectees: t.lignes.length };
    }
    var vus = {};
    var self = this;
    st.colonnes.forEach(function (c) {
      var kc = c.nom.toLowerCase();
      if (vus[kc]) throw E.colonneExiste(c.nom);
      vus[kc] = 1;
      t.colonnes.push({ nom: c.nom, type: c.type, nonNul: c.nonNul || c.primaire, defaut: self.defautDe(c, ctx), auto: c.auto, commentaire: c.commentaire });
    });
    st.colonnes.forEach(function (c, i) {
      if (c.primaire) { if (t.primaire) throw E.clePrimaire(); t.primaire = [i]; }
      if (c.unique) t.uniques.push({ nom: c.nom, colonnes: [i] });
      if (c.ref) self.ajouterEtrangere(t, { colonnes: [c.nom], ref: c.ref, nom: null });
      // le CHECK écrit sur la colonne : MariaDB le nomme « table.colonne »
      if (c.verif) t.verifs.push({ t: "verif", nom: t.nom + "." + c.nom, e: c.verif });
    });
    st.contraintes.forEach(function (c) { self.ajouterContrainte(t, c); });
    var nbAuto = t.colonnes.filter(function (c) { return c.auto; }).length;
    if (nbAuto > 1) throw E.autoSansCle();
    if (nbAuto === 1) {
      var ia = t.colonnes.findIndex(function (c) { return c.auto; });
      var estCle = (t.primaire && t.primaire[0] === ia) || t.uniques.some(function (u) { return u.colonnes[0] === ia; });
      if (!estCle) throw E.autoSansCle();
    }
    b.tables.set(k, t);
    return { type: "modif", affectees: 0 };
  };
  S.ajouterContrainte = function (t, c) {
    var self = this;
    var idx = function (noms) { return noms.map(function (n) { return self.indexColonne(t, n, "field list"); }); };
    if (c.t === "primaire") {
      if (t.primaire) throw E.clePrimaire();
      t.primaire = idx(c.colonnes);
      t.primaire.forEach(function (i) { t.colonnes[i].nonNul = true; });
    } else if (c.t === "unique") t.uniques.push({ nom: c.nom || c.colonnes[0], colonnes: idx(c.colonnes) });
    else if (c.t === "etrangere") this.ajouterEtrangere(t, c);
    else if (c.t === "verif") t.verifs.push(c);
  };
  S.ajouterEtrangere = function (t, c) {
    var cols = c.colonnes.map(function (n) { return this.indexColonne(t, n, "field list"); }, this);
    var nomRef = c.ref.table.nom;
    var refBase = c.ref.table.base || t.base;
    // une table qui se référence elle-même, ou une table déjà là
    var cible = String(nomRef).toLowerCase() === t.nom.toLowerCase() ? t : this.base(refBase).tables.get(String(nomRef).toLowerCase());
    if (!cible) throw ErreurSql(1005, "HY000", "Can't create table `" + t.base + "`.`" + t.nom + "` (errno: 150 \"Foreign key constraint is incorrectly formed\")");
    var refCols = (c.ref.colonnes.length ? c.ref.colonnes : (cible.primaire || []).map(function (i) { return cible.colonnes[i].nom; }));
    var refIdx = refCols.map(function (n) { return this.indexColonne(cible, n, "field list"); }, this);
    t.nbFk = (t.nbFk || 0) + 1;
    t.etrangeres.push({ nom: c.nom || (t.nom + "_ibfk_" + t.nbFk), colonnes: cols, table: cible.nom, base: refBase, refColonnes: refIdx, surSuppr: c.ref.surSuppr, surMaj: c.ref.surMaj });
  };

  S.supprimerTable = function (st) {
    var n = 0;
    for (var k = 0; k < st.tables.length; k++) {
      var ref = st.tables[k];
      var b = this.baseCourante(ref.base);
      var kt = String(ref.nom).toLowerCase();
      var t = b.tables.get(kt);
      if (!t) { if (st.siExiste) continue; throw ErreurSql(1051, "42S02", "Unknown table '" + b.nom + "." + ref.nom + "'"); }
      // une table qu'une autre référence ne part pas (sauf si l'autre part avec elle)
      var partantes = st.tables.map(function (x) { return String(x.nom).toLowerCase(); });
      b.tables.forEach(function (autre, ka) {
        if (ka === kt || partantes.indexOf(ka) >= 0) return;
        autre.etrangeres.forEach(function (fk) {
          if (fk.table.toLowerCase() === kt) throw ErreurSql(1451, "23000", "Cannot delete or update a parent row: a foreign key constraint fails");
        });
      });
      b.tables.delete(kt);
      n++;
    }
    return { type: "modif", affectees: 0 };
  };

  /* ── ALTER TABLE ── */
  S.modifierTable = function (st, ctx) {
    var t = this.table(st.table);
    var b = this.baseCourante(st.table.base);
    var self = this;
    st.actions.forEach(function (a) {
      if (a.t === "ajouterColonne") {
        if (t.colonnes.some(function (c) { return c.nom.toLowerCase() === a.col.nom.toLowerCase(); })) throw E.colonneExiste(a.col.nom);
        var c = { nom: a.col.nom, type: a.col.type, nonNul: a.col.nonNul || a.col.primaire, defaut: self.defautDe(a.col, ctx), auto: a.col.auto };
        var pos = t.colonnes.length;
        if (a.pos && a.pos.premier) pos = 0;
        else if (a.pos && a.pos.apres) pos = self.indexColonne(t, a.pos.apres) + 1;
        var valeur = c.defaut !== undefined ? c.defaut : c.nonNul ? (c.type.famille === "texte" || c.type.famille === "enum" ? "" : c.type.famille === "date" ? "0000-00-00" : 0) : null;
        t.colonnes.splice(pos, 0, c);
        t.lignes.forEach(function (l, i) { l.splice(pos, 0, c.auto ? i + 1 : valeur); });
        decaler(t, pos, 1);
        if (a.col.primaire) { if (t.primaire) throw E.clePrimaire(); t.primaire = [pos]; }
        if (a.col.unique) t.uniques.push({ nom: c.nom, colonnes: [pos] });
        if (c.auto) t.auto = t.lignes.length + 1;
      } else if (a.t === "changerColonne") {
        var i = self.indexColonne(t, a.ancien || a.col.nom);
        // MODIFY redéfinit TOUTE la colonne : sans NOT NULL ni DEFAULT, elle les perd
        var neuve = { nom: a.col.nom, type: a.col.type, nonNul: a.col.nonNul || a.col.primaire, defaut: self.defautDe(a.col, ctx), auto: a.col.auto || false };
        // les valeurs existantes doivent entrer dans le nouveau type
        t.lignes.forEach(function (l, r) {
          if (l[i] === null && neuve.nonNul) throw ErreurSql(1265, "01000", "Data truncated for column '" + neuve.nom + "' at row " + (r + 1));
          l[i] = convertir(l[i], neuve, r + 1, t);
        });
        t.colonnes[i] = neuve;
        if (a.col.primaire && !t.primaire) t.primaire = [i];
      } else if (a.t === "retirerColonne") {
        var j = self.indexColonne(t, a.nom);
        t.colonnes.splice(j, 1);
        t.lignes.forEach(function (l) { l.splice(j, 1); });
        if (t.primaire) { t.primaire = t.primaire.filter(function (x) { return x !== j; }); if (!t.primaire.length) t.primaire = null; }
        t.uniques = t.uniques.filter(function (u) { return u.colonnes.indexOf(j) < 0; });
        t.etrangeres = t.etrangeres.filter(function (f) { return f.colonnes.indexOf(j) < 0; });
        decaler(t, j + 1, -1);
      } else if (a.t === "renommerColonne") {
        t.colonnes[self.indexColonne(t, a.ancien)].nom = a.nouveau;
      } else if (a.t === "renommer") {
        var kn = String(a.nom.nom).toLowerCase();
        if (b.tables.has(kn)) throw E.tableExiste(a.nom.nom);
        var ancien = t.nom;
        b.tables.delete(t.nom.toLowerCase());
        t.nom = a.nom.nom;
        b.tables.set(kn, t);
        b.tables.forEach(function (autre) { autre.etrangeres.forEach(function (f) { if (f.table.toLowerCase() === ancien.toLowerCase()) f.table = t.nom; }); });
      } else if (a.t === "ajouterContrainte") {
        self.ajouterContrainte(t, a.c);
        if (a.c.t === "etrangere") t.lignes.forEach(function (l) { self.verifierEnfant(t, l); });
        if (a.c.t === "primaire" || a.c.t === "unique") self.verifierUnicite(t);
      } else if (a.t === "retirerPrimaire") t.primaire = null;
      else if (a.t === "retirerEtrangere") t.etrangeres = t.etrangeres.filter(function (f) { return f.nom.toLowerCase() !== a.nom.toLowerCase(); });
      else if (a.t === "retirerIndex") t.uniques = t.uniques.filter(function (u) { return String(u.nom).toLowerCase() !== a.nom.toLowerCase(); });
    });
    return { type: "modif", affectees: 0 };
  };
  function decaler(t, depuis, de) {
    var f = function (x) { return x >= depuis ? x + de : x; };
    if (t.primaire) t.primaire = t.primaire.map(f);
    t.uniques.forEach(function (u) { u.colonnes = u.colonnes.map(f); });
    t.etrangeres.forEach(function (e) { e.colonnes = e.colonnes.map(f); });
  }

  /* ── SHOW, DESCRIBE ── */
  S.montrer = function (st) {
    if (st.quoi === "bases") {
      var l = [["information_schema"]];
      this.bases.forEach(function (b) { l.push([b.nom]); });
      return { type: "select", colonnes: ["Database"], lignes: l };
    }
    var b = this.baseCourante(st.base);
    var lignes = [];
    b.tables.forEach(function (t) { lignes.push([t.nom]); });
    lignes.sort(function (a, c) { return a[0].localeCompare(c[0]); });
    return { type: "select", colonnes: ["Tables_in_" + b.nom], lignes: lignes };
  };
  S.decrire = function (ref) {
    var t = this.table(ref);
    var lignes = t.colonnes.map(function (c, i) {
      var cle = t.primaire && t.primaire.indexOf(i) >= 0 ? "PRI" : t.uniques.some(function (u) { return u.colonnes[0] === i; }) ? "UNI" : t.etrangeres.some(function (f) { return f.colonnes[0] === i; }) ? "MUL" : "";
      var def = c.defaut === undefined ? null : c.defaut && c.defaut.fn ? "current_timestamp()" : c.defaut;
      return [c.nom, ecrireType(c.type), c.nonNul ? "NO" : "YES", cle, def === null ? null : texte(def), c.auto ? "auto_increment" : ""];
    });
    return { type: "select", colonnes: ["Field", "Type", "Null", "Key", "Default", "Extra"], lignes: lignes };
  };
  S.montrerCreation = function (ref) {
    var t = this.table(ref);
    var q = function (n) { return "`" + n + "`"; };
    var l = t.colonnes.map(function (c) {
      var d = c.defaut === undefined ? (c.nonNul ? "" : " DEFAULT NULL") : " DEFAULT " + (c.defaut && c.defaut.fn ? "current_timestamp()" : typeof c.defaut === "number" ? c.defaut : "'" + c.defaut + "'");
      return "  " + q(c.nom) + " " + ecrireType(c.type) + (c.nonNul ? " NOT NULL" : "") + (c.auto ? " AUTO_INCREMENT" : d);
    });
    if (t.primaire) l.push("  PRIMARY KEY (" + t.primaire.map(function (i) { return q(t.colonnes[i].nom); }).join(",") + ")");
    t.uniques.forEach(function (u) { l.push("  UNIQUE KEY " + q(u.nom) + " (" + u.colonnes.map(function (i) { return q(t.colonnes[i].nom); }).join(",") + ")"); });
    t.etrangeres.forEach(function (f) {
      l.push("  CONSTRAINT " + q(f.nom) + " FOREIGN KEY (" + f.colonnes.map(function (i) { return q(t.colonnes[i].nom); }).join(",") + ") REFERENCES " + q(f.table) + " (" + f.refColonnes.map(function (i) { return q(this.base(f.base).tables.get(f.table.toLowerCase()).colonnes[i].nom); }, this).join(",") + ")" + (f.surSuppr !== "RESTRICT" ? " ON DELETE " + f.surSuppr : ""));
    }, this);
    return { type: "select", colonnes: ["Table", "Create Table"], lignes: [[t.nom, "CREATE TABLE " + q(t.nom) + " (\n" + l.join(",\n") + "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"]] };
  };
  S.index = function (t) {
    var l = [];
    if (t.primaire) t.primaire.forEach(function (i) { l.push([t.nom, 0, "PRIMARY", t.colonnes[i].nom]); });
    t.uniques.forEach(function (u) { u.colonnes.forEach(function (i) { l.push([t.nom, 0, u.nom, t.colonnes[i].nom]); }); });
    t.etrangeres.forEach(function (f) { f.colonnes.forEach(function (i) { l.push([t.nom, 1, f.colonnes.length === 1 ? t.colonnes[i].nom : f.nom, t.colonnes[i].nom]); }); });
    return l;
  };

  /* ── les contraintes ── */
  function cleDe(l, cols) {
    var morceaux = [];
    for (var i = 0; i < cols.length; i++) {
      var v = l[cols[i]];
      if (v === null) return null;                 // NULL n'entre jamais en collision
      morceaux.push(typeof v === "number" ? "n" + v : "t" + cleTexte(v));
    }
    return morceaux.join("\u0001");
  }
  var afficherCle = function (l, cols) { return cols.map(function (i) { return texte(l[i]); }).join("-"); };
  S.verifierUnicite = function (t, ligne, ignorer) {
    var cles = [];
    if (t.primaire) cles.push({ nom: "PRIMARY", colonnes: t.primaire });
    t.uniques.forEach(function (u) { cles.push(u); });
    for (var k = 0; k < cles.length; k++) {
      var c = cles[k];
      var vues = new Map();
      var aVerifier = ligne ? [ligne] : t.lignes;
      if (ligne) {
        var cl = cleDe(ligne, c.colonnes);
        if (cl === null) continue;
        for (var r = 0; r < t.lignes.length; r++) {
          if (t.lignes[r] === ignorer || t.lignes[r] === ligne) continue;
          if (cleDe(t.lignes[r], c.colonnes) === cl) return { erreur: E.doublon(afficherCle(ligne, c.colonnes), c.nom), ligne: t.lignes[r] };
        }
      } else {
        for (var r2 = 0; r2 < aVerifier.length; r2++) {
          var cl2 = cleDe(aVerifier[r2], c.colonnes);
          if (cl2 === null) continue;
          if (vues.has(cl2)) throw E.doublon(afficherCle(aVerifier[r2], c.colonnes), c.nom);
          vues.set(cl2, true);
        }
      }
    }
    return null;
  };
  S.descFk = function (t, f) {
    var parent = this.base(f.base).tables.get(f.table.toLowerCase());
    return "`" + t.base + "`.`" + t.nom + "`, CONSTRAINT `" + f.nom + "` FOREIGN KEY (" + f.colonnes.map(function (i) { return "`" + t.colonnes[i].nom + "`"; }).join(", ") +
      ") REFERENCES `" + f.table + "` (" + f.refColonnes.map(function (i) { return "`" + (parent ? parent.colonnes[i].nom : "?") + "`"; }).join(", ") + ")" +
      (f.surSuppr !== "RESTRICT" ? " ON DELETE " + f.surSuppr : "");
  };
  /* Une ligne enfant doit pointer vers une ligne parent qui existe. */
  S.verifierEnfant = function (t, l) {
    for (var k = 0; k < t.etrangeres.length; k++) {
      var f = t.etrangeres[k];
      var cle = cleDe(l, f.colonnes);
      if (cle === null) continue;
      var parent = this.base(f.base).tables.get(f.table.toLowerCase());
      var ok = parent && parent.lignes.some(function (p) { return cleDe(p, f.refColonnes) === cle; });
      if (!ok) throw E.fkEnfant(this.descFk(t, f));
    }
  };
  /* Avant de supprimer (ou de changer la clé de) des lignes parents : les
     enfants bloquent (RESTRICT), suivent (CASCADE) ou perdent leur lien
     (SET NULL). Rend les actions à faire, sans rien toucher. */
  S.enfantsDe = function (t, lignes) {
    var actions = [];
    var self = this;
    this.bases.forEach(function (b) {
      b.tables.forEach(function (enfant) {
        enfant.etrangeres.forEach(function (f) {
          if (f.table.toLowerCase() !== t.nom.toLowerCase() || f.base.toLowerCase() !== t.base.toLowerCase()) return;
          var cles = new Set(lignes.map(function (p) { return cleDe(p, f.refColonnes); }).filter(function (x) { return x !== null; }));
          var touches = enfant.lignes.filter(function (l) { return cles.has(cleDe(l, f.colonnes)) && lignes.indexOf(l) < 0; });
          if (touches.length) actions.push({ enfant: enfant, f: f, lignes: touches });
        });
      });
    });
    return actions;
  };
  S.verifierParent = function (t, lignes, quoi) {
    var actions = this.enfantsDe(t, lignes);
    for (var k = 0; k < actions.length; k++) {
      var a = actions[k];
      var regle = quoi === "suppr" ? a.f.surSuppr : a.f.surMaj;
      if (regle === "RESTRICT" || regle === "SET DEFAULT") throw E.fkParent(this.descFk(a.enfant, a.f));
    }
    return actions;
  };
  S.appliquerCascade = function (actions, quoi, compteur) {
    for (var k = 0; k < actions.length; k++) {
      var a = actions[k];
      var regle = quoi === "suppr" ? a.f.surSuppr : a.f.surMaj;
      if (regle === "CASCADE" && quoi === "suppr") {
        var sous = this.verifierParent(a.enfant, a.lignes, "suppr");
        this.appliquerCascade(sous, "suppr", compteur);
        a.enfant.lignes = a.enfant.lignes.filter(function (l) { return a.lignes.indexOf(l) < 0; });
      } else if (regle === "SET NULL") {
        a.lignes.forEach(function (l) {
          a.f.colonnes.forEach(function (i) {
            if (a.enfant.colonnes[i].nonNul) throw E.nonNul(a.enfant.colonnes[i].nom);
            l[i] = null;
          });
        });
      }
    }
  };

  /* ── INSERT ── */
  S.inserer = function (st, ctx) {
    var t = this.table(st.table);
    var self = this;
    var cols;
    if (st.colonnes) cols = st.colonnes.map(function (n) { return self.indexColonne(t, n, "field list"); });
    else cols = t.colonnes.map(function (c, i) { return i; });
    var sources;
    if (st.select) {
      var r = this.selectionner(st.select, ctx);
      if (r.colonnes.length !== cols.length) throw E.nbColonnes(1);
      sources = r.lignes.map(function (l) { return l.map(function (v) { return { t: "val", v: v }; }); });
    } else sources = st.lignes;
    var n = 0, premierId = null;
    var nouvelles = [];
    var avant = t.lignes.slice(), autoAvant = t.auto;
    try {
      for (var r2 = 0; r2 < sources.length; r2++) {
        var valeurs = sources[r2];
        if (valeurs.length !== cols.length) throw E.nbColonnes(r2 + 1);
        var ligne = new Array(t.colonnes.length);
        var donnee = new Array(t.colonnes.length).fill(false);
        for (var k = 0; k < cols.length; k++) {
          var e = valeurs[k];
          if (e.t === "defaut") continue;
          ligne[cols[k]] = this.evaluer(e, { ligne: [], schema: [], clause: "field list" }, ctx);
          donnee[cols[k]] = true;
        }
        var id = this.completer(t, ligne, donnee, r2 + 1);
        if (id !== null && premierId === null) premierId = id;
        var conflit = this.verifierUnicite(t, ligne);
        if (conflit) {
          if (st.ignorer) { ctx.avert.push(conflit.erreur.message); continue; }
          if (st.remplacer) {
            var actions = this.verifierParent(t, [conflit.ligne], "suppr");
            this.appliquerCascade(actions, "suppr");
            t.lignes = t.lignes.filter(function (x) { return x !== conflit.ligne; });
            n++;
          } else if (st.surDoublon) {
            var cible = conflit.ligne;
            var env = { ligne: cible, schema: t.colonnes.map(function (c) { return { table: t.nom.toLowerCase(), nom: c.nom.toLowerCase(), affiche: c.nom }; }), clause: "field list", valeursInserees: ligne };
            st.surDoublon.forEach(function (a) { var i = self.indexColonne(t, a.col); cible[i] = convertir(self.evaluer(a.e, env, ctx), t.colonnes[i], r2 + 1, t); });
            n += 2;
            continue;
          } else throw conflit.erreur;
        }
        this.verifierVerifs(t, ligne, ctx);
        this.verifierEnfant(t, ligne);
        t.lignes.push(ligne);
        nouvelles.push(ligne);
        n++;
      }
    } catch (err) {
      // une erreur au milieu d'un INSERT de plusieurs lignes : rien n'est gardé (InnoDB)
      t.lignes = avant; t.auto = autoAvant;
      throw err;
    }
    if (premierId !== null) this.derniereId = premierId;
    return { type: "modif", affectees: n, insertId: premierId, avertissements: ctx.avert.length };
  };
  /* Les valeurs absentes : DEFAULT, AUTO_INCREMENT, ou l'erreur du mode strict. */
  S.completer = function (t, ligne, donnee, rang) {
    var id = null;
    for (var i = 0; i < t.colonnes.length; i++) {
      var c = t.colonnes[i];
      var v = ligne[i];
      if (c.auto && (!donnee[i] || v === null || v === 0 || v === "0")) {
        ligne[i] = t.auto;
        id = t.auto;
        t.auto++;
        continue;
      }
      if (!donnee[i]) {
        if (c.defaut !== undefined) v = c.defaut && c.defaut.fn ? (c.type.famille === "date" ? maintenant().slice(0, 10) : maintenant()) : c.defaut;
        else if (c.nonNul) {
          if (c.type.nom === "TIMESTAMP") v = maintenant();
          else throw E.sansDefaut(c.nom);
        } else v = null;
      }
      if (v === null && c.nonNul) {
        if (c.type.nom === "TIMESTAMP") v = maintenant();
        else throw E.nonNul(c.nom);
      }
      ligne[i] = convertir(v, c, rang, t);
      if (c.auto && typeof ligne[i] === "number" && ligne[i] >= t.auto) { t.auto = ligne[i] + 1; id = ligne[i]; }
    }
    return id;
  };
  S.verifierVerifs = function (t, ligne, ctx) {
    var env = { ligne: ligne, schema: t.colonnes.map(function (c) { return { table: t.nom.toLowerCase(), nom: c.nom.toLowerCase(), affiche: c.nom }; }), clause: "check" };
    for (var k = 0; k < (t.verifs || []).length; k++) {
      if (vrai(this.evaluer(t.verifs[k].e, env, ctx)) === false)
        throw ErreurSql(4025, "23000", "CONSTRAINT `" + (t.verifs[k].nom || "CONSTRAINT_1") + "` failed for `" + t.base + "`.`" + t.nom + "`");
    }
  };

  /* ── UPDATE ── */
  S.mettreAJour = function (st, ctx) {
    var self = this;
    var plan = this.planSources(st.source, ctx);
    var cibleT = plan.tables[0].t;
    var lignes = this.produire(plan, st.ou, ctx, "where clause");
    if (st.ordre) this.trier(lignes, st.ordre, plan.schema, ctx, null);
    if (st.limite) lignes = lignes.slice(0, versNombre(this.evaluer(st.limite, { ligne: [], schema: [] }, ctx)));
    var aff = st.affectations.map(function (a) {
      // la colonne visée : dans la table (ou l'une des tables) de l'UPDATE
      var k = String(a.col).toLowerCase(), trouve = null;
      plan.tables.forEach(function (pt) {
        pt.t.colonnes.forEach(function (c, i) { if (c.nom.toLowerCase() === k && !trouve) trouve = { pt: pt, i: i }; });
      });
      if (!trouve) throw E.colonneInconnue(a.col, "field list");
      return { pt: trouve.pt, i: trouve.i, e: a.e };
    });
    var modifiees = 0, vues = new Set();
    var sauvegarde = new Map();
    try {
      for (var r = 0; r < lignes.length; r++) {
        var env = { ligne: lignes[r], schema: plan.schema, clause: "field list" };
        var nouvelles = aff.map(function (a) { return self.evaluer(a.e, env, ctx); });
        for (var k = 0; k < aff.length; k++) {
          var a = aff[k];
          var reelle = lignes[r].sources[a.pt.rang];
          if (!reelle) continue;
          if (!sauvegarde.has(reelle)) sauvegarde.set(reelle, reelle.slice());
          var col = a.pt.t.colonnes[a.i];
          var v = nouvelles[k];
          if (v === null && col.nonNul) throw E.nonNul(col.nom);
          var ancienne = reelle[a.i];
          // la clé d'une ligne parent change : ses enfants
          var neuve = convertir(v, col, r + 1, a.pt.t);
          if (comparer(ancienne, neuve) !== 0 || (ancienne === null) !== (neuve === null)) {
            var estRef = this.enfantsDe(a.pt.t, [reelle]).some(function (x) { return x.f.refColonnes.indexOf(a.i) >= 0; });
            if (estRef) {
              var acts = this.verifierParent(a.pt.t, [reelle], "maj");
              acts.forEach(function (x) {
                if (x.f.surMaj === "CASCADE") x.lignes.forEach(function (l) { x.f.colonnes.forEach(function (ci, z) { if (x.f.refColonnes[z] === a.i) l[ci] = neuve; }); });
                if (x.f.surMaj === "SET NULL") x.lignes.forEach(function (l) { x.f.colonnes.forEach(function (ci) { l[ci] = null; }); });
              });
            }
          }
          reelle[a.i] = neuve;
          if (col.auto && typeof neuve === "number" && neuve >= a.pt.t.auto) a.pt.t.auto = neuve + 1;
        }
        lignes[r].sources.forEach(function (reelle2, z) {
          if (!reelle2 || !sauvegarde.has(reelle2)) return;
          var pt2 = plan.tables[z];
          var c = self.verifierUnicite(pt2.t, reelle2, reelle2);
          if (c) throw c.erreur;
          self.verifierEnfant(pt2.t, reelle2);
          self.verifierVerifs(pt2.t, reelle2, ctx);
          var avant = sauvegarde.get(reelle2);
          var change = avant.some(function (x, i) { return x !== reelle2[i]; });
          if (change && !vues.has(reelle2)) { modifiees++; vues.add(reelle2); }
        });
      }
    } catch (err) {
      sauvegarde.forEach(function (avant, l) { for (var i = 0; i < avant.length; i++) l[i] = avant[i]; });
      throw err;
    }
    return { type: "modif", affectees: modifiees, trouvees: lignes.length };
  };

  /* ── DELETE ── */
  S.supprimer = function (st, ctx) {
    var plan = this.planSources(st.source, ctx);
    var lignes = this.produire(plan, st.ou, ctx, "where clause");
    if (st.ordre) this.trier(lignes, st.ordre, plan.schema, ctx, null);
    if (st.limite) lignes = lignes.slice(0, versNombre(this.evaluer(st.limite, { ligne: [], schema: [] }, ctx)));
    var cibles = st.cibles ? st.cibles.map(function (n) {
      var k = n.toLowerCase();
      var pt = plan.tables.find(function (x) { return x.alias === k || x.t.nom.toLowerCase() === k; });
      if (!pt) throw E.tableAbsente(this.courante, n);
      return pt;
    }, this) : [plan.tables[0]];
    var total = 0;
    var self = this;
    var sauvegardes = this.photographier();
    try {
      cibles.forEach(function (pt) {
        var aSuppr = [];
        lignes.forEach(function (l) { var r = l.sources[pt.rang]; if (r && aSuppr.indexOf(r) < 0) aSuppr.push(r); });
        var actions = self.verifierParent(pt.t, aSuppr, "suppr");
        self.appliquerCascade(actions, "suppr");
        pt.t.lignes = pt.t.lignes.filter(function (l) { return aSuppr.indexOf(l) < 0; });
        total += aSuppr.length;
      });
    } catch (err) { this.restaurer(sauvegardes); throw err; }
    return { type: "modif", affectees: total };
  };
  S.photographier = function () {
    var p = [];
    this.bases.forEach(function (b) { b.tables.forEach(function (t) { p.push([t, t.lignes.slice(), t.lignes.map(function (l) { return l.slice(); })]); }); });
    return p;
  };
  S.restaurer = function (p) {
    p.forEach(function (x) { x[0].lignes = x[1]; x[1].forEach(function (l, i) { for (var k = 0; k < l.length; k++) l[k] = x[2][i][k]; }); });
  };

  /* ═══════════════════════════════ 5. SELECT ═══════════════════════════ */
  /* Le plan des sources : la liste des tables (avec leur alias et leur rang)
     et le schéma — chaque colonne visible : { table, nom, affiche, rang, i }. */
  S.planSources = function (arbre, ctx) {
    var plan = { tables: [], schema: [], arbre: arbre };
    var self = this;
    var poser = function (n) {
      if (!n) return;
      if (n.t === "jointure") { poser(n.gauche); poser(n.droite); return; }
      var rang = plan.tables.length;
      if (n.t === "table") {
        var t = self.table(n);
        var alias = (n.alias || n.nom).toLowerCase();
        if (plan.tables.some(function (x) { return x.alias === alias; })) throw ErreurSql(1066, "42000", "Not unique table/alias: '" + (n.alias || n.nom) + "'");
        plan.tables.push({ t: t, alias: alias, rang: rang, noeud: n });
        n.rang = rang;
        t.colonnes.forEach(function (c, i) { plan.schema.push({ table: alias, nom: c.nom.toLowerCase(), affiche: c.nom, rang: rang, i: i, type: c.type }); });
      } else if (n.t === "sous") {
        var r = self.selectionner(n.select, ctx);
        var virtuelle = { nom: n.alias, base: "", colonnes: r.colonnes.map(function (c) { return { nom: c, type: { famille: "texte", nom: "TEXT", args: [] } }; }), lignes: r.lignes, etrangeres: [], uniques: [], primaire: null };
        var al = n.alias.toLowerCase();
        plan.tables.push({ t: virtuelle, alias: al, rang: rang, noeud: n, derivee: true });
        n.rang = rang;
        virtuelle.colonnes.forEach(function (c, i) { plan.schema.push({ table: al, nom: c.nom.toLowerCase(), affiche: c.nom, rang: rang, i: i, type: (r.types || [])[i] }); });
      }
    };
    poser(arbre);
    return plan;
  };
  /* Les lignes du FROM, jointures faites, filtrées par WHERE. Une « ligne »
     garde ses sources (une ligne réelle par table, ou null pour le côté
     vide d'un LEFT JOIN) et ses valeurs à plat, dans l'ordre du schéma. */
  S.produire = function (plan, ou, ctx, clause, parent) {
    var self = this;
    var largeurs = plan.tables.map(function (pt) { return pt.t.colonnes.length; });
    var decalages = [];
    largeurs.reduce(function (s, w, i) { decalages[i] = s; return s + w; }, 0);
    var aPlat = function (sources) {
      var v = [];
      for (var k = 0; k < plan.tables.length; k++) {
        var s = sources[k];
        for (var i = 0; i < largeurs[k]; i++) v.push(s ? s[i] : null);
      }
      v.sources = sources;
      return v;
    };
    var vide = function () { return new Array(plan.tables.length).fill(null); };
    var evaluerSur = function (e, sources, cl) {
      return self.evaluer(e, { ligne: aPlat(sources), schema: plan.schema, clause: cl, parent: parent }, ctx);
    };
    var parcourir = function (n) {
      if (!n) return [vide()];
      if (n.t !== "jointure") {
        var pt = plan.tables[n.rang];
        return pt.t.lignes.map(function (l) { var s = vide(); s[n.rang] = l; return s; });
      }
      var gauche = parcourir(n.gauche), droite = parcourir(n.droite);
      var condition = n.on;
      if (n.naturel && !n.using) {
        // NATURAL JOIN : un USING sur toutes les colonnes de même nom
        n.using = plan.tables[n.droite.rang].t.colonnes.map(function (c) { return c.nom; }).filter(function (c) {
          try { rangGauche(n.gauche, c); return true; } catch (e) { return false; }
        });
      }
      if (n.using) {
        condition = null;
        n.using.forEach(function (c) {
          var eq = { t: "bin", op: "=", g: { t: "col", table: plan.tables[rangGauche(n.gauche, c)].alias, nom: c }, d: { t: "col", table: plan.tables[n.droite.rang].alias, nom: c } };
          condition = condition ? { t: "bin", op: "AND", g: condition, d: eq } : eq;
        });
      }
      var fusion = function (a, b) { var s = a.slice(); for (var k = 0; k < b.length; k++) if (b[k]) s[k] = b[k]; return s; };
      var out = [];
      if (n.type === "right") {
        droite.forEach(function (d) {
          var trouve = false;
          gauche.forEach(function (g) { var s = fusion(g, d); if (!condition || vrai(evaluerSur(condition, s, "on clause")) === true) { out.push(s); trouve = true; } });
          if (!trouve) out.push(d.slice());
        });
        return out;
      }
      gauche.forEach(function (g) {
        var trouve = false;
        droite.forEach(function (d) {
          var s = fusion(g, d);
          if (!condition || vrai(evaluerSur(condition, s, "on clause")) === true) { out.push(s); trouve = true; }
        });
        if (!trouve && n.type === "left") out.push(g.slice());
      });
      return out;
    };
    var rangGauche = function (n, col) {
      var k = String(col).toLowerCase();
      var cherche = function (x) {
        if (x.t === "jointure") return cherche(x.gauche) !== null ? cherche(x.gauche) : cherche(x.droite);
        return plan.tables[x.rang].t.colonnes.some(function (c) { return c.nom.toLowerCase() === k; }) ? x.rang : null;
      };
      var r = cherche(n);
      if (r === null) throw E.colonneInconnue(col, "from clause");
      return r;
    };
    // les noms du ON sont vérifiés même sans ligne (MariaDB le fait à la préparation)
    var verifierNoms = function (n) {
      if (!n || n.t !== "jointure") return;
      verifierNoms(n.gauche); verifierNoms(n.droite);
      if (n.on) self.verifierColonnes(n.on, plan.schema, "on clause", parent);
    };
    verifierNoms(plan.arbre);
    if (ou) self.verifierColonnes(ou, plan.schema, clause, parent);
    var sources = parcourir(plan.arbre);
    var lignes = sources.map(aPlat);
    if (ou) lignes = lignes.filter(function (l) { return vrai(self.evaluer(ou, { ligne: l, schema: plan.schema, clause: clause, parent: parent }, ctx)) === true; });
    return lignes;
  };
  /* Relever une colonne inconnue même quand la table est vide. */
  S.verifierColonnes = function (e, schema, clause, parent, alias) {
    var self = this;
    var visiter = function (x) {
      if (!x || typeof x !== "object") return;
      if (x.t === "col") {
        if (alias && !x.table && alias.some(function (a) { return a === x.nom.toLowerCase(); })) return;
        self.resoudre(x, { schema: schema, clause: clause, parent: parent });
        return;
      }
      if (x.t === "sous" || x.t === "existe" || (x.t === "dans" && x.select)) { if (x.e) visiter(x.e); return; }
      for (var k in x) if (x.hasOwnProperty(k) && k !== "select") {
        var v = x[k];
        if (Array.isArray(v)) v.forEach(function (y) { if (y && y.t) visiter(y); else if (y && typeof y === "object") { visiter(y.si); visiter(y.alors); visiter(y.e); } });
        else if (v && typeof v === "object" && v.t) visiter(v);
      }
    };
    visiter(e);
  };

  var AGREGATS = { COUNT: 1, SUM: 1, AVG: 1, MIN: 1, MAX: 1, GROUP_CONCAT: 1, STD: 1, STDDEV: 1, VARIANCE: 1, BIT_AND: 1, BIT_OR: 1 };
  function contientAgregat(e) {
    if (!e || typeof e !== "object") return false;
    if (e.t === "fn" && AGREGATS[e.nom]) return true;
    if (e.t === "sous" || e.t === "existe") return false;
    for (var k in e) {
      if (!e.hasOwnProperty(k) || k === "select") continue;
      var v = e[k];
      if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) if (contientAgregat(v[i]) || (v[i] && (contientAgregat(v[i].si) || contientAgregat(v[i].alors) || contientAgregat(v[i].e)))) return true; }
      else if (v && typeof v === "object" && contientAgregat(v)) return true;
    }
    return false;
  }

  S.selectionner = function (st, ctx, parent) {
    var r = this.selectCoeur(st.coeur, ctx, parent);
    if (st.unions && st.unions.length) {
      var lignes = r.lignes.slice();
      var distinct = false;
      for (var k = 0; k < st.unions.length; k++) {
        var u = this.selectCoeur(st.unions[k].select, ctx, parent);
        if (u.colonnes.length !== r.colonnes.length) throw E.union();
        lignes = lignes.concat(u.lignes);
        if (!st.unions[k].tous) distinct = true;
      }
      if (distinct) lignes = sansDoublons(lignes);
      var schema = r.colonnes.map(function (c, i) { return { table: null, nom: String(c).toLowerCase(), affiche: c, i: i }; });
      if (st.ordre) {
        var self = this;
        var cles = lignes.map(function (l) {
          var w = l.slice(); w.sources = [];
          return st.ordre.map(function (o) {
            if (o.e.t === "val" && typeof o.e.v === "number") return l[o.e.v - 1];
            return self.evaluer(o.e, { ligne: l, schema: schema.map(function (s, i) { return { table: null, nom: s.nom, affiche: s.affiche, rang: 0, i: i }; }), clause: "order clause", aPlat: true }, ctx);
          });
        });
        var idx = lignes.map(function (l, i) { return i; });
        idx.sort(function (a, b) { return comparerCles(cles[a], cles[b], st.ordre); });
        lignes = idx.map(function (i) { return lignes[i]; });
      }
      lignes = this.limiter(lignes, st, ctx);
      return { type: "select", colonnes: r.colonnes, lignes: lignes, types: r.types };
    }
    return r;
  };
  function sansDoublons(lignes) {
    var vues = new Set(), out = [];
    lignes.forEach(function (l) {
      var k = l.map(function (v) { return v === null ? "\u0000" : typeof v === "number" ? "n" + v : "t" + cleTexte(v); }).join("\u0001");
      if (!vues.has(k)) { vues.add(k); out.push(l); }
    });
    return out;
  }
  function comparerCles(a, b, ordre) {
    for (var k = 0; k < ordre.length; k++) {
      var x = a[k], y = b[k], c;
      // NULL d'abord en ordre croissant, comme MariaDB
      if (x === null && y === null) c = 0;
      else if (x === null) c = -1;
      else if (y === null) c = 1;
      else c = comparer(x, y);
      if (c) return ordre[k].desc ? -c : c;
    }
    return 0;
  }
  S.limiter = function (lignes, st, ctx) {
    var env0 = { ligne: [], schema: [] };
    var dec = st.decalage ? versNombre(this.evaluer(st.decalage, env0, ctx)) : 0;
    if (st.limite) return lignes.slice(dec, dec + versNombre(this.evaluer(st.limite, env0, ctx)));
    return dec ? lignes.slice(dec) : lignes;
  };

  S.selectCoeur = function (c, ctx, parent) {
    if (c.sousSelect) return this.selectionner(c.sousSelect, ctx, parent);
    var self = this;
    var plan = c.de ? this.planSources(c.de, ctx) : { tables: [], schema: [], arbre: null };
    var lignes = this.produire(plan, c.ou, ctx, "where clause", parent);
    /* Le type d'une colonne du résultat, pour l'écrire comme MariaDB : un
       DECIMAL(10,2) garde ses deux décimales jusque dans SUM, MIN et MAX ;
       AVG en ajoute quatre (AVG d'entiers : 3.0000). */
    function typeDe(e) {
      if (e.t === "col") {
        var s = self.resoudre(e, { schema: plan.schema, clause: "field list", parent: parent }, true);
        return s && s.schema ? s.schema.type || null : null;
      }
      if (e.t === "fn" && e.args && e.args.length && /^(SUM|MIN|MAX|AVG)$/.test(e.nom)) {
        var t = typeDe(e.args[0]);
        if (!t) return null;
        var echelle = t.famille === "decimal" ? (t.args.length > 1 ? t.args[1] : 0) : t.famille === "entier" ? 0 : null;
        if (e.nom === "AVG" && echelle !== null) return { nom: "DECIMAL", famille: "decimal", args: [65, Math.min(echelle + 4, 30)] };
        if (e.nom === "SUM" && t.famille === "decimal") return { nom: "DECIMAL", famille: "decimal", args: [65, echelle] };
        return e.nom === "SUM" ? null : t;
      }
      return null;
    }
    // les colonnes du résultat : * développée, noms, types
    var sorties = [];
    c.colonnes.forEach(function (col) {
      if (col.etoile) {
        var cibles = plan.schema.filter(function (s) { return !col.table || s.table === col.table.toLowerCase(); });
        if (col.table && !plan.tables.some(function (t) { return t.alias === col.table.toLowerCase(); })) throw ErreurSql(1051, "42S02", "Unknown table '" + col.table + "'");
        if (!c.de) throw ErreurSql(1096, "HY000", "No tables used");
        cibles.forEach(function (s) { sorties.push({ e: { t: "col", table: s.table, nom: s.nom }, nom: s.affiche, type: s.type }); });
      } else {
        var nom = col.alias !== null && col.alias !== undefined ? col.alias : col.e.t === "col" ? null : col.texte;
        var type = typeDe(col.e);
        if (col.e.t === "col") {
          var s = self.resoudre(col.e, { schema: plan.schema, clause: "field list", parent: parent }, true);
          nom = nom || (s && s.schema ? s.schema.affiche : col.e.nom);
        }
        sorties.push({ e: col.e, nom: nom, type: type });
      }
    });
    var alias = sorties.map(function (s) { return String(s.nom).toLowerCase(); });
    var groupe = !!c.groupe || sorties.some(function (s) { return contientAgregat(s.e); }) || contientAgregat(c.ayant);
    // vérifier les noms, même sur une table vide
    sorties.forEach(function (s) { self.verifierColonnes(s.e, plan.schema, "field list", parent); });
    if (c.groupe) c.groupe.forEach(function (g) { if (!(g.t === "val" && typeof g.v === "number")) self.verifierColonnes(g, plan.schema, "group statement", parent, alias); });
    if (c.ayant) self.verifierColonnes(c.ayant, plan.schema, "having clause", parent, alias);
    var lignesSortie = [];
    var envDe = function (l, groupeLignes) { return { ligne: l || [], schema: plan.schema, groupe: groupeLignes, parent: parent, clause: "field list" }; };
    var paquets;
    if (groupe) {
      if (c.groupe) {
        var cles = new Map(), valeursCles = [];
        paquets = [];
        lignes.forEach(function (l) {
          var brutes = [];
          var k = c.groupe.map(function (g) {
            var v;
            if (g.t === "val" && typeof g.v === "number") v = self.evaluer(sorties[g.v - 1].e, envDe(l), ctx);
            else if (g.t === "col" && !g.table && alias.indexOf(g.nom.toLowerCase()) >= 0 && !plan.schema.some(function (s) { return s.nom === g.nom.toLowerCase(); }))
              v = self.evaluer(sorties[alias.indexOf(g.nom.toLowerCase())].e, envDe(l), ctx);
            else v = self.evaluer(g, Object.assign(envDe(l), { clause: "group statement" }), ctx);
            brutes.push(v);
            return v === null ? "\u0000" : typeof v === "number" ? "n" + v : "t" + cleTexte(v);
          }).join("\u0001");
          if (!cles.has(k)) { cles.set(k, paquets.length); paquets.push([]); valeursCles.push(brutes); }
          paquets[cles.get(k)].push(l);
        });
        /* Sans ORDER BY, MariaDB rend les groupes TRIÉS par la clé du GROUP BY. */
        if (!c.ordre) {
          var rang = paquets.map(function (p, i) { return i; });
          var asc = c.groupe.map(function () { return { desc: false }; });
          rang.sort(function (a, b) { return comparerCles(valeursCles[a], valeursCles[b], asc) || a - b; });
          paquets = rang.map(function (i) { return paquets[i]; });
        }
      } else paquets = [lignes];
      paquets.forEach(function (p) {
        var env = envDe(p[0] || null, p);
        if (!p.length) env.ligne = new Array(plan.schema.length).fill(null);
        var valeurs = sorties.map(function (s) { return self.evaluer(s.e, env, ctx); });
        if (c.ayant) {
          var envA = Object.assign({}, env, { clause: "having clause", sortie: { noms: alias, valeurs: valeurs } });
          if (vrai(self.evaluer(c.ayant, envA, ctx)) !== true) return;
        }
        lignesSortie.push({ valeurs: valeurs, env: env });
      });
    } else {
      lignes.forEach(function (l) {
        var env = envDe(l, null);
        lignesSortie.push({ valeurs: sorties.map(function (s) { return self.evaluer(s.e, env, ctx); }), env: env });
      });
    }
    if (c.distinct) {
      var vues = new Set();
      lignesSortie = lignesSortie.filter(function (l) {
        var k = l.valeurs.map(function (v) { return v === null ? "\u0000" : typeof v === "number" ? "n" + v : "t" + cleTexte(v); }).join("\u0001");
        if (vues.has(k)) return false;
        vues.add(k);
        return true;
      });
    }
    if (c.ordre) {
      c.ordre.forEach(function (o) { if (!(o.e.t === "val" && typeof o.e.v === "number")) self.verifierColonnes(o.e, plan.schema, "order clause", parent, alias); });
      var cles2 = lignesSortie.map(function (l) {
        return c.ordre.map(function (o) {
          if (o.e.t === "val" && typeof o.e.v === "number") return l.valeurs[o.e.v - 1];
          var env = Object.assign({}, l.env, { clause: "order clause", sortie: { noms: alias, valeurs: l.valeurs }, prefererSortie: true });
          return self.evaluer(o.e, env, ctx);
        });
      });
      var idx = lignesSortie.map(function (l, i) { return i; });
      idx.sort(function (a, b) { return comparerCles(cles2[a], cles2[b], c.ordre) || a - b; });
      lignesSortie = idx.map(function (i) { return lignesSortie[i]; });
    }
    var resultat = lignesSortie.map(function (l) { return l.valeurs; });
    resultat = this.limiter(resultat, c, ctx);
    return { type: "select", colonnes: sorties.map(function (s) { return s.nom; }), lignes: resultat, types: sorties.map(function (s) { return s.type; }) };
  };

  /* Trouver une colonne : dans les sources de ce SELECT, puis dans celles
     des requêtes qui l'englobent (sous-requête corrélée). */
  S.resoudre = function (e, env, silencieux) {
    var k = e.nom.toLowerCase(), tk = e.table ? e.table.toLowerCase() : null;
    for (var niveau = env, prof = 0; niveau; niveau = niveau.parent, prof++) {
      var trouves = [];
      var schema = niveau.schema || [];
      for (var i = 0; i < schema.length; i++) {
        var s = schema[i];
        if (s.nom === k && (!tk || s.table === tk)) trouves.push(i);
      }
      if (trouves.length > 1 && !tk) {
        // un USING ou une même colonne vue deux fois ? Les deux valent pareil : MariaDB refuse quand même
        throw E.ambigue(e.nom, env.clause || "field list");
      }
      if (trouves.length) return { niveau: niveau, i: trouves[0], schema: schema[trouves[0]] };
    }
    if (silencieux) return null;
    throw E.colonneInconnue((e.table ? e.table + "." : "") + e.nom, env.clause || "field list");
  };

  /* ═══════════════════════════════ 6. LES EXPRESSIONS ══════════════════ */
  S.evaluer = function (e, env, ctx) {
    var self = this;
    switch (e.t) {
      case "val": return e.v;
      case "param": {
        var p = ctx.params;
        if (!p) throw E.parametre();
        var v;
        if (e.nom !== null && e.nom !== undefined) {
          if (Object.prototype.hasOwnProperty.call(p, ":" + e.nom)) v = p[":" + e.nom];
          else if (Object.prototype.hasOwnProperty.call(p, e.nom)) v = p[e.nom];
          else throw E.parametre();
        } else {
          if (!(e.rang in p)) throw E.parametre();
          v = p[e.rang];
        }
        return v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v;
      }
      case "col": {
        // ORDER BY / HAVING : un alias de la liste du SELECT passe d'abord
        if (!e.table && env.sortie) {
          var a = env.sortie.noms.indexOf(e.nom.toLowerCase());
          if (a >= 0 && (env.prefererSortie || env.clause === "having clause" || !(env.schema || []).some(function (s) { return s.nom === e.nom.toLowerCase(); }))) return env.sortie.valeurs[a];
        }
        if (env.valeursInserees && !e.table) { /* ON DUPLICATE KEY UPDATE : VALUES(col) passe par la fonction */ }
        var r = this.resoudre(e, env);
        var l = r.niveau.ligne;
        return l ? (l[r.i] === undefined ? null : l[r.i]) : null;
      }
      case "defaut": return null;
      case "liste": throw E.operandes(1);
      case "un": {
        var x = this.evaluer(e.e, env, ctx);
        if (e.op === "NOT") { var b = vrai(x); return b === null ? null : b ? 0 : 1; }
        if (x === null) return null;
        if (e.op === "-") return -versNombre(x);
        if (e.op === "~") return ~versNombre(x) >>> 0;
        return x;
      }
      case "bin": return this.binaire(e, env, ctx);
      case "est": {
        var y = this.evaluer(e.e, env, ctx);
        var r1 = e.quoi === null ? y === null : y !== null && vrai(y) === e.quoi;
        return (e.non ? !r1 : r1) ? 1 : 0;
      }
      case "comme": {
        var s = this.evaluer(e.e, env, ctx), m = this.evaluer(e.motif, env, ctx);
        if (s === null || m === null) return null;
        var echap = e.echap ? texte(this.evaluer(e.echap, env, ctx)) : "\\";
        var ok = motifLike(texte(m), echap).test(cleTexte(texte(s)));
        return (e.non ? !ok : ok) ? 1 : 0;
      }
      case "regexp": {
        var s2 = this.evaluer(e.e, env, ctx), m2 = this.evaluer(e.motif, env, ctx);
        if (s2 === null || m2 === null) return null;
        var ok2 = new RegExp(texte(m2), "i").test(texte(s2));
        return (e.non ? !ok2 : ok2) ? 1 : 0;
      }
      case "dans": {
        var g = this.evaluer(e.e, env, ctx);
        var valeurs;
        if (e.select) {
          var r2 = this.selectionner(e.select, ctx, env);
          if (r2.colonnes.length !== 1) throw E.operandes(1);
          valeurs = r2.lignes.map(function (l) { return l[0]; });
        } else valeurs = e.liste.map(function (x) { return self.evaluer(x, env, ctx); });
        if (g === null) return null;
        var aNull = false;
        for (var i = 0; i < valeurs.length; i++) {
          var c = comparer(g, valeurs[i]);
          if (c === 0) return e.non ? 0 : 1;
          if (c === null) aNull = true;
        }
        return aNull ? null : e.non ? 1 : 0;
      }
      case "entre": {
        var v1 = this.evaluer(e.e, env, ctx), bas = this.evaluer(e.bas, env, ctx), haut = this.evaluer(e.haut, env, ctx);
        var c1 = comparer(v1, bas), c2 = comparer(v1, haut);
        if (c1 === null || c2 === null) return null;
        var dedans = c1 >= 0 && c2 <= 0;
        return (e.non ? !dedans : dedans) ? 1 : 0;
      }
      case "existe": return this.selectionner(e.select, ctx, env).lignes.length ? 1 : 0;
      case "sous": {
        var r3 = this.selectionner(e.select, ctx, env);
        if (r3.colonnes.length !== 1) throw E.operandes(1);
        if (r3.lignes.length > 1) throw E.sousLignes();
        return r3.lignes.length ? r3.lignes[0][0] : null;
      }
      case "cas": {
        if (e.base) {
          var bv = this.evaluer(e.base, env, ctx);
          for (var q = 0; q < e.quand.length; q++) if (comparer(bv, this.evaluer(e.quand[q].si, env, ctx)) === 0) return this.evaluer(e.quand[q].alors, env, ctx);
        } else {
          for (var q2 = 0; q2 < e.quand.length; q2++) if (vrai(this.evaluer(e.quand[q2].si, env, ctx)) === true) return this.evaluer(e.quand[q2].alors, env, ctx);
        }
        return e.sinon ? this.evaluer(e.sinon, env, ctx) : null;
      }
      case "intervalle": return { intervalle: versNombre(this.evaluer(e.e, env, ctx)), unite: e.unite };
      case "fn": return this.fonction(e, env, ctx);
    }
    throw ErreurSql(1064, "42000", "expression inconnue");
  };
  function motifLike(m, echap) {
    var re = "^";
    for (var i = 0; i < m.length; i++) {
      var c = m[i];
      if (c === echap && i + 1 < m.length) { re += cleTexte(m[++i]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); continue; }
      if (c === "%") re += "[\\s\\S]*";
      else if (c === "_") re += "[\\s\\S]";
      else re += cleTexte(c).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(re + "$");
  }
  S.binaire = function (e, env, ctx) {
    var op = e.op;
    if (op === "AND") {
      var a = vrai(this.evaluer(e.g, env, ctx));
      if (a === false) return 0;
      var b = vrai(this.evaluer(e.d, env, ctx));
      if (b === false) return 0;
      return a === null || b === null ? null : 1;
    }
    if (op === "OR") {
      var a2 = vrai(this.evaluer(e.g, env, ctx));
      if (a2 === true) return 1;
      var b2 = vrai(this.evaluer(e.d, env, ctx));
      if (b2 === true) return 1;
      return a2 === null || b2 === null ? null : 0;
    }
    var x = this.evaluer(e.g, env, ctx), y = this.evaluer(e.d, env, ctx);
    if (op === "XOR") { var p = vrai(x), q = vrai(y); return p === null || q === null ? null : p !== q ? 1 : 0; }
    if (op === "<=>") return (x === null && y === null) || (x !== null && y !== null && comparer(x, y) === 0) ? 1 : 0;
    if (["=", "<>", "<", ">", "<=", ">="].indexOf(op) >= 0) {
      var c = comparer(x, y);
      if (c === null) return null;
      return deVerite(op === "=" ? c === 0 : op === "<>" ? c !== 0 : op === "<" ? c < 0 : op === ">" ? c > 0 : op === "<=" ? c <= 0 : c >= 0);
    }
    if (x === null || y === null) return null;
    // une date plus ou moins un intervalle
    if ((op === "+" || op === "-") && y && typeof y === "object" && y.intervalle !== undefined) return ajouterIntervalle(x, op === "-" ? -y.intervalle : y.intervalle, y.unite);
    var n = versNombre(x), m = versNombre(y);
    switch (op) {
      case "+": return n + m;
      case "-": return n - m;
      case "*": return n * m;
      case "/": return m === 0 ? null : n / m;
      case "%": return m === 0 ? null : n % m;
      case "DIV": return m === 0 ? null : Math.trunc(n / m);
      case "&": return (n & m) >>> 0;
      case "|": return (n | m) >>> 0;
      case "^": return (n ^ m) >>> 0;
      case "<<": return (n << m) >>> 0;
      case ">>": return n >>> m;
    }
    return null;
  };
  function ajouterIntervalle(v, n, unite) {
    var d = lireDate(v);
    if (!d) return null;
    var avecHeure = /\d{1,2}:\d{2}/.test(String(v));
    switch (unite) {
      case "DAY": d.setUTCDate(d.getUTCDate() + n); break;
      case "WEEK": d.setUTCDate(d.getUTCDate() + 7 * n); break;
      case "MONTH": case "QUARTER": case "YEAR": {
        // le 31 janvier + 1 mois = le 28 février : MariaDB s'arrête au dernier jour du mois
        var mois = n * (unite === "YEAR" ? 12 : unite === "QUARTER" ? 3 : 1);
        var jour = d.getUTCDate();
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() + mois);
        var dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
        d.setUTCDate(Math.min(jour, dernier));
        break;
      }
      case "HOUR": d.setUTCHours(d.getUTCHours() + n); avecHeure = true; break;
      case "MINUTE": d.setUTCMinutes(d.getUTCMinutes() + n); avecHeure = true; break;
      case "SECOND": d.setUTCSeconds(d.getUTCSeconds() + n); avecHeure = true; break;
    }
    return avecHeure ? ecrireDateHeure(d) : ecrireDate(d);
  }

  /* Les fonctions : les agrégats sur le groupe courant, les autres ligne à ligne. */
  S.fonction = function (e, env, ctx) {
    var self = this;
    var nom = e.nom;
    if (AGREGATS[nom]) {
      if (!env.groupe) throw E.groupe();
      var lignes = env.groupe;
      var vals;
      if (e.etoile) return lignes.length;
      vals = lignes.map(function (l) { return self.evaluer(e.args[0], Object.assign({}, env, { ligne: l, groupe: null }), ctx); });
      if (nom === "GROUP_CONCAT" && e.args.length > 1) {
        vals = lignes.map(function (l) { var env2 = Object.assign({}, env, { ligne: l, groupe: null }); var morceaux = e.args.map(function (a) { return self.evaluer(a, env2, ctx); }); return morceaux.some(function (x) { return x === null; }) ? null : morceaux.map(texte).join(""); });
      }
      var nonNuls = vals.filter(function (v) { return v !== null; });
      if (e.distinct) nonNuls = sansDoublons(nonNuls.map(function (v) { return [v]; })).map(function (l) { return l[0]; });
      switch (nom) {
        case "COUNT": return nonNuls.length;
        case "SUM": return nonNuls.length ? nonNuls.reduce(function (s, v) { return s + versNombre(v); }, 0) : null;
        case "AVG": return nonNuls.length ? nonNuls.reduce(function (s, v) { return s + versNombre(v); }, 0) / nonNuls.length : null;
        case "MIN": return nonNuls.length ? nonNuls.reduce(function (m, v) { return comparer(v, m) < 0 ? v : m; }) : null;
        case "MAX": return nonNuls.length ? nonNuls.reduce(function (m, v) { return comparer(v, m) > 0 ? v : m; }) : null;
        case "GROUP_CONCAT": {
          if (e.ordre) {
            var paires = lignes.map(function (l, i) { return { v: vals[i], k: e.ordre.map(function (o) { return self.evaluer(o.e, Object.assign({}, env, { ligne: l, groupe: null }), ctx); }) }; }).filter(function (p) { return p.v !== null; });
            paires.sort(function (a, b) { return comparerCles(a.k, b.k, e.ordre); });
            nonNuls = paires.map(function (p) { return p.v; });
          }
          return nonNuls.length ? nonNuls.map(texte).join(e.separateur !== undefined ? e.separateur : ",") : null;
        }
        case "STD": case "STDDEV": case "VARIANCE": {
          if (!nonNuls.length) return null;
          var nb = nonNuls.map(versNombre), moy = nb.reduce(function (s, v) { return s + v; }, 0) / nb.length;
          var vr = nb.reduce(function (s, v) { return s + (v - moy) * (v - moy); }, 0) / nb.length;
          return nom === "VARIANCE" ? vr : Math.sqrt(vr);
        }
      }
    }
    // VALUES(col) dans ON DUPLICATE KEY UPDATE : la valeur qu'on voulait insérer
    if ((nom === "VALUES" || nom === "VALUE") && e.args.length === 1 && e.args[0].t === "col") {
      if (!env.valeursInserees) return null;
      var kv = e.args[0].nom.toLowerCase();
      for (var iv = 0; iv < env.schema.length; iv++) if (env.schema[iv].nom === kv) return env.valeursInserees[iv];
      throw E.colonneInconnue(e.args[0].nom, "field list");
    }
    var args = e.args.map(function (a) { return self.evaluer(a, env, ctx); });
    var a0 = args[0], a1 = args[1], a2 = args[2];
    var nul = args.some(function (v) { return v === null; });
    switch (nom) {
      // le texte
      case "UPPER": case "UCASE": return a0 === null ? null : texte(a0).toUpperCase();
      case "LOWER": case "LCASE": return a0 === null ? null : texte(a0).toLowerCase();
      case "LENGTH": case "OCTET_LENGTH": return a0 === null ? null : new TextEncoder().encode(texte(a0)).length;
      case "CHAR_LENGTH": case "CHARACTER_LENGTH": return a0 === null ? null : [...texte(a0)].length;
      case "CONCAT": return nul ? null : args.map(texte).join("");
      case "CONCAT_WS": return a0 === null ? null : args.slice(1).filter(function (v) { return v !== null; }).map(texte).join(texte(a0));
      case "SUBSTRING": case "SUBSTR": case "MID": {
        if (nul) return null;
        var s = [...texte(a0)], p = versNombre(a1);
        var debut = p > 0 ? p - 1 : p < 0 ? s.length + p : s.length;
        return s.slice(debut, args.length > 2 ? debut + Math.max(0, versNombre(a2)) : undefined).join("");
      }
      case "LEFT": return nul ? null : [...texte(a0)].slice(0, Math.max(0, versNombre(a1))).join("");
      case "RIGHT": { if (nul) return null; var t = [...texte(a0)], n = versNombre(a1); return n <= 0 ? "" : t.slice(-n).join(""); }
      case "TRIM": return a0 === null ? null : texte(a0).trim();
      case "LTRIM": return a0 === null ? null : texte(a0).replace(/^\s+/, "");
      case "RTRIM": return a0 === null ? null : texte(a0).replace(/\s+$/, "");
      case "REPLACE": return nul ? null : texte(a0).split(texte(a1)).join(texte(a2));
      case "REVERSE": return a0 === null ? null : [...texte(a0)].reverse().join("");
      case "REPEAT": return nul ? null : texte(a0).repeat(Math.max(0, versNombre(a1)));
      case "LPAD": case "RPAD": {
        if (nul) return null;
        var base = texte(a0), lg = versNombre(a1), bourre = texte(a2);
        if (base.length >= lg) return base.slice(0, lg);
        var rem = "";
        while (rem.length < lg - base.length) rem += bourre;
        rem = rem.slice(0, lg - base.length);
        return nom === "LPAD" ? rem + base : base + rem;
      }
      case "INSTR": case "LOCATE": case "POSITION": {
        if (nul) return null;
        var foin = nom === "INSTR" ? texte(a0) : texte(a1), aiguille = nom === "INSTR" ? texte(a1) : texte(a0);
        return cleTexte(foin).indexOf(cleTexte(aiguille)) + 1;
      }
      case "STRCMP": return nul ? null : comparer(texte(a0), texte(a1));
      case "FORMAT": {
        if (a0 === null) return null;
        var dec = Math.max(0, versNombre(a1) || 0);
        return versNombre(a0).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      }
      // les nombres
      case "ROUND": { if (a0 === null) return null; var d = args.length > 1 ? versNombre(a1) : 0; var f = Math.pow(10, d); var v = versNombre(a0) * f; return Math.sign(v) * Math.round(Math.abs(v)) / f; }
      case "TRUNCATE": { if (nul) return null; var f2 = Math.pow(10, versNombre(a1)); return Math.trunc(versNombre(a0) * f2) / f2; }
      case "FLOOR": return a0 === null ? null : Math.floor(versNombre(a0));
      case "CEIL": case "CEILING": return a0 === null ? null : Math.ceil(versNombre(a0));
      case "ABS": return a0 === null ? null : Math.abs(versNombre(a0));
      case "SQRT": return a0 === null || versNombre(a0) < 0 ? null : Math.sqrt(versNombre(a0));
      case "POW": case "POWER": return nul ? null : Math.pow(versNombre(a0), versNombre(a1));
      case "MOD": return nul || versNombre(a1) === 0 ? null : versNombre(a0) % versNombre(a1);
      case "SIGN": return a0 === null ? null : Math.sign(versNombre(a0));
      case "PI": return Math.PI;
      case "RAND": return Math.random();
      case "GREATEST": return nul ? null : args.reduce(function (m, v) { return comparer(v, m) > 0 ? v : m; });
      case "LEAST": return nul ? null : args.reduce(function (m, v) { return comparer(v, m) < 0 ? v : m; });
      // les valeurs absentes
      case "IFNULL": return a0 !== null ? a0 : a1;
      case "COALESCE": for (var i = 0; i < args.length; i++) if (args[i] !== null) return args[i]; return null;
      case "NULLIF": return comparer(a0, a1) === 0 ? null : a0;
      case "IF": return vrai(a0) === true ? a1 : a2;
      case "ISNULL": return a0 === null ? 1 : 0;
      // les dates
      case "NOW": case "CURRENT_TIMESTAMP": case "SYSDATE": case "LOCALTIME": return maintenant();
      case "CURDATE": case "CURRENT_DATE": return maintenant().slice(0, 10);
      case "CURTIME": case "CURRENT_TIME": return maintenant().slice(11);
      case "DATE": { var dd = lireDate(a0); return dd ? ecrireDate(dd) : null; }
      case "YEAR": { var y = lireDate(a0); return y ? y.getUTCFullYear() : null; }
      case "MONTH": { var mo = lireDate(a0); return mo ? mo.getUTCMonth() + 1 : null; }
      case "DAY": case "DAYOFMONTH": { var da = lireDate(a0); return da ? da.getUTCDate() : null; }
      case "HOUR": { var h = lireDate(a0); return h ? h.getUTCHours() : null; }
      case "MINUTE": { var mi = lireDate(a0); return mi ? mi.getUTCMinutes() : null; }
      case "DAYOFWEEK": { var dw = lireDate(a0); return dw ? dw.getUTCDay() + 1 : null; }
      case "WEEKDAY": { var wd = lireDate(a0); return wd ? (wd.getUTCDay() + 6) % 7 : null; }
      case "DAYNAME": { var dn = lireDate(a0); return dn ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dn.getUTCDay()] : null; }
      case "MONTHNAME": { var mn = lireDate(a0); return mn ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][mn.getUTCMonth()] : null; }
      case "DATEDIFF": { var x1 = lireDate(a0), x2 = lireDate(a1); if (!x1 || !x2) return null; return Math.round((Date.UTC(x1.getUTCFullYear(), x1.getUTCMonth(), x1.getUTCDate()) - Date.UTC(x2.getUTCFullYear(), x2.getUTCMonth(), x2.getUTCDate())) / 86400000); }
      case "DATE_ADD": case "ADDDATE": return nul ? null : typeof a1 === "object" ? ajouterIntervalle(a0, a1.intervalle, a1.unite) : ajouterIntervalle(a0, versNombre(a1), "DAY");
      case "DATE_SUB": case "SUBDATE": return nul ? null : typeof a1 === "object" ? ajouterIntervalle(a0, -a1.intervalle, a1.unite) : ajouterIntervalle(a0, -versNombre(a1), "DAY");
      case "DATE_FORMAT": {
        var df = lireDate(a0);
        if (!df || a1 === null) return null;
        var j = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], mois = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        return texte(a1).replace(/%([a-zA-Z%])/g, function (m0, c) {
          switch (c) {
            case "Y": return String(df.getUTCFullYear()); case "y": return String(df.getUTCFullYear()).slice(2);
            case "m": return p2(df.getUTCMonth() + 1); case "c": return String(df.getUTCMonth() + 1);
            case "d": return p2(df.getUTCDate()); case "e": return String(df.getUTCDate());
            case "H": return p2(df.getUTCHours()); case "i": return p2(df.getUTCMinutes()); case "s": case "S": return p2(df.getUTCSeconds());
            case "M": return mois[df.getUTCMonth()]; case "b": return mois[df.getUTCMonth()].slice(0, 3);
            case "W": return j[df.getUTCDay()]; case "a": return j[df.getUTCDay()].slice(0, 3);
            case "%": return "%";
          }
          return c;
        });
      }
      case "UNIX_TIMESTAMP": { var u = a0 === undefined ? new Date() : lireDate(a0); return u ? Math.floor(u.getTime() / 1000) : null; }
      // divers
      case "DATABASE": case "SCHEMA": return this.courante;
      case "USER": case "CURRENT_USER": case "SESSION_USER": case "SYSTEM_USER": return "root@localhost";
      case "ROW_COUNT": return this.dernierCompte === undefined ? -1 : this.dernierCompte;
      case "TIMESTAMPDIFF": {
        var u1 = lireDate(a1), u2 = lireDate(a2);
        if (!u1 || !u2) return null;
        var ms = u2 - u1;
        var secondes = { SECOND: 1, MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800 }[a0];
        if (secondes) return Math.trunc(ms / 1000 / secondes);
        // en mois entiers : le jour (et l'heure) du mois comptent, comme pour un âge
        var m = (u2.getUTCFullYear() - u1.getUTCFullYear()) * 12 + u2.getUTCMonth() - u1.getUTCMonth();
        var resteU2 = u2.getTime() - Date.UTC(u2.getUTCFullYear(), u2.getUTCMonth(), 1), resteU1 = u1.getTime() - Date.UTC(u1.getUTCFullYear(), u1.getUTCMonth(), 1);
        if (m > 0 && resteU2 < resteU1) m--;
        else if (m < 0 && resteU2 > resteU1) m++;
        return a0 === "YEAR" ? Math.trunc(m / 12) : a0 === "QUARTER" ? Math.trunc(m / 3) : a0 === "MONTH" ? m : null;
      }
      case "TIMESTAMPADD": return nul ? null : ajouterIntervalle(a2, versNombre(a1), a0);
      case "EXTRACT": {
        var ex = lireDate(a1);
        if (!ex) return null;
        return { YEAR: ex.getUTCFullYear(), MONTH: ex.getUTCMonth() + 1, DAY: ex.getUTCDate(), HOUR: ex.getUTCHours(), MINUTE: ex.getUTCMinutes(), SECOND: ex.getUTCSeconds(), QUARTER: Math.floor(ex.getUTCMonth() / 3) + 1 }[a0];
      }
      case "VERSION": return "10.11.6-MariaDB (atelier BTS CIEL)";
      case "LAST_INSERT_ID": return this.derniereId;
      case "CAST": case "CONVERT": {
        if (a0 === null) return null;
        var ty = e.type || "CHAR";
        if (/^(SIGNED|UNSIGNED|INT|INTEGER)/.test(ty)) return Math.trunc(versNombre(a0));
        if (/^(DECIMAL|DOUBLE|FLOAT)/.test(ty)) return versNombre(a0);
        if (/^DATE/.test(ty)) { var cd = lireDate(a0); return cd ? (ty === "DATETIME" ? ecrireDateHeure(cd) : ecrireDate(cd)) : null; }
        return texte(a0);
      }
      case "MD5": return a0 === null ? null : EMP.md5(texte(a0));
      case "SHA1": case "SHA": return a0 === null ? null : EMP.sha1(texte(a0));
      case "SHA2": return nul ? null : versNombre(a1) === 256 || versNombre(a1) === 0 ? EMP.sha256(texte(a0)) : null;
      // l'ancien PASSWORD() de MySQL : « * » et SHA1(SHA1(mot de passe)) en majuscules
      case "PASSWORD": return a0 === null ? null : "*" + EMP.sha1(EMP.versOctets(EMP.sha1(texte(a0)))).toUpperCase();
      case "UUID": return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
      case "JSON_VALUE": return null;
    }
    throw E.fonction(this.courante || "atelier", nom.toLowerCase());
  };

  /* ═══════════════════════════════ 7. LA SAUVEGARDE ════════════════════ */
  /* L'état en JSON : les bases, leurs tables et leurs lignes. */
  S.exporter = function () {
    var out = { courante: this.courante, derniereId: this.derniereId, bases: [] };
    this.bases.forEach(function (b) {
      var tables = [];
      b.tables.forEach(function (t) {
        tables.push({ nom: t.nom, colonnes: t.colonnes, lignes: t.lignes, auto: t.auto, primaire: t.primaire, uniques: t.uniques, etrangeres: t.etrangeres, verifs: t.verifs, nbFk: t.nbFk });
      });
      out.bases.push({ nom: b.nom, tables: tables });
    });
    return out;
  };
  S.charger = function (etat) {
    var self = this;
    this.bases = new Map();
    (etat.bases || []).forEach(function (b) {
      var base = { nom: b.nom, tables: new Map() };
      b.tables.forEach(function (t) {
        base.tables.set(t.nom.toLowerCase(), { nom: t.nom, base: b.nom, colonnes: t.colonnes, lignes: t.lignes || [], auto: t.auto || 1, primaire: t.primaire || null, uniques: t.uniques || [], etrangeres: t.etrangeres || [], verifs: t.verifs || [], nbFk: t.nbFk || 0 });
      });
      self.bases.set(b.nom.toLowerCase(), base);
    });
    this.courante = etat.courante && this.bases.has(etat.courante.toLowerCase()) ? etat.courante : null;
    this.derniereId = etat.derniereId || 0;
  };
  /* Un dump SQL de la base, comme l'export de phpMyAdmin. */
  S.dump = function (nomBase) {
    var b = this.base(nomBase || this.courante);
    var self = this;
    var out = ["-- Base « " + b.nom + " » — exportée par l'atelier BTS CIEL", "CREATE DATABASE IF NOT EXISTS `" + b.nom + "`;", "USE `" + b.nom + "`;", ""];
    // les tables parents d'abord
    var ordre = [], vues = new Set();
    var poser = function (t) {
      if (vues.has(t)) return;
      vues.add(t);
      t.etrangeres.forEach(function (f) { var p = b.tables.get(f.table.toLowerCase()); if (p && p !== t) poser(p); });
      ordre.push(t);
    };
    b.tables.forEach(poser);
    ordre.forEach(function (t) {
      var c = self.montrerCreation({ base: b.nom, nom: t.nom }).lignes[0][1];
      out.push(c + ";", "");
      if (t.lignes.length) {
        out.push("INSERT INTO `" + t.nom + "` (" + t.colonnes.map(function (c2) { return "`" + c2.nom + "`"; }).join(", ") + ") VALUES");
        out.push(t.lignes.map(function (l) {
          return "(" + l.map(function (v) { return v === null ? "NULL" : typeof v === "number" ? formatNombre(v) : "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'"; }).join(", ") + ")";
        }).join(",\n") + ";", "");
      }
    });
    return out.join("\n");
  };

  /* Une valeur telle que PDO la rend à PHP (PHP 8.1+, mysqlnd) : les entiers
     et les réels en nombres, un DECIMAL en texte avec ses décimales. */
  function versPhp(v, type) {
    if (v === null) return null;
    if (type && type.famille === "decimal" && typeof v === "number") return v.toFixed(type.args.length > 1 ? type.args[1] : 0);
    return v;
  }
  /* Une valeur écrite dans un tableau de résultats (comme phpMyAdmin). */
  function afficher(v, type) {
    if (v === null || v === undefined) return null;
    if (type && type.famille === "decimal" && typeof v === "number") return v.toFixed(type.args.length > 1 ? type.args[1] : 0);
    if (typeof v === "number") return formatNombre(v);
    return String(v);
  }

  return {
    Serveur: Serveur, Analyseur: Analyseur, decouper: decouper, ErreurSql: ErreurSql,
    versPhp: versPhp, afficher: afficher, formatNombre: formatNombre,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = MOTEUR_SQL;
