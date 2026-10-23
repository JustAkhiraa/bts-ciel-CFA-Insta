/* Le banc de la CLI : on tape comme un élève, on lit ce qu'IOS répondrait. */
import { Network } from "../src/core/Network.js";
import { creer } from "../src/devices/Fabrique.js";
import { IOSConsole } from "../src/cli/IOSParser.js";
import { HostShell } from "../src/cli/HostShell.js";

export const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

/* Une session : chaque commande est tapée, et l'on garde tout ce qui s'écrit. */
function session(console_) {
  const ecran = [];
  let occupe = false;
  const o = {
    ligne: (t) => ecran.push(t), lignes: (L) => L.forEach((t) => ecran.push(t)),
    ajouter: (t) => { ecran[ecran.length - 1] = (ecran[ecran.length - 1] || "") + t; },
    occupe: () => { occupe = true; }, fin: () => { occupe = false; }, effacer: () => { ecran.length = 0; },
  };
  return {
    ecran,
    taper(ligne) { const debut = ecran.length; ecran.push(console_.invite() + ligne); console_.executer(ligne, o); return ecran.slice(debut + 1); },
    invite: () => console_.invite(),
    get occupe() { return occupe; },
  };
}

function labo() {
  const net = new Network();
  const r = creer(net, "routeur"), s = creer(net, "switch"), pc = creer(net, "pc"), pc2 = creer(net, "pc");
  net.connecter(r.port("Gi0/0"), s.port("Gi0/1"), "droit");
  net.connecter(pc.port("Fa0"), s.port("Fa0/1"), "droit");
  net.connecter(pc2.port("Fa0"), s.port("Fa0/2"), "droit");
  return { net, r, s, pc, pc2 };
}

test("modes IOS et abréviations : en, conf t, int g0/0, ip add, no sh", () => {
  const { net, r } = labo();
  const msgs = [];
  net.on("console", (m) => { if (m.app === r) msgs.push(m.texte); });
  const t = session(new IOSConsole(r));
  ok(t.invite() === "Router0>", "invite user : " + t.invite());
  t.taper("en"); ok(t.invite() === "Router0#", "après en : " + t.invite());
  const c = t.taper("conf t");
  ok(c[0].startsWith("Enter configuration commands"), "message de conf t");
  ok(t.invite() === "Router0(config)#", t.invite());
  t.taper("hostname R1"); ok(t.invite() === "R1(config)#", "hostname : " + t.invite());
  t.taper("int g0/0"); ok(t.invite() === "R1(config-if)#", t.invite());
  t.taper("ip add 192.168.1.1 255.255.255.0");
  t.taper("no sh");
  ok(msgs.some((m) => /GigabitEthernet0\/0, changed state to up/.test(m)), "message %LINK : " + msgs.join(" | "));
  t.taper("end");
  const br = t.taper("sh ip int br");
  const ligne = br.find((l) => l.startsWith("GigabitEthernet0/0 "));
  ok(ligne && /192\.168\.1\.1\s+YES manual up\s+up/.test(ligne), "show ip int br : " + ligne);
  const rt = t.taper("show ip route");
  ok(rt.some((l) => /^C\s+192\.168\.1\.0\/24 is directly connected, GigabitEthernet0\/0/.test(l)), "route C");
  ok(rt.some((l) => /^L\s+192\.168\.1\.1\/32/.test(l)), "route L");
});

test("erreurs exactes d'IOS : ^, incomplète, ambiguë, Translating…", () => {
  const { r } = labo();
  const t = session(new IOSConsole(r));
  t.taper("enable");
  const e1 = t.taper("show ip intrface brief");
  ok(e1[1] === "% Invalid input detected at '^' marker." && e1[0].indexOf("^") === "Router0#show ip ".length, "caret : " + JSON.stringify(e1));
  ok(t.taper("show ip")[0] === "% Incomplete command.", "incomplète");
  ok(/% Ambiguous command/.test(t.taper("c")[0]), "ambiguë (clear / configure / copy)");
  ok(/^Translating "bonjour"/.test(t.taper("bonjour")[0]), "mot inconnu en EXEC");
  t.taper("conf t");
  t.taper("no ip domain-lookup");
  t.taper("end");
  ok(!/Translating/.test(t.taper("bonjour").join()), "plus de Translating après no ip domain-lookup");
});

