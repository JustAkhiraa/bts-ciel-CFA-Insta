/* ═══════════════════════════════════════════════════════════════════════
   RÉVISION DU JOUR
   Les questions de tous les QCM du site, revues à intervalles croissants.

   Trois principes, et rien d'autre :
     · SE RAPPELER plutôt que relire. On répond avant de voir l'explication ;
       c'est l'effort de rappel qui fixe, pas la relecture ;
     · ESPACER. Une bonne réponse fait monter la question d'une boîte, et
       chaque boîte double l'attente : 1, 2, 4, 8, 16, 32, 64 jours. Une
       erreur la renvoie à demain, et elle revient une fois dans la séance ;
     · MÉLANGER. Une séance tire dans plusieurs chapitres à la fois, et deux
       questions voisines ne viennent jamais du même chapitre quand on peut
       l'éviter. Les réponses sont battues : la bonne n'est pas toujours B.

   Tout reste sur l'appareil (« ciel-revision-v1 »). Les questions arrivent
   d'un fichier fabriqué à la publication depuis les QCM des chapitres :
   une question corrigée dans son QCM change d'empreinte et repart à zéro.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var racine = document.getElementById("rv");
  if (!racine) return;

  var CLE = "ciel-revision-v1";
  var INTERVALLES = [0, 1, 2, 4, 8, 16, 32, 64];
  var BOITE_MAX = INTERVALLES.length - 1;
  var MAITRISE = 5;                       // à partir de 16 jours d'écart
  var NOMS = { dev: "Développement", reseau: "Réseaux", maths: "Maths",
               anglais: "Anglais", culture: "Culture G.", physique: "Physique" };
  var LETTRES = "ABCDEFGH";

  function $(s) { return racine.querySelector(s); }
  function jourDe(t) {
    var d = new Date(t);
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  }
  var AUJ = jourDe(Date.now());
  function iso(j) { return new Date(j * 86400000).toISOString().slice(0, 10); }
  function melanger(t) {
    for (var i = t.length - 1; i > 0; i--) {
      var k = Math.floor(Math.random() * (i + 1)), x = t[i]; t[i] = t[k]; t[k] = x;
    }
    return t;
  }
  function empreinte(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function pluriel(n, mot, mots) { return n + " " + (n > 1 ? (mots || mot + "s") : mot); }

  /* ── ce que l'appareil retient ── */
  var E = { c: {}, j: {}, mat: [], taille: 20 };
  try {
    var lu = JSON.parse(localStorage.getItem(CLE) || "null");
    if (lu && typeof lu === "object") {
      if (lu.c && typeof lu.c === "object") E.c = lu.c;
      if (lu.j && typeof lu.j === "object") E.j = lu.j;
      if (Array.isArray(lu.mat)) E.mat = lu.mat;
      if ([10, 20, 30].indexOf(lu.taille) >= 0) E.taille = lu.taille;
    }
  } catch (e) { /* mémoire illisible : on repart de rien, sans casser la page */ }
  function garder() {
    // soixante jours de calendrier suffisent à la série et à la grille
    Object.keys(E.j).forEach(function (k) { if (k < iso(AUJ - 60)) delete E.j[k]; });
    try { localStorage.setItem(CLE, JSON.stringify(E)); } catch (e) {}
  }

  var R = {};
  try { R = JSON.parse(localStorage.getItem("bts-ciel") || "{}") || {}; } catch (e) {}
  var bouger = function () {
    return document.documentElement.dataset.anim !== "0" &&
      !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  /* ── les données ── */
  var CH = [], CARTES = [];
  function estVu(ci) {
    var cle = CH[ci][0];
    if ((R.faits || []).indexOf(cle) >= 0) return true;
    var vus = R.vus || {};
    for (var k in vus) if (k.slice(-cle.length - 1) === "/" + cle) return true;
    return false;
  }
  function choisie(c) { return !E.mat.length || E.mat.indexOf(CH[c.ci][2]) >= 0; }

  /* ── le tableau de bord ── */
  function serie() {
    var n = 0, d = AUJ;
    if (!E.j[iso(d)]) d--;
    while (E.j[iso(d)]) { n++; d--; }
    return n;
  }
  function compter() {
    var t = { dues: 0, neuves: 0, maitrise: 0, total: 0, boites: [0, 0, 0, 0, 0, 0, 0, 0], demain: 0 };
    CARTES.forEach(function (c) {
      if (!choisie(c)) return;
      t.total++;
      var st = E.c[c.id];
      if (!st) { t.neuves++; t.boites[0]++; return; }
      t.boites[Math.min(st[0], BOITE_MAX)]++;
      if (st[1] <= AUJ) t.dues++;
      else if (st[1] === AUJ + 1) t.demain++;
      if (st[0] >= MAITRISE) t.maitrise++;
    });
    return t;
  }
  function peindreBord() {
    var t = compter(), s = serie();
    $("#rv-dues").textContent = t.dues;
    $("#rv-neuves").textContent = t.neuves;
    $("#rv-serie").textContent = s;
    $("#rv-serie-mot").textContent = s > 1 ? "jours d'affilée" : "jour d'affilée";
    $("#rv-maitrise").textContent = t.total ? Math.round(t.maitrise / t.total * 100) + " %" : "0 %";

    var max = Math.max.apply(null, t.boites) || 1;
    var barres = $("#rv-boites").children;
    for (var i = 0; i < barres.length; i++) {
      var n = t.boites[i] || 0;
      barres[i].style.setProperty("--h", (n ? Math.max(6, Math.sqrt(n / max) * 100) : 0) + "%");
      barres[i].querySelector("b").textContent = n;
      barres[i].title = pluriel(n, "question") + (i ? ", revue" + (n > 1 ? "s" : "")
        + " tous les " + INTERVALLES[i] + " j" : " jamais vue" + (n > 1 ? "s" : ""));
    }

    // les quatre dernières semaines, une case par jour
    var cal = $("#rv-cal"), html = "", fin = AUJ, debut = fin - 27;
    for (var d = debut; d <= fin; d++) {
      var n2 = E.j[iso(d)] || 0;
      var niv = n2 === 0 ? 0 : n2 < 10 ? 1 : n2 < 20 ? 2 : n2 < 35 ? 3 : 4;
      html += '<i data-n="' + niv + '"' + (d === AUJ ? ' data-auj="1"' : "")
        + ' title="' + iso(d) + " : " + pluriel(n2, "réponse") + '"></i>';
    }
    cal.innerHTML = html;

    var b = $("#rv-go"), n3 = Math.min(E.taille, t.dues + t.neuves);
    b.disabled = !n3;
    b.querySelector("span").textContent = !n3 ? "Tout est à jour"
      : t.dues >= E.taille ? "Revoir " + pluriel(E.taille, "question")
      : t.dues ? "Revoir " + t.dues + ", et " + pluriel(n3 - t.dues, "nouvelle")
      : "Commencer : " + pluriel(n3, "question");
    $("#rv-conseil").textContent = !t.total ? "Aucune question dans ces matières."
      : t.dues ? "Les questions à revoir passent d'abord ; les nouvelles complètent la séance."
      : t.neuves ? "Rien à revoir aujourd'hui. La séance tire de nouvelles questions dans les chapitres déjà ouverts."
      : "Toutes les questions de ces matières sont en cours. Revenez demain : " + pluriel(t.demain, "question") + " reviendront.";
  }

  function peindreFiltres() {
    var presentes = {};
    CH.forEach(function (c) { presentes[c[2]] = 1; });
    var boite = $("#rv-mats"), html = '<button type="button" data-mat="" aria-pressed="' + (!E.mat.length) + '">Tout</button>';
    Object.keys(NOMS).forEach(function (m) {
      if (!presentes[m]) return;
      html += '<button type="button" data-mat="' + m + '" aria-pressed="' + (E.mat.indexOf(m) >= 0) + '">' + NOMS[m] + "</button>";
    });
    boite.innerHTML = html;
    var tailles = $("#rv-taille").querySelectorAll("button");
    for (var i = 0; i < tailles.length; i++)
      tailles[i].setAttribute("aria-pressed", String(+tailles[i].dataset.n === E.taille));
  }
  $("#rv-mats").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var m = b.dataset.mat;
    if (!m) E.mat = [];
    else {
      var i = E.mat.indexOf(m);
      if (i >= 0) E.mat.splice(i, 1); else E.mat.push(m);
      // toutes cochées une à une, c'est « Tout »
      var nb = Object.keys(NOMS).filter(function (k) { return CH.some(function (c) { return c[2] === k; }); }).length;
      if (E.mat.length >= nb) E.mat = [];
    }
    garder(); peindreFiltres(); peindreBord();
  });
  $("#rv-taille").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    E.taille = +b.dataset.n; garder(); peindreFiltres(); peindreBord();
  });

  /* ── bâtir une séance ── */
  function batir(n) {
    var dues = [], neuves = [];
    CARTES.forEach(function (c) {
      if (!choisie(c)) return;
      var st = E.c[c.id];
      if (!st) neuves.push(c); else if (st[1] <= AUJ) dues.push(c);
    });
    dues.sort(function (a, b) {
      var x = E.c[a.id], y = E.c[b.id];
      return x[1] - y[1] || x[0] - y[0];
    });
    var pris = dues.slice(0, n);

    if (pris.length < n && neuves.length) {
      /* Les nouvelles : d'abord les chapitres déjà ouverts ou cochés, puis
         les autres ; quatre chapitres à la fois, en tournant. Tirer dans
         soixante chapitres d'un coup, ce serait survoler ; dans un seul,
         ce serait réciter. */
      var parCh = {};
      melanger(neuves).forEach(function (c) { (parCh[c.ci] = parCh[c.ci] || []).push(c); });
      // dans un chapitre, l'ordre du QCM : il va du simple au précis
      Object.keys(parCh).forEach(function (k) { parCh[k].sort(function (a, b) { return a.i - b.i; }); });
      var chs = Object.keys(parCh).map(Number);
      var ordre = melanger(chs.filter(estVu)).concat(melanger(chs.filter(function (c) { return !estVu(c); })));
      var actifs = ordre.splice(0, 4), tour = 0;
      while (pris.length < n && actifs.length) {
        var k = tour % actifs.length, lot = parCh[actifs[k]];
        if (!lot.length) {
          if (ordre.length) actifs[k] = ordre.shift(); else actifs.splice(k, 1);
          continue;
        }
        pris.push(lot.shift());
        tour++;
      }
    }
    return entrelacer(pris).map(function (c) {
      return { c: c, perm: melanger(c.choix.map(function (_, i) { return i; })), rate: false };
    });
  }
  function entrelacer(t) {
    var reste = t.slice(), out = [];
    while (reste.length) {
      var der = out.length ? out[out.length - 1].ci : -1, i = 0;
      while (i < reste.length && reste[i].ci === der) i++;
      if (i === reste.length) i = 0;
      out.push(reste.splice(i, 1)[0]);
    }
    return out;
  }

  /* ── la séance ── */
  var seance = [], pos = 0, repondu = false, justes = 0, vues = 0, erreurs = [];
  var scene = $("#rv-scene"), carte = $("#rv-carte"), dire = $("#rv-dire");

  function demarrer() {
    seance = batir(E.taille);
    if (!seance.length) return;
    pos = 0; justes = 0; vues = 0; erreurs = [];
    $("#rv-accueil").hidden = true;
    $("#rv-fin").hidden = true;
    scene.hidden = false;
    montrer();
    scene.scrollIntoView({ block: "start", behavior: bouger() ? "smooth" : "auto" });
  }
  $("#rv-go").addEventListener("click", demarrer);

  function montrer() {
    var s = seance[pos], c = s.c, ch = CH[c.ci];
    repondu = false;
    $("#rv-pos").textContent = (pos + 1) + " / " + seance.length;
    $("#rv-av").style.width = (pos / seance.length * 100) + "%";
    var st = E.c[c.id];
    var etat = !st ? "Nouvelle" : s.rate ? "Deuxième essai" : "Boîte " + st[0];
    carte.setAttribute("data-matiere", ch[2]);
    carte.innerHTML =
      '<div class="rv-quoi"><a class="rv-ch" href="' + ch[0] + '/cours.html">' + esc(ch[1]) + "</a>"
      + '<span class="rv-etat">' + etat + "</span></div>"
      + '<p class="rv-question">' + c.q + "</p>"
      + '<div class="qcm-opts">' + s.perm.map(function (k, i) {
          return '<button type="button" class="qcm-opt" data-k="' + k + '">'
            + '<span class="qcm-lt">' + LETTRES[i] + "</span><span>" + c.choix[k] + "</span></button>";
        }).join("") + "</div>"
      + '<p class="qcm-why" hidden>' + c.pq + "</p>"
      + '<div class="rv-bas" hidden><button type="button" class="rv-suite">'
      + (pos + 1 < seance.length ? "Question suivante" : "Voir le bilan")
      + ' <kbd>&#9166;</kbd></button></div>';
    carte.classList.remove("juste", "faux", "entre");
    if (bouger()) { void carte.offsetWidth; carte.classList.add("entre"); }
    var premier = carte.querySelector(".qcm-opt");
    if (premier && document.activeElement && scene.contains(document.activeElement)) premier.focus({ preventScroll: true });
  }
  function esc(t) { var d = document.createElement("i"); d.textContent = t; return d.innerHTML; }
  // le texte lu par un lecteur d'écran : les entités rendues, les balises ôtées
  function texteDe(h) { var d = document.createElement("div"); d.innerHTML = h; return d.textContent; }

  carte.addEventListener("click", function (e) {
    var o = e.target.closest(".qcm-opt");
    if (o) return repondre(o);
    if (e.target.closest(".rv-suite")) suivante();
  });

  function repondre(bouton) {
    if (repondu) return;
    repondu = true;
    var s = seance[pos], c = s.c, k = +bouton.dataset.k, juste = k === c.bon;
    carte.querySelectorAll(".qcm-opt").forEach(function (o) {
      o.disabled = true;
      var kk = +o.dataset.k;
      if (kk === c.bon) o.classList.add("bon");
      else if (o === bouton) o.classList.add("faux");
      else o.classList.add("pale");
    });
    /* Une carte mal formée ne doit pas arrêter la séance : l'explication
       et le bouton sont cherchés, pas supposés. */
    var why = carte.querySelector(".qcm-why"), basC = carte.querySelector(".rv-bas");
    if (why) why.hidden = false;
    if (basC) basC.hidden = false;
    carte.classList.add(juste ? "juste" : "faux");

    var st = E.c[c.id] || [0, AUJ, 0, 0];
    st[2]++;
    if (juste) {
      if (!s.rate) { st[0] = Math.min(BOITE_MAX, st[0] + 1); st[3]++; }
      else st[0] = Math.max(1, st[0]);
      st[1] = AUJ + INTERVALLES[st[0]];
    } else {
      st[0] = 1; st[1] = AUJ + 1;
      if (!s.rate) {
        // elle revient une fois dans la séance, quatre questions plus loin
        seance.splice(Math.min(pos + 4, seance.length), 0,
          { c: c, perm: melanger(s.perm.slice()), rate: true });
        erreurs.push(c);
      }
    }
    E.c[c.id] = st;
    E.j[iso(AUJ)] = (E.j[iso(AUJ)] || 0) + 1;
    garder();
    if (!s.rate) { vues++; if (juste) justes++; }
    dire.textContent = (juste ? "Juste. " : "Faux. La bonne réponse : " + texteDe(c.choix[c.bon]) + ". ")
      + (juste ? "Prochaine fois dans " + pluriel(INTERVALLES[st[0]], "jour") + "." : "Elle revient demain.");
    var suite = carte.querySelector(".rv-suite");
    if (suite) suite.focus({ preventScroll: true });
    /* Au téléphone, l'explication pousse le bouton sous la barre du bas :
       on l'amène à l'écran, sans rien faire bouger s'il y est déjà. */
    var bas = carte.querySelector(".rv-bas");
    if (bas && bas.scrollIntoView) bas.scrollIntoView({ block: "nearest", behavior: bouger() ? "smooth" : "auto" });
  }

  function suivante() {
    if (!repondu) return;
    pos++;
    if (pos >= seance.length) return bilan();
    montrer();
  }

  function bilan() {
    scene.hidden = true;
    var fin = $("#rv-fin"), pc = vues ? Math.round(justes / vues * 100) : 0;
    fin.hidden = false;
    $("#rv-score").style.setProperty("--p", pc);
    $("#rv-score b").textContent = pc + " %";
    $("#rv-bilan").textContent = justes + " juste" + (justes > 1 ? "s" : "") + " sur " + vues
      + (pc >= 90 ? ". Solide." : pc >= 70 ? ". Bien tenu." : pc >= 50 ? ". Ça vient." : ". Les erreurs reviennent demain : c'est le but.");
    var t = compter();
    $("#rv-demain").textContent = t.demain
      ? "Demain : " + pluriel(t.demain, "question") + " à revoir."
      : "Rien de prévu demain dans ces matières.";
    var vus = {}, liens = [];
    erreurs.forEach(function (c) {
      if (vus[c.ci]) return;
      vus[c.ci] = 1;
      liens.push('<li><a href="' + CH[c.ci][0] + '/cours.html">' + esc(CH[c.ci][1]) + "</a></li>");
    });
    $("#rv-revoir").innerHTML = liens.length
      ? "<p>À relire, pour les questions manquées :</p><ul>" + liens.join("") + "</ul>" : "";
    peindreBord();
    fin.scrollIntoView({ block: "start", behavior: bouger() ? "smooth" : "auto" });
    var b = $("#rv-encore");
    if (b) b.focus({ preventScroll: true });
  }
  $("#rv-encore").addEventListener("click", function () {
    var t = compter();
    if (t.dues + t.neuves) demarrer();
    else { $("#rv-fin").hidden = true; $("#rv-accueil").hidden = false; }
  });
  $("#rv-quitter").addEventListener("click", function () {
    scene.hidden = true; $("#rv-accueil").hidden = false; peindreBord();
  });

  /* Au clavier : A à D ou 1 à 4 pour répondre, Entrée pour continuer. La
     touche est « prise » (preventDefault) : les raccourcis du site lisent
     ensuite ce drapeau et ne font rien. */
  document.addEventListener("keydown", function (e) {
    if (scene.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    var k = e.key.toLowerCase(), i = "abcdefgh".indexOf(k);
    if (i < 0 && /^[1-8]$/.test(k)) i = +k - 1;
    if (!repondu && i >= 0) {
      var o = carte.querySelectorAll(".qcm-opt")[i];
      if (o) { e.preventDefault(); repondre(o); }
    } else if (repondu && (e.key === "Enter" || e.key === " ")) {
      if (a && a.tagName === "A") return;
      e.preventDefault(); suivante();
    }
  });

  /* ── chargement ── */
  var etat = $("#rv-chargement");
  fetch(racine.dataset.donnees, { cache: "no-cache" }).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function (d) {
    CH = d.ch || [];
    (d.q || []).forEach(function (x) {
      var ch = CH[x[0]];
      if (!ch) return;
      CARTES.push({ id: ch[0] + "#" + x[1] + ":" + empreinte(x[2] + "|" + x[3].join("|")),
                    ci: x[0], i: x[1], q: x[2], choix: x[3], bon: x[4], pq: x[5] });
    });
    etat.hidden = true;
    $("#rv-accueil").hidden = false;
    $("#rv-total").textContent = CARTES.length;
    $("#rv-nch").textContent = CH.length;
    peindreFiltres();
    peindreBord();
  }).catch(function () {
    etat.innerHTML = "<b>Les questions ne se chargent pas.</b> Cette page lit un fichier à côté d'elle ;"
      + " ouverte depuis le disque, le navigateur le refuse. En ligne, elle fonctionne.";
  });
})();
