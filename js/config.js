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

// Le décor défile (le joueur reste visuellement sur place, comme un tapis
// roulant) et change de "biome" (palette de couleurs) tous les N paliers,
// avec un fondu progressif plutôt qu'un changement brutal. Voir biomes.js
// et updateDecor()/startBiomeTransition() dans scene3d.js.
const BIOME_PALIER_SPAN = 5;         // nombre de paliers avant de changer de biome
const BIOME_TRANSITION_SECONDS = 3.5; // durée du fondu entre deux biomes

// Vitesse de défilement du décor (sol/props/herbe) — VOLONTAIREMENT
// découplée de pickupSpeed et plus lente que ENEMY_SPEED_BASE (0.045).
// Sinon le décor défile plus vite que les ennemis n'avancent, et ceux-ci
// donnent l'impression de reculer par rapport au monde qui défile autour
// d'eux — repéré : "il faut que les chiens viennent vers nous, on dirait
// qu'ils n'attaquent pas". Les ennemis doivent toujours gagner du terrain
// par rapport au décor, à n'importe quelle vitesse d'ennemi.
const DECOR_SCROLL_SPEED = 0.035;
// Les montagnes, elles, ne défilent PAS du tout — voir le commentaire dans
// updateDecor() (scene3d.js) : trop grosses pour s'approcher un tant soit
// peu sans finir par envahir l'écran, même à vitesse infime sur une longue
// partie. Elles restent un arrière-plan fixe.
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

// Power-ups temporaires : bouclier (invulnérabilité), tir en éventail (3
// projectiles), aimant (collecte les bonus sans avoir à s'aligner). Rares
// et courts — un coup de pouce ponctuel, pas un nouvel état permanent.
const POWERUP_CHANCE = 0.06;         // probabilité qu'une apparition soit un power-up plutôt qu'un bonus/malus
const POWERUP_DURATION_FRAMES = 480; // 8s à 60 ticks/s
const MULTISHOT_SPREAD_X = 0.55;     // écart latéral entre les 3 projectiles du tir en éventail
const MAGNET_TOLERANCE = 6;          // tolérance latérale pendant le power-up aimant (couvre toute la largeur)

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
const PROJECTILE_COLOR = 0xCCFF33; // citron-vert néon, hors de la palette des 4 biomes — voir spawnOneProjectile()

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
const DOG_HEIGHT_ENEMY = 0.85; // hauteur des vrais modèles 3D (mètres) — étaient trop chétifs à 0.62
const DOG_HEIGHT_BOSS = 1.3;   // idem pour le boss (était 1.05)

// Le chat meneur grandit avec la horde : petit chaton au début, chat
// bien planté une fois la horde installée. Courbe en racine carrée (montée
// rapide au début, qui se tasse) et plafonnée à LEADER_SCALE_SATURATE_AT
// pour ne jamais devenir absurde même à horde de plusieurs milliers.
const LEADER_SCALE_MIN = 0.8;
const LEADER_SCALE_MAX = 1.75;
const LEADER_SCALE_SATURATE_AT = 150;

const FOG_DENSITY_BASE = 0.026; // densité de base du brouillard, modulée par biome (voir BIOMES.gameplayMods)

// Brève invulnérabilité après CHAQUE coup encaissé (pas seulement après une
// reprise sur pub). Sans ça, plusieurs ennemis qui arrivent groupés peuvent
// infliger leurs dégâts le même instant et tuer d'un coup sans que le
// joueur ait la moindre chance de réagir — repéré en simulant une partie
// complète (8 coups en 5s au même endroit du parcours).
const HIT_INVULN_FRAMES = 26; // ~0.43s à 60 ticks/s

// ===========================================================================
// CHAPITRES — communs aux deux modes
// ===========================================================================
// Une partie infinie se découpe en chapitres. À chaque fin de chapitre : une
// respiration (récap + emplacement publicitaire), un changement de décor, et
// surtout un CRAN DE DIFFICULTÉ EN PLUS.
//
// Ce dernier point est la raison d'être du système côté Bataille : ses quatre
// leviers de difficulté (intervalle des vagues, ennemis par vague, tirs pour
// tuer, vitesse) atteignaient tous leur plafond en ~60 secondes, après quoi
// PLUS RIEN ne montait jamais — mesuré en simulation. Le mode ne se terminait
// pas, mais il rejouait la même minute à l'infini. Les plafonds deviennent
// donc fonction du chapitre au lieu d'être des constantes.
const CHAPTER_PALIERS = 10; // Bataille : paliers par chapitre (~80-100 s)
const CHAPTER_WAVES = 10;   // Chatteau Fort : vagues par chapitre

