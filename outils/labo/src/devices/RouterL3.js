/* Un routeur, façon ISR 2911 : trois ports Gigabit, éteints d'office (« no
   shutdown » est le premier geste de tout TP), des sous-interfaces pour le
   « router-on-a-stick », une table de routage, un serveur DHCP.

   Pour chaque paquet qui n'est pas pour lui :
   1. TTL : à 1, le paquet meurt ici, et l'émetteur reçoit « Time Exceeded » ;
   2. la ROUTE : la plus précise qui contient la destination (préfixe le
      plus long), puis la distance administrative ;
   3. le PROCHAIN SAUT : la destination elle-même si le réseau est
      directement connecté, sinon l'adresse « via » de la route statique ;
   4. l'ARP sur ce prochain saut, et la trame sort — étiquetée si
      l'interface de sortie est une sous-interface dot1Q. */

import { Device } from "./Device.js";
import { Port } from "./Port.js";
import { IpStack } from "./IpStack.js";
import { ServiceDhcp } from "./Server.js";
import { MACAddress } from "../core/MACAddress.js";
import { IPv4Address } from "../core/IPv4Address.js";
import { ETHERTYPE } from "../core/Frame.js";
import { IPv4Packet, UdpDatagram, DhcpMessage, PROTO, PORTS, ICMP, UNREACH } from "../core/Packet.js";
import { Frame } from "../core/Frame.js";

export class RouterL3 extends Device {
  constructor(opts) {
    super(opts);
    this.type = "routeur";
    this.famille = "hote";
    this.modele = "ISR 2911";
    for (let i = 0; i <= 2; i++) {
      this.ports.push(new Port(this, "GigabitEthernet0/" + i, { type: "gi", mac: MACAddress.generer(0x0001c9), adminUp: false }));
    }
    this.ports.push(new Port(this, "Console", { type: "console" }));
    this.sous = [];
    this.boucles = [];            // interfaces Loopback
    this.statiques = [];          // { reseau, masque, via, sortie, distance }
    this.ip = new IpStack(this, { ttl: 255, abandonSurArp: true });
    this.dhcp = new ServiceDhcp(this);
    this.extra = {};
    this.startup = null;
    this.ip.udp.set(PORTS.DHCP_SERVEUR, (iface, paquet) => this.dhcpEntrant(iface, paquet));
  }

  tousLesPorts() { return this.ports.concat(this.sous, this.boucles); }
  interfacesL3() { return this.tousLesPorts().filter((p) => p.ip && p.masque && p.estUp()); }
  estLocal(ip) { return this.interfacesL3().some((i) => ip.dansReseau(i.ip, i.masque)); }

  creerSous(nom) {
    let s = this.sous.find((x) => x.nom === nom);
    if (s) return s;
    const parent = this.port(nom.split(".")[0]);
    if (!parent || parent.type !== "gi") return null;
    s = new Port(this, nom, { type: "sous", parent, mac: parent.mac, adminUp: true });
    this.sous.push(s);
    this.sous.sort((a, b) => a.nom.localeCompare(b.nom, "en", { numeric: true }));
    return s;
  }

  creerBoucle(nom) {
    let b = this.boucles.find((x) => x.nom === nom);
    if (!b) {
      b = new Port(this, nom, { type: "loop", adminUp: true });
      this.boucles.push(b);
      this.boucles.sort((a, c) => a.nom.localeCompare(c.nom, "en", { numeric: true }));
    }
    return b;
  }

  /* « reload » : la configuration en cours disparaît ; l'appelant rejoue
     ensuite la startup-config. Le nom affiché reste celui du canevas tant
     que la startup-config n'en donne pas un autre. */
  reinitialiser() {
    for (const p of this.ports) { if (p.type === "console") continue; p.adminUp = false; p.ip = null; p.masque = null; p.helper = null; p.description = ""; }
    this.nom = this.nomUsine;
    this.sous = []; this.boucles = []; this.statiques = [];
    this.dhcp = new ServiceDhcp(this);
    this.ip.viderArp();
    this.extra = {};
  }

