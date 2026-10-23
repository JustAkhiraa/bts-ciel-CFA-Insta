/* Les outils d'images : tout passe par le canevas du navigateur (décoder,
   redessiner, réencoder), sauf le nettoyage EXIF d'un JPEG ou d'un PNG,
   qui retire les métadonnées sans toucher aux pixels. */

import { esc, taille, pourcent, nomSortie, decoderImage, dessinerReduit, encoder, canevas, EXTENSION } from "../aides.js";
import { lireExif, nettoyerJpeg, nettoyerPng, avecOrientation } from "../exif.js";

const IMAGES = { types: ["image"], multiple: true, min: 1, accepte: "image/*", libelle: "Choisir des images" };
const MIME_DE = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };

/* Les formats que CE navigateur sait écrire (Safari n'écrit pas le WebP, peu écrivent l'AVIF). */
let formatsEcrits = null;
function formats() {
  if (formatsEcrits) return formatsEcrits;
  const c = canevas(2, 2);
  formatsEcrits = ["jpg", "png"].concat(["webp", "avif"].filter((f) => c.toDataURL(MIME_DE[f]).startsWith("data:" + MIME_DE[f])));
  return formatsEcrits;
}
const choixFormat = (nom, avecGarder) => '<label class="af-champ"><span>Format</span><select name="' + nom + '">' +
  (avecGarder ? '<option value="garder">Le même qu\'avant</option>' : "") +
  formats().map((f) => '<option value="' + f + '">' + f.toUpperCase() + ({ jpg: " (photos)", png: " (sans perte, transparence)", webp: " (moderne, léger)", avif: " (très léger)" }[f]) + "</option>").join("") +
  "</select></label>";
/* Le format de sortie : celui demandé, ou celui d'origine s'il sait s'écrire (sinon JPG). */
function formatSortie(choix, f) {
  if (choix && choix !== "garder") return choix;
  const e = EXTENSION[f.type];
  return formats().includes(e) ? e : f.type === "gif" || f.type === "bmp" || f.type === "ico" || f.type === "svg" ? "png" : "jpg";
}
async function enregistrer(c, ext, qualite) {
  return encoder(c, MIME_DE[ext], ext === "png" ? undefined : qualite);
}
/* Redessiner chaque image : « faire(img, f) » rend { canevas, ext, qualite, note } */
async function pourChaque(ctx, faire) {
  const out = [];
  for (const [k, f] of ctx.valides.entries()) {
    ctx.statut("Image " + (k + 1) + " / " + ctx.valides.length + "…");
    const img = await decoderImage(f.octets, f.type);
    try {
      const r = await faire(img, f);
      if (r.blob) { out.push(r); continue; }
      const blob = await enregistrer(r.canevas, r.ext, r.qualite);
      out.push({ nom: nomSortie(f.nom, r.suffixe || "", r.ext), blob, note: (r.note ? r.note + " · " : "") + r.canevas.width + " × " + r.canevas.height + " px" });
      r.canevas.width = r.canevas.height = 0;
    } finally { img.fermer(); }
    await ctx.souffler();
  }
  return out;
}
const qualite = (defaut = 82) => '<label class="af-champ"><span>Qualité (JPG, WebP) : <output name="q-v">' + defaut + '</output> %</span><input type="range" name="q" min="30" max="100" value="' + defaut + '"></label>';
const brancherQualite = (ctx) => { const r = ctx.q('[name="q"]'); if (r) r.addEventListener("input", () => { ctx.q('[name="q-v"]').textContent = r.value; }); };

/* ── convertir ── */
const convertir = {
  id: "convertir", titre: "Convertir des images", resume: "PNG ↔ JPG ↔ WebP : changer le format d'une ou de cent images d'un coup.",
  mots: "png jpg jpeg webp avif gif bmp format transformer heic",
  description: "Le JPG convient aux photos, le PNG aux captures d'écran et aux logos (net, transparence gardée), le WebP aux deux, en plus léger. Une transparence passée en JPG devient blanche.",
  entree: IMAGES,
  options: () => '<div class="af-ligne">' + choixFormat("format") + qualite(88) + "</div>",
  brancher: brancherQualite,
  bouton: "Convertir",
  nomZip: "images-converties",
  executer: (ctx) => pourChaque(ctx, (img) => {
    const ext = ctx.val("format");
    const c = canevas(img.largeur, img.hauteur);
    const x = c.getContext("2d");
    if (ext === "jpg") { x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height); }
    x.drawImage(img.source, 0, 0, c.width, c.height);
    return { canevas: c, ext, qualite: ctx.val("q") / 100 };
  }),
};

