/* Le banc du moteur : des topologies réelles, des trames réelles, et ce
   qu'on DOIT voir passer. Lancé par « node outils/labo/tests/tout.mjs ». */
import { Network } from "../src/core/Network.js";
import { IPv4Address } from "../src/core/IPv4Address.js";
import { creer, serialiser, charger } from "../src/devices/Fabrique.js";

const IP = (s) => IPv4Address.parse(s);
export const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

function pingSync(net, app, dst, opts = {}) {
  const evts = [];
  app.ip.ping(IP(dst), { ...opts, sur: (e) => evts.push(e) });
  net.executer();
  return evts;
}
const protos = (net) => net.sauts.map((s) => s.protocole + ":" + s.de.app.nom + ">" + s.vers.app.nom);

/* PC0 — Switch0 — Router0 — Switch1 — PC1 : deux réseaux, un routeur. */
function deuxReseaux() {
  const net = new Network();
  const pc0 = creer(net, "pc"), pc1 = creer(net, "pc");
  const s0 = creer(net, "switch"), s1 = creer(net, "switch"), r = creer(net, "routeur");
  net.connecter(pc0.port("Fa0"), s0.port("Fa0/1"), "droit");
  net.connecter(s0.port("Gi0/1"), r.port("Gi0/0"), "droit");
  net.connecter(r.port("Gi0/1"), s1.port("Gi0/1"), "droit");
  net.connecter(s1.port("Fa0/1"), pc1.port("Fa0"), "droit");
  pc0.configurer({ ip: IP("192.168.1.10"), masque: IP("255.255.255.0"), passerelle: IP("192.168.1.1") });
  pc1.configurer({ ip: IP("192.168.2.10"), masque: IP("255.255.255.0"), passerelle: IP("192.168.2.1") });
  const g0 = r.port("Gi0/0"), g1 = r.port("Gi0/1");
  g0.ip = IP("192.168.1.1"); g0.masque = IP("255.255.255.0"); g0.adminUp = true;
  g1.ip = IP("192.168.2.1"); g1.masque = IP("255.255.255.0"); g1.adminUp = true;
  net.evaluerLiens();
  return { net, pc0, pc1, s0, s1, r };
}

test("ping PC → commutateur → routeur → commutateur → PC, avec l'ARP réel", () => {
  const { net, pc0, pc1, s0, r } = deuxReseaux();
  const e = pingSync(net, pc0, "192.168.2.10");
  const rep = e.filter((x) => x.type === "reponse");
  const p = protos(net);
  // 1. le PC demande la MAC de sa passerelle, en diffusion
  ok(p[0] === "ARP:PC0>Switch0", "la première trame doit être l'ARP du PC : " + p[0]);
  ok(net.sauts[0].trame.dst.estDiffusion(), "la requête ARP doit être une diffusion");
  // 2. le routeur doit à son tour demander la MAC du PC1
  ok(net.sauts.some((s) => s.protocole === "ARP" && s.de.app === r && s.trame.payload.targetIp.egale(IP("192.168.2.10"))),
     "le routeur doit faire un ARP pour 192.168.2.10");
  // 3. comme IOS, le routeur jette le premier paquet : 3 réponses sur 4
  ok(rep.length === 3, "attendu 3 réponses (le 1er perdu pendant l'ARP du routeur), obtenu " + rep.length + " " + JSON.stringify(e.map((x) => x.type)));
  ok(e.filter((x) => x.type === "delai").length === 1, "le premier ping doit expirer");
  ok(rep[0].ttl === 127, "TTL reçu attendu 127 (128 − 1 routeur), obtenu " + rep[0].ttl);
  // 4. les tables
  ok(pc0.ip.macDe(IP("192.168.1.1")).egale(r.port("Gi0/0").mac), "ARP du PC0 : la passerelle");
  ok(s0.entreesCam().length === 2, "la CAM de Switch0 doit connaître 2 MAC, elle en a " + s0.entreesCam().length);
  // 5. second ping : 4 sur 4, et plus aucun ARP
  const n0 = net.sauts.length;
  const e2 = pingSync(net, pc0, "192.168.2.10");
  ok(e2.filter((x) => x.type === "reponse").length === 4, "le second ping doit passer 4 fois sur 4");
  ok(!net.sauts.slice(n0).some((s) => s.protocole === "ARP"), "plus d'ARP au second ping");
});

