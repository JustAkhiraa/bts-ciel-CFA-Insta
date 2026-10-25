/* Ce qu'affichent les « show » d'IOS, colonne pour colonne.

   Ces sorties sont celles qu'un élève recopie dans son compte rendu : leur
   mise en page compte autant que leur contenu. Elles sont donc écrites
   d'après les vraies sorties d'un 2911 et d'un 2960, avec leurs largeurs
   de colonnes, et lues dans l'état du moteur — jamais dans un texte figé. */

import { IPv4Address } from "../core/IPv4Address.js";
import { ecrireListeVlan } from "../devices/SwitchL2.js";
import { ListeAcces } from "../devices/Acl.js";

const pad = (s, n) => String(s).padEnd(n);
const estSwitch = (a) => a.type === "switch";

/* L'état d'une interface comme IOS l'écrit : Status / Protocol. */
export function etatInterface(app, p) {
  let statut;
  if (!p.adminUp) statut = "administratively down";
  else if (p.type === "vlan") statut = app.vlans.has(app.vlanDeSvi(p)) ? "up" : "down";
  else if (p.type === "loop") statut = "up";
  else if (p.parent) statut = p.parent.adminUp ? (p.parent.estUp() ? "up" : "down") : "administratively down";
  else if (p.type === "se") statut = p.physiqueUp() ? "up" : "down";
  else if (p.errDisabled) statut = "down";
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
/* « 00:00:12 » : depuis quand, en temps simulé. */
const duree = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, "0")).join(":"); };

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
    if (r.code === "R") {
      return tete + r.reseau + "/" + r.prefixe + " [120/" + r.metrique + "] via " + r.via + ", " + duree(app.reseau.horloge.t - r.vu) + ", " + r.interface.nom;
    }
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
    if (p.type === "se") {
      if (p.ip) L.push(" ip address " + p.ip + " " + p.masque); else L.push(" no ip address");
      if (p.aclIn) L.push(" ip access-group " + p.aclIn + " in");
      if (p.aclOut) L.push(" ip access-group " + p.aclOut + " out");
      if (p.natRole) L.push(" ip nat " + p.natRole);
      if (p.encapsulation === "ppp") L.push(" encapsulation ppp");
      if (p.clockRate) L.push(" clock rate " + p.clockRate);
    } else if (sw && p.type !== "vlan") {
      if (p.mode === "access" && p.accessVlan !== 1) L.push(" switchport access vlan " + p.accessVlan);
      if (p.mode === "trunk") {
        if (p.native !== 1) L.push(" switchport trunk native vlan " + p.native);
        if (p.allowed !== "all") L.push(" switchport trunk allowed vlan " + (ecrireListeVlan(p.allowed) || "none"));
        L.push(" switchport mode trunk");
      } else if (p._modeExplicite) L.push(" switchport mode access");
      const s = p.secu;
      if (s) {
        if (s.actif) L.push(" switchport port-security");
        if (s.max !== 1) L.push(" switchport port-security maximum " + s.max);
        if (s.violation !== "shutdown") L.push(" switchport port-security violation " + s.violation);
        if (s.sticky) L.push(" switchport port-security mac-address sticky ");
        s.adresses.filter((a) => a.type !== "dynamic").forEach((a) => L.push(" switchport port-security mac-address " + (a.type === "sticky" ? "sticky " : "") + a.mac.cisco().toUpperCase()));
      }
    } else {
      if (p.ip) L.push(" ip address " + p.ip + " " + p.masque); else if (!sw || p.type === "vlan") L.push(" no ip address");
      if (p.helper) L.push(" ip helper-address " + p.helper);
      if (p.aclIn) L.push(" ip access-group " + p.aclIn + " in");
      if (p.aclOut) L.push(" ip access-group " + p.aclOut + " out");
      if (p.natRole) L.push(" ip nat " + p.natRole);
      if (!p.parent && p.type !== "vlan") L.push(" duplex auto", " speed auto");
    }
    if (!p.adminUp) L.push(" shutdown");
    L.push("!");
  }
  if (sw && app.passerelle) L.push("ip default-gateway " + app.passerelle, "!");
  if (!sw) {
    const n = app.nat;
    [...n.pools].forEach(([nom, p]) => L.push("ip nat pool " + nom + " " + p.debut + " " + p.fin + " netmask " + p.masque));
    n.dynamiques.forEach((d) => L.push("ip nat inside source list " + d.acl + (d.iface ? " interface " + d.iface : " pool " + d.pool) + (d.overload ? " overload" : "")));
    n.statiques.forEach((s) => L.push("ip nat inside source static " + (s.proto ? s.proto + " " + s.local + " " + s.portLocal + " " + s.global + " " + s.portGlobal : s.local + " " + s.global)));
    if (x.natTimeout) L.push("ip nat translation timeout " + x.natTimeout);
    if (app.rip.actif) {
      const rip = app.rip;
      L.push("router rip");
      if (rip.version) L.push(" version " + rip.version);
      [...rip.passives].forEach((p) => L.push(" passive-interface " + p));
      rip.reseaux.forEach((n) => L.push(" network " + n));
      if (rip.defaut) L.push(" default-information originate");
      if (!rip.resume) L.push(" no auto-summary");
      L.push("!");
    }
    L.push("ip classless");
    app.statiques.forEach((r) => L.push("ip route " + r.reseau + " " + r.masque + " " + (r.via || r.sortie) + (r.distance > 1 ? " " + r.distance : "")));
    L.push("!", "ip flow-export version 9", "!");
    [...app.acl.values()].sort((a, b) => a.numero - b.numero).forEach((acl) => acl.lignes.forEach((l) => L.push("access-list " + acl.numero + " " + ListeAcces.texte(l))));
    if (app.acl.size) L.push("!");
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
    "2 Low-speed serial(sync/async) network interface(s)",
    "Configuration register is 0x2102",
  ];
}

