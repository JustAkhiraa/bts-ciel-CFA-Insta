#!/usr/bin/env python3
"""Met à jour le planning du site publié — et RIEN d'autre.

Ce script vit dans le dépôt PUBLIC, parce qu'il doit tourner sur un runner
GitHub, où le dépôt privé n'existe pas. Il ne sait donc pas fabriquer le
site : il sait seulement remplacer les trois choses qui vieillissent.

    planning.ics            l'agenda auquel les téléphones sont abonnés
    planning.html           le bloc des semaines, entre ses deux repères
    index.html              les données du bandeau d'accueil

Tout le calcul — fuseau, liste blanche des champs, rendu des semaines — est
fait par « planning_noyau.py », le MÊME fichier que celui du dépôt privé.
C'est la condition pour qu'une page régénérée ici soit rigoureusement celle
qu'aurait produite une génération locale. S'il fallait le recopier, les deux
finiraient par diverger, et la divergence ne se verrait qu'une fois publiée.

    python3 outillage/planning-ci.py            → 10 semaines
    python3 outillage/planning-ci.py 6          → 6 semaines
    python3 outillage/planning-ci.py 6 --blanc  → n'écrit rien, dit ce qui changerait
"""
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import planning_noyau as noyau                              # noqa: E402

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROMO = "322"
SEMAINES = 10

# Un jour sans cours est normal ; une moitié de jours en échec ne l'est pas.
# Sans ce plancher, une API en panne produirait un planning vide et le
# commiterait — le site annoncerait sereinement qu'il n'y a plus de cours.
PART_ECHECS_TOLEREE = 0.25


def lire(chemin):
    return open(os.path.join(RACINE, chemin), encoding="utf-8").read()


def ecrire(chemin, contenu, sec, faits, nl=None):
    p = os.path.join(RACINE, chemin)
    ancien = open(p, encoding="utf-8", newline="").read() if os.path.exists(p) else None
    if ancien == contenu:
        return False
    if not sec:
        faits.append(f"    {chemin} changerait")
        return True
    open(p, "w", encoding="utf-8", newline=nl).write(contenu)
    faits.append(f"    {chemin} réécrit")
    return True


def version_du_site():
    """L'empreinte de TOUT le site publié, selon la règle de publier.py.

    Le service worker ne purge son ancien cache que si cette valeur change.
    La régénérer ici est indispensable : sans elle, un visiteur qui a déjà
    ouvert le site garderait indéfiniment l'ancien planning.
    """
    e = hashlib.md5()
    for chemin in sorted(
            os.path.join(r, f)
            for r, _, fs in os.walk(RACINE) for f in fs
            if ".git" not in r.split(os.sep) and f != "sw.js"):
        e.update(os.path.relpath(chemin, RACINE).encode())
        with open(chemin, "rb") as fh:
            e.update(fh.read())
    return "bts-ciel-" + e.hexdigest()[:10]


def main(semaines=SEMAINES, sec=True):
    bruts, echecs = noyau.recuperer(semaines)
    jours_ouvres = sum(1 for _ in range(semaines * 7)) and semaines * 5
    if echecs > jours_ouvres * PART_ECHECS_TOLEREE:
        print(f"  ⚠️  {echecs} jours en échec sur ~{jours_ouvres} — "
              "l'API répond mal, rien n'est écrit.")
        return 1

    creneaux, _salles, pbs = noyau.normaliser(bruts)
    for p in pbs:
        print(f"  ⚠️  {p}")
    if pbs:
        print(f"\n{len(pbs)} anomalie(s) dans la réponse de l'API — rien n'est écrit.")
        return 1

    plan, promos = noyau.public(creneaux, PROMO)
    if plan is None:
        print(f"\n  ⚠️  AUCUN créneau pour la promo {PROMO}. "
              f"Promos reçues : {', '.join(sorted(set(promos)))}.")
        return 1
    print(f"promo {PROMO} : {len(plan['creneaux'])} créneau(x), "
          f"{plan['jours'][0]} → {plan['jours'][1]}")

    faits, change = [], False

    # ── l'agenda ────────────────────────────────────────────────────────
    change |= ecrire("planning.ics", noyau.fichier_ics(plan), sec, faits, nl="")

    # ── le bloc des semaines, entre ses deux repères ────────────────────
    page = lire("planning.html")
    motif = re.compile(r"(<!-- PLAN:SEMAINES.*?-->\n)(.*?)(\n  <!-- PLAN:/SEMAINES -->)",
                       re.S)
    if not motif.search(page):
        print("  ⚠️  repères PLAN:SEMAINES introuvables dans planning.html.")
        return 1
    change |= ecrire("planning.html",
                     motif.sub(lambda m: m.group(1) + noyau.blocs_semaines(plan)
                               + m.group(3), page, count=1), sec, faits)

    # ── les données du bandeau d'accueil ────────────────────────────────
    accueil = lire("index.html")
    donnees = json.dumps([[c["debut"], c["fin"][11:], c["cours"], c["salle"],
                           noyau.matiere_du_cours(c["cours"])]
                          for c in plan["creneaux"]],
                         ensure_ascii=False, separators=(",", ":"))
    m2 = re.compile(r'(<script type="application/json" id="bp-donnees">)(.*?)(</script>)',
                    re.S)
    if not m2.search(accueil):
        print("  ⚠️  bloc « bp-donnees » introuvable dans index.html.")
        return 1
    change |= ecrire("index.html",
                     m2.sub(lambda m: m.group(1) + donnees + m.group(3),
                            accueil, count=1), sec, faits)

    if not change:
        print("\naucun changement — le planning publié est déjà à jour.")
        return 0

    # ── le service worker, en dernier : il dépend de tout le reste ──────
    if sec:
        sw = lire("sw.js")
        neuf = re.sub(r'VERSION\s*=\s*"[^"]*"', 'VERSION = "' + version_du_site() + '"',
                      sw, count=1)
        if neuf != sw:
            open(os.path.join(RACINE, "sw.js"), "w", encoding="utf-8").write(neuf)
            faits.append("    sw.js : empreinte du site mise à jour")

    print("\n" + ("écrit :" if sec else "à blanc — rien n'a été touché :"))
    print("\n".join(faits))
    return 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sys.exit(main(int(args[0]) if args else SEMAINES,
                  "--blanc" not in sys.argv))
