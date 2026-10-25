/* Le labo réseau, assemblé : un réseau, un canevas, des panneaux.

   Ce fichier ne contient aucune logique de réseau ni de dessin : il relie
   les modules entre eux, branche les commandes de l'écran, et garde la
   topologie dans le navigateur. */

import { Network } from "./core/Network.js";
import { creer, serialiser, charger, TYPES } from "./devices/Fabrique.js";
import { TYPES_CABLE } from "./devices/Cable.js";
import { TopologyCanvas } from "./canvas/TopologyCanvas.js";
import { dessinerGrille, dessinerCables, dessinerAppareils, dessinerSelectionCadre, dessinerCablePose, icone, COULEURS_TYPE } from "./canvas/Renderer.js";
import { InteractionManager } from "./canvas/InteractionManager.js";
import { PacketAnimator } from "./canvas/PacketAnimator.js";
import { WorkspaceLayout } from "./ui/WorkspaceLayout.js";
import { DeviceInspector } from "./ui/DeviceInspector.js";
import { TerminalTabs } from "./ui/TerminalTabs.js";
import { CommandPalette } from "./ui/CommandPalette.js";
import { LABS, chargerLab } from "./ui/Presets.js";

const $ = (s) => document.querySelector(s);
const CLE = "ciel-labo-v1";

const reseau = new Network();
const ui = {
  selection: new Set(), cableSel: null, sautSel: null,
  outil: "selection", typePose: null, typeCable: "auto", pose: null,
  cadre: null, pointeur: null, aimant: true, lab: null, fichier: null,
};

/* ── la disposition et le canevas ── */
const tc = new TopologyCanvas($("#lb-toile"));
const disposition = new WorkspaceLayout({
  racine: $("#labo"), poigneeDroite: $("#lb-poignee-droite"), poigneeBas: $("#lb-poignee-bas"),
  toast: $("#lb-toast"), apresRedim: () => tc.demander(),
});
const toast = (t, faute) => disposition.toast(t, faute);

const animateur = new PacketAnimator(reseau, tc, {
  etat: () => majLecteur(),
  apresLot: () => { inspecteur.rendre(); terminaux.rendreEvenements(); },
});
tc.peintres.push(
  (c, t) => dessinerGrille(c, t, ui.aimant),
  (c, t, dpr) => {
    t.monde(c, dpr);
    dessinerCables(c, t, reseau, ui);
    dessinerCablePose(c, t, ui);
    dessinerAppareils(c, t, reseau, ui);
    animateur.dessiner(c, t, ui);
    dessinerSelectionCadre(c, t, ui);
  },
);
// les pastilles clignotent quand une trame passe : on repeint tant qu'il y a de l'activité
let clignote = 0;
function surveillerActivite() {
  if (clignote) return;
  const boucle = () => {
    tc.demander();
    const actif = reseau.cables.some((c) => Date.now() - (c.a.activite || 0) < 500 || Date.now() - (c.b.activite || 0) < 500);
    clignote = actif ? requestAnimationFrame(boucle) : 0;
  };
  clignote = requestAnimationFrame(boucle);
}

/* ── les panneaux ── */
const inspecteur = new DeviceInspector({
  el: $("#lb-inspecteur"), reseau, ui,
  rappels: {
    terminal: (a) => terminaux.ouvrir(a), supprimer: () => supprimer(), modifie: () => modifie(), toast,
    selection: () => selectionChange(), lab: () => ui.lab, rechargerLab: () => ouvrirLab(ui.lab.id),
  },
});
const terminaux = new TerminalTabs({
  onglets: $("#lb-onglets"), conteneur: $("#lb-terminaux"), reseau, ui,
  rappels: {
    apresCommande: () => { modifie(); inspecteur.rendre(); surveillerActivite(); },
    selection: () => selectionChange(),
    filtres: (f) => { animateur.filtres = f; tc.demander(); },
    replier: () => disposition.basculer("sansTerminal"),
    deplier: () => { if (disposition.taille.sansTerminal) disposition.basculer("sansTerminal", false); },
  },
});
animateur.filtres = terminaux.filtres;       // les protocoles décochés ne s'animent pas
const interactions = new InteractionManager({
  scene: $("#lb-scene"), tc, reseau, ui, animateur, choixPort: $("#lb-choix-port"), indice: $("#lb-indice"),
  rappels: {
    selection: () => selectionChange(),
    poser: (type, x, y) => poser(type, x, y),
    cabler: (a, b, type) => cabler(a, b, type),
    terminal: (a) => terminaux.ouvrir(a),
    supprimer: () => supprimer(),
    modifie: () => modifie(),
    camera: () => { $("#lb-zoom-val").textContent = Math.round(tc.cam.z * 100) + " %"; garder(); },
    outil: () => majOutils(),
    aimant: () => basculerAimant(),
    ajuster: () => toutVoir(),
    toast,
  },
});

