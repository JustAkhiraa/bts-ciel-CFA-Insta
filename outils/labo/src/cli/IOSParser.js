/* La console IOS d'un routeur ou d'un commutateur.

   Une machine à états, comme sur le vrai matériel :
     Router>                  user EXEC        (enable)
     Router#                  privileged EXEC  (configure terminal)
     Router(config)#          global config    (interface, vlan, ip dhcp pool, line)
     Router(config-if)#       interface        (Gi0/0)
     Router(config-subif)#    sous-interface   (Gi0/0.10)
     Router(config-if-range)# plage d'interfaces
     Switch(config-vlan)#     VLAN
     Router(dhcp-config)#     pool DHCP
     Router(config-line)#     ligne console / vty

   Ce qui fait la différence avec un formulaire, et qu'on garde : les
   abréviations (« sh ip int br »), le « ^ » sous le mot fautif, une
   commande globale tapée depuis un sous-mode qui y remonte toute seule
   (« vlan 20 » depuis config-if), « do » pour lancer un show sans quitter
   la configuration, et la célèbre attente « Translating... » quand on tape
   un mot inconnu en mode EXEC. */

import { CommandTree } from "./CommandTree.js";
import * as A from "./IOSAffichage.js";
import { IPv4Address } from "../core/IPv4Address.js";
import { normaliserInterface } from "../devices/Port.js";
import { lireListeVlan, ecrireListeVlan } from "../devices/SwitchL2.js";

/* Les phrases d'aide du « ? », en anglais comme sur la machine. */
const AIDES = {
  enable: "Turn on privileged commands", disable: "Turn off privileged commands", exit: "Exit from the EXEC",
  logout: "Exit from the EXEC", end: "Exit from configure mode", ping: "Send echo messages",
  traceroute: "Trace route to destination", show: "Show running system information", configure: "Enter configuration mode",
  terminal: "Configure from the terminal", copy: "Copy from one file to another", write: "Write running configuration to memory",
  clear: "Reset functions", "running-config": "Current operating configuration", "startup-config": "Contents of startup configuration",
  ip: "IP information", interface: "Select an interface to configure", interfaces: "Interface status and configuration",
  brief: "Brief summary of IP status and configuration", route: "IP routing table", vlan: "Vlan commands",
  "mac-address-table": "MAC forwarding table", mac: "MAC configuration", "address-table": "MAC forwarding table",
  arp: "ARP table", version: "System hardware and software status", hostname: "Set system's network name",
  "default-gateway": "Specify default gateway (if not routing IP)", dhcp: "Configure DHCP server and relay parameters",
  pool: "Configure DHCP address pools", "excluded-address": "Prevent DHCP from assigning certain addresses",
  address: "Set the IP address of an interface", shutdown: "Shutdown the selected interface", no: "Negate a command or set its defaults",
  description: "Interface specific description", switchport: "Set switching mode characteristics", mode: "Set trunking mode of the interface",
  access: "Set access mode characteristics of the interface", trunk: "Set trunking characteristics of the interface",
  allowed: "Set allowed VLAN characteristics when interface is in trunking mode", native: "Set trunking native characteristics when interface is in trunking mode",
  encapsulation: "Set encapsulation type for an interface", dot1q: "IEEE 802.1Q Virtual LAN", "helper-address": "Specify a destination address for UDP broadcasts",
  name: "Ascii name of the VLAN", network: "Network number and mask", "default-router": "Default routers", "dns-server": "DNS servers",
  line: "Configure a terminal line", console: "Primary terminal line", vty: "Virtual terminal", password: "Set a password",
  login: "Enable password checking", secret: "Assign the privileged level secret", banner: "Define a login banner",
  motd: "Set Message of the Day banner", service: "Modify use of network based services", "password-encryption": "Encrypt system passwords",
  "domain-lookup": "Enable IP Domain Name System hostname translation", do: "To run exec commands in config mode",
  range: "interface range command", trunk_: "", binding: "DHCP address bindings", history: "Display the session command history",
  memory: "Write to NV memory", "arp-cache": "Clear the entire ARP cache", dynamic: "dynamic entry type", add: "add VLANs to the current list",
  remove: "remove VLANs from the current list", all: "all VLANs", none: "no VLANs", except: "all VLANs except the following",
  speed: "Configure speed operation", duplex: "Configure duplex operation", clock: "Display the system clock",
  "<cible>": "Ping destination address or hostname", "<nom>": "This system's network name",
};

const jetons = (s) => String(s).trim().split(/\s+/).filter(Boolean);
const SOUS_MODES = new Set(["if", "subif", "range", "vlan", "dhcp", "line"]);

/* ═══════════════ Les arbres, un jeu par type d'équipement ═══════════ */
const cache = new Map();
function arbresPour(type) {
  if (!cache.has(type)) cache.set(type, construire(type === "switch"));
  return cache.get(type);
}

