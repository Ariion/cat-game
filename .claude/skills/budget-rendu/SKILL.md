---
name: budget-rendu
description: Tenir le budget d'appels de dessin et éviter les fuites de mémoire vidéo dans une scène Three.js sur mobile. À utiliser quand on ajoute des personnages, de la foule, du décor répété, ou quand on détruit et reconstruit une scène — et dès que le jeu rame ou que la mémoire monte.
---

# Budget de rendu

Sur mobile, ce sont les **appels de dessin** qui coûtent, pas les triangles.
Repères mesurés sur ce projet (400x760) :

| État | Appels | Verdict |
|---|---|---|
| Scène de départ | 120 – 190 | confortable |
| Partie développée | 240 – 320 | correct |
| 10 personnages détaillés | 488 | **trop** |

## Ce qui coûte vraiment

Un chat procédural détaillé = **28 maillages** (museau, nez, intérieur
d'oreilles, reflets dans les yeux, écharpe, quatre pattes en deux morceaux,
anneau de progression…). Dix employés = près de 300 appels **à eux seuls**.

Deux réponses, dans cet ordre :

**1. Un modèle simplifié pour les figurants.** Corps, tête, deux oreilles,
quatre pattes, queue : neuf maillages, la même silhouette à quarante pixels de
haut. 488 → 340 appels. Le personnage du joueur garde tout son détail : c'est
le seul qu'on regarde.

**2. `InstancedMesh` dès qu'il y a répétition.** Une partie du corps = un
`InstancedMesh`, dont on repositionne les instances chaque frame.

```js
const m = new THREE.InstancedMesh(geo, mat, MAX);
m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
m.count = nombreVisible;        // varier `count`, pas créer/détruire
m.frustumCulled = false;        // sinon une foule qui suit la caméra clignote
// ... setMatrixAt(i, m4) ...
m.instanceMatrix.needsUpdate = true;
```

Une troupe de 26 personnages ainsi construite coûte **4 appels** au lieu de
200. Le décor fixe répété (arbres, rochers, ombres de contact, balustres) se
regroupe de la même façon : les balustrades d'un couloir sont passées de 194
maillages à 1, soit 403 → 234 appels.

Pour cacher une instance sans toucher à `count` : `setMatrixAt(i, matriceZéro)`
avec `new THREE.Matrix4().makeScale(0,0,0)`.

## Les trois fuites de mémoire vidéo de ce projet

### 1. Les squelettes clonés — la plus grave

`SkeletonUtils.clone()` donne à chaque clone **son propre squelette**, et
three.js alloue paresseusement une *texture d'os* par squelette. Rien ne la
libère : retirer l'objet de la scène et libérer ses matériaux ne suffit pas.

Mesuré : **5 textures perdues par chien**, soit 50 par niveau et une fuite
sans fin dans un mode où les ennemis défilent en continu. Le compteur passait
de 78 à 895 en quinze niveaux.

```js
function disposeClonedSkeletons(root){
  root.traverse(o => { if(o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
}
```

### 2. Les matériaux jamais libérés

`disposeProceduralGroup()` ne libère que les **géométries**. Chaque objet créé
en cours de partie avec son propre matériau (une planche par livraison, des
milliers sur une longue partie) laisse donc un matériau derrière lui.

Réponse : **partager géométrie ET matériau** pour tout objet produit en série,
et ne rien libérer à sa disparition — juste `scene.remove()`.

### 3. Détruire une ressource PARTAGÉE

Le piège inverse, et le plus dangereux. Une scène reconstruite à chaque niveau
libère ce qu'elle contient. Si elle contient un objet dont la géométrie ou le
matériau est partagé avec le reste du jeu, **le premier changement de niveau
casse les quatre modes**.

```js
mesh.userData.sharedResource = true;     // à la construction
// et dans le nettoyage :
if(o.userData.sharedResource) return;    // on n'y touche pas
```

Même logique pour les modèles GLB clonés : leur géométrie et leurs textures
appartiennent à l'original. Seuls les **matériaux clonés par instance** (pour
la teinte) sont à nous.

## Comment vérifier

Voir la skill `banc-de-mesure` : enchaîner 15 reconstructions, afficher la
série de `renderer.info.memory.textures`. Plate = sain. Croissante = fuite.
Et isoler composant par composant pour trouver le coupable.
