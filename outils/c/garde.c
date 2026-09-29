/* ═══════════════════════════════════════════════════════════════════════
   Les gardes d'exécution.

   clang sait instrumenter un programme pour qu'il se dénonce lui-même :
   case hors du tableau, division par zéro, pointeur nul, return manquant.
   Il insère à chaque endroit sensible un appel à __ubsan_handle_… en lui
   passant le fichier, la ligne et la colonne. Ces fonctions vivent
   normalement dans une bibliothèque que ce sysroot n'a pas. Les voici.

   Chacune écrit une ligne balisée, encadrée par \x1e et découpée par \x1f,
   que la page reconnaît et traduit. Le caractère \x1e n'apparaît jamais
   dans la sortie d'un programme d'étudiant : c'est ce qui rend la
   distinction sûre entre « ce que le programme affiche » et « ce que le
   garde signale ».

   Compilé SANS instrumentation, évidemment : un garde instrumenté
   s'appellerait lui-même.
   ═══════════════════════════════════════════════════════════════════════ */
#include <stdio.h>
#include <stdlib.h>

typedef struct { const char *fichier; unsigned ligne; unsigned colonne; } lieu;
typedef struct { unsigned short genre; unsigned short info; char nom[1]; } descr;

/* Séparateurs ASCII, écrits par concaténation : « \x1f0 » serait lu comme
   un seul échappement hexadécimal de trois chiffres. */
#define RS "\036"
#define US "\037"

/* Sortie non tamponnée, posée avant main.

   Sans cela, printf("Entrez n : ") reste dans le tampon jusqu'à la fin du
   programme : l'étudiant voit la question APRÈS avoir répondu, ou pas du
   tout si le programme s'arrête en route. C'est la confusion numéro un du
   premier semestre, et elle n'a rien à voir avec son code. Les signalements
   des gardes passent d'ailleurs par stderr, qui n'est pas tamponné : les
   mélanger à un stdout tamponné donnerait un ordre d'affichage faux. */
__attribute__((constructor))
static void sans_tampon(void)
{
  setvbuf(stdout, NULL, _IONBF, 0);
  setvbuf(stderr, NULL, _IONBF, 0);
}

static int comptes = 0;
#define PLAFOND 25

static void signaler(const lieu *l, const char *genre, const char *detail)
{
  if (++comptes > PLAFOND) return;
  fprintf(stderr, RS "GARDE" US "%s" US "%s" US "%u" US "%u" US "%s" RS "\n",
          genre, l && l->fichier ? l->fichier : "?",
          l ? l->ligne : 0, l ? l->colonne : 0, detail ? detail : "");
  fflush(stderr);
  if (comptes == PLAFOND)
    fprintf(stderr, RS "GARDE" US "plafond" US "" US "0" US "0" US "%d" RS "\n", PLAFOND);
}

/* Une entrée non-abandon et son jumeau abandon, pour chaque contrôle. */
#define DEUX(nom, args, corps) \
  void __ubsan_handle_##nom args { corps } \
  void __ubsan_handle_##nom##_abort args { corps abort(); }

typedef struct { lieu l; const descr *t; } d_debord;
typedef struct { lieu l; const descr *tab; const descr *idx; } d_borne;
typedef struct { lieu l; const descr *g; const descr *d; } d_decal;
typedef struct { lieu l; const descr *t; unsigned char align; unsigned char controle; } d_acces;
typedef struct { lieu l; } d_seul;
typedef struct { lieu l; const descr *t; } d_valeur;
typedef struct { lieu l; unsigned char genre; } d_native;
typedef struct { lieu l; lieu attr; int rang; } d_argument;

DEUX(add_overflow,    (d_debord *d, unsigned long a, unsigned long b),
     (void)a; (void)b; signaler(&d->l, "debordement", "une addition dépasse la capacité du type");)
DEUX(sub_overflow,    (d_debord *d, unsigned long a, unsigned long b),
     (void)a; (void)b; signaler(&d->l, "debordement", "une soustraction dépasse la capacité du type");)
DEUX(mul_overflow,    (d_debord *d, unsigned long a, unsigned long b),
     (void)a; (void)b; signaler(&d->l, "debordement", "une multiplication dépasse la capacité du type");)
DEUX(negate_overflow, (d_debord *d, unsigned long a),
     (void)a; signaler(&d->l, "debordement", "changer le signe dépasse la capacité du type");)
DEUX(divrem_overflow, (d_debord *d, unsigned long a, unsigned long b),
     (void)a; signaler(&d->l, b == 0 ? "division-zero" : "debordement",
                       b == 0 ? "" : "cette division dépasse la capacité du type");)
DEUX(shift_out_of_bounds, (d_decal *d, unsigned long a, unsigned long b),
     (void)a; (void)b; signaler(&d->l, "decalage", "décalage de bits d'une quantité invalide");)
DEUX(out_of_bounds, (d_borne *d, unsigned long i),
     { char n[32]; snprintf(n, sizeof n, "%lu", i); signaler(&d->l, "hors-tableau", n); })
DEUX(builtin_unreachable, (d_seul *d), signaler(&d->l, "inatteignable", "");)
DEUX(missing_return, (d_seul *d),
     signaler(&d->l, "return-manquant", "la fonction se termine sans return");)
DEUX(vla_bound_not_positive, (d_valeur *d, unsigned long n),
     (void)n; signaler(&d->l, "taille-tableau", "taille de tableau nulle ou négative");)
DEUX(load_invalid_value, (d_valeur *d, unsigned long v),
     (void)v; signaler(&d->l, "valeur-invalide", "valeur impossible pour ce type");)
DEUX(float_cast_overflow, (void *d, unsigned long v),
     (void)v; signaler(&((d_decal *)d)->l, "conversion", "ce nombre ne tient pas dans le type visé");)
DEUX(invalid_builtin, (d_native *d),
     signaler(&d->l, "fonction-native", "argument interdit pour une fonction native");)
DEUX(pointer_overflow, (d_seul *d, unsigned long a, unsigned long b),
     (void)a; (void)b; signaler(&d->l, "pointeur-hors", "ce calcul de pointeur sort de la zone allouée");)
DEUX(nonnull_arg, (d_argument *d),
     { char n[32]; snprintf(n, sizeof n, "%d", d->rang); signaler(&d->l, "argument-nul", n); })
/* Ici le lieu utile est le SECOND argument : le premier porte la position
   de l'attribut, pas celle de la faute. */
DEUX(nonnull_return_v1, (d_seul *d, lieu *ici), (void)d;
     signaler(ici, "retour-nul", "cette fonction promet de ne jamais renvoyer NULL");)
/* Écrit à la main : la macro ne sait pas avaler une liste d'initialisation,
   dont les virgules lui passeraient pour des arguments. */
static const char *QUOI[] = { "lire", "écrire dans", "lier", "accéder au champ de",
  "appeler la méthode de", "construire", "convertir", "convertir",
  "convertir", "convertir", "lier", "utiliser" };

static void acces(d_acces *d, unsigned long p)
{
  const char *q = d->controle < 12 ? QUOI[d->controle] : "utiliser";
  char n[160];
  if (p == 0) snprintf(n, sizeof n, "%s|un pointeur nul", q);
  else snprintf(n, sizeof n, "%s|une adresse invalide ou mal alignée", q);
  signaler(&d->l, "pointeur", n);
}
void __ubsan_handle_type_mismatch_v1(d_acces *d, unsigned long p) { acces(d, p); }
void __ubsan_handle_type_mismatch_v1_abort(d_acces *d, unsigned long p) { acces(d, p); abort(); }
