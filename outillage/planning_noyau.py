#!/usr/bin/env python3
"""Le noyau du planning : ce que TOUT le monde doit calculer pareil.

Trois choses vivaient en double dès qu'un second programme a eu besoin du
planning : la conversion de fuseau, la liste blanche des champs, et
l'écriture du fichier d'agenda. Les recopier, c'est accepter qu'elles
divergent un jour — et un fuseau qui diverge, c'est un cours manqué.

Ce module est importé par :
  • planning.py            (dépôt privé, exports déposés à la main)
  • publier.py             (dépôt privé, génération du site)
  • outillage/planning-ci.py (dépôt public, mise à jour automatique)

Il ne lit aucun fichier et n'écrit nulle part : il ne fait que calculer.
C'est ce qui permet de le publier tel quel dans le dépôt public.
"""
import datetime
import hashlib


# ── Les champs attendus ──────────────────────────────────────────────────
# Tout ce qui n'est pas listé ici fait échouer la lecture. C'est voulu :
# le jour où le CFA ajoute un « teacherId », on ne veut pas l'apprendre
# en lisant le site publié.
# ── Les champs attendus ───────────────────────────────────────────────────
# Tout ce qui n'est pas listé ici fait échouer le script.
CHAMPS_CRENEAU = {"_id", "__v", "start", "end", "courseId", "promoId", "room",
                  "attendanceType", "name", "capacity", "campus"}
CHAMPS_COURS   = {"name", "yearNumber", "_id", "__v"}
CHAMPS_PROMO   = {"name", "diplomaName", "major", "option", "_id", "__v"}
CHAMPS_CAMPUS  = {"_id", "name", "__v", "address"}
CHAMPS_SALLE   = {"_id", "__v", "name", "capacity", "campus"}


# ══════════════════════════════════════════════ le fuseau, à la main
# ══════════════════════════════════════════════════════ le fuseau, à la main
def dernier_dimanche(an, mois):
    """Le dernier dimanche du mois — la date des changements d'heure en UE."""
    jour = 31
    while True:
        d = datetime.date(an, mois, jour)
        if d.weekday() == 6:
            return d
        jour -= 1


def decalage_paris(t):
    """Le décalage de Paris sur UTC, en heures, à l'instant UTC « t ».

    Règle de l'Union européenne : heure d'été du dernier dimanche de mars
    à 01:00 UTC au dernier dimanche d'octobre à 01:00 UTC. Le basculement
    est fixé en UTC pour tous les pays à la fois — c'est pourquoi la
    comparaison se fait sur un instant UTC et non sur une heure locale.
    """
    mars = datetime.datetime.combine(dernier_dimanche(t.year, 3),
                                     datetime.time(1, 0))
    octo = datetime.datetime.combine(dernier_dimanche(t.year, 10),
                                     datetime.time(1, 0))
    return 2 if mars <= t < octo else 1


def utc_vers_paris(iso):
    """« 2026-10-01T07:30:00.000Z » → (datetime UTC, datetime Paris)."""
    if not iso.endswith("Z"):
        raise ValueError(f"horodatage sans « Z », donc sans fuseau : {iso!r}")
    t = datetime.datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S")
    return t, t + datetime.timedelta(hours=decalage_paris(t))


# ══════════════════════════════════════════════════════ la lecture
# ══════════════════════════════════════════════════════════════ la lecture
def verifier_champs(objet, attendus, ou, pbs):
    inconnus = sorted(set(objet) - attendus)
    if inconnus:
        pbs.append(f"{ou} : champ(s) inconnu(s) {', '.join(inconnus)} — "
                   "vérifiez qu'aucun n'est une donnée personnelle, "
                   "puis ajoutez-le à la liste blanche de planning.py")


def salle_de(c, pbs, ou):
    """Le nom de la salle, où qu'il soit dans l'export.

    Dans l'export du hall, la salle est ÉCRASÉE sur le créneau : « name »,
    « capacity » et « campus » sont ceux de la salle, et « _id » du créneau
    a été remplacé par celui de la salle. Un export plus propre pourrait
    imbriquer un objet « room ». Les deux formes sont acceptées.
    """
    if isinstance(c.get("room"), dict):
        s = c["room"]
        verifier_champs(s, CHAMPS_SALLE, f"{ou} → room", pbs)
        return s.get("_id", ""), s.get("name", ""), s.get("capacity"), s.get("campus") or {}
    return c.get("room", ""), c.get("name", ""), c.get("capacity"), c.get("campus") or {}


