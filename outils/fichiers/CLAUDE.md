# L'atelier fichiers — architecture

Les outils « à la lovepdf » du site : fusionner, découper, compresser,
signer, protéger un PDF, photos en PDF, images, ZIP, QR codes, empreintes,
mots de passe. Une page (`outils/fichiers.html`), des modules ES natifs
(`outils/fichiers/src/`), **aucune dépendance, aucune compilation**.
Les bancs : `node outils/fichiers/tests/tout.mjs`.

Ce fichier est la référence. Une règle qui change ici change dans le code.

---

## 1. La promesse : rien ne sort de l'appareil

Les sites du genre iLovePDF **envoient le fichier sur leurs serveurs**. Ici,
tout se fait dans le navigateur, et hors ligne une fois la page visitée
(le service worker garde les modules). Un relevé de notes, une convention de
stage, une pièce d'identité ne quittent pas le téléphone. Aucun `fetch` vers
l'extérieur, aucune bibliothèque tierce : le moteur PDF, le ZIP, l'EXIF, le
MD5, le rendu des pages sont **écrits ici**. Les juges des tests (poppler,
qpdf, pypdf, PyMuPDF, OpenCV) restent hors du dépôt.

Licences : on lit le code des autres pour comprendre (pdf.js, pdf-lib), on
n'en copie rien.

---

## 2. Arborescence

```
outils/fichiers.html              la page (coquille du site, data-matiere="projets")
outils/fichiers/fichiers.css      le style, sur les jetons de couleur du site (les 40 thèmes)
outils/fichiers/src/
  app.js                          l'accueil (tuiles, filtre) et l'ÉTABLI commun à tous les outils
  aides.js                        type d'un fichier par ses octets, décodage / encodage d'images
  apercu.js                       vignettes de pages (Grille), placeur de boîtes, ardoise de signature
  icones.js                       les pictogrammes
  mots.js                         751 mots pour les phrases de passe
  exif.js                         lire / retirer l'EXIF (JPEG, PNG) sans toucher aux pixels
  zip.js                          écrire / lire un ZIP (CRC-32, deflate du navigateur)
  md5.js                          MD5 (Web Crypto ne l'a pas)
  pdf/
    objets.js                     les 8 sortes d'objets PDF et leur écriture
    lecture.js                    lire : xref classique et en flux, flux d'objets, /Prev, RÉPARATION
    filtres.js                    Flate (+ prédicteurs PNG/TIFF), LZW, ASCIIHex, ASCII85, RunLength
    chiffrement.js                RC4 40/128, AES-128, AES-256 (R2 à R6) ; écrire en AES-256 R6
    ecriture.js                   écrire un PDF neuf (table xref classique)
    operations.js                 copier des pages, fusionner, pivoter, tamponner, images → PDF…
    police.js                     Helvetica (métriques AFM) pour écrire numéros et filigranes
    rendu.js                      DESSINER une page sur un canevas
    glyphes.js                    polices pour le rendu : encodages, CMap, TrueType (glyf)
    fonctions.js                  fonctions PDF 0, 2, 3, 4 (dégradés, encres)
  outils/
    pdf.js                        20 outils PDF
    images.js                     6 outils d'images
    divers.js                     8 utilitaires
outils/fichiers/tests/            bancs node + fichiers d'autres producteurs (reportlab, qpdf, LibreOffice)
```

Le QR code vient du salon (`outils/salon/src/qr.js`, `camera.js`) : un seul
encodeur, un seul lecteur dans le site.

---

## 3. Un outil

```js
{ id, titre, resume, description, mots,           // mots : pour le filtre et la recherche du site
  entree: { types: ["pdf" | "image" | "zip" | "bureautique" | "tout"], multiple, min, accepte, libelle } | null,
  options(ctx) → HTML,  brancher?(ctx),  surFichiers?(ctx),  pret?(ctx),
  bouton, sansBouton?, sansSuite?, nomZip?,
  executer(ctx) → [{ nom, blob, note? }] | { fichiers, resume } }
```

L'établi (`ctx`, classe `Etabli` de `app.js`) fournit : le dépôt (clic,
glisser, coller une capture), la liste rangeable, l'ouverture des PDF (le
champ de mot de passe s'il le faut), `ctx.val(nom)`, `ctx.statut()`,
`ctx.zone` (la partie qui dépend des fichiers), les résultats (télécharger,
tout en ZIP, aperçu, « continuer avec ce résultat » dans un autre outil).
Le type d'un fichier se lit dans ses **octets**, pas dans son extension.

L'adresse `fichiers.html#fusionner` ouvre l'outil directement : c'est ce
que vise la recherche du site (`assets/recherche.js`, une entrée par outil).

---

## 4. Le moteur PDF

