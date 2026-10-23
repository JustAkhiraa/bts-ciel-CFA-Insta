/* L'inspecteur, docké à droite : ce qu'on a sélectionné, en détail.

   · un équipement : sa configuration (formulaire pour un PC ou un
     serveur, running-config pour un routeur ou un commutateur), ses ports
     avec leur état, ses tables vivantes (ARP, CAM, routage) ;
   · un câble : ses deux bouts, son type, et pourquoi il ne marche pas ;
   · une trame (mode simulation) : l'inspecteur de PDU ;
   · rien : le lab en cours, ses étapes.

   Les tables se rafraîchissent seules au fil du trafic, sans redessiner
   un formulaire qu'on est en train de remplir. */

import { IPv4Address } from "../core/IPv4Address.js";
import { icone, COULEURS_TYPE } from "../canvas/Renderer.js";
import { TYPES_CABLE } from "../devices/Cable.js";
import { runningConfig, etatInterface } from "../cli/IOSAffichage.js";
import { ecrireListeVlan } from "../devices/SwitchL2.js";
import { rendrePDU } from "./PDUInspector.js";

const ech = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pastille = (couleur) => '<span class="lb-pastille ' + couleur + '"></span>';
const MODELES = { routeur: "Routeur Cisco ISR 2911", switch: "Commutateur Cisco Catalyst 2960", pc: "PC", portable: "Ordinateur portable", serveur: "Serveur" };

/* « 255.255.255.0 », « /24 » ou « 24 » → masque */
export function lireMasque(s) {
  const t = String(s).trim();
  const m = /^\/?(\d{1,2})$/.exec(t);
  if (m && +m[1] <= 32) return IPv4Address.depuisPrefixe(+m[1]);
  const ip = IPv4Address.parse(t);
  return ip && ip.estMasque() ? ip : null;
}

