/* Le moteur de rendu du tableau blanc.

   Aucune dépendance au DOM : il prend un élément et rend des CHEMINS (des
   chaînes « d » de SVG), que la page peint sur un <canvas> et que l'export
   recopie tels quels dans un fichier SVG. Un seul calcul, deux sorties :
   ce qu'on exporte est exactement ce qu'on voit.

   Les éléments suivent le FORMAT de fichier d'Excalidraw — les noms de
   champs, rien de plus — pour qu'un tableau enregistré ici s'ouvre sur
   excalidraw.com, et l'inverse. Le code, lui, est écrit ici de bout en
   bout. Celui d'Excalidraw (et de rough.js, et de perfect-freehand) a été
   LU pour comprendre les idées — un trait tremblé, c'est une droite
   légèrement courbée et doublée ; un trait de plume, c'est un contour dont
   la largeur suit la pression — et aucune ligne n'en est recopiée. Le
   rendu n'est donc pas identique au leur au pixel près, et ce n'est pas
   le but : le même fichier s'y dessine avec leur trait, ici avec le nôtre. */
(function (racine) {
  "use strict";

  /* ═══════════════ 1. Le hasard qui ne change pas ════════════════════
     Chaque élément porte une GRAINE. C'est elle qui décide de la forme
     exacte du tremblement : redessiner l'élément redonne le même trait, au
     pixel près. Sans elle, le dessin « vibrerait » à chaque image.
     Générateur : un « mulberry32 », court et suffisant pour du dessin. */
  function aleas(graine) {
    let s = (graine | 0) || 0x9e3779b9;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function options(el, hasard) {
    const plein = el.strokeStyle === "solid" || !el.strokeStyle;
    return {
      hasard,
      roughness: rugosite(el),
      // Un trait en tirets se dessine UNE fois : doublé, les tirets se
      // chevauchent et le motif disparaît.
      simple: !plein,
      // Les sommets d'un trait d'architecte ou d'artiste restent à leur
      // place ; seuls ceux du dessinateur débordent, et c'est son style.
      sommetsFixes: (el.roughness || 0) < 2,
    };
  }

  /* Un petit élément tremble moins qu'un grand : un carré de dix pixels
     qui tremble de deux pixels ne ressemble plus à un carré. Le
     tremblement est donc proportionné au plus petit côté. */
  function rugosite(el) {
    const r = el.roughness || 0;
    if (!r) return 0;
    if (el.type === "line" || el.type === "arrow") return r;
    const petit = Math.min(Math.abs(el.width || 0), Math.abs(el.height || 0));
    return r * Math.max(0.25, Math.min(1, petit / 40));
  }

  /* Un écart au hasard, symétrique, d'amplitude « a » × rugosité. */
  const bruit = (o, a) => (o.hasard() * 2 - 1) * a * o.roughness;
  const n = (v) => Math.round(v * 100) / 100;

  /* ═══════════════ 2. Le trait tremblé ═══════════════════════════════
     Une droite devient une courbe de Bézier cubique. Ses deux points de
     contrôle sont posés au tiers et aux deux tiers, puis poussés de côté :
     d'un même côté (un léger « ventre », comme un trait tiré à main levée)
     et chacun d'un peu de hasard en plus. Le ventre grandit avec la
     longueur, mais de moins en moins : une longue droite n'est pas plus
     « molle » qu'une courte, elle est juste plus longue. */
  function ligne(x1, y1, x2, y2, o, seconde) {
    const dx = x2 - x1, dy = y2 - y1;
    const l = Math.hypot(dx, dy) || 1;
    const px = -dy / l, py = dx / l;                 // la perpendiculaire
    const ventre = bruit(o, Math.min(l * 0.012, 3.5)) * (seconde ? 0.6 : 1);
    const jeu = Math.min(l / 12, 2.2) * (seconde ? 0.6 : 1);
    const tremble = () => bruit(o, jeu);
    const bout = () => (o.sommetsFixes ? 0 : bruit(o, jeu * 1.2));
    const t1 = 0.28 + o.hasard() * 0.1, t2 = 0.62 + o.hasard() * 0.1;
    return "M" + n(x1 + bout()) + " " + n(y1 + bout())
      + "C" + n(x1 + dx * t1 + px * ventre + tremble()) + " " + n(y1 + dy * t1 + py * ventre + tremble())
      + " " + n(x1 + dx * t2 + px * ventre + tremble()) + " " + n(y1 + dy * t2 + py * ventre + tremble())
      + " " + n(x2 + bout()) + " " + n(y2 + bout());
  }

  /* Deux passages, deux tirages : c'est le doublé qui donne l'air
     « feutre ». Sans rugosité, une vraie droite, une seule fois. */
  function ligneDouble(x1, y1, x2, y2, o) {
    if (!o.roughness) return "M" + n(x1) + " " + n(y1) + "L" + n(x2) + " " + n(y2);
    return ligne(x1, y1, x2, y2, o, false) + (o.simple ? "" : ligne(x1, y1, x2, y2, o, true));
  }

  /* Une courbe qui passe PAR chacun des points : chaque tronçon est une
     cubique dont les tangentes sont celles de Catmull-Rom (la direction
     du point précédent vers le suivant, au sixième). La formule est celle
     des manuels ; ouverte, la courbe s'arrête au premier et au dernier
     point ; fermée, elle boucle. */
  function courbe(points, ferme) {
    const k = points.length;
    if (k < 2) return "";
    if (k === 2) return "M" + n(points[0][0]) + " " + n(points[0][1]) + "L" + n(points[1][0]) + " " + n(points[1][1]);
    const P = (i) => ferme ? points[(i + k) % k] : points[Math.max(0, Math.min(k - 1, i))];
    let d = "M" + n(points[0][0]) + " " + n(points[0][1]);
    const fin = ferme ? k : k - 1;
    for (let i = 0; i < fin; i++) {
      const a = P(i - 1), b = P(i), c = P(i + 1), e = P(i + 2);
      d += "C" + n(b[0] + (c[0] - a[0]) / 6) + " " + n(b[1] + (c[1] - a[1]) / 6)
        + " " + n(c[0] - (e[0] - b[0]) / 6) + " " + n(c[1] - (e[1] - b[1]) / 6)
        + " " + n(c[0]) + " " + n(c[1]);
    }
    return ferme ? d + "Z" : d;
  }

  /* ═══════════════ 3. Les formes ══════════════════════════════════════ */
  function polygone(points, o) {
    let d = "";
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      d += ligneDouble(a[0], a[1], b[0], b[1], o);
    }
    return d;
  }

  /* Un polygone aux angles arrondis : chaque coin est coupé à « r » le
     long de ses deux côtés, et la coupe est refermée par une courbe dont le
     sommet sert de point de contrôle. Les côtés tremblent comme une ligne ;
     les coins, d'un peu de hasard sur leur point de contrôle. */
  function polygoneArrondi(points, rayon, o, exact) {
    const k = points.length;
    const coupes = points.map((p, i) => {
      const av = points[(i - 1 + k) % k], ap = points[(i + 1) % k];
      const la = Math.hypot(av[0] - p[0], av[1] - p[1]), lb = Math.hypot(ap[0] - p[0], ap[1] - p[1]);
      const r = Math.min(rayon, la / 2, lb / 2);
      return {
        entree: [p[0] + (av[0] - p[0]) * r / (la || 1), p[1] + (av[1] - p[1]) * r / (la || 1)],
        sortie: [p[0] + (ap[0] - p[0]) * r / (lb || 1), p[1] + (ap[1] - p[1]) * r / (lb || 1)],
        sommet: p,
      };
    });
    if (exact || !o.roughness) {
      let d = "M" + n(coupes[0].sortie[0]) + " " + n(coupes[0].sortie[1]);
      for (let i = 1; i <= k; i++) {
        const c = coupes[i % k];
        d += "L" + n(c.entree[0]) + " " + n(c.entree[1])
          + "Q" + n(c.sommet[0]) + " " + n(c.sommet[1]) + " " + n(c.sortie[0]) + " " + n(c.sortie[1]);
      }
      return d + "Z";
    }
    let d = "";
    const passes = o.simple ? 1 : 2;
    for (let p = 0; p < passes; p++) {
      for (let i = 0; i < k; i++) {
        const c = coupes[i], s = coupes[(i + 1) % k];
        d += ligne(c.sortie[0], c.sortie[1], s.entree[0], s.entree[1], o, p === 1);
        d += "Q" + n(s.sommet[0] + bruit(o, 1.2)) + " " + n(s.sommet[1] + bruit(o, 1.2))
          + " " + n(s.sortie[0]) + " " + n(s.sortie[1]);
      }
    }
    return d;
  }

  /* Le rayon des angles arrondis : un cinquième du petit côté, plafonné à
     24 px — au-delà, un grand rectangle deviendrait une gélule. Un losange
     s'arrondit moins : ses coins sont aigus, et coupés à 20 % il ne
     ressemblait plus qu'à une tache. */
  function rayonAngle(el, cote) {
    if (!el.roundness) return 0;
    return el.type === "diamond" ? cote * 0.1 : Math.min(cote * 0.2, 24);
  }

  /* L'ellipse tremblée : des points posés tout autour, chacun à un rayon
     un peu faux, reliés par une courbe qui passe par eux ; le tour part
     d'un angle au hasard et DÉPASSE un peu son départ, comme une boucle
     tracée d'un seul geste qui ne se referme jamais tout à fait juste. */
  function ellipse(w, h, o) {
    const rx = w / 2, ry = h / 2, cx = rx, cy = ry;
    if (!o.roughness) {
      return "M" + n(cx + rx) + " " + n(cy) + "A" + n(rx) + " " + n(ry) + " 0 1 0 " + n(cx - rx) + " " + n(cy)
        + "A" + n(rx) + " " + n(ry) + " 0 1 0 " + n(cx + rx) + " " + n(cy);
    }
    const perimetre = Math.PI * (rx + ry);
    const k = Math.max(8, Math.min(28, Math.round(perimetre / 45)));
    const tour = (seconde) => {
      const depart = o.hasard() * Math.PI * 2;
      const depasse = 0.25 + o.hasard() * 0.25;               // en radians
      const pas = (Math.PI * 2 + depasse) / k;
      const pts = [];
      for (let i = 0; i <= k; i++) {
        const a = depart + i * pas;
        const f = 1 + bruit(o, seconde ? 0.018 : 0.03);
        pts.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]);
      }
      return courbe(pts, false);
    };
    return tour(false) + (o.simple ? "" : tour(true));
  }

  function contourEllipse(w, h, k) {
    const pts = [];
    for (let i = 0; i < k; i++) {
      const a = i / k * Math.PI * 2;
      pts.push([w / 2 + w / 2 * Math.cos(a), h / 2 + h / 2 * Math.sin(a)]);
    }
    return pts;
  }

  /* ═══════════════ 4. Les hachures ═══════════════════════════════════
     Des droites parallèles à −41°, espacées de quatre épaisseurs de trait,
     coupées sur le contour : on tourne le polygone pour rendre les droites
     horizontales, on balaie, on garde les morceaux intérieurs, on tourne
     à l'envers. Chaque morceau tremble comme un trait. */
  function hachures(poly, ecartement, angleDeg, o) {
    const a = angleDeg * Math.PI / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    const tourne = (p, s) => [p[0] * cos - p[1] * sin * s, p[0] * sin * s + p[1] * cos];
    const P = poly.map((p) => tourne(p, 1));
    let ymin = Infinity, ymax = -Infinity;
    P.forEach((p) => { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); });
    let d = "";
    const gap = Math.max(ecartement, 0.5);
    for (let y = ymin + gap / 2; y < ymax; y += gap) {
      const xs = [];
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = P[(i + 1) % P.length];
        if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) {
          xs.push(p[0] + (y - p[1]) / (q[1] - p[1]) * (q[0] - p[0]));
        }
      }
      xs.sort((u, v) => u - v);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const A = tourne([xs[i], y], -1), B = tourne([xs[i + 1], y], -1);
        d += ligneDouble(A[0], A[1], B[0], B[1], o);
      }
    }
    return d;
  }

  function remplissage(el, poly, contourExact, o) {
    const fond = el.backgroundColor;
    if (!fond || fond === "transparent") return [];
    const style = el.fillStyle || "hachure";
    if (style === "solid" || style === "zigzag-line") {
      return [{ d: contourExact, mode: "fond", couleur: fond }];
    }
    /* Des hachures à −40°, espacées de cinq fois l'épaisseur du trait
       (au moins 6 px), d'un trait deux fois plus fin que le contour ;
       croisées, la seconde famille est perpendiculaire. */
    const sw = el.strokeWidth || 1;
    const ecart = Math.max(6, sw * 5);
    let d = hachures(poly, ecart, -40, o);
    if (style === "cross-hatch") d += hachures(poly, ecart, 50, o);
    return [{ d, mode: "trait", couleur: fond, largeur: Math.max(0.6, sw / 2) }];
  }

  /* ═══════════════ 5. Le tracé libre ═════════════════════════════════
     Le trait d'une plume, pas d'un tuyau : un CONTOUR fermé dont la
     largeur suit la pression. Avec un stylet, c'est la vraie pression ;
     avec une souris, on la déduit de la VITESSE — vite, le trait s'affine ;
     lentement, il s'épaissit, comme l'encre qui a le temps de couler.
     L'idée vient de perfect-freehand ; la manière de la calculer est la
     nôtre. */
  function contourLibre(points, pressions, simuler, epaisseur) {
    if (!points.length) return [];
    const base = Math.max(0.6, epaisseur) * 1.9;            // demi-largeur moyenne
    // 1. lisser l'entrée : chaque point ne fait que 60 % du chemin vers le
    //    point brut — le tremblement de la main s'efface, pas la forme
    const L = [];
    let px = points[0][0], py = points[0][1];
    for (let i = 0; i < points.length; i++) {
      if (i) { px += (points[i][0] - px) * 0.6; py += (points[i][1] - py) * 0.6; }
      L.push([px, py, simuler ? null : (pressions && pressions[i] != null ? pressions[i] : 0.5)]);
    }
    const der = points[points.length - 1];
    if (points.length > 1) L.push([der[0], der[1], L[L.length - 1][2]]);
    // 2. la pression de chaque point, puis sa demi-largeur
    let p = 0.6;
    const R = L.map((q, i) => {
      if (q[2] != null) p = q[2];
      else if (i) {
        const v = Math.hypot(q[0] - L[i - 1][0], q[1] - L[i - 1][1]);
        const cible = Math.max(0.15, Math.min(1, 1 - v / (base * 7)));
        p += (cible - p) * 0.3;
      }
      return base * (0.4 + 0.9 * p);
    });
    // un point seul est un rond
    if (L.length === 1 || L.every((q) => Math.hypot(q[0] - L[0][0], q[1] - L[0][1]) < 0.5)) {
      return contourEllipse(R[0] * 2, R[0] * 2, 14).map((q) => [q[0] + L[0][0] - R[0], q[1] + L[0][1] - R[0]]);
    }
    // 3. les deux bords, de part et d'autre de la direction de marche
    const g = [], d = [];
    for (let i = 0; i < L.length; i++) {
      const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
      g.push([L[i][0] + nx * R[i], L[i][1] + ny * R[i]]);
      d.push([L[i][0] - nx * R[i], L[i][1] - ny * R[i]]);
    }
    // 4. deux bouts en demi-cercle, puis le tour complet
    const demiRond = (c, r, versX, versY) => {
      const a0 = Math.atan2(versY, versX) + Math.PI / 2;
      const pts = [];
      for (let k = 1; k < 7; k++) {
        const a = a0 - k * Math.PI / 7;
        pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
      }
      return pts;
    };
    const f = L[L.length - 1], fp = L[L.length - 2], d0 = L[0], d1 = L[1];
    return g.concat(demiRond(f, R[R.length - 1], f[0] - fp[0], f[1] - fp[1]),
                    d.reverse(), demiRond(d0, R[0], d0[0] - d1[0], d0[1] - d1[1]));
  }

  /* Le contour devient un chemin doux : une courbe du second degré qui
     passe par le milieu de chaque paire de points voisins. */
  function cheminLisse(pts) {
    if (pts.length < 3) return "";
    const m = (a, b) => n((a[0] + b[0]) / 2) + " " + n((a[1] + b[1]) / 2);
    let d = "M" + m(pts[pts.length - 1], pts[0]);
    for (let i = 0; i < pts.length; i++) {
      d += "Q" + n(pts[i][0]) + " " + n(pts[i][1]) + " " + m(pts[i], pts[(i + 1) % pts.length]);
    }
    return d + "Z";
  }

  /* ═══════════════ 6. Les pointes de flèche ═══════════════════════════
     Les noms des pointes sont ceux du format de fichier ; leur dessin est
     le nôtre. La taille suit l'épaisseur du trait, et la pointe ne prend
     jamais plus de 40 % du dernier segment : sinon une flèche courte n'est
     plus qu'une pointe. */
  function pointe(type, tip, avant, sw, o, couleur) {
    const dx = tip[0] - avant[0], dy = tip[1] - avant[1];
    const l = Math.hypot(dx, dy);
    if (!l) return [];
    const ux = dx / l, uy = dy / l;
    const base = (type === "arrow" ? 16 : 11) + sw * 2.5;
    const taille = Math.min(base, l * (/diamond/.test(type) ? 0.22 : 0.4));
    const angle = (type === "arrow" ? 26 : 22) * Math.PI / 180;
    const rot = (x, y, a) => [tip[0] + (x - tip[0]) * Math.cos(a) - (y - tip[1]) * Math.sin(a),
                              tip[1] + (x - tip[0]) * Math.sin(a) + (y - tip[1]) * Math.cos(a)];
    const arr = [tip[0] - ux * taille, tip[1] - uy * taille];
    const g = rot(arr[0], arr[1], angle), dr = rot(arr[0], arr[1], -angle);
    const ops = [];
    const trait = (d) => ops.push({ d, mode: "trait", couleur, largeur: sw });
    const plein = (d) => ops.push({ d, mode: "fond", couleur });
    if (type === "arrow") {
      trait(ligneDouble(g[0], g[1], tip[0], tip[1], o) + ligneDouble(dr[0], dr[1], tip[0], tip[1], o));
    } else if (type === "triangle" || type === "triangle_outline") {
      const d = "M" + n(tip[0]) + " " + n(tip[1]) + "L" + n(g[0]) + " " + n(g[1]) + "L" + n(dr[0]) + " " + n(dr[1]) + "Z";
      if (type === "triangle") plein(d);
      trait(d);
    } else if (type === "bar") {
      const px = -uy * taille / 1.5, py = ux * taille / 1.5;
      trait(ligneDouble(tip[0] + px, tip[1] + py, tip[0] - px, tip[1] - py, o));
    } else if (type === "circle" || type === "circle_outline" || type === "dot") {
      const r = taille / 2, c = [tip[0] - ux * r, tip[1] - uy * r];
      const d = "M" + n(c[0] + r) + " " + n(c[1]) + "A" + n(r) + " " + n(r) + " 0 1 0 " + n(c[0] - r) + " " + n(c[1])
        + "A" + n(r) + " " + n(r) + " 0 1 0 " + n(c[0] + r) + " " + n(c[1]) + "Z";
      if (type !== "circle_outline") plein(d);
      trait(d);
    } else if (type === "diamond" || type === "diamond_outline") {
      const fond = [tip[0] - ux * taille * 2, tip[1] - uy * taille * 2];
      const px = -uy * taille * 0.7, py = ux * taille * 0.7;
      const mid = [tip[0] - ux * taille, tip[1] - uy * taille];
      const d = "M" + n(tip[0]) + " " + n(tip[1]) + "L" + n(mid[0] + px) + " " + n(mid[1] + py)
        + "L" + n(fond[0]) + " " + n(fond[1]) + "L" + n(mid[0] - px) + " " + n(mid[1] - py) + "Z";
      if (type === "diamond") plein(d);
      trait(d);
    } else {
      // Pattes d'oie et autres : on ne dessine pas ce qu'on ne sait pas
      // dessiner juste ; la flèche reste lisible, la pointe manque.
    }
    return ops;
  }

  /* ═══════════════ 7. Un élément → ses chemins ═══════════════════════
     Coordonnées LOCALES : (0, 0) est le coin de l'élément (son x, y). La
     page se charge de le poser et de le tourner. */
  function chemins(el) {
    const hasard = aleas(el.seed || 1);
    const o = options(el, hasard);
    const sw = el.strokeWidth || 1;
    const largeur = el.strokeStyle && el.strokeStyle !== "solid" ? sw + 0.5 : sw;
    // tirets : un trait plein de 10, un blanc qui s'élargit avec l'épaisseur ;
    // pointillés : des points ronds (bouts arrondis sur un trait presque nul)
    const tirets = el.strokeStyle === "dashed" ? [10, 5 + sw * 1.5]
      : el.strokeStyle === "dotted" ? [0.1, 4 + sw * 1.8] : null;
    const w = el.width || 0, h = el.height || 0;
    const trait = (d) => ({ d, mode: "trait", couleur: el.strokeColor, largeur, tirets });
    const ops = [];
    if (el.type === "rectangle" || el.type === "diamond") {
      const pts = el.type === "rectangle" ? [[0, 0], [w, 0], [w, h], [0, h]]
        : [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
      const r = rayonAngle(el, Math.min(w, h));
      const exact = r ? polygoneArrondi(pts, r, o, true)
        : "M" + pts.map((p) => n(p[0]) + " " + n(p[1])).join("L") + "Z";
      // Le contour d'abord, le remplissage ensuite : chacun tire son
      // hasard dans le même ordre à chaque rendu, donc le même dessin.
      const contour = r ? polygoneArrondi(pts, r, o, false) : polygone(pts, o);
      ops.push(...remplissage(el, pts, exact, o));
      ops.push(trait(contour));
    } else if (el.type === "ellipse") {
      const contour = ellipse(w, h, o);
      const exact = "M" + n(w) + " " + n(h / 2) + "A" + n(w / 2) + " " + n(h / 2) + " 0 1 0 0 " + n(h / 2)
        + "A" + n(w / 2) + " " + n(h / 2) + " 0 1 0 " + n(w) + " " + n(h / 2) + "Z";
      ops.push(...remplissage(el, contourEllipse(w, h, 36), exact, o));
      ops.push(trait(contour));
    } else if (el.type === "line" || el.type === "arrow") {
      const P = el.points || [];
      if (P.length < 2) return ops;
      const ferme = el.type === "line" && P.length > 2
        && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1;
      if (ferme) {
        const exact = "M" + P.map((p) => n(p[0]) + " " + n(p[1])).join("L") + "Z";
        ops.push(...remplissage(el, P, exact, o));
      }
      let d = "";
      const courbee = el.roundness && P.length > 2;
      if (courbee) {
        d = courbe(P, false);
        if (!o.simple && o.roughness) {
          d += courbe(P.map((p) => [p[0] + bruit(o, 1.2), p[1] + bruit(o, 1.2)]), false);
        }
      } else {
        for (let i = 0; i + 1 < P.length; i++) {
          d += ligneDouble(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], o);
        }
      }
      ops.push(trait(d));
      if (el.type === "arrow" || el.endArrowhead || el.startArrowhead) {
        if (el.endArrowhead) {
          ops.push(...pointe(el.endArrowhead, P[P.length - 1], P[P.length - 2], largeur, o, el.strokeColor));
        }
        if (el.startArrowhead) {
          ops.push(...pointe(el.startArrowhead, P[0], P[1], largeur, o, el.strokeColor));
        }
      }
    } else if (el.type === "freedraw") {
      const P = el.points || [];
      const ferme = P.length > 2 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 8;
      if (ferme && el.backgroundColor && el.backgroundColor !== "transparent") {
        ops.push({ d: "M" + P.map((p) => n(p[0]) + " " + n(p[1])).join("L") + "Z", mode: "fond",
                   couleur: el.backgroundColor });
      }
      const contour = contourLibre(P, el.pressures, el.simulatePressure !== false, sw);
      ops.push({ d: cheminLisse(contour), mode: "fond", couleur: el.strokeColor });
    }
    return ops;
  }

  /* ═══════════════ 8. Géométrie commune ═══════════════════════════════ */
  /* La boîte d'un élément, sans rotation : celle qu'on sélectionne. Pour
     une ligne ou un tracé, ce sont ses points qui la font. */
  function boite(el) {
    if (el.points && el.points.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      el.points.forEach((p) => {
        x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
        x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
      });
      return { x: el.x + x0, y: el.y + y0, w: x1 - x0, h: y1 - y0 };
    }
    return { x: el.x, y: el.y, w: el.width || 0, h: el.height || 0 };
  }

  function distanceSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function dansPolygone(px, py, poly) {
    let dedans = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) dedans = !dedans;
    }
    return dedans;
  }

  /* Le point (en coordonnées de la scène) touche-t-il l'élément ? Comme
     Excalidraw : une forme SANS fond ne se prend que par son trait — sinon
     un grand cadre vide avalerait tous les clics posés dedans. */
  function touche(el, x, y, tol) {
    // ramener le point dans le repère de l'élément, rotation comprise
    const b = boite(el);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const a = -(el.angle || 0);
    const lx = cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a) - el.x;
    const ly = cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a) - el.y;
    const w = el.width || 0, h = el.height || 0;
    const rempli = el.backgroundColor && el.backgroundColor !== "transparent";
    if (el.type === "text") {
      return lx >= -tol && ly >= -tol && lx <= w + tol && ly <= h + tol;
    }
    if (el.type === "rectangle" || el.type === "image") {
      if (rempli || el.type === "image") return lx >= -tol && ly >= -tol && lx <= w + tol && ly <= h + tol;
      return lx >= -tol && ly >= -tol && lx <= w + tol && ly <= h + tol
        && !(lx > tol && ly > tol && lx < w - tol && ly < h - tol);
    }
    if (el.type === "diamond") {
      const poly = [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
      if (rempli && dansPolygone(lx, ly, poly)) return true;
      for (let i = 0; i < 4; i++) {
        const p = poly[i], q = poly[(i + 1) % 4];
        if (distanceSegment(lx, ly, p[0], p[1], q[0], q[1]) <= tol) return true;
      }
      return false;
    }
    if (el.type === "ellipse") {
      const rx = w / 2, ry = h / 2;
      if (!rx || !ry) return false;
      const dx = lx - rx, dy = ly - ry;
      const v = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
      if (rempli && v <= 1) return true;
      // distance approchée au contour : l'écart radial, remis à l'échelle
      const r = Math.hypot(dx, dy) / (v || 1);
      return Math.abs(v - 1) * r <= tol;
    }
    if (el.points) {
      const P = el.points;
      const t = el.type === "freedraw" ? tol + (el.strokeWidth || 1) * 2 : tol;
      if (P.length === 1) return Math.hypot(lx - P[0][0], ly - P[0][1]) <= t;
      for (let i = 0; i + 1 < P.length; i++) {
        if (distanceSegment(lx, ly, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]) <= t) return true;
      }
      if (rempli && P.length > 2 && dansPolygone(lx, ly, P)) return true;
      return false;
    }
    return lx >= 0 && ly >= 0 && lx <= w && ly <= h;
  }

  const API = { aleas, chemins, boite, touche, contourLibre, cheminLisse, distanceSegment,
                dansPolygone, rayonAngle };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else racine.TB_RENDU = API;
})(typeof window !== "undefined" ? window : this);
