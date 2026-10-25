/* La présentation de deux appareils, sans serveur.

   WebRTC relie deux navigateurs directement, mais chacun doit d'abord
   connaître l'autre : son identifiant ICE, son mot de passe ICE,
   l'empreinte de son certificat DTLS (qui chiffrera le lien), et les
   adresses où le joindre. Un navigateur écrit tout ça dans une « offre »
   SDP de près d'un kilo-octet. On n'en garde que l'essentiel :

     S1~o~<ufrag>~<pwd>~<empreinte DTLS en base64url>~<setup>~<adresse:port>,…

   soit environ 150 caractères — un QR code de version 7 à 9, qu'une
   webcam lit sans peine. L'autre côté reconstruit une SDP valide avec.

   Sans Internet il n'y a pas de serveur STUN : seules les adresses
   LOCALES (« host ») servent, ce qui suffit sur le Wi-Fi d'une salle. */

import { versB64, depuisB64 } from "./crypto.js";

const SEP = "~";

export function compacter(desc) {
  const sdp = desc.sdp;
  const champ = (re) => { const m = re.exec(sdp); return m ? m[1].trim() : null; };
  const ufrag = champ(/a=ice-ufrag:(.+)/), pwd = champ(/a=ice-pwd:(.+)/);
  const fp = champ(/a=fingerprint:sha-256 (.+)/i), setup = champ(/a=setup:(.+)/);
  if (!ufrag || !pwd || !fp || !setup) throw new Error("description WebRTC incomplète");
  const empreinte = versB64(new Uint8Array(fp.split(":").map((h) => parseInt(h, 16))));
  const cands = [];
  for (const m of sdp.matchAll(/a=candidate:\S+ \d+ (udp|UDP) \d+ (\S+) (\d+) typ (host|srflx)/g)) {
    const adr = m[2] + ":" + m[3];
    if (!cands.includes(adr)) cands.push(adr);
  }
  if (!cands.length) throw new Error("aucune adresse réseau trouvée : l'appareil est-il connecté au Wi-Fi ?");
  return ["S1", desc.type === "offer" ? "o" : "r", ufrag, pwd, empreinte, setup, cands.slice(0, 4).join(",")].join(SEP);
}

/* Le code peut arriver nu, ou dans une adresse (le QR d'invitation est un
   lien vers cette page : l'appareil photo du téléphone l'ouvre tout seul). */
export function extraireCode(texte) {
  const s = String(texte || "").trim();
  const m = /(S1~[or]~[^\s#&]+)/.exec(decodeURIComponent(s));
  return m ? m[1] : null;
}

export function deplier(code) {
  const p = String(code).split(SEP);
  if (p.length !== 7 || p[0] !== "S1" || !/^[or]$/.test(p[1])) throw new Error("ce n'est pas un code du salon");
  const [, sens, ufrag, pwd, emp, setup, adresses] = p;
  const fp = [...depuisB64(emp)].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":");
  if (fp.length !== 95) throw new Error("empreinte DTLS invalide");
  const lignes = [
    "v=0", "o=- " + Date.now() + " 2 IN IP4 127.0.0.1", "s=-", "t=0 0",
    "a=group:BUNDLE 0", "a=msid-semantic: WMS",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0",
  ];
  adresses.split(",").forEach((a, i) => {
    const k = a.lastIndexOf(":");
    const hote = a.slice(0, k), port = a.slice(k + 1);
    lignes.push("a=candidate:" + (i + 1) + " 1 udp " + (2122260223 - i) + " " + hote + " " + port + " typ host generation 0");
  });
  lignes.push("a=end-of-candidates", "a=ice-ufrag:" + ufrag, "a=ice-pwd:" + pwd, "a=ice-options:trickle",
    "a=fingerprint:sha-256 " + fp, "a=setup:" + setup, "a=mid:0", "a=sctp-port:5000", "a=max-message-size:262144");
  return { type: sens === "o" ? "offer" : "answer", sdp: lignes.join("\r\n") + "\r\n" };
}