/* ── compresser ── */
const compresserImage = {
  id: "compresser-image", titre: "Compresser des images", resume: "Alléger des photos pour un mail, un site, un dossier en ligne — avant / après affichés.",
  mots: "reduire alleger poids taille optimiser compression photo mo ko",
  description: "Deux leviers : la taille en pixels (un téléphone fait des photos de 4000 px, un écran en montre 1920) et la qualité JPG. Une image qui grossirait est gardée telle quelle.",
  entree: IMAGES,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Taille maximale</span><select name="max"><option value="0">Garder la taille</option><option value="2560">2560 px</option><option value="1920" selected>1920 px (écran)</option><option value="1280">1280 px (mail, site)</option><option value="800">800 px (vignette)</option></select></label>' +
    choixFormat("format", true) + qualite(75) + "</div>",
  brancher: brancherQualite,
  bouton: "Compresser",
  nomZip: "images-compressees",
  async executer(ctx) {
    let avant = 0, apres = 0;
    const out = await pourChaque(ctx, async (img, f) => {
      const max = +ctx.val("max") || Infinity;
      const k = Math.min(1, max / Math.max(img.largeur, img.hauteur));
      let ext = formatSortie(ctx.val("format"), f);
      if (ext === "png" && ctx.val("format") === "garder" && f.type !== "png") ext = "jpg";
      const c = dessinerReduit(img, img.largeur * k, img.hauteur * k, { fond: ext === "jpg" ? "#ffffff" : null });
      const blob = await enregistrer(c, ext, ctx.val("q") / 100);
      avant += f.taille;
      if (blob.size >= f.taille && k === 1) {
        apres += f.taille;
        return { nom: f.nom, blob: new Blob([f.octets], { type: blob.type }), note: "déjà optimisée, gardée telle quelle" };
      }
      apres += blob.size;
      return { nom: nomSortie(f.nom, "leger", ext), blob, note: taille(f.taille) + " → " + taille(blob.size) + " (−" + pourcent(f.taille, blob.size) + " %) · " + c.width + " × " + c.height + " px" };
    });
    return { fichiers: out, resume: "<b>" + taille(avant) + " → " + taille(apres) + "</b> au total (−" + pourcent(avant, apres) + " %)." };
  },
};

/* ── redimensionner ── */
const redimensionner = {
  id: "redimensionner", titre: "Redimensionner", resume: "Changer la taille en pixels : un pourcentage, une largeur, ou des dimensions exactes.",
  mots: "taille pixels agrandir reduire dimension largeur hauteur resize photo identite",
  description: "Les proportions sont gardées, sauf si vous imposez largeur ET hauteur (l'image est alors recadrée au centre pour ne pas être déformée).",
  entree: IMAGES,
  options: () => '<fieldset><legend>Nouvelle taille</legend><div class="af-choix">' +
    '<label><input type="radio" name="mode" value="pourcent" checked> En %</label><label><input type="radio" name="mode" value="largeur"> Largeur</label>' +
    '<label><input type="radio" name="mode" value="exact"> Largeur × hauteur</label></div></fieldset><div class="af-ligne">' +
    '<label class="af-champ" data-pour="pourcent"><span>Pourcentage</span><input type="number" name="pc" value="50" min="1" max="400"></label>' +
    '<label class="af-champ" data-pour="largeur exact" hidden><span>Largeur (px)</span><input type="number" name="l" value="1200" min="1" max="16000"></label>' +
    '<label class="af-champ" data-pour="exact" hidden><span>Hauteur (px)</span><input type="number" name="h" value="800" min="1" max="16000"></label>' +
    choixFormat("format", true) + "</div>",
  brancher(ctx) {
    ctx.reglages.addEventListener("change", () => { for (const e of ctx.qa("[data-pour]")) e.hidden = !e.dataset.pour.split(" ").includes(ctx.val("mode")); });
  },
  bouton: "Redimensionner",
  nomZip: "images-redimensionnees",
  executer: (ctx) => pourChaque(ctx, (img, f) => {
    const mode = ctx.val("mode");
    const ext = formatSortie(ctx.val("format"), f);
    let l, h;
    if (mode === "pourcent") { const k = (ctx.val("pc") || 100) / 100; l = img.largeur * k; h = img.hauteur * k; }
    else if (mode === "largeur") { l = ctx.val("l") || img.largeur; h = (img.hauteur * l) / img.largeur; }
    else {
      l = ctx.val("l") || img.largeur; h = ctx.val("h") || img.hauteur;
      // remplir le cadre sans déformer : on coupe ce qui dépasse, au centre
      const k = Math.max(l / img.largeur, h / img.hauteur);
      const c = dessinerReduit(img, l, h, { fond: ext === "jpg" ? "#ffffff" : null, transformer: (x, src) => {
        x.drawImage(src, (l - img.largeur * k) / 2, (h - img.hauteur * k) / 2, img.largeur * k, img.hauteur * k);
      } });
      return { canevas: c, ext, qualite: 0.9, suffixe: Math.round(l) + "x" + Math.round(h) };
    }
    if (l * h > 16384 * 16384 / 2) throw new Error("image trop grande pour le navigateur");
    return { canevas: dessinerReduit(img, l, h, { fond: ext === "jpg" ? "#ffffff" : null }), ext, qualite: 0.9, suffixe: Math.round(l) + "x" + Math.round(h) };
  }),
};

