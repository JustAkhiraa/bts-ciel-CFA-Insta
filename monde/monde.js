/* ═══════════════════════════════════════════════════════════════════════
   CIEL — les fiches du BTS dans un VILLAGE en trois dimensions.

   Quatre remarques d'JustAkhiraa ont fait ce fichier, et chacune a changé une
   décision de fond, pas un réglage.

   1. « Je dois me déplacer, c'est tellement pas ergonomique. »
      La première version donnait ZQSD, la molette et le clic-glissé : six
      commandes à apprendre pour atteindre un chapitre qu'un site ordinaire
      donne en un clic. **On ne pilote rien.** La caméra est sur un rail et
      va toute seule d'un lieu à l'autre.

   2. « C'est pas le ciel ça, mets un mode jour. »
      Il y a donc deux heures, et le choix se retient. Depuis, le ciel n'est
      plus un dégradé peint à la main mais le ciel de three.js — le modèle
      de Preetham, calculé depuis la position du soleil, avec ses nuages.
      C'est JustAkhiraa qui en a donné le lien.

   3. « Sur CodePen j'ai déjà vu des cartes Pokémon ultra stylées. »
      Les chapitres sont de vraies cartes HTML posées DANS la scène, avec la
      même caméra que le WebGL : nettes à toute distance, sélectionnables,
      lues par un lecteur d'écran, et capables du reflet holographique
      qu'une carte à collectionner porte.
      **La 3D fait le DÉCOR, le HTML fait le CONTENU.**

   4. « J'imagine un village avec des immeubles stylés, j'en ai mis un style
      Japon — tu pourras dire c'est la culture générale. On est dans une
      allée centrale avec fontaine au milieu, château au bout comme l'allée
      du château d'Hyrule. Et quand on clique sur un immeuble, on a un effet
      comme si on avançait vite et on arrive devant. »
      C'est ce fichier. Cinq matières, cinq bâtiments, et chaque bâtiment a
      sa SILHOUETTE : on reconnaît la matière à la forme, avant de lire son
      nom. Une information portée par la seule couleur se perd — celle-là
      est portée par la forme, la couleur ET le nom écrit.

         l'atelier et sa forge ......... Informatique & développement
         l'observatoire et son dôme .... Mathématiques
         la maison à colombages ........ Anglais
         la pagode et son torii ........ Culture générale
         le château au bout de l'allée . Réseaux & systèmes

      Le château est au bout parce que c'est la matière la plus longue : dix-
      sept chapitres, le plus de salles.

   5. « Il faut avoir la possibilité de se déplacer, et en gros je suis à
      côté de la fontaine, tu vois. »
      On est donc DEBOUT, à hauteur d'homme, à côté de la fontaine, et on
      peut marcher dans l'allée. Ce n'est pas un retour en arrière sur la
      première remarque : ce qui était insupportable, c'était de DEVOIR
      voler pour atteindre un chapitre. Ici la marche est un plaisir, jamais
      un passage obligé — un clic sur un bâtiment vous y emmène, et la
      boussole du bas y va aussi. On se promène si on veut.

   Ce qui n'a pas changé : le monde est INDÉPENDANT du site — il ne charge ni
   sa feuille de style ni ses quarante thèmes — mais ils partagent les mêmes
   DONNÉES, « donnees.json », engendré par publier.py depuis la carte des
   chapitres. Et les fiches se lisent ICI ; le lien vers la page ordinaire
   existe quand même, en second.

   three.js (r186, licence MIT) est la seule bibliothèque du dépôt, en local,
   jamais à un CDN. Aucun modèle 3D n'est téléchargé : tout ce qu'on voit est
   construit ici, en boîtes, cylindres et cônes, et les trois textures sont
   DESSINÉES au chargement dans un canvas. Le village entier pèse donc ce que
   pèse ce fichier.
   ═══════════════════════════════════════════════════════════════════════ */
import * as THREE from "./lib/three.module.js";
import { CSS3DRenderer, CSS3DObject, CSS3DSprite } from "./lib/CSS3DRenderer.js";
import { Sky } from "./lib/Sky.js";
import { mergeGeometries } from "./lib/BufferGeometryUtils.js";
import { ImprovedNoise } from "./lib/ImprovedNoise.js";

const $ = (id) => document.getElementById(id);
const toile      = $("scene");
const chargement = $("chargement");
const secours    = $("secours");
const hud        = $("hud");
const boussole   = $("boussole");
const aide       = $("aide");
const lecture    = $("lecture");

const ech = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const CALME = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Le titre de l'allée vit cinq secondes, le temps d'être lu. Sur un parvis
   il reste : là, il nomme ce qu'on est en train de choisir, et il a sa
   bande réservée. */
let minuteurTitre = 0;
function direPuisTaire() {
  clearTimeout(minuteurTitre);
  document.body.classList.remove("titre-parti");
  if (vue.matiere >= 0) return;
  minuteurTitre = setTimeout(
    () => document.body.classList.add("titre-parti"), 5200);
}

/* Le sous-titre : le nom de la matière, en bas, comme au cinéma, quand on
   regarde un bâtiment. JustAkhiraa : « écrire comme s'il y avait des sous-titres
   le nom de la matière, et la retirer au bout de 5 s ». Il part tout seul :
   une étiquette qui colle au pointeur devient un meuble au bout d'une
   minute. */
let minuteurSousTitre = 0, derniereVisee = "";
/* Le fond commun aux deux : la CLÉ dit ce qu'on regarde. Une clé de texte et
   non un numéro, parce que la matière 2 et la boutique 2 sont deux choses
   différentes — avec un numéro nu, viser l'une après l'autre ne rafraîchissait
   rien, et c'est le genre de collision qui ne se voit qu'une fois sur cinq. */
function direSousTitre(cle, titre, ligne, couleur) {
  const el = $("soustitre");
  if (!cle || cle === derniereVisee) return;
  derniereVisee = cle;
  el.innerHTML = `<b>${ech(titre)}</b><span>${ech(ligne)}</span>`;
  el.style.setProperty("--c", couleur);
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("vu"));
  clearTimeout(minuteurSousTitre);
  minuteurSousTitre = setTimeout(() => {
    el.classList.remove("vu");
    setTimeout(() => { el.hidden = true; derniereVisee = ""; }, 420);
  }, 5000);
}
function sousTitrer(i) {
  if (i < 0) return;
  const m = matieres[i];
  direSousTitre("m" + i, m.pole.titre,
    `${m.L.lieu} · ${m.pole.chapitres.length} chapitres · cliquez pour entrer`,
    m.css);
}
function nommerBoutique(i) {
  const b = BOUTIQUES[i];
  direSousTitre("b" + i, b.nom, "boutique · cliquez pour entrer",
                "#" + b.couleur.toString(16).padStart(6, "0"));
}
function taireSousTitre() {
  const el = $("soustitre");
  clearTimeout(minuteurSousTitre);
  el.classList.remove("vu");
  setTimeout(() => { el.hidden = true; }, 420);
  derniereVisee = "";
}

/* Les accents du site, rendus lumineux : les originaux sont taillés pour du
   papier clair et disparaîtraient sur un ciel de nuit. */
const COULEURS = {
  dev:     0x62E88A, reseau: 0x54BEF8, maths: 0xFF7B7B,
  anglais: 0xFFB05A, culture: 0xCE96FF,
};
/* … et leur version foncée pour le plein jour : les mêmes teintes sur un
   ciel clair seraient des taches pâles illisibles. */
const COULEURS_JOUR = {
  dev:     0x1F7A42, reseau: 0x14618F, maths: 0xA82C2C,
  anglais: 0x8F5300, culture: 0x6A34A8,
};
const ICONES = { dev: "</>", reseau: "⇄", maths: "∫", anglais: "EN", culture: "✦" };

/* ═══════════════════════════════════════════════ le plan du village ═══
   Un seul bloc de nombres pour toute la géographie. Les regrouper n'est pas
   de la coquetterie : la distance de la caméra, la longueur de l'allée, la
   place des lampadaires et le cadrage du téléphone sont TOUS calculés depuis
   ces valeurs. Éparpillées, une correction de largeur en laissait trois
   autres derrière elle.

   L'allée court le long de l'axe Z : le village commence au portail (Z
   positif, où l'on arrive) et finit au château (Z négatif). Un bâtiment est
   construit face au +Z, puis tourné vers l'allée. */
const V = {
  demiAllee:  46,     // largeur pavée / 2
  zPortail:   270,    // le portail : d'où l'on regarde le village
  zChateau:  -310,    // la façade du château
  xBat:       118,    // l'écart des bâtiments à l'axe
  zProche:    112,    // les deux premiers bâtiments
  zLoin:      -78,    // les deux suivants
  tour:       0.92,   // leur rotation vers l'allée, en radians (≈ 53°)
  zFontaine:  46,
  rFontaine:  20,
};
/* ═══════════════════════════════════════════════════ LE RELIEF ════════
   JustAkhiraa : « agrandir l'espace de déplacement de X10 » et « aussi je
   déteste les murs invisibles ».

   Les deux demandes n'en font qu'une. Ce qui bornait le village était une
   BOÎTE : « x: 250, zMin: -158, zMax: 340 ». Rien ne la montrait, et elle
   arrêtait net — on marchait vers le château et on se cognait à rien, à
   cent cinquante unités devant sa façade. Un mur qu'on ne voit pas n'est pas
   une limite, c'est une panne.

   La réponse n'est pas de pousser la boîte plus loin : c'est de la
   remplacer par un relief. Le village est désormais au fond d'une VALLÉE.
   On marche sur le sol — la caméra suit sa hauteur —, on monte les pentes
   douces, et ce qui arrête, c'est une montagne qu'on voit depuis le portail.
   La règle devient prévisible : *on ne grimpe pas une falaise.* Une
   contrainte qu'on perçoit n'est plus une frustration (Norman) ; une
   contrainte invisible l'est toujours.

   Le compte, puisqu'il a demandé « X10 » :
     avant  — 500 × 498, soit 249 000 unités²
     après  — un disque de 1250 de rayon, soit 4 909 000 unités²
     rapport : **×19,7**. Au-delà du compte demandé, et borné par la seule
     chose qui compte vraiment : la distance à laquelle on voit encore où
     l'on va.

   UN SEUL bruit pour tout le monde. Le maillage des collines et le calcul
   du pas lisent la même fonction : deux formules séparées finissent toujours
   par diverger, et le jour où elles divergent on marche dans le vide ou dans
   la roche. */
/* L'échelle humaine, déclarée AVANT tout ce qui bâtit. Elle vivait au milieu
   du fichier, après la rue, et la campagne — écrite plus haut — ne pouvait pas
   la lire : « Cannot access 'TAILLE_HOMME' before initialization ». Une mesure
   dont dépend la moitié du village se déclare avec le plan du village. */
const TAILLE_HOMME = 16.4;   // un cheveu sous l'œil : on voit le sommet du crâne

/* ── Une limite qui n'arrête pas n'est pas une limite ────────────────────
   « Pas de mur invisible, ok. » D'accord — encore faut-il qu'il y ait une
   limite. L'audit l'a dit sans appel : sur soixante-douze caps, **soixante et
   un n'étaient arrêtés par rien**. On franchissait la crête et on marchait
   jusqu'à douze mille huit cents unités, c'est-à-dire bien au-delà du
   maillage du terrain — dans le vide.

   La cause est arithmétique et elle était sous mon nez : la montagne montait
   de 260 unités sur 550, soit une pente de **0,47**, quand la règle de marche
   refuse à partir de **0,62**. J'avais écrit les deux nombres à deux endroits
   différents sans jamais les comparer. Supprimer un mur invisible ne consiste
   pas à retirer la borne : il faut que le relief fasse le travail que la
   borne faisait, et pour cela il doit être assez raide.

   Le profil est donc refait en trois temps, et chacun a un rôle :
     · jusqu'à 1150 — la plaine, strictement plate : c'est le village ;
     · de 1150 à 1300 — des contreforts à 0,30 de pente : on les monte, on
       voit la vallée de haut, et c'est agréable ;
     · de 1300 à 1850 — la montagne à **1,35 de pente**, soit plus du double
       du seuil. Là, on ne passe plus, et on voit pourquoi : il y a une
       paroi devant soi.
   La marge entre 1,35 et 0,62 n'est pas du luxe : le bruit du relief ajoute
   des creux locaux, et un seul creux sous le seuil rouvrirait un passage
   vers le vide. */
/* Le rayon de la ceinture et ses huit secteurs. Déclarés ICI, avec les autres
   dimensions du monde, et non dans le bloc qui les construit : les placettes
   de fin de chemin s'en servent, et elles sont bâties avant. Le monde ne se
   chargeait plus — « Cannot access 'R_BORD' before initialization ». Une
   dimension du monde se déclare avec le plan du monde ; c'est la deuxième
   fois aujourd'hui, après TAILLE_HOMME, et la leçon est la même. */
const R_BORD = 1500;                 // le rayon de la ceinture
const BORDURE_SECTEURS = [
  "fleuve", "muraille", "falaise", "foret",
  "marais", "ruines", "ravin", "palissade",
];
/* Quel obstacle à ce cap ? Les huit secteurs se partagent le tour. */
function secteurBordure(x, z) {
  const a = Math.atan2(z, x) + Math.PI;                  // 0 … 2π
  return BORDURE_SECTEURS[Math.floor(a / (Math.PI * 2) * 8) % 8];
}

const RELIEF = {
  /* La plaine va désormais jusqu'à la ceinture : ce n'est plus le relief qui
     arrête, ce sont les huit obstacles de la bordure. La montagne devient ce
     qu'elle aurait toujours dû être — un FOND. On la voit de partout, on ne
     la touche jamais, et elle n'a plus à être raide pour une raison de
     mécanique. */
  rPlaine: 1560,   // la plaine marchable, strictement plate
  rPied:   1660,   // le pied de la montagne, derrière la ceinture
  rCrete:  2400,   // la crête
  hPied:   50,
  hMont:   820,
  etendue: 7000,
};
const _bruitRelief = new ImprovedNoise();
/* La hauteur du sol en un point. Zéro sur toute la plaine — le village est
   bâti à plat, et il doit le rester —, puis une montée en douceur jusqu'à la
   crête. Le « lissage » (3t² − 2t³) évite la cassure nette qu'une rampe
   linéaire laisse voir au raccord. */
function hauteurSol(x, z) {
  const d = Math.hypot(x, z);
  if (d <= RELIEF.rPlaine) return 0;
  /* Le bruit ne sert qu'à casser la régularité du cône : il est RELATIF à la
     hauteur atteinte, pas additionné en valeur absolue. Ajouté en dur, il
     creusait des cuvettes de cent quatre-vingt-dix unités dans les
     contreforts — et une cuvette dans une pente, c'est un passage. */
  const bosses = 1 + (_bruitRelief.noise(x / 640, z / 640, 0.7) * 0.22
                    + _bruitRelief.noise(x / 185, z / 185, 3.1) * 0.08);
  if (d <= RELIEF.rPied) {
    const t = (d - RELIEF.rPlaine) / (RELIEF.rPied - RELIEF.rPlaine);
    return RELIEF.hPied * t * t * (3 - 2 * t) * bosses;
  }
  const t = Math.min(1, (d - RELIEF.rPied) / (RELIEF.rCrete - RELIEF.rPied));
  /* « t » puissance 0,8 plutôt que lissé : on veut que ça monte RAIDE dès le
     premier mètre. Un raccord doux ici laisserait une rampe praticable juste
     au pied de la paroi. */
  return (RELIEF.hPied + (RELIEF.hMont - RELIEF.hPied) * Math.pow(t, 0.8)) * bosses;
}

/* ═══════════════════════════════════ LE PLAN, EN ENTIER, D'ABORD ══════
   Trois fois dans la même séance, le monde a refusé de se charger pour la
   même raison : « Cannot access X before initialization » — TAILLE_HOMME,
   puis R_BORD, puis CHEMINS. À chaque fois j'ai déplacé la constante fautive
   et recommencé, et à chaque fois la suivante est tombée.

   Ce n'étaient pas trois incidents, c'était un seul défaut d'architecture :
   le PLAN du village — ses dimensions, ses routes, ses limites — était
   éparpillé au milieu des bâtisseurs, chacun déclaré juste avant celui qui
   s'en servait le plus. Il suffit qu'un nouveau bâtisseur arrive plus tôt
   pour que tout casse.

   Le plan est donc entièrement regroupé ici, avant la première pierre.
   Rien, dans ce bloc, ne construit quoi que ce soit : ce sont des nombres et
   des fonctions pures. Tout ce qui bâtit vient après et peut tout consulter,
   dans n'importe quel ordre. */

/* ── Le réseau des chemins, AVANT tout ce qui se bâtit ───────────────────
   Première version : les chemins étaient tracés dans le bloc « campagne »,
   c'est-à-dire APRÈS la rue. Résultat vu à l'écran — le chemin du lac
   traversait trois maisons de la troisième rangée, et l'on se retrouvait dans
   un mur en le suivant.

   La faute n'est pas un oubli de vérification, c'est un ORDRE. Le commentaire
   de la campagne dit « la route vient d'abord, les façades la suivent » ; le
   code faisait l'inverse. Un principe qu'on énonce et qu'on n'applique pas ne
   protège de rien.

   Les cinq tracés sont donc déclarés ici, avant la rue, avant la campagne, et
   tout ce qui bâtit les consulte. Ils ne vont pas droit : un chemin droit
   entre deux points est une route moderne, tracée sur un plan. Les chemins de
   village contournent, et c'est leur courbure qui fait qu'on ne voit pas où
   ils mènent — donc qu'on a envie de les suivre. */
/* ── Un réseau, pas une étoile ───────────────────────────────────────────
   Première version : cinq chemins partant du bourg et s'arrêtant à sept cents
   unités, dans une plaine qui en fait mille deux cent cinquante. Deux défauts
   mesurés plutôt que soupçonnés.

   Le premier est un compte : vingt maisons dehors. Des routes courtes ne
   portent pas de village — la longueur disponible EST le budget de maisons,
   et je l'avais fixée sans la relier à la taille de la plaine.

   Le second est de forme, et c'est exactement son reproche : une étoile de
   culs-de-sac n'a pas plus de « queue ni tête » qu'un peigne. On en sort,
   on fait demi-tour, on revient. Un pays se parcourt en BOUCLE. Les cinq
   branches vont donc maintenant jusqu'au pied des montagnes, et une route
   de ceinture les relie entre elles. À partir de là, se promener a un sens :
   on peut partir d'un côté et revenir par l'autre. */
const CHEMINS = {
  /* Chaque branche court jusqu'à la CEINTURE : elle y trouve une placette,
     une arche et un poteau indicateur. Un chemin qui s'arrête au milieu d'un
     pré promet quelque chose qu'il ne tient pas. */
  lac: [[-62, 150], [-168, 196], [-262, 178], [-344, 128], [-430, 92],
        [-556, 2], [-676, -96], [-790, -176], [-880, -236],
        [-1070, -330], [-1250, -392], [-1412, -404]],
  parc: [[62, 182], [168, 252], [268, 318], [372, 374], [452, 408],
         [566, 470], [668, 556], [742, 660], [788, 772],
         [856, 920], [920, 1080], [950, 1210]],
  bibli: [[-62, -188], [-152, -258], [-238, -344], [-326, -432], [-396, -492],
          [-452, -596], [-470, -714], [-446, -828], [-390, -918],
          [-392, -1070], [-430, -1230], [-470, -1380]],
  est: [[62, 40], [226, -6], [396, -58], [562, -100], [706, -126],
        [828, -140], [930, -132], [1000, -104],
        [1140, -110], [1290, -140], [1420, -170]],
  nord: [[-62, -40], [-196, 148], [-286, 358], [-306, 548], [-274, 688],
         [-196, 806], [-82, 888], [60, 930], [196, 920],
         [300, 1040], [360, 1210], [380, 1380]],
};
/* La ceinture : elle ne part de nulle part et ne mène nulle part, et c'est
   justement ce qui en fait une route de campagne. Elle croise les cinq
   branches, et chaque croisement devient un lieu. */
CHEMINS.ceinture = [[-556, 2], [-452, -300], [-396, -492], [-150, -640],
                    [180, -620], [430, -470], [600, -230], [706, -126],
                    [760, 120], [742, 400], [566, 470], [330, 590],
                    [60, 640], [-196, 560], [-306, 300], [-344, 128],
                    [-430, 92], [-556, 2]];
/* Les chemins étaient trop étroits pour se lire de loin : vingt unités de
   large vus d'en haut, c'est un fil. Une route de village fait la largeur de
   deux charrettes — on la double, et elle devient ce qu'elle doit être :
   la première chose qu'on voit du paysage, celle qui explique tout le reste. */
const LARGEURS = { lac: [38, 22], parc: [38, 24], bibli: [34, 22],
                   est: [42, 24], nord: [34, 20], ceinture: [26, 26] };

/* ── Les noyaux : là où le village se resserre ───────────────────────────
   Deuxième reproche de JustAkhiraa, et le plus juste : « ça n'a ni queue ni
   tête ». Les maisons semées régulièrement le long d'une route donnent un
   ruban, pas un pays. Or ce qui rend un paysage lisible, ce n'est pas le
   nombre de maisons, c'est le CONTRASTE de densité : serré ici, vide là.

   Chaque chemin porte donc deux ou trois noyaux — une distance depuis le
   bourg où les maisons se serrent. Entre deux noyaux, presque rien : des
   champs, un arbre, un muret. C'est cet écart qui fait qu'on sait, en
   marchant, qu'on quitte un hameau et qu'on en rejoint un autre. */
const NOYAUX = {
  lac:   [{ s: 80, r: 120 }, { s: 330, r: 130 }, { s: 620, r: 120 },
          { s: 1020, r: 130 }],
  parc:  [{ s: 90, r: 125 }, { s: 350, r: 140 }, { s: 660, r: 125 },
          { s: 1060, r: 130 }],
  bibli: [{ s: 85, r: 120 }, { s: 330, r: 130 }, { s: 640, r: 120 },
          { s: 1040, r: 130 }],
  est:   [{ s: 95, r: 130 }, { s: 400, r: 145 }, { s: 720, r: 135 },
          { s: 1120, r: 130 }],
  nord:  [{ s: 90, r: 125 }, { s: 410, r: 140 }, { s: 760, r: 130 },
          { s: 1140, r: 130 }],
  /* Sur la ceinture, les maisons se serrent aux CROISEMENTS : c'est là que
     naissent les hameaux, parce que c'est là qu'on se rencontre. */
  ceinture: [{ s: 300, r: 110 }, { s: 760, r: 120 }, { s: 1250, r: 115 },
             { s: 1700, r: 110 }, { s: 2150, r: 115 }],
};

/* La distance d'un point à un segment — la seule façon honnête de savoir si
   l'on est « sur la route ». Comparer aux SOMMETS du tracé ne suffit pas :
   entre deux sommets distants de cent unités, tout le milieu passerait pour
   libre. */
function _distSegment(x, z, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2)) : 0;
  return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
}
function surUnChemin(x, z, marge) {
  for (const pts of Object.values(CHEMINS))
    for (let i = 0; i < pts.length - 1; i++)
      if (_distSegment(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
          < marge) return true;
  return false;
}


/* La position et la direction sur un chemin, à une distance donnée du
   départ. C'est ce qui permet de poser une maison « au bord de la route » au
   lieu de la poser « en (x, z) ». */
function surChemin(pts, s) {
  let reste = s;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (reste <= L || i === pts.length - 2) {
      const k = Math.max(0, Math.min(1, reste / L));
      return { x: x0 + dx * k, z: z0 + dz * k,
               cap: Math.atan2(dx, dz), fini: reste > L };
    }
    reste -= L;
  }
  return null;
}
function longueurChemin(pts) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++)
    L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return L;
}


/* Les cinq emplacements, par matière. « forme » est la silhouette, « rot »
   la rotation : la façade d'un bâtiment de gauche doit regarder vers +X ET
   vers +Z, c'est-à-dire vers celui qui remonte l'allée. */
const LIEUX = {
  dev:     { x: -V.xBat, z: V.zProche, rot:  V.tour, forme: "atelier",
             lieu: "L'atelier", quoi: "la forge et sa cheminée" },
  maths:   { x:  V.xBat, z: V.zProche, rot: -V.tour, forme: "observatoire",
             lieu: "L'observatoire", quoi: "le dôme et sa lunette" },
  anglais: { x: -V.xBat, z: V.zLoin,   rot:  V.tour, forme: "colombages",
             lieu: "La maison anglaise", quoi: "les colombages et l'enseigne" },
  culture: { x:  V.xBat, z: V.zLoin,   rot: -V.tour, forme: "pagode",
             lieu: "La pagode", quoi: "les trois toits et le torii" },
  reseau:  { x: 0, z: V.zChateau, rot: 0, forme: "chateau",
             lieu: "Le château", quoi: "les tours et la grande parabole" },
};

/* Les deux heures. Le ciel n'est plus une paire de couleurs : c'est une
   POSITION DE SOLEIL, et tout le reste en découle — la couleur de la brume,
   l'inclinaison de la lumière, les ombres qu'on ne dessine pas, et jusqu'aux
   fenêtres qui s'allument. */
const HEURES = {
  nuit: {
    hauteurSoleil: -8, azimutSoleil: 100,
    hauteurLumiere: 30, azimutLumiere: 285,
    turbidite: 7, rayleigh: 1.35, mie: 0.006, mieG: 0.80,
    nuages: 0.30, densiteNuages: 0.34, expo: 0.92,
    /* La brume suit le monde. Elle valait [180, 1250] quand le marchable
       faisait 500 unités : la crête des montagnes, à 1400, tombait derrière
       le voile et la vallée n'existait plus. Elle porte maintenant jusqu'à
       2600 — assez pour qu'on voie où l'on est, pas assez pour que l'horizon
       devienne net et plat. */
    brume: [220, 2600], brumeCouleur: 0x1B2C48,
    ciel: 0x4A6E9E, sol: 0x232C3E,      // la lumière d'ambiance, haut et bas
    /* ── Une nuit se voit en bleu, pas en vert ────────────────────────────
       L'herbe était cinq fois trop sombre ; corrigée, elle a rendu la plaine
       nocturne VERTE et lumineuse sous un ciel noir — un gazon de plein jour
       éclairé par rien. La faute n'est pas l'albédo, c'est la lune : à 1,10
       et presque blanche, elle écrasait l'ambiance bleue et laissait passer
       la couleur propre de l'herbe.

       On ne retire pas de la lumière — il s'est plaint que « la nuit on voit
       pas bien », et c'est la demande qui compte. On la DÉPLACE : la lune
       baisse à 0,62 et se refroidit, l'ambiance bleue monte à 1,18. Le total
       reçu par une surface tournée vers le haut reste du même ordre, mais il
       vient maintenant du ciel, donc il est bleu. C'est aussi ce que fait
       l'œil : de nuit il perd la couleur et glisse vers le bleu. */
    ambiance: 1.18, soleil: 0.62, couleurSoleil: 0xA8BEEC, reflets: 0.30,
    etoiles: 0.70, lune: 1,
    fenetres: 0xFFC066, lanternes: 0xFFB454, veilleuse: 1,
    cone: 0.055, flaque: 0.32,
  },
  jour: {
    hauteurSoleil: 27, azimutSoleil: 100,
    hauteurLumiere: 27, azimutLumiere: 100,
    turbidite: 4.2, rayleigh: 2.2, mie: 0.005, mieG: 0.78,
    nuages: 0.44, densiteNuages: 0.46, expo: 0.55,
    brume: [360, 3400], brumeCouleur: 0xBFD6E8,
    ciel: 0xBBD6F2, sol: 0x8C8368,
    ambiance: 0.45, soleil: 3.00, couleurSoleil: 0xFFF6E2, reflets: 0.16,
    etoiles: 0, lune: 0,
    fenetres: 0x2B3A4E, lanternes: 0x6E6A60, veilleuse: 0,
    cone: 0, flaque: 0,
  },
};

/* ── Le repli ───────────────────────────────────────────────────────── */
function abandonner(quoi) {
  chargement.hidden = true;
  $("secours-quoi").textContent = quoi;
  secours.hidden = false;
  throw new Error(quoi);
}
function webglDispo() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) { return false; }
}
if (!webglDispo()) abandonner("WebGL n'est pas disponible sur ce navigateur.");

let DONNEES;
try {
  const r = await fetch("donnees.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(r.status);
  DONNEES = await r.json();
} catch (e) {
  abandonner("Les données du monde n'ont pas pu être chargées. " +
             "Si la page est ouverte depuis un fichier local, il faut un serveur.");
}

/* ═══════════════════════════════════════════════ la scène ═══════════ */
const scene = new THREE.Scene();
/* La brume porte la couleur de l'HORIZON, jamais celle du zénith : c'est
   elle qui fait fondre le bout de l'allée dans le ciel au lieu de le noyer
   dans du noir. Sur une allée de six cents unités, c'est elle qui donne la
   profondeur — sans elle, le château au bout paraît à trois pas. */
scene.fog = new THREE.Fog(0x1B2C48, 180, 1250);

/* Le plan proche vaut 3, et non 1. C'est lui qui commande la précision de la
   PROFONDEUR sur toute la scène : un tampon en 16 bits — ce qu'ont beaucoup de
   téléphones — ne distingue à 150 unités que 0,34 unité avec un plan proche à
   1, contre 0,11 avec un plan proche à 3. Rien n'est jamais plus près que
   trois unités de l'œil : la caméra est à hauteur d'homme et les obstacles la
   repoussent avant qu'elle ne touche un mur. C'est donc trois unités gagnées
   sur rien, et trois fois moins de surfaces qui clignotent. */
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 3, 6000);
const rendu = new THREE.WebGLRenderer({
  canvas: toile, antialias: devicePixelRatio < 2, powerPreference: "high-performance",
});
rendu.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
rendu.setSize(innerWidth, innerHeight);
rendu.outputColorSpace = THREE.SRGBColorSpace;
/* Le ciel de Preetham rend des luminances physiques, très au-delà de 1 :
   sans cartographie de tons il serait un aplat blanc. C'est le réglage de
   l'exemple three.js dont JustAkhiraa a donné le lien. Il s'applique à TOUTE la
   scène, donc les couleurs du village sont choisies après lui, pas avant. */
rendu.toneMapping = THREE.ACESFilmicToneMapping;
rendu.toneMappingExposure = HEURES.nuit.expo;
/* Les ombres. Une seule carte d'ombres pour tout le village, celle du
   soleil — et c'est elle qui pose les maisons sur le sol. Sans elle, en
   plein jour, chaque bâtiment paraît collé sur le décor : on l'avait sous
   les yeux avant de l'ajouter, et c'est le défaut le plus difficile à
   NOMMER quand on le regarde.

   Elle est abordable parce que le bourg est fondu : les cinquante maisons
   du fond ne sont que sept objets, donc sept objets à redessiner dans la
   passe d'ombre. Sans la fonte, elle aurait doublé le coût de la scène. */
rendu.shadowMap.enabled = true;
rendu.shadowMap.type = THREE.PCFSoftShadowMap;

/* ── Le second rendu : les cartes, en HTML, DANS la scène ───────────────
   JustAkhiraa, après une version où les cartes étaient posées à plat par-dessus :
   « y'a plus rien de 3D là, c'est ridicule ». Il avait raison — j'avais
   retiré la 3D au lieu de la rendre lisible.

   CSS3DRenderer place de VRAIS éléments HTML dans la scène, avec la même
   caméra que le WebGL : les cartes ont une position, une orientation et une
   perspective réelles, elles s'éloignent, se penchent et défilent avec le
   village — tout en restant du texte net. Les deux couches partagent la
   caméra à l'image près : il suffit que les deux rendus soient appelés dans
   la même boucle. */
const rendu3D = new CSS3DRenderer();
rendu3D.setSize(innerWidth, innerHeight);
rendu3D.domElement.className = "calque3d";
document.body.appendChild(rendu3D.domElement);
const monde3D = new THREE.Scene();

/* ── La lumière ─────────────────────────────────────────────────────────
   Pas une seule ombre portée dans tout le village : une carte d'ombres pour
   deux cents objets coûterait le double d'images par seconde, sur un
   téléphone la moitié. À la place, trois lumières qui ne coûtent rien et
   une tache sombre peinte sous chaque bâtiment (« contact »). Le relief
   vient de la HÉMISPHÉRIQUE : elle éclaire le dessus des choses avec la
   couleur du ciel et leur dessous avec celle du sol. C'est le seul truc
   d'extérieur qui rende un volume lisible sans ombre. */
const hemi = new THREE.HemisphereLight(0x4A6E9E, 0x232C3E, 0.95);
scene.add(hemi);
const soleil = new THREE.DirectionalLight(0xC6D6FF, 1.15);
soleil.castShadow = true;
soleil.shadow.mapSize.set(2048, 2048);
/* Le cadre de l'ombre couvre le village et rien de plus : l'étaler sur les
   collines diviserait la finesse par quatre pour des ombres que personne
   ne regarde. */
const OMBRE_CADRE = 430;   // la demi-largeur du cadre d'ombre, partagée
{
  const C = OMBRE_CADRE, o = soleil.shadow.camera;
  o.left = -C; o.right = C; o.top = C; o.bottom = -C;
  o.near = 260; o.far = 1900;
  /* Le « normalBias » décale le point testé le long de sa normale : c'est
     lui qui supprime les rayures d'ombre sur les grandes faces plates, et
     un simple « bias » n'y suffit pas à cette échelle. */
  soleil.shadow.bias = -0.0004;
  /* 1,4 unité de décalage effaçait l'ombre des habitants, qui ne font que
     quatre unités de large. */
  soleil.shadow.normalBias = 0.55;
}
scene.add(soleil);
/* Une seconde directionnelle, à l'opposé et faible : elle déboucher les
   faces que le soleil laisse dans le noir absolu. Un bâtiment dont une face
   est noire n'a plus de silhouette lisible, et c'est sur la silhouette que
   repose toute la reconnaissance des matières. */
const contre = new THREE.DirectionalLight(0x8FA8D8, 0.18);
contre.position.set(-80, 60, 120);
scene.add(contre);

/* ── Le ciel ─────────────────────────────────────────────────────────── */
const ciel = new Sky();
ciel.scale.setScalar(5000);
scene.add(ciel);
const uCiel = ciel.material.uniforms;
const dirSoleil = new THREE.Vector3();
const dirLumiere = new THREE.Vector3();

/* L'environnement : le ciel lui-même, cuit en carte de reflets. C'est la
   technique de l'exemple « materials / car » qu'JustAkhiraa a fourni — et c'est
   ce qui fait qu'un dôme de cuivre a la couleur du ciel du moment au lieu
   d'un vert plat. On ne la recalcule qu'au changement d'heure.

   Le « far » est donné à la main : le ciel est une boîte mise à l'échelle
   cinq mille, et la valeur par défaut (cent) la coupe entièrement. */
const pmrem = new THREE.PMREMGenerator(rendu);
function cuireEnvironnement() {
  const avant = scene.environment;
  scene.environment = pmrem.fromScene(ciel, 0, 1, 20000).texture;
  if (avant) avant.dispose();
}

function versDirection(out, hauteurDeg, azimutDeg) {
  return out.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - hauteurDeg),
                                       THREE.MathUtils.degToRad(azimutDeg));
}
function poserSoleil(H) {
  versDirection(dirSoleil, H.hauteurSoleil, H.azimutSoleil);
  uCiel.sunPosition.value.copy(dirSoleil);
  versDirection(dirLumiere, H.hauteurLumiere, H.azimutLumiere);
  soleil.position.copy(dirLumiere).multiplyScalar(900);
  /* La lune se pose LÀ D'OÙ VIENT la lumière. Une lune à gauche et des
     ombres qui partent à droite : personne ne sait dire ce qui cloche,
     mais tout le monde voit que quelque chose cloche. */
  lune.position.copy(dirLumiere).multiplyScalar(2300);
  lune.lookAt(0, 0, 0);
  /* Le soleil se pose là où le CIEL le met — pas là d'où vient la lumière
     d'appoint. Les deux directions diffèrent la nuit, et c'est voulu : la
     lune éclaire, le soleil est sous l'horizon. De jour elles coïncident, et
     le disque tombe donc exactement sur la tache claire du ciel de Preetham,
     ce qui est la seule façon que les deux ne se contredisent pas. */
  astre.position.copy(dirSoleil).multiplyScalar(2050);
  astre.lookAt(0, 0, 0);
  /* Un soleil sous l'horizon n'est pas un soleil : c'est une lampe posée dans
     l'herbe. On le cache, comme le disque de Sky.js. */
  astre.visible = H.hauteurSoleil > 2;
}

/* ── La lune et les étoiles ──────────────────────────────────────────────
   Le ciel de Preetham ne connaît qu'un astre, le soleil. La nuit, il le
   place sous l'horizon : il reste un bleu profond, très juste, mais vide.
   La lune et les étoiles sont donc à nous. Et rien sous l'horizon — des
   étoiles dans le sol, c'est exactement ce qui faisait « espace » au lieu
   de « ciel ». */
const lune = new THREE.Mesh(
  new THREE.CircleGeometry(52, 40),
  new THREE.MeshBasicMaterial({ color: 0xF2F6FF, fog: false,
                                transparent: true, opacity: 1 }));
scene.add(lune);

/* ── Le soleil, pour de bon ──────────────────────────────────────────────
   « si possible mettre un soleil », puis « met un soleil » — redemandé.
   J'avais cru régler l'affaire en allumant « showSunDisc » dans Sky.js. Le
   drapeau était bien mis : le disque de Preetham existe, mais il fait le
   demi-degré du vrai soleil, et sous une exposition de 0,55 il se noie dans
   le blanc du ciel. Techniquement présent, visuellement absent — et c'est
   « absent » qui compte, puisque la demande revient.

   On en dessine donc un, comme la lune en a un. Trois disques : le cœur, un
   halo serré, un halo large. L'empilement vaut mieux qu'un seul disque flou,
   parce que c'est la DÉCROISSANCE de la lumière qui fait qu'on lit un astre
   et non une pastille collée sur le ciel.

   « fog: false » et « depthWrite: false » vont ensemble : sans le premier, la
   brume l'éteint à deux mille unités ; sans le second, les halos se découpent
   les uns sur les autres et l'on voit trois anneaux. */
const astre = new THREE.Group();
{
  const couche = (r, couleur, opacite) => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 48),
      new THREE.MeshBasicMaterial({ color: couleur, fog: false, depthWrite: false,
                                    /* Le soleil échappe à la correction de
                                       tonalité. Sans « toneMapped: false », un
                                       blanc pur ressort à 202 sur 255 sous une
                                       exposition de 0,55 — plus SOMBRE que le
                                       ciel de Preetham, qui, lui, n'y passe
                                       pas. Mon premier soleil était donc un
                                       disque gris sur un ciel blanc : dessiné,
                                       invisible, et donc redemandé. */
                                    toneMapped: false,
                                    transparent: true, opacity: opacite }));
    astre.add(m);
    return m;
  };
  /* L'ambre n'est pas un choix de goût, c'est le seul qui se voie. Autour du
     soleil, le ciel de Preetham est déjà blanc à 235·244·249 : un disque blanc
     n'en diffère que de 23 sur 255, soit rien. Mesuré sur trois palettes, le
     même disque en ambre s'en détache de 92. Ce qui manque à un soleil posé
     dans une tache claire, ce n'est pas de la lumière — c'est de la couleur. */
  couche(150, 0xFFB54A, 0.16);   // le halo large
  couche(92,  0xFFCE72, 0.30);   // le halo serré
  couche(46,  0xFFE9A0, 1);      // le cœur
}
/* Après le dôme du ciel, pas avant. Posé à −1, le soleil se dessinait EN
   PREMIER et le ciel — qui ne teste ni n'écrit la profondeur — repeignait
   par-dessus. L'ordre de rendu ne dit pas « au fond » : il dit « d'abord ».
   À 1, le soleil passe après le ciel ; et comme il teste toujours la
   profondeur sans l'écrire, les bâtiments le cachent quand même. */
astre.renderOrder = 1;
scene.add(astre);

const matEtoiles = new THREE.PointsMaterial({
  color: 0xC9DDFF, size: 2.4, sizeAttenuation: false,
  transparent: true, opacity: 0.7, fog: false, depthWrite: false });
{
  const n = 1600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = 0.06 + Math.random() * 0.9;
    const r = 2200 + Math.random() * 900;
    const s = Math.sqrt(1 - v * v);
    pos.set([Math.cos(u) * s * r, v * r, Math.sin(u) * s * r], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, matEtoiles));
}

/* ═══════════════════════════════════════ les textures dessinées ══════
   Aucun fichier d'image dans le village : trois textures suffisent, et on
   les DESSINE au chargement dans un canvas. Un pavé peint à la main coûte
   quatre kilo-octets de code et zéro téléchargement ; la même chose en PNG
   coûterait cent fois plus et un aller-retour réseau. */
function toileCarree(n) {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  return [c, c.getContext("2d")];
}
function enTexture(c, repete) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repete, repete);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, rendu.capabilities.getMaxAnisotropy());
  return t;
}

/* Le pavé de l'allée : des rangs décalés, chaque pavé d'un gris un peu
   différent, et un joint plus sombre. Le décalage d'un rang sur deux est ce
   qui empêche l'œil de voir la grille — sans lui, on lit un damier. */
function texturePaves() {
  const N = 512, [c, g] = toileCarree(N);
  g.fillStyle = "#4A473F"; g.fillRect(0, 0, N, N);
  const rangs = 8, hp = N / rangs;
  for (let r = 0; r < rangs; r++) {
    const large = r % 2 ? 1.35 : 1;
    const lp = N / (rangs * large);
    const decal = r % 2 ? lp / 2 : 0;
    for (let k = -1; k < rangs * large + 1; k++) {
      const x = k * lp + decal, y = r * hp;
      const v = 132 + Math.floor(Math.random() * 46);
      g.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
      const j = 1.6;
      if (g.roundRect) {
        g.beginPath();
        g.roundRect(x + j, y + j, lp - j * 2, hp - j * 2, 2.5);
        g.fill();
      } else {
        /* roundRect est récent. Sans lui le pavé est à angle vif : moins
           joli, mais un village pavé plutôt qu'un village nu. */
        g.fillRect(x + j, y + j, lp - j * 2, hp - j * 2);
      }
      /* Un éclat clair en haut du pavé et une ombre en bas : c'est ce
         demi-ton qui fait qu'un pavé est bombé et non collé. */
      g.fillStyle = "rgba(255,255,255,.10)";
      g.fillRect(x + j + 1, y + j + 1, lp - j * 2 - 2, 2);
      g.fillStyle = "rgba(0,0,0,.14)";
      g.fillRect(x + j + 1, y + hp - j - 3, lp - j * 2 - 2, 2);
    }
  }
  return enTexture(c, 10);
}

/* La terre et l'herbe autour de l'allée : un bruit de touffes, pas un
   aplat. Un aplat vert se voit immédiatement comme du carton. */
/* ── L'herbe était cinq fois trop sombre ─────────────────────────────────
   Trouvé en sortant du village, et seulement parce qu'on peut en sortir : la
   plaine était NOIRE en plein jour. Pas « sombre » — noire, avec quelques
   brins visibles dedans.

   Mesuré plutôt que jugé à l'œil : la texture valait #43542F, multipliée par
   la teinte du matériau #8C9E6E, soit un albédo de #253414 — **0,029 de
   luminance linéaire**. Une herbe réelle en réfléchit 0,15 à 0,25. Le sol du
   village était donc cinq fois plus sombre qu'une pelouse, et seul le pavé,
   bien plus clair, sauvait les abords de la fontaine.

   Le défaut ne datait pas d'aujourd'hui. Il était invisible parce que la
   boîte de déplacement retenait le marcheur au milieu du pavé : on ne voyait
   jamais assez d'herbe d'un coup pour s'en apercevoir. Deux fautes qui se
   cachaient l'une l'autre.

   Nouvelles valeurs : texture #7A9654 × teinte #C2CBA8 = albédo #5D7737,
   soit **0,158** — dans la fourchette, sans virer au vert fluo. Les brins
   sont éclaircis du même rapport (×1,8) pour que le grain demeure : éclaircir
   le fond seul aurait donné une moquette. */
function textureHerbe() {
  const N = 256, [c, g] = toileCarree(N);
  g.fillStyle = "#7A9654"; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * N, y = Math.random() * N;
    const v = Math.random();
    g.fillStyle = v > 0.72 ? "rgba(220,255,155,.55)"
               : v > 0.42 ? "rgba(104,137,72,.6)" : "rgba(166,209,115,.45)";
    g.fillRect(x, y, 1 + Math.random() * 2.4, 1 + Math.random() * 3.6);
  }
  return enTexture(c, 26);
}

/* Le halo : un disque dégradé, utilisé deux fois — la lueur des lampadaires
   la nuit, et la tache d'ombre sous chaque bâtiment le jour. Le même dessin
   sert aux deux parce que c'est le même objet mathématique. */
function textureHalo(couleurCentre, couleurBord) {
  const N = 128, [c, g] = toileCarree(N);
  const d = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  d.addColorStop(0, couleurCentre);
  d.addColorStop(0.45, couleurCentre.replace(/[\d.]+\)$/, "0.34)"));
  d.addColorStop(1, couleurBord);
  g.fillStyle = d; g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX = {
  paves: texturePaves(),
  herbe: textureHerbe(),
  lueur: textureHalo("rgba(255,196,110,1)", "rgba(255,196,110,0)"),
  /* La tache de contact est PLUS LÉGÈRE depuis que le soleil porte de
     vraies ombres : elle ne joue plus que l'occlusion du ciel sous un
     volume, et doublée d'une ombre calculée elle faisait un halo noir. */
  ombre: textureHalo("rgba(0,0,0,.26)", "rgba(0,0,0,0)"),
};

/* ═══════════════════════════════════════════════ la matière première ═══
   Une seule BoxGeometry pour tout le village, mise à l'échelle par chaque
   objet : deux cents boîtes ne coûtent alors qu'un seul tampon de sommets.
   Les cylindres et les cônes sont créés à la demande, ils sont rares. */
const BOITE = new THREE.BoxGeometry(1, 1, 1);
const PLAN  = new THREE.PlaneGeometry(1, 1);

function lambert(couleur, plus) {
  return new THREE.MeshLambertMaterial(
    Object.assign({ color: couleur, flatShading: true }, plus || {}));
}
/* Les matières du village. Elles ne changent PAS d'une heure à l'autre :
   c'est la lumière qui change, comme dehors. Seules les fenêtres et les
   lanternes basculent, parce qu'elles s'allument vraiment. */
const M = {
  pave:      lambert(0xB9B3A6, { map: TEX.paves }),
  herbe:     lambert(0xC2CBA8, { map: TEX.herbe }),
  pierre:    lambert(0xC6BFB0),
  pierreF:   lambert(0x8E887C),
  pierreC:   lambert(0xDCD5C4),
  platre:    lambert(0xF2EADA),
  brique:    lambert(0x9B5A47),
  bois:      lambert(0x6B4630),
  boisClair: lambert(0xB08655),
  tuile:     lambert(0xA9543F),
  ardoise:   lambert(0x54607A),
  vermillon: lambert(0xC8442F),
  /* Le cuivre et l'or sont les deux seuls matériaux du village qui
     REFLÈTENT : il leur faut donc un matériau physique, pas un lambert.
     Deux objets sur des centaines — le surcoût est nul, et c'est le dôme
     de l'observatoire qui prend la couleur du ciel. */
  cuivre:    new THREE.MeshStandardMaterial({ color: 0x63A08C, roughness: 0.34,
                                              metalness: 0.55, flatShading: true }),
  metal:     new THREE.MeshStandardMaterial({ color: 0x9AA3B2, roughness: 0.42,
                                              metalness: 0.7, flatShading: true }),
  or:        new THREE.MeshStandardMaterial({ color: 0xD7A94E, roughness: 0.34,
                                              metalness: 0.8, flatShading: true }),
  feuille:   lambert(0x4C6B3C),
  sapin:     lambert(0x35513C),
  sakura:    lambert(0xE7A3BE),
  sombre:    lambert(0x241F1C),
};

/* Les matériaux qui s'allument. On les collecte au fur et à mesure de la
   construction : au changement d'heure, une seule boucle les parcourt. */
const FENETRES = [];
const LANTERNES = [];
const LUEURS = [];
/* Les cônes de lumière et leurs flaques au sol ont leur propre liste, et
   leur propre opacité : très faible, parce qu'ils s'additionnent les uns
   aux autres et qu'à quatorze, le moindre excès efface le village. */
const CONES = [];
const FLAQUES = [];
const TOURNE = [];     // ce qui tourne doucement : engrenage, anneau, parabole
const BALANCE = [];    // ce qui se balance : les enseignes de fer
/* Les emprises des échoppes. Elles sont remplies à leur construction, bien
   avant que le marcheur n'ait sa liste d'obstacles : les déclarer ici évite
   de faire dépendre un bloc de l'ordre d'exécution d'un autre. */
const OBSTACLES_BOUT = [];
/* Ce que la campagne pose de solide : le lac, la bibliothèque, les
   maisonnettes, les agrès du parc. Même mécanique que pour les échoppes —
   la liste se remplit pendant la construction et se verse dans OBSTACLES
   quand il existe. */
const OBSTACLES_CAMPAGNE = [];
/* ── Ce qui est déjà bâti, pour de bon ───────────────────────────────────
   La campagne s'interdisait de bâtir dans une BOÎTE autour du bourg :
   « |x| < 296 et z entre −430 et 360 ». Mesure faite, elle n'a rendu que
   22 bâtiments hors du village, parce que le premier hameau de chacun des
   cinq chemins tombait entièrement dans cette boîte et se faisait refuser
   en bloc.

   Une boîte est toujours un aveu : on ne sait pas où sont les maisons, donc
   on interdit une région entière. Il suffit de le savoir. Chaque maison de
   la rue s'inscrit ici en se posant, et la campagne consulte la liste —
   elle peut alors s'approcher jusqu'au contact sans jamais se superposer. */
const BATIS = [];

function fenetre(l, h, x, y, z, rotY) {
  const m = new THREE.MeshBasicMaterial({ color: 0xFFC066, fog: true });
  FENETRES.push(m);
  const o = new THREE.Mesh(PLAN, m);
  o.scale.set(l, h, 1);
  o.position.set(x, y, z);
  if (rotY) o.rotation.y = rotY;
  return o;
}
function bloc(mat, l, h, p, x, y, z) {
  const o = new THREE.Mesh(BOITE, mat);
  o.scale.set(l, h, p);
  o.position.set(x || 0, y || 0, z || 0);
  return o;
}
function cyl(mat, rh, rb, h, seg, x, y, z) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rh, rb, h, seg), mat);
  o.position.set(x || 0, y || 0, z || 0);
  return o;
}
/* Un toit à deux pentes : le triangle est extrudé, donc le pignon est une
   VRAIE face — un toit fait de deux boîtes inclinées laisse un trou
   triangulaire à chaque bout, et on voit l'intérieur du bâtiment. */
function pignon(mat, l, h, p, x, y, z) {
  const s = new THREE.Shape();
  s.moveTo(-l / 2, 0); s.lineTo(l / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: p, bevelEnabled: false });
  g.translate(0, 0, -p / 2);
  g.computeVertexNormals();
  const o = new THREE.Mesh(g, mat);
  o.position.set(x || 0, y || 0, z || 0);
  return o;
}
/* Une pyramide tronquée à quatre pans : le toit de la pagode, celui du
   donjon, la coiffe des tours. La rotation d'un huitième de tour aligne les
   quatre pans sur les axes — sans elle, ce sont les ARÊTES qui regardent la
   façade, et le toit paraît de travers. */
function pyramide(mat, rBas, rHaut, h, x, y, z) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rHaut, rBas, h, 4), mat);
  o.rotation.y = Math.PI / 4;
  o.position.set(x || 0, y || 0, z || 0);
  return o;
}
/* ── Le seuil : trois marches entre le sol et la porte ──────────────────
   JustAkhiraa : « les bâtiments sont beaux mais des fois ils ont aucun sens ».
   Voici le défaut qu'il voyait sans pouvoir le nommer, et il revenait sur la
   moitié du village.

   Chaque bâtiment est posé sur un soubassement de pierre — douze unités pour
   l'atelier, quatorze pour l'observatoire — qui DÉPASSE le corps de quelques
   unités. Les portes, elles, avaient été dessinées depuis le sol. Résultat :
   leur partie basse était enterrée dans la pierre, et ce qu'on voyait était
   une porte qui commence à mi-hauteur, devant un socle qu'on ne peut pas
   franchir. Aucune maçonnerie ne fait ça. Le château, lui, avait ses marches
   depuis le premier jour — c'est en le comparant aux quatre autres que
   l'anomalie saute aux yeux.

   Une porte commence au NIVEAU DU PLANCHER, et le plancher est le dessus du
   soubassement. Il faut donc deux choses ensemble : remonter la porte, et
   donner de quoi y monter. L'une sans l'autre laisse soit une porte enterrée,
   soit une porte en l'air. */
function marches(mat, largeur, hauteur, zFace, n) {
  const g = new THREE.Group();
  const h = hauteur / n;
  for (let k = 0; k < n; k++) {
    /* Chaque marche est plus LARGE et plus PROFONDE que celle du dessus :
       c'est ce qui donne l'emmarchement en pyramide qu'on lit de loin, et
       c'est aussi la seule façon de les voir quand on arrive de face. */
    const l = largeur + (n - k) * 7;
    const p = 7 + (n - k) * 5;
    g.add(bloc(mat, l, h, p, 0, h / 2 + k * h, zFace + p / 2 - (n - k) * 2.5));
  }
  return g;
}

/* La tache sombre sous un volume. Ce n'est pas une ombre calculée — il n'y
   en a aucune dans le village — mais elle fait le même travail : poser
   l'objet sur le sol au lieu de le laisser flotter. */
function contact(l, p, x, z) {
  const o = new THREE.Mesh(PLAN, new THREE.MeshBasicMaterial({
    map: TEX.ombre, transparent: true, depthWrite: false, fog: true }));
  o.rotation.x = -Math.PI / 2;
  o.scale.set(l, p, 1);
  o.position.set(x || 0, 0.45, z || 0);
  return o;
}
function lueur(taille, x, y, z) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.lueur, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false }));
  s.scale.setScalar(taille);
  s.position.set(x, y, z);
  LUEURS.push(s.material);
  return s;
}

/* ═══════════════════════════════════════════════ le sol et l'allée ═══ */
{
  const terre = new THREE.Mesh(PLAN, M.herbe);
  terre.rotation.x = -Math.PI / 2;
  /* La dalle plate ne couvre plus que la PLAINE : au-delà, c'est le maillage
     du relief qui prend la main. Elle valait 2600 quand le marchable en
     faisait 500 ; elle vaut maintenant deux fois le rayon de la plaine. */
  terre.scale.set(RELIEF.rPlaine * 2.1, RELIEF.rPlaine * 2.1, 1);
  terre.userData.horsOmbre = true;
  scene.add(terre);

  const long = V.zPortail - V.zChateau + 260;
  const allee = new THREE.Mesh(PLAN, M.pave);
  allee.rotation.x = -Math.PI / 2;
  allee.scale.set(V.demiAllee * 2, long, 1);
  allee.position.set(0, 0.2, (V.zPortail + V.zChateau) / 2 - 40);
  scene.add(allee);

  /* Les bâtiments doivent quand même poser leur ombre sur l'herbe. On ajoute
     donc une pelouse à la TAILLE EXACTE du cadre d'ombre : dedans, tout est
     ombré normalement ; dehors, c'est la grande dalle qui prend le relais,
     sans ombre et sans noir. La valeur n'est pas choisie à l'œil — c'est le
     « C » de la caméra d'ombre, et si l'un change l'autre doit suivre. */
  const pelouse = new THREE.Mesh(PLAN, M.herbe);
  pelouse.rotation.x = -Math.PI / 2;
  pelouse.scale.set(OMBRE_CADRE * 2, OMBRE_CADRE * 2, 1);
  pelouse.position.y = 0.05;
  scene.add(pelouse);

  /* La place de la fontaine : l'allée s'élargit en rond autour d'elle. Sans
     ce disque, la fontaine est posée sur l'herbe au milieu du pavé. */
  const place = new THREE.Mesh(new THREE.CircleGeometry(V.rFontaine + 40, 40), M.pave);
  place.rotation.x = -Math.PI / 2;
  place.position.set(0, 0.28, V.zFontaine);
  scene.add(place);

  /* Les bordures, et une rigole d'herbe au-delà : c'est la bordure qui dit
     où finit l'allée, donc où l'on ne va pas. */
  for (const s of [-1, 1]) {
    scene.add(bloc(M.pierreC, 3.4, 2.6, long, s * (V.demiAllee + 1.7), 1.3,
                   (V.zPortail + V.zChateau) / 2 - 40));
  }

  /* Le portail : deux piliers et une arche légère, au premier plan. Ils
     encadrent la vue d'ouverture — c'est le cadre d'un tableau, et c'est lui
     qui donne l'échelle de tout le reste. */
  for (const s of [-1, 1]) {
    const x = s * (V.demiAllee + 6);
    scene.add(bloc(M.pierre, 12, 40, 12, x, 20, V.zPortail));
    scene.add(pyramide(M.ardoise, 9, 0.6, 9, x, 44, V.zPortail));
    scene.add(bloc(M.pierreC, 14, 3, 14, x, 39, V.zPortail));
    scene.add(contact(30, 30, x, V.zPortail));
  }
}

/* ═══════════════════════════════════════════════ la fontaine ════════
   « Une allée centrale avec fontaine au milieu. » C'est le centre de gravité
   du village : le point où l'œil se pose d'abord, et le seul objet qui
   BOUGE en permanence. Un village immobile est une maquette ; une eau qui
   ride est un lieu. */
let EMBRUN = null;

/* L'eau courante : des filets verticaux qui descendent. Le défilement se
   fait dans la COORDONNÉE de texture, pas en déplaçant l'objet : la nappe
   reste où elle est, et c'est l'eau qui passe dedans. */
const eauCouranteMat = new THREE.ShaderMaterial({
  transparent: true, side: THREE.DoubleSide, depthWrite: false,
  uniforms: { t: { value: 0 },
              claire: { value: new THREE.Color(0xDCF2FA) },
              fonde:  { value: new THREE.Color(0x7FB9D4) } },
  vertexShader: `varying vec2 vU; void main(){ vU = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform float t; uniform vec3 claire; uniform vec3 fonde;
    varying vec2 vU;
    float bruit(vec2 p){ return fract(sin(dot(p, vec2(41.7, 289.1))) * 43758.5453); }
    void main(){
      /* Trois vitesses de défilement : un filet unique se lit comme une
         rayure qui glisse, trois se lisent comme de l'eau. */
      float a = fract(vU.y * 5.0  - t * 1.70 + bruit(vec2(floor(vU.x * 9.0), 1.0)));
      float b = fract(vU.y * 9.0  - t * 2.60 + bruit(vec2(floor(vU.x * 14.0), 7.0)));
      float c = fract(vU.y * 15.0 - t * 3.70 + bruit(vec2(floor(vU.x * 22.0), 3.0)));
      float m = smoothstep(0.55, 1.0, a) * 0.5
              + smoothstep(0.62, 1.0, b) * 0.32
              + smoothstep(0.70, 1.0, c) * 0.28;
      vec3 col = mix(fonde, claire, m);
      /* La nappe s'amincit en tombant et se dissout en bas : une colonne
         d'eau d'épaisseur constante est un tuyau, pas une chute. */
      float bord = smoothstep(0.0, 0.16, vU.x) * smoothstep(1.0, 0.84, vU.x);
      float bas  = smoothstep(0.0, 0.30, vU.y);
      gl_FragColor = vec4(col, (0.10 + m * 0.46) * bord * bas);
    }`,
});

const eauMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: {
    t:      { value: 0 },
    claire: { value: new THREE.Color(0x9FD8E8) },
    fonde:  { value: new THREE.Color(0x1C4B63) },
    force:  { value: 0.75 },
  },
  vertexShader: `varying vec2 vU; void main(){ vU = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  /* Trois ondes de périodes et de directions différentes : deux suffisent à
     lire une grille, trois donnent une eau. Le point central rayonne, comme
     si le jet retombait au milieu. */
  fragmentShader: `uniform float t; uniform vec3 claire; uniform vec3 fonde;
    uniform float force; varying vec2 vU;
    void main(){
      vec2 p = (vU - 0.5) * 2.0;
      float r = length(p);
      float a = sin(r * 26.0 - t * 3.4) * 0.5 + 0.5;
      float b = sin(p.x * 13.0 + t * 1.5) * sin(p.y * 11.0 - t * 1.1) * 0.5 + 0.5;
      float c = sin((p.x + p.y) * 19.0 + t * 2.2) * 0.5 + 0.5;
      float m = (a * 0.5 + b * 0.3 + c * 0.2);
      vec3 col = mix(fonde, claire, m * force);
      /* Le bord de la vasque est plus sombre : l'eau y est dans l'ombre de
         la margelle, et sans ce liseré le disque paraît collé. */
      col *= mix(0.62, 1.0, smoothstep(1.0, 0.72, r));
      gl_FragColor = vec4(col, 0.93);
    }`,
});

/* ── L'eau d'un lac n'est pas l'eau d'une vasque ─────────────────────────
   Le premier lac réutilisait le matériau de la fontaine, et il a rendu une
   SPIRALE de deux cents unités de large, visible depuis le ciel. La cause
   est dans le shader, et elle est juste pour la fontaine : « sin(r * 26 − t) »
   fait rayonner les ondes DEPUIS LE CENTRE, parce qu'au centre d'une vasque
   il y a un jet qui retombe. Sur un lac il n'y a rien au milieu, et l'onde
   circulaire devient une cible.

   Celui-ci est donc écrit pour une nappe : trois houles croisées, orientées
   par le vent, sans point d'origine. Et la longueur d'onde est exprimée en
   UNITÉS DU MONDE — le shader reçoit le rayon du lac — au lieu d'être liée
   aux UV : sinon la même eau aurait des vagues de deux mètres sur un étang
   et de vingt sur un lac.

   Le bord s'éclaircit au lieu de s'assombrir : près de la rive l'eau est
   peu profonde et laisse voir le fond, c'est l'inverse d'une margelle qui
   porte son ombre. */
const eauLacMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: {
    t:      { value: 0 },
    claire: { value: new THREE.Color(0x8FC9DE) },
    fonde:  { value: new THREE.Color(0x1E4257) },
    rive:   { value: new THREE.Color(0x7FB49C) },
    rayon:  { value: 210.0 },
  },
  vertexShader: `varying vec2 vU; void main(){ vU = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform float t; uniform vec3 claire; uniform vec3 fonde;
    uniform vec3 rive; uniform float rayon; varying vec2 vU;
    void main(){
      vec2 p = (vU - 0.5) * 2.0;
      float r = length(p);
      vec2 w = p * rayon * 0.055;          // en unités du monde, pas en UV
      float a = sin(w.x * 1.00 + w.y * 0.42 - t * 1.25);
      float b = sin(w.x * -0.47 + w.y * 1.00 - t * 0.92);
      float c = sin((w.x + w.y) * 0.31 + t * 0.55);
      float m = (a * 0.42 + b * 0.34 + c * 0.24) * 0.5 + 0.5;
      vec3 col = mix(fonde, claire, m * 0.72);
      /* Le haut-fond : les vingt derniers pour cent du rayon virent au vert
         pâle, et c'est ce dégradé qui donne sa profondeur au lac. */
      col = mix(col, rive, smoothstep(0.80, 1.0, r));
      gl_FragColor = vec4(col, mix(0.95, 0.72, smoothstep(0.80, 1.0, r)));
    }`,
});

{
  const R = V.rFontaine, zf = V.zFontaine;
  const f = new THREE.Group();
  f.position.set(0, 0, zf);
  f.add(cyl(M.pierre,   R,      R + 1.2, 6,  8, 0, 3, 0));
  f.add(cyl(M.pierreC,  R + 1,  R + 1,   1.8, 8, 0, 6.2, 0));
  f.add(cyl(M.pierreF,  R - 2.6, R - 2.6, 5.4, 8, 0, 3.4, 0));
  const eau = new THREE.Mesh(new THREE.CircleGeometry(R - 2.7, 40), eauMat);
  eau.rotation.x = -Math.PI / 2;
  eau.position.y = 5.1;
  f.add(eau);

  f.add(cyl(M.pierre, 3.4, 4.6, 15, 12, 0, 12.5, 0));
  f.add(cyl(M.pierreC, 9.5, 2.6, 3.4, 12, 0, 21, 0));
  const eau2 = new THREE.Mesh(new THREE.CircleGeometry(8.6, 24), eauMat);
  eau2.rotation.x = -Math.PI / 2;
  eau2.position.y = 22.4;
  f.add(eau2);
  f.add(cyl(M.pierre, 1.6, 2.2, 5, 10, 0, 25, 0));
  const boule = new THREE.Mesh(new THREE.SphereGeometry(3.2, 18, 12), M.cuivre);
  boule.position.y = 29.4;
  f.add(boule);

  /* Le jet : quatre voiles d'eau très fins qui retombent, et une poussière
     de gouttes. Un vrai jet de particules coûterait cher pour rien — à cette
     distance, c'est la SILHOUETTE qui compte. */
  /* Les quatre jets qui jaillissent de la boule et retombent dans la
     vasque haute. */
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const j = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 2.4, 16, 8, 1, true), eauCouranteMat);
    j.position.set(Math.cos(a) * 4.4, 23.2, Math.sin(a) * 4.4);
    j.rotation.z = -Math.cos(a) * 0.36;
    j.rotation.x = Math.sin(a) * 0.36;
    f.add(j);
  }
  /* Et la nappe qui déborde de la vasque haute jusqu'au bassin : c'est ELLE
     qui fait qu'une fontaine coule. Huit pans autour du pourtour, assez
     pour que le tour soit continu, assez peu pour ne rien coûter. */
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + Math.PI / 8;
    const n = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 15.4), eauCouranteMat);
    n.position.set(Math.cos(a) * 8.1, 13.2, Math.sin(a) * 8.1);
    n.rotation.y = -a + Math.PI / 2;
    f.add(n);
  }
  /* L'embrun. Il RETOMBE : un nuage de gouttes immobiles au-dessus d'une
     vasque se lit comme de la neige collée en l'air — c'est ce qu'on
     voyait, en gros carrés blancs. Chaque goutte part du jet, tombe, et
     recommence. */
  {
    const n = 160, pos = new Float32Array(n * 3), vit = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 9;
      pos.set([Math.cos(a) * r, 6 + Math.random() * 20, Math.sin(a) * r], i * 3);
      vit[i] = 7 + Math.random() * 9;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const e = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xDFF3FB, size: 0.8, transparent: true, opacity: 0.55,
      depthWrite: false }));
    e.position.set(0, 0, zf);
    e.userData.vit = vit;
    scene.add(e);
    EMBRUN = e;
  }
  scene.add(f);
  scene.add(contact((R + 6) * 2, (R + 6) * 2, 0, zf));
}

/* ═══════════════════════════════════════════════ les lampadaires ════
   Ils font deux choses, et la seconde est la plus importante : ils éclairent
   la nuit, et le jour ils RYTHMENT l'allée. Une allée vide de six cents
   unités n'a pas d'échelle ; la même, jalonnée tous les soixante-dix pas,
   se mesure d'un coup d'œil. */
const LAMPES = [];
for (const s of [-1, 1]) {
  for (const z of [V.zPortail - 34, 152, 76, -8, -96, -186, -266]) {
    const x = s * (V.demiAllee + 8);
    LAMPES.push({ x, z });
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(cyl(M.sombre, 1.1, 2.4, 30, 10, 0, 15, 0));
    g.add(cyl(M.sombre, 3.4, 2.2, 1.4, 10, 0, 0.7, 0));
    const cage = new THREE.MeshBasicMaterial({ color: 0xFFB454, fog: true });
    LANTERNES.push(cage);
    const verre = new THREE.Mesh(new THREE.BoxGeometry(4.4, 6.2, 4.4), cage);
    verre.position.y = 33.4;
    g.add(verre);
    g.add(pyramide(M.sombre, 4.2, 1, 3.2, 0, 38, 0));
    g.add(lueur(30, 0, 33.4, 0));
    scene.add(g);
  }
}

/* ═══════════════════════════════════════════════ les arbres ═════════ */
/* ── Ce qui est solide ───────────────────────────────────────────────────
   JustAkhiraa : « les objets, donne-leur de la solidité, comme les bancs, les
   bâtiments, les arbres etc. »

   Il a raison et c'était flagrant : seuls les cinq bâtiments, les échoppes et
   la fontaine arrêtaient. Tout le reste — les cinquante maisons de la rue,
   les deux cents arbres, les bancs, les tables, les agrès du parc — se
   traversait comme de la fumée. Un village où l'on passe à travers les
   troncs n'est pas un village, c'est une image.

   Une seule liste, remplie À LA POSE. C'est la seule façon de ne rien
   oublier : si un objet est construit, il s'inscrit ; il n'y a pas de
   seconde liste à tenir à jour, donc rien ne peut diverger.

   Le rayon est celui du TRONC, pas celui du feuillage : la ramure est au-
   dessus de la tête, et s'en servir obligerait à contourner un arbre de
   quinze unités pour un tronc qui en fait trois. On bloque ce qu'on heurte,
   pas ce qui nous ombrage. */
const SOLIDES = [];
function solide(x, z, r) { SOLIDES.push({ x, z, r }); }

/* Ce qui est déjà occupé, au moment où l'on demande. Les cinq bâtiments et
   les échoppes ne sont pas dans SOLIDES — ils ont leur propre liste — mais un
   arbre doit les éviter tous les trois. On interroge donc ce qui existe, et
   seulement ce qui existe : la fonction sert aussi avant que les échoppes
   soient placées. */
/* « typeof X !== "undefined" » ne protège de RIEN pour une « const » : lire
   une const avant sa déclaration lève, typeof compris. Le monde ne chargeait
   plus. On ne devine donc plus l'existence des listes — on tient un registre
   déclaré ici, que les bâtisseurs remplissent au fur et à mesure. Ce qui n'y
   est pas encore n'existe pas encore, et c'est exactement ce qu'on veut
   savoir. */
const PRISES = [];
function prendre(x, z, r) { PRISES.push({ x, z, r }); }
function occupeDeja(x, z, r) {
  for (const o of SOLIDES) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return true;
  for (const o of PRISES) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return true;
  return false;
}

/* ── Un arbre ne pousse pas dans une porte ───────────────────────────────
   Sa capture le montrait : un feuillage en plein milieu de l'entrée de
   l'atelier. Les arbres étaient plantés aux coordonnées qu'on leur donnait,
   sans jamais demander si la place était prise — exactement la même faute
   que pour les échoppes, au même endroit du raisonnement.

   « arbre » refuse maintenant, et rend « null ». Les appelants n'ont rien à
   changer : un arbre qui ne pousse pas ne manque à personne, un arbre dans
   une porte se voit de loin. */
function arbre(x, z, type, echelle) {
  const e0 = echelle || 1;
  if (occupeDeja(x, z, 4.4 * e0)) return null;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const e = echelle || 1;
  g.scale.setScalar(e);
  g.rotation.y = Math.random() * Math.PI;
  const feuillage = type === "sakura" ? M.sakura : type === "sapin" ? M.sapin : M.feuille;
  if (type === "sapin") {
    g.add(cyl(M.bois, 1.6, 2.6, 16, 7, 0, 8, 0));
    for (let k = 0; k < 4; k++) {
      g.add(cyl(feuillage, 0.6, 13 - k * 2.6, 17 - k * 2, 7, 0, 16 + k * 11, 0));
    }
  } else {
    g.add(cyl(M.bois, 2.2, 3.4, 22, 8, 0, 11, 0));
    const tetes = [[0, 26, 0, 13], [-7, 32, 3, 9.5], [8, 31, -3, 10], [1, 38, 4, 8]];
    for (const [tx, ty, tz, r] of tetes) {
      const o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), feuillage);
      o.position.set(tx, ty, tz);
      o.rotation.set(Math.random(), Math.random(), Math.random());
      g.add(o);
    }
  }
  scene.add(g);
  scene.add(contact(34 * e, 34 * e, x, z));
  solide(x, z, 3.6 * e);          // le tronc, pas la ramure
  return g;
}

/* ═══════════════════════════════════════════════ les bâtiments ══════
   Cinq silhouettes, cinq fonctions. Chacune reçoit la couleur de sa matière
   et s'en sert pour les accents seulement — une enseigne, une bannière, une
   lueur : un bâtiment entièrement teinté perd sa matière de construction, et
   c'est la pierre, le bois et la tuile qui font le village. */

/* ── L'atelier : Informatique & développement ───────────────────────────
   Une forge. C'est le seul bâtiment où l'on FABRIQUE quelque chose, et la
   fumée qui sort de la cheminée est le seul signe, dans tout le village,
   qu'un travail est en cours. */
function batirAtelier(c) {
  const g = new THREE.Group();
  g.add(bloc(M.pierreF, 104, 12, 64, 0, 6, 0));
  g.add(bloc(M.pierre,   96, 44, 58, 0, 34, 0));
  g.add(bloc(M.brique,   92, 40, 54, 0, 76, 0));
  /* Le toit en pignon sur la façade : c'est lui qui donne l'air d'un
     hangar d'atelier plutôt que d'une maison. */
  g.add(pignon(M.tuile, 100, 34, 58, 0, 96, 0));
  g.add(bloc(M.bois, 104, 3, 62, 0, 96, 0));

  /* La grande porte cintrée, ouverte sur le rouge de la forge. Elle part du
     PLANCHER — le dessus du soubassement, à douze — et non du sol : sa moitié
     basse était sinon noyée dans la pierre. Trois marches y mènent. */
  g.add(marches(M.pierreC, 40, 12, 32, 3));
  g.add(bloc(M.sombre, 34, 32, 2, 0, 28, 29.4));
  const arc = new THREE.Mesh(new THREE.CircleGeometry(17, 20, 0, Math.PI), M.sombre);
  arc.position.set(0, 44, 29.4);
  g.add(arc);
  const forge = new THREE.MeshBasicMaterial({ color: 0xFF7A33, fog: true });
  FENETRES.push(forge);
  const feu = new THREE.Mesh(PLAN, forge);
  feu.scale.set(24, 16, 1);
  feu.position.set(0, 22, 29.6);
  g.add(feu);
  g.add(lueur(54, 0, 24, 32));

  for (const x of [-34, 34]) {
    g.add(fenetre(16, 13, x, 32, 29.4));
    g.add(bloc(M.bois, 19, 2.4, 2, x, 39.6, 29.6));
  }
  for (const x of [-28, 0, 28]) g.add(fenetre(14, 15, x, 78, 27.4));

  /* La cheminée et sa fumée. */
  g.add(bloc(M.brique, 15, 58, 15, -34, 116, -12));
  g.add(bloc(M.pierreF, 19, 4, 19, -34, 146, -12));
  {
    const n = 90, pos = new Float32Array(n * 3), dep = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set([-34 + (Math.random() - 0.5) * 9, 148 + Math.random() * 90,
               -12 + (Math.random() - 0.5) * 9], i * 3);
      dep[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const fum = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xBFC6CE, size: 9, transparent: true, opacity: 0.2,
      depthWrite: false, sizeAttenuation: true }));
    fum.userData.fumee = true;
    g.add(fum);
  }

  /* L'engrenage sur le pignon : il tourne, lentement. Un détail qui bouge
     par bâtiment suffit à faire vivre une rue ; deux la rendent agitée. */
  {
    const e = new THREE.Group();
    e.position.set(0, 96, 29.8);
    e.add(new THREE.Mesh(new THREE.TorusGeometry(11, 2.6, 8, 24), M.metal));
    e.add(cyl(M.metal, 3, 3, 2, 10, 0, 0, 0).rotateX(Math.PI / 2));
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      e.add(bloc(M.metal, 4, 4, 3, Math.cos(a) * 13.2, Math.sin(a) * 13.2, 0));
    }
    g.add(e);
    TOURNE.push({ o: e, axe: "z", v: 0.22 });
  }
  return { groupe: g, hauteur: 132, demiLargeur: 52, parvis: 46, accent: c };
}

/* ── L'observatoire : Mathématiques ─────────────────────────────────────
   Une tour et un dôme de cuivre, fendu pour la lunette. Et un anneau qui
   tourne autour : une orbite. C'est la seule forme du village qui ne soit
   pas une maison — les mathématiques ne se logent pas, elles observent. */
function batirObservatoire(c) {
  const g = new THREE.Group();
  g.add(cyl(M.pierreF, 56, 62, 14, 8, 0, 7, 0));
  g.add(cyl(M.pierre,  42, 48, 92, 24, 0, 60, 0));
  g.add(cyl(M.pierreC, 46, 46, 4,  24, 0, 104, 0));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(45, 2.2, 8, 32), M.metal)
        .translateY(108).rotateX(Math.PI / 2));

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(42, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.cuivre);
  dome.position.y = 106;
  g.add(dome);
  /* La fente, et la lunette qui en sort. La fente est une boîte sombre
     posée SUR le dôme : creuser une sphère coûterait une géométrie de plus
     pour un trait qu'on lit de la même façon. */
  g.add(bloc(M.sombre, 11, 4, 84, 0, 128, 8));
  const lun = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 6.2, 54, 14), M.metal);
  lun.position.set(0, 136, 16);
  lun.rotation.x = -Math.PI / 2.9;
  g.add(lun);
  g.add(cyl(M.sombre, 6.6, 6.6, 3, 14, 0, 150, 34).rotateX(Math.PI / 2.9));

  /* ── Les fenêtres suivent le FRUIT de la tour ─────────────────────────
     Elles étaient toutes posées au rayon 48,6, quelle que soit leur hauteur.
     Or la tour n'est pas un cylindre : elle va de 48 à la base à 42 sous la
     corniche. Les fenêtres du haut flottaient donc à quatre unités du mur,
     dans le vide — et c'est très visible de trois quarts.

     Le rayon se calcule maintenant à leur hauteur. C'est la même règle que
     partout ailleurs dans ce dépôt : une valeur qui dépend d'une autre ne
     s'écrit pas en dur, elle se déduit. */
  const rayonA = (y) => 48 - (y - 14) / 92 * 6;
  for (let k = 0; k < 6; k++) {
    const a = -0.9 + k * 0.36;
    const y = 40 + (k % 2) * 32;
    const r = rayonA(y) + 0.6;          // 0,6 devant le mur, jamais dedans
    g.add(fenetre(11, 16, Math.sin(a) * r, y, Math.cos(a) * r, a));
  }
  /* La porte commence au plancher — le dessus du soubassement, à quatorze —
     et trois marches y montent. Elle partait du sol, donc ses quatorze
     premières unités étaient enterrées dans la pierre du socle. */
  g.add(marches(M.pierreC, 26, 14, 50, 3));
  g.add(bloc(M.sombre, 20, 30, 2, 0, 29, rayonA(29) + 0.5));
  g.add(bloc(M.bois, 24, 3, 4, 0, 45.5, rayonA(45) + 1));

  /* L'anneau. Il est incliné : à plat il se confondrait avec la corniche. */
  {
    const an = new THREE.Group();
    an.position.y = 128;
    an.rotation.z = 0.42;
    const t = new THREE.Mesh(new THREE.TorusGeometry(62, 0.9, 6, 60),
                             new THREE.MeshBasicMaterial({ color: c, transparent: true,
                                                           opacity: 0.55, fog: true }));
    t.rotation.x = Math.PI / 2;
    an.add(t);
    const bille = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 8),
                                 new THREE.MeshBasicMaterial({ color: c, fog: true }));
    bille.position.x = 62;
    an.add(bille);
    g.add(an);
    TOURNE.push({ o: an, axe: "y", v: 0.34 });
  }
  return { groupe: g, hauteur: 152, demiLargeur: 52, parvis: 60, accent: c };
}

/* ── La maison à colombages : Anglais ───────────────────────────────────
   Tudor. Les étages en surplomb, les poutres noires sur le plâtre, la
   cheminée de brique et l'enseigne de fer qui grince : on reconnaît
   l'Angleterre avant d'avoir lu le mot « Anglais », et c'est tout
   l'intérêt. */
function batirColombages(c) {
  const g = new THREE.Group();
  g.add(bloc(M.brique, 100, 14, 60, 0, 7, 0));
  g.add(bloc(M.platre,  94, 36, 54, 0, 32, 0));
  /* L'encorbellement : chaque étage dépasse celui du dessous. C'est LE
     signe de la maison à colombages, et il ne coûte que trois nombres. */
  g.add(bloc(M.platre, 104, 34, 62, 0, 67, 0));
  g.add(bloc(M.bois,   106, 3,  64, 0, 50.5, 0));
  g.add(bloc(M.platre,  98, 30, 58, 0, 99, 0));
  g.add(bloc(M.bois,   108, 3,  66, 0, 84.5, 0));

  /* Le toit, faîte parallèle à la façade : le pignon regarde donc les
     côtés, d'où la rotation d'un quart de tour. */
  const toit = pignon(M.ardoise, 60, 30, 104, 0, 114, 0);
  toit.rotation.y = Math.PI / 2;
  g.add(toit);
  g.add(bloc(M.bois, 110, 3, 66, 0, 114, 0));

  /* ── Une maison sans porte ────────────────────────────────────────────
     Celle-ci n'en avait aucune. Douze fenêtres, trois étages, un toit
     d'ardoise, et pas une ouverture pour entrer : c'est le défaut le plus
     net des cinq bâtiments, et il était invisible tant qu'on ne cherchait
     pas ce qui MANQUE. On relit les façades en se demandant ce qu'elles
     devraient avoir, pas seulement si ce qu'elles ont est bien placé.

     Elle est à colombages : sa porte est donc en chêne, encadrée de deux
     poteaux et d'un linteau, avec une imposte au-dessus. Elle part du
     plancher — quatorze, le dessus du soubassement de brique — et trois
     marches y montent. */
  g.add(marches(M.pierreC, 30, 14, 30, 3));
  g.add(bloc(M.bois,   26, 3, 2.4, 0, 45.5, 27.7));          // le linteau
  for (const sx of [-1, 1])
    g.add(bloc(M.bois, 3, 30, 2.4, sx * 11.5, 29, 27.7));    // les poteaux
  g.add(bloc(M.sombre, 20, 30, 1.6, 0, 29, 27.5));           // le vantail
  g.add(fenetre(16, 5, 0, 48.5, 27.6));                      // l'imposte
  g.add(cyl(M.or, 0.55, 0.55, 1.6, 8, 6.5, 29, 28.6).rotateX(Math.PI / 2));

  /* Les colombages : verticaux, une ceinture, deux croix de Saint-André.
     Posés sur la façade ET sur les deux côtés, sinon la maison est en
     carton dès qu'on la voit de biais. */
  const poutre = (l, h, x, y, z, rot, face) => {
    const o = bloc(M.bois, l, h, 2.2, x, y, z);
    if (rot) o.rotation.z = rot;
    if (face) o.rotation.y = face;
    g.add(o);
  };
  for (const [y, hh, z, dl] of [[32, 36, 27.4, 94], [67, 34, 31.4, 104], [99, 30, 29.4, 98]]) {
    poutre(dl, 3, 0, y - hh / 2 + 2, z);
    poutre(dl, 3, 0, y + hh / 2 - 2, z);
    for (let k = -2; k <= 2; k++) poutre(3, hh - 6, k * (dl / 5.2), y, z);
    poutre(hh * 1.25, 2.6, -dl / 3.4, y, z, 0.72);
    poutre(hh * 1.25, 2.6,  dl / 3.4, y, z, -0.72);
  }
  for (const s of [-1, 1]) {
    for (const [y, hh, dp] of [[32, 36, 54], [67, 34, 62], [99, 30, 58]]) {
      const x = s * (dp === 62 ? 52 : dp === 58 ? 49 : 47.2);
      poutre(dp - 6, 3, x, y - hh / 2 + 2, 0, 0, Math.PI / 2);
      poutre(dp - 6, 3, x, y + hh / 2 - 2, 0, 0, Math.PI / 2);
      for (let k = -1; k <= 1; k++)
        poutre(3, hh - 6, x, y, k * (dp / 3.2), 0, Math.PI / 2);
    }
  }

  /* Les fenêtres à petits carreaux : une vitre lumineuse, et par-dessus une
     grille de meneaux. Sans les meneaux, ce sont des écrans. */
  const croisee = (l, h, x, y, z) => {
    g.add(fenetre(l, h, x, y, z));
    for (let k = 1; k <= 2; k++) g.add(bloc(M.bois, 1.4, h, 1, x - l / 2 + k * l / 3, y, z + 0.5));
    g.add(bloc(M.bois, l, 1.4, 1, x, y, z + 0.5));
    g.add(bloc(M.bois, l + 3, 2.6, 2.4, x, y + h / 2 + 1.8, z + 0.6));
  };
  croisee(20, 16, -30, 36, 27.6); croisee(20, 16, 30, 36, 27.6);
  croisee(20, 16, -32, 70, 31.6);  croisee(20, 16, 0, 70, 31.6);
  croisee(20, 16,  32, 70, 31.6);
  croisee(16, 14, -26, 101, 29.6); croisee(16, 14, 26, 101, 29.6);
  g.add(bloc(M.bois, 22, 32, 3, 0, 18, 28));
  g.add(bloc(M.boisClair, 26, 3.4, 5, 0, 35, 28.6));

  g.add(bloc(M.brique, 14, 62, 14, -38, 132, -14));
  for (const dz of [-4, 4]) g.add(cyl(M.brique, 3.4, 3.8, 9, 10, -38, 166, -14 + dz));

  /* L'enseigne de fer, celle des auberges anglaises. Elle se balance : deux
     degrés, très lentement. C'est le détail vivant de ce bâtiment. */
  {
    const b = new THREE.Group();
    b.position.set(-44, 74, 30);
    b.add(bloc(M.metal, 26, 2, 2, 11, 0, 0));
    b.add(bloc(M.metal, 2, 8, 2, 0, -4, 0));
    const p = new THREE.Group();
    p.position.set(22, -2, 0);
    p.add(bloc(M.metal, 1.4, 8, 1.4, 0, 4, 0));
    const panneau = bloc(M.bois, 20, 14, 1.6, 0, -7, 0);
    p.add(panneau);
    const ec = new THREE.Mesh(PLAN, new THREE.MeshBasicMaterial({ color: c, fog: true }));
    ec.scale.set(16, 10, 1);
    ec.position.set(0, -7, 1.1);
    p.add(ec);
    b.add(p);
    g.add(b);
    BALANCE.push({ o: p, v: 0.9, a: 0.06 });
  }
  return { groupe: g, hauteur: 129, demiLargeur: 54, parvis: 48, accent: c };
}

/* ── La pagode : Culture générale ───────────────────────────────────────
   « J'en ai mis un style Japon, tu pourras dire c'est la culture générale. »
   Trois toits, des piliers vermillon, un torii devant et deux cerisiers.
   Chaque toit est fait de DEUX pyramides tronquées, une large et plate
   au-dessus d'une plus étroite et raide : c'est ce ressaut qui donne la
   courbure concave d'un toit japonais. Un seul cône donnerait un chapeau
   chinois de carnaval. */
function batirPagode(c) {
  const g = new THREE.Group();
  g.add(bloc(M.pierreF, 112, 10, 80, 0, 5, 0));
  g.add(bloc(M.pierre,  102, 5, 72, 0, 12, 0));
  g.add(bloc(M.bois,     96, 6, 66, 0, 17, 0));

  const etage = (l, p, h, y, rBas, rMil, rHaut) => {
    g.add(bloc(M.platre, l, h, p, 0, y + h / 2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(cyl(M.vermillon, 3.2, 3.6, h, 10, sx * (l / 2 - 3), y + h / 2, sz * (p / 2 - 3)));
    }
    g.add(bloc(M.bois, l + 4, 2.6, p + 4, 0, y + h - 1, 0));
    const t1 = pyramide(M.tuile, rBas, rMil, 9, 0, y + h + 4.5, 0);
    t1.scale.z = p / l * 1.06;
    g.add(t1);
    const t2 = pyramide(M.tuile, rMil, rHaut, 13, 0, y + h + 15.5, 0);
    t2.scale.z = p / l * 1.06;
    g.add(t2);
    /* Les quatre coins relevés : de petites boîtes inclinées au bout des
       avant-toits. C'est le signe le plus reconnaissable d'un toit japonais,
       et il tient en quatre boîtes. */
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const o = bloc(M.tuile, 13, 2.4, 5, sx * rBas * 0.82, y + h + 5.6,
                     sz * rBas * 0.82 * (p / l));
      o.rotation.y = sx * sz > 0 ? Math.PI / 4 : -Math.PI / 4;
      o.rotation.z = sx * 0.42;
      g.add(o);
    }
    return y + h + 20;
  };
  let y = 20;
  y = etage(84, 58, 32, y, 66, 52, 26);
  y = etage(68, 46, 28, y, 54, 42, 21);
  y = etage(52, 36, 26, y, 43, 33, 14);

  /* Le fleuron : le mât et ses anneaux, qui terminent toute pagode. */
  g.add(cyl(M.or, 1.3, 1.8, 26, 10, 0, y + 11, 0));
  for (let k = 0; k < 4; k++) {
    const an = new THREE.Mesh(new THREE.TorusGeometry(3.6 - k * 0.6, 0.55, 6, 18), M.or);
    an.rotation.x = Math.PI / 2;
    an.position.y = y + 4 + k * 5;
    g.add(an);
  }

  for (const [l, h, x, yy, z] of [[15, 18, -22, 30, 29.4], [15, 18, 22, 30, 29.4],
                                  [13, 15, -17, 62, 23.4], [13, 15, 17, 62, 23.4],
                                  [11, 13, 0, 96, 18.4]]) {
    g.add(fenetre(l, h, x, yy, z));
    g.add(bloc(M.bois, l + 2, 2, 1.6, x, yy + h / 2 + 1, z + 0.4));
  }
  /* La porte, et les marches. */
  g.add(bloc(M.sombre, 26, 26, 2, 0, 33, 29.6));
  for (let k = 0; k < 3; k++)
    g.add(bloc(M.pierreC, 40 - k * 4, 3.4, 8 + k * 5, 0, 18.5 - k * 3.4, 40 + k * 4));

  /* Le torii, devant. Le linteau supérieur est légèrement plus large et
     débordant : c'est ce débord qui fait le torii plutôt qu'un portique. */
  {
    const t = new THREE.Group();
    t.position.set(0, 0, 96);
    for (const s of [-1, 1]) {
      t.add(cyl(M.vermillon, 3.4, 4.4, 54, 12, s * 22, 27, 0));
      t.add(cyl(M.pierreF, 5.4, 6, 3, 12, s * 22, 1.5, 0));
    }
    t.add(bloc(M.vermillon, 62, 4.4, 6.6, 0, 50, 0));
    t.add(bloc(M.vermillon, 72, 5.4, 8.4, 0, 56, 0));
    t.add(bloc(M.vermillon, 6, 7, 5, 0, 45, 0));
    t.add(lueur(26, 0, 50, 0));
    g.add(t);
  }
  /* Deux lanternes de pierre, une de chaque côté du chemin. */
  for (const s of [-1, 1]) {
    const l = new THREE.Group();
    l.position.set(s * 44, 0, 62);
    l.add(cyl(M.pierreF, 4, 5.4, 12, 8, 0, 6, 0));
    l.add(cyl(M.pierre, 7, 5, 3, 8, 0, 13.5, 0));
    const m = new THREE.MeshBasicMaterial({ color: 0xFFB454, fog: true });
    LANTERNES.push(m);
    l.add(new THREE.Mesh(new THREE.BoxGeometry(7, 7, 7), m).translateY(19));
    l.add(pyramide(M.pierreF, 7.4, 1.6, 5, 0, 25, 0));
    l.add(lueur(22, 0, 19, 0));
    g.add(l);
  }
  /* Le parvis de la pagode passe DEVANT son torii : posé en deçà, le
     portique se dressait au milieu des cartes. */
  return { groupe: g, hauteur: 134, demiLargeur: 58, parvis: 64, accent: c,
           arbres: [[-104, 6, "sakura", 1.1], [106, -14, "sakura", 0.95]] };
}

/* ── Le château : Réseaux & systèmes ────────────────────────────────────
   « Château au bout comme l'allée du château d'Hyrule. » Il est au bout
   parce qu'il est le plus grand, et il est le plus grand parce que Réseaux &
   systèmes compte dix-sept chapitres — le plus de salles.

   Sa parabole et son mât à antennes sont le seul anachronisme du village,
   et il est voulu : c'est ce qui dit « réseaux » d'un seul coup d'œil. */
function batirChateau(c) {
  const g = new THREE.Group();
  g.add(bloc(M.pierreF, 300, 16, 190, 0, 8, 0));
  g.add(bloc(M.pierre,  282, 8, 176, 0, 20, 0));
  for (let k = 0; k < 5; k++)
    g.add(bloc(M.pierreC, 150 - k * 8, 4.2, 12 + k * 9, 0, 14 - k * 4.2, 100 + k * 10));

  /* Le corps de garde, la porte et la herse. */
  g.add(bloc(M.pierre, 150, 130, 96, 0, 89, 0));
  /* ── La porte, et la profondeur qu'elle réclame ────────────────────────
     La herse était posée à z = 50 sur 2 d'épaisseur, la porte à z = 49 sur 4 :
     leurs faces avant tombaient toutes deux EXACTEMENT sur z = 51. Deux
     surfaces coplanaires, c'est un tirage au sort par pixel — et sur le
     téléphone d'JustAkhiraa cela donnait une bouillie noire et bleue en travers de
     l'entrée du château.

     Ce n'est pas un défaut « de téléphone ». Le tampon de profondeur y est
     souvent en 16 bits au lieu de 24 : avec un plan proche à 1 et une porte à
     150 unités, la plus petite différence que la carte sache distinguer vaut
     0,34 unité. Un écart de zéro n'avait donc aucune chance, et un écart d'un
     dixième n'en aurait pas eu davantage.

     Les trois plans sont maintenant séparés de deux unités — six fois la
     précision la plus mauvaise —, et le plan proche de la caméra passe de 1 à
     3 (voir plus haut), ce qui triple cette précision partout. */
  g.add(bloc(M.sombre, 42, 56, 4, 0, 52, 48));
  const arc = new THREE.Mesh(new THREE.CircleGeometry(21, 22, 0, Math.PI), M.sombre);
  arc.position.set(0, 80, 50.2);
  g.add(arc);
  for (let k = -3; k <= 3; k++) g.add(bloc(M.metal, 2.4, 52, 2, k * 6.6, 52, 52.4));
  for (let k = 0; k < 4; k++) g.add(bloc(M.metal, 42, 2.4, 2, 0, 34 + k * 14, 52.4));
  g.add(bloc(M.pierreC, 56, 6, 8, 0, 100, 50));

  /* Le donjon, plus haut, en retrait. */
  g.add(bloc(M.pierre, 108, 96, 76, 0, 200, -26));
  g.add(pyramide(M.ardoise, 84, 5, 54, 0, 274, -26));
  g.add(bloc(M.pierreC, 116, 7, 84, 0, 250, -26));

  /* Les créneaux : une boucle, pas quatorze lignes. Sur le corps de garde
     et sur le donjon — un mur droit en haut ne dit pas « château ». */
  const crenele = (l, p, y, x0, z0, pas) => {
    for (let x = -l / 2; x <= l / 2; x += pas) {
      g.add(bloc(M.pierreC, pas * 0.55, 10, 8, x0 + x, y, z0 + p / 2));
      g.add(bloc(M.pierreC, pas * 0.55, 10, 8, x0 + x, y, z0 - p / 2));
    }
    for (let z = -p / 2 + pas; z < p / 2; z += pas) {
      g.add(bloc(M.pierreC, 8, 10, pas * 0.55, x0 - l / 2, y, z0 + z));
      g.add(bloc(M.pierreC, 8, 10, pas * 0.55, x0 + l / 2, y, z0 + z));
    }
  };
  crenele(150, 96, 159, 0, 0, 19);
  crenele(108, 76, 258, 0, -26, 18);

  /* Quatre tours rondes, deux hautes devant, deux plus basses derrière. */
  const tour = (x, z, r, h, coiffe) => {
    g.add(cyl(M.pierre, r, r + 3, h, 20, x, h / 2 + 16, z));
    g.add(cyl(M.pierreC, r + 4, r + 4, 7, 20, x, h + 19, z));
    g.add(cyl(M.ardoise, 0.6, r + 5, coiffe, 20, x, h + 22 + coiffe / 2, z));
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6;
      g.add(bloc(M.pierreC, 6, 9, 6, x + Math.cos(a) * (r + 2), h + 26, z + Math.sin(a) * (r + 2)));
    }
    for (let k = 0; k < 4; k++)
      g.add(fenetre(6, 15, x, 46 + k * 34, z + r + 3.2));
    return h + 22 + coiffe;
  };
  tour(-92, 26, 27, 168, 52);
  const sommet = tour(92, 26, 27, 168, 52);
  tour(-84, -76, 22, 128, 42);
  tour(84, -76, 22, 128, 42);

  /* Les fenêtres : hautes et étroites, et par rangées. C'est leur ALIGNEMENT
     qui fait lire des étages, donc une échelle habitée. */
  for (const y of [56, 104]) for (let k = -3; k <= 3; k++)
    if (Math.abs(k) > 0) g.add(fenetre(9, 20, k * 21, y, 48.4));
  for (const y of [176, 222]) for (let k = -2; k <= 2; k++)
    g.add(fenetre(9, 22, k * 22, y, 12.4));

  /* Les bannières : elles portent la couleur de la matière, et ondulent.
     C'est le seul endroit du village où la couleur d'une matière tient une
     grande surface. */
  const banMat = new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide,
                                                 flatShading: true });
  /* Une bannière se termine en QUEUE D'ARONDE, et elle pend d'une hampe.
     Un rectangle plein posé sur un mur ne se lit pas comme une étoffe : il
     se lit comme un écran allumé, ce qu'on voyait. */
  const etoffe = new THREE.Shape();
  etoffe.moveTo(-11, 0); etoffe.lineTo(11, 0); etoffe.lineTo(11, -46);
  etoffe.lineTo(0, -34); etoffe.lineTo(-11, -46); etoffe.closePath();
  const geoBan = new THREE.ShapeGeometry(etoffe);
  for (const x of [-54, 54]) {
    const b = new THREE.Group();
    b.position.set(x, 146, 49.8);
    b.add(cyl(M.or, 0.9, 0.9, 26, 8, 0, 0, 0).rotateZ(Math.PI / 2));
    const e = new THREE.Mesh(geoBan, banMat);
    e.position.y = -1;
    b.add(e);
    g.add(b);
    BALANCE.push({ o: b, v: 1.5, a: 0.05, axe: "x" });
  }

  /* La parabole, son mât et sa balise. */
  {
    const p = new THREE.Group();
    p.position.set(92, sommet + 26, 26);
    p.add(cyl(M.metal, 1.6, 2.2, 34, 10, 0, -14, 0));
    const plat = new THREE.Mesh(
      new THREE.SphereGeometry(20, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2.6),
      new THREE.MeshStandardMaterial({ color: 0xE8E4DA, roughness: 0.5,
                                       metalness: 0.2, side: THREE.DoubleSide }));
    plat.rotation.x = Math.PI * 0.78;
    p.add(plat);
    p.add(cyl(M.metal, 1, 1, 15, 8, 0, 7, 7).rotateX(-0.6));
    const balise = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xFF4444, fog: false }));
    balise.position.set(0, 12, 0);
    balise.userData.balise = true;
    p.add(balise);
    g.add(p);
    TOURNE.push({ o: p, axe: "y", v: 0.12 });
  }
  /* Le mât à antennes sur le donjon : trois barres qui décroissent. */
  {
    const m = new THREE.Group();
    m.position.set(0, 302, -26);
    m.add(cyl(M.metal, 0.9, 1.4, 56, 8, 0, 28, 0));
    for (let k = 0; k < 3; k++)
      m.add(bloc(M.metal, 30 - k * 8, 1.4, 1.4, 0, 30 + k * 12, 0));
    g.add(m);
  }
  return { groupe: g, hauteur: 330, demiLargeur: 150, parvis: 112, accent: c,
           arbres: [[-190, 120, "sapin", 1.2], [190, 120, "sapin", 1.1],
                    [-210, -30, "sapin", 0.95], [210, -30, "sapin", 1.05]] };
}

const FORMES = { atelier: batirAtelier, observatoire: batirObservatoire,
                 colombages: batirColombages, pagode: batirPagode,
                 chateau: batirChateau };

/* ═══════════════════════════════════════ le village se bâtit ════════ */
const AXE_Y = new THREE.Vector3(0, 1, 0);
const matieres = [];
const groupesBat = [];

DONNEES.poles.forEach((pole, i) => {
  const L = LIEUX[pole.matiere] || LIEUX.dev;
  const couleur = COULEURS[pole.matiere] ?? 0x9FB6DF;
  const b = FORMES[L.forme](couleur);
  const pos = new THREE.Vector3(L.x, 0, L.z);
  b.groupe.position.copy(pos);
  b.groupe.rotation.y = L.rot;
  b.groupe.userData.matiere = i;
  scene.add(b.groupe);
  groupesBat.push(b.groupe);

  /* La normale de façade : le vecteur qui sort du bâtiment par sa porte.
     Tout en dépend — où se poser devant lui, où accrocher son enseigne, dans
     quel sens tourner ses cartes. Il n'y a qu'un seul endroit où elle est
     calculée, et c'est celui-ci. */
  const n = new THREE.Vector3(Math.sin(L.rot), 0, Math.cos(L.rot));
  scene.add(contact(b.demiLargeur * 2.7, b.demiLargeur * 2.3, L.x, L.z));

  /* Les arbres que la silhouette demande, en coordonnées du bâtiment :
     il faut donc les tourner comme lui avant de les semer. */
  (b.arbres || []).forEach(([ax, az, type, ech]) => {
    const p = new THREE.Vector3(ax, 0, az).applyAxisAngle(AXE_Y, L.rot).add(pos);
    arbre(p.x, p.z, type, ech);
  });

  /* L'anneau au sol : invisible, sauf au survol. C'est lui qui répond
     « celui-là est sélectionnable » — un bâtiment qui ne réagit pas au
     pointeur n'a pas l'air d'un bouton. */
  const anneau = new THREE.Mesh(
    new THREE.RingGeometry(b.demiLargeur + 8, b.demiLargeur + 15, 64),
    new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: 0,
                                  side: THREE.DoubleSide, fog: true }));
  anneau.rotation.x = -Math.PI / 2;
  anneau.position.set(L.x, 0.7, L.z);
  scene.add(anneau);

  matieres.push({
    pole, i, L, b, n, pos, anneau, survol: 0,
    css: "#" + couleur.toString(16).padStart(6, "0"),
    accents: [],                       // ce qui porte la couleur de la matière
    parvis: b.parvis,                  // où s'arrête la caméra devant lui
  });
});

/* Les objets qui s'animent, retrouvés d'un seul parcours : la fumée de la
   forge et la balise rouge du château. Les chercher après coup évite de
   faire remonter deux tableaux à travers cinq constructeurs. */
const FUMEES = [], BALISES = [];
scene.traverse((o) => {
  if (o.userData.fumee) FUMEES.push(o);
  if (o.userData.balise) BALISES.push(o);
});
/* La balise clignote en jouant sur son opacité : il faut donc que son
   matériau soit transparent, et ça se règle une fois — pas soixante fois par
   seconde dans la boucle. */
BALISES.forEach((b) => { b.material.transparent = true; });
/* Les matériaux qui portent la couleur d'une matière, retrouvés de la même
   façon : au changement d'heure ils doivent passer de la teinte lumineuse à
   la teinte foncée, comme les cartes. */
matieres.forEach((m) => {
  m.b.groupe.traverse((o) => {
    if (o.material && o.material.color &&
        o.material.color.getHex() === COULEURS[m.pole.matiere]) m.accents.push(o.material);
  });
});

/* Quelques arbres et buissons de plus, pour que l'allée ne soit pas un
   couloir nu. Semés à des places FIXES : un village qui change de forme à
   chaque visite n'est pas un lieu, c'est un économiseur d'écran. */
[[-190, 210, "chene", 1.05], [188, 206, "chene", 0.9],
 [-164, 24, "chene", 0.85], [170, 30, "chene", 1],
 [-96, 236, "sapin", 0.8], [100, 240, "sapin", 0.9],
 [-124, -206, "chene", 0.95], [128, -200, "chene", 0.85]]
  .forEach(([x, z, t, e]) => arbre(x, z, t, e));
for (let k = 0; k < 26; k++) {
  const s = k % 2 ? 1 : -1;
  const x = s * (V.demiAllee + 12 + (k * 37) % 26);
  const z = V.zPortail - 20 - k * 21;
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4 + (k % 3), 0), M.feuille);
  b.position.set(x, 2.6, z);
  b.rotation.set(k, k * 2, k * 3);
  scene.add(b);
}

/* Les cinq bâtiments entrent au registre dès qu'ils existent : à partir
   d'ici, plus un arbre ne peut pousser dans une façade. */
for (const m of matieres) prendre(m.L.x, m.L.z, m.b.demiLargeur + 6);

/* ═══════════════════════════════════════ LE VILLAGE AUTOUR ══════════
   « Analyse les projets et récupère tout ce dont tu as besoin pour en faire
   un grand village qui vit. »

   Cinq bâtiments dans un champ ne font pas un village : il y manque la rue.
   Ce qui suit est donc une VILLE autour des cinq — une cinquantaine de
   maisons qui bordent l'allée, des collines au fond, et tout ce qui bouge :
   des habitants qui vont et viennent, des lucioles, des pétales, des
   oiseaux, la lumière des réverbères.

   Le problème, c'est le nombre. Cinquante maisons de vingt boîtes chacune,
   ce sont mille objets à dessiner un par un, et le village tombe à dix
   images par seconde sur un portable. La réponse vient de l'exemple
   « geometry / minecraft » qu'JustAkhiraa a fourni : on FOND toutes les boîtes
   d'un même matériau en une seule géométrie. Mille objets deviennent sept
   appels de rendu, et le coût cesse de dépendre du nombre de maisons.

   Le hasard, lui, est SEMÉ : la même graine donne le même village à chaque
   visite. Un village qui change de forme quand on recharge la page n'est
   pas un lieu, c'est un économiseur d'écran — et on ne s'y repère jamais. */

/* Le générateur de Mulberry : trente-deux bits d'état, une graine, et une
   suite de nombres qui a l'air du hasard mais n'en est pas. */
function semeur(graine) {
  let a = graine >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Les seaux : une liste de géométries par matériau, fondues à la fin. On
   dé-indexe tout avant de fondre — une géométrie indexée et une autre qui
   ne l'est pas refusent de se mélanger, et le facettage plat qu'on veut
   partout demande de toute façon des sommets séparés. */
const SEAUX = new Map();
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _ech = new THREE.Vector3();
const _eul = new THREE.Euler();

function pose(x, y, z, sx, sy, sz, ry) {
  _eul.set(0, ry || 0, 0);
  _quat.setFromEuler(_eul);
  return _mat4.compose(_pos.set(x, y, z), _quat, _ech.set(sx, sy, sz));
}
function ajoute(mat, geo, m) {
  let l = SEAUX.get(mat);
  if (!l) SEAUX.set(mat, l = []);
  /* toNonIndexed() se plaint bruyamment quand la géométrie l'est déjà —
     et c'est le cas des plans et des toits extrudés. On ne convertit que ce
     qui a un index. */
  const g = geo.index ? geo.clone().toNonIndexed() : geo.clone();
  l.push(g.applyMatrix4(m));
}
function fondre() {
  let objets = 0, appels = 0;
  for (const [mat, liste] of SEAUX) {
    if (!liste.length) continue;
    objets += liste.length;
    const g = mergeGeometries(liste, false);
    liste.forEach((x) => x.dispose());
    if (!g) continue;
    g.computeBoundingSphere();
    const o = new THREE.Mesh(g, mat);
    o.frustumCulled = false;   // une seule boîte englobante pour tout le bourg
    scene.add(o);
    appels++;
  }
  SEAUX.clear();
  return { objets, appels };
}

/* ── Les collines du fond ───────────────────────────────────────────────
   Sans elles, le sol est un disque plat jusqu'à l'horizon, et le village
   flotte sur une table. Le relief vient du bruit de Perlin — celui de
   l'exemple « minecraft » —, et il est APLATI au centre : on ne construit
   pas un village sur une bosse. */
{
  /* Le maillage ne calcule plus sa propre hauteur : il INTERROGE « hauteurSol »,
     la même fonction que le pas. C'est la seule façon d'être certain que ce
     qu'on voit et ce sur quoi on marche sont la même chose.

     La définition monte de 72 à 180 segments : le terrain est passé de 4200 à
     7000 unités, et garder 72 aurait donné des facettes de 97 unités — un
     escalier visible sur chaque pente. 180 ramène le pas à 39. */
  const N = 180, ETENDUE = RELIEF.etendue;
  const g = new THREE.PlaneGeometry(ETENDUE, ETENDUE, N, N);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    /* Le plan est encore à plat en XY : son « y » deviendra le « z » du monde
       après la rotation. On interroge donc hauteurSol(x, y). */
    p.setZ(i, hauteurSol(p.getX(i), p.getY(i)));
  }
  g.computeVertexNormals();
  const collines = new THREE.Mesh(g, M.herbe);
  collines.rotation.x = -Math.PI / 2;
  collines.position.y = -0.6;
  collines.userData.horsOmbre = true;
  /* Pas de « receiveShadow » ici, et c'est une correction, pas un oubli :
     je l'avais ajouté en passant. La caméra d'ombre du soleil couvre un carré
     de 430 unités autour du village — ce qu'il faut pour des bâtiments —, et
     un terrain de 7000 l'excède de très loin. Le résultat tenait en un mot :
     **tout le sol devenait noir**. Une ombre portée ne se décide pas objet
     par objet, elle se décide par rapport au volume que la lumière sait
     mesurer. */
  scene.add(collines);
}

/* ══════════════════════════════════════════════ les boutiques ════════
   JustAkhiraa : « je veux plus de monde à explorer et des boutiques, parce que
   quand je regarde derrière moi c'est le vide » — et, plus précisément :
   « dans les maisons autour il y a des immeubles à visiter, et en easter egg,
   quand tu entres dans une certaine boutique tu peux utiliser un des outils,
   comme l'atelier pour coder en C ».

   Le village avait cinq bâtiments, un par matière, et cinquante maisons
   muettes. La partie SUD — derrière le point de départ, entre la fontaine et
   le portail — n'était qu'un décor qu'on tourne le dos à. C'est pourtant le
   premier endroit qu'on voit en se retournant.

   Sept échoppes y ouvrent, et chacune abrite un outil du site. Ce n'est pas
   un gadget : un convertisseur binaire cherché dans un menu est un
   convertisseur ; le même, trouvé derrière la porte d'une boutique qui
   s'appelle « La Table de Conversion », se retient. C'est la seule raison de
   les mettre là — pas la décoration, la MÉMOIRE DU LIEU.

   Le plan est déclaré AVANT la rue : c'est lui qui réserve la place, sinon
   les cinquante maisons bâtissent par-dessus. */
const BOUTIQUES = [
  { nom: "L'Atelier du C", enseigne: "{;}", couleur: 0x62E88A,
    outil: "outils/langage-c.html", cote: -1, z: 262,
    tenancier: "Maître Clang",
    bonjour: "Bonjour ! Vous voulez coder en C ? Entrez, la forge est chaude — "
           + "et ici le compilateur vous dit ce qui cloche, avec la ligne." },
  { nom: "Le Bureau des Masques", enseigne: "/24", couleur: 0x54BEF8,
    outil: "outils/sous-reseau.html", ancre: [-406, 182], cote: 1, z: 246,
    tenancier: "Dame VLSM",
    bonjour: "Un réseau à découper ? Posez votre adresse sur le comptoir, "
           + "je vous dis combien d'hôtes il vous reste." },
  { nom: "La Table de Conversion", enseigne: "0b", couleur: 0xFFB05A,
    outil: "outils/convertisseur.html", ancre: [702, -92], cote: -1, z: 214,
    tenancier: "Le changeur",
    bonjour: "Binaire, hexadécimal, décimal — je change tout, et je montre "
           + "les quatre octets de couleurs différentes." },
  { nom: "Le Comptoir des Ports", enseigne: "22", couleur: 0xCE96FF,
    outil: "outils/ports.html", ancre: [286, 372], cote: 1, z: 198,
    tenancier: "Le portier",
    bonjour: "Vingt-deux, quatre-vingts, quatre cent quarante-trois… "
           + "Dites-moi un numéro, je vous dis qui frappe." },
  { nom: "L'Écritoire", enseigne: "EN", couleur: 0xFF9ED2,
    outil: "outils/compte-rendu.html", ancre: [-282, -404], cote: -1, z: 166,
    tenancier: "La scribe",
    bonjour: "Un compte rendu à rendre ? Je compte les mots pendant que "
           + "vous écrivez, et je vous dis si le barème tient." },
  { nom: "La Halle aux Câbles", enseigne: "⇄", couleur: 0x7FD6C5,
    outil: "outils/packet-tracer.html", ancre: [556, 468], cote: 1, z: 150,
    tenancier: "Le câbleur",
    bonjour: "Packet Tracer ? J'ai les blocs de commandes tout prêts, "
           + "avec votre nom d'hôte et votre mot de passe dedans." },
  { nom: "Le Grenier des Masques", enseigne: "255", couleur: 0xFF7B7B,
    outil: "outils/masques.html", cote: -1, z: 134,
    tenancier: "Le compteur",
    bonjour: "Trente-trois lignes, du /0 au /32, recalculées à chaque "
           + "publication. Aucune n'est recopiée d'un livre." },
];
/* La largeur d'une échoppe et son recul par rapport au pavé. La façade
   s'aligne sur le premier rang de maisons : une boutique en retrait passerait
   pour une remise. */
const BOUT_L = 30, BOUT_P = 26, BOUT_X = V.demiAllee + 9 + BOUT_P / 2;
/* ── Les échoppes quittent l'allée ───────────────────────────────────────
   « les boutiques des outils sont sur la grande allée alors que je voulais
   faire vivre le village et mettre des boutiques un peu partout même
   derrière. »

   Elles étaient toutes alignées le long du pavé, à droite et à gauche, dans
   l'ordre où on les croisait. C'était commode et c'était mort : on les voyait
   toutes en une fois, et il n'y avait rien à TROUVER.

   Cinq s'en vont, chacune là où elle a une raison d'être — l'Écritoire
   contre la bibliothèque, le Bureau des Masques au bord du lac, le Comptoir
   des Ports près du parc, les deux autres dans des hameaux. Deux restent sur
   l'allée, et ce n'est pas un compromis : sans elles, un visiteur qui ne
   s'écarte jamais du pavé ne saurait pas que des échoppes existent. On garde
   l'exemple au bord du chemin et on cache le reste — c'est la règle de toute
   découverte réussie.

   Celles qui ont un « lieu » le prennent ; les autres gardent leur place le
   long de l'allée. */
/* ── Une échoppe cherche sa place, on ne la lui dicte plus ───────────────
   JustAkhiraa, capture à l'appui : « là t'as mis une boutique sur l'autre »,
   « franchement ça commence à m'énerver, avant de me présenter un truc
   vérifie ».

   Il a raison sur les deux points. Mesuré : **« Le Grenier des Masques »
   pénétrait « L'atelier » de seize unités** — une échoppe bâtie dans le mur
   du bâtiment Informatique, avec son enseigne qui sortait du toit.

   Et la cause n'est pas une coordonnée fautive, c'est la MÉTHODE : j'écrivais
   les positions à la main, puis j'espérais. Tant qu'une place est un nombre
   qu'on tape, il y aura des collisions — et il y en avait déjà avant que j'y
   touche, ce qui prouve que personne ne peut tenir ça de tête.

   Chaque échoppe reçoit donc une ANCRE — le lieu auquel elle appartient — et
   cherche elle-même une place autour : on essaie des anneaux de plus en plus
   larges, et on prend la première position prouvée libre de tout. Si aucune
   ne convient, l'échoppe n'est pas posée et le compte le dit. On ne peut plus
   bâtir dans un mur, quelles que soient les valeurs écrites plus haut. */
{
  const rnd = semeur(99001122);
  /* Ce qu'il faut éviter : les cinq bâtiments avec leur parvis, le pavé de
     l'allée, les chemins, et les échoppes déjà placées. */
  const batis = matieres.map((m) => ({ x: m.L.x, z: m.L.z, r: m.b.demiLargeur + 26 }));
  const posees = [];
  const DEMI = Math.max(BOUT_L, BOUT_P) / 2;
  const libreIci = (x, z) => {
    if (Math.abs(x) < V.demiAllee + 10 && z < V.zPortail + 30 && z > V.zChateau - 30)
      return false;                                   // sur le pavé de l'allée
    if (surUnChemin(x, z, DEMI + 16)) return false;    // sur un chemin
    if (Math.hypot(x, z) > R_BORD - 140) return false; // trop près de la ceinture
    for (const b of batis) if (Math.hypot(x - b.x, z - b.z) < b.r + DEMI) return false;
    for (const p of posees) if (Math.hypot(x - p.x, z - p.z) < 2 * DEMI + 34) return false;
    return true;
  };

  for (const b of BOUTIQUES) {
    const [ax, az] = b.ancre || [b.cote * BOUT_X, b.z];
    let place = null;
    /* Anneaux croissants autour de l'ancre, douze essais par anneau. On garde
       la PREMIÈRE place libre : la plus proche de l'ancre, donc celle qui
       respecte le mieux l'intention. */
    for (let r = 0; r <= 240 && !place; r += 12) {
      const depart = rnd() * Math.PI * 2;
      for (let k = 0; k < 12 && !place; k++) {
        const a = depart + k * Math.PI / 6;
        const x = ax + (r ? Math.cos(a) * r : 0);
        const z = az + (r ? Math.sin(a) * r : 0);
        if (libreIci(x, z)) place = { x, z };
      }
    }
    if (!place) { b.absente = true; continue; }
    b.x = place.x; b.z = place.z;
    /* La façade regarde vers le village : c'est de là qu'on arrive. */
    b.rot = Math.atan2(-b.x, -b.z) + Math.PI;
    posees.push(place);
    prendre(place.x, place.z, DEMI + 6);
  }
  const absentes = BOUTIQUES.filter((b) => b.absente).length;
  if (absentes) console.warn("échoppes sans place : " + absentes);
}

/* ── La rue : une cinquantaine de maisons qui bordent l'allée ──────────
   Elles n'ont pas de porte à ouvrir ni de nom : ce sont des VOISINES. Leur
   rôle est de fermer la rue des deux côtés, pour que l'allée soit une rue
   et non un couloir tracé dans un pré. Chacune est tirée au sort dans des
   bornes étroites — une variation d'un tiers suffit à ce que l'œil ne voie
   plus la répétition, et au-delà le village perd son unité. */
{
  const rnd = semeur(20252027);
  const MURS = [M.platre, M.pierreC, M.brique, M.pierre];
  const TOITS = [M.tuile, M.ardoise, M.tuile];
  /* Ce que les cinq bâtiments occupent déjà, et où l'on ne bâtit pas. Les
     sept échoppes y entrent aussi : sans cette ligne, la rue en bâtirait une
     par-dessus, et l'on cliquerait sur une porte qui ne mène nulle part. */
  const pris = matieres.map((m) => ({ x: m.L.x, z: m.L.z, r: m.b.demiLargeur + 12 }))
    .concat(BOUTIQUES.map((b) => ({ x: b.x, z: b.z, r: BOUT_L / 2 + 14 })));
  /* La PLACE devant chaque bâtiment : un couloir ouvert dans l'axe de sa
     façade, où l'on se tient pour lire ses chapitres. Rien n'y est bâti —
     c'est ce qui manquait le jour où la caméra s'est retrouvée dans le mur
     d'une maison. Un parvis n'est pas une commodité de rendu : c'est un
     lieu, et il doit exister dans le plan du village. */
  const places = matieres.map((m) => ({ p: m.pos, n: m.n,
                                        long: m.parvis + 210, demi: 120 }));
  const surUnePlace = (x, z, r) => places.some((c) => {
    const dx = x - c.p.x, dz = z - c.p.z;
    const avance = dx * c.n.x + dz * c.n.z;          // le long de la façade
    const ecart = Math.abs(dx * c.n.z - dz * c.n.x); // de part et d'autre
    return avance > -r && avance < c.long + r && ecart < c.demi + r;
  });
  /* Et l'on ne bâtit pas sur un chemin : c'est ce qui manquait, et c'est ce
     qui mettait trois maisons en travers de la route du lac. */
  const libre = (x, z, r) => !surUnePlace(x, z, r) &&
    !surUnChemin(x, z, r + 14) &&
    !pris.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + r);

  const fenetresRue = new THREE.MeshBasicMaterial({ color: 0xFFC066, fog: true });
  FENETRES.push(fenetresRue);
  let posees = 0;

  /* Trois rangs de chaque côté. Le premier borde l'allée et se faufile
     entre les cinq bâtiments ; les deux autres passent derrière eux et
     ferment l'horizon. C'est le troisième rang qu'on ne visite jamais et
     qui fait pourtant la ville : sans lui, on voit le pré derrière les
     maisons de devant. */
  /* ── Ce qui faisait « un peigne » ────────────────────────────────────
     JustAkhiraa : « les maisons sont alignées ». Elles l'étaient au sens
     strict : trois reculs possibles — 9, 104, 192 — identiques pour les
     cinquante, et une façade rigoureusement perpendiculaire à l'allée pour
     toutes. Trois lignes parfaites de chaque côté : ce n'est pas une rue,
     c'est une règle graduée.

     Trois corrections, et aucune n'ajoute un objet :
       · le recul de CHAQUE maison varie de ±22 autour de son rang — l'une
         avance sur la rue, sa voisine est au fond de sa cour ;
       · la façade est tournée de quelques degrés au hasard, parce qu'aucun
         maçon ne pose deux murs exactement parallèles ;
       · une maison sur cinq est sautée, et le vide devient une cour, un
         jardin ou un passage. Les vides font le rythme d'une rue ; sans eux
         elle n'est qu'un mur percé de fenêtres. */
  for (const s of [-1, 1]) {
    for (const bord of [V.demiAllee + 9, V.demiAllee + 104, V.demiAllee + 192]) {
      let z = V.zPortail + 30;
      while (z > -206) {
        const larg = 26 + rnd() * 18;
        const prof = 24 + rnd() * 12;
        const etages = 1 + Math.floor(rnd() * 3);       // de un à trois
        const h = 26 + etages * 17 + rnd() * 10;
        const decale = (rnd() - 0.5) * 44;              // le recul propre à celle-ci
        const x = s * (bord + prof / 2 + decale);
        const rot = (s > 0 ? -Math.PI / 2 : Math.PI / 2) + (rnd() - 0.5) * 0.16;
        if (rnd() < 0.19) {                             // une cour, pas une maison
          for (let k = -1; k <= 1; k++)
            ajoute(M.pierreF, BOITE,
                   pose(x, 2.2, z + k * 8, 3, 4.4, 8.4, rot));
          if (rnd() < 0.5) arbre(x + s * 16, z, "feuillu", 0.6 + rnd() * 0.25);
          z -= 30 + rnd() * 24;
          continue;
        }
        if (!libre(x, z, Math.max(larg, prof) / 2 + 4)) { z -= 26; continue; }

        const mur = MURS[Math.floor(rnd() * MURS.length)];
        const toit = TOITS[Math.floor(rnd() * TOITS.length)];
        /* Le corps, en étages légèrement décalés : un bloc unique se lit
           comme une boîte, deux blocs décalés se lisent comme une maison. */
        let bas = 0;
        for (let e = 0; e < etages; e++) {
          const he = h / etages;
          const dl = e === 0 ? 0 : (rnd() - 0.5) * 3;
          ajoute(mur, BOITE, pose(x, bas + he / 2, z, larg + dl, he, prof + dl, rot));
          bas += he;
        }
        /* Le toit : à deux pentes une fois sur deux, en pyramide sinon.
           Deux silhouettes suffisent à faire une rue variée. */
        if (rnd() < 0.55) {
          const f = new THREE.Shape();
          const hp = 9 + rnd() * 9;
          f.moveTo(-larg / 2 - 2, 0); f.lineTo(larg / 2 + 2, 0); f.lineTo(0, hp);
          f.closePath();
          const gt = new THREE.ExtrudeGeometry(f, { depth: prof + 4, bevelEnabled: false });
          gt.translate(0, 0, -(prof + 4) / 2);
          ajoute(toit, gt, pose(x, h, z, 1, 1, 1, rot));
          gt.dispose();
        } else {
          const gp = new THREE.CylinderGeometry(0.4, 0.72, 1, 4);
          gp.rotateY(Math.PI / 4);
          ajoute(toit, gp, pose(x, h + (6 + rnd() * 7) / 2, z,
                                larg + 5, 6 + rnd() * 7, prof + 5, rot));
          gp.dispose();
        }
        /* La cheminée, une fois sur deux. */
        if (rnd() < 0.6) {
          const cx = (rnd() - 0.5) * larg * 0.5;
          ajoute(M.brique, BOITE,
                 pose(x + Math.cos(rot) * cx, h + 9, z - Math.sin(rot) * cx,
                      5, 20, 5, 0));
        }
        /* Les fenêtres, alignées en rangées : c'est leur alignement qui
           fait lire des étages, donc une maison habitée. */
        const cols = Math.max(2, Math.round(larg / 13));
        for (let e = 0; e < etages; e++) {
          for (let k = 0; k < cols; k++) {
            if (rnd() < 0.16) continue;               // une fenêtre éteinte
            const dx = -larg / 2 + larg / (cols + 1) * (k + 1);
            const fy = h / etages * (e + 0.55);
            ajoute(fenetresRue, PLAN,
                   pose(x - s * (prof / 2 + 0.4), fy, z + dx * s * -1,
                        5.4, 7.2, 1, rot));
          }
        }
        /* La porte, au rez-de-chaussée. */
        ajoute(M.bois, BOITE,
               pose(x - s * (prof / 2 + 0.3), 7.5, z + (rnd() - 0.5) * larg * 0.4,
                    1, 15, 7, rot));
        posees++;
        BATIS.push({ x, z, r: Math.max(larg, prof) / 2 + 3 });
        solide(x, z, Math.max(larg, prof) / 2 + 2);
        z -= larg + 8 + rnd() * 12;
      }
    }
  }
  fondre();
  /* Un plancher : si la rue se vidait, le village redeviendrait cinq objets
     dans un pré, et rien à l'écran ne le dirait. */
  if (posees < 24) console.warn("village : seulement " + posees + " maisons");
}


/* ═══════════════════════════════════════ LES CHEMINS ════════════════
   JustAkhiraa, capture à l'appui : « ça ressemble à rien, ça n'a ni queue ni
   tête, les maisons sont alignées et le reste c'est bordélique et trop
   bizarre, ça n'a rien de commun. »

   Il a raison, et le diagnostic est dans sa phrase : il y avait DEUX logiques
   qui se contredisaient. Au centre, trois rangs de maisons parfaitement
   parallèles à l'allée — un peigne. Autour, des maisons semées au hasard dans
   un pré — du bruit. Un peigne et du bruit n'ont rien de commun, en effet.

   Or un village réel n'est ni ordonné ni désordonné : il est ORGANISÉ, et ce
   qui l'organise, ce sont ses chemins. On ne bâtit pas une maison quelque
   part, on la bâtit AU BORD D'UNE ROUTE. C'est pour ça que les villages ont
   une forme sans avoir de plan : la route vient d'abord, les façades la
   suivent, les jardins remplissent les creux, et la campagne commence là où
   les maisons s'espacent.

   Tout ce qui suit découle de cette seule idée. On trace d'abord cinq
   chemins qui partent du bourg vers les quatre lieux — le lac, le parc, la
   bibliothèque, les hameaux. Ensuite, et seulement ensuite, on pose les
   maisons le long de ces chemins. Plus rien n'est placé « quelque part ». */

/* La terre battue des chemins de campagne : plus claire que l'herbe, plus
   sombre que le pavé de l'allée. Un chemin qui aurait la couleur du pavé
   ferait croire à une rue ; il faut qu'on voie qu'on quitte le bourg. */
const TEX_TERRE = (() => {
  const N = 128, [c, g] = toileCarree(N);
  g.fillStyle = "#A8946C"; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 1400; i++) {
    const v = Math.random();
    g.fillStyle = v > 0.6 ? "rgba(150,132,96,.5)"
               : v > 0.3 ? "rgba(196,180,142,.45)" : "rgba(126,110,80,.4)";
    g.fillRect(Math.random() * N, Math.random() * N,
               1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  return enTexture(c, 10);
})();
M.terre = lambert(0xC9BFA2, { map: TEX_TERRE });

/* ── Tracer un chemin ────────────────────────────────────────────────────
   Un ruban de quadrilatères entre les points donnés. La largeur se rétrécit
   vers la fin : un chemin qui part du bourg est large, et il n'est plus
   qu'un sentier quand il arrive au lac. C'est ce rétrécissement qui dit la
   distance mieux que n'importe quel panneau. */
function tracerChemin(pts, l0, l1) {
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const L = Math.hypot(dx, dz);
    const larg = l0 + (l1 - l0) * (i / (n - 2 || 1));
    /* Le segment est posé au MILIEU et tourné : une boîte allongée suffit,
       et deux segments consécutifs se recouvrent assez au coude pour qu'on ne
       voie pas la coupure. */
    /* Le plan est fondu comme le reste : un chemin de dix segments ne doit
       pas coûter dix appels de rendu. « pose » tourne autour de Y, et le
       plan a déjà été couché par sa géométrie d'origine — c'est pourquoi on
       lui passe la longueur en Y et non en Z. */
    const g = PLAN.clone();
    g.rotateX(-Math.PI / 2);
    ajoute(M.terre, g,
           pose(x0 + dx / 2, 0.16, z0 + dz / 2, larg, 1, L + larg * 0.9,
                Math.atan2(dx, dz)));
    g.dispose();
  }
}

/* ── Poser des maisons LE LONG d'un chemin ───────────────────────────────
   Le cœur de la correction. On avance le long de la route par pas irréguliers
   et, à chaque arrêt, on décide : une maison, un jardin, ou rien.

   Trois choses font qu'une rangée cesse d'être un peigne :

   1. **Le recul varie.** Toutes les façades à la même distance du bord, c'est
      un lotissement. Chacune recule d'un montant tiré au sort dans une
      fourchette large — l'une touche presque la route, l'autre est au fond
      de son jardin.
   2. **La façade suit la route, pas l'axe du monde.** C'est automatique ici
      puisque la route tourne : une maison posée à un coude est de biais, et
      c'est exactement ce qui manquait.
   3. **Il y a des trous.** Un jardin, un muret, un verger, un pré. Une rue
      sans vide est un mur ; les vides sont ce qui donne son rythme à une rue.

   Et une quatrième, qui n'a l'air de rien : chaque maison est tournée d'un
   ou deux degrés de plus que la perpendiculaire. Personne ne le voit, tout le
   monde le sent — c'est la différence entre des maisons bâties une par une et
   des maisons imprimées. */
function longerLeChemin(pts, o) {
  const rnd = o.rnd;
  const L = longueurChemin(pts);
  const MURS = [M.platre, M.pierreC, M.brique, M.platre];
  const TOITS = [M.tuile, M.ardoise, M.tuile];
  let poses = 0;
  for (const cote of [-1, 1]) {
    let s = o.debut + rnd() * 40;
    while (s < L - 30) {
      const p = surChemin(pts, s);
      if (!p) break;
      /* La normale au chemin : c'est elle qui donne « le côté de la route ». */
      const nx = Math.cos(p.cap), nz = -Math.sin(p.cap);
      const recul = o.recul[0] + rnd() * (o.recul[1] - o.recul[0]);
      const larg = o.larg[0] + rnd() * (o.larg[1] - o.larg[0]);
      const prof = larg * (0.74 + rnd() * 0.3);
      const x = p.x + nx * cote * recul;
      const z = p.z + nz * cote * recul;
      /* La densité du lieu : 1 au cœur d'un noyau, 0 en rase campagne. C'est
         elle qui décide s'il y a une maison ici, et à quelle distance sera la
         suivante. Un seul nombre, et le ruban devient une suite de hameaux. */
      let dens = 0;
      for (const n of (o.noyaux || []))
        dens = Math.max(dens, 1 - Math.min(1, Math.abs(s - n.s) / n.r));
      dens = dens * dens * (3 - 2 * dens);          // adouci aux bords
      /* Un trou : jardin, verger ou pré. Il est rare au cœur d'un hameau et
         presque certain entre deux. */
      const quoi = rnd();
      /* Premier réglage mesuré : à « 0,12 + dens × 0,84 », la campagne n'a
         rendu que **17 bâtiments** sur un disque de 1250 de rayon — un désert
         avec quelques toits. Le contraste de densité était juste dans son
         principe et faux dans ses nombres : entre deux hameaux il ne doit pas
         y avoir RIEN, il doit y avoir peu. On passe à 0,34 au creux et 0,97
         au cœur. */
      if (!o.libre(x, z, Math.max(larg, prof) / 2 + 5) || quoi > 0.34 + dens * 0.63) {
        s += 22 + rnd() * 30;
        continue;
      }
      /* La façade regarde la route : perpendiculaire au chemin, plus un
         ou deux degrés de travers. */
      const rot = p.cap + (cote > 0 ? Math.PI / 2 : -Math.PI / 2)
                + (rnd() - 0.5) * 0.14;

      if (quoi < 0.34) {
        /* Un jardin clos : muret bas, un arbre, un potager. Il tient la
           ligne de la rue sans bâtir. */
        for (let k = -2; k <= 2; k++)
          ajoute(M.pierreF, BOITE,
                 pose(x + Math.cos(rot) * k * 7, 2.2, z - Math.sin(rot) * k * 7,
                      7.4, 4.4, 2, rot));
        arbre(x - nx * cote * 14, z - nz * cote * 14, "feuillu", 0.7 + rnd() * 0.3);
        s += 34 + (1 - dens) * 40 + rnd() * 24;
        continue;
      }

      const etages = rnd() < o.hautes ? 2 : 1;
      const h = 17 + etages * 9 + rnd() * 7;
      const mur = MURS[Math.floor(rnd() * MURS.length)];
      const toit = TOITS[Math.floor(rnd() * TOITS.length)];
      ajoute(mur, BOITE, pose(x, h / 2, z, larg, h, prof, rot));
      /* Un appentis une fois sur trois : c'est l'irrégularité du volume qui
         fait la maison paysanne. Un parallélépipède ne sera jamais une
         ferme. */
      if (rnd() < 0.34) {
        const al = larg * 0.42, ah = h * 0.52;
        ajoute(mur, BOITE,
               pose(x + Math.cos(rot) * (larg / 2 + al / 2 - 1), ah / 2,
                    z - Math.sin(rot) * (larg / 2 + al / 2 - 1),
                    al, ah, prof * 0.74, rot));
      }
      const hp = 7 + rnd() * 7;
      const f = new THREE.Shape();
      f.moveTo(-larg / 2 - 2, 0); f.lineTo(larg / 2 + 2, 0); f.lineTo(0, hp);
      f.closePath();
      const gt = new THREE.ExtrudeGeometry(f, { depth: prof + 4, bevelEnabled: false });
      gt.translate(0, 0, -(prof + 4) / 2);
      ajoute(toit, gt, pose(x, h, z, 1, 1, 1, rot));
      gt.dispose();
      if (rnd() < 0.55)
        ajoute(M.brique, BOITE,
               pose(x + Math.cos(rot) * (rnd() - 0.5) * larg * 0.5, h + 7,
                    z - Math.sin(rot) * (rnd() - 0.5) * larg * 0.5, 4, 15, 4, 0));
      /* Fenêtres et porte sur la face qui regarde la route. */
      const fx = x - nx * cote * (prof / 2 + 0.4);
      const fz = z - nz * cote * (prof / 2 + 0.4);
      for (let w = -1; w <= 1; w += 2)
        for (let e = 0; e < etages; e++)
          ajoute(o.vitres, PLAN,
                 pose(fx + Math.cos(rot) * w * larg * 0.26,
                      h / etages * (e + 0.55),
                      fz - Math.sin(rot) * w * larg * 0.26, 5, 6.4, 1, rot));
      ajoute(M.bois, BOITE, pose(fx, 7, fz, 6.4, 14, 1, rot));
      /* Une barrière devant, une fois sur deux : c'est elle qui raccroche la
         maison à la route au lieu de la laisser flotter dans l'herbe. */
      if (rnd() < 0.5) {
        const bx = p.x + nx * cote * (recul - prof / 2 - 9);
        const bz = p.z + nz * cote * (recul - prof / 2 - 9);
        for (let k = -2; k <= 2; k++)
          ajoute(M.bois, BOITE,
                 pose(bx + Math.cos(rot) * k * 6, 2.6, bz - Math.sin(rot) * k * 6,
                      1.3, 5.2, 1.3, rot));
      }
      o.obstacles.push({ x, z, r: Math.max(larg, prof) / 2 + 4 });
      poses++;
      /* Serrées dans le hameau, espacées dehors : de huit unités d'écart au
         cœur à soixante en rase campagne. */
      s += larg + 6 + (1 - dens) * 38 + rnd() * 16;
    }
  }
  return poses;
}

/* ── Les arbres aussi ont une raison d'être là ───────────────────────────
   Semés uniformément, ils font une moquette. On les pose donc de trois
   façons, et chacune se reconnaît :
     · en ALIGNEMENT le long d'un chemin — c'est ce qui fait une allée ;
     · en BOSQUET serré autour d'un point — c'est ce qui fait un bois ;
     · à l'unité dans les prés, mais rares, pour que le pré reste un pré. */
function alignerDesArbres(pts, o) {
  const L = longueurChemin(pts);
  for (const cote of [-1, 1]) {
    for (let s = o.debut; s < L - 20; s += o.pas + o.rnd() * o.pas * 0.3) {
      const p = surChemin(pts, s);
      if (!p) break;
      const nx = Math.cos(p.cap), nz = -Math.sin(p.cap);
      const x = p.x + nx * cote * o.ecart, z = p.z + nz * cote * o.ecart;
      if (!o.libre(x, z, 16)) continue;
      arbre(x, z, o.type || "feuillu", 0.8 + o.rnd() * 0.35);
    }
  }
}
function bosquet(cx, cz, n, rayon, o) {
  for (let i = 0; i < n; i++) {
    const a = o.rnd() * Math.PI * 2, d = Math.sqrt(o.rnd()) * rayon;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (!o.libre(x, z, 14)) continue;
    arbre(x, z, o.type || (o.rnd() < 0.5 ? "sapin" : "feuillu"),
          0.75 + o.rnd() * 0.5);
  }
}

/* ═══════════════════════════════════════ LA CAMPAGNE ════════════════
   « j'en ai marre de voir des zones vides aussi »
   « met plein de maisons, de trucs, un lac, des maisonnettes, un petit parc
     avec des enfants avec une balançoire, un toboggan et des enfants avec un
     bac à sable », « une grande bibliothèque »
   « ajoute des coins sympa genre des bancs etc »

   La rue au-dessus borde l'allée et s'arrête à deux cents unités de l'axe :
   c'était tout ce qu'on pouvait atteindre. Maintenant que le marchable fait
   un disque de 1250 et non plus une boîte de 500 × 498, ces deux cents unités
   laissent **dix-sept fois plus de pré vide** que de village.

   Ce qui suit remplit ce pré. Pas au hasard : avec des LIEUX, c'est-à-dire
   des endroits où l'on va pour une raison. Un décor qu'on traverse est encore
   du vide ; un lac où l'on descend, un parc où des enfants jouent, une
   bibliothèque qu'on voit de loin et vers laquelle on marche, ce sont des
   destinations. C'est la différence entre agrandir une carte et agrandir un
   monde.

   Tout est posé dans la PLAINE — rayon 1150 —, donc à hauteur zéro : rien
   ici n'a besoin de suivre le relief, et rien ne doit flotter sur une pente.

   La graine est fixe, comme pour la rue : le même village à chaque visite. */
{
  const rnd = semeur(70707171);
  const au = (x, z) => ({ x, z });

  /* Ce qui est déjà pris : les cinq bâtiments, les échoppes, la fontaine, et
     l'allée elle-même avec ses parvis. On ne bâtit pas dessus. */
  const occupe = matieres.map((m) => ({ x: m.L.x, z: m.L.z, r: m.b.demiLargeur + 40 }))
    .concat(BOUTIQUES.map((b) => ({ x: b.x, z: b.z, r: BOUT_L / 2 + 30 })))
    .concat([{ x: 0, z: V.zFontaine, r: V.rFontaine + 60 }]);
  /* Il ne reste de l'ancienne boîte que le strict nécessaire : le pavé de
     l'allée lui-même, qui n'est pas une maison et n'apparaît donc dans aucune
     liste. Tout le reste est su, maison par maison. */
  const SUR_LE_PAVE = (x, z) =>
    Math.abs(x) < V.demiAllee + 16 && z < V.zPortail + 40 && z > V.zChateau - 40;
  /* Même règle ici, et une de plus : on garde aussi les bâtiments de la
     campagne à l'écart les uns des autres. Sans cette liste qui grossit au
     fur et à mesure, deux maisons de deux chemins différents finissaient par
     se croiser au même endroit. */
  const dejaPose = [];
  const libre = (x, z, r) => !SUR_LE_PAVE(x, z) &&
    Math.hypot(x, z) < 1020 &&
    !BATIS.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + r) &&
    !surUnChemin(x, z, r + 6) &&
    !occupe.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + r) &&
    !dejaPose.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + r + 1);

  /* ── Le lac ───────────────────────────────────────────────────────────
     Une eau ne se lit pas à sa couleur mais à sa RIVE : sans la bande de
     galets qui l'entoure, un disque bleu posé sur l'herbe est une flaque de
     peinture. On lui donne donc une grève, des roseaux, un ponton et une
     barque — et la barque sert à l'échelle autant qu'au décor. */
  const LAC = au(-640, 60), R_LAC = 210;
  {
    const grève = new THREE.Mesh(new THREE.CircleGeometry(R_LAC + 26, 52), M.pierreC);
    grève.rotation.x = -Math.PI / 2;
    grève.position.set(LAC.x, 0.12, LAC.z);
    scene.add(grève);

    eauLacMat.uniforms.rayon.value = R_LAC;
    const eau = new THREE.Mesh(new THREE.CircleGeometry(R_LAC, 52), eauLacMat);
    eau.rotation.x = -Math.PI / 2;
    eau.position.set(LAC.x, 0.5, LAC.z);
    scene.add(eau);

    /* Les roseaux : trois cents brins fondus en un seul objet. Un brin seul
       ne se voit pas ; c'est leur masse sur la rive qui dit « c'est humide
       ici ». */
    for (let i = 0; i < 320; i++) {
      const a = rnd() * Math.PI * 2;
      const d = R_LAC - 4 - rnd() * 26;
      const x = LAC.x + Math.cos(a) * d, z = LAC.z + Math.sin(a) * d;
      ajoute(M.sapin, BOITE,
             pose(x, 4 + rnd() * 5, z, 0.7, 8 + rnd() * 10, 0.7, rnd() * 3));
    }
    /* Le ponton, côté village : c'est par là qu'on arrive, donc c'est là
       qu'on veut pouvoir s'avancer sur l'eau. */
    for (let i = 0; i < 9; i++) {
      ajoute(M.bois, BOITE, pose(LAC.x + 150 + i * 9, 1.6, LAC.z, 8.4, 1.2, 26, 0));
    }
    for (const dz of [-11, 11]) for (let i = 0; i < 5; i++) {
      ajoute(M.bois, BOITE, pose(LAC.x + 156 + i * 17, 0.6, LAC.z + dz, 2, 4, 2, 0));
    }
    /* Une barque amarrée au bout. Creuse : deux flancs, un fond, deux bouts —
       une coque pleine se lirait comme une caisse. */
    {
      const bx = LAC.x + 108, bz = LAC.z + 34, br = 0.5;
      ajoute(M.boisClair, BOITE, pose(bx, 1.6, bz, 26, 1.4, 9, br));
      for (const s of [-1, 1])
        ajoute(M.boisClair, BOITE,
               pose(bx - Math.sin(br) * s * 5.1, 3.1, bz + Math.cos(br) * s * 5.1,
                    26, 3.4, 1.1, br));
      for (const s of [-1, 1])
        ajoute(M.boisClair, BOITE,
               pose(bx + Math.cos(br) * s * 12.8, 3.1, bz + Math.sin(br) * s * 12.8,
                    1.1, 3.4, 9, br));
      ajoute(M.bois, BOITE, pose(bx + 2, 3.4, bz, 1, 0.9, 22, br + 0.5));
    }
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, d = R_LAC + 42 + rnd() * 90;
      arbre(LAC.x + Math.cos(a) * d, LAC.z + Math.sin(a) * d,
            rnd() < 0.3 ? "sapin" : "feuillu", 0.8 + rnd() * 0.5);
    }
    /* On ne marche pas dans l'eau : l'obstacle s'arrête à la grève, pas au
       bord du disque, pour qu'on puisse longer la rive sans patauger. */
    dejaPose.push({ x: LAC.x, z: LAC.z, r: R_LAC + 4 });
  }

  /* ── Le parc ──────────────────────────────────────────────────────────
     « un petit parc avec des enfants avec une balançoire, un toboggan et des
     enfants avec un bac à sable ».

     Les trois agrès sont bâtis à la taille d'un ENFANT, pas d'un adulte : une
     balançoire de quatre unités de haut sous un œil posé à dix-sept dit tout
     de suite de qui est ce parc. */
  const PARC = au(470, 430);
  {
    const sol = new THREE.Mesh(new THREE.CircleGeometry(150, 40), M.herbe);
    sol.rotation.x = -Math.PI / 2;
    sol.position.set(PARC.x, 0.1, PARC.z);
    scene.add(sol);

    /* La balançoire : deux A de bois, une poutre, deux sièges suspendus. */
    {
      const bx = PARC.x - 56, bz = PARC.z + 18;
      for (const s of [-1, 1]) {
        for (const t of [-1, 1])
          ajoute(M.bois, BOITE, pose(bx + s * 22, 9, bz + t * 7, 1.8, 19, 1.8, 0));
      }
      ajoute(M.bois, BOITE, pose(bx, 18.4, bz, 50, 1.8, 1.8, 0));
      for (const s of [-1, 1]) {
        for (const t of [-1, 1])
          ajoute(M.sombre, BOITE, pose(bx + s * 11 + t * 3.4, 12, bz, 0.4, 11, 0.4, 0));
        ajoute(M.boisClair, BOITE, pose(bx + s * 11, 6.6, bz, 8, 0.9, 3.4, 0));
      }
    }
    /* Le toboggan : une tour, une échelle, une glissière inclinée. La
       glissière est une boîte TOURNÉE, pas un plan : vue de côté elle a une
       épaisseur, et c'est elle qui la fait lire comme un toboggan. */
    {
      const tx = PARC.x + 34, tz = PARC.z - 26;
      for (const [dx, dz] of [[-5,-5],[5,-5],[-5,5],[5,5]])
        ajoute(M.bois, BOITE, pose(tx + dx, 8, tz + dz, 1.7, 17, 1.7, 0));
      ajoute(M.boisClair, BOITE, pose(tx, 16.6, tz, 13, 1.2, 13, 0));
      for (const s of [-1, 1])
        ajoute(M.bois, BOITE, pose(tx + s * 6, 21, tz, 1.2, 9, 1.2, 0));
      for (let k = 0; k < 5; k++)
        ajoute(M.bois, BOITE, pose(tx, 3 + k * 3.2, tz + 7.4, 9, 0.9, 1.1, 0));
      const g = new THREE.BoxGeometry(1, 1, 1);
      const m4 = new THREE.Matrix4().compose(
        new THREE.Vector3(tx, 9.4, tz - 15),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.72, 0, 0)),
        new THREE.Vector3(9, 1.1, 27));
      ajoute(M.metal, g, m4);
      g.dispose();
    }
    /* Le bac à sable, et les enfants autour. */
    {
      const sx = PARC.x - 8, sz = PARC.z + 66;
      const sable = new THREE.Mesh(new THREE.CircleGeometry(21, 24),
                                   lambert(0xE3D3A6));
      sable.rotation.x = -Math.PI / 2;
      sable.position.set(sx, 0.3, sz);
      scene.add(sable);
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2;
        ajoute(M.bois, BOITE,
               pose(sx + Math.cos(a) * 22, 1.5, sz + Math.sin(a) * 22, 6.4, 3, 3.4, -a));
      }
    }
    /* Les enfants. Ils ne sont pas des adultes réduits : la tête est plus
       grosse par rapport au corps, et c'est le seul détail qui compte pour
       qu'on lise un enfant et non un passant lointain. */
    const ENFANTS = [[PARC.x - 67, PARC.z + 18], [PARC.x - 55, PARC.z + 18],
                     [PARC.x + 34, PARC.z - 40], [PARC.x - 14, PARC.z + 62],
                     [PARC.x + 2, PARC.z + 70], [PARC.x + 46, PARC.z + 22]];
    const HABITS = [0xD2574A, 0x3E72A8, 0x6AA84F, 0xE0A32E, 0x8E5BA8, 0xD9668C];
    ENFANTS.forEach(([ex, ez], i) => {
      const g = new THREE.Group();
      const corps = lambert(HABITS[i % HABITS.length]);
      g.add(cyl(corps, 1.5, 2.2, 5.6, 8, 0, 2.8, 0));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 7),
                           lambert(0xE8C19B)).translateY(6.7));
      g.add(cyl(lambert(0x4A3728), 0.4, 1.7, 1.1, 9, 0, 7.6, 0));
      g.position.set(ex, 0, ez);
      g.rotation.y = rnd() * Math.PI * 2;
      g.scale.setScalar(TAILLE_HOMME * 0.62 / 8.2);
      scene.add(g);
      scene.add(contact(10, 10, ex, ez));
    });
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, d = 110 + rnd() * 70;
      arbre(PARC.x + Math.cos(a) * d, PARC.z + Math.sin(a) * d,
            rnd() < 0.25 ? "sakura" : "feuillu", 0.85 + rnd() * 0.4);
    }
    dejaPose.push({ x: PARC.x - 56, z: PARC.z + 18, r: 30 });
    dejaPose.push({ x: PARC.x + 34, z: PARC.z - 26, r: 22 });
  }

  /* ── La grande bibliothèque ───────────────────────────────────────────
     « une grande bibliothèque ». Elle doit se voir de loin — c'est à ça que
     sert un monument — donc elle est haute, large, et seule dans son pré.
     Un fronton, une colonnade, un toit à deux pentes et deux ailes basses :
     la silhouette d'une bibliothèque tient en ces quatre traits. */
  const BIBLI = au(-430, -520);
  {
    const L = 118, P = 62, H = 46;
    ajoute(M.pierreC, BOITE, pose(BIBLI.x, H / 2, BIBLI.z, L, H, P, 0));
    ajoute(M.pierre, BOITE, pose(BIBLI.x, 1.6, BIBLI.z, L + 14, 3.2, P + 14, 0));
    for (let k = 0; k < 8; k++) {
      const cx = BIBLI.x - L / 2 + 9 + k * (L - 18) / 7;
      ajoute(M.pierre, new THREE.CylinderGeometry(3.4, 3.8, 1, 10),
             pose(cx, H * 0.5, BIBLI.z + P / 2 + 7, 1, H, 1, 0));
    }
    ajoute(M.pierreC, BOITE, pose(BIBLI.x, H + 3, BIBLI.z + P / 2 + 7, L, 6, 16, 0));
    {
      const f = new THREE.Shape();
      f.moveTo(-L / 2 - 4, 0); f.lineTo(L / 2 + 4, 0); f.lineTo(0, 22); f.closePath();
      const g = new THREE.ExtrudeGeometry(f, { depth: P + 24, bevelEnabled: false });
      g.translate(0, 0, -(P + 24) / 2);
      ajoute(M.ardoise, g, pose(BIBLI.x, H + 6, BIBLI.z + 3.5, 1, 1, 1, 0));
      g.dispose();
    }
    for (const s of [-1, 1])
      ajoute(M.pierreC, BOITE, pose(BIBLI.x + s * (L / 2 + 26), 15, BIBLI.z, 52, 30, 44, 0));
    /* Les hautes fenêtres : c'est leur élancement qui dit la bibliothèque.
       Elles s'allument la nuit comme toutes les autres du village. */
    const vitres = new THREE.MeshBasicMaterial({ color: 0xFFC066, fog: true });
    FENETRES.push(vitres);
    for (let k = 0; k < 7; k++) {
      const vx = BIBLI.x - 46 + k * 15.4;
      ajoute(vitres, PLAN, pose(vx, 26, BIBLI.z - P / 2 - 0.4, 7, 26, 1, Math.PI));
    }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++)
      ajoute(vitres, PLAN,
             pose(BIBLI.x + s * (L / 2 + 26) - 15 + k * 15, 17,
                  BIBLI.z - 22.4, 7, 15, 1, Math.PI));
    scene.add(contact(190, 120, BIBLI.x, BIBLI.z));
    dejaPose.push({ x: BIBLI.x, z: BIBLI.z, r: 92 });
    for (let i = 0; i < 8; i++) {
      const a = rnd() * Math.PI * 2, d = 120 + rnd() * 60;
      arbre(BIBLI.x + Math.cos(a) * d, BIBLI.z + Math.sin(a) * d, "feuillu", 0.9);
    }
  }

  for (const [cle, pts] of Object.entries(CHEMINS))
    tracerChemin(pts, LARGEURS[cle][0], LARGEURS[cle][1]);

  /* ── Les maisons suivent les chemins ──────────────────────────────────
     Plus un seul hameau en cercle autour d'un puits : les maisons bordent la
     route, serrées près du bourg et de plus en plus rares en s'en éloignant.
     C'est cette DENSITÉ DÉCROISSANTE qui fait qu'on sent qu'on sort du
     village — et aucun panneau n'aurait pu le dire aussi bien. */
  const vitresC = new THREE.MeshBasicMaterial({ color: 0xFFC066, fog: true });
  FENETRES.push(vitresC);
  let maisonnettes = 0;
  const opts = { rnd, libre, vitres: vitresC, obstacles: dejaPose };
  maisonnettes += longerLeChemin(CHEMINS.lac,
    { ...opts, noyaux: NOYAUX.lac, debut: 70, recul: [26, 58], larg: [22, 34], hautes: 0.3 });
  maisonnettes += longerLeChemin(CHEMINS.parc,
    { ...opts, noyaux: NOYAUX.parc, debut: 80, recul: [28, 64], larg: [20, 32], hautes: 0.25 });
  maisonnettes += longerLeChemin(CHEMINS.bibli,
    { ...opts, noyaux: NOYAUX.bibli, debut: 90, recul: [24, 52], larg: [22, 36], hautes: 0.35 });
  maisonnettes += longerLeChemin(CHEMINS.est,
    { ...opts, noyaux: NOYAUX.est, debut: 60, recul: [30, 70], larg: [20, 34], hautes: 0.22 });
  maisonnettes += longerLeChemin(CHEMINS.nord,
    { ...opts, noyaux: NOYAUX.nord, debut: 70, recul: [26, 60], larg: [20, 30], hautes: 0.2 });
  maisonnettes += longerLeChemin(CHEMINS.ceinture,
    { ...opts, noyaux: NOYAUX.ceinture, debut: 40, recul: [24, 56],
      larg: [19, 31], hautes: 0.18 });

  /* ── Trois vrais hameaux, aux carrefours ──────────────────────────────
     Un hameau n'est pas un cercle de maisons : c'est l'endroit où un chemin
     en croise un autre, et où quelques maisons se sont serrées autour de ce
     croisement. Chacun a son puits — mais le puits est là PARCE QUE les
     maisons y sont, et non l'inverse. */
  const CARREFOURS = [[-262, 178], [396, -58], [-286, 358]];
  for (const [hx, hz] of CARREFOURS) {
    ajoute(M.pierre, new THREE.CylinderGeometry(5.4, 5.8, 1, 12),
           pose(hx, 3, hz, 1, 6, 1, 0));
    for (const s of [-1, 1])
      ajoute(M.bois, BOITE, pose(hx + s * 4.6, 11, hz, 1.3, 16, 1.3, 0));
    ajoute(M.tuile, BOITE, pose(hx, 19.6, hz, 13, 1.4, 9, 0));
    ajoute(M.pierreF, new THREE.CylinderGeometry(9, 9, 1, 14),
           pose(hx, 0.22, hz, 1, 1, 1, 0));
    dejaPose.push({ x: hx, z: hz, r: 9 });
  }

  /* ── Les arbres, de trois façons ──────────────────────────────────────
     Alignés le long des chemins, groupés en bois, et rares dans les prés. */
  for (const cle of ["lac", "parc", "bibli", "est", "nord", "ceinture"])
    alignerDesArbres(CHEMINS[cle],
      { rnd, libre, debut: 40, pas: 46, ecart: 17 + rnd() * 6 });
  const BOIS = [[-820, -330, 26, 150], [740, 480, 22, 130], [-120, 880, 28, 160],
                [880, 120, 20, 120], [-700, 620, 18, 110], [420, -780, 24, 140]];
  for (const [bx, bz, n, r] of BOIS) bosquet(bx, bz, n, r, { rnd, libre });
  let plantes = 0;
  for (let i = 0; i < 260 && plantes < 46; i++) {
    const a = rnd() * Math.PI * 2, d = 360 + rnd() * 620;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!libre(x, z, 40)) continue;
    arbre(x, z, rnd() < 0.3 ? "sapin" : "feuillu", 0.8 + rnd() * 0.5);
    plantes++;
  }

  /* ── Les coins sympa ──────────────────────────────────────────────────
     « ajoute des coins sympa genre des bancs etc ».

     Un banc n'est pas un meuble, c'est une INVITATION : il dit « on peut
     s'arrêter ici ». On les pose donc là où il y a quelque chose à regarder —
     face au lac, dans le parc, devant la bibliothèque —, jamais au milieu
     d'un pré. Un banc tourné vers rien est plus triste qu'un pré vide. */
  const BANCS = [
    [LAC.x + 232, LAC.z - 40, Math.PI / 2],  [LAC.x + 232, LAC.z + 48, Math.PI / 2],
    [LAC.x - 60, LAC.z - 244, Math.PI],      [PARC.x + 86, PARC.z + 40, -Math.PI / 2],
    [PARC.x - 96, PARC.z - 54, Math.PI / 2], [PARC.x + 6, PARC.z - 108, 0],
    [BIBLI.x - 118, BIBLI.z + 46, -Math.PI / 2],
    [BIBLI.x + 118, BIBLI.z + 46, Math.PI / 2],
    [250, 560, Math.PI], [-300, 330, -Math.PI / 2], [330, -420, 0], [-620, 430, 0],
  ];
  /* « Et mets une logique : pas de banc sur un chemin. »
     Les douze bancs étaient posés à la main, par coordonnées, écrites avant
     que le réseau de chemins existe. Trois d'entre eux tombaient sur la
     route. On ne corrige pas trois coordonnées — on pose la RÈGLE, et elle
     vaudra pour les bancs qu'on ajoutera plus tard : un banc qui tombe sur
     un chemin ou sur un bâti est décalé vers l'extérieur ; s'il ne trouve
     pas de place, il n'est pas posé du tout. Mieux vaut onze bancs bien
     placés que douze dont un est au milieu de la route. */
  let bancsPoses = 0;
  for (const [x0, y0, rot] of BANCS) {
    let x = x0, z = y0, ok = false;
    for (let essai = 0; essai < 7; essai++) {
      if (!surUnChemin(x, z, 16) && libre(x, z, 12)) { ok = true; break; }
      /* On l'écarte perpendiculairement à son assise, donc il garde son
         orientation et continue de regarder ce qu'il regardait. */
      x += Math.sin(rot) * 13;
      z += Math.cos(rot) * 13;
    }
    if (!ok) continue;
    bancsPoses++;
    ajoute(M.boisClair, BOITE, pose(x, 5.4, z, 17, 1.4, 5.4, rot));
    ajoute(M.boisClair, BOITE,
           pose(x - Math.sin(rot) * 2.4, 8.6, z - Math.cos(rot) * 2.4, 17, 6.4, 1.2, rot));
    for (const s of [-1, 1])
      ajoute(M.sombre, BOITE,
             pose(x + Math.cos(rot) * s * 7, 2.6, z - Math.sin(rot) * s * 7,
                  1.4, 5.4, 4.6, rot));
    solide(x, z, 10);
  }
  if (bancsPoses < 8) console.warn("campagne : " + bancsPoses + " bancs posés");
  /* Deux tables de pique-nique, des meules et une charrette : ce qui fait
     qu'un pré a été TRAVAILLÉ, et non simplement dessiné. */
  for (const [x, z] of [[PARC.x - 120, PARC.z + 96], [LAC.x + 268, LAC.z + 120]]) {
    if (surUnChemin(x, z, 20) || !libre(x, z, 16)) continue;
    solide(x, z, 14);
    ajoute(M.boisClair, BOITE, pose(x, 8.4, z, 24, 1.6, 12, 0));
    for (const s of [-1, 1]) {
      ajoute(M.boisClair, BOITE, pose(x, 5, z + s * 9, 24, 1.3, 5, 0));
      ajoute(M.bois, BOITE, pose(x + s * 9, 4, z, 1.6, 8, 11, 0));
    }
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = 420 + rnd() * 460;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!libre(x, z, 20)) continue;
    if (surUnChemin(x, z, 18)) continue;
    solide(x, z, 9);
    ajoute(lambert(0xCDB169), new THREE.CylinderGeometry(7.4, 8.6, 1, 10),
           pose(x, 6, z, 1, 12, 1, 0));
  }


  /* ── Aucun chemin ne s'arrête net ─────────────────────────────────────
     JustAkhiraa : « mets pas de chemin qui s'arrête net ».

     C'était le cas : les cinq branches finissaient au milieu d'un pré, sur
     la dernière portion de terre battue, sans rien. Un chemin qui s'arrête
     sans raison est pire qu'un mur invisible — il PROMET quelque chose et
     ne le tient pas.

     Chaque branche va donc maintenant jusqu'à la ceinture, et se termine par
     un lieu : une placette pavée, un poteau indicateur, un banc tourné vers
     l'obstacle, et une arche de pierre. On arrive quelque part, on regarde
     le fleuve ou la muraille, on fait demi-tour en sachant pourquoi. */
  for (const cle of ["lac", "parc", "bibli", "est", "nord"]) {
    const pts = CHEMINS[cle];
    const [bx, bz] = pts[pts.length - 1];
    const d = Math.hypot(bx, bz);
    const ux = bx / d, uz = bz / d;
    const tx = ux * (R_BORD - 38), tz = uz * (R_BORD - 38);

    /* La placette : un disque de pavé, posé un cheveu au-dessus du chemin
       pour qu'on voie qu'elle est la fin et non un élargissement. */
    const place = new THREE.Mesh(new THREE.CircleGeometry(30, 22), M.pave);
    place.rotation.x = -Math.PI / 2;
    place.position.set(tx, 0.22, tz);
    scene.add(place);

    const cap = Math.atan2(ux, uz);
    /* L'arche : deux piliers et un linteau, face à l'obstacle. Elle encadre
       ce qu'on est venu voir — c'est tout ce qu'une arche sait faire, et
       c'est beaucoup. */
    for (const s of [-1, 1]) {
      const px = tx + Math.cos(cap) * s * 15, pz = tz - Math.sin(cap) * s * 15;
      ajoute(M.pierreC, BOITE, pose(px, 15, pz, 6, 30, 6, cap));
      solide(px, pz, 5);
    }
    ajoute(M.pierreC, BOITE, pose(tx, 32, tz, 38, 5, 7, cap));

    /* Le poteau indicateur : trois flèches, et l'une pointe le village.
       C'est le seul objet du monde qui dit « par là », et il est au bout du
       chemin — c'est-à-dire là où l'on se demande où l'on est. */
    const poteau = tx - ux * 20, poteauZ = tz - uz * 20;
    ajoute(M.bois, new THREE.CylinderGeometry(1.4, 1.8, 1, 7),
           pose(poteau, 13, poteauZ, 1, 26, 1, 0));
    for (let f = 0; f < 3; f++)
      ajoute(M.boisClair, BOITE,
             pose(poteau + Math.cos(cap + f * 2.1) * 6, 19 - f * 5,
                  poteauZ - Math.sin(cap + f * 2.1) * 6,
                  13, 3.4, 1.4, cap + f * 2.1));
    solide(poteau, poteauZ, 4);

    /* Un banc tourné VERS l'obstacle, pas vers le chemin : on s'assied pour
       regarder le fleuve, jamais pour regarder la route d'où l'on vient. */
    const bx2 = tx - ux * 6, bz2 = tz - uz * 6;
    ajoute(M.boisClair, BOITE, pose(bx2, 5.4, bz2, 17, 1.4, 5.4, cap));
    ajoute(M.boisClair, BOITE,
           pose(bx2 - ux * 2.4, 8.6, bz2 - uz * 2.4, 17, 6.4, 1.2, cap));
    solide(bx2, bz2, 10);
  }

  /* ── La bambouseraie ──────────────────────────────────────────────────
     « mets un coin forêt de bambou. »

     Un bambou n'est pas un arbre maigre : c'est une TIGE, très haute, très
     fine, sans branches sur les trois quarts de sa hauteur, et il ne pousse
     jamais seul. C'est la densité qui fait la bambouseraie — quatre cents
     tiges serrées sur quatre-vingts unités —, et la lumière qui tombe entre
     elles par traits verticaux.

     On la pose près de la pagode, du côté de Culture générale : c'est le
     seul endroit du village où elle ne tombe pas du ciel. Un sentier la
     traverse, parce qu'une masse qu'on ne peut pas pénétrer n'est qu'un mur
     vert — et qu'on est venu pour marcher dedans. */
  {
    const BAM = { x: 712, z: -492 }, R = 118;
    const tige = lambert(0x8FA85C);
    const feuille = lambert(0x6E8F46);
    const sol = new THREE.Mesh(new THREE.CircleGeometry(R + 16, 28),
                               lambert(0x6B6A4E));
    sol.rotation.x = -Math.PI / 2;
    sol.position.set(BAM.x, 0.14, BAM.z);
    scene.add(sol);

    /* Le sentier : une bande qui traverse de part en part. On ne sème pas de
       tige dessus — c'est la même règle que pour les bancs, et elle vaut
       partout : rien ne se pose sur un passage. */
    const capS = 0.7;
    const sx = Math.cos(capS), sz = Math.sin(capS);
    const g = PLAN.clone(); g.rotateX(-Math.PI / 2);
    ajoute(M.terre, g, pose(BAM.x, 0.2, BAM.z, 13, 1, (R + 16) * 2,
                            Math.atan2(sx, sz)));
    g.dispose();
    const surLeSentier = (x, z) => {
      const dx = x - BAM.x, dz = z - BAM.z;
      return Math.abs(dx * sz - dz * sx) < 9;     // distance à l'axe du sentier
    };

    const rnd = semeur(606060);
    let tiges = 0;
    for (let i = 0; i < 620; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R;
      const x = BAM.x + Math.cos(a) * d, z = BAM.z + Math.sin(a) * d;
      if (surLeSentier(x, z)) continue;
      const h = 54 + rnd() * 46;
      ajoute(tige, new THREE.CylinderGeometry(0.75, 1.05, 1, 5),
             pose(x, h / 2, z, 1, h, 1, 0));
      /* Trois touffes de feuilles, dans le tiers supérieur seulement. */
      for (let k = 0; k < 3; k++)
        ajoute(feuille, BOITE,
               pose(x + (rnd() - 0.5) * 5, h * (0.72 + k * 0.1),
                    z + (rnd() - 0.5) * 5, 7, 0.5, 2.2, rnd() * 3));
      /* Solide, mais d'un rayon de tige : on se faufile entre, on ne
         traverse pas. C'est ce qui rend une bambouseraie agréable à
         parcourir — on doit la négocier. */
      solide(x, z, 1.6);
      tiges++;
    }
    /* Deux lanternes de pierre le long du sentier : la seule lumière qui
       entre ici la nuit. */
    for (const t of [-0.55, 0.45]) {
      const lx = BAM.x + sx * t * R, lz = BAM.z + sz * t * R;
      ajoute(M.pierreF, BOITE, pose(lx + sz * 13, 3, lz - sx * 13, 7, 6, 7, 0));
      ajoute(M.pierreF, BOITE, pose(lx + sz * 13, 10, lz - sx * 13, 3.4, 9, 3.4, 0));
      const m = new THREE.MeshBasicMaterial({ color: 0xFFB454, fog: true });
      LANTERNES.push(m);
      ajoute(m, BOITE, pose(lx + sz * 13, 16, lz - sx * 13, 6, 5, 6, 0));
      ajoute(M.ardoise, BOITE, pose(lx + sz * 13, 19.6, lz - sx * 13, 9, 2.4, 9, 0));
      scene.add(lueur(26, lx + sz * 13, 17, lz - sx * 13));
      solide(lx + sz * 13, lz - sx * 13, 6);
    }
    if (tiges < 300) console.warn("bambouseraie : " + tiges + " tiges");
  }

  /* Tout ce que la campagne a posé devient un obstacle de marche. On verse
     en une fois : pendant la construction, la même liste sert à s'empêcher de
     bâtir deux fois au même endroit. Une seule liste pour les deux usages,
     donc aucun risque qu'elles divergent. */
  for (const o of dejaPose) OBSTACLES_CAMPAGNE.push(o);

  fondre();
  /* Les mêmes planchers que pour la rue : si l'un de ces comptes tombe, la
     campagne s'est vidée sans que rien ne le dise à l'écran. */
  if (maisonnettes < 20) console.warn("campagne : " + maisonnettes + " maisonnettes");
  if (plantes < 60) console.warn("campagne : " + plantes + " arbres");
}


/* ═══════════════════════════════════════ LA CEINTURE ════════════════
   JustAkhiraa : « tu peux mettre une délimitation de diamètre de 1,5 et à
   chaque fois tu mets un truc relou, genre de l'eau, une muraille, etc.,
   cherche avec ton imagination. »

   C'est la bonne réponse à « pas de mur invisible », et meilleure que la
   mienne : une montagne tout autour, c'est une limite honnête mais c'est la
   MÊME limite sur trois cent soixante degrés. On en fait le tour une fois et
   on a tout vu. Huit obstacles différents, eux, donnent huit endroits
   reconnaissables — et du coup une carte mentale : « le village est entre le
   fleuve et les remparts ».

   La règle de construction, et elle n'a qu'une ligne : **la face intérieure
   de chaque obstacle est posée exactement sur le rayon où la marche
   s'arrête.** C'est ce qui garantit qu'on ne bute jamais sur rien — au
   moment où l'on est arrêté, on a le nez dessus.

   Les huit, dans le sens des aiguilles :
     le fleuve · la muraille · la falaise · la forêt noire · le marais ·
     les remparts en ruine · le ravin · la palissade et son fossé. */

{
  const rnd = semeur(31415926);
  const N = 8;                                   // huit secteurs
  const PAS = Math.PI * 2 / N;
  const eauBord = new THREE.MeshBasicMaterial({ color: 0x2E6A86, transparent: true,
                                                opacity: 0.92, fog: true });
  const roche   = lambert(0x7D7466);
  const rocheC  = lambert(0x9A9183);
  const vase    = lambert(0x5C6B4A);

  for (let k = 0; k < N; k++) {
    const quoi = BORDURE_SECTEURS[k];
    const a0 = k * PAS, a1 = (k + 1) * PAS;
    /* Chaque secteur est découpé en tronçons courts : c'est ce qui permet à
       un mur droit de suivre un cercle sans laisser de fente, et à une
       falaise d'avoir des facettes plutôt qu'un tube lisse. */
    const TRONCONS = 26;
    for (let i = 0; i < TRONCONS; i++) {
      const am = a0 + (i + 0.5) * (a1 - a0) / TRONCONS;
      const larg = R_BORD * (a1 - a0) / TRONCONS * 1.08;   // un peu de recouvrement
      const ca = Math.cos(am), sa = Math.sin(am);
      /* « rot » tourne l'objet pour que sa longueur suive la courbe. */
      const rot = -am;
      const posR = (r, y, l, h, p, mat, dy) =>
        ajoute(mat, BOITE, pose(ca * r, y + (dy || 0), sa * r, l, h, p, rot));

      if (quoi === "muraille") {
        /* Une muraille de pierre, chemin de ronde et merlons. Haute, pleine,
           sans porte : on la longe, on ne la passe pas. */
        posR(R_BORD + 9, 29, larg, 58, 18, rocheC);
        posR(R_BORD + 9, 60, larg, 4, 24, roche);
        if (i % 3 === 0) posR(R_BORD + 9, 65, larg * 0.34, 7, 24, rocheC);
        /* Une tour toutes les six portions : c'est le rythme qui fait lire
           un rempart plutôt qu'un mur d'usine. */
        if (i % 6 === 2) {
          ajoute(rocheC, new THREE.CylinderGeometry(17, 19, 1, 10),
                 pose(ca * (R_BORD + 4), 39, sa * (R_BORD + 4), 1, 78, 1, 0));
          ajoute(M.ardoise, new THREE.CylinderGeometry(1, 22, 1, 10),
                 pose(ca * (R_BORD + 4), 92, sa * (R_BORD + 4), 1, 26, 1, 0));
        }

      } else if (quoi === "fleuve") {
        /* Un fleuve large : on voit l'autre rive, on n'y va pas. La berge
           est en galets, et deux ou trois rochers cassent la ligne d'eau. */
        posR(R_BORD - 3, 0.3, larg, 0.6, 22, M.pierreC);
        ajoute(eauBord, PLAN,
               pose(ca * (R_BORD + 150), 0.9, sa * (R_BORD + 150), larg * 1.2, 1, 300, rot));
        if (i % 4 === 1)
          ajoute(roche, new THREE.IcosahedronGeometry(9 + rnd() * 7, 0),
                 pose(ca * (R_BORD + 26 + rnd() * 60), 3,
                      sa * (R_BORD + 26 + rnd() * 60), 1, 1, 1, 0));

      } else if (quoi === "falaise") {
        /* Une paroi de roche en gradins irréguliers. Trois blocs décalés
           suffisent : c'est l'irrégularité qui fait la falaise, pas la
           hauteur. */
        posR(R_BORD + 16, 46, larg, 92, 34, roche);
        posR(R_BORD + 30, 76, larg * 0.9, 60, 30, rocheC, 0);
        if (i % 3 === 1) posR(R_BORD + 6, 11, larg * 0.5, 22, 14, roche);

      } else if (quoi === "foret") {
        /* Une forêt si dense qu'on n'y entre pas. Ce ne sont pas des arbres
           posés côte à côte : c'est un rideau de troncs serrés, puis des
           masses de feuillage par-dessus — on ne voit pas à travers, et
           c'est ce qui en fait une limite. */
        for (let j = 0; j < 5; j++) {
          const r = R_BORD + 4 + j * 15 + rnd() * 9;
          const d = (rnd() - 0.5) * larg;
          const xx = Math.cos(am) * r - Math.sin(am) * d;
          const zz = Math.sin(am) * r + Math.cos(am) * d;
          ajoute(M.bois, new THREE.CylinderGeometry(2.6, 3.6, 1, 6),
                 pose(xx, 19, zz, 1, 38, 1, 0));
          ajoute(j % 2 ? M.sapin : M.feuille,
                 new THREE.IcosahedronGeometry(15 + rnd() * 8, 0),
                 pose(xx, 44 + rnd() * 14, zz, 1, 1.2, 1, 0));
        }

      } else if (quoi === "marais") {
        /* Un marais : de l'eau basse, des touffes de vase, des joncs. On
           voit qu'on s'y enliserait — c'est un « truc relou » qui ne
           ressemble à aucun autre. */
        ajoute(eauBord, PLAN,
               pose(ca * (R_BORD + 90), 0.7, sa * (R_BORD + 90), larg * 1.2, 1, 190, rot));
        for (let j = 0; j < 7; j++) {
          const r = R_BORD + 6 + rnd() * 150;
          const d = (rnd() - 0.5) * larg;
          const xx = Math.cos(am) * r - Math.sin(am) * d;
          const zz = Math.sin(am) * r + Math.cos(am) * d;
          ajoute(vase, new THREE.CylinderGeometry(5 + rnd() * 5, 7 + rnd() * 5, 1, 7),
                 pose(xx, 1.4, zz, 1, 3, 1, 0));
          for (let q = 0; q < 4; q++)
            ajoute(M.sapin, BOITE,
                   pose(xx + (rnd() - 0.5) * 9, 6, zz + (rnd() - 0.5) * 9,
                        0.8, 12 + rnd() * 8, 0.8, rnd() * 3));
        }

      } else if (quoi === "ruines") {
        /* Des remparts écroulés : des pans debout, des brèches, des éboulis.
           Les brèches ne laissent pas passer — l'éboulis les comble — et
           c'est précisément ce qui donne envie d'essayer. */
        if (i % 4 !== 3) posR(R_BORD + 8, 21 - (i % 3) * 4, larg, 42, 16, rocheC);
        for (let j = 0; j < 3; j++)
          ajoute(roche, new THREE.IcosahedronGeometry(6 + rnd() * 9, 0),
                 pose(ca * (R_BORD - 6 + rnd() * 40) - sa * (rnd() - 0.5) * larg,
                      3 + rnd() * 5,
                      sa * (R_BORD - 6 + rnd() * 40) + ca * (rnd() - 0.5) * larg,
                      1, 0.8, 1, 0));

      } else if (quoi === "ravin") {
        /* Un ravin : le sol s'ouvre. On le signale par deux lèvres de roche
           et du noir entre les deux — un trou se lit à son bord, jamais à
           son fond. */
        posR(R_BORD + 2, 3, larg, 6, 10, roche);
        ajoute(M.sombre, PLAN,
               pose(ca * (R_BORD + 46), 0.4, sa * (R_BORD + 46), larg * 1.2, 1, 86, rot));
        posR(R_BORD + 92, 9, larg, 18, 16, rocheC);

      } else {
        /* La palissade et son fossé : des pieux serrés, une traverse, et
           devant, une tranchée. Le fossé AVANT la palissade, c'est ce qui
           fait qu'on ne peut même pas la toucher. */
        ajoute(M.sombre, PLAN,
               pose(ca * (R_BORD + 13), 0.4, sa * (R_BORD + 13), larg * 1.2, 1, 22, rot));
        const n = Math.max(3, Math.round(larg / 5));
        for (let j = 0; j < n; j++) {
          const d = (j / (n - 1) - 0.5) * larg;
          const xx = ca * (R_BORD + 28) - sa * d;
          const zz = sa * (R_BORD + 28) + ca * d;
          ajoute(M.bois, new THREE.CylinderGeometry(1.6, 2, 1, 6),
                 pose(xx, 15, zz, 1, 30, 1, 0));
          ajoute(M.bois, new THREE.ConeGeometry(2, 4, 6),
                 pose(xx, 32, zz, 1, 1, 1, 0));
        }
        posR(R_BORD + 28, 22, larg, 2.4, 3.4, M.boisClair);
      }
    }
  }
  fondre();
}

/* ── Les échoppes se bâtissent ──────────────────────────────────────────
   Chacune est une petite maison, mais trois détails suffisent à la faire lire
   comme un COMMERCE plutôt que comme une habitation : un store rayé qui
   avance sur la rue, une vitrine large et éclairée jusqu'au sol, et une
   enseigne en potence perpendiculaire à la façade — celle qu'on lit en
   remontant la rue, pas celle qu'on lit de face. Les maisons voisines n'ont
   aucun des trois. */
const groupesBout = [];
{
  const rnd = semeur(7331);
  BOUTIQUES.forEach((b, i) => {
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.rot;
    g.userData.boutique = i;

    const mur = [M.platre, M.pierreC, M.brique][i % 3];
    const h = 44 + rnd() * 10;
    g.add(bloc(mur, BOUT_L, h, BOUT_P, 0, h / 2, 0));
    g.add(pignon(M.tuile, BOUT_L + 4, 13, BOUT_P + 4, 0, h, 0));
    g.add(bloc(M.pierreC, BOUT_L + 2, 2.4, BOUT_P + 2, 0, h + 1, 0));

    /* La devanture, à z + P/2 : tout ce qui suit est sur la façade qui donne
       sur l'allée. Les plans sont séparés d'au moins une unité — la leçon de
       la herse du château, où deux surfaces coplanaires clignotaient. */
    const f = BOUT_P / 2;
    g.add(bloc(M.bois, BOUT_L, 3.2, 1.2, 0, 25.6, f + 0.6));      // le linteau
    const vitre = fenetre(BOUT_L - 7, 15, 0, 17, f + 1.4);
    g.add(vitre);
    for (const sx of [-1, 1])                                      // les montants
      g.add(bloc(M.bois, 1.4, 16, 1.6, sx * (BOUT_L / 2 - 2.2), 17, f + 1.5));
    g.add(bloc(M.bois, BOUT_L - 6, 1.2, 2.2, 0, 8.8, f + 1.6));    // l'appui

    /* La porte : un panneau sombre, un seuil de pierre, une poignée. C'est
       elle qu'on vise, et elle doit se distinguer de la vitrine. */
    g.add(bloc(M.sombre, 9, 19, 1.2, BOUT_L / 2 - 8, 9.5, f + 1.1));
    g.add(bloc(M.bois, 10.6, 1.4, 2.4, BOUT_L / 2 - 8, 19.6, f + 1.4));
    g.add(bloc(M.pierreC, 12, 1.2, 5, BOUT_L / 2 - 8, 0.6, f + 3));
    const poignee = cyl(M.or, 0.5, 0.5, 1.4, 8, BOUT_L / 2 - 12, 9.6, f + 2.1);
    poignee.rotation.x = Math.PI / 2;
    g.add(poignee);

    /* Le store rayé. Deux plans inclinés d'une teinte et de l'autre : à cette
       distance, c'est la RAYURE qu'on reconnaît, pas le tissu. */
    const teinte = lambert(b.couleur);
    const blanc = lambert(0xF4EFE6);
    for (let k = 0; k < 8; k++) {
      const p = bloc(k % 2 ? teinte : blanc, BOUT_L / 8, 0.8, 11,
                     -BOUT_L / 2 + BOUT_L / 8 * (k + 0.5), 28.4, f + 5);
      p.rotation.x = 0.36;
      g.add(p);
    }
    g.add(bloc(M.bois, BOUT_L + 1, 1.4, 1.4, 0, 30.4, f + 0.9));
    for (const sx of [-1, 1]) {                                    // les bras
      const bras = bloc(M.bois, 0.9, 11, 0.9, sx * (BOUT_L / 2 - 1), 28, f + 5);
      bras.rotation.x = 0.36;
      g.add(bras);
    }

    /* L'enseigne en potence : une plaque perpendiculaire, portée par une
       ferrure. Elle se balance — le village a déjà ce mouvement pour les
       enseignes de fer, on le réutilise. */
    const potence = new THREE.Group();
    potence.position.set(-BOUT_L / 2 + 3, 36, f + 1.5);
    potence.add(bloc(M.metal, 12, 0.7, 0.7, 6, 0, 0));
    const plaque = new THREE.Group();
    plaque.position.set(11, -5.5, 0);
    plaque.add(bloc(M.bois, 0.8, 9, 13, 0, 0, 0));
    plaque.add(bloc(teinte, 1.4, 7, 11, 0.2, 0, 0));
    potence.add(plaque);
    /* BALANCE contient des DESCRIPTEURS, pas des objets : { o, v, a }. Y
       pousser la plaque nue a fait planter la boucle de rendu entière au
       premier tour — donc le village entier, pour une enseigne. Une liste
       partagée a une forme, et rien ne la rappelle à celui qui l'alimente. */
    BALANCE.push({ o: plaque, v: 1.1 + rnd() * 0.3, a: 0.07 });
    g.add(potence);

    /* La lanterne au-dessus de la porte : c'est elle qui dit, la nuit, qu'une
       boutique est ouverte. */
    const m = new THREE.MeshBasicMaterial({ color: 0xFFB454, fog: true });
    LANTERNES.push(m);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 2.6), m)
          .translateX(BOUT_L / 2 - 8).translateY(23.5).translateZ(f + 2.4));
    g.add(lueur(20, BOUT_L / 2 - 8, 23.5, f + 2.4));

    scene.add(g);
    groupesBout.push(g);
    /* On ne traverse pas une échoppe : elle entre dans les obstacles comme
       les cinq bâtiments. */
    OBSTACLES_BOUT.push({ x: b.x, z: b.z, r: Math.max(BOUT_L, BOUT_P) / 2 + 6 });
  });
}

/* ── Les cônes de lumière ───────────────────────────────────────────────
   Un vrai projecteur par réverbère — quatorze SpotLight — coûterait plus
   cher que tout le reste de la scène réunie. On peint donc la lumière au
   lieu de la calculer : un cône translucide en mélange additif sous chaque
   lanterne. À cette échelle, l'œil ne fait pas la différence, et c'est la
   technique de tous les décors stylisés. */
{
  const geo = new THREE.CylinderGeometry(2.2, 15, 33, 14, 1, true);
  for (const l of LAMPES) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xFFC479, transparent: true, opacity: 0.055,
      side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false });
    CONES.push(mat);
    const c = new THREE.Mesh(geo, mat);
    c.position.set(l.x, 17, l.z);
    scene.add(c);
    /* La flaque au sol : sans elle, le cône s'arrête en l'air et la lumière
       n'éclaire rien. */
    const f = new THREE.Mesh(PLAN, new THREE.MeshBasicMaterial({
      map: TEX.lueur, transparent: true, opacity: 0.32, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: true }));
    f.rotation.x = -Math.PI / 2;
    f.scale.set(52, 52, 1);
    f.position.set(l.x, 0.6, l.z);
    FLAQUES.push(f.material);
    scene.add(f);
  }
}

/* ── Ce qui bouge ──────────────────────────────────────────────────────
   Un village vit à ses petites choses : des gens qui vont quelque part, des
   lucioles au ras des haies, des pétales de cerisier, des oiseaux qui
   tournent. Aucune n'est importante ; ensemble, elles font la différence
   entre une maquette et un lieu. */
const VIVANTS = [];

/* Les passants. JustAkhiraa : « les passants, mets pas que des Japonais, mets
   aussi des ninjas, des cowboys, des men in black, des moutons et des
   chats. » Le village n'a donc aucune cohérence historique, et c'est
   voulu : on y croise une pagode, un château fort, une maison Tudor et un
   observatoire, alors une rue peuplée d'une seule sorte de gens aurait été
   la seule chose invraisemblable.

   Chaque silhouette est faite des mêmes primitives — un tronc, une tête,
   une coiffe —, et c'est la COIFFE qui les distingue à cent pas : le
   chapeau conique, le bandeau du ninja, le bord large du cowboy, rien du
   tout pour l'homme en noir. À cette distance, on ne lit pas un visage ; on
   lit une découpe sur le ciel. */
/* ── Le chat ─────────────────────────────────────────────────────────────
   JustAkhiraa : « t'as oublié de mettre des chats ». Il y en avait deux. Hauts de
   quatre unités, sur le bas-côté, à quarante unités de l'allée : codés, et
   introuvables — ce qui donne exactement le même résultat que pas de chats du
   tout. Le commentaire du peuplement promettait même que « les chats longent
   la bordure » pendant que le code les envoyait sur l'herbe avec les moutons.
   Un commentaire qui décrit une intention que le code ne tient pas est un
   mensonge qui se relit comme une preuve.

   Trois corrections, dans l'ordre d'importance : il y en a QUATRE de plus,
   ASSIS aux endroits où un chat irait de lui-même — dont deux sur la margelle
   de la fontaine, à quelques pas du point de départ ; ils ont une TÊTE, parce
   qu'à dix pas on reconnaît un chat à ses oreilles avant sa démarche ; et
   ceux qui marchent longent vraiment la bordure.

   Le corps est écrit une fois pour les deux poses. Un chat debout est un tube
   presque horizontal, un chat assis un tube presque vertical : écrire deux
   chats aurait garanti qu'ils finissent par ne plus se ressembler. */
const ROBES_CHAT = [
  { poil: 0x736A62, trait: 0x4A433C, ventre: 0xB8AFA4 },   // gris tigré
  { poil: 0x2A2622, trait: 0x15120F, ventre: 0x322D28 },  // noir
  { poil: 0xC17E45, trait: 0x96582A, ventre: 0xE4C79E },   // roux
  { poil: 0xE4DED4, trait: 0x36302A, ventre: 0xF3EFE7 },   // blanc et noir
];

function batirChat(rnd, assis, poser) {
  const R = ROBES_CHAT[Math.floor(rnd() * ROBES_CHAT.length)];
  /* Le chat est le seul animal du village en ombrage LISSE. Partout ailleurs
     les facettes font le charme ; sur un corps de quatre unités, elles font
     un caillou. */
  const poil = lambert(R.poil, { flatShading: false });
  const trait = lambert(R.trait, { flatShading: false });
  const ventre = lambert(R.ventre, { flatShading: false });
  const g = new THREE.Group();

  const corps = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 9), poil);
  if (assis) { corps.scale.set(0.98, 1.42, 0.95); corps.position.set(0, 2.2, 0); }
  else       { corps.scale.set(0.95, 0.9, 1.75);  corps.position.set(0, 2.3, 0); }
  g.add(corps);

  /* Le poitrail clair. Un chat vu de face est une tache pâle sur un corps
     sombre — sans elle, c'est une pierre posée sur quatre bâtons. */
  const poitrail = new THREE.Mesh(new THREE.SphereGeometry(0.86, 10, 7), ventre);
  poitrail.scale.set(0.78, assis ? 1.2 : 0.8, 0.7);
  poitrail.position.set(0, assis ? 2.1 : 2.2, assis ? 0.86 : 1.5);
  g.add(poitrail);

  const tete = new THREE.Group();
  tete.position.set(0, assis ? 3.9 : 3.05, assis ? 0.6 : 2.15);
  const crane = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 9), poil);
  crane.scale.set(1, 0.92, 0.95);
  tete.add(crane);
  const museau = new THREE.Mesh(new THREE.SphereGeometry(0.47, 9, 7), ventre);
  museau.scale.set(1, 0.72, 0.9);
  museau.position.set(0, -0.3, 0.72);
  tete.add(museau);
  tete.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), trait)
        .translateY(-0.2).translateZ(1.04));
  /* Les oreilles : deux triangles, et c'est tout le chat. */
  for (const sx of [-1, 1]) {
    const o = cyl(poil, 0.03, 0.46, 1.0, 4, sx * 0.53, 0.84, -0.06);
    o.rotation.z = sx * 0.3;
    o.rotation.x = -0.14;
    tete.add(o);
  }
  for (const sx of [-1, 1]) {
    const oeil = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6),
                                lambert(0xD6E568, { flatShading: false }));
    oeil.position.set(sx * 0.39, 0.08, 0.8);
    tete.add(oeil);
    const pupille = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5),
                                   lambert(0x0E0D0C, { flatShading: false }));
    pupille.position.set(sx * 0.39, 0.08, 0.94);
    tete.add(pupille);
  }
  g.add(tete);

  /* Les pattes. Assis, les antérieures sont tendues au sol et les
     postérieures repliées en boule : c'est la POSE qui fait le chat assis. */
  if (assis) {
    for (const sx of [-1, 1]) g.add(cyl(poil, 0.27, 0.3, 2.1, 6, sx * 0.5, 1.05, 0.95));
    for (const sx of [-1, 1]) {
      const cuisse = new THREE.Mesh(new THREE.SphereGeometry(0.64, 9, 7), poil);
      cuisse.scale.set(0.68, 0.92, 1.1);
      cuisse.position.set(sx * 0.84, 1.05, -0.38);
      g.add(cuisse);
    }
  } else {
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(cyl(poil, 0.26, 0.3, 2.1, 6, sx * 0.62, 1.05, sz * 1.15));
  }

  /* La queue est un objet à part : c'est elle qui bouge, et un chat dont la
     queue ne bouge pas est une statuette. */
  const queue = new THREE.Group();
  queue.position.set(0, assis ? 1.6 : 2.4, assis ? -0.9 : -2.0);
  queue.add(cyl(poil, 0.16, 0.28, 3.5, 6, 0, 1.75, 0));
  queue.add(new THREE.Mesh(new THREE.SphereGeometry(0.21, 7, 6), trait)
        .translateY(3.5));
  queue.rotation.x = assis ? -0.3 : -2.05;
  g.add(queue);
  if (poser) g.add(contact(assis ? 3.6 : 5.4, assis ? 3.6 : 4.4, 0, 0));
  return { g, tete, queue, corps, queueX: queue.rotation.x,
           echelleY: corps.scale.y };
}

/* ── Tout le monde à hauteur d'homme ─────────────────────────────────────
   « mettre les png à ma hauteur. »

   Les silhouettes mesurent 12 à 13 unités quand l'œil du visiteur est à 17.
   On les regardait donc toutes d'en haut, et c'est ce qui donnait au village
   son air de maquette : ce n'est pas la taille des maisons qui fait l'échelle,
   c'est celle des gens, parce que c'est à eux qu'on se compare.

   Chaque constructeur annonce déjà sa taille ; il suffisait de s'en servir au
   lieu de la jeter. Les bêtes gardent la leur — un mouton à hauteur d'homme
   n'est plus un mouton, et « bas » est exactement ce qui les distingue. */
function planter(role, g, rnd) {
  const info = PASSANTS[role](g, rnd) || {};
  if (!info.bas && info.h) g.scale.setScalar(TAILLE_HOMME / info.h);
  return info;
}

const PASSANTS = {
  japonais(g, rnd) {
    g.add(cyl(lambert(0x3E5A78), 2.1, 3.6, 9.4, 8, 0, 4.7, 0));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 7),
                         lambert(0xE4B58C)).translateY(10.6));
    g.add(cyl(lambert(0x2E2A26), 0.35, 2.3, 1.3, 9, 0, 11.4, 0));
    return { h: 12 };
  },
  ninja(g) {
    const noir = lambert(0x1E2128);
    g.add(cyl(noir, 1.9, 3.1, 9.2, 8, 0, 4.6, 0));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1.45, 10, 7), noir)
          .translateY(10.4));
    /* Deux traits suffisent : la fente des yeux, et le sabre en travers du
       dos. C'est le sabre qu'on reconnaît de loin. */
    g.add(bloc(lambert(0xD8DCE4), 2.4, 0.45, 0.4, 0, 10.7, 1.4));
    g.add(bloc(lambert(0x8C1F1F), 1.0, 0.8, 0.5, 0, 9.2, -1.5));
    const sabre = bloc(lambert(0xB9C2CE), 0.35, 9.5, 0.35, -0.4, 7.4, -1.9);
    sabre.rotation.z = 0.55;
    g.add(sabre);
    return { h: 12 };
  },
  cowboy(g) {
    g.add(cyl(lambert(0x6B4630), 2.0, 3.3, 9.0, 8, 0, 4.5, 0));
    g.add(bloc(lambert(0xA8442F), 3.4, 3.0, 2.2, 0, 7.4, 0));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1.45, 10, 7),
                         lambert(0xD8A878)).translateY(10.3));
    /* Le bord large, c'est tout le cowboy. */
    g.add(cyl(lambert(0x7A5A32), 4.3, 4.3, 0.42, 14, 0, 11.3, 0));
    g.add(cyl(lambert(0x7A5A32), 1.9, 2.1, 2.1, 12, 0, 12.4, 0));
    return { h: 13 };
  },
  mib(g) {
    const noir = lambert(0x14161C);
    g.add(cyl(noir, 2.2, 2.9, 9.4, 8, 0, 4.7, 0));
    g.add(bloc(lambert(0xF2F4F8), 1.1, 4.4, 0.4, 0, 6.6, 1.5));
    g.add(bloc(lambert(0x2A2E38), 0.55, 3.4, 0.35, 0, 6.2, 1.75));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 7),
                         lambert(0xC98F63)).translateY(10.6));
    /* Les lunettes : une barre sombre en travers du visage. */
    g.add(bloc(lambert(0x0A0C10), 2.7, 0.8, 0.4, 0, 10.8, 1.35));
    return { h: 12 };
  },
  /* JustAkhiraa : « les moutons ils sont moches ». Ils l'étaient, et pour une
     raison précise : quatre gros icosaèdres ne font pas une toison, ils font
     un tas de cailloux — et la tête était une boule noire sans visage, posée
     au bout. Or ce qu'on reconnaît d'un mouton, c'est la bosse IRRÉGULIÈRE du
     dos, et une tête sombre tendue vers l'herbe avec deux oreilles qui
     dépassent. La toison est donc un amas de dix boules inégales, chacune
     tournée au hasard — sans cette rotation les facettes s'alignent et la
     laine redevient une grille. */
  mouton(g, rnd) {
    const TEINTES = [0xF4EFE3, 0xE7E0D0, 0xD9D0BC];
    const laine = lambert(TEINTES[Math.floor(rnd() * TEINTES.length)]);
    const AMAS = [[0, 5.6, -0.4, 3.0], [0.2, 6.9, 0.6, 2.2],
                  [-2.2, 5.6, 0.2, 2.35], [2.3, 5.5, 0, 2.3],
                  [-0.4, 5.3, 2.5, 2.5], [0.5, 6.4, -2.4, 2.25],
                  [-1.7, 6.7, -1.6, 1.8], [1.8, 6.7, 1.5, 1.85],
                  [0, 4.4, 1.2, 2.2], [-0.2, 4.5, -1.7, 2.1]];
    for (const [x, y, z, r] of AMAS) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), laine);
      b.position.set(x, y, z);
      b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      g.add(b);
    }
    const peau = lambert(0x3B342C);
    /* Le cou et la tête dans un groupe : c'est lui qui broute. */
    const tete = new THREE.Group();
    tete.position.set(0, 6.1, 3.0);
    const cou = cyl(peau, 1.1, 1.3, 2.6, 7, 0, -0.7, 0.5);
    cou.rotation.x = 0.95;
    tete.add(cou);
    const crane = new THREE.Mesh(new THREE.SphereGeometry(1.24, 9, 7), peau);
    crane.scale.set(0.9, 0.94, 1.22);
    crane.position.set(0, -1.6, 1.95);
    tete.add(crane);
    /* Le museau clair : deux pour cent du volume, et c'est lui qui donne un
       visage à une boule sombre. */
    const museau = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 6),
                                  lambert(0xC9BCA8));
    museau.scale.set(0.9, 0.78, 1.1);
    museau.position.set(0, -2.0, 3.05);
    tete.add(museau);
    for (const sx of [-1, 1]) {
      const oreille = new THREE.Mesh(new THREE.SphereGeometry(0.62, 7, 5), peau);
      oreille.scale.set(1.55, 0.42, 0.82);
      oreille.position.set(sx * 1.4, -1.15, 1.45);
      oreille.rotation.z = sx * 0.55;
      tete.add(oreille);
      const oeil = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5),
                                  lambert(0x14100C));
      oeil.position.set(sx * 0.84, -1.5, 2.72);
      tete.add(oeil);
    }
    g.add(tete);
    /* Les pattes, et leur sabot. Sans le sabot, la patte s'arrête dans le sol
       au lieu de s'y poser. */
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 1.75, z = sz * 1.9;
      g.add(cyl(peau, 0.5, 0.42, 3.9, 6, x, 2.0, z));
      g.add(cyl(lambert(0x221E19), 0.52, 0.56, 0.5, 6, x, 0.25, z));
    }
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.85, 7, 5), laine)
          .translateY(5.7).translateZ(-3.3));
    g.add(contact(10, 8, 0, 0));
    return { h: 9, bas: true, bete: "mouton", tete };
  },
  chat(g, rnd) {
    const c = batirChat(rnd, false, true);
    g.add(c.g);
    return { h: 5.6, bas: true, bete: "chat", queue: c.queue,
             queueX: c.queueX, tete: c.tete };
  },
};

/* Les emprises que rien de vivant ne traverse. Elles sont calculées ici, et
   non reprises d'OBSTACLES : cette liste-là est bâtie plus bas, pour le
   marcheur, et un passant placé avant elle lirait un tableau vide — c'est-à-
   dire un village sans murs, ce qui est précisément le défaut qu'on corrige. */
const MURS = matieres.map((m) => ({ x: m.L.x, z: m.L.z, r: m.b.demiLargeur + 12 }));
MURS.push({ x: 0, z: V.zFontaine, r: V.rFontaine + 8 });
for (const o of OBSTACLES_BOUT) MURS.push(o);

{
  const rnd = semeur(1789);
  /* Le peuplement : beaucoup de gens, quelques bêtes. L'ordre compte — les
     deux premiers sont ceux qu'on croise en arrivant. */
  const ROLES = ["japonais", "cowboy", "chat", "ninja", "japonais", "mib",
                 "mouton", "japonais", "chat", "cowboy", "mouton", "ninja",
                 "japonais", "chat", "mib", "mouton", "chat", "cowboy"];
  ROLES.forEach((role, k) => {
    const g = new THREE.Group();
    const info = planter(role, g, rnd);
    /* Un passant sur quatre porte un fanal — jamais une bête. La nuit, ce
       sont ces lumières qui bougent qui rendent l'allée habitée. */
    if (!info.bas && k % 4 === 0) {
      const m = new THREE.MeshBasicMaterial({ color: 0xFFB454, fog: true });
      LANTERNES.push(m);
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 1.5), m);
      f.position.set(2.4, 5.6, 0);
      g.add(f);
      g.add(lueur(13, 2.4, 5.6, 0));
    }
    scene.add(g);
    /* Les bêtes ne marchent pas au milieu de l'allée : les moutons sont sur
       l'herbe, les chats longent la bordure. Chacun sa voie, sa vitesse et
       son départ — partis ensemble, ils feraient une procession. */
    /* Et cette fois le code fait ce que le commentaire annonce : le mouton
       s'écarte sur l'herbe, le chat longe la bordure — à trois pas du pavé,
       là où on le voit. */
    const cote = rnd() < 0.5 ? -1 : 1;
    const voie = info.bete === "mouton"
      ? cote * (V.demiAllee + 16 + rnd() * 36)
      : info.bete === "chat"
        ? cote * (V.demiAllee + 2 + rnd() * 7)
        : (V.demiAllee - 12) * (rnd() * 2 - 1);
    /* ── Un passant ne traverse pas un mur ────────────────────────────────
       JustAkhiraa : « les personnages, ils marchent à travers les murs ». C'était
       vrai, et c'était visible surtout des moutons : leur voie les envoie sur
       l'herbe, à quatre-vingts unités de l'axe — c'est-à-dire en plein dans
       l'emprise des bâtiments, qui sont à cent dix-huit et larges de cent.

       On ne leur donne pas une détection de collision : dix silhouettes qui
       piétinent contre une façade sont plus laides qu'une qui la traverse. On
       RACCOURCIT leur trajet. Chaque va-et-vient est une ligne droite à x
       fixe ; il suffit donc de le tailler avant le premier bâtiment qu'il
       rencontrerait. Un passant qui va moins loin ne se remarque pas ; un
       passant qui sort d'un mur, si. */
    const libre = (x, z, p) => {
      for (const m of MURS) {
        const dx = x - m.x;
        if (Math.abs(dx) >= m.r) continue;              // la voie passe à côté
        const demi = Math.sqrt(m.r * m.r - dx * dx);    // la corde traversée
        if (z > m.z + demi) p = Math.min(p, z - m.z - demi);
        else if (z < m.z - demi) p = Math.min(p, m.z - demi - z);
        else return 0;                                  // le départ est dedans
      }
      return p;
    };
    const voulue = (info.bas ? 26 : 60) + rnd() * (info.bas ? 60 : 150);
    /* On BALAIE la voie plutôt que de tenter sa chance. Une première version
       tirait huit points au hasard et, si aucun n'était libre, gardait le
       dernier — donc parfois un passant planté à l'intérieur du château, ce
       que la mesure a immédiatement trouvé : un sur dix-huit, à 79 unités dans
       la pierre. Un repli qui laisse le défaut en place n'est pas un repli.

       Vingt-quatre positions le long de l'allée, on garde celle qui offre le
       plus de champ. C'est déterministe, c'est exhaustif à trois unités près,
       et ça ne peut pas rendre un emplacement occupé. */
    let z0 = 0, portee = 0;
    for (let k = 0; k < 24; k++) {
      const z = -170 + k * (340 / 23) + (rnd() - 0.5) * 6;
      if (Math.abs(z - V.zFontaine) < 30) continue;
      const p = Math.min(voulue, libre(voie, z, voulue));
      if (p > portee) { portee = p; z0 = z; }
    }
    /* Si toute la voie est bouchée — une voie qui longerait une façade sur
       toute sa longueur —, on ramène le passant dans l'allée, qui est libre
       par construction. */
    if (portee < 10) {
      z0 = V.zFontaine + 84;
      portee = Math.max(10, libre(voie, z0, voulue));
    }
    VIVANTS.push({ o: g, role, x: voie, z0,
                   portee,
                   v: (info.bas ? 2.4 : 7) + rnd() * (info.bas ? 3 : 6),
                   saut: info.bas ? 0.25 : 0.8,
                   queue: info.queue || null, queueX: info.queueX || 0,
                   tete: info.tete || null,
                   broute: info.bete === "mouton",
                   phase: rnd() * Math.PI * 2 });
  });
}

/* ══════════════════════════════════════════════ les scénettes ════════
   JustAkhiraa : « mets des passants aussi en dehors du chemin, et même des
   immobiles, d'autres qui parlent entre eux, d'autres qui dansent avec une
   radio qui sort des notes de musique ».

   C'est la demande la plus juste de toute la série, et voici pourquoi : les
   dix-huit passants du village vont tous d'un point à un autre. Aucun ne
   s'arrête, aucun ne regarde un autre, aucun n'a de raison d'être là. Un
   village où tout le monde marche n'est pas un village, c'est un couloir.

   Ce qui manque n'est pas le nombre, c'est le MOTIF. Trois suffisent :

     · quelqu'un qui attend quelque part — devant sa porte, au bord de la
       fontaine. Il ne fait rien, et c'est précisément ce qui donne envie de
       s'approcher ;
     · deux ou trois qui se font face. Deux silhouettes tournées l'une vers
       l'autre se lisent comme une conversation avant même qu'un mot
       s'affiche — c'est de la posture, pas du texte ;
     · un qui danse près d'une radio. Le seul mouvement du village qui ne
       serve à aller nulle part.

   Les répliques n'apparaissent qu'à PORTÉE DE VOIX — quarante-cinq unités,
   à peu près la largeur de l'allée. Des bulles visibles d'un bout à l'autre
   du village en feraient un panneau publicitaire ; là, il faut s'approcher,
   et c'est ce qui les rend vivantes. */
const SCENETTES = [];
{
  const rnd = semeur(1848);
  /* Les bulles vont dans « monde3D », PAS dans « scene ». Le village a deux
     graphes qui partagent la même caméra : l'un est rendu par WebGL, l'autre
     par CSS3DRenderer, et chacun ignore le contenu de l'autre. Une bulle
     rangée dans la scène WebGL n'apparaît donc jamais, sans la moindre
     erreur — le renderer CSS ne la parcourt simplement pas. C'est exactement
     ce qui vient d'arriver : sept bulles construites, zéro dans le document. */
  const BULLES = new THREE.Group();
  monde3D.add(BULLES);

  /* Un groupe de silhouettes tournées les unes vers les autres. L'angle est
     calculé, pas tiré au sort : chacun regarde le CENTRE du cercle. */
  function attroupement(x, z, roles, rayonCercle) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    roles.forEach((role, k) => {
      const p = new THREE.Group();
      const a = (k / roles.length) * Math.PI * 2 + 0.4;
      p.position.set(Math.cos(a) * rayonCercle, 0, Math.sin(a) * rayonCercle);
      /* Tourné vers le centre : atan2 de l'opposé de sa propre position. */
      p.rotation.y = Math.atan2(-p.position.x, -p.position.z);
      planter(role, p, rnd);
      g.add(p);
    });
    scene.add(g);
    return g;
  }

  /* La bulle : un élément HTML posé dans la scène, comme les enseignes. Du
     texte dessiné en 3D serait flou de près et illisible de loin ; celui-ci
     reste net à toute distance et un lecteur d'écran le lit. */
  function bulle(x, y, z, lignes, couleur) {
    const el = document.createElement("div");
    el.className = "bulle";
    el.style.setProperty("--c", couleur);
    el.textContent = lignes[0];
    const o = new CSS3DSprite(el);
    o.position.set(x, y, z);
    /* L'échelle se déduit d'une largeur VOULUE, elle ne se choisit pas au
       jugé : la bulle fait 240 pixels de large, on la veut à peu près neuf
       unités dans le village — la largeur d'un passant et demi. À 0,16, elle
       en faisait cinquante-six et remplissait l'écran à dix pas. */
    o.scale.setScalar(9 / 240);
    BULLES.add(o);
    return { el, o, lignes, k: 0, prochaine: 3 + rnd() * 3 };
  }

  const DITS = {
    marche: ["Le château, c'est tout au bout.", "Vous cherchez quoi ?",
             "Moi j'ai commencé par les réseaux.", "Bonne journée !"],
    boutique: ["Entrez donc, c'est ouvert.", "J'ai ce qu'il vous faut.",
               "On ferme tard, ce soir."],
    danse: ["♪", "♫", "Ça, c'est de la musique !", "♪♪"],
  };

  /* 1 — Deux qui discutent au bord de la fontaine, là où l'on arrive. */
  {
    const x = -V.rFontaine - 14, z = V.zFontaine + 30;
    attroupement(x, z, ["japonais", "cowboy"], 7);
    SCENETTES.push({ bulle: bulle(x, 17, z, DITS.marche, "#6FC8FF"), x, z });
  }
  /* 2 — Trois devant la pagode, qui refont le monde. */
  {
    const x = V.demiAllee + 22, z = -30;
    attroupement(x, z, ["ninja", "mib", "japonais"], 8);
    SCENETTES.push({ bulle: bulle(x, 17, z, DITS.marche, "#CE96FF"), x, z });
  }
  /* 3 — Les tenanciers, plantés devant leur porte. Immobiles, tournés vers
     l'allée : c'est l'attitude de quelqu'un qui attend le client. */
  BOUTIQUES.forEach((b, i) => {
    if (i % 2) return;                       // un sur deux : pas une haie d'honneur
    const p = new THREE.Group();
    p.position.set(b.x - b.cote * (BOUT_P / 2 + 7), 0, b.z + 6);
    p.rotation.y = b.cote > 0 ? Math.PI / 2 : -Math.PI / 2;
    planter(["japonais", "mib", "cowboy", "ninja"][i % 4], p, rnd);
    scene.add(p);
    SCENETTES.push({
      bulle: bulle(p.position.x, 17, p.position.z, DITS.boutique,
                   "#" + b.couleur.toString(16).padStart(6, "0")),
      x: p.position.x, z: p.position.z,
    });
  });
  /* 4 — Le danseur et sa radio. Il ne va nulle part, et c'est tout l'objet :
     le seul mouvement du village qui ne mène à rien.

     Trois reproches en une phrase — « le png qui danse il est pas visible et
     sa radio elle est sur lui et il danse même pas il saute » — et trois
     causes distinctes :

     · INVISIBLE. Il était à x = −66, z = 96, c'est-à-dire derrière le premier
       rang de maisons, hors de l'allée et hors du chemin qu'on emprunte. Un
       personnage qu'il faut chercher n'existe pas. Il vient maintenant sur la
       place, à portée de vue du point de départ, du côté dégagé de la
       fontaine.

     · LA RADIO SUR LUI. Elle était à neuf unités de son centre et mesure
       treize de large : elle commençait donc à deux unités et demie de lui —
       c'est-à-dire dans ses jambes. Un objet se place par son BORD, pas par
       son centre, quand ce qu'on veut c'est qu'il ne touche pas.

     · IL SAUTAIT. « position.y = |sin| × 2,4 » n'est pas une danse, c'est un
       ressort. Danser, sans squelette à articuler, c'est reporter son poids :
       le corps glisse d'un pied sur l'autre, s'incline du côté où il pose, et
       se tasse un peu quand il arrive — les genoux plient. Le haut suit avec
       un temps de retard, sinon le personnage est raide comme une planche. Il
       ne décolle plus du sol : personne ne danse en sautant. */
  {
    const x = V.demiAllee + 26, z = V.zFontaine + 30;
    const p = new THREE.Group();
    p.position.set(x, 0, z);
    planter("cowboy", p, rnd);
    p.rotation.y = -0.6;
    scene.add(p);

    /* La radio : une boîte, deux haut-parleurs, une poignée, une antenne.
       Posée à 17 unités — plus de la demi-largeur de la radio, plus la
       largeur d'un homme, plus de quoi ne pas la renverser en dansant. */
    const r = new THREE.Group();
    r.position.set(x + 17, 0, z + 2);
    r.add(bloc(lambert(0x2A2E36), 13, 8, 5, 0, 8, 0));
    for (const sx of [-1, 1])
      r.add(cyl(lambert(0x14161C), 2.4, 2.4, 1, 12, sx * 3.4, 8, 2.6).rotateX(Math.PI / 2));
    r.add(cyl(M.metal, 0.4, 0.4, 5, 6, 0, 13.6, 0).rotateZ(0.5));
    r.add(bloc(M.bois, 2, 1, 5, 0, 3.4, 0));
    scene.add(r);

    /* Les notes : des sprites qui montent et se dissipent. Trois suffisent —
       au-delà, ce n'est plus une radio, c'est un feu d'artifice. */
    const notes = [];
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.lueur, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, color: 0xFFE9A0, fog: true }));
      s.scale.setScalar(5);
      s.position.set(x + 17, 13, z + 2);
      scene.add(s);
      notes.push({ s, t: k * 0.9 });
    }
    /* Les valeurs de repos sont retenues sur l'objet : l'animation travaille
       par ÉCART, jamais en valeur absolue. Sans cela, la mise à l'échelle des
       silhouettes serait écrasée à la première image, et le danseur
       redeviendrait petit. */
    p.userData.x0 = p.position.x;
    p.userData.r0 = p.rotation.y;
    p.userData.s0 = p.scale.y;
    SCENETTES.push({ bulle: bulle(x, 19, z, DITS.danse, "#FFB05A"),
                     x, z, danseur: p, notes, radio: r });
  }
}

/* ── Les chats assis ────────────────────────────────────────────────────
   Un chat ne se met pas au loin : il se met là où l'on regarde, et là où un
   chat irait de lui-même — le rebord tiède d'une fontaine, une bordure de
   trottoir, l'herbe au soleil. Deux d'entre eux sont sur la margelle, à une
   cinquantaine d'unités du point de départ : c'est la première chose vivante
   qu'on croise, avant même d'avoir touché une touche.

   La margelle : le dessus de pierre est à 7,1 et l'anneau visible va du rayon
   17,4 au rayon 21. Un chat assis y tient, posé à 19,2. */
const CHATS_ASSIS = [];
{
  const rnd = semeur(66);
  const zf = V.zFontaine, rm = 19.2;
  const POSTES = [
    /* Sur la margelle, tourné vers l'allée : celui qu'on voit en arrivant. */
    { a: 0.62, r: rm, y: 7.1, ry: Math.PI * 0.78, poser: false },
    /* De l'autre côté du bassin, tourné vers la fontaine. */
    { a: 3.55, r: rm, y: 7.1, ry: -Math.PI * 0.2, poser: false },
    /* Sur la bordure du pavé, du côté de l'atelier. */
    { x: -(V.demiAllee + 3), z: 96, y: 0.4, ry: 1.25, poser: true },
    /* Dans l'herbe, du côté de la pagode, au soleil. */
    { x: V.demiAllee + 11, z: -24, y: 0.4, ry: -0.9, poser: true },
  ];
  for (const p of POSTES) {
    const c = batirChat(rnd, true, p.poser);
    const x = p.x !== undefined ? p.x : Math.sin(p.a) * p.r;
    const z = p.z !== undefined ? p.z : zf + Math.cos(p.a) * p.r;
    c.g.position.set(x, p.y, z);
    c.g.rotation.y = p.ry;
    scene.add(c.g);
    CHATS_ASSIS.push({ tete: c.tete, queue: c.queue, corps: c.corps,
                       queueX: c.queueX, echelleY: c.echelleY,
                       phase: rnd() * Math.PI * 2 });
  }
}

/* Les lucioles : elles ne sortent que la nuit, elles restent basses, et
   elles suivent les haies plutôt que l'allée. */
const lucioles = (() => {
  const n = 170, pos = new Float32Array(n * 3), base = new Float32Array(n * 3);
  const rnd = semeur(7);
  for (let i = 0; i < n; i++) {
    const s = rnd() < 0.5 ? -1 : 1;
    const x = s * (V.demiAllee + 6 + rnd() * 54);
    const y = 3 + rnd() * 16;
    const z = -190 + rnd() * 470;
    base.set([x, y, z], i * 3);
    pos.set([x, y, z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xFFE9A0, size: 2.6, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  p.userData.base = base;
  scene.add(p);
  return p;
})();

/* Les pétales de cerisier, du côté de la pagode. Ils tombent, dérivent, et
   repartent d'en haut : une chute sans fin, qui ne coûte qu'un tableau. */
const petales = (() => {
  const n = 150, pos = new Float32Array(n * 3), vit = new Float32Array(n);
  const rnd = semeur(404);
  const m = matieres.find((x) => x.L.forme === "pagode");
  const cx = m ? m.L.x : 118, cz = m ? m.L.z : -78;
  for (let i = 0; i < n; i++) {
    pos.set([cx + (rnd() - 0.5) * 150, rnd() * 112, cz + (rnd() - 0.5) * 150], i * 3);
    vit[i] = 3.5 + rnd() * 5;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xF6BBD0, size: 1.5, transparent: true, opacity: 0.6,
    depthWrite: false, fog: true }));
  p.userData.vit = vit;
  scene.add(p);
  return p;
})();

/* Les oiseaux : un V de trois traits, huit fois, sur des cercles de rayons
   et de hauteurs différents. Ils ne volent que le jour. */
const oiseaux = (() => {
  const g = new THREE.Group();
  const rnd = semeur(55);
  const mat = lambert(0x2C3242);
  const aile = new THREE.BoxGeometry(9, 0.5, 1.6);
  for (let k = 0; k < 22; k++) {
    const o = new THREE.Group();
    const a1 = new THREE.Mesh(aile, mat), a2 = new THREE.Mesh(aile, mat);
    a1.position.x = -4.4; a2.position.x = 4.4;
    o.add(a1); o.add(a2);
    /* Les cercles valaient 180 à 500 unités : c'était la taille de l'ancien
       monde. Dans une plaine de trois mille de large, neuf oiseaux groupés
       au-dessus du clocher laissent tout le reste du ciel vide. */
    o.userData = { a1, a2, r: 240 + rnd() * 1050, y: 150 + rnd() * 190,
                   v: 0.10 + rnd() * 0.12, p: rnd() * 6.283,
                   bat: 5 + rnd() * 4 };
    g.add(o);
  }
  scene.add(g);
  return g;
})();


/* ═══════════════════════════════════════ LA VIE DEHORS ══════════════
   « donne-lui de la vie aussi : des papillons, des oiseaux », « des PNJ »,
   « des vendeurs, des marchands ambulants comme Terry ».

   Le village avait déjà son petit peuple — mais tout entier le long de
   l'allée, sur quatre cents unités, parce que c'est tout ce qu'on pouvait
   atteindre. Maintenant que la plaine fait trois mille unités de bord à
   bord, ce peuple est une poignée de gens au milieu d'un pays désert.

   Trois ajouts, et chacun occupe une couche différente de la vue :
     · au RAS DU SOL, les papillons — on ne les voit qu'en marchant ;
     · à HAUTEUR D'HOMME, les promeneurs et les marchands, sur les chemins ;
     · EN HAUT, les oiseaux, dont les cercles s'élargissent à la taille du
       nouveau monde.
   Trois couches, parce qu'un monde vivant ne l'est pas seulement devant
   soi : il l'est aussi sous les yeux et au-dessus de la tête. */

/* ── Les promeneurs : des gens qui vont quelque part ─────────────────────
   Ils ne tournent pas en rond sur place comme les passants de l'allée : ils
   SUIVENT un chemin, d'un bout à l'autre, et font demi-tour au terminus.
   C'est ce qui fait qu'on les croise — et croiser quelqu'un qui va ailleurs
   est la chose qui peuple le mieux un paysage. */
const PROMENEURS = [];
{
  const rnd = semeur(20260606);
  const ROLES = ["japonais", "ninja", "cowboy", "mib"];
  const CHEMINS_VIVANTS = ["lac", "parc", "bibli", "est", "nord", "ceinture"];
  for (const cle of CHEMINS_VIVANTS) {
    const pts = CHEMINS[cle];
    const L = longueurChemin(pts);
    const n = cle === "ceinture" ? 7 : 3;
    for (let k = 0; k < n; k++) {
      const g = new THREE.Group();
      planter(ROLES[Math.floor(rnd() * ROLES.length)], g, rnd);
      /* Un marcheur sur quatre porte un fanal : la nuit, ce sont ces
         lumières qui bougent au loin qui disent que la campagne est
         habitée. Sans elles, le soir, tout le monde disparaît. */
      if (k % 4 === 1) {
        const m = new THREE.MeshBasicMaterial({ color: 0xFFB454, fog: true });
        LANTERNES.push(m);
        const f = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 1.5), m);
        f.position.set(2.4, 5.6, 0);
        g.add(f);
        g.add(lueur(13, 2.4, 5.6, 0));
      }
      scene.add(g);
      PROMENEURS.push({ g, pts, L, s: rnd() * L,
                        v: 9 + rnd() * 7, sens: rnd() < 0.5 ? 1 : -1 });
    }
  }

  /* ── Les marchands ambulants ──────────────────────────────────────────
     « des vendeurs, des marchands ambulants comme Terry. »

     Un marchand ambulant n'est pas un passant avec un chapeau : c'est
     quelqu'un qui TRANSPORTE son commerce. Il a donc une hotte sur le dos,
     une charrette derrière lui, et une lanterne qui pend à l'arceau. Trois
     objets, et il se reconnaît de loin — c'est tout ce qu'on demande à une
     silhouette.

     Ils font le tour de la ceinture, lentement : on les croise deux fois
     dans une promenade, jamais au même endroit. */
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group();
    planter("cowboy", g, rnd);
    const couleur = [0xB5472F, 0x3F6E8C, 0x7A5E9B][k];
    /* La hotte, portée haut sur les épaules. */
    g.add(bloc(lambert(couleur), 7.4, 9, 5.4, 0, 9.6, -3.4));
    g.add(bloc(M.boisClair, 8.2, 1.2, 6.2, 0, 14.4, -3.4));
    scene.add(g);

    /* La charrette : deux roues, un plateau, deux brancards, une bâche. */
    const ch = new THREE.Group();
    ch.add(bloc(M.boisClair, 15, 2, 11, 0, 7, 0));
    for (const s of [-1, 1]) {
      const roue = new THREE.Mesh(new THREE.TorusGeometry(6.4, 1.1, 5, 12),
                                  M.bois);
      roue.rotation.y = Math.PI / 2;
      roue.position.set(s * 6.4, 6.4, 0);
      ch.add(roue);
    }
    for (const s of [-1, 1])
      ch.add(bloc(M.bois, 1.2, 1.2, 13, s * 5, 8, 9));
    ch.add(bloc(lambert(couleur), 14, 7, 10, 0, 11.6, 0));
    const fan = new THREE.MeshBasicMaterial({ color: 0xFFB454, fog: true });
    LANTERNES.push(fan);
    ch.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2.6, 2), fan)
           .translateY(17).translateZ(-5));
    ch.add(lueur(16, 0, 17, -5));
    scene.add(ch);

    const pts = CHEMINS.ceinture, L = longueurChemin(pts);
    PROMENEURS.push({ g, charrette: ch, pts, L, s: k / 3 * L,
                      v: 5.5 + rnd() * 2, sens: 1, marchand: true });
  }
}

/* ── Les papillons ──────────────────────────────────────────────────────
   Deux triangles qui battent, et rien de plus. Ils ne volent qu'au soleil —
   c'est vrai des vrais papillons, et ça évite d'avoir à expliquer pourquoi
   ils brillent la nuit. Ils restent BAS, entre un et quatre mètres : un
   papillon à hauteur d'oiseau n'est plus un papillon, c'est une tache.

   Leur vol n'est pas un cercle : c'est deux sinusoïdes de périodes
   incommensurables, ce qui donne une trajectoire qui ne se répète jamais
   tout à fait. Un papillon qui boucle se remarque immédiatement. */
const papillons = (() => {
  const g = new THREE.Group();
  const rnd = semeur(880088);
  const COULEURS = [0xF2C14E, 0xE87FA8, 0x7FB3E8, 0xF28A5C, 0xE8E0A0];
  const aile = new THREE.PlaneGeometry(3.4, 2.4);
  for (let k = 0; k < 54; k++) {
    const p = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      color: COULEURS[Math.floor(rnd() * COULEURS.length)],
      side: THREE.DoubleSide, fog: true });
    const a1 = new THREE.Mesh(aile, mat), a2 = new THREE.Mesh(aile, mat);
    a1.position.x = -1.7; a2.position.x = 1.7;
    p.add(a1); p.add(a2);
    /* Semés sur toute la plaine, pas seulement au village : c'est dehors
       qu'on marche le plus lentement, donc là qu'on les voit. */
    const a = rnd() * Math.PI * 2, d = 60 + Math.sqrt(rnd()) * 1200;
    p.userData = { a1, a2, cx: Math.cos(a) * d, cz: Math.sin(a) * d,
                   r1: 9 + rnd() * 22, r2: 7 + rnd() * 18,
                   w1: 0.22 + rnd() * 0.3, w2: 0.31 + rnd() * 0.4,
                   y: 10 + rnd() * 26, bat: 11 + rnd() * 7, p: rnd() * 6.283 };
    g.add(p);
  }
  scene.add(g);
  return g;
})();

/* ── Qui porte une ombre ───────────────────────────────────────────────
   Tout ce qui est en matière opaque, et rien d'autre. Les vitres, les
   lueurs, les cônes de lumière et l'eau sont transparents : une ombre
   portée par une lueur est une tache noire en plein ciel. Et les fenêtres,
   posées à quelques millimètres de leur mur, s'ombreraient elles-mêmes —
   c'est le défaut classique, et il se règle en ne les faisant PAS porter
   d'ombre plutôt qu'en réglant un biais à l'aveugle. */
scene.traverse((o) => {
  if (!o.isMesh || !o.material) return;
  const m = o.material;
  if (!(m.isMeshLambertMaterial || m.isMeshStandardMaterial)) return;
  if (m.transparent) return;
  o.castShadow = true;
  /* ── Ce qui dépasse le cadre de l'ombre ne doit PAS la recevoir ────────
     Trouvé en marchant, et seulement parce que les murs invisibles sont
     tombés : à huit cents unités du centre, **le sol était noir en plein
     jour**. La cause ne date pas d'aujourd'hui. Ce balayage posait
     « receiveShadow » sur tout, y compris sur le terrain de 7000 unités,
     alors que la caméra d'ombre du soleil couvre un carré de 430. Hors de ce
     cadre, le fragment échantillonne une carte d'ombre qui ne le contient
     pas, et il ressort dans l'ombre — c'est-à-dire noir.

     Le défaut existait donc AVANT : il était simplement inatteignable,
     puisque la boîte retenait le marcheur à 250 unités. Une limite qui
     enferme cache aussi ce qu'il y a derrière elle, et personne ne corrige
     ce que personne ne peut voir. */
  o.receiveShadow = !o.userData.horsOmbre;
});

/* ═══════════════════════════════════════ L'HORIZON ══════════════════
   JustAkhiraa : « au loin la tour Eiffel », « la statue de la Liberté par
   là », « le mont Fuji par là », « des pyramides par ci ».

   Quatre monuments posés DERRIÈRE la montagne. Ils ne sont pas là pour qu'on
   y aille — on n'y va jamais, la ceinture arrête à 1500 —, ils sont là pour
   donner une direction. Un tour d'horizon identique de tous les côtés ne dit
   pas où l'on regarde ; quatre silhouettes reconnaissables font du tour
   d'horizon une CARTE, et c'est ce qui permet de se repérer dans une plaine
   dix-neuf fois plus grande qu'avant.

   ── Trois mesures ont décidé de tout, et elles ont toutes les trois
      contredit ce que j'avais écrit d'abord ──────────────────────────────

   1. La hauteur du sol là-bas n'est pas zéro. Au-delà de la crête,
      « hauteurSol » rend 820 unités, et elle les rend jusqu'au bord du
      maillage : la montagne n'est pas un anneau, c'est un PLATEAU. Posés à
      y = 0 comme je les avais écrits, les quatre monuments étaient
      intégralement enterrés sous huit cents unités de roche — la tour
      Eiffel fait 520. On les pose donc sur le plateau, en interrogeant
      « hauteurSol », exactement comme le fait le maillage du terrain et
      comme le fait le pas. Troisième fois que cette fonction est la seule
      source : à chaque fois qu'on la contourne, on bâtit dans le vide.

   2. Il faut DÉPASSER la crête, et de beaucoup. Depuis le village, la crête
      monte à 820 pour 2400 de distance, et le bruit du relief peut la porter
      à 1050 : elle masque tout ce qui se tient sous 24° au-dessus de
      l'horizon. Un monument de 520 posé à 3000 culmine à 25° — il affleure
      la ligne de crête et ne se voit pas. Ils sont donc agrandis jusqu'à
      culminer entre 30° et 36°, c'est-à-dire à dépasser la crête d'une bonne
      moitié de leur hauteur. À la taille réelle, le Fuji ferait trente-six
      mille unités et écraserait le reste ; à la taille juste ils sont
      invisibles. Ils sont à la taille qui les rend LISIBLES, et c'est l'écart
      qu'assume n'importe quel décor de théâtre.

   3. La brume les effaçait. Elle porte à 3400 de jour et à **2600** de nuit :
      un monument à 3000 est intégralement repeint en couleur de brume la
      nuit — c'est-à-dire absent. On ne touche pas à la brume, elle est réglée
      pour la vallée. On sort les monuments du calcul (« fog: false ») et on
      peint le voile À LA MAIN : leur couleur est mélangée à 70 % vers la
      couleur de brume de l'heure. L'effet est celui de la perspective
      aérienne — plus c'est loin, plus c'est pâle et désaturé —, mais il est
      BORNÉ : ils pâlissent sans jamais disparaître. Et comme le mélange suit
      l'heure, ils sont bleu ardoise la nuit et bleu pâle le jour, sans une
      ligne de plus.

   Aucun n'est fondu dans les seaux de géométrie : ils sont loin, grands, et
   au nombre de quatre. Six objets de plus ne coûtent rien, et les garder
   séparés laisse le moteur les écarter du champ quand on leur tourne le dos. */
const VOILE_HORIZON = 0.70;
/* ── Et une quatrième mesure, celle-là prise sur une capture ─────────────
   Peints du voile mais éclairés normalement, les monuments étaient PLUS
   SOMBRES que les contreforts devant eux : le mont Fuji tournait sa face à
   l'ombre vers le village et ressortait en ardoise foncée sur des collines
   pâles. L'indice de profondeur était inversé — ce qui est loin paraissait
   proche —, et une capture l'a montré en une seconde là où le calcul ne le
   disait pas.

   La cause est physique et je l'avais oubliée : à trois mille unités, ce
   n'est plus le soleil qui éclaire une surface, c'est l'air entre elle et
   l'œil. La face à l'ombre d'une montagne lointaine n'est pas sombre, elle
   est de la couleur de la brume, comme le reste. La lumière directe ne garde
   donc qu'un sixième du rendu — juste de quoi qu'on distingue deux pans d'une
   pyramide — et les cinq autres sixièmes sont posés d'office en « emissive ».
   Un monument de l'horizon ne s'assombrit plus du côté où le soleil n'est
   pas. */
const CHAIR_HORIZON = 0.18;     // la part qui dépend encore de la lumière
const PROPRE_HORIZON = 0.85;    // la part que la brume pose d'office
const HORIZON = [];             // { mat, base, voile } — repeints à chaque heure
/* Le voile se règle MATIÈRE PAR MATIÈRE, et c'est encore une capture qui l'a
   imposé. À 70 % pour tout, les quatre monuments viraient au même gris-bleu :
   la neige du Fuji ne se distinguait plus de sa roche, le cuivre de la statue
   perdait son vert, le sable des pyramides son chaud. Or ces monuments ne
   servent qu'à une chose — dire de quel côté on regarde —, et quatre
   silhouettes de la même couleur ne disent rien du tout.

   Le réglage suit ce que fait vraiment l'air : il efface d'autant plus une
   surface qu'elle est sombre, et presque pas une surface très claire. La
   neige d'un sommet lointain reste blanche, c'est l'expérience de n'importe
   quelle vallée alpine ; une paroi d'ombre, elle, disparaît la première. */
function matHorizon(couleur, voile) {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true, fog: false });
  HORIZON.push({ mat, base: new THREE.Color(couleur),
                 voile: voile === undefined ? VOILE_HORIZON : voile });
  return mat;
}
/* Appelée par « poserHeure » : le voile est une propriété de l'HEURE, pas du
   monument. Un monument qui garderait sa couleur de jour sous un ciel de nuit
   serait un autocollant posé sur le ciel. */
const _voile = new THREE.Color(), _teinte = new THREE.Color();
function teinterHorizon(H) {
  _voile.setHex(H.brumeCouleur);
  for (const h of HORIZON) {
    _teinte.copy(h.base).lerp(_voile, h.voile);
    h.mat.color.copy(_teinte).multiplyScalar(CHAIR_HORIZON);
    h.mat.emissive.copy(_teinte).multiplyScalar(PROPRE_HORIZON);
  }
}
{
  const M_FER    = matHorizon(0x8A6B52, 0.58);   // le fer peint de la tour
  const M_CUIVRE = matHorizon(0x6FBCA2, 0.45);   // le cuivre oxydé de la statue
  const M_SOCLE  = matHorizon(0xA79F92, 0.58);
  const M_ROCHE  = matHorizon(0x5B6B7A, 0.62);
  const M_NEIGE  = matHorizon(0xF2F6FA, 0.35);   // la neige ne pâlit presque pas
  const M_SABLE  = matHorizon(0xD9BE82, 0.42);   // le sable garde son chaud

  /* On pose au cap voulu, à la distance voulue, SUR le plateau — et on
     enfonce la base de cent cinquante unités. Le plateau est bosselé au
     bruit de Perlin ; une empreinte de mille unités de large ne peut pas
     épouser une bosse, et un monument qui flotte de quatre-vingts unités au-
     dessus de son sol se voit. Comme la crête masque de toute façon tout le
     bas, enfoncer ne coûte rien et garantit qu'il n'y a jamais de jour sous
     la pierre. */
  function poser(cap, d, enfoncer) {
    const x = Math.cos(cap) * d, z = Math.sin(cap) * d;
    const g = new THREE.Group();
    g.position.set(x, hauteurSol(x, z) - (enfoncer || 150), z);
    scene.add(g);
    return g;
  }

  /* ── La tour Eiffel ─────────────────────────────────────────────────
     Quatre montants qui se rapprochent par paliers, trois plateformes, une
     flèche, et deux arches au rez-de-chaussée. C'est la COURBURE des
     montants qui fait la tour : quatre poteaux droits donnent un pylône
     électrique, et l'arche est ce qui tranche définitivement entre les deux.
     Les demi-largeurs sont données palier par palier plutôt que calculées :
     ma première version les déduisait d'une formule, et elle laissait un
     décrochement de vingt-trois unités au premier étage — la tour avait une
     épaule. */
  {
    const g = poser(-0.72, 3000), H = 520;
    g.scale.setScalar(2.5);                       // 1300 unités : 35° de haut
    const NIV = [[0, 112], [0.26, 60], [0.46, 32], [0.72, 13], [1, 4.5]];
    for (let k = 0; k < NIV.length - 1; k++) {
      const [t0, d0] = NIV[k], [t1, d1] = NIV[k + 1];
      const y0 = H * t0, y1 = H * t1, hh = y1 - y0;
      const pente = Math.atan2(d0 - d1, hh);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.6, 1, 6), M_FER);
        m.position.set(sx * (d0 + d1) / 2, (y0 + y1) / 2, sz * (d0 + d1) / 2);
        m.scale.set(1, hh, 1);
        m.rotation.z =  sx * pente;
        m.rotation.x = -sz * pente;
        g.add(m);
      }
    }
    /* Les plateformes, qui couvrent aussi les joints entre deux paliers. */
    for (const [t, l] of [[0.26, 132], [0.46, 72], [0.72, 32]])
      g.add(bloc(M_FER, l, 7, l, 0, H * t, 0));
    g.add(cyl(M_FER, 1.6, 4.4, 72, 6, 0, H + 36, 0));
    for (const r of [0, Math.PI / 2]) {
      const a = new THREE.Mesh(new THREE.TorusGeometry(54, 5.5, 6, 14, Math.PI), M_FER);
      a.position.y = 42;
      a.rotation.y = r;
      g.add(a);
    }
  }

  /* ── La statue de la Liberté ────────────────────────────────────────
     Un socle à gradins, une robe conique, un bras levé, une torche, la
     couronne à sept pointes et la tablette. La couronne est le seul détail
     indispensable : c'est elle qu'on reconnaît de loin, bien avant la
     torche. */
  {
    const g = poser(2.42, 2900);
    g.scale.setScalar(3.2);                       // 1220 unités
    g.add(bloc(M_SOCLE, 108, 60, 108, 0, 30, 0));
    g.add(bloc(M_SOCLE, 86, 78, 86, 0, 99, 0));
    g.add(cyl(M_CUIVRE, 17, 38, 150, 10, 0, 213, 0));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(13, 10, 8), M_CUIVRE).translateY(300));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7 - 0.5) * Math.PI * 1.25;
      const p = cyl(M_CUIVRE, 0.6, 3.4, 30, 5,
                    Math.sin(a) * 15, 312 + Math.cos(a) * 4, Math.cos(a) * 15);
      p.rotation.set(-Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
      g.add(p);
    }
    const bras = cyl(M_CUIVRE, 6, 7, 86, 8, 26, 300, 0);
    bras.rotation.z = -0.44;
    g.add(bras);
    g.add(cyl(M_CUIVRE, 9, 5, 20, 8, 46, 344, 0));
    /* La flamme est la seule chose de l'horizon qui n'obéit pas au voile :
       une flamme ne pâlit pas avec la distance, elle reste un point clair.
       C'est aussi le seul repère qui tienne encore au plus noir de la nuit. */
    const flamme = new THREE.Mesh(new THREE.ConeGeometry(7, 26, 8),
                                  new THREE.MeshBasicMaterial({ color: 0xFFD87A,
                                                                fog: false }));
    flamme.position.set(46, 367, 0);
    g.add(flamme);
    const livre = bloc(M_CUIVRE, 30, 9, 22, -24, 262, 6);
    livre.rotation.z = 0.3;
    g.add(livre);
  }

  /* ── Le mont Fuji ───────────────────────────────────────────────────
     Un cône très ouvert et une calotte de neige. Les proportions comptent
     plus que la taille : le Fuji est LARGE, et un cône étroit donne un
     volcan quelconque. Mais une largeur fidèle le faisait déborder sur le
     village — à l'échelle uniforme qui le rendait visible, le pied du cône
     arrivait à 890 du centre, soit six cents unités À L'INTÉRIEUR de la
     ceinture : une montagne posée sur la bibliothèque. Il est donc étiré en
     hauteur plus qu'en largeur (×2,5 contre ×1,05). Le Fuji vu d'Hakone est
     d'ailleurs plus élancé que le Fuji des cartes.

     La deuxième mesure a resserré le cône une seconde fois, et pour une
     raison qui n'a rien à voir avec le village : son pied tombait à 1790,
     c'est-à-dire SIX CENTS UNITÉS DEVANT LA CRÊTE. Les bas de pente se
     voyaient donc depuis la plaine, peints du voile à la main (70 %) à côté
     de contreforts réels brumés à 47 % par le moteur — une montagne pâle
     collée sur des collines franches. La règle est tombée d'elle-même, et
     elle vaut pour les quatre : *le pied d'un monument de l'horizon doit
     être derrière la crête.* Ce qui reste visible est alors contre le CIEL,
     où il n'y a aucun terrain voisin avec quoi se comparer. Pied à 2407,
     crête à 2400 : il passe de sept unités, et c'est mesuré, pas estimé. */
  {
    const g = poser(1.08, 3300, 260);
    g.scale.set(1.05, 2.5, 1.05);                 // 1400 de haut, 893 de rayon
    g.add(cyl(M_ROCHE, 86, 850, 560, 7, 0, 280, 0));
    /* La calotte de neige était INVISIBLE, et la capture l'a montrée mieux
       que n'importe quel calcul : posée de 441 à 559 avec un rayon de 168,
       elle se tenait tout entière à l'intérieur du cône de roche, qui mesure
       encore 248 de rayon à cette hauteur. Une neige plus étroite que sa
       montagne ne se pose pas dessus, elle se range dedans. Elle est donc
       recalculée pour DÉBORDER : 292 de rayon à 420 contre 277 pour la
       roche, et dix unités de plus que le sommet. Sans elle, le mont Fuji
       était un triangle gris de plus — c'est-à-dire rien du tout. */
    g.add(cyl(M_NEIGE, 70, 292, 150, 7, 0, 495, 0));
  }

  /* ── Les pyramides ──────────────────────────────────────────────────
     Trois, de tailles décroissantes et désalignées : c'est le GROUPE qui se
     reconnaît, jamais une pyramide seule.

     Elles sont plus raides que les vraies — 62° de pente contre 51,8° à
     Gizeh — et c'est le prix de la règle du pied derrière la crête. À la
     pente juste, la largeur qu'il faut pour culminer assez haut ramenait le
     pied à 2100, devant la crête. Entre une pyramide à la pente exacte qu'on
     ne voit pas et une pyramide un peu trop pointue qu'on reconnaît du
     premier coup d'œil, le choix n'est pas difficile.

     Le sphinx que j'avais mis devant est retiré : il mesurait 160 unités de
     haut au pied d'un massif de 1500, derrière une crête qui masque tout ce
     qui se tient sous 18,5°. L'audit d'occlusion l'a dit sans détour — aucun
     de ses sommets n'était visible depuis un seul point de la plaine. De la
     géométrie qu'on ne peut voir d'aucun endroit où l'on peut se tenir n'est
     pas un détail, c'est un poids mort. */
  {
    const g = poser(0.32, 3400, 260);
    g.scale.set(3.6, 5.2, 3.6);                   // 1560 de haut, 840 de demi-côté
    /* Deux corrections que seule une capture pouvait trouver, et elles
       disent la même chose : *un groupe ne se voit pas, il se voit DEPUIS
       QUELQUE PART.*

       La première : les trois pyramides étaient décalées de 250 et 430 vers
       le même coin, c'est-à-dire presque exactement dans l'axe du village —
       0,7° d'écart de cap entre la première et la troisième. Elles se
       cachaient l'une derrière l'autre et il n'en restait qu'une à l'écran.
       Les écarts sont donc TANGENTIELS : perpendiculaires à la ligne de vue,
       de part et d'autre de la grande, avec un rien de profondeur pour
       qu'elles ne soient pas alignées au cordeau.

       La seconde : chaque pyramide était tournée d'un huitième de tour, ce
       qui mettait une FACE de face. Une face de face est un triangle plat —
       et un triangle plat sur fond de ciel, c'est une montagne. En lui
       présentant une ARÊTE, on voit deux pans d'un coup, l'un plus clair que
       l'autre, et la pyramide redevient un volume. C'est exactement la vue
       des cartes postales de Gizeh, et ce n'est pas un hasard. */
    const P = [[0, 0, 330, 300, 0], [-69, 270, 250, 230, 0.14],
               [53, -245, 170, 155, -0.21]];
    for (const [dx, dz, base, h, lacet] of P) {
      const p = new THREE.Mesh(new THREE.ConeGeometry(base, h, 4), M_SABLE);
      p.rotation.y = lacet;
      p.position.set(dx, h / 2, dz);
      g.add(p);
    }
  }
}

/* ═══════════════════════════════════════ LE CIEL VIVANT ═════════════
   JustAkhiraa : « des avions qui passent très rarement », « la nuit aussi
   très rarement des étoiles filantes ».

   Deux fois le mot « rarement », et c'est tout le sujet. Un avion toutes les
   dix secondes est un couloir aérien ; une étoile filante par seconde est
   une pluie de météores. Ce qui rend ces deux choses belles, c'est qu'on les
   MANQUE — et qu'on dit « tiens » quand on en voit une. L'avion passe donc
   toutes les deux à quatre minutes, l'étoile toutes les quarante-cinq
   secondes à deux minutes et demie, et aucun des deux n'est jamais au même
   endroit.

   Les deux ne coûtent qu'un objet chacun, réutilisé : rien n'est créé ni
   détruit en vol, on déplace le même. Et aucun des deux ne bouge quand les
   animations sont coupées — un ciel qui s'agite pour qui a demandé moins de
   mouvement est une faute, pas une attention. */
const CIEL_VIVANT = (() => {
  if (CALME) return { avancer() {} };

  /* L'avion : un fuselage, deux ailes, un empennage, et une traînée qui
     s'étire derrière lui. Vu de six cents unités plus bas, quatre boîtes
     suffisent — mais la traînée, elle, est indispensable : c'est elle qu'on
     voit d'abord, et c'est elle qui dit qu'il avance. Elle reste dans le
     calcul de la brume, comme l'avion : à mille neuf cents unités ils
     doivent pâlir ENSEMBLE, sinon on voit un trait blanc tirer un appareil
     déjà effacé. */
  const avion = new THREE.Group();
  {
    const blanc = lambert(0xE8EDF4);
    avion.add(cyl(blanc, 2.2, 2.6, 34, 7, 0, 0, 0).rotateZ(Math.PI / 2));
    avion.add(bloc(blanc, 13, 0.9, 26, 0, 0, 0));
    avion.add(bloc(blanc, 7, 0.8, 12, -13, 0, 0));
    avion.add(bloc(blanc, 6, 7, 0.9, -14, 3.5, 0));
  }
  /* ── Les feux de position ───────────────────────────────────────────
     Première capture de nuit : l'avion était une tache noire traînant un
     trait blanc. C'est logique et c'est faux. Logique, parce qu'un fuselage
     blanc éclairé par la seule lune à sept cents unités de haut ne renvoie
     rien ; faux, parce que ce n'est pas comme ça qu'on voit un avion la
     nuit. De nuit, on ne voit JAMAIS l'appareil — on voit deux points qui
     clignotent et qui traversent. C'est même à ça qu'on le reconnaît.

     Deux feux aux bouts d'ailes, donc, additifs pour qu'ils s'ajoutent au
     ciel au lieu de le recouvrir, et qui battent une fois par seconde et
     demie. De jour ils ne servent à rien et on les éteint ; c'est la traînée
     qui prend le relais, et elle ne sert à rien la nuit. Chacun son heure,
     et l'avion reste lisible aux deux. */
  const feux = [];
  for (const dz of [-13, 13]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(2.6, 6, 5),
      new THREE.MeshBasicMaterial({ color: dz < 0 ? 0xFF8A72 : 0xBFE4FF,
                                    transparent: true, opacity: 0,
                                    blending: THREE.AdditiveBlending,
                                    depthWrite: false, fog: false }));
    f.position.set(1, 0, dz);
    avion.add(f);
    feux.push(f);
  }
  const trainee = new THREE.Mesh(
    PLAN,
    new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true,
                                  opacity: 0.22, depthWrite: false }));
  trainee.rotation.x = -Math.PI / 2;
  const vol = new THREE.Group();
  vol.add(avion); vol.add(trainee);
  vol.visible = false;
  scene.add(vol);

  /* L'étoile filante : un trait lumineux qui s'allume, file et s'éteint.
     « additive » parce qu'une étoile filante AJOUTE de la lumière au ciel,
     elle ne le recouvre pas — et hors brume, parce qu'additionner une
     couleur de brume à un ciel noir donnerait un rectangle bleu. */
  const filante = new THREE.Mesh(
    PLAN,
    new THREE.MeshBasicMaterial({ color: 0xDCE9FF, transparent: true,
                                  blending: THREE.AdditiveBlending,
                                  depthWrite: false, fog: false }));
  filante.visible = false;
  scene.add(filante);

  let horloge = 0;
  let tAvion = 26 + Math.random() * 40;     // le premier ne se fait pas attendre
  let volEnCours = 0, capAvion = 0, hAvion = 0;
  let tFilante = 14 + Math.random() * 30;
  let filEnCours = 0;
  const DUREE_VOL = 34, DUREE_FIL = 1.15;
  const filDepart = new THREE.Vector3(), filFin = new THREE.Vector3();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();

  return {
    avancer(dt, nuit) {
      horloge += dt;
      /* ── L'avion ──────────────────────────────────────────────────── */
      if (volEnCours > 0) {
        volEnCours -= dt;
        const avance = 1 - volEnCours / DUREE_VOL;
        const d = -1900 + avance * 3800;
        vol.position.set(Math.cos(capAvion) * d, hAvion, Math.sin(capAvion) * d);
        vol.rotation.y = -capAvion;
        /* La traînée part du nez et s'allonge derrière : sa longueur suit
           l'avancement, donc elle naît courte et finit longue. */
        const L = 60 + avance * 540;
        trainee.scale.set(L, 5.4, 1);
        trainee.position.set(-L / 2 - 20, 0, 0);
        /* La traînée s'ouvre et se referme avec le passage ; la nuit elle
           n'existe pas, parce qu'on ne voit pas une traînée dans le noir. */
        trainee.material.opacity = nuit ? 0 : 0.22 * Math.sin(avance * Math.PI);
        const bat = (horloge % 1.5) < 0.14 ? 1 : 0.04;
        for (const f of feux) f.material.opacity = (nuit ? 0.95 : 0.3) * bat;
        if (volEnCours <= 0) vol.visible = false;
      } else {
        tAvion -= dt;
        if (tAvion <= 0) {
          tAvion = 120 + Math.random() * 120;
          volEnCours = DUREE_VOL;
          capAvion = Math.random() * Math.PI * 2;
          hAvion = 620 + Math.random() * 260;
          vol.visible = true;
        }
      }

      /* ── L'étoile filante, de nuit seulement ──────────────────────── */
      if (!nuit) { filante.visible = false; filEnCours = 0; return; }
      if (filEnCours > 0) {
        filEnCours -= dt;
        const k = 1 - filEnCours / DUREE_FIL;
        filante.position.copy(_a.lerpVectors(filDepart, filFin, k));
        /* Elle regarde la caméra pour rester un trait et non un ruban vu par
           la tranche ; le roulis vient ensuite, et il suit sa trajectoire. */
        filante.lookAt(camera.position);
        _b.subVectors(filFin, filDepart).normalize();
        filante.rotation.z = Math.atan2(_b.y, Math.hypot(_b.x, _b.z));
        filante.scale.set(150 + k * 120, 3.2, 1);
        /* Elle s'allume vite et s'éteint lentement : l'inverse donnerait une
           ampoule qu'on débranche. */
        filante.material.opacity = Math.min(1, k * 6) * (1 - k) * 0.9;
        if (filEnCours <= 0) filante.visible = false;
      } else {
        tFilante -= dt;
        if (tFilante <= 0) {
          tFilante = 45 + Math.random() * 110;
          filEnCours = DUREE_FIL;
          const a = Math.random() * Math.PI * 2;
          const d = 1500 + Math.random() * 900;
          filDepart.set(Math.cos(a) * d, 900 + Math.random() * 500, Math.sin(a) * d);
          const a2 = a + (Math.random() - 0.5) * 1.1;
          filFin.set(Math.cos(a2) * d * 0.72, 420 + Math.random() * 260,
                     Math.sin(a2) * d * 0.72);
          filante.visible = true;
        }
      }
    },
  };
})();

/* ═══════════════════════════════════════ marcher ════════════════════
   « Il faut avoir la possibilité de se déplacer. »

   Trois commandes, pas une de plus, et aucune n'est obligatoire :
     — glisser le doigt ou la souris sur le village : tourner la tête ;
     — ZQSD (ou WASD, ou les flèches) : marcher ; Maj pour courir ;
     — la molette : avancer, reculer.
   Cliquer sur un bâtiment reste le chemin court ; marcher est un plaisir.

   Les touches sont lues par leur POSITION (e.code), jamais par leur lettre :
   la touche marquée Z sur un clavier français est la même que celle marquée
   W sur un clavier anglais, et « KeyW » désigne les deux. Lire la lettre
   aurait donné un village qui ne marche que sur un clavier. */
const OBSTACLES = [];
matieres.forEach((m) => OBSTACLES.push(
  { x: m.L.x, z: m.L.z, r: m.b.demiLargeur + 14 }));
OBSTACLES.push({ x: 0, z: V.zFontaine, r: V.rFontaine + 9 });
for (const o of OBSTACLES_BOUT) OBSTACLES.push(o);
for (const o of OBSTACLES_CAMPAGNE) OBSTACLES.push(o);
/* Et tout ce qui s'est déclaré solide en se posant : les arbres, les bancs,
   les tables, les meules, les cinquante maisons de la rue. C'est la liste qui
   fait qu'on ne traverse plus un tronc. */
for (const o of SOLIDES) OBSTACLES.push(o);
for (const sx of [-1, 1])
  OBSTACLES.push({ x: sx * (V.demiAllee + 6), z: V.zPortail, r: 13 });
/* ── Ce qui remplace les murs invisibles ─────────────────────────────────
   « aussi je déteste les murs invisibles. »

   La boîte « BORNES = { x: 250, zMin: -158, zMax: 340 } » est supprimée.
   Elle arrêtait net, sans rien montrer, et elle était en plus trop petite
   pour le village qu'elle enfermait : à zMin = −158, on ne pouvait pas
   s'approcher du château, dont la façade est à −310. On butait sur rien, à
   cent cinquante unités d'un bâtiment qu'on voyait.

   Ce qui arrête maintenant est une PENTE. On monte les collines sans y
   penser ; au-delà d'un certain raidillon on ne passe plus, exactement comme
   dans la vie. La règle est perceptible — la montagne est là, devant, visible
   depuis le portail — et surtout elle est prévisible : si ça monte trop, ça
   ne passe pas. C'est tout l'écart entre une contrainte et une panne.

   Le seuil est exprimé en pente, pas en distance : 0,62, c'est à peu près
   32°. Une route de montagne ne dépasse pas 10 % ; un sentier raide, 30 % ;
   au-delà de 60 % on grimpe avec les mains. On s'arrête donc là où un marcheur
   s'arrête. */
const PENTE_MAX = 0.62;

/* On ne traverse pas un mur. Chaque obstacle est un cercle, et quand on y
   entre on est repoussé sur son bord — pas arrêté net. La différence se
   sent tout de suite : arrêté, on se croit bloqué ; repoussé, on longe le
   mur et on contourne sans y penser. La pente suit la même règle : refusée,
   elle laisse le pas en place au lieu de le renvoyer en arrière, et l'on
   longe le pied de la montagne sans se sentir repoussé. */
function glisserContre(x, z) {
  for (const o of OBSTACLES) {
    const dx = x - o.x, dz = z - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < o.r * o.r) {
      const d = Math.sqrt(d2) || 0.001;
      x = o.x + dx / d * o.r;
      z = o.z + dz / d * o.r;
    }
  }
  /* La pente est mesurée sur le pas qu'on s'apprête à faire, pas sur une
     dérivée théorique : c'est le déplacement réel qui compte. Un pas de
     longueur nulle ne dit rien sur la pente, donc on ne lui demande rien. */
  const hIci = hauteurSol(oeil.pos.x, oeil.pos.z);
  const hLa  = hauteurSol(x, z);
  const pas  = Math.hypot(x - oeil.pos.x, z - oeil.pos.z);
  if (pas > 0.001 && (hLa - hIci) / pas > PENTE_MAX) return;   // trop raide
  /* ── La ceinture ────────────────────────────────────────────────────────
     L'audit a montré que la pente seule laissait passer : sur soixante-douze
     caps, soixante et un n'étaient arrêtés par RIEN et l'on marchait jusqu'au
     vide, bien au-delà du terrain. Ce n'était pas un mur invisible, c'était
     une absence de mur — pire.

     La borne est de retour, mais elle n'a plus rien d'invisible : son rayon
     est exactement celui où sont posés le fleuve, la muraille, la falaise, la
     forêt, le marais, les ruines, le ravin et la palissade. Au moment où l'on
     ne passe plus, on a l'obstacle sous le nez. C'est ce qui sépare une
     limite d'une panne : on peut la voir avant de la sentir. */
  const dC = Math.hypot(x, z);
  if (dC > R_BORD - 2) {
    const k = (R_BORD - 2) / dC;
    x *= k; z *= k;
  }

  oeil.pos.x = x;
  oeil.pos.z = z;
  oeil.pos.y = hauteurSol(x, z) + HAUTEUR_OEIL + saut.h;
}

/* ── Le saut ─────────────────────────────────────────────────────────────
   « avoir la possibilité de sauter avec espace. »

   Une hauteur et une vitesse, rien de plus : pas de moteur physique pour un
   village sans relief. La pesanteur est choisie pour que le saut dure un peu
   moins d'une demi-seconde — au-delà on flotte, en deçà on n'a pas le temps
   de voir qu'on a sauté.

   On ne saute QUE depuis le sol. Sans ce test, une touche maintenue enfoncée
   relance l'élan à chaque image et l'on monte indéfiniment — c'est le premier
   défaut de tous les sauts écrits à la main. */
const saut = { h: 0, v: 0 };
const SAUT_ELAN = 46, PESANTEUR = 165;
function sauter() {
  if (saut.h > 0.01 || saut.v !== 0) return;
  saut.v = SAUT_ELAN;
}
function avancerSaut(dt) {
  if (saut.h <= 0 && saut.v <= 0) return;
  saut.v -= PESANTEUR * dt;
  saut.h += saut.v * dt;
  if (saut.h <= 0) { saut.h = 0; saut.v = 0; }
  /* Le saut part du SOL, et le sol n'est plus à zéro partout. Garder
     « HAUTEUR_OEIL + saut.h » aurait fait sauter dans la colline dès qu'on
     quitte la plaine. */
  oeil.pos.y = hauteurSol(oeil.pos.x, oeil.pos.z) + HAUTEUR_OEIL + saut.h;
}

const appui = new Set();
const TOUCHES = { KeyW: "av", ArrowUp: "av", KeyS: "ar", ArrowDown: "ar",
                  KeyA: "ga", ArrowLeft: "ga", KeyD: "dr", ArrowRight: "dr" };
/* Le manche du pouce, sur écran tactile. Il n'occupe AUCUNE place tant
   qu'on ne s'en sert pas : il apparaît là où le pouce se pose, dans le
   quart inférieur gauche de l'écran, et disparaît quand on le lâche. Un
   manche dessiné en permanence aurait mangé le coin d'un téléphone déjà
   étroit, et il aurait fallu le placer sans jamais recouvrir la boussole —
   deux problèmes qui n'existent pas si l'objet n'existe qu'au toucher.

   Ailleurs sur l'écran, le même geste tourne la tête. Les deux marchent en
   même temps : ce sont deux doigts, donc deux pointeurs distincts, et
   chacun garde son identifiant. */
const manche = { x: 0, y: 0 };
const RAYON_MANCHE = 52;
const elManche = $("manche"), poignee = $("manche-poignee");
function montrerManche(x, y) {
  elManche.style.left = (x - RAYON_MANCHE) + "px";
  elManche.style.top = (y - RAYON_MANCHE) + "px";
  elManche.hidden = false;
  poignee.style.transform = "translate(0px, 0px)";
}
function bougerManche(dx, dy) {
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, RAYON_MANCHE / d);
  const px = dx * k, py = dy * k;
  poignee.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
  manche.x = px / RAYON_MANCHE;
  manche.y = py / RAYON_MANCHE;
  bouge();
}
function rangerManche() {
  elManche.hidden = true;
  manche.x = manche.y = 0;
}

function tourner(dLacet, dSite) {
  oeil.lacet += dLacet;
  /* On ne se casse pas la nuque : le regard monte d'un demi-radian et
     descend d'un peu plus. Au-delà, l'horizon disparaît et on ne sait plus
     où l'on est. */
  oeil.site = Math.max(-0.60, Math.min(0.50, oeil.site + dSite));
  bouge();
}
function avancerDe(d) {
  glisserContre(oeil.pos.x - Math.sin(oeil.lacet) * d,
                oeil.pos.z - Math.cos(oeil.lacet) * d);
  bouge();
}
function marcher(dt) {
  let av = (appui.has("av") ? 1 : 0) - (appui.has("ar") ? 1 : 0) - manche.y;
  let co = (appui.has("dr") ? 1 : 0) - (appui.has("ga") ? 1 : 0) + manche.x;
  if (Math.abs(av) < 0.06 && Math.abs(co) < 0.06) return;
  /* La diagonale est ramenée à la même longueur que la ligne droite : sans
     ça, aller en biais va une fois et demie plus vite, et on s'en aperçoit. */
  const norme = Math.max(1, Math.hypot(av, co));
  const v = (appui.has("vite") ? 112 : 56) * dt / norme;
  const c = Math.cos(oeil.lacet), si = Math.sin(oeil.lacet);
  glisserContre(oeil.pos.x + (-si * av + c * co) * v,
                oeil.pos.z + (-c * av - si * co) * v);
}
/* La première fois qu'on bouge, l'invite disparaît : elle a fait son
   travail. C'est le principe de l'affordance qui s'efface. */
let aBouge = false;
function bouge() {
  if (aBouge) return;
  aBouge = true;
  document.body.classList.add("a-bouge");
}

/* ═══════════════════════════════════════ les enseignes ══════════════
   Le nom d'une matière est du TEXTE, posé dans la scène par le second rendu.
   Dessiné dans le WebGL, il se pixellisait en approchant et aucun lecteur
   d'écran ne le voyait. Ici c'est un vrai bouton : on peut l'atteindre au
   clavier, et il porte le compte des chapitres et des fiches — ce qu'aucune
   silhouette ne saurait dire. */
const groupeEnseignes = new THREE.Group();
monde3D.add(groupeEnseignes);
const groupeCartes = new THREE.Group();
monde3D.add(groupeCartes);

const ENS_PX = [300, 118];
/* L'échelle d'une enseigne est FIXE, en unités du village : elle grossit
   quand on s'approche et rapetisse quand on s'éloigne, comme tout le reste.
   Celle du château est plus grande parce qu'il est au bout de l'allée et
   qu'on le voit de loin — c'est de la perspective, pas de la hiérarchie. */
const ECH_ENSEIGNE = { chateau: 0.46 };
function batirEnseignes() {
  matieres.forEach((m) => {
    const e = document.createElement("button");
    e.type = "button";
    e.className = "enseigne";
    e.style.width = ENS_PX[0] + "px";
    e.style.height = ENS_PX[1] + "px";
    e.style.setProperty("--c", m.css);
    e.style.setProperty("--d", m.i * 90 + "ms");
    const nf = m.pole.chapitres.reduce((s, ch) => s + ch.fiches.length, 0);
    e.innerHTML =
      `<span class="ens-crochet" aria-hidden="true"></span>` +
      `<span class="ens-plaque">` +
        `<span class="ens-ic" aria-hidden="true">${ech(ICONES[m.pole.matiere] || "●")}</span>` +
        `<span class="ens-txt"><b>${ech(m.pole.court || m.pole.titre)}</b>` +
        `<i>${m.pole.chapitres.length} chapitres · ${nf} fiches</i></span>` +
      `</span>`;
    e.setAttribute("aria-label",
      `${m.pole.titre} — ${m.pole.chapitres.length} chapitres, ${nf} fiches. ` +
      `${m.L.lieu} : ${m.L.quoi}.`);
    e.addEventListener("click", () => allerA(m.i));
    e.addEventListener("pointerenter", () => marquerSurvol(m.i, true));
    e.addEventListener("pointerleave", () => marquerSurvol(m.i, false));
    e.addEventListener("focus", () => marquerSurvol(m.i, true));
    e.addEventListener("blur", () => marquerSurvol(m.i, false));

    const o = new CSS3DSprite(e);
    const p = m.pos.clone().addScaledVector(m.n, m.b.demiLargeur * 0.5 + 8);
    const ech3D = ECH_ENSEIGNE[m.L.forme] || 0.24;
    o.position.set(p.x, m.b.hauteur + ENS_PX[1] * ech3D * 0.62 + 12, p.z);
    o.scale.setScalar(ech3D);
    groupeEnseignes.add(o);
    m.enseigne = e;
  });
}

function marquerSurvol(i, oui) {
  if (vue.matiere >= 0) return;
  matieres.forEach((m) => {
    const actif = oui && m.i === i;
    m.vise = actif;
    if (m.enseigne) m.enseigne.classList.toggle("survol", actif);
  });
  toile.style.cursor = oui ? "pointer" : "";
  if (oui && i >= 0) sousTitrer(i);
}

/* ═══════════════════════════════════════ les cartes de chapitre ═════
   Le reflet suit le pointeur et la carte s'incline — JustAkhiraa : « sur CodePen
   j'ai déjà vu des cartes Pokémon ultra stylées ». Coupé si le lecteur a
   demandé moins d'animation : une inclinaison qui suit la souris est
   précisément ce qui gêne alors. */
/* JustAkhiraa : « c'est plus du tout ergonomique, on ne les voit pas tous ».
   J'avais corrigé des cartes illisibles en imposant un seuil de lisibilité,
   et le seuil a rejeté toutes les grilles fournies : trois cartes sur
   dix-sept à l'écran. Les deux exigences sont vraies ensemble — lisible ET
   tout voir — et tant que la carte est dessinée pour 320 × 200 elles sont
   incompatibles sur un portable. C'est de l'arithmétique, pas un réglage.
   Ce qui cède, c'est la taille du DESSIN : une carte de chapitre n'a besoin
   que d'un numéro, d'un titre, d'une ligne et de ses quatre pastilles. */
/* Retour à 112. La carte avait grandi pour porter une rangée de pastilles
   dont il s'avère qu'elle n'était pas ce qu'il cherchait ; sans elle, la
   hauteur retombe et la grille retrouve ses dix-sept chapitres d'un coup,
   comme sur la capture qu'il veut retrouver. */
const CARTE_PX = [236, 112], ECHELLE = 0.105;
const CARTE_L = CARTE_PX[0] * ECHELLE, CARTE_H = CARTE_PX[1] * ECHELLE;
/* L'écart entre deux cartes. Il valait 19 % de leur largeur — assez pour
   coûter une rangée entière sur un téléphone : trois écarts de 45 pixels, c'est
   une quatrième carte qu'on ne voit pas. À 13 %, elles restent nettement
   séparées, et la rangée entre. L'écart sert à distinguer deux cartes, pas à
   prouver qu'on sait aérer. */
const JEU = CARTE_L * 0.13;

function inclinaison(c) {
  if (CALME) return;
  c.addEventListener("pointermove", (e) => {
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
    c.style.setProperty("--my", (y * 100).toFixed(1) + "%");
    c.style.setProperty("--rx", ((0.5 - y) * 9).toFixed(2) + "deg");
    c.style.setProperty("--ry", ((x - 0.5) * 11).toFixed(2) + "deg");
  });
  const repos = () => {
    c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg");
    c.style.setProperty("--mx", "50%");  c.style.setProperty("--my", "50%");
  };
  c.addEventListener("pointerleave", repos);
  c.addEventListener("blur", repos);
}

function carteChapitre(chap, m, k) {
  const c = document.createElement("button");
  c.type = "button";
  c.className = "carte";
  c.style.setProperty("--c", m.css);
  c.style.setProperty("--d", (k % 14) * 32 + "ms");
  c.style.width = CARTE_PX[0] + "px";
  c.style.height = CARTE_PX[1] + "px";
  /* Tout le dessin est dans la doublure, et pas dans le bouton lui-même :
     CSS3DRenderer écrit sa matrice dans le « transform » de la racine à
     chaque image, et un relief posé là serait effacé aussitôt. C'est la
     doublure qui s'incline sous le pointeur. */
  c.innerHTML =
    `<span class="carte-dedans">` +
      `<span class="carte-holo" aria-hidden="true"></span>` +
      `<span class="carte-paillettes" aria-hidden="true"></span>` +
      `<span class="carte-lueur" aria-hidden="true"></span>` +
      `<span class="carte-no">${String(k + 1).padStart(2, "0")}</span>` +
      `<span class="carte-texte"><b>${ech(chap.titre)}</b>` +
      (chap.sous ? `<span class="carte-sous">${ech(chap.sous)}</span>` : "") +
      `</span>` +
      /* ── Les « diamants » : ce n'était pas ça ──────────────────────────
         J'avais cru reconnaître, dans « sur les côtés des cartes y'avait un
         petit truc stylé comme des diamants », cette rangée de pastilles. Je
         l'ai remise, elle a coûté une rangée de chapitres, ses étiquettes
         arrivaient tronquées — « Co… Exercic… Fic… Q… » — et ce n'était
         toujours pas ce qu'il avait vu.

         Le 30 septembre il a envoyé six captures : quatre sous Windows, deux
         sous macOS. Les deux Firefox montrent quatre CARRÉS aux angles de
         chaque carte ; les deux Edge et le Brave, rien. Ce sont eux, les
         diamants — et ce n'est pas du style, c'est un défaut de rendu :
         Firefox n'applique pas le « border-radius » au « backdrop-filter »,
         donc le fond flouté déborde aux quatre angles de la boîte carrée que
         la carte arrondie ne couvre pas.

         Il aime ce défaut. On ne peut pas le garder comme tel — il n'existe
         que dans un moteur, et il disparaîtra à la première correction de
         Mozilla. On le DESSINE donc, dans .carte::before, où il devient le
         même partout et se laisse habiller par thème. Un accident qu'on aime
         se transforme en décision, ou il finit par se perdre.

         La rangée de pastilles repart : elle ne portait rien qu'on ne sache
         déjà, elle se tronquait, et elle coûtait cinq chapitres à l'écran. */
    `</span>`;
  inclinaison(c);
  c.addEventListener("click", () =>
    ouvrirLecture({ chap, pole: m.pole, couleur: m.css }));
  return c;
}

const cartes3D = [];
function viderCartes() {
  while (groupeCartes.children.length) groupeCartes.remove(groupeCartes.children[0]);
  cartes3D.length = 0;
}

/* ═══════════════════════════════════════ la caméra ══════════════════
   Deux lieux : l'ALLÉE, où l'on est debout et où l'on peut marcher, et le
   PARVIS d'un bâtiment, où l'on choisit son chapitre.

   L'état de la caméra est partout le même TRIPLET : où elle est, de combien
   elle tourne à l'horizontale (le lacet) et de combien elle lève le nez (le
   site). Un « lookAt » n'aurait pas suffi : pour marcher il faut pouvoir
   tourner la tête sans savoir ce qu'on regarde, et pour la ruée il faut
   pouvoir interpoler une ORIENTATION, pas un point visé — deux points visés
   qui se croisent font tournoyer l'image.

   La caméra regarde vers -Z quand le lacet vaut zéro ; c'est la convention
   de three.js, et tout le reste en découle. */
const vue = { matiere: -1, defile: 0, course: 0, yBande: 0, demiBande: 0 };
const oeil  = { pos: new THREE.Vector3(), lacet: 0, site: 0 };
const cible = { pos: new THREE.Vector3(), lacet: 0, site: 0 };
const FOV_LARGE = 55, FOV_ETROIT = 66;
/* La taille d'un homme. Tout le village est dessiné pour être vu d'ici :
   c'est ce qui fait qu'un bâtiment de cent trente unités paraît haut. */
const HAUTEUR_OEIL = 17;

function poserCamera() {
  camera.position.copy(oeil.pos);
  camera.rotation.set(oeil.site, oeil.lacet, 0, "YXZ");
}
/* Le cap à prendre pour regarder un point depuis un autre. */
const _d = new THREE.Vector3();
function capVers(depuis, vers) {
  _d.subVectors(vers, depuis).normalize();
  return { lacet: Math.atan2(-_d.x, -_d.z),
           site: Math.asin(Math.max(-1, Math.min(1, _d.y))) };
}
/* Le plus court chemin d'un angle à l'autre. Sans lui, passer de +179° à
   -179° fait faire un tour complet à la caméra pour deux degrés. */
function ecartAngle(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function reculPour(demiL, demiH) {
  const vFov = camera.fov * Math.PI / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  /* 2 % de sécurité, pas 6 : sur la hauteur, chaque point est pris
     directement sur la taille des cartes. */
  return Math.max(demiL / Math.tan(hFov / 2), demiH / Math.tan(vFov / 2)) * 1.02;
}
/* Combien de colonnes, combien de rangées : la même question, posée deux
   fois, et la réponse est toujours « combien TIENNENT à leur taille ».
   J'ai d'abord déduit les colonnes de la FORME de l'écran — quatre au-delà
   de 16/9. Sur une fenêtre de douze cents pixels, quatre cartes dessinées
   pour trois cent vingt en demandent mille quatre cent soixante : elles
   arrivaient donc aux deux tiers, et tout leur texte avec. La forme de
   l'écran ne dit rien de la place réelle ; seuls les pixels la disent.

   On arrondit au PLUS PROCHE, jamais vers le bas : à trois colonnes près de
   tenir, arrondir vers le bas n'en laisse que deux — à 137 % de leur
   taille, et il ne reste plus que deux chapitres à l'écran sur dix-sept. Au
   plus proche, on a trois colonnes à 99 % : la place est utilisée ET le
   texte est à sa taille. Le seuil à ne pas franchir est 0,88 — en dessous,
   le sous-titre d'une carte tombe sous neuf pixels et ne se lit plus. */
/* Plutôt que de deviner un diviseur, on CALCULE. Pour une grille donnée,
   on sait exactement à quelle distance la caméra se posera, donc quelle
   hauteur de monde tiendra dans l'écran, donc à quelle taille la carte
   arrivera. Le rapport « taille obtenue / taille dessinée » est alors un
   nombre, pas une impression.

   J'ai d'abord réglé ça à coups de constantes — 1,19, puis un arrondi au
   plus proche — et je me suis trompé deux fois de suite parce que mon
   modèle oubliait la marge de sécurité du cadrage. Un calcul qui se vérifie
   lui-même ne se trompe pas : celui-ci essaie toutes les grilles possibles
   et ne garde que celles qui passent le seuil. */
/* ── Le seuil, exprimé dans l'unité qui compte ───────────────────────────
   C'était 0,88 : un rapport sans unité, choisi parce qu'il donnait un nombre
   de cartes qui convenait. Il ne disait rien de ce qu'on voulait vraiment
   savoir, et le banc de contraste l'a prouvé en mesurant ce que l'œil reçoit
   pour de bon : à 0,88, le plus petit texte de la carte tombait à huit
   pixels. Le seuil était donc juste au regard de lui-même et faux au regard
   du lecteur.

   Il se déduit maintenant : le plancher de lisibilité divisé par le plus
   petit corps dessiné sur la carte. Si l'un des deux change, le seuil suit —
   on ne peut plus rapetisser une carte sans que la grille s'en aperçoive.
   C'est la même règle que pour les marges : une valeur doit s'exprimer dans
   l'unité de ce qu'elle borne. */
const PX_PLANCHER = 11;            // ni norme ni caprice : Apple 11 pt, Google 11 sp
/* Le plus petit corps dessiné sur la carte. La rangée de pastilles partie,
   c'est de nouveau .carte-sous, à 0,74 rem. Cette ligne EST le contrat — si
   quelqu'un ajoute un texte plus petit sans la mettre à jour, le seuil
   devient faux en silence, et c'est exactement ce qui s'est produit. */
const PX_PLUS_PETIT = 0.74 * 16;
const SEUIL_LISIBLE = PX_PLANCHER / PX_PLUS_PETIT;
function rapportEcran(col, lignesVues) {
  const largeur = col * CARTE_L + (col - 1) * JEU;
  const cadre = lignesVues * CARTE_H + (lignesVues - 1) * JEU;
  const utile = 1 - bandeHaut() - bandeBas();
  const d = reculPour(largeur / 2 + CARTE_L * 0.12,
                      (cadre / 2 + CARTE_H * 0.10) / utile);
  const hMonde = 2 * d * Math.tan(camera.fov * Math.PI / 360);
  return (CARTE_H * innerHeight / hMonde) / CARTE_PX[1];
}
/* La plus fournie des grilles lisibles. À nombre de cartes égal, la plus
   grande ; si aucune ne passe le seuil — un écran minuscule —, la moins
   mauvaise, parce qu'il faut bien afficher quelque chose. */
function grilleVisible(n) {
  let choix = null, secours = { col: 1, vues: 1, r: rapportEcran(1, 1) };
  /* Jusqu'à SIX colonnes. Dix-sept chapitres sur trois rangées en
     demandent six ; s'arrêter à quatre, c'était s'interdire de tout
     montrer, quelle que soit la place disponible. */
  for (let col = 1; col <= Math.min(6, n); col++) {
    const lignesTotal = Math.ceil(n / col);
    /* Le plafond de rangées était de TROIS. Il datait des grandes cartes, où
       une quatrième n'aurait jamais tenu ; depuis, c'est lui qui limitait, et
       non le seuil. Sur un téléphone il ne restait que trois chapitres sur
       douze, à une échelle de 1,26 — c'est-à-dire avec de la place perdue
       devant les yeux. Le seuil protège déjà la lisibilité, mieux et par la
       mesure : un plafond en plus ne protège rien, il interdit. */
    for (let vues = 1; vues <= Math.min(5, lignesTotal); vues++) {
      const r = rapportEcran(col, vues);
      if (r > secours.r) secours = { col, vues, r };
      if (r < SEUIL_LISIBLE) continue;
      const cartes = col * vues;
      if (!choix || cartes > choix.cartes ||
          (cartes === choix.cartes && r > choix.r)) choix = { col, vues, cartes, r };
    }
  }
  return choix || secours;
}
/* La bande réservée au titre, en haut de l'écran. Sans elle, « Les fiches du
   BTS, dans un village » se posait sur la première rangée de cartes. On
   l'obtient en visant un point PLUS HAUT que le contenu : le monde se
   translate, et les cartes descendent dans le cadre. */
/* Deux bandes réservées : le titre en haut, la boussole en bas. Sans la
   seconde, les dernières cartes passaient derrière les pastilles des
   matières — on les voyait à travers, et on ne pouvait pas les cliquer. */
/* Les deux réserves : le titre en haut, la boussole en bas. Elles ne sont
   PAS des pourcentages choisis — on les MESURE sur les éléments eux-mêmes,
   à chaque cadrage.

   Un pourcentage se trompe toujours dans un sens ou dans l'autre : à 13 %
   le titre de « Réseaux, Systèmes & Cybersécurité » sur deux lignes mordait
   sur la première rangée de cartes ; à 20 % il aurait volé de la place aux
   cartes partout ailleurs. Et sur un téléphone, où la boussole se replie
   sur trois rangs, aucune valeur fixe n'aurait convenu. Le titre sait la
   place qu'il prend ; il suffit de la lui demander. */
function bandeHaut() {
  const r = $("pont-tete").getBoundingClientRect();
  return Math.min(0.36, Math.max(0.08, (r.bottom + 16) / innerHeight));
}
function bandeBas() {
  const b = $("boussole");
  if (b.hidden) return 0.16;
  const r = b.getBoundingClientRect();
  return Math.min(0.36, Math.max(0.08, (innerHeight - r.top + 12) / innerHeight));
}

function disposition(i) {
  const n = matieres[i].pole.chapitres.length;
  const grille = grilleVisible(n);
  const col = grille.col;
  const lignes = Math.ceil(n / col);
  /* Combien de rangées ? La question n'est pas « combien c'est joli » mais
     « combien TIENNENT ». Une carte est dessinée pour deux cents pixels de
     haut ; si on en empile trois là où il n'y a la place que pour deux, les
     trois arrivent aux deux tiers de leur taille — et c'est tout leur texte
     qui rétrécit avec. C'est exactement ce qu'JustAkhiraa a vu : « par contre
     c'est illisible ».
     On divise donc la hauteur RÉELLEMENT disponible par la hauteur d'une
     carte et de son jeu, et on n'en met pas une de plus. Mieux vaut quatre
     cartes lisibles et un défilement que douze vignettes. */
  const visibles = Math.min(lignes, grille.vues);
  return { n, col, lignes, visibles,
           largeur: col * CARTE_L + (col - 1) * JEU,
           hauteur: lignes * CARTE_H + (lignes - 1) * JEU,
           cadre: visibles * CARTE_H + (visibles - 1) * JEU };
}
/* Le mur : le plan courbe où se posent les cartes, DEVANT la façade du
   bâtiment. Il n'est pas plat — les colonnes des bords reculent et se
   tournent vers le centre. Sans cette courbure, la grille redevient une
   page collée sur le village, ce qu'JustAkhiraa a justement refusé. */
function murDe(i) {
  const m = matieres[i];
  const droite = new THREE.Vector3(m.n.z, 0, -m.n.x);
  const centre = m.pos.clone().addScaledVector(m.n, m.parvis);
  return { n: m.n, droite, centre, angle: Math.atan2(m.n.x, m.n.z) };
}

/* Où l'on se tient dans l'allée. Au premier chargement : à côté de la
   fontaine — JustAkhiraa : « en gros je suis à côté de la fontaine, tu vois ».
   En revenant d'un bâtiment : dans l'allée, DEVANT lui, tourné vers lui. On
   ne réapparaît pas au point de départ après chaque visite ; on ressort par
   la porte par laquelle on est entré, et c'est ce qui fait qu'on sait où
   l'on est. */
const DEPART = new THREE.Vector3(V.rFontaine + 13, HAUTEUR_OEIL, V.zFontaine + 62);
function placeAllee(i) {
  if (i < 0) {
    /* On ne vise pas le château : on vise un point entre la fontaine et
       lui. La fontaine entre alors dans le cadre par la gauche, le château
       reste au fond, et l'allée s'ouvre entre les deux — c'est la
       composition de l'allée d'Hyrule, et elle tient à ce seul décalage. */
    const c = capVers(DEPART, new THREE.Vector3(-26, 58, V.zChateau + 90));
    return { pos: DEPART.clone(), lacet: c.lacet, site: c.site };
  }
  const m = matieres[i];
  const p = m.pos.clone().addScaledVector(m.n, m.parvis + 34).setY(HAUTEUR_OEIL);
  p.x = Math.max(-V.demiAllee + 10, Math.min(V.demiAllee - 10, p.x));
  const c = capVers(p, m.pos.clone().setY(m.b.hauteur * 0.42));
  return { pos: p, lacet: c.lacet, site: c.site };
}

function placerCible(avant) {
  if (vue.matiere < 0) {
    const p = placeAllee(avant === undefined ? -1 : avant);
    cible.pos.copy(p.pos);
    cible.lacet = p.lacet;
    cible.site = p.site;
    return;
  }
  const m = matieres[vue.matiere];
  const { largeur, cadre, hauteur } = disposition(vue.matiere);
  const { n, centre } = murDe(vue.matiere);
  const utile = 1 - bandeHaut() - bandeBas();
  /* Les deux marges sont exprimées EN CARTES, pas en unités du monde : une
     cinquième de carte sur les côtés, un tiers en haut et en bas. Elles
     suivent donc l'échelle au lieu de la combattre. */
  const d = reculPour(largeur / 2 + CARTE_L * 0.12,
                      (cadre / 2 + CARTE_H * 0.10) / utile);
  vue.course = Math.max(0, hauteur - cadre);
  vue.defile = Math.min(vue.defile, vue.course);
  /* À mi-façade : assez haut pour que le bâtiment remplisse le fond, assez
     bas pour qu'on voie encore son pied et le sol. */
  vue.yBande = m.b.hauteur * 0.52;
  vue.demiBande = cadre / 2;
  const hv = 2 * d * Math.tan(camera.fov * Math.PI / 360);
  /* On vise plus BAS que la bande, d'un demi-écart entre les deux marges :
     le contenu remonte d'autant dans le cadre, et les deux réserves — le
     titre en haut, la boussole en bas — sont respectées. */
  const yRegard = vue.yBande + hv * (bandeHaut() - bandeBas()) / 2;
  cible.pos.copy(centre).addScaledVector(n, d).setY(yRegard);
  cible.lacet = Math.atan2(n.x, n.z);
  cible.site = 0;
}

function batirCartes() {
  viderCartes();
  const i = vue.matiere;
  if (i < 0) return;
  const { col, lignes, hauteur } = disposition(i);
  const { n, droite, centre, angle } = murDe(i);
  const m = matieres[i];

  m.pole.chapitres.forEach((ch, k) => {
    const el = carteChapitre(ch, m, k);
    const cx = k % col, cy = Math.floor(k / col);
    /* La dernière rangée est centrée si elle est incomplète : dix-sept
       cartes sur quatre colonnes, ce sont quatre fois quatre puis une — et
       celle-là va au milieu, pas à gauche. */
    const dansRangee = Math.min(col, m.pole.chapitres.length - cy * col);
    const largeurRangee = dansRangee * CARTE_L + (dansRangee - 1) * JEU;
    const dx = -largeurRangee / 2 + CARTE_L / 2 + cx * (CARTE_L + JEU);
    /* La rangée zéro se pose en haut de la bande visible, et les suivantes
       descendent. Ce qui sort de la bande s'efface — mais existe toujours,
       et remonte quand on fait défiler. */
    const dy = vue.yBande + vue.demiBande - CARTE_H / 2 - cy * (CARTE_H + JEU);
    const q = centre.clone().addScaledVector(droite, dx);
    const o = new CSS3DObject(el);
    o.position.set(q.x, dy + vue.defile, q.z);
    o.userData.y0 = dy;
    o.userData.phase = k * 0.7;
    o.rotation.y = angle;
    o.scale.setScalar(ECHELLE);
    groupeCartes.add(o);
    cartes3D.push(o);
  });

  /* L'entrée : les cartes apparaissent l'une après l'autre — mais seulement
     une fois ARRIVÉ. Les révéler au départ de la ruée, ce serait foncer dans
     un mur de cartes ; c'est la ruée qui appelle reveler() en touchant
     terre. */
  if (!ruee.actif) reveler();
}

/* ═══════════════════════════════════════ la ruée ════════════════════
   « Quand on clique sur un immeuble, on a un effet comme si on avançait vite
   et on arrive devant. » C'est le seul mouvement de caméra du monde, et il
   fait trois choses à la fois :

     — le TRAJET n'est pas une ligne droite mais une courbe qui passe par
       l'allée : en ligne droite, la caméra traverserait un bâtiment ;
     — la VITESSE part lentement, s'emballe au milieu, puis freine sec
       (une exponentielle dans les deux sens). C'est cette accélération qui
       se lit comme « on avance vite », pas la durée ;
     — le CHAMP s'ouvre de vingt-deux degrés au milieu du trajet et se
       referme. L'image s'étire vers les bords : c'est l'effet de vitesse
       lui-même, et il ne coûte rien.

   Si le lecteur a demandé moins d'animation, il reste le trajet, très
   court, et rien d'autre. */
const ruee = { actif: false, t: 0, duree: 1, p0: new THREE.Vector3(),
               p1: new THREE.Vector3(), ctrl: new THREE.Vector3(),
               lacet0: 0, dLacet: 0, site0: 0, dSite: 0, punch: 0 };
const tmpA = new THREE.Vector3();

function douceur(u) {
  /* Exponentielle dans les deux sens : départ posé, milieu très rapide,
     arrivée qui freine. Un simple cosinus donnerait un travelling de film
     d'entreprise — ici on veut la RUÉE. */
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u < 0.5 ? Math.pow(2, 20 * u - 10) / 2
                 : (2 - Math.pow(2, -20 * u + 10)) / 2;
}
function bezier(out, a, c, b, u) {
  const v = 1 - u;
  return out.set(v * v * a.x + 2 * v * u * c.x + u * u * b.x,
                 v * v * a.y + 2 * v * u * c.y + u * u * b.y,
                 v * v * a.z + 2 * v * u * c.z + u * u * b.z);
}

function lancerRuee() {
  ruee.p0.copy(oeil.pos);
  ruee.p1.copy(cible.pos);
  ruee.lacet0 = oeil.lacet;
  ruee.dLacet = ecartAngle(oeil.lacet, cible.lacet);
  ruee.site0 = oeil.site;
  ruee.dSite = cible.site - oeil.site;
  /* Le point de contrôle : à mi-chemin, ramené vers l'axe de l'allée et
     soulevé. C'est lui qui fait passer la caméra PAR l'allée au lieu de
     couper à travers une maison. */
  ruee.ctrl.addVectors(ruee.p0, ruee.p1).multiplyScalar(0.5);
  ruee.ctrl.x *= 0.34;
  ruee.ctrl.y += Math.max(30, ruee.p0.distanceTo(ruee.p1) * 0.10);
  ruee.t = 0;
  ruee.duree = CALME ? 0.3 : (0.75 + Math.min(0.55, ruee.p0.distanceTo(ruee.p1) / 1100));
  ruee.punch = CALME ? 0 : 22;
  ruee.actif = true;
  document.body.classList.add("en-ruee");
}

/* ═══════════════════════════════════════ aller d'un lieu à l'autre ══ */
function allerA(i) {
  const avant = vue.matiere;
  const change = i !== avant;
  vue.matiere = i;
  if (change) vue.defile = 0;
  document.body.classList.remove("entre");
  $("tout").hidden = i < 0;
  [...$("chips").children].forEach((b, k) =>
    b.setAttribute("aria-pressed", String(k === i)));
  document.body.classList.toggle("en-matiere", i >= 0);
  groupeEnseignes.visible = i < 0;
  if (i >= 0) { idMarche = null; rangerManche(); }
  matieres.forEach((m) => { m.vise = false;
    if (m.enseigne) m.enseigne.classList.remove("survol"); });
  toile.style.cursor = "";

  if (i < 0) {
    const nc = matieres.reduce((s, m) => s + m.pole.chapitres.length, 0);
    $("pont-tete").innerHTML =
      `<div class="accueil-tete"><h1>Les fiches du BTS,<br><em>dans un village</em></h1>` +
      `<p>Cinq matières, cinq bâtiments, ${nc} chapitres. Cliquez sur celui qui` +
      ` vous intéresse — ou sur son nom en bas : on vous y emmène, et la fiche` +
      ` se lit sur place.</p></div>`;
    /* L'accent de l'allée suit l'heure, comme ceux des matières : un bleu de
       nuit posé sur la plaque claire du jour se lit à 1,6:1. */
    document.documentElement.style.setProperty(
      "--c-matiere", heure === "jour" ? "#14618F" : "#6FC8FF");
  } else {
    const m = matieres[i];
    const nf = m.pole.chapitres.reduce((s, c) => s + c.fiches.length, 0);
    $("pont-tete").innerHTML =
      `<h1>${ech(m.pole.titre)}</h1><p>${m.L.lieu} · ` +
      `${m.pole.chapitres.length} chapitres · ${nf} fiches</p>`;
    document.documentElement.style.setProperty("--c-matiere", m.css);
  }
  placerCible(avant);
  if (change) lancerRuee();
  batirCartes();
  direPuisTaire();
  taireSousTitre();
}

/* Défiler le long de la façade quand il y a plus de trois rangées : c'est la
   CAMÉRA qui monte, pas une page qui glisse. */
function defiler(dy) {
  if (vue.matiere < 0 || vue.course <= 0) return;
  /* Les positions sont réécrites à chaque image de toute façon, pour le
     flottement : il suffit donc de changer le décalage. */
  vue.defile = Math.max(0, Math.min(vue.course, vue.defile + dy));
}
addEventListener("wheel", (e) => {
  if (!lecture.hidden || ruee.actif) return;
  if (vue.matiere < 0) { avancerDe(-e.deltaY * 0.10); return; }
  defiler(e.deltaY * 0.06);
}, { passive: true });
let toucheY = null;
addEventListener("touchstart", (e) => {
  toucheY = e.touches.length === 1 ? e.touches[0].clientY : null;
}, { passive: true });
addEventListener("touchmove", (e) => {
  if (toucheY === null || vue.matiere < 0 || !lecture.hidden) return;
  const y = e.touches[0].clientY;
  defiler((toucheY - y) * 0.18);
  toucheY = y;
}, { passive: true });
addEventListener("touchend", () => { toucheY = null; });

/* ── La boussole : cinq noms, toujours là ─────────────────────────────
   Les silhouettes disent la matière à qui connaît déjà le village. La
   boussole la dit à tout le monde, dès la première seconde, et elle donne un
   chemin au clavier. */
const chips = $("chips");
matieres.forEach((m) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.style.setProperty("--c", m.css);
  b.innerHTML = `<i></i>${ech(m.pole.titre)}<em>${m.pole.chapitres.length}</em>`;
  b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", () => allerA(m.i));
  b.addEventListener("pointerenter", () => marquerSurvol(m.i, true));
  b.addEventListener("pointerleave", () => marquerSurvol(m.i, false));
  chips.appendChild(b);
});
$("tout").addEventListener("click", () => allerA(-1));

/* ═══════════════════════════════════════ le jour et la nuit ═════════ */
const CLE_HEURE = "ciel-monde-heure";
let heure = "nuit";
function poserHeure(h) {
  heure = h;
  const H = HEURES[h];
  poserSoleil(H);
  uCiel.turbidity.value = H.turbidite;
  uCiel.rayleigh.value = H.rayleigh;
  uCiel.mieCoefficient.value = H.mie;
  uCiel.mieDirectionalG.value = H.mieG;
  uCiel.cloudCoverage.value = H.nuages;
  uCiel.cloudDensity.value = H.densiteNuages;
  uCiel.cloudElevation.value = 0.55;
  /* Les valeurs par défaut de Sky.js supposent un « time » en millisecondes ;
     la boucle passe des SECONDES. Sans ces deux réglages les nuages sont
     figés — un ciel de carte postale au lieu d'un ciel. */
  uCiel.cloudScale.value = 0.00026;
  uCiel.cloudSpeed.value = 0.00006;
  /* JustAkhiraa : « si possible mettre un soleil ». Sky.js sait dessiner le disque,
     il était simplement laissé éteint : le ciel avait la LUMIÈRE du soleil et
     sa couleur, mais pas l'astre. On l'allume de jour seulement — la nuit, le
     soleil est sous l'horizon à -8°, et un disque qui perce le sol n'est plus
     un soleil, c'est une lampe posée dans l'herbe. La lune, elle, a déjà son
     propre volume dans la scène. */
  uCiel.showSunDisc.value = h === "jour" ? 1 : 0;
  rendu.toneMappingExposure = H.expo;
  cuireEnvironnement();
  scene.environmentIntensity = H.reflets;

  scene.fog.color.setHex(H.brumeCouleur);
  scene.fog.near = H.brume[0];
  scene.fog.far = H.brume[1];
  hemi.color.setHex(H.ciel);
  hemi.groundColor.setHex(H.sol);
  hemi.intensity = H.ambiance;
  soleil.color.setHex(H.couleurSoleil);
  soleil.intensity = H.soleil;
  /* La contre-lumière ne débouche plus les faces sombres : les ombres
     portées doivent rester lisibles. Elle ne sert qu'à ce qu'une face
     entièrement à l'ombre garde une silhouette. */
  contre.intensity = h === "jour" ? 0.22 : 0.12;

  matEtoiles.opacity = H.etoiles;
  matEtoiles.visible = H.etoiles > 0;
  /* Les monuments du fond sont repeints : hors brume, ils ne pâliraient pas
     tout seuls, et une tour Eiffel bleu-jour sous un ciel de nuit se lirait
     comme une image collée derrière la montagne. */
  teinterHorizon(H);
  /* Les lucioles ne sortent que la nuit, les oiseaux que le jour. C'est
     aussi une économie : ce qui est invisible n'est plus animé. */
  lucioles.visible = h === "nuit";
  oiseaux.visible = h === "jour";
  papillons.visible = h === "jour";
  lune.material.opacity = H.lune;
  lune.visible = H.lune > 0;
  FENETRES.forEach((m) => m.color.setHex(H.fenetres));
  LANTERNES.forEach((m) => m.color.setHex(H.lanternes));
  LUEURS.forEach((m) => { m.opacity = H.veilleuse; });
  CONES.forEach((m) => { m.opacity = H.cone; });
  FLAQUES.forEach((m) => { m.opacity = H.flaque; });

  /* Les accents changent de teinte, pas seulement le fond : les couleurs
     lumineuses de la nuit seraient des taches pâles sur un ciel clair. */
  matieres.forEach((m) => {
    const c = (h === "jour" ? COULEURS_JOUR : COULEURS)[m.pole.matiere] ?? 0x9FB6DF;
    m.css = "#" + c.toString(16).padStart(6, "0");
    m.accents.forEach((mat) => mat.color.setHex(c));
    m.anneau.material.color.setHex(c);
    if (m.enseigne) m.enseigne.style.setProperty("--c", m.css);
  });
  document.body.classList.toggle("jour", h === "jour");
  $("btn-heure").setAttribute("aria-label",
    h === "jour" ? "Passer à la nuit" : "Passer en plein jour");
  [...chips.children].forEach((b, k) => b.style.setProperty("--c", matieres[k].css));
  /* L'allée a son accent, elle aussi : sans cette ligne, changer d'heure
     depuis l'allée laissait le titre peint d'un bleu de nuit sur une plaque
     de jour. Une teinte qui suit l'heure doit la suivre DANS LES DEUX SENS. */
  if (vue.matiere < 0)
    document.documentElement.style.setProperty(
      "--c-matiere", h === "jour" ? "#14618F" : "#6FC8FF");
  if (vue.matiere >= 0) {
    document.documentElement.style.setProperty("--c-matiere", matieres[vue.matiere].css);
    cartes3D.forEach((o) => o.element.style.setProperty("--c", matieres[vue.matiere].css));
  }
  try { localStorage.setItem(CLE_HEURE, h); } catch (e) {}
}
$("btn-heure").addEventListener("click", () =>
  poserHeure(heure === "jour" ? "nuit" : "jour"));

/* ═══════════════════════════════════════ viser et cliquer ═══════════ */
const rayon = new THREE.Raycaster();
const souris = new THREE.Vector2(-2, -2);

function majSouris(e) {
  souris.x = (e.clientX / innerWidth) * 2 - 1;
  souris.y = -(e.clientY / innerHeight) * 2 + 1;
}
toile.addEventListener("pointerleave", () => { souris.set(-2, -2); viserBatiment(); });

/* Quel bâtiment est sous le pointeur ? Le rayon touche une tuile, une
   poutre, un créneau — jamais « le bâtiment ». On remonte donc les parents
   jusqu'à celui qui porte un numéro de matière. Sans cette remontée, seul le
   premier enfant de chaque groupe aurait été cliquable. */
function matiereSous(objet) {
  for (let o = objet; o; o = o.parent)
    if (o.userData && o.userData.matiere !== undefined) return o.userData.matiere;
  return -1;
}
function boutiqueSous(objet) {
  for (let o = objet; o; o = o.parent)
    if (o.userData && o.userData.boutique !== undefined) return o.userData.boutique;
  return -1;
}
function viserBatiment() {
  if (vue.matiere >= 0 || ruee.actif) return;
  rayon.setFromCamera(souris, camera);
  const t = rayon.intersectObjects(groupesBat.concat(groupesBout), true)[0];
  const b = t ? boutiqueSous(t.object) : -1;
  /* Une échoppe visée se signale comme un bâtiment : le curseur change et la
     ligne du haut donne son nom. Sans ce retour, rien ne dit qu'une porte
     s'ouvre — et une porte dont on ne sait pas qu'elle s'ouvre est un mur. */
  if (b >= 0) {
    marquerSurvol(-1, false);
    toile.style.cursor = "pointer";
    nommerBoutique(b);
    return;
  }
  marquerSurvol(t ? matiereSous(t.object) : -1, !!t);
}

/* Un même geste sert à deux choses, et c'est la DISTANCE parcourue qui les
   sépare : en dessous de neuf pixels c'est un clic, au-delà c'est un
   glissé. Sans ce seuil, tourner la tête sélectionnerait un bâtiment à
   chaque fois qu'on relâche. */
let glisse = null, idRegard = null, idMarche = null, baseManche = null;

/* Le quart inférieur gauche appartient au pouce qui marche ; le reste au
   doigt qui regarde. Ce partage n'existe qu'au toucher : à la souris, tout
   l'écran regarde, et on marche au clavier. */
const zoneMarche = (e) => e.pointerType === "touch" && vue.matiere < 0 &&
  e.clientX < innerWidth * 0.46 && e.clientY > innerHeight * 0.44;

toile.addEventListener("pointerdown", (e) => {
  if (idMarche === null && zoneMarche(e)) {
    idMarche = e.pointerId;
    baseManche = { x: e.clientX, y: e.clientY };
    montrerManche(e.clientX, e.clientY);
    try { toile.setPointerCapture(e.pointerId); } catch (x) {}
    return;
  }
  if (idRegard !== null) return;
  idRegard = e.pointerId;
  glisse = { x: e.clientX, y: e.clientY, parcouru: 0 };
  try { toile.setPointerCapture(e.pointerId); } catch (x) {}
  majSouris(e);
});
toile.addEventListener("pointermove", (e) => {
  if (e.pointerId === idMarche) {
    bougerManche(e.clientX - baseManche.x, e.clientY - baseManche.y);
    return;
  }
  if (e.pointerId !== idRegard) { majSouris(e); return; }
  majSouris(e);
  if (!glisse) return;
  const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
  glisse.x = e.clientX; glisse.y = e.clientY;
  glisse.parcouru += Math.abs(dx) + Math.abs(dy);
  if (vue.matiere >= 0 || ruee.actif) return;
  toile.classList.add("tenu");
  tourner(-dx * 0.0030, -dy * 0.0026);
});
const lacher = (e) => {
  if (e.pointerId === idMarche) {
    idMarche = null;
    rangerManche();
    try { toile.releasePointerCapture(e.pointerId); } catch (x) {}
    return null;
  }
  if (e.pointerId !== idRegard || !glisse) return null;
  const parcouru = glisse.parcouru;
  glisse = null;
  idRegard = null;
  toile.classList.remove("tenu");
  try { toile.releasePointerCapture(e.pointerId); } catch (x) {}
  return parcouru;
};
toile.addEventListener("pointercancel", lacher);
toile.addEventListener("pointerup", (e) => {
  const parcouru = lacher(e);
  if (parcouru === null || parcouru > 9 || vue.matiere >= 0 || ruee.actif) return;
  majSouris(e);
  rayon.setFromCamera(souris, camera);
  /* Les deux familles sont interrogées d'un seul coup, et c'est le plus
     PROCHE qui gagne. Les interroger l'une après l'autre ferait passer une
     échoppe devant le château qu'elle cache, ou l'inverse — et le résultat
     dépendrait de l'ordre des deux lignes, ce qui n'est pas une règle. */
  const t = rayon.intersectObjects(groupesBat.concat(groupesBout), true)[0];
  if (!t) return;
  const b = boutiqueSous(t.object);
  if (b >= 0) { ouvrirBoutique(b); return; }
  const i = matiereSous(t.object);
  if (i >= 0) allerA(i);
});

addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!lecture.hidden) { fermerLecture(); return; }
    if (!aide.hidden) { aide.hidden = true; return; }
    if (vue.matiere >= 0) allerA(-1);
    return;
  }
  if (!lecture.hidden) return;
  /* Dans l'allée, les mêmes touches marchent au lieu de naviguer. Ce n'est
     pas ambigu : dans l'allée il n'y a rien à faire défiler, et sur un
     parvis on ne marche pas — on choisit un chapitre. */
  if (vue.matiere < 0 && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const sens = TOUCHES[e.code];
    if (sens) { appui.add(sens); e.preventDefault(); return; }
    if (e.key === "Shift") { appui.add("vite"); return; }
    /* Espace fait sauter. Le « preventDefault » n'est pas une précaution :
       sans lui, la barre d'espace fait aussi défiler la page, et l'on saute
       en voyant le monde glisser sous soi. */
    if (e.code === "Space" && !e.repeat) { sauter(); e.preventDefault(); return; }
  }
  if (e.key === "ArrowRight") allerA(Math.min(matieres.length - 1, vue.matiere + 1));
  else if (e.key === "ArrowLeft") allerA(vue.matiere <= 0 ? -1 : vue.matiere - 1);
  else if (e.key === "ArrowDown") defiler(CARTE_H + JEU);
  else if (e.key === "ArrowUp") defiler(-(CARTE_H + JEU));
  else if (e.key === "?" || e.key === "h") aide.hidden = !aide.hidden;
});
addEventListener("keyup", (e) => {
  const sens = TOUCHES[e.code];
  if (sens) appui.delete(sens);
  if (e.key === "Shift") appui.delete("vite");
});
/* Quitter la fenêtre en marchant laisserait la touche « enfoncée » pour
   toujours, et on repartirait tout seul en revenant. */
addEventListener("blur", () => appui.clear());

/* ═══════════════════════════════════════ lire une fiche ═════════════
   « Ensuite on choisit notre chapitre et ensuite le cours. » La fiche se lit
   ICI : elle est allée chercher la page du site, on en garde le corps, et on
   retire ce qui n'a pas de sens dans le village — sa navigation, son
   sommaire, ses boutons qui dépendent de scripts absents. Le lien vers la
   page ordinaire reste, en second. */
const cache = new Map();

function ouvrirLecture(d) {
  const { chap, pole, couleur } = d;
  lecture.style.setProperty("--c", couleur);
  $("lecture-matiere").textContent = pole.titre;
  $("lecture-titre").textContent = chap.titre;
  $("lecture-sous").textContent = chap.sous || "";
  /* Une fiche garde son lien À LA FIN de sa prose : là, il est la suite
     naturelle de la lecture, et le corps est une colonne ordinaire où il ne
     coûte rien. Le bouton d'en-tête ne sert qu'aux outils. */
  $("lecture-grand").hidden = true;
  const onglets = $("lecture-onglets");
  onglets.innerHTML = "";
  chap.fiches.forEach((f, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = f[0];
    b.setAttribute("aria-pressed", String(i === 0));
    b.addEventListener("click", () => {
      [...onglets.children].forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      afficherFiche(f[1]);
    });
    onglets.appendChild(b);
  });
  lecture.hidden = false;
  lecture.classList.add("glisse");
  requestAnimationFrame(() => lecture.classList.remove("glisse"));
  if (chap.fiches[0]) afficherFiche(chap.fiches[0][1]);
}

/* ── Entrer dans une échoppe ────────────────────────────────────────────
   Une fiche est INJECTÉE dans la fenêtre : on lui retire son script, parce
   qu'on ne fait pas tourner le code d'une page étrangère dans la sienne. Un
   OUTIL, lui, n'est que son script — un convertisseur sans JavaScript est un
   tableau vide, et l'atelier C est un compilateur WebAssembly de soixante
   mégaoctets. L'injecter reviendrait à livrer une coquille.

   Il entre donc dans un « iframe » : le navigateur lui donne son propre
   document, ses propres scripts et son propre cloisonnement, et l'outil
   fonctionne exactement comme sur le site. C'est la seule solution qui ne
   demande ni de dupliquer l'outil, ni de lui faire confiance. */
function ouvrirBoutique(i) {
  const b = BOUTIQUES[i];
  const c = "#" + b.couleur.toString(16).padStart(6, "0");
  lecture.style.setProperty("--c", c);
  $("lecture-matiere").textContent = "Boutique";
  $("lecture-titre").textContent = b.nom;
  $("lecture-sous").textContent = b.tenancier;
  $("lecture-onglets").innerHTML = "";
  /* ── Le bonjour se dit, puis il s'efface ───────────────────────────────
     « quand j'ouvre un outil j'ai un message qui prend de la place, c'est pas
     ergonomique. » La phrase du tenancier était un pavé posé AU-DESSUS de
     l'outil : elle repoussait vers le bas la seule chose qu'on venait
     chercher, et elle restait là pour toujours alors qu'on ne la lit
     qu'une fois.

     Elle devient ce qu'elle est : une parole. Posée par-dessus le haut de
     l'outil, elle s'efface d'elle-même au bout de six secondes — ou au
     premier clic, pour qui lit vite. L'outil, lui, prend toute la hauteur
     dès la première image. Ce qu'on dit une fois ne doit pas occuper la
     place de ce qu'on utilise tout le temps. */
  $("lecture-corps").innerHTML =
    `<div class="boutique">` +
      `<iframe class="boutique-outil" src="../${b.outil}" title="${ech(b.nom)}"` +
      ` loading="lazy"></iframe>` +
      `<p class="bonjour" role="status">` +
        `<span class="bonjour-qui" aria-hidden="true">☻</span>` +
        `<span class="bonjour-dit">${ech(b.bonjour)}</span></p>` +
    `</div>`;
  /* ── Le lien « en grand » monte dans l'en-tête ───────────────────────────
     « ouvrir l'outil en grand c'est moche et ça prend beaucoup de place à
     l'outil, tu veux pas mettre un bouton plus discret et en haut ? »

     Mesuré avant de corriger : le lien faisait **158 × 676 pixels**. Six cent
     soixante-seize de haut pour une ligne de texte, et cent cinquante-huit de
     large — 11,4 % du panneau — pris à l'outil. La cause n'est pas la taille
     du bouton, c'est sa POSITION : le corps du panneau passe en « display:
     flex » quand il ne contient qu'une boutique, et le lien, frère de la
     boutique dans ce flux, devenait une colonne étirée sur toute la hauteur.
     Un même élément ne veut pas dire la même chose dans un bloc et dans une
     rangée flexible.

     Il quitte donc le flux : c'est une commande de FENÊTRE, pas un morceau du
     contenu, et sa place est là où se trouve déjà l'autre commande de fenêtre
     — à côté de la croix. La boutique récupère la totalité du panneau. */
  const grand = $("lecture-grand");
  grand.href = "../" + b.outil;
  grand.hidden = false;
  const dit = $("lecture-corps").querySelector(".bonjour");
  if (dit) {
    const taire = () => dit.classList.add("parti");
    dit.addEventListener("click", taire);
    /* Le compte à rebours est rangé sur l'élément : si l'on ouvre une autre
       boutique avant la fin, le nouveau panneau ne se fait pas taire par le
       minuteur de l'ancien. Un minuteur sans propriétaire finit toujours par
       agir sur ce qu'il n'a pas créé. */
    dit.dataset.minuteur = setTimeout(taire, 6000);
  }
  lecture.hidden = false;
  lecture.classList.add("glisse");
  requestAnimationFrame(() => lecture.classList.remove("glisse"));
}

function fermerLecture() {
  if (lecture.hidden) return;
  lecture.classList.add("glisse");
  setTimeout(() => { lecture.hidden = true; }, 280);
}
$("lecture-fermer").addEventListener("click", fermerLecture);

/* ── Le QCM, qui marche pour de bon ─────────────────────────────────────
   JustAkhiraa : « les QCM sont moches et fonctionnent pas en 3D ». Les deux moitiés
   de la phrase avaient la même cause : le script de la page du QCM est retiré
   à l'injection — c'est une règle saine, on ne fait pas tourner le script d'une
   page étrangère —, et sans lui les boutons ne répondaient plus. J'avais
   « compensé » en ouvrant toutes les explications, c'est-à-dire en affichant le
   corrigé sous chaque énoncé. Un QCM dont les réponses sont écrites n'est pas
   un QCM difficile à utiliser : ce n'est plus un QCM.

   Or la page n'a pas besoin de son script : son balisage porte déjà tout. La
   bonne réponse est dans « data-bon », l'explication dans « .qcm-why », le
   rang dans « data-i ». Vingt lignes suffisent donc à le faire fonctionner
   ici, et elles ne dépendent que de ce qui est écrit dans le HTML — si le
   gabarit change, elles cessent de trouver leurs crochets au lieu de mentir. */
function brancherQcm(corps) {
  const questions = [...corps.querySelectorAll(".qcm-q")];
  if (!questions.length) return;
  const score = corps.querySelector(".qcm-tete .sc");
  const jauge = corps.querySelector(".qcm-tete .av > span");
  let bons = 0, faites = 0;
  const compter = () => {
    if (score) score.textContent = bons + " / " + questions.length;
    if (jauge) jauge.style.width = (faites / questions.length * 100) + "%";
  };
  compter();
  for (const q of questions) {
    const bon = Number(q.dataset.bon);
    const choix = [...q.querySelectorAll(".qcm-opt")];
    const pourquoi = q.querySelector(".qcm-why");
    for (const o of choix) o.addEventListener("click", () => {
      /* On ne répond qu'une fois : rouvrir une question déjà faite
         permettrait de « corriger » son score après coup, ce qui vide le
         QCM de son seul intérêt — savoir ce qu'on sait. */
      if (q.dataset.fait) return;
      q.dataset.fait = "1";
      faites++;
      if (Number(o.dataset.i) === bon) { bons++; o.classList.add("juste"); }
      else { o.classList.add("faux"); if (choix[bon]) choix[bon].classList.add("juste"); }
      for (const x of choix) x.disabled = true;
      if (pourquoi) pourquoi.hidden = false;
      compter();
    });
  }
}

async function afficherFiche(url) {
  const corps = $("lecture-corps");
  corps.scrollTop = 0;
  if (cache.has(url)) { corps.innerHTML = cache.get(url); brancherQcm(corps); return; }
  corps.innerHTML = '<p class="lecture-attente">Lecture de la fiche…</p>';
  try {
    const r = await fetch("../" + url, { cache: "force-cache" });
    if (!r.ok) throw new Error(r.status);
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    const main = doc.querySelector("main.corps") || doc.querySelector("main");
    if (!main) throw new Error("corps introuvable");

    main.querySelectorAll(
      "script, nav.voisins, nav.sommaire, .sommaire, .copier, .essayer, .flottant")
        .forEach((n) => n.remove());
    /* Les liens de la fiche sont relatifs à SON dossier : on les réécrit pour
       qu'ils partent du monde, sinon ils mènent tous à côté. */
    const base = "../" + url.split("/").slice(0, -1).join("/") + "/";
    main.querySelectorAll("[href], [src]").forEach((n) => {
      for (const a of ["href", "src"]) {
        const v = n.getAttribute(a);
        if (!v || /^(https?:|#|mailto:|data:)/.test(v)) continue;
        n.setAttribute(a, new URL(base + v, location.href).pathname);
      }
      if (n.tagName === "A") n.setAttribute("target", "_blank");
    });
    /* Les quiz et les QCM ont besoin du script de la page, absent ici : on
       ouvre les réponses plutôt que de laisser des boutons morts. */
    main.querySelectorAll(".quiz button").forEach((n) => n.remove());
    /* Les quiz du cours perdent leur bouton, donc on ouvre leur réponse. Le
       QCM, lui, GARDE ses boutons : son balisage porte la bonne réponse dans
       « data-bon », et c'est tout ce qu'il faut pour le faire fonctionner ici
       (voir brancherQcm). Ouvrir ses explications d'office, comme le faisait
       la version précédente, revenait à publier le corrigé au-dessus de
       l'énoncé — JustAkhiraa : « les QCM sont moches et fonctionnent pas en 3D ».
       Ils ne fonctionnaient pas parce qu'on leur avait donné les réponses. */
    main.querySelectorAll(".reponse").forEach((n) => n.removeAttribute("hidden"));

    const html = main.innerHTML +
      `<a class="lecture-ouvrir" href="../${url}" target="_blank" rel="noopener">` +
      `Ouvrir cette fiche sur le site</a>`;
    cache.set(url, html);
    corps.innerHTML = html;
    brancherQcm(corps);
  } catch (e) {
    corps.innerHTML =
      '<p class="lecture-echec">Cette fiche n\'a pas pu être lue ici.</p>' +
      `<a class="lecture-ouvrir" href="../${url}" target="_blank" rel="noopener">` +
      `Ouvrir la fiche sur le site</a>`;
  }
}

/* ── L'aide, montrée une fois ────────────────────────────────────────── */
const CLE_AIDE = "ciel-monde-aide-4";
$("btn-aide").addEventListener("click", () => { aide.hidden = !aide.hidden; });
$("aide-ok").addEventListener("click", () => {
  aide.hidden = true;
  try { localStorage.setItem(CLE_AIDE, "1"); } catch (e) {}
});

/* ═══════════════════════════════════════ la boucle ══════════════════ */
function reveler() {
  requestAnimationFrame(() => requestAnimationFrame(
    () => document.body.classList.add("entre")));
}
function fovVoulu() { return camera.aspect < 0.95 ? FOV_ETROIT : FOV_LARGE; }

/* ── La résolution qui s'ajuste d'elle-même ─────────────────────────────
   L'idée vient de l'écosystème de three.js — c'est l'« AdaptiveDpr » de
   drei —, et c'est la seule de cette liste de projets qui serve vraiment
   ici : les autres imposeraient React, un framework entier ou un visualiseur
   de modèles, c'est-à-dire exactement la dépendance que ce dépôt refuse.
   Trente lignes suffisent à la reprendre, sans rien charger.

   Le principe : une machine lente ne doit pas rendre moins de village, elle
   doit le rendre sur moins de pixels. Un portable d'entrée de gamme dessine
   deux fois trop de pixels pour son GPU et rame ; en tombant à 1 pixel par
   point au lieu de 2, il retrouve soixante images par seconde et perd un peu
   de finesse sur les bords — un échange que personne ne remarque en marchant,
   et que tout le monde remarque à l'inverse.

   Deux précautions valent la peine d'être dites :

     · on mesure une MÉDIANE sur soixante images, pas la dernière. Une image
       isolée à 40 ms arrive à chaque changement d'heure, quand
       l'environnement se recuit ; réagir à celle-là ferait clignoter la
       résolution ;
     · on ne remonte qu'après une marge nette (13 ms contre 22 ms pour
       descendre). Sans cet écart, la résolution oscillerait entre deux
       valeurs, chacune provoquant l'autre. */
const ECHELLE_MAX = Math.min(devicePixelRatio || 1, 2);
const PALIERS = [ECHELLE_MAX, Math.max(1, ECHELLE_MAX * 0.75), 1, 0.75];
let palier = 0, duree = [], depuisChangement = 0;

function ajusterResolution(dt) {
  depuisChangement += dt;
  duree.push(dt * 1000);
  if (duree.length < 60) return;
  const trie = duree.slice().sort((a, b) => a - b);
  const mediane = trie[30];
  duree.length = 0;
  /* Une seconde de répit après chaque changement : le temps que le pilote
     réalloue ses tampons, les premières images sont lentes par construction,
     et les prendre pour un verdict ferait descendre en cascade. */
  if (depuisChangement < 1) return;
  const avant = palier;
  if (mediane > 22 && palier < PALIERS.length - 1) palier++;
  else if (mediane < 13 && palier > 0) palier--;
  if (palier === avant) return;
  depuisChangement = 0;
  rendu.setPixelRatio(PALIERS[palier]);
  rendu.setSize(innerWidth, innerHeight);
}

let t0 = performance.now();

function image(now) {
  const dt = Math.min((now - t0) / 1000, 0.05);
  t0 = now;
  const t = now / 1000;

  if (ruee.actif) {
    ruee.t += dt;
    const u = Math.min(1, ruee.t / ruee.duree);
    const e = douceur(u);
    oeil.pos.copy(bezier(tmpA, ruee.p0, ruee.ctrl, ruee.p1, e));
    oeil.lacet = ruee.lacet0 + ruee.dLacet * e;
    oeil.site = ruee.site0 + ruee.dSite * e;
    /* Le champ s'ouvre au milieu du trajet : c'est ça, la sensation de
       vitesse. Un déplacement rapide à champ constant se lit comme une
       coupure, pas comme une course. */
    const cloche = Math.sin(Math.PI * u);
    camera.fov = fovVoulu() + ruee.punch * cloche;
    camera.updateProjectionMatrix();
    document.documentElement.style.setProperty("--ruee", cloche.toFixed(3));
    if (u >= 1) {
      ruee.actif = false;
      camera.fov = fovVoulu();
      camera.updateProjectionMatrix();
      document.documentElement.style.setProperty("--ruee", "0");
      document.body.classList.remove("en-ruee");
      reveler();
    }
  } else if (vue.matiere < 0) {
    /* Dans l'allée, c'est le marcheur qui tient la caméra. */
    marcher(dt);
    /* Le saut vient APRÈS le pas : « marcher » repose l'œil à sa hauteur à
       chaque déplacement, et le saut a le dernier mot. Dans l'autre ordre,
       on ne saute que sur place. */
    avancerSaut(dt);
  } else {
    /* Sur un parvis, elle rejoint sa place, amortie. L'amortissement est
       indépendant du nombre d'images par seconde : sur un écran à 120 Hz,
       un simple lerp(0.1) irait deux fois plus vite. */
    const k = 1 - Math.pow(0.0016, dt);
    oeil.pos.lerp(cible.pos, k);
    oeil.lacet += ecartAngle(oeil.lacet, cible.lacet) * k;
    oeil.site += (cible.site - oeil.site) * k;
  }
  poserCamera();

  /* L'eau, les nuages, et le petit peuple d'objets qui bougent. */
  eauMat.uniforms.t.value = t;
  eauLacMat.uniforms.t.value = t;
  eauCouranteMat.uniforms.t.value = t;
  uCiel.time.value = t;
  if (EMBRUN) {
    const a = EMBRUN.geometry.attributes.position, vi = EMBRUN.userData.vit;
    for (let i = 0; i < a.count; i++) {
      const k = i * 3;
      a.array[k + 1] -= vi[i] * dt;
      if (a.array[k + 1] < 5) a.array[k + 1] = 24 + Math.random() * 3;
    }
    a.needsUpdate = true;
  }
  for (const r of TOURNE) r.o.rotation[r.axe] = t * r.v;
  for (const b of BALANCE) b.o.rotation[b.axe || "z"] = Math.sin(t * b.v) * b.a;
  for (const f of FUMEES) {
    const p = f.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * 13;
      if (y > 250) y = 150;
      p.setY(i, y);
      p.setX(i, p.getX(i) + dt * 2.6);
    }
    p.needsUpdate = true;
  }
  for (const b of BALISES) b.material.opacity = Math.sin(t * 2.4) > 0.55 ? 1 : 0.12;

  /* L'anneau au sol du bâtiment visé : il grandit en opacité, il ne
     clignote pas. Un état qui apparaît d'un coup se lit comme une erreur
     d'affichage ; un état qui monte se lit comme une réponse. */
  for (const m of matieres) {
    const voulu = m.vise && vue.matiere < 0 ? 0.62 : 0;
    m.survol += (voulu - m.survol) * Math.min(1, dt * 9);
    m.anneau.material.opacity = m.survol;
    m.anneau.visible = m.survol > 0.01;
  }

  /* La bande de netteté : une carte trop haut ou trop bas s'efface. C'est ce
     qui permet d'avoir dix-sept chapitres devant une façade sans que la
     moitié vienne se poser sur le titre — et ça se lit comme une profondeur
     de champ, ce qui est exactement l'effet voulu. Les cartes effacées
     cessent aussi de recevoir les clics : on ne clique pas ce qu'on ne
     voit pas. */
  if (cartes3D.length) {
    for (const o of cartes3D) {
      o.position.y = o.userData.y0 + vue.defile
                   + Math.sin(t * 0.9 + o.userData.phase) * 0.55;
    }
    const centreY = vue.yBande || 0;
    /* La bande est FRANCHE : une rangée de plus, à demi visible, venait se
       poser sur la boussole — on la voyait à travers les pastilles sans
       pouvoir la cliquer. Ce qui sort de la bande s'efface en une demi-
       carte, pas en une carte et demie. */
    const dedans = (vue.demiBande || 0) + CARTE_H * 0.12;
    const fondu = CARTE_H * 0.55;
    for (const o of cartes3D) {
      const dy = Math.abs(o.position.y - centreY);
      const f = dy <= dedans ? 1 : Math.max(0, 1 - (dy - dedans) / fondu);
      if (o.userData.f !== f) {
        o.userData.f = f;
        o.element.style.setProperty("--f", f.toFixed(2));
        o.element.style.pointerEvents = f < 0.35 ? "none" : "auto";
      }
    }
  }

  /* ── Le petit peuple ────────────────────────────────────────────────
     Rien ici n'est indispensable, et c'est pourtant ce qui sépare une
     maquette d'un lieu : des gens qui vont quelque part, des lucioles au
     ras des haies, des pétales qui tombent, des oiseaux qui tournent. */
  for (const v of VIVANTS) {
    const w = v.v / v.portee;
    v.o.position.set(v.x, Math.abs(Math.sin(t * 3.4 + v.phase)) * v.saut,
                     v.z0 + Math.sin(t * w + v.phase) * v.portee);
    /* Tourné vers là où il va : la dérivée du mouvement, pas sa position. */
    v.o.rotation.y = Math.cos(t * w + v.phase) > 0 ? 0 : Math.PI;
    if (v.queue) v.queue.rotation.z = Math.sin(t * 2.6 + v.phase) * 0.45;
    /* Le mouton broute. Une tête qui descend et remonte lentement, et la
       bête cesse d'être un meuble qui glisse : c'est le mouvement le moins
       cher du village, et l'un des deux qu'on remarque. */
    if (v.broute && v.tete)
      v.tete.rotation.x = 0.36 + Math.sin(t * 0.55 + v.phase) * 0.34;
  }
  /* ── Les promeneurs et les marchands ────────────────────────────────
     Ils avancent LE LONG d'un chemin et font demi-tour au bout. Le cap vient
     du chemin lui-même, donc un marcheur ne traverse jamais un virage en
     ligne droite — c'est la différence entre suivre une route et glisser
     dessus. */
  for (const v of PROMENEURS) {
    v.s += v.v * v.sens * dt;
    if (v.s > v.L) { v.s = v.L; v.sens = -1; }
    if (v.s < 0)   { v.s = 0;   v.sens = 1; }
    const p = surChemin(v.pts, v.s);
    if (!p) continue;
    v.g.position.set(p.x, Math.abs(Math.sin(t * 3.2 + v.s * 0.1)) * 0.7, p.z);
    v.g.rotation.y = p.cap + (v.sens > 0 ? Math.PI : 0);
    if (v.charrette) {
      /* La charrette suit à douze unités derrière, et elle est tournée
         comme lui : une charrette qui garde son cap pendant que son
         marchand tourne est la faute qu'on remarque tout de suite. */
      const q = surChemin(v.pts, Math.max(0, Math.min(v.L, v.s - v.sens * 13)));
      if (q) { v.charrette.position.set(q.x, 0, q.z);
               v.charrette.rotation.y = q.cap + (v.sens > 0 ? Math.PI : 0); }
    }
  }

  /* ── Les papillons ──────────────────────────────────────────────────── */
  if (papillons.visible) {
    for (const p of papillons.children) {
      const d = p.userData;
      p.position.set(d.cx + Math.cos(t * d.w1 + d.p) * d.r1,
                     d.y + Math.sin(t * d.w2 * 1.7 + d.p) * 5,
                     d.cz + Math.sin(t * d.w2 + d.p) * d.r2);
      /* Tourné vers son déplacement, et les ailes qui battent en V. */
      p.rotation.y = -t * d.w1 + d.p;
      const b = Math.abs(Math.sin(t * d.bat + d.p)) * 1.15;
      d.a1.rotation.y = b; d.a2.rotation.y = -b;
    }
  }

  /* ── Les scénettes ────────────────────────────────────────────────────
     Une bulle ne s'affiche qu'à PORTÉE DE VOIX, et son opacité suit la
     distance : elle apparaît en s'approchant au lieu de surgir. Le seuil est
     à quarante-cinq unités, la largeur de l'allée — de l'autre trottoir on
     voit qu'on parle, on ne lit pas ce qui se dit. */
  for (const s of SCENETTES) {
    const d = Math.hypot(oeil.pos.x - s.x, oeil.pos.z - s.z);
    const pres = Math.max(0, Math.min(1, (58 - d) / 13));
    s.bulle.el.style.opacity = pres.toFixed(2);
    if (pres > 0.05) {
      /* On ne change de réplique que si elle est LUE : faire tourner un texte
         invisible, c'est arriver au milieu d'une phrase qu'on n'a pas vue
         commencer. */
      s.bulle.prochaine -= dt;
      if (s.bulle.prochaine <= 0) {
        s.bulle.k = (s.bulle.k + 1) % s.bulle.lignes.length;
        s.bulle.el.textContent = s.bulle.lignes[s.bulle.k];
        s.bulle.prochaine = 3.2 + (s.bulle.k % 3) * 0.9;
      }
    }
    if (s.danseur) {
      /* La danse : un rebond, un balancement, et un quart de tour qui va et
         vient. Trois sinusoïdes de périodes différentes — la même période
         partout donnerait un métronome, pas un danseur. */
      /* Le report du poids : un pied, puis l'autre. « pas » vaut −1 ou +1
         selon le côté, et tout le reste en découle — l'inclinaison suit le
         côté où l'on pose, le tassement arrive quand le poids arrive (donc
         au DOUBLE de la cadence), et le buste tourne avec un temps de
         retard. Une seule horloge, quatre conséquences : c'est ce qui fait
         qu'on lit un corps et non quatre réglages. */
      const pas = Math.sin(t * 3.1);
      s.danseur.position.x = s.danseur.userData.x0 + pas * 1.8;
      s.danseur.position.y = 0;            // on danse au sol, on ne saute pas
      s.danseur.rotation.z = -pas * 0.16;
      s.danseur.rotation.y = s.danseur.userData.r0 + Math.sin(t * 3.1 - 0.5) * 0.42;
      /* Les genoux : le corps se tasse au moment où le pied touche. */
      s.danseur.scale.y = s.danseur.userData.s0 * (1 - Math.abs(Math.cos(t * 3.1)) * 0.045);
      for (const n of s.notes) {
        n.t += dt;
        const u = (n.t % 2.6) / 2.6;
        n.s.position.y = 13 + u * 22;
        n.s.position.x = s.x + 9 + Math.sin(u * 7 + n.t) * 4;
        /* Elle naît, elle monte, elle s'efface : une note qui disparaît net
           en haut de sa course se lit comme un défaut d'affichage. */
        n.s.material.opacity = Math.sin(u * Math.PI) * 0.75;
      }
    }
  }
  for (const c of CHATS_ASSIS) {
    /* Trois mouvements très lents, et rien de plus : la queue qui balaie, la
       tête qui suit quelque chose qu'on ne voit pas, et le souffle — deux
       pour cent de hauteur. On ne voit pas le souffle, on le sent ; c'est la
       différence entre un chat et un bibelot. */
    c.queue.rotation.z = Math.sin(t * 1.15 + c.phase) * 0.42;
    c.queue.rotation.x = c.queueX + Math.sin(t * 0.7 + c.phase) * 0.16;
    c.tete.rotation.y = Math.sin(t * 0.3 + c.phase) * 0.72;
    c.tete.rotation.x = Math.sin(t * 0.23 + c.phase * 1.7) * 0.12;
    c.corps.scale.y = c.echelleY * (1 + Math.sin(t * 1.8 + c.phase) * 0.02);
  }
  if (lucioles.visible) {
    const a = lucioles.geometry.attributes.position, b = lucioles.userData.base;
    for (let i = 0; i < a.count; i++) {
      const k = i * 3;
      a.array[k]     = b[k]     + Math.sin(t * 0.66 + i) * 4.6;
      a.array[k + 1] = b[k + 1] + Math.sin(t * 1.27 + i * 2.1) * 3.1;
      a.array[k + 2] = b[k + 2] + Math.cos(t * 0.58 + i * 1.7) * 4.6;
    }
    a.needsUpdate = true;
  }
  {
    const a = petales.geometry.attributes.position, vi = petales.userData.vit;
    for (let i = 0; i < a.count; i++) {
      const k = i * 3;
      a.array[k + 1] -= vi[i] * dt;
      a.array[k]     += Math.sin(t * 0.8 + i) * 7 * dt;
      a.array[k + 2] += Math.cos(t * 0.6 + i) * 7 * dt;
      if (a.array[k + 1] < 0) a.array[k + 1] = 132;
    }
    a.needsUpdate = true;
  }
  if (oiseaux.visible) {
    for (const o of oiseaux.children) {
      const d = o.userData, ang = t * d.v + d.p;
      o.position.set(Math.cos(ang) * d.r, d.y + Math.sin(ang * 2.1) * 13,
                     -60 + Math.sin(ang) * d.r);
      o.rotation.y = -ang;
      const bat = Math.sin(t * d.bat + d.p) * 0.55;
      d.a1.rotation.z = bat;
      d.a2.rotation.z = -bat;
    }
  }

  /* L'avion et l'étoile filante : le seul endroit du monde qui a besoin de
     savoir l'heure pour bouger. Une étoile filante en plein jour serait un
     trait blanc inexplicable au milieu du bleu. */
  CIEL_VIVANT.avancer(dt, heure === "nuit");

  viserBatiment();
  rendu.render(scene, camera);
  /* Les deux couches partagent la caméra à l'image près : c'est ce qui fait
     que les cartes appartiennent au village au lieu de flotter dessus. */
  rendu3D.render(monde3D, camera);
  requestAnimationFrame(image);
}

/* ── Se recadrer, y compris quand le téléphone tourne ───────────────────
   JustAkhiraa : « j'aimerais bien sur tél, si je tourne mon écran, que l'écran
   s'adapte ». Il le faisait déjà — mais mal, et sur iOS pas du tout.

   Deux corrections. D'abord « orientationchange » : Safari le déclenche AVANT
   d'avoir fini de retourner la fenêtre, si bien qu'un recadrage immédiat lit
   les anciennes dimensions et fige le village en travers. On recadre donc
   trois fois — tout de suite, puis après deux images, puis après un tiers de
   seconde —, ce qui coûte trois recalculs et garantit d'attraper la bonne.

   Ensuite la hauteur : « innerHeight » sur iOS inclut les barres d'outils,
   même rétractées. C'est la même erreur que « 100vh » côté feuille de style,
   et elle donne un village rendu plus haut que ce qu'on voit — donc décalé.
   « visualViewport » donne la hauteur réellement visible, et il prévient
   quand elle change. */
/* La toile est posée en « inset: 0 » avec une largeur et une hauteur de
   100 % : elle suit donc le viewport de MISE EN PAGE, celui que donnent
   innerWidth et innerHeight — et le tampon de dessin doit faire exactement la
   même taille, sans quoi l'image est étirée ou posée dans un coin. C'est ce
   qui est arrivé en essayant de la caler sur « visualViewport » : cette
   mesure-là décrit ce qu'on VOIT après pincement, pas la boîte qu'occupe la
   toile. Elle reste utile comme signal — elle prévient quand les barres d'iOS
   bougent — mais pas comme mesure. */
function recadrer() {
  const l = innerWidth, h = innerHeight;
  camera.aspect = l / h;
  camera.fov = fovVoulu();
  camera.updateProjectionMatrix();
  rendu.setSize(l, h);
  rendu3D.setSize(l, h);
  /* Le nombre de colonnes dépend de la FORME de l'écran : il faut refaire
     le mur de cartes, pas seulement recadrer. */
  placerCible();
  batirCartes();
}

addEventListener("resize", recadrer);
if (window.visualViewport) visualViewport.addEventListener("resize", recadrer);
addEventListener("orientationchange", () => {
  recadrer();
  requestAnimationFrame(() => requestAnimationFrame(recadrer));
  setTimeout(recadrer, 320);
});

/* ── Ouverture ───────────────────────────────────────────────────────── */
camera.fov = fovVoulu();
camera.updateProjectionMatrix();
batirEnseignes();
let heureDepart = "nuit";
try { heureDepart = localStorage.getItem(CLE_HEURE) === "jour" ? "jour" : "nuit"; }
catch (e) {}
poserHeure(heureDepart);
allerA(-1);
oeil.pos.copy(cible.pos);
oeil.lacet = cible.lacet;
oeil.site = cible.site;
poserCamera();
rendu.render(scene, camera);
hud.hidden = false;
boussole.hidden = false;
chargement.classList.add("parti");
setTimeout(() => { chargement.hidden = true; }, 600);
reveler();
try { if (!localStorage.getItem(CLE_AIDE)) aide.hidden = false; }
catch (e) { aide.hidden = false; }

/* Une poignée pour la mise au point, et rien d'autre : de quoi lire depuis
   la console d'un navigateur ce que le village coûte et ce qu'il contient.
   Elle ne donne aucun pouvoir qu'un visiteur n'ait déjà — la page est
   publique, son code est lisible — et elle évite d'avoir à republier le
   site pour répondre à « combien d'appels de rendu ? ». */
/* « sousTitrer » et « taireSousTitre » sont là pour le banc de contraste :
   le sous-titre n'existe que pendant cinq secondes, après un survol. Un banc
   qui ne peut pas le FAIRE APPARAÎTRE ne le mesure jamais — et déclare que
   tout va bien. */
/* ── Ce que CE navigateur-ci fournit vraiment ───────────────────────────
   JustAkhiraa : « ça ne ressemble pas à la même chose avec Firefox et Edge ; Firefox
   est plus beau et a plus de trucs. » Je n'ai ni son Firefox ni son Edge, et
   deviner à distance ce qu'une carte graphique accorde à un navigateur, c'est
   exactement le genre de raisonnement qui a fait perdre une journée trois fois
   dans ce dépôt. On ne devine donc pas : on relève.

   Les cinq lignes qui décident de l'aspect du village, dans l'ordre où elles
   comptent — le pilote réellement utilisé (une repli logiciel ne dit pas son
   nom autrement), la version de WebGL, le nombre de bits de profondeur (16 ou
   24 : c'est lui qui fait clignoter deux surfaces proches), la possibilité de
   cuire l'environnement en virgule flottante (sans elle, le cuivre et le métal
   perdent leur reflet), et le réglage « réduire les animations » du système,
   qui éteint à lui seul l'inclinaison des cartes et l'élan de la ruée.

   À lancer dans les deux navigateurs : CIEL.diagnostic() */
function diagnostic() {
  const gl = rendu.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const flottant = !!(gl.getExtension("EXT_color_buffer_float")
                   || gl.getExtension("EXT_color_buffer_half_float")
                   || gl.getExtension("OES_texture_float"));
  return {
    navigateur: navigator.userAgent,
    pilote: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "(masqué)",
    webgl: rendu.capabilities.isWebGL2 ? 2 : 1,
    bitsDeProfondeur: gl.getParameter(gl.DEPTH_BITS),
    virguleFlottante: flottant,
    ombres: rendu.shadowMap.enabled + " / " + rendu.shadowMap.type,
    pixels: rendu.getPixelRatio(),
    animationsReduites: CALME,
    appelsDeRendu: rendu.info.render.calls,
    triangles: rendu.info.render.triangles,
    textureMax: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
}

/* « ouvrirBoutique » et « BOUTIQUES » sortent ici pour une raison précise :
   l'overlay d'une échoppe ne s'atteint autrement qu'en visant une façade au
   rayon, dans une scène 3D, à la souris. Aucun banc ne sait faire ça — et
   c'est la quatrième fois qu'un banc se révèle aveugle à un état que le site
   sait pourtant produire. Un état qu'on ne peut pas atteindre depuis
   l'extérieur n'est pas un état vérifié : c'est un état qu'on croit bon. */
window.CIEL = { rendu, scene, camera, soleil, oeil, vue, matieres, HEURES,
                poserHeure, allerA, ciel, sousTitrer, taireSousTitre,
                BOUTIQUES, ouvrirBoutique, fermerLecture,
                /* Le relief et le pas sortent pour la même raison que le
                   reste : un espace marchable ne se vérifie pas en relisant
                   une constante, il se vérifie en MARCHANT dedans. */
                RELIEF, hauteurSol, glisserContre, OBSTACLES,
                diagnostic };

requestAnimationFrame(image);
