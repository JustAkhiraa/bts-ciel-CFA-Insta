/* Voir les pages : la grille de vignettes (choisir, ranger, pivoter,
   couper) et le « placeur » (poser une signature, un texte, un cadre sur
   une page affichée en grand). Les pages sont dessinées par notre moteur
   (pdf/rendu.js), une à la fois, quand elles entrent à l'écran. */

import { rendrePage } from "./pdf/rendu.js";
import { esc } from "./aides.js";

/* ── les vignettes, une à la fois ── */
const idsDocs = new WeakMap();
let prochainId = 1;
const cleDe = (doc, i) => { if (!idsDocs.has(doc)) idsDocs.set(doc, prochainId++); return idsDocs.get(doc) + ":" + i; };
const vignettes = new Map();               // clé → Promise<canvas>
const attente = [];
let occupe = false;

async function suivante() {
  if (occupe) return;
  occupe = true;
  while (attente.length) {
    const t = attente.shift();
    if (!t.vivant()) { vignettes.delete(t.cle); t.ko(); continue; }
    try {
      const pages = await t.doc.pages();
      const taille = await t.doc.taillePage(pages[t.index]);
      const k = Math.min(t.cote / taille.largeur, t.cote / taille.hauteur) * Math.min(2, globalThis.devicePixelRatio || 1);
      t.ok(await rendrePage(t.doc, t.index, { echelle: k }));
    } catch (e) {
      t.ok(null);
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  occupe = false;
}
/* La vignette d'une page (un canevas), ou null si elle n'a pas pu être dessinée. */
export function vignette(doc, index, cote = 180, vivant = () => true) {
  const cle = cleDe(doc, index);
  if (vignettes.has(cle)) return vignettes.get(cle);
  const p = new Promise((ok, ko) => attente.push({ doc, index, cote, cle, ok, ko, vivant }));
  p.catch(() => {});
  vignettes.set(cle, p);
  suivante();
  return p;
}
function copieCanevas(src) {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  c.getContext("2d").drawImage(src, 0, 0);
  return c;
}

/* ── la grille ── */
/* « items » : [{ doc, index, rotation, supprimee, choisie, source }] ; les
   options disent quels boutons montrer et quoi faire d'un clic. */
export class Grille {
  constructor(conteneur, { items, boutons = () => "", surAction = () => {}, surClic = null, ordre = false, coupures = null, surCoupure = null, legende = null }) {
    this.el = conteneur;
    this.items = items;
    this.o = { boutons, surAction, surClic, ordre, coupures, surCoupure, legende };
    this.vivant = true;
    this.observateur = new IntersectionObserver((entrees) => {
      for (const e of entrees) if (e.isIntersecting) { this.observateur.unobserve(e.target); this.remplir(e.target); }
    }, { rootMargin: "300px" });
    this.dessiner();
  }
  detruire() { this.vivant = false; this.observateur.disconnect(); }
  dessiner() {
    const o = this.o;
    let h = "";
    this.items.forEach((it, k) => {
      h += '<div class="af-page' + (it.supprimee ? " supprimee" : "") + (it.choisie ? " choisie" : "") + '" data-k="' + k + '"' + (o.ordre ? ' draggable="true"' : "") +
        (o.surClic ? ' role="button" tabindex="0" aria-pressed="' + !!(it.choisie || it.supprimee) + '"' : "") + ">" +
        (it.source ? '<span class="af-src">' + esc(it.source) + "</span>" : "") +
        '<div class="af-vig"></div><span class="af-num">' + (o.legende ? esc(o.legende(it, k)) : it.index + 1) + "</span>" +
        '<div class="af-boutons">' + o.boutons(it, k) + "</div></div>";
      if (o.coupures && k < this.items.length - 1) {
        const c = o.coupures.has(k);
        h += '<button type="button" class="af-coupure' + (c ? " active" : "") + '" data-c="' + k + '" aria-pressed="' + c + '" title="' + (c ? "Ne plus couper ici" : "Couper ici") + '">✂</button>';
      }
    });
    this.el.innerHTML = h;
    for (const carte of this.el.querySelectorAll(".af-page")) this.observateur.observe(carte);
    this.el.onclick = (ev) => {
      const coup = ev.target.closest(".af-coupure");
      if (coup && o.surCoupure) { o.surCoupure(+coup.dataset.c); return; }
      const carte = ev.target.closest(".af-page");
      if (!carte) return;
      const it = this.items[+carte.dataset.k];
      const b = ev.target.closest("[data-a]");
      if (b) { ev.stopPropagation(); o.surAction(it, b.dataset.a, +carte.dataset.k); return; }
      if (o.surClic) o.surClic(it, +carte.dataset.k, ev);
    };
    this.el.onkeydown = (ev) => {
      if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList.contains("af-page") && o.surClic) {
        ev.preventDefault();
        o.surClic(this.items[+ev.target.dataset.k], +ev.target.dataset.k, ev);
      }
    };
    if (o.ordre) this.brancherGlisser();
  }
  async remplir(carte) {
    const it = this.items[+carte.dataset.k];
    if (!it) return;
    const zone = carte.querySelector(".af-vig");
    zone.classList.add("charge");
    const c = await vignette(it.doc, it.index, 180, () => this.vivant && carte.isConnected).catch(() => null);
    zone.classList.remove("charge");
    if (!carte.isConnected) return;
    if (!c) { zone.innerHTML = '<span class="af-sans">aperçu<br>impossible</span>'; return; }
    const copie = copieCanevas(c);
    copie.setAttribute("aria-hidden", "true");
    zone.replaceChildren(copie);
    this.tourner(carte, it.rotation || 0);
  }
  tourner(carte, angle) {
    const c = carte.querySelector(".af-vig canvas");
    if (c) c.style.transform = angle ? "rotate(" + angle + "deg)" : "";
  }
  /* Mettre à jour une carte sans tout redessiner (garder les vignettes). */
  maj(k) {
    const carte = this.el.querySelector('.af-page[data-k="' + k + '"]');
    const it = this.items[k];
    if (!carte || !it) return;
    carte.classList.toggle("supprimee", !!it.supprimee);
    carte.classList.toggle("choisie", !!it.choisie);
    if (this.o.surClic) carte.setAttribute("aria-pressed", String(!!(it.choisie || it.supprimee)));
    carte.querySelector(".af-boutons").innerHTML = this.o.boutons(it, k);
    if (this.o.legende) carte.querySelector(".af-num").textContent = this.o.legende(it, k);
    this.tourner(carte, it.rotation || 0);
  }
  brancherGlisser() {
    let de = null;
    for (const carte of this.el.querySelectorAll(".af-page")) {
      carte.addEventListener("dragstart", (ev) => { de = +carte.dataset.k; ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/x-af-page", String(de)); carte.classList.add("glisse"); });
      carte.addEventListener("dragend", () => { carte.classList.remove("glisse"); de = null; });
      carte.addEventListener("dragover", (ev) => { if (de !== null) { ev.preventDefault(); carte.classList.add("cible"); } });
      carte.addEventListener("dragleave", () => carte.classList.remove("cible"));
      carte.addEventListener("drop", (ev) => {
        carte.classList.remove("cible");
        if (de === null) return;
        ev.preventDefault(); ev.stopPropagation();
        const vers = +carte.dataset.k;
        if (vers !== de) this.o.surAction(this.items[de], "deplacer", de, vers);
      });
    }
  }
}

/* ── le placeur : une page en grand, des boîtes qu'on déplace ── */
/* Les boîtes sont en POINTS, origine en haut à gauche de la page vue
   (comme à l'écran) ; versPdf() les rend en coordonnées PDF (bas gauche). */
export class Placeur {
  constructor(conteneur, doc, { surChange = () => {} } = {}) {
    this.el = conteneur;
    this.doc = doc;
    this.surChange = surChange;
    this.boites = [];
    this.index = 0;
    this.el.innerHTML = '<div class="af-placeur-barre"><button type="button" class="af-mini" data-p="-1" aria-label="Page précédente">‹</button>' +
      '<span class="af-placeur-page"></span><button type="button" class="af-mini" data-p="1" aria-label="Page suivante">›</button></div>' +
      '<div class="af-placeur"><canvas aria-label="La page"></canvas><div class="af-calque"></div></div>';
    this.toile = this.el.querySelector("canvas");
    this.calque = this.el.querySelector(".af-calque");
    this.el.querySelector(".af-placeur-barre").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-p]");
      if (b) this.afficher(this.index + +b.dataset.p);
    });
    this.redim = new ResizeObserver(() => this.poserBoites());
    this.redim.observe(this.el);
  }
  detruire() { this.redim.disconnect(); }
  async afficher(index) {
    const pages = await this.doc.pages();
    if (index < 0 || index >= pages.length) return;
    this.index = index;
    this.el.querySelector(".af-placeur-page").textContent = "Page " + (index + 1) + " / " + pages.length;
    this.el.querySelectorAll("[data-p]").forEach((b) => { b.disabled = (+b.dataset.p < 0 && index === 0) || (+b.dataset.p > 0 && index === pages.length - 1); });
    const t = await this.doc.taillePage(pages[index]);
    this.largeur = t.largeur; this.hauteur = t.hauteur;
    const place = Math.min(760, this.el.clientWidth || 600);
    const k = (place / t.largeur) * Math.min(2, globalThis.devicePixelRatio || 1);
    this.toile.style.aspectRatio = t.largeur + " / " + t.hauteur;
    await rendrePage(this.doc, index, { echelle: k, canevas: this.toile }).catch(() => {
      const x = this.toile.getContext("2d");
      this.toile.width = Math.round(t.largeur * k); this.toile.height = Math.round(t.hauteur * k);
      x.fillStyle = "#fff"; x.fillRect(0, 0, this.toile.width, this.toile.height);
    });
    this.poserBoites();
    this.surChange();
  }
  get echelle() { return this.toile.clientWidth / (this.largeur || 1); }
  /* « b » : { id, page, x, y, l, h (points), ratio?, contenu (Element), classe } */
  ajouter(b) {
    this.boites.push(b);
    this.poserBoites();
    this.surChange();
    return b;
  }
  retirer(id) { this.boites = this.boites.filter((b) => b.id !== id); this.poserBoites(); this.surChange(); }
  poserBoites() {
    const k = this.echelle;
    this.calque.replaceChildren();
    for (const b of this.boites.filter((x) => x.page === this.index)) {
      const d = document.createElement("div");
      d.className = "af-boite " + (b.classe || "");
      d.style.left = b.x * k + "px"; d.style.top = b.y * k + "px";
      d.style.width = b.l * k + "px"; d.style.height = b.h * k + "px";
      if (b.contenu) d.appendChild(b.contenu(k));
      if (!b.fixe) d.insertAdjacentHTML("beforeend", '<button type="button" class="af-boite-x" aria-label="Retirer">×</button>');
      for (const coin of b.coins || ["se"]) d.insertAdjacentHTML("beforeend", '<i class="af-poignee-' + coin + '" data-coin="' + coin + '"></i>');
      this.brancher(d, b);
      this.calque.appendChild(d);
    }
  }
  brancher(d, b) {
    const x = d.querySelector(".af-boite-x");
    if (x) x.addEventListener("click", (ev) => { ev.stopPropagation(); this.retirer(b.id); });
    d.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".af-boite-x")) return;
      ev.preventDefault();
      d.setPointerCapture(ev.pointerId);
      const coin = ev.target.dataset.coin || null;
      const k = this.echelle;
      const depart = { px: ev.clientX, py: ev.clientY, x: b.x, y: b.y, l: b.l, h: b.h };
      const bouger = (e) => {
        const dx = (e.clientX - depart.px) / k, dy = (e.clientY - depart.py) / k;
        if (!coin) { b.x = depart.x + dx; b.y = depart.y + dy; }
        else {
          let { x: nx, y: ny, l: nl, h: nh } = depart;
          if (coin.includes("e")) nl = depart.l + dx;
          if (coin.includes("w")) { nl = depart.l - dx; nx = depart.x + dx; }
          if (coin.includes("s")) nh = depart.h + dy;
          if (coin.includes("n")) { nh = depart.h - dy; ny = depart.y + dy; }
          if (b.ratio) { nh = nl / b.ratio; if (coin.includes("n")) ny = depart.y + depart.h - nh; }
          if (nl >= 8 && nh >= 6) { b.x = nx; b.y = ny; b.l = nl; b.h = nh; }
        }
        // rester dans la page
        b.l = Math.min(b.l, this.largeur); b.h = Math.min(b.h, this.hauteur);
        b.x = Math.max(0, Math.min(this.largeur - b.l, b.x));
        b.y = Math.max(0, Math.min(this.hauteur - b.h, b.y));
        d.style.left = b.x * k + "px"; d.style.top = b.y * k + "px";
        d.style.width = b.l * k + "px"; d.style.height = b.h * k + "px";
        if (b.surTaille) b.surTaille(d, k);
      };
      const fin = () => { d.removeEventListener("pointermove", bouger); d.removeEventListener("pointerup", fin); d.removeEventListener("pointercancel", fin); this.surChange(); };
      d.addEventListener("pointermove", bouger);
      d.addEventListener("pointerup", fin);
      d.addEventListener("pointercancel", fin);
    });
  }
}

