/* Recréer dans le labo une maquette lue dans un fichier .pkt ou .pka.

   Le lecteur de fichiers du site (outils/lecteur-pkt.html) fait le gros du
   travail : il lit le fichier, garde les équipements que le labo connaît,
   traduit leurs noms de ports, et envoie une liste plate (format
   « ciel-labo-import »). Ici, rien de deviné : les routeurs et les
   commutateurs reçoivent leur configuration TAPÉE ligne à ligne dans la même
   console que l'élève, comme les labs intégrés ; les hôtes, leur adresse.

   Une ligne que la console refuse n'arrête rien : elle est comptée, et la
   section qu'elle ouvrait est sautée (sinon ses lignes tomberaient dans la
   section précédente, comme dans un vrai IOS). */

import { creer } from "../devices/Fabrique.js";
import { IOSConsole } from "../cli/IOSParser.js";
import { IPv4Address } from "../core/IPv4Address.js";

export const FORMAT_IMPORT = "ciel-labo-import";

const IP = (s) => (s ? IPv4Address.parse(s) : null);
const REFUS = /^% ?(Invalid input|Invalid interface|Incomplete command|Ambiguous command|Unknown command|Le labo ne gère)/;

function sortie() {
  const L = [];
  return { L, ligne: (t) => L.push(t), lignes: (x) => L.push(...x), ajouter: (t) => { L[L.length - 1] += t; }, occupe() {}, fin() {}, effacer() {} };
}

/* Taper une configuration complète. Avant chaque ligne de tête (non
   indentée), on revient au mode configuration : une section ne déborde
   jamais sur la suivante. Rend les lignes refusées. */
/* Une configuration IOS n'écrit « shutdown » que pour une interface éteinte :
   son absence veut dire « allumée ». Les interfaces d'un routeur du labo
   naissent éteintes, comme celles d'un vrai routeur neuf ; rejouer le fichier
   sans dire « no shutdown » les laisserait toutes à terre. */
export function completerNoShutdown(lignes) {
  const out = [];
  let dansInterface = false, eteinte = false;
  const fermer = () => { if (dansInterface && !eteinte) out.push(" no shutdown"); dansInterface = false; };
  for (const l of lignes) {
    if (!/^\s/.test(l) && l.trim() && l.trim() !== "!") {
      fermer();
      if (/^interface\s/i.test(l)) { dansInterface = true; eteinte = false; }
    } else if (dansInterface && /^\s+shutdown\s*$/i.test(l)) eteinte = true;
    out.push(l);
  }
  fermer();
  return out;
}

export function taperConfiguration(app, lignes) {
  lignes = completerNoShutdown(lignes);
  const c = new IOSConsole(app);
  const muet = sortie();
  c.executer("enable", muet);
  c.executer("configure terminal", muet);
  const refusees = [];
  let sauter = false;
  for (const brute of lignes) {
    if (!brute.trim() || brute.trim() === "!") continue;
    const tete = !/^\s/.test(brute);
    if (tete) {
      if (c.mode !== "config") { c.executer("end", muet); c.executer("configure terminal", muet); }
      sauter = false;
    } else if (sauter) { refusees.push(brute); continue; }
    const o = sortie();
    c.executer(brute.trim(), o);
    if (o.L.some((t) => REFUS.test(t))) {
      refusees.push(brute);
      if (tete) sauter = true;
    }
  }
  c.executer("end", muet);
  app.startup = null;
  return refusees;
}

export function importerPkt(reseau, j) {
  if (!j || j.format !== FORMAT_IMPORT) throw new Error("ce n'est pas une maquette venue du lecteur de fichiers .pkt");
  reseau.cables.slice().forEach((c) => reseau.deconnecter(c, true));
  reseau.appareils = [];
  reseau.horloge.reinitialiser();
  reseau.viderJournal();

  const bilan = { appareils: 0, cables: 0, refusees: [], cablesRefuses: [], ignores: (j.ignores || []).slice() };
  const parNom = new Map();
  for (const a of j.appareils || []) {
    let app;
    try { app = creer(reseau, a.type, { nom: a.nom, x: a.x, y: a.y }); }
    catch (e) { bilan.ignores.push({ nom: a.nom, raison: e.message }); continue; }
    parNom.set(a.nom, app);
    bilan.appareils++;
    if (a.ios && a.ios.length) {
      const r = taperConfiguration(app, a.ios);
      if (r.length) bilan.refusees.push({ nom: a.nom, lignes: r });
    }
    if (a.hote) {
      if (a.hote.dhcp) app.config.dhcp = true;
      else if (a.hote.ip) {
        app.configurer({ ip: IP(a.hote.ip), masque: IP(a.hote.masque || "255.255.255.0"),
                         passerelle: IP(a.hote.passerelle), dns: IP(a.hote.dns) });
      }
    }
  }
  for (const c of j.cables || []) {
    const A = parNom.get(c.a[0]), B = parNom.get(c.b[0]);
    const pa = A && A.port(c.a[1]), pb = B && B.port(c.b[1]);
    if (!pa || !pb || pa.cable || pb.cable) { bilan.cablesRefuses.push(c); continue; }
    // le cuivre prend le bon câble selon les deux familles, comme l'auto-MDIX
    const type = c.type === "cuivre" ? (A.famille === B.famille ? "croise" : "droit") : c.type;
    reseau.connecter(pa, pb, type);
    bilan.cables++;
  }
  reseau.demarrer();
  reseau.emit("topologie");
  return bilan;
}

/* La maquette voyage dans l'adresse : « labo.html#import=… », le JSON
   compressé puis encodé en base64url. Le fragment n'est jamais envoyé au
   serveur, et la page le retire dès qu'elle l'a lu. */
export async function lireFragment(fragment) {
  const b64 = fragment.replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(b64 + "===".slice((b64.length + 3) % 4));
  const octets = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream("deflate"));
  return JSON.parse(await new Response(flux).text());
}
