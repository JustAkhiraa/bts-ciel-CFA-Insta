/* Les deux façons dont un nœud touche les autres.

   ONGLETS — BroadcastChannel : tous les onglets du même navigateur, sur le
   même appareil, partagent un canal. C'est un lien de DIFFUSION : ce qu'un
   onglet y poste, tous les autres le reçoivent. Utile pour essayer le
   salon seul, et pour qu'un onglet relié en WebRTC serve de pont aux
   autres onglets.

   WEBRTC — un canal de données entre deux appareils du même Wi-Fi, chiffré
   par DTLS de bout en bout du lien, sans serveur au milieu. Présentation
   par QR code ou par code à copier (voir signal.js). */

import { compacter, deplier } from "./signal.js";

export class TransportOnglets {
  constructor(noeud, canal = "ciel-salon-v1") {
    this.actif = typeof BroadcastChannel !== "undefined";
    if (!this.actif) return;
    this.bc = new BroadcastChannel(canal);
    this.lien = {
      id: "onglets", type: "onglet", diffusion: true, nom: "les autres onglets",
      envoyer: (s) => this.bc.postMessage(s), fermer: () => this.bc.close(),
    };
    this.bc.onmessage = (e) => this.lien.surMessage && this.lien.surMessage(e.data);
    noeud.ajouterLien(this.lien);
  }
}

let n = 0;
export class TransportWebRTC {
  constructor(noeud, { surChangement = () => {} } = {}) {
    this.noeud = noeud;
    this.surChangement = surChangement;
    this.connexions = new Set();
  }
  get disponible() { return typeof RTCPeerConnection !== "undefined"; }

  creer() {
    // aucun serveur STUN : sans Internet, seules les adresses locales comptent
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.connexions.add(pc);
    return pc;
  }

  /* Attendre que le navigateur ait trouvé ses adresses (2,5 s au plus). */
  collecte(pc) {
    return new Promise((ok) => {
      if (pc.iceGatheringState === "complete") return ok();
      const fin = () => { clearTimeout(t); pc.removeEventListener("icegatheringstatechange", verif); ok(); };
      const verif = () => { if (pc.iceGatheringState === "complete") fin(); };
      const t = setTimeout(fin, 2500);
      pc.addEventListener("icegatheringstatechange", verif);
    });
  }

  /* Côté qui invite : une offre, puis la réponse de l'autre. */
  async inviter() {
    const pc = this.creer();
    const dc = pc.createDataChannel("salon", { ordered: true });
    const ouvert = this.brancher(pc, dc);
    await pc.setLocalDescription(await pc.createOffer());
    await this.collecte(pc);
    return {
      code: compacter(pc.localDescription),
      accepter: async (codeReponse) => {
        const d = deplier(codeReponse);
        if (d.type !== "answer") throw new Error("c'est une invitation, pas une réponse : scannez le QR de l'autre appareil APRÈS qu'il a lu le vôtre");
        await pc.setRemoteDescription(d);
        return ouvert;
      },
      annuler: () => this.fermer(pc),
    };
  }

  /* Côté qui rejoint : l'offre lue, une réponse à montrer. */
  async rejoindre(codeOffre) {
    const d = deplier(codeOffre);
    if (d.type !== "offer") throw new Error("c'est une réponse, pas une invitation");
    const pc = this.creer();
    let resoudre;
    const ouvert = new Promise((r) => { resoudre = r; });
    pc.ondatachannel = (e) => this.brancher(pc, e.channel).then(resoudre);
    await pc.setRemoteDescription(d);
    await pc.setLocalDescription(await pc.createAnswer());
    await this.collecte(pc);
    return { code: compacter(pc.localDescription), ouvert, annuler: () => this.fermer(pc) };
  }

  brancher(pc, dc) {
    const lien = { id: "rtc" + ++n, type: "webrtc", nom: "appareil relié", envoyer: (s) => dc.send(s), fermer: () => this.fermer(pc) };
    let ferme = false;
    const fermer = () => {
      if (ferme) return;
      ferme = true;
      lien.surFermeture && lien.surFermeture();
      this.connexions.delete(pc);
      this.surChangement();
    };
    dc.onmessage = (e) => lien.surMessage && lien.surMessage(e.data);
    dc.onclose = fermer;
    pc.addEventListener("connectionstatechange", () => { if (["failed", "closed"].includes(pc.connectionState)) fermer(); });
    return new Promise((ok) => {
      dc.onopen = () => { this.noeud.ajouterLien(lien); this.surChangement(); ok(lien); };
    });
  }

  fermer(pc) { try { pc.close(); } catch (e) { /* déjà fermée */ } this.connexions.delete(pc); this.surChangement(); }
  toutFermer() { [...this.connexions].forEach((pc) => this.fermer(pc)); }
}
