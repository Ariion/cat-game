# Crédits des modèles 3D

- `dog-husky.glb`, `dog-shiba.glb` — Quaternius, licence CC0 (domaine public,
  aucune attribution requise). https://quaternius.com
- `grass-1.glb`, `grass-2.glb`, `grass-short.glb` — Quaternius, licence CC0.

CC0 ne demande aucune attribution légalement, mais on note la source ici
par courtoisie et pour se souvenir d'où ça vient si on doit re-télécharger
ou mettre à jour ces modèles plus tard.

## Fichiers reçus mais NON intégrés

- Un modèle de chat (~24 Mo, ~500 000 triangles, non riggé, sans animation)
  — bien trop lourd pour le web mobile et inutilisable pour le chat meneur
  (pas de squelette pour l'animer). Le chat meneur reste donc le modèle
  procédural (voir buildCatGroup() dans js/scene3d.js), qui a maintenant
  des pattes animées.
- Un 2ᵉ shiba (Sketchfab, licence CC-BY-4.0 — attribution obligatoire),
  sans rig ni animation. Redondant vu qu'on a déjà 2 chiens CC0 animés ;
  pas intégré pour éviter la contrainte d'attribution pour rien.
- Deux modèles de rocher (~9 Mo chacun, essentiellement des textures
  qu'on n'utilise pas vu notre style à plat sans texture ; l'un fait aussi
  ~100 000 triangles, bien plus détaillé que notre style low-poly). Pas
  intégrés pour l'instant — voir la conversation pour la suite possible.
