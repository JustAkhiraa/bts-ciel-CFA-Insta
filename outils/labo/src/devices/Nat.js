/* La traduction d'adresses d'un routeur : NAT statique, NAT dynamique
   (un pool d'adresses publiques), et PAT — la « surcharge » (overload),
   où toutes les adresses privées sortent derrière UNE adresse publique et
   se distinguent par leur numéro de port.

   Le vocabulaire est celui de Cisco, et c'est celui qu'on note en TP :
     Inside local    l'adresse privée du PC (192.168.1.10)
     Inside global   l'adresse publique qui la représente dehors
     Outside global  l'adresse de l'hôte d'Internet
     Outside local   la même, vue de l'intérieur (identique ici)

   L'ordre est celui d'IOS. Un paquet qui va de l'intérieur vers
   l'extérieur est ROUTÉ d'abord, TRADUIT ensuite (sa source change) ; un
   paquet qui revient est TRADUIT d'abord (sa destination redevient
   privée), ROUTÉ ensuite.

   Pour l'ICMP, le « port » est l'identifiant de l'écho : c'est lui que le
   PAT renumérote. Un message d'erreur ICMP (TTL épuisé, injoignable) qui
   revient est retraduit grâce à l'en-tête du paquet en cause qu'il cite. */

import { IPv4Address } from "../core/IPv4Address.js";
import { PROTO, ICMP } from "../core/Packet.js";

const DELAIS = { icmp: 60000, udp: 300000, tcp: 86400000 };     // ms, comme IOS
const NOM_PROTO = { [PROTO.ICMP]: "icmp", [PROTO.UDP]: "udp", [PROTO.TCP]: "tcp" };

/* Le protocole et les deux « ports » d'un paquet. */
function flux(p) {
  const proto = NOM_PROTO[p.protocol];
  const q = p.payload;
  if (proto === "icmp") return { proto, sport: q.id, dport: q.id };
  if (proto === "udp" || proto === "tcp") return { proto, sport: q.srcPort, dport: q.dstPort };
  return { proto: null, sport: null, dport: null };
}

export class ServiceNat {
  constructor(routeur) {
    this.r = routeur;
    this.statiques = [];        // { local, global, proto?, portLocal?, portGlobal? }
    this.dynamiques = [];       // { acl, pool?, iface?, overload }
    this.pools = new Map();     // nom → { debut, fin, masque }
    this.table = [];            // les traductions en cours
    this.hits = 0;
    this.misses = 0;
    this.expirees = 0;
  }
  get horloge() { return this.r.reseau.horloge; }
  noter(t) { this.r.noter(t); }

  interfaces(role) { return this.r.tousLesPorts().filter((p) => p.natRole === role); }
  configure() { return this.statiques.length + this.dynamiques.length > 0; }

  /* Les traductions encore valables : celles qui ont dormi plus que leur
     délai disparaissent à la lecture (les statiques, jamais). */
  entrees() {
    const t = this.horloge.t;
    this.table = this.table.filter((e) => {
      if (e.permanente) return true;
      const vivante = t - e.vu <= (e.proto ? DELAIS[e.proto] : 86400000);
      if (!vivante) this.expirees++;
      return vivante;
    });
    return this.table;
  }
  /* « clear ip nat translation * » : tout ce qui est dynamique s'en va. */
  vider() { this.table = this.table.filter((e) => e.permanente); }

  /* Une traduction statique est une ligne permanente de la table : celle
     qu'on lit « --- 209.165.201.5 192.168.1.10 --- --- ». */
  synchroniserStatiques() {
    this.table = this.table.filter((e) => !e.permanente);
    this.statiques.forEach((s) => this.table.push({ permanente: true, statique: true, proto: s.proto || null,
      il: { ip: s.local, port: s.portLocal ?? null }, ig: { ip: s.global, port: s.portGlobal ?? null }, ol: null, og: null, vu: 0 }));
  }