# ═════════════════════════════════════════════════════════ l'agenda
def plier_ics(ligne):
    """Une ligne iCalendar tient en 75 octets ; la suite est indentée d'un espace.

    Le pliage se compte en OCTETS, pas en caractères : « Mathématiques » fait
    13 caractères et 14 octets, et couper une séquence UTF-8 en deux produit
    un fichier que les agendas refusent. On avance donc caractère par
    caractère en surveillant la taille encodée.
    """
    sorties, courant, taille = [], "", 0
    for c in ligne:
        n = len(c.encode("utf-8"))
        if taille + n > 75:
            sorties.append(courant)
            courant, taille = " ", 1
        courant += c
        taille += n
    sorties.append(courant)
    return sorties


def ech_ics(t):
    """Échappe un texte iCalendar : contre-oblique, point-virgule, virgule."""
    # Un antislash littéral dans une source Python traversée par un
    # heredoc, un patch ou un copier-coller finit par se perdre : celui-ci
    # s'est déjà fait manger une fois. On le nomme.
    OBL = chr(92)
    t = t.replace(OBL, OBL + OBL)
    t = t.replace(";", OBL + ";").replace(",", OBL + ",")
    return t.replace("\n", OBL + "n")


def fichier_ics(plan):
    """Le planning en iCalendar, à souscrire depuis un agenda.

    C'est la seule façon d'obtenir un vrai rappel sans serveur : un site
    statique ne peut rien pousser, mais un agenda qui s'abonne à cette
    adresse relit le fichier de lui-même et déclenche ses alarmes.

    DTSTAMP ne prend PAS l'heure courante. Un horodatage qui bouge à chaque
    génération changerait l'empreinte du site à chaque publication, donc
    purgerait le cache de tout le monde pour rien. Il est dérivé des données.
    """
    sceau = plan["jours"][1].replace("-", "") + "T000000Z"
    lignes = ["BEGIN:VCALENDAR",
              "VERSION:2.0",
              "PRODID:-//BTS CIEL CFA INSTA//planning//FR",
              "CALSCALE:GREGORIAN",
              "METHOD:PUBLISH",
              f"X-WR-CALNAME:BTS CIEL — promo {plan['promo']}",
              "X-WR-TIMEZONE:Europe/Paris",
              "X-PUBLISHED-TTL:PT12H"]
    for c in plan["creneaux"]:
        empreinte = hashlib.md5(
            (c["debut_utc"] + c["fin_utc"] + c["cours"] + c["salle"]).encode()
        ).hexdigest()
        lieu = " · ".join(x for x in (c["salle"], c["campus"]) if x)
        lignes += [
            "BEGIN:VEVENT",
            f"UID:{empreinte}@bts-ciel-cfa-insta",
            f"DTSTAMP:{sceau}",
            "DTSTART:" + c["debut_utc"].replace("-", "").replace(":", ""),
            "DTEND:" + c["fin_utc"].replace("-", "").replace(":", ""),
            "SUMMARY:" + ech_ics(c["cours"]),
            "LOCATION:" + ech_ics(lieu),
            "DESCRIPTION:" + ech_ics(f"Promo {plan['promo']}"),
            "TRANSP:OPAQUE",
            # Un rappel une demi-heure avant : le temps d'un trajet.
            "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY",
            "DESCRIPTION:" + ech_ics(c["cours"]), "END:VALARM",
            "END:VEVENT"]
    lignes.append("END:VCALENDAR")
    plies = []
    for l in lignes:
        plies += plier_ics(l)
    # Le format impose CRLF, et une ligne finale terminée.
    return "\r\n".join(plies) + "\r\n"


# ═══════════════════════════════════ ce que la CI doit calculer pareil
# La récupération, la normalisation et les blocs de semaines vivent ici pour
# la même raison que le fuseau : la mise à jour automatique du dépôt public
# doit produire OCTET POUR OCTET ce que produirait une génération locale.
# Deux implémentations finiraient par diverger, et la divergence ne se
# verrait qu'une fois publiée.
import json
import os
import ssl
import time
import urllib.error
import urllib.request

API = "https://connect.cfa-insta.fr/api/"
PAUSE = 0.35
DELAI = 20
CANDIDATS = [
    "/etc/ssl/cert.pem",                       # macOS
    "/etc/ssl/certs/ca-certificates.crt",      # Debian, Ubuntu — les runners
    "/etc/pki/tls/certs/ca-bundle.crt",        # Fedora, RHEL
    "/opt/homebrew/etc/ca-certificates/cert.pem",
]


def contexte_ssl():
    """Un contexte qui vérifie vraiment le certificat, ou rien.

    Python installé depuis python.org n'utilise pas le trousseau du Mac : son
    magasin reste vide tant qu'on n'a pas lancé « Install Certificates.command ».
    On cherche donc un magasin qui existe, et on dit lequel. Désactiver la
    vérification reviendrait à accepter n'importe quel serveur sous ce nom.
    """
    defaut = ssl.create_default_context()
    if defaut.cert_store_stats()["x509_ca"]:
        return defaut, "magasin par défaut"
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where()), "certifi"
    except ImportError:
        pass
    for chemin in CANDIDATS:
        if os.path.exists(chemin):
            return ssl.create_default_context(cafile=chemin), chemin
    raise SystemExit("aucun magasin de certificats trouvé")


