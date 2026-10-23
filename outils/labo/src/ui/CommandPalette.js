/* La palette de commandes (Ctrl K) : tout ce que fait le labo, à portée
   de clavier. On tape quelques lettres, dans le désordre s'il le faut —
   « vla 2 » trouve « Charger le lab 2 — VLAN » — et Entrée.

   La recherche est une recherche de SOUS-SUITE : les lettres tapées
   doivent apparaître dans l'ordre, pas forcément collées. Les débuts de
   mots comptent plus que le milieu. */

const ech = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sansAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function score(q, texte) {
  const t = sansAccent(texte), mots = sansAccent(q).split(/\s+/).filter(Boolean);
  let total = 0;
  const marques = new Set();
  for (const m of mots) {
    let i = 0, s = 0, dernier = -2;
    for (const ch of m) {
      const j = t.indexOf(ch, i);
      if (j < 0) return null;
      s += j === dernier + 1 ? 3 : 1;
      if (j === 0 || /[\s—(/]/.test(t[j - 1])) s += 4;
      marques.add(j);
      dernier = j; i = j + 1;
    }
    total += s;
  }
  return { score: total - t.length * 0.02, marques };
}

export class CommandPalette {
  constructor({ racine, champ, liste, commandes, retour }) {
    Object.assign(this, { racine, champ, liste, commandes, retour });
    this.choix = 0;
    this.resultats = [];
    champ.addEventListener("input", () => { this.choix = 0; this.rendre(); });
    champ.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = this.resultats.length;
        if (n) this.choix = (this.choix + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
        this.rendre();
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.lancer(this.resultats[this.choix]);
      } else if (e.key === "Escape") { this.fermer(); }
    });
    liste.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-i]");
      if (li) this.lancer(this.resultats[+li.dataset.i]);
    });
    racine.addEventListener("mousedown", (e) => { if (e.target === racine) this.fermer(); });
  }

  ouvrir() {
    this.racine.hidden = false;
    this.champ.value = "";
    this.choix = 0;
    this.rendre();
    this.champ.focus();
  }
  fermer() { this.racine.hidden = true; if (this.retour) this.retour(); }
  ouverte() { return !this.racine.hidden; }

  rendre() {
    const q = this.champ.value.trim();
    const tout = this.commandes();
    this.resultats = q
      ? tout.map((c) => ({ c, r: score(q, c.titre + " " + (c.mots || "")) })).filter((x) => x.r)
          .sort((a, b) => b.r.score - a.r.score).slice(0, 40).map((x) => ({ ...x.c, marques: score(q, x.c.titre)?.marques }))
      : tout.slice(0, 40);
    this.liste.innerHTML = this.resultats.map((c, i) => {
      const titre = [...c.titre].map((ch, k) => (c.marques && c.marques.has(k) ? "<mark>" + ech(ch) + "</mark>" : ech(ch))).join("");
      return '<li role="option" data-i="' + i + '" aria-selected="' + (i === this.choix) + '">' + titre
        + (c.raccourci ? "<small><kbd>" + c.raccourci + "</kbd></small>" : c.groupe ? "<small>" + ech(c.groupe) + "</small>" : "") + "</li>";
    }).join("") || '<li aria-disabled="true">Aucune commande ne correspond.</li>';
    const sel = this.liste.querySelector('[aria-selected="true"]');
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }

  lancer(c) {
    if (!c) return;
    this.fermer();
    c.faire();
  }
}
