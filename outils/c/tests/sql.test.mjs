/* Le banc du moteur SQL : le SQL du chapitre 9 (cours, exercices, fiche),
   tel quel, et ce que MariaDB répond — résultats et messages d'erreur mot
   pour mot. Les réponses attendues ont été relevées sur MariaDB. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const SQL = require("../sql.js");

export const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const egal = (a, b, msg) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg || "") + "\n attendu " + y + "\n obtenu  " + x); };

const BDD = `CREATE DATABASE IF NOT EXISTS gestion_presence;
USE gestion_presence;

CREATE TABLE administrateurs (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    login        VARCHAR(50)  NOT NULL UNIQUE,
    mot_de_passe VARCHAR(255) NOT NULL
);

CREATE TABLE etudiants (
    id     INT AUTO_INCREMENT PRIMARY KEY,
    nom    VARCHAR(50) NOT NULL,
    prenom VARCHAR(50) NOT NULL,
    classe VARCHAR(50) NOT NULL
);

CREATE TABLE presences (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    id_etudiant   INT NOT NULL,
    date_presence DATE NOT NULL,
    statut        VARCHAR(20) NOT NULL,
    FOREIGN KEY (id_etudiant) REFERENCES etudiants(id)
);`;
const DONNEES = `INSERT INTO etudiants (nom, prenom, classe) VALUES
    ('Dupont', 'Alice', 'BTS CIEL 1'),
    ('Martin', 'Bob', 'BTS CIEL 1'),
    ('Durand', 'Chloé', 'BTS CIEL 2'),
    ('Petit', 'Dupuis', 'BTS CIEL 2'),
    ('Moreau', 'Emma', 'BTS CIEL 1');
INSERT INTO presences (id_etudiant, date_presence, statut) VALUES
    (3, '2026-09-13', 'present'),
    (1, '2026-09-13', 'absent'),
    (1, '2026-09-14', 'absent'),
    (2, '2026-09-14', 'present'),
    (3, '2026-09-14', 'absent');`;

function serveur(...scripts) {
  const s = new SQL.Serveur();
  for (const sc of scripts) {
    const r = s.executer(sc);
    if (r.erreur) throw new Error("préparation : " + r.erreur.message);
  }
  return s;
}
/* Le dernier résultat d'un script, ou l'erreur. */
function un(s, sql) {
  const r = s.executer(sql);
  if (r.erreur) return { erreur: r.erreur };
  return r.resultats[r.resultats.length - 1];
}
const lignes = (r) => { if (r.erreur) throw new Error("erreur inattendue : " + r.erreur.message); return r.lignes; };
const erreur = (r) => { ok(r.erreur, "une erreur était attendue, obtenu : " + JSON.stringify(r.lignes || r)); return r.erreur; };

test("bdd.sql des exercices : les trois tables se créent", () => {
  const s = serveur(BDD);
  egal(lignes(un(s, "SHOW TABLES")), [["administrateurs"], ["etudiants"], ["presences"]]);
  egal(un(s, "SHOW TABLES").colonnes, ["Tables_in_gestion_presence"]);
  const d = lignes(un(s, "DESCRIBE presences"));
  egal(d[0], ["id", "int(11)", "NO", "PRI", null, "auto_increment"]);
  egal(d[1], ["id_etudiant", "int(11)", "NO", "MUL", null, ""]);
  egal(d[2], ["date_presence", "date", "NO", "", null, ""]);
  egal(lignes(un(s, "DESCRIBE administrateurs"))[1], ["login", "varchar(50)", "NO", "UNI", null, ""]);
});

test("INSERT : une ligne, plusieurs lignes, AUTO_INCREMENT", () => {
  const s = serveur(BDD);
  const r = un(s, "INSERT INTO etudiants (nom, prenom, classe)\nVALUES ('Dupont', 'Alice', 'BTS CIEL 1');");
  egal([r.affectees, r.insertId], [1, 1]);
  const r2 = un(s, "INSERT INTO etudiants (nom, prenom, classe) VALUES\n    ('Martin', 'Bob', 'BTS CIEL 1'),\n    ('Durand', 'Chloe', 'BTS CIEL 2');");
  egal([r2.affectees, r2.insertId], [2, 2], "insertId = le PREMIER id de l'insertion, comme LAST_INSERT_ID()");
  egal(lignes(un(s, "SELECT id, nom FROM etudiants")), [[1, "Dupont"], [2, "Martin"], [3, "Durand"]]);
  egal(lignes(un(s, "SELECT LAST_INSERT_ID()")), [[2]]);
});

