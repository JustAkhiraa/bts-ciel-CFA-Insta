/* Recomposer un document à partir des lettres placées d'un PDF.

   Un PDF ne sait pas ce qu'est un paragraphe : il pose des lettres à des
   coordonnées. Pour en refaire un document modifiable (.docx, .odt,
   .epub…), on remonte la pente, comme le ferait un œil :
     1. les lettres d'une même ligne de base forment une BANDE ; un blanc
        nettement plus large que les autres la coupe en SEGMENTS (deux
        colonnes, deux cases d'un tableau) ;
     2. les traits qui se croisent dessinent les TABLEAUX à bordures ;
     3. l'ORDRE DE LECTURE : on coupe la page par le couloir blanc le plus
        large, horizontal ou vertical, et on recommence dans chaque moitié
        (la découpe « XY ») — une page à deux colonnes se lit colonne par
        colonne. Des colonnes étroites dont les lignes se répondent sont un
        tableau sans bordures ;
     4. les lignes qui se suivent à interligne régulier forment des
        PARAGRAPHES ; un texte court, plus grand ou gras, est un TITRE ; une
        puce ou un numéro ouvre une LISTE ; une police à chasse fixe, du CODE ;
     5. ce qui revient en haut ou en bas de chaque page (en-tête, numéro de
        page) est retiré.
   Le résultat est un MODÈLE neutre, que chaque format écrit à sa façon
   (ecrivains.js). Tout est en points, repère de la page vue (y vers le bas). */

