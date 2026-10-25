/* Le banc des labs : chaque lab se charge, et chaque étape qu'il annonce
   donne bien ce qu'il promet. Un lab dont une étape ment est pire que pas
   de lab du tout. */
import { Network } from "../src/core/Network.js";
import { chargerLab, LABS } from "../src/ui/Presets.js";
import { HostShell } from "../src/cli/HostShell.js";
import { IOSConsole } from "../src/cli/IOSParser.js";

export const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
function taper(console_, ligne) {
  const L = [];
  const o = { ligne: (t) => L.push(t), lignes: (x) => L.push(...x), ajouter: (t) => { L[L.length - 1] += t; }, occupe() {}, fin() {}, effacer() {} };
  console_.executer(ligne, o);
  return L;
}

test("lab 1 : ping, ARP, table MAC — comme annoncé", () => {
  const net = new Network(); chargerLab(net, "lab1");
  const a = new HostShell(net.parNom("PC-A"));
  ok(taper(a, "arp -a")[0] === "No ARP Entries Found", "table ARP vide au départ");
  const p = taper(a, "ping 192.168.1.11");
  ok(p.filter((l) => l.startsWith("Reply from 192.168.1.11")).length === 4, "4 réponses : " + p.join("\n"));
  ok(taper(a, "arp -a").some((l) => /192\.168\.1\.11/.test(l)), "PC-B appris");
  const sw = new IOSConsole(net.parNom("SW1"));
  taper(sw, "en");
  const m = taper(sw, "show mac address-table");
  ok(m.filter((l) => /DYNAMIC/.test(l)).length === 2, "2 MAC apprises : " + m.join("\n"));
});

test("lab 2 : même VLAN à travers le trunk, VLAN différent bloqué, allowed vlan", () => {
  const net = new Network(); chargerLab(net, "lab2");
  const a = new HostShell(net.parNom("PC-A"));
  ok(taper(a, "ping 192.168.10.2").filter((l) => l.startsWith("Reply from 192.168.10.2")).length === 4, "VLAN 10 de bout en bout");
  const sur = net.sauts.filter((s) => s.de.app.nom === "SW1" && s.vers.app.nom === "SW2");
  ok(sur.length && sur.every((s) => s.trame.vlan === 10), "étiquette VLAN 10 sur le trunk");
  const x = taper(a, "ping 192.168.20.1");
  ok(!x.some((l) => l.startsWith("Reply from 192.168.20.1")), "VLAN 20 injoignable sans routeur");
  const s1 = new IOSConsole(net.parNom("SW1"));
  ["en", "conf t", "int gi0/1", "switchport trunk allowed vlan 20", "end"].forEach((l) => taper(s1, l));
  taper(a, "arp -d");
  ok(!taper(a, "ping 192.168.10.2").some((l) => l.startsWith("Reply from 192.168.10.2")), "VLAN 10 retiré du trunk : plus de réponse");
});

test("lab 3 : DHCP, inter-VLAN (TTL 127), tracert, DNS, HTTP, show ip route", () => {
  const net = new Network(); chargerLab(net, "lab3");
  const a = new HostShell(net.parNom("PC-A"));
  const r = taper(a, "ipconfig /renew");
  ok(r.some((l) => /IPv4 Address\.+: 192\.168\.10\.10$/.test(l)), "DHCP : " + r.join("\n"));
  const p = taper(a, "ping 192.168.20.10");
  ok(p.filter((l) => /^Reply from 192\.168\.20\.10: .*TTL=127$/.test(l)).length >= 3, "inter-VLAN : " + p.join("\n"));
  const t = taper(a, "tracert 192.168.20.20");
  ok(t.some((l) => /^\s+1 .*192\.168\.10\.1$/.test(l)) && t.some((l) => /^\s+2 .*192\.168\.20\.20$/.test(l)), "tracert : " + t.join("\n"));
  const n = taper(a, "nslookup www.ciel.lan");
  ok(n.includes("Address:  192.168.20.10"), "nslookup : " + n.join("\n"));
  const w = taper(a, "curl http://www.ciel.lan");
  ok(w.some((l) => /BTS CIEL — serveur du labo/.test(l)), "curl : " + w.join("\n"));
  const R1 = new IOSConsole(net.parNom("R1"));
  taper(R1, "en");
  const rt = taper(R1, "show ip route");
  ok(rt.some((l) => /^C\s+192\.168\.10\.0\/24 is directly connected, GigabitEthernet0\/0\.10$/.test(l)), "show ip route : " + rt.join("\n"));
  ok(taper(R1, "show ip dhcp binding").some((l) => /^192\.168\.10\.10\s/.test(l)), "bail DHCP visible sur R1");
});