test("aide « ? » et complétion Tab", () => {
  const { r } = labo();
  const ios = new IOSConsole(r);
  const t = session(ios);
  t.taper("en");
  ok(ios.completer("conf") === "configure ", "Tab sur conf");
  ok(ios.completer("sh ip int") === "sh ip interface ", "Tab en milieu de ligne : " + ios.completer("sh ip int"));
  const a = ios.aide("show ip ");
  ok(a.some((l) => /interface/.test(l)) && a.some((l) => /route/.test(l)), "show ip ? : " + a.join("|"));
  ok(ios.aide("co").join(" ").includes("configure") && ios.aide("co").join(" ").includes("copy"), "co? : " + ios.aide("co"));
});

test("commutateur : VLAN, accès, trunk, show vlan brief, sous-mode qui remonte", () => {
  const { net, s, r } = labo();
  // « show interfaces trunk » ne montre que les trunks ACTIFS : le port
  // d'en face (le routeur) doit être allumé
  r.port("Gi0/0").adminUp = true; net.evaluerLiens();
  const t = session(new IOSConsole(s));
  t.taper("en"); t.taper("conf t");
  t.taper("vlan 10"); t.taper("name ADMIN");
  t.taper("vlan 20");                  // depuis config-vlan : remonte et crée le 20
  ok(t.invite() === "Switch0(config-vlan)#", "vlan 20 depuis config-vlan : " + t.invite());
  t.taper("name ELEVES"); t.taper("exit");
  t.taper("int fa0/1"); t.taper("sw mode acc"); t.taper("sw acc vlan 10");
  t.taper("int range fa0/2 - 4");
  ok(t.invite() === "Switch0(config-if-range)#", "range : " + t.invite());
  t.taper("switchport access vlan 20");
  const cree = t.taper("int fa0/5");
  t.taper("sw acc vlan 30");
  ok(t.ecran.includes("% Access VLAN does not exist. Creating vlan 30"), "création automatique du VLAN 30");
  t.taper("int gi0/1"); t.taper("sw mode trunk"); t.taper("sw trunk allowed vlan 10,20");
  t.taper("end");
  const vb = t.taper("sh vlan br");
  ok(vb.some((l) => /^10\s+ADMIN\s+active\s+Fa0\/1/.test(l)), "VLAN 10 : " + vb.join("\n"));
  ok(vb.some((l) => /^20\s+ELEVES\s+active\s+Fa0\/2, Fa0\/3, Fa0\/4/.test(l)), "VLAN 20 : " + vb.join("\n"));
  const tr = t.taper("show interfaces trunk");
  ok(tr.some((l) => /^Gi0\/1\s+on\s+802\.1q\s+trunking\s+1/.test(l)), "trunk : " + tr.join("\n"));
  ok(tr.some((l) => /^Gi0\/1\s+10,20$/.test(l)), "VLAN autorisés : " + tr.join("\n"));
  const run = t.taper("sh run");
  ok(run.includes(" switchport access vlan 10") && run.includes(" switchport trunk allowed vlan 10,20"), "running-config");
  const ip = t.taper("conf t"); t.taper("int fa0/1");
  ok(t.taper("ip address 10.0.0.1 255.0.0.0")[1] === "% Invalid input detected at '^' marker.", "pas d'IP sur un port L2");
});

