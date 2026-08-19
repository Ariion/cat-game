// État global de la partie + fonctions de (re)initialisation.
let bestHorde = 0;
let bestTime = 0;
try{
  bestHorde = parseInt(localStorage.getItem('hordeDeChatsBest') || '0', 10) || 0;
  bestTime = parseFloat(localStorage.getItem('hordeDeChatsBestTime') || '0') || 0;
}catch(e){}

let state = 'start'; // start | playing | lose (jeu infini : pas d'état "win" qui termine la partie)
let hordeCount = 1;
let hp = HP_MAX;
let hpMax = HP_MAX;
let playerTargetX = 0;  // position visée (doigt/clavier), déplacement continu, pas de couloirs
let playerX = 0;        // position affichée, lissée vers playerTargetX
let pickups = [];       // bonus/malus flottants {kind, amount, x, z, resolved, visual}
let pickupsCleared = 0;
let pickupSpeed = PICKUP_SPEED_BASE;
let pickupTimer = 0;
let cats = []; // membres de la horde (suiveurs) {angle, radius, bob, size}
let particles = [];
let shakeTimer = 0;
let shakeIntensity = 0;
let frame = 0;
let runTime = 0;       // secondes survécues cette partie (score principal, jeu infini)
let invulnTimer = 0;   // brève invulnérabilité après une reprise sur pub
let paused = false;

// Combat en temps réel : ennemis réguliers (pool réutilisé) + projectiles
// tirés automatiquement par la horde + le boss (récurrent, revient tous les
// BOSS_INTERVAL_PICKUPS objets — jeu infini, il ne met jamais fin à la partie).
let enemyPool = [];       // {active, hp, maxHp, x, z, speed}
let enemySpawnTimer = 0;
let attackTimer = 0;
let attackPulse = 0;      // petite animation du meneur quand il tire
let projectiles = [];     // {mesh, damage, life}
let boss = null;          // {x, z, hp, maxHp, biteTimer} le temps de son apparition
let bossesDefeated = 0;

function resetGame(){
  state = 'playing';
  hordeCount = 1;
  hp = hpMax;
  playerTargetX = 0;
  playerX = 0;
  if(webglSupported){ pickups.forEach(p=>{ if(p.visual){ scene.remove(p.visual); disposePickupVisual(p.visual); } }); }
  pickups = [];
  pickupsCleared = 0;
  pickupSpeed = PICKUP_SPEED_BASE;
  pickupTimer = 0;
  cats = [];
  particles = [];
  shakeTimer = 0;
  shakeIntensity = 0;
  frame = 0;
  runTime = 0;
  invulnTimer = 0;
  paused = false;
  document.getElementById('screenPause').classList.add('hidden');
  enemyPool.forEach(e=>{ e.active = false; });
  enemySpawnTimer = 0;
  attackTimer = 0;
  attackPulse = 0;
  projectiles.forEach(p=>{ if(webglSupported){ scene.remove(p.mesh); p.mesh.material.dispose(); } });
  projectiles = [];
  boss = null;
  bossesDefeated = 0;
  if(webglSupported) bossGroup.visible = false;
  document.getElementById('hint').classList.remove('hidden');
  updateHud();
}

function startGame(){
  initAudio();
  document.getElementById('screenStart').classList.add('hidden');
  document.getElementById('screenLose').classList.add('hidden');
  document.getElementById('screenAd').classList.add('hidden');
  document.getElementById('pauseBtn').classList.remove('hidden');
  resetGame();
}

function formatTime(t){
  const m = Math.floor(t/60);
  const s = Math.floor(t%60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function updateHud(){
  document.getElementById('hordeCount').textContent = hordeCount;
  const hpFill = document.getElementById('hpBarFill');
  if(hpFill) hpFill.style.width = Math.max(0, Math.min(100, (hp/hpMax)*100)) + '%';
  const label = boss
    ? `Chien du quartier : ${Math.max(0, boss.hp)} / ${boss.maxHp} PV`
    : formatTime(runTime);
  document.getElementById('progressLabel').textContent = label;
  if(hordeCount > bestHorde){
    bestHorde = hordeCount;
    try{ localStorage.setItem('hordeDeChatsBest', String(bestHorde)); }catch(e){}
  }
  if(runTime > bestTime){
    bestTime = runTime;
    try{ localStorage.setItem('hordeDeChatsBestTime', String(bestTime)); }catch(e){}
  }
  updateBestScoreDisplays();
}

function updateBestScoreDisplays(){
  const parts = [];
  if(bestHorde > 0) parts.push(`${bestHorde} chats`);
  if(bestTime > 0) parts.push(formatTime(bestTime));
  const text = parts.length ? `Record : ${parts.join(' · ')}` : '';
  ['bestScoreStart','bestScoreLose'].forEach(id=>{
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
