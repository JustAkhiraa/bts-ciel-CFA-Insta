/* Le banc du moteur PDF. Les fichiers de tests/pdf/ viennent d'AUTRES
   producteurs (reportlab, qpdf) : table xref classique ou en flux, flux
   d'objets, mise à jour incrémentale, table cassée, quatre générations de
   chiffrement. Chaque opération est relue par notre lecteur ; le banc
   externe (poppler, qpdf, pypdf) est rejoué à la main avant publication. */
import { readFileSync } from "node:fs";
import { DocumentPdf } from "../src/pdf/lecture.js";
import { Dict, Flux, Nom, Ref, Chaine } from "../src/pdf/objets.js";
import * as Op from "../src/pdf/operations.js";

export const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const fichier = (n) => new Uint8Array(readFileSync(new URL("./pdf/" + n, import.meta.url)));
const ouvrir = (n, mdp) => DocumentPdf.ouvrir(fichier(n), { motDePasse: mdp });

/* Le texte (brut) du contenu d'une page : ce que dessinent ses opérateurs. */
async function contenu(doc, i) {
  const p = (await doc.pages())[i];
  let c = await doc.resoudre(p.dict.get("Contents"));
  if (!Array.isArray(c)) c = [c];
  let s = "";
  for (const x of c) { const f = await doc.resoudre(x); if (f instanceof Flux) s += new TextDecoder("latin1").decode(await doc.decode(f)) + "\n"; }
  return s;
}

test("lecture : xref classique, flux d'objets, incrémental, pivoté, paysage", async () => {
  for (const [n, pages] of [["simple3.pdf", 3], ["dix.pdf", 10], ["objstm10.pdf", 10], ["pivote.pdf", 3], ["paysage2.pdf", 2], ["images.pdf", 2]]) {
    const d = await ouvrir(n);
    ok((await d.pages()).length === pages, n + " : " + (await d.pages()).length + " pages au lieu de " + pages);
    ok(!d.repare, n + " n'aurait pas dû être réparé");
  }
  const o = await ouvrir("objstm10.pdf");
  ok([...o.xref.values()].some((e) => e.type === 2), "objstm10 : des objets rangés dans des flux d'objets");
  ok((await contenu(o, 7)).includes("(Page 8 de dix.pdf)"), "objstm10 : contenu de la page 8");
  const inc = await ouvrir("incremental.pdf");
  ok((await Op.lireMetadonnees(inc)).Title === "Titre mis a jour", "la mise à jour incrémentale l'emporte : " + JSON.stringify(await Op.lireMetadonnees(inc)));
  const piv = await ouvrir("pivote.pdf");
  const t = await piv.taillePage((await piv.pages())[1]);
  ok(t.rotation === 90 && Math.round(t.largeur) === 842 && Math.round(t.hauteur) === 595, "page pivotée : " + JSON.stringify(t));
});

test("réparation : une table xref fausse n'empêche pas d'ouvrir", async () => {
  const d = await ouvrir("casse.pdf");
  ok(d.repare, "marqué réparé");
  ok((await d.pages()).length === 3, "3 pages retrouvées");
  ok((await contenu(d, 2)).includes("(Page 3 de simple3.pdf)"), "contenu intact");
});

test("chiffrement : RC4 40 et 128, AES-128, AES-256 — utilisateur, propriétaire, vide, faux", async () => {
  for (const n of ["rc4_40.pdf", "aes256_vide.pdf"]) {
    const d = await ouvrir(n, "");
    ok((await d.pages()).length === 3 && (await contenu(d, 0)).includes("(Page 1 de simple3.pdf)"), n + " s'ouvre sans mot de passe");
  }
  for (const n of ["rc4_128.pdf", "aes128.pdf", "aes256.pdf"]) {
    let refuse = null;
    try { await ouvrir(n, ""); } catch (e) { refuse = e; }
    ok(refuse && refuse.motDePasse, n + " demande un mot de passe");
    let faux = null;
    try { await ouvrir(n, "pas-le-bon"); } catch (e) { faux = e; }
    ok(faux && /incorrect/.test(faux.message), n + " refuse un faux mot de passe");
    for (const mdp of ["secret", "proprio"]) {
      const d = await ouvrir(n, mdp);
      ok((await contenu(d, 1)).includes("(Page 2 de simple3.pdf)"), n + " déchiffré avec « " + mdp + " »");
      ok((await Op.lireMetadonnees(d)).Title === "Essai", n + " : métadonnées déchiffrées");
    }
  }
});

