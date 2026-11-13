#!/usr/bin/env python3
"""Relever les titres de l'actualité tech, pour la page « Actu » du site.

Demandé le 13 novembre 2026 : une page d'actualités qui réunit plusieurs
sites, avec un filtre par site.

Ce que ce script prend, et ce qu'il laisse.

**Il lit les flux RSS, et rien d'autre.** Un flux est ce qu'un site publie
exprès pour être relu ailleurs. On en garde quatre choses par article : le
titre, l'adresse, la date, et l'adresse de la vignette. **Le texte des
articles n'est jamais recopié** : il appartient à ceux qui l'ont écrit, et ce
dépôt est public. La page affiche le titre ; l'article se lit chez son
éditeur, un clic plus loin.

**Les images ne sont pas copiées non plus.** On n'enregistre que leur
adresse, et seulement si elle pointe chez l'éditeur lui-même (liste blanche
par source). C'est le navigateur du lecteur qui va les chercher, s'il le veut.

**Rien n'est effacé.** Chaque jour a son fichier, `jours/AAAA-MM-JJ.json`,
et `index.json` en tient la liste : la page charge les jours un par un, en
descendant. Un article déjà vu garde sa place ; seul son titre peut être
rafraîchi.

**Chaque titre passe le garde-fou du site** avant d'être écrit : un numéro de
téléphone, une adresse, un nom de la liste privée, et l'article est écarté.
C'est le MÊME contrôle que celui de la publication (`verifier.personnel`),
chargé depuis le site lui-même, pas une copie.

    python3 outillage/actu.py                 le relevé de l'heure (le robot)
    python3 actu.py --vers ../../../bts-ciel-CFA-Insta --remonter 8
                                              premier remplissage, à la main
    python3 actu.py --essai                   l'autotest, sans réseau

Aucune dépendance : la bibliothèque standard, et c'est tout.
"""
import datetime
import email.utils
import gzip
import html
import importlib.util
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ICI = os.path.dirname(os.path.abspath(__file__))

# Un nom de client générique : ni adresse, ni nom, ni dépôt.
UA = "Mozilla/5.0 (compatible; lecteur-de-flux-rss/1.0)"
TAILLE_MAX = 3_000_000        # un flux plus gros que ça n'est pas un flux
PAUSE = 0.6                   # secondes entre deux requêtes : on ne martèle pas
ANCIENNETE_MAX = 45           # jours : au-delà, c'est un article épinglé, pas une actualité
APERCUS_PAR_RELEVE = 12       # pages d'article relues pour leur vignette, au plus
MEMOIRE_JOURS = 14            # un article redaté dans ce délai n'entre pas deux fois

