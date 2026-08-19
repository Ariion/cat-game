// Référence canvas + constantes de tuning du jeu.
// Monde 3D : X = latéral (couloir), Y = hauteur, Z = profondeur.
// Le joueur est fixe en Z=0, les portes/le boss approchent depuis Z négatif
// vers la caméra (Z positif). C'est ici qu'on ajuste l'équilibrage.
const canvas = document.getElementById('game');

const LANES = [-1.7, 1.7];
const PLAYER_Z = 0;
const GATE_START_Z = -70;
const GATE_RESOLVE_RANGE = 1.4; // marge autour de PLAYER_Z pour déclencher la résolution
const GATE_REMOVE_Z = 9;        // distance après laquelle une porte franchie est retirée
const GATES_TO_CLEAR = 8;
const BOSS_THRESHOLD = 20;
const MAX_INSTANCED_CATS = 200; // capacité du buffer d'instances (perf mobile)
const BOSS_BATTLE_Z = -3;       // position où le chien s'arrête face au joueur

// Rythme : le temps qu'a le joueur pour repérer une porte et choisir sa voie.
// Baissé fort après premier test réel ("ça va trop vite") — le rendu headless
// utilisé pour tester ici tourne au ralenti (rendu logiciel), donc la vitesse
// réelle sur téléphone ne se ressent qu'en testant sur l'appareil.
const GATE_SPEED_BASE = 0.16;      // unités/frame au départ (~9.6 unités/s à 60 fps)
const GATE_SPEED_PER_GATE = 0.008; // accélération par porte franchie
const GATE_SPEED_MAX = 0.30;
const SPAWN_INTERVAL_FRAMES = 130; // ~2.2s entre deux portes à 60 fps

// Vie : deuxième ressource, séparée du nombre de chats. Le nombre de chats
// EST la puissance de combat (seuils des mobs/boss) ; la vie est la marge
// d'erreur — elle tombe quand un chien passe, et à 0 c'est la mort.
const HP_MAX = 100;
const GATE_HEART_CHANCE = 0.32; // probabilité que la porte "bonus" soit un cœur (vie) plutôt qu'une croquette
const HEART_GAIN = 22;

// Chiens intermédiaires : petits accrochages entre les portes, difficulté
// crescendo avant le boss final. Réutilisent le modèle du boss (juste
// une échelle et une teinte différentes) pour rester légers.
// atGate = déclenché juste après avoir franchi ce nombre de portes.
// threshold = taille de horde minimum (= puissance) pour passer sans encombre.
// damage = vie perdue en cas d'échec (le boss, lui, retire toute la vie).
const MOB_ENCOUNTERS = [
  { atGate: 3, threshold: 6,  scale: 0.68, vz: 0.20, tint: 0xC9A385, damage: 22 }, // le chiot du voisin
  { atGate: 6, threshold: 13, scale: 0.86, vz: 0.16, tint: 0xA3846B, damage: 34 }, // un chien errant
];
const BOSS_VZ = 0.11;
const ENCOUNTER_OUTCOME_FRAMES = 55; // durée de la réaction (recul/charge) avant l'écran de fin
