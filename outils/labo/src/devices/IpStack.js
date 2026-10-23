/* La pile IPv4 d'un équipement : ARP, ICMP, UDP, TCP.

   Un PC, un serveur, un routeur et l'interface VLAN d'un commutateur en ont
   chacun une. Ce qui les distingue n'est pas ici : c'est la question « par
   où sortir pour joindre cette adresse ? », à laquelle chaque équipement
   répond avec sa méthode `route()` — un PC par sa passerelle, un routeur
   par sa table de routage.

   L'ARP suit la RFC 826. Une adresse inconnue met le paquet EN ATTENTE et
   déclenche une requête en diffusion ; la réponse remplit la table et
   libère l'attente. Un routeur IOS, lui, JETTE le paquet qui a déclenché la
   requête : c'est pour ça que le premier ping à travers un routeur se perd
   (« .!!!! »), et ce point-là aussi est reproduit. */

import { MACAddress } from "../core/MACAddress.js";
import { IPv4Address } from "../core/IPv4Address.js";
import { Frame, ETHERTYPE } from "../core/Frame.js";
import { ArpMessage, IPv4Packet, IcmpMessage, UdpDatagram, TcpSegment, PROTO, ICMP, UNREACH } from "../core/Packet.js";

export const ARP_ESSAIS = 3;
export const ARP_DELAI = 1000;
let icmpIdent = 1;

export class IpStack {
  constructor(app, { ttl = 128, abandonSurArp = false } = {}) {
    this.app = app;
    this.ttl = ttl;
    this.abandonSurArp = abandonSurArp;
    this.arp = new Map();              // "ip" → { mac, iface, vu }
    this.attente = new Map();          // "ip" → { iface, paquets, essais, minuterie }
    this.icmp = new Set();             // écouteurs des messages ICMP reçus
    this.udp = new Map();              // port → fonction(iface, paquet)
    this.tcp = new Map();              // port → fonction(iface, paquet)
    this.echecsArp = new Set();        // écouteurs : un ARP resté sans réponse
  }
  get reseau() { return this.app.reseau; }
  get horloge() { return this.app.reseau.horloge; }
  noter(t) { this.app.noter(t); }

  /* ── la table ARP ── */
  apprendre(ip, mac, iface) {
    const cle = ip.toString();
    const deja = this.arp.get(cle);
    this.arp.set(cle, { mac, iface, vu: this.horloge.t, type: "dynamic" });
    if (!deja || !deja.mac.egale(mac)) {
      this.noter(this.app.nom + " inscrit dans sa table ARP : " + cle + " → " + mac.cisco() + ".");
    }
  }
  macDe(ip) { const e = this.arp.get(ip.toString()); return e ? e.mac : null; }
  viderArp() { this.arp.clear(); }

  /* Une adresse est-elle à moi ? Sur n'importe laquelle de mes interfaces
     actives — un routeur répond au ping de l'adresse de son autre patte. */
  monInterface(ip) {
    return this.app.interfacesL3().find((i) => i.ip && i.ip.egale(ip)) || null;
  }

  /* ── envoyer un paquet ── */
  envoyer(paquet) {
    const r = this.app.route(paquet.dst, paquet);
    if (!r || r.erreur) {
      this.noter(this.app.nom + " ne sait pas où envoyer le paquet pour " + paquet.dst + " : "
        + ((r && r.erreur) || "aucune route") + ".");
      return { erreur: (r && r.erreur) || "aucune route" };
    }
    return this.envoyerVia(paquet, r.iface, r.saut);
  }

