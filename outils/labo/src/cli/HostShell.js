/* L'invite « C:\> » d'un PC, comme celle de Packet Tracer.

   Les sorties suivent Windows (ipconfig, ping, tracert, arp -a) : c'est ce
   qu'on voit en TP et ce qu'on recopie. Les habitudes Linux sont acceptées
   aussi (ping -c, traceroute, ifconfig, ip addr), parce qu'un élève de CIEL
   passe d'un système à l'autre dans la même journée. */

import { IPv4Address } from "../core/IPv4Address.js";

const AIDE = [
  "Available Commands",
  "?          Display the list of available commands",
  "arp        Display the arp table",
  "cls        Clear the screen",
  "curl       Fetch a web page (curl http://name)",
  "dhcp       Request an address from a DHCP server",
  "ipconfig   Display network configuration",
  "nslookup   DNS lookup",
  "ping       Send echo messages",
  "tracert    Trace route to destination",
];

export class HostShell {
  constructor(app) {
    this.app = app;
    this.historique = [];
    this.attente = null;
    this.masque = false;
  }
  invite() { return "C:\\>"; }

  executer(ligne, o) {
    const brut = ligne.trim();
    if (!brut) return;
    this.historique.push(brut);
    const [cmd, ...args] = brut.split(/\s+/);
    const c = cmd.toLowerCase();
    const app = this.app;
    if (c === "?" || c === "help") return o.lignes(AIDE);
    if (c === "cls" || c === "clear") return o.effacer && o.effacer();
    if (c === "hostname") return o.ligne(app.nom);
    if (c === "ipconfig") return this.ipconfig(args, o);
    if (c === "ifconfig" || (c === "ip" && /^a/.test(args[0] || ""))) return this.ifconfig(o);
    if (c === "arp") return this.arp(args, o);
    if (c === "ping") return this.ping(args, o);
    if (c === "tracert" || c === "traceroute") return this.tracert(args, o);
    if (c === "nslookup") return this.nslookup(args, o);
    if (c === "curl" || c === "http" || c === "wget") return this.curl(args, o);
    if (c === "dhcp") return this.renouveler(o);
    o.ligne("Invalid Command.");
  }

  ipconfig(args, o) {
    const app = this.app, p = app.carte;
    const opt = (args[0] || "").toLowerCase();
    if (opt === "/release") {
      app.libererDhcp();
      app.reseau.executer();
      o.lignes(["", "   IP Address......................: 0.0.0.0", "   Subnet Mask.....................: 0.0.0.0",
        "   Default Gateway.................: 0.0.0.0", "   DNS Server......................: 0.0.0.0", ""]);
      return;
    }
    if (opt === "/renew") return this.renouveler(o, true);
    const L = ["", "FastEthernet0 Connection:(default port)", ""];
    if (opt === "/all") {
      L.push("   Connection-specific DNS Suffix..: ", "   Physical Address................: " + p.mac.windows(),
        "   DHCP Enabled....................: " + (app.config.dhcp ? "Yes" : "No"));
    } else {
      L.push("   Connection-specific DNS Suffix..: ");
    }
    L.push("   IPv4 Address....................: " + (p.ip || "0.0.0.0"),
      "   Subnet Mask.....................: " + (p.masque || "0.0.0.0"),
      "   Default Gateway.................: " + (app.config.passerelle || "0.0.0.0"));
    if (opt === "/all") L.push("   DNS Servers.....................: " + (app.config.dns || "0.0.0.0"));
    if (!p.cable) L.splice(2, 0, "   Media State.....................: Media disconnected");
    L.push("");
    o.lignes(L);
  }

  ifconfig(o) {
    const p = this.app.carte;
    o.lignes(["eth0: flags=" + (p.estUp() ? "4163<UP,BROADCAST,RUNNING,MULTICAST>" : "4099<UP,BROADCAST,MULTICAST>") + "  mtu 1500",
      "        inet " + (p.ip || "0.0.0.0") + "  netmask " + (p.masque || "0.0.0.0")
        + (p.ip ? "  broadcast " + p.ip.diffusion(p.masque) : ""),
      "        ether " + p.mac.linux() + "  txqueuelen 1000  (Ethernet)", ""]);
  }

  arp(args, o) {
    const ip = this.app.ip;
    if ((args[0] || "") === "-d") { ip.viderArp(); this.app.reseau.emit("etat"); return; }
    if (!["-a", "-g", ""].includes(args[0] || "")) return o.ligne("Invalid Command.");
    if (!ip.arp.size) return o.ligne("No ARP Entries Found");
    const L = ["  Internet Address      Physical Address      Type"];
    for (const [k, e] of ip.arp) L.push("  " + k.padEnd(22) + e.mac.cisco().padEnd(22) + e.type);
    o.lignes(L);
  }

