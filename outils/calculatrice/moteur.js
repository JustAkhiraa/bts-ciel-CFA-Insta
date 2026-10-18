/* ═══════════════════════════════════════════════════════════════════════
   Le moteur de la calculatrice — le cerveau, séparé de la boîte.

   Ce fichier ne connaît ni écran, ni clavier, ni DOM. Il prend du texte et
   rend une valeur, une forme exacte quand elle existe, et un message
   d'erreur en français quand il n'y en a pas. C'est ce qui permet de le
   mesurer HORS navigateur :

       node _pilotage/publication/outil-calculatrice/banc.js

   Un moteur qu'on ne peut tester qu'en cliquant n'est pas testé. Celui-ci
   est relu case par case par un banc de plusieurs centaines de valeurs,
   dont une partie est RECALCULÉE EN PYTHON par
   `_pilotage/scripts/verif-calculatrice.py` : deux implémentations
   indépendantes qui doivent tomber sur le même chiffre. Un résultat
   faux et seul est un résultat qu'on croit.

   ── Deux couches, et c'est le cœur du sujet ──────────────────────────
   Une calculatrice de lycée moderne ne répond pas « 0.3333333333 » à
   « 1/3 » : elle répond « 1/3 », et donne la décimale en dessous. Il y a
   donc DEUX calculs pour une saisie :

     · la couche EXACTE, qui travaille sur les nombres de la forme
            (p/q) · √r · πⁿ
       — entiers, fractions, radicaux simplifiés, multiples de π. Elle
       rend `null` dès qu'elle sort de cette famille, et ce n'est pas un
       échec : c'est elle qui dit « ici, il n'y a pas de forme exacte à
       montrer ».
     · la couche NUMÉRIQUE, en flottants doubles, qui répond toujours.

   Ce que la couche exacte ne sait PAS faire est écrit noir sur blanc dans
   LISEZ-MOI.md. Promettre un calcul symbolique complet serait mentir :
   ce n'est pas un logiciel de calcul formel, c'est l'arithmétique exacte
   dont le programme de maths a besoin.
   ═══════════════════════════════════════════════════════════════════════ */
"use strict";

const CALC = (function () {

/* ═════════════════════════ 1. Réglages ═════════════════════════════════
   Trois réglages suffisent, et ce sont ceux de l'appareil réel : l'unité
   d'angle, le format d'affichage, le nombre de chiffres significatifs.
   Ils voyagent dans un objet passé à chaque appel plutôt que de vivre en
   variable globale — un banc qui doit remettre un réglage à zéro entre
   deux cas finit toujours par oublier de le faire. */
const REGLAGES = () => ({
  angle: "rad",        // "rad" | "deg" | "grad"
  format: "auto",      // "auto" | "sci" | "ing"
  chiffres: 10,        // chiffres significatifs affichés (NumWorks : 10)
  complexe: false,     // réservé : les complexes ne sont pas de ce semestre
});

/* ═════════════════════════ 2. Numérique ════════════════════════════════
   Les fonctions spéciales, écrites à la main parce qu'aucune n'est dans
   le JavaScript standard. Chacune porte sa précision ANNONCÉE, et le banc
   la vérifie contre des valeurs de référence : une approximation dont on
   ignore l'ordre de grandeur de l'erreur ne vaut rien dans un contrôle. */

/* Lanczos, g = 7, neuf coefficients. Erreur relative < 2·10⁻¹⁵ sur les
   réels positifs — mesurée dans le banc contre Γ(n) = (n−1)! jusqu'à 20. */
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

function lgamma(z) {
  if (Number.isNaN(z)) return NaN;
  if (z < 0.5) {
    /* Réflexion : Γ(z)Γ(1−z) = π / sin(πz). Sans elle, les arguments
       négatifs — qui arrivent par la loi de Student — sortent NaN. */
    const s = Math.sin(Math.PI * z);
    if (s === 0) return Infinity;
    return Math.log(Math.PI / Math.abs(s)) - lgamma(1 - z);
  }
  let x = LANCZOS[0];
  const y = z - 1;
  for (let i = 1; i < 9; i++) x += LANCZOS[i] / (y + i);
  const t = y + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(x);
}

function gamma(z) {
  if (Number.isInteger(z) && z <= 0) return NaN;
  /* Pour les petits entiers, la factorielle exacte est plus juste que
     exp(lgamma) : exp(lgamma(6)) rendait 119.99999999999997. */
  if (Number.isInteger(z) && z > 0 && z <= 171) {
    let r = 1; for (let i = 2; i < z; i++) r *= i; return r;
  }
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  return Math.exp(lgamma(z)) * (z < 0 ? -1 : 1);
}

/* Gamma incomplète régularisée. Série pour x < a+1, fraction continue
   au-delà : c'est le découpage de Numerical Recipes, et la raison en est
   simple — chacune des deux converge mal là où l'autre converge bien. */
function gser(a, x) {
  let ap = a, somme = 1 / a, del = somme;
  for (let n = 1; n <= 2000; n++) {
    ap++; del *= x / ap; somme += del;
    if (Math.abs(del) < Math.abs(somme) * 1e-17) break;
  }
  return somme * Math.exp(-x + a * Math.log(x) - lgamma(a));
}
function gcf(a, x) {
  const MINI = 1e-300;
  let b = x + 1 - a, c = 1 / MINI, d = 1 / b, h = d;
  for (let i = 1; i <= 2000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < MINI) d = MINI;
    c = b + an / c; if (Math.abs(c) < MINI) c = MINI;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-17) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
function gammp(a, x) {           // P(a,x) — queue basse
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  return x < a + 1 ? gser(a, x) : 1 - gcf(a, x);
}
function gammq(a, x) {           // Q(a,x) = 1 − P(a,x) — queue haute
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 1;
  /* Ne JAMAIS écrire « 1 − gammp » ici. Pour x grand, gammp vaut
     0.9999999999999999 et la soustraction détruit tous les chiffres de la
     queue : Φ(−10) tomberait à 0 au lieu de 7,6·10⁻²⁴. */
  return x < a + 1 ? 1 - gser(a, x) : gcf(a, x);
}

function erf(x) {
  if (x === 0) return 0;
  return x < 0 ? -gammp(0.5, x * x) : gammp(0.5, x * x);
}
function erfc(x) {
  return x < 0 ? 1 + gammp(0.5, x * x) : gammq(0.5, x * x);
}

/* Bêta incomplète régularisée, par fraction continue (Lentz). Elle porte
   à elle seule la loi binomiale, Student et Fisher. */
function betacf(a, b, x) {
  const MINI = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < MINI) d = MINI;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < MINI) d = MINI;
    c = 1 + aa / c; if (Math.abs(c) < MINI) c = MINI;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < MINI) d = MINI;
    c = 1 + aa / c; if (Math.abs(c) < MINI) c = MINI;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}
function betainc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b)
                      + a * Math.log(x) + b * Math.log1p(-x));
  return x < (a + 1) / (a + b + 2)
    ? bt * betacf(a, b, x) / a
    : 1 - bt * betacf(b, a, 1 - x) / b;
}

function lcombinaison(n, k) {    // ln C(n,k), stable jusqu'à n = 10⁶
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
}
function combinaison(n, k) {
  if (k < 0 || k > n || !Number.isInteger(n) || !Number.isInteger(k)) return NaN;
  k = Math.min(k, n - k);
  if (k === 0) return 1;
  /* Produit exact tant qu'on tient dans les entiers sûrs : C(50,25) doit
     valoir 126410606437752 au chiffre près, pas 126410606437751,98. */
  let r = 1, exact = true;
  for (let i = 1; i <= k; i++) {
    r = r * (n - k + i) / i;
    if (r > Number.MAX_SAFE_INTEGER) { exact = false; break; }
  }
  return exact ? Math.round(r) : Math.exp(lcombinaison(n, k));
}
function arrangement(n, k) {
  if (k < 0 || k > n) return NaN;
  let r = 1;
  for (let i = 0; i < k; i++) r *= n - i;
  return r;
}

/* ── les lois de probabilité ─────────────────────────────────────────
   Celles des chapitres 08, 09 et 10 d'abord : binomiale, normale,
   uniforme, exponentielle. Les autres suivent parce qu'elles coûtent
   trois lignes une fois les deux fonctions incomplètes écrites. */
const LOIS = {
  binomialePdf(n, p, k) {
    if (!Number.isInteger(k) || k < 0 || k > n) return 0;
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;
    return Math.exp(lcombinaison(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p));
  },
  binomialeCdf(n, p, k) {
    k = Math.floor(k);
    if (k < 0) return 0;
    if (k >= n) return 1;
    if (p === 0) return 1;
    if (p === 1) return 0;
    /* P(X ⩽ k) = I_{1−p}(n−k, k+1). L'identité évite d'additionner un
       million de termes quand n est grand ; le banc la confronte à la
       somme directe pour n ⩽ 400. */
    return betainc(n - k, k + 1, 1 - p);
  },
  binomialeSomme(n, p, k) {      // la somme directe, gardée pour le banc
    let s = 0;
    for (let i = 0; i <= Math.min(k, n); i++) s += LOIS.binomialePdf(n, p, i);
    return Math.min(1, s);
  },
  invBinomiale(n, p, alpha) {
    if (alpha <= 0) return 0;
    if (alpha >= 1) return n;
    let s = 0;
    for (let k = 0; k <= n; k++) {
      s += LOIS.binomialePdf(n, p, k);
      if (s >= alpha - 1e-12) return k;
    }
    return n;
  },
  normalePdf(x, mu, sig) {
    const z = (x - mu) / sig;
    return Math.exp(-0.5 * z * z) / (sig * Math.sqrt(2 * Math.PI));
  },
  normaleCdf(x, mu, sig) {
    /* 0,5·erfc(−z/√2) et non 0,5(1+erf(z/√2)) : la seconde forme perd la
       queue gauche, qui est exactement celle qu'un exercice demande. */
    return 0.5 * erfc(-(x - mu) / (sig * Math.SQRT2));
  },
  normaleEntre(a, b, mu, sig) {
    if (a > b) return 0;
    const za = (a - mu) / sig, zb = (b - mu) / sig;
    /* Deux queues basses soustraites perdent les chiffres quand les deux
       bornes sont loin dans la même queue. On soustrait du côté où la
       valeur est petite. */
    return za > 0 ? 0.5 * (erfc(za / Math.SQRT2) - erfc(zb / Math.SQRT2))
                  : 0.5 * (erfc(-zb / Math.SQRT2) - erfc(-za / Math.SQRT2));
  },
  invNormale(q, mu, sig) {
    if (q <= 0) return -Infinity;
    if (q >= 1) return Infinity;
    return mu + sig * Math.SQRT2 * invErf(2 * q - 1);
  },
  poissonPdf(lam, k) {
    if (!Number.isInteger(k) || k < 0) return 0;
    return Math.exp(-lam + k * Math.log(lam) - lgamma(k + 1));
  },
  poissonCdf(lam, k) {
    k = Math.floor(k);
    return k < 0 ? 0 : gammq(k + 1, lam);
  },
  geomPdf(p, k) {                // succès au k-ième essai, k ⩾ 1
    return k < 1 || !Number.isInteger(k) ? 0 : p * Math.pow(1 - p, k - 1);
  },
  geomCdf(p, k) {
    k = Math.floor(k);
    return k < 1 ? 0 : 1 - Math.pow(1 - p, k);
  },
  hyperPdf(N, K, n, k) {
    if (k < Math.max(0, n - (N - K)) || k > Math.min(n, K)) return 0;
    return Math.exp(lcombinaison(K, k) + lcombinaison(N - K, n - k) - lcombinaison(N, n));
  },
  hyperCdf(N, K, n, k) {
    let s = 0;
    for (let i = 0; i <= Math.floor(k); i++) s += LOIS.hyperPdf(N, K, n, i);
    return Math.min(1, s);
  },
  uniformeCdf(x, a, b) {
    return x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  },
  expoPdf(lam, x) { return x < 0 ? 0 : lam * Math.exp(-lam * x); },
  expoCdf(lam, x) { return x <= 0 ? 0 : -Math.expm1(-lam * x); },
  invExpo(q, lam) { return q <= 0 ? 0 : q >= 1 ? Infinity : -Math.log1p(-q) / lam; },
  studentCdf(t, nu) {
    const x = nu / (nu + t * t);
    const demi = 0.5 * betainc(nu / 2, 0.5, x);
    return t > 0 ? 1 - demi : demi;
  },
  khi2Cdf(x, k) { return x <= 0 ? 0 : gammp(k / 2, x / 2); },
  fisherCdf(x, d1, d2) {
    return x <= 0 ? 0 : betainc(d1 / 2, d2 / 2, d1 * x / (d1 * x + d2));
  },
};

/* Inverse de erf : Acklam pour l'amorce, puis Halley. Deux itérations
   suffisent pour descendre sous 10⁻¹⁵ — le banc le vérifie en rebouclant
   erf(invErf(y)) = y sur 400 points. */
function invErf(y) {
  if (y <= -1) return -Infinity;
  if (y >= 1) return Infinity;
  if (y === 0) return 0;
  const p = (y + 1) / 2;
  const A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];
  const bas = 0.02425;
  let z;
  if (p < bas) {
    const q = Math.sqrt(-2 * Math.log(p));
    z = (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5])
        / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  } else if (p <= 1 - bas) {
    const q = p - 0.5, r = q * q;
    z = (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q
        / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log1p(-p));
    z = -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5])
        / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  }
  let x = z / Math.SQRT2;
  for (let i = 0; i < 3; i++) {
    const e = erf(x) - y;
    const d = 2 / Math.sqrt(Math.PI) * Math.exp(-x * x);
    if (d === 0) break;
    x -= e / d / (1 - e * x / d);           // Halley
  }
  return x;
}

/* ── dérivée : Richardson sur les différences centrées ────────────────
   Une différence centrée simple plafonne vers 10⁻⁶ d'erreur — le pas ne
   peut pas être petit (annulation catastrophique) ni grand (troncature).
   L'extrapolation de Richardson lève le plafond : on garde la colonne du
   tableau dont deux termes consécutifs s'accordent le mieux. */