  envoyerVia(paquet, iface, saut) {
    // un paquet pour l'une de MES adresses (un ping vers sa propre loopback)
    // ne sort pas : il est remis à la pile, comme par la boucle interne d'IOS
    const moi = this.monInterface(paquet.dst);
    if (moi) {
      this.noter(paquet.dst + " est une adresse de " + this.app.nom + " (" + moi.court + ") : le paquet ne quitte pas l'équipement.");
      this.horloge.programmer(0, () => this.livrer(moi, paquet), { type: "minuterie", quoi: "boucle locale" });
      return { ok: true };
    }
    if (!iface.estUp()) {
      this.noter(iface.court + " est hors service : le paquet pour " + paquet.dst + " ne peut pas partir.");
      return { erreur: "interface hors service" };
    }
    if (iface.type === "se") {
      // point à point : un seul voisin possible, donc ni ARP ni adresse MAC
      this.noter("Liaison série " + iface.court + " : point à point, pas d'ARP. Le paquet part dans une trame "
        + iface.encapsulation.toUpperCase() + ".");
      iface.envoyer(new Frame({ src: null, dst: null, etherType: ETHERTYPE.IPV4, payload: paquet, l2: iface.encapsulation }));
      return { ok: true };
    }
    if (paquet.dst.estMulticast()) {
      this.noter("Destination de groupe " + paquet.dst + " : la trame part vers l'adresse MAC de groupe " + MACAddress.multicast(paquet.dst).cisco() + ".");
      this.trame(iface, MACAddress.multicast(paquet.dst), ETHERTYPE.IPV4, paquet);
      return { ok: true };
    }
    const diffusion = paquet.dst.estDiffusionLimitee()
      || (iface.ip && iface.masque && paquet.dst.egale(iface.ip.diffusion(iface.masque)));
    if (diffusion) {
      this.noter("Destination de diffusion : la trame part vers FFFF.FFFF.FFFF.");
      this.trame(iface, MACAddress.DIFFUSION, ETHERTYPE.IPV4, paquet);
      return { ok: true };
    }
    const mac = this.macDe(saut);
    if (mac) {
      this.noter(saut.egale(paquet.dst)
        ? paquet.dst + " est sur le réseau local, à " + mac.cisco() + " (table ARP)."
        : "Le prochain saut est " + saut + ", à " + mac.cisco() + " (table ARP).");
      this.trame(iface, mac, ETHERTYPE.IPV4, paquet);
      return { ok: true };
    }
    // l'adresse MAC du prochain saut est inconnue : ARP
    const cle = saut.toString();
    let att = this.attente.get(cle);
    if (this.abandonSurArp) {
      this.noter(saut + " n'est pas dans la table ARP. Comme IOS, " + this.app.nom
        + " jette ce paquet-ci et lance une requête ARP : le suivant passera.");
    } else {
      this.noter(saut + " n'est pas dans la table ARP : le paquet attend, et une requête ARP part.");
    }
    if (!att) {
      att = { iface, paquets: [], essais: 0, minuterie: null };
      this.attente.set(cle, att);
      if (!this.abandonSurArp) att.paquets.push(paquet);
      this.demanderArp(iface, saut, att);
    } else if (!this.abandonSurArp) {
      att.paquets.push(paquet);
    }
    return { enAttente: true };
  }

  demanderArp(iface, ip, att) {
    att.essais++;
    this.noter(this.app.nom + " demande en diffusion : « qui a " + ip + " ? »");
    const msg = new ArpMessage({ op: 1, senderMac: iface.mac, senderIp: iface.ip, targetMac: MACAddress.ZERO, targetIp: ip });
    this.trame(iface, MACAddress.DIFFUSION, ETHERTYPE.ARP, msg);
    att.minuterie = this.horloge.programmer(ARP_DELAI, () => {
      if (this.attente.get(ip.toString()) !== att) return;
      if (att.essais < ARP_ESSAIS) { this.demanderArp(iface, ip, att); return; }
      this.attente.delete(ip.toString());
      this.noter("Aucune réponse ARP de " + ip + " après " + ARP_ESSAIS + " essais : "
        + (att.paquets.length ? att.paquets.length + " paquet(s) en attente jeté(s)." : "on abandonne."));
      this.echecsArp.forEach((fn) => fn(ip, att.paquets));
    }, { type: "minuterie", quoi: "ARP" });
  }

  trame(iface, dst, etherType, payload) {
    const f = new Frame({ src: iface.mac, dst, etherType, payload });
    return iface.envoyer(f);
  }

