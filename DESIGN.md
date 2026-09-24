---
name: BTS CIEL — fiches de révision
description: Un cahier de révision qui se règle à la main du lecteur — quarante thèmes, zéro dépendance.
colors:
  papier: "#FDF5E6"
  carte: "#FFFFFF"
  carte-creuse: "#FBF6EE"
  bord: "#E6DCCE"
  bord-fort: "#D8CBB8"
  encre: "#2F2F2F"
  encre-douce: "#6B6257"
  encre-tenue: "#8A8175"
  encre-forte: "#1F1F1F"
  sur-accent: "#FFFFFF"
  matiere-dev: "#2D5A27"
  matiere-reseau: "#005B96"
  matiere-maths: "#8B0000"
  matiere-anglais: "#C05621"
  matiere-culture: "#6A0DAD"
  matiere-projets: "#B8860B"
  semantique-vert: "#2D5A27"
  semantique-ambre: "#B8860B"
  semantique-rouge: "#A32E2E"
  semantique-violet: "#6A0DAD"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(2rem, 6.5vw, 3.4rem)"
    fontWeight: 800
    lineHeight: 1.06
    letterSpacing: "-0.028em"
  headline:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "clamp(2rem, 5.4vw, 3.05rem)"
    fontWeight: 780
    lineHeight: 1.22
    letterSpacing: "-0.032em"
  title:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "1.62rem"
    fontWeight: 740
    lineHeight: 1.22
    letterSpacing: "-0.018em"
  body:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.72
    letterSpacing: "normal"
  label:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.6364rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.12em"
  mono:
    fontFamily: "ui-monospace, SF Mono, JetBrains Mono, Menlo, Consolas, monospace"
    fontSize: "0.9091rem"
    fontWeight: 600
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  pilule: "999px"
spacing:
  xs: "0.45rem"
  sm: "0.7rem"
  md: "1.05rem"
  lg: "1.7rem"
  xl: "2.6rem"
components:
  bouton-quiz:
    backgroundColor: "{colors.matiere-reseau}"
    textColor: "{colors.sur-accent}"
    rounded: "7px"
    padding: "0.48rem 1.05rem"
  bouton-quiz-hover:
    backgroundColor: "#00426C"
    textColor: "{colors.sur-accent}"
  carte-matiere:
    backgroundColor: "{colors.carte}"
    textColor: "{colors.encre}"
    rounded: "{rounded.lg}"
    padding: "1.35rem 1.4rem 1.25rem"
  chapitre:
    backgroundColor: "{colors.carte}"
    textColor: "{colors.encre}"
    rounded: "{rounded.md}"
    padding: "0.9rem 1.1rem"
  champ-recherche:
    backgroundColor: "{colors.carte}"
    textColor: "{colors.encre}"
    rounded: "12px"
    padding: "0.82rem 1rem 0.82rem 2.7rem"
  encart:
    backgroundColor: "{colors.carte-creuse}"
    textColor: "{colors.encre}"
    rounded: "{rounded.md}"
    padding: "1.05rem 1.25rem"
  pastille-niveau:
    backgroundColor: "#EAF2E8"
    textColor: "{colors.semantique-vert}"
    rounded: "{rounded.pilule}"
    padding: "0.16rem 0.6rem"
  coche-progression:
    backgroundColor: "{colors.carte-creuse}"
    textColor: "{colors.encre-tenue}"
    rounded: "9px"
    size: "34px"
---

<!-- Ce fichier est une SOURCE, pas une page publiée à la main.
     Master : BTS-CIEL-1/_pilotage/publication/DESIGN.md
     publier.py le recopie à la racine du dépôt public à chaque génération.
     Ne jamais le modifier depuis bts-ciel-CFA-Insta/ : « vider() » l'efface. -->

# Design System: BTS CIEL — fiches de révision

## Overview

**Creative North Star: « L'établi qu'on règle »**

Un établi ne cherche pas à être remarqué. Il est posé, stable, et il se règle à
la main de celui qui travaille dessus. C'est exactement ce que fait ce site :
il affiche un cahier de révision sur papier crème, puis il laisse le lecteur le
repeindre en quarante thèmes, changer la taille du texte, la largeur de ligne,
la police et l'interligne — sans qu'aucun réglage ne puisse casser la lisibilité
de ce qu'il lit.

**L'identité de ce système n'est pas une couleur : c'est sa capacité à se
repeindre entièrement sans rien casser.** Le thème crème est le visage par
défaut, pas la marque. La marque est la discipline qui rend les trente-neuf
autres possibles : aucune couleur n'est jamais écrite en dur dans une règle, et
toute valeur de texte est mesurée contre le fond réel de chaque thème.