  /* ── de l'intérieur vers l'extérieur, après le routage ── */
  sortie(p, sortie) {
    const f = flux(p);
    const t = this.horloge.t;
    // 1. une traduction existe déjà pour ce flux
    const deja = this.entrees().find((e) => e.proto && e.proto === f.proto && e.il.ip.egale(p.src) && e.il.port === f.sport
      && (!e.og || e.og.ip.egale(p.dst)));
    if (deja) {
      this.hits++;
      deja.vu = t;
      return this.reecrireSource(p, f, deja, "traduction déjà dans la table");
    }
    // 2. une traduction statique pour cette adresse
    const st = this.statiques.find((s) => s.local.egale(p.src) && (!s.proto || (s.proto === f.proto && s.portLocal === f.sport)));
    if (st) {
      this.misses++;
      const e = this.creer(f, { ip: p.src, port: f.sport }, { ip: st.global, port: st.portGlobal ?? f.sport }, p.dst, f.dport, true);
      return this.reecrireSource(p, f, e, "NAT statique " + st.local + " ↔ " + st.global);
    }
    // 3. une règle dynamique dont la liste d'accès autorise la source
    for (const d of this.dynamiques) {
      const acl = this.r.acl.get(d.acl);
      if (!acl) continue;
      const v = acl.evaluer(p.src);
      if (v.action !== "permit") continue;
      let global;
      if (d.iface) {
        const i = this.r.port(d.iface);
        if (!i || !i.ip) { this.noter("La règle NAT sort par " + d.iface + ", qui n'a pas d'adresse : rien n'est traduit."); return false; }
        global = i.ip;
      } else {
        global = this.adresseDuPool(d, p.src);
        if (!global) {
          this.misses++;
          this.noter("Le pool " + d.pool + " est épuisé : plus aucune adresse publique libre pour " + p.src + ". Paquet jeté.");
          return false;
        }
      }
      const port = d.overload ? this.portLibre(f, global, f.sport) : f.sport;
      this.misses++;
      // sans surcharge, l'adresse du pool est réservée à cet hôte : une ligne simple la garde
      if (!d.overload && !this.table.some((x) => !x.proto && !x.permanente && x.il.ip.egale(p.src))) {
        this.table.push({ proto: null, il: { ip: p.src, port: null }, ig: { ip: global, port: null }, ol: null, og: null, vu: this.horloge.t });
      }
      const e = this.creer(f, { ip: p.src, port: f.sport }, { ip: global, port }, p.dst, f.dport, false);
      return this.reecrireSource(p, f, e, (d.overload ? "PAT (overload)" : "NAT dynamique") + ", la liste d'accès " + d.acl + " autorise " + p.src);
    }
    this.noter(p.src + " n'est couverte par aucune règle NAT : le paquet sort sans traduction (et la réponse ne saura pas revenir).");
    return true;
  }

  creer(f, il, ig, dst, dport, statique) {
    const e = { proto: f.proto, il, ig, ol: { ip: dst, port: dport }, og: { ip: dst, port: dport }, statique, vu: this.horloge.t, cree: this.horloge.t };
    this.table.push(e);
    return e;
  }

  reecrireSource(p, f, e, pourquoi) {
    const avant = p.src + (f.sport != null ? ":" + f.sport : "");
    p.src = e.ig.ip;
    if (f.proto === "icmp") p.payload.id = e.ig.port;
    else if (f.proto) p.payload.srcPort = e.ig.port;
    this.noter("NAT : " + pourquoi + ". Source " + avant + " → " + p.src + (f.sport != null ? ":" + e.ig.port : "")
      + " (inside local → inside global).");
    return true;
  }

  /* Le pool sans surcharge donne une adresse par hôte, et la garde. */
  adresseDuPool(d, local) {
    const pool = this.pools.get(d.pool);
    if (!pool) return null;
    if (d.overload) return pool.debut;
    const tenue = this.entrees().find((e) => e.il.ip.egale(local) && this.dansPool(pool, e.ig.ip));
    if (tenue) return tenue.ig.ip;
    for (let n = pool.debut.n; n <= pool.fin.n; n++) {
      const ip = new IPv4Address(n);
      if (!this.entrees().some((e) => e.ig.ip.egale(ip)) && !this.statiques.some((s) => s.global.egale(ip))) return ip;
    }
    return null;
  }
  dansPool(pool, ip) { return ip.n >= pool.debut.n && ip.n <= pool.fin.n; }

  /* Le PAT garde le port d'origine s'il est libre, sinon prend le suivant. */
  portLibre(f, global, voulu) {
    const pris = (port) => this.table.some((e) => e.proto === f.proto && e.ig.ip.egale(global) && e.ig.port === port);
    if (voulu != null && !pris(voulu)) return voulu;
    for (let port = 1024; port < 65536; port++) if (!pris(port)) return port;
    return voulu;
  }