const PUCES = "•●▪■◦○◆◇►▸▹➢➤✓✔☐☑❖–—*·∙⁃→-";
const PUCE = new RegExp("^[" + PUCES.replace(/[-\]\\^]/g, "\\$&") + "]$", "u");
const NUMERO = /^(?:\(?\d{1,3}[.)°]|\(?[a-zA-Z][.)]|[ivxIVX]{1,5}[.)]|\d+(?:\.\d+)+\.?)$/;
const PUA = { "": "•", "": "▪", "": "❖", "": "➢", "": "✓", "": "◆", "": "●", "": "■", "": "→", "": "⇨", "": "➔" };
const LIGATURES = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st" };
const PAGE_SEULE = /^(?:(?:page|p\.?)\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?(?:\s*(?:\/|sur|of|de)\s*\d{1,4})?$/i;

const mediane = (t) => { if (!t.length) return 0; const s = [...t].sort((a, b) => a - b); return s[s.length >> 1]; };
const plein = (l) => l.u.trim() !== "";
const recouvre = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

/* ── 0. les lettres : ligatures, puces privées, faux gras ── */
function preparer(page) {
  const grille = new Map();
  const droites = [], penchees = [];
  const L = page.largeur, H = page.hauteur;
  for (const l0 of page.lettres) {
    let u = LIGATURES[l0.u] || PUA[l0.u] || l0.u;
    u = u.replace(/[\t\n\r ]/g, " ").replace(/­/g, "-").replace(/[\u0000-\u001f\u007f￾￿�]/g, "");
    if (!u || !(l0.taille > 0.8) || l0.taille > 500) continue;
    if (l0.x < -4 || l0.x > L + 4 || l0.y < -4 || l0.y > H + 4) continue;
    const l = { ...l0, u };
    if (plein(l)) {
      // la même lettre posée deux fois presque au même endroit : un faux gras (ou une ombre)
      const tol = Math.min(1.4, 0.16 * l.taille), gx = Math.round(l.x), gy = Math.round(l.y);
      let double = null;
      for (let dx = -1; dx <= 1 && !double; dx++) for (let dy = -1; dy <= 1 && !double; dy++) {
        for (const o of grille.get(u + "|" + (gx + dx) + "|" + (gy + dy)) || []) if (Math.abs(o.x - l.x) < tol && Math.abs(o.y - l.y) < tol) { double = o; break; }
      }
      if (double) { double.gras = true; if (!double.couleur) double.couleur = l.couleur; continue; }
      const k = u + "|" + gx + "|" + gy;
      if (!grille.has(k)) grille.set(k, []);
      grille.get(k).push(l);
    }
    (Math.abs(l.angle) < 0.06 ? droites : penchees).push(l);
  }
  return { droites, penchees };
}

/* ── 1. bandes et segments ── */
function bandes(lettres) {
  const ls = [...lettres].sort((a, b) => a.y - b.y || a.x - b.x);
  const out = [];
  for (const l of ls) {
    let b = null;
    for (let k = out.length - 1; k >= 0; k--) {
      const c = out[k];
      if (c.y < l.y - 2 * Math.max(c.taille, l.taille)) break;
      const t = Math.min(c.taille, l.taille);
      if (Math.abs(l.y - c.y) <= 0.3 * Math.max(t, 0.5 * Math.max(c.taille, l.taille))) { b = c; break; }
    }
    if (b) { b.lettres.push(l); if (plein(l)) b.taille = Math.max(b.taille, l.taille); }
    else out.push({ y: l.y, taille: l.taille, lettres: [l] });
  }
  return exposants(out);
}
/* Une petite bande collée à une grande, à hauteur d'exposant ou d'indice
   (m², H₂O, renvoi de note) : elle la rejoint. */
function exposants(bs) {
  const taille = (b) => b.t || (b.t = mediane(b.lettres.filter(plein).map((l) => l.taille)) || b.taille);
  for (let i = 0; i < bs.length; i++) {
    const s = bs[i];
    if (s.fondue || s.lettres.length > 40) continue;
    const ts = taille(s);
    const xs0 = Math.min(...s.lettres.map((l) => l.x)), xs1 = Math.max(...s.lettres.map((l) => l.x + l.l));
    for (const j of [i - 1, i + 1, i - 2, i + 2]) {
      const b = bs[j];
      if (!b || b.fondue) continue;
      const tb = taille(b);
      if (tb < ts * 1.18) continue;
      const dy = s.y - b.y;
      if (dy < -0.62 * tb || dy > 0.42 * tb || Math.abs(dy) < 0.08 * tb) continue;
      const proche = b.lettres.some((l) => l.x - 0.8 * tb <= xs1 && l.x + l.l + 0.8 * tb >= xs0 && plein(l));
      if (!proche) continue;
      for (const l of s.lettres) { l.pos = dy < 0 ? "sup" : "sub"; b.lettres.push(l); }
      s.fondue = true;
      break;
    }
  }
  return bs.filter((b) => !b.fondue);
}

function segmenter(b) {
  const ls = b.lettres.sort((p, q) => p.x - q.x);
  const pleins = [];
  let esp = false;
  for (const l of ls) { if (!plein(l)) { esp = true; continue; } pleins.push({ l, esp }); esp = false; }
  if (!pleins.length) return [];
  const t = mediane(pleins.filter((m) => !m.l.pos).map((m) => m.l.taille)) || pleins[0].l.taille;
  const ecarts = [];
  for (let i = 1; i < pleins.length; i++) {
    const p = pleins[i - 1].l, l = pleins[i].l;
    const g = l.x - (p.x + p.l);
    pleins[i].g = g;
    pleins[i].mot = g > 0.16 * t || (pleins[i].esp && g > 0.035 * t);
    if (pleins[i].mot && g < 0.9 * t) ecarts.push(g);
  }
  // l'espace ordinaire de la ligne (les grands blancs n'en sont pas : sur une
  // ligne de tableau, ils seraient la moitié des écarts)
  const med = ecarts.length ? mediane(ecarts) : 0.3 * t;
  const segs = [];
  let cur = [];
  const fermer = () => { if (cur.length) segs.push(faireSegment(cur, b.y)); cur = []; };
  for (let i = 0; i < pleins.length; i++) {
    const m = pleins[i];
    // un grand blanc coupe la ligne ; une espace réellement écrite et étirée (texte justifié) moins vite
    if (i > 0 && (m.g > 3 * t || (m.g > 0.9 * t && m.g > 2.2 * med && !(m.esp && m.g < 2 * t)))) fermer();
    cur.push({ l: m.l, esp: cur.length > 0 && !!m.mot });
  }
  fermer();
  // une puce ou un numéro seuls, suivis d'un grand blanc (une tabulation) : ils vont avec la suite
  for (let i = 0; i + 1 < segs.length; i++) {
    const s = segs[i], n = segs[i + 1];
    if ((PUCE.test(s.texte) || NUMERO.test(s.texte)) && n.x0 - s.x1 < 8 * s.taille) {
      n.morceaux[0].esp = true;
      segs.splice(i, 2, faireSegment([...s.morceaux, ...n.morceaux], b.y));
      segs[i].retraitTexte = n.x0;
    }
  }
  return segs;
}
function faireSegment(morceaux, y) {
  const ls = morceaux.map((m) => m.l);
  const t = mediane(ls.filter((l) => !l.pos).map((l) => l.taille)) || ls[0].taille;
  const x0 = Math.min(...ls.map((l) => l.x)), x1 = Math.max(...ls.map((l) => l.x + l.l));
  let texte = "";
  for (const m of morceaux) texte += (m.esp ? " " : "") + m.l.u;
  return { genre: "seg", morceaux, x0, x1, y, y0: y - 0.78 * t, y1: y + 0.24 * t, taille: t, texte,
    gras: ls.every((l) => l.gras || !/[\p{L}\p{N}]/u.test(l.u)), mono: ls.filter((l) => l.mono).length >= 0.9 * ls.length };
}

/* Le texte penché (une étiquette de schéma, un titre de colonne vertical) :
   on le redresse dans son propre repère pour en faire des lignes. */
function segmentsPenches(lettres) {
  const groupes = new Map();
  for (const l of lettres) {
    const k = Math.round(l.angle / 0.087);
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(l);
  }
  const out = [];
  for (const [k, ls] of groupes) {
    const a = k * 0.087, c = Math.cos(a), s = Math.sin(a);
    const locales = ls.map((l) => ({ ...l, orig: l, x: l.x * c + l.y * s, y: -l.x * s + l.y * c }));
    for (const b of bandes(locales)) for (const seg of segmenter(b)) {
      const o = seg.morceaux.map((m) => m.l.orig);
      seg.morceaux = seg.morceaux.map((m) => ({ ...m, l: m.l.orig }));
      seg.x0 = Math.min(...o.map((l) => l.x)) - 0.2 * seg.taille; seg.x1 = Math.max(...o.map((l) => l.x)) + 0.8 * seg.taille;
      seg.y0 = Math.min(...o.map((l) => l.y)) - 0.8 * seg.taille; seg.y1 = Math.max(...o.map((l) => l.y)) + 0.3 * seg.taille;
      seg.y = (seg.y0 + seg.y1) / 2;
      seg.penche = true;
      out.push(seg);
    }
  }
  return out;
}

/* ── 2. les tableaux à bordures ── */
function fusionnerTraits(t, horiz) {
  const cle = horiz ? (s) => s.y0 : (s) => s.x0;
  const deb = horiz ? (s) => s.x0 : (s) => s.y0, fin = horiz ? (s) => s.x1 : (s) => s.y1;
  const tri = [...t].sort((a, b) => cle(a) - cle(b) || deb(a) - deb(b));
  const out = [];
  for (const s of tri) {
    const d = out[out.length - 1];
    if (d && Math.abs(d.pos - cle(s)) <= 1 && deb(s) <= d.b + 1.5) d.b = Math.max(d.b, fin(s));
    else out.push({ pos: cle(s), a: deb(s), b: fin(s) });
  }
  return out;
}
function grouper(valeurs, tol) {
  const s = [...valeurs].sort((a, b) => a - b);
  const out = [];
  for (const v of s) { if (out.length && v - out[out.length - 1].max <= tol) { const g = out[out.length - 1]; g.max = v; g.n++; g.somme += v; } else out.push({ max: v, n: 1, somme: v }); }
  return out.map((g) => g.somme / g.n);
}
function tableauxTraces(page, lettres) {
  const H = fusionnerTraits(page.traits.filter((t) => Math.abs(t.y1 - t.y0) <= 1.2), true);
  const V = fusionnerTraits(page.traits.filter((t) => Math.abs(t.x1 - t.x0) <= 1.2), false);
  if (H.length < 2 || V.length < 2 || H.length * V.length > 4e5) return [];
  // les traits qui se croisent forment un même quadrillage (union-find)
  const parent = [...Array(H.length + V.length).keys()];
  const chef = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let i = 0; i < H.length; i++) for (let j = 0; j < V.length; j++) {
    const h = H[i], v = V[j];
    if (v.pos >= h.a - 2 && v.pos <= h.b + 2 && h.pos >= v.a - 2 && h.pos <= v.b + 2) parent[chef(i)] = chef(H.length + j);
  }
  const comps = new Map();
  for (let i = 0; i < parent.length; i++) { const c = chef(i); if (!comps.has(c)) comps.set(c, { h: [], v: [] }); (i < H.length ? comps.get(c).h : comps.get(c).v).push(i < H.length ? H[i] : V[i - H.length]); }
  const tableaux = [];
  for (const { h, v } of comps.values()) {
    if (h.length < 2 || v.length < 2) continue;
    const ys = grouper(h.map((s) => s.pos), 1.5), xs = grouper(v.map((s) => s.pos), 1.5);
    const nl = ys.length - 1, nc = xs.length - 1;
    if (nl < 1 || nc < 1 || nl * nc < 2 || nl * nc > 4000) continue;
    const couvre = (segs, pos, a, b) => {
      let tot = 0;
      for (const s of segs) if (Math.abs(s.pos - pos) <= 1.5) tot += Math.max(0, recouvre(a, b, s.a, s.b));
      return tot >= 0.55 * (b - a);
    };
    // les cases fusionnées : pas de trait entre deux cases voisines
    const id = (i, j) => i * nc + j;
    const p2 = [...Array(nl * nc).keys()];
    const chef2 = (i) => { while (p2[i] !== i) i = p2[i] = p2[p2[i]]; return i; };
    for (let i = 0; i < nl; i++) for (let j = 0; j + 1 < nc; j++) if (!couvre(v, xs[j + 1], ys[i], ys[i + 1])) p2[chef2(id(i, j + 1))] = chef2(id(i, j));
    for (let j = 0; j < nc; j++) for (let i = 0; i + 1 < nl; i++) if (!couvre(h, ys[i + 1], xs[j], xs[j + 1])) p2[chef2(id(i + 1, j))] = chef2(id(i, j));
    const zones = new Map();
    for (let i = 0; i < nl; i++) for (let j = 0; j < nc; j++) {
      const c = chef2(id(i, j));
      if (!zones.has(c)) zones.set(c, { i0: i, i1: i, j0: j, j1: j, n: 0 });
      const z = zones.get(c);
      z.i0 = Math.min(z.i0, i); z.i1 = Math.max(z.i1, i); z.j0 = Math.min(z.j0, j); z.j1 = Math.max(z.j1, j); z.n++;
    }
    const zoneDe = new Map();
    for (const [c, z] of zones) {
      if (z.n !== (z.i1 - z.i0 + 1) * (z.j1 - z.j0 + 1)) {
        // une forme qui n'est pas un rectangle : chaque case reste seule
        for (let i = z.i0; i <= z.i1; i++) for (let j = z.j0; j <= z.j1; j++) if (chef2(id(i, j)) === c) zoneDe.set(id(i, j), { i0: i, i1: i, j0: j, j1: j });
      } else for (let i = z.i0; i <= z.i1; i++) for (let j = z.j0; j <= z.j1; j++) zoneDe.set(id(i, j), z);
    }
    if (new Set(zoneDe.values()).size < 2) continue;      // un simple cadre autour d'un texte
    tableaux.push({ xs, ys, nl, nc, zoneDe, x0: xs[0], x1: xs[nc], y0: ys[0], y1: ys[nl], lettres: new Map() });
  }
  if (!tableaux.length) return [];
  // les lettres de chaque case
  const reste = [];
  for (const l of lettres) {
    const cx = l.x + l.l / 2, cy = l.y - 0.3 * l.taille;
    const t = tableaux.find((t) => cx > t.x0 - 0.5 && cx < t.x1 + 0.5 && cy > t.y0 - 0.5 && cy < t.y1 + 0.5);
    if (!t) { reste.push(l); continue; }
    let i = 0, j = 0;
    while (i < t.nl - 1 && cy > t.ys[i + 1]) i++;
    while (j < t.nc - 1 && cx > t.xs[j + 1]) j++;
    const z = t.zoneDe.get(i * t.nc + j);
    const k = z.i0 * t.nc + z.j0;
    if (!t.lettres.has(k)) t.lettres.set(k, []);
    t.lettres.get(k).push(l);
  }
  const garde = [];
  for (const t of tableaux) {
    const pleines = [...t.lettres.values()].filter((ls) => ls.some(plein)).length;
    const cases = new Set(t.zoneDe.values()).size;
    if (pleines < 2 || pleines < 0.2 * cases) { for (const ls of t.lettres.values()) reste.push(...ls); continue; }   // un quadrillage, un schéma : pas un tableau
    const lignes = [];
    for (let i = 0; i < t.nl; i++) {
      const ligne = [];
      for (let j = 0; j < t.nc; j++) {
        const z = t.zoneDe.get(i * t.nc + j);
        if (z.i0 !== i || z.j0 !== j) { ligne.push({ couvert: true }); continue; }
        const ls = t.lettres.get(i * t.nc + j) || [];
        const segs = bandes(ls).flatMap(segmenter).sort((a, b) => a.y - b.y || a.x0 - b.x0);
        const fond = page.fonds.find((f) => recouvre(f.x0, f.x1, t.xs[j], t.xs[z.j1 + 1]) > 0.8 * (t.xs[z.j1 + 1] - t.xs[j]) && recouvre(f.y0, f.y1, t.ys[i], t.ys[z.i1 + 1]) > 0.8 * (t.ys[z.i1 + 1] - t.ys[i]));
        ligne.push({ segs, colspan: z.j1 - z.j0 + 1, rowspan: z.i1 - z.i0 + 1, fond: fond && fond.couleur !== "ffffff" ? fond.couleur : null });
      }
      lignes.push(ligne);
    }
    garde.push({ genre: "tableau", lignes, largeurs: t.xs.slice(1).map((x, j) => x - t.xs[j]), x0: t.x0, x1: t.x1, y0: t.y0, y1: t.y1, y: t.y0, borde: true });
  }
  lettres.length = 0;
  lettres.push(...reste);
  return garde;
}