# ── Les sources ───────────────────────────────────────────────────────────
# « liens » et « images » sont des listes BLANCHES d'hôtes : une adresse qui
# sort de chez l'éditeur n'entre pas. « pages » : certains flux ne donnent que
# quinze articles, on en lit donc deux pages pour ne rien manquer entre deux
# relevés ; « pagine » dit qu'on peut en demander davantage (« ?paged=3 »). « couleur » peint la vignette de repli (les initiales) : ce sont
# des teintes choisies ici, mesurées à 4,5:1 au moins sous du blanc, pas les
# couleurs de marque.
SOURCES = [
    {"id": "iphonesoft", "nom": "iPhoneSoft", "sigle": "iS", "couleur": "#1657A6",
     "site": "https://iphonesoft.fr/",
     "flux": "https://feeds.feedburner.com/iphonesoft", "pages": 1,
     "liens": ("iphonesoft.fr",), "images": ("iphonesoft.fr",)},
    {"id": "igen", "nom": "iGen", "sigle": "iG", "couleur": "#0B7A53",
     "site": "https://www.igen.fr/",
     "flux": "https://rss.igen.fr", "pages": 1,
     "liens": ("igen.fr",), "images": ()},
    {"id": "mac4ever", "nom": "Mac4Ever", "sigle": "M4", "couleur": "#B3261E",
     "site": "https://www.mac4ever.com/",
     "flux": "https://www.mac4ever.com/flux/rss/content/all", "pages": 1,
     "liens": ("mac4ever.com",), "images": ("img-api.mac4ever.com",),
     # Ce flux ne porte pas d'image : on lit l'aperçu que la page d'article
     # déclare pour les partages, et on demande la petite taille que le
     # serveur d'images sait rendre.
     "apercu": True,
     "image_regle": (r"^(https://img-api\.mac4ever\.com)/\d+/\d+/", r"\1/300/0/")},
    {"id": "frandroid", "nom": "Frandroid", "sigle": "Fr", "couleur": "#C2410C",
     "site": "https://www.frandroid.com/",
     "flux": "https://www.frandroid.com/feed", "pages": 2, "pagine": True,
     "liens": ("frandroid.com",), "images": ("img.frandroid.com", "images.frandroid.com")},
    {"id": "lesnumeriques", "nom": "Les Numériques", "sigle": "LN", "couleur": "#7B2CBF",
     "site": "https://www.lesnumeriques.com/",
     "flux": "https://www.lesnumeriques.com/rss.xml", "pages": 1,
     "liens": ("lesnumeriques.com",), "images": ("cdn.lesnumeriques.com",)},
    {"id": "numerama", "nom": "Numerama", "sigle": "Nu", "couleur": "#B5176B",
     "site": "https://www.numerama.com/",
     "flux": "https://www.numerama.com/feed/", "pages": 2, "pagine": True,
     "liens": ("numerama.com",), "images": ("img.numerama.com",)},
    {"id": "jdg", "nom": "Journal du Geek", "sigle": "JG", "couleur": "#0F6E78",
     "site": "https://www.journaldugeek.com/",
     "flux": "https://www.journaldugeek.com/feed/", "pages": 1, "pagine": True,
     "liens": ("journaldugeek.com",), "images": ("journaldugeek.com",)},
]

MEDIA = "{http://search.yahoo.com/mrss/}"
CONTENU = "{http://purl.org/rss/1.0/modules/content/}encoded"
DC_DATE = "{http://purl.org/dc/elements/1.1/}date"
ATOM = "{http://www.w3.org/2005/Atom}"
# Écrits par leur code, pour qu'aucun caractère invisible ne traîne dans ce fichier.
TIRET_LONG = chr(0x2014)
INVISIBLES = re.compile("[" + "".join(chr(c) for c in list(range(0x20)) + [0x7F, 0x200B, 0x2028, 0x2029, 0xFEFF]) + "]")
PISTAGE = re.compile(r"^(?:utm_.*|xtor|at_medium|at_campaign|fbclid|gclid|mc_cid|mc_eid)$", re.I)


# ── Le magasin de certificats ─────────────────────────────────────────────
# Python de python.org n'utilise pas le trousseau du Mac. On cherche un
# magasin qui existe ; on ne désactive JAMAIS la vérification.
def contexte_ssl():
    defaut = ssl.create_default_context()
    if defaut.cert_store_stats()["x509_ca"]:
        return defaut
    for chemin in ("/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt",
                   "/etc/pki/tls/certs/ca-bundle.crt",
                   "/opt/homebrew/etc/ca-certificates/cert.pem"):
        if os.path.exists(chemin):
            return ssl.create_default_context(cafile=chemin)
    raise SystemExit("  aucun magasin de certificats trouvé : le relevé ne part pas")


def telecharger(url, ctx, limite=TAILLE_MAX):
    """Les octets d'une adresse https, bornés, décompressés."""
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept-Encoding": "gzip",
        "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5"})
    with urllib.request.urlopen(req, timeout=25, context=ctx) as rep:
        brut = rep.read(limite + 1)
        if rep.headers.get("Content-Encoding", "").lower() == "gzip":
            brut = gzip.decompress(brut)
    if len(brut) > limite:
        raise ValueError("réponse trop grosse")
    return brut


