/* Un commutateur de niveau 2, façon Catalyst 2960 : 24 ports FastEthernet,
   2 ports Gigabit (cuivre ou fibre), une interface VLAN 1 pour l'administrer.

   Pour chaque trame, dans cet ordre — et chaque étape est écrite au
   journal, puisque c'est exactement ce qu'on demande d'expliquer en TP :
   1. le VLAN de la trame : celui du port d'accès, ou l'étiquette 802.1Q
      lue sur le trunk (le VLAN natif si elle n'en a pas) ;
   2. l'APPRENTISSAGE : la MAC source est notée, avec son port et son VLAN ;
   3. la DÉCISION : diffusion ou MAC inconnue → inondation dans le VLAN,
      MAC connue → un seul port, MAC connue sur le port d'arrivée → filtrée ;
   4. la SORTIE : sans étiquette en accès, étiquetée sur un trunk (sauf le
      VLAN natif). Un VLAN ne déborde jamais sur un autre. */

import { Device } from "./Device.js";
import { Port } from "./Port.js";
import { IpStack } from "./IpStack.js";
import { MACAddress } from "../core/MACAddress.js";
import { IPv4Address } from "../core/IPv4Address.js";
import { ETHERTYPE } from "../core/Frame.js";
import { ServiceCdp, CDP_MAC } from "./Cdp.js";

export const VIEILLISSEMENT = 300000;      // 300 s, comme IOS

/* « 10,20,30-35 » → Set. null si l'écriture est fausse. */
export function lireListeVlan(s) {
  const out = new Set();
  for (const morceau of String(s).split(",")) {
    const m = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(morceau);
    if (!m) return null;
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b > 4094 || a > b) return null;
    for (let v = a; v <= b; v++) out.add(v);
  }
  return out;
}
export function ecrireListeVlan(set) {
  const v = [...set].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < v.length; i++) {
    let j = i;
    while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++;
    out.push(j > i ? v[i] + "-" + v[j] : String(v[i]));
    i = j;
  }
  return out.join(",");
}

export class SwitchL2 extends Device {
  constructor(opts) {
    super(opts);
    this.type = "switch";
    this.famille = "commutateur";
    this.modele = "2960-24TT";
    this.base = MACAddress.generer(0x000c85);
    for (let i = 1; i <= 24; i++) this.ports.push(new Port(this, "FastEthernet0/" + i, { type: "fa", mac: MACAddress.generer(0x000c85) }));
    for (let i = 1; i <= 2; i++) this.ports.push(new Port(this, "GigabitEthernet0/" + i, { type: "gi", fibre: true, mac: MACAddress.generer(0x000c85) }));
    this.ports.push(new Port(this, "Console", { type: "console" }));
    // L'interface VLAN 1 existe d'office, éteinte, sans adresse : IOS fait pareil.
    this.svis = [new Port(this, "Vlan1", { type: "vlan", mac: this.base, adminUp: false })];
    this.vlans = new Map([[1, { nom: "default" }]]);
    this.cam = new Map();
    this.ip = new IpStack(this, { ttl: 255, abandonSurArp: true });
    this.passerelle = null;          // ip default-gateway
    this.extra = {};                 // enable secret, lignes, bannière : pour « show run »
    this.startup = null;
    this.cdp = new ServiceCdp(this);
  }

  tousLesPorts() { return this.ports.concat(this.svis); }
  vlanDeSvi(svi) { return +svi.nom.slice(4); }
  interfacesL3() { return this.svis.filter((s) => s.ip && s.estUp()); }
  estLocal(ip) { return this.interfacesL3().some((s) => ip.dansReseau(s.ip, s.masque)); }

  /* Une interface VLAN est « up » si son VLAN existe et qu'au moins un port
     actif le transporte — sinon IOS l'affiche « up / down ». */
  sviActive(svi) {
    const v = this.vlanDeSvi(svi);
    if (!this.vlans.has(v)) return false;
    return this.ports.some((p) => p.type !== "console" && p.estUp() && this.transporte(p, v));
  }

  route(dst) {
    const svi = this.interfacesL3().find((s) => dst.estDiffusionLimitee() || dst.dansReseau(s.ip, s.masque));
    if (svi) return { iface: svi, saut: dst };
    const une = this.interfacesL3()[0];
    if (!une) return { erreur: "aucune interface VLAN active avec une adresse" };
    if (!this.passerelle) return { erreur: "pas de « ip default-gateway »" };
    return { iface: une, saut: this.passerelle };
  }

