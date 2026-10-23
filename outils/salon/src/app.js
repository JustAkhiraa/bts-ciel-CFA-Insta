/* Le salon, assemblé : une identité, un nœud, deux transports, et l'écran.

   Ce fichier ne contient ni cryptographie ni logique de maillage : il
   écoute le nœud, affiche ce qu'il raconte, et traduit ce qu'on tape en
   appels au nœud. Tout texte venu d'un autre appareil est posé avec
   textContent, jamais interprété comme du HTML. */

import * as C from "./crypto.js";
import { Noeud, SALON_DEFAUT, nomValide, salonValide, TTL_MAX } from "./noeud.js";
import { TransportOnglets, TransportWebRTC } from "./transports.js";
import { encoder, versSvg } from "./qr.js";
import { extraireCode } from "./signal.js";
import { scanner, lireFichier } from "./camera.js";
import * as S from "./stockage.js";

const $ = (s) => document.querySelector(s);
const ech = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const heure = (t) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const court = (fp) => fp.slice(0, 4);

const etat = {
  actif: SALON_DEFAUT,          // « #salon » ou « @empreinte »
  fils: new Map(),              // clé → [entrées]
  nonLus: new Map(),
  salonsVus: new Set(),
  notes: [],
  statuts: new Map(),           // id d'un message privé → « envoyé » / « reçu »
  completion: null,
};
let noeud = null, rtc = null;

/* ═══════════════ démarrage ═══════════════ */
async function demarrer() {
  if (!globalThis.isSecureContext || !globalThis.crypto || !crypto.subtle) {
    $("#sl-messages").innerHTML = '<div class="sl-vide"><p><b>Le salon a besoin d\'une page sécurisée</b> (adresse en <code>https://</code>) : c\'est là seulement que le navigateur donne accès à sa cryptographie.</p></div>';
    return;
  }
  // le premier onglet prend l'identité gardée ; un onglet de plus est un
  // autre nœud, avec une identité de passage (rien n'est enregistré pour lui)
  const principal = await revendiquer();
  let identite = null, pseudo = null;
  if (principal) {
    const gardee = await S.lireIdentite();
    try { identite = gardee ? await C.completer(gardee) : null; } catch (e) { identite = null; }
    if (!identite) { identite = await C.creerIdentite(); await S.garderIdentite(identite); }
    pseudo = S.lirePseudo();
    if (!pseudo || !nomValide(pseudo)) { pseudo = await demanderPseudo(); S.garderPseudo(pseudo); }
  } else {
    identite = await C.creerIdentite();
    pseudo = await demanderPseudo((S.lirePseudo() || "eleve") + "-" + (2 + Math.floor(Math.random() * 8)),
      "Un autre onglet du salon est déjà ouvert dans ce navigateur : celui-ci sera un pair de plus, avec sa propre identité, effacée à sa fermeture.");
  }
  etat.principal = principal;

  noeud = new Noeud({ identite, nick: pseudo });
  brancher();
  new TransportOnglets(noeud);
  rtc = new TransportWebRTC(noeud, { surChangement: majEtat });
  setInterval(() => noeud.tic(), 20000);
  addEventListener("pagehide", () => { noeud.partir(); });

  systeme("Bienvenue, " + pseudo + ". Votre empreinte : " + C.empreinteLisible(identite.empreinte) + ". Tapez /help pour les commandes.", SALON_DEFAUT);
  rendreTout();
  // une invitation dans l'adresse : c'est l'appareil photo qui a ouvert la page
  const code = extraireCode(location.hash);
  if (code) { history.replaceState(null, "", location.pathname); ouvrirRelier("rejoindre", code); }
  $("#sl-champ").focus();
}

/* Un seul onglet garde l'identité enregistrée : celui qui tient le verrou. */
function revendiquer() {
  return new Promise((ok) => {
    if (!navigator.locks) return ok(true);
    navigator.locks.request("ciel-salon-identite", { ifAvailable: true }, (verrou) => {
      ok(!!verrou);
      return verrou ? new Promise(() => {}) : null;      // gardé tant que l'onglet vit
    }).catch(() => ok(true));
  });
}

function demanderPseudo(propose = null, remarque = null) {
  return new Promise((ok) => {
    const f = $("#sl-accueil"), champ = $("#sl-pseudo");
    champ.value = propose || "eleve-" + (1000 + Math.floor(Math.random() * 9000));
    if (remarque) { const p = document.createElement("p"); p.className = "sl-note"; p.textContent = remarque; $("#sl-accueil-form").prepend(p); }
    f.hidden = false;
    champ.select();
    $("#sl-accueil-form").onsubmit = (e) => {
      e.preventDefault();
      const p = champ.value.trim();
      if (!nomValide(p)) { champ.setCustomValidity("Pas d'espace, ni @, ni #, 20 caractères au plus."); champ.reportValidity(); return; }
      champ.setCustomValidity("");
      f.hidden = true;
      ok(p);
    };
    champ.oninput = () => champ.setCustomValidity("");
  });
}

