/* ═══════════════════════════════════════════════════════════════════════
   L'ouvrier du mode « JavaScript » : le programme de l'étudiant tourne ICI,
   dans un fil à part, et jamais dans la page.

   La raison est la même que pour le C (ouvrier-execution.js) : une boucle
   sans fin dans la page figerait l'onglet, et plus rien — pas même le
   bouton Arrêter — ne répondrait. Dans un ouvrier, la page reste libre et
   peut le supprimer au bout de cinq secondes.

   Ce qu'on offre au programme, en plus du langage :
     · console.log, .table, .error… (console-js.js), comme dans le F12 ;
     · prompt(), confirm(), alert() — sans boîte de dialogue : la question
       s'écrit dans la console et la réponse se tape dessous. Un ouvrier ne
       sait pas s'arrêter pour attendre une frappe, alors on fait comme pour
       le C : le programme est REJOUÉ depuis le début avec la réponse en
       plus. Math.random reçoit une graine fixe pour toute la partie, sinon
       un programme qui tire un nombre au hasard changerait d'avis à chaque
       reprise ;
     · setTimeout et setInterval, comptés : le programme est « fini » quand
       il n'en reste plus en attente.
   Ce qu'il n'a PAS : document, window, la page. C'est le mode « Web » qui
   les donne — et le message d'erreur le dit.
   ═══════════════════════════════════════════════════════════════════════ */
importScripts("console-js.js");

self.onmessage = function (e) {
  "use strict";
  var d = e.data;
  var entrees = d.entrees || [];
  var envoyer = function (m) { self.postMessage(m); };
  fabriqueConsole(self, envoyer);

  // un hasard reproductible (mulberry32) : les reprises voient les mêmes tirages
  var graine = d.graine >>> 0;
  Math.random = function () {
    graine = (graine + 0x6D2B79F5) | 0;
    var t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  var ARRET = { arret: true };
  var lus = 0, attend = false, termine = false;
  function finir() {
    if (termine) return;
    termine = true;
    envoyer({ t: "fini", attente: attend });
  }
  /* Où est la faute : la pile de l'erreur porte « programme.js:LIGNE:COL »
     grâce au sourceURL posé sur le programme. */
  function erreur(err) {
    if (err === ARRET) return;
    var msg, nom = "Error", ligne = 0, colonne = 0;
    if (err && typeof err === "object") {
      nom = err.name || "Error";
      msg = err.message !== undefined ? String(err.message) : String(err);
      var m = /programme\.js:(\d+):(\d+)/.exec(String(err.stack || ""));
      if (m) { ligne = +m[1]; colonne = +m[2]; }
    } else { msg = "exception non attrapée : " + String(err); nom = "Uncaught"; }
    envoyer({ t: "erreur", nom: nom, message: msg, ligne: ligne, colonne: colonne });
  }

  self.prompt = function (question) {
    if (question !== undefined && question !== null && String(question) !== "")
      envoyer({ t: "console", niveau: "question", texte: String(question) });
    if (lus < entrees.length) return entrees[lus++];
    if (d.finEntree) return null;
    attend = true;
    envoyer({ t: "attente" });
    throw ARRET;
  };
  self.alert = function (m) { envoyer({ t: "console", niveau: "alerte", texte: m === undefined ? "" : String(m) }); };
  self.confirm = function (q) {
    var r = self.prompt((q === undefined ? "" : String(q)) + " (o/n)");
    return r !== null && /^\s*(o|oui|y|yes|1|v|vrai|true)/i.test(r);
  };

  // les minuteries, comptées : sans elles, impossible de savoir quand c'est fini
  var vrai = { st: self.setTimeout, ct: self.clearTimeout, si: self.setInterval, ci: self.clearInterval };
  var actives = new Set();
  function peutEtreFini() {
    if (actives.size || termine) return;
    vrai.st.call(self, function () { if (!actives.size) finir(); }, 0);
  }
  function appeler(f, args) {
    try { if (typeof f === "function") f.apply(self, args); else (0, eval)(String(f)); }
    catch (err) { if (err === ARRET) { finir(); return; } erreur(err); }
  }
  self.setTimeout = function (f, delai) {
    var args = Array.prototype.slice.call(arguments, 2);
    var id = vrai.st.call(self, function () { actives.delete(id); if (termine) return; appeler(f, args); peutEtreFini(); }, delai);
    actives.add(id);
    return id;
  };
  self.clearTimeout = function (id) { actives.delete(id); vrai.ct.call(self, id); peutEtreFini(); };
  self.setInterval = function (f, delai) {
    var args = Array.prototype.slice.call(arguments, 2);
    var id = vrai.si.call(self, function () { if (termine) return; appeler(f, args); }, delai);
    actives.add(id);
    return id;
  };
  self.clearInterval = function (id) { actives.delete(id); vrai.ci.call(self, id); peutEtreFini(); };
  self.addEventListener("unhandledrejection", function (ev) { ev.preventDefault(); erreur(ev.reason); });

  var source = d.code + "\n//# sourceURL=programme.js\n";
  var url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    importScripts(url);
  } catch (err) {
    URL.revokeObjectURL(url);
    if (err === ARRET) { finir(); return; }
    if (err && err.name === "SyntaxError") { localiserSyntaxe(source, err); return; }
    erreur(err);
    finir();
    return;
  }
  URL.revokeObjectURL(url);
  peutEtreFini();

  /* Une faute de syntaxe, importScripts la jette SANS sa ligne. Un ouvrier
     dont c'est le script principal, lui, la rapporte avec ligne et colonne
     (ErrorEvent). Le programme ne peut pas s'y exécuter : il ne se lit pas. */
  function localiserSyntaxe(texte, err) {
    var brut = String(err.message).replace(/^Failed to execute 'importScripts'[^:]*:\s*/, "");
    var fait = false;
    var conclure = function (message, ligne, colonne) {
      if (fait) return;
      fait = true;
      envoyer({ t: "erreur", nom: "SyntaxError", message: message, ligne: ligne || 0, colonne: colonne || 0 });
      finir();
    };
    try {
      var u = URL.createObjectURL(new Blob([texte], { type: "text/javascript" }));
      var w = new Worker(u);
      w.onerror = function (ev) {
        ev.preventDefault();
        w.terminate();
        URL.revokeObjectURL(u);
        conclure(String(ev.message || brut).replace(/^Uncaught SyntaxError:\s*/, ""), ev.lineno, ev.colno);
      };
      vrai.st.call(self, function () { w.terminate(); conclure(brut, 0, 0); }, 1500);
    } catch (e2) { conclure(brut, 0, 0); }
  }
};
