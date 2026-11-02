/* Les objectifs d'un lab, vérifiés par le labo lui-même.

   Un objectif n'est pas coché sur parole : il est ÉPROUVÉ. Pour ne rien
   déranger — ni le journal que l'élève regarde, ni la simulation en cours,
   ni les tables ARP qu'il est en train d'observer — on vérifie sur une
   COPIE : la topologie passe en JSON (comme pour un enregistrement), se
   recharge dans un réseau neuf, et c'est là qu'on tape les pings et les
   « show ». Le réseau de l'élève ne voit passer aucune trame.

   Rien ici ne touche au DOM : le banc le fait tourner sous node. */

import { Network } from "../core/Network.js";
import { serialiser, charger } from "../devices/Fabrique.js";
import { HostShell } from "../cli/HostShell.js";
import { IOSConsole } from "../cli/IOSParser.js";

function sortie() {
  const L = [];
  return { L, o: { ligne: (t) => L.push(t), lignes: (x) => L.push(...x), ajouter: (t) => { L[L.length - 1] += t; }, occupe() {}, fin() {}, effacer() {} } };
}

/* Ce qu'un objectif peut demander à la copie. */
class Sonde {
  constructor(reseau) { this.reseau = reseau; this.renouveles = new Set(); }
  app(nom) {
    const a = this.reseau.parNom(nom);
    if (!a) throw new Error("aucun équipement nommé « " + nom + " »");
    return a;
  }
  /* Un poste en DHCP n'a pas d'adresse dans la copie : il la redemande,
     une fois, avant la première épreuve qui le concerne. */
  pret(nom) {
    const a = this.app(nom);
    if (a.config && a.config.dhcp && !this.renouveles.has(nom)) {
      this.renouveles.add(nom);
      this.hote(nom, "ipconfig /renew");
    }
    return a;
  }
  hote(nom, ligne) {
    const { L, o } = sortie();
    new HostShell(this.app(nom)).executer(ligne, o);
    this.reseau.executer();
    return L;
  }
  ios(nom, lignes) {
    const c = new IOSConsole(this.app(nom));
    let L = [];
    for (const l of ["enable"].concat(lignes)) { const s = sortie(); c.executer(l, s.o); L = s.L; }
    return L;
  }
  /* Vrai si la cible répond au moins une fois sur deux échos. */
  joint(nom, ip) {
    this.pret(nom);
    return this.hote(nom, "ping -n 2 " + ip).some((l) => l.startsWith("Reply from " + ip + ":"));
  }
  adresse(nom) {
    const a = this.pret(nom);
    return a.carte && a.carte.ip ? a.carte.ip.toString() : null;
  }
  resout(nom, domaine, ip) {
    this.pret(nom);
    return this.hote(nom, "nslookup " + domaine).includes("Address:  " + ip);
  }
}

/* → [{ texte, ok }] — un objectif qui lève une erreur est simplement
   non atteint : une copie incomplète (un équipement supprimé) ne doit
   pas faire tomber l'inspecteur. */
export function verifierObjectifs(reseau, lab) {
  if (!lab || !lab.objectifs) return [];
  const copie = new Network();
  charger(copie, JSON.parse(JSON.stringify(serialiser(reseau))));
  const s = new Sonde(copie);
  return lab.objectifs.map((obj) => {
    let ok = false;
    try { ok = !!obj.test(s); } catch (e) { ok = false; }
    return { texte: obj.texte, ok };
  });
}