/* ── recadrer une image ── */
class Cadreur {
  constructor(zone, img, url) {
    this.img = img;
    this.ratio = 0;
    zone.innerHTML = '<div class="af-recadre"><img alt="L\'image à recadrer" src="' + url + '"><div class="af-cadre"><i data-c="nw"></i><i data-c="ne"></i><i data-c="sw"></i><i data-c="se"></i></div></div><p class="af-aide af-cadre-taille"></p>';
    this.el = zone.querySelector(".af-recadre");
    this.cadre = zone.querySelector(".af-cadre");
    this.info = zone.querySelector(".af-cadre-taille");
    this.r = { x: 0.08, y: 0.08, l: 0.84, h: 0.84 };             // en fractions de l'image
    for (const [c, s] of [["nw", "left:-7px;top:-7px;cursor:nwse-resize"], ["ne", "right:-7px;top:-7px;cursor:nesw-resize"], ["sw", "left:-7px;bottom:-7px;cursor:nesw-resize"], ["se", "right:-7px;bottom:-7px;cursor:nwse-resize"]]) this.cadre.querySelector('[data-c="' + c + '"]').style.cssText = s;
    this.el.querySelector("img").addEventListener("load", () => this.poser());
    new ResizeObserver(() => this.poser()).observe(this.el);
    this.cadre.addEventListener("pointerdown", (ev) => this.glisser(ev));
  }
  imposer(ratio) {
    this.ratio = ratio;
    if (ratio) {
      const R = (ratio * this.img.hauteur) / this.img.largeur;       // le ratio en fractions
      let l = Math.min(0.9, 0.9 * R), h = l / R;
      if (h > 0.9) { h = 0.9; l = h * R; }
      this.r = { x: (1 - l) / 2, y: (1 - h) / 2, l, h };
    }
    this.poser();
  }
  poser() {
    const { x, y, l, h } = this.r;
    Object.assign(this.cadre.style, { left: x * 100 + "%", top: y * 100 + "%", width: l * 100 + "%", height: h * 100 + "%" });
    this.info.textContent = "Zone gardée : " + Math.round(l * this.img.largeur) + " × " + Math.round(h * this.img.hauteur) + " px";
  }
  glisser(ev) {
    ev.preventDefault();
    this.cadre.setPointerCapture(ev.pointerId);
    const coin = ev.target.dataset.c || null;
    const b = this.el.getBoundingClientRect();
    const d = { x: ev.clientX, y: ev.clientY, ...this.r };
    const R = this.ratio ? (this.ratio * this.img.hauteur) / this.img.largeur : 0;
    const bouger = (e) => {
      const dx = (e.clientX - d.x) / b.width, dy = (e.clientY - d.y) / b.height;
      let { x, y, l, h } = d;
      if (!coin) { x = Math.max(0, Math.min(1 - l, x + dx)); y = Math.max(0, Math.min(1 - h, y + dy)); }
      else {
        if (coin.includes("e")) l = Math.min(1 - x, Math.max(0.03, d.l + dx));
        if (coin.includes("w")) { const nx = Math.max(0, Math.min(d.x + d.l - 0.03, d.x + dx)); l = d.l + d.x - nx; x = nx; }
        if (coin.includes("s")) h = Math.min(1 - y, Math.max(0.03, d.h + dy));
        if (coin.includes("n")) { const ny = Math.max(0, Math.min(d.y + d.h - 0.03, d.y + dy)); h = d.h + d.y - ny; y = ny; }
        if (R) {
          h = l / R;
          if (coin.includes("n")) y = d.y + d.h - h;
          if (y < 0 || y + h > 1) return;
        }
      }
      this.r = { x, y, l, h };
      this.poser();
    };
    const fin = () => { this.cadre.removeEventListener("pointermove", bouger); this.cadre.removeEventListener("pointerup", fin); };
    this.cadre.addEventListener("pointermove", bouger);
    this.cadre.addEventListener("pointerup", fin);
  }
}
const recadrerImage = {
  id: "recadrer-image", titre: "Recadrer une image", resume: "Garder seulement une partie d'une photo : format libre, carré, 16/9, photo d'identité…",
  mots: "rogner couper cadrer crop carre portrait identite zone",
  description: "Tirez les coins du cadre, déplacez-le en le glissant. Les proportions imposées gardent le cadre au bon format.",
  entree: { ...IMAGES, multiple: false, libelle: "Choisir une image" },
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Proportions</span><select name="ratio"><option value="0">Libres</option><option value="1">Carré 1:1</option>' +
    '<option value="1.3333">4:3</option><option value="0.75">3:4</option><option value="1.7778">16:9</option><option value="0.5625">9:16 (story)</option><option value="0.7714">Photo d\'identité 35×45</option><option value="0.7071">A4 portrait</option></select></label>' +
    choixFormat("format", true) + "</div>",
  brancher(ctx) {
    ctx.q('[name="ratio"]').addEventListener("change", () => ctx.cadreur && ctx.cadreur.imposer(+ctx.val("ratio")));
  },
  surFichiers(ctx) {
    const f = ctx.premier;
    if (!f) { ctx.zone.innerHTML = ""; ctx.cadreur = null; return; }
    ctx.cadreur = new Cadreur(ctx.zone, f, ctx.url(new Blob([f.octets])));
    ctx.cadreur.imposer(+ctx.val("ratio"));
  },
  bouton: "Recadrer",
  executer: (ctx) => pourChaque(ctx, (img, f) => {
    const { x, y, l, h } = ctx.cadreur.r;
    const ext = formatSortie(ctx.val("format"), f);
    const c = canevas(l * img.largeur, h * img.hauteur);
    const g = c.getContext("2d");
    if (ext === "jpg") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(img.source, x * img.largeur, y * img.hauteur, l * img.largeur, h * img.hauteur, 0, 0, c.width, c.height);
    return { canevas: c, ext, qualite: 0.92, suffixe: "recadre" };
  }),
};