/* ── RIP ─────────────────────────────────────────────────────────── */
export function ipProtocols(r) {
  const rip = r.rip;
  if (!rip.actif) return [];
  const t = r.reseau.horloge.t;
  const env = rip.version || 1, rec = rip.version ? String(rip.version) : "1 2";
  const out = ['Routing Protocol is "rip"',
    "Sending updates every 30 seconds, next due in " + (30 - Math.floor(t / 1000) % 30) + " seconds",
    "Invalid after 180 seconds, hold down 180, flushed after 240",
    "Outgoing update filter list for all interfaces is not set",
    "Incoming update filter list for all interfaces is not set",
    "Redistributing: rip",
    "Default version control: send version " + env + ", receive " + (rip.version ? "version " + rip.version : "any version"),
    "  Interface             Send  Recv  Triggered RIP  Key-chain"];
  rip.interfaces().filter((i) => !rip.passives.has(i.nom)).forEach((i) => out.push("  " + pad(i.nom, 22) + pad(env, 6) + pad(rec, 6)));
  out.push("Automatic network summarization is " + (rip.resume ? "" : "not ") + "in effect", "Maximum path: 4", "Routing for Networks:");
  rip.reseaux.forEach((n) => out.push("\t" + n));
  if (rip.passives.size) { out.push("Passive Interface(s):"); [...rip.passives].forEach((p) => out.push("\t" + p)); }
  out.push("Routing Information Sources:", "\tGateway         Distance      Last Update");
  [...rip.sources].forEach(([g, vu]) => out.push("\t" + pad(g, 16) + pad("120", 14) + duree(t - vu)));
  out.push("Distance: (default is 120)");
  return out;
}
export function ripBase(r) {
  const rip = r.rip;
  if (!rip.actif) return [];
  const out = [];
  const t = r.reseau.horloge.t;
  const vus = new Set();
  rip.interfaces().forEach((i) => {
    const cl = IPv4Address.depuisPrefixe(classePrefixe(i.ip));
    const maj = i.ip.reseau(cl) + "/" + cl.prefixe();
    if (rip.resume && !vus.has(maj)) { vus.add(maj); out.push(maj + "    auto-summary"); }
    out.push(i.ip.reseau(i.masque) + "/" + i.masque.prefixe() + "    directly connected, " + i.nom);
  });
  rip.routes().forEach((e) => out.push(e.reseau + "/" + e.masque.prefixe(), "    [" + e.metrique + "] via " + e.via + ", " + duree(t - e.vu) + ", " + e.iface.nom));
  return out;
}

