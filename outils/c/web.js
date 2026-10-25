/* ═══════════════════════════════════════════════════════════════════════
   Le mode « Web » de l'atelier : un petit site (index.html, style.css,
   script.js, d'autres pages, des images) montré dans un APERÇU.

   L'aperçu est un <iframe sandbox="allow-scripts allow-modals allow-forms">
   SANS allow-same-origin : la page de l'étudiant s'exécute dans une origine
   opaque. Elle ne voit ni le stockage du site, ni ses cookies, ni la page
   de l'atelier — un programme reçu par lien ne peut rien y lire. Elle ne
   peut pas non plus charger nos fichiers : tout ce dont elle a besoin y
   entre en adresses « data: » :
     · les <link href="style.css"> et <script src="script.js"> du projet
       deviennent des data: — sur la MÊME ligne, pour que le numéro de ligne
       d'une erreur dans index.html reste le bon ;
     · les images du projet aussi (src="photo.jpg", url(photo.jpg)) ;
     · un « pont », premier script de la page, sur la ligne de <head> : il
       remplace console (console-js.js, injecté en texte), rapporte les
       erreurs avec leur fichier et leur ligne, et intercepte les liens et
       les formulaires — un lien vers une autre page du projet l'ouvre dans
       l'aperçu, un formulaire montre ce qu'il aurait envoyé.
   Rien n'est AJOUTÉ en douce : une feuille de style que la page ne relie
   pas n'est pas appliquée — c'est exactement ce qui se passera sur le PC de
   l'étudiant, et l'atelier le lui dit avec la ligne à ajouter.
   ═══════════════════════════════════════════════════════════════════════ */
