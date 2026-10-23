/* Ce qu'affichent les « show » d'IOS, colonne pour colonne.

   Ces sorties sont celles qu'un élève recopie dans son compte rendu : leur
   mise en page compte autant que leur contenu. Elles sont donc écrites
   d'après les vraies sorties d'un 2911 et d'un 2960, avec leurs largeurs
   de colonnes, et lues dans l'état du moteur — jamais dans un texte figé. */

import { IPv4Address } from "../core/IPv4Address.js";
import { ecrireListeVlan } from "../devices/SwitchL2.js";

const pad = (s, n) => String(s).padEnd(n);
const estSwitch = (a) => a.type === "switch";

/* L'état d'une interface comme IOS l'écrit : Status / Protocol. */
export function etatInterface(app, p) {
  let statut;
  if (!p.adminUp) statut = "administratively down";
  else if (p.type === "vlan") statut = app.vlans.has(app.vlanDeSvi(p)) ? "up" : "down";
  else if (p.type === "loop") statut = "up";
  else if (p.parent) statut = p.parent.adminUp ? (p.parent.estUp() ? "up" : "down") : "administratively down";
  else statut = p.cable && p.cable.valide() && p.cable.autre(p).adminUp && p.cable.autre(p).appareil.allume ? "up" : "down";
  return { statut, protocole: p.estUp() ? "up" : "down" };
}

function interfacesAffichees(app) {
  const phys = app.ports.filter((p) => p.type !== "console" && p.type !== "rs232");
  return estSwitch(app) ? phys.concat(app.svis)
    : phys.concat(app.sous || []).sort((a, b) => a.nom.localeCompare(b.nom, "en", { numeric: true })).concat(app.boucles || []);
}

export function ipIntBrief(app) {
  const out = ["Interface              IP-Address      OK? Method Status                Protocol "];
  for (const p of interfacesAffichees(app)) {
    const e = etatInterface(app, p);
    out.push(pad(p.nom, 23) + pad(p.ip ? p.ip : "unassigned", 16) + "YES " + pad(p.ip ? "manual" : "unset", 7)
      + pad(e.statut, 22) + e.protocole + " ");
  }
  return out;
}

const classePrefixe = (ip) => { const o = ip.n >>> 24; return o < 128 ? 8 : o < 192 ? 16 : 24; };

export function ipRoute(app) {
  const out = [
    "Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP",
    "       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area",
    "       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2",
    "       E1 - OSPF external type 1, E2 - OSPF external type 2, E - EGP",
    "       i - IS-IS, L1 - IS-IS level-1, L2 - IS-IS level-2, ia - IS-IS inter area",
    "       * - candidate default, U - per-user static route, o - ODR",
    "       P - periodic downloaded static route",
    "",
  ];
  const routes = app.routes();
  const defaut = routes.find((r) => r.prefixe === 0);
  out.push(defaut ? "Gateway of last resort is " + (defaut.via || "0.0.0.0") + " to network 0.0.0.0" : "Gateway of last resort is not set");
  out.push("");
  // regroupées par réseau de classe, comme IOS
  const groupes = new Map();
  for (const r of routes.filter((x) => x.prefixe > 0)) {
    const cp = classePrefixe(r.reseau);
    const maj = r.reseau.reseau(IPv4Address.depuisPrefixe(cp));
    const cle = maj.n;
    if (!groupes.has(cle)) groupes.set(cle, { maj, cp, routes: [] });
    groupes.get(cle).routes.push(r);
  }
  const ligne = (r) => {
    const tete = pad(r.code + (r.prefixe === 0 ? "*" : ""), 8);
    const via = r.via ? " [" + r.distance + "/0] via " + r.via : " is directly connected, " + r.interface.nom;
    return tete + r.reseau + "/" + r.prefixe + via;
  };
  [...groupes.values()].sort((a, b) => a.maj.n - b.maj.n).forEach((g) => {
    const masques = new Set(g.routes.map((r) => r.prefixe));
    const seule = g.routes.length === 1 && g.routes[0].prefixe === g.cp;
    if (!seule) {
      out.push(masques.size > 1
        ? "     " + g.maj + "/" + g.cp + " is variably subnetted, " + g.routes.length + " subnets, " + masques.size + " masks"
        : "     " + g.maj + "/" + [...masques][0] + " is subnetted, " + g.routes.length + " subnets");
    }
    g.routes.sort((a, b) => a.reseau.n - b.reseau.n || a.prefixe - b.prefixe).forEach((r) => out.push(ligne(r)));
  });
  if (defaut) out.push(ligne(defaut));
  return out;
}

