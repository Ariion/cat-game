---
name: banc-de-mesure
description: Piloter le jeu sans navigateur visible pour mesurer l'équilibrage, les performances, les fuites mémoire et le cadrage. À utiliser avant d'affirmer qu'un réglage est bon, qu'un mode est gagnable, qu'une partie dure X minutes, ou qu'un changement n'a rien cassé.
---

# Banc de mesure

Ce projet n'a pas de tests unitaires : il a un **banc**. Un navigateur sans
interface pilote le jeu image par image et rend des chiffres. C'est l'outil le
plus réutilisé du projet, et la raison pour laquelle on peut dire « mesuré »
au lieu de « je pense que ».

## Montage

```bash
python3 -m http.server 8934 --directory /chemin/du/projet &
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node monbot.js
```

```js
const { chromium } = require('playwright');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 400, height: 760 } });
p.on('pageerror', e => errs.push(e.message));   // TOUJOURS : sinon une
                                                 // exception passe inaperçue
await p.goto('http://localhost:8934/index.html');
await p.waitForTimeout(2600);                    // laisse charger les modèles
```

Le serveur local est **obligatoire** : en `file://` les modèles 3D et les
textures ne se chargent pas.

## Le principe : appeler `update()` à la main

Le jeu tourne à pas fixe. On n'attend donc pas le temps réel — on appelle
`update()` autant de fois qu'on veut de ticks. **Une minute de jeu = 3600
appels, en une fraction de seconde.**

```js
await p.evaluate(() => {
  gameMode = 'mill'; startMillGame(true);
  for (let f = 0; f < 60 * 60 * 7; f++) {   // sept minutes simulées
    if (inChapterBreak) endChapterBreak();  // ne jamais rester bloqué
    update();
  }
});
```

## Écrire un bot qui modélise un JOUEUR

C'est là que se cachent les faux résultats. Un bot mal fait accuse le jeu.

- **Décide une étape à l'avance, et tiens ta décision.** Un bot qui recalcule
  sa cible à chaque tick vise le carrefour suivant avant d'avoir franchi le
  courant — donc il quitte sa voie en pleine ligne et meurt. J'ai cru pendant
  deux mesures que le jeu était injuste ; c'était le bot.
- **Apprends-lui les nouvelles règles.** Après l'ajout des barrages, le bot les
  prenait pour des gains et mourait. Le jeu allait bien.
- **Modélise un joueur RAISONNABLE**, pas un joueur parfait ni un idiot. Pour
  un jeu de gestion : « achète la chose la moins chère que je peux m'offrir en
  gardant une paie d'avance, sinon travaille ».

## Ce qu'on mesure

```js
renderer.info.render.calls        // appels de dessin — voir `budget-rendu`
renderer.info.render.triangles
renderer.info.memory.textures     // doit rester PLAT sur 15 niveaux
renderer.info.memory.geometries
```

**Fuite mémoire** : enchaîne 15 reconstructions de niveau avec un rendu entre
chaque, et affiche la série. Une série qui monte régulièrement (78 → 895) est
une fuite ; une série qui oscille autour d'une valeur est saine.

**Équilibrage** : journalise toutes les minutes (monnaie, niveaux, effectif,
goulot courant) plutôt qu'un seul chiffre final. C'est la COURBE qui dit si le
réglage est bon, pas le total.

**Isoler un composant** : quand quelque chose fuit, mesure chaque partie
séparément (pastilles seules, sol seul, chiens seuls). C'est comme ça qu'on a
trouvé les 5 textures perdues par chien alors que la scène complète en perdait
71 par niveau.

## Captures

`await p.screenshot({ path: '/tmp/x.png' })` puis relire l'image. Une capture
attrape ce qu'aucun chiffre ne dit : l'occlusion, l'échelle fausse (un camion
plus long que le tapis roulant), un texte blanc sur fond clair, un décor qui
masque le sujet.

**Toujours mesurer ET regarder.** Les deux attrapent des choses différentes.
