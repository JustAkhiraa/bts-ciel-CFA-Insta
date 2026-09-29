/* ═══════════════════════════════════════════════════════════════════════
   L'ouvrier qui COMPILE. Il détient clang et lld, et ne les lâche jamais.

   Il vit tout le temps que dure la page : recharger trente mégaoctets de
   compilateur à chaque exécution serait absurde. C'est pour cela que
   l'exécution du programme de l'étudiant se passe AILLEURS, dans un ouvrier
   jetable qu'on peut supprimer sans conséquence (ouvrier-execution.js).

   Ce qu'il ajoute à ce que fait un gcc ordinaire, et pourquoi :

     -Wall -Wextra          les avertissements, qui disent la faute AVANT
                            qu'elle ne se manifeste. Par défaut clang se tait.
     -fsanitize=…           l'instrumentation qui fait que le programme se
                            dénonce lui-même à l'exécution : case hors du
                            tableau, division par zéro, pointeur nul. Les
                            gestionnaires sont dans garde.c, compilé d'avance.
     -fsanitize-recover=…   … et qu'il CONTINUE après l'avoir dit. Un étudiant
                            veut voir les trois fautes de son programme, pas la
                            première puis un écran noir.
     -ftrivial-auto-var-init=pattern
                            une variable jamais initialisée vaut toujours
                            -1431655766, jamais un nombre au hasard. La faute
                            devient reproductible — donc explicable — au lieu
                            de « ça marche sur mon PC ».
     -fdiagnostics-print-source-range-info
                            chaque diagnostic donne l'étendue exacte de ce
                            qu'il vise, ce qui permet de la souligner dans
                            l'éditeur au lieu de pointer une ligne entière.

   Le mode « strict » peut être coupé : l'instrumentation ralentit un peu et
   change la sortie de certains programmes volontairement limites.
   ═══════════════════════════════════════════════════════════════════════ */
"use strict";

self.importScripts("shared.js");

/* Tailles décompressées, pour une barre de progression honnête : le serveur
   annonce la taille compressée, le lecteur rend des octets décompressés. */
const MORCEAUX = [
  { nom: "memfs",       octets:   345442, quoi: "système de fichiers" },
  { nom: "sysroot.tar", octets:  9297920, quoi: "bibliothèque standard" },
  { nom: "clang",       octets: 31214472, quoi: "compilateur" },
  { nom: "lld",         octets: 19490094, quoi: "éditeur de liens" },
];
const TOTAL = MORCEAUX.reduce((s, m) => s + m.octets, 0);

const CONTROLES = [
  "array-bounds", "null", "object-size", "integer-divide-by-zero",
  "float-divide-by-zero", "signed-integer-overflow", "shift-base",
  "shift-exponent", "vla-bound", "bool", "enum", "float-cast-overflow",
  "builtin", "pointer-overflow", "nonnull-attribute", "alignment",
].join(",");

/* Ce que binji code en dur dans shared.js, remis à plat ici : c'est la seule
   façon de choisir -x c plutôt que -x c++, et le -std qui va avec. */
const COMMUNS = [
  "-disable-free", "-isysroot", "/",
  "-internal-isystem", "/include/c++/v1",
  "-internal-isystem", "/include",
  "-internal-isystem", "/lib/clang/8.0.1/include",
  "-ferror-limit", "25",
  "-fmessage-length", "0",
  "-fno-color-diagnostics",
  "-fno-caret-diagnostics",
  "-fdiagnostics-print-source-range-info",
];

let api = null, recolte = "", recus = 0, pret = false;

const dire = (m) => self.postMessage(m);

/* ── téléchargement avec progression ────────────────────────────────────
   On lit le corps par morceaux plutôt que d'attendre response.arrayBuffer() :
   dix-neuf mégaoctets sans un signe de vie, c'est une page qu'on croit
   plantée et qu'on ferme. */