/* ── les actions ── */
function selectionChange() { inspecteur.rendre(); tc.demander(); majOutils(); }
function modifie() { garder(); tc.demander(); }

function poser(type, x, y) {
  const a = creer(reseau, type, { x, y });
  ui.selection = new Set([a]); ui.cableSel = null; ui.sautSel = null;
  modifie(); selectionChange();
  toast(a.nom + " ajouté. Double-cliquez pour ouvrir son terminal.");
  return a;
}

function cabler(pa, pb, type) {
  if (pa.cable || pb.cable) { toast("Un des deux ports est déjà occupé.", true); return; }
  const c = reseau.connecter(pa, pb, type);
  const v = c.verdict();
  toast(pa.appareil.nom + " " + pa.court + " ↔ " + pb.appareil.nom + " " + pb.court + " (" + TYPES_CABLE[type].nom.toLowerCase() + ")"
    + (v.ok ? "" : " — " + v.raison), !v.ok);
  modifie(); inspecteur.rendre();
}

function supprimer() {
  if (ui.cableSel) { reseau.deconnecter(ui.cableSel); ui.cableSel = null; }
  else if (ui.selection.size) {
    ui.selection.forEach((a) => { terminaux.oublier(a); reseau.retirer(a); });
    ui.selection = new Set();
  } else return;
  modifie(); selectionChange();
}

function boite() {
  const A = reseau.appareils;
  if (!A.length) return null;
  const xs = A.map((a) => a.x), ys = A.map((a) => a.y);
  return { x: Math.min(...xs) - 60, y: Math.min(...ys) - 60, w: Math.max(...xs) - Math.min(...xs) + 120, h: Math.max(...ys) - Math.min(...ys) + 140 };
}
function toutVoir() { tc.ajuster(boite()); $("#lb-zoom-val").textContent = Math.round(tc.cam.z * 100) + " %"; }

function basculerAimant() {
  ui.aimant = !ui.aimant;
  $("#lb-grille").setAttribute("aria-pressed", String(ui.aimant));
  toast(ui.aimant ? "Grille magnétique : les équipements se calent tous les 20 px." : "Grille magnétique désactivée.");
  tc.demander();
}

function ouvrirLab(id) {
  terminaux.toutFermer();
  animateur.reinitialiser();
  ui.lab = chargerLab(reseau, id);
  ui.selection = new Set(); ui.cableSel = null; ui.sautSel = null; ui.fichier = null;
  majFichier();
  requestAnimationFrame(toutVoir);
  modifie(); selectionChange();
  toast(ui.lab.titre + " chargé. Les étapes sont à droite.");
}

function nouvelle() {
  terminaux.toutFermer();
  animateur.reinitialiser();
  charger(reseau, { format: "ciel-labo", version: 1, appareils: [], cables: [] });
  ui.lab = null; ui.fichier = "Topologie vierge";
  majFichier(); modifie(); selectionChange();
}

function majFichier() { $("#lb-fichier").textContent = ui.lab ? ui.lab.court : ui.fichier || "Topologie libre"; }

/* ── le mode : temps réel ou simulation ── */
function changerMode(simu) {
  if (reseau.simulation === simu) return;
  reseau.simulation = simu;
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-checked", String((b.dataset.mode === "simu") === simu)));
  $("#lb-lecteur").hidden = !simu;
  if (!simu) {
    animateur.vol = []; animateur.lecture = false;
    reseau.executer();               // ce qui attendait part d'un coup
    ui.sautSel = null;
    if (terminaux.actif === "evts") terminaux.activer(terminaux.terms[0] || null);
  } else {
    terminaux.activer("evts");
    toast("Simulation : lancez un ping depuis un terminal, puis avancez pas à pas (→) ou en lecture (P).");
  }
  terminaux.rendreOnglets();
  majLecteur(); inspecteur.rendre(); tc.demander();
}

