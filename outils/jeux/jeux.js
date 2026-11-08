/* Les jeux du jour.

   Quatre jeux, un nouveau chaque jour, faits avec le cours :
     · le mot du jour      : un mot du vocabulaire, en six essais ;
     · la notion cachée    : un passage du cours, mots masqués, à dévoiler ;
     · le terminal         : des machines à infiltrer en tapant les bonnes
                             commandes, de plus en plus vite (une partie
                             s'arrête à la troisième erreur) ;
     · la grille binaire   : des 0 et des 1 à placer selon trois règles.

   Pas de serveur : le jeu du jour est TIRÉ DE LA DATE. Une graine faite de
   la date donne la même suite de hasards sur tous les appareils, donc le
   même jeu pour toute la classe, et hors ligne. La partie et les séries
   sont gardées dans le navigateur de chacun.

   Les données (mots, commandes, passages du cours) sont écrites dans
   « donnees.js » par la publication. */
(function () {
  "use strict";
  const D = window.JEUX_DONNEES;
  const racine = document.getElementById("jeux");
  if (!racine || !D) return;

  /* ═══════════════ 1. Le jour, la graine, le hasard ═════════════════ */
  const pad = (n) => String(n).padStart(2, "0");
  const maintenant = new Date();
  const JOUR = maintenant.getFullYear() + "-" + pad(maintenant.getMonth() + 1) + "-" + pad(maintenant.getDate());
  // le n° 1 est le dimanche 8 novembre 2026, le jour où les jeux sont nés
  const NUMERO = Math.round((Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
    - Date.UTC(2026, 10, 8)) / 86400000) + 1;
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
                "septembre", "octobre", "novembre", "décembre"];

  function graine(texte) {
    let h = 2166136261;
    for (let i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function hasard(g) {
    let s = g >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function melanger(tab, r) {
    const t = tab.slice();
    for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
    return t;
  }
  // le n-ième élément d'une liste mélangée une fois pour toutes : aucun
  // retour avant que la liste entière soit passée
  function duJour(liste, nom) {
    const ordre = melanger(liste.map((_, i) => i), hasard(graine(nom + "-v1")));
    const k = ((NUMERO - 1) % liste.length + liste.length) % liste.length;
    return liste[ordre[k]];
  }

  /* ═══════════════ 2. La mémoire de chacun ══════════════════════════ */
  const CLE = "jeux-du-jour-v1";
  let memoire = {};
  try { memoire = JSON.parse(localStorage.getItem(CLE)) || {}; } catch (e) { memoire = {}; }
  memoire.jours = memoire.jours || {};
  memoire.stats = memoire.stats || {};
  // trente jours gardés, pas plus
  Object.keys(memoire.jours).sort().slice(0, -30).forEach((j) => delete memoire.jours[j]);
  const partieDuJour = (jeu) => ((memoire.jours[JOUR] = memoire.jours[JOUR] || {})[jeu]);
  function garder(jeu, etat) {
    (memoire.jours[JOUR] = memoire.jours[JOUR] || {})[jeu] = etat;
    try { localStorage.setItem(CLE, JSON.stringify(memoire)); } catch (e) { /* navigation privée : on joue sans mémoire */ }
  }
  function compter(jeu, gagne) {
    const s = memoire.stats[jeu] = memoire.stats[jeu] || { joues: 0, gagnes: 0, serie: 0, meilleure: 0, dernier: "" };
    if (s.dernierJour === JOUR) return s;
    s.dernierJour = JOUR;
    s.joues++;
    if (gagne) {
      const hier = new Date(maintenant); hier.setDate(hier.getDate() - 1);
      const h = hier.getFullYear() + "-" + pad(hier.getMonth() + 1) + "-" + pad(hier.getDate());
      s.serie = s.dernier === h ? s.serie + 1 : 1;
      s.meilleure = Math.max(s.meilleure, s.serie);
      s.gagnes++;
      s.dernier = JOUR;
    } else s.serie = 0;
    try { localStorage.setItem(CLE, JSON.stringify(memoire)); } catch (e) { /* rien */ }
    return s;
  }

  /* ═══════════════ 3. Petits outils ═════════════════════════════════ */
  const ech = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sansAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const el = (balise, classe, html) => { const e = document.createElement(balise); if (classe) e.className = classe; if (html != null) e.innerHTML = html; return e; };
  function partager(texte, bouton) {
    const fini = (ok) => { bouton.textContent = ok ? "Copié ✓" : "Copie refusée"; setTimeout(() => { bouton.textContent = "Copier mon résultat"; }, 2200); };
    if (navigator.clipboard) navigator.clipboard.writeText(texte).then(() => fini(true), () => fini(false));
    else fini(false);
  }
  function boutonPartage(texte) {
    const b = el("button", "jx-b jx-plein", "Copier mon résultat");
    b.type = "button";
    b.addEventListener("click", () => partager(texte, b));
    return b;
  }
  const lienCours = (chemin, ancre) => "../" + chemin + "/cours.html" + (ancre ? "#" + ancre : "");
  const NOM_MATIERE = { "01-informatique-dev": "Informatique & développement", "02-reseaux-systemes": "Réseaux & systèmes",
    "03-mathematiques": "Mathématiques", "04-anglais": "Anglais", "05-culture-generale": "Culture générale" };
  const matiereDe = (chemin) => NOM_MATIERE[chemin.split("/")[0]] || "";

  /* ═══════════════ 4. L'accueil des jeux ════════════════════════════ */
  const JEUX = [
    { id: "mot", nom: "Le mot du jour", ico: "Aa", dit: "Un mot du cours, en six essais." },
    { id: "notion", nom: "La notion cachée", ico: "▒", dit: "Un passage du cours, mots masqués : trouve son titre." },
    { id: "terminal", nom: "Le terminal", ico: ">_", dit: "Infiltre des machines en tapant les bonnes commandes." },
    { id: "binaire", nom: "La grille binaire", ico: "01", dit: "Des 0 et des 1, trois règles, une seule solution." },
  ];
  const tete = el("div", "jx-tete");
  const cartes = el("div", "jx-cartes");
  const scene = el("div", "jx-scene");
  racine.append(tete, cartes, scene);

  function avant(minuit) {
    const ms = minuit - Date.now(), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
    return h ? h + " h " + pad(m) : m + " min";
  }
  function majTete() {
    const minuit = new Date(maintenant); minuit.setHours(24, 0, 0, 0);
    tete.innerHTML = '<p class="jx-date">Les jeux du ' + JOURS[maintenant.getDay()] + " " + maintenant.getDate() + " "
      + MOIS[maintenant.getMonth()] + " · n° " + NUMERO + '</p><p class="jx-prochain">Les suivants dans '
      + avant(minuit.getTime()) + ". Le même jeu pour toute la classe.</p>";
  }
  function etatCarte(id) {
    const p = partieDuJour(id);
    if (!p) return "À jouer";
    if (id === "terminal") return p.fini ? "Partie finie · " + p.machines + " machine" + (p.machines > 1 ? "s" : "") : "En cours";
    return p.fini ? (p.gagne ? "Réussi ✓" : "Terminé") : "En cours";
  }
  function majCartes() {
    cartes.innerHTML = "";
    JEUX.forEach((j) => {
      const b = el("a", "jx-carte", '<span class="jx-ico" aria-hidden="true">' + j.ico + '</span><span class="jx-nom">'
        + j.nom + '</span><span class="jx-dit">' + j.dit + '</span><span class="jx-etat">' + etatCarte(j.id) + "</span>");
      b.href = "#" + j.id;
      if (location.hash === "#" + j.id) b.setAttribute("aria-current", "true");
      cartes.append(b);
    });
  }
  function ouvrir() {
    const id = location.hash.slice(1);
    majTete(); majCartes();
    // un jeu ouvert : les cartes se replient en une rangée de pastilles,
    // pour que le jeu soit à l'écran sans défiler
    cartes.classList.toggle("jx-compact", !!id);
    scene.innerHTML = "";
    document.removeEventListener("keydown", toucheMot);
    arreterTerminal();
    if (id === "mot") jeuMot();
    else if (id === "notion") jeuNotion();
    else if (id === "terminal") jeuTerminal();
    else if (id === "binaire") jeuBinaire();
    else scene.append(el("p", "jx-note", "Choisis un jeu. Chaque jour à minuit, quatre nouveaux."));
  }
  window.addEventListener("hashchange", ouvrir);
  setInterval(majTete, 30000);

  /* ═══════════════ 5. Le mot du jour ════════════════════════════════
     Un mot du vocabulaire du cours. Chaque essai colore ses lettres :
     bien placée, présente ailleurs, absente. Une lettre présente une seule
     fois dans le mot n'est signalée qu'une fois, même tapée deux fois. */
  const ESSAIS = 6;
  const [MOT, DEF, CHEMIN] = duJour(D.mots, "mot");
  function noter(essai) {
    const res = Array(MOT.length).fill("absente"), reste = {};
    for (let i = 0; i < MOT.length; i++) {
      if (essai[i] === MOT[i]) res[i] = "juste"; else reste[MOT[i]] = (reste[MOT[i]] || 0) + 1;
    }
    for (let i = 0; i < MOT.length; i++) {
      if (res[i] !== "juste" && reste[essai[i]]) { res[i] = "ailleurs"; reste[essai[i]]--; }
    }
    return res;
  }
  let saisieMot = "";
  function jeuMot() {
    const p = partieDuJour("mot") || { essais: [], indice: false, fini: false, gagne: false };
    const bloc = el("div", "jx-jeu jx-mot");
    const info = el("p", "jx-consigne", "Un mot de <b>" + MOT.length + " lettres</b>, en " + matiereDe(CHEMIN)
      + ". Six essais. Les lettres <span class=\"jx-l juste\">bien placées</span>, <span class=\"jx-l ailleurs\">présentes ailleurs</span> et <span class=\"jx-l absente\">absentes</span> se colorent.");
    const grille = el("div", "jx-grille-mot");
    grille.style.setProperty("--n", MOT.length);
    const clavier = el("div", "jx-clavier");
    const pied = el("div", "jx-pied");
    bloc.append(info, grille, clavier, pied);
    scene.append(bloc);

    function dessiner() {
      grille.innerHTML = "";
      const etatLettre = {};
      for (let r = 0; r < ESSAIS; r++) {
        const essai = p.essais[r];
        const ligne = el("div", "jx-ligne");
        const notes = essai ? noter(essai) : null;
        for (let i = 0; i < MOT.length; i++) {
          const lettre = essai ? essai[i] : (r === p.essais.length && !p.fini ? (saisieMot[i] || "") : "");
          const c = el("span", "jx-case" + (notes ? " " + notes[i] : lettre ? " tapee" : ""), lettre);
          if (notes) {
            const rang = { juste: 3, ailleurs: 2, absente: 1 };
            if (!etatLettre[lettre] || rang[notes[i]] > rang[etatLettre[lettre]]) etatLettre[lettre] = notes[i];
            c.setAttribute("aria-label", lettre + " : " + { juste: "bien placée", ailleurs: "ailleurs", absente: "absente" }[notes[i]]);
          }
          ligne.append(c);
        }
        grille.append(ligne);
      }
      clavier.innerHTML = "";
      ["AZERTYUIOP", "QSDFGHJKLM", "↵WXCVBN⌫"].forEach((rangee) => {
        const r = el("div", "jx-rangee");
        [...rangee].forEach((t) => {
          const b = el("button", "jx-touche" + (etatLettre[t] ? " " + etatLettre[t] : "") + (t === "↵" || t === "⌫" ? " large" : ""), t);
          b.type = "button";
          b.setAttribute("aria-label", t === "↵" ? "Valider" : t === "⌫" ? "Effacer" : t);
          b.addEventListener("click", () => frappe(t === "↵" ? "Enter" : t === "⌫" ? "Backspace" : t));
          r.append(b);
        });
        clavier.append(r);
      });
      pied.innerHTML = "";
      if (p.fini) finir();
      else {
        const bi = el("button", "jx-b", p.indice ? "Indice : " + ech(DEF) : "Un indice (la définition)");
        bi.type = "button";
        bi.disabled = p.indice;
        bi.addEventListener("click", () => { p.indice = true; garder("mot", p); dessiner(); });
        pied.append(bi);
      }
    }
    function finir() {
      const res = el("div", "jx-fin");
      res.innerHTML = (p.gagne ? "<p><b>Trouvé en " + p.essais.length + " essai" + (p.essais.length > 1 ? "s" : "") + ".</b>"
        : "<p><b>Le mot était " + MOT + ".</b>") + "</p><p><b>" + MOT + "</b> : " + ech(DEF) + '</p><p><a href="'
        + lienCours(CHEMIN) + '">Revoir le chapitre</a></p>';
      const s = (memoire.stats.mot || {});
      res.append(el("p", "jx-stats", "Série : " + (s.serie || 0) + " jour" + ((s.serie || 0) > 1 ? "s" : "") + " · meilleure : " + (s.meilleure || 0)));
      const carres = p.essais.map((e) => noter(e).map((n) => ({ juste: "🟩", ailleurs: "🟨", absente: "⬜" }[n])).join("")).join("\n");
      res.append(boutonPartage("Mot du jour n° " + NUMERO + " · " + (p.gagne ? p.essais.length : "X") + "/" + ESSAIS
        + (p.indice ? " · avec indice" : "") + "\n" + carres));
      pied.append(res);
    }
    function frappe(t) {
      if (p.fini) return;
      if (t === "Enter") {
        if (saisieMot.length !== MOT.length) { info.classList.add("jx-secoue"); setTimeout(() => info.classList.remove("jx-secoue"), 400); return; }
        p.essais.push(saisieMot);
        saisieMot = "";
        if (p.essais[p.essais.length - 1] === MOT) { p.fini = true; p.gagne = true; compter("mot", true); }
        else if (p.essais.length >= ESSAIS) { p.fini = true; compter("mot", false); }
        garder("mot", p); majCartes();
      } else if (t === "Backspace") saisieMot = saisieMot.slice(0, -1);
      else if (/^[A-Z]$/.test(t) && saisieMot.length < MOT.length) saisieMot += t;
      dessiner();
    }
    toucheMot = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key === "Enter" || e.key === "Backspace" ? e.key : sansAccent(e.key).toUpperCase();
      if (k === "Enter" || k === "Backspace" || /^[A-Z]$/.test(k)) { e.preventDefault(); frappe(k); }
    };
    document.addEventListener("keydown", toucheMot);
    dessiner();
  }
  let toucheMot = () => {};

  /* ═══════════════ 6. La notion cachée ══════════════════════════════
     Un passage du cours, tous ses mots masqués sauf les petits mots. On
     propose des mots : chaque occurrence trouvée se dévoile. Le titre de
     la section est masqué lui aussi, et c'est lui qu'il faut trouver.
     Un mot est reconnu sans ses accents, au singulier comme au pluriel. */
  const PETITS = new Set(("le la les l un une des du de d et ou a au aux en dans par pour sur sous avec sans ce cet cette ces "
    + "qui que qu quoi dont il elle ils elles on se s son sa ses leur leurs ne n pas plus est sont etre "
    + "c j m t y mais donc car si ni comme tout tous toute toutes meme aussi").split(" "));
  const cleMot = (m) => { const k = sansAccent(m.toLowerCase()); return k.length > 3 ? k.replace(/[sx]$/, "") : k; };
  const NOTION = D.notions.length ? duJour(D.notions, "notion") : null;
  function decouper(texte) { return texte.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) || []; }
  function jeuNotion() {
    if (!NOTION) { scene.append(el("p", "jx-note", "Aucun passage disponible.")); return; }
    const p = partieDuJour("notion") || { mots: [], formes: {}, fini: false, gagne: false, abandon: false };
    p.formes = p.formes || {};
    const bloc = el("div", "jx-jeu jx-notion");
    bloc.append(el("p", "jx-consigne", "Un passage du cours. Trouve le <b>titre</b> de sa section en proposant des mots : "
      + "chaque mot trouvé se dévoile partout. Matière : " + ech(NOTION.m) + "."));
    const titre = el("h3", "jx-texte jx-titre"), texte = el("p", "jx-texte");
    const form = el("form", "jx-proposer");
    form.innerHTML = '<label class="jx-cache" for="jx-mot">Un mot</label><input id="jx-mot" class="jx-champ" autocomplete="off" '
      + 'autocapitalize="off" spellcheck="false" placeholder="Un mot, puis Entrée"><button class="jx-b jx-plein" type="submit">Proposer</button>';
    const historique = el("ol", "jx-historique"), pied = el("div", "jx-pied");
    bloc.append(titre, texte, form, pied, historique);
    scene.append(bloc);
    const jetonsTitre = decouper(NOTION.t), jetonsTexte = decouper(NOTION.x);
    const aTrouver = new Set(jetonsTitre.filter((j) => /[\p{L}\p{N}]/u.test(j) && !PETITS.has(cleMot(j))).map(cleMot));
    function visible(j) {
      if (!/[\p{L}\p{N}]/u.test(j)) return true;
      if (p.fini) return true;
      const k = cleMot(j);
      return PETITS.has(sansAccent(j.toLowerCase())) || p.mots.includes(k);
    }
    function rendre(jetons, cible) {
      cible.innerHTML = jetons.map((j) => visible(j)
        ? '<span class="' + (/[\p{L}\p{N}]/u.test(j) && p.mots.includes(cleMot(j)) ? "jx-trouve" : "") + '">' + ech(j) + "</span>"
        : '<span class="jx-masque" style="--n:' + j.length + '" title="' + j.length + ' lettres">' + j.length + "</span>").join("");
    }
    function dessiner() {
      rendre(jetonsTitre, titre); rendre(jetonsTexte, texte);
      historique.innerHTML = p.mots.slice().reverse().map((k) => {
        const n = jetonsTitre.concat(jetonsTexte).filter((j) => cleMot(j) === k).length;
        return "<li><b>" + ech(p.formes[k] || k) + "</b> · " + (n ? n + " fois" : "absent") + "</li>";
      }).join("");
      pied.innerHTML = "";
      if (p.fini) {
        const r = el("div", "jx-fin", (p.gagne ? "<p><b>Trouvé en " + p.mots.length + " mots.</b></p>" : "<p><b>La notion était dévoilée.</b></p>")
          + '<p><a href="../' + NOTION.u + '">Lire la section du cours</a></p>');
        r.append(boutonPartage("Notion cachée n° " + NUMERO + " · " + (p.gagne ? p.mots.length + " mots" : "abandon")));
        pied.append(r);
        form.hidden = true;
      } else {
        const ab = el("button", "jx-b", "Dévoiler la réponse");
        ab.type = "button";
        ab.addEventListener("click", () => { p.fini = true; p.abandon = true; compter("notion", false); garder("notion", p); majCartes(); dessiner(); });
        pied.append(ab);
      }
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const champ = form.querySelector("input");
      // un mot est fait de lettres ou de chiffres : la ponctuation ne compte pas
      const mots = champ.value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      champ.value = "";
      mots.forEach((m) => { const k = cleMot(m); if (k && !p.mots.includes(k)) { p.mots.push(k); p.formes[k] = m.toLowerCase(); } });
      if ([...aTrouver].every((k) => p.mots.includes(k))) { p.fini = true; p.gagne = true; compter("notion", true); majCartes(); }
      garder("notion", p); dessiner(); champ.focus();
    });
    dessiner();
  }

  /* ═══════════════ 7. Le terminal ═══════════════════════════════════
     Une partie : des machines à infiltrer, trois commandes chacune. Le
     temps par commande raccourcit de machine en machine, et les commandes
     deviennent plus pointues. Trois erreurs (ou trois temps écoulés), et
     la partie s'arrête. La partie du jour suit la graine du jour : la
     même pour tous. On peut ensuite s'entraîner sur des parties au hasard,
     qui ne comptent pas. */
  let minuteur = null;
  function arreterTerminal() { if (minuteur) { clearInterval(minuteur); minuteur = null; } }
  const normaliser = (s) => s.trim().replace(/\s+/g, " ");
  function jeuTerminal(entrainement) {
    const officielle = !entrainement;
    const graineP = officielle ? graine(JOUR + "-terminal") : (Math.random() * 4294967296) >>> 0;
    const r = hasard(graineP);
    const pioches = { 1: melanger(D.commandes.filter((c) => c.n === 1), r), 2: melanger(D.commandes.filter((c) => c.n === 2), r),
                      3: melanger(D.commandes.filter((c) => c.n === 3), r) };
    const machines = [];
    function machine(k) {
      while (machines.length < k) {
        const i = machines.length + 1, niveau = Math.min(3, 1 + Math.floor((i - 1) / 2));
        const noms = ["srv", "rt", "sw", "db", "web", "nas", "pc", "fw"];
        const nom = noms[Math.floor(r() * noms.length)] + "-" + Math.floor(r() * 256).toString(16).padStart(2, "0");
        const ip = "10." + Math.floor(r() * 250 + 1) + "." + Math.floor(r() * 250) + "." + Math.floor(r() * 250 + 2);
        const taches = [];
        for (let t = 0; t < 3; t++) {
          let n = niveau;
          while (n > 1 && !pioches[n].length) n--;
          if (!pioches[n].length) pioches[n] = melanger(D.commandes.filter((c) => c.n === n), r);
          taches.push(pioches[n].shift());
        }
        machines.push({ nom, ip, taches, temps: Math.max(12, 42 - 5 * (i - 1)) });
      }
      return machines[k - 1];
    }
    const deja = officielle ? partieDuJour("terminal") : null;
    const p = deja && deja.fini ? deja : { vies: 3, machine: 1, tache: 0, reussies: 0, machines: 0, fini: false };
    const bloc = el("div", "jx-jeu jx-terminal");
    bloc.append(el("p", "jx-consigne", officielle
      ? "La partie du jour, la même pour toute la classe. Tape la commande demandée, puis Entrée. Trois erreurs, et c'est fini."
      : "Entraînement : une partie au hasard, qui ne compte pas."));
    const hud = el("div", "jx-hud"), barre = el("div", "jx-temps", "<span></span>");
    const ecran = el("pre", "jx-ecran");
    const form = el("form", "jx-invite");
    form.innerHTML = '<label class="jx-invite-lib" for="jx-cmd"></label><input id="jx-cmd" class="jx-champ jx-cmd" autocomplete="off" '
      + 'autocapitalize="off" autocorrect="off" spellcheck="false">';
    const pied = el("div", "jx-pied");
    bloc.append(hud, barre, ecran, form, pied);
    scene.append(bloc);
    const champ = form.querySelector("input"), invite = form.querySelector("label");
    const lignes = [];
    function ecrire(t, classe) {
      lignes.push('<span class="' + (classe || "") + '">' + ech(t) + "</span>");
      ecran.innerHTML = lignes.slice(-40).join("\n");
      ecran.scrollTop = ecran.scrollHeight;
    }
    let reste = 0, debut = 0;
    function majHud() {
      hud.innerHTML = '<span>Machine <b>' + p.machine + "</b></span><span>Commandes réussies <b>" + p.reussies
        + '</b></span><span class="jx-vies" aria-label="' + p.vies + ' vies">' + "●".repeat(p.vies) + "○".repeat(3 - p.vies) + "</span>";
    }
    function poser() {
      const m = machine(p.machine), t = m.taches[p.tache];
      if (p.tache === 0) {
        ecrire("");
        ecrire("Connexion à " + m.nom + " (" + m.ip + ")…", "jx-gris");
      }
      ecrire("# " + t.t, "jx-tache");
      invite.textContent = "etuciel@" + m.nom + ":~$";
      reste = m.temps * 1000; debut = Date.now();
      arreterTerminal();
      minuteur = setInterval(() => {
        const r2 = reste - (Date.now() - debut);
        barre.firstChild.style.width = Math.max(0, r2 / (m.temps * 1000) * 100) + "%";
        if (r2 <= 0) { arreterTerminal(); rate("temps écoulé"); }
      }, 100);
      majHud();
      champ.focus({ preventScroll: true });
    }
    function rate(pourquoi) {
      const m = machine(p.machine), t = m.taches[p.tache];
      ecrire("✗ " + pourquoi + ". Attendu : " + t.r[0], "jx-rouge");
      ecrire("  " + t.e, "jx-gris");
      p.vies--;
      suivante();
    }
    function suivante() {
      p.tache++;
      if (p.tache === 3) {
        p.machines++;
        ecrire("Machine " + machine(p.machine).nom + " infiltrée.", "jx-vert");
        p.machine++; p.tache = 0;
      }
      if (p.vies <= 0) return fin();
      if (officielle) garder("terminal", p);
      poser();
    }
    function fin() {
      arreterTerminal();
      p.fini = true;
      champ.disabled = true;
      ecrire("");
      ecrire("Connexion perdue. " + p.machines + " machine" + (p.machines > 1 ? "s" : "") + " infiltrée" + (p.machines > 1 ? "s" : "")
        + ", " + p.reussies + " commande" + (p.reussies > 1 ? "s" : "") + " réussie" + (p.reussies > 1 ? "s" : "") + ".", "jx-tache");
      majHud();
      if (officielle) {
        const s = memoire.stats.terminal = memoire.stats.terminal || {};
        s.record = Math.max(s.record || 0, p.reussies);
        garder("terminal", p); compter("terminal", p.machines > 0); majCartes();
      }
      montrerPied();
    }
    function montrerPied() {
      pied.innerHTML = "";
      const r2 = el("div", "jx-fin", "<p><b>" + p.machines + " machine" + (p.machines > 1 ? "s" : "") + " · " + p.reussies
        + " commande" + (p.reussies > 1 ? "s" : "") + ".</b>" + (officielle ? " Record : " + ((memoire.stats.terminal || {}).record || p.reussies) + " commandes." : "") + "</p>");
      if (officielle) r2.append(boutonPartage("Terminal du jour n° " + NUMERO + " · " + p.machines + " machines · " + p.reussies + " commandes"));
      const b = el("button", "jx-b", "S'entraîner sur une partie au hasard");
      b.type = "button";
      b.addEventListener("click", () => { scene.innerHTML = ""; arreterTerminal(); jeuTerminal(true); });
      r2.append(b);
      pied.append(r2);
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (p.fini) return;
      const m = machine(p.machine), t = m.taches[p.tache];
      const tape = normaliser(champ.value);
      champ.value = "";
      if (!tape) return;
      ecrire(invite.textContent + " " + tape);
      // Cisco ne distingue pas les majuscules ; Linux, si
      const egal = (a) => (t.d === "cisco" ? a.toLowerCase() === tape.toLowerCase() : a === tape);
      arreterTerminal();
      if (t.r.some(egal)) { ecrire("✓ accepté", "jx-vert"); p.reussies++; suivante(); }
      else rate("commande refusée");
    });
    if (p.fini) {
      ecrire("La partie du jour est jouée : " + p.machines + " machine(s), " + p.reussies + " commande(s).", "jx-tache");
      champ.disabled = true; majHud(); montrerPied();
    } else {
      const go = el("button", "jx-b jx-plein", officielle ? "Commencer la partie du jour" : "Commencer");
      go.type = "button";
      champ.disabled = true;
      go.addEventListener("click", () => { go.remove(); champ.disabled = false; poser(); });
      pied.append(go);
      majHud();
      ecrire(officielle ? "Partie du jour n° " + NUMERO + ". Prêt ?" : "Partie d'entraînement. Prêt ?", "jx-gris");
    }
  }

  /* ═══════════════ 8. La grille binaire ═════════════════════════════
     Trois règles : pas plus de deux chiffres identiques côte à côte,
     autant de 0 que de 1 sur chaque ligne et chaque colonne, et deux
     lignes (ou deux colonnes) jamais identiques. La grille du jour est
     fabriquée à partir de la graine : une grille pleine d'abord, puis on
     retire des chiffres tant que la solution reste UNIQUE (on le vérifie
     en cherchant une deuxième solution, jusqu'à preuve qu'elle n'existe
     pas). 6 × 6 en semaine, 8 × 8 le week-end. */
  function possible(g, n, i) {
    const x = i % n, y = (i - x) / n, v = g[i], h = n / 2;
    const a = (xx, yy) => (xx < 0 || yy < 0 || xx >= n || yy >= n ? -2 : g[yy * n + xx]);
    for (let d = -2; d <= 0; d++) {
      if (a(x + d, y) === v && a(x + d + 1, y) === v && a(x + d + 2, y) === v) return false;
      if (a(x, y + d) === v && a(x, y + d + 1) === v && a(x, y + d + 2) === v) return false;
    }
    let cl = 0, cc = 0, vl = 0, vc = 0;
    for (let k = 0; k < n; k++) {
      const l = g[y * n + k], c = g[k * n + x];
      if (l === v) cl++; if (c === v) cc++; if (l === -1) vl++; if (c === -1) vc++;
    }
    if (cl > h || cc > h) return false;
    const egales = (p, q, ligne) => {
      for (let k = 0; k < n; k++) {
        const u = ligne ? g[p * n + k] : g[k * n + p], w = ligne ? g[q * n + k] : g[k * n + q];
        if (u === -1 || w === -1 || u !== w) return false;
      }
      return true;
    };
    if (!vl) for (let yy = 0; yy < n; yy++) if (yy !== y && egales(y, yy, true)) return false;
    if (!vc) for (let xx = 0; xx < n; xx++) if (xx !== x && egales(x, xx, false)) return false;
    return true;
  }
  function solutions(g, n, limite) {
    const vides = [];
    for (let i = 0; i < g.length; i++) if (g[i] === -1) vides.push(i);
    let nb = 0;
    (function essayer(k) {
      if (k === vides.length) { nb++; return; }
      const i = vides[k];
      for (let v = 0; v <= 1 && nb < limite; v++) { g[i] = v; if (possible(g, n, i)) essayer(k + 1); }
      g[i] = -1;
    })(0);
    return nb;
  }
  function fabriquer(n, r) {
    const g = Array(n * n).fill(-1);
    (function remplir(i) {
      if (i === n * n) return true;
      const ordre = r() < 0.5 ? [0, 1] : [1, 0];
      for (const v of ordre) { g[i] = v; if (possible(g, n, i) && remplir(i + 1)) return true; }
      g[i] = -1;
      return false;
    })(0);
    const solution = g.slice(), grille = g.slice();
    // au moins un tiers des chiffres restent donnés : la solution reste
    // unique, et la grille se résout par raisonnement, pas à l'aveugle
    const plancher = Math.ceil(n * n / 3);
    let donnes = n * n;
    for (const i of melanger(grille.map((_, k) => k), r)) {
      if (donnes <= plancher) break;
      const v = grille[i];
      grille[i] = -1;
      if (solutions(grille.slice(), n, 2) !== 1) grille[i] = v; else donnes--;
    }
    return { solution, grille };
  }
  function jeuBinaire() {
    const n = [0, 6].includes(maintenant.getDay()) ? 8 : 6;
    const { grille } = fabriquer(n, hasard(graine(JOUR + "-binaire-" + n)));
    const p = partieDuJour("binaire") || { cases: grille.slice(), debut: 0, duree: 0, fini: false, gagne: false };
    const bloc = el("div", "jx-jeu jx-binaire");
    bloc.append(el("p", "jx-consigne", "Remplis la grille de 0 et de 1. Jamais trois chiffres identiques côte à côte, "
      + "autant de 0 que de 1 sur chaque ligne et chaque colonne, et pas deux lignes ni deux colonnes identiques. "
      + "Touche une case pour faire défiler : vide, 0, 1."));
    const plateau = el("div", "jx-plateau");
    plateau.style.setProperty("--n", n);
    plateau.setAttribute("role", "grid");
    const pied = el("div", "jx-pied");
    bloc.append(plateau, pied);
    scene.append(bloc);
    function fautes() {
      const f = new Set(), c = p.cases, h = n / 2;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = y * n + x, v = c[i];
        if (v === -1) continue;
        if (x <= n - 3 && c[i + 1] === v && c[i + 2] === v) [i, i + 1, i + 2].forEach((k) => f.add(k));
        if (y <= n - 3 && c[i + n] === v && c[i + 2 * n] === v) [i, i + n, i + 2 * n].forEach((k) => f.add(k));
      }
      for (let k = 0; k < n; k++) {
        for (const v of [0, 1]) {
          const ligne = [], col = [];
          for (let j = 0; j < n; j++) { if (c[k * n + j] === v) ligne.push(k * n + j); if (c[j * n + k] === v) col.push(j * n + k); }
          if (ligne.length > h) ligne.forEach((i) => f.add(i));
          if (col.length > h) col.forEach((i) => f.add(i));
        }
      }
      return f;
    }
    function dessiner() {
      const f = fautes();
      plateau.innerHTML = "";
      p.cases.forEach((v, i) => {
        const fixe = grille[i] !== -1;
        const b = el("button", "jx-cellule" + (fixe ? " fixe" : "") + (v === 1 ? " un" : v === 0 ? " zero" : "") + (f.has(i) ? " faute" : ""),
          v === -1 ? "" : String(v));
        b.type = "button";
        b.disabled = fixe || p.fini;
        b.setAttribute("aria-label", "Ligne " + (Math.floor(i / n) + 1) + ", colonne " + (i % n + 1) + " : "
          + (v === -1 ? "vide" : v) + (fixe ? ", donnée" : "") + (f.has(i) ? ", en faute" : ""));
        b.addEventListener("click", () => {
          if (!p.debut) p.debut = Date.now();
          p.cases[i] = v === -1 ? 0 : v === 0 ? 1 : -1;
          const pleine = p.cases.every((x) => x !== -1);
          if (pleine && !fautes().size && p.cases.every((x, k) => possible(p.cases, n, k))) {
            p.fini = true; p.gagne = true; p.duree = Math.round((Date.now() - p.debut) / 1000);
            compter("binaire", true); majCartes();
          }
          garder("binaire", p); dessiner();
        });
        plateau.append(b);
      });
      pied.innerHTML = "";
      if (p.fini) {
        const t = Math.floor(p.duree / 60) + " min " + pad(p.duree % 60);
        const r2 = el("div", "jx-fin", "<p><b>Grille résolue en " + t + ".</b></p>");
        r2.append(boutonPartage("Grille binaire n° " + NUMERO + " · " + n + "×" + n + " · " + t));
        pied.append(r2);
      } else {
        const b = el("button", "jx-b", "Tout effacer");
        b.type = "button";
        b.addEventListener("click", () => { p.cases = grille.slice(); garder("binaire", p); dessiner(); });
        pied.append(b);
      }
    }
    dessiner();
  }

  // pour le banc : les mécanismes, sans l'écran
  window.JEUX = { possible, solutions, fabriquer, noter, cleMot, duJour, graine, hasard, NUMERO, JOUR };
  ouvrir();
})();