/* ── 3. l'ordre de lecture : la découpe XY ── */
function ordonner(items, corps) {
  if (items.length <= 1) return items;
  const t = mediane(items.filter((i) => i.genre === "seg").map((i) => i.taille)) || corps;
  // le plus large couloir horizontal
  const parY = [...items].sort((a, b) => a.y0 - b.y0);
  let finY = parY[0].y1, gH = 0, iH = -1;
  for (let i = 1; i < parY.length; i++) {
    const g = parY[i].y0 - finY;
    if (g > gH) { gH = g; iH = i; }
    finY = Math.max(finY, parY[i].y1);
  }
  // les couloirs verticaux
  const parX = [...items].sort((a, b) => a.x0 - b.x0);
  let finX = parX[0].x1;
  const couloirs = [];
  for (let i = 1; i < parX.length; i++) {
    const g = parX[i].x0 - finX;
    if (g > 0) couloirs.push({ g, x: (finX + parX[i].x0) / 2 });
    finX = Math.max(finX, parX[i].x1);
  }
  const gV = couloirs.reduce((m, c) => Math.max(m, c.g), 0);
  const vertical = (gV >= 0.9 * t && gH < 2.5 * t) || (gH <= 0 && gV > 0.35 * t);
  if (vertical) {
    const coupes = couloirs.filter((c) => c.g >= Math.max(0.6 * gV, 0.35 * t)).map((c) => c.x).sort((a, b) => a - b);
    const tranches = coupes.map(() => []);
    tranches.push([]);
    for (const it of items) { let k = 0; while (k < coupes.length && it.x0 > coupes[k]) k++; tranches[k].push(it); }
    const tab = tableauSansBords(tranches, t);
    if (tab) return [tab];
    return tranches.flatMap((tr) => ordonner(tr, corps));
  }
  if (iH > 0) return [...ordonner(parY.slice(0, iH), corps), ...ordonner(parY.slice(iH), corps)];
  return [...items].sort((a, b) => a.y - b.y || a.x0 - b.x0);
}

