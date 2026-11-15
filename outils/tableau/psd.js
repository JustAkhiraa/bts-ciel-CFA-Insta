/* L'export en PSD : le tableau, calque par calque, dans le format des
   logiciels de retouche.

   Demandé le 15 nov. 2026 : « le choix d'exporter aussi en .psd », à côté
   des calques. Chaque calque du tableau devient un calque d'image (ses
   éléments dessinés en pixels), chaque dossier un groupe, avec son nom, son
   étiquette de couleur, sa visibilité, son opacité et son verrou. Le texte
   devient des pixels : un PSD n'a pas de texte qu'un autre logiciel sache
   relire à coup sûr.

   Ce fichier n'écrit que des octets ; il ne sait rien de la page. Il reçoit
   des pixels déjà dessinés, et « tests/psd.test.js » le relit sous node,
   octet par octet, avec un lecteur indépendant. Aucune dépendance.

   Le format, dans l'ordre du fichier :
     1. l'en-tête (« 8BPS », RVB, 8 bits) ;
     2. la palette (vide) et les ressources d'image (vides) ;
     3. les calques, du BAS vers le HAUT. Un dossier s'écrit en trois temps :
        une borne de fin (« </Layer group> », section 3), ses calques, puis
        sa tête (section 1 ouvert, 2 fermé), au-dessus d'eux ;
     4. l'image fusionnée, que lisent les visionneuses qui ignorent les
        calques.
   Les pixels sont compressés ligne par ligne (« PackBits ») : les grands
   vides transparents d'un calque n'y coûtent presque rien. */
