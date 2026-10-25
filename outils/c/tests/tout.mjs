/* Lance tous les bancs de l'atelier : node outils/c/tests/tout.mjs */
const fichiers = ["./sql.test.mjs"];
let echecs = 0, total = 0;
for (const f of fichiers) {
  const mod = await import(f);
  for (const c of mod.cas) {
    total++;
    try { await c.fn(); console.log("  ✓ " + c.nom); }
    catch (e) { echecs++; console.log("  ✗ " + c.nom + "\n      " + e.message.split("\n").join("\n      ")); if (process.env.TRACE) console.log(e.stack); }
  }
}
console.log("\n" + (total - echecs) + " / " + total + " réussis");
process.exit(echecs ? 1 : 0);