test("du PC : ipconfig, ping au format Windows, arp -a", () => {
  const { net, r, pc, pc2 } = labo();
  const ios = session(new IOSConsole(r));
  ["en", "conf t", "int g0/0", "ip add 192.168.1.1 255.255.255.0", "no sh", "end"].forEach((c) => ios.taper(c));
  pc.configurer({ ip: require_ip("192.168.1.10"), masque: require_ip("255.255.255.0"), passerelle: require_ip("192.168.1.1") });
  pc2.configurer({ ip: require_ip("192.168.1.11"), masque: require_ip("255.255.255.0"), passerelle: require_ip("192.168.1.1") });
  const sh = session(new HostShell(pc));
  const cfg = sh.taper("ipconfig");
  ok(cfg.some((l) => /IPv4 Address\.+: 192\.168\.1\.10/.test(l)), "ipconfig : " + cfg.join("\n"));
  const p = sh.taper("ping 192.168.1.11");
  ok(p.filter((l) => /^Reply from 192\.168\.1\.11: bytes=32 time.*TTL=128$/.test(l)).length === 4, "ping local : " + p.join("\n"));
  ok(p.some((l) => /Lost = 0 \(0% loss\)/.test(l)), "statistiques");
  const a = sh.taper("arp -a");
  ok(a.some((l) => /192\.168\.1\.11\s+00d0\.ba/.test(l)), "arp -a : " + a.join("\n"));
  const p2 = sh.taper("ping -n 2 192.168.1.99");
  ok(p2.filter((l) => l === "Reply from 192.168.1.10: Destination host unreachable.").length === 2, "hôte absent : " + p2.join("\n"));
});

test("ping IOS : « .!!!! » quand le premier écho se perd pendant l'ARP", () => {
  const { r, pc } = labo();
  const ios = session(new IOSConsole(r));
  ["en", "conf t", "int g0/0", "ip add 192.168.1.1 255.255.255.0", "no sh", "end"].forEach((c) => ios.taper(c));
  pc.configurer({ ip: require_ip("192.168.1.10"), masque: require_ip("255.255.255.0") });
  const p = ios.taper("ping 192.168.1.10");
  ok(p.includes(".!!!!"), "attendu .!!!! : " + p.join("\n"));
  ok(p.some((l) => /^Success rate is 80 percent \(4\/5\)/.test(l)), "taux 80 % : " + p.join("\n"));
  const p2 = ios.taper("ping 192.168.1.10");
  ok(p2.includes("!!!!!"), "second ping : !!!!! " + p2.join("\n"));
});

test("router-on-a-stick entièrement à la CLI, puis ping d'un VLAN à l'autre", () => {
  const { net, r, s, pc, pc2 } = labo();
  const R = session(new IOSConsole(r)), S = session(new IOSConsole(s));
  ["en", "conf t", "vlan 10", "vlan 20", "int fa0/1", "sw acc vlan 10", "int fa0/2", "sw acc vlan 20", "int gi0/1", "sw mode trunk", "end"].forEach((c) => S.taper(c));
  ["en", "conf t", "int g0/0", "no sh", "int g0/0.10", "encapsulation dot1Q 10", "ip add 192.168.10.1 255.255.255.0",
   "int g0/0.20", "enc dot1q 20", "ip add 192.168.20.1 255.255.255.0", "end"].forEach((c) => R.taper(c));
  ok(R.invite() === "Router0#", "invite : " + R.invite());
  pc.configurer({ ip: require_ip("192.168.10.2"), masque: require_ip("255.255.255.0"), passerelle: require_ip("192.168.10.1") });
  pc2.configurer({ ip: require_ip("192.168.20.2"), masque: require_ip("255.255.255.0"), passerelle: require_ip("192.168.20.1") });
  const sh = session(new HostShell(pc));
  sh.taper("ping 192.168.20.2");
  const p = sh.taper("ping 192.168.20.2");
  ok(p.filter((l) => /^Reply from 192\.168\.20\.2: .*TTL=127$/.test(l)).length === 4, "inter-VLAN : " + p.join("\n"));
  const br = R.taper("sh ip int br");
  ok(br.some((l) => /^GigabitEthernet0\/0\.10\s+192\.168\.10\.1\s+YES manual up\s+up/.test(l)), "sous-interface up : " + br.join("\n"));
  const ad = R.taper("conf t"); R.taper("int g0/0.30");
  ok(R.taper("ip add 192.168.30.1 255.255.255.0")[0].startsWith("% Configuring IP routing on a LAN subinterface"), "IP avant dot1Q refusée");
});

