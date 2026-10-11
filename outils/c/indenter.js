/* ═══════════════════════════════════════════════════════════════════════
   Remettre l'alinéa d'un programme C ou C++ — et RIEN d'autre.

   Demandé : un bouton pour obtenir une bonne indentation, parce que la
   faire à la main, une ligne après l'autre, est fastidieux.

   La règle qui tient tout : CETTE FONCTION NE TOUCHE QUE L'ESPACE DE
   DÉBUT DE LIGNE. Elle ne réordonne rien, ne coupe aucune ligne, ne
   déplace aucune accolade, n'ajoute ni ne retire un seul caractère de
   code. C'est ce qui la rend sûre à lancer sur un TP qu'on va rendre :
   le pire qu'elle puisse faire est de mal aligner, jamais de casser.

   Et cette promesse se PROUVE au lieu de se déclarer : « verifier »
   compare l'avant et l'après ligne à ligne, chacune débarrassée de son
   alinéa. Si une seule diffère, l'outil refuse d'écrire. C'est le même
   principe que le raccourcisseur de liens — on relit ce qu'on vient de
   produire avant de le donner.

   Ce qu'elle sait :
     · l'alinéa des accolades, quel que soit le style — « { » en fin de
       ligne ou seule sur la sienne ;
     · le switch, dont les « case » vivent un cran au-dessus de leur
       corps ;
     · un « if » ou un « for » SANS accolade : la ligne qui suit prend un
       cran, et un seul ;
     · une parenthèse restée ouverte : la suite de la condition s'aligne
       un cran plus loin ;
     · les directives du préprocesseur, toujours en colonne zéro.

   Ce qu'elle ne touche pas, et c'est délibéré : l'intérieur d'un
   commentaire de bloc et celui d'une chaîne sur plusieurs lignes. Leur
   espace de début fait partie de leur contenu.
   ═══════════════════════════════════════════════════════════════════════ */