test("extraire, réordonner, dupliquer une page", async () => {
  const d = await ouvrir("simple3.pdf");
  const out = await DocumentPdf.ouvrir(await Op.reecrire(d, { selection: [2, 0, 0] }));
  ok((await out.pages()).length === 3, "3 pages");
  ok((await contenu(out, 0)).includes("Page 3") && (await contenu(out, 1)).includes("Page 1") && (await contenu(out, 2)).includes("Page 1"), "ordre 3, 1, 1");
  const p = await out.pages();
  ok(p[1].ref.num !== p[2].ref.num, "la page dupliquée est un objet à part");
});

test("fusionner trois fichiers de producteurs différents", async () => {
  const [a, b, c] = [await ouvrir("simple3.pdf"), await ouvrir("objstm10.pdf"), await ouvrir("paysage2.pdf")];
  const octets = await Op.fusionner([{ doc: a }, { doc: b, selection: Op.lirePlages("8-10", 10) }, { doc: c }]);
  const out = await DocumentPdf.ouvrir(octets);
  const P = await out.pages();
  ok(P.length === 8, P.length + " pages");
  ok((await contenu(out, 3)).includes("Page 8 de dix.pdf") && (await contenu(out, 5)).includes("Page 10 de dix.pdf"), "pages 8 à 10 du deuxième");
  const t = await out.taillePage(P[7]);
  ok(t.largeur > t.hauteur, "la dernière, en paysage, le reste");
  ok(!new TextDecoder("latin1").decode(octets).includes("/Parent " + "null"), "pas de parent nul");
});

test("plages de pages : « 1-3, 5, 8-fin », à l'envers, et les erreurs", () => {
  ok(Op.lirePlages("1-3, 5, 8-fin", 10).join() === "0,1,2,4,7,8,9", "plages");
  ok(Op.lirePlages("3-1", 5).join() === "2,1,0", "à l'envers");
  ok(Op.lirePlages("-2", 5).join() === "0,1" && Op.lirePlages("4-", 5).join() === "3,4", "bornes ouvertes");
  let e = null; try { Op.lirePlages("12", 10); } catch (x) { e = x; }
  ok(e && /hors du document/.test(e.message), "page hors du document");
  e = null; try { Op.lirePlages("a-b", 10); } catch (x) { e = x; }
  ok(e, "écriture invalide");
});

test("pivoter, recadrer", async () => {
  const d = await ouvrir("pivote.pdf");
  const out = await DocumentPdf.ouvrir(await Op.pivoter(d, 90));
  const P = await out.pages();
  ok(P[0].dict.get("Rotate") === 90 && P[1].dict.get("Rotate") === 180, "90° de plus partout : " + P.map((p) => p.dict.get("Rotate")));
  const r = await DocumentPdf.ouvrir(await Op.recadrer(await ouvrir("simple3.pdf"), { haut: 50, bas: 50, gauche: 20, droite: 20 }));
  const cb = (await r.pages())[0].dict.get("CropBox");
  ok(cb && Math.round(cb[0]) === 20 && Math.round(cb[3]) === 792, "CropBox : " + cb);
});

test("numéroter, filigraner, écrire : un contenu ajouté, l'ancien intact", async () => {
  const d = await ouvrir("pivote.pdf");
  const n = await DocumentPdf.ouvrir(await Op.numeroter(d, { modele: "Page {n} sur {total}" }));
  ok((await contenu(n, 1)).includes("(Page 2 sur 3) Tj"), "numéro de la page 2");
  ok((await contenu(n, 1)).includes("(Page 2 de simple3.pdf)"), "le contenu d'origine reste");
  ok(/0 1 -1 0 [\d.]+ 0 cm/.test(await contenu(n, 1)), "la page pivotée est numérotée à l'endroit");
  const f = await DocumentPdf.ouvrir(await Op.filigraner(await ouvrir("simple3.pdf"), { texte: "COPIE" }));
  const res = await f.resoudre((await f.pages())[0].dict.get("Resources"));
  ok(res.get("ExtGState") && res.get("ExtGState").get("CielGS").get("ca") === 0.18 && (await contenu(f, 0)).includes("(COPIE) Tj"), "filigrane transparent");
  const t = await DocumentPdf.ouvrir(await Op.poserTextes(await ouvrir("simple3.pdf"), [{ page: 0, x: 100, y: 500, texte: "Lu et approuvé\nJean Dupont" }]));
  const c0 = await contenu(t, 0);
  ok(c0.includes("(Lu et approuv\\351) Tj") && c0.includes("(Jean Dupont) Tj"), "texte posé, accent en WinAnsi : " + c0.slice(-200));
  ok(!(await contenu(t, 1)).includes("Dupont"), "les autres pages ne bougent pas");
});