/* ═══════════════ ce que raconte le nœud ═══════════════ */
function brancher() {
  noeud.on("message", (m) => {
    const cle = m.avec ? "@" + m.avec : m.salon;
    ajouter(cle, { type: m.action ? "action" : "msg", ...m });
    if (m.moi && m.avec) etat.statuts.set(m.id, "envoyé");
  });
  noeud.on("systeme", (s) => systeme(s.texte, s.canal || null));
  noeud.on("illisible", (x) => ajouter(x.salon, { type: "illisible", de: x.de, nick: (noeud.pairs.get(x.de) || {}).nick || "?", t: x.t, texte: "message chiffré : mauvais mot de passe pour " + x.salon + " ?" }));
  noeud.on("recu", (r) => { etat.statuts.set(r.ref, "reçu"); if (etat.actif.startsWith("@")) rendreFil(); });
  noeud.on("depot", (n) => { etat.notes.push(n); systeme("Note déposée par " + n.nick + " : « " + n.texte + " »", SALON_DEFAUT); rendreFils(); });
  noeud.on("salonVu", (s) => { if (!etat.salonsVus.has(s)) { etat.salonsVus.add(s); rendreFils(); } });
  noeud.on("pairs", () => { majEtat(); rendreDroite(); rendreFils(); });
  noeud.on("liens", majEtat);
}

function ajouter(cle, entree) {
  if (!etat.fils.has(cle)) etat.fils.set(cle, []);
  const L = etat.fils.get(cle);
  if (entree.id && L.some((x) => x.id === entree.id)) return;
  L.push(entree);
  if (L.length > 800) L.splice(0, L.length - 800);
  if (cle === etat.actif) ajouterLigne(entree);
  else if (entree.type !== "systeme") { etat.nonLus.set(cle, (etat.nonLus.get(cle) || 0) + 1); rendreFils(); }
  majTitre();
}
function systeme(texte, cle = null) { ajouter(cle || etat.actif, { type: "systeme", texte, t: Date.now() }); }

/* ═══════════════ l'écran ═══════════════ */
function rendreTout() { rendreFils(); rendreFil(); rendreDroite(); majEtat(); }

function majEtat() {
  if (!noeud) return;
  const directs = [...noeud.liens].filter((l) => l.type === "webrtc").length;
  const n = noeud.pairs.size;
  const e = $("#sl-etat");
  e.textContent = n ? n + " pair" + (n > 1 ? "s" : "") + (directs ? " · " + directs + " lien" + (directs > 1 ? "s" : "") + " WebRTC" : "") : "seul pour l'instant";
  e.classList.toggle("relie", n > 0);
  rendreDroite();
}
function majTitre() {
  const n = [...etat.nonLus.values()].reduce((s, x) => s + x, 0);
  document.title = (n ? "(" + n + ") " : "") + "Salon — BTS CIEL";
}

function nomPair(fp) {
  if (fp === noeud.moi.empreinte) return noeud.nick;
  const p = noeud.pairs.get(fp);
  return p ? p.nick : "?";
}

function rendreFils() {
  if (!noeud) return;
  const el = $("#sl-fils");
  const salons = [...noeud.salons.keys()];
  const vus = [...etat.salonsVus].filter((s) => !noeud.salons.has(s));
  const prives = [...etat.fils.keys()].filter((k) => k.startsWith("@"));
  const fil = (cle, libelle, extra = "") => {
    const n = etat.nonLus.get(cle) || 0;
    return '<button type="button" class="sl-fil" data-fil="' + ech(cle) + '" aria-current="' + (cle === etat.actif) + '">' + extra
      + '<span class="nom">' + ech(libelle) + "</span>" + (n ? '<span class="badge">' + n + "</span>" : "") + "</button>";
  };
  let h = '<h3>Salons <button type="button" data-act="rejoindre" title="Rejoindre ou créer un salon" aria-label="Rejoindre un salon">+</button></h3>';
  h += salons.map((s) => fil(s, s, noeud.salons.get(s).cle ? '<span class="cadenas" title="Protégé par mot de passe">🔒</span>' : "")).join("");
  if (vus.length) h += "<h3>Salons vus passer</h3>" + vus.map((s) => '<button type="button" class="sl-fil" data-rejoindre="' + ech(s) + '" title="Rejoindre ' + ech(s) + '"><span class="nom">' + ech(s) + "</span></button>").join("");
  h += "<h3>Messages privés</h3>";
  h += prives.length ? prives.map((k) => {
    const fp = k.slice(1);
    return fil(k, nomPair(fp) + "#" + court(fp), '<span class="sl-pastille" style="background:' + C.couleur(fp) + '"></span>');
  }).join("") : '<p class="sl-texte" style="padding:0 .5rem">Cliquez un pair à droite, ou <code>/msg @pseudo</code>.</p>';
  if (etat.notes.length) h += "<h3>Notes déposées</h3>" + etat.notes.slice(-6).map((n) => '<p class="sl-texte" style="padding:0 .5rem">' + ech(n.nick) + " : « " + ech(n.texte) + " »</p>").join("");
  el.innerHTML = h;
}

