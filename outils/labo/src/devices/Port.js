/* Un port : une interface physique (Fa0/1, Gi0/0, Se0/0/0), une
   sous-interface de routeur (Gi0/0.10), une interface VLAN de commutateur
   (Vlan1), une interface de bouclage, ou un port console.

   Son état se CALCULE, il ne se stocke pas : un port est « up » s'il est
   allumé administrativement (no shutdown), câblé, avec un câble qui convient,
   et si le port d'en face l'est aussi. Le stocker, c'est risquer qu'il dise
   « up » alors qu'on vient de débrancher le câble. */

/* Les familles d'interfaces d'IOS, et leur abréviation. */
const FAMILLES = [
  ["FastEthernet", "Fa"],
  ["GigabitEthernet", "Gi"],
  ["Ethernet", "Eth"],
  ["Vlan", "Vlan"],
  ["Loopback", "Lo"],
  ["Serial", "Se"],
  ["Console", "Con"],
  ["RS232", "RS232"],
];

/* « fa0/1 », « f 0/1 », « g0/0.10 », « vlan 1 » → le nom complet, ou
   null. Comme IOS : n'importe quel début du nom de famille suffit, tant
   qu'il n'en désigne qu'une. */
export function normaliserInterface(s) {
  const m = /^\s*([a-zA-Z]+)\s*(\d+(?:\/\d+)*(?:\.\d+)?)\s*$/.exec(String(s || ""));
  if (!m) return null;
  const pref = m[1].toLowerCase();
  const candidates = FAMILLES.filter(([long]) => long.toLowerCase().startsWith(pref));
  if (candidates.length !== 1) {
    // « e » serait ambigu entre Ethernet et… rien d'autre ici ; mais « f » et
    // « g » doivent marcher : on prend l'exacte d'abord
    const exacte = FAMILLES.find(([long, c]) => long.toLowerCase() === pref || c.toLowerCase() === pref);
    if (!exacte) return null;
    return exacte[0] + m[2];
  }
  return candidates[0][0] + m[2];
}
export function nomCourt(nom) {
  for (const [long, court] of FAMILLES) if (nom.startsWith(long)) return court + nom.slice(long.length);
  return nom;
}

export class Port {
  constructor(appareil, nom, opts = {}) {
    this.appareil = appareil;
    this.nom = nom;
    this.type = opts.type || "fa";          // fa gi se console rs232 vlan sous loop
    this.mac = opts.mac || null;
    this.fibre = !!opts.fibre;              // accepte la fibre
    this.fibreSeule = !!opts.fibreSeule;
    this.cable = null;
    this.adminUp = opts.adminUp !== false;
    this.description = "";
    // commutation
    this.mode = "access";
    this.accessVlan = 1;
    this.native = 1;
    this.allowed = "all";                   // "all" ou Set de numéros
    // couche 3
    this.ip = null;
    this.masque = null;
    this.helper = null;                     // ip helper-address (relais DHCP)
    this.natRole = null;                    // ip nat inside | outside
    this.aclIn = null; this.aclOut = null;  // ip access-group N in | out
    // sous-interface
    this.parent = opts.parent || null;
    this.dot1q = null;
    this.dot1qNatif = false;
    this.activite = 0;                      // dernière trame vue (pour le clignotement)
    // liaison série : l'horloge (côté DCE) et le protocole de couche 2
    this.clockRate = null;
    this.encapsulation = "hdlc";
    // sécurité de port (commutateur)
    this.secu = null;
    this.errDisabled = false;
  }

  get court() { return nomCourt(this.nom); }
  get reseau() { return this.appareil.reseau; }
  estSous() { return !!this.parent; }
  estVirtuel() { return this.type === "vlan" || this.type === "sous" || this.type === "loop"; }

  enFace() {
    if (this.parent) return this.parent.enFace();
    return this.cable ? this.cable.autre(this) : null;
  }

  /* La couche physique seule : le premier mot de « up / up ». */
  physiqueUp() {
    if (this.type !== "se") return this.estUp();
    if (!this.adminUp || !this.appareil.allume || !this.cable || !this.cable.valide()) return false;
    const autre = this.cable.autre(this);
    return autre.adminUp && autre.appareil.allume;
  }