  /* ── la table de routage, recalculée à chaque lecture ── */
  routes() {
    const out = [];
    for (const i of this.interfacesL3()) {
      const net = i.ip.reseau(i.masque);
      out.push({ code: "C", reseau: net, masque: i.masque, prefixe: i.masque.prefixe(), via: null, interface: i, distance: 0 });
      out.push({ code: "L", reseau: i.ip, masque: IPv4Address.depuisPrefixe(32), prefixe: 32, via: null, interface: i, distance: 0 });
    }
    for (const s of this.statiques) {
      const sortie = s.sortie ? this.port(s.sortie) : null;
      // une route statique n'est installée que si son prochain saut est
      // joignable (ou son interface de sortie active) — sinon IOS la retire
      const utile = sortie ? sortie.estUp() : !!this.connectee(s.via);
      if (utile) out.push({ code: "S", reseau: s.reseau, masque: s.masque, prefixe: s.masque.prefixe(), via: s.via, interface: sortie, distance: s.distance || 1 });
    }
    return out;
  }
  connectee(ip) {
    return this.interfacesL3().find((i) => ip.dansReseau(i.ip, i.masque)) || null;
  }
  chercherRoute(dst) {
    let meilleure = null;
    for (const r of this.routes()) {
      if (!dst.dansReseau(r.reseau, r.masque)) continue;
      if (!meilleure || r.prefixe > meilleure.prefixe || (r.prefixe === meilleure.prefixe && r.distance < meilleure.distance)) meilleure = r;
    }
    return meilleure;
  }
  route(dst) {
    const r = this.chercherRoute(dst);
    if (!r) return { erreur: "aucune route vers " + dst };
    if (r.code === "C" || r.code === "L") return { iface: r.interface, saut: dst, r };
    if (r.via) {
      const i = this.connectee(r.via);
      if (!i) return { erreur: "prochain saut " + r.via + " injoignable" };
      return { iface: i, saut: r.via, r };
    }
    return { iface: r.interface, saut: dst, r };
  }

  /* ── une trame arrive sur un port physique ── */
  recevoirTrame(port, trame) {
    if (port.type === "console") return;
    let iface = port;
    if (trame.vlan !== null) {
      iface = this.sous.find((s) => s.parent === port && s.dot1q === trame.vlan && !s.dot1qNatif);
      if (!iface) {
        this.noter("Trame étiquetée VLAN " + trame.vlan + " sur " + port.court + ", mais aucune sous-interface « encapsulation dot1Q "
          + trame.vlan + " » : jetée.");
        this.reseau.issue("jetee");
        return;
      }
      this.noter("Étiquette VLAN " + trame.vlan + " : la trame est pour la sous-interface " + iface.court + ".");
    } else if (!port.ip) {
      const natif = this.sous.find((s) => s.parent === port && s.dot1qNatif);
      if (natif) iface = natif;
    }
    if (!trame.dst.egale(port.mac) && !trame.dst.estDiffusion()) {
      this.noter("La trame est pour " + trame.dst.cisco() + ", pas pour " + this.nom + " : ignorée.");
      this.reseau.issue("ignoree");
      return;
    }
    if (!iface.ip || !iface.estUp()) {
      this.noter(iface.court + " n'a pas d'adresse IP (ou est éteinte) : le routeur ne traite pas la trame.");
      this.reseau.issue("jetee");
      return;
    }
    if (trame.etherType === ETHERTYPE.ARP) { this.ip.recevoirArp(iface, trame.payload); return; }
    const p = trame.payload;
    if (this.ip.estPourMoi(iface, p)) { this.ip.livrer(iface, p); return; }
    this.acheminer(iface, p);
  }

  acheminer(entree, paquet) {
    const pfx = (r) => r.reseau + "/" + r.prefixe;
    if (paquet.dst.estDiffusionLimitee()) {
      this.noter("Un routeur ne transmet jamais une diffusion : elle s'arrête ici.");
      this.reseau.issue("jetee");
      return;
    }
    if (paquet.ttl <= 1) {
      this.noter("Le TTL arrive à zéro sur " + this.nom + " : paquet détruit, « Time Exceeded » renvoyé à " + paquet.src + ".");
      this.reseau.issue("jetee");
      this.ip.erreurIcmp(paquet, ICMP.TIME_EXCEEDED, 0, entree);
      return;
    }
    const r = this.route(paquet.dst);
    if (r.erreur) {
      this.noter("Aucune route vers " + paquet.dst + " dans la table de " + this.nom + " : « Destination Unreachable » renvoyé à " + paquet.src + ".");
      this.reseau.issue("jetee");
      this.ip.erreurIcmp(paquet, ICMP.UNREACHABLE, UNREACH.NET, entree);
      return;
    }
    const copie = paquet.clone();
    copie.ttl = paquet.ttl - 1;
    this.noter("Route choisie : " + r.r.code + " " + pfx(r.r) + (r.r.via ? " via " + r.r.via : ", directement connectée")
      + " (préfixe le plus long). Sortie par " + r.iface.court + ". TTL " + paquet.ttl + " → " + copie.ttl + ".");
    this.ip.envoyerVia(copie, r.iface, r.saut);
  }

