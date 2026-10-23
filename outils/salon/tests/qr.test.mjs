/* Le banc du QR code : ce que l'encodeur écrit, le lecteur doit le relire —
   à l'endroit, tourné, en perspective, flou, bruité, et avec des modules
   arrachés que Reed-Solomon doit réparer. */
import { encoder } from "../src/qr.js";
import { lireQr, lireGrille, corriger } from "../src/qr-lecture.js";
import { correction } from "../src/qr.js";

export const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

/* Une « photo » du QR : chaque pixel de l'image va chercher le module qui
   se trouve sous lui, à travers une transformation (rotation, perspective). */
function photo(qr, { w = 480, h = 480, echelle = 8, angle = 0, persp = 0, bruit = 0, flou = false, fond = 235, encre = 30, graine = 1 } = {}) {
  const t = qr.taille, m = 4;
  let s = graine;
  const alea = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const data = new Uint8ClampedArray(w * h * 4);
  const cx = w / 2, cy = h / 2, c = Math.cos(angle), sn = Math.sin(angle);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // inverse : du pixel vers la grille
    let dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const k = 1 + persp * dy / h;               // un trapèze : le haut plus petit que le bas
    dx /= k; dy /= k;
    const u = (c * dx + sn * dy) / echelle + t / 2, v = (-sn * dx + c * dy) / echelle + t / 2;
    const mx = Math.floor(u), my = Math.floor(v);
    const noir = mx >= 0 && my >= 0 && mx < t && my < t && qr.modules[my][mx];
    let g = noir ? encre : fond;
    // un éclairage inégal, comme un écran photographié
    g += (x / w - 0.5) * 60;
    if (bruit) g += (alea() - 0.5) * bruit;
    const i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = g; data[i + 3] = 255;
  }
  if (flou) {
    const copie = data.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) sum += copie[((y + a) * w + x + b) * 4];
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = sum / 9;
    }
  }
  return { width: w, height: h, data };
}

test("Reed-Solomon : jusqu'à ecc/2 octets faux sont réparés, au-delà c'est refusé", () => {
  const d = Array.from({ length: 30 }, (_, i) => (i * 37 + 11) & 255);
  const bloc = d.concat(correction(d, 16));
  ok(corriger(bloc, 16) === bloc, "bloc intact : rendu tel quel");
  const abime = bloc.slice();
  for (const i of [0, 5, 9, 17, 22, 31, 40, 45]) abime[i] ^= 0x5a;            // 8 erreurs = ecc/2
  const r = corriger(abime, 16);
  ok(r && r.every((x, i) => x === bloc[i]), "8 erreurs réparées");
  const trop = abime.slice(); trop[2] ^= 1; trop[3] ^= 1;                       // 10 erreurs
  ok(corriger(trop, 16) === null || !corriger(trop, 16).every((x, i) => x === bloc[i]) === false, "au-delà : refusé (ou, par chance, réparé juste — jamais faux)");
});

test("lecture directe de la grille, toutes versions de 1 à 40", () => {
  for (const v of [1, 2, 5, 7, 10, 15, 20, 27, 33, 40]) for (const niveau of ["L", "M", "Q", "H"]) {
    const msg = "v" + v + niveau + " " + "é".repeat(5) + "x".repeat(v * 3);
    const q = encoder(msg, { niveau, versionMin: v });
    const r = lireGrille(q.modules);
    ok(r && new TextDecoder().decode(r.octets) === msg, "v" + v + " " + niveau);
  }
});

test("grille abîmée : 10 % des modules de données inversés, le niveau H répare", () => {
  const msg = "S1~o~abcd~" + "p".repeat(24) + "~" + "f".repeat(43) + "~actpass~192.168.1.20:50000";
  const q = encoder(msg, { niveau: "H" });
  const g = q.modules.map((r) => r.slice());
  let s = 7;
  for (let i = 0; i < 40; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const x = 9 + (s % (q.taille - 18)), y = 9 + ((s >> 8) % (q.taille - 18));
    g[y][x] = !g[y][x];
  }
  const r = lireGrille(g);
  ok(r && new TextDecoder().decode(r.octets) === msg && r.corrections > 0, "réparé (" + (r && r.corrections) + " octets corrigés)");
});

test("photo : droite, tournée, en perspective, floue, bruitée", () => {
  const msg = "https://exemple.fr/outils/salon.html#o=S1~o~" + "Ab9".repeat(40);
  const q = encoder(msg, { niveau: "M" });
  const cas = [
    { echelle: 6 }, { echelle: 5, angle: 0.3 }, { echelle: 5, angle: -0.6 }, { echelle: 5, angle: 1.9 },
    { echelle: 5, angle: 0.15, persp: 0.25 }, { echelle: 6, flou: true }, { echelle: 5, bruit: 60, graine: 3 },
    { echelle: 4.2, angle: 0.4, flou: true, bruit: 40 },
  ];
  cas.forEach((c, i) => {
    const r = lireQr(photo(q, { w: 520, h: 520, ...c }));
    ok(r && r.texte === msg, "cas " + i + " " + JSON.stringify(c) + " → " + (r ? r.texte.slice(0, 30) : "rien"));
  });
});

test("une image sans QR code ne donne rien (et ne plante pas)", () => {
  const w = 200, h = 150, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const g = (i * 7919) % 256; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = g; data[i * 4 + 3] = 255; }
  ok(lireQr({ width: w, height: h, data }) === null, "rien");
});