  /* ── recevoir de l'ARP ── */
  recevoirArp(iface, msg) {
    // un routeur qui traduit répond aussi pour ses adresses publiques (NAT)
    const parNat = !!(this.app.nat && this.app.nat.configure() && this.app.nat.repondArp(iface, msg.targetIp));
    const pourMoi = iface.ip && (msg.targetIp.egale(iface.ip) || parNat);
    if (!pourMoi) {
      if (this.arp.has(msg.senderIp.toString())) this.apprendre(msg.senderIp, msg.senderMac, iface);
      this.noter("La requête ARP demande " + msg.targetIp + ", qui n'est pas à " + this.app.nom + " : ignorée.");
      this.reseau.issue("ignoree");
      return;
    }
    this.apprendre(msg.senderIp, msg.senderMac, iface);
    if (msg.op === 1) {
      this.noter(parNat ? this.app.nom + " répond pour " + msg.targetIp + ", adresse publique de son NAT : elle est chez lui."
        : this.app.nom + " a l'adresse " + iface.ip + " : il répond en unicast à " + msg.senderMac.cisco() + ".");
      const rep = new ArpMessage({ op: 2, senderMac: iface.mac, senderIp: msg.targetIp, targetMac: msg.senderMac, targetIp: msg.senderIp });
      this.trame(iface, msg.senderMac, ETHERTYPE.ARP, rep);
    } else {
      this.noter("Réponse ARP reçue : " + msg.senderIp + " est à " + msg.senderMac.cisco() + ".");
    }
    const att = this.attente.get(msg.senderIp.toString());
    if (att) {
      this.horloge.annuler(att.minuterie);
      this.attente.delete(msg.senderIp.toString());
      if (att.paquets.length) this.noter(att.paquets.length + " paquet(s) en attente partent maintenant.");
      att.paquets.forEach((p) => this.trame(att.iface, msg.senderMac, ETHERTYPE.IPV4, p));
    }
  }

  /* ── recevoir de l'IP ── */
  estPourMoi(iface, paquet) {
    if (this.monInterface(paquet.dst)) return true;
    if (paquet.dst.estDiffusionLimitee()) return true;
    if (iface.ip && iface.masque && paquet.dst.egale(iface.ip.diffusion(iface.masque))) return true;
    // un groupe multicast n'est « pour moi » que si j'y suis abonné (RIPv2 : 224.0.0.9)
    if (paquet.dst.estMulticast()) return !!(this.app.ecouteGroupe && this.app.ecouteGroupe(iface, paquet.dst));
    return false;
  }

  livrer(iface, paquet) {
    if (paquet.protocol === PROTO.ICMP) return this.recevoirIcmp(iface, paquet);
    if (paquet.protocol === PROTO.UDP) {
      const h = this.udp.get(paquet.payload.dstPort);
      if (h) return h(iface, paquet);
      if (paquet.dst.estDiffusionLimitee() || paquet.dst.estMulticast()
        || (iface.ip && iface.masque && paquet.dst.egale(iface.ip.diffusion(iface.masque)))) {
        this.noter("Personne n'écoute le port UDP " + paquet.payload.dstPort + " ici : ignoré.");
        return;
      }
      this.noter("Aucun service sur le port UDP " + paquet.payload.dstPort + " : « port injoignable » renvoyé à " + paquet.src + ".");
      this.erreurIcmp(paquet, ICMP.UNREACHABLE, UNREACH.PORT, iface);
      return;
    }
    if (paquet.protocol === PROTO.TCP) {
      const h = this.tcp.get(paquet.payload.dstPort);
      if (h) return h(iface, paquet);
      this.noter("Aucun service sur le port TCP " + paquet.payload.dstPort + " : connexion refusée (RST).");
      this.envoyer(new IPv4Packet({ src: paquet.dst, dst: paquet.src, ttl: this.ttl, protocol: PROTO.TCP,
        payload: new TcpSegment({ srcPort: paquet.payload.dstPort, dstPort: paquet.payload.srcPort, flags: "RST,ACK" }) }));
    }
  }

  recevoirIcmp(iface, paquet) {
    const m = paquet.payload;
    if (m.type === ICMP.ECHO_REQUEST) {
      const src = this.monInterface(paquet.dst) ? paquet.dst : iface.ip;
      this.noter(this.app.nom + " reçoit un Echo Request de " + paquet.src + " et répond (Echo Reply).");
      this.envoyer(new IPv4Packet({ src, dst: paquet.src, ttl: this.ttl, protocol: PROTO.ICMP,
        payload: new IcmpMessage({ type: ICMP.ECHO_REPLY, id: m.id, seq: m.seq }) }));
      return;
    }
    this.noter(this.app.nom + " reçoit un ICMP " + m.nom() + " de " + paquet.src + ".");
    this.icmp.forEach((fn) => fn(paquet, iface));
  }

