/* Un nœud du salon : c'est chaque appareil, chaque onglet.

   Il n'y a pas de serveur. Un nœud a des LIENS (un autre onglet du même
   navigateur, un autre appareil relié en WebRTC) ; tout paquet qu'il reçoit
   et qu'il n'a jamais vu, il le relaie sur ses autres liens, son TTL
   diminué de 1. C'est l'inondation contrôlée d'un réseau maillé :
   - le TTL borne la distance (7 sauts au plus) ;
   - le CACHE ANTI-DOUBLONS (l'identifiant de chaque paquet vu) empêche
     qu'un paquet tourne en rond ;
   - le STOCKAGE ET RETRANSMISSION (« store and forward ») : un nœud garde
     les messages récents et les donne à tout nouveau voisin — celui qui
     arrive en retard lit ce qui s'est dit, un message privé attend que son
     destinataire apparaisse.

   Chaque paquet est SIGNÉ par son auteur, et porte ses clés publiques :
   l'empreinte de l'auteur se recalcule à partir d'elles, la signature se
   vérifie avec elles. Un paquet modifié en route, ou signé par quelqu'un
   d'autre que l'empreinte qu'il prétend, est jeté sans être relayé.

   Le nœud ne connaît pas le DOM : la page l'écoute (on / emit), les tests
   aussi. */

import * as C from "./crypto.js";

export const TTL_MAX = 7;
export const TAILLE_MAX = 16000;              // caractères d'un paquet sérialisé
export const TEXTE_MAX = 1000;
export const ANNONCE_TOUS = 20000;            // ms entre deux annonces
export const PAIR_PERDU = 70000;              // ms sans nouvelles : le pair est parti
// combien de temps un nœud garde chaque sorte de paquet pour les retardataires ;
// d'une annonce, seule la plus récente de chaque pair est gardée
const GARDE = { annonce: 30 * 60e3, msg: 2 * 3600e3, prive: 24 * 3600e3, depot: 24 * 3600e3, recu: 3600e3 };
const STOCK_MAX = 400;
const DEBIT = { fenetre: 10000, max: 25 };    // paquets par auteur et par fenêtre
export const SALON_DEFAUT = "#general";

