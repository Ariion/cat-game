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
  document.getElementById('screenOptions').classList.add('hidden');
  document.getElementById('screenLeaderboard').classList.add('hidden');
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
    ? t('boss_hp_label', {hp: Math.max(0, boss.hp), max: boss.maxHp})
    : t('palier_label', {n: currentPalier()}) + ' · ' + formatTime(runTime);
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
  if(bestHorde > 0) parts.push(`${bestHorde} ${catWord(bestHorde)}`);
  if(bestTime > 0) parts.push(formatTime(bestTime));
  const text = parts.length ? `${t('record_prefix')} : ${parts.join(' · ')}` : '';
  ['bestScoreStart','bestScoreLose'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.textContent = text;
  });
}

// Palier/toast, sauvegarde locale, classement local et navigation menu ----

let toastTimer = null;
function showToast(msg){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  // forcer un reflow pour que la transition d'opacité rejoue à chaque appel
  void el.offsetWidth;
  el.classList.add('show');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.classList.remove('show'); }, 1800);
}

function openOptions(){
  document.getElementById('screenStart').classList.add('hidden');
  document.getElementById('screenOptions').classList.remove('hidden');
}
function closeOptions(){
  document.getElementById('screenOptions').classList.add('hidden');
  document.getElementById('screenStart').classList.remove('hidden');
}

function openLeaderboard(){
  renderLeaderboard();
  document.getElementById('screenStart').classList.add('hidden');
  document.getElementById('screenLeaderboard').classList.remove('hidden');
}
function closeLeaderboard(){
  document.getElementById('screenLeaderboard').classList.add('hidden');
  document.getElementById('screenStart').classList.remove('hidden');
}

// Classement LOCAL à cet appareil (localStorage) — un vrai classement
// mondial demanderait un serveur/une base de données, qu'une page statique
// ne peut pas fournir toute seule. Top 10 des parties, triées par temps
// de survie (le score principal du jeu infini).
function getLeaderboard(){
  try{
    const raw = localStorage.getItem('hordeDeChatsLeaderboard');
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  }catch(e){ return []; }
}

function recordLeaderboardEntry(){
  const list = getLeaderboard();
  list.push({ horde: hordeCount, time: runTime, bosses: bossesDefeated });
  list.sort((a,b)=> b.time - a.time);
  const top = list.slice(0, 10);
  try{ localStorage.setItem('hordeDeChatsLeaderboard', JSON.stringify(top)); }catch(e){}
}

function renderLeaderboard(){
  const container = document.getElementById('leaderboardList');
  if(!container) return;
  const list = getLeaderboard();
  container.innerHTML = '';
  if(list.length === 0){
    const p = document.createElement('p');
    p.className = 'leaderboard-empty';
    p.textContent = t('leaderboard_empty');
    container.appendChild(p);
    return;
  }
  list.forEach((entry, i)=>{
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    const rank = document.createElement('span');
    rank.className = 'lb-rank';
    rank.textContent = '#' + (i+1);
    const stats = document.createElement('span');
    stats.className = 'lb-stats';
    stats.textContent = `${formatTime(entry.time)} · ${entry.horde} ${catWord(entry.horde)} · ${entry.bosses} ${bossWord(entry.bosses)}`;
    row.appendChild(rank);
    row.appendChild(stats);
    container.appendChild(row);
  });
}

// Sauvegarde : un seul emplacement, façon "checkpoint" (pas une sérialisation
// complète du champ de bataille — pickups/ennemis/projectiles en vol ne sont
// pas conservés). Reprendre relance une partie fraîche avec la progression
// (horde, vie, temps, bosses vaincus) restaurée. La sauvegarde n'est PAS
// effacée à la mort : elle reste jusqu'à ce que le joueur sauvegarde à nouveau.
function saveGame(){
  if(state !== 'playing') return;
  const save = { hordeCount, hp, hpMax, runTime, bossesDefeated, pickupsCleared, pickupSpeed };
  try{
    localStorage.setItem('hordeDeChatsSave', JSON.stringify(save));
    showToast(t('save_toast'));
  }catch(e){}
}

function loadGame(){
  let save = null;
  try{
    const raw = localStorage.getItem('hordeDeChatsSave');
    save = raw ? JSON.parse(raw) : null;
  }catch(e){}
  if(!save) return;
  initAudio();
  document.getElementById('screenStart').classList.add('hidden');
  document.getElementById('screenOptions').classList.add('hidden');
  document.getElementById('screenLeaderboard').classList.add('hidden');
  document.getElementById('screenLose').classList.add('hidden');
  document.getElementById('screenAd').classList.add('hidden');
  document.getElementById('pauseBtn').classList.remove('hidden');
  resetGame();
  hordeCount = save.hordeCount || 1;
  hp = save.hp !== undefined ? save.hp : hpMax;
  hpMax = save.hpMax || HP_MAX;
  runTime = save.runTime || 0;
  bossesDefeated = save.bossesDefeated || 0;
  pickupsCleared = save.pickupsCleared || 0;
  pickupSpeed = save.pickupSpeed || PICKUP_SPEED_BASE;
  rebuildHordeVisual();
  updateHud();
}

function hasSavedGame(){
  try{ return !!localStorage.getItem('hordeDeChatsSave'); }catch(e){ return false; }
}

function updateMenuResumeButton(){
  const btn = document.getElementById('menuResumeBtn');
  if(!btn) return;
  btn.classList.toggle('hidden', !hasSavedGame());
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
