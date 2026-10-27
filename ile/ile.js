/* ═══════════════════════════════════════════════════════════════════════
   CIEL — L'ÎLE. Le second monde : celui où l'on joue.

   Demandé : « une île à la hauteur de Mercantile mais totalement nouvelle,
   avec plein de trucs à faire — des boutiques pour les outils, une salle de
   classe pour les cours. C'est vraiment le jeu, mais c'est mon site. »

   Signalé ensuite, et à raison : « c'est ultra moche ». Ça l'était. La
   première version posait des boîtes grises sur un pré vert plat, sans
   ciel, sans horizon, sans relief lisible. Ce n'était pas la faute de la
   bibliothèque — c'était la mienne. Ce fichier est la reprise.

   ── CE QUI REND UNE ÎLE BELLE, ET DANS CET ORDRE ────────────────────────

   1. UN CIEL, PAS UN FOND. Un aplat bleu derrière une scène ne fait jamais
      un extérieur. Le ciel de Preetham — déjà vendoré pour le village —
      calcule la diffusion de l'atmosphère depuis la position du soleil : le
      bas de l'horizon blanchit, le zénith fonce, et le reste s'accorde avec.
   2. UNE PROFONDEUR D'EAU. Une mer d'une seule couleur est une patinoire.
      Ici la teinte vient de la HAUTEUR DU FOND sous chaque point :
      turquoise sur le sable, bleu franc au large. C'est ce dégradé qui dit
      « île » avant même qu'on ait vu la plage.
   3. UN HORIZON HABITÉ. Trois îlots au loin, noyés dans la brume. Sans eux
      le monde s'arrête net et l'on se sait enfermé dans un disque.
   4. DES BÂTIMENTS QUI ONT UNE SILHOUETTE. Socle de pierre, enduit chaud,
      poteaux de bois, débord de toit, fenêtres qui s'allument la nuit. Un
      cube avec un toit n'est pas une maison : c'est un cube avec un toit.
   5. DE LA COULEUR DANS LE SOL. Un vert unique sur quinze mille mètres
      carrés se lit comme une erreur d'affichage. Le sol passe du sable à la
      dune, de la prairie à la roche, avec du bruit dans les transitions —
      une frontière nette entre deux verts se voit, une frontière bruitée
      se lit comme un terrain.

   ── POURQUOI RIEN N'EST REPRIS D'UN JEU EXISTANT ────────────────────────

   Le dossier déposé dans _depots-bruts/ est une recompilation : son binaire
   est un « Mach-O 64-bit executable arm64 », un programme macOS natif. Un
   navigateur ne peut pas l'exécuter, le projet n'a aucune cible web, et il
   ne contient aucun graphisme — son install.json pointe vers une copie
   personnelle, hors du dépôt. Il n'existe donc aucun chemin technique de ce
   binaire vers une page, avant même la question des droits — et ce dépôt
   est public.

   Ce qui est repris ne se protège pas : le cel-shading est une TECHNIQUE
   (des aplats et un contour), une boutique où l'on parle à quelqu'un est un
   MOTIF. Tout ce qu'on voit ici est dessiné pour ce site — pas une image
   n'est importée, et rien n'est chargé hors du dépôt.

   ── LA RÈGLE DU VILLAGE, GARDÉE ─────────────────────────────────────────

   **LA 3D FAIT LE DÉCOR, LE HTML FAIT LE CONTENU.** Une fiche ne sera
   jamais une texture : du vrai HTML, net à toute distance, sélectionnable,
   lu par un lecteur d'écran.

   En revanche le village interdit volontairement de se déplacer (« se
   déplacer ne doit pas être un métier », caméra sur rail). Ici c'est
   l'inverse qui est demandé : explorer. Les deux intentions ne tiennent pas
   dans un seul monde — d'où deux mondes, et deux portes.
   ═══════════════════════════════════════════════════════════════════════ */

import * as THREE from "../monde/lib/three.module.js";
import { ImprovedNoise } from "../monde/lib/ImprovedNoise.js";
import { Sky } from "../monde/lib/Sky.js";

/* ═══════════════════════════════════════════════ les couleurs ═══════════
   Tenues en un seul endroit : une couleur écrite au milieu d'une fonction
   est une couleur qu'on ne retrouve plus le jour où la palette bouge. */
const C = {
  sable:       0xF6E7C3, sableHumide: 0xD9C49A, dune: 0xBFC98A,
  prairie:     0x6FB15C, prairieOmbre: 0x4E8C47,
  roche:       0xA9A396, rocheClaire: 0xCFC9BC,
  merPeu:      0x5FD3D0, merMoyen: 0x2E9BC9, merLoin: 0x15558C,
  ecume:       0xFFFFFF,
  enduit:      0xF3E4C8, enduitRose: 0xEBCFC0,
  pierre:      0x9A9287, bois: 0x8A5A33, boisSombre: 0x5C3A22,
  fenetre:     0x7FC7E8, fenetreNuit: 0xFFD98A,
  feuillage:   0x3F8F4A, feuillageClair: 0x5CAE57, tronc: 0x7A5436,
  encre:       0x151019
};