  /* ping [-n N | -c N] [-t] cible */
  ping(args, o) {
    let n = 4, cible = null;
    for (let i = 0; i < args.length; i++) {
      if ((args[i] === "-n" || args[i] === "-c") && args[i + 1]) { n = Math.max(1, Math.min(100, parseInt(args[++i], 10) || 4)); }
      else if (args[i] === "-t") n = 100;
      else cible = args[i];
    }
    if (!cible) return o.lignes(["", "Usage: ping [-n count] target_name"]);
    const app = this.app;
    o.occupe();
    app.resoudre(cible, (r) => {
      if (r.erreur) {
        o.lignes(["Ping request could not find host " + cible + ". Please check the name and try again."]);
        o.fin();
        return;
      }
      const ip = r.ip;
      o.lignes(["", "Pinging " + ip + " with 32 bytes of data:", ""]);
      app.ip.ping(ip, { n, sur: (e) => {
        if (e.type === "reponse") o.ligne("Reply from " + e.de + ": bytes=" + e.octets + " time" + (e.temps < 1 ? "<1ms" : "=" + e.temps + "ms") + " TTL=" + e.ttl);
        else if (e.type === "delai") o.ligne("Request timed out.");
        else if (e.type === "injoignable") o.ligne("Reply from " + e.de + ": Destination host unreachable.");
        else if (e.type === "expire") o.ligne("Reply from " + e.de + ": TTL expired in transit.");
        else if (e.type === "echec") o.ligne(/IP/.test(e.raison) ? "PING: transmit failed. General failure." : "Request timed out.");
        else if (e.type === "fin") {
          const s = e.stats, t = s.temps;
          o.lignes(["", "Ping statistics for " + ip + ":",
            "    Packets: Sent = " + s.envoyes + ", Received = " + s.recus + ", Lost = " + (s.envoyes - s.recus)
              + " (" + Math.round((s.envoyes - s.recus) / s.envoyes * 100) + "% loss),"]);
          if (t.length) {
            o.lignes(["Approximate round trip times in milli-seconds:",
              "    Minimum = " + Math.min(...t) + "ms, Maximum = " + Math.max(...t) + "ms, Average = "
                + Math.round(t.reduce((x, y) => x + y, 0) / t.length) + "ms"]);
          }
          o.fin();
        }
      } });
      app.reseau.executer();
    });
    app.reseau.executer();
  }

  tracert(args, o) {
    const cible = args.filter((a) => !a.startsWith("-"))[0];
    if (!cible) return o.ligne("Usage: tracert target_name");
    const app = this.app;
    o.occupe();
    app.resoudre(cible, (r) => {
      if (r.erreur) { o.ligne("Unable to resolve target system name " + cible + "."); o.fin(); return; }
      o.lignes(["", "Tracing route to " + r.ip + " over a maximum of 30 hops: ", ""]);
      app.ip.traceroute(r.ip, { sur: (e) => {
        if (e.type === "saut") {
          const de = e.sondes.find((x) => x);
          o.ligne(String(e.ttl).padStart(3) + "   " + e.sondes.map((x) => (x ? (x.temps < 1 ? "<1 ms" : x.temps + " ms") : "*").padEnd(9)).join(" ")
            + " " + (de ? de.de : "Request timed out."));
        } else if (e.type === "fin") { o.lignes(["", "Trace complete."]); o.fin(); }
        else if (e.type === "echec") { o.ligne("Unable to contact IP driver. General failure."); o.fin(); }
      } });
      app.reseau.executer();
    });
    app.reseau.executer();
  }

  nslookup(args, o) {
    const nom = args[0];
    const app = this.app;
    if (!nom) return o.ligne("Usage: nslookup name");
    o.occupe();
    app.resoudre(nom, (r) => {
      o.lignes(["Server: [" + (app.config.dns || "0.0.0.0") + "]", "Address:  " + (app.config.dns || "0.0.0.0"), ""]);
      if (r.erreur) o.ligne("*** UnKnown can't find " + nom + ": " + (r.erreur === "nom inconnu" ? "Non-existent domain" : "No response from server"));
      else o.lignes(["Non-authoritative answer:", "Name:   " + nom, "Address:  " + r.ip]);
      o.fin();
    });
    app.reseau.executer();
  }

  curl(args, o) {
    const url = args[0];
    if (!url) return o.ligne("Usage: curl http://server");
    const hote = url.replace(/^https?:\/\//, "").split("/")[0];
    o.occupe();
    this.app.http(hote, (r) => {
      if (r.erreur) o.ligne("curl: (7) Failed to connect to " + hote + ": " + r.erreur);
      else o.lignes(String(r.reponse).split("\n"));
      o.fin();
    });
    this.app.reseau.executer();
  }

  renouveler(o, renew) {
    const app = this.app;
    o.occupe();
    app.demanderDhcp((r) => {
      if (r.type === "ok") {
        if (renew) this.ipconfig([], o);
        else o.lignes(["DHCP request successful. IP " + r.ip]);
      } else o.lignes(["DHCP request failed. APIPA is being used : " + r.ip]);
      app.reseau.emit("topologie");
      o.fin();
    });
    app.reseau.executer();
  }

  aide() { return AIDE; }
  completer(ligne) {
    const mots = ["arp", "cls", "curl", "dhcp", "ipconfig", "nslookup", "ping", "tracert"];
    const m = mots.filter((x) => x.startsWith(ligne.trim().toLowerCase()));
    return m.length === 1 && !/\s/.test(ligne.trim()) ? m[0] + " " : ligne;
  }
}

export { IPv4Address };
