/* ═══════════════════════════════════════════════════════════════════════
   Ce que dit le compilateur, dit en français — et avec le remède.

   clang parle anglais, et il parle en compilateur : « format specifies type
   'int *' but the argument has type 'int' » est rigoureusement exact et
   n'apprend rien à quelqu'un qui vient d'oublier un & dans un scanf. Norman :
   un bon message d'erreur nomme la cause ET l'action. Krug : on ne doit pas
   avoir à le déchiffrer.

   Trois champs par entrée, et jamais plus :
     titre       ce qui ne va pas, en une ligne, en français ;
     explication pourquoi le compilateur s'en mêle ;
     remede      ce qu'il faut faire, à l'impératif.

   Le message d'origine reste affiché en dessous, replié. Il n'est pas caché :
   c'est celui qu'on retrouvera dans un terminal, en stage, et il faut savoir
   le lire. On l'accompagne, on ne le remplace pas.

   Ce qui n'est pas traduit s'affiche tel quel — sans invention. Le taux de
   couverture est mesuré par le banc d'essai de l'outil, pas estimé.
   ═══════════════════════════════════════════════════════════════════════ */
"use strict";

const TRADUCTIONS = (function () {

  /* $1, $2… renvoient aux groupes capturés du motif. */
  const TABLE = [
    /* ── le SQL (mode SQL, et PDO en PHP) ─────────────────────────────────
       Les messages de MariaDB, mot pour mot, précédés comme dans le client
       mariadb de « ERROR code (état) » : c'est ce qu'on lit dans le
       terminal de XAMPP, et « #code - » près dans phpMyAdmin. */
    { m: /^ERROR 1064 \(42000\)(?: at line \d+)?: .* near '' at line (\d+)$/,
      titre: "La requête s'arrête au milieu",
      explication: "MariaDB est arrivé au bout du texte alors qu'il attendait encore quelque chose : une parenthèse jamais fermée, un AND ou une virgule sans rien derrière, un VALUES vide, un WHERE sans condition.",
      remede: "Relisez la fin de l'instruction de la ligne $1 : il lui manque un morceau." },
    { m: /^ERROR 1064 \(42000\)(?: at line \d+)?: .* near '(FORM|FRMO|FOMR|WHRE|WERE|WEHRE|SELCT|SLECT|INSRT|UPADTE|DELET|GROUPE|ODER|ORDRE)\b/i,
      titre: "« $1 » : un mot-clé mal écrit",
      explication: "MariaDB ne connaît pas « $1 » : c'est une faute de frappe dans un mot-clé (FROM, WHERE, SELECT, INSERT, UPDATE, DELETE, GROUP, ORDER).",
      remede: "Corrigez l'orthographe du mot-clé." },
    { m: /^ERROR 1064 \(42000\)(?: at line \d+)?: .* near '(FROM|WHERE|GROUP|ORDER|\))\b[\s\S]*' at line (\d+)$/i,
      titre: "Juste avant « $1 », quelque chose ne va pas",
      explication: "MariaDB attendait encore un nom ou une valeur avant « $1 ». Le cas le plus fréquent : une virgule en trop à la fin d'une liste — « SELECT nom, prenom, FROM … » ou « (…, classe VARCHAR(50),) ».",
      remede: "Regardez ce qui précède « $1 » à la ligne $2 : retirez la virgule en trop, ou complétez la liste." },
    { m: /^ERROR 1064 \(42000\)(?: at line \d+)?: .* near '([\s\S]{0,40})[\s\S]*' at line (\d+)$/,
      titre: "Faute de syntaxe juste avant « $1 »",
      explication: "MariaDB a lu l'instruction jusqu'à ce point puis n'a plus compris. La faute est presque toujours JUSTE AVANT le texte cité, ou au tout début de celui-ci : une virgule oubliée entre deux colonnes, une apostrophe non fermée, un mot-clé mal écrit, un « ; » oublié entre deux requêtes, un texte écrit sans apostrophes.",
      remede: "Relisez la ligne $2, juste avant « $1 »." },
    { m: /^ERROR 1046 \(3D000\)(?: at line \d+)?: No database selected/,
      titre: "Aucune base n'est sélectionnée",
      explication: "Un serveur MariaDB contient plusieurs bases ; une table se cherche dans la base COURANTE, et il n'y en a pas encore. Dans phpMyAdmin, c'est la base cliquée à gauche ; dans un script, c'est USE.",
      remede: "Ajoutez avant la requête : USE gestion_presence; (ou CREATE DATABASE … ; puis USE … ;)." },
    { m: /^ERROR 1146 \(42S02\)(?: at line \d+)?: Table '([^.']*)\.([^']*)' doesn't exist/,
      titre: "La table « $2 » n'existe pas dans la base « $1 »",
      explication: "Une faute de frappe dans le nom (etudiant au lieu de etudiants), une table pas encore créée, une table supprimée ou renommée plus haut, ou la mauvaise base sélectionnée.",
      remede: "SHOW TABLES; liste les tables de la base courante : comparez les noms." },
    { m: /^ERROR 1050 \(42S01\)(?: at line \d+)?: Table '([^']*)' already exists/,
      titre: "La table « $1 » existe déjà",
      explication: "CREATE TABLE refuse de recréer une table qui est là — sinon il effacerait ses données sans prévenir.",
      remede: "Pour repartir de zéro : DROP TABLE IF EXISTS $1; juste avant. Pour ne la créer que si elle manque : CREATE TABLE IF NOT EXISTS $1 (…)." },
    { m: /^ERROR 1049 \(42000\)(?: at line \d+)?: Unknown database '([^']*)'/,
      titre: "La base « $1 » n'existe pas",
      explication: "USE (ou un nom base.table) désigne une base qui n'a pas été créée sur ce serveur.",
      remede: "Créez-la d'abord : CREATE DATABASE IF NOT EXISTS $1; — ou corrigez son nom (SHOW DATABASES;)." },
    { m: /^ERROR 1007 \(HY000\)(?: at line \d+)?: Can't create database '([^']*)'; database exists/,
      titre: "La base « $1 » existe déjà",
      explication: "CREATE DATABASE refuse de créer une base qui est déjà là.",
      remede: "Écrivez CREATE DATABASE IF NOT EXISTS $1; — le script pourra alors être relancé sans erreur." },
    { m: /^ERROR 1054 \(42S22\)(?: at line \d+)?: Unknown column '([^']*)' in 'where clause'/,
      titre: "La colonne « $1 » n'existe pas (dans le WHERE)",
      explication: "Trois causes classiques : le nom est mal écrit ; c'est un TEXTE écrit sans apostrophes (WHERE classe = BTS au lieu de WHERE classe = 'BTS') ; ou c'est un alias du SELECT — le WHERE est lu AVANT le SELECT, il ne connaît pas encore « AS nb ».",
      remede: "Vérifiez le nom avec DESCRIBE nom_de_la_table; — un texte va entre apostrophes ; pour filtrer sur un alias ou un COUNT, utilisez HAVING." },
    { m: /^ERROR 1054 \(42S22\)(?: at line \d+)?: Unknown column '([^']*)' in '(field list|on clause|order clause|group statement|having clause|from clause)'/,
      titre: "La colonne « $1 » n'existe pas",
      explication: "Le nom est mal écrit, appartient à une autre table, ou désigne une table par son nom alors qu'elle a reçu un alias (FROM etudiants e : on écrit alors e.nom, plus etudiants.nom). Un texte sans apostrophes est lu, lui aussi, comme un nom de colonne.",
      remede: "DESCRIBE nom_de_la_table; liste les colonnes exactes. Préfixez avec l'alias de la table quand il y en a un." },
    { m: /^ERROR 1052 \(23000\)(?: at line \d+)?: Column '([^']*)' in [\w ]+ is ambiguous/,
      titre: "« $1 » existe dans deux tables de la jointure",
      explication: "Les deux tables jointes ont chacune une colonne « $1 » (souvent « id ») : MariaDB ne sait pas laquelle vous voulez, et refuse de choisir au hasard.",
      remede: "Précisez la table devant le nom : presences.$1, etudiants.$1 — ou l'alias : p.$1, e.$1." },
    { m: /^ERROR 1062 \(23000\)(?: at line \d+)?: Duplicate entry '([^']*)' for key 'PRIMARY'/,
      titre: "La clé primaire « $1 » est déjà prise",
      explication: "Deux lignes ne peuvent pas avoir la même clé primaire : c'est elle qui désigne UNE ligne et une seule.",
      remede: "Avec AUTO_INCREMENT, n'écrivez pas l'id dans l'INSERT : MariaDB en choisit un libre. Sinon, prenez une valeur qui n'existe pas encore." },
    { m: /^ERROR 1062 \(23000\)(?: at line \d+)?: Duplicate entry '([^']*)' for key '([^']*)'/,
      titre: "« $1 » existe déjà (colonne UNIQUE « $2 »)",
      explication: "La colonne « $2 » est déclarée UNIQUE : deux lignes ne peuvent pas y avoir la même valeur — c'est ce qui empêche deux comptes d'avoir le même login.",
      remede: "Choisissez une autre valeur ; ou, si la ligne doit être mise à jour, faites un UPDATE plutôt qu'un INSERT." },
    { m: /^ERROR 1048 \(23000\)(?: at line \d+)?: Column '([^']*)' cannot be null/,
      titre: "« $1 » est obligatoire (NOT NULL)",
      explication: "La colonne a été déclarée NOT NULL : elle refuse NULL. Attention, NULL n'est pas le texte vide '' : c'est l'absence de valeur.",
      remede: "Donnez une valeur à « $1 » dans l'INSERT ou l'UPDATE." },
    { m: /^ERROR 1364 \(HY000\)(?: at line \d+)?: Field '([^']*)' doesn't have a default value/,
      titre: "L'INSERT ne donne pas « $1 », qui est obligatoire",
      explication: "« $1 » est NOT NULL et n'a pas de valeur par défaut (DEFAULT) : une ligne sans elle est impossible. Le mode strict de MariaDB (celui de XAMPP et WAMP) refuse au lieu d'inventer une valeur.",
      remede: "Ajoutez « $1 » à la liste des colonnes de l'INSERT, avec sa valeur." },
    { m: /^ERROR 1406 \(22001\)(?: at line \d+)?: Data too long for column '([^']*)' at row (\d+)/,
      titre: "Texte trop long pour la colonne « $1 »",
      explication: "VARCHAR(n) limite la colonne à n caractères. En mode strict — celui de XAMPP et de WAMP — MariaDB refuse le texte au lieu de le couper en silence. « at row $2 » : c'est la ligne n° $2 des VALUES de l'INSERT.",
      remede: "Raccourcissez le texte, ou agrandissez la colonne : ALTER TABLE … MODIFY $1 VARCHAR(100);" },
    { m: /^ERROR 1366 \(22007\)(?: at line \d+)?: Incorrect (integer|decimal|double) value: '([^']*)' for column (?:`[^`]*`\.`[^`]*`\.)?`([^`]*)` at row (\d+)/,
      titre: "« $2 » n'est pas un nombre (colonne « $3 »)",
      explication: "La colonne « $3 » attend un nombre ($1). Le texte « $2 » n'en est pas un — une virgule française (12,5 au lieu de 12.5), une unité (1800€), ou des valeurs dans le mauvais ordre par rapport à la liste des colonnes.",
      remede: "Écrivez le nombre avec un point décimal et sans unité ; vérifiez que les valeurs suivent l'ordre des colonnes." },
    { m: /^ERROR 1292 \(22007\)(?: at line \d+)?: Incorrect (date|datetime) value: '([^']*)'/,
      titre: "« $2 » n'est pas une date que MariaDB comprend",
      explication: "MariaDB écrit les dates « AAAA-MM-JJ » : '2026-09-13', entre apostrophes. Le format français 13/09/2026 est refusé, et la date doit exister (pas de 30 février).",
      remede: "Écrivez la date '2026-09-13' — avec l'heure pour un DATETIME : '2026-09-13 08:30:00'." },
    { m: /^ERROR 1264 \(22003\)(?: at line \d+)?: Out of range value for column '([^']*)'/,
      titre: "Nombre trop grand pour la colonne « $1 »",
      explication: "Le type de la colonne borne la valeur : un INT va jusqu'à 2 147 483 647 ; un DECIMAL(10,2) garde 8 chiffres avant la virgule et 2 après.",
      remede: "Vérifiez la valeur, ou agrandissez le type (BIGINT, DECIMAL(12,2)…)." },
    { m: /^ERROR 1265 \(01000\)(?: at line \d+)?: Data truncated for column '([^']*)'/,
      titre: "Valeur refusée par la colonne « $1 »",
      explication: "La valeur n'entre pas dans le type de la colonne : pour un ENUM('present','absent'), elle doit être l'une des valeurs de la liste ; pour une colonne passée en NOT NULL, une ligne existante contient NULL.",
      remede: "Prenez une valeur autorisée par la colonne (DESCRIBE montre son type)." },
    { m: /^ERROR 1136 \(21S01\)(?: at line \d+)?: Column count doesn't match value count at row (\d+)/,
      titre: "Pas autant de valeurs que de colonnes",
      explication: "INSERT INTO t (a, b, c) VALUES (1, 2, 3) : autant de valeurs que de colonnes nommées. Sans liste de colonnes, il faut une valeur pour CHAQUE colonne de la table, id compris.",
      remede: "Comptez les colonnes et les valeurs de la ligne n° $1 des VALUES ; le plus sûr est de toujours nommer les colonnes." },
    { m: /^ERROR 1452 \(23000\)(?: at line \d+)?: Cannot add or update a child row: .*`([^`]*)`, CONSTRAINT `[^`]*` FOREIGN KEY \(`([^`]*)`\) REFERENCES `([^`]*)` \(`([^`]*)`\)/,
      titre: "Clé étrangère : aucune ligne de « $3 » n'a ce $4",
      explication: "$1.$2 doit désigner une ligne qui EXISTE dans $3 : on ne note pas la présence d'un étudiant qui n'existe pas. C'est la clé étrangère qui garde la base cohérente.",
      remede: "Insérez d'abord la ligne dans $3 (l'ordre des INSERT compte), ou corrigez la valeur de $2." },
    { m: /^ERROR 1451 \(23000\)(?: at line \d+)?: Cannot delete or update a parent row: .*`([^`]*)`, CONSTRAINT `[^`]*` FOREIGN KEY \(`([^`]*)`\) REFERENCES `([^`]*)` \(`([^`]*)`\)/,
      titre: "Impossible : des lignes de « $1 » pointent encore vers celle-ci",
      explication: "Supprimer (ou renuméroter) cette ligne de $3 laisserait dans $1 des $2 qui ne désignent plus rien. La clé étrangère l'interdit.",
      remede: "Supprimez d'abord les lignes de $1 qui la référencent (DELETE FROM $1 WHERE $2 = …), ou déclarez la clé avec ON DELETE CASCADE." },
    { m: /^ERROR 1451 \(23000\)(?: at line \d+)?: Cannot delete or update a parent row: a foreign key constraint fails$/,
      titre: "Impossible de supprimer cette table : une autre en dépend",
      explication: "Une clé étrangère d'une autre table pointe vers celle-ci (presences.id_etudiant vers etudiants, par exemple) : sans elle, ces lignes ne désigneraient plus rien.",
      remede: "Supprimez d'abord la table qui la référence (DROP TABLE presences;), puis celle-ci." },
    { m: /^ERROR 1005 \(HY000\)(?: at line \d+)?: Can't create table `[^`]*`\.`([^`]*)` \(errno: 150/,
      titre: "La clé étrangère de « $1 » vise une table qui n'existe pas (encore)",
      explication: "« errno: 150 » : REFERENCES nomme une table absente, ou une colonne qui n'y est pas, ou d'un autre type. Le plus souvent, c'est l'ORDRE du script : la table référencée doit être créée AVANT celle qui la référence.",
      remede: "Créez d'abord la table nommée après REFERENCES (etudiants avant presences) ; vérifiez le nom et le type de la colonne visée." },
    { m: /^ERROR 1242 \(21000\)(?: at line \d+)?: Subquery returns more than 1 row/,
      titre: "La sous-requête rend plusieurs lignes",
      explication: "« = (SELECT …) » attend UNE valeur ; la sous-requête en rend plusieurs, et MariaDB ne choisit pas.",
      remede: "Utilisez IN (SELECT …), ou resserrez la sous-requête (une condition de plus, LIMIT 1)." },
    { m: /^ERROR 1111 \(HY000\)(?: at line \d+)?: Invalid use of group function/,
      titre: "COUNT, SUM, AVG… dans un WHERE",
      explication: "Le WHERE trie les lignes UNE PAR UNE, avant tout regroupement : un total n'existe pas encore à ce moment-là.",
      remede: "Filtrez sur un agrégat avec HAVING, après GROUP BY : … GROUP BY classe HAVING COUNT(*) > 16;" },
    { m: /^ERROR 1305 \(42000\)(?: at line \d+)?: FUNCTION [^.]*\.(\S+) does not exist/,
      titre: "La fonction « $1 » n'existe pas",
      explication: "Le nom est mal écrit — ou il y a une ESPACE entre le nom et la parenthèse : MariaDB lit « COUNT (*) » comme autre chose que « COUNT(*) ». Si la fonction existe bien dans MariaDB, l'atelier ne la connaît peut-être pas encore.",
      remede: "Collez la parenthèse au nom : COUNT(*), NOW(), CONCAT(a, b)." },
    { m: /^ERROR 1222 \(21000\)(?: at line \d+)?: The used SELECT statements have a different number of columns/,
      titre: "Les SELECT de l'UNION n'ont pas le même nombre de colonnes",
      explication: "UNION empile les lignes de deux SELECT : il faut que chacun ait autant de colonnes, dans le même ordre.",
      remede: "Alignez les deux listes de colonnes." },
    { m: /^ERROR 1060 \(42S21\)(?: at line \d+)?: Duplicate column name '([^']*)'/,
      titre: "Deux colonnes s'appellent « $1 »",
      explication: "Une table ne peut pas avoir deux colonnes du même nom.",
      remede: "Renommez l'une des deux." },
    { m: /^ERROR 1068 \(42000\)(?: at line \d+)?: Multiple primary key defined/,
      titre: "Deux clés primaires",
      explication: "Une table n'a qu'UNE clé primaire. Elle peut porter sur plusieurs colonnes, mais se déclare une seule fois.",
      remede: "Gardez un seul PRIMARY KEY — ou écrivez PRIMARY KEY (col1, col2) pour une clé sur deux colonnes." },
    { m: /^ERROR 1075 \(42000\)(?: at line \d+)?: Incorrect table definition; there can be only one auto column/,
      titre: "AUTO_INCREMENT exige une clé",
      explication: "Une colonne AUTO_INCREMENT doit être la clé primaire (ou une clé unique), et il n'y en a qu'une par table.",
      remede: "Écrivez : id INT AUTO_INCREMENT PRIMARY KEY." },
    { m: /^ERROR 1051 \(42S02\)(?: at line \d+)?: Unknown table '([^']*)'/,
      titre: "La table « $1 » n'existe pas",
      explication: "DROP TABLE vise une table qui n'est pas (ou plus) là.",
      remede: "DROP TABLE IF EXISTS … ne dit rien si la table manque : c'est la forme des scripts qu'on relance." },
    { m: /^ERROR 4025 \(23000\)(?: at line \d+)?: CONSTRAINT `([^`]*)` failed/,
      titre: "La règle CHECK « $1 » refuse cette valeur",
      explication: "La table déclare une condition (CHECK) que chaque ligne doit respecter ; celle-ci ne la respecte pas.",
      remede: "Prenez une valeur qui respecte la règle (SHOW CREATE TABLE la montre)." },
    { m: /^ERROR 1241 \(21000\)(?: at line \d+)?: Operand should contain (\d+) column/,
      titre: "La sous-requête rend trop de colonnes",
      explication: "Là où une seule valeur est attendue, la sous-requête en rend plusieurs par ligne.",
      remede: "Ne gardez qu'une colonne dans le SELECT de la sous-requête." },
    { m: /^ERROR 1235 \(42000\)(?: at line \d+)?: This version of the atelier doesn't yet support '([^']*)'/,
      titre: "L'atelier ne sait pas encore faire « $1 »",
      explication: "MariaDB le sait ; le moteur SQL écrit pour le site, pas encore. Ce n'est pas une faute de votre part.",
      remede: "Testez cette instruction sur XAMPP ou WAMP." },
    { m: /^ERROR 2031 \(HY093\)/,
      titre: "Un marqueur de la requête préparée n'a pas reçu de valeur",
      explication: "La requête contient des ? ou des :nom, et execute() n'a pas donné autant de valeurs qu'il y a de marqueurs.",
      remede: "Passez à execute() une valeur par marqueur : [':login' => $login] pour :login." },

    /* ── le JavaScript (modes JS et Web) ─────────────────────────────────
       Les messages de V8, le moteur de Chrome et d'Edge, préfixés de leur
       type d'erreur : ils ne se confondent avec aucun message de clang. */
    { m: /^ReferenceError: (document|window|alert) is not defined/,
      titre: "« $1 » n'existe pas dans la console JavaScript",
      explication: "Le bouton JS exécute le programme seul, comme Node : il n'y a pas de page, donc ni document ni window.",
      remede: "Pour manipuler une page, passez sur le bouton Web : votre code va dans script.js, la page dans index.html." },
    { m: /^ReferenceError: (\S+) is not defined/,
      titre: "« $1 » n'existe pas",
      explication: "Le programme utilise un nom qui n'a jamais été déclaré : une faute de frappe, une majuscule (JavaScript distingue « total » de « Total »), ou une variable déclarée dans un autre bloc { } que celui-ci.",
      remede: "Déclarez-la avant de vous en servir (let $1 = …;), ou corrigez son nom." },
    { m: /^ReferenceError: Cannot access '([^']+)' before initialization/,
      titre: "« $1 » est utilisée avant sa déclaration",
      explication: "Une variable déclarée avec let ou const n'existe qu'à partir de sa ligne.",
      remede: "Déplacez la déclaration de « $1 » au-dessus de la ligne signalée." },
    { m: /^TypeError: Cannot (?:read|set) properties of (null|undefined) \((?:reading|setting) '([^']+)'\)/,
      titre: "On cherche « $2 » sur quelque chose qui vaut $1",
      explication: "Le plus souvent, document.querySelector ou getElementById n'a rien trouvé et a rendu null : le sélecteur est mal écrit (« #id », « .classe »), ou le script s'exécute avant que l'élément n'existe.",
      remede: "Vérifiez le sélecteur, et placez <script src=\"script.js\"> juste avant </body> (ou ajoutez defer)." },
    { m: /^TypeError: (\S+) is not a function/,
      titre: "« $1 » n'est pas une fonction",
      explication: "Le programme appelle avec des parenthèses quelque chose qui n'est pas une fonction : un nom mal orthographié (addEventlistener), ou une variable qui contient une valeur.",
      remede: "Vérifiez l'orthographe exacte, majuscules comprises." },
    { m: /^TypeError: Assignment to constant variable/,
      titre: "On modifie une constante",
      explication: "Une variable déclarée avec const ne peut pas recevoir une autre valeur.",
      remede: "Déclarez-la avec let si elle doit changer." },
    { m: /^SyntaxError: Identifier '([^']+)' has already been declared/,
      titre: "« $1 » est déclarée deux fois",
      explication: "Deux let ou const du même nom dans le même bloc.",
      remede: "Gardez une seule déclaration ; la seconde fois, écrivez seulement « $1 = … »." },
    { m: /^SyntaxError: Unexpected end of input/,
      titre: "Le programme s'arrête avant d'être fermé",
      explication: "Une accolade, une parenthèse ou un crochet ouvert n'est jamais refermé.",
      remede: "Comptez les { } ( ) [ ] : l'alinéa dit lequel manque." },
    { m: /^SyntaxError: missing \) after argument list/,
      titre: "Il manque une parenthèse fermante",
      explication: "L'appel d'une fonction (console.log(…), alert(…)) n'est pas refermé — ou une virgule manque entre deux arguments.",
      remede: "Ajoutez « ) » à la fin de l'appel, ou la virgule oubliée." },
    { m: /^SyntaxError: Invalid or unexpected token/,
      titre: "Un caractère que JavaScript ne comprend pas",
      explication: "Souvent un guillemet jamais refermé, ou un guillemet « typographique » collé depuis un traitement de texte.",
      remede: "Refermez la chaîne, et remplacez « » ou ’ par \" ou '." },
    { m: /^SyntaxError: Unexpected token '([^']+)'/,
      titre: "Symbole inattendu : « $1 »",
      explication: "À cet endroit, JavaScript attendait autre chose — souvent une parenthèse ou une accolade oubliée juste avant.",
      remede: "Relisez la ligne signalée et celle d'avant : if (…) { … }, for (…; …; …) { … }." },
    { m: /^SyntaxError: Unexpected (identifier|string|number) ?'?([^']*)'?/,
      titre: "Un mot de trop, ou un opérateur oublié",
      explication: "Deux valeurs se suivent sans rien entre elles : il manque une virgule, un +, ou un point-virgule.",
      remede: "Ajoutez l'opérateur ou la virgule manquants avant « $2 »." },
    { m: /^RangeError: Maximum call stack size exceeded/,
      titre: "Une récursion sans fin",
      explication: "Une fonction s'appelle elle-même sans jamais s'arrêter.",
      remede: "Vérifiez la condition d'arrêt de la fonction récursive." },

    /* ── les oublis de syntaxe ───────────────────────────────────────── */
    { m: /^expected ';' after (expression|statement|declaration|return statement)/,
      titre: "Il manque un point-virgule",
      explication: "En C, chaque instruction se termine par « ; ». Le compilateur lisait encore l'instruction précédente quand il est tombé sur celle-ci.",
      remede: "Ajoutez « ; » à la fin de la ligne précédente." },
    { m: /^expected ';' at end of declaration/,
      titre: "Point-virgule manquant après une déclaration",
      explication: "Une déclaration de variable, de structure ou de prototype se termine elle aussi par « ; ».",
      remede: "Ajoutez « ; ». Attention : après « } » d'un struct ou d'un enum, il en faut un aussi." },
    { m: /^expected '\}'/,
      titre: "Une accolade n'est jamais refermée",
      explication: "Le compilateur a atteint la fin du fichier en attendant encore une « } ».",
      remede: "Comptez vos accolades. L'indentation vous dira laquelle manque." },
    { m: /^expected '\)'/,
      titre: "Une parenthèse n'est jamais refermée",
      explication: "Une parenthèse ouverte attend toujours sa fermante.",
      remede: "Vérifiez la ligne signalée, et celle d'avant." },
    { m: /^expected expression/,
      titre: "Le compilateur attendait une valeur ici",
      explication: "À cet endroit il faut quelque chose qui vaut quelque chose : un nombre, une variable, un appel. Il a trouvé autre chose.",
      remede: "Cherchez un opérateur en trop (« ++ », « ,, »), une parenthèse mal placée, ou un mot-clé employé comme valeur." },
    { m: /^expected identifier or '\('/,
      titre: "Le compilateur attendait un nom",
      explication: "À cet endroit doit commencer une déclaration : un type suivi d'un nom.",
      remede: "Souvent une accolade en trop juste avant, ou un « ; » oublié plus haut." },
    { m: /^extraneous closing brace/,
      titre: "Une accolade fermante en trop",
      explication: "Il y a plus de « } » que de « { ».",
      remede: "Supprimez celle-ci, ou trouvez la « { » qui manque plus haut." },

    /* ── les noms ────────────────────────────────────────────────────── */
    /* Avant la règle générique : « traduire » rend la PREMIÈRE entrée qui
       correspond, et « cout » est un identifiant inconnu comme un autre. Rangée
       après, cette entrée n'aurait jamais été atteinte. */
    /* La faute que le cours démontre lui-même : « 0 <= v <= 255 » compile,
       et vaut toujours vrai. clang la signale par ces deux messages, et ils
       n'étaient pas traduits — le banc l'a dit dès que le corpus a cessé
       d'être écrit à la main et s'est mis à contenir le programme fautif. */
    { m: /^use of logical '(&&|\|\|)' with constant operand/,
      titre: "Une comparaison enchaînée ne veut pas dire ce qu'on croit",
      explication: "En C, « 0 <= v <= 255 » se lit de gauche à droite : « (0 <= v) <= 255 ». La première comparaison donne 0 ou 1, et 0 comme 1 sont toujours inférieurs à 255. La condition est donc TOUJOURS vraie, quelle que soit la valeur.",
      remede: "Écrivez les deux comparaisons en entier, reliées par && : « 0 <= v && v <= 255 »." },
    { m: /^use of undeclared identifier '(?:cout|cin|endl|string|vector)'/,
      titre: "Ce nom appartient à l'espace de noms std",
      explication: "Sans instruction contraire, les noms de la bibliothèque standard du C++ sont préfixés par « std:: ».",
      remede: "Écrivez std::cout, std::string… — ou ajoutez « using namespace std; » après les #include." },
    { m: /^use of undeclared identifier '(.+?)'(?:; did you mean '(.+?)')?/,
      titre: "« $1 » n'existe pas ici",
      explication: "Le compilateur ne connaît aucune variable ni fonction de ce nom à cet endroit du programme.",
      remede: "$2?Vouliez-vous écrire « $2 » ?:Vérifiez l'orthographe et la casse — en C, « total » et « Total » sont deux noms différents. Vérifiez aussi que la variable est déclarée AVANT d'être utilisée, et dans le même bloc." },
    { m: /^call to undeclared function '(.+?)'/,
      titre: "La fonction « $1 » n'a pas été déclarée",
      explication: "Le compilateur rencontre un appel à une fonction dont il n'a jamais vu ni la définition ni le prototype.",
      remede: "Si c'est votre fonction : définissez-la plus haut, ou écrivez son prototype avant main. Si c'est une fonction de la bibliothèque : il manque le #include (printf → stdio.h, malloc → stdlib.h, strlen → string.h, sqrt → math.h). Vérifiez enfin la casse : afficherCarre ≠ affichercarre." },
    { m: /^implicitly declaring library function '(.+?)'/,
      titre: "Le #include de « $1 » manque",
      explication: "Le compilateur reconnaît « $1 » comme une fonction de la bibliothèque standard, mais vous ne lui avez pas dit où en trouver la description.",
      remede: "Ajoutez la ligne qui manque en haut du fichier : printf, scanf, fopen → #include <stdio.h> · malloc, free, atoi, rand → #include <stdlib.h> · strlen, strcpy, strcmp → #include <string.h> · sqrt, pow, fabs → #include <math.h>" },
    { m: /^implicit declaration of function '(.+?)'/,
      titre: "« $1 » est utilisée sans avoir été déclarée",
      explication: "Le compilateur devine son existence, mais il ne sait rien de ses paramètres ni de ce qu'elle renvoie — donc il ne peut rien vérifier, et l'éditeur de liens la réclamera ensuite.",
      remede: "Trois causes, dans l'ordre de fréquence. 1) La CASSE : en C, afficherCarre et affichercarre sont deux fonctions différentes — comparez lettre à lettre avec la définition. 2) Une fonction de la bibliothèque sans son #include (printf → stdio.h, malloc → stdlib.h, strlen → string.h, sqrt → math.h). 3) Votre fonction définie APRÈS main : déplacez-la avant, ou écrivez son prototype en haut." },
    { m: /^unknown type name '(.+?)'/,
      titre: "« $1 » n'est pas un type connu",
      explication: "Le compilateur attendait un type (int, char, double, une structure…) et a trouvé un mot qu'il ne connaît pas.",
      remede: "En C, « string » et « bool » n'existent pas d'origine : une chaîne est un « char[] », et bool demande #include <stdbool.h>. Si c'est votre structure, n'oubliez pas « struct » devant, ou un typedef." },
    { m: /^redefinition of '(.+?)'/,
      titre: "« $1 » est déclaré deux fois",
      explication: "Un même nom ne peut pas être déclaré deux fois dans le même bloc.",
      remede: "Supprimez la seconde déclaration, ou renommez l'une des deux." },
    { m: /^conflicting types for '(.+?)'/,
      titre: "Deux définitions incompatibles de « $1 »",
      explication: "Le prototype et la définition de la fonction ne disent pas la même chose — le type de retour ou les paramètres diffèrent.",
      remede: "Alignez le prototype sur la définition, à l'identique." },
    { m: /^no member named '(.+?)' in '(.+?)'/,
      titre: "« $2 » n'a pas de champ « $1 »",
      explication: "Ce champ n'est pas déclaré dans cette structure.",
      remede: "Vérifiez l'orthographe, et la déclaration de la structure." },
    { m: /member reference type '(.+?)' is a pointer; did you mean to use '->'/,
      titre: "Sur un pointeur, c'est « -> » et non « . »",
      explication: "« p.champ » s'écrit quand p EST la structure ; « p->champ » quand p pointe VERS elle.",
      remede: "Remplacez « . » par « -> » — ou écrivez (*p).champ, qui veut dire exactement la même chose." },
    { m: /member reference type '(.+?)' is not a pointer; did you mean to use '\.'/,
      titre: "Sur une structure, c'est « . » et non « -> »",
      explication: "« -> » ne s'emploie que sur un pointeur.",
      remede: "Remplacez « -> » par « . »." },

    /* ── les arguments et les types ──────────────────────────────────── */
    { m: /^too few arguments to function call, expected (\d+), have (\d+)/,
      titre: "Il manque des arguments : $1 attendus, $2 fourni(s)",
      explication: "L'appel ne donne pas autant de valeurs que la fonction en réclame.",
      remede: "Complétez l'appel, ou vérifiez que vous appelez la bonne fonction." },
    { m: /^too many arguments to function call, expected single argument '(.+?)', have (\d+) arguments/,
      titre: "Un seul argument attendu, $2 fournis",
      explication: "Cette fonction ne prend qu'un paramètre, « $1 ».",
      remede: "Retirez ce qui est en trop, ou vérifiez une virgule mal placée." },
    { m: /^too many arguments to function call, expected (\d+), have (\d+)/,
      titre: "Trop d'arguments : $1 attendus, $2 fournis",
      explication: "L'appel donne plus de valeurs que la fonction n'en accepte.",
      remede: "Retirez ce qui est en trop, ou vérifiez une virgule mal placée." },
    { m: /^expression is not assignable/,
      titre: "On ne peut pas affecter à cette expression",
      explication: "À gauche du « = » il faut quelque chose qui a une place en mémoire : une variable, une case de tableau, un champ.",
      remede: "Vérifiez que vous n'écrivez pas « 5 = x », ni une affectation à un tableau entier, ni un appel de fonction à gauche." },
    { m: /^array type '(.+?)' is not assignable/,
      titre: "Un tableau entier ne se recopie pas avec « = »",
      explication: "Le nom d'un tableau n'est pas une variable ordinaire : on ne peut pas l'affecter d'un bloc.",
      remede: "Copiez case par case avec une boucle, ou utilisez memcpy (string.h). Pour une chaîne, strcpy." },
    { m: /^subscripted value is not an array/,
      titre: "Ceci ne s'indexe pas avec [ ]",
      explication: "Les crochets ne s'emploient que sur un tableau ou un pointeur.",
      remede: "Vérifiez la variable : est-elle bien déclarée comme tableau ou pointeur ?" },
    { m: /^invalid operands to binary expression \('(.+?)' and '(.+?)'\)/,
      titre: "Cette opération n'a pas de sens entre « $1 » et « $2 »",
      explication: "L'opérateur ne sait pas travailler sur ces deux types-là.",
      remede: "Vérifiez les types. En C, deux chaînes ne se comparent pas avec « == » : utilisez strcmp." },
    { m: /^incompatible (integer to pointer|pointer to integer) conversion/,
      titre: "Un entier et un pointeur sont confondus",
      explication: "Un nombre et une adresse ne sont pas la même chose, même s'ils tiennent tous deux dans un mot machine.",
      remede: "C'est souvent un & oublié, ou un & en trop." },
    { m: /^incompatible pointer types/,
      titre: "Deux pointeurs de types différents",
      explication: "Un « int * » et un « char * » ne désignent pas les mêmes objets en mémoire.",
      remede: "Vérifiez le type pointé des deux côtés." },
    { m: /^initializer element is not a compile-time constant/,
      titre: "Une variable globale ne s'initialise qu'avec une constante",
      explication: "La valeur d'une variable globale doit être connue à la compilation, pas calculée au démarrage.",
      remede: "Déplacez le calcul au début de main." },
    { m: /^initializer-string for char array is too long/,
      titre: "La chaîne ne tient pas dans le tableau",
      explication: "Une chaîne occupe une case de plus que ses lettres : le « \\0 » final.",
      remede: "Agrandissez le tableau d'au moins une case, ou laissez les crochets vides : le compilateur comptera." },
    { m: /^'main' must return 'int'/,
      titre: "main doit renvoyer un int",
      explication: "C'est la valeur que le programme rend au système en s'arrêtant.",
      remede: "Écrivez « int main(void) » et terminez par « return 0; »." },
    { m: /^(?:non-void function '(.+?)' should return a value|control reaches end of non-void function)/,
      titre: "Cette fonction doit renvoyer une valeur",
      explication: "Elle est déclarée avec un type de retour, mais un chemin d'exécution en sort sans rien renvoyer.",
      remede: "Ajoutez un « return » sur ce chemin. Si elle ne doit rien renvoyer, déclarez-la « void »." },
    { m: /^control may reach end of non-void function/,
      titre: "Un chemin sort de la fonction sans return",
      explication: "Quand la condition est fausse, l'exécution atteint l'accolade finale sans avoir rien renvoyé. La valeur obtenue est alors quelconque.",
      remede: "Ajoutez un « return » après le if, ou un « else » qui en contienne un." },

    /* ── printf et scanf ─────────────────────────────────────────────── */
    { m: /^format specifies type '(.+?) \*' but the argument has type '(?!.*\*)(.+?)'/,
      titre: "Le & est oublié dans scanf",
      explication: "scanf a besoin de l'ADRESSE de la variable pour y écrire. Sans le &, il reçoit sa valeur — un nombre qu'il prend pour une adresse.",
      remede: "Écrivez scanf(\"…\", &variable). Exception : un tableau ou une chaîne se passent sans &, leur nom est déjà une adresse." },
    { m: /^format specifies type '(.+?)' but the argument has type '(.+?)'/,
      titre: "Le format ne correspond pas à la valeur",
      explication: "Vous annoncez « $1 » dans la chaîne de format, mais vous passez « $2 ».",
      remede: "Les formats usuels : %d entier · %ld long · %f double · %c caractère · %s chaîne · %p adresse · %zu size_t. Pour afficher un float, c'est %f (il est promu en double)." },
    { m: /^more '%' conversions than data arguments/,
      titre: "Plus de % que de valeurs fournies",
      explication: "La chaîne de format annonce plus de valeurs que l'appel n'en donne. Les manquantes sont lues au hasard dans la mémoire.",
      remede: "Comptez les % et les arguments. Pour afficher un % littéral, écrivez « %% »." },
    { m: /^data argument not used by format string/,
      titre: "Une valeur passée n'est jamais affichée",
      explication: "Vous donnez plus d'arguments que la chaîne de format n'en consomme.",
      remede: "Ajoutez le % qui manque, ou retirez l'argument en trop." },
    { m: /^format string is not a string literal/,
      titre: "Format non constant",
      explication: "Le compilateur ne peut pas vérifier la correspondance entre le format et les valeurs.",
      remede: "Pour n'afficher qu'une variable texte, écrivez printf(\"%s\", texte) plutôt que printf(texte)." },

    /* ── la mémoire et les valeurs ───────────────────────────────────── */
    { m: /^variable '(.+?)' is uninitialized when used here/,
      titre: "« $1 » est utilisée sans avoir reçu de valeur",
      explication: "Déclarer une variable ne l'initialise pas : elle contient ce qui traînait à cet endroit de la mémoire.",
      remede: "Donnez-lui une valeur de départ : int $1 = 0;" },
    { m: /^variable '(.+?)' is used uninitialized whenever (.+)$/,
      titre: "« $1 » peut être utilisée sans valeur",
      explication: "Il existe un chemin d'exécution — $2 — où elle n'a jamais été affectée.",
      remede: "Initialisez-la à sa déclaration, ou complétez la condition pour couvrir tous les cas." },
    { m: /^variable '(.+?)' may be uninitialized when used here/,
      titre: "« $1 » n'est peut-être pas initialisée",
      explication: "Selon le chemin suivi, elle peut arriver ici sans valeur.",
      remede: "Donnez-lui une valeur à la déclaration." },
    /* Le piège du chapitre : un tableau passé en paramètre « se dégrade » en
       pointeur, et sizeof n'y mesure plus que l'adresse. C'est exactement
       l'exemple du cours, et le message anglais ne dit pas quoi faire. */
    { m: /^sizeof on array function parameter will return size of '(.+?)' instead of '(.+?)'/,
      titre: "sizeof ne mesure plus le tableau ici",
      explication: "Un tableau passé en paramètre n'arrive pas entier : la fonction n'en reçoit que l'adresse du premier élément. sizeof mesure donc « $1 » — un pointeur — et non « $2 ».",
      remede: "Passez la taille en second paramètre : void f(int t[], int n). C'est pour cela que toutes les fonctions sur tableaux en prennent un." },
    { m: /^array index (-?\d+) is past the end of the array \(which contains (\d+) elements?\)/,
      titre: "L'indice $1 sort du tableau ($2 cases)",
      explication: "Les cases vont de 0 à $2 − 1. Au-delà, on lit ou on écrit la mémoire du voisin.",
      remede: "Une boucle sur un tableau de $2 cases s'écrit « for (i = 0; i < $2; i++) » — avec « < », jamais « <= »." },
    { m: /^array index (-?\d+) is before the beginning of the array/,
      titre: "L'indice $1 est avant le début du tableau",
      explication: "Le premier indice valide est 0.",
      remede: "Vérifiez le calcul de l'indice." },
    { m: /^implicit conversion loses integer precision: '(.+?)' to '(.+?)'/,
      titre: "Perte de précision : « $1 » rangé dans « $2 »",
      explication: "Le type d'arrivée est plus étroit que celui de départ : les bits en trop sont perdus en silence.",
      remede: "Élargissez le type d'arrivée, ou assumez la conversion avec un cast explicite." },
    { m: /^implicit conversion from '(?:double|float)' to '(.+?)' changes value/,
      titre: "La partie décimale est perdue",
      explication: "Ranger un nombre à virgule dans un entier coupe ce qui suit la virgule — sans arrondir.",
      remede: "Utilisez un double, ou arrondissez explicitement avec round() de math.h." },

    /* ── les fautes de logique que le compilateur voit ───────────────── */
    { m: /^using the result of an assignment as a condition without parentheses/,
      titre: "« = » au lieu de « == » dans une condition",
      explication: "« if (x = 3) » affecte 3 à x et teste 3, donc la condition est toujours vraie. « if (x == 3) » compare.",
      remede: "Écrivez « == » pour comparer. Si l'affectation est voulue, entourez-la d'une seconde paire de parenthèses." },
    { m: /^for loop has empty body/,
      titre: "Cette boucle ne fait rien",
      explication: "Un « ; » juste après la parenthèse fermante ferme la boucle : le bloc qui suit s'exécute une seule fois, après.",
      remede: "Supprimez le « ; » qui suit for (…) ou while (…)." },
    { m: /^if statement has empty body/,
      titre: "Ce if ne fait rien",
      explication: "Un « ; » après la parenthèse ferme le if : le bloc qui suit s'exécute toujours.",
      remede: "Supprimez le « ; » qui suit if (…)." },
    { m: /^result of comparison against a string literal is unspecified/,
      titre: "Deux chaînes ne se comparent pas avec « == »",
      explication: "« == » compare les adresses, pas les lettres. Deux chaînes identiques peuvent vivre à deux adresses différentes.",
      remede: "Utilisez strcmp(a, b) == 0 pour tester l'égalité (string.h)." },
    { m: /^comparison of integers of different signs: '(.+?)' and '(.+?)'/,
      titre: "Comparaison entre un signé et un non-signé",
      explication: "Le signé est converti en non-signé : −1 devient un très grand nombre, et la comparaison s'inverse.",
      remede: "Mettez les deux du même côté : « int » avec « int », ou « size_t » avec « size_t »." },
    { m: /^duplicate case value '(.+?)'/,
      titre: "La valeur $1 apparaît deux fois dans le switch",
      explication: "Deux « case » portent la même valeur : le second ne pourrait jamais s'exécuter.",
      remede: "Supprimez le doublon, ou corrigez la valeur de l'un des deux." },
    { m: /^'(?:case|default)' statement not in switch statement/,
      titre: "Ce case est hors de son switch",
      explication: "Un « case » ne vit qu'à l'intérieur des accolades d'un switch.",
      remede: "Vérifiez les accolades du switch." },
    { m: /^switch condition has boolean value/,
      titre: "Un switch sur un booléen",
      explication: "Il n'y a que deux valeurs possibles : un if se lit mieux.",
      remede: "Remplacez par if / else." },
    { m: /^add explicit braces to avoid dangling else/,
      titre: "À quel if se rattache ce else ?",
      explication: "Un else se rattache toujours au if le plus proche, ce qui n'est pas toujours celui qu'on croit en lisant l'indentation.",
      remede: "Mettez des accolades autour de chaque bloc." },
    { m: /^declaration shadows a local variable/,
      titre: "Cette déclaration en masque une autre",
      explication: "Une variable du même nom existe déjà dans un bloc englobant. À l'intérieur, c'est la nouvelle qui compte.",
      remede: "Renommez l'une des deux si ce n'était pas voulu." },
    { m: /^'&&' within '\|\|'/,
      titre: "Priorité de && et || à préciser",
      explication: "« && » est prioritaire sur « || » : a || b && c se lit a || (b && c).",
      remede: "Ajoutez des parenthèses pour dire ce que vous voulez." },
    { m: /^expression result unused/,
      titre: "Cette ligne ne fait rien",
      explication: "L'expression est calculée puis jetée.",
      remede: "Vouliez-vous affecter le résultat, ou appeler une fonction ?" },
    { m: /^unused variable '(.+?)'/,
      titre: "« $1 » est déclarée mais jamais utilisée",
      explication: "Ce n'est pas une faute, mais souvent le signe d'un oubli ou d'une faute de frappe sur un autre nom.",
      remede: "Servez-vous en, ou supprimez-la." },
    { m: /^unused parameter '(.+?)'/,
      titre: "Le paramètre « $1 » n'est jamais utilisé",
      explication: "La fonction reçoit cette valeur et ne s'en sert pas.",
      remede: "Si c'est voulu, ce n'est pas grave. Sinon, vérifiez le corps de la fonction." },

    /* ── l'édition de liens ──────────────────────────────────────────
       Ces messages-là ne viennent pas de clang mais de lld, et ils sont les
       plus déroutants : le programme a COMPILÉ, et il échoue quand même. */
    { m: /^(?:.*?: )?undefined symbol: (.+)$/,
      titre: "« $1 » n'existe nulle part",
      explication: "Le programme a bien compilé : le compilateur a cru sur parole que cette fonction existait ailleurs. À l'assemblage final, on ne la trouve pas.",
      remede: "Vérifiez la CASSE entre l'appel et la définition — c'est la cause numéro un. Sinon : la fonction est-elle vraiment définie, avec un corps entre accolades, et non seulement déclarée ?" },
    { m: /^duplicate symbol: (.+)$/,
      titre: "« $1 » est définie deux fois",
      explication: "Deux définitions du même nom : l'assemblage ne sait pas laquelle prendre.",
      remede: "Supprimez le doublon." },

    /* ── les inclusions ──────────────────────────────────────────────── */
    { m: /^'(.+?)' file not found/,
      titre: "Le fichier « $1 » est introuvable",
      explication: "Ce fichier d'en-tête n'existe pas dans la bibliothèque standard.",
      remede: "Vérifiez l'orthographe : stdio.h, stdlib.h, string.h, math.h, time.h, stdbool.h. En C++ : iostream, vector, string, fstream, algorithm." },

    /* ── C++ ─────────────────────────────────────────────────────────── */
    { m: /^no matching function for call to '(.+?)'/,
      titre: "Aucune version de « $1 » n'accepte ces arguments",
      explication: "La fonction existe, mais aucune de ses surcharges ne correspond aux types passés.",
      remede: "Comparez les types des arguments avec ceux attendus — la note ci-dessous les liste." },
    { m: /^no viable overloaded '='/,
      titre: "Cette affectation n'est pas possible",
      explication: "Le type de gauche ne sait pas se construire à partir de celui de droite.",
      remede: "Vérifiez les deux types." },
  ];

  /* ── les gardes d'exécution ──────────────────────────────────────── */
  const GARDES = {
    "hors-tableau": (g) => ({
      titre: "Case hors du tableau : indice " + g.detail,
      explication: "Le programme a lu ou écrit la case " + g.detail + " d'un tableau qui n'en contient pas autant. En C rien ne l'en empêche : il touche la mémoire d'à côté. C'est la première cause de programmes qui « marchent une fois sur deux ».",
      remede: "Un tableau de n cases va de 0 à n − 1. Vérifiez la condition de votre boucle : « i < n », jamais « i <= n »." }),
    "division-zero": () => ({
      titre: "Division par zéro",
      explication: "Diviser un entier par zéro n'a pas de résultat. Le programme s'arrête ou rend n'importe quoi.",
      remede: "Testez le diviseur avant : if (b != 0) { … }" }),
    "pointeur": (g) => {
      const [quoi, cause] = (g.detail || "").split("|");
      return {
        titre: cause === "un pointeur nul" ? "Pointeur nul utilisé" : "Adresse invalide",
        explication: "Le programme a essayé de " + (quoi || "utiliser") + " " + (cause || "une adresse invalide") + ".",
        remede: cause === "un pointeur nul"
          ? "Un pointeur vaut NULL tant qu'on ne lui a pas donné d'adresse — et malloc renvoie NULL quand il échoue. Testez : if (p != NULL) { … }"
          : "Vérifiez d'où vient cette adresse : pointeur non initialisé, ou déjà libéré." };
    },
    "return-manquant": () => ({
      titre: "La fonction se termine sans return",
      explication: "L'exécution est sortie d'une fonction non-void sans renvoyer de valeur. Ce qui est renvoyé est alors quelconque.",
      remede: "Ajoutez un return sur ce chemin d'exécution." }),
    "debordement": (g) => ({
      titre: "Dépassement de capacité",
      explication: g.detail + ". Un int tient entre −2 147 483 648 et 2 147 483 647 ; au-delà il repart de l'autre bout.",
      remede: "Utilisez un « long long », ou revoyez le calcul." }),
    "decalage": () => ({
      titre: "Décalage de bits invalide",
      explication: "On ne peut pas décaler d'un nombre négatif, ni d'autant de bits que le type en contient.",
      remede: "Vérifiez la valeur du décalage." }),
    "taille-tableau": () => ({
      titre: "Taille de tableau nulle ou négative",
      explication: "Un tableau dont la taille est calculée doit recevoir une taille strictement positive.",
      remede: "Testez la valeur avant de déclarer le tableau." }),
    "valeur-invalide": () => ({
      titre: "Valeur impossible pour ce type",
      explication: "Un bool ou un enum contient une valeur qui n'appartient pas à ses valeurs permises — souvent parce qu'il n'a jamais été initialisé.",
      remede: "Donnez-lui une valeur de départ." }),
    "conversion": () => ({
      titre: "Ce nombre ne tient pas dans le type visé",
      explication: "La conversion d'un nombre à virgule vers un entier dépasse ce que l'entier peut contenir.",
      remede: "Vérifiez l'ordre de grandeur, ou utilisez un type plus large." }),
    "pointeur-hors": () => ({
      titre: "Calcul de pointeur hors zone",
      explication: "Une addition sur un pointeur l'a mené hors de la zone qu'il avait le droit de parcourir.",
      remede: "Vérifiez les bornes de votre parcours." }),
    "argument-nul": (g) => ({
      titre: "Argument nº " + g.detail + " : pointeur nul",
      explication: "Cette fonction n'accepte pas NULL à cette place.",
      remede: "Vérifiez le pointeur avant l'appel." }),
    "retour-nul": () => ({
      titre: "Cette fonction ne devait pas renvoyer NULL",
      explication: "Elle est déclarée comme renvoyant toujours une adresse valide.",
      remede: "Ajoutez le cas d'échec." }),
    "fonction-native": () => ({
      titre: "Argument interdit pour une fonction native",
      explication: "Une fonction intrinsèque du compilateur a reçu une valeur qu'elle n'accepte pas, souvent zéro.",
      remede: "Testez la valeur avant l'appel." }),
    "inatteignable": () => ({
      titre: "Le programme a atteint un point impossible",
      explication: "L'exécution est passée par du code que le compilateur croyait inatteignable.",
      remede: "Vérifiez les chemins de sortie de vos fonctions." }),
    "plafond": (g) => ({
      titre: "Signalements interrompus après " + g.detail,
      explication: "La même faute se répète, probablement dans une boucle. Les suivantes ne sont plus affichées.",
      remede: "Corrigez la première : les autres viennent sans doute d'elle." }),
  };

  /* Le motif d'une variable jamais initialisée. -ftrivial-auto-var-init
     remplit la mémoire d'octets 0xAA : une variable sans valeur de départ
     vaut donc 0xAAAAAAAA, soit -1431655766.

     Chercher ce nombre exact ne suffit pas, et c'est une mesure qui l'a dit :
     « somme += t[i] » dix fois de suite affiche -1431655616, pas
     -1431655766. Les additions abîment le bas du mot et laissent le haut
     intact. On teste donc les DOUZE bits de poids fort : 1010 1010 1010.

     La fenêtre correspondante ne couvre qu'un million d'entiers négatifs
     autour de -1,43 milliard ; qu'un programme d'étudiant y tombe par
     hasard n'arrive pas. */
  const HAUT = 0xAAA;
  const FLOTTANTS = ["-3.0316", "-3.03165e-13", "-nan", "-3.02936e-103"];

  function nonInitialise(texte) {
    for (const m of texte.matchAll(/-?\d{4,12}\b/g)) {
      const v = Number(m[0]);
      if (!Number.isSafeInteger(v)) continue;
      if (((v >>> 0) >>> 20) === HAUT) return m[0];
      /* Un short ou un char non initialisé : 0xAAAA et 0xAA. */
      if (v === -21846 || v === 43690 || v === 2863311530) return m[0];
    }
    for (const f of FLOTTANTS) if (texte.indexOf(f) >= 0) return f;
    return null;
  }

  function remplacer(texte, capt) {
    /* « $2?oui:non » : une branche selon qu'un groupe a été capturé. */
    texte = texte.replace(/\$(\d+)\?([^:]*):([^$]*)/g,
      (_, n, oui, non) => (capt[+n] ? oui.replace(/\$(\d+)/g, (_, k) => capt[+k] || "") : non));
    return texte.replace(/\$(\d+)/g, (_, n) => capt[+n] || "");
  }

  function traduire(message) {
    for (const e of TABLE) {
      const m = e.m.exec(message);
      if (m) return { titre: remplacer(e.titre, m),
                      explication: remplacer(e.explication, m),
                      remede: remplacer(e.remede, m) };
    }
    return null;
  }

  function traduireGarde(g) {
    const f = GARDES[g.genre];
    return f ? f(g) : { titre: "Anomalie d'exécution : " + g.genre,
                        explication: g.detail || "", remede: "" };
  }

  return { traduire, traduireGarde, nonInitialise, TABLE, GARDES };
})();

if (typeof module !== "undefined" && module.exports) module.exports = TRADUCTIONS;