/* La rampe du cel-shading. Quatre paliers : trois découpent la mer en deux
   triangles de couleur, cinq et l'œil ne voit plus de palier du tout —
   donc plus de cel-shading. */
let RAMPE = null;
function rampeToon() {
  if (RAMPE) return RAMPE;
  const n = 4, d = new Uint8Array(n);
  for (let i = 0; i < n; i++) d[i] = Math.round((i / (n - 1)) * 255);
  const t = new THREE.DataTexture(d, n, 1, THREE.RedFormat);
  t.needsUpdate = true;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  RAMPE = t;
  return t;
}
const matiere = (couleur, o = {}) =>
  new THREE.MeshToonMaterial({ color: couleur, gradientMap: rampeToon(), ...o });

/* ═══════════════════════════════════════════════ le contour ═════════════
   La coque inversée : le même maillage poussé vers l'extérieur le long de
   ses normales, rendu en noir et à l'envers. Ses faces avant sont masquées
   par l'objet, ses faces arrière dépassent — il ne reste qu'un liseré, et
   aucune passe de post-traitement.

   Pousser le long des NORMALES plutôt qu'à l'échelle garde une épaisseur
   constante : à l'échelle, un mât devient une aiguille cernée d'un seul
   côté. */
const MAT_CONTOUR = new THREE.MeshBasicMaterial({ color: C.encre, side: THREE.BackSide });
function contourer(objet, epaisseur = 0.035) {
  const geo = objet.geometry.clone();
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor) return objet;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i,
      pos.getX(i) + nor.getX(i) * epaisseur,
      pos.getY(i) + nor.getY(i) * epaisseur,
      pos.getZ(i) + nor.getZ(i) * epaisseur);
  }
  pos.needsUpdate = true;
  objet.add(new THREE.Mesh(geo, MAT_CONTOUR));   // enfant : il suit l'objet
  return objet;
}

/* ═══════════════════════════════════════════════ le relief ══════════════
   L'île est une hauteur CALCULÉE, pas un modèle importé : rien à charger,
   et surtout on peut demander la hauteur en un point quelconque — ce dont
   la marche a besoin à chaque image. */
const perlin = new ImprovedNoise();
const RAYON_ILE = 62, HAUT_MAX = 16;
const PLACE = { x: 0, z: 12, r: 21 };
const PORT  = { x: 0, z: 50, r: 15 };

function hauteurSol(x, z) {
  const d = Math.hypot(x, z);
  if (d > RAYON_ILE + 6) return -4;
  const fondu = Math.cos(Math.min(1, d / RAYON_ILE) * Math.PI * 0.5);
  let h = fondu * fondu * HAUT_MAX
        + perlin.noise(x * 0.016, z * 0.016, 11.3) * 5.0 * fondu
        + perlin.noise(x * 0.062, z * 0.062, 4.1) * 1.3 * fondu;

  /* LA CRÊTE DU NORD. Une île toute ronde n'a pas de point de vue ; une
     arête donne un dos, un versant abrité et un sommet où monter. */
  h += Math.exp(-Math.pow((z + 26) / 17, 2)) * Math.exp(-Math.pow(x / 30, 2)) * 9.5 * fondu;

  /* LA PLACE, aplanie franchement : des bâtiments posés sur du bruit sont
     des bâtiments qui flottent ou qui s'enterrent. */
  const dPlace = Math.hypot(x - PLACE.x, z - PLACE.z);
  if (dPlace < PLACE.r) {
    const k = Math.min(1, Math.max(0, (PLACE.r - dPlace) / 7));
    h = h * (1 - k) + 3.4 * k;
  }
  /* LE PORT : une encoche qui descend à l'eau, pour que le ponton ait un
     rivage où s'accrocher. */
  const dPort = Math.hypot(x - PORT.x, z - PORT.z);
  if (dPort < PORT.r) {
    const k = Math.min(1, Math.max(0, (PORT.r - dPort) / 11));
    h = h * (1 - k) + (-0.7) * k;
  }
  return h;
}

function construireIle() {
  const g = new THREE.PlaneGeometry(170, 170, 230, 230);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, couleurs = [];
  const col = new THREE.Color(), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = hauteurSol(x, z);
    pos.setY(i, h);
    /* La couleur est peinte DANS le maillage, par sommet. Une texture sur
       170 m de côté serait soit floue, soit répétée de façon visible ; une
       couleur par sommet reste nette et ne coûte pas un octet. */
    const grain = perlin.noise(x * 0.14, z * 0.14, 2.7) * 0.5;
    if (h < -0.15)     col.setHex(C.sableHumide);
    else if (h < 0.9)  col.setHex(C.sableHumide).lerp(tmp.setHex(C.sable), (h + 0.15) / 1.05);
    else if (h < 2.2)  col.setHex(C.sable).lerp(tmp.setHex(C.dune), (h - 0.9) / 1.3 + grain * 0.3);
    else if (h < 4.0)  col.setHex(C.dune).lerp(tmp.setHex(C.prairie), (h - 2.2) / 1.8 + grain * 0.3);
    else if (h < 11.0) col.setHex(C.prairie).lerp(tmp.setHex(C.prairieOmbre),
                                                  Math.min(1, (h - 4) / 7 + grain * 0.4));
    else               col.setHex(C.roche).lerp(tmp.setHex(C.rocheClaire),
                                                Math.min(1, (h - 11) / 5 + grain * 0.5));
    couleurs.push(col.r, col.g, col.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(couleurs, 3));
  g.computeVertexNormals();
  const sol = new THREE.Mesh(g, matiere(0xffffff, { vertexColors: true }));
  sol.receiveShadow = true;
  return sol;
}

