// Référence canvas + constantes de tuning du jeu.
// Monde 3D : X = latéral (couloir), Y = hauteur, Z = profondeur.
// Le joueur est fixe en Z=0, les portes/ennemis/boss approchent depuis Z
// négatif vers la caméra (Z positif). C'est ici qu'on ajuste l'équilibrage.
const canvas = document.getElementById('game');

const PLAYER_Z = 0;
const PLAYER_X_MIN = -2.6;
const PLAYER_X_MAX = 2.6;
const PLAYER_MOVE_LERP = 0.18;        // lissage du suivi du doigt/clavier
const PLAYER_KEY_SPEED = 0.09;        // vitesse de déplacement au clavier (par tick)
const LANES = [-1.4, 1.4];            // centres visuels des 2 moitiés de porte (pas des positions de joueur)
const GATE_START_Z = -70;
const GATE_RESOLVE_RANGE = 1.4; // marge autour de PLAYER_Z pour déclencher la résolution
const GATE_REMOVE_Z = 9;        // distance après laquelle une porte franchie est retirée
const GATES_TO_CLEAR = 8;
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
// EST la puissance de combat (dégâts par tir) ; la vie est la marge
// d'erreur — elle tombe quand un ennemi atteint le joueur, à 0 c'est la mort.
const HP_MAX = 100;
const GATE_HEART_CHANCE = 0.32; // probabilité que la porte "bonus" soit un cœur (vie) plutôt qu'une croquette
const HEART_GAIN = 22;

// Combat en temps réel : les ennemis arrivent en vagues pendant qu'on joue
// (pas de cutscene bloquante), répartis sur toute la largeur du chemin —
// pas juste 2 couloirs. La horde tire automatiquement : CHAQUE chat tire
// individuellement (pas un seul tir à dégâts cumulés), donc les PV des
// ennemis doivent monter vite pour rester un minimum résistants.
const MAX_ENEMIES = 10;                   // pool d'ennemis simultanés (perf, réutilisés)
const ENEMY_START_Z = -38;                // plus proche que les portes : action rapprochée
const ENEMY_SPEED_BASE = 0.045;
const ENEMY_SPEED_PER_WAVE = 0.003;       // accélère avec les portes franchies
const ENEMY_SPAWN_INTERVAL_FRAMES = 170;  // ~2.8s entre deux vagues
const ENEMIES_PER_WAVE_BASE = 2;
const ENEMIES_PER_WAVE_PER_GATES = 0.3;   // +1 ennemi par vague tous les ~3-4 portes
const ENEMIES_PER_WAVE_MAX = 5;
const ENEMY_HP_BASE = 10;
const ENEMY_HP_PER_GATE = 1.6;
const ENEMY_DAMAGE_TO_PLAYER = 14;        // vie perdue si un ennemi atteint le joueur
const ENEMY_TINT = 0xC9A385;

// Un seul projectile par tir, mais ses dégâts = la taille actuelle de la
// horde (pas de tir individuel par chat : plus simple, et ça monte vite).
const ATTACK_INTERVAL_FRAMES = 16;  // cadence de tir de la horde (~3.75 tirs/s)
const ATTACK_RANGE = 34;            // portée max pour cibler un ennemi
const PROJECTILE_SPEED = 0.6;

const BOSS_HP = 140;
const BOSS_SPEED = 0.05;
const BOSS_BITE_INTERVAL_FRAMES = 70; // le boss mord à intervalles une fois arrivé
const BOSS_BITE_DAMAGE = 9;
const BOSS_TINT = 0x8A7361;