function derivee(f, x, pas) {
  let h = pas || Math.max(1e-3, Math.abs(x) * 1e-3);
  const T = [];
  let meilleur = NaN, erreur = Infinity;
  for (let i = 0; i < 12; i++) {
    T[i] = [(f(x + h) - f(x - h)) / (2 * h)];
    for (let j = 1; j <= i; j++) {
      const q = Math.pow(4, j);
      T[i][j] = (q * T[i][j - 1] - T[i - 1][j - 1]) / (q - 1);
      const e = Math.max(Math.abs(T[i][j] - T[i][j - 1]),
                         Math.abs(T[i][j] - T[i - 1][j - 1]));
      if (e < erreur && Number.isFinite(T[i][j])) { erreur = e; meilleur = T[i][j]; }
    }
    if (i > 2 && Math.abs(T[i][i] - T[i - 1][i - 1]) > 4 * erreur) break;
    h /= 2;
  }
  return meilleur;
}

/* ── intégrale : tanh-sinh, et Simpson adaptatif pour la contredire ───
   tanh-sinh ne touche jamais les bornes : ∫₀¹ dx/√x = 2 passe, là où
   toute méthode qui évalue en 0 rend l'infini. Et elle converge
   doublement exponentiellement sur les fonctions régulières, donc elle
   est aussi la plus rapide des deux.
   Simpson adaptatif est gardé — pas en secours décoratif : le banc
   EXIGE que les deux tombent sur la même valeur sur les cas réguliers.
   Deux méthodes d'accord sur un chiffre faux, c'est très improbable ;
   une seule méthode, on ne sait rien. */
function tanhSinh(f, a, b, tol) {
  if (a === b) return 0;
  if (a > b) return -tanhSinh(f, b, a, tol);
  tol = tol || 1e-12;
  const c = (a + b) / 2, d = (b - a) / 2;
  const g = (t) => {
    const u = Math.PI / 2 * Math.sinh(t);
    const ch = Math.cosh(u);
    const x = Math.tanh(u);
    const w = Math.PI / 2 * Math.cosh(t) / (ch * ch);
    const y = f(c + d * x);
    return Number.isFinite(y) ? y * w : 0;
  };
  /* Le niveau 0 est la grille des multiples ENTIERS de h, pas le seul
     point t = 0. L'oubli des points ±1, ±2… ne faisait pas échouer la
     méthode : elle convergeait vers une valeur FAUSSE au cinquième
     chiffre — ∫₀¹x²dx rendait 0,3333065 au lieu de 0,3333333. Une erreur
     qui converge est la pire espèce, parce que le critère d'arrêt la
     déclare bonne. */
  let h = 1, somme = g(0);
  for (let k = 1; k <= 6; k++) somme += g(k) + g(-k);
  let precedent = somme * h * d;
  for (let niveau = 1; niveau <= 12; niveau++) {
    h /= 2;
    let ajout = 0;
    for (let k = 1; k * h <= 6.5; k += 2) {
      const t = k * h;
      ajout += g(t) + g(-t);
      if (!Number.isFinite(ajout)) return NaN;
    }
    somme += ajout;
    const val = somme * h * d;
    if (niveau > 3 && Math.abs(val - precedent) < tol * Math.max(1, Math.abs(val)))
      return val;
    precedent = val;
  }
  return precedent;
}
function simpsonAdaptatif(f, a, b, tol) {
  if (a === b) return 0;
  if (a > b) return -simpsonAdaptatif(f, b, a, tol);
  tol = tol || 1e-11;
  /* Bornes ouvertes de 10⁻¹² : sans ce décalage, un intégrande qui
     explose en a rend NaN pour tout l'intervalle. */
  const eps = (b - a) * 1e-12;
  const F = (x) => { const y = f(x); return Number.isFinite(y) ? y : 0; };
  const simpson = (x0, x2) => {
    const x1 = (x0 + x2) / 2;
    return (x2 - x0) / 6 * (F(x0) + 4 * F(x1) + F(x2));
  };
  let total = 0;
  const pile = [[a + eps, b - eps, simpson(a + eps, b - eps), 0]];
  let gardes = 0;
  while (pile.length) {
    const [x0, x2, S, prof] = pile.pop();
    if (++gardes > 20000) return NaN;
    const x1 = (x0 + x2) / 2;
    const S2 = simpson(x0, x1) + simpson(x1, x2);
    if (prof > 50 || Math.abs(S2 - S) < 15 * tol * Math.max(1e-300, Math.abs(S2))) {
      total += S2 + (S2 - S) / 15;
    } else {
      pile.push([x0, x1, simpson(x0, x1), prof + 1]);
      pile.push([x1, x2, simpson(x1, x2), prof + 1]);
    }
  }
  return total;
}
function integrale(f, a, b, tol) {
  const v = tanhSinh(f, a, b, tol);
  return Number.isFinite(v) ? v : simpsonAdaptatif(f, a, b, tol);
}

/* ── zéros, extremums : ce que l'application Fonctions appelle « calculer »
   Un balayage, puis un raffinement. Le balayage est la partie qui compte :
   une racine double ne change pas de signe, et aucune dichotomie ne la
   trouvera jamais — elle se trouve comme un minimum de |f|. */
function zeros(f, a, b, pas) {
  const n = pas || 600, h = (b - a) / n, trouves = [];
  let xp = a, yp = f(a);
  for (let i = 1; i <= n; i++) {
    const x = a + i * h, y = f(x);
    if (Number.isFinite(yp) && Number.isFinite(y)) {
      if (y === 0) trouves.push(x);
      else if (yp * y < 0) trouves.push(dichotomie(f, xp, x));
    }
    xp = x; yp = y;
  }
  /* Les racines doubles : un minimum de |f| qui frôle zéro. */
  for (let i = 1; i < n; i++) {
    const x0 = a + (i - 1) * h, x1 = a + i * h, x2 = a + (i + 1) * h;
    const y0 = Math.abs(f(x0)), y1 = Math.abs(f(x1)), y2 = Math.abs(f(x2));
    if (y1 < y0 && y1 < y2) {
      const x = sectionDoree((t) => Math.abs(f(t)), x0, x2);
      const ech = Math.max(1, Math.abs(f(x0)), Math.abs(f(x2)));
      if (Math.abs(f(x)) < 1e-9 * ech && !trouves.some((t) => Math.abs(t - x) < 2 * h))
        trouves.push(x);
    }
  }
  return trouves.sort((u, v) => u - v).filter((x, i, t) => i === 0 || x - t[i - 1] > 1e-9);
}
function dichotomie(f, a, b) {
  let fa = f(a);
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2, fm = f(m);
    if (fm === 0 || (b - a) < 1e-15 * Math.max(1, Math.abs(m))) return m;
    if (fa * fm < 0) b = m; else { a = m; fa = fm; }
  }
  return (a + b) / 2;
}
function sectionDoree(f, a, b) {
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = b - phi * (b - a), d = a + phi * (b - a);
  for (let i = 0; i < 200 && Math.abs(b - a) > 1e-14 * Math.max(1, Math.abs(a)); i++) {
    if (f(c) < f(d)) { b = d; d = c; c = b - phi * (b - a); }
    else { a = c; c = d; d = a + phi * (b - a); }
  }
  return (a + b) / 2;
}
function extremums(f, a, b, pas) {
  const n = pas || 600, h = (b - a) / n, res = [];
  for (let i = 1; i < n; i++) {
    const x0 = a + (i - 1) * h, x1 = a + i * h, x2 = a + (i + 1) * h;
    const y0 = f(x0), y1 = f(x1), y2 = f(x2);
    if (![y0, y1, y2].every(Number.isFinite)) continue;
    if (y1 < y0 && y1 < y2) res.push({ type: "min", x: sectionDoree(f, x0, x2) });
    if (y1 > y0 && y1 > y2) res.push({ type: "max", x: sectionDoree((t) => -f(t), x0, x2) });
  }
  return res.map((e) => ({ ...e, y: f(e.x) }));
}

/* ═════════════════════ 3. La couche exacte ═════════════════════════════
   Un nombre exact est ici de la forme

        (p / q) · πⁿ · √r        p, q, r entiers, q > 0, r > 0 sans carré

   Trois champs et un exposant, et toute l'arithmétique du programme de
   maths y tient : entiers, fractions, π et ses multiples, radicaux
   simplifiés, les valeurs remarquables des cosinus. L'addition n'est
   possible qu'entre deux termes de MÊME radical et MÊME puissance de π —
   √2 + √3 n'a pas de forme dans cette famille, et la fonction rend
   `null` plutôt que d'inventer. C'est la différence entre une couche
   exacte honnête et un calcul formel de façade. */

const UN = 1n, ZERO = 0n;
function pgcdB(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) { const t = a % b; a = b; b = t; } return a; }

function carresDehors(r) {
  /* √72 = 6√2 : on sort les carrés. Division d'essai jusqu'à 10⁶, ce qui
     couvre tout ce qu'un énoncé écrit ; au-delà le radical reste tel quel,
     ce qui est juste mais pas simplifié — et jamais faux. */
  let dehors = UN;
  for (let d = 2n; d * d <= r && d < 1000000n; d++) {
    while (r % (d * d) === ZERO) { r /= d * d; dehors *= d; }
  }
  return [dehors, r];
}

function ex(p, q, r, pi) {
  p = BigInt(p); q = q === undefined ? UN : BigInt(q);
  r = r === undefined ? UN : BigInt(r); pi = pi || 0;
  if (q === ZERO) return null;
  if (r <= ZERO) return null;
  if (q < ZERO) { p = -p; q = -q; }
  if (p === ZERO) return { p: ZERO, q: UN, r: UN, pi: 0 };
  const [dehors, dedans] = carresDehors(r);
  p *= dehors; r = dedans;
  const g = pgcdB(p, q);
  if (g > UN) { p /= g; q /= g; }
  return { p, q, r, pi };
}
const exZero = () => ex(0);
const exUn = () => ex(1);
const estZero = (A) => A && A.p === ZERO;
const estRationnel = (A) => A && A.r === UN && A.pi === 0;
const estEntier = (A) => estRationnel(A) && A.q === UN;

const EX = {
  nb: ex,
  depuisEntier: (n) => ex(BigInt(n)),
  /* Un littéral décimal est un rationnel EXACT : « 0.1 » vaut un dixième,
     pas 0,1000000000000000055. C'est ce qui fait que 0.1 + 0.2 rend 0,3. */
  depuisTexte(t) {
    if (!/^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?$/i.test(t)) return null;
    const m = /^([0-9]*)\.?([0-9]*)(?:e([+-]?[0-9]+))?$/i.exec(t);
    if (!m) return null;
    const ent = m[1] || "0", dec = m[2] || "", exp = parseInt(m[3] || "0", 10);
    let p = BigInt(ent + dec), q = 10n ** BigInt(dec.length);
    if (exp > 0) p *= 10n ** BigInt(exp);
    if (exp < 0) q *= 10n ** BigInt(-exp);
    return ex(p, q);
  },
  somme(A, B) {
    if (!A || !B) return null;
    if (estZero(A)) return B;
    if (estZero(B)) return A;
    if (A.r !== B.r || A.pi !== B.pi) return null;
    return ex(A.p * B.q + B.p * A.q, A.q * B.q, A.r, A.pi);
  },
  oppose(A) { return A ? ex(-A.p, A.q, A.r, A.pi) : null; },
  difference(A, B) { return EX.somme(A, EX.oppose(B)); },
  produit(A, B) {
    if (!A || !B) return null;
    if (estZero(A) || estZero(B)) return exZero();
    return ex(A.p * B.p, A.q * B.q, A.r * B.r, A.pi + B.pi);
  },
  inverse(A) {
    if (!A || estZero(A)) return null;
    /*        1              q         q·√r
        ───────────── = ─────── = ───────────
         (p/q)·√r·πⁿ     p·√r·πⁿ    p·r·πⁿ

       On rationalise : sans cela le radical passerait au dénominateur et
       sortirait de la famille. Le numérateur est q, PAS q·r — l'erreur
       faisait rendre « √3 » pour 1/√3, c'est-à-dire trois fois trop. Elle
       ne se voyait pas à l'écran : seule la confrontation de la forme
       exacte à son propre flottant l'a montrée, 106 fois sur 572. */
    return ex(A.q, A.p * A.r, A.r, -A.pi);
  },
  quotient(A, B) { return EX.produit(A, EX.inverse(B)); },
  puissance(A, n) {
    if (!A) return null;
    if (!Number.isInteger(n) || Math.abs(n) > 4096) return null;
    if (n === 0) return estZero(A) ? null : exUn();
    if (n < 0) { const i = EX.inverse(A); return i && EX.puissance(i, -n); }
    let r = exUn();
    for (let i = 0; i < n; i++) { r = EX.produit(r, A); if (!r) return null; }
    return r;
  },
  racine(A) {
    if (!A) return null;
    if (estZero(A)) return exZero();
    if (A.p < ZERO) return null;              // pas de complexes ici
    if (A.r !== UN || A.pi % 2 !== 0) return null;
    /* √(p/q) = √(p·q) / q : le radicande passe au numérateur et le
       dénominateur redevient entier. Le coefficient est 1 et non q —
       l'erreur rendait « √14 » pour √(2/7), sept fois trop. */
    return ex(UN, A.q, A.p * A.q, A.pi / 2);
  },
  nombre(A) {
    if (!A) return NaN;
    const v = Number(A.p) / Number(A.q);
    return v * Math.sqrt(Number(A.r)) * Math.pow(Math.PI, A.pi);
  },
  estZero, estRationnel, estEntier,
  /* L'écriture. Ordre des facteurs : coefficient, puis π, puis radical —
     « 2π√3/5 », comme au tableau. */
  texte(A, { decimalSiPossible } = {}) {
    if (!A) return null;
    if (A.p === ZERO) return "0";
    const signe = A.p < ZERO ? "−" : "";
    const n = A.p < ZERO ? -A.p : A.p;
    if (decimalSiPossible && A.r === UN && A.pi === 0) {
      const d = EX.decimalFini(A);
      if (d !== null) return d;
    }
    /* EXP[1] est la chaîne VIDE — π à la puissance 1 s'écrit « π ». Un
       « EXP[n] || "^"+n » rendait donc « π^1 » : une chaîne vide est
       fausse au sens de « || », et c'est la faute la plus banale du
       JavaScript. D'où le test explicite sur « undefined ». */
    const EXP = ["", "", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
    const exp = (n) => (EXP[n] !== undefined ? EXP[n] : "^" + n);
    let haut = "";
    const facteurs = [];
    if (n !== UN || (A.pi === 0 && A.r === UN)) facteurs.push(n.toString());
    if (A.pi > 0) facteurs.push("π" + exp(A.pi));
    if (A.r !== UN) facteurs.push("√" + A.r.toString());
    haut = facteurs.join("");
    if (A.pi < 0) {
      const bas = (A.q === UN ? "" : A.q.toString()) + "π" + exp(-A.pi);
      const hautSansPi = [n !== UN ? n.toString() : "1",
                          A.r !== UN ? "√" + A.r.toString() : ""].join("");
      return signe + hautSansPi + "/" + bas;
    }
    return signe + haut + (A.q === UN ? "" : "/" + A.q.toString());
  },
  /* Un rationnel dont le dénominateur ne contient que des 2 et des 5 a une
     écriture décimale FINIE : 3/10 → « 0.3 ». Elle n'est rendue que si
     elle tient en quinze chiffres, sinon la fraction reste plus lisible. */
  decimalFini(A) {
    if (!estRationnel(A)) return null;
    let q = A.q, deux = 0, cinq = 0;
    while (q % 2n === ZERO) { q /= 2n; deux++; }
    while (q % 5n === ZERO) { q /= 5n; cinq++; }
    if (q !== UN) return null;
    const k = Math.max(deux, cinq);
    if (k > 15) return null;
    const mise = 10n ** BigInt(k);
    let p = A.p * mise / A.q;
    const neg = p < ZERO; if (neg) p = -p;
    let s = p.toString();
    if (k > 0) {
      s = s.padStart(k + 1, "0");
      s = s.slice(0, s.length - k) + "." + s.slice(s.length - k);
      s = s.replace(/\.?0+$/, "");
    }
    if (s.length > 17) return null;
    return (neg ? "−" : "") + s;
  },
};

/* ═════════════════════ 4. Lecture du texte ═════════════════════════════
   Un analyseur lexical, puis un analyseur syntaxique de Pratt. Le choix de
   Pratt n'est pas une coquetterie : la multiplication implicite (« 2π »,
   « 3(x+1) », « (x+1)(x−1) ») se greffe en trois lignes sur une boucle de
   priorités, alors qu'elle demande une grammaire entière ailleurs. */

const SYMBOLES = { "×": "*", "·": "*", "÷": "/", "−": "-", "–": "-", "—": "-",
                   "∗": "*", ",": ";",
                   "≤": "<=", "≥": ">=", "→": "->", "▶": "->" };

/* ── Les exposants écrits en petit ──────────────────────────────────────
   Demandé : « quand j'écris e^1 je veux que le 1 se mette en puissance en
   haut, et pareil pour tout. » La page les produit donc à la frappe, et
   le moteur doit les lire.

   Les lire comme UN exposant, et non comme une suite : « 2¹⁰ » vaut mille
   vingt-quatre, pas (2¹)⁰ = 1. L'ancienne table traitait « ² » et « ³ »
   un caractère à la fois — ce qui suffisait tant que personne ne pouvait
   en écrire deux de suite.

   Et « ⁻ » y était rangé comme un moins ORDINAIRE. « 2⁻³ » s'y lisait
   donc « 2 − 2³ », soit −6 au lieu de 0,125. Le défaut n'était atteignable
   par personne tant que rien ne produisait ce caractère ; il le devient
   aujourd'hui, et c'est la raison pour laquelle on le trouve maintenant. */
const LU_EN_EXPOSANT = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5",
                         "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+" };

