/* Le banc du salon : cryptographie et maillage, sans navigateur. Les
   « liens » sont des tuyaux en mémoire ; tout le reste est le vrai code. */
import * as C from "../src/crypto.js";
import { Noeud, TTL_MAX, SALON_DEFAUT } from "../src/noeud.js";

export const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/* Deux bouts d'un tuyau : ce qui entre d'un côté sort de l'autre. */
let nLien = 0;
function tuyau() {
  const a = { id: "l" + ++nLien, type: "memoire" }, b = { id: "l" + ++nLien, type: "memoire" };
  a.envoyer = (x) => setTimeout(() => b.surMessage && b.surMessage(x), 0);
  b.envoyer = (x) => setTimeout(() => a.surMessage && a.surMessage(x), 0);
  a.fermer = () => { a.surFermeture && a.surFermeture(); b.surFermeture && b.surFermeture(); };
  b.fermer = a.fermer;
  return [a, b];
}
function relier(x, y) { const [a, b] = tuyau(); x.ajouterLien(a); y.ajouterLien(b); return a; }
async function noeuds(...noms) {
  const out = [];
  for (const n of noms) {
    const nd = new Noeud({ identite: await C.creerIdentite(), nick: n });
    nd.recus = [];
    nd.on("message", (m) => nd.recus.push(m));
    out.push(nd);
  }
  return out;
}

test("identité : empreinte auto-certifiée, signature vérifiée, altération détectée", async () => {
  const id = await C.creerIdentite();
  ok(id.empreinte.length === 64 && id.empreinte === await C.empreinteDe(id.pubSigne, id.pubEchange), "empreinte = SHA-256 des deux clés publiques");
  const obj = { texte: "bonjour", t: 1 };
  const sig = await C.signer(id, obj);
  ok(await C.verifier(id.pubSigne, sig, obj), "signature valide");
  ok(!(await C.verifier(id.pubSigne, sig, { texte: "bonjouR", t: 1 })), "un caractère changé : signature refusée");
  const autre = await C.creerIdentite();
  ok(!(await C.verifier(autre.pubSigne, sig, obj)), "la clé d'un autre ne vérifie pas");
  ok(C.canonique({ b: 1, a: { d: 2, c: 3 } }) === '{"a":{"c":3,"d":2},"b":1}', "JSON canonique");
});

test("message privé (ECIES) : seul le destinataire lit, et le contexte est lié", async () => {
  const [a, b, c] = [await C.creerIdentite(), await C.creerIdentite(), await C.creerIdentite()];
  const boite = await C.chiffrerPrive(b.pubEchange, "rendez-vous à 14 h", "A>B");
  ok(await C.dechiffrerPrive(b, boite, "A>B") === "rendez-vous à 14 h", "B lit");
  ok(await C.dechiffrerPrive(c, boite, "A>B") === null, "C ne lit pas");
  ok(await C.dechiffrerPrive(b, boite, "C>B") === null, "le même chiffré présenté comme venant d'un autre : refusé");
  const b2 = await C.chiffrerPrive(b.pubEchange, "rendez-vous à 14 h", "A>B");
  ok(b2.ct !== boite.ct && b2.eph !== boite.eph, "une clé éphémère neuve par message");
});

test("salon à mot de passe : PBKDF2 + AES-GCM, le mauvais mot de passe ne lit rien", async () => {
  const k1 = await C.cleDeSalon("#cyber", "secret123"), k2 = await C.cleDeSalon("#cyber", "secret123"), k3 = await C.cleDeSalon("#cyber", "Secret123");
  const b = await C.chiffrerSalon(k1, "le code est 42", "#cyber|x");
  ok(await C.dechiffrerSalon(k2, b, "#cyber|x") === "le code est 42", "même mot de passe : lu");
  ok(await C.dechiffrerSalon(k3, b, "#cyber|x") === null, "une majuscule de différence : rien");
  const k4 = await C.cleDeSalon("#autre", "secret123");
  ok(await C.dechiffrerSalon(k4, b, "#cyber|x") === null, "même mot de passe, autre salon : rien (le nom du salon sale la clé)");
});