# ── Nettoyer ce qu'on lit ─────────────────────────────────────────────────
def texte_nu(s):
    """Un titre : sans balise, sans entité (même encodée deux fois), sur une ligne."""
    s = s or ""
    for _ in range(3):
        neuf = html.unescape(s)
        if neuf == s:
            break
        s = neuf
    s = re.sub(r"<[^>]*>", "", s)
    s = INVISIBLES.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # Le tiret long ne s'écrit pas sur ce site (règle de lecture) : deux-points,
    # ou une virgule si le titre a déjà les siens.
    if TIRET_LONG in s:
        s = re.sub(r"\s*" + TIRET_LONG + r"\s*", ", " if ":" in s else " : ", s).strip(" :,")
    return s[:220]


def hote_permis(hote, permis):
    hote = (hote or "").lower()
    return any(hote == h or hote.endswith("." + h) for h in permis)


def adresse_propre(u, permis):
    """Une adresse https chez un hôte permis, sans pistage ni ancre ; sinon None."""
    try:
        p = urllib.parse.urlsplit((u or "").strip())
    except ValueError:
        return None
    if p.scheme not in ("http", "https") or not hote_permis(p.hostname, permis):
        return None
    if p.username or p.password or len(u) > 600:
        return None
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True)
         if not PISTAGE.match(k)]
    chemin = urllib.parse.quote(urllib.parse.unquote(p.path), safe="/%:@!$&'()*+,;=~-._")
    return urllib.parse.urlunsplit(("https", p.netloc.lower(), chemin,
                                    urllib.parse.urlencode(q), ""))


def date_utc(s):
    """Une date de flux (RFC 822 ou ISO 8601) en UTC, ou None."""
    s = (s or "").strip()
    if not s:
        return None
    try:
        d = email.utils.parsedate_to_datetime(s)
    except (TypeError, ValueError, IndexError):
        d = None
    if d is None:
        try:
            d = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=datetime.timezone.utc)
    return d.astimezone(datetime.timezone.utc)


def premiere_image(fragment):
    m = re.search(r"""<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)""", html.unescape(fragment or ""), re.I)
    return m.group(1) if m else None


def lire_flux(octets):
    """Les articles d'un flux RSS ou Atom : [{titre, lien, date, image}].

    Un flux qui déclare une DTD ou des entités est refusé : c'est par là
    qu'un document XML fait gonfler la mémoire de celui qui le lit."""
    if b"<!DOCTYPE" in octets[:4000] or b"<!ENTITY" in octets:
        raise ValueError("flux refusé : il déclare une DTD")
    racine = ET.fromstring(octets)
    out = []
    # RSS 2.0 n'a pas d'espace de noms, RSS 1.0 (RDF) en a un : « item »,
    # « title » et « link » s'y appellent pareil, mais préfixés. On lit donc
    # le nom LOCAL. Le premier relevé a rendu zéro article pour une source
    # entière avant que ce soit le cas, et c'est le plancher qui l'a dit.
    def local(e):
        return e.tag.rsplit("}", 1)[-1]

    for it in racine.iter():
        if local(it) != "item":
            continue
        champs = {}
        for e in it:
            champs.setdefault(local(e) if not e.tag.startswith(MEDIA) else e.tag, e.text)
        image = None
        for balise, attr in ((MEDIA + "thumbnail", "url"), (MEDIA + "content", "url"),
                             ("enclosure", "url")):
            for e in it.iter(balise):
                genre = (e.get("type") or e.get("medium") or "image").lower()
                if e.get(attr) and "image" in genre:
                    image = e.get(attr)
                    break
            if image:
                break
        if not image:
            image = premiere_image(champs.get("encoded")) or premiere_image(champs.get("description"))
        out.append({"titre": champs.get("title"), "lien": champs.get("link"),
                    "date": champs.get("pubDate") or champs.get("date"), "image": image})
    for it in racine.iter(ATOM + "entry"):
        lien = None
        for l in it.findall(ATOM + "link"):
            if l.get("rel", "alternate") == "alternate" and l.get("href"):
                lien = l.get("href")
                break
        image = None
        for e in list(it.iter(MEDIA + "thumbnail")) + list(it.iter(MEDIA + "content")):
            if e.get("url"):
                image = e.get("url")
                break
        if not image:
            image = (premiere_image(it.findtext(ATOM + "summary"))
                     or premiere_image(it.findtext(ATOM + "content")))
        out.append({"titre": it.findtext(ATOM + "title"), "lien": lien,
                    "date": it.findtext(ATOM + "published") or it.findtext(ATOM + "updated"),
                    "image": image})
    return out


