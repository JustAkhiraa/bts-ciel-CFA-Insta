/* BTS CIEL — hors-ligne. La coquille est mise en cache a l'installation ;
   chaque fiche visitee s'y ajoute ensuite.
   VERSION est l'empreinte du site publie : elle change des qu'un
   octet change, ce qui purge l'ancien cache a l'activation. */
const VERSION='bts-ciel-55f2fc2331';
const COQUILLE=["./", "./index.html", "./a-propos.html", "./devoirs.html", "./outils/index.html", "./outils/convertisseur.html", "./outils/masques.html", "./manifest.webmanifest", "./assets/icone.svg", "./assets/icone-180.png", "./assets/icone-192.png", "./assets/icone-512.png", "./assets/icone-maskable-512.png", "./assets/fiche.css?v=d4b60933", "./assets/app.js?v=d4b60933", "./assets/fiche.js?v=d4b60933", "./assets/recherche.js?v=d4b60933", "./assets/logo-classe.jpg", "./assets/fond-voxel.webp", "./assets/fond-voxel-clair.webp", "./planning.html", "./planning.ics", "./01-informatique-dev/index.html", "./02-reseaux-systemes/index.html", "./03-mathematiques/index.html", "./04-anglais/index.html", "./05-culture-generale/index.html"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(c => c !== VERSION && c !== MOTEUR)
                                  .map(c => caches.delete(c))))
    .then(() => self.clients.claim()));
});

/* Le compilateur de l'atelier C pese soixante megaoctets et ne change
   JAMAIS : ce sont des binaires figes. Il a donc son propre cache, que
   l'activation ne purge pas — sans quoi chaque publication du site
   obligerait a les retelecharger. Le nom porte sa propre version : le jour
   ou le moteur change, on la bouge, et l'ancien cache part. */
const MOTEUR = 'bts-ciel-moteur-c-1';
/* Une comparaison de noms plutot qu'une expression reguliere : la coquille
   du service worker vit dans une chaine Python, ou chaque antislash devrait
   etre double. Un antislash qui se perd dans un heredoc a deja coute une
   journee sur ce depot (voir l'echappement iCalendar). */
const MOTEUR_FIC = ['clang', 'lld', 'sysroot.tar', 'memfs', 'garde.o'];
function estMoteur(chemin) {
  const i = chemin.lastIndexOf('/outils/c/');
  return i >= 0 && MOTEUR_FIC.indexOf(chemin.slice(i + 10)) >= 0;
}

function moteur(r) {
  return caches.open(MOTEUR).then(c => c.match(r).then(hit => hit || fetch(r).then(rep => {
    /* Un quota depasse ne doit pas faire echouer la reponse elle-meme. */
    if (rep && rep.status === 200) c.put(r, rep.clone()).catch(() => {});
    return rep;
  })));
}

function garder(rep, r) {
  /* On ne met en cache que ce qui a reellement ete servi. */
  if (rep && rep.status === 200 && rep.type === 'basic') {
    const copie = rep.clone();
    caches.open(VERSION).then(c => c.put(r, copie));
  }
  return rep;
}

self.addEventListener('fetch', e => {
  const r = e.request;
  const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (estMoteur(u.pathname)) { e.respondWith(moteur(r)); return; }

  /* Une PAGE se relit sur le reseau d'abord : le corpus grandit au fil de
     l'annee, et une fiche corrigee doit arriver. Hors ligne, on retombe sur
     le cache, puis sur l'accueil. Les ASSETS, eux, restent en cache d'abord :
     ils portent deja la version dans la cle du cache. */
  const page = r.mode === 'navigate' ||
               (r.headers.get('accept') || '').includes('text/html');

  e.respondWith(
    page
      ? fetch(r).then(rep => garder(rep, r))
                .catch(() => caches.match(r).then(c => c || caches.match('./index.html')))
      : caches.match(r).then(c => c || fetch(r).then(rep => garder(rep, r))
                                              .catch(() => caches.match('./index.html')))
  );
});