test("le TTL décrémente, et Time Exceeded revient quand il s'épuise", () => {
  const { net, pc0 } = deuxReseaux();
  pingSync(net, pc0, "192.168.2.10");
  const e = pingSync(net, pc0, "192.168.2.10", { n: 1, ttl: 1 });
  ok(e[0].type === "expire" && e[0].de.egale(IP("192.168.1.1")), "TTL 1 : le routeur doit répondre Time Exceeded : " + JSON.stringify(e));
});

test("traceroute : chaque saut se dénonce", () => {
  const { net, pc0 } = deuxReseaux();
  pingSync(net, pc0, "192.168.2.10");
  const sauts = [];
  pc0.ip.traceroute(IP("192.168.2.10"), { sur: (e) => sauts.push(e) });
  net.executer();
  const lignes = sauts.filter((s) => s.type === "saut");
  ok(lignes.length === 2, "2 sauts attendus, obtenu " + lignes.length);
  ok(lignes[0].sondes[0].de.egale(IP("192.168.1.1")), "1er saut : la passerelle");
  ok(lignes[1].sondes[0].de.egale(IP("192.168.2.10")), "2e saut : la destination");
});

test("pas de route : Destination Unreachable signé par le routeur", () => {
  const { net, pc0 } = deuxReseaux();
  pingSync(net, pc0, "192.168.2.10");
  const e = pingSync(net, pc0, "10.9.9.9", { n: 1 });
  ok(e[0].type === "injoignable" && e[0].de.egale(IP("192.168.1.1")), "attendu injoignable par 192.168.1.1 : " + JSON.stringify(e[0]));
});

test("hôte local absent : Destination host unreachable, signé par le PC lui-même", () => {
  const { net, pc0 } = deuxReseaux();
  const e = pingSync(net, pc0, "192.168.1.99", { n: 1 });
  ok(e[0].type === "injoignable" && e[0].local, "attendu un injoignable local : " + JSON.stringify(e[0]));
  ok(net.sauts.filter((s) => s.protocole === "ARP" && s.de.app === pc0).length === 3, "3 requêtes ARP attendues");
});

test("VLAN : même VLAN passe, VLAN différent ne passe pas, le trunk étiquette", () => {
  const net = new Network();
  const s0 = creer(net, "switch"), s1 = creer(net, "switch");
  const a = creer(net, "pc"), b = creer(net, "pc"), c = creer(net, "pc");
  net.connecter(s0.port("Gi0/1"), s1.port("Gi0/1"), "croise");
  net.connecter(a.port("Fa0"), s0.port("Fa0/1"), "droit");
  net.connecter(b.port("Fa0"), s1.port("Fa0/1"), "droit");
  net.connecter(c.port("Fa0"), s1.port("Fa0/2"), "droit");
  for (const s of [s0, s1]) { s.vlans.set(10, { nom: "ADMIN" }); s.vlans.set(20, { nom: "ELEVES" }); s.port("Gi0/1").mode = "trunk"; }
  s0.port("Fa0/1").accessVlan = 10; s1.port("Fa0/1").accessVlan = 10; s1.port("Fa0/2").accessVlan = 20;
  const m = IP("255.255.255.0");
  a.configurer({ ip: IP("10.0.0.1"), masque: m }); b.configurer({ ip: IP("10.0.0.2"), masque: m }); c.configurer({ ip: IP("10.0.0.3"), masque: m });
  net.evaluerLiens();
  const e1 = pingSync(net, a, "10.0.0.2");
  ok(e1.filter((x) => x.type === "reponse").length === 4, "même VLAN 10 : 4 réponses");
  const tagues = net.sauts.filter((s) => s.cable.a.appareil.type === "switch" && s.cable.b.appareil.type === "switch");
  ok(tagues.length && tagues.every((s) => s.trame.vlan === 10), "sur le trunk, chaque trame doit porter VLAN 10");
  ok(!net.sauts.some((s) => s.vers.app === c), "rien ne doit atteindre le PC du VLAN 20");
  const e2 = pingSync(net, a, "10.0.0.3", { n: 1 });
  ok(e2[0].type === "injoignable", "VLAN différent : injoignable (ARP sans réponse)");
});

