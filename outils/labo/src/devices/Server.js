/* Un serveur : un PC qui rend des services — DHCP, DNS, HTTP.

   Le service DHCP est écrit une fois, ici, et sert aussi au routeur
   (« ip dhcp pool ») : la logique d'attribution est la même ; seule change
   la façon de décrire le pool (champs du serveur façon Packet Tracer, ou
   commandes IOS). */

import { HostPC } from "./HostPC.js";
import { MACAddress } from "../core/MACAddress.js";
import { IPv4Address } from "../core/IPv4Address.js";
import { Frame, ETHERTYPE } from "../core/Frame.js";
import { IPv4Packet, UdpDatagram, TcpSegment, DhcpMessage, DnsMessage, PROTO, PORTS } from "../core/Packet.js";

/* ═══════════════ Le service DHCP (RFC 2131, réduit) ═══════════════ */
export class ServiceDhcp {
  constructor(app) {
    this.app = app;
    this.actif = true;
    this.pools = [];          // { nom, reseau, masque, routeur, dns, debut, max }
    this.exclues = [];        // [{ de, a }]
    this.baux = new Map();    // mac → { ip, pool }
  }

  /* Le pool qui sert ce client : celui dont le réseau contient l'adresse
     du relais (giaddr), sinon celle de l'interface qui a reçu la demande.
     C'est la règle d'IOS, et c'est pour ça qu'un seul serveur peut servir
     plusieurs VLAN à travers des « ip helper-address ». */
  poolPour(iface, msg) {
    const ref = (msg.giaddr && !msg.giaddr.estZero()) ? msg.giaddr : iface.ip;
    if (!ref) return null;
    return this.pools.find((p) => p.reseau && p.masque && ref.dansReseau(p.reseau, p.masque)) || null;
  }

  exclue(ip) { return this.exclues.some((x) => ip.n >= x.de.n && ip.n <= x.a.n); }

  allouer(pool, mac) {
    const deja = this.baux.get(mac.cle());
    if (deja && deja.pool === pool) return deja.ip;
    const debut = pool.debut ? pool.debut.n : pool.reseau.n + 1;
    const fin = Math.min(pool.reseau.diffusion(pool.masque).n - 1, pool.max ? debut + pool.max - 1 : Infinity);
    const prises = new Set([...this.baux.values()].map((b) => b.ip.n));
    const miennes = new Set(this.app.interfacesL3().map((i) => i.ip.n));
    for (let n = debut; n <= fin; n++) {
      const ip = new IPv4Address(n);
      if (prises.has(n) || miennes.has(n) || this.exclue(ip) || (pool.routeur && pool.routeur.n === n)) continue;
      return ip;
    }
    return null;
  }

  recevoir(iface, paquet) {
    const m = paquet.payload.data;
    if (!this.actif) { this.app.noter("Le service DHCP de " + this.app.nom + " est arrêté : demande ignorée."); return; }
    const pool = this.poolPour(iface, m);
    if (m.op === "RELEASE") {
      this.baux.delete(m.chaddr.cle());
      this.app.noter(this.app.nom + " reprend l'adresse " + m.ciaddr + " (RELEASE).");
      return;
    }
    if (!pool) {
      this.app.noter(this.app.nom + " n'a aucun pool DHCP pour le réseau de " + (m.giaddr && !m.giaddr.estZero() ? "relais " + m.giaddr : iface.court) + " : pas de réponse.");
      return;
    }
    if (m.op === "DISCOVER") {
      const ip = this.allouer(pool, m.chaddr);
      if (!ip) { this.app.noter("Le pool « " + pool.nom + " » est épuisé : pas d'offre."); return; }
      this.app.noter(this.app.nom + " (pool « " + pool.nom + " ») propose " + ip + " à " + m.chaddr.cisco() + " : DHCP OFFER.");
      this.repondre(iface, m, "OFFER", ip, pool);
    } else if (m.op === "REQUEST") {
      const voulue = m.options.requestedIp;
      // disponible : dans le pool, pas exclue, et pas déjà louée à un autre
      const prise = voulue && [...this.baux.values()].some((b) => b.ip.egale(voulue) && !b.mac.egale(m.chaddr));
      const ok = !!voulue && !prise && voulue.dansReseau(pool.reseau, pool.masque) && !this.exclue(voulue);
      const sid = m.options.serverId;
      if (sid && !this.app.interfacesL3().some((i) => i.ip.egale(sid))) {
        this.app.noter("Ce REQUEST accepte l'offre d'un autre serveur (" + sid + ") : " + this.app.nom + " se tait.");
        return;
      }
      if (!ok) { this.app.noter("L'adresse demandée n'est pas disponible : DHCP NAK."); this.repondre(iface, m, "NAK", null, pool); return; }
      this.baux.set(m.chaddr.cle(), { ip: voulue, pool, mac: m.chaddr });
      this.app.noter(this.app.nom + " confirme le bail de " + voulue + " pour " + m.chaddr.cisco() + " : DHCP ACK.");
      this.repondre(iface, m, "ACK", voulue, pool);
    }
  }