export const nomValide = (n) => /^[^\s@#<>&"']{1,20}$/u.test(n);
export const salonValide = (s) => /^#[a-z0-9_-]{1,24}$/.test(s);

export class Noeud {
  constructor({ identite, nick, maintenant = () => Date.now() }) {
    this.moi = identite;
    this.nick = nick;
    this.maintenant = maintenant;
    this.liens = new Set();
    this.vus = new Map();                       // id → expiration
    this.stock = new Map();                     // id → { paquet, expire }
    this.pairs = new Map();                     // empreinte → { nick, cle, ech, sauts, vu, lien }
    this.salons = new Map([[SALON_DEFAUT, { cle: null }]]);
    this.bloques = new Set();
    this.debits = new Map();
    this.ecouteurs = new Map();
    this.dejaAlerte = new Set();
    this.depots = new Map();                    // id → note déposée
  }

  on(type, fn) {
    if (!this.ecouteurs.has(type)) this.ecouteurs.set(type, new Set());
    this.ecouteurs.get(type).add(fn);
    return () => this.ecouteurs.get(type).delete(fn);
  }
  emit(type, d) { (this.ecouteurs.get(type) || []).forEach((fn) => fn(d)); }
  systeme(texte, canal = null) { this.emit("systeme", { texte, canal, t: this.maintenant() }); }

  /* ── les liens ── */
  ajouterLien(lien) {
    this.liens.add(lien);
    lien.surMessage = (brut) => this.recevoir(lien, brut);
    lien.surFermeture = () => this.retirerLien(lien);
    this.emit("liens");
    // se présenter, puis donner ce qu'on garde : le nouveau venu rattrape
    this.annoncer(lien);
    this.donnerStock(lien);
    this.mesurer(lien);
    // un lien de DIFFUSION (les onglets d'un navigateur) relie à des nœuds
    // déjà là : on leur dit bonjour, et chacun nous donne ce qu'il garde
    if (lien.diffusion) this.envoyerSur(lien, { lien: "bonjour" });
  }
  retirerLien(lien) {
    if (!this.liens.delete(lien)) return;
    for (const [fp, p] of this.pairs) if (p.lien === lien) { p.lien = null; p.sauts = Math.max(p.sauts, 2); }
    this.emit("liens");
    this.emit("pairs");
  }
  envoyerSur(lien, objet) {
    try { lien.envoyer(typeof objet === "string" ? objet : JSON.stringify(objet)); } catch (e) { this.retirerLien(lien); }
  }
  diffuser(paquet, sauf = null) {
    const brut = JSON.stringify(paquet);
    for (const l of this.liens) if (l !== sauf) this.envoyerSur(l, brut);
  }

  /* Les petits messages de lien (jamais relayés) : mesurer l'aller-retour. */
  mesurer(lien) { this.envoyerSur(lien, { lien: "ping", t: this.maintenant() }); }

  /* ── écrire ── */
  async fabriquer(type, champs) {
    const p = { v: 1, id: C.versB64(C.aleatoire(12)), type, t: this.maintenant(), de: this.moi.empreinte,
      cle: this.moi.pubSigne, ech: this.moi.pubEchange, ...champs };
    p.sig = await C.signer(this.moi, sansTransport(p));
    p.ttl = TTL_MAX;
    return p;
  }
  async emettre(type, champs) {
    const p = await this.fabriquer(type, champs);
    this.vus.set(p.id, p.t + 24 * 3600e3);
    this.garder(p);
    this.diffuser(p);
    return p;
  }
  garder(p) {
    if (!GARDE[p.type]) return;
    if (p.type === "annonce") for (const [id, s] of this.stock) if (s.paquet.type === "annonce" && s.paquet.de === p.de) this.stock.delete(id);
    this.stock.set(p.id, { paquet: p, expire: p.t + GARDE[p.type] });
    if (this.stock.size > STOCK_MAX) this.stock.delete(this.stock.keys().next().value);
  }
  donnerStock(lien) {
    const t = this.maintenant();
    for (const [id, s] of this.stock) {
      if (s.expire < t) { this.stock.delete(id); continue; }
      this.envoyerSur(lien, { ...s.paquet, ttl: Math.max(1, s.paquet.ttl - 1) });
    }
  }

  async annoncer(lien = null) {
    const p = await this.fabriquer("annonce", { nick: this.nick });
    this.vus.set(p.id, p.t + 3600e3);
    this.garder(p);
    if (lien) this.envoyerSur(lien, p); else this.diffuser(p);
  }

  /* Un message dans un salon. Un salon à mot de passe le chiffre : les
     autres nœuds le relaient sans pouvoir le lire. */
  async parler(salon, texte, { action = false } = {}) {
    texte = String(texte).slice(0, TEXTE_MAX);
    const s = this.salons.get(salon);
    let champs = { salon, action: action || undefined, texte };
    if (s && s.cle) {
      const boite = await C.chiffrerSalon(s.cle, JSON.stringify({ texte, action }), salon + "|" + this.moi.empreinte);
      champs = { salon, chiffre: boite };
    }
    const p = await this.emettre("msg", champs);
    this.emit("message", { id: p.id, salon, de: this.moi.empreinte, nick: this.nick, texte, action, t: p.t, moi: true, chiffre: !!(s && s.cle), sauts: 0 });
    return p;
  }

  /* Un message privé : chiffré pour la seule clé du destinataire. */
  async prive(empreinte, texte) {
    const pair = this.pairs.get(empreinte);
    if (!pair) throw new Error("pair inconnu");
    texte = String(texte).slice(0, TEXTE_MAX);
    const contexte = this.moi.empreinte + ">" + empreinte;
    const boite = await C.chiffrerPrive(pair.ech, JSON.stringify({ texte, nick: this.nick }), contexte);
    const p = await this.emettre("prive", { a: empreinte, boite });
    this.emit("message", { id: p.id, avec: empreinte, de: this.moi.empreinte, nick: this.nick, texte, t: p.t, moi: true, chiffre: true, statut: "envoye" });
    return p;
  }

  async deposer(texte) {
    texte = String(texte).slice(0, TEXTE_MAX);
    const p = await this.emettre("depot", { texte, nick: this.nick });
    this.recevoirDepot(p, 0);
    return p;
  }

  async rejoindre(salon, motDePasse = null) {
    const cle = motDePasse ? await C.cleDeSalon(salon, motDePasse) : null;
    this.salons.set(salon, { cle });
    // les messages déjà gardés pour ce salon se relisent avec la bonne clé
    for (const { paquet } of this.stock.values()) if (paquet.type === "msg" && paquet.salon === salon) await this.lireMessage(paquet, TTL_MAX - paquet.ttl + 1, true);
  }
  quitter(salon) { if (salon !== SALON_DEFAUT) this.salons.delete(salon); }

  async changerNom(nick) {
    if (!nomValide(nick)) return false;
    this.nick = nick;
    await this.annoncer();
    return true;
  }

  /* ── recevoir ── */
  async recevoir(lien, brut) {
    if (typeof brut !== "string" || brut.length > TAILLE_MAX) return;
    let p;
    try { p = JSON.parse(brut); } catch (e) { return; }
    if (!p || typeof p !== "object") return;
    if (p.lien === "ping") { this.envoyerSur(lien, { lien: "pong", t: p.t }); return; }
    if (p.lien === "bonjour") { this.annoncer(lien); this.donnerStock(lien); return; }
    if (p.lien === "pong") { lien.rtt = Math.max(0, this.maintenant() - p.t); this.emit("pairs"); return; }
    if (!formeValide(p)) return;
    // le cache anti-doublons AVANT la vérification, qui coûte
    this.nettoyer();
    if (this.vus.has(p.id)) return;
    const t = this.maintenant();
    if (p.t > t + 5 * 60e3 || p.t < t - 24 * 3600e3) return;          // trop vieux, ou daté du futur
    if (p.ttl < 1 || p.ttl > TTL_MAX) return;
    if (await C.empreinteDe(p.cle, p.ech) !== p.de) return;           // l'empreinte ne correspond pas aux clés
    if (!(await C.verifier(p.cle, p.sig, sansTransport(p)))) return;  // signature fausse : jeté, pas relayé
    if (this.vus.has(p.id)) return;                                   // arrivé deux fois pendant la vérification
    this.vus.set(p.id, p.t + 24 * 3600e3);
    if (p.de === this.moi.empreinte) return;                          // mon propre paquet, revenu par un autre chemin
    if (!this.debitOk(p)) return;

    const sauts = TTL_MAX - p.ttl + 1;
    this.garder(p);
    // relayer d'abord : un nœud lent ne doit pas ralentir le maillage
    if (p.ttl > 1) this.diffuser({ ...p, ttl: p.ttl - 1 }, lien);
    await this.traiter(p, sauts, lien);
  }

  debitOk(p) {
    if (p.type === "annonce" || p.type === "recu") return true;
    const t = this.maintenant();
    const L = (this.debits.get(p.de) || []).filter((x) => x > t - DEBIT.fenetre);
    L.push(t);
    this.debits.set(p.de, L);
    if (L.length <= DEBIT.max) return true;
    if (!this.dejaAlerte.has(p.de)) {
      this.dejaAlerte.add(p.de);
      this.systeme("Un pair envoie trop de messages d'un coup : les suivants sont ignorés quelques secondes.");
      setTimeout(() => this.dejaAlerte.delete(p.de), DEBIT.fenetre);
    }
    return false;
  }

  async traiter(p, sauts, lien) {
    this.connaitre(p, sauts, lien);
    if (this.bloques.has(p.de)) return;
    if (p.type === "msg") return this.lireMessage(p, sauts);
    if (p.type === "prive") return this.lirePrive(p, sauts);
    if (p.type === "recu" && p.a === this.moi.empreinte) return this.emit("recu", { ref: p.ref, de: p.de });
    if (p.type === "depot") return this.recevoirDepot(p, sauts);
    if (p.type === "depart") { this.pairs.delete(p.de); this.emit("pairs"); this.systeme((p.nick || "Un pair") + " a quitté le salon."); }
  }

  /* Toute trace d'un pair dit où il est : nom, clés, distance. */
  connaitre(p, sauts, lien) {
    const avant = this.pairs.get(p.de);
    const nick = p.type === "annonce" ? p.nick : avant ? avant.nick : p.nick || "anonyme";
    const direct = sauts === 1 ? lien : avant && avant.lien && this.liens.has(avant.lien) ? avant.lien : null;
    const pair = { nick, cle: p.cle, ech: p.ech, sauts: direct ? 1 : Math.min(sauts, avant ? avant.sauts : sauts), vu: this.maintenant(), lien: direct };
    this.pairs.set(p.de, pair);
    if (!avant) this.systeme(nick + " est arrivé" + (sauts > 1 ? " (à " + sauts + " sauts)" : "") + ".");
    else if (avant.nick !== nick) this.systeme(avant.nick + " s'appelle désormais " + nick + ".");
    this.emit("pairs");
  }

  async lireMessage(p, sauts, relu = false) {
    const s = this.salons.get(p.salon);
    if (!s) { this.emit("salonVu", p.salon); return; }               // un salon qu'on n'a pas rejoint : relayé, pas affiché
    let texte = p.texte, action = !!p.action, chiffre = false;
    if (p.chiffre) {
      chiffre = true;
      const clair = s.cle ? await C.dechiffrerSalon(s.cle, p.chiffre, p.salon + "|" + p.de) : null;
      if (clair === null) { if (!relu) this.emit("illisible", { salon: p.salon, de: p.de, t: p.t }); return; }
      try { ({ texte, action } = JSON.parse(clair)); } catch (e) { return; }
    } else if (s.cle) {
      return;                                                         // en clair dans un salon protégé : refusé
    }
    const pair = this.pairs.get(p.de);
    this.emit("message", { id: p.id, salon: p.salon, de: p.de, nick: pair ? pair.nick : "?", texte: String(texte).slice(0, TEXTE_MAX), action, t: p.t, chiffre, sauts });
  }

  async lirePrive(p, sauts) {
    if (p.a !== this.moi.empreinte) return;                           // pas pour moi : je l'ai relayé, c'est tout
    const clair = await C.dechiffrerPrive(this.moi, p.boite, p.de + ">" + p.a);
    if (clair === null) return;
    let d;
    try { d = JSON.parse(clair); } catch (e) { return; }
    this.emit("message", { id: p.id, avec: p.de, de: p.de, nick: d.nick, texte: String(d.texte).slice(0, TEXTE_MAX), t: p.t, chiffre: true, sauts });
    await this.emettre("recu", { a: p.de, ref: p.id });
  }

  recevoirDepot(p, sauts) {
    if (this.depots.has(p.id)) return;
    this.depots.set(p.id, { id: p.id, de: p.de, nick: p.nick, texte: String(p.texte).slice(0, TEXTE_MAX), t: p.t, sauts });
    this.emit("depot", this.depots.get(p.id));
  }

  /* ── le temps qui passe : annonces périodiques, oublis ── */
  tic() {
    const t = this.maintenant();
    for (const [fp, p] of this.pairs) {
      if (!p.lien && t - p.vu > PAIR_PERDU) { this.pairs.delete(fp); this.systeme(p.nick + " n'est plus joignable."); this.emit("pairs"); }
    }
    for (const l of this.liens) this.mesurer(l);
    if (this.liens.size) this.annoncer();
  }
  nettoyer() {
    const t = this.maintenant();
    if (this.vus.size > 20000) for (const [id, e] of this.vus) if (e < t || this.vus.size > 15000) this.vus.delete(id);
  }

  async partir() {
    if (this.liens.size) {
      const p = await this.fabriquer("depart", { nick: this.nick });
      this.diffuser(p);
    }
  }
}

/* Ce que couvre la signature : tout le paquet, sauf ce que les relais ont
   le droit de changer (le TTL) et la signature elle-même. */
function sansTransport(p) {
  const { ttl, sig, ...reste } = p;
  return reste;
}

const TYPES = new Set(["annonce", "msg", "prive", "recu", "depot", "depart"]);
const chaine = (x, max) => typeof x === "string" && x.length <= max;
function formeValide(p) {
  if (p.v !== 1 || !TYPES.has(p.type)) return false;
  if (!chaine(p.id, 32) || !chaine(p.de, 64) || !chaine(p.cle, 120) || !chaine(p.ech, 120) || !chaine(p.sig, 200)) return false;
  if (!Number.isInteger(p.ttl) || !Number.isFinite(p.t)) return false;
  if (p.type === "annonce") return chaine(p.nick, 20) && nomValide(p.nick);
  if (p.type === "msg") return salonValide(p.salon) && (p.chiffre ? chaine(p.chiffre.iv, 40) && chaine(p.chiffre.ct, 4000) : chaine(p.texte, TEXTE_MAX));
  if (p.type === "prive") return chaine(p.a, 64) && p.boite && chaine(p.boite.eph, 120) && chaine(p.boite.iv, 40) && chaine(p.boite.ct, 4000);
  if (p.type === "recu") return chaine(p.a, 64) && chaine(p.ref, 32);
  if (p.type === "depot") return chaine(p.texte, TEXTE_MAX) && chaine(p.nick, 20);
  return true;
}