test("router-on-a-stick : routage inter-VLAN par sous-interfaces dot1Q", () => {
  const net = new Network();
  const s = creer(net, "switch"), r = creer(net, "routeur");
  const a = creer(net, "pc"), b = creer(net, "pc");
  s.vlans.set(10, { nom: "V10" }); s.vlans.set(20, { nom: "V20" });
  net.connecter(r.port("Gi0/0"), s.port("Gi0/1"), "droit");
  net.connecter(a.port("Fa0"), s.port("Fa0/1"), "droit");
  net.connecter(b.port("Fa0"), s.port("Fa0/2"), "droit");
  s.port("Gi0/1").mode = "trunk"; s.port("Fa0/1").accessVlan = 10; s.port("Fa0/2").accessVlan = 20;
  r.port("Gi0/0").adminUp = true;
  const m = IP("255.255.255.0");
  const s10 = r.creerSous("GigabitEthernet0/0.10"); s10.dot1q = 10; s10.ip = IP("192.168.10.1"); s10.masque = m;
  const s20 = r.creerSous("GigabitEthernet0/0.20"); s20.dot1q = 20; s20.ip = IP("192.168.20.1"); s20.masque = m;
  a.configurer({ ip: IP("192.168.10.2"), masque: m, passerelle: IP("192.168.10.1") });
  b.configurer({ ip: IP("192.168.20.2"), masque: m, passerelle: IP("192.168.20.1") });
  net.evaluerLiens();
  pingSync(net, a, "192.168.20.2");
  const e = pingSync(net, a, "192.168.20.2");
  ok(e.filter((x) => x.type === "reponse").length === 4, "inter-VLAN : 4 réponses au second ping, obtenu " + JSON.stringify(e.map((x) => x.type)));
  const versRouteur = net.sauts.filter((x) => x.vers.app === r && x.protocole === "ICMP");
  ok(versRouteur.some((x) => x.trame.vlan === 10) && net.sauts.some((x) => x.de.app === r && x.trame.vlan === 20),
     "le trunk doit porter VLAN 10 vers le routeur et VLAN 20 au retour");
});

test("DHCP : DORA complet depuis un routeur, avec adresses exclues", () => {
  const net = new Network();
  const s = creer(net, "switch"), r = creer(net, "routeur"), pc = creer(net, "pc");
  net.connecter(r.port("Gi0/0"), s.port("Gi0/1"), "droit");
  net.connecter(pc.port("Fa0"), s.port("Fa0/1"), "droit");
  const g = r.port("Gi0/0"); g.adminUp = true; g.ip = IP("192.168.1.1"); g.masque = IP("255.255.255.0");
  r.dhcp.pools.push({ nom: "LAN", reseau: IP("192.168.1.0"), masque: IP("255.255.255.0"), routeur: IP("192.168.1.1"), dns: IP("8.8.8.8") });
  r.dhcp.exclues.push({ de: IP("192.168.1.1"), a: IP("192.168.1.10") });
  net.evaluerLiens();
  let res = null;
  pc.demanderDhcp((x) => { res = x; });
  net.executer();
  const ops = net.sauts.filter((x) => x.protocole === "DHCP").map((x) => x.trame.payload.payload.data.op);
  ok(JSON.stringify(ops.filter((o, i) => ops.indexOf(o) === i)) === '["DISCOVER","OFFER","REQUEST","ACK"]', "DORA attendu : " + ops);
  ok(res && res.type === "ok" && res.ip.egale(IP("192.168.1.11")), "1re adresse libre après les exclues : 192.168.1.11, obtenu " + (res && res.ip));
  ok(pc.config.passerelle.egale(IP("192.168.1.1")) && pc.config.dns.egale(IP("8.8.8.8")), "passerelle et DNS reçus");
  const e = pingSync(net, pc, "192.168.1.1");
  ok(e.filter((x) => x.type === "reponse").length >= 3, "le PC configuré par DHCP joint sa passerelle");
});

