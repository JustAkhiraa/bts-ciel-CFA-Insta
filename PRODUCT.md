# Product

<!-- impeccable:product-schema 1 -->

<!-- Ce fichier est une SOURCE, pas une page publiée à la main.
     Master : BTS-CIEL-1/_pilotage/publication/PRODUCT.md
     publier.py le recopie à la racine du dépôt public à chaque génération.
     Ne jamais le modifier depuis bts-ciel-CFA-Insta/ : « vider() » l'efface. -->

## Platform

web

## Users

Les étudiants d'une classe de **BTS CIEL option A** (Cybersécurité, Informatique
et Réseaux, Électronique), promo 2025-2027, au CFA INSTA. Le site est écrit par
l'un d'eux, pour les autres.

Le public visé s'arrête là. Le lien est public et indexable, mais **aucun effort
n'est consacré à la découvrabilité** : pas de référencement, pas de page d'accueil
conçue pour un visiteur extérieur. Un étudiant d'une autre promo qui tombe dessus
peut s'en servir ; ce n'est pas pour lui que c'est écrit.

Conséquence durable : le contenu n'a pas à se présenter. Il a à être **retrouvé
vite par quelqu'un qui sait déjà ce qu'il cherche**.

## Product Purpose

Retrouver un cours en quelques secondes, sans fouiller un dossier de PDF, de
photos de tableau et de polycopiés empilés sur une année.

Chaque chapitre existe en trois fiches au rôle distinct :

| Fiche | Ce qu'elle sert |
|---|---|
| `cours.html` | le cours complet, avec schémas, analogies et pièges d'examen |
| `exercices.html` | les exercices, énoncé et correction repliable |
| `fiche-revision.html` | recto-verso dense, imprimable, à relire la veille |

Le succès se mesure à une chose : **la veille d'un contrôle, l'étudiant trouve ce
qu'il cherche sans se demander où il l'a rangé.**

À côté des fiches, une section **Outils** rassemble ce qui se *calcule* au lieu de
se relire, **rangé par matière** — comme le reste du site, et avec la couleur
d'accent de chacune. Un outil sert pendant qu'on travaille, pas avant : il doit
tenir dans un écran et répondre sans qu'on lise sa notice.

Une matière sans outil n'apparaît pas dans ce sommaire, qui dit donc aussi ce qui
reste à fabriquer.

## Positioning

Ce ne sont pas les cours officiels, et aucun document d'origine n'est
redistribué — ni PDF de professeur, ni polycopié, ni copie d'élève. Ce sont des
notes réécrites.

Ce qu'un site de cours voisin ne pourrait pas reprendre : **toute affirmation
chiffrée est recalculée par machine.** Les masques de sous-réseau, les
probabilités, les décomptes de mots des comptes rendus d'anglais, les renvois de
ligne des citations, la sortie des programmes en C — recalculés, recomptés ou
recompilés à chaque modification. Une valeur juste une fois le reste : une
retouche qui la casserait est signalée le jour même.

Corollaire assumé : là où un document d'origine contenait une erreur, elle est
rectifiée et **signalée en clair** par un encart « 🔧 Corrigé », qui dit ce qui a
été changé et pourquoi. Les professeurs restent la référence ; l'encart ne les
contredit pas en silence.

## Operating Context

Cinq situations d'usage, toutes confirmées par l'auteur :

| Situation | Ce qu'elle impose |
|---|---|
| **Téléphone, en déplacement** | Une main, 375 px, parfois sans réseau. Toute commande doit être atteignable au pouce. |
| **En cours ou en TP** | Retrouver une commande ou une syntaxe pendant qu'on travaille. La **recherche** prime sur la navigation. |
| **Ordinateur, séance longue** | Grand écran, lecture posée, plusieurs chapitres d'affilée. |
| **Tablette** | Format intermédiaire, lecture posée. |
| **Imprimé sur papier** | La fiche de révision sortie la veille. Le rendu papier est un livrable à part entière, pas un effet de bord. |

Le rythme de l'alternance — semaines au CFA, semaines en entreprise — fait que le
site est ouvert par à-coups, souvent après plusieurs jours sans y toucher. On doit
pouvoir **reprendre où l'on s'était arrêté**.

## Capabilities and Constraints

