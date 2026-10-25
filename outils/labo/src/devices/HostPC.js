/* Un PC : une carte réseau (FastEthernet0), un port RS-232 pour la console,
   et une configuration IP — statique, ou obtenue par DHCP.

   Il n'a qu'une décision de routage à prendre, et c'est celle qu'on
   enseigne : la destination est-elle dans MON réseau ? Si oui, on la joint
   directement (ARP sur elle) ; sinon, on passe par la passerelle par
   défaut (ARP sur la passerelle). */

import { Device } from "./Device.js";
import { Port } from "./Port.js";
import { IpStack } from "./IpStack.js";
import { MACAddress } from "../core/MACAddress.js";
import { IPv4Address } from "../core/IPv4Address.js";
import { Frame, ETHERTYPE } from "../core/Frame.js";
import { IPv4Packet, UdpDatagram, TcpSegment, DhcpMessage, DnsMessage, PROTO, PORTS } from "../core/Packet.js";

export const DHCP_DELAI = 3000;

export class HostPC extends Device {
  constructor(opts) {
    super(opts);
    this.type = opts.type || "pc";
    this.famille = "hote";
    this.carte = new Port(this, "FastEthernet0", { type: "fa", mac: MACAddress.generer(0x00d0ba) });
    this.ports = [this.carte, new Port(this, "RS232", { type: "rs232" })];
    this.ip = new IpStack(this, { ttl: 128 });
    this.config = { dhcp: false, passerelle: null, dns: null };
    this.dhcpClient = null;
    this.portEphemere = 1025;
  }

  interfacesL3() { return this.carte.ip ? [this.carte] : []; }
  estLocal(ip) { return !!(this.carte.ip && ip.dansReseau(this.carte.ip, this.carte.masque)); }

  /* La seule question de routage d'un hôte. */
  route(dst) {
    const c = this.carte;
    if (!c.ip) return { erreur: "pas d'adresse IP configurée" };
    if (dst.estDiffusionLimitee() || this.estLocal(dst)) return { iface: c, saut: dst };
    if (!this.config.passerelle) return { erreur: "destination hors du réseau local, et pas de passerelle par défaut" };
    return { iface: c, saut: this.config.passerelle };
  }

  configurer({ ip, masque, passerelle, dns }) {
    this.carte.ip = ip || null;
    this.carte.masque = masque || null;
    this.config.passerelle = passerelle || null;
    this.config.dns = dns || null;
    this.ip.viderArp();
  }

  recevoirTrame(port, trame) {
    if (port !== this.carte) return;
    if (!trame.dst.egale(port.mac) && !trame.dst.estDiffusion()) {
      this.noter("La trame est adressée à " + trame.dst.cisco() + ", pas à " + this.nom + " (" + port.mac.cisco()
        + ") : la carte réseau l'ignore.");
      this.reseau.issue("ignoree");
      return;
    }
    if (trame.vlan !== null) {
      this.noter("La trame porte une étiquette 802.1Q (VLAN " + trame.vlan + ") : une carte de PC ne la comprend pas et la jette.");
      this.reseau.issue("jetee");
      return;
    }
    if (trame.etherType === ETHERTYPE.ARP) {
      if (!port.ip) { this.noter(this.nom + " n'a pas d'adresse IP : il ne répond à aucun ARP."); this.reseau.issue("ignoree"); return; }
      this.ip.recevoirArp(port, trame.payload);
      return;
    }
    const p = trame.payload;
    if (this.ip.estPourMoi(port, p) || (p.protocol === PROTO.UDP && p.payload.dstPort === PORTS.DHCP_CLIENT)) {
      this.ip.livrer(port, p);
    } else {
      this.noter("Le paquet est pour " + p.dst + ", pas pour " + this.nom + " : un hôte ne route pas, il l'ignore.");
      this.reseau.issue("ignoree");
    }
  }