function lire(src) {
  const jetons = [];
  let i = 0, decimalVu = false;
  const n = src.length;
  while (i < n) {
    let c = src[i];
    if (c === " " || c === "\t" || c === "\n") { i++; continue; }
    /* La suite ENTIÈRE des petits caractères fait un seul exposant, et on
       la parenthèse : sans les parenthèses, « 2⁻³ » rendrait « 2^-3 », que
       l'analyseur lit « (2^) − 3 ». */
    if (LU_EN_EXPOSANT[c]) {
      let j = i, brut = "";
      while (j < n) {
        if (LU_EN_EXPOSANT[src[j]]) { brut += LU_EN_EXPOSANT[src[j]]; j++; continue; }
        /* Un point n'appartient à l'exposant que s'il est ENCADRÉ de petits
           chiffres. « e¹⁰.⁹³ » est un seul exposant ; « 2³.5 », dont le 5
           est resté en gros, reste un cube multiplié par 0,5 — le moteur
           lit donc ce que l'œil lit, et c'est la seule règle qui tienne. */
        if (src[j] === "." && LU_EN_EXPOSANT[src[j + 1]]) { brut += "."; j++; continue; }
        break;
      }
      const signe = brut[0] === "-" || brut[0] === "+" ? brut[0] : "";
      const chiffres = signe ? brut.slice(1) : brut;
      /* Un seul point : « e¹.².³ » est une faute de frappe, et une faute de
         frappe se dit. Elle ne se rattrape pas en silence par un produit. */
      if (!/^[0-9]+(?:\.[0-9]+)?$/.test(chiffres))
        return { erreur: "Exposant illisible : « " + src.slice(i, j) + " »." };
      jetons.push({ t: "op", v: "^" }, { t: "(", v: "(" });
      if (signe === "-") jetons.push({ t: "op", v: "-" });
      jetons.push({ t: "num", v: chiffres, exact: EX.depuisTexte(chiffres) },
                  { t: ")", v: ")" });
      i = j; continue;
    }
    if (SYMBOLES[c]) {
      const t = SYMBOLES[c];
      i++;
      /* « -> » peut venir du symbole ou des deux caractères : une seule
         sortie pour les deux écritures. */
      jetons.push({ t: "op", v: t }); continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      if (src[j] === ".") { decimalVu = true; j++; while (j < n && /[0-9]/.test(src[j])) j++; }
      if (/[eE]/.test(src[j] || "") && /[0-9+-]/.test(src[j + 1] || "")
          && !/[a-zA-Zα-ωΑ-Ω]/.test(src[j + 2] || "")) {
        j++; if (/[+-]/.test(src[j])) j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      const brut = src.slice(i, j);
      if (brut === ".") return { erreur: "Un point tout seul n'est pas un nombre." };
      /* « 2..3 » se lisait « 2. » puis « .3 », et la multiplication
         implicite en faisait 0,6 sans un mot. Un deuxième point collé à
         un nombre est une faute de frappe, pas un produit. */
      if (src[j] === ".") return { erreur: "Deux points dans le même nombre : « " + brut + ". »" };
      jetons.push({ t: "num", v: brut, exact: EX.depuisTexte(brut) });
      i = j; continue;
    }
    if (/[a-zA-Zα-ωΑ-Ωéèêàçûôî_]/.test(c)) {
      let j = i;
      while (j < n && /[a-zA-Z0-9α-ωΑ-Ωéèêàçûôî_]/.test(src[j])) j++;
      jetons.push({ t: "nom", v: src.slice(i, j) });
      i = j; continue;
    }
    if (c === "π") { jetons.push({ t: "nom", v: "π" }); i++; continue; }
    if (c === "√") { jetons.push({ t: "op", v: "√" }); i++; continue; }
    if (c === "∫") { jetons.push({ t: "nom", v: "integrale" }); i++; continue; }
    if (c === "Σ") { jetons.push({ t: "nom", v: "somme" }); i++; continue; }
    if (c === "∏") { jetons.push({ t: "nom", v: "produit" }); i++; continue; }
    if (c === "∞") { jetons.push({ t: "nom", v: "inf" }); i++; continue; }
    if ("+-*/^!();<>=".includes(c)) {
      if (c === "-" && src[i + 1] === ">") { jetons.push({ t: "op", v: "->" }); i += 2; continue; }
      if (c === "<" && src[i + 1] === "=") { jetons.push({ t: "op", v: "<=" }); i += 2; continue; }
      if (c === ">" && src[i + 1] === "=") { jetons.push({ t: "op", v: ">=" }); i += 2; continue; }
      jetons.push({ t: c === "(" ? "(" : c === ")" ? ")" : c === ";" ? ";" : "op", v: c });
      i++; continue;
    }
    if (c === "[" || c === "{") { jetons.push({ t: "(", v: "(" }); i++; continue; }
    if (c === "]" || c === "}") { jetons.push({ t: ")", v: ")" }); i++; continue; }
    return { erreur: "Caractère que je ne sais pas lire : « " + c + " »." };
  }
  jetons.push({ t: "fin" });
  return { jetons, decimalVu };
}

/* Les noms de fonctions. Le français d'abord — c'est la langue des
   énoncés —, les noms de l'appareil réel et de la machine en alias, parce
   qu'un élève qui a tapé « binomcdf » sur la calculatrice du voisin doit
   retrouver la même chose ici. */
const ALIAS = {
  "racine": "sqrt", "√": "sqrt", "rac": "sqrt",
  "valeurabsolue": "abs", "val": "abs",
  "partieentiere": "floor", "ent": "floor", "plancher": "floor",
  "plafond": "ceil", "troncature": "trunc", "arrondi": "round",
  "factorielle": "fact",
  "combinaison": "combinaison", "ncr": "combinaison", "binome": "combinaison",
  "arrangement": "arrangement", "npr": "arrangement",
  "pgcd": "pgcd", "gcd": "pgcd", "ppcm": "ppcm", "lcm": "ppcm",
  "reste": "mod", "modulo": "mod", "quotient": "quotient",
  "derivee": "derivee", "dérivée": "derivee", "diff": "derivee",
  "integrale": "integrale", "intégrale": "integrale", "int": "integrale",
  "somme": "somme", "sum": "somme", "produit": "produit", "prod": "produit",
  "moyenne": "moyenne", "mean": "moyenne",
  "ecarttype": "ecartType", "écarttype": "ecartType", "stddev": "ecartType",
  "variance": "variance", "median": "mediane", "mediane": "mediane",
  "binomialepdf": "binomialePdf", "binompdf": "binomialePdf",
  "binomfdp": "binomialePdf", "binomialecdf": "binomialeCdf",
  "binomcdf": "binomialeCdf", "binomfrép": "binomialeCdf",
  "binomfrep": "binomialeCdf",
  "invbinomiale": "invBinomiale", "invbinom": "invBinomiale",
  "normalepdf": "normalePdf", "normalpdf": "normalePdf", "normalfdp": "normalePdf",
  "normalecdf": "normaleCdf", "normalcdf": "normaleCdf",
  "normalfrép": "normaleCdf", "normalfrep": "normaleCdf",
  "invnormale": "invNormale", "invnorm": "invNormale",
  "fracnormale": "invNormale", "invnormal": "invNormale",
  "poissonpdf": "poissonPdf", "poissoncdf": "poissonCdf",
  "geompdf": "geomPdf", "geomcdf": "geomCdf",
  "hyperpdf": "hyperPdf", "hypercdf": "hyperCdf",
  "expopdf": "expoPdf", "expocdf": "expoCdf", "invexpo": "invExpo",
  "uniformecdf": "uniformeCdf",
  "studentcdf": "studentCdf", "khi2cdf": "khi2Cdf", "fishercdf": "fisherCdf",
  "aleatoire": "alea", "alea": "alea", "random": "alea",
  "entieraleatoire": "aleaEntier", "randint": "aleaEntier",
  "arcsin": "asin", "arccos": "acos", "arctan": "atan",
  "ln": "ln", "log": "log", "exp": "exp",
};
const N_FONCTIONS = new Set([
  "sqrt", "abs", "floor", "ceil", "trunc", "round", "fact", "exp", "ln", "log",
  "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh",
  "combinaison", "arrangement", "pgcd", "ppcm", "mod", "quotient",
  "derivee", "integrale", "somme", "produit", "min", "max", "signe",
  "moyenne", "ecartType", "variance", "mediane",
  "binomialePdf", "binomialeCdf", "invBinomiale",
  "normalePdf", "normaleCdf", "invNormale",
  "poissonPdf", "poissonCdf", "geomPdf", "geomCdf", "hyperPdf", "hyperCdf",
  "expoPdf", "expoCdf", "invExpo", "uniformeCdf",
  "studentCdf", "khi2Cdf", "fisherCdf", "alea", "aleaEntier",
]);
/* Les quatre formes SPÉCIALES : leur deuxième argument est un NOM de
   variable, pas une valeur. « somme(k;k;1;10) » ne doit pas évaluer le
   deuxième « k » — il désigne la lettre qui varie. */
const SPECIALES = { somme: 1, produit: 1, derivee: 1, integrale: 1 };

function nomCanonique(v) {
  const bas = v.toLowerCase();
  if (ALIAS[bas]) return ALIAS[bas];
  if (N_FONCTIONS.has(v)) return v;
  for (const f of N_FONCTIONS) if (f.toLowerCase() === bas) return f;
  return null;
}

const PRIO = { "->": 2, "=": 4, "<": 6, ">": 6, "<=": 6, ">=": 6,
               "+": 10, "-": 10, "*": 20, "/": 20, "^": 30 };

function analyser(src) {
  const lu = lire(src);
  if (lu.erreur) return { erreur: lu.erreur };
  const J = lu.jetons;
  let k = 0;
  /* « 2+ » faisait sortir l'analyseur du tableau : atome() consommait le
     jeton de fin, puis voir() rendait undefined et la suite plantait sur
     « .t of undefined ». Une saisie incomplète est le cas le plus COURANT
     d'une calculatrice — on tape et on efface sans arrêt. Le jeton de fin
     est donc collant : on peut le lire autant de fois qu'on veut. */
  const voir = () => J[k < J.length ? k : J.length - 1];
  const avancer = () => (k < J.length ? J[k++] : J[J.length - 1]);
  let faute = null;
  const rater = (m) => { if (!faute) faute = m; return { t: "num", v: "0", exact: exZero() }; };

  function atome() {
    const j = avancer();
    if (j.t === "num") return { t: "num", v: parseFloat(j.v), exact: j.exact, brut: j.v };
    if (j.t === "(") {
      const e = expr(0);
      if (voir().t !== ")") return rater("Il manque une parenthèse fermante.");
      avancer();
      return e;
    }
    if (j.t === "op" && (j.v === "-" || j.v === "+")) {
      const a = expr(25);
      return j.v === "-" ? { t: "neg", a } : a;
    }
    if (j.t === "op" && j.v === "√") return { t: "appel", n: "sqrt", args: [expr(35)] };
    if (j.t === "nom") {
      const brut = j.v;
      const bas = brut.toLowerCase();
      if (bas === "π" || bas === "pi") return { t: "pi" };
      if (bas === "inf") return { t: "num", v: Infinity, exact: null, brut: "∞" };
      const canon = nomCanonique(brut);
      if (canon && voir().t === "(") {
        avancer();
        const args = [];
        const special = SPECIALES[canon];
        if (voir().t !== ")") {
          for (;;) {
            if (special !== undefined && args.length === special && voir().t === "nom") {
              args.push({ t: "lettre", n: avancer().v });
            } else {
              args.push(expr(0));
            }
            if (voir().t === ";") { avancer(); continue; }
            break;
          }
        }
        if (voir().t !== ")") return rater("Il manque une parenthèse fermante après « " + brut + " ».");
        avancer();
        return { t: "appel", n: canon, args };
      }
      if (canon && !voir().t.startsWith("(")) {
        /* « sin » sans parenthèses : l'appareil réel ouvre la parenthèse
           tout seul, donc on l'imite plutôt que de refuser. */
        if (["sqrt", "ln", "log", "exp", "sin", "cos", "tan", "abs"].includes(canon))
          return { t: "appel", n: canon, args: [expr(35)] };
      }
      /* Un nom INCONNU suivi d'une parenthèse : c'est un appel à une
         fonction définie ailleurs — f(x) de l'application Fonctions,
         u(n) de l'application Suites. Si elle n'existe pas mais que la
         lettre porte une valeur, l'évaluateur retombe sur une
         multiplication : « a(b+1) » reste « a × (b+1) ». La règle est
         écrite deux fois — ici et dans l'évaluateur — et nulle part
         ailleurs. */
      if (!canon && voir().t === "(") {
        avancer();
        const args = [];
        if (voir().t !== ")") {
          for (;;) {
            args.push(expr(0));
            if (voir().t === ";") { avancer(); continue; }
            break;
          }
        }
        if (voir().t !== ")")
          return rater("Il manque une parenthèse fermante après « " + brut + " ».");
        avancer();
        return { t: "appelUtil", n: brut, args };
      }
      if (/^[A-Za-zα-ωΑ-Ω][0-9]?$/.test(brut) || brut === "ans" || brut === "Ans") {
        return { t: "var", n: brut === "Ans" ? "ans" : brut };
      }
      if (bas === "e") return { t: "var", n: "e" };
      return rater("« " + brut + " » : je ne connais pas ce nom. "
                   + "Les fonctions s'écrivent avec des parenthèses, et les variables "
                   + "sont des lettres seules.");
    }
    return rater("Il manque quelque chose" + (j.t === "fin" ? " à la fin." : " ici."));
  }

  function suite(gauche) {
    for (;;) {
      const j = voir();
      if (j.t === "op" && j.v === "!") { avancer(); gauche = { t: "fac", a: gauche }; continue; }
      break;
    }
    return gauche;
  }

  function expr(mini) {
    let g = suite(atome());
    for (;;) {
      const j = voir();
      if (j.t === "op" && PRIO[j.v] !== undefined) {
        const p = PRIO[j.v];
        if (p < mini) break;
        avancer();
        /* « ^ » est associatif à DROITE : 2^3^2 vaut 2⁹ = 512, pas 64. */
        const d = expr(j.v === "^" ? p : p + 1);
        g = suite({ t: "op", o: j.v, a: g, b: d });
        continue;
      }
      /* La multiplication implicite. Elle ne se déclenche QUE devant un
         atome qui ne peut pas être un opérateur : un nombre, une lettre,
         une parenthèse ouvrante, un radical. */
      if (20 >= mini && (j.t === "num" || j.t === "nom" || j.t === "("
                         || (j.t === "op" && j.v === "√"))) {
        const d = expr(21);
        g = suite({ t: "op", o: "*", a: g, b: d, implicite: true });
        continue;
      }
      break;
    }
    return g;
  }

  const arbre = expr(0);
  if (!faute && voir().t !== "fin")
    faute = "Je ne comprends pas ce qui suit « " + src.slice(0, 24) + " ».";
  return faute ? { erreur: faute } : { arbre, decimalVu: lu.decimalVu };
}

/* ═════════════════════ 5. Évaluation numérique ═════════════════════════
   Les erreurs ne sont pas des codes : ce sont des phrases. « Error », un
   élève le lit comme « j'ai raté » ; « Le logarithme n'accepte que des
   nombres strictement positifs », il le lit comme une règle. C'est la
   seule différence entre un outil et un mur. */
class ErreurCalc extends Error {}
const boum = (m) => { throw new ErreurCalc(m); };

/* L'arrondi scolaire, et il demande une précaution.

   « 2.675 » n'existe pas en binaire : le double le plus proche vaut
   2,674999999999999822… Donc « toFixed(2) » rend 2,67, et arrondi(2.675;2)
   affiche 2,67 — ce qu'aucun élève n'acceptera, à juste titre : on lui a
   appris que 2,675 arrondi au centième fait 2,68.

   String(x) rend la plus COURTE écriture décimale qui redonne exactement
   ce double — « 2.675 ». C'est donc la décimale que l'élève a tapée, et
   c'est sur elle qu'on arrondit, chiffre par chiffre. Le 0,5 s'éloigne de
   zéro : −2,5 donne −3, comme au tableau. La couche exacte applique la
   même règle, et le banc vérifie que les deux tombent d'accord. */
function arrondiDecimal(x, d) {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0, s = String(Math.abs(x));
  if (/[eE]/.test(s)) return parseFloat(Math.abs(x).toFixed(d)) * (neg ? -1 : 1);
  const point = s.indexOf(".");
  const ent = point < 0 ? s : s.slice(0, point);
  const dec = point < 0 ? "" : s.slice(point + 1);
  if (dec.length <= d) return x;
  let p = BigInt(ent + dec.slice(0, d));
  if (dec.charCodeAt(d) >= 53) p += 1n;          // le chiffre suivant vaut 5 ou plus
  const v = Number(p) / Math.pow(10, d);
  return neg ? -v : v;
}

function versRadian(x, unite) {
  return unite === "deg" ? x * Math.PI / 180
       : unite === "grad" ? x * Math.PI / 200 : x;
}
function depuisRadian(x, unite) {
  return unite === "deg" ? x * 180 / Math.PI
       : unite === "grad" ? x * 200 / Math.PI : x;
}

function evaluer(noeud, ctx) {
  const R = ctx.reglages || REGLAGES();
  const ev = (n) => evaluer(n, ctx);
  switch (noeud.t) {
    case "num": return noeud.v;
    case "pi": return Math.PI;
    case "var": {
      const n = noeud.n;
      if (n === "e") return Math.E;
      if (ctx.vars && ctx.vars.has(n)) return ctx.vars.get(n);
      if (ctx.locales && n in ctx.locales) return ctx.locales[n];
      boum("La variable « " + n + " » n'a pas de valeur. "
           + "Donnez-lui-en une avec « 3→" + n + " ».");
      break;
    }
    case "lettre": boum("« " + noeud.n + " » est ici un nom de variable, pas une valeur.");
      break;
    case "neg": return -ev(noeud.a);
    case "fac": {
      const x = ev(noeud.a);
      if (!Number.isInteger(x) || x < 0)
        boum("La factorielle ne se calcule que sur un entier positif.");
      if (x > 170) boum("170! est le dernier que la machine sait écrire.");
      let r = 1; for (let i = 2; i <= x; i++) r *= i; return r;
    }
    case "op": {
      if (noeud.o === "->") {
        const v = ev(noeud.a);
        const cible = noeud.b.t === "var" ? noeud.b.n : null;
        if (!cible) boum("Après « → » il faut une lettre : « 5→A ».");
        if (!ctx.vars) ctx.vars = new Map();
        ctx.vars.set(cible, v);
        ctx.dernierStockage = cible;
        return v;
      }
      const a = ev(noeud.a), b = ev(noeud.b);
      switch (noeud.o) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/":
          if (b === 0) boum("Division par zéro.");
          return a / b;
        case "^":
          if (a < 0 && !Number.isInteger(b))
            boum("Un nombre négatif ne se met pas à une puissance non entière "
                 + "(il faudrait les nombres complexes).");
          if (a === 0 && b < 0) boum("Division par zéro.");
          return Math.pow(a, b);
        case "=": boum("Un « = » ne se calcule pas : il se résout. "
                       + "Utilisez l'application Équations.");
          break;
        case "<": return a < b ? 1 : 0;
        case ">": return a > b ? 1 : 0;
        case "<=": return a <= b ? 1 : 0;
        case ">=": return a >= b ? 1 : 0;
      }
      break;
    }
    case "appel": return appeler(noeud, ctx, R);
    case "appelUtil": {
      const nom = noeud.n;
      const fns = ctx.fonctions || {};
      if (typeof fns[nom] === "function")
        return fns[nom].apply(null, noeud.args.map(ev));
      /* « e(2) » n'est PAS l'exponentielle : la règle d'en dessous en
         ferait e × 2 = 5,44, quand celui qui l'écrit attend 7,39. Et le
         piège se referme sur le seul essai qu'on fait pour vérifier :
         « e(1) » rend 2,718, la bonne valeur, par accident — e × 1 vaut
         bien e. Le premier test est donc précisément celui qui ne révèle
         rien. Une réponse plausible et fausse vaut moins qu'un refus qui
         dit quoi écrire ; on refuse, et on donne les deux écritures. */
      if (nom === "e" && noeud.args.length === 1)
        boum("« e(…) » n'est pas l'exponentielle : écrivez « exp(…) » ou "
             + "« e^… ». Pour multiplier par e, écrivez « e*… ».");
      /* Pas de fonction de ce nom : si la lettre porte une valeur, la
         parenthèse était une multiplication implicite. */
      const connue = (ctx.vars && ctx.vars.has(nom))
                  || (ctx.locales && nom in ctx.locales) || nom === "e";
      if (connue && noeud.args.length === 1)
        return ev({ t: "var", n: nom }) * ev(noeud.args[0]);
      boum("La fonction « " + nom + " » n'est pas définie. "
           + "Les fonctions se définissent dans l'application Fonctions, "
           + "les suites dans l'application Suites.");
      break;
    }
  }
  boum("Expression que je ne sais pas évaluer.");
}

