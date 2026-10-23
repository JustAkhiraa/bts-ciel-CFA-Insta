/* Le dessin de la topologie : la grille, les câbles avec leurs badges de
   ports, les équipements.

   La lisibilité d'abord, c'est tout le reproche fait à Packet Tracer :
   chaque extrémité de câble porte le NOM du port (« Fa0/1 ») et une
   PASTILLE d'état — vert actif, orange bloqué, rouge éteint —, qui
   clignote quand une trame passe. */

export const DEMI = 30;                  // demi-côté de la carte d'un équipement
export const COULEURS_TYPE = { routeur: "#7c8cff", switch: "#2bb3a0", pc: "#e3a03a", portable: "#e3a03a", serveur: "#c06cf0" };
export const COULEURS_PROTO = { ARP: "#f5c542", ICMP: "#7c8cff", DHCP: "#3fb950", DNS: "#2bb3a0", HTTP: "#c06cf0", TCP: "#c06cf0", UDP: "#9aa3b2", IPv4: "#9aa3b2" };
const STYLE_CABLE = { droit: { tirets: [] }, croise: { tirets: [7, 5] }, fibre: { tirets: [], couleur: "#e3a03a" }, console: { tirets: [2, 4], couleur: "#5ab0ff" } };

/* ── les icônes, tracées au pinceau (aucune image) ── */
export function icone(c, type, x, y, t, couleur) {
  c.save();
  c.translate(x, y);
  c.scale(t / 24, t / 24);
  c.strokeStyle = couleur; c.fillStyle = couleur;
  c.lineWidth = 1.7; c.lineCap = "round"; c.lineJoin = "round";
  const fl = (x1, y1, x2, y2) => {               // une flèche de x1,y1 vers x2,y2
    const a = Math.atan2(y2 - y1, x2 - x1);
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.moveTo(x2, y2); c.lineTo(x2 - 3.2 * Math.cos(a - 0.6), y2 - 3.2 * Math.sin(a - 0.6));
    c.moveTo(x2, y2); c.lineTo(x2 - 3.2 * Math.cos(a + 0.6), y2 - 3.2 * Math.sin(a + 0.6));
    c.stroke();
  };
  if (type === "routeur") {
    c.beginPath(); c.ellipse(0, 0, 10.5, 10.5, 0, 0, Math.PI * 2); c.stroke();
    fl(-6.5, -6.5, -1.6, -1.6); fl(6.5, 6.5, 1.6, 1.6); fl(1.6, -1.6, 6.5, -6.5); fl(-1.6, 1.6, -6.5, 6.5);
  } else if (type === "switch") {
    c.beginPath(); c.roundRect(-11, -8, 22, 16, 3); c.stroke();
    fl(-6, -3, 6, -3); fl(6, 3, -6, 3);
  } else if (type === "pc") {
    c.beginPath(); c.roundRect(-10, -9, 20, 13, 2); c.stroke();
    c.beginPath(); c.moveTo(0, 4); c.lineTo(0, 8); c.moveTo(-5, 9); c.lineTo(5, 9); c.stroke();
  } else if (type === "portable") {
    c.beginPath(); c.roundRect(-8, -8, 16, 11, 1.5); c.stroke();
    c.beginPath(); c.moveTo(-11, 7); c.lineTo(11, 7); c.lineTo(9, 4); c.lineTo(-9, 4); c.closePath(); c.stroke();
  } else if (type === "serveur") {
    c.beginPath(); c.roundRect(-7, -11, 14, 22, 2); c.stroke();
    c.beginPath(); c.moveTo(-4, -6); c.lineTo(4, -6); c.moveTo(-4, -2); c.lineTo(4, -2); c.stroke();
    c.beginPath(); c.arc(0, 6, 1.4, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

/* Le point du bord de la carte sur la droite qui va du centre a vers b. */
export function bordCarte(a, b, marge = 4) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const k = DEMI + marge;
  const t = Math.min(k / Math.abs(dx || 1e-9), k / Math.abs(dy || 1e-9));
  return { x: a.x + dx * Math.min(t, 0.45), y: a.y + dy * Math.min(t, 0.45) };
}

export function dessinerGrille(c, tc, aimant) {
  const z = tc.cam.z, pas = 20;
  let p = pas;
  while (p * z < 14) p *= 2;
  const s = p * z;
  const ox = (-tc.cam.x * z) % s, oy = (-tc.cam.y * z) % s;
  c.fillStyle = tc.couleurs.grille;
  const r = aimant ? 1.6 : 1.1;
  for (let x = ox; x < tc.largeur; x += s) for (let y = oy; y < tc.hauteur; y += s) c.fillRect(x - r / 2, y - r / 2, r, r);
}

function pastille(c, x, y, couleur, actif, z) {
  c.beginPath();
  c.arc(x, y, 3.6, 0, Math.PI * 2);
  c.fillStyle = couleur;
  c.fill();
  if (actif) {
    c.beginPath(); c.arc(x, y, 6.5, 0, Math.PI * 2);
    c.strokeStyle = couleur; c.globalAlpha = 0.55; c.lineWidth = 2 / Math.max(z, 0.5); c.stroke(); c.globalAlpha = 1;
  }
}

/* Les câbles : trait selon le type, badges aux deux bouts. */
export function dessinerCables(c, tc, reseau, ui) {
  const z = tc.cam.z;
  const maintenant = Date.now();
  const col = tc.couleurs;
  for (const cab of reseau.cables) {
    const A = cab.a.appareil, B = cab.b.appareil;
    const pa = bordCarte(A, B), pb = bordCarte(B, A);
    const st = STYLE_CABLE[cab.type] || STYLE_CABLE.droit;
    const verdict = cab.verdict();
    const choisi = ui.cableSel === cab;
    c.save();
    c.lineWidth = choisi ? 3 : 2;
    c.setLineDash(verdict.ok ? st.tirets : [4, 4]);
    c.strokeStyle = !verdict.ok ? col.rouge : st.couleur || col["texte-faible"];
    if (choisi) { c.shadowColor = col.accent; c.shadowBlur = 8; }
    c.beginPath(); c.moveTo(pa.x, pa.y); c.lineTo(pb.x, pb.y); c.stroke();
    c.restore();
    if (!verdict.ok) {
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      c.save(); c.strokeStyle = col.rouge; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(mx - 5, my - 5); c.lineTo(mx + 5, my + 5); c.moveTo(mx + 5, my - 5); c.lineTo(mx - 5, my + 5); c.stroke();
      c.restore();
    }
    // les deux badges : nom du port + pastille d'état
    for (const [port, de, vers] of [[cab.a, pa, pb], [cab.b, pb, pa]]) {
      const L = Math.hypot(vers.x - de.x, vers.y - de.y) || 1;
      // un câble qui part vers le bas passe sous le nom de l'équipement : son
      // badge s'éloigne d'autant, pour ne pas écrire par-dessus
      const versBas = (vers.y - de.y) / L > 0.45;
      const d = Math.min(versBas ? 66 : 36, L * (versBas ? 0.42 : 0.32));
      const bx = de.x + (vers.x - de.x) / L * d, by = de.y + (vers.y - de.y) / L * d;
      const e = port.etat();
      const couleur = e.couleur === "vert" ? col.vert : e.couleur === "orange" ? col.orange : col.rouge;
      const actif = maintenant - (port.activite || 0) < 450 && Math.floor(maintenant / 90) % 2 === 0;
      if (z >= 0.55) {
        c.font = "600 9.5px " + col.mono;
        const txt = port.court;
        const w = c.measureText(txt).width + 18;
        c.fillStyle = col.panneau;
        c.strokeStyle = col["bord-fort"];
        c.lineWidth = 1;
        c.beginPath(); c.roundRect(bx - w / 2, by - 8, w, 16, 8); c.fill(); c.stroke();
        pastille(c, bx - w / 2 + 8, by, couleur, actif, z);
        c.fillStyle = col.texte;
        c.textBaseline = "middle"; c.textAlign = "left";
        c.fillText(txt, bx - w / 2 + 14, by + 0.5);
      } else {
        pastille(c, bx, by, couleur, actif, z);
      }
    }
  }
}

export function dessinerAppareils(c, tc, reseau, ui) {
  const col = tc.couleurs;
  for (const a of reseau.appareils) {
    const choisi = ui.selection.has(a);
    const teinte = COULEURS_TYPE[a.type] || col.accent;
    c.save();
    c.globalAlpha = a.allume ? 1 : 0.45;
    c.shadowColor = "rgba(0,0,0,.25)"; c.shadowBlur = 10; c.shadowOffsetY = 2;
    c.fillStyle = col.carte;
    c.beginPath(); c.roundRect(a.x - DEMI, a.y - DEMI, DEMI * 2, DEMI * 2, 12); c.fill();
    c.shadowColor = "transparent";
    c.lineWidth = choisi ? 2.2 : 1.2;
    c.strokeStyle = choisi ? col.accent : col["carte-bord"];
    c.stroke();
    // un liseré de la couleur du type, en haut de la carte
    c.fillStyle = teinte;
    c.beginPath(); c.roundRect(a.x - DEMI + 10, a.y - DEMI, DEMI * 2 - 20, 3, 1.5); c.fill();
    icone(c, a.type, a.x, a.y - 2, 30, teinte);
    // le nom, et l'adresse pour un hôte
    c.textAlign = "center"; c.textBaseline = "top";
    const ip = a.carte ? a.carte.ip : null;
    const sous = ip ? ip + "/" + a.carte.masque.prefixe() : a.carte ? (a.config.dhcp ? "DHCP…" : "sans IP") : (a.modele || "");
    // un fond sous les deux lignes : un câble qui descend passe DERRIÈRE
    // le nom au lieu de le barrer
    c.font = "600 12px " + col.sans;
    const w1 = c.measureText(a.nom).width;
    c.font = "10.5px " + col.mono;
    const w2 = c.measureText(sous).width;
    c.fillStyle = col.fond;
    c.globalAlpha = (a.allume ? 1 : 0.45) * 0.85;
    c.beginPath(); c.roundRect(a.x - Math.max(w1, w2) / 2 - 4, a.y + DEMI + 4, Math.max(w1, w2) + 8, 31, 5); c.fill();
    c.globalAlpha = a.allume ? 1 : 0.45;
    c.font = "600 12px " + col.sans;
    c.fillStyle = col.texte;
    c.fillText(a.nom, a.x, a.y + DEMI + 6);
    c.font = "10.5px " + col.mono;
    c.fillStyle = col["texte-faible"];
    c.fillText(sous, a.x, a.y + DEMI + 21);
    c.restore();
  }
}

export function dessinerSelectionCadre(c, tc, ui) {
  const m = ui.cadre;
  if (!m) return;
  const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1), w = Math.abs(m.x1 - m.x0), h = Math.abs(m.y1 - m.y0);
  c.save();
  c.fillStyle = tc.couleurs["accent-fond"];
  c.strokeStyle = tc.couleurs.accent;
  c.lineWidth = 1 / tc.cam.z;
  c.fillRect(x, y, w, h);
  c.strokeRect(x, y, w, h);
  c.restore();
}

/* Le câble en cours de pose suit le pointeur. */
export function dessinerCablePose(c, tc, ui) {
  const p = ui.pose;
  if (!p || !p.depart || !ui.pointeur) return;
  c.save();
  c.setLineDash([6, 5]);
  c.strokeStyle = tc.couleurs.accent;
  c.lineWidth = 2 / tc.cam.z;
  const a = bordCarte(p.depart.appareil, ui.pointeur);
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(ui.pointeur.x, ui.pointeur.y); c.stroke();
  c.restore();
}

/* Qui est sous le pointeur ? Un équipement, sinon un câble. */
export function viser(reseau, x, y, z) {
  for (let i = reseau.appareils.length - 1; i >= 0; i--) {
    const a = reseau.appareils[i];
    if (Math.abs(x - a.x) <= DEMI + 2 && Math.abs(y - a.y) <= DEMI + 30) return { appareil: a };
  }
  const tol = 6 / z;
  for (const cab of reseau.cables) {
    const A = cab.a.appareil, B = cab.b.appareil;
    const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / l2));
    if (Math.hypot(x - (A.x + t * dx), y - (A.y + t * dy)) <= tol) return { cable: cab };
  }
  return null;
}