Cette discipline n'est pas une intention, elle est vérifiée : `verification/contraste.html`
mesure 400 combinaisons dans un vrai navigateur, `verification/qa.html` en mesure 1 129
autres pour le débordement et les cibles tactiles. Une couleur qui échoue est
recalculée, jamais estimée à l'œil.

**Key Characteristics:**

- Papier crème, jamais de blanc pur en fond (`#FDF5E6`).
- Une couleur par matière, portée par l'attribut `[data-matiere]`, jamais par une classe.
- Quarante thèmes : 12 clairs, 12 sombres, 16 issus de jeux et de vieux écrans.
- Quatre axes de confort de lecture, indépendants du thème.
- Aucune police téléchargée, aucun CDN, aucune étape de construction.
- Schémas en SVG écrits à la main, nets à l'impression.

## Colors

Une palette chaude et basse en saturation, sur laquelle se pose une couleur de
matière franche. Les six couleurs de matière sont le seul élément saturé de la
page : tout le reste est du papier et de l'encre.

### Primary

- **Bleu réseau** (`#005B96`) : l'accent par défaut de `:root`, et la couleur du
  pôle Réseaux. Il tient les surfaces — fonds de bouton, filets, étiquettes de
  langage sur les blocs de code. Pour poser du texte sur fond pâle, c'est
  `#00426C` qui sert : un accent clair en texte sur fond clair tombait à 3:1.

### Secondary

Les cinq autres couleurs de matière. Elles ne cohabitent jamais sur une même
page : une fiche porte une matière, donc une couleur.

- **Vert développement** (`#2D5A27`) · **Rouge mathématiques** (`#8B0000`) ·
  **Ocre anglais** (`#C05621`) · **Violet culture générale** (`#6A0DAD`) ·
  **Or projets** (`#B8860B`).

### Tertiary

Quatre teintes sémantiques, qui disent un type d'encart et rien d'autre :
**vert** (`#2D5A27`, le saviez-vous), **ambre** (`#B8860B`, analogie et
correction), **rouge** (`#A32E2E`, piège d'examen), **violet** (`#6A0DAD`,
méthode).

### Neutral

- **Papier crème** (`#FDF5E6`) : le fond de page. Jamais de blanc pur.
- **Carte** (`#FFFFFF`) et **carte creuse** (`#FBF6EE`) : les deux niveaux de surface.
- **Bord** (`#E6DCCE`) et **bord fort** (`#D8CBB8`) : le trait, et le trait appuyé.
- **Encre** (`#2F2F2F`), **encre douce** (`#6B6257`), **encre tenue** (`#8A8175`) :
  le texte courant, le texte secondaire, la légende.

### Named Rules

**La règle des trois tons.** Un accent sert à deux choses opposées : de fond,
avec du texte par-dessus, et de texte, sur un fond pâle. Un seul ton ne peut pas
satisfaire les deux. Chaque accent porte donc trois valeurs — `--accent` pour la
surface, `--sur-accent` pour ce qu'on pose dessus, `--accent-sombre` pour le
texte — toutes mesurées. Sans cela, l'accent « or » posait du doré sur du crème :
2,2:1.

**La règle du fond le plus clair.** Quand un thème repose sur une texture ou un
dégradé, `--papier` ne vaut pas sa teinte moyenne mais **sa zone la plus
claire**. Sur le thème Voxel, c'est `#503928`, relevé sur l'image elle-même : une
moyenne aurait laissé passer des textes illisibles au-dessus des blocs clairs.

**La règle de la variable unique.** Aucune couleur n'est écrite en dur dans une
règle de composant. Un `color: #1F1F1F` sur `strong` a rendu le texte invisible
sur les douze ambiances sombres le jour où elles sont arrivées ; quarante
couleurs littérales ont dû être converties en variables. Une nouvelle règle qui
nomme une couleur est un futur bug de thème.

## Typography

**Display / Body Font :** la pile système native — `-apple-system`,
`BlinkMacSystemFont`, `Segoe UI`, `Roboto`. Aucune police n'est téléchargée.
**Mono Font :** `ui-monospace`, `SF Mono`, `Menlo`, `Consolas`.

**Character :** neutre et fonctionnelle par défaut, parce que le lecteur peut la
remplacer. Trois familles sont offertes en réglage — système, serif
(`ui-serif, Georgia`), monospace — et certains thèmes imposent la leur : Terminal,
Matrix, Retro CRT et Voxel passent tout le site en chasse fixe.

### Hierarchy

- **Display** (800, `clamp(2rem, 6.5vw, 3.4rem)`, 1.06, `-0.028em`) : le titre
  d'accueil, une seule fois par site.
- **Headline** (780, `clamp(2rem, 5.4vw, 3.05rem)`, `-0.032em`) : le titre d'une fiche.
- **Title** (740, `1.62rem`) : une section de cours, précédée de son numéro en
  chasse fixe dans la couleur de matière.
