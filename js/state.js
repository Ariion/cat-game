// État global de la partie + fonctions de (re)initialisation.
let state = 'start'; // start | playing | boss | win | lose
let hordeCount = 1;
let lane = 0;
let laneVisual = LANES[0];
let gates = [];
let gatesCleared = 0;
let gateSpeed = 2.6;
let spawnTimer = 0;
let spawnInterval = 78;
let cats = []; // membres de la horde {angle, radius, bob, size}
let particles = [];
let boss = null;
let frame = 0;

function resetGame(){
  state = 'playing';
  hordeCount = 1;
  lane = 0;
  laneVisual = LANES[0];
  gates = [];
  gatesCleared = 0;
  gateSpeed = 2.6;
  spawnTimer = 0;
  spawnInterval = 78;
  cats = [{angle:0, radius:0, bob:Math.random()*10, size:1}];
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
  const target = Math.min(hordeCount, 40);
  while(cats.length < target){
    cats.push({
      angle: Math.random()*Math.PI*2,
      radius: 14 + Math.random()*46,
      bob: Math.random()*10,
      size: 0.75 + Math.random()*0.5
    });
  }
  while(cats.length > target && cats.length > 1){
    cats.pop();
  }
}