test("protéger en AES-256 puis rouvrir ; déverrouiller un PDF protégé", async () => {
  const p = await Op.proteger(await ouvrir("simple3.pdf"), "motdepasse");
  let e = null; try { await DocumentPdf.ouvrir(p); } catch (x) { e = x; }
  ok(e && e.motDePasse, "sans mot de passe : refusé");
  const d = await DocumentPdf.ouvrir(p, { motDePasse: "motdepasse" });
  ok(d.dechiffreur.R === 6 && (await contenu(d, 2)).includes("(Page 3 de simple3.pdf)"), "rouvert avec le mot de passe, contenu lisible");
  const libre = await Op.deverrouiller(await ouvrir("aes256.pdf", "secret"));
  const l = await DocumentPdf.ouvrir(libre);
  ok(!l.dechiffreur && (await l.pages()).length === 3 && (await contenu(l, 0)).includes("Page 1"), "déverrouillé : s'ouvre sans mot de passe");
});

test("images → PDF : un JPEG inséré tel quel, un PNG transparent avec masque", async () => {
  const jpeg = fichier("photo.jpg");
  const w = 40, h = 30, px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[4 * i] = 200; px[4 * i + 1] = 50; px[4 * i + 2] = 50; px[4 * i + 3] = i % w < 20 ? 255 : 80; }
  const octets = await Op.imagesVersPdf([{ type: "jpeg", octets: jpeg }, { type: "rgba", largeur: w, hauteur: h, pixels: px }], { format: "A4", marge: 30 });
  const d = await DocumentPdf.ouvrir(octets);
  const im = await Op.listerImages(d);
  ok(im.length === 2, im.length + " images");
  ok(im[0].flux.dict.get("Filter").nom === "DCTDecode" && im[0].flux.donnees.length === jpeg.length && im[0].flux.donnees.every((x, i) => x === jpeg[i]), "JPEG identique, octet pour octet");
  ok(im[1].flux.dict.get("SMask") instanceof Ref, "transparence : un SMask");
  const t = await d.taillePage((await d.pages())[0]);
  ok(t.largeur > t.hauteur, "photo plus large que haute : page en paysage");
  const px2 = await Op.pixelsImage(d, im[1].flux);
  ok(px2.largeur === 40 && px2.rgba[0] === 200 && px2.rgba[1] === 50, "pixels relus");
});

test("lister les images d'un PDF d'un autre producteur, et relire leurs pixels", async () => {
  const d = await ouvrir("images.pdf");
  const im = await Op.listerImages(d);
  ok(im.length === 2, im.length + " images");
  const filtres = im.map((x) => { const f = x.flux.dict.get("Filter"); return (Array.isArray(f) ? f.map((y) => y.nom) : [f && f.nom]).join("+"); });
  ok(filtres.some((f) => f.includes("DCTDecode")), "une image JPEG : " + filtres);
  const autre = im.find((x) => !filtres[im.indexOf(x)].includes("DCT"));
  const px = await Op.pixelsImage(d, autre.flux);
  ok(px && px.largeur === 160 && px.hauteur === 120, "l'autre se décode : " + (px && px.largeur + "×" + px.hauteur));
});

test("métadonnées : lire, écrire, effacer", async () => {
  const d = await ouvrir("simple3.pdf");
  ok((await Op.lireMetadonnees(d)).Author === "Banc BTS CIEL", "auteur lu");
  const m = await DocumentPdf.ouvrir(await Op.ecrireMetadonnees(d, { Title: "Rapport de stage — Été", Author: "Élise" }));
  const lu = await Op.lireMetadonnees(m);
  ok(lu.Title === "Rapport de stage — Été" && lu.Author === "Élise", "écrites en UTF-16 : " + JSON.stringify(lu));
  const v = await Op.lireMetadonnees(await DocumentPdf.ouvrir(await Op.ecrireMetadonnees(d, null)));
  ok(!v.Title && !v.Author && v.Producer, "effacées (seul le producteur reste) : " + JSON.stringify(v));
});

test("compresser : une image remplacée par une version plus petite", async () => {
  const d = await ouvrir("images.pdf");
  const petit = fichier("photo.jpg").slice(0, 600);       // un « JPEG » factice plus petit, pour le banc
  const r = await Op.compresser(d, async ({ jpeg }) => (jpeg ? null : { octets: petit, largeur: 160, hauteur: 120 }));
  const o = await DocumentPdf.ouvrir(r.octets);
  const im = await Op.listerImages(o);
  ok(im.length === 2 && im.some((x) => x.flux.donnees.length === 600), "l'image Flate est remplacée");
  ok(r.imagesApres < r.imagesAvant, "le total des images baisse : " + r.imagesAvant + " → " + r.imagesApres);
});
