/* Comparer le TEXTE de deux PDF.

   Deux versions d'un même document (un rapport relu, un sujet corrigé) se
   ressemblent à l'œil : ce qu'on cherche, c'est la phrase qui a bougé. On
   relève donc le texte des deux, ligne par ligne, et l'on cherche leur plus
   longue suite commune : ce qui n'y est pas a été retiré ou ajouté.

   Ce que la comparaison ne voit pas, et c'est dit dans la page : une image
   remplacée, une couleur, une mise en page. Elle compare des mots. */

import { lirePage } from "./texte.js";

/* Les lignes d'une page relevée : les lettres rangées par ligne de base,
   puis de gauche à droite, une espace là où il y a un blanc. */
export function lignesDePage(page) {
  const lettres = page.lettres.filter((l) => l.u && l.u !== " " && l.u.trim() !== "");
  lettres.sort((a, b) => a.y - b.y || a.x - b.x);
  const lignes = [];
  for (const l of lettres) {
    const der = lignes[lignes.length - 1];
    if (der && Math.abs(l.y - der.y) <= Math.max(1.5, 0.45 * Math.min(l.taille, der.taille))) der.lettres.push(l);
    else lignes.push({ y: l.y, taille: l.taille, lettres: [l] });
  }
  const out = [];
  for (const g of lignes) {
    g.lettres.sort((a, b) => a.x - b.x);
    let s = "", fin = null;
    for (const l of g.lettres) {
      if (fin !== null && l.x - fin > 0.2 * l.taille) s += " ";
      s += l.u;
      fin = l.x + l.l;
    }
    s = s.replace(/\s+/g, " ").trim();
    if (s) out.push(s);
  }
  return out;
}

/* [{ page (1…), texte }] pour tout le document. */
export async function lignesDuDocument(doc, surPage = null) {
  const n = (await doc.pages()).length;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (surPage) await surPage(i, n);
    for (const texte of lignesDePage(await lirePage(doc, i))) out.push({ page: i + 1, texte });
  }
  return out;
}

/* La plus longue suite commune, puis ce qui reste de part et d'autre.
   Rend [{ type: "=" | "-" | "+", a?, b? }] : « - » n'existe que dans le
   premier document, « + » que dans le second. */
const cle = (s) => s.replace(/\s+/g, " ").trim();
export function comparerLignes(A, B) {
  const a = A.map((x) => cle(x.texte)), b = B.map((x) => cle(x.texte));
  // le début et la fin identiques ne coûtent rien : on ne compare que le milieu
  let debut = 0;
  while (debut < a.length && debut < b.length && a[debut] === b[debut]) debut++;
  let fa = a.length, fb = b.length;
  while (fa > debut && fb > debut && a[fa - 1] === b[fb - 1]) { fa--; fb--; }
  const n = fa - debut, m = fb - debut;
  const ops = [];
  for (let i = 0; i < debut; i++) ops.push({ type: "=", a: A[i], b: B[i] });
  if (n * m > 25e6) {
    // deux documents énormes et très différents : on le dit plutôt que de figer la page
    for (let i = debut; i < fa; i++) ops.push({ type: "-", a: A[i] });
    for (let j = debut; j < fb; j++) ops.push({ type: "+", b: B[j] });
  } else {
    const L = new Uint32Array((n + 1) * (m + 1)), W = m + 1;
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        L[i * W + j] = a[debut + i] === b[debut + j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[debut + i] === b[debut + j]) { ops.push({ type: "=", a: A[debut + i], b: B[debut + j] }); i++; j++; }
      else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) { ops.push({ type: "-", a: A[debut + i] }); i++; }
      else { ops.push({ type: "+", b: B[debut + j] }); j++; }
    }
    while (i < n) ops.push({ type: "-", a: A[debut + i++] });
    while (j < m) ops.push({ type: "+", b: B[debut + j++] });
  }
  for (let k = 0; fa + k < a.length; k++) ops.push({ type: "=", a: A[fa + k], b: B[fb + k] });
  return ops;
}

export function bilan(ops) {
  const b = { egales: 0, retirees: 0, ajoutees: 0 };
  for (const o of ops) b[o.type === "=" ? "egales" : o.type === "-" ? "retirees" : "ajoutees"]++;
  return b;
}

/* Le rapport, en texte : seulement ce qui diffère, avec la page. */
export function rapportTexte(ops, nomA, nomB) {
  const b = bilan(ops);
  const out = ["Comparaison de deux PDF", "", "A : " + nomA, "B : " + nomB, "",
    b.retirees + " ligne(s) seulement dans A, " + b.ajoutees + " seulement dans B, " + b.egales + " identiques.", ""];
  if (!b.retirees && !b.ajoutees) out.push("Le texte des deux documents est identique.");
  for (const o of ops) {
    if (o.type === "-") out.push("- (A, page " + o.a.page + ") " + o.a.texte);
    else if (o.type === "+") out.push("+ (B, page " + o.b.page + ") " + o.b.texte);
  }
  return out.join("\n") + "\n";
}

/* Le même, en page HTML autonome : les lignes voisines restent visibles
   autour de chaque différence, pour s'y retrouver. */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function rapportHtml(ops, nomA, nomB, contexte = 2) {
  const b = bilan(ops);
  const garder = new Uint8Array(ops.length);
  ops.forEach((o, i) => { if (o.type !== "=") for (let k = Math.max(0, i - contexte); k <= Math.min(ops.length - 1, i + contexte); k++) garder[k] = 1; });
  let corps = "", trou = false;
  ops.forEach((o, i) => {
    if (!garder[i]) { if (!trou) { corps += '<p class="trou">…</p>'; trou = true; } return; }
    trou = false;
    const x = o.a || o.b;
    corps += '<p class="' + (o.type === "-" ? "moins" : o.type === "+" ? "plus" : "egal") + '"><span>' + (o.type === "=" ? "" : o.type === "-" ? "A" : "B")
      + " p. " + x.page + "</span>" + esc(x.texte) + "</p>";
  });
  if (!b.retirees && !b.ajoutees) corps = '<p class="egal">Le texte des deux documents est identique.</p>';
  return '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + "<title>Comparaison de deux PDF</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#1f2328}"
    + "h1{font-size:1.4rem}p{margin:.15rem 0;padding:.25rem .5rem;border-radius:4px}span{display:inline-block;min-width:4.5rem;font-size:.8em;color:#57606a}"
    + ".moins{background:#ffebe9}.plus{background:#dafbe1}.trou{color:#8c959f;text-align:center}.bilan{background:#f6f8fa;padding:.7rem}</style>"
    + "<h1>Comparaison de deux PDF</h1><p class=\"bilan\"><b>A</b> : " + esc(nomA) + "<br><b>B</b> : " + esc(nomB) + "<br>"
    + b.retirees + " ligne(s) seulement dans A (en rouge), " + b.ajoutees + " seulement dans B (en vert), " + b.egales + " identiques.</p>"
    + corps + "</html>\n";
}