  repondre(iface, m, op, ip, pool) {
    const serverId = iface.ip;
    const msg = new DhcpMessage({ op, xid: m.xid, chaddr: m.chaddr, yiaddr: ip, giaddr: m.giaddr,
      options: { mask: pool.masque, router: pool.routeur || null, dns: pool.dns || null, serverId, lease: 86400 } });
    const relais = m.giaddr && !m.giaddr.estZero();
    if (relais) {
      // la réponse revient au relais, en unicast, sur le port serveur
      this.app.ip.envoyer(new IPv4Packet({ src: iface.ip, dst: m.giaddr, protocol: PROTO.UDP, ttl: this.app.ip.ttl,
        payload: new UdpDatagram({ srcPort: PORTS.DHCP_SERVEUR, dstPort: PORTS.DHCP_SERVEUR, data: msg }) }));
      return;
    }
    // le client n'a pas encore d'adresse : on lui répond en diffusion
    const paquet = new IPv4Packet({ src: iface.ip, dst: IPv4Address.DIFFUSION, protocol: PROTO.UDP, ttl: this.app.ip.ttl,
      payload: new UdpDatagram({ srcPort: PORTS.DHCP_SERVEUR, dstPort: PORTS.DHCP_CLIENT, data: msg }) });
    iface.envoyer(new Frame({ src: iface.mac, dst: MACAddress.DIFFUSION, etherType: ETHERTYPE.IPV4, payload: paquet }));
  }

  toJSON() {
    const s = (x) => (x ? x.toString() : null);
    return { actif: this.actif,
      pools: this.pools.map((p) => ({ nom: p.nom, reseau: s(p.reseau), masque: s(p.masque), routeur: s(p.routeur),
        dns: s(p.dns), debut: s(p.debut), max: p.max || null })),
      exclues: this.exclues.map((x) => ({ de: s(x.de), a: s(x.a) })) };
  }
  appliquerJSON(j) {
    if (!j) return;
    const P = IPv4Address.parse;
    this.actif = j.actif !== false;
    this.pools = (j.pools || []).map((p) => ({ nom: p.nom, reseau: P(p.reseau), masque: P(p.masque), routeur: P(p.routeur),
      dns: P(p.dns), debut: P(p.debut), max: p.max || null }));
    this.exclues = (j.exclues || []).map((x) => ({ de: P(x.de), a: P(x.a) }));
  }
}

/* ═══════════════ Le serveur ═══════════════ */
export class Server extends HostPC {
  constructor(opts) {
    super({ ...opts, type: "serveur" });
    this.type = "serveur";
    this.dhcp = new ServiceDhcp(this);
    this.dhcp.actif = false;
    this.dns = { actif: false, enregistrements: [] };     // [{ nom, ip }]
    this.web = { actif: true, page: "<h1>Bienvenue sur le serveur</h1>" };
    this.ip.udp.set(PORTS.DHCP_SERVEUR, (iface, paquet) => {
      if (paquet.payload.data instanceof DhcpMessage) this.dhcp.recevoir(iface, paquet);
    });
    this.ip.udp.set(PORTS.DNS, (iface, paquet) => this.repondreDns(paquet));
    this.ip.tcp.set(PORTS.HTTP, (iface, paquet) => this.repondreHttp(paquet));
  }

  /* Le pool d'un serveur se décrit comme dans Packet Tracer — début,
     masque, nombre d'adresses — et non comme un réseau. On en déduit le
     réseau pour que la règle de choix du pool reste la même. */
  definirPool({ nom = "serverPool", passerelle, dns, debut, masque, max = 100 }) {
    this.dhcp.pools = [{ nom, reseau: debut.reseau(masque), masque, routeur: passerelle || null, dns: dns || null, debut, max }];
  }

  repondreDns(paquet) {
    const m = paquet.payload.data;
    if (!(m instanceof DnsMessage) || m.reponses) return;
    if (!this.dns.actif) { this.noter("Le service DNS de " + this.nom + " est arrêté."); return; }
    const e = this.dns.enregistrements.find((r) => r.nom.toLowerCase() === String(m.question).toLowerCase());
    this.noter(e ? this.nom + " connaît « " + m.question + " » : " + e.ip + "." : this.nom + " ne connaît pas « " + m.question + " » (NXDOMAIN).");
    this.ip.envoyer(new IPv4Packet({ src: paquet.dst, dst: paquet.src, protocol: PROTO.UDP,
      payload: new UdpDatagram({ srcPort: PORTS.DNS, dstPort: paquet.payload.srcPort,
        data: new DnsMessage({ id: m.id, question: m.question, reponses: e ? [{ nom: e.nom, type: "A", ip: IPv4Address.parse(e.ip) }] : [], rcode: e ? 0 : 3 }) }) }));
  }

  repondreHttp(paquet) {
    const t = paquet.payload;
    const seg = (flags, data = null, seq = 0, ack = 0) => this.ip.envoyer(new IPv4Packet({ src: paquet.dst, dst: paquet.src, protocol: PROTO.TCP,
      payload: new TcpSegment({ srcPort: PORTS.HTTP, dstPort: t.srcPort, flags, seq, ack, data }) }));
    if (!this.web.actif) { this.noter("Le service HTTP de " + this.nom + " est arrêté : RST."); seg("RST,ACK"); return; }
    if (t.flags === "SYN") { this.noter(this.nom + " accepte la connexion sur le port 80 : SYN-ACK."); seg("SYN,ACK", null, 1000, t.seq + 1); }
    else if (t.flags === "PSH,ACK" && t.data) {
      this.noter(this.nom + " reçoit « " + String(t.data).split("\n")[0] + " » et renvoie la page (200 OK).");
      seg("PSH,ACK", "HTTP/1.1 200 OK\nContent-Type: text/html\n\n" + this.web.page, 1001, t.seq + 1);
    }
  }

  toJSON() {
    const j = super.toJSON();
    j.services = { dhcp: this.dhcp.toJSON(), dns: this.dns, web: this.web };
    return j;
  }
  appliquerJSON(j) {
    super.appliquerJSON(j);
    const s = j.services || {};
    this.dhcp.appliquerJSON(s.dhcp);
    if (s.dns) this.dns = { actif: !!s.dns.actif, enregistrements: (s.dns.enregistrements || []).slice() };
    if (s.web) this.web = { actif: s.web.actif !== false, page: s.web.page || "" };
  }
}