/* ── NAT et listes d'accès ────────────────────────────────────────── */
const adrPort = (a) => (a ? a.ip + (a.port != null ? ":" + a.port : "") : "---");
export function natTraductions(r, verbeux) {
  const out = ["Pro  Inside global      Inside local       Outside local      Outside global"];
  const t = r.reseau.horloge.t;
  r.nat.entrees().slice().sort((a, b) => (a.proto ? 1 : 0) - (b.proto ? 1 : 0)).forEach((e) => {
    out.push(pad(e.proto || "---", 4) + " " + pad(adrPort(e.ig), 18) + " " + pad(adrPort(e.il), 18) + " " + pad(adrPort(e.ol), 18) + " " + adrPort(e.og));
    if (verbeux) out.push("  create " + duree(t - (e.cree || 0)) + ", use " + duree(t - (e.vu || 0)) + (e.permanente ? ", timeout:0" : "") + ", flags: " + (e.permanente ? "static" : e.proto ? "extended" : "none") + ", use_count: 0");
  });
  return out;
}
export function natStatistiques(r) {
  const n = r.nat, E = n.entrees();
  const statiques = E.filter((e) => e.permanente).length;
  const out = ["Total translations: " + E.length + " (" + statiques + " static, " + (E.length - statiques) + " dynamic, " + E.filter((e) => e.proto).length + " extended)",
    "Outside Interfaces: " + n.interfaces("outside").map((p) => p.nom).join(", "),
    "Inside Interfaces: " + n.interfaces("inside").map((p) => p.nom).join(", "),
    "Hits: " + n.hits + "  Misses: " + n.misses,
    "Expired translations: " + n.expirees,
    "Dynamic mappings:"];
  if (n.dynamiques.length) out.push("-- Inside Source");
  n.dynamiques.forEach((d, i) => {
    const refs = E.filter((e) => !e.permanente && e.proto).length;
    out.push("access-list " + d.acl + (d.iface ? " interface " + d.iface : " pool " + d.pool) + " refCount " + refs);
    const p = d.pool && n.pools.get(d.pool);
    if (p) {
      const total = p.fin.n - p.debut.n + 1;
      const pris = new Set(E.filter((e) => n.dansPool(p, e.ig.ip)).map((e) => e.ig.ip.n)).size;
      out.push(" pool " + d.pool + ": netmask " + p.masque, "\tstart " + p.debut + " end " + p.fin,
        "\ttype generic, total addresses " + total + " , allocated " + pris + " (" + Math.round(pris / total * 100) + "%), misses " + n.misses);
    }
  });
  return out;
}
export function listesAcces(r) {
  const out = [];
  [...r.acl.values()].sort((a, b) => a.numero - b.numero).forEach((acl) => {
    out.push("Standard IP access list " + acl.numero);
    acl.lignes.filter((l) => !l.remarque).forEach((l) => out.push("    " + l.n + " " + ListeAcces.texte(l) + (l.correspondances ? " (" + l.correspondances + " match(es))" : "")));
  });
  return out;
}

