/* Les formats « texte » : texte brut, Markdown, page web, RTF, LaTeX,
   JSON, CSV. Chacun reçoit le modèle de structure.js (images déjà
   préparées) et rend une liste de fichiers [{ nom, octets, type }]. */

import { xml, utf8, px, twips, hex, base64, imagesDe, tailleImage, miseEnPage, couvertures, enteteGras, largeursDe, numero, blocs, texteDe } from "./commun.js";

const fichier = (nom, texte, type) => ({ nom, octets: typeof texte === "string" ? utf8(texte) : texte, type });
const imagesEnFichiers = (modele, dossier = "images/") => imagesDe(modele).map((d) => ({ nom: dossier + d.nom, octets: d.octets, type: d.mime }));

/* La numérotation des listes, niveau par niveau. */
function compteurs() {
  const c = [];
  return (it) => {
    c.length = it.niveau + 1;
    c[it.niveau] = c[it.niveau] === undefined ? (it.debut || 1) : c[it.niveau] + 1;
    return numero(c[it.niveau], it.genreNum);
  };
}

/* ── texte brut ── */
/* Un exposant ou un indice en texte brut : ses chiffres Unicode (2³², H₂O),
   ou « ^( ) » / « _( ) » quand il n'en a pas. */
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", "−": "⁻", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ" };
const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "-": "₋", "−": "₋", "(": "₍", ")": "₎" };
const brut = (runs) => runs.map((r) => {
  if (!r.pos) return r.t;
  const t = r.pos === "sup" ? SUP : SUB;
  return [...r.t].every((c) => t[c]) ? [...r.t].map((c) => t[c]).join("") : (r.pos === "sup" ? "^(" : "_(") + r.t + ")";
}).join("");
export function versTxt(modele, { base, sauts = false }) {
  const out = [];
  for (const { b, premierDePage } of blocs(modele)) {
    if (premierDePage && sauts) out.push("\f");
    if (b.type === "titre") { const t = brut(b.runs); out.push(t + (b.niveau <= 2 ? "\n" + (b.niveau === 1 ? "=" : "-").repeat(Math.min(72, [...t].length)) : "")); }
    else if (b.type === "para") out.push(brut(b.runs));
    else if (b.type === "liste") { const n = compteurs(); out.push(b.items.map((it) => "  ".repeat(it.niveau) + (it.ordonnee ? n(it) + ". " : "• ") + brut(it.runs)).join("\n")); }
    else if (b.type === "code") out.push(b.lignes.map((l) => "    " + l).join("\n"));
    else if (b.type === "tableau") out.push(tableauTexte(b));
    else if (b.type === "image") out.push("[image]");
  }
  return [fichier(base + ".txt", out.join("\n\n").replace(/\n\f\n/g, "\f\n") + "\n", "text/plain")];
}
function tableauTexte(b) {
  const g = couvertures(b.lignes);
  const t = g.map((l) => l.map((x) => (x.genre === "case" ? x.c.paras.map(brut).join(" / ") : "")));
  const nc = t[0].length;
  const w = [...Array(nc).keys()].map((j) => Math.min(40, Math.max(1, ...t.map((l) => [...l[j]].length))));
  const ligne = (l) => l.map((c, j) => c.padEnd(w[j])).join(" | ").replace(/\s+$/, "");
  const sep = w.map((x) => "-".repeat(x)).join("-+-");
  return t.map((l, i) => ligne(l) + (i === 0 && enteteGras(b.lignes) ? "\n" + sep : "")).join("\n");
}
export function versTxtPage(texte, { base }) {
  return [fichier(base + ".txt", texte + "\n", "text/plain")];
}