/* ── pivoter, retourner ── */
const pivoterImage = {
  id: "pivoter-image", titre: "Pivoter, retourner", resume: "Tourner des photos d'un quart de tour, ou les retourner en miroir.",
  mots: "tourner rotation miroir retourner symetrie sens couche",
  description: "Les boutons s'appliquent à toutes les images choisies ; l'aperçu montre le résultat avant d'enregistrer.",
  entree: IMAGES,
  options: () => '<div class="af-ligne af-gauche"><button type="button" class="af-bouton af-second" data-t="g">↺ Gauche</button><button type="button" class="af-bouton af-second" data-t="d">↻ Droite</button>' +
    '<button type="button" class="af-bouton af-second" data-t="h">⇆ Miroir</button><button type="button" class="af-bouton af-second" data-t="v">⇅ Haut-bas</button></div>',
  brancher(ctx) {
    ctx.geste = { angle: 0, h: false, v: false };
    ctx.reglages.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-t]");
      if (!b) return;
      const g = ctx.geste;
      if (b.dataset.t === "g") g.angle = (g.angle + 270) % 360;
      if (b.dataset.t === "d") g.angle = (g.angle + 90) % 360;
      // un miroir après un quart de tour : c'est l'autre axe à l'écran
      if (b.dataset.t === "h") { if (g.angle % 180) g.v = !g.v; else g.h = !g.h; }
      if (b.dataset.t === "v") { if (g.angle % 180) g.h = !g.h; else g.v = !g.v; }
      pivoterImage.apercu(ctx);
    });
  },
  apercu(ctx) {
    const g = ctx.geste;
    for (const i of ctx.qa(".af-vignettes img")) i.style.transform = "rotate(" + g.angle + "deg) scale(" + (g.h ? -1 : 1) + "," + (g.v ? -1 : 1) + ")";
  },
  surFichiers(ctx) {
    ctx.zone.innerHTML = '<div class="af-vignettes af-vignettes-pivot">' + ctx.valides.slice(0, 30).map((f) => '<figure><img alt="' + esc(f.nom) + '" src="' + ctx.url(new Blob([f.octets])) + '"></figure>').join("") + "</div>";
    pivoterImage.apercu(ctx);
  },
  bouton: "Enregistrer",
  nomZip: "images-pivotees",
  executer: (ctx) => {
    const g = ctx.geste;
    if (!g.angle && !g.h && !g.v) throw new Error("rien à faire : tournez ou retournez d'abord avec les boutons");
    return pourChaque(ctx, (img, f) => {
      const tourne = g.angle % 180 !== 0;
      const ext = formatSortie("garder", f);
      const c = canevas(tourne ? img.hauteur : img.largeur, tourne ? img.largeur : img.hauteur);
      const x = c.getContext("2d");
      x.translate(c.width / 2, c.height / 2);
      x.rotate((g.angle * Math.PI) / 180);
      x.scale(g.h ? -1 : 1, g.v ? -1 : 1);
      x.drawImage(img.source, -img.largeur / 2, -img.hauteur / 2);
      return { canevas: c, ext, qualite: 0.92, suffixe: "pivote" };
    });
  },
};

