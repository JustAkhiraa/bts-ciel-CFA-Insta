/* ═══════════════════════════════════════════════════════════════════════
   La console de JavaScript, telle qu'un étudiant la voit dans le navigateur
   (F12) — mais dans l'atelier.

   Une seule FABRIQUE, servie à deux endroits :
     · l'ouvrier du mode « JavaScript » (ouvrier-js.js) la charge par
       importScripts ;
     · l'aperçu du mode « Web » la reçoit en TEXTE (fabriqueConsole
       .toString()), injecté dans la page de l'étudiant : l'aperçu est un
       cadre isolé (sandbox), il ne peut rien charger de la page parente.
   Deux copies du formateur finiraient par diverger ; il n'y en a qu'une.

   Le formateur imite celui de Chrome et de Node : une chaîne s'écrit telle
   quelle au premier niveau et entre guillemets dans un tableau, un objet
   s'écrit « { nom: 'Aya', age: 19 } », une instance « Eleve { … } », une
   fonction « [Function: moyenne] ». La profondeur est bornée : un objet qui
   se contient lui-même s'écrit « [Circular] » au lieu de boucler.
   ═══════════════════════════════════════════════════════════════════════ */
function fabriqueConsole(cible, envoyer) {
  "use strict";
  var vus = [];
  function nomDe(f) { return f && f.name ? f.name : "(anonyme)"; }
  function cle(k) { return /^[A-Za-z_$][\w$]*$/.test(k) ? k : "'" + String(k).replace(/'/g, "\\'") + "'"; }
  function formater(v, prof, dedans) {
    var t = typeof v;
    if (v === null) return "null";
    if (t === "undefined") return "undefined";
    if (t === "string") return dedans ? "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'" : v;
    if (t === "number") return Object.is(v, -0) ? "-0" : String(v);
    if (t === "boolean" || t === "bigint") return String(v) + (t === "bigint" ? "n" : "");
    if (t === "symbol") return v.toString();
    if (t === "function") return /^class\s/.test(Function.prototype.toString.call(v)) ? "[class " + nomDe(v) + "]" : "[Function: " + nomDe(v) + "]";
    if (vus.indexOf(v) >= 0) return "[Circular]";
    if (v instanceof Error) return (v.name || "Error") + ": " + v.message;
    if (v instanceof Date) return isNaN(v) ? "Invalid Date" : v.toISOString();
    if (v instanceof RegExp) return String(v);
    if (typeof Element !== "undefined" && v instanceof Element) {
      var s = "<" + v.tagName.toLowerCase();
      if (v.id) s += ' id="' + v.id + '"';
      if (v.className && typeof v.className === "string") s += ' class="' + v.className + '"';
      return s + ">";
    }
    if (prof > 2) return Array.isArray(v) ? "[Array]" : "[Object]";
    vus.push(v);
    try {
      var morceaux, ouvre, ferme, prefixe = "";
      if (Array.isArray(v) || (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(v) && !(v instanceof DataView))) {
        morceaux = [];
        var n = Math.min(v.length, 100);
        for (var i = 0; i < n; i++) morceaux.push(i in v ? formater(v[i], prof + 1, true) : "<vide>");
        if (v.length > 100) morceaux.push("… " + (v.length - 100) + " de plus");
        ouvre = "["; ferme = "]";
        if (!Array.isArray(v)) prefixe = v.constructor.name + "(" + v.length + ") ";
      } else if (v instanceof Map) {
        morceaux = [];
        v.forEach(function (x, k) { morceaux.push(formater(k, prof + 1, true) + " => " + formater(x, prof + 1, true)); });
        prefixe = "Map(" + v.size + ") "; ouvre = "{"; ferme = "}";
      } else if (v instanceof Set) {
        morceaux = [];
        v.forEach(function (x) { morceaux.push(formater(x, prof + 1, true)); });
        prefixe = "Set(" + v.size + ") "; ouvre = "{"; ferme = "}";
      } else {
        morceaux = Object.keys(v).map(function (k) { return cle(k) + ": " + formater(v[k], prof + 1, true); });
        var proto = Object.getPrototypeOf(v);
        if (proto && proto !== Object.prototype && proto.constructor && proto.constructor.name) prefixe = proto.constructor.name + " ";
        if (proto === null) prefixe = "[Object: null prototype] ";
        ouvre = "{"; ferme = "}";
      }
      if (!morceaux.length) return prefixe + ouvre + ferme;
      var ligne = prefixe + ouvre + " " + morceaux.join(", ") + " " + ferme;
      if (ligne.length <= 72) return ligne;
      var marge = "  ".repeat(prof + 1);
      return prefixe + ouvre + "\n" + marge + morceaux.join(",\n" + marge) + "\n" + "  ".repeat(prof) + ferme;
    } finally { vus.pop(); }
  }
  /* Les jokers de console.log : %s %d %i %f %o %O %j, et %c (le style, sans
     effet ici : on l'avale avec son argument). */
  function message(args) {
    var a = Array.prototype.slice.call(args);
    var out = [];
    if (typeof a[0] === "string" && /%[sdifoOjc%]/.test(a[0])) {
      var gabarit = a.shift();
      out.push(gabarit.replace(/%([sdifoOjc%])/g, function (m, c) {
        if (c === "%") return "%";
        if (!a.length) return m;
        var x = a.shift();
        if (c === "s") return typeof x === "string" ? x : formater(x, 0, false);
        if (c === "d" || c === "i") return String(parseInt(x, 10));
        if (c === "f") return String(parseFloat(x));
        if (c === "c") return "";
        return formater(x, 0, true);
      }));
    }
    for (var i = 0; i < a.length; i++) out.push(formater(a[i], 0, false));
    return out.join(" ");
  }
  var retrait = "";
  function dire(niveau, args) { envoyer({ t: "console", niveau: niveau, texte: retrait + message(args).split("\n").join("\n" + retrait) }); }
  /* console.table : un tableau en caractères, comme dans le terminal de Node. */
  function tableau(donnees) {
    if (donnees === null || typeof donnees !== "object") { dire("log", [donnees]); return; }
    var lignes = Array.isArray(donnees) ? donnees.map(function (x, i) { return [i, x]; }) : Object.keys(donnees).map(function (k) { return [k, donnees[k]]; });
    var colonnes = [];
    var valeurs = false;
    lignes.forEach(function (l) {
      if (l[1] !== null && typeof l[1] === "object") Object.keys(l[1]).forEach(function (k) { if (colonnes.indexOf(k) < 0) colonnes.push(k); });
      else valeurs = true;
    });
    var tete = ["(index)"].concat(colonnes, valeurs ? ["Values"] : []);
    var corps = lignes.map(function (l) {
      var r = [String(l[0])];
      colonnes.forEach(function (k) { r.push(l[1] !== null && typeof l[1] === "object" && k in l[1] ? formater(l[1][k], 1, true) : ""); });
      if (valeurs) r.push(l[1] !== null && typeof l[1] === "object" ? "" : formater(l[1], 1, true));
      return r;
    });
    var larg = tete.map(function (h, i) { return Math.max(h.length, Math.max.apply(null, corps.map(function (r) { return r[i].length; }).concat([0]))); });
    var trait = function (g, m, d) { return g + larg.map(function (w) { return "─".repeat(w + 2); }).join(m) + d; };
    var rang = function (r) { return "│" + r.map(function (c, i) { var p = larg[i] - c.length; return " ".repeat(1 + Math.floor(p / 2)) + c + " ".repeat(1 + Math.ceil(p / 2)); }).join("│") + "│"; };
    envoyer({ t: "console", niveau: "log", texte: [trait("┌", "┬", "┐"), rang(tete), trait("├", "┼", "┤")].concat(corps.map(rang), [trait("└", "┴", "┘")]).join("\n") });
  }
  var comptes = {}, chronos = {};
  var c = {
    log: function () { dire("log", arguments); },
    info: function () { dire("info", arguments); },
    debug: function () { dire("log", arguments); },
    warn: function () { dire("warn", arguments); },
    error: function () { dire("error", arguments); },
    table: tableau,
    dir: function (x) { dire("log", [x]); },
    clear: function () { envoyer({ t: "effacer" }); },
    group: function () { if (arguments.length) dire("log", arguments); retrait += "  "; },
    groupCollapsed: function () { if (arguments.length) dire("log", arguments); retrait += "  "; },
    groupEnd: function () { retrait = retrait.slice(2); },
    assert: function (ok) { if (!ok) dire("error", ["Assertion failed" + (arguments.length > 1 ? ":" : "")].concat(Array.prototype.slice.call(arguments, 1))); },
    count: function (n) { n = n === undefined ? "default" : String(n); comptes[n] = (comptes[n] || 0) + 1; dire("log", [n + ": " + comptes[n]]); },
    countReset: function (n) { comptes[n === undefined ? "default" : String(n)] = 0; },
    time: function (n) { chronos[n === undefined ? "default" : String(n)] = Date.now(); },
    timeEnd: function (n) { n = n === undefined ? "default" : String(n); if (n in chronos) { dire("log", [n + ": " + (Date.now() - chronos[n]) + " ms"]); delete chronos[n]; } },
    timeLog: function (n) { n = n === undefined ? "default" : String(n); if (n in chronos) dire("log", [n + ": " + (Date.now() - chronos[n]) + " ms"]); },
    trace: function () { dire("log", ["Trace:"].concat(Array.prototype.slice.call(arguments))); },
  };
  try { Object.defineProperty(cible, "console", { value: c, configurable: true, writable: true }); } catch (e) { cible.console = c; }
  return { formater: formater, message: message };
}
