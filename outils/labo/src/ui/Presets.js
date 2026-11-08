/* Les labs intégrés, prêts à tester dès l'ouverture : cinq pour découvrir,
   trois pannes à trouver.

   Ils sont construits comme un élève les construirait : les équipements
   posés, câblés, et les routeurs et commutateurs configurés en TAPANT des
   commandes IOS — passées par le même analyseur que le terminal. Un lab
   qui se charge est donc aussi un banc de la CLI.

   « objectifs » : ce que le labo vérifie lui-même (ui/Objectifs.js), sur
   une copie du réseau, quand on clique « Vérifier ». Une panne a aussi sa
   « solution », repliée : on la lit après avoir cherché, pas avant. */

import { creer } from "../devices/Fabrique.js";
import { IOSConsole } from "../cli/IOSParser.js";
import { IPv4Address } from "../core/IPv4Address.js";

const IP = (s) => IPv4Address.parse(s);
const MUET = { ligne() {}, lignes() {}, ajouter() {}, occupe() {}, fin() {}, effacer() {} };

function taper(app, lignes) {
  const c = new IOSConsole(app);
  ["enable", "configure terminal"].concat(lignes, ["end"]).forEach((l) => c.executer(l, MUET));
  app.startup = null;
}
function hote(reseau, type, nom, x, y, cfg) {
  const a = creer(reseau, type, { nom, x, y });
  if (cfg && cfg.dhcp) a.config.dhcp = true;
  else if (cfg) a.configurer({ ip: IP(cfg.ip), masque: IP(cfg.masque || "255.255.255.0"), passerelle: IP(cfg.passerelle), dns: IP(cfg.dns) });
  return a;
}
const cable = (reseau, a, pa, b, pb, type = "droit") => reseau.connecter(a.port(pa), b.port(pb), type);

/* La maquette du lab 3, réutilisée par deux pannes : chacune n'y change
   qu'UNE ligne, et c'est cette ligne qu'il faut trouver. */
function interVlan(reseau, { pool = "192.168.10.0", tag20 = 20 } = {}) {
  const r = creer(reseau, "routeur", { nom: "R1", x: 0, y: -190 });
  taper(r, ["hostname R1", "no ip domain-lookup",
    "interface gi0/0", "no shutdown",
    "interface gi0/0.10", "description VLAN 10 - ADMIN", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0",
    "interface gi0/0.20", "description VLAN 20 - SERVEURS", "encapsulation dot1Q " + tag20, "ip address 192.168.20.1 255.255.255.0",
    "exit", "ip dhcp excluded-address 192.168.10.1 192.168.10.9",
    "ip dhcp pool VLAN10", "network " + pool + " 255.255.255.0", "default-router 192.168.10.1", "dns-server 192.168.20.10"]);
  const s = creer(reseau, "switch", { nom: "SW1", x: 0, y: 0 });
  taper(s, ["hostname SW1", "no ip domain-lookup", "vlan 10", "name ADMIN", "vlan 20", "name SERVEURS",
    "interface range fa0/1 - 2", "switchport mode access", "switchport access vlan 10",
    "interface range fa0/3 - 4", "switchport mode access", "switchport access vlan 20",
    "interface gi0/1", "switchport mode trunk"]);
  cable(reseau, r, "Gi0/0", s, "Gi0/1");
  const a = hote(reseau, "pc", "PC-A", -300, 190, { dhcp: true });
  const b = hote(reseau, "pc", "PC-B", -110, 220, { ip: "192.168.10.20", passerelle: "192.168.10.1", dns: "192.168.20.10" });
  const c = hote(reseau, "portable", "PC-C", 110, 220, { ip: "192.168.20.20", passerelle: "192.168.20.1", dns: "192.168.20.10" });
  const srv = hote(reseau, "serveur", "SRV", 300, 190, { ip: "192.168.20.10", passerelle: "192.168.20.1", dns: "192.168.20.10" });
  srv.dns = { actif: true, enregistrements: [{ nom: "www.ciel.lan", ip: "192.168.20.10" }, { nom: "srv.ciel.lan", ip: "192.168.20.10" }] };
  srv.web = { actif: true, page: "<h1>BTS CIEL : serveur du labo</h1>\n<p>Si vous lisez ceci, le DNS, le routage inter-VLAN et TCP fonctionnent.</p>" };
  cable(reseau, a, "Fa0", s, "Fa0/1");
  cable(reseau, b, "Fa0", s, "Fa0/2");
  cable(reseau, c, "Fa0", s, "Fa0/3");
  cable(reseau, srv, "Fa0", s, "Fa0/4");
}