test("UPDATE et DELETE avec WHERE, et sans", () => {
  const s = serveur(BDD, DONNEES);
  egal(un(s, "UPDATE etudiants\nSET classe = 'BTS CIEL 2'\nWHERE id = 2;").affectees, 1);
  egal(lignes(un(s, "SELECT classe FROM etudiants WHERE id = 2")), [["BTS CIEL 2"]]);
  const r = un(s, "UPDATE etudiants SET classe = 'BTS CIEL 2'");
  egal([r.affectees, r.trouvees], [2, 5], "les lignes déjà à la bonne valeur ne comptent pas comme modifiées");
  egal(un(s, "DELETE FROM etudiants WHERE id = 5;").affectees, 1);
  egal(lignes(un(s, "SELECT COUNT(*) FROM etudiants")), [[4]]);
});

test("clé étrangère : 1451 au DELETE du parent, 1452 à l'INSERT orphelin", () => {
  const s = serveur(BDD, DONNEES);
  const e = erreur(un(s, "DELETE FROM etudiants WHERE id = 1"));
  egal(e.code, 1451);
  egal(e.message, "Cannot delete or update a parent row: a foreign key constraint fails (`gestion_presence`.`presences`, CONSTRAINT `presences_ibfk_1` FOREIGN KEY (`id_etudiant`) REFERENCES `etudiants` (`id`))");
  const e2 = erreur(un(s, "INSERT INTO presences (id_etudiant, date_presence, statut) VALUES (99, '2026-09-15', 'present')"));
  egal(e2.code, 1452);
  egal(e2.message, "Cannot add or update a child row: a foreign key constraint fails (`gestion_presence`.`presences`, CONSTRAINT `presences_ibfk_1` FOREIGN KEY (`id_etudiant`) REFERENCES `etudiants` (`id`))");
  // la solution a. du cours : les présences d'abord
  egal(un(s, "DELETE FROM presences WHERE id_etudiant = 1;\nDELETE FROM etudiants WHERE id = 1;").affectees, 1);
});

test("ON DELETE CASCADE et SET NULL", () => {
  const s = serveur(`CREATE DATABASE t; USE t;
    CREATE TABLE a (id INT PRIMARY KEY);
    CREATE TABLE b (id INT PRIMARY KEY AUTO_INCREMENT, a_id INT, FOREIGN KEY (a_id) REFERENCES a(id) ON DELETE CASCADE);
    CREATE TABLE c (id INT PRIMARY KEY AUTO_INCREMENT, a_id INT, CONSTRAINT fk_c FOREIGN KEY (a_id) REFERENCES a(id) ON DELETE SET NULL);
    INSERT INTO a VALUES (1), (2);
    INSERT INTO b (a_id) VALUES (1), (1), (2);
    INSERT INTO c (a_id) VALUES (1), (2);`);
  un(s, "DELETE FROM a WHERE id = 1");
  egal(lignes(un(s, "SELECT a_id FROM b")), [[2]]);
  egal(lignes(un(s, "SELECT id, a_id FROM c")), [[1, null], [2, 2]]);
});

test("doublon de clé, NOT NULL, texte trop long, champ sans défaut", () => {
  const s = serveur(BDD, "INSERT INTO administrateurs (login, mot_de_passe) VALUES ('admin', 'admin');");
  let e = erreur(un(s, "INSERT INTO administrateurs (login, mot_de_passe) VALUES ('admin', 'x')"));
  egal([e.code, e.message], [1062, "Duplicate entry 'admin' for key 'login'"]);
  e = erreur(un(s, "INSERT INTO administrateurs (id, login, mot_de_passe) VALUES (1, 'b', 'x')"));
  egal(e.message, "Duplicate entry '1' for key 'PRIMARY'");
  e = erreur(un(s, "INSERT INTO etudiants (nom, prenom, classe) VALUES (NULL, 'a', 'b')"));
  egal([e.code, e.message], [1048, "Column 'nom' cannot be null"]);
  e = erreur(un(s, "INSERT INTO etudiants (nom, prenom) VALUES ('a', 'b')"));
  egal([e.code, e.message], [1364, "Field 'classe' doesn't have a default value"]);
  e = erreur(un(s, "INSERT INTO etudiants (nom, prenom, classe) VALUES ('" + "x".repeat(51) + "', 'b', 'c')"));
  egal([e.code, e.message], [1406, "Data too long for column 'nom' at row 1"]);
  e = erreur(un(s, "INSERT INTO etudiants (nom, prenom, classe) VALUES ('a', 'b', 'c'), ('a', 'b', NULL)"));
  egal(e.message, "Column 'classe' cannot be null");
  egal(lignes(un(s, "SELECT COUNT(*) FROM etudiants")), [[0]], "une insertion refusée n'écrit rien, pas même ses premières lignes");
  e = erreur(un(s, "INSERT INTO etudiants (nom, prenom, classe) VALUES ('a', 'b')"));
  egal([e.code, e.message], [1136, "Column count doesn't match value count at row 1"]);
});