  /* Une liaison série dont le signal passe peut garder son protocole
     « down » : pas d'horloge côté DCE, ou deux encapsulations qui ne se
     comprennent pas (HDLC d'un côté, PPP de l'autre). null si tout va. */
  raisonSerie() {
    if (this.type !== "se" || !this.physiqueUp()) return null;
    const autre = this.cable.autre(this);
    const dce = this.cable.dce || this.cable.a;
    if (!dce.clockRate) return "pas d'horloge côté DCE (" + dce.appareil.nom + " " + dce.court + " : clock rate)";
    if (this.encapsulation !== autre.encapsulation) return "encapsulations différentes (" + this.encapsulation.toUpperCase() + " / " + autre.encapsulation.toUpperCase() + ")";
    return null;
  }
  estDce() { return this.type === "se" && !!this.cable && this.cable.type === "serie" && (this.cable.dce || this.cable.a) === this; }

  /* L'état physique et de protocole, comme « show ip interface brief ». */
  estUp() {
    if (this.parent) return this.adminUp && this.parent.estUp();
    if (this.type === "vlan") return this.adminUp && this.appareil.sviActive(this);
    // une interface de bouclage n'a pas de câble : elle est up dès qu'on l'allume
    if (this.type === "loop") return this.adminUp && this.appareil.allume;
    if (this.errDisabled) return false;
    if (this.type === "se") return this.physiqueUp() && !this.raisonSerie();
    if (!this.adminUp || !this.appareil.allume || !this.cable) return false;
    const autre = this.cable.autre(this);
    if (!autre.adminUp || !autre.appareil.allume) return false;
    return this.cable.type === "console" ? this.cable.valide() : this.cable.porteDonnees();
  }

  /* Pour les pastilles de l'interface : vert, orange ou rouge, et pourquoi. */
  etat() {
    if (!this.adminUp) return { couleur: "rouge", texte: "désactivé (shutdown)" };
    if (this.errDisabled) return { couleur: "rouge", texte: "err-disabled : violation de la sécurité du port (shutdown puis no shutdown pour le rouvrir)" };
    if (!this.cable && !this.estVirtuel()) return { couleur: "rouge", texte: "non câblé" };
    if (this.cable && !this.cable.valide()) return { couleur: "rouge", texte: this.cable.verdict().raison };
    const serie = this.raisonSerie();
    if (serie) return { couleur: "orange", texte: "ligne up, protocole down : " + serie };
    if (!this.estUp()) return { couleur: "rouge", texte: "en face : désactivé ou éteint" };
    const bloque = this.appareil.raisonBlocage ? this.appareil.raisonBlocage(this) : null;
    if (bloque) return { couleur: "orange", texte: bloque };
    return { couleur: "vert", texte: "actif" };
  }

  /* Une trame sort. Une sous-interface pose son étiquette 802.1Q — sauf
     sur le VLAN natif — et passe la main au port physique. */
  envoyer(trame) {
    if (this.parent) {
      trame.vlan = this.dot1qNatif ? null : this.dot1q;
      if (trame.vlan !== null) this.reseau.noter("La sous-interface " + this.court + " étiquette la trame 802.1Q, VLAN " + this.dot1q + ".");
      return this.parent.envoyer(trame);
    }
    if (!this.estUp()) {
      this.reseau.noter("La trame ne peut pas sortir par " + this.court + " : " + this.etat().texte + ".");
      return false;
    }
    // l'interface VLAN d'un commutateur n'a pas de câble : sa trame entre
    // dans la commutation du commutateur, comme si elle arrivait d'un port
    if (this.type === "vlan") return this.appareil.envoyerDepuisSvi(this, trame);
    if (this.type === "loop") return false;
    if (this.cable.type === "console") return false;
    this.reseau.transmettre(this, trame);
    return true;
  }

  toJSON() {
    const j = { nom: this.nom, adminUp: this.adminUp };
    if (this.description) j.description = this.description;
    if (this.mode !== "access") j.mode = this.mode;
    if (this._modeExplicite) j.modeExplicite = true;
    if (this.accessVlan !== 1) j.accessVlan = this.accessVlan;
    if (this.native !== 1) j.native = this.native;
    if (this.allowed !== "all") j.allowed = [...this.allowed];
    if (this.ip) { j.ip = this.ip.toString(); j.masque = this.masque.toString(); }
    if (this.helper) j.helper = this.helper.toString();
    if (this.natRole) j.natRole = this.natRole;
    if (this.aclIn) j.aclIn = this.aclIn;
    if (this.aclOut) j.aclOut = this.aclOut;
    if (this.dot1q !== null) { j.dot1q = this.dot1q; j.dot1qNatif = this.dot1qNatif; }
    if (this.clockRate) j.clockRate = this.clockRate;
    if (this.encapsulation !== "hdlc") j.encapsulation = this.encapsulation;
    if (this.mac) j.mac = this.mac.cisco();
    return j;
  }
}
