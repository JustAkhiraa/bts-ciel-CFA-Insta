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

test("liaison série : up/down sans horloge, clock rate côté DCE, ping, PPP d'un seul côté", () => {
  const net = new Network();
  const r1 = creer(net, "routeur"), r2 = creer(net, "routeur");
  const cab = net.connecter(r1.port("Se0/0/0"), r2.port("Se0/0/0"), "serie");      // R1 = DCE
  ok(cab.valide() && r1.port("Se0/0/0").estDce() && !r2.port("Se0/0/0").estDce(), "câble série, DCE côté Router0");
  const msgs = [];
  net.on("console", (m) => msgs.push(m.app.nom + " " + m.texte));
  const A = session(new IOSConsole(r1)), B = session(new IOSConsole(r2));
  ["en", "conf t", "int s0/0/0", "ip add 10.0.0.1 255.255.255.252", "no sh", "end"].forEach((c) => A.taper(c));
  ["en", "conf t", "int s0/0/0", "ip add 10.0.0.2 255.255.255.252", "no sh", "end"].forEach((c) => B.taper(c));
  const br = A.taper("sh ip int br").find((l) => l.startsWith("Serial0/0/0"));
  ok(/up\s+down\s*$/.test(br), "sans horloge : up / down → " + br);
  ok(msgs.some((m) => /Router0 %LINK-5-CHANGED: Interface Serial0\/0\/0, changed state to up/.test(m)), "ligne up annoncée");
  ok(!msgs.some((m) => /LINEPROTO.*Serial0\/0\/0, changed state to up/.test(m)), "protocole encore down");
  ok(A.taper("sh controllers serial 0/0/0").includes("DCE V.35, no clock"), "show controllers : DCE sans horloge");
  ok(B.taper("conf t") && B.taper("int s0/0/0") && B.taper("clock rate 64000")[0] === "This command applies only to DCE interfaces", "clock rate refusé côté DTE");
  B.taper("end");
  ["conf t", "int s0/0/0", "clock rate 64000", "end"].forEach((c) => A.taper(c));
  ok(/up\s+up\s*$/.test(A.taper("sh ip int br").find((l) => l.startsWith("Serial0/0/0"))), "avec horloge : up / up");
  ok(msgs.some((m) => /Router1 %LINEPROTO-5-UPDOWN: Line protocol on Interface Serial0\/0\/0, changed state to up/.test(m)), "protocole up annoncé des deux côtés");
  ok(B.taper("sh controllers s0/0/0").includes("DTE V.35 TX and RX clocks detected."), "DTE : horloge reçue");
  net.executer();
  ok(A.taper("show cdp neighbors").some((l) => /^Router1\s+Ser 0\/0\/0\s+\d+\s+R\s+C2900\s+Ser 0\/0\/0$/.test(l)), "CDP passe aussi sur la série : " + A.taper("show cdp neighbors").join("\n"));
  const p = A.taper("ping 10.0.0.2");
  ok(p.includes("!!!!!"), "pas d'ARP sur une série : les cinq échos passent → " + p.join("\n"));
  ok(A.taper("sh run").includes(" clock rate 64000"), "running-config");
  ["conf t", "int s0/0/0", "encapsulation ppp", "end"].forEach((c) => A.taper(c));
  ok(/up\s+down\s*$/.test(A.taper("sh ip int br").find((l) => l.startsWith("Serial0/0/0"))), "PPP d'un côté, HDLC de l'autre : protocole down");
  ok(r1.port("Se0/0/0").etat().couleur === "orange" && /encapsulations différentes/.test(r1.port("Se0/0/0").etat().texte), "pastille orange expliquée");
  ["conf t", "int s0/0/0", "encapsulation ppp", "end"].forEach((c) => B.taper(c));
  ok(A.taper("ping 10.0.0.2").includes("!!!!!"), "PPP des deux côtés : ça repasse");
  const sauts = net.sauts.filter((x) => x.cable === cab);
  ok(sauts.length && sauts.every((x) => x.trame.l2 === "ppp" || x.trame.l2 === "hdlc") && !sauts.some((x) => x.protocole === "ARP"), "trames HDLC/PPP, aucune ARP");
});

