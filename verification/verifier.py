#!/usr/bin/env python3
"""Vérification du site publié — ce dépôt est public, il doit le rester proprement.

Cinq contrôles, sans aucune dépendance :

  1. AUCUNE DONNÉE PERSONNELLE. Le plus important. Ce dépôt est lisible par
     tout le monde ; aucun nom d'élève ni de professeur ne doit y figurer.
  2. Aucune dépendance externe — le site doit s'ouvrir hors-ligne.
  3. Aucun lien mort entre les pages.
  4. Chaque chapitre a bien ses trois fiches.
  5. L'index de recherche pointe vers des pages qui existent.

    python3 verification/verifier.py
"""
import json, os, re, sys
from html import unescape
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

DOSSIERS_IGNORES = {".git", ".github", "verification", "node_modules"}


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


def masques(racine, pbs):
    """Recalcule les 33 lignes de la table des masques.

    Le tableau est produit par le générateur, donc juste par construction —
    aujourd'hui. Ce contrôle existe pour le jour où quelqu'un le retouchera à
    la main, ou changera une formule : une table de masques fausse est
    l'erreur la plus coûteuse du dépôt, parce qu'on la recopie sans la relire.

    Il relit aussi le masque en BINAIRE, bit à bit : c'est une affirmation de
    plus, donc une chose de plus à vérifier."""
    chemin = os.path.join(racine, "outils", "masques.html")
    if not os.path.isfile(chemin):
        return 0
    h = open(chemin, encoding="utf-8").read()
    rangs = re.findall(r"<tr><th scope=\"row\">/(\d+)</th>(.*?)</tr>", h, re.S)
    if len(rangs) != 33:
        pbs.append(("outils/masques.html",
                    f"table des masques : {len(rangs)} lignes au lieu de 33"))
        return len(rangs)

    for n, corps in rangs:
        n = int(n)
        cellules = re.findall(r"<td[^>]*>(.*?)</td>", corps, re.S)
        if len(cellules) < 5:
            pbs.append(("outils/masques.html", f"/{n} : ligne incomplète"))
            continue

        entier = (0xFFFFFFFF << (32 - n)) & 0xFFFFFFFF if n else 0
        attendu = ".".join(str((entier >> d) & 255) for d in (24, 16, 8, 0))
        inverse = ".".join(str(255 - int(o)) for o in attendu.split("."))
        n_total = 1 << (32 - n)
        n_hotes = n_total - 2 if n <= 30 else (2 if n == 31 else 1)

        def texte(c):
            return re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", c))

        def nombre(c):
            m = re.match(r"[\d\u202f\u00a0 ]+", re.sub(r"<[^>]+>", "", c).strip())
            return int(re.sub(r"[^\d]", "", m.group(0))) if m else -1

        masque_vu = texte(re.sub(r'<span class="mb">.*', "", cellules[0], flags=re.S))
        # Le binaire : on ne garde que les 0 et les 1, dans l'ordre.
        bin_vu = re.sub(r"[^01]", "", re.search(r'<span class="mb">(.*?)</span>\s*$',
                        cellules[0], re.S).group(1)) if 'class="mb"' in cellules[0] else ""
        bin_attendu = "1" * n + "0" * (32 - n)

        for quoi, obtenu, voulu in (
                ("masque", masque_vu, attendu),
                ("masque en binaire", bin_vu, bin_attendu),
                ("masque inverse", texte(cellules[1]), inverse),
                ("nombre d'adresses", nombre(cellules[2]), n_total),
                ("hôtes utilisables", nombre(cellules[3]), n_hotes)):
            if obtenu != voulu:
                pbs.append(("outils/masques.html",
                            f"/{n} — {quoi} : {obtenu!r} annoncé, {voulu!r} recalculé"))
    return len(rangs)


