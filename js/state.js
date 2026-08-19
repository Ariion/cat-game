// État global de la partie + fonctions de (re)initialisation.
let bestHorde = 0;
try{ bestHorde = parseInt(localStorage.getItem('hordeDeChatsBest') || '0', 10) || 0; }catch(e){}

let state = 'start'; // start | playing | encounter | win | lose
let hordeCount = 1;
let hp = HP_MAX;
let hpMax = HP_MAX;
let lane = 0;
let playerX = LANES[0]; // position latérale affichée (lissée vers LANES[lane])
let gates = [];
let gatesCleared = 0;
let gateSpeed = GATE_SPEED_BASE;
let spawnTimer = 0;
let spawnInterval = SPAWN_INTERVAL_FRAMES;
let cats = []; // membres de la horde (suiveurs) {angle, radius, bob, size}
let particles = [];
let encounter = null; // le combat en cours (mob intermédiaire ou boss final)
let bossVisualScale = 1;
let shakeTimer = 0;
let shakeIntensity = 0;
let frame = 0;

function resetGame(){
  state = 'playing';
  hordeCount = 1;
  hp = hpMax;
  lane = 0;
  playerX = LANES[0];
  gates = [];
  gatesCleared = 0;
  gateSpeed = GATE_SPEED_BASE;
  spawnTimer = 0;
  spawnInterval = SPAWN_INTERVAL_FRAMES;
  cats = [];
  particles = [];
  encounter = null;
  bossVisualScale = 1;
  shakeTimer = 0;
  shakeIntensity = 0;
  frame = 0;
  document.getElementById('hint').classList.remove('hidden');
  updateHud();
}

function startGame(){
  initAudio();
  document.getElementById('screenStart').classList.add('hidden');
  document.getElementById('screenWin').classList.add('hidden');
  document.getElementById('screenLose').classList.add('hidden');
  resetGame();
}

function updateHud(){
  document.getElementById('hordeCount').textContent = hordeCount;
  const hpFill = document.getElementById('hpBarFill');
  if(hpFill) hpFill.style.width = Math.max(0, Math.min(100, (hp/hpMax)*100)) + '%';
  const shown = Math.min(gatesCleared, GATES_TO_CLEAR);
  let label = `Porte ${shown} / ${GATES_TO_CLEAR}`;
  if(state === 'encounter' && encounter){
    label = encounter.kind === 'boss' ? 'Le chien du quartier approche !' : 'Un chien surgit !';
  }
  document.getElementById('progressLabel').textContent = label;
  if(hordeCount > bestHorde){
    bestHorde = hordeCount;
    try{ localStorage.setItem('hordeDeChatsBest', String(bestHorde)); }catch(e){}
  }
  updateBestScoreDisplays();
}

function updateBestScoreDisplays(){
  const text = bestHorde > 0 ? `Record : ${bestHorde} chats` : '';
  ['bestScoreStart','bestScoreWin','bestScoreLose'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.textContent = text;
  });
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