test("sécurité de port : sticky, violation shutdown → err-disabled, restrict compte, port dynamique refusé", () => {
  const { net, s, pc, pc2 } = labo();
  const msgs = [];
  net.on("console", (m) => msgs.push(m.texte));
  const S = session(new IOSConsole(s));
  S.taper("en"); S.taper("conf t"); S.taper("int fa0/3");
  ok(S.taper("switchport port-security")[0] === "Command rejected: FastEthernet0/3 is a dynamic port.", "port dynamique refusé");
  ["int fa0/1", "switchport mode access", "switchport port-security", "switchport port-security mac-address sticky", "end"].forEach((c) => S.taper(c));
  pc.configurer({ ip: require_ip("192.168.1.10"), masque: require_ip("255.255.255.0") });
  pc2.configurer({ ip: require_ip("192.168.1.11"), masque: require_ip("255.255.255.0") });
  const sh = session(new HostShell(pc));
  ok(sh.taper("ping -n 1 192.168.1.11").some((l) => /^Reply from/.test(l)), "le PC légitime passe");
  const adr = S.taper("show port-security address");
  ok(adr.some((l) => new RegExp("^\\s+1\\s+" + pc.carte.mac.cisco().toUpperCase().replace(/\./g, "\\.") + "\\s+SecureSticky\\s+Fa0/1").test(l)), "adresse sticky : " + adr.join("\n"));
  ok(S.taper("sh run").includes(" switchport port-security mac-address sticky " + pc.carte.mac.cisco().toUpperCase()), "sticky dans la running-config");
  // un intrus prend la place du PC sur Fa0/1
  net.deconnecter(pc.carte.cable);
  const intrus = creer(net, "pc");
  net.connecter(intrus.carte, s.port("Fa0/1"), "droit");
  intrus.configurer({ ip: require_ip("192.168.1.66"), masque: require_ip("255.255.255.0") });
  const shi = session(new HostShell(intrus));
  ok(!shi.taper("ping -n 1 192.168.1.11").some((l) => /^Reply from 192\.168\.1\.11/.test(l)), "l'intrus ne passe pas");
  ok(msgs.some((m) => m === "%PM-4-ERR_DISABLE: psecure-violation error detected on Fa0/1, putting Fa0/1 in err-disable state"), "message err-disable");
  ok(msgs.some((m) => /^%PORT_SECURITY-2-PSECURE_VIOLATION: .* on port FastEthernet0\/1\.$/.test(m)), "message de violation");
  ok(S.taper("sh interfaces status").some((l) => /^Fa0\/1\s+err-disabled/.test(l)), "show interfaces status : err-disabled");
  ok(S.taper("sh port-security int fa0/1").includes("Port Status                : Secure-shutdown"), "Secure-shutdown");
  // le remède : shutdown / no shutdown — puis restrict : l'intrus est compté, le port reste up
  ["conf t", "int fa0/1", "switchport port-security violation restrict", "shutdown", "no shutdown", "end"].forEach((c) => S.taper(c));
  ok(s.port("Fa0/1").estUp(), "port rouvert");
  shi.taper("ping -n 2 192.168.1.11");
  ok(s.port("Fa0/1").estUp() && s.port("Fa0/1").secu.violations >= 2, "restrict : port up, violations comptées (" + s.port("Fa0/1").secu.violations + ")");
  ok(S.taper("show port-security").some((l) => /^\s+Fa0\/1\s+1\s+1\s+\d+\s+Restrict$/.test(l)), "show port-security");
});

