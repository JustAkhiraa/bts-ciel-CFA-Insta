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