function majLecteur() {
  const n = animateur.enAttente(), vol = animateur.vol.length;
  $("#lb-file").textContent = vol ? vol + " trame" + (vol > 1 ? "s" : "") + " en vol · " + n + " en file" : n ? n + " trame" + (n > 1 ? "s" : "") + " en file" : "file vide";
  const play = $("#lb-sim-play");
  play.innerHTML = animateur.lecture ? '<svg viewBox="0 0 20 20"><path d="M6 5h3v10H6zM11 5h3v10h-3z" class="plein"/></svg>'
    : '<svg viewBox="0 0 20 20"><path d="M7 5l8 5-8 5z" class="plein"/></svg>';
  play.setAttribute("aria-label", animateur.lecture ? "Pause" : "Lecture");
  tc.demander();
}

/* ── les fichiers ── */
function exporter() {
  const j = serialiser(reseau);
  j.lab = ui.lab ? ui.lab.id : null;
  j.camera = tc.cam;
  const blob = new Blob([JSON.stringify(j, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (ui.lab ? ui.lab.id : "topologie") + ".labo.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Topologie enregistrée : équipements, câbles et configurations.");
}
function importer(texte, nom) {
  try {
    const j = JSON.parse(texte);
    terminaux.toutFermer();
    animateur.reinitialiser();
    charger(reseau, j);
    ui.lab = j.lab ? LABS.find((l) => l.id === j.lab) || null : null;
    ui.fichier = nom;
    ui.selection = new Set(); ui.cableSel = null; ui.sautSel = null;
    majFichier();
    if (j.camera) { tc.cam = { ...j.camera }; tc.demander(); } else requestAnimationFrame(toutVoir);
    modifie(); selectionChange();
    toast("« " + nom + " » ouvert : " + reseau.appareils.length + " équipements.");
  } catch (e) {
    toast("Impossible d'ouvrir « " + nom + " » : " + e.message, true);
  }
}
$("#lb-fichier-in").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => importer(String(r.result), f.name);
  r.readAsText(f);
  e.target.value = "";
});

/* La sauvegarde automatique : différée, pour ne pas écrire à chaque trame. */
let minuterie = 0;
function garder() {
  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    try {
      const j = serialiser(reseau);
      j.lab = ui.lab ? ui.lab.id : null;
      j.camera = tc.cam;
      j.fichier = ui.fichier;
      localStorage.setItem(CLE, JSON.stringify(j));
    } catch (e) { /* stockage plein ou bloqué : le labo marche quand même */ }
  }, 500);
}

/* ── la palette ── */
function commandes() {
  const L = [];
  for (const [type, T] of Object.entries(TYPES)) {
    L.push({ titre: "Ajouter un " + T.nom.toLowerCase(), groupe: "Équipement", mots: type + " " + T.prefixe, faire: () => {
      const c = tc.versMonde(tc.largeur / 2, tc.hauteur / 2);
      poser(type, Math.round(c.x / 20) * 20, Math.round(c.y / 20) * 20);
    } });
  }
  LABS.forEach((l) => L.push({ titre: "Charger le " + l.titre, groupe: "Lab", mots: l.court, faire: () => ouvrirLab(l.id) }));
  L.push({ titre: "Nouvelle topologie vierge", groupe: "Fichier", faire: nouvelle });
  L.push({ titre: "Enregistrer la topologie (JSON)", raccourci: "Ctrl S", faire: exporter });
  L.push({ titre: "Ouvrir une topologie (JSON)", raccourci: "Ctrl O", faire: () => $("#lb-fichier-in").click() });
  L.push({ titre: "Vider toutes les tables ARP", groupe: "Tables", mots: "arp cache clear", faire: () => {
    reseau.appareils.forEach((a) => a.ip && a.ip.viderArp()); inspecteur.rendre(true); toast("Tables ARP vidées sur tous les équipements.");
  } });
  L.push({ titre: "Vider toutes les tables MAC (CAM)", groupe: "Tables", mots: "mac address table cam clear", faire: () => {
    reseau.appareils.forEach((a) => a.viderCam && a.viderCam()); inspecteur.rendre(true); toast("Tables CAM vidées sur tous les commutateurs.");
  } });
  L.push({ titre: reseau.simulation ? "Passer en temps réel" : "Passer en mode simulation", groupe: "Mode", mots: "simulation realtime pas a pas", faire: () => changerMode(!reseau.simulation) });
  if (reseau.simulation) {
    L.push({ titre: "Simulation : un pas", raccourci: "→", faire: () => animateur.pas() });
    L.push({ titre: "Simulation : lecture / pause", raccourci: "P", faire: () => animateur.basculer() });
    L.push({ titre: "Simulation : vider la file et le journal", faire: () => { animateur.reinitialiser(); reseau.viderJournal(); } });
  }
  L.push({ titre: "Câble automatique", raccourci: "C", groupe: "Câble", faire: () => interactions.commencerPose("auto") });
  Object.entries(TYPES_CABLE).forEach(([k, t]) => L.push({ titre: "Câble " + t.nom.toLowerCase(), groupe: "Câble", faire: () => interactions.commencerPose(k) }));
  reseau.appareils.forEach((a) => L.push({ titre: "Terminal de " + a.nom, groupe: "Terminal", mots: "cli console " + a.type, faire: () => terminaux.ouvrir(a) }));
  L.push({ titre: "Tout voir", raccourci: "F", faire: toutVoir });
  L.push({ titre: "Grille magnétique", raccourci: "G", faire: basculerAimant });
  L.push({ titre: "Thème clair / sombre", faire: theme });
  L.push({ titre: "Afficher / masquer l'inspecteur", faire: () => disposition.basculer("sansInspecteur") });
  L.push({ titre: "Afficher / masquer les terminaux", faire: () => disposition.basculer("sansTerminal") });
  if (ui.selection.size || ui.cableSel) L.push({ titre: "Supprimer la sélection", raccourci: "Suppr", faire: supprimer });
  return L;
}
const palette = new CommandPalette({
  racine: $("#lb-palette"), champ: $("#lb-palette-q"), liste: $("#lb-palette-liste"), commandes,
  retour: () => $("#lb-scene").focus({ preventScroll: true }),
});

