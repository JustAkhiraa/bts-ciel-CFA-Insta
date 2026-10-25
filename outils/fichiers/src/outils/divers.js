/* Les utilitaires : QR codes (le moteur du salon de classe), archives ZIP,
   empreintes de fichiers, mots de passe, texte copié d'un PDF, Base64. */

import { encoder as encoderQr, versSvg } from "../../../salon/src/qr.js";
import { scanner as scannerQr, lireFichier as lireQrFichier } from "../../../salon/src/camera.js";
import { creerZip, lireZip } from "../zip.js";
import { md5 } from "../md5.js";
import { MOTS } from "../mots.js";
import { esc, taille, copier, telecharger, hasard, canevas, encoder } from "../aides.js";

const hex = (o) => Array.from(o, (b) => b.toString(16).padStart(2, "0")).join("");
const boutonCopier = (texte, libelle = "Copier") => '<button type="button" class="af-mini af-copier" data-copie="' + esc(texte) + '" title="' + libelle + '" aria-label="' + libelle + '">⧉</button>';
function brancherCopie(el, ctx) {
  el.addEventListener("click", async (ev) => {
    const b = ev.target.closest(".af-copier");
    if (!b) return;
    const ok = await copier(b.dataset.copie);
    if (ctx) ctx.statut(ok ? "Copié dans le presse-papiers." : "Copie impossible : sélectionnez le texte à la main.", !ok);
    b.textContent = ok ? "✓" : "⧉";
    setTimeout(() => { b.textContent = "⧉"; }, 1200);
  });
}