const VLANS_RESERVES = [[1002, "fddi-default"], [1003, "token-ring-default"], [1004, "fddinet-default"], [1005, "trnet-default"]];

export function vlanBrief(sw) {
  const out = ["", "VLAN Name                             Status    Ports",
               "---- -------------------------------- --------- -------------------------------"];
  const vlans = [...sw.vlans.keys()].sort((a, b) => a - b);
  for (const v of vlans) {
    const ports = sw.ports.filter((p) => p.type !== "console" && p.mode === "access" && p.accessVlan === v).map((p) => p.court);
    const lignes = [];
    for (let i = 0; i < ports.length; i += 4) lignes.push(ports.slice(i, i + 4).join(", "));
    out.push(pad(v, 5) + pad(sw.vlans.get(v).nom, 33) + pad("active", 10) + (lignes[0] || ""));
    lignes.slice(1).forEach((l) => out.push(" ".repeat(48) + l));
  }
  VLANS_RESERVES.forEach(([v, n]) => out.push(pad(v, 5) + pad(n, 33) + "active    "));
  return out;
}

export function macTable(sw) {
  const out = ["          Mac Address Table", "-------------------------------------------", "",
               "Vlan    Mac Address       Type        Ports", "----    -----------       --------    -----", ""];
  sw.entreesCam().sort((a, b) => a.vlan - b.vlan || a.port.nom.localeCompare(b.port.nom, "en", { numeric: true }))
    .forEach((e) => out.push(pad(String(e.vlan).padStart(4), 8) + pad(e.mac.cisco(), 18) + pad(e.type, 12) + e.port.court));
  return out;
}

export function trunks(sw) {
  const tr = sw.ports.filter((p) => p.mode === "trunk" && p.estUp());
  if (!tr.length) return [];
  const autorises = (p) => (p.allowed === "all" ? "1-1005" : ecrireListeVlan(p.allowed) || "none");
  const actifs = (p) => ecrireListeVlan(new Set([...sw.vlans.keys()].filter((v) => sw.transporte(p, v)))) || "none";
  const out = ["Port        Mode         Encapsulation  Status        Native vlan"];
  tr.forEach((p) => out.push(pad(p.court, 12) + pad("on", 13) + pad("802.1q", 15) + pad("trunking", 14) + p.native));
  out.push("", "Port        Vlans allowed on trunk");
  tr.forEach((p) => out.push(pad(p.court, 12) + autorises(p)));
  out.push("", "Port        Vlans allowed and active in management domain");
  tr.forEach((p) => out.push(pad(p.court, 12) + actifs(p)));
  out.push("", "Port        Vlans in spanning tree forwarding state and not pruned");
  tr.forEach((p) => out.push(pad(p.court, 12) + actifs(p)));
  return out;
}

export function arp(app) {
  const out = ["Protocol  Address          Age (min)  Hardware Addr   Type   Interface"];
  const lignes = [];
  app.interfacesL3().forEach((i) => lignes.push({ ip: i.ip, age: "-", mac: i.mac, iface: i }));
  for (const [ip, e] of app.ip.arp) {
    const age = Math.floor((app.reseau.horloge.t - e.vu) / 60000);
    lignes.push({ ip: IPv4Address.parse(ip), age: String(age), mac: e.mac, iface: e.iface });
  }
  lignes.sort((a, b) => a.ip.n - b.ip.n).forEach((l) => out.push("Internet  " + pad(l.ip, 17) + pad(l.age.padStart(9), 11)
    + pad(l.mac.cisco(), 16) + pad("ARPA", 7) + l.iface.nom));
  return out;
}

export function dhcpBindings(r) {
  const out = ["IP address       Client-ID/              Lease expiration        Type",
               "                 Hardware address"];
  for (const b of r.dhcp.baux.values()) out.push(pad(b.ip, 17) + pad(b.mac.cisco(), 24) + pad("--", 24) + "Automatic");
  return out;
}

