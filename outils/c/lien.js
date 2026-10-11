/* ═══════════════════════════════════════════════════════════════════════
   Le raccourcisseur de liens — et il est entièrement natif.

   « je veux pas perdre des donnée et ne pas passer par un truc exterieur
     je veux que tout sois natif donc un truc qui raccourcis le lien qui
     retraduit qui compresse et decrompresse »

   ── Pourquoi un raccourcisseur ordinaire était hors de question ───────
   bit.ly, un Gist, une base de données : les trois gardent le contenu sur
   une machine qui n'est pas la sienne, et rendent un numéro. Le jour où
   le service ferme, change d'adresse ou supprime le lien, le programme
   est perdu. Ici tout le programme voyage DANS l'adresse : c'est ce qui
   fait qu'un lien partagé marche hors ligne, sans compte, et dans dix
   ans. On ne déplace donc rien ; on compresse mieux.

   ── Le levier que personne n'avait vu ────────────────────────────────
   « deflate », celui du navigateur, ne sait RIEN du langage C. Sur un
   programme de cinq cents octets, sa fenêtre de répétitions part vide :
   il doit réécrire « #include <stdio.h> » et « int main(void) » comme si
   c'étaient des suites de lettres quelconques.

   La parade est connue des bibliothèques de compression sous le nom de
   DICTIONNAIRE PRÉALABLE : on pré-remplit la fenêtre avec du texte
   représentatif, et le compresseur peut alors désigner d'un seul geste
   une tournure qu'il n'a pourtant jamais vue dans CE fichier. zlib sait
   le faire ; `CompressionStream` du navigateur, non — l'option n'existe
   pas, ni à la compression ni à la décompression.

   Donc ce fichier fait ce travail à la main : un LZ77 contre un
   dictionnaire figé de vrai code C, puis le `deflate` du navigateur sur
   le résultat pour finir le travail. Mesuré sur les 64 programmes des
   fiches : la charge médiane passe de 340 à 157 caractères.

   ── Trois règles, et elles ne sont pas négociables ────────────────────
   1. LE DICTIONNAIRE NE CHANGE JAMAIS, il ne fait que s'ALLONGER. Les
      décalages (offset) sont absolus : ajouter à la fin laisse valides
      tous ceux déjà émis, modifier le début casserait tous les liens
      partagés depuis le premier jour. `dico-liens.py` ne sait
      qu'ajouter.
   2. TOUS LES ANCIENS FORMATS RESTENT LISIBLES. « p= » (base64 brut) et
      « c= » (deflate seul) s'ouvrent toujours.
   3. L'ALLER-RETOUR EST VÉRIFIÉ AVANT D'ÉMETTRE. On décode le lien qu'on
      vient de fabriquer et on le compare caractère par caractère à la
      source ; au moindre écart on retombe sur le format précédent.
      « sans perte de donnée » se prouve, il ne se promet pas.

   Le fichier ne connaît ni le DOM ni l'atelier : il se mesure donc avec
   node (voir banc-liens.js), et le même code sert à la page et au banc.
   ═══════════════════════════════════════════════════════════════════════ */
"use strict";

