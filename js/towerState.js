// État du mode "Chatteau Fort" (tower defense) — un second mini-jeu
// indépendant du mode Bataille (state.js), qui ne partage AUCUNE de ses
// variables. Les deux modes ne partagent que l'écran de menu (modes.js) et
// les fonctions/matériaux de dessin communs (chats, chiens — voir
// towerScene3d.js/towerGameplay.js).
let towerState = 'idle'; // idle | playing | win | lose
let fish = TOWER_FISH_START;
let towerLives = TOWER_LIVES_START;
let towerWave = 0;            // vague en cours (1-indexée une fois démarrée, 0 = pas encore commencé)
let towerWaveDogsLeft = 0;    // chiens de la vague courante pas encore résolus (morts ou arrivés à la gamelle)
let towerWaveSpawned = 0;     // combien de chiens de la vague courante ont déjà été fait apparaître
let towerWaveSpawnTimer = 0;
let towerWaveDelayTimer = 0;  // compte à rebours avant le lancement de la prochaine vague
let towerNextTurretCost = TOWER_TURRET_COST_BASE;
let towerTurrets = [];  // {x, z, range, damage, fireTimer, visual}
let towerSlots = [];    // {x, z, occupied, marker} — peuplé une seule fois par initTowerScene()
let towerDogs = [];     // {active, hp, maxHp, speed, wp, x, z, visual, hpSprite}
let towerParticles = []; // effets de tir (voir spawnTowerBurst() dans towerGameplay.js)
let towerFrame = 0;
let towerPaused = false;

// Remet à zéro l'état d'une partie de Chatteau Fort (rejouer après une
// victoire/défaite, ou premier lancement) — ne touche jamais aux
// emplacements eux-mêmes (towerSlots garde ses objets/marqueurs 3D créés une
// fois pour toutes par initTowerScene()), juste leur occupation.
function resetTowerGame(){
  towerState = 'playing';
  fish = TOWER_FISH_START;
  towerLives = TOWER_LIVES_START;
  towerWave = 0;
  towerWaveDogsLeft = 0;
  towerWaveSpawned = 0;
  towerWaveSpawnTimer = 0;
  towerWaveDelayTimer = 90; // petite pause avant la vague 1, le temps de voir le plateau
  towerNextTurretCost = TOWER_TURRET_COST_BASE;
  towerFrame = 0;
  towerPaused = false;

  if(webglSupported){
    towerTurrets.forEach(tu=>{
      towerScene.remove(tu.visual);
      disposeProceduralGroup(tu.visual);
      // l'aura est ajoutée à la SCÈNE (pas au groupe de la tourelle, pour ne
      // pas hériter de son échelle qui change à chaque grade) — il faut donc
      // la retirer séparément, sinon elle resterait affichée après un rejeu
      if(tu.aura){
        towerScene.remove(tu.aura);
        tu.aura.geometry.dispose();
        tu.aura.material.dispose();
      }
    });
    towerDogs.forEach(d=>{
      if(d.visual){ towerScene.remove(d.visual); disposeProceduralGroup(d.visual); }
    });
    towerParticles.forEach(p=>{ towerScene.remove(p.mesh); p.mesh.material.dispose(); });
    applyTowerAmbianceInstant(0); // repart du plein jour, sans fondu
    setTowerBannerCount(0);
  }
  towerTurrets = [];
  towerDogs = [];
  towerParticles = [];
  towerSlots.forEach(s=>{ s.occupied = false; if(s.marker) s.marker.visible = true; });

  document.getElementById('screenPause').classList.add('hidden');
  document.getElementById('screenTowerWin').classList.add('hidden');
  document.getElementById('screenTowerLose').classList.add('hidden');
  document.getElementById('towerHud').classList.remove('hidden');
  document.getElementById('battleHud').classList.add('hidden');
  document.getElementById('pauseBtnTower').classList.remove('hidden');
  document.getElementById('hint').classList.add('hidden'); // l'indice "glisse..." est spécifique au mode Bataille
  updateTowerHud();
}

function startTowerGame(){
  initAudio();
  gameMode = 'tower';
  document.getElementById('screenTowerStart').classList.add('hidden');
  document.getElementById('screenTowerWin').classList.add('hidden');
  document.getElementById('screenTowerLose').classList.add('hidden');
  resetTowerGame();
}

function updateTowerHud(){
  const fishEl = document.getElementById('fishCount');
  if(fishEl) fishEl.textContent = fish;
  const livesEl = document.getElementById('towerLives');
  if(livesEl) livesEl.textContent = Math.max(0, towerLives);
  const waveEl = document.getElementById('waveLabel');
  if(waveEl) waveEl.textContent = t('tower_wave_label', { n: Math.max(1, towerWave), max: TOWER_WAVE_COUNT });
}

function showTowerLose(){
  towerState = 'lose';
  document.getElementById('towerLoseText').textContent = t('tower_lose_stats', {
    n: towerWave, max: TOWER_WAVE_COUNT
  });
  document.getElementById('screenTowerLose').classList.remove('hidden');
  document.getElementById('pauseBtnTower').classList.add('hidden');
  sfx.lose();
  vibrate([25,15,25,15,25]);
}

function showTowerWin(){
  towerState = 'win';
  document.getElementById('screenTowerWin').classList.remove('hidden');
  document.getElementById('pauseBtnTower').classList.add('hidden');
  sfx.win();
  vibrate(60);
}

function pauseTower(){
  if(towerState !== 'playing' || towerPaused) return;
  towerPaused = true;
  document.getElementById('pauseStats').textContent = t('tower_pause_stats', {
    n: Math.max(1, towerWave), max: TOWER_WAVE_COUNT, fish
  });
  document.getElementById('screenPause').classList.remove('hidden');
}

function resumeTower(){
  towerPaused = false;
  document.getElementById('screenPause').classList.add('hidden');
}
