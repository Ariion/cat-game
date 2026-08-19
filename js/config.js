// Références canvas + constantes de tuning du jeu.
// C'est ici qu'on ajuste l'équilibrage (vitesse, seuils, nombre de portes...).
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const LANES = [W * 0.28, W * 0.72];
const PLAYER_Y = H - 130;
const GATE_START_Y = -60;
const GATES_TO_CLEAR = 8;
const BOSS_THRESHOLD = 20;