/* ── CDP ─────────────────────────────────────────────────────────── */
const courtCdp = (nom) => nom.replace(/^GigabitEthernet/, "Gig ").replace(/^FastEthernet/, "Fas ").replace(/^Serial/, "Ser ");
export function cdpVoisins(app) {
  if (!app.cdp.actif) return ["% CDP is not enabled"];
  const out = ["Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge",
    "                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone",
    "Device ID    Local Intrfce   Holdtme    Capability   Platform    Port ID"];
  app.cdp.liste().forEach((v) => out.push(pad(v.nom.slice(0, 12), 13) + pad(courtCdp(v.local.nom), 16) + pad(String(app.cdp.retention(v)).padStart(7), 15)
    + pad(v.capacites, 13) + pad(v.plateforme.replace(/^cisco /, "").replace("CISCO2911/K9", "C2900"), 12) + courtCdp(v.port)));
  return out;
}
export function cdpDetail(app) {
  if (!app.cdp.actif) return ["% CDP is not enabled"];
  const out = [];
  app.cdp.liste().forEach((v) => {
    out.push("", "Device ID: " + v.nom, "Entry address(es): ");
    if (v.adresse) out.push("  IP address : " + v.adresse);
    out.push("Platform: " + v.plateforme + ", Capabilities: " + (v.capacites === "R" ? "Router" : "Switch"),
      "Interface: " + v.local.nom + ", Port ID (outgoing port): " + v.port,
      "Holdtime: " + app.cdp.retention(v), "", "Version :", v.version, "", "advertisement version: 2");
    if (v.vlanNatif !== null) out.push("Native VLAN: " + v.vlanNatif);
    out.push("Duplex: " + v.duplex);
  });
  return out;
}

/* ── la sécurité de port ──────────────────────────────────────────── */
const MODE_VIOL = { protect: "Protect", restrict: "Restrict", shutdown: "Shutdown" };
export function portSecurity(sw) {
  const out = ["Secure Port MaxSecureAddr CurrentAddr SecurityViolation Security Action",
               "               (Count)       (Count)        (Count)",
               "--------------------------------------------------------------------"];
  sw.ports.filter((p) => p.secu && p.secu.actif).forEach((p) => out.push(p.court.padStart(13) + String(p.secu.max).padStart(9)
    + String(p.secu.adresses.length).padStart(11) + String(p.secu.violations).padStart(19) + "         " + MODE_VIOL[p.secu.violation]));
  out.push("----------------------------------------------------------------------");
  return out;
}
export function portSecurityInterface(sw, p) {
  const s = p.secu || { actif: false, max: 1, violation: "shutdown", adresses: [], violations: 0, derniere: null };
  const statut = !s.actif ? "Secure-down" : p.errDisabled ? "Secure-shutdown" : p.estUp() ? "Secure-up" : "Secure-down";
  const d = s.derniere;
  return ["Port Security              : " + (s.actif ? "Enabled" : "Disabled"),
    "Port Status                : " + statut,
    "Violation Mode             : " + MODE_VIOL[s.violation],
    "Aging Time                 : 0 mins",
    "Aging Type                 : Absolute",
    "SecureStatic Address Aging : Disabled",
    "Maximum MAC Addresses      : " + s.max,
    "Total MAC Addresses        : " + s.adresses.length,
    "Configured MAC Addresses   : " + s.adresses.filter((a) => a.type === "static").length,
    "Sticky MAC Addresses       : " + s.adresses.filter((a) => a.type === "sticky").length,
    "Last Source Address:Vlan   : " + (d ? d.mac.cisco().toUpperCase() + ":" + d.vlan : "0000.0000.0000:0"),
    "Security Violation Count   : " + s.violations];
}
export function portSecurityAdresses(sw) {
  const T = { static: "SecureConfigured", sticky: "SecureSticky", dynamic: "SecureDynamic" };
  const out = ["               Secure Mac Address Table",
    "-----------------------------------------------------------------------------",
    "Vlan    Mac Address       Type                          Ports   Remaining Age",
    "                                                                   (mins)",
    "----    -----------       ----                          -----   -------------"];
  let n = 0;
  sw.ports.filter((p) => p.secu && p.secu.actif).forEach((p) => p.secu.adresses.forEach((a) => {
    n++;
    out.push(pad(String(a.vlan).padStart(4), 8) + pad(a.mac.cisco().toUpperCase(), 18) + pad(T[a.type], 30) + pad(p.court, 8) + "     -");
  }));
  out.push("-----------------------------------------------------------------------------",
    "Total Addresses in System (excluding one mac per port)     : " + Math.max(0, n - sw.ports.filter((p) => p.secu && p.secu.actif).length),
    "Max Addresses limit in System (excluding one mac per port) : 1024");
  return out;
}
export function interfacesStatus(sw) {
  const out = ["Port      Name               Status       Vlan       Duplex  Speed Type"];
  sw.ports.filter((p) => p.type === "fa" || p.type === "gi").forEach((p) => {
    const statut = p.errDisabled ? "err-disabled" : !p.adminUp ? "disabled" : p.estUp() ? "connected" : "notconnect";
    out.push(pad(p.court, 10) + pad((p.description || "").slice(0, 18), 19) + pad(statut, 13) + pad(p.mode === "trunk" ? "trunk" : p.accessVlan, 11)
      + pad("auto", 8) + pad("auto", 6) + (p.type === "fa" ? "10/100BaseTX" : "10/100/1000BaseTX"));
  });
  return out;
}