/* Des colonnes dont les lignes se répondent, sans remplir leur largeur
   comme le ferait un texte en colonnes : un tableau sans bordures. */
function tableauSansBords(tranches, t) {
  if (tranches.length < 2 || tranches.some((tr) => !tr.length || tr.some((i) => i.genre !== "seg" || i.penche))) return null;
  const lignesDe = (tr) => grouper(tr.map((s) => s.y), 0.3 * t);
  const toutes = tranches.map(lignesDe);
  if (toutes.reduce((n, l) => n + l.length, 0) < 4 || toutes[0].length < 2) return null;
  let alignees = 0, total = 0;
  for (let k = 1; k < toutes.length; k++) for (const y of toutes[k]) { total++; if (toutes.some((a, j) => j !== k && a.some((z) => Math.abs(z - y) < 0.35 * t))) alignees++; }
  const accord = total ? alignees / total : 0;
  const remplissage = tranches.map((tr) => {
    const x0 = Math.min(...tr.map((s) => s.x0)), x1 = Math.max(...tr.map((s) => s.x1));
    return mediane(tr.map((s) => (s.x1 - s.x0) / Math.max(1, x1 - x0)));
  });
  const mots = mediane(tranches.flat().map((s) => s.texte.split(/\s+/).length));
  const tableau = (tranches.length >= 3 && accord >= 0.5) || (accord >= 0.6 && Math.min(...remplissage) < 0.72 && mots <= 12);
  if (!tableau) return null;
  // les rangées : une ligne de la première colonne (ou de deux colonnes à la fois) en ouvre une
  const ancres = grouper(tranches.flat().map((s) => s.y), 0.3 * t).filter((y) =>
    tranches[0].some((s) => Math.abs(s.y - y) < 0.35 * t) || tranches.filter((tr) => tr.some((s) => Math.abs(s.y - y) < 0.35 * t)).length >= 2);
  if (ancres.length < 2) return null;
  const lignes = ancres.map(() => tranches.map(() => ({ segs: [], colspan: 1, rowspan: 1 })));
  tranches.forEach((tr, j) => {
    for (const s of tr) {
      let i = 0;
      while (i + 1 < ancres.length && s.y > ancres[i + 1] - 0.35 * t) i++;
      lignes[i][j].segs.push(s);
    }
  });
  for (const l of lignes) for (const c of l) c.segs.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const bords = tranches.map((tr) => [Math.min(...tr.map((s) => s.x0)), Math.max(...tr.map((s) => s.x1))]);
  const all = tranches.flat();
  return { genre: "tableau", lignes, largeurs: bords.map((b, j) => (j + 1 < bords.length ? bords[j + 1][0] : b[1] + 6) - b[0]),
    x0: bords[0][0], x1: bords[bords.length - 1][1], y0: Math.min(...all.map((s) => s.y0)), y1: Math.max(...all.map((s) => s.y1)), borde: false, y: Math.min(...all.map((s) => s.y)) };
}