function construire(sw) {
  const T = () => new CommandTree(AIDES);
  const user = T(), priv = T(), config = T(), iface = T(), vlan = T(), dhcp = T(), ligne = T();

  /* ── EXEC : ce qui marche aux deux niveaux ── */
  for (const t of [user, priv]) {
    t.ajouter("ping <cible:mot>", pingIOS);
    t.ajouter("traceroute <cible:mot>", tracerouteIOS);
    t.ajouter("show ip interface brief", (c, a, o) => o.lignes(A.ipIntBrief(c.app)));
    t.ajouter("show interfaces <if:interface>", (c, a, o) => {
      const p = c.app.port(a.if);
      if (!p) return o.ligne("% Invalid input detected at '^' marker.");
      o.lignes(A.interfaceDetail(c.app, p));
    });
    t.ajouter("show arp", (c, a, o) => o.lignes(A.arp(c.app)));
    t.ajouter("show ip arp", (c, a, o) => o.lignes(A.arp(c.app)));
    t.ajouter("show version", (c, a, o) => o.lignes(A.version(c.app)));
    t.ajouter("show history", (c, a, o) => o.lignes(c.historique.slice(-10).map((h) => "  " + h)));
    t.ajouter("show clock", (c, a, o) => o.ligne("*" + new Date().toUTCString().replace(/^\w+, /, "").replace(" GMT", ".000 UTC")));
    t.ajouter("terminal length <n:nombre>", () => {});
    if (sw) {
      t.ajouter("show vlan brief", (c, a, o) => o.lignes(A.vlanBrief(c.app)));
      t.ajouter("show vlan", (c, a, o) => o.lignes(A.vlanBrief(c.app)));
      t.ajouter("show mac address-table", (c, a, o) => o.lignes(A.macTable(c.app)));
      t.ajouter("show mac-address-table", (c, a, o) => o.lignes(A.macTable(c.app)));
      t.ajouter("show interfaces trunk", (c, a, o) => o.lignes(A.trunks(c.app)));
      t.ajouter("show ip route", (c, a, o) => o.lignes(["Default gateway is " + (c.app.passerelle || "not set"), "",
        "Host               Gateway           Last Use    Total Uses  Interface", "ICMP redirect cache is empty"]));
    } else {
      t.ajouter("show ip route", (c, a, o) => o.lignes(A.ipRoute(c.app)));
      t.ajouter("show ip dhcp binding", (c, a, o) => o.lignes(A.dhcpBindings(c.app)));
      t.ajouter("show ip dhcp pool", (c, a, o) => o.lignes(A.dhcpPools(c.app)));
    }
  }
  user.ajouter("enable", (c, a, o) => {
    const x = c.app.extra || {};
    const mdp = x.secret || x.password;
    if (!mdp && !x.secretHache) { c.mode = "priv"; return; }
    let essais = 0;
    // un secret relu d'une startup-config n'existe plus qu'en empreinte :
    // on compare l'empreinte de ce qui est tapé, comme IOS
    const bon = (rep) => (x.secretHache ? A.hache(rep) === x.secretHache : rep === mdp);
    const demander = () => c.demander("Password: ", true, (rep, o2) => {
      if (bon(rep)) { c.mode = "priv"; return; }
      if (++essais < 3) demander(); else o2.ligne("% Bad secrets");
    });
    demander();
  });
  user.ajouter("exit", (c, a, o) => { o.lignes(["", c.app.nom + " con0 is now available", "", "Press RETURN to get started."]); });
  user.ajouter("logout", (c, a, o) => { o.lignes(["", "Press RETURN to get started."]); });

  priv.ajouter("enable", () => {});
  priv.ajouter("disable", (c) => { c.mode = "user"; });
  priv.ajouter("exit", (c, a, o) => { c.mode = "user"; o.lignes(["", c.app.nom + " con0 is now available", "", "Press RETURN to get started."]); });
  priv.ajouter("logout", (c) => { c.mode = "user"; });
  priv.ajouter("configure terminal", (c, a, o) => {
    o.ligne("Enter configuration commands, one per line.  End with CNTL/Z.");
    c.mode = "config"; c.ctx = {};
  });
  const montrerRun = (c, a, o) => o.lignes(A.runningConfig(c.app));
  priv.ajouter("show running-config", montrerRun);
  priv.ajouter("show startup-config", (c, a, o) => {
    if (!c.app.startup) return o.ligne("startup-config is not present");
    o.lignes(["Using " + c.app.startup.join("\n").length + " bytes"].concat(c.app.startup));
  });
  const sauver = (c, a, o) => {
    c.app.startup = A.runningConfig(c.app).slice(3);
    o.lignes(["Building configuration...", "[OK]"]);
    c.app.reseau.emit("config", c.app);
  };
  priv.ajouter("write memory", sauver);
  priv.ajouter("write", sauver);
  priv.ajouter("copy running-config startup-config", (c, a, o) => {
    c.demander("Destination filename [startup-config]? ", false, (rep, o2) => {
      if (rep.trim() === "" || rep.trim() === "startup-config") sauver(c, a, o2);
      else o2.ligne("%Error opening " + rep.trim() + " (Permission denied)");
    });
  });
  priv.ajouter("erase startup-config", (c, a, o) => {
    c.demander("Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]", false, (rep, o2) => {
      if (/^n/i.test(rep.trim())) return;
      c.app.startup = null;
      o2.lignes(["[OK]", "Erase of nvram: complete", "%SYS-7-NV_BLOCK_INIT: Initialized the geometry of nvram"]);
    });
  });
  priv.ajouter("write erase", (c, a, o) => { c.app.startup = null; o.lignes(["[OK]", "Erase of nvram: complete"]); });
  priv.ajouter("reload", (c, a, o) => {
    c.demander("Proceed with reload? [confirm]", false, (rep, o2) => {
      if (/^n/i.test(rep.trim())) return;
      recharger(c, o2);
    });
  });
  if (sw) {
    priv.ajouter("delete vlan.dat", (c, a, o) => effacerVlans(c));
    priv.ajouter("delete flash:vlan.dat", (c, a, o) => effacerVlans(c));
  }
  priv.ajouter("clear arp-cache", (c) => { c.app.ip.viderArp(); c.app.reseau.emit("etat"); });
  priv.ajouter("clear ip arp", (c) => { c.app.ip.viderArp(); c.app.reseau.emit("etat"); });
  if (sw) {
    priv.ajouter("clear mac address-table dynamic", (c) => { c.app.viderCam(); c.app.reseau.emit("etat"); });
    priv.ajouter("clear mac-address-table dynamic", (c) => { c.app.viderCam(); c.app.reseau.emit("etat"); });
  } else {
    priv.ajouter("clear ip dhcp binding <tout:mot>", (c) => { c.app.dhcp.baux.clear(); });
  }

  /* ── configuration globale ── */
  config.ajouter("hostname <nom:mot>", (c, a) => { c.app.nom = a.nom; c.app.reseau.emit("topologie"); });
  config.ajouter("interface <if:interface>", entrerInterface);
  config.ajouter("interface range <plage:texte>", entrerPlage);
  config.ajouter("exit", (c) => { c.mode = "priv"; c.ctx = {}; });
  config.ajouter("end", finConfig);
  config.ajouter("enable secret <mdp:mot>", (c, a) => { c.app.extra.secret = a.mdp; delete c.app.extra.secretHache; });
  config.ajouter("enable secret <niveau:nombre> <empreinte:mot>", (c, a, o) => {
    if (a.niveau !== 5) return c.refuser(o, 2);
    c.app.extra.secretHache = a.empreinte.replace(/^\$1\$mERr\$/, ""); delete c.app.extra.secret;
  });
  config.ajouter("enable password <mdp:mot>", (c, a) => { c.app.extra.password = a.mdp; });
  config.ajouter("no enable secret", (c) => { delete c.app.extra.secret; });
  config.ajouter("service password-encryption", (c) => { c.app.extra.chiffrement = true; });
  config.ajouter("no service password-encryption", (c) => { c.app.extra.chiffrement = false; });
  // les lignes qu'IOS écrit dans sa propre running-config : les recoller
  // (ou les rejouer au démarrage) ne doit rien casser
  ["version <v:mot>", "service timestamps <reste:texte>", "no service timestamps <reste:texte>", "ip cef", "no ip cef",
   "ipv6 cef", "no ipv6 cef", "ip classless", "ip flow-export version <v:nombre>", "line aux <n:ligne>"].forEach((m) => config.ajouter(m, () => {}));
  if (sw) ["spanning-tree mode pvst", "spanning-tree extend system-id"].forEach((m) => config.ajouter(m, () => {}));
  config.ajouter("banner motd <texte:texte>", (c, a) => {
    // « ^C … ^C », « # … # » : le délimiteur est ce qui encadre le texte
    const t = a.texte;
    c.app.extra.banniere = /^\^C.*\^C$/.test(t) ? t.slice(2, -2) : t.replace(/^(.)(.*)\1$/, "$2");
  });
  config.ajouter("no ip domain-lookup", (c) => { c.app.extra.noDomainLookup = true; });
  config.ajouter("ip domain-lookup", (c) => { c.app.extra.noDomainLookup = false; });
  /* SSH : la configuration est acceptée et gardée — c'est elle qu'on note
     au TP —, mais le labo n'a pas de client SSH pour s'y connecter. */
  config.ajouter("ip domain-name <nom:mot>", (c, a) => { c.app.extra.domaine = a.nom; });
  config.ajouter("no ip domain-name", (c) => { delete c.app.extra.domaine; });
  const utilisateur = (c, a, prive) => { c.app.extra.utilisateurs = (c.app.extra.utilisateurs || []).filter((u) => u.nom !== a.nom).concat([{ nom: a.nom, privilege: a.n ?? null, secret: prive ? a.mdp : null, password: prive ? null : a.mdp }]); };
  config.ajouter("username <nom:mot> privilege <n:nombre> secret <mdp:mot>", (c, a) => utilisateur(c, a, true));
  config.ajouter("username <nom:mot> privilege <n:nombre> secret <niveau:nombre> <empreinte:mot>", (c, a) => {
    utilisateur(c, { nom: a.nom, n: a.n, mdp: null }, true);
    c.app.extra.utilisateurs.find((u) => u.nom === a.nom).secretHache = a.empreinte.replace(/^\$1\$mERr\$/, "");
  });
  config.ajouter("username <nom:mot> secret <mdp:mot>", (c, a) => utilisateur(c, a, true));
  config.ajouter("username <nom:mot> password <mdp:mot>", (c, a) => utilisateur(c, a, false));
  const cles = (c, o, bits) => {
    const x = c.app.extra;
    if (!x.domaine) return o.ligne("% Please define a domain-name first.");
    if (/^(Router|Switch)\d*$/.test(c.app.nom)) return o.ligne("% Please define a hostname other than " + c.app.nom + ".");
    const fin = (n) => {
      x.rsa = n;
      o.lignes(["% Generating " + n + " bit RSA keys, keys will be non-exportable...[OK]", "*Mar 1 0:0:0.0: %SSH-5-ENABLED: SSH 1.99 has been enabled"]);
    };
    if (bits) return fin(bits);
    o.lignes(["The name for the keys will be: " + c.app.nom + "." + x.domaine,
      "Choose the size of the key modulus in the range of 360 to 4096 for your",
      "  General Purpose Keys. Choosing a key modulus greater than 512 may take",
      "  a few minutes.", ""]);
    c.demander("How many bits in the modulus [512]: ", false, (rep, o2) => {
      const n = rep.trim() ? parseInt(rep, 10) : 512;
      if (!(n >= 360 && n <= 4096)) return o2.ligne("% Invalid modulus size.");
      o = o2; fin(n);
    });
  };
  config.ajouter("crypto key generate rsa", (c, a, o) => cles(c, o, null));
  config.ajouter("crypto key generate rsa general-keys modulus <n:nombre>", (c, a, o) => cles(c, o, a.n));
  config.ajouter("ip ssh version <n:nombre>", (c, a) => { c.app.extra.sshVersion = a.n; });
  config.ajouter("line console <n:ligne>", (c) => { c.mode = "line"; c.ctx = { ligne: "con" }; });
  config.ajouter("line vty <a:ligne> <b:ligne>", (c) => { c.mode = "line"; c.ctx = { ligne: "vty" }; });
  if (sw) {
    config.ajouter("vlan <id:vlan>", (c, a) => {
      if (!c.app.vlans.has(a.id)) c.app.vlans.set(a.id, { nom: "VLAN" + String(a.id).padStart(4, "0") });
      c.mode = "vlan"; c.ctx = { vlan: a.id };
      c.app.reseau.evaluerLiens();
    });
    config.ajouter("no vlan <id:vlan>", (c, a, o) => {
      if (a.id === 1) return o.ligne("%Default VLAN 1 may not be deleted.");
      c.app.vlans.delete(a.id);
      c.app.reseau.evaluerLiens();
    });
    config.ajouter("ip default-gateway <ip:ip>", (c, a) => { c.app.passerelle = a.ip; });
    config.ajouter("no ip default-gateway", (c) => { c.app.passerelle = null; });
  } else {
    config.ajouter("ip route <reseau:ip> <masque:masque> <via:ip>", routeStatique);
    config.ajouter("ip route <reseau:ip> <masque:masque> <via:ip> <distance:nombre>", routeStatique);
    config.ajouter("ip route <reseau:ip> <masque:masque> <sortie:interface>", routeStatique);
    config.ajouter("no ip route <reseau:ip> <masque:masque> <via:ip>", retirerRoute);
    config.ajouter("no ip route <reseau:ip> <masque:masque> <sortie:interface>", retirerRoute);
    config.ajouter("no ip route <reseau:ip> <masque:masque>", retirerRoute);
    config.ajouter("ip dhcp pool <nom:mot>", (c, a) => {
      let p = c.app.dhcp.pools.find((x) => x.nom === a.nom);
      if (!p) { p = { nom: a.nom, reseau: null, masque: null, routeur: null, dns: null }; c.app.dhcp.pools.push(p); }
      c.mode = "dhcp"; c.ctx = { pool: p };
    });
    config.ajouter("no ip dhcp pool <nom:mot>", (c, a) => { c.app.dhcp.pools = c.app.dhcp.pools.filter((x) => x.nom !== a.nom); });
    config.ajouter("ip dhcp excluded-address <de:ip>", (c, a) => { c.app.dhcp.exclues.push({ de: a.de, a: a.de }); });
    config.ajouter("ip dhcp excluded-address <de:ip> <a:ip>", (c, a) => { c.app.dhcp.exclues.push({ de: a.de, a: a.a }); });
    config.ajouter("no ip dhcp excluded-address <de:ip>", (c, a) => { c.app.dhcp.exclues = c.app.dhcp.exclues.filter((x) => !x.de.egale(a.de)); });
    config.ajouter("no ip dhcp excluded-address <de:ip> <a:ip>", (c, a) => { c.app.dhcp.exclues = c.app.dhcp.exclues.filter((x) => !x.de.egale(a.de)); });
    config.ajouter("ip routing", () => {});
  }

  /* ── interface (et sous-interface, et plage) ── */
  iface.ajouter("exit", (c) => { c.mode = "config"; c.ctx = {}; });
  iface.ajouter("end", finConfig);
  iface.ajouter("shutdown", (c) => surInterfaces(c, (p) => { p.adminUp = false; }));
  iface.ajouter("no shutdown", (c) => surInterfaces(c, (p) => { p.adminUp = true; }));
  iface.ajouter("description <texte:texte>", (c, a) => surInterfaces(c, (p) => { p.description = a.texte; }));
  iface.ajouter("no description", (c) => surInterfaces(c, (p) => { p.description = ""; }));
  iface.ajouter("ip address <ip:ip> <masque:masque>", adresseIp);
  iface.ajouter("no ip address", (c) => surInterfaces(c, (p) => { p.ip = null; p.masque = null; }));
  iface.ajouter("speed <v:mot>", () => {});
  iface.ajouter("duplex <v:mot>", () => {});
  if (sw) {
    iface.ajouter("switchport mode access", (c, a, o) => surPortsL2(c, o, (p) => { p.mode = "access"; p._modeExplicite = true; }));
    iface.ajouter("switchport mode trunk", (c, a, o) => surPortsL2(c, o, (p) => { p.mode = "trunk"; }));
    iface.ajouter("switchport access vlan <id:vlan>", (c, a, o) => {
      if (!c.app.vlans.has(a.id)) {
        o.ligne("% Access VLAN does not exist. Creating vlan " + a.id);
        c.app.vlans.set(a.id, { nom: "VLAN" + String(a.id).padStart(4, "0") });
      }
      surPortsL2(c, o, (p) => { p.accessVlan = a.id; });
    });
    iface.ajouter("no switchport access vlan", (c, a, o) => surPortsL2(c, o, (p) => { p.accessVlan = 1; }));
    iface.ajouter("switchport trunk native vlan <id:vlan>", (c, a, o) => surPortsL2(c, o, (p) => { p.native = a.id; }));
    iface.ajouter("no switchport trunk native vlan", (c, a, o) => surPortsL2(c, o, (p) => { p.native = 1; }));
    const autoriser = (calc) => (c, a, o) => surPortsL2(c, o, (p) => {
      const actuel = p.allowed === "all" ? new Set(Array.from({ length: 4094 }, (_, i) => i + 1)) : new Set(p.allowed);
      const r = calc(actuel, a.liste ? lireListeVlan(a.liste) : null);
      p.allowed = r === "all" || (r.size === 4094) ? "all" : r;
    });
    iface.ajouter("switchport trunk allowed vlan <liste:liste>", autoriser((cur, l) => l));
    iface.ajouter("switchport trunk allowed vlan add <liste:liste>", autoriser((cur, l) => new Set([...cur, ...l])));
    iface.ajouter("switchport trunk allowed vlan remove <liste:liste>", autoriser((cur, l) => new Set([...cur].filter((v) => !l.has(v)))));
    iface.ajouter("switchport trunk allowed vlan except <liste:liste>", autoriser((cur, l) => new Set(Array.from({ length: 4094 }, (_, i) => i + 1).filter((v) => !l.has(v)))));
    iface.ajouter("switchport trunk allowed vlan all", autoriser(() => "all"));
    iface.ajouter("switchport trunk allowed vlan none", autoriser(() => new Set()));
    iface.ajouter("no switchport trunk allowed vlan", autoriser(() => "all"));
    iface.ajouter("switchport nonegotiate", () => {});
    iface.ajouter("spanning-tree portfast", (c, a, o) => o.ligne("%Warning: portfast should only be enabled on ports connected to a single host."));
  } else {
    iface.ajouter("encapsulation dot1q <id:vlan>", (c, a, o) => dot1q(c, a, o, false));
    iface.ajouter("encapsulation dot1q <id:vlan> native", (c, a, o) => dot1q(c, a, o, true));
    iface.ajouter("ip helper-address <ip:ip>", (c, a) => surInterfaces(c, (p) => { p.helper = a.ip; }));
    iface.ajouter("no ip helper-address", (c) => surInterfaces(c, (p) => { p.helper = null; }));
  }

  vlan.ajouter("name <nom:mot>", (c, a) => { c.app.vlans.get(c.ctx.vlan).nom = a.nom; });
  vlan.ajouter("exit", (c) => { c.mode = "config"; c.ctx = {}; });
  vlan.ajouter("end", finConfig);

  dhcp.ajouter("network <reseau:ip> <masque:masque>", (c, a) => { c.ctx.pool.reseau = a.reseau.reseau(a.masque); c.ctx.pool.masque = a.masque; });
  dhcp.ajouter("default-router <ip:ip>", (c, a) => { c.ctx.pool.routeur = a.ip; });
  dhcp.ajouter("dns-server <ip:ip>", (c, a) => { c.ctx.pool.dns = a.ip; });
  dhcp.ajouter("domain-name <nom:mot>", (c, a) => { c.ctx.pool.domaine = a.nom; });
  dhcp.ajouter("exit", (c) => { c.mode = "config"; c.ctx = {}; });
  dhcp.ajouter("end", finConfig);

  const lignes = (c) => { c.app.extra.lignes = c.app.extra.lignes || {}; return (c.app.extra.lignes[c.ctx.ligne] = c.app.extra.lignes[c.ctx.ligne] || {}); };
  ligne.ajouter("password <mdp:mot>", (c, a) => { lignes(c).password = a.mdp; });
  ligne.ajouter("login", (c) => { lignes(c).login = true; });
  ligne.ajouter("no login", (c) => { lignes(c).login = false; });
  ligne.ajouter("login local", (c) => { lignes(c).login = "local"; });
  ligne.ajouter("logging synchronous", () => {});
  ligne.ajouter("exec-timeout <m:nombre> <s:nombre>", () => {});
  ligne.ajouter("transport input <t:mot>", (c, a) => { lignes(c).transport = a.t; });
  ligne.ajouter("exit", (c) => { c.mode = "config"; c.ctx = {}; });
  ligne.ajouter("end", finConfig);

  return { user, priv, config, if: iface, subif: iface, range: iface, vlan, dhcp, line: ligne };
}