/* « show controllers serial 0/0/0 » : de quel côté du câble on est. */
export function controleurs(p) {
  const out = ["Interface " + p.nom, "Hardware is PowerQUICC MPC860"];
  if (!p.cable || p.cable.type !== "serie") out.push("No serial cable attached");
  else if (p.estDce()) out.push(p.clockRate ? "DCE V.35, clock rate " + p.clockRate : "DCE V.35, no clock");
  else out.push((p.cable.autre(p).clockRate ? "DTE V.35 TX and RX clocks detected." : "DTE V.35 clocks stopped."));
  out.push("idb at 0x81081AC4, driver data structure at 0x81084AC0");
  return out;
}

export function interfaceDetail(app, p) {
  const e = etatInterface(app, p);
  if (p.type === "se") {
    return [p.nom + " is " + e.statut + ", line protocol is " + e.protocole,
      "  Hardware is HD64570",
      ...(p.description ? ["  Description: " + p.description] : []),
      ...(p.ip ? ["  Internet address is " + p.ip + "/" + p.masque.prefixe()] : []),
      "  MTU 1500 bytes, BW 1544 Kbit, DLY 20000 usec,",
      "     reliability 255/255, txload 1/255, rxload 1/255",
      "  Encapsulation " + p.encapsulation.toUpperCase() + ", loopback not set, keepalive set (10 sec)"];
  }
  const nom = p.type === "vlan" ? "Vlan" : p.type === "gi" || p.parent ? "Gigabit Ethernet" : "Fast Ethernet";
  const out = [p.nom + " is " + e.statut + ", line protocol is " + e.protocole,
    "  Hardware is " + (p.type === "vlan" ? "CPU Interface" : nom) + ", address is " + (p.mac ? p.mac.cisco() : "-") + " (bia " + (p.mac ? p.mac.cisco() : "-") + ")"];
  if (p.description) out.push("  Description: " + p.description);
  if (p.ip) out.push("  Internet address is " + p.ip + "/" + p.masque.prefixe());
  if (p.parent && p.dot1q !== null) out.push("  Encapsulation 802.1Q Virtual LAN, Vlan ID  " + p.dot1q);
  else out.push("  MTU 1500 bytes, BW " + (p.type === "fa" ? "100000" : "1000000") + " Kbit, DLY 10 usec,", "  Encapsulation ARPA, loopback not set");
  return out;
}