// Montée des plafonds du mode Bataille, par chapitre. ATTENTION en retouchant
// ces valeurs : le DÉBIT d'arrivée des ennemis doit rester sous le débit
// d'élimination possible, sinon les vagues s'empilent plus vite qu'on ne peut
// les vider et ça devient une avalanche imparable (voir le commentaire au-
// dessus de ENEMY_SPAWN_INTERVAL_START). Toute modification ici se vérifie en
// simulation, pas à l'oeil.
// Déchaînement de début de chapitre. Il répond à un défaut de fond mesuré :
// les PV des ennemis étant indexés sur les dégâts du joueur (pour empêcher le
// one-shot), un ennemi demande le MÊME nombre de tirs à ⚡3 qu'à ⚡56. Le
// chiffre monte, mais le joueur ne sent jamais qu'il devient plus fort.
// Franchir un chapitre lui offre donc quelques secondes où sa puissance perce
// vraiment — la récompense devient sensible au lieu d'être seulement lisible.
const SURGE_DURATION_FRAMES = 300; // 5 s — 8 s allégeaient trop la difficulté
                                   // que les chapitres venaient justement de rétablir
const SURGE_MULTIPLIER = 3;

const CHAPTER_SPAWN_INTERVAL_STEP = 9;    // vagues plus rapprochées à chaque chapitre
const CHAPTER_SPAWN_INTERVAL_FLOOR = 95;  // plancher absolu
const CHAPTER_ENEMIES_MAX_STEP = 0.4;     // + d'ennemis par vague
const CHAPTER_ENEMIES_MAX_ABS = 7;
const CHAPTER_SHOTS_CAP_STEP = 0.35;      // ennemis plus coriaces
const CHAPTER_SHOTS_CAP_ABS = 7;
const CHAPTER_ENEMY_SPEED_STEP = 0.004;
const CHAPTER_ENEMY_SPEED_ABS = 0.15;

// Mort et reprise : à la mort, le joueur choisit de recommencer à zéro ou
// de "regarder une pub" (simulée ici — nécessite un vrai SDK de pub une
// fois packagé en app, voir watchAdAndContinue() dans gameplay.js) pour
// reprendre sur place avec un peu de vie et une brève invulnérabilité.
const CONTINUE_HP_RESTORE = 55;
const CONTINUE_INVULN_FRAMES = 90;
const AD_SIMULATION_MS = 1800;

// ===========================================================================
// Mode 2 : "Chatteau Fort" (tower defense) — un second mini-jeu indépendant
// du mode Bataille ci-dessus, sélectionné depuis l'écran de menu principal.
// Voir towerState.js/towerGameplay.js/towerScene3d.js/towerRender3d.js : ces
// fichiers ne touchent JAMAIS aux variables du mode Bataille (state.js/
// gameplay.js/scene3d.js/render3d.js), seulement aux fonctions/matériaux
// vraiment communs aux deux (buildCatGroup, buildBossGroup, animateLegs,
// catMaterial/enemyMaterial, sfx...).
// ===========================================================================

// Chemin sinueux fixe (points de passage en X/Z), de l'entrée à la gamelle
// (dernier point). Les emplacements de tourelles sont dérivés de ce chemin
// (un par segment, alterné à gauche/droite) — voir computeTowerSlotPositions()
// dans towerScene3d.js : si on retouche le chemin, les emplacements suivent
// automatiquement, jamais besoin de recaler des coordonnées à la main.
const TOWER_PATH = [
  { x: -3.2, z: -12 },
  { x: -3.2, z: -7.5 },
  { x:  2.8, z: -7.5 },
  { x:  2.8, z: -3.0 },
  { x: -2.8, z: -3.0 },
  { x: -2.8, z:  1.5 },
  { x:  1.1, z:  1.5 }  // gamelle, aux portes du chatteau (objectif à protéger)
];
const TOWER_SLOT_OFFSET = 1.15; // distance perpendiculaire au chemin pour chaque emplacement