function appeler(noeud, ctx, R) {
  const A = noeud.args;
  const ev = (n) => evaluer(n, ctx);
  const n1 = (nom) => { if (A.length !== 1) boum(nom + " attend un seul nombre."); return ev(A[0]); };
  const nbArgs = (nom, mini, maxi) => {
    if (A.length < mini || A.length > maxi)
      boum(nom + " attend " + (mini === maxi ? mini + " argument" + (mini > 1 ? "s" : "")
            : "entre " + mini + " et " + maxi + " arguments") + ", pas " + A.length + ".");
  };
  /* Les quatre formes spéciales : la lettre qui varie est liée dans un
     cadre LOCAL. Sans ce cadre, « somme(k;k;1;10) » écraserait un K que
     l'élève avait rangé en mémoire — un effet de bord invisible. */
  const avecLocale = (nom, valeur, f) => {
    const anciennes = ctx.locales || {};
    ctx.locales = Object.assign(Object.create(null), anciennes);
    ctx.locales[nom] = valeur;
    try { return f(); } finally { ctx.locales = anciennes; }
  };
  const fonctionDe = (iExpr, iLettre) => {
    const lettre = A[iLettre] && A[iLettre].t === "lettre" ? A[iLettre].n
                 : A[iLettre] && A[iLettre].t === "var" ? A[iLettre].n : null;
    if (!lettre) boum("Le deuxième argument doit être la lettre qui varie, par exemple « x ».");
    /* Un point où la fonction n'existe pas ne doit pas tuer le calcul
       entier : ∫₀¹ dx/√x vaut 2, et pourtant l'intégrande explose en 0.
       On rend NaN pour ce point-là — l'intégrateur le saute — et on
       GARDE le message. S'il ne reste rien de fini au bout, c'est ce
       message qu'on affiche, et non un « indéfini » muet. */
    const boite = { erreur: null };
    const f = (v) => {
      try { return avecLocale(lettre, v, () => evaluer(A[iExpr], ctx)); }
      catch (e) {
        if (e instanceof ErreurCalc) { if (!boite.erreur) boite.erreur = e.message; return NaN; }
        throw e;
      }
    };
    return [lettre, f, boite];
  };

  switch (noeud.n) {
    case "sqrt": {
      const x = n1("La racine carrée");
      if (x < 0) boum("La racine carrée d'un nombre négatif n'existe pas dans les réels.");
      return Math.sqrt(x);
    }
    case "abs": return Math.abs(n1("La valeur absolue"));
    case "floor": return Math.floor(n1("La partie entière"));
    case "ceil": return Math.ceil(n1("Le plafond"));
    case "trunc": return Math.trunc(n1("La troncature"));
    case "signe": { const x = n1("Le signe"); return x > 0 ? 1 : x < 0 ? -1 : 0; }
    case "round": {
      nbArgs("L'arrondi", 1, 2);
      const x = ev(A[0]), d = A.length > 1 ? ev(A[1]) : 0;
      if (!Number.isInteger(d) || d < 0 || d > 15)
        boum("Le nombre de décimales de l'arrondi doit être un entier de 0 à 15.");
      return arrondiDecimal(x, d);
    }
    case "fact": { const x = n1("La factorielle");
      return evaluer({ t: "fac", a: { t: "num", v: x } }, ctx); }
    case "exp": return Math.exp(n1("L'exponentielle"));
    case "ln": { const x = n1("Le logarithme népérien");
      if (x <= 0) boum("Le logarithme n'accepte que des nombres strictement positifs.");
      return Math.log(x); }
    case "log": {
      nbArgs("Le logarithme", 1, 2);
      const x = ev(A[0]);
      if (x <= 0) boum("Le logarithme n'accepte que des nombres strictement positifs.");
      if (A.length === 1) return Math.log10(x);
      const b = ev(A[1]);
      if (b <= 0 || b === 1) boum("La base d'un logarithme est strictement positive et différente de 1.");
      return Math.log(x) / Math.log(b);
    }
    case "sin": return Math.sin(versRadian(n1("Le sinus"), R.angle));
    case "cos": return Math.cos(versRadian(n1("Le cosinus"), R.angle));
    case "tan": {
      const x = versRadian(n1("La tangente"), R.angle);
      const c = Math.cos(x);
      if (Math.abs(c) < 1e-15) boum("La tangente n'existe pas là : le cosinus y est nul.");
      return Math.sin(x) / c;
    }
    case "asin": { const x = n1("L'arc sinus");
      if (x < -1 || x > 1) boum("L'arc sinus n'accepte qu'un nombre entre −1 et 1.");
      return depuisRadian(Math.asin(x), R.angle); }
    case "acos": { const x = n1("L'arc cosinus");
      if (x < -1 || x > 1) boum("L'arc cosinus n'accepte qu'un nombre entre −1 et 1.");
      return depuisRadian(Math.acos(x), R.angle); }
    case "atan": return depuisRadian(Math.atan(n1("L'arc tangente")), R.angle);
    case "sinh": return Math.sinh(n1("Le sinus hyperbolique"));
    case "cosh": return Math.cosh(n1("Le cosinus hyperbolique"));
    case "tanh": return Math.tanh(n1("La tangente hyperbolique"));
    case "combinaison": {
      nbArgs("Une combinaison", 2, 2);
      const n = ev(A[0]), k = ev(A[1]);
      if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0)
        boum("Une combinaison se calcule sur des entiers : combinaison(n;k).");
      if (k < 0 || k > n) return 0;
      return combinaison(n, k);
    }
    case "arrangement": {
      nbArgs("Un arrangement", 2, 2);
      const n = ev(A[0]), k = ev(A[1]);
      if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0)
        boum("Un arrangement se calcule sur des entiers positifs.");
      if (k > n) return 0;
      return arrangement(n, k);
    }
    case "pgcd": case "ppcm": {
      if (A.length < 2) boum("Il faut au moins deux nombres.");
      const v = A.map(ev);
      if (!v.every((x) => Number.isInteger(x))) boum("PGCD et PPCM ne se calculent que sur des entiers.");
      const g2 = (a, b) => { a = Math.abs(a); b = Math.abs(b);
        while (b) { const t = a % b; a = b; b = t; } return a; };
      return noeud.n === "pgcd" ? v.reduce(g2)
        : v.reduce((a, b) => (a === 0 || b === 0) ? 0 : Math.abs(a * b) / g2(a, b));
    }
    case "mod": {
      nbArgs("Le reste", 2, 2);
      const a = ev(A[0]), b = ev(A[1]);
      if (b === 0) boum("Reste d'une division par zéro.");
      /* Le reste MATHÉMATIQUE, toujours du signe du diviseur :
         reste(−7;3) vaut 2, et non −1 comme le « % » du C. C'est la
         convention des énoncés d'arithmétique. */
      return a - b * Math.floor(a / b);
    }
    case "quotient": {
      nbArgs("Le quotient", 2, 2);
      const a = ev(A[0]), b = ev(A[1]);
      if (b === 0) boum("Division par zéro.");
      return Math.floor(a / b);
    }
    case "min": case "max": {
      if (!A.length) boum("Il faut au moins un nombre.");
      const v = A.map(ev);
      return noeud.n === "min" ? Math.min(...v) : Math.max(...v);
    }
    case "moyenne": case "ecartType": case "variance": case "mediane": {
      if (!A.length) boum("Il faut au moins un nombre.");
      const v = A.map(ev).slice().sort((a, b) => a - b);
      const n = v.length, m = v.reduce((a, b) => a + b, 0) / n;
      if (noeud.n === "moyenne") return m;
      if (noeud.n === "mediane")
        return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
      const V = v.reduce((a, x) => a + (x - m) * (x - m), 0) / n;
      return noeud.n === "variance" ? V : Math.sqrt(V);
    }
    case "somme": case "produit": {
      nbArgs(noeud.n === "somme" ? "Une somme" : "Un produit", 4, 4);
      const [, f, boite] = fonctionDe(0, 1);
      const a = ev(A[2]), b = ev(A[3]);
      if (!Number.isInteger(a) || !Number.isInteger(b))
        boum("Les bornes d'une somme sont des entiers.");
      if (b - a > 1000000) boum("Plus d'un million de termes : refusé.");
      let acc = noeud.n === "somme" ? 0 : 1;
      for (let k = a; k <= b; k++) {
        const v = f(k);
        acc = noeud.n === "somme" ? acc + v : acc * v;
      }
      /* Une somme, elle, ne SAUTE pas un terme impossible : si un seul
         terme n'existe pas, la somme n'existe pas, et on dit pourquoi. */
      if (!Number.isFinite(acc) && boite.erreur) boum(boite.erreur);
      return acc;
    }
    case "derivee": {
      nbArgs("La dérivée", 3, 3);
      const [, f, boite] = fonctionDe(0, 1);
      const v = derivee(f, ev(A[2]));
      if (!Number.isFinite(v) && boite.erreur) boum(boite.erreur);
      return v;
    }
    case "integrale": {
      nbArgs("L'intégrale", 4, 4);
      const [, f, boite] = fonctionDe(0, 1);
      const a = ev(A[2]), b = ev(A[3]);
      if (!Number.isFinite(a) || !Number.isFinite(b))
        boum("Les bornes d'une intégrale doivent être finies.");
      const v = integrale(f, a, b);
      if (!Number.isFinite(v) && boite.erreur) boum(boite.erreur);
      return v;
    }
    case "alea": { nbArgs("Un nombre au hasard", 0, 0); return Math.random(); }
    case "aleaEntier": {
      nbArgs("Un entier au hasard", 2, 2);
      const a = Math.ceil(ev(A[0])), b = Math.floor(ev(A[1]));
      if (b < a) boum("La borne haute doit être supérieure à la borne basse.");
      return a + Math.floor(Math.random() * (b - a + 1));
    }
    /* ── les lois : les arguments sont contrôlés, et les messages disent
       la CONDITION, pas « argument invalide ». */
    case "binomialePdf": case "binomialeCdf": {
      nbArgs("Cette loi binomiale", 3, 3);
      const n = ev(A[0]), p = ev(A[1]), k = ev(A[2]);
      if (!Number.isInteger(n) || n < 0) boum("n est le nombre de répétitions : un entier positif.");
      if (p < 0 || p > 1) boum("p est une probabilité : entre 0 et 1.");
      return noeud.n === "binomialePdf" ? LOIS.binomialePdf(n, p, k) : LOIS.binomialeCdf(n, p, k);
    }
    case "invBinomiale": {
      nbArgs("L'inverse de la binomiale", 3, 3);
      const n = ev(A[0]), p = ev(A[1]), a = ev(A[2]);
      if (!Number.isInteger(n) || n < 0) boum("n est le nombre de répétitions : un entier positif.");
      if (p < 0 || p > 1) boum("p est une probabilité : entre 0 et 1.");
      if (a <= 0 || a >= 1) boum("Le seuil est strictement entre 0 et 1.");
      return LOIS.invBinomiale(n, p, a);
    }
    case "normalePdf": case "normaleCdf": {
      nbArgs("Cette loi normale", 1, 4);
      const x = ev(A[0]);
      if (noeud.n === "normaleCdf" && A.length === 4) {
        const b = ev(A[1]), mu = ev(A[2]), s = ev(A[3]);
        if (s <= 0) boum("L'écart type σ est strictement positif.");
        return LOIS.normaleEntre(x, b, mu, s);
      }
      const mu = A.length > 1 ? ev(A[1]) : 0, s = A.length > 2 ? ev(A[2]) : 1;
      if (s <= 0) boum("L'écart type σ est strictement positif.");
      return noeud.n === "normalePdf" ? LOIS.normalePdf(x, mu, s) : LOIS.normaleCdf(x, mu, s);
    }
    case "invNormale": {
      nbArgs("L'inverse de la normale", 1, 3);
      const q = ev(A[0]), mu = A.length > 1 ? ev(A[1]) : 0, s = A.length > 2 ? ev(A[2]) : 1;
      if (q <= 0 || q >= 1) boum("La probabilité est strictement entre 0 et 1.");
      if (s <= 0) boum("L'écart type σ est strictement positif.");
      return LOIS.invNormale(q, mu, s);
    }
    case "poissonPdf": case "poissonCdf": {
      nbArgs("Cette loi de Poisson", 2, 2);
      const l = ev(A[0]), k = ev(A[1]);
      if (l <= 0) boum("Le paramètre λ d'une loi de Poisson est strictement positif.");
      return noeud.n === "poissonPdf" ? LOIS.poissonPdf(l, k) : LOIS.poissonCdf(l, k);
    }
    case "geomPdf": case "geomCdf": {
      nbArgs("Cette loi géométrique", 2, 2);
      const p = ev(A[0]), k = ev(A[1]);
      if (p <= 0 || p > 1) boum("p est une probabilité strictement positive.");
      return noeud.n === "geomPdf" ? LOIS.geomPdf(p, k) : LOIS.geomCdf(p, k);
    }
    case "hyperPdf": case "hyperCdf": {
      nbArgs("Cette loi hypergéométrique", 4, 4);
      const N = ev(A[0]), K = ev(A[1]), n = ev(A[2]), k = ev(A[3]);
      if (![N, K, n].every((x) => Number.isInteger(x) && x >= 0) || K > N || n > N)
        boum("Il faut des entiers avec K ⩽ N et n ⩽ N.");
      return noeud.n === "hyperPdf" ? LOIS.hyperPdf(N, K, n, k) : LOIS.hyperCdf(N, K, n, k);
    }
    case "expoPdf": case "expoCdf": {
      nbArgs("Cette loi exponentielle", 2, 2);
      const l = ev(A[0]), x = ev(A[1]);
      if (l <= 0) boum("Le paramètre λ d'une loi exponentielle est strictement positif.");
      return noeud.n === "expoPdf" ? LOIS.expoPdf(l, x) : LOIS.expoCdf(l, x);
    }
    case "invExpo": {
      nbArgs("L'inverse de l'exponentielle", 2, 2);
      const q = ev(A[0]), l = ev(A[1]);
      if (q < 0 || q >= 1) boum("La probabilité est dans [0 ; 1[.");
      if (l <= 0) boum("Le paramètre λ est strictement positif.");
      return LOIS.invExpo(q, l);
    }
    case "uniformeCdf": {
      nbArgs("La loi uniforme", 3, 3);
      const x = ev(A[0]), a = ev(A[1]), b = ev(A[2]);
      if (a >= b) boum("Il faut a < b.");
      return LOIS.uniformeCdf(x, a, b);
    }
    case "studentCdf": {
      nbArgs("La loi de Student", 2, 2);
      const t = ev(A[0]), nu = ev(A[1]);
      if (nu <= 0) boum("Le nombre de degrés de liberté est strictement positif.");
      return LOIS.studentCdf(t, nu);
    }
    case "khi2Cdf": {
      nbArgs("La loi du khi deux", 2, 2);
      const x = ev(A[0]), k = ev(A[1]);
      if (k <= 0) boum("Le nombre de degrés de liberté est strictement positif.");
      return LOIS.khi2Cdf(x, k);
    }
    case "fisherCdf": {
      nbArgs("La loi de Fisher", 3, 3);
      const x = ev(A[0]), d1 = ev(A[1]), d2 = ev(A[2]);
      if (d1 <= 0 || d2 <= 0) boum("Les degrés de liberté sont strictement positifs.");
      return LOIS.fisherCdf(x, d1, d2);
    }
  }
  boum("La fonction « " + noeud.n + " » n'est pas implémentée.");
}

