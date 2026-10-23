/* Les « fonctions » d'un PDF (ISO 32000, § 7.10) : elles calculent une
   couleur à partir d'un nombre — la teinte d'une encre d'accompagnement
   (Separation), le dégradé d'un fond (Shading).

   Quatre sortes : 0 (une table d'échantillons), 2 (une puissance entre
   deux couleurs), 3 (plusieurs fonctions mises bout à bout), 4 (un petit
   programme PostScript, une calculatrice à pile). On les transforme ici en
   fonctions JavaScript : entrees[] → sorties[]. */

import { Flux, Dict } from "./objets.js";

const borner = (x, a, b) => (x < a ? a : x > b ? b : x);
const interp = (x, a0, a1, b0, b1) => (a1 === a0 ? b0 : b0 + ((x - a0) * (b1 - b0)) / (a1 - a0));

export async function creerFonction(doc, f) {
  f = await doc.resoudre(f);
  if (Array.isArray(f)) {
    // un tableau de fonctions à une sortie chacune
    const fs = await Promise.all(f.map((x) => creerFonction(doc, x)));
    return (e) => fs.map((g) => g(e)[0]);
  }
  const d = f instanceof Flux ? f.dict : f;
  if (!(d instanceof Dict)) return (e) => e;
  const r = async (k) => { const v = await doc.resoudre(d.get(k)); return Array.isArray(v) ? Promise.all(v.map((x) => doc.resoudre(x))) : v; };
  const type = await r("FunctionType");
  const domaine = (await r("Domain")) || [0, 1];
  const plage = await r("Range");
  const sortir = (s) => (plage ? s.map((v, i) => borner(v, plage[2 * i], plage[2 * i + 1])) : s);

  if (type === 2) {
    const c0 = (await r("C0")) || [0], c1 = (await r("C1")) || [1], n = (await r("N")) ?? 1;
    return (e) => {
      const x = borner(e[0], domaine[0], domaine[1]);
      const p = n === 1 ? x : Math.pow(x, n);
      return sortir(c0.map((a, i) => a + p * (c1[i] - a)));
    };
  }
  if (type === 3) {
    const fs = await Promise.all(((await r("Functions")) || []).map((x) => creerFonction(doc, x)));
    const bornes = (await r("Bounds")) || [], enc = (await r("Encode")) || [];
    return (e) => {
      const x = borner(e[0], domaine[0], domaine[1]);
      let i = 0;
      while (i < bornes.length && x >= bornes[i]) i++;
      const a = i === 0 ? domaine[0] : bornes[i - 1], b = i === bornes.length ? domaine[1] : bornes[i];
      const g = fs[Math.min(i, fs.length - 1)];
      return g ? sortir(g([interp(x, a, b, enc[2 * i] ?? 0, enc[2 * i + 1] ?? 1)])) : [0];
    };
  }
  if (type === 0 && f instanceof Flux) {
    const taille = (await r("Size")) || [2], bps = (await r("BitsPerSample")) || 8;
    const enc = (await r("Encode")) || taille.flatMap((n) => [0, n - 1]);
    const decod = (await r("Decode")) || plage || [];
    const o = await doc.decode(f);
    const nSorties = plage ? plage.length / 2 : 1;
    const max = Math.pow(2, bps) - 1;
    const echantillon = (i) => {
      if (bps === 8) return o[i];
      if (bps === 16) return (o[2 * i] << 8) | o[2 * i + 1];
      const bit = i * bps;
      let v = 0;
      for (let k = 0; k < bps; k++) { const b = bit + k; v = (v << 1) | ((o[b >> 3] >> (7 - (b & 7))) & 1); }
      return v;
    };
    return (e) => {
      // une seule entrée : interpolation linéaire ; plusieurs : le plus proche
      let index = 0, pas = 1, frac = 0, i0 = 0;
      for (let k = 0; k < taille.length; k++) {
        const x = borner(e[k] ?? 0, domaine[2 * k], domaine[2 * k + 1]);
        const u = borner(interp(x, domaine[2 * k], domaine[2 * k + 1], enc[2 * k], enc[2 * k + 1]), 0, taille[k] - 1);
        if (k === 0) { i0 = Math.floor(u); frac = u - i0; if (i0 >= taille[0] - 1) { i0 = taille[0] - 1; frac = 0; } index += i0 * pas; }
        else index += Math.round(u) * pas;
        pas *= taille[k];
      }
      const out = [];
      for (let j = 0; j < nSorties; j++) {
        let v = echantillon(index * nSorties + j);
        if (frac > 0 && taille.length === 1) v += frac * (echantillon((index + 1) * nSorties + j) - v);
        out.push(interp(v, 0, max, decod[2 * j] ?? 0, decod[2 * j + 1] ?? 1));
      }
      return sortir(out);
    };
  }
  if (type === 4 && f instanceof Flux) {
    const programme = compilerPostScript(new TextDecoder("latin1").decode(await doc.decode(f)));
    return (e) => {
      const pile = e.map((x, i) => borner(x, domaine[2 * i], domaine[2 * i + 1]));
      try { executerPostScript(programme, pile); } catch (err) { return plage ? plage.filter((_, i) => i % 2 === 0) : [0]; }
      const n = plage ? plage.length / 2 : pile.length;
      return sortir(pile.slice(-n));
    };
  }
  return (e) => e;
}

