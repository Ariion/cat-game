---
name: cadrage-portrait
description: Régler une caméra 3D et placer des éléments de jeu sur un écran de téléphone en portrait (400x760). À utiliser AVANT de poser un décor, une zone jouable, un bâtiment ou une rangée de boutons dans une scène Three.js — et à chaque fois qu'un élément "sort de l'écran", "est coupé", "déborde" ou "n'est pas visible".
---

# Cadrage en portrait

Un écran de téléphone en portrait a **beaucoup de hauteur et très peu de
largeur** (400x760, rapport 0,53). Presque toutes les erreurs de placement de
ce projet viennent d'avoir raisonné en largeur.

## La règle qui résume tout

> **La profondeur est l'axe qui a de la place. La largeur n'en a pas.**

Un terrain de jeu s'étale en Z, pas en X. Mesuré sur ce projet : à la distance
de caméra habituelle, on dispose d'environ **9 unités de large** contre **13 en
profondeur** — et la profondeur peut s'allonger en reculant la caméra sans que
les objets rétrécissent autant, parce que la plongée les comprime déjà.

Conséquences concrètes, toutes vérifiées à la mesure :
- Une rangée de 4 dalles espacées de 1,6 **ne rentre pas** (bords mesurés à
  ±1,22 pour un cadre qui s'arrête à 1,0).
- Une chaîne de production étalée en largeur oblige à reculer la caméra au
  point que le personnage devient un point.
- Répartir les mêmes éléments EN PROFONDEUR les fait tous rentrer, et dit en
  prime à quoi ils servent (chaque chose près de son poste).

## Mesurer, jamais estimer

Ne place jamais quelque chose « à l'œil » puis vérifie en capture. Projette
les points extrêmes dans le repère écran et compare à un seuil.

```js
// dans page.evaluate() — voir la skill `banc-de-mesure`
const P = (x, y, z) => {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return [+v.x.toFixed(2), +v.y.toFixed(2)];
};
```

Seuils utilisés ici : **|x| ≤ 0,90** et **|y| ≤ 0,92**. Au-delà de 0,9 on est
dans la marge que mangent le cadre arrondi et les commandes.

Points à projeter systématiquement : les quatre coins du terrain jouable, le
bord extérieur de chaque zone interactive, le sommet des bâtiments hauts, et
les objets mobiles à leur position extrême.

## Le piège qui a coûté trois mesures fausses

`Vector3.project(camera)` utilise `camera.matrixWorldInverse`, qui n'est mis à
jour que **pendant un rendu**. Si la scène n'a jamais été rendue, la matrice
est l'identité et **toutes les projections sont fausses** — sans erreur, juste
des chiffres absurdes (ici : des y à −2,7 pour des objets bien visibles).

Avant toute mesure sur une caméra vivante :

```js
gameMode = 'monMode'; startMonJeu(); renderMonMode();  // au moins un rendu
// ou, sur une caméra temporaire :
cam.updateMatrixWorld(true);
cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
```

## Balayer, ne pas tâtonner

Quand un cadrage ne va pas, teste **plusieurs caméras ET plusieurs
implantations d'un coup** dans une seule exécution, et affiche pour chacune la
liste des problèmes. Trois allers-retours de tâtonnement coûtent plus cher
qu'un balayage de neuf combinaisons.

## Deux collisions qui ne se voient pas dans une projection

1. **L'occlusion.** Un élément peut être dans le cadre et invisible quand même,
   caché derrière un bâtiment plus proche. La dalle d'embauche de la Scierie —
   la plus importante du mode — était parfaitement dans le cadre et totalement
   masquée par le toit de l'atelier. Seule une capture le révèle.
2. **Les commandes.** Le joystick et les boutons occupent le bas de l'écran.
   Les camions garés au quai étaient dans le cadre 3D et passaient derrière le
   joystick. Toujours vérifier la superposition avec les éléments d'interface.

## Remplir la hauteur qui reste

En portrait, un jeu qui se lit en largeur laisse une bande de ciel vide en
haut — mesuré à un quart de l'écran. Plutôt que de bouger la caméra (ce qui
dérègle tout le reste), **remplir** : une ligne d'horizon boisée à deux plans,
posée exactement sur le bord du terrain. Placée plus loin, son socle apparaît
sous l'horizon comme une bande flottante détachée du sol.