test("maillage en ligne A—B—C—D : D reçoit A à 3 sauts, chacun une seule fois", async () => {
  const [a, b, c, d] = await noeuds("alice", "bob", "chloe", "dan");
  relier(a, b); relier(b, c); relier(c, d);
  await attendre(60);
  ok(d.pairs.has(a.moi.empreinte) && d.pairs.get(a.moi.empreinte).sauts === 3, "D connaît A à 3 sauts : " + (d.pairs.get(a.moi.empreinte) || {}).sauts);
  await a.parler(SALON_DEFAUT, "salut tout le monde");
  await attendre(60);
  for (const n of [b, c, d]) ok(n.recus.filter((m) => m.texte === "salut tout le monde").length === 1, n.nick + " reçoit une fois");
  ok(d.recus.find((m) => m.texte === "salut tout le monde").sauts === 3, "3 sauts");
});

test("triangle bouclé : le cache anti-doublons empêche le message de tourner", async () => {
  const [a, b, c] = await noeuds("alice", "bob", "chloe");
  relier(a, b); relier(b, c); relier(c, a);
  await attendre(40);
  await a.parler(SALON_DEFAUT, "boucle ?");
  await attendre(60);
  ok(b.recus.length === 1 && c.recus.length === 1, "une fois chacun : " + b.recus.length + "/" + c.recus.length);
});

test("TTL : sur une chaîne de 9 nœuds, le message s'arrête après 7 sauts", async () => {
  const L = await noeuds("n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9");
  for (let i = 0; i < 8; i++) relier(L[i], L[i + 1]);
  await attendre(100);
  await L[0].parler(SALON_DEFAUT, "loin ?");
  await attendre(100);
  ok(L[7].recus.some((m) => m.texte === "loin ?"), "n8 (7 sauts) reçoit");
  ok(!L[8].recus.some((m) => m.texte === "loin ?"), "n9 (8 sauts) ne reçoit pas");
});

test("message privé à travers le maillage : B et C relaient sans lire, D accuse réception", async () => {
  const [a, b, c, d] = await noeuds("alice", "bob", "chloe", "dan");
  relier(a, b); relier(b, c); relier(c, d);
  await attendre(60);
  let recu = null;
  a.on("recu", (r) => { recu = r; });
  const p = await a.prive(d.moi.empreinte, "le sujet du DS est sur la page 12");
  await attendre(80);
  ok(d.recus.some((m) => m.avec === a.moi.empreinte && m.texte === "le sujet du DS est sur la page 12"), "D lit");
  ok(!b.recus.length && !c.recus.length, "B et C n'affichent rien");
  const vuParB = [...b.stock.values()].find((s) => s.paquet.id === p.id);
  ok(vuParB && !JSON.stringify(vuParB.paquet).includes("page 12"), "B garde le paquet, chiffré");
  ok(await C.dechiffrerPrive(b.moi, vuParB.paquet.boite, a.moi.empreinte + ">" + d.moi.empreinte) === null, "B ne peut pas le déchiffrer");
  ok(recu && recu.ref === p.id, "A reçoit l'accusé de réception de D");
});

test("salon protégé : même mot de passe lu, mauvais mot de passe illisible, absent ne voit rien", async () => {
  const [a, b, c, d] = await noeuds("alice", "bob", "chloe", "dan");
  relier(a, b); relier(b, c); relier(c, d);
  await a.rejoindre("#cyber", "secret123");
  await d.rejoindre("#cyber", "secret123");
  await b.rejoindre("#cyber", "mauvais");
  let illisible = 0;
  b.on("illisible", () => illisible++);
  await attendre(40);
  await a.parler("#cyber", "réunion à midi");
  await attendre(80);
  ok(d.recus.some((m) => m.salon === "#cyber" && m.texte === "réunion à midi" && m.chiffre), "D lit");
  ok(!b.recus.some((m) => m.salon === "#cyber") && illisible === 1, "B (mauvais mot de passe) : illisible");
  ok(!c.recus.length, "C relaie sans rien afficher");
});