  /* ── le client DHCP : Discover, Offer, Request, Ack ─────────────── */
  demanderDhcp(sur = () => {}) {
    const xid = Math.floor(Math.random() * 0xffffffff) >>> 0;
    const etat = { xid, phase: "discover", essais: 0, minuterie: null, offre: null };
    this.dhcpClient = etat;
    this.config.dhcp = true;
    const horloge = this.reseau.horloge;
    const diffuser = (msg) => {
      const paquet = new IPv4Packet({ src: IPv4Address.ZERO, dst: IPv4Address.DIFFUSION, ttl: 128, protocol: PROTO.UDP,
        payload: new UdpDatagram({ srcPort: PORTS.DHCP_CLIENT, dstPort: PORTS.DHCP_SERVEUR, data: msg }) });
      this.carte.envoyer(new Frame({ src: this.carte.mac, dst: MACAddress.DIFFUSION, etherType: ETHERTYPE.IPV4, payload: paquet }));
    };
    const decouvrir = () => {
      etat.phase = "discover";
      etat.essais++;
      this.noter(this.nom + " n'a pas d'adresse : il diffuse un DHCP DISCOVER depuis 0.0.0.0 vers 255.255.255.255.");
      diffuser(new DhcpMessage({ op: "DISCOVER", xid, chaddr: this.carte.mac }));
      etat.minuterie = horloge.programmer(DHCP_DELAI, () => {
        if (this.dhcpClient !== etat || etat.phase === "lie") return;
        if (etat.essais < 3) { decouvrir(); return; }
        this.ip.udp.delete(PORTS.DHCP_CLIENT);
        // Windows se donne alors une adresse APIPA, 169.254.x.y/16
        const apipa = new IPv4Address((169 << 24 | 254 << 16) >>> 0).plus(1 + (this.carte.mac.bas % 65000));
        this.configurer({ ip: apipa, masque: IPv4Address.depuisPrefixe(16) });
        etat.phase = "echec";
        this.noter("Aucun serveur DHCP n'a répondu : " + this.nom + " prend une adresse APIPA, " + apipa + ".");
        sur({ type: "echec", ip: apipa });
      }, { type: "minuterie", quoi: "DHCP" });
    };
    this.ip.udp.set(PORTS.DHCP_CLIENT, (iface, paquet) => {
      const m = paquet.payload.data;
      if (!(m instanceof DhcpMessage) || m.xid !== xid || this.dhcpClient !== etat) {
        this.noter("Ce message DHCP ne répond pas à la demande de " + this.nom + " : ignoré.");
        return;
      }
      if (m.op === "OFFER" && etat.phase === "discover") {
        etat.phase = "request";
        etat.offre = m;
        this.noter(this.nom + " reçoit une offre : " + m.yiaddr + ". Il la demande officiellement (DHCP REQUEST, encore en diffusion, pour que les autres serveurs sachent).");
        diffuser(new DhcpMessage({ op: "REQUEST", xid, chaddr: this.carte.mac,
          options: { requestedIp: m.yiaddr, serverId: m.options.serverId } }));
      } else if (m.op === "ACK" && etat.phase === "request") {
        horloge.annuler(etat.minuterie);
        etat.phase = "lie";
        this.configurer({ ip: m.yiaddr, masque: m.options.mask, passerelle: m.options.router || null, dns: m.options.dns || null });
        this.config.dhcp = true;
        this.config.serveurDhcp = m.options.serverId || null;
        this.noter("DHCP ACK : " + this.nom + " prend " + m.yiaddr + "/" + m.options.mask.prefixe()
          + (m.options.router ? ", passerelle " + m.options.router : "") + (m.options.dns ? ", DNS " + m.options.dns : "") + ".");
        sur({ type: "ok", ip: m.yiaddr });
      } else if (m.op === "NAK") {
        horloge.annuler(etat.minuterie);
        this.noter("DHCP NAK : le serveur refuse ; " + this.nom + " recommence depuis le début.");
        etat.essais = 0;
        decouvrir();
      }
    });
    this.configurer({});
    decouvrir();
  }

  libererDhcp() {
    if (this.carte.ip && this.config.serveurDhcp) {
      this.noter(this.nom + " rend son adresse " + this.carte.ip + " (DHCP RELEASE).");
      this.ip.envoyer(new IPv4Packet({ src: this.carte.ip, dst: this.config.serveurDhcp, protocol: PROTO.UDP,
        payload: new UdpDatagram({ srcPort: PORTS.DHCP_CLIENT, dstPort: PORTS.DHCP_SERVEUR,
          data: new DhcpMessage({ op: "RELEASE", xid: 0, chaddr: this.carte.mac, ciaddr: this.carte.ip }) }) }));
    }
    this.dhcpClient = null;
    this.configurer({});
  }