- **Lire** par la fin (`startxref`), suivre les `/Prev` (la mise à jour la
  plus récente gagne). Table fausse ou fichier tronqué : on reconstruit en
  cherchant tous les `n g obj` (`doc.repare`).
- **Copier une page** = suivre son graphe d'objets et les renuméroter ; un
  lien vers une page NON gardée devient `null` (pas de passager clandestin).
  Ce que la page hérite (`/Resources`, `/MediaBox`, `/CropBox`, `/Rotate`)
  est recopié dans la page, en valeurs directes.
- **Écrire** un fichier neuf, table xref classique : le format que tout
  lecteur ouvre. Les flux non compressés le sont au passage.
- **Tamponner** (numéros, filigrane, texte, signature) : un flux `q` avant le
  contenu d'origine, un `Q … q <matrice> cm … Q` après — dans le repère de la
  page telle qu'on la VOIT (rotation comprise, `matriceVisible`).
- **Chiffrer** en AES-256 R6 (PDF 2.0). Déchiffrer : R2 à R6.
- Images → PDF : un JPEG est mis **tel quel** (aucune perte), redressé par la
  matrice de dessin selon son orientation EXIF ; le reste en Flate sans
  perte, la transparence dans un `/SMask`.

## 5. Le rendu des pages (`rendu.js`)

Le contenu d'une page est exécuté opérateur par opérateur sur le canevas 2D,
dont les chemins, le découpage et les transformations sont ceux du PDF
(`ctx.transform` = l'opérateur `cm`). Sait : chemins, découpages, couleurs
(gris, RVB, CMJN, ICC, indexées, Separation/DeviceN par leur fonction, Lab),
dégradés axiaux et radiaux (avec `/Extend`), motifs en tuiles, images
(JPEG, tout ce qui se décompresse, masques doux et pochoirs, `/Decode`),
images en ligne, formulaires XObject, annotations (apparence `/AP`),
calques masqués, texte en mode invisible (la couche OCR d'un scan reste
invisible), polices Type 3.

Le texte : chaque lettre est posée à la position exacte que donnent les
largeurs du PDF. Une police **TrueType embarquée** est dessinée par ses
propres contours (tables `glyf`, `loca`, `cmap`, glyphes composés) — le
code → glyphe suit ISO 32000 § 9.6.6.4 (cmap (3,1) par le nom, sinon
(3,0) ou (1,0) par le code ; `/CIDToGIDMap` pour les polices composites).
Sinon (Type 1, CFF, police absente) : une police du système de même famille
écrit le caractère Unicode, étirée à la largeur voulue.

Ne sait pas (une case grise à la place, ou une police du système) : JBIG2,
fax CCITT, JPEG 2000, maillages de dégradés, masques de transparence
d'ExtGState, contours Type 1 / CFF.

### Valider le rendu

Contre poppler, dans Chromium (Playwright), hors du dépôt : rendre chaque
page à 100 ppp avec `rendrePage`, la même avec `pdftoppm -r 100`, comparer
pixel à pixel. Relevé du 23 octobre 2026 : un PDF LibreOffice (6 polices
TrueType embarquées, tableau, JPEG, PNG transparent) 1,1 % de pixels
différents de plus de 64 niveaux ; reportlab (polices standard, dégradé,
découpage, transparence) 0,8 % ; PyMuPDF (Type0 Identity-H, annotations,
champs remplis) 0,7 % ; les autres fixtures < 0,5 %. L'écart restant est
l'anticrénelage et la ligne de base des polices du système (± 1 px).

---

## 6. Ce que l'atelier ne fait pas (écrit aussi dans la page)

PDF ↔ Word/Excel/PowerPoint (recomposer une mise en page), OCR, modifier le
texte existant d'un PDF, signature électronique qualifiée (la signature
dessinée est une image : c'est dit), vidéo et son, RAR/7z.

## 7. Pièges connus

- `TextDecoder("windows-1252")` de node rend 0x80–0x9F comme Latin-1 : la
  table WinAnsi de `glyphes.js` est écrite à la main.
- LibreOffice renumérote les lettres d'une police sous-ensemble (codes 1, 2,
  3…, sans `/Encoding`) : seule la `/ToUnicode` dit lesquelles ; le dessin
  passe par la cmap (3,0) de la police.
- Un JPEG nettoyé de son EXIF perd son orientation : `avecOrientation()` lui
  rend un EXIF de 36 octets qui ne dit que cela.
- Le lecteur PDF du navigateur (aperçu en `<iframe>`) n'existe pas sur
  Android : l'aperçu n'est montré que si `navigator.pdfViewerEnabled`.
- Les cases `hidden` d'un `display: flex` : `.af-carte [hidden]` force
  `display: none`.