(function (racine) {
  "use strict";

  var PAS = "    ";

  /* Lire une ligne en distinguant le CODE du reste : les accolades d'une
     chaîne ou d'un commentaire ne comptent pas. On ne rend pas le texte
     nettoyé, on rend ce dont l'alinéa a besoin. */
  function lire(ligne, etat) {
    var i = 0, n = ligne.length;
    var code = "";            // la ligne, chaînes et commentaires effacés
    var debutEnCommentaire = etat.bloc;
    var debutEnChaine = etat.chaine !== null;
    while (i < n) {
      var c = ligne[i], d = ligne[i + 1];
      if (etat.bloc) {
        if (c === "*" && d === "/") { etat.bloc = false; i += 2; code += "  "; continue; }
        i++; code += " "; continue;
      }
      if (etat.chaine !== null) {
        if (c === "\\") {
          /* Une barre oblique inverse en FIN de ligne prolonge la chaîne
             sur la suivante ; ailleurs elle échappe le caractère d'après. */
          if (i + 1 >= n) { i++; code += " "; continue; }
          i += 2; code += "  "; continue;
        }
        if (c === etat.chaine) { etat.chaine = null; i++; code += " "; continue; }
        i++; code += " "; continue;
      }
      if (c === "/" && d === "/") { code += Array(n - i + 1).join(" "); break; }
      if (c === "/" && d === "*") { etat.bloc = true; i += 2; code += "  "; continue; }
      if (c === '"' || c === "'") { etat.chaine = c; i++; code += " "; continue; }
      code += c; i++;
    }
    /* Une chaîne non refermée en fin de ligne ne se prolonge QUE si la
       ligne finit par une barre oblique inverse. Sinon c'est une faute de
       frappe, et on ne la propage pas à tout le fichier. */
    if (etat.chaine !== null && !/\\$/.test(ligne)) etat.chaine = null;
    return { code: code, debutEnCommentaire: debutEnCommentaire,
             debutEnChaine: debutEnChaine };
  }

  function compter(code) {
    var ouvre = 0, ferme = 0, par = 0;
    for (var i = 0; i < code.length; i++) {
      var c = code[i];
      if (c === "{") ouvre++;
      else if (c === "}") ferme++;
      else if (c === "(" || c === "[") par++;
      else if (c === ")" || c === "]") par--;
    }
    return { ouvre: ouvre, ferme: ferme, par: par };
  }

  var CONTROLE = /^(if|for|while|else\s+if)\s*\(.*\)\s*$|^else\s*$|^do\s*$/;

  function indenter(texte) {
    var lignes = String(texte).split("\n");
    var etat = { bloc: false, chaine: null };
    var profondeur = 0;       // accolades ouvertes
    var switchs = [];         // pour chacune : est-ce celle d'un switch ?
    var attenteSwitch = false;
    var parOuvertes = 0;      // parenthèses restées ouvertes
    /* Les contrôles SANS accolade en attente. « for » puis « for » puis
       une instruction : la chaîne entière se ferme d'un coup sur cette
       instruction, et chaque maillon vaut un cran. Un simple compteur
       remis à un ne savait compter qu'un seul maillon, et le deuxième
       « for » imbriqué restait collé au premier. */
    var attente = 0;
    var bases = [];           // la valeur héritée à l'ouverture de chaque accolade
    var sortie = [];

    for (var k = 0; k < lignes.length; k++) {
      var brute = lignes[k];
      var suite = parOuvertes > 0;
      var vu = lire(brute, etat);

      /* Recopiées telles quelles, pour deux raisons différentes :

         · l'intérieur d'un commentaire de bloc et celui d'une chaîne
           continuée — leur espace de début fait partie de leur contenu ;

         · la SUITE d'une ligne dont les parenthèses sont restées
           ouvertes. Celle-là est un choix : on l'aligne souvent à la
           main sous la parenthèse ouvrante, et c'est plus lisible que
           n'importe quel cran automatique. Mesuré sur les programmes du
           site : c'était la seule chose que l'outil y abîmait. Ne pas
           dégrader passe avant réaligner. */
      if (vu.debutEnCommentaire || vu.debutEnChaine || suite) {
        sortie.push(brute);
        parOuvertes += compter(vu.code).par;
        if (parOuvertes < 0) parOuvertes = 0;
        continue;
      }

      var corps = brute.replace(/^[ \t]*/, "");
      var code = vu.code.replace(/^[ \t]*/, "").replace(/\s+$/, "");
      if (!corps) { sortie.push(""); continue; }

      /* Une accolade ouvrante seule sur sa ligne APPARTIENT au contrôle
         qui la précède : elle se pose à son niveau et consomme le cran
         provisoire. Sans ça, le style Allman décalait tout le bloc. */
      if (code[0] === "{" && attente > 0) attente -= 1;

      var base = bases.length ? bases[bases.length - 1] : 0;

      if (corps[0] === "#") {                 // le préprocesseur en colonne zéro
        sortie.push(corps);
      } else {
        /* Chaque switch ouvert donne UN cran de plus à tout ce qu'il
           contient, y compris à ce qui est imbriqué plus loin. */
        var bonus = 0;
        for (var b = 0; b < switchs.length; b++) if (switchs[b]) bonus++;
        var niveau = profondeur + bonus + attente;
        if (code[0] === "}") {
          niveau -= 1;
          if (switchs.length && switchs[switchs.length - 1]) niveau -= 1;
          niveau -= attente;                  // le bloc se ferme à son niveau
          niveau += base;
        } else if (switchs.length && switchs[switchs.length - 1]
                   && /^(case\b|default\b)/.test(code)) {
          niveau -= 1;          // l'étiquette vit un cran au-dessus de son corps
        } else if (/^[A-Za-z_]\w*\s*:$/.test(code)) {
          niveau -= 1;          // étiquette de « goto », ou « public: » en C++
        }
        if (niveau < 0) niveau = 0;
        sortie.push(niveau ? Array(niveau + 1).join(PAS) + corps : corps);
      }

      /* ── l'état pour la ligne suivante ──────────────────────────── */
      var c = compter(vu.code);
      if (/\bswitch\s*\(/.test(code)) attenteSwitch = true;

      for (var j = 0; j < vu.code.length; j++) {
        var ch = vu.code[j];
        if (ch === "{") {
          bases.push(attente);
          switchs.push(attenteSwitch);
          attenteSwitch = false;
          profondeur++;
        } else if (ch === "}") {
          switchs.pop();
          attente = bases.length ? bases.pop() : 0;
          profondeur = Math.max(0, profondeur - 1);
        }
      }

      parOuvertes += c.par;
      if (parOuvertes < 0) parOuvertes = 0;

      if (parOuvertes <= 0) {
        var socle = bases.length ? bases[bases.length - 1] : 0;
        if (c.ouvre === 0 && CONTROLE.test(code)) attente += 1;
        else if (/[;}]$/.test(code)) attente = socle;  // l'instruction est finie
      }
    }
    return sortie.join("\n");
  }

  /* La preuve, et non la promesse : rien n'a bougé hors de l'alinéa.
     Même nombre de lignes, et chaque ligne identique une fois son espace
     de début et de fin retiré. */
  function verifier(avant, apres) {
    var a = String(avant).split("\n"), b = String(apres).split("\n");
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].replace(/^[ \t]+/, "").replace(/\s+$/, "")
          !== b[i].replace(/^[ \t]+/, "").replace(/\s+$/, "")) return false;
    }
    return true;
  }

  /* Le point d'entrée de l'outil : il rend le texte réaligné, ou le texte
     D'ORIGINE si la preuve ne passe pas. Mal aligner est un défaut ;
     rendre autre chose que le programme n'en est pas un, c'est une
     perte. */
  function reindenter(texte) {
    var neuf;
    try { neuf = indenter(texte); } catch (e) { return { texte: texte, ok: false }; }
    if (!verifier(texte, neuf)) return { texte: texte, ok: false };
    return { texte: neuf, ok: true, change: neuf !== texte };
  }

  var API = { indenter: indenter, verifier: verifier, reindenter: reindenter, PAS: PAS };
  if (typeof module === "object" && module.exports) module.exports = API;
  else racine.INDENTER = API;
})(typeof self !== "undefined" ? self : this);