- **Body** (400, `1rem`, 1.72) : le texte courant, limité à 76 caractères par ligne.
- **Label** (700, `0.6364rem`, `0.12em`, capitales) : les étiquettes courtes —
  sommaire, résumé flash, sources, niveaux d'exercice.

### Named Rules

**La règle du corps en rem.** Le corps de texte est en `1rem`, jamais en pixels.
Écrit `16.5px`, il ignorait le réglage de taille : celui-ci agit sur la racine,
donc seulement sur les `rem`. Le lecteur déplaçait le curseur et rien ne bougeait.

**La règle de la casse du code.** `code, kbd, samp` neutralisent explicitement
`text-transform` et `letter-spacing`. Hérités d'un titre en capitales, ils ont
rendu 325 commandes en majuscules — et une commande shell en majuscules est une
commande fausse.

**La règle de la ligne courte.** Le corps ne dépasse pas `76ch` par défaut, et le
lecteur peut descendre à `62ch` ou monter à `92ch`. Une ligne longue n'est pas un
gain de place, c'est une ligne qu'on relit.

## Layout

Deux gabarits, et deux seulement.

**Une fiche** est une grille de deux colonnes : un sommaire collant de `268px`,
puis le corps. À 900 px et moins, le sommaire se replie en accordéon au-dessus du
texte. La fiche de révision, elle, n'a qu'une colonne : elle est faite pour être
imprimée.

**Une page de navigation** — l'accueil, les cinq index de matière — est une
grille fluide de `repeat(auto-fit, minmax(270px, 1fr))`, qui passe à `300px` au
delà de 1 100 px et à `330px` au delà de 1 600 px.

Le rythme vertical est en `rem`, par pas de `0.45 / 0.7 / 1.05 / 1.7 / 2.6`.

**Largeur de lecture réglable.** Quatre crans agissent à la fois sur la mesure du
texte et sur le conteneur : `62ch / 980px`, `76ch / 1220px`, `92ch / 1480px`,
puis pleine largeur. C'est le réglage qui rend les grands écrans utiles.

### Named Rules

**La règle des trois largeurs mesurées.** Toute page est vérifiée à 375, 768 et
1440 px, et les pages de référence sont recroisées avec les quarante thèmes. Un
débordement horizontal n'est pas un défaut esthétique : c'est une page qui glisse
sous le doigt.

**La règle des 34 pixels.** Toute commande — lien de fil d'Ariane, bouton
« Copier », coche de progression, retour au sommaire — fait au moins 34 px de
haut. Quatorze d'entre elles étaient sous ce seuil et se rataient au pouce.

## Elevation & Depth

Le trait porte, l'ombre accompagne. La limite d'une carte est sa bordure de 1 px ;
l'ombre est une atmosphère chaude et très basse, pas une information. C'est ce qui
permet à un thème de la supprimer entièrement — Voxel et Détermination posent
`--ombre: none` et restent parfaitement lisibles, parce que rien d'essentiel n'y
était confié.

Sur les ambiances sombres, l'ombre est nettement renforcée : une ombre chaude à
4 % d'opacité ne se voit pas sur un fond noir.

### Shadow Vocabulary

- **Ombre de repos** (`0 1px 2px rgba(60,45,25,.04), 0 4px 16px rgba(60,45,25,.05)`) :
  les cartes, les tableaux, les encarts, au repos.
- **Ombre haute** (`0 2px 6px rgba(60,45,25,.06), 0 12px 32px rgba(60,45,25,.07)`) :
  ce qui flotte réellement au-dessus — feuille de réglages, liste de résultats,
  carte survolée.

## Shapes

Des angles doucement adoucis, jamais ronds : `6px` pour une pastille de code,
`10px` pour une carte ou un encart, `16px` pour un grand conteneur, et la pilule
(`999px`) réservée aux étiquettes courtes — niveau d'exercice, promo, nombre de
chapitres.

Le rayon est une variable de thème, pas une constante : les seize thèmes de jeux
le ramènent à `0px` (Voxel, Matrix, Détermination, Androïde) ou le poussent à
`26px` (Grand Large). Une règle qui écrit un rayon en dur casse cette liberté.

Les schémas sont des SVG écrits à la main, centrés, sans fond propre, avec une
légende en encre tenue. Ils survivent à l'impression et au changement de thème.

## Components

### Boutons

- **Shape :** `7px` — un peu plus serré que les cartes, pour qu'un bouton ne se
  confonde pas avec un conteneur.
- **Primary :** fond `--accent`, texte `--sur-accent`, `0.48rem 1.05rem`. C'est
  le bouton « Afficher la réponse » d'un quiz, le seul bouton plein des fiches.