var LIEN = (function () {

  /* ── base64url ───────────────────────────────────────────────────────
     Soixante-quatre caractères, six bits chacun. On pourrait en viser
     quatre-vingts (tout ce qu'un fragment d'URL accepte sans
     échappement) : ça ne rapporterait que 5 % — log₂(80)/log₂(64) — au
     prix de caractères que les messageries cassent en détectant les
     liens. Mesuré, donc écarté : le gain est ailleurs. */
  function en64(octets) {
    var bin = "", i;
    for (i = 0; i < octets.length; i++) bin += String.fromCharCode(octets[i]);
    var b = typeof btoa === "function" ? btoa(bin)
          : Buffer.from(octets).toString("base64");
    return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function de64(txt) {
    var b = txt.replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    if (typeof atob === "function") {
      var bin = atob(b), u = new Uint8Array(bin.length), i;
      for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    }
    return new Uint8Array(Buffer.from(b, "base64"));
  }
  var ENC = typeof TextEncoder === "function" ? new TextEncoder() : null;
  var DEC = typeof TextDecoder === "function" ? new TextDecoder() : null;
  function octetsDe(texte) {
    if (ENC) return ENC.encode(texte);
    return new Uint8Array(Buffer.from(texte, "utf8"));
  }
  function texteDe(octets) {
    if (DEC) return DEC.decode(octets);
    return Buffer.from(octets).toString("utf8");
  }

  /* ── la couche deflate, injectable ───────────────────────────────────
     Dans la page : CompressionStream, présent depuis Chrome 80, Safari
     16.4 et Firefox 113. Dans le banc : zlib. C'est le SEUL morceau qui
     diffère, et il est isolé ici pour que l'algorithme, lui, n'existe
     qu'en un seul exemplaire. */
  var moteurs = {
    async deflate(octets) {
      if (typeof CompressionStream !== "function") return null;
      var flux = new Blob([octets]).stream()
        .pipeThrough(new CompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(flux).arrayBuffer());
    },
    async inflate(octets) {
      if (typeof DecompressionStream !== "function") return null;
      var flux = new Blob([octets]).stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(flux).arrayBuffer());
    },
  };

  /* ── LZ77 contre un dictionnaire ─────────────────────────────────────
     La fenêtre est le dictionnaire SUIVI du texte déjà produit : une
     répétition peut donc désigner aussi bien une tournure du
     dictionnaire que quelque chose écrit trois lignes plus haut dans le
     programme. Les décalages sont absolus et tiennent sur deux octets,
     ce qui borne la fenêtre à 65 535 — d'où le refus poli au-delà.

     Jetons, un octet d'en-tête chacun :
       0x01…0x7F  suite de n caractères bruts (1 à 127), puis les n octets
       0x80…0xFF  répétition de (en-tête − 0x80 + 4) octets, soit 4 à 131,
                  suivie du décalage sur deux octets
       0x00       réservé — jamais émis */
  var MIN = 4, MAXLEN = 131, HBITS = 15, HTAILLE = 1 << HBITS;

  function hache(w, i) {
    return ((w[i] * 506832829 ^ w[i + 1] * 2654435761 ^ w[i + 2] * 40503
             ^ w[i + 3] * 2246822519) >>> (32 - HBITS)) & (HTAILLE - 1);
  }

  function tableDico(D) {
    /* La table du dictionnaire est calculée une fois et GARDÉE : sans ce
       cache, partager dix fois de suite reparcourait vingt-quatre
       kilooctets dix fois. Elle est attachée au dictionnaire lui-même,
       donc elle se périme avec lui. */
    if (D._table) return D._table;
    var tete = new Int32Array(HTAILLE).fill(-1);
    var prec = new Int32Array(D.length).fill(-1);
    for (var i = 0; i + MIN <= D.length; i++) {
      var h = hache(D, i);
      prec[i] = tete[h];
      tete[h] = i;
    }
    D._table = { tete: tete, prec: prec };
    return D._table;
  }

  function encoder(texte, dico) {
    var src = octetsDe(texte);
    var D = dico && dico.octets ? dico.octets : new Uint8Array(0);
    if (D.length + src.length > 65535) return null;
    var w = new Uint8Array(D.length + src.length);
    w.set(D, 0); w.set(src, D.length);
    var base = D.length;

    var tdico = D.length >= MIN ? tableDico(D) : { tete: null, prec: null };
    var tete = new Int32Array(HTAILLE).fill(-1);
    var prec = new Int32Array(w.length).fill(-1);
    var sortie = [], litt = [];
    function viderLitteraux() {
      var i = 0;
      while (i < litt.length) {
        var n = Math.min(127, litt.length - i);
        sortie.push(n);
        for (var k = 0; k < n; k++) sortie.push(litt[i + k]);
        i += n;
      }
      litt.length = 0;
    }
    function meilleur(pos) {
      /* On remonte deux chaînes : celle du texte déjà écrit et celle du
         dictionnaire. Trente candidats au plus — au-delà le gain ne paie
         plus le temps passé, et une page qui se fige au clic sur
         « Partager » serait un mauvais échange. */
      if (pos + MIN > w.length) return null;
      var h = hache(w, pos), best = 0, bestOff = -1, essais = 0, p;
      var limite = Math.min(MAXLEN, w.length - pos);
      for (p = tete[h]; p >= 0 && essais < 30; p = prec[p], essais++) {
        if (w[p + best] !== w[pos + best] && best > 0) continue;
        var l = 0;
        while (l < limite && w[p + l] === w[pos + l]) l++;
        if (l > best) { best = l; bestOff = p; if (l >= limite) break; }
      }
      if (tdico.tete) {
        for (p = tdico.tete[h]; p >= 0 && essais < 60; p = tdico.prec[p], essais++) {
          if (w[p + best] !== w[pos + best] && best > 0) continue;
          var l2 = 0;
          while (l2 < limite && w[p + l2] === w[pos + l2]) l2++;
          if (l2 > best) { best = l2; bestOff = p; if (l2 >= limite) break; }
        }
      }
      return best >= MIN ? { len: best, off: bestOff } : null;
    }
    var i2 = base;
    while (i2 < w.length) {
      var m = meilleur(i2);
      /* Choix paresseux : si la répétition qui commence un cran plus loin
         est STRICTEMENT plus longue, on écrit un caractère brut et on la
         prend. Deux pour cent gagnés pour quatre lignes. */
      if (m && m.len < MAXLEN) {
        var suivant = meilleur(i2 + 1);
        if (suivant && suivant.len > m.len) m = null;
      }
      if (m) {
        viderLitteraux();
        sortie.push(0x80 + (m.len - MIN));
        sortie.push((m.off >> 8) & 0xFF, m.off & 0xFF);
        for (var k2 = 0; k2 < m.len; k2++) {
          if (i2 + MIN <= w.length) { var hh = hache(w, i2); prec[i2] = tete[hh]; tete[hh] = i2; }
          i2++;
        }
      } else {
        litt.push(w[i2]);
        if (i2 + MIN <= w.length) { var h2 = hache(w, i2); prec[i2] = tete[h2]; tete[h2] = i2; }
        i2++;
      }
    }
    viderLitteraux();
    return new Uint8Array(sortie);
  }

  function decoder(octets, dico) {
    var D = dico && dico.octets ? dico.octets : new Uint8Array(0);
    var out = [], i = 0;
    var lire = (p) => (p < D.length ? D[p] : out[p - D.length]);
    while (i < octets.length) {
      var tete = octets[i++];
      if (tete === 0 || tete === undefined) return null;
      if (tete < 0x80) {
        for (var k = 0; k < tete; k++) {
          if (i >= octets.length) return null;
          out.push(octets[i++]);
        }
      } else {
        if (i + 1 >= octets.length) return null;
        var len = tete - 0x80 + MIN;
        var off = (octets[i] << 8) | octets[i + 1];
        i += 2;
        for (var k2 = 0; k2 < len; k2++) {
          var o = lire(off + k2);
          if (o === undefined) return null;
          out.push(o);
        }
      }
    }
    return texteDe(new Uint8Array(out));
  }

  /* ── le dictionnaire ─────────────────────────────────────────────────
     Reçu en texte (c'est du vrai code C), gardé en octets avec sa table
     de hachage. */
  function dictionnaire(texte) {
    return { texte: texte, octets: octetsDe(texte) };
  }

  /* ── les quatre formats, et on garde le plus court qui se relit ──── */
  var FORMATS = ["z", "y", "c", "p"];

  async function fabriquer(texte, dico) {
    var src = octetsDe(texte);
    var essais = [];
    essais.push({ cle: "p", charge: en64(src) });
    var d = await moteurs.deflate(src);
    if (d) essais.push({ cle: "c", charge: en64(d) });
    if (dico && dico.octets && dico.octets.length) {
      var lz = encoder(texte, dico);
      if (lz) {
        essais.push({ cle: "y", charge: en64(lz) });
        var dz = await moteurs.deflate(lz);
        /* Sur un programme de trois lignes, l'en-tête de deflate coûte
           plus qu'il ne rapporte : « y » existe pour ce cas-là, et on
           compare au lieu de supposer. */
        if (dz) essais.push({ cle: "z", charge: en64(dz) });
      }
    }
    essais.sort((a, b) => a.charge.length - b.charge.length);
    for (var i = 0; i < essais.length; i++) {
      var relu = await relire(essais[i].cle, essais[i].charge, dico);
      if (relu === texte) return essais[i];
      /* Un format qui ne se relit pas est écarté SANS BRUIT, mais il est
         signalé à la console : c'est un défaut d'ici, pas de l'élève. */
      if (typeof console !== "undefined")
        console.warn("lien : le format « " + essais[i].cle
          + " » ne se relit pas à l'identique, écarté");
    }
    return null;
  }

  async function relire(cle, charge, dico) {
    try {
      var oct = de64(charge);
      if (cle === "p") return texteDe(oct);
      if (cle === "y") return decoder(oct, dico);
      var plat = await moteurs.inflate(oct);
      if (!plat) return null;
      if (cle === "c") return texteDe(plat);
      if (cle === "z") return decoder(plat, dico);
      return null;
    } catch (e) { return null; }
  }

  return {
    en64: en64, de64: de64, encoder: encoder, decoder: decoder,
    dictionnaire: dictionnaire, fabriquer: fabriquer, relire: relire,
    moteurs: moteurs, FORMATS: FORMATS,
  };
})();

if (typeof module === "object" && module.exports) module.exports = LIEN;
else if (typeof window !== "undefined") window.LIEN = LIEN;
