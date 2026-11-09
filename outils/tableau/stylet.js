/* Le stylet — la géométrie de ce que la main dessine.

   Demandé : « je veux les mêmes fonctionnalités, vraiment tout pareil » que
   le stylet d'un tableau blanc de référence. Ce fichier en porte la partie
   qui CALCULE, sans rien savoir de la page : reconnaître une forme, lire un
   symbole écrit à la main, couper un trait sous la gomme, dire ce qu'un
   lasso entoure, aimanter un trait contre la règle. « tableau.js » s'en
   sert ; « tests/stylet.test.js » l'éprouve hors navigateur.

   Les points sont des [x, y] en coordonnées de scène. Aucune dépendance. */
(function (racine) {
  "use strict";

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function longueur(P) { let L = 0; for (let i = 1; i < P.length; i++) L += dist(P[i - 1], P[i]); return L; }
  function boite(P) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of P) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function distanceSegment(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  /* Ramer-Douglas-Peucker : ne garder que les points qui font la forme. */
  function simplifier(P, eps) {
    if (P.length < 3) return P.slice();
    let dmax = 0, k = 0;
    for (let i = 1; i < P.length - 1; i++) {
      const d = distanceSegment(P[i], P[0], P[P.length - 1]);
      if (d > dmax) { dmax = d; k = i; }
    }
    if (dmax <= eps) return [P[0], P[P.length - 1]];
    const g = simplifier(P.slice(0, k + 1), eps), d = simplifier(P.slice(k), eps);
    return g.slice(0, -1).concat(d);
  }
  /* Le même sur un contour FERMÉ : on le coupe au point le plus éloigné du
     départ, sans quoi un coin tombé sur le point de départ se perdrait. */
  function sommetsFermes(P, eps) {
    let k = 0, dm = 0;
    for (let i = 1; i < P.length; i++) { const d = dist(P[0], P[i]); if (d > dm) { dm = d; k = i; } }
    const a = simplifier(P.slice(0, k + 1), eps), b = simplifier(P.slice(k).concat([P[0]]), eps);
    const S = a.slice(0, -1).concat(b.slice(0, -1));
    // deux sommets trop proches (le départ et l'arrivée de la main) n'en font qu'un
    const out = [];
    for (const s of S) if (!out.some((t) => dist(s, t) < eps * 1.5)) out.push(s);
    return out;
  }
  function angleEntre(u, v) {
    const a = Math.atan2(u[1], u[0]) - Math.atan2(v[1], v[0]);
    return Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  }

  /* Les sommets qui n'en sont pas. Une main laisse deux faux coins : un
     coin PLAT — le départ posé au milieu d'un côté, un côté qui fléchit —
     et une POINTE — le trait commencé avant le coin, qui revient sur
     lui-même. Signalé : trois triangles sur quatre sortaient en
     quadrilatère, l'un avec sa queue. On les retire, un par un, tant qu'il
     en reste et qu'il reste plus de trois sommets. */
  function nettoyer(S) {
    S = S.slice();
    for (let encore = true; encore && S.length > 3;) {
      encore = false;
      for (let i = 0; i < S.length; i++) {
        const p = S[(i + S.length - 1) % S.length], s = S[i], q = S[(i + 1) % S.length];
        const a = angleEntre([p[0] - s[0], p[1] - s[1]], [q[0] - s[0], q[1] - s[1]]);
        if (a > 2.6 || a < 0.35) { S.splice(i, 1); encore = true; break; }
      }
    }
    return S;
  }
  function aire(S) {
    let a = 0;
    for (let i = 0; i < S.length; i++) { const p = S[i], q = S[(i + 1) % S.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(a) / 2;
  }
  function plusGrandTriangle(S) {
    let mieux = null, am = -1;
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) for (let k = j + 1; k < S.length; k++) {
      const t = [S[i], S[j], S[k]], a = aire(t);
      if (a > am) { am = a; mieux = t; }
    }
    return mieux;
  }

  /* ═══════════════ 1. Les formes : un trait à main levée → une forme nette ═══
     Rend { type, ... } ou null quand rien n'est sûr : mieux vaut laisser le
     trait tel quel que d'inventer un rectangle. */
  function reconnaitreForme(P) {
    if (!P || P.length < 4) return null;
    const L = longueur(P), b = boite(P), diag = Math.hypot(b.w, b.h);
    if (L < 12 || diag < 10) return null;
    const ferme = dist(P[0], P[P.length - 1]) < Math.max(0.18 * L, 0.25 * diag);
    if (!ferme) {
      // une ligne : presque aussi longue que la distance entre ses bouts
      const d = dist(P[0], P[P.length - 1]);
      if (d / L > 0.94) return { type: "line", points: [P[0].slice(), P[P.length - 1].slice()] };
      return null;
    }
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2, ry = b.h / 2;
    if (rx < 4 || ry < 4) return null;
    // écart moyen à l'ellipse inscrite dans la boîte
    let e = 0;
    for (const [x, y] of P) e += Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1);
    e /= P.length;
    const brut = sommetsFermes(P, 0.07 * diag);
    if (e < 0.09 && brut.length !== 3 && brut.length !== 4) return { type: "ellipse", x: b.x, y: b.y, width: b.w, height: b.h };
    const S = nettoyer(brut);
    const n = S.length;
    if (n === 4) {
      // côtés parallèles aux axes → rectangle ; sommets au milieu des côtés → losange
      const axes = S.every((s, i) => {
        const t = S[(i + 1) % 4];
        const a = Math.abs(Math.atan2(t[1] - s[1], t[0] - s[0])) % (Math.PI / 2);
        return Math.min(a, Math.PI / 2 - a) < 0.3;
      });
      if (axes) return { type: "rectangle", x: b.x, y: b.y, width: b.w, height: b.h };
      const milieux = S.every((s) => {
        const surX = Math.abs(s[0] - cx) < 0.2 * b.w, surY = Math.abs(s[1] - cy) < 0.2 * b.h;
        return (surX && (Math.abs(s[1] - b.y) < 0.2 * b.h || Math.abs(s[1] - b.y - b.h) < 0.2 * b.h))
            || (surY && (Math.abs(s[0] - b.x) < 0.2 * b.w || Math.abs(s[0] - b.x - b.w) < 0.2 * b.w));
      });
      if (milieux) return { type: "diamond", x: b.x, y: b.y, width: b.w, height: b.h };
    }
    // un côté qui fléchit à peine laisse un coin réel mais minuscule : si le
    // plus grand triangle couvre 85 % de la figure, c'est un triangle
    if (n >= 4 && n <= 6) {
      const t = plusGrandTriangle(S);
      if (aire(t) >= 0.85 * aire(S)) return { type: "triangle", points: t.map((s) => s.slice()) };
    }
    if (n === 3) return { type: "triangle", points: S.map((s) => s.slice()) };
    if (n === 4) return { type: "polygone", points: S.map((s) => s.slice()) };
    if (e < 0.16) return { type: "ellipse", x: b.x, y: b.y, width: b.w, height: b.h };
    return null;
  }

  /* ═══════════════ 2. La règle : un trait aimanté contre son bord ════════════
     La règle a un centre, un angle et une longueur. Un point près de son bord
     (d'un côté ou de l'autre) est projeté sur ce bord. */
  function bordsRegle(r) {
    const ux = Math.cos(r.angle), uy = Math.sin(r.angle), nx = -uy, ny = ux;
    const h = r.largeur / 2;
    return [1, -1].map((s) => ({ ox: r.x + nx * h * s, oy: r.y + ny * h * s, ux, uy, nx: nx * s, ny: ny * s }));
  }
  /* Le bord le plus proche d'un point, s'il est à moins de « prise ». */
  function bordProche(r, p, prise) {
    let mieux = null;
    for (const b of bordsRegle(r)) {
      const t = (p[0] - b.ox) * b.ux + (p[1] - b.oy) * b.uy;
      if (Math.abs(t) > r.longueur / 2 + prise) continue;
      const d = (p[0] - b.ox) * b.nx + (p[1] - b.oy) * b.ny;     // > 0 : hors de la règle
      if (d > -prise * 0.5 && d < prise && (!mieux || Math.abs(d) < Math.abs(mieux.d))) mieux = Object.assign({ d, t }, b);
    }
    return mieux;
  }
  function projeter(b, p, ecart) {
    const t = (p[0] - b.ox) * b.ux + (p[1] - b.oy) * b.uy;
    return [b.ox + b.ux * t + b.nx * ecart, b.oy + b.uy * t + b.ny * ecart];
  }
  /* Dans la règle (pour la saisir et la déplacer). */
  function dansRegle(r, p) {
    const ux = Math.cos(r.angle), uy = Math.sin(r.angle);
    const t = (p[0] - r.x) * ux + (p[1] - r.y) * uy, n = -(p[0] - r.x) * uy + (p[1] - r.y) * ux;
    return Math.abs(t) <= r.longueur / 2 && Math.abs(n) <= r.largeur / 2;
  }

  /* ═══════════════ 3. Le lasso ══════════════════════════════════════════════ */
  function dansPolygone(p, poly) {
    let dedans = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
  }
  /* ── ce que le lasso regarde d'un élément ──────────────────────────────
     Signalé le 9 nov. 2026 : le lasso ne prenait pas ce qu'on avait entouré.
     Reproduit : une boucle qui ne contient qu'un trait en prenait trois.
       · Les points d'un trait étaient pris par leur RANG. Un trait tracé
         lentement au début y a soixante points, puis six pour le reste :
         33 % de sa longueur dans la boucle comptaient pour 91 %.
       · La rotation était ignorée : un trait tourné d'un quart de tour était
         jugé à l'endroit où il était avant de tourner.
     Désormais un trait se juge à sa LONGUEUR (des jalons à intervalles
     égaux, chacun au milieu de sa tranche : la part des jalons dedans est la
     part de la longueur dedans), une forme pleine à sa SURFACE, et tout
     point est remis à sa place réelle, rotation comprise. */
  function jalons(P, n) {
    if (!P.length) return [];
    if (P.length === 1) return [[P[0][0], P[0][1]]];
    const cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = cum[cum.length - 1];
    if (!(L > 0)) return [[P[0][0], P[0][1]]];
    const out = [];
    let j = 1;
    for (let k = 0; k < n; k++) {
      const d = L * (k + 0.5) / n;
      while (j < P.length - 1 && cum[j] < d) j++;
      const t = (d - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
      out.push([P[j - 1][0] + (P[j][0] - P[j - 1][0]) * t, P[j - 1][1] + (P[j][1] - P[j - 1][1]) * t]);
    }
    return out;
  }
  /* Le centre des n × n cases d'une boîte, gardés si « garder » le veut :
     la surface d'une ellipse, d'un losange, d'une forme remplie. */
  function grille(b, n, garder) {
    const out = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const q = [b.x + b.w * (i + 0.5) / n, b.y + b.h * (j + 0.5) / n];
      if (!garder || garder(q)) out.push(q);
    }
    return out;
  }
  // des points du repère d'un élément, posés là où on les voit : tournés de
  // « angle » autour du centre de sa boîte (c'est ainsi qu'il est peint)
  function tourner(pts, b, angle) {
    if (!angle) return pts;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, co = Math.cos(angle), si = Math.sin(angle);
    return pts.map(([x, y]) => [cx + (x - cx) * co - (y - cy) * si, cy + (x - cx) * si + (y - cy) * co]);
  }

  /* ── découper une SURFACE par la boucle du lasso ───────────────────────
     Signalé le 9 nov. 2026 : le lasso ne coupait pas les formes remplies
     au seau (il les prenait entières ou pas du tout). Un trait se coupe en
     morceaux de ligne ; une surface, elle, se coupe en surfaces : ce qui
     est dans la boucle (S ∩ C) et ce qui reste (S − C).

     L'algorithme est celui de Greiner et Hormann : on pose les points où
     les deux contours se croisent, on marque à chacun si le contour de la
     forme y entre dans la boucle ou en sort, puis on suit les contours en
     changeant de l'un à l'autre à chaque croisement. Un sommet posé
     exactement sur l'autre contour le met en défaut : la boucle est donc
     décalée d'un dix-millionième, ce que l'œil ne voit pas.

     Et le résultat est VÉRIFIÉ avant d'être rendu : sur une grille de
     points, chacun doit être dans l'intérieur s'il est dans la forme ET la
     boucle, dans le reste s'il est dans la forme et hors de la boucle. Une
     forme qui se croise elle-même (un « 8 » au seau) n'a pas de dedans
     bien défini pour cet algorithme : la vérification le voit, et la
     fonction rend null. L'appelant revient alors à l'ancienne règle. */
  function aireSignee(P) {
    let a = 0;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1];
    return a / 2;
  }
  function nettoyerContour(P) {
    const out = [];
    for (const p of P) {
      const q = out[out.length - 1];
      if (!q || Math.abs(q[0] - p[0]) > 1e-9 || Math.abs(q[1] - p[1]) > 1e-9) out.push([p[0], p[1]]);
    }
    while (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-9
           && Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-9) out.pop();
    return out;
  }
  // un trou : l'anneau intérieur, dans l'autre sens, relié au contour par
  // un pont aller-retour (rempli en « nonzero » comme en « evenodd », le
  // trou reste vide)
  function avecTrou(S, C) {
    const T = (aireSignee(S) > 0) === (aireSignee(C) > 0) ? C.slice().reverse() : C.slice();
    let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < S.length; i++) for (let j = 0; j < T.length; j++) {
      const d = (S[i][0] - T[j][0]) ** 2 + (S[i][1] - T[j][1]) ** 2;
      if (d < bd) { bd = d; bi = i; bj = j; }
    }
    const out = [];
    for (let k = 0; k <= S.length; k++) out.push(S[(bi + k) % S.length]);
    for (let k = 0; k <= T.length; k++) out.push(T[(bj + k) % T.length]);
    return out;
  }
  function couperSurface(S0, C0) {
    const S = nettoyerContour(S0), C = nettoyerContour(C0);
    if (S.length < 3 || C.length < 3) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    S.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const echelle = Math.max(x1 - x0, y1 - y0, 1);
    // le décalage d'un dix-millionième, le même à chaque fois (pas de hasard)
    C.forEach((p, i) => {
      const h = Math.sin((i + 1) * 12.9898) * 43758.5453, k = h - Math.floor(h);
      p[0] += (k - 0.5) * 2e-7 * echelle; p[1] += (0.5 - k) * 1.3e-7 * echelle;
    });
    const noeud = (x, y) => ({ x, y, suiv: null, prec: null, inter: false, voisin: null, entree: false, alpha: 0, vu: false });
    const liste = (P) => {
      const n = P.map((p) => noeud(p[0], p[1]));
      n.forEach((v, i) => { v.suiv = n[(i + 1) % n.length]; v.prec = n[(i - 1 + n.length) % n.length]; });
      return n;
    };
    const ls = liste(S), lc = liste(C);
    const insS = S.map(() => []), insC = C.map(() => []);
    let nb = 0;
    for (let i = 0; i < S.length; i++) {
      const a = S[i], b = S[(i + 1) % S.length];
      for (let j = 0; j < C.length; j++) {
        const c = C[j], d = C[(j + 1) % C.length];
        const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
        if (den === 0) continue;
        const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
        const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
        if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
        const x = a[0] + t * (b[0] - a[0]), y = a[1] + t * (b[1] - a[1]);
        const vs = noeud(x, y), vc = noeud(x, y);
        vs.inter = vc.inter = true; vs.voisin = vc; vc.voisin = vs; vs.alpha = t; vc.alpha = u;
        insS[i].push(vs); insC[j].push(vc); nb++;
      }
    }
    if (!nb) {
      if (dansPolygone(S[0], C)) return { dedans: [S], dehors: [] };
      if (dansPolygone(C[0], S)) return { dedans: [C], dehors: [avecTrou(S, C)] };
      return { dedans: [], dehors: [S] };
    }
    if (nb % 2) return null;
    const inserer = (lst, ins) => {
      for (let i = 0; i < lst.length; i++) {
        const suivant = lst[(i + 1) % lst.length];
        let avant = lst[i];
        for (const v of ins[i].sort((p, q) => p.alpha - q.alpha)) {
          v.prec = avant; v.suiv = suivant; avant.suiv = v; suivant.prec = v; avant = v;
        }
      }
    };
    inserer(ls, insS); inserer(lc, insC);
    const marquer = (debut, autre, inverser) => {
      let dedans = dansPolygone([debut.x, debut.y], autre), v = debut;
      do { if (v.inter) { v.entree = inverser ? dedans : !dedans; dedans = !dedans; } v = v.suiv; } while (v !== debut);
    };
    const parcourir = (difference) => {
      const tous = [];
      let v = ls[0];
      do { if (v.inter) tous.push(v); v.vu = false; if (v.voisin) v.voisin.vu = false; v = v.suiv; } while (v !== ls[0]);
      // S − C : la forme suivie hors de la boucle, donc ses marques inversées
      marquer(ls[0], C, difference);
      marquer(lc[0], S, false);
      const out = [];
      for (const depart of tous) {
        if (depart.vu) continue;
        const poly = [[depart.x, depart.y]];
        let cur = depart, garde = 0;
        do {
          cur.vu = true; cur.voisin.vu = true;
          if (cur.entree) { do { cur = cur.suiv; poly.push([cur.x, cur.y]); } while (!cur.inter); }
          else { do { cur = cur.prec; poly.push([cur.x, cur.y]); } while (!cur.inter); }
          cur = cur.voisin;
          if (++garde > 4 * (S.length + C.length + nb)) return null;
        } while (!cur.vu);
        const net = nettoyerContour(poly);
        if (net.length >= 3 && Math.abs(aireSignee(net)) > 1e-9 * echelle * echelle) out.push(net);
      }
      return out;
    };
    const dedans = parcourir(false), dehors = parcourir(true);
    if (!dedans || !dehors) return null;
    // la vérification : 48 × 48 points sur la boîte de la forme
    let faux = 0, total = 0;
    const dansUn = (q, L) => L.some((P) => dansPolygone(q, P));
    for (let i = 0; i < 48; i++) for (let j = 0; j < 48; j++) {
      const q = [x0 + (x1 - x0) * (i + 0.5) / 48, y0 + (y1 - y0) * (j + 0.5) / 48];
      const dansS = dansPolygone(q, S);
      if (!dansS && !dansUn(q, dedans) && !dansUn(q, dehors)) continue;
      total++;
      const dansC = dansPolygone(q, C);
      if (dansUn(q, dedans) !== (dansS && dansC) || dansUn(q, dehors) !== (dansS && !dansC)) faux++;
    }
    if (!total || faux > total * 0.01) return null;
    return { dedans, dehors };
  }

  /* Un élément est pris si la plus grande part de ses points l'est — un
     trait qui dépasse un peu du lasso est quand même celui qu'on entourait. */
  function pris(points, poly, part) {
    if (!points.length || poly.length < 3) return false;
    let n = 0;
    for (const p of points) if (dansPolygone(p, poly)) n++;
    return n / points.length >= (part == null ? 0.6 : part);
  }

  /* ═══════════════ 4. La gomme partielle ═════════════════════════════════════
     Rend les MORCEAUX d'un trait qui restent hors du cercle (c, r). Un trait
     rapide a des points espacés : un segment qui traverse le cercle sans
     qu'aucun de ses deux bouts n'y soit est coupé aussi. */
  function decouper(P, pressions, c, r) {
    const morceaux = [];
    let cour = null, curP = null;
    const fermer = () => { if (cour && cour.length) morceaux.push({ points: cour, pressions: curP }); cour = null; curP = null; };
    for (let i = 0; i < P.length; i++) {
      const dedans = dist(P[i], c) <= r;
      const traverse = i > 0 && !dedans && dist(P[i - 1], c) > r && distanceSegment(c, P[i - 1], P[i]) <= r;
      if (dedans) { fermer(); continue; }
      if (traverse) fermer();
      if (!cour) { cour = []; curP = []; }
      cour.push(P[i]); curP.push(pressions ? pressions[i] : 0.5);
    }
    fermer();
    return morceaux;
  }

  /* La gomme qui suit le DESSIN, et qui coupe où il faut.
     Le trait arrive tel qu'il est peint : sa ligne L, la pression P et la
     demi-largeur R de chaque point (TB_RENDU.trace). L'encre d'un point
     est un disque de rayon R ; elle touche le cercle de la gomme (centre
     c, rayon r) quand le point est à moins de r + R du centre. On retire
     cette partie de la ligne, et la coupure tombe EXACTEMENT à r + R,
     interpolée sur le segment : le bout neuf, un rond de rayon R, effleure
     le cercle sans y entrer ni rien prendre au-delà.
     L'ancienne coupe (« decouper », gardée pour les anciens appels)
     retirait des points entiers : sur un trait tracé vite, aux points
     espacés, elle emportait le segment jusqu'au point suivant.
     Rend les morceaux restants, ou null si la gomme ne touche pas. */
  function gommer(L, P, R, c, r) {
    const n = L.length;
    if (!n) return null;
    const suiv = (i) => Math.min(n - 1, i + 1);
    const au = (i, t) => {
      const a = L[i], b = L[suiv(i)], j = suiv(i);
      return { x: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
               p: P[i] + (P[j] - P[i]) * t, r: R[i] + (R[j] - R[i]) * t };
    };
    // positif dehors, négatif quand l'encre touche le cercle ; CONVEXE en t
    // (une distance à un point, moins une fonction affine) : une seule
    // racine entre deux signes contraires, au plus deux sur un segment
    const g = (i, t) => { const q = au(i, t); return dist(q.x, c) - (r + q.r); };
    const racine = (i, t0, t1) => {
      const dehors0 = g(i, t0) >= 0;
      for (let k = 0; k < 32; k++) {
        const tm = (t0 + t1) / 2;
        if ((g(i, tm) >= 0) === dehors0) t0 = tm; else t1 = tm;
      }
      return dehors0 ? t0 : t1;          // toujours le côté DEHORS
    };
    const morceaux = [];
    let cour = null, touche = false;
    const ouvrir = () => { cour = { points: [], pressions: [] }; };
    const pousser = (q) => { cour.points.push(q.x); cour.pressions.push(q.p); };
    const fermer = () => { if (cour && cour.points.length) morceaux.push(cour); cour = null; };
    // invariant : si le point i est dehors, un morceau est ouvert et il
    // finit par ce point
    if (g(0, 0) >= 0) { ouvrir(); pousser(au(0, 0)); } else touche = true;
    for (let i = 0; i < n - 1; i++) {
      const da = g(i, 0) >= 0, db = g(i, 1) >= 0;
      if (da && db) {
        // les deux bouts dehors : le segment peut tout de même passer dedans
        if (distanceSegment(c, L[i], L[i + 1]) < r + Math.max(R[i], R[i + 1])) {
          let t0 = 0, t1 = 1;
          for (let k = 0; k < 40; k++) {     // le creux d'une fonction convexe
            const a = t0 + (t1 - t0) / 3, b = t1 - (t1 - t0) / 3;
            if (g(i, a) < g(i, b)) t1 = b; else t0 = a;
          }
          const tm = (t0 + t1) / 2;
          if (g(i, tm) < 0) {
            touche = true;
            pousser(au(i, racine(i, 0, tm))); fermer();
            ouvrir(); pousser(au(i, racine(i, 1, tm)));
          }
        }
        pousser(au(i, 1));
      } else if (da) {
        touche = true; pousser(au(i, racine(i, 0, 1))); fermer();
      } else if (db) {
        touche = true; ouvrir(); pousser(au(i, racine(i, 1, 0))); pousser(au(i, 1));
      } else touche = true;
    }
    fermer();
    return touche ? morceaux : null;
  }

  /* Le lasso qui DÉCOUPE (demandé le 9 nov. 2026) : un trait est coupé là
     où sa ligne passe le bord du lasso, et chaque morceau dit s'il est
     dedans. La coupe est interpolée sur le segment, pression comprise :
     les deux morceaux se touchent au point de coupe, rien ne manque.
     Rend [{ points, pressions, dedans }], dans l'ordre du trait. */
  function decouperPolygone(L, P, poly) {
    const n = L.length, morceaux = [];
    if (!n || poly.length < 3) return morceaux;
    const au = (i, t) => {
      const j = Math.min(n - 1, i + 1), a = L[i], b = L[j];
      return { x: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], p: P[i] + (P[j] - P[i]) * t };
    };
    let cour = null;
    const ouvrir = (q, dedans) => { cour = { points: [q.x], pressions: [q.p], dedans }; morceaux.push(cour); };
    if (n === 1) { ouvrir(au(0, 0), dansPolygone(L[0], poly)); return morceaux; }
    for (let i = 0; i < n - 1; i++) {
      const a = L[i], b = L[i + 1], dx = b[0] - a[0], dy = b[1] - a[1];
      // les passages du segment à travers les bords du lasso
      const ts = [0, 1];
      for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
        const c = poly[m], d = poly[k], ex = d[0] - c[0], ey = d[1] - c[1];
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den;
        const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
        if (t > 0 && t < 1 && u >= 0 && u < 1) ts.push(t);
      }
      ts.sort((x, y) => x - y);
      for (let j = 0; j < ts.length - 1; j++) {
        const t0 = ts[j], t1 = ts[j + 1];
        if (t1 - t0 < 1e-9) continue;
        // un bout de segment entre deux passages est tout dedans ou tout dehors
        const dedans = dansPolygone(au(i, (t0 + t1) / 2).x, poly);
        if (!cour || cour.dedans !== dedans) ouvrir(au(i, t0), dedans);
        const q = au(i, t1);
        cour.points.push(q.x); cour.pressions.push(q.p);
      }
    }
    return morceaux;
  }

  /* ═══════════════ 5. Lire un symbole : l'algorithme $P ═════════════════════
     « $P Point-Cloud Recognizer » (Vatavu, Anthony et Wobbrock, 2012) : un
     symbole est un NUAGE de points, ré-échantillonné, centré et mis à
     l'échelle ; on le compare à des modèles par un appariement glouton. Il
     ignore l'ordre et le sens des traits — un 4 en un ou deux traits, un x
     commencé par l'une ou l'autre barre, c'est pareil.

     Les modèles de départ sont dessinés ici, à la main, en coordonnées 0..1
     (y vers le bas). Ceux que l'élève apprend avec SON écriture s'y
     ajoutent : c'est ce qui rend la lecture fiable pour une main donnée. */
  const N = 32;
  function arc(cx, cy, rx, ry, a0, a1, k) {
    const out = []; k = k || 18;
    for (let i = 0; i <= k; i++) { const a = a0 + (a1 - a0) * i / k; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    return out;
  }
  const PI = Math.PI;
  const MODELES_BASE = [
    ["0", [arc(0.5, 0.5, 0.35, 0.5, -PI / 2, 3 * PI / 2, 28)]],
    ["1", [[[0.5, 0], [0.5, 1]]]],
    ["1", [[[0.28, 0.22], [0.5, 0], [0.5, 1]]]],
    ["2", [arc(0.5, 0.3, 0.35, 0.3, PI, 2 * PI + 0.6).concat([[0.1, 1], [0.9, 1]])]],
    ["3", [arc(0.5, 0.25, 0.35, 0.25, PI + 0.3, 2 * PI + PI / 2).concat(arc(0.5, 0.75, 0.35, 0.25, -PI / 2, PI - 0.3))]],
    ["4", [[[0.62, 0], [0.1, 0.65], [0.9, 0.65]], [[0.65, 0.3], [0.65, 1]]]],
    ["4", [[[0.3, 0], [0.15, 0.6], [0.85, 0.6]], [[0.65, 0.25], [0.65, 1]]]],
    ["5", [[[0.85, 0], [0.22, 0], [0.18, 0.45]].concat(arc(0.5, 0.68, 0.35, 0.3, -2.5, 2.6))]],
    ["6", [[[0.75, 0.03], [0.45, 0.15], [0.25, 0.4], [0.17, 0.7]].concat(arc(0.5, 0.72, 0.33, 0.27, PI, 3 * PI))]],
    ["7", [[[0.1, 0], [0.9, 0], [0.35, 1]]]],
    ["7", [[[0.1, 0], [0.9, 0], [0.35, 1]], [[0.35, 0.5], [0.8, 0.5]]]],
    ["8", [arc(0.5, 0.26, 0.28, 0.25, PI / 2, PI / 2 + 2 * PI).concat(arc(0.5, 0.75, 0.33, 0.25, -PI / 2, 3 * PI / 2))]],
    ["9", [arc(0.5, 0.3, 0.33, 0.28, 0, 2 * PI).concat([[0.83, 0.3], [0.7, 1]])]],
    ["+", [[[0.5, 0.05], [0.5, 0.95]], [[0.05, 0.5], [0.95, 0.5]]]],
    ["x", [[[0.1, 0.1], [0.9, 0.9]], [[0.9, 0.1], [0.1, 0.9]]]],
    ["y", [[[0.1, 0], [0.5, 0.55]], [[0.9, 0], [0.25, 1]]]],
    ["/", [[[0.85, 0], [0.15, 1]]]],
    ["(", [arc(1.1, 0.5, 0.75, 0.55, 2.3, 3.98)]],
    [")", [arc(-0.1, 0.5, 0.75, 0.55, -0.84, 0.84)]],
  ];

  function nuage(traits) {
    const pts = [];
    traits.forEach((t, id) => t.forEach((p) => pts.push({ x: p[0], y: p[1], id })));
    return pts;
  }
  function reechantillonner(pts, n) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].id === pts[i - 1].id) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (L === 0) return Array.from({ length: n }, () => ({ x: pts[0].x, y: pts[0].y, id: 0 }));
    const I = L / (n - 1);
    let D = 0;
    const out = [{ x: pts[0].x, y: pts[0].y, id: pts[0].id }];
    const P = pts.map((p) => Object.assign({}, p));
    for (let i = 1; i < P.length; i++) {
      if (P[i].id !== P[i - 1].id) continue;
      const d = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
      if (D + d >= I && d > 0) {
        const t = (I - D) / d;
        const q = { x: P[i - 1].x + t * (P[i].x - P[i - 1].x), y: P[i - 1].y + t * (P[i].y - P[i - 1].y), id: P[i].id };
        out.push(q); P.splice(i, 0, q); D = 0;
      } else D += d;
    }
    while (out.length < n) out.push(Object.assign({}, P[P.length - 1]));
    return out.slice(0, n);
  }
  function normaliser(traits) {
    let pts = reechantillonner(nuage(traits), N);
    /* Chaque axe ramené à 1 : un chiffre écrit est environ une fois et demie
       plus haut que large, les modèles sont dessinés dans un carré, et une
       échelle uniforme laissait la barre d'un 7 étroit loin de celle du
       modèle — mesuré : 87,5 % de petite écriture lue, 99,3 % après. Un
       symbole EXTRÊME (un 1, un −, plus de cinq fois plus long que large)
       garde une échelle uniforme : l'étirer ferait d'un trait un carré de
       tremblements. La proportion perdue revient comme un indice, plus bas. */
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const w = x1 - x0 || 1e-9, h = y1 - y0 || 1e-9, s = Math.max(w, h);
    const etire = w / h > 0.2 && w / h < 5;
    pts = pts.map((p) => ({ x: (p.x - x0) / (etire ? w : s), y: (p.y - y0) / (etire ? h : s), id: p.id }));
    let cx = 0, cy = 0; for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length; cy /= pts.length;
    return pts.map((p) => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
  }
  function distanceNuage(A, B, depart) {
    const pris_ = new Array(A.length).fill(false);
    let somme = 0, i = depart;
    do {
      let mini = Infinity, idx = -1;
      for (let j = 0; j < B.length; j++) {
        if (pris_[j]) continue;
        const d = Math.hypot(A[i].x - B[j].x, A[i].y - B[j].y);
        if (d < mini) { mini = d; idx = j; }
      }
      pris_[idx] = true;
      const poids = 1 - ((i - depart + A.length) % A.length) / A.length;
      somme += poids * mini;
      i = (i + 1) % A.length;
    } while (i !== depart);
    return somme;
  }
  function appariement(A, B) {
    const pas = Math.floor(Math.pow(A.length, 0.5));
    let mini = Infinity;
    for (let i = 0; i < A.length; i += pas) {
      mini = Math.min(mini, distanceNuage(A, B, i), distanceNuage(B, A, i));
    }
    return mini;
  }
  /* Deux indices que le nuage de points ne voit pas, et que l'œil prend en
     premier. La PROPORTION : un 7 est large, une parenthèse étroite —
     normalisés, leurs nuages se ressemblent. La FERMETURE : un 0 se
     referme, un 2 non — et un nuage n'a pas d'ordre, donc pas de bouts.
     Seuls, ils n'ont rien gagné (87,5 → 86,1 %) : ils ne servent qu'avec
     l'étirement par axe de « normaliser », qui sans eux confondrait un 7
     et une parenthèse devenus de même largeur. */
  function allure(traits) {
    const b = boite(traits.flat());
    const diag = Math.hypot(b.w, b.h) || 1;
    const t0 = traits[0];
    return {
      aspect: Math.max(0.15, Math.min(6, (b.w || 1) / (b.h || 1))),
      ferme: traits.length === 1 && t0.length > 2 && dist(t0[0], t0[t0.length - 1]) < 0.2 * diag,
      n: traits.length,
    };
  }
  function signature(traits) { return Object.assign({ pts: normaliser(traits) }, allure(traits)); }
  const BASE_NORM = MODELES_BASE.map(([nom, traits]) => Object.assign({ nom }, signature(traits)));

  /* Un symbole (ses traits) → { car, score }. Les petites marques se lisent
     par leur taille et leur forme avant de passer à $P : un point est trop
     petit pour un nuage, un − et un = sont plus sûrs à leur allure. */
  function lireSymbole(traits, hauteurLigne, appris) {
    const tous = traits.flat();
    const b = boite(tous);
    const H = hauteurLigne || Math.max(b.h, 1);
    const plat = (t) => { const c = boite(t); return c.h < 0.32 * Math.max(c.w, 1) && c.w > 0.25 * H; };
    if (Math.max(b.w, b.h) < 0.22 * H) return { car: ".", score: 1 };
    if (traits.length === 1 && plat(traits[0])) return { car: "−", score: 1 };
    if (traits.length === 2 && traits.every(plat)) return { car: "=", score: 1 };
    const A = signature(traits);
    // un modèle appris garde son allure ; un modèle d'avant n'en a pas, il n'est pas pénalisé
    const modeles = BASE_NORM.concat((appris || []).map((m) => (m.traits
      ? Object.assign({ nom: m.car }, signature(m.traits))
      : { nom: m.car, pts: m.pts, aspect: m.aspect || A.aspect, ferme: m.ferme == null ? A.ferme : m.ferme, n: m.n || A.n })));
    let mieux = null;
    for (const m of modeles) {
      let d = appariement(A.pts, m.pts);
      d *= 1 + 0.5 * Math.abs(Math.log(A.aspect / m.aspect));
      if (A.n === 1 && m.n === 1 && A.ferme !== m.ferme) d *= 1.3;
      if (!mieux || d < mieux.d) mieux = { car: m.nom, d };
    }
    return { car: mieux.car, score: Math.max(0, 1 - mieux.d / 3) };
  }

  /* Plusieurs traits → des lignes, puis des symboles, de gauche à droite. */
  function grouperEnSymboles(traits) {
    const T = traits.map((P) => ({ P, b: boite(P) }));
    // 1. les lignes d'écriture, par recouvrement vertical
    T.sort((a, b) => a.b.y - b.b.y);
    const lignes = [];
    for (const t of T) {
      const c = t.b.y + t.b.h / 2;
      const l = lignes.find((l) => c >= l.y0 - 0.15 * (l.y1 - l.y0) && c <= l.y1 + 0.15 * (l.y1 - l.y0));
      if (l) { l.t.push(t); l.y0 = Math.min(l.y0, t.b.y); l.y1 = Math.max(l.y1, t.b.y + t.b.h); }
      else lignes.push({ y0: t.b.y, y1: t.b.y + t.b.h, t: [t] });
    }
    // 2. dans chaque ligne, les symboles : des traits qui se recouvrent en x
    return lignes.map((l) => {
      const H = Math.max(...l.t.map((t) => t.b.h), 1);
      l.t.sort((a, b) => a.b.x - b.b.x);
      const symboles = [];
      for (const t of l.t) {
        const s = symboles[symboles.length - 1];
        const recouvre = s && t.b.x < s.x1 - 0.25 * Math.min(t.b.w, s.x1 - s.x0);
        if (recouvre) { s.traits.push(t.P); s.x1 = Math.max(s.x1, t.b.x + t.b.w); }
        else symboles.push({ x0: t.b.x, x1: t.b.x + t.b.w, traits: [t.P] });
      }
      return { y0: l.y0, y1: l.y1, hauteur: H, symboles };
    });
  }

  /* Le texte reconnu, ligne par ligne, avec des espaces là où l'écart entre
     deux symboles dépasse presque une hauteur de symbole : une main laisse
     entre deux chiffres d'un même nombre un écart qu'on prendrait sinon pour un blanc.
     « symboles » rend chaque caractère lu avec SES traits, dans l'ordre du
     texte : c'est ce qui permet d'apprendre d'une correction. */
  function lireEcriture(traits, appris) {
    const lignes = grouperEnSymboles(traits);
    const symboles = [];
    const texte = lignes.map((l) => {
      let s = "", fin = null;
      for (const sy of l.symboles) {
        if (fin !== null && sy.x0 - fin > 0.85 * l.hauteur) s += " ";
        const car = lireSymbole(sy.traits, l.hauteur, appris).car;
        symboles.push({ car, traits: sy.traits });
        s += car;
        fin = sy.x1;
      }
      return s;
    });
    return { texte: texte.join("\n"), lignes, symboles };
  }

  const API = { reconnaitreForme, simplifier, bordsRegle, bordProche, projeter, dansRegle,
                dansPolygone, pris, jalons, grille, tourner, couperSurface, aireSignee, decouper, gommer, decouperPolygone, lireSymbole, lireEcriture, grouperEnSymboles,
                normaliser, signature, longueur, boite, MODELES_BASE };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else racine.TB_STYLET = API;
})(typeof window !== "undefined" ? window : this);