test("DHCP relayé (ip helper-address), DNS et HTTP sur un serveur", () => {
  const { net, pc0, pc1, r } = deuxReseaux();
  // PC1 devient le serveur : on le remplace par un vrai serveur
  const srv = creer(net, "serveur");
  const s1 = net.parNom("Switch1");
  net.connecter(srv.port("Fa0"), s1.port("Fa0/2"), "droit");
  srv.configurer({ ip: IP("192.168.2.100"), masque: IP("255.255.255.0"), passerelle: IP("192.168.2.1") });
  srv.dhcp.actif = true;
  srv.dhcp.pools = [{ nom: "LAN1", reseau: IP("192.168.1.0"), masque: IP("255.255.255.0"), routeur: IP("192.168.1.1"),
    dns: IP("192.168.2.100"), debut: IP("192.168.1.50"), max: 50 }];
  srv.dns.actif = true; srv.dns.enregistrements = [{ nom: "www.ciel.lan", ip: "192.168.2.100" }];
  r.port("Gi0/0").helper = IP("192.168.2.100");
  net.evaluerLiens();
  let res = null;
  pc0.demanderDhcp((x) => { res = x; });
  net.executer();
  ok(res && res.type === "ok" && res.ip.egale(IP("192.168.1.50")), "DHCP relayé : 192.168.1.50 attendu, obtenu " + JSON.stringify(res && res.ip));
  let dns = null;
  pc0.resoudre("www.ciel.lan", (x) => { dns = x; }); net.executer();
  ok(dns && dns.ip && dns.ip.egale(IP("192.168.2.100")), "DNS : " + JSON.stringify(dns));
  let web = null;
  pc0.http("www.ciel.lan", (x) => { web = x; }); net.executer();
  ok(web && web.ok && /200 OK/.test(web.reponse), "HTTP : " + JSON.stringify(web));
  ok(net.sauts.some((x) => x.protocole === "HTTP" && x.trame.payload.payload.flags === "SYN,ACK"), "la poignée de main TCP doit passer");
  ok(net.sauts.some((x) => x.vers.app === pc0 && x.protocole === "HTTP" && /200 OK/.test(x.trame.payload.payload.data || "")),
     "la page doit arriver jusqu'au PC");
});

test("tempête de diffusion : deux commutateurs bouclés sans STP", () => {
  const net = new Network();
  const s0 = creer(net, "switch"), s1 = creer(net, "switch"), a = creer(net, "pc");
  net.connecter(s0.port("Fa0/23"), s1.port("Fa0/23"), "croise");
  net.connecter(s0.port("Fa0/24"), s1.port("Fa0/24"), "croise");
  net.connecter(a.port("Fa0"), s0.port("Fa0/1"), "droit");
  a.configurer({ ip: IP("10.0.0.1"), masque: IP("255.0.0.0") });
  net.evaluerLiens();
  let tempete = false;
  net.on("tempete", () => { tempete = true; });
  a.ip.ping(IP("10.0.0.2"), { n: 1, sur: () => {} });
  net.executer();
  ok(tempete, "la boucle doit être détectée comme une tempête de diffusion");
});

test("câbles : droit / croisé, auto-MDIX en Gigabit, console", () => {
  const net = new Network();
  const s0 = creer(net, "switch"), s1 = creer(net, "switch"), a = creer(net, "pc"), b = creer(net, "pc");
  const c1 = net.connecter(s0.port("Fa0/1"), s1.port("Fa0/1"), "droit");
  ok(!c1.valide() && !s0.port("Fa0/1").estUp(), "droit entre deux commutateurs (Fa) : lien coupé");
  const c2 = net.connecter(s0.port("Gi0/1"), s1.port("Gi0/1"), "droit");
  ok(c2.valide(), "Gigabit : auto-MDIX, le droit passe");
  const c3 = net.connecter(a.port("Fa0"), s0.port("Fa0/2"), "croise");
  ok(!c3.valide(), "croisé entre un PC et un commutateur : coupé");
  const c4 = net.connecter(b.port("RS232"), s1.port("Console"), "console");
  ok(c4.valide(), "console RS-232 ↔ Console");
});

test("sauvegarde JSON : aller-retour sans perte", () => {
  const { net, pc0 } = deuxReseaux();
  const j = JSON.parse(JSON.stringify(serialiser(net)));
  const net2 = new Network();
  charger(net2, j);
  const pc = net2.parNom("PC0");
  ok(pc.carte.ip.egale(IP("192.168.1.10")) && pc.carte.mac.egale(pc0.carte.mac), "PC0 relu avec son IP et sa MAC");
  const e = pingSync(net2, pc, "192.168.2.10");
  ok(e.filter((x) => x.type === "reponse").length === 3, "la topologie relue route comme l'originale");
});
