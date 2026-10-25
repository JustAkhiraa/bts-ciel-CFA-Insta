/* CDP, le protocole de découverte de Cisco : chaque routeur et chaque
   commutateur annonce sur ses liens qui il est — nom, modèle, port, adresse,
   VLAN natif. Ses voisins directs (et eux seuls : un commutateur ne relaie
   jamais une annonce CDP) le notent dans leur table, que lit
   « show cdp neighbors ».

   Le vrai CDP annonce toutes les 60 s. Ici, une annonce part quand un lien
   MONTE, et quand ce qu'elle dit CHANGE (nom d'hôte, adresse, VLAN natif) :
   le contenu de la table est le même, sans une trame toutes les minutes
   qui noierait le mode simulation. Le temps de rétention affiché
   (« Holdtme ») suit le cycle de 60 s qu'aurait le vrai protocole.

   C'est aussi CDP qui trahit un VLAN natif différent aux deux bouts d'un
   trunk : %CDP-4-NATIVE_VLAN_MISMATCH. */

import { MACAddress } from "../core/MACAddress.js";
import { Frame } from "../core/Frame.js";

export const CDP_MAC = MACAddress.parse("0100.0ccc.cccc");
export const ETHERTYPE_CDP = 0x2000;           // l'identifiant SNAP de CDP
export const RETENTION = 180;

export class CdpMessage {
  constructor({ nom, port, adresse, plateforme, capacites, version, vlanNatif, duplex = "full" }) {
    Object.assign(this, { nom, port, adresse, plateforme, capacites, version, vlanNatif, duplex });
  }
  clone() { return new CdpMessage(this); }
  protocoleHaut() { return "CDP"; }
  resume() { return "CDP : « je suis " + this.nom + ", port " + this.port + " »"; }
}

export class ServiceCdp {
  constructor(app) {
    this.app = app;
    this.actif = true;
    this.voisins = new Map();            // nom du port local → entrée
  }

  /* Ce que l'équipement dit de lui sur ce port. */
  message(port) {
    const app = this.app;
    const sw = app.type === "switch";
    const ip = port.ip || (app.interfacesL3()[0] || {}).ip || null;
    return new CdpMessage({
      nom: app.nom, port: port.nom, adresse: ip,
      plateforme: sw ? "cisco 2960" : "cisco CISCO2911/K9", capacites: sw ? "S" : "R",
      version: sw ? "Cisco IOS Software, C2960 Software (C2960-LANBASEK9-M), Version 15.0(2)SE4, RELEASE SOFTWARE (fc1)"
        : "Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.1(4)M4, RELEASE SOFTWARE (fc2)",
      vlanNatif: sw ? (port.mode === "trunk" ? port.native : port.accessVlan) : null,
    });
  }

  annoncer(port) {
    if (!this.actif || port.cdpCoupe || !port.estUp()) return;
    this.app.noter(this.app.nom + " annonce sur " + port.court + " qui il est (CDP), à destination de ses voisins directs.");
    // sur une liaison série, l'annonce voyage dans une trame HDLC ou PPP, sans adresse MAC
    port.envoyer(port.type === "se"
      ? new Frame({ src: null, dst: null, l2: port.encapsulation, etherType: ETHERTYPE_CDP, payload: this.message(port) })
      : new Frame({ src: port.mac, dst: CDP_MAC, etherType: ETHERTYPE_CDP, payload: this.message(port) }));
  }
  annoncerPartout() {
    this.app.ports.forEach((p) => { if (p.type === "fa" || p.type === "gi" || p.type === "se") this.annoncer(p); });
  }

  recevoir(port, msg) {
    if (!this.actif || port.cdpCoupe) {
      this.app.noter("CDP est désactivé sur " + this.app.nom + " : l'annonce de " + msg.nom + " est ignorée.");
      return;
    }
    const nouveau = !this.voisins.has(port.nom);
    this.voisins.set(port.nom, { ...msg, local: port, vu: this.app.reseau.horloge.t });
    this.app.noter(this.app.nom + " note son voisin CDP : " + msg.nom + " (" + msg.plateforme + "), vu sur " + port.court
      + " par son port " + msg.port + (nouveau ? "." : " — entrée rafraîchie."));
    // le VLAN natif des deux bouts d'un lien de commutateurs doit être le même
    if (this.app.type === "switch" && msg.vlanNatif !== null) {
      const local = port.mode === "trunk" ? port.native : port.accessVlan;
      if (local !== msg.vlanNatif) {
        this.app.noter("VLAN natif différent aux deux bouts : " + local + " ici, " + msg.vlanNatif + " chez " + msg.nom + ".");
        this.app.console("%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on " + port.nom + " (" + local + "), with "
          + msg.nom + " " + msg.port + " (" + msg.vlanNatif + ").");
      }
    }
  }

  oublier(port) { this.voisins.delete(port.nom); }
  vider() { this.voisins.clear(); }

  /* Les voisins encore valables : le port local doit être up. */
  liste() {
    return [...this.voisins.values()].filter((v) => v.local.estUp());
  }
  retention(v) {
    const ecoule = Math.floor((this.app.reseau.horloge.t - v.vu) / 1000);
    return RETENTION - (ecoule % 60);
  }
}