def image_propre(u, src):
    u = adresse_propre(u, src["images"]) if (u and src["images"]) else None
    if u and src.get("image_regle"):
        u = re.sub(src["image_regle"][0], src["image_regle"][1], u)
    return u


def normaliser(brut, src, maintenant):
    """Un article de flux devient une ligne publiable, ou None."""
    titre = texte_nu(brut.get("titre"))
    lien = adresse_propre(brut.get("lien"), src["liens"])
    if len(titre) < 8 or not lien:
        return None
    d = date_utc(brut.get("date")) or maintenant
    if d > maintenant + datetime.timedelta(minutes=10):
        d = maintenant                      # une date dans le futur : horloge du site
    if d < maintenant - datetime.timedelta(days=ANCIENNETE_MAX):
        return None
    art = {"s": src["id"], "t": titre, "u": lien,
           "d": d.strftime("%Y-%m-%dT%H:%M:%SZ")}
    image = image_propre(brut.get("image"), src)
    if image:
        art["i"] = image
    return art


# ── L'heure de Paris, pour ranger un article dans SON jour ────────────────
def _dernier_dimanche(annee, mois):
    d = datetime.datetime(annee, mois + 1, 1, 1, tzinfo=datetime.timezone.utc) \
        - datetime.timedelta(days=1)
    return d - datetime.timedelta(days=(d.weekday() + 1) % 7)


def jour_de_paris(iso_utc):
    """« 2026-11-13T23:30:00Z » → « 2026-11-14 » : la règle européenne, de
    1 h UTC le dernier dimanche de mars à 1 h UTC le dernier d'octobre."""
    d = datetime.datetime.strptime(iso_utc, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=datetime.timezone.utc)
    ete = _dernier_dimanche(d.year, 3) <= d < _dernier_dimanche(d.year, 10)
    return (d + datetime.timedelta(hours=2 if ete else 1)).strftime("%Y-%m-%d")


# ── Le garde-fou du site, chargé depuis le site ───────────────────────────
def charger_garde(racine):
    chemin = os.path.join(racine, "verification", "verifier.py")
    if not os.path.isfile(chemin):
        raise SystemExit(f"  {chemin} est introuvable : sans garde-fou, rien n'est écrit.\n"
                         "  (depuis le dépôt privé : --vers <dossier du site publié>)")
    # La liste des noms ne vit que dans le dépôt privé. Là où elle existe, on
    # s'en sert ; dans le dépôt public elle manque, et c'est voulu.
    prive = os.path.join(ICI, "..", "noms-prives.txt")
    if os.path.isfile(prive):
        os.environ.setdefault("NOMS_PRIVES", os.path.abspath(prive))
    spec = importlib.util.spec_from_file_location("verifier_du_site", chemin)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.personnel


def refuse(personnel, *textes):
    pbs = []
    personnel(" \n ".join(t for t in textes if t), "actu", pbs)
    return bool(pbs)


# ── Lire et écrire les jours ──────────────────────────────────────────────
def dossier_donnees(racine):
    return os.path.join(racine, "actu", "donnees")


