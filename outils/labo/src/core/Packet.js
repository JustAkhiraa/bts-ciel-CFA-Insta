/* Ce que porte une trame : un message ARP, ou un paquet IPv4 qui porte
   lui-même de l'ICMP, de l'UDP ou du TCP — et, au-dessus de l'UDP et du
   TCP, du DHCP, du DNS ou du HTTP.

   Les champs sont ceux des normes (RFC 826, 791, 792, 768, 793, 2131,
   1035), réduits à ce qu'un équipement LIT pour décider. Il n'y a pas de
   somme de contrôle : rien ici ne corrompt un bit. */

export const PROTO = { ICMP: 1, TCP: 6, UDP: 17 };
export const ICMP = { ECHO_REPLY: 0, UNREACHABLE: 3, ECHO_REQUEST: 8, TIME_EXCEEDED: 11 };
export const UNREACH = { NET: 0, HOST: 1, PORT: 3, ADMIN: 13 };
export const PORTS = { DNS: 53, DHCP_SERVEUR: 67, DHCP_CLIENT: 68, HTTP: 80, TRACE: 33434 };

/* ── ARP ───────────────────────────────────────────────────────────── */
export class ArpMessage {
  constructor({ op, senderMac, senderIp, targetMac, targetIp }) {
    this.op = op;                    // 1 requête, 2 réponse
    this.senderMac = senderMac;
    this.senderIp = senderIp;
    this.targetMac = targetMac;
    this.targetIp = targetIp;
  }
  clone() { return new ArpMessage(this); }
  protocoleHaut() { return "ARP"; }
  resume() {
    return this.op === 1
      ? "ARP : qui a " + this.targetIp + " ? Répondez à " + this.senderIp
      : "ARP : " + this.senderIp + " est à " + this.senderMac;
  }
}

/* ── ICMP, UDP, TCP ────────────────────────────────────────────────── */
export class IcmpMessage {
  constructor({ type, code = 0, id = 0, seq = 0, origine = null }) {
    this.type = type; this.code = code; this.id = id; this.seq = seq;
    // un message d'erreur rappelle l'en-tête du paquet qui l'a provoqué
    this.origine = origine;
  }
  clone() { return new IcmpMessage(this); }
  nom() {
    if (this.type === ICMP.ECHO_REQUEST) return "Echo Request";
    if (this.type === ICMP.ECHO_REPLY) return "Echo Reply";
    if (this.type === ICMP.TIME_EXCEEDED) return "Time Exceeded";
    if (this.type === ICMP.UNREACHABLE) {
      return "Destination Unreachable (" + ({ 0: "réseau", 1: "hôte", 3: "port", 13: "interdit par une ACL" }[this.code] || "code " + this.code) + ")";
    }
    return "type " + this.type;
  }
}

export class UdpDatagram {
  constructor({ srcPort, dstPort, data = null }) {
    this.srcPort = srcPort; this.dstPort = dstPort; this.data = data;
  }
  clone() { return new UdpDatagram({ ...this, data: this.data && this.data.clone ? this.data.clone() : this.data }); }
}

export class TcpSegment {
  constructor({ srcPort, dstPort, flags, seq = 0, ack = 0, data = null }) {
    this.srcPort = srcPort; this.dstPort = dstPort; this.flags = flags;
    this.seq = seq; this.ack = ack; this.data = data;
  }
  clone() { return new TcpSegment(this); }
}

/* ── DHCP et DNS ───────────────────────────────────────────────────── */
export class DhcpMessage {
  constructor({ op, xid, chaddr, ciaddr = null, yiaddr = null, giaddr = null, options = {} }) {
    this.op = op;                    // DISCOVER OFFER REQUEST ACK NAK RELEASE
    this.xid = xid;
    this.chaddr = chaddr;            // l'adresse MAC du client
    this.ciaddr = ciaddr;            // l'adresse actuelle du client
    this.yiaddr = yiaddr;            // « your address » : celle qu'on lui donne
    this.giaddr = giaddr;            // le relais (ip helper-address)
    this.options = { ...options };   // mask router dns serverId requestedIp lease
  }
  clone() { return new DhcpMessage(this); }
}

export class DnsMessage {
  constructor({ id, question, reponses = null, rcode = 0 }) {
    this.id = id; this.question = question;
    this.reponses = reponses;        // null pour une question
    this.rcode = rcode;              // 0 trouvé, 3 nom inconnu
  }
  clone() { return new DnsMessage({ ...this, reponses: this.reponses && this.reponses.slice() }); }
}

/* ── IPv4 ──────────────────────────────────────────────────────────── */
let ident = 1;
export class IPv4Packet {
  constructor({ src, dst, ttl = 128, protocol, payload, id = null }) {
    this.id = id || ident++;
    this.src = src; this.dst = dst; this.ttl = ttl;
    this.protocol = protocol;
    this.payload = payload;
  }
  clone() {
    return new IPv4Packet({ ...this, payload: this.payload && this.payload.clone ? this.payload.clone() : this.payload });
  }

  protocoleHaut() {
    const p = this.payload;
    if (this.protocol === PROTO.ICMP) return "ICMP";
    if (this.protocol === PROTO.UDP) {
      if (p.data && p.data.protocoleHaut) return p.data.protocoleHaut();
      if (p.data instanceof DhcpMessage) return "DHCP";
      if (p.data instanceof DnsMessage) return "DNS";
      return "UDP";
    }
    if (this.protocol === PROTO.TCP) return p.dstPort === PORTS.HTTP || p.srcPort === PORTS.HTTP ? "HTTP" : "TCP";
    return "IPv4";
  }

  resume() {
    const p = this.payload;
    if (this.protocol === PROTO.ICMP) return "ICMP " + p.nom() + (p.type === 8 || p.type === 0 ? " #" + p.seq : "");
    if (this.protocol === PROTO.UDP && p.data && p.data.resume) return p.data.resume();
    if (this.protocol === PROTO.UDP && p.data instanceof DhcpMessage) return "DHCP " + p.data.op;
    if (this.protocol === PROTO.UDP && p.data instanceof DnsMessage) {
      return "DNS " + (p.data.reponses ? "réponse" : "question") + " « " + p.data.question + " »";
    }
    if (this.protocol === PROTO.UDP) return "UDP " + p.srcPort + " → " + p.dstPort;
    if (this.protocol === PROTO.TCP) return (this.protocoleHaut() === "HTTP" ? "HTTP " : "TCP ") + "[" + p.flags + "]"
      + (p.data ? " " + String(p.data).split("\n")[0] : "");
    return "IPv4";
  }
}
