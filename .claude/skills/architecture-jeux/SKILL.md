---
name: architecture-jeux
description: Conventions du projet Horde de Chats — plusieurs mini-jeux 3D dans une seule page statique, sans build. À lire avant d'ajouter un mode, un écran, une traduction ou un fichier JS, et avant tout push.
---

# Architecture du projet

Page statique, aucune étape de build, Three.js r0.149 vendored. Quatre
mini-jeux dans un seul `index.html`.

## Séparation stricte des modes

Chaque jeu a **ses propres fichiers** et ne partage AUCUNE variable de partie :

| Mode | Fichiers |
|---|---|
| Bataille | `state.js` `gameplay.js` `scene3d.js` `render3d.js` |
| Chatteau Fort | `tower*.js` |
| Chat-Scierie | `mill*.js` |
| Palais des Chats | `puzzle*.js` |

Ce qui est commun, et rien d'autre :
- `modes.js` — aiguillage `update()` / `render()` / pause / menu. **Jamais de
  logique de jeu ici.**
- `meta.js` + `shop.js` — gemmes, profil, missions, skins, pubs. Reçoit des
  résultats, ne pilote jamais un mode.
- `textures.js`, `scene3d.js` — fonctions de dessin partagées.
- Un seul `WebGLRenderer`, une scène et une caméra par mode.

Une scène par mode signifie qu'un mode peut détruire la sienne sans toucher aux
autres — à condition de respecter les règles de la skill `budget-rendu` sur les
ressources partagées.

## Boucle à pas fixe

`main.js` tourne à `FIXED_STEP_MS = 1000/60`. **Toute mutation d'état va dans
`update()`, jamais dans `render()`.** Un téléphone en 120 Hz ferait sinon
tourner le jeu deux fois trop vite.

Corollaire pour les animations de décor : elles vont aussi dans `update()`,
sinon leur vitesse dépend du taux de rafraîchissement.

## Le cache — l'erreur qui coûte le plus de temps

Chaque fichier local est chargé avec `?v=N`. **Incrémenter N à CHAQUE push qui
touche `css/` ou `js/`.** Sans ça, les navigateurs mobiles servent l'ancienne
version et « rien n'a changé » — ce n'est presque jamais un problème de code.
Seul `vendor/three.min.js` ne change jamais.

## Écrans

Tous les écrans sont des `.overlay`. Deux règles apprises en corrigeant :

1. **Masquer `screenMainMenu` au démarrage de CHAQUE mode.** Le menu est un
   overlay comme les autres et reste affiché par-dessus une partie lancée
   autrement que par sa carte (bouton « Recommencer », reprise).
2. **Un écran posé sur un autre écran doit être opaque.** Deux fonds à 96 %
   l'un sur l'autre laissent tout transparaître. Ceux posés sur le JEU (pause,
   fin de niveau) gardent leur transparence, qui est voulue.

Les commandes (`joystick`, boutons de voie, miaulement) sont des enfants
directs de `#frame`, **jamais de `.hud`** : celui-ci est ancré en haut sans
hauteur propre, donc un `bottom` calculé dedans renvoie le bouton en haut.

## Traductions

Quatre langues : `fr` `en` `de` `es`. **Parité obligatoire.** Contrôle avant
push :

```bash
node -e "
const fs=require('fs');
const src=fs.readFileSync('js/i18n.js','utf8').replace(/^\/\/.*$/gm,'');
const tr=eval('('+src.match(/const translations = ([\s\S]*?\n});/)[1]+')');
const k=Object.keys(tr.fr);
['en','de','es'].forEach(l=>console.log(l, k.filter(x=>!(x in tr[l])).join(',')||'OK'));"
```

## Avant chaque push

```bash
for f in js/*.js; do node --check "$f" || echo "FAIL $f"; done
```
Puis la parité i18n, puis le banc de mesure sur les modes touchés, puis le
contrôle du cache `?v=N`.

## Assets

Amélioration progressive : le rendu procédural s'affiche **tout de suite**, le
vrai modèle GLB le remplace quand il est chargé. Jamais bloquant : si le
chargement échoue, le jeu tourne avec le procédural.

`assets/models/CREDITS.md` tient les licences. Une entrée y est encore marquée
incertaine (`cat-kitten.obj`) — à régler avant toute publication.
