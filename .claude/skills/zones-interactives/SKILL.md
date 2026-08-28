---
name: zones-interactives
description: Poser des zones au sol sur lesquelles le joueur se place pour déclencher une action (dalles d'achat, emplacements de construction, zones de dépose, quais). À utiliser dès qu'un jeu demande de "se poster sur" quelque chose, et quand une zone est inatteignable, se déclenche toute seule ou entre en conflit avec une autre.
---

# Zones interactives au sol

Une "zone" ici = un disque au sol qui agit quand le personnage s'y tient. Ce
projet en a une douzaine (dalles d'amélioration, emplacements de tourelle,
zone de dépose, quai de chargement) et **chaque famille de bug est revenue au
moins deux fois**. Ce document existe pour ne pas les revivre.

## La règle de priorité, apprise trois fois

Quand deux actions peuvent se déclencher au même endroit, **l'action
DÉLIBÉRÉE l'emporte sur l'action de passage**.

Une dalle est une chose sur laquelle on se poste exprès. Un rondin, un butin,
un ennemi sont là où l'on passe. La première version faisait l'inverse — la
coupe l'emportait sur l'achat — et rendait **inatteignable toute dalle posée à
moins de 1,72 d'un rondin**. J'ai déplacé des dalles deux fois pour contourner
ça avant de comprendre que c'était la règle qu'il fallait changer, pas la
géométrie. L'agrandissement de la clairière (qui ajoute un anneau de rondins)
aurait reproduit le problème une troisième fois.

```js
// La zone gagne — mais seulement si elle est ACTIONNABLE. Sur une dalle trop
// chère ou déjà au maximum, l'action de passage doit reprendre la main,
// sinon on se retrouve planté sans pouvoir rien faire.
function zoneActionnable(){
  const z = zoneSous(joueur);
  if(!z) return null;
  if(z.plafondAtteint) return null;
  if(monnaie < z.cout) return null;
  return z;
}
```

## Distances minimales

Note `R` le rayon de la zone et `DET = R + marge` son rayon de détection.

| Contrainte | Distance minimale |
|---|---|
| Deux zones entre elles | `DET × 2` — sinon on ne sait plus laquelle on active |
| Zone ↔ objet ramassable | `DET + rayon_de_ramassage` (voir la règle de priorité) |
| Zone ↔ bord du cadre | voir la skill `cadrage-portrait` |

Une exception est acceptable et même souhaitable : **une zone peut chevaucher
la station qu'elle améliore** si les deux systèmes sont indépendants. La dalle
"sac plus grand" posée sur la zone de dépose est un bon design — on améliore
son sac là où on s'en sert.

## Poser chaque zone près de son poste

Ne fais pas une rangée de boutons. Pose la hache près de la clairière,
l'engrenage sous le tapis, la bourse devant l'atelier. Trois bénéfices :

1. On comprend ce qu'on achète **sans lire l'icône**.
2. Ça répartit les zones en profondeur, l'axe qui a de la place en portrait.
3. Le joueur apprend la carte en jouant au lieu de mémoriser un menu.

## Vérifier par un script, pas par une capture

Écris un contrôleur qui teste TOUTES les contraintes d'un coup et liste les
violations. Il tourne en deux secondes et il attrape ce qu'une capture rate.

```js
const pb = [];
zones.forEach(z => {
  if (horsCadre(z)) pb.push(z.id + ' hors cadre');
  if (distMin(z, rondins) < 0.95 + DET) pb.push(z.id + ' sur un rondin');
  if (horsLimitesDeMarche(z)) pb.push(z.id + ' inatteignable à pied');
});
// puis chaque paire de zones entre elles
```

Un contrôleur qui renvoie « aucun problème » ne prouve pas que la zone est
VISIBLE (occlusion) ni ATTEIGNABLE (règle de priorité). Il faut les deux :
le contrôleur pour la géométrie, un test fonctionnel pour l'achat lui-même.

## Test fonctionnel minimal d'une zone

```js
const avant = etatQueLaZoneChange;
monnaie = 99999;
joueur.x = zone.x; joueur.z = zone.z;
for (let f = 0; f < FRAMES_DE_MAINTIEN + 10; f++) update();
// l'état a-t-il VRAIMENT changé ?
```

C'est ce test, et lui seul, qui a révélé que la dalle "agrandir la clairière"
ne faisait rien : elle passait le contrôleur géométrique, mais la coupe lui
volait la priorité.