**Zéro dépendance.** Aucun CDN, aucun framework, aucune police téléchargée,
aucune étape de construction, aucun appel réseau. Du HTML, du CSS et du
JavaScript écrits à la main. C'est une exigence posée par l'auteur, pas une
conséquence technique : le site doit s'ouvrir dans un avion, depuis un fichier
local, dans dix ans.

**Site généré.** Les pages publiées sont produites depuis un dépôt privé par
`publier.py`. On ne modifie **jamais** une page publiée directement : on modifie
la source ou le générateur, puis on republie. Le générateur vide le dépôt public
avant chaque génération — tout fichier qui doit survivre est une source recopiée.

**Aucune donnée personnelle.** Le dépôt est public. Aucun nom d'élève ou de
professeur, aucune adresse, aucun document administratif n'y figure. Un contrôle
automatique le vérifie à chaque publication.

**Le corpus grandit.** De nouveaux chapitres arrivent au fil de la deuxième
année. Toute conception doit supporter l'ajout plutôt que supposer un corpus figé.

**Auteur unique.** Un seul contributeur. Aucun flux de contribution externe à
prévoir pour l'instant.

**État du corpus à la dernière génération :** 5 matières, 56 chapitres,
168 fiches, 183 pages, 6 outils. Ces nombres sont calculés par le générateur, jamais
écrits à la main.

## Brand Commitments

- **Le logo de la classe** (CFA INSTA — BTS CIEL) est fourni par l'auteur et
  utilisé tel quel : en-tête, favicon, icône installable. Il n'est ni redessiné
  ni remplacé par un substitut.
- **Tout est en français**, jusqu'aux noms de classes CSS et aux commentaires de
  code.
- **Ton direct**, sans flatterie ni remplissage. Une phrase dit ce qu'elle a à
  dire, et un commentaire de code explique *pourquoi*, pas *quoi*.
- **Le site ne se fait jamais passer pour une source officielle.** Il dit ce
  qu'il est et ce qu'il n'est pas, en toutes lettres, sur sa page d'accueil
  comme dans son README.

## Evidence on Hand

- `README.md` — ce que contient le site, ce qu'il n'est pas, comment il est
  vérifié.
- `a-propos.html` — la même déclaration, à destination du lecteur.
- `verification/verifier.py` — le contrôle public : données personnelles, dépendances
  externes, liens morts, identifiants en double, intégrité de l'index de recherche,
  recalcul des 33 masques, relecture des 28 ports et des 25 blocs de commandes.
- `verification/qa.html` — 1 186 mesures de rendu : débordement horizontal, cibles
  tactiles, erreurs de console, ressources manquantes et étiquettes de schéma
  superposées, sur 182 pages × 40 thèmes × 3 largeurs.
- `verification/contraste.html` — 960 combinaisons de contraste mesurées dans un
  navigateur, au seuil AA, sur 12 pages dont les 6 outils.
- `LICENSE` — MIT pour le code, CC BY-NC-SA 4.0 pour le contenu pédagogique.

**Ce qui n'existe pas et ne doit pas être inventé** : aucun témoignage, aucun
chiffre de fréquentation, aucune validation par un professeur ou par
l'établissement, aucune mention d'un partenariat.

## Product Principles

1. **Une affirmation chiffrée est vérifiable par machine, ou elle ne se publie
   pas.** Valeurs, décomptes, sorties de programme : recalculés, jamais recopiés.
2. **Une correction se signale.** Aucune erreur du cours d'origine n'est
   rectifiée en silence.
3. **Retrouver prime sur parcourir.** Celui qui ouvre le site sait déjà ce qu'il
   cherche.
4. **Ce qui est publié s'ouvre partout, tout seul.** Hors-ligne, sur un vieux
   téléphone, à l'imprimante, sans rien installer.
5. **Le dépôt est public : rien de privé n'y entre.** Cette règle prime sur
   toute commodité.

## Accessibility & Inclusion

Aucune exigence réglementaire ne s'applique. Une exigence de confort a été posée
par l'auteur, et elle est tenue **par la mesure, pas par l'estimation** :

- **Contraste AA** sur les 40 thèmes, mesuré dans un navigateur sur les fonds
  réels, transparences composées.
- **Cibles tactiles ≥ 34 px**, vérifiées sur les 182 pages.
- **Réglages de lecture** : taille du texte, largeur de ligne, police,
  interligne — parce que les situations d'usage vont du téléphone au grand écran.
- **`prefers-reduced-motion`** respecté, doublé d'une bascule d'animations dans
  les réglages.