  /* ── le client DNS ── */
  resoudre(nom, sur) {
    const ip = IPv4Address.parse(nom);
    if (ip) { sur({ ip }); return; }
    if (!this.config.dns) { sur({ erreur: "aucun serveur DNS configuré" }); return; }
    const port = this.portEphemere++;
    const id = port;
    const horloge = this.reseau.horloge;
    let fini = false;
    let essais = 0, minuterie = null;
    const question = () => {
      essais++;
      this.noter(this.nom + (essais > 1 ? " repose sa question DNS (essai " + essais + ")" : " demande au serveur DNS " + this.config.dns + " l'adresse de « " + nom + " »") + ".");
      this.ip.envoyer(new IPv4Packet({ src: this.carte.ip, dst: this.config.dns, protocol: PROTO.UDP,
        payload: new UdpDatagram({ srcPort: port, dstPort: PORTS.DNS, data: new DnsMessage({ id, question: nom }) }) }));
      minuterie = horloge.programmer(1000, () => {
        if (fini) return;
        if (essais < 3) { question(); return; }
        fini = true; this.ip.udp.delete(port); sur({ erreur: "le serveur DNS ne répond pas" });
      }, { type: "minuterie", quoi: "DNS" });
    };
    this.ip.udp.set(port, (iface, paquet) => {
      const m = paquet.payload.data;
      if (fini || !(m instanceof DnsMessage) || m.id !== id) return;
      fini = true; horloge.annuler(minuterie); this.ip.udp.delete(port);
      if (m.rcode || !m.reponses || !m.reponses.length) { this.noter("Le DNS ne connaît pas « " + nom + " »."); sur({ erreur: "nom inconnu", serveur: paquet.src }); return; }
      this.noter("Le DNS répond : « " + nom + " » = " + m.reponses[0].ip + ".");
      sur({ ip: m.reponses[0].ip, serveur: paquet.src });
    });
    question();
  }

  /* ── un client HTTP réduit à l'essentiel : poignée de main TCP, GET,
     réponse. Assez pour voir SYN / SYN-ACK / ACK passer. ── */
  http(hote, sur) {
    this.resoudre(hote, (r) => {
      if (r.erreur) { sur({ erreur: r.erreur }); return; }
      const port = this.portEphemere++;
      const dst = r.ip;
      const horloge = this.reseau.horloge;
      let fini = false;
      const finir = (x) => { if (fini) return; fini = true; horloge.annuler(minuterie); this.ip.tcp.delete(port); sur(x); };
      const minuterie = horloge.programmer(4000, () => finir({ erreur: "délai dépassé" }), { type: "minuterie", quoi: "HTTP" });
      const seg = (flags, data = null, seq = 0, ack = 0) => this.ip.envoyer(new IPv4Packet({ src: this.carte.ip, dst, protocol: PROTO.TCP,
        payload: new TcpSegment({ srcPort: port, dstPort: PORTS.HTTP, flags, seq, ack, data }) }));
      let ouvert = false, essais = 0;
      this.ip.tcp.set(port, (iface, paquet) => {
        const t = paquet.payload;
        if (t.flags === "SYN,ACK") {
          // un SYN réémis peut valoir un second SYN-ACK : la connexion est déjà ouverte
          if (ouvert) { this.noter("SYN-ACK en double (réponse à un SYN réémis) : ignoré."); return; }
          ouvert = true;
          this.noter("SYN-ACK reçu : la connexion est ouverte. " + this.nom + " acquitte et envoie sa requête GET.");
          seg("ACK", null, 1, t.seq + 1);
          seg("PSH,ACK", "GET / HTTP/1.1\nHost: " + hote, 1, t.seq + 1);
        } else if (t.flags.startsWith("RST")) {
          finir({ erreur: "connexion refusée (pas de serveur web sur " + dst + ")" });
        } else if (t.flags === "PSH,ACK" && t.data) {
          this.noter("Réponse HTTP reçue de " + dst + ".");
          seg("ACK", null, 2, t.seq + 1);
          finir({ ok: true, ip: dst, reponse: t.data });
        }
      });
      /* Un SYN perdu — par exemple jeté par un routeur pendant son ARP —
         est RÉÉMIS, comme le fait tout TCP : sans réponse au bout d'une
         seconde, on recommence, trois fois au plus. */
      const syn = () => {
        if (fini || ouvert) return;
        essais++;
        this.noter(this.nom + (essais > 1 ? " réémet son SYN (essai " + essais + ")" : " ouvre une connexion TCP vers " + dst + ":80 (SYN)") + ".");
        const res = seg("SYN");
        if (res && res.erreur) { finir({ erreur: res.erreur }); return; }
        if (essais < 3) horloge.programmer(1000, syn, { type: "minuterie", quoi: "TCP" });
      };
      syn();
    });
  }

  toJSON() {
    const j = super.toJSON();
    j.config = {
      dhcp: this.config.dhcp,
      ip: this.carte.ip && !this.config.dhcp ? this.carte.ip.toString() : null,
      masque: this.carte.masque && !this.config.dhcp ? this.carte.masque.toString() : null,
      passerelle: this.config.passerelle && !this.config.dhcp ? this.config.passerelle.toString() : null,
      dns: this.config.dns && !this.config.dhcp ? this.config.dns.toString() : null,
    };
    return j;
  }
  appliquerJSON(j) {
    const c = j.config || {};
    this.config.dhcp = !!c.dhcp;
    this.configurer({ ip: IPv4Address.parse(c.ip), masque: IPv4Address.parse(c.masque),
      passerelle: IPv4Address.parse(c.passerelle), dns: IPv4Address.parse(c.dns) });
  }
}