test("SELECT du cours : WHERE, ORDER BY, LIMIT, dates", () => {
  const s = serveur(BDD, DONNEES);
  egal(lignes(un(s, "SELECT nom, prenom FROM etudiants WHERE classe = 'BTS CIEL 1' ORDER BY nom ASC LIMIT 10")),
    [["Dupont", "Alice"], ["Martin", "Bob"], ["Moreau", "Emma"]]);
  egal(lignes(un(s, "SELECT id FROM presences WHERE date_presence > '2026-09-13'")), [[3], [4], [5]]);
  egal(lignes(un(s, "SELECT id FROM presences WHERE date_presence = '2026-09-13'")), [[1], [2]]);
  egal(lignes(un(s, "SELECT id FROM presences ORDER BY date_presence DESC, id LIMIT 2")), [[3], [4]]);
  egal(lignes(un(s, "SELECT id FROM etudiants LIMIT 1, 2")), [[2], [3]]);
  egal(lignes(un(s, "SELECT id FROM etudiants LIMIT 2 OFFSET 3")), [[4], [5]]);
  const r = un(s, "SELECT * FROM etudiants WHERE id = 1");
  egal(r.colonnes, ["id", "nom", "prenom", "classe"]);
});

test("NULL : = NULL ne trouve rien, IS NULL oui", () => {
  const s = serveur("CREATE DATABASE t; USE t; CREATE TABLE e (id INT, tel VARCHAR(15)); INSERT INTO e VALUES (1, NULL), (2, '06');");
  egal(lignes(un(s, "SELECT * FROM e WHERE tel = NULL")), []);
  egal(lignes(un(s, "SELECT id FROM e WHERE tel IS NULL")), [[1]]);
  egal(lignes(un(s, "SELECT id FROM e WHERE tel IS NOT NULL")), [[2]]);
  egal(lignes(un(s, "SELECT COUNT(*), COUNT(tel) FROM e")), [[2, 1]]);
  egal(lignes(un(s, "SELECT NULL = NULL, NULL <=> NULL, 1 + NULL, CONCAT('a', NULL), IFNULL(tel, '—') FROM e WHERE id = 1")), [[null, 1, null, null, "—"]]);
});

test("LIKE : la barre de recherche, sans casse ni accents", () => {
  const s = serveur(BDD, DONNEES);
  egal(lignes(un(s, "SELECT id FROM etudiants\nWHERE nom    LIKE '%dup%'\n   OR prenom LIKE '%dup%'\n   OR classe LIKE '%dup%';")), [[1], [4]]);
  egal(lignes(un(s, "SELECT id FROM etudiants WHERE prenom = 'chloe'")), [[3]], "utf8mb4_general_ci : é = e, C = c");
  egal(lignes(un(s, "SELECT id FROM etudiants WHERE nom LIKE 'D_pont'")), [[1]]);
  egal(lignes(un(s, "SELECT id FROM etudiants WHERE nom NOT LIKE 'D%'")), [[2], [4], [5]]);
  egal(lignes(un(s, "SELECT 'a%b' LIKE 'a\\%b', 'axb' LIKE 'a\\%b'")), [[1, 0]]);
});

test("jointures : INNER, alias, ambiguïté", () => {
  const s = serveur(BDD, DONNEES);
  const r = un(s, "SELECT etudiants.nom, etudiants.prenom, presences.date_presence, presences.statut\nFROM presences\nINNER JOIN etudiants ON presences.id_etudiant = etudiants.id;");
  egal(r.colonnes, ["nom", "prenom", "date_presence", "statut"]);
  egal(lignes(r)[0], ["Durand", "Chloé", "2026-09-13", "present"]);
  egal(lignes(r).length, 5);
  const e = erreur(un(s, "SELECT id FROM presences INNER JOIN etudiants ON presences.id_etudiant = etudiants.id"));
  egal([e.code, e.message], [1052, "Column 'id' in field list is ambiguous"]);
  egal(lignes(un(s, "SELECT presences.id FROM presences INNER JOIN etudiants ON presences.id_etudiant = etudiants.id WHERE etudiants.id = 1")), [[2], [3]]);
  egal(lignes(un(s, "SELECT e.nom, e.prenom, e.classe, p.date_presence, p.statut\nFROM presences p\nINNER JOIN etudiants e ON p.id_etudiant = e.id\nORDER BY p.date_presence DESC, p.id;"))[0], ["Dupont", "Alice", "BTS CIEL 1", "2026-09-14", "absent"]);
  const e2 = erreur(un(s, "SELECT etudiants.nom FROM etudiants e"));
  egal(e2.message, "Unknown column 'etudiants.nom' in 'field list'", "une table renommée par un alias ne s'appelle plus que par l'alias");
  const e3 = erreur(un(s, "SELECT * FROM presences p JOIN etudiants e ON p.id_etudiant = e.idd"));
  egal(e3.message, "Unknown column 'e.idd' in 'on clause'");
});