def ports(racine, pbs):
    """Relit la table des ports, et les trois plages.

    Les numéros, eux, sont éditoriaux : rien ne les recalcule. Ce qu'on peut
    vérifier, ce sont les invariants — un port tient sur 16 bits, un transport
    est TCP ou UDP, et un numéro n'apparaît pas deux fois. Surtout, les trois
    plages doivent se toucher sans trou et couvrir 0 à 65 535 : c'est la seule
    affirmation arithmétique de la page, donc la seule qui puisse se démentir
    en silence."""
    chemin = os.path.join(racine, "outils", "ports.html")
    if not os.path.isfile(chemin):
        return 0
    h = open(chemin, encoding="utf-8").read()
    corps = re.search(r'<table id="table-ports">(.*?)</table>', h, re.S)
    if not corps:
        pbs.append(("outils/ports.html", "table des ports introuvable"))
        return 0

    vus, n = {}, 0
    for th, reste in re.findall(
            r'<tr[^>]*><th scope="row" class="nb">([^<]+)</th>(.*?)</tr>',
            corps.group(1), re.S):
        n += 1
        for num in re.findall(r"\d+", th):
            num = int(num)
            if not 0 <= num <= 65535:
                pbs.append(("outils/ports.html", f"port hors des 16 bits : {num}"))
            vus[num] = vus.get(num, 0) + 1
        cellules = re.findall(r"<td[^>]*>(.*?)</td>", reste, re.S)
        if len(cellules) != 4:
            pbs.append(("outils/ports.html", f"port {th} : {len(cellules)} cellules au lieu de 4"))
            continue
        transport = re.sub(r"<[^>]+>", "", cellules[0]).strip()
        if transport not in ("TCP", "UDP", "TCP · UDP"):
            pbs.append(("outils/ports.html", f"port {th} : transport « {transport} » inattendu"))
    for num, combien in sorted(vus.items()):
        if combien > 1:
            pbs.append(("outils/ports.html", f"port {num} listé {combien} fois"))
    if n < 20:
        pbs.append(("outils/ports.html",
                    f"{n} ligne(s) de port relue(s) : le contrôle ne lit plus la table"))

    # Les trois plages de l'IANA : contiguës, et couvrant tout l'espace.
    plages = re.findall(r'<tr><th scope="row">(\d+)\s*[–-]\s*(\d+)</th>',
                        h.replace("&#8211;", "–"))
    if len(plages) != 3:
        pbs.append(("outils/ports.html", f"{len(plages)} plages de ports au lieu de 3"))
    else:
        bornes = [(int(a), int(b)) for a, b in plages]
        if bornes[0][0] != 0 or bornes[-1][1] != 65535:
            pbs.append(("outils/ports.html",
                        f"les plages couvrent {bornes[0][0]}–{bornes[-1][1]}, pas 0–65535"))
        for (_, fin), (debut, _) in zip(bornes, bornes[1:]):
            if debut != fin + 1:
                pbs.append(("outils/ports.html",
                            f"trou ou chevauchement entre {fin} et {debut}"))
    return n


def packet_tracer(racine, pbs):
    """Relit chaque bloc de commandes Packet Tracer.

    Le vrai risque de cet outil n'est pas l'affichage : c'est qu'on copie un
    bloc qui ne fait pas ce que son titre annonce. Trois affirmations se
    vérifient ici.

    1. Le texte affiché est exactement le modèle substitué avec les valeurs
       par défaut. Les deux existent séparément — l'un pour être lu sans
       JavaScript, l'autre pour être regénéré quand on change le nom ou le
       mot de passe — et rien n'empêcherait qu'ils divergent.
    2. Chaque bloc commence par « enable » : c'est ce qui le rend collable
       depuis n'importe quel mode, et c'est la promesse faite au lecteur.
    3. Un bloc qui entre en configuration en ressort par « end » et
       sauvegarde. Une configuration perdue au redémarrage est l'erreur de TP
       la plus fréquente, et c'est celle que l'outil est censé éviter."""
    chemin = os.path.join(racine, "outils", "packet-tracer.html")
    if not os.path.isfile(chemin):
        return 0
    page = open(chemin, encoding="utf-8").read()
    DEF = {"nom": "R1", "mdp": "cisco"}

    blocs = re.findall(
        r'<article class="pt-bloc" data-cat="([^"]+)"[^>]*>\s*'
        r'<div class="pt-tete"><h3>([^<]+)</h3>.*?'
        r'<code data-modele="([^"]*)">(.*?)</code>', page, re.S)
    if len(blocs) < 15:
        pbs.append(("outils/packet-tracer.html",
                    f"{len(blocs)} bloc(s) de commandes relu(s) — attendu au moins 15. "
                    "Si la page en montre davantage, c'est le contrôle qui ne lit plus."))

    cats = set(re.findall(r'<section class="outil pt-cat" id="([^"]+)"', page))
    for cat, titre, modele, visible in blocs:
        ou = f"outils/packet-tracer.html — « {titre} »"
        if cat not in cats:
            pbs.append((ou, f"catégorie « {cat} » sans section correspondante"))

        attendu = unescape(modele)
        for cle, val in DEF.items():
            attendu = attendu.replace("{{" + cle + "}}", val)
        lu = unescape(visible)
        if lu != attendu:
            pbs.append((ou, "le bloc affiché ne correspond pas à son modèle"))
            continue

        lignes = [l for l in lu.split("\n") if l.strip()]
        if not lignes or lignes[0] != "enable":
            pbs.append((ou, "ne commence pas par « enable »"))
        if any(l.lstrip().startswith("!") for l in lignes):
            pbs.append((ou, "contient une ligne de commentaire « ! » — ce qu'on colle doit s'exécuter"))
        if "{{" in lu:
            pbs.append((ou, "une substitution n'a pas été faite"))
        if "configure terminal" in lignes:
            if "end" not in lignes:
                pbs.append((ou, "entre en configuration sans en sortir par « end »"))
            if lignes[-1] != "write memory":
                pbs.append((ou, "configure sans sauvegarder : la configuration serait perdue au redémarrage"))
    return len(blocs)