(function (racine) {
  "use strict";

  /* ── un tampon d'octets qui grandit ── */
  function Tampon() {
    let t = new Uint8Array(1 << 16), n = 0;
    const place = (k) => {
      if (n + k <= t.length) return;
      let L = t.length; while (L < n + k) L *= 2;
      const u = new Uint8Array(L); u.set(t.subarray(0, n)); t = u;
    };
    return {
      get n() { return n; },
      u8(v) { place(1); t[n++] = v & 255; },
      u16(v) { place(2); t[n++] = (v >> 8) & 255; t[n++] = v & 255; },
      i16(v) { this.u16(v < 0 ? v + 65536 : v); },
      u32(v) { place(4); t[n++] = (v >>> 24) & 255; t[n++] = (v >>> 16) & 255; t[n++] = (v >>> 8) & 255; t[n++] = v & 255; },
      i32(v) { this.u32(v < 0 ? v + 4294967296 : v); },
      ascii(s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); },
      octets(a) { place(a.length); t.set(a, n); n += a.length; },
      // écrire une longueur plus tard, quand on la connaîtra
      reserver() { const p = n; this.u32(0); return p; },
      poser(p, v) { t[p] = (v >>> 24) & 255; t[p + 1] = (v >>> 16) & 255; t[p + 2] = (v >>> 8) & 255; t[p + 3] = v & 255; },
      fin() { return t.slice(0, n); },
    };
  }

  /* ── PackBits : une suite répétée devient (répétitions, octet) ;
     le reste est recopié tel quel, par paquets de 128 au plus ── */
  function packbits(ligne) {
    const n = ligne.length, out = [];
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && ligne[j + 1] === ligne[i] && j - i < 127) j++;
      const run = j - i + 1;
      if (run >= 3) { out.push((257 - run) & 255, ligne[i]); i = j + 1; continue; }
      const debut = i;
      while (i < n && i - debut < 128) {
        if (i + 2 < n && ligne[i] === ligne[i + 1] && ligne[i] === ligne[i + 2]) break;
        i++;
      }
      out.push(i - debut - 1);
      for (let k = debut; k < i; k++) out.push(ligne[k]);
    }
    return out;
  }
  // un canal (w × h, un octet par pixel) → [compteurs des lignes, octets]
  function canalRLE(px, w, h, decalage, pas) {
    const comptes = [], donnees = [], ligne = new Uint8Array(w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) ligne[x] = px[(y * w + x) * pas + decalage];
      const p = packbits(ligne);
      comptes.push(p.length);
      for (let k = 0; k < p.length; k++) donnees.push(p[k]);
    }
    return { comptes, donnees };
  }

  /* ── les noms : en latin-1 pour les vieux lecteurs, en entier (UTF-16)
     dans « luni » pour les autres ── */
  function nomPascal(T, nom) {
    let s = "";
    for (const c of String(nom).slice(0, 255)) s += c.charCodeAt(0) < 256 ? c : "?";
    const L = Math.min(255, s.length);
    T.u8(L); T.ascii(s.slice(0, L));
    let total = 1 + L;
    while (total % 4) { T.u8(0); total++; }
  }
  function bloc(T, cle, ecrireDonnees) {
    T.ascii("8BIM"); T.ascii(cle);
    const p = T.reserver(), d = T.n;
    ecrireDonnees();
    while ((T.n - d) % 4) T.u8(0);
    T.poser(p, T.n - d);
  }

  /* L'arbre des calques (du HAUT vers le BAS, comme dans un panneau) →
     la liste des enregistrements du fichier (du BAS vers le HAUT). */
  function aplatir(noeuds, out) {
    for (let i = noeuds.length - 1; i >= 0; i--) {
      const c = noeuds[i];
      if (c.type === "dossier") {
        out.push({ section: 3, nom: "</Layer group>", visible: true, opacite: 100, couleur: 0 });
        aplatir(c.enfants || [], out);
        out.push(Object.assign({}, c, { section: c.ouvert === false ? 2 : 1 }));
      } else out.push(Object.assign({ section: 0 }, c));
    }
    return out;
  }

  /* options :
       largeur, hauteur   la taille du document, en pixels
       calques            l'arbre (voir « aplatir ») ; un calque porte
                          x, y, w, h et rgba (w × h × 4), un dossier ses enfants
       fusion             l'image entière, rgba (largeur × hauteur × 4) */
  function ecrire(o) {
    const W = o.largeur | 0, H = o.hauteur | 0;
    if (!(W > 0 && H > 0 && W <= 30000 && H <= 30000)) throw new Error("taille de document impossible : " + W + " × " + H);
    const T = Tampon();
    // 1. l'en-tête
    T.ascii("8BPS"); T.u16(1); for (let i = 0; i < 6; i++) T.u8(0);
    T.u16(3); T.u32(H); T.u32(W); T.u16(8); T.u16(3);
    // 2. palette et ressources : vides
    T.u32(0); T.u32(0);
    // 3. les calques
    const recs = aplatir(o.calques || [], []);
    const pMasque = T.reserver(), dMasque = T.n;
    const pInfo = T.reserver(), dInfo = T.n;
    T.i16(recs.length);
    const canaux = recs.map((r, k) => {
      const w = r.section ? 0 : Math.max(0, r.w | 0), h = r.section ? 0 : Math.max(0, r.h | 0);
      const vide = !w || !h || !r.rgba;
      const c = [-1, 0, 1, 2].map((id) => {
        if (vide) return { id, comp: 0, comptes: [], donnees: [] };
        const { comptes, donnees } = canalRLE(r.rgba, w, h, id < 0 ? 3 : id, 4);
        return { id, comp: 1, comptes, donnees };
      });
      const x = vide ? 0 : r.x | 0, y = vide ? 0 : r.y | 0;
      T.i32(y); T.i32(x); T.i32(vide ? 0 : y + h); T.i32(vide ? 0 : x + w);
      T.u16(4);
      c.forEach((ch) => { T.i16(ch.id); T.u32(2 + ch.comptes.length * 2 + ch.donnees.length); });
      T.ascii("8BIM"); T.ascii(r.section === 1 || r.section === 2 ? "pass" : "norm");
      T.u8(Math.round(Math.max(0, Math.min(100, r.opacite == null ? 100 : r.opacite)) * 2.55));
      T.u8(0);
      // bit 1 : caché ; bit 3 : le bit 4 a un sens ; bit 4 : pixels sans effet (les bornes de dossier)
      T.u8((r.visible === false ? 2 : 0) | 8 | (r.section ? 16 : 0));
      T.u8(0);
      const pExtra = T.reserver(), dExtra = T.n;
      T.u32(0);                       // pas de masque
      T.u32(0);                       // pas de plages de fusion
      nomPascal(T, r.nom || "Calque");
      bloc(T, "luni", () => { const s = String(r.nom || "Calque"); T.u32(s.length); for (let i = 0; i < s.length; i++) T.u16(s.charCodeAt(i)); });
      bloc(T, "lyid", () => T.u32(k + 1));
      bloc(T, "lclr", () => { T.u16(r.couleur | 0); T.u16(0); T.u16(0); T.u16(0); });
      if (r.section) bloc(T, "lsct", () => { T.u32(r.section); if (r.section !== 3) { T.ascii("8BIM"); T.ascii("pass"); } });
      if (r.verrou) bloc(T, "lspf", () => T.u32(0x80000000));
      T.poser(pExtra, T.n - dExtra);
      return c;
    });
    canaux.forEach((c) => c.forEach((ch) => {
      T.u16(ch.comp);
      ch.comptes.forEach((n) => T.u16(n));
      T.octets(ch.donnees);
    }));
    if ((T.n - dInfo) % 2) T.u8(0);
    T.poser(pInfo, T.n - dInfo);
    T.u32(0);                         // pas de masque global
    T.poser(pMasque, T.n - dMasque);
    // 4. l'image fusionnée : rouge, vert, bleu, en RLE
    const f = o.fusion;
    if (!f || f.length !== W * H * 4) throw new Error("image fusionnée absente ou de la mauvaise taille");
    const C = [0, 1, 2].map((d) => canalRLE(f, W, H, d, 4));
    T.u16(1);
    C.forEach((c) => c.comptes.forEach((n) => T.u16(n)));
    C.forEach((c) => T.octets(c.donnees));
    return T.fin();
  }

  const API = { ecrire, packbits, aplatir };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else racine.TB_PSD = API;
})(typeof window !== "undefined" ? window : this);