/* ═════════════════════ 6. Évaluation exacte ════════════════════════════
   Même arbre, autre arithmétique. Toute branche qui sort de la famille
   rend `null`, et `null` se propage : c'est le seul comportement sûr —
   une couche exacte qui « arrondit un peu » est une couche fausse. */

/* Les angles remarquables, par douzièmes de π. Les douzièmes impairs non
   multiples de 3 (π/12, 5π/12…) valent (√6 ± √2)/4 : une SOMME de deux
   radicaux, qui n'a pas de forme dans la famille. Ils sont donc absents,
   et c'est volontaire. */
const ANGLES = {};
(function () {
  const t = {
    0:  [[1, 1, 1], [0, 1, 1]],
    2:  [[1, 2, 3], [1, 2, 1]],
    3:  [[1, 2, 2], [1, 2, 2]],
    4:  [[1, 2, 1], [1, 2, 3]],
    6:  [[0, 1, 1], [1, 1, 1]],
    8:  [[-1, 2, 1], [1, 2, 3]],
    9:  [[-1, 2, 2], [1, 2, 2]],
    10: [[-1, 2, 3], [1, 2, 1]],
    12: [[-1, 1, 1], [0, 1, 1]],
    14: [[-1, 2, 3], [-1, 2, 1]],
    15: [[-1, 2, 2], [-1, 2, 2]],
    16: [[-1, 2, 1], [-1, 2, 3]],
    18: [[0, 1, 1], [-1, 1, 1]],
    20: [[1, 2, 1], [-1, 2, 3]],
    21: [[1, 2, 2], [-1, 2, 2]],
    22: [[1, 2, 3], [-1, 2, 1]],
  };
  for (const k in t) ANGLES[k] = { cos: ex(...t[k][0]), sin: ex(...t[k][1]) };
})();

function douzieme(A, unite) {
  /* Rend k tel que l'angle vaut kπ/12, ou null. */
  if (!A) return null;
  if (A.r !== UN) return null;
  let p, q;
  if (unite === "rad") {
    if (estZero(A)) return 0;
    if (A.pi !== 1) return null;
    p = A.p; q = A.q;                       // angle = (p/q)·π
  } else {
    if (A.pi !== 0) return null;
    const d = unite === "deg" ? 180n : 200n;
    p = A.p; q = A.q * d;                   // angle = (p/(q·d))·π
  }
  const k12 = p * 12n;
  if (k12 % q !== ZERO) return null;
  let k = k12 / q;
  k = ((k % 24n) + 24n) % 24n;
  return Number(k);
}