/* ── 4. les paragraphes ── */
function marqueDe(seg) {
  const m = /^(\S+)\s/.exec(seg.texte + " ");
  if (!m) return null;
  const mot = m[1];
  if (PUCE.test(mot) && seg.texte.length > mot.length) return { mot, ordonnee: false };
  // la puce de deuxième niveau des traitements de texte : un « o » (ou « § ») dans une autre
  // police que le texte qui suit
  const ms = seg.morceaux;
  if ((mot === "o" || mot === "§") && ms.length > 2 && ms[1].esp && ms[0].l.police !== ms[1].l.police) return { mot, ordonnee: false };
  if (NUMERO.test(mot) && seg.texte.length > mot.length + 1) {
    const type = /^\(?\d/.test(mot) ? (mot.includes(".") && /\d\.\d/.test(mot) ? "1.1" : "1") : /^\(?[ivx]+[.)]$/.test(mot) ? "i" : /^\(?[IVX]+[.)]$/.test(mot) ? "I" : /^\(?[a-z]/.test(mot) ? "a" : "A";
    return { mot, ordonnee: true, type };
  }
  return null;
}
function paragraphes(ordre, interligne) {
  const out = [];
  let p = null;
  const fermer = () => { if (p) out.push(p); p = null; };
  for (const it of ordre) {
    if (it.genre !== "seg") { fermer(); out.push(it); continue; }
    const marque = it.penche ? null : marqueDe(it);
    if (p && !it.penche && suit(p, it, marque, interligne)) { p.segs.push(it); p.x0 = Math.min(p.x0, it.x0); p.x1 = Math.max(p.x1, it.x1); p.y1 = it.y1; continue; }
    fermer();
    p = { genre: "para", segs: [it], marque, x0: it.x0, x1: it.x1, y0: it.y0, y1: it.y1, y: it.y, taille: it.taille, penche: it.penche,
      texteX: marque ? (it.retraitTexte || debutApresMarque(it, marque)) : it.x0 };
  }
  fermer();
  return out;
}
function debutApresMarque(seg, marque) {
  const n = [...marque.mot].length;
  let k = 0, i = 0;
  for (; i < seg.morceaux.length && k < n; i++) k += [...seg.morceaux[i].l.u].length;
  return seg.morceaux[i] ? seg.morceaux[i].l.x : seg.x0;
}
function suit(p, s, marque, interligne) {
  const d = p.segs[p.segs.length - 1];
  if (p.penche) return false;
  if (marque) return false;
  if (Math.abs(s.taille - d.taille) > 0.13 * d.taille) return false;
  const dy = s.y - d.y;
  if (dy < 0.5 * d.taille) return false;
  const pas = interligne(d.taille);
  if (dy > pas * 1.28 + 0.06 * d.taille) return false;
  if (recouvre(s.x0, s.x1, d.x0, d.x1) <= 0) return false;
  if (d.mono !== s.mono) return false;
  if (p.segs.every((x) => x.gras) && !s.gras) return false;                   // une ligne en gras puis du texte : un intertitre
  if (s.gras && !d.gras) return false;                                         // une ligne toute en gras après du texte : un intertitre
  // des lignes centrées l'une sous l'autre : le même paragraphe, quels que soient leurs bords
  if (Math.abs((s.x0 + s.x1) / 2 - (d.x0 + d.x1) / 2) < 1.2 * d.taille && Math.abs(s.x0 - d.x0) > 0.5 * d.taille) return true;
  const debut = p.marque ? p.texteX : p.segs.length > 1 ? p.segs[1].x0 : p.x0;
  if (p.marque && Math.abs(s.x0 - p.texteX) > 1.2 * d.taille && s.x0 < p.texteX - 1.2 * d.taille) return false;
  if (!p.marque && s.x0 > debut + 1.1 * d.taille && !(p.segs.length === 1 && s.x0 < d.x0)) return false;   // un retrait : un nouveau paragraphe
  // la ligne précédente finissait une phrase bien avant le bord d'un texte justifié
  const droite = Math.max(...p.segs.map((x) => x.x1));
  const justifie = p.segs.length >= 2 && p.segs.filter((x) => Math.abs(x.x1 - droite) < 1.5).length >= 2;
  if (justifie && d.x1 < droite - 2 * d.taille && /[.!?:»”)]$/.test(d.texte)) return false;
  if (!p.marque && p.segs.length === 1 && s.x0 < d.x0 - 0.8 * d.taille && /[.!?:]$/.test(d.texte)) return false;
  return true;
}

/* Les lignes, en suites de mots stylés (les « runs ») : gras, italique,
   taille, couleur, exposant, lien, souligné, police. */
function styleDe(l) {
  return { gras: !!l.gras, italique: !!l.italique, mono: !!l.mono, taille: Math.round(l.taille * 2) / 2, couleur: l.couleur || null,
    pos: l.pos || null, lien: l.lien || null, souligne: !!l.souligne, famille: familleDe(l.police) };
}
const CLES = ["gras", "italique", "mono", "taille", "couleur", "pos", "lien", "souligne", "famille"];
const meme = (a, b) => CLES.every((k) => a[k] === b[k]);
function familleDe(p) {
  if (!p) return null;
  if (p.famille !== undefined) return p.famille;
  let n = (p.nom || "").replace(/^[A-Z]{6}\+/, "").replace(/(PSMT|PS|MT)$/, "");
  n = n.replace(/[,-]?(Bold|Italic|Oblique|Regular|Roman|Book|Medium|Light|Semibold|SemiBold|Demi|Black|Heavy|Condensed|Narrow|BdIt|Bd|It)+$/i, "").replace(/(PSMT|PS|MT)$/, "");
  if (!n || (/^(CM|LM|SF|EC|T\d|F\d|Font|TT|C\d)/.test(n) && /\d/.test(n))) return (p.famille = null);
  n = n.replace(/([a-z])([A-Z][a-z])/g, "$1 $2").replace(/[-_]/g, " ").trim();
  return (p.famille = n || null);
}
function runsDe(segs, sauter = 0) {
  const runs = [];
  const ajouter = (t, st) => {
    const r = runs[runs.length - 1];
    if (r && meme(r, st)) r.t += t;
    else runs.push({ ...st, t });
  };
  segs.forEach((s, i) => {
    let ms = s.morceaux;
    if (i === 0 && sauter) {
      let n = sauter, k = 0;
      while (k < ms.length && n > 0) { n -= [...ms[k].l.u].length; k++; }
      ms = ms.slice(k);
      if (ms[0]) ms = [{ ...ms[0], esp: false }, ...ms.slice(1)];
    }
    if (!ms.length) return;
    if (runs.length) {
      const r = runs[runs.length - 1];
      const premier = ms[0].l.u;
      if (/[\p{Ll}]-$/u.test(r.t) && /^\p{Ll}/u.test(premier)) r.t = r.t.slice(0, -1);   // une césure : le mot se recolle
      else if (!/\s$/.test(r.t)) ajouter(" ", styleDe(ms[0].l));
    }
    for (const m of ms) { const st = styleDe(m.l); if (m.esp) ajouter(" ", st); ajouter(m.l.u, st); }
  });
  // une espace au bord d'un mot souligné ou d'un lien va au mot voisin, qui ne l'est pas
  const orne = (r) => r.souligne || r.lien;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (!orne(r)) continue;
    if (i > 0 && !orne(runs[i - 1]) && /^\s/.test(r.t)) { runs[i - 1].t += r.t.match(/^\s+/)[0]; r.t = r.t.replace(/^\s+/, ""); }
    if (i + 1 < runs.length && !orne(runs[i + 1]) && /\s$/.test(r.t)) { runs[i + 1].t = r.t.match(/\s+$/)[0] + runs[i + 1].t; r.t = r.t.replace(/\s+$/, ""); }
  }
  // les espaces en trop, aux bouts et en double
  for (const r of runs) r.t = r.t.replace(/ {2,}/g, " ");
  while (runs.length && !runs[0].t.trim()) runs.shift();
  while (runs.length && !runs[runs.length - 1].t.trim()) runs.pop();
  if (runs.length) { runs[0].t = runs[0].t.replace(/^\s+/, ""); runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\s+$/, ""); }
  return runs.filter((r) => r.t);
}
export const texteDe = (runs) => runs.map((r) => r.t).join("");

/* ── 5. en-têtes et pieds de page ── */
function retirerEntetes(pagesSegs, pages, corps) {
  if (pages.length < 2) return 0;
  const cle = (s) => s.texte.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  // le haut et le bas de la page ; et pas plus grand que le texte courant (un titre de
  // diapositive répété, lui, est du contenu)
  const zone = (s, H) => (s.y1 < 0.13 * H || s.y0 > 0.88 * H) && s.taille <= 1.15 * corps;
  const compte = new Map();
  pagesSegs.forEach((segs, k) => {
    const vus = new Set();
    for (const s of segs) if (zone(s, pages[k].hauteur)) vus.add(cle(s));
    for (const c of vus) compte.set(c, (compte.get(c) || 0) + 1);
  });
  const seuil = Math.max(2, Math.ceil(0.4 * pages.length));
  let n = 0;
  pagesSegs.forEach((segs, k) => {
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      if (!zone(s, pages[k].hauteur)) continue;
      if (compte.get(cle(s)) >= seuil || PAGE_SEULE.test(s.texte.trim())) { segs.splice(i, 1); n++; }
    }
  });
  return n;
}