def appeler(chemin, corps=None, ctx=None):
    donnees = json.dumps(corps).encode() if corps is not None else None
    req = urllib.request.Request(
        API + chemin, data=donnees,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST" if corps is not None else "GET")
    with urllib.request.urlopen(req, timeout=DELAI, context=ctx) as r:
        return json.loads(r.read().decode("utf-8"))["data"]


def recuperer(semaines=8, depart=None, dire=print):
    """Les créneaux bruts de l'affichage public, salles jointes.

    Un jour par requête, espacées, week-ends sautés. Ce n'est pas une API à
    marteler. La salle est IMBRIQUÉE et non écrasée sur le créneau : l'écraser
    ferait disparaître le « _id » du cours, et deux cours d'une même salle
    deviendraient indiscernables.
    """
    ctx, origine = contexte_ssl()
    dire(f"certificats : {origine}")
    debut = (datetime.date.fromisoformat(depart) if depart else datetime.date.today())
    jours = [j for j in (debut + datetime.timedelta(days=i)
                         for i in range(semaines * 7)) if j.weekday() < 5]
    salles = {s["_id"]: s for s in appeler("rooms", None, ctx)}
    dire(f"{len(salles)} salle(s) connue(s) · {len(jours)} jours ouvrés, "
         f"du {jours[0]} au {jours[-1]}")

    creneaux, vides, echecs = [], 0, 0
    for j in jours:
        try:
            jour = appeler("courses/public/occurrences/day", {"day": j.isoformat()}, ctx)
        except (urllib.error.URLError, OSError) as e:
            dire(f"  ⚠️  {j} : {e}")
            echecs += 1
            continue
        for c in jour:
            s = salles.get(c.get("room"))
            if s:
                c["room"] = s
        creneaux += jour
        if not jour:
            vides += 1
        time.sleep(PAUSE)
    dire(f"{len(creneaux)} créneau(x) · {vides} jour(s) sans cours · {echecs} échec(s)")
    return creneaux, echecs


def normaliser(bruts, source="api"):
    """Créneaux bruts → créneaux normalisés, dédoublonnés, en heure locale.

    Rien n'est inventé : ce qui manque fait échouer, ce qui est inconnu aussi.
    """
    pbs, creneaux, salles = [], {}, {}
    for i, c in enumerate(bruts):
        ou = f"{source}[{i}]"
        verifier_champs(c, CHAMPS_CRENEAU, ou, pbs)
        cours = c.get("courseId") or {}
        promo = c.get("promoId") or {}
        verifier_champs(cours, CHAMPS_COURS, f"{ou} → courseId", pbs)
        verifier_champs(promo, CHAMPS_PROMO, f"{ou} → promoId", pbs)
        id_salle, nom_salle, capacite, campus = salle_de(c, pbs, ou)
        if campus:
            verifier_champs(campus, CHAMPS_CAMPUS, f"{ou} → campus", pbs)
        try:
            debut_utc, debut = utc_vers_paris(c["start"])
            fin_utc, fin = utc_vers_paris(c["end"])
        except (KeyError, ValueError) as e:
            pbs.append(f"{ou} : {e}")
            continue
        if fin_utc <= debut_utc:
            pbs.append(f"{ou} : le créneau finit avant de commencer")
            continue
        if id_salle and nom_salle:
            ancien = salles.get(id_salle)
            if ancien and ancien["nom"] != nom_salle:
                pbs.append(f"{ou} : la salle {id_salle} s'appelait "
                           f"« {ancien['nom']} », maintenant « {nom_salle} »")
            salles[id_salle] = {"nom": nom_salle, "capacite": capacite,
                                "campus": campus.get("name", "")}
        creneaux[(promo.get("name", ""), debut.isoformat(timespec="minutes"),
                  fin.isoformat(timespec="minutes"),
                  cours.get("name", ""), nom_salle)] = {
            "promo": promo.get("name", ""),
            "diplome": (promo.get("diplomaName") or "").strip(),
            "option": promo.get("option") or "",
            "cours": (cours.get("name") or "").strip(),
            "annee": cours.get("yearNumber"),
            "debut": debut.isoformat(timespec="minutes"),
            "fin": fin.isoformat(timespec="minutes"),
            "debut_utc": debut_utc.isoformat(timespec="seconds") + "Z",
            "fin_utc": fin_utc.isoformat(timespec="seconds") + "Z",
            "salle": nom_salle,
            "campus": campus.get("name", ""),
            "presence": c.get("attendanceType", ""),
        }
    return (sorted(creneaux.values(), key=lambda c: (c["debut"], c["salle"])),
            salles, pbs)


def public(creneaux, promo):
    """Ce qui part sur le site : notre promo, sans un identifiant interne."""
    import re as _re
    nous = [c for c in creneaux if c["promo"] == promo]
    if not nous:
        return None, [c["promo"] for c in creneaux]
    jours = sorted({c["debut"][:10] for c in nous})
    d = {"promo": promo, "jours": [jours[0], jours[-1]],
         "creneaux": [{k: v for k, v in c.items() if k != "promo"} for c in nous]}
    if _re.search(r"[0-9a-f]{24}", json.dumps(d)):
        raise SystemExit("un identifiant interne figure dans la sortie publique")
    return d, None


# ═══════════════════════════════════════════════ le rendu des semaines
JOURS_SEM = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS_AN = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
           "août", "septembre", "octobre", "novembre", "décembre"]


