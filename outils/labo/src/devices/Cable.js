/* Un câble, et la question qu'on pose à un câble : est-ce qu'il peut
   marcher entre ces deux ports-là ?

   La règle des paires torsadées, telle qu'on l'apprend : un câble DROIT
   relie deux équipements de familles différentes (un PC ou un routeur à un
   commutateur), un câble CROISÉ deux de la même famille (commutateur à
   commutateur, PC à PC, PC à routeur). Les ports Gigabit savent inverser
   leurs paires tout seuls (auto-MDIX) : sur eux, les deux marchent. La
   fibre ne va que dans un port qui l'accepte ; la console ne transporte
   aucune trame, elle relie le port RS-232 d'un PC au port console d'un
   équipement Cisco. Le câble SÉRIE relie deux ports Serial de routeurs ;
   son premier bout est le DCE, celui qui doit fournir l'horloge
   (« clock rate »), comme le câble « Serial DCE » de Packet Tracer. */

export const TYPES_CABLE = {
  droit: { nom: "Droit", court: "droit" },
  croise: { nom: "Croisé", court: "croisé" },
  fibre: { nom: "Fibre", court: "fibre" },
  console: { nom: "Console", court: "console" },
  serie: { nom: "Série DCE", court: "série" },
};

let suivant = 1;

export class Cable {
  constructor(type, a, b) {
    this.id = "c" + suivant++;
    this.type = type;
    this.a = a;
    this.b = b;
    this.dce = type === "serie" ? a : null;
  }

  autre(port) { return port === this.a ? this.b : this.a; }

  /* { ok, raison } — la raison s'affiche telle quelle sous le câble rouge. */
  verdict() {
    const a = this.a, b = this.b;
    if (this.type === "console") {
      const ok = (a.type === "console" && b.type === "rs232") || (a.type === "rs232" && b.type === "console");
      return ok ? { ok: true, donnees: false }
        : { ok: false, raison: "Un câble console relie le port RS-232 d'un PC au port Console d'un équipement Cisco." };
    }
    if (a.type === "console" || a.type === "rs232" || b.type === "console" || b.type === "rs232") {
      return { ok: false, raison: "Un port console ou RS-232 n'accepte que le câble console." };
    }
    if (this.type === "serie") {
      return a.type === "se" && b.type === "se" ? { ok: true }
        : { ok: false, raison: "Le câble série relie deux ports Serial de routeurs (Se0/0/0, Se0/0/1)." };
    }
    if (a.type === "se" || b.type === "se") return { ok: false, raison: "Un port série n'accepte que le câble série." };
    if (this.type === "fibre") {
      return a.fibre && b.fibre ? { ok: true }
        : { ok: false, raison: "La fibre demande un port optique des deux côtés (sur le 2960 : Gi0/1 et Gi0/2)." };
    }
    if (a.fibreSeule || b.fibreSeule) return { ok: false, raison: "Ce port n'accepte que la fibre." };
    const memeFamille = a.appareil.famille === b.appareil.famille;
    const autoMdix = a.type === "gi" && b.type === "gi";
    if (autoMdix) return { ok: true };
    if (this.type === "droit" && memeFamille) {
      return { ok: false, raison: "Câble droit entre deux équipements de même famille : il faut un câble croisé." };
    }
    if (this.type === "croise" && !memeFamille) {
      return { ok: false, raison: "Câble croisé entre un hôte et un commutateur : il faut un câble droit." };
    }
    return { ok: true };
  }
  valide() { return this.verdict().ok; }
  porteDonnees() { return this.type !== "console" && this.valide(); }

  /* Le bon câble pour deux ports donnés — ce que choisit le mode
     « connexion automatique ». */
  static typeAuto(a, b) {
    if (a.type === "console" || a.type === "rs232" || b.type === "console" || b.type === "rs232") return "console";
    if (a.type === "se" || b.type === "se") return "serie";
    if (a.fibreSeule || b.fibreSeule) return "fibre";
    return a.appareil.famille === b.appareil.famille ? "croise" : "droit";
  }
}
