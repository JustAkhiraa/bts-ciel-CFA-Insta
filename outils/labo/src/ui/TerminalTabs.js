/* Les terminaux, en onglets, dockés en bas : un par équipement ouvert, et,
   en mode simulation, l'onglet « Événements » — la liste des sauts.

   Fini les quinze fenêtres de Packet Tracer : on passe d'un routeur à un
   commutateur d'un clic sur l'onglet, ou par Ctrl 1…9. Le clavier est
   celui d'une vraie console : Tab complète, « ? » aide sans valider, ↑ ↓
   remontent l'historique, Ctrl Z quitte la configuration. */

import { IOSConsole } from "../cli/IOSParser.js";
import { HostShell } from "../cli/HostShell.js";
import { COULEURS_PROTO } from "../canvas/Renderer.js";

const ech = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export class TerminalTabs {
  constructor({ onglets, conteneur, reseau, ui, rappels }) {
    Object.assign(this, { onglets, conteneur, reseau, ui, rappels });
    this.terms = [];               // { app, console, el, sortie, occupe }
    this.actif = null;             // un terminal, ou "evts"
    this.enAttente = new Map();    // messages console reçus avant l'ouverture
    // CDP est décoché d'office : ses annonces n'apprennent rien sur un ping
    this.protocoles = ["ARP", "ICMP", "DHCP", "DNS", "HTTP", "TCP", "UDP", "RIP", "CDP"];
    this.filtres = new Set(this.protocoles.filter((p) => p !== "CDP"));
    this.evts = this.creerEvenements();
    reseau.on("console", ({ app, texte }) => {
      const t = this.terms.find((x) => x.app === app);
      if (t) { t.sortie.ligne(texte, "sys"); }
      else {
        const l = this.enAttente.get(app) || [];
        l.push(texte); if (l.length > 40) l.shift();
        this.enAttente.set(app, l);
      }
    });
    let prevu = 0;
    const majEvts = () => { if (!prevu) prevu = requestAnimationFrame(() => { prevu = 0; this.rendreEvenements(); }); };
    reseau.on("saut", majEvts);
    reseau.on("livre", majEvts);
    reseau.on("journal", majEvts);
    reseau.on("topologie", () => this.rendreOnglets());
    this.rendreOnglets();
  }

  ouvrir(app) {
    let t = this.terms.find((x) => x.app === app);
    if (!t) {
      const console_ = app.type === "routeur" || app.type === "switch" ? new IOSConsole(app) : new HostShell(app);
      const el = document.createElement("div");
      el.className = "lb-term";
      el.setAttribute("role", "log");
      el.setAttribute("aria-label", "Terminal de " + app.nom);
      el.innerHTML = '<div class="lignes"></div><div class="saisie"><span></span><input type="text" spellcheck="false" autocomplete="off" aria-label="Commande"></div>';
      this.conteneur.appendChild(el);
      t = { app, console: console_, el, occupe: false, histo: -1, brouillon: "" };
      t.sortie = this.sortiePour(t);
      this.terms.push(t);
      const type = console_ instanceof IOSConsole ? "Console de " + app.nom + " — IOS. « ? » pour l'aide, Tab pour compléter."
        : app.nom + " — invite de commande. « ? » pour la liste des commandes.";
      t.sortie.ligne(type, "sys");
      (this.enAttente.get(app) || []).forEach((m) => t.sortie.ligne(m, "sys"));
      this.enAttente.delete(app);
      this.brancher(t);
    }
    this.activer(t);
    return t;
  }

  fermer(t) {
    t.el.remove();
    this.terms = this.terms.filter((x) => x !== t);
    if (this.actif === t) this.activer(this.terms[this.terms.length - 1] || (this.reseau.simulation ? "evts" : null));
    this.rendreOnglets();
  }

  oublier(app) {
    const t = this.terms.find((x) => x.app === app);
    if (t) this.fermer(t);
  }
  toutFermer() { this.terms.slice().forEach((t) => this.fermer(t)); }

  activer(t) {
    this.actif = t;
    this.terms.forEach((x) => { x.el.hidden = x !== t; });
    this.evts.hidden = t !== "evts";
    this.rendreOnglets();
    if (t && t !== "evts") {
      this.rappels.deplier();
      requestAnimationFrame(() => { t.el.querySelector("input").focus({ preventScroll: true }); t.el.scrollTop = t.el.scrollHeight; });
    }
    if (t === "evts") this.rendreEvenements();
  }

  activerRang(i) {
    const liste = (this.reseau.simulation ? ["evts"] : []).concat(this.terms);
    if (liste[i]) this.activer(liste[i]);
  }

  rendreOnglets() {
    const sim = this.reseau.simulation;
    let h = "";
    if (sim) h += '<button type="button" class="lb-onglet" role="tab" data-t="evts" aria-selected="' + (this.actif === "evts") + '">Événements <small>' + this.reseau.sauts.length + "</small></button>";
    this.terms.forEach((t, i) => {
      h += '<button type="button" class="lb-onglet" role="tab" data-t="' + i + '" aria-selected="' + (this.actif === t) + '" title="Ctrl ' + (i + 1 + (sim ? 1 : 0)) + '">'
        + '<i class="' + t.app.type + '"></i>' + ech(t.app.nom) + '<span class="x" data-fermer="' + i + '" role="button" aria-label="Fermer le terminal de ' + ech(t.app.nom) + '">×</span></button>';
    });
    if (!this.terms.length && !sim) h += '<span class="lb-onglet" style="cursor:default">Double-cliquez un équipement pour ouvrir son terminal</span>';
    h += '<span class="lb-onglets-fin"><button type="button" class="lb-b lb-icone" data-replier title="Replier ou déplier le panneau" aria-label="Replier le panneau du bas">'
      + '<svg viewBox="0 0 20 20"><path d="M5 8l5 5 5-5"/></svg></button></span>';
    this.onglets.innerHTML = h;
    this.onglets.onclick = (e) => {
      const f = e.target.closest("[data-fermer]");
      if (f) { e.stopPropagation(); this.fermer(this.terms[+f.dataset.fermer]); return; }
      if (e.target.closest("[data-replier]")) { this.rappels.replier(); return; }
      const b = e.target.closest("[data-t]");
      if (!b) return;
      this.activer(b.dataset.t === "evts" ? "evts" : this.terms[+b.dataset.t]);
    };
  }

  /* ── la sortie d'un terminal ── */
  sortiePour(t) {
    const lignes = () => t.el.querySelector(".lignes");
    const defiler = () => { t.el.scrollTop = t.el.scrollHeight; };
    const ajouterLigne = (texte, classe) => {
      const d = document.createElement("div");
      d.className = "l" + (classe ? " " + classe : "");
      d.textContent = texte;
      lignes().appendChild(d);
      // une console garde ses 2 000 dernières lignes, comme un tampon de terminal
      while (lignes().childElementCount > 2000) lignes().firstChild.remove();
    };
    return {
      ligne: (texte, classe) => { ajouterLigne(texte, classe || (/^%/.test(texte) && !/^%(LINK|LINEPROTO|SYS)/.test(texte) ? "err" : "")); defiler(); },
      lignes: (L) => { L.forEach((x) => ajouterLigne(x, /^%/.test(x) && !/^%(LINK|LINEPROTO|SYS)/.test(x) ? "err" : "")); defiler(); },
      ajouter: (texte) => {
        const der = lignes().lastElementChild;
        if (der) der.textContent += texte; else ajouterLigne(texte);
        defiler();
      },
      occupe: () => { t.occupe = true; this.majSaisie(t); },
      fin: () => { t.occupe = false; this.majSaisie(t); this.rappels.apresCommande(); this.vider(t); },
      effacer: () => { lignes().innerHTML = ""; },
    };
  }

  majSaisie(t) {
    const s = t.el.querySelector(".saisie");
    const input = s.querySelector("input");
    s.hidden = t.occupe;
    s.querySelector("span").textContent = t.console.invite();
    input.type = t.console.masque ? "password" : "text";
    if (!t.occupe && this.actif === t) input.focus({ preventScroll: true });
    t.el.scrollTop = t.el.scrollHeight;
  }

  /* Une ligne validée, comme si on avait tapé Entrée. */
  soumettre(t, ligne) {
    const c = t.console;
    t.sortie.ligne(c.invite() + (c.masque ? "" : ligne));
    t.histo = -1;
    c.executer(ligne, t.sortie);
    // ce que la commande a mis en route (annonces CDP, mises à jour RIP…)
    // part tout de suite en temps réel, attend le lecteur en simulation
    this.reseau.executer();
    this.majSaisie(t);
    this.rappels.apresCommande();
  }

  /* Un bloc collé (depuis la page « Commandes Packet Tracer », par
     exemple) : chaque ligne est jouée à son tour, comme sur une vraie
     console — une commande longue (ping) finit avant la suivante. La
     dernière ligne, si rien ne la termine, reste dans la saisie. */
  coller(t, texte) {
    const input = t.el.querySelector("input");
    const lignes = (input.value + texte).replace(/\r/g, "").split("\n");
    input.value = lignes.pop();
    t.file = (t.file || []).concat(lignes);
    this.vider(t);
  }
  vider(t) {
    while (t.file && t.file.length && !t.occupe) this.soumettre(t, t.file.shift());
  }

  brancher(t) {
    const input = t.el.querySelector("input");
    input.addEventListener("paste", (e) => {
      const texte = (e.clipboardData || window.clipboardData).getData("text");
      if (!/\n/.test(texte)) return;              // une seule ligne : collage ordinaire
      e.preventDefault();
      this.coller(t, texte);
    });
    this.majSaisie(t);
    t.el.addEventListener("mousedown", (e) => { if (e.target === t.el || e.target.closest(".lignes")) setTimeout(() => { if (!window.getSelection().toString()) input.focus(); }, 0); });
    input.addEventListener("keydown", (e) => {
      const c = t.console;
      const ios = c instanceof IOSConsole;
      if (e.key === "Enter") {
        e.preventDefault();
        const ligne = input.value;
        input.value = "";
        this.soumettre(t, ligne);
      } else if (e.key === "Tab") {
        e.preventDefault();
        input.value = c.completer(input.value);
      } else if (e.key === "?" && ios && !c.masque) {
        e.preventDefault();
        t.sortie.ligne(c.invite() + input.value + "?");
        t.sortie.lignes(c.aide(input.value));
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const h = c.historique;
        if (!h.length) return;
        if (t.histo === -1) { t.brouillon = input.value; t.histo = h.length; }
        t.histo = Math.max(0, Math.min(h.length, t.histo + (e.key === "ArrowUp" ? -1 : 1)));
        input.value = t.histo === h.length ? t.brouillon : h[t.histo];
        requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && ios) {
        e.preventDefault();
        t.sortie.ligne(c.invite() + input.value + "^Z");
        input.value = "";
        if (!["user", "priv"].includes(c.mode)) { c.mode = "priv"; c.ctx = {}; t.sortie.ligne("%SYS-5-CONFIG_I: Configured from console by console", "sys"); }
        this.majSaisie(t);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        t.sortie.effacer();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !window.getSelection().toString()) {
        t.sortie.ligne(c.invite() + input.value + "^C");
        input.value = "";
        t.file = [];                                 // un collage en cours s'arrête là
      }
    });
  }

  /* ── l'onglet des événements ── */
  creerEvenements() {
    const el = document.createElement("div");
    el.className = "lb-evts";
    el.hidden = true;
    el.innerHTML = '<div class="lb-evts-filtres" role="group" aria-label="Filtrer par protocole"></div>'
      + '<div class="lb-evts-table"><table><thead><tr><th>#</th><th>Temps</th><th>De</th><th>Vers</th><th>Type</th><th>Issue</th><th>Ce qui se passe</th></tr></thead><tbody></tbody></table></div>';
    this.conteneur.appendChild(el);
    const f = el.querySelector(".lb-evts-filtres");
    f.innerHTML = this.protocoles.map((p) => '<label class="lb-filtre"><input type="checkbox" data-proto="' + p + '"' + (this.filtres.has(p) ? " checked" : "") + ">"
      + '<span class="lb-proto" style="background:' + (COULEURS_PROTO[p] || "#999") + '">' + p + "</span></label>").join("")
      + '<button type="button" class="lb-b" data-vider style="margin-left:auto">Vider le journal</button>';
    f.addEventListener("change", (e) => {
      const p = e.target.dataset.proto;
      if (!p) return;
      if (e.target.checked) this.filtres.add(p); else this.filtres.delete(p);
      this.rappels.filtres(this.filtres);
      this.rendreEvenements();
    });
    f.addEventListener("click", (e) => { if (e.target.closest("[data-vider]")) this.reseau.viderJournal(); });
    el.querySelector("tbody").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-n]");
      if (!tr) return;
      this.ui.sautSel = this.reseau.sauts.find((s) => s.n === +tr.dataset.n) || null;
      this.rappels.selection();
      this.rendreEvenements();
    });
    return el;
  }

  rendreEvenements() {
    if (this.evts.hidden) { this.rendreOnglets(); return; }
    const corps = this.evts.querySelector("tbody");
    const zone = this.evts.querySelector(".lb-evts-table");
    const enBas = zone.scrollHeight - zone.scrollTop - zone.clientHeight < 30;
    const liste = this.reseau.sauts.filter((s) => this.filtres.has(s.protocole)).slice(-400);
    const issue = (s) => (!s.livre ? '<span class="lb-issue vol">en vol</span>'
      : '<span class="lb-issue ' + s.issue + '">' + ({ recue: "reçue", jetee: "jetée", ignoree: "ignorée", filtree: "filtrée" }[s.issue] || s.issue) + "</span>");
    corps.innerHTML = liste.map((s) => '<tr data-n="' + s.n + '" aria-selected="' + (this.ui.sautSel === s) + '"><td>' + s.n + "</td><td>" + s.t + " ms</td><td>"
      + ech(s.de.app.nom) + " <small>" + s.de.port.court + "</small></td><td>" + ech(s.vers.app.nom) + " <small>" + s.vers.port.court + "</small></td>"
      + '<td><span class="lb-proto" style="background:' + (COULEURS_PROTO[s.protocole] || "#999") + '">' + s.protocole + "</span></td><td>" + issue(s)
      + '</td><td class="info">' + ech(s.trame.resume()) + "</td></tr>").join("")
      || '<tr><td colspan="7" class="info">Aucun événement. Lancez un ping depuis un terminal, puis avancez pas à pas avec le lecteur.</td></tr>';
    if (enBas) zone.scrollTop = zone.scrollHeight;
    this.rendreOnglets();
  }
}
