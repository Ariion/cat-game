---
name: design-mobile
description: Concevoir les commandes, le rythme, l'économie et la rétention d'un jeu mobile gratuit. À utiliser quand on demande comment rendre un jeu plus accrocheur, quand un mode est "compliqué", "va trop vite", "on ne fait rien", ou quand on ajoute de la monétisation, des paliers ou une boucle de gestion.
---

# Design de jeu mobile

Principes tirés des allers-retours de playtest sur ce projet. Chacun vient
d'un défaut réel corrigé, pas d'une théorie.

## Commandes

**Trois grandes cibles valent mieux qu'un curseur continu.** Le retour de
playtest exact était : « je suis obligé de viser là où je veux aller ». Sur un
couloir à trois voies, deux gros boutons ronds dans les coins bas battent le
glissement. Sur un plateau libre, un joystick **fixe et toujours visible** bat
un joystick flottant : on le trouve avec le pouce sans quitter le jeu des yeux.

Une croix directionnelle a été essayée puis retirée : elle donne quatre
directions franches mais **perd le dosage et les diagonales**. Le joystick est
revenu, mais fixe — on garde ce qui manquait (une cible qu'on trouve à
l'aveugle) sans perdre ce qui marchait.

**Griser un bouton qui ne peut rien faire.** Appuyer sans effet donne
l'impression que la commande ne répond pas.

**Coexister plutôt que remplacer.** Un joueur habitué au glissement le garde.

## Rythme

Mesure le **temps de décision**, pas la vitesse. Sur un couloir à carrefours :
1,15 s pour lire trois nombres, décider et appuyer était la première chose qui
rebutait. À 1,49 s le mode devient abordable — et on resserre ensuite avec les
niveaux (0,91 s au vingtième). *La tension revient quand le joueur est prêt.*

Quand un mode « va trop vite », demande-toi **qui** doit ralentir. Au Chatteau
Fort ce n'étaient pas les commandes du joueur mais les ennemis : on a espacé
les arrivées ET accéléré le personnage. Se sentir lent est le plus sûr moyen de
trouver un jeu compliqué.

## Boucles

**Un jeu sans contrainte n'est pas un jeu de gestion, c'est un compteur.** Tant
que tout achat était bon, il n'y avait aucun arbitrage. Donne à chaque maillon
sa file d'attente et son plafond : embaucher augmente l'ENTRÉE, seul l'atelier
augmente la SORTIE, et qui embauche sans investir sature.

**Toute saturation doit s'annoncer.** Une jauge qui passe du vert à l'orange
puis au rouge, avec un délai de grâce pour ne pas sonner l'alarme sur un pic
d'une demi-seconde. Une sanction qui tombe sans prévenir est vécue comme un bug.

**Une panne se répare toute seule.** On ne punit pas d'une erreur irréversible.

**Recettes par à-coups, charges continues.** C'est la structure qui rend un
blocage réellement coûteux au lieu d'être seulement improductif : on n'est payé
qu'au départ d'un camion, mais les salaires tombent quoi qu'il arrive.

**Le premier employé doit changer la NATURE du jeu**, pas seulement accélérer.
Sans employé, la production hors ligne est nulle : c'est ce qui donne son poids
à la première embauche.

## Ce qui fait revenir

- **La progression permanente.** Le manque le plus criant d'un jeu à parties
  courtes : mourir ne laissait rien. Des améliorations achetées en gemmes,
  gardées pour toujours, plafonnées à +12 à +50 % — assez pour que la partie
  suivante se sente différente, pas assez pour rendre le jeu facile.
- **Une collection.** Le puits de dépense sans fond. Des robes qui s'appliquent
  au personnage dans TOUS les modes : ça se voit partout.
- **Un rendez-vous quotidien.** Série de sept jours, remise à zéro si un jour
  est sauté. C'est la remise à zéro qui transforme une habitude en rendez-vous.
- **La production hors ligne.** Plafonnée (deux heures) et minorée (30 % du
  rendement réel) : de quoi avoir envie de revenir, pas de quoi préférer partir.
- **Un choix récurrent.** Le mode le plus passif du lot n'avait aucune décision.
  Trois cartes de bonus tous les cinq paliers, tirées sans remise, permanentes
  pour la partie : la fin de partie devient le produit des décisions prises.
  Exclure du tirage les cartes sans effet — un soin à pleine vie n'est pas un
  choix, c'est une case perdue.

## Monétisation honnête

Un site web statique **n'encaisse aucun paiement** : ni SDK de facturation, ni
compte marchand. Si tu affiches des lots payants, écris « achat simulé » **sur
le bouton**, pas dans une note de bas de page. Prévois une seule fonction à
remplacer le jour de l'empaquetage.

**Ne vends jamais la suppression d'une publicité qui n'existe pas.** Un mode
sans aucune pub s'est vu ajouter des paliers avant qu'on puisse vendre son
« sans pub ». Et qui a payé doit en profiter partout : un « continuer (pub) »
devient instantané.

**Un seul point de décision** pour l'affichage des pubs, consulté par tous les
modes — sinon on en oublie un.

## Équilibrer

Voir la skill `banc-de-mesure`. Deux garde-fous appris ici :

- **Ne jamais indexer une récompense sur une valeur exponentielle.** L'XP
  calculée sur la puissance (qui atteint 10^18) propulsait le profil au niveau
  maximum en douze parties. Indexe sur les niveaux franchis, qui croissent
  linéairement.
- **Un ajout ne doit pas diviser les revenus.** Le circuit logistique ajouté à
  la scierie a d'abord fait chuter la recette d'un facteur cinq. Un système
  ajoute des DÉCISIONS ; s'il ampute le rendement, c'est un réglage à rouvrir.
