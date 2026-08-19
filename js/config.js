// Référence canvas + constantes de tuning du jeu.
// Monde 3D : X = latéral (couloir), Y = hauteur, Z = profondeur.
// Le joueur est fixe en Z=0, les bonus/malus/ennemis/boss approchent
// depuis Z négatif vers la caméra (Z positif).
const canvas = document.getElementById('game');

const PLAYER_Z = 0;
const PLAYER_X_MIN = -2.6;
const PLAYER_X_MAX = 2.6;
const PLAYER_MOVE_LERP = 0.18;  // lissage du suivi du doigt/clavier
const PLAYER_KEY_SPEED = 0.09;  // vitesse de déplacement au clavier (par tick)
const MAX_INSTANCED_CATS = 200; // capacité du buffer d'instances (perf mobile)
const BOSS_BATTLE_Z = -3;       // position où le chien s'arrête face au joueur

// Bonus/malus : ils flottent n'importe où sur la largeur du chemin (plus de
// couloirs fixes) — il faut se placer physiquement dessus pour les ramasser.
// Le montant (chats ou vie) est affiché directement sur l'icône.
const PICKUP_START_Z = -70;
const PICKUP_RESOLVE_RANGE = 1.4; // marge autour de PLAYER_Z pour déclencher la résolution
const PICKUP_REMOVE_Z = 9;        // distance après laquelle un objet franchi est retiré
const PICKUP_RADIUS = 0.85;       // tolérance latérale pour "toucher" un bonus/malus
const BOSS_INTERVAL_PICKUPS = 15; // le boss revient tous les N objets — jeu infini, pas de fin sur victoire
const PICKUP_SPEED_BASE = 0.16;
const PICKUP_SPEED_PER_ITEM = 0.009;
const PICKUP_SPEED_MAX = 0.32;
const PICKUP_SPAWN_INTERVAL_FRAMES = 95; // entre 2 apparitions (simples ou en dilemme)
const DILEMMA_CHANCE = 0.32; // probabilité qu'une apparition soit un choix à 2 objets

const CROQUETTE_BASE = 2;
const CROQUETTE_RATIO = 0.22; // + une fraction de la horde actuelle (baissé : la horde grossissait trop vite)
const WATER_BASE = 2;
const WATER_RATIO = 0.28;
const HEART_MIN = 12;
const HEART_MAX = 26;
const PICKUP_WATER_CHANCE = 0.42; // probabilité qu'un objet soit un malus (eau)
const PICKUP_HEART_CHANCE = 0.3;  // parmi les bonus (hors eau), part de cœurs plutôt que croquettes

// Vie : deuxième ressource, séparée du nombre de chats. Le nombre de chats
// EST la puissance de combat (dégâts par tir) ; la vie est la marge
// d'erreur — elle tombe quand un ennemi atteint le joueur, à 0 c'est la mort.
const HP_MAX = 100;

// Combat en temps réel : vagues d'ennemis + tir automatique en ligne droite,
// SANS visée — le projectile part droit devant depuis la position du chat,
// c'est au joueur de s'aligner avec la cible. Les ennemis dérivent lentement
// vers le joueur (ils vous traquent), ce qui rend le tir jouable sans viser.
const MAX_ENEMIES = 14;                 // pool d'ennemis simultanés (perf, réutilisés) — remonté pour des vagues plus denses
const ENEMY_START_Z = -38;              // plus proche que les bonus : action rapprochée
const ENEMY_SPEED_BASE = 0.045;
const ENEMY_SPEED_PER_ITEM = 0.0055;    // accélère avec la progression (difficulté)
const ENEMY_DRIFT_SPEED = 0.0035;       // dérive latérale FAIBLE : il faut activement s'aligner, pas juste attendre
const ENEMY_SPAWN_INTERVAL_FRAMES = 120;
const ENEMIES_PER_WAVE_BASE = 2;
const ENEMIES_PER_WAVE_PER_ITEM = 0.45;
const ENEMIES_PER_WAVE_MAX = 8;
const ENEMY_HP_BASE = 14;
const ENEMY_HP_PER_ITEM = 3.2;
const ENEMY_HP_CAP = 220;         // beaucoup plus haut : les dégâts sont maintenant adoucis (voir ATTACK_POWER_*)
const ENEMY_SPEED_CAP = 0.11;
const ENEMY_DAMAGE_TO_PLAYER = 16; // vie perdue si un ennemi atteint le joueur
const ENEMY_TINT = 0xC9A385;

// Un seul projectile par tir. Les dégâts sont une fonction ADOUCIE (racine)
// de la taille de la horde plutôt que la taille brute — sinon une horde qui
// grossit de façon exponentielle finit par one-shot n'importe quel ennemi
// (voire le boss), ce qui rendait le jeu trivial passé les 2 premières
// minutes. Avec l'exposant <1, la horde reste puissante mais ne casse plus
// la difficulté : il faut voir attackDamage() dans gameplay.js.
const ATTACK_POWER_EXPONENT = 0.62;
const ATTACK_POWER_FACTOR = 2.1;
const ATTACK_INTERVAL_FRAMES = 22;    // cadence de tir de la horde (ralentie : chaque tir compte plus)
const PROJECTILE_SPEED = 0.7;
const PROJECTILE_HIT_RADIUS_X = 0.42; // tolérance latérale pour toucher (resserrée : viser compte vraiment)

const BOSS_HP = 220;
const BOSS_HP_GROWTH = 70;   // + par apparition (plafonné, voir BOSS_HP_GROWTH_CAP_COUNT)
const BOSS_HP_GROWTH_CAP_COUNT = 20;
const BOSS_REWARD_BASE = 8;  // bonus de horde offert à chaque boss vaincu
const BOSS_REWARD_GROWTH = 2;
const BOSS_SPEED = 0.05;
const BOSS_BITE_INTERVAL_FRAMES = 55; // le boss mord à intervalles une fois arrivé
const BOSS_BITE_DAMAGE = 14;
const BOSS_TINT = 0x8A7361;

// Mort et reprise : à la mort, le joueur choisit de recommencer à zéro ou
// de "regarder une pub" (simulée ici — nécessite un vrai SDK de pub une
// fois packagé en app, voir watchAdAndContinue() dans gameplay.js) pour
// reprendre sur place avec un peu de vie et une brève invulnérabilité.
const CONTINUE_HP_RESTORE = 55;
const CONTINUE_INVULN_FRAMES = 90;
const AD_SIMULATION_MS = 1800;