const TOWER_LIVES_START = 3;
const TOWER_FISH_START = 80; // de quoi bâtir deux tourelles avant la 1re vague
const TOWER_TURRET_COST_BASE = 30;
const TOWER_TURRET_COST_INCREMENT = 14; // chaque tourelle posée coûte plus cher que la précédente
const TOWER_FISH_PER_KILL = 6; // (le butin tombe au sol, voir LOOT_VALUE)

const TOWER_WAVE_COUNT = 5;
const TOWER_DOGS_PER_WAVE = 6;
// Croissance des PV volontairement FORTE d'une vague à l'autre : avec une
// progression douce, les chiens mouraient tous devant la toute première
// tourelle du parcours et les 5 suivantes ne tiraient quasiment jamais
// (mesuré : 28 éliminations pour la 1re tourelle contre 2 pour les autres
// réunies) — donc une seule tourelle montait en grade et la défense en
// profondeur ne servait à rien. Des chiens qui encaissent assez pour
// traverser plusieurs zones de tir redonnent un rôle à chaque emplacement.
const TOWER_WAVE_HP_GROWTH = 1.55;    // multiplicateur de PV par vague (vague N -> N+1)
const TOWER_WAVE_SPEED_GROWTH = 1.12; // multiplicateur de vitesse par vague
const TOWER_DOG_SPAWN_INTERVAL_FRAMES = 45; // délai entre 2 chiens d'une même vague
const TOWER_WAVE_DELAY_FRAMES = 150;        // pause avant le lancement de la vague suivante

const TOWER_DOG_HP_BASE = 40;
const TOWER_DOG_SPEED_BASE = 0.028;

// Le siège s'assombrit vague après vague : on part d'un plein jour paisible
// pour finir au crépuscule rouge, la lumière rasant de plus en plus bas.
// Purement atmosphérique (aucun effet sur le gameplay), mais c'est ce qui
// fait monter la tension — une partie ne doit pas se jouer sous le même
// ciel du début à la fin. Un fondu progressif relie chaque palier au
// suivant (voir startTowerAmbianceTransition() dans towerScene3d.js), même
// principe que les biomes du mode Bataille.
// Un palier par vague (index 0 = avant la vague 1).
const TOWER_AMBIANCE = [
  { skySteps:[0x8FC7E8, 0xB6DCF0, 0xDCEEF5, 0xF2F0DE], fog:0xD6E8DC, ground:0x8FBA72, sun:0xFFF0CC, sunInt:0.75, hemiInt:0.8,  bloomS:0.30, bloomT:0.97,  sunPos:[5, 12, 7] },
  { skySteps:[0x7FBCE4, 0xAED4EC, 0xDCE9EE, 0xF4EBD2], fog:0xD2E2D6, ground:0x8CB570, sun:0xFFE9BC, sunInt:0.78, hemiInt:0.78, bloomS:0.35, bloomT:0.95, sunPos:[5, 11, 7] },
  { skySteps:[0x77A8D2, 0xB8C9DE, 0xE8D8C0, 0xF6D9A8], fog:0xDCD2BE, ground:0x86A96A, sun:0xFFDCA0, sunInt:0.82, hemiInt:0.72, bloomS:0.42, bloomT:0.92, sunPos:[6, 8.5, 6] },
  { skySteps:[0x5F7FB0, 0xA88EA8, 0xE0A882, 0xF6C081], fog:0xD8B79A, ground:0x7C9A62, sun:0xFFC078, sunInt:0.88, hemiInt:0.62, bloomS:0.52, bloomT:0.87, sunPos:[7, 6, 5] },
  { skySteps:[0x40538C, 0x8A6A93, 0xD3806A, 0xF0A263], fog:0xC49578, ground:0x6E8A58, sun:0xFFA55C, sunInt:0.95, hemiInt:0.54, bloomS:0.62, bloomT:0.81, sunPos:[7.5, 4.5, 4] },
  { skySteps:[0x2C3A66, 0x6B4C7E, 0xB85C55, 0xE07A4A], fog:0xA87A62, ground:0x5E784C, sun:0xFF8A44, sunInt:1.0,  hemiInt:0.48, bloomS:0.72, bloomT:0.75, sunPos:[8, 3.5, 3] }
];
const TOWER_AMBIANCE_TRANSITION_SECONDS = 2.5;

