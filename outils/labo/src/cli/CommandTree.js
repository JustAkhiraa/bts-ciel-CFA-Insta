/* L'arbre des commandes d'un mode IOS.

   Une commande s'écrit comme dans la documentation Cisco :
     "switchport access vlan <vlan:vlan>"
     "ip route <reseau:ip> <masque:masque> <via:ip>"
   Les mots sont des MOTS-CLÉS, qu'on peut abréger tant que l'abréviation
   reste unique à sa position (« sh ip int br ») ; les <nom:type> sont des
   PARAMÈTRES, vérifiés par leur type.

   L'arbre sait trois choses : analyser une ligne (et dire où elle casse,
   pour le « ^ » d'IOS), lister ce qui peut venir ensuite (le « ? »), et
   compléter un mot commencé (la touche Tab). */

import { IPv4Address } from "../core/IPv4Address.js";
import { normaliserInterface } from "../devices/Port.js";
import { lireListeVlan } from "../devices/SwitchL2.js";

/* Les types de paramètres : comment on les reconnaît, comment IOS les
   annonce dans l'aide. */
export const TYPES = {
  ip: { aide: "A.B.C.D", lire: (t) => IPv4Address.parse(t) },
  masque: { aide: "A.B.C.D", lire: (t) => { const m = IPv4Address.parse(t); return m && m.estMasque() ? m : null; } },
  vlan: { aide: "<1-4094>", lire: (t) => (/^\d+$/.test(t) && +t >= 1 && +t <= 4094 ? +t : null) },
  nombre: { aide: "<0-4294967295>", lire: (t) => (/^\d+$/.test(t) ? +t : null) },
  ligne: { aide: "<0-15>", lire: (t) => (/^\d+$/.test(t) && +t <= 15 ? +t : null) },
  mot: { aide: "WORD", lire: (t) => (t ? t : null) },
  liste: { aide: "WORD", lire: (t) => (lireListeVlan(t) ? t : null) },
  interface: { aide: "Interface", lire: (t) => normaliserInterface(t) },
  texte: { aide: "LINE", reste: true, lire: (t) => t },
};

function noeud() { return { mots: new Map(), params: [], run: null }; }

/* Les paramètres d'un nœud, du plus exigeant au plus accommodant : un
   nombre avant un mot quelconque, un mot avant le reste de la ligne. */
const RANG = { mot: 1, texte: 2 };
function parPrecision(params) {
  return params.map((p, k) => [p, k]).sort((a, b) => (RANG[a[0].type] || 0) - (RANG[b[0].type] || 0) || a[1] - b[1]).map((x) => x[0]);
}

export class CommandTree {
  constructor(aides = {}) {
    this.racine = noeud();
    this.aides = aides;          // mot-clé → phrase d'aide
  }

  ajouter(motif, run) {
    let n = this.racine;
    for (const morceau of motif.trim().split(/\s+/)) {
      const p = /^<(\w+):(\w+)>$/.exec(morceau);
      if (p) {
        let enfant = n.params.find((x) => x.nom === p[1] && x.type === p[2]);
        if (!enfant) { enfant = { nom: p[1], type: p[2], noeud: noeud() }; n.params.push(enfant); }
        n = enfant.noeud;
      } else {
        const mot = morceau.toLowerCase();
        if (!n.mots.has(mot)) n.mots.set(mot, noeud());
        n = n.mots.get(mot);
      }
    }
    n.run = run;
    return this;
  }

  /* Les mots-clés de ce nœud qui commencent par « debut ». */
  correspondances(n, debut) {
    const d = debut.toLowerCase();
    if (n.mots.has(d)) return [d];
    return [...n.mots.keys()].filter((m) => m.startsWith(d));
  }

  /* Analyser des jetons. Rend { run, args, mots } ou { erreur, pos }, où
     pos est l'indice du jeton fautif — d'où IOS place son « ^ ».

     Quand plusieurs chemins acceptent un jeton (« enable secret 5 … » :
     un niveau <nombre> ou un mot de passe <mot> ?), on essaie le plus
     précis d'abord et l'on revient en arrière s'il mène à une impasse.
     Sans issue, l'erreur rendue est celle qui est allée le plus loin. */
  analyser(jetons) {
    return this.suivre(this.racine, jetons, 0, {}, []);
  }

  suivre(n, jetons, i, args, mots) {
    if (i === jetons.length) return n.run ? { run: n.run, args, mots } : { erreur: "incomplet", pos: i };
    const t = jetons[i];
    let pire = null;
    const retenir = (r) => { if (!pire || r.pos > pire.pos) pire = r; };
    const c = this.correspondances(n, t);
    if (c.length === 1) {
      const r = this.suivre(n.mots.get(c[0]), jetons, i + 1, args, mots.concat(c[0]));
      if (r.run) return r;
      retenir(r);
    } else if (c.length > 1 && !n.params.some((x) => !TYPES[x.type].reste && TYPES[x.type].lire(t) !== null)) {
      // un paramètre pourrait encore accepter le jeton (rare) ; sinon c'est ambigu
      return { erreur: "ambigu", pos: i, mot: t };
    }
    for (const p of parPrecision(n.params)) {
      const T = TYPES[p.type];
      if (T.reste) {
        const r = p.noeud.run ? { run: p.noeud.run, args: { ...args, [p.nom]: jetons.slice(i).join(" ") }, mots }
                              : { erreur: "incomplet", pos: jetons.length };
        if (r.run) return r;
        retenir(r);
        continue;
      }
      // « int fa 0/1 » : IOS accepte une espace entre le type et le numéro
      if (p.type === "interface" && /^[a-zA-Z]+$/.test(t) && jetons[i + 1] && /^\d/.test(jetons[i + 1])) {
        const v = T.lire(t + jetons[i + 1]);
        if (v) {
          const r = this.suivre(p.noeud, jetons, i + 2, { ...args, [p.nom]: v }, mots);
          if (r.run) return r;
          retenir(r);
        }
      }
      const v = T.lire(t);
      if (v !== null && v !== undefined) {
        const r = this.suivre(p.noeud, jetons, i + 1, { ...args, [p.nom]: v }, mots);
        if (r.run) return r;
        retenir(r);
      }
    }
    return pire || { erreur: "invalide", pos: i };
  }

  /* Le nœud atteint par des jetons complets (pour l'aide), ou null. */
  atteindre(jetons) {
    let n = this.racine;
    for (let i = 0; i < jetons.length; i++) {
      const t = jetons[i];
      const c = this.correspondances(n, t);
      if (c.length === 1) { n = n.mots.get(c[0]); continue; }
      let pris = false;
      for (const p of n.params) {
        const T = TYPES[p.type];
        if (T.reste) return p.noeud;
        if (p.type === "interface" && /^[a-zA-Z]+$/.test(t) && jetons[i + 1] && /^\d/.test(jetons[i + 1]) && T.lire(t + jetons[i + 1])) {
          n = p.noeud; i++; pris = true; break;
        }
        if (T.lire(t) !== null) { n = p.noeud; pris = true; break; }
      }
      if (!pris) return null;
    }
    return n;
  }

  /* Le « ? » : ce qui peut suivre, avec son aide. */
  aide(n, debut = "") {
    const out = [];
    const mots = debut ? this.correspondances(n, debut) : [...n.mots.keys()];
    mots.sort().forEach((m) => out.push([m, this.aides[m] || ""]));
    if (!debut) {
      n.params.forEach((p) => out.push([TYPES[p.type].aide, this.aides["<" + p.nom + ">"] || ""]));
      if (n.run) out.push(["<cr>", ""]);
    }
    return out;
  }
}