  /* ── DHCP : servir soi-même, ou relayer (ip helper-address) ── */
  dhcpEntrant(iface, paquet) {
    const m = paquet.payload.data;
    if (!(m instanceof DhcpMessage)) return;
    const versClient = m.op === "OFFER" || m.op === "ACK" || m.op === "NAK";
    if (versClient) {
      const sortie = m.giaddr && this.interfacesL3().find((i) => i.ip.egale(m.giaddr));
      if (!sortie) { this.noter("Réponse DHCP qui ne concerne aucun relais de " + this.nom + " : ignorée."); return; }
      this.noter(this.nom + " relaie la réponse DHCP " + m.op + " vers le client, en diffusion sur " + sortie.court + ".");
      const p = new IPv4Packet({ src: sortie.ip, dst: IPv4Address.DIFFUSION, protocol: PROTO.UDP, ttl: 255,
        payload: new UdpDatagram({ srcPort: PORTS.DHCP_SERVEUR, dstPort: PORTS.DHCP_CLIENT, data: m.clone() }) });
      sortie.envoyer(new Frame({ src: sortie.mac, dst: MACAddress.DIFFUSION, etherType: ETHERTYPE.IPV4, payload: p }));
      return;
    }
    if (this.dhcp.poolPour(iface, m)) { this.dhcp.recevoir(iface, paquet); return; }
    if (iface.helper) {
      const relaye = m.clone();
      if (!relaye.giaddr || relaye.giaddr.estZero()) relaye.giaddr = iface.ip;
      this.noter(this.nom + " n'a pas de pool pour ce réseau, mais " + iface.court + " a « ip helper-address " + iface.helper
        + " » : il relaie le " + m.op + " en unicast, avec giaddr = " + relaye.giaddr + ".");
      this.ip.envoyer(new IPv4Packet({ src: iface.ip, dst: iface.helper, protocol: PROTO.UDP, ttl: 255,
        payload: new UdpDatagram({ srcPort: PORTS.DHCP_SERVEUR, dstPort: PORTS.DHCP_SERVEUR, data: relaye }) }));
      return;
    }
    this.noter("DHCP " + m.op + " reçu sur " + iface.court + " : aucun pool, aucun relais. La diffusion s'arrête au routeur.");
  }

  lienChange(port, up) {
    if (port.type === "console") return;
    this.annoncerLien(port, up);
  }

  toJSON() {
    const j = super.toJSON();
    const s = (x) => (x ? x.toString() : null);
    j.sous = this.sous.map((p) => p.toJSON());
    j.boucles = this.boucles.map((p) => p.toJSON());
    j.statiques = this.statiques.map((r) => ({ reseau: s(r.reseau), masque: s(r.masque), via: s(r.via), sortie: r.sortie || null, distance: r.distance || 1 }));
    j.dhcp = this.dhcp.toJSON();
    j.extra = this.extra;
    j.startup = this.startup;
    return j;
  }
  appliquerJSON(j) {
    const P = IPv4Address.parse;
    (j.sous || []).forEach((sj) => {
      const p = this.creerSous(sj.nom);
      if (!p) return;
      p.adminUp = sj.adminUp !== false;
      p.dot1q = sj.dot1q ?? null; p.dot1qNatif = !!sj.dot1qNatif;
      p.ip = P(sj.ip); p.masque = P(sj.masque); p.helper = P(sj.helper);
      if (sj.description) p.description = sj.description;
    });
    (j.boucles || []).forEach((bj) => {
      const b = this.creerBoucle(bj.nom);
      b.adminUp = bj.adminUp !== false; b.ip = P(bj.ip); b.masque = P(bj.masque);
      if (bj.description) b.description = bj.description;
    });
    this.statiques = (j.statiques || []).map((r) => ({ reseau: P(r.reseau), masque: P(r.masque), via: P(r.via), sortie: r.sortie, distance: r.distance || 1 }));
    this.dhcp.appliquerJSON(j.dhcp);
    this.extra = j.extra || {};
    this.startup = j.startup || null;
  }
}