// Une seule tourelle ne couvre qu'UN segment du chemin (voir
// computeTowerSlotPositions() dans towerScene3d.js) — un chien qui la
// traverse sans mourir continue tranquillement jusqu'à la gamelle sur les
// segments suivants, non défendus, quel que soit le nombre de PV qu'il lui
// reste. Avec seulement 50 poissons de départ (une seule tourelle
// abordable au tout début, voir TOWER_FISH_START), il faut que CETTE
// tourelle isolée puisse à elle seule achever la plupart des chiens de la
// vague 1 pendant leur court passage dans sa portée — sinon la partie est
// perdue dès la vague 1 quoi que fasse le joueur (vérifié par simulation :
// à 40 ticks/tir et 18 dégâts, une tourelle isolée n'abattait que 2-3 chiens
// sur 6 avant qu'ils ne sortent de portée). Cadence et dégâts remontés en
// conséquence.

// Les tourelles MONTENT EN GRADE avec leurs éliminations : un chat qui a
// fait ses preuves devient visiblement plus imposant (plus gros, casque puis
// couronne, aura colorée) ET plus efficace. C'est la deuxième couche de
// progression du mode, en plus de la montée en puissance du décor par vague
// (voir TOWER_AMBIANCE) — le joueur voit sa défense grandir au lieu de
// juste empiler des tourelles identiques.
// killsNeeded = cumul d'éliminations de CETTE tourelle pour atteindre le rang.
// Échelles volontairement généreuses : vue de la caméra en plongée, un chat
// à l'échelle 1 n'était qu'une petite tache orange indistincte au milieu du
// décor. Il faut qu'on reconnaisse un chat en faction, et qu'on VOIE la
// différence entre un rang I et un rang III d'un coup d'œil.
// --- chat jouable + butin ------------------------------------------------
// Le joueur incarne un chat qui se déplace librement sur la carte : c'est LUI
// qui érige les tourelles (en se postant sur un emplacement) et qui encaisse
// le butin lâché par les chiens abattus. Le tap ne pose donc plus rien
// directement, il indique où le chat doit aller.
const HERO_SPEED = 0.075;          // vitesse de déplacement (unités/tick)
const HERO_ARRIVE_RADIUS = 0.12;   // distance en deçà de laquelle la destination est atteinte
const HERO_PICKUP_RADIUS = 0.62;   // rayon de ramassage du butin
const HERO_BUILD_RADIUS = 0.55;    // il faut être au moins aussi proche d'un emplacement pour le bâtir
const HERO_BUILD_FRAMES = 36;      // ~0.6 s posté sur l'emplacement avant que la tourelle sorte de terre
// Un chien qui percute le chat le bouscule : étourdi un court instant et il
// lâche une partie de ses poissons. Ça ne coûte JAMAIS de vie — les vies
// restent adossées à la gamelle — mais ça rend risqué d'aller chercher du
// butin au ras du chemin.
const HERO_STUN_FRAMES = 60;
const HERO_HIT_RADIUS = 0.55;
const HERO_STUN_FISH_LOSS = 0.25;  // fraction des poissons lâchée au sol
const HERO_INVULN_FRAMES = 90;     // répit après une bousculade, sinon la meute enchaîne

const LOOT_LIFETIME_FRAMES = 600;  // ~10 s avant qu'un poisson au sol disparaisse
const LOOT_BLINK_FRAMES = 150;     // il clignote sur la fin, pour prévenir
const LOOT_VALUE = 6;              // valeur d'un poisson ramassé à la vague 1
// Le butin GRANDIT avec les vagues. Sans ça le revenu reste plat alors que
// les PV des chiens et le prix des améliorations, eux, montent : le joueur
// finit par ne plus rien pouvoir acheter et bute sur un mur purement
// économique (mesuré : effondrement net vers la vague 13, tourelles bloquées
// au grade II faute de poissons).
const LOOT_VALUE_PER_WAVE = 0.16;  // +16 % de la valeur de base par vague

