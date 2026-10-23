/* Ce que fait la souris (et le doigt, et le clavier) sur la topologie.

   Trois outils : SÉLECTION (cliquer, glisser, rectangle de sélection),
   CÂBLE (un équipement, puis un autre), POSE (poser l'équipement choisi
   dans la bibliothèque). Partout : Espace + glisser, clic molette ou clic
   droit pour se déplacer, molette pour zoomer autour du pointeur.

   Le câblage corrige le premier reproche fait à Packet Tracer : en mode
   automatique (C), aucun menu — le premier port libre qui convient est pris
   et le bon câble choisi ; en mode explicite, la liste des ports s'ouvre
   CONTRE l'équipement, avec l'état de chacun. */

import { viser, DEMI } from "./Renderer.js";
import { Cable } from "../devices/Cable.js";

const PAS_GRILLE = 20;

/* Le port qu'on prendrait « tout seul » pour relier a à b. */
export function portAuto(a, b, type) {
  const libres = a.ports.filter((p) => !p.cable);
  if (type === "console") return libres.find((p) => p.type === "console" || p.type === "rs232") || null;
  const donnees = libres.filter((p) => p.type === "fa" || p.type === "gi");
  if (type === "fibre") return donnees.find((p) => p.fibre) || null;
  if (a.type === "switch") {
    const versInfra = b.type === "switch" || b.type === "routeur";
    const gi = donnees.filter((p) => p.type === "gi"), fa = donnees.filter((p) => p.type === "fa");
    return (versInfra ? gi[0] || fa[0] : fa[0] || gi[0]) || null;
  }
  return donnees[0] || null;
}