- **Hover / Active :** le fond passe à `--accent-sombre` ; à l'appui, le bouton
  descend d'un pixel (`translateY(1px)`). Deux signaux courts, jamais de rebond.
- **Secondaire :** les liens d'un chapitre (« Cours », « Exercices », « Fiche »)
  sont des boutons creux — fond `--carte-creuse`, trait `--bord` — qui prennent
  l'accent pâle au survol.

### Cards / Containers

- **Carte de matière :** rayon `16px`, fond `--carte`, trait `--bord`, et un filet
  vertical de 3 px en `--accent` sur le bord gauche. Au survol elle monte de 3 px
  et le filet s'épaissit à 5 px : deux signaux, l'un de forme, l'autre de couleur.
- **Ligne de chapitre :** rayon `10px`, grille `44px / 1fr / auto / auto` —
  numéro, texte, liens, coche. Sous 620 px, les liens passent à la ligne.
- **Encart :** rayon `10px`, fond et trait tirés de sa teinte sémantique. Six
  types : analogie, boîte à outils, piège d'examen, le saviez-vous, méthode, et
  **corrigé** — ce dernier seul porte un filet gauche de 4 px, parce qu'il signale
  une erreur rectifiée dans le document d'origine.

### Inputs / Fields

- **Champ de recherche :** rayon `12px`, fond `--carte`, trait `--bord-fort`,
  loupe en SVG inline à gauche. Au focus, le trait prend l'accent et un anneau de
  3 px en accent pâle apparaît.
- **Sélecteur de thème :** `appearance: none`, chevron dessiné en deux dégradés
  linéaires — aucune image, aucune police d'icônes.

### Navigation

En-tête collante, fond du papier à 86 % avec un flou d'arrière-plan, trait
inférieur de 1 px. Le logo de la classe à gauche, deux liens à droite, puis la
bascule jour/nuit et les réglages. Sous 480 px le sous-titre disparaît ; sous
420 px, le libellé entier cède la place et le logo identifie seul le site.

Sur une fiche il n'y a pas d'en-tête : deux boutons flottants en bas à droite,
44 × 44 px, empilés hors de la zone du pouce.

### Feuille de réglages (composant signature)

Une feuille qui monte du bas sur téléphone (`translateY(101%)` → `0`, courbe
`cubic-bezier(.32,.72,0,1)`), et qui devient un panneau ancré en bas à droite au
delà de 720 px. Elle contient tout ce qui se règle : un sélecteur unique pour les
quarante thèmes groupés en quatre familles, puis quatre rangées de pastilles —
taille, largeur, police, interligne — et deux interrupteurs.

C'est le composant qui porte l'étoile polaire : c'est là que l'établi se règle.

## Do's and Don'ts

### Do:

- **Do** passer par une variable pour toute couleur, tout rayon et toute ombre.
  Une valeur littérale dans une règle de composant est un bug de thème différé.
- **Do** donner trois valeurs à tout nouvel accent : la surface, ce qu'on pose
  dessus, et le texte sur fond pâle.
- **Do** mesurer un contraste dans un navigateur avant de l'annoncer
  (`verification/contraste.html`), transparences composées comprises.
- **Do** tenir 34 px de haut sur toute commande, et vérifier à 375 px.
- **Do** écrire les tailles de texte en `rem`, pour qu'elles suivent le réglage
  du lecteur.
- **Do** neutraliser `text-transform` sur tout élément susceptible de contenir du
  code.
- **Do** charger **une seule feuille de style** pour tout le site. Une règle
  définie dans une feuille absente d'une page ne s'applique pas — et cela s'est
  vu : les boutons flottants des 156 fiches ont tenu longtemps à 16 × 22 px.

### Don't:

- **Don't** ajouter une dépendance : pas de CDN, pas de framework, pas de police
  téléchargée, pas d'étape de construction. Bootstrap est un chapitre de cours,
  pas un outil de ce projet.
- **Don't** masquer un encart « 🔧 Corrigé ». Il signale qu'une erreur du document
  d'origine a été rectifiée ; le cacher reviendrait à cacher l'avertissement.
- **Don't** confier une information à l'ombre seule. Un thème a le droit de la
  supprimer.
- **Don't** mettre un titre en `display: flex` s'il peut contenir un `<code>` :
  le mode flex le rend insécable et la ligne pousse la page hors de l'écran.
- **Don't** insérer une commande à l'intérieur d'un bloc qui sera masqué. Un
  bouton « Copier » et un bouton « Voir le corrigé » s'y sont retrouvés enfermés,
  chacun à son tour.
- **Don't** juger une couleur à l'œil. Sept thèmes semblaient lisibles ; six
  échouaient à la mesure.