function exacte(noeud, ctx) {
  const R = ctx.reglages || REGLAGES();
  const E = (n) => exacte(n, ctx);
  switch (noeud.t) {
    case "num": return noeud.exact || null;
    case "pi": return ex(1, 1, 1, 1);
    case "var": {
      if (noeud.n === "e") return null;
      if (ctx.exacts && ctx.exacts.has(noeud.n)) return ctx.exacts.get(noeud.n);
      if (ctx.localesEx && noeud.n in ctx.localesEx) return ctx.localesEx[noeud.n];
      return null;
    }
    case "neg": return EX.oppose(E(noeud.a));
    case "fac": {
      const a = E(noeud.a);
      if (!estEntier(a) || a.p < ZERO || a.p > 400n) return null;
      let r = UN;
      for (let i = 2n; i <= a.p; i++) r *= i;
      return ex(r);
    }
    case "op": {
      if (noeud.o === "->") {
        const v = E(noeud.a);
        const cible = noeud.b.t === "var" ? noeud.b.n : null;
        if (cible && ctx.exacts) ctx.exacts.set(cible, v);
        return v;
      }
      const a = E(noeud.a), b = E(noeud.b);
      if (!a || !b) return null;
      switch (noeud.o) {
        case "+": return EX.somme(a, b);
        case "-": return EX.difference(a, b);
        case "*": return EX.produit(a, b);
        case "/": return estZero(b) ? null : EX.quotient(a, b);
        case "^": {
          if (estEntier(b)) return EX.puissance(a, Number(b.p));
          /* x^(1/2) est une racine carrée, et c'est le seul exposant
             fractionnaire qui reste dans la famille. */
          if (estRationnel(b) && b.q === 2n && b.p === UN) return EX.racine(a);
          if (estRationnel(b) && b.q === 2n) {
            const r = EX.racine(a);
            return r && EX.puissance(r, Number(b.p));
          }
          return null;
        }
        default: return null;
      }
    }
    case "appel": {
      const A = noeud.args;
      const un = () => (A.length === 1 ? E(A[0]) : null);
      switch (noeud.n) {
        case "sqrt": return EX.racine(un());
        case "abs": { const a = un(); return a && (a.p < ZERO ? EX.oppose(a) : a); }
        case "signe": { const a = un(); return a && ex(a.p < ZERO ? -1 : a.p === ZERO ? 0 : 1); }
        case "floor": case "ceil": case "trunc": case "round": {
          const a = A.length >= 1 ? E(A[0]) : null;
          if (!estRationnel(a)) return null;
          if (noeud.n === "round" && A.length === 2) {
            const d = E(A[1]);
            if (!estEntier(d) || d.p < ZERO || d.p > 15n) return null;
            const m = 10n ** d.p;
            const prod = ex(a.p * m, a.q);
            const arr = arrondiBig(prod);
            return arr && ex(arr, m);
          }
          const n = noeud.n === "floor" ? divPlancher(a.p, a.q)
                  : noeud.n === "ceil" ? -divPlancher(-a.p, a.q)
                  : noeud.n === "trunc" ? (a.p < ZERO ? -((-a.p) / a.q) : a.p / a.q)
                  : arrondiBig(a);
          return n === null ? null : ex(n);
        }
        case "fact": return exacte({ t: "fac", a: A[0] }, ctx);
        case "combinaison": {
          if (A.length !== 2) return null;
          const n = E(A[0]), k = E(A[1]);
          if (!estEntier(n) || !estEntier(k)) return null;
          if (k.p < ZERO || k.p > n.p || n.p > 100000n) return k.p < ZERO || k.p > n.p ? ex(0) : null;
          let haut = UN, bas = UN;
          const kk = k.p > n.p - k.p ? n.p - k.p : k.p;
          for (let i = UN; i <= kk; i++) { haut *= n.p - kk + i; bas *= i; }
          return ex(haut / bas);
        }
        case "arrangement": {
          if (A.length !== 2) return null;
          const n = E(A[0]), k = E(A[1]);
          if (!estEntier(n) || !estEntier(k) || k.p < ZERO || n.p > 100000n) return null;
          if (k.p > n.p) return ex(0);
          let r = UN;
          for (let i = ZERO; i < k.p; i++) r *= n.p - i;
          return ex(r);
        }
        case "pgcd": case "ppcm": case "mod": case "quotient": {
          const v = A.map(E);
          if (!v.every(estEntier)) return null;
          const p = v.map((x) => x.p);
          if (noeud.n === "pgcd") return ex(p.reduce(pgcdB));
          if (noeud.n === "ppcm") return ex(p.reduce((a, b) =>
            (a === ZERO || b === ZERO) ? ZERO : (a * b < ZERO ? -(a * b) : a * b) / pgcdB(a, b)));
          if (p.length !== 2 || p[1] === ZERO) return null;
          const q = divPlancher(p[0], p[1]);
          return noeud.n === "quotient" ? ex(q) : ex(p[0] - p[1] * q);
        }
        case "sin": case "cos": case "tan": {
          const a = un();
          const k = douzieme(a, R.angle);
          if (k === null || !ANGLES[k]) return null;
          const { sin, cos } = ANGLES[k];
          if (noeud.n === "sin") return sin;
          if (noeud.n === "cos") return cos;
          return estZero(cos) ? null : EX.quotient(sin, cos);
        }
        case "exp": { const a = un(); return estZero(a) ? exUn() : null; }
        case "ln": {
          const a = un();
          if (a && estEntier(a) && a.p === UN) return exZero();
          if (A.length === 1 && A[0].t === "var" && A[0].n === "e") return exUn();
          return null;
        }
        case "log": {
          if (A.length === 1) {
            const a = E(A[0]);
            if (!estEntier(a) || a.p <= ZERO) return null;
            let p = a.p, n = 0;
            while (p % 10n === ZERO) { p /= 10n; n++; }
            return p === UN ? ex(n) : null;
          }
          return null;
        }
        case "min": case "max": {
          const v = A.map(E);
          if (!v.every(Boolean)) return null;
          let meilleur = v[0];
          for (const x of v.slice(1)) {
            const c = EX.nombre(x) - EX.nombre(meilleur);
            if (noeud.n === "min" ? c < 0 : c > 0) meilleur = x;
          }
          return meilleur;
        }
        case "moyenne": {
          const v = A.map(E);
          if (!v.every(Boolean)) return null;
          let s = exZero();
          for (const x of v) { s = EX.somme(s, x); if (!s) return null; }
          return EX.quotient(s, ex(v.length));
        }
        case "somme": case "produit": {
          if (A.length !== 4) return null;
          const lettre = A[1].t === "lettre" || A[1].t === "var" ? A[1].n : null;
          const a = E(A[2]), b = E(A[3]);
          if (!lettre || !estEntier(a) || !estEntier(b)) return null;
          if (b.p - a.p > 200n) return null;        // au-delà, le coût n'en vaut pas la peine
          let acc = noeud.n === "somme" ? exZero() : exUn();
          const anciennes = ctx.localesEx || {};
          for (let i = a.p; i <= b.p; i++) {
            ctx.localesEx = Object.assign(Object.create(null), anciennes);
            ctx.localesEx[lettre] = ex(i);
            const terme = exacte(A[0], ctx);
            ctx.localesEx = anciennes;
            if (!terme) return null;
            acc = noeud.n === "somme" ? EX.somme(acc, terme) : EX.produit(acc, terme);
            if (!acc) return null;
          }
          return acc;
        }
        default: return null;
      }
    }
    default: return null;
  }
}
function divPlancher(p, q) {            // plancher de p/q sur les entiers
  const d = p / q, r = p % q;
  return (r !== ZERO && ((r < ZERO) !== (q < ZERO))) ? d - UN : d;
}
function arrondiBig(a) {       // au plus proche, et le 0,5 s'éloigne de zéro
  if (!estRationnel(a)) return null;
  const neg = a.p < ZERO;
  const p = neg ? -a.p : a.p;
  const n = divPlancher(p * 2n + a.q, a.q * 2n);
  return neg ? -n : n;
}

/* ═════════════════════ 7. Écriture des nombres ═════════════════════════
   Dix chiffres significatifs, comme l'appareil. Et le passage en écriture
   scientifique au même endroit que lui : au-dessus de 10¹⁰ et en dessous
   de 10⁻⁴ — pas parce que c'est joli, mais parce qu'en dessous l'écriture
   décimale devient une file de zéros qu'on ne compte pas à l'œil. */
/* Cette table ÉCRIT les exposants ; « LU_EN_EXPOSANT », plus haut, les
   LIT. Les deux n'existaient pas en même temps : le moteur rendait
   « 2,5⁻⁰⁹ » en écriture scientifique depuis toujours, et son propre
   analyseur ne savait pas relire ce qu'il venait d'écrire. Recopier un
   résultat dans la ligne de saisie donnait une faute de lecture — un
   aller-retour qu'aucun banc ne faisait. */
const EXPOSANTS = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
                    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
const enExposant = (s) => String(s).split("").map((c) => EXPOSANTS[c] || c).join("");

function formater(x, R) {
  R = R || REGLAGES();
  if (Number.isNaN(x)) return "indéfini";
  if (x === Infinity) return "∞";
  if (x === -Infinity) return "−∞";
  if (x === 0) return "0";
  const chiffres = Math.min(14, Math.max(3, R.chiffres || 10));
  const expo = Math.floor(Math.log10(Math.abs(x)));
  const sci = R.format === "sci" || R.format === "ing"
           || (R.format === "auto" && (expo >= chiffres || expo < -4));
  if (!sci) {
    let s = x.toPrecision(chiffres);
    if (s.includes("e")) s = x.toFixed(Math.max(0, chiffres - 1 - expo));
    if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s.replace("-", "−");
  }
  let e = expo;
  if (R.format === "ing") e = Math.floor(expo / 3) * 3;
  const m = x / Math.pow(10, e);
  let mant = m.toPrecision(chiffres);
  if (mant.includes(".")) mant = mant.replace(/0+$/, "").replace(/\.$/, "");
  /* L'arrondi de la mantisse peut la faire déborder : 9,999999999 ×10³
     arrondi à dix chiffres donne « 10 », qu'il faut relire en 1×10⁴. */
  if (Math.abs(parseFloat(mant)) >= 10) {
    e += 1;
    mant = (x / Math.pow(10, e)).toPrecision(chiffres)
      .replace(/0+$/, "").replace(/\.$/, "");
  }
  return mant.replace("-", "−") + "×10" + enExposant(e);
}

/* ═════════════════════ 8. L'entrée publique ════════════════════════════ */
function contexte(reglages) {
  return { vars: new Map(), exacts: new Map(),
           reglages: Object.assign(REGLAGES(), reglages || {}) };
}

function calculer(src, ctx) {
  ctx = ctx || contexte();
  const texte = String(src || "").trim();
  if (!texte) return { ok: false, erreur: "Rien à calculer." };
  const a = analyser(texte);
  if (a.erreur) return { ok: false, entree: texte, erreur: a.erreur };
  ctx.dernierStockage = null;
  let valeur, exactVal = null;
  try {
    /* L'exact d'abord : il ne modifie rien et ne peut pas lever, donc
       une erreur numérique ne doit pas nous priver de la forme exacte. */
    try { exactVal = exacte(a.arbre, ctx); } catch (e) { exactVal = null; }
    valeur = evaluer(a.arbre, ctx);
  } catch (e) {
    if (e instanceof ErreurCalc) return { ok: false, entree: texte, erreur: e.message };
    throw e;
  }
  if (typeof valeur !== "number")
    return { ok: false, entree: texte, erreur: "Résultat qui n'est pas un nombre." };
  /* Garde-fou : si les deux couches ne sont pas d'accord, c'est la couche
     exacte qui a tort — elle est la plus jeune. On la jette, et on le dit
     dans la console du navigateur plutôt que d'afficher deux résultats
     contradictoires. Le banc, lui, traite ce cas comme un échec. */
  let desaccord = null;
  if (exactVal) {
    const ve = EX.nombre(exactVal);
    const ech = Math.max(Math.abs(ve), Math.abs(valeur), 1);
    if (!Number.isFinite(ve) || Math.abs(ve - valeur) > 1e-9 * ech) {
      desaccord = { exact: EX.texte(exactVal), approx: valeur };
      exactVal = null;
    }
  }
  const R = ctx.reglages;
  const texteExact = exactVal
    ? EX.texte(exactVal, { decimalSiPossible: a.decimalVu }) : null;
  const approx = formater(valeur, R);
  ctx.vars.set("ans", valeur);
  ctx.exacts.set("ans", exactVal);
  return {
    ok: true, entree: texte, valeur, exact: texteExact, approx,
    /* « montrerLesDeux » dit s'il y a quelque chose à APPRENDRE de la
       seconde ligne. 1/2 et 0.5, oui. 4 et 4, non. */
    montrerLesDeux: !!(texteExact && texteExact !== approx),
    stocke: ctx.dernierStockage || null,
    desaccord,
  };
}

/* Une fonction d'une variable, compilée une fois et appelée des milliers
   de fois par le tracé. On ne repasse donc PAS par l'analyse à chaque
   point : l'arbre est gardé, et seule la liaison de la variable change. */
function fonction(src, variable, ctx) {
  const a = analyser(String(src || ""));
  if (a.erreur) return { erreur: a.erreur };
  const base = ctx || contexte();
  const v = variable || "x";
  const f = (x) => {
    const anciennes = base.locales || {};
    base.locales = Object.assign(Object.create(null), anciennes);
    base.locales[v] = x;
    try { return evaluer(a.arbre, base); }
    catch (e) { return NaN; }
    finally { base.locales = anciennes; }
  };
  /* Un contrôle immédiat : une expression qui ne vaut rien nulle part est
     une faute de saisie, pas une fonction. On la signale tout de suite au
     lieu de laisser un tracé vide sans explication. */
  let fini = 0;
  for (const t of [-7.3, -2.1, -0.5, 0.25, 1, 2.7, 6.4, 11.2]) if (Number.isFinite(f(t))) fini++;
  let avert = null;
  if (fini === 0) {
    try { evaluer(a.arbre, Object.assign(base, { locales: { [v]: 1 } })); }
    catch (e) { if (e instanceof ErreurCalc) avert = e.message; }
    if (!avert) avert = "Cette expression ne donne aucune valeur sur l'intervalle essayé.";
  }
  return { f, arbre: a.arbre, avert };
}

