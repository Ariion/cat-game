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