  /* Un message d'erreur ICMP vers l'émetteur d'un paquet. Jamais en
     réponse à une erreur ICMP ni à une diffusion : la RFC 1122 l'interdit,
     et c'est ce qui empêche deux équipements de s'en renvoyer à l'infini. */
  erreurIcmp(paquet, type, code, iface) {
    if (paquet.dst.estDiffusionLimitee() || paquet.dst.estMulticast() || paquet.src.estZero()) return;
    if (paquet.protocol === PROTO.ICMP && paquet.payload.type !== ICMP.ECHO_REQUEST && paquet.payload.type !== ICMP.ECHO_REPLY) return;
    const src = (iface && iface.ip) || (this.app.interfacesL3()[0] || {}).ip;
    if (!src) return;
    this.envoyer(new IPv4Packet({ src, dst: paquet.src, ttl: this.ttl, protocol: PROTO.ICMP,
      payload: new IcmpMessage({ type, code, origine: { src: paquet.src, dst: paquet.dst, protocol: paquet.protocol,
        id: paquet.payload.id, seq: paquet.payload.seq, srcPort: paquet.payload.srcPort, dstPort: paquet.payload.dstPort } }) }));
  }

  /* ── le ping ──────────────────────────────────────────────────────
     Une session : « n » Echo Request espacés d'« intervalle », chacun avec
     son délai d'attente. Chaque réponse — ou son absence — remonte à
     l'appelant par « sur(evenement) », au fil de l'horloge. */
  /* « sequentiel » : l'écho suivant ne part qu'une fois le précédent conclu
     (réponse ou délai) — d'où le « .!!!! » d'IOS quand le premier se perd
     pendant l'ARP, et le « Request timed out. » de Windows qui s'affiche
     AVANT les réponses suivantes. Windows garde en plus une seconde entre
     deux envois (« intervalle ») ; IOS enchaîne aussitôt (intervalle 0). */
  ping(dst, { n = 4, intervalle = 1000, delai = 4000, ttl = null, taille = 32, sequentiel = false, sur = () => {} } = {}) {
    const id = icmpIdent++;
    const stats = { envoyes: 0, recus: 0, temps: [] };
    const enCours = new Map();          // seq → { t0, fini, minuterie, paquet }
    const fin = () => { if (stats.envoyes === n && [...enCours.values()].every((e) => e.fini)) { arreter(); sur({ type: "fin", stats }); } };
    const conclure = (e, evt) => {
      if (e.fini) return;
      e.fini = true;
      this.horloge.annuler(e.minuterie);
      sur(evt);
      if (sequentiel && stats.envoyes < n) {
        const attente = Math.max(0, e.t0 + intervalle - this.horloge.t);
        this.horloge.programmer(attente, () => envoyerUn(stats.envoyes + 1), { type: "minuterie", quoi: "ping" });
      }
      fin();
    };
    const ecouteIcmp = (paquet) => {
      const m = paquet.payload;
      if (m.type === ICMP.ECHO_REPLY && m.id === id) {
        const e = enCours.get(m.seq);
        if (!e) return;
        stats.recus++;
        const temps = this.horloge.t - e.t0;
        stats.temps.push(temps);
        conclure(e, { type: "reponse", de: paquet.src, octets: taille, temps, ttl: paquet.ttl, seq: m.seq });
      } else if ((m.type === ICMP.UNREACHABLE || m.type === ICMP.TIME_EXCEEDED) && m.origine && m.origine.id === id) {
        const e = enCours.get(m.origine.seq);
        if (!e) return;
        conclure(e, { type: m.type === ICMP.TIME_EXCEEDED ? "expire" : "injoignable", de: paquet.src, code: m.code, seq: m.origine.seq });
      }
    };
    const ecouteArp = (ip, paquets) => {
      paquets.forEach((p) => {
        if (p.protocol !== PROTO.ICMP || p.payload.id !== id) return;
        const e = enCours.get(p.payload.seq);
        // Windows : un hôte LOCAL qui ne répond pas à l'ARP donne « Destination
        // host unreachable », signé par le PC lui-même ; au-delà, un simple délai.
        if (e && this.app.estLocal && this.app.estLocal(p.dst)) {
          conclure(e, { type: "injoignable", de: p.src, code: UNREACH.HOST, local: true, seq: p.payload.seq });
        }
      });
    };
    const arreter = () => { this.icmp.delete(ecouteIcmp); this.echecsArp.delete(ecouteArp); };
    this.icmp.add(ecouteIcmp);
    this.echecsArp.add(ecouteArp);
    const envoyerUn = (seq) => {
      const r = this.app.route(dst);
      const src = r && r.iface ? r.iface.ip : null;
      const e = { t0: this.horloge.t, fini: false, minuterie: null };
      enCours.set(seq, e);
      stats.envoyes++;
      if (!src) {
        conclure(e, { type: "echec", raison: (r && r.erreur) || "aucune route", seq });
      } else {
        const p = new IPv4Packet({ src, dst, ttl: ttl || this.ttl, protocol: PROTO.ICMP,
          payload: new IcmpMessage({ type: ICMP.ECHO_REQUEST, id, seq }) });
        this.noter(this.app.nom + " envoie un Echo Request n°" + seq + " à " + dst + ".");
        const res = this.envoyer(p);
        if (res.erreur) conclure(e, { type: "echec", raison: res.erreur, seq });
        else e.minuterie = this.horloge.programmer(delai, () => conclure(e, { type: "delai", seq }), { type: "minuterie", quoi: "ping" });
      }
      if (!sequentiel && seq < n) this.horloge.programmer(intervalle, () => envoyerUn(seq + 1), { type: "minuterie", quoi: "ping" });
    };
    envoyerUn(1);
    return { arreter, stats };
  }

