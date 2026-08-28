---
name: direction-artistique
description: Rendre une scène 3D de jeu mobile lisible et vivante — sols, ombres, contraste, lisibilité des chiffres à l'écran. À utiliser quand on demande comment améliorer visuellement un jeu, quand une scène paraît plate ou en carton, ou quand un élément se perd dans le décor.
---

# Direction artistique

Sept défauts trouvés en examinant ce projet en capture, par ordre d'impact.
Ils se répètent d'une scène à l'autre.

## 1. Les sols en aplat — le plus gros

La plus grande surface de l'écran est souvent un `MeshStandardMaterial` avec
une couleur et rien d'autre. Aucune profondeur, aucune échelle, rien qui bouge
quand la caméra bouge : c'est ça qui donne l'impression de maquette en carton.

Une texture procédurale en canvas suffit — aucun fichier à charger. Trois
couches : un fond uni, un semis de taches (qui casse l'aplat), des traits
(qui donnent l'échelle).

**En LUMINANCE, pas en couleur.** three.js MULTIPLIE `material.color` par la
texture. Une texture verte sur un sol vert se multiplie par elle-même et le
motif disparaît presque entièrement. Fond gris clair, détails plus sombres :
la teinte de la scène pilote la couleur, la texture ne fournit que le relief.

Bonus gratuit : les joints d'un dallage ou d'un platelage qui défilent sont
**le meilleur repère de vitesse** qu'on puisse donner à une course.

## 2. Rien ne touche le sol

Les ombres portées du soleil sont trop douces et trop claires pour ancrer un
objet : arbres, coffres, personnages semblent flotter d'un centimètre.

Un disque en dégradé radial posé à `y = 0.02` règle ça. Ce n'est pas une ombre
calculée, c'est l'assombrissement de contact. C'est le détail le moins cher du
lot et l'un des plus efficaces.

Enfant du groupe pour les objets mobiles (il suit sans une ligne de code) ; un
seul `InstancedMesh` pour tout le décor fixe.

## 3. Le monochrome

Quand sol, montagnes, ciel, brume et particules partagent la même teinte ET la
même valeur, le personnage disparaît dans le décor. C'était le cas du biome
désert : tout en ambre.

Le correctif n'est pas de changer la teinte du personnage mais de **séparer les
valeurs du décor** : montagnes en brun-mauve désaturé (elles se détachent au
lieu de se fondre), sol descendu d'un cran, particules claires.

## 4. Trop de chiffres à l'écran

Mesuré sur une partie réelle : **24 pastilles affichées, dont 15 faisant moins
de 34 px de large** — donc illisibles. Le fond de couloir était de la bouillie.

Estomper au-delà de deux "pas de jeu", faire disparaître au troisième. Un
nombre trop loin n'informe pas, il encombre.

## 5. Un texte peut être dessiné et invisible

Les pastilles de grade des tourelles paraissaient vides. Le chiffre romain
était bien dessiné — en blanc sur un fond tan clair.

**Déduis la couleur du texte de la luminance du fond**, jamais d'un test codé
en dur sur un niveau :

```js
const lum = (r*0.299 + g*0.587 + b*0.114) / 255;
const clair = lum < 0.55;   // texte clair sur fond sombre, et inversement
```
Et ajoute un contour : il sauve tous les cas limites.

## 6. Dessiner pour l'ANGLE RÉEL de la caméra

En plongée, on ne voit que le dessus de la tête d'un personnage : museau, nez
et yeux, tous placés à l'avant, sont hors de vue. Les chats-tourelles se
lisaient comme des poires orange malgré un joli visage.

Des rayures sur le crâne et le dos ont réglé ça. Ce qui dit « chat » à cette
distance, c'est **le triangle des oreilles**, pas les détails du visage.

## 7. La bande de ciel vide

Voir la skill `cadrage-portrait` : remplir plutôt que recadrer.

---

## Une piste testée et ÉCARTÉE

Le rendu est en `LinearEncoding` sans tone mapping. Sur le papier, passer en
`sRGBEncoding` + `ACESFilmicToneMapping` devrait enrichir l'image. **Essayé
pour de vrai sur ce projet : c'est pire.** Ça désature et tue le rendu cartoon,
qui est justement ce qui sert le jeu. Le look plat et saturé est un choix, pas
un oubli — ne le "corrige" pas sans mesurer.