test("LEFT JOIN … ON … AND : les absences par étudiant (exercice)", () => {
  const s = serveur(BDD, DONNEES);
  const r = un(s, "SELECT e.nom, e.prenom, COUNT(p.id) AS nb_absences\nFROM etudiants e\nLEFT JOIN presences p\n       ON p.id_etudiant = e.id AND p.statut = 'absent'\nGROUP BY e.id, e.nom, e.prenom\nORDER BY nb_absences DESC;");
  egal(r.colonnes, ["nom", "prenom", "nb_absences"]);
  egal(lignes(r).map((l) => l[2]), [2, 1, 0, 0, 0]);
  egal(lignes(r)[0], ["Dupont", "Alice", 2]);
  egal(lignes(r).length, 5, "les étudiants sans absence restent, avec 0");
  // la version fausse : le WHERE annule le LEFT JOIN
  const f = un(s, "SELECT e.nom, COUNT(p.id) FROM etudiants e LEFT JOIN presences p ON p.id_etudiant = e.id WHERE p.statut = 'absent' GROUP BY e.id");
  egal(lignes(f).length, 2);
  egal(lignes(un(s, "SELECT e.id, p.id FROM presences p RIGHT JOIN etudiants e ON p.id_etudiant = e.id WHERE p.id IS NULL")), [[4, null], [5, null]]);
});

test("GROUP BY, HAVING, agrégats", () => {
  const s = serveur(BDD, DONNEES);
  egal(lignes(un(s, "SELECT classe, COUNT(*) AS nombre\nFROM etudiants\nGROUP BY classe;")), [["BTS CIEL 1", 3], ["BTS CIEL 2", 2]]);
  egal(lignes(un(s, "SELECT classe, COUNT(*) AS nombre FROM etudiants GROUP BY classe HAVING COUNT(*) > 2;")), [["BTS CIEL 1", 3]]);
  egal(lignes(un(s, "SELECT classe, COUNT(*) AS nb FROM etudiants GROUP BY classe HAVING nb > 2")), [["BTS CIEL 1", 3]]);
  egal(lignes(un(s, "SELECT statut, COUNT(*) AS nombre FROM presences GROUP BY statut")), [["absent", 3], ["present", 2]]);
  egal(lignes(un(s, "SELECT COUNT(*) FROM presences WHERE statut = 'present'")), [[2]]);
  egal(lignes(un(s, "SELECT COUNT(DISTINCT id_etudiant), MIN(date_presence), MAX(date_presence) FROM presences")), [[3, "2026-09-13", "2026-09-14"]]);
  egal(lignes(un(s, "SELECT SUM(id), AVG(id) FROM etudiants")), [[15, 3]]);
  const m = un(s, "SELECT AVG(id) FROM etudiants");
  egal([m.colonnes, SQL.afficher(m.lignes[0][0], m.types[0])], [["AVG(id)"], "3.0000"], "AVG d'entiers s'écrit avec quatre décimales");
  egal(lignes(un(s, "SELECT GROUP_CONCAT(prenom ORDER BY prenom SEPARATOR ', ') FROM etudiants WHERE classe = 'BTS CIEL 1'")), [["Alice, Bob, Emma"]]);
  egal(lignes(un(s, "SELECT COUNT(*) FROM etudiants WHERE id > 100")), [[0]], "un agrégat sans GROUP BY rend toujours une ligne");
  egal(lignes(un(s, "SELECT classe, COUNT(*) FROM etudiants WHERE id > 100 GROUP BY classe")), []);
});

