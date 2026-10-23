/* Ce que le salon garde sur l'appareil, et rien d'autre :
   - l'IDENTITÉ (les deux paires de clés) dans IndexedDB — les clés privées
     y sont rangées comme objets CryptoKey NON extractibles : la page peut
     s'en servir, personne ne peut les lire ;
   - le pseudo et le thème dans localStorage.
   Les messages ne sont PAS enregistrés : fermez l'onglet, ils sont partis
   de cet appareil (ceux des autres les gardent 2 h au plus, pour les
   retardataires). Le mode panique efface tout ceci d'un coup. */

const BASE = "ciel-salon", MAGASIN = "cles", CLE_PSEUDO = "ciel-salon-pseudo";

function ouvrir() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function operation(mode, fn) {
  const db = await ouvrir();
  try {
    return await new Promise((ok, ko) => {
      const tx = db.transaction(MAGASIN, mode);
      const r = fn(tx.objectStore(MAGASIN));
      tx.oncomplete = () => ok(r && r.result);
      tx.onerror = () => ko(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function lireIdentite() {
  try { return (await operation("readonly", (s) => s.get("identite"))) || null; } catch (e) { return null; }
}
export async function garderIdentite(id) {
  try { await operation("readwrite", (s) => s.put({ signe: id.signe, echange: id.echange }, "identite")); } catch (e) { /* navigation privée : identité de session */ }
}

export function lirePseudo() { try { return localStorage.getItem(CLE_PSEUDO); } catch (e) { return null; } }
export function garderPseudo(p) { try { localStorage.setItem(CLE_PSEUDO, p); } catch (e) { /* tant pis */ } }

/* Tout effacer : la base, le pseudo, le thème. */
export function toutEffacer() {
  try { localStorage.removeItem(CLE_PSEUDO); localStorage.removeItem("ciel-salon-theme"); } catch (e) { /* rien à effacer */ }
  return new Promise((ok) => {
    try {
      const r = indexedDB.deleteDatabase(BASE);
      r.onsuccess = r.onerror = r.onblocked = () => ok();
    } catch (e) { ok(); }
  });
}
