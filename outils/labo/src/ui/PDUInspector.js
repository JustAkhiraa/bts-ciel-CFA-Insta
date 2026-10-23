/* L'inspecteur de PDU : une trame, telle qu'elle était sur UN câble, à UN
   instant, ouverte couche par couche — puis, en clair, pourquoi elle est
   partie et ce que l'équipement d'arrivée en a fait.

   Ce qu'on lit ici ne vient que du journal du réseau : ce sont les vraies
   valeurs de la trame copiée au moment du saut, et les vraies décisions
   notées par les équipements. */

import { ETHERTYPE } from "../core/Frame.js";
import { PROTO, ICMP, DhcpMessage, DnsMessage } from "../core/Packet.js";
import { COULEURS_PROTO } from "../canvas/Renderer.js";

const ech = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ligne = (k, v) => "<dt>" + k + "</dt><dd>" + ech(v) + "</dd>";
const couche = (titre, sous, corps) => '<section class="lb-pdu-couche"><h4>' + titre + "<small>" + sous + "</small></h4>" + corps + "</section>";

const TYPES_CABLE = { droit: "câble droit", croise: "câble croisé", fibre: "fibre", console: "console" };

export function rendrePDU(s) {
  const f = s.trame;
  let h = '<div class="lb-insp-tete"><span class="lb-proto" style="background:' + (COULEURS_PROTO[s.protocole] || "#999") + '">' + s.protocole + "</span>"
    + '<div class="lb-insp-nom"><b>Saut n° ' + s.n + "</b><small>" + ech(s.de.app.nom) + " " + s.de.port.court + " → "
    + ech(s.vers.app.nom) + " " + s.vers.port.court + " · t = " + s.t + " ms</small></div>"
    + '<button type="button" class="lb-b lb-icone" data-fermer-pdu title="Fermer" aria-label="Fermer l\'inspecteur de PDU">×</button></div>'
    + '<div class="lb-insp-corps">';

  h += '<p class="lb-texte"><b>' + ech(f.resume()) + "</b> — " + (s.livre
    ? '<span class="lb-issue ' + s.issue + '">' + ({ recue: "reçue et traitée", jetee: "jetée", ignoree: "ignorée", filtree: "filtrée" }[s.issue] || s.issue) + "</span>"
    : '<span class="lb-issue vol">encore sur le câble</span>') + "</p>";

  // Couche 1
  h += couche("Couche 1 — Physique", "le câble", "<dl>"
    + ligne("Sortie", s.de.app.nom + " · " + s.de.port.nom)
    + ligne("Entrée", s.vers.app.nom + " · " + s.vers.port.nom)
    + ligne("Support", TYPES_CABLE[s.cable.type] || s.cable.type) + "</dl>");

  // Couche 2
  h += couche("Couche 2 — Ethernet II", f.vlan !== null ? "trame étiquetée 802.1Q" : "trame non étiquetée", "<dl>"
    + ligne("MAC destination", f.dst.cisco() + (f.dst.estDiffusion() ? "  (diffusion)" : ""))
    + ligne("MAC source", f.src.cisco())
    + ligne("Étiquette 802.1Q", f.vlan !== null ? "VLAN " + f.vlan + " (TPID 0x8100)" : "aucune")
    + ligne("EtherType", "0x" + f.etherType.toString(16).padStart(4, "0").toUpperCase() + (f.etherType === ETHERTYPE.ARP ? " (ARP)" : " (IPv4)"))
    + "</dl>");

  if (f.etherType === ETHERTYPE.ARP) {
    const a = f.payload;
    h += couche("ARP", a.op === 1 ? "requête (op 1)" : "réponse (op 2)", "<dl>"
      + ligne("Opération", a.op === 1 ? "1 — requête : « qui a " + a.targetIp + " ? »" : "2 — réponse")
      + ligne("MAC émetteur", a.senderMac.cisco()) + ligne("IP émetteur", a.senderIp)
      + ligne("MAC cible", a.targetMac.cisco() + (a.op === 1 ? "  (inconnue : c'est la question)" : ""))
      + ligne("IP cible", a.targetIp) + "</dl>");
  } else {
    const p = f.payload;
    h += couche("Couche 3 — IPv4", "paquet n° " + p.id, "<dl>"
      + ligne("IP source", p.src) + ligne("IP destination", p.dst + (p.dst.estDiffusionLimitee() ? "  (diffusion)" : ""))
      + ligne("TTL", p.ttl) + ligne("Protocole", p.protocol + " — " + ({ 1: "ICMP", 6: "TCP", 17: "UDP" }[p.protocol] || "?"))
      + "</dl>");
    const q = p.payload;
    if (p.protocol === PROTO.ICMP) {
      let corps = ligne("Type", q.type + " — " + q.nom()) + ligne("Code", q.code);
      if (q.type === ICMP.ECHO_REQUEST || q.type === ICMP.ECHO_REPLY) corps += ligne("Identifiant", q.id) + ligne("Séquence", q.seq);
      if (q.origine) corps += ligne("Paquet en cause", q.origine.src + " → " + q.origine.dst);
      h += couche("ICMP", "message de contrôle", "<dl>" + corps + "</dl>");
    } else if (p.protocol === PROTO.UDP) {
      h += couche("Couche 4 — UDP", "datagramme", "<dl>" + ligne("Port source", q.srcPort) + ligne("Port destination", q.dstPort) + "</dl>");
      const d = q.data;
      if (d instanceof DhcpMessage) {
        h += couche("DHCP", d.op, "<dl>" + ligne("Message", d.op) + ligne("Transaction (xid)", "0x" + d.xid.toString(16))
          + ligne("MAC du client", d.chaddr.cisco()) + (d.yiaddr ? ligne("Adresse proposée", d.yiaddr) : "")
          + (d.giaddr && !d.giaddr.estZero() ? ligne("Relais (giaddr)", d.giaddr) : "")
          + (d.options.requestedIp ? ligne("Adresse demandée", d.options.requestedIp) : "")
          + (d.options.mask ? ligne("Masque", d.options.mask) : "") + (d.options.router ? ligne("Passerelle", d.options.router) : "")
          + (d.options.dns ? ligne("DNS", d.options.dns) : "") + (d.options.serverId ? ligne("Serveur", d.options.serverId) : "") + "</dl>");
      } else if (d instanceof DnsMessage) {
        h += couche("DNS", d.reponses ? "réponse" : "question", "<dl>" + ligne("Nom", d.question)
          + (d.reponses ? ligne("Réponse", d.reponses.length ? d.reponses.map((r) => r.type + " " + r.ip).join(", ") : "NXDOMAIN (nom inconnu)") : "") + "</dl>");
      }
    } else if (p.protocol === PROTO.TCP) {
      h += couche("Couche 4 — TCP", "segment", "<dl>" + ligne("Port source", q.srcPort) + ligne("Port destination", q.dstPort)
        + ligne("Drapeaux", q.flags) + ligne("Séquence", q.seq) + ligne("Acquittement", q.ack) + "</dl>");
      if (q.data) h += couche("Couche 7 — HTTP", "données", '<dl style="grid-template-columns:1fr"><dd style="white-space:pre-wrap">' + ech(q.data) + "</dd></dl>");
    }
  }

  const notes = (titre, L) => (L.length ? couche(titre, "", '<ol class="lb-pdu-notes">' + L.map((x) => "<li>" + ech(x) + "</li>").join("") + "</ol>") : "");
  h += notes("Pourquoi " + ech(s.de.app.nom) + " l'a envoyée", s.emission);
  h += s.livre ? notes("Ce qu'en fait " + ech(s.vers.app.nom), s.reception)
    : '<p class="lb-vide">La trame n\'est pas encore arrivée : avancez d\'un pas pour voir ce qu\'en fait ' + ech(s.vers.app.nom) + ".</p>";
  return h + "</div>";
}