export function dhcpPools(r) {
  const out = [];
  r.dhcp.pools.forEach((p) => {
    const total = p.masque ? (~p.masque.n >>> 0) - 1 : 0;
    const loues = [...r.dhcp.baux.values()].filter((b) => b.pool === p).length;
    out.push("", "Pool " + p.nom + " :", " Utilization mark (high/low)    : 100 / 0", " Subnet size (first/next)       : 0 / 0 ",
      " Total addresses                : " + total, " Leased addresses               : " + loues, " Excluded addresses             : "
      + r.dhcp.exclues.reduce((s, x) => s + (x.a.n - x.de.n + 1), 0), " Pending event                  : none", "",
      " 1 subnet is currently in the pool :", " Current index        IP address range                    Leased/Excluded/Total",
      " " + pad(p.reseau ? p.reseau.plus(1) : "-", 21) + pad((p.reseau ? p.reseau.plus(1) : "") + "      - " + (p.reseau ? p.reseau.diffusion(p.masque).plus(-1) : ""), 36) + loues + "    / 0     / " + total);
  });
  return out;
}

/* ── show running-config ─────────────────────────────────────────── */
export function runningConfig(app) {
  const L = [];
  const sw = estSwitch(app);
  const x = app.extra || {};
  L.push("!", "version " + (sw ? "12.2" : "15.1"), "no service timestamps log datetime msec", "no service timestamps debug datetime msec",
    (x.chiffrement ? "" : "no ") + "service password-encryption", "!", "hostname " + app.nom, "!");
  if (x.secret || x.secretHache) L.push("enable secret 5 $1$mERr$" + (x.secretHache || hache(x.secret)));
  if (x.password) L.push("enable password " + (x.chiffrement ? "7 " + hache(x.password).slice(0, 14) : x.password));
  if (x.secret || x.password) L.push("!");
  if (!sw) {
    if (app.dhcp.exclues.length) {
      app.dhcp.exclues.forEach((e) => L.push("ip dhcp excluded-address " + e.de + (e.a.egale(e.de) ? "" : " " + e.a)));
      L.push("!");
    }
    app.dhcp.pools.forEach((p) => {
      L.push("ip dhcp pool " + p.nom);
      if (p.reseau) L.push(" network " + p.reseau + " " + p.masque);
      if (p.routeur) L.push(" default-router " + p.routeur);
      if (p.dns) L.push(" dns-server " + p.dns);
      if (p.domaine) L.push(" domain-name " + p.domaine);
      L.push("!");
    });
    L.push("!", "!", "!", "no ip cef", "no ipv6 cef", "!");
  }
  if (x.noDomainLookup) L.push("no ip domain-lookup", "!");
  if (x.domaine) L.push("ip domain-name " + x.domaine, "!");
  if (x.utilisateurs && x.utilisateurs.length) {
    x.utilisateurs.forEach((u) => L.push("username " + u.nom + (u.privilege !== null ? " privilege " + u.privilege : "")
      + (u.secret || u.secretHache ? " secret 5 $1$mERr$" + (u.secretHache || hache(u.secret)) : " password " + u.password)));
    L.push("!");
  }
  if (x.sshVersion) L.push("ip ssh version " + x.sshVersion, "!");
  if (sw) L.push("spanning-tree mode pvst", "spanning-tree extend system-id", "!");
  for (const p of interfacesAffichees(app)) {
    L.push("interface " + p.nom);
    if (p.description) L.push(" description " + p.description);
    if (p.parent) {
      if (p.dot1q !== null) L.push(" encapsulation dot1Q " + p.dot1q + (p.dot1qNatif ? " native" : ""));
    }
    if (sw && p.type !== "vlan") {
      if (p.mode === "access" && p.accessVlan !== 1) L.push(" switchport access vlan " + p.accessVlan);
      if (p.mode === "trunk") {
        if (p.native !== 1) L.push(" switchport trunk native vlan " + p.native);
        if (p.allowed !== "all") L.push(" switchport trunk allowed vlan " + (ecrireListeVlan(p.allowed) || "none"));
        L.push(" switchport mode trunk");
      } else if (p._modeExplicite) L.push(" switchport mode access");
    } else {
      if (p.ip) L.push(" ip address " + p.ip + " " + p.masque); else if (!sw || p.type === "vlan") L.push(" no ip address");
      if (p.helper) L.push(" ip helper-address " + p.helper);
      if (!p.parent && p.type !== "vlan") L.push(" duplex auto", " speed auto");
    }
    if (!p.adminUp) L.push(" shutdown");
    L.push("!");
  }
  if (sw && app.passerelle) L.push("ip default-gateway " + app.passerelle, "!");
  if (!sw) {
    L.push("ip classless");
    app.statiques.forEach((r) => L.push("ip route " + r.reseau + " " + r.masque + " " + (r.via || r.sortie) + (r.distance > 1 ? " " + r.distance : "")));
    L.push("!", "ip flow-export version 9", "!");
  }
  if (x.banniere) L.push("banner motd ^C" + x.banniere + "^C", "!");
  L.push("!", "!", "line con 0");
  if (x.lignes && x.lignes.con) { if (x.lignes.con.password) L.push(" password " + x.lignes.con.password); if (x.lignes.con.login) L.push(x.lignes.con.login === "local" ? " login local" : " login"); }
  L.push("!");
  if (!sw) L.push("line aux 0", "!");
  L.push("line vty 0 4");
  const vty = (x.lignes && x.lignes.vty) || {};
  if (vty.password) L.push(" password " + vty.password);
  L.push(vty.login === "local" ? " login local" : " login");
  if (vty.transport) L.push(" transport input " + vty.transport);
  if (sw) L.push("line vty 5 15", " login");
  L.push("!", "!", "!", "end");
  const corps = L.join("\n");
  return ["Building configuration...", "", "Current configuration : " + corps.length + " bytes"].concat(L);
}

