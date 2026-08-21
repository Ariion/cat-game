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

// Mode de partie : 'story' = les TOWER_WAVE_COUNT vagues avec une vraie
// victoire au bout (l'entrée en matière), 'endless' = vagues sans fin, la
// partie ne s'arrête qu'à la perte des vies. Les deux partagent tout le
// reste ; seules la courbe de difficulté et la condition de fin diffèrent.
let towerEndless = false;
let towerBestWave = 0;
try{ towerBestWave = parseInt(localStorage.getItem('hordeDeChatsTowerBest') || '0', 10) || 0; }catch(e){}

// Le chat que le joueur incarne : il se déplace vers la destination indiquée
// au doigt, érige les tourelles en se postant sur un emplacement, et ramasse
// le butin lâché par les chiens.
let hero = {
  x: 0, z: 0,           // position courante
  tx: 0, tz: 0,         // destination visée
  moving: false,
  stunTimer: 0,         // bousculé par un chien : immobilisé
  invulnTimer: 0,       // répit après une bousculade
  buildSlot: null,      // emplacement en cours de construction
  buildTimer: 0,
  meowCooldown: 0,     // recharge du miaulement (voir triggerMeow)
  stickX: 0, stickZ: 0, // direction poussée à la manette (0 = au repos)
  visual: null,
  facing: 0
};
let towerLoot = [];     // {x, z, value, life, visual} — poissons lâchés par les chiens abattus

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
  // Répit AVANT la 1re vague. Il était de 90 ticks (1,5 s), ce qui suffisait
  // quand une tourelle se posait d'un tap ; depuis que le chat doit s'y
  // rendre à pied, ce délai ne laissait pas le temps de bâtir la moindre
  // défense et la partie commençait déjà perdue (mesuré : 2 vies perdues
  // avant la vague 2).
  towerWaveDelayTimer = 420;
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
      if(d.visual){ towerScene.remove(d.visual); disposeTowerDogVisual(d.visual); }
    });
    towerParticles.forEach(p=>{ towerScene.remove(p.mesh); p.mesh.material.dispose(); });
    towerLoot.forEach(l=>{ towerScene.remove(l.visual); disposeProceduralGroup(l.visual); });
    // les ondes de miaulement en cours ont leur propre matériau cloné
    meowRings.forEach(r=>{ towerScene.remove(r.mesh); r.mesh.material.dispose(); });
    meowRings = [];
    applyTowerAmbianceInstant(0); // repart du plein jour, sans fondu
    setTowerBannerCount(0);
    resetHero();
  }
  towerTurrets = [];
  towerDogs = [];
  towerParticles = [];
  towerLoot = [];
  towerSlots.forEach(s=>{ s.occupied = false; if(s.marker) s.marker.visible = true; });

  document.getElementById('screenPause').classList.add('hidden');
  document.getElementById('screenTowerWin').classList.add('hidden');
  document.getElementById('screenTowerLose').classList.add('hidden');
  document.getElementById('towerHud').classList.remove('hidden');
  document.getElementById('battleHud').classList.add('hidden');
  document.getElementById('pauseBtnTower').classList.remove('hidden');
  document.getElementById('hint').classList.add('hidden'); // l'indice "glisse..." est spécifique au mode Bataille
  document.getElementById('meowBtn').classList.remove('hidden');
  updateMeowButton();
  updateTowerHud();
}

// Le chat joueur démarre devant la maison, à l'abri : c'est de là qu'il part
// chercher le butin, et c'est le point le plus éloigné de l'entrée des chiens.
function resetHero(){
  const last = TOWER_PATH[TOWER_PATH.length-1];
  hero.x = last.x + 0.4; hero.z = last.z + 1.5;
  hero.tx = hero.x; hero.tz = hero.z;
  hero.moving = false;
  hero.stunTimer = 0;
  hero.invulnTimer = 0;
  hero.buildSlot = null;
  hero.buildTimer = 0;
  hero.meowCooldown = 0;
  hero.stickX = 0; hero.stickZ = 0;
  hero.facing = 0;
  if(!hero.visual){
    hero.visual = buildHeroCat();
    towerScene.add(hero.visual);
  }
  hero.visual.visible = true;
  hero.visual.position.set(hero.x, 0, hero.z);
  setHeroBuildProgress(0);
}

function startTowerGame(endless){
  initAudio();
  gameMode = 'tower';
  towerEndless = !!endless;
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
  if(waveEl){
    waveEl.textContent = towerEndless
      ? t('tower_wave_endless', { n: Math.max(1, towerWave) })
      : t('tower_wave_label', { n: Math.max(1, towerWave), max: TOWER_WAVE_COUNT });
  }
}

function showTowerLose(){
  towerState = 'lose';
  if(towerEndless && towerWave > towerBestWave){
    towerBestWave = towerWave;
    try{ localStorage.setItem('hordeDeChatsTowerBest', String(towerBestWave)); }catch(e){}
  }
  document.getElementById('towerLoseText').textContent = towerEndless
    ? t('tower_lose_endless', { n: towerWave, best: towerBestWave })
    : t('tower_lose_stats', { n: towerWave, max: TOWER_WAVE_COUNT });
  document.getElementById('screenTowerLose').classList.remove('hidden');
  document.getElementById('pauseBtnTower').classList.add('hidden');
  document.getElementById('meowBtn').classList.add('hidden');
  // sinon le chat du joueur reste planté au milieu du plateau, visible sous
  // l'écran de défaite — le moment doit être net
  if(hero.visual) hero.visual.visible = false;
  sfx.lose();
  vibrate([25,15,25,15,25]);
}

function showTowerWin(){
  towerState = 'win';
  document.getElementById('screenTowerWin').classList.remove('hidden');
  document.getElementById('pauseBtnTower').classList.add('hidden');
  document.getElementById('meowBtn').classList.add('hidden');
  sfx.win();
  vibrate(60);
}

function pauseTower(){
  if(towerState !== 'playing' || towerPaused) return;
  towerPaused = true;
  document.getElementById('pauseStats').textContent = towerEndless
    ? t('tower_pause_endless', { n: Math.max(1, towerWave), fish })
    : t('tower_pause_stats', { n: Math.max(1, towerWave), max: TOWER_WAVE_COUNT, fish });
  document.getElementById('screenPause').classList.remove('hidden');
}

function resumeTower(){
  towerPaused = false;
  document.getElementById('screenPause').classList.add('hidden');
}
