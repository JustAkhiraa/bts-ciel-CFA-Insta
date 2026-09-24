/* BTS CIEL — hors-ligne. La coquille est mise en cache a l'installation ;
   chaque fiche visitee s'y ajoute ensuite.
   VERSION est l'empreinte du site publie : elle change des qu'un
   octet change, ce qui purge l'ancien cache a l'activation. */
const VERSION='bts-ciel-8587457160';
const COQUILLE=["./", "./index.html", "./a-propos.html", "./outils/index.html", "./outils/convertisseur.html", "./outils/masques.html", "./manifest.webmanifest", "./assets/icone.svg", "./assets/fiche.css?v=98b4a5b6", "./assets/app.js?v=98b4a5b6", "./assets/fiche.js?v=98b4a5b6", "./assets/recherche.js?v=98b4a5b6", "./assets/logo-classe.jpg", "./assets/fond-voxel.webp", "./01-informatique-dev/index.html", "./02-reseaux-systemes/index.html", "./03-mathematiques/index.html", "./04-anglais/index.html", "./05-culture-generale/index.html"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(c => c !== VERSION).map(c => caches.delete(c))))
    .then(() => self.clients.claim()));
});

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
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;

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