var ATELIER_WEB = (function () {
  "use strict";

  var IMAGE = /\.(png|jpe?g|gif|webp|svg|ico|avif|bmp)$/i;
  function base64(texte) {
    var o = new TextEncoder().encode(texte), s = "";
    for (var i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000));
    return btoa(s);
  }
  var dataTexte = function (type, texte) { return "data:" + type + ";charset=utf-8;base64," + base64(texte); };
  function normaliser(chemin) {
    return String(chemin || "").trim().replace(/^\.\//, "").replace(/[?#].*$/, "");
  }

  /* Le contenu d'un fichier du projet en adresse data: (texte ou image). */
  function adresse(projet, nom, deja) {
    var f = projet[nom];
    if (f === undefined) return null;
    if (typeof f === "object" && f.data) return f.data;
    if (/\.css$/i.test(nom)) return dataTexte("text/css", remplacerUrlsCss(String(f), projet, deja) + "\n/*# sourceURL=" + nom + " */");
    if (/\.js$/i.test(nom)) return dataTexte("text/javascript", String(f) + "\n//# sourceURL=" + nom + "\n");
    return dataTexte("text/plain", String(f));
  }
  function remplacerUrlsCss(css, projet) {
    return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (m, q, u) {
      var n = normaliser(u);
      return projet[n] !== undefined && typeof projet[n] === "object" ? "url(" + q + projet[n].data + q + ")" : m;
    });
  }

  /* Le pont : le premier script de la page. Une fonction, transmise en
     TEXTE avec ses paramètres — elle ne voit rien de ce fichier-ci. */
  function pont(jeton, pages, fabrique) {
    var envoyer = function (m) { m.jeton = jeton; try { parent.postMessage(m, "*"); } catch (e) { /* rien */ } };
    fabrique(window, envoyer);
    var lieu = function (ev) {
      var pile = ev && ev.error && ev.error.stack ? String(ev.error.stack) : "";
      var m = /([\w./-]+\.js):(\d+):(\d+)/.exec(pile);
      if (m && !/^data:/.test(m[1])) return { fichier: m[1].split("/").pop(), ligne: +m[2], colonne: +m[3] };
      if (ev && ev.filename && !/^data:/.test(ev.filename)) return { fichier: "page", ligne: ev.lineno || 0, colonne: ev.colno || 0 };
      return { fichier: "", ligne: ev && ev.lineno || 0, colonne: ev && ev.colno || 0 };
    };
    window.addEventListener("error", function (ev) {
      if (ev.target && ev.target !== window && ev.target.tagName) {
        var t = ev.target, u = t.getAttribute("src") || t.getAttribute("href") || "";
        envoyer({ t: "ressource", balise: t.tagName.toLowerCase(), url: u });
        return;
      }
      var l = lieu(ev);
      envoyer({ t: "erreur", nom: ev.error && ev.error.name || "Error", message: ev.error && ev.error.message !== undefined ? String(ev.error.message) : String(ev.message || "").replace(/^Uncaught\s+(\w*Error:\s*)?/, ""),
        fichier: l.fichier, ligne: l.ligne, colonne: l.colonne });
    }, true);
    window.addEventListener("unhandledrejection", function (ev) {
      var r = ev.reason;
      envoyer({ t: "erreur", nom: r && r.name || "Promise", message: r && r.message !== undefined ? String(r.message) : String(r), fichier: "", ligne: 0, colonne: 0 });
    });
    var versPage = function (href) {
      if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) return null;
      var n = href.replace(/^\.\//, "").replace(/[?#].*$/, "");
      return pages.indexOf(n) >= 0 ? n : null;
    };
    document.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a || ev.defaultPrevented) return;
      var href = a.getAttribute("href");
      var p = versPage(href);
      if (p) { ev.preventDefault(); var req = (href.split("#")[0].split("?")[1] || ""); envoyer({ t: "aller", page: p, requete: req, ancre: (href.split("#")[1] || "") }); return; }
      if (/^(https?:)?\/\//i.test(href)) { ev.preventDefault(); envoyer({ t: "lien", url: href }); }
      else if (!/^(#|javascript:)/i.test(href)) { ev.preventDefault(); envoyer({ t: "introuvable", url: href }); }
    });
    document.addEventListener("submit", function (ev) {
      if (ev.defaultPrevented) return;
      var f = ev.target, champs = [];
      try { new FormData(f).forEach(function (v, k) { champs.push([k, typeof v === "string" ? v : "(fichier) " + (v && v.name)]); }); } catch (e) { /* rien */ }
      ev.preventDefault();
      envoyer({ t: "formulaire", action: f.getAttribute("action") || "", methode: (f.getAttribute("method") || "get").toUpperCase(), champs: champs });
    });
    window.addEventListener("load", function () { envoyer({ t: "charge", titre: document.title }); });
  }

  /* Le document de l'aperçu, pour la page « page » du projet. */
  function assembler(projet, page, jeton, fabriqueSource) {
    var html = String(projet[page] || "");
    var pages = Object.keys(projet).filter(function (n) { return /\.(html?|php)$/i.test(n); });
    var manque = [];
    var relie = { css: {}, js: {} };
    // les feuilles de style et les scripts du projet, en data:
    html = html.replace(/<link\b[^>]*>/gi, function (balise) {
      var m = /\bhref\s*=\s*(["']?)([^"'\s>]+)\1/i.exec(balise);
      if (!m) return balise;
      var n = normaliser(m[2]);
      if (projet[n] === undefined) { if (/\.css$/i.test(n) && !/^(https?:)?\/\//i.test(m[2])) manque.push(n); return balise; }
      relie.css[n] = true;
      return balise.replace(m[0], 'href="' + adresse(projet, n) + '"');
    });
    html = html.replace(/<script\b[^>]*\bsrc\s*=\s*(["']?)([^"'\s>]+)\1[^>]*>/gi, function (balise, q, src) {
      var n = normaliser(src);
      if (projet[n] === undefined) { if (!/^(https?:)?\/\//i.test(src)) manque.push(n); return balise; }
      relie.js[n] = true;
      return balise.replace(/\bsrc\s*=\s*(["']?)[^"'\s>]+\1/i, 'src="' + adresse(projet, n) + '"');
    });
    // les images du projet (src="…", et url(…) dans un style écrit dans la page)
    html = html.replace(/\b(src|href|poster)\s*=\s*(["'])([^"']+)\2/gi, function (m, att, q, u) {
      var n = normaliser(u);
      return projet[n] !== undefined && typeof projet[n] === "object" ? att + "=" + q + projet[n].data + q : m;
    });
    html = remplacerUrlsCss(html, projet);
    // le pont, sur la ligne de <head> (ou de <html>, ou au début)
    var pontJs = "(" + pont.toString() + ")(" + JSON.stringify(jeton) + "," + JSON.stringify(pages) + "," + fabriqueSource + ");";
    var balisePont = '<script src="' + dataTexte("text/javascript", pontJs) + '"></script>';
    var m = /<head\b[^>]*>/i.exec(html) || /<html\b[^>]*>/i.exec(html) || /<!doctype[^>]*>/i.exec(html);
    if (m) html = html.slice(0, m.index + m[0].length) + balisePont + html.slice(m.index + m[0].length);
    else html = balisePont + html;
    return { html: html, manque: manque, relie: relie };
  }

  /* Les fichiers CSS et JS du projet qu'aucune page ne relie, et la ligne
     qu'il faudrait écrire. */
  function nonRelies(projet) {
    var pages = Object.keys(projet).filter(function (n) { return /\.(html?|php)$/i.test(n); });
    var tout = pages.map(function (p) { return String(projet[p]); }).join("\n");
    var out = [];
    Object.keys(projet).forEach(function (n) {
      if (typeof projet[n] !== "string" || !String(projet[n]).trim()) return;
      var echappe = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (/\.css$/i.test(n) && !new RegExp("<link\\b[^>]*href\\s*=\\s*[\"']?(\\./)?" + echappe, "i").test(tout))
        out.push({ fichier: n, ligne: '<link rel="stylesheet" href="' + n + '">', ou: "head" });
      if (/\.js$/i.test(n) && !new RegExp("<script\\b[^>]*src\\s*=\\s*[\"']?(\\./)?" + echappe, "i").test(tout))
        out.push({ fichier: n, ligne: '<script src="' + n + '"></script>', ou: "body" });
    });
    return out;
  }
  /* Ajouter la ligne qui relie un fichier : en fin de <head> pour une
     feuille de style, avant </body> pour un script. */
  function relier(html, ligne, ou) {
    var re = ou === "head" ? /([ \t]*)<\/head>/i : /([ \t]*)<\/body>/i;
    var m = re.exec(html);
    if (!m) return html + "\n" + ligne + "\n";
    var alinea = (m[1] || "") + "    ";
    return html.slice(0, m.index) + alinea + ligne + "\n" + html.slice(m.index);
  }

  return { assembler: assembler, nonRelies: nonRelies, relier: relier, IMAGE: IMAGE };
})();