/* ── Markdown ── */
const mdEchapper = (s) => s.replace(/([\\`*_[\]<>])/g, "\\$1");
function mdEnLigne(runs, { tableau = false } = {}) {
  let s = "";
  for (const r of runs) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.t);
    let t = r.mono ? "`" + m[2].replace(/`/g, "ˋ") + "`" : mdEchapper(m[2]);
    if (!m[2]) { s += r.t; continue; }
    if (r.pos) t = "<" + r.pos + ">" + t + "</" + r.pos + ">";
    if (r.italique && !r.mono) t = "*" + t + "*";
    if (r.gras && !r.mono) t = "**" + t + "**";
    if (r.lien) t = "[" + t + "](" + r.lien.replace(/[()\s]/g, encodeURIComponent) + ")";
    s += m[1] + t + m[3];
  }
  s = s.replace(/\*\*\*\*/g, "");
  if (tableau) s = s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return s;
}
export function versMd(modele, { base }) {
  const out = [];
  for (const { b } of blocs(modele)) {
    if (b.type === "titre") out.push("#".repeat(Math.min(6, b.niveau)) + " " + mdEnLigne(b.runs.map((r) => ({ ...r, gras: false }))));
    else if (b.type === "para") out.push(mdEnLigne(b.runs).replace(/^(#|\d+\.\s|[-+*]\s|>)/, "\\$1"));
    else if (b.type === "liste") { const n = compteurs(); out.push(b.items.map((it) => "   ".repeat(it.niveau) + (it.ordonnee ? n(it) + ". " : "- ") + mdEnLigne(it.runs)).join("\n")); }
    else if (b.type === "code") out.push("```\n" + b.lignes.join("\n") + "\n```");
    else if (b.type === "tableau") {
      const g = couvertures(b.lignes);
      const tete = enteteGras(b.lignes);
      const t = g.map((l, i) => "| " + l.map((x) => (x.genre === "case" ? x.c.paras.map((r) => mdEnLigne(tete && i === 0 ? r.map((y) => ({ ...y, gras: false })) : r, { tableau: true })).join("<br>") : "")).join(" | ") + " |");
      t.splice(1, 0, "|" + g[0].map(() => " --- |").join(""));
      out.push(t.join("\n"));
    } else if (b.type === "image") out.push("![](images/" + b.image.donnees.nom + ")");
  }
  return [fichier(base + ".md", out.join("\n\n") + "\n", "text/markdown"), ...imagesEnFichiers(modele)];
}

/* ── HTML (et le XHTML de l'.epub) ── */
const ALIGN = { centre: "center", droite: "right", justifie: "justify" };
export function htmlEnLigne(runs, corps, { titre = false } = {}) {
  let s = "";
  for (const r of runs) {
    let t = xml(r.t);
    if (r.mono) t = "<code>" + t + "</code>";
    if (r.pos) t = "<" + r.pos + ">" + t + "</" + r.pos + ">";
    if (r.souligne && !r.lien) t = "<u>" + t + "</u>";
    if (r.italique) t = "<em>" + t + "</em>";
    if (r.gras && !titre) t = "<strong>" + t + "</strong>";
    const st = [];
    if (r.couleur) st.push("color:#" + r.couleur);
    if (!titre && !r.pos && corps && Math.abs(r.taille - corps) / corps > 0.15) st.push("font-size:" + (r.taille / corps).toFixed(2) + "em");
    if (st.length && r.t.trim()) t = '<span style="' + st.join(";") + '">' + t + "</span>";
    if (r.lien) t = '<a href="' + xml(r.lien) + '">' + t + "</a>";
    s += t;
  }
  return s.replace(/<\/strong><strong>/g, "").replace(/<\/em><em>/g, "");
}
function listeHtml(items, enLigne) {
  let s = "";
  const pile = [];
  const n = compteurs();
  for (const it of items) {
    const tag = it.ordonnee ? "ol" : "ul";
    const attr = it.ordonnee ? (it.genreNum && /^[aAiI]$/.test(it.genreNum) ? ' type="' + it.genreNum + '"' : "") + (it.debut > 1 ? ' start="' + it.debut + '"' : "") : "";
    n(it);
    while (pile.length > it.niveau + 1) s += "</li></" + pile.pop() + ">";
    if (pile.length === it.niveau) { s += "<" + tag + attr + ">"; pile.push(tag); }
    else if (pile[it.niveau] !== tag) { s += "</li></" + pile.pop() + "><" + tag + attr + ">"; pile.push(tag); }
    else s += "</li>";
    s += "<li>" + enLigne(it.runs);
  }
  while (pile.length) s += "</li></" + pile.pop() + ">";
  return s;
}
/* Un bloc en HTML. « source(donnees) » donne l'adresse d'une image. */
export function blocHtml(b, modele, { source, utile }) {
  const corps = modele.corps;
  const enLigne = (r) => htmlEnLigne(r, corps);
  if (b.type === "titre") {
    const n = Math.min(6, b.niveau);
    return "<h" + n + (ALIGN[b.align] && b.align !== "justifie" ? ' style="text-align:' + ALIGN[b.align] + '"' : "") + ">" + htmlEnLigne(b.runs, corps, { titre: true }) + "</h" + n + ">";
  }
  if (b.type === "para") {
    const st = [];
    if (ALIGN[b.align]) st.push("text-align:" + ALIGN[b.align]);
    if (b.marge) st.push("margin-left:" + px(b.marge) + "px");
    if (b.retrait) st.push("text-indent:" + px(b.retrait) + "px");
    return "<p" + (st.length ? ' style="' + st.join(";") + '"' : "") + ">" + enLigne(b.runs) + "</p>";
  }
  if (b.type === "liste") return listeHtml(b.items, enLigne);
  if (b.type === "code") return "<pre><code>" + xml(b.lignes.join("\n")) + "</code></pre>";
  if (b.type === "image") {
    const { l } = tailleImage(b, utile);
    return '<figure><img src="' + xml(source(b.image.donnees)) + '" alt="" width="' + px(l) + '"/></figure>';
  }
  if (b.type === "tableau") {
    const g = couvertures(b.lignes);
    const tete = enteteGras(b.lignes);
    const ls = largeursDe(b, utile);
    const tot = ls.reduce((a, x) => a + x, 0);
    let s = '<table class="' + (b.borde ? "borde" : "libre") + '"><colgroup>' + ls.map((x) => '<col style="width:' + ((100 * x) / tot).toFixed(1) + '%"/>').join("") + "</colgroup>";
    g.forEach((l, i) => {
      s += "<tr>";
      for (const x of l) {
        if (x.genre !== "case") continue;
        const c = x.c, tag = tete && i === 0 ? "th" : "td";
        s += "<" + tag + (c.colspan > 1 ? ' colspan="' + c.colspan + '"' : "") + (c.rowspan > 1 ? ' rowspan="' + c.rowspan + '"' : "") + (c.fond ? ' style="background:#' + c.fond + '"' : "") + ">" +
          c.paras.map((r) => htmlEnLigne(r, corps, { titre: tag === "th" })).join("<br/>") + "</" + tag + ">";
      }
      s += "</tr>";
    });
    return s + "</table>";
  }
  return "";
}
export const CSS_LECTURE = `body{margin:0;background:#fff;color:#1d1d1f;font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:46rem;margin:0 auto;padding:2rem 1.2rem 4rem}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.6em 0 .5em}h1{font-size:1.9em}h2{font-size:1.45em}h3{font-size:1.2em}
p{margin:0 0 .9em}figure{margin:1.2em 0}img{max-width:100%;height:auto}
pre{background:#f3f3f5;padding:.8em 1em;border-radius:6px;overflow-x:auto;font-size:.88em;line-height:1.45}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.95em}td,th{padding:.35em .55em;vertical-align:top;text-align:left}
table.borde td,table.borde th{border:1px solid #b9b9c0}table.libre td,table.libre th{border-bottom:1px solid #e3e3e8}
.saut{break-before:page;height:0;margin:0;border:0}
@media (prefers-color-scheme:dark){body{background:#17171a;color:#e8e8ec}pre{background:#24242a}table.borde td,table.borde th{border-color:#4a4a52}table.libre td,table.libre th{border-color:#33333a}a{color:#8ab4ff}}`;
export function versHtml(modele, { base, sauts = false }) {
  const mp = miseEnPage(modele);
  const corps = [];
  for (const { b, premierDePage } of blocs(modele)) {
    if (premierDePage && sauts) corps.push('<hr class="saut"/>');
    corps.push(blocHtml(b, modele, { source: (d) => "data:" + d.mime + ";base64," + base64(d.octets), utile: mp.utile }));
  }
  const html = '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + xml(modele.titre || base) + "</title>\n" +
    (modele.auteur ? '<meta name="author" content="' + xml(modele.auteur) + '">\n' : "") + "<style>\n" + CSS_LECTURE + "\n</style>\n</head>\n<body>\n<main>\n" + corps.join("\n") + "\n</main>\n</body>\n</html>\n";
  return [fichier(base + ".html", html, "text/html")];
}

/* ── RTF (Rich Text Format) : lu par tous les traitements de texte ── */
function rtfTexte(s) {
  let o = "";
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === "\\" || ch === "{" || ch === "}") o += "\\" + ch;
    else if (ch === "\n") o += "\\line ";
    else if (ch === "\t") o += "\\tab ";
    else if (c < 0x80) o += ch;
    else if (c > 0xffff) { const h = Math.floor((c - 0x10000) / 0x400) + 0xd800, l = ((c - 0x10000) % 0x400) + 0xdc00; o += "\\u" + (h - 65536) + "?\\u" + (l - 65536) + "?"; }
    else o += "\\u" + (c > 32767 ? c - 65536 : c) + "?";
  }
  return o;
}
export function versRtf(modele, { base, sauts = false }) {
  const mp = miseEnPage(modele);
  const couleurs = [];
  const cf = (h) => { if (!h) return 0; let k = couleurs.indexOf(h); if (k < 0) { couleurs.push(h); k = couleurs.length - 1; } return k + 1; };
  const enLigne = (runs) => runs.map((r) => {
    let p = "\\f" + (r.mono ? 1 : 0) + "\\fs" + Math.round(r.taille * 2);
    if (r.gras) p += "\\b";
    if (r.italique) p += "\\i";
    if (r.souligne || r.lien) p += "\\ul";
    if (r.pos === "sup") p += "\\super"; else if (r.pos === "sub") p += "\\sub";
    const k = cf(r.couleur);
    if (k) p += "\\cf" + k;
    const t = "{" + p + " " + rtfTexte(r.t) + "}";
    return r.lien ? '{\\field{\\*\\fldinst{HYPERLINK "' + rtfTexte(r.lien).replace(/"/g, "") + '"}}{\\fldrslt' + t + "}}" : t;
  }).join("");
  const JC = { centre: "\\qc", droite: "\\qr", justifie: "\\qj", gauche: "\\ql" };
  const out = [];
  for (const { b, premierDePage } of blocs(modele)) {
    if (premierDePage && sauts) out.push("\\page");
    if (b.type === "titre") out.push("\\pard\\plain\\s" + b.niveau + "\\outlinelevel" + (b.niveau - 1) + "\\keepn\\sb240\\sa120" + (JC[b.align] || "") + " " + enLigne(b.runs.map((r) => ({ ...r, gras: true }))) + "\\par");
    else if (b.type === "para") out.push("\\pard\\plain\\sa120" + (JC[b.align] || "") + (b.marge ? "\\li" + twips(b.marge) : "") + (b.retrait ? "\\fi" + twips(b.retrait) : "") + " " + enLigne(b.runs) + "\\par");
    else if (b.type === "liste") {
      const n = compteurs();
      for (const it of b.items) out.push("\\pard\\plain\\sa60\\li" + (360 * (it.niveau + 1)) + "\\fi-360 " + "{\\f0\\fs" + Math.round(modele.corps * 2) + " " + rtfTexte(it.ordonnee ? n(it) + "." : "•") + "\\tab}" + enLigne(it.runs) + "\\par");
    } else if (b.type === "code") out.push("\\pard\\plain\\sa120{\\f1\\fs" + Math.round((b.taille || 10) * 2) + " " + b.lignes.map(rtfTexte).join("\\line ") + "}\\par");
    else if (b.type === "image") {
      const d = b.image.donnees, { l, h } = tailleImage(b, mp.utile);
      out.push("\\pard\\plain\\sa120{\\pict" + (d.mime === "image/png" ? "\\pngblip" : "\\jpegblip") + "\\picw" + d.largeur + "\\pich" + d.hauteur + "\\picwgoal" + twips(l) + "\\pichgoal" + twips(h) + "\n" + hex(d.octets).replace(/(.{128})/g, "$1\n") + "\n}\\par");
    } else if (b.type === "tableau") {
      const g = couvertures(b.lignes);
      const ls = largeursDe(b, mp.utile);
      const bord = b.borde ? "\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10" : "";
      for (const l of g) {
        let def = "\\trowd\\trgaph80\\trleft0", x = 0, cont = "";
        l.forEach((c, j) => {
          x += ls[j] || ls[ls.length - 1];
          if (c.genre === "h") return;
          const span = c.c.colspan || 1;
          let fin = x;
          for (let k = 1; k < span && j + k < ls.length; k++) fin += ls[j + k];
          const vm = c.genre === "v" ? "\\clvmrg" : (c.c.rowspan || 1) > 1 ? "\\clvmgf" : "";
          def += vm + bord + (c.c.fond && c.genre === "case" ? "\\clcbpat" + cf(c.c.fond) : "") + "\\cellx" + twips(fin);
          cont += "\\pard\\intbl " + (c.genre === "case" ? c.c.paras.map(enLigne).join("\\line ") : "") + "\\cell ";
        });
        out.push(def + "\n" + cont + "\\row");
      }
      out.push("\\pard\\plain\\par");
    }
  }
  const police = (modele.famille || "Helvetica").replace(/[\\{};]/g, "");
  const tete = "{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1\n{\\fonttbl{\\f0\\fswiss\\fcharset0 " + police + ";}{\\f1\\fmodern\\fcharset0 Courier;}}\n" +
    "{\\colortbl;" + couleurs.map((h) => "\\red" + parseInt(h.slice(0, 2), 16) + "\\green" + parseInt(h.slice(2, 4), 16) + "\\blue" + parseInt(h.slice(4, 6), 16) + ";").join("") + "}\n" +
    "{\\stylesheet{\\s0 Normal;}" + [1, 2, 3, 4, 5, 6].map((n) => "{\\s" + n + "\\outlinelevel" + (n - 1) + " heading " + n + ";}").join("") + "}\n" +
    (modele.titre ? "{\\info{\\title " + rtfTexte(modele.titre) + "}" + (modele.auteur ? "{\\author " + rtfTexte(modele.auteur) + "}" : "") + "}\n" : "") +
    "\\paperw" + twips(mp.largeur) + "\\paperh" + twips(mp.hauteur) + (mp.paysage ? "\\landscape" : "") + "\\margl" + twips(mp.marge) + "\\margr" + twips(mp.marge) + "\\margt" + twips(mp.marge) + "\\margb" + twips(mp.marge) + "\n\\fs" + Math.round(modele.corps * 2) + "\n";
  return [fichier(base + ".rtf", tete + out.join("\n") + "\n}\n", "application/rtf")];
}

/* ── LaTeX ── */
const TEX_SIGNES = { "•": "\\textbullet{}", "→": "$\\rightarrow$", "←": "$\\leftarrow$", "⇒": "$\\Rightarrow$", "⇔": "$\\Leftrightarrow$", "↔": "$\\leftrightarrow$", "≤": "$\\leq$", "≥": "$\\geq$", "≠": "$\\neq$",
  "≈": "$\\approx$", "×": "$\\times$", "÷": "$\\div$", "±": "$\\pm$", "∞": "$\\infty$", "√": "$\\surd$", "€": "\\texteuro{}", "°": "\\textdegree{}", "…": "\\ldots{}", "–": "--", "—": "---", "’": "'", "‘": "`",
  "“": "``", "”": "''", "«": "\\guillemotleft{}", "»": "\\guillemotright{}", "©": "\\textcopyright{}", "®": "\\textregistered{}", "™": "\\texttrademark{}", "µ": "$\\mu$", "Ω": "$\\Omega$", "α": "$\\alpha$", "β": "$\\beta$",
  "π": "$\\pi$", "Δ": "$\\Delta$", "λ": "$\\lambda$", "θ": "$\\theta$", "σ": "$\\sigma$", "ε": "$\\varepsilon$", "φ": "$\\varphi$", "ω": "$\\omega$", "▪": "\\textbullet{}", "■": "\\textbullet{}", "◦": "$\\circ$", "✓": "$\\checkmark$" };
function tex(s) {
  let o = "";
  for (const ch of s) {
    if ("\\{}$&#%_".includes(ch)) o += ch === "\\" ? "\\textbackslash{}" : "\\" + ch;
    else if (ch === "~") o += "\\textasciitilde{}";
    else if (ch === "^") o += "\\textasciicircum{}";
    else if (TEX_SIGNES[ch]) o += TEX_SIGNES[ch];
    else if (ch.codePointAt(0) < 0x250 || /[œŒ]/.test(ch)) o += ch;
    else o += "?";
  }
  return o;
}
function texEnLigne(runs) {
  return runs.map((r) => {
    let t = tex(r.t);
    if (!r.t.trim()) return t;
    if (r.mono) t = "\\texttt{" + t + "}";
    if (r.pos === "sup") t = "\\textsuperscript{" + t + "}"; else if (r.pos === "sub") t = "\\textsubscript{" + t + "}";
    if (r.souligne && !r.lien) t = "\\underline{" + t + "}";
    if (r.italique) t = "\\textit{" + t + "}";
    if (r.gras) t = "\\textbf{" + t + "}";
    if (r.couleur) t = "\\textcolor[HTML]{" + r.couleur.toUpperCase() + "}{" + t + "}";
    if (r.lien) t = "\\href{" + r.lien.replace(/[\\{}%#]/g, (c) => "\\" + c) + "}{" + t + "}";
    return t;
  }).join("");
}
export function versTex(modele, { base, sauts = false }) {
  const mp = miseEnPage(modele);
  const SEC = ["section*", "subsection*", "subsubsection*", "paragraph*", "subparagraph*", "subparagraph*"];
  const out = [];
  for (const { b, premierDePage } of blocs(modele)) {
    if (premierDePage && sauts) out.push("\\newpage");
    if (b.type === "titre") out.push("\\" + SEC[Math.min(5, b.niveau - 1)] + "{" + texEnLigne(b.runs.map((r) => ({ ...r, gras: false, taille: 0 }))) + "}");
    else if (b.type === "para") out.push((b.align === "centre" ? "\\begin{center}\n" : b.align === "droite" ? "\\begin{flushright}\n" : "") + (b.retrait ? "" : "\\noindent ") + texEnLigne(b.runs) + (b.align === "centre" ? "\n\\end{center}" : b.align === "droite" ? "\n\\end{flushright}" : ""));
    else if (b.type === "liste") {
      let s = "";
      const pile = [];
      for (const it of b.items) {
        const env = it.ordonnee ? "enumerate" : "itemize";
        while (pile.length > it.niveau + 1) s += "\\end{" + pile.pop() + "}\n";
        if (pile.length === it.niveau + 1 && pile[it.niveau] !== env) s += "\\end{" + pile.pop() + "}\n";
        if (pile.length === it.niveau) { s += "\\begin{" + env + "}\n"; pile.push(env); }
        s += "\\item " + texEnLigne(it.runs) + "\n";
      }
      while (pile.length) s += "\\end{" + pile.pop() + "}\n";
      out.push(s.trim());
    } else if (b.type === "code") out.push("\\begin{verbatim}\n" + b.lignes.join("\n").replace(/\\end\{verbatim\}/g, "\\end {verbatim}") + "\n\\end{verbatim}");
    else if (b.type === "image") { const { l } = tailleImage(b, mp.utile); out.push("\\begin{center}\n\\includegraphics[width=" + Math.round(l) + "pt]{images/" + b.image.donnees.nom + "}\n\\end{center}"); }
    else if (b.type === "tableau") {
      const g = couvertures(b.lignes);
      const ls = largeursDe(b, mp.utile);
      const tot = ls.reduce((a, x) => a + x, 0);
      const col = (w) => "p{" + (0.94 * w / tot).toFixed(3) + "\\linewidth}";
      const v = b.borde ? "|" : "";
      let s = "\\noindent\\begin{tabular}{" + v + ls.map(col).join(v) + v + "}\n" + (b.borde ? "\\hline\n" : "");
      g.forEach((l, i) => {
        const cells = [];
        l.forEach((x, j) => {
          if (x.genre === "h") return;
          const span = x.genre === "case" ? x.c.colspan || 1 : x.c.colspan || 1;
          const t = x.genre === "case" ? x.c.paras.map(texEnLigne).join(" \\newline ") : "";
          if (span > 1) { let w = 0; for (let k = 0; k < span; k++) w += ls[j + k] || 0; cells.push("\\multicolumn{" + span + "}{" + v + col(w) + v + "}{" + t + "}"); }
          else cells.push(t);
        });
        s += cells.join(" & ") + " \\\\" + (b.borde || (i === 0 && enteteGras(b.lignes)) ? " \\hline" : "") + "\n";
      });
      out.push(s + "\\end{tabular}");
    }
  }
  const doc = "\\documentclass[11pt]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n\\usepackage{textcomp}\n\\usepackage[french]{babel}\n" +
    "\\usepackage[paperwidth=" + Math.round(mp.largeur) + "pt,paperheight=" + Math.round(mp.hauteur) + "pt,margin=" + Math.round(mp.marge) + "pt]{geometry}\n" +
    "\\usepackage{graphicx}\n\\usepackage[table]{xcolor}\n\\usepackage{amssymb}\n\\usepackage{hyperref}\n\\setlength{\\parskip}{0.6em}\n" +
    (modele.titre ? "\\title{" + tex(modele.titre) + "}\n" : "") + (modele.auteur ? "\\author{" + tex(modele.auteur) + "}\n" : "") +
    "\\begin{document}\n\n" + out.join("\n\n") + "\n\n\\end{document}\n";
  return [fichier(base + ".tex", doc, "application/x-tex"), ...imagesEnFichiers(modele)];
}

/* ── JSON : la structure telle que l'atelier l'a comprise ── */
export function versJson(modele, { base }) {
  const runs = (rs) => rs.map((r) => { const o = { texte: r.t }; for (const k of ["gras", "italique", "mono", "souligne"]) if (r[k]) o[k] = true; if (r.pos) o.position = r.pos === "sup" ? "exposant" : "indice"; if (r.lien) o.lien = r.lien; if (r.couleur) o.couleur = "#" + r.couleur; o.taille = r.taille; return o; });
  const boite = (b) => b ? [b.x0, b.y0, b.x1, b.y1].map((x) => Math.round(x * 10) / 10) : undefined;
  const bloc = (b) => {
    if (b.type === "titre") return { type: "titre", niveau: b.niveau, texte: texteDe(b.runs), morceaux: runs(b.runs), boite: boite(b.boite) };
    if (b.type === "para") return { type: "paragraphe", texte: texteDe(b.runs), alignement: b.align, morceaux: runs(b.runs), boite: boite(b.boite) };
    if (b.type === "liste") return { type: "liste", elements: b.items.map((i) => ({ niveau: i.niveau, numerote: i.ordonnee, marque: i.marque, texte: texteDe(i.runs) })), boite: boite(b.boite) };
    if (b.type === "code") return { type: "code", lignes: b.lignes, boite: boite(b.boite) };
    if (b.type === "image") return { type: "image", fichier: "images/" + b.image.donnees.nom, largeurPx: b.image.donnees.largeur, hauteurPx: b.image.donnees.hauteur, boite: boite(b.boite) };
    if (b.type === "tableau") return { type: "tableau", bordures: b.borde, lignes: b.lignes.map((l) => l.map((c) => (c.couvert ? null : { texte: c.paras.map(texteDe).join("\n"), ...(c.colspan > 1 ? { colonnes: c.colspan } : {}), ...(c.rowspan > 1 ? { lignes: c.rowspan } : {}) }))), boite: boite(b.boite) };
    return null;
  };
  const o = { titre: modele.titre, auteur: modele.auteur || undefined, unite: "point (1/72 de pouce), origine en haut à gauche", tailleTexte: modele.corps,
    pages: modele.pages.map((p) => ({ page: p.index + 1, largeur: Math.round(p.largeur * 10) / 10, hauteur: Math.round(p.hauteur * 10) / 10, blocs: p.blocs.map(bloc).filter(Boolean) })) };
  return [fichier(base + ".json", JSON.stringify(o, null, 2) + "\n", "application/json"), ...imagesEnFichiers(modele)];
}

/* ── CSV / TSV : une feuille par fichier ── */
export function versCsv(feuilles, { base, separateur = ";", tab = false }) {
  const sep = tab ? "\t" : separateur;
  const cellule = (t) => (tab ? t.replace(/[\t\n\r]+/g, " ") : /["\n\r]/.test(t) || t.includes(sep) ? '"' + t.replace(/"/g, '""') + '"' : t);
  return feuilles.map((f, k) => {
    const lignes = f.lignes.map((l) => l.map((c) => cellule(c ? c.texte : "")).join(sep));
    const nom = base + (feuilles.length > 1 ? "-" + (k + 1) : "") + (tab ? ".tsv" : ".csv");
    // le BOM : sans lui, un tableur sous Windows lit l'UTF-8 comme du Latin-1
    return fichier(nom, "\ufeff" + lignes.join("\r\n") + "\r\n", tab ? "text/tab-separated-values" : "text/csv");
  });
}
