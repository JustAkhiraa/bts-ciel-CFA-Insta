/* L'horloge du réseau : une file d'événements datés.

   Tout ce qui « prend du temps » passe par elle — une trame sur un câble,
   une seconde entre deux pings, l'attente d'une réponse ARP. Le temps est
   VIRTUEL, en millisecondes : il n'avance que quand on exécute un
   événement, et il saute directement au suivant.

   Deux façons de vider la file :
   · temps réel — `vider()` exécute tout d'un coup : un ping répond
     aussitôt, et l'ordre des événements est exactement celui d'une vraie
     exécution, puisque la file est triée par date ;
   · simulation — `pas()` exécute UN événement, et l'interface anime la
     trame avant de passer au suivant. */

export class SimulationClock {
  constructor() {
    this.t = 0;
    this.file = [];              // triée par (t, rang)
    this.rang = 0;
    this.execute = 0;            // compteur d'événements exécutés
  }

  /* Programmer « fn » dans « delai » ms. « meta » décrit l'événement pour
     l'interface (type « livraison » : une trame arrive à un port). */
  programmer(delai, fn, meta = {}) {
    const ev = { t: this.t + Math.max(0, delai), rang: this.rang++, fn, meta, annule: false };
    // insertion triée : la file est courte, une recherche dichotomique suffit
    let lo = 0, hi = this.file.length;
    while (lo < hi) {
      const mi = (lo + hi) >> 1;
      const e = this.file[mi];
      if (e.t < ev.t || (e.t === ev.t && e.rang < ev.rang)) lo = mi + 1; else hi = mi;
    }
    this.file.splice(lo, 0, ev);
    return ev;
  }

  annuler(ev) { if (ev) ev.annule = true; }

  /* Le prochain événement vivant, sans l'exécuter. */
  prochain() {
    while (this.file.length && this.file[0].annule) this.file.shift();
    return this.file[0] || null;
  }

  /* Exécuter UN événement : le temps saute à sa date. */
  pas() {
    const ev = this.prochain();
    if (!ev) return null;
    this.file.shift();
    this.t = Math.max(this.t, ev.t);
    this.execute++;
    ev.fn();
    return ev;
  }

  /* Tout exécuter. Le garde-fou n'est pas une précaution de principe :
     deux commutateurs reliés deux fois, sans STP, renvoient une diffusion
     à l'infini — c'est une TEMPÊTE DE DIFFUSION, et sur du vrai matériel
     elle sature le réseau. Ici, elle arrête la file et le dit. */
  vider(limite = 20000) {
    let n = 0;
    while (this.prochain()) {
      if (++n > limite) {
        this.file = [];
        return { tempete: true, n };
      }
      this.pas();
    }
    return { tempete: false, n };
  }

  vide() { return !this.prochain(); }
  reinitialiser() { this.file = []; }
}