function rendreFil() {
  const el = $("#sl-messages");
  el.textContent = "";
  const L = etat.fils.get(etat.actif) || [];
  const dm = etat.actif.startsWith("@");
  const ent = $("#sl-entete");
  if (dm) {
    const fp = etat.actif.slice(1);
    ent.innerHTML = '<b style="color:' + C.couleur(fp) + '">' + ech(nomPair(fp)) + "</b><small>🔒 chiffré de bout en bout · empreinte " + ech(C.empreinteLisible(fp)) + "</small>";
  } else {
    const s = noeud && noeud.salons.get(etat.actif);
    ent.innerHTML = "<b>" + ech(etat.actif) + "</b><small>" + (s && s.cle ? "🔒 protégé par mot de passe : seuls ceux qui l'ont lisent les messages" : "public : tous les pairs du maillage le lisent") + "</small>";
  }
  $("#sl-invite").textContent = dm ? "@" + nomPair(etat.actif.slice(1)) : etat.actif;
  if (!L.length || (L.every((x) => x.type === "systeme") && etat.actif === SALON_DEFAUT && noeud && !noeud.pairs.size)) {
    const v = document.createElement("div");
    v.className = "sl-vide";
    v.innerHTML = '<p><b>Personne d\'autre ici pour l\'instant.</b></p>'
      + "<ul><li>Sur un autre appareil du <b>même Wi-Fi</b> : bouton <b>Relier</b>, puis montrez-vous vos QR codes. Pas besoin d'Internet.</li>"
      + "<li>Pour essayer seul : ouvrez cette page dans un <b>deuxième onglet</b> — chaque onglet est un pair.</li>"
      + "<li>Chaque appareil relie les autres : trois appareils en chaîne se parlent tous, à 2 sauts.</li></ul>";
    el.appendChild(v);
  }
  L.forEach((e) => ajouterLigne(e, false));
  el.scrollTop = el.scrollHeight;
  etat.nonLus.delete(etat.actif);
  majTitre();
  rendreFils();
}

function ajouterLigne(e, defiler = true) {
  const el = $("#sl-messages");
  const vide = el.querySelector(".sl-vide");
  if (vide && e.type !== "systeme") vide.remove();
  const enBas = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  const d = document.createElement("div");
  d.className = "sl-msg " + e.type;
  const h = document.createElement("span");
  h.className = "h"; h.textContent = heure(e.t);
  d.appendChild(h);
  if (e.type !== "systeme") {
    const n = document.createElement("span");
    n.className = "n";
    n.style.color = C.couleur(e.de);
    n.textContent = (e.type === "action" ? "* " : "") + e.nick;
    const s = document.createElement("small");
    s.textContent = "#" + court(e.de);
    n.appendChild(s);
    n.title = "Empreinte : " + C.empreinteLisible(e.de, 32);
    d.appendChild(n);
  }
  const t = document.createElement("span");
  t.className = "t";
  poserTexte(t, e.texte || "");
  const meta = [];
  if (e.chiffre && e.type !== "illisible") meta.push("🔒");
  if (e.sauts > 1) meta.push(e.sauts + " sauts");
  if (e.moi && e.avec) meta.push(etat.statuts.get(e.id) === "reçu" ? "✓ reçu" : "envoyé");
  if (meta.length) { const m = document.createElement("span"); m.className = "meta"; m.textContent = meta.join(" · "); t.appendChild(m); }
  d.appendChild(t);
  el.appendChild(d);
  if (defiler && (enBas || e.moi)) el.scrollTop = el.scrollHeight;
}

/* Le texte d'un autre : du texte, rien que du texte — mais « @monpseudo »
   est mis en valeur. */
function poserTexte(el, texte) {
  const moi = noeud ? "@" + noeud.nick : null;
  if (!moi || !texte.includes(moi)) { el.textContent = texte; return; }
  texte.split(moi).forEach((morceau, i) => {
    if (i) { const s = document.createElement("span"); s.className = "m-moi"; s.textContent = moi; el.appendChild(s); }
    el.appendChild(document.createTextNode(morceau));
  });
}