test("DHCP sur routeur à la CLI, et « ipconfig /renew » sur le PC", () => {
  const { r, pc } = labo();
  const R = session(new IOSConsole(r));
  ["en", "conf t", "int g0/0", "ip add 192.168.1.1 255.255.255.0", "no sh", "exit",
   "ip dhcp excluded-address 192.168.1.1 192.168.1.9", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0",
   "default-router 192.168.1.1", "dns-server 192.168.1.1", "end"].forEach((c) => R.taper(c));
  const sh = session(new HostShell(pc));
  const out = sh.taper("ipconfig /renew");
  ok(out.some((l) => /IPv4 Address\.+: 192\.168\.1\.10$/.test(l)), "renouvellement : " + out.join("\n"));
  const b = R.taper("show ip dhcp binding");
  ok(b.some((l) => /^192\.168\.1\.10\s+00d0\./.test(l)), "bail : " + b.join("\n"));
  const run = R.taper("sh run");
  ok(run.includes("ip dhcp pool LAN") && run.includes(" network 192.168.1.0 255.255.255.0"), "running-config du pool");
});

test("copy run start demande le nom, et startup-config existe ensuite", () => {
  const { r } = labo();
  const R = session(new IOSConsole(r));
  R.taper("en");
  ok(R.taper("show startup-config")[0] === "startup-config is not present", "pas de startup au départ");
  R.taper("copy run start");
  ok(R.invite() === "Destination filename [startup-config]? ", "question : " + R.invite());
  const o = R.taper("");
  ok(o.includes("[OK]"), "[OK] : " + o);
  ok(R.taper("show startup-config").some((l) => l === "hostname Router0"), "startup relu");
});

test("enable secret : le mot de passe est demandé", () => {
  const { r } = labo();
  const R = session(new IOSConsole(r));
  ["en", "conf t", "enable secret cisco", "end", "disable"].forEach((c) => R.taper(c));
  R.taper("enable");
  ok(R.invite() === "Password: ", "invite mot de passe");
  R.taper("mauvais");
  R.taper("cisco");
  ok(R.invite() === "Router0#", "accès privilégié après le bon mot de passe : " + R.invite());
});

test("interface de bouclage : up sans câble, et le routeur se répond à lui-même", () => {
  const { r } = labo();
  const R = session(new IOSConsole(r));
  ["en", "conf t", "int lo0", "ip add 1.1.1.1 255.255.255.255", "end"].forEach((c) => R.taper(c));
  const br = R.taper("sh ip int br");
  ok(br.some((l) => /^Loopback0\s+1\.1\.1\.1\s+YES manual up\s+up/.test(l)), "Loopback0 up : " + br.join("\n"));
  ok(R.taper("sh ip route").some((l) => /^C\s+1\.1\.1\.1\/32 is directly connected, Loopback0/.test(l)), "route C du bouclage");
  ok(R.taper("ping 1.1.1.1").includes("!!!!!"), "ping de sa propre adresse");
});

test("reload : sans copy run start, tout est perdu ; avec, tout revient", () => {
  const { r } = labo();
  const R = session(new IOSConsole(r));
  ["en", "conf t", "hostname R1", "enable secret classe", "int g0/0", "ip add 192.168.1.1 255.255.255.0", "no sh", "end"].forEach((c) => R.taper(c));
  R.taper("reload"); R.taper("");
  ok(R.ecran.includes("%% No startup-config, starting with factory defaults"), "redémarrage vierge annoncé");
  R.taper("en");
  ok(R.invite() === "Router0#", "nom d'usine, pas de mot de passe : " + R.invite());
  ok(!r.port("Gi0/0").ip, "adresse perdue");
  ["conf t", "hostname R1", "enable secret classe", "int g0/0", "ip add 192.168.1.1 255.255.255.0", "no sh", "end"].forEach((c) => R.taper(c));
  R.taper("copy run start"); R.taper("");
  R.taper("reload"); R.taper("");
  ok(R.invite() === "R1>", "nom rejoué : " + R.invite());
  R.taper("en");
  ok(R.invite() === "Password: ", "le secret (haché) est rejoué : " + R.invite());
  R.taper("classe");
  ok(R.invite() === "R1#", "le mot de passe d'origine marche toujours : " + R.invite());
  ok(r.port("Gi0/0").ip && r.port("Gi0/0").ip.toString() === "192.168.1.1" && r.port("Gi0/0").adminUp, "interface rejouée");
  R.taper("erase startup-config"); R.taper("");
  ok(R.taper("show startup-config")[0] === "startup-config is not present", "startup effacée");
});