/* ═══════════════ Les actions ═══════════════════════════════════════ */
/* « reload » : l'équipement oublie sa running-config et rejoue sa
   startup-config, ligne à ligne, à travers ce même analyseur. Sans
   startup-config, il redémarre vierge — l'erreur classique du TP. */
function recharger(c, o) {
  const app = c.app;
  o.lignes(["", "System Bootstrap, Version 15.1(4)M4, RELEASE SOFTWARE (fc1)", "Initializing memory...", ""]);
  app.reinitialiser();
  const lignes = (app.startup || []).filter((l) => l && !/^(!|end$|version |Building|Current configuration|no service timestamps)/.test(l));
  const rejoue = new IOSConsole(app);
  const muet = { ligne() {}, lignes() {}, ajouter() {}, occupe() {}, fin() {}, effacer() {} };
  ["enable", "configure terminal"].concat(lignes, ["end"]).forEach((l) => {
    // les lignes indentées d'une running-config appartiennent au bloc d'au-dessus
    rejoue.executer(l.trim(), muet);
    // au démarrage, une interface sans « shutdown » dans son bloc s'allume
    if (/^interface /.test(l) && rejoue.ctx.ifaces) rejoue.ctx.ifaces.forEach((p) => { p.adminUp = true; });
  });
  app.reseau.evaluerLiens();
  app.reseau.emit("topologie");
  c.mode = "user"; c.ctx = {};
  o.lignes([app.startup ? "" : "%% No startup-config, starting with factory defaults", "", "Press RETURN to get started!"]);
}