test("DECIMAL : les sommes justes, l'affichage à deux décimales", () => {
  const s = serveur("CREATE DATABASE t; USE t; CREATE TABLE employes (id INT PRIMARY KEY AUTO_INCREMENT, nom VARCHAR(50) NOT NULL, poste VARCHAR(50) NOT NULL, salaire DECIMAL(10,2) NOT NULL);",
    "INSERT INTO employes (nom, poste, salaire) VALUES ('a', 'tech', 1800.10), ('b', 'tech', '2000.2'), ('c', 'chef', 3000);");
  const r = un(s, "SELECT salaire FROM employes");
  egal(r.lignes.map((l) => SQL.afficher(l[0], r.types[0])), ["1800.10", "2000.20", "3000.00"]);
  const t = un(s, "SELECT poste, SUM(salaire) AS total FROM employes GROUP BY poste ORDER BY total");
  egal(t.lignes.map((l) => SQL.afficher(l[1], t.types[1])), ["3000.00", "3800.30"]);
  egal(lignes(un(s, "SELECT nom FROM employes WHERE salaire > 1900 ORDER BY salaire DESC")), [["c"], ["b"]]);
  const e = erreur(un(s, "INSERT INTO employes (nom, poste, salaire) VALUES ('d', 'x', 'beaucoup')"));
  egal(e.message, "Incorrect decimal value: 'beaucoup' for column `t`.`employes`.`salaire` at row 1");
  const e2 = erreur(un(s, "INSERT INTO employes (nom, poste, salaire) VALUES ('d', 'x', 123456789)"));
  egal(e2.message, "Out of range value for column 'salaire' at row 1");
});

test("l'injection du cours : OR '1'='1' rend toute la table", () => {
  const s = serveur(BDD, "INSERT INTO administrateurs (login, mot_de_passe) VALUES ('admin', 'admin'), ('prof', 'secret');");
  egal(lignes(un(s, "SELECT * FROM administrateurs WHERE login = '' OR '1'='1' AND mot_de_passe = ''")), []);
  egal(lignes(un(s, "SELECT login FROM administrateurs WHERE login = '' OR '1'='1' -- ' AND mot_de_passe = ''")), [["admin"], ["prof"]]);
  egal(lignes(un(s, "SELECT login FROM administrateurs WHERE login = 'admin' AND mot_de_passe = '' OR '1'='1'")), [["admin"], ["prof"]]);
  // les paramètres de PDO, eux, restent des valeurs
  egal(s.requete("SELECT login FROM administrateurs WHERE login = ? AND mot_de_passe = ?", ["' OR '1'='1", "x"]).lignes, []);
  egal(s.requete("SELECT login FROM administrateurs WHERE login = :login", { login: "prof" }).lignes, [["prof"]]);
});

test("ALTER, RENAME, DROP du cours", () => {
  const s = serveur(BDD, DONNEES);
  un(s, "ALTER TABLE etudiants ADD telephone VARCHAR(15);");
  egal(lignes(un(s, "SELECT telephone FROM etudiants WHERE id = 1")), [[null]]);
  un(s, "ALTER TABLE etudiants MODIFY nom VARCHAR(100);");
  egal(lignes(un(s, "DESCRIBE etudiants"))[1].slice(0, 3), ["nom", "varchar(100)", "YES"], "MODIFY sans NOT NULL rend la colonne nullable, comme MariaDB");
  un(s, "ALTER TABLE etudiants DROP COLUMN telephone;");
  egal(un(s, "SELECT * FROM etudiants").colonnes, ["id", "nom", "prenom", "classe"]);
  let e = erreur(un(s, "DROP TABLE etudiants"));
  egal(e.code, 1451);
  un(s, "ALTER TABLE etudiants RENAME TO eleves;");
  egal(lignes(un(s, "SHOW TABLES")), [["administrateurs"], ["eleves"], ["presences"]]);
  e = erreur(un(s, "SELECT * FROM etudiants"));
  egal([e.code, e.message], [1146, "Table 'gestion_presence.etudiants' doesn't exist"]);
  un(s, "DROP TABLE presences;");
  egal(un(s, "DROP DATABASE gestion_presence;").affectees, 2);
  e = erreur(un(s, "SELECT 1 FROM eleves"));
  egal([e.code, e.message], [1046, "No database selected"]);
});

test("l'exercice employes : MODIFY salaire en DECIMAL convertit les textes", () => {
  const s = serveur("CREATE DATABASE t; USE t; CREATE TABLE employes (id INT PRIMARY KEY AUTO_INCREMENT, nom VARCHAR(50), poste VARCHAR(50), salaire VARCHAR(50));",
    "INSERT INTO employes (nom, salaire) VALUES ('a', '1800.5'), ('b', '2000');");
  un(s, "ALTER TABLE employes MODIFY salaire DECIMAL(10,2);");
  const r = un(s, "SELECT salaire FROM employes ORDER BY salaire DESC");
  egal(r.lignes.map((l) => SQL.afficher(l[0], r.types[0])), ["2000.00", "1800.50"]);
});