/* Une suite : explicite u(n) = …, ou récurrente u(n+1) = f(u(n), n), ou
   d'ordre deux u(n+2) = f(u(n+1), u(n), n). Les termes sont MÉMORISÉS :
   sans cela, afficher u(0) à u(50) d'une récurrence d'ordre deux coûte un
   nombre exponentiel d'évaluations — et la page se fige. */
function suite(def, ctx) {
  const base = ctx || contexte();
  const nom = def.nom || "u";
  const analysee = analyser(String(def.expr || ""));
  if (analysee.erreur) return { erreur: analysee.erreur };
  const rang0 = Number.isInteger(def.rang0) ? def.rang0 : 0;
  const memo = new Map();
  const evalAvec = (locales) => {
    const anciennes = base.locales || {};
    base.locales = Object.assign(Object.create(null), anciennes, locales);
    try { return evaluer(analysee.arbre, base); }
    catch (e) { return NaN; }
    finally { base.locales = anciennes; }
  };
  function terme(n) {
    if (!Number.isInteger(n) || n < rang0) return NaN;
    if (memo.has(n)) return memo.get(n);
    if (memo.size > 100000) return NaN;
    let v;
    if (def.type === "explicite") {
      v = evalAvec({ n });
    } else if (def.type === "recurrente") {
      v = n === rang0 ? Number(def.premier)
        : evalAvec({ n: n - 1, [nom]: terme(n - 1) });
    } else {
      v = n === rang0 ? Number(def.premier)
        : n === rang0 + 1 ? Number(def.second)
        : evalAvec({ n: n - 2, [nom]: terme(n - 2), [nom + "1"]: terme(n - 1) });
    }
    memo.set(n, v);
    return v;
  }
  return { terme, rang0 };
}

/* ═════════════════════ 9. Statistiques ═════════════════════════════════
   Les quartiles suivent la convention FRANÇAISE, celle des énoncés :

       Q1 est la plus petite valeur telle qu'au moins un quart de
       l'effectif lui est inférieur ou égal — c'est-à-dire la valeur de
       rang ⌈N/4⌉ dans la série ordonnée.

   Ce n'est pas la seule convention au monde : les tableurs interpolent
   entre deux valeurs et ne donnent donc PAS le même Q1. Les deux sont
   justes dans leur cadre ; mélanger les deux fait perdre des points. La
   page affiche laquelle est appliquée, et le banc fige quatre séries dont
   les quartiles sont calculés à la main. */
const STATS = {
  unVariable(valeurs, effectifs) {
    const paires = [];
    for (let i = 0; i < valeurs.length; i++) {
      const v = Number(valeurs[i]);
      const n = effectifs ? Number(effectifs[i]) : 1;
      if (!Number.isFinite(v) || !Number.isFinite(n) || n <= 0) continue;
      paires.push([v, n]);
    }
    if (!paires.length) return null;
    paires.sort((a, b) => a[0] - b[0]);
    /* Une valeur saisie deux fois a l'effectif 2. Sans ce regroupement,
       « 2 4 4 4 5 5 7 9 » n'avait AUCUN mode : huit effectifs de 1, donc
       huit modes, donc rien. Le mode est 4, et il apparaît trois fois. */
    const groupees = [];
    for (const [v, n] of paires) {
      const dernier = groupees[groupees.length - 1];
      if (dernier && dernier[0] === v) dernier[1] += n;
      else groupees.push([v, n]);
    }
    paires.length = 0;
    paires.push(...groupees);
    const N = paires.reduce((s, p) => s + p[1], 0);
    const somme = paires.reduce((s, p) => s + p[0] * p[1], 0);
    const sommeCarres = paires.reduce((s, p) => s + p[0] * p[0] * p[1], 0);
    const moyenne = somme / N;
    const variance = sommeCarres / N - moyenne * moyenne;
    /* La variance par la formule « E(X²) − E(X)² » peut rendre un nombre
       NÉGATIF à force d'annulations quand les valeurs sont grandes et
       proches (par exemple 1000000 et 1000001). On la recalcule par les
       écarts à la moyenne, qui est stable, et on garde la première
       formule pour la montrer dans la page — c'est celle du cours. */
    const var2 = paires.reduce((s, p) => s + p[1] * Math.pow(p[0] - moyenne, 2), 0) / N;
    const rang = (k) => {               // valeur occupant le rang k (1 … N)
      let c = 0;
      for (const [v, n] of paires) { c += n; if (c >= k) return v; }
      return paires[paires.length - 1][0];
    };
    const mediane = N % 2 ? rang((N + 1) / 2) : (rang(N / 2) + rang(N / 2 + 1)) / 2;
    const q1 = rang(Math.ceil(N / 4));
    const q3 = rang(Math.ceil(3 * N / 4));
    const effMax = Math.max(...paires.map((p) => p[1]));
    return {
      N, somme, sommeCarres, moyenne,
      variance: Math.max(0, var2), ecartType: Math.sqrt(Math.max(0, var2)),
      varianceFormuleCours: variance,
      varianceEch: N > 1 ? var2 * N / (N - 1) : NaN,
      ecartTypeEch: N > 1 ? Math.sqrt(var2 * N / (N - 1)) : NaN,
      min: paires[0][0], max: paires[paires.length - 1][0],
      etendue: paires[paires.length - 1][0] - paires[0][0],
      mediane, q1, q3, interquartile: q3 - q1,
      modes: paires.filter((p) => p[1] === effMax).map((p) => p[0]),
      paires,
      /* Les bornes des moustaches : les valeurs extrêmes, convention du
         lycée (et non 1,5 × l'écart interquartile). */
      moustaches: [paires[0][0], paires[paires.length - 1][0]],
    };
  },
  deuxVariables(xs, ys) {
    const X = [], Y = [];
    for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
      const x = Number(xs[i]), y = Number(ys[i]);
      if (Number.isFinite(x) && Number.isFinite(y)) { X.push(x); Y.push(y); }
    }
    const n = X.length;
    if (n < 2) return null;
    const mx = X.reduce((a, b) => a + b, 0) / n, my = Y.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, syy = 0, sxy = 0, sx = 0, sy = 0, sxy_brut = 0, sx2 = 0, sy2 = 0;
    for (let i = 0; i < n; i++) {
      sxx += (X[i] - mx) ** 2; syy += (Y[i] - my) ** 2; sxy += (X[i] - mx) * (Y[i] - my);
      sx += X[i]; sy += Y[i]; sxy_brut += X[i] * Y[i]; sx2 += X[i] ** 2; sy2 += Y[i] ** 2;
    }
    const sigx = Math.sqrt(sxx / n), sigy = Math.sqrt(syy / n);
    return { n, X, Y, moyenneX: mx, moyenneY: my,
             sommeX: sx, sommeY: sy, sommeXY: sxy_brut, sommeX2: sx2, sommeY2: sy2,
             ecartTypeX: sigx, ecartTypeY: sigy,
             covariance: sxy / n,
             r: (sigx > 0 && sigy > 0) ? (sxy / n) / (sigx * sigy) : NaN };
  },
};

/* ── moindres carrés, par Gram-Schmidt modifié ────────────────────────
   Pas par les équations normales : AᵗA CARRE le conditionnement, et une
   régression de degré 4 sur des x voisins de 2000 (des années, cas le
   plus fréquent) y perd la moitié de ses chiffres. Gram-Schmidt modifié
   travaille sur A directement. Le banc compare les deux voies sur une
   série d'années : c'est là que la différence se voit. */
function moindresCarres(A, y) {
  const m = A.length, n = A[0].length;
  const Q = A.map((r) => r.slice());
  const R = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < j; k++) {
      let s = 0;
      for (let i = 0; i < m; i++) s += Q[i][k] * Q[i][j];
      R[k][j] = s;
      for (let i = 0; i < m; i++) Q[i][j] -= s * Q[i][k];
    }
    let nrm = 0, nrm0 = 0;
    for (let i = 0; i < m; i++) { nrm += Q[i][j] * Q[i][j]; nrm0 += A[i][j] * A[i][j]; }
    nrm = Math.sqrt(nrm); nrm0 = Math.sqrt(nrm0);
    /* Le test doit être RELATIF. Deux colonnes identiques laissent un
       résidu de l'ordre de 10⁻¹⁶ — non nul, donc accepté par un test
       absolu, et la régression rendait alors des coefficients de l'ordre
       de 10¹⁵ sans rien dire. Trois points de même abscisse ne
       déterminent pas une droite : il faut le REFUSER. */
    if (nrm < 1e-10 * Math.max(nrm0, 1e-300)) return null;
    R[j][j] = nrm;
    for (let i = 0; i < m; i++) Q[i][j] /= nrm;
  }
  const b = new Array(n).fill(0);
  for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) b[j] += Q[i][j] * y[i];
  const x = new Array(n).fill(0);
  for (let j = n - 1; j >= 0; j--) {
    let s = b[j];
    for (let k = j + 1; k < n; k++) s -= R[j][k] * x[k];
    x[j] = s / R[j][j];
  }
  return x;
}

/* Les noms sont ceux de la machine, et ils sont aussi les bons : en français,
   « linéaire » désigne x ↦ ax et « affine » désigne x ↦ ax + b. Nous avions
   l'inverse — un élève qui lisait « Linéaire » ici et choisissait « Linéaire »
   sur sa NumWorks ne prenait pas le même modèle. Les CLÉS ne bougent pas : une
   mémoire enregistrée avant la correction désigne toujours son modèle. */
const MODELES = {
  lineaire:      { titre: "Affine",         forme: "ax + b" },
  proportionnel: { titre: "Linéaire",       forme: "ax" },
  quadratique:   { titre: "Quadratique",    forme: "ax² + bx + c" },
  cubique:       { titre: "Cubique",        forme: "ax³ + bx² + cx + d" },
  quartique:     { titre: "Quartique",      forme: "ax⁴ + bx³ + cx² + dx + e" },
  logarithmique: { titre: "Logarithmique",  forme: "a·ln(x) + b" },
  exponentielle: { titre: "Exponentielle",  forme: "a·bˣ" },
  exponentielleE:{ titre: "Exponentielle e", forme: "a·e^(bx)" },
  puissance:     { titre: "Puissance",      forme: "a·xᵇ" },
  trigonometrique:{ titre: "Trigonométrique", forme: "a·sin(bx + c) + d" },
  logistique:    { titre: "Logistique",     forme: "c / (1 + a·e^(−bx))" },
  /* Médiane-médiane : le treizième modèle de la machine, et le seul qui ne
     passe pas par les moindres carrés. On coupe le nuage en trois paquets
     d'effectifs aussi égaux que possible, on prend le point médian de chacun,
     et la droite passe par les deux paquets extrêmes puis se décale d'un tiers
     vers celui du milieu. Un point aberrant pèse alors sur une médiane, pas
     sur une moyenne : la droite ne part pas avec lui. */
  medianeMediane:{ titre: "Médiane-médiane", forme: "ax + b" },
};