def lire_jour(racine, jour):
    chemin = os.path.join(dossier_donnees(racine), "jours", jour + ".json")
    if not os.path.isfile(chemin):
        return []
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def texte_jour(articles):
    """Un article par ligne : un relevé qui en ajoute deux change deux lignes."""
    articles = sorted(articles, key=lambda a: (a["d"], a["u"]), reverse=True)
    lignes = [json.dumps(a, ensure_ascii=False, separators=(",", ":")) for a in articles]
    return "[\n" + ",\n".join(lignes) + "\n]\n"


def jours_presents(racine):
    d = os.path.join(dossier_donnees(racine), "jours")
    if not os.path.isdir(d):
        return []
    return sorted((f[:-5] for f in os.listdir(d)
                   if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.json", f)), reverse=True)


def ecrire(chemin, texte):
    """N'écrit que si le contenu change. Rend True s'il a écrit."""
    if os.path.isfile(chemin):
        with open(chemin, encoding="utf-8") as f:
            if f.read() == texte:
                return False
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(texte)
    return True


def fusionner(racine, releves, personnel):
    """Range les articles relevés dans leurs jours. Rend (neufs, écartés)."""
    if not releves:
        return 0, 0
    # On relit deux semaines de plus que le plus vieil article relevé : un site
    # qui REDATE un article (mise à jour, remontée en une) le ferait sinon
    # entrer une seconde fois, dans un autre jour. Attrapé par l'autotest.
    plus_vieux = min(jour_de_paris(a["d"]) for a in releves)
    seuil = (datetime.date.fromisoformat(plus_vieux)
             - datetime.timedelta(days=MEMOIRE_JOURS)).isoformat()
    jours = {j: lire_jour(racine, j) for j in jours_presents(racine) if j >= seuil}
    connus = {a["u"]: a for arts in jours.values() for a in arts}
    neufs = ecartes = 0
    touches = set()
    for a in releves:
        if refuse(personnel, a["t"], a["u"]):
            ecartes += 1
            continue
        if a.get("i") and refuse(personnel, a["i"]):
            del a["i"]                      # l'adresse de l'image seule est en cause
        ancien = connus.get(a["u"])
        if ancien is not None:
            # Déjà rangé : il garde sa date et son jour. Seuls le titre et la
            # vignette suivent ce que le site publie maintenant.
            for cle in ("t", "i"):
                if a.get(cle) and ancien.get(cle) != a[cle]:
                    ancien[cle] = a[cle]
                    touches.add(jour_de_paris(ancien["d"]))
            continue
        j = jour_de_paris(a["d"])
        jours.setdefault(j, []).append(a)
        connus[a["u"]] = a
        touches.add(j)
        neufs += 1
    for j in touches:
        ecrire(os.path.join(dossier_donnees(racine), "jours", j + ".json"), texte_jour(jours[j]))
    return neufs, ecartes


def ecrire_index(racine, maintenant):
    """La liste des jours, avec leur nombre de titres. Ne change que si un
    jour a changé. La liste des SITES n'y est pas : la page la porte déjà,
    écrite à la publication depuis SOURCES, et deux listes divergent."""
    jours = []
    for j in jours_presents(racine):
        n = len(lire_jour(racine, j))
        if n:
            jours.append([j, n])
    chemin = os.path.join(dossier_donnees(racine), "index.json")
    ancien = {}
    if os.path.isfile(chemin):
        with open(chemin, encoding="utf-8") as f:
            ancien = json.load(f)
    if ancien.get("jours") == jours:
        return False
    neuf = {"maj": maintenant.strftime("%Y-%m-%dT%H:%M:%SZ"), "jours": jours}
    return ecrire(chemin, json.dumps(neuf, ensure_ascii=False, indent=1) + "\n")


# ── Le relevé ─────────────────────────────────────────────────────────────
def apercu_de_page(url, ctx):
    """L'image qu'une page d'article déclare pour ses partages (og:image)."""
    tete = telecharger(url, ctx, limite=400_000)[:200_000].decode("utf-8", "replace")
    for motif in (r"""<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)""",
                  r"""<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']"""):
        m = re.search(motif, tete, re.I)
        if m:
            return html.unescape(m.group(1))
    return None


def relever(src, ctx, pages, maintenant):
    """Tous les articles d'une source, normalisés. Lève si le flux ne répond pas."""
    arts, vus = [], set()
    for n in range(1, pages + 1):
        url = src["flux"] if n == 1 else src["flux"] + ("&" if "?" in src["flux"] else "?") + f"paged={n}"
        try:
            bruts = lire_flux(telecharger(url, ctx))
        except (urllib.error.URLError, OSError, ValueError, ET.ParseError):
            if n == 1:
                raise
            break                           # une page de plus qui manque n'est pas une panne
        avant = len(arts)
        for b in bruts:
            a = normaliser(b, src, maintenant)
            if a and a["u"] not in vus:
                vus.add(a["u"])
                arts.append(a)
        if len(arts) == avant:
            break
        if n < pages:
            time.sleep(PAUSE)
    return arts


def main(argv):
    if "--essai" in argv:
        return essai()
    racine = os.path.abspath(argv[argv.index("--vers") + 1]) if "--vers" in argv \
        else os.path.dirname(ICI)
    remonter = int(argv[argv.index("--remonter") + 1]) if "--remonter" in argv else 0
    personnel = charger_garde(racine)
    ctx = contexte_ssl()
    maintenant = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)

    deja = set()
    for j in jours_presents(racine)[:ANCIENNETE_MAX + 2]:
        deja.update(a["u"] for a in lire_jour(racine, j))

    tous, pannes = [], []
    for src in SOURCES:
        # Au premier remplissage, les flux paginés remontent plus loin.
        pages = max(src["pages"], remonter) if src.get("pagine") else src["pages"]
        try:
            arts = relever(src, ctx, pages, maintenant)
        except (urllib.error.URLError, OSError, ValueError, ET.ParseError) as e:
            pannes.append(src["nom"])
            print(f"  ⚠️  {src['nom']} : flux illisible ({type(e).__name__}: {str(e)[:80]})")
            time.sleep(PAUSE)
            continue
        if not arts:
            print(f"  ⚠️  {src['nom']} : le flux répond, mais aucun article n'y est lisible")
        if src.get("apercu"):
            reste = 120 if remonter else APERCUS_PAR_RELEVE
            for a in arts:
                if reste <= 0:
                    break
                if "i" in a or a["u"] in deja:
                    continue
                reste -= 1
                time.sleep(PAUSE)
                try:
                    image = image_propre(apercu_de_page(a["u"], ctx), src)
                except (urllib.error.URLError, OSError, ValueError):
                    image = None
                if image:
                    a["i"] = image
        print(f"  {src['nom']:<16} {len(arts):>3} article(s) lus, "
              f"{sum(1 for a in arts if a['u'] not in deja):>3} nouveau(x)")
        tous.extend(arts)
        time.sleep(PAUSE)

    # Le plancher : la moitié des sources en panne, et c'est le relevé qui est
    # en cause (réseau, certificat), pas les sites. On n'écrit rien.
    if len(pannes) * 2 > len(SOURCES):
        print(f"  ✗ {len(pannes)} source(s) sur {len(SOURCES)} en panne : rien n'est écrit")
        return 1
    neufs, ecartes = fusionner(racine, tous, personnel)
    change = ecrire_index(racine, maintenant)
    print(f"  {neufs} article(s) ajouté(s), {ecartes} écarté(s) par le garde-fou"
          + ("" if change or neufs else " : rien de neuf"))
    return 0


# ── L'autotest, sans réseau ───────────────────────────────────────────────
RSS_ESSAI = """<?xml version="1.0"?><rss version="2.0"
 xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"
 xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>x</title>
<item><title>Un &amp;eacute;cran pliable &lt;b&gt;arrive&lt;/b&gt; @TIRET@ enfin</title>
 <link>http://www.exemple-a.fr/2026/11/ecran?utm_source=rss&amp;p=3#suite</link>
 <pubDate>Fri, 13 Nov 2026 23:30:00 +0100</pubDate>
 <media:content url="https://img.exemple-a.fr/a.jpg" medium="image"/></item>
<item><title>Appelez le @TEL@ pour gagner</title>
 <link>https://www.exemple-a.fr/2026/11/concours</link><dc:date>2026-11-13T09:00:00+01:00</dc:date></item>
<item><title>Image glissée dans le texte, lien hors de chez l'éditeur écarté</title>
 <link>https://www.exemple-a.fr/2026/11/image</link><pubDate>Fri, 13 Nov 2026 08:00:00 +0000</pubDate>
 <content:encoded><![CDATA[<p><img src="https://ailleurs.example/x.png"> texte</p>]]></content:encoded></item>
<item><title>Un lien qui sort du site</title><link>https://autre.example/x</link></item>
<item><title>Trop vieux pour être une actualité</title>
 <link>https://www.exemple-a.fr/2020/vieux</link><pubDate>Mon, 05 Oct 2020 10:00:00 +0200</pubDate></item>
</channel></rss>""".replace("@TEL@", "06 12 " + "34 56 79").replace("@TIRET@", chr(0x2014)).encode("utf-8")
# (le numéro factice est assemblé ici : le garde-fou relit aussi ce fichier)

RDF_ESSAI = """<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
 xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<item rdf:about="x"><title>Un flux en RDF, avec ses balises préfixées</title>
 <link>https://www.exemple-a.fr/rdf/1</link><dc:date>2026-11-13T09:42:00+01:00</dc:date>
 <description>&lt;p&gt;&lt;img src='https://img.exemple-a.fr/c.jpg' /&gt;texte&lt;/p&gt;</description></item>
</rdf:RDF>""".encode("utf-8")

ATOM_ESSAI = """<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"
 xmlns:media="http://search.yahoo.com/mrss/">
<entry><title>Un titre en Atom, lu comme les autres</title>
 <link rel="alternate" href="https://www.exemple-a.fr/atom/1"/>
 <updated>2026-11-13T22:59:59Z</updated><media:content url="https://img.exemple-a.fr/b.webp"/></entry>
</feed>""".encode("utf-8")


def essai():
    import tempfile
    src = {"id": "a", "nom": "A", "sigle": "A", "couleur": "#000000", "site": "https://www.exemple-a.fr/",
           "liens": ("exemple-a.fr",), "images": ("img.exemple-a.fr",)}
    t0 = datetime.datetime(2026, 11, 13, 23, 0, tzinfo=datetime.timezone.utc)
    arts = [a for a in (normaliser(b, src, t0) for b in lire_flux(RSS_ESSAI) + lire_flux(ATOM_ESSAI) + lire_flux(RDF_ESSAI)) if a]
    par = {a["u"]: a for a in arts}
    n = [0]

    def vrai(cond, quoi):
        n[0] += 1
        assert cond, "ÉCHEC : " + quoi

    u1 = "https://www.exemple-a.fr/2026/11/ecran?p=3"
    vrai(u1 in par, "le lien est passé en https, sans pistage ni ancre")
    vrai(par[u1]["t"] == "Un écran pliable arrive : enfin", "titre : entités deux fois, balises, tiret long")
    vrai(par[u1]["d"] == "2026-11-13T22:30:00Z", "date RFC 822 ramenée en UTC")
    vrai(par[u1]["i"] == "https://img.exemple-a.fr/a.jpg", "vignette lue dans media:content")
    vrai("i" not in par["https://www.exemple-a.fr/2026/11/image"], "image d'un autre hôte écartée")
    vrai(par["https://www.exemple-a.fr/atom/1"]["i"].endswith("b.webp"), "Atom : lien, date, vignette")
    rdf = par.get("https://www.exemple-a.fr/rdf/1", {})
    vrai(rdf.get("d") == "2026-11-13T08:42:00Z" and rdf.get("i", "").endswith("c.jpg"),
         "RDF : titre, lien, date ISO et image du texte")
    vrai(not any("autre.example" in u for u in par), "lien hors de chez l'éditeur écarté")
    vrai(not any("vieux" in u for u in par), "article de 2020 écarté")
    vrai(jour_de_paris("2026-11-13T22:30:00Z") == "2026-11-13", "hiver : 23 h 30 à Paris, même jour")
    vrai(jour_de_paris("2026-11-13T23:30:00Z") == "2026-11-14", "hiver : minuit passé à Paris")
    vrai(jour_de_paris("2026-07-01T22:30:00Z") == "2026-07-02", "été : UTC+2")
    try:
        import zoneinfo
        paris = zoneinfo.ZoneInfo("Europe/Paris")
        d = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
        while d.year < 2029:
            iso = d.strftime("%Y-%m-%dT%H:%M:%SZ")
            vrai(jour_de_paris(iso) == d.astimezone(paris).strftime("%Y-%m-%d"), "fuseau à " + iso)
            d += datetime.timedelta(minutes=30)
    except Exception as e:                    # pas de base de fuseaux : dit, pas tu
        if isinstance(e, AssertionError):
            raise
        print("  (base de fuseaux absente : la règle d'été n'est pas recoupée ici)")
    try:
        lire_flux(b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><rss/>')
        vrai(False, "une DTD doit être refusée")
    except ValueError:
        vrai(True, "DTD refusée")

    # Le garde-fou, la fusion, et le second passage qui ne doit rien écrire.
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, "verification"))
        with open(os.path.join(tmp, "verification", "verifier.py"), "w", encoding="utf-8") as f:
            f.write("import re\ndef personnel(h, rel, pbs):\n"
                    "    if re.search(r'(?<![\\w-])0[1-9](?:[ .-]\\d{2}){4}(?![\\w-])', h): pbs.append((rel, 'tel'))\n")
        personnel = charger_garde(tmp)
        neufs, ecartes = fusionner(tmp, [dict(a) for a in arts], personnel)
        vrai((neufs, ecartes) == (4, 1), f"4 articles rangés, 1 écarté (numéro de téléphone) : {neufs}, {ecartes}")
        vrai(jours_presents(tmp) == ["2026-11-13"], "un seul jour écrit")
        vrai(ecrire_index(tmp, t0), "index écrit")
        fichier = os.path.join(dossier_donnees(tmp), "jours", "2026-11-13.json")
        avant = open(fichier, encoding="utf-8").read()
        vrai(avant.count("\n") == 6, "un article par ligne")
        neufs, _ = fusionner(tmp, [dict(a) for a in arts], personnel)
        vrai(neufs == 0 and open(fichier, encoding="utf-8").read() == avant, "second passage : rien ne change")
        vrai(not ecrire_index(tmp, t0 + datetime.timedelta(hours=1)), "index inchangé si rien de neuf")
        retitre = dict(par[u1], t="Un écran pliable arrive, et il tient", d="2026-11-14T10:00:00Z")
        neufs, _ = fusionner(tmp, [retitre], personnel)
        relu = {a["u"]: a for a in lire_jour(tmp, "2026-11-13")}
        vrai(neufs == 0 and relu[u1]["t"].endswith("il tient") and relu[u1]["d"] == par[u1]["d"]
             and jours_presents(tmp) == ["2026-11-13"], "titre rafraîchi, date et jour gardés")
    print(f"  autotest : {n[0]} vérifications, toutes justes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
