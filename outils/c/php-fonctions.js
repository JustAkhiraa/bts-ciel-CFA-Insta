/* ═══════════════════════════════════════════════════════════════════════
   Les fonctions intégrées de PHP que le cours emploie : du texte, des
   tableaux, des nombres, des dates, le web (htmlspecialchars, filter_var,
   session…), les fichiers et PDO sont dans php.js.

   On ne met QUE ce qui sert, et chacune rend exactement ce que rend PHP 8.3
   — vérifié contre un vrai PHP (voir tests/php.test.mjs). Une fonction
   absente donne « Call to undefined function », comme sur XAMPP : pas de
   demi-mesure qui laisserait croire à ce qui n'existe pas.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var P = typeof PHP !== "undefined" ? PHP : require("./php.js");
  var EMP = typeof EMPREINTES !== "undefined" ? EMPREINTES : require("./empreintes.js");
  var PhpArray = P.PhpArray, PhpObjet = P.PhpObjet;
  var versBool = P.versBool, versNombre = P.versNombre, versTexte = P.versTexte, typeNom = P.typeNom;
  var flottant = P.flottant, estFloat = P.estFloat, nombrePhp = P.nombrePhp, numerique = P.numerique;
  var listeDe = P.listeDe, copierValeur = P.copierValeur, ErreurPhp = P.ErreurPhp, deref = P.deref;
  var egalLache = P.egalLache, egalStrict = P.egalStrict, comparer = P.comparer, estChaineNumerique = P.estChaineNumerique;

  function nb(v) { return versNombre(v); }
  function ent(v) { return Math.trunc(versNombre(v)); }
  function enregistrer(noms, spec) { String(noms).split(" ").forEach(function (n) { P.enregistrer(n, spec); }); }
  // t : le contexte (this = moteur) pour versTexte/avertir
  function ctxMoteur(moteur, ligne) { return { moteur: moteur, avertir: moteur.avertir.bind(moteur) }; }
  function txt(moteur, v, ligne) { return versTexte(v, ctxMoteur(moteur, ligne), ligne); }

  /* ── le texte ───────────────────────────────────────────────────────── */
  enregistrer("strlen", { min: 1, fn: function (a) { return EMP.octets(txt(this, a[0])).length; } });
  enregistrer("mb_strlen", { min: 1, fn: function (a) { return [].concat(Array.from(txt(this, a[0]))).length; } });
  enregistrer("count sizeof", { min: 1, fn: function (a, c) {
    if (a[0] instanceof PhpArray) { if (a[1] === 1) { var n = 0; a[0].forEach(function (v) { n++; if (v instanceof PhpArray) n += compterRec(v); }); return n; } return a[0].taille(); }
    if (a[0] instanceof PhpObjet) { var m = this.methode(a[0].classe, "count"); if (m) return versNombre(this.appelerMethode(a[0], m, [], c.ligne)); }
    throw new ErreurPhp("count(): Argument #1 ($value) must be of type Countable|array, " + typeNom(a[0]) + " given", c.ligne, "TypeError");
  } });
  function compterRec(arr) { var n = 0; arr.forEach(function (v) { n++; if (v instanceof PhpArray) n += compterRec(v); }); return n; }
  enregistrer("strtoupper", { min: 1, fn: function (a) { return txt(this, a[0]).replace(/[a-z]/g, function (c) { return c.toUpperCase(); }); } });
  enregistrer("strtolower", { min: 1, fn: function (a) { return txt(this, a[0]).replace(/[A-Z]/g, function (c) { return c.toLowerCase(); }); } });
  enregistrer("mb_strtoupper", { min: 1, fn: function (a) { return txt(this, a[0]).toUpperCase(); } });
  enregistrer("mb_strtolower", { min: 1, fn: function (a) { return txt(this, a[0]).toLowerCase(); } });
  enregistrer("ucfirst", { min: 1, fn: function (a) { var s = txt(this, a[0]); return s && /[a-z]/.test(s[0]) ? s[0].toUpperCase() + s.slice(1) : s; } });
  enregistrer("lcfirst", { min: 1, fn: function (a) { var s = txt(this, a[0]); return s && /[A-Z]/.test(s[0]) ? s[0].toLowerCase() + s.slice(1) : s; } });
  enregistrer("ucwords", { min: 1, fn: function (a) { var sep = a.length > 1 ? txt(this, a[1]) : " \t\r\n\f\v"; var re = new RegExp("(^|[" + sep.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&") + "])([a-z])", "g"); return txt(this, a[0]).replace(re, function (m, p, c) { return p + c.toUpperCase(); }); } });
  enregistrer("trim", { min: 1, fn: function (a) { return rogner(txt(this, a[0]), a[1], 3); } });
  enregistrer("ltrim", { min: 1, fn: function (a) { return rogner(txt(this, a[0]), a[1], 1); } });
  enregistrer("rtrim chop", { min: 1, fn: function (a) { return rogner(txt(this, a[0]), a[1], 2); } });
  function rogner(s, masque, cote) {
    var set = masque === undefined || masque === null ? " \t\n\r\0\x0B" : etendreMasque(versTexte(masque, null));
    var d = 0, f = s.length;
    if (cote & 1) while (d < f && set.indexOf(s[d]) >= 0) d++;
    if (cote & 2) while (f > d && set.indexOf(s[f - 1]) >= 0) f--;
    return s.slice(d, f);
  }
  function etendreMasque(m) { return m.replace(/(.)\.\.(.)/g, function (_, a, b) { var s = "", i = a.charCodeAt(0), j = b.charCodeAt(0); for (; i <= j; i++) s += String.fromCharCode(i); return s; }); }
  enregistrer("str_repeat", { min: 2, fn: function (a) { var n = ent(a[1]); return n > 0 ? txt(this, a[0]).repeat(n) : ""; } });
  enregistrer("strrev", { min: 1, fn: function (a) { return txt(this, a[0]).split("").reverse().join(""); } });
  enregistrer("str_contains", { min: 2, fn: function (a) { return txt(this, a[0]).indexOf(txt(this, a[1])) >= 0; } });
  enregistrer("str_starts_with", { min: 2, fn: function (a) { return txt(this, a[0]).indexOf(txt(this, a[1])) === 0; } });
  enregistrer("str_ends_with", { min: 2, fn: function (a) { var s = txt(this, a[0]), f = txt(this, a[1]); return f === "" || s.slice(-f.length) === f; } });
  enregistrer("strpos", { min: 2, fn: function (a) { var s = txt(this, a[0]), i = s.indexOf(txt(this, a[1]), a[2] ? ent(a[2]) : 0); return i < 0 ? false : i; } });
  enregistrer("stripos", { min: 2, fn: function (a) { var s = txt(this, a[0]).toLowerCase(), i = s.indexOf(txt(this, a[1]).toLowerCase(), a[2] ? ent(a[2]) : 0); return i < 0 ? false : i; } });
  enregistrer("strrpos", { min: 2, fn: function (a) { var i = txt(this, a[0]).lastIndexOf(txt(this, a[1])); return i < 0 ? false : i; } });
  enregistrer("substr mb_substr", { min: 2, fn: function (a) {
    var s = txt(this, a[0]), d = ent(a[1]), len = a.length > 2 && a[2] !== null ? ent(a[2]) : undefined;
    if (d < 0) d = Math.max(0, s.length + d);
    var fin;
    if (len === undefined) fin = s.length; else if (len < 0) fin = s.length + len; else fin = d + len;
    return s.slice(d, Math.max(d, fin));
  } });
  enregistrer("substr_count", { min: 2, fn: function (a) { var s = txt(this, a[0]), sub = txt(this, a[1]); if (sub === "") return 0; var n = 0, i = 0; while ((i = s.indexOf(sub, i)) >= 0) { n++; i += sub.length; } return n; } });
  enregistrer("str_replace", { min: 3, fn: function (a, c) { return strReplace.call(this, a, c, false); } });
  enregistrer("str_ireplace", { min: 3, fn: function (a, c) { return strReplace.call(this, a, c, true); } });
  function strReplace(a, c, insensible) {
    var self = this;
    var cherche = a[0], remplace = a[1], sujet = a[2];
    var compte = 0;
    function une(s) {
      s = versTexte(s, ctxMoteur(self), c.ligne);
      var cs = cherche instanceof PhpArray ? cherche.cles.map(function (k) { return versTexte(cherche.vals[k], null); }) : [versTexte(cherche, null)];
      var rs = remplace instanceof PhpArray ? cherche instanceof PhpArray ? null : null : null;
      for (var i = 0; i < cs.length; i++) {
        var r = remplace instanceof PhpArray ? (cherche instanceof PhpArray ? (i < remplace.cles.length ? versTexte(remplace.vals[remplace.cles[i]], null) : "") : versTexte(remplace.vals[remplace.cles[0]] || "", null)) : versTexte(remplace, null);
        if (cs[i] === "") continue;
        var re = new RegExp(cs[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), insensible ? "gi" : "g");
        s = s.replace(re, function () { compte++; return r; });
      }
      return s;
    }
    var out;
    if (sujet instanceof PhpArray) { out = new PhpArray(); sujet.forEach(function (v, k) { out.set(k, une(v)); }); }
    else out = une(sujet);
    if (c.refs && c.refs[3]) c.refs[3].ecrire(compte);
    return out;
  }
  enregistrer("substr_replace", { min: 3, fn: function (a) { var s = txt(this, a[0]), r = txt(this, a[1]), d = ent(a[2]); if (d < 0) d += s.length; var len = a.length > 3 ? ent(a[3]) : s.length; if (len < 0) len = Math.max(0, s.length + len - d); return s.slice(0, d) + r + s.slice(d + len); } });
  enregistrer("str_pad", { min: 2, fn: function (a) {
    var s = txt(this, a[0]), len = ent(a[1]), pad = a.length > 2 ? txt(this, a[2]) : " ", type = a.length > 3 ? ent(a[3]) : 1;
    if (len <= s.length || pad === "") return s;
    var total = len - s.length;
    function faire(n) { var r = ""; while (r.length < n) r += pad; return r.slice(0, n); }
    if (type === 0) return faire(total) + s;
    if (type === 2) { var g = Math.floor(total / 2); return faire(g) + s + faire(total - g); }
    return s + faire(total);
  } });
  enregistrer("str_split", { min: 1, fn: function (a) { var s = txt(this, a[0]), n = a.length > 1 ? ent(a[1]) : 1; if (n < 1) throw new ErreurPhp("str_split(): Argument #2 ($length) must be greater than 0", 0, "ValueError"); var out = new PhpArray(); if (s === "") { out.pousser(""); return out; } for (var i = 0; i < s.length; i += n) out.pousser(s.slice(i, i + n)); return out; } });
  enregistrer("explode", { min: 2, fn: function (a, c) {
    var sep = txt(this, a[0]), s = txt(this, a[1]), lim = a.length > 2 ? ent(a[2]) : Infinity;
    if (sep === "") throw new ErreurPhp("explode(): Argument #1 ($separator) cannot be empty", c.ligne, "ValueError");
    var morceaux = s.split(sep);
    if (lim > 0 && lim < morceaux.length) { var tete = morceaux.slice(0, lim - 1); tete.push(morceaux.slice(lim - 1).join(sep)); morceaux = tete; }
    else if (lim === 0) { var t = morceaux.slice(0, 0); t.push(morceaux.join(sep)); morceaux = t; }
    else if (lim < 0) morceaux = morceaux.slice(0, morceaux.length + lim);
    return listeDe(morceaux);
  } });
  enregistrer("implode join", { min: 1, fn: function (a, c) {
    var sep, arr;
    if (a[0] instanceof PhpArray) { sep = ""; arr = a[0]; }
    else { sep = txt(this, a[0]); arr = a[1]; }
    if (!(arr instanceof PhpArray)) throw new ErreurPhp("implode(): Argument #" + (a[0] instanceof PhpArray ? 1 : 2) + " ($array) must be of type array, " + typeNom(arr) + " given", c.ligne, "TypeError");
    var self = this, parts = [];
    arr.forEach(function (v) { parts.push(versTexte(v, ctxMoteur(self), c.ligne)); });
    return parts.join(sep);
  } });
  enregistrer("nl2br", { min: 1, fn: function (a) { return txt(this, a[0]).replace(/(\r\n|\n\r|\n|\r)/g, "<br />$1"); } });
  enregistrer("wordwrap", { min: 1, fn: function (a) { return txt(this, a[0]); } });
  enregistrer("sprintf", { min: 1, fn: function (a, c) { return formater.call(this, a, c); } });
  enregistrer("printf", { min: 1, fn: function (a, c) { var s = formater.call(this, a, c); this.ecrire(s); return s.length; } });
  enregistrer("vsprintf", { min: 2, fn: function (a, c) { var args = [a[0]]; a[1].forEach(function (v) { args.push(v); }); return formater.call(this, args, c); } });
  enregistrer("number_format", { min: 1, fn: function (a) {
    var n = nb(a[0]), dec = a.length > 1 ? ent(a[1]) : 0;
    var pt = a.length > 2 ? txt(this, a[2]) : ".";
    var mille = a.length > 3 ? txt(this, a[3]) : ",";
    var neg = n < 0;
    var s = Math.abs(n).toFixed(dec);
    var parts = s.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "\0");
    var r = parts[0].replace(/\0/g, mille) + (dec > 0 ? pt + parts[1] : "");
    if (neg && /[1-9]/.test(s)) r = "-" + r;
    return r;
  } });
  enregistrer("htmlspecialchars htmlentities", { min: 1, fn: function (a) {
    var flags = a.length > 1 && a[1] !== null ? ent(a[1]) : 11;   // ENT_QUOTES|ENT_SUBSTITUTE|ENT_HTML401 par défaut en 8.1+
    var s = txt(this, a[0]);
    s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (flags & 2) s = s.replace(/"/g, "&quot;");
    if (flags & 1) s = s.replace(/'/g, "&#039;");
    return s;
  } });
  enregistrer("htmlspecialchars_decode html_entity_decode", { min: 1, fn: function (a) {
    return txt(this, a[0]).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, "\u00a0");
  } });
  enregistrer("strip_tags", { min: 1, fn: function (a) { return txt(this, a[0]).replace(/<[^>]*>/g, ""); } });
  enregistrer("addslashes", { min: 1, fn: function (a) { return txt(this, a[0]).replace(/([\\'"\0])/g, function (m) { return m === "\0" ? "\\0" : "\\" + m; }); } });
  enregistrer("stripslashes", { min: 1, fn: function (a) { return txt(this, a[0]).replace(/\\(.)/g, function (_, c) { return c === "0" ? "\0" : c; }); } });
  enregistrer("json_encode", { min: 1, fn: function (a, c) { var pretty = a.length > 1 && (ent(a[1]) & 128); return jsonEncode.call(this, a[0], pretty ? "" : null, c.ligne, ent(a[1] || 0)); } });
  enregistrer("json_decode", { min: 1, fn: function (a, c) { return jsonDecode.call(this, txt(this, a[0]), a.length > 1 ? versBool(a[1]) : false, c.ligne); } });
  function jsonEncode(v, retrait, ligne, flags) {
    var self = this;
    var slash = function (s) { return (flags & 64) ? s : s.replace(/\//g, "\\/"); };
    var esc = function (s) {
      var o = slash(s.replace(/[\\"]/g, "\\$&").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t").replace(/[\x00-\x1f]/g, function (c) { return "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"); }));
      if (!(flags & 256)) o = o.replace(/[\u0080-\uffff]/g, function (c) { return "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"); });
      return '"' + o + '"';
    };
    if (v === null) return "null";
    if (v === true) return "true"; if (v === false) return "false";
    if (typeof v === "number") return String(v);
    if (estFloat(v)) { if (!isFinite(v.v)) return "0"; return Number.isInteger(v.v) ? v.v + ".0" : String(v.v); }
    if (typeof v === "string") return esc(v);
    if (v instanceof PhpArray) {
      var liste = v.estListe();
      var sousR = retrait === null ? null : retrait + "    ";
      var items = [];
      v.forEach(function (val, k) { var cle = liste ? "" : esc(String(k)) + (retrait === null ? ":" : ": "); items.push((sousR || "") + cle + jsonEncode.call(self, val, sousR, ligne, flags)); });
      if (!items.length) return liste ? "[]" : "{}";
      var ouvre = liste ? "[" : "{", ferme = liste ? "]" : "}";
      if (retrait === null) return ouvre + items.join(",") + ferme;
      return ouvre + "\n" + items.join(",\n") + "\n" + retrait + ferme;
    }
    if (v instanceof PhpObjet) {
      var m = this.methode(v.classe, "jsonserialize");
      if (m) return jsonEncode.call(this, this.appelerMethode(v, m, [], ligne), retrait, ligne, flags);
      var pub = v.ordre.filter(function (k) { var i = self.infoPropriete(v.classe, k); return !i || i.visibilite === "public"; });
      var sousR2 = retrait === null ? null : retrait + "    ";
      var it2 = pub.map(function (k) { return (sousR2 || "") + esc(k) + (retrait === null ? ":" : ": ") + jsonEncode.call(self, v.props[k], sousR2, ligne, flags); });
      if (!it2.length) return "{}";
      if (retrait === null) return "{" + it2.join(",") + "}";
      return "{\n" + it2.join(",\n") + "\n" + retrait + "}";
    }
    return "null";
  }
  function jsonDecode(s, assoc, ligne) {
    var self = this;
    var val;
    try { val = JSON.parse(s); } catch (e) { return null; }
    function conv(x) {
      if (x === null) return null;
      if (typeof x === "number") return Number.isInteger(x) ? x : flottant(x);
      if (typeof x === "boolean" || typeof x === "string") return x;
      if (Array.isArray(x)) { var a = new PhpArray(); x.forEach(function (e) { a.pousser(conv(e)); }); return a; }
      if (assoc) { var m = new PhpArray(); Object.keys(x).forEach(function (k) { m.set(k, conv(x[k])); }); return m; }
      var o = new PhpObjet(self.classes["stdclass"]); Object.keys(x).forEach(function (k) { o.set(k, conv(x[k])); }); return o;
    }
    return conv(val);
  }

  /* ── printf / sprintf ── */
  function formater(a, c) {
    var self = this;
    var gabarit = txt(this, a[0]);
    var i = 1;
    return gabarit.replace(/%(?:(\d+)\$)?([-+ 0]|'.)*(\d+)?(?:\.(\d+))?([bcdeEfFgGosuxX%])/g, function (m, argnum, flagsIgn, largeur, precision, type) {
      if (type === "%") return "%";
      var flags = "";
      var re2 = /([-+ 0]|'.)/g, fm;
      var rest = m.slice(1 + (argnum ? argnum.length + 1 : 0));
      var padChar = " ", gauche = false, signe = false, espace = false;
      var mf = /^((?:[-+ 0]|'.)*)/.exec(rest)[1];
      for (var k = 0; k < mf.length; k++) {
        if (mf[k] === "'") { padChar = mf[++k]; }
        else if (mf[k] === "-") gauche = true;
        else if (mf[k] === "0") padChar = "0";
        else if (mf[k] === "+") signe = true;
        else if (mf[k] === " ") espace = true;
      }
      var idx = argnum ? +argnum : i++;
      var v = a[idx];
      var s;
      switch (type) {
        case "d": { var n = ent(v); s = Math.abs(n).toString(); if (n < 0) s = "-" + s; else if (signe) s = "+" + s; else if (espace) s = " " + s; break; }
        case "u": { var u = ent(v); if (u < 0) u = u >>> 0; s = u.toString(); break; }
        case "s": { s = versTexte(v, ctxMoteur(self), c.ligne); if (precision !== undefined) s = s.slice(0, +precision); break; }
        case "f": case "F": { var p = precision === undefined ? 6 : +precision; var f = nb(v); s = Math.abs(f).toFixed(p); if (f < 0) s = "-" + s; else if (signe) s = "+" + s; break; }
        case "e": case "E": { var pe = precision === undefined ? 6 : +precision; var fe = nb(v); s = fe.toExponential(pe); s = s.replace(/e([+-])(\d)$/, "e$1$2"); if (type === "E") s = s.toUpperCase(); if (signe && fe >= 0) s = "+" + s; break; }
        case "g": case "G": { var fg = nb(v); s = String(fg); if (type === "G") s = s.toUpperCase(); break; }
        case "x": s = (ent(v) >>> 0).toString(16); break;
        case "X": s = (ent(v) >>> 0).toString(16).toUpperCase(); break;
        case "o": s = (ent(v) >>> 0).toString(8); break;
        case "b": s = (ent(v) >>> 0).toString(2); break;
        case "c": s = String.fromCharCode(ent(v)); break;
        default: s = "";
      }
      if (largeur && s.length < +largeur) {
        var pad = (padChar === "0" && !gauche ? "0" : padChar).repeat(+largeur - s.length);
        if (gauche) s = s + (padChar === "0" ? " " : padChar).repeat(+largeur - s.length);
        else if (padChar === "0" && /^[+\- ]/.test(s)) s = s[0] + pad + s.slice(1);
        else s = pad + s;
      }
      return s;
    });
  }

  /* ── les nombres ────────────────────────────────────────────────────── */
  enregistrer("abs", { min: 1, fn: function (a) { var n = numerique(a[0], this); return nombrePhp(Math.abs(n.n), n.reel); } });
  enregistrer("ceil", { min: 1, fn: function (a) { return flottant(Math.ceil(nb(a[0]))); } });
  enregistrer("floor", { min: 1, fn: function (a) { return flottant(Math.floor(nb(a[0]))); } });
  enregistrer("round", { min: 1, fn: function (a) { var p = a.length > 1 ? ent(a[1]) : 0; var f = Math.pow(10, p); var n = nb(a[0]); var r = Math.round((n * f + (n >= 0 ? 1 : -1) * 1e-9)) / f; return flottant(r === 0 ? 0 : r); } });
  enregistrer("intdiv", { min: 2, fn: function (a, c) { var d = ent(a[1]); if (d === 0) throw new ErreurPhp("Division by zero", c.ligne, "DivisionByZeroError"); return Math.trunc(ent(a[0]) / d); } });
  enregistrer("fmod", { min: 2, fn: function (a) { return flottant(nb(a[0]) % nb(a[1])); } });
  enregistrer("pow", { min: 2, fn: function (a) { var p = Math.pow(nb(a[0]), nb(a[1])); var r = numerique(a[0], this).reel || numerique(a[1], this).reel || nb(a[1]) < 0 || !Number.isInteger(p); return nombrePhp(p, r); } });
  enregistrer("sqrt", { min: 1, fn: function (a) { return flottant(Math.sqrt(nb(a[0]))); } });
  enregistrer("exp", { min: 1, fn: function (a) { return flottant(Math.exp(nb(a[0]))); } });
  enregistrer("log", { min: 1, fn: function (a) { return flottant(a.length > 1 ? Math.log(nb(a[0])) / Math.log(nb(a[1])) : Math.log(nb(a[0]))); } });
  enregistrer("log10", { min: 1, fn: function (a) { return flottant(Math.log10(nb(a[0]))); } });
  enregistrer("sin cos tan asin acos atan sinh cosh tanh", { min: 1, fn: function (a, c) { return flottant(Math[c.nomFn](nb(a[0]))); } });
  enregistrer("atan2", { min: 2, fn: function (a) { return flottant(Math.atan2(nb(a[0]), nb(a[1]))); } });
  enregistrer("pi", { fn: function () { return flottant(Math.PI); } });
  enregistrer("deg2rad", { min: 1, fn: function (a) { return flottant(nb(a[0]) * Math.PI / 180); } });
  enregistrer("rad2deg", { min: 1, fn: function (a) { return flottant(nb(a[0]) * 180 / Math.PI); } });
  enregistrer("max", { min: 1, fn: function (a, c) { return extremum.call(this, a, c, 1); } });
  enregistrer("min", { min: 1, fn: function (a, c) { return extremum.call(this, a, c, -1); } });
  function extremum(a, c, sens) {
    var items = a.length === 1 && a[0] instanceof PhpArray ? a[0].cles.map(function (k) { return a[0].vals[k]; }) : a;
    if (!items.length) throw new ErreurPhp((sens > 0 ? "max" : "min") + "(): Argument #1 ($value) must contain at least one element", c.ligne, "ValueError");
    var best = items[0];
    for (var i = 1; i < items.length; i++) if (comparer(items[i], best, this, c.ligne) * sens > 0) best = items[i];
    return best;
  }
  enregistrer("rand mt_rand", { fn: function (a) { if (a.length >= 2) { var lo = ent(a[0]), hi = ent(a[1]); return lo + Math.floor(this.rngPhp() * (hi - lo + 1)); } return Math.floor(this.rngPhp() * 2147483648); } });
  enregistrer("random_int", { min: 2, fn: function (a) { var lo = ent(a[0]), hi = ent(a[1]); return lo + Math.floor(this.rngPhp() * (hi - lo + 1)); } });
  enregistrer("mt_getrandmax getrandmax", { fn: function () { return 2147483647; } });
  enregistrer("mt_srand srand", { fn: function (a) { this.rngSeed = a.length ? ent(a[0]) >>> 0 : (Date.now() >>> 0); return null; } });
  enregistrer("intval", { min: 1, fn: function (a) { if (a.length > 1 && typeof a[0] === "string") { var base = ent(a[1]); var s = a[0].trim(); if (base === 0) { if (/^0x/i.test(s)) return parseInt(s, 16) || 0; if (/^0b/i.test(s)) return parseInt(s.slice(2), 2) || 0; if (/^0[0-7]/.test(s)) return parseInt(s, 8) || 0; return parseInt(s, 10) || 0; } return parseInt(s, base) || 0; } return Math.trunc(versNombre(a[0])); } });
  enregistrer("floatval doubleval", { min: 1, fn: function (a) { return flottant(versNombre(a[0])); } });
  enregistrer("strval", { min: 1, fn: function (a) { return txt(this, a[0]); } });
  enregistrer("boolval", { min: 1, fn: function (a) { return versBool(a[0]); } });
  enregistrer("dechex", { min: 1, fn: function (a) { return (ent(a[0]) >>> 0).toString(16); } });
  enregistrer("hexdec", { min: 1, fn: function (a) { return parseInt(txt(this, a[0]).replace(/[^0-9a-f]/gi, ""), 16) || 0; } });
  enregistrer("decbin", { min: 1, fn: function (a) { return (ent(a[0]) >>> 0).toString(2); } });
  enregistrer("bindec", { min: 1, fn: function (a) { return parseInt(txt(this, a[0]).replace(/[^01]/g, ""), 2) || 0; } });
  enregistrer("decoct", { min: 1, fn: function (a) { return (ent(a[0]) >>> 0).toString(8); } });
  enregistrer("octdec", { min: 1, fn: function (a) { return parseInt(txt(this, a[0]), 8) || 0; } });
  enregistrer("is_nan", { min: 1, fn: function (a) { return isNaN(nb(a[0])); } });
  enregistrer("is_finite", { min: 1, fn: function (a) { return isFinite(nb(a[0])); } });
  enregistrer("is_infinite", { min: 1, fn: function (a) { return !isFinite(nb(a[0])) && !isNaN(nb(a[0])); } });

  /* ── les types ──────────────────────────────────────────────────────── */
  enregistrer("gettype", { min: 1, fn: function (a) { return P.typeGettype(a[0]); } });
  enregistrer("get_debug_type", { min: 1, fn: function (a) { if (a[0] instanceof PhpObjet) return a[0].classe.nom; return typeNom(a[0]); } });
  enregistrer("settype", { min: 2, fn: function (a, c) { if (!c.refs[0]) return false; var t = txt(this, a[1]).toLowerCase(); var v = a[0]; var nv = v; if (t === "integer" || t === "int") nv = Math.trunc(versNombre(v)); else if (t === "float" || t === "double") nv = flottant(versNombre(v)); else if (t === "string") nv = txt(this, v); else if (t === "boolean" || t === "bool") nv = versBool(v); else if (t === "array") nv = v instanceof PhpArray ? v : (v === null ? new PhpArray() : listeDe([v])); else if (t === "null") nv = null; c.refs[0].ecrire(nv); return true; } });
  enregistrer("is_int is_integer is_long", { min: 1, fn: function (a) { return typeof a[0] === "number"; } });
  enregistrer("is_float is_double", { min: 1, fn: function (a) { return estFloat(a[0]); } });
  enregistrer("is_string", { min: 1, fn: function (a) { return typeof a[0] === "string"; } });
  enregistrer("is_bool", { min: 1, fn: function (a) { return a[0] === true || a[0] === false; } });
  enregistrer("is_array", { min: 1, fn: function (a) { return a[0] instanceof PhpArray; } });
  enregistrer("is_object", { min: 1, fn: function (a) { return a[0] instanceof PhpObjet; } });
  enregistrer("is_null", { min: 1, fn: function (a) { return a[0] === null || a[0] === undefined; } });
  enregistrer("is_scalar", { min: 1, fn: function (a) { var t = typeNom(a[0]); return t === "int" || t === "float" || t === "string" || t === "bool"; } });
  enregistrer("is_numeric", { min: 1, fn: function (a) { if (typeof a[0] === "number" || estFloat(a[0])) return true; return typeof a[0] === "string" && estChaineNumerique(a[0]); } });
  enregistrer("is_callable", { min: 1, fn: function (a) { var v = a[0]; if (v instanceof PhpObjet) return v.cloture || !!this.methode(v.classe, "__invoke"); if (typeof v === "string") return v.toLowerCase() in this.fonctions || v.toLowerCase() in P.INTEGREES || v.indexOf("::") > 0; if (v instanceof PhpArray && v.taille() === 2) return true; return false; } });
  enregistrer("is_iterable", { min: 1, fn: function (a) { return a[0] instanceof PhpArray || (a[0] instanceof PhpObjet && this.estSousType(a[0].classe, "traversable")); } });
  enregistrer("is_countable", { min: 1, fn: function (a) { return a[0] instanceof PhpArray || (a[0] instanceof PhpObjet && this.estSousType(a[0].classe, "countable")); } });
  enregistrer("ctype_digit", { min: 1, fn: function (a) { var s = a[0]; if (typeof s === "number") return s >= 48 && s <= 57; return typeof s === "string" && s !== "" && /^[0-9]+$/.test(s); } });
  enregistrer("ctype_alpha", { min: 1, fn: function (a) { return typeof a[0] === "string" && a[0] !== "" && /^[A-Za-z]+$/.test(a[0]); } });
  enregistrer("ctype_alnum", { min: 1, fn: function (a) { return typeof a[0] === "string" && a[0] !== "" && /^[A-Za-z0-9]+$/.test(a[0]); } });
  enregistrer("ctype_space", { min: 1, fn: function (a) { return typeof a[0] === "string" && a[0] !== "" && /^\s+$/.test(a[0]); } });
  enregistrer("ctype_upper", { min: 1, fn: function (a) { return typeof a[0] === "string" && a[0] !== "" && /^[A-Z]+$/.test(a[0]); } });
  enregistrer("ctype_lower", { min: 1, fn: function (a) { return typeof a[0] === "string" && a[0] !== "" && /^[a-z]+$/.test(a[0]); } });

  /* ── les tableaux ───────────────────────────────────────────────────── */
  function exigerTableau(v, nom, pos, c) { if (!(v instanceof PhpArray)) throw new ErreurPhp(nom + "(): Argument #" + pos + " must be of type array, " + typeNom(v) + " given", c.ligne, "TypeError"); return v; }
  enregistrer("array_push", { min: 1, fn: function (a, c) { var arr = c.refs[0] ? deref(c.refs[0].lire()) : a[0]; exigerTableau(arr, "array_push", 1, c); for (var i = 1; i < a.length; i++) arr.pousser(copierValeur(a[i])); return arr.taille(); } });
  enregistrer("array_pop", { min: 1, fn: function (a, c) { var arr = c.refs[0] ? a[0] : a[0]; if (!(arr instanceof PhpArray) || !arr.taille()) return null; var k = arr.cles[arr.cles.length - 1]; var v = arr.vals[k]; arr.supprimer(k); arr.prochaine = 0; arr.cles.forEach(function (kk) { if (typeof kk === "number" && kk >= arr.prochaine) arr.prochaine = kk + 1; }); return v; } });
  enregistrer("array_shift", { min: 1, fn: function (a, c) { var arr = a[0]; if (!(arr instanceof PhpArray) || !arr.taille()) return null; var k = arr.cles[0]; var v = arr.vals[k]; arr.supprimer(k); reindexer(arr); return v; } });
  enregistrer("array_unshift", { min: 1, fn: function (a, c) { var arr = a[0]; exigerTableau(arr, "array_unshift", 1, c); var anciens = arr.cles.map(function (k) { return [k, arr.vals[k]]; }); arr.cles = []; arr.vals = Object.create(null); arr.prochaine = 0; for (var i = 1; i < a.length; i++) arr.pousser(copierValeur(a[i])); anciens.forEach(function (p) { if (typeof p[0] === "number") arr.pousser(p[1]); else arr.set(p[0], p[1]); }); return arr.taille(); } });
  function reindexer(arr) { var anciens = arr.cles.map(function (k) { return [k, arr.vals[k]]; }); arr.cles = []; arr.vals = Object.create(null); arr.prochaine = 0; anciens.forEach(function (p) { if (typeof p[0] === "number") arr.pousser(p[1]); else arr.set(p[0], p[1]); }); }
  enregistrer("array_merge", { fn: function (a) { var out = new PhpArray(); a.forEach(function (arr) { if (arr instanceof PhpArray) arr.forEach(function (v, k) { if (typeof k === "number") out.pousser(copierValeur(v)); else out.set(k, copierValeur(v)); }); }); return out; } });
  enregistrer("array_merge_recursive", { fn: function (a) { var out = new PhpArray(); a.forEach(function (arr) { if (arr instanceof PhpArray) arr.forEach(function (v, k) { if (typeof k === "number") out.pousser(copierValeur(v)); else out.set(k, copierValeur(v)); }); }); return out; } });
  enregistrer("array_keys", { min: 1, fn: function (a, c) { exigerTableau(a[0], "array_keys", 1, c); var out = new PhpArray(); var rech = a.length > 1; a[0].forEach(function (v, k) { if (!rech || egalLache(v, a[1], this, c.ligne)) out.pousser(k); }); return out; } });
  enregistrer("array_values", { min: 1, fn: function (a, c) { exigerTableau(a[0], "array_values", 1, c); var out = new PhpArray(); a[0].forEach(function (v) { out.pousser(copierValeur(v)); }); return out; } });
  enregistrer("in_array", { min: 2, fn: function (a, c) { exigerTableau(a[1], "in_array", 2, c); var strict = versBool(a[2]); var trouve = false; a[1].forEach(function (v) { if (trouve) return; if (strict ? egalStrict(v, a[0]) : egalLache(v, a[0], this, c.ligne)) trouve = true; }); return trouve; } });
  enregistrer("array_search", { min: 2, fn: function (a, c) { exigerTableau(a[1], "array_search", 2, c); var strict = versBool(a[2]); var res = false; a[1].forEach(function (v, k) { if (res !== false) return; if (strict ? egalStrict(v, a[0]) : egalLache(v, a[0], this, c.ligne)) res = k; }); return res; } });
  enregistrer("array_key_exists key_exists", { min: 2, fn: function (a, c) { exigerTableau(a[1], "array_key_exists", 2, c); return a[1].has(this.cleTableau(a[0], c.ligne)); } });
  enregistrer("array_key_first", { min: 1, fn: function (a) { return a[0] instanceof PhpArray && a[0].taille() ? a[0].cles[0] : null; } });
  enregistrer("array_key_last", { min: 1, fn: function (a) { return a[0] instanceof PhpArray && a[0].taille() ? a[0].cles[a[0].cles.length - 1] : null; } });
  enregistrer("array_flip", { min: 1, fn: function (a, c) { exigerTableau(a[0], "array_flip", 1, c); var out = new PhpArray(); a[0].forEach(function (v, k) { out.set(v, k); }); return out; } });
  enregistrer("array_reverse", { min: 1, fn: function (a, c) { exigerTableau(a[0], "array_reverse", 1, c); var garder = versBool(a[1]); var out = new PhpArray(); for (var i = a[0].cles.length - 1; i >= 0; i--) { var k = a[0].cles[i]; if (typeof k === "number" && !garder) out.pousser(copierValeur(a[0].vals[k])); else out.set(k, copierValeur(a[0].vals[k])); } return out; } });
  enregistrer("array_slice", { min: 2, fn: function (a, c) { exigerTableau(a[0], "array_slice", 1, c); var n = a[0].taille(); var d = ent(a[1]); if (d < 0) d = Math.max(0, n + d); var len = a.length > 2 && a[2] !== null ? ent(a[2]) : n - d; if (len < 0) len = Math.max(0, n + len - d); var garder = versBool(a[3]); var out = new PhpArray(); for (var i = d; i < Math.min(n, d + len); i++) { var k = a[0].cles[i]; if (typeof k === "number" && !garder) out.pousser(copierValeur(a[0].vals[k])); else out.set(k, copierValeur(a[0].vals[k])); } return out; } });
  enregistrer("array_splice", { min: 2, fn: function (a, c) { var arr = a[0]; exigerTableau(arr, "array_splice", 1, c); var n = arr.taille(); var d = ent(a[1]); if (d < 0) d = Math.max(0, n + d); var len = a.length > 2 && a[2] !== null ? ent(a[2]) : n - d; if (len < 0) len = Math.max(0, n + len - d); var paires = arr.cles.map(function (k) { return [k, arr.vals[k]]; }); var retires = new PhpArray(); for (var i = d; i < Math.min(n, d + len); i++) retires.pousser(paires[i][1]); var remplacement = a[3] instanceof PhpArray ? a[3].cles.map(function (k) { return a[3].vals[k]; }) : (a[3] !== undefined && a[3] !== null ? [a[3]] : []); var neuf = paires.slice(0, d).concat(remplacement.map(function (v) { return [null, v]; })).concat(paires.slice(d + Math.min(len, n - d))); arr.cles = []; arr.vals = Object.create(null); arr.prochaine = 0; neuf.forEach(function (p) { if (p[0] === null || typeof p[0] === "number") arr.pousser(p[1]); else arr.set(p[0], p[1]); }); return retires; } });
  enregistrer("array_map", { min: 2, fn: function (a, c) {
    var self = this, f = a[0];
    if (a.length === 2) { var out = new PhpArray(); exigerTableau(a[1], "array_map", 2, c); a[1].forEach(function (v, k) { out.set(k, f === null ? v : self.appelerCallable(f, [v], c.ligne, c.ctx)); }); if (!a[1].estListe()) return out; var r = new PhpArray(); out.forEach(function (v) { r.pousser(v); }); return r; }
    var tabs = a.slice(1); var max = 0; tabs.forEach(function (t) { max = Math.max(max, t.taille()); }); var res = new PhpArray();
    for (var i = 0; i < max; i++) { var ligneArgs = tabs.map(function (t) { return i < t.cles.length ? t.vals[t.cles[i]] : null; }); res.pousser(f === null ? listeDe(ligneArgs) : self.appelerCallable(f, ligneArgs, c.ligne, c.ctx)); }
    return res;
  } });
  enregistrer("array_filter", { min: 1, fn: function (a, c) {
    exigerTableau(a[0], "array_filter", 1, c);
    var self = this, f = a[1], mode = a.length > 2 ? ent(a[2]) : 0, out = new PhpArray();
    a[0].forEach(function (v, k) {
      var garder;
      if (!f) garder = versBool(v);
      else if (mode === 2) garder = versBool(self.appelerCallable(f, [k], c.ligne, c.ctx));
      else if (mode === 1) garder = versBool(self.appelerCallable(f, [v, k], c.ligne, c.ctx));
      else garder = garder = versBool(self.appelerCallable(f, [v], c.ligne, c.ctx));
      if (garder) out.set(k, copierValeur(v));
    });
    return out;
  } });
  enregistrer("array_reduce", { min: 2, fn: function (a, c) { var self = this, f = a[1], acc = a.length > 2 ? a[2] : null; a[0].forEach(function (v) { acc = self.appelerCallable(f, [acc, v], c.ligne, c.ctx); }); return acc; } });
  enregistrer("array_walk", { min: 2, fn: function (a, c) { var self = this, arr = a[0], f = a[1]; exigerTableau(arr, "array_walk", 1, c); arr.cles.forEach(function (k) { var box = { v: arr.vals[k] }; var ref = new P.Ref(box, "v"); var args = [ref, k]; if (a.length > 2) args.push(a[2]); self.appelerCallableRef(f, args, c.ligne, c.ctx); arr.vals[k] = box.v; }); return true; } });
  enregistrer("array_sum", { min: 1, fn: function (a, c) { exigerTableau(a[0], "array_sum", 1, c); var reel = false, s = 0; a[0].forEach(function (v) { var n = numerique(v, null); s += n.n; reel = reel || n.reel; }); return nombrePhp(s, reel); } });
  enregistrer("array_product", { min: 1, fn: function (a, c) { exigerTableau(a[0], "array_product", 1, c); var reel = false, s = 1; a[0].forEach(function (v) { var n = numerique(v, null); s *= n.n; reel = reel || n.reel; }); return nombrePhp(s, reel); } });
  enregistrer("array_unique", { min: 1, fn: function (a, c) { exigerTableau(a[0], "array_unique", 1, c); var out = new PhpArray(), vus = []; a[0].forEach(function (v, k) { for (var i = 0; i < vus.length; i++) if (comparer(vus[i], v, this, c.ligne) === 0) return; vus.push(v); out.set(k, copierValeur(v)); }); return out; } });
  enregistrer("array_column", { min: 2, fn: function (a, c) { exigerTableau(a[0], "array_column", 1, c); var col = a[1], idx = a.length > 2 ? a[2] : null; var out = new PhpArray(); var self = this; a[0].forEach(function (ligne) { if (!(ligne instanceof PhpArray) && !(ligne instanceof PhpObjet)) return; var v = col === null ? ligne : (ligne instanceof PhpArray ? ligne.get(self.cleTableau(col, c.ligne)) : ligne.props[versTexte(col, null)]); if (col !== null && v === undefined) return; if (idx !== null) { var k = ligne instanceof PhpArray ? ligne.get(self.cleTableau(idx, c.ligne)) : ligne.props[versTexte(idx, null)]; out.set(k, v); } else out.pousser(v); }); return out; } });
  enregistrer("array_combine", { min: 2, fn: function (a, c) { exigerTableau(a[0], "array_combine", 1, c); exigerTableau(a[1], "array_combine", 2, c); if (a[0].taille() !== a[1].taille()) throw new ErreurPhp("array_combine(): Argument #1 ($keys) and argument #2 ($values) must have the same number of elements", c.ligne, "ValueError"); var out = new PhpArray(); var self = this; for (var i = 0; i < a[0].cles.length; i++) out.set(self.cleTableau(a[0].vals[a[0].cles[i]], c.ligne), copierValeur(a[1].vals[a[1].cles[i]])); return out; } });
  enregistrer("array_fill", { min: 3, fn: function (a) { var out = new PhpArray(); var d = ent(a[0]), n = ent(a[1]); for (var i = 0; i < n; i++) out.set(d + i, copierValeur(a[2])); return out; } });
  enregistrer("array_fill_keys", { min: 2, fn: function (a, c) { var out = new PhpArray(); var self = this; a[0].forEach(function (k) { out.set(self.cleTableau(k, c.ligne), copierValeur(a[1])); }); return out; } });
  enregistrer("array_pad", { min: 3, fn: function (a, c) { exigerTableau(a[0], "array_pad", 1, c); var taille = ent(a[1]); var out = a[0].copie(); var manque = Math.abs(taille) - out.taille(); if (manque <= 0) return out; if (taille > 0) { for (var i = 0; i < manque; i++) out.pousser(copierValeur(a[2])); return out; } var r = new PhpArray(); for (var j = 0; j < manque; j++) r.pousser(copierValeur(a[2])); out.forEach(function (v) { r.pousser(v); }); return r; } });
  enregistrer("range", { min: 2, fn: function (a, c) {
    var out = new PhpArray(), d = a[0], f = a[1], pas = a.length > 2 ? Math.abs(nb(a[2])) : 1;
    if (typeof d === "string" && typeof f === "string" && d.length === 1 && f.length === 1 && !estChaineNumerique(d)) {
      var di = d.charCodeAt(0), fi = f.charCodeAt(0), p = pas || 1;
      if (di <= fi) for (var i = di; i <= fi; i += p) out.pousser(String.fromCharCode(i)); else for (var j = di; j >= fi; j -= p) out.pousser(String.fromCharCode(j));
      return out;
    }
    var dn = nb(d), fn2 = nb(f); var reel = estFloat(d) || estFloat(f) || (a.length > 2 && estFloat(a[2])) || !Number.isInteger(pas);
    if (pas === 0) pas = 1;
    if (dn <= fn2) for (var k = dn; k <= fn2 + 1e-9; k += pas) out.pousser(nombrePhp(reel ? k : Math.round(k), reel)); else for (var m = dn; m >= fn2 - 1e-9; m -= pas) out.pousser(nombrePhp(reel ? m : Math.round(m), reel));
    return out;
  } });
  enregistrer("array_diff", { min: 2, fn: function (a, c) { var out = new PhpArray(); var self = this; a[0].forEach(function (v, k) { var dans = false; for (var i = 1; i < a.length; i++) a[i].forEach(function (w) { if (versTexte(v, ctxMoteur(self)) === versTexte(w, ctxMoteur(self))) dans = true; }); if (!dans) out.set(k, copierValeur(v)); }); return out; } });
  enregistrer("array_intersect", { min: 2, fn: function (a, c) { var out = new PhpArray(); var self = this; a[0].forEach(function (v, k) { var partout = true; for (var i = 1; i < a.length; i++) { var dans = false; a[i].forEach(function (w) { if (versTexte(v, ctxMoteur(self)) === versTexte(w, ctxMoteur(self))) dans = true; }); if (!dans) partout = false; } if (partout) out.set(k, copierValeur(v)); }); return out; } });
  enregistrer("array_key_exists", { min: 2, fn: function (a, c) { exigerTableau(a[1], "array_key_exists", 2, c); return a[1].has(this.cleTableau(a[0], c.ligne)); } });
  enregistrer("array_is_list", { min: 1, fn: function (a, c) { exigerTableau(a[0], "array_is_list", 1, c); return a[0].estListe(); } });
  enregistrer("array_chunk", { min: 2, fn: function (a, c) { exigerTableau(a[0], "array_chunk", 1, c); var n = ent(a[1]); if (n < 1) throw new ErreurPhp("array_chunk(): Argument #2 ($length) must be greater than 0", c.ligne, "ValueError"); var garder = versBool(a[2]); var out = new PhpArray(); var cur = null; a[0].forEach(function (v, k, i) { if (i % n === 0) { cur = new PhpArray(); out.pousser(cur); } if (garder) cur.set(k, copierValeur(v)); else cur.pousser(copierValeur(v)); }); return out; } });
  enregistrer("compact", { fn: function (a, c) { var out = new PhpArray(); var cadre = c.ctx.cadre; var self = this; function une(x) { if (x instanceof PhpArray) { x.forEach(function (v) { une(v); }); return; } var nom = versTexte(x, ctxMoteur(self)); if (nom in cadre.vars) out.set(nom, copierValeur(deref(cadre.vars[nom]))); } a.forEach(une); return out; } });
  enregistrer("extract", { min: 1, fn: function (a, c) { var cadre = c.ctx.cadre, n = 0; a[0].forEach(function (v, k) { if (typeof k === "string" && /^[A-Za-z_]\w*$/.test(k)) { cadre.vars[k] = copierValeur(v); n++; } }); return n; } });
  enregistrer("current pos", { min: 1, fn: function (a) { var arr = a[0]; if (!(arr instanceof PhpArray) || !arr.taille()) return false; arr.ptr = arr.ptr || 0; return arr.ptr < arr.cles.length ? arr.vals[arr.cles[arr.ptr]] : false; } });
  enregistrer("key", { min: 1, fn: function (a) { var arr = a[0]; if (!(arr instanceof PhpArray)) return null; arr.ptr = arr.ptr || 0; return arr.ptr < arr.cles.length ? arr.cles[arr.ptr] : null; } });
  enregistrer("next", { min: 1, fn: function (a, c) { var arr = c.refs[0] ? a[0] : a[0]; if (!(arr instanceof PhpArray)) return false; arr.ptr = (arr.ptr || 0) + 1; return arr.ptr < arr.cles.length ? arr.vals[arr.cles[arr.ptr]] : false; } });
  enregistrer("prev", { min: 1, fn: function (a) { var arr = a[0]; if (!(arr instanceof PhpArray)) return false; arr.ptr = (arr.ptr || 0) - 1; return arr.ptr >= 0 && arr.ptr < arr.cles.length ? arr.vals[arr.cles[arr.ptr]] : false; } });
  enregistrer("reset", { min: 1, fn: function (a) { var arr = a[0]; if (!(arr instanceof PhpArray)) return false; arr.ptr = 0; return arr.taille() ? arr.vals[arr.cles[0]] : false; } });
  enregistrer("end", { min: 1, fn: function (a) { var arr = a[0]; if (!(arr instanceof PhpArray)) return false; arr.ptr = arr.cles.length - 1; return arr.taille() ? arr.vals[arr.cles[arr.cles.length - 1]] : false; } });

  /* ── le tri ── */
  function trier(arr, comp, garderCles, cleTri) {
    var paires = arr.cles.map(function (k) { return { k: k, v: arr.vals[k] }; });
    paires.sort(function (x, y) { return comp(cleTri ? x.k : x.v, cleTri ? y.k : y.v, x, y); });
    arr.cles = []; arr.vals = Object.create(null); arr.prochaine = 0;
    paires.forEach(function (p) { if (garderCles) arr.set(p.k, p.v); else arr.pousser(p.v); });
    return true;
  }
  enregistrer("sort", { min: 1, fn: function (a, c) { return trier(a[0], function (x, y) { return comparer(x, y, c.ctx.moteur, c.ligne); }, false); } });
  enregistrer("rsort", { min: 1, fn: function (a, c) { return trier(a[0], function (x, y) { return -comparer(x, y, c.ctx.moteur, c.ligne); }, false); } });
  enregistrer("asort", { min: 1, fn: function (a, c) { return trier(a[0], function (x, y) { return comparer(x, y, c.ctx.moteur, c.ligne); }, true); } });
  enregistrer("arsort", { min: 1, fn: function (a, c) { return trier(a[0], function (x, y) { return -comparer(x, y, c.ctx.moteur, c.ligne); }, true); } });
  enregistrer("ksort", { min: 1, fn: function (a, c) { return trier(a[0], function (x, y) { return comparer(x, y, c.ctx.moteur, c.ligne); }, true, true); } });
  enregistrer("krsort", { min: 1, fn: function (a, c) { return trier(a[0], function (x, y) { return -comparer(x, y, c.ctx.moteur, c.ligne); }, true, true); } });
  enregistrer("usort", { min: 2, fn: function (a, c) { var self = this; return trier(a[0], function (x, y) { return signe(versNombre(self.appelerCallable(a[1], [x, y], c.ligne, c.ctx))); }, false); } });
  enregistrer("uasort", { min: 2, fn: function (a, c) { var self = this; return trier(a[0], function (x, y) { return signe(versNombre(self.appelerCallable(a[1], [x, y], c.ligne, c.ctx))); }, true); } });
  enregistrer("uksort", { min: 2, fn: function (a, c) { var self = this; return trier(a[0], function (x, y) { return signe(versNombre(self.appelerCallable(a[1], [x, y], c.ligne, c.ctx))); }, true, true); } });
  function signe(n) { return n < 0 ? -1 : n > 0 ? 1 : 0; }
  enregistrer("shuffle", { min: 1, fn: function (a) { var arr = a[0]; if (!(arr instanceof PhpArray)) return false; var vals = arr.cles.map(function (k) { return arr.vals[k]; }); for (var i = vals.length - 1; i > 0; i--) { var j = Math.floor(this.rngPhp() * (i + 1)); var t = vals[i]; vals[i] = vals[j]; vals[j] = t; } arr.cles = []; arr.vals = Object.create(null); arr.prochaine = 0; vals.forEach(function (v) { arr.pousser(v); }); return true; } });
  enregistrer("array_rand", { min: 1, fn: function (a) { var arr = a[0]; var n = a.length > 1 ? ent(a[1]) : 1; if (n === 1) return arr.cles[Math.floor(this.rngPhp() * arr.cles.length)]; var copie = arr.cles.slice(); var out = new PhpArray(); for (var i = 0; i < n && copie.length; i++) { var j = Math.floor(this.rngPhp() * copie.length); out.pousser(copie.splice(j, 1)[0]); } return out; } });

  /* ── callable avec références (array_walk) ── */
  P.Moteur.prototype.appelerCallable = P.Moteur.prototype.appelerCallable;
  P.Moteur.prototype.appelerCallableRef = function (f, args, ligne, ctx) {
    if (typeof f === "string" && f.toLowerCase() in this.fonctions) {
      var decl = this.fonctions[f.toLowerCase()];
      return this.appelerDeclaration(decl, args.map(function (a) { return a instanceof P.Ref ? { refArg: a } : { preEvalue: a }; }), ctx || { moteur: this, cadre: new (function () {})() }, null, null);
    }
    return this.appelerCallable(f, args.map(deref), ligne, ctx);
  };
  // un hasard déterministe pour rand() : mulberry32, graine par défaut fixe
  P.Moteur.prototype.rngPhp = function () {
    if (this.rngSeed === undefined) this.rngSeed = (this.graine || 0x9e3779b9) >>> 0;
    this.rngSeed = (this.rngSeed + 0x6D2B79F5) | 0;
    var t = this.rngSeed;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /* ── var_dump / print_r / var_export ── */
  enregistrer("var_dump", { min: 1, fn: function (a) { var self = this; a.forEach(function (v) { self.ecrire(self.var_dump(v) + "\n"); }); return null; } });
  enregistrer("print_r", { min: 1, fn: function (a) { var s = this.print_r(a[0]); if (versBool(a[1])) return s; this.ecrire(s); return true; } });
  enregistrer("var_export", { min: 1, fn: function (a) { var s = this.var_export(a[0]); if (versBool(a[1])) return s; this.ecrire(s); return null; } });
  enregistrer("printf", { min: 1, fn: function (a, c) { var s = formater.call(this, a, c); this.ecrire(s); return s.length; } });
  enregistrer("print", { min: 1, fn: function (a) { this.ecrire(txt(this, a[0])); return 1; } });
  enregistrer("gettype", { min: 1, fn: function (a) { return P.typeGettype(a[0]); } });

  /* ── les objets et classes ── */
  enregistrer("get_class", { fn: function (a, c) { if (!a.length) { if (c.ctx && c.ctx.thisObj) return c.ctx.thisObj.classe.nom; if (c.ctx && c.ctx.classe) return c.ctx.classe.nom; return false; } if (a[0] instanceof PhpObjet) return a[0].classe.nom; throw new ErreurPhp("get_class(): Argument #1 ($object) must be of type object, " + typeNom(a[0]) + " given", c.ligne, "TypeError"); } });
  enregistrer("get_parent_class", { fn: function (a, c) { var classe; if (!a.length) classe = c.ctx.classe; else if (a[0] instanceof PhpObjet) classe = a[0].classe; else classe = this.classes[versTexte(a[0], null).toLowerCase()]; return classe && classe.parent ? classe.parent.nom : false; } });
  enregistrer("get_object_vars", { min: 1, fn: function (a) { var out = new PhpArray(); if (a[0] instanceof PhpObjet) a[0].ordre.forEach(function (k) { out.set(k, a[0].props[k]); }); return out; } });
  enregistrer("get_class_methods", { min: 1, fn: function (a) { var classe = a[0] instanceof PhpObjet ? a[0].classe : this.classes[versTexte(a[0], null).toLowerCase()]; var out = new PhpArray(); var vus = {}; for (var c = classe; c; c = c.parent) for (var k in c.methodes) if (!vus[k]) { vus[k] = 1; out.pousser(c.methodes[k].decl.nom); } return out; } });
  enregistrer("method_exists", { min: 2, fn: function (a) { var classe = a[0] instanceof PhpObjet ? a[0].classe : this.classes[versTexte(a[0], null).toLowerCase()]; return !!(classe && this.methode(classe, versTexte(a[1], null).toLowerCase())); } });
  enregistrer("property_exists", { min: 2, fn: function (a) { var classe = a[0] instanceof PhpObjet ? a[0].classe : this.classes[versTexte(a[0], null).toLowerCase()]; var nom = versTexte(a[1], null); if (a[0] instanceof PhpObjet && a[0].has(nom)) return true; return !!(classe && this.infoPropriete(classe, nom)); } });
  enregistrer("class_exists", { min: 1, fn: function (a) { var c = this.classes[versTexte(a[0], null).toLowerCase().replace(/^\\/, "")]; return !!(c && c.genre !== "interface" && c.genre !== "trait"); } });
  enregistrer("interface_exists", { min: 1, fn: function (a) { var c = this.classes[versTexte(a[0], null).toLowerCase()]; return !!(c && c.genre === "interface"); } });
  enregistrer("trait_exists", { min: 1, fn: function (a) { var c = this.classes[versTexte(a[0], null).toLowerCase()]; return !!(c && c.genre === "trait"); } });
  enregistrer("enum_exists", { min: 1, fn: function (a) { var c = this.classes[versTexte(a[0], null).toLowerCase()]; return !!(c && c.genre === "enum"); } });
  enregistrer("function_exists", { min: 1, fn: function (a) { var n = versTexte(a[0], null).toLowerCase(); return n in this.fonctions || n in P.INTEGREES; } });
  enregistrer("is_a", { min: 2, fn: function (a) { var v = a[0]; if (v instanceof PhpObjet) return this.estInstance(v, versTexte(a[1], null)); if (typeof v === "string" && versBool(a[2])) { var c = this.classes[v.toLowerCase()]; return !!(c && this.estSousType(c, versTexte(a[1], null).toLowerCase())); } return false; } });
  enregistrer("is_subclass_of", { min: 2, fn: function (a) { var classe = a[0] instanceof PhpObjet ? a[0].classe : this.classes[versTexte(a[0], null).toLowerCase()]; if (!classe) return false; var cible = versTexte(a[1], null).toLowerCase(); return classe.nom.toLowerCase() !== cible && this.estSousType(classe, cible); } });
  enregistrer("spl_object_id spl_object_hash", { min: 1, fn: function (a, c) { return c.nomFn === "spl_object_id" ? a[0].id : ("" + a[0].id).padStart(32, "0"); } });
  enregistrer("call_user_func", { min: 1, fn: function (a, c) { return this.appelerCallable(a[0], a.slice(1), c.ligne, c.ctx); } });
  enregistrer("call_user_func_array", { min: 2, fn: function (a, c) { var args = []; if (a[1] instanceof PhpArray) a[1].forEach(function (v) { args.push(v); }); return this.appelerCallable(a[0], args, c.ligne, c.ctx); } });
  enregistrer("func_get_args", { fn: function (a, c) { return c.ctx && c.ctx.argsRecus ? c.ctx.argsRecus.copie() : new PhpArray(); } });
  enregistrer("func_num_args", { fn: function (a, c) { return c.ctx && c.ctx.argsRecus ? c.ctx.argsRecus.taille() : 0; } });

  /* ── le web : filtres, en-têtes, session ── */
  enregistrer("filter_var", { min: 1, fn: function (a, c) { return filtrer.call(this, a[0], a.length > 1 ? ent(a[1]) : 516, a[2], c); } });
  enregistrer("filter_input", { min: 2, fn: function (a, c) { var src = ent(a[0]) === 1 ? this.globales.vars["_GET"] : ent(a[0]) === 0 ? this.globales.vars["_POST"] : this.globales.vars["_REQUEST"]; var v = src.get(versTexte(a[1], null)); if (v === undefined) return null; return filtrer.call(this, v, a.length > 2 ? ent(a[2]) : 516, a[3], c); } });
  function filtrer(v, filtre, options, c) {
    var s = typeof v === "string" ? v : (v === null ? "" : versTexte(v, ctxMoteur(this)));
    var nullSiEchec = false;
    if (options instanceof PhpArray && options.has("flags")) nullSiEchec = (ent(options.get("flags")) & 134217728) !== 0;
    else if (typeof options === "number" && (options & 134217728)) nullSiEchec = true;
    var echec = nullSiEchec ? null : false;
    switch (filtre) {
      case 274: return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && !/\.\./.test(s) ? s : echec;   // FILTER_VALIDATE_EMAIL
      case 257: { var m = /^\s*[+-]?\d+\s*$/.exec(s); return m ? parseInt(s.trim(), 10) : echec; }  // INT
      case 259: return estChaineNumerique(s) ? flottant(parseFloat(s)) : echec;  // FLOAT
      case 258: { var b = s.trim().toLowerCase(); if (/^(1|true|on|yes)$/.test(b)) return true; if (/^(0|false|off|no|)$/.test(b)) return false; return nullSiEchec ? null : false; }  // BOOLEAN
      case 273: return /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(s) ? s : echec;  // URL
      case 275: return validerIp(s, options) ? s : echec;  // IP
      case 272: { var re = options instanceof PhpArray && options.has("options") ? options.get("options").get("regexp") : null; if (!re) return echec; var pat = versTexte(re, null); var mm = /^(.)(.*)\1([a-z]*)$/.exec(pat); if (!mm) return echec; try { return new RegExp(mm[2], mm[3].replace(/[^gimsuy]/g, "")).test(s) ? s : echec; } catch (e) { return echec; } }
      case 513: case 516: return s;   // SANITIZE_STRING / DEFAULT : renvoie tel quel (SANITIZE_STRING retiré en 8.1)
      case 519: return s.replace(/[^0-9+\-]/g, "");  // SANITIZE_NUMBER_INT
      case 517: return s.replace(/[^a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~@\-\[\]]/g, "");  // SANITIZE_EMAIL
      case 515: case 522: return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&#34;").replace(/'/g, "&#39;");
      default: return s;
    }
  }
  function validerIp(s, options) {
    var flags = options instanceof PhpArray && options.has("flags") ? versNombre(options.get("flags")) : (typeof options === "number" ? options : 0);
    var v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
    var okV4 = v4 && v4.slice(1).every(function (o) { return +o <= 255 && (o.length === 1 || o[0] !== "0"); });
    var okV6 = /^[0-9a-f:]+$/i.test(s) && s.indexOf(":") >= 0 && (s.match(/::/g) || []).length <= 1 && s.split(":").length <= 8;
    if (flags & 1048576) return okV4;
    if (flags & 2097152) return okV6;
    return okV4 || okV6;
  }
  enregistrer("header", { min: 1, fn: function (a, c) { var h = txt(this, a[0]); this.entetes.push(h); var m = /^location:\s*(.*)$/i.exec(h); if (m) this.redirection = m[1].trim(); return null; } });
  enregistrer("headers_sent", { fn: function () { return this.sortie.length > 0; } });
  enregistrer("http_response_code", { fn: function (a) { if (a.length) { this.codeReponse = ent(a[0]); return true; } return this.codeReponse || 200; } });
  enregistrer("setcookie setrawcookie", { min: 1, fn: function (a) { this.cookies[txt(this, a[0])] = a.length > 1 ? txt(this, a[1]) : ""; return true; } });
  enregistrer("session_start", { fn: function () { if (!this.session) this.session = new PhpArray(); this.sessionDemarree = true; this.sessionActive = true; return true; } });
  enregistrer("session_destroy", { fn: function () { this.session = null; this.sessionActive = false; return true; } });
  enregistrer("session_unset", { fn: function () { this.session = new PhpArray(); return true; } });
  enregistrer("session_id", { fn: function (a) { if (a && a.length) this.sessionId = txt(this, a[0]); return this.sessionId || "atelier-session"; } });
  enregistrer("session_name", { fn: function () { return "PHPSESSID"; } });
  enregistrer("session_regenerate_id", { fn: function () { return true; } });
  enregistrer("session_status", { fn: function () { return this.sessionActive ? 2 : 1; } });  // PHP_SESSION_ACTIVE=2, NONE=1
  enregistrer("session_write_close", { fn: function () { return true; } });
  enregistrer("password_hash", { min: 2, fn: function (a, c) { var cout = 10; if (a[2] instanceof PhpArray && a[2].has("cost")) cout = ent(a[2].get("cost")); var sel = EMP.selAleatoire(); return EMP.bcrypt(txt(this, a[0]), cout, sel); } });
  enregistrer("password_verify", { min: 2, fn: function (a) { return EMP.bcryptVerifier(txt(this, a[0]), txt(this, a[1])); } });
  enregistrer("password_needs_rehash", { min: 2, fn: function (a) { var m = /^\$2[aby]\$(\d\d)\$/.exec(txt(this, a[1])); if (!m) return true; var cout = 10; if (a[2] instanceof PhpArray && a[2].has("cost")) cout = ent(a[2].get("cost")); return +m[1] !== cout; } });
  enregistrer("password_get_info", { min: 1, fn: function (a) { var out = new PhpArray(); var m = /^\$2[aby]\$(\d\d)\$/.exec(txt(this, a[0])); out.set("algo", m ? "2y" : null); out.set("algoName", m ? "bcrypt" : "unknown"); var opt = new PhpArray(); if (m) opt.set("cost", +m[1]); out.set("options", opt); return out; } });

  /* ── les empreintes ── */
  enregistrer("md5", { min: 1, fn: function (a) { var h = EMP.md5(txt(this, a[0])); return versBool(a[1]) ? octetsEnChaine(EMP.versOctets(h)) : h; } });
  enregistrer("sha1", { min: 1, fn: function (a) { var h = EMP.sha1(txt(this, a[0])); return versBool(a[1]) ? octetsEnChaine(EMP.versOctets(h)) : h; } });
  enregistrer("crc32", { min: 1, fn: function (a) { return crc32(txt(this, a[0])); } });
  enregistrer("hash", { min: 2, fn: function (a, c) { var algo = txt(this, a[0]).toLowerCase(), s = txt(this, a[1]); var h = algo === "md5" ? EMP.md5(s) : algo === "sha1" ? EMP.sha1(s) : algo === "sha256" ? EMP.sha256(s) : null; if (h === null) throw this.exception("ValueError", "hash(): Argument #1 ($algo) must be a valid hashing algorithm", c.ligne); return versBool(a[2]) ? octetsEnChaine(EMP.versOctets(h)) : h; } });
  enregistrer("hash_equals", { min: 2, fn: function (a) { var x = txt(this, a[0]), y = txt(this, a[1]); if (x.length !== y.length) return false; var d = 0; for (var i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i); return d === 0; } });
  enregistrer("base64_encode", { min: 1, fn: function (a) { return base64enc(EMP.octets(txt(this, a[0]))); } });
  enregistrer("base64_decode", { min: 1, fn: function (a) { try { return octetsEnChaine(base64dec(txt(this, a[0]))); } catch (e) { return false; } } });
  enregistrer("bin2hex", { min: 1, fn: function (a) { return Array.prototype.map.call(EMP.octets(txt(this, a[0])), function (b) { return b.toString(16).padStart(2, "0"); }).join(""); } });
  enregistrer("urlencode rawurlencode", { min: 1, fn: function (a, c) { var s = encodeURIComponent(txt(this, a[0])).replace(/[!'()*]/g, function (ch) { return "%" + ch.charCodeAt(0).toString(16).toUpperCase(); }); if (c.nomFn === "urlencode") s = s.replace(/%20/g, "+"); return s; } });
  enregistrer("urldecode rawurldecode", { min: 1, fn: function (a, c) { var s = txt(this, a[0]); if (c.nomFn === "urldecode") s = s.replace(/\+/g, " "); try { return decodeURIComponent(s); } catch (e) { return s; } } });
  enregistrer("uniqid", { fn: function (a) { return (a.length ? txt(this, a[0]) : "") + Math.floor(this.rngPhp() * 0xffffffffffff).toString(16).padStart(13, "0"); } });
  function octetsEnChaine(o) { var s = ""; for (var i = 0; i < o.length; i++) s += String.fromCharCode(o[i]); return s; }
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function base64enc(o) { var s = ""; for (var i = 0; i < o.length; i += 3) { var b = o[i] << 16 | (o[i + 1] || 0) << 8 | (o[i + 2] || 0); s += B64[b >> 18] + B64[b >> 12 & 63] + (i + 1 < o.length ? B64[b >> 6 & 63] : "=") + (i + 2 < o.length ? B64[b & 63] : "="); } return s; }
  function base64dec(s) { s = s.replace(/[^A-Za-z0-9+/]/g, ""); var o = []; for (var i = 0; i < s.length; i += 4) { var b = B64.indexOf(s[i]) << 18 | B64.indexOf(s[i + 1]) << 12 | (s[i + 2] ? B64.indexOf(s[i + 2]) : 0) << 6 | (s[i + 3] ? B64.indexOf(s[i + 3]) : 0); o.push(b >> 16 & 255); if (s[i + 2]) o.push(b >> 8 & 255); if (s[i + 3]) o.push(b & 255); } return new Uint8Array(o); }
  var CRC_TABLE = null;
  function crc32(s) { if (!CRC_TABLE) { CRC_TABLE = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c; } } var o = EMP.octets(s), crc = -1; for (var i = 0; i < o.length; i++) crc = CRC_TABLE[(crc ^ o[i]) & 255] ^ (crc >>> 8); return (crc ^ -1) >>> 0; }

  /* ── les dates ── */
  enregistrer("time", { fn: function () { return Math.floor(this.maintenant() / 1000); } });
  enregistrer("microtime", { fn: function (a) { var t = this.maintenant() / 1000; if (versBool(a[0])) return flottant(t); var e = Math.floor(t); return (t - e).toFixed(8) + " " + e; } });
  enregistrer("mktime", { fn: function (a) { var d = new Date(this.maintenant()); var h = a.length > 0 ? ent(a[0]) : d.getHours(); var mi = a.length > 1 ? ent(a[1]) : d.getMinutes(); var s = a.length > 2 ? ent(a[2]) : d.getSeconds(); var mo = a.length > 3 ? ent(a[3]) : d.getMonth() + 1; var j = a.length > 4 ? ent(a[4]) : d.getDate(); var an = a.length > 5 ? ent(a[5]) : d.getFullYear(); return Math.floor(new Date(an, mo - 1, j, h, mi, s).getTime() / 1000); } });
  enregistrer("strtotime", { min: 1, fn: function (a) { var s = txt(this, a[0]).trim(); if (s === "now") return Math.floor(this.maintenant() / 1000); var d = Date.parse(s.replace(" ", "T")); if (isNaN(d)) d = Date.parse(s); return isNaN(d) ? false : Math.floor(d / 1000); } });
  enregistrer("date gmdate", { min: 1, fn: function (a) { var ts = a.length > 1 ? ent(a[1]) * 1000 : this.maintenant(); return formatDate.call(this, txt(this, a[0]), new Date(ts)); } });
  enregistrer("checkdate", { min: 3, fn: function (a) { var mo = ent(a[0]), j = ent(a[1]), an = ent(a[2]); if (mo < 1 || mo > 12 || j < 1 || an < 1 || an > 32767) return false; var d = new Date(an, mo - 1, j); return d.getMonth() === mo - 1 && d.getDate() === j; } });
  P.Moteur.prototype.maintenant = function () { return this.horloge !== undefined ? this.horloge : Date.now(); };
  function formatDate(fmt, d) {
    var jours = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var mois = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var p2 = function (n) { return String(n).padStart(2, "0"); };
    var out = "";
    for (var i = 0; i < fmt.length; i++) {
      var c = fmt[i];
      if (c === "\\") { out += fmt[++i] || ""; continue; }
      switch (c) {
        case "d": out += p2(d.getDate()); break;
        case "j": out += d.getDate(); break;
        case "D": out += jours[d.getDay()].slice(0, 3); break;
        case "l": out += jours[d.getDay()]; break;
        case "N": out += d.getDay() === 0 ? 7 : d.getDay(); break;
        case "w": out += d.getDay(); break;
        case "m": out += p2(d.getMonth() + 1); break;
        case "n": out += d.getMonth() + 1; break;
        case "M": out += mois[d.getMonth()].slice(0, 3); break;
        case "F": out += mois[d.getMonth()]; break;
        case "Y": out += d.getFullYear(); break;
        case "y": out += p2(d.getFullYear() % 100); break;
        case "H": out += p2(d.getHours()); break;
        case "G": out += d.getHours(); break;
        case "h": out += p2((d.getHours() % 12) || 12); break;
        case "g": out += (d.getHours() % 12) || 12; break;
        case "i": out += p2(d.getMinutes()); break;
        case "s": out += p2(d.getSeconds()); break;
        case "A": out += d.getHours() < 12 ? "AM" : "PM"; break;
        case "a": out += d.getHours() < 12 ? "am" : "pm"; break;
        case "t": out += new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); break;
        case "L": out += (d.getFullYear() % 4 === 0 && d.getFullYear() % 100 !== 0 || d.getFullYear() % 400 === 0) ? 1 : 0; break;
        case "U": out += Math.floor(d.getTime() / 1000); break;
        case "S": { var j = d.getDate(); out += (j >= 11 && j <= 13) ? "th" : ["th", "st", "nd", "rd"][j % 10] || "th"; break; }
        default: out += c;
      }
    }
    return out;
  }

  /* ── les fichiers (disque virtuel) ── */
  enregistrer("fopen", { min: 2, fn: function (a, c) {
    var nom = txt(this, a[0]), mode = txt(this, a[1]);
    if (/^[rbt]+$/.test(mode) && this.fs[nom] === undefined) { this.avertir("fopen(" + nom + "): Failed to open stream: No such file or directory", c.ligne); return false; }
    var h = { nom: nom, mode: mode, pos: 0 };
    if (mode[0] === "w") { this.fs[nom] = ""; h.pos = 0; }
    else if (mode[0] === "a") { if (this.fs[nom] === undefined) this.fs[nom] = ""; h.pos = this.fs[nom].length; }
    else if (mode[0] === "x") { if (this.fs[nom] !== undefined) { this.avertir("fopen(" + nom + "): Failed to open stream: File exists", c.ligne); return false; } this.fs[nom] = ""; }
    else h.pos = 0;
    var o = new PhpObjet(this.classes["stdclass"]); o.ressourceFichier = h; o.estRessource = "stream"; return o;
  } });
  function fh(obj) { return obj && obj.ressourceFichier; }
  enregistrer("fwrite fputs", { min: 2, fn: function (a, c) { var h = fh(a[0]); if (!h) { this.avertir(c.nomFn + "(): supplied resource is not a valid stream resource", c.ligne); return false; } var s = txt(this, a[1]); if (a.length > 2) s = s.slice(0, ent(a[2])); var contenu = this.fs[h.nom] || ""; this.fs[h.nom] = contenu.slice(0, h.pos) + s + contenu.slice(h.pos + s.length); h.pos += s.length; return s.length; } });
  enregistrer("fread", { min: 2, fn: function (a) { var h = fh(a[0]); if (!h) return false; var n = ent(a[1]); var s = (this.fs[h.nom] || "").substr(h.pos, n); h.pos += s.length; return s; } });
  enregistrer("fgets", { min: 1, fn: function (a) { var h = fh(a[0]); if (!h) return false; var contenu = this.fs[h.nom] || ""; if (h.pos >= contenu.length) return false; var nl = contenu.indexOf("\n", h.pos); var fin = nl < 0 ? contenu.length : nl + 1; if (a.length > 1) fin = Math.min(fin, h.pos + ent(a[1]) - 1); var s = contenu.slice(h.pos, fin); h.pos = fin; return s; } });
  enregistrer("fgetc", { min: 1, fn: function (a) { var h = fh(a[0]); if (!h) return false; var contenu = this.fs[h.nom] || ""; if (h.pos >= contenu.length) return false; return contenu[h.pos++]; } });
  enregistrer("feof", { min: 1, fn: function (a) { var h = fh(a[0]); if (!h) return true; return h.pos >= (this.fs[h.nom] || "").length; } });
  enregistrer("fclose", { min: 1, fn: function (a) { var h = fh(a[0]); if (!h) return false; a[0].ressourceFichier = null; return true; } });
  enregistrer("rewind", { min: 1, fn: function (a) { var h = fh(a[0]); if (h) h.pos = 0; return !!h; } });
  enregistrer("fseek", { min: 2, fn: function (a) { var h = fh(a[0]); if (!h) return -1; h.pos = ent(a[1]); return 0; } });
  enregistrer("ftell", { min: 1, fn: function (a) { var h = fh(a[0]); return h ? h.pos : false; } });
  enregistrer("fflush", { min: 1, fn: function () { return true; } });
  enregistrer("filesize", { min: 1, fn: function (a, c) { var nom = txt(this, a[0]); if (this.fs[nom] === undefined) { this.avertir("filesize(): stat failed for " + nom, c.ligne); return false; } return EMP.octets(this.fs[nom]).length; } });
  enregistrer("file_exists", { min: 1, fn: function (a) { var nom = txt(this, a[0]); return this.fs[nom] !== undefined || this.fichiers[nom] !== undefined; } });
  enregistrer("is_file", { min: 1, fn: function (a) { var nom = txt(this, a[0]); return this.fs[nom] !== undefined || this.fichiers[nom] !== undefined; } });
  enregistrer("is_readable is_writable is_writeable", { min: 1, fn: function (a) { var nom = txt(this, a[0]); return this.fs[nom] !== undefined; } });
  enregistrer("file_get_contents", { min: 1, fn: function (a, c) { var nom = txt(this, a[0]); if (this.fs[nom] === undefined) { this.avertir("file_get_contents(" + nom + "): Failed to open stream: No such file or directory", c.ligne); return false; } return this.fs[nom]; } });
  enregistrer("file_put_contents", { min: 2, fn: function (a) { var nom = txt(this, a[0]); var s = a[1] instanceof PhpArray ? (function () { var o = ""; a[1].forEach(function (v) { o += versTexte(v, null); }); return o; })() : txt(this, a[1]); var ajout = (a.length > 2 && (ent(a[2]) & 8)); this.fs[nom] = ajout && this.fs[nom] !== undefined ? this.fs[nom] + s : s; return EMP.octets(s).length; } });
  enregistrer("file", { min: 1, fn: function (a, c) { var nom = txt(this, a[0]); if (this.fs[nom] === undefined) { this.avertir("file(" + nom + "): Failed to open stream: No such file or directory", c.ligne); return false; } var flags = a.length > 1 ? ent(a[1]) : 0; var contenu = this.fs[nom]; var lignes = contenu.split(/(?<=\n)/); if (flags & 2) lignes = lignes.map(function (l) { return l.replace(/\r?\n$/, ""); }); if (flags & 4) lignes = lignes.filter(function (l) { return l !== ""; }); return listeDe(lignes); } });
  enregistrer("unlink", { min: 1, fn: function (a, c) { var nom = txt(this, a[0]); if (this.fs[nom] === undefined) { this.avertir("unlink(" + nom + "): No such file or directory", c.ligne); return false; } delete this.fs[nom]; return true; } });
  enregistrer("rename", { min: 2, fn: function (a) { var de = txt(this, a[0]), vers = txt(this, a[1]); if (this.fs[de] === undefined) return false; this.fs[vers] = this.fs[de]; delete this.fs[de]; return true; } });
  enregistrer("copy", { min: 2, fn: function (a) { var de = txt(this, a[0]), vers = txt(this, a[1]); if (this.fs[de] === undefined) return false; this.fs[vers] = this.fs[de]; return true; } });
  enregistrer("basename", { min: 1, fn: function (a) { var s = txt(this, a[0]).replace(/\/+$/, ""); var b = s.slice(s.lastIndexOf("/") + 1); if (a.length > 1) { var suf = txt(this, a[1]); if (b !== suf && b.slice(-suf.length) === suf) b = b.slice(0, -suf.length); } return b; } });
  enregistrer("dirname", { min: 1, fn: function (a) { var s = txt(this, a[0]).replace(/\/+$/, ""); var i = s.lastIndexOf("/"); return i <= 0 ? (i === 0 ? "/" : ".") : s.slice(0, i); } });
  enregistrer("pathinfo", { min: 1, fn: function (a) { var s = txt(this, a[0]); var out = new PhpArray(); var dir = s.lastIndexOf("/"); out.set("dirname", dir <= 0 ? (dir === 0 ? "/" : ".") : s.slice(0, dir)); var base = s.slice(dir + 1); out.set("basename", base); var dot = base.lastIndexOf("."); if (dot > 0) { out.set("extension", base.slice(dot + 1)); out.set("filename", base.slice(0, dot)); } else out.set("filename", base); return out; } });

  /* ── sortie et divers ── */
  enregistrer("ob_start", { fn: function () { this.tamponsSortie = this.tamponsSortie || []; this.tamponsSortie.push(this.sortie); this.sortie = []; return true; } });
  enregistrer("ob_get_clean ob_get_contents", { fn: function (a, c) { var s = this.sortie.join(""); if (c.nomFn === "ob_get_clean" && this.tamponsSortie && this.tamponsSortie.length) this.sortie = this.tamponsSortie.pop(); return s; } });
  enregistrer("ob_end_clean", { fn: function () { if (this.tamponsSortie && this.tamponsSortie.length) this.sortie = this.tamponsSortie.pop(); return true; } });
  enregistrer("ob_end_flush ob_flush flush", { fn: function (a, c) { if (c.nomFn === "ob_end_flush" && this.tamponsSortie && this.tamponsSortie.length) { var s = this.sortie.join(""); this.sortie = this.tamponsSortie.pop(); this.sortie.push(s); } return true; } });
  enregistrer("error_reporting", { fn: function () { return 32767; } });
  enregistrer("ini_set ini_get", { fn: function () { return false; } });
  enregistrer("set_error_handler set_exception_handler restore_error_handler", { fn: function () { return null; } });
  enregistrer("error_log", { min: 1, fn: function () { return true; } });
  enregistrer("trigger_error", { min: 1, fn: function (a, c) { var niv = a.length > 1 ? ent(a[1]) : 1024; var nom = niv === 256 ? "Fatal error" : niv === 512 ? "Warning" : "Notice"; this.avertir(txt(this, a[0]), c.ligne, niv === 256 ? "Fatal error" : niv === 512 ? "Warning" : "Notice"); if (niv === 256) throw new ErreurPhp(txt(this, a[0]), c.ligne, "__temps__"); return true; } });
  enregistrer("assert", { min: 1, fn: function (a, c) { if (!versBool(a[0])) throw this.exception("AssertionError", a.length > 1 ? txt(this, a[1]) : "assert failed", c.ligne); return true; } });
  enregistrer("debug_zval_refcount", { fn: function () { return 1; } });
  enregistrer("memory_get_usage memory_get_peak_usage", { fn: function () { return 2097152; } });
  enregistrer("gc_collect_cycles", { fn: function () { return 0; } });
  enregistrer("microtime", { fn: function (a) { var t = this.maintenant() / 1000; if (versBool(a[0])) return flottant(t); var e = Math.floor(t); return (t - e).toFixed(8) + " " + e; } });
  enregistrer("phpversion", { fn: function () { return "8.3.0"; } });
  enregistrer("php_sapi_name", { fn: function () { return "cli-server"; } });
  enregistrer("getenv", { fn: function (a) { return false; } });
  enregistrer("define", { min: 2, fn: function (a) { this.constantes[txt(this, a[0])] = a[1]; return true; } });
  enregistrer("defined", { min: 1, fn: function (a) { var nom = txt(this, a[0]); if (nom in this.constantes) return true; try { this.lireConstante(nom, 0); return true; } catch (e) { return false; } } });
  enregistrer("constant", { min: 1, fn: function (a, c) { var nom = txt(this, a[0]); if (nom.indexOf("::") > 0) { var pr = nom.split("::"); return this.lireConstClasse({ classe: pr[0], nom: pr[1], ligne: c.ligne }, { moteur: this, cadre: null, classe: null }); } return this.lireConstante(nom, c.ligne); } });
  enregistrer("die exit", { fn: function (a) { if (a.length && typeof a[0] === "string") this.ecrire(a[0]); throw new P.Signal("exit", 0); } });
  enregistrer("usleep sleep", { fn: function () { return 0; } });
  enregistrer("iterator_to_array", { min: 1, fn: function (a) { if (a[0] instanceof PhpArray) return a[0].copie(); var out = new PhpArray(); if (a[0] instanceof PhpObjet) a[0].ordre.forEach(function (k) { out.set(k, a[0].props[k]); }); return out; } });
  enregistrer("serialize", { min: 1, fn: function (a) { return serialiser.call(this, a[0]); } });
  enregistrer("unserialize", { min: 1, fn: function (a) { try { return deserialiser.call(this, txt(this, a[0]), { i: 0 }); } catch (e) { return false; } } });
  function serialiser(v) {
    if (v === null) return "N;";
    if (typeof v === "number") return "i:" + v + ";";
    if (estFloat(v)) return "d:" + v.v + ";";
    if (v === true) return "b:1;"; if (v === false) return "b:0;";
    if (typeof v === "string") return "s:" + EMP.octets(v).length + ":\"" + v + "\";";
    if (v instanceof PhpArray) { var s = "a:" + v.taille() + ":{"; var self = this; v.forEach(function (val, k) { s += serialiser.call(self, k) + serialiser.call(self, val); }); return s + "}"; }
    if (v instanceof PhpObjet) { var ser = "O:" + v.classe.nom.length + ":\"" + v.classe.nom + "\":" + v.ordre.length + ":{"; var self2 = this; v.ordre.forEach(function (k) { ser += serialiser.call(self2, k) + serialiser.call(self2, v.props[k]); }); return ser + "}"; }
    return "N;";
  }
  function deserialiser(s, p) {
    var t = s[p.i];
    if (t === "N") { p.i += 2; return null; }
    if (t === "b") { var b = s[p.i + 2] === "1"; p.i += 4; return b; }
    if (t === "i") { var e = s.indexOf(";", p.i); var n = parseInt(s.slice(p.i + 2, e), 10); p.i = e + 1; return n; }
    if (t === "d") { var e2 = s.indexOf(";", p.i); var d = parseFloat(s.slice(p.i + 2, e2)); p.i = e2 + 1; return flottant(d); }
    if (t === "s") { var c = s.indexOf(":", p.i + 2); var len = parseInt(s.slice(p.i + 2, c), 10); var str = s.substr(c + 2, len); p.i = c + 2 + len + 2; return str; }
    if (t === "a") { var c2 = s.indexOf(":", p.i + 2); var n2 = parseInt(s.slice(p.i + 2, c2), 10); p.i = c2 + 2; var arr = new PhpArray(); for (var i = 0; i < n2; i++) { var k = deserialiser.call(this, s, p); var val = deserialiser.call(this, s, p); arr.set(k, val); } p.i++; return arr; }
    throw new Error("deserialize");
  }

  /* preg_* : les expressions régulières (la syntaxe PCRE la plus courante) */
  function compilerPreg(pat) {
    var m = /^(.)([\s\S]*)\1([a-zA-Z]*)$/.exec(pat);
    if (!m) { var d = pat[0]; var fin = pat.lastIndexOf(d); if (fin <= 0) return null; m = [null, d, pat.slice(1, fin), pat.slice(fin + 1)]; }
    var corps = m[2], drapeaux = m[3];
    if (m[1] === "{") corps = corps; // délimiteurs appariés gérés sommairement
    var js = "";
    for (var f = 0; f < drapeaux.length; f++) { if ("imsuy".indexOf(drapeaux[f]) >= 0) js += drapeaux[f] === "u" ? "u" : drapeaux[f]; }
    // PCRE \A \z, (?P<nom>) → (?<nom>)
    corps = corps.replace(/\(\?P<([^>]+)>/g, "(?<$1>").replace(/\(\?P=([A-Za-z_]\w*)\)/g, "\\k<$1>").replace(/\\A/g, "^").replace(/\\z/g, "$").replace(/\\Z/g, "$");
    try { return new RegExp(corps, js); } catch (e) { try { return new RegExp(corps, js.replace("u", "")); } catch (e2) { return null; } }
  }
  enregistrer("preg_match", { min: 2, fn: function (a, c) { var re = compilerPreg(txt(this, a[0])); if (!re) { this.avertir("preg_match(): No ending delimiter found", c.ligne); return false; } var m = re.exec(txt(this, a[1])); if (c.refs[2]) { var out = new PhpArray(); if (m) { for (var i = 0; i < m.length; i++) out.set(i, m[i] === undefined ? "" : m[i]); if (m.groups) for (var g in m.groups) out.set(g, m.groups[g] === undefined ? "" : m.groups[g]); } c.refs[2].ecrire(out); } return m ? 1 : 0; } });
  enregistrer("preg_match_all", { min: 2, fn: function (a, c) { var pat = txt(this, a[0]); var re = compilerPreg(pat.replace(/([a-zA-Z]*)$/, function (m2) { return m2.indexOf("g") < 0 ? m2 : m2; })); if (!re) return false; re = new RegExp(re.source, re.flags.indexOf("g") < 0 ? re.flags + "g" : re.flags); var s = txt(this, a[1]); var m, tous = []; while ((m = re.exec(s)) !== null) { tous.push(m); if (m.index === re.lastIndex) re.lastIndex++; } if (c.refs[2]) { var out = new PhpArray(); var ng = tous.length ? tous[0].length : 1; for (var g = 0; g < ng; g++) { var grp = new PhpArray(); tous.forEach(function (mm) { grp.pousser(mm[g] === undefined ? "" : mm[g]); }); out.set(g, grp); } c.refs[2].ecrire(out); } return tous.length; } });
  enregistrer("preg_replace", { min: 3, fn: function (a, c) { var self = this; function une(s) { var pats = a[0] instanceof PhpArray ? a[0].cles.map(function (k) { return a[0].vals[k]; }) : [a[0]]; var reps = a[1] instanceof PhpArray ? a[1].cles.map(function (k) { return a[1].vals[k]; }) : null; for (var i = 0; i < pats.length; i++) { var re = compilerPreg(versTexte(pats[i], null)); if (!re) return null; re = new RegExp(re.source, re.flags.indexOf("g") < 0 ? re.flags + "g" : re.flags); var rep = reps ? (i < reps.length ? versTexte(reps[i], null) : "") : versTexte(a[1], null); rep = rep.replace(/\\(\d+)|\$(\d+)/g, function (_, x, y) { return "$" + (x || y); }); s = s.replace(re, rep); } return s; } if (a[2] instanceof PhpArray) { var out = new PhpArray(); a[2].forEach(function (v, k) { out.set(k, une(versTexte(v, null))); }); return out; } return une(txt(this, a[2])); } });
  enregistrer("preg_replace_callback", { min: 3, fn: function (a, c) { var self = this; var re = compilerPreg(txt(this, a[0])); if (!re) return null; re = new RegExp(re.source, re.flags.indexOf("g") < 0 ? re.flags + "g" : re.flags); return txt(this, a[2]).replace(re, function () { var m = Array.prototype.slice.call(arguments, 0, -2); var arr = new PhpArray(); m.forEach(function (x, i) { arr.set(i, x === undefined ? "" : x); }); return versTexte(self.appelerCallable(a[1], [arr], c.ligne, c.ctx), ctxMoteur(self)); }); } });
  enregistrer("preg_split", { min: 2, fn: function (a, c) { var re = compilerPreg(txt(this, a[0])); if (!re) return false; var lim = a.length > 2 && ent(a[2]) > 0 ? ent(a[2]) : undefined; var flags = a.length > 3 ? ent(a[3]) : 0; var parts = txt(this, a[1]).split(re, lim); if (flags & 1) parts = parts.filter(function (p) { return p !== ""; }); return listeDe(parts); } });
  enregistrer("preg_quote", { min: 1, fn: function (a) { var d = a.length > 1 ? txt(this, a[1]) : ""; return txt(this, a[0]).replace(new RegExp("[.\\\\+*?\\[^\\]$(){}=!<>|:#" + (d ? d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "") + "-]", "g"), "\\$&"); } });

  // func_get_args : on garde les arguments reçus dans le contexte d'appel
  var declOrig = P.Moteur.prototype.appelerDeclaration;
  P.Moteur.prototype.appelerDeclaration = function (decl, argsAst, ctx, thisObj, classe, argsValDejaEval) {
    return declOrig.call(this, decl, argsAst, ctx, thisObj, classe, argsValDejaEval);
  };
})();