function theme() { disposition.basculerTheme(); tc.lireCouleurs(); tc.demander(); inspecteur.rendre(true); }

/* ── la bibliothèque ── */
function petiteIcone(type) {
  const dpr = window.devicePixelRatio || 1;
  const cv = document.createElement("canvas");
  cv.width = 34 * dpr; cv.height = 34 * dpr;
  const k = cv.getContext("2d"); k.scale(dpr, dpr);
  icone(k, type, 17, 17, 28, COULEURS_TYPE[type]);
  cv.setAttribute("aria-hidden", "true");
  return cv;
}
const MODELES = { routeur: "2911", switch: "2960", pc: "", portable: "", serveur: "" };
for (const [type, T] of Object.entries(TYPES)) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "lb-equip"; b.draggable = true;
  b.dataset.type = type;
  b.title = "Glisser sur la topologie, ou cliquer puis cliquer où le poser";
  b.appendChild(petiteIcone(type));
  b.insertAdjacentHTML("beforeend", "<span>" + T.nom + "</span>" + (MODELES[type] ? "<small>" + MODELES[type] + "</small>" : ""));
  b.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/labo-type", type); e.dataTransfer.effectAllowed = "copy"; });
  b.addEventListener("click", () => {
    if (ui.outil === "poser" && ui.typePose === type) { ui.outil = "selection"; ui.typePose = null; }
    else { if (ui.pose) interactions.annulerPose(); ui.outil = "poser"; ui.typePose = type; interactions.dire("Cliquez sur la topologie pour poser : " + T.nom.toLowerCase() + ". Maj pour en poser plusieurs."); }
    majOutils();
    $("#lb-scene").focus({ preventScroll: true });
  });
  $("#lb-equipements").appendChild(b);
}
const CABLES = [["auto", "Automatique", "C"], ["droit", "Droit"], ["croise", "Croisé"], ["fibre", "Fibre"], ["console", "Console"], ["serie", "Série DCE"]];
$("#lb-cables").innerHTML = CABLES.map(([k, t, r]) => '<button type="button" class="lb-cable" role="radio" data-cable="' + k + '" aria-checked="false">'
  + (k === "auto" ? '<svg viewBox="0 0 20 20"><path d="M4 16c4 0 4-12 12-12"/><circle cx="4" cy="16" r="1.6" class="plein"/><circle cx="16" cy="4" r="1.6" class="plein"/></svg>' : '<i class="' + k + '"></i>')
  + "<span>" + t + "</span>" + (r ? "<kbd>" + r + "</kbd>" : "") + "</button>").join("");
$("#lb-cables").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cable]");
  if (!b) return;
  if (ui.outil === "cable" && ui.typeCable === b.dataset.cable) interactions.annulerPose();
  else interactions.commencerPose(b.dataset.cable);
  $("#lb-scene").focus({ preventScroll: true });
});
$("#lb-labs").innerHTML = LABS.map((l) => '<button type="button" class="lb-lab" data-lab="' + l.id + '"><b>' + l.court + "</b><span>" + l.titre.split(" — ")[0] + "</span></button>").join("");
$("#lb-labs").addEventListener("click", (e) => { const b = e.target.closest("[data-lab]"); if (b) ouvrirLab(b.dataset.lab); });