test("erreurs de syntaxe : le message de MariaDB et sa ligne", () => {
  const s = serveur(BDD);
  let e = erreur(un(s, "SELECT * FORM etudiants"));
  egal([e.code, e.message], [1064, "You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near 'FORM etudiants' at line 1"]);
  e = erreur(un(s, "SELECT *\nFROM etudiants\nWHERE nom = 'a' AND"));
  egal(e.message, "You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near '' at line 3");
  e = erreur(un(s, "SELECT 1;\nSELECT 2;\nINSERT INTO etudiants (nom) VALUE"));
  egal(e.ligne, 3);
  e = erreur(un(s, "SELECT * FROM etudiants WHERE nom = 'a"));
  egal(e.code, 1064);
  e = erreur(un(s, "SELECT nom prenom, FROM etudiants"));
  egal(e.message, "You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near 'FROM etudiants' at line 1");
});

test("la ligne de l'erreur d'exécution est celle de l'instruction", () => {
  const s = serveur(BDD);
  const r = s.executer("SELECT 1;\n\nSELECT nom\nFROM etudiantz;");
  egal(r.resultats.length, 1);
  egal([r.erreur.code, r.erreur.ligne], [1146, 3]);
});

test("sous-requêtes, IN, EXISTS, UNION, CASE", () => {
  const s = serveur(BDD, DONNEES);
  egal(lignes(un(s, "SELECT nom FROM etudiants WHERE id IN (SELECT id_etudiant FROM presences WHERE statut = 'absent') ORDER BY nom")), [["Dupont"], ["Durand"]]);
  egal(lignes(un(s, "SELECT nom FROM etudiants e WHERE NOT EXISTS (SELECT 1 FROM presences p WHERE p.id_etudiant = e.id) ORDER BY nom")), [["Moreau"], ["Petit"]]);
  egal(lignes(un(s, "SELECT nom FROM etudiants WHERE id = (SELECT MAX(id_etudiant) FROM presences)")), [["Durand"]]);
  egal(lignes(un(s, "SELECT classe FROM etudiants UNION SELECT 'Prof' ORDER BY 1")), [["BTS CIEL 1"], ["BTS CIEL 2"], ["Prof"]]);
  egal(lignes(un(s, "SELECT 1 UNION ALL SELECT 1")), [[1], [1]]);
  egal(lignes(un(s, "SELECT id, CASE WHEN statut = 'absent' THEN 'A' ELSE 'P' END AS s FROM presences WHERE id < 3")), [[1, "P"], [2, "A"]]);
  egal(lignes(un(s, "SELECT t.c, COUNT(*) FROM (SELECT classe AS c FROM etudiants) AS t GROUP BY t.c")), [["BTS CIEL 1", 3], ["BTS CIEL 2", 2]]);
  const e = erreur(un(s, "SELECT nom FROM etudiants WHERE id = (SELECT id_etudiant FROM presences)"));
  egal([e.code, e.message], [1242, "Subquery returns more than 1 row"]);
});

test("fonctions de texte, de nombre, de date", () => {
  const s = serveur(BDD, DONNEES);
  egal(lignes(un(s, "SELECT UPPER(nom), LOWER(prenom), CONCAT(prenom, ' ', nom), LENGTH('été'), CHAR_LENGTH('été') FROM etudiants WHERE id = 1")),
    [["DUPONT", "alice", "Alice Dupont", 5, 3]]);
  egal(lignes(un(s, "SELECT SUBSTRING('Bonjour', 1, 3), LEFT('abc', 2), RIGHT('abc', 2), TRIM('  x '), REPLACE('a-b', '-', '+'), CONCAT_WS('/', 'a', NULL, 'b')")),
    [["Bon", "ab", "bc", "x", "a+b", "a/b"]]);
  egal(lignes(un(s, "SELECT ROUND(2.567, 2), ROUND(2.5), FLOOR(-1.5), CEIL(1.2), ABS(-3), MOD(7, 3), 7 DIV 2, 7 / 2, POWER(2, 10)")),
    [[2.57, 3, -2, 2, 3, 1, 3, 3.5, 1024]]);
  egal(lignes(un(s, "SELECT YEAR('2026-09-13'), MONTH('2026-09-13'), DAY('2026-09-13'), DATEDIFF('2026-09-14', '2026-09-01'), DATE_FORMAT('2026-09-13', '%d/%m/%Y'), DATE_ADD('2026-01-31', INTERVAL 1 MONTH)")),
    [[2026, 9, 13, 13, 13 && "13/09/2026", "2026-02-28"]]);
  egal(lignes(un(s, "SELECT '2026-09-13' + INTERVAL 1 DAY, DAYNAME('2026-09-13')")), [["2026-09-14", "Sunday"]]);
  const r = lignes(un(s, "SELECT NOW(), CURDATE()"))[0];
  ok(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(r[0]) && /^\d{4}-\d\d-\d\d$/.test(r[1]), "NOW() et CURDATE() : " + r);
  const e = erreur(un(s, "SELECT MACHIN(1)"));
  egal(e.code, 1305);
});