function rendreDroite() {
  if (!noeud) return;
  const el = $("#sl-droite");
  const moi = noeud.moi;
  let h = '<h3>Vous</h3><div class="sl-carte"><div class="moi"><span class="sl-pastille" style="background:' + C.couleur(moi.empreinte) + '"></span>'
    + ech(noeud.nick) + "</div><div class=\"emp\">" + ech(C.empreinteLisible(moi.empreinte, 32)) + "</div>"
    + "<p>Votre empreinte. Pour être sûr de parler à la bonne personne, comparez-la à voix haute avec la sienne (<code>/verify @pseudo</code>).</p></div>";
  const pairs = [...noeud.pairs.entries()].sort((a, b) => a[1].sauts - b[1].sauts || a[1].nick.localeCompare(b[1].nick));
  h += "<h3>Pairs joignables · " + pairs.length + "</h3>";
  h += pairs.length ? pairs.map(([fp, p]) => {
    const via = p.lien ? (p.lien.type === "onglet" ? "onglet de ce navigateur" : "lien WebRTC direct") + (p.lien.rtt != null ? ", " + p.lien.rtt + " ms" : "") : "à " + p.sauts + " sauts, par le maillage";
    return '<div class="sl-pair" data-pair="' + fp + '" title="Écrire en privé à ' + ech(p.nick) + '"><span class="sl-pastille" style="background:' + C.couleur(fp) + '"></span>'
      + '<span class="nom">' + ech(p.nick) + "<small style=\"color:var(--texte-faible)\">#" + court(fp) + "</small></span>"
      + '<span class="sauts">' + (p.sauts === 1 ? "direct" : p.sauts + " sauts") + "</span>"
      + '<span class="det">' + ech(via) + (noeud.bloques.has(fp) ? " · bloqué" : "") + "</span></div>";
  }).join("") : '<p class="sl-texte">Aucun. Bouton <b>Relier</b> en haut, ou un deuxième onglet pour essayer.</p>';
  h += "<h3>Le maillage, vu d'ici</h3>" + svgReseau(pairs);
  h += '<p class="sl-texte">Chaque cercle est un saut de plus. Un message vit au plus ' + TTL_MAX + " sauts (TTL) ; chaque appareil le relaie une seule fois.</p>";
  el.innerHTML = h;
}

function svgReseau(pairs) {
  const W = 260, H = 220, cx = W / 2, cy = H / 2;
  const max = Math.max(1, ...pairs.map(([, p]) => p.sauts));
  const r = (s) => (s / Math.max(max, 2)) * 92;
  let g = "";
  for (let s = 1; s <= max; s++) g += '<circle class="anneau" cx="' + cx + '" cy="' + cy + '" r="' + r(s) + '"/>';
  const parAnneau = new Map();
  pairs.forEach(([fp, p]) => { if (!parAnneau.has(p.sauts)) parAnneau.set(p.sauts, []); parAnneau.get(p.sauts).push([fp, p]); });
  for (const [s, L] of parAnneau) L.forEach(([fp, p], i) => {
    const a = (i / L.length) * Math.PI * 2 - Math.PI / 2 + s * 0.6;
    const x = cx + Math.cos(a) * r(s), y = cy + Math.sin(a) * r(s);
    if (p.lien) g += '<line class="lien" x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>';
    g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6" fill="' + C.couleur(fp) + '"/><text x="' + x.toFixed(1) + '" y="' + (y + 17).toFixed(1) + '" text-anchor="middle">' + ech(p.nick.slice(0, 10)) + "</text>";
  });
  g += '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="' + C.couleur(noeud.moi.empreinte) + '" stroke="var(--texte)" stroke-width="1.5"/><text x="' + cx + '" y="' + (cy + 21) + '" text-anchor="middle">vous</text>';
  return '<svg class="sl-reseau" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Carte du maillage : ' + pairs.length + ' pairs">' + g + "</svg>";
}

function ouvrirFil(cle) {
  etat.actif = cle;
  if (!etat.fils.has(cle)) etat.fils.set(cle, []);
  rendreFil();
  $("#sl-champ").focus();
}

/* ═══════════════ ce qu'on tape ═══════════════ */
const COMMANDES = {
  help: "afficher cette aide", join: "#salon [mot de passe] — rejoindre ou créer un salon", part: "[#salon] — quitter un salon",
  msg: "@pseudo message — message privé chiffré", nick: "pseudo — changer de pseudo", who: "lister les pairs et leur distance",
  me: "action — une action à la troisième personne", slap: "@pseudo — le classique d'IRC", drop: "note — déposer une note pour ceux qui passeront",
  notes: "relire les notes déposées", verify: "@pseudo — afficher son empreinte, à comparer avec lui", block: "@pseudo — ne plus voir ses messages",
  unblock: "@pseudo — le revoir", list: "les salons vus passer", relier: "relier un autre appareil (QR code)", clear: "vider l'écran", wipe: "TOUT effacer, tout de suite (mode panique)",
};

