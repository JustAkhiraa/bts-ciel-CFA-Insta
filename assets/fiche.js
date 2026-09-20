/* ===========================================================================
   BTS CIEL — comportements des fiches. Vanilla, sans dépendance.
   Chargé en fin de <body> ; s'auto-initialise et reste inoffensif si un
   élément attendu est absent.
   ======================================================================== */
(function () {
  "use strict";

  /* --- 1. Sommaire : construction automatique depuis les titres --------- */
  function construireSommaire() {
    var nav = document.querySelector(".sommaire ol");
    if (!nav || nav.children.length) return;          // sommaire écrit à la main : on respecte
    var titres = document.querySelectorAll(".corps section > h2, .corps section > h3");
    titres.forEach(function (t) {
      if (!t.id) {
        var s = t.closest("section");
        t.id = (s && s.id ? s.id + "-" : "") + t.textContent.trim().toLowerCase()
               .normalize("NFD").replace(/[̀-ͯ]/g, "")
               .replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      }
      var li = document.createElement("li");
      if (t.tagName === "H3") li.className = "sous";
      var a = document.createElement("a");
      a.href = "#" + (t.closest("section").id || t.id);
      a.textContent = t.textContent.replace(/^\s*[\d.]+\s*/, "").trim();
      li.appendChild(a);
      nav.appendChild(li);
    });
  }

  /* --- 2. Sommaire : mise en évidence de la section visible ------------- */
  function suivreLecture() {
    var liens = Array.prototype.slice.call(document.querySelectorAll(".sommaire a[href^='#']"));
    if (!liens.length || !("IntersectionObserver" in window)) return;
    var carte = {};
    liens.forEach(function (a) { carte[a.getAttribute("href").slice(1)] = a; });
    var cibles = Object.keys(carte).map(function (id) { return document.getElementById(id); })
                       .filter(Boolean);
    if (!cibles.length) return;

    var visibles = new Set();
    var obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (e.isIntersecting) visibles.add(e.target.id); else visibles.delete(e.target.id);
      });
      var actif = cibles.filter(function (c) { return visibles.has(c.id); })[0];
      if (!actif) return;
      liens.forEach(function (a) { a.classList.remove("actif"); });
      if (carte[actif.id]) carte[actif.id].classList.add("actif");
    }, { rootMargin: "-8% 0px -70% 0px", threshold: 0 });
    cibles.forEach(function (c) { obs.observe(c); });
  }

  /* --- 3. Sommaire repliable sur mobile --------------------------------- */
  function sommaireMobile() {
    var som = document.querySelector(".sommaire");
    var tete = som && som.querySelector("h2");
    if (!tete) return;
    tete.addEventListener("click", function () { som.classList.toggle("ouvert"); });
    som.addEventListener("click", function (e) {
      if (e.target.tagName === "A" && window.innerWidth <= 900) som.classList.remove("ouvert");
    });
  }

  /* --- 4. Blocs de code : bouton copier --------------------------------- */
  function boutonsCopier() {
    document.querySelectorAll(".bloc-code").forEach(function (bloc) {
      var pre = bloc.querySelector("pre");
      if (!pre || bloc.querySelector(".copier")) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "copier";
      b.textContent = "Copier";
      b.setAttribute("aria-label", "Copier le code");
      b.addEventListener("click", function () {
        var texte = pre.innerText;
        var fini = function (ok) {
          b.textContent = ok ? "Copié ✓" : "Échec";
          b.classList.toggle("fait", ok);
          setTimeout(function () { b.textContent = "Copier"; b.classList.remove("fait"); }, 1800);
        };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(texte).then(function () { fini(true); },
                                                    function () { fini(false); });
        } else {                                    // repli : fichier ouvert en file://
          var z = document.createElement("textarea");
          z.value = texte; z.style.position = "fixed"; z.style.opacity = "0";
          document.body.appendChild(z); z.select();
          var ok = false;
          try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
          document.body.removeChild(z); fini(ok);
        }
      });
      bloc.appendChild(b);
    });
  }

  /* --- 5. Quiz : révélation de la réponse ------------------------------- */
  function quiz() {
    document.querySelectorAll(".quiz").forEach(function (q, i) {
      var rep = q.querySelector(".reponse");
      if (!rep) return;
      /* Le bouton doit être un ENFANT DIRECT du quiz. « querySelector » prendrait
         sinon le premier bouton venu — y compris le « Copier » que la fonction
         précédente vient de poser DANS la réponse. Ce bouton-là se retrouvait
         promu déclencheur, renommé « Afficher la réponse », puis masqué avec la
         réponse qu'il devait ouvrir : le quiz devenait impossible à dérouler, et
         la copie du code disparaissait avec lui. */
      var btn = null, k;
      for (k = 0; k < q.children.length; k++) {
        if (q.children[k].tagName === "BUTTON") { btn = q.children[k]; break; }
      }
      if (!btn) {                  // fiche incomplète : on pose le bouton manquant
        btn = document.createElement("button");
        btn.type = "button";
        rep.parentNode.insertBefore(btn, rep);
      }
      var id = rep.id || ("reponse-" + (i + 1));
      // libellés personnalisables : data-ouvrir / data-fermer sur le bouton
      var libOuvrir = btn.getAttribute("data-ouvrir") || "Afficher la réponse";
      var libFermer = btn.getAttribute("data-fermer") || "Masquer la réponse";
      rep.id = id;
      rep.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", id);
      btn.textContent = libOuvrir;
      btn.addEventListener("click", function () {
        var ouvert = rep.hidden;
        rep.hidden = !ouvert;
        btn.setAttribute("aria-expanded", String(ouvert));
        btn.textContent = ouvert ? libFermer : libOuvrir;
      });
    });
  }

  /* --- 6. Tableaux larges : enrobage défilable -------------------------- */
  function tableauxDefilables() {
    document.querySelectorAll(".corps table").forEach(function (t) {
      if (t.parentElement.classList.contains("tableau")) return;
      var box = document.createElement("div");
      box.className = "tableau";
      t.parentNode.insertBefore(box, t);
      box.appendChild(t);
    });
  }

  /* --- 7. Coloration syntaxique (maison, zéro dépendance) --------------- */
  /* On ne colorie QUE les langages reconnus. Un bloc « calcul », « méthode »
     ou un schéma ASCII reste en texte brut : la couleur y nuirait.          */

  function ech(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function jeton(cls, s) {
    return cls ? '<span class="tok-' + cls + '">' + ech(s) + "</span>" : ech(s);
  }

  /* Tokeniseur générique : les règles ne doivent contenir que des groupes
     NON capturants (?:…), sinon la détection de la règle gagnante casse.    */
  function tokeniser(texte, regles) {
    var re = new RegExp(regles.map(function (r) { return "(" + r[1] + ")"; }).join("|"), "g");
    var out = "", dernier = 0, m;
    while ((m = re.exec(texte)) !== null) {
      if (m[0] === "") { re.lastIndex++; continue; }
      if (m.index > dernier) out += ech(texte.slice(dernier, m.index));
      var cls = null;
      for (var i = 1; i < m.length; i++) { if (m[i] !== undefined) { cls = regles[i - 1][0]; break; } }
      out += jeton(cls, m[0]);
      dernier = m.index + m[0].length;
    }
    return out + ech(texte.slice(dernier));
  }

  /* HTML : analyseur dédié — il faut distinguer nom de balise et attributs. */
  var REGLES_INTERIEUR = [
    ["str", "\"[^\"]*\"|'[^']*'"],
    ["att", "[\\w:.-]+(?=\\s*=)"],
    ["pun", "=|\\/?>"],
    ["att", "[\\w:.-]+"]
  ];
  function colorierBalise(s) {
    var m = /^(<\/?)([a-zA-Z][\w:-]*)/.exec(s);
    if (!m) return ech(s);
    return jeton("pun", m[1]) + jeton("key", m[2]) +
           tokeniser(s.slice(m[0].length), REGLES_INTERIEUR);
  }
  function colorierHtml(t) {
    var out = "", i = 0, n = t.length;
    while (i < n) {
      if (t.slice(i, i + 4) === "<!--") {
        var f = t.indexOf("-->", i); f = f < 0 ? n : f + 3;
        out += jeton("com", t.slice(i, f)); i = f; continue;
      }
      if (t.slice(i, i + 2) === "<!") {
        var g = t.indexOf(">", i); g = g < 0 ? n : g + 1;
        out += jeton("met", t.slice(i, g)); i = g; continue;
      }
      if (t[i] === "<" && /[a-zA-Z\/]/.test(t[i + 1] || "")) {
        var j = i + 1, q = null;
        while (j < n) {
          var c = t[j];
          if (q) { if (c === q) q = null; }
          else if (c === '"' || c === "'") q = c;
          else if (c === ">") break;
          j++;
        }
        out += colorierBalise(t.slice(i, Math.min(j + 1, n)));
        i = j + 1; continue;
      }
      var k = t.indexOf("<", i + 1); if (k < 0) k = n;
      out += ech(t.slice(i, k)); i = k;
    }
    return out;
  }

  /* CSS : petit automate — il faut savoir si l'on est dans un bloc, et si
     l'on a passé le « : » (donc côté valeur plutôt que côté propriété).     */
  function colorierCss(t) {
    var out = "", i = 0, n = t.length, dansBloc = false, apresColon = false, m;
    var reste = function () { return t.slice(i); };
    while (i < n) {
      var c = t[i];
      if (c === "/" && t[i + 1] === "*") {
        var f = t.indexOf("*/", i + 2); f = f < 0 ? n : f + 2;
        out += jeton("com", t.slice(i, f)); i = f; continue;
      }
      if (c === '"' || c === "'") {
        var j = i + 1; while (j < n && t[j] !== c && t[j] !== "\n") j++;
        out += jeton("str", t.slice(i, j + 1)); i = j + 1; continue;
      }
      if (c === "{") { dansBloc = true;  apresColon = false; out += jeton("pun", c); i++; continue; }
      if (c === "}") { dansBloc = false; apresColon = false; out += jeton("pun", c); i++; continue; }
      if (c === ";") { apresColon = false; out += jeton("pun", c); i++; continue; }
      if (c === ":") {
        if (dansBloc) { apresColon = true; out += jeton("pun", c); i++; continue; }
        m = /^::?[a-zA-Z][\w-]*/.exec(reste());
        if (m) { out += jeton("val", m[0]); i += m[0].length; continue; }
        out += jeton("pun", c); i++; continue;
      }
      if (c === "@" && (m = /^@[\w-]+/.exec(reste()))) { out += jeton("met", m[0]); i += m[0].length; continue; }
      if (c === "!" && (m = /^!important/.exec(reste())))  { out += jeton("met", m[0]); i += m[0].length; continue; }
      if (c === "#") {
        m = /^#[0-9a-fA-F]{3,8}\b/.exec(reste());
        if (m) { out += jeton("num", m[0]); i += m[0].length; continue; }
        m = /^#[-\w]+/.exec(reste());
        if (m) { out += jeton("key", m[0]); i += m[0].length; continue; }
      }
      if (c === "." && !dansBloc && (m = /^\.[-\w]+/.exec(reste()))) {
        out += jeton("key", m[0]); i += m[0].length; continue;
      }
      if ((m = /^-{0,2}[a-zA-Z][\w-]*/.exec(reste()))) {
        out += jeton(dansBloc ? (apresColon ? "val" : "att") : null, m[0]);
        i += m[0].length; continue;
      }
      if ((m = /^\d*\.?\d+[a-z%]*/.exec(reste()))) { out += jeton("num", m[0]); i += m[0].length; continue; }
      out += ech(c); i++;
    }
    return out;
  }

  var MOTS = {
    js: "var|let|const|function|return|if|else|for|while|do|switch|case|break|continue|new|this|typeof|instanceof|null|undefined|true|false|class|extends|try|catch|finally|throw|async|await|of|in|document|window|console",
    python: "def|class|return|if|elif|else|for|while|in|not|and|or|import|from|as|with|try|except|finally|raise|lambda|None|True|False|self|print|len|range|str|int|float|list|dict|set|tuple|open|pass|global",
    php: "function|return|if|elseif|else|foreach|for|while|do|switch|case|break|continue|echo|print|require|include|require_once|include_once|class|new|public|private|protected|static|try|catch|finally|throw|null|true|false|array|isset|empty|unset|die|exit",
    sql: "SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DATABASE|ALTER|DROP|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|ON|AS|AND|OR|NOT|NULL|ORDER|BY|GROUP|HAVING|LIMIT|DISTINCT|COUNT|SUM|AVG|MIN|MAX|PRIMARY|KEY|FOREIGN|REFERENCES|INT|VARCHAR|TEXT|DATE|BOOLEAN|DEFAULT|AUTO_INCREMENT|LIKE|BETWEEN|IN|EXISTS|UNION",
    bash: "sudo|apt|apt-get|install|update|upgrade|systemctl|service|restart|start|stop|enable|status|nano|vim|cat|less|ls|cd|pwd|mkdir|rmdir|rm|cp|mv|touch|chmod|chown|grep|find|which|man|echo|export|source|tar|unzip|wget|curl|ssh|scp|ping|ipconfig|ifconfig|traceroute|tracert|netstat|nslookup|arp|route|python|python3|pip|node|npm|git|md5sum|john|zip2john",
    algo: "Algorithme|Constantes?|Variables?|D\u00e9but|Fin(?:Si|Pour|TantQue|Fonction)?|Si|Alors|Sinon|Pour|allant|de|\u00e0|Tant que|R\u00e9p\u00e9ter|Jusqu'\u00e0|Fonction|Retourner|Lire|Afficher|ET|OU|NON|Vrai|Faux|entier|r\u00e9el|caract\u00e8re|cha\u00eene|bool\u00e9en|tableau",
    cisco: "interface|ip|address|no|shutdown|description|switchport|mode|access|trunk|vlan|encapsulation|dot1q|native|router|rip|version|network|default-gateway|route|nat|inside|outside|source|list|pool|overload|permit|deny|access-list|hostname|enable|secret|password|configure|terminal|line|console|vty|login|service|banner|copy|running-config|startup-config|show|exit|end|write|memory|duplex|speed|helper-address|dhcp|excluded-address|domain-name|dns-server|default-router|username|transport|input|ssh|telnet|spanning-tree|portfast|vtp|name|state|priority|brief|netmask|passive-interface|clock|bandwidth"
  };
  function motsCles(l) { return "\\b(?:" + MOTS[l] + ")\\b"; }
  var IP = "\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b";

  var REGLES = {
    js: [["com", "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/"],
         ["str", "\"[^\"\\n]*\"|'[^'\\n]*'|`[^`]*`"],
         ["key", motsCles("js")],
         ["att", "\\b[A-Za-z_$][\\w$]*(?=\\s*\\()"],
         ["num", "\\b\\d+(?:\\.\\d+)?\\b"],
         ["pun", "[{}()\\[\\];,.]"]],
    python: [["com", "#[^\\n]*"],
         ["str", "\"\"\"[\\s\\S]*?\"\"\"|'''[\\s\\S]*?'''|\"[^\"\\n]*\"|'[^'\\n]*'"],
         ["met", "@[\\w.]+"],
         ["key", motsCles("python")],
         ["att", "\\b[A-Za-z_][\\w]*(?=\\s*\\()"],
         ["num", "\\b\\d+(?:\\.\\d+)?\\b"],
         ["pun", "[{}()\\[\\]:;,.]"]],
    php: [["com", "\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/"],
         ["met", "<\\?php|\\?>"],
         ["str", "\"[^\"\\n]*\"|'[^'\\n]*'"],
         ["val", "\\$[A-Za-z_]\\w*"],
         ["key", motsCles("php")],
         ["num", "\\b\\d+(?:\\.\\d+)?\\b"],
         ["pun", "[{}()\\[\\];,.]"]],
    sql: [["com", "--[^\\n]*"],
         ["str", "'[^'\\n]*'"],
         ["key", "\\b(?:" + MOTS.sql + ")\\b"],
         ["num", "\\b\\d+(?:\\.\\d+)?\\b"],
         ["pun", "[();,*]"]],
    bash: [["com", "[\u2190\u2192][^\\n]*"],
         ["com", "#[^\\n]*"],
         ["str", "\"[^\"\\n]*\"|'[^'\\n]*'"],
         ["num", IP],
         ["key", motsCles("bash")],
         ["val", "(?:^|\\s)-{1,2}[A-Za-z][\\w-]*"],
         ["num", "\\b\\d+\\b"]],
    cisco: [["com", "[\u2190\u2192][^\\n]*"],
         ["com", "![^\\n]*"],
         /* le prompt « Switch(config-if)# » n'est pas une commande : on le neutralise */
         ["pun", "(?:^|\\n)[A-Za-z][\\w.-]*(?:\\([\\w-]+\\))?[>#]"],
         ["str", "\"[^\"\\n]*\""],
         ["num", IP],
         ["key", motsCles("cisco")],
         ["num", "\\b\\d+\\b"]],
    algo: [["com", "\\/\\/[^\\n]*"],
         ["str", "\"[^\"\\n]*\""],
         ["key", motsCles("algo")],
         ["met", "\u2190"],
         ["att", "\\b[A-Za-z_][\\wÀ-ÿ]*(?=\\s*\\()"],
         ["num", "\\b\\d+(?:[.,]\\d+)?\\b"],
         ["pun", "[()\\[\\],;]|[<>=\u2260\u2264\u2265+*/%-]"]],
    conf: [["com", "[\u2190\u2192][^\\n]*"],
         ["com", "#[^\\n]*"],
         ["str", "\"[^\"\\n]*\""],
         ["num", IP],
         ["att", "(?:^|\\n)[ \\t]*[A-Za-z][\\w-]*"],
         ["num", "\\b\\d+\\b"]]
  };

  function langueDe(bloc, code) {
    var e = bloc.querySelector(".langue");
    var t = (bloc.getAttribute("data-lang") || (e ? e.textContent : "")).toLowerCase();
    if (t) {
      if (/cisco|\bios\b/.test(t))                    return "cisco";
      if (/^\/etc\//.test(t))                         return "conf";
      if (/bash|shell|powershell|terminal|windows/.test(t)) return "bash";
      if (/\bhtml\b|\.html/.test(t))                  return "html";
      if (/\bcss\b|\.css/.test(t))                    return "css";
      if (/javascript|\bjs\b|\.js/.test(t))           return "js";
      if (/python|\.py\b/.test(t))                    return "python";
      if (/\bphp\b/.test(t))                          return "php";
      if (/\bsql\b/.test(t))                          return "sql";
      if (/algo|pseudo/.test(t))                      return "algo";
      // étiquette en français (« calcul », « méthode »…) : on retombe sur
      // la détection par le contenu, qui reste prudente.
    }
    // sans étiquette reconnue : on ne devine que si c'est franc
    if (/<\/[a-zA-Z][\w-]*>|<!DOCTYPE/i.test(code))                     return "html";
    if (/[^\n]*\{[^}]*:[^;]*;/.test(code) || /@media/.test(code))       return "css";
    return null;
  }

  function coloriserCode() {
    document.querySelectorAll(".bloc-code pre code").forEach(function (code) {
      var bloc = code.closest(".bloc-code");
      if (!bloc || code.getAttribute("data-colorie")) return;
      var brut = code.textContent;
      var l = langueDe(bloc, brut);
      if (!l) return;
      var html = l === "html" ? colorierHtml(brut)
               : l === "css"  ? colorierCss(brut)
               : tokeniser(brut, REGLES[l]);
      code.innerHTML = html;
      code.setAttribute("data-colorie", l);
    });
  }

  /* --- 8. Démonstrations : le code à gauche, le résultat à droite -------- */
  var STYLE_APERCU =
    'body{margin:0;padding:14px;font:14px/1.55 -apple-system,BlinkMacSystemFont,' +
    '"Segoe UI",Roboto,sans-serif;color:#2F2F2F;background:#fff}' +
    'img{max-width:100%}*{box-sizing:border-box}';

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || !d.__apercu) return;
    var c = document.querySelector('iframe[data-jeton="' + d.__apercu + '"]');
    if (c) c.style.height = Math.max(70, Math.min(d.h, 460)) + "px";
  });

  function apercus() {
    document.querySelectorAll(".demo").forEach(function (demo) {
      if (demo.querySelector(".apercu")) return;
      var code = demo.querySelector(".bloc-code pre code");
      if (!code) return;
      var src = code.textContent;
      var type = demo.getAttribute("data-apercu") || "html";
      var gabarit = demo.querySelector("template.markup");
      var balisage = gabarit ? gabarit.innerHTML : "";
      var doc;
      if (type === "css") {
        doc = "<style>" + STYLE_APERCU + src + "</style>" + balisage;
      } else if (type === "js") {
        /* le balisage d'abord, puis le script : il doit trouver le DOM en place */
        doc = "<style>" + STYLE_APERCU + "</style>" + balisage +
              "<script>" + src + "<\/script>";
      } else {
        doc = "<style>" + STYLE_APERCU + "</style>" + src;
      }

      /* Les démos JS doivent EXÉCUTER du script. On leur donne « allow-scripts »
         SANS « allow-same-origin » : le code tourne, mais dans une origine opaque,
         donc il ne peut pas toucher à la page qui l'héberge. En contrepartie on ne
         peut plus mesurer sa hauteur directement : l'iframe nous la poste. */
      var estJs = (type === "js");
      if (estJs) {
        var jeton = "d" + Math.random().toString(36).slice(2, 9);
        doc += '<script>(function(){function h(){parent.postMessage(' +
               '{__apercu:"' + jeton + '",h:document.documentElement.scrollHeight},"*");}' +
               'addEventListener("load",h);setTimeout(h,60);' +
               'addEventListener("click",function(){setTimeout(h,30);});})();<\/script>';
      }

      var boite = document.createElement("div");
      boite.className = "apercu";
      var lab = document.createElement("div");
      lab.className = "etiquette";
      lab.textContent = "Résultat dans le navigateur";
      var cadre = document.createElement("iframe");
      cadre.setAttribute("title", "Aperçu du résultat");
      cadre.setAttribute("loading", "lazy");
      cadre.setAttribute("sandbox", estJs ? "allow-scripts" : "allow-same-origin");
      if (estJs) {
        cadre.setAttribute("data-jeton", jeton);
        cadre.style.height = "150px";
      }
      cadre.srcdoc = "<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"utf-8\"></head><body>"
                   + doc + "</body></html>";
      cadre.addEventListener("load", function () {
        try {
          var h = cadre.contentDocument.documentElement.scrollHeight;
          cadre.style.height = Math.max(70, Math.min(h, 460)) + "px";
        } catch (e) { cadre.style.height = "160px"; }
      });
      /* Hauteur de départ au plancher : « scrollHeight » ne descend jamais
         sous la hauteur du cadre, donc partir de 120 px ferait mesurer 120 px
         à une démonstration qui n'en fait que 80. On part du plancher. */
      cadre.style.height = "70px";
      boite.appendChild(lab); boite.appendChild(cadre);
      demo.appendChild(boite);
    });
  }

  function init() {
    tableauxDefilables();
    construireSommaire();
    sommaireMobile();
    coloriserCode();
    apercus();
    boutonsCopier();
    quiz();
    suivreLecture();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
