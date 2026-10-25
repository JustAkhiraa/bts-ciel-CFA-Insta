# Le labo réseau — architecture

Une alternative locale à Cisco Packet Tracer, dans le site : une page
(`outils/labo.html`), des modules ES natifs (`outils/labo/src/`), **aucune
dépendance, aucune étape de compilation**. Le navigateur charge les fichiers
tels quels ; node les teste tels quels (`node outils/labo/tests/tout.mjs`).

Ce fichier est la référence. Une règle qui change ici change dans le code, et
l'inverse.

---

## 1. Les règles qui ne se discutent pas

1. **Rien n'est simulé par un `setTimeout` qui « fait comme si ».** Un ping
   est une trame Ethernet qui porte un paquet IPv4 qui porte un message ICMP ;
   elle sort par un port, traverse un câble, entre dans l'équipement d'en face,
   qui la lit couche par couche et décide. Si l'ARP manque, il y a une requête
   ARP en diffusion, une réponse, et seulement ensuite le paquet en attente.
2. **Tout passe par l'horloge** (`core/SimulationClock.js`). Une trame en vol
   est un événement daté ; un délai de protocole aussi. En mode temps réel, on
   vide la file d'un coup ; en mode simulation, on la vide une trame à la fois,
   et l'animation montre chaque saut.
3. **Chaque décision est expliquée en français.** Un équipement qui reçoit,
   apprend, inonde, tague, route ou jette une trame l'écrit dans le journal
   (`Network.journal`), et l'inspecteur de PDU le montre tel quel. Une
   décision qu'on ne sait pas expliquer est une décision qu'on ne prend pas.
4. **Le moteur ne connaît pas le DOM.** `core/`, `devices/` et `cli/` ne
   touchent ni `document` ni `window` : c'est ce qui permet de les tester avec
   node. Seuls `canvas/` et `ui/` dessinent.
5. **Aucun code de Packet Tracer, rien de désassemblé.** Le comportement vient
   des normes publiques (RFC 826 ARP, IEEE 802.1Q, RFC 791 IPv4, RFC 792
   ICMP, RFC 2131 DHCP, RFC 1035 DNS) et de la syntaxe IOS documentée.

---

## 2. Arborescence

```
outils/labo.html                la page : coquille, panneaux, chargement
outils/labo/labo.css            le style (sombre par défaut, clair au choix)
outils/labo/src/
  main.js                       démarrage : réseau + interface + lab par défaut
  core/
    MACAddress.js               48 bits, formats Cisco / Windows, diffusion
    IPv4Address.js              32 bits, masques, préfixes, sous-réseaux
    Frame.js                    trame Ethernet II (+ étiquette 802.1Q)
    Packet.js                   paquet IPv4, ARP, ICMP, UDP, TCP, DHCP, DNS
    SimulationClock.js          file d'événements datés, pas à pas
    Network.js                  la topologie : équipements, câbles, journal
  devices/
    Device.js                   base commune : ports, nom, position, état
    Port.js                     interface physique ou sous-interface
    Cable.js                    droit, croisé, fibre, console ; validité
    IpStack.js                  pile IPv4 d'un équipement : ARP, ICMP, UDP
    HostPC.js                   PC : config IP statique / DHCP, ping, tracert
    Server.js                   PC + services DHCP, DNS, HTTP
    SwitchL2.js                 commutateur 2960 : CAM, VLAN, trunk, SVI, sécurité de port
    RouterL3.js                 routeur 2911 + HWIC-2T : routage, sous-interfaces, série, DHCP
    Cdp.js                      CDP : annonces de voisinage, VLAN natif différent
    Acl.js                      listes d'accès standard (1-99), masques génériques
    Nat.js                      NAT statique, dynamique (pool), PAT (overload)
    Rip.js                      RIP v1 / v2 : horizon partagé, résumé, route par défaut
  cli/
    CommandTree.js              l'arbre des commandes, les abréviations
    IOSParser.js                les modes IOS, Tab, ?, historique, sorties
    HostShell.js                l'invite « C:\> » du PC
  canvas/
    TopologyCanvas.js           caméra (pan, zoom au curseur), grille
    Renderer.js                 équipements, câbles, badges de ports
    InteractionManager.js       sélection, glisser, câblage, rectangle
    PacketAnimator.js           enveloppes en vol, clic → inspecteur
  ui/
    WorkspaceLayout.js          panneaux dockés et redimensionnables
    DeviceInspector.js          panneau de droite : config d'un équipement
    TerminalTabs.js             terminaux en onglets, en bas
    PDUInspector.js             les en-têtes d'une trame, couche par couche
    CommandPalette.js           Ctrl K
    Presets.js                  les cinq labs
outils/labo/tests/              bancs node (aucun DOM) ; blocs.test.mjs rejoue
                                chaque bloc de outils/packet-tracer.html
```

