/* Ce que tout équipement a en commun : un nom, une place sur le canevas,
   des ports, et une façon de parler — à sa console (les messages
   %LINK-5-CHANGED) et au journal (les explications de l'inspecteur). */

import { normaliserInterface, nomCourt } from "./Port.js";

export class Device {
  constructor({ id, nom, x = 0, y = 0 }) {
    this.id = id;
    this.nom = nom;
    this.nomUsine = nom;             // celui que « reload » sans startup-config rend
    this.x = x;
    this.y = y;
    this.ports = [];
    this.allume = true;
    this.reseau = null;
    this.famille = "hote";           // « hote » (MDI) ou « commutateur » (MDI-X)
    this.type = "device";
  }

  /* Un port par son nom complet, son abréviation, ou n'importe quelle
     écriture qu'IOS accepterait (« f0/1 », « Gi0/0.10 »). */
  port(nom) {
    const long = normaliserInterface(nom) || nom;
    return this.tousLesPorts().find((p) => p.nom === long || p.court === nom || p.nom.toLowerCase() === String(nom).toLowerCase()) || null;
  }
  tousLesPorts() { return this.ports; }
  portsDonnees() { return this.ports.filter((p) => p.type !== "console" && p.type !== "rs232"); }
  portsLibres() { return this.ports.filter((p) => !p.cable); }

  recevoirTrame(/* port, trame */) {}
  lienChange(/* port, up */) {}
  sviActive() { return false; }

  noter(texte) { if (this.reseau) this.reseau.noter(texte); }
  console(texte) { if (this.reseau) this.reseau.emit("console", { app: this, texte }); }

  /* Les messages de lien d'IOS, mot pour mot : c'est ce qu'un élève voit
     défiler quand il tape « no shutdown ». */
  annoncerLien(port, up) {
    const etat = up ? "up" : "down";
    if (port.adminUp || !up) {
      this.console("%LINK-" + (up ? 5 : 3) + "-" + (up ? "CHANGED" : "UPDOWN") + ": Interface " + port.nom
        + ", changed state to " + (port.adminUp ? etat : "administratively down"));
    }
    this.console("%LINEPROTO-5-UPDOWN: Line protocol on Interface " + port.nom + ", changed state to " + etat);
  }

  toJSON() {
    const j = { id: this.id, type: this.type, nom: this.nom, x: Math.round(this.x), y: Math.round(this.y),
                allume: this.allume, ports: this.ports.map((p) => p.toJSON()) };
    if (this.nomUsine !== this.nom) j.nomUsine = this.nomUsine;
    return j;
  }
  appliquerPorts(liste) {
    (liste || []).forEach((j) => {
      const p = this.port(j.nom);
      if (p) appliquerPort(p, j);
    });
  }
}

export { nomCourt };

export function appliquerPort(p, j) {
  // import tardif évité : les adresses sont relues par le module appelant
  p.adminUp = j.adminUp !== false;
  if (j.description) p.description = j.description;
  if (j.mode) p.mode = j.mode;
  if (j.accessVlan) p.accessVlan = j.accessVlan;
  if (j.native) p.native = j.native;
  if (j.allowed) p.allowed = new Set(j.allowed);
  if (j.dot1q !== undefined) { p.dot1q = j.dot1q; p.dot1qNatif = !!j.dot1qNatif; }
  p._json = j;            // ip, masque, helper, mac : relus par l'équipement
}