async function soumettre(texte) {
  texte = texte.trim();
  if (!texte) return;
  if (!texte.startsWith("/")) return parler(texte);
  const [cmd, ...reste] = texte.slice(1).split(/\s+/);
  const arg = reste.join(" ");
  const c = cmd.toLowerCase();
  switch (c) {
    case "help": case "aide": case "h":
      systeme("Commandes : " + Object.entries(COMMANDES).map(([k, v]) => "/" + k + " " + v).join(" · "));
      systeme("Tab complète les commandes, les @pseudos et les #salons. Triple-clic sur le logo : effacement d'urgence.");
      return;
    case "join": case "j": {
      const nom = (reste[0] || "").toLowerCase();
      const s = nom.startsWith("#") ? nom : "#" + nom;
      if (!salonValide(s)) return systeme("Nom de salon invalide : # puis 1 à 24 lettres minuscules, chiffres, - ou _.");
      const mdp = reste.slice(1).join(" ") || null;
      if (mdp) systeme("Dérivation de la clé du salon (PBKDF2, 210 000 tours)…");
      await noeud.rejoindre(s, mdp);
      etat.salonsVus.delete(s);
      ouvrirFil(s);
      systeme(mdp ? "Vous êtes dans " + s + ", protégé : seuls ceux qui ont le même mot de passe liront vos messages." : "Vous êtes dans " + s + ".");
      return;
    }
    case "part": case "leave": {
      const s = reste[0] || etat.actif;
      if (s === SALON_DEFAUT) return systeme(SALON_DEFAUT + " ne se quitte pas : c'est le salon de tout le monde.");
      noeud.quitter(s);
      ouvrirFil(SALON_DEFAUT);
      return;
    }
    case "msg": case "m": case "query": {
      const p = trouverPair(reste[0]);
      if (!p) return;
      ouvrirFil("@" + p);
      if (reste.length > 1) await envoyerPrive(p, reste.slice(1).join(" "));
      return;
    }
    case "nick": {
      if (!nomValide(arg)) return systeme("Pseudo invalide : 1 à 20 caractères, sans espace, @ ni #.");
      const avant = noeud.nick;
      await noeud.changerNom(arg);
      if (etat.principal) S.garderPseudo(arg);
      systeme(avant + " s'appelle désormais " + arg + ".");
      rendreDroite();
      return;
    }
    case "who": case "w": {
      const L = [...noeud.pairs.entries()];
      systeme(L.length ? L.length + " pair(s) joignable(s) :" : "Personne. Reliez un appareil (/relier) ou ouvrez un deuxième onglet.");
      L.sort((a, b) => a[1].sauts - b[1].sauts).forEach(([fp, p]) => systeme("  " + p.nick + "#" + court(fp) + " — "
        + (p.lien ? "direct (" + (p.lien.type === "onglet" ? "onglet" : "WebRTC") + (p.lien.rtt != null ? ", " + p.lien.rtt + " ms" : "") + ")" : p.sauts + " sauts")));
      systeme("(La puissance radio, le « RSSI » de BitChat, n'existe pas en WebRTC : on affiche la distance en sauts et le temps d'aller-retour.)");
      return;
    }
    case "me": return parler(arg, true);
    case "slap": {
      const p = trouverPair(reste[0]);
      if (!p) return;
      return parler("gifle " + nomPair(p) + " avec une grosse truite", true);
    }
    case "drop": case "depot":
      if (!arg) return systeme("Usage : /drop votre note");
      await noeud.deposer(arg);
      systeme("Note déposée : ceux qui arriveront dans les 24 h la verront.");
      return;
    case "notes":
      if (!etat.notes.length) return systeme("Aucune note déposée.");
      etat.notes.forEach((n) => systeme(n.nick + " (" + heure(n.t) + ") : « " + n.texte + " »"));
      return;
    case "verify": {
      const p = trouverPair(reste[0]);
      if (!p) return;
      systeme("Empreinte de " + nomPair(p) + " : " + C.empreinteLisible(p, 32) + ". La vôtre : " + C.empreinteLisible(noeud.moi.empreinte, 32) + ". Lisez-les-vous à voix haute : si elles sont identiques, personne ne se fait passer pour l'autre.");
      return;
    }
    case "block": { const p = trouverPair(reste[0]); if (p) { noeud.bloques.add(p); systeme(nomPair(p) + " est bloqué : ses messages sont relayés pour les autres, mais vous ne les voyez plus."); rendreDroite(); } return; }
    case "unblock": { const p = trouverPair(reste[0]); if (p) { noeud.bloques.delete(p); systeme(nomPair(p) + " est débloqué."); rendreDroite(); } return; }
    case "list": systeme(etat.salonsVus.size ? "Salons vus passer : " + [...etat.salonsVus].join(", ") : "Aucun autre salon vu pour l'instant."); return;
    case "relier": ouvrirRelier(); return;
    case "clear": etat.fils.set(etat.actif, []); rendreFil(); return;
    case "wipe": return panique();
    default: systeme("Commande inconnue : /" + cmd + ". Tapez /help.");
  }
}

