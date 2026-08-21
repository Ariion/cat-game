# Skills du projet

Les "Agent Skills" sont des paquets d'instructions que Claude Code charge à
la demande. Ils apportent de la CONNAISSANCE (règles, bonnes pratiques), pas
des fichiers 3D ni des effets tout faits : aucun d'eux ne rend le jeu plus
beau tout seul.

## Installé ici

### `three-best-practices/`
- Source : https://github.com/emalorenzo/three-agent-skills (MIT)
- Pourquoi celui-ci : c'est le seul de la liste qui corresponde à notre
  stack — Three.js **vanilla** (pas de React, pas de build step). Il couvre
  la gestion mémoire/`dispose()`, la réduction des draw calls, les textures,
  les ombres, le mobile et le post-processing.
- Réserve : il vise Three.js r0.182+, or on est vendored en **r0.149**.
  Les sections WebGPU et TSL ne s'appliquent donc PAS ici.
- Vérifié avant installation : aucun bloc shell, aucun script, aucun motif
  d'exfiltration (voir la note de sécurité plus bas). C'est de la
  documentation pure.

## Volontairement NON installés

La liste d'articles qui recense ces skills mélange des outils qui n'ont rien
à voir avec ce projet :

| Skill | Pourquoi non |
|---|---|
| Game Developer (Unity/Unreal/Godot) | on ne fait ni Unity ni Unreal ni Godot |
| R3F best practices | spécifique à React Three Fiber — pas de React ici |
| Blender procedural Python, Code Buddy Blender, DavinciDreams 3D Team | demandent Blender, qui n'est pas dans ce pipeline |
| CAD Agent | impression 3D / Docker, hors sujet |
| 3D Modeling specialist | topologie/UV/export d'assets — on ne modélise pas, on charge 2-3 modèles CC0 |
| Shader techniques | surtout HLSL/Unity ; à reconsidérer si on écrit de vrais `ShaderMaterial` GLSL |

## Sécurité (à lire avant d'en ajouter d'autres)

L'article qui recommande ces skills publie aussi sa propre étude : **36 %
des skills testés contenaient de l'injection de prompt** et 13 % des failles
critiques. Un SKILL.md est une instruction que l'agent SUIT, et un skill
peut embarquer des scripts exécutables.

Donc, avant d'installer quoi que ce soit :
1. lire le SKILL.md en entier et tous les scripts joints ;
2. se méfier des dépôts à 0-3 étoiles (plusieurs de la liste le sont) ;
3. vérifier le champ `allowed-tools` : un skill de documentation n'a aucune
   raison de demander l'accès Bash.

## Portée

Ces skills ne servent qu'aux sessions Claude Code sur ce dépôt. Ils n'ont
aucun effet sur le jeu lui-même : rien de tout ça n'est chargé par
`index.html` ni expédié aux joueurs.
