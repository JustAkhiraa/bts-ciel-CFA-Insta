/* Une adresse IPv4 : un entier non signé de 32 bits.

   Toutes les opérations de sous-réseau sont des opérations de bits sur cet
   entier — le ET avec le masque donne le réseau, le OU avec son complément
   donne la diffusion. C'est exactement le calcul qu'on fait au tableau, et
   c'est ce que le routeur fait pour chaque paquet. */

export class IPv4Address {
  constructor(n) { this.n = n >>> 0; }

  /* « 192.168.1.10 » → adresse, ou null si ce n'est pas une adresse :
     quatre nombres de 0 à 255, ni plus ni moins, sans zéros parasites. */
  static parse(s) {
    const m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/.exec(String(s || ""));
    if (!m) return null;
    const o = m.slice(1).map(Number);
    if (o.some((x) => x > 255)) return null;
    return new IPv4Address(((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0);
  }
  static estValide(s) { return IPv4Address.parse(s) !== null; }

  static get ZERO() { return new IPv4Address(0); }
  static get DIFFUSION() { return new IPv4Address(0xffffffff); }

  /* /24 → 255.255.255.0 */
  static depuisPrefixe(p) {
    p = Math.max(0, Math.min(32, p | 0));
    return new IPv4Address(p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);
  }

  /* Un masque est une suite de 1 puis une suite de 0, rien d'autre :
     255.255.0.255 n'en est pas un. */
  estMasque() {
    const inv = (~this.n) >>> 0;
    return ((inv + 1) & inv) === 0;
  }
  prefixe() {
    let n = this.n, p = 0;
    while (n & 0x80000000) { p++; n = (n << 1) >>> 0; }
    return p;
  }

  et(masque) { return new IPv4Address(this.n & masque.n); }
  reseau(masque) { return this.et(masque); }
  diffusion(masque) { return new IPv4Address((this.n & masque.n) | (~masque.n >>> 0)); }
  dansReseau(reseau, masque) { return ((this.n & masque.n) >>> 0) === ((reseau.n & masque.n) >>> 0); }
  plus(k) { return new IPv4Address(this.n + k); }

  egale(autre) { return !!autre && autre.n === this.n; }
  estZero() { return this.n === 0; }
  estDiffusionLimitee() { return this.n === 0xffffffff; }
  /* 224.0.0.0 à 239.255.255.255 : une adresse de groupe (multicast). */
  estMulticast() { return (this.n >>> 28) === 14; }

  octets() { return [this.n >>> 24, (this.n >>> 16) & 255, (this.n >>> 8) & 255, this.n & 255]; }
  toString() { return this.octets().join("."); }
  toJSON() { return this.toString(); }
}
