/* RIP, le routage dynamique « à vecteur de distance » qu'on apprend en
   premier : chaque routeur dit à ses voisins quels réseaux il sait joindre,
   et à combien de sauts. Un voisin qui apprend un réseau plus près qu'il
   ne le connaissait l'installe (code R, distance administrative 120) et le
   répète plus loin, un saut de plus. 16 sauts, c'est l'infini.

   Les règles qu'on vérifie en TP sont toutes là :
   - « network » s'écrit en réseau de CLASSE (10.0.0.0, 192.168.1.0) : il
     active RIP sur les interfaces de ce réseau-là ;
   - version 1 par défaut (sans masques, en diffusion 255.255.255.255) ;
     « version 2 » envoie les masques, vers 224.0.0.9 ;
   - le résumé automatique (« auto-summary ») résume aux frontières de
     classe — et casse les réseaux discontinus, d'où « no auto-summary » ;
   - l'horizon partagé (split horizon) : on ne réannonce jamais un réseau
     sur l'interface par laquelle on l'a appris ;
   - « passive-interface » : on annonce le réseau du LAN, mais on n'envoie
     plus rien sur ce LAN ;
   - « default-information originate » : propager la route par défaut.

   Ce qui diffère du vrai RIP, et pourquoi : il n'y a PAS de mise à jour
   périodique toutes les 30 s (elles feraient tourner l'horloge sans fin et
   noieraient le mode simulation). Un routeur annonce sa table quand elle
   CHANGE (les « mises à jour déclenchées », que le vrai RIP envoie aussi),
   et demande celle de ses voisins quand une interface monte ou qu'une
   route tombe. La table obtenue est la même. */

import { IPv4Address } from "../core/IPv4Address.js";
import { IPv4Packet, UdpDatagram, PROTO } from "../core/Packet.js";

export const PORT_RIP = 520;
export const INFINI = 16;
const MULTICAST_RIP = IPv4Address.parse("224.0.0.9");

export class RipMessage {
  constructor({ commande, version, entrees = [] }) {
    this.commande = commande;        // 1 requête, 2 réponse
    this.version = version;
    this.entrees = entrees;          // { reseau, masque|null, metrique }
  }
  clone() { return new RipMessage({ ...this, entrees: this.entrees.map((e) => ({ ...e })) }); }
  protocoleHaut() { return "RIP"; }
  resume() {
    return "RIPv" + this.version + " " + (this.commande === 1 ? "requête : « envoyez-moi votre table »"
      : "réponse : " + this.entrees.length + " route" + (this.entrees.length > 1 ? "s" : ""));
  }
}

/* Le réseau de classe d'une adresse : A /8, B /16, C /24. */
export function classe(ip) {
  const o = ip.n >>> 24;
  const p = o < 128 ? 8 : o < 192 ? 16 : 24;
  const masque = IPv4Address.depuisPrefixe(p);
  return { reseau: ip.reseau(masque), masque, prefixe: p };
}
const cle = (reseau, masque) => reseau + "/" + masque.prefixe();

export class ServiceRip {
  constructor(r) {
    this.r = r;
    this.actif = false;
    this.version = null;             // null : envoie v1, reçoit v1 et v2
    this.reseaux = [];               // les « network », en réseaux de classe
    this.passives = new Set();       // noms d'interfaces
    this.resume = true;              // auto-summary (le défaut d'IOS 15.1)
    this.defaut = false;             // default-information originate
    this.appris = new Map();         // "réseau/préfixe" → { reseau, masque, via, iface, metrique, vu }
    this.annonce = new Map();        // ce qui a été annoncé la dernière fois : clé → métrique
    this.sources = new Map();        // voisin → dernière mise à jour reçue
    this.debug = false;
    this.prevu = false;
  }
  get reseau() { return this.r.reseau; }
  get horloge() { return this.r.reseau.horloge; }
  noter(t) { this.r.noter(t); }
  trace(t) { if (this.debug) this.r.console(t); }

  versionEnvoi() { return this.version || 1; }
  accepte(v) { return this.version === null || this.version === v; }

  /* Les interfaces où RIP tourne : actives, adressées, et couvertes par
     une commande « network ». */
  interfaces() {
    if (!this.actif) return [];
    return this.r.interfacesL3().filter((i) => this.reseaux.some((n) => classe(i.ip).reseau.egale(n)));
  }
  /* Celles où l'on ENVOIE : ni passives, ni de bouclage (sans voisin). */
  emettrices() { return this.interfaces().filter((i) => i.type !== "loop" && !this.passives.has(i.nom)); }
  couvre(iface) { return this.interfaces().includes(iface); }

