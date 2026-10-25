/* Les listes d'accès STANDARD (1 à 99) : on ne regarde que l'adresse
   SOURCE. Chaque ligne a un masque générique (« wildcard ») — l'inverse
   d'un masque : un 0 dit « ce bit doit être égal », un 1 « peu importe ».
   La première ligne qui correspond décide ; si aucune ne correspond, le
   « deny any » implicite de la fin refuse.

   Elles servent ici à deux choses : dire quelles adresses le NAT doit
   traduire (« ip nat inside source list 1 … »), et filtrer une interface
   (« ip access-group 1 in »). */

import { IPv4Address } from "../core/IPv4Address.js";

export class ListeAcces {
  constructor(numero) {
    this.numero = numero;
    this.lignes = [];             // { action, reseau, wildcard, n, correspondances } ou { remarque }
  }

  ajouter(action, reseau, wildcard) {
    const n = (this.lignes.filter((l) => !l.remarque).length + 1) * 10;
    this.lignes.push({ action, reseau: reseau.et(new IPv4Address(~wildcard.n)), wildcard, n, correspondances: 0 });
  }
  remarque(texte) { this.lignes.push({ remarque: texte }); }

  /* « permit », « deny », et la ligne qui a décidé (null : le deny implicite). */
  evaluer(ip, compter = true) {
    for (const l of this.lignes) {
      if (l.remarque) continue;
      const garde = ~l.wildcard.n >>> 0;
      if (((ip.n & garde) >>> 0) === ((l.reseau.n & garde) >>> 0)) {
        if (compter) l.correspondances++;
        return { action: l.action, ligne: l };
      }
    }
    return { action: "deny", ligne: null };
  }

  /* L'écriture d'une ligne, comme IOS la réécrit. */
  static texte(l) {
    if (l.remarque) return "remark " + l.remarque;
    if (l.wildcard.n === 0xffffffff) return l.action + " any";
    if (l.wildcard.n === 0) return l.action + " host " + l.reseau;
    return l.action + " " + l.reseau + " " + l.wildcard;
  }
}

/* « 192.168.1.0 0.0.0.255 », « any », « host 10.0.0.1 », « 10.0.0.1 » →
   { reseau, wildcard }, ou null. */
export function lireCritere(mots) {
  if (mots[0] === "any" && mots.length === 1) return { reseau: IPv4Address.ZERO, wildcard: new IPv4Address(0xffffffff) };
  if (mots[0] === "host" && mots.length === 2) {
    const ip = IPv4Address.parse(mots[1]);
    return ip ? { reseau: ip, wildcard: IPv4Address.ZERO } : null;
  }
  const ip = IPv4Address.parse(mots[0]);
  if (!ip) return null;
  if (mots.length === 1) return { reseau: ip, wildcard: IPv4Address.ZERO };
  const w = IPv4Address.parse(mots[1]);
  return w && mots.length === 2 ? { reseau: ip, wildcard: w } : null;
}
