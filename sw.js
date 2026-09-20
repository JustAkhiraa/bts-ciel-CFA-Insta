/* BTS CIEL — hors-ligne. La coquille est mise en cache a l'installation ;
   chaque fiche visitee s'y ajoute ensuite. */
const VERSION='bts-ciel-v1';
const COQUILLE=["./", "./index.html", "./a-propos.html", "./recherche.json", "./manifest.webmanifest", "./assets/icone.svg", "./assets/fiche.css", "./assets/app.css", "./assets/app.js", "./assets/fiche.js", "./01-informatique-dev/index.html", "./02-reseaux-systemes/index.html", "./03-mathematiques/index.html", "./04-anglais/index.html", "./05-culture-generale/index.html"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(c => c !== VERSION).map(c => caches.delete(c))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(r).then(cache => cache || fetch(r).then(rep => {
      /* On ne met en cache que ce qui a reellement ete servi. */
      if (rep && rep.status === 200 && rep.type === 'basic') {
        const copie = rep.clone();
        caches.open(VERSION).then(c => c.put(r, copie));
      }
      return rep;
    }).catch(() => caches.match('./index.html')))
  );
});
