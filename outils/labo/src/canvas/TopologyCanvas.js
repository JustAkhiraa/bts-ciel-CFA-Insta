/* Le canevas de la topologie : une caméra sur un plan infini.

   (cam.x, cam.y) est le point du monde qui se trouve dans le coin haut
   gauche de l'écran ; cam.z est le zoom. Tout ce qui touche à l'écran
   passe par versMonde() et versEcran(), et nulle part ailleurs. */

export const ZMIN = 0.2, ZMAX = 3;

export class TopologyCanvas {
  constructor(toile) {
    this.toile = toile;
    this.ctx = toile.getContext("2d");
    this.cam = { x: -200, y: -150, z: 1 };
    this.peintres = [];
    this.demande = 0;
    this.couleurs = {};
    this.lireCouleurs();
    new ResizeObserver(() => this.demander()).observe(toile);
  }

  /* Les couleurs viennent de la feuille de style : un changement de thème
     change aussi le dessin. */
  lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const n of ["fond", "panneau", "panneau-2", "bord", "bord-fort", "texte", "texte-doux", "texte-faible", "accent",
                     "accent-fond", "vert", "orange", "rouge", "grille", "carte", "carte-bord", "mono", "sans"]) {
      this.couleurs[n] = cs.getPropertyValue("--" + n).trim();
    }
  }

  get largeur() { return this.toile.clientWidth; }
  get hauteur() { return this.toile.clientHeight; }
  versMonde(sx, sy) { return { x: sx / this.cam.z + this.cam.x, y: sy / this.cam.z + this.cam.y }; }
  versEcran(x, y) { return { x: (x - this.cam.x) * this.cam.z, y: (y - this.cam.y) * this.cam.z }; }

  zoomer(facteur, sx = this.largeur / 2, sy = this.hauteur / 2) {
    const avant = this.versMonde(sx, sy);
    this.cam.z = Math.max(ZMIN, Math.min(ZMAX, this.cam.z * facteur));
    this.cam.x = avant.x - sx / this.cam.z;
    this.cam.y = avant.y - sy / this.cam.z;
    this.demander();
  }

  /* Tout voir : la boîte de la topologie, centrée, sans grossir au-delà
     de 100 % — trois équipements ne doivent pas remplir l'écran. */
  ajuster(boite) {
    if (!boite) { this.cam = { x: -this.largeur / 2, y: -this.hauteur / 2, z: 1 }; this.demander(); return; }
    // la marge suit l'écran : 90 px sur un ordinateur, beaucoup moins sur un téléphone
    const m = Math.min(90, Math.min(this.largeur, this.hauteur) * 0.08);
    const z = Math.max(ZMIN, Math.min(1, (this.largeur - 2 * m) / (boite.w || 1), (this.hauteur - 2 * m) / (boite.h || 1)));
    this.cam.z = z;
    this.cam.x = boite.x + boite.w / 2 - this.largeur / 2 / z;
    this.cam.y = boite.y + boite.h / 2 - this.hauteur / 2 / z;
    this.demander();
  }

  demander() {
    if (!this.demande) this.demande = requestAnimationFrame(() => { this.demande = 0; this.peindre(); });
  }

  peindre() {
    const dpr = window.devicePixelRatio || 1;
    const W = this.largeur, H = this.hauteur;
    if (this.toile.width !== Math.round(W * dpr) || this.toile.height !== Math.round(H * dpr)) {
      this.toile.width = Math.round(W * dpr);
      this.toile.height = Math.round(H * dpr);
    }
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = this.couleurs.fond;
    c.fillRect(0, 0, W, H);
    for (const p of this.peintres) p(c, this, dpr);
  }

  /* Passer en coordonnées du monde pour dessiner la topologie. */
  monde(c, dpr) {
    const z = this.cam.z;
    c.setTransform(dpr * z, 0, 0, dpr * z, -this.cam.x * z * dpr, -this.cam.y * z * dpr);
  }
}