// --- pouvoir du chat joueur : le miaulement --------------------------------
// Sans lui, le joueur est SPECTATEUR au moment le plus tendu : quand une vague
// passe, il ne peut que regarder ses tourelles tirer. Le miaulement lui donne
// enfin une prise sur l'issue — il ralentit les chiens autour de lui, donc il
// faut aller se mettre en danger au bon endroit pour que ça serve.
const MEOW_RADIUS = 3.2;
const MEOW_SLOW_FACTOR = 0.35;   // les chiens touchés avancent à 35 % de leur vitesse
const MEOW_DURATION_FRAMES = 180; // 3 s de ralentissement
const MEOW_COOLDOWN_FRAMES = 720; // 12 s de recharge

// --- manette virtuelle (Chatteau Fort) ------------------------------------
// Le déplacement se faisait en TAPANT la destination : il fallait viser, et
// atteindre une tourelle précise pour l'améliorer relevait de l'adresse plus
// que de la stratégie. Un joystick flottant rend le contrôle direct — on
// pose le pouce n'importe où et on pousse dans la direction voulue.
const STICK_RADIUS_PX = 58;   // amplitude au-delà de laquelle on va à pleine vitesse
const STICK_DEADZONE_PX = 7;  // en deçà, on considère que le doigt ne bouge pas

// La caméra suit doucement le chat au lieu d'être rivée au plateau. Volontai-
// rement PARTIELLE (un quart du déplacement) : centrer le chat ferait perdre
// la vue d'ensemble du chemin, qui est ce qu'on doit lire dans un tower defense.
const TOWER_CAM_FOLLOW = 0.25;
const TOWER_CAM_LERP = 0.06;

// --- types de chiens ------------------------------------------------------
// Faire monter les points de vie ne suffit pas : sans variété, la vague 25 se
// joue exactement comme la vague 12, en plus lent à tuer. Chaque type change
// une DÉCISION (où placer, quand miauler), pas seulement un nombre.
// `from` = première vague où le type peut apparaître, `weight` = sa fréquence.
const TOWER_DOG_TYPES = [
  { id:'normal', from:1,  weight:10, hp:1,    speed:1,    scale:0.68, tint:null,     loot:1   },
  { id:'swift',  from:3,  weight:4,  hp:0.55, speed:1.75, scale:0.55, tint:0xD9C08A, loot:1.2 },
  { id:'brute',  from:5,  weight:3,  hp:2.6,  speed:0.62, scale:0.92, tint:0x7A6A5C, loot:2   }
];
// Hauteur de référence d'un chien dans ce mode, multipliée par l'échelle du
// type. Vue de haut, un chien trop grand masque le chemin qu'il longe.
const TOWER_DOG_HEIGHT = 0.95;

// Chien-boss : une vague sur cinq en infini, pour jalonner la progression.
const TOWER_BOSS_EVERY = 5;
const TOWER_BOSS_HP = 7;
const TOWER_BOSS_SPEED = 0.5;
const TOWER_BOSS_SCALE = 1.35;
const TOWER_BOSS_TINT = 0x8A5A4A;
const TOWER_BOSS_LOOT = 6;

// --- mode infini ----------------------------------------------------------
// Le mode Histoire garde ses 5 vagues et sa vraie victoire (c'est l'entrée en
// matière). Le mode Infini enchaîne les vagues sans fin, avec une difficulté
// qui monte PROGRESSIVEMENT — d'où une courbe différente de celle du mode
// Histoire : TOWER_WAVE_HP_GROWTH (1.55) est exponentiel, parfait pour tenir
// 5 vagues, mais intenable au-delà (vague 20 -> x7000 de PV). En infini les
// PV suivent donc une croissance POLYNOMIALE, qui monte franchement sans
// jamais exploser.
const ENDLESS_HP_RAMP = 0.30;      // terme linéaire avant élévation à la puissance
const ENDLESS_HP_POWER = 1.42;
const ENDLESS_SPEED_GROWTH = 1.035; // par vague, plafonné ci-dessous
const ENDLESS_SPEED_CAP = 0.075;
const ENDLESS_DOGS_BASE = 4;
const ENDLESS_DOGS_PER_WAVE = 0.45; // + N chiens par vague
const ENDLESS_DOGS_MAX = 14;
const ENDLESS_SPAWN_INTERVAL_MIN = 22; // les chiens arrivent de plus en plus serrés

