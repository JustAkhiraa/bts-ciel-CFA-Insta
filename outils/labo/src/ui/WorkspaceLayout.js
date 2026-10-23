/* La disposition : des panneaux dockés, qu'on élargit à la poignée et
   qu'on replie d'un double-clic — jamais une fenêtre qui flotte au-dessus
   d'une autre. Les tailles sont gardées d'une visite à l'autre. */

const CLE = "ciel-labo-disposition";

export class WorkspaceLayout {
  constructor({ racine, poigneeDroite, poigneeBas, toast, apresRedim }) {
    Object.assign(this, { racine, apresRedim });
    this.elToast = toast;
    this.taille = { droite: 340, bas: 260, sansInspecteur: false, sansTerminal: false };
    try { Object.assign(this.taille, JSON.parse(localStorage.getItem(CLE) || "{}")); } catch (e) { /* tailles par défaut */ }
    this.appliquer();
    this.poignee(poigneeDroite, "x", (d, depart) => { this.taille.droite = Math.max(260, Math.min(window.innerWidth * 0.55, depart - d)); });
    this.poignee(poigneeBas, "y", (d, depart) => { this.taille.bas = Math.max(90, Math.min(window.innerHeight * 0.75, depart - d)); this.taille.sansTerminal = false; });
    poigneeDroite.addEventListener("dblclick", () => this.basculer("sansInspecteur"));
    poigneeBas.addEventListener("dblclick", () => this.basculer("sansTerminal"));
  }

  poignee(el, axe, maj) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add("tire");
      const p0 = axe === "x" ? e.clientX : e.clientY;
      const depart = axe === "x" ? this.taille.droite : this.taille.bas;
      const bouge = (ev) => { maj((axe === "x" ? ev.clientX : ev.clientY) - p0, depart); this.appliquer(); };
      const fin = () => { el.classList.remove("tire"); el.removeEventListener("pointermove", bouge); el.removeEventListener("pointerup", fin); this.garder(); };
      el.addEventListener("pointermove", bouge);
      el.addEventListener("pointerup", fin);
    });
    el.addEventListener("keydown", (e) => {
      const pas = e.shiftKey ? 60 : 20;
      if (axe === "x" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { this.taille.droite += e.key === "ArrowLeft" ? pas : -pas; }
      else if (axe === "y" && (e.key === "ArrowUp" || e.key === "ArrowDown")) { this.taille.bas += e.key === "ArrowUp" ? pas : -pas; }
      else return;
      e.preventDefault(); this.appliquer(); this.garder();
    });
  }

  appliquer() {
    const s = this.racine.style;
    s.setProperty("--l-droite", Math.round(this.taille.droite) + "px");
    s.setProperty("--h-bas", Math.round(this.taille.bas) + "px");
    this.racine.classList.toggle("sans-inspecteur", this.taille.sansInspecteur);
    this.racine.classList.toggle("sans-terminal", this.taille.sansTerminal);
    if (this.apresRedim) this.apresRedim();
  }
  basculer(k, valeur) {
    this.taille[k] = valeur === undefined ? !this.taille[k] : valeur;
    this.appliquer(); this.garder();
  }
  garder() { try { localStorage.setItem(CLE, JSON.stringify(this.taille)); } catch (e) { /* sans mémoire, tant pis */ } }

  toast(texte, faute) {
    const t = this.elToast;
    t.textContent = texte;
    t.classList.toggle("faute", !!faute);
    t.classList.add("vu");
    clearTimeout(this._m);
    this._m = setTimeout(() => t.classList.remove("vu"), 3200);
  }

  /* Le thème : sombre par défaut ; le canevas relit ses couleurs. */
  basculerTheme() {
    const html = document.documentElement;
    const clair = html.dataset.theme !== "clair";
    html.dataset.theme = clair ? "clair" : "sombre";
    try { localStorage.setItem("ciel-labo-theme", clair ? "clair" : "sombre"); } catch (e) { /* idem */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = clair ? "#f6f7f9" : "#0f1115";
    return clair;
  }
}
