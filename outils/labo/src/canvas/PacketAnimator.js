/* Le lecteur du mode simulation.

   Il prend dans l'horloge le prochain LOT d'événements — toutes les trames
   qui arrivent au même instant —, les fait voyager le long de leurs câbles
   en enveloppes colorées par protocole, puis les livre : l'équipement
   d'arrivée décide, et ses nouvelles trames forment le lot suivant. Les
   minuteries (un délai de ping, une relance ARP) passent sans animation :
   elles ne voyagent sur aucun câble.

   Une enveloppe se clique : c'est le saut qu'elle porte que l'inspecteur
   de PDU décortique. */

import { bordCarte, COULEURS_PROTO } from "./Renderer.js";

export const DUREE = 650;          // ms d'animation par saut, à ×1

export class PacketAnimator {
  constructor(reseau, tc, rappels = {}) {
    this.reseau = reseau;
    this.tc = tc;
    this.vol = [];                 // [{ saut, ev }]
    this.debut = 0;
    this.duree = DUREE;
    this.lecture = false;
    this.vitesse = 1;
    this.rappels = rappels;        // { apresLot(), etat() }
    this.boucle = this.boucle.bind(this);
    this.anime = false;
    this.filtres = null;           // Set de protocoles visibles, ou null
  }

  get horloge() { return this.reseau.horloge; }
  enCours() { return this.vol.length > 0; }

  /* Préparer le prochain lot : exécuter les minuteries qui le précèdent,
     rassembler les livraisons du même instant. */
  lancerLot(sautes = 0) {
    if (this.vol.length) return true;
    let ev = this.horloge.prochain();
    let garde = 0;
    while (ev && ev.meta.type !== "livraison" && garde++ < 500) {
      this.horloge.pas();
      ev = this.horloge.prochain();
    }
    if (!ev) { this.lecture = false; this.notifier(); return false; }
    const t = ev.t;
    this.vol = this.horloge.file.filter((e) => !e.annule && e.t === t && e.meta.type === "livraison").map((e) => ({ saut: e.meta.saut, ev: e }));
    // un lot fait uniquement de protocoles masqués (CDP, par défaut) passe
    // sans animation : le pas suivant montre ce qu'on regarde
    if (this.filtres && this.vol.every((v) => !this.filtres.has(v.saut.protocole)) && sautes < 200) {
      const evs = new Set(this.vol.map((v) => v.ev));
      this.vol = [];
      let g = 0;
      while ([...evs].some((e) => this.horloge.file.includes(e)) && g++ < 1000) this.horloge.pas();
      this.reseau.emit("etat");
      return this.lancerLot(sautes + 1);
    }
    this.debut = performance.now();
    this.duree = DUREE / this.vitesse;
    this.demarrer();
    this.notifier();
    return true;
  }

  /* Livrer le lot en vol : chaque trame arrive, chaque équipement décide. */
  livrerLot() {
    const evs = new Set(this.vol.map((v) => v.ev));
    this.vol = [];
    let garde = 0;
    while ([...evs].some((e) => this.horloge.file.includes(e)) && garde++ < 1000) this.horloge.pas();
    this.reseau.emit("etat");
    this.notifier();
    if (this.rappels.apresLot) this.rappels.apresLot();
  }

  /* Un pas, comme le « Capture / Forward » de Packet Tracer : le lot posé
     devant ses équipements est livré (ils décident), puis le lot suivant
     voyage et s'arrête à l'arrivée — POSÉ, cliquable, jusqu'au pas
     d'après. En lecture continue, les lots s'enchaînent seuls. */
  pas() {
    if (this.vol.length) this.livrerLot();
    this.lancerLot();
  }

  basculer() {
    this.lecture = !this.lecture;
    if (this.lecture) {
      // un lot posé à l'arrivée repart aussitôt
      if (this.vol.length && performance.now() - this.debut >= this.duree) { this.livrerLot(); this.lancerLot(); }
      else if (!this.vol.length) this.lancerLot();
    }
    this.demarrer();
    this.notifier();
  }

  demarrer() {
    if (!this.anime) { this.anime = true; requestAnimationFrame(this.boucle); }
  }

  boucle(now) {
    const arrive = this.vol.length && now - this.debut >= this.duree;
    if (arrive && this.lecture) {
      this.livrerLot();
      this.lancerLot();
    }
    this.tc.demander();
    // on ne tourne que tant qu'une enveloppe bouge, ou que la lecture dure
    if ((this.vol.length && !arrive) || this.lecture) requestAnimationFrame(this.boucle);
    else this.anime = false;
  }

  reinitialiser() {
    this.vol = [];
    this.lecture = false;
    this.horloge.reinitialiser();
    this.notifier();
    this.tc.demander();
  }

  notifier() { if (this.rappels.etat) this.rappels.etat(); }

  /* Où est chaque enveloppe en ce moment ? */
  positions() {
    const p = this.vol.length ? Math.min(1, (performance.now() - this.debut) / this.duree) : 0;
    const lisse = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return this.vol.map((v) => {
      const A = v.saut.de.app, B = v.saut.vers.app;
      const a = bordCarte(A, B, 0), b = bordCarte(B, A, 0);
      return { saut: v.saut, x: a.x + (b.x - a.x) * lisse, y: a.y + (b.y - a.y) * lisse };
    });
  }

  dessiner(c, tc, ui) {
    for (const e of this.positions()) {
      if (this.filtres && !this.filtres.has(e.saut.protocole)) continue;
      const coul = COULEURS_PROTO[e.saut.protocole] || "#9aa3b2";
      const choisi = ui.sautSel === e.saut;
      c.save();
      c.translate(e.x, e.y);
      c.shadowColor = coul; c.shadowBlur = choisi ? 14 : 8;
      c.fillStyle = coul;
      c.beginPath(); c.roundRect(-11, -8, 22, 16, 3); c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = "rgba(0,0,0,.45)"; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-10, -7); c.lineTo(0, 1); c.lineTo(10, -7); c.stroke();
      if (choisi) { c.strokeStyle = tc.couleurs.texte; c.lineWidth = 2; c.strokeRect(-13, -10, 26, 20); }
      c.font = "700 9px " + tc.couleurs.mono;
      c.fillStyle = tc.couleurs.texte;
      c.textAlign = "center"; c.textBaseline = "top";
      c.fillText(e.saut.protocole, 0, 11);
      c.restore();
    }
  }

  viser(x, y) {
    for (const e of this.positions()) if (Math.abs(x - e.x) <= 13 && Math.abs(y - e.y) <= 11) return e.saut;
    return null;
  }

  /* Ce qui attend dans la file : pour le compteur du lecteur. */
  enAttente() {
    return this.horloge.file.filter((e) => !e.annule && e.meta.type === "livraison").length;
  }
}