/* ── la signature au doigt ── */
/* Un canevas où l'on dessine ; signature() rend les pixels RGBA de ce qui
   est dessiné, rognés au plus juste, sur fond transparent. */
export class Ardoise {
  constructor(canevas, { couleur = "#0b2a6f", epaisseur = 2.6 } = {}) {
    this.c = canevas;
    this.couleur = couleur;
    this.epaisseur = epaisseur;
    this.traits = [];
    this.ajuster();
    let trait = null;
    canevas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      canevas.setPointerCapture(e.pointerId);
      trait = { couleur: this.couleur, points: [this.point(e)] };
      this.traits.push(trait);
      this.dessiner();
    });
    canevas.addEventListener("pointermove", (e) => {
      if (!trait) return;
      for (const ev of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) trait.points.push(this.point(ev));
      this.dessiner();
    });
    const fin = () => { trait = null; if (this.surChange) this.surChange(); };
    canevas.addEventListener("pointerup", fin);
    canevas.addEventListener("pointercancel", fin);
    new ResizeObserver(() => this.ajuster()).observe(canevas);
  }
  ajuster() {
    const r = this.c.getBoundingClientRect();
    const d = Math.min(3, globalThis.devicePixelRatio || 1);
    if (!r.width) return;
    this.c.width = Math.round(r.width * d); this.c.height = Math.round(r.height * d);
    this.dessiner();
  }
  point(e) {
    const r = this.c.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, p: e.pressure > 0 && e.pointerType === "pen" ? e.pressure : 0.5 };
  }
  vide() { return !this.traits.some((t) => t.points.length > 0); }
  effacer() { this.traits = []; this.dessiner(); if (this.surChange) this.surChange(); }
  annuler() { this.traits.pop(); this.dessiner(); if (this.surChange) this.surChange(); }
  dessiner(ctx = this.c.getContext("2d"), W = this.c.width, H = this.c.height) {
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const base = (this.epaisseur * W) / 520;
    for (const t of this.traits) {
      ctx.strokeStyle = t.couleur; ctx.fillStyle = t.couleur;
      const p = t.points;
      if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0].x * W, p[0].y * H, base * 0.6, 0, 7); ctx.fill(); continue; }
      // une courbe lissée : par les milieux des segments
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1], b = p[i];
        ctx.lineWidth = base * (0.6 + b.p * 0.8);
        ctx.beginPath();
        const m0 = i > 1 ? { x: (p[i - 2].x + a.x) / 2, y: (p[i - 2].y + a.y) / 2 } : a;
        const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        ctx.moveTo(m0.x * W, m0.y * H);
        ctx.quadraticCurveTo(a.x * W, a.y * H, m1.x * W, m1.y * H);
        if (i === p.length - 1) ctx.lineTo(b.x * W, b.y * H);
        ctx.stroke();
      }
    }
  }
  /* La signature en haute définition, rognée : { largeur, hauteur, pixels } */
  signature(echelle = 3) {
    const W = Math.round((this.c.width / (globalThis.devicePixelRatio || 1)) * echelle), H = Math.round((this.c.height / (globalThis.devicePixelRatio || 1)) * echelle);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true });
    this.dessiner(x, W, H);
    return rogner(x.getImageData(0, 0, W, H));
  }
}

/* Rogner une image RGBA à ce qui n'est pas transparent (avec une petite marge). */
export function rogner(img, seuil = 8) {
  const { width: W, height: H, data } = img;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > seuil) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const m = 6;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
  const l = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = new Uint8ClampedArray(l * h * 4);
  for (let y = 0; y < h; y++) out.set(data.subarray(((y + y0) * W + x0) * 4, ((y + y0) * W + x1 + 1) * 4), y * l * 4);
  return { largeur: l, hauteur: h, pixels: out };
}
