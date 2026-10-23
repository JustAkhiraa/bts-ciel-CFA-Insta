/* Créer un équipement par son type, et passer une topologie entière en
   JSON et retour. Le format est à nous (« ciel-labo », version 1) : il
   porte les configurations — ce qu'un élève tape —, jamais les tables
   dynamiques (ARP, CAM), qui se reconstruisent toutes seules. */

import { HostPC } from "./HostPC.js";
import { Server } from "./Server.js";
import { SwitchL2 } from "./SwitchL2.js";
import { RouterL3 } from "./RouterL3.js";
import { appliquerPort } from "./Device.js";
import { MACAddress } from "../core/MACAddress.js";
import { IPv4Address } from "../core/IPv4Address.js";

export const TYPES = {
  routeur: { nom: "Routeur", prefixe: "Router", classe: RouterL3 },
  switch: { nom: "Commutateur", prefixe: "Switch", classe: SwitchL2 },
  pc: { nom: "PC", prefixe: "PC", classe: HostPC },
  portable: { nom: "Portable", prefixe: "Laptop", classe: HostPC },
  serveur: { nom: "Serveur", prefixe: "Server", classe: Server },
};

export function creer(reseau, type, { x = 0, y = 0, nom = null, id = null } = {}) {
  const T = TYPES[type];
  if (!T) throw new Error("type inconnu : " + type);
  const app = new T.classe({ id: id || reseau.idLibre(), nom: nom || reseau.nomLibre(T.prefixe), x, y, type });
  app.type = type;
  return reseau.ajouter(app);
}

export function serialiser(reseau) {
  return {
    format: "ciel-labo", version: 1,
    appareils: reseau.appareils.map((a) => a.toJSON()),
    cables: reseau.cables.map((c) => ({ type: c.type, a: [c.a.appareil.id, c.a.nom], b: [c.b.appareil.id, c.b.nom] })),
  };
}

export function charger(reseau, json) {
  if (!json || json.format !== "ciel-labo") throw new Error("ce fichier n'est pas une topologie du labo");
  reseau.cables.slice().forEach((c) => reseau.deconnecter(c, true));
  reseau.appareils = [];
  reseau.horloge.reinitialiser();
  reseau.viderJournal();
  for (const j of json.appareils) {
    const app = creer(reseau, j.type, { x: j.x, y: j.y, nom: j.nom, id: j.id });
    app.allume = j.allume !== false;
    if (j.nomUsine) app.nomUsine = j.nomUsine;
    app.appliquerPorts(j.ports);
    for (const p of app.ports) {
      const pj = p._json;
      if (!pj) continue;
      if (pj.mac) { const m = MACAddress.parse(pj.mac); if (m) { p.mac = m; MACAddress.reserver(m); } }
      p.ip = IPv4Address.parse(pj.ip);
      p.masque = IPv4Address.parse(pj.masque);
      p.helper = IPv4Address.parse(pj.helper);
      delete p._json;
    }
    if (app.appliquerJSON) app.appliquerJSON(j);
  }
  for (const c of json.cables || []) {
    const a = reseau.appareil(c.a[0]), b = reseau.appareil(c.b[0]);
    const pa = a && a.port(c.a[1]), pb = b && b.port(c.b[1]);
    if (pa && pb && !pa.cable && !pb.cable) reseau.connecter(pa, pb, c.type);
  }
  reseau.evaluerLiens();
  reseau.emit("topologie");
  return reseau;
}