async function parler(texte, action = false) {
  if (etat.actif.startsWith("@")) return envoyerPrive(etat.actif.slice(1), action ? "* " + noeud.nick + " " + texte : texte);
  await noeud.parler(etat.actif, texte, { action });
}
async function envoyerPrive(fp, texte) {
  if (!noeud.pairs.has(fp)) return systeme("Ce pair n'est plus joignable : le message ne peut pas être chiffré pour lui.");
  await noeud.prive(fp, texte);
}

/* « @alice », « alice », « alice#3fa2 » → l'empreinte, ou une explication. */
function trouverPair(s) {
  if (!s) { systeme("Il manque le pseudo : @pseudo."); return null; }
  const [nom, pref] = s.replace(/^@/, "").split("#");
  const L = [...noeud.pairs.entries()].filter(([fp, p]) => p.nick.toLowerCase() === nom.toLowerCase() && (!pref || fp.startsWith(pref.toLowerCase())));
  if (!L.length) { systeme("Aucun pair « " + s + " » joignable. /who pour la liste."); return null; }
  if (L.length > 1) { systeme("Plusieurs « " + nom + " » : précisez, " + L.map(([fp]) => "@" + nom + "#" + court(fp)).join(" ou ") + "."); return null; }
  return L[0][0];
}

/* La touche Tab : compléter le mot en cours. */
function completer(champ) {
  const pos = champ.selectionStart, avant = champ.value.slice(0, pos);
  const m = /(\S*)$/.exec(avant), mot = m[1];
  let cands = [];
  if (mot.startsWith("/") && !avant.slice(0, -mot.length).trim()) cands = Object.keys(COMMANDES).map((k) => "/" + k);
  else if (mot.startsWith("@")) {
    const noms = [...noeud.pairs.entries()].map(([fp, p]) => p.nick);
    cands = [...noeud.pairs.entries()].map(([fp, p]) => "@" + p.nick + (noms.filter((n) => n === p.nick).length > 1 ? "#" + court(fp) : ""));
  } else if (mot.startsWith("#")) cands = [...new Set([...noeud.salons.keys(), ...etat.salonsVus])];
  cands = cands.filter((c) => c.toLowerCase().startsWith(mot.toLowerCase()));
  if (!cands.length) return;
  const st = etat.completion && etat.completion.base === avant.slice(0, -mot.length) && etat.completion.cands.join() === cands.join() ? etat.completion : { base: avant.slice(0, -mot.length), cands, i: -1 };
  st.i = (st.i + 1) % cands.length;
  etat.completion = st;
  const nouveau = st.base + cands[st.i] + " ";
  champ.value = nouveau + champ.value.slice(pos);
  champ.setSelectionRange(nouveau.length, nouveau.length);
}

/* ═══════════════ relier un appareil ═══════════════ */
let enCours = null;          // la caméra ou la connexion en cours, à arrêter en fermant
function fermerRelier() {
  if (enCours && enCours.arreter) enCours.arreter();
  enCours = null;
  $("#sl-relier").hidden = true;
  $("#sl-champ").focus();
}
function ouvrirRelier(mode = null, code = null) {
  const f = $("#sl-relier"), corps = $("#sl-relier-corps");
  f.hidden = false;
  if (!rtc.disponible) { corps.innerHTML = '<p class="sl-erreur">Ce navigateur ne sait pas faire de WebRTC : impossible de relier un autre appareil depuis ici.</p>'; return; }
  if (mode === "inviter") return inviter(corps);
  if (mode === "rejoindre") return rejoindre(corps, code);
  corps.innerHTML = '<p>Deux appareils du <b>même Wi-Fi</b> (ou du même partage de connexion) se relient <b>directement</b>, sans Internet. Une fois relié, chacun relaie pour les autres : il suffit que chaque nouvel appareil se relie à <b>un</b> appareil déjà dans le salon.</p>'
    + '<div class="sl-choix"><button type="button" data-relier="inviter"><b>Inviter</b><span>J\'affiche un QR code, l\'autre le scanne et me montre sa réponse.</span></button>'
    + '<button type="button" data-relier="rejoindre"><b>Rejoindre</b><span>Je scanne le QR code de quelqu\'un qui m\'invite.</span></button></div>'
    + '<p class="sl-note" style="margin-top:.9rem">Hors ligne, la page doit avoir été ouverte une fois avec Internet (elle reste ensuite sur l\'appareil). Si rien ne se relie, le Wi-Fi isole peut-être ses appareils les uns des autres : un partage de connexion de téléphone, lui, ne le fait pas.</p>';
}

