/* Des mots français courants, sans accent (faciles à taper sur tous les
   claviers), pour les phrases de passe. Chaque mot tiré au hasard dans
   cette liste apporte log2(taille) bits — environ 9,4 bits pour 700 mots. */

const LISTE = `abeille aigle agneau alouette araignee baleine biche bison blaireau bouc buffle caille canard castor cerf chameau chat cheval
chevre chien chouette cigale cigogne coq corbeau crabe criquet cygne dauphin dindon ecureuil elan escargot faucon fourmi gazelle girafe gorille
grenouille guepard hamster herisson hibou homard hyene jaguar koala lama lapin lezard lievre lion loup loutre lynx marmotte merle mouette mouton
moineau morse mulet ours panda paon perroquet phoque pigeon pingouin poisson poney poule puma renard requin sanglier serpent singe souris taupe
taureau tigre tortue truite vache vautour zebre abricot amande ananas arbre argile automne avoine banane basilic bambou berge bleuet bouleau
branche brindille brume buisson cactus caillou campagne canyon carotte cascade cerise champ chene citron citrouille clairiere colline corail coton
datte desert dune erable etang falaise feuille figue fleuve foret fougere fraise framboise galet glacier grotte houx iris jardin jonquille lac lagune
laurier lavande lierre lilas lune marais marron melon menthe mimosa montagne mousse muguet myrtille nuage oasis olive orage orange orchidee ortie
palmier papaye peuplier pierre pin plage plaine pluie poire pomme prairie prune radis raisin riviere rocher ronce rose roseau sable sapin saule
sauge seigle soleil source sureau thym tilleul tomate tonnerre tornade toundra tournesol tulipe vallee vent violette volcan aiguille ampoule ancre
antenne armoire assiette aviron badge bagage balai balance ballon bateau batterie bougie boussole bouteille bracelet briquet brosse bureau cabane
cadre cahier camion canape canot carafe carnet carton casque ceinture chaise chapeau chariot cheminee ciseaux clavier cloche coffre collier compas
coussin couteau crayon cuillere drapeau echelle ecran enveloppe eponge etagere eventail fauteuil fenetre filet flacon flute fourchette fusee gant
gilet gobelet gomme grille guitare hache hamac harpe horloge hublot jumelles lampe lanterne lasso levier livre loupe luge malle manteau marteau
masque micro miroir montre moteur mouchoir moulin navire panier parapluie peigne pelle piano pinceau pioche plateau plume poele pompe portail
poulie puzzle radar radio rame rateau regle robot ruban sabot sandale scie seau serrure sifflet stylo table tableau tambour tapis tasse tente
tiroir toboggan toupie trompette tuba valise vase velo verre violon voile wagon yoyo baguette beignet beurre biscuit brioche cafe caramel chocolat
confiture couscous crepe croissant fromage galette gateau gaufre glace jambon lasagne miel moutarde muffin nougat omelette pain pates pizza poivre
potage quiche raclette ravioli riz salade sandwich sauce soupe sucre tarte vanille yaourt atelier avenue balcon banque bazar cabine chalet chateau
cinema cirque citadelle couloir cuisine donjon escalier ferme gare garage grenier hangar hotel kiosque marche musee palais parc phare piscine place
pont port quai refuge salon serre stade studio temple theatre tunnel usine village ville agile ardent audace aube azur bleu blanc brave calme carre
chaud clair cosmos courage doux drole droit ecarlate eclair elegant enigme epique facile fidele fier flamme fort franc gentil geant habile haut heros
hiver immense joli jeune joyeux juste large leger libre limpide lucide magique malin meteore minuit noble noir nordique ocean paisible pastel petit
planete poli pratique prudent rapide rare rouge royal rustique sage sauvage secret serein simple solide sombre souple stable subtil tendre tenace
timide tranquille turquoise unique vaste vert vif violet zephyr accord album ballet basket boxe concert danse disque domino echecs escrime football
golf judo karate lecture marathon melodie natation opera orchestre poeme polka rallye refrain rugby rythme sonate surf tango tennis trio valse yoga
atome boson cellule comete cristal electron energie equation galaxie gravite laser lumiere aimant molecule neutron nebuleuse noyau onde orbite photon
pixel plasma prisme proton quartz quasar signal spectre vecteur aventure balade bonheur cadeau caprice carnaval chance chanson conte destin espoir
etoile festival fortune frisson legende licorne magie merveille mirage mystere odyssee oracle pirate reve sirene tresor voyage abime acrobate
alambic algue alpage ambre anneau arcade archer argent arome atlas avion balise bandeau barque bassin bastion berceau bijou bistrot bocal boulon
bouquet boxeur brasier brique bulle bureau cabestan calcul calepin camelia canal capitaine carrosse cavalier cerceau chaloupe chantier charbon
chemin chenille chimere cidre cobalt cocon comptoir copeau cordage corsaire coteau crinoline cuivre cymbale dentelle diamant domaine dragon duvet
emeraude encre epave equipage escale etoffe faisan fanfare farandole fenouil festin fiacre flocon fontaine forge fresque gadget gazon gondole goujon
granit grelot guirlande hameau harmonica hermine horizon igloo indigo jade jongleur kayak lagon lampion lanterne levain loriot lutin manege mangue
marelle marmite medaille meringue meteorite mosaique muscade nacre nectar obelisque opale origami ouragan pagaie papillon parchemin pavot pelican
pendule perle phoenix piment pistache planeur poivron porcelaine praline prisme quenouille rempart rhubarbe roulotte rubis safran saphir sardine
satin sentier silex sorbet tamis tanneur tapir tartine tenor toucan tramway trapeze tricot troubadour tulle vagabond velours verger vitrail voilier`;

export const MOTS = [...new Set(LISTE.split(/\s+/).filter((m) => /^[a-z]{3,10}$/.test(m)))];