/* La maquette du lab 5 ; « regle » pose le PAT d'emblée. */
function sortieInternet(reseau, { regle = false, passerellePc2 = "192.168.1.1" } = {}) {
  const r1 = creer(reseau, "routeur", { nom: "R1", x: -110, y: -150 });
  const fai = creer(reseau, "routeur", { nom: "FAI", x: 230, y: -150 });
  const s = creer(reseau, "switch", { nom: "SW1", x: -110, y: 30 });
  cable(reseau, r1, "Se0/0/0", fai, "Se0/0/0", "serie");
  taper(r1, ["hostname R1", "no ip domain-lookup",
    "interface gi0/0", "description LAN prive", "ip address 192.168.1.1 255.255.255.0", "ip nat inside", "no shutdown",
    "interface s0/0/0", "description Vers le FAI", "ip address 209.165.200.225 255.255.255.252", "ip nat outside", "clock rate 64000", "no shutdown",
    "exit", "ip route 0.0.0.0 0.0.0.0 s0/0/0"].concat(regle
      ? ["access-list 1 permit 192.168.1.0 0.0.0.255", "ip nat inside source list 1 interface s0/0/0 overload"] : []));
  taper(fai, ["hostname FAI", "no ip domain-lookup",
    "interface s0/0/0", "ip address 209.165.200.226 255.255.255.252", "no shutdown",
    "interface gi0/0", "ip address 8.8.8.1 255.255.255.0", "no shutdown"]);
  taper(s, ["hostname SW1", "no ip domain-lookup"]);
  cable(reseau, r1, "Gi0/0", s, "Gi0/1");
  const a = hote(reseau, "pc", "PC1", -260, 200, { ip: "192.168.1.10", passerelle: "192.168.1.1" });
  const b = hote(reseau, "portable", "PC2", 40, 200, { ip: "192.168.1.11", passerelle: passerellePc2 });
  const web = hote(reseau, "serveur", "WEB", 230, 40, { ip: "8.8.8.8", passerelle: "8.8.8.1" });
  web.web = { actif: true, page: "<h1>Bienvenue sur Internet</h1>\n<p>Votre adresse privée a été traduite par R1 : c'est 209.165.200.225 qui me parle.</p>" };
  cable(reseau, a, "Fa0", s, "Fa0/1");
  cable(reseau, b, "Fa0", s, "Fa0/2");
  cable(reseau, fai, "Gi0/0", web, "Fa0", "croise");
}