  /* ── le traceroute ─────────────────────────────────────────────────
     Des sondes à TTL 1, 2, 3… : chaque routeur qui tombe à zéro renvoie
     « Time Exceeded », et se dénonce ainsi. Windows envoie des Echo
     Request (« udp: false ») ; IOS envoie de l'UDP vers un port fermé, et
     c'est le « port injoignable » de la destination qui dit « arrivé ». */
  traceroute(dst, { max = 30, sondes = 3, delai = 2000, udp = false, sur = () => {} } = {}) {
    const id = icmpIdent++;
    let ttl = 0, sonde = 0, courant = null, arrive = false;
    const ligne = [];
    const ecoute = (paquet) => {
      const m = paquet.payload;
      if (!courant) return;
      // une erreur ICMP rappelle l'en-tête de la sonde : on la reconnaît à
      // son port de destination (UDP) ou à son identifiant et son numéro (ICMP)
      const vise = !!m.origine && (udp ? m.origine.dstPort === courant.port
        : m.origine.id === id && m.origine.seq === courant.seq);
      const echo = !udp && m.type === ICMP.ECHO_REPLY && m.id === id && m.seq === courant.seq;
      if (!echo && !vise) return;
      const temps = this.horloge.t - courant.t0;
      this.horloge.annuler(courant.minuterie);
      if (echo || (udp && m.type === ICMP.UNREACHABLE && m.code === UNREACH.PORT)) arrive = true;
      ligne.push({ de: paquet.src, temps });
      courant = null;
      suivante();
    };
    const arreter = () => this.icmp.delete(ecoute);
    this.icmp.add(ecoute);
    const suivante = () => {
      if (sonde === sondes) {
        sur({ type: "saut", ttl, sondes: ligne.splice(0) });
        sonde = 0;
        if (arrive || ttl >= max) { arreter(); sur({ type: "fin", arrive }); return; }
      }
      if (sonde === 0) ttl++;
      sonde++;
      const seq = ttl * 10 + sonde;
      const r = this.app.route(dst);
      if (!r || r.erreur) { arreter(); sur({ type: "echec", raison: (r && r.erreur) || "aucune route" }); return; }
      const port = 33434 + seq;
      const payload = udp ? new UdpDatagram({ srcPort: 50000 + id % 10000, dstPort: port })
        : new IcmpMessage({ type: ICMP.ECHO_REQUEST, id, seq });
      courant = { seq, port, t0: this.horloge.t, minuterie: null };
      this.noter(this.app.nom + " envoie une sonde avec un TTL de " + ttl + " : le " + ttl + "ᵉ routeur la jettera et se fera connaître.");
      this.envoyer(new IPv4Packet({ src: r.iface.ip, dst, ttl, protocol: udp ? PROTO.UDP : PROTO.ICMP, payload }));
      courant.minuterie = this.horloge.programmer(delai, () => {
        if (!courant || courant.seq !== seq) return;
        ligne.push(null);
        courant = null;
        suivante();
      }, { type: "minuterie", quoi: "traceroute" });
    };
    suivante();
    return { arreter };
  }
}

export { IPv4Address };