/* ═══════════════════════════════════════════════ la mer ═════════════════
   Trois houles croisées, déplacées dans le nuanceur de sommets : le calcul
   reste sur la carte graphique. Le faire en JavaScript obligerait à
   remonter quarante mille sommets à chaque image.

   LA COULEUR VIENT DU FOND, et c'est le point : chaque sommet est peint
   selon la hauteur du sol SOUS lui. */
function construireMer() {
  const g = new THREE.PlaneGeometry(1100, 1100, 190, 190);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, couleurs = [];
  const col = new THREE.Color(), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const p = Math.min(1, Math.max(0, -hauteurSol(pos.getX(i), pos.getZ(i)) / 9));
    if (p < 0.45) col.setHex(C.merPeu).lerp(tmp.setHex(C.merMoyen), p / 0.45);
    else          col.setHex(C.merMoyen).lerp(tmp.setHex(C.merLoin), (p - 0.45) / 0.55);
    couleurs.push(col.r, col.g, col.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(couleurs, 3));

  const m = matiere(0xffffff, { vertexColors: true, transparent: true, opacity: 0.9 });
  m.userData.temps = { value: 0 };
  m.onBeforeCompile = (n) => {
    n.uniforms.temps = m.userData.temps;
    n.vertexShader = n.vertexShader
      .replace("#include <common>", `#include <common>
        uniform float temps;
        float houle(vec3 p) {
          return sin(p.x * 0.085 + temps * 1.05) * 0.40
               + sin(p.z * 0.125 - temps * 0.78) * 0.28
               + sin((p.x + p.z) * 0.20 + temps * 1.55) * 0.13;
        }`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        transformed.y += houle(position);
        /* La normale doit suivre la vague, sinon la mer reste éclairée
           comme une planche et les paliers du cel-shading ne bougent
           jamais. On la refait par deux échantillons voisins. */
        float hx = houle(position + vec3(1.0, 0.0, 0.0)) - houle(position);
        float hz = houle(position + vec3(0.0, 0.0, 1.0)) - houle(position);
        vNormal = normalize(normalMatrix * normalize(vec3(-hx, 1.0, -hz)));`);
  };
  const mer = new THREE.Mesh(g, m);
  mer.renderOrder = 1;
  return { mer, materiau: m };
}

function construireEcume() {
  const g = new THREE.RingGeometry(RAYON_ILE - 4.5, RAYON_ILE + 2.2, 150);
  g.rotateX(-Math.PI / 2);
  const a = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color: C.ecume, transparent: true, opacity: 0.5,
    depthWrite: false, side: THREE.DoubleSide
  }));
  a.position.y = 0.18;
  a.renderOrder = 2;
  return a;
}

/* ═══════════════════════════════════════════════ l'horizon ══════════════
   Trois îlots au loin. Volontairement sans détail : la brume les mange, et
   tout ce qu'on leur demande est d'exister. */
function construireHorizon() {
  const g = new THREE.Group();
  for (const i of [{ x: -330, z: -250, r: 54, h: 30 },
                   { x: 300, z: -300, r: 40, h: 22 },
                   { x: 390, z: 160, r: 64, h: 17 }]) {
    const forme = new THREE.ConeGeometry(i.r, i.h, 9, 1);
    /* Un cône pur fait une pyramide ; on écrase la pointe pour obtenir un
       profil d'île — un plateau, pas un chapeau. */
    const p = forme.attributes.position;
    for (let k = 0; k < p.count; k++) {
      if (p.getY(k) > i.h * 0.3) p.setY(k, i.h * 0.3 + (p.getY(k) - i.h * 0.3) * 0.45);
    }
    forme.computeVertexNormals();
    const m = new THREE.Mesh(forme, matiere(0x6E8C7A));
    m.position.set(i.x, i.h * 0.18, i.z);
    g.add(m);
  }
  return g;
}

/* ═══════════════════════════════════════════════ les arbres ═════════════
   Deux essences, et elles disent où l'on est : le palmier tient la plage,
   l'arbre rond tient l'intérieur. Une information de lieu portée par une
   forme — la même règle que les silhouettes des bâtiments. */
function palmier(hasard) {
  const g = new THREE.Group();
  const haut = 4.2 + hasard() * 2.4;
  const courbe = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.25, haut * 0.4, 0.1),
    new THREE.Vector3(0.75, haut * 0.75, 0.2), new THREE.Vector3(1.3, haut, 0.3)]);
  const tronc = new THREE.Mesh(
    new THREE.TubeGeometry(courbe, 8, 0.19, 6, false), matiere(C.tronc));
  tronc.castShadow = true;
  g.add(tronc);
  const sommet = courbe.getPoint(1);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const palme = new THREE.Mesh(new THREE.SphereGeometry(1.5, 6, 4), matiere(C.feuillage));
    palme.scale.set(1, 0.17, 0.42);
    palme.position.copy(sommet);
    palme.position.x += Math.cos(a) * 1.25;
    palme.position.z += Math.sin(a) * 1.25;
    palme.position.y -= 0.18;
    palme.rotation.y = -a; palme.rotation.z = 0.26;
    palme.castShadow = true;
    g.add(palme);
  }
  return g;
}

function arbreRond(hasard) {
  const g = new THREE.Group();
  const haut = 2.6 + hasard() * 1.8;
  const tronc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.26, haut, 6), matiere(C.tronc));
  tronc.position.y = haut / 2; tronc.castShadow = true;
  g.add(tronc);
  /* Trois boules décalées plutôt qu'une sphère : une sphère seule fait une
     sucette, trois boules font une frondaison. */
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.25 + hasard() * 0.6, 0),
      matiere(i === 0 ? C.feuillage : C.feuillageClair));
    b.position.set((hasard() - 0.5) * 1.3, haut + 0.3 + (hasard() - 0.5) * 0.8,
                   (hasard() - 0.5) * 1.3);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

/* ═══════════════════════════════════════════════ les bâtiments ══════════
   Un cube avec un toit n'est pas une maison. Il faut cinq choses : un
   SOCLE qui l'assoit, un ENDUIT qui porte la couleur, des POTEAUX qui
   donnent l'échelle, un LINTEAU qui fait l'ombre sur la façade, et des
   FENÊTRES qui disent que quelqu'un habite là.

   Et la silhouette porte la matière : on doit reconnaître le bâtiment de
   loin, avant d'avoir lu l'enseigne. Une information portée par la seule
   couleur se perd — celle-ci l'est par la forme, la couleur ET le nom. */
const FENETRES = [];

function bati({ largeur: L, hauteur: H, profondeur: P, toit, forme, enduit }) {
  const g = new THREE.Group();

  const socle = new THREE.Mesh(
    new THREE.BoxGeometry(L + 0.5, 0.65, P + 0.5), matiere(C.pierre));
  socle.position.y = 0.32;
  socle.castShadow = socle.receiveShadow = true;
  contourer(socle, 0.04); g.add(socle);

  const murs = new THREE.Mesh(new THREE.BoxGeometry(L, H, P), matiere(enduit));
  murs.position.y = 0.65 + H / 2;
  murs.castShadow = murs.receiveShadow = true;
  contourer(murs, 0.045); g.add(murs);

  /* Les poteaux d'angle coûtent quatre boîtes et changent tout : sans eux
     l'enduit est une surface, avec eux c'est une construction. */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.26, H, 0.26), matiere(C.bois));
    p.position.set(sx * (L / 2 - 0.1), 0.65 + H / 2, sz * (P / 2 - 0.1));
    p.castShadow = true;
    g.add(p);
  }

  let toitMesh;
  if (forme === "dome") {
    toitMesh = new THREE.Mesh(
      new THREE.SphereGeometry(L * 0.64, 20, 11, 0, Math.PI * 2, 0, Math.PI / 2), matiere(toit));
    toitMesh.position.y = 0.65 + H;
  } else if (forme === "tour") {
    toitMesh = new THREE.Mesh(new THREE.ConeGeometry(L * 0.82, H * 0.95, 8), matiere(toit));
    toitMesh.position.y = 0.65 + H + H * 0.47;
  } else {
    toitMesh = new THREE.Mesh(new THREE.ConeGeometry(L * 0.92, H * 0.66, 4), matiere(toit));
    toitMesh.rotation.y = Math.PI / 4;
    toitMesh.position.y = 0.65 + H + H * 0.33;
  }
  toitMesh.castShadow = true;
  contourer(toitMesh, 0.05); g.add(toitMesh);

  const porte = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 0.2), matiere(C.boisSombre));
  porte.position.set(0, 0.65 + 1.25, P / 2 + 0.03);
  g.add(porte);
  const linteau = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 0.34), matiere(C.bois));
  linteau.position.set(0, 0.65 + 2.62, P / 2 + 0.05);
  g.add(linteau);

  /* Les fenêtres sont retenues dans une liste : la nuit, elles s'allument.
     C'est le détail qui fait qu'un village a l'air HABITÉ plutôt que
     simplement visible. */
  for (const sx of [-1, 1]) {
    const cadre = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.1), matiere(C.bois));
    cadre.position.set(sx * (L * 0.29), 0.65 + H * 0.62, P / 2 + 0.01);
    g.add(cadre);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.16),
      new THREE.MeshBasicMaterial({ color: C.fenetre }));
    f.position.set(sx * (L * 0.29), 0.65 + H * 0.62, P / 2 + 0.03);
    g.add(f);
    FENETRES.push(f);
  }
  return g;
}

/* L'enseigne : un panneau de bois sur deux pieds, planté devant la porte.
   Le NOM de la matière y sera écrit en HTML — la 3D fait le support, pas
   le texte. Un mot rendu en texture devient illisible dès qu'on approche. */
function enseigne() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const pied = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 1.5, 6), matiere(C.boisSombre));
    pied.position.set(sx * 0.62, 0.75, 0);
    g.add(pied);
  }
  const planche = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.62, 0.11), matiere(C.bois));
  planche.position.y = 1.42; planche.castShadow = true;
  contourer(planche, 0.025); g.add(planche);
  return g;
}

function ponton() {
  const g = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const planche = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.17, 0.85), matiere(C.bois));
    planche.position.set(0, 0.5, PORT.z - 3 + i * 0.95);
    planche.receiveShadow = true;
    g.add(planche);
  }
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
    const pilier = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, 2.4, 6), matiere(C.boisSombre));
    pilier.position.set(sx * 1.55, -0.45, PORT.z - 2.5 + i * 2.3);
    g.add(pilier);
  }
  return g;
}

/* ═══════════════════════════════════════════════ le personnage ══════════
   DESSINÉ POUR CE SITE. Ce n'est le héros d'aucun jeu existant : une
   silhouette d'étudiant, sacoche à l'épaule, écharpe aux couleurs du site.
   Volontairement simple — elle sera reprise quand sa direction sera
   arrêtée. */
function construirePersonnage() {
  const g = new THREE.Group();
  const corps = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.6, 4, 10), matiere(0x2F6FB0));
  corps.position.y = 0.95; corps.castShadow = true;
  contourer(corps, 0.032); g.add(corps);

  const echarpe = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 6, 14), matiere(0xD6246E));
  echarpe.rotation.x = Math.PI / 2; echarpe.position.y = 1.42;
  g.add(echarpe);

  const tete = new THREE.Mesh(new THREE.SphereGeometry(0.29, 18, 13), matiere(0xE8C39E));
  tete.position.y = 1.74; tete.castShadow = true;
  contourer(tete, 0.028); g.add(tete);

  const cheveux = new THREE.Mesh(
    new THREE.SphereGeometry(0.305, 18, 13, 0, Math.PI * 2, 0, Math.PI * 0.6), matiere(0x2B1B10));
  cheveux.position.y = 1.76; g.add(cheveux);

  const sacoche = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.33, 0.2), matiere(0xB9770E));
  sacoche.position.set(0.33, 0.88, -0.1);
  contourer(sacoche, 0.022); g.add(sacoche);

  const jambes = [];
  for (const cote of [-1, 1]) {
    const j = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.4, 3, 8), matiere(0x33475B));
    j.position.set(cote * 0.155, 0.35, 0);
    j.castShadow = true;
    g.add(j); jambes.push(j);
  }
  g.userData.jambes = jambes;
  return g;
}

/* ═══════════════════════════════════════════════ la scène ═══════════════ */
const toile = document.getElementById("scene");
const secours = document.getElementById("secours");

let rendu;
try {
  rendu = new THREE.WebGLRenderer({ canvas: toile, antialias: true });
} catch (err) {
  if (secours) secours.hidden = false;
  throw err;
}
rendu.setPixelRatio(Math.min(devicePixelRatio, 2));
rendu.setSize(innerWidth, innerHeight);
rendu.shadowMap.enabled = true;
rendu.shadowMap.type = THREE.PCFShadowMap;      // r186 a retiré la variante douce
rendu.toneMapping = THREE.ACESFilmicToneMapping;
/* ACES comprime fort les hautes lumières : à 0,62 le ciel restait beau
   mais le SOL tombait dans le noir, et les ombres devenaient des trous.
   À 1,0 le sol revient, et le ciel ne brûle pas pour autant. */
rendu.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.5, 4000);

/* ── le ciel ──────────────────────────────────────────────────────────
   Le modèle de Preetham : la diffusion de l'atmosphère, calculée depuis la
   position du soleil. Un aplat bleu derrière une scène ne fait jamais un
   extérieur — il lui manque le blanchiment de l'horizon, et c'est
   précisément ce que l'œil lit comme « dehors ». */
const ciel = new Sky();
ciel.scale.setScalar(6000);
scene.add(ciel);
const U = ciel.material.uniforms;
U.mieCoefficient.value = 0.006;
U.mieDirectionalG.value = 0.82;

const posSoleil = new THREE.Vector3();
const soleil = new THREE.DirectionalLight(0xFFF3DC, 2.6);
soleil.castShadow = true;
soleil.shadow.mapSize.set(2048, 2048);
soleil.shadow.camera.near = 1;
soleil.shadow.camera.far = 260;
const ee = 92;
soleil.shadow.camera.left = -ee; soleil.shadow.camera.right = ee;
soleil.shadow.camera.top = ee;   soleil.shadow.camera.bottom = -ee;
/* Sans biais, chaque surface éclairée se fait de l'ombre à ELLE-MÊME : la
   profondeur écrite dans la carte et celle recalculée au rendu ne tombent
   jamais exactement pareil, et l'écart dessine les triangles du maillage en
   diagonales sombres sur les murs. Le biais le long de la normale corrige
   sans décoller l'ombre du pied des objets. */
soleil.shadow.bias = -0.0004;
soleil.shadow.normalBias = 0.04;
scene.add(soleil, soleil.target);

const ambiance = new THREE.HemisphereLight(0xCDEBFF, 0x6E8E5A, 1.0);
scene.add(ambiance);

/* La brume mange les îlots du fond et donne la profondeur. Sa couleur doit
   suivre celle du ciel, sinon l'horizon se décolle. */
scene.fog = new THREE.Fog(0xCFE6F2, 190, 760);

function placerSoleil(elevation, azimut) {
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimut);
  posSoleil.setFromSphericalCoords(1, phi, theta);
  U.sunPosition.value.copy(posSoleil);
  soleil.position.copy(posSoleil).multiplyScalar(180);
  soleil.target.position.set(0, 0, 0);
}

/* ── le monde se bâtit ─────────────────────────────────────────────── */
scene.add(construireIle());
const { mer, materiau: matMer } = construireMer();
scene.add(mer, construireEcume(), construireHorizon(), ponton());

/* Un tirage REPRODUCTIBLE : la même graine donne la même île à chaque
   visite. Une île qui se réorganise à chaque chargement ne se mémorise
   pas, et l'on ne peut plus y donner rendez-vous à quelqu'un. */
function tirage(graine) {
  let s = graine >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* Une fusion maison : l'utilitaire du village exige des attributs
   identiques partout, et nos cônes d'herbe n'ont pas d'UV.

   LE PIÈGE, ET J'Y SUIS TOMBÉ : une géométrie de three.js est INDEXÉE —
   ce sont les index qui disent quels triplets forment un triangle.
   Recopier « position » et « normal » sans l'index reforme les triangles
   sur des sommets consécutifs : chaque touffe tirait alors un trait
   jusqu'à l'autre bout de l'île. « toNonIndexed() » déplie d'abord. */
function fusionner(geometries) {
  geometries = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of geometries) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let k = 0;
  for (const g of geometries) {
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++, k++) {
      pos[k * 3] = p.getX(i); pos[k * 3 + 1] = p.getY(i); pos[k * 3 + 2] = p.getZ(i);
      nor[k * 3] = n.getX(i); nor[k * 3 + 1] = n.getY(i); nor[k * 3 + 2] = n.getZ(i);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return out;
}

{
  const r = tirage(20261027);
  const touffes = [], cailloux = [], fleurs = [];
  const libre = (x, z) =>
    Math.hypot(x - PLACE.x, z - PLACE.z) > PLACE.r - 3 &&
    Math.hypot(x - PORT.x, z - PORT.z) > 7;

  for (let i = 0; i < 2600; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (RAYON_ILE - 4);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = hauteurSol(x, z);
    if (y < 1.6 || y > 12 || !libre(x, z)) continue;
    const h = 0.45 + r() * 0.55;
    const g = new THREE.ConeGeometry(0.15, h, 4, 1);
    g.translate(x, y + h / 2, z);
    touffes.push(g);
  }
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (RAYON_ILE - 5);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = hauteurSol(x, z);
    if (y < 2.4 || y > 10 || !libre(x, z)) continue;
    const g = new THREE.SphereGeometry(0.13, 5, 4);
    g.translate(x, y + 0.2, z);
    fleurs.push(g);
  }
  for (let i = 0; i < 150; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (RAYON_ILE - 2);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = hauteurSol(x, z);
    if (!libre(x, z)) continue;
    const t = 0.3 + r() * 0.85;
    const g = new THREE.DodecahedronGeometry(t, 0);
    g.scale(1, 0.7, 1);
    g.translate(x, y + t * 0.3, z);
    cailloux.push(g);
  }

  /* Fusionnées : deux mille six cents objets séparés, ce sont deux mille
     six cents appels de dessin par image. Fusionnés, c'est un seul — et la
     différence se voit tout de suite sur un téléphone. */
  if (touffes.length) {
    const h = new THREE.Mesh(fusionner(touffes), matiere(C.prairieOmbre));
    h.castShadow = true; scene.add(h);
  }
  if (fleurs.length) scene.add(new THREE.Mesh(fusionner(fleurs), matiere(0xF2D64B)));
  if (cailloux.length) {
    const c = new THREE.Mesh(fusionner(cailloux), matiere(C.roche));
    c.castShadow = c.receiveShadow = true; scene.add(c);
  }

  /* Les arbres restent des objets à part : ils ont plusieurs matières, et
     une frondaison fusionnée avec son tronc perdrait ses deux couleurs. */
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (RAYON_ILE - 6);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = hauteurSol(x, z);
    if (!libre(x, z) || y < 0.6 || y > 13) continue;
    const arbre = (y < 2.6) ? palmier(r) : arbreRond(r);
    arbre.position.set(x, y, z);
    arbre.rotation.y = r() * Math.PI * 2;
    scene.add(arbre);
  }
}

/* ── la place et ses bâtiments ─────────────────────────────────────── */
const TOITS = [0xC0392B, 0x2874A6, 0x7D3C98, 0x1E8449, 0xB9770E, 0x515A5A];
const ENDUITS = [C.enduit, C.enduitRose, C.enduit, C.enduitRose, C.enduit, C.enduitRose];
const FORMES = ["deux-pentes", "dome", "tour", "deux-pentes", "dome", "tour"];
const batiments = [];

function poserVillage(poles) {
  const n = Math.max(1, poles.length);
  poles.forEach((pole, i) => {
    /* En arc autour de la place, et non en ligne : on les voit tous depuis
       le centre, et aucun n'en cache un autre. */
    const a = (-Math.PI * 0.78) + (i / Math.max(1, n - 1)) * (Math.PI * 1.56);
    const x = PLACE.x + Math.cos(a) * 16.5;
    const z = PLACE.z + Math.sin(a) * 16.5;
    const b = bati({ largeur: 5.6, hauteur: 4.4, profondeur: 4.8,
                     toit: TOITS[i % 6], forme: FORMES[i % 6], enduit: ENDUITS[i % 6] });
    b.position.set(x, hauteurSol(x, z) - 0.15, z);
    b.lookAt(new THREE.Vector3(PLACE.x, b.position.y, PLACE.z));
    b.userData.pole = pole;
    scene.add(b); batiments.push(b);

    const vers = new THREE.Vector3(PLACE.x - x, 0, PLACE.z - z).normalize();
    const ex = x + vers.x * 4.4, ez = z + vers.z * 4.4;
    const e = enseigne();
    e.position.set(ex, hauteurSol(ex, ez), ez);
    e.lookAt(new THREE.Vector3(PLACE.x, e.position.y, PLACE.z));
    scene.add(e);
  });
}

/* ── le personnage et la caméra ────────────────────────────────────── */
const joueur = construirePersonnage();
/* On débarque sur la plage du sud, le village droit devant. Le premier
   point d'arrivée était (0, 30) — c'est-à-dire À L'INTÉRIEUR du bâtiment
   posé en (0,4 ; 29,5) : on apparaissait dans un mur, et l'écran montrait
   une façade sans qu'on comprenne pourquoi. */
joueur.position.set(0, hauteurSol(0, 44), 44);
scene.add(joueur);

const VITESSE = 7.6;
const touches = new Set();
addEventListener("keydown", (ev) => {
  touches.add(ev.key.toLowerCase());
  if (ev.key.startsWith("Arrow")) ev.preventDefault();
});
addEventListener("keyup", (ev) => touches.delete(ev.key.toLowerCase()));
addEventListener("blur", () => touches.clear());   // sinon on part tout droit

const manche = { actif: false, x: 0, z: 0, id: null };
const socle = document.getElementById("manche");
if (socle) {
  const R = 46;
  const bouger = (ev) => {
    if (!manche.actif) return;
    const r = socle.getBoundingClientRect();
    const t = ev.changedTouches
      ? [...ev.changedTouches].find((x) => x.identifier === manche.id) : ev;
    if (!t) return;
    const dx = t.clientX - (r.left + r.width / 2);
    const dy = t.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / R);
    manche.x = (dx / d) * k; manche.z = (dy / d) * k;
    const pouce = socle.firstElementChild;
    if (pouce) pouce.style.transform = `translate(${manche.x * R}px, ${manche.z * R}px)`;
    ev.preventDefault();
  };
  const prendre = (ev) => {
    const t = ev.changedTouches ? ev.changedTouches[0] : ev;
    manche.actif = true; manche.id = t.identifier ?? "souris";
    socle.classList.add("tenu"); bouger(ev);
  };
  const lacher = () => {
    manche.actif = false; manche.x = manche.z = 0;
    socle.classList.remove("tenu");
    const pouce = socle.firstElementChild;
    if (pouce) pouce.style.transform = "";
  };
  socle.addEventListener("touchstart", prendre, { passive: false });
  socle.addEventListener("touchmove", bouger, { passive: false });
  socle.addEventListener("touchend", lacher);
  socle.addEventListener("touchcancel", lacher);
}

let angleCam = 0;
const cible = new THREE.Vector3(), voulue = new THREE.Vector3();

function majCamera(dt, immediat) {
  const d = 15, h = 5.6;
  /* Le signe compte : la caméra se place du côté OPPOSÉ à la marche. Avec
     le signe inverse elle se mettait ENTRE le joueur et le village — on
     avançait vers l'objectif en lui tournant le dos. */
  voulue.set(
    joueur.position.x + Math.sin(angleCam) * d,
    joueur.position.y + h,
    joueur.position.z + Math.cos(angleCam) * d);
  /* La caméra ne plonge jamais sous le relief : sans ce plancher on
     traverse une colline et l'on se retrouve dans l'île. */
  const solCam = hauteurSol(voulue.x, voulue.z) + 2.4;
  if (voulue.y < solCam) voulue.y = solCam;

  /* « 1 - pow(a, dt) » donne le même ressenti à 60 et à 120 images, là où
     un lerp par image rend la caméra deux fois plus nerveuse sur un écran
     rapide. */
  if (immediat) camera.position.copy(voulue);
  else camera.position.lerp(voulue, 1 - Math.pow(0.0016, dt));
  /* On vise AU-DESSUS du joueur : viser sa tête donne l'impression
     constante de regarder par terre, et le ciel disparaît du cadre. */
  cible.set(joueur.position.x, joueur.position.y + 3.2, joueur.position.z);
  camera.lookAt(cible);
}

let glisse = null;
toile.addEventListener("pointerdown", (ev) => {
  glisse = { x: ev.clientX, a: angleCam };
  toile.setPointerCapture(ev.pointerId);
});
toile.addEventListener("pointermove", (ev) => {
  if (glisse) angleCam = glisse.a - (ev.clientX - glisse.x) * 0.006;
});
toile.addEventListener("pointerup", () => { glisse = null; });
toile.addEventListener("pointercancel", () => { glisse = null; });

/* ── le jour et la nuit ────────────────────────────────────────────── */
let nuit = false;
function appliquerHeure() {
  if (nuit) {
    placerSoleil(-3.5, 196);
    U.turbidity.value = 7; U.rayleigh.value = 0.5;
    soleil.intensity = 0.35; soleil.color.setHex(0xA8BEFF);
    ambiance.intensity = 0.75;
    ambiance.color.setHex(0x3C5080); ambiance.groundColor.setHex(0x1B2338);
    scene.fog.color.setHex(0x2B3B5B);
    rendu.toneMappingExposure = 0.85;
  } else {
    placerSoleil(58, 128);
    U.turbidity.value = 3.2; U.rayleigh.value = 1.3;
    soleil.intensity = 2.15; soleil.color.setHex(0xFFF6E4);
    /* Le ciel hémisphérique REMPLIT les ombres. Sans lui, une ombre
       portée est un trou noir — c'est ce qui rendait la scène sinistre. */
    ambiance.intensity = 1.75;
    ambiance.color.setHex(0xDCF2FF); ambiance.groundColor.setHex(0x93AE7C);
    scene.fog.color.setHex(0xCFE6F2);
    rendu.toneMappingExposure = 1.0;
  }
  for (const f of FENETRES) f.material.color.setHex(nuit ? C.fenetreNuit : C.fenetre);
  document.documentElement.dataset.heure = nuit ? "nuit" : "jour";
}
appliquerHeure();

const btnHeure = document.getElementById("btn-heure");
if (btnHeure) btnHeure.addEventListener("click", () => { nuit = !nuit; appliquerHeure(); });

/* ── la boucle ─────────────────────────────────────────────────────── */
let precedent = performance.now();
let marche = 0, aidePartie = false;

function image(maintenant) {
  requestAnimationFrame(image);
  const dt = Math.min(0.05, (maintenant - precedent) / 1000);
  precedent = maintenant;
  matMer.userData.temps.value += dt;

  /* ZQSD pour un clavier français, WASD pour un qwerty, les flèches pour
     tout le monde : ce ne sont pas trois préférences, ce sont trois
     claviers réels. */
  let ix = 0, iz = 0;
  if (touches.has("z") || touches.has("w") || touches.has("arrowup"))   iz -= 1;
  if (touches.has("s") || touches.has("arrowdown"))                     iz += 1;
  if (touches.has("q") || touches.has("a") || touches.has("arrowleft")) ix -= 1;
  if (touches.has("d") || touches.has("arrowright"))                    ix += 1;
  if (manche.actif) { ix += manche.x; iz += manche.z; }

  const force = Math.min(1, Math.hypot(ix, iz));
  if (force > 0.02) {
    if (!aidePartie) {
      /* L'aide s'efface au PREMIER pas, pas au bout d'un délai : elle a
         servi à l'instant exact où elle a été comprise. */
      aidePartie = true;
      const a = document.getElementById("aide");
      if (a) a.dataset.parti = "";
    }
    /* On marche PAR RAPPORT À LA CAMÉRA : « en avant » veut dire « vers le
       haut de l'écran ». C'est la seule convention qu'un joueur n'a pas à
       apprendre. */
    const n = Math.hypot(ix, iz) || 1;
    const dx = (ix / n) * Math.cos(angleCam) + (iz / n) * Math.sin(angleCam);
    const dz = -(ix / n) * Math.sin(angleCam) + (iz / n) * Math.cos(angleCam);
    const nx = joueur.position.x + dx * VITESSE * dt * force;
    const nz = joueur.position.z + dz * VITESSE * dt * force;
    if (Math.hypot(nx, nz) < RAYON_ILE - 2) {      // on ne part pas à la nage
      joueur.position.x = nx; joueur.position.z = nz;
    }
    joueur.rotation.y = Math.atan2(dx, dz);
    marche += dt * 11 * force;
  }
  joueur.position.y = hauteurSol(joueur.position.x, joueur.position.z);

  /* Le balancement des jambes. Sans lui le personnage GLISSE, et l'œil le
     voit tout de suite même sans savoir dire pourquoi. */
  const js = joueur.userData.jambes;
  if (js) {
    const amp = force > 0.02 ? 0.55 : 0;
    js[0].rotation.x = Math.sin(marche) * amp;
    js[1].rotation.x = -Math.sin(marche) * amp;
  }

  majCamera(dt, false);
  rendu.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  rendu.setSize(innerWidth, innerHeight);
});

/* ── les données du site ───────────────────────────────────────────── */
function demarrer(poles) {
  poserVillage(poles);
  majCamera(0, true);                        // la première image est déjà cadrée
  const chargement = document.getElementById("chargement");
  if (chargement) chargement.hidden = true;
  const hud = document.getElementById("hud");
  if (hud) hud.hidden = false;
  requestAnimationFrame(image);
}

fetch("../monde/donnees.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((d) => demarrer(d.poles || []))
  /* L'île doit exister même si le fichier manque : on perd les bâtiments,
     pas le monde. Un écran noir ne dit rien à personne. */
  .catch(() => demarrer([]));
