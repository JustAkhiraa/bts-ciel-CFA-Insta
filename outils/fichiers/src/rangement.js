/* Le rangement de l'accueil : quels outils vont ensemble, et ce qu'on en dit
   en une ligne. Quarante outils sur quatre familles, dont une de vingt, ne se
   lisent pas : huit groupes de sept au plus se balaient (le banc vérifie que
   chaque outil y est une fois et une seule).

   « mat » reprend une couleur de matière du site (--mat, --mat-t) : ces
   teintes existent en clair et en sombre, et aucun des quarante thèmes ne les
   éteint. La couleur dit la famille : bleu convertir, rouge modifier un PDF,
   vert les images, or les utilitaires. */

export const GROUPES = [
  { titre: "Convertir un PDF", mat: "reseau", outils: {
    "pdf-docx": "Un document .docx modifiable",
    "pdf-odt": "Le même, au format ouvert",
    "pdf-texte": "Sept formats, du .txt au LaTeX",
    "pdf-tableur": "Ses tableaux en .xlsx, .ods, .csv",
    "pdf-diaporama": "Une diapositive par page",
    "pdf-epub": "Un .epub pour liseuse ou téléphone",
  } },
  { titre: "PDF et images", mat: "reseau", outils: {
    "images-pdf": "Une image par page",
    "scanner": "Photographier des feuilles",
    "pdf-jpg": "Chaque page en JPG, PNG, WebP",
    "pdf-images": "Récupérer photos et figures",
  } },
  { titre: "Écrire sur un PDF", mat: "maths", outils: {
    "signer": "Dessiner et poser sa signature",
    "texte": "Remplir, dater, compléter",
    "numeroter": "« 1 / 12 » en bas de chaque page",
    "filigrane": "« COPIE » en travers des pages",
  } },
  { titre: "Ranger les pages", mat: "maths", outils: {
    "fusionner": "Plusieurs PDF en un seul",
    "diviser": "Couper en plusieurs fichiers",
    "organiser": "Glisser, pivoter, retirer",
    "extraire": "Garder seulement certaines pages",
    "supprimer": "Une page blanche, une annexe",
    "pivoter": "Remettre un scan à l'endroit",
    "recadrer": "Couper les marges",
  } },
  { titre: "Alléger et protéger", mat: "maths", outils: {
    "compresser": "Pour un mail ou un dépôt en ligne",
    "proteger": "Chiffrer le fichier",
    "deverrouiller": "Si vous le connaissez",
    "metadonnees": "Voir ou effacer titre et auteur",
    "reparer": "Récupérer un fichier abîmé",
  } },
  { titre: "Images et photos", mat: "dev", outils: {
    "convertir": "PNG, JPG, WebP, une ou cent",
    "compresser-image": "Alléger, avant / après affichés",
    "redimensionner": "Changer la taille en pixels",
    "recadrer-image": "Libre, carré, 16/9, identité…",
    "pivoter-image": "Quart de tour ou miroir",
    "exif": "Retirer GPS, téléphone et date",
  } },
  { titre: "QR codes et archives", mat: "projets", outils: {
    "qr-creer": "Lien, texte, Wi-Fi, carte de visite",
    "qr-lire": "Caméra, photo ou capture",
    "zip-creer": "Réunir plusieurs fichiers",
    "zip-ouvrir": "Voir et sortir un fichier",
  } },
  { titre: "Vérifier et nettoyer", mat: "projets", outils: {
    "empreinte": "MD5, SHA-256 : un fichier intact ?",
    "mots-de-passe": "Générer et tester",
    "texte-propre": "Recoller les lignes, compter les mots",
    "base64": "Encoder, décoder",
  } },
];