function zoneScan(id) {
  return '<video class="sl-video" id="' + id + '-video" muted playsinline hidden></video>'
    + '<div class="sl-rangee"><button type="button" class="sl-b" id="' + id + '-cam">📷 Scanner avec la caméra</button>'
    + '<label class="sl-b" style="cursor:pointer">🖼 Une photo du QR<input type="file" accept="image/*" id="' + id + '-photo" hidden></label></div>'
    + '<textarea class="sl-code" id="' + id + '-code" rows="3" placeholder="…ou collez le code ici (il commence par S1~)" spellcheck="false"></textarea>'
    + '<div class="sl-rangee"><button type="button" class="sl-b" id="' + id + '-valider">Valider le code collé</button></div><p class="sl-texte" id="' + id + '-etat"></p>';
}
/* Brancher une zone de scan : la caméra, une photo, ou le code collé. */
function brancherScan(id, suite) {
  const etatEl = $("#" + id + "-etat");
  const traiter = (texte) => {
    const code = extraireCode(texte);
    if (!code) { etatEl.className = "sl-texte sl-erreur"; etatEl.textContent = "Ce n'est pas un code du salon."; return; }
    suite(code);
  };
  $("#" + id + "-cam").onclick = async () => {
    const v = $("#" + id + "-video");
    v.hidden = false;
    etatEl.className = "sl-texte"; etatEl.textContent = "Visez le QR code…";
    try { enCours = await scanner(v, (t) => { v.hidden = true; traiter(t); }); }
    catch (e) { v.hidden = true; etatEl.className = "sl-texte sl-erreur"; etatEl.textContent = "Caméra inaccessible : " + e.message + ". Collez le code, ou prenez une photo."; }
  };
  $("#" + id + "-photo").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    etatEl.textContent = "Lecture de la photo…";
    const t = await lireFichier(f);
    if (t) traiter(t); else { etatEl.className = "sl-texte sl-erreur"; etatEl.textContent = "Aucun QR code lisible sur cette photo."; }
  };
  $("#" + id + "-valider").onclick = () => traiter($("#" + id + "-code").value);
}
function qrHtml(texte) {
  try { return '<div class="sl-qr">' + versSvg(encoder(texte, { niveau: "M" })) + "</div>"; }
  catch (e) { return '<p class="sl-erreur">QR impossible : ' + ech(e.message) + "</p>"; }
}

async function inviter(corps) {
  corps.innerHTML = '<p>Préparation de l\'invitation : le navigateur cherche ses adresses sur le réseau local…</p>';
  let inv;
  try { inv = await rtc.inviter(); } catch (e) { corps.innerHTML = '<p class="sl-erreur">' + ech(e.message) + "</p>"; return; }
  enCours = { arreter: () => {} };
  const lien = location.origin + location.pathname + "#o=" + inv.code;
  corps.innerHTML = '<div class="sl-etapes"><div><p class="sl-etape">1 · Il scanne ceci</p>' + qrHtml(lien)
    + '<p class="sl-note">Avec l\'appareil photo de son téléphone (le lien ouvre le salon), ou avec <b>Rejoindre</b> sur son ordinateur.</p>'
    + '<textarea class="sl-code" rows="3" readonly>' + ech(inv.code) + '</textarea><div class="sl-rangee"><button type="button" class="sl-b" data-copier>Copier le code</button></div></div>'
    + '<div><p class="sl-etape">2 · Vous scannez sa réponse</p>' + zoneScan("inv") + "</div></div>";
  corps.querySelector("[data-copier]").onclick = () => copier(inv.code);
  brancherScan("inv", async (code) => {
    const e = $("#inv-etat");
    try {
      e.className = "sl-texte"; e.textContent = "Réponse lue, connexion directe en cours…";
      const ouvert = await inv.accepter(code);
      const delai = new Promise((_, ko) => setTimeout(() => ko(new Error("pas de connexion au bout de 15 s : les deux appareils sont-ils sur le même Wi-Fi ?")), 15000));
      await Promise.race([ouvert, delai]);
      e.className = "sl-texte sl-ok"; e.textContent = "Relié ✓ — l'autre appareil fait maintenant partie du salon.";
      setTimeout(fermerRelier, 1400);
    } catch (err) { e.className = "sl-texte sl-erreur"; e.textContent = err.message; }
  });
}