test("dates refusées en mode strict", () => {
  const s = serveur(BDD, DONNEES);
  const e = erreur(un(s, "INSERT INTO presences (id_etudiant, date_presence, statut) VALUES (1, '13/09/2026', 'present')"));
  egal([e.code, e.message], [1292, "Incorrect date value: '13/09/2026' for column `gestion_presence`.`presences`.`date_presence` at row 1"]);
  const e2 = erreur(un(s, "INSERT INTO presences (id_etudiant, date_presence, statut) VALUES (1, '2026-02-30', 'present')"));
  egal(e2.code, 1292);
  const e3 = erreur(un(s, "INSERT INTO etudiants (id, nom, prenom, classe) VALUES ('abc', 'a', 'b', 'c')"));
  egal(e3.message, "Incorrect integer value: 'abc' for column `gestion_presence`.`etudiants`.`id` at row 1");
});

test("ENUM, DEFAULT, CHECK, UNIQUE sur plusieurs colonnes", () => {
  const s = serveur(`CREATE DATABASE t; USE t;
    CREATE TABLE p (
      id INT AUTO_INCREMENT PRIMARY KEY,
      e INT NOT NULL,
      d DATE NOT NULL,
      statut ENUM('present', 'absent', 'retard') NOT NULL DEFAULT 'present',
      cree DATETIME DEFAULT CURRENT_TIMESTAMP,
      note INT CHECK (note BETWEEN 0 AND 20),
      UNIQUE (e, d)
    );`);
  un(s, "INSERT INTO p (e, d) VALUES (1, '2026-09-13')");
  egal(lignes(un(s, "SELECT statut, cree IS NOT NULL FROM p")), [["present", 1]]);
  let e = erreur(un(s, "INSERT INTO p (e, d, statut) VALUES (2, '2026-09-13', 'malade')"));
  egal([e.code, e.message], [1265, "Data truncated for column 'statut' at row 1"]);
  e = erreur(un(s, "INSERT INTO p (e, d) VALUES (1, '2026-09-13')"));
  egal(e.message, "Duplicate entry '1-2026-09-13' for key 'e'");
  e = erreur(un(s, "INSERT INTO p (e, d, note) VALUES (3, '2026-09-13', 25)"));
  egal([e.code, e.message], [4025, "CONSTRAINT `p.note` failed for `t`.`p`"]);
  egal(lignes(un(s, "SELECT COUNT(*) FROM p WHERE statut = 'PRESENT'")), [[1]]);
});

test("INSERT … SELECT, ON DUPLICATE KEY UPDATE, REPLACE, INSERT IGNORE", () => {
  const s = serveur(BDD, DONNEES, "CREATE TABLE archive (id INT PRIMARY KEY, nom VARCHAR(50), vues INT DEFAULT 0);");
  egal(un(s, "INSERT INTO archive (id, nom) SELECT id, nom FROM etudiants WHERE classe = 'BTS CIEL 2'").affectees, 2);
  egal(un(s, "INSERT INTO archive (id, nom) VALUES (3, 'x') ON DUPLICATE KEY UPDATE vues = vues + 1").affectees, 2);
  egal(lignes(un(s, "SELECT nom, vues FROM archive WHERE id = 3")), [["Durand", 1]]);
  egal(un(s, "REPLACE INTO archive (id, nom) VALUES (3, 'Neuf')").affectees, 2);
  egal(lignes(un(s, "SELECT nom, vues FROM archive WHERE id = 3")), [["Neuf", 0]]);
  egal(un(s, "INSERT IGNORE INTO archive (id, nom) VALUES (3, 'x'), (9, 'y')").affectees, 1);
});

