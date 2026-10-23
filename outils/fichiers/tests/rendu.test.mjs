/* Le banc de ce que le moteur de rendu calcule sans canevas : les polices
   (codes → Unicode, largeurs, contours TrueType), les fonctions PDF
   (dégradés, encres), et deux outils de texte. Le dessin lui-même se
   compare à poppler dans Chromium (voir CLAUDE.md, « Valider le rendu »). */
import { readFileSync } from "node:fs";
import { DocumentPdf } from "../src/pdf/lecture.js";
import { Dict, Flux, N } from "../src/pdf/objets.js";
import { chargerPolice, unicodeDuNom, lireCMap } from "../src/pdf/glyphes.js";
import { creerFonction } from "../src/pdf/fonctions.js";
import { MOTS } from "../src/mots.js";
import { nettoyerTexte } from "../src/outils/divers.js";

export const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const presque = (a, b) => Math.abs(a - b) < 1e-6;

test("polices : une TrueType embarquée (LibreOffice) — Unicode, largeurs, contours", async () => {
  const doc = await DocumentPdf.ouvrir(new Uint8Array(readFileSync(new URL("./pdf/police.pdf", import.meta.url))));
  const res = await doc.resoudre((await doc.pages())[0].herite.Resources);
  const polices = await doc.resoudre(res.get("Font"));
  // LibreOffice renumérote les lettres d'un sous-ensemble : 1, 2, 3… ; la
  // /ToUnicode dit lesquelles, la cmap (3,0) de la police dessine
  const textes = [];
  for (const [, r] of polices) {
    const d = await doc.resoudre(r);
    const p = await chargerPolice(doc, d);
    ok(p.tt && p.upem > 0, p.nom + " : la police embarquée est lue");
    let t = "";
    for (let c = 1; c <= d.get("LastChar"); c++) {
      t += p.unicode(c);
      ok(p.largeur(c) > 0, p.nom + " : largeur du code " + c);
      if (p.unicode(c).trim()) ok(p.gid(c) > 0 && p.tt.contours(p.gid(c)).length > 0, p.nom + " : contours de « " + p.unicode(c) + " »");
    }
    const e = [...Array(d.get("LastChar") + 1).keys()].find((c) => p.unicode(c) === "e");
    const contours = p.tt.contours(p.gid(e));
    ok(contours[0][0] === "M" && contours.some((x) => x[0] === "Q") && contours.some((x) => x[0] === "Z"), p.nom + " : le « e » en courbes quadratiques fermées");
    textes.push(t);
  }
  ok(textes.sort().join("|") === "Réseau|Élève :Zoé—12€", "les lettres des deux polices : " + textes.join("|"));
});

test("polices : noms de glyphes et CMap ToUnicode", async () => {
  ok(unicodeDuNom("eacute") === "é" && unicodeDuNom("Ccedilla") === "Ç" && unicodeDuNom("uni20AC") === "€", "noms accentués et uniXXXX");
  ok(unicodeDuNom("f_i") === "fi" && unicodeDuNom("a.sc") === "a" && unicodeDuNom("quoteright") === "’", "ligatures, variantes, ponctuation");
  const cmap = lireCMap(new TextEncoder().encode("1 begincodespacerange <0000> <FFFF> endcodespacerange\n2 beginbfchar <0003> <0020> <0024> <00E9> endbfchar\n1 beginbfrange <0010> <0012> <0041> endbfrange"));
  ok(cmap.espaces[0].n === 2, "codes sur deux octets");
  ok(cmap.uni.get(3) === " " && cmap.uni.get(0x24) === "é" && cmap.uni.get(0x12) === "C", "bfchar et bfrange : " + JSON.stringify([...cmap.uni]));
  // une police standard, non embarquée : les métriques d'Helvetica
  const p = await chargerPolice({ resoudre: async (x) => x }, new Dict({ Type: N("Font"), Subtype: N("Type1"), BaseFont: N("Helvetica"), Encoding: N("WinAnsiEncoding") }));
  ok(p.largeur(0x41) === 667 && p.unicode(0x9c) === "œ" && !p.tt, "Helvetica : A = 667, œ en WinAnsi");
});

test("fonctions PDF : exponentielle, assemblage, calculatrice PostScript", async () => {
  const doc = { resoudre: async (x) => x, decode: async (f) => f.donnees };
  const f2 = await creerFonction(doc, new Dict({ FunctionType: 2, Domain: [0, 1], C0: [1, 0, 0], C1: [0, 0, 1], N: 1 }));
  ok(f2([0.25]).every((v, i) => presque(v, [0.75, 0, 0.25][i])), "rouge → bleu au quart : " + f2([0.25]));
  const f3 = await creerFonction(doc, new Dict({ FunctionType: 3, Domain: [0, 1], Bounds: [0.5], Encode: [0, 1, 0, 1],
    Functions: [new Dict({ FunctionType: 2, C0: [0], C1: [1], N: 1 }), new Dict({ FunctionType: 2, C0: [1], C1: [0], N: 1 })] }));
  ok(presque(f3([0.25])[0], 0.5) && presque(f3([0.75])[0], 0.5) && presque(f3([0.5])[0], 1), "aller-retour : " + [f3([0.25]), f3([0.5]), f3([0.75])]);
  const ps = new Flux(new Dict({ FunctionType: 4, Domain: [0, 1], Range: [0, 1, 0, 1, 0, 1, 0, 1] }), new TextEncoder().encode("{ dup 0.5 gt { 1 exch sub } if 0 exch 0 exch 0 exch }"));
  const f4 = await creerFonction(doc, ps);
  ok(JSON.stringify(f4([0.8]).map((v) => Math.round(v * 10) / 10)) === "[0,0,0,0.2]" && presque(f4([0.3])[3], 0.3), "PostScript : " + f4([0.8]) + " / " + f4([0.3]));
});

test("texte copié d'un PDF : lignes, mots coupés, ligatures ; liste de mots de passe", () => {
  const brut = "Le protocole ARP asso-\ncie une adresse IP à une\nadresse MAC.\nIl est dé-\nfini dans la RFC 826.\n\n• premier point\n• second ﬁchier";
  const net = nettoyerTexte(brut);
  ok(net === "Le protocole ARP associe une adresse IP à une adresse MAC.\nIl est défini dans la RFC 826.\n\n• premier point\n• second fichier", "résultat : " + JSON.stringify(net));
  ok(MOTS.length >= 700 && MOTS.every((m) => /^[a-z]{3,10}$/.test(m)) && new Set(MOTS).size === MOTS.length, "mots de passe : " + MOTS.length + " mots distincts, sans accent");
});