/* ── QR code : créer ── */
const echQr = (s) => String(s).replace(/([\\;,:"])/g, "\\$1");
const qrCreer = {
  id: "qr-creer", titre: "Créer un QR code", resume: "Un lien, un texte, le Wi-Fi de la maison, une carte de visite → un QR code à imprimer.",
  mots: "qrcode code barre lien wifi contact vcard flasher scanner",
  description: "Le QR code est fabriqué ici, sans service en ligne : rien de ce que vous tapez (le mot de passe du Wi-Fi !) ne quitte la page.",
  entree: null,
  options: () => '<div class="af-ligne"><label class="af-champ"><span>Contenu</span><select name="type"><option value="texte">Lien ou texte</option><option value="wifi">Accès Wi-Fi</option><option value="contact">Carte de visite</option><option value="mail">E-mail</option></select></label>' +
    '<label class="af-champ"><span>Résistance aux taches</span><select name="niveau"><option value="L">Faible (plus petit)</option><option value="M" selected>Moyenne</option><option value="Q">Forte</option><option value="H">Maximale</option></select></label></div>' +
    '<div data-pour="texte"><label class="af-champ"><span>Lien ou texte</span><textarea name="texte" rows="2" placeholder="https://…"></textarea></label></div>' +
    '<div data-pour="wifi" hidden class="af-ligne"><label class="af-champ"><span>Nom du réseau (SSID)</span><input type="text" name="ssid" autocomplete="off"></label>' +
    '<label class="af-champ"><span>Mot de passe</span><input type="text" name="wpass" autocomplete="off"></label>' +
    '<label class="af-champ"><span>Sécurité</span><select name="secu"><option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass">Aucune</option></select></label></div>' +
    '<div data-pour="contact" hidden class="af-ligne"><label class="af-champ"><span>Prénom Nom</span><input type="text" name="nom" autocomplete="off"></label>' +
    '<label class="af-champ"><span>Téléphone</span><input type="text" name="tel" autocomplete="off"></label><label class="af-champ"><span>E-mail</span><input type="text" name="email" autocomplete="off"></label></div>' +
    '<div data-pour="mail" hidden class="af-ligne"><label class="af-champ"><span>Destinataire</span><input type="text" name="dest" autocomplete="off"></label><label class="af-champ"><span>Objet</span><input type="text" name="objet" autocomplete="off"></label></div>' +
    '<div class="af-qr-apercu"></div>',
  message(ctx) {
    const t = ctx.val("type");
    if (t === "wifi") { const s = ctx.val("ssid"); return s ? "WIFI:T:" + ctx.val("secu") + ";S:" + echQr(s) + ";" + (ctx.val("secu") === "nopass" ? "" : "P:" + echQr(ctx.val("wpass")) + ";") + ";" : ""; }
    if (t === "contact") {
      const n = ctx.val("nom").trim();
      if (!n) return "";
      const p = n.split(/\s+/);
      return "BEGIN:VCARD\nVERSION:3.0\nN:" + (p.slice(1).join(" ") || "") + ";" + p[0] + "\nFN:" + n + (ctx.val("tel") ? "\nTEL:" + ctx.val("tel") : "") + (ctx.val("email") ? "\nEMAIL:" + ctx.val("email") : "") + "\nEND:VCARD";
    }
    if (t === "mail") return ctx.val("dest") ? "mailto:" + ctx.val("dest").trim() + (ctx.val("objet") ? "?subject=" + encodeURIComponent(ctx.val("objet")) : "") : "";
    return ctx.val("texte");
  },
  brancher(ctx) {
    const maj = () => {
      for (const e of ctx.qa("[data-pour]")) e.hidden = e.dataset.pour !== ctx.val("type");
      const m = qrCreer.message(ctx);
      const z = ctx.q(".af-qr-apercu");
      ctx.qr = null;
      if (!m) { z.innerHTML = ""; ctx.verifier(); return; }
      try {
        ctx.qr = encoderQr(m, { niveau: ctx.val("niveau") });
        z.innerHTML = '<div class="af-qr">' + versSvg(ctx.qr) + '</div><p class="af-aide">Version ' + ctx.qr.version + " — " + ctx.qr.taille + " × " + ctx.qr.taille + " modules, " + new TextEncoder().encode(m).length + " octets.</p>";
        ctx.statut("");
      } catch (e) { z.innerHTML = ""; ctx.statut(e.message, true); }
      ctx.verifier();
    };
    ctx.reglages.addEventListener("input", maj);
    ctx.reglages.addEventListener("change", maj);
  },
  pret: (ctx) => !!ctx.qr,
  bouton: "Télécharger (PNG et SVG)",
  sansSuite: true,
  async executer(ctx) {
    const qr = ctx.qr, marge = 4, T = qr.taille + 2 * marge, k = Math.max(4, Math.floor(1200 / T));
    const c = canevas(T * k, T * k);
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#000";
    for (let y = 0; y < qr.taille; y++) for (let i = 0; i < qr.taille; i++) if (qr.modules[y][i]) x.fillRect((i + marge) * k, (y + marge) * k, k, k);
    return [{ nom: "qr-code.png", blob: await encoder(c, "image/png"), note: "pour imprimer, envoyer" },
      { nom: "qr-code.svg", blob: new Blob([versSvg(qr)], { type: "image/svg+xml" }), note: "vectoriel, net à toute taille" }];
  },
};

/* ── QR code : lire ── */
function decrireQr(texte) {
  let h = '<div class="af-info-boite"><b>Contenu lu :</b><pre class="af-code af-pre">' + esc(texte) + "</pre>" + boutonCopier(texte);
  const wifi = /^WIFI:/i.test(texte) ? Object.fromEntries((texte.slice(5).match(/([A-Z]):((?:\\.|[^;])*)/gi) || []).map((p) => [p[0].toUpperCase(), p.slice(2).replace(/\\(.)/g, "$1")])) : null;
  if (wifi) h += "<p>Réseau Wi-Fi <b>" + esc(wifi.S || "?") + "</b>" + (wifi.P ? " — mot de passe : <code>" + esc(wifi.P) + "</code> " + boutonCopier(wifi.P, "Copier le mot de passe") : " (ouvert)") + "</p>";
  else if (/^https?:\/\//i.test(texte)) {
    let hote = "";
    try { hote = new URL(texte).hostname; } catch (e) { hote = "?"; }
    h += "<p>C'est un lien vers <b>" + esc(hote) + "</b>. Vérifiez cette adresse avant d'ouvrir : un QR code collé sur une affiche peut mener ailleurs que prévu.</p>" +
      '<p><a href="' + esc(texte) + '" target="_blank" rel="noopener noreferrer">Ouvrir le lien</a></p>';
  }
  return h + "</div>";
}
const qrLire = {
  id: "qr-lire", titre: "Lire un QR code", resume: "Avec la caméra, ou dans une photo / capture d'écran — sans application.",
  mots: "scanner flasher qrcode camera decoder lire",
  description: "Le décodage se fait ici même : l'image de la caméra ne sort pas de l'appareil. Un QR code dans une capture d'écran se lit aussi (choisissez l'image).",
  entree: null,
  sansBouton: true,
  options: () => '<div class="af-ligne af-gauche"><button type="button" class="af-bouton" data-q="camera">Ouvrir la caméra</button>' +
    '<label class="af-bouton af-second">Choisir une image<input type="file" accept="image/*" hidden data-q="image"></label></div>' +
    '<video class="af-video" playsinline muted hidden></video><div class="af-qr-resultat" aria-live="polite"></div>',
  brancher(ctx) {
    const video = ctx.q("video"), sortie = ctx.q(".af-qr-resultat");
    let scan = null;
    const arreter = () => { if (scan) scan.arreter(); scan = null; video.hidden = true; };
    ctx.surQuitter(arreter);
    brancherCopie(sortie, ctx);
    const montrer = (t) => { sortie.innerHTML = t ? decrireQr(t) : '<p class="af-alerte">Aucun QR code trouvé dans cette image. Recadrez-la sur le code, bien net.</p>'; };
    ctx.q('[data-q="camera"]').addEventListener("click", async () => {
      arreter();
      sortie.innerHTML = "";
      try {
        video.hidden = false;
        ctx.statut("Visez le QR code…");
        scan = await scannerQr(video, (t) => { video.hidden = true; scan = null; ctx.statut("Lu."); montrer(t); });
      } catch (e) { video.hidden = true; ctx.statut("Caméra indisponible : " + (e.name === "NotAllowedError" ? "accès refusé." : e.message) + " Choisissez plutôt une image.", true); }
    });
    ctx.q('[data-q="image"]').addEventListener("change", async (ev) => {
      const f = ev.target.files[0];
      ev.target.value = "";
      if (!f) return;
      arreter();
      ctx.statut("Lecture…");
      try { montrer(await lireQrFichier(f)); ctx.statut(""); } catch (e) { ctx.statut(e.message, true); }
    });
  },
};

/* ── ZIP ── */
const zipCreer = {
  id: "zip-creer", titre: "Créer un ZIP", resume: "Réunir plusieurs fichiers dans une archive, pour un dépôt qui n'en accepte qu'un.",
  mots: "zip archive compresser regrouper dossier envoyer depot",
  description: "Les fichiers déjà compressés (photos, PDF, vidéos) sont rangés tels quels : les recompresser ne gagnerait rien. Le texte, le code, les tableaux rétrécissent beaucoup.",
  entree: { types: ["tout"], multiple: true, min: 1, libelle: "Choisir des fichiers" },
  options: () => '<label class="af-champ"><span>Nom de l\'archive</span><input type="text" name="nom" value="archive" autocomplete="off"></label>',
  bouton: "Créer le ZIP",
  async executer(ctx) {
    const vus = new Map();
    const fichiers = ctx.valides.map((f) => {
      let nom = f.nom;
      const n = vus.get(nom) || 0;
      vus.set(f.nom, n + 1);
      if (n) nom = nom.replace(/(\.[^.]*)?$/, " (" + (n + 1) + ")$1");
      return { nom, octets: f.octets, date: f.fichier.lastModified ? new Date(f.fichier.lastModified) : new Date() };
    });
    const zip = await creerZip(fichiers);
    const nom = (ctx.val("nom").trim() || "archive").replace(/[\\/:*?"<>|]/g, "_").replace(/\.zip$/i, "") + ".zip";
    const total = ctx.valides.reduce((s, f) => s + f.taille, 0);
    return [{ nom, blob: zip, note: ctx.valides.length + " fichier(s), " + taille(total) + " → " + taille(zip.size) }];
  },
};
const zipOuvrir = {
  id: "zip-ouvrir", titre: "Ouvrir un ZIP", resume: "Voir ce que contient une archive et en sortir un fichier — même sur un téléphone.",
  mots: "dezipper decompresser extraire archive zip ouvrir word docx images",
  description: "Astuce : un document Word (.docx) ou PowerPoint (.pptx) est un ZIP — on y retrouve ses images d'origine, dans le dossier « media ».",
  entree: { types: ["zip", "bureautique"], multiple: false, min: 1, libelle: "Choisir une archive ZIP" },
  sansBouton: true,
  surFichiers(ctx) {
    const f = ctx.premier;
    if (!f) { ctx.zone.innerHTML = ""; return; }
    let entrees;
    try { entrees = lireZip(f.octets).filter((e) => !e.dossier); }
    catch (e) { ctx.zone.innerHTML = '<p class="af-alerte">' + esc(e.message) + "</p>"; return; }
    ctx.zone.innerHTML = '<p class="af-aide">' + entrees.length + " fichier(s) — " + taille(entrees.reduce((s, e) => s + e.taille, 0)) + " une fois décompressés.</p>" +
      '<table class="af-tableau"><tr><th>Fichier</th><th>Taille</th><th></th></tr>' +
      entrees.map((e, i) => "<tr><td><code>" + esc(e.nom) + "</code>" + (e.chiffre ? ' <span class="af-ko">🔒</span>' : "") + "</td><td>" + taille(e.taille) + '</td><td><button type="button" class="af-mini" data-i="' + i + '" aria-label="Télécharger ' + esc(e.nom) + '">⤓</button></td></tr>').join("") + "</table>";
    ctx.zone.onclick = async (ev) => {
      const b = ev.target.closest("[data-i]");
      if (!b) return;
      const e = entrees[+b.dataset.i];
      try { telecharger(new Blob([await e.octets()]), e.nom.split("/").pop()); ctx.statut(""); }
      catch (err) { ctx.statut(err.message, true); }
    };
  },
};

/* ── empreintes ── */
const empreinte = {
  id: "empreinte", titre: "Empreinte d'un fichier", resume: "MD5, SHA-256… : vérifier qu'un téléchargement (une ISO, un logiciel) n'est ni abîmé ni trafiqué.",
  mots: "hash sha256 sha1 md5 checksum somme controle verifier integrite iso",
  description: "Un site sérieux publie l'empreinte de ses fichiers. Collez-la ici : si elle correspond, le fichier est exactement celui publié, au bit près.",
  entree: { types: ["tout"], multiple: true, min: 1, libelle: "Choisir un ou des fichiers" },
  options: () => '<label class="af-champ"><span>Empreinte attendue (facultatif)</span><input type="text" name="attendue" placeholder="collez ici l\'empreinte publiée" autocomplete="off" spellcheck="false"></label>',
  bouton: "Calculer",
  sansSuite: true,
  brancher: (ctx) => brancherCopie(ctx.resultatsEl, ctx),
  async executer(ctx) {
    const attendue = ctx.val("attendue").trim().toLowerCase().replace(/\s+/g, "");
    let h = "", trouve = false;
    for (const f of ctx.valides) {
      ctx.statut("Calcul pour « " + f.nom + " »…");
      const r = { "MD5": hex(md5(f.octets)) };
      for (const a of ["SHA-1", "SHA-256", "SHA-512"]) r[a] = hex(new Uint8Array(await crypto.subtle.digest(a, f.octets)));
      h += '<table class="af-tableau"><tr><th colspan="3">' + esc(f.nom) + " — " + taille(f.taille) + "</th></tr>" +
        Object.entries(r).map(([a, v]) => {
          const ok = attendue && v === attendue;
          if (ok) trouve = true;
          return "<tr" + (ok ? ' class="af-egal"' : "") + "><td>" + a + "</td><td><code>" + v + "</code></td><td>" + (ok ? '<span class="af-ok">✓ identique</span>' : boutonCopier(v)) + "</td></tr>";
        }).join("") + "</table>";
    }
    if (attendue) h = (trouve ? '<p class="af-ok">✓ L\'empreinte correspond : le fichier est intact.</p>' : '<p class="af-alerte"><b>✗ Aucune empreinte ne correspond.</b> Le fichier est abîmé, différent, ou l\'empreinte collée est incomplète.</p>') + h;
    return { fichiers: [], resume: h };
  },
};

/* ── mots de passe ── */
const SYMBOLES = "!#$%&*+-=?@_~.,;:";
function genererCaracteres(ctx) {
  let jeu = "";
  if (ctx.val("min")) jeu += "abcdefghijklmnopqrstuvwxyz";
  if (ctx.val("maj")) jeu += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (ctx.val("chi")) jeu += "0123456789";
  if (ctx.val("sym")) jeu += SYMBOLES;
  if (ctx.val("clair")) jeu = jeu.replace(/[lI1O0o]/g, "");
  if (!jeu) return null;
  const n = ctx.val("longueur") || 16;
  let s = "";
  for (let i = 0; i < n; i++) s += jeu[hasard(jeu.length)];
  return { mdp: s, bits: n * Math.log2(jeu.length) };
}
function genererPhrase(ctx) {
  const n = ctx.val("mots") || 5;
  const sep = ctx.val("sep");
  const mots = [];
  for (let i = 0; i < n; i++) {
    let m = MOTS[hasard(MOTS.length)];
    if (ctx.val("initiale")) m = m[0].toUpperCase() + m.slice(1);
    mots.push(m);
  }
  let bits = n * Math.log2(MOTS.length);
  if (ctx.val("chiffre")) { const k = hasard(mots.length); mots[k] += hasard(10); bits += Math.log2(10 * n); }
  return { mdp: mots.join(sep), bits };
}
function duree(bits) {
  // un pirate qui teste 10 milliards d'essais par seconde, en moyenne la moitié de l'espace
  const s = Math.pow(2, bits - 1) / 1e10;
  if (s < 1) return "moins d'une seconde";
  const u = [[31557600e9, "milliards d'années"], [31557600e6, "millions d'années"], [31557600e3, "milliers d'années"], [31557600, "ans"], [86400, "jours"], [3600, "heures"], [60, "minutes"], [1, "secondes"]];
  for (const [d, n] of u) if (s >= d) { const v = s / d; return (v >= 1000 ? "plus de 1 000" : Math.round(v)) + " " + n; }
  return "?";
}
const COURANTS = ["123456", "azerty", "motdepasse", "password", "soleil", "doudou", "loulou", "marseille", "chouchou", "qwerty", "abc123", "football", "iloveyou", "admin", "bonjour", "nicolas", "camille", "000000", "111111", "123123"];
function estimer(m) {
  if (!m) return null;
  let jeu = 0;
  if (/[a-z]/.test(m)) jeu += 26;
  if (/[A-Z]/.test(m)) jeu += 26;
  if (/\d/.test(m)) jeu += 10;
  if (/[^a-zA-Z\d]/.test(m)) jeu += 20;
  let bits = m.length * Math.log2(Math.max(jeu, 2));
  const bas = m.toLowerCase();
  const notes = [];
  if (COURANTS.some((c) => bas.includes(c))) { bits = Math.min(bits, 20); notes.push("contient un mot de passe parmi les plus utilisés"); }
  if (/(.)\1{2,}/.test(m)) { bits *= 0.8; notes.push("des caractères répétés"); }
  if (/(19|20)\d\d/.test(m)) { bits -= 7; notes.push("une année (date de naissance ?)"); }
  if (/^[A-Z]?[a-z]+\d{1,4}[!?.]?$/.test(m)) { bits = Math.min(bits, 34); notes.push("le schéma « Mot123! », le premier qu'essaient les pirates"); }
  if (m.length < 10) notes.push("moins de 10 caractères");
  return { bits: Math.max(0, bits), notes };
}
const motsDePasse = {
  id: "mots-de-passe", titre: "Mots de passe", resume: "Générer un mot de passe solide (ou une phrase facile à retenir), et tester le vôtre.",
  mots: "generateur password securite phrase passe aleatoire tester force",
  description: "Tirés par le générateur cryptographique du navigateur. Une <b>phrase de passe</b> de 5 mots au hasard est aussi solide qu'un charabia de 12 caractères, et bien plus facile à retenir.",
  entree: null,
  sansBouton: true,
  options: () => '<fieldset><legend>Type</legend><div class="af-choix"><label><input type="radio" name="mode" value="phrase" checked> Phrase de passe</label><label><input type="radio" name="mode" value="car"> Caractères</label></div></fieldset>' +
    '<div data-pour="phrase" class="af-ligne"><label class="af-champ"><span>Nombre de mots : <output name="mots-v">5</output></span><input type="range" name="mots" min="3" max="10" value="5"></label>' +
    '<label class="af-champ"><span>Séparateur</span><select name="sep"><option value="-">tiret -</option><option value=".">point .</option><option value=" ">espace</option><option value="_">souligné _</option><option value="">aucun</option></select></label>' +
    '<label class="af-case"><input type="checkbox" name="initiale" checked> Majuscules</label><label class="af-case"><input type="checkbox" name="chiffre" checked> Un chiffre</label></div>' +
    '<div data-pour="car" hidden class="af-ligne"><label class="af-champ"><span>Longueur : <output name="longueur-v">16</output></span><input type="range" name="longueur" min="8" max="64" value="16"></label>' +
    '<label class="af-case"><input type="checkbox" name="min" checked> a-z</label><label class="af-case"><input type="checkbox" name="maj" checked> A-Z</label>' +
    '<label class="af-case"><input type="checkbox" name="chi" checked> 0-9</label><label class="af-case"><input type="checkbox" name="sym" checked> !#$%</label>' +
    '<label class="af-case"><input type="checkbox" name="clair"> Sans l, I, 1, O, 0</label></div>' +
    '<div class="af-mdp-gen" aria-live="polite"></div><div class="af-go"><button type="button" class="af-bouton af-second" data-m="encore">↻ D\'autres</button></div>' +
    '<label class="af-champ af-tester"><span>Tester un mot de passe (il ne quitte pas la page)</span><input type="password" name="test" autocomplete="off" spellcheck="false"></label><div class="af-test-resultat"></div>',
  brancher(ctx) {
    const sortie = ctx.q(".af-mdp-gen");
    brancherCopie(sortie, ctx);
    const generer = () => {
      for (const e of ctx.qa("[data-pour]")) e.hidden = e.dataset.pour !== ctx.val("mode");
      ctx.q('[name="mots-v"]').textContent = ctx.val("mots");
      ctx.q('[name="longueur-v"]').textContent = ctx.val("longueur");
      const g = ctx.val("mode") === "car" ? genererCaracteres : genererPhrase;
      const liste = [];
      for (let i = 0; i < 5; i++) { const r = g(ctx); if (r) liste.push(r); }
      if (!liste.length) { sortie.innerHTML = '<p class="af-alerte">Cochez au moins une sorte de caractères.</p>'; return; }
      const bits = liste[0].bits;
      sortie.innerHTML = liste.map((r) => "<div><code>" + esc(r.mdp) + "</code>" + boutonCopier(r.mdp) + "</div>").join("") +
        '<p class="af-aide"><b>' + Math.round(bits) + " bits</b> d'entropie — " + (bits >= 70 ? '<span class="af-ok">très solide</span>' : bits >= 50 ? "solide" : '<span class="af-ko">faible</span>') +
        ". À 10 milliards d'essais par seconde, il faudrait en moyenne " + duree(bits) + " pour le trouver.</p>";
    };
    ctx.reglages.addEventListener("input", (ev) => { if (ev.target.name !== "test") generer(); });
    ctx.reglages.addEventListener("change", (ev) => { if (ev.target.name !== "test") generer(); });
    ctx.q('[data-m="encore"]').addEventListener("click", generer);
    ctx.q('[name="test"]').addEventListener("input", () => {
      const r = estimer(ctx.val("test"));
      ctx.q(".af-test-resultat").innerHTML = !r ? "" : '<p class="af-aide"><b>≈ ' + Math.round(r.bits) + " bits</b> — trouvé en " + duree(r.bits) + " environ." +
        (r.notes.length ? " Points faibles : " + esc(r.notes.join(" ; ")) + "." : "") + " (Estimation grossière : un vrai pirate essaie d'abord les mots du dictionnaire et les fuites connues.)</p>";
    });
    generer();
  },
};

/* ── nettoyer un texte copié d'un PDF ── */
export function nettoyerTexte(t, { lignes = true, cesures = true, espaces = true, ligatures = true } = {}) {
  let s = t.replace(/\r\n?/g, "\n").replace(/­/g, "");
  if (ligatures) s = s.replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/ﬀ/g, "ff").replace(/ﬃ/g, "ffi").replace(/ﬄ/g, "ffl").replace(/ﬅ|ﬆ/g, "st");
  if (cesures) s = s.replace(/(\p{L})-\n[ \t]*(\p{Ll})/gu, "$1$2");
  if (lignes) {
    const L = s.split("\n");
    const puce = /^\s*([-–•●▪*·]|\d+[.)]|[a-z][.)])\s/;
    let out = "";
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if (i === 0) { out = l; continue; }
      const avant = L[i - 1].trim();
      const fin = !avant || /[.!?:;»”…]$/.test(avant) || !l.trim() || puce.test(l);
      out += (fin ? "\n" : " ") + l;
    }
    s = out;
  }
  if (espaces) s = s.split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n");
  return s;
}
function statistiques(s) {
  const mots = (s.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  const min = (n) => (n < 1 ? "moins d'une minute" : Math.round(n) + " min");
  return mots + " mots · " + s.length + " caractères (" + s.replace(/\s/g, "").length + " sans espaces) · lecture : " + min(mots / 230) + " · à l'oral : " + min(mots / 130);
}
const textePropre = {
  id: "texte-propre", titre: "Nettoyer un texte copié", resume: "Recoller un texte copié d'un PDF (lignes coupées, mots coupés) et compter ses mots.",
  mots: "copier coller pdf retour ligne cesure compter mots caracteres compteur",
  description: "Un texte copié d'un PDF garde un retour à la ligne à chaque fin de ligne, et des mots coupés en deux. Collez-le : il revient en paragraphes. Le compteur de mots marche pour n'importe quel texte.",
  entree: null,
  sansBouton: true,
  options: () => '<label class="af-champ"><span>Texte à nettoyer</span><textarea name="entree" rows="8" placeholder="Collez ici…"></textarea></label>' +
    '<div class="af-ligne af-gauche"><label class="af-case"><input type="checkbox" name="lignes" checked> Recoller les lignes</label><label class="af-case"><input type="checkbox" name="cesures" checked> Recoller les mots coupés</label>' +
    '<label class="af-case"><input type="checkbox" name="espaces" checked> Espaces en trop</label><label class="af-case"><input type="checkbox" name="ligatures" checked> Ligatures (ﬁ → fi)</label></div>' +
    '<label class="af-champ"><span>Résultat <button type="button" class="af-mini af-copier-resultat" aria-label="Copier le résultat">⧉</button></span><textarea name="sortie" rows="8" readonly></textarea></label><p class="af-aide af-stats"></p>',
  brancher(ctx) {
    const maj = () => {
      const s = nettoyerTexte(ctx.val("entree"), { lignes: ctx.val("lignes"), cesures: ctx.val("cesures"), espaces: ctx.val("espaces"), ligatures: ctx.val("ligatures") });
      ctx.q('[name="sortie"]').value = s;
      ctx.q(".af-stats").textContent = s.trim() ? statistiques(s) : "";
    };
    ctx.reglages.addEventListener("input", maj);
    ctx.reglages.addEventListener("change", maj);
    ctx.q(".af-copier-resultat").addEventListener("click", async () => { const ok = await copier(ctx.val("sortie")); ctx.statut(ok ? "Copié." : "Copie impossible.", !ok); });
  },
};

/* ── Base64 ── */
const base64 = {
  id: "base64", titre: "Base64", resume: "Encoder, décoder du Base64 — texte, ou fichier en adresse « data: » pour une page web.",
  mots: "encoder decoder base64 data uri developpeur web image",
  description: "Le Base64 écrit des octets avec 64 caractères sûrs (A-Z, a-z, 0-9, +, /) : 3 octets deviennent 4 caractères, d'où un tiers de plus.",
  entree: null,
  sansBouton: true,
  options: () => '<fieldset><legend>Sens</legend><div class="af-choix"><label><input type="radio" name="sens" value="enc" checked> Texte → Base64</label><label><input type="radio" name="sens" value="dec"> Base64 → texte</label></div></fieldset>' +
    '<label class="af-champ"><span>Entrée</span><textarea name="entree" rows="5" spellcheck="false"></textarea></label>' +
    '<label class="af-bouton af-second">Encoder un fichier (data:)<input type="file" hidden data-b="fichier"></label>' +
    '<label class="af-champ"><span>Sortie <button type="button" class="af-mini af-copier-resultat" aria-label="Copier la sortie">⧉</button></span><textarea name="sortie" rows="5" readonly spellcheck="false"></textarea></label>',
  brancher(ctx) {
    const versB64 = (o) => { let s = ""; for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode(...o.subarray(i, i + 0x8000)); return btoa(s); };
    const maj = () => {
      const e = ctx.val("entree");
      let s = "";
      try {
        if (ctx.val("sens") === "enc") s = versB64(new TextEncoder().encode(e));
        else {
          const b = atob(e.replace(/^data:[^,]*,/, "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/"));
          s = new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
        }
        ctx.statut("");
      } catch (err) { ctx.statut("Ce n'est pas du Base64 valide.", true); }
      ctx.q('[name="sortie"]').value = s;
    };
    ctx.reglages.addEventListener("input", maj);
    ctx.reglages.addEventListener("change", maj);
    ctx.q('[data-b="fichier"]').addEventListener("change", async (ev) => {
      const f = ev.target.files[0];
      ev.target.value = "";
      if (!f) return;
      if (f.size > 8e6) { ctx.statut("Fichier trop gros pour une adresse data: (8 Mo au plus).", true); return; }
      ctx.q('[name="sortie"]').value = "data:" + (f.type || "application/octet-stream") + ";base64," + versB64(new Uint8Array(await f.arrayBuffer()));
      ctx.statut("« " + f.name + " » encodé : " + taille(ctx.q('[name="sortie"]').value.length) + ".");
    });
    ctx.q(".af-copier-resultat").addEventListener("click", async () => { const ok = await copier(ctx.val("sortie")); ctx.statut(ok ? "Copié." : "Copie impossible.", !ok); });
  },
};

export const OUTILS = [qrCreer, qrLire, zipCreer, zipOuvrir, empreinte, motsDePasse, textePropre, base64];