test("CDP : voisins, détail avec l'adresse, nom d'hôte propagé, VLAN natif différent signalé", () => {
  const { net, r, s } = labo();
  const s2 = creer(net, "switch");
  net.connecter(s.port("Gi0/2"), s2.port("Gi0/2"), "croise");
  const msgs = [];
  net.on("console", (m) => msgs.push(m.app.nom + " " + m.texte));
  const R = session(new IOSConsole(r)), S = session(new IOSConsole(s)), S2 = session(new IOSConsole(s2));
  ["en", "conf t", "hostname R1", "int g0/0", "ip add 192.168.1.1 255.255.255.0", "no sh", "end"].forEach((c) => R.taper(c));
  net.executer();
  const v = R.taper("show cdp neighbors");
  ok(v.some((l) => /^Switch0\s+Gig 0\/0\s+1[0-9]{2}\s+S\s+2960\s+Gig 0\/1$/.test(l)), "R1 voit Switch0 : " + v.join("\n"));
  ["en", "conf t", "hostname SW1", "end"].forEach((c) => S.taper(c));
  net.executer();
  ok(R.taper("show cdp neighbors").some((l) => /^SW1\s/.test(l)), "le nouveau nom est annoncé");
  const d = S.taper("show cdp neighbors detail");
  ok(d.includes("Device ID: R1") && d.includes("  IP address : 192.168.1.1") && d.includes("Interface: GigabitEthernet0/1, Port ID (outgoing port): GigabitEthernet0/0"), "détail : " + d.join("\n"));
  ["en", "conf t", "int g0/2", "switchport mode trunk", "switchport trunk native vlan 99", "end"].forEach((c) => S.taper(c));
  ["en", "conf t", "int g0/2", "switchport mode trunk", "end"].forEach((c) => S2.taper(c));
  net.executer();
  ok(msgs.some((m) => /^SW1 %CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on GigabitEthernet0\/2 \(99\), with Switch\d GigabitEthernet0\/2 \(1\)\.$/.test(m)), "mismatch : " + msgs.filter((m) => /CDP/.test(m)).join(" | "));
  // une annonce relayée porterait le port d'un autre équipement que celui qui l'émet
  ok(net.sauts.filter((x) => x.protocole === "CDP").every((x) => x.trame.payload.port === x.de.port.nom), "un commutateur ne relaie pas le CDP des autres");
  ["conf t", "no cdp run", "end"].forEach((c) => R.taper(c));
  ok(R.taper("show cdp neighbors")[0] === "% CDP is not enabled", "no cdp run");
});

/* LAN 192.168.1.0/24 — R1 (NAT) — série — FAI — 8.8.8.0/24. Le FAI n'a
   AUCUNE route vers le réseau privé : sans NAT, les réponses se perdent. */
function natLabo() {
  const net = new Network();
  const r1 = creer(net, "routeur"), fai = creer(net, "routeur"), s = creer(net, "switch");
  const pc = creer(net, "pc"), pc2 = creer(net, "pc"), web = creer(net, "serveur");
  net.connecter(r1.port("Gi0/0"), s.port("Gi0/1"), "droit");
  net.connecter(pc.port("Fa0"), s.port("Fa0/1"), "droit");
  net.connecter(pc2.port("Fa0"), s.port("Fa0/2"), "droit");
  net.connecter(r1.port("Se0/0/0"), fai.port("Se0/0/0"), "serie");
  net.connecter(fai.port("Gi0/0"), web.port("Fa0"), "croise");
  const R = session(new IOSConsole(r1)), F = session(new IOSConsole(fai));
  ["en", "conf t", "hostname R1", "int g0/0", "ip add 192.168.1.1 255.255.255.0", "no sh", "int s0/0/0", "ip add 209.165.200.225 255.255.255.248",
   "clock rate 64000", "no sh", "exit", "ip route 0.0.0.0 0.0.0.0 s0/0/0", "end"].forEach((c) => R.taper(c));
  ["en", "conf t", "hostname FAI", "int s0/0/0", "ip add 209.165.200.226 255.255.255.248", "no sh", "int g0/0", "ip add 8.8.8.1 255.255.255.0", "no sh", "end"].forEach((c) => F.taper(c));
  const m = require_ip("255.255.255.0");
  pc.configurer({ ip: require_ip("192.168.1.10"), masque: m, passerelle: require_ip("192.168.1.1") });
  pc2.configurer({ ip: require_ip("192.168.1.11"), masque: m, passerelle: require_ip("192.168.1.1") });
  web.configurer({ ip: require_ip("8.8.8.8"), masque: m, passerelle: require_ip("8.8.8.1") });
  net.demarrer();
  return { net, r1, fai, pc, pc2, web, R, F };
}