function majOutils() {
  document.querySelectorAll(".lb-equip").forEach((b) => b.setAttribute("aria-pressed", String(ui.outil === "poser" && ui.typePose === b.dataset.type)));
  document.querySelectorAll("[data-cable]").forEach((b) => b.setAttribute("aria-checked", String(ui.outil === "cable" && ui.typeCable === b.dataset.cable)));
  if (ui.outil === "selection" && !ui.pose) interactions.dire("");
  interactions.curseur();
}

/* ── la barre du haut et le lecteur ── */
document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => changerMode(b.dataset.mode === "simu")));
$("#lb-palette-b").addEventListener("click", () => palette.ouvrir());
$("#lb-ouvrir").addEventListener("click", () => $("#lb-fichier-in").click());
$("#lb-enregistrer").addEventListener("click", exporter);
$("#lb-theme").addEventListener("click", theme);
$("#lb-aide-b").addEventListener("click", () => { ui.selection = new Set(); ui.cableSel = null; ui.sautSel = null; disposition.basculer("sansInspecteur", false); selectionChange(); });
document.querySelectorAll("[data-zoom]").forEach((b) => b.addEventListener("click", () => { tc.zoomer(b.dataset.zoom === "+" ? 1.2 : 1 / 1.2); $("#lb-zoom-val").textContent = Math.round(tc.cam.z * 100) + " %"; garder(); }));
$("#lb-zoom-val").addEventListener("click", toutVoir);
$("#lb-grille").addEventListener("click", basculerAimant);
$("#lb-sim-play").addEventListener("click", () => animateur.basculer());
$("#lb-sim-pas").addEventListener("click", () => animateur.pas());
$("#lb-sim-raz").addEventListener("click", () => { animateur.reinitialiser(); reseau.viderJournal(); inspecteur.rendre(true); });
document.querySelectorAll("[data-vitesse]").forEach((b) => b.addEventListener("click", () => {
  animateur.vitesse = +b.dataset.vitesse;
  document.querySelectorAll("[data-vitesse]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
}));

/* ── le clavier global ── */
document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); if (palette.ouverte()) palette.fermer(); else palette.ouvrir(); return; }
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); exporter(); return; }
  if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); $("#lb-fichier-in").click(); return; }
  if (mod && /^[1-9]$/.test(e.key)) { e.preventDefault(); terminaux.activerRang(+e.key - 1); }
});

/* ── tout ce qui change dans le réseau redessine ce qui en dépend ── */
let prevu = 0;
const rafraichir = () => { if (!prevu) prevu = requestAnimationFrame(() => { prevu = 0; inspecteur.rendre(); tc.demander(); majLecteur(); }); };
reseau.on("etat", rafraichir);
reseau.on("topologie", () => { rafraichir(); garder(); });
reseau.on("config", garder);
reseau.on("saut", surveillerActivite);
reseau.on("file", majLecteur);
reseau.on("tempete", (r) => toast("Tempête de diffusion : une boucle sans STP renvoie les trames à l'infini. " + r.n + " événements, file arrêtée.", true));

/* ── le démarrage : la dernière session, sinon le lab 1 ── */
let repris = false;
try {
  const j = JSON.parse(localStorage.getItem(CLE) || "null");
  if (j && j.appareils && j.appareils.length) {
    charger(reseau, j);
    ui.lab = j.lab ? LABS.find((l) => l.id === j.lab) || null : null;
    ui.fichier = j.fichier || null;
    if (j.camera) tc.cam = { ...j.camera };
    repris = true;
  }
} catch (e) { /* session illisible : on repart du lab 1 */ }
if (!repris) { ui.lab = chargerLab(reseau, "lab1"); requestAnimationFrame(toutVoir); }
majFichier();
majOutils();
inspecteur.rendre(true);
terminaux.rendreOnglets();
$("#lb-zoom-val").textContent = Math.round(tc.cam.z * 100) + " %";
tc.demander();

/* Un point d'entrée pour la vérification automatique. */
window.CIEL_LABO = { reseau, ui, tc, terminaux, animateur, changerMode, ouvrirLab, serialiser: () => serialiser(reseau) };