  /* Les routes RIP en service : celles dont l'interface est toujours up. */
  routes() {
    return [...this.appris.values()].filter((e) => e.metrique < INFINI && e.iface.estUp());
  }

  /* Tout ce que le routeur sait annoncer, avant horizon partagé et résumé. */
  brutes() {
    const out = new Map();
    for (const i of this.interfaces()) {
      const reseau = i.ip.reseau(i.masque);
      out.set(cle(reseau, i.masque), { reseau, masque: i.masque, metrique: 1, iface: null });
    }
    for (const e of this.routes()) {
      const k = cle(e.reseau, e.masque);
      if (!out.has(k)) out.set(k, { reseau: e.reseau, masque: e.masque, metrique: Math.min(INFINI, e.metrique + 1), iface: e.iface });
    }
    if (this.defaut && this.r.statiques.some((s) => s.masque.prefixe() === 0)) {
      out.set("0.0.0.0/0", { reseau: IPv4Address.ZERO, masque: IPv4Address.ZERO, metrique: 1, iface: null });
    }
    return out;
  }

  /* ── ce qu'on annonce sur une interface ── */
  table(sortie) {
    const brutes = this.brutes();
    const out = new Map();
    const mettre = (reseau, masque, metrique) => {
      // résumé automatique : un sous-réseau d'un AUTRE réseau de classe que
      // celui de l'interface de sortie part sous la forme de sa classe entière
      if (this.resume && !reseau.estZero()) {
        const cl = classe(reseau);
        if (!cl.reseau.egale(classe(sortie.ip).reseau)) { reseau = cl.reseau; masque = cl.masque; }
      }
      const k = cle(reseau, masque);
      const deja = out.get(k);
      if (!deja || metrique < deja.metrique) out.set(k, { reseau, masque, metrique });
    };
    for (const e of brutes.values()) {
      if (e.iface && e.iface === sortie) continue;            // horizon partagé
      mettre(e.reseau, e.masque, e.metrique);
    }
    // une route annoncée la dernière fois et disparue depuis : empoisonnée (16)
    for (const [k, m] of this.annonce) {
      if (brutes.has(k) || m >= INFINI) continue;
      const [r, p] = k.split("/");
      mettre(IPv4Address.parse(r), IPv4Address.depuisPrefixe(+p), INFINI);
    }
    return out;
  }

  /* ── envoyer ── */
  envoyer(iface, commande, destinataire = null) {
    const v = this.versionEnvoi();
    let entrees = [];
    if (commande === 2) {
      entrees = [...this.table(iface).values()].map((e) => ({ reseau: e.reseau, masque: v === 2 ? e.masque : null, metrique: e.metrique }));
      if (!entrees.length) return;
    }
    const dst = destinataire || (v === 2 ? MULTICAST_RIP : IPv4Address.DIFFUSION);
    const msg = new RipMessage({ commande, version: v, entrees });
    this.noter(this.r.nom + " envoie une " + (commande === 1 ? "requête" : "mise à jour") + " RIPv" + v + " sur " + iface.court
      + (commande === 2 ? " : " + entrees.map((e) => e.reseau + (e.masque ? "/" + e.masque.prefixe() : "") + " (" + e.metrique + ")").join(", ") : "") + ".");
    this.trace("RIP: sending v" + v + " " + (commande === 1 ? "request" : "update") + " to " + dst + " via " + iface.nom + " (" + iface.ip + ")");
    this.r.ip.envoyerVia(new IPv4Packet({ src: iface.ip, dst, ttl: 2, protocol: PROTO.UDP,
      payload: new UdpDatagram({ srcPort: PORT_RIP, dstPort: PORT_RIP, data: msg }) }), iface, dst);
  }

  /* Une mise à jour DÉCLENCHÉE : toute la table, sur toutes les interfaces
     RIP non passives. Elle part au prochain tour de l'horloge, une seule
     fois même si dix choses ont changé — et donc après la dernière ligne
     d'une configuration collée d'un bloc (« passive-interface » compris). */
  declencher() { this.planifier("maj"); }
  /* Demander leur table aux voisins (au démarrage, après une perte). */
  demander() { this.planifier("demande"); }

  planifier(quoi) {
    if (!this.actif) return;
    this.aFaire = this.aFaire || new Set();
    this.aFaire.add(quoi);
    if (this.prevu) return;
    this.prevu = true;
    this.horloge.programmer(0, () => {
      this.prevu = false;
      const a = this.aFaire;
      this.aFaire = new Set();
      if (!this.actif) return;
      if (a.has("demande")) this.emettrices().forEach((i) => this.envoyer(i, 1));
      if (a.has("maj")) {
        this.emettrices().forEach((i) => this.envoyer(i, 2));
        this.annonce = new Map([...this.brutes()].map(([k, e]) => [k, e.metrique]));
      }
    }, { type: "minuterie", quoi: "RIP" });
  }