// En infini, la puissance du joueur doit pouvoir monter SANS FIN elle aussi,
// sinon la courbe de difficulté finit mécaniquement par la dépasser quoi que
// fasse le joueur. Au-delà des 3 grades dessinés (TOWER_TURRET_LEVELS), les
// grades suivants sont donc extrapolés par ces pas — voir turretLevelDef().
const TURRET_LEVEL_DAMAGE_STEP = 16;
const TURRET_LEVEL_RANGE_STEP = 0.12;
const TURRET_LEVEL_RANGE_MAX = 4.2;
const TURRET_LEVEL_KILLS_STEP = 8;   // éliminations supplémentaires exigées par grade au-delà du 3e
const TURRET_FIRE_INTERVAL_MIN = 12;

// Améliorer une tourelle en se postant dessus. INDISPENSABLE en infini : les
// emplacements sont en nombre fixe (un par segment de chemin), donc une fois
// les 6 bâtis les poissons n'auraient plus AUCUN débouché et l'économie
// s'arrêterait net au bout de deux minutes, alors que la difficulté, elle,
// continue de monter. C'est le puits de dépense qui fait tenir le mode.
const TOWER_UPGRADE_COST_BASE = 35;
const TOWER_UPGRADE_COST_GROWTH = 1.45;
const HERO_UPGRADE_FRAMES = 48; // un peu plus long que bâtir : c'est un choix plus lourd

const TOWER_TURRET_LEVELS = [
  { killsNeeded: 0,  damage: 20, range: 2.6, fireInterval: 30, scale: 1.55, accent: 0xC9A063 },
  { killsNeeded: 4,  damage: 30, range: 2.9, fireInterval: 26, scale: 1.8,  accent: 0xD9D9E0 },
  { killsNeeded: 10, damage: 46, range: 3.2, fireInterval: 22, scale: 2.1,  accent: 0xE3A857 }
];

// ===========================================================================
// Mode 3 : "Chat-Scierie" (tycoon à tapis roulant)
// ===========================================================================
// Boucle : des rondins poussent dans la clairière -> le chat s'en approche et
// les débite en planches qu'il porte sur le dos (capacité limitée) -> il les
// dépose sur le tapis -> le tapis les mène à l'atelier, qui les transforme en
// pièces -> les pièces s'investissent en marchant sur des dalles.
// Aucune variable partagée avec les deux autres modes : millState.js /
// millGameplay.js / millScene3d.js / millRender3d.js, comme pour le Chatteau
// Fort.
//
// IMPLANTATION. L'écran est en PORTRAIT (400x700) : une chaîne de production
// étalée en largeur, comme dans les publicités de ce genre de jeu vues sur un
// écran large, n'y tiendrait pas — il faudrait reculer la caméra au point que
// le chat devienne un point. Les trois étapes sont donc empilées en
// PROFONDEUR (l'axe que la caméra en plongée comprime le moins) : la
// clairière au fond, le tapis au milieu, les dalles d'amélioration devant, et
// l'ensemble tient dans ~9 unités de large.
// Toutes ces coordonnées ont été RÉGLÉES À LA MESURE, pas à l'estime : on
// projette les points extrêmes (bord de la clairière, coin droit de
// l'atelier, bords des dalles) dans le repère écran de la caméra et on
// vérifie qu'ils tombent bien dans [-0.9, 0.9]. Le premier jet, posé à l'œil,
// sortait l'atelier de l'écran par la droite (mesuré à 1.07) et rognait les
// dalles des deux côtés — invisible tant qu'on ne regarde pas une capture en
// 400x760, exactement le format du téléphone.
const MILL_CHOP_ZONE = { x: -1.7, z: -5.2, r: 1.85 }; // clairière de coupe, au fond
const MILL_BELT_START_X = -1.4;   // le tapis va de gauche à droite
const MILL_BELT_END_X = 1.7;
const MILL_BELT_Z = -1.0;
const MILL_DROP_RADIUS = 1.05;    // distance au départ du tapis pour y déposer
const MILL_DROP_Z = -0.2;         // centre de la zone de dépose, devant le tapis
const MILL_WORKSHOP_X = 2.5;      // atelier, au bout du tapis