function effacerVlans(c) {
  c.demander("Delete filename [vlan.dat]?", false, (rep, o2) => {
    c.demander("Delete flash:/vlan.dat? [confirm]", false, (rep2, o3) => {
      if (/^n/i.test(rep2.trim())) return;
      c.app.vlans = new Map([[1, { nom: "default" }]]);
      c.app.reseau.evaluerLiens();
    });
  });
}

function finConfig(c, a, o) { c.mode = "priv"; c.ctx = {}; o.ligne("%SYS-5-CONFIG_I: Configured from console by console"); }

function surInterfaces(c, fn) {
  (c.ctx.ifaces || []).forEach(fn);
  c.app.reseau.evaluerLiens();
}
function surPortsL2(c, o, fn) {
  const ports = (c.ctx.ifaces || []).filter((p) => p.type === "fa" || p.type === "gi");
  if (!ports.length) { c.refuser(o, 0); return; }
  ports.forEach(fn);
  c.app.reseau.evaluerLiens();
}

function entrerInterface(c, a, o) {
  const app = c.app;
  let p;
  if (app.type === "switch" && /^Vlan\d+$/.test(a.if)) {
    const n = +a.if.slice(4);
    if (n < 1 || n > 4094) return o.ligne("% Invalid input detected at '^' marker.");
    p = app.creerSvi(n);
  } else if (/^Loopback\d+$/.test(a.if)) {
    p = app.type === "routeur" ? app.creerBoucle(a.if) : null;
  } else if (/\./.test(a.if)) {
    p = app.type === "switch" ? null : app.creerSous(a.if);
  } else {
    p = app.port(a.if);
    if (p && (p.type === "console" || p.type === "rs232")) p = null;
  }
  if (!p) return o.ligne("%Invalid interface type and number");
  c.mode = p.parent ? "subif" : "if";
  c.ctx = { ifaces: [p] };
  if (p.parent) app.reseau.evaluerLiens();
}