export function hache(s) {
  let h = 5381;
  for (const c of String(s)) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return h.toString(36).padStart(7, "0") + (h * 7).toString(36).slice(0, 7);
}

export function version(app) {
  const sw = estSwitch(app);
  return sw ? [
    "Cisco IOS Software, C2960 Software (C2960-LANBASEK9-M), Version 15.0(2)SE4, RELEASE SOFTWARE (fc1)",
    "",
    app.nom + " uptime is " + Math.floor(app.reseau.horloge.t / 60000) + " minutes",
    "System image file is \"flash:c2960-lanbasek9-mz.150-2.SE4.bin\"",
    "",
    "cisco WS-C2960-24TT-L (PowerPC405) processor with 65536K bytes of memory.",
    "24 FastEthernet interfaces",
    "2 Gigabit Ethernet interfaces",
    "Base ethernet MAC Address       : " + app.base.linux().toUpperCase(),
    "Configuration register is 0xF",
  ] : [
    "Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.1(4)M4, RELEASE SOFTWARE (fc2)",
    "",
    app.nom + " uptime is " + Math.floor(app.reseau.horloge.t / 60000) + " minutes",
    "System image file is \"flash0:c2900-universalk9-mz.SPA.151-4.M4.bin\"",
    "",
    "Cisco CISCO2911/K9 (revision 1.0) with 491520K/32768K bytes of memory.",
    "3 Gigabit Ethernet interfaces",
    "Configuration register is 0x2102",
  ];
}

export function interfaceDetail(app, p) {
  const e = etatInterface(app, p);
  const nom = p.type === "vlan" ? "Vlan" : p.type === "gi" || p.parent ? "Gigabit Ethernet" : "Fast Ethernet";
  const out = [p.nom + " is " + e.statut + ", line protocol is " + e.protocole,
    "  Hardware is " + (p.type === "vlan" ? "CPU Interface" : nom) + ", address is " + (p.mac ? p.mac.cisco() : "-") + " (bia " + (p.mac ? p.mac.cisco() : "-") + ")"];
  if (p.description) out.push("  Description: " + p.description);
  if (p.ip) out.push("  Internet address is " + p.ip + "/" + p.masque.prefixe());
  if (p.parent && p.dot1q !== null) out.push("  Encapsulation 802.1Q Virtual LAN, Vlan ID  " + p.dot1q);
  else out.push("  MTU 1500 bytes, BW " + (p.type === "fa" ? "100000" : "1000000") + " Kbit, DLY 10 usec,", "  Encapsulation ARPA, loopback not set");
  return out;
}
