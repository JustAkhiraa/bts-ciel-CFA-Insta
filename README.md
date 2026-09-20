# BTS CIEL — fiches de révision

Cours, exercices corrigés et fiches de révision pour le **BTS CIEL option A**
(Cybersécurité, Informatique et réseaux, Électronique).

**→ [Consulter le site](https://justakhiraa.github.io/bts-ciel-CFA-Insta/)**

## Ce que c'est

Les notes d'un étudiant, remises au propre. Pour chaque chapitre :

| Fiche | Rôle |
|---|---|
| `cours.html` | le cours complet, avec schémas, analogies et pièges d'examen |
| `exercices.html` | les exercices, énoncé et correction repliable |
| `fiche-revision.html` | recto-verso dense, à imprimer, à relire la veille |

**52 chapitres · 156 fiches · 5 matières.**

## Ce que ce n'est pas

Ce ne sont **pas** les cours officiels, et aucun document de cours original n'est
redistribué — ni PDF de professeur, ni polycopié, ni copie d'élève. Là où un
document contenait une erreur, elle est signalée `🔧 Corrigé`, mais **les
professeurs restent la référence**.

## Comment c'est vérifié

Dix contrôles automatiques, lancés à chaque modification :

1. **Complétude** — chaque chapitre a ses trois fiches, chaque fiche ses parties
2. **Structure** — liens morts, titres, aucune dépendance externe
3. **Relecture** — fautes courantes, typographie, balises non refermées
4. **Technique** — les masques et sous-réseaux sont **recalculés**
5. **Mathématiques** — toutes les valeurs annoncées sont **recalculées**
6. **Anglais** — les décomptes de mots sont **recomptés**
7. **Citations** — les renvois de ligne sont **recomptés** sur le texte source
8. **Langage C** — les programmes publiés sont **compilés et exécutés**
9. **Rendu** — mesure dans un navigateur, à 375, 768 et 1440 px
10. **Site publié** — débordement, cibles tactiles et contraste, mesurés sur les
    163 pages et les 40 thèmes (`outils/qa.html`, `outils/contraste.html`)

```bash
python3 outils/verifier.py
```

## Technique

Aucune dépendance, aucune étape de construction, aucun appel réseau. Du HTML, du
CSS et du JavaScript écrits à la main. Quarante thèmes, installable comme
application, fonctionne hors-ligne.

Pour le consulter en local :

```bash
python3 -m http.server 8000
```

## Licence

Le **code** (HTML, CSS, JavaScript) est sous licence MIT — voir `LICENSE`.
Le **contenu pédagogique** est partagé sous
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr) :
réutilisable en citant la source, pas à des fins commerciales.