async function rejoindre(corps, code = null) {
  if (!code) {
    corps.innerHTML = '<p class="sl-etape">1 · Scannez son invitation</p>' + zoneScan("rej");
    brancherScan("rej", (c) => rejoindre(corps, c));
    return;
  }
  corps.innerHTML = "<p>Invitation lue. Préparation de votre réponse…</p>";
  let rep;
  try { rep = await rtc.rejoindre(code); } catch (e) { corps.innerHTML = '<p class="sl-erreur">' + ech(e.message) + "</p>"; return; }
  enCours = { arreter: () => {} };
  corps.innerHTML = '<p class="sl-etape">2 · Montrez-lui votre réponse</p><div class="sl-etapes"><div>' + qrHtml(rep.code) + '</div><div>'
    + "<p>L'appareil qui vous invite scanne ce QR code (étape 2 de son côté).</p>"
    + '<textarea class="sl-code" rows="4" readonly>' + ech(rep.code) + '</textarea><div class="sl-rangee"><button type="button" class="sl-b" data-copier>Copier la réponse</button></div>'
    + '<p class="sl-texte" id="rej-attente">En attente de la connexion…</p></div></div>';
  corps.querySelector("[data-copier]").onclick = () => copier(rep.code);
  rep.ouvert.then(() => {
    const e = $("#rej-attente");
    if (e) { e.className = "sl-texte sl-ok"; e.textContent = "Relié ✓ — vous êtes dans le salon."; }
    setTimeout(fermerRelier, 1400);
  });
}

async function copier(texte) {
  try { await navigator.clipboard.writeText(texte); toast("Code copié."); }
  catch (e) { toast("Copie impossible : sélectionnez le code à la main."); }
}

/* ═══════════════ le mode panique ═══════════════ */
async function panique() {
  const f = $("#sl-flash");
  f.hidden = false;
  try { if (rtc) rtc.toutFermer(); } catch (e) { /* déjà fermé */ }
  etat.fils.clear(); etat.notes = []; etat.nonLus.clear();
  $("#sl-messages").textContent = "";
  await S.toutEffacer();
  noeud = null;
  setTimeout(() => location.replace(location.pathname), 900);
}

/* ═══════════════ les gestes ═══════════════ */
let toastT = 0;
function toast(t) { const e = $("#sl-toast"); e.textContent = t; e.classList.add("vu"); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove("vu"), 2600); }

$("#sl-saisie").addEventListener("submit", async (e) => {
  e.preventDefault();
  const c = $("#sl-champ"), t = c.value;
  c.value = "";
  etat.completion = null;
  if (noeud) await soumettre(t);
});
$("#sl-champ").addEventListener("keydown", (e) => {
  if (e.key === "Tab" && noeud && e.target.value) { e.preventDefault(); completer(e.target); }
  else if (e.key !== "Shift") etat.completion = null;
});
$("#sl-fils").addEventListener("click", (e) => {
  const b = e.target.closest("[data-fil]");
  if (b) return ouvrirFil(b.dataset.fil);
  const r = e.target.closest("[data-rejoindre]");
  if (r) return soumettre("/join " + r.dataset.rejoindre);
  if (e.target.closest('[data-act="rejoindre"]')) { const c = $("#sl-champ"); c.value = "/join #"; c.focus(); }
});
$("#sl-droite").addEventListener("click", (e) => {
  const p = e.target.closest("[data-pair]");
  if (p) { ouvrirFil("@" + p.dataset.pair); document.querySelector(".sl").classList.remove("droite-ouverte"); }
});
$("#sl-relier-b").addEventListener("click", () => ouvrirRelier());
$("#sl-relier").addEventListener("click", (e) => {
  if (e.target.closest("[data-fermer]") || e.target.id === "sl-relier") return fermerRelier();
  const b = e.target.closest("[data-relier]");
  if (b) ouvrirRelier(b.dataset.relier);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sl-relier").hidden) fermerRelier(); });
$("#sl-pairs-b").addEventListener("click", () => {
  const s = document.querySelector(".sl");
  if (matchMedia("(max-width: 980px)").matches) s.classList.toggle("droite-ouverte");
  else s.classList.toggle("sans-droite");
});
$("#sl-theme-b").addEventListener("click", () => {
  const d = document.documentElement, clair = d.dataset.theme !== "clair";
  d.dataset.theme = clair ? "clair" : "sombre";
  try { localStorage.setItem("ciel-salon-theme", clair ? "clair" : "sombre"); } catch (e) { /* tant pis */ }
});
$("#sl-aide-b").addEventListener("click", () => { if (noeud) soumettre("/help"); });
// trois clics rapides sur le logo : tout effacer
let clics = [];
$("#sl-logo").addEventListener("click", () => {
  const t = Date.now();
  clics = clics.filter((x) => t - x < 700).concat(t);
  if (clics.length >= 3) panique();
});

demarrer();

/* Un point d'entrée pour la vérification automatique. */
window.CIEL_SALON = { get noeud() { return noeud; }, get rtc() { return rtc; }, etat, soumettre, ouvrirRelier };
