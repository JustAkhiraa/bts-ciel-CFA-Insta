/* Lance tous les bancs : node outils/salon/tests/tout.mjs */
const fichiers = ["./salon.test.mjs", "./qr.test.mjs"];
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