/* ── le tout : lu (pages relevées par texte.js) → modèle ── */
export function recomposer(lu, { entetes = false, images = true, meta = {} } = {}) {
  const parPage = [];
  // les segments de chaque page, ses tableaux à bordures, ses images
  for (const page of lu) {
    const { droites, penchees } = preparer(page);
    marquerLiens(droites, page.liens);
    const tableaux = tableauxTraces(page, droites);
    // les bordures d'un tableau ne soulignent rien
    souligner(droites, page.traits.filter((t) => !tableaux.some((b) => t.x0 >= b.x0 - 2 && t.x1 <= b.x1 + 2 && t.y0 >= b.y0 - 2 && t.y1 <= b.y1 + 2)));
    const segs = bandes(droites).flatMap(segmenter);
    const penches = segmentsPenches(penchees);
    parPage.push({ page, segs: [...segs, ...penches], tableaux, images: images ? imagesUtiles(page, droites.length + penchees.length) : [] });
  }
  // la taille du texte courant, et (plus bas) l'interligne de chaque taille
  const poids = new Map();
  for (const { segs } of parPage) for (const s of segs) { const k = Math.round(s.taille * 2) / 2; poids.set(k, (poids.get(k) || 0) + s.texte.length); }
  const corps = [...poids].sort((a, b) => b[1] - a[1])[0]?.[0] || 11;
  const retires = entetes ? 0 : retirerEntetes(parPage.map((p) => p.segs), lu, corps);
  if (!entetes) retirerLogos(parPage);
  const pages = [];
  const pas = new Map();
  const ordres = parPage.map(({ page, segs, tableaux, images: ims }) => ordonner([...segs, ...tableaux, ...ims.map((im) => ({ ...im, genre: "image", y: im.y0 }))], corps));
  for (const ordre of ordres) for (let i = 1; i < ordre.length; i++) {
    const a = ordre[i - 1], b = ordre[i];
    if (a.genre !== "seg" || b.genre !== "seg" || Math.abs(a.taille - b.taille) > 0.1 * a.taille || recouvre(a.x0, a.x1, b.x0, b.x1) <= 0) continue;
    const d = (b.y - a.y) / a.taille;
    if (d > 0.8 && d < 2.6) { const k = Math.round(a.taille); if (!pas.has(k)) pas.set(k, []); pas.get(k).push(d); }
  }
  const ratioDoc = mediane([...pas.values()].flat()) || 1.25;
  const interligne = (t) => {
    const v = pas.get(Math.round(t));
    const r = v && v.length >= 3 ? modeDe(v) : ratioDoc;
    return Math.max(1.02, Math.min(2.2, r)) * t;
  };
  ordres.forEach((ordre, k) => {
    const page = lu[k];
    const blocs = paragraphes(ordre, interligne);
    pages.push({ index: page.index, largeur: page.largeur, hauteur: page.hauteur, blocs, zone: zoneTexte(blocs, corps, page) });
  });
  const dominante = familleDominante(parPage);
  // « genre » : sans empattement (swiss), à empattement (roman), à chasse fixe (modern) — ce qui
  // permet à un logiciel qui n'a pas la police d'en prendre une du même genre
  const modele = { titre: meta.Title || "", auteur: meta.Author || "", sujet: meta.Subject || "", corps, famille: dominante.nom, genre: dominante.genre,
    pages: [], stats: { lettres: 0, images: 0, tableaux: 0, entetesRetires: retires, pagesSansTexte: [] } };
  classer(pages, corps);
  let dernier = null;
  for (const p of pages) {
    const blocs = [];
    for (const b of p.blocs) {
      for (const x of finaliser(b, p, modele)) {
        // un paragraphe coupé par un changement de colonne ou de page se recolle
        if (x.type === "para" && dernier && dernier.type === "para" && !x.penche && !dernier.penche && suiteDe(dernier, x)) {
          recoller(dernier.runs, x.runs);
          continue;
        }
        blocs.push(x);
        dernier = x;
      }
    }
    p.blocs = grouperListes(fusionnerCode(blocs));
    modele.pages.push({ index: p.index, largeur: p.largeur, hauteur: p.hauteur, blocs: p.blocs });
    if (!lu.find((x) => x.index === p.index).lettres.some(plein)) modele.stats.pagesSansTexte.push(p.index);
  }
  modele.stats.lettres = lu.reduce((n, p) => n + p.lettres.length, 0);
  if (!modele.titre) { const t = modele.pages.flatMap((p) => p.blocs).find((b) => b.type === "titre"); if (t) modele.titre = texteDe(t.runs).slice(0, 120); }
  return modele;
}
/* La suite d'une phrase : le paragraphe d'avant ne finit pas une phrase et
   celui-ci commence par une minuscule, à la même taille. */