def compte_rendu(racine, pbs):
    """La jauge du compte rendu dit une fourchette : elle doit la montrer.

    La zone verte est posée en pourcentage dans la feuille de style, sur une
    échelle de 0 à 260 mots. Si quelqu'un change la fourchette du cours sans
    recalculer ces deux pourcentages, la jauge mentira sans qu'aucun test ne
    s'en aperçoive."""
    css = os.path.join(racine, "assets", "fiche.css")
    if not os.path.isfile(css):
        return 0
    h = open(css, encoding="utf-8").read()
    m = re.search(r"\.cr-zone\s*\{[^}]*?left:\s*([\d.]+)%;\s*width:\s*([\d.]+)%", h)
    if not m:
        pbs.append(("assets/fiche.css", "la zone de la jauge du compte rendu est introuvable"))
        return 0
    gauche, largeur = float(m.group(1)), float(m.group(2))
    for nom, attendu, lu in (("borne basse", 180 / 260 * 100, gauche),
                             ("largeur", (220 - 180) / 260 * 100, largeur)):
        if abs(attendu - lu) > 0.05:
            pbs.append(("assets/fiche.css",
                        f"jauge du compte rendu, {nom} : {lu} % au lieu de {attendu:.2f} %"))
    return 1


def main():
    pbs, n = [], 0
    fichiers = sorted(pages())

    for p in sorted(textes()):
        try:
            personnel(open(p, encoding="utf-8").read(), os.path.relpath(p, RACINE), pbs)
        except (UnicodeDecodeError, OSError):
            pass          # un binaire mal nommé n'est pas une donnée personnelle

    n_masques = masques(RACINE, pbs)
    n_ports = ports(RACINE, pbs)
    n_pt = packet_tracer(RACINE, pbs)
    compte_rendu(RACINE, pbs)

    for p in fichiers:
        n += 1
        rel = os.path.relpath(p, RACINE)
        h = open(p, encoding="utf-8").read()

        # ── 1. données personnelles ───────────────────────────────────
        personnel(h, rel, pbs)

        # on neutralise les exemples de code avant les contrôles de liens
        hl = re.sub(r"(?is)<pre\b.*?</pre>", " ", h)
        hl = re.sub(r"(?is)<code\b.*?</code>", " ", hl)

        # ── 1 bis. identifiants en double ─────────────────────────────
        # Deux éléments avec le même id, c'est du HTML accepté par le
        # navigateur mais faux pour le script : « getElementById » rend le
        # premier, en silence. Une section et une grille ont partagé
        # « ipv4 » — le script a écrasé la section entière, effaçant les
        # champs qu'elle contenait. Rien dans la console, rien à l'écran.
        #
        # Le contrôle lit « hl », d'où les <pre> et <code> ont été retirés :
        # un cours de HTML montre des exemples ÉCHAPPÉS, et deux
        # « id="email" » dans deux extraits enseignés ne sont pas un doublon.
        vus = {}
        for ident in re.findall(r'\sid="([^"]+)"', hl):
            vus[ident] = vus.get(ident, 0) + 1
        for ident, combien in sorted(vus.items()):
            if combien > 1:
                pbs.append((rel, f"identifiant « {ident} » présent {combien} fois"))

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

    print(f"{n} pages · {n_index} entrées de recherche · {n_masques} masques "
          f"recalculés · {n_ports} ports · {n_pt} blocs de commandes relus")
    if pbs:
        print(f"\n{len(pbs)} anomalie(s) :")
        for f, m in pbs[:60]:
            print(f"   {f}\n      → {m}")
        if len(pbs) > 60:
            print(f"   … et {len(pbs) - 60} autres")
        sys.exit(1)
    print("OK — aucune donnée personnelle, aucune dépendance externe, aucun lien mort.")


main()