const MILL_LOG_COUNT = 5;         // rondins simultanés dans la clairière
const MILL_LOG_REGROW_FRAMES = 150;
const MILL_PLANKS_PER_LOG = 2;
const MILL_CHOP_FRAMES = 26;      // coups de hache pour débiter un rondin
const MILL_CARRY_BASE = 4;        // planches portables au départ
const MILL_DROP_INTERVAL = 7;     // cadence de dépose sur le tapis
const MILL_BELT_SPEED_BASE = 0.035;
const MILL_PLANK_VALUE_BASE = 3;  // pièces par planche livrée
const MILL_COINS_START = 0;

// Pas d'amélioration par niveau. Volontairement généreux : ce mode n'a ni
// vies ni défaite, son seul moteur est de SENTIR la chaîne accélérer, donc
// chaque achat doit se voir tout de suite.
const MILL_CARRY_STEP = 2;        // planches portables en plus par niveau
const MILL_CHOP_STEP = 2.6;       // ticks de coupe en moins par niveau
const MILL_CHOP_FRAMES_MIN = 7;
const MILL_BELT_STEP = 0.35;      // +35 % de vitesse de tapis par niveau
const MILL_VALUE_STEP = 2;        // pièces en plus par planche et par niveau

// Dalles d'investissement, façon tycoon : on marche dessus et on reste le
// temps que la jauge se remplisse. Chaque achat renchérit le suivant, sinon
// la progression n'aurait aucune courbe.
const MILL_PAD_FRAMES = 40;       // temps de maintien sur une dalle
const MILL_PAD_RADIUS = 0.58;
const MILL_PAD_COST_GROWTH = 1.75;
// Palier d'atelier : tous les N niveaux d'amélioration cumulés, la partie
// marque une coupure (récap + emplacement publicitaire), comme les paliers
// des deux autres modes infinis. Sans elle, la Scierie était le seul jeu SANS
// aucune publicité — et vendre "supprimer les pubs de la Scierie" n'aurait
// donc rien vendu du tout.
const MILL_LEVELS_PER_CHAPTER = 5;
// Chaque dalle est posée À CÔTÉ DU POSTE QU'ELLE AMÉLIORE, pas alignée dans
// un rang de menu : la hache près de la clairière, le sac près de la zone de
// dépose, l'engrenage sous le tapis, la bourse devant l'atelier. On comprend
// donc ce qu'on achète sans lire l'icône — et ça évite d'aligner quatre
// disques sur une largeur que l'écran portrait n'a pas.
const MILL_PADS = [
  { id:'chop',  x:-2.9, z:-3.6, cost:35, icon:'\uD83E\uDE93' }, // coupe plus rapide
  { id:'carry', x:-2.3, z: 1.5, cost:25, icon:'\uD83C\uDF92' }, // + capacité de portage
  { id:'belt',  x: 0.3, z: 1.5, cost:45, icon:'\u2699\uFE0F' }, // tapis plus rapide
  { id:'value', x: 2.2, z: 1.5, cost:60, icon:'\uD83D\uDCB0' }  // planches mieux payées
];

// Le chat de la scierie se distingue de celui du Chatteau Fort (gris,
// écharpe rouge) : robe crème, écharpe verte.
const MILL_HERO_FUR = 0xD9C4A3;
const MILL_HERO_SCARF = 0x5C8C4A;
const MILL_HERO_SPEED = 0.082;    // un poil plus vif : ici on fait des allers-retours en continu
const MILL_BOUNDS = { xMin:-4.2, xMax:3.5, zMin:-7.2, zMax:2.6 };

