// État global de la partie + fonctions de (re)initialisation.
let state = 'start'; // start | playing | boss | win | lose
let hordeCount = 1;
let lane = 0;
let playerX = LANES[0]; // position latérale affichée (lissée vers LANES[lane])
let gates = [];
let gatesCleared = 0;
let gateSpeed = 0.35;
let spawnTimer = 0;
let spawnInterval = 78;
let cats = []; // membres de la horde (suiveurs) {angle, radius, bob, size}
let particles = [];
let boss = null;
let frame = 0;

function resetGame(){
  state = 'playing';
  hordeCount = 1;
  lane = 0;
  playerX = LANES[0];
  gates = [];
  gatesCleared = 0;
  gateSpeed = 0.35;
  spawnTimer = 0;
  spawnInterval = 78;
  cats = [];
  particles = [];
  boss = null;
  frame = 0;
  document.getElementById('hint').classList.remove('hidden');
  updateHud();
}

function startGame(){
  document.getElementById('screenStart').classList.add('hidden');
  document.getElementById('screenWin').classList.add('hidden');
  document.getElementById('screenLose').classList.add('hidden');
  resetGame();
}

function updateHud(){
  document.getElementById('hordeCount').textContent = hordeCount;
  const shown = Math.min(gatesCleared, GATES_TO_CLEAR);
  document.getElementById('progressLabel').textContent =
    state === 'boss' ? 'Le chien approche' : `Porte ${shown} / ${GATES_TO_CLEAR}`;
}

function rebuildHordeVisual(){
  const target = Math.min(hordeCount - 1, MAX_INSTANCED_CATS); // -1 : le leader n'est pas un suiveur
  while(cats.length < target){
    cats.push({
      angle: Math.random()*Math.PI*2,
      radius: 0.35 + Math.random()*1.1,
      bob: Math.random()*10,
      size: 0.75 + Math.random()*0.5
    });
  }
  while(cats.length > target && cats.length > 0){
    cats.pop();
  }
}
