/* Le réseau : les équipements, les câbles, l'horloge et le journal.

   Le journal est fait de SAUTS. Un saut, c'est une trame sur un câble :
   d'où elle part, où elle arrive, ce qu'elle contient à ce moment-là, et
   les deux explications qui l'accompagnent — pourquoi l'équipement de
   départ l'a émise, et ce que l'équipement d'arrivée en a fait. La liste
   des événements et l'inspecteur de PDU ne lisent que ça. */

import { SimulationClock } from "./SimulationClock.js";
import { Cable } from "../devices/Cable.js";

export const DELAI_CABLE = 1;            // ms de temps simulé par saut
const SAUTS_GARDES = 4000;

export class Network {
  constructor() {
    this.horloge = new SimulationClock();
    this.appareils = [];
    this.cables = [];
    this.sauts = [];
    this.nSaut = 0;
    this.ecouteurs = new Map();
    this.contexte = { entrant: null, notes: [] };
    this.simulation = false;             // false : temps réel
  }

  /* ── les abonnements de l'interface ── */
  on(type, fn) {
    if (!this.ecouteurs.has(type)) this.ecouteurs.set(type, new Set());
    this.ecouteurs.get(type).add(fn);
    return () => this.ecouteurs.get(type).delete(fn);
  }
  emit(type, data) { (this.ecouteurs.get(type) || []).forEach((fn) => fn(data)); }

  /* ── la topologie ── */
  ajouter(app) {
    this.appareils.push(app);
    app.reseau = this;
    this.emit("topologie");
    return app;
  }
  retirer(app) {
    app.ports.forEach((p) => { if (p.cable) this.deconnecter(p.cable, true); });
    this.appareils = this.appareils.filter((a) => a !== app);
    this.evaluerLiens();
    this.emit("topologie");
  }
  appareil(id) { return this.appareils.find((a) => a.id === id) || null; }
  parNom(nom) {
    const n = String(nom).toLowerCase();
    return this.appareils.find((a) => a.nom.toLowerCase() === n) || null;
  }
  /* « Router0 », « Switch1 », « PC3 » : le premier numéro libre, comme
     Packet Tracer. */
  nomLibre(prefixe) {
    for (let i = 0; ; i++) if (!this.parNom(prefixe + i)) return prefixe + i;
  }
  idLibre() {
    let i = this.appareils.length + 1;
    while (this.appareil("d" + i)) i++;
    return "d" + i;
  }

  connecter(pa, pb, type) {
    if (pa.cable || pb.cable) throw new Error("port déjà occupé");
    if (pa.appareil === pb.appareil) throw new Error("un équipement ne se câble pas à lui-même");
    const c = new Cable(type, pa, pb);
    pa.cable = c; pb.cable = c;
    this.cables.push(c);
    this.evaluerLiens();
    this.emit("topologie");
    return c;
  }
  deconnecter(c, silencieux) {
    c.a.cable = null; c.b.cable = null;
    this.cables = this.cables.filter((x) => x !== c);
    if (!silencieux) { this.evaluerLiens(); this.emit("topologie"); }
  }

  /* Après tout changement physique — un câble posé, un « shutdown », un
     équipement éteint —, chaque port compare son état à l'ancien, et
     l'équipement réagit : message console, table CAM purgée… */
  evaluerLiens() {
    for (const app of this.appareils) {
      for (const p of app.ports) {
        // une liaison série a deux états qui changent séparément : la ligne
        // (le signal) et le protocole (l'horloge, l'encapsulation)
        if (p.type === "se") {
          const phys = p.physiqueUp();
          if (p._physConnu !== undefined && p._physConnu !== phys) app.lignePhysique(p, phys);
          p._physConnu = phys;
        }
        const up = p.estUp();
        if (p._etatConnu !== undefined && p._etatConnu !== up) app.lienChange(p, up);
        p._etatConnu = up;
      }
    }
    this.emit("etat");
  }

  /* ── les explications ── */
  noter(texte) {
    this.contexte.notes.push(texte);
    if (this.contexte.entrant) this.contexte.entrant.reception.push(texte);
  }
  issue(issue) { if (this.contexte.entrant) this.contexte.entrant.issue = issue; }

  /* ── une trame quitte un port ── */
  transmettre(port, trame) {
    const enFace = port.enFace();
    const saut = {
      n: ++this.nSaut, t: this.horloge.t + DELAI_CABLE, depart: this.horloge.t,
      de: { app: port.appareil, port }, vers: { app: enFace.appareil, port: enFace },
      cable: port.cable, trame: trame.clone(), protocole: trame.protocole(),
      emission: this.contexte.notes.slice(), reception: [], issue: null, livre: false,
    };
    this.contexte.notes = [];
    this.sauts.push(saut);
    if (this.sauts.length > SAUTS_GARDES) this.sauts.splice(0, this.sauts.length - SAUTS_GARDES);
    port.activite = enFace.activite = Date.now();
    this.horloge.programmer(DELAI_CABLE, () => this.livrer(saut), { type: "livraison", saut });
    this.emit("saut", saut);
    return saut;
  }

  livrer(saut) {
    const avant = this.contexte;
    this.contexte = { entrant: saut, notes: [] };
    saut.livre = true;
    const p = saut.vers.port;
    if (!p.cable || p.cable !== saut.cable || !p.estUp()) {
      this.noter("La trame se perd : le lien est tombé pendant qu'elle était en route.");
      saut.issue = "jetee";
    } else {
      p.appareil.recevoirTrame(p, saut.trame.clone());
      if (!saut.issue) saut.issue = "recue";
    }
    this.contexte = avant;
    this.emit("livre", saut);
  }

  /* En temps réel, tout ce qui a été mis en route s'exécute maintenant. */
  executer() {
    if (this.simulation) { this.emit("file"); return; }
    const r = this.horloge.vider();
    if (r.tempete) this.emit("tempete", r);
    this.emit("etat");
  }

  viderJournal() { this.sauts = []; this.emit("journal"); }

  /* Une topologie vient d'être chargée : chaque équipement annonce qui il
     est (CDP) et ce qu'il sait joindre (RIP), et tout ce trafic
     d'installation s'écoule AVANT qu'on prenne la main — le journal repart
     vide, la première trame qu'on y verra sera la nôtre. */
  demarrer() {
    this.evaluerLiens();
    for (const a of this.appareils) if (a.demarrer) a.demarrer();
    this.horloge.vider();
    this.viderJournal();
    this.emit("etat");
  }
}