// ===========================================================================
// Mode 4 : "Palais des Chats" (choix de chemin, puissance qui enfle)
// ===========================================================================
// Le genre exact des publicités que tout le monde a vues : on avance dans un
// palais, on choisit une voie parmi trois, on ramasse des +X et des ×N pour
// gonfler sa puissance, et on décide à chaque carrefour quel chien on est de
// taille à affronter. Toute la tension tient dans un seul chiffre.
//
// Ce mode est le PREMIER à consommer des gemmes (revivre après une défaite) :
// c'est lui qui donne un sens à la boutique. Voir meta.js.
const PUZZLE_LANE_X = [-2.35, 0, 2.35];
const PUZZLE_SEG_LEN = 5.2;          // distance entre deux carrefours
const PUZZLE_SEGMENTS_PER_LEVEL = 8; // puis la porte du gardien
const PUZZLE_RUN_SPEED = 0.075;      // avance automatique : le joueur ne gère que la voie
// Vitesse latérale : mesurée, pas choisie au jugé. À 0,115 il fallait 41 ticks
// pour traverser les trois voies alors qu'un carrefour n'en dure que 69 :
// tout changement de voie tardif se terminait happé par la voie du MILIEU, en
// plein transit (toutes les morts des tests tombaient à x ≈ ±1,1, jamais sur
// une voie choisie). À 0,21 la traversée prend 22 ticks, il reste donc trois
// fois la marge nécessaire et une mort redevient toujours une décision.
const PUZZLE_LATERAL_SPEED = 0.21;
const PUZZLE_HIT_X = 0.92;           // demi-largeur de collision (voies espacées de 2,35)
const PUZZLE_HIT_Z = 0.62;
const PUZZLE_START_POWER = 5;
const PUZZLE_LIVES = 1;              // une erreur = fin de course (on peut revivre en gemmes)
const PUZZLE_REVIVE_GEMS = 5;

// Croissance attendue de la puissance. Elle sert de MÈTRE-ÉTALON pour
// dimensionner tout le reste : un chien "battable" vaut une fraction de cette
// valeur, un piège en vaut un multiple. Sans ce repère, les nombres n'auraient
// aucun rapport avec ce que le joueur a réellement pu ramasser, et le jeu
// serait soit trivial soit impossible selon la chance des tirages.
// Ces fractions ont été RESSERRÉES après mesure : à +30-55 % par butin et un
// multiplicateur tous les trois carrefours, la puissance atteignait le
// MILLIARD dès le niveau 1 (mesuré : 1 057 676 903). Les nombres doivent
// grossir — c'est tout le sel du genre — mais rester lisibles, donc on vise
// une dizaine de fois par niveau plutôt qu'une centaine.
const PUZZLE_GOLD_RATIO = [0.16, 0.28];   // +X = expected * ce facteur
const PUZZLE_FOE_EASY = [0.45, 0.80];     // chien battable
const PUZZLE_FOE_TRAP = [1.35, 2.30];     // chien qu'il faut esquiver
const PUZZLE_FOE_REWARD = 0.5;            // on ne gagne qu'une fraction de la puissance du chien abattu
// Le gardien rapportait sa puissance ENTIÈRE, ce qui doublait le compteur à
// chaque fin de niveau — à lui seul il fournissait la moitié de l'inflation
// (mesuré : ×45 par niveau, 8,7 milliards de milliards au niveau 12). Il ne
// verse plus qu'une prime.
const PUZZLE_GUARD_REWARD = 0.3;
const PUZZLE_SAFE_SEGMENTS = 2;           // pas de piège aux tout premiers carrefours du niveau 1
const PUZZLE_GUARD_RATIO = 0.92;          // gardien de fin de niveau
const PUZZLE_LEVEL_RAMP = 1.0;            // difficulté additionnelle par niveau (voir puzzleLayoutFor)

// Récompenses de fin de niveau : c'est la source de gemmes la plus régulière
// des quatre jeux, donc la plus visible dans les missions quotidiennes.
const PUZZLE_GEMS_PER_LEVEL = 2;
// L'XP ne doit JAMAIS être indexée sur la puissance : celle-ci est
// exponentielle, donc une seule bonne partie propulsait le profil au niveau
// maximum et remplissait la boutique (mesuré : 349 gemmes et niveau 200 en
// douze parties). Elle se calcule donc sur les NIVEAUX franchis, qui eux
// croissent linéairement.
const PUZZLE_XP_PER_LEVEL = 10;
