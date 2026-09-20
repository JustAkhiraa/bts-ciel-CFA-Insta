#!/usr/bin/env python3
"""Vérification du site publié — ce dépôt est public, il doit le rester proprement.

Cinq contrôles, sans aucune dépendance :

  1. AUCUNE DONNÉE PERSONNELLE. Le plus important. Ce dépôt est lisible par
     tout le monde ; aucun nom d'élève ni de professeur ne doit y figurer.
  2. Aucune dépendance externe — le site doit s'ouvrir hors-ligne.
  3. Aucun lien mort entre les pages.
  4. Chaque chapitre a bien ses trois fiches.
  5. L'index de recherche pointe vers des pages qui existent.

    python3 outils/verifier.py
"""
import json, os, re, sys
from urllib.parse import unquote, urlparse

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── 1. ce qui ne doit jamais apparaître ───────────────────────────────────
# Prénoms et noms des personnes citées dans le dépôt privé. La liste est en
# clair ici : c'est elle qu'on relit avant de publier.
INTERDITS = [
    "Ahmed", "AAFIF", "Aafif", "Noémie", "Noemie", "Glaçon", "Glacon",
    "El-Bakkouchi", "Elbakkouchi", "Asmaa", "Sraïri", "Srairi",
    "Tony Buson", "Souleymane",
]
# Motifs génériques : une adresse ou un numéro qui traînerait.
# Le « (?<![\w-]) » évite de confondre un numéro avec un morceau de nom de
# fichier — « capture-2026-06-01-194001 » n'est pas un téléphone.
MOTIFS_PRIVES = [
    (r"[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b", "adresse e-mail"),
    (r"(?<![\w-])0[1-9](?:[ .-]\d{2}){4}(?![\w-])", "numéro de téléphone"),
    (r"\b\d{1,3} (?:rue|avenue|boulevard|impasse|allée) [A-Z]", "adresse postale"),
]

# Valeurs FICTIVES, relues une par une avant publication : exemples de cours,
# personnages des sujets d'examen, espaces réservés de formulaire. Une adresse
# qui n'est pas dans cette liste fait échouer la vérification — c'est le but.
# Domaines réservés aux exemples par l'usage et par la RFC 2606.
DOMAINES_EXEMPLE = ("@exemple.fr", "@example.com", "@example.org", "@example.net")

TOLERES = {
    "contact@cfa.fr",                         # exemple de lien mailto, chapitre HTML
    "m.blanchett@spinbrands.co.uk",           # personnage d'un sujet d'anglais
    "dylan.rbsn@corporatehappiness.com",      # personnage d'un sujet d'anglais
    "06 12 34 56 78",                         # placeholder d'un champ de formulaire
}

DOSSIERS_IGNORES = {".git", ".github", "outils", "node_modules"}


# Les fichiers de texte publiés à côté des pages. Ils échappaient au contrôle
# des données personnelles : seul « .html » était lu. Un nom déposé dans
# README.md, LICENSE ou PRODUCT.md serait parti en ligne sans un mot — et ces
# trois-là sont justement ceux qu'on écrit à la main.
TEXTES = (".md", ".txt", ".json", ".webmanifest", ".yml", ".yaml", ".csv")
SANS_EXTENSION = {"LICENSE", "NOTICE", "AUTHORS", "CITATION"}


def pages():
    for dp, dn, fn in os.walk(RACINE):
        dn[:] = [d for d in dn if d not in DOSSIERS_IGNORES and not d.startswith(".")]
        for f in fn:
            if f.endswith(".html"):
                yield os.path.join(dp, f)


def textes():
    """Tout ce qui est publié et lisible, en dehors des pages."""
    for dp, dn, fn in os.walk(RACINE):
        dn[:] = [d for d in dn if d not in DOSSIERS_IGNORES and not d.startswith(".")]
        for f in fn:
            if f.endswith(TEXTES) or f in SANS_EXTENSION:
                yield os.path.join(dp, f)