  /* ── les VLAN d'un port ── */
  transporte(port, vlan) {
    if (port.mode === "trunk") return port.allowed === "all" || port.allowed.has(vlan);
    return port.accessVlan === vlan;
  }
  raisonBlocage(port) {
    if (port.type === "console" || port.estVirtuel()) return null;
    if (port.mode === "access" && !this.vlans.has(port.accessVlan)) {
      return "VLAN " + port.accessVlan + " inexistant : port inactif";
    }
    return null;
  }

  /* ── la table CAM ── */
  cleCam(vlan, mac) { return vlan + "|" + mac.cle(); }
  apprendre(vlan, mac, port) {
    if (mac.estGroupe()) return;
    const cle = this.cleCam(vlan, mac);
    const e = this.cam.get(cle);
    const t = this.reseau.horloge.t;
    if (!e) this.noter(this.nom + " apprend " + mac.cisco() + " sur " + port.court + " (VLAN " + vlan + ").");
    else if (e.port !== port) this.noter(mac.cisco() + " a changé de port : " + e.port.court + " → " + port.court + ". La table CAM est mise à jour.");
    // une adresse retenue par la sécurité de port est STATIC dans la table
    this.cam.set(cle, { vlan, mac, port, type: port.secu && port.secu.actif ? "STATIC" : "DYNAMIC", vu: t });
  }
  chercher(vlan, mac) {
    const cle = this.cleCam(vlan, mac);
    const e = this.cam.get(cle);
    if (!e) return null;
    // vieillissement appliqué à la lecture
    if (this.reseau.horloge.t - e.vu > VIEILLISSEMENT) { this.cam.delete(cle); return null; }
    return e;
  }
  entreesCam() {
    const t = this.reseau ? this.reseau.horloge.t : 0;
    return [...this.cam.values()].filter((e) => t - e.vu <= VIEILLISSEMENT);
  }
  viderCam() { this.cam.clear(); }

  /* ── la sécurité de port ──────────────────────────────────────────
     Un port sécurisé n'accepte qu'un nombre fixé d'adresses MAC source.
     Les premières vues sont retenues (et écrites dans la configuration si
     « sticky ») ; au-delà, c'est une VIOLATION, et le mode décide :
     protect jette sans rien dire, restrict jette et compte, shutdown met le
     port en « err-disabled » — il ne revient qu'après shutdown / no shutdown. */
  securite(port) {
    if (!port.secu) port.secu = { actif: false, max: 1, violation: "shutdown", sticky: false, adresses: [], violations: 0, derniere: null };
    return port.secu;
  }
  controlerSecurite(port, trame) {
    const s = port.secu;
    const mac = trame.src;
    const vlan = port.mode === "access" ? port.accessVlan : (trame.vlan ?? port.native);
    s.derniere = { mac, vlan };
    if (s.adresses.some((a) => a.mac.egale(mac))) return true;
    if (s.adresses.length < s.max) {
      s.adresses.push({ mac, vlan, type: s.sticky ? "sticky" : "dynamic" });
      this.noter("Sécurité de port sur " + port.court + " : " + mac.cisco() + " est retenue (" + s.adresses.length + "/" + s.max
        + (s.sticky ? ", sticky : elle entre dans la running-config" : "") + ").");
      if (s.sticky) this.reseau.emit("config", this);
      return true;
    }
    s.violations++;
    const alerte = "%PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address " + mac.cisco() + " on port " + port.nom + ".";
    if (s.violation === "protect") {
      this.noter("VIOLATION sur " + port.court + " : " + mac.cisco() + " dépasse les " + s.max + " adresse(s) autorisée(s). Mode protect : trame jetée, sans alerte.");
    } else if (s.violation === "restrict") {
      this.noter("VIOLATION sur " + port.court + " : " + mac.cisco() + " dépasse les " + s.max + " adresse(s) autorisée(s). Mode restrict : trame jetée, violation comptée (" + s.violations + ").");
      this.console(alerte);
    } else {
      this.noter("VIOLATION sur " + port.court + " : " + mac.cisco() + " dépasse les " + s.max + " adresse(s) autorisée(s). Mode shutdown : le port passe en err-disabled.");
      this.console("%PM-4-ERR_DISABLE: psecure-violation error detected on " + port.court + ", putting " + port.court + " in err-disable state");
      this.console(alerte);
      port.errDisabled = true;
      this.reseau.evaluerLiens();
    }
    this.reseau.issue("jetee");
    return false;
  }