async function recuperer(nom, taille, quoi) {
  dire({ t: "progres", recus, total: TOTAL, quoi });
  const r = await fetch(nom);
  if (!r.ok) throw new Error("téléchargement de « " + nom + " » : " + r.status);
  if (!r.body) { const b = await r.arrayBuffer(); recus += b.byteLength; return b; }
  const lecteur = r.body.getReader();
  const bouts = [];
  let n = 0, dernier = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    bouts.push(value);
    n += value.length;
    recus += value.length;
    if (Date.now() - dernier > 120) {
      dernier = Date.now();
      dire({ t: "progres", recus, total: TOTAL, quoi });
    }
  }
  const tout = new Uint8Array(n);
  let d = 0;
  for (const b of bouts) { tout.set(b, d); d += b.length; }
  return tout.buffer;
}

const cache = new Map();
async function bufferDe(nom) {
  if (!cache.has(nom)) {
    const m = MORCEAUX.find((x) => x.nom === nom) || { octets: 0, quoi: nom };
    cache.set(nom, await recuperer(nom, m.octets, m.quoi));
  }
  return cache.get(nom);
}

async function demarrer() {
  api = new API({
    readBuffer: bufferDe,
    compileStreaming: async (nom) => WebAssembly.compile(await bufferDe(nom)),
    hostWrite: (s) => { recolte += s; },
  });
  await api.ready;                       // memfs + sysroot déballé

  /* clang et lld compilés tout de suite : ces quelques secondes se passent
     pendant que l'étudiant écrit son premier programme, pas quand il appuie
     sur « Exécuter ». */
  dire({ t: "progres", recus, total: TOTAL, quoi: "compilateur" });
  await api.getModule("clang");
  dire({ t: "phase", quoi: "préparation" });
  await api.getModule("lld");

  /* Les gardes d'exécution, compilés d'avance et livrés en objet. */
  const garde = new Uint8Array(await bufferDe("garde.o"));
  api.memfs.addFile("garde.o", garde);

  pret = true;
  dire({ t: "pret" });
}

/* ── lecture des diagnostics de clang ───────────────────────────────────
   Format demandé plus haut, donc stable et analysable :
     prog.c:6:21:{6:21-6:24}{6:11-6:13}: warning: le message
   Les « note: » qui suivent appartiennent au diagnostic précédent — ce sont
   les phrases qui disent quoi faire, et les séparer les rendrait orphelines. */
/* L'étendue de source est FACULTATIVE, et le deux-points qui la suit avec
   elle. clang écrit « p.c:4:15:{4:15-4:26}: warning: … » quand il sait
   désigner une expression, et « p.c:6:28: error: expected ';' » quand il ne
   sait pas — ce qui est le cas de presque toutes les fautes de syntaxe.

   La première version de ce motif exigeait ce second deux-points : elle
   rejetait donc EN SILENCE le point-virgule oublié, l'accolade non fermée
   et le nom inconnu — les trois erreurs les plus fréquentes du premier
   semestre. Aucune carte ne s'affichait, et l'outil se contentait de dire
   « le programme ne compile pas » sans dire pourquoi.

   Trouvé en mesurant la couverture des traductions : 54 programmes sur 73
   ne produisaient « aucun diagnostic », ce qui était impossible. Un chiffre
   invraisemblable accuse d'abord celui qui compte. */
const LIGNE = /^(.+?):(\d+):(\d+):(?:((?:\{\d+:\d+-\d+:\d+\})+):)?\s*(fatal error|error|warning|note):\s*(.*)$/;
const SANS_LIEU = /^(?:clang|wasm-ld|.*?):?\s*(fatal error|error|warning):\s*(.*)$/;

function etendues(txt) {
  const r = [];
  for (const m of txt.matchAll(/\{(\d+):(\d+)-(\d+):(\d+)\}/g))
    r.push({ l1: +m[1], c1: +m[2], l2: +m[3], c2: +m[4] });
  return r;
}

