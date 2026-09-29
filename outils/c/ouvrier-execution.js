/* ═══════════════════════════════════════════════════════════════════════
   L'ouvrier qui EXÉCUTE le programme de l'étudiant. Rien d'autre.

   Pourquoi un deuxième ouvrier, séparé de celui qui compile : une boucle
   sans fin ne se demande pas poliment d'arrêter. Le seul moyen sûr de
   reprendre la main sur du WebAssembly parti en vrille est de supprimer le
   fil qui le porte — `worker.terminate()`. Si le compilateur vivait dans ce
   fil-là, chaque boucle sans fin coûterait le rechargement de trente
   mégaoctets de clang. Ici, tuer coûte quelques millisecondes.

   Ce fichier implémente donc à la main le peu de WASI dont un programme
   d'étudiant a besoin — quinze fonctions, pas une de plus, celles que
   `WebAssembly.Module.imports` a réellement réclamées sur des programmes
   avec stdio, fichiers, iostream, fstream, time et rand.

   Deux libertés que cela procure, et qui justifient à elles seules de ne
   pas avoir pris une bibliothèque WASI toute faite :

     · la sortie part vers la page AU FUR ET À MESURE, pas à la fin — un
       programme qui compte jusqu'à mille se regarde compter ;
     · on sait dire « le programme a voulu lire alors qu'il ne restait
       rien à lire », ce qui permet à la page de demander la saisie au bon
       moment au lieu d'exiger qu'on la prépare d'avance.

   Le module importe « wasi_unstable » (l'ancien instantané, celui que
   produit ce sysroot) : les constantes ci-dessous en viennent, pas de
   snapshot_preview1 dont la numérotation diffère.
   ═══════════════════════════════════════════════════════════════════════ */
"use strict";

/* ── codes d'erreur, tirés de include/wasi/core.h du sysroot ───────────── */
const OK = 0, EBADF = 8, EEXIST = 20, EINVAL = 28, EISDIR = 31,
      ENOENT = 44, ENOSYS = 52, ENOTDIR = 54, ESPIPE = 70;
const WHENCE_CUR = 0, WHENCE_END = 1, WHENCE_SET = 2;
const O_CREAT = 0x1, O_DIRECTORY = 0x2, O_EXCL = 0x4, O_TRUNC = 0x8;
const FDFLAG_APPEND = 0x1;
const DROIT_LIRE = 0x2, DROIT_ECRIRE = 0x40;
const FICHIER_CARACTERE = 2, FICHIER_DOSSIER = 3, FICHIER_ORDINAIRE = 4;

/* Le programme s'arrête : ce n'est pas une panne, c'est un exit(). */
class Sortie extends Error { constructor(code) { super("exit " + code); this.code = code; } }
/* Garde-fou : un programme qui écrit sans fin remplirait la page. */
class TropEcrit extends Error {}
/* Le programme réclame une saisie qu'on n'a pas encore. Ce n'est ni une
   panne ni une fin : on suspend ici, et la page va demander. */
class Attente extends Error {}

const ENCODEUR = new TextEncoder();
const PLAFOND_SORTIE = 4 * 1024 * 1024;

/* ══════════════════════════════════════════════════════ petit système de
   fichiers en mémoire. fopen("notes.txt","w") doit marcher : les TP de
   deuxième année lisent et écrivent des fichiers, et un outil qui s'arrête
   avant ce chapitre ne sert plus à rien à ce moment-là. */
