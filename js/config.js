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
const PALIER_ITEMS = 5;           // un palier de progression (HUD + toast) tous les N objets ramassés
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
const MAX_ENEMIES = 14;                 // pool d'ennemis simultanés (perf, réutilisés)
const ENEMY_START_Z = -44;              // un peu plus loin qu'avant : laisse le temps de tirer avant l'impact
const ENEMY_SPEED_BASE = 0.045;
const ENEMY_SPEED_PER_ITEM = 0.0055;    // accélère avec la progression (difficulté)
const ENEMY_DRIFT_SPEED = 0.0048;       // dérive latérale vers le joueur (assez pour rester atteignable)
// La fréquence des vagues démarre lente et se resserre avec la progression
// (voir enemySpawnInterval() dans gameplay.js) — la toute première minute
// doit laisser le temps de monter en puissance avant que ça devienne dense.
// IMPORTANT : le DÉBIT d'arrivée des ennemis (nombre par vague ÷ intervalle)
// doit rester sous le débit d'élimination possible (voir shotsToKillEnemy()
// et ATTACK_INTERVAL_FRAMES) — sinon les vagues s'empilent plus vite qu'on
// ne peut les vider, et ça finit en avalanche de dégâts imparable (repéré
// via simulation : jusqu'à 8 ennemis actifs en même temps vers le palier 4-5,
// ~30 PV perdus en 1 seconde). Vu que shotsToKillEnemy() augmente avec la
// progression (dégâts fixes du joueur = shots à encaisser), le débit
// d'ennemis par vague doit lui rester MODESTE pour ne pas dépasser la
// capacité d'élimination une fois la difficulté montée.
const ENEMY_SPAWN_INTERVAL_START = 210; // ~3.5s entre vagues au tout début
const ENEMY_SPAWN_INTERVAL_MIN = 160;   // plancher une fois la difficulté montée (était 95 : trop dense)
const ENEMY_SPAWN_INTERVAL_RAMP_ITEMS = 26; // nombre d'objets ramassés pour atteindre le plancher
const ENEMIES_PER_WAVE_BASE = 1;
const ENEMIES_PER_WAVE_PER_ITEM = 0.2;  // était 0.4 : la taille des vagues montait bcp trop vite
const ENEMIES_PER_WAVE_MAX = 4;         // était 5 : trop d'ennemis simultanés pour un tir non-visé
const ENEMY_SPEED_CAP = 0.105;
const ENEMY_DAMAGE_TO_PLAYER = 10; // vie perdue si un ennemi atteint le joueur
const ENEMY_TINT = 0xC9A385;

// Un seul projectile par tir. Les dégâts sont une fonction ADOUCIE (racine)
// de la taille de la horde plutôt que la taille brute — sinon une horde qui
// grossit de façon exponentielle finit par one-shot n'importe quel ennemi.
// Voir attackDamage() dans gameplay.js.
const ATTACK_POWER_EXPONENT = 0.62;
const ATTACK_POWER_FACTOR = 2.6;
const ATTACK_INTERVAL_FRAMES = 15;    // cadence de tir de la horde (~4 tirs/s, était 18)
const PROJECTILE_SPEED = 0.7;
const PROJECTILE_HIT_RADIUS_X = 0.48; // tolérance latérale pour toucher (pas de visée auto, mais pas punitif)

// PV des ennemis/boss = un nombre de TIRS à encaisser (attackDamage() × ce
// nombre), PAS une valeur de PV fixe. Avec une valeur fixe, la horde finit
// toujours par one-shot tout une fois assez grosse (repéré : au-delà de
// 5-10 000 chats, tout meurt en un coup) — même adoucis, les dégâts finissent
// par dépasser n'importe quel plafond de PV fixe. En indexant les PV sur les
// dégâts ACTUELS du joueur, le nombre de tirs nécessaires reste stable à
// l'infini, horde de 10 ou de 500 000. Voir shotsToKillEnemy()/shotsToKillBoss()
// dans gameplay.js.
const SHOTS_TO_KILL_ENEMY_BASE = 2;
const SHOTS_TO_KILL_ENEMY_GROWTH = 0.05; // par objet ramassé (était 0.15 : le temps pour tuer un ennemi
                                          // grossissait plus vite que le débit de tir ne pouvait suivre)
const SHOTS_TO_KILL_ENEMY_CAP = 3;       // était 6

const SHOTS_TO_KILL_BOSS_BASE = 14;
const SHOTS_TO_KILL_BOSS_GROWTH = 1.5; // par boss déjà vaincu
const SHOTS_TO_KILL_BOSS_CAP = 30;

const BOSS_REWARD_BASE = 8;  // bonus de horde offert à chaque boss vaincu
const BOSS_REWARD_GROWTH = 2;
const BOSS_SPEED = 0.05;
const BOSS_BITE_INTERVAL_FRAMES = 55; // le boss mord à intervalles une fois arrivé
const BOSS_BITE_DAMAGE = 11;
const BOSS_TINT = 0x8A7361;

// Brève invulnérabilité après CHAQUE coup encaissé (pas seulement après une
// reprise sur pub). Sans ça, plusieurs ennemis qui arrivent groupés peuvent
// infliger leurs dégâts le même instant et tuer d'un coup sans que le
// joueur ait la moindre chance de réagir — repéré en simulant une partie
// complète (8 coups en 5s au même endroit du parcours).
const HIT_INVULN_FRAMES = 26; // ~0.43s à 60 ticks/s

// Mort et reprise : à la mort, le joueur choisit de recommencer à zéro ou
// de "regarder une pub" (simulée ici — nécessite un vrai SDK de pub une
// fois packagé en app, voir watchAdAndContinue() dans gameplay.js) pour
// reprendre sur place avec un peu de vie et une brève invulnérabilité.
const CONTINUE_HP_RESTORE = 55;
const CONTINUE_INVULN_FRAMES = 90;
const AD_SIMULATION_MS = 1800;