function ajuster(xs, ys, modele) {
  const n = Math.min(xs.length, ys.length);
  const X = [], Y = [];
  for (let i = 0; i < n; i++) {
    const x = Number(xs[i]), y = Number(ys[i]);
    if (Number.isFinite(x) && Number.isFinite(y)) { X.push(x); Y.push(y); }
  }
  if (X.length < 2) return { erreur: "Il faut au moins deux points." };
  const poly = (deg) => {
    if (X.length < deg + 1)
      return { erreur: "Il faut au moins " + (deg + 1) + " points pour ce modèle." };
    const A = X.map((x) => Array.from({ length: deg + 1 }, (_, j) => Math.pow(x, deg - j)));
    const c = moindresCarres(A, Y);
    if (!c) return { erreur: "Ces points ne déterminent pas ce modèle (abscisses confondues)." };
    return { params: c, f: (x) => c.reduce((s, a) => s * x + a, 0) };
  };
  const transforme = (tx, ty, reconstruit, garde) => {
    const A = [], B = [];
    for (let i = 0; i < X.length; i++) {
      if (!garde(X[i], Y[i])) continue;
      A.push([tx(X[i]), 1]); B.push(ty(Y[i]));
    }
    if (A.length < 2) return { erreur: "Ce modèle demande des valeurs strictement positives." };
    const c = moindresCarres(A, B);
    if (!c) return { erreur: "Ces points ne déterminent pas ce modèle." };
    return reconstruit(c[0], c[1]);
  };
  let res;
  switch (modele) {
    case "lineaire": res = poly(1); break;
    case "quadratique": res = poly(2); break;
    case "cubique": res = poly(3); break;
    case "quartique": res = poly(4); break;
    case "proportionnel": {
      let sxy = 0, sxx = 0;
      for (let i = 0; i < X.length; i++) { sxy += X[i] * Y[i]; sxx += X[i] * X[i]; }
      if (sxx === 0) { res = { erreur: "Toutes les abscisses sont nulles." }; break; }
      const a = sxy / sxx;
      res = { params: [a], f: (x) => a * x };
      break;
    }
    case "medianeMediane": {
      /* Les trois paquets de la méthode : on trie par abscisse, puis on répartit
         n points en trois groupes dont les effectifs ne diffèrent jamais de plus
         de un — reste 0, 1 ou 2, et c'est le groupe du MILIEU qui grossit, comme
         le veut la méthode. */
      const P = X.map((x, i) => [x, Y[i]]).sort((u, v) => u[0] - v[0]);
      if (P.length < 3) { res = { erreur: "Il faut au moins trois points." }; break; }
      const q = Math.floor(P.length / 3), r = P.length % 3;
      const t1 = q + (r === 2 ? 1 : 0);
      const t2 = q + (r >= 1 ? 1 : 0);
      const paquets = [P.slice(0, t1), P.slice(t1, t1 + t2), P.slice(t1 + t2)];
      const med = (v) => {
        const w = v.slice().sort((p, q2) => p - q2), m = w.length >> 1;
        return w.length % 2 ? w[m] : (w[m - 1] + w[m]) / 2;
      };
      const S = paquets.map((g) => [med(g.map((p) => p[0])), med(g.map((p) => p[1]))]);
      if (S[2][0] === S[0][0]) {
        res = { erreur: "Ces points ne déterminent pas ce modèle (abscisses confondues)." };
        break;
      }
      const a0 = (S[2][1] - S[0][1]) / (S[2][0] - S[0][0]);
      /* L'ordonnée à l'origine est la MOYENNE des trois, ce qui revient à
         décaler d'un tiers la droite des extrêmes vers le point du milieu. */
      const b0 = (S[0][1] - a0 * S[0][0] + S[1][1] - a0 * S[1][0]
                + S[2][1] - a0 * S[2][0]) / 3;
      res = { params: [a0, b0], f: (x) => a0 * x + b0 };
      break;
    }
    case "logarithmique":
      res = transforme(Math.log, (y) => y, (a, b) => ({ params: [a, b],
        f: (x) => x > 0 ? a * Math.log(x) + b : NaN }), (x) => x > 0);
      break;
    case "exponentielle":
      res = transforme((x) => x, Math.log, (lb, la) => {
        const a = Math.exp(la), b = Math.exp(lb);
        return { params: [a, b], f: (x) => a * Math.pow(b, x) };
      }, (x, y) => y > 0);
      break;
    case "exponentielleE":
      res = transforme((x) => x, Math.log, (b, la) => {
        const a = Math.exp(la);
        return { params: [a, b], f: (x) => a * Math.exp(b * x) };
      }, (x, y) => y > 0);
      break;
    case "puissance":
      res = transforme(Math.log, Math.log, (b, la) => {
        const a = Math.exp(la);
        return { params: [a, b], f: (x) => x > 0 ? a * Math.pow(x, b) : NaN };
      }, (x, y) => x > 0 && y > 0);
      break;
    case "trigonometrique": {
      /* a·sin(bx+c)+d est LINÉAIRE en (A, B, d) dès que b est fixé :
         A·sin(bx) + B·cos(bx) + d. On balaye donc b, on résout le reste
         exactement, et on affine b par section dorée. Pas de descente de
         gradient, pas de point de départ à deviner. */
      const etendue = Math.max(...X) - Math.min(...X);
      if (etendue <= 0) { res = { erreur: "Les abscisses sont toutes égales." }; break; }
      const essai = (b) => {
        const A = X.map((x) => [Math.sin(b * x), Math.cos(b * x), 1]);
        const c = moindresCarres(A, Y);
        if (!c) return { sse: Infinity };
        const f = (x) => c[0] * Math.sin(b * x) + c[1] * Math.cos(b * x) + c[2];
        let sse = 0;
        for (let i = 0; i < X.length; i++) sse += (Y[i] - f(X[i])) ** 2;
        return { sse, c, f, b };
      };
      let meilleur = { sse: Infinity };
      for (let k = 1; k <= 400; k++) {
        const b = 2 * Math.PI * k / (20 * etendue);
        const e = essai(b);
        if (e.sse < meilleur.sse) meilleur = e;
      }
      if (!Number.isFinite(meilleur.sse)) { res = { erreur: "Aucun ajustement trouvé." }; break; }
      const pas = 2 * Math.PI / (20 * etendue);
      let lo = Math.max(1e-9, meilleur.b - pas), hi = meilleur.b + pas;
      for (let i = 0; i < 80; i++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (essai(m1).sse < essai(m2).sse) hi = m2; else lo = m1;
      }
      const fin = essai((lo + hi) / 2);
      const A = fin.c[0], B = fin.c[1];
      const amp = Math.hypot(A, B), ph = Math.atan2(B, A);
      res = { params: [amp, fin.b, ph, fin.c[2]], f: fin.f };
      break;
    }
    case "logistique": {
      /* c/(1+a·e^(−bx)) : une fois c fixé, ln(c/y − 1) = ln a − bx est une
         droite. Même méthode — balayage sur c, droite exacte, puis
         section dorée. */
      const ymax = Math.max(...Y);
      if (ymax <= 0 || Math.min(...Y) < 0) {
        res = { erreur: "Le modèle logistique demande des ordonnées positives." }; break;
      }
      const essai = (c) => {
        const A = [], B = [];
        for (let i = 0; i < X.length; i++) {
          const t = c / Y[i] - 1;
          if (!(t > 0) || !Number.isFinite(t)) continue;
          A.push([X[i], 1]); B.push(Math.log(t));
        }
        if (A.length < 2) return { sse: Infinity };
        const s = moindresCarres(A, B);
        if (!s) return { sse: Infinity };
        const b = -s[0], a = Math.exp(s[1]);
        const f = (x) => c / (1 + a * Math.exp(-b * x));
        let sse = 0;
        for (let i = 0; i < X.length; i++) sse += (Y[i] - f(X[i])) ** 2;
        return { sse, a, b, c, f };
      };
      /* Le palier c dépasse l'ordonnée maximale d'un écart qui peut être
         minuscule : sur une courbe logistique observée jusqu'à saturation,
         ymax vaut 7,99996 pour un palier de 8. Un balayage de c en pas de
         2 % de ymax saute donc par-dessus la réponse dès le premier pas,
         et l'ajustement s'arrêtait à r² = 0,995 en annonçant un palier
         faux. On balaye le DÉPASSEMENT en échelle logarithmique :
         c = ymax·(1 + eᵘ), u de −16 à +2,3. */
      const deC = (u) => ymax * (1 + Math.exp(u));
      let meilleur = { sse: Infinity }, uBest = 0;
      for (let k = 0; k <= 360; k++) {
        const u = -16 + k * (18.3 / 360);
        const e = essai(deC(u));
        if (e.sse < meilleur.sse) { meilleur = e; uBest = u; }
      }
      if (!Number.isFinite(meilleur.sse)) { res = { erreur: "Aucun ajustement trouvé." }; break; }
      let lo = uBest - 18.3 / 360, hi = uBest + 18.3 / 360;
      for (let i = 0; i < 120; i++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (essai(deC(m1)).sse < essai(deC(m2)).sse) hi = m2; else lo = m1;
      }
      const fin = essai(deC((lo + hi) / 2));
      res = { params: [fin.a, fin.b, fin.c], f: fin.f };
      break;
    }
    default: return { erreur: "Modèle inconnu : " + modele };
  }
  if (res.erreur) return res;
  /* r² se mesure sur les POINTS, jamais sur les données transformées.
     Un ajustement exponentiel qui a l'air parfait en échelle
     logarithmique peut être médiocre sur les vraies ordonnées : c'est
     exactement l'erreur que ce calcul empêche. */
  const my = Y.reduce((a, b) => a + b, 0) / Y.length;
  let sse = 0, sst = 0;
  for (let i = 0; i < X.length; i++) {
    const p = res.f(X[i]);
    if (!Number.isFinite(p)) continue;
    sse += (Y[i] - p) ** 2; sst += (Y[i] - my) ** 2;
  }
  const r2 = sst > 0 ? 1 - sse / sst : NaN;
  const sortie = { params: res.params, f: res.f, r2, sse, modele,
                   titre: MODELES[modele].titre, forme: MODELES[modele].forme };
  if (modele === "lineaire" || modele === "proportionnel") {
    const d = STATS.deuxVariables(X, Y);
    if (d) sortie.r = d.r;
  }
  return sortie;
}

/* ═════════════════════ 10. Équations ═══════════════════════════════════ */
const ALGEBRE = {
  /* Durand-Kerner : toutes les racines d'un coup, réelles et complexes,
     sans dérivée et sans point de départ à fournir. Les coefficients sont
     donnés du PLUS HAUT degré au terme constant, comme on les écrit. */
  racinesPolynome(coeffs) {
    let a = coeffs.map(Number);
    while (a.length && Math.abs(a[0]) < 1e-300) a = a.slice(1);
    const d = a.length - 1;
    if (d < 1) return { erreur: "Ce n'est pas une équation : le coefficient du terme de plus haut degré est nul." };
    if (d === 1) return { racines: [{ re: -a[1] / a[0], im: 0 }] };
    if (d === 2) {
      const [A, B, C] = a;
      const delta = B * B - 4 * A * C;
      if (delta > 0) {
        /* La forme « (−B ± √Δ)/2A » perd ses chiffres quand B² ≫ 4AC :
           les deux termes du numérateur s'annulent presque. On calcule la
           racine « sûre », l'autre par le produit C/A. */
        const s = -(B + Math.sign(B || 1) * Math.sqrt(delta)) / 2;
        const r1 = s / A, r2 = s === 0 ? 0 : C / s;
        return { delta, racines: [{ re: Math.min(r1, r2), im: 0 }, { re: Math.max(r1, r2), im: 0 }] };
      }
      if (delta === 0) return { delta, racines: [{ re: -B / (2 * A), im: 0 }], double: true };
      const re = -B / (2 * A), im = Math.sqrt(-delta) / (2 * A);
      return { delta, racines: [{ re, im: -Math.abs(im) }, { re, im: Math.abs(im) }] };
    }
    const m = a.map((c) => c / a[0]);
    let z = Array.from({ length: d }, (_, k) => {
      const t = 0.4 + 0.9 * k * 2 * Math.PI / d;
      return { re: 0.4 * Math.cos(t) + 0.9, im: 0.4 * Math.sin(t) + 0.9 };
    });
    const polyC = (p) => {                 // schéma de Horner complexe
      let re = 1, im = 0;
      for (let i = 1; i < m.length; i++) {
        const nre = re * p.re - im * p.im + m[i];
        const nim = re * p.im + im * p.re;
        re = nre; im = nim;
      }
      return { re, im };
    };
    for (let it = 0; it < 600; it++) {
      let bouge = 0;
      for (let i = 0; i < d; i++) {
        const num = polyC(z[i]);
        let dre = 1, dim = 0;
        for (let j = 0; j < d; j++) {
          if (i === j) continue;
          const re = z[i].re - z[j].re, im = z[i].im - z[j].im;
          const nre = dre * re - dim * im, nim = dre * im + dim * re;
          dre = nre; dim = nim;
        }
        const mod = dre * dre + dim * dim;
        if (mod < 1e-300) continue;
        const qre = (num.re * dre + num.im * dim) / mod;
        const qim = (num.im * dre - num.re * dim) / mod;
        z[i] = { re: z[i].re - qre, im: z[i].im - qim };
        bouge = Math.max(bouge, Math.hypot(qre, qim));
      }
      if (bouge < 1e-15) break;
    }
    z.sort((p, q) => (p.re - q.re) || (p.im - q.im));
    /* Une racine réelle sort avec une partie imaginaire résiduelle de
       l'ordre de 10⁻¹⁶. On la nettoie — mais seulement si elle est
       négligeable DEVANT le module, pas dans l'absolu. */
    z = z.map((p) => Math.abs(p.im) < 1e-8 * Math.max(1, Math.abs(p.re))
      ? { re: p.re, im: 0 } : p);
    return { racines: z };
  },
  /* Systèmes linéaires : pivot partiel, et les trois réponses possibles
     nommées. « Pas de solution » et « une infinité » ne sont pas des
     erreurs de l'élève, ce sont des résultats. */
  resoudreSysteme(M, B) {
    const n = M.length, p = M[0].length;
    const A = M.map((r, i) => r.concat([B[i]]));
    const pivots = [];
    let ligne = 0;
    for (let col = 0; col < p && ligne < n; col++) {
      let best = ligne;
      for (let i = ligne + 1; i < n; i++)
        if (Math.abs(A[i][col]) > Math.abs(A[best][col])) best = i;
      const ech = Math.max(...A.map((r) => Math.abs(r[col])), 1e-300);
      if (Math.abs(A[best][col]) < 1e-12 * ech) continue;
      [A[ligne], A[best]] = [A[best], A[ligne]];
      const piv = A[ligne][col];
      for (let j = col; j <= p; j++) A[ligne][j] /= piv;
      for (let i = 0; i < n; i++) {
        if (i === ligne) continue;
        const f = A[i][col];
        if (f === 0) continue;
        for (let j = col; j <= p; j++) A[i][j] -= f * A[ligne][j];
      }
      pivots.push(col); ligne++;
    }
    for (let i = ligne; i < n; i++) {
      const ech = Math.max(...A[i].slice(0, p).map(Math.abs), 1e-300);
      if (Math.abs(A[i][p]) > 1e-9 * Math.max(ech, Math.abs(A[i][p])))
        return { type: "aucune" };
    }
    if (pivots.length < p) return { type: "infinite", rang: pivots.length, inconnues: p };
    const x = new Array(p).fill(0);
    for (let i = 0; i < pivots.length; i++) x[pivots[i]] = A[i][p];
    return { type: "unique", x };
  },
};

/* ═════════════════════ 11. Ce qui sort d'ici ═══════════════════════════ */
return {
  REGLAGES, contexte, calculer, analyser, evaluer, exacte, formater, fonction, suite,
  EX, LOIS, STATS, MODELES, ajuster, ALGEBRE,
  /* La liste des fonctions, exportée pour que le banc puisse vérifier
     qu'AUCUNE ne manque au catalogue — et que le catalogue n'en annonce
     aucune qui n'existe pas. */
  FONCTIONS: Array.from(N_FONCTIONS).sort(), ALIAS,
  // les briques numériques, exposées pour que le banc puisse les mesurer seules
  num: { lgamma, gamma, gammp, gammq, erf, erfc, invErf, betainc, combinaison,
         arrangement, derivee, integrale, tanhSinh, simpsonAdaptatif,
         zeros, extremums, dichotomie, moindresCarres },
  ErreurCalc,
};
})();

/* Un seul fichier pour la page et pour le banc. Sans ces trois lignes, il
   faudrait deux copies du moteur — et deux copies finissent toujours par
   diverger. Ce dépôt s'est déjà fait prendre. */
if (typeof module === "object" && module.exports) module.exports = CALC;
else if (typeof window !== "undefined") window.CALC = CALC;