def ech(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                  .replace("&amp;amp;", "&amp;").replace("&amp;lt;", "&lt;")
                  .replace("&amp;gt;", "&gt;"))


def jour_long(d):
    """« 2026-10-01 » → « jeudi 1er octobre 2026 »."""
    an, mo, jo = (int(x) for x in d.split("-"))
    q = datetime.date(an, mo, jo)
    return f"{JOURS_SEM[q.weekday()]} {'1er' if jo == 1 else jo} {MOIS_AN[mo - 1]} {an}"


def blocs_semaines(plan):
    """Les sections « une semaine », telles qu'elles vont dans la page."""
    semaines = {}
    for c in plan["creneaux"]:
        an, mo, jo = (int(x) for x in c["debut"][:10].split("-"))
        iso = datetime.date(an, mo, jo).isocalendar()
        semaines.setdefault(f"{iso[0]}-S{iso[1]:02d}", {}) \
                .setdefault(c["debut"][:10], []).append(c)
    blocs = []
    for cle in sorted(semaines):
        jours = []
        for j in sorted(semaines[cle]):
            lignes = ""
            for c in sorted(semaines[cle][j], key=lambda c: c["debut"]):
                lieu = " · ".join(x for x in (c["salle"], c["campus"]) if x)
                lignes += (
                    f'          <li class="plan-creneau" data-debut="{c["debut"]}"'
                    f' data-fin="{c["fin"]}">\n'
                    f'            <span class="plan-h"><b>{c["debut"][11:]}</b>'
                    f'<i>{c["fin"][11:]}</i></span>\n'
                    f'            <span class="plan-cours">{ech(c["cours"])}</span>\n'
                    f'            <span class="plan-salle">{ech(lieu)}</span>\n'
                    "          </li>\n")
            jours.append(f'        <article class="plan-jour" data-jour="{j}">\n'
                         f"          <h3>{jour_long(j)}</h3>\n"
                         f"          <ol>\n{lignes}          </ol>\n"
                         "        </article>")
        premier, dernier = min(semaines[cle]), max(semaines[cle])
        titre = (jour_long(premier) if premier == dernier
                 else f"du {jour_long(premier)} au {jour_long(dernier)}")
        blocs.append(f'    <section class="plan-semaine" data-semaine="{cle}"'
                     f' data-titre="{ech(titre)}" hidden>\n'
                     + "\n".join(jours) + "\n    </section>")
    return "\n".join(blocs)



# ═════════════════════════════ à quelle matière appartient un cours
# ── À quelle matière appartient un cours ────────────────────────────────
# L'API ne le dit pas : elle donne un intitulé. Le rattachement se fait ici,
# à la génération, sur des mots-clés — pas dans le navigateur, pour qu'il
# soit relisible et qu'une erreur se voie dans le HTML produit.
# L'ordre compte : « réseaux informatiques » contient « informatique ».
MATIERES_COURS = [
    ("reseau",  ("réseau", "reseau", "infrastructur", "cyber", "sécurité",
                 "securite", "système", "systeme", "exploitation",
                 "maintenance", "valorisation de la donnée")),
    ("maths",   ("math",)),
    ("anglais", ("anglais", "english")),
    ("culture", ("culture générale", "culture generale", "expression",
                 "français", "francais")),
    ("dev",     ("développement", "developpement", "programmation", "langage",
                 "logiciel", "algorithm", "web", "informatique")),
]


def matiere_du_cours(nom):
    """La matière d'un intitulé de cours, « projets » si on ne sait pas."""
    n = nom.lower()
    for cle, mots in MATIERES_COURS:
        if any(m in n for m in mots):
            return cle
    return "projets"