def personnel(h, rel, pbs):
    """Contrôle 1, isolé : il s'applique à TOUT fichier lisible, pas aux
    seules pages. Les contrôles de liens et de dépendances, eux, n'ont de
    sens que sur du HTML."""
    for mot in INTERDITS:
        m = re.search(re.escape(mot), h, re.I)
        if m:
            a, b = max(0, m.start() - 50), min(len(h), m.end() + 40)
            extrait = re.sub(r"\s+", " ", h[a:b]).strip()
            pbs.append((rel, f"DONNÉE PERSONNELLE « {mot} » : …{extrait}…"))
    for motif, quoi in MOTIFS_PRIVES:
        for m in re.finditer(motif, h, re.I):
            valeur = m.group(0)
            if valeur in TOLERES or valeur.lower().endswith(DOMAINES_EXEMPLE):
                continue
            pbs.append((rel, f"{quoi} en clair : {valeur}"))


def main():
    pbs, n = [], 0
    fichiers = sorted(pages())

    for p in sorted(textes()):
        try:
            personnel(open(p, encoding="utf-8").read(), os.path.relpath(p, RACINE), pbs)
        except (UnicodeDecodeError, OSError):
            pass          # un binaire mal nommé n'est pas une donnée personnelle

    for p in fichiers:
        n += 1
        rel = os.path.relpath(p, RACINE)
        h = open(p, encoding="utf-8").read()

        # ── 1. données personnelles ───────────────────────────────────
        personnel(h, rel, pbs)

        # on neutralise les exemples de code avant les contrôles de liens
        hl = re.sub(r"(?is)<pre\b.*?</pre>", " ", h)
        hl = re.sub(r"(?is)<code\b.*?</code>", " ", hl)

        # ── 2. dépendances externes ───────────────────────────────────
        for balise, u in re.findall(
                r'<\s*(link|script|img|iframe|source|video|audio|object|embed)\b[^>]*?'
                r'(?:src|href)\s*=\s*["\'](https?://[^"\']+)', hl, re.I):
            pbs.append((rel, f"dépendance externe (<{balise.lower()}>) : {u}"))

        # ── 3. liens morts ────────────────────────────────────────────
        for u in re.findall(r'(?:src|href)\s*=\s*["\']([^"\'#][^"\']*)', hl):
            if re.match(r"^(https?:|mailto:|tel:|data:|//)", u):
                continue
            cible = unquote(urlparse(u).path)
            if not cible:
                continue
            chemin = os.path.normpath(os.path.join(os.path.dirname(p), cible))
            if not os.path.exists(chemin):
                pbs.append((rel, f"lien mort : {u}"))

    # ── 4. chaque chapitre a ses trois fiches ─────────────────────────
    for pole in sorted(os.listdir(RACINE)):
        d = os.path.join(RACINE, pole)
        if not os.path.isdir(d) or pole.startswith((".", "_")) or pole in DOSSIERS_IGNORES:
            continue
        if not os.path.isfile(os.path.join(d, "index.html")):
            continue
        for chap in sorted(os.listdir(d)):
            c = os.path.join(d, chap)
            if not os.path.isdir(c):
                continue
            for f in ("cours.html", "exercices.html", "fiche-revision.html"):
                if not os.path.isfile(os.path.join(c, f)):
                    pbs.append((f"{pole}/{chap}", f"{f} manquant"))

    # ── 5. l'index de recherche ───────────────────────────────────────
    ir = os.path.join(RACINE, "assets", "recherche.js")
    n_index = 0
    if os.path.isfile(ir):
        brut = open(ir, encoding="utf-8").read()
        m = re.search(r"window\.__INDEX\s*=\s*(\[.*\])\s*;", brut, re.S)
        if not m:
            pbs.append(("assets/recherche.js", "l'index n'est pas lisible"))
        else:
            entrees = json.loads(m.group(1))
            n_index = len(entrees)
            for e in entrees:
                if not os.path.isfile(os.path.join(RACINE, e["u"])):
                    pbs.append(("assets/recherche.js", f"entrée vers une page absente : {e['u']}"))
    else:
        pbs.append(("assets/recherche.js", "absent"))

    print(f"{n} pages · {n_index} entrées de recherche")
    if pbs:
        print(f"\n{len(pbs)} anomalie(s) :")
        for f, m in pbs[:60]:
            print(f"   {f}\n      → {m}")
        if len(pbs) > 60:
            print(f"   … et {len(pbs) - 60} autres")
        sys.exit(1)
    print("OK — aucune donnée personnelle, aucune dépendance externe, aucun lien mort.")


main()