  /* ── de l'extérieur vers l'intérieur, avant le routage ──
     Rend "jeter" si le paquet vise une adresse publique sans traduction. */
  entree(p) {
    const f = flux(p);
    const m = p.payload;
    // un message d'erreur ICMP cite le paquet en cause : c'est lui qu'on retrouve
    if (f.proto === "icmp" && m.origine && (m.type === ICMP.TIME_EXCEEDED || m.type === ICMP.UNREACHABLE)) {
      const o = m.origine;
      const port = o.protocol === PROTO.ICMP ? o.id : o.srcPort;
      const e = this.entrees().find((x) => x.proto && x.ig.ip.egale(o.src) && x.ig.port === port);
      if (e) {
        this.hits++;
        p.dst = e.il.ip;
        p.payload.origine = { ...o, src: e.il.ip, id: o.protocol === PROTO.ICMP ? e.il.port : o.id, srcPort: o.protocol === PROTO.ICMP ? o.srcPort : e.il.port };
        this.noter("NAT : le message ICMP cite un paquet traduit ; il est renvoyé à l'adresse privée " + e.il.ip + ".");
        return "ok";
      }
    }
    const e = this.entrees().find((x) => x.proto && x.proto === f.proto && x.ig.ip.egale(p.dst) && x.ig.port === f.dport);
    if (e) {
      this.hits++;
      e.vu = this.horloge.t;
      return this.reecrireDestination(p, f, e.il.ip, e.il.port, "traduction trouvée dans la table");
    }
    const st = this.statiques.find((s) => s.global.egale(p.dst) && (!s.proto || (s.proto === f.proto && s.portGlobal === f.dport)));
    if (st) {
      this.misses++;
      const ent = this.creer(f, { ip: st.local, port: st.portLocal ?? f.dport }, { ip: st.global, port: f.dport }, p.src, f.sport, true);
      // vu de l'intérieur, le flux part de l'hôte extérieur : ol/og le désignent
      ent.ol = ent.og = { ip: p.src, port: f.sport };
      return this.reecrireDestination(p, f, st.local, st.portLocal ?? f.dport, "NAT statique " + st.global + " → " + st.local);
    }
    const publique = this.statiques.some((s) => s.global.egale(p.dst))
      || [...this.pools.values()].some((pool) => this.dansPool(pool, p.dst));
    if (publique) {
      this.noter(p.dst + " est une adresse publique du NAT, mais aucune traduction ne correspond à ce paquet : jeté.");
      return "jeter";
    }
    return "ok";
  }

  reecrireDestination(p, f, ip, port, pourquoi) {
    const avant = p.dst + (f.dport != null ? ":" + f.dport : "");
    p.dst = ip;
    if (f.proto === "icmp") p.payload.id = port;
    else if (f.proto) p.payload.dstPort = port;
    this.noter("NAT : " + pourquoi + ". Destination " + avant + " → " + ip + (f.dport != null ? ":" + port : "")
      + " (inside global → inside local), puis routage vers l'intérieur.");
    return "ok";
  }

  /* Le routeur répond à l'ARP pour ses adresses publiques posées sur le
     réseau de son interface extérieure : sinon le voisin ne saurait pas à
     quelle MAC envoyer ce qui leur est destiné. */
  repondArp(iface, ip) {
    if (iface.natRole !== "outside" || !iface.ip) return false;
    if (!ip.dansReseau(iface.ip, iface.masque)) return false;
    return this.statiques.some((s) => s.global.egale(ip)) || [...this.pools.values()].some((pool) => this.dansPool(pool, ip));
  }

  toJSON() {
    const s = (x) => (x ? x.toString() : null);
    return {
      statiques: this.statiques.map((x) => ({ ...x, local: s(x.local), global: s(x.global) })),
      dynamiques: this.dynamiques,
      pools: [...this.pools].map(([nom, p]) => ({ nom, debut: s(p.debut), fin: s(p.fin), masque: s(p.masque) })),
    };
  }
  appliquerJSON(j) {
    if (!j) return;
    const P = IPv4Address.parse;
    this.statiques = (j.statiques || []).map((x) => ({ ...x, local: P(x.local), global: P(x.global) }));
    this.dynamiques = j.dynamiques || [];
    this.pools = new Map((j.pools || []).map((p) => [p.nom, { debut: P(p.debut), fin: P(p.fin), masque: P(p.masque) }]));
    this.synchroniserStatiques();
  }
}