test("PAT : sans NAT les réponses se perdent ; avec « overload », deux PC sortent derrière une seule adresse", () => {
  const { pc, pc2, R } = natLabo();
  const sh = session(new HostShell(pc)), sh2 = session(new HostShell(pc2));
  ok(!sh.taper("ping -n 2 8.8.8.8").some((l) => /^Reply from 8\.8\.8\.8/.test(l)), "sans NAT : aucune réponse (le FAI ne connaît pas 192.168.1.0)");
  ["conf t", "int g0/0", "ip nat inside", "int s0/0/0", "ip nat outside", "exit", "access-list 1 permit 192.168.1.0 0.0.0.255",
   "ip nat inside source list 1 interface s0/0/0 overload", "end"].forEach((c) => R.taper(c));
  const p = sh.taper("ping 8.8.8.8");
  ok(p.filter((l) => /^Reply from 8\.8\.8\.8: .*TTL=126$/.test(l)).length >= 3, "avec PAT : réponses → " + p.join("\n"));
  ok(sh2.taper("ping -n 2 8.8.8.8").filter((l) => /^Reply from 8\.8\.8\.8/.test(l)).length === 2, "le second PC aussi");
  const t = R.taper("show ip nat translations");
  const lignes = t.filter((l) => /^icmp 209\.165\.200\.225:\d+\s+192\.168\.1\.1[01]:\d+\s+8\.8\.8\.8:\d+\s+8\.8\.8\.8:\d+$/.test(l));
  ok(lignes.some((l) => /192\.168\.1\.10:/.test(l)) && lignes.some((l) => /192\.168\.1\.11:/.test(l)), "deux PC, une adresse publique : " + t.join("\n"));
  const st = R.taper("show ip nat statistics");
  ok(st.some((l) => /^Hits: [1-9]\d*  Misses: [1-9]/.test(l)) && st.includes("access-list 1 interface Serial0/0/0 refCount " + lignes.length), "statistiques : " + st.join("\n"));
  ok(R.taper("show access-lists").some((l) => /^    10 permit 192\.168\.1\.0 0\.0\.0\.255 \(\d+ match\(es\)\)$/.test(l)), "compteur de l'ACL");
  const run = R.taper("sh run");
  ok(run.includes(" ip nat inside") && run.includes(" ip nat outside") && run.includes("ip nat inside source list 1 interface Serial0/0/0 overload")
    && run.includes("access-list 1 permit 192.168.1.0 0.0.0.255"), "running-config");
  const tr = sh.taper("tracert 8.8.8.8");
  ok(tr.some((l) => /^\s+1\s.*192\.168\.1\.1$/.test(l)) && tr.some((l) => /^\s+2\s.*209\.165\.200\.226$/.test(l)) && tr.includes("Trace complete."), "tracert à travers le NAT : " + tr.join("\n"));
  R.taper("clear ip nat translation *");
  ok(!R.taper("show ip nat translations").some((l) => /^icmp/.test(l)), "table vidée");
});

test("NAT statique : le serveur interne est joignable de l'extérieur par son adresse publique", () => {
  const { net, web, R } = natLabo();
  ["conf t", "ip nat inside source static 192.168.1.10 209.165.200.229", "int g0/0", "ip nat inside", "int s0/0/0", "ip nat outside", "end"].forEach((c) => R.taper(c));
  ok(R.taper("show ip nat translations").some((l) => /^---\s+209\.165\.200\.229\s+192\.168\.1\.10\s+---\s+---$/.test(l)), "ligne statique « --- »");
  const sw = session(new HostShell(web));
  // le premier écho se perd pendant l'ARP de R1 vers le serveur (IOS jette ce paquet-là)
  const p = sw.taper("ping -n 3 209.165.200.229");
  ok(p[3] === "Request timed out." && p.filter((l) => /^Reply from 209\.165\.200\.229: .*TTL=126$/.test(l)).length === 2, "ping de l'extérieur vers l'adresse publique : " + p.join("\n"));
  ok(net.sauts.some((x) => x.trame.payload.dst && String(x.trame.payload.dst) === "192.168.1.10" && x.de.app.nom === "R1"), "la destination est retraduite en 192.168.1.10 sur le LAN");
});