class Disque {
  constructor(depart) {
    this.fichiers = new Map();
    for (const [nom, contenu] of Object.entries(depart || {}))
      this.fichiers.set(this.propre(nom), ENCODEUR.encode(contenu));
  }
  propre(nom) { return String(nom).replace(/^\.\//, "").replace(/^\/+/, ""); }
  lire(nom) { return this.fichiers.get(this.propre(nom)); }
  poser(nom, octets) { this.fichiers.set(this.propre(nom), octets); }
  existe(nom) { return this.fichiers.has(this.propre(nom)); }
}

class Machine {
  constructor(opts) {
    this.disque = new Disque(opts.fichiers);
    this.entree = ENCODEUR.encode(opts.entree || "");
    this.entreePos = 0;
    this.entreeEpuisee = false;
    /* Vrai quand l'étudiant a déclaré qu'il n'y aurait plus rien à taper :
       le programme reçoit alors une vraie fin de fichier, et les boucles du
       genre « while (scanf(…) == 1) » peuvent enfin sortir. */
    this.finEntree = !!opts.finEntree;
    this.emettre = opts.emettre;           // (message) => void
    this.args = ["programme"];

    /* Table des descripteurs. 0/1/2 sont les trois flux ; 3 est le dossier
       de travail pré-ouvert, sans lequel WASI refuse tout path_open. */
    this.fds = [
      { genre: "flux", quoi: 0 }, { genre: "flux", quoi: 1 }, { genre: "flux", quoi: 2 },
      { genre: "dossier", nom: "." },
    ];

    this.tampons = { 1: [], 2: [] };
    this.taille = { 1: 0, 2: 0 };
    this.dernierEnvoi = Date.now();
    this.ecrits = 0;
    this.decodeurs = { 1: new TextDecoder("utf-8"), 2: new TextDecoder("utf-8") };
    this.resteGarde = "";
  }

  lier(instance) {
    this.memoire = instance.exports.memory;
    this.vue = new DataView(this.memoire.buffer);
    this.u8 = new Uint8Array(this.memoire.buffer);
  }
  /* La mémoire d'un module grandit : toute vue prise avant un memory.grow
     est détachée. On la reprend avant chaque accès — c'est bon marché. */
  frais() {
    if (this.u8.byteLength === 0 || this.u8.buffer !== this.memoire.buffer) {
      this.vue = new DataView(this.memoire.buffer);
      this.u8 = new Uint8Array(this.memoire.buffer);
    }
    return this;
  }
  u32(o) { return this.frais().vue.getUint32(o, true); }
  metU32(o, v) { this.frais().vue.setUint32(o, v, true); }
  metU64(o, v) { this.frais().vue.setBigUint64(o, BigInt(v), true); }
  chaine(o, n) { return new TextDecoder("utf-8").decode(this.frais().u8.subarray(o, o + n)); }

  /* ── sortie ──────────────────────────────────────────────────────────
     Regroupée : un printf non tamponné écrit parfois caractère par
     caractère, et un postMessage par caractère met la page à genoux. On
     envoie dès qu'il y a de quoi voir, ou dès qu'il s'est passé 50 ms. */
  ecrire(fd, octets) {
    this.ecrits += octets.length;
    if (this.ecrits > PLAFOND_SORTIE) throw new TropEcrit();
    this.tampons[fd].push(octets);
    this.taille[fd] += octets.length;
    if (this.taille[fd] >= 4096 || Date.now() - this.dernierEnvoi >= 50) this.vider(fd);
  }
  vider(fd) {
    const bouts = this.tampons[fd];
    if (!bouts.length) return;
    const tout = new Uint8Array(this.taille[fd]);
    let d = 0;
    for (const b of bouts) { tout.set(b, d); d += b.length; }
    this.tampons[fd] = []; this.taille[fd] = 0;
    this.dernierEnvoi = Date.now();
    const texte = this.decodeurs[fd].decode(tout, { stream: true });
    if (fd === 2) this.demeler(texte); else if (texte) this.emettre({ t: "sortie", texte });
  }
  viderTout() { this.vider(1); this.vider(2); if (this.resteGarde) { this.emettre({ t: "sortie", texte: this.resteGarde }); this.resteGarde = ""; } }

  /* Les gardes d'exécution (garde.c) écrivent sur stderr des lignes
     encadrées par \x1e. Tout le reste de stderr appartient au programme et
     doit s'afficher tel quel — un étudiant a le droit d'écrire sur stderr. */
  demeler(texte) {
    let t = this.resteGarde + texte;
    this.resteGarde = "";
    let sortie = "";
    while (true) {
      const d = t.indexOf("\x1e");
      if (d < 0) { sortie += t; t = ""; break; }
      sortie += t.slice(0, d);
      const f = t.indexOf("\x1e", d + 1);
      if (f < 0) { this.resteGarde = t.slice(d); break; }   // trame incomplète
      const champs = t.slice(d + 1, f).split("\x1f");
      if (champs[0] === "GARDE")
        this.emettre({ t: "garde", genre: champs[1], fichier: champs[2],
                       ligne: +champs[3], colonne: +champs[4], detail: champs[5] || "" });
      t = t.slice(f + 1).replace(/^\n/, "");
    }
    if (sortie) this.emettre({ t: "sortie", texte: sortie, erreur: true });
  }

  /* ── les quinze fonctions WASI ───────────────────────────────────── */
  imports() {
    const m = this;
    return {
      proc_exit(code) { m.viderTout(); throw new Sortie(code); },

      fd_write(fd, iovs, n, ecrit_ptr) {
        if (fd !== 1 && fd !== 2) {
          const e = m.fds[fd];
          if (!e || e.genre !== "fichier" || !e.ecriture) return EBADF;
        }
        let total = 0;
        const bouts = [];
        for (let i = 0; i < n; i++) {
          const p = m.u32(iovs + i * 8), l = m.u32(iovs + i * 8 + 4);
          bouts.push(m.frais().u8.slice(p, p + l));
          total += l;
        }
        if (fd === 1 || fd === 2) for (const b of bouts) m.ecrire(fd, b);
        else {
          const e = m.fds[fd];
          for (const b of bouts) { e.ecrireOctets(b); }
        }
        m.metU32(ecrit_ptr, total);
        return OK;
      },

      fd_read(fd, iovs, n, lu_ptr) {
        let total = 0;
        for (let i = 0; i < n; i++) {
          const p = m.u32(iovs + i * 8), l = m.u32(iovs + i * 8 + 4);
          if (l === 0) continue;
          let src, pos;
          if (fd === 0) { src = m.entree; pos = m.entreePos; }
          else {
            const e = m.fds[fd];
            if (!e || e.genre !== "fichier" || !e.lecture) return EBADF;
            src = e.octets; pos = e.pos;
          }
          const combien = Math.min(l, src.length - pos);
          if (combien <= 0) {
            /* Plus rien à lire sur l'entrée clavier. Deux conduites, et la
               différence compte beaucoup pour celui qui apprend :

               · si la saisie n'est pas close, on ARRÊTE ICI et on demande.
                 Laisser le programme continuer avec une fin de fichier lui
                 fait afficher les ordures d'une variable jamais remplie —
                 c'est-à-dire répondre avant d'avoir posé la question, ce
                 qu'aucun terminal ne fait. Mesuré : le tout premier essai
                 affichait « -1431655766 + -1431655766 » et un faux
                 dépassement de capacité, avant même de proposer de taper ;

               · si elle est close (bouton « Fin de saisie »), on rend une
                 vraie fin de fichier, et « while (scanf(…) == 1) » sort. */
            if (fd === 0 && !m.finEntree) {
              m.viderTout();
              m.entreeEpuisee = true;
              m.emettre({ t: "attente" });
              throw new Attente();
            }
            if (fd === 0) m.entreeEpuisee = true;
            break;
          }
          m.frais().u8.set(src.subarray(pos, pos + combien), p);
          if (fd === 0) m.entreePos += combien; else m.fds[fd].pos += combien;
          total += combien;
          if (combien < l) break;
        }
        m.metU32(lu_ptr, total);
        return OK;
      },

      fd_close(fd) {
        const e = m.fds[fd];
        if (!e) return EBADF;
        if (e.genre === "fichier" && e.ecriture) e.enregistrer();
        if (fd > 3) m.fds[fd] = null;
        return OK;
      },

      fd_seek(fd, decalage, depuis, ou_ptr) {
        if (fd <= 2) return ESPIPE;             // un flux ne se déplace pas
        const e = m.fds[fd];
        if (!e || e.genre !== "fichier") return EBADF;
        const d = Number(decalage);
        const base = depuis === WHENCE_SET ? 0 : depuis === WHENCE_CUR ? e.pos : e.octets.length;
        const n = base + d;
        if (n < 0) return EINVAL;
        e.pos = n;
        m.metU64(ou_ptr, n);
        return OK;
      },

      fd_fdstat_get(fd, buf) {
        const e = m.fds[fd];
        if (!e) return EBADF;
        const genre = e.genre === "flux" ? FICHIER_CARACTERE
                    : e.genre === "dossier" ? FICHIER_DOSSIER : FICHIER_ORDINAIRE;
        m.frais().vue.setUint8(buf, genre);
        m.vue.setUint16(buf + 2, e.ajout ? FDFLAG_APPEND : 0, true);
        m.metU64(buf + 8, 0xFFFFFFFFn);        // tous droits : bac à sable de toute façon
        m.metU64(buf + 16, 0xFFFFFFFFn);
        return OK;
      },
      fd_fdstat_set_flags() { return OK; },

      fd_prestat_get(fd, buf) {
        if (fd !== 3) return EBADF;             // un seul dossier pré-ouvert
        m.frais().vue.setUint8(buf, 0);         // type « dossier »
        m.metU32(buf + 4, 1);                   // longueur du nom : "."
        return OK;
      },
      fd_prestat_dir_name(fd, ptr, len) {
        if (fd !== 3 || len < 1) return EBADF;
        m.frais().u8[ptr] = 46;                 // '.'
        return OK;
      },

      path_open(dirfd, _dirflags, chemin, chemin_len, oflags,
                droits, _droits_herites, fdflags, fd_ptr) {
        if (dirfd !== 3) return EBADF;
        const nom = m.chaine(chemin, chemin_len);
        if (oflags & O_DIRECTORY) return ENOTDIR;
        const d = BigInt(droits);
        const lecture = (d & BigInt(DROIT_LIRE)) !== 0n;
        const ecriture = (d & BigInt(DROIT_ECRIRE)) !== 0n;
        const existe = m.disque.existe(nom);
        if (!existe && !(oflags & O_CREAT)) return ENOENT;
        if (existe && (oflags & O_EXCL)) return EEXIST;
        let octets = existe && !(oflags & O_TRUNC) ? m.disque.lire(nom) : new Uint8Array(0);
        const ajout = !!(fdflags & FDFLAG_APPEND);
        const e = {
          genre: "fichier", nom, octets, pos: ajout ? octets.length : 0,
          lecture, ecriture, ajout,
          ecrireOctets(b) {
            const p = this.ajout ? this.octets.length : this.pos;
            const fin = Math.max(this.octets.length, p + b.length);
            if (fin > this.octets.length) {
              const n = new Uint8Array(fin); n.set(this.octets); this.octets = n;
            }
            this.octets.set(b, p);
            this.pos = p + b.length;
          },
          enregistrer() { m.disque.poser(this.nom, this.octets); },
        };
        if (oflags & O_TRUNC) e.enregistrer();
        let fd = m.fds.indexOf(null);
        if (fd < 0) fd = m.fds.length;
        m.fds[fd] = e;
        m.metU32(fd_ptr, fd);
        return OK;
      },

      environ_sizes_get(n_ptr, taille_ptr) { m.metU32(n_ptr, 0); m.metU32(taille_ptr, 0); return OK; },
      environ_get() { return OK; },
      args_sizes_get(n_ptr, taille_ptr) {
        m.metU32(n_ptr, m.args.length);
        m.metU32(taille_ptr, m.args.reduce((s, a) => s + ENCODEUR.encode(a).length + 1, 0));
        return OK;
      },
      args_get(ptrs, tampon) {
        let d = tampon;
        m.args.forEach((a, i) => {
          const o = ENCODEUR.encode(a);
          m.metU32(ptrs + i * 4, d);
          m.frais().u8.set(o, d); m.u8[d + o.length] = 0;
          d += o.length + 1;
        });
        return OK;
      },
      clock_time_get(_id, _precision, ptr) { m.metU64(ptr, BigInt(Date.now()) * 1000000n); return OK; },
      clock_res_get(_id, ptr) { m.metU64(ptr, 1000000n); return OK; },
      random_get(ptr, len) {
        const t = new Uint8Array(len);
        crypto.getRandomValues(t);
        m.frais().u8.set(t, ptr);
        return OK;
      },
      poll_oneoff() { return ENOSYS; },
      fd_sync() { return OK; },
      fd_datasync() { return OK; },
      fd_filestat_get() { return ENOSYS; },
      path_filestat_get() { return ENOSYS; },
      path_unlink_file(dirfd, chemin, len) {
        if (dirfd !== 3) return EBADF;
        return m.disque.fichiers.delete(m.disque.propre(m.chaine(chemin, len))) ? OK : ENOENT;
      },
    };
  }
}

/* ═══════════════════════════════════════════════════════════════ lancement */
self.onmessage = async (e) => {
  const { wasm, entree, fichiers, finEntree } = e.data;
  const machine = new Machine({ entree, fichiers, finEntree,
                                emettre: (msg) => self.postMessage(msg) });
  const debut = Date.now();
  let code = 0, panne = null, attente = false;
  try {
    const module = await WebAssembly.compile(wasm);
    const instance = await WebAssembly.instantiate(module, {
      wasi_unstable: machine.imports(),
      /* Le sysroot expose aussi un « canvas » ; aucun programme de cours ne
         s'en sert, mais un import manquant empêcherait l'instanciation. */
      env: new Proxy({}, { get: () => () => 0 }),
    });
    machine.lier(instance);
    try {
      instance.exports._start();
    } catch (err) {
      if (err instanceof Sortie) code = err.code;
      else if (err instanceof Attente) { machine.viderTout(); attente = true; }
      else if (err instanceof TropEcrit) {
        machine.viderTout();
        panne = { genre: "trop-ecrit",
          message: "Le programme a écrit plus de 4 Mo. Il tourne probablement sans fin." };
      } else {
        machine.viderTout();
        panne = { genre: "piege", message: String(err && err.message || err) };
      }
    }
  } catch (err) {
    panne = { genre: "instanciation", message: String(err && err.message || err) };
  }
  machine.viderTout();
  const sortis = {};
  for (const [nom, octets] of machine.disque.fichiers)
    sortis[nom] = new TextDecoder("utf-8").decode(octets);
  self.postMessage({ t: "fini", code, panne, attente,
                     ms: Date.now() - debut, fichiers: sortis });
};
