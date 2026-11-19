/* Le lecteur de fichiers .pkt : la page.

   Trois vues, une seule question chacune.
   - « À faire » (un .pka, ou deux fichiers) : ce qui sépare votre travail du
     corrigé, rangé par appareil, chaque action avec ses valeurs ou ses
     commandes à taper, et une case à cocher pour suivre où l'on en est.
   - « Appareils » : chaque appareil sur une rangée ; on l'ouvre pour ses
     adresses, ses câbles et sa configuration.
   - « Schéma » : le réseau dessiné. Au-delà de 1000 px il reste affiché à
     droite, et la vue disparaît des onglets.

   Le fichier ne quitte jamais la page : pkt.js le décode, analyse.js le lit. */
(function () {
  "use strict";
  var L = window.LecteurPKT, PKT = window.PKT;
  var racine = document.getElementById("lecteur");
  if (!racine || !L || !PKT) return;

  var $ = function (s) { return racine.querySelector(s); };
  var CLE = "ciel-lecteur-pkt";
  var LABO = document.documentElement.getAttribute("data-labo") || "labo.html";
  var large = window.matchMedia("(min-width: 1000px)");

  var etat = { sources: [], fichiers: [], mode: null, vue: "appareils", reseau: 0, ouvert: null,
               modeles: [], items: [], prog: null, cible: null, depart: null, zoom: null };

  /* ── petits outils ── */
  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) ajouter(e, arguments[i]);
    return e;
  }
  function ajouter(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { ajouter(e, x); }); return; }
    e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  var NS = "http://www.w3.org/2000/svg";
  function s(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return e;
  }
  function pluriel(n, mot, motPl) { return n + " " + (n > 1 ? (motPl || mot + "s") : mot); }
  function lireStockage() { try { return JSON.parse(localStorage.getItem(CLE) || "{}"); } catch (e) { return {}; } }
  function ecrireStockage(o) { try { localStorage.setItem(CLE, JSON.stringify(o)); } catch (e) { /* stockage bloqué */ } }

  /* ── les icônes des appareils : un trait, une couleur par famille ── */
  var ICONES = {
    routeur: '<circle cx="12" cy="12" r="7.5"/><path d="M8.5 12h7M12 8.5v7M14 10l1.5 2-1.5 2M10 10l-1.5 2 1.5 2"/>',
    commutateur: '<rect x="3" y="7.5" width="18" height="9" rx="2"/><path d="M7 10.5h8.5m-2-1.6 2 1.6-2 1.6M17 13.5H8.5m2-1.6-2 1.6 2 1.6"/>',
    l3: '<rect x="3" y="7.5" width="18" height="9" rx="2"/><path d="M7 10.5h8.5m-2-1.6 2 1.6-2 1.6M17 13.5H8.5m2-1.6-2 1.6 2 1.6"/><path d="M12 4.5v3"/>',
    concentrateur: '<rect x="3" y="9" width="18" height="6" rx="2"/><path d="M7 12h10"/>',
    pc: '<rect x="4" y="4.5" width="16" height="11" rx="1.6"/><path d="M9 19.5h6M12 15.5v4"/>',
    portable: '<rect x="5.5" y="5.5" width="13" height="9" rx="1.4"/><path d="M3 17.5h18l-1.4 1.6H4.4z"/>',
    serveur: '<rect x="6.5" y="3.5" width="11" height="17" rx="1.6"/><path d="M9 8h6M9 11.5h6"/><circle cx="12" cy="16.5" r=".9"/>',
    sansfil: '<rect x="3.5" y="12.5" width="17" height="6.5" rx="1.8"/><path d="M7.5 12.5V8M16.5 12.5V8M9 6.2a4.4 4.4 0 0 1 6 0"/>',
    ap: '<rect x="5" y="13.5" width="14" height="5.5" rx="1.8"/><path d="M8.3 10.4a5.2 5.2 0 0 1 7.4 0M5.9 7.9a8.6 8.6 0 0 1 12.2 0"/>',
    nuage: '<path d="M7.5 18.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.4-1.4 4.4 4.4 0 0 1-.3 9.4z"/>',
    parefeu: '<rect x="4" y="5" width="16" height="14" rx="1.6"/><path d="M4 9.7h16M4 14.3h16M9.5 5v4.7M14.5 9.7v4.6M9.5 14.3V19"/>',
    modem: '<rect x="4" y="9" width="16" height="8" rx="1.8"/><path d="M8 13h.01M11 13h.01M15 6.5l2-2"/>',
    cable: '<path d="M3.5 16.5c4.5 0 4-9 8.5-9s4 9 8.5 9"/><circle cx="3.5" cy="16.5" r="1.4"/><circle cx="20.5" cy="16.5" r="1.4"/>',
    autre: '<rect x="5" y="5" width="14" height="14" rx="2.4"/><path d="M10 10a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.6M12 16v.01"/>'
  };
  function icone(famille) {
    var g = el("span", { class: "pk-tuile", "data-fam": famille, "aria-hidden": "true" });
    g.innerHTML = '<svg viewBox="0 0 24 24">' + (ICONES[famille] || ICONES.autre) + "</svg>";   // icônes écrites ici, jamais du fichier
    return g;
  }

  /* ── ouvrir un ou deux fichiers ── */
  function message(t, faute) {
    var m = $("#pk-message");
    m.textContent = t || "";
    m.hidden = !t;
    m.classList.toggle("pk-faute", !!faute);
  }
  function lireUn(src) {
    return PKT.decoder(src.octets).then(function (xml) {
      var f = L.lire(xml);
      f.nom = src.nom; f.xml = xml;
      return f;
    }, function (e) {
      throw new Error("« " + src.nom + " » ne se lit pas : " + (e instanceof PKT.FormatInconnu ? e.message : "ce n'est pas un fichier .pkt ou .pka") + ".");
    });
  }
  function ouvrir(sources) {
    sources = sources.slice(0, 2);
    racine.classList.add("pk-occupe");
    message("Lecture de " + (sources.length > 1 ? "deux fichiers" : "« " + sources[0].nom + " »") + "…");
    var lus = [];
    var chaine = Promise.resolve();
    sources.forEach(function (src) { chaine = chaine.then(function () { return lireUn(src).then(function (f) { lus.push(f); }); }); });
    return chaine.then(function () {
      etat.sources = sources; etat.fichiers = lus;
      preparer();
      message("");
      afficher();
    }).catch(function (e) {
      message(e.message, true);
    }).then(function () { racine.classList.remove("pk-occupe"); });
  }
  function depuisListe(liste, comparer) {
    var fichiers = Array.prototype.slice.call(liste || [], 0, 2);
    if (!fichiers.length) return;
    Promise.all(fichiers.map(function (f) {
      return f.arrayBuffer().then(function (b) { return { nom: f.name, octets: new Uint8Array(b) }; });
    })).then(function (sources) {
      if (comparer && etat.sources.length && sources.length === 1) sources.unshift(etat.sources[0]);
      ouvrir(sources);
    });
  }
  // L'appli « Lecteur PKT » du Mac ouvre une copie de cette page, fichier embarqué.
  window.ouvrirEmbarque = function (liste) {
    var octetsDe = function (b64) { var x = atob(b64), u = new Uint8Array(x.length); for (var i = 0; i < x.length; i++) u[i] = x.charCodeAt(i); return u; };
    ouvrir(liste.map(function (p) { return { nom: new TextDecoder().decode(octetsDe(p[0])), octets: octetsDe(p[1]) }; }));
  };

  function preparer() {
    var A = etat.fichiers[0], B = etat.fichiers[1];
    etat.ouvert = null; etat.zoom = null;
    if (B) {
      etat.mode = "comparer";
      etat.modeles = [{ titre: "Avant", m: A.reseaux[0], nom: A.nom }, { titre: "Après", m: B.reseaux[0], nom: B.nom }];
      etat.items = L.aFaire(A.reseaux[0], B.reseaux[0]);
      etat.cible = B.reseaux[0]; etat.depart = A.reseaux[0]; etat.prog = null;
      etat.vue = "faire"; etat.reseau = 0;
    } else if (A.activite && A.reseaux.length === 3) {
      etat.mode = "pka";
      var r = A.reseaux;
      etat.modeles = [{ titre: "Votre travail", m: r[0] }, { titre: "Corrigé", m: r[2] }, { titre: "Départ", m: r[1] }];
      etat.prog = L.progression(r[1], r[0], r[2]);
      etat.items = etat.prog.reste;
      etat.cible = r[2]; etat.depart = r[0];
      etat.vue = "faire"; etat.reseau = 0;
    } else {
      etat.mode = "pkt";
      etat.modeles = A.reseaux.map(function (m, k) { return { titre: A.reseaux.length > 1 ? "Réseau " + (k + 1) : "Réseau", m: m }; });
      etat.items = []; etat.prog = null; etat.cible = null; etat.depart = null;
      etat.vue = "appareils"; etat.reseau = 0;
    }
  }

  /* ── l'affichage ── */
  function afficher() {
    racine.dataset.etat = "fichier";
    $("#pk-depot").hidden = true;
    $("#pk-vue").hidden = false;
    rendreTete();
    rendreOnglets();
    rendreVue();
    rendreSchema();
  }

  function rendreTete() {
    var A = etat.fichiers[0], B = etat.fichiers[1];
    var t = $("#pk-tete");
    t.replaceChildren();
    var nature = etat.mode === "pka" ? "Activité .pka" : etat.mode === "comparer" ? "Deux versions" : "Fichier .pkt";
    var m = etat.modeles[etat.mode === "comparer" ? 1 : 0].m;
    var meta = [nature, "version " + A.version.split(".").slice(0, 3).join("."), pluriel(m.apps.length, "appareil"), pluriel(m.cables.length, "câble")];
    t.appendChild(el("div", { class: "pk-tete-nom" },
      el("h2", { class: "pk-fichier", text: B ? A.nom + "  →  " + B.nom : A.nom }),
      el("p", { class: "pk-meta", text: meta.join(" · ") })));
    var actions = el("div", { class: "pk-actions" },
      el("button", { type: "button", class: "pk-b pk-b-plein", id: "pk-labo", onclick: versLabo },
        el("span", { text: "Ouvrir dans le labo" })),
      el("button", { type: "button", class: "pk-b", onclick: function () { choisir(false); }, text: "Autre fichier" }),
      el("button", { type: "button", class: "pk-b", onclick: function () { choisir(true); }, text: B ? "Changer la 2ᵉ version" : "Comparer avec…" }),
      el("button", { type: "button", class: "pk-b pk-b-discret", onclick: enregistrerXml, text: "Enregistrer le XML" }));
    t.appendChild(actions);

    var av = $("#pk-avance");
    av.replaceChildren();
    av.hidden = etat.mode !== "pka";
    if (etat.mode === "pka") {
      var p = etat.prog, faits = p.faits.length, total = p.total || 0;
      var part = total ? faits / total : 1;
      av.appendChild(el("div", { class: "pk-barre", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(faits), "aria-label": "Avancement de l'activité" },
        el("span", { style: "--part:" + part.toFixed(3) })));
      av.appendChild(el("p", { class: "pk-avance-t" },
        p.reste.length ? el("b", { text: faits + " sur " + total + " faits" }) : el("b", { text: "Tout est fait" }),
        p.reste.length ? " · il reste " + pluriel(p.reste.length, "action") + ", d'après votre fichier." : " : votre travail correspond au corrigé."));
    }
  }

  function rendreOnglets() {
    var o = $("#pk-onglets");
    o.replaceChildren();
    var vues = [];
    if (etat.mode !== "pkt") vues.push(["faire", etat.mode === "comparer" ? "Ce qui a changé" : "À faire", etat.items.length]);
    vues.push(["appareils", "Appareils", etat.modeles[etat.reseau].m.apps.length]);
    vues.push(["schema", "Schéma", null]);
    if (large.matches && etat.vue === "schema") etat.vue = vues[0][0];
    vues.forEach(function (v_) {
      o.appendChild(el("button", {
        type: "button", role: "tab", class: "pk-onglet", "data-vue": v_[0], id: "pk-o-" + v_[0],
        "aria-selected": String(etat.vue === v_[0]), "aria-controls": "pk-panneau",
        onclick: function () { etat.vue = v_[0]; rendreOnglets(); rendreVue(); rendreSchema(); }
      }, v_[1], v_[2] != null ? el("span", { class: "pk-compte", text: String(v_[2]) }) : null));
    });
    racine.dataset.vue = etat.vue;
  }

  function rendreVue() {
    var p = $("#pk-panneau");
    p.replaceChildren();
    p.setAttribute("aria-labelledby", "pk-o-" + etat.vue);
    if (etat.vue === "faire") rendreFaire(p);
    else if (etat.vue === "appareils") rendreAppareils(p);
  }

  /* ── À faire ── */
  var OU = {
    "Adresse IP": "Bureau › Configuration IP", "Wi-Fi": "Bureau › PC sans fil",
    "Internet": "Interface web › Configuration de base", "Réseau local": "Interface web › Configuration de base",
    "Serveur DHCP": "Interface web › Configuration de base", "Wi-Fi 2,4 GHz": "Interface web › Sans fil",
    "Administration": "Interface web › Administration"
  };
  function ouFaire(item, app) {
    if (item.genre === "config") return "CLI, en mode configuration";
    if (item.genre === "reglage") {
      if (app && app.famille === "ap") return "Config › Port 1";
      return OU[item.titre] || null;
    }
    return null;
  }
  function coches() { var st = lireStockage(); return (st.coches || {})[cleFichier()] || {}; }
  function cocher(cle, oui) {
    var st = lireStockage();
    st.coches = st.coches || {};
    var c = st.coches[cleFichier()] = st.coches[cleFichier()] || {};
    if (oui) c[cle] = 1; else delete c[cle];
    ecrireStockage(st);
  }
  function cleFichier() { return etat.fichiers.map(function (f) { return f.nom; }).join(" | "); }

  function blocCommandes(lignes, machine) {
    var pre = el("pre", null, el("code", { text: lignes.join("\n") }));
    var b = el("button", { type: "button", class: "copier", "aria-label": "Copier les commandes", text: "Copier" });
    b.addEventListener("click", function () {
      var fini = function (ok) { b.textContent = ok ? "Copié ✓" : "Échec"; b.classList.toggle("fait", ok); setTimeout(function () { b.textContent = "Copier"; b.classList.remove("fait"); }, 1800); };
      var texte = lignes.join("\n");
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texte).then(function () { fini(true); }, function () { fini(false); });
      else {
        var z = el("textarea"); z.value = texte; z.style.position = "fixed"; z.style.opacity = "0";
        document.body.appendChild(z); z.select();
        var ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        z.remove(); fini(ok);
      }
    });
    return el("div", { class: "bloc-code pk-bloc", "data-fam": "cisco", "data-machine": "routeur" },
      el("span", { class: "langue", text: "à taper sur " + machine }), pre, b);
  }

  function rendreItem(item, cochesF) {
    var cible = etat.cible, app = cible && cible.parNom[item.appareil];
    var id = "pk-i-" + Math.abs(hash(item.cle));
    var coche = !!cochesF[item.cle];
    var titre = item.genre === "cable+" || item.genre === "cable-"
      ? [item.titre + " : ", el("b", { text: item.cable.a.nom + " " + L.court(item.cable.pa) }), " ↔ ", el("b", { text: item.cable.b.nom + " " + L.court(item.cable.pb) }), " (" + item.cable.genre + ")"]
      : [item.titre];
    var boite = el("div", { class: "pk-item" + (coche ? " pk-coche" : ""), "data-cle": item.cle, "data-genre": item.genre });
    var case_ = el("input", { type: "checkbox", id: id });
    case_.checked = coche;
    case_.addEventListener("change", function () { cocher(item.cle, case_.checked); boite.classList.toggle("pk-coche", case_.checked); });
    boite.appendChild(el("label", { class: "pk-item-t", for: id }, case_, el("span", { class: "pk-item-lib" }, titre)));
    var ou = ouFaire(item, app);
    if (ou) boite.appendChild(el("p", { class: "pk-ou", text: ou }));
    if (item.valeurs) {
      var dl = el("dl", { class: "pk-valeurs" });
      item.valeurs.forEach(function (x) {
        dl.appendChild(el("div", null, el("dt", { text: x.libelle }),
          el("dd", null, el("b", { text: x.cible || "(vide)" }), el("span", { class: "pk-avant", text: "avant : " + (x.actuel || "rien") }))));
      });
      boite.appendChild(dl);
    }
    if (item.commandes) boite.appendChild(blocCommandes(item.commandes, item.appareil));
    boite.addEventListener("mouseenter", function () { allumer(item.appareil, item.autre); });
    boite.addEventListener("mouseleave", function () { allumer(null); });
    return boite;
  }
  function hash(t) { var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h; }

  function rendreFaire(p) {
    var items = etat.items, cochesF = coches();
    if (etat.mode === "pka" && etat.fichiers[0].consignes.length) {
      p.appendChild(el("details", { class: "pk-consignes" }, el("summary", { text: "Consignes de l'activité" }),
        el("div", { class: "pk-consignes-t", text: etat.fichiers[0].consignes.join("\n\n") })));
    }
    if (!items.length) {
      p.appendChild(el("div", { class: "pk-vide pk-vide-ok" },
        el("p", { class: "pk-vide-t", text: etat.mode === "comparer" ? "Aucune différence." : "Rien ne manque." }),
        el("p", { text: etat.mode === "comparer" ? "Les deux fichiers ont les mêmes appareils, les mêmes câbles et les mêmes réglages." : "Votre travail correspond au corrigé : appareils, câbles, réglages et configurations." })));
    }
    // par appareil, dans l'ordre du réseau d'arrivée ; les câbles à la fin
    var ordre = etat.cible.apps.map(function (a) { return a.nom; });
    etat.depart.apps.forEach(function (a) { if (ordre.indexOf(a.nom) < 0) ordre.push(a.nom); });
    var parApp = {};
    items.forEach(function (it) {
      var k = /^cable/.test(it.genre) ? "\u0000cables" : it.appareil;
      (parApp[k] = parApp[k] || []).push(it);
    });
    ordre.concat(["\u0000cables"]).forEach(function (nom) {
      var liste = parApp[nom];
      if (!liste) return;
      var app = etat.cible.parNom[nom] || etat.depart.parNom[nom];
      var g = el("section", { class: "pk-groupe", "data-nom": nom });
      var tete = el("h3", { class: "pk-groupe-t" },
        nom === "\u0000cables" ? icone("cable") : icone(app ? app.famille : "autre"),
        el("span", { class: "pk-groupe-nom" }, nom === "\u0000cables" ? "Câbles" : nom,
          app ? el("span", { class: "pk-groupe-genre", text: app.genre + (app.modele && app.modele !== app.type ? " " + app.modele : "") }) : null),
        el("span", { class: "pk-compte", text: String(liste.length) }));
      if (app) tete.addEventListener("click", function () { montrerAppareil(nom); });
      g.appendChild(tete);
      liste.forEach(function (it) { g.appendChild(rendreItem(it, cochesF)); });
      p.appendChild(g);
    });
    if (etat.prog && etat.prog.faits.length) {
      var d = el("details", { class: "pk-faits" },
        el("summary", null, "Déjà fait dans votre fichier", el("span", { class: "pk-compte", text: String(etat.prog.faits.length) })));
      var ul = el("ul");
      etat.prog.faits.forEach(function (it) {
        ul.appendChild(el("li", null, el("b", { text: it.appareil }), " · " + (/^cable/.test(it.genre) ? it.titre + " " + it.cable.a.nom + " ↔ " + it.cable.b.nom : it.titre)));
      });
      d.appendChild(ul);
      p.appendChild(d);
    }
  }

  /* ── Appareils ── */
  function rendreAppareils(p) {
    if (etat.modeles.length > 1) {
      var bascule = el("div", { class: "pk-bascule", role: "radiogroup", "aria-label": "Quel réseau afficher" });
      etat.modeles.forEach(function (mo, k) {
        bascule.appendChild(el("button", { type: "button", role: "radio", "aria-checked": String(k === etat.reseau),
          onclick: function () { etat.reseau = k; etat.ouvert = null; rendreOnglets(); rendreVue(); rendreSchema(); } },
          mo.titre, mo.nom ? el("span", { class: "pk-bascule-f", text: mo.nom }) : null));
      });
      p.appendChild(bascule);
    }
    var m = etat.modeles[etat.reseau].m;
    var aFaireParApp = {};
    if (etat.mode === "pka" && etat.reseau === 0) etat.items.forEach(function (it) { aFaireParApp[it.appareil] = (aFaireParApp[it.appareil] || 0) + 1; });
    var liste = el("div", { class: "pk-apps" });
    m.apps.forEach(function (a) { liste.appendChild(rangee(a, m, aFaireParApp[a.nom] || 0)); });
    p.appendChild(liste);
    if (m.multiprises) p.appendChild(el("p", { class: "pk-note", text: pluriel(m.multiprises, "multiprise") + " de la vue physique, sans réglage, ne sont pas listées." }));
  }
  function rangee(a, m, nFaire) {
    var ouvert = etat.ouvert === a.nom;
    var corpsId = "pk-a-" + Math.abs(hash(a.nom));
    var r = el("div", { class: "pk-app" + (ouvert ? " pk-ouvert" : ""), "data-nom": a.nom });
    var b = el("button", { type: "button", class: "pk-app-tete", "aria-expanded": String(ouvert), "aria-controls": corpsId },
      icone(a.famille),
      el("span", { class: "pk-app-nom" }, el("b", { text: a.nom }), el("span", { text: a.genre + (a.modele && a.modele !== a.type ? " " + a.modele : "") })),
      el("span", { class: "pk-app-adr" }, a.resume.slice(0, 2).map(function (x) { return el("span", { text: x }); })),
      nFaire ? el("span", { class: "pk-pastille", text: nFaire + " à faire" }) : null,
      el("span", { class: "pk-chevron", "aria-hidden": "true" }));
    b.addEventListener("click", function () { etat.ouvert = ouvert ? null : a.nom; rendreVue(); rendreSchema(); if (!ouvert) defiler(a.nom); });
    b.addEventListener("mouseenter", function () { allumer(a.nom); });
    b.addEventListener("mouseleave", function () { allumer(null); });
    r.appendChild(b);
    if (ouvert) r.appendChild(detail(a, m, corpsId));
    return r;
  }
  function detail(a, m, id) {
    var d = el("div", { class: "pk-app-corps", id: id });
    if (a.config.length) {
      var ifs = a.interfaces.filter(function (i) { return i.ip || i.vlan || i.desc; });
      if (ifs.length) {
        d.appendChild(el("h4", { text: "Interfaces" }));
        d.appendChild(tableau(ifs.map(function (i) {
          return [L.court(i.nom), (i.ip || (i.vlan ? "VLAN " + i.vlan : "")) + (i.eteinte ? " · éteinte" : "") + (i.desc ? " · " + i.desc : "")];
        })));
      }
    } else if (a.reglages.length) {
      var groupes = [];
      a.reglages.forEach(function (r) { if (groupes.indexOf(r.groupe) < 0) groupes.push(r.groupe); });
      groupes.forEach(function (g) {
        d.appendChild(el("h4", { text: g }));
        d.appendChild(tableau(a.reglages.filter(function (r) { return r.groupe === g; }).map(function (r) { return [r.libelle, r.valeur || "(vide)"]; })));
      });
    }
    var siens = m.cables.filter(function (c) { return c.a === a || c.b === a; });
    if (siens.length) {
      d.appendChild(el("h4", { text: "Câbles" }));
      d.appendChild(tableau(siens.map(function (c) {
        var moi = c.a === a;
        return [L.court(moi ? c.pa : c.pb), "vers " + (moi ? c.b.nom + " " + L.court(c.pb) : c.a.nom + " " + L.court(c.pa)) + " · " + c.genre];
      })));
    }
    if (a.config.length) {
      var lignes = L.configLisible(a.config);
      var det = el("details", { class: "pk-config" }, el("summary", { text: "Configuration complète · " + pluriel(lignes.length, "ligne") }));
      var bloc = blocCommandes(lignes, a.nom);
      bloc.querySelector(".langue").textContent = "show running-config";
      det.appendChild(bloc);
      d.appendChild(det);
    } else if (!a.reglages.length) {
      d.appendChild(el("p", { class: "pk-note", text: "Pas de configuration enregistrée pour cet appareil." }));
    }
    return d;
  }
  function tableau(rangs) {
    var t = el("table", { class: "pk-table" });
    rangs.forEach(function (r) { t.appendChild(el("tr", null, el("th", { scope: "row", text: r[0] }), el("td", { text: r[1] }))); });
    return t;
  }
  function defiler(nom) {
    requestAnimationFrame(function () {
      var r = racine.querySelector('.pk-app[data-nom="' + CSS.escape(nom) + '"]');
      if (r && r.getBoundingClientRect().top < 60) r.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  function montrerAppareil(nom) {
    etat.vue = "appareils";
    if (etat.mode === "pka") etat.reseau = 0;
    if (etat.mode === "comparer") etat.reseau = 1;
    var m = etat.modeles[etat.reseau].m;
    if (!m.parNom[nom]) etat.reseau = 0;
    etat.ouvert = nom;
    rendreOnglets(); rendreVue(); rendreSchema();
    var r = racine.querySelector('.pk-app[data-nom="' + CSS.escape(nom) + '"]');
    if (r) r.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /* ── le schéma ── */
  var CABLES_LEGENDE = { droit: "cuivre", croise: "croisé", serie: "série", console: "console", fibre: "fibre", coax: "coaxial", autre: "autre" };
  function rendreSchema() {
    var zone = $("#pk-schema");
    zone.replaceChildren();
    var surFaire = etat.vue === "faire" && etat.cible;
    var m = surFaire ? etat.cible : etat.modeles[etat.reseau].m;
    var items = surFaire ? etat.items : [];
    var apps = m.apps.filter(function (a) { return isFinite(a.x) && isFinite(a.y); });
    var tete = el("div", { class: "pk-schema-tete" },
      el("p", { class: "pk-schema-t", text: surFaire ? (etat.mode === "comparer" ? "Après, et ce qui a changé" : "Le corrigé, et ce qui vous manque") : etat.modeles[etat.reseau].titre }),
      el("div", { class: "pk-zoom" },
        el("button", { type: "button", class: "pk-b pk-b-icone", "aria-label": "Réduire", onclick: function () { zoomer(1 / 1.25); }, text: "−" }),
        el("button", { type: "button", class: "pk-b pk-b-icone", "aria-label": "Agrandir", onclick: function () { zoomer(1.25); }, text: "+" }),
        el("button", { type: "button", class: "pk-b", onclick: function () { etat.zoom = 0; dimensionner(); }, text: "Tout voir" })));
    zone.appendChild(tete);
    var toile = el("div", { class: "pk-toile", id: "pk-toile" });
    zone.appendChild(toile);
    if (!apps.length) { toile.appendChild(el("p", { class: "pk-note", text: "Aucun appareil à dessiner." })); return; }

    // Le fichier serre ses icônes ; nos étiquettes sont plus larges. On écarte
    // le plan jusqu'à ce que le quart le plus serré soit à 100 unités.
    var voisins = apps.map(function (a) {
      var d = Infinity;
      apps.forEach(function (b) { if (b !== a) { var x = Math.hypot(b.x - a.x, b.y - a.y); if (x > 20 && x < d) d = x; } });
      return d;
    }).filter(isFinite).sort(function (p, q) { return p - q; });
    var repere = voisins.length ? voisins[Math.floor(voisins.length / 4)] : 100;
    var k = Math.max(1, Math.min(3, 100 / Math.max(repere, 1)));
    var pos = {};
    apps.forEach(function (a) { pos[a.nom] = { x: a.x * k, y: a.y * k }; });
    // les appareils retirés n'ont pas de place dans le réseau d'arrivée : on reprend la leur
    var fantomes = [];
    if (surFaire) items.forEach(function (it) {
      if (it.genre !== "app-") return;
      var a = etat.depart.parNom[it.appareil];
      if (a && isFinite(a.x) && !pos[a.nom]) { pos[a.nom] = { x: a.x * k - 40, y: a.y * k - 36 }; fantomes.push(a); }
    });
    var tout = apps.concat(fantomes);
    var xs = tout.map(function (a) { return pos[a.nom].x; }), ys = tout.map(function (a) { return pos[a.nom].y; });
    var x0 = Math.min.apply(null, xs) - 66, x1 = Math.max.apply(null, xs) + 66, y0 = Math.min.apply(null, ys) - 40, y1 = Math.max.apply(null, ys) + 66;
    if (x1 - x0 < 340) { var c = (x0 + x1) / 2; x0 = c - 170; x1 = c + 170; }
    var svg = s("svg", { viewBox: [x0, y0, x1 - x0, y1 - y0].join(" "), role: "img", "aria-label": "Schéma du réseau : " + pluriel(apps.length, "appareil") });
    svg.dataset.l = x1 - x0; svg.dataset.h = y1 - y0;

    var traits = m.cables.map(function (c_) { return { c: c_, classe: c_.style }; });
    var plus = {}, nFaire = {};
    items.forEach(function (it) {
      if (it.genre === "cable+") plus[L.cleCable(it.cable)] = true;
      if (it.genre === "cable-") traits.push({ c: it.cable, classe: "en-trop" });
      if (!/^cable/.test(it.genre)) nFaire[it.appareil] = (nFaire[it.appareil] || 0) + 1;
    });
    traits.forEach(function (t) { if (plus[L.cleCable(t.c)]) t.classe = "a-poser"; });
    var gC = s("g"), gP = s("g"), gA = s("g"), styles = {};
    traits.forEach(function (t) {
      var a = pos[t.c.a.nom], b = pos[t.c.b.nom];
      if (!a || !b) return;
      styles[t.classe] = true;
      gC.appendChild(s("line", { class: "pk-cable pk-c-" + t.classe, "data-a": t.c.a.nom, "data-b": t.c.b.nom, x1: a.x, y1: a.y, x2: b.x, y2: b.y },
        s("title", null, t.c.a.nom + " " + L.court(t.c.pa) + " ↔ " + t.c.b.nom + " " + L.court(t.c.pb) + " (" + t.c.genre + ")")));
      var Lg = Math.hypot(b.x - a.x, b.y - a.y) || 1, d = Math.min(44, Lg * 0.3), ux = (b.x - a.x) / Lg, uy = (b.y - a.y) / Lg;
      if (Lg > 80) {
        gP.appendChild(s("text", { class: "pk-port", x: a.x + ux * d, y: a.y + uy * d + 3.5 }, L.court(t.c.pa)));
        gP.appendChild(s("text", { class: "pk-port", x: b.x - ux * d, y: b.y - uy * d + 3.5 }, L.court(t.c.pb)));
      }
    });
    tout.forEach(function (a) {
      var p = pos[a.nom], fantome = fantomes.indexOf(a) >= 0;
      var n = nFaire[a.nom] || 0;
      var g = s("g", { class: "pk-noeud" + (n ? " pk-n-faire" : "") + (fantome ? " pk-n-fantome" : "") + (etat.ouvert === a.nom ? " pk-n-choisi" : ""),
        transform: "translate(" + p.x.toFixed(1) + " " + p.y.toFixed(1) + ")", tabindex: "0", role: "button", "data-nom": a.nom,
        "aria-label": a.nom + ", " + a.genre + (n ? ", " + n + " à faire" : "") });
      g.appendChild(s("rect", { class: "pk-n-anneau", x: -27, y: -27, width: 54, height: 54, rx: 14 }));
      g.appendChild(s("rect", { class: "pk-n-tuile", "data-fam": a.famille, x: -21, y: -21, width: 42, height: 42, rx: 11 }));
      var ic = s("g", { class: "pk-n-ic", "data-fam": a.famille, transform: "translate(-13 -13) scale(1.0833)" });
      ic.innerHTML = ICONES[a.famille] || ICONES.autre;
      g.appendChild(ic);
      g.appendChild(s("text", { class: "pk-n-nom", y: 40 }, a.nom));
      (a.resume || []).slice(0, 1).forEach(function (l) { g.appendChild(s("text", { class: "pk-n-adr", y: 54 }, l.replace(/^(Internet|LAN|Wi-Fi) /, ""))); });
      if (n) g.appendChild(s("g", { class: "pk-n-badge", transform: "translate(21 -21)" }, s("circle", { r: 10 }), s("text", { y: 4 }, String(n))));
      g.addEventListener("click", function () { cliquerNoeud(a.nom); });
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cliquerNoeud(a.nom); } });
      gA.appendChild(g);
    });
    svg.appendChild(gC); svg.appendChild(gP); svg.appendChild(gA);
    toile.appendChild(svg);

    var leg = el("p", { class: "pk-legende" });
    Object.keys(CABLES_LEGENDE).forEach(function (k_) { if (styles[k_]) leg.appendChild(echantillon(k_, CABLES_LEGENDE[k_])); });
    if (styles["a-poser"]) leg.appendChild(echantillon("a-poser", etat.mode === "comparer" ? "ajouté" : "à poser"));
    if (styles["en-trop"]) leg.appendChild(echantillon("en-trop", etat.mode === "comparer" ? "retiré" : "en trop"));
    if (Object.keys(nFaire).length) leg.appendChild(el("span", null, el("i", { class: "pk-leg-badge", "aria-hidden": "true" }), etat.mode === "comparer" ? "réglages changés" : "réglages à faire"));
    zone.appendChild(leg);
    glisser(toile);
    dimensionner();
  }
  function echantillon(classe, libelle) {
    var sv = s("svg", { viewBox: "0 0 26 8", "aria-hidden": "true" }, s("line", { class: "pk-cable pk-c-" + classe, x1: 1, y1: 4, x2: 25, y2: 4 }));
    return el("span", null, sv, libelle);
  }
  function cliquerNoeud(nom) {
    if (etat.vue === "faire") {
      var g = racine.querySelector('.pk-groupe[data-nom="' + CSS.escape(nom) + '"]');
      if (g) { g.scrollIntoView({ block: "start", behavior: "smooth" }); g.classList.remove("pk-eclair"); void g.offsetWidth; g.classList.add("pk-eclair"); return; }
    }
    montrerAppareil(nom);
  }
  function allumer(nom, autre) {
    var svg = racine.querySelector("#pk-toile svg");
    if (!svg) return;
    svg.classList.toggle("pk-focus", !!nom);
    svg.querySelectorAll(".pk-noeud").forEach(function (g) {
      var n = g.getAttribute("data-nom");
      g.classList.toggle("pk-n-allume", !!nom && (n === nom || n === autre));
    });
    svg.querySelectorAll(".pk-cable").forEach(function (l) {
      var a = l.getAttribute("data-a"), b = l.getAttribute("data-b");
      l.classList.toggle("pk-c-allume", !!nom && (a === nom || b === nom) && (!autre || a === autre || b === autre));
    });
  }
  // Taille : par défaut le réseau tient dans son cadre, sans que le texte
  // descende sous 66 % (au-delà, on fait défiler la toile) ; « Tout voir »
  // (zoom 0) le fait tenir quoi qu'il arrive ; + et − choisissent.
  function dimensionner() {
    var toile = racine.querySelector("#pk-toile"), svg = toile && toile.querySelector("svg");
    if (!svg) return;
    var l = +svg.dataset.l, h = +svg.dataset.h;
    var dispoL = toile.clientWidth || 300, dispoH = Math.max(240, toile.clientHeight || 400);
    var ajuste = Math.min(dispoL / l, dispoH / h);
    var z = etat.zoom === 0 ? ajuste : etat.zoom == null ? Math.min(1, Math.max(ajuste, 0.66)) : etat.zoom;
    svg.style.width = Math.round(l * z) + "px";
    svg.style.height = Math.round(h * z) + "px";
  }
  function zoomer(f) {
    var toile = racine.querySelector("#pk-toile"), svg = toile && toile.querySelector("svg");
    if (!svg) return;
    var actuel = svg.getBoundingClientRect().width / +svg.dataset.l;
    etat.zoom = Math.max(0.3, Math.min(2.5, actuel * f));
    dimensionner();
  }
  function glisser(toile) {
    var depart = null;
    toile.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || e.target.closest(".pk-noeud")) return;
      depart = { x: e.clientX, y: e.clientY, l: toile.scrollLeft, t: toile.scrollTop };
      toile.classList.add("pk-glisse");
    });
    window.addEventListener("pointermove", function (e) {
      if (!depart) return;
      toile.scrollLeft = depart.l - (e.clientX - depart.x);
      toile.scrollTop = depart.t - (e.clientY - depart.y);
    });
    window.addEventListener("pointerup", function () { depart = null; toile.classList.remove("pk-glisse"); });
  }

  /* ── les gestes de la tête ── */
  var entree = $("#pk-entree");
  var comparerEnSuite = false;
  function choisir(comparer) { comparerEnSuite = comparer; entree.click(); }
  entree.addEventListener("change", function () { depuisListe(entree.files, comparerEnSuite); entree.value = ""; });
  $("#pk-choisir").addEventListener("click", function () { choisir(false); });

  function enregistrerXml() {
    var A = etat.fichiers[0];
    var url = URL.createObjectURL(new Blob([A.xml], { type: "application/xml" }));
    var a = el("a", { href: url, download: A.nom.replace(/\.pk[ta]$/i, "") + ".xml" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // La maquette part au labo dans l'adresse : compressée, en base64url. Le
  // fragment n'est jamais envoyé au serveur ; le labo le retire en le lisant.
  function versLabo() {
    var mo = etat.modeles[etat.reseau];
    var source = (mo.nom || etat.fichiers[0].nom) + (etat.mode === "pka" ? " (" + mo.titre.toLowerCase() + ")" : "");
    var charge = L.versLabo(mo.m, source);
    var fenetre = window.open("", "_blank");
    var flux = new Blob([JSON.stringify(charge)]).stream().pipeThrough(new CompressionStream("deflate"));
    new Response(flux).arrayBuffer().then(function (b) {
      var u = new Uint8Array(b), t = "";
      for (var i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      var url = LABO + "#import=" + btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      if (fenetre) fenetre.location.href = url; else location.href = url;
    });
  }

  /* ── glisser un fichier n'importe où dans la page ── */
  var profondeur = 0;
  function avecFichiers(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0; }
  window.addEventListener("dragenter", function (e) { if (!avecFichiers(e)) return; profondeur++; racine.classList.add("pk-survol"); });
  window.addEventListener("dragleave", function (e) { if (!avecFichiers(e)) return; profondeur = Math.max(0, profondeur - 1); if (!profondeur) racine.classList.remove("pk-survol"); });
  window.addEventListener("dragover", function (e) { if (avecFichiers(e)) e.preventDefault(); });
  window.addEventListener("drop", function (e) {
    if (!avecFichiers(e)) return;
    e.preventDefault(); profondeur = 0; racine.classList.remove("pk-survol");
    depuisListe(e.dataTransfer.files, false);
  });
  large.addEventListener("change", function () { if (etat.fichiers.length) { rendreOnglets(); rendreVue(); rendreSchema(); } });
  var minuterie = 0;
  window.addEventListener("resize", function () { clearTimeout(minuterie); minuterie = setTimeout(dimensionner, 120); });

  // Les onglets collent SOUS l'en-tête du site, qui colle lui aussi (et se
  // replie au téléphone quand on descend) : on suit son bord bas.
  var prevu = 0;
  function suivreEntete() {
    prevu = 0;
    var h = 0;
    document.querySelectorAll("body > header, .tel-tete, .barre").forEach(function (e) {
      var st = getComputedStyle(e);
      if (st.position !== "sticky" && st.position !== "fixed") return;
      var b = e.getBoundingClientRect();
      if (b.top <= 1 && b.bottom > h && b.height < 160) h = b.bottom;
    });
    racine.style.setProperty("--pk-haut", Math.max(0, Math.round(h)) + "px");
  }
  window.addEventListener("scroll", function () { if (!prevu) prevu = requestAnimationFrame(suivreEntete); }, { passive: true });
  suivreEntete();

  window.CIEL_LECTEUR = { ouvrir: ouvrir, etat: etat };
})();
