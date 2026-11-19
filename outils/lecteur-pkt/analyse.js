/* Lire le XML d'un .pkt ou d'un .pka : les appareils, leurs réglages, les
   câbles. Puis dire ce qui sépare deux réseaux en ACTIONS qu'on fait
   (« passer Admin en DHCP », « poser le câble AP ↔ WR », les lignes IOS à
   taper), et non en lignes de XML.

   Aucun dessin ici : lecteur.js affiche, ce fichier lit et compare. */
(function (G) {
  "use strict";

  var TYPES = {
    Router: "Routeur", Switch: "Commutateur", MultiLayerSwitch: "Commutateur L3", Hub: "Concentrateur",
    Bridge: "Pont", Repeater: "Répéteur", Pc: "PC", Laptop: "Portable", Tablet: "Tablette",
    SmartPhone: "Téléphone", Server: "Serveur", Printer: "Imprimante", IPPhone: "Téléphone IP",
    Cloud: "Nuage", AccessPoint: "Point d'accès", WirelessRouter: "Routeur sans fil",
    WirelessRouterNewGeneration: "Routeur sans fil", HomeRouter: "Routeur sans fil", ASA: "Pare-feu",
    CableModem: "Modem câble", DslModem: "Modem ADSL", "Power Distribution Device": "Multiprise"
  };
  var FAMILLES = {
    Router: "routeur", Switch: "commutateur", MultiLayerSwitch: "l3", Hub: "concentrateur",
    Bridge: "concentrateur", Repeater: "concentrateur", Pc: "pc", Printer: "pc", IPPhone: "pc",
    Laptop: "portable", Tablet: "portable", SmartPhone: "portable", Server: "serveur", Cloud: "nuage",
    AccessPoint: "ap", WirelessRouter: "sansfil", WirelessRouterNewGeneration: "sansfil",
    HomeRouter: "sansfil", ASA: "parefeu", CableModem: "modem", DslModem: "modem"
  };
  var CABLES = {
    eStraightThrough: "droit", eCrossOver: "croisé", eSerialDCE: "série", eSerialDTE: "série",
    eFiber: "fibre", eSingleMode: "fibre", eMultiMode: "fibre", eConsole: "console", eRollOver: "console",
    eAutoCable: "auto", eCoaxial: "coaxial", ePhone: "téléphone", eUsb: "USB"
  };
  var LIENS = { eCopper: "cuivre", eSerial: "série", eFiber: "fibre", eConsole: "console",
                eCoaxial: "coaxial", eWireless: "sans fil", ePhone: "téléphone", eUsb: "USB" };
  var MULTIPRISE = "Power Distribution Device";
  // Les deux seuls codes dont on est sûr (relevés sur l'activité 13.1.10, où
  // l'énoncé dit « WPA2 Personnel, AES ») ; les autres sont dits tels quels.
  var SECURITE = { "0": "aucune (réseau ouvert)", "4": "WPA2 Personnel" };
  var CHIFFREMENT = { "0": "aucun", "4": "AES" };
  var CONNEXION = { "0": "automatique (DHCP)", "2": "IP statique" };

  /* ── l'arbre XML, à la façon de findtext ── */
  function enfant(el, tag) {
    if (!el) return null;
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.tagName === tag) return c;
    return null;
  }
  function enfants(el, tag) {
    var out = [];
    if (el) for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.tagName === tag) out.push(c);
    return out;
  }
  function chemin(el, p) {
    var e = el, t = p.split("/");
    for (var i = 0; i < t.length && e; i++) e = enfant(e, t[i]);
    return e;
  }
  function texte(el, p) { var e = chemin(el, p); return e ? e.textContent : null; }
  function tous(el, p) {
    var cour = el ? [el] : [];
    p.split("/").forEach(function (t) {
      var suite = [];
      cour.forEach(function (e) { suite = suite.concat(enfants(e, t)); });
      cour = suite;
    });
    return cour;
  }
  function v(x) { return x == null ? "" : String(x).trim(); }
  function ipOk(ip) { ip = v(ip); return ip && ip !== "0.0.0.0" ? ip : ""; }

  function prefixe(masque) {
    var o = v(masque).split(".").map(Number);
    if (o.length !== 4 || o.some(function (x) { return !(x >= 0 && x <= 255); })) return " " + masque;
    var n = 0;
    o.forEach(function (x) { for (; x; x >>= 1) n += x & 1; });
    return "/" + n;
  }
  function avecPrefixe(ip, masque) { ip = ipOk(ip); return ip ? ip + (ipOk(masque) ? prefixe(masque) : "") : ""; }
  function court(nom) {
    var L = [["GigabitEthernet", "G"], ["FastEthernet", "Fa"], ["Serial", "S"], ["Ethernet", "E"], ["Vlan", "Vlan"], ["Loopback", "Lo"]];
    for (var i = 0; i < L.length; i++) if (nom.indexOf(L[i][0]) === 0) return L[i][1] + nom.slice(L[i][0].length);
    return nom;
  }

  /* ── la configuration IOS ── */
  var BRUIT = /^(!|end$|version |license |Building configuration|Current configuration|ntp clock-period|boot-start-marker|boot-end-marker|no service timestamps|service timestamps|ip flow-export|spanning-tree mode pvst$)/;
  // « duplex auto » et « speed auto » sont les valeurs d'usine : IOS les écrit,
  // personne ne les tape.
  var DEFAUTS = /^\s+(duplex auto|speed auto)\s*$/;
  function utiles(cfg) { return cfg.filter(function (l) { return l.trim() && !BRUIT.test(l.trim()) && !DEFAUTS.test(l); }); }
  // Un secret chiffré change à chaque saisie (sel aléatoire) : deux fichiers
  // au même mot de passe ne portent pas la même ligne. On compare sans lui.
  function normaliser(l) { return l.replace(/\b(secret|password) [5789] \S+/g, "$1 (chiffré)").replace(/\s+$/, ""); }
  function configLisible(lignes) {
    var out = [];
    lignes.forEach(function (l) {
      if (l.trim() === "!" && out.length && out[out.length - 1].trim() === "!") return;
      out.push(l);
    });
    return out;
  }
  function interfacesDeConfig(lignes) {
    var res = [], cour = null;
    lignes.forEach(function (l) {
      var m;
      if (/^interface /.test(l)) { cour = { nom: l.slice(10).trim(), ip: null, eteinte: false, vlan: null, desc: null }; res.push(cour); }
      else if (cour && /^\s/.test(l)) {
        var s = l.trim();
        if ((m = /^ip address (\S+) (\S+)/.exec(s))) cour.ip = m[1] + prefixe(m[2]);
        else if (s === "shutdown") cour.eteinte = true;
        else if (s.indexOf("switchport access vlan") === 0) cour.vlan = s.split(/\s+/).pop();
        else if (s.indexOf("description ") === 0) cour.desc = s.slice(12);
      } else cour = null;
    });
    return res;
  }
  function sections(lignes) {
    var out = [], cour = null;
    lignes.forEach(function (l) {
      if (/^\s/.test(l)) { if (cour) cour.corps.push(l); else out.push(cour = { tete: "", corps: [l] }); }
      else { cour = { tete: l, corps: [] }; out.push(cour); }
    });
    return out;
  }

  /* ── les réglages des appareils sans IOS : hôtes, routeur sans fil, AP ── */
  function canal(idx) { var n = parseInt(idx, 10); return n >= 0 && n <= 12 ? String(n + 1) : ""; }
  function wifi(c, R, groupe) {
    if (!c) return;
    R.push({ groupe: groupe, cle: "ssid", libelle: "SSID", valeur: v(texte(c, "SSID")) });
    var ca = canal(texte(c, "STANDARD_CHANNEL"));
    if (ca) R.push({ groupe: groupe, cle: "canal", libelle: "Canal", valeur: ca });
    var s = v(texte(c, "AUTHEN_TYPE"));
    R.push({ groupe: groupe, cle: "securite", libelle: "Sécurité", valeur: SECURITE[s] || ("mode " + s) });
    if (s !== "0") {
      var ch = v(texte(c, "ENCRYPT_TYPE"));
      R.push({ groupe: groupe, cle: "chiffrement", libelle: "Chiffrement", valeur: CHIFFREMENT[ch] || ("type " + ch) });
      R.push({ groupe: groupe, cle: "cle", libelle: "Phrase secrète", valeur: v(texte(c, "WEP_PROCESS/KEY")) });
    }
  }
  function portPrincipal(e) {
    var ps = e.getElementsByTagName("PORT");
    for (var i = 0; i < ps.length; i++) if (enfant(ps[i], "UP_METHOD") || enfant(ps[i], "IP")) return ps[i];
    return null;
  }
  function reglages(a) {
    var e = a.e, R = [];
    if (a.config.length) return R;                       // l'IOS dit tout, par ses lignes
    if (a.famille === "sansfil") {
      var t = v(texte(e, "INTERNET_CONNECTION_TYPE"));
      R.push({ groupe: "Internet", cle: "type", libelle: "Connexion", valeur: CONNEXION[t] || ("type " + t) });
      if (t !== "0") {
        R.push({ groupe: "Internet", cle: "ip", libelle: "Adresse", valeur: avecPrefixe(texte(e, "INTERNET_IP_ADDRESS"), texte(e, "INTERNET_SUBNET_MASK")) });
        R.push({ groupe: "Internet", cle: "passerelle", libelle: "Passerelle", valeur: ipOk(texte(e, "DEFAULT_GATEWAY")) });
        R.push({ groupe: "Internet", cle: "dns", libelle: "DNS", valeur: ipOk(texte(e, "DNS_CLIENT/SERVER_IP")) });
      }
      R.push({ groupe: "Réseau local", cle: "ip", libelle: "Adresse du routeur", valeur: avecPrefixe(texte(e, "LAN_IP_ADDRESS"), texte(e, "LAN_SUBNET_MASK")) });
      var pool = chemin(e, "DHCP_SERVER/POOLS/POOL");
      if (pool) {
        R.push({ groupe: "Serveur DHCP", cle: "debut", libelle: "Première adresse", valeur: ipOk(texte(pool, "START_IP")) });
        R.push({ groupe: "Serveur DHCP", cle: "nombre", libelle: "Nombre de clients", valeur: v(texte(pool, "MAX_USERS")) });
        R.push({ groupe: "Serveur DHCP", cle: "dns", libelle: "DNS distribué", valeur: ipOk(texte(pool, "DNS_SERVER")) });
      }
      wifi(chemin(e, "WIRELESS_SERVER/WIRELESS_COMMON"), R, "Wi-Fi 2,4 GHz");
      var mdp = texte(e, "HTTP_SERVER/PASSWORD");
      if (mdp != null) R.push({ groupe: "Administration", cle: "mdp", libelle: "Mot de passe de l'interface web", valeur: v(mdp) });
      return R;
    }
    if (a.famille === "ap") { wifi(chemin(e, "WIRELESS_SERVER/WIRELESS_COMMON"), R, "Wi-Fi"); return R; }
    var p = portPrincipal(e);
    if (p) {
      var dhcp = v(texte(p, "PORT_DHCP_ENABLE")) === "true";
      R.push({ groupe: "Adresse IP", cle: "mode", libelle: "Configuration", valeur: dhcp ? "DHCP" : "statique" });
      if (!dhcp) {
        R.push({ groupe: "Adresse IP", cle: "ip", libelle: "Adresse", valeur: avecPrefixe(texte(p, "IP"), texte(p, "SUBNET")) });
        R.push({ groupe: "Adresse IP", cle: "passerelle", libelle: "Passerelle", valeur: ipOk(texte(e, "GATEWAY")) });
        R.push({ groupe: "Adresse IP", cle: "dns", libelle: "DNS", valeur: ipOk(texte(e, "DNS_CLIENT/SERVER_IP")) });
      }
    }
    var prof = chemin(e, "WIRELESS_CLIENT/CURRENT_PROFILE/WIRELESS_PROFILE");
    var ssid = prof ? v(texte(prof, "SSID")) : "";
    // Un PC ou un serveur sans carte sans fil porte quand même un profil « Default » : rien à dire.
    if (prof && (a.famille === "portable" || (ssid && ssid !== "Default"))) {
      R.push({ groupe: "Wi-Fi", cle: "ssid", libelle: "Réseau (SSID)", valeur: ssid });
      // Côté client, un code 0 ne dit pas « réseau ouvert » à coup sûr : un
      // portable passé sur l'AP garde parfois 0 dans son profil courant
      // (Laptop3 du corrigé de l'activité 13.1.10). On ne dit que ce qui est sûr.
      var s = ssid ? v(texte(prof, "AUTHEN_TYPE")) : "0";
      if (s !== "0") {
        R.push({ groupe: "Wi-Fi", cle: "securite", libelle: "Sécurité", valeur: SECURITE[s] || ("mode " + s) });
        R.push({ groupe: "Wi-Fi", cle: "cle", libelle: "Phrase secrète", valeur: v(texte(prof, "WEP_KEY")) });
      }
    }
    return R;
  }
  function valeurDe(a, groupe, cle) {
    for (var i = 0; i < a.reglages.length; i++) if (a.reglages[i].groupe === groupe && a.reglages[i].cle === cle) return a.reglages[i].valeur;
    return "";
  }

  /* Deux lignes courtes pour la rangée d'un appareil : ce qu'on cherche des yeux. */
  function resume(a) {
    var L = [];
    if (a.config.length) {
      a.interfaces.forEach(function (i) { if (i.ip && !i.eteinte) L.push(court(i.nom) + " " + i.ip); });
    } else if (a.famille === "sansfil") {
      var ip = valeurDe(a, "Internet", "ip"), lan = valeurDe(a, "Réseau local", "ip"), ssid = valeurDe(a, "Wi-Fi 2,4 GHz", "ssid");
      if (ip) L.push("Internet " + ip);
      if (lan) L.push("LAN " + lan);
      if (ssid) L.push("Wi-Fi " + ssid);
    } else if (a.famille === "ap") {
      var s = valeurDe(a, "Wi-Fi", "ssid"), c = valeurDe(a, "Wi-Fi", "canal");
      if (s) L.push("Wi-Fi " + s + (c ? ", canal " + c : ""));
    } else {
      if (valeurDe(a, "Adresse IP", "mode") === "DHCP") L.push("DHCP");
      else if (valeurDe(a, "Adresse IP", "ip")) L.push(valeurDe(a, "Adresse IP", "ip"));
      var w = valeurDe(a, "Wi-Fi", "ssid");
      if (w) L.push("Wi-Fi " + w);
    }
    return L;
  }

  function styleCable(lien, type) {
    if (lien === "eSerial" || /Serial/.test(type)) return "serie";
    if (type === "eCrossOver") return "croise";
    if (lien === "eConsole" || type === "eRollOver" || type === "eConsole") return "console";
    if (lien === "eFiber" || /Fiber|Mode$/.test(type)) return "fibre";
    if (lien === "eCoaxial") return "coax";
    if (lien === "eCopper") return "droit";
    return "autre";
  }

  function modele(reseau) {
    var apps = tous(reseau, "NETWORK/DEVICES/DEVICE").map(function (d, i) {
      var e = enfant(d, "ENGINE"), t = enfant(e, "TYPE");
      var config = tous(e, "RUNNINGCONFIG/LINE").map(function (l) { return l.textContent || ""; });
      var type = t ? t.textContent.trim() : "?";
      var a = {
        i: i, e: e, config: config, type: type, famille: FAMILLES[type] || "autre",
        nom: texte(e, "NAME") || "?", modele: t ? (t.getAttribute("model") || "") : "",
        ref: texte(e, "SAVE_REF_ID"),
        x: parseFloat(texte(d, "WORKSPACE/LOGICAL/X")), y: parseFloat(texte(d, "WORKSPACE/LOGICAL/Y"))
      };
      a.genre = TYPES[type] || type;
      a.interfaces = interfacesDeConfig(config);
      a.nomIos = null;
      config.some(function (l) { if (l.indexOf("hostname ") === 0) { a.nomIos = l.slice(9).trim(); return true; } return false; });
      a.reglages = reglages(a);
      a.resume = resume(a);
      return a;
    }).filter(function (a) { return a.type !== MULTIPRISE; });
    var multiprises = tous(reseau, "NETWORK/DEVICES/DEVICE").length - apps.length;
    var parRef = {}, parNom = {};
    apps.forEach(function (a) { if (a.ref) parRef[a.ref] = a; parNom[a.nom] = a; });
    var tousApps = tous(reseau, "NETWORK/DEVICES/DEVICE");
    function qui(v_) {
      if (v_ == null) return null;
      if (parRef[v_]) return parRef[v_];
      if (/^\d+$/.test(v_) && +v_ < tousApps.length) {             // les vieilles versions numérotent
        var n = texte(enfant(tousApps[+v_], "ENGINE"), "NAME");
        return parNom[n] || null;
      }
      return null;
    }
    var cables = [];
    tous(reseau, "NETWORK/LINKS/LINK").forEach(function (l) {
      var c = enfant(l, "CABLE");
      if (!c) return;
      var ports = enfants(c, "PORT").map(function (p) { return p.textContent || "?"; });
      var types = enfants(c, "TYPE").map(function (t) { return t.textContent; });
      var lien = texte(l, "TYPE") || "", dernier = types.length ? types[types.length - 1] : "";
      var A = qui(texte(c, "FROM")), B = qui(texte(c, "TO"));
      if (!A || !B) return;
      cables.push({ a: A, pa: ports[0] || "?", b: B, pb: ports[1] || "?",
                    genre: CABLES[dernier] || LIENS[lien] || dernier || lien || "?", style: styleCable(lien, dernier) });
    });
    return { apps: apps, cables: cables, multiprises: multiprises, parNom: parNom };
  }

  function texteHtml(h) {
    var t = (h || "")
      .replace(/<head[\s\S]*?<\/head>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr|\/table)\b[^>]*>/gi, "\n").replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, "");
    t = t.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
         .replace(/&#(\d+);/g, function (_, n) { return String.fromCodePoint(+n); })
         .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCodePoint(parseInt(n, 16)); })
         .replace(/&amp;/g, "&");
    return t.split("\n").map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(Boolean).join("\n");
  }

  /* Le fichier entier : un réseau pour un .pkt, trois pour un .pka. */
  function lire(xml) {
    var txt = new TextDecoder("utf-8").decode(xml).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    var doc = new DOMParser().parseFromString(txt, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("le contenu décodé n'est pas un XML lisible");
    var racine = doc.documentElement;
    var rs = racine.tagName === "PACKETTRACER5" ? [racine] : enfants(racine, "PACKETTRACER5");
    if (!rs.length) throw new Error("aucun réseau dans le fichier");
    var pages = tous(racine, "ACTIVITY/INSTRUCTIONS/PAGE").map(function (p) { return texteHtml(p.textContent); }).filter(Boolean);
    return { version: v(texte(racine, "VERSION")) || "?", activite: racine.tagName !== "PACKETTRACER5",
             reseaux: rs.map(modele), consignes: pages };
  }

  /* ── ce qui sépare deux réseaux, en actions ── */
  function cleCable(c) {
    var x = c.a.nom + " " + c.pa, y = c.b.nom + " " + c.pb;
    return x < y ? x + "|" + y : y + "|" + x;
  }
  // Deux lignes qui posent la même chose avec une autre valeur : on dit la
  // nouvelle, on ne fait pas « retirer puis ajouter ».
  function cleLigne(l) {
    var t = l.trim().split(/\s+/);
    if (/^(hostname|enable|ip default-gateway|ip domain-name|banner|clock)$/.test(t[0])) return t.slice(0, 2).join(" ");
    if (t[0] === "ip" && /^(address|helper-address)$/.test(t[1])) return t.slice(0, 2).join(" ");
    if (/^(description|duplex|speed|encapsulation|clock|bandwidth|default-router|dns-server|network|switchport|version)$/.test(t[0]))
      return t[0] === "switchport" ? t.slice(0, 2).join(" ") : t[0];
    return null;
  }
  function titreSection(h) {
    var m;
    if ((m = /^interface (\S+)/i.exec(h))) return "Interface " + court(m[1]);
    if ((m = /^hostname (\S+)/.exec(h))) return "Nom de l'appareil : " + m[1];
    if ((m = /^ip dhcp pool (.+)/.exec(h))) return "Pool DHCP « " + m[1] + " »";
    if ((m = /^ip dhcp excluded-address (.+)/.exec(h))) return "Adresses exclues du DHCP : " + m[1];
    if ((m = /^ip route (\S+) (\S+) (\S+)/.exec(h))) return "Route vers " + m[1] + prefixe(m[2]) + " par " + m[3];
    if ((m = /^router (\S+)/.exec(h))) return "Routage " + m[1].toUpperCase();
    if ((m = /^vlan (\S+)/.exec(h))) return "VLAN " + m[1];
    if ((m = /^line (.+)/.exec(h))) return "Lignes " + m[1];
    if (/^enable secret/.test(h)) return "Mot de passe du mode privilégié (secret)";
    if (/^enable password/.test(h)) return "Mot de passe du mode privilégié";
    if ((m = /^username (\S+)/.exec(h))) return "Compte « " + m[1] + " »";
    if ((m = /^access-list (\d+)/.exec(h))) return "Liste d'accès " + m[1];
    if (/^ip domain-name/.test(h)) return "Nom de domaine";
    if (/^banner/.test(h)) return "Bannière";
    if (/^service password-encryption/.test(h)) return "Chiffrer les mots de passe";
    if (/^ip default-gateway/.test(h)) return "Passerelle du commutateur";
    return h.trim();
  }
  function lisible(l) {
    // une ligne au secret chiffré ne se tape pas telle quelle
    return l.replace(/\b(secret|password) [5789] \S+/g, "$1 <mot de passe de l'énoncé>");
  }
  function itemsConfig(nom, A, B) {
    var items = [];
    var sa = sections(utiles(A)), sb = sections(utiles(B));
    var parTeteA = {};
    sa.forEach(function (s) { parTeteA[normaliser(s.tete)] = s; });
    var vues = {};
    var ajoutsGlobaux = {};
    sb.forEach(function (s) {
      var k = normaliser(s.tete);
      vues[k] = true;
      var a = parTeteA[k];
      var corpsA = a ? a.corps.map(normaliser) : [];
      var corpsB = s.corps.map(normaliser);
      if (a && corpsA.join("\n") === corpsB.join("\n")) return;
      var ajouts = s.corps.filter(function (l, i) { return corpsA.indexOf(corpsB[i]) < 0; });
      var cles = ajouts.map(cleLigne);
      var retraits = (a ? a.corps : []).filter(function (l) {
        var n = normaliser(l);
        return corpsB.indexOf(n) < 0 && (cleLigne(l) == null || cles.indexOf(cleLigne(l)) < 0);
      });
      var commandes = [lisible(s.tete)].concat(ajouts.map(lisible), retraits.map(function (l) {
        var ind = /^\s*/.exec(l)[0];
        return ind + (/^no /.test(l.trim()) ? l.trim().slice(3) : "no " + l.trim());
      }));
      if (!a && !s.corps.length) ajoutsGlobaux[cleLigne(s.tete) || k] = true;
      items.push({ cle: nom + "|cfg|" + k, appareil: nom, genre: "config", titre: titreSection(s.tete),
                   commandes: commandes.filter(Boolean), nouvelle: !a });
    });
    sa.forEach(function (s) {
      var k = normaliser(s.tete);
      if (vues[k] || !s.tete) return;
      if (!s.corps.length && ajoutsGlobaux[cleLigne(s.tete) || ""]) return;   // remplacée, déjà dite
      items.push({ cle: nom + "|cfg-|" + k, appareil: nom, genre: "config", titre: titreSection(s.tete) + " : à retirer",
                   commandes: [/^no /.test(s.tete) ? s.tete.slice(3) : "no " + lisible(s.tete)], retrait: true });
    });
    return items;
  }
  function itemsReglages(nom, a, b) {
    var items = [], groupes = [];
    b.reglages.forEach(function (r) { if (groupes.indexOf(r.groupe) < 0) groupes.push(r.groupe); });
    groupes.forEach(function (g) {
      var valeurs = b.reglages.filter(function (r) { return r.groupe === g; }).map(function (r) {
        return { libelle: r.libelle, cible: r.valeur, actuel: valeurDe(a, g, r.cle) };
      }).filter(function (x) { return x.cible !== x.actuel; });
      if (valeurs.length) items.push({ cle: nom + "|reg|" + g, appareil: nom, genre: "reglage", titre: g, valeurs: valeurs });
    });
    return items;
  }

  function aFaire(mA, mB) {
    var items = [];
    mB.apps.forEach(function (b) {
      var a = mA.parNom[b.nom];
      if (!a) { items.push({ cle: "app+|" + b.nom, appareil: b.nom, genre: "app+", titre: "Ajouter " + b.genre.toLowerCase() + " " + b.nom + (b.modele && b.modele !== b.type ? " (" + b.modele + ")" : "") }); return; }
      if (a.config.length || b.config.length) items = items.concat(itemsConfig(b.nom, a.config, b.config));
      else items = items.concat(itemsReglages(b.nom, a, b));
    });
    mA.apps.forEach(function (a) {
      if (!mB.parNom[a.nom]) items.push({ cle: "app-|" + a.nom, appareil: a.nom, genre: "app-", titre: "Retirer " + a.genre.toLowerCase() + " " + a.nom });
    });
    var ka = {}, kb = {};
    mA.cables.forEach(function (c) { ka[cleCable(c)] = c; });
    mB.cables.forEach(function (c) { kb[cleCable(c)] = c; });
    Object.keys(kb).forEach(function (k) { if (!ka[k]) items.push({ cle: "cable+|" + k, appareil: kb[k].a.nom, autre: kb[k].b.nom, genre: "cable+", titre: "Poser un câble", cable: kb[k] }); });
    Object.keys(ka).forEach(function (k) { if (!kb[k]) items.push({ cle: "cable-|" + k, appareil: ka[k].a.nom, autre: ka[k].b.nom, genre: "cable-", titre: "Retirer un câble", cable: ka[k] }); });
    return items;
  }

  /* Combien c'est fait : ce qui séparait le départ du corrigé, moins ce qui
     sépare encore ton travail du corrigé. Une action à moitié faite reste à
     faire. */
  function progression(depart, travail, corrige) {
    var total = aFaire(depart, corrige), reste = aFaire(travail, corrige);
    var cles = {};
    reste.forEach(function (x) { cles[x.cle] = true; });
    var faits = total.filter(function (x) { return !cles[x.cle]; });
    return { total: Math.max(total.length, reste.length + faits.length), faits: faits, reste: reste };
  }

  /* ── vers le labo réseau ── */
  var VERS_LABO = { Router: "routeur", Switch: "switch", Pc: "pc", Laptop: "portable", Server: "serveur" };
  function portsLabo(type) {
    if (type === "routeur") return ["GigabitEthernet0/0", "GigabitEthernet0/1", "GigabitEthernet0/2", "Serial0/0/0", "Serial0/0/1"];
    if (type === "switch") {
      var L = [];
      for (var i = 1; i <= 24; i++) L.push("FastEthernet0/" + i);
      return L.concat(["GigabitEthernet0/1", "GigabitEthernet0/2"]);
    }
    return ["FastEthernet0"];
  }
  function genrePort(n) {
    if (/^se/i.test(n)) return "se";
    if (/^(gig|fast|eth|gi|fa)/i.test(n)) return "eth";
    return null;
  }
  // Les noms de ports du fichier vers ceux du labo : le même s'il existe,
  // sinon le premier libre de même nature (un 4331 a Gi0/0/0, le labo Gi0/0).
  function traductionPorts(a, typeLabo, cables) {
    var dispo = portsLabo(typeLabo), pris = {}, carte = {};
    var noms = [];
    a.config.forEach(function (l) {
      var m = /^interface (\S+)/.exec(l);
      if (m && !/\./.test(m[1]) && genrePort(m[1])) noms.push(m[1]);
    });
    cables.forEach(function (c) {
      if (c.a === a) noms.push(c.pa);
      if (c.b === a) noms.push(c.pb);
    });
    noms.forEach(function (n) { if (dispo.indexOf(n) >= 0 && !pris[n] && carte[n] == null) { carte[n] = n; pris[n] = true; } });
    noms.forEach(function (n) {
      if (carte[n] != null) return;
      var g = genrePort(n);
      var choix = null;
      if (g) {
        for (var i = 0; i < dispo.length && !choix; i++) {
          var d = dispo[i];
          if (pris[d] || genrePort(d) !== g) continue;
          if (typeLabo === "switch" && /^Gi/i.test(n) !== /^Gi/i.test(d)) continue;
          choix = d;
        }
      }
      carte[n] = choix;
      if (choix) pris[choix] = true;
    });
    return carte;
  }
  function echapper(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function configPourLabo(a, carte) {
    var lignes = utiles(a.config).filter(function (l) {
      var s = l.trim();
      return !/^(enable (secret|password)|username )/.test(s) && !(/^\s/.test(l) && /^(password|login)\b/.test(s))
        // le nom d'usine d'IOS (« Router », « Switch ») renommerait l'appareil du
        // schéma : deux commutateurs s'appelleraient « Switch ». Le labo garde
        // donc le nom du schéma ; un nom choisi par l'élève (R1, S2) passe.
        && !/^hostname (Router|Switch)\s*$/.test(s);
    });
    var paires = Object.keys(carte).filter(function (k) { return carte[k] && carte[k] !== k; })
      .sort(function (x, y) { return y.length - x.length; });
    lignes = lignes.map(function (l) {
      paires.forEach(function (k) { l = l.replace(new RegExp(echapper(k) + "(?![\\d/])", "g"), carte[k]); });
      return l;
    });
    // les interfaces que le labo n'a pas : leur section entière saute
    var out = [], sauter = false;
    lignes.forEach(function (l) {
      if (!/^\s/.test(l)) {
        var m = /^interface (\S+)/.exec(l);
        sauter = false;
        if (m) {
          var base = m[1].split(".")[0];
          // une interface VLAN n'existe que sur le commutateur du labo ; celle
          // qu'IOS écrit sur un routeur (« interface Vlan1 », éteinte) ne fait rien
          var connu = carte[base] !== undefined ? !!carte[base]
            : (portsLabo(VERS_LABO[a.type]).indexOf(base) >= 0 || /^Loopback/i.test(base) || (/^Vlan/i.test(base) && VERS_LABO[a.type] === "switch"));
          if (!connu) sauter = true;
        }
      }
      if (!sauter) out.push(l);
    });
    return out;
  }
  function versLabo(m, source) {
    var gardes = m.apps.filter(function (a) { return VERS_LABO[a.type]; });
    var xs = gardes.map(function (a) { return a.x || 0; }), ys = gardes.map(function (a) { return a.y || 0; });
    var cx = xs.length ? (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2 : 0;
    var cy = ys.length ? (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2 : 0;
    var cartes = {}, appareils = [];
    gardes.forEach(function (a) {
      var t = VERS_LABO[a.type];
      var carte = traductionPorts(a, t, m.cables);
      cartes[a.nom] = carte;
      var j = { type: t, nom: a.nom, x: Math.round(((a.x || 0) - cx) * 1.6 / 20) * 20, y: Math.round(((a.y || 0) - cy) * 1.6 / 20) * 20 };
      if (a.config.length) j.ios = configPourLabo(a, carte);
      else {
        var p = portPrincipal(a.e);
        if (p && v(texte(p, "PORT_DHCP_ENABLE")) === "true") j.hote = { dhcp: true };
        else if (p && ipOk(texte(p, "IP"))) {
          j.hote = { ip: ipOk(texte(p, "IP")), masque: ipOk(texte(p, "SUBNET")) || "255.255.255.0",
                     passerelle: ipOk(texte(a.e, "GATEWAY")) || null, dns: ipOk(texte(a.e, "DNS_CLIENT/SERVER_IP")) || null };
        }
      }
      appareils.push(j);
    });
    var cables = [], cablesPerdus = 0;
    m.cables.forEach(function (c) {
      var ca = cartes[c.a.nom], cb = cartes[c.b.nom];
      if (!ca || !cb) return;
      var pa = ca[c.pa], pb = cb[c.pb];
      if (!pa || !pb || c.style === "console") { cablesPerdus++; return; }
      var type = c.style === "serie" ? "serie" : c.style === "fibre" ? "fibre" : "cuivre";
      var A = [c.a.nom, pa], B = [c.b.nom, pb];
      if (type === "serie") {
        // le bout qui donne l'horloge (« clock rate ») passe en premier : c'est le DCE
        var dceB = c.b.config.join("\n").indexOf("interface " + c.pb + "\n") >= 0 &&
          /clock rate/.test((c.b.config.join("\n").split("interface " + c.pb + "\n")[1] || "").split(/\n(?=\S)/)[0]);
        if (dceB) { var t_ = A; A = B; B = t_; }
      }
      cables.push({ a: A, b: B, type: type });
    });
    var ignores = m.apps.filter(function (a) { return !VERS_LABO[a.type]; })
      .map(function (a) { return { nom: a.nom, raison: a.genre.toLowerCase() }; });
    return { format: "ciel-labo-import", version: 1, source: source, appareils: appareils, cables: cables,
             ignores: ignores, cablesPerdus: cablesPerdus };
  }

  G.LecteurPKT = {
    lire: lire, aFaire: aFaire, progression: progression, versLabo: versLabo,
    court: court, configLisible: configLisible, cleCable: cleCable, valeurDe: valeurDe, TYPES: TYPES
  };
})(typeof window !== "undefined" ? window : globalThis);