export const LABS = [
  {
    id: "lab1",
    titre: "Lab 1 : Un LAN, un commutateur, l'ARP",
    court: "LAN simple et ARP",
    resume: "Trois PC sur un commutateur, dans le même réseau 192.168.1.0/24. On regarde l'ARP remplir les tables, et le commutateur apprendre les adresses MAC.",
    etapes: [
      "Double-cliquez <b>PC-A</b> pour ouvrir son terminal, et tapez <code>arp -a</code> : la table est vide.",
      "Tapez <code>ping 192.168.1.11</code> : quatre réponses de PC-B.",
      "Retapez <code>arp -a</code> : PC-A connaît maintenant l'adresse MAC de PC-B.",
      "Ouvrez <b>SW1</b> : <code>en</code>, puis <code>show mac address-table</code>. Deux MAC, chacune sur son port.",
      "Passez en <b>Simulation</b>, tapez <code>arp -d</code> puis <code>ping 192.168.1.12</code> sur PC-A, et avancez pas à pas : la requête ARP est diffusée à tous, seul PC-C répond. Cliquez une enveloppe pour l'ouvrir.",
    ],
    construire(reseau) {
      const sw = creer(reseau, "switch", { nom: "SW1", x: 0, y: 0 });
      taper(sw, ["hostname SW1", "no ip domain-lookup"]);
      const a = hote(reseau, "pc", "PC-A", -230, 190, { ip: "192.168.1.10" });
      const b = hote(reseau, "pc", "PC-B", 0, 220, { ip: "192.168.1.11" });
      const c = hote(reseau, "portable", "PC-C", 230, 190, { ip: "192.168.1.12" });
      cable(reseau, a, "Fa0", sw, "Fa0/1");
      cable(reseau, b, "Fa0", sw, "Fa0/2");
      cable(reseau, c, "Fa0", sw, "Fa0/3");
    },
  },
  {
    id: "lab2",
    titre: "Lab 2 : VLAN et trunk 802.1Q",
    court: "VLAN et trunk",
    resume: "Deux commutateurs reliés par un trunk, deux VLAN : ADMIN (10) et ELEVES (20). Le trafic d'un VLAN traverse le trunk étiqueté, et ne rencontre jamais l'autre VLAN.",
    etapes: [
      "Sur <b>PC-A</b> (VLAN 10) : <code>ping 192.168.10.2</code>, PC-C, VLAN 10, de l'autre côté du trunk : ça passe.",
      "Sur <b>SW1</b> : <code>en</code>, <code>show vlan brief</code> puis <code>show interfaces trunk</code>.",
      "En <b>Simulation</b>, refaites le ping et cliquez une trame sur le câble entre SW1 et SW2 : la couche 2 montre l'étiquette <b>VLAN 10</b>. La même trame, entre SW2 et PC-C, n'en a plus.",
      "Sur PC-A : <code>ping 192.168.20.1</code> (PC-B, VLAN 20), échec : deux VLAN sont deux réseaux, il faut un routeur. C'est le lab 3.",
      "Bonus : sur SW1, <code>conf t</code>, <code>int gi0/1</code>, <code>switchport trunk allowed vlan 20</code>, et le ping du VLAN 10 ne passe plus.",
    ],
    construire(reseau) {
      const s1 = creer(reseau, "switch", { nom: "SW1", x: -200, y: 0 });
      const s2 = creer(reseau, "switch", { nom: "SW2", x: 200, y: 0 });
      for (const [s, nom] of [[s1, "SW1"], [s2, "SW2"]]) {
        taper(s, ["hostname " + nom, "no ip domain-lookup", "vlan 10", "name ADMIN", "vlan 20", "name ELEVES",
          "interface fa0/1", "switchport mode access", "switchport access vlan 10",
          "interface fa0/2", "switchport mode access", "switchport access vlan 20",
          "interface gi0/1", "switchport mode trunk"]);
      }
      cable(reseau, s1, "Gi0/1", s2, "Gi0/1", "croise");
      const a = hote(reseau, "pc", "PC-A", -320, 200, { ip: "192.168.10.1" });
      const b = hote(reseau, "pc", "PC-B", -110, 220, { ip: "192.168.20.1" });
      const c = hote(reseau, "pc", "PC-C", 110, 220, { ip: "192.168.10.2" });
      const d = hote(reseau, "pc", "PC-D", 320, 200, { ip: "192.168.20.2" });
      cable(reseau, a, "Fa0", s1, "Fa0/1");
      cable(reseau, b, "Fa0", s1, "Fa0/2");
      cable(reseau, c, "Fa0", s2, "Fa0/1");
      cable(reseau, d, "Fa0", s2, "Fa0/2");
    },
  },
  {
    id: "lab3",
    titre: "Lab 3 : Routage inter-VLAN (router-on-a-stick), DHCP, DNS",
    court: "Router-on-a-stick",
    resume: "Un routeur, un seul câble vers le commutateur, deux sous-interfaces dot1Q : les VLAN 10 et 20 se parlent. R1 distribue les adresses du VLAN 10 par DHCP ; le serveur du VLAN 20 répond au DNS et au web.",
    etapes: [
      "Sur <b>PC-A</b> (en DHCP) : <code>ipconfig /renew</code>, Discover, Offer, Request, Ack : il reçoit 192.168.10.10.",
      "Toujours sur PC-A : <code>ping 192.168.20.10</code>, le serveur, dans l'autre VLAN : le TTL reçu est 127, il y a eu un routeur.",
      "<code>tracert 192.168.20.20</code> : le premier saut est la sous-interface Gi0/0.10 de R1.",
      "<code>nslookup www.ciel.lan</code> puis <code>curl http://www.ciel.lan</code> : DNS, puis poignée de main TCP et page web.",
      "Sur <b>R1</b> : <code>en</code>, <code>show ip route</code>, <code>show ip interface brief</code>, <code>show ip dhcp binding</code>.",
      "En <b>Simulation</b> : un ping de PC-A vers PC-C monte vers R1 étiqueté VLAN 10, et redescend étiqueté VLAN 20, sur le MÊME câble.",
    ],
    construire(reseau) { interVlan(reseau); },
  },
  {
    id: "lab4",
    titre: "Lab 4 : Deux sites, une liaison série, RIP v2",
    court: "Série et RIP",
    resume: "Deux routeurs reliés par une liaison série (R1 côté DCE, horloge à 64 000). R1 annonce déjà ses réseaux en RIP v2 ; R2 ne fait encore rien. Tant que R2 se tait, les deux LAN ne se voient pas.",
    etapes: [
      "Sur <b>PC1</b> : <code>ping 192.168.2.10</code>, échec : R1 n'a aucune route vers le LAN de R2.",
      "Sur <b>R1</b> : <code>en</code>, <code>show ip interface brief</code> (Serial0/0/0 up / up), <code>show controllers serial 0/0/0</code> (R1 est le DCE), <code>show ip route</code>.",
      "Sur <b>R2</b>, faites-le parler : <code>en</code>, <code>conf t</code>, <code>router rip</code>, <code>version 2</code>, <code>no auto-summary</code>, <code>network 192.168.2.0</code>, <code>network 10.0.0.0</code>, <code>end</code>.",
      "Sur R1 : <code>show ip route</code>, la ligne <code>R 192.168.2.0/24 [120/1] via 10.0.0.2</code> est apparue. <code>show ip protocols</code> dit d'où elle vient.",
      "Sur PC1 : <code>ping 192.168.2.10</code>, ça passe, avec un TTL de 126 : deux routeurs traversés.",
      "Bonus : sur R1, <code>debug ip rip</code>, puis éteignez la liaison sur R2 (<code>int s0/0/0</code>, <code>shutdown</code>) : la route disparaît. En <b>Simulation</b>, cochez RIP et regardez les mises à jour passer.",
    ],
    objectifs: [
      { texte: "R1 a appris le LAN du site 2 par RIP", test: (s) => s.ios("R1", ["show ip route"]).some((l) => /^R\s+192\.168\.2\.0\/24/.test(l)) },
      { texte: "PC1 joint PC2 (192.168.2.10)", test: (s) => s.joint("PC1", "192.168.2.10") },
      { texte: "PC2 joint PC1 (192.168.1.10)", test: (s) => s.joint("PC2", "192.168.1.10") },
    ],
    construire(reseau) {
      const r1 = creer(reseau, "routeur", { nom: "R1", x: -200, y: -150 });
      const r2 = creer(reseau, "routeur", { nom: "R2", x: 200, y: -150 });
      const s1 = creer(reseau, "switch", { nom: "SW1", x: -200, y: 30 });
      const s2 = creer(reseau, "switch", { nom: "SW2", x: 200, y: 30 });
      cable(reseau, r1, "Se0/0/0", r2, "Se0/0/0", "serie");
      taper(r1, ["hostname R1", "no ip domain-lookup",
        "interface gi0/0", "description LAN du site 1", "ip address 192.168.1.1 255.255.255.0", "no shutdown",
        "interface s0/0/0", "description Liaison vers R2", "ip address 10.0.0.1 255.255.255.252", "clock rate 64000", "no shutdown",
        "router rip", "version 2", "no auto-summary", "passive-interface gi0/0", "network 192.168.1.0", "network 10.0.0.0"]);
      taper(r2, ["hostname R2", "no ip domain-lookup",
        "interface gi0/0", "description LAN du site 2", "ip address 192.168.2.1 255.255.255.0", "no shutdown",
        "interface s0/0/0", "description Liaison vers R1", "ip address 10.0.0.2 255.255.255.252", "no shutdown"]);
      taper(s1, ["hostname SW1", "no ip domain-lookup"]);
      taper(s2, ["hostname SW2", "no ip domain-lookup"]);
      cable(reseau, r1, "Gi0/0", s1, "Gi0/1");
      cable(reseau, r2, "Gi0/0", s2, "Gi0/1");
      const a = hote(reseau, "pc", "PC1", -200, 210, { ip: "192.168.1.10", passerelle: "192.168.1.1" });
      const b = hote(reseau, "pc", "PC2", 200, 210, { ip: "192.168.2.10", passerelle: "192.168.2.1" });
      cable(reseau, a, "Fa0", s1, "Fa0/1");
      cable(reseau, b, "Fa0", s2, "Fa0/1");
    },
  },
  {
    id: "lab5",
    titre: "Lab 5 : Sortir sur Internet : le PAT",
    court: "NAT et PAT",
    resume: "Un LAN privé (192.168.1.0/24) derrière R1, une liaison série vers le FAI, et un serveur web « sur Internet » (8.8.8.8). Le FAI ne connaît pas les adresses privées : sans traduction, les réponses ne reviennent pas.",
    etapes: [
      "Sur <b>PC1</b> : <code>ping 8.8.8.8</code>, <i>Request timed out</i>. Le paquet part, mais le FAI ne sait pas où renvoyer une réponse à 192.168.1.10.",
      "Sur <b>R1</b> : <code>en</code>, <code>show run</code>, <code>ip nat inside</code> et <code>ip nat outside</code> sont déjà posés. Il manque la règle.",
      "Ajoutez-la : <code>conf t</code>, <code>access-list 1 permit 192.168.1.0 0.0.0.255</code>, <code>ip nat inside source list 1 interface s0/0/0 overload</code>, <code>end</code>.",
      "Sur PC1 puis PC2 : <code>ping 8.8.8.8</code>, ça passe. Sur R1 : <code>show ip nat translations</code>, deux PC, une seule adresse publique, deux numéros.",
      "Sur PC1 : <code>curl http://8.8.8.8</code>, puis sur R1 <code>show ip nat statistics</code> : les Hits et Misses.",
      "En <b>Simulation</b> : cliquez le même écho avant R1 puis après, l'adresse source a changé (inside local → inside global).",
    ],
    objectifs: [
      { texte: "PC1 sort sur Internet (8.8.8.8)", test: (s) => s.joint("PC1", "8.8.8.8") },
      { texte: "PC2 sort sur Internet (8.8.8.8)", test: (s) => s.joint("PC2", "8.8.8.8") },
    ],
    construire(reseau) { sortieInternet(reseau); },
  },
  {
    id: "panne1",
    panne: true,
    titre: "Panne 1 : Le DHCP ne répond pas",
    court: "DHCP en panne",
    resume: "La maquette du lab 3, à une ligne près. PC-A est en DHCP et n'obtient aucune adresse. Le routeur R1 est bien branché, son pool existe : et pourtant il ne répond pas. Trouvez pourquoi.",
    etapes: [
      "Sur <b>PC-A</b> : <code>ipconfig /renew</code>. Il ne reçoit qu'une adresse en <code>169.254</code> : c'est le signe qu'<b>aucun</b> serveur DHCP n'a répondu.",
      "Passez en <b>Simulation</b> et recommencez : le <i>DHCP Discover</i> arrive bien jusqu'à R1. Cliquez l'enveloppe à son arrivée : R1 dit ce qu'il en fait.",
      "Sur <b>R1</b> : <code>en</code>, <code>show ip dhcp pool</code>, puis <code>show running-config</code>. Comparez le réseau du pool à l'adresse de la sous-interface qui reçoit la demande.",
      "Corrigez sur R1, puis cliquez <b>Vérifier</b>.",
    ],
    solution: "R1 choisit le pool d'après le réseau de l'interface qui reçoit la demande. La sous-interface Gi0/0.10 est en <code>192.168.10.1/24</code>, mais le pool annonce <code>network 192.168.11.0</code> : aucun pool ne correspond, et la demande reste sans réponse. Sur R1 : <code>conf t</code>, <code>ip dhcp pool VLAN10</code>, <code>network 192.168.10.0 255.255.255.0</code>, <code>end</code>.",
    objectifs: [
      { texte: "PC-A reçoit une adresse du VLAN 10 par DHCP", test: (s) => /^192\.168\.10\./.test(s.adresse("PC-A") || "") },
      { texte: "PC-A joint le serveur (192.168.20.10)", test: (s) => s.joint("PC-A", "192.168.20.10") },
      { texte: "PC-A résout www.ciel.lan", test: (s) => s.resout("PC-A", "www.ciel.lan", "192.168.20.10") },
    ],
    construire(reseau) { interVlan(reseau, { pool: "192.168.11.0" }); },
  },
  {
    id: "panne2",
    panne: true,
    titre: "Panne 2 : Le VLAN 20 est coupé du reste",
    court: "Inter-VLAN en panne",
    resume: "Toujours la maquette du lab 3. Le VLAN 10 fonctionne, mais rien ne sort du VLAN 20 : PC-C ne joint même pas sa passerelle. Les câbles sont bons, les adresses aussi. Trouvez la ligne fautive.",
    etapes: [
      "Sur <b>PC-B</b> (VLAN 10) : <code>ping 192.168.10.1</code>, sa passerelle répond.",
      "Sur <b>PC-C</b> (VLAN 20) : <code>ping 192.168.20.1</code>, la sienne se tait.",
      "Sur <b>SW1</b> : <code>en</code>, <code>show vlan brief</code> puis <code>show interfaces trunk</code>. Le commutateur est-il en cause ?",
      "En <b>Simulation</b>, refaites le ping de PC-C et cliquez la trame à son arrivée sur R1 : quelle étiquette VLAN porte-t-elle, et que dit R1 ?",
      "Sur <b>R1</b> : <code>show running-config</code>, et lisez les deux sous-interfaces. Corrigez, puis <b>Vérifier</b>.",
    ],
    solution: "La sous-interface Gi0/0.20 attend l'étiquette <code>dot1Q 30</code> alors que le commutateur étiquette le VLAN 20 avec 20. Les trames de PC-C arrivent étiquetées 20 : R1 n'a aucune sous-interface pour elles, et les jette. Sur R1 : <code>conf t</code>, <code>interface gi0/0.20</code>, <code>encapsulation dot1Q 20</code>, <code>end</code>.",
    objectifs: [
      { texte: "PC-C joint sa passerelle (192.168.20.1)", test: (s) => s.joint("PC-C", "192.168.20.1") },
      { texte: "PC-B joint PC-C, d'un VLAN à l'autre", test: (s) => s.joint("PC-B", "192.168.20.20") },
      { texte: "PC-A obtient son adresse et joint le serveur", test: (s) => s.joint("PC-A", "192.168.20.10") },
    ],
    construire(reseau) { interVlan(reseau, { tag20: 30 }); },
  },
  {
    id: "panne3",
    panne: true,
    titre: "Panne 3 : Un seul poste ne sort pas",
    court: "Poste isolé",
    resume: "La maquette du lab 5, PAT déjà en place. PC1 sort sur Internet ; PC2, branché sur le même commutateur, dans le même réseau, ne sort pas. Rien n'est cassé côté routeur.",
    etapes: [
      "Sur <b>PC1</b> : <code>ping 8.8.8.8</code>, ça passe : le PAT de R1 fonctionne.",
      "Sur <b>PC2</b> : <code>ping 8.8.8.8</code>, rien. Puis <code>ping 192.168.1.10</code> : PC1 répond, le réseau local n'est pas en cause.",
      "Sur PC2 puis sur PC1 : <code>ipconfig /all</code>. Comparez les deux, ligne par ligne.",
      "Corrigez dans l'inspecteur de <b>PC2</b> (cliquez-le), puis <b>Vérifier</b>.",
    ],
    solution: "PC2 a pour passerelle <code>192.168.1.254</code>, une adresse que personne ne porte : tout ce qui sort du réseau local part vers elle, et la requête ARP reste sans réponse. Le réseau local marche, puisqu'il n'a pas besoin de passerelle. Dans l'inspecteur de PC2 : passerelle <code>192.168.1.1</code>.",
    objectifs: [
      { texte: "PC1 sort sur Internet (8.8.8.8)", test: (s) => s.joint("PC1", "8.8.8.8") },
      { texte: "PC2 sort sur Internet (8.8.8.8)", test: (s) => s.joint("PC2", "8.8.8.8") },
    ],
    construire(reseau) { sortieInternet(reseau, { regle: true, passerellePc2: "192.168.1.254" }); },
  },
];

export function chargerLab(reseau, id) {
  const lab = LABS.find((l) => l.id === id);
  if (!lab) return null;
  reseau.cables.slice().forEach((c) => reseau.deconnecter(c, true));
  reseau.appareils = [];
  reseau.horloge.reinitialiser();
  reseau.viderJournal();
  lab.construire(reseau);
  reseau.demarrer();
  reseau.emit("topologie");
  return lab;
}