---

## 3. Les structures de données

Toutes les adresses sont des **objets** (`MACAddress`, `IPv4Address`), jamais
des chaînes, à l'intérieur du moteur. Les chaînes n'existent qu'aux bords :
la CLI qui lit, l'interface qui affiche, le JSON qui sauvegarde.

### 3.1 Trame L2 — `Frame`

```js
{
  id: 17,                      // unique, croissant ; suit la trame d'un bout à l'autre
  src: MACAddress,             // adresse source
  dst: MACAddress,             // destination ; FFFF.FFFF.FFFF = diffusion
  vlan: null | 1..4094,        // présent seulement sur un lien trunk (802.1Q)
  etherType: 0x0806 | 0x0800,  // ARP | IPv4
  payload: ArpMessage | IPv4Packet
}
```

Une trame est **copiée** à chaque saut (`frame.clone()`), parce qu'un
commutateur qui inonde en produit plusieurs, et qu'un trunk ajoute une
étiquette que l'accès retire : l'objet de chaque sortie doit être le sien.

### 3.2 Paquet L3 — `IPv4Packet`

```js
{
  src: IPv4Address, dst: IPv4Address,
  ttl: 128 | 255 | …,          // décrémenté par chaque routeur
  protocol: 1 | 6 | 17,        // ICMP | TCP | UDP
  payload: IcmpMessage | UdpDatagram | TcpSegment
}
IcmpMessage  { type: 0|3|8|11, code, id, seq }        // écho, injoignable, délai
UdpDatagram  { srcPort, dstPort, data: DhcpMessage | DnsMessage }
TcpSegment   { srcPort, dstPort, flags: "SYN"|"SYN,ACK"|"ACK"|"PSH,ACK"|"FIN,ACK", seq, ack, data }
ArpMessage   { op: 1|2, senderMac, senderIp, targetMac, targetIp }
DhcpMessage  { op: "DISCOVER"|"OFFER"|"REQUEST"|"ACK"|"NAK", xid, chaddr,
               yiaddr, siaddr, options: { mask, router, dns, serverId, lease } }
DnsMessage   { id, question: nom, answers: [{ name, type: "A", ip }], rcode }
```

### 3.3 Table CAM — `SwitchL2.cam`

```js
Map<"vlan|mac", { vlan, mac: MACAddress, port: Port, type: "DYNAMIC", vu: temps }>
```

Apprise sur la MAC **source** de toute trame entrante, dans le VLAN de la
trame. Vieillissement à 300 s de temps simulé, appliqué **à la lecture** (une
entrée trop vieille est ignorée puis effacée) : programmer 300 s d'avance
dans l'horloge ferait sauter le temps en mode temps réel.

### 3.4 Table ARP — `IpStack.arp`

```js
Map<"a.b.c.d", { mac: MACAddress, interface: Port, vu: temps, type: "dynamic"|"static" }>
attente: Map<"a.b.c.d", { paquets: [{ packet, port }], essais, minuterie }>
```

