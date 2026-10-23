/* Une adresse MAC : 48 bits, six octets.

   Rangée en nombre (deux moitiés de 24 bits, pour rester dans les entiers
   exacts de JavaScript) et écrite selon le lecteur : « 0001.4321.abcd »
   pour IOS, « 00-01-43-21-AB-CD » pour Windows. Le moteur ne compare jamais
   des chaînes : deux écritures d'une même adresse sont la même adresse. */

const utilisees = new Set();
let compteur = 1;

export class MACAddress {
  constructor(haut, bas) {
    this.haut = haut >>> 0 & 0xffffff;     // les trois premiers octets (OUI)
    this.bas = bas >>> 0 & 0xffffff;       // les trois derniers
  }

  static parse(s) {
    const hex = String(s || "").toLowerCase().replace(/[^0-9a-f]/g, "");
    if (hex.length !== 12) return null;
    return new MACAddress(parseInt(hex.slice(0, 6), 16), parseInt(hex.slice(6), 16));
  }

  static get DIFFUSION() { return new MACAddress(0xffffff, 0xffffff); }
  static get ZERO() { return new MACAddress(0, 0); }

  /* Une adresse neuve, unique dans la page. Le premier octet porte la
     famille de l'équipement (00 PC, 00 serveur…), comme un vrai OUI porte
     le constructeur ; le reste est un compteur. Les adresses relues d'un
     fichier sont réservées, pour qu'une nouvelle ne leur marche jamais
     dessus. */
  static generer(oui) {
    let m;
    do {
      m = new MACAddress(oui, (compteur++ * 0x9e3b) & 0xffffff);
    } while (utilisees.has(m.cle()));
    utilisees.add(m.cle());
    return m;
  }
  static reserver(m) { utilisees.add(m.cle()); }

  cle() { return this.haut.toString(16).padStart(6, "0") + this.bas.toString(16).padStart(6, "0"); }
  egale(autre) { return !!autre && autre.haut === this.haut && autre.bas === this.bas; }
  estDiffusion() { return this.haut === 0xffffff && this.bas === 0xffffff; }
  /* Le bit « groupe » (multidiffusion) est le bit de poids faible du
     premier octet. Une trame de groupe est inondée comme une diffusion. */
  estGroupe() { return ((this.haut >>> 16) & 1) === 1; }

  /* « 0001.4321.abcd » — l'écriture d'IOS */
  cisco() { const c = this.cle(); return c.slice(0, 4) + "." + c.slice(4, 8) + "." + c.slice(8); }
  /* « 00-01-43-21-AB-CD » — l'écriture de Windows */
  windows() { return this.cle().toUpperCase().match(/../g).join("-"); }
  /* « 00:01:43:21:ab:cd » — l'écriture de Linux */
  linux() { return this.cle().match(/../g).join(":"); }

  toString() { return this.cisco(); }
  toJSON() { return this.cisco(); }
}