function lireDiagnostics(brut) {
  const liste = [];
  for (const ligne of brut.split("\n")) {
    const t = ligne.trim();
    if (!t) continue;
    if (/^\d+ (warning|error)s? (and \d+ errors? )?generated\.$/.test(t)) continue;
    if (/^Error: process exited with code/.test(t)) continue;
    let m = LIGNE.exec(t);
    if (m) {
      const d = { fichier: m[1], ligne: +m[2], colonne: +m[3],
                  etendues: etendues(m[4] || ""), niveau: m[5], message: m[6], notes: [] };
      if (d.niveau === "note" && liste.length) liste[liste.length - 1].notes.push(d);
      else liste.push(d);
      continue;
    }
    m = SANS_LIEU.exec(t);
    if (m) liste.push({ fichier: null, ligne: 0, colonne: 0, etendues: [],
                        niveau: m[1], message: m[2], notes: [] });
    else if (liste.length) liste[liste.length - 1].notes.push(
      { niveau: "note", message: t, ligne: 0, colonne: 0, etendues: [], notes: [] });
  }
  return liste;
}

/* ── construire ─────────────────────────────────────────────────────── */
async function batir({ source, langue, strict }) {
  const debut = Date.now();
  const cpp = langue === "c++";
  const nom = cpp ? "prog.cpp" : "prog.c";

  api.memfs.addFile(nom, new TextEncoder().encode(source));

  const options = [
    "-Wall", "-Wextra", "-Wshadow", "-Wconditional-uninitialized",
    "-O1", "-std=" + (cpp ? "c++17" : "c11"), "-x", cpp ? "c++" : "c",
    "-ftrivial-auto-var-init=pattern",
  ];
  if (strict) options.push("-fsanitize=" + CONTROLES, "-fsanitize-recover=" + CONTROLES);

  recolte = "";
  let code = 0;
  try {
    await api.run(await api.getModule("clang"), "clang", "-cc1", "-emit-obj",
                  ...COMMUNS, ...options, "-o", "prog.o", nom);
  } catch (e) { code = e && e.code != null ? e.code : 1; }
  const diagnostics = lireDiagnostics(recolte);
  if (code) return { t: "bati", ok: false, diagnostics, ms: Date.now() - debut };

  recolte = "";
  try {
    await api.run(await api.getModule("lld"), "wasm-ld", "--no-threads",
      "--export-dynamic", "-z", "stack-size=8388608", "-Llib/wasm32-wasi",
      "lib/wasm32-wasi/crt1.o", "prog.o", "garde.o",
      "-lc", "-lc++", "-lc++abi", "-lcanvas",
      "-L/lib/clang/8.0.1/lib/wasi", "-lclang_rt.builtins-wasm32",
      "-o", "prog.wasm");
  } catch (e) { code = e && e.code != null ? e.code : 1; }
  if (code) {
    return { t: "bati", ok: false, ms: Date.now() - debut,
             diagnostics: diagnostics.concat(lireDiagnostics(recolte)) };
  }

  /* Copie détachée : la mémoire de memfs bouge sous les pieds de la vue. */
  const vue = api.memfs.getFileContents("prog.wasm");
  const wasm = new Uint8Array(vue.length);
  wasm.set(vue);
  return { t: "bati", ok: true, diagnostics, wasm: wasm.buffer, ms: Date.now() - debut };
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.t === "demarrer") { await demarrer(); return; }
    if (msg.t === "batir") {
      if (!pret) { dire({ t: "bati", ok: false, jeton: msg.jeton, pasPret: true,
                          diagnostics: [] }); return; }
      const r = await batir(msg);
      r.jeton = msg.jeton;
      dire(r, r.wasm ? [r.wasm] : []);
    }
  } catch (err) {
    dire({ t: "panne", jeton: msg.jeton,
           message: String((err && err.message) || err) });
  }
};