  demarrer() { if (this.actif) { this.demander(); this.declencher(); } }

  /* ── recevoir ── */
  recevoir(iface, paquet) {
    const m = paquet.payload.data;
    if (!(m instanceof RipMessage)) return;
    if (!this.actif || !this.couvre(iface)) {
      this.noter("RIP ne tourne pas sur " + iface.court + " : le message RIP de " + paquet.src + " est ignoré.");
      return;
    }
    if (!this.accepte(m.version)) {
      this.noter(this.r.nom + " est en version " + this.version + " : il ignore ce message RIPv" + m.version + " de " + paquet.src + ".");
      this.trace("RIP: ignored v" + m.version + " packet from " + paquet.src + " (illegal version)");
      return;
    }
    if (m.commande === 1) {
      this.noter(paquet.src + " demande la table RIP de " + this.r.nom + " : il la lui envoie.");
      if (this.emettrices().includes(iface)) this.envoyer(iface, 2);
      return;
    }
    this.trace("RIP: received v" + m.version + " update from " + paquet.src + " on " + iface.nom);
    this.sources.set(paquet.src.toString(), this.horloge.t);
    let change = false, perte = false;
    for (const e of m.entrees) {
      // RIPv1 n'envoie pas de masque : celui de l'interface si le réseau est
      // le même réseau de classe, sinon le masque de classe
      const masque = e.masque || (classe(e.reseau).reseau.egale(classe(iface.ip).reseau) ? iface.masque : classe(e.reseau).masque);
      const reseau = e.reseau.reseau(masque);
      const k = cle(reseau, masque);
      this.trace("      " + reseau + "/" + masque.prefixe() + " via 0.0.0.0 in " + e.metrique + " hops" + (e.metrique >= INFINI ? " (inaccessible)" : ""));
      if (this.r.interfacesL3().some((i) => i.ip.reseau(i.masque).egale(reseau) && i.masque.egale(masque))) continue;   // connecté : rien à apprendre
      const actuel = this.appris.get(k);
      if (e.metrique >= INFINI) {
        if (actuel && actuel.via.egale(paquet.src)) {
          this.appris.delete(k);
          this.noter(paquet.src + " annonce " + k + " à 16 sauts (empoisonnée) : " + this.r.nom + " retire cette route.");
          change = true; perte = true;
        }
        continue;
      }
      if (!actuel || e.metrique < actuel.metrique || actuel.via.egale(paquet.src)) {
        const nouveau = !actuel || !actuel.via.egale(paquet.src) || actuel.metrique !== e.metrique;
        this.appris.set(k, { reseau, masque, via: paquet.src, iface, metrique: e.metrique, vu: this.horloge.t });
        if (nouveau) {
          this.noter(this.r.nom + " apprend " + k + " via " + paquet.src + " (" + iface.court + "), à " + e.metrique + " saut(s) : route R [120/" + e.metrique + "].");
          change = true;
        }
      }
    }
    if (change) { this.reseau.emit("etat"); this.declencher(); }
    if (perte) this.demander();
  }

  /* Une interface tombe : ses routes apprises tombent avec elle. */
  lienChange(port, up) {
    if (!this.actif) return;
    if (!up) {
      let perdu = false;
      for (const [k, e] of this.appris) if (e.iface === port || e.iface.parent === port) { this.appris.delete(k); perdu = true; }
      this.declencher();
      if (perdu) this.demander();
    } else {
      // l'interface (ou ses sous-interfaces) revient : on se présente
      this.demander();
      this.declencher();
    }
  }

  /* Après un changement de configuration (network, version, passive…). */
  reconfigurer() {
    // les routes apprises par une interface qui ne fait plus de RIP disparaissent
    for (const [k, e] of this.appris) if (!this.couvre(e.iface)) this.appris.delete(k);
    this.demander();
    this.declencher();
  }

  toJSON() {
    return { actif: this.actif, version: this.version, reseaux: this.reseaux.map(String), passives: [...this.passives],
      resume: this.resume, defaut: this.defaut };
  }
  appliquerJSON(j) {
    if (!j) return;
    this.actif = !!j.actif; this.version = j.version ?? null;
    this.reseaux = (j.reseaux || []).map((x) => IPv4Address.parse(x)).filter(Boolean);
    this.passives = new Set(j.passives || []);
    this.resume = j.resume !== false; this.defaut = !!j.defaut;
  }
}