Une IP absente de la table met le paquet en **attente** et émet une requête
ARP en diffusion ; la réponse remplit la table et vide l'attente. Sans réponse
après 1 s, une nouvelle requête ; après 3 essais, les paquets en attente sont
jetés (et le ping dira « Délai d'attente de la demande dépassé »).

### 3.5 Table de routage — `RouterL3.routes()`

```js
[{ code: "C"|"L"|"S", reseau: IPv4Address, masque: IPv4Address, prefixe: 0..32,
   via: IPv4Address | null, interface: Port | null, distance: 0|1, metrique: 0 }]
```

`C` et `L` sont **recalculées** à partir des interfaces (une interface éteinte
fait disparaître sa route) ; `S` vient de la configuration (`ip route`). Choix
par le **préfixe le plus long**, puis la distance administrative.

### 3.6 Ports et sous-interfaces — `Port`

```js
{
  nom: "FastEthernet0/1", court: "Fa0/1", type: "fa"|"gi"|"console"|"rs232",
  mac: MACAddress, adminUp: bool, cable: Cable|null,
  // commutateur
  mode: "access"|"trunk", accessVlan: 1, native: 1, allowed: "all" | Set<number>,
  // routeur et hôtes
  ip: IPv4Address|null, masque: IPv4Address|null,
  // sous-interface (routeur) : parent, dot1q, natif
  parent: Port|null, dot1q: number|null, dot1qNatif: bool
}
```

L'état d'un port se calcule, il ne se stocke pas : **physique up** si
administrativement up, câblé, câble valide et port d'en face up ; **actif**
(forwarding) si up et, sur un commutateur, si son VLAN d'accès existe.

### 3.7 Le journal — `Network.journal`

Chaque saut d'une trame et chaque décision d'un équipement :

```js
{ n, t, type: "emission"|"reception"|"decision", trame: Frame (copie),
  de: { equipement, port }, vers: { equipement, port }, protocole: "ARP"|"ICMP"|…,
  texte: "Le commutateur apprend 0001.4321.ABCD sur Fa0/1 (VLAN 10)." }
```

L'inspecteur de PDU et la liste des événements ne lisent QUE le journal.

### 3.8 Ce qui s'ajoute au routeur et au commutateur

```js
Port   { clockRate, encapsulation: "hdlc"|"ppp",          // série : Serial0/0/0, 0/0/1
         natRole: null|"inside"|"outside", aclIn, aclOut,  // routeur
         secu: { actif, max, violation, sticky, adresses, violations }, errDisabled }  // commutateur
Cable  { dce: Port }                     // câble « serie » : son premier bout donne l'horloge
Frame  { l2: "ethernet"|"hdlc"|"ppp" }   // série : ni MAC ni ARP, un seul voisin
RouterL3.acl  Map<numéro, ListeAcces>    RouterL3.nat  ServiceNat   RouterL3.rip  ServiceRip
RouterL3.cdp / SwitchL2.cdp  ServiceCdp  // voisins : Map<port local, annonce>
```

Une route se choisit au préfixe le plus long ; pour un même réseau, seule
la source la plus crédible entre dans la table : connecté (0), statique
(1), RIP (120).

### 3.9 Ce qui diffère du vrai matériel — exprès, et dit

- **RIP n'envoie pas de mise à jour toutes les 30 s.** Elles feraient
  tourner l'horloge sans fin en temps réel et noieraient la simulation. Un
  routeur annonce sa table quand elle CHANGE (mise à jour déclenchée, que le
  vrai RIP fait aussi) et demande celle de ses voisins quand une interface
  monte ou qu'une route tombe. Pas de minuteur « invalid / flush » : une
  route s'en va par empoisonnement (16) ou quand son interface tombe.
- **CDP n'annonce pas toutes les 60 s** : quand un lien monte, et quand ce
  qu'il annonce change (nom, adresse, mode ou VLAN d'un port). Le temps de
  rétention affiché suit le cycle de 60 s du vrai protocole.
- Au chargement d'une topologie, `Network.demarrer()` laisse ce trafic
  d'installation (CDP, RIP) s'écouler, puis vide le journal.
- Listes d'accès : **standard seulement** (1 à 99). Une liste étendue est
  refusée par un message en français, pas imitée.