test("delete vlan.dat : les VLAN disparaissent, les ports restent affectés", () => {
  const { s } = labo();
  const S = session(new IOSConsole(s));
  ["en", "conf t", "vlan 10", "name ADMIN", "int fa0/1", "sw acc vlan 10", "end"].forEach((c) => S.taper(c));
  S.taper("delete vlan.dat");
  ok(S.invite() === "Delete filename [vlan.dat]?", "première question : " + S.invite());
  S.taper("");
  ok(S.invite() === "Delete flash:/vlan.dat? [confirm]", "seconde question : " + S.invite());
  S.taper("");
  const vb = S.taper("sh vlan br");
  ok(!vb.some((l) => /^10\s/.test(l)), "VLAN 10 effacé : " + vb.join("\n"));
  ok(s.port("Fa0/1").accessVlan === 10, "le port garde son affectation (inactive)");
});

test("une running-config recollée dans un appareil neuf passe sans une erreur", () => {
  const { net, r, s } = labo();
  const R = session(new IOSConsole(r)), S = session(new IOSConsole(s));
  ["en", "conf t", "hostname R1", "enable secret classe", "service password-encryption", "no ip domain-lookup", "ip domain-name ciel.lan",
   "username admin secret cisco", "crypto key generate rsa", "1024", "ip ssh version 2", "banner motd #Accès réservé#",
   "int g0/0", "no sh", "int g0/0.10", "enc dot1q 10", "ip add 192.168.10.1 255.255.255.0", "ip helper-address 192.168.100.10",
   "int lo0", "ip add 1.1.1.1 255.255.255.255", "exit", "ip route 0.0.0.0 0.0.0.0 192.168.10.254",
   "ip dhcp excluded-address 192.168.10.1 192.168.10.9", "ip dhcp pool V10", "network 192.168.10.0 255.255.255.0", "default-router 192.168.10.1",
   "line con 0", "password cisco", "login", "line vty 0 4", "login local", "transport input ssh", "end"].forEach((c) => R.taper(c));
  ["en", "conf t", "hostname S1", "enable password classe", "vlan 10", "name ADMIN", "int fa0/1", "sw mode acc", "sw acc vlan 10",
   "int gi0/1", "sw mode trunk", "sw trunk native vlan 99", "sw trunk allowed vlan 10,99", "int vlan 1", "ip add 192.168.1.2 255.255.255.0", "no sh",
   "exit", "ip default-gateway 192.168.1.1", "end"].forEach((c) => S.taper(c));
  for (const [app, type] of [[r, "routeur"], [s, "switch"]]) {
    const run = new IOSConsole(app);
    const lignes = [];
    run.executer("enable", { ligne() {}, lignes() {} });
    run.executer("show running-config", { ligne: (t) => lignes.push(t), lignes: (L) => lignes.push(...L) });
    const neuf = creer(net, type);
    const N = session(new IOSConsole(neuf));
    N.taper("en"); N.taper("conf t");
    const refus = [];
    for (const l of lignes.filter((l) => l && !/^(Building|Current configuration|!|end$)/.test(l))) {
      const o = N.taper(l.trim());
      if (o.some((x) => /^% (Invalid|Incomplete|Ambiguous)/.test(x))) refus.push(l);
    }
    ok(!refus.length, type + " : lignes refusées → " + refus.join(" | "));
  }
});

import { IPv4Address } from "../src/core/IPv4Address.js";
function require_ip(s) { return IPv4Address.parse(s); }
