/* Le banc des blocs : chaque bloc de commandes de la page « Commandes
   Packet Tracer » (outils/packet-tracer.html) est tapé, ligne à ligne, dans
   le labo — sur un routeur, un commutateur, ou les deux, selon ce que la
   page annonce. Aucune ligne ne doit être refusée.

   La page et le labo vivent ainsi ensemble : un bloc ajouté là-bas, que le
   labo ne saurait pas jouer, fait échouer ce banc. */
import { readFileSync } from "node:fs";
import { Network } from "../src/core/Network.js";
import { creer } from "../src/devices/Fabrique.js";
import { IOSConsole } from "../src/cli/IOSParser.js";

export const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

const ENTITES = { "&#10;": "\n", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&#39;": "'", "&amp;": "&" };
const decoder = (s) => s.replace(/&#10;|&quot;|&lt;|&gt;|&#39;|&amp;/g, (e) => ENTITES[e]);

const page = readFileSync(new URL("../../packet-tracer.html", import.meta.url), "utf8");
const blocs = [...page.matchAll(/<article class="pt-bloc"[\s\S]*?<h3>([^<]+)<\/h3><span class="pt-eq">([^<]+)<\/span>[\s\S]*?data-modele="([^"]*)"/g)]
  .map(([, titre, eq, modele]) => ({ titre: decoder(titre), eq, lignes: decoder(modele).replace(/\{\{nom\}\}/g, "R1").replace(/\{\{mdp\}\}/g, "cisco").split("\n").map((l) => l.trim()).filter(Boolean) }));

test("la page compte bien ses 26 blocs", () => ok(blocs.length === 26, blocs.length + " blocs lus"));

for (const b of blocs) {
  const types = b.eq === "routeur" ? ["routeur"] : b.eq === "commutateur" ? ["switch"] : ["routeur", "switch"];
  test("bloc « " + b.titre + " » (" + b.eq + ")", () => {
    for (const type of types) {
      const net = new Network();
      const c = new IOSConsole(creer(net, type));
      const refus = [];
      for (const l of b.lignes) {
        const out = [];
        c.executer(l, { ligne: (t) => out.push(t), lignes: (L) => out.push(...L), ajouter() {}, occupe() {}, fin() {}, effacer() {} });
        if (out.some((x) => /^% ?(Invalid|Incomplete|Ambiguous|Unknown)|^Command rejected|^%Invalid/.test(x))) refus.push(l + " → " + out.join(" / "));
      }
      net.executer();
      ok(!refus.length, type + " refuse : " + refus.join(" | "));
    }
  });
}
