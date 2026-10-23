# Le salon — architecture

Une messagerie de classe **sans Internet et sans serveur**, dans l'esprit de
BitChat : chaque appareil est un nœud qui relaie pour les autres. Une page
(`outils/salon.html`), des modules ES natifs (`outils/salon/src/`), **aucune
dépendance, aucune compilation**. Les bancs : `node outils/salon/tests/tout.mjs`.

Ce fichier est la référence. Une règle qui change ici change dans le code.

---

## 1. Ce qui est fait, et ce qui ne peut pas l'être dans un navigateur

| BitChat (application installée) | Le salon (une page web) | Pourquoi |
| --- | --- | --- |
| Maillage Bluetooth LE | **WebRTC** sur le Wi-Fi de la salle | Une page ne peut ni émettre ni relayer en Bluetooth : Web Bluetooth ne sait que se connecter, en client, à un appareil qui émet. |
| Découverte automatique | **Présentation par QR code** (ou code copié) | Sans serveur, deux navigateurs doivent échanger une fois « offre » et « réponse ». |
| Nostr, canaux Geohash | **Non fait** | Exige Internet (des relais publics) et la position : contraire à « sans Internet ». |
| RSSI (dBm) dans `/who` | Sauts et temps d'aller-retour | WebRTC ne donne aucune mesure radio. |
| X25519 / Ed25519, Noise | ECDH / ECDSA **P-256**, ECIES | P-256 est dans tous les navigateurs ; X25519 pas encore partout. |
| Argon2id | **PBKDF2** (210 000 tours, SHA-256) | Web Crypto n'a pas Argon2. |

Plusieurs **onglets** d'un même navigateur sont autant de nœuds, reliés par
`BroadcastChannel` ; un onglet relié en WebRTC sert de pont aux autres.

---

## 2. Arborescence

```
outils/salon.html            la page
outils/salon/salon.css       le style (sombre par défaut, clair au choix)
outils/salon/src/
  crypto.js                  Web Crypto : identité, signatures, ECIES, salons à mot de passe
  noeud.js                   le nœud : liens, TTL, anti-doublons, stockage, réception
  transports.js              BroadcastChannel (onglets) et WebRTC (appareils)
  signal.js                  l'offre / réponse WebRTC réduite à ~100 caractères
  qr.js                      encodeur QR (ISO/IEC 18004), Reed-Solomon
  qr-lecture.js              lecteur QR : binarisation, repères, perspective, correction
  camera.js                  caméra ou photo → texte du QR (BarcodeDetector si présent)
  stockage.js                IndexedDB (clés non extractibles), localStorage (pseudo)
  app.js                     l'écran : fils, commandes, pairs, relier, panique
outils/salon/tests/          bancs node : salon.test.mjs, qr.test.mjs
```

---

## 3. Le modèle de sécurité

- **Identité** : deux paires P-256 — ECDSA pour signer, ECDH pour recevoir du
  privé. Les clés privées sont créées **non extractibles** et rangées telles
  quelles dans IndexedDB : la page s'en sert, personne ne peut les lire.
- **Empreinte** = SHA-256(clé publique de signature ‖ clé publique d'échange).
  Elle se recalcule à partir des clés que porte chaque paquet : on ne choisit
  pas son empreinte, on ne peut donc pas prendre celle d'un autre. `/verify`
  l'affiche pour une comparaison à voix haute.
- **Chaque paquet est signé** (JSON canonique, clés triées, sans le TTL que
  les relais modifient). Signature fausse, ou empreinte qui ne correspond pas
  aux clés : le paquet est jeté **et pas relayé**.
- **Message privé** (ECIES) : une paire ECDH neuve par message, combinée à la
  clé du destinataire ; HKDF-SHA-256 → AES-256-GCM. Les données associées
  (« auteur > destinataire ») lient le chiffré à sa conversation. Les relais
  le transportent sans pouvoir le lire.
- **Salon à mot de passe** : PBKDF2(mot de passe, sel = nom du salon) →
  AES-256-GCM. Un message en clair dans un salon protégé est refusé.
- **Rien n'est interprété** : tout texte venu d'un autre appareil est posé
  avec `textContent`. Tailles bornées (paquet 16 000 caractères, texte 1 000,
  pseudo 20), dates bornées (pas plus de 24 h dans le passé, 5 min dans le
  futur), **débit** borné (25 paquets par auteur et par 10 s).
- **Mode panique** (triple-clic sur le logo, ou `/wipe`) : liens fermés,
  IndexedDB et localStorage effacés, page rechargée avec une identité neuve.

Limites dites franchement : pas de confidentialité persistante (« forward
secrecy ») côté destinataire — qui vole sa clé privée relit ses anciens
privés ; les métadonnées (qui parle, quand, à qui) sont visibles des relais ;
un appareil malveillant peut refuser de relayer (le maillage contourne s'il
existe un autre chemin).

---

## 4. Le maillage

Un paquet : `{ v, id, type, t, de, cle, ech, …, sig, ttl }`. Types : `annonce`
(pseudo), `msg` (salon), `prive`, `recu` (accusé de réception), `depot` (note
déposée), `depart`.

1. Reçu : forme validée, **déjà vu ?** (cache des identifiants, avant la
   vérification qui coûte), date, TTL, empreinte, signature, débit.
2. Gardé (stockage et retransmission) : messages 2 h, privés et notes 24 h,
   la dernière annonce de chaque pair 30 min — tout nouveau voisin les reçoit.
3. **Relayé** sur les autres liens, TTL − 1 (7 au départ : 7 sauts au plus).
4. Traité : affiché, déchiffré, ou ignoré s'il n'est pas pour nous.

Les messages ne sont **pas enregistrés** sur l'appareil : fermer l'onglet les
efface de chez soi.

---

## 5. Le QR code

Écrit d'après la norme, vérifié contre OpenCV dans les deux sens (nos grilles
sont identiques aux siennes module pour module ; notre lecteur lit les siennes).
L'invitation est un **lien** (`salon.html#o=S1~o~…`) : l'appareil photo d'un
téléphone l'ouvre directement. La réponse est un code nu, lu dans la page.