  /* ── une trame arrive ── */
  recevoirTrame(port, trame) {
    if (port.type === "console") return;
    if (!port.estUp()) { this.noter(port.court + " est hors service : trame perdue."); this.reseau.issue("jetee"); return; }
    if (port.secu && port.secu.actif && !this.controlerSecurite(port, trame)) return;
    // une annonce CDP est pour le commutateur lui-même : il la lit et ne la relaie jamais
    if (trame.dst.egale(CDP_MAC)) { this.cdp.recevoir(port, trame.payload); return; }
    let vlan;
    if (port.mode === "access") {
      if (this.raisonBlocage(port)) { this.noter(port.court + " : " + this.raisonBlocage(port) + ". La trame est jetée."); this.reseau.issue("jetee"); return; }
      if (trame.vlan !== null) {
        this.noter("Trame étiquetée (VLAN " + trame.vlan + ") reçue sur " + port.court + ", qui est un port d'accès : jetée.");
        this.reseau.issue("jetee");
        return;
      }
      vlan = port.accessVlan;
      this.noter("Trame reçue sur " + port.court + ", port d'accès du VLAN " + vlan + ".");
    } else {
      vlan = trame.vlan === null ? port.native : trame.vlan;
      if (trame.vlan === null) this.noter("Trame sans étiquette sur le trunk " + port.court + " : elle appartient au VLAN natif, " + vlan + ".");
      else this.noter("Trame étiquetée 802.1Q sur le trunk " + port.court + " : VLAN " + vlan + ".");
      if (!this.transporte(port, vlan)) {
        this.noter("Le VLAN " + vlan + " n'est pas autorisé sur ce trunk (switchport trunk allowed vlan) : trame jetée.");
        this.reseau.issue("jetee");
        return;
      }
    }
    if (!this.vlans.has(vlan)) {
      this.noter("Le VLAN " + vlan + " n'existe pas sur " + this.nom + " : trame jetée.");
      this.reseau.issue("jetee");
      return;
    }
    this.apprendre(vlan, trame.src, port);

    const svi = this.svis.find((s) => this.vlanDeSvi(s) === vlan && s.estUp());
    if (svi && trame.dst.egale(svi.mac)) {
      this.noter("La trame est pour l'interface " + svi.court + " du commutateur lui-même.");
      this.livrerSvi(svi, trame);
      return;
    }
    if (trame.dst.estDiffusion() || trame.dst.estGroupe()) {
      this.noter("Diffusion : " + this.nom + " l'inonde dans le VLAN " + vlan + ", sur tous ses ports sauf " + port.court + ".");
      this.inonder(vlan, trame, port);
      if (svi) this.livrerSvi(svi, trame);
      return;
    }
    const e = this.chercher(vlan, trame.dst);
    if (!e) {
      this.noter(trame.dst.cisco() + " n'est pas dans la table CAM (VLAN " + vlan + ") : unicast inconnu, inondé.");
      this.inonder(vlan, trame, port);
      return;
    }
    if (e.port === port) {
      this.noter(trame.dst.cisco() + " est connue sur le port même d'arrivée (" + port.court + ") : trame filtrée.");
      this.reseau.issue("filtree");
      return;
    }
    this.noter(trame.dst.cisco() + " est connue sur " + e.port.court + " : la trame ne sort que par là.");
    this.sortir(e.port, trame, vlan);
  }

  ports_du_vlan(vlan) {
    return this.ports.filter((p) => p.type !== "console" && p.cable && p.estUp() && !this.raisonBlocage(p) && this.transporte(p, vlan));
  }
  inonder(vlan, trame, sauf) {
    const sorties = this.ports_du_vlan(vlan).filter((p) => p !== sauf);
    if (!sorties.length) this.noter("Aucun autre port actif dans le VLAN " + vlan + " : la trame s'arrête ici.");
    sorties.forEach((p) => this.sortir(p, trame, vlan));
  }
  sortir(port, trame, vlan) {
    const t = trame.clone();
    if (port.mode === "trunk") {
      t.vlan = vlan === port.native ? null : vlan;
      this.noter(t.vlan === null ? "Sortie par le trunk " + port.court + " sans étiquette (VLAN natif " + vlan + ")."
        : "Sortie par le trunk " + port.court + " avec l'étiquette 802.1Q VLAN " + vlan + ".");
    } else {
      t.vlan = null;
    }
    port.envoyer(t);
  }