test("SHOW CREATE TABLE et SHOW DATABASES", () => {
  const s = serveur(BDD);
  const t = lignes(un(s, "SHOW CREATE TABLE presences"))[0][1];
  ok(t.indexOf("CONSTRAINT `presences_ibfk_1` FOREIGN KEY (`id_etudiant`) REFERENCES `etudiants` (`id`)") > 0, t);
  ok(t.indexOf("`id` int(11) NOT NULL AUTO_INCREMENT") > 0, t);
  ok(lignes(un(s, "SHOW DATABASES")).some((l) => l[0] === "gestion_presence"));
});

test("exporter puis charger : la base survit au rechargement de la page", () => {
  const s = serveur(BDD, DONNEES);
  const etat = JSON.parse(JSON.stringify(s.exporter()));
  const s2 = new SQL.Serveur(etat);
  egal(lignes(un(s2, "SELECT COUNT(*) FROM presences")), [[5]]);
  egal(s2.courante, "gestion_presence");
  egal(un(s2, "INSERT INTO etudiants (nom, prenom, classe) VALUES ('N', 'N', 'N')").insertId, 6, "le compteur AUTO_INCREMENT suit");
  egal(erreur(un(s2, "DELETE FROM etudiants WHERE id = 1")).code, 1451, "les clés étrangères aussi");
  const dump = s.dump();
  ok(dump.indexOf("INSERT INTO `etudiants` (`id`, `nom`, `prenom`, `classe`) VALUES") >= 0, dump);
  const s3 = new SQL.Serveur();
  const r = s3.executer(dump);
  ok(!r.erreur, "le dump se relit : " + (r.erreur && r.erreur.message));
  egal(lignes(un(s3, "USE gestion_presence; SELECT prenom FROM etudiants WHERE id = 3")), [["Chloé"]]);
});

test("les blocs SQL des pages du cours se lisent tous (aucune erreur 1064)", async () => {
  const { readFileSync } = await import("node:fs");
  const pages = ["cours", "exercices", "fiche-revision"].map((p) => readFileSync(new URL("../../../01-informatique-dev/09-bases-de-donnees-sql/" + p + ".html", import.meta.url), "utf8"));
  const blocs = [];
  const ent = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'" };
  for (const h of pages) {
    const re = /<div class="bloc-code" data-fam="sql"><span class="langue">[^<]*<\/span><pre><code>([\s\S]*?)<\/code><\/pre>/g;
    let m;
    while ((m = re.exec(h))) blocs.push(m[1].replace(/<[^>]+>/g, "").replace(/&\w+;|&#39;/g, (x) => ent[x] || x));
  }
  ok(blocs.length >= 30, "blocs trouvés : " + blocs.length);
  // des extraits (« … », une seule clause, un schéma dessiné) ne sont pas des instructions complètes
  const extrait = (b) => /…|└|^\s*(COUNT|LEFT JOIN|FOREIGN KEY)/m.test(b) || /^FOREIGN KEY/m.test(b) || /global_priv/.test(b);
  const fautes = [];
  for (const b of blocs) {
    if (extrait(b)) continue;
    try { new SQL.Analyseur(b).script(); } catch (e) { fautes.push(e.message + "\n" + b); }
  }
  ok(!fautes.length, fautes.join("\n\n"));
});

test("empreintes, âges, VALUES(), NATURAL JOIN", () => {
  const s = serveur("CREATE DATABASE t; USE t; CREATE TABLE a (id INT PRIMARY KEY, n INT DEFAULT 0); INSERT INTO a VALUES (1, 5);",
    "CREATE TABLE b (id INT PRIMARY KEY, a_id INT); INSERT INTO b VALUES (1, 1), (2, 9);");
  egal(lignes(un(s, "SELECT MD5('admin'), SHA1('a'), SHA2('a', 256), PASSWORD('a')")), [[
    "21232f297a57a5a743894a0e4a801fc3", "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8",
    "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb", "*667F407DE7C6AD07358FA38DAED7828A72014B4E"]]);
  egal(lignes(un(s, "SELECT TIMESTAMPDIFF(YEAR, '2005-10-26', '2026-10-25'), TIMESTAMPDIFF(YEAR, '2005-10-25', '2026-10-25'), TIMESTAMPDIFF(MONTH, '2026-01-31', '2026-02-28'), EXTRACT(MONTH FROM '2026-10-25')")), [[20, 21, 0, 10]]);
  un(s, "INSERT INTO a VALUES (1, 7) ON DUPLICATE KEY UPDATE n = n + VALUES(n)");
  egal(lignes(un(s, "SELECT n, ROW_COUNT() FROM a")), [[12, 2]]);
  egal(lignes(un(s, "SELECT b.a_id FROM a NATURAL JOIN b")), [[1]]);
});
