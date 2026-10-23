/* Lance tous les bancs : node outils/labo/tests/tout.mjs */
const fichiers = ["./moteur.test.mjs", "./cli.test.mjs", "./labs.test.mjs", "./blocs.test.mjs"];
let echecs = 0, total = 0;
for (const f of fichiers) {
  let mod;
  try { mod = await import(f); } catch (e) { if (e.code === "ERR_MODULE_NOT_FOUND" && String(e.message).includes(f.slice(2))) continue; throw e; }
  for (const c of mod.cas) {
    total++;
    try { await c.fn(); console.log("  ✓ " + c.nom); }
    catch (e) { echecs++; console.log("  ✗ " + c.nom + "\n      " + e.message.split("\n").join("\n      ")); if (process.env.TRACE) console.log(e.stack); }
  }
}
console.log("\n" + (total - echecs) + " / " + total + " réussis");
process.exit(echecs ? 1 : 0);