/* ── la calculatrice PostScript (type 4) ── */
function compilerPostScript(s) {
  const jetons = s.replace(/%[^\n\r]*/g, " ").match(/[{}]|[^\s{}]+/g) || [];
  let i = 0;
  const bloc = () => {
    const out = [];
    while (i < jetons.length) {
      const t = jetons[i++];
      if (t === "{") out.push(bloc());
      else if (t === "}") return out;
      else if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) out.push(parseFloat(t));
      else out.push(t);
    }
    return out;
  };
  const tout = bloc();
  return Array.isArray(tout[0]) ? tout[0] : tout;
}
function executerPostScript(prog, p) {
  for (let i = 0; i < prog.length; i++) {
    const t = prog[i];
    if (typeof t === "number" || Array.isArray(t)) { p.push(t); continue; }
    let a, b, n, j;
    switch (t) {
      case "add": b = p.pop(); a = p.pop(); p.push(a + b); break;
      case "sub": b = p.pop(); a = p.pop(); p.push(a - b); break;
      case "mul": b = p.pop(); a = p.pop(); p.push(a * b); break;
      case "div": b = p.pop(); a = p.pop(); p.push(b === 0 ? 0 : a / b); break;
      case "idiv": b = p.pop(); a = p.pop(); p.push(b === 0 ? 0 : Math.trunc(a / b)); break;
      case "mod": b = p.pop(); a = p.pop(); p.push(b === 0 ? 0 : a % b); break;
      case "neg": p.push(-p.pop()); break;
      case "abs": p.push(Math.abs(p.pop())); break;
      case "ceiling": p.push(Math.ceil(p.pop())); break;
      case "floor": p.push(Math.floor(p.pop())); break;
      case "round": p.push(Math.round(p.pop())); break;
      case "truncate": case "cvi": p.push(Math.trunc(p.pop())); break;
      case "cvr": break;
      case "sqrt": p.push(Math.sqrt(Math.max(0, p.pop()))); break;
      case "sin": p.push(Math.sin((p.pop() * Math.PI) / 180)); break;
      case "cos": p.push(Math.cos((p.pop() * Math.PI) / 180)); break;
      case "atan": b = p.pop(); a = p.pop(); n = (Math.atan2(a, b) * 180) / Math.PI; p.push(n < 0 ? n + 360 : n); break;
      case "exp": b = p.pop(); a = p.pop(); p.push(Math.pow(a, b)); break;
      case "ln": p.push(Math.log(p.pop())); break;
      case "log": p.push(Math.log10(p.pop())); break;
      case "eq": b = p.pop(); a = p.pop(); p.push(a === b); break;
      case "ne": b = p.pop(); a = p.pop(); p.push(a !== b); break;
      case "gt": b = p.pop(); a = p.pop(); p.push(a > b); break;
      case "ge": b = p.pop(); a = p.pop(); p.push(a >= b); break;
      case "lt": b = p.pop(); a = p.pop(); p.push(a < b); break;
      case "le": b = p.pop(); a = p.pop(); p.push(a <= b); break;
      case "and": b = p.pop(); a = p.pop(); p.push(typeof a === "boolean" ? a && b : a & b); break;
      case "or": b = p.pop(); a = p.pop(); p.push(typeof a === "boolean" ? a || b : a | b); break;
      case "xor": b = p.pop(); a = p.pop(); p.push(typeof a === "boolean" ? a !== b : a ^ b); break;
      case "not": a = p.pop(); p.push(typeof a === "boolean" ? !a : ~a); break;
      case "bitshift": b = p.pop(); a = p.pop(); p.push(b >= 0 ? a << b : a >> -b); break;
      case "true": p.push(true); break;
      case "false": p.push(false); break;
      case "dup": p.push(p[p.length - 1]); break;
      case "pop": p.pop(); break;
      case "exch": b = p.pop(); a = p.pop(); p.push(b, a); break;
      case "copy": n = p.pop(); p.push(...p.slice(p.length - n)); break;
      case "index": n = p.pop(); p.push(p[p.length - 1 - n]); break;
      case "roll": {
        j = p.pop(); n = p.pop();
        if (n > 0) { const s = p.splice(p.length - n, n); j = ((j % n) + n) % n; p.push(...s.slice(n - j), ...s.slice(0, n - j)); }
        break;
      }
      case "if": { const proc = p.pop(), c = p.pop(); if (c) executerPostScript(proc, p); break; }
      case "ifelse": { const p2 = p.pop(), p1 = p.pop(), c = p.pop(); executerPostScript(c ? p1 : p2, p); break; }
      default: throw new Error("opérateur PostScript inconnu : " + t);
    }
  }
}
