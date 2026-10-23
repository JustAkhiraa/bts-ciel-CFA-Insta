/* La trame Ethernet II, avec son étiquette 802.1Q quand elle passe sur un
   trunk.

   Une trame est COPIÉE à chaque saut : un commutateur qui inonde en fait
   plusieurs, un trunk ajoute une étiquette qu'un port d'accès retire, et
   l'inspecteur doit montrer chaque version telle qu'elle était sur son fil.
   Le paquet qu'elle porte est copié avec elle — un routeur qui décrémente
   le TTL ne doit pas changer le paquet que montre le saut précédent. */

export const ETHERTYPE = { ARP: 0x0806, IPV4: 0x0800 };
let suivant = 1;

export class Frame {
  constructor({ src, dst, etherType, payload, vlan = null, id = null }) {
    this.id = id || suivant++;
    this.src = src;
    this.dst = dst;
    this.vlan = vlan;               // null : trame non étiquetée
    this.etherType = etherType;
    this.payload = payload;
  }

  clone() {
    return new Frame({
      id: this.id, src: this.src, dst: this.dst, vlan: this.vlan, etherType: this.etherType,
      payload: this.payload && this.payload.clone ? this.payload.clone() : this.payload,
    });
  }

  /* Le nom du protocole le plus haut porté — ce qu'on lit d'un coup d'œil
     sur l'enveloppe animée. */
  protocole() {
    if (this.etherType === ETHERTYPE.ARP) return "ARP";
    return this.payload && this.payload.protocoleHaut ? this.payload.protocoleHaut() : "IPv4";
  }

  resume() {
    return this.payload && this.payload.resume ? this.payload.resume() : this.protocole();
  }
}