test("lab 4 : série et RIP — R2 se tait, puis parle, et le ping passe", () => {
  const net = new Network(); chargerLab(net, "lab4");
  const pc1 = new HostShell(net.parNom("PC1"));
  ok(taper(pc1, "ping -n 1 192.168.2.10").includes("Reply from 192.168.1.1: Destination net unreachable."), "étape 1 : R1 n'a pas de route");
  const R1 = new IOSConsole(net.parNom("R1")), R2 = new IOSConsole(net.parNom("R2"));
  taper(R1, "en");
  ok(taper(R1, "show ip interface brief").some((l) => /^Serial0\/0\/0\s+10\.0\.0\.1\s+YES manual up\s+up/.test(l)), "étape 2 : série up / up");
  ok(taper(R1, "show controllers serial 0/0/0").includes("DCE V.35, clock rate 64000"), "étape 2 : R1 est le DCE");
  ["en", "conf t", "router rip", "version 2", "no auto-summary", "network 192.168.2.0", "network 10.0.0.0", "end"].forEach((c) => taper(R2, c));
  net.executer();
  ok(taper(R1, "show ip route").some((l) => /^R\s+192\.168\.2\.0\/24 \[120\/1\] via 10\.0\.0\.2, \d\d:\d\d:\d\d, Serial0\/0\/0$/.test(l)), "étape 4 : la route R apparaît");
  const p = taper(pc1, "ping 192.168.2.10");
  ok(p.filter((l) => /^Reply from 192\.168\.2\.10: .*TTL=126$/.test(l)).length >= 3, "étape 5 : ping, TTL 126 → " + p.join("\n"));
  ["conf t", "int s0/0/0", "shutdown", "end"].forEach((c) => taper(R2, c));
  net.executer();
  ok(!taper(R1, "show ip route").some((l) => /192\.168\.2\.0/.test(l)), "bonus : la route disparaît");
});

test("lab 5 : le PAT — sans règle rien ne revient, avec la règle deux PC sortent", () => {
  const net = new Network(); chargerLab(net, "lab5");
  const pc1 = new HostShell(net.parNom("PC1")), pc2 = new HostShell(net.parNom("PC2"));
  ok(!taper(pc1, "ping -n 2 8.8.8.8").some((l) => /^Reply from 8\.8\.8\.8/.test(l)), "étape 1 : pas de réponse");
  const R1 = new IOSConsole(net.parNom("R1"));
  taper(R1, "en");
  const run = taper(R1, "show run");
  ok(run.includes(" ip nat inside") && run.includes(" ip nat outside"), "étape 2 : inside / outside posés");
  ["conf t", "access-list 1 permit 192.168.1.0 0.0.0.255", "ip nat inside source list 1 interface s0/0/0 overload", "end"].forEach((c) => taper(R1, c));
  ok(taper(pc1, "ping -n 2 8.8.8.8").filter((l) => /^Reply from 8\.8\.8\.8/.test(l)).length === 2, "étape 4 : PC1 passe");
  ok(taper(pc2, "ping -n 2 8.8.8.8").filter((l) => /^Reply from 8\.8\.8\.8/.test(l)).length === 2, "étape 4 : PC2 passe");
  const t = taper(R1, "show ip nat translations");
  ok(t.filter((l) => /^icmp 209\.165\.200\.225:\d+/.test(l)).length >= 2, "étape 4 : une adresse publique, plusieurs flux → " + t.join("\n"));
  ok(taper(pc1, "curl http://8.8.8.8").some((l) => /Bienvenue sur Internet/.test(l)), "étape 5 : curl à travers le PAT");
  ok(taper(R1, "show ip nat statistics").some((l) => /^Hits: \d+  Misses: \d+$/.test(l)), "étape 5 : statistiques");
});

test("chaque lab a un titre, un résumé et des étapes", () => {
  ok(LABS.length === 5, "cinq labs");
  LABS.forEach((l) => ok(l.titre && l.resume && l.etapes.length >= 4, "lab incomplet : " + l.id));
});