export class DeviceInspector {
  constructor({ el, reseau, ui, rappels }) {
    Object.assign(this, { el, reseau, ui, rappels });
    this.onglet = "config";
    this.dernier = null;
    el.addEventListener("click", (e) => this.clic(e));
    el.addEventListener("change", (e) => this.changement(e));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches("input")) { e.preventDefault(); e.target.blur(); }
      e.stopPropagation();
    });
  }

  cible() {
    const ui = this.ui;
    if (ui.sautSel) return { saut: ui.sautSel };
    if (ui.cableSel) return { cable: ui.cableSel };
    if (ui.selection.size === 1) return { app: [...ui.selection][0] };
    if (ui.selection.size > 1) return { plusieurs: ui.selection.size };
    return { rien: true };
  }

  /* Tout redessiner — sauf si l'on est en train de taper dans un champ de
     l'inspecteur : on ne rafraîchit alors que les tables. */
  rendre(force) {
    const c = this.cible();
    const cle = c.saut ? "s" + c.saut.n + c.saut.livre : c.cable ? "c" + c.cable.id : c.app ? "a" + c.app.id + this.onglet : c.plusieurs ? "p" + c.plusieurs : "r";
    const tape = this.el.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (!force && cle === this.dernier && tape) { this.majDynamique(); return; }
    this.dernier = cle;
    const defil = this.el.scrollTop;
    if (c.saut) this.el.innerHTML = rendrePDU(c.saut);
    else if (c.cable) this.el.innerHTML = this.rendreCable(c.cable);
    else if (c.app) this.el.innerHTML = this.rendreAppareil(c.app);
    else if (c.plusieurs) this.el.innerHTML = '<div class="lb-insp-corps"><p class="lb-texte"><b>' + c.plusieurs + " équipements sélectionnés.</b></p>"
      + '<div class="lb-rangee"><button type="button" class="lb-b lb-danger" data-act="supprimer">Supprimer la sélection</button></div></div>';
    else this.el.innerHTML = this.rendreLab();
    this.el.scrollTop = defil;
    this.dessinerIcones();
  }

  majDynamique() {
    const c = this.cible();
    const z = this.el.querySelector("[data-dyn]");
    if (!z || !c.app) return;
    z.innerHTML = this.onglet === "ports" ? this.rendrePorts(c.app) : this.onglet === "tables" ? this.rendreTables(c.app) : z.innerHTML;
  }

  dessinerIcones() {
    this.el.querySelectorAll("canvas[data-icone]").forEach((cv) => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = 34 * dpr; cv.height = 34 * dpr;
      const k = cv.getContext("2d");
      k.scale(dpr, dpr);
      icone(k, cv.dataset.icone, 17, 17, 28, COULEURS_TYPE[cv.dataset.icone]);
    });
  }

  /* ── un équipement ── */
  rendreAppareil(a) {
    const hote = !!a.carte;
    const onglets = [["config", "Configuration"], ["ports", "Ports"], ["tables", "Tables"]];
    let h = '<div class="lb-insp-tete"><canvas data-icone="' + a.type + '" aria-hidden="true"></canvas>'
      + '<div class="lb-insp-nom"><input type="text" value="' + ech(a.nom) + '" data-champ="nom" aria-label="Nom de l\'équipement" spellcheck="false">'
      + "<small>" + MODELES[a.type] + (a.allume ? "" : " — éteint") + "</small></div>"
      + '<button type="button" class="lb-b lb-icone" data-act="terminal" title="Ouvrir le terminal" aria-label="Ouvrir le terminal">'
      + '<svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M6 8l2 2-2 2M10 12h4"/></svg></button>'
      + '<button type="button" class="lb-b lb-icone" data-act="alim" title="' + (a.allume ? "Éteindre" : "Allumer") + '" aria-label="Interrupteur"'
      + (a.allume ? "" : ' aria-pressed="true"') + '><svg viewBox="0 0 20 20"><path d="M10 3v7M6 6a6 6 0 1 0 8 0"/></svg></button>'
      + '<button type="button" class="lb-b lb-icone lb-danger" data-act="supprimer" title="Supprimer (Suppr)" aria-label="Supprimer">'
      + '<svg viewBox="0 0 20 20"><path d="M5 6h10M8 6V4.5h4V6M6.5 6l.8 10h5.4l.8-10"/></svg></button></div>'
      + '<div class="lb-insp-onglets" role="tablist">' + onglets.map(([k, t]) => '<button type="button" role="tab" data-onglet="' + k + '" aria-selected="' + (this.onglet === k) + '">' + t + "</button>").join("") + "</div>"
      + '<div class="lb-insp-corps">';
    if (this.onglet === "config") h += hote ? this.rendreConfigHote(a) : this.rendreConfigIOS(a);
    else h += '<div data-dyn>' + (this.onglet === "ports" ? this.rendrePorts(a) : this.rendreTables(a)) + "</div>";
    return h + "</div>";
  }

  rendreConfigHote(a) {
    const c = a.config, p = a.carte;
    const v = (x) => (x ? x.toString() : "");
    let h = '<section class="lb-section"><h3>Configuration IP — FastEthernet0</h3>'
      + '<div class="lb-segment" role="group" aria-label="Mode d\'adressage"><button type="button" data-mode-ip="statique" aria-pressed="' + !c.dhcp + '">Statique</button>'
      + '<button type="button" data-mode-ip="dhcp" aria-pressed="' + !!c.dhcp + '">DHCP</button></div>';
    const ro = c.dhcp ? " readonly" : "";
    h += '<div class="lb-champ"><label>Adresse IPv4</label><input data-ip="ip" value="' + v(p.ip) + '" placeholder="192.168.1.10"' + ro + "></div>"
      + '<div class="lb-champ"><label>Masque</label><input data-ip="masque" value="' + v(p.masque) + '" placeholder="255.255.255.0 ou /24"' + ro + "></div>"
      + '<div class="lb-champ"><label>Passerelle</label><input data-ip="passerelle" value="' + v(c.passerelle) + '" placeholder="192.168.1.1"' + ro + "></div>"
      + '<div class="lb-champ"><label>Serveur DNS</label><input data-ip="dns" value="' + v(c.dns) + '" placeholder="192.168.1.100"' + ro + "></div>";
    if (c.dhcp) h += '<div class="lb-rangee"><button type="button" class="lb-b lb-plein" data-act="dhcp">Demander une adresse (DHCP)</button></div>';
    if (p.ip && c.passerelle && !c.passerelle.dansReseau(p.ip, p.masque)) {
      h += '<p class="lb-texte" style="color:var(--orange)">La passerelle ' + c.passerelle + " n'est pas dans le réseau " + p.ip.reseau(p.masque) + "/" + p.masque.prefixe() + " : elle sera injoignable.</p>";
    }
    h += '<p class="lb-texte">Adresse MAC : <code>' + p.mac.cisco() + "</code></p></section>";
    if (a.type === "serveur") h += this.rendreServices(a);
    return h;
  }

  rendreServices(a) {
    const pool = a.dhcp.pools[0] || {};
    const v = (x) => (x ? x.toString() : "");
    const bascule = (svc, actif) => '<div class="lb-segment"><button type="button" data-service="' + svc + '" data-actif="1" aria-pressed="' + actif + '">Activé</button>'
      + '<button type="button" data-service="' + svc + '" data-actif="0" aria-pressed="' + !actif + '">Arrêté</button></div>';
    let h = '<section class="lb-section"><h3>Service DHCP</h3>' + bascule("dhcp", a.dhcp.actif)
      + '<div class="lb-champ"><label>Nom du pool</label><input data-pool="nom" value="' + ech(pool.nom || "serverPool") + '"></div>'
      + '<div class="lb-champ"><label>Passerelle</label><input data-pool="passerelle" value="' + v(pool.routeur) + '"></div>'
      + '<div class="lb-champ"><label>Serveur DNS</label><input data-pool="dns" value="' + v(pool.dns) + '"></div>'
      + '<div class="lb-champ"><label>Première adresse</label><input data-pool="debut" value="' + v(pool.debut) + '"></div>'
      + '<div class="lb-champ"><label>Masque</label><input data-pool="masque" value="' + v(pool.masque) + '"></div>'
      + '<div class="lb-champ"><label>Nombre max.</label><input data-pool="max" value="' + (pool.max || 50) + '"></div>'
      + '<div class="lb-rangee"><button type="button" class="lb-b" data-act="pool">Enregistrer le pool</button></div>'
      + '<p class="lb-texte">Baux : ' + ([...a.dhcp.baux.values()].map((b) => "<code>" + b.ip + "</code>").join(" ") || "aucun") + "</p></section>";
    h += '<section class="lb-section"><h3>Service DNS</h3>' + bascule("dns", a.dns.actif)
      + '<table class="lb-tableau" style="margin-top:.5rem"><thead><tr><th>Nom</th><th>Adresse (A)</th><th></th></tr></thead><tbody>'
      + a.dns.enregistrements.map((r, i) => "<tr><td>" + ech(r.nom) + "</td><td>" + ech(r.ip) + '</td><td><button type="button" class="lb-b lb-icone" data-dns-suppr="' + i + '" aria-label="Supprimer">×</button></td></tr>').join("")
      + '</tbody></table><div class="lb-rangee"><input data-dns="nom" placeholder="www.exemple.lan" style="flex:1;height:28px" class="lb-entree">'
      + '<input data-dns="ip" placeholder="192.168.1.100" style="width:8.5rem;height:28px"><button type="button" class="lb-b" data-act="dns-ajout">Ajouter</button></div></section>';
    h += '<section class="lb-section"><h3>Service HTTP</h3>' + bascule("web", a.web.actif)
      + '<textarea data-web aria-label="Page web servie">' + ech(a.web.page) + "</textarea></section>";
    return h;
  }

  rendreConfigIOS(a) {
    const run = runningConfig(a).slice(3).join("\n");
    return '<section class="lb-section"><h3>Configurer</h3><p class="lb-texte">Un routeur et un commutateur se configurent '
      + '<b>en ligne de commande</b>, comme en vrai : ouvrez le terminal (double-clic sur l\'équipement, ou le bouton ci-dessous).</p>'
      + '<div class="lb-rangee"><button type="button" class="lb-b lb-plein" data-act="terminal">Ouvrir la CLI de ' + ech(a.nom) + "</button>"
      + '<button type="button" class="lb-b" data-act="startup">' + (a.startup ? "startup-config enregistrée ✓" : "Pas de startup-config") + "</button></div></section>"
      + '<section class="lb-section"><h3>running-config</h3><pre class="lb-term" style="position:static;max-height:28rem;border-radius:8px">' + ech(run) + "</pre></section>";
  }

  rendrePorts(a) {
    const ports = a.tousLesPorts().filter((p) => p.type !== "rs232" || p.cable);
    const sw = a.type === "switch";
    let h = '<table class="lb-tableau"><thead><tr><th>Port</th><th>État</th><th>Relié à</th><th>' + (sw ? "VLAN" : "IP") + "</th></tr></thead><tbody>";
    for (const p of ports) {
      const e = p.etat();
      const relie = p.cable ? p.cable.autre(p).appareil.nom + " " + p.cable.autre(p).court : p.parent ? "(sous-interface)" : p.type === "vlan" ? "(interface VLAN)" : "—";
      const ios = a.type === "routeur" || sw ? etatInterface(a, p) : null;
      const etatTxt = ios ? ios.statut + " / " + ios.protocole : e.texte;
      const col = p.type === "vlan" || p.parent ? (p.estUp() ? "vert" : "rouge") : e.couleur;
      const vl = sw ? (p.type === "vlan" ? p.ip ? p.ip + "/" + p.masque.prefixe() : "—" : p.mode === "trunk" ? "trunk " + (p.allowed === "all" ? "tous" : ecrireListeVlan(p.allowed)) : p.accessVlan)
        : p.ip ? p.ip + "/" + p.masque.prefixe() + (p.dot1q !== null ? " · dot1Q " + p.dot1q : "") : p.dot1q !== null ? "dot1Q " + p.dot1q : "—";
      h += "<tr><td>" + p.court + '</td><td class="sans" title="' + ech(e.texte) + '">' + pastille(col) + ech(etatTxt) + '</td><td class="sans">' + ech(relie) + "</td><td>" + ech(vl) + "</td></tr>";
    }
    return h + "</tbody></table>";
  }

  rendreTables(a) {
    let h = "";
    if (a.ip) {
      const lignes = [...a.ip.arp].map(([ip, e]) => "<tr><td>" + ip + "</td><td>" + e.mac.cisco() + "</td><td>" + e.iface.court + "</td></tr>").join("");
      h += '<section class="lb-section"><h3>Table ARP</h3>' + (lignes ? '<table class="lb-tableau"><thead><tr><th>IP</th><th>MAC</th><th>Interface</th></tr></thead><tbody>' + lignes + "</tbody></table>"
        : '<p class="lb-vide">Vide : rien n\'a encore été résolu.</p>') + '<div class="lb-rangee"><button type="button" class="lb-b" data-act="vider-arp">Vider la table ARP</button></div></section>';
    }
    if (a.type === "switch") {
      const cam = a.entreesCam().map((e) => "<tr><td>" + e.vlan + "</td><td>" + e.mac.cisco() + "</td><td>" + e.port.court + "</td></tr>").join("");
      h += '<section class="lb-section"><h3>Table CAM (adresses MAC)</h3>' + (cam ? '<table class="lb-tableau"><thead><tr><th>VLAN</th><th>MAC</th><th>Port</th></tr></thead><tbody>' + cam + "</tbody></table>"
        : '<p class="lb-vide">Vide : le commutateur n\'a encore vu passer aucune trame.</p>')
        + '<div class="lb-rangee"><button type="button" class="lb-b" data-act="vider-cam">Vider la table CAM</button></div></section>';
      h += '<section class="lb-section"><h3>VLAN</h3><table class="lb-tableau"><thead><tr><th>N°</th><th>Nom</th><th>Ports d\'accès</th></tr></thead><tbody>'
        + [...a.vlans].sort((x, y) => x[0] - y[0]).map(([n, v]) => "<tr><td>" + n + "</td><td>" + ech(v.nom) + "</td><td>"
          + a.ports.filter((p) => p.mode === "access" && p.accessVlan === n && p.type !== "console").map((p) => p.court).join(", ") + "</td></tr>").join("") + "</tbody></table></section>";
    }
    if (a.type === "routeur") {
      const rt = a.routes().map((r) => "<tr><td>" + r.code + "</td><td>" + r.reseau + "/" + r.prefixe + "</td><td>" + (r.via || "connecté") + "</td><td>" + (r.interface ? r.interface.court : "") + "</td></tr>").join("");
      h += '<section class="lb-section"><h3>Table de routage</h3>' + (rt ? '<table class="lb-tableau"><thead><tr><th></th><th>Réseau</th><th>Via</th><th>Sortie</th></tr></thead><tbody>' + rt + "</tbody></table>"
        : '<p class="lb-vide">Vide : aucune interface active n\'a d\'adresse. <code>no shutdown</code> ?</p>') + "</section>";
    }
    return h || '<p class="lb-vide">Pas de table pour cet équipement.</p>';
  }

  /* ── un câble ── */
  rendreCable(c) {
    const v = c.verdict();
    return '<div class="lb-insp-tete"><div class="lb-insp-nom"><b>Câble ' + TYPES_CABLE[c.type].nom.toLowerCase() + "</b><small>"
      + ech(c.a.appareil.nom) + " " + c.a.court + " ↔ " + ech(c.b.appareil.nom) + " " + c.b.court + "</small></div>"
      + '<button type="button" class="lb-b lb-icone lb-danger" data-act="supprimer" title="Supprimer le câble" aria-label="Supprimer le câble">'
      + '<svg viewBox="0 0 20 20"><path d="M5 6h10M8 6V4.5h4V6M6.5 6l.8 10h5.4l.8-10"/></svg></button></div><div class="lb-insp-corps">'
      + '<p class="lb-texte">' + (v.ok ? pastille("vert") + "<b>Le câble convient.</b>" : pastille("rouge") + "<b>Ce câble ne peut pas marcher.</b> " + ech(v.raison)) + "</p>"
      + '<div class="lb-champ"><label>Type</label><select data-champ="type-cable">' + Object.entries(TYPES_CABLE).map(([k, t]) => '<option value="' + k + '"' + (k === c.type ? " selected" : "") + ">" + t.nom + "</option>").join("") + "</select></div>"
      + [c.a, c.b].map((p) => '<p class="lb-texte">' + pastille(p.etat().couleur) + "<b>" + ech(p.appareil.nom) + " " + p.nom + "</b> — " + ech(p.etat().texte) + "</p>").join("")
      + "</div>";
  }

  /* ── rien : le lab ── */
  rendreLab() {
    const lab = this.rappels.lab();
    const n = this.reseau.appareils.length;
    let h = '<div class="lb-insp-corps">';
    if (lab) {
      h += '<section class="lb-section"><h3>' + ech(lab.titre) + '</h3><p class="lb-texte">' + lab.resume + '</p><ol class="lb-etapes">'
        + lab.etapes.map((e) => "<li>" + e + "</li>").join("") + "</ol>"
        + '<div class="lb-rangee"><button type="button" class="lb-b" data-act="recharger-lab">Recharger ce lab</button></div></section>';
    }
    h += '<section class="lb-section"><h3>Topologie</h3><p class="lb-texte">' + n + " équipement" + (n > 1 ? "s" : "") + ", " + this.reseau.cables.length
      + " câble" + (this.reseau.cables.length > 1 ? "s" : "") + ". Cliquez un équipement pour l'inspecter ; double-cliquez pour ouvrir son terminal.</p></section>"
      + '<section class="lb-section"><h3>Raccourcis</h3><table class="lb-tableau"><tbody>'
      + [["Ctrl K", "toutes les commandes"], ["C", "poser un câble (port choisi tout seul)"], ["Espace + glisser", "se déplacer"], ["Molette", "zoomer au pointeur"],
         ["G", "grille magnétique"], ["F", "tout voir"], ["Suppr", "supprimer la sélection"], ["Ctrl 1…9", "changer de terminal"],
         ["P, →", "simulation : lecture, un pas"], ["Ctrl S / Ctrl O", "enregistrer / ouvrir"]]
        .map(([k, t]) => '<tr><td style="width:9.5rem;white-space:nowrap">' + k.split(" / ").map((x) => "<kbd>" + x + "</kbd>").join(" ") + '</td><td class="sans">' + t + "</td></tr>").join("") + "</tbody></table></section>";
    return h + "</div>";
  }

  /* ── les gestes ── */
  clic(e) {
    const b = e.target.closest("button");
    if (!b) return;
    const c = this.cible();
    const a = c.app;
    if (b.hasAttribute("data-fermer-pdu")) { this.ui.sautSel = null; this.rappels.selection(); return; }
    if (b.dataset.onglet) { this.onglet = b.dataset.onglet; this.rendre(true); return; }
    if (b.dataset.modeIp && a) {
      const dhcp = b.dataset.modeIp === "dhcp";
      if (dhcp === !!a.config.dhcp) return;
      a.config.dhcp = dhcp;
      if (dhcp) this.lancerDhcp(a);
      this.rappels.modifie(); this.rendre(true);
      return;
    }
    if (b.dataset.service && a) {
      const actif = b.dataset.actif === "1";
      if (b.dataset.service === "dhcp") a.dhcp.actif = actif; else a[b.dataset.service].actif = actif;
      this.rappels.modifie(); this.rendre(true);
      return;
    }
    if (b.dataset.dnsSuppr !== undefined && a) { a.dns.enregistrements.splice(+b.dataset.dnsSuppr, 1); this.rappels.modifie(); this.rendre(true); return; }
    const act = b.dataset.act;
    if (act === "terminal" && a) this.rappels.terminal(a);
    else if (act === "supprimer") this.rappels.supprimer();
    else if (act === "alim" && a) { a.allume = !a.allume; this.reseau.evaluerLiens(); this.rappels.modifie(); this.rendre(true); }
    else if (act === "dhcp" && a) this.lancerDhcp(a);
    else if (act === "vider-arp" && a) { a.ip.viderArp(); this.rendre(true); }
    else if (act === "vider-cam" && a) { a.viderCam(); this.rendre(true); }
    else if (act === "recharger-lab") this.rappels.rechargerLab();
    else if (act === "pool" && a) this.enregistrerPool(a);
    else if (act === "dns-ajout" && a) {
      const nom = this.el.querySelector('[data-dns="nom"]').value.trim(), ip = this.el.querySelector('[data-dns="ip"]').value.trim();
      if (!nom || !IPv4Address.parse(ip)) { this.rappels.toast("Un nom et une adresse IPv4 valide, s'il vous plaît.", true); return; }
      a.dns.enregistrements.push({ nom, ip });
      this.rappels.modifie(); this.rendre(true);
    } else if (act === "startup" && a) this.rappels.toast(a.startup ? "La startup-config a " + a.startup.length + " lignes (show startup-config)." : "Tapez « copy running-config startup-config » ou « wr » pour l'enregistrer.");
  }

  lancerDhcp(a) {
    a.demanderDhcp((r) => {
      this.rappels.toast(r.type === "ok" ? a.nom + " a reçu " + r.ip + " par DHCP." : "Aucun serveur DHCP n'a répondu : " + a.nom + " prend " + r.ip + " (APIPA).", r.type !== "ok");
      this.rappels.modifie(); this.rendre(true);
    });
    this.reseau.executer();
  }

  enregistrerPool(a) {
    const val = (k) => this.el.querySelector('[data-pool="' + k + '"]').value.trim();
    const debut = IPv4Address.parse(val("debut")), masque = lireMasque(val("masque"));
    if (!debut || !masque) { this.rappels.toast("Première adresse et masque obligatoires pour un pool.", true); return; }
    a.definirPool({ nom: val("nom") || "serverPool", passerelle: IPv4Address.parse(val("passerelle")), dns: IPv4Address.parse(val("dns")),
      debut, masque, max: Math.max(1, parseInt(val("max"), 10) || 50) });
    this.rappels.toast("Pool DHCP enregistré : " + debut + " et suivantes.");
    this.rappels.modifie(); this.rendre(true);
  }

  changement(e) {
    const t = e.target;
    const a = this.cible().app;
    if (t.dataset.champ === "nom" && a) {
      const nom = t.value.trim();
      if (!nom) { t.value = a.nom; return; }
      if (this.reseau.appareils.some((x) => x !== a && x.nom.toLowerCase() === nom.toLowerCase())) {
        this.rappels.toast("« " + nom + " » existe déjà.", true); t.value = a.nom; return;
      }
      a.nom = a.nomUsine = nom; this.rappels.modifie(); this.reseau.emit("topologie");
      return;
    }
    if (t.dataset.champ === "type-cable") { const c = this.cible().cable; c.type = t.value; this.reseau.evaluerLiens(); this.rappels.modifie(); this.rendre(true); return; }
    if (t.dataset.ip && a) this.appliquerIp(a);
    if (t.matches("[data-web]") && a) { a.web.page = t.value; this.rappels.modifie(); }
  }

  /* Le formulaire IP est appliqué champ par champ ; un champ faux est
     souligné de rouge et n'est pas appliqué. */
  appliquerIp(a) {
    const val = (k) => this.el.querySelector('[data-ip="' + k + '"]');
    const ip = val("ip").value.trim(), m = val("masque").value.trim(), g = val("passerelle").value.trim(), d = val("dns").value.trim();
    const pIp = ip ? IPv4Address.parse(ip) : null;
    let pM = m ? lireMasque(m) : null;
    if (pIp && !m) { const o = pIp.n >>> 24; pM = IPv4Address.depuisPrefixe(o < 128 ? 8 : o < 192 ? 16 : 24); val("masque").value = pM.toString(); }
    const pG = g ? IPv4Address.parse(g) : null, pD = d ? IPv4Address.parse(d) : null;
    val("ip").classList.toggle("faux", !!ip && !pIp);
    val("masque").classList.toggle("faux", !!m && !pM);
    val("passerelle").classList.toggle("faux", !!g && !pG);
    val("dns").classList.toggle("faux", !!d && !pD);
    if ((ip && !pIp) || (m && !pM) || (g && !pG) || (d && !pD)) return;
    a.config.dhcp = false;
    a.configurer({ ip: pIp, masque: pIp ? pM : null, passerelle: pG, dns: pD });
    this.rappels.modifie();
    this.reseau.emit("topologie");
  }
}