- Pas de STP, d'OSPF, d'EIGRP, d'IPv6, de VTP, de DTP, de SSH réel (la
  configuration SSH est acceptée et gardée, sans client pour s'y connecter).

---

## 4. Le chemin d'une trame

```
Port.envoyer(trame)            port up ? sinon jetée, et dit pourquoi
  └─ horloge.programmer(+délai, livrer)        ← un événement par saut
       └─ portEnFace.equipement.recevoir(port, trame)
            ├─ SwitchL2  : VLAN d'entrée → apprentissage → inondation / transfert
            │              → étiquette à la sortie trunk, retrait en accès
            ├─ RouterL3  : trame pour moi ? → sous-interface (dot1Q) → IpStack
            │              → routage : TTL−1, plus long préfixe, ARP du saut
            └─ HostPC    : trame pour moi ? → IpStack → ICMP / UDP / TCP
```

Garde-fou : une file qui dépasse 20 000 événements d'un coup s'arrête et
annonce une **tempête de diffusion** (deux commutateurs bouclés sans STP :
c'est ce qui se passerait sur du vrai matériel, en pire).

---

## 5. La CLI

- `CommandTree` décrit chaque mode par un arbre de mots-clés et de paramètres
  typés (`ip`, `masque`, `nombre`, `interface`, `liste-vlan`, `mot`, `texte`).
  Un mot-clé s'abrège tant qu'il reste **unique** à sa position (`sh ip int br`).
- `IOSParser` tient le mode (`>` `#` `(config)#` `(config-if)#`
  `(config-subif)#` `(config-vlan)#` `(dhcp-config)#` `(config-line)#`
  `(config-router)#`), l'historique, `Tab`,
  `?`, et rend les messages exacts d'IOS : `% Invalid input detected at '^'
  marker.`, `% Incomplete command.`, `% Ambiguous command: "…"`.
- Ce que la CLI sait faire au-delà du socle : liaisons série (`clock rate`,
  `encapsulation ppp`, `show controllers`), `router rip` (`version`,
  `network`, `passive-interface`, `no auto-summary`,
  `default-information originate`, `show ip protocols`, `debug ip rip`),
  NAT (`ip nat inside|outside`, `ip nat inside source static|list … pool|interface … overload`,
  `ip nat pool`, `show ip nat translations|statistics`), `access-list`,
  `ip access-group`, `switchport port-security …`, `show port-security`,
  `show cdp neighbors [detail]`, `reload`, `erase startup-config`,
  `delete vlan.dat`.
- `HostShell` : `ipconfig [/all|/release|/renew]`, `ping [-n N|-c N]`,
  `tracert`/`traceroute`, `arp -a`/`-d`, `nslookup`, `curl`, `dhcp`,
  `ifconfig`/`ip addr`.
- Une commande longue (ping) ne bloque rien : elle écrit au fil des
  événements, par l'objet `sortie` que le terminal lui passe.

---

## 6. Les conventions de l'interface

- **Aucune fenêtre flottante.** Inspecteur à droite, terminaux en bas, en
  onglets ; les deux redimensionnables à la poignée et repliables.
- Thème **sombre par défaut**, clair au choix ; toutes les couleurs sont des
  variables CSS dans `labo.css`. Couleurs d'état fixes : vert actif, orange
  up-mais-bloqué (VLAN inexistant, VLAN non autorisé), rouge éteint.
- Raccourcis : `Ctrl K` palette, `C` câble automatique, `V` sélection,
  `Suppr` supprimer, `G` grille magnétique, `Espace` + glisser ou clic molette
  pour se déplacer, `Ctrl 1…9` changer d'onglet de terminal, `Ctrl S`
  enregistrer, `Ctrl O` ouvrir.
- Les noms d'interface suivent IOS : `FastEthernet0/1` dans la config,
  `Fa0/1` sur les badges.
- Sauvegarde automatique dans `localStorage` (`ciel-labo-v1`) ; export et
  import en JSON (`.labo.json`) : topologie + configurations.
