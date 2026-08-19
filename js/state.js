// État global de la partie + fonctions de (re)initialisation.
let bestHorde = 0;
try{ bestHorde = parseInt(localStorage.getItem('hordeDeChatsBest') || '0', 10) || 0; }catch(e){}

let state = 'start'; // start | playing | win | lose (plus de phase bloquante séparée)
let hordeCount = 1;
let hp = HP_MAX;
let hpMax = HP_MAX;
let playerTargetX = 0;  // position visée (doigt/clavier), déplacement continu, pas de couloirs
let playerX = 0;        // position affichée, lissée vers playerTargetX
let gates = [];
let gatesCleared = 0;
let gateSpeed = GATE_SPEED_BASE;
let spawnTimer = 0;
let spawnInterval = SPAWN_INTERVAL_FRAMES;
let cats = []; // membres de la horde (suiveurs) {angle, radius, bob, size}
let particles = [];
let shakeTimer = 0;
let shakeIntensity = 0;
let frame = 0;

// Combat en temps réel : ennemis réguliers (pool réutilisé) + projectiles
// tirés automatiquement par la horde + le boss (unique, en fin de parcours).
let enemyPool = [];       // {active, hp, maxHp, x, z, speed}
let enemySpawnTimer = 0;
let attackTimer = 0;
let attackPulse = 0;      // petite animation du meneur quand il tire
let projectiles = [];     // {mesh, kind:'enemy'|'boss', idx, damage, life}
let boss = null;          // {x, z, hp, maxHp, biteTimer} une fois apparu
let bossSpawned = false;

function resetGame(){
  state = 'playing';
  hordeCount = 1;
  hp = hpMax;
  playerTargetX = 0;
  playerX = 0;
  gates = [];
  gatesCleared = 0;
  gateSpeed = GATE_SPEED_BASE;
  spawnTimer = 0;
  spawnInterval = SPAWN_INTERVAL_FRAMES;
  cats = [];
  particles = [];
  shakeTimer = 0;
  shakeIntensity = 0;
  frame = 0;
  enemyPool.forEach(e=>{ e.active = false; });
  enemySpawnTimer = 0;
  attackTimer = 0;
  attackPulse = 0;
  projectiles.forEach(p=>{ if(webglSupported){ scene.remove(p.mesh); p.mesh.material.dispose(); } });
  projectiles = [];
  boss = null;
  bossSpawned = false;
  if(webglSupported) bossGroup.visible = false;
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
  const label = boss
    ? `Chien du quartier : ${Math.max(0, boss.hp)} / ${boss.maxHp} PV`
    : `Porte ${shown} / ${GATES_TO_CLEAR}`;
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