function suiteDe(a, b) {
  const fin = texteDe(a.runs), debut = texteDe(b.runs);
  const ta = a.runs[a.runs.length - 1], tb = b.runs[0];
  return !/[.!?:;»”"…)\]]\s*$/.test(fin) && /^\p{Ll}/u.test(debut) && ta && tb && Math.abs(ta.taille - tb.taille) <= 0.5;
}
function recoller(runs, suite) {
  const r = runs[runs.length - 1];
  if (/[\p{Ll}]-$/u.test(r.t)) r.t = r.t.slice(0, -1);
  else r.t += " ";
  for (const s of suite) { const d = runs[runs.length - 1]; if (meme(d, s)) d.t += s.t; else runs.push(s); }
}
function modeDe(v) {
  const c = new Map();
  for (const x of v) { const k = Math.round(x * 20) / 20; c.set(k, (c.get(k) || 0) + 1); }
  return [...c].sort((a, b) => b[1] - a[1])[0][0];
}
function familleDominante(parPage) {
  const c = new Map();
  for (const { segs } of parPage) for (const s of segs) for (const m of s.morceaux) {
    const p = m.l.police, f = familleDe(p);
    if (!f) continue;
    if (!c.has(f)) c.set(f, { n: 0, genre: p.mono ? "modern" : /, serif$/.test(p.css || "") ? "roman" : "swiss" });
    c.get(f).n++;
  }
  const t = [...c].sort((a, b) => b[1].n - a[1].n)[0];
  return t ? { nom: t[0], genre: t[1].genre } : { nom: null, genre: "swiss" };
}

function marquerLiens(lettres, liens) {
  if (!liens || !liens.length) return;
  for (const l of lettres) {
    const cx = l.x + l.l / 2, cy = l.y - 0.3 * l.taille;
    const k = liens.find((r) => cx >= r.x0 && cx <= r.x1 && cy >= r.y0 - 1 && cy <= r.y1 + 1);
    if (k) l.lien = k.uri;
  }
}
/* Un trait juste sous la ligne de base, sous des lettres : un soulignement. */
function souligner(lettres, traits) {
  const h = traits.filter((t) => Math.abs(t.y1 - t.y0) <= 1.2 && t.x1 - t.x0 < 600);
  if (!h.length || h.length > 3000) return;
  for (const l of lettres) {
    if (!plein(l)) continue;
    const cx = l.x + l.l / 2;
    for (const t of h) {
      const dy = t.y0 - l.y;
      if (dy >= -0.02 * l.taille && dy <= 0.28 * l.taille && cx >= t.x0 - 0.5 && cx <= t.x1 + 0.5) { l.souligne = true; t.sous = (t.sous || 0) + 1; break; }
    }
  }
  // un trait qui ne souligne qu'une ou deux lettres d'une longue ligne : un filet, pas un soulignement
  for (const l of lettres) if (l.souligne) {
    const t = h.find((t) => t.y0 - l.y >= -0.02 * l.taille && t.y0 - l.y <= 0.28 * l.taille && l.x + l.l / 2 >= t.x0 - 0.5 && l.x + l.l / 2 <= t.x1 + 0.5);
    if (t && t.sous * l.taille * 0.45 < (t.x1 - t.x0) * 0.5) l.souligne = false;
  }
}

/* Les images qui comptent : ni minuscules, ni pochoirs, ni le fond d'une page
   déjà pleine de texte (un scan dont la couche de texte suffit, un décor). */
function imagesUtiles(page, nLettres) {
  const aire = page.largeur * page.hauteur;
  const vues = new Set();
  const out = [];
  for (const im of page.images) {
    if (im.masque) continue;
    const x0 = Math.max(0, im.x0), y0 = Math.max(0, im.y0), x1 = Math.min(page.largeur, im.x1), y1 = Math.min(page.hauteur, im.y1);
    const l = x1 - x0, h = y1 - y0;
    if (l < 10 || h < 10) continue;
    if (l * h > 0.82 * aire && nLettres >= 40) continue;
    const cle = (im.cle ?? "e") + "|" + Math.round(x0) + "|" + Math.round(y0);
    if (vues.has(cle)) continue;
    vues.add(cle);
    out.push({ flux: im.flux, cle: im.cle, x0, y0, x1, y1, page: page.index });
  }
  return out;
}
/* Le même logo en haut ou en bas de la plupart des pages : un en-tête. */
function retirerLogos(parPage) {
  if (parPage.length < 2) return;
  const compte = new Map();
  for (const p of parPage) for (const im of p.images) if (im.cle != null && (im.y1 < 0.14 * p.page.hauteur || im.y0 > 0.86 * p.page.hauteur)) compte.set(im.cle, (compte.get(im.cle) || 0) + 1);
  const seuil = Math.max(2, Math.ceil(0.5 * parPage.length));
  for (const p of parPage) p.images = p.images.filter((im) => !(compte.get(im.cle) >= seuil && (im.y1 < 0.14 * p.page.hauteur || im.y0 > 0.86 * p.page.hauteur)));
}

function zoneTexte(blocs, corps, page) {
  const ps = blocs.filter((b) => b.genre === "para" && Math.abs(b.taille - corps) < 0.15 * corps);
  if (!ps.length) return { x0: 0.1 * page.largeur, x1: 0.9 * page.largeur, bords: [0.1 * page.largeur] };
  const x0s = ps.map((p) => p.x0).sort((a, b) => a - b), x1s = ps.map((p) => p.x1).sort((a, b) => a - b);
  // les bords gauches des colonnes : là où commencent beaucoup de paragraphes
  const bords = [];
  for (const x of grouper(x0s, 1.5)) if (ps.filter((p) => Math.abs(p.x0 - x) <= 1.5).length >= Math.max(2, 0.2 * ps.length)) bords.push(x);
  return { x0: x0s[Math.floor(x0s.length * 0.1)], x1: x1s[Math.min(x1s.length - 1, Math.floor(x1s.length * 0.9))], bords: bords.length ? bords : [x0s[0]] };
}

/* Les titres : un paragraphe court plus grand que le texte courant (les
   tailles, de la plus grande à la plus petite, donnent les niveaux), ou une
   ligne seule en gras, à la taille du texte. */
function classer(pages, corps) {
  const paras = pages.flatMap((p) => p.blocs.filter((b) => b.genre === "para" && !b.penche));
  const court = (b) => b.segs.length <= 3 && b.segs.reduce((n, s) => n + s.texte.length, 0) <= 180;
  const grands = paras.filter((b) => !b.segs[0].mono && court(b) && b.taille >= corps * 1.12 && /\p{L}/u.test(b.segs[0].texte));
  const tailles = grouper(grands.map((b) => b.taille), 0.6).sort((a, b) => b - a).slice(0, 5);
  for (const b of grands) {
    let n = 0;
    while (n + 1 < tailles.length && Math.abs(b.taille - tailles[n]) > Math.abs(b.taille - tailles[n + 1])) n++;
    b.niveau = n + 1;
  }
  for (const p of pages) p.blocs.forEach((b, i) => {
    if (b.genre !== "para" || b.niveau || b.penche || b.segs.length !== 1) return;
    const s = b.segs[0];
    const suivant = p.blocs[i + 1];
    if (s.gras && !s.mono && Math.abs(b.taille - corps) <= 0.15 * corps && s.texte.length <= 90 && /\p{L}/u.test(s.texte) && !/[.,;]$/.test(s.texte) &&
      !(suivant && suivant.genre === "para" && suivant.segs.every((x) => x.gras))) b.niveau = Math.min(6, tailles.length + 1);
  });
  // le premier niveau employé devient le niveau 1
  const niveaux = [...new Set(paras.filter((b) => b.niveau).map((b) => b.niveau))].sort((a, b) => a - b);
  for (const b of paras) if (b.niveau) b.niveau = niveaux.indexOf(b.niveau) + 1;
}

function alignement(b, zone) {
  if (b.segs.length === 0) return "gauche";
  const t = b.taille, cz = (zone.x0 + zone.x1) / 2, lz = zone.x1 - zone.x0;
  const centres = b.segs.every((s) => Math.abs((s.x0 + s.x1) / 2 - cz) < 1.5 * t) && b.segs.some((s) => s.x1 - s.x0 < 0.8 * lz) && b.x0 > zone.x0 + 2 * t;
  if (centres) return "centre";
  if (b.segs.every((s) => Math.abs(s.x1 - zone.x1) < 1.5 * t) && b.x0 > zone.x0 + 3 * t) return "droite";
  const droite = Math.max(...b.segs.map((s) => s.x1));
  if (b.segs.length >= 3 && b.segs.slice(0, -1).filter((s) => Math.abs(s.x1 - droite) < 1.2).length >= Math.max(2, b.segs.length - 2)) return "justifie";
  return "gauche";
}

/* Un bloc de travail → un ou plusieurs blocs du modèle. */
function finaliser(b, page, modele) {
  const boite = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
  if (b.genre === "image") { modele.stats.images++; return [{ type: "image", image: { flux: b.flux, cle: b.cle, page: b.page }, boite, l: b.x1 - b.x0, h: b.y1 - b.y0 }]; }
  if (b.genre === "tableau") {
    modele.stats.tableaux++;
    const lignes = b.lignes.map((l) => l.map((c) => (c.couvert ? c : { colspan: c.colspan, rowspan: c.rowspan, fond: c.fond || null, paras: paragraphesDeCase(c.segs) })));
    return [{ type: "tableau", lignes, largeurs: b.largeurs, boite, borde: b.borde }];
  }
  const zone = page.zone;
  if (b.segs[0].mono && !b.niveau && !b.marque) {
    const cw = 0.6 * b.taille;
    const x0 = Math.min(...b.segs.map((s) => s.x0));
    return [{ type: "code", lignes: b.segs.map((s) => " ".repeat(Math.max(0, Math.round((s.x0 - x0) / cw))) + texteDe(runsDe([s]))), boite, taille: b.taille }];
  }
  if (b.niveau) return [{ type: "titre", niveau: b.niveau, runs: runsDe(b.segs), boite, align: alignement(b, zone) }];
  if (b.marque) {
    return [{ type: "item", ordonnee: b.marque.ordonnee, genreNum: b.marque.type || null, marque: b.marque.mot, x: b.x0, taille: b.taille, runs: runsDe(b.segs, [...b.marque.mot].length), boite }];
  }
  const runs = runsDe(b.segs);
  if (!runs.length) return [];
  const retrait = b.segs.length > 1 && b.segs[0].x0 - b.segs[1].x0 > 0.8 * b.taille ? b.segs[0].x0 - b.segs[1].x0 : 0;
  const gauche = Math.min(...b.segs.slice(retrait ? 1 : 0).map((s) => s.x0));
  const bord = zone.bords.filter((x) => x <= gauche + 1.5).pop() ?? zone.x0;
  const marge = Math.max(0, gauche - bord);
  return [{ type: "para", runs, boite, align: alignement(b, zone), retrait: Math.round(retrait), marge: marge > 1.5 * b.taille ? Math.round(marge) : 0, penche: !!b.penche }];
}
function paragraphesDeCase(segs) {
  if (!segs.length) return [];
  const t = mediane(segs.map((s) => s.taille));
  const out = [];
  let cur = [segs[0]];
  for (let i = 1; i < segs.length; i++) {
    const a = segs[i - 1], s = segs[i];
    const nouveau = s.y - a.y > 1.6 * t || Math.abs(s.y - a.y) < 0.3 * t || marqueDe(s);
    if (nouveau) { out.push(cur); cur = [s]; } else cur.push(s);
  }
  out.push(cur);
  return out.map((ss) => runsDe(ss)).filter((r) => r.length);
}
function fusionnerCode(blocs) {
  const out = [];
  for (const b of blocs) {
    const d = out[out.length - 1];
    if (b.type === "code" && d && d.type === "code" && b.boite.y0 - d.boite.y1 < 1.6 * b.taille) { d.lignes.push(...b.lignes); d.boite.y1 = b.boite.y1; }
    else out.push(b);
  }
  return out;
}
/* Les éléments de liste qui se suivent forment une liste ; le niveau vient
   du retrait de la puce. */
function grouperListes(blocs) {
  const out = [];
  for (const b of blocs) {
    if (b.type !== "item") { out.push(b); continue; }
    const d = out[out.length - 1];
    const it = { ordonnee: b.ordonnee, genreNum: b.genreNum, marque: b.marque, runs: b.runs, x: b.x, taille: b.taille };
    if (d && d.type === "liste") { d.items.push(it); d.boite.y1 = b.boite.y1; d.boite.x1 = Math.max(d.boite.x1, b.boite.x1); }
    else out.push({ type: "liste", items: [it], boite: { ...b.boite } });
  }
  for (const b of out) if (b.type === "liste") {
    const t = mediane(b.items.map((i) => i.taille));
    const xs = grouper(b.items.map((i) => i.x), 0.9 * t);
    let prec = -1;
    for (const i of b.items) {
      i.niveau = xs.findIndex((x) => Math.abs(x - i.x) <= 0.9 * t + 0.01);
      // un niveau ne s'ouvre que sous le précédent : jamais deux d'un coup
      i.niveau = Math.max(0, Math.min(i.niveau, prec + 1, 5));
      prec = i.niveau;
      if (i.ordonnee) i.debut = numeroDe(i.marque, i.genreNum);
      delete i.x; delete i.taille;
    }
  }
  return out;
}
/* Le numéro qu'affiche une marque : « 3. » → 3, « c) » → 3, « iv. » → 4. */
function numeroDe(marque, genre) {
  const m = /[0-9]+|[a-zA-Z]+/.exec(marque);
  if (!m) return 1;
  const s = m[0];
  if (/^\d/.test(s)) return parseInt(s, 10) || 1;
  if (genre === "i" || genre === "I") {
    const V = { i: 1, v: 5, x: 10, l: 50, c: 100 };
    let n = 0;
    const t = s.toLowerCase();
    for (let k = 0; k < t.length; k++) { const v = V[t[k]] || 0, w = V[t[k + 1]] || 0; n += v < w ? -v : v; }
    return n || 1;
  }
  return s.toLowerCase().charCodeAt(0) - 96;
}

/* ── le texte « mis en page » : chaque ligne à sa place, en colonnes de caractères ── */
export function texteMisEnPage(lu) {
  const out = [];
  for (const page of lu) {
    const { droites } = preparer(page);
    const bs = bandes(droites);
    const t = mediane(droites.filter(plein).map((l) => l.taille)) || 10;
    const cw = 0.5 * t;
    const lignes = [];
    let yPrec = null;
    for (const b of bs) {
      const segs = segmenter(b);
      if (!segs.length) continue;
      if (yPrec !== null) for (let k = Math.round((b.y - yPrec) / (1.25 * t)) - 1; k > 0 && k < 4; k--) lignes.push("");
      yPrec = b.y;
      let s = "";
      for (const seg of segs) {
        const col = Math.max(s.length + (s ? 1 : 0), Math.round(seg.x0 / cw));
        s = s.padEnd(col, " ") + seg.texte;
      }
      lignes.push(s.replace(/\s+$/, ""));
    }
    const marge = Math.min(...lignes.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length), 99);
    out.push(lignes.map((l) => l.slice(Math.min(marge, l.length))).join("\n"));
  }
  return out.join("\n\n\f\n");
}

/* ── les lignes en cases (pour un tableur, quand le PDF n'a pas de tableau) ── */
export function lignesEnCases(lu) {
  const out = [];
  for (const page of lu) {
    const { droites } = preparer(page);
    const lignes = [];
    for (const b of bandes(droites)) {
      const segs = segmenter(b);
      if (segs.length) lignes.push(segs.map((s) => s.texte));
    }
    out.push({ page: page.index, lignes });
  }
  return out;
}