test("ACL standard appliquée à une interface : refus signalé, compteurs, ordre des lignes", () => {
  const { pc, pc2, R } = natLabo();
  ["conf t", "access-list 10 deny host 192.168.1.11", "access-list 10 permit any", "int g0/0", "ip access-group 10 in", "end"].forEach((c) => R.taper(c));
  const sh = session(new HostShell(pc)), sh2 = session(new HostShell(pc2));
  ok(sh.taper("ping -n 1 209.165.200.225").some((l) => /^Reply from 209\.165\.200\.225/.test(l)), "PC autorisé");
  ok(sh2.taper("ping -n 1 209.165.200.225").includes("Reply from 192.168.1.1: Destination host unreachable."), "PC refusé : ICMP administrativement interdit");
  const acl = R.taper("show access-lists");
  ok(acl[0] === "Standard IP access list 10" && /^    10 deny host 192\.168\.1\.11 \(\d+ match/.test(acl[1]) && /^    20 permit any \(\d+ match/.test(acl[2]), "show access-lists : " + acl.join("\n"));
  ok(R.taper("conf t") && R.taper("access-list 101 permit ip any any")[0].startsWith("% Le labo ne gère que"), "liste étendue : refus honnête");
});

/* LAN1 — R1 —série— R2 —série— R3 — LAN3 : trois routeurs, RIP à configurer. */
function ripLabo() {
  const net = new Network();
  const [r1, r2, r3] = [creer(net, "routeur"), creer(net, "routeur"), creer(net, "routeur")];
  const [s1, s3] = [creer(net, "switch"), creer(net, "switch")];
  const [pc1, pc3] = [creer(net, "pc"), creer(net, "pc")];
  net.connecter(r1.port("Gi0/0"), s1.port("Gi0/1"), "droit"); net.connecter(pc1.port("Fa0"), s1.port("Fa0/1"), "droit");
  net.connecter(r3.port("Gi0/0"), s3.port("Gi0/1"), "droit"); net.connecter(pc3.port("Fa0"), s3.port("Fa0/1"), "droit");
  net.connecter(r1.port("Se0/0/0"), r2.port("Se0/0/0"), "serie");
  net.connecter(r2.port("Se0/0/1"), r3.port("Se0/0/1"), "serie");
  const [A, B, C] = [r1, r2, r3].map((r) => session(new IOSConsole(r)));
  ["en", "conf t", "hostname R1", "int g0/0", "ip add 192.168.1.1 255.255.255.0", "no sh", "int s0/0/0", "ip add 10.0.0.1 255.255.255.252", "clock rate 64000", "no sh", "end"].forEach((c) => A.taper(c));
  ["en", "conf t", "hostname R2", "int s0/0/0", "ip add 10.0.0.2 255.255.255.252", "no sh", "int s0/0/1", "ip add 10.0.0.5 255.255.255.252", "clock rate 64000", "no sh", "end"].forEach((c) => B.taper(c));
  ["en", "conf t", "hostname R3", "int g0/0", "ip add 192.168.3.1 255.255.255.0", "no sh", "int s0/0/1", "ip add 10.0.0.6 255.255.255.252", "no sh", "end"].forEach((c) => C.taper(c));
  const m = require_ip("255.255.255.0");
  pc1.configurer({ ip: require_ip("192.168.1.10"), masque: m, passerelle: require_ip("192.168.1.1") });
  pc3.configurer({ ip: require_ip("192.168.3.10"), masque: m, passerelle: require_ip("192.168.3.1") });
  net.demarrer();
  return { net, r1, r2, r3, pc1, pc3, A, B, C };
}
const ripV2 = (T, reseaux, extra = []) => ["conf t", "router rip", "version 2", "no auto-summary", ...reseaux.map((n) => "network " + n), ...extra, "end"].forEach((c) => T.taper(c));

test("RIPv2 : trois routeurs apprennent tout, le ping traverse, une liaison coupée retire ses routes", () => {
  const { net, pc1, A, B, C } = ripLabo();
  const sh = session(new HostShell(pc1));
  ok(!sh.taper("ping -n 1 192.168.3.10").some((l) => /^Reply from 192\.168\.3\.10/.test(l)), "sans RIP : pas de route");
  ripV2(A, ["192.168.1.0", "10.0.0.0"], ["passive-interface g0/0"]);
  ripV2(B, ["10.0.0.0"]);
  ripV2(C, ["192.168.3.0", "10.0.0.0"]);
  net.executer();
  const rt = A.taper("show ip route");
  ok(rt.some((l) => /^R\s+192\.168\.3\.0\/24 \[120\/2\] via 10\.0\.0\.2, \d\d:\d\d:\d\d, Serial0\/0\/0$/.test(l)), "R1 apprend le LAN3 à 2 sauts : " + rt.join("\n"));
  ok(rt.some((l) => /^R\s+10\.0\.0\.4\/30 \[120\/1\] via 10\.0\.0\.2/.test(l)), "et la liaison R2-R3 à 1 saut");
  ok(C.taper("show ip route").some((l) => /^R\s+192\.168\.1\.0\/24 \[120\/2\] via 10\.0\.0\.5/.test(l)), "R3 apprend le LAN1");
  const p = sh.taper("ping 192.168.3.10");
  ok(p.filter((l) => /^Reply from 192\.168\.3\.10: .*TTL=125$/.test(l)).length >= 3, "ping de bout en bout (TTL 128 − 3) : " + p.join("\n"));
  ok(!net.sauts.some((x) => x.protocole === "RIP" && x.de.app.nom === "R1" && x.de.port.nom === "GigabitEthernet0/0"), "passive-interface : rien sur le LAN de R1");
  const pr = A.taper("show ip protocols");
  ok(pr.includes('Routing Protocol is "rip"') && pr.includes("Automatic network summarization is not in effect") && pr.includes("\tGigabitEthernet0/0"), "show ip protocols : " + pr.join("\n"));
  ok(A.taper("sh run").join("\n").includes("router rip\n version 2\n passive-interface GigabitEthernet0/0\n network 192.168.1.0\n network 10.0.0.0\n no auto-summary"), "running-config RIP");
  // R3 coupe sa liaison avec R2 : la route empoisonnée remonte jusqu'à R1
  ["conf t", "int s0/0/1", "shutdown", "end"].forEach((c) => C.taper(c));
  net.executer();
  ok(!A.taper("show ip route").some((l) => /192\.168\.3\.0/.test(l)), "LAN3 retiré de R1 après la coupure");
  ["conf t", "int s0/0/1", "no shutdown", "end"].forEach((c) => C.taper(c));
  net.executer();
  ok(A.taper("show ip route").some((l) => /^R\s+192\.168\.3\.0\/24 \[120\/2\]/.test(l)), "et réappris quand la liaison revient");
});

test("RIP : version 1 contre version 2 ignorée, debug, route par défaut propagée", () => {
  const { net, A, B, C } = ripLabo();
  const msgs = [];
  net.on("console", (m) => msgs.push(m.app.nom + " " + m.texte));
  A.taper("debug ip rip");
  ripV2(A, ["192.168.1.0", "10.0.0.0"]);
  ["conf t", "router rip", "network 10.0.0.0", "end"].forEach((c) => B.taper(c));      // version par défaut : envoie v1
  net.executer();
  ok(msgs.some((m) => /^R1 RIP: ignored v1 packet from 10\.0\.0\.2 \(illegal version\)$/.test(m)), "R1 en v2 ignore la v1 : " + msgs.filter((m) => /RIP/.test(m)).slice(0, 6).join(" | "));
  ok(!A.taper("show ip route").some((l) => /^R\s/.test(l)), "donc aucune route R");
  ["conf t", "router rip", "version 2", "end"].forEach((c) => B.taper(c));
  ripV2(C, ["192.168.3.0", "10.0.0.0"], ["default-information originate"]);
  ["conf t", "ip route 0.0.0.0 0.0.0.0 g0/0", "end"].forEach((c) => C.taper(c));
  ["conf t", "router rip", "default-information originate", "end"].forEach((c) => C.taper(c));
  net.executer();
  const rt = A.taper("show ip route");
  ok(rt.some((l) => /^R\*\s+0\.0\.0\.0\/0 \[120\/2\] via 10\.0\.0\.2/.test(l)) && rt.includes("Gateway of last resort is 10.0.0.2 to network 0.0.0.0"), "route par défaut propagée : " + rt.join("\n"));
  ok(msgs.some((m) => /^R1 RIP: sending v2 update to 224\.0\.0\.9 via Serial0\/0\/0 \(10\.0\.0\.1\)$/.test(m)), "debug : envoi");
});

import { IPv4Address } from "../src/core/IPv4Address.js";
function require_ip(s) { return IPv4Address.parse(s); }
