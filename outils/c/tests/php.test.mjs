/* Le banc du PHP de l'atelier : des programmes courts, et ce que PHP 8.3
   en fait. Les sorties attendues ont été relevées sur un vrai PHP (le dépôt
   garde le script de comparaison dans le bloc-notes). Ici, on fige les cas
   du cours pour qu'une régression se voie tout de suite. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("../php.js");
require("../php-fonctions.js");
const SQL = require("../sql.js");
const BASE = require("../base-cours.js");

export const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const egal = (a, b, msg) => { if (a !== b) throw new Error((msg || "") + "\n attendu " + JSON.stringify(b) + "\n obtenu  " + JSON.stringify(a)); };
function sortie(src, opt) { return P.executer("prog.php", /^\s*<\?/.test(src) ? src : "<?php " + src, opt || {}).sortie; }

test("echo, concaténation, types qui changent", () => {
  egal(sortie('$a="Alice"; $age=25; echo "Bonjour $a, $age ans"; $a=1.5; echo " puis $a";'), "Bonjour Alice, 25 ans puis 1.5");
  egal(sortie('echo "x" . 3 . "|" . (5 . 3) . "|" . true . "|" . false . "|" . null . ".";'), "x3|53|1||.");
  egal(sortie('$b="ami"; echo "bonjour $b" . "|" . \'bonjour $b\';'), "bonjour ami|bonjour $b");
});

test("nombres : division, modulo, puissance, affichage", () => {
  egal(sortie('echo 10/3, "|", 10/2, "|", 7%3, "|", 2**10, "|", intdiv(7,2);'), "3.3333333333333|5|1|1024|3");
  egal(sortie('echo 0.1+0.2, "|", round(2.5), "|", round(1.955,2), "|", floor(-1.5), "|", abs(-3);'), "0.3|3|1.96|-2|3");
  egal(sortie('echo number_format(1234567.891,2), "|", number_format(1234.5,2,",", " ");'), "1,234,567.89|1 234,50");
});

test("les comparaisons de PHP 8", () => {
  egal(sortie('var_dump("5"==5, "abc"==0, "1e3"=="1000", 0=="", null==false);'),
    "bool(true)\nbool(false)\nbool(true)\nbool(false)\nbool(true)\n");
  egal(sortie('var_dump(10 <=> 20, "a" <=> "b", [1,2] == [1,2]);'), "int(-1)\nint(-1)\nbool(true)\n");
});

test("if / elseif / else, switch, boucles", () => {
  egal(sortie('$p=443; if($p===443)echo "HTTPS"; elseif($p===22)echo "SSH"; else echo "?";'), "HTTPS");
  egal(sortie('for($i=0;$i<3;$i++)echo $i; echo "|"; $i=0; while($i<3){echo $i;$i++;} echo "|"; do{echo "x";}while(false);'), "012|012|x");
  egal(sortie('$j=3; switch($j){case 1: echo "l"; break; case 3: echo "me"; break; default: echo "?";}'), "me");
  egal(sortie('foreach(["C","PHP"] as $v) echo "$v "; foreach([21=>"FTP",22=>"SSH"] as $k=>$n) echo "$k:$n ";'), "C PHP 21:FTP 22:SSH ");
});

test("fonctions : défaut, référence, variadique, récursion", () => {
  egal(sortie('function f($a,$b=10){return $a+$b;} echo f(5), "|", f(5,1);'), "15|6");
  egal(sortie('function g(&$x){$x*=2;} $n=5; g($n); echo $n;'), "10");
  egal(sortie('function somme(...$n){return array_sum($n);} echo somme(1,2,3,4);'), "10");
  egal(sortie('function fact($n){return $n<=1?1:$n*fact($n-1);} echo fact(6);'), "720");
});

test("tableaux : associatifs, sémantique de valeur, fonctions", () => {
  egal(sortie('$t=["a"=>1,"b"=>2]; $t["c"]=3; echo $t["b"], count($t), implode(",",array_keys($t));'), "23a,b,c");
  egal(sortie('$a=[1,2]; $b=$a; $b[]=3; echo count($a), count($b);'), "23");
  egal(sortie('$n=[3,1,2]; sort($n); echo implode(",",$n), "|", array_sum($n), "|", max($n);'), "1,2,3|6|3");
  egal(sortie('$t=[1,2,3,4]; echo implode(",",array_map(fn($x)=>$x*$x,$t)), "|", implode(",",array_filter($t,fn($x)=>$x%2==0));'), "1,4,9,16|2,4");
});

test("classes, héritage, static, exceptions", () => {
  egal(sortie('class P{function __construct(public $x,public $y){} function d(){return sqrt($this->x**2+$this->y**2);}} echo (new P(3,4))->d();'), "5");
  egal(sortie('class C{public static $n=0; static function i(){self::$n++;}} C::i(); C::i(); echo C::$n;'), "2");
  egal(sortie('try{throw new RuntimeException("boom");}catch(LogicException $e){echo "l";}catch(RuntimeException $e){echo "r:".$e->getMessage();}'), "r:boom");
  egal(sortie('try{$x=1/0;}catch(DivisionByZeroError $e){echo $e->getMessage();}'), "Division by zero");
});

test("le web : htmlspecialchars, isset/empty, filter_var", () => {
  egal(sortie('echo htmlspecialchars("<a href=\\"x\\">O\'Neil</a>");'), "&lt;a href=&quot;x&quot;&gt;O&#039;Neil&lt;/a&gt;");
  egal(sortie('$p=["q"=>""]; var_dump(isset($p["q"]), empty($p["q"]), isset($p["z"]), $p["z"]??"def");'),
    "bool(true)\nbool(true)\nbool(false)\nstring(3) \"def\"\n");
  egal(sortie('var_dump(filter_var("a@b.fr",FILTER_VALIDATE_EMAIL), filter_var("pasmail",FILTER_VALIDATE_EMAIL), filter_var("192.168.0.1",FILTER_VALIDATE_IP));'),
    "string(6) \"a@b.fr\"\nbool(false)\nstring(11) \"192.168.0.1\"\n");
});

test("password_hash / password_verify (bcrypt)", () => {
  egal(sortie('$h=password_hash("admin",PASSWORD_DEFAULT); var_dump(strlen($h), password_verify("admin",$h), password_verify("faux",$h), str_starts_with($h,"$2y$"));'),
    "int(60)\nbool(true)\nbool(false)\nbool(true)\n");
});

test("$_POST, superglobales", () => {
  const post = new P.PhpArray(); post.set("nom", "Aya"); post.set("ok", "1");
  const r = P.executer("prog.php", '<?php echo "Bonjour " . htmlspecialchars($_POST["nom"]); echo $_SERVER["REQUEST_METHOD"];', { post, methode: "POST" });
  egal(r.sortie, "Bonjour AyaPOST");
});

test("session : compteur de visites", () => {
  const m = new P.Moteur({});
  const src = '<?php session_start(); $_SESSION["v"] = ($_SESSION["v"] ?? 0) + 1; echo $_SESSION["v"];';
  egal(m.lancerProgramme("p.php", src).sortie, "1");
  // une deuxième requête garde la session
  const r = m.resultat();
  const m2 = new P.Moteur({ session: r.session });
  egal(m2.lancerProgramme("p.php", src).sortie, "2");
});

test("header(Location) : la redirection est rapportée, pas exécutée", () => {
  const r = P.executer("login.php", '<?php $_SESSION=[]; header("Location: accueil.php"); exit(); echo "jamais";', {});
  egal(r.redirection, "accueil.php");
  egal(r.sortie, "");
});

function serveurCours() { const s = new SQL.Serveur(); s.executer(BASE); return s; }

test("PDO : query, fetch, prepare/execute sur la base du cours", () => {
  const m = new P.Moteur({ serveur: serveurCours() });
  m.fichiers["db.php"] = '<?php $pdo = new PDO("mysql:host=localhost;dbname=gestion_presence", "root", "root"); $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);';
  const src = `<?php
require "db.php";
echo $pdo->query("SELECT COUNT(*) FROM etudiants")->fetchColumn(), "|";
$req = $pdo->prepare("SELECT nom FROM etudiants WHERE id = :id");
$req->execute([":id" => 1]);
$e = $req->fetch();
echo $e["nom"], "|";
foreach ($pdo->query("SELECT nom FROM etudiants ORDER BY id LIMIT 2") as $r) echo $r["nom"], ",";`;
  egal(m.lancerProgramme("index.php", src).sortie, "33|Dupont|Dupont,Martin,");
});

test("PDO : l'injection échoue avec une requête préparée", () => {
  const m = new P.Moteur({ serveur: serveurCours() });
  const base = '<?php $pdo = new PDO("mysql:host=localhost;dbname=gestion_presence", "", "");';
  m.fichiers["db.php"] = base;
  // sans protection, la chaîne entre dans le SQL (vulnérable)
  const vuln = `<?php require "db.php";
$pdo->exec("INSERT INTO administrateurs (login, mot_de_passe) VALUES ('admin', 'x')");
$login = "' OR '1'='1' #";
$r = $pdo->query("SELECT * FROM administrateurs WHERE login = '$login' AND mot_de_passe = ''");
var_dump($r->fetch() !== false);`;
  egal(m.lancerProgramme("v.php", vuln).sortie, "bool(true)\n");
  // avec une requête préparée, la même saisie ne trouve rien
  const m2 = new P.Moteur({ serveur: serveurCours() });
  m2.fichiers["db.php"] = base;
  const sur = `<?php require "db.php";
$req = $pdo->prepare("SELECT * FROM administrateurs WHERE login = :l");
$req->execute([":l" => "' OR '1'='1' #"]);
var_dump($req->fetch());`;
  egal(m2.lancerProgramme("s.php", sur).sortie, "bool(false)\n");
});

test("les erreurs de PHP : message et ligne, comme sur XAMPP", () => {
  egal(sortie('echo $x;').trim(), "Warning: Undefined variable $x in prog.php on line 1");
  const r = P.executer("prog.php", '<?php\necho "ok\\n";\nfoo_inexistante();', {});
  egal(r.erreurFatale.classe, "Error");
  egal(r.erreurFatale.ligne, 3);
  const r2 = P.executer("prog.php", '<?php echo "a" echo "b";', {});
  egal(r2.erreurFatale.classe, "ParseError", "une faute de syntaxe");
});

test("la syntaxe alternative des gabarits (if : endif)", () => {
  egal(sortie('<?php $e="x"; ?><?php if($e !== ""): ?>Erreur : <?php echo $e; endif; ?>'), "Erreur : x");
});

test("les pages du cours (chap. 5, 6, 9) se lisent toutes sans erreur de syntaxe", async () => {
  const { readFileSync } = await import("node:fs");
  const ANA = require("../php-analyse.js");
  const pages = ["05-php/cours", "05-php/exercices", "06-php-sessions-espace-membre/cours", "06-php-sessions-espace-membre/exercices", "09-bases-de-donnees-sql/cours", "09-bases-de-donnees-sql/exercices"]
    .map((p) => readFileSync(new URL("../../../01-informatique-dev/" + p + ".html", import.meta.url), "utf8"));
  const ent = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'" };
  const blocs = [];
  for (const h of pages) {
    const re = /<div class="bloc-code" data-fam="php"><span class="langue">[^<]*<\/span><pre><code>([\s\S]*?)<\/code><\/pre>/g;
    let m;
    while ((m = re.exec(h))) blocs.push(m[1].replace(/<[^>]+>/g, "").replace(/&\w+;|&#39;/g, (x) => ent[x] || x));
  }
  if (blocs.length < 60) throw new Error("blocs PHP trouvés : " + blocs.length);
  const fautes = [];
  for (const b of blocs) {
    if (/…|→|^\s*"\.\.\./.test(b)) continue;   // un extrait coupé n'est pas un fichier complet
    // un fichier .php commence en mode HTML : on le passe tel quel. Les
    // fragments de corps (sans <?php) sont alors du texte HTML, sans erreur.
    try { ANA.analyser(b); } catch (e) { if (e.syntaxe) fautes.push(e.message + "\n" + b.slice(0, 60)); }
  }
  if (fautes.length) throw new Error(fautes.join("\n\n"));
});