test("stocker et retransmettre : un message privé attend que son destinataire revienne", async () => {
  const [a, b, d] = await noeuds("alice", "bob", "dan");
  relier(a, b);
  const lienBD = relier(b, d);
  await attendre(60);
  lienBD.fermer();                                   // D s'en va
  await attendre(20);
  await a.prive(d.moi.empreinte, "tu as oublié ta clé USB");
  await a.parler(SALON_DEFAUT, "message du matin");
  await attendre(40);
  ok(!d.recus.length, "D, absent, n'a rien reçu");
  relier(b, d);                                      // D revient : B lui donne ce qu'il garde
  await attendre(80);
  ok(d.recus.some((m) => m.texte === "tu as oublié ta clé USB"), "le message privé arrive au retour");
  ok(d.recus.some((m) => m.texte === "message du matin"), "le message public aussi");
});

test("falsification : texte modifié en route, ou empreinte usurpée → jeté et pas relayé", async () => {
  const [a, b, c] = await noeuds("alice", "bob", "chloe");
  relier(b, c);
  await attendre(30);
  const vrai = await a.fabriquer("msg", { salon: SALON_DEFAUT, texte: "je suis alice" });
  const [lb] = tuyau();
  b.ajouterLien(lb);
  await b.recevoir(lb, JSON.stringify({ ...vrai, texte: "je suis alice et je donne mes notes" }));
  await attendre(40);
  ok(!b.recus.length && !c.recus.length, "texte modifié : refusé par B, rien n'arrive à C");
  const usurpe = await c.fabriquer("msg", { salon: SALON_DEFAUT, texte: "c'est alice" });
  await b.recevoir(lb, JSON.stringify({ ...usurpe, de: a.moi.empreinte }));
  ok(!b.recus.length, "empreinte d'alice sur des clés de chloé : refusé");
  await b.recevoir(lb, JSON.stringify(vrai));
  await attendre(40);
  ok(b.recus.length === 1 && c.recus.length === 1, "le vrai paquet passe, et il est relayé");
});

test("un retardataire apprend les pseudos des pairs lointains (annonces gardées)", async () => {
  const [a, b, c] = await noeuds("alice", "bob", "chloe");
  relier(a, b);
  await attendre(40);
  relier(b, c);                                      // chloé arrive après : alice est à 2 sauts
  await attendre(60);
  const p = c.pairs.get(a.moi.empreinte);
  ok(p && p.nick === "alice" && p.sauts === 2, "chloé connaît alice par son nom : " + JSON.stringify(p && { n: p.nick, s: p.sauts }));
  ok([...b.stock.values()].filter((s) => s.paquet.type === "annonce" && s.paquet.de === a.moi.empreinte).length === 1, "une seule annonce gardée par pair");
});

test("dépôt de note : visible des nouveaux venus, 24 h durant", async () => {
  const [a, b, e] = await noeuds("alice", "bob", "emma");
  relier(a, b);
  await attendre(30);
  await a.deposer("la clé de la salle B12 est chez le CPE");
  await attendre(30);
  const notes = [];
  e.on("depot", (n) => notes.push(n));
  relier(b, e);
  await attendre(60);
  ok(notes.some((n) => n.texte === "la clé de la salle B12 est chez le CPE" && n.nick === "alice"), "emma, arrivée après, voit la note");
});

test("débit : au-delà de 25 messages en 10 s, un auteur est ignoré", async () => {
  const [a, b] = await noeuds("alice", "bob");
  relier(a, b);
  await attendre(30);
  for (let i = 0; i < 40; i++) await a.parler(SALON_DEFAUT, "spam " + i);
  await attendre(120);
  ok(b.recus.length === 25, "25 reçus sur 40 : " + b.recus.length);
});