/* « interface range fa0/1 - 10 , fa0/20 » */
function entrerPlage(c, a, o) {
  const app = c.app, res = [];
  for (const morceau of a.plage.split(",")) {
    const m = /^\s*([a-zA-Z]+)\s*(\d+)\/(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(morceau);
    if (!m) return o.ligne("% Invalid input detected at '^' marker.");
    const debut = +m[3], fin = m[4] ? +m[4] : debut;
    for (let i = debut; i <= fin; i++) {
      const p = app.port(normaliserInterface(m[1] + m[2] + "/" + i));
      if (!p) return o.ligne("% Invalid input detected at '^' marker.");
      res.push(p);
    }
  }
  c.mode = "range";
  c.ctx = { ifaces: res };
}

function adresseIp(c, a, o) {
  const app = c.app;
  const ports = c.ctx.ifaces || [];
  if (app.type === "switch" && ports.some((p) => p.type !== "vlan")) return c.refuser(o, 0);
  if (ports.length !== 1) return c.refuser(o, 0);
  const p = ports[0];
  const reseau = a.ip.reseau(a.masque);
  if (a.masque.prefixe() < 31 && (a.ip.egale(reseau) || a.ip.egale(a.ip.diffusion(a.masque)))) {
    return o.ligne("Bad mask /" + a.masque.prefixe() + " for address " + a.ip);
  }
  const autre = app.tousLesPorts().find((x) => x !== p && x.ip && x.masque
    && (a.ip.dansReseau(x.ip, x.masque) || x.ip.dansReseau(a.ip, a.masque)));
  if (autre) return o.ligne("% " + reseau + " overlaps with " + autre.nom);
  if (p.parent && p.dot1q === null) {
    return o.ligne("% Configuring IP routing on a LAN subinterface is only allowed if that subinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q, or ISL vLAN.");
  }
  p.ip = a.ip; p.masque = a.masque;
  app.reseau.evaluerLiens();
}

function dot1q(c, a, o, natif) {
  const p = (c.ctx.ifaces || [])[0];
  if (!p || !p.parent) return c.refuser(o, 0);
  const deja = c.app.sous.find((s) => s !== p && s.parent === p.parent && s.dot1q === a.id);
  if (deja) return o.ligne("%Configuration of multiple subinterfaces of the same main interface with the same VID (" + a.id + ") is not permitted. This VID is already configured on " + deja.nom + ".");
  p.dot1q = a.id; p.dot1qNatif = natif;
  c.app.reseau.evaluerLiens();
}

function routeStatique(c, a, o) {
  if (!a.reseau.egale(a.reseau.reseau(a.masque))) return o.ligne("%Inconsistent address and mask");
  const r = { reseau: a.reseau, masque: a.masque, via: a.via || null, sortie: a.sortie || null, distance: a.distance || 1 };
  if (a.sortie && !c.app.port(a.sortie)) return o.ligne("%Invalid interface type and number");
  c.app.statiques = c.app.statiques.filter((x) => !(x.reseau.egale(r.reseau) && x.masque.egale(r.masque)
    && ((x.via && r.via && x.via.egale(r.via)) || (x.sortie && x.sortie === r.sortie))));
  c.app.statiques.push(r);
  c.app.reseau.emit("etat");
}
function retirerRoute(c, a, o) {
  const avant = c.app.statiques.length;
  c.app.statiques = c.app.statiques.filter((x) => !(x.reseau.egale(a.reseau) && x.masque.egale(a.masque)
    && (!a.via || (x.via && x.via.egale(a.via))) && (!a.sortie || x.sortie === a.sortie)));
  if (c.app.statiques.length === avant) o.ligne("%No matching route to delete");
  c.app.reseau.emit("etat");
}

/* ── ping et traceroute, à la manière d'IOS ── */
function pingIOS(c, a, o) {
  const ip = IPv4Address.parse(a.cible);
  if (!ip) return o.ligne("% Unrecognized host or address, or protocol not running.");
  o.lignes(["Type escape sequence to abort.", "Sending 5, 100-byte ICMP Echos to " + ip + ", timeout is 2 seconds:", ""]);
  o.occupe();
  c.app.ip.ping(ip, { n: 5, delai: 2000, taille: 100, sequentiel: true, sur: (e) => {
    if (e.type === "reponse") o.ajouter("!");
    else if (e.type === "injoignable") o.ajouter("U");
    else if (e.type === "delai" || e.type === "expire" || e.type === "echec") o.ajouter(".");
    else if (e.type === "fin") {
      const s = e.stats, t = s.temps;
      const pct = Math.round(s.recus / s.envoyes * 100);
      o.ligne("Success rate is " + pct + " percent (" + s.recus + "/" + s.envoyes + ")"
        + (t.length ? ", round-trip min/avg/max = " + Math.min(...t) + "/" + Math.round(t.reduce((x, y) => x + y, 0) / t.length) + "/" + Math.max(...t) + " ms" : ""));
      o.fin();
    }
  } });
  c.app.reseau.executer();
}

function tracerouteIOS(c, a, o) {
  const ip = IPv4Address.parse(a.cible);
  if (!ip) return o.ligne("% Unrecognized host or address, or protocol not running.");
  o.lignes(["Type escape sequence to abort.", "Tracing the route to " + ip, ""]);
  o.occupe();
  c.app.ip.traceroute(ip, { udp: true, max: 30, delai: 3000, sur: (e) => {
    if (e.type === "saut") {
      const de = e.sondes.find((x) => x);
      o.ligne(String(e.ttl).padStart(3) + " " + (de ? de.de + " " : "") + e.sondes.map((x) => (x ? x.temps + " msec" : "*")).join(" "));
    } else if (e.type === "echec") { o.ligne("% " + e.raison); o.fin(); }
    else if (e.type === "fin") o.fin();
  } });
  c.app.reseau.executer();
}

/* ═══════════════ La console ════════════════════════════════════════ */
export class IOSConsole {
  constructor(app) {
    this.app = app;
    this.mode = "user";
    this.ctx = {};
    this.historique = [];
    this.attente = null;          // une question posée (mot de passe, nom de fichier)
    this.masque = false;          // la saisie en cours ne s'affiche pas
  }
  get arbres() { return arbresPour(this.app.type); }

  invite() {
    if (this.attente) return this.attente.invite;
    const h = this.app.nom;
    return h + ({ user: ">", priv: "#", config: "(config)#", if: "(config-if)#", subif: "(config-subif)#",
      range: "(config-if-range)#", vlan: "(config-vlan)#", dhcp: "(dhcp-config)#", line: "(config-line)#" }[this.mode] || "#");
  }

  demander(invite, masque, suite) {
    this.attente = { invite, suite };
    this.masque = masque;
  }

  /* Exécuter une ligne. « o » reçoit la sortie : ligne(), lignes(),
     ajouter() (sur la même ligne, pour les « !!!!! »), occupe(), fin(). */
  executer(ligne, o) {
    if (this.attente) {
      const a = this.attente;
      this.attente = null; this.masque = false;
      a.suite(ligne, o);
      return;
    }
    if (!ligne.trim()) return;
    this.historique.push(ligne);
    if (this.historique.length > 50) this.historique.shift();
    if (/\?\s*$/.test(ligne)) { o.lignes(this.aide(ligne.replace(/\?\s*$/, ""))); return; }
    let t = jetons(ligne);
    let arbre = this.arbres[this.mode];
    let decalage = 0;
    if (this.mode !== "user" && this.mode !== "priv" && /^do$/i.test(t[0])) {
      arbre = this.arbres.priv; decalage = 1; t = t.slice(1);
    }
    let r = arbre.analyser(t);
    // IOS : une commande globale tapée dans un sous-mode y remonte d'elle-même
    if (r.erreur && SOUS_MODES.has(this.mode) && !decalage) {
      const r2 = this.arbres.config.analyser(t);
      if (!r2.erreur) { this.mode = "config"; this.ctx = {}; r = r2; }
    }
    if (r.erreur) return this.erreur(r, t, ligne, decalage, o);
    this.derniere = { ligne, decalage };
    r.run(this, r.args, o, r.mots);
  }

  /* Une commande bien formée mais refusée par l'équipement (« ip address »
     sur un port de niveau 2) : même « ^ » qu'une faute de frappe, sous le
     premier mot — c'est ce qu'affiche un 2960. */
  refuser(o, pos = 0) {
    const d = this.derniere || { ligne: "", decalage: 0 };
    this.erreur({ erreur: "invalide", pos }, jetons(d.ligne), d.ligne, d.decalage, o, true);
  }

  erreur(r, t, ligne, decalage, o, force) {
    if (r.erreur === "ambigu") return o.ligne("% Ambiguous command:  \"" + ligne.trim() + "\"");
    if (r.erreur === "incomplet") return o.ligne("% Incomplete command.");
    const exec = this.mode === "user" || this.mode === "priv";
    if (exec && r.pos === 0 && t.length === 1 && !force) {
      // le mot inconnu est pris pour un nom d'hôte à joindre par telnet…
      if (!(this.app.extra && this.app.extra.noDomainLookup)) o.ligne("Translating \"" + t[0] + "\"...domain server (255.255.255.255)");
      return o.lignes(["% Unknown command or computer name, or unable to find computer address"]);
    }
    // la colonne du jeton fautif, pour poser le « ^ » dessous
    const debuts = [...ligne.matchAll(/\S+/g)].map((m) => m.index);
    const cible = r.pos + decalage;
    const idx = cible < debuts.length ? debuts[cible] : ligne.length;
    o.ligne(" ".repeat(this.invite().length + idx) + "^");
    o.ligne("% Invalid input detected at '^' marker.");
  }

  /* Le « ? » : après une espace, ce qui peut suivre ; collé à un mot,
     les mots qui commencent ainsi. */
  aide(ligne) {
    let arbre = this.arbres[this.mode];
    let t = jetons(ligne);
    if (this.mode !== "user" && this.mode !== "priv" && /^do$/i.test(t[0])) { arbre = this.arbres.priv; t = t.slice(1); }
    const fini = /\s$/.test(ligne) || !ligne.trim();
    const complets = fini ? t : t.slice(0, -1);
    const n = arbre.atteindre(complets);
    if (!n) return ["% Unrecognized command"];
    if (!fini) {
      const mots = arbre.aide(n, t[t.length - 1]).map((x) => x[0]);
      return mots.length ? [mots.join("  ")] : ["% Unrecognized command"];
    }
    const lignes = arbre.aide(n);
    if (!lignes.length) return ["% Unrecognized command"];
    const larg = Math.max(...lignes.map((l) => l[0].length)) + 2;
    return lignes.map(([m, d]) => "  " + m.padEnd(larg) + d);
  }

  /* La touche Tab : compléter le dernier mot s'il n'y a qu'une suite. */
  completer(ligne) {
    if (/\s$/.test(ligne) || !ligne.trim()) return ligne;
    let arbre = this.arbres[this.mode];
    let t = jetons(ligne);
    let prefixe = "";
    if (this.mode !== "user" && this.mode !== "priv" && /^do$/i.test(t[0])) { arbre = this.arbres.priv; prefixe = t[0] + " "; t = t.slice(1); }
    const n = arbre.atteindre(t.slice(0, -1));
    let c = n ? arbre.correspondances(n, t[t.length - 1]) : [];
    if (!c.length && SOUS_MODES.has(this.mode) && !prefixe) {
      const n2 = this.arbres.config.atteindre(t.slice(0, -1));
      c = n2 ? this.arbres.config.correspondances(n2, t[t.length - 1]) : [];
    }
    if (c.length !== 1) return ligne;
    return prefixe + t.slice(0, -1).concat(c[0]).join(" ") + " ";
  }
}

export { ecrireListeVlan };