/* ── ce que dit une photo : EXIF, GPS ── */
const exif = {
  id: "exif", titre: "Effacer la position d'une photo", resume: "Voir et retirer ce qu'une photo dit de vous : lieu GPS, téléphone, date.",
  mots: "exif gps localisation position vie privee metadonnees anonymiser telephone",
  description: "Un téléphone écrit dans chaque photo la marque de l'appareil, la date et souvent <b>l'endroit exact</b> de la prise. Pour un JPEG ou un PNG, ces informations sont retirées sans toucher à l'image : les pixels restent identiques.",
  entree: IMAGES,
  surFichiers(ctx) {
    const lignes = ctx.valides.map((f) => {
      const e = f.type === "jpeg" ? lireExif(f.octets) || {} : {};
      const gps = e.gps ? '<span class="af-ko">📍 ' + e.gps.lat.toFixed(5) + ", " + e.gps.lon.toFixed(5) + "</span>" : '<span class="af-ok">aucune</span>';
      const app = [e.marque, e.modele].filter(Boolean).join(" ");
      return "<tr><td>" + esc(f.nom) + "</td><td>" + gps + "</td><td>" + esc(app || "—") + "</td><td>" + esc(e.date || "—") + "</td></tr>";
    });
    ctx.zone.innerHTML = lignes.length ? '<table class="af-tableau"><tr><th>Photo</th><th>Position</th><th>Appareil</th><th>Date</th></tr>' + lignes.join("") + "</table>" +
      (ctx.valides.some((f) => f.type === "jpeg" && (lireExif(f.octets) || {}).gps) ? '<p class="af-alerte">Ces coordonnées situent la prise de vue à quelques mètres près — votre domicile, votre lycée. Retirez-les avant de publier.</p>' : "") : "";
  },
  bouton: "Retirer les métadonnées",
  nomZip: "photos-nettoyees",
  async executer(ctx) {
    const out = [];
    for (const f of ctx.valides) {
      if (f.type === "jpeg") {
        const e = lireExif(f.octets) || {};
        const r = nettoyerJpeg(f.octets);
        out.push({ nom: nomSortie(f.nom, "sans-gps", "jpg"), blob: new Blob([avecOrientation(r.octets, e.orientation)], { type: "image/jpeg" }), note: taille(r.retires) + " de métadonnées retirées, image intacte" });
      } else if (f.type === "png") {
        const r = nettoyerPng(f.octets);
        out.push({ nom: nomSortie(f.nom, "sans-meta", "png"), blob: new Blob([r.octets], { type: "image/png" }), note: r.retires ? taille(r.retires) + " de métadonnées retirées" : "rien à retirer" });
      } else {
        // les autres formats : réenregistrés (les métadonnées ne suivent pas)
        const img = await decoderImage(f.octets, f.type);
        const c = canevas(img.largeur, img.hauteur);
        c.getContext("2d").drawImage(img.source, 0, 0);
        img.fermer();
        const ext = formatSortie("garder", f);
        out.push({ nom: nomSortie(f.nom, "sans-meta", ext), blob: await enregistrer(c, ext, 0.92), note: "réenregistrée sans métadonnées" });
      }
    }
    return out;
  },
};

export const OUTILS = [convertir, compresserImage, redimensionner, recadrerImage, pivoterImage, exif];