export class InteractionManager {
  constructor({ scene, tc, reseau, ui, animateur, choixPort, indice, rappels }) {
    Object.assign(this, { scene, tc, reseau, ui, animateur, choixPort, indice, rappels });
    this.geste = null;
    this.espace = false;
    const t = tc.toile;
    t.addEventListener("pointerdown", (e) => this.bas(e));
    t.addEventListener("pointermove", (e) => this.bouge(e));
    t.addEventListener("pointerup", (e) => this.haut(e));
    t.addEventListener("pointercancel", () => { this.geste = null; });
    t.addEventListener("dblclick", (e) => this.double(e));
    t.addEventListener("contextmenu", (e) => e.preventDefault());
    t.addEventListener("wheel", (e) => this.molette(e), { passive: false });
    scene.addEventListener("keydown", (e) => this.touche(e));
    scene.addEventListener("keyup", (e) => { if (e.key === " ") { this.espace = false; this.curseur(); } });
    scene.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("text/labo-type")) e.preventDefault(); });
    scene.addEventListener("drop", (e) => this.depot(e));
  }

  pos(e) {
    const r = this.tc.toile.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }
  aimanter(v) { return this.ui.aimant ? Math.round(v / PAS_GRILLE) * PAS_GRILLE : v; }

  curseur(c) {
    const ui = this.ui;
    let k = c || "default";
    if (this.espace || (this.geste && this.geste.mode === "pan")) k = this.geste && this.geste.mode === "pan" ? "grabbing" : "grab";
    else if (ui.outil === "cable" || ui.outil === "poser") k = "crosshair";
    this.tc.toile.style.cursor = k;
  }

  dire(texte) {
    this.indice.hidden = !texte;
    this.indice.textContent = texte || "";
  }

  bas(e) {
    this.scene.focus({ preventScroll: true });
    this.fermerChoix();
    const { sx, sy } = this.pos(e);
    const m = this.tc.versMonde(sx, sy);
    this.tc.toile.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || this.espace) {
      e.preventDefault();
      if (e.button === 2 && this.ui.pose) { this.annulerPose(); return; }
      this.geste = { mode: "pan", sx, sy, cx: this.tc.cam.x, cy: this.tc.cam.y };
      this.curseur();
      return;
    }
    if (e.button !== 0) return;
    const ui = this.ui;
    // une enveloppe en vol (mode simulation) se clique
    const saut = this.animateur.viser(m.x, m.y);
    if (saut) { ui.sautSel = saut; this.rappels.selection(); return; }
    const cible = viser(this.reseau, m.x, m.y, this.tc.cam.z);
    if (ui.outil === "poser") {
      this.rappels.poser(ui.typePose, this.aimanter(m.x), this.aimanter(m.y));
      if (!e.shiftKey) { ui.outil = "selection"; ui.typePose = null; this.rappels.outil(); }
      return;
    }
    if (ui.outil === "cable") { if (cible && cible.appareil) this.choisirExtremite(cible.appareil); else this.annulerPose(); return; }
    if (cible && cible.appareil) {
      const a = cible.appareil;
      if (e.shiftKey) { if (ui.selection.has(a)) ui.selection.delete(a); else ui.selection.add(a); }
      else if (!ui.selection.has(a)) { ui.selection = new Set([a]); }
      ui.cableSel = null; ui.sautSel = null;
      this.geste = { mode: "deplacer", m0: m, depart: [...ui.selection].map((x) => ({ a: x, x: x.x, y: x.y })), bouge: false };
      this.rappels.selection();
      return;
    }
    if (cible && cible.cable) {
      ui.selection = new Set(); ui.cableSel = cible.cable; ui.sautSel = null;
      this.rappels.selection();
      return;
    }
    if (!e.shiftKey) { ui.selection = new Set(); ui.cableSel = null; ui.sautSel = null; }
    ui.cadre = { x0: m.x, y0: m.y, x1: m.x, y1: m.y, avant: new Set(ui.selection) };
    this.geste = { mode: "cadre" };
    this.rappels.selection();
  }

  bouge(e) {
    const { sx, sy } = this.pos(e);
    const m = this.tc.versMonde(sx, sy);
    this.ui.pointeur = m;
    const g = this.geste;
    if (!g) {
      if (this.ui.pose) this.tc.demander();
      const cible = viser(this.reseau, m.x, m.y, this.tc.cam.z);
      this.curseur(this.ui.outil === "selection" && cible ? "pointer" : null);
      return;
    }
    if (g.mode === "pan") {
      this.tc.cam.x = g.cx - (sx - g.sx) / this.tc.cam.z;
      this.tc.cam.y = g.cy - (sy - g.sy) / this.tc.cam.z;
      this.tc.demander();
      return;
    }
    if (g.mode === "deplacer") {
      const dx = m.x - g.m0.x, dy = m.y - g.m0.y;
      if (!g.bouge && Math.hypot(dx, dy) * this.tc.cam.z < 3) return;
      g.bouge = true;
      g.depart.forEach((d) => { d.a.x = this.aimanter(d.x + dx); d.a.y = this.aimanter(d.y + dy); });
      this.tc.demander();
      return;
    }
    if (g.mode === "cadre") {
      const c = this.ui.cadre;
      c.x1 = m.x; c.y1 = m.y;
      const x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1), y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1);
      this.ui.selection = new Set(c.avant);
      this.reseau.appareils.forEach((a) => { if (a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1) this.ui.selection.add(a); });
      this.tc.demander();
    }
  }

  haut() {
    const g = this.geste;
    this.geste = null;
    if (!g) return;
    if (g.mode === "pan") { this.curseur(); this.rappels.camera(); return; }
    if (g.mode === "deplacer" && g.bouge) this.rappels.modifie();
    if (g.mode === "cadre") { this.ui.cadre = null; this.rappels.selection(); }
    this.tc.demander();
  }

  double(e) {
    const { sx, sy } = this.pos(e);
    const m = this.tc.versMonde(sx, sy);
    const c = viser(this.reseau, m.x, m.y, this.tc.cam.z);
    if (c && c.appareil) this.rappels.terminal(c.appareil);
  }

  molette(e) {
    e.preventDefault();
    const { sx, sy } = this.pos(e);
    if (e.shiftKey && !e.ctrlKey) {
      this.tc.cam.x += (e.deltaY || e.deltaX) / this.tc.cam.z;
      this.tc.demander();
      return;
    }
    const k = e.deltaMode === 1 ? 0.05 : 0.0015;
    this.tc.zoomer(Math.exp(-e.deltaY * k), sx, sy);
    this.rappels.camera();
  }

  depot(e) {
    const type = e.dataTransfer.getData("text/labo-type");
    if (!type) return;
    e.preventDefault();
    const { sx, sy } = this.pos(e);
    const m = this.tc.versMonde(sx, sy);
    this.rappels.poser(type, this.aimanter(m.x), this.aimanter(m.y));
  }

  /* ── le câblage ── */
  commencerPose(type) {
    this.ui.outil = "cable";
    this.ui.typeCable = type;
    this.ui.pose = { depart: null };
    this.dire("Câble " + (type === "auto" ? "automatique" : type) + " : cliquez sur le premier équipement. Échap pour annuler.");
    this.curseur();
    this.rappels.outil();
  }
  annulerPose() {
    this.ui.pose = null;
    this.ui.outil = "selection";
    this.dire("");
    this.fermerChoix();
    this.curseur();
    this.rappels.outil();
    this.tc.demander();
  }

  async choisirExtremite(app) {
    const ui = this.ui, pose = ui.pose;
    const autre = pose.depart ? pose.depart.appareil : null;
    if (autre === app) return;
    let port;
    if (ui.typeCable === "auto") {
      // l'automatique relie des ports de données ; la console se choisit exprès
      port = portAuto(app, autre || app, null);
      if (!port) { this.rappels.toast(app.nom + " n'a plus de port libre."); return; }
    } else {
      port = await this.ouvrirChoix(app, ui.typeCable);
      if (!port) return;
    }
    if (!pose.depart) {
      pose.depart = port;
      this.dire(app.nom + " " + port.court + " → cliquez sur le second équipement.");
      this.tc.demander();
      return;
    }
    const type = ui.typeCable === "auto" ? Cable.typeAuto(pose.depart, port) : ui.typeCable;
    this.rappels.cabler(pose.depart, port, type);
    ui.pose = { depart: null };
    this.dire("Câble posé. Cliquez sur un autre équipement pour continuer, Échap pour finir.");
  }

  /* La liste des ports, contre l'équipement : libres en premier, avec leur
     état ; les ports occupés sont grisés et disent où ils vont. */
  ouvrirChoix(app, type) {
    return new Promise((resolve) => {
      const el = this.choixPort;
      const ports = app.ports.filter((p) => (type === "console" ? p.type === "console" || p.type === "rs232" : p.type === "fa" || p.type === "gi"));
      el.innerHTML = "<p>" + app.nom + " — choisir un port</p>" + ports.map((p, i) => {
        const occ = p.cable ? "→ " + p.cable.autre(p).appareil.nom : type === "fibre" && !p.fibre ? "pas de fibre" : "libre";
        return '<button type="button" data-i="' + i + '"' + (p.cable || (type === "fibre" && !p.fibre) ? " disabled" : "") + ">"
          + p.nom + "<small>" + occ + "</small></button>";
      }).join("");
      const ecran = this.tc.versEcran(app.x + DEMI + 6, app.y - DEMI);
      el.style.left = Math.min(ecran.x, this.tc.largeur - 230) + "px";
      el.style.top = Math.max(6, Math.min(ecran.y, this.tc.hauteur - 260)) + "px";
      el.hidden = false;
      const premier = el.querySelector("button:not([disabled])");
      if (premier) premier.focus();
      // la liste refermée rend le clavier au canevas : sans ça, Échap
      // partait dans le vide et le mode câble ne se quittait plus
      this._choix = (p) => { el.hidden = true; this._choix = null; this.scene.focus({ preventScroll: true }); resolve(p); };
      el.onclick = (e) => {
        const b = e.target.closest("button[data-i]");
        if (b) this._choix(ports[+b.dataset.i]);
      };
      el.onkeydown = (e) => {
        if (e.key === "Escape") { this._choix(null); this.scene.focus(); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const bs = [...el.querySelectorAll("button:not([disabled])")];
          const i = bs.indexOf(document.activeElement);
          const j = (i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length;
          bs[j].focus(); e.preventDefault();
        }
      };
    });
  }
  fermerChoix() { if (this._choix) this._choix(null); this.choixPort.hidden = true; }

  /* ── le clavier sur la topologie ── */
  touche(e) {
    if (e.target !== this.scene) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod) return;
    if (e.key === " ") { e.preventDefault(); if (!this.espace) { this.espace = true; this.curseur(); } return; }
    if (e.key === "Escape") {
      if (this.ui.pose) return this.annulerPose();
      if (this.ui.outil === "poser") { this.ui.outil = "selection"; this.rappels.outil(); return; }
      this.ui.selection = new Set(); this.ui.cableSel = null; this.ui.sautSel = null;
      this.rappels.selection();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); this.rappels.supprimer(); return; }
    if (k === "c") { this.commencerPose("auto"); return; }
    if (k === "v") { if (this.ui.pose) this.annulerPose(); return; }
    if (k === "g") { this.rappels.aimant(); return; }
    if (k === "f") { this.rappels.ajuster(); return; }
    if (k === "p" && this.reseau.simulation) { this.animateur.basculer(); return; }
    if (e.key === "ArrowRight" && this.reseau.simulation) { e.preventDefault(); this.animateur.pas(); return; }
    if (e.key.startsWith("Arrow") && this.ui.selection.size) {
      e.preventDefault();
      const d = e.shiftKey ? PAS_GRILLE : 4;
      const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0, dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
      this.ui.selection.forEach((a) => { a.x += dx; a.y += dy; });
      this.rappels.modifie();
      this.tc.demander();
    }
  }
}