  /* ── l'interface VLAN : le commutateur comme hôte ── */
  livrerSvi(svi, trame) {
    if (trame.etherType === ETHERTYPE.ARP) { this.ip.recevoirArp(svi, trame.payload); return; }
    const p = trame.payload;
    if (this.ip.estPourMoi(svi, p)) this.ip.livrer(svi, p);
  }
  envoyerDepuisSvi(svi, trame) {
    const vlan = this.vlanDeSvi(svi);
    const t = trame.clone();
    t.vlan = null;
    if (t.dst.estDiffusion()) { this.inonder(vlan, t, null); return true; }
    const e = this.chercher(vlan, t.dst);
    if (e) this.sortir(e.port, t, vlan); else this.inonder(vlan, t, null);
    return true;
  }

  demarrer() { this.cdp.annoncerPartout(); }

  lienChange(port, up) {
    if (port.type === "console" || port.estVirtuel()) return;
    this.annoncerLien(port, up);
    if (up) this.cdp.annoncer(port);
    if (!up) {
      this.cdp.oublier(port);
      for (const [k, e] of this.cam) if (e.port === port) this.cam.delete(k);
      // les adresses sécurisées dynamiques s'effacent quand le port tombe ;
      // les sticky restent, elles sont dans la configuration
      if (port.secu) port.secu.adresses = port.secu.adresses.filter((a) => a.type !== "dynamic");
    }
  }

  /* « reload » : les ports reviennent à leurs réglages d'usine. Les VLAN,
     eux, survivent : ils sont dans vlan.dat, pas dans la configuration —
     c'est pour ça qu'on efface aussi vlan.dat pour repartir de zéro. */
  reinitialiser() {
    for (const p of this.ports) {
      if (p.type === "console") continue;
      p.adminUp = true; p.mode = "access"; p.accessVlan = 1; p.native = 1; p.allowed = "all"; p.description = ""; p._modeExplicite = false;
      p.secu = null; p.errDisabled = false;
    }
    this.svis = [new Port(this, "Vlan1", { type: "vlan", mac: this.base, adminUp: false })];
    this.nom = this.nomUsine;
    this.passerelle = null;
    this.extra = {};
    this.viderCam();
    this.ip.viderArp();
    this.cdp = new ServiceCdp(this);
  }

  creerSvi(vlan) {
    let s = this.svis.find((x) => this.vlanDeSvi(x) === vlan);
    if (!s) {
      s = new Port(this, "Vlan" + vlan, { type: "vlan", mac: this.base, adminUp: true });
      this.svis.push(s);
    }
    return s;
  }

  toJSON() {
    const j = super.toJSON();
    j.vlans = [...this.vlans].map(([n, v]) => ({ n, nom: v.nom }));
    j.svis = this.svis.map((s) => s.toJSON());
    j.securite = this.ports.filter((p) => p.secu).map((p) => ({ port: p.nom, actif: p.secu.actif, max: p.secu.max, violation: p.secu.violation,
      sticky: p.secu.sticky, adresses: p.secu.adresses.filter((a) => a.type !== "dynamic").map((a) => ({ mac: a.mac.cisco(), vlan: a.vlan, type: a.type })),
      errDisabled: p.errDisabled || undefined }));
    j.passerelle = this.passerelle ? this.passerelle.toString() : null;
    j.extra = this.extra;
    j.startup = this.startup;
    if (!this.cdp.actif) j.cdp = false;
    return j;
  }
  appliquerJSON(j) {
    this.vlans = new Map((j.vlans || [{ n: 1, nom: "default" }]).map((v) => [v.n, { nom: v.nom }]));
    (j.svis || []).forEach((sj) => {
      const s = this.creerSvi(+sj.nom.slice(4));
      s.adminUp = sj.adminUp !== false;
      s.ip = IPv4Address.parse(sj.ip); s.masque = IPv4Address.parse(sj.masque);
    });
    this.passerelle = IPv4Address.parse(j.passerelle);
    (j.securite || []).forEach((sj) => {
      const p = this.port(sj.port);
      if (!p) return;
      p.secu = { actif: !!sj.actif, max: sj.max || 1, violation: sj.violation || "shutdown", sticky: !!sj.sticky, violations: 0, derniere: null,
        adresses: (sj.adresses || []).map((a) => ({ mac: MACAddress.parse(a.mac), vlan: a.vlan, type: a.type })).filter((a) => a.mac) };
      p.errDisabled = !!sj.errDisabled;
    });
    this.extra = j.extra || {};
    this.startup = j.startup || null;
    this.cdp.actif = j.cdp !== false;
  }
}
